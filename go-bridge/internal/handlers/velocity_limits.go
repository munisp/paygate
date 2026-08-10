package handlers

// velocity_limits.go — Sub-merchant Velocity Limit Enforcement
//
// Implements per-tenant transaction velocity controls backed by Redis counters
// and DB-persisted configuration. Enforced on every NIP transfer and payout.
//
// Velocity windows: per-minute, per-hour, per-day, per-month.
// Limits: max transaction count, max cumulative amount, max single transaction.
// Risk tiers: STANDARD, ELEVATED, HIGH_RISK — each with different defaults.

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

// VelocityWindow defines a time window for velocity counting.
type VelocityWindow string

const (
	WindowMinute VelocityWindow = "1m"
	WindowHour   VelocityWindow = "1h"
	WindowDay    VelocityWindow = "24h"
	WindowMonth  VelocityWindow = "30d"
)

// VelocityConfig holds per-merchant velocity limit configuration.
type VelocityConfig struct {
	MerchantID            string    `json:"merchant_id"`
	RiskTier              string    `json:"risk_tier"` // STANDARD, ELEVATED, HIGH_RISK
	MaxTxPerMinute        int       `json:"max_tx_per_minute"`
	MaxTxPerHour          int       `json:"max_tx_per_hour"`
	MaxTxPerDay           int       `json:"max_tx_per_day"`
	MaxTxPerMonth         int       `json:"max_tx_per_month"`
	MaxAmountKoboPerDay   int64     `json:"max_amount_kobo_per_day"`
	MaxAmountKoboPerMonth int64     `json:"max_amount_kobo_per_month"`
	MaxSingleTxKobo       int64     `json:"max_single_tx_kobo"`
	BlockOnBreach         bool      `json:"block_on_breach"`
	AlertOnBreach         bool      `json:"alert_on_breach"`
	UpdatedAt             time.Time `json:"updated_at"`
	UpdatedBy             string    `json:"updated_by"`
}

// defaultVelocityConfig returns CBN-compliant defaults per risk tier.
func defaultVelocityConfig(merchantID, riskTier string) VelocityConfig {
	cfg := VelocityConfig{
		MerchantID:    merchantID,
		RiskTier:      riskTier,
		BlockOnBreach: true,
		AlertOnBreach: true,
		UpdatedAt:     time.Now().UTC(),
	}
	switch riskTier {
	case "HIGH_RISK":
		cfg.MaxTxPerMinute = 5
		cfg.MaxTxPerHour = 50
		cfg.MaxTxPerDay = 200
		cfg.MaxTxPerMonth = 3000
		cfg.MaxAmountKoboPerDay = 50_000_000_00    // 500,000 NGN
		cfg.MaxAmountKoboPerMonth = 200_000_000_00 // 2,000,000 NGN
		cfg.MaxSingleTxKobo = 5_000_000_00         // 50,000 NGN
	case "ELEVATED":
		cfg.MaxTxPerMinute = 20
		cfg.MaxTxPerHour = 200
		cfg.MaxTxPerDay = 1000
		cfg.MaxTxPerMonth = 15000
		cfg.MaxAmountKoboPerDay = 500_000_000_00    // 5,000,000 NGN
		cfg.MaxAmountKoboPerMonth = 2000_000_000_00 // 20,000,000 NGN
		cfg.MaxSingleTxKobo = 50_000_000_00         // 500,000 NGN
	default: // STANDARD
		cfg.MaxTxPerMinute = 60
		cfg.MaxTxPerHour = 500
		cfg.MaxTxPerDay = 5000
		cfg.MaxTxPerMonth = 100000
		cfg.MaxAmountKoboPerDay = 5000_000_000_00    // 50,000,000 NGN
		cfg.MaxAmountKoboPerMonth = 20000_000_000_00 // 200,000,000 NGN
		cfg.MaxSingleTxKobo = 500_000_000_00         // 5,000,000 NGN
	}
	return cfg
}

// ─── GetVelocityConfig ────────────────────────────────────────────────────────

