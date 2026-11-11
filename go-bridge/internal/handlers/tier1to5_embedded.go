// tier1to5_embedded.go — Tier 4a/4c routes proxied from
// server/tier1to5Router.ts: /open-banking/*, /sdk/token, /webhooks/*.
package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// ─── Open Banking ─────────────────────────────────────────────────────────────

// T5IssueConsent handles POST /open-banking/consent.
func T5IssueConsent(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID       string   `json:"merchant_id"`
		CustomerID       string   `json:"customer_id"`
		DataTypes        []string `json:"data_types"`
		ExpiresInSeconds int      `json:"expires_in_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.CustomerID == "" || len(req.DataTypes) == 0 {
		respondError(w, http.StatusBadRequest, "merchant_id, customer_id and data_types are required")
		return
	}
	for _, dt := range req.DataTypes {
		switch dt {
		case "account_balance", "transaction_history", "credit_score":
		default:
			respondError(w, http.StatusBadRequest, "invalid data_type: "+dt)
			return
		}
	}
	if req.ExpiresInSeconds < 300 || req.ExpiresInSeconds > 86400 {
		req.ExpiresInSeconds = 3600
	}

	token, err := randomTokenHex(32)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "token generation failed")
		return
	}
	consentID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(time.Duration(req.ExpiresInSeconds) * time.Second)
	scopes := strings.Join(req.DataTypes, ",")
	if err := pgdb.Get().T5CreateConsent(r.Context(), consentID, req.MerchantID, req.CustomerID, scopes, token, expiresAt); err != nil {
		slog.Error("t5 open-banking: persist consent failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist consent")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.open-banking",
		Key:   consentID,
		Value: map[string]interface{}{
			"event_type":  "open_banking.consent_issued",
			"consent_id":  consentID,
			"merchant_id": req.MerchantID,
			"customer_id": req.CustomerID,
			"data_types":  req.DataTypes,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"consent_id":    consentID,
		"consent_token": token,
		"merchant_id":   req.MerchantID,
		"customer_id":   req.CustomerID,
		"data_types":    req.DataTypes,
		"status":        "active",
		"expires_at":    expiresAt.Format(time.RFC3339),
	})
}

// T5GetOpenBankingData handles POST /open-banking/data. Validates the consent
// token (active, unexpired, scope covers the requested data type) and returns
// data aggregated from persisted records.
func T5GetOpenBankingData(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID   string `json:"merchant_id"`
		CustomerID   string `json:"customer_id"`
		DataType     string `json:"data_type"`
		ConsentToken string `json:"consent_token"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.CustomerID == "" || req.DataType == "" || req.ConsentToken == "" {
		respondError(w, http.StatusBadRequest, "merchant_id, customer_id, data_type and consent_token are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	consent, err := db.T5GetConsentByToken(ctx, req.ConsentToken)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusForbidden, "invalid consent token")
		return
	}
	if err != nil {
		slog.Error("t5 open-banking: consent lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to validate consent")
		return
	}
	if fmt.Sprint(consent["status"]) != "active" || fmt.Sprint(consent["merchant_id"]) != req.MerchantID {
		respondError(w, http.StatusForbidden, "consent not active for this merchant")
		return
	}
	if exp, ok := consent["expires_at"].(time.Time); ok && time.Now().UTC().After(exp) {
		respondError(w, http.StatusForbidden, "consent token expired")
		return
	}
	scopes := fmt.Sprint(consent["scopes"])
	if !strings.Contains(scopes, req.DataType) {
		respondError(w, http.StatusForbidden, "consent does not cover data_type "+req.DataType)
		return
	}

	switch req.DataType {
	case "account_balance":
		agg, err := db.T5ConsentAccountBalance(ctx, req.MerchantID, req.CustomerID)
		if err != nil {
			slog.Error("t5 open-banking: balance aggregation failed", "err", err)
			respondError(w, http.StatusInternalServerError, "failed to aggregate account balance")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"customer_id": req.CustomerID,
			"data_type":   req.DataType,
			"balance":     agg,
		})
	case "transaction_history":
		txs, err := db.T5ConsentTransactionHistory(ctx, req.MerchantID, 50)
		if err != nil {
			slog.Error("t5 open-banking: history failed", "err", err)
			respondError(w, http.StatusInternalServerError, "failed to fetch transaction history")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"customer_id":  req.CustomerID,
			"data_type":    req.DataType,
			"transactions": txs,
		})
	case "credit_score":
		metrics, err := db.T5MerchantCreditMetrics(ctx, req.MerchantID)
		if err != nil {
			slog.Error("t5 open-banking: credit metrics failed", "err", err)
			respondError(w, http.StatusInternalServerError, "failed to compute credit score")
			return
		}
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"customer_id": req.CustomerID,
			"data_type":   req.DataType,
			"metrics":     metrics,
		})
	default:
		respondError(w, http.StatusBadRequest, "unsupported data_type")
	}
}

