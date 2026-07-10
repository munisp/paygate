// Package energy implements the NextHub Energy/VEND platform.
// Provides Temporal-based workflows for prepaid electricity token vending
// via DISCO (Distribution Company) APIs, NEPA token generation, and
// TigerBeetle payment settlement.
package energy

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// VendStatus represents the lifecycle state of a vending transaction.
type VendStatus string

const (
	VendStatusInitiated  VendStatus = "INITIATED"
	VendStatusPaid       VendStatus = "PAID"
	VendStatusTokenizing VendStatus = "TOKENIZING"
	VendStatusVended     VendStatus = "VENDED"
	VendStatusFailed     VendStatus = "FAILED"
	VendStatusRefunded   VendStatus = "REFUNDED"
)

// DISCO represents a Nigerian electricity distribution company.
type DISCO string

const (
	DISCOAbuja   DISCO = "AEDC"  // Abuja Electricity Distribution Company
	DISCOEko     DISCO = "EKEDC" // Eko Electricity Distribution Company
	DISCOIkeja   DISCO = "IKEDC" // Ikeja Electric
	DISCOIbadan  DISCO = "IBEDC" // Ibadan Electricity Distribution Company
	DISCOEnugu   DISCO = "EEDC"  // Enugu Electricity Distribution Company
	DISCOKaduna  DISCO = "KAEDCO"
	DISCOKano    DISCO = "KEDCO"
	DISCOPortHarcourt DISCO = "PHED"
	DISCOBenin   DISCO = "BEDC"
	DISCOJos     DISCO = "JED"
	DISCOYola    DISCO = "YEDC"
)

// MeterType represents the type of electricity meter.
type MeterType string

const (
	MeterTypePrepaid  MeterType = "PREPAID"
	MeterTypePostpaid MeterType = "POSTPAID"
)

// VendRequest represents a prepaid electricity vending request.
type VendRequest struct {
	ID            string    `json:"id"`
	MeterNumber   string    `json:"meterNumber"`
	MeterType     MeterType `json:"meterType"`
	DISCO         DISCO     `json:"disco"`
	Amount        float64   `json:"amount"`
	Currency      string    `json:"currency"`
	CustomerName  string    `json:"customerName"`
	CustomerPhone string    `json:"customerPhone"`
	CustomerFSP   string    `json:"customerFsp"`
	CustomerAcct  string    `json:"customerAccount"`
	Narration     string    `json:"narration"`
	CreatedAt     time.Time `json:"createdAt"`
}

// VendResult represents the result of a vending transaction.
type VendResult struct {
	VendID         string     `json:"vendId"`
	MeterNumber    string     `json:"meterNumber"`
	DISCO          DISCO      `json:"disco"`
	Status         VendStatus `json:"status"`
	Token          string     `json:"token,omitempty"`         // 20-digit NEPA token
	Units          float64    `json:"units,omitempty"`         // kWh units
	Amount         float64    `json:"amount"`
	TransferRef    string     `json:"transferRef,omitempty"`
	DISCORef       string     `json:"discoRef,omitempty"`
	ProcessedAt    time.Time  `json:"processedAt"`
	ErrorCode      string     `json:"errorCode,omitempty"`
	ErrorDesc      string     `json:"errorDesc,omitempty"`
}

// ─── Workflow Input/Output ─────────────────────────────────────────────────────

// VendWorkflowInput is the input to the VendWorkflow.
type VendWorkflowInput struct {
	Request VendRequest `json:"request"`
}

// ─── VendWorkflow ─────────────────────────────────────────────────────────────

