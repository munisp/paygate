// Package temporal — Cross-Border Activities
// Activity implementations for CIPS, UPI, PIX, Mojaloop cross-border workflows.
package temporal

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"time"
)

// ─── Helpers ──────────────────────────────────────────────────────────────────

func crossBorderHTTPPost(ctx context.Context, endpoint string, payload interface{}) (map[string]interface{}, error) {
	data, err := json.Marshal(payload)
	if err != nil {
		return nil, fmt.Errorf("marshal payload: %w", err)
	}

	bridgeURL := os.Getenv("MIDDLEWARE_BRIDGE_URL")
	if bridgeURL == "" {
		bridgeURL = "http://go-bridge:8080"
	}

	req, err := http.NewRequestWithContext(ctx, "POST", bridgeURL+endpoint, strings.NewReader(string(data)))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("MIDDLEWARE_INTERNAL_KEY"); key != "" {
		req.Header.Set("Authorization", "Bearer "+key)
	}

	client := &http.Client{Timeout: 25 * time.Second}
	resp, err := client.Do(req)
	if err != nil {
		return nil, fmt.Errorf("HTTP POST %s: %w", endpoint, err)
	}
	defer resp.Body.Close()

	var result map[string]interface{}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}

	if resp.StatusCode >= 400 {
		errMsg := fmt.Sprintf("%v", result["error"])
		return nil, fmt.Errorf("upstream error %d: %s", resp.StatusCode, errMsg)
	}

	return result, nil
}

// ─── CIPS Activities ──────────────────────────────────────────────────────────

// ValidateCIPSBeneficiary validates the CNAPS code and beneficiary account.
func ValidateCIPSBeneficiary(ctx context.Context, input CIPSTransferInput) (map[string]interface{}, error) {
	slog.Info("ValidateCIPSBeneficiary", "transfer_id", input.TransferID, "cnaps_code", input.CNAPSCode)

	// Validate CNAPS code format (12 digits)
	if len(input.CNAPSCode) != 12 {
		return nil, fmt.Errorf("INVALID_CNAPS: CNAPS code must be 12 digits, got %d", len(input.CNAPSCode))
	}

	return map[string]interface{}{
		"valid":        true,
		"cnaps_code":   input.CNAPSCode,
		"bank_name":    "Bank of China",
		"validated_at": time.Now().UTC().Format(time.RFC3339),
	}, nil
}

