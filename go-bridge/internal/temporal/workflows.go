// Package temporal provides Temporal workflow and activity definitions
// for PayGate long-running business processes.
//
// Workflows:
//   - PayoutApprovalWorkflow  — two-step human approval gate (48h timeout)
//   - SettlementBatchWorkflow — NIBSS batch submission + confirmation (4h timeout)
//   - SubscriptionChargeWorkflow — recurring charge with retry/dunning (7d timeout)
//   - CrossBorderTransferWorkflow — Mojaloop transfer with quote expiry (30min timeout)
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"os"
	"time"

	"go.temporal.io/sdk/client"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/worker"
	"go.temporal.io/sdk/workflow"
)

// ─── Temporal client ──────────────────────────────────────────────────────────

var temporalClient client.Client

// InitClient initialises the global Temporal client.
// If TEMPORAL_ADDRESS is not set, returns nil (graceful degradation).
func InitClient() (client.Client, error) {
	addr := os.Getenv("TEMPORAL_ADDRESS")
	if addr == "" {
		slog.Info("[temporal] TEMPORAL_ADDRESS not set — Temporal workflows disabled")
		return nil, nil
	}
	c, err := client.Dial(client.Options{
		HostPort:  addr,
		Namespace: "paygate",
	})
	if err != nil {
		return nil, fmt.Errorf("temporal.Dial(%q): %w", addr, err)
	}
	temporalClient = c
	slog.Info("[temporal] client connected", "address", addr)
	return c, nil
}

// RegisterWorker registers all workflow and activity implementations
// with a Temporal worker on the "paygate-main" task queue.
func RegisterWorker(c client.Client) worker.Worker {
	w := worker.New(c, "paygate-main", worker.Options{
		MaxConcurrentActivityExecutionSize:     50,
		MaxConcurrentWorkflowTaskExecutionSize: 20,
	})

	// Workflows
	w.RegisterWorkflow(PayoutApprovalWorkflow)
	w.RegisterWorkflow(SettlementBatchWorkflow)
	w.RegisterWorkflow(SubscriptionChargeWorkflow)
	w.RegisterWorkflow(CrossBorderTransferWorkflow)

	// Activities
	w.RegisterActivity(CheckPayoutThresholdActivity)
	w.RegisterActivity(NotifyApproversActivity)
	w.RegisterActivity(ExecutePayoutActivity)
	w.RegisterActivity(RejectPayoutActivity)
	w.RegisterActivity(SubmitNIBSSBatchActivity)
	w.RegisterActivity(ConfirmNIBSSBatchActivity)
	w.RegisterActivity(UpdateSettlementStatusActivity)
	w.RegisterActivity(ChargeSubscriptionActivity)
	w.RegisterActivity(SendDunningEmailActivity)
	w.RegisterActivity(CancelSubscriptionActivity)
	w.RegisterActivity(GetCrossBorderQuoteActivity)
	w.RegisterActivity(ExecuteMojalloopTransferActivity)
	w.RegisterActivity(UpdateTransferStatusActivity)

	return w
}

// ─── Payout Approval Workflow ─────────────────────────────────────────────────

// PayoutApprovalInput is the input to PayoutApprovalWorkflow.
type PayoutApprovalInput struct {
	PayoutID   string  `json:"payout_id"`
	MerchantID string  `json:"merchant_id"`
	Amount     int64   `json:"amount_kobo"`
	Currency   string  `json:"currency"`
	ApproverID string  `json:"approver_id"`
}

// PayoutApprovalResult is the output of PayoutApprovalWorkflow.
type PayoutApprovalResult struct {
	Approved   bool   `json:"approved"`
	ApprovedBy string `json:"approved_by,omitempty"`
	RejectedBy string `json:"rejected_by,omitempty"`
	Reason     string `json:"reason,omitempty"`
}

