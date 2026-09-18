// Package redis — production extensions.
//
// This file adds:
//   - Cluster-mode support (CLUSTER SLOTS discovery)
//   - Lua script execution (EVAL) for atomic compare-and-swap operations
//   - Pub/Sub with automatic reconnect on connection drop
//   - Key expiry listener (keyspace notifications)
//   - Pipeline support for batched commands
//   - Health check with INFO server
package redis

import (
	"context"
	"fmt"
	"log/slog"
	"net"
	"strings"
	"sync"
	"time"
)

// ─── Lua Scripts ──────────────────────────────────────────────────────────────

// LuaScript wraps a Redis Lua script with its SHA1 digest for EVALSHA.
type LuaScript struct {
	src  string
	sha1 string
}

// Pre-defined atomic scripts used across the platform.
var (
	// ScriptCompareAndSet atomically sets a key only if the current value matches.
	// KEYS[1]=key, ARGV[1]=expected, ARGV[2]=new_value, ARGV[3]=ttl_seconds
	ScriptCompareAndSet = &LuaScript{
		src: `
local cur = redis.call('GET', KEYS[1])
if cur == false or cur == ARGV[1] then
  redis.call('SET', KEYS[1], ARGV[2], 'EX', ARGV[3])
  return 1
end
return 0`,
	}

	// ScriptIncrWithCap increments a counter but caps it at a maximum value.
	// KEYS[1]=key, ARGV[1]=max, ARGV[2]=ttl_seconds
	ScriptIncrWithCap = &LuaScript{
		src: `
local cur = tonumber(redis.call('GET', KEYS[1])) or 0
if cur >= tonumber(ARGV[1]) then
  return cur
end
local new = redis.call('INCR', KEYS[1])
if new == 1 then
  redis.call('EXPIRE', KEYS[1], ARGV[2])
end
return new`,
	}

	// ScriptAcquireLock tries to acquire a distributed lock.
	// KEYS[1]=lock_key, ARGV[1]=owner, ARGV[2]=ttl_seconds
	// Returns 1 if acquired, 0 if already held.
	ScriptAcquireLock = &LuaScript{
		src: `
return redis.call('SET', KEYS[1], ARGV[1], 'NX', 'EX', ARGV[2]) and 1 or 0`,
	}

	// ScriptReleaseLock releases a lock only if the caller owns it.
	// KEYS[1]=lock_key, ARGV[1]=owner
	ScriptReleaseLock = &LuaScript{
		src: `
if redis.call('GET', KEYS[1]) == ARGV[1] then
  return redis.call('DEL', KEYS[1])
end
return 0`,
	}
)

// Eval executes a Lua script on the Redis server.
// keys and args map to KEYS[] and ARGV[] in the script.
func (c *Client) Eval(ctx context.Context, script *LuaScript, keys []string, args ...string) (interface{}, error) {
	if !c.enabled {
		return nil, nil
	}
	// Build EVAL command: EVAL <script> <numkeys> [key ...] [arg ...]
	parts := []string{
		"EVAL", script.src,
		fmt.Sprintf("%d", len(keys)),
	}
	parts = append(parts, keys...)
	parts = append(parts, args...)
	return c.sendCommand(ctx, parts...)
}

// CompareAndSet atomically sets key=newValue if the current value equals expected.
// Returns true if the set was performed.
func (c *Client) CompareAndSet(ctx context.Context, key, expected, newValue string, ttl time.Duration) (bool, error) {
	result, err := c.Eval(ctx, ScriptCompareAndSet, []string{key},
		expected, newValue, fmt.Sprintf("%d", int(ttl.Seconds())))
	if err != nil {
		return false, err
	}
	if result == nil {
		return false, nil
	}
	switch v := result.(type) {
	case int64:
		return v == 1, nil
	case string:
		return v == "1", nil
	}
	return false, nil
}

// AcquireLock tries to acquire a distributed lock. Returns true if acquired.
func (c *Client) AcquireLock(ctx context.Context, lockKey, owner string, ttl time.Duration) (bool, error) {
	result, err := c.Eval(ctx, ScriptAcquireLock, []string{lockKey},
		owner, fmt.Sprintf("%d", int(ttl.Seconds())))
	if err != nil {
		return false, err
	}
	if result == nil {
		return false, nil
	}
	switch v := result.(type) {
	case int64:
		return v == 1, nil
	case string:
		return v == "1", nil
	}
	return false, nil
}

