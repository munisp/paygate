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
	w.RegisterActivity(acts.PollNIBSSBatchStatus)
	w.RegisterActivity(acts.UpdateSettlementStatus)
	w.RegisterActivity(acts.RecordSettlement)
	w.RegisterActivity(acts.UpdateDisputeStatus)
	w.RegisterActivity(acts.DisburseFunds)
	w.RegisterActivity(acts.ChargeSubscription)
	w.RegisterActivity(acts.SendDunningEmail)
	w.RegisterActivity(acts.CancelSubscription)
	w.RegisterActivity(acts.GetCrossBorderQuote)
	w.RegisterActivity(acts.ExecuteMojalloopTransfer)
	w.RegisterActivity(acts.GetCrossBorderQuoteReal)
	w.RegisterActivity(acts.ExecuteMojalloopTransferReal)
	w.RegisterActivity(acts.UpdateTransferStatus)

	// USDC payout activities
	w.RegisterActivity(acts.ReserveUSDCFunds)
	w.RegisterActivity(acts.ExecuteUSDCPayout)
	w.RegisterActivity(acts.ConfirmSolanaTransaction)
	w.RegisterActivity(acts.ScanUSDCDeposits)

	// Register USDC deposit monitor workflow
	w.RegisterWorkflow(USDCDepositMonitorWorkflow)

	// ── KYB Workflows ──────────────────────────────────────────────────────────
	w.RegisterWorkflow(KYBWorkflow)
	w.RegisterWorkflow(CBNRegulatoryReportWorkflow)
	w.RegisterActivity(InitKYBRecordActivity)
	w.RegisterActivity(VerifyCACRegistrationActivity)
	w.RegisterActivity(VerifyTINActivity)
	w.RegisterActivity(YouverifyBusinessVerificationActivity)
	w.RegisterActivity(VerifyDirectorKYCActivity)
	w.RegisterActivity(KYBRiskAssessmentActivity)
	w.RegisterActivity(SanctionsScreeningActivity)
	w.RegisterActivity(FinalizeKYBActivity)
	w.RegisterActivity(NotifyKYBCompletionActivity)
	w.RegisterActivity(GenerateCBNKYBReportActivity)
	w.RegisterActivity(AggregateCBNReportDataActivity)
	w.RegisterActivity(GenerateCBNReportDocumentActivity)
	w.RegisterActivity(SubmitCBNReportActivity)
	w.RegisterActivity(NotifyComplianceTeamActivity)
	w.RegisterActivity(UpdateKYBStepActivity)

	// ── Lending Workflows ─────────────────────────────────────────────────────
	w.RegisterWorkflow(LoanDisbursementWorkflow)
	w.RegisterWorkflow(RepaymentScheduleWorkflow)
	w.RegisterWorkflow(LoanDunningWorkflow)
	w.RegisterActivity(ValidateLoanEligibilityActivity)
	w.RegisterActivity(ReserveCreditFundsActivity)
	w.RegisterActivity(PersistRepaymentScheduleActivity)
	w.RegisterActivity(UpdateLoanToDisbursedActivity)
	w.RegisterActivity(SendLoanDisbursementNotificationActivity)
	w.RegisterActivity(ReleaseReservationActivity)
	w.RegisterActivity(CheckInstalmentPaidActivity)
	w.RegisterActivity(RepaymentDeductActivity)
	w.RegisterActivity(FlagLoanDefaultRiskActivity)
	w.RegisterActivity(MarkLoanCompletedActivity)
	w.RegisterActivity(SendDunningNotificationActivity)

	// ── Billing Workflows ─────────────────────────────────────────────────────
	w.RegisterWorkflow(RecurringBillingWorkflow)
	w.RegisterWorkflow(BillingDunningWorkflow)
	w.RegisterActivity(CheckSubscriptionActiveActivity)
	w.RegisterActivity(RecordSubscriptionChargeActivity)
	w.RegisterActivity(FinalizeSubscriptionActivity)
	w.RegisterActivity(SendBillingDunningEmailActivity)
	w.RegisterActivity(SendBillingDunningFinalNoticeActivity)

	// ── Fraud Ring Escalation Workflow ────────────────────────────────────────
	w.RegisterWorkflow(FraudRingEscalationWorkflow)
	w.RegisterActivity(acts.NotifyFraudRingEscalation)
	w.RegisterActivity(acts.CheckFraudRingResolved)
	w.RegisterActivity(acts.AutoFreezeFraudRing)
	w.RegisterActivity(acts.PublishFraudRingFrozenEvent)

	// ── Cross-Border + Dispute Workflows ────────────────────────────────────
	RegisterCrossBorderWorkflows(w)
	RegisterTier7Workflows(w)
	RegisterTier8Workflows(w)

	return w
}

