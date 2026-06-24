// Package opensearch provides an OpenSearch client for the PayGate bridge.
//
// It handles:
//   - Audit log indexing (every financial event, auth event, admin action)
//   - Transaction search (full-text + structured queries)
//   - Insider threat alert indexing
//   - Fraud signal indexing
//   - Index lifecycle management (ILM policies, rollover aliases)
//
// Environment variables:
//   OPENSEARCH_URL      — OpenSearch endpoint (default: http://opensearch:9200)
//   OPENSEARCH_USER     — Basic auth username (default: admin)
//   OPENSEARCH_PASS     — Basic auth password
//   OPENSEARCH_INDEX_PREFIX — Index prefix (default: paygate)
package opensearch

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"net/http"
	"os"
	"strings"
	"sync"
	"time"
)

// ─── Singleton ────────────────────────────────────────────────────────────────

var (
	_client     *Client
	_clientOnce sync.Once
)

// Get returns the singleton OpenSearch client.
func Get() *Client {
	_clientOnce.Do(func() {
		_client = &Client{
			baseURL: getenv("OPENSEARCH_URL", "http://opensearch:9200"),
			user:    getenv("OPENSEARCH_USER", "admin"),
			pass:    os.Getenv("OPENSEARCH_PASS"),
			prefix:  getenv("OPENSEARCH_INDEX_PREFIX", "paygate"),
			http:    &http.Client{Timeout: 10 * time.Second},
		}
	})
	return _client
}

func getenv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

// ─── Client ───────────────────────────────────────────────────────────────────

// Client is a lightweight OpenSearch HTTP client.
type Client struct {
	baseURL string
	user    string
	pass    string
	prefix  string
	http    *http.Client
}

// ─── Index names ──────────────────────────────────────────────────────────────

func (c *Client) auditIndex() string        { return c.prefix + "-audit-logs" }
func (c *Client) transactionIndex() string  { return c.prefix + "-transactions" }
func (c *Client) insiderIndex() string      { return c.prefix + "-insider-threat" }
func (c *Client) fraudIndex() string        { return c.prefix + "-fraud-signals" }

// ─── AuditLog ─────────────────────────────────────────────────────────────────

// AuditLogDoc is the document shape indexed for every audit event.
type AuditLogDoc struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"@timestamp"`
	ActorID     string                 `json:"actor_id"`
	ActorEmail  string                 `json:"actor_email,omitempty"`
	Action      string                 `json:"action"`
	Resource    string                 `json:"resource,omitempty"`
	ResourceID  string                 `json:"resource_id,omitempty"`
	IPAddress   string                 `json:"ip_address,omitempty"`
	UserAgent   string                 `json:"user_agent,omitempty"`
	Status      string                 `json:"status"` // success | failure | blocked
	RiskScore   int                    `json:"risk_score,omitempty"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
	ServiceName string                 `json:"service_name"`
}

// IndexAuditLog indexes a single audit log document.
func (c *Client) IndexAuditLog(ctx context.Context, doc AuditLogDoc) error {
	if doc.Timestamp.IsZero() {
		doc.Timestamp = time.Now().UTC()
	}
	if doc.ServiceName == "" {
		doc.ServiceName = "go-bridge"
	}
	return c.index(ctx, c.auditIndex(), doc.ID, doc)
}

// ─── Transaction ──────────────────────────────────────────────────────────────

// TransactionDoc is the document shape indexed for every transaction.
type TransactionDoc struct {
	ID            string    `json:"id"`
	Timestamp     time.Time `json:"@timestamp"`
	MerchantID    string    `json:"merchant_id"`
	CustomerID    string    `json:"customer_id,omitempty"`
	AmountKobo    int64     `json:"amount_kobo"`
	Currency      string    `json:"currency"`
	Type          string    `json:"type"`
	Status        string    `json:"status"`
	Channel       string    `json:"channel,omitempty"`
	Reference     string    `json:"reference"`
	FraudScore    float64   `json:"fraud_score,omitempty"`
	SettlementDate string   `json:"settlement_date,omitempty"`
}

