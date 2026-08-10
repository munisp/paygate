// Package dapr provides a Dapr pub/sub and state store client for the PayGate
// bridge service.
//
// It communicates with the Dapr sidecar over HTTP (port 3500 by default).
//
// Features:
//   - Pub/Sub: publish events to named topics
//   - State Store: get/set/delete state with optimistic concurrency
//   - Service Invocation: invoke other Dapr-enabled services
//   - Subscription config: /dapr/subscribe endpoint helpers
//
// Environment variables:
//   DAPR_HTTP_PORT    — Dapr sidecar HTTP port (default: 3500)
//   DAPR_APP_ID       — this app's Dapr app ID (default: "paygate-bridge")
package dapr

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

// ─── Topic constants ──────────────────────────────────────────────────────────

const (
	// PubSubComponent is the Dapr pub/sub component name (must match component YAML)
	PubSubComponent = "pubsub"
	// StateStoreComponent is the Dapr state store component name
	StateStoreComponent = "statestore"

	TopicPayoutApproval     = "payout-approval"
	TopicSettlementTrigger  = "settlement-trigger"
	TopicFraudSignal        = "fraud-signal"
	TopicKYBStatusChange    = "kyb-status-change"
	TopicTransactionCreated = "transaction-created"
	TopicWebhookDelivery    = "webhook-delivery"
)

// ─── Client ───────────────────────────────────────────────────────────────────

// Client wraps the Dapr HTTP sidecar API.
type Client struct {
	sidecarURL string
	appID      string
	httpClient *http.Client
	enabled    bool
}

var globalClient *Client

// Init initialises the global Dapr client by probing the sidecar health endpoint.
func Init() {
	port := os.Getenv("DAPR_HTTP_PORT")
	if port == "" {
		port = "3500"
	}
	appID := os.Getenv("DAPR_APP_ID")
	if appID == "" {
		appID = "paygate-bridge"
	}
	sidecarURL := fmt.Sprintf("http://localhost:%s", port)
	client := &http.Client{Timeout: 5 * time.Second}

	resp, err := client.Get(sidecarURL + "/v1.0/healthz")
	enabled := err == nil && resp != nil && resp.StatusCode == http.StatusNoContent
	if resp != nil {
		resp.Body.Close()
	}

	if !enabled {
		slog.Info("[dapr] sidecar not reachable — Dapr integration disabled (dev mode)", "url", sidecarURL)
	} else {
		slog.Info("[dapr] sidecar connected", "url", sidecarURL, "app_id", appID)
	}

	globalClient = &Client{
		sidecarURL: sidecarURL,
		appID:      appID,
		httpClient: client,
		enabled:    enabled,
	}
}

// Get returns the global Dapr client, initialising it if needed.
func Get() *Client {
	if globalClient == nil {
		Init()
	}
	return globalClient
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

// PublishEvent publishes an event to a Dapr pub/sub topic.
func (c *Client) PublishEvent(ctx context.Context, topic string, payload interface{}) error {
	if !c.enabled {
		slog.Info("[dapr] PublishEvent (stub)", "topic", topic)
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("dapr: marshal payload: %w", err)
	}
	url := fmt.Sprintf("%s/v1.0/publish/%s/%s", c.sidecarURL, PubSubComponent, topic)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("dapr: build publish request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr: publish event: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr: publish event %d: %s", resp.StatusCode, b)
	}
	slog.Info("[dapr] event published", "topic", topic)
	return nil
}

// Publish is a fire-and-forget convenience wrapper for PublishEvent.
func Publish(pubsubName, topic string, payload interface{}) {
	if err := Get().PublishEvent(context.Background(), topic, payload); err != nil {
		slog.Warn("[dapr] publish failed", "pubsub", pubsubName, "topic", topic, "err", err)
	}
}

// ─── State Store ──────────────────────────────────────────────────────────────

// StateItem represents a single state store entry.
type StateItem struct {
	Key   string      `json:"key"`
	Value interface{} `json:"value"`
	ETag  string      `json:"etag,omitempty"`
}

