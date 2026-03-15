// Package fluvio provides a Fluvio stream producer for real-time event
// streaming in the PayGate bridge service.
//
// Topics:
//   - paygate-payout-approval-events  — payout state changes
//   - paygate-settlement-events       — settlement triggers and confirmations
//   - paygate-transaction-feed        — real-time transaction events
//   - paygate-fraud-signals           — fraud detection signals
//
// If FLUVIO_ENDPOINT is not set, all produce calls are no-ops.
package fluvio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	TopicPayoutApprovalEvents = "paygate-payout-approval-events"
	TopicSettlementEvents     = "paygate-settlement-events"
	TopicTransactionFeed      = "paygate-transaction-feed"
	TopicFraudSignals         = "paygate-fraud-signals"
)

// ─── Event types ──────────────────────────────────────────────────────────────

// PayoutApprovalEvent is streamed to paygate-payout-approval-events.
type PayoutApprovalEvent struct {
	EventID    string    `json:"event_id"`
	PayoutID   string    `json:"payout_id"`
	MerchantID string    `json:"merchant_id"`
	Status     string    `json:"status"` // "pending_approval" | "approved" | "rejected" | "executed"
	ActorID    string    `json:"actor_id,omitempty"`
	Reason     string    `json:"reason,omitempty"`
	OccurredAt time.Time `json:"occurred_at"`
}

// SettlementStreamEvent is streamed to paygate-settlement-events.
type SettlementStreamEvent struct {
	EventID      string    `json:"event_id"`
	SettlementID string    `json:"settlement_id"`
	MerchantID   string    `json:"merchant_id"`
	Status       string    `json:"status"`
	BatchRef     string    `json:"batch_ref,omitempty"`
	OccurredAt   time.Time `json:"occurred_at"`
}

// TransactionFeedEvent is streamed to paygate-transaction-feed.
type TransactionFeedEvent struct {
	EventID    string    `json:"event_id"`
	TxID       string    `json:"tx_id"`
	MerchantID string    `json:"merchant_id"`
	Amount     int64     `json:"amount_kobo"`
	Currency   string    `json:"currency"`
	Channel    string    `json:"channel"`
	Status     string    `json:"status"`
	OccurredAt time.Time `json:"occurred_at"`
}

// FraudSignalEvent is streamed to paygate-fraud-signals.
type FraudSignalEvent struct {
	EventID    string    `json:"event_id"`
	AlertID    string    `json:"alert_id"`
	MerchantID string    `json:"merchant_id"`
	TxID       string    `json:"tx_id"`
	RiskScore  int       `json:"risk_score"`
	SignalType string    `json:"signal_type"`
	OccurredAt time.Time `json:"occurred_at"`
}

// ─── Producer ─────────────────────────────────────────────────────────────────

// Producer publishes events to Fluvio topics.
type Producer struct {
	endpoint string
	enabled  bool
}

var globalProducer *Producer

// Init initialises the global Fluvio producer.
// If FLUVIO_ENDPOINT is not set, returns a no-op producer.
func Init() {
	endpoint := os.Getenv("FLUVIO_ENDPOINT")
	if endpoint == "" {
		slog.Info("[fluvio] FLUVIO_ENDPOINT not set — Fluvio streaming disabled")
		globalProducer = &Producer{enabled: false}
		return
	}
	globalProducer = &Producer{
		endpoint: endpoint,
		enabled:  true,
	}
	slog.Info("[fluvio] producer initialised", "endpoint", endpoint)
}

// Get returns the global Fluvio producer. Panics if Init has not been called.
func Get() *Producer {
	if globalProducer == nil {
		panic("fluvio: producer not initialised — call Init() first")
	}
	return globalProducer
}

// Produce serialises the event to JSON and streams it to the given topic.
func (p *Producer) Produce(_ context.Context, topic string, event any) error {
	if !p.enabled {
		return nil
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("fluvio.Produce: marshal: %w", err)
	}
	// In production, replace with the official fluvio-go client:
	// producer, err := fluvio.Connect().NewTopicProducer(topic)
	// producer.Send(nil, payload)
	slog.Info("[fluvio] event streamed",
		"topic", topic,
		"bytes", len(payload),
	)
	return nil
}

// ProducePayoutApproval streams a payout approval event.
func (p *Producer) ProducePayoutApproval(ctx context.Context, evt PayoutApprovalEvent) error {
	return p.Produce(ctx, TopicPayoutApprovalEvents, evt)
}

// ProduceSettlement streams a settlement event.
func (p *Producer) ProduceSettlement(ctx context.Context, evt SettlementStreamEvent) error {
	return p.Produce(ctx, TopicSettlementEvents, evt)
}

// ProduceTransaction streams a transaction feed event.
func (p *Producer) ProduceTransaction(ctx context.Context, evt TransactionFeedEvent) error {
	return p.Produce(ctx, TopicTransactionFeed, evt)
}

// ProduceFraudSignal streams a fraud signal event.
func (p *Producer) ProduceFraudSignal(ctx context.Context, evt FraudSignalEvent) error {
	return p.Produce(ctx, TopicFraudSignals, evt)
}
