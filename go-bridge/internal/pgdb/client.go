// Package pgdb provides a lightweight PostgreSQL client for the Go bridge.
// It is used exclusively by Temporal activities to write status updates back
// to the application database after TigerBeetle ledger operations complete.
//
// The connection is initialised once from DATABASE_URL and shared across all
// activity goroutines.  All operations use the standard database/sql interface
// with lib/pq as the driver.
package pgdb

import (
	"context"
	"database/sql"
	"fmt"
	"log/slog"
	"os"
	"sync"
	"time"

	_ "github.com/lib/pq"
)

var (
	globalDB *DB
	once     sync.Once
)

// DB wraps a *sql.DB with helper methods for the PayGate schema.
type DB struct {
	db      *sql.DB
	enabled bool
}

// Init opens a connection pool to PostgreSQL using DATABASE_URL.
// If DATABASE_URL is not set the client runs in disabled mode and all
// write helpers become no-ops (useful in unit tests).
func Init() error {
	var initErr error
	once.Do(func() {
		dsn := os.Getenv("DATABASE_URL")
		if dsn == "" {
			slog.Warn("[pgdb] DATABASE_URL not set — running in disabled mode")
			globalDB = &DB{enabled: false}
			return
		}
		db, err := sql.Open("postgres", dsn)
		if err != nil {
			initErr = fmt.Errorf("pgdb: open: %w", err)
			return
		}
		db.SetMaxOpenConns(10)
		db.SetMaxIdleConns(5)
		db.SetConnMaxLifetime(5 * time.Minute)
		ctx, cancel := context.WithTimeout(context.Background(), 5*time.Second)
		defer cancel()
		if err := db.PingContext(ctx); err != nil {
			initErr = fmt.Errorf("pgdb: ping: %w", err)
			return
		}
		globalDB = &DB{db: db, enabled: true}
		slog.Info("[pgdb] connected to PostgreSQL")
	})
	return initErr
}

// InitNoop sets the global DB to a disabled (noop) client without requiring
// a real DATABASE_URL.  Safe to call multiple times.  Use in unit tests.
func InitNoop() {
	once.Do(func() {
		globalDB = &DB{enabled: false}
	})
	// If once already fired (e.g. Init was called first), ensure globalDB is set.
	if globalDB == nil {
		globalDB = &DB{enabled: false}
	}
}

// Get returns the global DB instance.  Panics if Init has not been called.
func Get() *DB {
	if globalDB == nil {
		panic("pgdb: Init() has not been called")
	}
	return globalDB
}

// Ping reports whether the database is reachable. In disabled (noop) mode it
// returns an error so readiness probes report the degraded state honestly.
func (d *DB) Ping(ctx context.Context) error {
	if !d.enabled || d.db == nil {
		return fmt.Errorf("pgdb: disabled (DATABASE_URL not set)")
	}
	return d.db.PingContext(ctx)
}

// Close releases the connection pool.
func Close() {
	if globalDB != nil && globalDB.db != nil {
		_ = globalDB.db.Close()
	}
}

// ─── Settlement helpers ───────────────────────────────────────────────────────

// UpdateSettlementStatus sets the status (and optionally processedAt/completedAt)
// of a settlement row identified by its ID.
func (d *DB) UpdateSettlementStatus(ctx context.Context, settlementID, status string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdateSettlementStatus", "id", settlementID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	switch status {
	case "processing":
		q = `UPDATE settlements SET status=$1, processed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, settlementID}
	case "completed":
		q = `UPDATE settlements SET status=$1, completed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, settlementID}
	case "failed":
		q = `UPDATE settlements SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, settlementID}
	default:
		q = `UPDATE settlements SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, settlementID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdateSettlementStatus(%s→%s): %w", settlementID, status, err)
	}
	slog.Info("[pgdb] settlement status updated", "id", settlementID, "status", status)
	return nil
}

// SetSettlementFailureReason records a failure reason on a settlement row.
func (d *DB) SetSettlementFailureReason(ctx context.Context, settlementID, reason string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] SetSettlementFailureReason", "id", settlementID, "reason", reason)
		return nil
	}
	now := time.Now().UTC()
	_, err := d.db.ExecContext(ctx,
		`UPDATE settlements SET failure_reason=$1, updated_at=$2 WHERE id=$3`,
		reason, now, settlementID,
	)
	return err
}

