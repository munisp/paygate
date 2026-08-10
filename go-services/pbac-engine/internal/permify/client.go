// Package permify provides a gRPC/HTTP client for the Permify authorization service.
// It implements the check, write-relationship, and schema-sync operations.
package permify

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"time"

	"go.uber.org/zap"
)

// Client is a Permify HTTP client.
type Client struct {
	baseURL    string
	apiKey     string
	tenantID   string
	httpClient *http.Client
	logger     *zap.Logger
}

// NewClient creates a new Permify HTTP client.
func NewClient(baseURL, apiKey, tenantID string, logger *zap.Logger) *Client {
	return &Client{
		baseURL:  baseURL,
		apiKey:   apiKey,
		tenantID: tenantID,
		httpClient: &http.Client{
			Timeout: 3 * time.Second,
		},
		logger: logger,
	}
}

// CheckRequest is the Permify permission check request body.
type CheckRequest struct {
	Metadata   CheckMetadata  `json:"metadata"`
	Entity     Entity         `json:"entity"`
	Permission string         `json:"permission"`
	Subject    Subject        `json:"subject"`
	Context    *CheckContext  `json:"context,omitempty"`
}

type CheckMetadata struct {
	SchemaVersion string `json:"schema_version"`
	SnapToken     string `json:"snap_token"`
	Depth         int    `json:"depth"`
}

type Entity struct {
	Type string `json:"type"`
	ID   string `json:"id"`
}

type Subject struct {
	Type     string `json:"type"`
	ID       string `json:"id"`
	Relation string `json:"relation,omitempty"`
}

type CheckContext struct {
	Tuples     []interface{} `json:"tuples,omitempty"`
	Attributes []Attribute   `json:"attributes,omitempty"`
}

type Attribute struct {
	Entity    Entity `json:"entity"`
	Attribute string `json:"attribute"`
	Value     Value  `json:"value"`
}

type Value struct {
	Type  string `json:"@type"`
	Value string `json:"value"`
}

// CheckResponse is the Permify permission check response.
type CheckResponse struct {
	Can      string        `json:"can"` // RESULT_ALLOWED | RESULT_DENIED | RESULT_UNKNOWN
	Metadata *CheckRespMeta `json:"metadata,omitempty"`
}

type CheckRespMeta struct {
	CheckCount    int    `json:"check_count"`
	SchemaVersion string `json:"schema_version"`
}

// Check calls Permify's /v1/tenants/{tenant}/permissions/check endpoint.
// Returns (allowed, error). If Permify is unreachable, returns (false, error)
// so the caller can fall back to the local policy matrix.
func (c *Client) Check(ctx context.Context, entityType, entityID, permission, subjectID string, attrs map[string]string) (bool, error) {
	req := CheckRequest{
		Metadata: CheckMetadata{
			SchemaVersion: "",
			SnapToken:     "",
			Depth:         20,
		},
		Entity:     Entity{Type: entityType, ID: entityID},
		Permission: permission,
		Subject:    Subject{Type: "user", ID: subjectID},
	}

	if len(attrs) > 0 {
		var attributes []Attribute
		for k, v := range attrs {
			attributes = append(attributes, Attribute{
				Entity:    Entity{Type: entityType, ID: entityID},
				Attribute: k,
				Value:     Value{Type: "type.googleapis.com/base.v1.StringValue", Value: v},
			})
		}
		req.Context = &CheckContext{Attributes: attributes}
	}

	body, err := json.Marshal(req)
	if err != nil {
		return false, fmt.Errorf("permify: marshal check request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/tenants/%s/permissions/check", c.baseURL, c.tenantID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return false, fmt.Errorf("permify: create request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		c.logger.Warn("Permify unreachable", zap.Error(err))
		return false, fmt.Errorf("permify: request failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		respBody, _ := io.ReadAll(resp.Body)
		c.logger.Warn("Permify non-OK response",
			zap.Int("status", resp.StatusCode),
			zap.String("body", string(respBody)),
		)
		return false, fmt.Errorf("permify: HTTP %d", resp.StatusCode)
	}

	var checkResp CheckResponse
	if err := json.NewDecoder(resp.Body).Decode(&checkResp); err != nil {
		return false, fmt.Errorf("permify: decode response: %w", err)
	}

	return checkResp.Can == "RESULT_ALLOWED", nil
}

// WriteRelationship writes a relationship tuple to Permify.
func (c *Client) WriteRelationship(ctx context.Context, entityType, entityID, relation, subjectType, subjectID string) error {
	payload := map[string]interface{}{
		"metadata": map[string]string{"schema_version": ""},
		"tuples": []map[string]interface{}{
			{
				"entity":   map[string]string{"type": entityType, "id": entityID},
				"relation": relation,
				"subject":  map[string]string{"type": subjectType, "id": subjectID},
			},
		},
	}

	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("permify: marshal write request: %w", err)
	}

	url := fmt.Sprintf("%s/v1/tenants/%s/relationships/write", c.baseURL, c.tenantID)
	httpReq, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("permify: create write request: %w", err)
	}
	httpReq.Header.Set("Content-Type", "application/json")
	if c.apiKey != "" {
		httpReq.Header.Set("Authorization", "Bearer "+c.apiKey)
	}

	resp, err := c.httpClient.Do(httpReq)
	if err != nil {
		return fmt.Errorf("permify: write relationship failed: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("permify: write relationship HTTP %d", resp.StatusCode)
	}
	return nil
}

// Ping checks if Permify is reachable.
func (c *Client) Ping(ctx context.Context) error {
	url := fmt.Sprintf("%s/healthz", c.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusOK {
		return fmt.Errorf("permify healthz: HTTP %d", resp.StatusCode)
	}
	return nil
}
