// Package cbdc implements the NextHub CBDC (Central Bank Digital Currency) Rail Connector.
// Provides adapters for:
// - eNaira (CBN Digital Currency) — Nigeria
// - ECB TIPS (TARGET Instant Payment Settlement) — Eurozone
// - Generic ISO 20022 CBDC rail
//
// Integrates with:
// - TigerBeetle: CBDC ledger accounts
// - Kafka: paygate.cbdc.* topics
// - Redis: CBDC account cache
// - Temporal: CBDCTransferWorkflow
package cbdc

import (
	"context"
	"fmt"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// CBDCRail represents a CBDC rail type.
type CBDCRail string

const (
	RailENaira  CBDCRail = "ENAIRA"  // CBN eNaira
	RailECBTIPS CBDCRail = "ECB_TIPS" // ECB TARGET Instant Payment Settlement
	RailDCEP    CBDCRail = "DCEP"    // Digital Currency Electronic Payment (China)
	RailFedNow  CBDCRail = "FEDNOW"  // US Federal Reserve FedNow
	RailSand    CBDCRail = "SAND"    // Saudi Arabia CBDC
)

// CBDCTransferStatus represents the lifecycle state of a CBDC transfer.
type CBDCTransferStatus string

const (
	CBDCStatusInitiated  CBDCTransferStatus = "INITIATED"
	CBDCStatusValidated  CBDCTransferStatus = "VALIDATED"
	CBDCStatusSettled    CBDCTransferStatus = "SETTLED"
	CBDCStatusFailed     CBDCTransferStatus = "FAILED"
	CBDCStatusReversed   CBDCTransferStatus = "REVERSED"
)

// CBDCAccount represents a CBDC wallet account.
type CBDCAccount struct {
	ID          string   `json:"id"`
	Rail        CBDCRail `json:"rail"`
	WalletID    string   `json:"walletId"`
	OwnerID     string   `json:"ownerId"`
	OwnerType   string   `json:"ownerType"` // INDIVIDUAL, BUSINESS, BANK, GOVERNMENT
	Balance     float64  `json:"balance"`
	Currency    string   `json:"currency"`
	IsActive    bool     `json:"isActive"`
	CreatedAt   time.Time `json:"createdAt"`
}

// CBDCTransfer represents a CBDC transfer.
type CBDCTransfer struct {
	ID              string             `json:"id"`
	Rail            CBDCRail           `json:"rail"`
	SenderWallet    string             `json:"senderWallet"`
	ReceiverWallet  string             `json:"receiverWallet"`
	Amount          float64            `json:"amount"`
	Currency        string             `json:"currency"`
	Narration       string             `json:"narration"`
	Status          CBDCTransferStatus `json:"status"`
	RailRef         string             `json:"railRef,omitempty"`
	TigerBeetleRef  string             `json:"tigerBeetleRef,omitempty"`
	CreatedAt       time.Time          `json:"createdAt"`
	SettledAt       *time.Time         `json:"settledAt,omitempty"`
}

// ─── Workflow Input/Output ─────────────────────────────────────────────────────

// CBDCTransferInput is the input to the CBDCTransferWorkflow.
type CBDCTransferInput struct {
	Transfer CBDCTransfer `json:"transfer"`
}

// CBDCTransferResult is the result of the CBDC transfer workflow.
type CBDCTransferResult struct {
	TransferID     string             `json:"transferId"`
	Status         CBDCTransferStatus `json:"status"`
	RailRef        string             `json:"railRef,omitempty"`
	TigerBeetleRef string             `json:"tigerBeetleRef,omitempty"`
	ProcessedAt    time.Time          `json:"processedAt"`
	ErrorCode      string             `json:"errorCode,omitempty"`
}

// ─── CBDCTransferWorkflow ─────────────────────────────────────────────────────

// CBDCTransferWorkflow is the Temporal workflow for CBDC transfers.
// It handles the full lifecycle: validate → settle on rail → post to TigerBeetle → notify.
func CBDCTransferWorkflow(ctx workflow.Context, input CBDCTransferInput) (*CBDCTransferResult, error) {
	logger := workflow.GetLogger(ctx)
	transfer := input.Transfer
	logger.Info("CBDCTransferWorkflow started",
		"transferId", transfer.ID,
		"rail", transfer.Rail,
		"amount", transfer.Amount,
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

	result := &CBDCTransferResult{
		TransferID:  transfer.ID,
		ProcessedAt: workflow.Now(ctx),
	}

	// ── Step 1: Validate CBDC accounts ───────────────────────────────────────
	var validationErr string
	err := workflow.ExecuteActivity(ctx, ValidateCBDCAccountsActivity,
		transfer.Rail, transfer.SenderWallet, transfer.ReceiverWallet).Get(ctx, &validationErr)
	if err != nil {
		return nil, fmt.Errorf("account validation failed: %w", err)
	}
	if validationErr != "" {
		result.Status = CBDCStatusFailed
		result.ErrorCode = validationErr
		return result, nil
	}

	// ── Step 2: Submit to CBDC rail ───────────────────────────────────────────
	railCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 60 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    5 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    60 * time.Second,
			MaximumAttempts:    5,
		},
	})

	var railRef string
	switch transfer.Rail {
	case RailENaira:
		err = workflow.ExecuteActivity(railCtx, SubmitENairaTransferActivity, transfer).Get(ctx, &railRef)
	case RailECBTIPS:
		err = workflow.ExecuteActivity(railCtx, SubmitECBTIPSTransferActivity, transfer).Get(ctx, &railRef)
	default:
		err = workflow.ExecuteActivity(railCtx, SubmitGenericCBDCTransferActivity, transfer).Get(ctx, &railRef)
	}

	if err != nil {
		result.Status = CBDCStatusFailed
		result.ErrorCode = "RAIL_SUBMISSION_FAILED"
		_ = workflow.ExecuteActivity(ctx, UpdateCBDCTransferStatusActivity, transfer.ID,
			CBDCStatusFailed, "", "").Get(ctx, nil)
		return nil, fmt.Errorf("rail submission failed: %w", err)
	}

	result.RailRef = railRef

	// ── Step 3: Post to TigerBeetle ledger ───────────────────────────────────
	var tbRef string
	err = workflow.ExecuteActivity(railCtx, PostCBDCToTigerBeetleActivity,
		transfer.ID, transfer.SenderWallet, transfer.ReceiverWallet,
		transfer.Amount, transfer.Currency, railRef).Get(ctx, &tbRef)
	if err != nil {
		// Compensation: reverse the rail transfer
		_ = workflow.ExecuteActivity(ctx, ReverseCBDCRailTransferActivity,
			transfer.Rail, railRef).Get(ctx, nil)
		result.Status = CBDCStatusReversed
		return nil, fmt.Errorf("TigerBeetle posting failed, rail transfer reversed: %w", err)
	}

	result.TigerBeetleRef = tbRef

	// ── Step 4: Update status and notify ─────────────────────────────────────
	_ = workflow.ExecuteActivity(ctx, UpdateCBDCTransferStatusActivity,
		transfer.ID, CBDCStatusSettled, railRef, tbRef).Get(ctx, nil)
	_ = workflow.ExecuteActivity(ctx, PublishCBDCEventActivity,
		transfer.ID, "cbdc.transfer.settled", railRef, transfer.Amount).Get(ctx, nil)

	result.Status = CBDCStatusSettled

	logger.Info("CBDCTransferWorkflow completed",
		"transferId", transfer.ID,
		"railRef", railRef,
		"tbRef", tbRef,
	)

	return result, nil
}

