package handlers

// interchange.go — Interchange Fee Engine
//
// Calculates interchange fees per Visa/Mastercard/Verve scheme rules.
// Supports: card-present, card-not-present, contactless, e-commerce.
// Fee schedule is DB-backed and cached in Redis.
// All calculations are in kobo (integer arithmetic, no floating point).

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"time"

	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/redis"
)

// InterchangeScheduleEntry defines a fee rule for a specific card/channel combination.
type InterchangeScheduleEntry struct {
	ID            string     `json:"id"`
	Scheme        string     `json:"scheme"`         // visa, mastercard, verve
	CardType      string     `json:"card_type"`      // credit, debit, prepaid, corporate
	Channel       string     `json:"channel"`        // card_present, card_not_present, contactless, ecommerce
	MCC           string     `json:"mcc"`            // merchant category code, empty = all
	BasisPoints   int        `json:"basis_points"`   // e.g. 150 = 1.50%
	FixedFeeKobo  int64      `json:"fixed_fee_kobo"` // flat fee in kobo
	MinFeeKobo    int64      `json:"min_fee_kobo"`   // minimum fee
	MaxFeeKobo    int64      `json:"max_fee_kobo"`   // maximum fee, 0 = no cap
	EffectiveFrom time.Time  `json:"effective_from"`
	EffectiveTo   *time.Time `json:"effective_to,omitempty"`
	UpdatedAt     time.Time  `json:"updated_at"`
}

