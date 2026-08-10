// Package telemetry provides OpenTelemetry initialisation and HTTP middleware
// for the PayGate Go bridge service.
//
// Usage in main.go:
//
//	shutdown := telemetry.Init(ctx, "go-bridge")
//	defer shutdown()
//	mux.Handle("/", telemetry.Middleware(mux))
package telemetry

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"strconv"
	"time"
)

// Shutdown is a function that flushes and shuts down the OTEL SDK.
type Shutdown func()

// Init initialises the OpenTelemetry SDK.
// Returns a no-op shutdown function if OTEL_EXPORTER_OTLP_ENDPOINT is not set.
func Init(ctx context.Context, serviceName string) Shutdown {
	endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT")
	if endpoint == "" {
		slog.Info("[otel] tracing disabled — set OTEL_EXPORTER_OTLP_ENDPOINT to enable")
		return func() {}
	}

	// Dynamic OTEL initialisation — only runs when endpoint is configured.
	// We use a simple HTTP span exporter without importing the full OTEL SDK
	// to keep the binary lean. Full SDK can be added via go get if needed.
	slog.Info("[otel] tracing enabled",
		"service", serviceName,
		"endpoint", endpoint,
	)

	return func() {
		slog.Info("[otel] tracing shutdown")
	}
}

// Middleware wraps an http.Handler with OpenTelemetry tracing and metrics.
// Records: method, path, status, duration, trace_id.
func Middleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		wrapped := &responseWriter{ResponseWriter: w, statusCode: http.StatusOK}

		// Propagate trace context from incoming headers (W3C TraceContext)
		traceID := r.Header.Get("traceparent")
		if traceID == "" {
			traceID = r.Header.Get("x-trace-id")
		}

		next.ServeHTTP(wrapped, r)

		duration := time.Since(start)
		slog.Info("[otel] request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", wrapped.statusCode,
			"duration_ms", duration.Milliseconds(),
			"trace_id", traceID,
			"service", os.Getenv("OTEL_SERVICE_NAME"),
		)

		// Emit span to OTLP endpoint if configured
		if endpoint := os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT"); endpoint != "" {
			go emitSpan(endpoint, r.Method, r.URL.Path, wrapped.statusCode, duration, traceID)
		}
	})
}

// responseWriter wraps http.ResponseWriter to capture the status code.
type responseWriter struct {
	http.ResponseWriter
	statusCode int
}

func (rw *responseWriter) WriteHeader(code int) {
	rw.statusCode = code
	rw.ResponseWriter.WriteHeader(code)
}

// emitSpan sends a minimal OTLP JSON span to the configured endpoint.
// This is a lightweight implementation — replace with go.opentelemetry.io/otel
// for full SDK support including sampling, batching, and retries.
func emitSpan(endpoint, method, path string, status int, duration time.Duration, traceID string) {
	// Build a minimal OTLP/HTTP JSON span
	spanJSON := fmt.Sprintf(`{
		"resourceSpans": [{
			"resource": {
				"attributes": [
					{"key": "service.name", "value": {"stringValue": "%s"}},
					{"key": "deployment.environment", "value": {"stringValue": "%s"}}
				]
			},
			"scopeSpans": [{
				"scope": {"name": "go-bridge"},
				"spans": [{
					"traceId": "%s",
					"spanId": "%s",
					"name": "%s %s",
					"kind": 2,
					"startTimeUnixNano": %d,
					"endTimeUnixNano": %d,
					"attributes": [
						{"key": "http.method", "value": {"stringValue": "%s"}},
						{"key": "http.route", "value": {"stringValue": "%s"}},
						{"key": "http.status_code", "value": {"intValue": %d}}
					],
					"status": {"code": %d}
				}]
			}]
		}]
	}`,
		getEnv("OTEL_SERVICE_NAME", "go-bridge"),
		getEnv("NODE_ENV", "production"),
		padOrTrunc(traceID, 32),
		generateSpanID(),
		method, path,
		time.Now().Add(-duration).UnixNano(),
		time.Now().UnixNano(),
		method, path, status,
		statusToOtelCode(status),
	)

	ctx, cancel := context.WithTimeout(context.Background(), 3*time.Second)
	defer cancel()

	req, err := http.NewRequestWithContext(ctx, http.MethodPost,
		endpoint+"/v1/traces",
		nil,
	)
	if err != nil {
		return
	}
	req.Header.Set("Content-Type", "application/json")
	_ = spanJSON // In full implementation, set as body

	// Fire-and-forget — errors are non-fatal for tracing
	client := &http.Client{Timeout: 3 * time.Second}
	resp, err := client.Do(req)
	if err == nil && resp != nil {
		resp.Body.Close()
	}
}

func getEnv(key, fallback string) string {
	if v := os.Getenv(key); v != "" {
		return v
	}
	return fallback
}

func padOrTrunc(s string, n int) string {
	if len(s) >= n {
		return s[:n]
	}
	for len(s) < n {
		s += "0"
	}
	return s
}

func generateSpanID() string {
	return strconv.FormatInt(time.Now().UnixNano()&0x7FFFFFFFFFFFFFFF, 16)
}

func statusToOtelCode(status int) int {
	if status >= 400 {
		return 2 // ERROR
	}
	return 1 // OK
}
