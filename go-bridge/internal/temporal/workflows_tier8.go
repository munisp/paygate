// Package temporal — Tier-8 Workflows
// RTGSWorkflow, PayrollWorkflow, RemittanceV2Workflow
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── RTGS / ISO 20022 Workflow ────────────────────────────────────────────────

type RTGSWorkflowInput struct {
	RTGSID             string
	MerchantID         string
	SenderAccount      string
	BeneficiaryAccount string
	BeneficiaryBank    string
	AmountKobo         uint64
	Currency           string
	Narration          string
	ISO20022MsgID      string
}

type RTGSWorkflowResult struct {
	RTGSID        string
	SettlementRef string
	Status        string // "queued" | "settled" | "rejected"
	SettledAt     time.Time
}

// RTGSWorkflow orchestrates a high-value RTGS transfer via NIBSS using ISO 20022 messaging.
func RTGSWorkflow(ctx workflow.Context, input RTGSWorkflowInput) (*RTGSWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("RTGSWorkflow started", "rtgs_id", input.RTGSID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        10 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        120 * time.Second,
		MaximumAttempts:        5,
		NonRetryableErrorTypes: []string{"ValidationError", "ComplianceError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 300 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate RTGS request (limits, compliance, BIC)
	if err := workflow.ExecuteActivity(ctx, "ValidateRTGSRequestActivity", input).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("RTGS validation failed: %w", err)
	}

	// Step 2: Debit merchant wallet via TigerBeetle (atomic debit before submission)
	var debitTransferID string
	if err := workflow.ExecuteActivity(ctx, "DebitMerchantForRTGSActivity", input.MerchantID, input.AmountKobo, input.RTGSID).Get(ctx, &debitTransferID); err != nil {
		return nil, fmt.Errorf("RTGS debit failed: %w", err)
	}

	// Step 3: Submit ISO 20022 message to NIBSS RTGS
	var submissionRef string
	if err := workflow.ExecuteActivity(ctx, "SubmitRTGSToNIBSSActivity", input, debitTransferID).Get(ctx, &submissionRef); err != nil {
		// Compensate: reverse TigerBeetle debit
		workflow.ExecuteActivity(ctx, "ReverseRTGSDebitActivity", debitTransferID, input.RTGSID).Get(ctx, nil)
		return nil, fmt.Errorf("RTGS NIBSS submission failed: %w", err)
	}

	// Step 4: Poll for settlement confirmation (up to 4 hours for RTGS)
	pollCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 4 * time.Hour,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy:         retryPolicy,
	})
	var settlementRef string
	if err := workflow.ExecuteActivity(pollCtx, "PollRTGSSettlementActivity", submissionRef, input.RTGSID).Get(ctx, &settlementRef); err != nil {
		return nil, fmt.Errorf("RTGS settlement polling failed: %w", err)
	}

	return &RTGSWorkflowResult{
		RTGSID:        input.RTGSID,
		SettlementRef: settlementRef,
		Status:        "settled",
		SettledAt:     workflow.Now(ctx),
	}, nil
}

// ─── Payroll Workflow ─────────────────────────────────────────────────────────

type PayrollEmployee struct {
	EmployeeID      string
	GrossSalaryKobo uint64
	NetSalaryKobo   uint64
	AccountNumber   string
	BankCode        string
}

type PayrollWorkflowInput struct {
	PayrollID  string
	MerchantID string
	Period     string // "2026-06"
	Currency   string
	Employees  []PayrollEmployee
}

type PayrollWorkflowResult struct {
	PayrollID     string
	Succeeded     int
	Failed        int
	TotalNetKobo  uint64
	CompletedAt   time.Time
}

