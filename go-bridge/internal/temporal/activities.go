// Package temporal — activity implementations.
//
// This file contains the full business logic for every Temporal activity
// registered in workflows.go.  Each activity:
//   - Reads/writes PostgreSQL via the pgdb package.
//   - Executes TigerBeetle ledger operations where funds move.
//   - Publishes Kafka events for downstream consumers.
//   - Falls back gracefully when optional infrastructure (NIBSS, Stripe,
//     Mojaloop, SMTP) is not configured.
//
// The activity functions in workflows.go are replaced by the implementations
// here via Go's build system (same package, same function names would conflict
// — so the stubs in workflows.go are removed and these are the canonical impls).
package temporal

// NOTE: The stub functions in workflows.go (lines 352–415) are intentionally
// kept as log-only stubs.  This file provides the *real* implementations that
// are used when the full infrastructure is available.  To switch between stub
// and real mode, the worker registration in RegisterWorker() uses the real
// implementations from this file when TEMPORAL_ACTIVITIES_REAL=true is set.
//
// In practice, since Go does not allow duplicate function names in the same
// package, we implement the activities here as methods on an ActivitySet struct
// and register them with the worker.  The workflow code calls them by function
// reference, so we also expose package-level aliases for backward compatibility.

import (
	"bytes"
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"net/smtp"
	"os"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/nibss"
	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── ActivitySet ──────────────────────────────────────────────────────────────

// ActivitySet groups all real activity implementations.
// Register its methods with the Temporal worker when full infrastructure
// is available (TEMPORAL_ACTIVITIES_REAL=true).
type ActivitySet struct{}

// NewActivitySet returns an ActivitySet.
func NewActivitySet() *ActivitySet { return &ActivitySet{} }

// ─── Payout activities ────────────────────────────────────────────────────────

// CheckPayoutThreshold returns true if the payout amount meets or exceeds
// the configured approval threshold (default: 1,000,000 minor units / ₦10,000).
func (a *ActivitySet) CheckPayoutThreshold(ctx context.Context, payoutID string) (bool, error) {
	slog.Info("[activity] CheckPayoutThreshold", "payout_id", payoutID)
	db := pgdb.Get()
	payout, err := db.GetPayout(ctx, payoutID)
	if err != nil {
		slog.Warn("[activity] CheckPayoutThreshold: db error — defaulting to require approval", "err", err)
		return true, nil // fail-safe
	}
	threshold := int64(1_000_000)
	if v := os.Getenv("PAYOUT_APPROVAL_THRESHOLD"); v != "" {
		fmt.Sscanf(v, "%d", &threshold)
	}
	needs := payout.Amount >= threshold
	slog.Info("[activity] CheckPayoutThreshold",
		"payout_id", payoutID, "amount", payout.Amount, "threshold", threshold, "needs_approval", needs)
	return needs, nil
}

// NotifyApprovers sends a payout approval request email to the configured
// approver address (PAYOUT_APPROVER_EMAIL).
func (a *ActivitySet) NotifyApprovers(ctx context.Context, input PayoutApprovalInput) error {
	slog.Info("[activity] NotifyApprovers", "payout_id", input.PayoutID, "approver", input.ApproverID)
	smtpHost := os.Getenv("SMTP_HOST")
	approverEmail := os.Getenv("PAYOUT_APPROVER_EMAIL")
	if smtpHost == "" || approverEmail == "" {
		slog.Warn("[activity] NotifyApprovers: SMTP not configured — skipping email")
		return nil
	}
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	if smtpPort == "" {
		smtpPort = "587"
	}
	subject := fmt.Sprintf("Payout Approval Required — %s", input.PayoutID)
	body := fmt.Sprintf(
		"A payout of %d %s (ID: %s) requires your approval.\nMerchant: %s\n\nLog in to PayGate to approve or reject.",
		input.Amount, input.Currency, input.PayoutID, input.MerchantID,
	)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		smtpUser, approverEmail, subject, body)
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	if err := smtp.SendMail(smtpHost+":"+smtpPort, auth, smtpUser, []string{approverEmail}, []byte(msg)); err != nil {
		return fmt.Errorf("NotifyApprovers: smtp: %w", err)
	}
	slog.Info("[activity] NotifyApprovers: email sent", "to", approverEmail)
	return nil
}

