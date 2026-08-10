// Package insurance implements the NextHub Insurance Platform.
// Provides Temporal-based workflows for premium collection, lapse management,
// and insurance claim disbursement, integrated with TigerBeetle, Kafka, and Redis.
package insurance

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Policy Types ─────────────────────────────────────────────────────────────

// PolicyStatus represents the lifecycle state of an insurance policy.
type PolicyStatus string

const (
	PolicyStatusActive    PolicyStatus = "ACTIVE"
	PolicyStatusLapsed    PolicyStatus = "LAPSED"
	PolicyStatusCancelled PolicyStatus = "CANCELLED"
	PolicyStatusExpired   PolicyStatus = "EXPIRED"
	PolicyStatusSuspended PolicyStatus = "SUSPENDED"
)

// PolicyType represents the type of insurance policy.
type PolicyType string

const (
	PolicyTypeLife     PolicyType = "LIFE"
	PolicyTypeHealth   PolicyType = "HEALTH"
	PolicyTypeMotor    PolicyType = "MOTOR"
	PolicyTypeProperty PolicyType = "PROPERTY"
	PolicyTypeMicro    PolicyType = "MICRO" // Micro-insurance for low-income
	PolicyTypeAgri     PolicyType = "AGRI"  // Agricultural insurance
)

// PremiumFrequency represents how often premiums are collected.
type PremiumFrequency string

const (
	FrequencyMonthly   PremiumFrequency = "MONTHLY"
	FrequencyQuarterly PremiumFrequency = "QUARTERLY"
	FrequencyAnnual    PremiumFrequency = "ANNUAL"
	FrequencyWeekly    PremiumFrequency = "WEEKLY"  // For micro-insurance
)

// InsurancePolicy represents an insurance policy.
type InsurancePolicy struct {
	ID              string           `json:"id"`
	PolicyNumber    string           `json:"policyNumber"`
	HolderID        string           `json:"holderId"`
	HolderName      string           `json:"holderName"`
	HolderFSP       string           `json:"holderFsp"`
	HolderAccount   string           `json:"holderAccount"`
	InsurerID       string           `json:"insurerId"`
	PolicyType      PolicyType       `json:"policyType"`
	Status          PolicyStatus     `json:"status"`
	PremiumAmount   float64          `json:"premiumAmount"`
	Currency        string           `json:"currency"`
	Frequency       PremiumFrequency `json:"frequency"`
	CoverageAmount  float64          `json:"coverageAmount"`
	StartDate       time.Time        `json:"startDate"`
	EndDate         time.Time        `json:"endDate"`
	NextPremiumDate time.Time        `json:"nextPremiumDate"`
	GracePeriodDays int              `json:"gracePeriodDays"`
	MissedPayments  int              `json:"missedPayments"`
	CreatedAt       time.Time        `json:"createdAt"`
}

// ─── Premium Collection Workflow ──────────────────────────────────────────────

// PremiumCollectionInput is the input to the PremiumCollectionWorkflow.
type PremiumCollectionInput struct {
	Policy InsurancePolicy `json:"policy"`
}

// PremiumCollectionResult is the result of a premium collection cycle.
type PremiumCollectionResult struct {
	PolicyID        string       `json:"policyId"`
	PolicyNumber    string       `json:"policyNumber"`
	Status          PolicyStatus `json:"status"`
	AmountCollected float64      `json:"amountCollected"`
	TransferRef     string       `json:"transferRef,omitempty"`
	NextDueDate     time.Time    `json:"nextDueDate"`
	ProcessedAt     time.Time    `json:"processedAt"`
}

// ─── Activity Types ───────────────────────────────────────────────────────────

// DebitPremiumInput is the input to the premium debit activity.
type DebitPremiumInput struct {
	PolicyID      string  `json:"policyId"`
	HolderFSP     string  `json:"holderFsp"`
	HolderAccount string  `json:"holderAccount"`
	InsurerID     string  `json:"insurerId"`
	Amount        float64 `json:"amount"`
	Currency      string  `json:"currency"`
	PolicyNumber  string  `json:"policyNumber"`
}

// DebitPremiumResult is the result of a premium debit.
type DebitPremiumResult struct {
	Success     bool   `json:"success"`
	TransferRef string `json:"transferRef,omitempty"`
	ErrorCode   string `json:"errorCode,omitempty"`
	ErrorDesc   string `json:"errorDesc,omitempty"`
}

