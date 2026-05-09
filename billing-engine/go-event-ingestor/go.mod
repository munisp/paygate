module github.com/paygate/billing-engine/go-event-ingestor

go 1.22

require (
	github.com/confluentinc/confluent-kafka-go/v2 v2.4.0
	github.com/dapr/go-sdk v1.10.0
	github.com/redis/go-redis/v9 v9.5.1
	github.com/google/uuid v1.6.0
	github.com/jackc/pgx/v5 v5.6.0
	go.uber.org/zap v1.27.0
	go.opentelemetry.io/otel v1.26.0
	go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracegrpc v1.26.0
	go.opentelemetry.io/otel/sdk v1.26.0
	go.opentelemetry.io/otel/trace v1.26.0
	github.com/spf13/viper v1.19.0
	github.com/cloudevents/sdk-go/v2 v2.15.2
	github.com/gin-gonic/gin v1.10.0
)
