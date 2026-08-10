// PayGate Billing — Go Event Ingestor (Wave 117)
// Consumes payment.completed events from Kafka/Fluvio/Dapr,
// runs the full billing pipeline: fetch config → compute fee (Rust billing-core) →
// persist billing_events to PostgreSQL → post double-entry ledger to TigerBeetle.

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
	"github.com/paygate/billing-engine/go-event-ingestor/internal/pipeline"
	"github.com/paygate/billing-engine/go-event-ingestor/internal/redis"
	"go.uber.org/zap"
)

func main() {
	log, _ := zap.NewProduction()
	defer log.Sync()

	cfg := loadConfig()

	// ── Initialize billing pipeline (PostgreSQL + billing-core + TigerBeetle) ──
	pipe, err := pipeline.NewPipeline(cfg.PostgresURL, cfg.BillingCoreURL, cfg.TigerBeetleAddress, log)
	if err != nil {
		log.Fatal("Failed to initialize billing pipeline", zap.Error(err))
	}
	defer pipe.Close()

	// Redis client (for caching billing results)
	rdb := redis.NewClient(cfg.RedisURL)

	// Dapr client (pub/sub + service invocation)
	daprClient := dapr.NewClient(cfg.DaprAppID, cfg.DaprHTTPPort)

	// Kafka consumer (falls back to Dapr pub/sub if unavailable)
	kConsumer, err := kafka.NewConsumer(kafka.Config{
		Brokers:  cfg.KafkaBrokers,
		GroupID:  cfg.KafkaGroupID,
		Topic:    cfg.KafkaTopicPaymentCompleted,
		Logger:   log,
	})
	if err != nil {
		log.Warn("Kafka unavailable — Dapr pub/sub will be used as fallback", zap.Error(err))
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
	if kConsumer != nil {
		go func() {
			if err := kConsumer.Consume(ctx, func(msg []byte) error {
				return processPaymentEvent(ctx, msg, pipe, rdb, daprClient, log)
			}); err != nil {
				log.Error("Kafka consumer error", zap.Error(err))
			}
		}()
		log.Info("Kafka consumer started",
			zap.String("topic", cfg.KafkaTopicPaymentCompleted),
		)
	}

	// Health check HTTP server
	gin.SetMode(gin.ReleaseMode)
	router := gin.New()
	router.Use(gin.Recovery())
	router.GET("/health", func(c *gin.Context) {
		metrics := pipe.GetMetrics(c.Request.Context())
		c.JSON(http.StatusOK, gin.H{
			"status":  "ok",
			"service": "billing-event-ingestor",
			"metrics": metrics,
		})
	})

	// Manual trigger for testing/backfill
	router.POST("/admin/process-event", func(c *gin.Context) {
		var payload json.RawMessage
		if err := c.ShouldBindJSON(&payload); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
			return
		}
		if err := processPaymentEvent(c.Request.Context(), payload, pipe, rdb, daprClient, log); err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
			return
		}
		c.JSON(http.StatusOK, gin.H{"status": "processed"})
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
		if err := processPaymentEvent(c.Request.Context(), envelope.Data, pipe, rdb, daprClient, log); err != nil {
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

// processPaymentEvent runs the full billing pipeline for a single payment event.
func processPaymentEvent(
	ctx context.Context,
	payload []byte,
	pipe *pipeline.Pipeline,
	rdb *redis.Client,
	daprClient *dapr.Client,
	log *zap.Logger,
) error {
	// Run the full pipeline: fetch config → compute fee → persist → TigerBeetle
	if err := pipe.Process(ctx, payload); err != nil {
		return err
	}

	// Cache processed flag in Redis for idempotency and dashboard queries
	if rdb != nil {
		var event struct {
			EventID string `json:"event_id"`
		}
		if err := json.Unmarshal(payload, &event); err == nil && event.EventID != "" {
			cacheKey := fmt.Sprintf("billing:processed:%s", event.EventID)
			rdb.SetEX(ctx, cacheKey, "1", 24*time.Hour)
		}
	}

	// Publish billing.computed event via Dapr for downstream consumers
	if daprClient != nil {
		daprClient.PublishEvent(ctx, "paygate-pubsub", "billing.computed", payload)
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
	PostgresURL                string
	RedisURL                   string
	BillingCoreURL             string
	TigerBeetleAddress         string
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
		ServerPort:                 getEnv("SERVER_PORT", "8094"),
		PostgresURL:                getEnv("PG_DATABASE_URL", "postgres://postgres:postgres@localhost:5432/paygate?sslmode=disable"),
		RedisURL:                   getEnv("REDIS_URL", "redis://localhost:6379"),
		BillingCoreURL:             getEnv("BILLING_CORE_URL", "http://localhost:8093"),
		TigerBeetleAddress:         getEnv("TIGERBEETLE_ADDRESS", ""),
		KafkaBrokers:               getEnv("KAFKA_BROKERS", "localhost:9092"),
		KafkaGroupID:               getEnv("KAFKA_GROUP_ID", "billing-ingestor"),
		KafkaTopicPaymentCompleted: getEnv("KAFKA_TOPIC_PAYMENT_COMPLETED", "payment.completed"),
		DaprAppID:                  getEnv("DAPR_APP_ID", "billing-core"),
		DaprHTTPPort:               getEnv("DAPR_HTTP_PORT", "3500"),
	}
}
