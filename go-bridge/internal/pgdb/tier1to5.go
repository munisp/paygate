// tier1to5.go — persistence helpers for the Tier 1–5 portal router routes
// (server/tier1to5Router.ts). All queries use PostgreSQL ($n) placeholders and
// match the drizzle schema (drizzle/schema.ts) exactly. Fail-loud: when the
// pool is disabled or a query errors, an error is returned — handlers surface
// HTTP 500 and never fake success.
package pgdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
	"time"
)

// ErrDisabled (declared in go_cache.go) is returned when the pool is in noop
// mode (DATABASE_URL unset or unreachable at boot). Tier 1–5 handlers treat
// this as a 500 — degraded mode must report honestly rather than silently
// dropping mutations.
func (d *DB) ensureEnabled() error {
	if !d.enabled || d.db == nil {
		return ErrDisabled
	}
	return nil
}

// queryMaps runs a query and returns rows as JSON-friendly maps. []byte values
// (text/jsonb) are converted to string; everything else is passed through.
func (d *DB) queryMaps(ctx context.Context, q string, args ...interface{}) ([]map[string]interface{}, error) {
	if err := d.ensureEnabled(); err != nil {
		return nil, err
	}
	rows, err := d.db.QueryContext(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	defer rows.Close()
	cols, err := rows.Columns()
	if err != nil {
		return nil, err
	}
	out := make([]map[string]interface{}, 0)
	for rows.Next() {
		vals := make([]interface{}, len(cols))
		ptrs := make([]interface{}, len(cols))
		for i := range vals {
			ptrs[i] = &vals[i]
		}
		if err := rows.Scan(ptrs...); err != nil {
			return nil, err
		}
		m := make(map[string]interface{}, len(cols))
		for i, c := range cols {
			if b, ok := vals[i].([]byte); ok {
				m[c] = string(b)
			} else {
				m[c] = vals[i]
			}
		}
		out = append(out, m)
	}
	return out, rows.Err()
}

// queryRowMap runs a query expected to return at most one row.
// Returns sql.ErrNoRows when there is no row.
func (d *DB) queryRowMap(ctx context.Context, q string, args ...interface{}) (map[string]interface{}, error) {
	rows, err := d.queryMaps(ctx, q, args...)
	if err != nil {
		return nil, err
	}
	if len(rows) == 0 {
		return nil, sql.ErrNoRows
	}
	return rows[0], nil
}

func (d *DB) execRows(ctx context.Context, q string, args ...interface{}) (int64, error) {
	if err := d.ensureEnabled(); err != nil {
		return 0, err
	}
	res, err := d.db.ExecContext(ctx, q, args...)
	if err != nil {
		return 0, err
	}
	n, err := res.RowsAffected()
	if err != nil {
		return 0, err
	}
	return n, nil
}

func toJSON(v interface{}) string {
	b, _ := json.Marshal(v)
	return string(b)
}

// ─── Tier 1a: Merchant Lending ────────────────────────────────────────────────

// T5CreateLoanApplication inserts a merchant_loans row (status pending_review).
func (d *DB) T5CreateLoanApplication(ctx context.Context, loanID, merchantID string, requestedKobo int64, purposeCode string, repaymentDays int, notes string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO merchant_loans
		  (loan_id, merchant_id, status, requested_kobo, term_days, purpose_code, notes, created_at, updated_at)
		VALUES ($1,$2,'pending_review',$3,$4,$5,$6,NOW(),NOW())`,
		loanID, merchantID, requestedKobo, repaymentDays, purposeCode, notes,
	)
	return err
}

// T5CreateLoanOffer inserts a loan_offers row for an application.
func (d *DB) T5CreateLoanOffer(ctx context.Context, offerID, applicationID, merchantID string, amountKobo int64, rateAnnualPct string, termDays int, expiresAt time.Time) error {
	_, err := d.execRows(ctx, `
		INSERT INTO loan_offers
		  (offer_id, application_id, merchant_id, amount_kobo, rate_annual_pct, term_days, status, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,'open',$7,NOW())`,
		offerID, applicationID, merchantID, amountKobo, rateAnnualPct, termDays, expiresAt,
	)
	return err
}

func (d *DB) T5ListLoanApplications(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT loan_id, merchant_id, status, requested_kobo, approved_kobo, outstanding_kobo,
		       credit_score, risk_band, rate_annual_pct, term_days, purpose_code, notes,
		       due_date, disbursed_at, created_at, updated_at
		  FROM merchant_loans WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantID)
}

func (d *DB) T5ListLoanOffers(ctx context.Context, applicationID, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT offer_id, application_id, merchant_id, amount_kobo, rate_annual_pct, term_days,
		       status, expires_at, created_at
		  FROM loan_offers WHERE application_id=$1 AND merchant_id=$2 ORDER BY created_at DESC`,
		applicationID, merchantID)
}