// LapseCheckInput is the input to the lapse check activity.
type LapseCheckInput struct {
	PolicyID       string `json:"policyId"`
	MissedPayments int    `json:"missedPayments"`
	GracePeriodDays int   `json:"gracePeriodDays"`
}

// ─── PremiumCollectionWorkflow ────────────────────────────────────────────────

// PremiumCollectionWorkflow is the Temporal workflow for recurring premium collection.
// It runs as a long-running workflow that schedules itself for the next premium date.
func PremiumCollectionWorkflow(ctx workflow.Context, input PremiumCollectionInput) (*PremiumCollectionResult, error) {
	logger := workflow.GetLogger(ctx)
	policy := input.Policy
	logger.Info("PremiumCollectionWorkflow started",
		"policyId", policy.ID,
		"policyNumber", policy.PolicyNumber,
		"nextPremiumDate", policy.NextPremiumDate,
	)

	activityOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOpts)

	result := &PremiumCollectionResult{
		PolicyID:     policy.ID,
		PolicyNumber: policy.PolicyNumber,
		ProcessedAt:  workflow.Now(ctx),
	}

	// ── Step 1: Check policy is still active ──────────────────────────────────
	var policyStatus PolicyStatus
	err := workflow.ExecuteActivity(ctx, GetPolicyStatusActivity, policy.ID).Get(ctx, &policyStatus)
	if err != nil {
		return nil, fmt.Errorf("failed to get policy status: %w", err)
	}

	if policyStatus != PolicyStatusActive {
		logger.Info("Policy is not active, skipping premium collection",
			"policyId", policy.ID, "status", policyStatus)
		result.Status = policyStatus
		return result, nil
	}

	// ── Step 2: Attempt premium debit via FSPIOP ──────────────────────────────
	var debitResult DebitPremiumResult
	err = workflow.ExecuteActivity(ctx, DebitPremiumActivity, DebitPremiumInput{
		PolicyID:      policy.ID,
		HolderFSP:     policy.HolderFSP,
		HolderAccount: policy.HolderAccount,
		InsurerID:     policy.InsurerID,
		Amount:        policy.PremiumAmount,
		Currency:      policy.Currency,
		PolicyNumber:  policy.PolicyNumber,
	}).Get(ctx, &debitResult)
	if err != nil {
		return nil, fmt.Errorf("premium debit activity failed: %w", err)
	}

	if debitResult.Success {
		// ── Step 3a: Debit succeeded — update policy and schedule next ─────────
		nextDue := calculateNextPremiumDate(policy.NextPremiumDate, policy.Frequency)
		_ = workflow.ExecuteActivity(ctx, UpdatePolicyPremiumActivity, policy.ID,
			nextDue, 0).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, PublishPremiumEventActivity, policy.ID,
			"premium.collected", debitResult.TransferRef, policy.PremiumAmount).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, NotifyPolicyHolderActivity, policy.ID,
			"PREMIUM_COLLECTED", fmt.Sprintf("Premium of %.2f %s collected. Next due: %s",
				policy.PremiumAmount, policy.Currency, nextDue.Format("2006-01-02"))).Get(ctx, nil)

		result.Status = PolicyStatusActive
		result.AmountCollected = policy.PremiumAmount
		result.TransferRef = debitResult.TransferRef
		result.NextDueDate = nextDue
	} else {
		// ── Step 3b: Debit failed — check lapse conditions ────────────────────
		newMissedPayments := policy.MissedPayments + 1
		_ = workflow.ExecuteActivity(ctx, UpdatePolicyPremiumActivity, policy.ID,
			policy.NextPremiumDate, newMissedPayments).Get(ctx, nil)

		// Check if grace period exceeded
		var shouldLapse bool
		err = workflow.ExecuteActivity(ctx, CheckLapseConditionActivity, LapseCheckInput{
			PolicyID:        policy.ID,
			MissedPayments:  newMissedPayments,
			GracePeriodDays: policy.GracePeriodDays,
		}).Get(ctx, &shouldLapse)
		if err != nil {
			return nil, fmt.Errorf("lapse check failed: %w", err)
		}

		if shouldLapse {
			_ = workflow.ExecuteActivity(ctx, LapsePolicyActivity, policy.ID,
				"MISSED_PREMIUM_PAYMENTS").Get(ctx, nil)
			_ = workflow.ExecuteActivity(ctx, NotifyPolicyHolderActivity, policy.ID,
				"POLICY_LAPSED", fmt.Sprintf("Your policy %s has lapsed due to %d missed payments",
					policy.PolicyNumber, newMissedPayments)).Get(ctx, nil)
			result.Status = PolicyStatusLapsed
		} else {
			// Send reminder during grace period
			_ = workflow.ExecuteActivity(ctx, NotifyPolicyHolderActivity, policy.ID,
				"PREMIUM_OVERDUE", fmt.Sprintf("Premium payment of %.2f %s is overdue. Grace period: %d days",
					policy.PremiumAmount, policy.Currency, policy.GracePeriodDays)).Get(ctx, nil)
			result.Status = PolicyStatusActive
		}

		result.AmountCollected = 0
	}

	return result, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