// USDCDepositMonitorWorkflow is a cron workflow that runs every 30 seconds
// to detect new USDC deposits on platform-monitored Solana wallets.
// It publishes paygate.usdc.deposit.received events to Kafka for each new deposit.
func USDCDepositMonitorWorkflow(ctx workflow.Context) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("USDCDepositMonitorWorkflow: scanning for deposits")

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 25 * time.Second, // must complete before next cron tick
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 1, // cron will retry on next tick anyway
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)
	acts := NewActivitySet()
	return workflow.ExecuteActivity(ctx, acts.ScanUSDCDeposits).Get(ctx, nil)
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

	// Step 4: Poll NIBSS for confirmation using the self-contained polling activity.
	// The activity polls every 30 seconds for up to 2 hours (240 attempts).
	// We give it 2h10m at the workflow level so Temporal does not pre-empt it.
	pollAo := workflow.ActivityOptions{
		StartToCloseTimeout: 2*time.Hour + 10*time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 1, // The activity manages its own retry loop internally.
		},
	}
	pollCtx := workflow.WithActivityOptions(ctx, pollAo)
	pollErr := workflow.ExecuteActivity(pollCtx, acts.PollNIBSSBatchStatus, input.BatchRef, input.SettlementID).Get(ctx, nil)

	// Step 5: Update settlement status based on polling outcome.
	status := "completed"
	if pollErr != nil {
		logger.Warn("SettlementBatchWorkflow: polling failed — marking sla_breached",
			"settlement_id", input.SettlementID, "err", pollErr)
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
// Set RecipientWallet + Corridor="USDC" to route via the native Solana engine.
// Set Corridor to a Mojaloop corridor code (e.g. "NG-GH") for FSPIOP routing.
type CrossBorderInput struct {
	TransferID      string `json:"transfer_id"`
	MerchantID      string `json:"merchant_id"`
	FromCurrency    string `json:"from_currency"`
	ToCurrency      string `json:"to_currency"`
	Amount          int64  `json:"amount"`
	AmountKobo      int64  `json:"amount_kobo"`       // Minor units for Mojaloop
	Currency        string `json:"currency"`          // ISO 4217 currency code
	Corridors       string `json:"corridor"`          // "USDC" | "NG-GH" | "NG-KE" etc.
	QuoteID         string `json:"quote_id"`
	RecipientWallet string `json:"recipient_wallet"`  // Solana wallet address (USDC only)
	SenderAccountID string `json:"sender_account_id"` // Payer account ID (Mojaloop)
	RecipientPhone  string `json:"recipient_phone"`   // Payee MSISDN (Mojaloop)
	ILPPacket       string `json:"ilp_packet"`        // ILP packet from quote response
	ILPCondition    string `json:"ilp_condition"`     // ILP condition from quote response
	Reference       string `json:"reference"`         // Payment reference for Kafka events
}

// CrossBorderTransferWorkflow routes cross-border transfers to the correct rail:
//   - Corridor="USDC": native Solana USDC engine (TigerBeetle two-phase + Rust FFI)
//   - Corridor="NG-GH", "NG-KE", etc.: Mojaloop FSPIOP via SDK Scheme Adapter
//
// The USDC path: ReserveUSDCFunds → ExecuteUSDCPayout → ConfirmSolanaTransaction
// The Mojaloop path: GetCrossBorderQuote → ExecuteMojalloopTransfer
func CrossBorderTransferWorkflow(ctx workflow.Context, input CrossBorderInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("CrossBorderTransferWorkflow started",
		"transfer_id", input.TransferID,
		"corridor", input.Corridors)

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

	// ── USDC routing branch ──────────────────────────────────────────────────
	if input.Corridors == "USDC" {
		if input.RecipientWallet == "" {
			return fmt.Errorf("CrossBorderTransferWorkflow: RecipientWallet required for USDC corridor")
		}
		usdcInput := USDCPayoutInput{
			TransferID:      input.TransferID,
			MerchantID:      input.MerchantID,
			RecipientWallet: input.RecipientWallet,
			AmountLamports:  uint64(input.Amount), // caller converts NGN→USDC lamports before dispatch
			Reference:       input.Reference,
		}

		// Step 1: Reserve funds in TigerBeetle escrow
		var pendingIDHex string
		if err := workflow.ExecuteActivity(ctx, acts.ReserveUSDCFunds, usdcInput).Get(ctx, &pendingIDHex); err != nil {
			_ = workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "failed").Get(ctx, nil)
			return fmt.Errorf("ReserveUSDCFundsActivity: %w", err)
		}
		usdcInput.PendingTransferIDHex = pendingIDHex

		// Step 2: Broadcast Solana transaction (Rust FFI signer)
		broadcastAo := workflow.ActivityOptions{
			StartToCloseTimeout: 60 * time.Second,
			RetryPolicy: &temporal.RetryPolicy{
				MaximumAttempts:    2,
				InitialInterval:    5 * time.Second,
				BackoffCoefficient: 1.5,
			},
		}
		broadcastCtx := workflow.WithActivityOptions(ctx, broadcastAo)
		var solanaSignature string
		if err := workflow.ExecuteActivity(broadcastCtx, acts.ExecuteUSDCPayout, usdcInput).Get(ctx, &solanaSignature); err != nil {
			_ = workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "failed").Get(ctx, nil)
			return fmt.Errorf("ExecuteUSDCPayoutActivity: %w", err)
		}
		usdcInput.SolanaSignature = solanaSignature

		// Step 3: Poll Solana finality + post TigerBeetle transfer
		finalityAo := workflow.ActivityOptions{
			StartToCloseTimeout: 3 * time.Minute,
			RetryPolicy: &temporal.RetryPolicy{
				MaximumAttempts: 1,
			},
		}
		finalityCtx := workflow.WithActivityOptions(ctx, finalityAo)
		if err := workflow.ExecuteActivity(finalityCtx, acts.ConfirmSolanaTransaction, usdcInput).Get(ctx, nil); err != nil {
			_ = workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "failed").Get(ctx, nil)
			return fmt.Errorf("ConfirmSolanaTransactionActivity: %w", err)
		}

		// Step 4: Mark completed
		if err := workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "completed").Get(ctx, nil); err != nil {
			return fmt.Errorf("UpdateTransferStatus(completed): %w", err)
		}
		logger.Info("CrossBorderTransferWorkflow (USDC) complete",
			"transfer_id", input.TransferID,
			"signature", solanaSignature)
		return nil
	}

	// ── Mojaloop FSPIOP routing branch ───────────────────────────────────────
	// Use real FSPIOP activities when MOJALOOP_URL is configured.
	var quoteID string
	if err := workflow.ExecuteActivity(ctx, acts.GetCrossBorderQuoteReal, input).Get(ctx, &quoteID); err != nil {
		return fmt.Errorf("GetCrossBorderQuoteRealActivity: %w", err)
	}
	input.QuoteID = quoteID

	if err := workflow.ExecuteActivity(ctx, acts.ExecuteMojalloopTransferReal, input).Get(ctx, nil); err != nil {
		_ = workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "failed").Get(ctx, nil)
		return fmt.Errorf("ExecuteMojalloopTransferRealActivity: %w", err)
	}

	if err := workflow.ExecuteActivity(ctx, acts.UpdateTransferStatus, input.TransferID, "completed").Get(ctx, nil); err != nil {
		return fmt.Errorf("UpdateTransferStatusActivity: %w", err)
	}
	logger.Info("CrossBorderTransferWorkflow (Mojaloop) complete", "transfer_id", input.TransferID)
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

