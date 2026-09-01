package temporal

import (
	"fmt"
	"os"
	"sync"

	"go.temporal.io/sdk/client"
	otelcontrib "go.temporal.io/sdk/contrib/opentelemetry"
	"go.temporal.io/sdk/interceptor"
)

// TaskQueue is the Temporal task queue name used by all PayGate workflows.
const TaskQueue = "paygate-default"

var (
	once          sync.Once
	globalClient  client.Client
	clientInitErr error
)

// GetClient returns a singleton Temporal client, initializing it on first call.
// Returns an error if TEMPORAL_HOST_PORT is not set or the connection fails.
func GetClient() (client.Client, error) {
	once.Do(func() {
		hostPort := os.Getenv("TEMPORAL_HOST_PORT")
		if hostPort == "" {
			hostPort = "localhost:7233"
		}
		opts := client.Options{
			HostPort:  hostPort,
			Namespace: "default",
		}
		// Env-gated OpenTelemetry tracing interceptor: propagates W3C trace
		// context through workflow/activity boundaries. No-op when
		// OTEL_EXPORTER_OTLP_ENDPOINT is unset.
		if os.Getenv("OTEL_EXPORTER_OTLP_ENDPOINT") != "" {
			ti, err := otelcontrib.NewTracingInterceptor(otelcontrib.TracerOptions{})
			if err != nil {
				clientInitErr = fmt.Errorf("temporal.GetClient: otel interceptor: %w", err)
				return
			}
			opts.Interceptors = []interceptor.ClientInterceptor{ti}
		}
		c, err := client.Dial(opts)
		if err != nil {
			clientInitErr = fmt.Errorf("temporal.GetClient: dial %s: %w", hostPort, err)
			return
		}
		globalClient = c
	})
	return globalClient, clientInitErr
}
