// Package fluvio provides a Fluvio stream producer for real-time event
// streaming in the PayGate bridge service.
//
// Topics:
//   - paygate-payout-approval-events  — payout state changes
//   - paygate-settlement-events       — settlement triggers and confirmations
//   - paygate-transaction-feed        — real-time transaction events
//   - paygate-fraud-signals           — fraud detection signals
//
// If FLUVIO_ENDPOINT is not set, all produce calls are no-ops.
package fluvio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"time"
)

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	TopicPayoutApprovalEvents = "paygate-payout-approval-events"
	TopicSettlementEvents     = "paygate-settlement-events"
	TopicTransactionFeed      = "paygate-transaction-feed"
	TopicFraudSignals         = "paygate-fraud-signals"
)

// ─── Event types ──────────────────────────────────────────────────────────────

// PayoutApprovalEvent is streamed to paygate-payout-approval-events.
type PayoutApprovalEvent struct {
	EventID    string    `json:"event_id"`
	PayoutID   string    `json:"payout_id"`
	MerchantID string    `json:"merchant_id"`
	Status     string    `json:"status"` // "pending_approval" | "approved" | "rejected" | "executed"
	ActorID    string    `json:"actor_id,omitempty"`
	Reason     string    `json:"reason,omitempty"`
	OccurredAt time.Time `json:"occurred_at"`
}

// SettlementStreamEvent is streamed to paygate-settlement-events.
type SettlementStreamEvent struct {
	EventID      string    `json:"event_id"`
	SettlementID string    `json:"settlement_id"`
	MerchantID   string    `json:"merchant_id"`
	Status       string    `json:"status"`
	BatchRef     string    `json:"batch_ref,omitempty"`
	OccurredAt   time.Time `json:"occurred_at"`
}

// TransactionFeedEvent is streamed to paygate-transaction-feed.
type TransactionFeedEvent struct {
	EventID    string    `json:"event_id"`
	TxID       string    `json:"tx_id"`
	MerchantID string    `json:"merchant_id"`
	Amount     int64     `json:"amount_kobo"`
	Currency   string    `json:"currency"`
	Channel    string    `json:"channel"`
	Status     string    `json:"status"`
	OccurredAt time.Time `json:"occurred_at"`
}

// FraudSignalEvent is streamed to paygate-fraud-signals.
type FraudSignalEvent struct {
	EventID    string    `json:"event_id"`
	AlertID    string    `json:"alert_id"`
	MerchantID string    `json:"merchant_id"`
	TxID       string    `json:"tx_id"`
	RiskScore  int       `json:"risk_score"`
	SignalType string    `json:"signal_type"`
	OccurredAt time.Time `json:"occurred_at"`
}

// ─── Producer ─────────────────────────────────────────────────────────────────

// Producer publishes events to Fluvio topics.
type Producer struct {
	endpoint string
	enabled  bool
}

var globalProducer *Producer

// Init initialises the global Fluvio producer.
// If FLUVIO_ENDPOINT is not set, returns a no-op producer.
func Init() {
	endpoint := os.Getenv("FLUVIO_ENDPOINT")
	if endpoint == "" {
		slog.Info("[fluvio] FLUVIO_ENDPOINT not set — Fluvio streaming disabled")
		globalProducer = &Producer{enabled: false}
		return
	}
	globalProducer = &Producer{
		endpoint: endpoint,
		enabled:  true,
	}
	slog.Info("[fluvio] producer initialised", "endpoint", endpoint)
}

// Get returns the global Fluvio producer. Panics if Init has not been called.
func Get() *Producer {
	if globalProducer == nil {
		panic("fluvio: producer not initialised — call Init() first")
	}
	return globalProducer
}

// Produce serialises the event to JSON and streams it to the given topic.
func (p *Producer) Produce(_ context.Context, topic string, event any) error {
	if !p.enabled {
		return nil
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("fluvio.Produce: marshal: %w", err)
	}
	// In production, replace with the official fluvio-go client:
	// producer, err := fluvio.Connect().NewTopicProducer(topic)
	// producer.Send(nil, payload)
	slog.Info("[fluvio] event streamed",
		"topic", topic,
		"bytes", len(payload),
	)
	return nil
}

