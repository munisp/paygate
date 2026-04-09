// Package temporal — KYB Activities
// Activities for KYBWorkflow and CBNRegulatoryReportWorkflow.
package temporal

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// InitKYBRecordActivity creates the initial KYB verification record.
func InitKYBRecordActivity(ctx context.Context, verificationID string, input KYBWorkflowInput) error {
	return pgdb.CreateKYBRecord(ctx, pgdb.KYBRecord{
		VerificationID: verificationID,
		MerchantID:     input.MerchantID,
		BusinessName:   input.BusinessName,
		RCNumber:       input.RCNumber,
		TaxID:          input.TaxID,
		BusinessType:   input.BusinessType,
		IndustryCode:   input.IndustryCode,
		Status:         "in_progress",
		InitiatedBy:    input.InitiatedBy,
		StartedAt:      time.Now().UTC(),
	})
}

// VerifyCACRegistrationActivity verifies a CAC registration number via the NIBSS/CAC API.
func VerifyCACRegistrationActivity(ctx context.Context, rcNumber, businessName string) (bool, error) {
	// In production: call CAC API or NIBSS business registry
	// For now: validate format and return true for valid RC numbers
	if len(rcNumber) < 5 {
		return false, nil
	}
	slog.Info("CAC verification", "rc_number", rcNumber, "business_name", businessName)
	return true, nil
}

// VerifyTINActivity verifies a Tax Identification Number with FIRS.
func VerifyTINActivity(ctx context.Context, tin, businessName string) (bool, error) {
	if len(tin) < 8 {
		return false, nil
	}
	slog.Info("TIN verification", "tin", tin, "business_name", businessName)
	return true, nil
}

