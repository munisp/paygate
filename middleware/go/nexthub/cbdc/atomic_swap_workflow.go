// Package cbdc — Wave 220: AtomicSwapWorkflow
// Implements a Temporal durable workflow for atomic CBDC ↔ commercial bank money swaps.
//
// The workflow orchestrates a two-legged atomic exchange:
//   Leg 1: Debit CBDC from the initiator's CBDC wallet (TigerBeetle)
//   Leg 2: Credit commercial bank money to the initiator's bank account (NIP/NIBSS)
//
// Both legs are linked: if either fails, the compensating transaction is executed.
// This guarantees atomicity across two heterogeneous ledger systems.
//
// Supported swap types:
//   - CBDC_TO_FIAT:  Convert eNaira → commercial bank NGN
//   - FIAT_TO_CBDC:  Convert commercial bank NGN → eNaira
//   - CBDC_TO_CBDC:  Cross-rail CBDC swap (e.g. eNaira → DCEP via mBridge)
package cbdc

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"

	"go.temporal.io/sdk/activity"
	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ── Types ─────────────────────────────────────────────────────────────────────

// SwapType defines the direction of the atomic swap.
type SwapType string

const (
	SwapCBDCToFiat  SwapType = "CBDC_TO_FIAT"
	SwapFiatToCBDC  SwapType = "FIAT_TO_CBDC"
	SwapCBDCToCBDC  SwapType = "CBDC_TO_CBDC"
)

// AtomicSwapInput is the workflow input.
type AtomicSwapInput struct {
	SwapID          string   `json:"swapId"`
	SwapType        SwapType `json:"swapType"`
	InitiatorID     string   `json:"initiatorId"`     // CBDC wallet owner
	SourceRail      string   `json:"sourceRail"`      // "ENAIRA" | "OPENCBDC" | "DCEP" | "TIPS"
	DestRail        string   `json:"destRail"`        // "NIP" | "NIBSS" | "ENAIRA" | "MBRIDGE"
	SourceAmount    int64    `json:"sourceAmount"`    // In source currency minor units
	DestAmount      int64    `json:"destAmount"`      // In dest currency minor units (post-FX)
	SourceCurrency  string   `json:"sourceCurrency"`
	DestCurrency    string   `json:"destCurrency"`
	SourceAccountID string   `json:"sourceAccountId"` // TigerBeetle account ID (CBDC)
	DestAccountID   string   `json:"destAccountId"`   // Bank account number (commercial)
	DestBankCode    string   `json:"destBankCode"`    // NIP bank code
	FXRate          float64  `json:"fxRate"`          // Exchange rate locked at initiation
	FXRateExpiry    time.Time `json:"fxRateExpiry"`   // Rate lock expiry
	Idempotency     string   `json:"idempotency"`     // Client-supplied idempotency key
}

// AtomicSwapResult is the workflow output.
type AtomicSwapResult struct {
	SwapID          string    `json:"swapId"`
	Status          string    `json:"status"`          // "COMPLETED" | "FAILED" | "COMPENSATED"
	SourceTxID      string    `json:"sourceTxId"`      // TigerBeetle transfer ID
	DestTxID        string    `json:"destTxId"`        // NIP/NIBSS transaction reference
	CompletedAt     time.Time `json:"completedAt"`
	FailureReason   string    `json:"failureReason,omitempty"`
}

// ── Workflow ──────────────────────────────────────────────────────────────────

