// Package handlers — Embedded Finance SDK Relay
// Provides the server-side relay for the PayGate Embedded Finance SDK.
// Handles SDK token issuance, webhook relay, and open banking data API.
// Routes are protected by APISIX gateway with Keycloak JWT validation.
package handlers

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/dapr"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
)

// ─── SDK Token Issuance ───────────────────────────────────────────────────────

type SDKTokenRequest struct {
	MerchantID  string   `json:"merchant_id"`
	Scopes      []string `json:"scopes"` // ["payments", "data", "webhooks", "loyalty"]
	ExpiresIn   int      `json:"expires_in"` // seconds, default 3600
	Environment string   `json:"environment"` // "sandbox" | "production"
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

type SDKTokenResponse struct {
	Token       string   `json:"token"`
	TokenID     string   `json:"token_id"`
	MerchantID  string   `json:"merchant_id"`
	Scopes      []string `json:"scopes"`
	ExpiresAt   string   `json:"expires_at"`
	Environment string   `json:"environment"`
	PublishableKey string `json:"publishable_key"`
}

// IssueSDKToken issues a scoped SDK token for embedded finance integration.
func IssueSDKToken(w http.ResponseWriter, r *http.Request) {
	var req SDKTokenRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.MerchantID == "" {
		http.Error(w, `{"error":"merchant_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Verify merchant is active and KYB-approved
	merchant, err := pgdb.GetMerchantProfile(ctx, req.MerchantID)
	if err != nil || merchant.KYCStatus != "approved" {
		http.Error(w, `{"error":"merchant not eligible for SDK access"}`, http.StatusForbidden)
		return
	}

	expiresIn := req.ExpiresIn
	if expiresIn <= 0 || expiresIn > 86400 {
		expiresIn = 3600
	}

	tokenID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(time.Duration(expiresIn) * time.Second)

	// Generate HMAC-signed token
	secret := os.Getenv("JWT_SECRET")
	payload := fmt.Sprintf("%s:%s:%d", req.MerchantID, tokenID, expiresAt.Unix())
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write([]byte(payload))
	token := fmt.Sprintf("sdk_%s_%s", tokenID[:8], hex.EncodeToString(mac.Sum(nil))[:32])

	// Store token in Redis with TTL
	redis.SetWithTTL(ctx, fmt.Sprintf("sdk:token:%s", tokenID), map[string]interface{}{
		"merchant_id":  req.MerchantID,
		"scopes":       req.Scopes,
		"environment":  req.Environment,
		"expires_at":   expiresAt.Unix(),
		"token_id":     tokenID,
	}, time.Duration(expiresIn)*time.Second)

	// Log token issuance
	pgdb.LogSDKTokenIssuance(ctx, pgdb.SDKTokenRecord{
		TokenID:     tokenID,
		MerchantID:  req.MerchantID,
		Scopes:      req.Scopes,
		Environment: req.Environment,
		ExpiresAt:   expiresAt,
		IssuedAt:    time.Now().UTC(),
	})

	slog.Info("SDK token issued", "merchant_id", req.MerchantID, "token_id", tokenID, "scopes", req.Scopes)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(SDKTokenResponse{
		Token:          token,
		TokenID:        tokenID,
		MerchantID:     req.MerchantID,
		Scopes:         req.Scopes,
		ExpiresAt:      expiresAt.Format(time.RFC3339),
		Environment:    req.Environment,
		PublishableKey: fmt.Sprintf("pk_%s_%s", req.Environment[:4], req.MerchantID[:8]),
	})
}

// ─── Open Banking Data API ────────────────────────────────────────────────────

type OpenBankingDataRequest struct {
	MerchantID  string `json:"merchant_id"`
	CustomerID  string `json:"customer_id"`
	DataType    string `json:"data_type"` // "account_balance" | "transaction_history" | "credit_score"
	Consent     string `json:"consent_token"`
}

// GetOpenBankingData retrieves open banking data with consent validation.
// Routes through APISIX with Keycloak JWT and Permify policy check.
func GetOpenBankingData(w http.ResponseWriter, r *http.Request) {
	var req OpenBankingDataRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Validate consent token
	if !validateConsentToken(ctx, req.Consent, req.CustomerID, req.DataType) {
		http.Error(w, `{"error":"invalid or expired consent token"}`, http.StatusForbidden)
		return
	}

	// Check Permify policy
	if !checkPermifyPolicy(ctx, req.MerchantID, "open_banking", req.DataType) {
		http.Error(w, `{"error":"merchant not authorized for this data type"}`, http.StatusForbidden)
		return
	}

	var data interface{}
	var fetchErr error

	switch req.DataType {
	case "account_balance":
		data, fetchErr = fetchAccountBalance(ctx, req.CustomerID)
	case "transaction_history":
		data, fetchErr = fetchTransactionHistory(ctx, req.CustomerID, req.MerchantID)
	case "credit_score":
		data, fetchErr = fetchCreditScore(ctx, req.CustomerID)
	default:
		http.Error(w, `{"error":"unsupported data type"}`, http.StatusBadRequest)
		return
	}

	if fetchErr != nil {
		slog.Error("open banking data fetch failed", "data_type", req.DataType, "err", fetchErr)
		http.Error(w, `{"error":"data fetch failed"}`, http.StatusInternalServerError)
		return
	}

	// Audit log
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.open-banking",
		Key:   req.CustomerID,
		Value: map[string]interface{}{
			"event_type":  "open_banking.data.accessed",
			"merchant_id": req.MerchantID,
			"customer_id": req.CustomerID,
			"data_type":   req.DataType,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"merchant_id": req.MerchantID,
		"customer_id": req.CustomerID,
		"data_type":   req.DataType,
		"data":        data,
		"fetched_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Webhook Relay ────────────────────────────────────────────────────────────

type WebhookRelayConfig struct {
	MerchantID    string   `json:"merchant_id"`
	EndpointURL   string   `json:"endpoint_url"`
	Events        []string `json:"events"`
	SigningSecret string   `json:"signing_secret"`
	Active        bool     `json:"active"`
}

// RegisterWebhookEndpoint registers a new webhook endpoint for a merchant.
func RegisterWebhookEndpoint(w http.ResponseWriter, r *http.Request) {
	var req WebhookRelayConfig
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	endpointID := uuid.New().String()

	if err := pgdb.CreateWebhookEndpoint(ctx, pgdb.WebhookEndpoint{
		EndpointID:    endpointID,
		MerchantID:    req.MerchantID,
		EndpointURL:   req.EndpointURL,
		Events:        req.Events,
		SigningSecret: req.SigningSecret,
		Active:        true,
		CreatedAt:     time.Now().UTC(),
	}); err != nil {
		http.Error(w, `{"error":"failed to register webhook"}`, http.StatusInternalServerError)
		return
	}

	slog.Info("webhook endpoint registered", "endpoint_id", endpointID, "merchant_id", req.MerchantID)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"endpoint_id": endpointID,
		"merchant_id": req.MerchantID,
		"endpoint_url": req.EndpointURL,
		"events":      req.Events,
		"active":      true,
		"created_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// RelayWebhookEvent relays a platform event to all registered merchant webhook endpoints.
func RelayWebhookEvent(ctx context.Context, merchantID, eventType string, payload map[string]interface{}) {
	endpoints, err := pgdb.GetActiveWebhookEndpoints(ctx, merchantID, eventType)
	if err != nil || len(endpoints) == 0 {
		return
	}

	payloadBytes, _ := json.Marshal(payload)

	for _, endpoint := range endpoints {
		go func(ep pgdb.WebhookEndpoint) {
			// Sign payload
			mac := hmac.New(sha256.New, []byte(ep.SigningSecret))
			mac.Write(payloadBytes)
			signature := hex.EncodeToString(mac.Sum(nil))

			req, err := http.NewRequestWithContext(ctx, "POST", ep.EndpointURL, bytes.NewReader(payloadBytes))
			if err != nil {
				slog.Warn("webhook relay: failed to create request", "endpoint_id", ep.EndpointID, "err", err)
				return
			}
			req.Header.Set("Content-Type", "application/json")
			req.Header.Set("X-PayGate-Signature", fmt.Sprintf("sha256=%s", signature))
			req.Header.Set("X-PayGate-Event", eventType)
			req.Header.Set("X-PayGate-Timestamp", fmt.Sprintf("%d", time.Now().Unix()))

			client := &http.Client{Timeout: 10 * time.Second}
			resp, err := client.Do(req)
			if err != nil {
				slog.Warn("webhook relay: delivery failed", "endpoint_id", ep.EndpointID, "url", ep.EndpointURL, "err", err)
				pgdb.LogWebhookDelivery(ctx, ep.EndpointID, eventType, 0, "failed", err.Error())
				return
			}
			defer resp.Body.Close()

			slog.Info("webhook relay: delivered", "endpoint_id", ep.EndpointID, "status", resp.StatusCode)
			pgdb.LogWebhookDelivery(ctx, ep.EndpointID, eventType, resp.StatusCode, "delivered", "")
		}(endpoint)
	}
}

// ─── APISIX route helpers ─────────────────────────────────────────────────────

// RegisterAPISIXRoutes registers all embedded finance routes in APISIX.
// Called once at startup to ensure routes are configured.
func RegisterAPISIXRoutes() error {
	apisixAdminURL := os.Getenv("APISIX_ADMIN_URL")
	if apisixAdminURL == "" {
		apisixAdminURL = "http://apisix:9180"
	}
	apisixAPIKey := os.Getenv("APISIX_API_KEY")
	if apisixAPIKey == "" {
		apisixAPIKey = "apisix-admin-key-default"
	}

	routes := []map[string]interface{}{
		{
			"id":   "embedded-finance-sdk-token",
			"uri":  "/v1/sdk/token",
			"name": "PayGate SDK Token Issuance",
			"methods": []string{"POST"},
			"upstream": map[string]interface{}{
				"type": "roundrobin",
				"nodes": map[string]int{"go-bridge:8080": 1},
			},
			"plugins": map[string]interface{}{
				"jwt-auth": map[string]interface{}{},
				"rate-limiting": map[string]interface{}{
					"count": 100, "time_window": 60, "key": "consumer_name",
				},
			},
		},
		{
			"id":   "open-banking-data",
			"uri":  "/v1/open-banking/data",
			"name": "PayGate Open Banking Data API",
			"methods": []string{"POST"},
			"upstream": map[string]interface{}{
				"type": "roundrobin",
				"nodes": map[string]int{"go-bridge:8080": 1},
			},
			"plugins": map[string]interface{}{
				"jwt-auth": map[string]interface{}{},
				"openid-connect": map[string]interface{}{
					"client_id":     os.Getenv("KEYCLOAK_CLIENT_ID"),
					"client_secret": os.Getenv("KEYCLOAK_CLIENT_SECRET"),
					"discovery":     fmt.Sprintf("%s/realms/%s/.well-known/openid-configuration", os.Getenv("KEYCLOAK_URL"), os.Getenv("KEYCLOAK_REALM")),
				},
			},
		},
		{
			"id":   "webhook-registration",
			"uri":  "/v1/webhooks",
			"name": "PayGate Webhook Registration",
			"methods": []string{"POST", "GET", "DELETE"},
			"upstream": map[string]interface{}{
				"type": "roundrobin",
				"nodes": map[string]int{"go-bridge:8080": 1},
			},
			"plugins": map[string]interface{}{
				"jwt-auth": map[string]interface{}{},
			},
		},
	}

	client := &http.Client{Timeout: 10 * time.Second}
	for _, route := range routes {
		routeBytes, _ := json.Marshal(route)
		routeID := route["id"].(string)

		req, _ := http.NewRequest("PUT",
			fmt.Sprintf("%s/apisix/admin/routes/%s", apisixAdminURL, routeID),
			bytes.NewReader(routeBytes),
		)
		req.Header.Set("Content-Type", "application/json")
		req.Header.Set("X-API-KEY", apisixAPIKey)

		resp, err := client.Do(req)
		if err != nil {
			slog.Warn("APISIX route registration failed", "route_id", routeID, "err", err)
			continue
		}
		defer resp.Body.Close()
		slog.Info("APISIX route registered", "route_id", routeID, "status", resp.StatusCode)
	}

	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func validateConsentToken(ctx context.Context, token, customerID, dataType string) bool {
	if token == "" {
		return false
	}
	// In production: validate JWT consent token with Keycloak
	// For now: check Redis for active consent
	key := fmt.Sprintf("consent:%s:%s:%s", customerID, dataType, token[:min(16, len(token))])
	val, _ := redis.GetStr(ctx, key)
	return val != ""
}

func checkPermifyPolicy(ctx context.Context, merchantID, resource, action string) bool {
	permifyURL := os.Getenv("PERMIFY_URL")
	if permifyURL == "" {
		return true // Default allow if Permify not configured
	}

	payload := map[string]interface{}{
		"metadata": map[string]interface{}{
			"schema_version": "",
			"snap_token":     "",
			"depth":          20,
		},
		"entity": map[string]interface{}{
			"type": resource,
			"id":   action,
		},
		"permission": "access",
		"subject": map[string]interface{}{
			"type": "merchant",
			"id":   merchantID,
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/v1/permissions/check", permifyURL),
		bytes.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("Authorization", fmt.Sprintf("Bearer %s", os.Getenv("PERMIFY_API_KEY")))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Warn("Permify check failed, defaulting to allow", "err", err)
		return true
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)
	can, _ := result["can"].(string)
	return can == "CHECK_RESULT_ALLOWED"
}

func fetchAccountBalance(ctx context.Context, customerID string) (map[string]interface{}, error) {
	balanceKobo, err := pgdb.GetConsumerBalance(ctx, customerID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"available_kobo": balanceKobo,
		"ledger_kobo":    balanceKobo,
		"currency":       "NGN",
		"account_id":     customerID,
		"fetched_at":     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func fetchTransactionHistory(ctx context.Context, customerID, merchantID string) (interface{}, error) {
	txns, err := pgdb.GetConsumerTransactionHistory(ctx, customerID, merchantID, 50)
	if err != nil {
		return nil, err
	}
	return txns, nil
}

func fetchCreditScore(ctx context.Context, customerID string) (map[string]interface{}, error) {
	// In production: call credit bureau API
	// For now: compute from transaction history
	score, err := pgdb.ComputeCreditScore(ctx, customerID)
	if err != nil {
		return nil, err
	}
	return map[string]interface{}{
		"score":       score,
		"band":        creditBand(score),
		"computed_at": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

func creditBand(score int) string {
	switch {
	case score >= 750:
		return "excellent"
	case score >= 700:
		return "good"
	case score >= 650:
		return "fair"
	case score >= 600:
		return "poor"
	default:
		return "very_poor"
	}
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// ─── Dapr pub/sub for embedded finance events ─────────────────────────────────

// PublishEmbeddedFinanceEvent publishes an event to the embedded finance Dapr topic.
func PublishEmbeddedFinanceEvent(eventType string, payload map[string]interface{}) {
	payload["event_type"] = eventType
	payload["timestamp"] = time.Now().UTC().Format(time.RFC3339)
	dapr.Publish("paygate-pubsub", "embedded-finance", payload)
}
