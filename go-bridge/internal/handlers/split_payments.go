// Package handlers — Split Payments & Multi-Party Settlements
// Implements atomic multi-leg TigerBeetle transfers for marketplace splits.
// A single payment is split across multiple merchant accounts atomically.
// Integrates with Kafka, Dapr, and Permify.
package handlers

import (
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// ─── Types ────────────────────────────────────────────────────────────────────

type SplitRecipient struct {
	MerchantID  string  `json:"merchant_id"`
	Label       string  `json:"label"`       // e.g. "seller", "platform_fee", "logistics"
	SharePct    float64 `json:"share_pct"`   // percentage of total (must sum to 100)
	FixedKobo   uint64  `json:"fixed_kobo"`  // fixed amount override (0 = use share_pct)
}

type CreateSplitRuleRequest struct {
	RuleName    string           `json:"rule_name"`
	Description string           `json:"description"`
	Recipients  []SplitRecipient `json:"recipients"`
	CreatedBy   string           `json:"created_by"`
}

type ExecuteSplitPaymentRequest struct {
	SplitRuleID    string `json:"split_rule_id"`
	TotalAmountKobo uint64 `json:"total_amount_kobo"`
	SourceAccountID string `json:"source_account_id"` // payer account
	Reference      string `json:"reference"`
	Metadata       map[string]interface{} `json:"metadata,omitempty"`
}

type SplitLeg struct {
	MerchantID  string `json:"merchant_id"`
	Label       string `json:"label"`
	AmountKobo  uint64 `json:"amount_kobo"`
	TransferID  string `json:"transfer_id"`
	Status      string `json:"status"`
}

type ExecuteSplitPaymentResponse struct {
	SplitPaymentID string     `json:"split_payment_id"`
	SplitRuleID    string     `json:"split_rule_id"`
	TotalAmountKobo uint64    `json:"total_amount_kobo"`
	Legs           []SplitLeg `json:"legs"`
	Status         string     `json:"status"`
	ExecutedAt     string     `json:"executed_at"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// CreateSplitRule creates a new split payment rule.
func CreateSplitRule(w http.ResponseWriter, r *http.Request) {
	var req CreateSplitRuleRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	// Validate percentages sum to 100
	totalPct := 0.0
	for _, r := range req.Recipients {
		if r.FixedKobo == 0 {
			totalPct += r.SharePct
		}
	}
	// Allow some floating point tolerance
	if totalPct > 0 && (totalPct < 99.9 || totalPct > 100.1) {
		http.Error(w, `{"error":"recipient share percentages must sum to 100"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	ruleID := uuid.New().String()

	if err := pgdb.CreateSplitRule(ctx, pgdb.SplitRuleRecord{
		RuleID:      ruleID,
		RuleName:    req.RuleName,
		Description: req.Description,
		Recipients:  req.Recipients,
		CreatedBy:   req.CreatedBy,
		IsActive:    true,
	}); err != nil {
		slog.Error("failed to create split rule", "err", err)
		http.Error(w, `{"error":"failed to create split rule"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	json.NewEncoder(w).Encode(map[string]interface{}{
		"rule_id":     ruleID,
		"rule_name":   req.RuleName,
		"status":      "active",
		"created_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// ExecuteSplitPayment executes an atomic multi-leg TigerBeetle transfer.
// All legs succeed or all fail — atomicity guaranteed by TigerBeetle linked transfers.
func ExecuteSplitPayment(w http.ResponseWriter, r *http.Request) {
	var req ExecuteSplitPaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.TotalAmountKobo == 0 || req.SplitRuleID == "" {
		http.Error(w, `{"error":"split_rule_id and total_amount_kobo are required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Load split rule
	rule, err := pgdb.GetSplitRule(ctx, req.SplitRuleID)
	if err != nil {
		http.Error(w, `{"error":"split rule not found"}`, http.StatusNotFound)
		return
	}
	if !rule.IsActive {
		http.Error(w, `{"error":"split rule is inactive"}`, http.StatusConflict)
		return
	}

	// Calculate split amounts
	legs, err := calculateSplitLegs(rule.Recipients, req.TotalAmountKobo)
	if err != nil {
		http.Error(w, fmt.Sprintf(`{"error":"%s"}`, err.Error()), http.StatusBadRequest)
		return
	}

	// Build TigerBeetle linked transfer batch
	// Linked transfers: all succeed or all fail atomically
	splitPaymentID := uuid.New().String()
	sourceAccountID := tb.ParseAccountID(req.SourceAccountID)
	transfers := make([]tb.TransferRequest, len(legs))

	for i, leg := range legs {
		transferID := uuid.New()
		tbTransferID, _ := tb.UUIDToUint128(transferID)
		merchantAccountID := tb.MerchantAccountID(leg.MerchantID)

		flags := uint16(0)
		if i < len(legs)-1 {
			flags = tb.FlagLinked // link all but the last transfer
		}

		transfers[i] = tb.TransferRequest{
			ID:              tbTransferID,
			DebitAccountID:  sourceAccountID,
			CreditAccountID: merchantAccountID,
			Amount:          leg.AmountKobo,
			Code:            uint16(40), // CodeSplitPayment
			Ledger:          1,
			Flags:           flags,
			UserData128:     tbTransferID,
		}
		legs[i].TransferID = transferID.String()
	}

	// Execute atomic batch
	if err := tb.ExecuteLinkedTransfers(ctx, transfers); err != nil {
		slog.Error("split payment TigerBeetle batch failed",
			"split_payment_id", splitPaymentID,
			"err", err,
		)
		http.Error(w, `{"error":"split payment execution failed"}`, http.StatusInternalServerError)
		return
	}

	// Mark all legs as completed
	for i := range legs {
		legs[i].Status = "completed"
	}

	// Persist split payment record
	if err := pgdb.RecordSplitPayment(ctx, pgdb.SplitPaymentRecord{
		SplitPaymentID:  splitPaymentID,
		SplitRuleID:     req.SplitRuleID,
		TotalAmountKobo: req.TotalAmountKobo,
		Reference:       req.Reference,
		Legs:            legs,
		Status:          "completed",
	}); err != nil {
		slog.Error("failed to persist split payment", "err", err)
	}

	// Publish Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.split_payments",
		Key:   splitPaymentID,
		Value: map[string]interface{}{
			"event_type":       "split.payment.executed",
			"split_payment_id": splitPaymentID,
			"split_rule_id":    req.SplitRuleID,
			"total_amount_kobo": req.TotalAmountKobo,
			"leg_count":        len(legs),
			"reference":        req.Reference,
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("split payment executed",
		"split_payment_id", splitPaymentID,
		"total_kobo", req.TotalAmountKobo,
		"legs", len(legs),
	)

	resp := ExecuteSplitPaymentResponse{
		SplitPaymentID:  splitPaymentID,
		SplitRuleID:     req.SplitRuleID,
		TotalAmountKobo: req.TotalAmountKobo,
		Legs:            legs,
		Status:          "completed",
		ExecutedAt:      time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// GetSplitLedger returns the split payment history for a merchant.
func GetSplitLedger(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		http.Error(w, `{"error":"merchant_id is required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()
	records, err := pgdb.GetSplitPaymentsByMerchant(ctx, merchantID, 50)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch split ledger"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"merchant_id": merchantID,
		"records":     records,
		"count":       len(records),
	})
}

// TriggerSplitSettlement triggers settlement for all pending split payments.
func TriggerSplitSettlement(w http.ResponseWriter, r *http.Request) {
	ctx := r.Context()

	pending, err := pgdb.GetPendingSplitSettlements(ctx)
	if err != nil {
		http.Error(w, `{"error":"failed to fetch pending settlements"}`, http.StatusInternalServerError)
		return
	}

	settled := 0
	for _, s := range pending {
		if err := pgdb.MarkSplitSettled(ctx, s.SplitPaymentID); err == nil {
			kafka.GetProducer().Produce(kafka.Message{
				Topic: "paygate.split_payments",
				Key:   s.SplitPaymentID,
				Value: map[string]interface{}{
					"event_type":       "split.settlement.triggered",
					"split_payment_id": s.SplitPaymentID,
					"timestamp":        time.Now().UTC().Format(time.RFC3339),
				},
			})
			settled++
		}
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"settled_count": settled,
		"total_pending": len(pending),
		"triggered_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func calculateSplitLegs(recipients interface{}, totalKobo uint64) ([]SplitLeg, error) {
	// Type-assert recipients from DB record
	recs, ok := recipients.([]SplitRecipient)
	if !ok {
		return nil, fmt.Errorf("invalid recipients format")
	}

	legs := make([]SplitLeg, 0, len(recs))
	allocated := uint64(0)

	for i, rec := range recs {
		var amount uint64
		if rec.FixedKobo > 0 {
			amount = rec.FixedKobo
		} else {
			amount = uint64(float64(totalKobo) * rec.SharePct / 100.0)
		}

		// Last recipient gets any rounding remainder
		if i == len(recs)-1 {
			remainder := totalKobo - allocated
			if remainder > 0 {
				amount = remainder
			}
		}

		if amount == 0 {
			continue
		}

		allocated += amount
		legs = append(legs, SplitLeg{
			MerchantID: rec.MerchantID,
			Label:      rec.Label,
			AmountKobo: amount,
			Status:     "pending",
		})
	}

	if allocated > totalKobo {
		return nil, fmt.Errorf("split amounts (%d) exceed total (%d)", allocated, totalKobo)
	}

	return legs, nil
}
