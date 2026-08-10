package redis

import (
	"context"
	"log/slog"
	"time"
)

// SetJSON is a package-level convenience wrapper for Client.SetJSON.
// It silently no-ops if the Redis client is not initialised.
func SetJSON(ctx context.Context, key string, v any, ttl time.Duration) error {
	c := Get()
	if c == nil {
		slog.Warn("redis.SetJSON: client not initialised, skipping", "key", key)
		return nil
	}
	return c.SetJSON(ctx, key, v, ttl)
}

// Delete is a package-level convenience wrapper for Client.Del.
// It silently no-ops if the Redis client is not initialised.
func Delete(ctx context.Context, key string) {
	c := Get()
	if c == nil {
		slog.Warn("redis.Delete: client not initialised, skipping", "key", key)
		return
	}
	if err := c.Del(ctx, key); err != nil {
		slog.Warn("redis.Delete: failed", "key", key, "err", err)
	}
}
