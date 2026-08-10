// Package handlers — Loyalty Merchant v2
// Manages loyalty program configuration, coalition programs, and analytics.
package handlers

import (
	"encoding/json"
	"net/http"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/pgdb"
	"github.com/paygate/go-bridge/internal/redis"
)

// LoyaltyMerchantHandler manages merchant loyalty programs.
type LoyaltyMerchantHandler struct {
	db    *pgdb.DB
	redis *redis.Client
	kafka *kafka.Producer
}

// NewLoyaltyMerchantHandler creates a new LoyaltyMerchantHandler.
func NewLoyaltyMerchantHandler(db *pgdb.DB, r *redis.Client, k *kafka.Producer) *LoyaltyMerchantHandler {
	return &LoyaltyMerchantHandler{db: db, redis: r, kafka: k}
}

// ConfigureLoyaltyProgram POST /loyalty/configure
func (h *LoyaltyMerchantHandler) ConfigureLoyaltyProgram(w http.ResponseWriter, r *http.Request) {
	var req struct {
		MerchantID      string  `json:"merchant_id"`
		ProgramName     string  `json:"program_name"`
		PointsPerNaira  float64 `json:"points_per_naira"`
		RedemptionRate  float64 `json:"redemption_rate"`
		ExpiryDays      int     `json:"expiry_days"`
		WelcomeBonus    float64 `json:"welcome_bonus_points"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	programID := uuid.New().String()
	program := pgdb.LoyaltyProgramConfig{
		ID:             programID,
		MerchantID:     req.MerchantID,
		ProgramName:    req.ProgramName,
		PointsPerNaira: req.PointsPerNaira,
		RedemptionRate: req.RedemptionRate,
		ExpiryDays:     req.ExpiryDays,
		WelcomeBonus:   req.WelcomeBonus,
		Status:         "active",
		CreatedAt:      time.Now().UTC(),
	}
	if err := h.db.UpsertLoyaltyProgramConfig(r.Context(), program); err != nil {
		jsonError(w, "failed to configure loyalty program", http.StatusInternalServerError)
		return
	}
	cacheKey := "loyalty:program:" + req.MerchantID
	redis.SetWithTTL(r.Context(), cacheKey, program, time.Hour)
	_ = h.kafka.Publish(r.Context(), "paygate.loyalty.program.configured", programID, map[string]interface{}{
		"program_id":  programID,
		"merchant_id": req.MerchantID,
	})
	jsonOK(w, map[string]interface{}{
		"program_id": programID,
		"status":     "active",
	}, http.StatusCreated)
}

// GetLoyaltyAnalytics GET /loyalty/analytics
func (h *LoyaltyMerchantHandler) GetLoyaltyAnalytics(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	period := r.URL.Query().Get("period")
	if period == "" {
		period = "30d"
	}
	cacheKey := "loyalty:analytics:" + merchantID + ":" + period
	var cached map[string]interface{}
if ok, _ := redis.GetJSON(r.Context(), cacheKey, &cached); ok {
		jsonOK(w, cached, http.StatusOK)
		return
	}
	analytics, err := h.db.GetLoyaltyAnalytics(r.Context(), merchantID, period)
	if err != nil {
		jsonError(w, "failed to get analytics", http.StatusInternalServerError)
		return
	}
	redis.SetWithTTL(r.Context(), cacheKey, analytics, 5*time.Minute)
	jsonOK(w, analytics, http.StatusOK)
}

// CreateCoalition POST /loyalty/coalition
func (h *LoyaltyMerchantHandler) CreateCoalition(w http.ResponseWriter, r *http.Request) {
	var req struct {
		CoalitionName   string   `json:"coalition_name"`
		MerchantIDs     []string `json:"merchant_ids"`
		PointsPooled    bool     `json:"points_pooled"`
		CrossRedemption bool     `json:"cross_redemption"`
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		jsonError(w, err.Error(), http.StatusBadRequest)
		return
	}
	coalitionID := uuid.New().String()
	coalition := pgdb.LoyaltyCoalition{
		ID:          coalitionID,
		Name:        req.CoalitionName,
		MerchantIDs: req.MerchantIDs,
		Status:      "active",
		CreatedAt:   time.Now().UTC(),
	}
	if err := h.db.CreateLoyaltyCoalition(r.Context(), coalition); err != nil {
		jsonError(w, "failed to create coalition", http.StatusInternalServerError)
		return
	}
	_ = h.kafka.Publish(r.Context(), "paygate.loyalty.coalition.created", coalitionID, map[string]interface{}{
		"coalition_id": coalitionID,
		"merchant_ids": req.MerchantIDs,
	})
	jsonOK(w, map[string]interface{}{
		"coalition_id": coalitionID,
		"status":       "active",
		"members":      len(req.MerchantIDs),
	}, http.StatusCreated)
}

// GetRedemptionStats GET /loyalty/redemption-stats
func (h *LoyaltyMerchantHandler) GetRedemptionStats(w http.ResponseWriter, r *http.Request) {
	merchantID := r.URL.Query().Get("merchant_id")
	if merchantID == "" {
		jsonError(w, "merchant_id required", http.StatusBadRequest)
		return
	}
	stats, err := h.db.GetLoyaltyRedemptionStatsRange(r.Context(), merchantID, "", "")
	if err != nil {
		jsonError(w, "failed to get redemption stats", http.StatusInternalServerError)
		return
	}
	jsonOK(w, stats, http.StatusOK)
}
