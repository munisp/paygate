// Package kafka — Cross-Border Rail Topics
// Extends the PayGate Kafka producer with CIPS, UPI, PIX, Mojaloop,
// and BRICS Pay event topics for cross-border payment rails.
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// ─── Cross-Border Topic Constants ─────────────────────────────────────────────

const (
	// CIPS (China Interbank Payment System)
	TopicCIPSTransferSubmitted  = "paygate.cips.transfer.submitted"
	TopicCIPSTransferSettled    = "paygate.cips.transfer.settled"
	TopicCIPSTransferFailed     = "paygate.cips.transfer.failed"
	TopicCIPSQuoteRequested     = "paygate.cips.quote.requested"
	TopicCIPSCallbackReceived   = "paygate.cips.callback.received"

	// UPI (Unified Payments Interface — India)
	TopicUPICollectInitiated    = "paygate.upi.collect.initiated"
	TopicUPICollectApproved     = "paygate.upi.collect.approved"
	TopicUPICollectRejected     = "paygate.upi.collect.rejected"
	TopicUPIPayInitiated        = "paygate.upi.pay.initiated"
	TopicUPIPaySettled          = "paygate.upi.pay.settled"
	TopicUPIVPALookup           = "paygate.upi.vpa.lookup"
	TopicUPICallbackReceived    = "paygate.upi.callback.received"

	// PIX (Brazil Instant Payment)
	TopicPIXPaymentInitiated    = "paygate.pix.payment.initiated"
	TopicPIXPaymentSettled      = "paygate.pix.payment.settled"
	TopicPIXPaymentFailed       = "paygate.pix.payment.failed"
	TopicPIXQRCodeGenerated     = "paygate.pix.qrcode.generated"
	TopicPIXKeyLookup           = "paygate.pix.key.lookup"
	TopicPIXWebhookReceived     = "paygate.pix.webhook.received"

	// Mojaloop
	TopicMojaloopTransferInitiated = "paygate.mojaloop.transfer.initiated"
	TopicMojaloopTransferFulfilled = "paygate.mojaloop.transfer.fulfilled"
	TopicMojaloopTransferAborted   = "paygate.mojaloop.transfer.aborted"
	TopicMojaloopQuoteRequested    = "paygate.mojaloop.quote.requested"
	TopicMojaloopPartyLookup       = "paygate.mojaloop.party.lookup"

	// BRICS Pay
	TopicBRICSPayTransferInitiated = "paygate.brics.transfer.initiated"
	TopicBRICSPayTransferSettled   = "paygate.brics.transfer.settled"

	// FX Rate Events
	TopicFXRateUpdated          = "paygate.fx.rate.updated"
	TopicFXCorridorPriced       = "paygate.fx.corridor.priced"

	// Cross-Border Fraud
	TopicCrossBorderFraudAlert  = "paygate.crossborder.fraud.alert"
	TopicCrossBorderAMLFlag     = "paygate.crossborder.aml.flag"
	TopicCrossBorderSanctionsHit = "paygate.crossborder.sanctions.hit"
)

// ─── Cross-Border Event Payloads ──────────────────────────────────────────────

type CIPSTransferEvent struct {
	EventID       string    `json:"event_id"`
	TransferID    string    `json:"transfer_id"`
	MerchantID    string    `json:"merchant_id"`
	CNAPSCode     string    `json:"cnaps_code"`
	Amount        string    `json:"amount"`
	Currency      string    `json:"currency"`
	CIPSMessageID string    `json:"cips_message_id"`
	Status        string    `json:"status"`
	Timestamp     time.Time `json:"timestamp"`
}

type UPICollectEvent struct {
	EventID    string    `json:"event_id"`
	TransferID string    `json:"transfer_id"`
	MerchantID string    `json:"merchant_id"`
	VPA        string    `json:"vpa"`
	PSPName    string    `json:"psp_name"`
	Amount     string    `json:"amount"`
	UPIRef     string    `json:"upi_ref"`
	Status     string    `json:"status"`
	Timestamp  time.Time `json:"timestamp"`
}

