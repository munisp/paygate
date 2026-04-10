package kafka

import (
	"context"
	"encoding/json"
	"log/slog"
)

// Message is a simple Kafka message with a topic, key, and value.
// It is used by Temporal activities and other callers that need a lightweight
// publish API without constructing a full Record.
type Message struct {
	Topic string
	Key   string
	Value interface{}
}

// Produce publishes a Message to Kafka. The Value is JSON-encoded.
// This is a convenience wrapper around Producer.Publish.
func (p *Producer) Produce(msg Message) {
	if p == nil {
		slog.Warn("kafka.Produce: producer is nil, dropping message", "topic", msg.Topic, "key", msg.Key)
		return
	}
	payload, err := json.Marshal(msg.Value)
	if err != nil {
		slog.Error("kafka.Produce: json marshal failed", "topic", msg.Topic, "err", err)
		return
	}
	if err := p.Publish(context.Background(), msg.Topic, msg.Key, json.RawMessage(payload)); err != nil {
		slog.Error("kafka.Produce: publish failed", "topic", msg.Topic, "err", err)
	}
}
