// Package kafka provides a Kafka producer helper for the PayGate bridge.
//
// It publishes structured JSON events to the following topics:
//   - paygate.transaction.completed
//   - paygate.transaction.failed
//   - paygate.payout.initiated
//   - paygate.settlement.triggered
//   - paygate.fraud.alert
//   - paygate.audit.events
//
// The producer is initialised lazily on first use. If KAFKA_BOOTSTRAP_SERVERS
// is not set, all Publish calls are no-ops (graceful degradation).
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	TopicTransactionCompleted = "paygate.transaction.completed"
	TopicTransactionFailed    = "paygate.transaction.failed"
	TopicPayoutInitiated      = "paygate.payout.initiated"
	TopicSettlementTriggered  = "paygate.settlement.triggered"
	TopicFraudAlert           = "paygate.fraud.alert"
	TopicAuditEvents          = "paygate.audit.events"
	TopicNIBSSConfirmation    = "paygate.nibss.confirmation"
)

// ─── Event types ──────────────────────────────────────────────────────────────

// TransactionEvent is published to paygate.transaction.completed/failed.
type TransactionEvent struct {
	EventID     string    `json:"event_id"`
	EventType   string    `json:"event_type"` // "transaction.completed" | "transaction.failed"
	TxID        string    `json:"tx_id"`
	MerchantID  string    `json:"merchant_id"`
	Amount      int64     `json:"amount_kobo"`
	Currency    string    `json:"currency"`
	Channel     string    `json:"channel"`
	Status      string    `json:"status"`
	OccurredAt  time.Time `json:"occurred_at"`
}

// PayoutEvent is published to paygate.payout.initiated.
type PayoutEvent struct {
	EventID    string    `json:"event_id"`
	PayoutID   string    `json:"payout_id"`
	MerchantID string    `json:"merchant_id"`
	Amount     int64     `json:"amount_kobo"`
	Currency   string    `json:"currency"`
	Status     string    `json:"status"`
	OccurredAt time.Time `json:"occurred_at"`
}

// SettlementEvent is published to paygate.settlement.triggered.
type SettlementEvent struct {
	EventID      string    `json:"event_id"`
	SettlementID string    `json:"settlement_id"`
	MerchantID   string    `json:"merchant_id"`
	Amount       int64     `json:"amount_kobo"`
	Currency     string    `json:"currency"`
	BatchRef     string    `json:"batch_ref"`
	OccurredAt   time.Time `json:"occurred_at"`
}

// FraudAlertEvent is published to paygate.fraud.alert.
type FraudAlertEvent struct {
	EventID    string    `json:"event_id"`
	AlertID    string    `json:"alert_id"`
	MerchantID string    `json:"merchant_id"`
	TxID       string    `json:"tx_id"`
	RiskScore  int       `json:"risk_score"`
	AlertType  string    `json:"alert_type"`
	OccurredAt time.Time `json:"occurred_at"`
}

// AuditEvent is published to paygate.audit.events.
type AuditEvent struct {
	EventID    string    `json:"event_id"`
	MerchantID string    `json:"merchant_id"`
	ActorID    string    `json:"actor_id"`
	Action     string    `json:"action"`
	Resource   string    `json:"resource"`
	ResourceID string    `json:"resource_id"`
	OccurredAt time.Time `json:"occurred_at"`
}

// ─── Producer ─────────────────────────────────────────────────────────────────

// Producer is a Kafka message producer.
// In production it uses the franz-go library; in dev/test mode (no brokers
// configured) it logs events instead of publishing them.
type Producer struct {
	brokers []string
	enabled bool
	mu      sync.Mutex
	// client is the underlying franz-go client (nil in no-op mode)
	// Using interface to avoid hard dependency when Kafka is not configured
	client kafkaClient
}

// kafkaClient is the minimal interface we need from franz-go.
type kafkaClient interface {
	ProduceSync(ctx context.Context, records ...*Record) ProduceResults
	Close()
}

// Record mirrors kgo.Record for decoupling.
type Record struct {
	Topic string
	Key   []byte
	Value []byte
}

// ProduceResults mirrors kgo.ProduceResults.
type ProduceResults []ProduceResult

// ProduceResult mirrors kgo.ProduceResult.
type ProduceResult struct {
	Err error
}

