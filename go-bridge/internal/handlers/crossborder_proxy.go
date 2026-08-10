// Package handlers — Cross-Border Gateway Proxy
//
// Promotes the CIPS/UPI/PIX/Mojaloop handlers from local stubs to real
// reverse-proxy calls with:
//   - Exponential backoff retry (3 attempts)
//   - Circuit-breaker (5 failures → open for 30 s)
//   - Request/response logging with X-Request-ID propagation
//   - Fraud pre-screening via the Rust cross-border-fraud-engine
//   - Graceful sandbox fallback when gateway URLs are unset
//
// Environment variables consumed:
//   CIPS_GATEWAY_URL        — China CIPS gateway base URL
//   UPI_GATEWAY_URL         — India UPI gateway base URL
//   PIX_GATEWAY_URL         — Brazil PIX gateway base URL
//   MOJALOOP_URL            — Mojaloop FSPIOP adapter base URL
//   FRAUD_SCORING_URL       — Rust fraud engine base URL (optional)
//   INTERNAL_API_KEY        — Shared secret for fraud engine auth

package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"sync"
	"sync/atomic"
	"time"
)

// ─── Circuit Breaker ─────────────────────────────────────────────────────────

const (
	cbMaxFailures  = 5
	cbOpenDuration = 30 * time.Second
)

type circuitBreaker struct {
	mu        sync.Mutex
	failures  int
	openUntil time.Time
}

func (cb *circuitBreaker) allow() bool {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	if !cb.openUntil.IsZero() && time.Now().Before(cb.openUntil) {
		return false
	}
	return true
}

func (cb *circuitBreaker) recordSuccess() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures = 0
	cb.openUntil = time.Time{}
}

func (cb *circuitBreaker) recordFailure() {
	cb.mu.Lock()
	defer cb.mu.Unlock()
	cb.failures++
	if cb.failures >= cbMaxFailures {
		cb.openUntil = time.Now().Add(cbOpenDuration)
	}
}

var (
	cipsCB     = &circuitBreaker{}
	upiCB      = &circuitBreaker{}
	pixCB      = &circuitBreaker{}
	mojaloopCB = &circuitBreaker{}
)

// ─── Retry HTTP client ────────────────────────────────────────────────────────

var proxyHTTPClient = &http.Client{Timeout: 15 * time.Second}

// proxyRequest forwards the request body to targetURL, retrying up to maxRetries
// times with exponential backoff. It returns the upstream response body and
// status code, or an error if all attempts fail.
func proxyRequest(ctx context.Context, method, targetURL string, body []byte, headers map[string]string) ([]byte, int, error) {
	var lastErr error
	for attempt := 0; attempt < 3; attempt++ {
		if attempt > 0 {
			select {
			case <-ctx.Done():
				return nil, 0, ctx.Err()
			case <-time.After(time.Duration(attempt*attempt) * 200 * time.Millisecond):
			}
		}

		var bodyReader io.Reader
		if body != nil {
			bodyReader = bytes.NewReader(body)
		}
		req, err := http.NewRequestWithContext(ctx, method, targetURL, bodyReader)
		if err != nil {
			lastErr = err
			continue
		}
		req.Header.Set("Content-Type", "application/json")
		for k, v := range headers {
			req.Header.Set(k, v)
		}

		resp, err := proxyHTTPClient.Do(req)
		if err != nil {
			lastErr = err
			continue
		}
		defer resp.Body.Close()
		respBody, _ := io.ReadAll(resp.Body)
		return respBody, resp.StatusCode, nil
	}
	return nil, 0, fmt.Errorf("all retries failed: %w", lastErr)
}

// ─── Fraud pre-screening ──────────────────────────────────────────────────────

type fraudPreScreenRequest struct {
	TransferID          string `json:"transfer_id"`
	MerchantID          string `json:"merchant_id"`
	Rail                string `json:"rail"`
	SourceCurrency      string `json:"source_currency"`
	TargetCurrency      string `json:"target_currency"`
	Amount              string `json:"amount"`
	Corridor            string `json:"corridor"`
	ReceiverID          string `json:"receiver_id"`
	IsFirstTimeCorridor bool   `json:"is_first_time_corridor"`
}

type fraudPreScreenResponse struct {
	Score          float64 `json:"score"`
	RiskLevel      string  `json:"risk_level"`
	Recommendation string  `json:"recommendation"`
}

var fraudBlockedCount int64