// T5GetLoanOffer fetches a single offer scoped to the merchant.
func (d *DB) T5GetLoanOffer(ctx context.Context, offerID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT offer_id, application_id, merchant_id, amount_kobo, rate_annual_pct, term_days,
		       status, expires_at
		  FROM loan_offers WHERE offer_id=$1 AND merchant_id=$2`, offerID, merchantID)
}

// T5AcceptLoanOffer atomically marks the offer accepted, approves the loan and
// generates the instalment schedule. Returns sql.ErrNoRows when the offer is
// not open (already accepted/expired) so callers can replay idempotently.
func (d *DB) T5AcceptLoanOffer(ctx context.Context, offerID, applicationID, merchantID string, amountKobo int64, rateAnnualPct string, termDays int) error {
	if err := d.ensureEnabled(); err != nil {
		return err
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE loan_offers SET status='accepted'
		 WHERE offer_id=$1 AND merchant_id=$2 AND status='open'`,
		offerID, merchantID)
	if err != nil {
		return err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		return sql.ErrNoRows
	}

	due := time.Now().UTC().AddDate(0, 0, termDays)
	if _, err := tx.ExecContext(ctx, `
		UPDATE merchant_loans
		   SET status='approved', approved_kobo=$1, amount_kobo=$1, outstanding_kobo=$1,
		       rate_annual_pct=$2, due_date=$3, updated_at=NOW()
		 WHERE loan_id=$4 AND merchant_id=$5`,
		amountKobo, rateAnnualPct, due.Format("2006-01-02"), applicationID, merchantID); err != nil {
		return err
	}

	// Equal-instalment schedule: one instalment per 30 days.
	nInst := (termDays + 29) / 30
	if nInst < 1 {
		nInst = 1
	}
	per := amountKobo / int64(nInst)
	for i := 0; i < nInst; i++ {
		amt := per
		if i == nInst-1 {
			amt = amountKobo - per*int64(nInst-1) // remainder on last instalment
		}
		instDue := time.Now().UTC().AddDate(0, 0, 30*(i+1))
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO loan_instalments (id, loan_id, merchant_id, due_date, amount_kobo, paid_kobo, status, created_at)
			VALUES ($1,$2,$3,$4,$5,0,'pending',NOW())
			ON CONFLICT (id) DO NOTHING`,
			fmt.Sprintf("%s-i%d", applicationID, i+1), applicationID, merchantID,
			instDue.Format("2006-01-02"), amt); err != nil {
			return err
		}
	}
	return tx.Commit()
}

// T5GetLoanRepayment returns the loan row, instalment schedule and repayments.
func (d *DB) T5GetLoanRepayment(ctx context.Context, loanID, merchantID string) (loan map[string]interface{}, instalments, repayments []map[string]interface{}, err error) {
	loan, err = d.queryRowMap(ctx, `
		SELECT loan_id, merchant_id, status, requested_kobo, approved_kobo, outstanding_kobo,
		       rate_annual_pct, term_days, due_date, disbursed_at
		  FROM merchant_loans WHERE loan_id=$1 AND merchant_id=$2`, loanID, merchantID)
	if err != nil {
		return nil, nil, nil, err
	}
	instalments, err = d.queryMaps(ctx, `
		SELECT id, loan_id, due_date, amount_kobo, paid_kobo, status, paid_at
		  FROM loan_instalments WHERE loan_id=$1 AND merchant_id=$2 ORDER BY due_date`,
		loanID, merchantID)
	if err != nil {
		return nil, nil, nil, err
	}
	repayments, err = d.queryMaps(ctx, `
		SELECT id, loan_id, amount_kobo, transfer_id, method, created_at
		  FROM loan_repayments WHERE loan_id=$1 AND merchant_id=$2 ORDER BY created_at DESC`,
		loanID, merchantID)
	if err != nil {
		return nil, nil, nil, err
	}
	return loan, instalments, repayments, nil
}

// T5MerchantCreditMetrics computes credit metrics from real transaction and
// loan history (PostgreSQL syntax).
func (d *DB) T5MerchantCreditMetrics(ctx context.Context, merchantID string) (map[string]interface{}, error) {
	m, err := d.queryRowMap(ctx, `
		SELECT COALESCE(SUM(CASE WHEN created_at >= NOW() - INTERVAL '30 days' THEN amount_kobo ELSE 0 END),0)::bigint AS gmv_30d_kobo,
		       COUNT(*)::bigint AS tx_count_90d,
		       COALESCE(AVG(CASE WHEN status='completed' THEN 1.0 ELSE 0.0 END),0) AS completion_rate
		  FROM transactions
		 WHERE merchant_id=$1 AND created_at >= NOW() - INTERVAL '90 days'`, merchantID)
	if err == sql.ErrNoRows {
		// No transactions at all — return zeroed metrics.
		return map[string]interface{}{"gmv_30d_kobo": int64(0), "tx_count_90d": int64(0), "completion_rate": 0.0}, nil
	}
	if err != nil {
		return nil, err
	}
	loanRow, err := d.queryRowMap(ctx, `
		SELECT COALESCE(SUM(outstanding_kobo),0)::bigint AS outstanding_kobo,
		       COUNT(*)::bigint AS loan_count
		  FROM merchant_loans WHERE merchant_id=$1 AND status IN ('approved','disbursed','active')`, merchantID)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	if loanRow != nil {
		m["outstanding_kobo"] = loanRow["outstanding_kobo"]
		m["active_loan_count"] = loanRow["loan_count"]
	}
	return m, nil
}

// ─── Tier 1b: Split Payments ──────────────────────────────────────────────────

// T5CreateSplitRule persists a split rule. The recipients jsonb column carries
// {"splits":[...],"trigger_events":[...]} (tier router shape).
func (d *DB) T5CreateSplitRule(ctx context.Context, ruleID, merchantID, ruleName string, payload interface{}) error {
	_, err := d.execRows(ctx, `
		INSERT INTO split_rules (rule_id, rule_name, description, recipients, created_by, is_active, created_at, updated_at)
		VALUES ($1,$2,'',$3,$4,1,NOW(),NOW())
		ON CONFLICT (rule_id) DO NOTHING`,
		ruleID, ruleName, toJSON(payload), merchantID)
	return err
}

func (d *DB) T5ListSplitRules(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT rule_id, rule_name, description, recipients, created_by, is_active, created_at
		  FROM split_rules WHERE created_by=$1 AND is_active=1 ORDER BY created_at DESC`, merchantID)
}

