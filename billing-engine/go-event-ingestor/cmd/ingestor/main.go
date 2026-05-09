// PayGate Billing — Go Event Ingestor
// Consumes payment.completed events from Kafka and Fluvio,
// enriches them with tenant billing config from Redis/PostgreSQL,
// and forwards to the Rust Billing Core via Dapr service invocation.

package main

import (
	"context"
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"os/signal"
	"syscall"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/paygate/billing-engine/go-event-ingestor/internal/dapr"
	"github.com/paygate/billing-engine/go-event-ingestor/internal/kafka"
	"github.com/paygate/billing-engine/go-event-ingestor/internal/redis"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg := loadConfig()

	// Redis client
	rdb := redis.NewClient(cfg.RedisURL)

	// Dapr client (service invocation to Rust billing core)
	daprClient := dapr.NewClient(cfg.DaprAppID, cfg.DaprHTTPPort)

	// Kafka consumer
	kConsumer, err := kafka.NewConsumer(kafka.Config{
		Brokers:  cfg.KafkaBrokers,
		GroupID:  cfg.KafkaGroupID,
		Topic:    cfg.KafkaTopicPaymentCompleted,
		Logger:   log,
	})
	if err != nil {
		log.Fatal("Failed to create Kafka consumer", zap.Error(err))
	}

	ctx, cancel := context.WithCancel(context.Background())
	defer cancel()

	// Graceful shutdown
	sigCh := make(chan os.Signal, 1)
	signal.Notify(sigCh, syscall.SIGINT, syscall.SIGTERM)
	go func() {
		<-sigCh
		log.Info("Shutting down...")
		cancel()
	}()

	// Start Kafka consumer loop
	go func() {
		if err := kConsumer.Consume(ctx, func(msg []byte) error {
			return processPaymentEvent(ctx, msg, rdb, daprClient, log)
		}); err != nil {
			log.Error("Kafka consumer error", zap.Error(err))
		}
	}()

	// Health check HTTP server
	router := gin.New()
	router.Use(gin.Recovery())
	router.GET("/health", func(c *gin.Context) {
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "go-event-ingestor",
		})
	})

	// Dapr pub/sub subscription endpoint
	router.GET("/dapr/subscribe", func(c *gin.Context) {
		c.JSON(http.StatusOK, []gin.H{
			{
				"pubsubname": "paygate-pubsub",
				"topic":      cfg.KafkaTopicPaymentCompleted,
				"route":      "/events/payment-completed",
			},
		})
	})

	router.POST("/events/payment-completed", func(c *gin.Context) {
		var envelope struct {
			Data json.RawMessage `json:"data"`
		}
		if err := c.ShouldBindJSON(&envelope); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := processPaymentEvent(c.Request.Context(), envelope.Data, rdb, daprClient, log); err != nil {
			log.Error("Dapr event processing error", zap.Error(err))
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "SUCCESS"})
	})

	srv := &http.Server{
		Addr:    fmt.Sprintf(":%s", cfg.ServerPort),
		Handler: router,
	}

	go func() {
		log.Info("HTTP server starting", zap.String("addr", srv.Addr))
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			log.Fatal("HTTP server error", zap.Error(err))
		}
	}()

	<-ctx.Done()
	shutdownCtx, shutdownCancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer shutdownCancel()
	srv.Shutdown(shutdownCtx)
	log.Info("Event ingestor stopped")
}

// processPaymentEvent deserializes a payment event, looks up the billing config,
// and forwards to the Rust billing core via Dapr.
func processPaymentEvent(
	ctx context.Context,
	payload []byte,
	rdb *redis.Client,
	daprClient *dapr.Client,
	log *zap.Logger,
) error {
	var event PaymentCompletedEvent
	if err := json.Unmarshal(payload, &event); err != nil {
		return fmt.Errorf("deserialize payment event: %w", err)
	}

	log.Info("Processing payment event",
		zap.String("event_id", event.EventID.String()),
		zap.String("tenant_id", event.TenantID.String()),
		zap.Int64("amount_kobo", event.AmountKobo),
	)

	// Forward to Rust billing core via Dapr service invocation
	reqBody, err := json.Marshal(map[string]interface{}{
		"event": event,
	})
	if err != nil {
		return fmt.Errorf("marshal billing request: %w", err)
	}

	resp, err := daprClient.InvokeMethod(ctx, "billing-core", "billing/compute", "POST", reqBody)
	if err != nil {
		return fmt.Errorf("dapr invoke billing-core: %w", err)
	}

	log.Info("Billing computed",
		zap.String("event_id", event.EventID.String()),
		zap.Int("response_len", len(resp)),
	)

	// Cache the billing result in Redis for real-time dashboard queries
	cacheKey := fmt.Sprintf("billing:result:%s", event.EventID.String())
	if err := rdb.SetEX(ctx, cacheKey, string(resp), 24*time.Hour); err != nil {
		log.Warn("Failed to cache billing result", zap.Error(err))
	}

	return nil
}

// PaymentCompletedEvent mirrors the Rust TransactionEvent struct.
type PaymentCompletedEvent struct {
	EventID        uuid.UUID `json:"event_id"`
	TenantID       uuid.UUID `json:"tenant_id"`
	MerchantID     uuid.UUID `json:"merchant_id"`
	ResellerID     *uuid.UUID `json:"reseller_id,omitempty"`
	TransactionID  uuid.UUID `json:"transaction_id"`
	AmountKobo     int64     `json:"amount_kobo"`
	Currency       string    `json:"currency"`
	Channel        string    `json:"channel"`
	Status         string    `json:"status"`
	OccurredAt     time.Time `json:"occurred_at"`
	IdempotencyKey string    `json:"idempotency_key"`
}

type Config struct {
	ServerPort                 string
	RedisURL                   string
	KafkaBrokers               string
	KafkaGroupID               string
	KafkaTopicPaymentCompleted string
	DaprAppID                  string
	DaprHTTPPort               string
}

func loadConfig() Config {
	getEnv := func(key, def string) string {
		if v := os.Getenv(key); v != "" {
			return v
		}
		return def
	}
	return Config{
		ServerPort:                 getEnv("SERVER_PORT", "8091"),
		RedisURL:                   getEnv("REDIS_URL", "redis://localhost:6379"),
		KafkaBrokers:               getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaGroupID:               getEnv("KAFKA_GROUP_ID", "billing-ingestor"),
		KafkaTopicPaymentCompleted: getEnv("KAFKA_TOPIC_PAYMENT_COMPLETED", "payment.completed"),
		DaprAppID:                  getEnv("DAPR_APP_ID", "billing-core"),
		DaprHTTPPort:               getEnv("DAPR_HTTP_PORT", "3500"),
	}
}
