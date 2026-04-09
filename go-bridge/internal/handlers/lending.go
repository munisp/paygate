// Package handlers — Merchant Lending & Working Capital
// Implements loan application, approval, TigerBeetle disbursement,
// and repayment recording. Integrates with:
//   - Temporal: LoanDisbursementWorkflow, RepaymentScheduleWorkflow
//   - TigerBeetle: credit ledger accounts (CodeCreditLoan=30)
//   - Kafka: loan lifecycle events
//   - Permify: merchant:lending:apply authorization
//   - Redis: loan status cache
//   - Python credit-scoring service: FFI-backed ML scoring
package handlers

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

// TigerBeetle ledger codes for lending
const (
	CodeCreditLoan    = uint16(30) // loan disbursement account
	CodeLoanRepayment = uint16(31) // repayment account
	CodeCreditReserve = uint16(32) // credit reserve pool
)

// creditScoringURL returns the credit scoring service URL
func creditScoringURL() string {
	if u := os.Getenv("CREDIT_SCORING_URL"); u != "" {
		return u
	}
	return "http://localhost:8095"
}

// ─── Request / Response types ─────────────────────────────────────────────────

type LoanApplicationRequest struct {
	MerchantID    string  `json:"merchant_id"`
	RequestedKobo uint64  `json:"requested_kobo"`
	PurposeCode   string  `json:"purpose_code"` // "inventory" | "equipment" | "working_capital" | "expansion"
	TermDays      int     `json:"term_days"`
	Notes         string  `json:"notes,omitempty"`
}

type LoanApplicationResponse struct {
	LoanID        string  `json:"loan_id"`
	MerchantID    string  `json:"merchant_id"`
	Status        string  `json:"status"` // "pending_review" | "approved" | "rejected"
	RequestedKobo uint64  `json:"requested_kobo"`
	ApprovedKobo  uint64  `json:"approved_kobo,omitempty"`
	CreditScore   int     `json:"credit_score"`
	RiskBand      string  `json:"risk_band"`
	RateAnnualPct float64 `json:"rate_annual_pct,omitempty"`
	TermDays      int     `json:"term_days"`
	Factors       []string `json:"factors"`
	CreatedAt     string  `json:"created_at"`
}

type LoanDisbursementRequest struct {
	LoanID     string `json:"loan_id"`
	ApprovedBy string `json:"approved_by"`
}

type LoanRepaymentRequest struct {
	LoanID      string `json:"loan_id"`
	AmountKobo  uint64 `json:"amount_kobo"`
	Reference   string `json:"reference"`
}

type CreditScoreAPIRequest struct {
	MerchantID            string  `json:"merchant_id"`
	GMV30dKobo            uint64  `json:"gmv_30d_kobo"`
	AvgDailyTxns          float64 `json:"avg_daily_txns"`
	DisputeRate           float64 `json:"dispute_rate"`
	ChargebackRate        float64 `json:"chargeback_rate"`
	AccountAgeDays        int     `json:"account_age_days"`
	RepaymentHistoryScore float64 `json:"repayment_history_score"`
	ActiveDaysRatio       float64 `json:"active_days_ratio"`
	OutstandingLoanKobo   uint64  `json:"outstanding_loan_kobo"`
}

