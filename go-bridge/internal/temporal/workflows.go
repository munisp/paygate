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

	// Activities — use real implementations when infrastructure is available,
	// otherwise fall back to the log-only stubs in this file.
	acts := NewActivitySet()
	w.RegisterActivity(acts.CheckPayoutThreshold)
	w.RegisterActivity(acts.NotifyApprovers)
	w.RegisterActivity(acts.ExecutePayout)
	w.RegisterActivity(acts.RejectPayout)
	w.RegisterActivity(acts.SubmitNIBSSBatch)
	w.RegisterActivity(acts.ConfirmNIBSSBatch)
	w.RegisterActivity(acts.UpdateSettlementStatus)
	w.RegisterActivity(acts.RecordSettlement)
	w.RegisterActivity(acts.UpdateDisputeStatus)
	w.RegisterActivity(acts.DisburseFunds)
	w.RegisterActivity(acts.ChargeSubscription)
	w.RegisterActivity(acts.SendDunningEmail)
	w.RegisterActivity(acts.CancelSubscription)
	w.RegisterActivity(acts.GetCrossBorderQuote)
	w.RegisterActivity(acts.ExecuteMojalloopTransfer)
	w.RegisterActivity(acts.UpdateTransferStatus)

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
	notifyActs := NewActivitySet()
	if err := workflow.ExecuteActivity(ctx, notifyActs.NotifyApprovers, input).Get(ctx, nil); err != nil {
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
	acts := NewActivitySet()
	if result.Approved {
		if err := workflow.ExecuteActivity(ctx, acts.ExecutePayout, input.PayoutID).Get(ctx, nil); err != nil {
			return result, fmt.Errorf("ExecutePayoutActivity: %w", err)
		}
	} else {
		if err := workflow.ExecuteActivity(ctx, acts.RejectPayout, input.PayoutID, result.Reason).Get(ctx, nil); err != nil {
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
	SettlementID  string `json:"settlement_id"`
	MerchantID    string `json:"merchant_id"`
	BatchRef      string `json:"batch_ref"`
	Amount        int64  `json:"amount_kobo"`
	Currency      string `json:"currency"`
	BankCode      string `json:"bank_code"`
	AccountNumber string `json:"account_number"`
	AccountName   string `json:"account_name"`
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

	acts := NewActivitySet()

	// Step 1: Mark processing
	if err := workflow.ExecuteActivity(ctx, acts.UpdateSettlementStatus, input.SettlementID, "processing").Get(ctx, nil); err != nil {
		return fmt.Errorf("UpdateSettlementStatus(processing): %w", err)
	}

	// Step 2: Lock funds in TigerBeetle
	if err := workflow.ExecuteActivity(ctx, acts.RecordSettlement, input).Get(ctx, nil); err != nil {
		_ = workflow.ExecuteActivity(ctx, acts.UpdateSettlementStatus, input.SettlementID, "failed").Get(ctx, nil)
		return fmt.Errorf("RecordSettlementActivity: %w", err)
	}

	// Step 3: Submit NIBSS batch
	if err := workflow.ExecuteActivity(ctx, acts.SubmitNIBSSBatch, input).Get(ctx, nil); err != nil {
		_ = workflow.ExecuteActivity(ctx, acts.UpdateSettlementStatus, input.SettlementID, "failed").Get(ctx, nil)
		return fmt.Errorf("SubmitNIBSSBatchActivity: %w", err)
	}

	// Step 4: Wait for NIBSS confirmation signal (4h timeout)
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

	// Step 5: Update settlement status
	status := "completed"
	if !confirmed {
		status = "sla_breached"
	}
	if err := workflow.ExecuteActivity(ctx, acts.UpdateSettlementStatus, input.SettlementID, status).Get(ctx, nil); err != nil {
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

	acts := NewActivitySet()
	for attempt := 0; attempt < maxAttempts; attempt++ {
		if attempt > 0 {
			// Wait before retry
			_ = workflow.Sleep(ctx, retryIntervals[attempt])
			// Send dunning email
			if err := workflow.ExecuteActivity(ctx, acts.SendDunningEmail, input, attempt).Get(ctx, nil); err != nil {
				logger.Error("SendDunningEmailActivity failed", "err", err)
			}
		}

		var chargeErr error
		if err := workflow.ExecuteActivity(ctx, acts.ChargeSubscription, input).Get(ctx, &chargeErr); err == nil && chargeErr == nil {
			logger.Info("SubscriptionChargeWorkflow: charge succeeded", "attempt", attempt+1)
			return nil
		}
		logger.Info("SubscriptionChargeWorkflow: charge failed", "attempt", attempt+1)
	}

	// All attempts exhausted — cancel subscription
	if err := workflow.ExecuteActivity(ctx, acts.CancelSubscription, input.SubscriptionID, "payment_failed").Get(ctx, nil); err != nil {
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

	acts := NewActivitySet()

	// Step 1: Get or refresh quote (30s expiry)
	var quoteID string
	if err := workflow.ExecuteActivity(ctx, acts.GetCrossBorderQuote, input).Get(ctx, &quoteID); err != nil {
		return fmt.Errorf("GetCrossBorderQuoteActivity: %w", err)
	}
	input.QuoteID = quoteID

	// Step 2: Execute Mojaloop transfer
	if err := workflow.ExecuteActivity(ctx, acts.ExecuteMojalloopTransfer, input).Get(ctx, nil); err != nil {
		_ = workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "failed").Get(ctx, nil)
		return fmt.Errorf("ExecuteMojalloopTransferActivity: %w", err)
	}

	// Step 3: Update status to completed
	if err := workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "completed").Get(ctx, nil); err != nil {
		return fmt.Errorf("UpdateTransferStatusActivity: %w", err)
	}

	logger.Info("CrossBorderTransferWorkflow complete", "transfer_id", input.TransferID)
	return nil
}

// DisputeResolutionInput is the input to the DisburseFunds activity.
type DisputeResolutionInput struct {
	DisputeID  string `json:"dispute_id"`
	MerchantID string `json:"merchant_id"`
	Amount     int64  `json:"amount"`
	Currency   string `json:"currency"`
	Resolution string `json:"resolution"` // "won" | "lost" | "partial"
	ReviewerID string `json:"reviewer_id"`
}

// Activity implementations have been moved to activities.go (ActivitySet methods).
// The ActivitySet is registered in RegisterWorker() above.
