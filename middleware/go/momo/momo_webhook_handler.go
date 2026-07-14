// middleware/go/momo/momo_webhook_handler.go
// Mobile Money provider webhook bridge handler.
// Supports: MTN MoMo, Airtel Money, M-Pesa, OPay, PalmPay, Wave, Orange.
// Wires: HMAC verification → Redis idempotency → Kafka publish →
//        Fluvio stream → Dapr pub/sub → Lakehouse audit.
package momo

import (
	"bytes"
	"context"
	"crypto/hmac"
	"crypto/sha256"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/redis/go-redis/v9"
	"github.com/segmentio/kafka-go"
	dapr "github.com/dapr/go-sdk/client"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type MoMoWebhookPayload struct {
	Provider        string  `json:"provider"`
	ExternalRef     string  `json:"externalRef"`
	InternalRef     string  `json:"internalRef"`
	Status          string  `json:"status"` // "SUCCESSFUL", "FAILED", "PENDING"
	Amount          float64 `json:"amount"`
	Currency        string  `json:"currency"`
	PhoneNumber     string  `json:"phoneNumber"`
	FinancialTxnID  string  `json:"financialTxnId"`
	Reason          string  `json:"reason"`
	Timestamp       string  `json:"timestamp"`
	// Provider-specific fields
	MTNTxnID        string  `json:"mtnTxnId,omitempty"`
	AirtelTxnID     string  `json:"airtelTxnId,omitempty"`
	MPesaReceiptNo  string  `json:"mpesaReceiptNumber,omitempty"`
	OPayOrderNo     string  `json:"opayOrderNo,omitempty"`
}

// ─── Handler ──────────────────────────────────────────────────────────────────

type MoMoWebhookHandler struct {
	redis       *redis.Client
	kafkaWriter *kafka.Writer
	daprClient  dapr.Client
	fluvioURL   string
	internalKey string
	secrets     map[string]string // provider → webhook secret
}

func NewMoMoWebhookHandler(rdb *redis.Client, kw *kafka.Writer, dc dapr.Client) *MoMoWebhookHandler {
	return &MoMoWebhookHandler{
		redis:       rdb,
		kafkaWriter: kw,
		daprClient:  dc,
		fluvioURL:   getEnv("FLUVIO_ENDPOINT", "http://localhost:9003"),
		internalKey: getEnv("MIDDLEWARE_INTERNAL_KEY", ""),
		secrets: map[string]string{
			"mtn":     getEnv("MTN_MOMO_WEBHOOK_SECRET", ""),
			"airtel":  getEnv("AIRTEL_WEBHOOK_SECRET", ""),
			"mpesa":   getEnv("MPESA_WEBHOOK_SECRET", ""),
			"opay":    getEnv("OPAY_WEBHOOK_SECRET", ""),
			"palmpay": getEnv("PALMPAY_WEBHOOK_SECRET", ""),
			"wave":    getEnv("WAVE_WEBHOOK_SECRET", ""),
			"orange":  getEnv("ORANGE_WEBHOOK_SECRET", ""),
		},
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// HandleWebhook is the unified MoMo webhook endpoint.
// Path: POST /momo/webhook/:provider
func (h *MoMoWebhookHandler) HandleWebhook(c *gin.Context) {
	ctx := c.Request.Context()
	provider := strings.ToLower(c.Param("provider"))

	// Read raw body for HMAC verification
	rawBody, err := io.ReadAll(c.Request.Body)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "cannot read body"})
		return
	}
	c.Request.Body = io.NopCloser(bytes.NewReader(rawBody))

	// 1. Verify HMAC signature
	if !h.verifySignature(provider, rawBody, c.GetHeader("X-Signature"), c.GetHeader("X-MTN-Signature"), c.GetHeader("X-Airtel-Signature")) {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "invalid webhook signature"})
		return
	}

	// 2. Parse payload
	var payload MoMoWebhookPayload
	if err := json.Unmarshal(rawBody, &payload); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid JSON payload"})
		return
	}
	payload.Provider = provider

	// 3. Idempotency check via Redis
	idempKey := fmt.Sprintf("momo:webhook:%s:%s", provider, payload.ExternalRef)
	if _, err := h.redis.Get(ctx, idempKey).Result(); err == nil {
		c.JSON(http.StatusOK, gin.H{"status": "already_processed"})
		return
	}

	// 4. Mark as processed in Redis (TTL 48h)
	_ = h.redis.Set(ctx, idempKey, payload.Status, 48*time.Hour).Err()

	// 5. Determine Kafka topic based on status
	topic := h.resolveTopic(provider, payload.Status)

	// 6. Publish to Kafka
	_ = h.publishKafka(ctx, topic, map[string]interface{}{
		"provider":       provider,
		"externalRef":    payload.ExternalRef,
		"internalRef":    payload.InternalRef,
		"status":         payload.Status,
		"amount":         payload.Amount,
		"currency":       payload.Currency,
		"phoneNumber":    payload.PhoneNumber,
		"financialTxnId": payload.FinancialTxnID,
		"reason":         payload.Reason,
		"timestamp":      time.Now().UTC().Format(time.RFC3339),
	})

	// 7. Publish to Fluvio paygate.momo.events topic
	_ = h.publishFluvio(ctx, "paygate.momo.events", map[string]interface{}{
		"eventType":   "momo_webhook_received",
		"provider":    provider,
		"externalRef": payload.ExternalRef,
		"status":      payload.Status,
		"amount":      payload.Amount,
		"currency":    payload.Currency,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})

	// 8. Dapr pub/sub for downstream services
	if h.daprClient != nil {
		data, _ := json.Marshal(map[string]interface{}{
			"type":        "momo_webhook",
			"provider":    provider,
			"externalRef": payload.ExternalRef,
			"status":      payload.Status,
		})
		_ = h.daprClient.PublishEvent(ctx, "pubsub", "momo-events", data)
	}

	// 9. Notify TypeScript backend to update momo_transactions table
	go h.notifyBackend(payload)

	// 10. Write to Lakehouse
	go h.writeLakehouse(provider, payload)

	c.JSON(http.StatusOK, gin.H{"status": "received", "provider": provider})
}