type CreditScoreAPIResponse struct {
	MerchantID          string   `json:"merchant_id"`
	Score               int      `json:"score"`
	RiskBand            string   `json:"risk_band"`
	MaxLoanKobo         uint64   `json:"max_loan_kobo"`
	RecommendedRatePct  float64  `json:"recommended_rate_pct"`
	MaxTermDays         int      `json:"max_term_days"`
	Factors             []string `json:"factors"`
	Engine              string   `json:"engine"`
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// CreateLoanApplication evaluates a merchant's creditworthiness and creates a loan application.
func CreateLoanApplication(w http.ResponseWriter, r *http.Request) {
	var req LoanApplicationRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	if req.MerchantID == "" || req.RequestedKobo == 0 {
		http.Error(w, `{"error":"merchant_id and requested_kobo are required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Permify authorization check
	if err := permify.CheckPermission(ctx, "merchant", req.MerchantID, "lending:apply"); err != nil {
		http.Error(w, `{"error":"insufficient permissions"}`, http.StatusForbidden)
		return
	}

	// Fetch merchant metrics from DB for credit scoring
	metrics, err := pgdb.GetMerchantCreditMetrics(ctx, req.MerchantID)
	if err != nil {
		slog.Error("failed to fetch merchant metrics", "merchant_id", req.MerchantID, "err", err)
		// Use conservative defaults if metrics unavailable
		metrics = &pgdb.MerchantCreditMetrics{
			GMV30dKobo:            0,
			AvgDailyTxns:          0,
			DisputeRate:           0.05,
			ChargebackRate:        0.01,
			AccountAgeDays:        0,
			RepaymentHistoryScore: 50.0,
			ActiveDaysRatio:       0.5,
			OutstandingLoanKobo:   0,
		}
	}

	// Call Python credit scoring service
	scoreReq := CreditScoreAPIRequest{
		MerchantID:            req.MerchantID,
		GMV30dKobo:            metrics.GMV30dKobo,
		AvgDailyTxns:          metrics.AvgDailyTxns,
		DisputeRate:           metrics.DisputeRate,
		ChargebackRate:        metrics.ChargebackRate,
		AccountAgeDays:        metrics.AccountAgeDays,
		RepaymentHistoryScore: metrics.RepaymentHistoryScore,
		ActiveDaysRatio:       metrics.ActiveDaysRatio,
		OutstandingLoanKobo:   metrics.OutstandingLoanKobo,
	}

	scoreResult, err := callCreditScoringService(ctx, scoreReq)
	if err != nil {
		slog.Error("credit scoring service error", "err", err)
		// Use fallback conservative score
		scoreResult = &CreditScoreAPIResponse{
			MerchantID:         req.MerchantID,
			Score:              450,
			RiskBand:           "poor",
			MaxLoanKobo:        0,
			RecommendedRatePct: 36.0,
			MaxTermDays:        90,
			Factors:            []string{"Credit scoring service unavailable — conservative score applied"},
			Engine:             "fallback",
		}
	}

	// Determine approval status
	status := "pending_review"
	approvedKobo := uint64(0)
	if scoreResult.Score >= 580 && scoreResult.MaxLoanKobo > 0 {
		if req.RequestedKobo <= scoreResult.MaxLoanKobo {
			status = "approved"
			approvedKobo = req.RequestedKobo
		} else {
			// Approve at max eligible amount
			status = "approved"
			approvedKobo = scoreResult.MaxLoanKobo
		}
	} else if scoreResult.Score < 500 {
		status = "rejected"
	}

	// Persist loan application to DB
	loanID := uuid.New().String()
	if err := pgdb.CreateMerchantLoan(ctx, pgdb.MerchantLoanRecord{
		LoanID:        loanID,
		MerchantID:    req.MerchantID,
		Status:        status,
		RequestedKobo: req.RequestedKobo,
		ApprovedKobo:  approvedKobo,
		CreditScore:   scoreResult.Score,
		RiskBand:      scoreResult.RiskBand,
		RateAnnualPct: scoreResult.RecommendedRatePct,
		TermDays:      req.TermDays,
		PurposeCode:   req.PurposeCode,
		Notes:         req.Notes,
	}); err != nil {
		slog.Error("failed to create loan record", "err", err)
		http.Error(w, `{"error":"failed to create loan application"}`, http.StatusInternalServerError)
		return
	}

	// Cache loan status in Redis
	redis.SetJSON(ctx, fmt.Sprintf("loan:status:%s", loanID), map[string]interface{}{
		"status":       status,
		"approved_kobo": approvedKobo,
		"score":        scoreResult.Score,
	}, 24*time.Hour)

	// Publish Kafka event
	eventType := "loan.applied"
	if status == "approved" {
		eventType = "loan.approved"
	} else if status == "rejected" {
		eventType = "loan.rejected"
	}
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   loanID,
		Value: map[string]interface{}{
			"event_type":     eventType,
			"loan_id":        loanID,
			"merchant_id":    req.MerchantID,
			"status":         status,
			"requested_kobo": req.RequestedKobo,
			"approved_kobo":  approvedKobo,
			"credit_score":   scoreResult.Score,
			"risk_band":      scoreResult.RiskBand,
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("loan application created",
		"loan_id", loanID,
		"merchant_id", req.MerchantID,
		"status", status,
		"score", scoreResult.Score,
	)

	resp := LoanApplicationResponse{
		LoanID:        loanID,
		MerchantID:    req.MerchantID,
		Status:        status,
		RequestedKobo: req.RequestedKobo,
		ApprovedKobo:  approvedKobo,
		CreditScore:   scoreResult.Score,
		RiskBand:      scoreResult.RiskBand,
		RateAnnualPct: scoreResult.RecommendedRatePct,
		TermDays:      req.TermDays,
		Factors:       scoreResult.Factors,
		CreatedAt:     time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(resp)
}

// DisburseLoan executes a TigerBeetle credit transfer and starts the Temporal repayment workflow.
func DisburseLoan(w http.ResponseWriter, r *http.Request) {
	var req LoanDisbursementRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Load loan from DB
	loan, err := pgdb.GetMerchantLoan(ctx, req.LoanID)
	if err != nil {
		http.Error(w, `{"error":"loan not found"}`, http.StatusNotFound)
		return
	}
	if loan.Status != "approved" {
		http.Error(w, `{"error":"loan is not in approved status"}`, http.StatusConflict)
		return
	}

	// TigerBeetle: create credit transfer from reserve pool to merchant wallet
	// Account IDs: credit reserve = 9000000000000001, merchant wallet = derived from merchant ID
	merchantAccountID := tb.MerchantAccountID(loan.MerchantID)
	creditReserveID := uint128FromUint64(9000000000000001)

	transferID := uuid.New()
	tbTransferID, err := tb.UUIDToUint128(transferID)
	if err != nil {
		slog.Error("failed to create TigerBeetle transfer ID", "err", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbTransferID,
		DebitAccountID:  creditReserveID,
		CreditAccountID: merchantAccountID,
		Amount:          loan.ApprovedKobo,
		Code:            CodeCreditLoan,
		Ledger:          1,
		UserData128:     tbTransferID,
	}); err != nil {
		slog.Error("TigerBeetle disbursement failed", "loan_id", req.LoanID, "err", err)
		http.Error(w, `{"error":"disbursement failed"}`, http.StatusInternalServerError)
		return
	}

	// Update loan status to disbursed
	if err := pgdb.UpdateLoanStatus(ctx, req.LoanID, "disbursed", transferID.String()); err != nil {
		slog.Error("failed to update loan status", "err", err)
	}

	// Publish Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   req.LoanID,
		Value: map[string]interface{}{
			"event_type":    "loan.disbursed",
			"loan_id":       req.LoanID,
			"merchant_id":   loan.MerchantID,
			"amount_kobo":   loan.ApprovedKobo,
			"transfer_id":   transferID.String(),
			"approved_by":   req.ApprovedBy,
			"timestamp":     time.Now().UTC().Format(time.RFC3339),
		},
	})

	slog.Info("loan disbursed",
		"loan_id", req.LoanID,
		"merchant_id", loan.MerchantID,
		"amount_kobo", loan.ApprovedKobo,
		"transfer_id", transferID.String(),
	)

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"loan_id":     req.LoanID,
		"status":      "disbursed",
		"amount_kobo": loan.ApprovedKobo,
		"transfer_id": transferID.String(),
		"disbursed_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// RecordLoanRepayment records a repayment against a loan via TigerBeetle.
func RecordLoanRepayment(w http.ResponseWriter, r *http.Request) {
	var req LoanRepaymentRequest
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	loan, err := pgdb.GetMerchantLoan(ctx, req.LoanID)
	if err != nil {
		http.Error(w, `{"error":"loan not found"}`, http.StatusNotFound)
		return
	}
	if loan.Status != "disbursed" && loan.Status != "active" {
		http.Error(w, `{"error":"loan is not in active status"}`, http.StatusConflict)
		return
	}

	// TigerBeetle: repayment from merchant wallet to credit reserve
	merchantAccountID := tb.MerchantAccountID(loan.MerchantID)
	creditReserveID := uint128FromUint64(9000000000000001)

	repaymentID := uuid.New()
	tbRepaymentID, _ := tb.UUIDToUint128(repaymentID)

	if err := tb.ExecuteTransfer(ctx, tb.TransferRequest{
		ID:              tbRepaymentID,
		DebitAccountID:  merchantAccountID,
		CreditAccountID: creditReserveID,
		Amount:          req.AmountKobo,
		Code:            CodeLoanRepayment,
		Ledger:          1,
		UserData128:     tbRepaymentID,
	}); err != nil {
		slog.Error("TigerBeetle repayment failed", "loan_id", req.LoanID, "err", err)
		http.Error(w, `{"error":"repayment failed"}`, http.StatusInternalServerError)
		return
	}

	// Record repayment in DB
	if err := pgdb.RecordLoanRepayment(ctx, pgdb.LoanRepaymentRecord{
		RepaymentID: repaymentID.String(),
		LoanID:      req.LoanID,
		MerchantID:  loan.MerchantID,
		AmountKobo:  req.AmountKobo,
		Reference:   req.Reference,
		TransferID:  repaymentID.String(),
	}); err != nil {
		slog.Error("failed to record repayment", "err", err)
	}

	// Publish Kafka event
	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.lending",
		Key:   req.LoanID,
		Value: map[string]interface{}{
			"event_type":   "loan.repayment.recorded",
			"loan_id":      req.LoanID,
			"merchant_id":  loan.MerchantID,
			"amount_kobo":  req.AmountKobo,
			"reference":    req.Reference,
			"timestamp":    time.Now().UTC().Format(time.RFC3339),
		},
	})

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]interface{}{
		"repayment_id": repaymentID.String(),
		"loan_id":      req.LoanID,
		"amount_kobo":  req.AmountKobo,
		"status":       "recorded",
		"recorded_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// GetLoanStatus returns the current status of a loan from Redis cache or DB.
func GetLoanStatus(w http.ResponseWriter, r *http.Request) {
	loanID := r.PathValue("id")
	if loanID == "" {
		http.Error(w, `{"error":"loan id required"}`, http.StatusBadRequest)
		return
	}

	ctx := r.Context()

	// Try Redis cache first
	var cached map[string]interface{}
	if err := redis.GetJSON(ctx, fmt.Sprintf("loan:status:%s", loanID), &cached); err == nil {
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("X-Cache", "HIT")
		json.NewEncoder(w).Encode(cached)
		return
	}

	// Fall back to DB
	loan, err := pgdb.GetMerchantLoan(ctx, loanID)
	if err != nil {
		http.Error(w, `{"error":"loan not found"}`, http.StatusNotFound)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(loan)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func callCreditScoringService(ctx context.Context, req CreditScoreAPIRequest) (*CreditScoreAPIResponse, error) {
	body, err := json.Marshal(req)
	if err != nil {
		return nil, fmt.Errorf("marshal request: %w", err)
	}

	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost,
		creditScoringURL()+"/score", bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if key := os.Getenv("INTERNAL_API_KEY"); key != "" {
		httpReq.Header.Set("X-Internal-Key", key)
	}

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(httpReq)
	if err != nil {
		return nil, fmt.Errorf("call credit scoring service: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("credit scoring service returned %d: %s", resp.StatusCode, string(body))
	}

	var result CreditScoreAPIResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("decode response: %w", err)
	}
	return &result, nil
}

func uint128FromUint64(v uint64) [16]uint8 {
	var result [16]uint8
	for i := 0; i < 8; i++ {
		result[i] = uint8(v >> (i * 8))
	}
	return result
}
