package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
	"github.com/paygate/go-bridge/internal/temporal"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	gotemporal "go.temporal.io/sdk/client"
	"github.com/paygate/go-bridge/pkg/types"
)

// CreateBNPLLoan handles POST /v1/bnpl/loans/create
//
// Flow:
//  1. Idempotency check (Redis)
//  2. EnsureAccount for merchant, BNPL escrow, and float in TigerBeetle
//  3. Reserve principal: float → BNPL escrow (locks the loan principal)
//  4. Store loan state in Redis (installment schedule)
//  5. Publish Kafka bnpl.loan_created event
//  6. Return reservation ID and synthetic workflow ID
//
// The BNPL escrow account is derived from the loan ID so each loan has
// its own isolated ledger account. Installments are committed by
// ProcessBNPLInstalment which moves funds from escrow → merchant.
func CreateBNPLLoan(w http.ResponseWriter, r *http.Request) {
	var req types.CreateBNPLLoanRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.LoanID == "" || req.MerchantID == "" || req.PrincipalAmount == 0 ||
		req.Currency == "" || req.Installments == 0 {
		writeError(w, http.StatusBadRequest,
			"loan_id, merchant_id, principal_amount, currency, and installments are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Idempotency
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "bnpl.create", req.LoanID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.CreateBNPLLoanResponse{
			LoanID:        req.LoanID,
			WorkflowID:    "idempotent",
			ReservationID: "idempotent",
			Status:        "already_created",
		})
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	floatID := tb.FloatAccountID()

	// BNPL escrow account is unique per loan
	escrowID, err := tb.UUIDToID(req.LoanID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid loan_id: %v", err))
		return
	}

	// Ensure accounts
	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}
	if err := client.EnsureAccount(escrowID, ledger, tb.CodeEscrow); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure BNPL escrow account")
		return
	}

	// Reserve principal: float → escrow
	reserveRef := "bnpl-reserve-" + req.LoanID
	reserveID := tb.ReferenceToID(reserveRef)
	if err := client.Transfer(reserveID, floatID, escrowID, req.PrincipalAmount, ledger, tb.CodeEscrow); err != nil {
		slog.Error("[bnpl] principal reservation failed", "err", err, "loan_id", req.LoanID)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("BNPL principal reservation failed: %v", err))
		return
	}

	reservationID := reserveID.String()

	// Store loan schedule in Redis
	_ = rdb.SetJSON(ctx, fmt.Sprintf("bnpl:loan:%s", req.LoanID), map[string]any{
		"loan_id":            req.LoanID,
		"merchant_id":        req.MerchantID,
		"currency":           req.Currency,
		"principal_amount":   req.PrincipalAmount,
		"installments":       req.Installments,
		"installment_amount": req.InstallmentAmount,
		"paid_installments":  0,
		"reservation_id":     reservationID,
		"created_at":         time.Now().UTC(),
	}, 365*24*time.Hour)

	// Publish Kafka bnpl.loan_created
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.bnpl.loan_created",
			req.MerchantID, map[string]any{
				"event_id":          uuid.NewString(),
				"loan_id":           req.LoanID,
				"merchant_id":       req.MerchantID,
				"customer_id":       req.CustomerID,
				"principal_amount":  req.PrincipalAmount,
				"currency":          req.Currency,
				"installments":      req.Installments,
				"reservation_id":    reservationID,
				"occurred_at":       time.Now().UTC(),
			})
	}()

	slog.Info("[bnpl] loan created",
		"loan_id", req.LoanID,
		"merchant_id", req.MerchantID,
		"principal", req.PrincipalAmount,
		"reservation_id", reservationID,
	)

	// Dispatch LoanDisbursementWorkflow via Temporal (BNPL variant)
	wfID := fmt.Sprintf("bnpl-loan-%s", req.LoanID)
	if tc, tcErr := temporal.GetClient(); tcErr == nil {
		wfInput := temporal.LoanDisbursementInput{
			LoanID:     req.LoanID,
			MerchantID: req.MerchantID,
			AmountKobo: req.PrincipalAmount,
		}
		opts := gotemporal.StartWorkflowOptions{ID: wfID, TaskQueue: temporal.TaskQueue}
		if run, wfErr := tc.ExecuteWorkflow(ctx, opts, temporal.LoanDisbursementWorkflow, wfInput); wfErr != nil {
			slog.Error("[bnpl] LoanDisbursementWorkflow start failed", "err", wfErr)
		} else {
			slog.Info("[bnpl] LoanDisbursementWorkflow started", "run_id", run.GetID())
		}
	}

	// Stream to Fluvio (non-blocking)
	go func() {
		_ = fluvio.Get().ProduceBNPLEvent(ctx, fluvio.BNPLFundFlowEvent{
			EventID:    uuid.NewString(),
			LoanID:     req.LoanID,
			MerchantID: req.MerchantID,
			EventType:  "loan_created",
			AmountKobo: int64(req.PrincipalAmount),
			OccurredAt: time.Now().UTC(),
		})
	}()

	writeJSON(w, http.StatusOK, types.CreateBNPLLoanResponse{
		LoanID:        req.LoanID,
		WorkflowID:    wfID,
		ReservationID: reservationID,
		Status:        "active",
	})
}

