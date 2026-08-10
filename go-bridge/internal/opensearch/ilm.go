// Package opensearch — Index Lifecycle Management, mappings, aliases, and bulk retry.
//
// This file adds:
//   - ILM policy creation and management
//   - Index template with explicit field mappings
//   - Alias management (write alias + read alias)
//   - Bulk indexing with exponential backoff retry
//   - Cross-cluster search helpers
package opensearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"time"
)

// ─── ILM Policy ───────────────────────────────────────────────────────────────

// ILMPolicy defines a lifecycle policy for an OpenSearch index.
type ILMPolicy struct {
	Policy struct {
		Description string                 `json:"description"`
		Phases      map[string]ILMPhase    `json:"phases"`
	} `json:"policy"`
}

// ILMPhase is a single phase in an ILM policy.
type ILMPhase struct {
	MinAge  string                 `json:"min_age,omitempty"`
	Actions map[string]interface{} `json:"actions"`
}

// EnsureAuditILMPolicy creates or updates the audit log ILM policy.
// Audit logs are kept hot for 7 days, warm for 30 days, then deleted after 90 days.
func (c *Client) EnsureAuditILMPolicy(ctx context.Context) error {
	policy := map[string]interface{}{
		"policy": map[string]interface{}{
			"description": "PayGate audit log lifecycle",
			"phases": map[string]interface{}{
				"hot": map[string]interface{}{
					"actions": map[string]interface{}{
						"rollover": map[string]interface{}{
							"max_age":  "7d",
							"max_size": "10gb",
						},
					},
				},
				"warm": map[string]interface{}{
					"min_age": "7d",
					"actions": map[string]interface{}{
						"forcemerge": map[string]interface{}{"max_num_segments": 1},
						"shrink":     map[string]interface{}{"number_of_shards": 1},
					},
				},
				"delete": map[string]interface{}{
					"min_age": "90d",
					"actions": map[string]interface{}{"delete": map[string]interface{}{}},
				},
			},
		},
	}
	return c.putJSON(ctx, "/_plugins/_ism/policies/paygate-audit-ilm", policy)
}

// EnsureTransactionILMPolicy creates the transaction event ILM policy.
func (c *Client) EnsureTransactionILMPolicy(ctx context.Context) error {
	policy := map[string]interface{}{
		"policy": map[string]interface{}{
			"description": "PayGate transaction event lifecycle",
			"phases": map[string]interface{}{
				"hot": map[string]interface{}{
					"actions": map[string]interface{}{
						"rollover": map[string]interface{}{
							"max_age":  "1d",
							"max_size": "50gb",
						},
					},
				},
				"warm": map[string]interface{}{
					"min_age": "3d",
					"actions": map[string]interface{}{
						"forcemerge": map[string]interface{}{"max_num_segments": 1},
					},
				},
				"cold": map[string]interface{}{
					"min_age": "30d",
					"actions": map[string]interface{}{"freeze": map[string]interface{}{}},
				},
				"delete": map[string]interface{}{
					"min_age": "365d",
					"actions": map[string]interface{}{"delete": map[string]interface{}{}},
				},
			},
		},
	}
	return c.putJSON(ctx, "/_plugins/_ism/policies/paygate-transactions-ilm", policy)
}

// ─── Index Templates ──────────────────────────────────────────────────────────

// EnsureAuditIndexTemplate creates the index template for audit logs with
// explicit field mappings to prevent dynamic mapping issues.
func (c *Client) EnsureAuditIndexTemplate(ctx context.Context) error {
	template := map[string]interface{}{
		"index_patterns": []string{"paygate-audit-*"},
		"template": map[string]interface{}{
			"settings": map[string]interface{}{
				"number_of_shards":   3,
				"number_of_replicas": 1,
				"plugins.index_state_management.policy_id": "paygate-audit-ilm",
			},
			"mappings": map[string]interface{}{
				"dynamic": "strict",
				"properties": map[string]interface{}{
					"@timestamp":    map[string]interface{}{"type": "date"},
					"actor_id":      map[string]interface{}{"type": "keyword"},
					"actor_role":    map[string]interface{}{"type": "keyword"},
					"action":        map[string]interface{}{"type": "keyword"},
					"resource":      map[string]interface{}{"type": "keyword"},
					"resource_id":   map[string]interface{}{"type": "keyword"},
					"outcome":       map[string]interface{}{"type": "keyword"},
					"ip_address":    map[string]interface{}{"type": "ip"},
					"session_id":    map[string]interface{}{"type": "keyword"},
					"merchant_id":   map[string]interface{}{"type": "keyword"},
					"risk_score":    map[string]interface{}{"type": "float"},
					"risk_tier":     map[string]interface{}{"type": "keyword"},
					"amount_kobo":   map[string]interface{}{"type": "long"},
					"currency":      map[string]interface{}{"type": "keyword"},
					"device_id":     map[string]interface{}{"type": "keyword"},
					"geo_country":   map[string]interface{}{"type": "keyword"},
					"message":       map[string]interface{}{"type": "text", "analyzer": "standard"},
					"metadata":      map[string]interface{}{"type": "object", "dynamic": true},
				},
			},
			"aliases": map[string]interface{}{
				"paygate-audit":       map[string]interface{}{},
				"paygate-audit-write": map[string]interface{}{"is_write_index": true},
			},
		},
		"priority": 100,
	}
	return c.putJSON(ctx, "/_index_template/paygate-audit-template", template)
}

