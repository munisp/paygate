package handlers

import (
	"bytes"
	"encoding/json"
	"net/http"
	"net/http/httptest"
	"testing"
)

// ─── ProbePing ────────────────────────────────────────────────────────────────

func TestProbePing_DefaultSize(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/ping", nil)
	w := httptest.NewRecorder()
	ProbePing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp PingResponse
	if err := json.NewDecoder(w.Body).Decode(&resp); err != nil {
		t.Fatalf("failed to decode response: %v", err)
	}
	if resp.PaddingBytes != 1024 {
		t.Errorf("expected 1024 padding bytes, got %d", resp.PaddingBytes)
	}
	if resp.ServerTimeUTC == "" {
		t.Error("expected server_time_utc to be set")
	}
}

func TestProbePing_CustomSize(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/ping?size=512", nil)
	w := httptest.NewRecorder()
	ProbePing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp PingResponse
	json.NewDecoder(w.Body).Decode(&resp)
	if resp.PaddingBytes != 512 {
		t.Errorf("expected 512 padding bytes, got %d", resp.PaddingBytes)
	}
}

func TestProbePing_MaxSizeClamped(t *testing.T) {
	// Request size over 65536 should be clamped to default 1024
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/ping?size=999999", nil)
	w := httptest.NewRecorder()
	ProbePing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var resp PingResponse
	json.NewDecoder(w.Body).Decode(&resp)
	// Should fall back to default 1024
	if resp.PaddingBytes != 1024 {
		t.Errorf("expected 1024 (clamped), got %d", resp.PaddingBytes)
	}
}

