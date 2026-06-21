// Package fluvio — insider threat event types and producer method.
package fluvio

import (
	"context"
	"time"
)

// ─── Topic constant ───────────────────────────────────────────────────────────

const TopicInsiderThreatEvents = "paygate-insider-threat-events"

// ─── Event type ───────────────────────────────────────────────────────────────

// InsiderThreatEvent is streamed to paygate-insider-threat-events.
type InsiderThreatEvent struct {
	EventID       string    `json:"event_id"`
	EventType     string    `json:"event_type"` // "dual_control.pending" | "dual_control.approved" | "dual_control.rejected" | "session.binding_violation" | "velocity.blocked" | "risk.blocked"
	ActorID       string    `json:"actor_id"`
	MerchantID    string    `json:"merchant_id"`
	Action        string    `json:"action"`
	ResourceID    string    `json:"resource_id,omitempty"`
	Status        string    `json:"status"`
	RiskScore     float64   `json:"risk_score,omitempty"`
	RiskFactors   []string  `json:"risk_factors,omitempty"`
	DualControlID string    `json:"dual_control_id,omitempty"`
	IPAddress     string    `json:"ip_address,omitempty"`
	DeviceHash    string    `json:"device_hash,omitempty"`
	OccurredAt    time.Time `json:"occurred_at"`
}

// ProduceInsiderThreatEvent streams an insider threat event.
func (p *Producer) ProduceInsiderThreatEvent(ctx context.Context, evt InsiderThreatEvent) error {
	return p.Produce(ctx, TopicInsiderThreatEvents, evt)
}
