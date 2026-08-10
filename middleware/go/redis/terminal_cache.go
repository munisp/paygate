// Package rediscache provides Redis helpers for terminal state management.
// It uses the go-redis client and wraps common operations with typed helpers.
package rediscache

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/redis/go-redis/v9"
)

var rdb *redis.Client

func init() {
	opt, err := redis.ParseURL(getRedisURL())
	if err != nil {
		opt = &redis.Options{Addr: "localhost:6379"}
	}
	rdb = redis.NewClient(opt)
}

func getRedisURL() string {
	if v := os.Getenv("REDIS_URL"); v != "" {
		return v
	}
	return "redis://localhost:6379"
}

// ─── Terminal Status ──────────────────────────────────────────────────────────

// SetTerminalStatus stores the terminal status in Redis.
// ttl=0 means no expiry.
func SetTerminalStatus(ctx context.Context, terminalID, status string, ttl time.Duration) error {
	key := fmt.Sprintf("terminal:status:%s", terminalID)
	if ttl == 0 {
		return rdb.Set(ctx, key, status, 0).Err()
	}
	return rdb.Set(ctx, key, status, ttl).Err()
}

// GetTerminalStatus retrieves the cached terminal status.
func GetTerminalStatus(ctx context.Context, terminalID string) (string, error) {
	key := fmt.Sprintf("terminal:status:%s", terminalID)
	return rdb.Get(ctx, key).Result()
}

// SetTerminalHeartbeat refreshes the heartbeat TTL key.
// If the key expires, the terminal is considered offline.
func SetTerminalHeartbeat(ctx context.Context, terminalID string, ttl time.Duration) error {
	key := fmt.Sprintf("terminal:heartbeat:%s", terminalID)
	return rdb.Set(ctx, key, time.Now().Unix(), ttl).Err()
}

// IsTerminalOnline returns true if the heartbeat key exists (not expired).
func IsTerminalOnline(ctx context.Context, terminalID string) (bool, error) {
	key := fmt.Sprintf("terminal:heartbeat:%s", terminalID)
	n, err := rdb.Exists(ctx, key).Result()
	return n > 0, err
}

// ─── Generic helpers ──────────────────────────────────────────────────────────

// Exists checks if a key exists in Redis.
func Exists(ctx context.Context, key string) (bool, error) {
	n, err := rdb.Exists(ctx, key).Result()
	return n > 0, err
}

// SetWithTTL stores a string value with a TTL.
func SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return rdb.Set(ctx, key, value, ttl).Err()
}

// SetJSON marshals a value to JSON and stores it with a TTL.
func SetJSON(ctx context.Context, key string, value any, ttl time.Duration) error {
	data, err := json.Marshal(value)
	if err != nil {
		return fmt.Errorf("redis SetJSON marshal: %w", err)
	}
	return rdb.Set(ctx, key, data, ttl).Err()
}

// GetJSON retrieves a JSON value and unmarshals it into dest.
func GetJSON(ctx context.Context, key string, dest any) error {
	data, err := rdb.Get(ctx, key).Bytes()
	if err != nil {
		return err
	}
	return json.Unmarshal(data, dest)
}

// Delete removes one or more keys.
func Delete(ctx context.Context, keys ...string) error {
	return rdb.Del(ctx, keys...).Err()
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

// PublishMessage publishes a message to a Redis pub/sub channel.
func PublishMessage(ctx context.Context, channel, message string) error {
	return rdb.Publish(ctx, channel, message).Err()
}

// SubscribeChannel subscribes to a Redis pub/sub channel and returns a
// receive-only channel of string messages. The subscription is cancelled
// when ctx is done.
func SubscribeChannel(ctx context.Context, channel string) (<-chan string, error) {
	sub := rdb.Subscribe(ctx, channel)
	// Verify subscription
	if _, err := sub.Receive(ctx); err != nil {
		return nil, fmt.Errorf("redis subscribe %s: %w", channel, err)
	}

	out := make(chan string, 64)
	go func() {
		defer close(out)
		ch := sub.Channel()
		for {
			select {
			case msg, ok := <-ch:
				if !ok {
					return
				}
				select {
				case out <- msg.Payload:
				default: // drop if consumer is slow
				}
			case <-ctx.Done():
				_ = sub.Close()
				return
			}
		}
	}()
	return out, nil
}

// ─── Terminal Analytics Cache ─────────────────────────────────────────────────

type TerminalAnalyticsSnapshot struct {
	TerminalID   string    `json:"terminal_id"`
	MerchantID   string    `json:"merchant_id"`
	TotalCount   int64     `json:"total_count"`
	TotalKobo    int64     `json:"total_kobo"`
	AvgTicket    int64     `json:"avg_ticket"`
	LastTxnAt    time.Time `json:"last_txn_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// IncrTerminalStats atomically increments terminal analytics counters.
func IncrTerminalStats(ctx context.Context, terminalID, merchantID string, amountKobo int64) error {
	pipe := rdb.Pipeline()
	prefix := fmt.Sprintf("terminal:stats:%s", terminalID)
	pipe.IncrBy(ctx, prefix+":count", 1)
	pipe.IncrBy(ctx, prefix+":volume", amountKobo)
	pipe.Set(ctx, prefix+":last_txn", time.Now().Unix(), 30*24*time.Hour)
	_, err := pipe.Exec(ctx)
	return err
}

// GetTerminalStats retrieves cached terminal analytics counters.
func GetTerminalStats(ctx context.Context, terminalID string) (count, volume int64, lastTxn time.Time, err error) {
	prefix := fmt.Sprintf("terminal:stats:%s", terminalID)
	pipe := rdb.Pipeline()
	cntCmd := pipe.Get(ctx, prefix+":count")
	volCmd := pipe.Get(ctx, prefix+":volume")
	tsCmd := pipe.Get(ctx, prefix+":last_txn")
	_, _ = pipe.Exec(ctx)

	count, _ = cntCmd.Int64()
	volume, _ = volCmd.Int64()
	ts, _ := tsCmd.Int64()
	if ts > 0 {
		lastTxn = time.Unix(ts, 0)
	}
	return count, volume, lastTxn, nil
}