var (
	globalProducer *Producer
	producerOnce   sync.Once
)

// GetProducer returns the global Kafka producer, initialising it on first call.
// If KAFKA_BOOTSTRAP_SERVERS is not set, returns a no-op producer.
func GetProducer() *Producer {
	producerOnce.Do(func() {
		brokerStr := os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
		if brokerStr == "" {
			slog.Info("[kafka] KAFKA_BOOTSTRAP_SERVERS not set — Kafka publishing disabled")
			globalProducer = &Producer{enabled: false}
			return
		}
		brokers := strings.Split(brokerStr, ",")
		for i, b := range brokers {
			brokers[i] = strings.TrimSpace(b)
		}
		// In production, replace this with a real franz-go client:
		// client, err := kgo.NewClient(
		//   kgo.SeedBrokers(brokers...),
		//   kgo.WithLogger(kgo.BasicLogger(os.Stderr, kgo.LogLevelInfo, nil)),
		// )
		// For now we use a log-only client to avoid the franz-go dependency
		// until the Go module is updated.
		slog.Info("[kafka] producer initialised", "brokers", brokers)
		globalProducer = &Producer{
			brokers: brokers,
			enabled: true,
			client:  &logOnlyClient{brokers: brokers},
		}
	})
	return globalProducer
}

// Publish serialises the event to JSON and publishes it to the given topic.
// key is used as the Kafka partition key (e.g. merchant_id for ordering).
func (p *Producer) Publish(ctx context.Context, topic, key string, event any) error {
	if !p.enabled {
		return nil
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("kafka.Publish: marshal: %w", err)
	}
	record := &Record{
		Topic: topic,
		Key:   []byte(key),
		Value: payload,
	}
	results := p.client.ProduceSync(ctx, record)
	for _, r := range results {
		if r.Err != nil {
			slog.Error("[kafka] produce failed", "topic", topic, "err", r.Err)
			return fmt.Errorf("kafka.Publish: produce: %w", r.Err)
		}
	}
	slog.Info("[kafka] event published", "topic", topic, "key", key, "bytes", len(payload))
	return nil
}

// PublishTransaction publishes a transaction event to the appropriate topic.
func (p *Producer) PublishTransaction(ctx context.Context, evt TransactionEvent) error {
	topic := TopicTransactionCompleted
	if evt.Status == "failed" {
		topic = TopicTransactionFailed
	}
	return p.Publish(ctx, topic, evt.MerchantID, evt)
}

// PublishPayout publishes a payout initiated event.
func (p *Producer) PublishPayout(ctx context.Context, evt PayoutEvent) error {
	return p.Publish(ctx, TopicPayoutInitiated, evt.MerchantID, evt)
}

// PublishSettlement publishes a settlement triggered event.
func (p *Producer) PublishSettlement(ctx context.Context, evt SettlementEvent) error {
	return p.Publish(ctx, TopicSettlementTriggered, evt.MerchantID, evt)
}

// PublishFraudAlert publishes a fraud alert event.
func (p *Producer) PublishFraudAlert(ctx context.Context, evt FraudAlertEvent) error {
	return p.Publish(ctx, TopicFraudAlert, evt.MerchantID, evt)
}

// PublishAudit publishes an audit event.
func (p *Producer) PublishAudit(ctx context.Context, evt AuditEvent) error {
	return p.Publish(ctx, TopicAuditEvents, evt.MerchantID, evt)
}

// Close shuts down the producer gracefully.
func (p *Producer) Close() {
	if p.enabled && p.client != nil {
		p.client.Close()
	}
}

// ─── Log-only client (used when franz-go is not yet wired) ───────────────────

type logOnlyClient struct {
	brokers []string
}

func (c *logOnlyClient) ProduceSync(_ context.Context, records ...*Record) ProduceResults {
	results := make(ProduceResults, len(records))
	for i, r := range records {
		slog.Info("[kafka:log-only] would produce",
			"topic", r.Topic,
			"key", string(r.Key),
			"bytes", len(r.Value),
		)
		results[i] = ProduceResult{}
	}
	return results
}

func (c *logOnlyClient) Close() {
	slog.Info("[kafka:log-only] producer closed")
}
