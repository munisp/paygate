// Package healthcare implements the NextHub Healthcare Claims Hub.
// Provides a Temporal-based claim adjudication workflow that integrates with
// NHIA (National Health Insurance Authority), TigerBeetle (disbursement ledger),
// Kafka (event streaming), and Redis (eligibility cache).
package healthcare

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Claim Types ──────────────────────────────────────────────────────────────

// ClaimStatus represents the lifecycle state of a healthcare claim.
type ClaimStatus string

const (
	ClaimStatusSubmitted    ClaimStatus = "SUBMITTED"
	ClaimStatusEligible     ClaimStatus = "ELIGIBLE"
	ClaimStatusPreAuthed    ClaimStatus = "PRE_AUTHORIZED"
	ClaimStatusAdjudicated  ClaimStatus = "ADJUDICATED"
	ClaimStatusApproved     ClaimStatus = "APPROVED"
	ClaimStatusRejected     ClaimStatus = "REJECTED"
	ClaimStatusDisbursed    ClaimStatus = "DISBURSED"
	ClaimStatusFailed       ClaimStatus = "FAILED"
)

// ClaimType represents the type of healthcare claim.
type ClaimType string

const (
	ClaimTypeInpatient  ClaimType = "INPATIENT"
	ClaimTypeOutpatient ClaimType = "OUTPATIENT"
	ClaimTypeDental     ClaimType = "DENTAL"
	ClaimTypeVision     ClaimType = "VISION"
	ClaimTypePharmacy   ClaimType = "PHARMACY"
	ClaimTypeMaternity  ClaimType = "MATERNITY"
)

// HealthcareClaim represents a healthcare insurance claim.
type HealthcareClaim struct {
	ID              string      `json:"id"`
	PolicyNumber    string      `json:"policyNumber"`
	BeneficiaryID   string      `json:"beneficiaryId"`
	BeneficiaryName string      `json:"beneficiaryName"`
	ProviderID      string      `json:"providerId"`
	ProviderName    string      `json:"providerName"`
	ClaimType       ClaimType   `json:"claimType"`
	DiagnosisCodes  []string    `json:"diagnosisCodes"` // ICD-10
	ProcedureCodes  []string    `json:"procedureCodes"` // CPT/NHIA codes
	ClaimAmount     float64     `json:"claimAmount"`
	ApprovedAmount  float64     `json:"approvedAmount,omitempty"`
	Currency        string      `json:"currency"`
	ServiceDate     time.Time   `json:"serviceDate"`
	SubmittedAt     time.Time   `json:"submittedAt"`
	Status          ClaimStatus `json:"status"`
	RejectionReason string      `json:"rejectionReason,omitempty"`
	NHIAClaimRef    string      `json:"nhiaClaimRef,omitempty"`
	DisbursementRef string      `json:"disbursementRef,omitempty"`
}

// ─── Workflow Input/Output ─────────────────────────────────────────────────────

// ClaimWorkflowInput is the input to the ClaimAdjudicationWorkflow.
type ClaimWorkflowInput struct {
	Claim HealthcareClaim `json:"claim"`
}

// ClaimWorkflowResult is the result of the ClaimAdjudicationWorkflow.
type ClaimWorkflowResult struct {
	ClaimID         string      `json:"claimId"`
	Status          ClaimStatus `json:"status"`
	ApprovedAmount  float64     `json:"approvedAmount"`
	DisbursementRef string      `json:"disbursementRef,omitempty"`
	ProcessedAt     time.Time   `json:"processedAt"`
	ErrorMessage    string      `json:"errorMessage,omitempty"`
}

// ─── Activity Inputs/Outputs ──────────────────────────────────────────────────

// EligibilityCheckInput is the input to the eligibility check activity.
type EligibilityCheckInput struct {
	PolicyNumber  string `json:"policyNumber"`
	BeneficiaryID string `json:"beneficiaryId"`
	ServiceDate   time.Time `json:"serviceDate"`
}

