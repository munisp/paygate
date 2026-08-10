// Package temporal — Tier-7 Workflows
// EscrowWorkflow, BulkPaymentWorkflow, TaxRemittanceWorkflow, MultiWalletSweepWorkflow
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Escrow Workflow ──────────────────────────────────────────────────────────

type EscrowWorkflowInput struct {
	EscrowID      string
	PayerID       string
	BeneficiaryID string
	AmountKobo    uint64
	Currency      string
	ConditionType string // "manual_release" | "time_based" | "event_based"
	ExpiresAt     time.Time
}

type EscrowWorkflowResult struct {
	EscrowID    string
	TransferID  string
	Status      string // "funded" | "released" | "voided"
	CompletedAt time.Time
}

// EscrowWorkflow orchestrates the full escrow lifecycle:
// lock funds → wait for release/void/expiry signal → post or void the pending transfer.
func EscrowWorkflow(ctx workflow.Context, input EscrowWorkflowInput) (*EscrowWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("EscrowWorkflow started", "escrow_id", input.EscrowID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        5 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        60 * time.Second,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []string{"ValidationError", "DuplicateError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 120 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate escrow request
	var validationErr error
	workflow.ExecuteActivity(ctx, "ValidateEscrowActivity", input).Get(ctx, &validationErr)
	if validationErr != nil {
		return nil, fmt.Errorf("escrow validation failed: %w", validationErr)
	}

	// Step 2: Create pending TigerBeetle transfer (funds locked, not yet moved)
	var transferID string
	if err := workflow.ExecuteActivity(ctx, "LockEscrowFundsActivity", input).Get(ctx, &transferID); err != nil {
		return nil, fmt.Errorf("escrow lock failed: %w", err)
	}

	// Step 3: Wait for release or void signal (or timeout)
	releaseSignal := workflow.GetSignalChannel(ctx, "escrow.release")
	voidSignal := workflow.GetSignalChannel(ctx, "escrow.void")
	selector := workflow.NewSelector(ctx)
	var released bool
	var voided bool
	selector.AddReceive(releaseSignal, func(c workflow.ReceiveChannel, _ bool) {
		c.Receive(ctx, nil)
		released = true
	})
	selector.AddReceive(voidSignal, func(c workflow.ReceiveChannel, _ bool) {
		c.Receive(ctx, nil)
		voided = true
	})
	// Timeout: auto-void on expiry
	timer := workflow.NewTimer(ctx, time.Until(input.ExpiresAt))
	selector.AddFuture(timer, func(f workflow.Future) {
		voided = true
	})
	selector.Select(ctx)

	// Step 4: Post or void the pending transfer
	var status string
	if released {
		if err := workflow.ExecuteActivity(ctx, "PostEscrowTransferActivity", transferID, input).Get(ctx, nil); err != nil {
			return nil, fmt.Errorf("escrow release failed: %w", err)
		}
		status = "released"
	} else if voided {
		if err := workflow.ExecuteActivity(ctx, "VoidEscrowTransferActivity", transferID, input).Get(ctx, nil); err != nil {
			return nil, fmt.Errorf("escrow void failed: %w", err)
		}
		status = "voided"
	}

	return &EscrowWorkflowResult{
		EscrowID:    input.EscrowID,
		TransferID:  transferID,
		Status:      status,
		CompletedAt: workflow.Now(ctx),
	}, nil
}

// ─── Bulk Payment Workflow ────────────────────────────────────────────────────

type BulkPaymentItem struct {
	RecipientID string
	AmountKobo  uint64
	Reference   string
	Narration   string
}

type BulkPaymentWorkflowInput struct {
	BatchID     string
	MerchantID  string
	Payments    []BulkPaymentItem
	Currency    string
	ScheduledAt time.Time
}

type BulkPaymentWorkflowResult struct {
	BatchID     string
	Succeeded   int
	Failed      int
	TotalKobo   uint64
	CompletedAt time.Time
}

// BulkPaymentWorkflow processes a batch of scheduled payments atomically.
// Each payment is dispatched individually with retry; partial failures are tracked.
func BulkPaymentWorkflow(ctx workflow.Context, input BulkPaymentWorkflowInput) (*BulkPaymentWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("BulkPaymentWorkflow started", "batch_id", input.BatchID)

	// Wait until scheduled time
	if delay := time.Until(input.ScheduledAt); delay > 0 {
		workflow.Sleep(ctx, delay)
	}

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        3 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        30 * time.Second,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []string{"InvalidAccountError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	var succeeded, failed int
	var totalKobo uint64

	for _, payment := range input.Payments {
		err := workflow.ExecuteActivity(ctx, "DisburseSinglePaymentActivity",
			input.BatchID, input.MerchantID, payment, input.Currency).Get(ctx, nil)
		if err != nil {
			failed++
			logger.Error("payment failed", "reference", payment.Reference, "error", err)
		} else {
			succeeded++
			totalKobo += payment.AmountKobo
		}
	}

	// Reconcile: release any un-disbursed funds back to merchant
	workflow.ExecuteActivity(ctx, "ReconcileBulkReservationActivity", input.BatchID, succeeded, failed).Get(ctx, nil)

	return &BulkPaymentWorkflowResult{
		BatchID:     input.BatchID,
		Succeeded:   succeeded,
		Failed:      failed,
		TotalKobo:   totalKobo,
		CompletedAt: workflow.Now(ctx),
	}, nil
}

// ─── Tax Remittance Workflow ──────────────────────────────────────────────────

type TaxRemittanceWorkflowInput struct {
	RemittanceID  string
	MerchantID    string
	TaxType       string // "VAT" | "WHT" | "CIT"
	TaxAmountKobo uint64
	PeriodStart   time.Time
	PeriodEnd     time.Time
	TaxAuthority  string // "FIRS" | "LIRS" | "SIRS"
}

type TaxRemittanceWorkflowResult struct {
	RemittanceID string
	ReceiptRef   string
	Status       string
	RemittedAt   time.Time
}

// TaxRemittanceWorkflow orchestrates tax computation → TigerBeetle deduction → FIRS/LIRS submission.
func TaxRemittanceWorkflow(ctx workflow.Context, input TaxRemittanceWorkflowInput) (*TaxRemittanceWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("TaxRemittanceWorkflow started", "remittance_id", input.RemittanceID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        5 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        60 * time.Second,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []string{"ValidationError", "DuplicateError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 120 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate tax computation
	if err := workflow.ExecuteActivity(ctx, "ValidateTaxRemittanceActivity", input).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("tax validation failed: %w", err)
	}

	// Step 2: Deduct tax from merchant wallet via TigerBeetle
	var transferID string
	if err := workflow.ExecuteActivity(ctx, "DeductTaxFromMerchantActivity", input.MerchantID, input.TaxAmountKobo, input.RemittanceID).Get(ctx, &transferID); err != nil {
		return nil, fmt.Errorf("tax deduction failed: %w", err)
	}

	// Step 3: Submit to tax authority (FIRS/LIRS API)
	var receiptRef string
	if err := workflow.ExecuteActivity(ctx, "SubmitTaxToAuthorityActivity", input).Get(ctx, &receiptRef); err != nil {
		// Compensate: reverse the TigerBeetle deduction
		workflow.ExecuteActivity(ctx, "ReverseTaxDeductionActivity", transferID, input.RemittanceID).Get(ctx, nil)
		return nil, fmt.Errorf("tax authority submission failed: %w", err)
	}

	return &TaxRemittanceWorkflowResult{
		RemittanceID: input.RemittanceID,
		ReceiptRef:   receiptRef,
		Status:       "remitted",
		RemittedAt:   workflow.Now(ctx),
	}, nil
}

// ─── Multi-Wallet Sweep Workflow ──────────────────────────────────────────────

type MultiWalletSweepInput struct {
	SweepID        string
	MerchantID     string
	SourceWallets  []string // wallet IDs to sweep from
	TargetWallet   string
	Currency       string
	SweepAll       bool   // if true, sweep all available balances
	MinBalanceKobo uint64 // minimum balance to leave in each source wallet
}

type MultiWalletSweepResult struct {
	SweepID     string
	TotalSwept  uint64
	WalletCount int
	CompletedAt time.Time
}

// MultiWalletSweepWorkflow consolidates funds from multiple wallets into one.
// Uses TigerBeetle BatchTransfers for atomic multi-wallet consolidation.
func MultiWalletSweepWorkflow(ctx workflow.Context, input MultiWalletSweepInput) (*MultiWalletSweepResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("MultiWalletSweepWorkflow started", "sweep_id", input.SweepID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        2 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        30 * time.Second,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []string{"ValidationError", "InsufficientFundsError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Compute sweep amounts for each source wallet
	type sweepPlan struct {
		WalletID  string
		AmountKobo uint64
	}
	var plan []sweepPlan
	if err := workflow.ExecuteActivity(ctx, "ComputeWalletSweepPlanActivity", input).Get(ctx, &plan); err != nil {
		return nil, fmt.Errorf("sweep plan computation failed: %w", err)
	}
	if len(plan) == 0 {
		return &MultiWalletSweepResult{SweepID: input.SweepID, TotalSwept: 0, WalletCount: 0, CompletedAt: workflow.Now(ctx)}, nil
	}

	// Step 2: Execute batch TigerBeetle transfers atomically
	var totalSwept uint64
	if err := workflow.ExecuteActivity(ctx, "ExecuteWalletSweepBatchActivity", input.SweepID, input.TargetWallet, plan).Get(ctx, &totalSwept); err != nil {
		return nil, fmt.Errorf("wallet sweep batch failed: %w", err)
	}

	return &MultiWalletSweepResult{
		SweepID:     input.SweepID,
		TotalSwept:  totalSwept,
		WalletCount: len(plan),
		CompletedAt: workflow.Now(ctx),
	}, nil
}

// RegisterTier7Workflows registers all tier-7 workflows with the Temporal worker.
func RegisterTier7Workflows(w interface{ RegisterWorkflow(interface{}) }) {
	w.RegisterWorkflow(EscrowWorkflow)
	w.RegisterWorkflow(BulkPaymentWorkflow)
	w.RegisterWorkflow(TaxRemittanceWorkflow)
	w.RegisterWorkflow(MultiWalletSweepWorkflow)
}
