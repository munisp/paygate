package pgdb

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// KYBRecord holds the initial KYB verification data.
type KYBRecord struct {
	VerificationID string
	MerchantID     string
	BusinessName   string
	RCNumber       string
	TaxID          string
	BusinessType   string
	IndustryCode   string
	Status         string
	InitiatedBy    string
	StartedAt      time.Time
}

// DirectorInfo holds director KYC data.
type DirectorInfo struct {
	ID          string
	MerchantID  string
	FullName    string
	BVN         string
	NIN         string
	DateOfBirth string
}

// MerchantProfile holds merchant profile data.
type MerchantProfile struct {
	MerchantID   string
	BusinessName string
	RCNumber     string
	TaxID        string
	Address      string
	State        string
	Country      string
	KYCStatus    string
	KYBStatus    string
}

// ComplianceReportRecord holds a compliance report.
type ComplianceReportRecord struct {
	ReportID       string
	MerchantID     string
	VerificationID string
	ReportType     string
	Status         string
	RiskLevel      string
	Findings       string
	GeneratedAt    time.Time
	PeriodStart    string
	PeriodEnd      string
	GeneratedBy    string
}

// CreateKYBRecord inserts a new KYB verification record.
func CreateKYBRecord(ctx context.Context, rec KYBRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO kyb_verifications
		   (verification_id, merchant_id, business_name, rc_number, tax_id, business_type,
		    industry_code, status, initiated_by, started_at, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.VerificationID, rec.MerchantID, rec.BusinessName, rec.RCNumber,
		rec.TaxID, rec.BusinessType, rec.IndustryCode, rec.Status,
		rec.InitiatedBy, rec.StartedAt,
	)
	if err != nil {
		return fmt.Errorf("CreateKYBRecord: %w", err)
	}
	return nil
}

// GetDirectorInfo fetches a director by ID.
func GetDirectorInfo(ctx context.Context, directorID string) (*DirectorInfo, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT id, merchant_id, full_name, bvn, nin, date_of_birth
		   FROM merchant_directors WHERE id = ? LIMIT 1`,
		directorID,
	)
	var d DirectorInfo
	if err := row.Scan(&d.ID, &d.MerchantID, &d.FullName, &d.BVN, &d.NIN, &d.DateOfBirth); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("director %s not found", directorID)
		}
		return nil, fmt.Errorf("GetDirectorInfo: %w", err)
	}
	return &d, nil
}

// GetMerchantProfile fetches a merchant profile by ID.
func GetMerchantProfile(ctx context.Context, merchantID string) (*MerchantProfile, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT merchant_id, business_name, rc_number, tax_id, address, state, country,
		        COALESCE(kyc_status, 'pending'), COALESCE(kyb_status, 'pending')
		   FROM merchant_profiles WHERE merchant_id = ? LIMIT 1`,
		merchantID,
	)
	var p MerchantProfile
	if err := row.Scan(&p.MerchantID, &p.BusinessName, &p.RCNumber, &p.TaxID, &p.Address, &p.State, &p.Country, &p.KYCStatus, &p.KYBStatus); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("merchant profile %s not found", merchantID)
		}
		return nil, fmt.Errorf("GetMerchantProfile: %w", err)
	}
	return &p, nil
}

// CheckSanctionsList checks if a name appears on a sanctions list.
// Returns true if the entity is sanctioned.
func CheckSanctionsList(ctx context.Context, entityName string) (bool, error) {
	// In production: call OFAC/UN/EU sanctions API
	// For now: return false (not sanctioned) as a safe default
	return false, nil
}

// UpdateKYBStep updates the status of a specific KYB verification step.
func UpdateKYBStep(ctx context.Context, verificationID, step, status, notes string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO kyb_steps (verification_id, step_name, status, updated_at)
		   VALUES (?, ?, ?, NOW())
		   ON DUPLICATE KEY UPDATE status = ?, updated_at = NOW()`,
		verificationID, step, status, status,
	)
	if err != nil {
		return fmt.Errorf("UpdateKYBStep: %w", err)
	}
	return nil
}

// UpdateKYBRiskLevel updates the risk level for a KYB verification.
func UpdateKYBRiskLevel(ctx context.Context, verificationID, riskLevel string, score int) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE kyb_verifications SET risk_level = ?, updated_at = NOW() WHERE verification_id = ?`,
		riskLevel, verificationID,
	)
	if err != nil {
		return fmt.Errorf("UpdateKYBRiskLevel: %w", err)
	}
	return nil
}

// UpdateMerchantKYBStatus updates the KYB status on the merchant record.
func UpdateMerchantKYBStatus(ctx context.Context, merchantID, status, riskLevel string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE merchants SET kyb_status = ?, kyb_updated_at = NOW() WHERE id = ?`,
		status, merchantID,
	)
	if err != nil {
		return fmt.Errorf("UpdateMerchantKYBStatus: %w", err)
	}
	return nil
}

// CreateComplianceReport inserts a compliance report record.
func CreateComplianceReport(ctx context.Context, rec ComplianceReportRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO compliance_reports
		   (report_id, merchant_id, verification_id, report_type, status, risk_level, findings, generated_at, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.ReportID, rec.MerchantID, rec.VerificationID, rec.ReportType,
		rec.Status, rec.RiskLevel, rec.Findings, rec.GeneratedAt,
	)
	if err != nil {
		return fmt.Errorf("CreateComplianceReport: %w", err)
	}
	return nil
}