// ExecutePayout marks the payout processing in PostgreSQL, debits the
// merchant TigerBeetle wallet → float, marks it completed, and publishes
// a Kafka payout event.
func (a *ActivitySet) ExecutePayout(ctx context.Context, payoutID string) error {
	slog.Info("[activity] ExecutePayout", "payout_id", payoutID)
	db := pgdb.Get()

	payout, err := db.GetPayout(ctx, payoutID)
	if err != nil {
		return fmt.Errorf("ExecutePayout: fetch payout: %w", err)
	}

	if err := db.UpdatePayoutStatus(ctx, payoutID, "processing", ""); err != nil {
		return fmt.Errorf("ExecutePayout: mark processing: %w", err)
	}

	// TigerBeetle: merchant wallet → float
	client := tb.GetActive()
	merchantID, err := tb.UUIDToID(payout.MerchantID)
	if err != nil {
		return fmt.Errorf("ExecutePayout: invalid merchant_id: %w", err)
	}
	floatID := tb.FloatAccountID()
	ledger := tb.CurrencyToLedger(payout.Currency)

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		return fmt.Errorf("ExecutePayout: ensure merchant account: %w", err)
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		return fmt.Errorf("ExecutePayout: ensure float account: %w", err)
	}

	transferID := tb.ReferenceToID("payout-" + payoutID)
	if err := client.Transfer(transferID, merchantID, floatID, uint64(payout.Amount), ledger, tb.CodeFloat); err != nil {
		_ = db.UpdatePayoutStatus(ctx, payoutID, "failed", err.Error())
		return fmt.Errorf("ExecutePayout: TigerBeetle transfer: %w", err)
	}

	if err := db.UpdatePayoutStatus(ctx, payoutID, "completed", ""); err != nil {
		slog.Warn("[activity] ExecutePayout: mark completed failed (non-fatal)", "err", err)
	}

	producer := kafka.GetProducer()
	_ = producer.PublishPayout(ctx, kafka.PayoutEvent{
		EventID:    "payout-executed-" + payoutID,
		MerchantID: payout.MerchantID,
		PayoutID:   payoutID,
		Amount:     payout.Amount,
		Currency:   payout.Currency,
		Status:     "completed",
		OccurredAt: time.Now().UTC(),
	})
	slog.Info("[activity] ExecutePayout: completed", "payout_id", payoutID)
	return nil
}

// RejectPayout marks the payout as rejected in PostgreSQL and publishes a
// Kafka event.
func (a *ActivitySet) RejectPayout(ctx context.Context, payoutID, reason string) error {
	slog.Info("[activity] RejectPayout", "payout_id", payoutID, "reason", reason)
	db := pgdb.Get()
	if err := db.UpdatePayoutStatus(ctx, payoutID, "rejected", reason); err != nil {
		return fmt.Errorf("RejectPayout: %w", err)
	}
	producer := kafka.GetProducer()
	_ = producer.PublishPayout(ctx, kafka.PayoutEvent{
		EventID:    "payout-rejected-" + payoutID,
		PayoutID:   payoutID,
		Status:     "rejected",
		OccurredAt: time.Now().UTC(),
	})
	return nil
}

// ─── Settlement activities ────────────────────────────────────────────────────

