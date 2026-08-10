package pgdb

import (
	"context"
	"database/sql"
	"encoding/json"
	"fmt"
)

// SplitRecipient holds a split rule recipient.
type SplitRecipient struct {
	MerchantID string  `json:"merchant_id"`
	Label      string  `json:"label"`
	SharePct   float64 `json:"share_pct"`
	FixedKobo  uint64  `json:"fixed_kobo"`
}

// SplitRuleRecord holds a split rule.
type SplitRuleRecord struct {
	RuleID      string
	RuleName    string
	Description string
	Recipients  []SplitRecipient
	CreatedBy   string
	IsActive    bool
}

// SplitLeg holds a single leg of a split payment.
type SplitLeg struct {
	MerchantID string `json:"merchant_id"`
	Label      string `json:"label"`
	AmountKobo uint64 `json:"amount_kobo"`
	TransferID string `json:"transfer_id"`
	Status     string `json:"status"`
}

// SplitPaymentRecord holds a completed split payment.
type SplitPaymentRecord struct {
	SplitPaymentID  string
	SplitRuleID     string
	TotalAmountKobo uint64
	Reference       string
	Legs            []SplitLeg
	Status          string
}

// PendingSplitSettlement holds a pending split payment for settlement.
type PendingSplitSettlement struct {
	SplitPaymentID string
	Reference      string
}

// CreateSplitRule inserts a new split rule.
func CreateSplitRule(ctx context.Context, rec SplitRuleRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	recipientsJSON, err := json.Marshal(rec.Recipients)
	if err != nil {
		return fmt.Errorf("CreateSplitRule: marshal recipients: %w", err)
	}
	_, err = db.db.ExecContext(ctx,
		`INSERT INTO split_rules
		   (rule_id, rule_name, description, recipients, created_by, is_active, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
		rec.RuleID, rec.RuleName, rec.Description, string(recipientsJSON),
		rec.CreatedBy, rec.IsActive,
	)
	if err != nil {
		return fmt.Errorf("CreateSplitRule: %w", err)
	}
	return nil
}

// GetSplitRule fetches a split rule by ID.
func GetSplitRule(ctx context.Context, ruleID string) (*SplitRuleRecord, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT rule_id, rule_name, description, recipients, created_by, is_active
		   FROM split_rules WHERE rule_id = ? LIMIT 1`,
		ruleID,
	)
	var rec SplitRuleRecord
	var recipientsJSON string
	var isActive int
	if err := row.Scan(&rec.RuleID, &rec.RuleName, &rec.Description, &recipientsJSON, &rec.CreatedBy, &isActive); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("split rule %s not found", ruleID)
		}
		return nil, fmt.Errorf("GetSplitRule: %w", err)
	}
	rec.IsActive = isActive == 1
	if err := json.Unmarshal([]byte(recipientsJSON), &rec.Recipients); err != nil {
		return nil, fmt.Errorf("GetSplitRule: unmarshal recipients: %w", err)
	}
	return &rec, nil
}

// RecordSplitPayment inserts a split payment record.
func RecordSplitPayment(ctx context.Context, rec SplitPaymentRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	legsJSON, err := json.Marshal(rec.Legs)
	if err != nil {
		return fmt.Errorf("RecordSplitPayment: marshal legs: %w", err)
	}
	_, err = db.db.ExecContext(ctx,
		`INSERT INTO split_payments
		   (split_payment_id, split_rule_id, total_amount_kobo, reference, legs, status, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, NOW())`,
		rec.SplitPaymentID, rec.SplitRuleID, rec.TotalAmountKobo,
		rec.Reference, string(legsJSON), rec.Status,
	)
	if err != nil {
		return fmt.Errorf("RecordSplitPayment: %w", err)
	}
	return nil
}

// GetSplitPaymentsByMerchant fetches split payments for a merchant.
func GetSplitPaymentsByMerchant(ctx context.Context, merchantID string, limit int) ([]SplitPaymentRecord, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	rows, err := db.db.QueryContext(ctx,
		`SELECT split_payment_id, split_rule_id, total_amount_kobo, reference, legs, status
		   FROM split_payments
		   WHERE JSON_CONTAINS(legs, JSON_OBJECT('merchant_id', ?))
		   ORDER BY created_at DESC LIMIT ?`,
		merchantID, limit,
	)
	if err != nil {
		return nil, fmt.Errorf("GetSplitPaymentsByMerchant: %w", err)
	}
	defer rows.Close()
	var results []SplitPaymentRecord
	for rows.Next() {
		var rec SplitPaymentRecord
		var legsJSON string
		if err := rows.Scan(&rec.SplitPaymentID, &rec.SplitRuleID, &rec.TotalAmountKobo, &rec.Reference, &legsJSON, &rec.Status); err != nil {
			continue
		}
		_ = json.Unmarshal([]byte(legsJSON), &rec.Legs)
		results = append(results, rec)
	}
	return results, nil
}

// GetPendingSplitSettlements fetches pending split payments for settlement.
func GetPendingSplitSettlements(ctx context.Context) ([]PendingSplitSettlement, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	rows, err := db.db.QueryContext(ctx,
		`SELECT split_payment_id, reference FROM split_payments
		   WHERE status = 'pending_settlement' ORDER BY created_at ASC LIMIT 100`,
	)
	if err != nil {
		return nil, fmt.Errorf("GetPendingSplitSettlements: %w", err)
	}
	defer rows.Close()
	var results []PendingSplitSettlement
	for rows.Next() {
		var s PendingSplitSettlement
		if err := rows.Scan(&s.SplitPaymentID, &s.Reference); err != nil {
			continue
		}
		results = append(results, s)
	}
	return results, nil
}

// MarkSplitSettled marks a split payment as settled.
func MarkSplitSettled(ctx context.Context, splitPaymentID string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE split_payments SET status = 'settled', updated_at = NOW() WHERE split_payment_id = ?`,
		splitPaymentID,
	)
	if err != nil {
		return fmt.Errorf("MarkSplitSettled: %w", err)
	}
	return nil
}
