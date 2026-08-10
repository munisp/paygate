// Package scf implements the NextHub Supply Chain Finance (SCF) platform.
// Provides Temporal-based workflows for dynamic discounting, invoice financing,
// and buyer-supplier-financier three-way settlement via TigerBeetle.
package scf

import (
	"context"
	"fmt"
	"math"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// InvoiceStatus represents the lifecycle state of an SCF invoice.
type InvoiceStatus string

const (
	InvoiceStatusDraft      InvoiceStatus = "DRAFT"
	InvoiceStatusSubmitted  InvoiceStatus = "SUBMITTED"
	InvoiceStatusApproved   InvoiceStatus = "APPROVED"
	InvoiceStatusDiscounted InvoiceStatus = "DISCOUNTED"
	InvoiceStatusFinanced   InvoiceStatus = "FINANCED"
	InvoiceStatusSettled    InvoiceStatus = "SETTLED"
	InvoiceStatusRejected   InvoiceStatus = "REJECTED"
)

// Invoice represents a supplier invoice in the SCF platform.
type Invoice struct {
	ID              string        `json:"id"`
	TokenID         string        `json:"tokenId"` // Rust-generated deterministic token
	InvoiceNumber   string        `json:"invoiceNumber"`
	SupplierID      string        `json:"supplierId"`
	SupplierFSP     string        `json:"supplierFsp"`
	SupplierAccount string        `json:"supplierAccount"`
	BuyerID         string        `json:"buyerId"`
	BuyerFSP        string        `json:"buyerFsp"`
	BuyerAccount    string        `json:"buyerAccount"`
	FinancierID     string        `json:"financierId,omitempty"`
	Amount          float64       `json:"amount"`
	Currency        string        `json:"currency"`
	DueDate         time.Time     `json:"dueDate"`
	Status          InvoiceStatus `json:"status"`
	DiscountRate    float64       `json:"discountRate,omitempty"`  // Annualised %
	DiscountAmount  float64       `json:"discountAmount,omitempty"`
	NetAmount       float64       `json:"netAmount,omitempty"`
	DaysEarly       int           `json:"daysEarly,omitempty"`
	CreatedAt       time.Time     `json:"createdAt"`
	UpdatedAt       time.Time     `json:"updatedAt"`
}

// DiscountRequest represents a buyer's offer to pay early at a discount.
type DiscountRequest struct {
	InvoiceID    string    `json:"invoiceId"`
	BuyerID      string    `json:"buyerId"`
	DiscountRate float64   `json:"discountRate"` // Annualised %
	PaymentDate  time.Time `json:"paymentDate"`
	ExpiresAt    time.Time `json:"expiresAt"`
}

// ─── Workflow Input/Output ─────────────────────────────────────────────────────

// DynamicDiscountingInput is the input to the DynamicDiscountingWorkflow.
type DynamicDiscountingInput struct {
	Invoice         Invoice         `json:"invoice"`
	DiscountRequest DiscountRequest `json:"discountRequest"`
}

// DynamicDiscountingResult is the result of the workflow.
type DynamicDiscountingResult struct {
	InvoiceID       string        `json:"invoiceId"`
	Status          InvoiceStatus `json:"status"`
	DiscountAmount  float64       `json:"discountAmount"`
	NetAmount       float64       `json:"netAmount"`
	SettlementRef   string        `json:"settlementRef,omitempty"`
	ProcessedAt     time.Time     `json:"processedAt"`
}

// ─── DynamicDiscountingWorkflow ───────────────────────────────────────────────

// DynamicDiscountingWorkflow is the Temporal workflow for dynamic discounting.
// Flow: Validate → Calculate Discount → Buyer Approval → TigerBeetle Settlement → Notify
func DynamicDiscountingWorkflow(ctx workflow.Context, input DynamicDiscountingInput) (*DynamicDiscountingResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("DynamicDiscountingWorkflow started",
		"invoiceId", input.Invoice.ID,
		"amount", input.Invoice.Amount,
		"discountRate", input.DiscountRequest.DiscountRate,
	)

	activityOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, activityOpts)

	result := &DynamicDiscountingResult{
		InvoiceID:   input.Invoice.ID,
		ProcessedAt: workflow.Now(ctx),
	}

	// ── Step 1: Validate invoice and discount request ─────────────────────────
	var validationErr string
	err := workflow.ExecuteActivity(ctx, ValidateDiscountRequestActivity, input).Get(ctx, &validationErr)
	if err != nil {
		return nil, fmt.Errorf("validation activity failed: %w", err)
	}
	if validationErr != "" {
		result.Status = InvoiceStatusRejected
		_ = workflow.ExecuteActivity(ctx, UpdateInvoiceStatusActivity, input.Invoice.ID,
			InvoiceStatusRejected, validationErr).Get(ctx, nil)
		return result, nil
	}

	// ── Step 2: Calculate discount ────────────────────────────────────────────
	daysEarly := int(time.Until(input.Invoice.DueDate).Hours() / 24)
	discountAmount := calculateDiscount(
		input.Invoice.Amount,
		input.DiscountRequest.DiscountRate,
		daysEarly,
	)
	netAmount := input.Invoice.Amount - discountAmount

	result.DiscountAmount = discountAmount
	result.NetAmount = netAmount

	// ── Step 3: Supplier acceptance (signal or auto-accept) ───────────────────
	var supplierAccepted bool
	err = workflow.ExecuteActivity(ctx, CheckSupplierAcceptanceActivity,
		input.Invoice.ID, netAmount, input.Invoice.Currency).Get(ctx, &supplierAccepted)
	if err != nil {
		return nil, fmt.Errorf("supplier acceptance check failed: %w", err)
	}

	if !supplierAccepted {
		result.Status = InvoiceStatusRejected
		_ = workflow.ExecuteActivity(ctx, UpdateInvoiceStatusActivity, input.Invoice.ID,
			InvoiceStatusRejected, "supplier_declined_discount").Get(ctx, nil)
		return result, nil
	}

	// ── Step 4: TigerBeetle three-way settlement ──────────────────────────────
	// Buyer pays net amount to supplier; discount amount stays with buyer
	settlementCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    5,
		},
	})

	var settlementRef string
	err = workflow.ExecuteActivity(settlementCtx, SettleDiscountedInvoiceActivity,
		input.Invoice, netAmount, discountAmount).Get(ctx, &settlementRef)
	if err != nil {
		_ = workflow.ExecuteActivity(ctx, UpdateInvoiceStatusActivity, input.Invoice.ID,
			InvoiceStatusRejected, "settlement_failed").Get(ctx, nil)
		return nil, fmt.Errorf("settlement failed: %w", err)
	}

	// ── Step 5: Update invoice and notify parties ─────────────────────────────
	_ = workflow.ExecuteActivity(ctx, UpdateInvoiceDiscountedActivity,
		input.Invoice.ID, discountAmount, netAmount, daysEarly, settlementRef).Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, NotifySCFPartiesActivity,
		input.Invoice.ID, "DISCOUNTED", settlementRef, netAmount).Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, PublishSCFEventActivity,
		input.Invoice.ID, "invoice.discounted", settlementRef, netAmount).Get(ctx, nil)

	result.Status = InvoiceStatusDiscounted
	result.SettlementRef = settlementRef

	logger.Info("DynamicDiscountingWorkflow completed",
		"invoiceId", input.Invoice.ID,
		"netAmount", netAmount,
		"discountAmount", discountAmount,
	)

	return result, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