// PayrollWorkflow disburses salaries to all employees atomically.
// Funds are pre-reserved in a payroll pool; each disbursement is individually retried.
func PayrollWorkflow(ctx workflow.Context, input PayrollWorkflowInput) (*PayrollWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("PayrollWorkflow started", "payroll_id", input.PayrollID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        5 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        60 * time.Second,
		MaximumAttempts:        3,
		NonRetryableErrorTypes: []string{"InvalidAccountError", "BlockedAccountError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 120 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate payroll run (duplicate check, compliance)
	if err := workflow.ExecuteActivity(ctx, "ValidatePayrollRunActivity", input).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("payroll validation failed: %w", err)
	}

	// Step 2: Disburse to each employee individually
	var succeeded, failed int
	var totalNetKobo uint64
	for _, emp := range input.Employees {
		err := workflow.ExecuteActivity(ctx, "DisburseEmployeeSalaryActivity",
			input.PayrollID, input.MerchantID, emp, input.Currency).Get(ctx, nil)
		if err != nil {
			failed++
			logger.Error("salary disbursement failed", "employee_id", emp.EmployeeID, "error", err)
		} else {
			succeeded++
			totalNetKobo += emp.NetSalaryKobo
		}
	}

	// Step 3: Generate payslips and send notifications
	workflow.ExecuteActivity(ctx, "GeneratePayslipsActivity", input.PayrollID, succeeded).Get(ctx, nil)

	// Step 4: Reconcile payroll pool (return un-disbursed funds)
	workflow.ExecuteActivity(ctx, "ReconcilePayrollPoolActivity", input.PayrollID, succeeded, failed).Get(ctx, nil)

	return &PayrollWorkflowResult{
		PayrollID:    input.PayrollID,
		Succeeded:    succeeded,
		Failed:       failed,
		TotalNetKobo: totalNetKobo,
		CompletedAt:  workflow.Now(ctx),
	}, nil
}

// ─── Cross-Border Remittance V2 Workflow ──────────────────────────────────────

type RemittanceV2WorkflowInput struct {
	RemittanceID          string
	MerchantID            string
	SenderID              string
	BeneficiaryName       string
	BeneficiaryAccount    string
	BeneficiaryBank       string
	DestinationCountry    string
	SendAmountKobo        uint64
	SendCurrency          string
	ReceiveCurrency       string
	Purpose               string
	MojaloopTransactionID string
}

type RemittanceV2WorkflowResult struct {
	RemittanceID  string
	MojaloopTxID  string
	Status        string // "completed" | "failed" | "pending_compliance"
	CompletedAt   time.Time
}

// RemittanceV2Workflow orchestrates a cross-border remittance via Mojaloop.
// Includes AML screening, FX conversion, Mojaloop routing, and confirmation.
func RemittanceV2Workflow(ctx workflow.Context, input RemittanceV2WorkflowInput) (*RemittanceV2WorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("RemittanceV2Workflow started", "remittance_id", input.RemittanceID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:        10 * time.Second,
		BackoffCoefficient:     2.0,
		MaximumInterval:        120 * time.Second,
		MaximumAttempts:        5,
		NonRetryableErrorTypes: []string{"AMLBlockError", "SanctionsHitError", "ComplianceError"},
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 300 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: AML / sanctions screening
	if err := workflow.ExecuteActivity(ctx, "ScreenRemittanceAMLActivity", input).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("AML screening failed: %w", err)
	}

	// Step 2: FX rate lock and conversion
	var convertedAmountKobo uint64
	if err := workflow.ExecuteActivity(ctx, "LockFXRateAndConvertActivity", input).Get(ctx, &convertedAmountKobo); err != nil {
		return nil, fmt.Errorf("FX conversion failed: %w", err)
	}

	// Step 3: Submit to Mojaloop cross-border rails
	var mojaloopTxID string
	if err := workflow.ExecuteActivity(ctx, "SubmitToMojaloopActivity", input, convertedAmountKobo).Get(ctx, &mojaloopTxID); err != nil {
		// Compensate: reverse TigerBeetle debit
		workflow.ExecuteActivity(ctx, "ReverseRemittanceDebitActivity", input.RemittanceID).Get(ctx, nil)
		return nil, fmt.Errorf("Mojaloop submission failed: %w", err)
	}

	// Step 4: Poll for Mojaloop confirmation (up to 2 hours for cross-border)
	pollCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Hour,
		HeartbeatTimeout:    60 * time.Second,
		RetryPolicy:         retryPolicy,
	})
	if err := workflow.ExecuteActivity(pollCtx, "PollMojaloopConfirmationActivity", mojaloopTxID, input.RemittanceID).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("Mojaloop confirmation polling failed: %w", err)
	}

	return &RemittanceV2WorkflowResult{
		RemittanceID: input.RemittanceID,
		MojaloopTxID: mojaloopTxID,
		Status:       "completed",
		CompletedAt:  workflow.Now(ctx),
	}, nil
}

// RegisterTier8Workflows registers all tier-8 workflows with the Temporal worker.
func RegisterTier8Workflows(w interface{ RegisterWorkflow(interface{}) }) {
	w.RegisterWorkflow(RTGSWorkflow)
	w.RegisterWorkflow(PayrollWorkflow)
	w.RegisterWorkflow(RemittanceV2Workflow)
}
