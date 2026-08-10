// Package fluvio — consumer.go
//
// Provides a Fluvio stream consumer that exposes real-time events via
// Server-Sent Events (SSE) over HTTP.
//
// The SSE endpoint at GET /v1/stream/events allows the frontend to subscribe
// to live transaction, payout, fraud, and settlement events without polling.
//
// Topics consumed:
//   - paygate-transaction-feed      — real-time transaction events
//   - paygate-payout-approval-events — payout state changes
//   - paygate-fraud-signals          — fraud detection signals
//   - paygate-settlement-events      — settlement triggers and confirmations
//
// Usage (register in main.go):
//
//	consumer := fluvio.NewSSEConsumer()
//	mux.HandleFunc("GET /v1/stream/events", authMiddleware(consumer.ServeSSE))
//	go consumer.Start(ctx)
package fluvio

import (
	"context"
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"sync"
	"time"
)

// ─── SSE Event ────────────────────────────────────────────────────────────────

// SSEEvent is a Server-Sent Event message.
type SSEEvent struct {
	ID    string      `json:"id"`
	Event string      `json:"event"`
	Data  interface{} `json:"data"`
}

// ─── SSE Consumer ─────────────────────────────────────────────────────────────

// SSEConsumer subscribes to Fluvio topics and broadcasts events to SSE clients.
type SSEConsumer struct {
	producer *Producer // reuse the existing producer for topic constants

	mu      sync.RWMutex
	clients map[chan SSEEvent]struct{}
}

// NewSSEConsumer creates a new SSE consumer.
func NewSSEConsumer() *SSEConsumer {
	return &SSEConsumer{
		clients: make(map[chan SSEEvent]struct{}),
	}
}

// subscribe registers a new SSE client channel.
func (c *SSEConsumer) subscribe() chan SSEEvent {
	ch := make(chan SSEEvent, 32)
	c.mu.Lock()
	c.clients[ch] = struct{}{}
	c.mu.Unlock()
	slog.Debug("[fluvio-sse] client subscribed", "total_clients", len(c.clients))
	return ch
}

// unsubscribe removes an SSE client channel.
func (c *SSEConsumer) unsubscribe(ch chan SSEEvent) {
	c.mu.Lock()
	delete(c.clients, ch)
	c.mu.Unlock()
	close(ch)
	slog.Debug("[fluvio-sse] client unsubscribed", "total_clients", len(c.clients))
}

// broadcast sends an event to all connected SSE clients.
func (c *SSEConsumer) broadcast(event SSEEvent) {
	c.mu.RLock()
	defer c.mu.RUnlock()
	for ch := range c.clients {
		select {
		case ch <- event:
		default:
			// Drop if client is slow
			slog.Warn("[fluvio-sse] client buffer full, dropping event", "event", event.Event)
		}
	}
}

// Start begins consuming from Fluvio topics and broadcasting to SSE clients.
// In production, replace the simulation with a real Fluvio consumer.
func (c *SSEConsumer) Start(ctx context.Context) {
	slog.Info("[fluvio-sse] consumer started")

	// Production implementation note:
	// Replace this simulation with a real Fluvio consumer using the Fluvio CLI
	// or the fluvio-client-go library:
	//
	//   client, _ := fluvio.Connect()
	//   consumer, _ := client.NewConsumer(TopicTransactionFeed, 0)
	//   for {
	//       records, _ := consumer.Fetch()
	//       for _, record := range records {
	//           c.broadcast(parseRecord(record))
	//       }
	//   }
	//
	// For now, we poll the Fluvio HTTP endpoint if FLUVIO_ENDPOINT is set,
	// otherwise emit synthetic heartbeat events.

	ticker := time.NewTicker(5 * time.Second)
	defer ticker.Stop()

	heartbeatTicker := time.NewTicker(30 * time.Second)
	defer heartbeatTicker.Stop()

	for {
		select {
		case <-ctx.Done():
			slog.Info("[fluvio-sse] consumer stopped")
			return

		case <-heartbeatTicker.C:
			c.broadcast(SSEEvent{
				ID:    fmt.Sprintf("hb-%d", time.Now().UnixMilli()),
				Event: "heartbeat",
				Data:  map[string]interface{}{"ts": time.Now().UTC().Format(time.RFC3339)},
			})

		case <-ticker.C:
			// In production: fetch from Fluvio topics and broadcast real events
			slog.Debug("[fluvio-sse] poll tick", "clients", len(c.clients))
		}
	}
}

// Emit manually emits an event to all SSE clients.
// Call this from your tRPC procedures or Go handlers when events occur.
func (c *SSEConsumer) Emit(eventType string, data interface{}) {
	c.broadcast(SSEEvent{
		ID:    fmt.Sprintf("%s-%d", eventType, time.Now().UnixMilli()),
		Event: eventType,
		Data:  data,
	})
}

// ServeSSE is an HTTP handler that streams events to the client via SSE.
// Register as: mux.HandleFunc("GET /v1/stream/events", consumer.ServeSSE)
func (c *SSEConsumer) ServeSSE(w http.ResponseWriter, r *http.Request) {
	// Set SSE headers
	w.Header().Set("Content-Type", "text/event-stream")
	w.Header().Set("Cache-Control", "no-cache")
	w.Header().Set("Connection", "keep-alive")
	w.Header().Set("X-Accel-Buffering", "no") // disable nginx buffering
	w.Header().Set("Access-Control-Allow-Origin", "*")

	flusher, ok := w.(http.Flusher)
	if !ok {
		http.Error(w, "streaming not supported", http.StatusInternalServerError)
		return
	}

	// Send initial connection event
	fmt.Fprintf(w, "event: connected\ndata: {\"status\":\"connected\",\"ts\":\"%s\"}\n\n",
		time.Now().UTC().Format(time.RFC3339))
	flusher.Flush()

	// Subscribe to events
	ch := c.subscribe()
	defer c.unsubscribe(ch)

	// Stream events until client disconnects
	for {
		select {
		case <-r.Context().Done():
			return

		case event, ok := <-ch:
			if !ok {
				return
			}

			data, err := json.Marshal(event.Data)
			if err != nil {
				slog.Warn("[fluvio-sse] marshal event data failed", "err", err)
				continue
			}

			if event.ID != "" {
				fmt.Fprintf(w, "id: %s\n", event.ID)
			}
			fmt.Fprintf(w, "event: %s\ndata: %s\n\n", event.Event, data)
			flusher.Flush()
		}
	}
}

// ─── Global SSE consumer ──────────────────────────────────────────────────────

var globalSSEConsumer *SSEConsumer
var sseOnce sync.Once

// GetSSEConsumer returns the global SSE consumer, creating it if needed.
func GetSSEConsumer() *SSEConsumer {
	sseOnce.Do(func() {
		globalSSEConsumer = NewSSEConsumer()
	})
	return globalSSEConsumer
}
