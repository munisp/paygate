// tier1to5_split_billing_dcc.go — Tier 1b/1c/1d routes proxied from
// server/tier1to5Router.ts: /split-payments/*, /billing/*, /dcc/*.
package handlers

import (
	"database/sql"
	"encoding/json"
	"fmt"
	"log/slog"
	"math"
	"net/http"
	"strconv"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
)

// ─── Split Payments ───────────────────────────────────────────────────────────

type t5SplitLeg struct {
	RecipientID   string  `json:"recipientId"`
	RecipientType string  `json:"recipientType"`
	SplitType     string  `json:"splitType"` // percentage | fixed_kobo
	Value         float64 `json:"value"`
	Description   string  `json:"description,omitempty"`
}

// T5CreateSplitRule handles POST /split-payments/rules.
func T5CreateSplitRule(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID    string       `json:"merchant_id"`
		RuleName      string       `json:"rule_name"`
		Splits        []t5SplitLeg `json:"splits"`
		TriggerEvents []string     `json:"trigger_events"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.RuleName == "" || len(req.Splits) < 2 {
		respondError(w, http.StatusBadRequest, "merchant_id, rule_name and >=2 splits are required")
		return
	}

	ruleID := uuid.New().String()
	payload := map[string]interface{}{"splits": req.Splits, "trigger_events": req.TriggerEvents}
	if err := pgdb.Get().T5CreateSplitRule(r.Context(), ruleID, req.MerchantID, req.RuleName, payload); err != nil {
		slog.Error("t5 split: create rule failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to create split rule")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.split-payments",
		Key:   ruleID,
		Value: map[string]interface{}{
			"event_type":  "split.rule_created",
			"rule_id":     ruleID,
			"merchant_id": req.MerchantID,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"rule_id":    ruleID,
		"rule_name":  req.RuleName,
		"status":     "active",
		"splits":     req.Splits,
		"created_at": time.Now().UTC().Format(time.RFC3339),
	})
}

// T5ListSplitRules handles GET /split-payments/rules?merchant_id=
func T5ListSplitRules(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	rules, err := pgdb.Get().T5ListSplitRules(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 split: list rules failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list split rules")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"rules": rules})
}

// T5ExecuteSplitPayment handles POST /split-payments/execute. Idempotent on
// reference: a replayed reference returns the original persisted payment.
func T5ExecuteSplitPayment(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RuleID          string                 `json:"rule_id"`
		MerchantID      string                 `json:"merchant_id"`
		TotalAmountKobo int64                  `json:"total_amount_kobo"`
		Reference       string                 `json:"reference"`
		Metadata        map[string]interface{} `json:"metadata,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RuleID == "" || req.MerchantID == "" || req.TotalAmountKobo <= 0 || req.Reference == "" {
		respondError(w, http.StatusBadRequest, "rule_id, merchant_id, total_amount_kobo>0 and reference are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()

	// Idempotent replay: same reference → return original payment.
	if existing, err := db.T5GetSplitPaymentByReference(ctx, req.MerchantID, req.Reference); err == nil {
		respondJSON(w, http.StatusOK, map[string]interface{}{
			"split_payment_id":  existing["split_payment_id"],
			"rule_id":           existing["split_rule_id"],
			"status":            existing["status"],
			"legs":              jsonString(existing["legs"]),
			"idempotent_replay": true,
		})
		return
	} else if err != sql.ErrNoRows {
		slog.Error("t5 split: idempotency check failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to check existing split payment")
		return
	}

	rule, err := db.T5GetSplitRule(ctx, req.RuleID, req.MerchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "split rule not found")
		return
	}
	if err != nil {
		slog.Error("t5 split: fetch rule failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch split rule")
		return
	}

	var payload struct {
		Splits []t5SplitLeg `json:"splits"`
	}
	raw, _ := json.Marshal(jsonString(rule["recipients"]))
	if err := json.Unmarshal(raw, &payload); err != nil || len(payload.Splits) == 0 {
		respondError(w, http.StatusUnprocessableEntity, "split rule has no usable recipients")
		return
	}

	// Compute legs.
	type leg struct {
		RecipientID   string `json:"recipient_id"`
		RecipientType string `json:"recipient_type"`
		AmountKobo    int64  `json:"amount_kobo"`
	}
	legs := make([]leg, 0, len(payload.Splits))
	allocated := int64(0)
	for i, s := range payload.Splits {
		var amt int64
		if s.SplitType == "fixed_kobo" {
			amt = int64(math.Round(s.Value))
		} else {
			amt = int64(math.Round(float64(req.TotalAmountKobo) * s.Value / 100.0))
		}
		if i == len(payload.Splits)-1 {
			// Last leg absorbs rounding remainder.
			amt = req.TotalAmountKobo - allocated
		}
		allocated += amt
		legs = append(legs, leg{RecipientID: s.RecipientID, RecipientType: s.RecipientType, AmountKobo: amt})
	}

	splitPaymentID := uuid.New().String()
	if err := db.T5RecordSplitPayment(ctx, splitPaymentID, req.RuleID, req.TotalAmountKobo, req.Reference, legs, "completed"); err != nil {
		slog.Error("t5 split: record payment failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to record split payment")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.split-payments",
		Key:   splitPaymentID,
		Value: map[string]interface{}{
			"event_type":       "split.executed",
			"split_payment_id": splitPaymentID,
			"rule_id":          req.RuleID,
			"merchant_id":      req.MerchantID,
			"total_kobo":       req.TotalAmountKobo,
			"reference":        req.Reference,
			"legs":             legs,
			"timestamp":        time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"split_payment_id":  splitPaymentID,
		"rule_id":           req.RuleID,
		"total_amount_kobo": req.TotalAmountKobo,
		"reference":         req.Reference,
		"legs":              legs,
		"status":            "completed",
		"executed_at":       time.Now().UTC().Format(time.RFC3339),
	})
}

