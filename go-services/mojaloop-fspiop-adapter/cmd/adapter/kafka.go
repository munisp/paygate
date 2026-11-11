// kafka.go — fail-loud Kafka producer for FSPIOP callback events.
//
// Follows the go-bridge internal/kafka/producer.go pattern: when
// KAFKA_BOOTSTRAP_SERVERS is unset or the brokers are unreachable, every
// publish returns an error — callback events are NEVER silently dropped.
//
// wave-7 (B7): Mojaloop transfer-state callbacks arriving at
// PUT /v1/transfers/{id}[/error] are published to paygate.mojaloop.callback,
// consumed by go-bridge (internal/kafka/consumer.go HandleMojalooopCallback).
package main

import (
	"encoding/json"
	"errors"
	"fmt"
	"log/slog"
	"strings"
	"time"

	"github.com/IBM/sarama"
)

// TopicMojaloopCallback is the canonical Mojaloop callback topic consumed by
// the go-bridge consumer group.
const TopicMojaloopCallback = "paygate.mojaloop.callback"

// errKafkaNotConfigured is returned by publish when no brokers are wired.
var errKafkaNotConfigured = errors.New("kafka: producer not configured (KAFKA_BOOTSTRAP_SERVERS unset or connection failed)")

type kafkaProducer struct {
	sp      sarama.SyncProducer
	initErr error
}

// newKafkaProducer builds a sarama SyncProducer from comma-separated brokers.
// A disabled producer is returned (with initErr set) when brokers are empty
// or unreachable — publish then fails loud instead of dropping events.
func newKafkaProducer(brokersStr string) *kafkaProducer {
	if strings.TrimSpace(brokersStr) == "" {
		slog.Warn("[kafka] KAFKA_BOOTSTRAP_SERVERS not set — callback publishes will FAIL (no silent drop)")
		return &kafkaProducer{initErr: errKafkaNotConfigured}
	}
	brokers := strings.Split(brokersStr, ",")
	for i, b := range brokers {
		brokers[i] = strings.TrimSpace(b)
	}
	cfg := sarama.NewConfig()
	cfg.Producer.Return.Successes = true
	cfg.Producer.RequiredAcks = sarama.WaitForLocal
	cfg.Producer.Retry.Max = 3
	cfg.Net.DialTimeout = 10 * time.Second
	cfg.Metadata.Timeout = 10 * time.Second
	sp, err := sarama.NewSyncProducer(brokers, cfg)
	if err != nil {
		slog.Error("[kafka] failed to connect to brokers — callback publishes will FAIL", "brokers", brokers, "err", err)
		return &kafkaProducer{initErr: fmt.Errorf("kafka: connect %v: %w", brokers, err)}
	}
	slog.Info("[kafka] producer initialised (sarama sync producer)", "brokers", brokers)
	return &kafkaProducer{sp: sp}
}

// publish serialises the event to JSON and sends it synchronously.
func (p *kafkaProducer) publish(topic, key string, event any) error {
	if p == nil || p.sp == nil {
		if p != nil && p.initErr != nil {
			return p.initErr
		}
		return errKafkaNotConfigured
	}
	payload, err := json.Marshal(event)
	if err != nil {
		return fmt.Errorf("kafka.publish: marshal: %w", err)
	}
	_, _, err = p.sp.SendMessage(&sarama.ProducerMessage{
		Topic: topic,
		Key:   sarama.ByteEncoder([]byte(key)),
		Value: sarama.ByteEncoder(payload),
	})
	if err != nil {
		return fmt.Errorf("kafka.publish: produce %s: %w", topic, err)
	}
	slog.Info("[kafka] event published", "topic", topic, "key", key, "bytes", len(payload))
	return nil
}

func (p *kafkaProducer) close() {
	if p != nil && p.sp != nil {
		if err := p.sp.Close(); err != nil {
			slog.Error("[kafka] producer close error", "err", err)
		}
	}
}

// mojaloopCallbackEvent is the payload published to paygate.mojaloop.callback.
// Field names match go-bridge HandleMojalooopCallback's decode struct.
type mojaloopCallbackEvent struct {
	TransferID    string    `json:"transfer_id"`
	TransferState string    `json:"transfer_state"`
	Amount        string    `json:"amount,omitempty"`
	Currency      string    `json:"currency,omitempty"`
	OccurredAt    time.Time `json:"occurred_at"`
}
