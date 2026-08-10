// Package httpclient provides a single, tuned http.Client shared across all
// Go bridge handlers.  Using one client ensures connection pooling is
// effective: idle connections are reused across requests instead of being
// torn down and re-established on every call.
package httpclient

import (
	"net"
	"net/http"
	"time"
)

// Default is the shared HTTP client used by all bridge handlers.
// It is safe for concurrent use by multiple goroutines.
var Default = &http.Client{
	Timeout: 30 * time.Second,
	Transport: &http.Transport{
		// Connection pooling — sized for high-throughput production traffic
		MaxIdleConns:        200,
		MaxIdleConnsPerHost: 50,
		MaxConnsPerHost:     100,
		IdleConnTimeout:     90 * time.Second,

		// Dial & TLS timeouts
		DialContext: (&net.Dialer{
			Timeout:   5 * time.Second,
			KeepAlive: 30 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout:   10 * time.Second,
		ResponseHeaderTimeout: 20 * time.Second,
		ExpectContinueTimeout: 1 * time.Second,

		// Allow server-side gzip/br responses
		DisableCompression: false,
	},
}

// Fast is a lower-latency client for health checks and lightweight probes.
var Fast = &http.Client{
	Timeout: 5 * time.Second,
	Transport: &http.Transport{
		MaxIdleConns:        50,
		MaxIdleConnsPerHost: 10,
		IdleConnTimeout:     30 * time.Second,
		DialContext: (&net.Dialer{
			Timeout:   2 * time.Second,
			KeepAlive: 10 * time.Second,
		}).DialContext,
		TLSHandshakeTimeout: 5 * time.Second,
	},
}
