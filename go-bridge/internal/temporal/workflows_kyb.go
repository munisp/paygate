// Package temporal — KYB (Know Your Business) Workflow
// Full KYB verification lifecycle for merchant onboarding.
// Integrates with Youverify for document verification, CAC for business registration,
// and generates CBN regulatory reports.
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── KYB Workflow ─────────────────────────────────────────────────────────────

type KYBWorkflowInput struct {
	MerchantID      string
	BusinessName    string
	RCNumber        string // CAC Registration Number
	TaxID           string // TIN
	DirectorIDs     []string
	BusinessAddress string
	BusinessType    string // "sole_proprietor" | "partnership" | "limited_company" | "ngo"
	IndustryCode    string
	InitiatedBy     string
}

type KYBWorkflowResult struct {
	MerchantID      string
	VerificationID  string
	Status          string // "approved" | "rejected" | "pending_manual_review"
	RiskLevel       string // "low" | "medium" | "high"
	CompletedAt     time.Time
	RejectionReason string
}

// KYBWorkflow orchestrates the full KYB verification process.
// Steps: document collection → CAC verification → director KYC → risk assessment → approval
func KYBWorkflow(ctx workflow.Context, input KYBWorkflowInput) (*KYBWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("KYBWorkflow started", "merchant_id", input.MerchantID)

	retryPolicy := &temporal.RetryPolicy{
		InitialInterval:    5 * time.Second,
		BackoffCoefficient: 2.0,
		MaximumInterval:    60 * time.Second,
		MaximumAttempts:    3,
	}
	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		RetryPolicy:         retryPolicy,
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	verificationID := fmt.Sprintf("kyb-%s-%d", input.MerchantID, workflow.Now(ctx).Unix())

	// Step 1: Initialize KYB record
	if err := workflow.ExecuteActivity(ctx, InitKYBRecordActivity, verificationID, input).Get(ctx, nil); err != nil {
		return nil, fmt.Errorf("init KYB record: %w", err)
	}

	// Step 2: Verify CAC registration number
	var cacVerified bool
	if err := workflow.ExecuteActivity(ctx, VerifyCACRegistrationActivity, input.RCNumber, input.BusinessName).Get(ctx, &cacVerified); err != nil {
		logger.Warn("CAC verification failed", "rc_number", input.RCNumber, "err", err)
		cacVerified = false
	}
	if !cacVerified {
		workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "cac_verification", "failed", "CAC number not found or name mismatch")
		return &KYBWorkflowResult{
			MerchantID:      input.MerchantID,
			VerificationID:  verificationID,
			Status:          "rejected",
			RejectionReason: "CAC registration number could not be verified",
			CompletedAt:     workflow.Now(ctx),
		}, nil
	}
	workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "cac_verification", "passed", "")

	// Step 3: Verify TIN with FIRS
	var tinVerified bool
	if err := workflow.ExecuteActivity(ctx, VerifyTINActivity, input.TaxID, input.BusinessName).Get(ctx, &tinVerified); err != nil {
		logger.Warn("TIN verification failed", "tin", input.TaxID, "err", err)
	}
	workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "tin_verification",
		map[bool]string{true: "passed", false: "failed"}[tinVerified], "")

	// Step 4: Director KYC — run in parallel
	directorResults := make([]workflow.Future, len(input.DirectorIDs))
	for i, directorID := range input.DirectorIDs {
		directorResults[i] = workflow.ExecuteActivity(ctx, VerifyDirectorKYCActivity, verificationID, directorID)
	}

	allDirectorsVerified := true
	for i, future := range directorResults {
		var verified bool
		if err := future.Get(ctx, &verified); err != nil || !verified {
			logger.Warn("Director KYC failed", "director_id", input.DirectorIDs[i])
			allDirectorsVerified = false
		}
	}
	workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "director_kyc",
		map[bool]string{true: "passed", false: "partial"}[allDirectorsVerified], "")

	// Step 5: Youverify business document verification
	var youverifyScore int
	if err := workflow.ExecuteActivity(ctx, YouverifyBusinessVerificationActivity, verificationID, input.MerchantID).Get(ctx, &youverifyScore); err != nil {
		logger.Warn("Youverify check failed", "err", err)
		youverifyScore = 0
	}
	workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "document_verification",
		map[bool]string{youverifyScore >= 70: "passed", youverifyScore < 70: "failed"}[youverifyScore >= 70],
		fmt.Sprintf("Youverify score: %d", youverifyScore))

	// Step 6: Sanctions & PEP screening
	var sanctioned bool
	if err := workflow.ExecuteActivity(ctx, SanctionsScreeningActivity, input.BusinessName, input.DirectorIDs).Get(ctx, &sanctioned); err != nil {
		logger.Warn("Sanctions screening error", "err", err)
	}
	if sanctioned {
		workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "sanctions_screening", "failed", "Match found in sanctions list")
		return &KYBWorkflowResult{
			MerchantID:      input.MerchantID,
			VerificationID:  verificationID,
			Status:          "rejected",
			RejectionReason: "Business or director found on sanctions/PEP list",
			CompletedAt:     workflow.Now(ctx),
		}, nil
	}
	workflow.ExecuteActivity(ctx, UpdateKYBStepActivity, verificationID, "sanctions_screening", "passed", "")

	// Step 7: Risk assessment
	var riskLevel string
	riskInput := KYBRiskInput{
		CACVerified:          cacVerified,
		TINVerified:          tinVerified,
		AllDirectorsVerified: allDirectorsVerified,
		YouverifyScore:       youverifyScore,
		BusinessType:         input.BusinessType,
		IndustryCode:         input.IndustryCode,
	}
	if err := workflow.ExecuteActivity(ctx, KYBRiskAssessmentActivity, verificationID, riskInput).Get(ctx, &riskLevel); err != nil {
		riskLevel = "medium"
	}

	// Step 8: Final decision
	var finalStatus string
	switch {
	case riskLevel == "high":
		finalStatus = "pending_manual_review"
	case !cacVerified || !tinVerified:
		finalStatus = "rejected"
	case youverifyScore < 50:
		finalStatus = "rejected"
	default:
		finalStatus = "approved"
	}

	// Update merchant KYB status
	workflow.ExecuteActivity(ctx, FinalizeKYBActivity, input.MerchantID, verificationID, finalStatus, riskLevel)

	// Generate CBN regulatory report for approved merchants
	if finalStatus == "approved" {
		workflow.ExecuteActivity(ctx, GenerateCBNKYBReportActivity, verificationID, input)
	}

	// Notify owner
	workflow.ExecuteActivity(ctx, NotifyKYBCompletionActivity, input.MerchantID, finalStatus, riskLevel)

	logger.Info("KYBWorkflow completed",
		"merchant_id", input.MerchantID,
		"status", finalStatus,
		"risk_level", riskLevel,
	)

	return &KYBWorkflowResult{
		MerchantID:     input.MerchantID,
		VerificationID: verificationID,
		Status:         finalStatus,
		RiskLevel:      riskLevel,
		CompletedAt:    workflow.Now(ctx),
	}, nil
}

