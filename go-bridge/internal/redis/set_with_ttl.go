package redis

import (
	"context"
	"encoding/json"
	"log/slog"
	"time"
)

// SetWithTTL is a package-level convenience wrapper that stores a JSON-encoded value
// with a TTL. It silently no-ops if the Redis client is not initialised.
func SetWithTTL(ctx context.Context, key string, v any, ttl time.Duration) {
	c := Get()
	if c == nil {
		slog.Warn("redis.SetWithTTL: client not initialised, skipping", "key", key)
		return
	}
	payload, err := json.Marshal(v)
	if err != nil {
		slog.Error("redis.SetWithTTL: json marshal failed", "key", key, "err", err)
		return
	}
	if err := c.SetEX(ctx, key, string(payload), ttl); err != nil {
		slog.Error("redis.SetWithTTL: SetEX failed", "key", key, "err", err)
	}
}

// GetStr is a package-level convenience wrapper for Client.GetString.
func GetStr(ctx context.Context, key string) (string, bool) {
	c := Get()
	if c == nil {
		return "", false
	}
	val, found, _ := c.GetString(ctx, key)
	return val, found
}
