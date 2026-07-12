package handlers

import (
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/temporal"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
	gotemporal "go.temporal.io/sdk/client"
)

// TriggerSettlement handles POST /v1/settlements/trigger
//
// Workflow:
//  1. Debit the merchant wallet (wallet → settlement escrow)
//  2. Credit the settlement float (escrow → float pool)
//  3. Return ledger entry ID and new merchant balance
//
// In production the float pool would then be swept to the bank via NIP/PTSP.
func TriggerSettlement(w http.ResponseWriter, r *http.Request) {
	var req types.SettlementTriggerRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.SettlementID == "" || req.MerchantID == "" || req.Amount == 0 ||
		req.Currency == "" || req.Reference == "" {
		writeError(w, http.StatusBadRequest,
			"settlement_id, merchant_id, amount, currency, and reference are required")
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}

	// Escrow account: per-settlement escrow derived from settlement ID
	escrowID, err := tb.UUIDToID(req.SettlementID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid settlement_id: %v", err))
		return
	}

	floatID := tb.FloatAccountID()

	// Ensure all accounts exist
	for _, pair := range []struct {
		id   interface{ String() string }
		code uint16
	}{} {
		_ = pair
	}
	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(escrowID, ledger, tb.CodeEscrow); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure escrow account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Step 1: merchant wallet → escrow (lock funds)
	lockRef := "lock-" + req.Reference
	lockID := tb.ReferenceToID(lockRef)
	if err := client.Transfer(lockID, merchantID, escrowID, req.Amount, ledger, tb.CodeEscrow); err != nil {
		slog.Error("settlement lock transfer", "err", err, "ref", lockRef)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("settlement lock failed: %v", err))
		return
	}

	// Step 2: escrow → float pool (release to settlement)
	releaseRef := "release-" + req.Reference
	releaseID := tb.ReferenceToID(releaseRef)
	if err := client.Transfer(releaseID, escrowID, floatID, req.Amount, ledger, tb.CodeFloat); err != nil {
		slog.Error("settlement release transfer", "err", err, "ref", releaseRef)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("settlement release failed: %v", err))
		return
	}

	newBalance, _ := client.GetBalance(merchantID)

	slog.Info("settlement triggered",
		"settlement_id", req.SettlementID,
		"merchant_id", req.MerchantID,
		"amount", req.Amount,
		"currency", req.Currency,
		"reference", req.Reference,
	)

	// Dispatch SettlementBatchWorkflow via Temporal for NIBSS batch submission
	workflowID := fmt.Sprintf("settlement-batch-%s", req.SettlementID)
	tc, tcErr := temporal.GetClient()
	if tcErr != nil {
		slog.Warn("temporal unavailable for settlement workflow", "err", tcErr)
	} else {
		wfInput := temporal.SettlementBatchInput{
			SettlementID:  req.SettlementID,
			MerchantID:    req.MerchantID,
			BatchRef:      req.Reference,
			Amount:        int64(req.Amount),
			Currency:      req.Currency,
			BankCode:      req.BankCode,
			AccountNumber: req.AccountNo,
			AccountName:   "",  // not in SettlementTriggerRequest
		}
		opts := gotemporal.StartWorkflowOptions{
			ID:        workflowID,
			TaskQueue: temporal.TaskQueue,
		}
		run, wfErr := tc.ExecuteWorkflow(r.Context(), opts, temporal.SettlementBatchWorkflow, wfInput)
		if wfErr != nil {
			slog.Error("failed to start SettlementBatchWorkflow", "err", wfErr, "settlement_id", req.SettlementID)
		} else {
			slog.Info("SettlementBatchWorkflow started",
				"workflow_id", run.GetID(),
				"run_id", run.GetRunID(),
			)
		}
	}

	// Stream to Fluvio (non-blocking, best-effort)
	go func() {
		_ = fluvio.Get().ProduceSettlement(r.Context(), fluvio.SettlementStreamEvent{
			EventID:      uuid.NewString(),
			SettlementID: req.SettlementID,
			MerchantID:   req.MerchantID,
			Status:       "processing",
			BatchRef:     req.Reference,
			OccurredAt:   time.Now().UTC(),
		})
	}()

	writeJSON(w, http.StatusOK, types.SettlementTriggerResponse{
		SettlementID:  req.SettlementID,
		LedgerEntryID: releaseID.String(),
		Status:        "processing",
		Message:       fmt.Sprintf("merchant balance after settlement: %d %s; workflow: %s", newBalance, req.Currency, workflowID),
	})
}
