// Package redis provides a lightweight Redis client for idempotency key
// management and short-lived caching in the PayGate bridge service.
//
// If REDIS_URL is not set, all operations are no-ops (dev/test mode).
// In production, set REDIS_URL to a redis:// or rediss:// connection string.
package redis

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net"
	"net/url"
	"os"
	"sync"
	"time"
)

// ─── Client ───────────────────────────────────────────────────────────────────

// Client wraps a minimal Redis connection for SET/GET/DEL/EXISTS operations.
// It uses the raw Redis RESP protocol to avoid external dependencies.
type Client struct {
	addr    string
	enabled bool
	mu      sync.Mutex
}

var (
	globalClient *Client
	once         sync.Once
)

// Init initialises the global Redis client from REDIS_URL.
// Falls back to no-op mode if REDIS_URL is not set.
func Init() {
	once.Do(func() {
		rawURL := os.Getenv("REDIS_URL")
		if rawURL == "" {
			slog.Info("[redis] REDIS_URL not set — Redis caching disabled (dev mode)")
			globalClient = &Client{enabled: false}
			return
		}
		u, err := url.Parse(rawURL)
		if err != nil {
			slog.Error("[redis] invalid REDIS_URL", "err", err)
			globalClient = &Client{enabled: false}
			return
		}
		host := u.Hostname()
		port := u.Port()
		if port == "" {
			port = "6379"
		}
		globalClient = &Client{
			addr:    net.JoinHostPort(host, port),
			enabled: true,
		}
		slog.Info("[redis] client initialised", "addr", globalClient.addr)
	})
}

// Get returns the global Redis client. Panics if Init has not been called.
func Get() *Client {
	if globalClient == nil {
		panic("redis: client not initialised — call Init() first")
	}
	return globalClient
}

// ─── RESP helpers ─────────────────────────────────────────────────────────────

func (c *Client) dial() (net.Conn, error) {
	return net.DialTimeout("tcp", c.addr, 3*time.Second)
}

func sendCommand(conn net.Conn, args ...string) (string, error) {
	// Build RESP array
	cmd := fmt.Sprintf("*%d\r\n", len(args))
	for _, a := range args {
		cmd += fmt.Sprintf("$%d\r\n%s\r\n", len(a), a)
	}
	conn.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := fmt.Fprint(conn, cmd); err != nil {
		return "", err
	}
	buf := make([]byte, 4096)
	n, err := conn.Read(buf)
	if err != nil {
		return "", err
	}
	return string(buf[:n]), nil
}

// ─── Public API ───────────────────────────────────────────────────────────────

// SetEX stores a string value with a TTL (seconds). No-op if disabled.
func (c *Client) SetEX(ctx context.Context, key, value string, ttl time.Duration) error {
	if !c.enabled {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	conn, err := c.dial()
	if err != nil {
		slog.Warn("[redis] SetEX dial failed", "key", key, "err", err)
		return nil // fail open
	}
	defer conn.Close()
	ttlSec := fmt.Sprintf("%d", int(ttl.Seconds()))
	_, err = sendCommand(conn, "SETEX", key, ttlSec, value)
	if err != nil {
		slog.Warn("[redis] SetEX failed", "key", key, "err", err)
	}
	return nil
}

// Get retrieves a string value. Returns ("", false, nil) if not found or disabled.
func (c *Client) GetString(ctx context.Context, key string) (string, bool, error) {
	if !c.enabled {
		return "", false, nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	conn, err := c.dial()
	if err != nil {
		slog.Warn("[redis] Get dial failed", "key", key, "err", err)
		return "", false, nil
	}
	defer conn.Close()
	resp, err := sendCommand(conn, "GET", key)
	if err != nil || resp == "$-1\r\n" {
		return "", false, nil
	}
	// Parse bulk string: $N\r\nVALUE\r\n
	var val string
	if len(resp) > 4 && resp[0] == '$' {
		lines := splitResp(resp)
		if len(lines) >= 2 {
			val = lines[1]
			return val, true, nil
		}
	}
	return "", false, nil
}

// Del deletes a key. No-op if disabled.
func (c *Client) Del(ctx context.Context, key string) error {
	if !c.enabled {
		return nil
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	conn, err := c.dial()
	if err != nil {
		slog.Warn("[redis] Del dial failed", "key", key, "err", err)
		return nil
	}
	defer conn.Close()
	_, err = sendCommand(conn, "DEL", key)
	if err != nil {
		slog.Warn("[redis] Del failed", "key", key, "err", err)
	}
	return nil
}

// Exists returns true if the key exists. Returns false if disabled or on error.
func (c *Client) Exists(ctx context.Context, key string) bool {
	if !c.enabled {
		return false
	}
	c.mu.Lock()
	defer c.mu.Unlock()
	conn, err := c.dial()
	if err != nil {
		return false
	}
	defer conn.Close()
	resp, err := sendCommand(conn, "EXISTS", key)
	if err != nil {
		return false
	}
	return resp == ":1\r\n"
}

// SetJSON marshals v to JSON and stores it with the given TTL.
func (c *Client) SetJSON(ctx context.Context, key string, v any, ttl time.Duration) error {
	b, err := json.Marshal(v)
	if err != nil {
		return fmt.Errorf("redis.SetJSON: marshal: %w", err)
	}
	return c.SetEX(ctx, key, string(b), ttl)
}

// GetJSON retrieves a JSON value and unmarshals it into dst.
// Returns (false, nil) if the key does not exist.
func (c *Client) GetJSON(ctx context.Context, key string, dst any) (bool, error) {
	val, ok, err := c.GetString(ctx, key)
	if err != nil || !ok {
		return false, err
	}
	if err := json.Unmarshal([]byte(val), dst); err != nil {
		return false, fmt.Errorf("redis.GetJSON: unmarshal: %w", err)
	}
	return true, nil
}

// ─── Idempotency helpers ──────────────────────────────────────────────────────

const idempotencyTTL = 24 * time.Hour

// IdempotencyKey returns the Redis key for a given operation reference.
func IdempotencyKey(operation, reference string) string {
	return fmt.Sprintf("idempotency:%s:%s", operation, reference)
}

// CheckAndSetIdempotency returns true if this reference has already been
// processed (duplicate), false if it is new (and marks it as processed).
func (c *Client) CheckAndSetIdempotency(ctx context.Context, operation, reference string) (bool, error) {
	key := IdempotencyKey(operation, reference)
	if c.Exists(ctx, key) {
		slog.Info("[redis] idempotency hit", "operation", operation, "reference", reference)
		return true, nil
	}
	return false, c.SetEX(ctx, key, "1", idempotencyTTL)
}

// ─── NIP cache helpers ────────────────────────────────────────────────────────

const nipCacheTTL = 24 * time.Hour

// NIPCacheKey returns the Redis key for a NIP name enquiry result.
func NIPCacheKey(accountNumber, bankCode string) string {
	return fmt.Sprintf("nip:name:%s:%s", bankCode, accountNumber)
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func splitResp(resp string) []string {
	var lines []string
	start := 0
	for i := 0; i < len(resp)-1; i++ {
		if resp[i] == '\r' && resp[i+1] == '\n' {
			lines = append(lines, resp[start:i])
			start = i + 2
			i++
		}
	}
	if start < len(resp) {
		lines = append(lines, resp[start:])
	}
	return lines
}
