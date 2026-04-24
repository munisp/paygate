// Package temporal — Cross-Border Rail Workflows
// Temporal workflows for CIPS (China), UPI (India), PIX (Brazil),
// Mojaloop, and BRICS Pay cross-border payment rails.
package temporal

import (
	"fmt"
	"time"

	"go.temporal.io/sdk/temporal"
	"go.temporal.io/sdk/workflow"
)

// ─── Input/Output Types ────────────────────────────────────────────────────────

type CIPSTransferInput struct {
	TransferID    string `json:"transfer_id"`
	MerchantID    string `json:"merchant_id"`
	CNAPSCode     string `json:"cnaps_code"`     // China National Advanced Payment System bank code
	Amount        string `json:"amount"`
	Currency      string `json:"currency"`       // CNY
	BeneficiaryID string `json:"beneficiary_id"`
	PurposeCode   string `json:"purpose_code"`   // ISO 20022 purpose code
	IdempotencyKey string `json:"idempotency_key"`
}

type CIPSTransferResult struct {
	TransferID    string `json:"transfer_id"`
	CIPSMessageID string `json:"cips_message_id"`
	Status        string `json:"status"`
	SettledAt     string `json:"settled_at,omitempty"`
	ErrorCode     string `json:"error_code,omitempty"`
}

type UPITransferInput struct {
	TransferID     string `json:"transfer_id"`
	MerchantID     string `json:"merchant_id"`
	PayerVPA       string `json:"payer_vpa"`      // Virtual Payment Address
	PayeeVPA       string `json:"payee_vpa"`
	Amount         string `json:"amount"`
	Currency       string `json:"currency"`       // INR
	PSPName        string `json:"psp_name"`       // e.g. "gpay", "phonepe", "paytm"
	Remarks        string `json:"remarks"`
	IdempotencyKey string `json:"idempotency_key"`
}

type UPITransferResult struct {
	TransferID string `json:"transfer_id"`
	UPIRef     string `json:"upi_ref"`
	NPCIRef    string `json:"npci_ref"`
	Status     string `json:"status"`
	SettledAt  string `json:"settled_at,omitempty"`
}

type PIXTransferInput struct {
	TransferID     string `json:"transfer_id"`
	MerchantID     string `json:"merchant_id"`
	PIXKey         string `json:"pix_key"`        // CPF, CNPJ, phone, email, or EVP
	PIXKeyType     string `json:"pix_key_type"`   // CPF | CNPJ | PHONE | EMAIL | EVP
	Amount         string `json:"amount"`
	Currency       string `json:"currency"`       // BRL
	Description    string `json:"description"`
	IdempotencyKey string `json:"idempotency_key"`
}

type PIXTransferResult struct {
	TransferID string `json:"transfer_id"`
	EndToEndID string `json:"end_to_end_id"`  // E2EID from BACEN
	Status     string `json:"status"`
	SettledAt  string `json:"settled_at,omitempty"`
}

type DisputeWorkflowInput struct {
	DisputeID   string `json:"dispute_id"`
	MerchantID  string `json:"merchant_id"`
	TransactionID string `json:"transaction_id"`
	Amount      string `json:"amount"`
	Reason      string `json:"reason"`
	Evidence    string `json:"evidence"`
}

type DisputeWorkflowResult struct {
	DisputeID  string `json:"dispute_id"`
	Resolution string `json:"resolution"` // accepted | rejected | escalated
	ResolvedAt string `json:"resolved_at"`
	Notes      string `json:"notes"`
}

// ─── CIPS Workflow ─────────────────────────────────────────────────────────────

