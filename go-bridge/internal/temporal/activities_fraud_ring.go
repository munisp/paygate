// Package temporal — Fraud Ring Escalation activity implementations.
//
// These activities are used by FraudRingEscalationWorkflow to orchestrate
// compliance escalation, auto-freeze, and Kafka event publishing for
// detected fraud rings.
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
)

// NotifyFraudRingEscalation sends compliance notifications for a fraud ring
// escalation. It publishes a Kafka paygate.fraud.ring.escalated event and
// logs the escalation for the audit trail.
func (a *ActivitySet) NotifyFraudRingEscalation(ctx context.Context, input FraudRingEscalationInput) error {
	slog.Info("[fraud-ring] NotifyFraudRingEscalation",
		"ring_id", input.RingID,
		"reason", input.Reason,
		"escalated_by", input.EscalatedBy,
	)
	// Publish Kafka compliance event
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.fraud.ring.escalated",
			input.RingID, map[string]any{
				"ring_id":              input.RingID,
				"reason":               input.Reason,
				"linked_account_count": input.LinkedAccountCount,
				"escalated_by":         input.EscalatedBy,
				"auto_freeze_hours":    input.AutoFreezeAfterHours,
				"occurred_at":          time.Now().UTC(),
			})
	}()
	return nil
}

// CheckFraudRingResolved queries Redis to determine if a fraud ring has been
// resolved (cleared or manually frozen) before the auto-freeze timer fires.
// Returns false when the key is absent (not yet resolved).
func (a *ActivitySet) CheckFraudRingResolved(ctx context.Context, ringID string) (bool, error) {
	rdb := redis.Get()
	val, ok, err := rdb.GetString(ctx, fmt.Sprintf("fraud:ring:resolved:%s", ringID))
	if err != nil || !ok {
		// Key not found means not yet resolved
		return false, nil
	}
	return val == "true" || val == "cleared" || val == "frozen", nil
}

// AutoFreezeFraudRing marks a fraud ring as frozen in Redis and publishes
// a Kafka paygate.fraud.ring.auto_frozen event. The actual DB update is
// handled by the Node.js cron job that subscribes to this Kafka topic.
func (a *ActivitySet) AutoFreezeFraudRing(ctx context.Context, ringID string, operatorID string) error {
	slog.Info("[fraud-ring] AutoFreezeFraudRing", "ring_id", ringID, "operator_id", operatorID)
	rdb := redis.Get()
	// Mark as frozen in Redis (TTL 7 days for audit trail)
	_ = rdb.SetEX(ctx, fmt.Sprintf("fraud:ring:frozen:%s", ringID), "true", 7*24*time.Hour)
	_ = rdb.SetEX(ctx, fmt.Sprintf("fraud:ring:resolved:%s", ringID), "frozen", 7*24*time.Hour)
	// Publish Kafka freeze event
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.fraud.ring.auto_frozen",
			ringID, map[string]any{
				"ring_id":     ringID,
				"operator_id": operatorID,
				"frozen_at":   time.Now().UTC(),
				"reason":      "auto_freeze_after_48h_escalation",
			})
	}()
	return nil
}

// PublishFraudRingFrozenEvent publishes the final Kafka event after a fraud
// ring has been auto-frozen, triggering downstream compliance and audit systems.
func (a *ActivitySet) PublishFraudRingFrozenEvent(ctx context.Context, ringID string, linkedAccountCount int) error {
	slog.Info("[fraud-ring] PublishFraudRingFrozenEvent", "ring_id", ringID, "linked_accounts", linkedAccountCount)
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.fraud.ring.frozen",
			ringID, map[string]any{
				"ring_id":              ringID,
				"linked_account_count": linkedAccountCount,
				"frozen_at":            time.Now().UTC(),
				"source":               "temporal_workflow",
			})
	}()
	return nil
}
