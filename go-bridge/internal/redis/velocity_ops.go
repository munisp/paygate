package redis

// velocity_ops.go — Redis operations for velocity limit counters and chargeback timelines.
// Uses raw RESP protocol via the existing Client.dial() pattern.

import (
	"context"
	"fmt"
	"log/slog"
	"strconv"
	"strings"
	"time"
)

// Get retrieves a string value from Redis. Returns error if key not found.
func (c *Client) Get(ctx context.Context, key string) (string, error) {
	val, found, err := c.GetString(ctx, key)
	if err != nil {
		return "", err
	}
	if !found {
		return "", fmt.Errorf("key not found: %s", key)
	}
	return val, nil
}

// SetWithTTL stores a string value with a TTL.
func (c *Client) SetWithTTL(ctx context.Context, key, value string, ttl time.Duration) error {
	return c.SetEX(ctx, key, value, ttl)
}

// Delete removes a key from Redis.
func (c *Client) Delete(ctx context.Context, key string) error {
	return c.Del(ctx, key)
}

// IncrWithTTL atomically increments a counter and sets TTL if the key is new.
// Returns the new counter value.
func (c *Client) IncrWithTTL(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	conn, err := c.dial()
	if err != nil {
		return 0, fmt.Errorf("redis dial: %w", err)
	}
	defer conn.Close()

	// INCR key
	incrResp, err := sendCommand(conn, "INCR", key)
	if err != nil {
		return 0, fmt.Errorf("INCR: %w", err)
	}

	val, err := parseIntResp(incrResp)
	if err != nil {
		return 0, err
	}

	// Set TTL only on first increment (val == 1)
	if val == 1 {
		ttlSeconds := int(ttl.Seconds())
		if ttlSeconds < 1 {
			ttlSeconds = 1
		}
		_, err = sendCommand(conn, "EXPIRE", key, strconv.Itoa(ttlSeconds))
		if err != nil {
			slog.Warn("[redis] IncrWithTTL: EXPIRE failed", "key", key, "err", err)
		}
	}

	return val, nil
}

// IncrByWithTTL atomically increments a counter by delta and sets TTL if the key is new.
// Returns the new counter value.
func (c *Client) IncrByWithTTL(ctx context.Context, key string, delta int64, ttl time.Duration) (int64, error) {
	conn, err := c.dial()
	if err != nil {
		return 0, fmt.Errorf("redis dial: %w", err)
	}
	defer conn.Close()

	// INCRBY key delta
	incrResp, err := sendCommand(conn, "INCRBY", key, strconv.FormatInt(delta, 10))
	if err != nil {
		return 0, fmt.Errorf("INCRBY: %w", err)
	}

	val, err := parseIntResp(incrResp)
	if err != nil {
		return 0, err
	}

	// Set TTL only on first increment (val == delta)
	if val == delta {
		ttlSeconds := int(ttl.Seconds())
		if ttlSeconds < 1 {
			ttlSeconds = 1
		}
		_, err = sendCommand(conn, "EXPIRE", key, strconv.Itoa(ttlSeconds))
		if err != nil {
			slog.Warn("[redis] IncrByWithTTL: EXPIRE failed", "key", key, "err", err)
		}
	}

	return val, nil
}

// LPush prepends a value to a Redis list.
func (c *Client) LPush(ctx context.Context, key, value string) error {
	conn, err := c.dial()
	if err != nil {
		return fmt.Errorf("redis dial: %w", err)
	}
	defer conn.Close()

	_, err = sendCommand(conn, "LPUSH", key, value)
	return err
}

// LRange returns a range of elements from a Redis list.
func (c *Client) LRange(ctx context.Context, key string, start, stop int) ([]string, error) {
	conn, err := c.dial()
	if err != nil {
		return nil, fmt.Errorf("redis dial: %w", err)
	}
	defer conn.Close()

	resp, err := sendCommand(conn, "LRANGE", key,
		strconv.Itoa(start), strconv.Itoa(stop))
	if err != nil {
		return nil, fmt.Errorf("LRANGE: %w", err)
	}

	return parseArrayResp(resp), nil
}

// parseIntResp parses a Redis integer response like ":42\r\n".
func parseIntResp(resp string) (int64, error) {
	resp = strings.TrimSpace(resp)
	if strings.HasPrefix(resp, ":") {
		n, err := strconv.ParseInt(strings.TrimPrefix(resp, ":"), 10, 64)
		if err != nil {
			return 0, fmt.Errorf("parse int resp: %w", err)
		}
		return n, nil
	}
	// Try parsing bulk string response
	if strings.HasPrefix(resp, "$") {
		lines := strings.Split(resp, "\r\n")
		if len(lines) >= 2 {
			n, err := strconv.ParseInt(lines[1], 10, 64)
			if err != nil {
				return 0, fmt.Errorf("parse bulk int: %w", err)
			}
			return n, nil
		}
	}
	// Direct integer
	n, err := strconv.ParseInt(resp, 10, 64)
	if err != nil {
		return 0, fmt.Errorf("unexpected redis response: %q", resp)
	}
	return n, nil
}

// parseArrayResp parses a Redis array response.
func parseArrayResp(resp string) []string {
	lines := strings.Split(resp, "\r\n")
	result := make([]string, 0)
	i := 0
	for i < len(lines) {
		line := lines[i]
		if strings.HasPrefix(line, "$") {
			// Bulk string: next line is the value
			if i+1 < len(lines) {
				result = append(result, lines[i+1])
				i += 2
				continue
			}
		}
		i++
	}
	return result
}

// Package-level convenience wrappers

// IncrWithTTL increments a counter with TTL (package-level).
func IncrWithTTL(ctx context.Context, key string, ttl time.Duration) (int64, error) {
	c := getClient()
	if c == nil {
		return 0, fmt.Errorf("redis client not initialised")
	}
	return c.IncrWithTTL(ctx, key, ttl)
}

// IncrByWithTTL increments a counter by delta with TTL (package-level).
func IncrByWithTTL(ctx context.Context, key string, delta int64, ttl time.Duration) (int64, error) {
	c := getClient()
	if c == nil {
		return 0, fmt.Errorf("redis client not initialised")
	}
	return c.IncrByWithTTL(ctx, key, delta, ttl)
}

// LPush prepends to a list (package-level).
func LPush(ctx context.Context, key, value string) error {
	c := getClient()
	if c == nil {
		return fmt.Errorf("redis client not initialised")
	}
	return c.LPush(ctx, key, value)
}

// LRange returns a list range (package-level).
func LRange(ctx context.Context, key string, start, stop int) ([]string, error) {
	c := getClient()
	if c == nil {
		return nil, fmt.Errorf("redis client not initialised")
	}
	return c.LRange(ctx, key, start, stop)
}

// getClient returns the global Redis client (avoids circular reference with Get()).
func getClient() *Client {
	return globalClient
}