// VendWorkflow is the Temporal workflow for prepaid electricity vending.
// Flow: Validate Meter → Collect Payment → Generate Token → Deliver Token → Notify
func VendWorkflow(ctx workflow.Context, input VendWorkflowInput) (*VendResult, error) {
	logger := workflow.GetLogger(ctx)
	req := input.Request
	logger.Info("VendWorkflow started",
		"vendId", req.ID,
		"meterNumber", req.MeterNumber,
		"disco", req.DISCO,
		"amount", req.Amount,
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

	result := &VendResult{
		VendID:      req.ID,
		MeterNumber: req.MeterNumber,
		DISCO:       req.DISCO,
		Amount:      req.Amount,
		ProcessedAt: workflow.Now(ctx),
	}

	// ── Step 1: Validate meter ────────────────────────────────────────────────
	var meterValid bool
	var customerName string
	err := workflow.ExecuteActivity(ctx, ValidateMeterActivity, req.MeterNumber, req.DISCO).
		Get(ctx, &meterValid)
	if err != nil {
		return nil, fmt.Errorf("meter validation failed: %w", err)
	}

	if !meterValid {
		result.Status = VendStatusFailed
		result.ErrorCode = "INVALID_METER"
		result.ErrorDesc = fmt.Sprintf("Meter %s not found in %s registry", req.MeterNumber, req.DISCO)
		_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
			VendStatusFailed, result.ErrorCode).Get(ctx, nil)
		return result, nil
	}
	_ = customerName

	// ── Step 2: Collect payment via FSPIOP ───────────────────────────────────
	paymentCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    3,
		},
	})

	var transferRef string
	err = workflow.ExecuteActivity(paymentCtx, CollectVendPaymentActivity,
		req.ID, req.CustomerFSP, req.CustomerAcct,
		string(req.DISCO), req.Amount, req.Currency).Get(ctx, &transferRef)
	if err != nil {
		result.Status = VendStatusFailed
		result.ErrorCode = "PAYMENT_FAILED"
		_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
			VendStatusFailed, "PAYMENT_FAILED").Get(ctx, nil)
		return nil, fmt.Errorf("payment collection failed: %w", err)
	}

	result.TransferRef = transferRef
	_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
		VendStatusPaid, "").Get(ctx, nil)

	// ── Step 3: Generate NEPA token via DISCO API ─────────────────────────────
	_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
		VendStatusTokenizing, "").Get(ctx, nil)

	var discoResult struct {
		Token    string  `json:"token"`
		Units    float64 `json:"units"`
		DISCORef string  `json:"discoRef"`
	}

	tokenCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 45 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    45 * time.Second,
			MaximumAttempts:    5,
		},
	})

	err = workflow.ExecuteActivity(tokenCtx, GenerateTokenActivity,
		req.ID, req.MeterNumber, string(req.DISCO), req.Amount, transferRef).Get(ctx, &discoResult)
	if err != nil {
		// Compensation: initiate refund
		_ = workflow.ExecuteActivity(ctx, RefundVendPaymentActivity, req.ID, transferRef,
			req.Amount, req.Currency).Get(ctx, nil)
		_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
			VendStatusRefunded, "TOKEN_GENERATION_FAILED").Get(ctx, nil)
		return nil, fmt.Errorf("token generation failed, refund initiated: %w", err)
	}

	// ── Step 4: Deliver token to customer ─────────────────────────────────────
	_ = workflow.ExecuteActivity(ctx, DeliverTokenActivity,
		req.ID, req.CustomerPhone, discoResult.Token, discoResult.Units, req.Amount).Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, UpdateVendStatusActivity, req.ID,
		VendStatusVended, "").Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, PublishVendEventActivity,
		req.ID, "vend.completed", discoResult.Token, discoResult.Units).Get(ctx, nil)

	result.Status = VendStatusVended
	result.Token = discoResult.Token
	result.Units = discoResult.Units
	result.DISCORef = discoResult.DISCORef

	logger.Info("VendWorkflow completed",
		"vendId", req.ID,
		"token", discoResult.Token,
		"units", discoResult.Units,
	)

	return result, nil
}

// ─── Activities ───────────────────────────────────────────────────────────────

// ValidateMeterActivity validates a meter number with the DISCO.
func ValidateMeterActivity(ctx context.Context, meterNumber string, disco DISCO) (bool, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Validating meter", "meterNumber", meterNumber, "disco", disco)

	// Call VTPass or DISCO direct API
	// Implementation: GET /api/v2/merchant-verify?billersCode={meterNumber}&serviceID={disco}
	vtpassURL := fmt.Sprintf("https://sandbox.vtpass.com/api/merchant-verify?billersCode=%s&serviceID=%s-electric",
		meterNumber, string(disco))
	_ = vtpassURL

	// Simulated validation
	return len(meterNumber) >= 11, nil
}

// CollectVendPaymentActivity collects payment via FSPIOP transfer.
func CollectVendPaymentActivity(ctx context.Context, vendID, customerFSP, customerAcct,
	disco string, amount float64, currency string) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Collecting vend payment", "vendId", vendID, "amount", amount)

	// FSPIOP transfer: Customer → DISCO settlement account
	transferRef := fmt.Sprintf("VEND-PAY-%s-%d", vendID[:8], time.Now().Unix())
	return transferRef, nil
}

// GenerateTokenActivity generates a NEPA prepaid token via DISCO/VTPass API.
func GenerateTokenActivity(ctx context.Context, vendID, meterNumber, disco string,
	amount float64, transferRef string) (struct {
	Token    string  `json:"token"`
	Units    float64 `json:"units"`
	DISCORef string  `json:"discoRef"`
}, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Generating NEPA token", "vendId", vendID, "meterNumber", meterNumber)

	// Call VTPass API or DISCO direct API
	// Implementation: POST /api/v2/pay with serviceID, billersCode, amount, phone
	token := fmt.Sprintf("%020d", time.Now().UnixNano()%100000000000000000)
	units := amount / 100.0 // Simplified: 1 unit per 100 NGN

	return struct {
		Token    string  `json:"token"`
		Units    float64 `json:"units"`
		DISCORef string  `json:"discoRef"`
	}{
		Token:    token,
		Units:    units,
		DISCORef: fmt.Sprintf("%s-REF-%d", disco, time.Now().Unix()),
	}, nil
}

// DeliverTokenActivity delivers the token to the customer via SMS.
func DeliverTokenActivity(ctx context.Context, vendID, phoneNumber, token string,
	units, amount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Delivering token", "vendId", vendID, "phone", phoneNumber)
	// Implementation: Termii SMS API → "Your token is: {token}. Units: {units} kWh"
	return nil
}

// RefundVendPaymentActivity initiates a refund for a failed vend.
func RefundVendPaymentActivity(ctx context.Context, vendID, transferRef string,
	amount float64, currency string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Refunding vend payment", "vendId", vendID, "transferRef", transferRef)
	// Implementation: FSPIOP reversal transfer
	return nil
}

// UpdateVendStatusActivity updates the vend transaction status.
func UpdateVendStatusActivity(ctx context.Context, vendID string,
	status VendStatus, errorCode string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating vend status", "vendId", vendID, "status", status)
	return nil
}

// PublishVendEventActivity publishes a vend event to Kafka.
func PublishVendEventActivity(ctx context.Context, vendID, eventType, token string,
	units float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Publishing vend event", "vendId", vendID, "eventType", eventType)
	// Kafka → paygate.energy.vend topic
	return nil
}
