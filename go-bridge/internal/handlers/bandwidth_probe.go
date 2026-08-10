package handlers

// bandwidth_probe.go — Wave 109 Connectivity Resilience
//
// Provides three endpoints for the frontend to detect connection quality
// and request appropriately-sized API responses:
//
//   GET  /v1/probe/ping          — RTT measurement (returns 1 KB payload)
//   GET  /v1/probe/bandwidth     — Bandwidth estimation (returns configurable payload)
//   POST /v1/probe/report        — Receive client-side quality report and return
//                                  adaptive config (compression, polling interval,
//                                  payload size tier)
//
// Connection tiers returned to client:
//   "2g"   — < 150 kbps  → minimal payloads, 60 s polling, gzip forced
//   "3g"   — < 1.5 Mbps  → reduced payloads, 30 s polling, gzip
//   "4g"   — < 10 Mbps   → standard payloads, 15 s polling, gzip optional
//   "wifi" — ≥ 10 Mbps   → full payloads, 10 s polling, no compression overhead

import (
	"compress/gzip"
	"encoding/json"
	"fmt"
	"math"
	"net/http"
	"strconv"
	"strings"
	"sync"
	"time"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// ConnectionTier classifies network quality.
type ConnectionTier string

const (
	Tier2G   ConnectionTier = "2g"
	Tier3G   ConnectionTier = "3g"
	Tier4G   ConnectionTier = "4g"
	TierWifi ConnectionTier = "wifi"
)

// AdaptiveConfig is returned to the client so it can self-configure.
type AdaptiveConfig struct {
	Tier              ConnectionTier `json:"tier"`
	PollingIntervalMs int            `json:"polling_interval_ms"`
	PayloadSizeTier   string         `json:"payload_size_tier"`  // "minimal" | "reduced" | "standard" | "full"
	ForceGzip         bool           `json:"force_gzip"`
	MaxBatchSize      int            `json:"max_batch_size"`      // tRPC batch limit
	SSEEnabled        bool           `json:"sse_enabled"`         // disable SSE on 2G
	WSEnabled         bool           `json:"ws_enabled"`          // disable WS on 2G
	RetryDelayMs      int            `json:"retry_delay_ms"`      // base retry delay
	MaxRetries        int            `json:"max_retries"`
	ImageQuality      int            `json:"image_quality"`       // 0-100
}

// ClientQualityReport is sent by the frontend.
type ClientQualityReport struct {
	EffectiveType    string  `json:"effective_type"`    // "slow-2g"|"2g"|"3g"|"4g"
	DownlinkMbps     float64 `json:"downlink_mbps"`
	RTTMs            int     `json:"rtt_ms"`
	PacketLossPct    float64 `json:"packet_loss_pct"`
	MeasuredAtUTC    string  `json:"measured_at_utc"`
	MerchantID       int     `json:"merchant_id"`
	SessionID        string  `json:"session_id"`
}

// PingResponse is returned from the ping endpoint.
type PingResponse struct {
	ServerTimeUTC string `json:"server_time_utc"`
	EchoMs        int64  `json:"echo_ms"`
	PaddingBytes  int    `json:"padding_bytes"`
	// Padding is included so the client can measure download time
	Padding string `json:"_padding,omitempty"`
}

// ─── In-memory quality store (last report per session) ───────────────────────

type qualityStore struct {
	mu      sync.RWMutex
	reports map[string]ClientQualityReport // session_id → report
	configs map[string]AdaptiveConfig      // session_id → config
}

var store = &qualityStore{
	reports: make(map[string]ClientQualityReport),
	configs: make(map[string]AdaptiveConfig),
}

// ─── Tier classification ──────────────────────────────────────────────────────

func classifyTier(report ClientQualityReport) ConnectionTier {
	// Use effective_type from Network Information API if available
	switch strings.ToLower(report.EffectiveType) {
	case "slow-2g", "2g":
		return Tier2G
	case "3g":
		return Tier3G
	case "4g":
		return Tier4G
	}

	// Fall back to measured downlink
	switch {
	case report.DownlinkMbps < 0.15 || report.RTTMs > 800:
		return Tier2G
	case report.DownlinkMbps < 1.5 || report.RTTMs > 400:
		return Tier3G
	case report.DownlinkMbps < 10.0 || report.RTTMs > 150:
		return Tier4G
	default:
		return TierWifi
	}
}

func buildAdaptiveConfig(tier ConnectionTier) AdaptiveConfig {
	switch tier {
	case Tier2G:
		return AdaptiveConfig{
			Tier:              Tier2G,
			PollingIntervalMs: 60_000,
			PayloadSizeTier:   "minimal",
			ForceGzip:         true,
			MaxBatchSize:      3,
			SSEEnabled:        false,
			WSEnabled:         false,
			RetryDelayMs:      5_000,
			MaxRetries:        10,
			ImageQuality:      30,
		}
	case Tier3G:
		return AdaptiveConfig{
			Tier:              Tier3G,
			PollingIntervalMs: 30_000,
			PayloadSizeTier:   "reduced",
			ForceGzip:         true,
			MaxBatchSize:      5,
			SSEEnabled:        true,
			WSEnabled:         false,
			RetryDelayMs:      3_000,
			MaxRetries:        7,
			ImageQuality:      60,
		}
	case Tier4G:
		return AdaptiveConfig{
			Tier:              Tier4G,
			PollingIntervalMs: 15_000,
			PayloadSizeTier:   "standard",
			ForceGzip:         true,
			MaxBatchSize:      10,
			SSEEnabled:        true,
			WSEnabled:         true,
			RetryDelayMs:      2_000,
			MaxRetries:        5,
			ImageQuality:      80,
		}
	default: // wifi
		return AdaptiveConfig{
			Tier:              TierWifi,
			PollingIntervalMs: 10_000,
			PayloadSizeTier:   "full",
			ForceGzip:         false,
			MaxBatchSize:      20,
			SSEEnabled:        true,
			WSEnabled:         true,
			RetryDelayMs:      1_000,
			MaxRetries:        3,
			ImageQuality:      100,
		}
	}
}

// ─── Handlers ─────────────────────────────────────────────────────────────────

// ProbePing handles GET /v1/probe/ping
// Returns a small payload with server timestamp so the client can measure RTT.
// Query param: size=<bytes> (default 1024, max 65536)
func ProbePing(w http.ResponseWriter, r *http.Request) {
	start := time.Now()

	sizeStr := r.URL.Query().Get("size")
	size := 1024
	if sizeStr != "" {
		if n, err := strconv.Atoi(sizeStr); err == nil && n > 0 && n <= 65536 {
			size = n
		}
	}

	// Build padding of requested size
	padding := strings.Repeat("x", size)

	resp := PingResponse{
		ServerTimeUTC: time.Now().UTC().Format(time.RFC3339Nano),
		EchoMs:        time.Since(start).Milliseconds(),
		PaddingBytes:  size,
		Padding:       padding,
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Probe-Server-Time", fmt.Sprintf("%d", time.Now().UnixMilli()))

	// Honour gzip if client accepts it
	if strings.Contains(r.Header.Get("Accept-Encoding"), "gzip") {
		w.Header().Set("Content-Encoding", "gzip")
		gz := gzip.NewWriter(w)
		defer gz.Close()
		json.NewEncoder(gz).Encode(resp) //nolint:errcheck
		return
	}

	json.NewEncoder(w).Encode(resp) //nolint:errcheck
}

// ProbeBandwidth handles GET /v1/probe/bandwidth
// Returns a payload of exactly <size> bytes so the client can measure throughput.
// Query params:
//   size=<bytes>  (default 102400 = 100 KB, max 1048576 = 1 MB)
//   compress=1    (gzip the payload)
func ProbeBandwidth(w http.ResponseWriter, r *http.Request) {
	sizeStr := r.URL.Query().Get("size")
	size := 102_400 // 100 KB default
	if sizeStr != "" {
		if n, err := strconv.Atoi(sizeStr); err == nil && n > 0 && n <= 1_048_576 {
			size = n
		}
	}

	compress := r.URL.Query().Get("compress") == "1" ||
		strings.Contains(r.Header.Get("Accept-Encoding"), "gzip")

	w.Header().Set("Content-Type", "application/octet-stream")
	w.Header().Set("Cache-Control", "no-store")
	w.Header().Set("X-Probe-Payload-Bytes", strconv.Itoa(size))
	w.Header().Set("X-Probe-Server-Time", fmt.Sprintf("%d", time.Now().UnixMilli()))

	// Generate deterministic payload (repeating pattern, highly compressible)
	chunk := []byte("PayGate-BW-Probe-")
	buf := make([]byte, size)
	for i := range buf {
		buf[i] = chunk[i%len(chunk)]
	}

	if compress {
		w.Header().Set("Content-Encoding", "gzip")
		gz := gzip.NewWriter(w)
		gz.Write(buf) //nolint:errcheck
		gz.Close()
		return
	}

	w.Write(buf) //nolint:errcheck
}

// ProbeReport handles POST /v1/probe/report
// Receives a ClientQualityReport from the frontend and returns an AdaptiveConfig.
func ProbeReport(w http.ResponseWriter, r *http.Request) {
	var report ClientQualityReport
	if err := json.NewDecoder(r.Body).Decode(&report); err != nil {
		http.Error(w, `{"error":"invalid body"}`, http.StatusBadRequest)
		return
	}

	// Clamp unreasonable values
	if report.DownlinkMbps < 0 {
		report.DownlinkMbps = 0
	}
	if report.DownlinkMbps > 1000 {
		report.DownlinkMbps = 1000
	}
	if report.RTTMs < 0 {
		report.RTTMs = 0
	}
	if report.PacketLossPct < 0 || report.PacketLossPct > 100 {
		report.PacketLossPct = 0
	}

	tier := classifyTier(report)
	config := buildAdaptiveConfig(tier)

	// Adjust retry delay based on packet loss
	if report.PacketLossPct > 10 {
		// High packet loss → longer backoff
		multiplier := 1.0 + math.Min(report.PacketLossPct/20.0, 3.0)
		config.RetryDelayMs = int(float64(config.RetryDelayMs) * multiplier)
		config.MaxRetries = int(math.Min(float64(config.MaxRetries)*1.5, 15))
	}

	// Store for analytics
	if report.SessionID != "" {
		store.mu.Lock()
		store.reports[report.SessionID] = report
		store.configs[report.SessionID] = config
		store.mu.Unlock()
	}

	w.Header().Set("Content-Type", "application/json")
	w.Header().Set("Cache-Control", "no-store")
	json.NewEncoder(w).Encode(config) //nolint:errcheck
}

// ProbeStats handles GET /v1/probe/stats (internal — requires auth)
// Returns aggregate connectivity statistics across all active sessions.
func ProbeStats(w http.ResponseWriter, r *http.Request) {
	store.mu.RLock()
	defer store.mu.RUnlock()

	tierCounts := map[ConnectionTier]int{
		Tier2G: 0, Tier3G: 0, Tier4G: 0, TierWifi: 0,
	}
	var totalRTT, totalDownlink float64
	count := 0

	for _, cfg := range store.configs {
		tierCounts[cfg.Tier]++
	}
	for _, rep := range store.reports {
		totalRTT += float64(rep.RTTMs)
		totalDownlink += rep.DownlinkMbps
		count++
	}

	avgRTT := 0.0
	avgDownlink := 0.0
	if count > 0 {
		avgRTT = totalRTT / float64(count)
		avgDownlink = totalDownlink / float64(count)
	}

	stats := map[string]interface{}{
		"total_sessions":   count,
		"tier_counts":      tierCounts,
		"avg_rtt_ms":       math.Round(avgRTT*10) / 10,
		"avg_downlink_mbps": math.Round(avgDownlink*100) / 100,
		"timestamp":        time.Now().UTC().Format(time.RFC3339),
	}

	w.Header().Set("Content-Type", "application/json")
	json.NewEncoder(w).Encode(stats) //nolint:errcheck
}