func (d *DB) T5GetSplitRule(ctx context.Context, ruleID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT rule_id, rule_name, recipients, is_active
		  FROM split_rules WHERE rule_id=$1 AND created_by=$2`, ruleID, merchantID)
}

// T5GetSplitPaymentByReference supports idempotent replay of /split-payments/execute.
func (d *DB) T5GetSplitPaymentByReference(ctx context.Context, merchantID, reference string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT p.split_payment_id, p.split_rule_id, p.total_amount_kobo, p.reference, p.legs, p.status, p.created_at
		  FROM split_payments p
		  JOIN split_rules r ON r.rule_id = p.split_rule_id
		 WHERE p.reference=$1 AND r.created_by=$2`, reference, merchantID)
}

func (d *DB) T5RecordSplitPayment(ctx context.Context, splitPaymentID, ruleID string, totalKobo int64, reference string, legs interface{}, status string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO split_payments (split_payment_id, split_rule_id, total_amount_kobo, reference, legs, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
		ON CONFLICT (split_payment_id) DO NOTHING`,
		splitPaymentID, ruleID, totalKobo, reference, toJSON(legs), status)
	return err
}

func (d *DB) T5ListSplitPayments(ctx context.Context, merchantID string, limit int) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT p.split_payment_id, p.split_rule_id, p.total_amount_kobo, p.reference, p.legs, p.status, p.created_at
		  FROM split_payments p
		  JOIN split_rules r ON r.rule_id = p.split_rule_id
		 WHERE r.created_by=$1 ORDER BY p.created_at DESC LIMIT $2`, merchantID, limit)
}

// ─── Tier 1c: Recurring Billing ───────────────────────────────────────────────

// T5CreateBillingPlan inserts into subscription_plans and returns the serial id.
func (d *DB) T5CreateBillingPlan(ctx context.Context, merchantID, name string, amountNgn string, currency, interval string) (int64, error) {
	if err := d.ensureEnabled(); err != nil {
		return 0, err
	}
	var id int64
	err := d.db.QueryRowContext(ctx, `
		INSERT INTO subscription_plans (merchant_id, name, amount_ngn, currency, interval, status, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW())
		RETURNING id`, merchantID, name, amountNgn, currency, interval).Scan(&id)
	return id, err
}

func (d *DB) T5ListBillingPlans(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, merchant_id, name, amount_ngn, currency, interval, status, created_at
		  FROM subscription_plans WHERE merchant_id=$1 ORDER BY id DESC`, merchantID)
}

// T5CreateSubscriber inserts a subscription_subscribers row.
func (d *DB) T5CreateSubscriber(ctx context.Context, id, planID, merchantID, customerID, customerEmail, customerName string, startDate time.Time, nextBilling time.Time) error {
	_, err := d.execRows(ctx, `
		INSERT INTO subscription_subscribers
		  (id, plan_id, merchant_id, customer_id, customer_name, customer_email, status, start_date, next_billing_date, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,NOW(),NOW())
		ON CONFLICT (id) DO NOTHING`,
		id, planID, merchantID, customerID, customerName, customerEmail, startDate, nextBilling)
	return err
}

func (d *DB) T5ListSubscribers(ctx context.Context, merchantID, status string) ([]map[string]interface{}, error) {
	if status == "" || status == "all" {
		return d.queryMaps(ctx, `
			SELECT id, plan_id, merchant_id, customer_id, customer_name, customer_email, status,
			       start_date, next_billing_date, cancelled_at, paused_at, total_paid_kobo, created_at
			  FROM subscription_subscribers WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantID)
	}
	return d.queryMaps(ctx, `
		SELECT id, plan_id, merchant_id, customer_id, customer_name, customer_email, status,
		       start_date, next_billing_date, cancelled_at, paused_at, total_paid_kobo, created_at
		  FROM subscription_subscribers WHERE merchant_id=$1 AND status=$2 ORDER BY created_at DESC`,
		merchantID, status)
}

// T5UpdateSubscriberStatus sets paused/cancelled on a merchant-scoped
// subscriber. Returns rows affected (0 → caller returns 404).
func (d *DB) T5UpdateSubscriberStatus(ctx context.Context, merchantID, subscriptionID, status string) (int64, error) {
	col := "paused_at"
	if status == "cancelled" {
		col = "cancelled_at"
	}
	return d.execRows(ctx, fmt.Sprintf(`
		UPDATE subscription_subscribers SET status=$1, %s=NOW(), updated_at=NOW()
		 WHERE id=$2 AND merchant_id=$3 AND status <> $1`, col),
		status, subscriptionID, merchantID)
}

// T5ListDunningQueue lists failed subscription charges for the merchant.
func (d *DB) T5ListDunningQueue(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, subscription_id, merchant_id, amount_kobo, currency, status,
		       failure_reason, charged_at
		  FROM subscription_charges
		 WHERE merchant_id=$1 AND status='failed' ORDER BY charged_at DESC`, merchantID)
}

// ─── Tier 1d: Dynamic Currency Conversion ─────────────────────────────────────

// T5GetFXRate fetches the latest rate for base→target from fx_rates.
func (d *DB) T5GetFXRate(ctx context.Context, base, target string) (rate string, fetchedAt interface{}, err error) {
	m, err := d.queryRowMap(ctx, `
		SELECT rate, fetched_at FROM fx_rates
		 WHERE base_currency=$1 AND target_currency=$2
		 ORDER BY fetched_at DESC LIMIT 1`, base, target)
	if err != nil {
		return "", nil, err
	}
	return fmt.Sprint(m["rate"]), m["fetched_at"], nil
}

// T5CreateDCCLock inserts a dcc_rate_locks row.
func (d *DB) T5CreateDCCLock(ctx context.Context, lockID, merchantID, fromCur, toCur string, amountKobo int64, midRate, customerRate, marginPct string, expiresAt time.Time) error {
	_, err := d.execRows(ctx, `
		INSERT INTO dcc_rate_locks
		  (lock_id, merchant_id, from_currency, to_currency, amount_kobo,
		   mid_rate, customer_rate, margin_pct, status, expires_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'locked',$9,NOW())
		ON CONFLICT (lock_id) DO NOTHING`,
		lockID, merchantID, fromCur, toCur, amountKobo, midRate, customerRate, marginPct, expiresAt)
	return err
}

func (d *DB) T5GetDCCLock(ctx context.Context, lockID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT lock_id, merchant_id, from_currency, to_currency, amount_kobo,
		       mid_rate, customer_rate, margin_pct, status, expires_at, created_at
		  FROM dcc_rate_locks WHERE lock_id=$1 AND merchant_id=$2`, lockID, merchantID)
}