// T5SplitHistory handles GET /split-payments/history?merchant_id=&limit=
func T5SplitHistory(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	limit := parseIntQuery(r, "limit", 50)
	payments, err := pgdb.Get().T5ListSplitPayments(r.Context(), merchantID, limit)
	if err != nil {
		slog.Error("t5 split: history failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list split history")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"payments": payments})
}

// jsonString normalises a jsonb-scanned value (string or []byte) to a string.
func jsonString(v interface{}) interface{} {
	s, ok := v.(string)
	if !ok || s == "" {
		return v
	}
	var parsed interface{}
	if err := json.Unmarshal([]byte(s), &parsed); err != nil {
		return s
	}
	return parsed
}

// ─── Recurring Billing ────────────────────────────────────────────────────────

// T5CreateBillingPlan handles POST /billing/plans. The portal sends camelCase
// keys (planName, amountKobo, intervalType...) — both casings are accepted.
func T5CreateBillingPlan(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID    string `json:"merchant_id"`
		PlanName      string `json:"planName"`
		PlanNameAlt   string `json:"plan_name"`
		AmountKobo    int64  `json:"amountKobo"`
		AmountKoboAlt int64  `json:"amount_kobo"`
		Currency      string `json:"currency"`
		IntervalType  string `json:"intervalType"`
		IntervalAlt   string `json:"interval_type"`
		IntervalCount int    `json:"intervalCount"`
		TrialDays     int    `json:"trialDays"`
		MaxCycles     *int   `json:"maxCycles"`
		Description   string `json:"description"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	name := firstNonEmpty(req.PlanName, req.PlanNameAlt)
	amountKobo := req.AmountKobo
	if amountKobo == 0 {
		amountKobo = req.AmountKoboAlt
	}
	interval := firstNonEmpty(req.IntervalType, req.IntervalAlt, "monthly")
	currency := firstNonEmpty(req.Currency, "NGN")
	if req.MerchantID == "" || name == "" || amountKobo <= 0 {
		respondError(w, http.StatusBadRequest, "merchant_id, planName and amountKobo>0 are required")
		return
	}

	amountNgn := strconv.FormatFloat(float64(amountKobo)/100.0, 'f', 2, 64)
	id, err := pgdb.Get().T5CreateBillingPlan(r.Context(), req.MerchantID, name, amountNgn, currency, interval)
	if err != nil {
		slog.Error("t5 billing: create plan failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to create plan")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   strconv.FormatInt(id, 10),
		Value: map[string]interface{}{
			"event_type":  "billing.plan_created",
			"plan_id":     id,
			"merchant_id": req.MerchantID,
			"name":        name,
			"amount_kobo": amountKobo,
			"interval":    interval,
			"timestamp":   time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"plan_id":     strconv.FormatInt(id, 10),
		"merchant_id": req.MerchantID,
		"plan_name":   name,
		"amount_kobo": amountKobo,
		"currency":    currency,
		"interval":    interval,
		"status":      "active",
		"trial_days":  req.TrialDays,
		"max_cycles":  req.MaxCycles,
		"created_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

// T5ListBillingPlans handles GET /billing/plans?merchant_id=
func T5ListBillingPlans(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	plans, err := pgdb.Get().T5ListBillingPlans(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 billing: list plans failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list plans")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"plans": plans})
}

// T5SubscribeCustomer handles POST /billing/subscribe.
func T5SubscribeCustomer(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID    string                 `json:"merchant_id"`
		PlanID        string                 `json:"planId"`
		PlanIDAlt     string                 `json:"plan_id"`
		CustomerID    string                 `json:"customerId"`
		CustomerIDAlt string                 `json:"customer_id"`
		CustomerEmail string                 `json:"customerEmail"`
		EmailAlt      string                 `json:"customer_email"`
		StartDate     string                 `json:"startDate"`
		Metadata      map[string]interface{} `json:"metadata,omitempty"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	planID := firstNonEmpty(req.PlanID, req.PlanIDAlt)
	customerID := firstNonEmpty(req.CustomerID, req.CustomerIDAlt)
	email := firstNonEmpty(req.CustomerEmail, req.EmailAlt)
	if req.MerchantID == "" || planID == "" || customerID == "" || email == "" {
		respondError(w, http.StatusBadRequest, "merchant_id, planId, customerId and customerEmail are required")
		return
	}

	start := time.Now().UTC()
	if req.StartDate != "" {
		if parsed, err := time.Parse(time.RFC3339, req.StartDate); err == nil {
			start = parsed
		} else if parsed, err := time.Parse("2006-01-02", req.StartDate); err == nil {
			start = parsed
		}
	}
	subID := uuid.New().String()
	nextBilling := start.AddDate(0, 1, 0) // monthly default
	if err := pgdb.Get().T5CreateSubscriber(r.Context(), subID, planID, req.MerchantID, customerID, email, customerID, start, nextBilling); err != nil {
		slog.Error("t5 billing: subscribe failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to create subscription")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   subID,
		Value: map[string]interface{}{
			"event_type":      "billing.subscribed",
			"subscription_id": subID,
			"plan_id":         planID,
			"merchant_id":     req.MerchantID,
			"customer_id":     customerID,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"subscription_id":   subID,
		"plan_id":           planID,
		"merchant_id":       req.MerchantID,
		"customer_id":       customerID,
		"customer_email":    email,
		"status":            "active",
		"start_date":        start.Format(time.RFC3339),
		"next_billing_date": nextBilling.Format(time.RFC3339),
	})
}

