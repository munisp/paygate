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
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strings"
	"sync"
	"time"
)

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
	// TODO: Update transaction status in DB based on event.Status
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
	// TODO: Update cross-border transfer status in DB
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
	// TODO: Insert fraud alert into DB and trigger notification if action == "block"
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
	// TODO: Update settlement status in DB
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
