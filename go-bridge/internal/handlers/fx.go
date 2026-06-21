package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/pkg/types"
)

// RecordFXConversion handles POST /v1/fx/convert
//
// Flow:
//  1. Idempotency check (Redis)
//  2. TigerBeetle: debit merchant source-currency account
//  3. TigerBeetle: credit merchant target-currency account
//  4. TigerBeetle: debit fee from source account to fee pool
//  5. Publish Kafka fx.conversion event
//
// Each currency has its own TigerBeetle ledger (NGN=1, USD=2, GHS=3, etc.)
// so the two transfers operate on different ledgers — this is correct
// double-entry: the FX spread is captured in the fee pool.
func RecordFXConversion(w http.ResponseWriter, r *http.Request) {
	var req types.FXConversionRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.ConversionID == "" || req.MerchantID == "" ||
		req.SourceCurrency == "" || req.TargetCurrency == "" ||
		req.SourceAmount == 0 || req.TargetAmount == 0 {
		writeError(w, http.StatusBadRequest,
			"conversion_id, merchant_id, source_currency, target_currency, source_amount, and target_amount are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	isDuplicate, _ := rdb.CheckAndSetIdempotency(ctx, "fx.convert", req.ConversionID)
	if isDuplicate {
		writeJSON(w, http.StatusOK, types.FXConversionResponse{
			ConversionID:  req.ConversionID,
			LedgerEntryID: "idempotent",
			Status:        "already_converted",
		})
		return
	}

	client := tb.GetActive()

	sourceLedger := tb.CurrencyToLedger(req.SourceCurrency)
	targetLedger := tb.CurrencyToLedger(req.TargetCurrency)

	merchantID, err := tb.UUIDToID(req.MerchantID)
	if err != nil {
		writeError(w, http.StatusBadRequest, fmt.Sprintf("invalid merchant_id: %v", err))
		return
	}
	floatID := tb.FloatAccountID()
	feePoolID := tb.ReferenceToID("fee-pool-global")

	// Ensure all accounts exist
	if err := client.EnsureAccount(merchantID, sourceLedger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant source account")
		return
	}
	if err := client.EnsureAccount(merchantID, targetLedger, tb.CodeWallet); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure merchant target account")
		return
	}
	if err := client.EnsureAccount(floatID, sourceLedger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float source account")
		return
	}
	if err := client.EnsureAccount(floatID, targetLedger, tb.CodeFloat); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure float target account")
		return
	}
	if err := client.EnsureAccount(feePoolID, sourceLedger, tb.CodeFeePool); err != nil {
		writeError(w, http.StatusInternalServerError, "failed to ensure fee pool account")
		return
	}

	// Step 1: Debit merchant source currency → float (source ledger)
	debitRef := "fx-debit-" + req.ConversionID
	debitID := tb.ReferenceToID(debitRef)
	totalDebit := req.SourceAmount + req.Fee
	if err := client.Transfer(debitID, merchantID, floatID, totalDebit, sourceLedger, tb.CodeFloat); err != nil {
		slog.Error("[fx] source debit failed", "err", err, "conversion_id", req.ConversionID)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("FX source debit failed: %v", err))
		return
	}

	// Step 2: Credit merchant target currency from float (target ledger)
	creditRef := "fx-credit-" + req.ConversionID
	creditID := tb.ReferenceToID(creditRef)
	if err := client.Transfer(creditID, floatID, merchantID, req.TargetAmount, targetLedger, tb.CodeWallet); err != nil {
		slog.Error("[fx] target credit failed", "err", err, "conversion_id", req.ConversionID)
		writeError(w, http.StatusInternalServerError,
			fmt.Sprintf("FX target credit failed: %v", err))
		return
	}

	// Step 3: Move fee to fee pool (source ledger)
	if req.Fee > 0 {
		feeRef := "fx-fee-" + req.ConversionID
		feeID := tb.ReferenceToID(feeRef)
		if err := client.Transfer(feeID, floatID, feePoolID, req.Fee, sourceLedger, tb.CodeFeePool); err != nil {
			slog.Warn("[fx] fee transfer failed", "err", err, "conversion_id", req.ConversionID)
			// Non-fatal: fee collection failure should not block the conversion
		}
	}

	ledgerEntryID := creditID.String()

	// Publish Kafka fx.conversion
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.fx.conversion",
			req.MerchantID, map[string]any{
				"event_id":        uuid.NewString(),
				"conversion_id":   req.ConversionID,
				"merchant_id":     req.MerchantID,
				"source_currency": req.SourceCurrency,
				"target_currency": req.TargetCurrency,
				"source_amount":   req.SourceAmount,
				"target_amount":   req.TargetAmount,
				"exchange_rate":   req.ExchangeRate,
				"fee":             req.Fee,
				"ledger_entry_id": ledgerEntryID,
				"occurred_at":     time.Now().UTC(),
			})
	}()

	slog.Info("[fx] conversion recorded",
		"conversion_id", req.ConversionID,
		"merchant_id", req.MerchantID,
		"source", fmt.Sprintf("%d %s", req.SourceAmount, req.SourceCurrency),
		"target", fmt.Sprintf("%d %s", req.TargetAmount, req.TargetCurrency),
		"ledger_entry_id", ledgerEntryID,
	)

	writeJSON(w, http.StatusOK, types.FXConversionResponse{
		ConversionID:  req.ConversionID,
		LedgerEntryID: ledgerEntryID,
		Status:        "converted",
	})
}