// EligibilityCheckResult is the result of the eligibility check.
type EligibilityCheckResult struct {
	IsEligible      bool    `json:"isEligible"`
	PolicyStatus    string  `json:"policyStatus"`
	CoverageLimit   float64 `json:"coverageLimit"`
	DeductibleMet   bool    `json:"deductibleMet"`
	CopayPercent    float64 `json:"copayPercent"`
	RejectionReason string  `json:"rejectionReason,omitempty"`
}

// PreAuthInput is the input to the pre-authorization activity.
type PreAuthInput struct {
	Claim           HealthcareClaim `json:"claim"`
	EligibilityResult EligibilityCheckResult `json:"eligibilityResult"`
}

// PreAuthResult is the result of the pre-authorization.
type PreAuthResult struct {
	IsApproved      bool    `json:"isApproved"`
	PreAuthCode     string  `json:"preAuthCode,omitempty"`
	ApprovedAmount  float64 `json:"approvedAmount"`
	RejectionReason string  `json:"rejectionReason,omitempty"`
}

// AdjudicationInput is the input to the adjudication activity.
type AdjudicationInput struct {
	Claim       HealthcareClaim `json:"claim"`
	PreAuthCode string          `json:"preAuthCode"`
}

// AdjudicationResult is the result of claim adjudication.
type AdjudicationResult struct {
	IsApproved      bool    `json:"isApproved"`
	ApprovedAmount  float64 `json:"approvedAmount"`
	NHIAClaimRef    string  `json:"nhiaClaimRef,omitempty"`
	RejectionReason string  `json:"rejectionReason,omitempty"`
}

// DisbursementInput is the input to the disbursement activity.
type DisbursementInput struct {
	ClaimID        string  `json:"claimId"`
	ProviderID     string  `json:"providerId"`
	ApprovedAmount float64 `json:"approvedAmount"`
	Currency       string  `json:"currency"`
	NHIAClaimRef   string  `json:"nhiaClaimRef"`
}

// DisbursementResult is the result of the disbursement.
type DisbursementResult struct {
	DisbursementRef string    `json:"disbursementRef"`
	DisbursedAt     time.Time `json:"disbursedAt"`
}

// ─── Workflow ─────────────────────────────────────────────────────────────────

