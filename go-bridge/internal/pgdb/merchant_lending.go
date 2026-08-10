package pgdb

import (
	"context"
	"fmt"
	"time"
)

// MerchantCreditMetrics holds the metrics used for credit scoring.
type MerchantCreditMetrics struct {
	GMV30dKobo            uint64
	AvgDailyTxns          float64
	DisputeRate           float64
	ChargebackRate        float64
	AccountAgeDays        int
	RepaymentHistoryScore float64
	ActiveDaysRatio       float64
	OutstandingLoanKobo   uint64
}

// MerchantLoanRecord holds a merchant loan application.
type MerchantLoanRecord struct {
	LoanID        string
	MerchantID    string
	Status        string
	RequestedKobo uint64
	ApprovedKobo  uint64
	CreditScore   int
	RiskBand      string
	RateAnnualPct float64
	TermDays      int
	PurposeCode   string
	Notes         string
	DisbursedAt   *time.Time
	TransferID    string
}

// GetMerchantCreditMetrics fetches credit metrics for a merchant.
func GetMerchantCreditMetrics(ctx context.Context, merchantID string) (*MerchantCreditMetrics, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT
		   COALESCE(SUM(CASE WHEN created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY) THEN amount_kobo ELSE 0 END), 0) AS gmv_30d,
		   COALESCE(COUNT(*) / 30.0, 0) AS avg_daily_txns,
		   COALESCE(SUM(CASE WHEN status = 'disputed' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS dispute_rate,
		   COALESCE(SUM(CASE WHEN status = 'chargeback' THEN 1 ELSE 0 END) / NULLIF(COUNT(*), 0), 0) AS chargeback_rate
		 FROM transactions WHERE merchant_id = ? AND created_at >= DATE_SUB(NOW(), INTERVAL 90 DAY)`,
		merchantID,
	)
	var m MerchantCreditMetrics
	if err := row.Scan(&m.GMV30dKobo, &m.AvgDailyTxns, &m.DisputeRate, &m.ChargebackRate); err != nil {
		return nil, fmt.Errorf("GetMerchantCreditMetrics: %w", err)
	}
	// Account age
	ageRow := db.db.QueryRowContext(ctx,
		`SELECT DATEDIFF(NOW(), created_at) FROM merchants WHERE merchant_id = ? LIMIT 1`,
		merchantID,
	)
	_ = ageRow.Scan(&m.AccountAgeDays)
	// Outstanding loan amount
	loanRow := db.db.QueryRowContext(ctx,
		`SELECT COALESCE(SUM(approved_kobo), 0) FROM merchant_loans
		   WHERE merchant_id = ? AND status IN ('disbursed', 'active')`,
		merchantID,
	)
	_ = loanRow.Scan(&m.OutstandingLoanKobo)
	// Repayment history score (0-100 based on on-time payments)
	repayRow := db.db.QueryRowContext(ctx,
		`SELECT COALESCE(
		   SUM(CASE WHEN status = 'paid' THEN 1 ELSE 0 END) * 100.0 / NULLIF(COUNT(*), 0),
		   50.0
		 ) FROM loan_instalments WHERE loan_id IN (
		   SELECT loan_id FROM merchant_loans WHERE merchant_id = ?
		 )`,
		merchantID,
	)
	m.RepaymentHistoryScore = 50.0
	_ = repayRow.Scan(&m.RepaymentHistoryScore)
	m.ActiveDaysRatio = 0.7 // Default
	return &m, nil
}

// CreateMerchantLoan inserts a new merchant loan application.
func CreateMerchantLoan(ctx context.Context, rec MerchantLoanRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO merchant_loans
		   (loan_id, merchant_id, status, requested_kobo, approved_kobo, credit_score,
		    risk_band, rate_annual_pct, term_days, purpose_code, notes, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.LoanID, rec.MerchantID, rec.Status, rec.RequestedKobo, rec.ApprovedKobo,
		rec.CreditScore, rec.RiskBand, rec.RateAnnualPct, rec.TermDays, rec.PurposeCode, rec.Notes,
	)
	if err != nil {
		return fmt.Errorf("CreateMerchantLoan: %w", err)
	}
	return nil
}


