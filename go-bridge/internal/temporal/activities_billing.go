// Package temporal — Billing Activities
// Activities for RecurringBillingWorkflow and BillingDunningWorkflow.
package temporal

import (
	"context"
	"fmt"
	"log/slog"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// CheckSubscriptionActiveActivity returns true if the subscription is in active or trial status.
func CheckSubscriptionActiveActivity(ctx context.Context, subscriptionID string) (bool, error) {
	sub, err := pgdb.GetSubscription(ctx, subscriptionID)
	if err != nil {
		return false, err
	}
	return sub.Status == "active" || sub.Status == "trial", nil
}

// ChargeSubscriptionActivity attempts to charge the customer for a subscription cycle.
// Returns the charge ID on success.
func ChargeSubscriptionActivity(ctx context.Context, subscriptionID, customerID string, amountKobo uint64) (string, error) {
	sub, err := pgdb.GetSubscription(ctx, subscriptionID)
	if err != nil {
		return "", fmt.Errorf("subscription not found: %w", err)
	}

	// Get customer's default payment method
	paymentMethod, err := pgdb.GetCustomerDefaultPaymentMethod(ctx, customerID)
	if err != nil {
		return "", fmt.Errorf("no payment method: %w", err)
	}

	chargeID := uuid.New().String()

	switch paymentMethod.Type {
	case "card", "stripe":
		// Stripe charge via existing Stripe integration
		if err := pgdb.CreateStripeSubscriptionCharge(ctx, pgdb.StripeChargeRecord{
			ChargeID:       chargeID,
			SubscriptionID: subscriptionID,
			CustomerID:     customerID,
			AmountKobo:     amountKobo,
			PaymentMethodID: paymentMethod.ExternalID,
		}); err != nil {
			return "", fmt.Errorf("stripe charge failed: %w", err)
		}

	case "bank_transfer", "wallet":
		// TigerBeetle deduction from customer wallet
		customerAccountID := tb.CustomerAccountID(customerID)
		merchantAccountID := tb.MerchantAccountID(sub.MerchantID)
		transferID, _ := tb.NewUUID()
		tbTransferID, _ := tb.UUIDToUint128(transferID)

		if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
			ID:              tbTransferID,
			DebitAccountID:  customerAccountID,
			CreditAccountID: merchantAccountID,
			Amount:          amountKobo,
			Code:            uint16(50), // CodeSubscriptionCharge
			Ledger:          1,
			UserData128:     tbTransferID,
		}); err != nil {
			return "", fmt.Errorf("wallet charge failed: %w", err)
		}

	default:
		return "", fmt.Errorf("unsupported payment method type: %s", paymentMethod.Type)
	}

	// Publish Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   subscriptionID,
		Value: map[string]interface{}{
			"event_type":      "billing.charge.succeeded",
			"charge_id":       chargeID,
			"subscription_id": subscriptionID,
			"customer_id":     customerID,
			"amount_kobo":     amountKobo,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("subscription charge succeeded",
		"subscription_id", subscriptionID,
		"charge_id", chargeID,
		"amount_kobo", amountKobo,
	)
	return chargeID, nil
}

// RecordSubscriptionChargeActivity persists a successful charge to the billing_invoices table.
func RecordSubscriptionChargeActivity(ctx context.Context, subscriptionID, chargeID string, amountKobo uint64, cycleNumber int) error {
	return pgdb.CreateBillingInvoice(ctx, pgdb.BillingInvoiceRecord{
		InvoiceID:      uuid.New().String(),
		SubscriptionID: subscriptionID,
		ChargeID:       chargeID,
		AmountKobo:     amountKobo,
		CycleNumber:    cycleNumber,
		Status:         "paid",
		PaidAt:         time.Now().UTC(),
	})
}

// CancelSubscriptionActivity cancels a subscription with a given reason.
func CancelSubscriptionActivity(ctx context.Context, subscriptionID, reason string) error {
	if err := pgdb.UpdateSubscriptionStatus(ctx, subscriptionID, "cancelled"); err != nil {
		return err
	}
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   subscriptionID,
		Value: map[string]interface{}{
			"event_type":      "billing.subscription.cancelled",
			"subscription_id": subscriptionID,
			"reason":          reason,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}

// FinalizeSubscriptionActivity marks a subscription as completed after all cycles.
func FinalizeSubscriptionActivity(ctx context.Context, subscriptionID string, cyclesCompleted int) error {
	return pgdb.UpdateSubscriptionStatus(ctx, subscriptionID, "completed")
}

// SendBillingDunningEmailActivity sends a dunning notification via Kafka.
func SendBillingDunningEmailActivity(ctx context.Context, subscriptionID, customerID string, attemptNumber int) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   subscriptionID,
		Value: map[string]interface{}{
			"event_type":      "billing.dunning.notification",
			"subscription_id": subscriptionID,
			"customer_id":     customerID,
			"attempt_number":  attemptNumber,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})
	slog.Info("dunning notification sent",
		"subscription_id", subscriptionID,
		"attempt", attemptNumber,
	)
	return nil
}

// SendBillingDunningFinalNoticeActivity sends the final dunning notice before cancellation.
func SendBillingDunningFinalNoticeActivity(ctx context.Context, subscriptionID, customerID string) error {
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   subscriptionID,
		Value: map[string]interface{}{
			"event_type":      "billing.dunning.final_notice",
			"subscription_id": subscriptionID,
			"customer_id":     customerID,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})
	return nil
}
