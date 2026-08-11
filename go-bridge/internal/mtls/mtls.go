// Package mtls provides mutual TLS enforcement middleware for the Go bridge.
// It validates client certificates against the CA cert for all inter-service calls.
package mtls

import (
	"crypto/tls"
	"crypto/x509"
	"fmt"
	"net/http"
	"os"
)

// Config holds mTLS configuration paths.
type Config struct {
	CACertPath     string
	ServerCertPath string
	ServerKeyPath  string
	ClientCertPath string
	ClientKeyPath  string
}

// DefaultConfig returns the standard cert paths used by the platform.
func DefaultConfig() Config {
	return Config{
		CACertPath:     "infra/certs/ca.crt",
		ServerCertPath: "infra/certs/server.crt",
		ServerKeyPath:  "infra/certs/server.key",
		ClientCertPath: "infra/certs/apisix-client.crt",
		ClientKeyPath:  "infra/certs/apisix-client.key",
	}
}

// NewServerTLSConfig creates a tls.Config for the server that requires and
// verifies client certificates signed by the platform CA.
func NewServerTLSConfig(cfg Config) (*tls.Config, error) {
	caCert, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: read CA cert: %w", err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("mtls: failed to parse CA cert")
	}
	serverCert, err := tls.LoadX509KeyPair(cfg.ServerCertPath, cfg.ServerKeyPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: load server cert: %w", err)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{serverCert},
		ClientCAs:    caPool,
		ClientAuth:   tls.RequireAndVerifyClientCert,
		MinVersion:   tls.VersionTLS13,
	}, nil
}

// NewClientTLSConfig creates a tls.Config for outbound HTTP clients that
// presents the platform client certificate to upstream services.
func NewClientTLSConfig(cfg Config) (*tls.Config, error) {
	caCert, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: read CA cert: %w", err)
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return nil, fmt.Errorf("mtls: failed to parse CA cert")
	}
	clientCert, err := tls.LoadX509KeyPair(cfg.ClientCertPath, cfg.ClientKeyPath)
	if err != nil {
		return nil, fmt.Errorf("mtls: load client cert: %w", err)
	}
	return &tls.Config{
		Certificates: []tls.Certificate{clientCert},
		RootCAs:      caPool,
		MinVersion:   tls.VersionTLS13,
	}, nil
}

// NewMTLSClient returns an *http.Client configured with the platform client cert.
// Falls back to standard TLS if cert files are not present (dev mode).
func NewMTLSClient(cfg Config) *http.Client {
	tlsCfg, err := NewClientTLSConfig(cfg)
	if err != nil {
		// Dev fallback: standard HTTP client
		return &http.Client{}
	}
	return &http.Client{
		Transport: &http.Transport{TLSClientConfig: tlsCfg},
	}
}

// Middleware returns an http.Handler middleware that enforces client cert validation.
// If the CA cert file is absent (dev mode), the middleware is a no-op.
func Middleware(cfg Config, next http.Handler) http.Handler {
	caCert, err := os.ReadFile(cfg.CACertPath)
	if err != nil {
		// Dev mode: no cert enforcement
		return next
	}
	caPool := x509.NewCertPool()
	if !caPool.AppendCertsFromPEM(caCert) {
		return next
	}
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		if r.TLS == nil || len(r.TLS.PeerCertificates) == 0 {
			http.Error(w, "mTLS: client certificate required", http.StatusUnauthorized)
			return
		}
		opts := x509.VerifyOptions{Roots: caPool}
		if _, err := r.TLS.PeerCertificates[0].Verify(opts); err != nil {
			http.Error(w, "mTLS: invalid client certificate", http.StatusForbidden)
			return
		}
		next.ServeHTTP(w, r)
	})
}