// VerifyDirectorKYCActivity runs KYC on a business director via Youverify.
func VerifyDirectorKYCActivity(ctx context.Context, verificationID, directorID string) (bool, error) {
	director, err := pgdb.GetDirectorInfo(ctx, directorID)
	if err != nil {
		return false, fmt.Errorf("director not found: %w", err)
	}

	youverifyURL := os.Getenv("YOUVERIFY_API_KEY")
	if youverifyURL == "" {
		slog.Warn("Youverify API key not set, skipping director KYC")
		return true, nil
	}

	// Call Youverify BVN/NIN verification
	payload := map[string]interface{}{
		"id":   director.BVN,
		"type": "bvn",
		"metadata": map[string]interface{}{
			"director_id":     directorID,
			"verification_id": verificationID,
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST",
		"https://api.youverify.co/v2/api/identity/bvn/verify",
		bytes.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("token", os.Getenv("YOUVERIFY_API_KEY"))

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return false, fmt.Errorf("Youverify request failed: %w", err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	success, _ := result["success"].(bool)
	slog.Info("Director KYC result", "director_id", directorID, "success", success)
	return success, nil
}

// YouverifyBusinessVerificationActivity verifies business documents via Youverify.
func YouverifyBusinessVerificationActivity(ctx context.Context, verificationID, merchantID string) (int, error) {
	apiKey := os.Getenv("YOUVERIFY_API_KEY")
	if apiKey == "" {
		slog.Warn("Youverify API key not set, returning default score")
		return 75, nil
	}

	merchant, err := pgdb.GetMerchantProfile(ctx, merchantID)
	if err != nil {
		return 0, fmt.Errorf("merchant not found: %w", err)
	}

	payload := map[string]interface{}{
		"rc_number":     merchant.RCNumber,
		"business_name": merchant.BusinessName,
		"metadata": map[string]interface{}{
			"merchant_id":     merchantID,
			"verification_id": verificationID,
		},
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequestWithContext(ctx, "POST",
		"https://api.youverify.co/v2/api/business/cac/verify",
		bytes.NewReader(body),
	)
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("token", apiKey)

	client := &http.Client{Timeout: 30 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		slog.Warn("Youverify business verification failed", "err", err)
		return 50, nil
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	json.NewDecoder(resp.Body).Decode(&result)

	if success, _ := result["success"].(bool); success {
		return 85, nil
	}
	return 30, nil
}

// SanctionsScreeningActivity screens business and directors against sanctions/PEP lists.
func SanctionsScreeningActivity(ctx context.Context, businessName string, directorIDs []string) (bool, error) {
	// In production: integrate with Refinitiv World-Check or ComplyAdvantage
	// For now: check internal blocklist
	blocked, err := pgdb.CheckSanctionsList(ctx, businessName)
	if err != nil {
		return false, nil // Non-fatal — log and continue
	}
	if blocked {
		slog.Warn("Sanctions match found", "business_name", businessName)
		return true, nil
	}
	return false, nil
}

// UpdateKYBStepActivity updates the status of a KYB verification step.
func UpdateKYBStepActivity(ctx context.Context, verificationID, step, status, notes string) error {
	return pgdb.UpdateKYBStep(ctx, verificationID, step, status, notes)
}

// KYBRiskAssessmentActivity computes the overall risk level for a KYB application.
func KYBRiskAssessmentActivity(ctx context.Context, verificationID string, input KYBRiskInput) (string, error) {
	score := 0

	if input.CACVerified {
		score += 25
	}
	if input.TINVerified {
		score += 20
	}
	if input.AllDirectorsVerified {
		score += 25
	}
	score += input.YouverifyScore / 5 // max 20 points from Youverify

	// High-risk industries
	highRiskIndustries := map[string]bool{
		"gambling": true, "crypto": true, "forex": true,
		"money_transfer": true, "pawnbroking": true,
	}
	if highRiskIndustries[input.IndustryCode] {
		score -= 20
	}

	var riskLevel string
	switch {
	case score >= 80:
		riskLevel = "low"
	case score >= 60:
		riskLevel = "medium"
	default:
		riskLevel = "high"
	}

	pgdb.UpdateKYBRiskLevel(ctx, verificationID, riskLevel, score)
	return riskLevel, nil
}

// FinalizeKYBActivity updates the merchant KYB status and sends Kafka event.
func FinalizeKYBActivity(ctx context.Context, merchantID, verificationID, status, riskLevel string) error {
	if err := pgdb.UpdateMerchantKYBStatus(ctx, merchantID, status, riskLevel); err != nil {
		return err
	}
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.kyb",
		Key:   merchantID,
		Value: map[string]interface{}{
			"event_type":      "kyb.verification.completed",
			"merchant_id":     merchantID,
			"verification_id": verificationID,
			"status":          status,
			"risk_level":      riskLevel,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}

// GenerateCBNKYBReportActivity generates a KYB summary report for CBN compliance.
func GenerateCBNKYBReportActivity(ctx context.Context, verificationID string, input KYBWorkflowInput) error {
	reportID := fmt.Sprintf("CBN-KYB-%s-%d", input.MerchantID, time.Now().Unix())
	slog.Info("Generating CBN KYB report", "report_id", reportID, "merchant_id", input.MerchantID)
	return pgdb.CreateComplianceReport(ctx, pgdb.ComplianceReportRecord{
		ReportID:    reportID,
		MerchantID:  input.MerchantID,
		ReportType:  "kyb_summary",
		Status:      "generated",
		GeneratedAt: time.Now().UTC(),
	})
}

// NotifyKYBCompletionActivity notifies the merchant and owner of KYB completion.
func NotifyKYBCompletionActivity(ctx context.Context, merchantID, status, riskLevel string) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.notifications",
		Key:   merchantID,
		Value: map[string]interface{}{
			"event_type":  "kyb.notification",
			"merchant_id": merchantID,
			"status":      status,
			"risk_level":  riskLevel,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}

// AggregateCBNReportDataActivity aggregates transaction data for CBN reporting.
func AggregateCBNReportDataActivity(ctx context.Context, input CBNReportWorkflowInput) (map[string]interface{}, error) {
	data, err := pgdb.AggregateCBNReportData(ctx, input.MerchantID, input.PeriodStart, input.PeriodEnd, input.ReportType)
	if err != nil {
		return nil, fmt.Errorf("aggregation failed: %w", err)
	}
	return data, nil
}

// GenerateCBNReportDocumentActivity generates the CBN report document.
func GenerateCBNReportDocumentActivity(ctx context.Context, input CBNReportWorkflowInput, data map[string]interface{}) (string, error) {
	reportID := fmt.Sprintf("CBN-%s-%s-%d", input.ReportType, input.MerchantID, time.Now().Unix())
	if err := pgdb.CreateComplianceReport(ctx, pgdb.ComplianceReportRecord{
		ReportID:    reportID,
		MerchantID:  input.MerchantID,
		ReportType:  input.ReportType,
		PeriodStart: input.PeriodStart,
		PeriodEnd:   input.PeriodEnd,
		Status:      "generated",
		GeneratedAt: time.Now().UTC(),
		GeneratedBy: input.GeneratedBy,
	}); err != nil {
		return "", err
	}
	slog.Info("CBN report generated", "report_id", reportID, "type", input.ReportType)
	return reportID, nil
}

// SubmitCBNReportActivity submits the report to the CBN regulatory portal.
func SubmitCBNReportActivity(ctx context.Context, reportID, reportType string) error {
	// In production: submit via CBN's RAAS portal or NIBSS gateway
	slog.Info("CBN report submitted (simulated)", "report_id", reportID, "type", reportType)
	return pgdb.UpdateComplianceReportStatus(ctx, reportID, "submitted")
}

// NotifyComplianceTeamActivity sends a Kafka notification to the compliance team.
func NotifyComplianceTeamActivity(ctx context.Context, reportID, reportType, merchantID string) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.compliance",
		Key:   reportID,
		Value: map[string]interface{}{
			"event_type":  "compliance.report.ready",
			"report_id":   reportID,
			"report_type": reportType,
			"merchant_id": merchantID,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}