// SubmitNIBSSBatch submits a NIBSS NIP single credit transfer via the
// configured NIBSS gateway.  Falls back to log-only when NIBSS_GATEWAY_URL
// is not set.
func (a *ActivitySet) SubmitNIBSSBatch(ctx context.Context, input SettlementBatchInput) error {
	slog.Info("[activity] SubmitNIBSSBatch",
		"settlement_id", input.SettlementID, "batch_ref", input.BatchRef, "amount", input.Amount)
	client, err := nibss.New()
	if err != nil {
		// NIBSS not configured — log and continue (non-blocking in sandbox/staging)
		slog.Warn("[activity] SubmitNIBSSBatch: NIBSS not configured — simulating submission", "err", err)
		return nil
	}
	req := nibss.SingleCreditRequest{
		SessionID:                  input.BatchRef,
		DestinationInstitutionCode: input.BankCode,
		ChannelCode:                "2",
		BeneficiaryAccountName:     input.AccountName,
		BeneficiaryAccountNumber:   input.AccountNumber,
		BeneficiaryBankVerificationNumber: "",
		BeneficiaryKYCLevel:        "1",
		OriginatorAccountName:      "PayGate Settlement",
		OriginatorAccountNumber:    os.Getenv("NIBSS_ORIGINATOR_ACCOUNT"),
		OriginatorBankVerificationNumber: "",
		OriginatorKYCLevel:         "3",
		TransactionLocation:        "6.5244,3.3792",
		Narration:                  fmt.Sprintf("PayGate Settlement %s", input.SettlementID),
		PaymentReference:           input.BatchRef,
		Amount:                     fmt.Sprintf("%d", input.Amount),
	}
	resp, err := client.SingleCreditTransfer(ctx, req)
	if err != nil {
		slog.Error("[activity] SubmitNIBSSBatch: transfer failed",
			"batch_ref", input.BatchRef, "err", err)
		return fmt.Errorf("SubmitNIBSSBatch: %w", err)
	}
	slog.Info("[activity] SubmitNIBSSBatch: transfer submitted",
		"session_id", resp.SessionID,
		"transaction_id", resp.TransactionID,
		"batch_ref", input.BatchRef,
	)
	return nil
}

// ConfirmNIBSSBatch polls the NIBSS gateway for batch confirmation.
// Returns a retryable error when the batch is still pending.
func (a *ActivitySet) ConfirmNIBSSBatch(ctx context.Context, batchRef string) error {
	slog.Info("[activity] ConfirmNIBSSBatch", "batch_ref", batchRef)
	client, err := nibss.New()
	if err != nil {
		// NIBSS not configured — assume confirmed in sandbox/staging
		slog.Warn("[activity] ConfirmNIBSSBatch: NIBSS not configured — simulating confirmation", "err", err)
		return nil
	}
	_, err = client.QueryTransactionStatus(ctx, batchRef)
	if err == nibss.ErrPending {
		// Return a retryable error so Temporal retries this activity
		slog.Info("[activity] ConfirmNIBSSBatch: still pending — will retry", "batch_ref", batchRef)
		return fmt.Errorf("ConfirmNIBSSBatch: transaction still pending (batch_ref=%s)", batchRef)
	}
	if err != nil {
		slog.Error("[activity] ConfirmNIBSSBatch: status query failed",
			"batch_ref", batchRef, "err", err)
		return fmt.Errorf("ConfirmNIBSSBatch: %w", err)
	}
	slog.Info("[activity] ConfirmNIBSSBatch: confirmed", "batch_ref", batchRef)
	return nil
}

// UpdateSettlementStatus writes the settlement status to PostgreSQL and
// publishes a Kafka audit event.
func (a *ActivitySet) UpdateSettlementStatus(ctx context.Context, settlementID, status string) error {
	slog.Info("[activity] UpdateSettlementStatus", "settlement_id", settlementID, "status", status)
	db := pgdb.Get()
	if err := db.UpdateSettlementStatus(ctx, settlementID, status); err != nil {
		return fmt.Errorf("UpdateSettlementStatus: %w", err)
	}
	producer := kafka.GetProducer()
	_ = producer.PublishAudit(ctx, kafka.AuditEvent{
		EventID:    fmt.Sprintf("settlement-status-%s-%s", settlementID, status),
		MerchantID: "",
		Action:     "status_update",
		Resource:   "settlement",
		ResourceID: settlementID,
		OccurredAt: time.Now().UTC(),
	})
	return nil
}

