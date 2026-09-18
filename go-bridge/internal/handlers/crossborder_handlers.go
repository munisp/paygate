package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"net/url"
	"os"
	"time"

	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// gatewayUnavailable fails loudly when a rail gateway is not configured.
func gatewayUnavailable(w http.ResponseWriter, rail, envVar string) {
	slog.Error("[crossborder] gateway not configured — refusing to fabricate response", "rail", rail, "env", envVar)
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   "gateway_not_configured",
		"rail":    rail,
		"message": fmt.Sprintf("%s is not set; %s rail unavailable", envVar, rail),
	})
}

// relayUpstream forwards to an upstream URL and relays status+body verbatim.
// On transport failure it emits 502. Returns false if it already responded.
func relayUpstream(w http.ResponseWriter, r *http.Request, method, targetURL string, body []byte) bool {
	respBody, status, err := proxyRequest(r.Context(), method, targetURL, body, map[string]string{
		"X-Request-ID":   r.Header.Get("X-Request-ID"),
		"X-Internal-Key": os.Getenv("INTERNAL_API_KEY"),
	})
	if err != nil {
		slog.Error("[crossborder] upstream error", "url", targetURL, "err", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":   "upstream_error",
			"message": "upstream gateway unreachable",
		})
		return false
	}
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(status)
	w.Write(respBody)
	return true
}

// probeHealth performs a real HTTP health probe against a backend.
// Returns (healthy, detail).
func probeHealth(r *http.Request, baseURL, service string) (bool, map[string]interface{}) {
	respBody, status, err := proxyRequest(r.Context(), http.MethodGet, baseURL+"/health", nil, nil)
	out := map[string]interface{}{
		"service":   service,
		"url":       baseURL,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	if err != nil {
		out["status"] = "unavailable"
		out["connected"] = false
		out["error"] = err.Error()
		return false, out
	}
	out["connected"] = status < 500
	if status < 500 {
		out["status"] = "healthy"
		// Relay upstream detail when it is JSON.
		var detail map[string]interface{}
		if json.Unmarshal(respBody, &detail) == nil {
			out["upstream"] = detail
		}
	} else {
		out["status"] = "unhealthy"
		out["upstreamStatus"] = status
	}
	return status < 500, out
}

// ─── CIPS ─────────────────────────────────────────────────────────────────────

func GetCIPSTransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, `{"error":"id_required"}`, http.StatusBadRequest)
		return
	}
	cipsURL := os.Getenv("CIPS_GATEWAY_URL")
	if cipsURL == "" {
		gatewayUnavailable(w, "CIPS", "CIPS_GATEWAY_URL")
		return
	}
	relayUpstream(w, r, http.MethodGet, cipsURL+"/v1/transfers/"+url.PathEscape(id), nil)
}

func GetCIPSCorridors(w http.ResponseWriter, r *http.Request) {
	// Static corridor configuration. FX rates are NOT included here — callers
	// must obtain a live quote from the CIPS gateway via POST /v1/cips/quote.
	corridors := []map[string]interface{}{
		{"from": "NGN", "to": "CNY", "minAmount": 100000, "maxAmount": 50000000, "fee": 0.005, "sla": "T+1"},
		{"from": "USD", "to": "CNY", "minAmount": 100, "maxAmount": 100000, "fee": 0.003, "sla": "T+0"},
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"corridors": corridors,
		"rail":      "CIPS",
		"fxSource":  "live quote required — no indicative rates are served",
	})
}

func GetCIPSHealth(w http.ResponseWriter, r *http.Request) {
	cipsURL := os.Getenv("CIPS_GATEWAY_URL")
	w.Header().Set("Content-Type", "application/json")
	if cipsURL == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unconfigured", "service": "cips-gateway", "connected": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	healthy, detail := probeHealth(r, cipsURL, "cips-gateway")
	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(detail)
}

// ─── UPI ──────────────────────────────────────────────────────────────────────

func ProxyUPICollect(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		gatewayUnavailable(w, "UPI", "UPI_GATEWAY_URL")
		return
	}
	reqBody, _ := json.Marshal(body)
	relayUpstream(w, r, http.MethodPost, upiURL+"/v1/collect", reqBody)
}

func GetUPITransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, `{"error":"id_required"}`, http.StatusBadRequest)
		return
	}
	upiURL := os.Getenv("UPI_GATEWAY_URL")
	if upiURL == "" {
		gatewayUnavailable(w, "UPI", "UPI_GATEWAY_URL")
		return
	}
	relayUpstream(w, r, http.MethodGet, upiURL+"/v1/status/"+url.PathEscape(id), nil)
}

func GetUPIHealth(w http.ResponseWriter, r *http.Request) {
	upiURL := os.Getenv("UPI_GATEWAY_URL")
	w.Header().Set("Content-Type", "application/json")
	if upiURL == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unconfigured", "service": "upi-gateway", "connected": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	healthy, detail := probeHealth(r, upiURL, "upi-gateway")
	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(detail)
}

// ─── PIX ──────────────────────────────────────────────────────────────────────

func LookupPIXKey(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	key, _ := body["key"].(string)
	if key == "" {
		http.Error(w, `{"error":"key_required"}`, http.StatusBadRequest)
		return
	}
	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		gatewayUnavailable(w, "PIX", "PIX_GATEWAY_URL")
		return
	}
	reqBody, _ := json.Marshal(body)
	relayUpstream(w, r, http.MethodPost, pixURL+"/v1/keys/lookup", reqBody)
}

func GetPIXTransferStatus(w http.ResponseWriter, r *http.Request) {
	id := r.URL.Query().Get("id")
	if id == "" {
		http.Error(w, `{"error":"id_required"}`, http.StatusBadRequest)
		return
	}
	pixURL := os.Getenv("PIX_GATEWAY_URL")
	if pixURL == "" {
		gatewayUnavailable(w, "PIX", "PIX_GATEWAY_URL")
		return
	}
	relayUpstream(w, r, http.MethodGet, pixURL+"/v1/payments/"+url.PathEscape(id), nil)
}

func GetPIXHealth(w http.ResponseWriter, r *http.Request) {
	pixURL := os.Getenv("PIX_GATEWAY_URL")
	w.Header().Set("Content-Type", "application/json")
	if pixURL == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unconfigured", "service": "pix-gateway", "connected": false, "mtlsEnabled": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	healthy, detail := probeHealth(r, pixURL, "pix-gateway")
	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(detail)
}

// ─── Mojaloop ─────────────────────────────────────────────────────────────────

func ProxyMojaloopTransfer(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	mojURL := os.Getenv("MOJALOOP_URL")
	if mojURL == "" {
		gatewayUnavailable(w, "MOJALOOP", "MOJALOOP_URL")
		return
	}
	reqBody, _ := json.Marshal(body)
	relayUpstream(w, r, http.MethodPost, mojURL+"/v1/cross-border/transfer", reqBody)
}

func GetMojaloopQuote(w http.ResponseWriter, r *http.Request) {
	mojURL := os.Getenv("MOJALOOP_URL")
	if mojURL == "" {
		gatewayUnavailable(w, "MOJALOOP", "MOJALOOP_URL")
		return
	}
	// Forward the quote parameters to the adapter's quote endpoint.
	q := r.URL.Query()
	reqBody, _ := json.Marshal(map[string]interface{}{
		"sourceCurrency": q.Get("sourceCurrency"),
		"targetCurrency": q.Get("targetCurrency"),
		"amount":         q.Get("amount"),
		"rail":           q.Get("rail"),
	})
	relayUpstream(w, r, http.MethodPost, mojURL+"/v1/cross-border/quote", reqBody)
}

func GetMojaloopParties(w http.ResponseWriter, r *http.Request) {
	// Party lookup requires a live FSPIOP hub connection which the bridge does
	// not terminate; fail loudly instead of fabricating payee identities.
	slog.Error("[crossborder] mojaloop party lookup requested but no FSPIOP hub is wired")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusNotImplemented)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   "not_implemented",
		"message": "Mojaloop party lookup is not wired to a live FSPIOP hub; refusing to fabricate payee identity",
	})
}

