// Package dapr provides a stub Dapr pub/sub client.
// In production, replace with the real Dapr Go SDK.
package dapr

import "log/slog"

// Publish publishes a message to the specified topic on the given pubsub component.
// This is a no-op stub; wire the real Dapr client when Dapr sidecar is available.
func Publish(pubsubName, topic string, payload interface{}) {
	slog.Info("dapr.Publish (stub)", "pubsub", pubsubName, "topic", topic)
}