// ProcessBNPLInstalment handles POST /v1/bnpl/loans/{id}/instalment
//
// Flow:
//  1. Extract loan ID from URL path
//  2. Idempotency check (Redis, per instalment)
//  3. TigerBeetle: escrow → merchant (commit instalment payment)
//  4. Update loan state in Redis (increment paid_installments)
//  5. Publish Kafka bnpl.instalment event
func ProcessBNPLInstalment(w http.ResponseWriter, r *http.Request) {
	// Extract loan ID from URL path: /v1/bnpl/loans/{id}/instalment
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// parts: ["v1", "bnpl", "loans", "{id}", "instalment"]
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	loanID := parts[3]

	var req types.ProcessBNPLInstalmentRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MerchantID == "" || req.InstalmentNumber == 0 || req.Amount == 0 || req.Currency == "" {
		writeError(w, http.StatusBadRequest,
			"merchant_id, instalment_number, amount, and currency are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Idempotency per instalment
	instalmentRef := fmt.Sprintf("%s-inst-%d", loanID, req.InstalmentNumber)
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "bnpl.instalment", instalmentRef)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.ProcessBNPLInstalmentResponse{
			Success:       true,
			LedgerEntryID: "idempotent",
		})
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger(req.Currency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	escrowID, err := tb.UUIDToID(loanID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid loan_id: %v", err))
		return
	}

	// Ensure accounts
	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(escrowID, ledger, tb.CodeEscrow); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure BNPL escrow account")
		return
	}

	// Commit instalment: escrow → merchant
	commitRef := fmt.Sprintf("bnpl-inst-%s-%d", loanID, req.InstalmentNumber)
	commitID := tb.ReferenceToID(commitRef)
	if err := client.Transfer(commitID, escrowID, merchantID, req.Amount, ledger, tb.CodeWallet); err != nil {
		slog.Error("[bnpl] instalment commit failed",
			"err", err, "loan_id", loanID, "instalment", req.InstalmentNumber)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("instalment commit failed: %v", err))
		return
	}

	ledgerEntryID := commitID.String()

	// Update loan state in Redis
	var loanState map[string]any
	if found, _ := rdb.GetJSON(ctx, fmt.Sprintf("bnpl:loan:%s", loanID), &loanState); found {
		if paid, ok := loanState["paid_installments"].(float64); ok {
			loanState["paid_installments"] = int(paid) + 1
		}
		loanState["last_payment_at"] = time.Now().UTC()
		_ = rdb.SetJSON(ctx, fmt.Sprintf("bnpl:loan:%s", loanID), loanState, 365*24*time.Hour)
	}

	// Publish Kafka bnpl.instalment
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.bnpl.instalment",
			req.MerchantID, map[string]any{
				"event_id":          uuid.NewString(),
				"loan_id":           loanID,
				"merchant_id":       req.MerchantID,
				"instalment_number": req.InstalmentNumber,
				"amount":            req.Amount,
				"currency":          req.Currency,
				"ledger_entry_id":   ledgerEntryID,
				"occurred_at":       time.Now().UTC(),
			})
	}()

	slog.Info("[bnpl] instalment processed",
		"loan_id", loanID,
		"instalment", req.InstalmentNumber,
		"amount", req.Amount,
		"ledger_entry_id", ledgerEntryID,
	)

	writeJSON(w, http.StatusOK, types.ProcessBNPLInstalmentResponse{
		Success:       true,
		LedgerEntryID: ledgerEntryID,
	})
}
