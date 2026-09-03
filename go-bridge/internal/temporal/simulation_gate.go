package temporal

import "os"

// allowSimulation reports whether simulated activity outcomes are explicitly
// enabled via ALLOW_SIMULATION=true. When false (the default), activities that
// would have silently simulated settlement / charges / payouts return
// retryable errors instead of reporting fake success.
func allowSimulation() bool {
	return os.Getenv("ALLOW_SIMULATION") == "true"
}