// T5IssueSDKToken handles POST /sdk/token. The token plaintext is returned
// once; only its SHA-256 hash is persisted in sdk_tokens.
func T5IssueSDKToken(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID  string   `json:"merchant_id"`
		Scopes      []string `json:"scopes"`
		ExpiresIn   int      `json:"expires_in"`
		Environment string   `json:"environment"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	if len(req.Scopes) == 0 {
		req.Scopes = []string{"payments", "data"}
	}
	if req.ExpiresIn < 300 || req.ExpiresIn > 86400 {
		req.ExpiresIn = 3600
	}
	env := firstNonEmpty(req.Environment, "production")
	if env != "sandbox" && env != "production" {
		respondError(w, http.StatusBadRequest, "environment must be sandbox|production")
		return
	}

	token, err := randomTokenHex(32)
	if err != nil {
		respondError(w, http.StatusInternalServerError, "token generation failed")
		return
	}
	sum := sha256.Sum256([]byte(token))
	tokenHash := hex.EncodeToString(sum[:])
	tokenID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(time.Duration(req.ExpiresIn) * time.Second)

	scopes := append([]string{}, req.Scopes...)
	scopes = append(scopes, "env:"+env)
	if err := pgdb.Get().T5InsertSDKToken(r.Context(), tokenID, req.MerchantID, tokenHash, expiresAt, scopes); err != nil {
		slog.Error("t5 sdk: persist token failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist SDK token")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.sdk",
		Key:   tokenID,
		Value: map[string]interface{}{
			"event_type":  "sdk.token_issued",
			"token_id":    tokenID,
			"merchant_id": req.MerchantID,
			"environment": env,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"token_id":    tokenID,
		"token":       "pgt_" + token,
		"merchant_id": req.MerchantID,
		"scopes":      req.Scopes,
		"environment": env,
		"expires_at":  expiresAt.Format(time.RFC3339),
	})
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

// T5RegisterWebhook handles POST /webhooks/register.
func T5RegisterWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID    string   `json:"merchant_id"`
		EndpointURL   string   `json:"endpoint_url"`
		Events        []string `json:"events"`
		SigningSecret string   `json:"signing_secret"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.EndpointURL == "" || len(req.Events) == 0 || len(req.SigningSecret) < 16 {
		respondError(w, http.StatusBadRequest, "merchant_id, endpoint_url, events and signing_secret(>=16 chars) are required")
		return
	}

	endpointID := uuid.New().String()
	if err := pgdb.Get().T5CreateWebhookEndpoint(r.Context(), endpointID, req.MerchantID, req.EndpointURL, req.SigningSecret, req.Events); err != nil {
		slog.Error("t5 webhooks: register failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to register webhook endpoint")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.webhooks",
		Key:   endpointID,
		Value: map[string]interface{}{
			"event_type":  "webhook.endpoint_registered",
			"endpoint_id": endpointID,
			"merchant_id": req.MerchantID,
			"events":      req.Events,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"endpoint_id":  endpointID,
		"merchant_id":  req.MerchantID,
		"endpoint_url": req.EndpointURL,
		"events":       req.Events,
		"status":       "active",
		"created_at":   time.Now().UTC().Format(time.RFC3339),
	})
}

// T5ListWebhooks handles GET /webhooks/list?merchant_id=
func T5ListWebhooks(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	endpoints, err := pgdb.Get().T5ListWebhookEndpoints(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 webhooks: list failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list webhook endpoints")
		return
	}
	for _, ep := range endpoints {
		ep["events"] = jsonString(ep["events"])
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"endpoints": endpoints})
}

