// Package apisix provides an APISIX Admin API client for the PayGate bridge.
//
// It manages:
//   - Route registration (create/update/delete)
//   - Upstream management (load balancing, health checks)
//   - Plugin configuration (JWT auth, rate limiting, CORS, IP restriction)
//   - Consumer management (per-merchant API keys)
//
// Environment variables:
//   APISIX_ADMIN_URL — APISIX Admin API base URL (default: http://apisix:9180)
//   APISIX_API_KEY   — APISIX Admin API key (X-API-KEY header)
//
// Reference: https://apisix.apache.org/docs/apisix/admin-api/
package apisix

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"time"
)

// ─── Types ────────────────────────────────────────────────────────────────────

// Route represents an APISIX route object.
type Route struct {
	ID      string                 `json:"id,omitempty"`
	Name    string                 `json:"name"`
	URI     string                 `json:"uri"`
	Methods []string               `json:"methods"`
	Plugins map[string]interface{} `json:"plugins,omitempty"`
	Upstream *Upstream             `json:"upstream,omitempty"`
	UpstreamID string              `json:"upstream_id,omitempty"`
	Status  int                    `json:"status"` // 1=enabled, 0=disabled
}

// Upstream represents an APISIX upstream object.
type Upstream struct {
	ID     string `json:"id,omitempty"`
	Name   string `json:"name,omitempty"`
	Type   string `json:"type"` // roundrobin | chash | ewma
	Nodes  map[string]int `json:"nodes"` // "host:port": weight
	Scheme string `json:"scheme"` // http | https | grpc | grpcs
	Checks *HealthCheck `json:"checks,omitempty"`
}

// HealthCheck configures upstream health checking.
type HealthCheck struct {
	Active *ActiveCheck `json:"active,omitempty"`
}

// ActiveCheck configures active health checking.
type ActiveCheck struct {
	Type     string `json:"type"` // http | https | tcp
	Timeout  int    `json:"timeout"`
	Concurrency int `json:"concurrency"`
	HTTPPath string `json:"http_path"`
	Healthy  HealthThreshold `json:"healthy"`
	Unhealthy HealthThreshold `json:"unhealthy"`
}

// HealthThreshold defines health check thresholds.
type HealthThreshold struct {
	Interval  int   `json:"interval"`
	Successes int   `json:"successes,omitempty"`
	Failures  int   `json:"http_failures,omitempty"`
	HTTPStatuses []int `json:"http_statuses,omitempty"`
}