// prescreenFraud calls the Rust fraud engine. Returns (score, recommendation, error).
// FAIL CLOSED by default: if the fraud engine is unconfigured or errors, an
// error is returned and callers must reject the money-movement request.
// FRAUD_FAIL_OPEN=true restores legacy fail-open behaviour (loud WARN).
func prescreenFraud(ctx context.Context, req fraudPreScreenRequest) (float64, string, error) {
	failClosed := func(cause error) (float64, string, error) {
		if os.Getenv("FRAUD_FAIL_OPEN") == "true" {
			slog.Warn("[fraud] engine unavailable — ALLOWING via FRAUD_FAIL_OPEN=true",
				"rail", req.Rail, "merchant", req.MerchantID, "err", cause)
			return 0, "ALLOW", nil
		}
		slog.Error("[fraud] engine unavailable — BLOCKING money movement (set FRAUD_FAIL_OPEN=true to override)",
			"rail", req.Rail, "merchant", req.MerchantID, "err", cause)
		return 0, "BLOCK", fmt.Errorf("fraud pre-screening unavailable: %w", cause)
	}
	fraudURL := os.Getenv("FRAUD_SCORING_URL")
	if fraudURL == "" {
		return failClosed(fmt.Errorf("FRAUD_SCORING_URL not configured"))
	}
	body, _ := json.Marshal(req)
	apiKey := os.Getenv("INTERNAL_API_KEY")
	respBody, status, err := proxyRequest(ctx, http.MethodPost, fraudURL+"/v1/score", body, map[string]string{
		"X-Internal-Key": apiKey,
	})
	if err != nil {
		return failClosed(err)
	}
	if status >= 500 {
		return failClosed(fmt.Errorf("fraud engine returned HTTP %d", status))
	}
	var result fraudPreScreenResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		return failClosed(fmt.Errorf("fraud engine undecodable response: %w", err))
	}
	return result.Score, result.Recommendation, nil
}

// ─── Helper: sandbox fallback response ───────────────────────────────────────

// sandboxResponse fabricates a PENDING transfer acknowledgement. It is only
// reachable when PAYGATE_SIMULATION_MODE=true (enforced at every call site);
// the payload is explicitly marked simulation:true and never claims execution.
func sandboxResponse(w http.ResponseWriter, rail, transferID, message string) {
	slog.Warn("[crossborder] SIMULATED transfer response — no money moved",
		"rail", rail, "transferId", transferID)
	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("X-Sandbox-Mode", "true")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transferId": "SIM-" + transferID,
		"status":     "SIMULATED_PENDING",
		"rail":       rail,
		"sandbox":    true,
		"simulation": true,
		"message":    message,
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
}

func cbOpenResponse(w http.ResponseWriter, rail string) {
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":      "circuit_open",
		"rail":       rail,
		"message":    "Gateway temporarily unavailable — circuit breaker open",
		"retryAfter": cbOpenDuration.Seconds(),
	})
}

func fraudBlockedResponse(w http.ResponseWriter, score float64) {
	atomic.AddInt64(&fraudBlockedCount, 1)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusForbidden)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":          "fraud_blocked",
		"score":          score,
		"message":        "Transaction blocked by fraud pre-screening",
		"recommendation": "BLOCK",
	})
}

// ─── CIPS Handlers ────────────────────────────────────────────────────────────