// ─── Fraud Ring Escalation Workflow ──────────────────────────────────────────

// FraudRingEscalationInput is the input to FraudRingEscalationWorkflow.
type FraudRingEscalationInput struct {
	RingID               string `json:"ring_id"`
	Reason               string `json:"reason"`
	LinkedAccountCount   int    `json:"linked_account_count"`
	EscalatedBy          string `json:"escalated_by"`
	AutoFreezeAfterHours int    `json:"auto_freeze_after_hours"`
}

// FraudRingEscalationWorkflow orchestrates the compliance escalation process
// for a detected fraud ring. It waits for the configured auto-freeze window
// (default 48 hours) and then auto-freezes the ring if no resolution has occurred.
//
// Steps:
//  1. NotifyFraudRingEscalation — sends email/Slack/in-app alert to compliance
//  2. Sleep auto_freeze_after_hours (default 48h)
//  3. CheckFraudRingResolved — queries DB/Redis for resolution status
//  4. If unresolved → AutoFreezeFraudRing — freezes all linked accounts
//  5. PublishFraudRingFrozenEvent — Kafka paygate.fraud.ring.frozen
func FraudRingEscalationWorkflow(ctx workflow.Context, input FraudRingEscalationInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("FraudRingEscalationWorkflow started",
		"ring_id", input.RingID,
		"escalated_by", input.EscalatedBy,
		"auto_freeze_hours", input.AutoFreezeAfterHours,
	)

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

	// Step 1: Notify compliance team
	if err := workflow.ExecuteActivity(ctx, acts.NotifyFraudRingEscalation, input).Get(ctx, nil); err != nil {
		logger.Error("FraudRingEscalationWorkflow: NotifyFraudRingEscalation failed", "err", err)
		// Non-fatal — continue with auto-freeze timer
	}

	// Step 2: Wait for auto-freeze window
	freezeHours := input.AutoFreezeAfterHours
	if freezeHours <= 0 {
		freezeHours = 48
	}
	_ = workflow.Sleep(ctx, time.Duration(freezeHours)*time.Hour)

	// Step 3: Check if ring was already resolved
	var resolved bool
	if err := workflow.ExecuteActivity(ctx, acts.CheckFraudRingResolved, input.RingID).Get(ctx, &resolved); err != nil {
		logger.Warn("FraudRingEscalationWorkflow: CheckFraudRingResolved failed — proceeding with auto-freeze", "err", err)
	}

	if resolved {
		logger.Info("FraudRingEscalationWorkflow: ring already resolved, skipping auto-freeze", "ring_id", input.RingID)
		return nil
	}

	// Step 4: Auto-freeze all linked accounts
	if err := workflow.ExecuteActivity(ctx, acts.AutoFreezeFraudRing, input.RingID, input.EscalatedBy).Get(ctx, nil); err != nil {
		return fmt.Errorf("FraudRingEscalationWorkflow: AutoFreezeFraudRing: %w", err)
	}

	// Step 5: Publish Kafka event
	if err := workflow.ExecuteActivity(ctx, acts.PublishFraudRingFrozenEvent, input.RingID, input.LinkedAccountCount).Get(ctx, nil); err != nil {
		logger.Warn("FraudRingEscalationWorkflow: PublishFraudRingFrozenEvent failed (non-fatal)", "err", err)
	}

	logger.Info("FraudRingEscalationWorkflow complete", "ring_id", input.RingID)
	return nil
}