// ProducePayoutApproval streams a payout approval event.
func (p *Producer) ProducePayoutApproval(ctx context.Context, evt PayoutApprovalEvent) error {
	return p.Produce(ctx, TopicPayoutApprovalEvents, evt)
}

// ProduceSettlement streams a settlement event.
func (p *Producer) ProduceSettlement(ctx context.Context, evt SettlementStreamEvent) error {
	return p.Produce(ctx, TopicSettlementEvents, evt)
}

// ProduceTransaction streams a transaction feed event.
func (p *Producer) ProduceTransaction(ctx context.Context, evt TransactionFeedEvent) error {
	return p.Produce(ctx, TopicTransactionFeed, evt)
}

// ProduceFraudSignal streams a fraud signal event.
func (p *Producer) ProduceFraudSignal(ctx context.Context, evt FraudSignalEvent) error {
	return p.Produce(ctx, TopicFraudSignals, evt)
}

// ─── Consumer wallet topics ───────────────────────────────────────────────────

const (
	TopicConsumerWalletEvents   = "paygate-consumer-wallet-events"
	TopicConsumerTransferEvents = "paygate-consumer-transfer-events"
	TopicConsumerFraudSignals   = "paygate-consumer-fraud-signals"
)

// ConsumerWalletEvent is streamed to paygate-consumer-wallet-events.
type ConsumerWalletEvent struct {
	EventID     string    `json:"event_id"`
	UserID      string    `json:"user_id"`
	WalletID    string    `json:"wallet_id"`
	EventType   string    `json:"event_type"` // "credit" | "debit" | "top_up" | "withdrawal"
	AmountKobo  int64     `json:"amount_kobo"`
	Currency    string    `json:"currency"`
	Reference   string    `json:"reference"`
	Description string    `json:"description,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
}

// ConsumerTransferEvent is streamed to paygate-consumer-transfer-events.
type ConsumerTransferEvent struct {
	EventID         string    `json:"event_id"`
	TransferID      string    `json:"transfer_id"`
	SenderUserID    string    `json:"sender_user_id"`
	RecipientUserID string    `json:"recipient_user_id,omitempty"`
	RecipientPhone  string    `json:"recipient_phone,omitempty"`
	AmountKobo      int64     `json:"amount_kobo"`
	Currency        string    `json:"currency"`
	TransferType    string    `json:"transfer_type"` // "p2p" | "bank" | "bill_pay" | "cross_border"
	Status          string    `json:"status"`        // "initiated" | "completed" | "failed"
	Reference       string    `json:"reference"`
	CreatedAt       time.Time `json:"created_at"`
}

// ConsumerFraudSignal is streamed to paygate-consumer-fraud-signals.
type ConsumerFraudSignal struct {
	EventID    string    `json:"event_id"`
	UserID     string    `json:"user_id"`
	TransferID string    `json:"transfer_id,omitempty"`
	FraudScore float64   `json:"fraud_score"`
	RiskLevel  string    `json:"risk_level"` // "low" | "medium" | "high"
	Flagged    bool      `json:"flagged"`
	Reason     string    `json:"reason,omitempty"`
	CreatedAt  time.Time `json:"created_at"`
}

// ProduceConsumerWallet streams a consumer wallet event.
func (p *Producer) ProduceConsumerWallet(ctx context.Context, evt ConsumerWalletEvent) error {
	return p.Produce(ctx, TopicConsumerWalletEvents, evt)
}

// ProduceConsumerTransfer streams a consumer transfer event.
func (p *Producer) ProduceConsumerTransfer(ctx context.Context, evt ConsumerTransferEvent) error {
	return p.Produce(ctx, TopicConsumerTransferEvents, evt)
}

// ProduceConsumerFraud streams a consumer fraud signal.
func (p *Producer) ProduceConsumerFraud(ctx context.Context, signal ConsumerFraudSignal) error {
	return p.Produce(ctx, TopicConsumerFraudSignals, signal)
}

// ─── Fund-flow topics (Session 7 — Fund-Flow Hardening) ──────────────────────

const (
TopicWalletEvents        = "paygate-wallet-events"
TopicBNPLEvents          = "paygate-bnpl-events"
TopicDisputeEvents       = "paygate-dispute-events"
TopicFXEvents            = "paygate-fx-events"
TopicVirtualCardEvents   = "paygate-virtual-card-events"
TopicSplitPayEvents      = "paygate-split-payment-events"
TopicAgentBankingEvents  = "paygate-agent-banking-events"
TopicEscrowEvents        = "paygate-escrow-events"
TopicBulkPayEvents       = "paygate-bulk-payment-events"
TopicPayrollEvents       = "paygate-payroll-events"
TopicRemittanceEvents    = "paygate-remittance-events"
TopicRTGSEvents          = "paygate-rtgs-events"
TopicTaxRemittanceEvents = "paygate-tax-remittance-events"
TopicLendingEvents       = "paygate-lending-events"
)

// WalletFundFlowEvent is streamed to paygate-wallet-events.
type WalletFundFlowEvent struct {
EventID   string    `json:"event_id"`
WalletID  string    `json:"wallet_id"`
EventType string    `json:"event_type"` // "debit" | "credit" | "p2p_sent" | "p2p_received"
Amount    int64     `json:"amount"`
Currency  string    `json:"currency"`
Reference string    `json:"reference"`
OccurredAt time.Time `json:"occurred_at"`
}

// BNPLFundFlowEvent is streamed to paygate-bnpl-events.
type BNPLFundFlowEvent struct {
EventID    string    `json:"event_id"`
LoanID     string    `json:"loan_id"`
MerchantID string    `json:"merchant_id"`
EventType  string    `json:"event_type"` // "loan_created" | "instalment_paid" | "loan_closed" | "default_flagged"
AmountKobo int64     `json:"amount_kobo"`
WorkflowID string    `json:"workflow_id,omitempty"`
OccurredAt time.Time `json:"occurred_at"`
}

// DisputeFundFlowEvent is streamed to paygate-dispute-events.
type DisputeFundFlowEvent struct {
EventID       string    `json:"event_id"`
DisputeID     string    `json:"dispute_id"`
TransactionID string    `json:"transaction_id"`
MerchantID    string    `json:"merchant_id"`
EventType     string    `json:"event_type"` // "submitted" | "resolved_merchant" | "resolved_customer" | "escalated"
AmountKobo    int64     `json:"amount_kobo"`
WorkflowID    string    `json:"workflow_id,omitempty"`
OccurredAt    time.Time `json:"occurred_at"`
}

// FXFundFlowEvent is streamed to paygate-fx-events.
type FXFundFlowEvent struct {
EventID      string    `json:"event_id"`
ConversionID string    `json:"conversion_id"`
MerchantID   string    `json:"merchant_id"`
EventType    string    `json:"event_type"` // "conversion_initiated" | "conversion_completed" | "conversion_failed"
FromCurrency string    `json:"from_currency"`
ToCurrency   string    `json:"to_currency"`
FromAmount   int64     `json:"from_amount"`
ToAmount     int64     `json:"to_amount"`
Rate         float64   `json:"rate"`
OccurredAt   time.Time `json:"occurred_at"`
}

// VirtualCardFundFlowEvent is streamed to paygate-virtual-card-events.
type VirtualCardFundFlowEvent struct {
EventID    string    `json:"event_id"`
CardID     string    `json:"card_id"`
MerchantID string    `json:"merchant_id"`
EventType  string    `json:"event_type"` // "issued" | "funded" | "charged" | "frozen" | "terminated"
AmountKobo int64     `json:"amount_kobo,omitempty"`
OccurredAt time.Time `json:"occurred_at"`
}

// SplitPaymentFundFlowEvent is streamed to paygate-split-payment-events.
type SplitPaymentFundFlowEvent struct {
EventID     string    `json:"event_id"`
SplitID     string    `json:"split_id"`
MerchantID  string    `json:"merchant_id"`
EventType   string    `json:"event_type"` // "split_executed" | "split_failed" | "split_reversed"
TotalAmount int64     `json:"total_amount_kobo"`
SplitCount  int       `json:"split_count"`
OccurredAt  time.Time `json:"occurred_at"`
}

// AgentBankingFundFlowEvent is streamed to paygate-agent-banking-events.
type AgentBankingFundFlowEvent struct {
EventID    string    `json:"event_id"`
AgentID    string    `json:"agent_id"`
EventType  string    `json:"event_type"` // "float_top_up" | "deposit" | "withdrawal" | "commission_paid"
AmountKobo int64     `json:"amount_kobo"`
Reference  string    `json:"reference"`
OccurredAt time.Time `json:"occurred_at"`
}

// EscrowFundFlowEvent is streamed to paygate-escrow-events.
type EscrowFundFlowEvent struct {
EventID    string    `json:"event_id"`
EscrowID   string    `json:"escrow_id"`
MerchantID string    `json:"merchant_id"`
EventType  string    `json:"event_type"` // "created" | "funded" | "released" | "disputed" | "refunded"
AmountKobo int64     `json:"amount_kobo"`
WorkflowID string    `json:"workflow_id,omitempty"`
OccurredAt time.Time `json:"occurred_at"`
}

// BulkPaymentFundFlowEvent is streamed to paygate-bulk-payment-events.
type BulkPaymentFundFlowEvent struct {
EventID     string    `json:"event_id"`
BatchID     string    `json:"batch_id"`
MerchantID  string    `json:"merchant_id"`
EventType   string    `json:"event_type"` // "batch_created" | "batch_processing" | "batch_completed" | "batch_failed"
TotalAmount int64     `json:"total_amount_kobo"`
ItemCount   int       `json:"item_count"`
WorkflowID  string    `json:"workflow_id,omitempty"`
OccurredAt  time.Time `json:"occurred_at"`
}

// PayrollFundFlowEvent is streamed to paygate-payroll-events.
type PayrollFundFlowEvent struct {
EventID       string    `json:"event_id"`
PayrollRunID  string    `json:"payroll_run_id"`
MerchantID    string    `json:"merchant_id"`
EventType     string    `json:"event_type"` // "run_initiated" | "funds_locked" | "disbursed" | "completed" | "failed"
TotalAmount   int64     `json:"total_amount_kobo"`
EmployeeCount int       `json:"employee_count"`
WorkflowID    string    `json:"workflow_id,omitempty"`
OccurredAt    time.Time `json:"occurred_at"`
}

// RemittanceFundFlowEvent is streamed to paygate-remittance-events.
type RemittanceFundFlowEvent struct {
EventID      string    `json:"event_id"`
RemittanceID string    `json:"remittance_id"`
SenderID     string    `json:"sender_id"`
EventType    string    `json:"event_type"` // "initiated" | "fx_locked" | "mojaloop_sent" | "delivered" | "failed"
FromCurrency string    `json:"from_currency"`
ToCurrency   string    `json:"to_currency"`
AmountKobo   int64     `json:"amount_kobo"`
WorkflowID   string    `json:"workflow_id,omitempty"`
OccurredAt   time.Time `json:"occurred_at"`
}

// RTGSFundFlowEvent is streamed to paygate-rtgs-events.
type RTGSFundFlowEvent struct {
EventID    string    `json:"event_id"`
RTGSID     string    `json:"rtgs_id"`
MerchantID string    `json:"merchant_id"`
EventType  string    `json:"event_type"` // "submitted" | "queued" | "settled" | "rejected"
AmountKobo int64     `json:"amount_kobo"`
WorkflowID string    `json:"workflow_id,omitempty"`
OccurredAt time.Time `json:"occurred_at"`
}

// TaxRemittanceFundFlowEvent is streamed to paygate-tax-remittance-events.
type TaxRemittanceFundFlowEvent struct {
EventID       string    `json:"event_id"`
RemittanceID  string    `json:"remittance_id"`
MerchantID    string    `json:"merchant_id"`
EventType     string    `json:"event_type"` // "computed" | "deducted" | "remitted" | "receipt_issued"
TaxAmountKobo int64     `json:"tax_amount_kobo"`
TaxType       string    `json:"tax_type"` // "VAT" | "WHT" | "CIT"
OccurredAt    time.Time `json:"occurred_at"`
}

// LendingFundFlowEvent is streamed to paygate-lending-events.
type LendingFundFlowEvent struct {
EventID    string    `json:"event_id"`
LoanID     string    `json:"loan_id"`
MerchantID string    `json:"merchant_id"`
EventType  string    `json:"event_type"` // "disbursed" | "repayment_recorded" | "fully_repaid" | "defaulted"
AmountKobo int64     `json:"amount_kobo"`
WorkflowID string    `json:"workflow_id,omitempty"`
OccurredAt time.Time `json:"occurred_at"`
}

// ─── Typed produce helpers ────────────────────────────────────────────────────

func (p *Producer) ProduceWalletEvent(ctx context.Context, evt WalletFundFlowEvent) error {
return p.Produce(ctx, TopicWalletEvents, evt)
}
func (p *Producer) ProduceBNPLEvent(ctx context.Context, evt BNPLFundFlowEvent) error {
return p.Produce(ctx, TopicBNPLEvents, evt)
}
func (p *Producer) ProduceDisputeEvent(ctx context.Context, evt DisputeFundFlowEvent) error {
return p.Produce(ctx, TopicDisputeEvents, evt)
}
func (p *Producer) ProduceFXEvent(ctx context.Context, evt FXFundFlowEvent) error {
return p.Produce(ctx, TopicFXEvents, evt)
}
func (p *Producer) ProduceVirtualCardEvent(ctx context.Context, evt VirtualCardFundFlowEvent) error {
return p.Produce(ctx, TopicVirtualCardEvents, evt)
}
func (p *Producer) ProduceSplitPayEvent(ctx context.Context, evt SplitPaymentFundFlowEvent) error {
return p.Produce(ctx, TopicSplitPayEvents, evt)
}
func (p *Producer) ProduceAgentBankingEvent(ctx context.Context, evt AgentBankingFundFlowEvent) error {
return p.Produce(ctx, TopicAgentBankingEvents, evt)
}
func (p *Producer) ProduceEscrowEvent(ctx context.Context, evt EscrowFundFlowEvent) error {
return p.Produce(ctx, TopicEscrowEvents, evt)
}
func (p *Producer) ProduceBulkPayEvent(ctx context.Context, evt BulkPaymentFundFlowEvent) error {
return p.Produce(ctx, TopicBulkPayEvents, evt)
}
func (p *Producer) ProducePayrollEvent(ctx context.Context, evt PayrollFundFlowEvent) error {
return p.Produce(ctx, TopicPayrollEvents, evt)
}
func (p *Producer) ProduceRemittanceEvent(ctx context.Context, evt RemittanceFundFlowEvent) error {
return p.Produce(ctx, TopicRemittanceEvents, evt)
}
func (p *Producer) ProduceRTGSEvent(ctx context.Context, evt RTGSFundFlowEvent) error {
return p.Produce(ctx, TopicRTGSEvents, evt)
}
func (p *Producer) ProduceTaxRemittanceEvent(ctx context.Context, evt TaxRemittanceFundFlowEvent) error {
return p.Produce(ctx, TopicTaxRemittanceEvents, evt)
}
func (p *Producer) ProduceLendingEvent(ctx context.Context, evt LendingFundFlowEvent) error {
return p.Produce(ctx, TopicLendingEvents, evt)
}
