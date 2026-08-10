package fluvio

import (
	"context"
	"log/slog"
)

// Produce is a package-level convenience wrapper for Producer.Produce.
// It silently no-ops if the Fluvio producer is not initialised.
func Produce(topic string, event any) {
	p := Get()
	if p == nil {
		slog.Warn("fluvio.Produce: producer not initialised, dropping event", "topic", topic)
		return
	}
	if err := p.Produce(context.Background(), topic, event); err != nil {
		slog.Error("fluvio.Produce: failed", "topic", topic, "err", err)
	}
}
