// Package temporal — Lending Workflows
// LoanDisbursementWorkflow: orchestrates credit scoring → approval → TigerBeetle disbursement
// RepaymentScheduleWorkflow: schedules and tracks loan repayments with dunning
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Loan Disbursement Workflow ───────────────────────────────────────────────

type LoanDisbursementInput struct {
	LoanID     string
	MerchantID string
	AmountKobo uint64
	TermDays   int
	RateAnnPct float64
	ApprovedBy string
}

type LoanDisbursementResult struct {
	LoanID      string
	TransferID  string
	DisbursedAt time.Time
	Status      string
}

// LoanDisbursementWorkflow orchestrates the full loan disbursement flow.
// Steps: validate → reserve funds → TigerBeetle transfer → notify → schedule repayment
func LoanDisbursementWorkflow(ctx workflow.Context, input LoanDisbursementInput) (*LoanDisbursementResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("LoanDisbursementWorkflow started", "loan_id", input.LoanID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:    2 * time.Second,
		BackoffCoefficient: 2.0,
		MaximumInterval:    30 * time.Second,
		MaximumAttempts:    3,
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate loan eligibility
	var eligible bool
	if err := workflow.ExecuteActivity(ctx, ValidateLoanEligibilityActivity, input.LoanID).Get(ctx, &eligible); err != nil {
		return nil, fmt.Errorf("eligibility check failed: %w", err)
	}
	if !eligible {
		return &LoanDisbursementResult{LoanID: input.LoanID, Status: "rejected"}, nil
	}

	// Step 2: Reserve funds in credit pool
	var reservationID string
	if err := workflow.ExecuteActivity(ctx, ReserveCreditFundsActivity, input.LoanID, input.AmountKobo).Get(ctx, &reservationID); err != nil {
		return nil, fmt.Errorf("fund reservation failed: %w", err)
	}

	// Step 3: Execute TigerBeetle disbursement transfer
	var transferID string
	if err := workflow.ExecuteActivity(ctx, DisburseFundsActivity, input.LoanID, input.MerchantID, input.AmountKobo, reservationID).Get(ctx, &transferID); err != nil {
		// Rollback reservation on failure
		_ = workflow.ExecuteActivity(ctx, ReleaseReservationActivity, reservationID).Get(ctx, nil)
		return nil, fmt.Errorf("disbursement failed: %w", err)
	}

	// Step 4: Update loan record to disbursed
	if err := workflow.ExecuteActivity(ctx, UpdateLoanToDisbursedActivity, input.LoanID, transferID, input.ApprovedBy).Get(ctx, nil); err != nil {
		logger.Error("Failed to update loan status", "err", err)
		// Non-fatal — funds already transferred
	}

	// Step 5: Send disbursement notification
	if err := workflow.ExecuteActivity(ctx, SendLoanDisbursementNotificationActivity, input.LoanID, input.MerchantID, input.AmountKobo).Get(ctx, nil); err != nil {
		logger.Warn("Failed to send disbursement notification", "err", err)
		// Non-fatal
	}

	// Step 6: Start repayment schedule workflow as child
	childCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
		WorkflowID: fmt.Sprintf("repayment-schedule-%s", input.LoanID),
	})
	repaymentInput := RepaymentScheduleInput{
		LoanID:       input.LoanID,
		MerchantID:   input.MerchantID,
		PrincipalKobo: input.AmountKobo,
		TermDays:     input.TermDays,
		RateAnnPct:   input.RateAnnPct,
		StartDate:    workflow.Now(ctx),
	}
	workflow.ExecuteChildWorkflow(childCtx, RepaymentScheduleWorkflow, repaymentInput)

	logger.Info("LoanDisbursementWorkflow completed", "loan_id", input.LoanID, "transfer_id", transferID)

	return &LoanDisbursementResult{
		LoanID:      input.LoanID,
		TransferID:  transferID,
		DisbursedAt: workflow.Now(ctx),
		Status:      "disbursed",
	}, nil
}

// ─── Repayment Schedule Workflow ──────────────────────────────────────────────

type RepaymentScheduleInput struct {
	LoanID        string
	MerchantID    string
	PrincipalKobo uint64
	TermDays      int
	RateAnnPct    float64
	StartDate     time.Time
}

type RepaymentInstalment struct {
	InstalmentNumber int
	DueDate          time.Time
	PrincipalKobo    uint64
	InterestKobo     uint64
	TotalKobo        uint64
	Status           string // "pending" | "paid" | "overdue" | "defaulted"
}