// T5ExecuteDCCLock atomically consumes the lock and records the conversion.
// Idempotent: if the lock was already executed, returns the existing conversion
// row with alreadyExecuted=true.
func (d *DB) T5ExecuteDCCLock(ctx context.Context, lockID, merchantID, conversionID, paymentReference string, convertedKobo int64) (alreadyExecuted bool, existingConversionID string, err error) {
	if err := d.ensureEnabled(); err != nil {
		return false, "", err
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return false, "", err
	}
	defer tx.Rollback()

	res, err := tx.ExecContext(ctx, `
		UPDATE dcc_rate_locks SET status='executed'
		 WHERE lock_id=$1 AND merchant_id=$2 AND status='locked' AND expires_at > NOW()`,
		lockID, merchantID)
	if err != nil {
		return false, "", err
	}
	if n, _ := res.RowsAffected(); n == 0 {
		var existing string
		scanErr := tx.QueryRowContext(ctx,
			`SELECT conversion_id FROM dcc_transactions WHERE lock_id=$1 AND merchant_id=$2`,
			lockID, merchantID).Scan(&existing)
		if scanErr == nil {
			return true, existing, tx.Commit()
		}
		return false, "", sql.ErrNoRows
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO dcc_transactions
		  (conversion_id, merchant_id, from_currency, to_currency, original_amount_kobo,
		   converted_amount_kobo, mid_rate, customer_rate, margin_pct, transfer_id, status, lock_id, created_at)
		SELECT $1, merchant_id, from_currency, to_currency, amount_kobo, $2,
		       mid_rate, customer_rate, margin_pct, $3, 'completed', lock_id, NOW()
		  FROM dcc_rate_locks WHERE lock_id=$4
		ON CONFLICT (conversion_id) DO NOTHING`,
		conversionID, convertedKobo, paymentReference, lockID); err != nil {
		return false, "", err
	}
	return false, conversionID, tx.Commit()
}

func (d *DB) T5ListDCCMarginConfigs(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT merchant_id, currency_pair, margin_pct, created_at, updated_at
		  FROM dcc_margin_configs WHERE merchant_id=$1 ORDER BY currency_pair`, merchantID)
}

func (d *DB) T5GetDCCMargin(ctx context.Context, merchantID, currencyPair string) (string, error) {
	m, err := d.queryRowMap(ctx, `
		SELECT margin_pct FROM dcc_margin_configs WHERE merchant_id=$1 AND currency_pair=$2`,
		merchantID, currencyPair)
	if err == sql.ErrNoRows {
		return "0", nil
	}
	if err != nil {
		return "", err
	}
	return fmt.Sprint(m["margin_pct"]), nil
}

func (d *DB) T5UpsertDCCMargin(ctx context.Context, merchantID, currencyPair, marginPct string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO dcc_margin_configs (merchant_id, currency_pair, margin_pct, created_at, updated_at)
		VALUES ($1,$2,$3,NOW(),NOW())
		ON CONFLICT (merchant_id, currency_pair) DO UPDATE SET margin_pct=EXCLUDED.margin_pct, updated_at=NOW()`,
		merchantID, currencyPair, marginPct)
	return err
}

// ─── Tier 2a: Reconciliation ──────────────────────────────────────────────────

// T5CreateReconRun persists a reconciliation_runs report row.
func (d *DB) T5CreateReconRun(ctx context.Context, reportID, merchantID, periodStart, periodEnd string, sources interface{}, status string, summary interface{}) error {
	_, err := d.execRows(ctx, `
		INSERT INTO reconciliation_runs
		  (report_id, merchant_id, period_start, period_end, sources, status, summary, created_at, completed_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),CASE WHEN $6='completed' THEN NOW() ELSE NULL END)
		ON CONFLICT (report_id) DO NOTHING`,
		reportID, merchantID, periodStart, periodEnd, toJSON(sources), status, toJSON(summary))
	return err
}

func (d *DB) T5GetReconRun(ctx context.Context, reportID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT report_id, merchant_id, period_start, period_end, sources, status, summary, created_at, completed_at
		  FROM reconciliation_runs WHERE report_id=$1 AND merchant_id=$2`, reportID, merchantID)
}

// T5ReconSums aggregates transactions and settlements over a period.
func (d *DB) T5ReconSums(ctx context.Context, merchantID, periodStart, periodEnd string) (map[string]interface{}, error) {
	txRow, err := d.queryRowMap(ctx, `
		SELECT COUNT(*)::bigint AS tx_count, COALESCE(SUM(amount_kobo),0)::bigint AS tx_total_kobo
		  FROM transactions
		 WHERE merchant_id=$1 AND status='completed' AND created_at >= $2 AND created_at < $3::timestamptz + INTERVAL '1 day'`,
		merchantID, periodStart, periodEnd)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	stRow, err := d.queryRowMap(ctx, `
		SELECT COUNT(*)::bigint AS settlement_count, COALESCE(SUM(amount),0)::bigint AS settlement_total_kobo
		  FROM settlements
		 WHERE merchant_id=$1 AND status='completed' AND created_at >= $2 AND created_at < $3::timestamptz + INTERVAL '1 day'`,
		merchantID, periodStart, periodEnd)
	if err != nil && err != sql.ErrNoRows {
		return nil, err
	}
	out := map[string]interface{}{}
	for k, v := range txRow {
		out[k] = v
	}
	for k, v := range stRow {
		out[k] = v
	}
	return out, nil
}