func GetMojaloopHealth(w http.ResponseWriter, r *http.Request) {
	mojURL := os.Getenv("MOJALOOP_URL")
	w.Header().Set("Content-Type", "application/json")
	if mojURL == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unconfigured", "service": "mojaloop-fspiop-adapter", "connected": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	healthy, detail := probeHealth(r, mojURL, "mojaloop-fspiop-adapter")
	if !healthy {
		w.WriteHeader(http.StatusServiceUnavailable)
	}
	json.NewEncoder(w).Encode(detail)
}

// ─── OpenSearch ───────────────────────────────────────────────────────────────

func ProxyOpenSearchQuery(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	osURL := os.Getenv("OPENSEARCH_URL")
	if osURL == "" {
		gatewayUnavailable(w, "OPENSEARCH", "OPENSEARCH_URL")
		return
	}
	index, _ := body["index"].(string)
	if index == "" {
		index = r.URL.Query().Get("index")
	}
	if index == "" {
		http.Error(w, `{"error":"index_required"}`, http.StatusBadRequest)
		return
	}
	delete(body, "index")
	reqBody, _ := json.Marshal(body)
	relayUpstream(w, r, http.MethodPost, fmt.Sprintf("%s/%s/_search", osURL, url.PathEscape(index)), reqBody)
}

func ProxyOpenSearchIndex(w http.ResponseWriter, r *http.Request) {
	var body map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	osURL := os.Getenv("OPENSEARCH_URL")
	if osURL == "" {
		gatewayUnavailable(w, "OPENSEARCH", "OPENSEARCH_URL")
		return
	}
	index, _ := body["index"].(string)
	if index == "" {
		index = r.URL.Query().Get("index")
	}
	if index == "" {
		http.Error(w, `{"error":"index_required"}`, http.StatusBadRequest)
		return
	}
	delete(body, "index")
	reqBody, _ := json.Marshal(body)
	relayUpstream(w, r, http.MethodPost, fmt.Sprintf("%s/%s/_doc", osURL, url.PathEscape(index)), reqBody)
}

func GetOpenSearchHealth(w http.ResponseWriter, r *http.Request) {
	osURL := os.Getenv("OPENSEARCH_URL")
	w.Header().Set("Content-Type", "application/json")
	if osURL == "" {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unconfigured", "service": "opensearch", "connected": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	respBody, status, err := proxyRequest(r.Context(), http.MethodGet, osURL, nil, nil)
	detail := map[string]interface{}{
		"service": "opensearch", "url": osURL,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	}
	if err != nil || status >= 500 {
		detail["status"] = "unavailable"
		detail["connected"] = false
		if err != nil {
			detail["error"] = err.Error()
		}
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(detail)
		return
	}
	detail["status"] = "healthy"
	detail["connected"] = true
	var info map[string]interface{}
	if json.Unmarshal(respBody, &info) == nil {
		if v, ok := info["version"].(map[string]interface{}); ok {
			detail["version"] = v["number"]
		}
	}
	json.NewEncoder(w).Encode(detail)
}

// ─── TigerBeetle Ledger ───────────────────────────────────────────────────────

// ledgerUnavailable responds 503 when the TigerBeetle client is not wired.
func ledgerUnavailable(w http.ResponseWriter) {
	slog.Error("[ledger] TigerBeetle client not initialised — refusing to fabricate ledger data")
	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusServiceUnavailable)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"error":   "ledger_unavailable",
		"message": "TigerBeetle ledger client is not initialised; no balance/transfer data can be served",
	})
}

