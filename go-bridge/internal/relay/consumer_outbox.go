// Package relay provides the consumer outbox relay worker.
// It polls the consumer_outbox table for pending events, publishes them to
// Kafka/Fluvio, and marks them as processed — guaranteeing at-least-once
// delivery for all consumer wallet and transfer events.
package relay

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
)

// OutboxEvent represents a row in the consumer_outbox table.
type OutboxEvent struct {
	ID          string
	AggregateID string
	EventType   string
	Payload     json.RawMessage
	Status      string // "pending" | "processed" | "failed"
	Attempts    int
	CreatedAt   time.Time
	ProcessedAt *time.Time
}

// Publisher is the interface the relay uses to publish events.
type Publisher interface {
	Publish(ctx context.Context, topic string, payload []byte) error
}

// ConsumerOutboxRelay polls the consumer_outbox table and forwards events.
type ConsumerOutboxRelay struct {
	db          *sql.DB
	publisher   Publisher
	pollInterval time.Duration
	batchSize   int
}

// NewConsumerOutboxRelay creates a new relay worker.
func NewConsumerOutboxRelay(db *sql.DB, publisher Publisher) *ConsumerOutboxRelay {
	return &ConsumerOutboxRelay{
		db:          db,
		publisher:   publisher,
		pollInterval: 5 * time.Second,
		batchSize:   50,
	}
}

// Run starts the relay loop. It blocks until ctx is cancelled.
func (r *ConsumerOutboxRelay) Run(ctx context.Context) {
	slog.Info("[consumer-outbox-relay] starting", "poll_interval", r.pollInterval, "batch_size", r.batchSize)
	ticker := time.NewTicker(r.pollInterval)
	defer ticker.Stop()
	for {
		select {
		case <-ctx.Done():
			slog.Info("[consumer-outbox-relay] shutting down")
			return
		case <-ticker.C:
			if err := r.processBatch(ctx); err != nil {
				slog.Error("[consumer-outbox-relay] batch error", "error", err)
			}
		}
	}
}

// processBatch fetches pending events, publishes them, and marks as processed.
func (r *ConsumerOutboxRelay) processBatch(ctx context.Context) error {
	rows, err := r.db.QueryContext(ctx, `
		SELECT id, aggregate_id, event_type, payload, attempts
		FROM consumer_outbox
		WHERE status = 'pending' AND attempts < 5
		ORDER BY created_at ASC
		LIMIT ?
	`, r.batchSize)
	if err != nil {
		return fmt.Errorf("query outbox: %w", err)
	}
	defer rows.Close()

	var events []OutboxEvent
	for rows.Next() {
		var e OutboxEvent
		if err := rows.Scan(&e.ID, &e.AggregateID, &e.EventType, &e.Payload, &e.Attempts); err != nil {
			return fmt.Errorf("scan outbox row: %w", err)
		}
		events = append(events, e)
	}
	if err := rows.Err(); err != nil {
		return fmt.Errorf("outbox rows: %w", err)
	}

	for _, evt := range events {
		if err := r.processEvent(ctx, evt); err != nil {
			slog.Error("[consumer-outbox-relay] event error",
				"event_id", evt.ID,
				"event_type", evt.EventType,
				"error", err,
			)
			// Increment attempts and mark as failed if max retries exceeded
			_, _ = r.db.ExecContext(ctx, `
				UPDATE consumer_outbox
				SET attempts = attempts + 1,
				    status = CASE WHEN attempts + 1 >= 5 THEN 'failed' ELSE 'pending' END
				WHERE id = ?
			`, evt.ID)
		}
	}
	return nil
}

// processEvent publishes a single outbox event and marks it as processed.
func (r *ConsumerOutboxRelay) processEvent(ctx context.Context, evt OutboxEvent) error {
	topic := topicForEventType(evt.EventType)
	if topic == "" {
		slog.Warn("[consumer-outbox-relay] unknown event type", "event_type", evt.EventType)
		topic = "paygate-consumer-events-dlq"
	}

	if err := r.publisher.Publish(ctx, topic, evt.Payload); err != nil {
		return fmt.Errorf("publish to %s: %w", topic, err)
	}

	now := time.Now().UTC()
	_, err := r.db.ExecContext(ctx, `
		UPDATE consumer_outbox
		SET status = 'processed', processed_at = ?, attempts = attempts + 1
		WHERE id = ?
	`, now, evt.ID)
	if err != nil {
		return fmt.Errorf("mark processed: %w", err)
	}

	slog.Info("[consumer-outbox-relay] event published",
		"event_id", evt.ID,
		"event_type", evt.EventType,
		"topic", topic,
	)
	return nil
}

// topicForEventType maps event types to Kafka/Fluvio topics.
func topicForEventType(eventType string) string {
	switch eventType {
	case "consumer.wallet.credit", "consumer.wallet.debit", "consumer.wallet.top_up":
		return "paygate-consumer-wallet-events"
	case "consumer.transfer.p2p", "consumer.transfer.bank", "consumer.transfer.bill_pay":
		return "paygate-consumer-transfer-events"
	case "consumer.fraud.flagged", "consumer.fraud.cleared":
		return "paygate-consumer-fraud-signals"
	case "consumer.dispute.submitted", "consumer.dispute.resolved":
		return "paygate-consumer-dispute-events"
	default:
		return ""
	}
}

// InsertOutboxEvent inserts a new event into the consumer_outbox table.
// This is called within the same DB transaction as the business operation
// to guarantee atomicity (transactional outbox pattern).
func InsertOutboxEvent(ctx context.Context, tx *sql.Tx, aggregateID, eventType string, payload interface{}) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("marshal outbox payload: %w", err)
	}
	id := uuid.New().String()
	_, err = tx.ExecContext(ctx, `
		INSERT INTO consumer_outbox (id, aggregate_id, event_type, payload, status, attempts, created_at)
		VALUES (?, ?, ?, ?, 'pending', 0, NOW())
	`, id, aggregateID, eventType, string(data))
	return err
}