// GetSettlement retrieves a settlement row by ID.
func (d *DB) GetSettlement(ctx context.Context, settlementID string) (*SettlementRow, error) {
	if !d.enabled {
		return &SettlementRow{ID: settlementID, Status: "pending", Currency: "NGN"}, nil
	}
	row := d.db.QueryRowContext(ctx,
		`SELECT id, merchant_id, reference, amount, currency, bank_code, account_number,
		        account_name, status, workflow_id
		   FROM settlements WHERE id=$1`,
		settlementID,
	)
	var s SettlementRow
	if err := row.Scan(&s.ID, &s.MerchantID, &s.Reference, &s.Amount, &s.Currency,
		&s.BankCode, &s.AccountNumber, &s.AccountName, &s.Status, &s.WorkflowID); err != nil {
		return nil, fmt.Errorf("pgdb: GetSettlement(%s): %w", settlementID, err)
	}
	return &s, nil
}

// SettlementRow is a lightweight projection of the settlements table.
type SettlementRow struct {
	ID            string
	MerchantID    string
	Reference     string
	Amount        int64
	Currency      string
	BankCode      sql.NullString
	AccountNumber sql.NullString
	AccountName   sql.NullString
	Status        string
	WorkflowID    sql.NullString
}

// ─── Dispute helpers ──────────────────────────────────────────────────────────

// UpdateDisputeStatus sets the status of a dispute row.
func (d *DB) UpdateDisputeStatus(ctx context.Context, disputeID, status string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdateDisputeStatus", "id", disputeID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	if status == "resolved_merchant" || status == "resolved_customer" || status == "closed" {
		q = `UPDATE disputes SET status=$1, resolved_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, disputeID}
	} else {
		q = `UPDATE disputes SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, disputeID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdateDisputeStatus(%s→%s): %w", disputeID, status, err)
	}
	slog.Info("[pgdb] dispute status updated", "id", disputeID, "status", status)
	return nil
}

// ─── KYC helpers ─────────────────────────────────────────────────────────────

// UpdateKYCStatus sets the status of a KYC submission row.
func (d *DB) UpdateKYCStatus(ctx context.Context, submissionID, status, rejectionReason string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdateKYCStatus", "id", submissionID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	if rejectionReason != "" {
		q = `UPDATE kyc_submissions SET status=$1, rejection_reason=$2, reviewed_at=$3, updated_at=$4 WHERE id=$5`
		args = []any{status, rejectionReason, now, now, submissionID}
	} else {
		q = `UPDATE kyc_submissions SET status=$1, reviewed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, submissionID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdateKYCStatus(%s→%s): %w", submissionID, status, err)
	}
	slog.Info("[pgdb] KYC status updated", "id", submissionID, "status", status)
	return nil
}

// ─── BNPL helpers ─────────────────────────────────────────────────────────────

// UpdateBNPLStatus sets the status of a BNPL loan row.
func (d *DB) UpdateBNPLStatus(ctx context.Context, loanID, status string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdateBNPLStatus", "id", loanID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	switch status {
	case "completed":
		q = `UPDATE bnpl_loans SET status=$1, completed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, loanID}
	case "defaulted":
		q = `UPDATE bnpl_loans SET status=$1, defaulted_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, loanID}
	default:
		q = `UPDATE bnpl_loans SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, loanID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdateBNPLStatus(%s→%s): %w", loanID, status, err)
	}
	slog.Info("[pgdb] BNPL loan status updated", "id", loanID, "status", status)
	return nil
}

// ─── Payout helpers ───────────────────────────────────────────────────────────

// UpdatePayoutStatus sets the status of a payout row.
func (d *DB) UpdatePayoutStatus(ctx context.Context, payoutID, status, failureReason string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdatePayoutStatus", "id", payoutID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	if failureReason != "" {
		q = `UPDATE payouts SET status=$1, failure_reason=$2, processed_at=$3, updated_at=$4 WHERE id=$5`
		args = []any{status, failureReason, now, now, payoutID}
	} else if status == "completed" || status == "processing" {
		q = `UPDATE payouts SET status=$1, processed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, payoutID}
	} else {
		q = `UPDATE payouts SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, payoutID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdatePayoutStatus(%s→%s): %w", payoutID, status, err)
	}
	slog.Info("[pgdb] payout status updated", "id", payoutID, "status", status)
	return nil
}