// ProxyCIPSTransferReal forwards a CIPS transfer request to the real CIPS gateway.
// Falls back to sandbox mode when CIPS_GATEWAY_URL is not set.
func ProxyCIPSTransferReal(w http.ResponseWriter, r *http.Request) {
	if !cipsCB.allow() {
		cbOpenResponse(w, "CIPS")
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid_body"}`, http.StatusBadRequest)
		return
	}

	// Fraud pre-screen
	score, recommendation, err := prescreenFraud(r.Context(), fraudPreScreenRequest{
		TransferID:     fmt.Sprintf("CIPS-%d", time.Now().UnixMilli()),
		MerchantID:     fmt.Sprintf("%v", body["merchantId"]),
		Rail:           "cips",
		SourceCurrency: fmt.Sprintf("%v", body["sourceCurrency"]),
		TargetCurrency: "CNY",
		Amount:         fmt.Sprintf("%v", body["amount"]),
		Corridor:       fmt.Sprintf("%v", body["corridor"]),
		ReceiverID:     fmt.Sprintf("%v", body["cnapsCode"]),
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "fraud_screening_unavailable",
			"message": "fraud pre-screening is required for cross-border money movement and is currently unavailable",
		})
		return
	}
	if recommendation == "BLOCK" {
		fraudBlockedResponse(w, score)
		return
	}

	cipsURL := os.Getenv("CIPS_GATEWAY_URL")
	if cipsURL == "" {
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			gatewayUnavailable(w, "CIPS", "CIPS_GATEWAY_URL")
			return
		}
		sandboxResponse(w, "CIPS", fmt.Sprintf("CIPS-%d", time.Now().UnixMilli()), "Simulation: CIPS_GATEWAY_URL not configured — no transfer executed")
		return
	}

	reqBody, _ := json.Marshal(body)
	reqID := r.Header.Get("X-Request-ID")
	respBody, status, err := proxyRequest(r.Context(), http.MethodPost, cipsURL+"/v1/transfers", reqBody, map[string]string{
		"X-Request-ID": reqID,
	})
	if err != nil {
		cipsCB.recordFailure()
		http.Error(w, `{"error":"gateway_error","rail":"CIPS"}`, http.StatusBadGateway)
		return
	}
	cipsCB.recordSuccess()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
}

// ─── UPI Handlers ─────────────────────────────────────────────────────────────

// ProxyUPIPayReal forwards a UPI payment request to the real UPI gateway.
func ProxyUPIPayReal(w http.ResponseWriter, r *http.Request) {
	if !upiCB.allow() {
		cbOpenResponse(w, "UPI")
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid_body"}`, http.StatusBadRequest)
		return
	}

	// Fraud pre-screen
	score, recommendation, err := prescreenFraud(r.Context(), fraudPreScreenRequest{
		TransferID:     fmt.Sprintf("UPI-%d", time.Now().UnixMilli()),
		MerchantID:     fmt.Sprintf("%v", body["merchantId"]),
		Rail:           "upi",
		SourceCurrency: fmt.Sprintf("%v", body["sourceCurrency"]),
		TargetCurrency: "INR",
		Amount:         fmt.Sprintf("%v", body["amount"]),
		Corridor:       fmt.Sprintf("%v", body["corridor"]),
		ReceiverID:     fmt.Sprintf("%v", body["vpa"]),
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "fraud_screening_unavailable",
			"message": "fraud pre-screening is required for cross-border money movement and is currently unavailable",
		})
		return
	}
	if recommendation == "BLOCK" {
		fraudBlockedResponse(w, score)
		return
	}

	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			gatewayUnavailable(w, "UPI", "UPI_GATEWAY_URL")
			return
		}
		sandboxResponse(w, "UPI", fmt.Sprintf("UPI-%d", time.Now().UnixMilli()), "Simulation: UPI_GATEWAY_URL not configured — no transfer executed")
		return
	}

	reqBody, _ := json.Marshal(body)
	reqID := r.Header.Get("X-Request-ID")
	respBody, status, err := proxyRequest(r.Context(), http.MethodPost, upiURL+"/v1/pay", reqBody, map[string]string{
		"X-Request-ID": reqID,
	})
	if err != nil {
		upiCB.recordFailure()
		http.Error(w, `{"error":"gateway_error","rail":"UPI"}`, http.StatusBadGateway)
		return
	}
	upiCB.recordSuccess()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
}

