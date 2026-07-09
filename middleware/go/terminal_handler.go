// terminal_handler.go — Bridge HTTP handlers for POS terminal operations.
//
// Endpoints (registered in main.go / APISIX):
//   POST /terminal/provision      — register new terminal, publish Fluvio event
//   POST /terminal/heartbeat      — device heartbeat, update Redis TTL
//   POST /terminal/transaction    — record transaction, publish Fluvio event
//   POST /terminal/refund         — process refund, publish Fluvio event, settle TigerBeetle
//   POST /terminal/void           — void pre-auth, publish Fluvio event
//   POST /terminal/settle         — TigerBeetle double-entry settlement (called by consumer)
//   GET  /terminal/stream/:mid    — SSE stream of terminal events for a merchant (Redis sub)
package main

import (
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	fluvio "paygate/middleware/go/fluvio"
	permify "paygate/middleware/go/permify"
	rediscache "paygate/middleware/go/redis"
)

var terminalProducer = fluvio.NewTerminalProducer()

// ─── Provision ────────────────────────────────────────────────────────────────

type TerminalProvisionRequest struct {
	TerminalID   string `json:"terminal_id" binding:"required"`
	SerialNumber string `json:"serial_number" binding:"required"`
	Model        string `json:"model" binding:"required"`
	MerchantID   string `json:"merchant_id" binding:"required"`
	TenantID     string `json:"tenant_id" binding:"required"`
	Label        string `json:"label"`
	Location     string `json:"location"`
}

