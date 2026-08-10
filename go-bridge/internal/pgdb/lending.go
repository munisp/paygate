package pgdb

import (
	"context"
	"database/sql"
	"fmt"
	"time"
)

// LoanInstalmentRecord holds a single loan repayment instalment.
type LoanInstalmentRecord struct {
	LoanID           string
	InstalmentNumber int
	DueDate          time.Time
	PrincipalKobo    uint64
	InterestKobo     uint64
	TotalKobo        uint64
	Status           string
}

// LoanRepaymentRecord holds a recorded loan repayment.
type LoanRepaymentRecord struct {
	RepaymentID      string
	LoanID           string
	MerchantID       string
	AmountKobo       uint64
	Reference        string
	TransferID       string
	InstalmentNumber int
}

// UpdateLoanStatus updates the status of a loan.
func UpdateLoanStatus(ctx context.Context, loanID, status, transferID string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE merchant_loans SET status = ?, transfer_id = ?, updated_at = NOW() WHERE loan_id = ?`,
		status, transferID, loanID,
	)
	if err != nil {
		return fmt.Errorf("UpdateLoanStatus: %w", err)
	}
	return nil
}

// PersistLoanInstalments inserts repayment instalment records in bulk.
func PersistLoanInstalments(ctx context.Context, records []LoanInstalmentRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	for _, r := range records {
		_, err := db.db.ExecContext(ctx,
			`INSERT INTO loan_instalments
			   (loan_id, instalment_number, due_date, principal_kobo, interest_kobo, total_kobo, status, created_at)
			   VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
			r.LoanID, r.InstalmentNumber, r.DueDate, r.PrincipalKobo, r.InterestKobo, r.TotalKobo, r.Status,
		)
		if err != nil {
			return fmt.Errorf("PersistLoanInstalments[%d]: %w", r.InstalmentNumber, err)
		}
	}
	return nil
}

// RecordLoanRepayment inserts a loan repayment record.
func RecordLoanRepayment(ctx context.Context, rec LoanRepaymentRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO loan_repayments
		   (repayment_id, loan_id, merchant_id, amount_kobo, reference, transfer_id, instalment_number, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.RepaymentID, rec.LoanID, rec.MerchantID, rec.AmountKobo,
		rec.Reference, rec.TransferID, rec.InstalmentNumber,
	)
	if err != nil {
		return fmt.Errorf("RecordLoanRepayment: %w", err)
	}
	return nil
}

// UpdateInstalmentStatus updates the status of a specific loan instalment.
func UpdateInstalmentStatus(ctx context.Context, loanID string, instalmentNumber int, status string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE loan_instalments SET status = ?, updated_at = NOW()
		   WHERE loan_id = ? AND instalment_number = ?`,
		status, loanID, instalmentNumber,
	)
	if err != nil {
		return fmt.Errorf("UpdateInstalmentStatus: %w", err)
	}
	return nil
}

// IsInstalmentPaid returns true if the instalment has been paid.
func IsInstalmentPaid(ctx context.Context, loanID string, instalmentNumber int) (bool, error) {
	db := Get()
	if db == nil {
		return false, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT status FROM loan_instalments WHERE loan_id = ? AND instalment_number = ? LIMIT 1`,
		loanID, instalmentNumber,
	)
	var status string
	if err := row.Scan(&status); err != nil {
		if err == sql.ErrNoRows {
			return false, nil
		}
		return false, fmt.Errorf("IsInstalmentPaid: %w", err)
	}
	return status == "paid", nil
}

// FlagMerchantDefaultRisk flags a merchant for loan default risk.
func FlagMerchantDefaultRisk(ctx context.Context, merchantID, loanID string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO merchant_risk_flags (merchant_id, loan_id, flag_type, created_at)
		   VALUES (?, ?, 'loan_default_risk', NOW())
		   ON DUPLICATE KEY UPDATE loan_id = ?, updated_at = NOW()`,
		merchantID, loanID, loanID,
	)
	if err != nil {
		return fmt.Errorf("FlagMerchantDefaultRisk: %w", err)
	}
	return nil
}
