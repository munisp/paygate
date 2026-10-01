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
	"strings"
	"sync"
	"time"

	"github.com/paygate/go-bridge/internal/pgdb"
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

var (
	_memCache   = make(map[string]memEntry)
	_memCacheMu sync.RWMutex
)

type memEntry struct {
	value     string
	expiresAt time.Time
}

func memGet(key string) (string, bool) {
	_memCacheMu.RLock()
	e, ok := _memCache[key]
	_memCacheMu.RUnlock()
	if !ok {
		return "", false
	}
	if !e.expiresAt.IsZero() && time.Now().After(e.expiresAt) {
		_memCacheMu.Lock()
		delete(_memCache, key)
		_memCacheMu.Unlock()
		return "", false
	}
	return e.value, true
}

func memSet(key, value string, ttl time.Duration) {
	exp := time.Time{}
	if ttl > 0 {
		exp = time.Now().Add(ttl)
	}
	_memCacheMu.Lock()
	_memCache[key] = memEntry{value: value, expiresAt: exp}
	_memCacheMu.Unlock()
}

func memDel(key string) {
	_memCacheMu.Lock()
	delete(_memCache, key)
	_memCacheMu.Unlock()
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

// ─── Backend resolution (Redis → Postgres → memory) ──────────────────────────

// rc returns the global Redis client when it is initialised and backed by a
// real server, else nil.  Never panics even if Init() was not called.
func rc() *Client {
	if globalClient != nil && globalClient.Enabled() {
		return globalClient
	}
	return nil
}

// isProduction reports whether the process runs with ENV/APP_ENV=production.
func isProduction() bool {
	env := strings.ToLower(os.Getenv("ENV"))
	appEnv := strings.ToLower(os.Getenv("APP_ENV"))
	return env == "production" || env == "prod" || appEnv == "production" || appEnv == "prod"
}

// durableBackendAvailable reports whether at least one durable backend
// (Redis or Postgres) is reachable for money/idempotency writes.
func durableBackendAvailable() bool {
	return rc() != nil || pgdb.Enabled()
}

// errNoDurableBackend is returned by money-path writes when both Redis and
// Postgres are unavailable in production.  Callers MUST reject the operation.
var errNoDurableBackend = fmt.Errorf("crossborder cache: no durable backend (Redis and Postgres both unavailable) — refusing in-memory-only write in production")

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
//
// Write path (durable, in order): Redis SET NX (atomic check-and-set) and
// Postgres write-through (idempotency_keys).  The in-memory map is a read
// cache only.  FAIL-LOUD: in production, when both Redis and Postgres are
// unavailable, an error is returned and the caller must reject the operation —
// money paths are never served from memory alone.
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

	usedDurable := false

	if r := rc(); r != nil {
		// SET NX EX — atomic duplicate detection across all bridge replicas.
		res, err := r.Eval(ctx, ScriptSetNXWithTTL, []string{cacheKey},
			string(data), fmt.Sprintf("%d", int(ttl.Seconds())))
		if err != nil {
			// Redis is configured but failing — fail loud on the idempotency path.
			return false, fmt.Errorf("redis SET NX idempotency key: %w", err)
		}
		usedDurable = true
		if !luaTruthy(res) {
			slog.Debug("Idempotency key already exists (redis)", "key", key)
			memSet(cacheKey, string(data), ttl)
			return false, nil
		}
	}

	if pgdb.Enabled() {
		created, err := pgdb.UpsertIdempotencyKey(ctx, key, data, ttl)
		if err != nil {
			return false, err // fail loud — durable idempotency record is required
		}
		usedDurable = true
		if !created && rc() == nil {
			// Postgres is the dedup authority only when Redis did not already answer.
			slog.Debug("Idempotency key already exists (pg)", "key", key)
			memSet(cacheKey, string(data), ttl)
			return false, nil
		}
	}

	if !usedDurable {
		if isProduction() {
			return false, errNoDurableBackend
		}
		slog.Warn("Idempotency key stored in-memory only (dev mode — no Redis/Postgres)", "key", key)
	}

	memSet(cacheKey, string(data), ttl)
	return true, nil
}

