// Package fluvio provides a Fluvio producer for POS terminal events.
// It publishes structured JSON events to Fluvio topics for real-time
// streaming to downstream consumers (analytics, settlement, audit).
package fluvio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"
)

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	TopicTerminalProvisioned  = "paygate.terminal.provisioned"
	TopicTerminalActivated    = "paygate.terminal.activated"
	TopicTerminalHeartbeat    = "paygate.terminal.heartbeat"
	TopicTerminalTxnCompleted = "paygate.terminal.txn_completed"
	TopicTerminalTxnFailed    = "paygate.terminal.txn_failed"
	TopicTerminalRefunded     = "paygate.terminal.refunded"
	TopicTerminalVoided       = "paygate.terminal.voided"
	TopicTerminalStatusChange = "paygate.terminal.status_changed"
	TopicTerminalAll          = "paygate.terminal.events" // fan-out topic
)

// ─── Event types ──────────────────────────────────────────────────────────────

type TerminalEventType string

const (
	EventProvisioned  TerminalEventType = "provisioned"
	EventActivated    TerminalEventType = "activated"
	EventHeartbeat    TerminalEventType = "heartbeat"
	EventTxnCompleted TerminalEventType = "txn_completed"
	EventTxnFailed    TerminalEventType = "txn_failed"
	EventRefunded     TerminalEventType = "refunded"
	EventVoided       TerminalEventType = "voided"
	EventStatusChange TerminalEventType = "status_changed"
)

// TerminalEvent is the canonical envelope for all terminal Fluvio events.
type TerminalEvent struct {
	EventID      string            `json:"event_id"`
	EventType    TerminalEventType `json:"event_type"`
	TerminalID   string            `json:"terminal_id"`
	SerialNumber string            `json:"serial_number"`
	MerchantID   string            `json:"merchant_id"`
	TenantID     string            `json:"tenant_id"`
	Timestamp    time.Time         `json:"timestamp"`
	Payload      any               `json:"payload"`
}

type ProvisionedPayload struct {
	Model    string `json:"model"`
	Label    string `json:"label,omitempty"`
	Location string `json:"location,omitempty"`
}

type HeartbeatPayload struct {
	FirmwareVersion string `json:"firmware_version,omitempty"`
	IPAddress       string `json:"ip_address,omitempty"`
	Status          string `json:"status"`
}

type TxnPayload struct {
	TransactionID string `json:"transaction_id"`
	Reference     string `json:"reference"`
	Type          string `json:"type"` // sale | refund | void | pre_auth
	PaymentMethod string `json:"payment_method"`
	CardBrand     string `json:"card_brand,omitempty"`
	CardLast4     string `json:"card_last4,omitempty"`
	AmountKobo    int64  `json:"amount_kobo"`
	Currency      string `json:"currency"`
	AuthCode      string `json:"auth_code,omitempty"`
	RRN           string `json:"rrn,omitempty"`
	ResponseCode  string `json:"response_code,omitempty"`
}

type RefundPayload struct {
	RefundID      string `json:"refund_id"`
	OriginalTxnID string `json:"original_txn_id"`
	AmountKobo    int64  `json:"amount_kobo"`
	Currency      string `json:"currency"`
	Reference     string `json:"reference"`
}

type StatusChangePayload struct {
	OldStatus string `json:"old_status"`
	NewStatus string `json:"new_status"`
	Reason    string `json:"reason,omitempty"`
}

// ─── Producer ─────────────────────────────────────────────────────────────────

// TerminalProducer publishes terminal events to Fluvio via the Fluvio HTTP
// proxy sidecar (fluvio-http-proxy). Falls back to Kafka bridge if Fluvio
// is unavailable.
type TerminalProducer struct {
	fluvioEndpoint string
	kafkaBridgeURL string
	httpClient     *http.Client
}

func NewTerminalProducer() *TerminalProducer {
	return &TerminalProducer{
		fluvioEndpoint: getEnv("FLUVIO_ENDPOINT", "http://localhost:9003"),
		kafkaBridgeURL: getEnv("MIDDLEWARE_BRIDGE_URL", ""),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
	}
}

// Produce publishes a TerminalEvent to the specified Fluvio topic.
// It also fans out to the aggregate topic paygate.terminal.events.
func (p *TerminalProducer) Produce(ctx context.Context, topic string, event TerminalEvent) error {
	data, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("terminal producer: marshal event: %w", err)
	}

	// Try Fluvio first
	if err := p.publishToFluvio(ctx, topic, data); err != nil {
		// Fallback to Kafka bridge
		if fallbackErr := p.publishToKafkaBridge(ctx, topic, data); fallbackErr != nil {
			return fmt.Errorf("terminal producer: both Fluvio and Kafka bridge failed: fluvio=%v kafka=%v", err, fallbackErr)
		}
	}

	// Fan-out to aggregate topic (best-effort, non-blocking)
	go func() {
		_ = p.publishToFluvio(context.Background(), TopicTerminalAll, data)
	}()

	return nil
}

func (p *TerminalProducer) publishToFluvio(ctx context.Context, topic string, data []byte) error {
	url := fmt.Sprintf("%s/produce/%s", p.fluvioEndpoint, topic)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("fluvio returned %d", resp.StatusCode)
	}
	return nil
}

func (p *TerminalProducer) publishToKafkaBridge(ctx context.Context, topic string, data []byte) error {
	if p.kafkaBridgeURL == "" {
		return fmt.Errorf("no kafka bridge URL configured")
	}
	body, _ := json.Marshal(map[string]any{"topic": topic, "payload": json.RawMessage(data)})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, p.kafkaBridgeURL+"/kafka/publish", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", os.Getenv("MIDDLEWARE_INTERNAL_KEY"))
	resp, err := p.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// ─── Convenience constructors ─────────────────────────────────────────────────

func NewTerminalEvent(eventType TerminalEventType, terminalID, serial, merchantID, tenantID string, payload any) TerminalEvent {
	return TerminalEvent{
		EventID:      fmt.Sprintf("tevt_%d", time.Now().UnixNano()),
		EventType:    eventType,
		TerminalID:   terminalID,
		SerialNumber: serial,
		MerchantID:   merchantID,
		TenantID:     tenantID,
		Timestamp:    time.Now().UTC(),
		Payload:      payload,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