// CIPSTransferWorkflow orchestrates a full CIPS cross-border transfer lifecycle.
// Steps: validate → AML check → CIPS submit → await settlement → notify → ledger
func CIPSTransferWorkflow(ctx workflow.Context, input CIPSTransferInput) (CIPSTransferResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("CIPSTransferWorkflow started", "transfer_id", input.TransferID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:        3,
			InitialInterval:        2 * time.Second,
			MaximumInterval:        30 * time.Second,
			BackoffCoefficient:     2.0,
			NonRetryableErrorTypes: []string{"SANCTIONS_HIT", "AML_BLOCKED", "INVALID_CNAPS"},
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate CNAPS code and beneficiary
	var validationResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, ValidateCIPSBeneficiary, input).Get(ctx, &validationResult); err != nil {
		return CIPSTransferResult{TransferID: input.TransferID, Status: "validation_failed", ErrorCode: err.Error()}, err
	}

	// Step 2: AML / Sanctions screening
	var amlResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, ScreenCrossBorderAML, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"currency":    input.Currency,
		"rail":        "cips",
	}).Get(ctx, &amlResult); err != nil {
		return CIPSTransferResult{TransferID: input.TransferID, Status: "aml_blocked", ErrorCode: "AML_BLOCKED"}, err
	}

	// Step 3: Submit to CIPS
	var cipsResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, SubmitCIPSTransfer, input).Get(ctx, &cipsResult); err != nil {
		return CIPSTransferResult{TransferID: input.TransferID, Status: "cips_submit_failed", ErrorCode: err.Error()}, err
	}

	cipsMessageID := fmt.Sprintf("%v", cipsResult["cips_message_id"])

	// Step 4: Wait for CIPS settlement (up to 4 hours for CIPS batch windows)
	settlementCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 4 * time.Hour,
		HeartbeatTimeout:    5 * time.Minute,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 48, // poll every 5 min for 4 hours
			InitialInterval: 5 * time.Minute,
		},
	})
	var settlementResult map[string]interface{}
	if err := workflow.ExecuteActivity(settlementCtx, PollCIPSSettlement, map[string]interface{}{
		"transfer_id":     input.TransferID,
		"cips_message_id": cipsMessageID,
	}).Get(ctx, &settlementResult); err != nil {
		return CIPSTransferResult{
			TransferID:    input.TransferID,
			CIPSMessageID: cipsMessageID,
			Status:        "settlement_timeout",
		}, nil
	}

	// Step 5: Post to TigerBeetle ledger
	if err := workflow.ExecuteActivity(ctx, PostCrossBorderLedgerEntry, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"currency":    input.Currency,
		"rail":        "cips",
		"status":      "settled",
	}).Get(ctx, nil); err != nil {
		logger.Warn("ledger post failed (non-fatal)", "error", err)
	}

	// Step 6: Publish Kafka + Fluvio events
	if err := workflow.ExecuteActivity(ctx, PublishCrossBorderSettledEvent, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"rail":        "cips",
		"amount":      input.Amount,
		"currency":    input.Currency,
	}).Get(ctx, nil); err != nil {
		logger.Warn("event publish failed (non-fatal)", "error", err)
	}

	return CIPSTransferResult{
		TransferID:    input.TransferID,
		CIPSMessageID: cipsMessageID,
		Status:        "settled",
		SettledAt:     time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ─── UPI Workflow ──────────────────────────────────────────────────────────────

// UPITransferWorkflow orchestrates a UPI collect/pay transfer.
// Steps: VPA lookup → fraud check → NPCI submit → await callback → ledger → notify
func UPITransferWorkflow(ctx workflow.Context, input UPITransferInput) (UPITransferResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("UPITransferWorkflow started", "transfer_id", input.TransferID, "vpa", input.PayeeVPA)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:        3,
			InitialInterval:        1 * time.Second,
			MaximumInterval:        10 * time.Second,
			BackoffCoefficient:     2.0,
			NonRetryableErrorTypes: []string{"INVALID_VPA", "VPA_NOT_FOUND", "PSP_BLOCKED"},
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: VPA lookup via NPCI
	var vpaResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, LookupUPIVPA, map[string]interface{}{
		"vpa":      input.PayeeVPA,
		"psp_name": input.PSPName,
	}).Get(ctx, &vpaResult); err != nil {
		return UPITransferResult{TransferID: input.TransferID, Status: "vpa_not_found"}, err
	}

	// Step 2: Fraud scoring
	var fraudResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, ScoreCrossBorderFraud, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"rail":        "upi",
		"vpa":         input.PayeeVPA,
	}).Get(ctx, &fraudResult); err != nil {
		logger.Warn("fraud scoring failed (non-fatal)", "error", err)
	}

	// Step 3: Submit to NPCI/UPI
	var upiResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, SubmitUPITransfer, input).Get(ctx, &upiResult); err != nil {
		return UPITransferResult{TransferID: input.TransferID, Status: "upi_submit_failed"}, err
	}

	upiRef := fmt.Sprintf("%v", upiResult["upi_ref"])
	npciRef := fmt.Sprintf("%v", upiResult["npci_ref"])

	// Step 4: Wait for UPI callback (UPI is typically < 30 seconds)
	callbackCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 5 * time.Minute,
		HeartbeatTimeout:    30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 10,
			InitialInterval: 10 * time.Second,
		},
	})
	var callbackResult map[string]interface{}
	if err := workflow.ExecuteActivity(callbackCtx, PollUPICallback, map[string]interface{}{
		"transfer_id": input.TransferID,
		"upi_ref":     upiRef,
	}).Get(ctx, &callbackResult); err != nil {
		return UPITransferResult{
			TransferID: input.TransferID,
			UPIRef:     upiRef,
			NPCIRef:    npciRef,
			Status:     "callback_timeout",
		}, nil
	}

	// Step 5: Post to TigerBeetle ledger
	_ = workflow.ExecuteActivity(ctx, PostCrossBorderLedgerEntry, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"currency":    input.Currency,
		"rail":        "upi",
		"status":      "settled",
	}).Get(ctx, nil)

	// Step 6: Publish events
	_ = workflow.ExecuteActivity(ctx, PublishCrossBorderSettledEvent, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"rail":        "upi",
		"amount":      input.Amount,
		"currency":    "INR",
	}).Get(ctx, nil)

	return UPITransferResult{
		TransferID: input.TransferID,
		UPIRef:     upiRef,
		NPCIRef:    npciRef,
		Status:     "settled",
		SettledAt:  time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ─── PIX Workflow ──────────────────────────────────────────────────────────────

// PIXTransferWorkflow orchestrates a PIX instant payment (Brazil BACEN).
// Steps: PIX key lookup → fraud check → BACEN submit → await webhook → ledger → notify
func PIXTransferWorkflow(ctx workflow.Context, input PIXTransferInput) (PIXTransferResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("PIXTransferWorkflow started", "transfer_id", input.TransferID, "pix_key", input.PIXKey)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts:        3,
			InitialInterval:        1 * time.Second,
			MaximumInterval:        10 * time.Second,
			BackoffCoefficient:     2.0,
			NonRetryableErrorTypes: []string{"INVALID_PIX_KEY", "PIX_KEY_NOT_FOUND", "BACEN_REJECTED"},
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: PIX key lookup via DICT (BACEN's directory)
	var dictResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, LookupPIXKey, map[string]interface{}{
		"pix_key":      input.PIXKey,
		"pix_key_type": input.PIXKeyType,
	}).Get(ctx, &dictResult); err != nil {
		return PIXTransferResult{TransferID: input.TransferID, Status: "pix_key_not_found"}, err
	}

	// Step 2: Fraud scoring
	_ = workflow.ExecuteActivity(ctx, ScoreCrossBorderFraud, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"rail":        "pix",
		"pix_key":     input.PIXKey,
	}).Get(ctx, nil)

	// Step 3: Submit PIX payment to BACEN SPI (Sistema de Pagamentos Instantâneos)
	var pixResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, SubmitPIXPayment, input).Get(ctx, &pixResult); err != nil {
		return PIXTransferResult{TransferID: input.TransferID, Status: "pix_submit_failed"}, err
	}

	endToEndID := fmt.Sprintf("%v", pixResult["end_to_end_id"])

	// Step 4: Wait for BACEN webhook (PIX is typically < 10 seconds)
	webhookCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
		StartToCloseTimeout: 2 * time.Minute,
		HeartbeatTimeout:    15 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 12,
			InitialInterval: 5 * time.Second,
		},
	})
	var webhookResult map[string]interface{}
	if err := workflow.ExecuteActivity(webhookCtx, PollPIXWebhook, map[string]interface{}{
		"transfer_id":  input.TransferID,
		"end_to_end_id": endToEndID,
	}).Get(ctx, &webhookResult); err != nil {
		return PIXTransferResult{
			TransferID: input.TransferID,
			EndToEndID: endToEndID,
			Status:     "webhook_timeout",
		}, nil
	}

	// Step 5: Post to TigerBeetle ledger
	_ = workflow.ExecuteActivity(ctx, PostCrossBorderLedgerEntry, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"amount":      input.Amount,
		"currency":    "BRL",
		"rail":        "pix",
		"status":      "settled",
	}).Get(ctx, nil)

	// Step 6: Publish events
	_ = workflow.ExecuteActivity(ctx, PublishCrossBorderSettledEvent, map[string]interface{}{
		"transfer_id": input.TransferID,
		"merchant_id": input.MerchantID,
		"rail":        "pix",
		"amount":      input.Amount,
		"currency":    "BRL",
	}).Get(ctx, nil)

	return PIXTransferResult{
		TransferID: input.TransferID,
		EndToEndID: endToEndID,
		Status:     "settled",
		SettledAt:  time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// ─── Dispute Resolution Workflow ───────────────────────────────────────────────

// DisputeResolutionWorkflow orchestrates the full dispute lifecycle.
// Steps: validate → gather evidence → auto-review → escalate if needed → resolve → notify
func DisputeResolutionWorkflow(ctx workflow.Context, input DisputeWorkflowInput) (DisputeWorkflowResult, error) {
	logger := workflow.GetLogger(ctx)
	logger.Info("DisputeResolutionWorkflow started", "dispute_id", input.DisputeID)

	ao := workflow.ActivityOptions{
		StartToCloseTimeout: 30 * time.Second,
		RetryPolicy: &temporal.RetryPolicy{
			MaximumAttempts: 3,
			InitialInterval: 2 * time.Second,
		},
	}
	ctx = workflow.WithActivityOptions(ctx, ao)

	// Step 1: Validate dispute and gather transaction evidence
	var evidenceResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, GatherDisputeEvidence, input).Get(ctx, &evidenceResult); err != nil {
		logger.Warn("evidence gathering failed", "error", err)
	}

	// Step 2: Auto-review with fraud scoring
	var reviewResult map[string]interface{}
	if err := workflow.ExecuteActivity(ctx, AutoReviewDispute, map[string]interface{}{
		"dispute_id":     input.DisputeID,
		"transaction_id": input.TransactionID,
		"amount":         input.Amount,
		"reason":         input.Reason,
		"evidence":       evidenceResult,
	}).Get(ctx, &reviewResult); err != nil {
		logger.Warn("auto-review failed", "error", err)
	}

	autoDecision := "pending"
	if reviewResult != nil {
		if d, ok := reviewResult["decision"].(string); ok {
			autoDecision = d
		}
	}

	// Step 3: If auto-review is inconclusive, wait for manual review (up to 5 business days)
	resolution := autoDecision
	if autoDecision == "pending" || autoDecision == "escalated" {
		manualCtx := workflow.WithActivityOptions(ctx, workflow.ActivityOptions{
			StartToCloseTimeout: 5 * 24 * time.Hour,
			HeartbeatTimeout:    1 * time.Hour,
		})
		var manualResult map[string]interface{}
		if err := workflow.ExecuteActivity(manualCtx, WaitForManualDisputeReview, input).Get(ctx, &manualResult); err != nil {
			resolution = "escalated"
		} else if d, ok := manualResult["resolution"].(string); ok {
			resolution = d
		}
	}

	// Step 4: Execute resolution (refund or reject)
	if resolution == "accepted" {
		_ = workflow.ExecuteActivity(ctx, ExecuteDisputeRefund, map[string]interface{}{
			"dispute_id":     input.DisputeID,
			"transaction_id": input.TransactionID,
			"amount":         input.Amount,
			"merchant_id":    input.MerchantID,
		}).Get(ctx, nil)
	}

	// Step 5: Notify merchant and publish event
	_ = workflow.ExecuteActivity(ctx, NotifyDisputeResolution, map[string]interface{}{
		"dispute_id":  input.DisputeID,
		"merchant_id": input.MerchantID,
		"resolution":  resolution,
	}).Get(ctx, nil)

	return DisputeWorkflowResult{
		DisputeID:  input.DisputeID,
		Resolution: resolution,
		ResolvedAt: time.Now().UTC().Format(time.RFC3339),
		Notes:      fmt.Sprintf("Resolved via Temporal workflow. Auto-decision: %s", autoDecision),
	}, nil
}

// ─── Registration ──────────────────────────────────────────────────────────────

// RegisterCrossBorderWorkflows registers all cross-border and dispute workflows.
func RegisterCrossBorderWorkflows(w interface{ RegisterWorkflow(interface{}) }) {
	w.RegisterWorkflow(CIPSTransferWorkflow)
	w.RegisterWorkflow(UPITransferWorkflow)
	w.RegisterWorkflow(PIXTransferWorkflow)
	w.RegisterWorkflow(DisputeResolutionWorkflow)
}
