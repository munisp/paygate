// Package fluvio — Cross-Border Stream Processor
// Produces and consumes CIPS, UPI, PIX, and Mojaloop events via Fluvio.
package fluvio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// ─── Fluvio Topic Constants ────────────────────────────────────────────────────

const (
	FluvioTopicCIPS      = "paygate-cips-events"
	FluvioTopicUPI       = "paygate-upi-events"
	FluvioTopicPIX       = "paygate-pix-events"
	FluvioTopicMojaloop  = "paygate-mojaloop-events"
	FluvioTopicFXRates   = "paygate-fx-rates"
	FluvioTopicCBFraud   = "paygate-crossborder-fraud"
	FluvioTopicAudit     = "paygate-audit-stream"
)

// ─── Event Types ──────────────────────────────────────────────────────────────

type CrossBorderStreamEvent struct {
	EventID    string                 `json:"event_id"`
	Rail       string                 `json:"rail"`       // cips | upi | pix | mojaloop | brics
	EventType  string                 `json:"event_type"` // transfer.submitted | settled | failed | quote.requested
	TransferID string                 `json:"transfer_id"`
	MerchantID string                 `json:"merchant_id"`
	Payload    map[string]interface{} `json:"payload"`
	Timestamp  time.Time              `json:"timestamp"`
}

type FXRateStreamEvent struct {
	EventID        string    `json:"event_id"`
	SourceCurrency string    `json:"source_currency"`
	TargetCurrency string    `json:"target_currency"`
	Rate           string    `json:"rate"`
	Rail           string    `json:"rail"`
	Spread         string    `json:"spread"`
	Timestamp      time.Time `json:"timestamp"`
}

// ─── Producer Helpers ─────────────────────────────────────────────────────────

// ProduceCIPSEvent sends a CIPS event to the Fluvio CIPS topic.
func ProduceCIPSEvent(p *Producer, eventType, transferID, merchantID string, payload map[string]interface{}) error {
	return produceRailEvent(p, FluvioTopicCIPS, "cips", eventType, transferID, merchantID, payload)
}

// ProduceUPIEvent sends a UPI event to the Fluvio UPI topic.
func ProduceUPIEvent(p *Producer, eventType, transferID, merchantID string, payload map[string]interface{}) error {
	return produceRailEvent(p, FluvioTopicUPI, "upi", eventType, transferID, merchantID, payload)
}

// ProducePIXEvent sends a PIX event to the Fluvio PIX topic.
func ProducePIXEvent(p *Producer, eventType, transferID, merchantID string, payload map[string]interface{}) error {
	return produceRailEvent(p, FluvioTopicPIX, "pix", eventType, transferID, merchantID, payload)
}

// ProduceMojaloopEvent sends a Mojaloop event to the Fluvio Mojaloop topic.
func ProduceMojaloopEvent(p *Producer, eventType, transferID, merchantID string, payload map[string]interface{}) error {
	return produceRailEvent(p, FluvioTopicMojaloop, "mojaloop", eventType, transferID, merchantID, payload)
}

// ProduceFXRateEvent sends an FX rate update to the Fluvio FX rates topic.
func ProduceFXRateEvent(p *Producer, sourceCurrency, targetCurrency, rate, rail, spread string) error {
	evt := FXRateStreamEvent{
		EventID:        fmt.Sprintf("fx-stream-%d", time.Now().UnixNano()),
		SourceCurrency: sourceCurrency,
		TargetCurrency: targetCurrency,
		Rate:           rate,
		Rail:           rail,
		Spread:         spread,
		Timestamp:      time.Now().UTC(),
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal FX rate stream event: %w", err)
	}

	key := fmt.Sprintf("%s-%s-%s", sourceCurrency, targetCurrency, rail)
	slog.Info("producing FX rate stream event",
		"topic", FluvioTopicFXRates,
		"pair", key,
		"rate", rate,
	)
	return p.Produce(context.Background(), FluvioTopicFXRates, key, payload)
}

// ProduceCrossBorderFraudEvent sends a cross-border fraud alert to Fluvio.
func ProduceCrossBorderFraudEvent(p *Producer, transferID, merchantID, rail string, score float64, riskLevel string) error {
	payload := map[string]interface{}{
		"score":      score,
		"risk_level": riskLevel,
		"rail":       rail,
	}
	return produceRailEvent(p, FluvioTopicCBFraud, rail, "fraud.alert", transferID, merchantID, payload)
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func produceRailEvent(p *Producer, topic, rail, eventType, transferID, merchantID string, payload map[string]interface{}) error {
	evt := CrossBorderStreamEvent{
		EventID:    fmt.Sprintf("%s-stream-%d", rail, time.Now().UnixNano()),
		Rail:       rail,
		EventType:  eventType,
		TransferID: transferID,
		MerchantID: merchantID,
		Payload:    payload,
		Timestamp:  time.Now().UTC(),
	}

	data, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal %s stream event: %w", rail, err)
	}

	slog.Info("producing cross-border stream event",
		"topic", topic,
		"rail", rail,
		"event_type", eventType,
		"transfer_id", transferID,
	)
	return p.Produce(context.Background(), topic, transferID, data)
}

// AllCrossBorderFluvioTopics returns all cross-border Fluvio topic names.
func AllCrossBorderFluvioTopics() []string {
	return []string{
		FluvioTopicCIPS,
		FluvioTopicUPI,
		FluvioTopicPIX,
		FluvioTopicMojaloop,
		FluvioTopicFXRates,
		FluvioTopicCBFraud,
		FluvioTopicAudit,
	}
}