// T5DeleteWebhook handles POST /webhooks/delete (soft delete).
func T5DeleteWebhook(w http.ResponseWriter, r *http.Request) {
	var req struct {
		EndpointID string `json:"endpoint_id"`
		MerchantID string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.EndpointID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "endpoint_id and merchant_id are required")
		return
	}
	n, err := pgdb.Get().T5DeleteWebhookEndpoint(r.Context(), req.EndpointID, req.MerchantID)
	if err != nil {
		slog.Error("t5 webhooks: delete failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to delete webhook endpoint")
		return
	}
	if n == 0 {
		respondError(w, http.StatusNotFound, "webhook endpoint not found or already inactive")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.webhooks",
		Key:   req.EndpointID,
		Value: map[string]interface{}{
			"event_type":  "webhook.endpoint_deleted",
			"endpoint_id": req.EndpointID,
			"merchant_id": req.MerchantID,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"endpoint_id": req.EndpointID,
		"status":      "deleted",
		"deleted_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// T5WebhookDeliveries handles GET /webhooks/deliveries?endpoint_id=&merchant_id=&limit=
func T5WebhookDeliveries(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	endpointID, merchantID := q.Get("endpoint_id"), q.Get("merchant_id")
	if endpointID == "" || merchantID == "" {
		respondError(w, http.StatusBadRequest, "endpoint_id and merchant_id are required")
		return
	}
	limit := parseIntQuery(r, "limit", 20)
	rows, err := pgdb.Get().T5ListWebhookDeliveries(r.Context(), endpointID, merchantID, limit)
	if err != nil {
		slog.Error("t5 webhooks: deliveries failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list webhook deliveries")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"deliveries": rows})
}

// T5RetryWebhookDelivery handles POST /webhooks/retry. Re-POSTs the persisted
// payload to the endpoint URL with an HMAC signature and logs the new attempt
// in webhook_delivery_log. Fail-loud: delivery failure is persisted and
// reported as 502.
func T5RetryWebhookDelivery(w http.ResponseWriter, r *http.Request) {
	var req struct {
		DeliveryID string `json:"delivery_id"`
		MerchantID string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.DeliveryID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "delivery_id and merchant_id are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	delivery, err := db.T5GetWebhookDelivery(ctx, req.DeliveryID, req.MerchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "delivery not found")
		return
	}
	if err != nil {
		slog.Error("t5 webhooks: fetch delivery failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch delivery")
		return
	}

	endpointURL := fmt.Sprint(delivery["endpoint_url"])
	payload := fmt.Sprint(delivery["payload"])
	eventType := fmt.Sprint(delivery["event_type"])
	attempt := int(parseInt64Loose2(delivery["attempt"])) + 1
	secret := fmt.Sprint(delivery["signing_secret"])

	// Deliver with HMAC signature (X-PayGate-Signature).
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	sig := hex.EncodeToString(mac.Sum(nil))

	deliverCtx, cancel := context.WithTimeout(ctx, 10*time.Second)
	defer cancel()
	httpReq, err := http.NewRequestWithContext(deliverCtx, http.MethodPost, endpointURL, bytes.NewReader([]byte(payload)))
	if err != nil {
		respondError(w, http.StatusInternalServerError, "failed to build retry request")
		return
	}
	httpReq.Header.Set("Content-Type", "application/json")
	httpReq.Header.Set("X-PayGate-Event", eventType)
	httpReq.Header.Set("X-PayGate-Signature", sig)

	statusCode := 0
	success := false
	resp, err := (&http.Client{Timeout: 10 * time.Second}).Do(httpReq)
	if err != nil {
		slog.Warn("t5 webhooks: retry delivery failed", "delivery_id", req.DeliveryID, "err", err)
	} else {
		statusCode = resp.StatusCode
		io.Copy(io.Discard, io.LimitReader(resp.Body, 1<<16))
		resp.Body.Close()
		success = statusCode >= 200 && statusCode < 300
	}

	newDeliveryID := uuid.New().String()
	if logErr := db.T5LogWebhookDelivery(ctx, newDeliveryID,
		fmt.Sprint(delivery["endpoint_id"]), req.MerchantID, eventType,
		payload, statusCode, success, attempt); logErr != nil {
		slog.Error("t5 webhooks: persist retry outcome failed", "err", logErr)
		respondError(w, http.StatusInternalServerError, "failed to persist retry outcome")
		return
	}

	if !success {
		respondJSON(w, http.StatusBadGateway, map[string]interface{}{
			"delivery_id": newDeliveryID,
			"retry_of":    req.DeliveryID,
			"status":      "failed",
			"http_status": statusCode,
			"attempt":     attempt,
		})
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.webhooks",
		Key:   newDeliveryID,
		Value: map[string]interface{}{
			"event_type":  "webhook.delivery_retried",
			"delivery_id": newDeliveryID,
			"retry_of":    req.DeliveryID,
			"merchant_id": req.MerchantID,
			"http_status": statusCode,
			"attempt":     attempt,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"delivery_id": newDeliveryID,
		"retry_of":    req.DeliveryID,
		"status":      "delivered",
		"http_status": statusCode,
		"attempt":     attempt,
	})
}