// EnsureTransactionIndexTemplate creates the index template for transaction events.
func (c *Client) EnsureTransactionIndexTemplate(ctx context.Context) error {
	template := map[string]interface{}{
		"index_patterns": []string{"paygate-transactions-*"},
		"template": map[string]interface{}{
			"settings": map[string]interface{}{
				"number_of_shards":   5,
				"number_of_replicas": 1,
				"plugins.index_state_management.policy_id": "paygate-transactions-ilm",
			},
			"mappings": map[string]interface{}{
				"dynamic": "strict",
				"properties": map[string]interface{}{
					"@timestamp":       map[string]interface{}{"type": "date"},
					"transaction_id":   map[string]interface{}{"type": "keyword"},
					"merchant_id":      map[string]interface{}{"type": "keyword"},
					"customer_id":      map[string]interface{}{"type": "keyword"},
					"amount_kobo":      map[string]interface{}{"type": "long"},
					"currency":         map[string]interface{}{"type": "keyword"},
					"status":           map[string]interface{}{"type": "keyword"},
					"payment_method":   map[string]interface{}{"type": "keyword"},
					"channel":          map[string]interface{}{"type": "keyword"},
					"risk_score":       map[string]interface{}{"type": "float"},
					"fraud_flags":      map[string]interface{}{"type": "keyword"},
					"processor":        map[string]interface{}{"type": "keyword"},
					"reference":        map[string]interface{}{"type": "keyword"},
					"narration":        map[string]interface{}{"type": "text"},
					"geo_country":      map[string]interface{}{"type": "keyword"},
					"device_id":        map[string]interface{}{"type": "keyword"},
					"ip_address":       map[string]interface{}{"type": "ip"},
					"settled_at":       map[string]interface{}{"type": "date"},
					"metadata":         map[string]interface{}{"type": "object", "dynamic": true},
				},
			},
			"aliases": map[string]interface{}{
				"paygate-transactions":       map[string]interface{}{},
				"paygate-transactions-write": map[string]interface{}{"is_write_index": true},
			},
		},
		"priority": 100,
	}
	return c.putJSON(ctx, "/_index_template/paygate-transactions-template", template)
}

// ─── Bootstrap ────────────────────────────────────────────────────────────────

// Bootstrap ensures all ILM policies, templates, and initial indices exist.
// Call this once at service startup.
func (c *Client) Bootstrap(ctx context.Context) error {
	if c.baseURL == "" {
		slog.Info("[opensearch] disabled — skipping bootstrap")
		return nil
	}
	steps := []struct {
		name string
		fn   func(context.Context) error
	}{
		{"audit ILM policy", c.EnsureAuditILMPolicy},
		{"transaction ILM policy", c.EnsureTransactionILMPolicy},
		{"audit index template", c.EnsureAuditIndexTemplate},
		{"transaction index template", c.EnsureTransactionIndexTemplate},
		{"initial audit index", func(ctx context.Context) error {
			return c.ensureInitialIndex(ctx, "paygate-audit-000001", "paygate-audit-write")
		}},
		{"initial transaction index", func(ctx context.Context) error {
			return c.ensureInitialIndex(ctx, "paygate-transactions-000001", "paygate-transactions-write")
		}},
	}
	for _, step := range steps {
		if err := step.fn(ctx); err != nil {
			slog.Warn("[opensearch] bootstrap step failed", "step", step.name, "err", err)
			// Non-fatal — log and continue.
		} else {
			slog.Info("[opensearch] bootstrap step ok", "step", step.name)
		}
	}
	return nil
}