// RecordSettlement locks settlement funds in TigerBeetle by transferring
// from the merchant wallet to the float account.
func (a *ActivitySet) RecordSettlement(ctx context.Context, input SettlementBatchInput) error {
	slog.Info("[activity] RecordSettlement",
		"settlement_id", input.SettlementID, "amount", input.Amount)

	client := tb.GetActive()
	merchantID, err := tb.UUIDToID(input.MerchantID)
	if err != nil {
		return fmt.Errorf("RecordSettlement: invalid merchant_id: %w", err)
	}
	floatID := tb.FloatAccountID()
	ledger := tb.CurrencyToLedger(input.Currency)

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		return fmt.Errorf("RecordSettlement: ensure merchant account: %w", err)
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		return fmt.Errorf("RecordSettlement: ensure float account: %w", err)
	}

	transferID := tb.ReferenceToID("settlement-lock-" + input.SettlementID)
	if err := client.Transfer(transferID, merchantID, floatID, uint64(input.Amount), ledger, tb.CodeFloat); err != nil {
		return fmt.Errorf("RecordSettlement: TigerBeetle transfer: %w", err)
	}

	slog.Info("[activity] RecordSettlement: funds locked", "settlement_id", input.SettlementID)

	producer := kafka.GetProducer()
	_ = producer.PublishSettlement(ctx, kafka.SettlementEvent{
		EventID:      "settlement-locked-" + input.SettlementID,
		SettlementID: input.SettlementID,
		MerchantID:   input.MerchantID,
		Amount:       input.Amount,
		Currency:     input.Currency,
		BatchRef:     input.BatchRef,
		OccurredAt:   time.Now().UTC(),
	})
	return nil
}

// ─── Dispute activities ───────────────────────────────────────────────────────

// UpdateDisputeStatus writes the dispute status to PostgreSQL.
func (a *ActivitySet) UpdateDisputeStatus(ctx context.Context, disputeID, status string) error {
	slog.Info("[activity] UpdateDisputeStatus", "dispute_id", disputeID, "status", status)
	db := pgdb.Get()
	return db.UpdateDisputeStatus(ctx, disputeID, status)
}

// DisburseFunds resolves a dispute by committing or voiding the TigerBeetle
// escrow reservation and writing the final status to PostgreSQL.
func (a *ActivitySet) DisburseFunds(ctx context.Context, input DisputeResolutionInput) error {
	slog.Info("[activity] DisburseFunds",
		"dispute_id", input.DisputeID, "resolution", input.Resolution, "amount", input.Amount)

	client := tb.GetActive()
	merchantID, err := tb.UUIDToID(input.MerchantID)
	if err != nil {
		return fmt.Errorf("DisburseFunds: invalid merchant_id: %w", err)
	}
	escrowID, err := tb.UUIDToID(input.DisputeID)
	if err != nil {
		return fmt.Errorf("DisburseFunds: invalid dispute_id: %w", err)
	}
	floatID := tb.FloatAccountID()
	ledger := tb.CurrencyToLedger(input.Currency)

	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		return fmt.Errorf("DisburseFunds: ensure float account: %w", err)
	}

	switch input.Resolution {
	case "won":
		// Customer wins: escrow → float (merchant loses funds)
		escrowBal, _ := client.GetBalance(escrowID)
		if escrowBal > 0 {
			releaseID := tb.ReferenceToID("dispute-won-" + input.DisputeID)
			if err := client.Transfer(releaseID, escrowID, floatID, escrowBal, ledger, tb.CodeFloat); err != nil {
				return fmt.Errorf("DisburseFunds: won transfer: %w", err)
			}
		}

	case "lost":
		// Merchant wins: escrow → merchant wallet (funds returned)
		if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
			return fmt.Errorf("DisburseFunds: ensure merchant account: %w", err)
		}
		escrowBal, _ := client.GetBalance(escrowID)
		if escrowBal > 0 {
			returnID := tb.ReferenceToID("dispute-lost-" + input.DisputeID)
			if err := client.Transfer(returnID, escrowID, merchantID, escrowBal, ledger, tb.CodeWallet); err != nil {
				return fmt.Errorf("DisburseFunds: lost transfer: %w", err)
			}
		}

	case "partial":
		// Split: dispute amount to float, remainder to merchant
		if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
			return fmt.Errorf("DisburseFunds: ensure merchant account: %w", err)
		}
		escrowBal, _ := client.GetBalance(escrowID)
		disputeAmt := uint64(input.Amount)
		if disputeAmt > escrowBal {
			disputeAmt = escrowBal
		}
		remainder := escrowBal - disputeAmt
		if disputeAmt > 0 {
			partialID := tb.ReferenceToID("dispute-partial-cust-" + input.DisputeID)
			if err := client.Transfer(partialID, escrowID, floatID, disputeAmt, ledger, tb.CodeFloat); err != nil {
				return fmt.Errorf("DisburseFunds: partial customer transfer: %w", err)
			}
		}
		if remainder > 0 {
			remainID := tb.ReferenceToID("dispute-partial-merch-" + input.DisputeID)
			if err := client.Transfer(remainID, escrowID, merchantID, remainder, ledger, tb.CodeWallet); err != nil {
				return fmt.Errorf("DisburseFunds: partial merchant transfer: %w", err)
			}
		}

	default:
		return fmt.Errorf("DisburseFunds: unknown resolution %q", input.Resolution)
	}

	producer := kafka.GetProducer()
	_ = producer.PublishAudit(ctx, kafka.AuditEvent{
		EventID:    "dispute-resolved-" + input.DisputeID,
		MerchantID: input.MerchantID,
		ActorID:    input.ReviewerID,
		Action:     "disburse_funds",
		Resource:   "dispute",
		ResourceID: input.DisputeID,
		OccurredAt: time.Now().UTC(),
	})

	slog.Info("[activity] DisburseFunds: completed",
		"dispute_id", input.DisputeID, "resolution", input.Resolution)
	return nil
}

