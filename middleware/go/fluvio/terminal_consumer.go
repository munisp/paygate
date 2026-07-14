// terminal_consumer.go — Fluvio consumer for POS terminal events.
//
// Reads from paygate.terminal.events (aggregate fan-out topic) and:
//   1. Updates terminal/transaction status in the portal DB via bridge HTTP
//   2. Publishes to Redis pub/sub for SSE fan-out to connected dashboards
//   3. Forwards to Dapr pub/sub for downstream microservices
//   4. Writes to Lakehouse audit log
package fluvio

import (
	"bytes"
	"context"
	"encoding/json"
	"fmt"
	"log"
	"net/http"
	"os"
	"time"
)

// ─── Consumer ─────────────────────────────────────────────────────────────────

// TerminalConsumer subscribes to Fluvio terminal topics and fans out events
// to Redis pub/sub, Dapr, and the Lakehouse writer.
type TerminalConsumer struct {
	fluvioEndpoint string
	bridgeURL      string
	redisURL       string
	daprURL        string
	httpClient     *http.Client
	stopCh         chan struct{}
}

func NewTerminalConsumer() *TerminalConsumer {
	return &TerminalConsumer{
		fluvioEndpoint: getEnv("FLUVIO_ENDPOINT", "http://localhost:9003"),
		bridgeURL:      getEnv("MIDDLEWARE_BRIDGE_URL", ""),
		redisURL:       getEnv("REDIS_URL", "redis://localhost:6379"),
		daprURL:        getEnv("DAPR_HTTP_ENDPOINT", "http://localhost:3500"),
		httpClient:     &http.Client{Timeout: 10 * time.Second},
		stopCh:         make(chan struct{}),
	}
}

// Start begins consuming from all terminal Fluvio topics in goroutines.
func (c *TerminalConsumer) Start(ctx context.Context) {
	topics := []string{
		TopicTerminalProvisioned,
		TopicTerminalActivated,
		TopicTerminalHeartbeat,
		TopicTerminalTxnCompleted,
		TopicTerminalTxnFailed,
		TopicTerminalRefunded,
		TopicTerminalVoided,
		TopicTerminalStatusChange,
	}
	for _, topic := range topics {
		go c.consumeTopic(ctx, topic)
	}
	log.Printf("[terminal-consumer] started consuming %d topics", len(topics))
}

// Stop signals all consumer goroutines to exit.
func (c *TerminalConsumer) Stop() {
	close(c.stopCh)
}

func (c *TerminalConsumer) consumeTopic(ctx context.Context, topic string) {
	offset := "earliest"
	for {
		select {
		case <-c.stopCh:
			return
		case <-ctx.Done():
			return
		default:
		}

		events, err := c.fetchFromFluvio(ctx, topic, offset)
		if err != nil {
			log.Printf("[terminal-consumer] fetch error topic=%s: %v", topic, err)
			time.Sleep(2 * time.Second)
			continue
		}

		for _, event := range events {
			if err := c.handleEvent(ctx, event); err != nil {
				log.Printf("[terminal-consumer] handle error event_id=%s: %v", event.EventID, err)
			}
		}

		if len(events) == 0 {
			time.Sleep(500 * time.Millisecond)
		}
	}
}

// fetchFromFluvio polls the Fluvio HTTP proxy for new records on a topic.
func (c *TerminalConsumer) fetchFromFluvio(ctx context.Context, topic, offset string) ([]TerminalEvent, error) {
	url := fmt.Sprintf("%s/consume/%s?offset=%s&max_records=100", c.fluvioEndpoint, topic, offset)
	req, err := http.NewRequestWithContext(ctx, http.MethodGet, url, nil)
	if err != nil {
		return nil, err
	}
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return nil, err
	}
	defer resp.Body.Close()
	if resp.StatusCode == http.StatusNoContent {
		return nil, nil
	}
	var events []TerminalEvent
	if err := json.NewDecoder(resp.Body).Decode(&events); err != nil {
		return nil, fmt.Errorf("decode events: %w", err)
	}
	return events, nil
}

