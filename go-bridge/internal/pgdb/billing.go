package pgdb

import (
	"context"
	"database/sql"
	"fmt"
)

// SubscriptionRow holds subscription data from the database.
type SubscriptionRow struct {
	ID         string
	MerchantID string
	CustomerID string
	Status     string // active | trial | past_due | cancelled
	PlanID     string
	AmountKobo uint64
}

// PaymentMethodRow holds a customer's payment method.
type PaymentMethodRow struct {
	ID         string
	CustomerID string
	Type       string // card | stripe | bank_transfer | wallet
	ExternalID string // Stripe payment method ID or bank account reference
	IsDefault  bool
}

// StripeChargeRecord holds data for a Stripe subscription charge.
type StripeChargeRecord struct {
	ChargeID        string
	SubscriptionID  string
	CustomerID      string
	AmountKobo      uint64
	PaymentMethodID string
}

// GetSubscription fetches a subscription by ID from the database.
func GetSubscription(ctx context.Context, subscriptionID string) (*SubscriptionRow, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT id, merchant_id, customer_id, status, plan_id, amount_kobo
		   FROM subscriptions WHERE id = ? LIMIT 1`,
		subscriptionID,
	)
	var s SubscriptionRow
	if err := row.Scan(&s.ID, &s.MerchantID, &s.CustomerID, &s.Status, &s.PlanID, &s.AmountKobo); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("subscription %s not found", subscriptionID)
		}
		return nil, fmt.Errorf("GetSubscription: %w", err)
	}
	return &s, nil
}

// GetCustomerDefaultPaymentMethod fetches the customer's default payment method.
func GetCustomerDefaultPaymentMethod(ctx context.Context, customerID string) (*PaymentMethodRow, error) {
	db := Get()
	if db == nil {
		return nil, fmt.Errorf("database not initialised")
	}
	row := db.db.QueryRowContext(ctx,
		`SELECT id, customer_id, type, external_id, is_default
		   FROM payment_methods WHERE customer_id = ? AND is_default = 1 LIMIT 1`,
		customerID,
	)
	var pm PaymentMethodRow
	if err := row.Scan(&pm.ID, &pm.CustomerID, &pm.Type, &pm.ExternalID, &pm.IsDefault); err != nil {
		if err == sql.ErrNoRows {
			return nil, fmt.Errorf("no default payment method for customer %s", customerID)
		}
		return nil, fmt.Errorf("GetCustomerDefaultPaymentMethod: %w", err)
	}
	return &pm, nil
}

// CreateStripeSubscriptionCharge records a Stripe subscription charge in the database.
func CreateStripeSubscriptionCharge(ctx context.Context, rec StripeChargeRecord) error {
	db := Get()
	if db == nil {
		return fmt.Errorf("database not initialised")
	}
	_, err := db.db.ExecContext(ctx,
		`INSERT INTO stripe_subscription_charges
		   (charge_id, subscription_id, customer_id, amount_kobo, payment_method_id, created_at)
		   VALUES (?, ?, ?, ?, ?, NOW())`,
		rec.ChargeID, rec.SubscriptionID, rec.CustomerID, rec.AmountKobo, rec.PaymentMethodID,
	)
	if err != nil {
		return fmt.Errorf("CreateStripeSubscriptionCharge: %w", err)
	}
	return nil
}