// defaultSchedule returns the built-in CBN/scheme interchange schedule.
// These are the standard Nigerian interbank settlement rates.
var defaultSchedule = []InterchangeScheduleEntry{
	// Verve (domestic debit)
	{ID: "verve_debit_cp", Scheme: "verve", CardType: "debit", Channel: "card_present",
		BasisPoints: 75, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 250000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	{ID: "verve_debit_cnp", Scheme: "verve", CardType: "debit", Channel: "card_not_present",
		BasisPoints: 125, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 500000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	// Mastercard (debit)
	{ID: "mc_debit_cp", Scheme: "mastercard", CardType: "debit", Channel: "card_present",
		BasisPoints: 80, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 300000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	{ID: "mc_debit_cnp", Scheme: "mastercard", CardType: "debit", Channel: "card_not_present",
		BasisPoints: 150, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 500000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	// Mastercard (credit)
	{ID: "mc_credit_cp", Scheme: "mastercard", CardType: "credit", Channel: "card_present",
		BasisPoints: 120, FixedFeeKobo: 0, MinFeeKobo: 10000, MaxFeeKobo: 500000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	{ID: "mc_credit_cnp", Scheme: "mastercard", CardType: "credit", Channel: "card_not_present",
		BasisPoints: 200, FixedFeeKobo: 0, MinFeeKobo: 10000, MaxFeeKobo: 1000000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	// Visa (debit)
	{ID: "visa_debit_cp", Scheme: "visa", CardType: "debit", Channel: "card_present",
		BasisPoints: 80, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 300000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	{ID: "visa_debit_cnp", Scheme: "visa", CardType: "debit", Channel: "card_not_present",
		BasisPoints: 150, FixedFeeKobo: 0, MinFeeKobo: 5000, MaxFeeKobo: 500000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	// Visa (credit)
	{ID: "visa_credit_cp", Scheme: "visa", CardType: "credit", Channel: "card_present",
		BasisPoints: 130, FixedFeeKobo: 0, MinFeeKobo: 10000, MaxFeeKobo: 500000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
	{ID: "visa_credit_ecom", Scheme: "visa", CardType: "credit", Channel: "ecommerce",
		BasisPoints: 200, FixedFeeKobo: 0, MinFeeKobo: 10000, MaxFeeKobo: 1000000,
		EffectiveFrom: time.Date(2024, 1, 1, 0, 0, 0, 0, time.UTC)},
}

// ─── CalculateInterchange ─────────────────────────────────────────────────────

// CalculateInterchange handles POST /v1/interchange/calculate
func CalculateInterchange(w http.ResponseWriter, r *http.Request) {
	var req struct {
		AmountKobo int64  `json:"amount_kobo"`
		Scheme     string `json:"scheme"`
		CardType   string `json:"card_type"`
		Channel    string `json:"channel"`
		MCC        string `json:"mcc"`
		MerchantID string `json:"merchant_id"`
		TxID       string `json:"transaction_id"`
	}
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.AmountKobo <= 0 || req.Scheme == "" || req.Channel == "" {
		writeError(w, http.StatusBadRequest, "amount_kobo, scheme, and channel required")
		return
	}

	ctx := r.Context()

	// Load schedule from Redis cache
	schedule := loadSchedule(ctx, req.Scheme)

	// Find best matching rule
	rule := findBestRule(schedule, req.Scheme, req.CardType, req.Channel, req.MCC)
	if rule == nil {
		writeError(w, http.StatusUnprocessableEntity,
			fmt.Sprintf("no interchange rule found for scheme=%s card_type=%s channel=%s",
				req.Scheme, req.CardType, req.Channel))
		return
	}

	// Calculate fee: (amount * basis_points / 10000) + fixed_fee
	percentageFee := (req.AmountKobo * int64(rule.BasisPoints)) / 10000
	totalFee := percentageFee + rule.FixedFeeKobo

	// Apply min/max
	if rule.MinFeeKobo > 0 && totalFee < rule.MinFeeKobo {
		totalFee = rule.MinFeeKobo
	}
	if rule.MaxFeeKobo > 0 && totalFee > rule.MaxFeeKobo {
		totalFee = rule.MaxFeeKobo
	}

	// Publish to Kafka for billing engine
	kc := kafka.GetProducer()
	eventData, _ := json.Marshal(map[string]any{
		"transaction_id": req.TxID,
		"merchant_id":    req.MerchantID,
		"amount_kobo":    req.AmountKobo,
		"fee_kobo":       totalFee,
		"rule_id":        rule.ID,
		"scheme":         req.Scheme,
		"channel":        req.Channel,
		"calculated_at":  time.Now().UTC(),
	})
	_ = kc.Publish(ctx, "interchange.calculated", "", string(eventData))

	writeJSON(w, http.StatusOK, map[string]any{
		"transaction_id": req.TxID,
		"amount_kobo":    req.AmountKobo,
		"fee_kobo":       totalFee,
		"percentage_fee": percentageFee,
		"fixed_fee":      rule.FixedFeeKobo,
		"basis_points":   rule.BasisPoints,
		"rule_id":        rule.ID,
		"scheme":         req.Scheme,
		"card_type":      req.CardType,
		"channel":        req.Channel,
	})
}

// ─── GetInterchangeSchedule ───────────────────────────────────────────────────

// GetInterchangeSchedule handles GET /v1/interchange/schedule
func GetInterchangeSchedule(w http.ResponseWriter, r *http.Request) {
	scheme := r.URL.Query().Get("scheme")
	ctx := r.Context()
	schedule := loadSchedule(ctx, scheme)
	writeJSON(w, http.StatusOK, map[string]any{
		"schedule": schedule,
		"count":    len(schedule),
		"as_of":    time.Now().UTC(),
	})
}

// ─── UpsertInterchangeSchedule ────────────────────────────────────────────────

// UpsertInterchangeSchedule handles PUT /v1/interchange/schedule
func UpsertInterchangeSchedule(w http.ResponseWriter, r *http.Request) {
	var entries []InterchangeScheduleEntry
	if err := decodeBody(r, &entries); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Persist to DB via portal
	if err := persistScheduleToDB(ctx, entries); err != nil {
		slog.Error("[interchange] failed to persist schedule", "err", err)
		writeError(w, http.StatusInternalServerError, "failed to save schedule")
		return
	}

	// Invalidate all scheme caches
	for _, scheme := range []string{"visa", "mastercard", "verve", "all"} {
		_ = rdb.Delete(ctx, "interchange:schedule:"+scheme)
	}

	slog.Info("[interchange] schedule updated", "count", len(entries))
	writeJSON(w, http.StatusOK, map[string]any{"updated": len(entries)})
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func loadSchedule(ctx context.Context, scheme string) []InterchangeScheduleEntry {
	// Use context from http.Request
	rdb := redis.Get()
	cacheKey := "interchange:schedule:" + scheme
	if scheme == "" {
		cacheKey = "interchange:schedule:all"
	}

	if cached, err := rdb.Get(ctx, cacheKey); err == nil {
		var schedule []InterchangeScheduleEntry
		if json.Unmarshal([]byte(cached), &schedule) == nil {
			return schedule
		}
	}

	// Filter default schedule by scheme
	result := make([]InterchangeScheduleEntry, 0)
	for _, e := range defaultSchedule {
		if scheme == "" || e.Scheme == scheme {
			result = append(result, e)
		}
	}
	return result
}

func findBestRule(schedule []InterchangeScheduleEntry, scheme, cardType, channel, mcc string) *InterchangeScheduleEntry {
	var best *InterchangeScheduleEntry
	bestScore := -1

	now := time.Now().UTC()
	for i := range schedule {
		e := &schedule[i]
		if e.Scheme != scheme {
			continue
		}
		if e.EffectiveTo != nil && e.EffectiveTo.Before(now) {
			continue
		}
		if e.EffectiveFrom.After(now) {
			continue
		}

		score := 0
		if e.CardType == cardType {
			score += 2
		} else if e.CardType != "" && e.CardType != cardType {
			continue
		}
		if e.Channel == channel {
			score += 2
		} else if e.Channel != "" && e.Channel != channel {
			continue
		}
		if e.MCC == mcc && mcc != "" {
			score += 1
		}

		if score > bestScore {
			bestScore = score
			best = e
		}
	}
	return best
}

func persistScheduleToDB(ctx context.Context, entries []InterchangeScheduleEntry) error {
	// Persist via portal internal API
	body, _ := json.Marshal(entries)
	reqHTTP, err := http.NewRequest(http.MethodPut,
		getEnvOrDefault("PORTAL_TRPC_URL", "http://localhost:3000")+"/api/internal/interchange-schedule",
		bytesReader(body),
	)
	if err != nil {
		return err
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("X-Internal-Key", getEnvOrDefault("MIDDLEWARE_INTERNAL_KEY", ""))

	client := &http.Client{Timeout: 10 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		return fmt.Errorf("portal returned HTTP %d", resp.StatusCode)
	}
	return nil
}