// GetVelocityConfig handles GET /v1/velocity/config/{merchant_id}
func GetVelocityConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.PathValue("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "merchant_id required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	cacheKey := fmt.Sprintf("velocity:config:%s", merchantID)
	if cached, err := rdb.Get(ctx, cacheKey); err == nil {
		var cfg VelocityConfig
		if json.Unmarshal([]byte(cached), &cfg) == nil {
			writeJSON(w, http.StatusOK, cfg)
			return
		}
	}

	// Fetch from DB via portal tRPC (bridge calls back to portal for DB reads)
	cfg, err := fetchVelocityConfigFromDB(ctx, merchantID)
	if err != nil {
		// Return defaults if not configured
		cfg = defaultVelocityConfig(merchantID, "STANDARD")
	}

	// Cache for 5 minutes
	if data, _ := json.Marshal(cfg); data != nil {
		_ = rdb.SetWithTTL(ctx, cacheKey, string(data), 5*time.Minute)
	}

	writeJSON(w, http.StatusOK, cfg)
}

// ─── UpsertVelocityConfig ─────────────────────────────────────────────────────

// UpsertVelocityConfig handles PUT /v1/velocity/config/{merchant_id}
func UpsertVelocityConfig(w http.ResponseWriter, r *http.Request) {
	merchantID := r.PathValue("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "merchant_id required")
		return
	}

	var cfg VelocityConfig
	if err := decodeBody(r, &cfg); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	cfg.MerchantID = merchantID
	cfg.UpdatedAt = time.Now().UTC()

	ctx := r.Context()
	rdb := redis.Get()

	// Persist to DB via portal bridge
	if err := persistVelocityConfigToDB(ctx, cfg); err != nil {
		slog.Error("[velocity] failed to persist config", "merchant_id", merchantID, "err", err)
		writeError(w, http.StatusInternalServerError, "failed to save velocity config")
		return
	}

	// Invalidate cache
	_ = rdb.Delete(ctx, fmt.Sprintf("velocity:config:%s", merchantID))

	// Publish config change event
	kc := kafka.GetProducer()
	eventData, _ := json.Marshal(map[string]any{
		"merchant_id": merchantID,
		"event":       "velocity_config_updated",
		"risk_tier":   cfg.RiskTier,
		"updated_by":  cfg.UpdatedBy,
		"updated_at":  cfg.UpdatedAt,
	})
	_ = kc.Publish(ctx, "velocity.config.updated", "", string(eventData))

	slog.Info("[velocity] config updated", "merchant_id", merchantID, "risk_tier", cfg.RiskTier)
	writeJSON(w, http.StatusOK, cfg)
}

// ─── CheckVelocity ────────────────────────────────────────────────────────────

// CheckVelocityRequest is the payload for POST /v1/velocity/check
type CheckVelocityRequest struct {
	MerchantID    string `json:"merchant_id"`
	AmountKobo    int64  `json:"amount_kobo"`
	TransactionID string `json:"transaction_id"`
	Channel       string `json:"channel"` // nip, card, ussd, pos, api
}

// CheckVelocityResponse is the response for POST /v1/velocity/check
type CheckVelocityResponse struct {
	Allowed       bool             `json:"allowed"`
	BlockedReason string           `json:"blocked_reason,omitempty"`
	Counters      map[string]int64 `json:"counters"`
	Limits        map[string]int64 `json:"limits"`
	RiskTier      string           `json:"risk_tier"`
}