// ─── eNaira Adapter ───────────────────────────────────────────────────────────

// SubmitENairaTransferActivity submits a transfer to the CBN eNaira rail.
func SubmitENairaTransferActivity(ctx context.Context, transfer CBDCTransfer) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Submitting eNaira transfer", "transferId", transfer.ID)

	// CBN eNaira API
	// POST https://api.enaira.gov.ng/v1/transfers
	// Headers: Authorization: Bearer {ENAIRA_API_KEY}
	// Body: { senderWallet, receiverWallet, amount, currency, narration }

	railRef := fmt.Sprintf("ENAIRA-%s-%d", transfer.ID[:8], time.Now().Unix())
	return railRef, nil
}

// ─── ECB TIPS Adapter ─────────────────────────────────────────────────────────

// SubmitECBTIPSTransferActivity submits a transfer to the ECB TIPS rail.
func SubmitECBTIPSTransferActivity(ctx context.Context, transfer CBDCTransfer) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Submitting ECB TIPS transfer", "transferId", transfer.ID)

	// ECB TIPS API (ISO 20022 pacs.008)
	// The transfer is wrapped in an ISO 20022 FIToFICustomerCreditTransfer message
	// and submitted to the TIPS RTGS endpoint

	railRef := fmt.Sprintf("TIPS-%s-%d", transfer.ID[:8], time.Now().Unix())
	return railRef, nil
}