// GetPolicyStatusActivity retrieves the current policy status from the database.
func GetPolicyStatusActivity(ctx context.Context, policyID string) (PolicyStatus, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Getting policy status", "policyId", policyID)
	// Implementation: SELECT status FROM insurance_policies WHERE id = $1
	return PolicyStatusActive, nil
}

// DebitPremiumActivity initiates a FSPIOP transfer to collect the premium.
func DebitPremiumActivity(ctx context.Context, input DebitPremiumInput) (*DebitPremiumResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Debiting premium", "policyId", input.PolicyID, "amount", input.Amount)

	// Implementation: POST /nexthub/transfers with payer=holderAccount, payee=insurerAccount
	// This triggers the full FSPIOP transfer flow through NextHub
	transferRef := fmt.Sprintf("PREM-%s-%d", input.PolicyID[:8], time.Now().Unix())

	return &DebitPremiumResult{
		Success:     true,
		TransferRef: transferRef,
	}, nil
}

// UpdatePolicyPremiumActivity updates the policy's next premium date and missed payments.
func UpdatePolicyPremiumActivity(ctx context.Context, policyID string,
	nextDue time.Time, missedPayments int) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating policy premium", "policyId", policyID, "nextDue", nextDue)
	// Implementation: UPDATE insurance_policies SET next_premium_date = $1, missed_payments = $2 WHERE id = $3
	return nil
}

// CheckLapseConditionActivity checks if the policy should be lapsed.
func CheckLapseConditionActivity(ctx context.Context, input LapseCheckInput) (bool, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Checking lapse condition", "policyId", input.PolicyID,
		"missedPayments", input.MissedPayments)

	// Lapse if missed payments exceed grace period equivalent
	// Typically: 3 monthly payments = 90 days grace
	maxMissed := input.GracePeriodDays / 30
	if maxMissed < 1 {
		maxMissed = 1
	}

	return input.MissedPayments >= maxMissed, nil
}

// LapsePolicyActivity marks a policy as lapsed in the database.
func LapsePolicyActivity(ctx context.Context, policyID, reason string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Lapsing policy", "policyId", policyID, "reason", reason)
	// Implementation: UPDATE insurance_policies SET status = 'LAPSED' WHERE id = $1
	return nil
}

// PublishPremiumEventActivity publishes a premium event to Kafka.
func PublishPremiumEventActivity(ctx context.Context, policyID, eventType,
	transferRef string, amount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Publishing premium event", "policyId", policyID, "eventType", eventType)
	// Implementation: Kafka → paygate.insurance.premiums topic
	return nil
}

// NotifyPolicyHolderActivity sends a notification to the policy holder.
func NotifyPolicyHolderActivity(ctx context.Context, policyID, notificationType, message string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Notifying policy holder", "policyId", policyID, "type", notificationType)
	// Implementation: SMS via Termii + push notification via VAPID
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// calculateNextPremiumDate calculates the next premium due date.
func calculateNextPremiumDate(current time.Time, frequency PremiumFrequency) time.Time {
	switch frequency {
	case FrequencyWeekly:
		return current.AddDate(0, 0, 7)
	case FrequencyMonthly:
		return current.AddDate(0, 1, 0)
	case FrequencyQuarterly:
		return current.AddDate(0, 3, 0)
	case FrequencyAnnual:
		return current.AddDate(1, 0, 0)
	default:
		return current.AddDate(0, 1, 0)
	}
}
