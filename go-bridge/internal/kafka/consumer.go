// Package kafka — consumer.go
//
// Provides a Kafka consumer group that processes inbound events from
// external systems (NIBSS confirmations, Mojaloop callbacks, fraud signals).
//
// Topics consumed:
//   - paygate.nibss.confirmation   — NIBSS NIP transfer confirmations
//   - paygate.fraud.alert          — Fraud signals from ML scoring service
//   - paygate.mojaloop.callback    — Mojaloop transfer state callbacks
//   - paygate.settlement.confirmed — Settlement confirmation from clearing house
//
// Usage:
//
//	consumer := kafka.NewConsumer("paygate-bridge-group")
//	consumer.RegisterHandler(kafka.TopicNIBSSConfirmation, handleNIBSS)
//	go consumer.Start(ctx)
package kafka

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

// ─── lazy DB helper ───────────────────────────────────────────────────────────

var (
	_kafkaDB     *sql.DB
	_kafkaDBOnce sync.Once
)

func getKafkaDB() *sql.DB {
	_kafkaDBOnce.Do(func() {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			return
		}
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			slog.Warn("[kafka-consumer] DB open error", "err", err)
			return
		}
		db.SetMaxOpenConns(5)
		db.SetMaxIdleConns(2)
		db.SetConnMaxLifetime(5 * time.Minute)
		_kafkaDB = db
	})
	return _kafkaDB
}

// ─── Handler types ────────────────────────────────────────────────────────────

// MessageHandler is a function that processes a Kafka message.
type MessageHandler func(ctx context.Context, key string, value []byte) error

// ─── Consumer ─────────────────────────────────────────────────────────────────

// Consumer is a Kafka consumer group client.
// In production, replace the polling stub with a real Kafka consumer library
// (e.g. confluent-kafka-go or sarama).
type Consumer struct {
	groupID  string
	brokers  []string
	handlers map[string]MessageHandler
	enabled  bool
	mu       sync.RWMutex
}

// NewConsumer creates a new Kafka consumer for the given consumer group.
func NewConsumer(groupID string) *Consumer {
	brokerStr := os.Getenv("KAFKA_BOOTSTRAP_SERVERS")
	enabled := brokerStr != ""

	if !enabled {
		slog.Info("[kafka-consumer] KAFKA_BOOTSTRAP_SERVERS not set — consumer disabled (dev mode)",
			"group", groupID)
	}

	return &Consumer{
		groupID:  groupID,
		brokers:  strings.Split(brokerStr, ","),
		handlers: make(map[string]MessageHandler),
		enabled:  enabled,
	}
}

// RegisterHandler registers a handler for a specific topic.
func (c *Consumer) RegisterHandler(topic string, handler MessageHandler) {
	c.mu.Lock()
	defer c.mu.Unlock()
	c.handlers[topic] = handler
	slog.Info("[kafka-consumer] handler registered", "topic", topic, "group", c.groupID)
}

// Start begins consuming messages. It blocks until the context is cancelled.
// In production this should use a real Kafka consumer library.
func (c *Consumer) Start(ctx context.Context) {
	if !c.enabled {
		slog.Info("[kafka-consumer] not started — no brokers configured", "group", c.groupID)
		<-ctx.Done()
		return
	}

	c.mu.RLock()
	topics := make([]string, 0, len(c.handlers))
	for t := range c.handlers {
		topics = append(topics, t)
	}
	c.mu.RUnlock()

	slog.Info("[kafka-consumer] starting",
		"group", c.groupID,
		"brokers", c.brokers,
		"topics", topics,
	)

	// Production implementation note:
	// Replace this polling stub with a real Kafka consumer:
	//
	//   cfg := sarama.NewConfig()
	//   cfg.Consumer.Group.Rebalance.Strategy = sarama.BalanceStrategyRoundRobin
	//   cfg.Consumer.Offsets.Initial = sarama.OffsetNewest
	//   client, err := sarama.NewConsumerGroup(c.brokers, c.groupID, cfg)
	//   ...
	//
	// For now, we simulate message receipt with a ticker to demonstrate
	// the handler dispatch pattern.
	ticker := time.NewTicker(30 * time.Second)
	defer ticker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("[kafka-consumer] stopping", "group", c.groupID)
			return
		case <-ticker.C:
			slog.Debug("[kafka-consumer] poll heartbeat", "group", c.groupID, "topics", topics)
		}
	}
}