func GetLedgerAccounts(w http.ResponseWriter, r *http.Request) {
	client := tb.GetActive()
	if client == nil {
		ledgerUnavailable(w)
		return
	}
	// TigerBeetle has no account-listing primitive; expose the platform float
	// account with its real balance.
	floatID := tb.FloatAccountID()
	balance, err := client.GetBalance(floatID)
	if err != nil {
		slog.Error("[ledger] float account lookup failed", "err", err)
		http.Error(w, `{"error":"ledger_query_failed"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"accounts": []map[string]interface{}{
			{"id": floatID.String(), "role": "platform_float", "balance": balance},
		},
		"note":      "TigerBeetle does not support account enumeration; query /v1/ledger/balance?accountId= for a specific account",
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func CreateLedgerTransfer(w http.ResponseWriter, r *http.Request) {
	client := tb.GetActive()
	if client == nil {
		ledgerUnavailable(w)
		return
	}
	var body struct {
		DebitAccountID  string `json:"debitAccountId"`
		CreditAccountID string `json:"creditAccountId"`
		Amount          uint64 `json:"amount"`
		Ledger          uint32 `json:"ledger"`
		Code            uint16 `json:"code"`
	}
	if err := json.NewDecoder(r.Body).Decode(&body); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}
	if body.DebitAccountID == "" || body.CreditAccountID == "" || body.Amount == 0 {
		http.Error(w, `{"error":"debitAccountId, creditAccountId and amount are required"}`, http.StatusBadRequest)
		return
	}
	debitID, err := tb.UUIDToID(body.DebitAccountID)
	if err != nil {
		http.Error(w, `{"error":"invalid debitAccountId"}`, http.StatusBadRequest)
		return
	}
	creditID, err := tb.UUIDToID(body.CreditAccountID)
	if err != nil {
		http.Error(w, `{"error":"invalid creditAccountId"}`, http.StatusBadRequest)
		return
	}
	transferUUID, err := tb.NewUUID()
	if err != nil {
		http.Error(w, `{"error":"failed to allocate transfer id"}`, http.StatusInternalServerError)
		return
	}
	transferID, err := tb.UUIDToUint128(transferUUID)
	if err != nil {
		http.Error(w, `{"error":"failed to allocate transfer id"}`, http.StatusInternalServerError)
		return
	}
	ledger := body.Ledger
	if ledger == 0 {
		ledger = 1
	}
	if err := client.Transfer(transferID, debitID, creditID, body.Amount, ledger, body.Code); err != nil {
		slog.Error("[ledger] transfer failed", "err", err)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusBadGateway)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"error":      "transfer_failed",
			"transferId": transferUUID,
			"message":    err.Error(),
		})
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"transferId": transferUUID,
		"status":     "COMMITTED",
		"timestamp":  time.Now().UTC().Format(time.RFC3339),
	})
}

func GetLedgerBalance(w http.ResponseWriter, r *http.Request) {
	client := tb.GetActive()
	if client == nil {
		ledgerUnavailable(w)
		return
	}
	accountID := r.URL.Query().Get("accountId")
	if accountID == "" {
		http.Error(w, `{"error":"accountId_required"}`, http.StatusBadRequest)
		return
	}
	id, err := tb.UUIDToID(accountID)
	if err != nil {
		http.Error(w, `{"error":"invalid accountId"}`, http.StatusBadRequest)
		return
	}
	balance, err := client.GetBalance(id)
	if err != nil {
		slog.Error("[ledger] balance lookup failed", "err", err)
		http.Error(w, `{"error":"ledger_query_failed"}`, http.StatusBadGateway)
		return
	}
	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"accountId": accountID,
		"balance":   balance,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}

func GetLedgerHealth(w http.ResponseWriter, r *http.Request) {
	client := tb.GetActive()
	w.Header().Set("Content-Type", "application/json")
	if client == nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unavailable", "service": "tigerbeetle-ledger", "connected": false,
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	// Prove connectivity with a real lookup of the float account.
	_, err := client.GetBalance(tb.FloatAccountID())
	if err != nil {
		w.WriteHeader(http.StatusServiceUnavailable)
		json.NewEncoder(w).Encode(map[string]interface{}{
			"status": "unhealthy", "service": "tigerbeetle-ledger", "connected": false,
			"error":     err.Error(),
			"timestamp": time.Now().UTC().Format(time.RFC3339),
		})
		return
	}
	json.NewEncoder(w).Encode(map[string]interface{}{
		"status": "healthy", "service": "tigerbeetle-ledger", "connected": true,
		"timestamp": time.Now().UTC().Format(time.RFC3339),
	})
}
