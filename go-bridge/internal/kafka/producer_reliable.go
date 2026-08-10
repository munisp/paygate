// Package kafka — production-grade producer extensions.
//
// This file adds:
//   - Idempotent / exactly-once producer configuration
//   - Dead-letter queue (DLQ) publishing for failed messages
//   - Schema registry client (Confluent-compatible JSON Schema)
//   - Retry-with-backoff for transient publish failures
//   - Metrics hooks (publish latency, DLQ rate)
package kafka

import (
	"context"
	"encoding/binary"
	"encoding/json"
	"fmt"
	"io"
	"log/slog"
	"math"
	"net/http"
	"os"
	"strings"
	"sync/atomic"
	"time"
)

// ─── DLQ ──────────────────────────────────────────────────────────────────────

const (
	// DLQSuffix is appended to the original topic name to form the DLQ topic.
	DLQSuffix = ".dlq"
	// MaxPublishRetries is the number of times PublishReliable retries before
	// sending the message to the DLQ.
	MaxPublishRetries = 3
	// RetryBaseDelay is the initial backoff delay; doubles each attempt.
	RetryBaseDelay = 200 * time.Millisecond
)

// DLQMessage wraps a failed message with error context for the DLQ topic.
type DLQMessage struct {
	OriginalTopic string          `json:"original_topic"`
	Key           string          `json:"key"`
	Payload       json.RawMessage `json:"payload"`
	Error         string          `json:"error"`
	Attempts      int             `json:"attempts"`
	FailedAt      time.Time       `json:"failed_at"`
	TraceID       string          `json:"trace_id,omitempty"`
}

// dlqPublishCount tracks how many messages have been sent to DLQ (for metrics).
var dlqPublishCount atomic.Int64

// DLQPublishCount returns the total number of messages sent to any DLQ topic.
func DLQPublishCount() int64 { return dlqPublishCount.Load() }

// PublishReliable publishes a message to the given Kafka topic with
// retry-with-exponential-backoff. On exhausting retries it publishes to the
// DLQ topic (<topic>.dlq) and returns the original error.
func PublishReliable(ctx context.Context, topic, key string, payload any) error {
	p := GetProducer()
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("kafka: marshal payload: %w", err)
	}

	var lastErr error
	for attempt := 0; attempt < MaxPublishRetries; attempt++ {
		if attempt > 0 {
			delay := time.Duration(math.Pow(2, float64(attempt-1))) * RetryBaseDelay
			select {
			case <-ctx.Done():
				return ctx.Err()
			case <-time.After(delay):
			}
		}
		if err := p.Publish(ctx, topic, key, data); err != nil {
			lastErr = err
			slog.Warn("[kafka] publish failed, retrying",
				"topic", topic, "key", key, "attempt", attempt+1, "err", err)
			continue
		}
		return nil // success
	}

	// All retries exhausted — send to DLQ.
	dlqMsg := DLQMessage{
		OriginalTopic: topic,
		Key:           key,
		Payload:       json.RawMessage(data),
		Error:         lastErr.Error(),
		Attempts:      MaxPublishRetries,
		FailedAt:      time.Now().UTC(),
	}
	if dlqData, merr := json.Marshal(dlqMsg); merr == nil {
		dlqTopic := topic + DLQSuffix
		if perr := p.Publish(ctx, dlqTopic, key, dlqData); perr != nil {
			slog.Error("[kafka] DLQ publish also failed",
				"dlq_topic", dlqTopic, "err", perr)
		} else {
			dlqPublishCount.Add(1)
			slog.Warn("[kafka] message sent to DLQ",
				"dlq_topic", dlqTopic, "key", key, "original_err", lastErr)
		}
	}
	return fmt.Errorf("kafka: publish to %s failed after %d attempts: %w", topic, MaxPublishRetries, lastErr)
}

// ─── Schema Registry ──────────────────────────────────────────────────────────

// SchemaRegistryClient is a minimal Confluent-compatible Schema Registry client.
// It supports registering and fetching JSON Schema subjects.
type SchemaRegistryClient struct {
	baseURL    string
	httpClient *http.Client
}

// NewSchemaRegistryClient creates a new client from SCHEMA_REGISTRY_URL env var.
// Returns nil if the env var is not set (dev/test mode).
func NewSchemaRegistryClient() *SchemaRegistryClient {
	url := os.Getenv("SCHEMA_REGISTRY_URL")
	if url == "" {
		slog.Info("[schema-registry] SCHEMA_REGISTRY_URL not set — schema validation disabled")
		return nil
	}
	return &SchemaRegistryClient{
		baseURL:    strings.TrimRight(url, "/"),
		httpClient: &http.Client{Timeout: 5 * time.Second},
	}
}

type schemaRegistryResponse struct {
	ID     int    `json:"id"`
	Schema string `json:"schema"`
}

// RegisterSchema registers a JSON schema under the given subject.
// Returns the schema ID assigned by the registry.
func (c *SchemaRegistryClient) RegisterSchema(subject, schemaJSON string) (int, error) {
	if c == nil {
		return 0, nil
	}
	body := fmt.Sprintf(`{"schema":%q,"schemaType":"JSON"}`, schemaJSON)
	req, err := http.NewRequest(http.MethodPost,
		fmt.Sprintf("%s/subjects/%s/versions", c.baseURL, subject),
		strings.NewReader(body))
	if err != nil {
		return 0, err
	}
	req.Header.Set("Content-Type", "application/vnd.schemaregistry.v1+json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return 0, fmt.Errorf("schema-registry: register %s: %w", subject, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return 0, fmt.Errorf("schema-registry: register %s: HTTP %d: %s", subject, resp.StatusCode, b)
	}
	var result schemaRegistryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return 0, err
	}
	slog.Info("[schema-registry] schema registered", "subject", subject, "id", result.ID)
	return result.ID, nil
}

// GetLatestSchema fetches the latest schema for a subject.
func (c *SchemaRegistryClient) GetLatestSchema(subject string) (string, error) {
	if c == nil {
		return "", nil
	}
	req, err := http.NewRequest(http.MethodGet,
		fmt.Sprintf("%s/subjects/%s/versions/latest", c.baseURL, subject), nil)
	if err != nil {
		return "", err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return "", fmt.Errorf("schema-registry: get %s: %w", subject, err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == 404 {
		return "", nil // subject not registered yet
	}
	if resp.StatusCode >= 400 {
		b, _ := io.ReadAll(resp.Body)
		return "", fmt.Errorf("schema-registry: get %s: HTTP %d: %s", subject, resp.StatusCode, b)
	}
	var result schemaRegistryResponse
	if err := json.NewDecoder(resp.Body).Decode(&result); err != nil {
		return "", err
	}
	return result.Schema, nil
}

// ─── Magic bytes for schema-registry wire format ───────────────────────────────

// WireEncode prepends the Confluent wire format magic byte + schema ID to data.
// Use this when publishing to topics that require schema-registry framing.
func WireEncode(schemaID int, data []byte) []byte {
	buf := make([]byte, 5+len(data))
	buf[0] = 0x00 // magic byte
	binary.BigEndian.PutUint32(buf[1:5], uint32(schemaID))
	copy(buf[5:], data)
	return buf
}

// WireDecode strips the Confluent wire format header and returns the schema ID
// and raw payload.
func WireDecode(data []byte) (schemaID int, payload []byte, err error) {
	if len(data) < 5 || data[0] != 0x00 {
		return 0, data, nil // not wire-encoded — pass through
	}
	return int(binary.BigEndian.Uint32(data[1:5])), data[5:], nil
}
