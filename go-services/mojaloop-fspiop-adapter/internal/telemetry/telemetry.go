// Package telemetry provides env-gated OpenTelemetry initialisation and HTTP
// middleware for PayGate Go services.
//
// Usage in main.go:
//
//	shutdown := telemetry.Init(context.Background(), "service-name")
//	defer shutdown(context.Background())
//	handler := telemetry.Middleware(mux)
package telemetry

import (
	"context"
	"log/slog"
	"net/http"
	"os"
	"time"

	"go.opentelemetry.io/contrib/instrumentation/net/http/otelhttp"
	"go.opentelemetry.io/otel"
	"go.opentelemetry.io/otel/attribute"
	"go.opentelemetry.io/otel/exporters/otlp/otlptrace/otlptracehttp"
	"go.opentelemetry.io/otel/propagation"
	"go.opentelemetry.io/otel/sdk/resource"
	sdktrace "go.opentelemetry.io/otel/sdk/trace"
	semconv "go.opentelemetry.io/otel/semconv/v1.26.0"
	"go.opentelemetry.io/otel/trace"
)

// Shutdown flushes and shuts down the OTEL SDK.
type Shutdown func(ctx context.Context)

// Init initialises the OpenTelemetry SDK with an OTLP/HTTP trace exporter.
// Env-gated: when OTEL_EXPORTER_OTLP_ENDPOINT is unset this is a no-op and
// Middleware is effectively passthrough (non-recording spans only).
func Init(ctx context.Context, serviceName string) Shutdown {
	if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") == "" {
		slog.Info("[otel] tracing disabled — set OTEL_EXPORTER_OTLP_ENDPOINT to enable",
			"service", serviceName)
		return func(context.Context) {}
	}

	exp, err := otlptracehttp.New(ctx)
	if err != nil {
		slog.Error("[otel] failed to create OTLP trace exporter", "error", err)
		return func(context.Context) {}
	}

	res, err := resource.Merge(
		resource.Default(),
		resource.NewWithAttributes(
			semconv.SchemaURL,
			semconv.ServiceName(serviceName),
			attribute.String("service.namespace", "paygate"),
			attribute.String("deployment.environment", getEnv("NODE_ENV", "production")),
		),
	)
	if err != nil {
		slog.Error("[otel] failed to build resource", "error", err)
		return func(context.Context) {}
	}

	tp := sdktrace.NewTracerProvider(
		sdktrace.WithBatcher(exp),
		sdktrace.WithResource(res),
	)
	otel.SetTracerProvider(tp)
	otel.SetTextMapPropagator(propagation.NewCompositeTextMapPropagator(
		propagation.TraceContext{},
		propagation.Baggage{},
	))

	slog.Info("[otel] tracing enabled",
		"service", serviceName,
		"endpoint", os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"),
	)

	return func(shutdownCtx context.Context) {
		ctx, cancel := context.WithTimeout(shutdownCtx, 5*time.Second)
		defer cancel()
		if err := tp.Shutdown(ctx); err != nil {
			slog.Error("[otel] tracer provider shutdown failed", "error", err)
		}
	}
}

// Middleware wraps an http.Handler with otelhttp tracing.
func Middleware(next http.Handler) http.Handler {
	return otelhttp.NewHandler(next, "http.server",
		otelhttp.WithPropagators(otel.GetTextMapPropagator()),
	)
}

// TenantAttrs sets the mandatory PayGate tenant attributes
// (paygate.tenant_id / paygate.merchant_id) on the span in ctx.
// Empty values are skipped.
func TenantAttrs(ctx context.Context, tenantID, merchantID string) {
	span := trace.SpanFromContext(ctx)
	if tenantID != "" {
		span.SetAttributes(attribute.String("paygate.tenant_id", tenantID))
	}
	if merchantID != "" {
		span.SetAttributes(attribute.String("paygate.merchant_id", merchantID))
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}