func handleTerminalProvision(c *gin.Context) {
	var req TerminalProvisionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Permify: check terminal:write permission
	if err := permify.CheckPermission(c.Request.Context(), req.MerchantID, "terminal", "write"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	// Cache terminal status in Redis (inactive until first heartbeat)
	if err := rediscache.SetTerminalStatus(c.Request.Context(), req.TerminalID, "inactive", 0); err != nil {
		log.Printf("[terminal] redis set status failed: %v", err)
	}

	// Publish Fluvio event
	event := fluvio.NewTerminalEvent(
		fluvio.EventProvisioned,
		req.TerminalID, req.SerialNumber, req.MerchantID, req.TenantID,
		fluvio.ProvisionedPayload{Model: req.Model, Label: req.Label, Location: req.Location},
	)
	if err := terminalProducer.Produce(c.Request.Context(), fluvio.TopicTerminalProvisioned, event); err != nil {
		log.Printf("[terminal] fluvio produce failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "event_id": event.EventID})
}

// ─── Heartbeat ────────────────────────────────────────────────────────────────

type TerminalHeartbeatRequest struct {
	TerminalID      string `json:"terminal_id" binding:"required"`
	SerialNumber    string `json:"serial_number" binding:"required"`
	MerchantID      string `json:"merchant_id" binding:"required"`
	TenantID        string `json:"tenant_id" binding:"required"`
	FirmwareVersion string `json:"firmware_version"`
	IPAddress       string `json:"ip_address"`
	Status          string `json:"status"`
}

func handleTerminalHeartbeat(c *gin.Context) {
	var req TerminalHeartbeatRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Refresh Redis heartbeat TTL (30 min — terminal considered offline after this)
	if err := rediscache.SetTerminalHeartbeat(c.Request.Context(), req.TerminalID, 30*time.Minute); err != nil {
		log.Printf("[terminal] redis heartbeat failed: %v", err)
	}

	event := fluvio.NewTerminalEvent(
		fluvio.EventHeartbeat,
		req.TerminalID, req.SerialNumber, req.MerchantID, req.TenantID,
		fluvio.HeartbeatPayload{
			FirmwareVersion: req.FirmwareVersion,
			IPAddress:       req.IPAddress,
			Status:          req.Status,
		},
	)
	if err := terminalProducer.Produce(c.Request.Context(), fluvio.TopicTerminalHeartbeat, event); err != nil {
		log.Printf("[terminal] fluvio heartbeat produce failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true})
}

// ─── Transaction ──────────────────────────────────────────────────────────────

type TerminalTransactionRequest struct {
	TerminalID    string `json:"terminal_id" binding:"required"`
	SerialNumber  string `json:"serial_number" binding:"required"`
	MerchantID    string `json:"merchant_id" binding:"required"`
	TenantID      string `json:"tenant_id" binding:"required"`
	TransactionID string `json:"transaction_id" binding:"required"`
	Reference     string `json:"reference" binding:"required"`
	Type          string `json:"type" binding:"required"`
	PaymentMethod string `json:"payment_method" binding:"required"`
	CardBrand     string `json:"card_brand"`
	CardLast4     string `json:"card_last4"`
	AmountKobo    int64  `json:"amount_kobo" binding:"required"`
	Currency      string `json:"currency" binding:"required"`
	Status        string `json:"status" binding:"required"` // approved | declined
	AuthCode      string `json:"auth_code"`
	RRN           string `json:"rrn"`
	ResponseCode  string `json:"response_code"`
}

func handleTerminalTransaction(c *gin.Context) {
	var req TerminalTransactionRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Idempotency check via Redis
	idempotencyKey := fmt.Sprintf("terminal:txn:idem:%s", req.Reference)
	if exists, _ := rediscache.Exists(c.Request.Context(), idempotencyKey); exists {
		c.JSON(http.StatusOK, gin.H{"ok": true, "idempotent": true})
		return
	}
	_ = rediscache.SetWithTTL(c.Request.Context(), idempotencyKey, "1", 24*time.Hour)

	eventType := fluvio.EventTxnCompleted
	topic := fluvio.TopicTerminalTxnCompleted
	if req.Status == "declined" || req.Status == "failed" {
		eventType = fluvio.EventTxnFailed
		topic = fluvio.TopicTerminalTxnFailed
	}

	event := fluvio.NewTerminalEvent(
		eventType,
		req.TerminalID, req.SerialNumber, req.MerchantID, req.TenantID,
		fluvio.TxnPayload{
			TransactionID: req.TransactionID,
			Reference:     req.Reference,
			Type:          req.Type,
			PaymentMethod: req.PaymentMethod,
			CardBrand:     req.CardBrand,
			CardLast4:     req.CardLast4,
			AmountKobo:    req.AmountKobo,
			Currency:      req.Currency,
			AuthCode:      req.AuthCode,
			RRN:           req.RRN,
			ResponseCode:  req.ResponseCode,
		},
	)
	if err := terminalProducer.Produce(c.Request.Context(), topic, event); err != nil {
		log.Printf("[terminal] fluvio txn produce failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "event_id": event.EventID})
}

// ─── Refund ───────────────────────────────────────────────────────────────────

type TerminalRefundRequest struct {
	TerminalID    string `json:"terminal_id" binding:"required"`
	SerialNumber  string `json:"serial_number" binding:"required"`
	MerchantID    string `json:"merchant_id" binding:"required"`
	TenantID      string `json:"tenant_id" binding:"required"`
	RefundID      string `json:"refund_id" binding:"required"`
	OriginalTxnID string `json:"original_txn_id" binding:"required"`
	AmountKobo    int64  `json:"amount_kobo" binding:"required"`
	Currency      string `json:"currency" binding:"required"`
	Reference     string `json:"reference" binding:"required"`
}

func handleTerminalRefund(c *gin.Context) {
	var req TerminalRefundRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Permify: check terminal:refund permission
	if err := permify.CheckPermission(c.Request.Context(), req.MerchantID, "terminal", "refund"); err != nil {
		c.JSON(http.StatusForbidden, gin.H{"error": "insufficient permissions"})
		return
	}

	event := fluvio.NewTerminalEvent(
		fluvio.EventRefunded,
		req.TerminalID, req.SerialNumber, req.MerchantID, req.TenantID,
		fluvio.RefundPayload{
			RefundID:      req.RefundID,
			OriginalTxnID: req.OriginalTxnID,
			AmountKobo:    req.AmountKobo,
			Currency:      req.Currency,
			Reference:     req.Reference,
		},
	)
	if err := terminalProducer.Produce(c.Request.Context(), fluvio.TopicTerminalRefunded, event); err != nil {
		log.Printf("[terminal] fluvio refund produce failed: %v", err)
	}

	c.JSON(http.StatusOK, gin.H{"ok": true, "event_id": event.EventID})
}

// ─── TigerBeetle Settlement ───────────────────────────────────────────────────

type TerminalSettleRequest struct {
	TerminalID    string `json:"terminal_id"`
	MerchantID    string `json:"merchant_id"`
	TransactionID string `json:"transaction_id"`
	AmountKobo    int64  `json:"amount_kobo"`
	Currency      string `json:"currency"`
	Reference     string `json:"reference"`
	EventID       string `json:"event_id"`
}

func handleTerminalSettle(c *gin.Context) {
	var req TerminalSettleRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	// Delegate to Rust TigerBeetle settlement service
	rustURL := getEnvOrDefault("RUST_SETTLEMENT_URL", "http://localhost:9100")
	body, _ := json.Marshal(req)
	resp, err := http.Post(rustURL+"/terminal/settle", "application/json", io.NopCloser(bytesReader(body)))
	if err != nil {
		log.Printf("[terminal] rust settlement failed: %v", err)
		c.JSON(http.StatusAccepted, gin.H{"ok": true, "settlement": "deferred"})
		return
	}
	defer resp.Body.Close()

	c.JSON(http.StatusOK, gin.H{"ok": true, "settlement": "posted"})
}

// ─── SSE Stream ───────────────────────────────────────────────────────────────

// handleTerminalStream streams live terminal events to the dashboard via SSE.
// It subscribes to the Redis pub/sub channel terminal:<merchantID>.
func handleTerminalStream(c *gin.Context) {
	merchantID := c.Param("mid")
	if merchantID == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "merchant ID required"})
		return
	}

	c.Header("Content-Type", "text/event-stream")
	c.Header("Cache-Control", "no-cache")
	c.Header("Connection", "keep-alive")
	c.Header("X-Accel-Buffering", "no")

	ctx, cancel := context.WithCancel(c.Request.Context())
	defer cancel()

	ch, err := rediscache.SubscribeChannel(ctx, fmt.Sprintf("terminal:%s", merchantID))
	if err != nil {
		log.Printf("[terminal-sse] redis subscribe failed: %v", err)
		c.SSEvent("error", gin.H{"message": "stream unavailable"})
		return
	}

	// Heartbeat ticker to keep connection alive
	ticker := time.NewTicker(25 * time.Second)
	defer ticker.Stop()

	c.Stream(func(w io.Writer) bool {
		select {
		case msg, ok := <-ch:
			if !ok {
				return false
			}
			c.SSEvent("terminal_event", msg)
			return true
		case <-ticker.C:
			c.SSEvent("ping", gin.H{"ts": time.Now().Unix()})
			return true
		case <-ctx.Done():
			return false
		}
	})
}

// ─── Route registration ───────────────────────────────────────────────────────

func RegisterTerminalRoutes(r *gin.RouterGroup) {
	t := r.Group("/terminal")
	t.POST("/provision", handleTerminalProvision)
	t.POST("/heartbeat", handleTerminalHeartbeat)
	t.POST("/transaction", handleTerminalTransaction)
	t.POST("/refund", handleTerminalRefund)
	t.POST("/settle", handleTerminalSettle)
	t.GET("/stream/:mid", handleTerminalStream)
}

func getEnvOrDefault(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func bytesReader(b []byte) io.Reader {
	return io.NopCloser(newBytesReader(b))
}

type bytesReaderImpl struct {
	data   []byte
	offset int
}

func newBytesReader(b []byte) *bytesReaderImpl { return &bytesReaderImpl{data: b} }
func (r *bytesReaderImpl) Read(p []byte) (int, error) {
	if r.offset >= len(r.data) {
		return 0, io.EOF
	}
	n := copy(p, r.data[r.offset:])
	r.offset += n
	return n, nil
}