func (d *DB) T5CreateReconAlert(ctx context.Context, merchantID, currency string, pgBalance, tbBalance, delta int64, notes string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO reconciliation_alerts (id, merchant_id, currency, pg_balance, tb_balance, delta, status, notes, created_at, updated_at)
		VALUES (gen_random_uuid(), $1,$2,$3,$4,$5,'open',$6,NOW(),NOW())`,
		merchantID, currency, pgBalance, tbBalance, delta, notes)
	return err
}

func (d *DB) T5ListReconDiscrepancies(ctx context.Context, merchantID, status string, limit int) ([]map[string]interface{}, error) {
	if status == "" || status == "all" {
		return d.queryMaps(ctx, `
			SELECT id, merchant_id, currency, pg_balance, tb_balance, delta, status,
			       resolved_at, resolved_by, notes, created_at
			  FROM reconciliation_alerts WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2`,
			merchantID, limit)
	}
	return d.queryMaps(ctx, `
		SELECT id, merchant_id, currency, pg_balance, tb_balance, delta, status,
		       resolved_at, resolved_by, notes, created_at
		  FROM reconciliation_alerts WHERE merchant_id=$1 AND status=$2 ORDER BY created_at DESC LIMIT $3`,
		merchantID, status, limit)
}

// T5ResolveReconDiscrepancy marks an alert resolved. 0 rows → 404.
func (d *DB) T5ResolveReconDiscrepancy(ctx context.Context, merchantID, discrepancyID, resolution, notes string) (int64, error) {
	return d.execRows(ctx, `
		UPDATE reconciliation_alerts
		   SET status='resolved', resolved_at=NOW(), resolved_by=$1, notes=$2, updated_at=NOW()
		 WHERE id=$3 AND merchant_id=$4 AND status <> 'resolved'`,
		resolution, notes, discrepancyID, merchantID)
}

// ─── Tier 2b: Invoices ────────────────────────────────────────────────────────

func (d *DB) T5CreateInvoice(ctx context.Context, invoiceID, merchantID, customerID, customerEmail, customerName string, lineItems interface{}, subtotalKobo, taxKobo, totalKobo int64, currency, dueDate, notes string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO invoices
		  (invoice_id, merchant_id, customer_id, customer_email, customer_name, line_items,
		   subtotal_kobo, tax_kobo, total_kobo, currency, status, due_date, notes, created_at, updated_at)
		VALUES ($1,$2,NULLIF($3,''),$4,$5,$6,$7,$8,$9,$10,'draft',$11,$12,NOW(),NOW())
		ON CONFLICT (invoice_id) DO NOTHING`,
		invoiceID, merchantID, customerID, customerEmail, customerName, toJSON(lineItems),
		subtotalKobo, taxKobo, totalKobo, currency, dueDate, notes)
	return err
}

// T5UpdateInvoiceStatus performs a merchant-scoped, state-guarded status change.
// 0 rows → caller returns 404/409 honestly.
func (d *DB) T5UpdateInvoiceStatus(ctx context.Context, invoiceID, merchantID, fromStatus, toStatus, paymentLinkURL string) (int64, error) {
	return d.execRows(ctx, `
		UPDATE invoices
		   SET status=$1, payment_link_url=COALESCE(NULLIF($2,''), payment_link_url), updated_at=NOW()
		 WHERE invoice_id=$3 AND merchant_id=$4 AND status=$5`,
		toStatus, paymentLinkURL, invoiceID, merchantID, fromStatus)
}

func (d *DB) T5GetInvoice(ctx context.Context, invoiceID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT invoice_id, merchant_id, customer_id, customer_email, customer_name, line_items,
		       subtotal_kobo, tax_kobo, total_kobo, currency, status, due_date, paid_at,
		       payment_link_url, notes, created_at, updated_at
		  FROM invoices WHERE invoice_id=$1 AND merchant_id=$2`, invoiceID, merchantID)
}

func (d *DB) T5ListInvoices(ctx context.Context, merchantID, status string, limit int) ([]map[string]interface{}, error) {
	base := `
		SELECT invoice_id, merchant_id, customer_id, customer_email, customer_name,
		       subtotal_kobo, tax_kobo, total_kobo, currency, status, due_date, paid_at,
		       payment_link_url, created_at
		  FROM invoices WHERE merchant_id=$1`
	if status == "" || status == "all" {
		return d.queryMaps(ctx, base+` ORDER BY created_at DESC LIMIT $2`, merchantID, limit)
	}
	return d.queryMaps(ctx, base+` AND status=$2 ORDER BY created_at DESC LIMIT $3`, merchantID, status, limit)
}

// ─── Tier 2c: Chargebacks ─────────────────────────────────────────────────────

func (d *DB) T5ListChargebacks(ctx context.Context, merchantID, status string) ([]map[string]interface{}, error) {
	base := `
		SELECT id, merchant_id, transaction_id, stripe_charge_id, amount_kobo, currency,
		       reason, status, due_date, evidence_submitted, evidence_deadline,
		       evidence_url, resolved_at, created_at, updated_at
		  FROM chargebacks WHERE merchant_id=$1`
	if status == "" || status == "all" {
		return d.queryMaps(ctx, base+` ORDER BY created_at DESC`, merchantID)
	}
	return d.queryMaps(ctx, base+` AND status=$2 ORDER BY created_at DESC`, merchantID, status)
}

func (d *DB) T5GetChargeback(ctx context.Context, chargebackID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT id, merchant_id, transaction_id, amount_kobo, currency, reason, status,
		       evidence_submitted, evidence, evidence_url, due_date
		  FROM chargebacks WHERE id=$1 AND merchant_id=$2`, chargebackID, merchantID)
}

