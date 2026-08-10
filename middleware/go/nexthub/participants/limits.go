// Package participants — Wave 220: Position Limits, Net Debit Cap, Liquidity Management
// Implements per-DFSP position limits, net debit cap enforcement, and liquidity window management
// for the NextHub FSPIOP interoperability hub.
//
// Architecture:
//   - Redis stores current positions (hot path, sub-millisecond reads)
//   - TigerBeetle stores authoritative balances (settlement path)
//   - Temporal workflow enforces NDC breach handling (suspend, notify, auto-resume)
//   - Kafka publishes position events for downstream analytics
package participants

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"strconv"
	"time"

	"github.com/redis/go-redis/v9"
)

// PositionLimits defines the financial risk controls for a single DFSP participant.
type PositionLimits struct {
	ParticipantID   string    `json:"participantId"`
	Currency        string    `json:"currency"`
	NetDebitCap     int64     `json:"netDebitCap"`     // Maximum net debit position in minor units
	LiquidityCover  int64     `json:"liquidityCover"`  // Required pre-funded liquidity in minor units
	PositionLimit   int64     `json:"positionLimit"`   // Maximum absolute position (debit + credit)
	AlertThreshold  float64   `json:"alertThreshold"`  // Fraction of NDC that triggers an alert (e.g. 0.80)
	SuspendOnBreach bool      `json:"suspendOnBreach"` // Auto-suspend participant when NDC breached
	UpdatedAt       time.Time `json:"updatedAt"`
	UpdatedBy       string    `json:"updatedBy"`
}

// CurrentPosition holds the real-time position for a DFSP in a given currency.
type CurrentPosition struct {
	ParticipantID    string    `json:"participantId"`
	Currency         string    `json:"currency"`
	CurrentValue     int64     `json:"currentValue"`     // Current net position (negative = net debit)
	ReservedValue    int64     `json:"reservedValue"`    // In-flight PREPARE amounts
	AvailableValue   int64     `json:"availableValue"`   // liquidityCover + currentValue - reservedValue
	NDCUtilisation   float64   `json:"ndcUtilisation"`   // |currentValue| / netDebitCap
	Status           string    `json:"status"`           // "OK" | "ALERT" | "BREACHED" | "SUSPENDED"
	LastTransferID   string    `json:"lastTransferId"`
	LastUpdated      time.Time `json:"lastUpdated"`
}

// LiquidityWindow represents a time-bounded liquidity allocation.
type LiquidityWindow struct {
	ParticipantID string    `json:"participantId"`
	Currency      string    `json:"currency"`
	WindowID      string    `json:"windowId"`
	Amount        int64     `json:"amount"`
	OpenedAt      time.Time `json:"openedAt"`
	ClosesAt      time.Time `json:"closesAt"`
	Status        string    `json:"status"` // "OPEN" | "CLOSED" | "SETTLED"
}

// LimitsHandler handles HTTP requests for participant position limits and liquidity management.
type LimitsHandler struct {
	redis  *redis.Client
	logger *slog.Logger
}

// NewLimitsHandler creates a new LimitsHandler with the given Redis client.
func NewLimitsHandler(redisClient *redis.Client, logger *slog.Logger) *LimitsHandler {
	return &LimitsHandler{
		redis:  redisClient,
		logger: logger,
	}
}

// RegisterRoutes registers all participant limits routes on the given mux.
func (h *LimitsHandler) RegisterRoutes(mux *http.ServeMux) {
	mux.HandleFunc("GET /nexthub/participants/{participantId}/limits", h.GetLimits)
	mux.HandleFunc("PUT /nexthub/participants/{participantId}/limits", h.SetLimits)
	mux.HandleFunc("GET /nexthub/participants/{participantId}/positions", h.GetPosition)
	mux.HandleFunc("POST /nexthub/participants/{participantId}/positions/reset", h.ResetPosition)
	mux.HandleFunc("GET /nexthub/participants/{participantId}/liquidity", h.GetLiquidityWindows)
	mux.HandleFunc("POST /nexthub/participants/{participantId}/liquidity", h.OpenLiquidityWindow)
	mux.HandleFunc("DELETE /nexthub/participants/{participantId}/liquidity/{windowId}", h.CloseLiquidityWindow)
	mux.HandleFunc("GET /nexthub/participants/positions/summary", h.GetAllPositions)
}