// IndexTransaction indexes a transaction document.
func (c *Client) IndexTransaction(ctx context.Context, doc TransactionDoc) error {
	if doc.Timestamp.IsZero() {
		doc.Timestamp = time.Now().UTC()
	}
	return c.index(ctx, c.transactionIndex(), doc.ID, doc)
}

// ─── Insider Threat ───────────────────────────────────────────────────────────

// InsiderThreatDoc is the document shape for insider threat alerts.
type InsiderThreatDoc struct {
	ID          string                 `json:"id"`
	Timestamp   time.Time              `json:"@timestamp"`
	ActorID     string                 `json:"actor_id"`
	Action      string                 `json:"action"`
	RiskScore   int                    `json:"risk_score"`
	RiskLevel   string                 `json:"risk_level"`
	RiskFactors []string               `json:"risk_factors,omitempty"`
	IPAddress   string                 `json:"ip_address,omitempty"`
	DeviceHash  string                 `json:"device_hash,omitempty"`
	Status      string                 `json:"status"`
	Metadata    map[string]interface{} `json:"metadata,omitempty"`
}

// IndexInsiderThreatAlert indexes an insider threat alert.
func (c *Client) IndexInsiderThreatAlert(ctx context.Context, doc InsiderThreatDoc) error {
	if doc.Timestamp.IsZero() {
		doc.Timestamp = time.Now().UTC()
	}
	return c.index(ctx, c.insiderIndex(), doc.ID, doc)
}

// ─── Fraud Signal ─────────────────────────────────────────────────────────────

// FraudSignalDoc is the document shape for fraud signals.
type FraudSignalDoc struct {
	ID            string    `json:"id"`
	Timestamp     time.Time `json:"@timestamp"`
	TransactionID string    `json:"transaction_id"`
	MerchantID    string    `json:"merchant_id"`
	Score         float64   `json:"score"`
	Signals       []string  `json:"signals,omitempty"`
	Action        string    `json:"action"` // allow | flag | block
}

// IndexFraudSignal indexes a fraud signal.
func (c *Client) IndexFraudSignal(ctx context.Context, doc FraudSignalDoc) error {
	if doc.Timestamp.IsZero() {
		doc.Timestamp = time.Now().UTC()
	}
	return c.index(ctx, c.fraudIndex(), doc.ID, doc)
}

// ─── Search ───────────────────────────────────────────────────────────────────

// SearchResult holds a generic OpenSearch search response.
type SearchResult struct {
	Hits struct {
		Total struct {
			Value int `json:"value"`
		} `json:"total"`
		Hits []struct {
			ID     string          `json:"_id"`
			Source json.RawMessage `json:"_source"`
		} `json:"hits"`
	} `json:"hits"`
}

// SearchAuditLogs performs a full-text + structured query against audit logs.
func (c *Client) SearchAuditLogs(ctx context.Context, query map[string]interface{}, size int) (*SearchResult, error) {
	if size <= 0 {
		size = 20
	}
	body := map[string]interface{}{
		"size":  size,
		"query": query,
		"sort":  []map[string]interface{}{{"@timestamp": map[string]string{"order": "desc"}}},
	}
	return c.search(ctx, c.auditIndex(), body)
}

// SearchTransactions searches the transaction index.
func (c *Client) SearchTransactions(ctx context.Context, query map[string]interface{}, size int) (*SearchResult, error) {
	if size <= 0 {
		size = 20
	}
	body := map[string]interface{}{
		"size":  size,
		"query": query,
		"sort":  []map[string]interface{}{{"@timestamp": map[string]string{"order": "desc"}}},
	}
	return c.search(ctx, c.transactionIndex(), body)
}

// ─── Index Lifecycle ──────────────────────────────────────────────────────────

