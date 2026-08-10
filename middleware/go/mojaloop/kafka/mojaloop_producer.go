// Package kafka provides Kafka producers for Mojaloop transfer lifecycle events.
// All events are published to dedicated topics consumed by the Python worker,
// TypeScript tRPC router, and Rust settlement service.
package kafka

import (
	"context"
	"encoding/json"
	"fmt"
	"os"
	"time"

	"github.com/IBM/sarama"
	"github.com/munisp/paygate/middleware/go/mojaloop/models"
)

// Topic constants — mirrors topics.go in kafka/topics package
const (
	TopicPartyFound         = "paygate.mojaloop.party.found"
	TopicQuoteAccepted      = "paygate.mojaloop.quote.accepted"
	TopicTransferCompleted  = "paygate.mojaloop.transfer.completed"
	TopicTransferFailed     = "paygate.mojaloop.transfer.failed"
	TopicTransferEvents     = "paygate.mojaloop.transfer.events" // fan-out aggregate
)

// MojaloopProducer publishes Mojaloop lifecycle events to Kafka.
type MojaloopProducer struct {
	producer sarama.SyncProducer
}

// NewMojaloopProducer creates a new Sarama sync producer from KAFKA_BOOTSTRAP_SERVERS.
func NewMojaloopProducer() *MojaloopProducer {
	brokers := []string{getEnv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")}
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	cfg.Producer.RequiredAcks = sarama.WaitForAll
	cfg.Producer.Retry.Max = 3
	cfg.Producer.Retry.Backoff = 200 * time.Millisecond
	cfg.Version = sarama.V3_0_0_0

	producer, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		panic(fmt.Sprintf("mojaloop kafka: failed to create producer: %v", err))
	}
	return &MojaloopProducer{producer: producer}
}

func (p *MojaloopProducer) PublishPartyFound(ctx context.Context, event models.PartyFoundEvent) error {
	return p.publish(TopicPartyFound, event.MerchantID, event)
}

func (p *MojaloopProducer) PublishQuoteAccepted(ctx context.Context, event models.QuoteAcceptedEvent) error {
	return p.publish(TopicQuoteAccepted, event.MerchantID, event)
}

func (p *MojaloopProducer) PublishTransferCompleted(ctx context.Context, event models.TransferCompletedEvent) error {
	// Publish to specific topic and aggregate fan-out
	if err := p.publish(TopicTransferCompleted, event.MerchantID, event); err != nil {
		return err
	}
	return p.publish(TopicTransferEvents, event.MerchantID, event)
}

func (p *MojaloopProducer) PublishTransferFailed(ctx context.Context, event models.TransferFailedEvent) error {
	if err := p.publish(TopicTransferFailed, event.MerchantID, event); err != nil {
		return err
	}
	return p.publish(TopicTransferEvents, event.MerchantID, event)
}

func (p *MojaloopProducer) publish(topic, key string, payload any) error {
	data, err := json.Marshal(payload)
	if err != nil {
		return fmt.Errorf("mojaloop kafka: marshal payload: %w", err)
	}
	msg := &sarama.ProducerMessage{
		Topic:     topic,
		Key:       sarama.StringEncoder(key),
		Value:     sarama.ByteEncoder(data),
		Timestamp: time.Now().UTC(),
	}
	_, _, err = p.producer.SendMessage(msg)
	return err
}

func (p *MojaloopProducer) Close() error {
	return p.producer.Close()
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
