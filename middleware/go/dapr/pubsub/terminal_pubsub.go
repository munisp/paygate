// Package pubsub provides Dapr pub/sub bindings for terminal events.
// Terminal events are published to the "paygate-pubsub" component
// under the topic "terminal.events" for downstream microservice consumption.
package pubsub

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"time"

	fluvio "paygate/middleware/go/fluvio"
)

const (
	DaprPubSubComponent = "paygate-pubsub"
	DaprTerminalTopic   = "terminal.events"
	DaprTerminalTxnTopic = "terminal.transactions"
	DaprTerminalAlertTopic = "terminal.alerts"
)

var daprClient = &http.Client{Timeout: 5 * time.Second}

func getDaprURL() string {
	if v := os.Getenv("DAPR_HTTP_ENDPOINT"); v != "" {
		return v
	}
	return "http://localhost:3500"
}

// PublishTerminalEvent publishes a TerminalEvent to the Dapr pub/sub component.
// Downstream services (fraud scoring, analytics, settlement) subscribe to this topic.
func PublishTerminalEvent(ctx context.Context, event fluvio.TerminalEvent) error {
	return publishToDapr(ctx, DaprTerminalTopic, event)
}

// PublishTerminalTransaction publishes a terminal transaction event specifically
// to the transactions topic for settlement and reconciliation services.
func PublishTerminalTransaction(ctx context.Context, event fluvio.TerminalEvent) error {
	return publishToDapr(ctx, DaprTerminalTxnTopic, event)
}

// PublishTerminalAlert publishes a terminal alert (offline, suspicious activity)
// to the alerts topic for the fraud and operations teams.
func PublishTerminalAlert(ctx context.Context, terminalID, merchantID, alertType, message string) error {
	alert := map[string]any{
		"terminal_id": terminalID,
		"merchant_id": merchantID,
		"alert_type":  alertType,
		"message":     message,
		"timestamp":   time.Now().UTC(),
	}
	return publishToDapr(ctx, DaprTerminalAlertTopic, alert)
}

func publishToDapr(ctx context.Context, topic string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("dapr pubsub marshal: %w", err)
	}

	url := fmt.Sprintf("%s/v1.0/publish/%s/%s", getDaprURL(), DaprPubSubComponent, topic)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return fmt.Errorf("dapr pubsub request: %w", err)
	}
	req.Header.Set("Content-Type", "application/json")

	resp, err := daprClient.Do(req)
	if err != nil {
		return fmt.Errorf("dapr pubsub post: %w", err)
	}
	defer resp.Body.Close()

	if resp.StatusCode >= 300 {
		return fmt.Errorf("dapr pubsub returned %d for topic %s", resp.StatusCode, topic)
	}
	return nil
}

// ─── Dapr Subscription Handler ────────────────────────────────────────────────

// TerminalEventSubscription defines the Dapr subscription configuration.
// Register this at GET /dapr/subscribe in the bridge server.
type TerminalEventSubscription struct {
	PubSubName string `json:"pubsubname"`
	Topic      string `json:"topic"`
	Route      string `json:"route"`
}

func GetTerminalSubscriptions() []TerminalEventSubscription {
	return []TerminalEventSubscription{
		{PubSubName: DaprPubSubComponent, Topic: DaprTerminalTopic, Route: "/dapr/terminal/events"},
		{PubSubName: DaprPubSubComponent, Topic: DaprTerminalTxnTopic, Route: "/dapr/terminal/transactions"},
		{PubSubName: DaprPubSubComponent, Topic: DaprTerminalAlertTopic, Route: "/dapr/terminal/alerts"},
	}
}
