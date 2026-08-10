// Package temporal — Recurring Billing Workflows
// RecurringBillingWorkflow: charges subscriptions on schedule, handles retries
// DunningWorkflow: manages failed payment recovery with escalating reminders
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Recurring Billing Workflow ───────────────────────────────────────────────

type RecurringBillingInput struct {
	SubscriptionID string
	MerchantID     string
	CustomerID     string
	PlanID         string
	AmountKobo     uint64
	Interval       string // "daily" | "weekly" | "monthly" | "quarterly" | "annually"
	StartDate      time.Time
	MaxCycles      int // 0 = unlimited
}

type RecurringBillingResult struct {
	SubscriptionID string
	CyclesCompleted int
	TotalChargedKobo uint64
	Status         string
}

// RecurringBillingWorkflow manages the full lifecycle of a recurring subscription.
// It runs indefinitely (or until MaxCycles) charging the customer on each interval.
func RecurringBillingWorkflow(ctx workflow.Context, input RecurringBillingInput) (*RecurringBillingResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("RecurringBillingWorkflow started", "subscription_id", input.SubscriptionID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	cyclesCompleted := 0
	totalChargedKobo := uint64(0)

	for {
		// Check if subscription is still active
		var active bool
		if err := workflow.ExecuteActivity(ctx, CheckSubscriptionActiveActivity, input.SubscriptionID).Get(ctx, &active); err != nil || !active {
			logger.Info("Subscription no longer active, stopping billing", "subscription_id", input.SubscriptionID)
			break
		}

		// Check max cycles
		if input.MaxCycles > 0 && cyclesCompleted >= input.MaxCycles {
			logger.Info("Max cycles reached", "subscription_id", input.SubscriptionID, "cycles", cyclesCompleted)
			break
		}

		// Attempt charge
		var chargeID string
		chargeErr := workflow.ExecuteActivity(ctx, ChargeSubscriptionActivity, input.SubscriptionID, input.CustomerID, input.AmountKobo).Get(ctx, &chargeID)

		if chargeErr != nil {
			logger.Warn("Subscription charge failed, starting dunning", "subscription_id", input.SubscriptionID, "err", chargeErr)

			// Start dunning workflow
			dunningCtx := workflow.WithChildOptions(ctx, workflow.ChildWorkflowOptions{
				WorkflowID: fmt.Sprintf("billing-dunning-%s-%d", input.SubscriptionID, cyclesCompleted+1),
			})
			var dunningResult BillingDunningResult
			workflow.ExecuteChildWorkflow(dunningCtx, BillingDunningWorkflow, BillingDunningInput{
				SubscriptionID: input.SubscriptionID,
				MerchantID:     input.MerchantID,
				CustomerID:     input.CustomerID,
				AmountKobo:     input.AmountKobo,
				CycleNumber:    cyclesCompleted + 1,
			}).Get(ctx, &dunningResult)

			if dunningResult.Recovered {
				totalChargedKobo += input.AmountKobo
				cyclesCompleted++
			} else {
				// Cancel subscription after failed dunning
				workflow.ExecuteActivity(ctx, CancelSubscriptionActivity, input.SubscriptionID, "payment_failed")
				break
			}
		} else {
			totalChargedKobo += input.AmountKobo
			cyclesCompleted++

			// Record successful charge
			workflow.ExecuteActivity(ctx, RecordSubscriptionChargeActivity, input.SubscriptionID, chargeID, input.AmountKobo, cyclesCompleted)
		}

		// Wait for next billing interval
		interval := billingIntervalDuration(input.Interval)
		workflow.Sleep(ctx, interval)
	}

	// Mark subscription as completed
	workflow.ExecuteActivity(ctx, FinalizeSubscriptionActivity, input.SubscriptionID, cyclesCompleted)

	logger.Info("RecurringBillingWorkflow completed",
		"subscription_id", input.SubscriptionID,
		"cycles", cyclesCompleted,
		"total_charged_kobo", totalChargedKobo,
	)

	return &RecurringBillingResult{
		SubscriptionID:   input.SubscriptionID,
		CyclesCompleted:  cyclesCompleted,
		TotalChargedKobo: totalChargedKobo,
		Status:           "completed",
	}, nil
}

// ─── Billing Dunning Workflow ─────────────────────────────────────────────────

type BillingDunningInput struct {
	SubscriptionID string
	MerchantID     string
	CustomerID     string
	AmountKobo     uint64
	CycleNumber    int
}

type BillingDunningResult struct {
	Recovered bool
	AttemptsMade int
}

// BillingDunningWorkflow attempts to recover a failed subscription payment.
// Makes up to 3 retry attempts over 7 days with escalating notifications.
func BillingDunningWorkflow(ctx workflow.Context, input BillingDunningInput) (*BillingDunningResult, error) {
	logger := workflow.GetLogger(ctx)
	ao := workflow.ActivityOptions{StartToCloseTimeout: 15 * time.Second}
	ctx = workflow.WithActivityOptions(ctx, ao)

	retrySchedule := []time.Duration{
		24 * time.Hour,  // Retry after 1 day
		72 * time.Hour,  // Retry after 3 days
		96 * time.Hour,  // Retry after 4 more days (7 days total)
	}

	for attempt, waitDuration := range retrySchedule {
		// Send dunning notification
		workflow.ExecuteActivity(ctx, SendBillingDunningEmailActivity, input.SubscriptionID, input.CustomerID, attempt+1)

		// Wait before retry
		workflow.Sleep(ctx, waitDuration)

		// Retry charge
		var chargeID string
		if err := workflow.ExecuteActivity(ctx, ChargeSubscriptionActivity, input.SubscriptionID, input.CustomerID, input.AmountKobo).Get(ctx, &chargeID); err == nil {
			logger.Info("Dunning recovery successful", "subscription_id", input.SubscriptionID, "attempt", attempt+1)
			workflow.ExecuteActivity(ctx, RecordSubscriptionChargeActivity, input.SubscriptionID, chargeID, input.AmountKobo, input.CycleNumber)
			return &BillingDunningResult{Recovered: true, AttemptsMade: attempt + 1}, nil
		}
	}

	// All retries exhausted
	logger.Warn("Dunning failed after all retries", "subscription_id", input.SubscriptionID)
	workflow.ExecuteActivity(ctx, SendBillingDunningFinalNoticeActivity, input.SubscriptionID, input.CustomerID)

	return &BillingDunningResult{Recovered: false, AttemptsMade: len(retrySchedule)}, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func billingIntervalDuration(interval string) time.Duration {
	switch interval {
	case "daily":
		return 24 * time.Hour
	case "weekly":
		return 7 * 24 * time.Hour
	case "monthly":
		return 30 * 24 * time.Hour
	case "quarterly":
		return 90 * 24 * time.Hour
	case "annually":
		return 365 * 24 * time.Hour
	default:
		return 30 * 24 * time.Hour
	}
}
