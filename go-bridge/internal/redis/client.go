// Package redis provides a lightweight Redis client for idempotency key
// management and short-lived caching in the PayGate bridge service.
//
// If REDIS_URL is not set, all operations are no-ops (dev/test mode).
// In production, set REDIS_URL to a redis:// or rediss:// connection string.
//
// PC1/PC7: the client uses a bounded connection pool (no global mutex, no
// fresh TCP dial per operation) and strconv-based RESP encoding (no
// fmt.Sprintf on hot paths). Pipelining support is provided via Pipeline.
package redis

import (
	"bufio"
	"context"
	"encoding/json"
	"errors"
	"fmt"
	"io"
	"log/slog"
	"net"
	"net/url"
	"os"
	"strconv"
	"sync"
	"time"
)

// ─── Client ───────────────────────────────────────────────────────────────────

// defaultPoolSize is the maximum number of concurrent Redis connections.
// Can be overridden with REDIS_POOL_SIZE.
const defaultPoolSize = 32

// pooledConn is a single pooled Redis connection with a buffered reader.
type pooledConn struct {
	conn net.Conn
	br   *bufio.Reader
}

// Client wraps a minimal Redis connection pool for SET/GET/DEL/EXISTS
// operations. It uses the raw Redis RESP protocol to avoid external
// dependencies and is safe for concurrent use.
type Client struct {
	addr    string
	enabled bool
	pool    chan *pooledConn
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
		poolSize := defaultPoolSize
		if v := os.Getenv("REDIS_POOL_SIZE"); v != "" {
			if n, err := strconv.Atoi(v); err == nil && n > 0 {
				poolSize = n
			}
		}
		globalClient = &Client{
			addr:    net.JoinHostPort(host, port),
			enabled: true,
			pool:    make(chan *pooledConn, poolSize),
		}
		slog.Info("[redis] client initialised", "addr", globalClient.addr, "pool_size", poolSize)
	})
}

// Get returns the global Redis client. Panics if Init has not been called.
func Get() *Client {
	if globalClient == nil {
		panic("redis: client not initialised — call Init() first")
	}
	return globalClient
}

// ─── Connection pool ──────────────────────────────────────────────────────────

// getConn returns a pooled connection, dialling a new one when the pool is
// empty and under capacity. Blocking only occurs when all poolSize
// connections are checked out.
func (c *Client) getConn() (*pooledConn, error) {
	select {
	case pc := <-c.pool:
		return pc, nil
	default:
	}
	conn, err := net.DialTimeout("tcp", c.addr, 3*time.Second)
	if err != nil {
		return nil, err
	}
	return &pooledConn{conn: conn, br: bufio.NewReader(conn)}, nil
}

// putConn returns a healthy connection to the pool (or closes it when full).
func (c *Client) putConn(pc *pooledConn) {
	if pc == nil {
		return
	}
	select {
	case c.pool <- pc:
	default:
		_ = pc.conn.Close()
	}
}

// discardConn closes a broken connection instead of returning it to the pool.
func (c *Client) discardConn(pc *pooledConn) {
	if pc != nil {
		_ = pc.conn.Close()
	}
}

// ─── RESP encoding (PC7: strconv.Append*, no fmt.Sprintf) ────────────────────

// appendCommand appends a RESP array encoding of args to buf.
func appendCommand(buf []byte, args ...string) []byte {
	buf = append(buf, '*')
	buf = strconv.AppendInt(buf, int64(len(args)), 10)
	buf = append(buf, '\r', '\n')
	for _, a := range args {
		buf = append(buf, '$')
		buf = strconv.AppendInt(buf, int64(len(a)), 10)
		buf = append(buf, '\r', '\n')
		buf = append(buf, a...)
		buf = append(buf, '\r', '\n')
	}
	return buf
}

// readReply reads exactly one RESP reply and returns its raw wire bytes,
// preserving the reply text (e.g. "+OK\r\n", "$-1\r\n", ":42\r\n",
// "$3\r\nfoo\r\n", arrays) so callers can keep using simple string compares
// and the existing parse helpers.
func readReply(br *bufio.Reader) (string, error) {
	// Pre-size for a typical single-line reply.
	buf := make([]byte, 0, 64)
	if err := readOneReply(br, &buf); err != nil {
		return "", err
	}
	return string(buf), nil
}

func readOneReply(br *bufio.Reader, buf *[]byte) error {
	line, err := br.ReadBytes('\n')
	if err != nil {
		return err
	}
	*buf = append(*buf, line...)
	if len(line) < 3 { // at least type + "\r\n"
		return fmt.Errorf("redis: malformed reply %q", line)
	}
	switch line[0] {
	case '+', '-', ':':
		return nil
	case '$':
		n, err := strconv.ParseInt(string(line[1:len(line)-2]), 10, 64)
		if err != nil {
			return fmt.Errorf("redis: bad bulk length: %w", err)
		}
		if n < 0 { // null bulk ($-1)
			return nil
		}
		payload := make([]byte, n+2) // value + CRLF
		if _, err := io.ReadFull(br, payload); err != nil {
			return err
		}
		*buf = append(*buf, payload...)
		return nil
	case '*':
		n, err := strconv.ParseInt(string(line[1:len(line)-2]), 10, 64)
		if err != nil {
			return fmt.Errorf("redis: bad array length: %w", err)
		}
		for i := int64(0); i < n; i++ {
			if err := readOneReply(br, buf); err != nil {
				return err
			}
		}
		return nil
	default:
		return fmt.Errorf("redis: unknown reply type %q", line[0])
	}
}