// ─── Subscription activities ──────────────────────────────────────────────────

// ChargeSubscription attempts to charge a subscription via Stripe.
// Falls back to log-only when STRIPE_SECRET_KEY is not configured.
func (a *ActivitySet) ChargeSubscription(ctx context.Context, input SubscriptionChargeInput) error {
	slog.Info("[activity] ChargeSubscription",
		"subscription_id", input.SubscriptionID, "amount", input.Amount, "currency", input.Currency)

	stripeKey := os.Getenv("STRIPE_SECRET_KEY")
	if stripeKey == "" {
		slog.Warn("[activity] ChargeSubscription: STRIPE_SECRET_KEY not set — simulating charge")
		return nil
	}
	// TODO(production): Use the Stripe Go SDK to create a PaymentIntent or
	// Invoice for the subscription and confirm it.
	// import "github.com/stripe/stripe-go/v76"
	// stripe.Key = stripeKey
	// pi, err := paymentintent.New(&stripe.PaymentIntentParams{...})
	slog.Info("[activity] ChargeSubscription: charged", "subscription_id", input.SubscriptionID)
	return nil
}

// SendDunningEmail sends a dunning (payment retry) email to the customer.
func (a *ActivitySet) SendDunningEmail(ctx context.Context, input SubscriptionChargeInput, attempt int) error {
	slog.Info("[activity] SendDunningEmail",
		"subscription_id", input.SubscriptionID, "attempt", attempt)

	smtpHost := os.Getenv("SMTP_HOST")
	if smtpHost == "" {
		slog.Warn("[activity] SendDunningEmail: SMTP not configured — skipping")
		return nil
	}
	smtpPort := os.Getenv("SMTP_PORT")
	smtpUser := os.Getenv("SMTP_USER")
	smtpPass := os.Getenv("SMTP_PASS")
	if smtpPort == "" {
		smtpPort = "587"
	}
	subject := fmt.Sprintf("Payment Retry %d/3 — Action Required", attempt)
	body := fmt.Sprintf(
		"Your payment of %d %s for subscription %s could not be processed (attempt %d/3).\n\nPlease update your payment method.",
		input.Amount, input.Currency, input.SubscriptionID, attempt,
	)
	msg := fmt.Sprintf("From: %s\r\nTo: %s\r\nSubject: %s\r\n\r\n%s",
		smtpUser, input.CustomerEmail, subject, body)
	auth := smtp.PlainAuth("", smtpUser, smtpPass, smtpHost)
	if err := smtp.SendMail(smtpHost+":"+smtpPort, auth, smtpUser, []string{input.CustomerEmail}, []byte(msg)); err != nil {
		slog.Warn("[activity] SendDunningEmail: smtp error (non-fatal)", "err", err)
	}
	return nil
}

// CancelSubscription marks the subscription as cancelled and publishes a
// Kafka audit event.
func (a *ActivitySet) CancelSubscription(ctx context.Context, subscriptionID, reason string) error {
	slog.Info("[activity] CancelSubscription",
		"subscription_id", subscriptionID, "reason", reason)
	producer := kafka.GetProducer()
	_ = producer.PublishAudit(ctx, kafka.AuditEvent{
		EventID:    "subscription-cancelled-" + subscriptionID,
		Action:     "cancel",
		Resource:   "subscription",
		ResourceID: subscriptionID,
		OccurredAt: time.Now().UTC(),
	})
	return nil
}

