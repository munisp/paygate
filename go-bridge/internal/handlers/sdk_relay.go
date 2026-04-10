// Package handlers — SDK Relay
// Manages SDK key generation, rotation, analytics, and webhook relay.
package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
)

// SDKRelayHandler handles SDK key management and webhook relay.
type SDKRelayHandler struct {
	db    *pgdb.DB
	redis *redis.Client
	kafka *kafka.Producer
}

// NewSDKRelayHandler creates a new SDKRelayHandler.
func NewSDKRelayHandler(db *pgdb.DB, r *redis.Client, k *kafka.Producer) *SDKRelayHandler {
	return &SDKRelayHandler{db: db, redis: r, kafka: k}
}

// GenerateSDKKey POST /sdk/keys
func (h *SDKRelayHandler) GenerateSDKKey(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID     string   `json:"merchant_id"`
		Label          string   `json:"label"`
		Environment    string   `json:"environment"`
		AllowedOrigins []string `json:"allowed_origins"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	env := req.Environment
	if env == "" {
		env = "sandbox"
	}
	prefix := "pk_test_"
	if env == "production" {
		prefix = "pk_live_"
	}
	keyID := uuid.New().String()
	publicKey := prefix + uuid.New().String()[:32]
	record := pgdb.SDKKeyRecord{
		ID:             keyID,
		MerchantID:     req.MerchantID,
		Label:          req.Label,
		PublicKey:      publicKey,
		Environment:    env,
		AllowedOrigins: req.AllowedOrigins,
		IsActive:       true,
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.db.InsertSDKKeyRecord(r.Context(), record); err != nil {
		jsonError(w, "failed to create SDK key", http.StatusInternalServerError)
		return
	}
	cacheKey := "sdk:key:" + publicKey
	redis.SetWithTTL(r.Context(), cacheKey, record, 24*time.Hour)
	_ = h.kafka.Publish(r.Context(), "paygate.sdk.key.created", keyID, map[string]interface{}{
		"key_id":      keyID,
		"merchant_id": req.MerchantID,
		"env":         env,
	})
	jsonOK(w, map[string]interface{}{
		"key_id":     keyID,
		"public_key": publicKey,
		"label":      req.Label,
		"env":        env,
	}, http.StatusCreated)
}

// ListSDKIntegrations GET /sdk/keys
func (h *SDKRelayHandler) ListSDKIntegrations(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		jsonError(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	keys, err := h.db.ListSDKKeys(r.Context(), merchantID)
	if err != nil {
		jsonError(w, "failed to list SDK keys", http.StatusInternalServerError)
		return
	}
	jsonOK(w, map[string]interface{}{"keys": keys, "count": len(keys)}, http.StatusOK)
}

// GetSDKAnalytics GET /sdk/keys/{keyId}/analytics
func (h *SDKRelayHandler) GetSDKAnalytics(w http.ResponseWriter, r *http.Request) {
	keyID := r.PathValue("keyId")
	if keyID == "" {
		jsonError(w, "keyId required", http.StatusBadRequest)
		return
	}
	analytics, err := h.db.GetSDKKeyAnalytics(r.Context(), keyID)
	if err != nil {
		jsonError(w, "failed to get analytics", http.StatusInternalServerError)
		return
	}
	jsonOK(w, analytics, http.StatusOK)
}

// RotateSDKKey POST /sdk/keys/{keyId}/rotate
func (h *SDKRelayHandler) RotateSDKKey(w http.ResponseWriter, r *http.Request) {
	keyID := r.PathValue("keyId")
	if keyID == "" {
		jsonError(w, "keyId required", http.StatusBadRequest)
		return
	}
	oldKey, err := h.db.GetSDKKeyRecord(r.Context(), keyID)
	if err != nil {
		jsonError(w, "key not found", http.StatusNotFound)
		return
	}
	env := oldKey.Environment
	prefix := "pk_test_"
	if env == "production" {
		prefix = "pk_live_"
	}
	newPublicKey := prefix + uuid.New().String()[:32]
	newKeyID := uuid.New().String()
	if err := h.db.RotateSDKKey(r.Context(), keyID, newKeyID, newPublicKey); err != nil {
		jsonError(w, "rotation failed", http.StatusInternalServerError)
		return
	}
	redis.Delete(r.Context(), "sdk:key:"+oldKey.PublicKey)
	_ = h.kafka.Publish(r.Context(), "paygate.sdk.key.rotated", keyID, map[string]interface{}{
		"old_key_id": keyID,
		"new_key_id": newKeyID,
	})
	jsonOK(w, map[string]interface{}{
		"new_key_id":     newKeyID,
		"new_public_key": newPublicKey,
		"rotated_at":     time.Now().UTC(),
	}, http.StatusOK)
}

// RelayWebhook POST /sdk/webhook/relay
func (h *SDKRelayHandler) RelayWebhook(w http.ResponseWriter, r *http.Request) {
	var payload map[string]interface{}
	if err := json.NewDecoder(r.Body).Decode(&payload); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	merchantID, _ := payload["merchant_id"].(string)
	if merchantID == "" {
		jsonError(w, "merchant_id required in payload", http.StatusBadRequest)
		return
	}
	endpoints, err := pgdb.GetActiveWebhookEndpoints(r.Context(), merchantID, "")
	if err != nil {
		jsonError(w, "failed to get endpoints", http.StatusInternalServerError)
		return
	}
	delivered := 0
	for _, ep := range endpoints {
		go deliverWebhookAsync(ep.EndpointURL, payload)
		delivered++
	}
	_ = h.kafka.Publish(r.Context(), "paygate.sdk.webhook.relayed", merchantID, map[string]interface{}{
		"merchant_id": merchantID,
		"delivered":   delivered,
		"event":       payload["event"],
	})
	jsonOK(w, map[string]interface{}{"delivered": delivered}, http.StatusOK)
}

func deliverWebhookAsync(url string, payload map[string]interface{}) {
	body, _ := json.Marshal(payload)
	client := &http.Client{Timeout: 10 * time.Second}
	req, err := http.NewRequest(http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-PayGate-Event", "sdk.relay")
	_, _ = client.Do(req)
}