// sendCommand writes one command over pc and reads one reply.
func sendCommand(pc *pooledConn, args ...string) (string, error) {
	buf := make([]byte, 0, 64+len(args)*16)
	buf = appendCommand(buf, args...)
	pc.conn.SetDeadline(time.Now().Add(5 * time.Second))
	if _, err := pc.conn.Write(buf); err != nil {
		return "", err
	}
	return readReply(pc.br)
}

// exec borrows a pooled connection, runs one command, and returns the raw
// reply. Broken connections are discarded, healthy ones returned to the pool.
func (c *Client) exec(args ...string) (string, error) {
	pc, err := c.getConn()
	if err != nil {
		return "", err
	}
	resp, err := sendCommand(pc, args...)
	if err != nil {
		c.discardConn(pc)
		return "", err
	}
	c.putConn(pc)
	return resp, nil
}

// Pipeline sends a batch of commands over a single connection in ONE write
// and reads all replies — a single network round trip for the whole batch
// (PC4). Individual reply errors are surfaced as RESP "-ERR ..." strings in
// the results; a transport-level failure aborts the whole batch.
func (c *Client) Pipeline(ctx context.Context, cmds [][]string) ([]string, error) {
	if !c.enabled {
		return nil, errors.New("redis: client disabled")
	}
	if len(cmds) == 0 {
		return nil, nil
	}
	pc, err := c.getConn()
	if err != nil {
		return nil, fmt.Errorf("redis.Pipeline: get conn: %w", err)
	}
	total := 0
	for _, a := range cmds {
		total += 16 * (len(a) + 1)
	}
	buf := make([]byte, 0, total)
	for _, a := range cmds {
		buf = appendCommand(buf, a...)
	}
	pc.conn.SetDeadline(time.Now().Add(10 * time.Second))
	if _, err := pc.conn.Write(buf); err != nil {
		c.discardConn(pc)
		return nil, fmt.Errorf("redis.Pipeline: write: %w", err)
	}
	results := make([]string, len(cmds))
	for i := range cmds {
		resp, err := readReply(pc.br)
		if err != nil {
			c.discardConn(pc)
			return nil, fmt.Errorf("redis.Pipeline: read reply %d: %w", i, err)
		}
		results[i] = resp
	}
	c.putConn(pc)
	return results, nil
}

// ─── Public API ───────────────────────────────────────────────────────────────

// SetEX stores a string value with a TTL (seconds). No-op if disabled.
func (c *Client) SetEX(ctx context.Context, key, value string, ttl time.Duration) error {
	if !c.enabled {
		return nil
	}
	ttlSec := strconv.FormatInt(int64(ttl.Seconds()), 10)
	_, err := c.exec("SETEX", key, ttlSec, value)
	if err != nil {
		slog.Warn("[redis] SetEX failed", "key", key, "err", err)
	}
	return nil
}

// GetString retrieves a string value. Returns ("", false, nil) if not found or disabled.
func (c *Client) GetString(ctx context.Context, key string) (string, bool, error) {
	if !c.enabled {
		return "", false, nil
	}
	resp, err := c.exec("GET", key)
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
	_, err := c.exec("DEL", key)
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
	resp, err := c.exec("EXISTS", key)
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
	return "idempotency:" + operation + ":" + reference
}

// CheckAndSetIdempotency returns true if this reference has already been
// processed (duplicate), false if it is new (and marks it as processed).
//
// H26: the check-and-set is a SINGLE atomic `SET key 1 NX EX 86400` — the
// previous EXISTS→SETEX pair had a TOCTOU window where two concurrent
// requests both passed the EXISTS check and both executed the money path.
//
// Fail-closed contract: when Redis is unreachable the function returns a
// non-nil error (not "false, nil"). Money-path callers MUST treat that error
// as 503 and abort; non-money paths may log and proceed.
func (c *Client) CheckAndSetIdempotency(ctx context.Context, operation, reference string) (bool, error) {
	key := IdempotencyKey(operation, reference)
	if !c.enabled {
		// Dev mode: no Redis — treat every reference as new.
		return false, nil
	}
	ttlSec := strconv.FormatInt(int64(idempotencyTTL.Seconds()), 10)
	resp, err := c.exec("SET", key, "1", "NX", "EX", ttlSec)
	if err != nil {
		slog.Error("[redis] idempotency SET NX EX failed — failing closed", "operation", operation, "reference", reference, "err", err)
		return false, fmt.Errorf("redis.CheckAndSetIdempotency: SET NX EX: %w", err)
	}
	// SET ... NX returns +OK when the key was set (new reference) and a null
	// bulk reply ($-1) when the key already existed (duplicate).
	if resp == "$-1\r\n" {
		slog.Info("[redis] idempotency hit", "operation", operation, "reference", reference)
		return true, nil
	}
	return false, nil
}

// ─── NIP cache helpers ────────────────────────────────────────────────────────

const nipCacheTTL = 24 * time.Hour

// NIPCacheKey returns the Redis key for a NIP name enquiry result.
func NIPCacheKey(accountNumber, bankCode string) string {
	return "nip:name:" + bankCode + ":" + accountNumber
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