// ResolveUPIVPAReal resolves a UPI VPA against the real UPI gateway.
func ResolveUPIVPAReal(w http.ResponseWriter, r *http.Request) {
	vpa := r.URL.Query().Get("vpa")
	if vpa == "" {
		http.Error(w, `{"error":"vpa_required"}`, http.StatusBadRequest)
		return
	}

	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			gatewayUnavailable(w, "UPI", "UPI_GATEWAY_URL")
			return
		}
		// Simulation: local format check only; payee identity is NOT verified.
		valid := len(vpa) > 3 && bytes.Contains([]byte(vpa), []byte("@"))
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Sandbox-Mode", "true")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"vpa":        vpa,
			"valid":      valid,
			"name":       "SIMULATED Payee",
			"sandbox":    true,
			"simulation": true,
		})
		return
	}

	respBody, status, err := proxyRequest(r.Context(), http.MethodGet,
		fmt.Sprintf("%s/v1/vpa/resolve?vpa=%s", upiURL, vpa), nil, nil)
	if err != nil {
		http.Error(w, `{"error":"gateway_error","rail":"UPI"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
}

// ─── PIX Handlers ─────────────────────────────────────────────────────────────

// ProxyPIXPaymentReal forwards a PIX payment to the real PIX gateway.
func ProxyPIXPaymentReal(w http.ResponseWriter, r *http.Request) {
	if !pixCB.allow() {
		cbOpenResponse(w, "PIX")
		return
	}

	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid_body"}`, http.StatusBadRequest)
		return
	}

	// Fraud pre-screen
	score, recommendation, err := prescreenFraud(r.Context(), fraudPreScreenRequest{
		TransferID:     fmt.Sprintf("PIX-%d", time.Now().UnixMilli()),
		MerchantID:     fmt.Sprintf("%v", body["merchantId"]),
		Rail:           "pix",
		SourceCurrency: fmt.Sprintf("%v", body["sourceCurrency"]),
		TargetCurrency: "BRL",
		Amount:         fmt.Sprintf("%v", body["amount"]),
		Corridor:       fmt.Sprintf("%v", body["corridor"]),
		ReceiverID:     fmt.Sprintf("%v", body["pixKey"]),
	})
	if err != nil {
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "fraud_screening_unavailable",
			"message": "fraud pre-screening is required for cross-border money movement and is currently unavailable",
		})
		return
	}
	if recommendation == "BLOCK" {
		fraudBlockedResponse(w, score)
		return
	}

	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			gatewayUnavailable(w, "PIX", "PIX_GATEWAY_URL")
			return
		}
		sandboxResponse(w, "PIX", fmt.Sprintf("PIX-%d", time.Now().UnixMilli()), "Simulation: PIX_GATEWAY_URL not configured — no transfer executed")
		return
	}

	reqBody, _ := json.Marshal(body)
	reqID := r.Header.Get("X-Request-ID")
	respBody, status, err := proxyRequest(r.Context(), http.MethodPost, pixURL+"/v1/payments", reqBody, map[string]string{
		"X-Request-ID": reqID,
	})
	if err != nil {
		pixCB.recordFailure()
		http.Error(w, `{"error":"gateway_error","rail":"PIX"}`, http.StatusBadGateway)
		return
	}
	pixCB.recordSuccess()
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
}

// ResolvePIXKeyReal resolves a PIX key against the real PIX gateway.
func ResolvePIXKeyReal(w http.ResponseWriter, r *http.Request) {
	key := r.URL.Query().Get("key")
	if key == "" {
		http.Error(w, `{"error":"key_required"}`, http.StatusBadRequest)
		return
	}

	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		if os.Getenv("PAYGATE_SIMULATION_MODE") != "true" {
			gatewayUnavailable(w, "PIX", "PIX_GATEWAY_URL")
			return
		}
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Sandbox-Mode", "true")
		json.NewEncoder(w).Encode(map[string]interface{}{
			"key":        key,
			"valid":      false,
			"name":       "SIMULATED Receiver",
			"sandbox":    true,
			"simulation": true,
		})
		return
	}

	respBody, status, err := proxyRequest(r.Context(), http.MethodGet,
		fmt.Sprintf("%s/v1/keys/resolve?key=%s", pixURL, key), nil, nil)
	if err != nil {
		http.Error(w, `{"error":"gateway_error","rail":"PIX"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
}

// ─── Circuit Breaker Status ───────────────────────────────────────────────────

// GetCrossRailCircuitStatus returns the current state of all circuit breakers.
func GetCrossRailCircuitStatus(w http.ResponseWriter, r *http.Request) {
	now := time.Now()
	status := func(cb *circuitBreaker) map[string]interface{} {
		cb.mu.Lock()
		defer cb.mu.Unlock()
		open := !cb.openUntil.IsZero() && now.Before(cb.openUntil)
		retryIn := 0.0
		if open {
			retryIn = cb.openUntil.Sub(now).Seconds()
		}
		return map[string]interface{}{
			"state":      map[bool]string{true: "OPEN", false: "CLOSED"}[open],
			"failures":   cb.failures,
			"retry_in_s": retryIn,
		}
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"cips":                status(cipsCB),
		"upi":                 upiCB.allow(),
		"pix":                 pixCB.allow(),
		"mojaloop":            mojaloopCB.allow(),
		"fraud_blocked_total": atomic.LoadInt64(&fraudBlockedCount),
		"timestamp":           now.UTC().Format(time.RFC3339),
	})
}
