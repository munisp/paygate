// Package kafka provides a Kafka producer helper for the PayGate bridge.
//
// It publishes structured JSON events to the following topics:
//   - paygate.transaction.completed
//   - paygate.transaction.failed
//   - paygate.payout.initiated
//   - paygate.settlement.triggered
//   - paygate.fraud.alert
//   - paygate.audit.events
//   - paygate.usdc.payout.settled
//   - paygate.usdc.deposit.received
//
// The producer is initialised lazily on first use. If KAFKA_BOOTSTRAP_SERVERS
// is not set, or the brokers are unreachable, Publish returns an error —
// events are NEVER silently dropped.
package kafka

import (
	"context"
	"crypto/tls"
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	"github.com/IBM/sarama"
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
	TopicUSDCPayoutSettled    = "paygate.usdc.payout.settled"
	TopicUSDCDepositReceived  = "paygate.usdc.deposit.received"
)

// ─── Event types ──────────────────────────────────────────────────────────────

// TransactionEvent is published to paygate.transaction.completed/failed.
type TransactionEvent struct {
	EventID    string    `json:"event_id"`
	EventType  string    `json:"event_type"` // "transaction.completed" | "transaction.failed"
	TxID       string    `json:"tx_id"`
	MerchantID string    `json:"merchant_id"`
	Amount     int64     `json:"amount_kobo"`
	Currency   string    `json:"currency"`
	Channel    string    `json:"channel"`
	Status     string    `json:"status"`
	OccurredAt time.Time `json:"occurred_at"`
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

// USDCPayoutEvent is published to paygate.usdc.payout.settled when a USDC
// payout is confirmed on the Solana blockchain.
type USDCPayoutEvent struct {
	PayoutID        string `json:"payout_id"`
	MerchantID      string `json:"merchant_id"`
	RecipientWallet string `json:"recipient_wallet"`
	AmountLamports  uint64 `json:"amount_lamports"`
	SolanaSignature string `json:"solana_signature"`
	Reference       string `json:"reference"`
	SettledAt       string `json:"settled_at"`
}

// USDCDepositEvent is published to paygate.usdc.deposit.received when a new
// USDC deposit is detected on a platform-monitored Solana wallet.
type USDCDepositEvent struct {
	WalletAddress  string `json:"wallet_address"`
	AmountLamports uint64 `json:"amount_lamports"`
	Signature      string `json:"signature"`
	Slot           uint64 `json:"slot"`
	DetectedAt     string `json:"detected_at"`
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

// Producer is a Kafka message producer backed by a real sarama SyncProducer
// whenever brokers are configured. When Kafka is not configured (or the
// initial connection failed), Publish returns initErr instead of silently
// dropping events.
type Producer struct {
	brokers []string
	enabled bool
	initErr error
	mu      sync.Mutex
	// client is the underlying sarama-backed client (nil in disabled mode)
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

// ErrKafkaNotConfigured is returned by Publish when no Kafka producer is wired.
var ErrKafkaNotConfigured = errors.New("kafka: producer not configured (KAFKA_BOOTSTRAP_SERVERS unset or connection failed)")

// GetProducer returns the global Kafka producer, initialising it on first call.
// If KAFKA_BOOTSTRAP_SERVERS is not set or the brokers cannot be reached, the
// returned producer is disabled and every Publish call fails loudly.
func GetProducer() *Producer {
	producerOnce.Do(func() {
		brokerStr := os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
		if brokerStr == "" {
			slog.Warn("[kafka] KAFKA_BOOTSTRAP_SERVERS not set — all Publish calls will FAIL (no silent drop)")
			globalProducer = &Producer{enabled: false, initErr: ErrKafkaNotConfigured}
			return
		}
		brokers := strings.Split(brokerStr, ",")
		for i, b := range brokers {
			brokers[i] = strings.TrimSpace(b)
		}
		client, err := newSaramaClient(brokers)
		if err != nil {
			slog.Error("[kafka] failed to connect to brokers — all Publish calls will FAIL", "brokers", brokers, "err", err)
			globalProducer = &Producer{
				brokers: brokers,
				enabled: false,
				initErr: fmt.Errorf("kafka: connect %v: %w", brokers, err),
			}
			return
		}
		slog.Info("[kafka] producer initialised (sarama sync producer)", "brokers", brokers)
		globalProducer = &Producer{
			brokers: brokers,
			enabled: true,
			client:  client,
		}
	})
	return globalProducer
}

// Publish serialises the event to JSON and publishes it to the given topic.
// key is used as the Kafka partition key (e.g. merchant_id for ordering).
// Returns an error when the producer is disabled or the broker rejects the
// record — events are never silently dropped.
func (p *Producer) Publish(ctx context.Context, topic, key string, event any) error {
	if !p.enabled || p.client == nil {
		err := p.initErr
		if err == nil {
			err = ErrKafkaNotConfigured
		}
		slog.Error("[kafka] publish rejected — producer disabled", "topic", topic, "err", err)
		return err
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

// PublishUSDCPayout publishes a USDC payout settled event.
func (p *Producer) PublishUSDCPayout(ctx context.Context, evt USDCPayoutEvent) error {
	return p.Publish(ctx, TopicUSDCPayoutSettled, evt.MerchantID, evt)
}

// PublishUSDCDeposit publishes a USDC deposit received event.
func (p *Producer) PublishUSDCDeposit(ctx context.Context, evt USDCDepositEvent) error {
	return p.Publish(ctx, TopicUSDCDepositReceived, evt.WalletAddress, evt)
}

// Close shuts down the producer gracefully.
func (p *Producer) Close() {
	if p.enabled && p.client != nil {
		p.client.Close()
	}
}

// ─── sarama-backed client ────────────────────────────────────────────────────

// newSaramaClient builds a sarama.SyncProducer from broker addresses.
// Optional env: KAFKA_SASL_USERNAME / KAFKA_SASL_PASSWORD (PLAIN),
// KAFKA_TLS_ENABLED=true.
func newSaramaClient(brokers []string) (kafkaClient, error) {
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	cfg.Producer.RequiredAcks = sarama.WaitForAll
	cfg.Producer.Retry.Max = 3
	cfg.Net.DialTimeout = 10 * time.Second
	cfg.Metadata.Timeout = 10 * time.Second

	if user := os.Getenv("KAFKA_SASL_USERNAME"); user != "" {
		cfg.Net.SASL.Enable = true
		cfg.Net.SASL.Mechanism = sarama.SASLTypePlaintext
		cfg.Net.SASL.User = user
		cfg.Net.SASL.Password = os.Getenv("KAFKA_SASL_PASSWORD")
	}
	if os.Getenv("KAFKA_TLS_ENABLED") == "true" {
		cfg.Net.TLS.Enable = true
		cfg.Net.TLS.Config = &tls.Config{MinVersion: tls.VersionTLS12}
	}

	sp, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		return nil, err
	}
	return &saramaClient{sp: sp}, nil
}

type saramaClient struct {
	sp sarama.SyncProducer
}

func (c *saramaClient) ProduceSync(_ context.Context, records ...*Record) ProduceResults {
	results := make(ProduceResults, len(records))
	for i, r := range records {
		msg := &sarama.ProducerMessage{
			Topic: r.Topic,
			Key:   sarama.ByteEncoder(r.Key),
			Value: sarama.ByteEncoder(r.Value),
		}
		_, _, err := c.sp.SendMessage(msg)
		results[i] = ProduceResult{Err: err}
	}
	return results
}

func (c *saramaClient) Close() {
	if err := c.sp.Close(); err != nil {
		slog.Error("[kafka] producer close error", "err", err)
	}
}