func (c *Client) ensureInitialIndex(ctx context.Context, indexName, writeAlias string) error {
	// Check if index already exists.
	_, status, err := c.request(ctx, "HEAD", "/"+indexName, nil)
	if err != nil {
		return err
	}
	if status == 200 {
		return nil // already exists
	}
	// Create the initial index.
	body := map[string]interface{}{
		"aliases": map[string]interface{}{
			writeAlias: map[string]interface{}{"is_write_index": true},
		},
	}
	return c.putJSON(ctx, "/"+indexName, body)
}

// ─── Bulk Indexing with Retry ─────────────────────────────────────────────────

// BulkDoc is a single document for bulk indexing.
type BulkDoc struct {
	Index string
	ID    string
	Doc   interface{}
}

// BulkIndex indexes multiple documents with exponential backoff retry.
// Failed documents are returned for dead-letter processing.
func (c *Client) BulkIndex(ctx context.Context, docs []BulkDoc) (failed []BulkDoc, err error) {
	if c.baseURL == "" || len(docs) == 0 {
		return nil, nil
	}
	const maxAttempts = 3
	remaining := docs
	for attempt := 1; attempt <= maxAttempts; attempt++ {
		failed, err = c.bulkOnce(ctx, remaining)
		if err != nil {
			slog.Warn("[opensearch] bulk attempt failed", "attempt", attempt, "err", err)
			if attempt < maxAttempts {
				time.Sleep(time.Duration(attempt*attempt) * 500 * time.Millisecond)
			}
			continue
		}
		if len(failed) == 0 {
			return nil, nil
		}
		slog.Warn("[opensearch] bulk partial failure", "attempt", attempt,
			"total", len(docs), "failed", len(failed))
		remaining = failed
		if attempt < maxAttempts {
			time.Sleep(time.Duration(attempt) * time.Second)
		}
	}
	return failed, err
}

func (c *Client) bulkOnce(ctx context.Context, docs []BulkDoc) ([]BulkDoc, error) {
	var buf bytes.Buffer
	for _, doc := range docs {
		meta := map[string]interface{}{
			"index": map[string]interface{}{
				"_index": doc.Index,
			},
		}
		if doc.ID != "" {
			meta["index"].(map[string]interface{})["_id"] = doc.ID
		}
		metaLine, _ := json.Marshal(meta)
		docLine, _ := json.Marshal(doc.Doc)
		buf.Write(metaLine)
		buf.WriteByte('\n')
		buf.Write(docLine)
		buf.WriteByte('\n')
	}

	respBody, status, err := c.request(ctx, "POST", "/_bulk", buf.Bytes())
	if err != nil {
		return docs, err
	}
	if status >= 500 {
		return docs, fmt.Errorf("opensearch: bulk: HTTP %d", status)
	}

	var result struct {
		Errors bool `json:"errors"`
		Items  []map[string]struct {
			ID     string `json:"_id"`
			Status int    `json:"status"`
			Error  *struct {
				Type   string `json:"type"`
				Reason string `json:"reason"`
			} `json:"error,omitempty"`
		} `json:"items"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil {
		return nil, fmt.Errorf("opensearch: bulk decode: %w", err)
	}
	if !result.Errors {
		return nil, nil
	}

	// Collect failed docs for retry.
	var failed []BulkDoc
	for i, item := range result.Items {
		for _, op := range item {
			if op.Error != nil && i < len(docs) {
				slog.Warn("[opensearch] bulk doc failed",
					"id", op.ID, "type", op.Error.Type, "reason", op.Error.Reason)
				failed = append(failed, docs[i])
			}
		}
	}
	return failed, nil
}

// ─── Alias Management ─────────────────────────────────────────────────────────

// RolloverAlias triggers a rollover on a write alias.
func (c *Client) RolloverAlias(ctx context.Context, alias string, maxAge, maxSize string) error {
	body := map[string]interface{}{
		"conditions": map[string]interface{}{
			"max_age":  maxAge,
			"max_size": maxSize,
		},
	}
	data, _ := json.Marshal(body)
	_, status, err := c.request(ctx, "POST", "/"+alias+"/_rollover", data)
	if err != nil {
		return err
	}
	if status >= 400 {
		return fmt.Errorf("opensearch: rollover %s: HTTP %d", alias, status)
	}
	slog.Info("[opensearch] alias rolled over", "alias", alias)
	return nil
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

func (c *Client) putJSON(ctx context.Context, path string, body interface{}) error {
	data, err := json.Marshal(body)
	if err != nil {
		return fmt.Errorf("opensearch: marshal %s: %w", path, err)
	}
	_, status, err := c.request(ctx, "PUT", path, data)
	if err != nil {
		return err
	}
	if status >= 400 && status != 409 { // 409 = already exists, OK
		return fmt.Errorf("opensearch: PUT %s: HTTP %d", path, status)
	}
	return nil
}