// T5SubmitChargebackEvidence records evidence on an open chargeback. 0 rows → 404.
func (d *DB) T5SubmitChargebackEvidence(ctx context.Context, chargebackID, merchantID, evidence, evidenceURL string) (int64, error) {
	return d.execRows(ctx, `
		UPDATE chargebacks
		   SET evidence=$1, evidence_url=$2, evidence_submitted=true,
		       status='evidence_submitted', updated_at=NOW()
		 WHERE id=$3 AND merchant_id=$4 AND status IN ('open','evidence_submitted')`,
		evidence, evidenceURL, chargebackID, merchantID)
}

// ─── Tier 3b: KYB ─────────────────────────────────────────────────────────────

func (d *DB) T5CreateKYBVerification(ctx context.Context, verificationID, merchantID, businessName, rcNumber, taxID, businessType, industryCode, initiatedBy string) error {
	if err := d.ensureEnabled(); err != nil {
		return err
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return err
	}
	defer tx.Rollback()
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO kyb_verifications
		  (verification_id, merchant_id, business_name, rc_number, tax_id, business_type,
		   industry_code, status, initiated_by, started_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,'pending',$8,NOW(),NOW(),NOW())
		ON CONFLICT (verification_id) DO NOTHING`,
		verificationID, merchantID, businessName, rcNumber, taxID, businessType, industryCode, initiatedBy); err != nil {
		return err
	}
	steps := []string{"document_verification", "registry_check", "director_screening", "risk_assessment"}
	for _, s := range steps {
		if _, err := tx.ExecContext(ctx, `
			INSERT INTO kyb_steps (id, verification_id, step_name, status, updated_at)
			VALUES (gen_random_uuid(), $1, $2, 'pending', NOW())`,
			verificationID, s); err != nil {
			return err
		}
	}
	return tx.Commit()
}

func (d *DB) T5GetKYBStatus(ctx context.Context, merchantID string) (verification map[string]interface{}, steps []map[string]interface{}, err error) {
	verification, err = d.queryRowMap(ctx, `
		SELECT verification_id, merchant_id, business_name, rc_number, tax_id, business_type,
		       industry_code, status, risk_level, initiated_by, started_at, created_at, updated_at
		  FROM kyb_verifications WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT 1`, merchantID)
	if err != nil {
		return nil, nil, err
	}
	steps, err = d.queryMaps(ctx, `
		SELECT id, verification_id, step_name, status, notes, updated_at
		  FROM kyb_steps WHERE verification_id=$1 ORDER BY updated_at`,
		verification["verification_id"])
	if err != nil {
		return nil, nil, err
	}
	return verification, steps, nil
}

func (d *DB) T5ListComplianceReports(ctx context.Context, merchantID, reportType string) ([]map[string]interface{}, error) {
	if reportType == "" {
		return d.queryMaps(ctx, `
			SELECT report_id, merchant_id, verification_id, report_type, status, risk_level,
			       findings, generated_at, created_at
			  FROM compliance_reports WHERE merchant_id=$1 ORDER BY created_at DESC`, merchantID)
	}
	return d.queryMaps(ctx, `
		SELECT report_id, merchant_id, verification_id, report_type, status, risk_level,
		       findings, generated_at, created_at
		  FROM compliance_reports WHERE merchant_id=$1 AND report_type=$2 ORDER BY created_at DESC`,
		merchantID, reportType)
}

// T5AggregateCBNReport summarises transaction activity for a period (CBN report body).
func (d *DB) T5AggregateCBNReport(ctx context.Context, merchantID, periodStart, periodEnd string) (map[string]interface{}, error) {
	row, err := d.queryRowMap(ctx, `
		SELECT COUNT(*)::bigint AS transaction_count,
		       COALESCE(SUM(amount_kobo),0)::bigint AS total_volume_kobo,
		       COALESCE(SUM(CASE WHEN status='completed' THEN 1 ELSE 0 END),0)::bigint AS completed_count,
		       COALESCE(SUM(CASE WHEN status IN ('disputed','chargeback','flagged') THEN 1 ELSE 0 END),0)::bigint AS flagged_count
		  FROM transactions
		 WHERE merchant_id=$1 AND created_at >= $2 AND created_at < $3::timestamptz + INTERVAL '1 day'`,
		merchantID, periodStart, periodEnd)
	if err == sql.ErrNoRows {
		return map[string]interface{}{
			"transaction_count": int64(0), "total_volume_kobo": int64(0),
			"completed_count": int64(0), "flagged_count": int64(0),
		}, nil
	}
	if err != nil {
		return nil, err
	}
	return row, nil
}

// T5CreateComplianceReport inserts a compliance_reports row.
func (d *DB) T5CreateComplianceReport(ctx context.Context, reportID, merchantID, reportType, status, findings string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO compliance_reports
		  (report_id, merchant_id, report_type, status, findings, generated_at, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW())
		ON CONFLICT (report_id) DO NOTHING`,
		reportID, merchantID, reportType, status, findings)
	return err
}

// ─── Tier 3c: Session Risk ────────────────────────────────────────────────────

// T5InsertSessionFingerprint persists a session_fingerprints row.
func (d *DB) T5InsertSessionFingerprint(ctx context.Context, id, userID, fingerprintID string, components interface{}, userAgent, ipAddress, timezone, screenResolution string, riskScore int, riskLevel string) error {
	_, err := d.execRows(ctx, `
		INSERT INTO session_fingerprints
		  (id, user_id, fingerprint_id, components, user_agent, ip_address, timezone,
		   screen_resolution, risk_score, risk_level, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
		ON CONFLICT (id) DO NOTHING`,
		id, userID, fingerprintID, toJSON(components), userAgent, ipAddress, timezone,
		screenResolution, riskScore, riskLevel)
	return err
}