// GetPayout retrieves a payout row by ID.
func (d *DB) GetPayout(ctx context.Context, payoutID string) (*PayoutRow, error) {
	if !d.enabled {
		return &PayoutRow{ID: payoutID, Amount: 0, Currency: "NGN", Status: "pending_approval"}, nil
	}
	row := d.db.QueryRowContext(ctx,
		`SELECT id, merchant_id, reference, amount, currency, bank_code,
		        account_number, account_name, status
		   FROM payouts WHERE id=$1`,
		payoutID,
	)
	var p PayoutRow
	if err := row.Scan(&p.ID, &p.MerchantID, &p.Reference, &p.Amount, &p.Currency,
		&p.BankCode, &p.AccountNumber, &p.AccountName, &p.Status); err != nil {
		return nil, fmt.Errorf("pgdb: GetPayout(%s): %w", payoutID, err)
	}
	return &p, nil
}

// PayoutRow is a lightweight projection of the payouts table.
type PayoutRow struct {
	ID            string
	MerchantID    string
	Reference     string
	Amount        int64
	Currency      string
	BankCode      sql.NullString
	AccountNumber sql.NullString
	AccountName   sql.NullString
	Status        string
}

// ─── Transaction helpers ──────────────────────────────────────────────────────

// UpdateTransactionStatus sets the status of a transaction row.
func (d *DB) UpdateTransactionStatus(ctx context.Context, txID, status string) error {
	if !d.enabled {
		slog.Info("[pgdb:noop] UpdateTransactionStatus", "id", txID, "status", status)
		return nil
	}
	now := time.Now().UTC()
	var q string
	var args []any
	if status == "completed" || status == "reversed" {
		q = `UPDATE transactions SET status=$1, completed_at=$2, updated_at=$3 WHERE id=$4`
		args = []any{status, now, now, txID}
	} else {
		q = `UPDATE transactions SET status=$1, updated_at=$2 WHERE id=$3`
		args = []any{status, now, txID}
	}
	_, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return fmt.Errorf("pgdb: UpdateTransactionStatus(%s→%s): %w", txID, status, err)
	}
	slog.Info("[pgdb] transaction status updated", "id", txID, "status", status)
	return nil
}

// ─── Reconciliation helpers ───────────────────────────────────────────────────

// ReconciliationRow holds a merchant's PostgreSQL-side balance aggregate.
type ReconciliationRow struct {
	MerchantID string
	Currency   string
	PGBalance  int64 // sum of net_amount for completed transactions
}

// GetMerchantBalances returns the sum of net_amount for all completed
// transactions grouped by merchant_id and currency.
// Used by the reconciliation worker to compare against TigerBeetle.
func (d *DB) GetMerchantBalances(ctx context.Context) ([]ReconciliationRow, error) {
	if !d.enabled {
		return nil, nil
	}
	rows, err := d.db.QueryContext(ctx,
		`SELECT merchant_id, currency, COALESCE(SUM(net_amount),0) AS pg_balance
		   FROM transactions
		  WHERE status = 'completed'
		  GROUP BY merchant_id, currency`,
	)
	if err != nil {
		return nil, fmt.Errorf("pgdb: GetMerchantBalances: %w", err)
	}
	defer rows.Close()
	var result []ReconciliationRow
	for rows.Next() {
		var r ReconciliationRow
		if err := rows.Scan(&r.MerchantID, &r.Currency, &r.PGBalance); err != nil {
			return nil, err
		}
		result = append(result, r)
	}
	return result, rows.Err()
}

// InsertReconciliationAlert records a balance mismatch in the audit log table.
func (d *DB) InsertReconciliationAlert(ctx context.Context, merchantID, currency string, pgBalance, tbBalance int64, delta int64) error {
	if !d.enabled {
		slog.Warn("[pgdb:noop] InsertReconciliationAlert",
			"merchant_id", merchantID, "currency", currency,
			"pg_balance", pgBalance, "tb_balance", tbBalance, "delta", delta)
		return nil
	}
	_, err := d.db.ExecContext(ctx,
		`INSERT INTO reconciliation_alerts
		   (id, merchant_id, currency, pg_balance, tb_balance, delta, created_at)
		 VALUES (gen_random_uuid(), $1, $2, $3, $4, $5, NOW())
		 ON CONFLICT DO NOTHING`,
		merchantID, currency, pgBalance, tbBalance, delta,
	)
	return err
}