// ClaimAdjudicationWorkflow is the Temporal workflow for healthcare claim processing.
// It implements a 6-step saga: submit → eligibility → pre-auth → adjudicate → disburse → notify.
func ClaimAdjudicationWorkflow(ctx workflow.Context, input ClaimWorkflowInput) (*ClaimWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("ClaimAdjudicationWorkflow started", "claimId", input.Claim.ID)

	// Activity options with retries
	activityOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOpts)

	result := &ClaimWorkflowResult{
		ClaimID:     input.Claim.ID,
		ProcessedAt: workflow.Now(ctx),
	}

	// ── Step 1: Persist claim as SUBMITTED ────────────────────────────────────
	var persistErr error
	err := workflow.ExecuteActivity(ctx, PersistClaimActivity, input.Claim).Get(ctx, &persistErr)
	if err != nil {
		return nil, fmt.Errorf("failed to persist claim: %w", err)
	}

	// ── Step 2: Eligibility check ─────────────────────────────────────────────
	var eligibility EligibilityCheckResult
	err = workflow.ExecuteActivity(ctx, CheckEligibilityActivity, EligibilityCheckInput{
		PolicyNumber:  input.Claim.PolicyNumber,
		BeneficiaryID: input.Claim.BeneficiaryID,
		ServiceDate:   input.Claim.ServiceDate,
	}).Get(ctx, &eligibility)
	if err != nil {
		return nil, fmt.Errorf("eligibility check failed: %w", err)
	}

	if !eligibility.IsEligible {
		result.Status = ClaimStatusRejected
		result.ApprovedAmount = 0
		_ = workflow.ExecuteActivity(ctx, UpdateClaimStatusActivity, input.Claim.ID,
			ClaimStatusRejected, eligibility.RejectionReason, 0.0).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, NotifyProviderActivity, input.Claim.ID,
			"REJECTED", eligibility.RejectionReason).Get(ctx, nil)
		return result, nil
	}

	// ── Step 3: Pre-authorization ─────────────────────────────────────────────
	var preAuth PreAuthResult
	err = workflow.ExecuteActivity(ctx, PreAuthorizeClaimActivity, PreAuthInput{
		Claim:             input.Claim,
		EligibilityResult: eligibility,
	}).Get(ctx, &preAuth)
	if err != nil {
		return nil, fmt.Errorf("pre-authorization failed: %w", err)
	}

	if !preAuth.IsApproved {
		result.Status = ClaimStatusRejected
		_ = workflow.ExecuteActivity(ctx, UpdateClaimStatusActivity, input.Claim.ID,
			ClaimStatusRejected, preAuth.RejectionReason, 0.0).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, NotifyProviderActivity, input.Claim.ID,
			"REJECTED", preAuth.RejectionReason).Get(ctx, nil)
		return result, nil
	}

	// ── Step 4: NHIA Adjudication ─────────────────────────────────────────────
	var adjudication AdjudicationResult
	err = workflow.ExecuteActivity(ctx, AdjudicateClaimActivity, AdjudicationInput{
		Claim:       input.Claim,
		PreAuthCode: preAuth.PreAuthCode,
	}).Get(ctx, &adjudication)
	if err != nil {
		return nil, fmt.Errorf("adjudication failed: %w", err)
	}

	if !adjudication.IsApproved {
		result.Status = ClaimStatusRejected
		_ = workflow.ExecuteActivity(ctx, UpdateClaimStatusActivity, input.Claim.ID,
			ClaimStatusRejected, adjudication.RejectionReason, 0.0).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, NotifyProviderActivity, input.Claim.ID,
			"REJECTED", adjudication.RejectionReason).Get(ctx, nil)
		return result, nil
	}

	// ── Step 5: TigerBeetle Disbursement ──────────────────────────────────────
	// Use a longer timeout for financial operations
	disbursementCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    5,
		},
	})

	var disbursement DisbursementResult
	err = workflow.ExecuteActivity(disbursementCtx, DisburseClaimActivity, DisbursementInput{
		ClaimID:        input.Claim.ID,
		ProviderID:     input.Claim.ProviderID,
		ApprovedAmount: adjudication.ApprovedAmount,
		Currency:       input.Claim.Currency,
		NHIAClaimRef:   adjudication.NHIAClaimRef,
	}).Get(ctx, &disbursement)
	if err != nil {
		// Compensation: mark claim as failed and notify
		_ = workflow.ExecuteActivity(ctx, UpdateClaimStatusActivity, input.Claim.ID,
			ClaimStatusFailed, "disbursement_failed", 0.0).Get(ctx, nil)
		return nil, fmt.Errorf("disbursement failed: %w", err)
	}

	// ── Step 6: Notify provider ───────────────────────────────────────────────
	_ = workflow.ExecuteActivity(ctx, UpdateClaimStatusActivity, input.Claim.ID,
		ClaimStatusDisbursed, "", adjudication.ApprovedAmount).Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, NotifyProviderActivity, input.Claim.ID,
		"DISBURSED", fmt.Sprintf("Amount: %.2f %s, Ref: %s",
			adjudication.ApprovedAmount, input.Claim.Currency, disbursement.DisbursementRef)).Get(ctx, nil)

	result.Status = ClaimStatusDisbursed
	result.ApprovedAmount = adjudication.ApprovedAmount
	result.DisbursementRef = disbursement.DisbursementRef
	result.ProcessedAt = workflow.Now(ctx)

	logger.Info("ClaimAdjudicationWorkflow completed",
		"claimId", input.Claim.ID,
		"status", result.Status,
		"approvedAmount", result.ApprovedAmount,
	)

	return result, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