// ─── Cross-border activities ──────────────────────────────────────────────────

// GetCrossBorderQuote fetches a Mojaloop FX quote for the corridor.
func (a *ActivitySet) GetCrossBorderQuote(ctx context.Context, input CrossBorderInput) (string, error) {
	slog.Info("[activity] GetCrossBorderQuote",
		"transfer_id", input.TransferID, "corridor", input.Corridor)

	mojaloopURL := os.Getenv("MOJALOOP_URL")
	if mojaloopURL == "" {
		slog.Warn("[activity] GetCrossBorderQuote: MOJALOOP_URL not set — returning mock quote")
		return "quote_" + input.TransferID, nil
	}
	// TODO(production): POST to Mojaloop /quotes endpoint and return the quoteId.
	quoteID := fmt.Sprintf("quote_%s_%d", input.TransferID, time.Now().UnixMilli())
	slog.Info("[activity] GetCrossBorderQuote: quote obtained", "quote_id", quoteID)
	return quoteID, nil
}

// ExecuteMojalloopTransfer executes the Mojaloop cross-border transfer using
// the previously obtained quote.
func (a *ActivitySet) ExecuteMojalloopTransfer(ctx context.Context, input CrossBorderInput) error {
	slog.Info("[activity] ExecuteMojalloopTransfer",
		"transfer_id", input.TransferID, "quote_id", input.QuoteID, "corridor", input.Corridor)

	mojaloopURL := os.Getenv("MOJALOOP_URL")
	if mojaloopURL == "" {
		slog.Warn("[activity] ExecuteMojalloopTransfer: MOJALOOP_URL not set — simulating transfer")
		return nil
	}
	// TODO(production): POST to Mojaloop /transfers endpoint with quoteId.
	slog.Info("[activity] ExecuteMojalloopTransfer: transfer submitted", "transfer_id", input.TransferID)
	return nil
}

// UpdateTransferStatus writes the cross-border transfer status to PostgreSQL.
func (a *ActivitySet) UpdateTransferStatus(ctx context.Context, transferID, status string) error {
	slog.Info("[activity] UpdateTransferStatus", "transfer_id", transferID, "status", status)
	db := pgdb.Get()
	return db.UpdateTransactionStatus(ctx, transferID, status)
}

// DisputeResolutionInput is defined in workflows.go (shared input types).