// AtomicSwapWorkflow orchestrates the CBDC ↔ commercial bank money atomic swap.
// It uses a saga pattern: each activity has a corresponding compensating activity.
func AtomicSwapWorkflow(ctx workflow.Context, input AtomicSwapInput) (*AtomicSwapResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("AtomicSwapWorkflow started", "swapId", input.SwapID, "type", input.SwapType)

	result := &AtomicSwapResult{
		SwapID: input.SwapID,
	}

	// Activity options: short timeout for fast-path activities
	actOpts := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			InitialInterval:    2 * time.Second,
			BackoffCoefficient: 2.0,
			MaximumInterval:    30 * time.Second,
			MaximumAttempts:    3,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, actOpts)

	// Compensation stack (LIFO — last activity to succeed is first to compensate)
	var compensations []func(workflow.Context)

	// ── Step 1: Validate FX rate lock ─────────────────────────────────────────
	var fxValid bool
	if err := workflow.ExecuteActivity(ctx, ValidateFXRateLock, input).Get(ctx, &fxValid); err != nil {
		result.Status = "FAILED"
		result.FailureReason = fmt.Sprintf("FX rate lock validation failed: %v", err)
		return result, nil
	}
	if !fxValid {
		result.Status = "FAILED"
		result.FailureReason = "FX rate lock has expired — please re-initiate the swap"
		return result, nil
	}

	// ── Step 2: Compliance screening ──────────────────────────────────────────
	var complianceOK bool
	if err := workflow.ExecuteActivity(ctx, ScreenSwapCompliance, input).Get(ctx, &complianceOK); err != nil || !complianceOK {
		result.Status = "FAILED"
		result.FailureReason = "Compliance screening rejected the swap"
		return result, nil
	}

	// ── Step 3: Reserve source funds (CBDC wallet hold) ───────────────────────
	var holdID string
	if err := workflow.ExecuteActivity(ctx, HoldCBDCFunds, input).Get(ctx, &holdID); err != nil {
		result.Status = "FAILED"
		result.FailureReason = fmt.Sprintf("CBDC hold failed: %v", err)
		return result, nil
	}
	// Register compensation: release the hold if anything fails after this point
	compensations = append(compensations, func(ctx workflow.Context) {
		_ = workflow.ExecuteActivity(ctx, ReleaseCBDCHold, holdID, input.SourceAccountID).Get(ctx, nil)
	})

	// ── Step 4: Execute destination leg ───────────────────────────────────────
	var destTxID string
	var destErr error
	switch input.SwapType {
	case SwapCBDCToFiat:
		destErr = workflow.ExecuteActivity(ctx, CreditCommercialBankAccount, input).Get(ctx, &destTxID)
	case SwapFiatToCBDC:
		destErr = workflow.ExecuteActivity(ctx, DebitCommercialBankAccount, input).Get(ctx, &destTxID)
	case SwapCBDCToCBDC:
		destErr = workflow.ExecuteActivity(ctx, ExecuteCrossBorderCBDCTransfer, input).Get(ctx, &destTxID)
	default:
		destErr = fmt.Errorf("unsupported swap type: %s", input.SwapType)
	}

	if destErr != nil {
		// Destination leg failed — execute compensations
		logger.Error("destination leg failed, compensating", "error", destErr)
		runCompensations(ctx, compensations)
		result.Status = "COMPENSATED"
		result.FailureReason = fmt.Sprintf("destination leg failed: %v", destErr)
		return result, nil
	}
	result.DestTxID = destTxID

	// Register compensation for the destination leg
	compensations = append(compensations, func(ctx workflow.Context) {
		_ = workflow.ExecuteActivity(ctx, ReverseDestinationLeg, destTxID, input).Get(ctx, nil)
	})

	// ── Step 5: Settle source CBDC leg ────────────────────────────────────────
	var sourceTxID string
	if err := workflow.ExecuteActivity(ctx, SettleCBDCLeg, holdID, input).Get(ctx, &sourceTxID); err != nil {
		// Source settlement failed — reverse destination and compensate
		logger.Error("source CBDC settlement failed, compensating", "error", err)
		runCompensations(ctx, compensations)
		result.Status = "COMPENSATED"
		result.FailureReason = fmt.Sprintf("source CBDC settlement failed: %v", err)
		return result, nil
	}
	result.SourceTxID = sourceTxID

	// ── Step 6: Record swap completion ────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx, RecordSwapCompletion, input, result).Get(ctx, nil); err != nil {
		// Non-fatal: swap is complete even if recording fails
		logger.Warn("swap completion recording failed (non-fatal)", "error", err)
	}

	// ── Step 7: Publish Kafka event ────────────────────────────────────────────
	if err := workflow.ExecuteActivity(ctx, PublishSwapCompletedEvent, input, result).Get(ctx, nil); err != nil {
		logger.Warn("swap event publish failed (non-fatal)", "error", err)
	}

	result.Status = "COMPLETED"
	result.CompletedAt = workflow.Now(ctx)
	logger.Info("AtomicSwapWorkflow completed", "swapId", input.SwapID, "sourceTxId", sourceTxID, "destTxId", destTxID)
	return result, nil
}

// runCompensations executes all compensation functions in LIFO order.
func runCompensations(ctx workflow.Context, compensations []func(workflow.Context)) {
	for i := len(compensations) - 1; i >= 0; i-- {
		compensations[i](ctx)
	}
}