// T5CountUserFingerprints counts prior distinct fingerprints for a user
// (used for new-device risk scoring).
func (d *DB) T5CountUserFingerprints(ctx context.Context, userID, fingerprintID string) (int64, int64, error) {
	m, err := d.queryRowMap(ctx, `
		SELECT COUNT(DISTINCT fingerprint_id)::bigint AS distinct_fingerprints,
		       COUNT(*)::bigint AS total_sessions
		  FROM session_fingerprints WHERE user_id=$1`, userID)
	if err == sql.ErrNoRows {
		return 0, 0, nil
	}
	if err != nil {
		return 0, 0, err
	}
	var distinct, total int64
	fmt.Sscan(fmt.Sprint(m["distinct_fingerprints"]), &distinct)
	fmt.Sscan(fmt.Sprint(m["total_sessions"]), &total)
	return distinct, total, nil
}

func (d *DB) T5GetSessionRisk(ctx context.Context, sessionID, userID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT id, user_id, fingerprint_id, user_agent, ip_address, risk_score, risk_level, created_at
		  FROM session_fingerprints
		 WHERE (id=$1 OR fingerprint_id=$1) AND user_id=$2
		 ORDER BY created_at DESC LIMIT 1`, sessionID, userID)
}

func (d *DB) T5ListSessionRiskHistory(ctx context.Context, userID string, limit int) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, user_id, fingerprint_id, user_agent, ip_address, risk_score, risk_level, created_at
		  FROM session_fingerprints WHERE user_id=$1 ORDER BY created_at DESC LIMIT $2`,
		userID, limit)
}

// ─── Tier 4a: Open Banking / SDK tokens ───────────────────────────────────────

// T5CreateConsent inserts an open_banking_consents_v2 row and returns the id.
func (d *DB) T5CreateConsent(ctx context.Context, id, merchantID, customerID, scopes, consentToken string, expiresAt time.Time) error {
	_, err := d.execRows(ctx, `
		INSERT INTO open_banking_consents_v2
		  (id, merchant_id, bank_code, bank_name, scopes, status, consent_token, expires_at, created_at, updated_at)
		VALUES ($1,$2,'paygate','PayGate Open Banking',$3,'active',$4,$5,NOW(),NOW())
		ON CONFLICT (id) DO NOTHING`,
		id, merchantID, scopes, consentToken, expiresAt)
	return err
}

func (d *DB) T5GetConsentByToken(ctx context.Context, consentToken string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT id, merchant_id, scopes, status, consent_token, expires_at, created_at
		  FROM open_banking_consents_v2 WHERE consent_token=$1`, consentToken)
}

// T5ConsentAccountBalance aggregates a customer's completed credit volume.
func (d *DB) T5ConsentAccountBalance(ctx context.Context, merchantID, customerID string) (map[string]interface{}, error) {
	row, err := d.queryRowMap(ctx, `
		SELECT COUNT(*)::bigint AS transaction_count,
		       COALESCE(SUM(amount_kobo),0)::bigint AS total_volume_kobo
		  FROM transactions
		 WHERE merchant_id=$1 AND status='completed'`, merchantID)
	if err == sql.ErrNoRows {
		return map[string]interface{}{"transaction_count": int64(0), "total_volume_kobo": int64(0)}, nil
	}
	return row, err
}

func (d *DB) T5ConsentTransactionHistory(ctx context.Context, merchantID string, limit int) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, amount_kobo, currency, status, created_at
		  FROM transactions WHERE merchant_id=$1
		 ORDER BY created_at DESC LIMIT $2`, merchantID, limit)
}

// T5InsertSDKToken stores only the SHA-256 hash of the issued token.
func (d *DB) T5InsertSDKToken(ctx context.Context, tokenID, merchantID, tokenHash string, expiresAt time.Time, scopes interface{}) error {
	_, err := d.execRows(ctx, `
		INSERT INTO sdk_tokens (token_id, merchant_id, token_hash, expires_at, scopes, is_revoked, created_at)
		VALUES ($1,$2,$3,$4,$5,0,NOW())
		ON CONFLICT (token_id) DO NOTHING`,
		tokenID, merchantID, tokenHash, expiresAt, toJSON(scopes))
	return err
}

// ─── Tier 4c: Webhook endpoints ───────────────────────────────────────────────

func (d *DB) T5CreateWebhookEndpoint(ctx context.Context, endpointID, merchantID, url, secret string, events interface{}) error {
	_, err := d.execRows(ctx, `
		INSERT INTO webhook_endpoints (endpoint_id, merchant_id, url, secret, events, is_active, created_at, updated_at)
		VALUES ($1,$2,$3,$4,$5,1,NOW(),NOW())
		ON CONFLICT (endpoint_id) DO NOTHING`,
		endpointID, merchantID, url, secret, toJSON(events))
	return err
}

func (d *DB) T5ListWebhookEndpoints(ctx context.Context, merchantID string) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT endpoint_id, merchant_id, url, events, is_active, created_at, updated_at
		  FROM webhook_endpoints WHERE merchant_id=$1 AND is_active=1 ORDER BY created_at DESC`, merchantID)
}

// T5DeleteWebhookEndpoint soft-deletes an endpoint. 0 rows → 404.
func (d *DB) T5DeleteWebhookEndpoint(ctx context.Context, endpointID, merchantID string) (int64, error) {
	return d.execRows(ctx, `
		UPDATE webhook_endpoints SET is_active=0, updated_at=NOW()
		 WHERE endpoint_id=$1 AND merchant_id=$2 AND is_active=1`,
		endpointID, merchantID)
}

func (d *DB) T5ListWebhookDeliveries(ctx context.Context, endpointID, merchantID string, limit int) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, endpoint_id, merchant_id, event_type, status_code, success, attempt, delivered_at, created_at
		  FROM webhook_delivery_log
		 WHERE endpoint_id=$1 AND merchant_id=$2 ORDER BY created_at DESC LIMIT $3`,
		endpointID, merchantID, limit)
}

