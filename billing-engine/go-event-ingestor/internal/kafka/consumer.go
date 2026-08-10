package kafka

import (
	"context"
	"fmt"
	"time"

	"github.com/confluentinc/confluent-kafka-go/v2/kafka"
	"go.uber.org/zap"
)

type Config struct {
	Brokers  string
	GroupID  string
	Topic    string
	Logger   *zap.Logger
}

type Consumer struct {
	consumer *kafka.Consumer
	topic    string
	log      *zap.Logger
}

func NewConsumer(cfg Config) (*Consumer, error) {
	c, err := kafka.NewConsumer(&kafka.ConfigMap{
		"bootstrap.servers":  cfg.Brokers,
		"group.id":           cfg.GroupID,
		"auto.offset.reset":  "earliest",
		"enable.auto.commit": false,
		"session.timeout.ms": 30000,
	})
	if err != nil {
		return nil, fmt.Errorf("create kafka consumer: %w", err)
	}

	if err := c.SubscribeTopics([]string{cfg.Topic}, nil); err != nil {
		return nil, fmt.Errorf("subscribe kafka topic %s: %w", cfg.Topic, err)
	}

	cfg.Logger.Info("Kafka consumer subscribed", zap.String("topic", cfg.Topic))

	return &Consumer{
		consumer: c,
		topic:    cfg.Topic,
		log:      cfg.Logger,
	}, nil
}

// Consume reads messages in a loop and calls handler for each.
// Commits offset only after successful handler execution.
func (c *Consumer) Consume(ctx context.Context, handler func([]byte) error) error {
	defer c.consumer.Close()

	for {
		select {
		case <-ctx.Done():
			c.log.Info("Kafka consumer stopping")
			return nil
		default:
		}

		msg, err := c.consumer.ReadMessage(100 * time.Millisecond)
		if err != nil {
			if err.(kafka.Error).Code() == kafka.ErrTimedOut {
				continue
			}
			c.log.Error("Kafka read error", zap.Error(err))
			continue
		}

		c.log.Debug("Kafka message received",
			zap.String("topic", *msg.TopicPartition.Topic),
			zap.Int32("partition", msg.TopicPartition.Partition),
			zap.Int64("offset", int64(msg.TopicPartition.Offset)),
		)

		if err := handler(msg.Value); err != nil {
			c.log.Error("Message handler error",
				zap.Error(err),
				zap.ByteString("key", msg.Key),
			)
			// Don't commit on error — message will be reprocessed
			continue
		}

		// Commit offset after successful processing
		if _, err := c.consumer.CommitMessage(msg); err != nil {
			c.log.Warn("Failed to commit Kafka offset", zap.Error(err))
		}
	}
}