// Consumer represents an APISIX consumer (per-merchant API key).
type Consumer struct {
	Username string                 `json:"username"`
	Plugins  map[string]interface{} `json:"plugins,omitempty"`
	Desc     string                 `json:"desc,omitempty"`
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is an APISIX Admin API client.
type Client struct {
	adminURL   string
	apiKey     string
	httpClient *http.Client
	enabled    bool
}

var globalClient *Client

// Init initialises the global APISIX client.
func Init() {
	adminURL := os.Getenv("APISIX_ADMIN_URL")
	if adminURL == "" {
		adminURL = "http://apisix:9180"
	}
	// VULN-034 fix: prefer APISIX_API_KEY, fall back to APISIX_ADMIN_KEY, then warn
	apiKey := os.Getenv("APISIX_API_KEY")
	if apiKey == "" {
		apiKey = os.Getenv("APISIX_ADMIN_KEY")
	}
	if apiKey == "" {
		slog.Warn("[apisix] APISIX_API_KEY / APISIX_ADMIN_KEY not set — using insecure default key; set APISIX_API_KEY in production")
		apiKey = "apisix-admin-key-default"
	}

	client := &http.Client{Timeout: 10 * time.Second}

	// Probe the APISIX admin API
	req, _ := http.NewRequest(http.MethodGet, adminURL+"/apisix/admin/routes", nil)
	req.Header.Set("X-API-KEY", apiKey)
	resp, err := client.Do(req)
	enabled := err == nil && resp != nil && resp.StatusCode < 500
	if resp != nil {
		resp.Body.Close()
	}

	if !enabled {
		slog.Info("[apisix] admin API not reachable — APISIX integration disabled (dev mode)",
			"url", adminURL)
	} else {
		slog.Info("[apisix] admin API connected", "url", adminURL)
	}

	globalClient = &Client{
		adminURL:   adminURL,
		apiKey:     apiKey,
		httpClient: client,
		enabled:    enabled,
	}
}

// Get returns the global APISIX client.
func Get() *Client {
	if globalClient == nil {
		Init()
	}
	return globalClient
}

// ─── Internal helpers ─────────────────────────────────────────────────────────

func (c *Client) do(ctx context.Context, method, path string, body interface{}) ([]byte, int, error) {
	var bodyReader io.Reader
	if body != nil {
		b, err := json.Marshal(body)
		if err != nil {
			return nil, 0, fmt.Errorf("apisix: marshal body: %w", err)
		}
		bodyReader = bytes.NewReader(b)
	}

	req, err := http.NewRequestWithContext(ctx, method, c.adminURL+path, bodyReader)
	if err != nil {
		return nil, 0, fmt.Errorf("apisix: build request: %w", err)
	}
	req.Header.Set("X-API-KEY", c.apiKey)
	if body != nil {
		req.Header.Set("Content-Type", "application/json")
	}

	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, 0, fmt.Errorf("apisix: %s %s: %w", method, path, err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	return respBody, resp.StatusCode, nil
}

// ─── Route management ─────────────────────────────────────────────────────────

// UpsertRoute creates or updates an APISIX route.
func (c *Client) UpsertRoute(ctx context.Context, route Route) error {
	if !c.enabled {
		slog.Info("[apisix] UpsertRoute (stub)", "id", route.ID, "uri", route.URI)
		return nil
	}

	path := fmt.Sprintf("/apisix/admin/routes/%s", route.ID)
	body, status, err := c.do(ctx, http.MethodPut, path, route)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("apisix: upsert route %d: %s", status, body)
	}
	slog.Info("[apisix] route upserted", "id", route.ID, "uri", route.URI)
	return nil
}

// DeleteRoute removes an APISIX route by ID.
func (c *Client) DeleteRoute(ctx context.Context, routeID string) error {
	if !c.enabled {
		slog.Info("[apisix] DeleteRoute (stub)", "id", routeID)
		return nil
	}

	path := fmt.Sprintf("/apisix/admin/routes/%s", routeID)
	body, status, err := c.do(ctx, http.MethodDelete, path, nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("apisix: delete route %d: %s", status, body)
	}
	slog.Info("[apisix] route deleted", "id", routeID)
	return nil
}

// ListRoutes returns all registered APISIX routes.
func (c *Client) ListRoutes(ctx context.Context) ([]Route, error) {
	if !c.enabled {
		return []Route{}, nil
	}

	body, status, err := c.do(ctx, http.MethodGet, "/apisix/admin/routes", nil)
	if err != nil {
		return nil, err
	}
	if status >= 400 {
		return nil, fmt.Errorf("apisix: list routes %d: %s", status, body)
	}

	var result struct {
		List []struct {
			Value Route `json:"value"`
		} `json:"list"`
	}
	if err := json.Unmarshal(body, &result); err != nil {
		return nil, fmt.Errorf("apisix: decode routes: %w", err)
	}

	routes := make([]Route, 0, len(result.List))
	for _, item := range result.List {
		routes = append(routes, item.Value)
	}
	return routes, nil
}

// ─── Upstream management ──────────────────────────────────────────────────────

// UpsertUpstream creates or updates an APISIX upstream.
func (c *Client) UpsertUpstream(ctx context.Context, upstream Upstream) error {
	if !c.enabled {
		slog.Info("[apisix] UpsertUpstream (stub)", "id", upstream.ID, "name", upstream.Name)
		return nil
	}

	path := fmt.Sprintf("/apisix/admin/upstreams/%s", upstream.ID)
	body, status, err := c.do(ctx, http.MethodPut, path, upstream)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("apisix: upsert upstream %d: %s", status, body)
	}
	slog.Info("[apisix] upstream upserted", "id", upstream.ID)
	return nil
}

