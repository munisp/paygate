// Package topics defines all Kafka and Fluvio topic names used across PayGate middleware.
// All producers and consumers MUST reference constants from this package to avoid
// topic name drift between services.
package topics

// ─── Terminal Topics ──────────────────────────────────────────────────────────
// Published by: Go terminal_producer.go, Rust terminal-events crate
// Consumed by:  Python fluvio_consumer.py, TypeScript SSE endpoint

const (
	TerminalProvisioned  = "paygate.terminal.provisioned"
	TerminalActivated    = "paygate.terminal.activated"
	TerminalHeartbeat    = "paygate.terminal.heartbeat"
	TerminalTxnCompleted = "paygate.terminal.txn_completed"
	TerminalTxnFailed    = "paygate.terminal.txn_failed"
	TerminalRefunded     = "paygate.terminal.refunded"
	TerminalVoided       = "paygate.terminal.voided"
	TerminalStatusChange = "paygate.terminal.status_changed"
	// Aggregate fan-out topic — all terminal events in one stream
	TerminalEvents = "paygate.terminal.events"
)

// ─── STR (Suspicious Transaction Report) Topics ───────────────────────────────
// Published by: Go str_handler.go, Rust str-events crate
// Consumed by:  Python str_analytics.py, TypeScript STR router

const (
	STRFiled        = "paygate.str.filed"
	STRSubmitted    = "paygate.str.submitted"
	STRAcknowledged = "paygate.str.acknowledged"
	STROverdue      = "paygate.str.overdue"
	STRRejected     = "paygate.str.rejected"
	// Aggregate fan-out topic
	STREvents = "paygate.str.events"
)

// ─── Mobile Money Topics ──────────────────────────────────────────────────────
// Published by: Go momo_webhook_handler.go
// Consumed by:  Python webhook_processor.py, TypeScript mobileMoney router

const (
	MoMoWebhookReceived  = "paygate.momo.webhook.received"
	MoMoPaymentCompleted = "paygate.momo.payment.completed"
	MoMoPaymentFailed    = "paygate.momo.payment.failed"
	MoMoDisbursement     = "paygate.momo.disbursement.completed"
	// Aggregate fan-out topic
	MoMoEvents = "paygate.momo.events"
)

// ─── Hosted Checkout Topics ───────────────────────────────────────────────────
// Published by: TypeScript hostedCheckout router, Stripe webhook handler
// Consumed by:  Python analytics_aggregator.py, Rust settlement service

const (
	CheckoutInitiated = "paygate.checkout.initiated"
	CheckoutCompleted = "paygate.checkout.completed"
	CheckoutFailed    = "paygate.checkout.failed"
	CheckoutExpired   = "paygate.checkout.expired"
	// Aggregate fan-out topic
	CheckoutEvents = "paygate.checkout.events"
)

// ─── Payment Link Topics ──────────────────────────────────────────────────────
const (
	PaymentLinkViewed    = "paygate.payment_link.viewed"
	PaymentLinkClicked   = "paygate.payment_link.clicked"
	PaymentLinkCompleted = "paygate.payment_link.completed"
)

// ─── Settlement Topics ────────────────────────────────────────────────────────
const (
	SettlementQueued    = "paygate.settlement.queued"
	SettlementCompleted = "paygate.settlement.completed"
	SettlementFailed    = "paygate.settlement.failed"
)

// ─── Fraud Topics ─────────────────────────────────────────────────────────────
const (
	FraudAlertRaised   = "paygate.fraud.alert.raised"
	FraudAlertResolved = "paygate.fraud.alert.resolved"
	FraudScoreComputed = "paygate.fraud.score.computed"
)

// AllTopics returns a slice of all topic names, useful for admin tooling
// and topic provisioning scripts.
func AllTopics() []string {
	return []string{
		TerminalProvisioned, TerminalActivated, TerminalHeartbeat,
		TerminalTxnCompleted, TerminalTxnFailed, TerminalRefunded,
		TerminalVoided, TerminalStatusChange, TerminalEvents,
		STRFiled, STRSubmitted, STRAcknowledged, STROverdue, STRRejected, STREvents,
		MoMoWebhookReceived, MoMoPaymentCompleted, MoMoPaymentFailed, MoMoDisbursement, MoMoEvents,
		CheckoutInitiated, CheckoutCompleted, CheckoutFailed, CheckoutExpired, CheckoutEvents,
		PaymentLinkViewed, PaymentLinkClicked, PaymentLinkCompleted,
		SettlementQueued, SettlementCompleted, SettlementFailed,
		FraudAlertRaised, FraudAlertResolved, FraudScoreComputed,
	}
}