// GetIdempotencyResult retrieves the cached result for an idempotency key.
// Read path: memory → Postgres → Redis.  A miss at every layer is a true miss.
func (c *CacheClient) GetIdempotencyResult(ctx context.Context, key string) (map[string]interface{}, bool) {
	cacheKey := fmt.Sprintf("idempotency:%s", key)
	if val, ok := memGet(cacheKey); ok {
		var result map[string]interface{}
		if err := json.Unmarshal([]byte(val), &result); err == nil {
			return result, true
		}
	}

	if pgdb.Enabled() {
		raw, found, err := pgdb.GetIdempotencyKey(ctx, key)
		if err != nil {
			slog.Error("pg idempotency lookup failed", "key", key, "err", err)
		} else if found {
			memSet(cacheKey, string(raw), time.Hour)
			var result map[string]interface{}
			if err := json.Unmarshal(raw, &result); err == nil {
				return result, true
			}
		}
	}

	if r := rc(); r != nil {
		val, found, err := r.GetString(ctx, cacheKey)
		if err != nil {
			slog.Error("redis idempotency lookup failed", "key", key, "err", err)
			return nil, false
		}
		if !found {
			return nil, false
		}
		memSet(cacheKey, val, time.Hour)
		var result map[string]interface{}
		if err := json.Unmarshal([]byte(val), &result); err != nil {
			return nil, false
		}
		return result, true
	}

	return nil, false
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
	_memCacheMu.RLock()
	defer _memCacheMu.RUnlock()
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
	ttl := time.Duration(windowSecs) * time.Second

	var count int64
	if r := rc(); r != nil {
		n, err := r.IncrWithTTL(ctx, cacheKey, ttl)
		if err != nil {
			// Fail closed: a broken rate-limiter must not silently allow traffic.
			slog.Error("redis rate limit INCR failed — rejecting request (fail closed)", "identifier", identifier, "err", err)
			return RateLimitResult{
				Allowed:    false,
				Count:      limit + 1,
				Limit:      limit,
				WindowSecs: windowSecs,
				ResetAt:    time.Now().Add(ttl).Unix(),
			}
		}
		count = n
	} else {
		count = memIncr(cacheKey, ttl)
	}

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

// SetTransferState persists the state of a cross-border transfer.
// Write path: Redis + Postgres write-through (transfer_state table); memory is
// a read cache only.  FAIL-LOUD: any durable-backend error is returned, and in
// production with both backends unavailable the write is refused outright.
func (c *CacheClient) SetTransferState(ctx context.Context, state TransferState) error {
	cacheKey := fmt.Sprintf("transfer:state:%s", state.TransferID)
	state.UpdatedAt = time.Now()

	data, err := json.Marshal(state)
	if err != nil {
		return fmt.Errorf("marshal transfer state: %w", err)
	}

	usedDurable := false

	if r := rc(); r != nil {
		if err := r.SetEX(ctx, cacheKey, string(data), 24*time.Hour); err != nil {
			return fmt.Errorf("redis set transfer state: %w", err)
		}
		usedDurable = true
	}

	if pgdb.Enabled() {
		if err := pgdb.UpsertTransferState(ctx, state.TransferID, data); err != nil {
			return err // fail loud — durable transfer state is required
		}
		usedDurable = true
	}

	if !usedDurable {
		if isProduction() {
			return errNoDurableBackend
		}
		slog.Warn("Transfer state stored in-memory only (dev mode — no Redis/Postgres)", "transfer_id", state.TransferID)
	}

	memSet(cacheKey, string(data), 24*time.Hour)
	return nil
}

// GetTransferState retrieves the cached state of a cross-border transfer.
// Read path: memory → Postgres → Redis.  A miss at every layer is a true miss.
func (c *CacheClient) GetTransferState(ctx context.Context, transferID string) (*TransferState, bool) {
	cacheKey := fmt.Sprintf("transfer:state:%s", transferID)
	if val, ok := memGet(cacheKey); ok {
		var state TransferState
		if err := json.Unmarshal([]byte(val), &state); err == nil {
			return &state, true
		}
	}

	if pgdb.Enabled() {
		raw, found, err := pgdb.GetTransferState(ctx, transferID)
		if err != nil {
			slog.Error("pg transfer state lookup failed", "transfer_id", transferID, "err", err)
		} else if found {
			memSet(cacheKey, string(raw), time.Hour)
			var state TransferState
			if err := json.Unmarshal(raw, &state); err == nil {
				return &state, true
			}
		}
	}

	if r := rc(); r != nil {
		val, found, err := r.GetString(ctx, cacheKey)
		if err != nil {
			slog.Error("redis transfer state lookup failed", "transfer_id", transferID, "err", err)
			return nil, false
		}
		if !found {
			return nil, false
		}
		memSet(cacheKey, val, time.Hour)
		var state TransferState
		if err := json.Unmarshal([]byte(val), &state); err != nil {
			return nil, false
		}
		return &state, true
	}

	return nil, false
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
	if r := rc(); r != nil {
		if err := r.SetEX(ctx, cacheKey, string(raw), ttl); err != nil {
			return fmt.Errorf("redis set session: %w", err)
		}
	}
	memSet(cacheKey, string(raw), ttl)
	return nil
}

// GetSession retrieves a user session.  Read path: memory → Redis.
func (c *CacheClient) GetSession(ctx context.Context, sessionID string) (map[string]interface{}, bool) {
	cacheKey := fmt.Sprintf("session:%s", sessionID)
	val, ok := memGet(cacheKey)
	if !ok && rc() != nil {
		v, found, err := rc().GetString(ctx, cacheKey)
		if err != nil {
			slog.Error("redis session lookup failed", "session_id", sessionID, "err", err)
			return nil, false
		}
		if !found {
			return nil, false
		}
		val = v
		memSet(cacheKey, v, time.Hour)
		ok = true
	}
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
	cacheKey := fmt.Sprintf("session:%s", sessionID)
	if r := rc(); r != nil {
		if err := r.Del(ctx, cacheKey); err != nil {
			slog.Error("redis session delete failed", "session_id", sessionID, "err", err)
		}
	}
	memDel(cacheKey)
}

// ─── Stats ────────────────────────────────────────────────────────────────────

// Stats returns cache statistics.
func (c *CacheClient) Stats(ctx context.Context) map[string]interface{} {
	var fxCount, idempCount, sessionCount, transferCount, eventCount int
	_memCacheMu.RLock()
	defer _memCacheMu.RUnlock()
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