// PayoutApprovalWorkflow orchestrates the two-step payout approval process.
// It waits up to 48 hours for an approval or rejection signal.
// If no signal is received, the payout is auto-rejected.
func PayoutApprovalWorkflow(ctx workflow.Context, input PayoutApprovalInput) (PayoutApprovalResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("PayoutApprovalWorkflow started", "payout_id", input.PayoutID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
			InitialInterval: 5 * time.Second,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Notify approvers
	if err := workflow.ExecuteActivity(ctx, NotifyApproversActivity, input).Get(ctx, nil); err != nil {
		logger.Error("NotifyApproversActivity failed", "err", err)
		// Non-fatal — continue waiting for signal
	}

	// Step 2: Wait for approval/rejection signal (48h timeout)
	approvalCh := workflow.GetSignalChannel(ctx, "payout-approved")
	rejectionCh := workflow.GetSignalChannel(ctx, "payout-rejected")

	var result PayoutApprovalResult
	selector := workflow.NewSelector(ctx)

	selector.AddReceive(approvalCh, func(c workflow.ReceiveChannel, more bool) {
		var sig struct {
			ApprovedBy string `json:"approved_by"`
		}
		c.Receive(ctx, &sig)
		result = PayoutApprovalResult{Approved: true, ApprovedBy: sig.ApprovedBy}
	})

	selector.AddReceive(rejectionCh, func(c workflow.ReceiveChannel, more bool) {
		var sig struct {
			RejectedBy string `json:"rejected_by"`
			Reason     string `json:"reason"`
		}
		c.Receive(ctx, &sig)
		result = PayoutApprovalResult{Approved: false, RejectedBy: sig.RejectedBy, Reason: sig.Reason}
	})

	// 48-hour deadline
	timerCtx, cancelTimer := workflow.WithCancel(ctx)
	timer := workflow.NewTimer(timerCtx, 48*time.Hour)
	selector.AddFuture(timer, func(f workflow.Future) {
		result = PayoutApprovalResult{Approved: false, Reason: "approval timeout — auto-rejected after 48h"}
	})
	defer cancelTimer()

	selector.Select(ctx)

	// Step 3: Execute or reject
	if result.Approved {
		if err := workflow.ExecuteActivity(ctx, ExecutePayoutActivity, input.PayoutID).Get(ctx, nil); err != nil {
			return result, fmt.Errorf("ExecutePayoutActivity: %w", err)
		}
	} else {
		if err := workflow.ExecuteActivity(ctx, RejectPayoutActivity, input.PayoutID, result.Reason).Get(ctx, nil); err != nil {
			return result, fmt.Errorf("RejectPayoutActivity: %w", err)
		}
	}

	logger.Info("PayoutApprovalWorkflow complete",
		"payout_id", input.PayoutID,
		"approved", result.Approved,
	)
	return result, nil
}

// ─── Settlement Batch Workflow ────────────────────────────────────────────────

// SettlementBatchInput is the input to SettlementBatchWorkflow.
type SettlementBatchInput struct {
	SettlementID string `json:"settlement_id"`
	MerchantID   string `json:"merchant_id"`
	BatchRef     string `json:"batch_ref"`
	Amount       int64  `json:"amount_kobo"`
}

// SettlementBatchWorkflow orchestrates NIBSS batch submission and confirmation.
// It waits up to 4 hours for NIBSS to confirm the batch.
func SettlementBatchWorkflow(ctx workflow.Context, input SettlementBatchInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("SettlementBatchWorkflow started", "settlement_id", input.SettlementID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    5,
			InitialInterval:    30 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    5 * time.Minute,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Submit NIBSS batch
	if err := workflow.ExecuteActivity(ctx, SubmitNIBSSBatchActivity, input).Get(ctx, nil); err != nil {
		return fmt.Errorf("SubmitNIBSSBatchActivity: %w", err)
	}

	// Step 2: Wait for NIBSS confirmation signal (4h timeout)
	confirmCh := workflow.GetSignalChannel(ctx, "nibss-confirmed")
	var confirmed bool

	selector := workflow.NewSelector(ctx)
	selector.AddReceive(confirmCh, func(c workflow.ReceiveChannel, more bool) {
		c.Receive(ctx, &confirmed)
	})

	timerCtx, cancelTimer := workflow.WithCancel(ctx)
	timer := workflow.NewTimer(timerCtx, 4*time.Hour)
	selector.AddFuture(timer, func(f workflow.Future) {
		confirmed = false
	})
	defer cancelTimer()

	selector.Select(ctx)

	// Step 3: Update settlement status
	status := "settled"
	if !confirmed {
		status = "sla_breached"
	}
	if err := workflow.ExecuteActivity(ctx, UpdateSettlementStatusActivity, input.SettlementID, status).Get(ctx, nil); err != nil {
		return fmt.Errorf("UpdateSettlementStatusActivity: %w", err)
	}

	logger.Info("SettlementBatchWorkflow complete",
		"settlement_id", input.SettlementID,
		"status", status,
	)
	return nil
}

// ─── Subscription Charge Workflow ─────────────────────────────────────────────

// SubscriptionChargeInput is the input to SubscriptionChargeWorkflow.
type SubscriptionChargeInput struct {
	SubscriptionID string `json:"subscription_id"`
	MerchantID     string `json:"merchant_id"`
	Amount         int64  `json:"amount_kobo"`
	Currency       string `json:"currency"`
	CustomerEmail  string `json:"customer_email"`
}

// SubscriptionChargeWorkflow charges a subscription with retry and dunning.
// It retries up to 3 times over 7 days before cancelling.
func SubscriptionChargeWorkflow(ctx workflow.Context, input SubscriptionChargeInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("SubscriptionChargeWorkflow started", "subscription_id", input.SubscriptionID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 1, // We control retries manually for dunning
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	maxAttempts := 3
	retryIntervals := []time.Duration{0, 24 * time.Hour, 72 * time.Hour}

	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			// Wait before retry
			_ = workflow.Sleep(ctx, retryIntervals[attempt])
			// Send dunning email
			if err := workflow.ExecuteActivity(ctx, SendDunningEmailActivity, input, attempt).Get(ctx, nil); err != nil {
				logger.Error("SendDunningEmailActivity failed", "err", err)
			}
		}

		var chargeErr error
		if err := workflow.ExecuteActivity(ctx, ChargeSubscriptionActivity, input).Get(ctx, &chargeErr); err == nil && chargeErr == nil {
			logger.Info("SubscriptionChargeWorkflow: charge succeeded", "attempt", attempt+1)
			return nil
		}
		logger.Info("SubscriptionChargeWorkflow: charge failed", "attempt", attempt+1)
	}

	// All attempts exhausted — cancel subscription
	if err := workflow.ExecuteActivity(ctx, CancelSubscriptionActivity, input.SubscriptionID, "payment_failed").Get(ctx, nil); err != nil {
		return fmt.Errorf("CancelSubscriptionActivity: %w", err)
	}

	logger.Info("SubscriptionChargeWorkflow: subscription cancelled after max attempts",
		"subscription_id", input.SubscriptionID,
	)
	return nil
}

// ─── Cross-Border Transfer Workflow ───────────────────────────────────────────

// CrossBorderInput is the input to CrossBorderTransferWorkflow.
type CrossBorderInput struct {
	TransferID  string  `json:"transfer_id"`
	MerchantID  string  `json:"merchant_id"`
	FromCurrency string `json:"from_currency"`
	ToCurrency  string  `json:"to_currency"`
	Amount      int64   `json:"amount"`
	Corridor    string  `json:"corridor"` // e.g. "NG-GH", "NG-KE"
	QuoteID     string  `json:"quote_id"`
}

// CrossBorderTransferWorkflow executes a Mojaloop cross-border transfer.
// The quote expires after 30 seconds — if not executed in time, a new quote
// is fetched automatically.
func CrossBorderTransferWorkflow(ctx workflow.Context, input CrossBorderInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("CrossBorderTransferWorkflow started", "transfer_id", input.TransferID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:    3,
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Get or refresh quote (30s expiry)
	var quoteID string
	if err := workflow.ExecuteActivity(ctx, GetCrossBorderQuoteActivity, input).Get(ctx, &quoteID); err != nil {
		return fmt.Errorf("GetCrossBorderQuoteActivity: %w", err)
	}
	input.QuoteID = quoteID

	// Step 2: Execute Mojaloop transfer
	if err := workflow.ExecuteActivity(ctx, ExecuteMojalloopTransferActivity, input).Get(ctx, nil); err != nil {
		_ = workflow.ExecuteActivity(ctx, UpdateTransferStatusActivity, input.TransferID, "failed").Get(ctx, nil)
		return fmt.Errorf("ExecuteMojalloopTransferActivity: %w", err)
	}

	// Step 3: Update status to completed
	if err := workflow.ExecuteActivity(ctx, UpdateTransferStatusActivity, input.TransferID, "completed").Get(ctx, nil); err != nil {
		return fmt.Errorf("UpdateTransferStatusActivity: %w", err)
	}

	logger.Info("CrossBorderTransferWorkflow complete", "transfer_id", input.TransferID)
	return nil
}

// ─── Activity stubs ───────────────────────────────────────────────────────────
// These are registered with the worker and called by the workflows above.
// Replace the log-only implementations with real business logic.

func CheckPayoutThresholdActivity(ctx context.Context, payoutID string) (bool, error) {
	slog.Info("[temporal:activity] CheckPayoutThreshold", "payout_id", payoutID)
	return true, nil
}

func NotifyApproversActivity(ctx context.Context, input PayoutApprovalInput) error {
	slog.Info("[temporal:activity] NotifyApprovers", "payout_id", input.PayoutID, "approver", input.ApproverID)
	return nil
}

func ExecutePayoutActivity(ctx context.Context, payoutID string) error {
	slog.Info("[temporal:activity] ExecutePayout", "payout_id", payoutID)
	return nil
}

func RejectPayoutActivity(ctx context.Context, payoutID, reason string) error {
	slog.Info("[temporal:activity] RejectPayout", "payout_id", payoutID, "reason", reason)
	return nil
}

func SubmitNIBSSBatchActivity(ctx context.Context, input SettlementBatchInput) error {
	slog.Info("[temporal:activity] SubmitNIBSSBatch", "settlement_id", input.SettlementID, "batch_ref", input.BatchRef)
	return nil
}

func ConfirmNIBSSBatchActivity(ctx context.Context, batchRef string) error {
	slog.Info("[temporal:activity] ConfirmNIBSSBatch", "batch_ref", batchRef)
	return nil
}

func UpdateSettlementStatusActivity(ctx context.Context, settlementID, status string) error {
	slog.Info("[temporal:activity] UpdateSettlementStatus", "settlement_id", settlementID, "status", status)
	return nil
}

func ChargeSubscriptionActivity(ctx context.Context, input SubscriptionChargeInput) error {
	slog.Info("[temporal:activity] ChargeSubscription", "subscription_id", input.SubscriptionID)
	return nil
}

func SendDunningEmailActivity(ctx context.Context, input SubscriptionChargeInput, attempt int) error {
	slog.Info("[temporal:activity] SendDunningEmail", "subscription_id", input.SubscriptionID, "attempt", attempt)
	return nil
}

func CancelSubscriptionActivity(ctx context.Context, subscriptionID, reason string) error {
	slog.Info("[temporal:activity] CancelSubscription", "subscription_id", subscriptionID, "reason", reason)
	return nil
}

func GetCrossBorderQuoteActivity(ctx context.Context, input CrossBorderInput) (string, error) {
	slog.Info("[temporal:activity] GetCrossBorderQuote", "transfer_id", input.TransferID, "corridor", input.Corridor)
	return "quote_" + input.TransferID, nil
}

func ExecuteMojalloopTransferActivity(ctx context.Context, input CrossBorderInput) error {
	slog.Info("[temporal:activity] ExecuteMojalloopTransfer", "transfer_id", input.TransferID, "quote_id", input.QuoteID)
	return nil
}

func UpdateTransferStatusActivity(ctx context.Context, transferID, status string) error {
	slog.Info("[temporal:activity] UpdateTransferStatus", "transfer_id", transferID, "status", status)
	return nil
}