func TestProbePing_GzipAccepted(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/ping", nil)
	req.Header.Set("Accept-Encoding", "gzip")
	w := httptest.NewRecorder()
	ProbePing(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("Content-Encoding") != "gzip" {
		t.Error("expected Content-Encoding: gzip")
	}
}

// ─── ProbeBandwidth ───────────────────────────────────────────────────────────

func TestProbeBandwidth_DefaultSize(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/bandwidth", nil)
	w := httptest.NewRecorder()
	ProbeBandwidth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Header().Get("X-Probe-Payload-Bytes") != "102400" {
		t.Errorf("expected 102400 bytes header, got %s", w.Header().Get("X-Probe-Payload-Bytes"))
	}
	if w.Body.Len() != 102400 {
		t.Errorf("expected 102400 body bytes, got %d", w.Body.Len())
	}
}

func TestProbeBandwidth_CustomSize(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/bandwidth?size=4096", nil)
	w := httptest.NewRecorder()
	ProbeBandwidth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	if w.Body.Len() != 4096 {
		t.Errorf("expected 4096 body bytes, got %d", w.Body.Len())
	}
}

func TestProbeBandwidth_MaxSizeClamped(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/bandwidth?size=9999999", nil)
	w := httptest.NewRecorder()
	ProbeBandwidth(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	// Should be clamped to default 102400
	if w.Body.Len() != 102400 {
		t.Errorf("expected 102400 (clamped), got %d", w.Body.Len())
	}
}

// ─── ProbeReport ──────────────────────────────────────────────────────────────

func TestProbeReport_2G(t *testing.T) {
	report := ClientQualityReport{
		EffectiveType: "2g",
		DownlinkMbps:  0.1,
		RTTMs:         900,
		SessionID:     "test-sess-2g",
	}
	body, _ := json.Marshal(report)
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var cfg AdaptiveConfig
	json.NewDecoder(w.Body).Decode(&cfg)
	if cfg.Tier != Tier2G {
		t.Errorf("expected tier 2g, got %s", cfg.Tier)
	}
	if cfg.SSEEnabled {
		t.Error("SSE should be disabled on 2G")
	}
	if cfg.WSEnabled {
		t.Error("WebSocket should be disabled on 2G")
	}
	if !cfg.ForceGzip {
		t.Error("gzip should be forced on 2G")
	}
	if cfg.PollingIntervalMs != 60_000 {
		t.Errorf("expected 60000ms polling on 2G, got %d", cfg.PollingIntervalMs)
	}
}

func TestProbeReport_3G(t *testing.T) {
	report := ClientQualityReport{
		EffectiveType: "3g",
		DownlinkMbps:  1.0,
		RTTMs:         350,
		SessionID:     "test-sess-3g",
	}
	body, _ := json.Marshal(report)
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	var cfg AdaptiveConfig
	json.NewDecoder(w.Body).Decode(&cfg)
	if cfg.Tier != Tier3G {
		t.Errorf("expected tier 3g, got %s", cfg.Tier)
	}
	if cfg.SSEEnabled != true {
		t.Error("SSE should be enabled on 3G")
	}
	if cfg.WSEnabled {
		t.Error("WebSocket should be disabled on 3G")
	}
}

func TestProbeReport_4G(t *testing.T) {
	report := ClientQualityReport{
		DownlinkMbps: 5.0,
		RTTMs:        80,
		SessionID:    "test-sess-4g",
	}
	body, _ := json.Marshal(report)
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	var cfg AdaptiveConfig
	json.NewDecoder(w.Body).Decode(&cfg)
	if cfg.Tier != Tier4G {
		t.Errorf("expected tier 4g, got %s", cfg.Tier)
	}
	if !cfg.WSEnabled {
		t.Error("WebSocket should be enabled on 4G")
	}
}

func TestProbeReport_Wifi(t *testing.T) {
	report := ClientQualityReport{
		DownlinkMbps: 50.0,
		RTTMs:        20,
		SessionID:    "test-sess-wifi",
	}
	body, _ := json.Marshal(report)
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	var cfg AdaptiveConfig
	json.NewDecoder(w.Body).Decode(&cfg)
	if cfg.Tier != TierWifi {
		t.Errorf("expected tier wifi, got %s", cfg.Tier)
	}
	if cfg.ForceGzip {
		t.Error("gzip should not be forced on wifi")
	}
	if cfg.PollingIntervalMs != 10_000 {
		t.Errorf("expected 10000ms polling on wifi, got %d", cfg.PollingIntervalMs)
	}
}

func TestProbeReport_HighPacketLossIncreasesRetry(t *testing.T) {
	report := ClientQualityReport{
		DownlinkMbps:  2.0,
		RTTMs:         200,
		PacketLossPct: 25.0,
		SessionID:     "test-sess-lossy",
	}
	body, _ := json.Marshal(report)
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader(body))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	var cfg AdaptiveConfig
	json.NewDecoder(w.Body).Decode(&cfg)
	// Base retry for 3G is 3000ms; with 25% packet loss it should be higher
	if cfg.RetryDelayMs <= 3000 {
		t.Errorf("expected retry delay > 3000ms with high packet loss, got %d", cfg.RetryDelayMs)
	}
}

func TestProbeReport_InvalidBody(t *testing.T) {
	req := httptest.NewRequest(http.MethodPost, "/v1/probe/report", bytes.NewReader([]byte("not-json")))
	req.Header.Set("Content-Type", "application/json")
	w := httptest.NewRecorder()
	ProbeReport(w, req)

	if w.Code != http.StatusBadRequest {
		t.Errorf("expected 400, got %d", w.Code)
	}
}

// ─── ProbeStats ───────────────────────────────────────────────────────────────

func TestProbeStats_ReturnsJSON(t *testing.T) {
	req := httptest.NewRequest(http.MethodGet, "/v1/probe/stats", nil)
	w := httptest.NewRecorder()
	ProbeStats(w, req)

	if w.Code != http.StatusOK {
		t.Fatalf("expected 200, got %d", w.Code)
	}
	var stats map[string]interface{}
	if err := json.NewDecoder(w.Body).Decode(&stats); err != nil {
		t.Fatalf("failed to decode stats: %v", err)
	}
	if _, ok := stats["total_sessions"]; !ok {
		t.Error("expected total_sessions in stats")
	}
	if _, ok := stats["tier_counts"]; !ok {
		t.Error("expected tier_counts in stats")
	}
}

// ─── classifyTier ─────────────────────────────────────────────────────────────

func TestClassifyTier_ByEffectiveType(t *testing.T) {
	cases := []struct {
		effectiveType string
		expected      ConnectionTier
	}{
		{"slow-2g", Tier2G},
		{"2g", Tier2G},
		{"3g", Tier3G},
		{"4g", Tier4G},
	}
	for _, c := range cases {
		r := ClientQualityReport{EffectiveType: c.effectiveType}
		got := classifyTier(r)
		if got != c.expected {
			t.Errorf("effectiveType=%s: expected %s, got %s", c.effectiveType, c.expected, got)
		}
	}
}

func TestClassifyTier_ByDownlink(t *testing.T) {
	cases := []struct {
		downlink float64
		rtt      int
		expected ConnectionTier
	}{
		{0.05, 1000, Tier2G},
		{0.5, 500, Tier3G},
		{5.0, 100, Tier4G},
		{50.0, 10, TierWifi},
	}
	for _, c := range cases {
		r := ClientQualityReport{DownlinkMbps: c.downlink, RTTMs: c.rtt}
		got := classifyTier(r)
		if got != c.expected {
			t.Errorf("downlink=%.2f rtt=%d: expected %s, got %s", c.downlink, c.rtt, c.expected, got)
		}
	}
}