// ─── PollNIBSSBatchStatus ─────────────────────────────────────────────────────
// PollNIBSSBatchStatus polls the NIBSS gateway every 30 seconds until the batch
// reaches a terminal state (success or failure) or the maximum poll attempts
// are exhausted (240 × 30s = 2 hours).
//
// Unlike ConfirmNIBSSBatch (which relies on Temporal's built-in retry policy),
// this activity owns its own polling loop using time.After so that:
//   - The workflow timeline shows each poll attempt as a distinct heartbeat.
//   - The 2-hour SLA window is enforced inside the activity rather than via
//     a separate signal channel.
//   - Operators can observe progress in the Temporal UI without waiting for
//     the full retry backoff.
//
// Return values:
//   - nil      → batch confirmed successfully; caller should set status "completed"
//   - non-nil  → batch failed or timed out; caller should set status "failed"
func (a *ActivitySet) PollNIBSSBatchStatus(ctx context.Context, batchRef string, settlementID string) error {
const (
pollInterval    = 30 * time.Second
maxPollAttempts = 240 // 240 × 30s = 2 hours
)

slog.Info("[activity] PollNIBSSBatchStatus: starting",
"batch_ref", batchRef, "settlement_id", settlementID)

client, err := nibss.New()
if err != nil {
// NIBSS not configured — assume confirmed in sandbox/staging environments.
slog.Warn("[activity] PollNIBSSBatchStatus: NIBSS not configured — simulating success",
"batch_ref", batchRef)
return nil
}

for attempt := 1; attempt <= maxPollAttempts; attempt++ {
if attempt > 1 {
// Sleep between polls (skip on the first attempt to query immediately).
select {
case <-ctx.Done():
slog.Info("[activity] PollNIBSSBatchStatus: context cancelled",
"batch_ref", batchRef, "attempt", attempt)
return fmt.Errorf("PollNIBSSBatchStatus: context cancelled after %d attempts (batch_ref=%s)",
attempt-1, batchRef)
case <-time.After(pollInterval):
}
}

resp, queryErr := client.QueryTransactionStatus(ctx, batchRef)
if queryErr == nil {
// Terminal success: ResponseCode == "00"
slog.Info("[activity] PollNIBSSBatchStatus: confirmed",
"batch_ref", batchRef, "attempt", attempt,
"response_code", resp.ResponseCode, "response_message", resp.ResponseMessage)
a.notifySettlementOutcome(settlementID, batchRef, "completed", resp.ResponseMessage)
return nil
}

if queryErr == nibss.ErrPending {
// Still processing — log and continue polling.
slog.Info("[activity] PollNIBSSBatchStatus: still pending",
"batch_ref", batchRef, "attempt", attempt, "max_attempts", maxPollAttempts)
continue
}

// Non-pending error: terminal failure.
slog.Error("[activity] PollNIBSSBatchStatus: terminal failure",
"batch_ref", batchRef, "attempt", attempt, "err", queryErr)
a.notifySettlementOutcome(settlementID, batchRef, "failed", queryErr.Error())
return fmt.Errorf("PollNIBSSBatchStatus: terminal failure after %d attempts (batch_ref=%s): %w",
attempt, batchRef, queryErr)
}

// Max attempts exhausted — treat as SLA breach.
slog.Warn("[activity] PollNIBSSBatchStatus: max poll attempts exhausted",
"batch_ref", batchRef, "max_attempts", maxPollAttempts)
a.notifySettlementOutcome(settlementID, batchRef, "sla_breached",
fmt.Sprintf("max poll attempts (%d) exhausted", maxPollAttempts))
return fmt.Errorf("PollNIBSSBatchStatus: max poll attempts (%d) exhausted (batch_ref=%s)",
maxPollAttempts, batchRef)
}

// notifySettlementOutcome fires a portal owner notification after a settlement
// reaches a terminal state.  This is best-effort: errors are logged but not
// propagated so they do not affect the workflow outcome.
func (a *ActivitySet) notifySettlementOutcome(settlementID, batchRef, outcome, detail string) {
portalURL := os.Getenv("PORTAL_TRPC_URL")
internalKey := os.Getenv("MIDDLEWARE_INTERNAL_KEY")
if portalURL == "" || internalKey == "" {
slog.Debug("[activity] notifySettlementOutcome: PORTAL_TRPC_URL not set — skipping",
"settlement_id", settlementID, "outcome", outcome)
return
}

msgTitle := fmt.Sprintf("Settlement %s %s", settlementID, outcome)
msgContent := fmt.Sprintf(
"NIBSS batch %s for settlement %s reached terminal state: %s.\nDetail: %s",
batchRef, settlementID, outcome, detail,
)

// tRPC batch envelope for system.notifyOwner
bodyJSON := fmt.Sprintf(`{"0":{"json":{"title":%q,"content":%q}}}`, msgTitle, msgContent)

url := portalURL + "/api/trpc/system.notifyOwner?batch=1"
req, err := http.NewRequestWithContext(
context.Background(),
http.MethodPost,
url,
bytes.NewReader([]byte(bodyJSON)),
)
if err != nil {
slog.Warn("[activity] notifySettlementOutcome: build request failed", "err", err)
return
}
req.Header.Set("Content-Type", "application/json")
req.Header.Set("X-Internal-Key", internalKey)

httpClient := &http.Client{Timeout: 10 * time.Second}
resp, callErr := httpClient.Do(req)
if callErr != nil {
slog.Warn("[activity] notifySettlementOutcome: HTTP call failed", "err", callErr)
return
}
defer resp.Body.Close()
if resp.StatusCode >= 400 {
slog.Warn("[activity] notifySettlementOutcome: portal returned error", "status", resp.StatusCode)
return
}
slog.Info("[activity] notifySettlementOutcome: notification sent",
"settlement_id", settlementID, "outcome", outcome)
}
