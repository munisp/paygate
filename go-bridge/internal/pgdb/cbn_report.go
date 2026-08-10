package pgdb

import (
	"context"
	"database/sql"
	"fmt"
)

// CBNReportData holds aggregated data for a CBN regulatory report.
type CBNReportData struct {
	MerchantID          string
	TotalTransactions   int64
	TotalVolumeKobo     int64
	SuspiciousCount     int64
	LargeTransactions   int64
	UniqueCustomers     int64
	ReportingPeriodFrom string
	ReportingPeriodTo   string
}

// MerchantLoanRow holds loan data for a merchant.
type MerchantLoanRow struct {
	LoanID          string
	MerchantID      string
	AmountKobo      int64
	ApprovedKobo    uint64
	OutstandingKobo int64
	Status          string
	DueDate         string
	RateAnnualPct   float64
	TermDays        int
	CreditScore     int
	RiskBand        string
	PurposeCode     string
	Notes           string
}

// AggregateCBNReportData aggregates transaction data for a CBN regulatory report.
func AggregateCBNReportData(ctx context.Context, merchantID, periodFrom, periodTo, reportType string) (map[string]interface{}, error) {
	db := Get()
	if db == nil {
		// Return empty data if DB not available
		return map[string]interface{}{
			"merchant_id": merchantID,
			"report_type": reportType,
			"period_from": periodFrom,
			"period_to":   periodTo,
		}, nil
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT
		   COUNT(*) AS total_txns,
		   COALESCE(SUM(amount_kobo), 0) AS total_volume,
		   COUNT(CASE WHEN is_suspicious = 1 THEN 1 END) AS suspicious_count,
		   COUNT(CASE WHEN amount_kobo >= 500000000 THEN 1 END) AS large_txns,
		   COUNT(DISTINCT customer_id) AS unique_customers
		 FROM transactions
		 WHERE merchant_id = ?
		   AND created_at BETWEEN ? AND ?`,
		merchantID, periodFrom, periodTo,
	)
	var totalTxns, totalVolume, suspiciousCount, largeTxns, uniqueCustomers int64
	if err := row.Scan(
		&totalTxns, &totalVolume, &suspiciousCount, &largeTxns, &uniqueCustomers,
	); err != nil && err != sql.ErrNoRows {
		return nil, fmt.Errorf("AggregateCBNReportData: %w", err)
	}
	return map[string]interface{}{
		"merchant_id":          merchantID,
		"report_type":          reportType,
		"period_from":          periodFrom,
		"period_to":            periodTo,
		"total_transactions":   totalTxns,
		"total_volume_kobo":    totalVolume,
		"suspicious_count":     suspiciousCount,
		"large_transactions":   largeTxns,
		"unique_customers":     uniqueCustomers,
	}, nil
}

// GetMerchantLoan fetches a loan by ID.
func GetMerchantLoan(ctx context.Context, loanID string) (*MerchantLoanRow, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT loan_id, merchant_id, amount_kobo, COALESCE(approved_kobo, amount_kobo),
		        COALESCE(outstanding_kobo, 0), status, COALESCE(due_date, ''),
		        COALESCE(rate_annual_pct, 0), COALESCE(term_days, 0),
		        COALESCE(credit_score, 0), COALESCE(risk_band, ''),
		        COALESCE(purpose_code, ''), COALESCE(notes, '')
		   FROM merchant_loans WHERE loan_id = ? LIMIT 1`,
		loanID,
	)
	var l MerchantLoanRow
	if err := row.Scan(
		&l.LoanID, &l.MerchantID, &l.AmountKobo, &l.ApprovedKobo,
		&l.OutstandingKobo, &l.Status, &l.DueDate,
		&l.RateAnnualPct, &l.TermDays, &l.CreditScore, &l.RiskBand,
		&l.PurposeCode, &l.Notes,
	); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("loan %s not found", loanID)
		}
		return nil, fmt.Errorf("GetMerchantLoan: %w", err)
	}
	return &l, nil
}

// UpdateComplianceReportStatus updates the status of a compliance report.
func UpdateComplianceReportStatus(ctx context.Context, reportID, status string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE compliance_reports SET status = ?, updated_at = NOW() WHERE report_id = ?`,
		status, reportID,
	)
	if err != nil {
		return fmt.Errorf("UpdateComplianceReportStatus: %w", err)
	}
	return nil
}