// Dispatch manually dispatches a message to the registered handler.
// Useful for webhook-to-Kafka bridges and testing.
func (c *Consumer) Dispatch(ctx context.Context, topic string, key string, value []byte) error {
	c.mu.RLock()
	handler, ok := c.handlers[topic]
	c.mu.RUnlock()

	if !ok {
		return fmt.Errorf("kafka-consumer: no handler for topic %q", topic)
	}

	return handler(ctx, key, value)
}

// ─── Built-in event handlers ──────────────────────────────────────────────────

// HandleNIBSSConfirmation processes NIBSS NIP confirmation events.
func HandleNIBSSConfirmation(ctx context.Context, key string, value []byte) error {
	var event struct {
		SessionID     string    `json:"session_id"`
		TransactionID string    `json:"transaction_id"`
		Status        string    `json:"status"`
		ResponseCode  string    `json:"response_code"`
		Amount        int64     `json:"amount_kobo"`
		Narration     string    `json:"narration"`
		OccurredAt    time.Time `json:"occurred_at"`
	}
	if err := json.Unmarshal(value, &event); err != nil {
		return fmt.Errorf("kafka: decode NIBSS confirmation: %w", err)
	}
	slog.Info("[kafka-consumer] NIBSS confirmation received",
		"session_id", event.SessionID,
		"tx_id", event.TransactionID,
		"status", event.Status,
		"amount_kobo", event.Amount,
	)
	// Update transaction status in DB based on event.Status
	if db := getKafkaDB(); db != nil && event.TransactionID != "" {
		dbStatus := "failed"
		if event.Status == "00" || event.Status == "success" || event.Status == "completed" {
			dbStatus = "completed"
		}
		_, err := db.ExecContext(ctx,
			`UPDATE transactions SET status = $1, updated_at = NOW() WHERE id = $2`,
			dbStatus, event.TransactionID,
		)
		if err != nil {
			slog.Warn("[kafka-consumer] NIBSS: failed to update transaction status", "err", err, "tx_id", event.TransactionID)
		} else {
			slog.Info("[kafka-consumer] NIBSS: transaction status updated", "tx_id", event.TransactionID, "status", dbStatus)
		}
	}
	return nil
}

// HandleMojalooopCallback processes Mojaloop transfer state callbacks.
func HandleMojalooopCallback(ctx context.Context, key string, value []byte) error {
	var event struct {
		TransferID string    `json:"transfer_id"`
		State      string    `json:"transfer_state"`
		Amount     string    `json:"amount"`
		Currency   string    `json:"currency"`
		OccurredAt time.Time `json:"occurred_at"`
	}
	if err := json.Unmarshal(value, &event); err != nil {
		return fmt.Errorf("kafka: decode Mojaloop callback: %w", err)
	}
	slog.Info("[kafka-consumer] Mojaloop callback received",
		"transfer_id", event.TransferID,
		"state", event.State,
		"amount", event.Amount,
		"currency", event.Currency,
	)
	// Update cross-border transfer status in DB
	if db := getKafkaDB(); db != nil && event.TransferID != "" {
		dbStatus := "pending"
		switch event.State {
		case "COMMITTED", "COMPLETED":
			dbStatus = "completed"
		case "ABORTED", "REJECTED":
			dbStatus = "failed"
		}
		_, err := db.ExecContext(ctx,
			`UPDATE cross_border_transfers SET status = $1, updated_at = NOW() WHERE mojaloop_transfer_id = $2`,
			dbStatus, event.TransferID,
		)
		if err != nil {
			slog.Warn("[kafka-consumer] Mojaloop: failed to update transfer status", "err", err, "transfer_id", event.TransferID)
		} else {
			slog.Info("[kafka-consumer] Mojaloop: transfer status updated", "transfer_id", event.TransferID, "status", dbStatus)
		}
	}
	return nil
}