// CheckVelocity handles POST /v1/velocity/check
// Called by NIP transfer and payout procedures before processing.
func CheckVelocity(w http.ResponseWriter, r *http.Request) {
	var req CheckVelocityRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MerchantID == "" || req.AmountKobo <= 0 {
		writeError(w, http.StatusBadRequest, "merchant_id and amount_kobo required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Load velocity config
	cfg, err := fetchVelocityConfigFromDB(ctx, req.MerchantID)
	if err != nil {
		cfg = defaultVelocityConfig(req.MerchantID, "STANDARD")
	}

	now := time.Now().UTC()
	counters := map[string]int64{}
	limits := map[string]int64{}

	// Check single transaction limit
	if req.AmountKobo > cfg.MaxSingleTxKobo {
		publishVelocityBreach(ctx, req.MerchantID, req.TransactionID, "single_tx_limit_exceeded", req.AmountKobo, cfg.MaxSingleTxKobo)
		writeJSON(w, http.StatusOK, CheckVelocityResponse{
			Allowed:       !cfg.BlockOnBreach,
			BlockedReason: fmt.Sprintf("single transaction amount %d exceeds limit %d kobo", req.AmountKobo, cfg.MaxSingleTxKobo),
			Counters:      counters,
			Limits:        limits,
			RiskTier:      cfg.RiskTier,
		})
		return
	}

	// Check per-minute count
	minKey := fmt.Sprintf("velocity:count:%s:1m:%s", req.MerchantID, now.Format("2006-01-02T15:04"))
	minCount, _ := rdb.IncrWithTTL(ctx, minKey, time.Minute)
	counters["per_minute"] = minCount
	limits["per_minute"] = int64(cfg.MaxTxPerMinute)
	if minCount > int64(cfg.MaxTxPerMinute) {
		publishVelocityBreach(ctx, req.MerchantID, req.TransactionID, "per_minute_count_exceeded", minCount, int64(cfg.MaxTxPerMinute))
		writeJSON(w, http.StatusOK, CheckVelocityResponse{
			Allowed:       !cfg.BlockOnBreach,
			BlockedReason: fmt.Sprintf("per-minute transaction count %d exceeds limit %d", minCount, cfg.MaxTxPerMinute),
			Counters:      counters,
			Limits:        limits,
			RiskTier:      cfg.RiskTier,
		})
		return
	}

	// Check per-hour count
	hourKey := fmt.Sprintf("velocity:count:%s:1h:%s", req.MerchantID, now.Format("2006-01-02T15"))
	hourCount, _ := rdb.IncrWithTTL(ctx, hourKey, time.Hour)
	counters["per_hour"] = hourCount
	limits["per_hour"] = int64(cfg.MaxTxPerHour)
	if hourCount > int64(cfg.MaxTxPerHour) {
		publishVelocityBreach(ctx, req.MerchantID, req.TransactionID, "per_hour_count_exceeded", hourCount, int64(cfg.MaxTxPerHour))
		writeJSON(w, http.StatusOK, CheckVelocityResponse{
			Allowed:       !cfg.BlockOnBreach,
			BlockedReason: fmt.Sprintf("per-hour transaction count %d exceeds limit %d", hourCount, cfg.MaxTxPerHour),
			Counters:      counters,
			Limits:        limits,
			RiskTier:      cfg.RiskTier,
		})
		return
	}

	// Check per-day count
	dayKey := fmt.Sprintf("velocity:count:%s:24h:%s", req.MerchantID, now.Format("2006-01-02"))
	dayCount, _ := rdb.IncrWithTTL(ctx, dayKey, 24*time.Hour)
	counters["per_day"] = dayCount
	limits["per_day"] = int64(cfg.MaxTxPerDay)
	if dayCount > int64(cfg.MaxTxPerDay) {
		publishVelocityBreach(ctx, req.MerchantID, req.TransactionID, "per_day_count_exceeded", dayCount, int64(cfg.MaxTxPerDay))
		writeJSON(w, http.StatusOK, CheckVelocityResponse{
			Allowed:       !cfg.BlockOnBreach,
			BlockedReason: fmt.Sprintf("per-day transaction count %d exceeds limit %d", dayCount, cfg.MaxTxPerDay),
			Counters:      counters,
			Limits:        limits,
			RiskTier:      cfg.RiskTier,
		})
		return
	}

	// Check per-day cumulative amount
	dayAmtKey := fmt.Sprintf("velocity:amount:%s:24h:%s", req.MerchantID, now.Format("2006-01-02"))
	dayAmt, _ := rdb.IncrByWithTTL(ctx, dayAmtKey, req.AmountKobo, 24*time.Hour)
	counters["day_amount_kobo"] = dayAmt
	limits["day_amount_kobo"] = cfg.MaxAmountKoboPerDay
	if dayAmt > cfg.MaxAmountKoboPerDay {
		publishVelocityBreach(ctx, req.MerchantID, req.TransactionID, "daily_amount_exceeded", dayAmt, cfg.MaxAmountKoboPerDay)
		writeJSON(w, http.StatusOK, CheckVelocityResponse{
			Allowed:       !cfg.BlockOnBreach,
			BlockedReason: fmt.Sprintf("daily cumulative amount %d exceeds limit %d kobo", dayAmt, cfg.MaxAmountKoboPerDay),
			Counters:      counters,
			Limits:        limits,
			RiskTier:      cfg.RiskTier,
		})
		return
	}

	// All checks passed
	writeJSON(w, http.StatusOK, CheckVelocityResponse{
		Allowed:  true,
		Counters: counters,
		Limits:   limits,
		RiskTier: cfg.RiskTier,
	})
}

// ─── GetVelocityCounters ──────────────────────────────────────────────────────

// GetVelocityCounters handles GET /v1/velocity/counters/{merchant_id}
// Returns current live counters for a merchant (for dashboard display).
func GetVelocityCounters(w http.ResponseWriter, r *http.Request) {
	merchantID := r.PathValue("merchant_id")
	if merchantID == "" {
		writeError(w, http.StatusBadRequest, "merchant_id required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()
	now := time.Now().UTC()

	counters := map[string]int64{}

	keys := map[string]string{
		"per_minute": fmt.Sprintf("velocity:count:%s:1m:%s", merchantID, now.Format("2006-01-02T15:04")),
		"per_hour":   fmt.Sprintf("velocity:count:%s:1h:%s", merchantID, now.Format("2006-01-02T15")),
		"per_day":    fmt.Sprintf("velocity:count:%s:24h:%s", merchantID, now.Format("2006-01-02")),
		"day_amount": fmt.Sprintf("velocity:amount:%s:24h:%s", merchantID, now.Format("2006-01-02")),
	}

	for k, key := range keys {
		if val, err := rdb.Get(ctx, key); err == nil {
			var n int64
			fmt.Sscanf(val, "%d", &n)
			counters[k] = n
		}
	}

	writeJSON(w, http.StatusOK, map[string]any{
		"merchant_id": merchantID,
		"counters":    counters,
		"as_of":       now,
	})
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func publishVelocityBreach(ctx context.Context, merchantID, txID, reason string, current, limit int64) {
	kc := kafka.GetProducer()
	data, _ := json.Marshal(map[string]any{
		"merchant_id":    merchantID,
		"transaction_id": txID,
		"breach_reason":  reason,
		"current_value":  current,
		"limit_value":    limit,
		"breached_at":    time.Now().UTC(),
	})
	if err := kc.Publish(ctx, "velocity.breach", "", string(data)); err != nil {
		slog.Error("[velocity] failed to publish breach event", "err", err)
	}
	slog.Warn("[velocity] breach detected",
		"merchant_id", merchantID,
		"reason", reason,
		"current", current,
		"limit", limit,
	)
}

func fetchVelocityConfigFromDB(ctx context.Context, merchantID string) (VelocityConfig, error) {
	reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodGet,
		getEnvOrDefault("PORTAL_TRPC_URL", "http://localhost:3000")+"/api/internal/velocity-config/"+merchantID,
		nil,
	)
	if err != nil {
		return VelocityConfig{}, err
	}
	reqHTTP.Header.Set("X-Internal-Key", getEnvOrDefault("MIDDLEWARE_INTERNAL_KEY", ""))

	client := &http.Client{Timeout: 5 * time.Second}
	resp, err := client.Do(reqHTTP)
	if err != nil {
		return VelocityConfig{}, err
	}
	defer resp.Body.Close()

	if resp.StatusCode == http.StatusNotFound {
		return VelocityConfig{}, fmt.Errorf("not found")
	}

	var cfg VelocityConfig
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return VelocityConfig{}, err
	}
	return cfg, nil
}

func persistVelocityConfigToDB(ctx context.Context, cfg VelocityConfig) error {
	body, _ := json.Marshal(cfg)
	reqHTTP, err := http.NewRequestWithContext(ctx, http.MethodPut,
		getEnvOrDefault("PORTAL_TRPC_URL", "http://localhost:3000")+"/api/internal/velocity-config/"+cfg.MerchantID,
		bytesReader(body),
	)
	if err != nil {
		return err
	}
	reqHTTP.Header.Set("Content-Type", "application/json")
	reqHTTP.Header.Set("X-Internal-Key", getEnvOrDefault("MIDDLEWARE_INTERNAL_KEY", ""))

	client := &http.Client{Timeout: 5 * time.Second}
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
