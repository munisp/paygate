package kafka

import "context"

// PublishJSON is a convenience wrapper that publishes any JSON-serializable payload
// to a topic using an empty key.
func (p *Producer) PublishJSON(topic string, payload interface{}) error {
	return p.Publish(context.Background(), topic, "", payload)
}