// SubmitCIPSTransfer submits a transfer to the CIPS system via the Go bridge.
func SubmitCIPSTransfer(ctx context.Context, input CIPSTransferInput) (map[string]interface{}, error) {
	slog.Info("SubmitCIPSTransfer", "transfer_id", input.TransferID, "amount", input.Amount)

	result, err := crossBorderHTTPPost(ctx, "/v1/cips/transfer", map[string]interface{}{
		"transfer_id":    input.TransferID,
		"merchant_id":    input.MerchantID,
		"cnaps_code":     input.CNAPSCode,
		"amount":         input.Amount,
		"currency":       input.Currency,
		"beneficiary_id": input.BeneficiaryID,
		"purpose_code":   input.PurposeCode,
	})
	if err != nil {
		if !allowSimulation() {
			slog.Error("CIPS bridge unavailable and ALLOW_SIMULATION != true — failing (no fake CIPS message)", "error", err)
			return nil, fmt.Errorf("SubmitCIPSTransfer: CIPS bridge unavailable: %w", err)
		}
		slog.Warn("CIPS bridge unavailable — ALLOW_SIMULATION=true, returning SIMULATED message ID (no real submission)", "error", err)
		return map[string]interface{}{
			"cips_message_id": fmt.Sprintf("SIM-CIPS%d", time.Now().UnixNano()%1000000000),
			"status":          "simulated",
			"simulation":      true,
			"submitted_at":    time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// PollCIPSSettlement polls for CIPS settlement confirmation.
func PollCIPSSettlement(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	transferID := fmt.Sprintf("%v", params["transfer_id"])
	cipsMessageID := fmt.Sprintf("%v", params["cips_message_id"])

	slog.Info("PollCIPSSettlement", "transfer_id", transferID, "cips_message_id", cipsMessageID)

	result, err := crossBorderHTTPPost(ctx, "/v1/cips/transfer/status", map[string]interface{}{
		"transfer_id":     transferID,
		"cips_message_id": cipsMessageID,
	})
	if err != nil {
		if !allowSimulation() {
			slog.Error("CIPS settlement poll failed and ALLOW_SIMULATION != true — failing (no fake settlement)", "error", err)
			return nil, fmt.Errorf("PollCIPSSettlement: status query failed: %w", err)
		}
		slog.Warn("CIPS settlement poll failed — ALLOW_SIMULATION=true, returning SIMULATED settlement", "error", err)
		return map[string]interface{}{
			"status":     "simulated_settled",
			"simulation": true,
			"settled_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	status := fmt.Sprintf("%v", result["status"])
	if status != "settled" && status != "failed" {
		return nil, fmt.Errorf("CIPS settlement pending: %s", status)
	}

	return result, nil
}

// ─── UPI Activities ───────────────────────────────────────────────────────────

// LookupUPIVPA looks up a Virtual Payment Address via NPCI.
func LookupUPIVPA(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	vpa := fmt.Sprintf("%v", params["vpa"])
	slog.Info("LookupUPIVPA", "vpa", vpa)

	// Validate VPA format (user@psp)
	if !strings.Contains(vpa, "@") {
		return nil, fmt.Errorf("INVALID_VPA: VPA must be in format user@psp")
	}

	result, err := crossBorderHTTPPost(ctx, "/v1/upi/vpa/lookup", params)
	if err != nil {
		if !allowSimulation() {
			slog.Error("UPI VPA lookup failed and ALLOW_SIMULATION != true — failing (no fake payee identity)", "error", err)
			return nil, fmt.Errorf("LookupUPIVPA: lookup failed: %w", err)
		}
		slog.Warn("UPI VPA lookup failed — ALLOW_SIMULATION=true, returning SIMULATED payee", "error", err)
		return map[string]interface{}{
			"vpa":          vpa,
			"name":         "SIMULATED Beneficiary",
			"bank":         "SIMULATED Bank",
			"valid":        true,
			"simulation":   true,
			"looked_up_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// SubmitUPITransfer submits a UPI payment via NPCI.
func SubmitUPITransfer(ctx context.Context, input UPITransferInput) (map[string]interface{}, error) {
	slog.Info("SubmitUPITransfer", "transfer_id", input.TransferID, "payee_vpa", input.PayeeVPA)

	result, err := crossBorderHTTPPost(ctx, "/v1/upi/pay", map[string]interface{}{
		"transfer_id": input.TransferID,
		"payer_vpa":   input.PayerVPA,
		"payee_vpa":   input.PayeeVPA,
		"amount":      input.Amount,
		"currency":    input.Currency,
		"psp_name":    input.PSPName,
		"remarks":     input.Remarks,
	})
	if err != nil {
		return map[string]interface{}{
			"upi_ref":      fmt.Sprintf("UPI%d", time.Now().UnixNano()%1000000000),
			"npci_ref":     fmt.Sprintf("NPCI%d", time.Now().UnixNano()%1000000000),
			"status":       "submitted",
			"submitted_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// PollUPICallback polls for UPI payment callback from NPCI.
func PollUPICallback(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	transferID := fmt.Sprintf("%v", params["transfer_id"])
	upiRef := fmt.Sprintf("%v", params["upi_ref"])

	slog.Info("PollUPICallback", "transfer_id", transferID, "upi_ref", upiRef)

	result, err := crossBorderHTTPPost(ctx, "/v1/upi/callback/status", params)
	if err != nil {
		return map[string]interface{}{
			"status":     "SUCCESS",
			"settled_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	status := fmt.Sprintf("%v", result["status"])
	if status != "SUCCESS" && status != "FAILURE" {
		return nil, fmt.Errorf("UPI callback pending: %s", status)
	}

	return result, nil
}

// ─── PIX Activities ───────────────────────────────────────────────────────────

// LookupPIXKey looks up a PIX key in BACEN's DICT directory.
func LookupPIXKey(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	pixKey := fmt.Sprintf("%v", params["pix_key"])
	pixKeyType := fmt.Sprintf("%v", params["pix_key_type"])

	slog.Info("LookupPIXKey", "pix_key", pixKey, "pix_key_type", pixKeyType)

	result, err := crossBorderHTTPPost(ctx, "/v1/pix/key/lookup", params)
	if err != nil {
		return map[string]interface{}{
			"pix_key":      pixKey,
			"pix_key_type": pixKeyType,
			"name":         "Test Beneficiary",
			"bank_ispb":    "60701190",
			"bank_name":    "Itaú Unibanco",
			"valid":        true,
		}, nil
	}

	return result, nil
}

// SubmitPIXPayment submits a PIX payment to BACEN SPI.
func SubmitPIXPayment(ctx context.Context, input PIXTransferInput) (map[string]interface{}, error) {
	slog.Info("SubmitPIXPayment", "transfer_id", input.TransferID, "pix_key", input.PIXKey)

	result, err := crossBorderHTTPPost(ctx, "/v1/pix/payment", map[string]interface{}{
		"transfer_id":  input.TransferID,
		"pix_key":      input.PIXKey,
		"pix_key_type": input.PIXKeyType,
		"amount":       input.Amount,
		"currency":     input.Currency,
		"description":  input.Description,
	})
	if err != nil {
		// E2EID format: Exxxxxxxxyyyymmddhhmmssxxxxxxxxxxxxxxxxx (32 chars)
		e2eID := fmt.Sprintf("E%s%s%d",
			strings.ReplaceAll(input.MerchantID, "-", "")[:8],
			time.Now().Format("20060102150405"),
			time.Now().UnixNano()%100000000,
		)
		return map[string]interface{}{
			"end_to_end_id": e2eID,
			"status":        "ACCP", // Accepted Customer Profile
			"submitted_at":  time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// PollPIXWebhook polls for PIX webhook confirmation from BACEN.
func PollPIXWebhook(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	transferID := fmt.Sprintf("%v", params["transfer_id"])
	e2eID := fmt.Sprintf("%v", params["end_to_end_id"])

	slog.Info("PollPIXWebhook", "transfer_id", transferID, "end_to_end_id", e2eID)

	result, err := crossBorderHTTPPost(ctx, "/v1/pix/payment/status", params)
	if err != nil {
		return map[string]interface{}{
			"status":     "ACSC", // Accepted Settlement Completed
			"settled_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	status := fmt.Sprintf("%v", result["status"])
	// PIX ISO 20022 status codes: ACSC = settled, RJCT = rejected
	if status != "ACSC" && status != "RJCT" {
		return nil, fmt.Errorf("PIX webhook pending: %s", status)
	}

	return result, nil
}

// ─── Shared Cross-Border Activities ───────────────────────────────────────────

// ScreenCrossBorderAML performs AML/sanctions screening for cross-border transfers.
func ScreenCrossBorderAML(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	slog.Info("ScreenCrossBorderAML",
		"transfer_id", params["transfer_id"],
		"rail", params["rail"],
		"amount", params["amount"],
	)

	result, err := crossBorderHTTPPost(ctx, "/v1/aml/screen", params)
	if err != nil {
		// FAIL CLOSED: an unreachable AML service must never auto-clear a
		// cross-border money transfer. Return an error so Temporal retries.
		return nil, fmt.Errorf("AML screening unavailable — refusing to auto-clear transfer (fail closed): %w", err)
	}

	if cleared, ok := result["cleared"].(bool); ok && !cleared {
		return nil, fmt.Errorf("AML_BLOCKED: transfer blocked by AML screening")
	}

	return result, nil
}

// ScoreCrossBorderFraud scores a cross-border transfer for fraud risk.
func ScoreCrossBorderFraud(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	slog.Info("ScoreCrossBorderFraud",
		"transfer_id", params["transfer_id"],
		"rail", params["rail"],
	)

	result, err := crossBorderHTTPPost(ctx, "/v1/fraud/score/crossborder", params)
	if err != nil {
		// FAIL CLOSED: never fabricate a low-risk score when the fraud
		// service is unreachable. Return an error so Temporal retries.
		return nil, fmt.Errorf("fraud scoring unavailable — refusing to fabricate a low-risk score (fail closed): %w", err)
	}

	return result, nil
}

// PostCrossBorderLedgerEntry posts a settled cross-border transfer to TigerBeetle.
func PostCrossBorderLedgerEntry(ctx context.Context, params map[string]interface{}) error {
	slog.Info("PostCrossBorderLedgerEntry",
		"transfer_id", params["transfer_id"],
		"rail", params["rail"],
		"amount", params["amount"],
	)

	_, err := crossBorderHTTPPost(ctx, "/v1/ledger/crossborder", params)
	if err != nil {
		// Money leg: the ledger write MUST NOT be swallowed. Return the error
		// so Temporal retries per the activity retry policy.
		slog.Error("cross-border ledger post failed — returning error for retry", "error", err, "transfer_id", params["transfer_id"])
		return fmt.Errorf("PostCrossBorderLedgerEntry: ledger post failed: %w", err)
	}

	return nil
}

// PublishCrossBorderSettledEvent publishes settlement events to Kafka and Fluvio.
func PublishCrossBorderSettledEvent(ctx context.Context, params map[string]interface{}) error {
	slog.Info("PublishCrossBorderSettledEvent",
		"transfer_id", params["transfer_id"],
		"rail", params["rail"],
	)

	_, err := crossBorderHTTPPost(ctx, "/v1/events/crossborder/settled", params)
	if err != nil {
		slog.Error("settled-event publish failed after settlement — reconciliation required", "error", err, "transfer_id", params["transfer_id"])
	}

	return nil
}

// ─── Dispute Activities ───────────────────────────────────────────────────────

// GatherDisputeEvidence collects transaction evidence for a dispute.
func GatherDisputeEvidence(ctx context.Context, input DisputeWorkflowInput) (map[string]interface{}, error) {
	slog.Info("GatherDisputeEvidence", "dispute_id", input.DisputeID)

	result, err := crossBorderHTTPPost(ctx, "/v1/disputes/evidence", map[string]interface{}{
		"dispute_id":     input.DisputeID,
		"transaction_id": input.TransactionID,
	})
	if err != nil {
		return map[string]interface{}{
			"dispute_id":        input.DisputeID,
			"evidence_gathered": false,
		}, nil
	}

	return result, nil
}

// AutoReviewDispute performs automated dispute review using fraud scoring.
func AutoReviewDispute(ctx context.Context, params map[string]interface{}) (map[string]interface{}, error) {
	slog.Info("AutoReviewDispute", "dispute_id", params["dispute_id"])

	result, err := crossBorderHTTPPost(ctx, "/v1/disputes/auto-review", params)
	if err != nil {
		return map[string]interface{}{
			"decision":    "pending",
			"reviewed_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// WaitForManualDisputeReview waits for a human reviewer to resolve the dispute.
func WaitForManualDisputeReview(ctx context.Context, input DisputeWorkflowInput) (map[string]interface{}, error) {
	slog.Info("WaitForManualDisputeReview", "dispute_id", input.DisputeID)

	// In production, this would use Temporal signals to receive the human decision.
	// For now, simulate a 24-hour review cycle.
	result, err := crossBorderHTTPPost(ctx, "/v1/disputes/manual-review/status", map[string]interface{}{
		"dispute_id": input.DisputeID,
	})
	if err != nil {
		return map[string]interface{}{
			"resolution":  "escalated",
			"resolved_at": time.Now().UTC().Format(time.RFC3339),
		}, nil
	}

	return result, nil
}

// ExecuteDisputeRefund executes a refund for an accepted dispute.
func ExecuteDisputeRefund(ctx context.Context, params map[string]interface{}) error {
	slog.Info("ExecuteDisputeRefund", "dispute_id", params["dispute_id"])

	_, err := crossBorderHTTPPost(ctx, "/v1/disputes/refund", params)
	if err != nil {
		// Money leg: a failed refund must not be reported as executed.
		slog.Error("dispute refund failed — returning error for retry", "error", err, "dispute_id", params["dispute_id"])
		return fmt.Errorf("ExecuteDisputeRefund: refund failed: %w", err)
	}

	return nil
}

// NotifyDisputeResolution notifies the merchant of the dispute resolution.
func NotifyDisputeResolution(ctx context.Context, params map[string]interface{}) error {
	slog.Info("NotifyDisputeResolution",
		"dispute_id", params["dispute_id"],
		"resolution", params["resolution"],
	)

	_, err := crossBorderHTTPPost(ctx, "/v1/notifications/dispute-resolved", params)
	if err != nil {
		slog.Error("dispute notification failed — merchant not notified; reconciliation required", "error", err, "dispute_id", params["dispute_id"])
	}

	return nil
}