// HandleFraudAlert processes fraud alert events from the ML scoring service.
// Uses the FraudAlertEvent type defined in producer.go.
func HandleFraudAlert(ctx context.Context, key string, value []byte) error {
	var event FraudAlertEvent
	if err := json.Unmarshal(value, &event); err != nil {
		return fmt.Errorf("kafka: decode fraud alert: %w", err)
	}
	slog.Info("[kafka-consumer] fraud alert received",
		"alert_id", event.AlertID,
		"tx_id", event.TxID,
		"risk_score", event.RiskScore,
		"alert_type", event.AlertType,
	)
	// Insert fraud alert into DB and trigger notification if action == "block"
	if db := getKafkaDB(); db != nil {
		_, err := db.ExecContext(ctx, `
			INSERT INTO fraud_alerts (id, merchant_id, transaction_id, alert_type, risk_score, status, metadata, created_at)
			VALUES ($1, $2, $3, $4, $5, 'open', $6, NOW())
			ON CONFLICT (id) DO NOTHING`,
			event.AlertID, event.MerchantID, event.TxID, event.AlertType, event.RiskScore,
			fmt.Sprintf(`{"action":"%s","model":"%s"}`, event.Action, event.Model),
		)
		if err != nil {
			slog.Warn("[kafka-consumer] fraud alert: DB insert error", "err", err)
		}
		// If action is "block", also flag the transaction
		if event.Action == "block" && event.TxID != "" {
			_, _ = db.ExecContext(ctx,
				`UPDATE transactions SET status = 'flagged', updated_at = NOW() WHERE id = $1`,
				event.TxID,
			)
		}
	}
	return nil
}

// HandleSettlementConfirmed processes settlement confirmation events.
func HandleSettlementConfirmed(ctx context.Context, key string, value []byte) error {
	var event struct {
		SettlementID string    `json:"settlement_id"`
		BatchRef     string    `json:"batch_ref"`
		MerchantID   string    `json:"merchant_id"`
		Amount       int64     `json:"amount_kobo"`
		ConfirmedAt  time.Time `json:"confirmed_at"`
	}
	if err := json.Unmarshal(value, &event); err != nil {
		return fmt.Errorf("kafka: decode settlement confirmed: %w", err)
	}
	slog.Info("[kafka-consumer] settlement confirmed",
		"settlement_id", event.SettlementID,
		"batch_ref", event.BatchRef,
		"merchant_id", event.MerchantID,
		"amount_kobo", event.Amount,
	)
	// Update settlement status in DB
	if db := getKafkaDB(); db != nil && event.SettlementID != "" {
		_, err := db.ExecContext(ctx,
			`UPDATE settlements SET status = 'confirmed', confirmed_at = $1, updated_at = NOW() WHERE id = $2`,
			event.ConfirmedAt, event.SettlementID,
		)
		if err != nil {
			slog.Warn("[kafka-consumer] settlement: DB update error", "err", err, "settlement_id", event.SettlementID)
		} else {
			slog.Info("[kafka-consumer] settlement status updated to confirmed", "settlement_id", event.SettlementID)
		}
	}
	return nil
}

// ─── Default consumer factory ─────────────────────────────────────────────────

// NewDefaultConsumer creates a consumer with all built-in handlers registered.
func NewDefaultConsumer() *Consumer {
	c := NewConsumer("paygate-bridge-group")
	c.RegisterHandler("paygate.nibss.confirmation", HandleNIBSSConfirmation)
	c.RegisterHandler("paygate.mojaloop.callback", HandleMojalooopCallback)
	c.RegisterHandler("paygate.fraud.alert", HandleFraudAlert)
	c.RegisterHandler("paygate.settlement.confirmed", HandleSettlementConfirmed)
	return c
}
