// Package permify provides a lightweight Permify authorization client
// for the PayGate bridge service.
//
// It exposes a CheckPermission helper that calls the Permify REST API.
// If PERMIFY_URL is not set, all permission checks return true (dev mode).
package permify

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

// ─── Client ───────────────────────────────────────────────────────────────────

// Client wraps the Permify REST API.
type Client struct {
	baseURL    string
	apiKey     string
	tenantID   string
	httpClient *http.Client
	enabled    bool
}

var globalClient *Client

// Init initialises the global Permify client.
// Reads PERMIFY_URL, PERMIFY_API_KEY, PERMIFY_TENANT_ID from environment.
func Init() {
	url := os.Getenv("PERMIFY_URL")
	if url == "" {
		slog.Info("[permify] PERMIFY_URL not set — authorization checks disabled (dev mode)")
		globalClient = &Client{enabled: false}
		return
	}
	globalClient = &Client{
		baseURL:  url,
		apiKey:   os.Getenv("PERMIFY_API_KEY"),
		tenantID: getEnvOr("PERMIFY_TENANT_ID", "t1"),
		httpClient: &http.Client{
			Timeout: 5 * time.Second,
		},
		enabled: true,
	}
	slog.Info("[permify] client initialised", "url", url)
}

// Get returns the global Permify client. Panics if Init has not been called.
func Get() *Client {
	if globalClient == nil {
		panic("permify: client not initialised — call Init() first")
	}
	return globalClient
}

// ─── Permission check ─────────────────────────────────────────────────────────

// CheckRequest is the input to CheckPermission.
type CheckRequest struct {
	// Entity is the resource being accessed (e.g. "merchant:merchant_123").
	Entity string
	// Permission is the action being performed (e.g. "approve_payout").
	Permission string
	// Subject is the actor (e.g. "user:user_456").
	Subject string
}

// CheckPermission returns true if the subject has the given permission on the entity.
// Returns true in dev mode (PERMIFY_URL not set).
func (c *Client) CheckPermission(ctx context.Context, req CheckRequest) (bool, error) {
	if !c.enabled {
		return true, nil
	}

	entityParts := splitEntityRef(req.Entity)
	subjectParts := splitEntityRef(req.Subject)

	body := map[string]any{
		"metadata": map[string]any{
			"schema_version":  "",
			"snap_token":      "",
			"depth":           20,
		},
		"entity": map[string]any{
			"type": entityParts[0],
			"id":   entityParts[1],
		},
		"permission": req.Permission,
		"subject": map[string]any{
			"type": subjectParts[0],
			"id":   subjectParts[1],
		},
	}

	payload, err := json.Marshal(body)
	if err != nil {
		return false, fmt.Errorf("permify.CheckPermission: marshal: %w", err)
	}

	url := fmt.Sprintf("%s/v1/tenants/%s/permissions/check", c.baseURL, c.tenantID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(payload))
	if err != nil {
		return false, fmt.Errorf("permify.CheckPermission: new request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		slog.Error("[permify] check failed", "err", err)
		// Fail open on network error to avoid blocking payments
		return true, nil
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		body, _ := io.ReadAll(resp.Body)
		return false, fmt.Errorf("permify.CheckPermission: HTTP %d: %s", resp.StatusCode, body)
	}

	var result struct {
		Can string `json:"can"` // "RESULT_ALLOWED" | "RESULT_DENIED"
	}
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return false, fmt.Errorf("permify.CheckPermission: decode: %w", err)
	}

	allowed := result.Can == "RESULT_ALLOWED"
	slog.Info("[permify] check",
		"entity", req.Entity,
		"permission", req.Permission,
		"subject", req.Subject,
		"allowed", allowed,
	)
	return allowed, nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

// splitEntityRef splits "type:id" into ["type", "id"].
// Returns ["user", ref] if no colon is found.
func splitEntityRef(ref string) [2]string {
	for i, c := range ref {
		if c == ':' {
			return [2]string{ref[:i], ref[i+1:]}
		}
	}
	return [2]string{"user", ref}
}

func getEnvOr(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
