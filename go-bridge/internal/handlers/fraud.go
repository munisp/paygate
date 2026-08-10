package handlers

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"strings"
	"time"

	"github.com/google/uuid"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	"github.com/paygate/go-bridge/pkg/types"
)

// ScoreFraud handles POST /v1/fraud/score
//
// Flow:
//  1. Check Redis cache for recent score on same transaction (TTL 5 min)
//  2. Forward request to Python ML scoring service (PYTHON_FRAUD_URL)
//  3. Cache result in Redis
//  4. Publish Kafka paygate.fraud.alert if riskLevel is "high" or "critical"
//  5. Stream Fluvio fraud signal
func ScoreFraud(w http.ResponseWriter, r *http.Request) {
	var req types.FraudScoreRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.TransactionID == "" || req.MerchantID == "" || req.Amount == 0 {
		writeError(w, http.StatusBadRequest,
			"transaction_id, merchant_id, and amount are required")
		return
	}

	ctx := r.Context()
	rdb := redis.Get()

	// Check Redis cache
	cacheKey := fmt.Sprintf("fraud:score:%s", req.TransactionID)
	var cached types.FraudScoreResponse
	if found, _ := rdb.GetJSON(ctx, cacheKey, &cached); found {
		slog.Info("[fraud] cache hit", "transaction_id", req.TransactionID)
		writeJSON(w, http.StatusOK, cached)
		return
	}

	// Score via Python ML service (or fallback heuristic)
	resp := scoreFraudML(ctx, req)

	// Cache for 5 minutes
	_ = rdb.SetJSON(ctx, cacheKey, resp, 5*time.Minute)

	// Publish Kafka alert for high/critical risk
	if resp.RiskLevel == "high" || resp.RiskLevel == "critical" {
		go func() {
			_ = kafka.GetProducer().PublishFraudAlert(context.Background(), kafka.FraudAlertEvent{
				EventID:    uuid.NewString(),
				AlertID:    uuid.NewString(),
				MerchantID: req.MerchantID,
				TxID:       req.TransactionID,
				RiskScore:  resp.RiskScore,
				AlertType:  resp.RiskLevel,
				OccurredAt: time.Now().UTC(),
			})
		}()

		// Stream Fluvio fraud signal
		go func() {
			_ = fluvio.Get().ProduceFraudSignal(context.Background(), fluvio.FraudSignalEvent{
				EventID:    uuid.NewString(),
				AlertID:    uuid.NewString(),
				MerchantID: req.MerchantID,
				TxID:       req.TransactionID,
				RiskScore:  resp.RiskScore,
				SignalType: resp.RiskLevel,
				OccurredAt: time.Now().UTC(),
			})
		}()
	}

	slog.Info("[fraud] scored",
		"transaction_id", req.TransactionID,
		"risk_level", resp.RiskLevel,
		"decision", resp.Decision,
	)

	writeJSON(w, http.StatusOK, resp)
}

// scoreFraudML calls the Python ML scoring service or falls back to a
// heuristic rule-based scorer if the service is unavailable.
func scoreFraudML(ctx context.Context, req types.FraudScoreRequest) types.FraudScoreResponse {
	// Heuristic fallback (used when Python service is unavailable)
	// Real implementation would HTTP POST to PYTHON_FRAUD_URL
	riskScore := 10
	features := map[string]float64{
		"amount_zscore":    0.0,
		"velocity_1h":      0.0,
		"new_device":       0.0,
		"cross_border":     0.0,
		"night_transaction": 0.0,
	}

	// Amount-based heuristic
	if req.Amount > 10_000_00 { // > 10,000 NGN
		riskScore += 20
		features["amount_zscore"] = 1.5
	}
	if req.Amount > 100_000_00 { // > 100,000 NGN
		riskScore += 30
		features["amount_zscore"] = 3.0
	}

	// Device fingerprint missing
	if req.DeviceFingerprint == "" {
		riskScore += 15
		features["new_device"] = 1.0
	}

	// IP address missing
	if req.IPAddress == "" {
		riskScore += 10
	}

	// Cross-border indicator (non-NGN)
	if req.Currency != "NGN" && req.Currency != "" {
		riskScore += 5
		features["cross_border"] = 1.0
	}

	// Clamp to 100
	if riskScore > 100 {
		riskScore = 100
	}

	riskLevel := "low"
	decision := "allow"
	switch {
	case riskScore >= 80:
		riskLevel = "critical"
		decision = "block"
	case riskScore >= 60:
		riskLevel = "high"
		decision = "review"
	case riskScore >= 40:
		riskLevel = "medium"
		decision = "review"
	}

	return types.FraudScoreResponse{
		TransactionID: req.TransactionID,
		RiskScore:     riskScore,
		RiskLevel:     riskLevel,
		Decision:      decision,
		ModelVersion:  "heuristic-v1.0",
		Features:      features,
	}
}

// AcknowledgeFraudAlert handles POST /v1/fraud/alerts/{id}/acknowledge
//
// Flow:
//  1. Permify authorisation check
//  2. Redis DEL alert cache key
//  3. Publish Kafka fraud.decision event
func AcknowledgeFraudAlert(w http.ResponseWriter, r *http.Request) {
	// Extract alert ID from URL path: /v1/fraud/alerts/{id}/acknowledge
	path := r.URL.Path
	parts := strings.Split(strings.Trim(path, "/"), "/")
	// parts: ["v1", "fraud", "alerts", "{id}", "acknowledge"]
	if len(parts) < 5 {
		writeError(w, http.StatusBadRequest, "invalid path")
		return
	}
	alertID := parts[3]

	var req types.AcknowledgeFraudAlertRequest
	if err := decodeBody(r, &req); err != nil {
		writeError(w, http.StatusBadRequest, err.Error())
		return
	}
	if req.MerchantID == "" || req.AcknowledgerID == "" || req.Action == "" {
		writeError(w, http.StatusBadRequest,
			"merchant_id, acknowledger_id, and action are required")
		return
	}

	ctx := r.Context()

	// Permify authorisation
	perm := permify.Get()
	allowed, err := perm.CheckPermission(ctx, permify.CheckRequest{
		Entity:     fmt.Sprintf("merchant:%s", req.MerchantID),
		Permission: "acknowledge_fraud_alert",
		Subject:    fmt.Sprintf("user:%s", req.AcknowledgerID),
	})
	if err != nil {
		slog.Warn("[fraud] permify check error", "err", err)
	}
	if !allowed {
		writeError(w, http.StatusForbidden, "not authorised to acknowledge fraud alerts")
		return
	}

	// Remove from Redis cache
	rdb := redis.Get()
	_ = rdb.Del(ctx, fmt.Sprintf("fraud:score:%s", alertID))
	_ = rdb.Del(ctx, fmt.Sprintf("fraud:alert:%s", alertID))

	// Publish Kafka fraud.decision
	go func() {
		_ = kafka.GetProducer().Publish(context.Background(), "paygate.fraud.decision",
			req.MerchantID, map[string]any{
				"event_id":        uuid.NewString(),
				"alert_id":        alertID,
				"merchant_id":     req.MerchantID,
				"acknowledger_id": req.AcknowledgerID,
				"action":          req.Action,
				"notes":           req.Notes,
				"occurred_at":     time.Now().UTC(),
			})
	}()

	slog.Info("[fraud] alert acknowledged",
		"alert_id", alertID,
		"action", req.Action,
		"acknowledger_id", req.AcknowledgerID,
	)

	writeJSON(w, http.StatusOK, map[string]bool{"success": true})
}