// handleEvent dispatches a consumed event to all downstream sinks.
func (c *TerminalConsumer) handleEvent(ctx context.Context, event TerminalEvent) error {
	// 1. Push to Redis pub/sub for SSE fan-out
	if err := c.publishToRedis(ctx, event); err != nil {
		log.Printf("[terminal-consumer] redis publish failed: %v", err)
	}

	// 2. Forward to Dapr pub/sub
	if err := c.publishToDapr(ctx, event); err != nil {
		log.Printf("[terminal-consumer] dapr publish failed: %v", err)
	}

	// 3. Write to Lakehouse (audit trail)
	if err := c.writeToLakehouse(ctx, event); err != nil {
		log.Printf("[terminal-consumer] lakehouse write failed: %v", err)
	}

	// 4. On txn_completed — trigger TigerBeetle settlement via bridge
	if event.EventType == EventTxnCompleted {
		if err := c.triggerSettlement(ctx, event); err != nil {
			log.Printf("[terminal-consumer] settlement trigger failed: %v", err)
		}
	}

	return nil
}

// publishToRedis pushes the event to a Redis pub/sub channel keyed by merchantID.
// The portal SSE endpoint subscribes to this channel.
func (c *TerminalConsumer) publishToRedis(ctx context.Context, event TerminalEvent) error {
	if c.bridgeURL == "" {
		return nil
	}
	channel := fmt.Sprintf("terminal:%s", event.MerchantID)
	data, _ := json.Marshal(event)
	body, _ := json.Marshal(map[string]any{
		"channel": channel,
		"message": string(data),
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.bridgeURL+"/redis/publish", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", os.Getenv("MIDDLEWARE_INTERNAL_KEY"))
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// publishToDapr forwards the event to the Dapr pub/sub component.
func (c *TerminalConsumer) publishToDapr(ctx context.Context, event TerminalEvent) error {
	if c.daprURL == "" {
		return nil
	}
	data, _ := json.Marshal(event)
	url := fmt.Sprintf("%s/v1.0/publish/paygate-pubsub/terminal.events", c.daprURL)
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, url, bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// writeToLakehouse sends the event to the Python Lakehouse writer service.
func (c *TerminalConsumer) writeToLakehouse(ctx context.Context, event TerminalEvent) error {
	lakehouseURL := getEnv("LAKEHOUSE_WRITER_URL", "http://localhost:8090")
	data, _ := json.Marshal(map[string]any{
		"table":  "terminal_events",
		"record": event,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, lakehouseURL+"/write", bytes.NewReader(data))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}

// triggerSettlement calls the Rust TigerBeetle bridge to post the double-entry
// settlement entries for a completed terminal transaction.
func (c *TerminalConsumer) triggerSettlement(ctx context.Context, event TerminalEvent) error {
	if c.bridgeURL == "" {
		return nil
	}
	payload, ok := event.Payload.(map[string]any)
	if !ok {
		return nil
	}
	body, _ := json.Marshal(map[string]any{
		"terminal_id":    event.TerminalID,
		"merchant_id":    event.MerchantID,
		"transaction_id": payload["transaction_id"],
		"amount_kobo":    payload["amount_kobo"],
		"currency":       payload["currency"],
		"reference":      payload["reference"],
		"event_id":       event.EventID,
	})
	req, err := http.NewRequestWithContext(ctx, http.MethodPost, c.bridgeURL+"/terminal/settle", bytes.NewReader(body))
	if err != nil {
		return err
	}
	req.Header.Set("Content-Type", "application/json")
	req.Header.Set("X-Internal-Key", os.Getenv("MIDDLEWARE_INTERNAL_KEY"))
	resp, err := c.httpClient.Do(req)
	if err != nil {
		return err
	}
	defer resp.Body.Close()
	return nil
}
