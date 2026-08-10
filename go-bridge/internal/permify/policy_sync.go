// policy_sync.go — Permify schema sync and relationship management (Wave 131)
//
// Adds WriteSchema, WriteRelationship, DeleteRelationship, and ListRelationships
// to the Permify client.  These are used by:
//   - /v1/permify/schema/write  (admin: push updated RBAC schema)
//   - /v1/permify/relationships (CRUD for entity relationships)
//   - Temporal KYB workflow (grant merchant:owner on approval)

package permify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
)

// ─── Schema ───────────────────────────────────────────────────────────────────

// WriteSchemaRequest is the body sent to POST /v1/tenants/{tenant}/schemas/write.
type WriteSchemaRequest struct {
	Schema string `json:"schema"`
}

// WriteSchemaResponse is the response from the Permify schema write endpoint.
type WriteSchemaResponse struct {
	SchemaVersion string `json:"schema_version"`
}

// WriteSchema pushes a new RBAC schema version to Permify.
// The schema string is Permify's DSL (entity + relation + action blocks).
func (c *Client) WriteSchema(ctx context.Context, schema string) (string, error) {
	if c == nil {
		return "", fmt.Errorf("permify client not initialised")
	}
	body, _ := json.Marshal(WriteSchemaRequest{Schema: schema})
	url := fmt.Sprintf("%s/v1/tenants/%s/schemas/write", c.baseURL, c.tenantID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return "", fmt.Errorf("permify WriteSchema: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("permify WriteSchema: http: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return "", fmt.Errorf("permify WriteSchema: status %d: %s", resp.StatusCode, string(raw))
	}
	var out WriteSchemaResponse
	if err := json.Unmarshal(raw, &out); err != nil {
		return "", fmt.Errorf("permify WriteSchema: decode: %w", err)
	}
	slog.Info("[permify] schema written", "version", out.SchemaVersion)
	return out.SchemaVersion, nil
}

// ─── Relationships ────────────────────────────────────────────────────────────

// Tuple represents a Permify relationship tuple.
type Tuple struct {
	Entity   EntityRef   `json:"entity"`
	Relation string      `json:"relation"`
	Subject  SubjectRef  `json:"subject"`
}

// EntityRef identifies a Permify entity (type + id).
type EntityRef struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

// SubjectRef identifies a subject (entity type + id, optional relation).
type SubjectRef struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Relation string `json:"relation,omitempty"`
}

type writeRelationshipBody struct {
	Metadata  map[string]string `json:"metadata,omitempty"`
	Tuples    []Tuple           `json:"tuples"`
}

// WriteRelationship creates one or more relationship tuples in Permify.
func (c *Client) WriteRelationship(ctx context.Context, tuples []Tuple) error {
	if c == nil {
		return fmt.Errorf("permify client not initialised")
	}
	body, _ := json.Marshal(writeRelationshipBody{Tuples: tuples})
	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/write", c.baseURL, c.tenantID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("permify WriteRelationship: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("permify WriteRelationship: http: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("permify WriteRelationship: status %d: %s", resp.StatusCode, string(raw))
	}
	slog.Info("[permify] relationships written", "count", len(tuples))
	return nil
}

// DeleteRelationship removes a relationship tuple from Permify.
func (c *Client) DeleteRelationship(ctx context.Context, tuple Tuple) error {
	if c == nil {
		return fmt.Errorf("permify client not initialised")
	}
	body, _ := json.Marshal(struct {
		Tuples []Tuple `json:"tuples"`
	}{Tuples: []Tuple{tuple}})
	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/delete", c.baseURL, c.tenantID)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("permify DeleteRelationship: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("permify DeleteRelationship: http: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 300 {
		raw, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("permify DeleteRelationship: status %d: %s", resp.StatusCode, string(raw))
	}
	return nil
}

// ListRelationshipsFilter filters the ListRelationships query.
type ListRelationshipsFilter struct {
	EntityType string // e.g. "merchant"
	EntityID   string // optional; if empty, lists all of EntityType
	Relation   string // optional; if empty, lists all relations
}

// ListRelationships reads relationship tuples matching the given filter.
func (c *Client) ListRelationships(ctx context.Context, f ListRelationshipsFilter) ([]Tuple, error) {
	if c == nil {
		return nil, fmt.Errorf("permify client not initialised")
	}
	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/read", c.baseURL, c.tenantID)
	filterBody := map[string]any{
		"filter": map[string]any{
			"entity": map[string]any{
				"type": f.EntityType,
				"ids":  []string{f.EntityID},
			},
			"relation": f.Relation,
		},
	}
	body, _ := json.Marshal(filterBody)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return nil, fmt.Errorf("permify ListRelationships: build request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		req.Header.Set("Authorization", "Bearer "+c.apiKey)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, fmt.Errorf("permify ListRelationships: http: %w", err)
	}
	defer resp.Body.Close()
	raw, _ := io.ReadAll(resp.Body)
	if resp.StatusCode >= 300 {
		return nil, fmt.Errorf("permify ListRelationships: status %d: %s", resp.StatusCode, string(raw))
	}
	var out struct {
		Tuples []Tuple `json:"tuples"`
	}
	if err := json.Unmarshal(raw, &out); err != nil {
		return nil, fmt.Errorf("permify ListRelationships: decode: %w", err)
	}
	return out.Tuples, nil
}