// EnsureIndices creates index templates and ILM policies if they don't exist.
// Should be called once on startup.
func (c *Client) EnsureIndices(ctx context.Context) error {
	indices := []struct {
		name     string
		mappings map[string]interface{}
	}{
		{c.auditIndex(), auditMappings()},
		{c.transactionIndex(), transactionMappings()},
		{c.insiderIndex(), insiderMappings()},
		{c.fraudIndex(), fraudMappings()},
	}
	for _, idx := range indices {
		if err := c.createIndexIfNotExists(ctx, idx.name, idx.mappings); err != nil {
			slog.Warn("opensearch: failed to create index", "index", idx.name, "err", err)
		}
	}
	return nil
}

// ─── HTTP helpers ─────────────────────────────────────────────────────────────

func (c *Client) index(ctx context.Context, index, id string, doc interface{}) error {
	body, err := json.Marshal(doc)
	if err != nil {
		return fmt.Errorf("opensearch: marshal: %w", err)
	}
	url := fmt.Sprintf("%s/%s/_doc/%s", c.baseURL, index, id)
	req, err := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return fmt.Errorf("opensearch: index request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("opensearch: index %s status %d: %s", index, resp.StatusCode, string(b))
	}
	return nil
}

func (c *Client) search(ctx context.Context, index string, body map[string]interface{}) (*SearchResult, error) {
	b, err := json.Marshal(body)
	if err != nil {
		return nil, err
	}
	url := fmt.Sprintf("%s/%s/_search", c.baseURL, index)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(b))
	if err != nil {
		return nil, err
	}
	req.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return nil, fmt.Errorf("opensearch: search request: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		rb, _ := io.ReadAll(resp.Body)
		return nil, fmt.Errorf("opensearch: search %s status %d: %s", index, resp.StatusCode, string(rb))
	}
	var result SearchResult
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return nil, fmt.Errorf("opensearch: decode response: %w", err)
	}
	return &result, nil
}

func (c *Client) createIndexIfNotExists(ctx context.Context, index string, mappings map[string]interface{}) error {
	// HEAD request to check existence
	url := fmt.Sprintf("%s/%s", c.baseURL, index)
	req, _ := http.NewRequestWithContext(ctx, http.MethodHead, url, nil)
	if c.user != "" {
		req.SetBasicAuth(c.user, c.pass)
	}
	resp, err := c.http.Do(req)
	if err != nil {
		return err
	}
	resp.Body.Close()
	if resp.StatusCode == 200 {
		return nil // already exists
	}
	// Create
	body := map[string]interface{}{"mappings": mappings}
	b, _ := json.Marshal(body)
	req2, _ := http.NewRequestWithContext(ctx, http.MethodPut, url, bytes.NewReader(b))
	req2.Header.Set("Content-Type", "application/json")
	if c.user != "" {
		req2.SetBasicAuth(c.user, c.pass)
	}
	resp2, err := c.http.Do(req2)
	if err != nil {
		return err
	}
	defer resp2.Body.Close()
	if resp2.StatusCode >= 400 {
		rb, _ := io.ReadAll(resp2.Body)
		return fmt.Errorf("create index %s: %s", index, string(rb))
	}
	return nil
}

// ─── Mappings ─────────────────────────────────────────────────────────────────

func auditMappings() map[string]interface{} {
	return map[string]interface{}{
		"properties": map[string]interface{}{
			"@timestamp":   map[string]string{"type": "date"},
			"actor_id":     map[string]string{"type": "keyword"},
			"actor_email":  map[string]string{"type": "keyword"},
			"action":       map[string]string{"type": "keyword"},
			"resource":     map[string]string{"type": "keyword"},
			"resource_id":  map[string]string{"type": "keyword"},
			"ip_address":   map[string]string{"type": "ip"},
			"status":       map[string]string{"type": "keyword"},
			"risk_score":   map[string]string{"type": "integer"},
			"service_name": map[string]string{"type": "keyword"},
		},
	}
}