// T5ListSubscriptions handles GET /billing/subscriptions?merchant_id=&status=
func T5ListSubscriptions(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	merchantID := q.Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	subs, err := pgdb.Get().T5ListSubscribers(r.Context(), merchantID, q.Get("status"))
	if err != nil {
		slog.Error("t5 billing: list subscriptions failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list subscriptions")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"subscriptions": subs})
}

// T5PauseSubscription handles POST /billing/pause.
func T5PauseSubscription(w http.ResponseWriter, r *http.Request) {
	t5UpdateSubscriptionStatus(w, r, "paused")
}

// T5CancelSubscription handles POST /billing/cancel.
func T5CancelSubscription(w http.ResponseWriter, r *http.Request) {
	t5UpdateSubscriptionStatus(w, r, "cancelled")
}

func t5UpdateSubscriptionStatus(w http.ResponseWriter, r *http.Request, status string) {
	var req struct {
		SubscriptionID string `json:"subscription_id"`
		MerchantID     string `json:"merchant_id"`
		ResumeDate     string `json:"resume_date"`
		Reason         string `json:"reason"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.SubscriptionID == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "subscription_id and merchant_id are required")
		return
	}
	n, err := pgdb.Get().T5UpdateSubscriberStatus(r.Context(), req.MerchantID, req.SubscriptionID, status)
	if err != nil {
		slog.Error("t5 billing: update subscription failed", "status", status, "err", err)
		respondError(w, http.StatusInternalServerError, "failed to update subscription")
		return
	}
	if n == 0 {
		respondError(w, http.StatusNotFound, "subscription not found or already in target status")
		return
	}

	kafka.GetProducer().Produce(kafka.Message{
		Topic: "paygate.billing",
		Key:   req.SubscriptionID,
		Value: map[string]interface{}{
			"event_type":      "billing.subscription_" + status,
			"subscription_id": req.SubscriptionID,
			"merchant_id":     req.MerchantID,
			"reason":          req.Reason,
			"timestamp":       time.Now().UTC().Format(time.RFC3339),
		},
	})

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"subscription_id": req.SubscriptionID,
		"status":          status,
		"resume_date":     req.ResumeDate,
		"updated_at":      time.Now().UTC().Format(time.RFC3339),
	})
}

// T5DunningQueue handles GET /billing/dunning?merchant_id=
func T5DunningQueue(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	charges, err := pgdb.Get().T5ListDunningQueue(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 billing: dunning failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch dunning queue")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"dunning": charges})
}

func firstNonEmpty(vals ...string) string {
	for _, v := range vals {
		if v != "" {
			return v
		}
	}
	return ""
}

// ─── Dynamic Currency Conversion ──────────────────────────────────────────────

// T5DCCRates handles GET /dcc/rates?base=&targets= (comma-separated).
func T5DCCRates(w http.ResponseWriter, r *http.Request) {
	q := r.URL.Query()
	base := q.Get("base")
	if base == "" {
		base = "NGN"
	}
	targets := q.Get("targets")
	if targets == "" {
		respondError(w, http.StatusBadRequest, "targets is required")
		return
	}
	db := pgdb.Get()
	rates := make([]map[string]interface{}, 0)
	for _, target := range splitComma(targets) {
		if target == "" || target == base {
			continue
		}
		rate, fetchedAt, err := db.T5GetFXRate(r.Context(), base, target)
		if err == sql.ErrNoRows {
			continue // no persisted rate for this pair — omit honestly
		}
		if err != nil {
			slog.Error("t5 dcc: fx rate lookup failed", "pair", base+"/"+target, "err", err)
			respondError(w, http.StatusInternalServerError, "failed to fetch FX rates")
			return
		}
		rates = append(rates, map[string]interface{}{
			"base":       base,
			"target":     target,
			"mid_rate":   rate,
			"fetched_at": fetchedAt,
		})
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"base": base, "rates": rates})
}

// T5DCCLockRate handles POST /dcc/lock-rate.
func T5DCCLockRate(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID          string `json:"merchant_id"`
		FromCurrency        string `json:"from_currency"`
		ToCurrency          string `json:"to_currency"`
		AmountKobo          int64  `json:"amount_kobo"`
		LockDurationSeconds int    `json:"lock_duration_seconds"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.FromCurrency == "" || req.ToCurrency == "" || req.AmountKobo <= 0 {
		respondError(w, http.StatusBadRequest, "merchant_id, from_currency, to_currency and amount_kobo>0 are required")
		return
	}
	if req.LockDurationSeconds < 30 || req.LockDurationSeconds > 300 {
		req.LockDurationSeconds = 120
	}

	ctx := r.Context()
	db := pgdb.Get()

	midRateStr, _, err := db.T5GetFXRate(ctx, req.FromCurrency, req.ToCurrency)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusUnprocessableEntity, fmt.Sprintf("no FX rate available for %s/%s", req.FromCurrency, req.ToCurrency))
		return
	}
	if err != nil {
		slog.Error("t5 dcc: rate lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch FX rate")
		return
	}
	midRate, err := strconv.ParseFloat(midRateStr, 64)
	if err != nil || midRate <= 0 {
		respondError(w, http.StatusUnprocessableEntity, "persisted FX rate is not parseable")
		return
	}

	marginStr, err := db.T5GetDCCMargin(ctx, req.MerchantID, req.FromCurrency+"/"+req.ToCurrency)
	if err != nil {
		slog.Error("t5 dcc: margin lookup failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch margin config")
		return
	}
	marginPct, _ := strconv.ParseFloat(marginStr, 64)
	customerRate := midRate * (1 - marginPct/100.0)

	lockID := uuid.New().String()
	expiresAt := time.Now().UTC().Add(time.Duration(req.LockDurationSeconds) * time.Second)
	if err := db.T5CreateDCCLock(ctx, lockID, req.MerchantID, req.FromCurrency, req.ToCurrency,
		req.AmountKobo, strconv.FormatFloat(midRate, 'f', 8, 64),
		strconv.FormatFloat(customerRate, 'f', 8, 64),
		strconv.FormatFloat(marginPct, 'f', 4, 64), expiresAt); err != nil {
		slog.Error("t5 dcc: persist lock failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to persist rate lock")
		return
	}

	respondJSON(w, http.StatusCreated, map[string]interface{}{
		"rate_lock_id":  lockID,
		"merchant_id":   req.MerchantID,
		"from_currency": req.FromCurrency,
		"to_currency":   req.ToCurrency,
		"amount_kobo":   req.AmountKobo,
		"mid_rate":      midRate,
		"customer_rate": customerRate,
		"margin_pct":    marginPct,
		"status":        "locked",
		"expires_at":    expiresAt.Format(time.RFC3339),
	})
}