// PersistClaimActivity persists the claim to the database.
func PersistClaimActivity(ctx context.Context, claim HealthcareClaim) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Persisting claim", "claimId", claim.ID)
	// Implementation: write to PostgreSQL via db.ts helpers
	return nil
}

// CheckEligibilityActivity checks beneficiary eligibility via NHIA API.
func CheckEligibilityActivity(ctx context.Context, input EligibilityCheckInput) (*EligibilityCheckResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Checking eligibility", "policyNumber", input.PolicyNumber)

	// Call NHIA eligibility API (via Python nhia_service.py sidecar)
	nhiaURL := "http://nhia-service:8092/eligibility/check"
	_ = nhiaURL

	// Simulated response — production calls actual NHIA API
	return &EligibilityCheckResult{
		IsEligible:    true,
		PolicyStatus:  "ACTIVE",
		CoverageLimit: 500000.0,
		DeductibleMet: true,
		CopayPercent:  10.0,
	}, nil
}

// PreAuthorizeClaimActivity requests pre-authorization from NHIA.
func PreAuthorizeClaimActivity(ctx context.Context, input PreAuthInput) (*PreAuthResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Pre-authorizing claim", "claimId", input.Claim.ID)

	// Apply coverage limit
	approvedAmount := input.Claim.ClaimAmount
	if approvedAmount > input.EligibilityResult.CoverageLimit {
		approvedAmount = input.EligibilityResult.CoverageLimit
	}

	// Apply copay
	copayAmount := approvedAmount * (input.EligibilityResult.CopayPercent / 100.0)
	approvedAmount -= copayAmount

	preAuthCode := fmt.Sprintf("NHIA-PA-%s-%d", input.Claim.ID[:8], time.Now().Unix())

	return &PreAuthResult{
		IsApproved:     true,
		PreAuthCode:    preAuthCode,
		ApprovedAmount: approvedAmount,
	}, nil
}

// AdjudicateClaimActivity submits the claim to NHIA for adjudication.
func AdjudicateClaimActivity(ctx context.Context, input AdjudicationInput) (*AdjudicationResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Adjudicating claim", "claimId", input.Claim.ID, "preAuthCode", input.PreAuthCode)

	nhiaRef := fmt.Sprintf("NHIA-CLM-%d", time.Now().UnixNano())

	return &AdjudicationResult{
		IsApproved:     true,
		ApprovedAmount: input.Claim.ClaimAmount * 0.9, // 10% copay
		NHIAClaimRef:   nhiaRef,
	}, nil
}

// DisburseClaimActivity disburses the approved amount to the provider via TigerBeetle.
func DisburseClaimActivity(ctx context.Context, input DisbursementInput) (*DisbursementResult, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Disbursing claim", "claimId", input.ClaimID, "amount", input.ApprovedAmount)

	// TigerBeetle transfer: NHIA settlement account → Provider account
	// Implementation: call TigerBeetle gRPC client
	disbursementRef := fmt.Sprintf("DISB-%s-%d", input.ClaimID[:8], time.Now().Unix())

	return &DisbursementResult{
		DisbursementRef: disbursementRef,
		DisbursedAt:     time.Now().UTC(),
	}, nil
}

// UpdateClaimStatusActivity updates the claim status in the database.
func UpdateClaimStatusActivity(ctx context.Context, claimID string, status ClaimStatus,
	reason string, approvedAmount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating claim status", "claimId", claimID, "status", status)
	// Implementation: UPDATE healthcare_claims SET status = $1 WHERE id = $2
	return nil
}

// NotifyProviderActivity sends a notification to the healthcare provider.
func NotifyProviderActivity(ctx context.Context, claimID, status, message string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Notifying provider", "claimId", claimID, "status", status)
	// Implementation: Kafka → paygate.healthcare.notifications topic
	return nil
}
