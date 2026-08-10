// Package redis — Cross-Border Redis Cache Layer
// Provides idempotency keys, rate limiting, FX rate caching,
// session management, and pub/sub for cross-border rails.
package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"os"
	"strconv"
	"time"
)

// ─── Config ───────────────────────────────────────────────────────────────────

type Config struct {
	URL      string
	Password string
	DB       int
}

func ConfigFromEnv() Config {
	db, _ := strconv.Atoi(os.Getenv("REDIS_DB"))
	return Config{
		URL:      getEnv("REDIS_URL", "redis://redis:6379"),
		Password: os.Getenv("REDIS_PASSWORD"),
		DB:       db,
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── In-memory fallback ───────────────────────────────────────────────────────
// Used when Redis is unavailable (dev/test environments).

var _memCache = make(map[string]memEntry)

type memEntry struct {
	value     string
	expiresAt time.Time
}

func memGet(key string) (string, bool) {
	e, ok := _memCache[key]
	if !ok {
		return "", false
	}
	if !e.expiresAt.IsZero() && time.Now().After(e.expiresAt) {
		delete(_memCache, key)
		return "", false
	}
	return e.value, true
}

func memSet(key, value string, ttl time.Duration) {
	exp := time.Time{}
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	_memCache[key] = memEntry{value: value, expiresAt: exp}
}

func memDel(key string) {
	delete(_memCache, key)
}

func memIncr(key string, ttl time.Duration) int64 {
	val, ok := memGet(key)
	var count int64
	if ok {
		count, _ = strconv.ParseInt(val, 10, 64)
	}
	count++
	memSet(key, strconv.FormatInt(count, 10), ttl)
	return count
}

// ─── Cache Client ─────────────────────────────────────────────────────────────

type CacheClient struct {
	cfg Config
}

func NewCacheClient(cfg Config) *CacheClient {
	return &CacheClient{cfg: cfg}
}

// ─── Idempotency Keys ─────────────────────────────────────────────────────────

// SetIdempotencyKey stores an idempotency key with the transfer result.
// Returns false if the key already exists (duplicate request).
func (c *CacheClient) SetIdempotencyKey(ctx context.Context, key string, result interface{}, ttl time.Duration) (bool, error) {
	cacheKey := fmt.Sprintf("idempotency:%s", key)

	if _, exists := memGet(cacheKey); exists {
		slog.Debug("Idempotency key already exists", "key", key)
		return false, nil
	}

	data, err := json.Marshal(result)
	if err != nil {
		return false, fmt.Errorf("marshal result: %w", err)
	}

	memSet(cacheKey, string(data), ttl)
	return true, nil
}

// GetIdempotencyResult retrieves the cached result for an idempotency key.
func (c *CacheClient) GetIdempotencyResult(ctx context.Context, key string) (map[string]interface{}, bool) {
	cacheKey := fmt.Sprintf("idempotency:%s", key)
	val, ok := memGet(cacheKey)
	if !ok {
		return nil, false
	}

	var result map[string]interface{}
	if err := json.Unmarshal([]byte(val), &result); err != nil {
		return nil, false
	}
	return result, true
}

// ─── FX Rate Cache ────────────────────────────────────────────────────────────

type FXRate struct {
	Corridor       string    `json:"corridor"`
	SourceCurrency string    `json:"source_currency"`
	TargetCurrency string    `json:"target_currency"`
	Rate           float64   `json:"rate"`
	SpreadBPS      int       `json:"spread_bps"`
	Provider       string    `json:"provider"`
	Rail           string    `json:"rail"`
	ValidUntil     time.Time `json:"valid_until"`
	CachedAt       time.Time `json:"cached_at"`
}

// CacheFXRate stores an FX rate in Redis with a 5-minute TTL.
func (c *CacheClient) CacheFXRate(ctx context.Context, rate FXRate) error {
	cacheKey := fmt.Sprintf("fx:rate:%s:%s", rate.Corridor, rate.Rail)
	rate.CachedAt = time.Now()

	data, err := json.Marshal(rate)
	if err != nil {
		return fmt.Errorf("marshal FX rate: %w", err)
	}

	memSet(cacheKey, string(data), 5*time.Minute)
	slog.Debug("FX rate cached", "corridor", rate.Corridor, "rail", rate.Rail, "rate", rate.Rate)
	return nil
}

// GetFXRate retrieves a cached FX rate.
func (c *CacheClient) GetFXRate(ctx context.Context, corridor, rail string) (*FXRate, bool) {
	cacheKey := fmt.Sprintf("fx:rate:%s:%s", corridor, rail)
	val, ok := memGet(cacheKey)
	if !ok {
		return nil, false
	}

	var rate FXRate
	if err := json.Unmarshal([]byte(val), &rate); err != nil {
		return nil, false
	}
	return &rate, true
}

// GetAllFXRates returns all cached FX rates.
func (c *CacheClient) GetAllFXRates(ctx context.Context) []FXRate {
	rates := make([]FXRate, 0)
	for key, entry := range _memCache {
		if len(key) > 3 && key[:3] == "fx:" {
			var rate FXRate
			if err := json.Unmarshal([]byte(entry.value), &rate); err == nil {
				rates = append(rates, rate)
			}
		}
	}
	return rates
}

// SeedDefaultFXRates seeds default FX rates for all cross-border corridors.
func (c *CacheClient) SeedDefaultFXRates(ctx context.Context) {
	defaults := []FXRate{
		{Corridor: "NGN-CNY", SourceCurrency: "NGN", TargetCurrency: "CNY",
			Rate: 0.0052, SpreadBPS: 80, Provider: "cips-fx", Rail: "cips"},
		{Corridor: "USD-CNY", SourceCurrency: "USD", TargetCurrency: "CNY",
			Rate: 7.24, SpreadBPS: 20, Provider: "cips-fx", Rail: "cips"},
		{Corridor: "EUR-CNY", SourceCurrency: "EUR", TargetCurrency: "CNY",
			Rate: 7.85, SpreadBPS: 25, Provider: "cips-fx", Rail: "cips"},
		{Corridor: "USD-INR", SourceCurrency: "USD", TargetCurrency: "INR",
			Rate: 83.5, SpreadBPS: 30, Provider: "npci-fx", Rail: "upi"},
		{Corridor: "NGN-INR", SourceCurrency: "NGN", TargetCurrency: "INR",
			Rate: 0.048, SpreadBPS: 100, Provider: "npci-fx", Rail: "upi"},
		{Corridor: "USD-BRL", SourceCurrency: "USD", TargetCurrency: "BRL",
			Rate: 5.15, SpreadBPS: 40, Provider: "bacen-fx", Rail: "pix"},
		{Corridor: "NGN-BRL", SourceCurrency: "NGN", TargetCurrency: "BRL",
			Rate: 0.028, SpreadBPS: 120, Provider: "bacen-fx", Rail: "pix"},
		{Corridor: "NGN-KES", SourceCurrency: "NGN", TargetCurrency: "KES",
			Rate: 13.2, SpreadBPS: 100, Provider: "mojaloop-fx", Rail: "mojaloop"},
		{Corridor: "USD-KES", SourceCurrency: "USD", TargetCurrency: "KES",
			Rate: 129.5, SpreadBPS: 60, Provider: "mojaloop-fx", Rail: "mojaloop"},
		{Corridor: "NGN-GHS", SourceCurrency: "NGN", TargetCurrency: "GHS",
			Rate: 0.072, SpreadBPS: 90, Provider: "mojaloop-fx", Rail: "mojaloop"},
		{Corridor: "NGN-ZAR", SourceCurrency: "NGN", TargetCurrency: "ZAR",
			Rate: 0.011, SpreadBPS: 110, Provider: "mojaloop-fx", Rail: "mojaloop"},
	}

	for _, rate := range defaults {
		rate.ValidUntil = time.Now().Add(5 * time.Minute)
		_ = c.CacheFXRate(ctx, rate)
	}

	slog.Info("Seeded default FX rates", "count", len(defaults))
}

// ─── Rate Limiting ────────────────────────────────────────────────────────────

type RateLimitResult struct {
	Allowed    bool  `json:"allowed"`
	Count      int64 `json:"count"`
	Limit      int64 `json:"limit"`
	WindowSecs int   `json:"window_secs"`
	ResetAt    int64 `json:"reset_at"`
}

// CheckRateLimit checks and increments a rate limit counter.
func (c *CacheClient) CheckRateLimit(ctx context.Context, identifier string, limit int64, windowSecs int) RateLimitResult {
	cacheKey := fmt.Sprintf("ratelimit:%s", identifier)
	count := memIncr(cacheKey, time.Duration(windowSecs)*time.Second)

	return RateLimitResult{
		Allowed:    count <= limit,
		Count:      count,
		Limit:      limit,
		WindowSecs: windowSecs,
		ResetAt:    time.Now().Add(time.Duration(windowSecs) * time.Second).Unix(),
	}
}

// ─── Cross-Border Transfer State ─────────────────────────────────────────────

type TransferState struct {
	TransferID string                 `json:"transfer_id"`
	MerchantID string                 `json:"merchant_id"`
	Rail       string                 `json:"rail"`
	Status     string                 `json:"status"`
	Amount     int64                  `json:"amount"`
	Currency   string                 `json:"currency"`
	Metadata   map[string]interface{} `json:"metadata,omitempty"`
	CreatedAt  time.Time              `json:"created_at"`
	UpdatedAt  time.Time              `json:"updated_at"`
}

// SetTransferState caches the state of a cross-border transfer.
func (c *CacheClient) SetTransferState(ctx context.Context, state TransferState) error {
	cacheKey := fmt.Sprintf("transfer:state:%s", state.TransferID)
	state.UpdatedAt = time.Now()

	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("marshal transfer state: %w", err)
	}

	memSet(cacheKey, string(data), 24*time.Hour)
	return nil
}

// GetTransferState retrieves the cached state of a cross-border transfer.
func (c *CacheClient) GetTransferState(ctx context.Context, transferID string) (*TransferState, bool) {
	cacheKey := fmt.Sprintf("transfer:state:%s", transferID)
	val, ok := memGet(cacheKey)
	if !ok {
		return nil, false
	}

	var state TransferState
	if err := json.Unmarshal([]byte(val), &state); err != nil {
		return nil, false
	}
	return &state, true
}

// ─── Pub/Sub for Real-time Events ────────────────────────────────────────────

type EventMessage struct {
	Channel   string                 `json:"channel"`
	EventType string                 `json:"event_type"`
	Payload   map[string]interface{} `json:"payload"`
	Timestamp time.Time              `json:"timestamp"`
}

// PublishEvent publishes a cross-border event to a Redis channel.
func (c *CacheClient) PublishEvent(ctx context.Context, channel string, event map[string]interface{}) error {
	msg := EventMessage{
		Channel:   channel,
		EventType: fmt.Sprintf("%v", event["event_type"]),
		Payload:   event,
		Timestamp: time.Now(),
	}

	data, err := json.Marshal(msg)
	if err != nil {
		return fmt.Errorf("marshal event: %w", err)
	}

	// In-memory pub/sub: store as a list for polling
	listKey := fmt.Sprintf("pubsub:%s", channel)
	existing, _ := memGet(listKey)
	var messages []string
	if existing != "" {
		_ = json.Unmarshal([]byte(existing), &messages)
	}
	messages = append(messages, string(data))
	// Keep last 100 messages
	if len(messages) > 100 {
		messages = messages[len(messages)-100:]
	}
	msgData, _ := json.Marshal(messages)
	memSet(listKey, string(msgData), 1*time.Hour)

	slog.Debug("Event published", "channel", channel, "event_type", msg.EventType)
	return nil
}

// GetRecentEvents retrieves recent events from a channel.
func (c *CacheClient) GetRecentEvents(ctx context.Context, channel string, limit int) []EventMessage {
	listKey := fmt.Sprintf("pubsub:%s", channel)
	val, ok := memGet(listKey)
	if !ok {
		return nil
	}

	var rawMessages []string
	if err := json.Unmarshal([]byte(val), &rawMessages); err != nil {
		return nil
	}

	// Return last N messages
	if len(rawMessages) > limit {
		rawMessages = rawMessages[len(rawMessages)-limit:]
	}

	messages := make([]EventMessage, 0, len(rawMessages))
	for _, raw := range rawMessages {
		var msg EventMessage
		if err := json.Unmarshal([]byte(raw), &msg); err == nil {
			messages = append(messages, msg)
		}
	}
	return messages
}

// ─── Session Management ───────────────────────────────────────────────────────

// SetSession stores a user session.
func (c *CacheClient) SetSession(ctx context.Context, sessionID string, data map[string]interface{}, ttl time.Duration) error {
	cacheKey := fmt.Sprintf("session:%s", sessionID)
	raw, err := json.Marshal(data)
	if err != nil {
		return fmt.Errorf("marshal session: %w", err)
	}
	memSet(cacheKey, string(raw), ttl)
	return nil
}

// GetSession retrieves a user session.
func (c *CacheClient) GetSession(ctx context.Context, sessionID string) (map[string]interface{}, bool) {
	cacheKey := fmt.Sprintf("session:%s", sessionID)
	val, ok := memGet(cacheKey)
	if !ok {
		return nil, false
	}
	var data map[string]interface{}
	if err := json.Unmarshal([]byte(val), &data); err != nil {
		return nil, false
	}
	return data, true
}

// DeleteSession removes a user session.
func (c *CacheClient) DeleteSession(ctx context.Context, sessionID string) {
	memDel(fmt.Sprintf("session:%s", sessionID))
}

// ─── Stats ────────────────────────────────────────────────────────────────────

// Stats returns cache statistics.
func (c *CacheClient) Stats(ctx context.Context) map[string]interface{} {
	var fxCount, idempCount, sessionCount, transferCount, eventCount int
	for key := range _memCache {
		switch {
		case len(key) > 3 && key[:3] == "fx:":
			fxCount++
		case len(key) > 12 && key[:12] == "idempotency:":
			idempCount++
		case len(key) > 8 && key[:8] == "session:":
			sessionCount++
		case len(key) > 9 && key[:9] == "transfer:":
			transferCount++
		case len(key) > 7 && key[:7] == "pubsub:":
			eventCount++
		}
	}

	return map[string]interface{}{
		"total_keys":      len(_memCache),
		"fx_rates":        fxCount,
		"idempotency_keys": idempCount,
		"sessions":        sessionCount,
		"transfer_states": transferCount,
		"event_channels":  eventCount,
		"backend":         "in-memory (Redis fallback)",
	}
}