// ─── KYB Risk Input ───────────────────────────────────────────────────────────

type KYBRiskInput struct {
	CACVerified          bool
	TINVerified          bool
	AllDirectorsVerified bool
	YouverifyScore       int
	BusinessType         string
	IndustryCode         string
}

// ─── CBN Regulatory Report Workflow ──────────────────────────────────────────

type CBNReportWorkflowInput struct {
	MerchantID  string
	ReportType  string // "monthly_transaction" | "aml_sar" | "ctr" | "kyb_summary"
	PeriodStart time.Time
	PeriodEnd   time.Time
	GeneratedBy string
}

// CBNRegulatoryReportWorkflow generates and submits CBN regulatory reports.
func CBNRegulatoryReportWorkflow(ctx workflow.Context, input CBNReportWorkflowInput) error {
	logger := workflow.GetLogger(ctx)
	logger.Info("CBNRegulatoryReportWorkflow started",
		"merchant_id", input.MerchantID,
		"report_type", input.ReportType,
	)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Aggregate transaction data
	var reportData map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, AggregateCBNReportDataActivity, input).Get(ctx, &reportData); err != nil {
		return fmt.Errorf("data aggregation failed: %w", err)
	}

	// Step 2: Generate report document (PDF + JSON)
	var reportID string
	if err := workflow.ExecuteActivity(ctx, GenerateCBNReportDocumentActivity, input, reportData).Get(ctx, &reportID); err != nil {
		return fmt.Errorf("report generation failed: %w", err)
	}

	// Step 3: Submit to CBN portal (if automated submission is configured)
	if err := workflow.ExecuteActivity(ctx, SubmitCBNReportActivity, reportID, input.ReportType).Get(ctx, nil); err != nil {
		logger.Warn("CBN report submission failed — saved for manual submission", "report_id", reportID, "err", err)
	}

	// Step 4: Notify compliance team
	workflow.ExecuteActivity(ctx, NotifyComplianceTeamActivity, reportID, input.ReportType, input.MerchantID)

	logger.Info("CBNRegulatoryReportWorkflow completed", "report_id", reportID)
	return nil
}
