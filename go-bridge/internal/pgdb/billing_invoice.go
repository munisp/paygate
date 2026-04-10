package pgdb

import (
	"context"
	"fmt"
	"time"
)

// BillingInvoiceRecord holds data for a billing invoice.
type BillingInvoiceRecord struct {
	InvoiceID      string
	SubscriptionID string
	ChargeID       string
	AmountKobo     uint64
	CycleNumber    int
	Status         string
	PaidAt         time.Time
}

// CreateBillingInvoice inserts a billing invoice record.
func CreateBillingInvoice(ctx context.Context, rec BillingInvoiceRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO billing_invoices
		   (invoice_id, subscription_id, charge_id, amount_kobo, cycle_number, status, paid_at, created_at)
		   VALUES (?, ?, ?, ?, ?, ?, ?, NOW())`,
		rec.InvoiceID, rec.SubscriptionID, rec.ChargeID, rec.AmountKobo,
		rec.CycleNumber, rec.Status, rec.PaidAt,
	)
	if err != nil {
		return fmt.Errorf("CreateBillingInvoice: %w", err)
	}
	return nil
}

// UpdateSubscriptionStatus updates the status of a subscription.
func UpdateSubscriptionStatus(ctx context.Context, subscriptionID, status string) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`UPDATE subscriptions SET status = ?, updated_at = NOW() WHERE id = ?`,
		status, subscriptionID,
	)
	if err != nil {
		return fmt.Errorf("UpdateSubscriptionStatus: %w", err)
	}
	return nil
}