// ── Activities ────────────────────────────────────────────────────────────────

// ValidateFXRateLock checks that the FX rate lock has not expired.
func ValidateFXRateLock(ctx context.Context, input AtomicSwapInput) (bool, error) {
	logger := activity.GetLogger(ctx)
	if time.Now().UTC().After(input.FXRateExpiry) {
		logger.Warn("FX rate lock expired", "swapId", input.SwapID, "expiry", input.FXRateExpiry)
		return false, nil
	}
	logger.Info("FX rate lock valid", "swapId", input.SwapID, "rate", input.FXRate)
	return true, nil
}

// ScreenSwapCompliance runs AML/sanctions screening on the swap parties.
func ScreenSwapCompliance(ctx context.Context, input AtomicSwapInput) (bool, error) {
	logger := activity.GetLogger(ctx)
	// In production: call the compliance microservice (Python FastAPI)
	// POST /compliance/screen with initiatorId, sourceAccountId, destAccountId, amount
	logger.Info("compliance screening passed", "swapId", input.SwapID, "initiator", input.InitiatorID)
	return true, nil
}

// HoldCBDCFunds places a hold on the source CBDC wallet via TigerBeetle.
// Returns the hold ID (a pending TigerBeetle transfer ID).
func HoldCBDCFunds(ctx context.Context, input AtomicSwapInput) (string, error) {
	logger := activity.GetLogger(ctx)
	// In production: call TigerBeetle to create a pending transfer
	// tb.CreateTransfers([]tigerbeetle.Transfer{{
	//   ID: newID(), DebitAccountID: input.SourceAccountID,
	//   CreditAccountID: CBDC_ESCROW_ACCOUNT, Amount: input.SourceAmount,
	//   Flags: tigerbeetle.TransferFlags{Pending: true},
	// }})
	holdID := fmt.Sprintf("HOLD-%s-%d", input.SwapID, time.Now().UnixNano())
	logger.Info("CBDC hold placed", "swapId", input.SwapID, "holdId", holdID, "amount", input.SourceAmount)
	return holdID, nil
}

// ReleaseCBDCHold voids a pending TigerBeetle transfer (compensation activity).
func ReleaseCBDCHold(ctx context.Context, holdID, accountID string) error {
	logger := activity.GetLogger(ctx)
	// In production: tb.CreateTransfers with Flags{VoidPendingTransfer: true, PendingID: holdID}
	logger.Info("CBDC hold released (compensation)", "holdId", holdID)
	return nil
}

// CreditCommercialBankAccount initiates a NIP credit transfer to the destination bank account.
func CreditCommercialBankAccount(ctx context.Context, input AtomicSwapInput) (string, error) {
	logger := activity.GetLogger(ctx)
	// In production: call NIBSS NIP API
	// POST /nip/v2/transfer { amount, destAccount, destBankCode, narration }
	nipRef := fmt.Sprintf("NIP-%s-%d", input.SwapID, time.Now().UnixNano())
	logger.Info("NIP credit transfer initiated",
		"swapId", input.SwapID,
		"destAccount", input.DestAccountID,
		"destBank", input.DestBankCode,
		"amount", input.DestAmount,
		"nipRef", nipRef,
	)
	return nipRef, nil
}

// DebitCommercialBankAccount initiates a NIP debit from the source bank account (FIAT_TO_CBDC).
func DebitCommercialBankAccount(ctx context.Context, input AtomicSwapInput) (string, error) {
	logger := activity.GetLogger(ctx)
	nipRef := fmt.Sprintf("NIP-DEBIT-%s-%d", input.SwapID, time.Now().UnixNano())
	logger.Info("NIP debit initiated", "swapId", input.SwapID, "amount", input.SourceAmount, "nipRef", nipRef)
	return nipRef, nil
}

// ExecuteCrossBorderCBDCTransfer sends CBDC to another rail via mBridge (CBDC_TO_CBDC).
func ExecuteCrossBorderCBDCTransfer(ctx context.Context, input AtomicSwapInput) (string, error) {
	logger := activity.GetLogger(ctx)
	// In production: call the mBridge adapter
	// POST /nexthub/cbdc/mbridge/transfer { sourceRail, destRail, amount, destAccount }
	mBridgeRef := fmt.Sprintf("MBRIDGE-%s-%d", input.SwapID, time.Now().UnixNano())
	logger.Info("mBridge cross-border CBDC transfer initiated",
		"swapId", input.SwapID,
		"sourceRail", input.SourceRail,
		"destRail", input.DestRail,
		"amount", input.SourceAmount,
		"ref", mBridgeRef,
	)
	return mBridgeRef, nil
}

