// tier1to5_lending.go — Tier 1a Merchant Lending routes proxied from
// server/tier1to5Router.ts (paths /lending/*). All mutations persist to
// merchant_loans / loan_offers / loan_instalments / loan_repayments.
package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// ─── Request types ────────────────────────────────────────────────────────────

type t5LoanApplyRequest struct {
	MerchantID          string `json:"merchant_id"`
	RequestedAmountKobo int64  `json:"requested_amount_kobo"`
	PurposeCode         string `json:"purpose_code"`
	RepaymentDays       int    `json:"repayment_days"`
	Notes               string `json:"notes"`
}

type t5LoanAcceptRequest struct {
	OfferID       string `json:"offer_id"`
	ApplicationID string `json:"application_id"`
	MerchantID    string `json:"merchant_id"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// T5ApplyForLoan handles POST /lending/apply.
func T5ApplyForLoan(w http.ResponseWriter, r *http.Request) {
	var req t5LoanApplyRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.RequestedAmountKobo <= 0 || req.RepaymentDays < 1 {
		respondError(w, http.StatusBadRequest, "merchant_id, requested_amount_kobo>0 and repayment_days>=1 are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	loanID := uuid.New().String()

	if err := db.T5CreateLoanApplication(ctx, loanID, req.MerchantID, req.RequestedAmountKobo, req.PurposeCode, req.RepaymentDays, req.Notes); err != nil {
		slog.Error("t5 lending: persist application failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist loan application")
		return
	}

	// Auto-generate one offer so /lending/offers returns real persisted terms.
	// Rate band derived from term length; amount approved in full at application
	// stage (underwriting adjusts on accept).
	ratePct := "24.0"
	if req.RepaymentDays > 180 {
		ratePct = "28.5"
	}
	offerID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(72 * time.Hour)
	if err := db.T5CreateLoanOffer(ctx, offerID, loanID, req.MerchantID, req.RequestedAmountKobo, ratePct, req.RepaymentDays, expiresAt); err != nil {
		slog.Error("t5 lending: persist offer failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist loan offer")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":     "loan.applied",
			"loan_id":        loanID,
			"merchant_id":    req.MerchantID,
			"requested_kobo": req.RequestedAmountKobo,
			"purpose_code":   req.PurposeCode,
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"application_id":        loanID,
		"loan_id":               loanID,
		"merchant_id":           req.MerchantID,
		"status":                "pending_review",
		"requested_amount_kobo": req.RequestedAmountKobo,
		"offer_id":              offerID,
		"offer_expires_at":      expiresAt.Format(time.RFC3339),
	})
}

// T5ListLoanApplications handles GET /lending/applications?merchant_id=
func T5ListLoanApplications(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	apps, err := pgdb.Get().T5ListLoanApplications(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 lending: list applications failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list loan applications")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"applications": apps})
}

// T5GetLoanOffers handles GET /lending/offers?application_id=&merchant_id=
func T5GetLoanOffers(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	applicationID, merchantID := q.Get("application_id"), q.Get("merchant_id")
	if applicationID == "" || merchantID == "" {
		respondError(w, http.StatusBadRequest, "application_id and merchant_id are required")
		return
	}
	offers, err := pgdb.Get().T5ListLoanOffers(r.Context(), applicationID, merchantID)
	if err != nil {
		slog.Error("t5 lending: list offers failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list loan offers")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"offers": offers})
}

// T5AcceptLoanOffer handles POST /lending/accept. Idempotent: accepting an
// already-accepted offer returns the current loan state (200), not an error.
func T5AcceptLoanOffer(w http.ResponseWriter, r *http.Request) {
	var req t5LoanAcceptRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.OfferID == "" || req.ApplicationID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "offer_id, application_id and merchant_id are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()

	offer, err := db.T5GetLoanOffer(ctx, req.OfferID, req.MerchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "offer not found")
		return
	}
	if err != nil {
		slog.Error("t5 lending: fetch offer failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch offer")
		return
	}
	if fmt.Sprint(offer["application_id"]) != req.ApplicationID {
		respondError(w, http.StatusBadRequest, "offer does not belong to application_id")
		return
	}

	if fmt.Sprint(offer["status"]) != "accepted" {
		amountKobo, _ := parseInt64Loose(offer["amount_kobo"])
		err = db.T5AcceptLoanOffer(ctx, req.OfferID, req.ApplicationID, req.MerchantID,
			amountKobo, fmt.Sprint(offer["rate_annual_pct"]), int(parseInt64Loose2(offer["term_days"])))
		if err == sql.ErrNoRows {
			respondError(w, http.StatusConflict, "offer is not open (already accepted or expired)")
			return
		}
		if err != nil {
			slog.Error("t5 lending: accept offer failed", "err", err)
			respondError(w, http.StatusInternalServerError, "failed to accept offer")
			return
		}
		kafka.GetProducer().Produce(kafka.Message{
			Topic: "paygate.lending",
			Key:   req.ApplicationID,
			Value: map[string]interface{}{
				"event_type":  "loan.accepted",
				"loan_id":     req.ApplicationID,
				"offer_id":    req.OfferID,
				"merchant_id": req.MerchantID,
				"timestamp":   time.Now().UTC().Format(time.RFC3339),
			},
		})
	}

	loan, instalments, _, err := db.T5GetLoanRepayment(ctx, req.ApplicationID, req.MerchantID)
	if err != nil {
		slog.Error("t5 lending: fetch post-accept loan failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch loan state")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"loan_id":     req.ApplicationID,
		"offer_id":    req.OfferID,
		"status":      loan["status"],
		"loan":        loan,
		"instalments": instalments,
	})
}

// T5GetLoanRepayment handles GET /lending/repayment?loan_id=&merchant_id=
func T5GetLoanRepayment(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	loanID, merchantID := q.Get("loan_id"), q.Get("merchant_id")
	if loanID == "" || merchantID == "" {
		respondError(w, http.StatusBadRequest, "loan_id and merchant_id are required")
		return
	}
	loan, instalments, repayments, err := pgdb.Get().T5GetLoanRepayment(r.Context(), loanID, merchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "loan not found")
		return
	}
	if err != nil {
		slog.Error("t5 lending: repayment schedule failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch repayment schedule")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"loan":        loan,
		"instalments": instalments,
		"repayments":  repayments,
	})
}

// T5GetCreditScore handles GET /lending/credit-score?merchant_id=
// Deterministic score (300–850) derived from real persisted metrics.
func T5GetCreditScore(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	metrics, err := pgdb.Get().T5MerchantCreditMetrics(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 lending: credit metrics failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to compute credit score")
		return
	}
	gmv, _ := parseInt64Loose(metrics["gmv_30d_kobo"])
	txCount, _ := parseInt64Loose(metrics["tx_count_90d"])
	outstanding, _ := parseInt64Loose(metrics["outstanding_kobo"])
	completion, _ := metrics["completion_rate"].(float64)

	score := 300.0 + completion*200.0
	score += float64(min64(gmv/100000000, 150))        // up to +150 for ≥₦1.5m 30d GMV
	score += float64(min64(txCount*2, 100))            // up to +100 for activity
	score -= float64(min64(outstanding/50000000, 100)) // debt burden penalty
	if score < 300 {
		score = 300
	}
	if score > 850 {
		score = 850
	}
	band := "D"
	switch {
	case score >= 750:
		band = "A"
	case score >= 650:
		band = "B"
	case score >= 500:
		band = "C"
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"merchant_id":  merchantID,
		"credit_score": int(score),
		"risk_band":    band,
		"metrics":      metrics,
		"computed_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

func min64(a, b int64) int64 {
	if a < b {
		return a
	}
	return b
}

// parseInt64Loose converts a JSON-decoded DB value (int64/float64/string) to int64.
func parseInt64Loose(v interface{}) (int64, error) {
	switch t := v.(type) {
	case int64:
		return t, nil
	case float64:
		return int64(t), nil
	case string:
		var n int64
		_, err := fmt.Sscan(t, &n)
		return n, err
	default:
		return 0, fmt.Errorf("unsupported numeric type %T", v)
	}
}

func parseInt64Loose2(v interface{}) int64 {
	n, _ := parseInt64Loose(v)
	return n
}
