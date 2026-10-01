// Package ratelimit provides a Redis-backed fixed-window (per-minute) rate
// limiting middleware for the PayGate bridge.
//
// Semantics (A4-HIGH-4):
//   - Per-caller key: hash of the X-Internal-Key / Bearer credential, falling
//     back to RemoteAddr when no credential is present.
//   - Limit configurable via BRIDGE_RATE_LIMIT_PER_MIN (default 600/min).
//   - Implemented as INCR + EXPIRE in a single Redis pipeline (one RTT).
//   - FAIL-LOUD: on any Redis error the request is rejected with 503 and an
//     error is logged — a money-movement gateway must not silently run
//     unthrottled. When REDIS_URL is unset (dev mode, client disabled) the
//     middleware logs a one-time warning and allows traffic.
package ratelimit

import (
	"context"
	"crypto/sha256"
	"encoding/hex"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
	"time"

	"github.com/paygate/go-bridge/internal/redis"
)

const (
	defaultLimitPerMin = 600
	windowSecs         = 60
)

var (
	limitPerMin int
	warnOnce    sync.Once
)

func init() {
	limitPerMin = defaultLimitPerMin
	if v := os.Getenv("BRIDGE_RATE_LIMIT_PER_MIN"); v != "" {
		if n, err := strconv.Atoi(v); err == nil && n > 0 {
			limitPerMin = n
		} else {
			slog.Error("[ratelimit] invalid BRIDGE_RATE_LIMIT_PER_MIN — using default",
				"value", v, "default", defaultLimitPerMin)
		}
	}
}

// callerKey derives a stable, non-reversible caller identifier from the
// request credential (never logged in the clear).
func callerKey(r *http.Request) string {
	cred := r.Header.Get("X-Internal-Key")
	if cred == "" {
		if auth := r.Header.Get("Authorization"); strings.HasPrefix(auth, "Bearer ") {
			cred = strings.TrimPrefix(auth, "Bearer ")
		}
	}
	if cred == "" {
		cred = "ip:" + r.RemoteAddr
	}
	sum := sha256.Sum256([]byte(cred))
	return "rl:" + hex.EncodeToString(sum[:8])
}

// Allow checks the caller's rate limit. Returns true to proceed; on denial
// or Redis failure it writes the response (429/503) and returns false.
func Allow(w http.ResponseWriter, r *http.Request) bool {
	c := redis.Get()
	if !c.Enabled() {
		warnOnce.Do(func() {
			slog.Warn("[ratelimit] Redis disabled (REDIS_URL unset) — rate limiting inactive (dev mode)")
		})
		return true
	}
	ctx, cancel := context.WithTimeout(r.Context(), 3*time.Second)
	defer cancel()
	key := callerKey(r)
	replies, err := c.Pipeline(ctx, [][]string{
		{"INCR", key},
		{"EXPIRE", key, strconv.Itoa(windowSecs)},
	})
	if err != nil {
		slog.Error("[ratelimit] Redis error — failing closed (503)", "err", err, "path", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"rate limiter unavailable","code":503}`))
		return false
	}
	for _, rep := range replies {
		if strings.HasPrefix(rep, "-ERR") {
			slog.Error("[ratelimit] Redis command error — failing closed (503)", "reply", rep, "path", r.URL.Path)
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusServiceUnavailable)
			_, _ = w.Write([]byte(`{"error":"rate limiter unavailable","code":503}`))
			return false
		}
	}
	// INCR integer reply arrives as ":<n>".
	count, err := strconv.ParseInt(strings.TrimPrefix(replies[0], ":"), 10, 64)
	if err != nil {
		slog.Error("[ratelimit] unparseable INCR reply — failing closed (503)", "reply", replies[0], "path", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.WriteHeader(http.StatusServiceUnavailable)
		_, _ = w.Write([]byte(`{"error":"rate limiter unavailable","code":503}`))
		return false
	}
	if count > int64(limitPerMin) {
		slog.Warn("[ratelimit] limit exceeded", "caller", key, "count", count, "limit", limitPerMin, "path", r.URL.Path)
		w.Header().Set("Content-Type", "application/json")
		w.Header().Set("Retry-After", strconv.Itoa(windowSecs))
		w.WriteHeader(http.StatusTooManyRequests)
		_, _ = w.Write([]byte(`{"error":"rate limit exceeded","code":429}`))
		return false
	}
	return true
}
