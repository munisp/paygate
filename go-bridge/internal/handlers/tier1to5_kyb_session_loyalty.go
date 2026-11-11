// tier1to5_kyb_session_loyalty.go — Tier 3b/3c/4b routes proxied from
// server/tier1to5Router.ts: /kyb/*, /session-risk/*, /loyalty/*.
package handlers

import (
	"crypto/rand"
	"database/sql"
	"encoding/hex"
	"encoding/json"
	"log/slog"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// ─── KYB ──────────────────────────────────────────────────────────────────────

// T5SubmitKYB handles POST /kyb/submit.
func T5SubmitKYB(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID      string   `json:"merchant_id"`
		BusinessName    string   `json:"business_name"`
		RCNumber        string   `json:"rc_number"`
		TaxID           string   `json:"tax_id"`
		BusinessType    string   `json:"business_type"`
		IndustryCode    string   `json:"industry_code"`
		BusinessAddress string   `json:"business_address"`
		DirectorIDs     []string `json:"director_ids"`
		InitiatedBy     string   `json:"initiated_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.BusinessName == "" || req.RCNumber == "" || req.TaxID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id, business_name, rc_number and tax_id are required")
		return
	}
	if len(req.DirectorIDs) == 0 {
		respondError(w, http.StatusBadRequest, "at least one director_id is required")
		return
	}

	verificationID := uuid.New().String()
	if err := pgdb.Get().T5CreateKYBVerification(r.Context(), verificationID, req.MerchantID,
		req.BusinessName, req.RCNumber, req.TaxID, req.BusinessType, req.IndustryCode,
		firstNonEmpty(req.InitiatedBy, req.MerchantID)); err != nil {
		slog.Error("t5 kyb: submit failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist KYB submission")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.kyb",
		Key:   verificationID,
		Value: map[string]interface{}{
			"event_type":      "kyb.submitted",
			"verification_id": verificationID,
			"merchant_id":     req.MerchantID,
			"business_name":   req.BusinessName,
			"rc_number":       req.RCNumber,
			"director_ids":    req.DirectorIDs,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"verification_id": verificationID,
		"merchant_id":     req.MerchantID,
		"status":          "pending",
		"steps":           []string{"document_verification", "registry_check", "director_screening", "risk_assessment"},
		"submitted_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// T5GetKYBStatus handles GET /kyb/status?merchant_id=
func T5GetKYBStatus(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	verification, steps, err := pgdb.Get().T5GetKYBStatus(r.Context(), merchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "no KYB verification found for merchant")
		return
	}
	if err != nil {
		slog.Error("t5 kyb: status failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch KYB status")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"verification": verification,
		"steps":        steps,
	})
}

// T5GetKYBReports handles GET /kyb/reports?merchant_id=&report_type=
func T5GetKYBReports(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	merchantID := q.Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	reports, err := pgdb.Get().T5ListComplianceReports(r.Context(), merchantID, q.Get("report_type"))
	if err != nil {
		slog.Error("t5 kyb: reports failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list compliance reports")
		return
	}
	for _, rep := range reports {
		rep["findings"] = jsonString(rep["findings"])
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"reports": reports})
}

// T5GenerateCBNReport handles POST /kyb/cbn-report. Aggregates real persisted
// transaction data for the period and stores the report in compliance_reports.
func T5GenerateCBNReport(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID  string `json:"merchant_id"`
		ReportType  string `json:"report_type"`
		PeriodStart string `json:"period_start"`
		PeriodEnd   string `json:"period_end"`
		GeneratedBy string `json:"generated_by"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.ReportType == "" || req.PeriodStart == "" || req.PeriodEnd == "" {
		respondError(w, http.StatusBadRequest, "merchant_id, report_type, period_start and period_end are required")
		return
	}
	if _, err := time.Parse("2006-01-02", req.PeriodStart); err != nil {
		respondError(w, http.StatusBadRequest, "period_start must be YYYY-MM-DD")
		return
	}
	if _, err := time.Parse("2006-01-02", req.PeriodEnd); err != nil {
		respondError(w, http.StatusBadRequest, "period_end must be YYYY-MM-DD")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	agg, err := db.T5AggregateCBNReport(ctx, req.MerchantID, req.PeriodStart, req.PeriodEnd)
	if err != nil {
		slog.Error("t5 kyb: cbn aggregation failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to aggregate report data")
		return
	}

	reportID := uuid.New().String()
	findings := toJSONString(map[string]interface{}{
		"period_start": req.PeriodStart,
		"period_end":   req.PeriodEnd,
		"report_type":  req.ReportType,
		"generated_by": req.GeneratedBy,
		"aggregate":    agg,
	})
	if err := db.T5CreateComplianceReport(ctx, reportID, req.MerchantID, req.ReportType, "generated", findings); err != nil {
		slog.Error("t5 kyb: persist cbn report failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist CBN report")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.kyb",
		Key:   reportID,
		Value: map[string]interface{}{
			"event_type":  "kyb.cbn_report_generated",
			"report_id":   reportID,
			"merchant_id": req.MerchantID,
			"report_type": req.ReportType,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"report_id":    reportID,
		"merchant_id":  req.MerchantID,
		"report_type":  req.ReportType,
		"status":       "generated",
		"period_start": req.PeriodStart,
		"period_end":   req.PeriodEnd,
		"aggregate":    agg,
		"generated_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// ─── Session Risk ─────────────────────────────────────────────────────────────

// T5RecordFingerprint handles POST /session-risk/fingerprint. Computes a risk
// score from persisted device history (new device for the user → elevated).
func T5RecordFingerprint(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID           string                 `json:"user_id"`
		FingerprintID    string                 `json:"fingerprint_id"`
		Components       map[string]interface{} `json:"components"`
		UserAgent        string                 `json:"user_agent"`
		IPAddress        string                 `json:"ip_address"`
		Timezone         string                 `json:"timezone"`
		ScreenResolution string                 `json:"screen_resolution"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" || req.FingerprintID == "" || req.UserAgent == "" {
		respondError(w, http.StatusBadRequest, "user_id, fingerprint_id and user_agent are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()

	distinct, total, err := db.T5CountUserFingerprints(ctx, req.UserID, req.FingerprintID)
	if err != nil {
		slog.Error("t5 session-risk: history lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to look up device history")
		return
	}

	// Deterministic heuristic: unknown device for this user → elevated risk.
	score := 10
	level := "low"
	known := false
	if total > 0 {
		hist, herr := db.T5ListSessionRiskHistory(ctx, req.UserID, 200)
		if herr != nil {
			slog.Error("t5 session-risk: fingerprint check failed", "err", herr)
			respondError(w, http.StatusInternalServerError, "failed to check known fingerprints")
			return
		}
		for _, h := range hist {
			if h["fingerprint_id"] == req.FingerprintID {
				known = true
				break
			}
		}
	}
	if total == 0 || !known {
		score = 45
		level = "medium"
	}
	if total == 0 && distinct == 0 {
		// First-ever session for the user.
		score = 30
	}
	if score >= 70 {
		level = "high"
	}

	sessionID := uuid.New().String()
	if err := db.T5InsertSessionFingerprint(ctx, sessionID, req.UserID, req.FingerprintID,
		req.Components, req.UserAgent, req.IPAddress, req.Timezone, req.ScreenResolution, score, level); err != nil {
		slog.Error("t5 session-risk: persist failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist fingerprint")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"session_id":     sessionID,
		"user_id":        req.UserID,
		"fingerprint_id": req.FingerprintID,
		"risk_score":     score,
		"risk_level":     level,
		"known_device":   known,
		"recorded_at":    time.Now().UTC().Format(time.RFC3339),
	})
}

// T5GetSessionRisk handles GET /session-risk/score?session_id=&user_id=
func T5GetSessionRisk(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	sessionID, userID := q.Get("session_id"), q.Get("user_id")
	if sessionID == "" || userID == "" {
		respondError(w, http.StatusBadRequest, "session_id and user_id are required")
		return
	}
	row, err := pgdb.Get().T5GetSessionRisk(r.Context(), sessionID, userID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "session not found")
		return
	}
	if err != nil {
		slog.Error("t5 session-risk: score failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch session risk")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"session": row})
}

// T5GetSessionRiskHistory handles GET /session-risk/history?user_id=&limit=
func T5GetSessionRiskHistory(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	limit := parseIntQuery(r, "limit", 20)
	rows, err := pgdb.Get().T5ListSessionRiskHistory(r.Context(), userID, limit)
	if err != nil {
		slog.Error("t5 session-risk: history failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch risk history")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"history": rows})
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

// T5GetLoyaltyAccount handles GET /loyalty/account?user_id=
func T5GetLoyaltyAccount(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	accountID, balance, lifetime, err := pgdb.Get().T5GetOrCreateLoyaltyAccount(r.Context(), userID)
	if err != nil {
		slog.Error("t5 loyalty: account failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch loyalty account")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"account_id":      accountID,
		"user_id":         userID,
		"points_balance":  balance,
		"lifetime_points": lifetime,
		"tier":            loyaltyTier(lifetime),
	})
}

// T5GetLoyaltyBalance handles GET /loyalty/balance?user_id=
func T5GetLoyaltyBalance(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	accountID, balance, _, err := pgdb.Get().T5GetOrCreateLoyaltyAccount(r.Context(), userID)
	if err != nil {
		slog.Error("t5 loyalty: balance failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch points balance")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"account_id":     accountID,
		"user_id":        userID,
		"points_balance": balance,
	})
}

// T5GetLoyaltyTransactions handles GET /loyalty/transactions?user_id=&limit=
func T5GetLoyaltyTransactions(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	limit := parseIntQuery(r, "limit", 20)
	accountID, _, _, err := pgdb.Get().T5GetOrCreateLoyaltyAccount(r.Context(), userID)
	if err != nil {
		slog.Error("t5 loyalty: account lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch loyalty account")
		return
	}
	txs, err := pgdb.Get().T5ListLoyaltyTransactions(r.Context(), accountID, limit)
	if err != nil {
		slog.Error("t5 loyalty: transactions failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch loyalty transactions")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"account_id": accountID, "transactions": txs})
}

// T5RedeemPoints handles POST /loyalty/redeem. Atomic balance debit; 409 on
// insufficient points — never fakes success.
func T5RedeemPoints(w http.ResponseWriter, r *http.Request) {
	var req struct {
		UserID         string `json:"user_id"`
		PointsToRedeem int64  `json:"points_to_redeem"`
		RedemptionType string `json:"redemption_type"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.UserID == "" || req.PointsToRedeem < 500 || req.RedemptionType == "" {
		respondError(w, http.StatusBadRequest, "user_id, points_to_redeem>=500 and redemption_type are required")
		return
	}
	switch req.RedemptionType {
	case "cashback", "voucher", "transfer_fee_waiver":
	default:
		respondError(w, http.StatusBadRequest, "redemption_type must be cashback|voucher|transfer_fee_waiver")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()
	accountID, _, _, err := db.T5GetOrCreateLoyaltyAccount(ctx, req.UserID)
	if err != nil {
		slog.Error("t5 loyalty: account lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch loyalty account")
		return
	}
	redemptionID := uuid.New().String()
	newBalance, err := db.T5RedeemLoyaltyPoints(ctx, accountID, req.PointsToRedeem, req.RedemptionType, redemptionID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusConflict, "insufficient points balance")
		return
	}
	if err != nil {
		slog.Error("t5 loyalty: redeem failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to redeem points")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.loyalty",
		Key:   redemptionID,
		Value: map[string]interface{}{
			"event_type":      "loyalty.redeemed",
			"redemption_id":   redemptionID,
			"account_id":      accountID,
			"user_id":         req.UserID,
			"points_redeemed": req.PointsToRedeem,
			"redemption_type": req.RedemptionType,
			"new_balance":     newBalance,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"redemption_id":   redemptionID,
		"account_id":      accountID,
		"points_redeemed": req.PointsToRedeem,
		"redemption_type": req.RedemptionType,
		"new_balance":     newBalance,
		"status":          "completed",
		"redeemed_at":     time.Now().UTC().Format(time.RFC3339),
	})
}

// T5GetTierBenefits handles GET /loyalty/tier-benefits?user_id=
func T5GetTierBenefits(w http.ResponseWriter, r *http.Request) {
	userID := r.URL.Query().Get("user_id")
	if userID == "" {
		respondError(w, http.StatusBadRequest, "user_id is required")
		return
	}
	accountID, balance, lifetime, err := pgdb.Get().T5GetOrCreateLoyaltyAccount(r.Context(), userID)
	if err != nil {
		slog.Error("t5 loyalty: tier lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch tier benefits")
		return
	}
	tier := loyaltyTier(lifetime)
	benefits := map[string][]string{
		"bronze":   {"earn 1 point per ₦1 spent"},
		"silver":   {"earn 1 point per ₦1 spent", "0.5% transfer fee discount"},
		"gold":     {"earn 1.5 points per ₦1 spent", "1% transfer fee discount", "priority support"},
		"platinum": {"earn 2 points per ₦1 spent", "free transfers", "dedicated account manager"},
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"account_id":      accountID,
		"user_id":         userID,
		"tier":            tier,
		"points_balance":  balance,
		"lifetime_points": lifetime,
		"benefits":        benefits[tier],
	})
}

// T5GetMerchantLoyaltyStats handles GET /loyalty/merchant-stats?merchant_id=
func T5GetMerchantLoyaltyStats(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	stats, err := pgdb.Get().T5MerchantLoyaltyStats(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 loyalty: merchant stats failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch merchant loyalty stats")
		return
	}
	stats["merchant_id"] = merchantID
	respondJSON(w, http.StatusOK, stats)
}

func loyaltyTier(lifetimePoints int64) string {
	switch {
	case lifetimePoints >= 100000:
		return "platinum"
	case lifetimePoints >= 25000:
		return "gold"
	case lifetimePoints >= 5000:
		return "silver"
	default:
		return "bronze"
	}
}

// randomTokenHex returns a cryptographically random hex token of n bytes.
func randomTokenHex(n int) (string, error) {
	b := make([]byte, n)
	if _, err := rand.Read(b); err != nil {
		return "", err
	}
	return hex.EncodeToString(b), nil
}