// T5GetWebhookDelivery fetches a delivery row plus its endpoint URL for retry.
func (d *DB) T5GetWebhookDelivery(ctx context.Context, deliveryID, merchantID string) (map[string]interface{}, error) {
	return d.queryRowMap(ctx, `
		SELECT l.id, l.endpoint_id, l.merchant_id, l.event_type, l.payload, l.attempt,
		       e.url AS endpoint_url, e.secret AS signing_secret
		  FROM webhook_delivery_log l
		  JOIN webhook_endpoints e ON e.endpoint_id = l.endpoint_id
		 WHERE l.id=$1 AND l.merchant_id=$2`, deliveryID, merchantID)
}

func (d *DB) T5LogWebhookDelivery(ctx context.Context, id, endpointID, merchantID, eventType string, payload string, statusCode int, success bool, attempt int) error {
	succ := 0
	if success {
		succ = 1
	}
	_, err := d.execRows(ctx, `
		INSERT INTO webhook_delivery_log
		  (id, endpoint_id, merchant_id, event_type, payload, status_code, success, attempt, delivered_at, created_at)
		VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
		ON CONFLICT (id) DO NOTHING`,
		id, endpointID, merchantID, eventType, payload, statusCode, succ, attempt)
	return err
}

// ─── Tier 4b: Loyalty ─────────────────────────────────────────────────────────

// T5GetOrCreateLoyaltyAccount returns (accountID, balance, lifetime) for a
// user, creating the account on first touch. account_id is 'u_<userID>'.
func (d *DB) T5GetOrCreateLoyaltyAccount(ctx context.Context, userID string) (accountID string, balance, lifetime int64, err error) {
	if err := d.ensureEnabled(); err != nil {
		return "", 0, 0, err
	}
	accountID = "u_" + userID
	var customerID interface{}
	var cid int64
	if _, scanErr := fmt.Sscan(userID, &cid); scanErr == nil {
		customerID = cid
	}
	if _, err := d.db.ExecContext(ctx, `
		INSERT INTO loyalty_accounts (id, account_id, program_id, merchant_id, customer_id, points_balance, lifetime_points, created_at, updated_at)
		VALUES ($1,$2,'default','default',$3,0,0,NOW(),NOW())
		ON CONFLICT (account_id) DO NOTHING`,
		"la_"+userID, accountID, customerID); err != nil {
		return "", 0, 0, err
	}
	err = d.db.QueryRowContext(ctx, `
		SELECT points_balance, lifetime_points FROM loyalty_accounts WHERE account_id=$1`,
		accountID).Scan(&balance, &lifetime)
	return accountID, balance, lifetime, err
}

func (d *DB) T5ListLoyaltyTransactions(ctx context.Context, accountID string, limit int) ([]map[string]interface{}, error) {
	return d.queryMaps(ctx, `
		SELECT id, account_id, type, points, order_id, note, created_at
		  FROM loyalty_transactions WHERE account_id=$1 ORDER BY id DESC LIMIT $2`,
		accountID, limit)
}

// T5RedeemLoyaltyPoints atomically debits points and records the redemption in
// loyalty_transactions + loyalty_ledger. Returns sql.ErrNoRows when balance is
// insufficient (caller → 409/402, never fakes success).
func (d *DB) T5RedeemLoyaltyPoints(ctx context.Context, accountID string, points int64, redemptionType, redemptionID string) (newBalance int64, err error) {
	if err := d.ensureEnabled(); err != nil {
		return 0, err
	}
	tx, err := d.db.BeginTx(ctx, nil)
	if err != nil {
		return 0, err
	}
	defer tx.Rollback()

	var balance int64
	if err := tx.QueryRowContext(ctx,
		`SELECT points_balance FROM loyalty_accounts WHERE account_id=$1 FOR UPDATE`,
		accountID).Scan(&balance); err != nil {
		return 0, err
	}
	if balance < points {
		return 0, sql.ErrNoRows
	}
	newBalance = balance - points
	if _, err := tx.ExecContext(ctx,
		`UPDATE loyalty_accounts SET points_balance=$1, updated_at=NOW() WHERE account_id=$2`,
		newBalance, accountID); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO loyalty_transactions (account_id, type, points, order_id, note, created_at)
		VALUES ($1,'redeem',$2,$3,$4,NOW())`,
		accountID, -points, redemptionID, "redemption:"+redemptionType); err != nil {
		return 0, err
	}
	if _, err := tx.ExecContext(ctx, `
		INSERT INTO loyalty_ledger (id, account_id, entry_type, points, balance_after, description, reference_id, created_at)
		VALUES ($1,$2,'redeem',$3,$4,$5,$6,NOW())
		ON CONFLICT (id) DO NOTHING`,
		redemptionID, accountID, -points, newBalance, "redemption:"+redemptionType, redemptionID); err != nil {
		return 0, err
	}
	return newBalance, tx.Commit()
}

func (d *DB) T5MerchantLoyaltyStats(ctx context.Context, merchantID string) (map[string]interface{}, error) {
	row, err := d.queryRowMap(ctx, `
		SELECT COUNT(*)::bigint AS total_accounts,
		       COALESCE(SUM(points_balance),0)::bigint AS outstanding_points,
		       COALESCE(SUM(lifetime_points),0)::bigint AS lifetime_points
		  FROM loyalty_accounts WHERE merchant_id=$1`, merchantID)
	if err == sql.ErrNoRows {
		return map[string]interface{}{"total_accounts": int64(0), "outstanding_points": int64(0), "lifetime_points": int64(0)}, nil
	}
	return row, err
}