// ─── Consumer management ──────────────────────────────────────────────────────

// UpsertConsumer creates or updates an APISIX consumer (per-merchant API key).
func (c *Client) UpsertConsumer(ctx context.Context, consumer Consumer) error {
	if !c.enabled {
		slog.Info("[apisix] UpsertConsumer (stub)", "username", consumer.Username)
		return nil
	}

	body, status, err := c.do(ctx, http.MethodPut,
		fmt.Sprintf("/apisix/admin/consumers/%s", consumer.Username), consumer)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("apisix: upsert consumer %d: %s", status, body)
	}
	slog.Info("[apisix] consumer upserted", "username", consumer.Username)
	return nil
}

// DeleteConsumer removes an APISIX consumer.
func (c *Client) DeleteConsumer(ctx context.Context, username string) error {
	if !c.enabled {
		slog.Info("[apisix] DeleteConsumer (stub)", "username", username)
		return nil
	}

	body, status, err := c.do(ctx, http.MethodDelete,
		fmt.Sprintf("/apisix/admin/consumers/%s", username), nil)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("apisix: delete consumer %d: %s", status, body)
	}
	return nil
}

// ─── PayGate route registration ───────────────────────────────────────────────

// RegisterPayGateRoutes registers all PayGate API routes in APISIX.
// This replaces the RegisterAPISIXRoutes function in embedded_finance.go.
func RegisterPayGateRoutes(ctx context.Context) error {
	client := Get()
	if !client.enabled {
		slog.Info("[apisix] skipping route registration — APISIX not available")
		return nil
	}

	routes := []Route{
		{
			ID: "paygate-trpc-api", Name: "PayGate tRPC API",
			URI: "/api/trpc/*", Methods: []string{"GET", "POST"},
			Plugins: map[string]interface{}{
				"jwt-auth": map[string]interface{}{},
				"cors":     map[string]interface{}{"allow_origins": "*"},
				"limit-req": map[string]interface{}{
					"rate": 100, "burst": 200, "key": "consumer_name",
				},
			},
			UpstreamID: "paygate-portal",
			Status: 1,
		},
		{
			ID: "paygate-bridge-api", Name: "PayGate Bridge API",
			URI: "/v1/*", Methods: []string{"GET", "POST", "PUT", "DELETE"},
			Plugins: map[string]interface{}{
				"key-auth": map[string]interface{}{},
				"limit-req": map[string]interface{}{
					"rate": 50, "burst": 100, "key": "consumer_name",
				},
			},
			UpstreamID: "paygate-bridge",
			Status: 1,
		},
		{
			ID: "paygate-webhooks", Name: "PayGate Webhooks",
			URI: "/webhooks/*", Methods: []string{"POST"},
			Plugins: map[string]interface{}{
				"hmac-auth": map[string]interface{}{},
			},
			UpstreamID: "paygate-portal",
			Status: 1,
		},
		{
			ID: "paygate-sse-stream", Name: "PayGate SSE Stream",
			URI: "/v1/stream/events", Methods: []string{"GET"},
			Plugins: map[string]interface{}{
				"key-auth": map[string]interface{}{},
			},
			UpstreamID: "paygate-bridge",
			Status: 1,
		},
	}

	for _, route := range routes {
		if err := client.UpsertRoute(ctx, route); err != nil {
			slog.Warn("[apisix] route registration failed", "id", route.ID, "err", err)
		}
	}

	slog.Info("[apisix] PayGate routes registered", "count", len(routes))
	return nil
}
