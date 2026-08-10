// Package kafka — opensearch_handlers.go
//
// Kafka consumer handlers that index events into OpenSearch.
// These handlers run in the consumer group goroutine and should be fast.
// Heavy processing is offloaded to goroutines.
package kafka

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"

	"github.com/paygate/go-bridge/internal/opensearch"
)

// HandleInsiderThreatEvent indexes insider threat events into OpenSearch.
func HandleInsiderThreatEvent(ctx context.Context, key string, value []byte) error {
	var event struct {
		ID          string                 `json:"id"`
		ActorID     string                 `json:"actor_id"`
		Action      string                 `json:"action"`
		RiskScore   int                    `json:"risk_score"`
		RiskLevel   string                 `json:"risk_level"`
		RiskFactors []string               `json:"risk_factors"`
		IPAddress   string                 `json:"ip_address"`
		DeviceHash  string                 `json:"device_hash"`
		Status      string                 `json:"status"`
		Timestamp   time.Time              `json:"timestamp"`
		Metadata    map[string]interface{} `json:"metadata"`
	}
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Warn("kafka: insider threat unmarshal", "err", err)
		return nil // don't retry malformed messages
	}
	doc := opensearch.InsiderThreatDoc{
		ID:          event.ID,
		Timestamp:   event.Timestamp,
		ActorID:     event.ActorID,
		Action:      event.Action,
		RiskScore:   event.RiskScore,
		RiskLevel:   event.RiskLevel,
		RiskFactors: event.RiskFactors,
		IPAddress:   event.IPAddress,
		DeviceHash:  event.DeviceHash,
		Status:      event.Status,
		Metadata:    event.Metadata,
	}
	go func() {
		if err := opensearch.Get().IndexInsiderThreatAlert(context.Background(), doc); err != nil {
			slog.Error("opensearch: index insider threat", "id", event.ID, "err", err)
		}
	}()
	return nil
}

// HandleUEBASignal indexes UEBA signals as audit log entries.
func HandleUEBASignal(ctx context.Context, key string, value []byte) error {
	var event struct {
		ID         string                 `json:"id"`
		ActorID    string                 `json:"actor_id"`
		Signal     string                 `json:"signal"`
		Score      float64                `json:"score"`
		Timestamp  time.Time              `json:"timestamp"`
		Metadata   map[string]interface{} `json:"metadata"`
	}
	if err := json.Unmarshal(value, &event); err != nil {
		slog.Warn("kafka: ueba signal unmarshal", "err", err)
		return nil
	}
	doc := opensearch.AuditLogDoc{
		ID:          event.ID,
		Timestamp:   event.Timestamp,
		ActorID:     event.ActorID,
		Action:      "ueba.signal." + event.Signal,
		Status:      "flagged",
		RiskScore:   int(event.Score * 100),
		Metadata:    event.Metadata,
		ServiceName: "ueba-service",
	}
	go func() {
		if err := opensearch.Get().IndexAuditLog(context.Background(), doc); err != nil {
			slog.Error("opensearch: index ueba signal", "id", event.ID, "err", err)
		}
	}()
	return nil
}

// HandleAuditEvent indexes generic audit events into OpenSearch.
func HandleAuditEvent(ctx context.Context, key string, value []byte) error {
	var doc opensearch.AuditLogDoc
	if err := json.Unmarshal(value, &doc); err != nil {
		slog.Warn("kafka: audit event unmarshal", "err", err)
		return nil
	}
	go func() {
		if err := opensearch.Get().IndexAuditLog(context.Background(), doc); err != nil {
			slog.Error("opensearch: index audit event", "id", doc.ID, "err", err)
		}
	}()
	return nil
}

// HandleTransactionCreated indexes new transactions into OpenSearch.
func HandleTransactionCreated(ctx context.Context, key string, value []byte) error {
	var doc opensearch.TransactionDoc
	if err := json.Unmarshal(value, &doc); err != nil {
		slog.Warn("kafka: transaction created unmarshal", "err", err)
		return nil
	}
	go func() {
		if err := opensearch.Get().IndexTransaction(context.Background(), doc); err != nil {
			slog.Error("opensearch: index transaction", "id", doc.ID, "err", err)
		}
	}()
	return nil
}