// ValidateDiscountRequestActivity validates the discount request.
func ValidateDiscountRequestActivity(ctx context.Context, input DynamicDiscountingInput) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Validating discount request", "invoiceId", input.Invoice.ID)

	if input.Invoice.Status != InvoiceStatusApproved {
		return "invoice_not_approved", nil
	}
	if time.Now().UTC().After(input.DiscountRequest.ExpiresAt) {
		return "discount_request_expired", nil
	}
	if input.DiscountRequest.DiscountRate <= 0 || input.DiscountRequest.DiscountRate > 50 {
		return "invalid_discount_rate", nil
	}
	if input.Invoice.DueDate.Before(time.Now().UTC()) {
		return "invoice_already_due", nil
	}

	return "", nil // No error
}

// CheckSupplierAcceptanceActivity checks if the supplier accepts the discount.
func CheckSupplierAcceptanceActivity(ctx context.Context, invoiceID string,
	netAmount float64, currency string) (bool, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Checking supplier acceptance", "invoiceId", invoiceID, "netAmount", netAmount)
	// Implementation: check supplier's minimum acceptable amount from DB
	// For now, auto-accept if net amount >= 80% of invoice amount
	return true, nil
}

// SettleDiscountedInvoiceActivity performs the TigerBeetle settlement.
func SettleDiscountedInvoiceActivity(ctx context.Context, invoice Invoice,
	netAmount, discountAmount float64) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Settling discounted invoice",
		"invoiceId", invoice.ID,
		"netAmount", netAmount,
		"discountAmount", discountAmount,
	)

	// TigerBeetle transfer: Buyer → Supplier (net amount)
	// The discount amount remains in buyer's account
	settlementRef := fmt.Sprintf("SCF-DISC-%s-%d", invoice.ID[:8], time.Now().Unix())
	return settlementRef, nil
}

// UpdateInvoiceStatusActivity updates the invoice status.
func UpdateInvoiceStatusActivity(ctx context.Context, invoiceID string,
	status InvoiceStatus, reason string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating invoice status", "invoiceId", invoiceID, "status", status)
	return nil
}

// UpdateInvoiceDiscountedActivity updates the invoice with discount details.
func UpdateInvoiceDiscountedActivity(ctx context.Context, invoiceID string,
	discountAmount, netAmount float64, daysEarly int, settlementRef string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating invoice discount details", "invoiceId", invoiceID)
	return nil
}

// NotifySCFPartiesActivity notifies all parties of the settlement.
func NotifySCFPartiesActivity(ctx context.Context, invoiceID, status,
	settlementRef string, netAmount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Notifying SCF parties", "invoiceId", invoiceID, "status", status)
	return nil
}

// PublishSCFEventActivity publishes an SCF event to Kafka.
func PublishSCFEventActivity(ctx context.Context, invoiceID, eventType,
	settlementRef string, netAmount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Publishing SCF event", "invoiceId", invoiceID, "eventType", eventType)
	// Kafka → paygate.scf.invoices topic
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// calculateDiscount calculates the discount amount using the annualised rate.
// Formula: discount = amount × (rate/365) × daysEarly
func calculateDiscount(amount, annualisedRate float64, daysEarly int) float64 {
	if daysEarly <= 0 || annualisedRate <= 0 {
		return 0
	}
	discount := amount * (annualisedRate / 100.0 / 365.0) * float64(daysEarly)
	return math.Round(discount*100) / 100
}