type PIXPaymentEvent struct {
	EventID    string    `json:"event_id"`
	TransferID string    `json:"transfer_id"`
	MerchantID string    `json:"merchant_id"`
	PIXKey     string    `json:"pix_key"`
	PIXKeyType string    `json:"pix_key_type"`
	Amount     string    `json:"amount"`
	EndToEndID string    `json:"end_to_end_id"`
	Status     string    `json:"status"`
	Timestamp  time.Time `json:"timestamp"`
}

type FXRateEvent struct {
	EventID        string    `json:"event_id"`
	SourceCurrency string    `json:"source_currency"`
	TargetCurrency string    `json:"target_currency"`
	Rate           string    `json:"rate"`
	Rail           string    `json:"rail"`
	CorridorID     string    `json:"corridor_id"`
	Timestamp      time.Time `json:"timestamp"`
}

type CrossBorderFraudEvent struct {
	EventID    string    `json:"event_id"`
	TransferID string    `json:"transfer_id"`
	MerchantID string    `json:"merchant_id"`
	Rail       string    `json:"rail"`
	Score      float64   `json:"score"`
	RiskLevel  string    `json:"risk_level"`
	Factors    []string  `json:"factors"`
	Timestamp  time.Time `json:"timestamp"`
}

// ─── Publisher Functions ──────────────────────────────────────────────────────

// PublishCIPSTransferEvent publishes a CIPS transfer lifecycle event.
func PublishCIPSTransferEvent(p *Producer, status string, transferID, merchantID, cnapsCode, amount, currency, cipsMessageID string) error {
	evt := CIPSTransferEvent{
		EventID:       fmt.Sprintf("cips-evt-%d", time.Now().UnixNano()),
		TransferID:    transferID,
		MerchantID:    merchantID,
		CNAPSCode:     cnapsCode,
		Amount:        amount,
		Currency:      currency,
		CIPSMessageID: cipsMessageID,
		Status:        status,
		Timestamp:     time.Now().UTC(),
	}

	topic := TopicCIPSTransferSubmitted
	switch status {
	case "settled":
		topic = TopicCIPSTransferSettled
	case "failed":
		topic = TopicCIPSTransferFailed
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal CIPS event: %w", err)
	}

	slog.Info("publishing CIPS event", "topic", topic, "transfer_id", transferID, "status", status)
	return p.Publish(context.Background(), topic, transferID, payload)
}

// PublishUPICollectEvent publishes a UPI collect/pay lifecycle event.
func PublishUPICollectEvent(p *Producer, status string, transferID, merchantID, vpa, pspName, amount, upiRef string) error {
	evt := UPICollectEvent{
		EventID:    fmt.Sprintf("upi-evt-%d", time.Now().UnixNano()),
		TransferID: transferID,
		MerchantID: merchantID,
		VPA:        vpa,
		PSPName:    pspName,
		Amount:     amount,
		UPIRef:     upiRef,
		Status:     status,
		Timestamp:  time.Now().UTC(),
	}

	topic := TopicUPICollectInitiated
	switch status {
	case "approved":
		topic = TopicUPICollectApproved
	case "rejected":
		topic = TopicUPICollectRejected
	case "pay_initiated":
		topic = TopicUPIPayInitiated
	case "pay_settled":
		topic = TopicUPIPaySettled
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal UPI event: %w", err)
	}

	slog.Info("publishing UPI event", "topic", topic, "transfer_id", transferID, "vpa", vpa)
	return p.Publish(context.Background(), topic, transferID, payload)
}