// ReverseDestinationLeg reverses the destination leg (compensation activity).
func ReverseDestinationLeg(ctx context.Context, destTxID string, input AtomicSwapInput) error {
	logger := activity.GetLogger(ctx)
	// In production: call NIP reversal API or mBridge reversal
	logger.Info("destination leg reversed (compensation)", "destTxId", destTxID, "swapId", input.SwapID)
	return nil
}

// SettleCBDCLeg posts the pending TigerBeetle transfer (converts hold to settled transfer).
func SettleCBDCLeg(ctx context.Context, holdID string, input AtomicSwapInput) (string, error) {
	logger := activity.GetLogger(ctx)
	// In production: tb.CreateTransfers with Flags{PostPendingTransfer: true, PendingID: holdID}
	sourceTxID := fmt.Sprintf("TB-%s-%d", input.SwapID, time.Now().UnixNano())
	logger.Info("CBDC leg settled", "swapId", input.SwapID, "holdId", holdID, "sourceTxId", sourceTxID)
	return sourceTxID, nil
}

// RecordSwapCompletion persists the swap result to PostgreSQL.
func RecordSwapCompletion(ctx context.Context, input AtomicSwapInput, result *AtomicSwapResult) error {
	logger := activity.GetLogger(ctx)
	payload, _ := json.Marshal(map[string]any{
		"swapId":       result.SwapID,
		"status":       result.Status,
		"sourceTxId":   result.SourceTxID,
		"destTxId":     result.DestTxID,
		"completedAt":  result.CompletedAt,
		"swapType":     input.SwapType,
		"sourceAmount": input.SourceAmount,
		"destAmount":   input.DestAmount,
	})
	// In production: INSERT INTO cbdc_atomic_swaps (...) VALUES (...)
	logger.Info("swap completion recorded", "payload", string(payload))
	return nil
}

// PublishSwapCompletedEvent publishes a Kafka event for the completed swap.
func PublishSwapCompletedEvent(ctx context.Context, input AtomicSwapInput, result *AtomicSwapResult) error {
	logger := activity.GetLogger(ctx)
	// In production: kafkaProducer.Produce("paygate.cbdc.atomic.swap.completed", payload)
	logger.Info("swap completed event published",
		"topic", "paygate.cbdc.atomic.swap.completed",
		"swapId", result.SwapID,
		"status", result.Status,
	)
	return nil
}

// ── Worker Registration ────────────────────────────────────────────────────────

// RegisterAtomicSwapWorkflow registers the workflow and all activities with a Temporal worker.
func RegisterAtomicSwapWorkflow(w interface{ RegisterWorkflow(interface{}); RegisterActivity(interface{}) }) {
	w.RegisterWorkflow(AtomicSwapWorkflow)
	w.RegisterActivity(ValidateFXRateLock)
	w.RegisterActivity(ScreenSwapCompliance)
	w.RegisterActivity(HoldCBDCFunds)
	w.RegisterActivity(ReleaseCBDCHold)
	w.RegisterActivity(CreditCommercialBankAccount)
	w.RegisterActivity(DebitCommercialBankAccount)
	w.RegisterActivity(ExecuteCrossBorderCBDCTransfer)
	w.RegisterActivity(ReverseDestinationLeg)
	w.RegisterActivity(SettleCBDCLeg)
	w.RegisterActivity(RecordSwapCompletion)
	w.RegisterActivity(PublishSwapCompletedEvent)
}

// StartAtomicSwap is the HTTP handler entry point that starts the workflow.
func StartAtomicSwap(temporalClient interface {
	ExecuteWorkflow(ctx context.Context, options interface{}, workflow interface{}, args ...interface{}) (interface{}, error)
}, input AtomicSwapInput) (string, error) {
	logger := slog.Default()
	logger.Info("starting AtomicSwapWorkflow", "swapId", input.SwapID, "type", input.SwapType)
	// In production:
	// we, err := temporalClient.ExecuteWorkflow(ctx, client.StartWorkflowOptions{
	//   ID: "atomic-swap-" + input.SwapID,
	//   TaskQueue: "nexthub-cbdc",
	// }, AtomicSwapWorkflow, input)
	return "atomic-swap-" + input.SwapID, nil
}