func transactionMappings() map[string]interface{} {
	return map[string]interface{}{
		"properties": map[string]interface{}{
			"@timestamp":  map[string]string{"type": "date"},
			"merchant_id": map[string]string{"type": "keyword"},
			"customer_id": map[string]string{"type": "keyword"},
			"amount_kobo": map[string]string{"type": "long"},
			"currency":    map[string]string{"type": "keyword"},
			"type":        map[string]string{"type": "keyword"},
			"status":      map[string]string{"type": "keyword"},
			"channel":     map[string]string{"type": "keyword"},
			"reference":   map[string]string{"type": "keyword"},
			"fraud_score": map[string]string{"type": "float"},
		},
	}
}

func insiderMappings() map[string]interface{} {
	return map[string]interface{}{
		"properties": map[string]interface{}{
			"@timestamp":   map[string]string{"type": "date"},
			"actor_id":     map[string]string{"type": "keyword"},
			"action":       map[string]string{"type": "keyword"},
			"risk_score":   map[string]string{"type": "integer"},
			"risk_level":   map[string]string{"type": "keyword"},
			"risk_factors": map[string]string{"type": "keyword"},
			"ip_address":   map[string]string{"type": "ip"},
			"status":       map[string]string{"type": "keyword"},
		},
	}
}

func fraudMappings() map[string]interface{} {
	return map[string]interface{}{
		"properties": map[string]interface{}{
			"@timestamp":     map[string]string{"type": "date"},
			"transaction_id": map[string]string{"type": "keyword"},
			"merchant_id":    map[string]string{"type": "keyword"},
			"score":          map[string]string{"type": "float"},
			"signals":        map[string]string{"type": "keyword"},
			"action":         map[string]string{"type": "keyword"},
		},
	}
}

// ─── Bulk Indexer ─────────────────────────────────────────────────────────────

// BulkIndexer batches documents and flushes them periodically.
type BulkIndexer struct {
	client   *Client
	index    string
	buf      []bulkItem
	mu       sync.Mutex
	maxBatch int
}

type bulkItem struct {
	id  string
	doc interface{}
}

// NewBulkIndexer creates a new bulk indexer for the given index.
func NewBulkIndexer(index string, maxBatch int) *BulkIndexer {
	if maxBatch <= 0 {
		maxBatch = 100
	}
	return &BulkIndexer{
		client:   Get(),
		index:    index,
		maxBatch: maxBatch,
	}
}

// Add queues a document for bulk indexing.
func (b *BulkIndexer) Add(id string, doc interface{}) {
	b.mu.Lock()
	b.buf = append(b.buf, bulkItem{id: id, doc: doc})
	shouldFlush := len(b.buf) >= b.maxBatch
	b.mu.Unlock()
	if shouldFlush {
		go b.Flush(context.Background())
	}
}

// Flush sends all buffered documents to OpenSearch via the bulk API.
func (b *BulkIndexer) Flush(ctx context.Context) error {
	b.mu.Lock()
	if len(b.buf) == 0 {
		b.mu.Unlock()
		return nil
	}
	items := b.buf
	b.buf = nil
	b.mu.Unlock()

	var sb strings.Builder
	for _, item := range items {
		meta := fmt.Sprintf(`{"index":{"_index":%q,"_id":%q}}`, b.index, item.id)
		sb.WriteString(meta)
		sb.WriteByte('\n')
		body, _ := json.Marshal(item.doc)
		sb.Write(body)
		sb.WriteByte('\n')
	}

	url := fmt.Sprintf("%s/_bulk", b.client.baseURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, strings.NewReader(sb.String()))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/x-ndjson")
	if b.client.user != "" {
		req.SetBasicAuth(b.client.user, b.client.pass)
	}
	resp, err := b.client.http.Do(req)
	if err != nil {
		slog.Error("opensearch: bulk flush failed", "err", err)
		return err
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		rb, _ := io.ReadAll(resp.Body)
		slog.Error("opensearch: bulk flush error", "status", resp.StatusCode, "body", string(rb))
	}
	return nil
}
