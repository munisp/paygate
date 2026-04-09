// Package handlers — Dynamic Currency Conversion (DCC)
// Provides real-time FX rate lookup, DCC conversion execution, and margin configuration.
// Rates are streamed via Fluvio from the Python fx-rate-feed service.
// Integrates with TigerBeetle for atomic FX settlement.
package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type DCCRateRequest struct {
	FromCurrency string `json:"from_currency"` // e.g. "USD"
	ToCurrency   string `json:"to_currency"`   // e.g. "NGN"
	AmountKobo   uint64 `json:"amount_kobo"`   // amount in source currency smallest unit
	MerchantID   string `json:"merchant_id"`
}

type DCCRateResponse struct {
	FromCurrency    string  `json:"from_currency"`
	ToCurrency      string  `json:"to_currency"`
	MidRate         float64 `json:"mid_rate"`
	CustomerRate    float64 `json:"customer_rate"` // mid_rate + merchant margin
	MarginPct       float64 `json:"margin_pct"`
	SourceAmountKobo uint64 `json:"source_amount_kobo"`
	TargetAmountKobo uint64 `json:"target_amount_kobo"`
	RateExpiresAt   string  `json:"rate_expires_at"` // 60-second lock
	QuoteID         string  `json:"quote_id"`
}

type DCCConversionRequest struct {
	QuoteID         string `json:"quote_id"`
	MerchantID      string `json:"merchant_id"`
	CustomerID      string `json:"customer_id"`
	SourceAmountKobo uint64 `json:"source_amount_kobo"`
	Reference       string `json:"reference"`
}