// ─── Private helpers ──────────────────────────────────────────────────────────

func (h *MoMoWebhookHandler) verifySignature(provider string, body []byte, sigs ...string) bool {
	secret := h.secrets[provider]
	if secret == "" {
		return true // no secret configured — accept all (dev mode)
	}
	mac := hmac.New(sha256.New, []byte(secret))
	mac.Write(body)
	expected := hex.EncodeToString(mac.Sum(nil))
	for _, sig := range sigs {
		if sig == "" {
			continue
		}
		// Strip "sha256=" prefix if present (MTN style)
		sig = strings.TrimPrefix(sig, "sha256=")
		if hmac.Equal([]byte(sig), []byte(expected)) {
			return true
		}
	}
	return false
}

func (h *MoMoWebhookHandler) resolveTopic(provider, status string) string {
	switch strings.ToUpper(status) {
	case "SUCCESSFUL":
		return fmt.Sprintf("paygate.momo.%s.completed", provider)
	case "FAILED":
		return fmt.Sprintf("paygate.momo.%s.failed", provider)
	default:
		return fmt.Sprintf("paygate.momo.%s.pending", provider)
	}
}

func (h *MoMoWebhookHandler) publishKafka(ctx context.Context, topic string, payload map[string]interface{}) error {
	data, _ := json.Marshal(payload)
	return h.kafkaWriter.WriteMessages(ctx, kafka.Message{Topic: topic, Value: data})
}

func (h *MoMoWebhookHandler) publishFluvio(ctx context.Context, topic string, payload map[string]interface{}) error {
	data, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST",
		fmt.Sprintf("%s/topics/%s/produce", h.fluvioURL, topic),
		bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp, err := (&http.Client{Timeout: 3 * time.Second}).Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	return nil
}

func (h *MoMoWebhookHandler) notifyBackend(payload MoMoWebhookPayload) {
	bridgeURL := os.Getenv("MIDDLEWARE_BRIDGE_URL")
	if bridgeURL == "" {
		return
	}
	data, _ := json.Marshal(map[string]interface{}{
		"action":      "momo_webhook_complete",
		"externalRef": payload.ExternalRef,
		"internalRef": payload.InternalRef,
		"provider":    payload.Provider,
		"status":      payload.Status,
		"financialTxnId": payload.FinancialTxnID,
	})
	req, _ := http.NewRequest("POST", bridgeURL+"/internal/momo/webhook-complete", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

func (h *MoMoWebhookHandler) writeLakehouse(provider string, payload MoMoWebhookPayload) {
	bridgeURL := os.Getenv("MIDDLEWARE_BRIDGE_URL")
	if bridgeURL == "" {
		return
	}
	data, _ := json.Marshal(map[string]interface{}{
		"table":       "momo_webhook_audit",
		"provider":    provider,
		"externalRef": payload.ExternalRef,
		"status":      payload.Status,
		"amount":      payload.Amount,
		"currency":    payload.Currency,
		"timestamp":   time.Now().UTC().Format(time.RFC3339),
	})
	req, _ := http.NewRequest("POST", bridgeURL+"/lakehouse/write", bytes.NewReader(data))
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", h.internalKey)
	resp, err := (&http.Client{Timeout: 5 * time.Second}).Do(req)
	if err == nil {
		resp.Body.Close()
	}
}

// RegisterRoutes registers MoMo webhook routes on a gin router group.
func RegisterRoutes(rg *gin.RouterGroup, h *MoMoWebhookHandler) {
	rg.POST("/momo/webhook/:provider", h.HandleWebhook)
}