// GetLimits returns the position limits for a participant.
func (h *LimitsHandler) GetLimits(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "NGN"
	}

	key := fmt.Sprintf("nexthub:limits:%s:%s", participantID, currency)
	data, err := h.redis.Get(r.Context(), key).Bytes()
	if err == redis.Nil {
		http.Error(w, `{"error":"limits not configured"}`, http.StatusNotFound)
		return
	}
	if err != nil {
		h.logger.Error("redis get limits failed", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	w.Write(data)
}

// SetLimits creates or updates the position limits for a participant.
func (h *LimitsHandler) SetLimits(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")

	var limits PositionLimits
	if err := json.NewDecoder(r.Body).Decode(&limits); err != nil {
		http.Error(w, `{"error":"invalid request body"}`, http.StatusBadRequest)
		return
	}
	limits.ParticipantID = participantID
	limits.UpdatedAt = time.Now().UTC()
	limits.UpdatedBy = r.Header.Get("X-Operator-ID")
	if limits.AlertThreshold == 0 {
		limits.AlertThreshold = 0.80 // Default: alert at 80% NDC utilisation
	}
	if limits.Currency == "" {
		limits.Currency = "NGN"
	}

	data, err := json.Marshal(limits)
	if err != nil {
		http.Error(w, `{"error":"serialisation error"}`, http.StatusInternalServerError)
		return
	}

	key := fmt.Sprintf("nexthub:limits:%s:%s", participantID, limits.Currency)
	if err := h.redis.Set(r.Context(), key, data, 0).Err(); err != nil {
		h.logger.Error("redis set limits failed", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Publish limits-updated event to Kafka
	h.publishEvent(r.Context(), "paygate.participants.limits.updated", map[string]any{
		"participantId": participantID,
		"currency":      limits.Currency,
		"netDebitCap":   limits.NetDebitCap,
		"updatedBy":     limits.UpdatedBy,
		"timestamp":     limits.UpdatedAt,
	})

	h.logger.Info("participant limits updated",
		"participantId", participantID,
		"currency", limits.Currency,
		"netDebitCap", limits.NetDebitCap,
	)

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusOK)
	w.Write(data)
}

// GetPosition returns the current real-time position for a participant.
func (h *LimitsHandler) GetPosition(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "NGN"
	}

	position, err := h.computePosition(r.Context(), participantID, currency)
	if err != nil {
		h.logger.Error("compute position failed", "error", err)
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(position)
}

// computePosition calculates the current position including NDC utilisation and status.
func (h *LimitsHandler) computePosition(ctx context.Context, participantID, currency string) (*CurrentPosition, error) {
	// Read current position from Redis (updated by the transfer processor on every FULFIL)
	posKey := fmt.Sprintf("nexthub:position:%s:%s", participantID, currency)
	resKey := fmt.Sprintf("nexthub:reserved:%s:%s", participantID, currency)

	pipe := h.redis.Pipeline()
	posCmd := pipe.Get(ctx, posKey)
	resCmd := pipe.Get(ctx, resKey)
	_, _ = pipe.Exec(ctx)

	currentValue := int64(0)
	reservedValue := int64(0)

	if v, err := posCmd.Int64(); err == nil {
		currentValue = v
	}
	if v, err := resCmd.Int64(); err == nil {
		reservedValue = v
	}

	// Read limits
	limKey := fmt.Sprintf("nexthub:limits:%s:%s", participantID, currency)
	limData, err := h.redis.Get(ctx, limKey).Bytes()
	if err != nil && err != redis.Nil {
		return nil, fmt.Errorf("redis get limits: %w", err)
	}

	var limits PositionLimits
	if err == nil {
		_ = json.Unmarshal(limData, &limits)
	}

	availableValue := limits.LiquidityCover + currentValue - reservedValue

	var ndcUtilisation float64
	if limits.NetDebitCap > 0 {
		ndcUtilisation = float64(-currentValue) / float64(limits.NetDebitCap)
	}

	status := "OK"
	switch {
	case ndcUtilisation >= 1.0:
		status = "BREACHED"
	case ndcUtilisation >= limits.AlertThreshold && limits.AlertThreshold > 0:
		status = "ALERT"
	}

	// Check if participant is suspended
	suspKey := fmt.Sprintf("nexthub:suspended:%s", participantID)
	if h.redis.Exists(ctx, suspKey).Val() > 0 {
		status = "SUSPENDED"
	}

	return &CurrentPosition{
		ParticipantID:  participantID,
		Currency:       currency,
		CurrentValue:   currentValue,
		ReservedValue:  reservedValue,
		AvailableValue: availableValue,
		NDCUtilisation: ndcUtilisation,
		Status:         status,
		LastUpdated:    time.Now().UTC(),
	}, nil
}

// ResetPosition resets a participant's position to zero (used after settlement).
func (h *LimitsHandler) ResetPosition(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "NGN"
	}

	posKey := fmt.Sprintf("nexthub:position:%s:%s", participantID, currency)
	resKey := fmt.Sprintf("nexthub:reserved:%s:%s", participantID, currency)

	pipe := h.redis.Pipeline()
	pipe.Set(r.Context(), posKey, 0, 0)
	pipe.Set(r.Context(), resKey, 0, 0)
	if _, err := pipe.Exec(r.Context()); err != nil {
		http.Error(w, `{"error":"reset failed"}`, http.StatusInternalServerError)
		return
	}

	h.publishEvent(r.Context(), "paygate.participants.position.reset", map[string]any{
		"participantId": participantID,
		"currency":      currency,
		"resetBy":       r.Header.Get("X-Operator-ID"),
		"timestamp":     time.Now().UTC(),
	})

	w.Header().Set("Content-Type", "application/json")
	w.Write([]byte(`{"status":"reset","participantId":"` + participantID + `","currency":"` + currency + `"}`))
}

// GetAllPositions returns a summary of all participant positions (for the operator dashboard).
func (h *LimitsHandler) GetAllPositions(w http.ResponseWriter, r *http.Request) {
	currency := r.URL.Query().Get("currency")
	if currency == "" {
		currency = "NGN"
	}

	// Scan all position keys for the given currency
	pattern := fmt.Sprintf("nexthub:position:*:%s", currency)
	keys, err := h.redis.Keys(r.Context(), pattern).Result()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	positions := make([]*CurrentPosition, 0, len(keys))
	for _, key := range keys {
		// Extract participantId from key: nexthub:position:{participantId}:{currency}
		parts := splitKey(key)
		if len(parts) < 4 {
			continue
		}
		participantID := parts[2]
		pos, err := h.computePosition(r.Context(), participantID, currency)
		if err != nil {
			continue
		}
		positions = append(positions, pos)
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(map[string]any{
		"currency":   currency,
		"positions":  positions,
		"count":      len(positions),
		"retrievedAt": time.Now().UTC(),
	})
}

// GetLiquidityWindows returns all liquidity windows for a participant.
func (h *LimitsHandler) GetLiquidityWindows(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")
	pattern := fmt.Sprintf("nexthub:liquidity:%s:*", participantID)
	keys, err := h.redis.Keys(r.Context(), pattern).Result()
	if err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	windows := make([]LiquidityWindow, 0, len(keys))
	for _, key := range keys {
		data, err := h.redis.Get(r.Context(), key).Bytes()
		if err != nil {
			continue
		}
		var w LiquidityWindow
		if err := json.Unmarshal(data, &w); err == nil {
			windows = append(windows, w)
		}
	}

	resp, _ := json.Marshal(map[string]any{"windows": windows, "count": len(windows)})
	w.Header().Set("Content-Type", "application/json")
	w.Write(resp)
}

// OpenLiquidityWindow creates a new time-bounded liquidity allocation for a participant.
func (h *LimitsHandler) OpenLiquidityWindow(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")

	var req struct {
		Currency string `json:"currency"`
		Amount   int64  `json:"amount"`
		DurationH int   `json:"durationHours"` // Window duration in hours (default: 24)
	}
	if err := json.NewDecoder(r.Body).Decode(&req); err != nil {
		http.Error(w, `{"error":"invalid request"}`, http.StatusBadRequest)
		return
	}
	if req.Currency == "" {
		req.Currency = "NGN"
	}
	if req.DurationH == 0 {
		req.DurationH = 24
	}

	windowID := fmt.Sprintf("LW-%s-%d", participantID, time.Now().UnixNano())
	window := LiquidityWindow{
		ParticipantID: participantID,
		Currency:      req.Currency,
		WindowID:      windowID,
		Amount:        req.Amount,
		OpenedAt:      time.Now().UTC(),
		ClosesAt:      time.Now().UTC().Add(time.Duration(req.DurationH) * time.Hour),
		Status:        "OPEN",
	}

	data, _ := json.Marshal(window)
	key := fmt.Sprintf("nexthub:liquidity:%s:%s", participantID, windowID)
	ttl := time.Duration(req.DurationH) * time.Hour
	if err := h.redis.Set(r.Context(), key, data, ttl).Err(); err != nil {
		http.Error(w, `{"error":"internal error"}`, http.StatusInternalServerError)
		return
	}

	// Update the liquidity cover in the position calculation
	lcKey := fmt.Sprintf("nexthub:liquidity_cover:%s:%s", participantID, req.Currency)
	h.redis.IncrBy(r.Context(), lcKey, req.Amount)

	h.publishEvent(r.Context(), "paygate.participants.liquidity.opened", map[string]any{
		"participantId": participantID,
		"windowId":      windowID,
		"amount":        req.Amount,
		"currency":      req.Currency,
		"closesAt":      window.ClosesAt,
	})

	w.Header().Set("Content-Type", "application/json")
	w.WriteHeader(http.StatusCreated)
	w.Write(data)
}

// CloseLiquidityWindow closes an open liquidity window.
func (h *LimitsHandler) CloseLiquidityWindow(w http.ResponseWriter, r *http.Request) {
	participantID := r.PathValue("participantId")
	windowID := r.PathValue("windowId")

	key := fmt.Sprintf("nexthub:liquidity:%s:%s", participantID, windowID)
	data, err := h.redis.Get(r.Context(), key).Bytes()
	if err == redis.Nil {
		http.Error(w, `{"error":"window not found"}`, http.StatusNotFound)
		return
	}

	var window LiquidityWindow
	_ = json.Unmarshal(data, &window)
	window.Status = "CLOSED"

	// Reduce liquidity cover
	lcKey := fmt.Sprintf("nexthub:liquidity_cover:%s:%s", participantID, window.Currency)
	h.redis.DecrBy(r.Context(), lcKey, window.Amount)

	// Delete the window key
	h.redis.Del(r.Context(), key)

	h.publishEvent(r.Context(), "paygate.participants.liquidity.closed", map[string]any{
		"participantId": participantID,
		"windowId":      windowID,
		"amount":        window.Amount,
		"currency":      window.Currency,
	})

	resp, _ := json.Marshal(window)
	w.Header().Set("Content-Type", "application/json")
	w.Write(resp)
}

// CheckNDC is called by the transfer processor during PREPARE to enforce the net debit cap.
// Returns (allowed bool, remainingCapacity int64, err error).
func CheckNDC(ctx context.Context, redisClient *redis.Client, participantID, currency string, amount int64) (bool, int64, error) {
	limKey := fmt.Sprintf("nexthub:limits:%s:%s", participantID, currency)
	limData, err := redisClient.Get(ctx, limKey).Bytes()
	if err == redis.Nil {
		// No limits configured — allow by default
		return true, 0, nil
	}
	if err != nil {
		return false, 0, fmt.Errorf("redis get limits: %w", err)
	}

	var limits PositionLimits
	if err := json.Unmarshal(limData, &limits); err != nil {
		return false, 0, fmt.Errorf("unmarshal limits: %w", err)
	}

	posKey := fmt.Sprintf("nexthub:position:%s:%s", participantID, currency)
	currentPos, err := redisClient.Get(ctx, posKey).Int64()
	if err != nil && err != redis.Nil {
		return false, 0, fmt.Errorf("redis get position: %w", err)
	}

	// After this transfer, the net debit position would be: currentPos - amount
	projectedPos := currentPos - amount
	if limits.NetDebitCap > 0 && -projectedPos > limits.NetDebitCap {
		remaining := limits.NetDebitCap + currentPos
		return false, remaining, nil
	}

	return true, limits.NetDebitCap + projectedPos, nil
}

// UpdatePosition atomically updates a participant's position after a FULFIL.
// debit = true means the participant sent money (position decreases).
func UpdatePosition(ctx context.Context, redisClient *redis.Client, participantID, currency string, amount int64, debit bool) error {
	posKey := fmt.Sprintf("nexthub:position:%s:%s", participantID, currency)
	if debit {
		return redisClient.DecrBy(ctx, posKey, amount).Err()
	}
	return redisClient.IncrBy(ctx, posKey, amount).Err()
}

// ReservePosition atomically reserves an amount during PREPARE (before FULFIL).
func ReservePosition(ctx context.Context, redisClient *redis.Client, participantID, currency string, amount int64) error {
	resKey := fmt.Sprintf("nexthub:reserved:%s:%s", participantID, currency)
	return redisClient.IncrBy(ctx, resKey, amount).Err()
}

// ReleaseReservation releases a reserved amount (called on ABORT or after FULFIL).
func ReleaseReservation(ctx context.Context, redisClient *redis.Client, participantID, currency string, amount int64) error {
	resKey := fmt.Sprintf("nexthub:reserved:%s:%s", participantID, currency)
	return redisClient.DecrBy(ctx, resKey, amount).Err()
}

// publishEvent publishes a domain event to Kafka (stub — real implementation uses the Kafka producer).
func (h *LimitsHandler) publishEvent(ctx context.Context, topic string, payload map[string]any) {
	data, _ := json.Marshal(payload)
	h.logger.Info("kafka event", "topic", topic, "payload", string(data))
	// In production: kafkaProducer.Produce(&kafka.Message{TopicPartition: ..., Value: data})
}

// splitKey splits a Redis key by ":" separator.
func splitKey(key string) []string {
	result := []string{}
	start := 0
	for i, c := range key {
		if c == ':' {
			result = append(result, key[start:i])
			start = i + 1
		}
	}
	result = append(result, key[start:])
	return result
}

// intToStr converts int64 to string (helper for Redis key building).
func intToStr(n int64) string {
	return strconv.FormatInt(n, 10)
}