type DCCMarginConfigRequest struct {
	MerchantID  string             `json:"merchant_id"`
	Margins     map[string]float64 `json:"margins"` // currency_pair -> margin_pct, e.g. "USD/NGN" -> 2.5
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// GetDCCRate returns a locked DCC rate quote for a currency pair.
func GetDCCRate(w http.ResponseWriter, r *http.Request) {
	var req DCCRateRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	pair := fmt.Sprintf("%s/%s", req.FromCurrency, req.ToCurrency)

	// Try Redis cache for live rate (published by Fluvio consumer)
	var cachedRate struct {
		MidRate   float64 `json:"mid_rate"`
		UpdatedAt string  `json:"updated_at"`
	}
	rateKey := fmt.Sprintf("dcc:rate:%s", pair)
	if err := redis.GetJSON(ctx, rateKey, &cachedRate); err != nil {
		// Fall back to DB rates table
		dbRate, err := pgdb.GetLatestFXRate(ctx, req.FromCurrency, req.ToCurrency)
		if err != nil {
			http.Error(w, `{"error":"rate not available for this currency pair"}`, http.StatusNotFound)
			return
		}
		cachedRate.MidRate = dbRate.Rate
	}

	// Get merchant DCC margin config
	marginPct := 2.5 // default 2.5% margin
	if config, err := pgdb.GetDCCMarginConfig(ctx, req.MerchantID, pair); err == nil {
		marginPct = config.MarginPct
	}

	customerRate := cachedRate.MidRate * (1 + marginPct/100.0)
	targetAmountKobo := uint64(float64(req.AmountKobo) * customerRate)

	quoteID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(60 * time.Second)

	// Lock the quote in Redis for 60 seconds
	redis.SetJSON(ctx, fmt.Sprintf("dcc:quote:%s", quoteID), map[string]interface{}{
		"merchant_id":       req.MerchantID,
		"from_currency":     req.FromCurrency,
		"to_currency":       req.ToCurrency,
		"mid_rate":          cachedRate.MidRate,
		"customer_rate":     customerRate,
		"margin_pct":        marginPct,
		"source_amount_kobo": req.AmountKobo,
		"target_amount_kobo": targetAmountKobo,
		"expires_at":        expiresAt.Format(time.RFC3339),
	}, 65*time.Second)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(DCCRateResponse{
		FromCurrency:     req.FromCurrency,
		ToCurrency:       req.ToCurrency,
		MidRate:          cachedRate.MidRate,
		CustomerRate:     customerRate,
		MarginPct:        marginPct,
		SourceAmountKobo: req.AmountKobo,
		TargetAmountKobo: targetAmountKobo,
		RateExpiresAt:    expiresAt.Format(time.RFC3339),
		QuoteID:          quoteID,
	})
}

// ExecuteDCCConversion executes a DCC conversion using a locked quote.
func ExecuteDCCConversion(w http.ResponseWriter, r *http.Request) {
	var req DCCConversionRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Validate quote
	var quote map[string]interface{}
	if err := redis.GetJSON(ctx, fmt.Sprintf("dcc:quote:%s", req.QuoteID), &quote); err != nil {
		http.Error(w, `{"error":"quote expired or not found"}`, http.StatusGone)
		return
	}

	targetAmountKobo := uint64(quote["target_amount_kobo"].(float64))
	customerRate := quote["customer_rate"].(float64)
	fromCurrency := quote["from_currency"].(string)
	toCurrency := quote["to_currency"].(string)

	// TigerBeetle: FX conversion transfer
	// Debit customer in source currency, credit merchant in target currency
	conversionID := uuid.New()
	tbConversionID, _ := tb.UUIDToUint128(conversionID)
	customerAccountID := tb.CustomerAccountID(req.CustomerID)
	merchantAccountID := tb.MerchantAccountID(req.MerchantID)

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbConversionID,
		DebitAccountID:  customerAccountID,
		CreditAccountID: merchantAccountID,
		Amount:          targetAmountKobo,
		Code:            uint16(60), // CodeDCCConversion
		Ledger:          1,
		UserData128:     tbConversionID,
	}); err != nil {
		slog.Error("DCC TigerBeetle transfer failed", "quote_id", req.QuoteID, "err", err)
		http.Error(w, `{"error":"conversion execution failed"}`, http.StatusInternalServerError)
		return
	}

	// Persist DCC transaction
	dccTxID := uuid.New().String()
	pgdb.RecordDCCTransaction(ctx, pgdb.DCCTransactionRecord{
		DCCTXID:          dccTxID,
		QuoteID:          req.QuoteID,
		MerchantID:       req.MerchantID,
		CustomerID:       req.CustomerID,
		FromCurrency:     fromCurrency,
		ToCurrency:       toCurrency,
		MidRate:          quote["mid_rate"].(float64),
		CustomerRate:     customerRate,
		MarginPct:        quote["margin_pct"].(float64),
		SourceAmountKobo: req.SourceAmountKobo,
		TargetAmountKobo: targetAmountKobo,
		Reference:        req.Reference,
		TransferID:       conversionID.String(),
	})

	// Consume quote (prevent reuse)
	redis.Delete(ctx, fmt.Sprintf("dcc:quote:%s", req.QuoteID))

	// Publish to Fluvio dcc-conversions topic
	fluvio.Produce("dcc-conversions", map[string]interface{}{
		"event_type":        "dcc.conversion.executed",
		"dcc_tx_id":         dccTxID,
		"merchant_id":       req.MerchantID,
		"from_currency":     fromCurrency,
		"to_currency":       toCurrency,
		"customer_rate":     customerRate,
		"source_amount_kobo": req.SourceAmountKobo,
		"target_amount_kobo": targetAmountKobo,
		"timestamp":         time.Now().UTC().Format(time.RFC3339),
	})

	// Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.dcc",
		Key:   dccTxID,
		Value: map[string]interface{}{
			"event_type":        "dcc.conversion.executed",
			"dcc_tx_id":         dccTxID,
			"merchant_id":       req.MerchantID,
			"from_currency":     fromCurrency,
			"to_currency":       toCurrency,
			"target_amount_kobo": targetAmountKobo,
			"timestamp":         time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("DCC conversion executed",
		"dcc_tx_id", dccTxID,
		"pair", fmt.Sprintf("%s/%s", fromCurrency, toCurrency),
		"rate", customerRate,
		"amount_kobo", targetAmountKobo,
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"dcc_tx_id":         dccTxID,
		"from_currency":     fromCurrency,
		"to_currency":       toCurrency,
		"customer_rate":     customerRate,
		"source_amount_kobo": req.SourceAmountKobo,
		"target_amount_kobo": targetAmountKobo,
		"transfer_id":       conversionID.String(),
		"status":            "completed",
		"executed_at":       time.Now().UTC().Format(time.RFC3339),
	})
}

// GetDCCMarginConfig returns the DCC margin configuration for a merchant.
func GetDCCMarginConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		http.Error(w, `{"error":"merchant_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	configs, err := pgdb.GetAllDCCMarginConfigs(ctx, merchantID)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch margin configs"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"merchant_id": merchantID,
		"margins":     configs,
	})
}

// UpdateDCCMarginConfig updates the DCC margin for a merchant and currency pair.
func UpdateDCCMarginConfig(w http.ResponseWriter, r *http.Request) {
	var req DCCMarginConfigRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	for pair, marginPct := range req.Margins {
		if marginPct < 0 || marginPct > 10 {
			http.Error(w, fmt.Sprintf(`{"error":"margin for %s must be between 0 and 10%%"}`, pair), http.StatusBadRequest)
			return
		}
		if err := pgdb.UpsertDCCMarginConfig(ctx, req.MerchantID, pair, marginPct); err != nil {
			slog.Error("failed to update DCC margin", "pair", pair, "err", err)
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"merchant_id": req.MerchantID,
		"updated":     len(req.Margins),
		"status":      "ok",
	})
}