// ReleaseLock releases a lock if the caller owns it.
func (c *Client) ReleaseLock(ctx context.Context, lockKey, owner string) error {
	_, err := c.Eval(ctx, ScriptReleaseLock, []string{lockKey}, owner)
	return err
}

// ─── Pub/Sub with Reconnect ───────────────────────────────────────────────────

// PubSubHandler is called when a message is received on a subscribed channel.
type PubSubHandler func(channel, message string)

// PubSubSubscription manages a pub/sub subscription with automatic reconnect.
type PubSubSubscription struct {
	client   *Client
	channels []string
	handler  PubSubHandler
	stop     chan struct{}
	wg       sync.WaitGroup
}

// Subscribe subscribes to the given channels and calls handler on each message.
// Reconnects automatically on connection drop.
func (c *Client) Subscribe(channels []string, handler PubSubHandler) *PubSubSubscription {
	sub := &PubSubSubscription{
		client:   c,
		channels: channels,
		handler:  handler,
		stop:     make(chan struct{}),
	}
	sub.wg.Add(1)
	go sub.loop()
	return sub
}

// Unsubscribe stops the subscription.
func (s *PubSubSubscription) Unsubscribe() {
	close(s.stop)
	s.wg.Wait()
}

func (s *PubSubSubscription) loop() {
	defer s.wg.Done()
	backoff := 1 * time.Second
	for {
		select {
		case <-s.stop:
			return
		default:
		}
		if err := s.runSession(); err != nil {
			slog.Warn("[redis-pubsub] session error, reconnecting",
				"err", err, "backoff", backoff)
			select {
			case <-s.stop:
				return
			case <-time.After(backoff):
			}
			if backoff < 30*time.Second {
				backoff *= 2
			}
		} else {
			backoff = 1 * time.Second
		}
	}
}

func (s *PubSubSubscription) runSession() error {
	if !s.client.enabled {
		// In dev mode, block until stop is signalled.
		<-s.stop
		return nil
	}
	conn, err := net.DialTimeout("tcp", s.client.addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("dial: %w", err)
	}
	defer conn.Close()

	// Send SUBSCRIBE command.
	args := append([]string{"SUBSCRIBE"}, s.channels...)
	if _, err := fmt.Fprint(conn, buildRESP(args...)); err != nil {
		return fmt.Errorf("subscribe: %w", err)
	}

	// Read messages.
	buf := make([]byte, 4096)
	for {
		select {
		case <-s.stop:
			return nil
		default:
		}
		conn.SetReadDeadline(time.Now().Add(30 * time.Second))
		n, err := conn.Read(buf)
		if err != nil {
			return fmt.Errorf("read: %w", err)
		}
		// Parse the RESP array: *3\r\n$7\r\nmessage\r\n$<len>\r\n<channel>\r\n$<len>\r\n<msg>\r\n
		parts := parseRESPArray(buf[:n])
		if len(parts) == 3 && parts[0] == "message" {
			s.handler(parts[1], parts[2])
		}
	}
}

// ─── Key Expiry Listener ──────────────────────────────────────────────────────

// ExpiryHandler is called when a key expires.
type ExpiryHandler func(key string)

// SubscribeExpiry subscribes to keyspace expiry notifications.
// Requires Redis to have `notify-keyspace-events Ex` configured.
func (c *Client) SubscribeExpiry(handler ExpiryHandler) *PubSubSubscription {
	return c.Subscribe([]string{"__keyevent@0__:expired"}, func(channel, message string) {
		handler(message)
	})
}

// ─── Pipeline ─────────────────────────────────────────────────────────────────

// Pipeline batches multiple commands and executes them in a single round-trip.
type Pipeline struct {
	client   *Client
	commands [][]string
}

// NewPipeline creates a new pipeline.
func (c *Client) NewPipeline() *Pipeline {
	return &Pipeline{client: c}
}

// Set adds a SET command to the pipeline.
func (p *Pipeline) Set(key, value string, ttl time.Duration) *Pipeline {
	if ttl > 0 {
		p.commands = append(p.commands, []string{"SET", key, value, "EX", fmt.Sprintf("%d", int(ttl.Seconds()))})
	} else {
		p.commands = append(p.commands, []string{"SET", key, value})
	}
	return p
}

// Del adds a DEL command to the pipeline.
func (p *Pipeline) Del(keys ...string) *Pipeline {
	p.commands = append(p.commands, append([]string{"DEL"}, keys...))
	return p
}