// SaveState saves one or more items to the Dapr state store.
func (c *Client) SaveState(ctx context.Context, items []StateItem) error {
	if !c.enabled {
		slog.Info("[dapr] SaveState (stub)", "count", len(items))
		return nil
	}
	body, err := json.Marshal(items)
	if err != nil {
		return fmt.Errorf("dapr: marshal state items: %w", err)
	}
	url := fmt.Sprintf("%s/v1.0/state/%s", c.sidecarURL, StateStoreComponent)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("dapr: build save state request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr: save state: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr: save state %d: %s", resp.StatusCode, b)
	}
	return nil
}

// GetState retrieves a value from the Dapr state store.
func (c *Client) GetState(ctx context.Context, key string, out interface{}) error {
	if !c.enabled {
		slog.Info("[dapr] GetState (stub)", "key", key)
		return nil
	}
	url := fmt.Sprintf("%s/v1.0/state/%s/%s", c.sidecarURL, StateStoreComponent, key)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return fmt.Errorf("dapr: build get state request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr: get state: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return nil // key not found
	}
	if resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr: get state %d: %s", resp.StatusCode, b)
	}
	return json.NewDecoder(resp.Body).Decode(out)
}

// DeleteState removes a key from the Dapr state store.
func (c *Client) DeleteState(ctx context.Context, key string) error {
	if !c.enabled {
		slog.Info("[dapr] DeleteState (stub)", "key", key)
		return nil
	}
	url := fmt.Sprintf("%s/v1.0/state/%s/%s", c.sidecarURL, StateStoreComponent, key)
	req, err := http.NewRequestWithContext(ctx, http.MethodDelete, url, nil)
	if err != nil {
		return fmt.Errorf("dapr: build delete state request: %w", err)
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr: delete state: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode != http.StatusNoContent && resp.StatusCode != http.StatusOK {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr: delete state %d: %s", resp.StatusCode, b)
	}
	return nil
}

// ─── Service Invocation ───────────────────────────────────────────────────────

// InvokeService invokes a method on another Dapr-enabled service.
func (c *Client) InvokeService(ctx context.Context, appID, method string, payload interface{}, out interface{}) error {
	if !c.enabled {
		slog.Info("[dapr] InvokeService (stub)", "app_id", appID, "method", method)
		return nil
	}
	body, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("dapr: marshal invoke payload: %w", err)
	}
	url := fmt.Sprintf("%s/v1.0/invoke/%s/method/%s", c.sidecarURL, appID, method)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(body))
	if err != nil {
		return fmt.Errorf("dapr: build invoke request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr: invoke service: %w", err)
	}
	defer resp.Body.Close()
	if resp.StatusCode < 200 || resp.StatusCode >= 300 {
		b, _ := io.ReadAll(resp.Body)
		return fmt.Errorf("dapr: invoke service %d: %s", resp.StatusCode, b)
	}
	if out != nil {
		return json.NewDecoder(resp.Body).Decode(out)
	}
	return nil
}

// ─── Subscription config ──────────────────────────────────────────────────────

// SubscriptionConfig describes a Dapr pub/sub subscription for the /dapr/subscribe endpoint.
type SubscriptionConfig struct {
	PubSubName string `json:"pubsubname"`
	Topic      string `json:"topic"`
	Route      string `json:"route"`
}

// DefaultSubscriptions returns the list of topics this app subscribes to.
// Register GET /dapr/subscribe in your HTTP mux to return this as JSON.
func DefaultSubscriptions() []SubscriptionConfig {
	return []SubscriptionConfig{
		{PubSubName: PubSubComponent, Topic: TopicPayoutApproval, Route: "/dapr/payout-approval"},
		{PubSubName: PubSubComponent, Topic: TopicSettlementTrigger, Route: "/dapr/settlement-trigger"},
		{PubSubName: PubSubComponent, Topic: TopicFraudSignal, Route: "/dapr/fraud-signal"},
		{PubSubName: PubSubComponent, Topic: TopicKYBStatusChange, Route: "/dapr/kyb-status-change"},
		{PubSubName: PubSubComponent, Topic: TopicTransactionCreated, Route: "/dapr/transaction-created"},
		{PubSubName: PubSubComponent, Topic: TopicWebhookDelivery, Route: "/dapr/webhook-delivery"},
	}
}