// T5DCCExecute handles POST /dcc/execute. Idempotent per rate lock: replay
// returns the original conversion.
func T5DCCExecute(w http.ResponseWriter, r *http.Request) {
	var req struct {
		RateLockID       string `json:"rate_lock_id"`
		PaymentReference string `json:"payment_reference"`
		CustomerID       string `json:"customer_id"`
		MerchantID       string `json:"merchant_id"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.RateLockID == "" || req.PaymentReference == "" || req.MerchantID == "" {
		respondError(w, http.StatusBadRequest, "rate_lock_id, payment_reference and merchant_id are required")
		return
	}

	ctx := r.Context()
	db := pgdb.Get()

	lock, err := db.T5GetDCCLock(ctx, req.RateLockID, req.MerchantID)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusNotFound, "rate lock not found")
		return
	}
	if err != nil {
		slog.Error("t5 dcc: fetch lock failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to fetch rate lock")
		return
	}

	amountKobo, _ := parseInt64Loose(lock["amount_kobo"])
	customerRate, _ := strconv.ParseFloat(fmt.Sprint(lock["customer_rate"]), 64)
	converted := int64(math.Round(float64(amountKobo) * customerRate))
	conversionID := uuid.New().String()

	replayed, existingID, err := db.T5ExecuteDCCLock(ctx, req.RateLockID, req.MerchantID, conversionID, req.PaymentReference, converted)
	if err == sql.ErrNoRows {
		respondError(w, http.StatusConflict, "rate lock expired or already consumed without a recorded conversion")
		return
	}
	if err != nil {
		slog.Error("t5 dcc: execute failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to execute conversion")
		return
	}
	if replayed {
		conversionID = existingID
	}

	if !replayed {
		kafka.GetProducer().Produce(kafka.Message{
			Topic: "paygate.dcc",
			Key:   conversionID,
			Value: map[string]interface{}{
				"event_type":        "dcc.executed",
				"conversion_id":     conversionID,
				"rate_lock_id":      req.RateLockID,
				"merchant_id":       req.MerchantID,
				"payment_reference": req.PaymentReference,
				"timestamp":         time.Now().UTC().Format(time.RFC3339),
			},
		})
	}

	respondJSON(w, http.StatusOK, map[string]interface{}{
		"conversion_id":         conversionID,
		"rate_lock_id":          req.RateLockID,
		"merchant_id":           req.MerchantID,
		"from_currency":         lock["from_currency"],
		"to_currency":           lock["to_currency"],
		"original_amount_kobo":  amountKobo,
		"converted_amount_kobo": converted,
		"mid_rate":              lock["mid_rate"],
		"customer_rate":         lock["customer_rate"],
		"margin_pct":            lock["margin_pct"],
		"payment_reference":     req.PaymentReference,
		"status":                "completed",
		"idempotent_replay":     replayed,
	})
}

// T5DCCGetMarginConfig handles GET /dcc/margin-config?merchant_id=
func T5DCCGetMarginConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		respondError(w, http.StatusBadRequest, "merchant_id is required")
		return
	}
	configs, err := pgdb.Get().T5ListDCCMarginConfigs(r.Context(), merchantID)
	if err != nil {
		slog.Error("t5 dcc: list margins failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to list margin configs")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{"margin_configs": configs})
}

// T5DCCUpdateMargin handles POST /dcc/margin-config.
func T5DCCUpdateMargin(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID string  `json:"merchant_id"`
		Currency   string  `json:"currency"`
		MarginPct  float64 `json:"margin_pct"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		respondError(w, http.StatusBadRequest, "invalid request body")
		return
	}
	if req.MerchantID == "" || req.Currency == "" || req.MarginPct < 0 || req.MarginPct > 10 {
		respondError(w, http.StatusBadRequest, "merchant_id, currency and 0<=margin_pct<=10 are required")
		return
	}
	marginStr := strconv.FormatFloat(req.MarginPct, 'f', 4, 64)
	if err := pgdb.Get().T5UpsertDCCMargin(r.Context(), req.MerchantID, req.Currency, marginStr); err != nil {
		slog.Error("t5 dcc: upsert margin failed", "err", err)
		respondError(w, http.StatusInternalServerError, "failed to update margin config")
		return
	}
	respondJSON(w, http.StatusOK, map[string]interface{}{
		"merchant_id": req.MerchantID,
		"currency":    req.Currency,
		"margin_pct":  req.MarginPct,
		"updated_at":  time.Now().UTC().Format(time.RFC3339),
	})
}

func splitComma(s string) []string {
	out := []string{}
	cur := ""
	for _, c := range s {
		if c == ',' {
			out = append(out, cur)
			cur = ""
		} else {
			cur += string(c)
		}
	}
	if cur != "" {
		out = append(out, cur)
	}
	return out
}