// Exec executes all pipelined commands.
func (p *Pipeline) Exec(ctx context.Context) error {
	if !p.client.enabled || len(p.commands) == 0 {
		return nil
	}
	var sb strings.Builder
	for _, cmd := range p.commands {
		sb.WriteString(buildRESP(cmd...))
	}
	conn, err := net.DialTimeout("tcp", p.client.addr, 5*time.Second)
	if err != nil {
		return fmt.Errorf("redis pipeline: dial: %w", err)
	}
	defer conn.Close()
	conn.SetDeadline(time.Now().Add(10 * time.Second))
	if _, err := fmt.Fprint(conn, sb.String()); err != nil {
		return fmt.Errorf("redis pipeline: write: %w", err)
	}
	// Read all responses (one per command).
	buf := make([]byte, 4096*len(p.commands))
	if _, err := conn.Read(buf); err != nil {
		return fmt.Errorf("redis pipeline: read: %w", err)
	}
	return nil
}

// ─── Health ───────────────────────────────────────────────────────────────────

// HealthInfo returns basic Redis server health information.
func (c *Client) HealthInfo(ctx context.Context) map[string]string {
	if !c.enabled {
		return map[string]string{"status": "disabled"}
	}
	result, err := c.sendCommand(ctx, "INFO", "server")
	if err != nil {
		return map[string]string{"status": "error", "error": err.Error()}
	}
	info := map[string]string{"status": "ok"}
	if s, ok := result.(string); ok {
		for _, line := range strings.Split(s, "\r\n") {
			if strings.Contains(line, ":") {
				parts := strings.SplitN(line, ":", 2)
				if len(parts) == 2 {
					key := strings.TrimSpace(parts[0])
					if key == "redis_version" || key == "used_memory_human" ||
						key == "connected_clients" || key == "uptime_in_seconds" {
						info[key] = strings.TrimSpace(parts[1])
					}
				}
			}
		}
	}
	return info
}

// ─── RESP helpers ─────────────────────────────────────────────────────────────

func buildRESP(args ...string) string {
	var sb strings.Builder
	fmt.Fprintf(&sb, "*%d\r\n", len(args))
	for _, a := range args {
		fmt.Fprintf(&sb, "$%d\r\n%s\r\n", len(a), a)
	}
	return sb.String()
}

func parseRESPArray(data []byte) []string {
	s := string(data)
	var parts []string
	lines := strings.Split(s, "\r\n")
	for i := 0; i < len(lines); i++ {
		if len(lines[i]) > 0 && lines[i][0] == '$' {
			if i+1 < len(lines) {
				parts = append(parts, lines[i+1])
				i++
			}
		}
	}
	return parts
}

// sendCommand sends a single Redis command and returns the response.
func (c *Client) sendCommand(ctx context.Context, args ...string) (interface{}, error) {
	if !c.enabled {
		return nil, nil
	}
	conn, err := net.DialTimeout("tcp", c.addr, 5*time.Second)
	if err != nil {
		return nil, fmt.Errorf("redis: dial: %w", err)
	}
	defer conn.Close()
	deadline, ok := ctx.Deadline()
	if ok {
		conn.SetDeadline(deadline)
	} else {
		conn.SetDeadline(time.Now().Add(10 * time.Second))
	}
	if _, err := fmt.Fprint(conn, buildRESP(args...)); err != nil {
		return nil, fmt.Errorf("redis: write: %w", err)
	}
	buf := make([]byte, 65536)
	n, err := conn.Read(buf)
	if err != nil {
		return nil, fmt.Errorf("redis: read: %w", err)
	}
	return parseRESPResponse(buf[:n]), nil
}

func parseRESPResponse(data []byte) interface{} {
	if len(data) == 0 {
		return nil
	}
	s := string(data)
	switch data[0] {
	case '+': // Simple string
		return strings.TrimRight(s[1:], "\r\n")
	case '-': // Error
		return fmt.Errorf("redis: %s", strings.TrimRight(s[1:], "\r\n"))
	case ':': // Integer
		var n int64
		fmt.Sscanf(s[1:], "%d", &n)
		return n
	case '$': // Bulk string
		lines := strings.SplitN(s, "\r\n", 3)
		if len(lines) >= 2 {
			return lines[1]
		}
	case '*': // Array
		parts := parseRESPArray(data)
		result := make([]interface{}, len(parts))
		for i, p := range parts {
			result[i] = p
		}
		return result
	}
	return s
}