// PublishPIXPaymentEvent publishes a PIX payment lifecycle event.
func PublishPIXPaymentEvent(p *Producer, status string, transferID, merchantID, pixKey, pixKeyType, amount, e2eID string) error {
	evt := PIXPaymentEvent{
		EventID:    fmt.Sprintf("pix-evt-%d", time.Now().UnixNano()),
		TransferID: transferID,
		MerchantID: merchantID,
		PIXKey:     pixKey,
		PIXKeyType: pixKeyType,
		Amount:     amount,
		EndToEndID: e2eID,
		Status:     status,
		Timestamp:  time.Now().UTC(),
	}

	topic := TopicPIXPaymentInitiated
	switch status {
	case "settled":
		topic = TopicPIXPaymentSettled
	case "failed":
		topic = TopicPIXPaymentFailed
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal PIX event: %w", err)
	}

	slog.Info("publishing PIX event", "topic", topic, "transfer_id", transferID, "pix_key", pixKey)
	return p.Publish(context.Background(), topic, transferID, payload)
}

// PublishFXRateEvent publishes an FX rate update event.
func PublishFXRateEvent(p *Producer, sourceCurrency, targetCurrency, rate, rail, corridorID string) error {
	evt := FXRateEvent{
		EventID:        fmt.Sprintf("fx-evt-%d", time.Now().UnixNano()),
		SourceCurrency: sourceCurrency,
		TargetCurrency: targetCurrency,
		Rate:           rate,
		Rail:           rail,
		CorridorID:     corridorID,
		Timestamp:      time.Now().UTC(),
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal FX event: %w", err)
	}

	key := fmt.Sprintf("%s-%s", sourceCurrency, targetCurrency)
	return p.Publish(context.Background(), TopicFXRateUpdated, key, payload)
}

// PublishCrossBorderFraudAlert publishes a cross-border fraud alert.
func PublishCrossBorderFraudAlert(p *Producer, transferID, merchantID, rail string, score float64, riskLevel string, factors []string) error {
	evt := CrossBorderFraudEvent{
		EventID:    fmt.Sprintf("cb-fraud-evt-%d", time.Now().UnixNano()),
		TransferID: transferID,
		MerchantID: merchantID,
		Rail:       rail,
		Score:      score,
		RiskLevel:  riskLevel,
		Factors:    factors,
		Timestamp:  time.Now().UTC(),
	}

	payload, err := json.Marshal(evt)
	if err != nil {
		return fmt.Errorf("marshal cross-border fraud event: %w", err)
	}

	slog.Warn("publishing cross-border fraud alert",
		"transfer_id", transferID,
		"rail", rail,
		"score", score,
		"risk_level", riskLevel,
	)
	return p.Publish(context.Background(), TopicCrossBorderFraudAlert, transferID, payload)
}

// AllCrossBorderTopics returns all cross-border Kafka topics for admin/monitoring.
func AllCrossBorderTopics() []string {
	return []string{
		TopicCIPSTransferSubmitted, TopicCIPSTransferSettled, TopicCIPSTransferFailed,
		TopicCIPSQuoteRequested, TopicCIPSCallbackReceived,
		TopicUPICollectInitiated, TopicUPICollectApproved, TopicUPICollectRejected,
		TopicUPIPayInitiated, TopicUPIPaySettled, TopicUPIVPALookup, TopicUPICallbackReceived,
		TopicPIXPaymentInitiated, TopicPIXPaymentSettled, TopicPIXPaymentFailed,
		TopicPIXQRCodeGenerated, TopicPIXKeyLookup, TopicPIXWebhookReceived,
		TopicMojaloopTransferInitiated, TopicMojaloopTransferFulfilled, TopicMojaloopTransferAborted,
		TopicMojaloopQuoteRequested, TopicMojaloopPartyLookup,
		TopicBRICSPayTransferInitiated, TopicBRICSPayTransferSettled,
		TopicFXRateUpdated, TopicFXCorridorPriced,
		TopicCrossBorderFraudAlert, TopicCrossBorderAMLFlag, TopicCrossBorderSanctionsHit,
	}
}
