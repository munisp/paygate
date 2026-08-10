package redis

import (
	"context"
	"log/slog"
)

// GetJSON is a package-level convenience wrapper for Client.GetJSON.
// It silently no-ops if the Redis client is not initialised.
func GetJSON(ctx context.Context, key string, dst any) (bool, error) {
	c := Get()
	if c == nil {
		slog.Warn("redis.GetJSON: client not initialised, skipping", "key", key)
		return false, nil
	}
	return c.GetJSON(ctx, key, dst)
}
