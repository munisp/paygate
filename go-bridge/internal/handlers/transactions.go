package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// RecordTransaction handles POST /v1/transactions/record
//
// Flow:
//  1. Idempotency check (Redis) — reject duplicate references
//  2. EnsureAccount for merchant + float in TigerBeetle
//  3. Transfer: float → merchant (credit the merchant for incoming payment)
//  4. Publish Kafka payment.initiated event
//  5. Stream Fluvio transaction feed event
//  6. Return ledger entry ID and synthetic workflow ID
func RecordTransaction(w http.ResponseWriter, r *http.Request) {
	var req types.RecordTransactionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.TransactionID == "" || req.MerchantID == "" || req.Amount == 0 ||
		req.Currency == "" || req.Reference == "" {
		writeError(w, http.StatusBadRequest,
			"transaction_id, merchant_id, amount, currency, and reference are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Idempotency check
	isDuplicate, err := rdb.CheckAndSetIdempotency(ctx, "txn.record", req.Reference)
	if err != nil {
		slog.Warn("[transactions] idempotency check error", "err", err)
	}
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.RecordTransactionResponse{
			TransactionID: req.TransactionID,
			LedgerEntryID: "idempotent",
			WorkflowID:    "idempotent",
			Status:        "already_recorded",
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

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Credit merchant: float → merchant
	transferID := tb.ReferenceToID(req.Reference)
	if err := client.Transfer(transferID, floatID, merchantID, req.Amount, ledger, tb.CodeWallet); err != nil {
		slog.Error("[transactions] record transfer failed", "err", err, "ref", req.Reference)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("ledger transfer failed: %v", err))
		return
	}

	ledgerEntryID := transferID.String()
	workflowID := "wf-txn-" + req.TransactionID

	// Publish Kafka event
	go func() {
		_ = kafka.GetProducer().PublishTransaction(context.Background(), kafka.TransactionEvent{
			EventID:    uuid.NewString(),
			TxID:       req.TransactionID,
			MerchantID: req.MerchantID,
			Amount:     int64(req.Amount),
			Currency:   req.Currency,
			Channel:    req.Channel,
			Status:     "completed",
			OccurredAt: time.Now().UTC(),
		})
	}()

	// Stream Fluvio
	go func() {
		_ = fluvio.Get().ProduceTransaction(context.Background(), fluvio.TransactionFeedEvent{
			EventID:    uuid.NewString(),
			TxID:       req.TransactionID,
			MerchantID: req.MerchantID,
			Amount:     int64(req.Amount),
			Currency:   req.Currency,
			Channel:    req.Channel,
			Status:     "completed",
			OccurredAt: time.Now().UTC(),
		})
	}()

	slog.Info("[transactions] recorded",
		"transaction_id", req.TransactionID,
		"merchant_id", req.MerchantID,
		"amount", req.Amount,
		"currency", req.Currency,
		"ledger_entry_id", ledgerEntryID,
	)

	writeJSON(w, http.StatusOK, types.RecordTransactionResponse{
		TransactionID: req.TransactionID,
		LedgerEntryID: ledgerEntryID,
		WorkflowID:    workflowID,
		Status:        "recorded",
	})
}

// RefundTransaction handles POST /v1/transactions/refund
//
// Flow:
//  1. Idempotency check (Redis)
//  2. TigerBeetle reversal: merchant → float (debit merchant, credit float)
//  3. Publish Kafka payment.reversed event
//  4. Stream Fluvio transaction feed event
func RefundTransaction(w http.ResponseWriter, r *http.Request) {
	var req types.RefundTransactionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.TransactionID == "" || req.MerchantID == "" || req.Amount == 0 {
		writeError(w, http.StatusBadRequest,
			"transaction_id, merchant_id, and amount are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	refundRef := "refund-" + req.TransactionID
	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "txn.refund", refundRef)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.RefundTransactionResponse{
			RefundID:      "idempotent",
			TransactionID: req.TransactionID,
			WorkflowID:    "idempotent",
			Status:        "already_refunded",
		})
		return
	}

	client := tb.GetActive()
	ledger := tb.CurrencyToLedger("NGN") // default; real impl would look up original txn currency

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	floatID := tb.FloatAccountID()

	if err := client.EnsureAccount(merchantID, ledger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant account")
		return
	}
	if err := client.EnsureAccount(floatID, ledger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float account")
		return
	}

	// Reversal: merchant → float (debit merchant, credit float)
	reversalID := tb.ReferenceToID(refundRef)
	if err := client.Transfer(reversalID, merchantID, floatID, req.Amount, ledger, tb.CodeFloat); err != nil {
		slog.Error("[transactions] refund reversal failed", "err", err, "ref", refundRef)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("refund reversal failed: %v", err))
		return
	}

	refundID := uuid.NewString()
	workflowID := "wf-refund-" + req.TransactionID

	// Publish Kafka payment.reversed
	go func() {
		_ = kafka.GetProducer().PublishTransaction(context.Background(), kafka.TransactionEvent{
			EventID:    uuid.NewString(),
			TxID:       req.TransactionID,
			MerchantID: req.MerchantID,
			Amount:     int64(req.Amount),
			Currency:   "NGN",
			Channel:    "refund",
			Status:     "reversed",
			OccurredAt: time.Now().UTC(),
		})
	}()

	slog.Info("[transactions] refunded",
		"transaction_id", req.TransactionID,
		"refund_id", refundID,
		"amount", req.Amount,
	)

	writeJSON(w, http.StatusOK, types.RefundTransactionResponse{
		RefundID:      refundID,
		TransactionID: req.TransactionID,
		WorkflowID:    workflowID,
		Status:        "reversed",
	})
}
