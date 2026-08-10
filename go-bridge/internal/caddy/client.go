// Package caddy provides a client for the Caddy Admin API.
// It enables dynamic route management, certificate status checks,
// and zero-downtime configuration reloads from the Go bridge service.
package caddy

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"
)

// Client is a Caddy Admin API client.
type Client struct {
	baseURL    string
	httpClient *http.Client
}

// NewClient creates a new Caddy Admin API client.
func NewClient(baseURL string) *Client {
	return &Client{
		baseURL: baseURL,
		httpClient: &http.Client{
			Timeout: 10 * time.Second,
		},
	}
}

// Config represents a partial Caddy JSON config.
type Config struct {
	Apps map[string]json.RawMessage `json:"apps,omitempty"`
}

// CertInfo represents TLS certificate information from Caddy.
type CertInfo struct {
	Subject    string    `json:"subject"`
	Issuer     string    `json:"issuer"`
	NotBefore  time.Time `json:"not_before"`
	NotAfter   time.Time `json:"not_after"`
	Managed    bool      `json:"managed"`
	Expiring   bool      `json:"-"` // computed: < 30 days remaining
}

// UpstreamStatus represents the health of a reverse proxy upstream.
type UpstreamStatus struct {
	Address string `json:"address"`
	Healthy bool   `json:"healthy"`
	NumReqs int    `json:"num_requests"`
}

// GetConfig fetches the current Caddy configuration.
func (c *Client) GetConfig(ctx context.Context) (*Config, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/config/", nil)
	if err != nil {
		return nil, fmt.Errorf("caddy: build request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("caddy: get config: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("caddy: get config: status %d", resp.StatusCode)
	}
	var cfg Config
	if err := json.NewDecoder(resp.Body).Decode(&cfg); err != nil {
		return nil, fmt.Errorf("caddy: decode config: %w", err)
	}
	return &cfg, nil
}

// ReloadConfig performs a zero-downtime configuration reload.
// It accepts a Caddyfile string and reloads via the Admin API.
func (c *Client) ReloadConfig(ctx context.Context, caddyfile string) error {
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.baseURL+"/load",
		bytes.NewBufferString(caddyfile))
	if err != nil {
		return fmt.Errorf("caddy: build reload request: %w", err)
	}
	req.Header.Set("Content-Type", "text/caddyfile")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("caddy: reload: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("caddy: reload failed (status %d): %s", resp.StatusCode, string(body))
	}
	return nil
}

// ListCertificates returns all managed TLS certificates and their expiry status.
func (c *Client) ListCertificates(ctx context.Context) ([]CertInfo, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/pki/ca/local/certificates", nil)
	if err != nil {
		return nil, fmt.Errorf("caddy: build cert request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("caddy: list certs: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNotFound {
		// No local CA — return empty (using ACME certs)
		return nil, nil
	}
	var certs []CertInfo
	if err := json.NewDecoder(resp.Body).Decode(&certs); err != nil {
		return nil, fmt.Errorf("caddy: decode certs: %w", err)
	}
	now := time.Now()
	for i := range certs {
		certs[i].Expiring = certs[i].NotAfter.Before(now.Add(30 * 24 * time.Hour))
	}
	return certs, nil
}

// GetUpstreamStatus returns the health status of all reverse proxy upstreams.
func (c *Client) GetUpstreamStatus(ctx context.Context) ([]UpstreamStatus, error) {
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, c.baseURL+"/reverse_proxy/upstreams", nil)
	if err != nil {
		return nil, fmt.Errorf("caddy: build upstream request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("caddy: get upstreams: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return nil, fmt.Errorf("caddy: get upstreams: status %d", resp.StatusCode)
	}
	var upstreams []UpstreamStatus
	if err := json.NewDecoder(resp.Body).Decode(&upstreams); err != nil {
		return nil, fmt.Errorf("caddy: decode upstreams: %w", err)
	}
	return upstreams, nil
}

// AddRoute dynamically adds a reverse proxy route via the Caddy JSON API.
// This enables runtime route registration without a full config reload.
func (c *Client) AddRoute(ctx context.Context, hostPattern, upstream string) error {
	route := map[string]interface{}{
		"match": []map[string]interface{}{
			{"host": []string{hostPattern}},
		},
		"handle": []map[string]interface{}{
			{
				"handler": "reverse_proxy",
				"upstreams": []map[string]string{
					{"dial": upstream},
				},
			},
		},
	}
	body, err := json.Marshal(route)
	if err != nil {
		return fmt.Errorf("caddy: marshal route: %w", err)
	}
	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		c.baseURL+"/config/apps/http/servers/paygate/routes/",
		bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("caddy: build add route request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("caddy: add route: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		body, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("caddy: add route failed (status %d): %s", resp.StatusCode, string(body))
	}
	return nil
}
