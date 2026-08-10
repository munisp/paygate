package temporal

import (
	"fmt"
	"os"
	"sync"

	"go.temporal.io/sdk/client"
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
		c, err := client.Dial(client.Options{
			HostPort:  hostPort,
			Namespace: "default",
		})
		if err != nil {
			clientInitErr = fmt.Errorf("temporal.GetClient: dial %s: %w", hostPort, err)
			return
		}
		globalClient = c
	})
	return globalClient, clientInitErr
}