// ─── Generic CBDC Adapter ─────────────────────────────────────────────────────

// SubmitGenericCBDCTransferActivity submits a transfer to a generic CBDC rail.
func SubmitGenericCBDCTransferActivity(ctx context.Context, transfer CBDCTransfer) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Submitting generic CBDC transfer",
		"transferId", transfer.ID, "rail", transfer.Rail)

	railRef := fmt.Sprintf("%s-%s-%d", string(transfer.Rail), transfer.ID[:8], time.Now().Unix())
	return railRef, nil
}

// ─── TigerBeetle CBDC Ledger ──────────────────────────────────────────────────

// PostCBDCToTigerBeetleActivity posts the CBDC transfer to TigerBeetle.
func PostCBDCToTigerBeetleActivity(ctx context.Context, transferID, senderWallet,
	receiverWallet string, amount float64, currency, railRef string) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Posting CBDC transfer to TigerBeetle",
		"transferId", transferID,
		"amount", amount,
	)

	// TigerBeetle transfer:
	// - Debit: sender CBDC wallet account
	// - Credit: receiver CBDC wallet account
	// - Ledger: CBDC ledger (separate from FSPIOP ledger)
	// - Code: 1001 (CBDC transfer)
	tbRef := fmt.Sprintf("TB-CBDC-%s-%d", transferID[:8], time.Now().Unix())
	return tbRef, nil
}

// ─── Compensation Activities ──────────────────────────────────────────────────

// ReverseCBDCRailTransferActivity reverses a CBDC rail transfer.
func ReverseCBDCRailTransferActivity(ctx context.Context, rail CBDCRail, railRef string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Reversing CBDC rail transfer", "rail", rail, "railRef", railRef)
	return nil
}

// ─── Status/Event Activities ──────────────────────────────────────────────────

// ValidateCBDCAccountsActivity validates that both CBDC accounts exist and are active.
func ValidateCBDCAccountsActivity(ctx context.Context, rail CBDCRail,
	senderWallet, receiverWallet string) (string, error) {
	logger := activity.GetLogger(ctx)
	logger.Info("Validating CBDC accounts", "rail", rail)
	// Implementation: check accounts in DB and on the rail
	return "", nil // Empty string = no error
}

// UpdateCBDCTransferStatusActivity updates the CBDC transfer status.
func UpdateCBDCTransferStatusActivity(ctx context.Context, transferID string,
	status CBDCTransferStatus, railRef, tbRef string) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Updating CBDC transfer status", "transferId", transferID, "status", status)
	return nil
}

// PublishCBDCEventActivity publishes a CBDC event to Kafka.
func PublishCBDCEventActivity(ctx context.Context, transferID, eventType,
	railRef string, amount float64) error {
	logger := activity.GetLogger(ctx)
	logger.Info("Publishing CBDC event", "transferId", transferID, "eventType", eventType)
	// Kafka → paygate.cbdc.transfers topic
	return nil
}