// RepaymentScheduleWorkflow manages the loan repayment lifecycle.
// Generates a repayment schedule, waits for each instalment due date,
// attempts auto-deduction, and triggers dunning on failure.
func RepaymentScheduleWorkflow(ctx workflow.Context, input RepaymentScheduleInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("RepaymentScheduleWorkflow started", "loan_id", input.LoanID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Generate repayment schedule (monthly instalments)
	schedule := generateRepaymentSchedule(input)

	// Persist schedule
	if err := workflow.ExecuteActivity(ctx, PersistRepaymentScheduleActivity, input.LoanID, schedule).Get(ctx, nil); err != nil {
		logger.Error("Failed to persist repayment schedule", "err", err)
	}

	// Process each instalment
	for i, instalment := range schedule {
		// Wait until due date
		waitDuration := instalment.DueDate.Sub(workflow.Now(ctx))
		if waitDuration > 0 {
			workflow.Sleep(ctx, waitDuration)
		}

		// Attempt auto-deduction from merchant wallet
		var deducted bool
		if err := workflow.ExecuteActivity(ctx, RepaymentDeductActivity, input.LoanID, input.MerchantID, instalment.TotalKobo, i+1).Get(ctx, &deducted); err != nil {
			logger.Warn("Auto-deduction failed", "instalment", i+1, "err", err)
			deducted = false
		}

		if !deducted {
			// Trigger dunning workflow
			dunningCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
				WorkflowID: fmt.Sprintf("dunning-%s-%d", input.LoanID, i+1),
			})
			workflow.ExecuteChildWorkflow(dunningCtx, LoanDunningWorkflow, LoanDunningInput{
				LoanID:          input.LoanID,
				MerchantID:      input.MerchantID,
				InstalmentNumber: i + 1,
				AmountKobo:      instalment.TotalKobo,
				DueDate:         instalment.DueDate,
			})
		}
	}

	// Mark loan as completed
	if err := workflow.ExecuteActivity(ctx, MarkLoanCompletedActivity, input.LoanID).Get(ctx, nil); err != nil {
		logger.Error("Failed to mark loan completed", "err", err)
	}

	logger.Info("RepaymentScheduleWorkflow completed", "loan_id", input.LoanID)
	return nil
}

// ─── Dunning Workflow ─────────────────────────────────────────────────────────

type LoanDunningInput struct {
	LoanID           string
	MerchantID       string
	InstalmentNumber int
	AmountKobo       uint64
	DueDate          time.Time
}

// LoanDunningWorkflow sends payment reminders and escalates on non-payment.
func LoanDunningWorkflow(ctx workflow.Context, input LoanDunningInput) error {
	logger := workflow.GetLogger(ctx)
	ao := workflow.ActivityOptions{StartToCloseTimeout: 15 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Day 1: SMS reminder
	workflow.ExecuteActivity(ctx, SendDunningNotificationActivity, input.LoanID, input.MerchantID, "sms", 1)
	workflow.Sleep(ctx, 24*time.Hour)

	// Day 3: Email + SMS
	var paid bool
	workflow.ExecuteActivity(ctx, CheckInstalmentPaidActivity, input.LoanID, input.InstalmentNumber).Get(ctx, &paid)
	if paid {
		logger.Info("Instalment paid after day-1 reminder", "loan_id", input.LoanID)
		return nil
	}
	workflow.ExecuteActivity(ctx, SendDunningNotificationActivity, input.LoanID, input.MerchantID, "email_sms", 3)
	workflow.Sleep(ctx, 48*time.Hour)

	// Day 7: Final notice + flag account
	workflow.ExecuteActivity(ctx, CheckInstalmentPaidActivity, input.LoanID, input.InstalmentNumber).Get(ctx, &paid)
	if paid {
		return nil
	}
	workflow.ExecuteActivity(ctx, FlagLoanDefaultRiskActivity, input.LoanID, input.MerchantID)
	workflow.ExecuteActivity(ctx, SendDunningNotificationActivity, input.LoanID, input.MerchantID, "final_notice", 7)

	logger.Warn("Dunning workflow completed without payment", "loan_id", input.LoanID, "instalment", input.InstalmentNumber)
	return nil
}

// ─── Schedule generation helper ───────────────────────────────────────────────

func generateRepaymentSchedule(input RepaymentScheduleInput) []RepaymentInstalment {
	numInstalments := input.TermDays / 30
	if numInstalments < 1 {
		numInstalments = 1
	}

	// Monthly interest rate
	monthlyRate := input.RateAnnPct / 100.0 / 12.0
	principal := float64(input.PrincipalKobo)

	// EMI formula: P * r * (1+r)^n / ((1+r)^n - 1)
	var emi float64
	if monthlyRate > 0 {
		factor := 1.0
		for i := 0; i < numInstalments; i++ {
			factor *= (1 + monthlyRate)
		}
		emi = principal * monthlyRate * factor / (factor - 1)
	} else {
		emi = principal / float64(numInstalments)
	}

	schedule := make([]RepaymentInstalment, numInstalments)
	remainingPrincipal := principal

	for i := 0; i < numInstalments; i++ {
		interestKobo := uint64(remainingPrincipal * monthlyRate)
		principalKobo := uint64(emi) - interestKobo
		if i == numInstalments-1 {
			// Last instalment: clear remaining balance
			principalKobo = uint64(remainingPrincipal)
		}
		remainingPrincipal -= float64(principalKobo)

		schedule[i] = RepaymentInstalment{
			InstalmentNumber: i + 1,
			DueDate:          input.StartDate.AddDate(0, i+1, 0),
			PrincipalKobo:    principalKobo,
			InterestKobo:     interestKobo,
			TotalKobo:        principalKobo + interestKobo,
			Status:           "pending",
		}
	}

	return schedule
}
