// Command bridge is the PayGate middleware bridge service.
//
// It exposes an HTTP API that wraps TigerBeetle double-entry ledger operations
// for wallet debits, credits, balance queries, P2P transfers, and settlement
// triggers.
//
// Environment variables:
//
//	TIGERBEETLE_ADDRESS   TigerBeetle server address (default: 127.0.0.1:3902)
//	TIGERBEETLE_CLUSTER   TigerBeetle cluster ID (default: 0)
//	BRIDGE_PORT           HTTP listen port (default: 8080)
//	BRIDGE_INTERNAL_KEY   Bearer token for internal API authentication
package main

import (
	"context"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
	"github.com/paygate/go-bridge/internal/handlers"
)

func main() {
	// ── Logging ──────────────────────────────────────────────────────────────
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// ── TigerBeetle init ─────────────────────────────────────────────────────
	tbAddress := tb.DefaultTigerBeetleAddress()
	clusterID := uint64(0)
	if v := os.Getenv("TIGERBEETLE_CLUSTER"); v != "" {
		if n, err := strconv.ParseUint(v, 10, 64); err == nil {
			clusterID = n
		}
	}

	slog.Info("initialising TigerBeetle client",
		"address", tbAddress,
		"cluster_id", clusterID,
	)

	if err := tb.Init(tbAddress, clusterID); err != nil {
		slog.Error("TigerBeetle init failed", "err", err)
		os.Exit(1)
	}
	defer tb.Close()
	slog.Info("TigerBeetle client ready", "address", tbAddress)

	// ── HTTP router ──────────────────────────────────────────────────────────
	mux := http.NewServeMux()

	// Health check
	mux.HandleFunc("GET /health", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		fmt.Fprintf(w, `{"status":"ok","service":"paygate-bridge","tigerbeetle":"%s"}`, tbAddress)
	})

	// Wallet operations
	mux.HandleFunc("POST /v1/wallets/debit", authMiddleware(handlers.Debit))
	mux.HandleFunc("POST /v1/wallets/credit", authMiddleware(handlers.Credit))
	mux.HandleFunc("POST /v1/wallets/balance", authMiddleware(handlers.Balance))
	mux.HandleFunc("POST /v1/wallets/p2p-transfer", authMiddleware(handlers.P2PTransfer))

	// Settlement operations
	mux.HandleFunc("POST /v1/settlements/trigger", authMiddleware(handlers.TriggerSettlement))
	// NIBSS PTSP batch confirmation webhook (HMAC-verified, no auth middleware — uses X-NIBSS-Signature)
	mux.HandleFunc("POST /v1/pos/settlement/confirm", handlers.PTSPConfirmationWebhook)

	// ── Server ───────────────────────────────────────────────────────────────
	port := os.Getenv("BRIDGE_PORT")
	if port == "" {
		port = "8080"
	}

	srv := &http.Server{
		Addr:         ":" + port,
		Handler:      loggingMiddleware(mux),
		ReadTimeout:  30 * time.Second,
		WriteTimeout: 30 * time.Second,
		IdleTimeout:  120 * time.Second,
	}

	// Graceful shutdown
	quit := make(chan os.Signal, 1)
	signal.Notify(quit, syscall.SIGINT, syscall.SIGTERM)

	go func() {
		slog.Info("bridge listening", "port", port)
		if err := srv.ListenAndServe(); err != nil && err != http.ErrServerClosed {
			slog.Error("server error", "err", err)
			os.Exit(1)
		}
	}()

	<-quit
	slog.Info("shutting down bridge...")

	ctx, cancel := context.WithTimeout(context.Background(), 10*time.Second)
	defer cancel()
	if err := srv.Shutdown(ctx); err != nil {
		slog.Error("shutdown error", "err", err)
	}
	slog.Info("bridge stopped")
}

// authMiddleware validates the BRIDGE_INTERNAL_KEY bearer token.
// If BRIDGE_INTERNAL_KEY is not set, authentication is skipped (dev mode).
func authMiddleware(next http.HandlerFunc) http.HandlerFunc {
	key := os.Getenv("BRIDGE_INTERNAL_KEY")
	if key == "" {
		return next // no auth in dev mode
	}
	return func(w http.ResponseWriter, r *http.Request) {
		auth := r.Header.Get("Authorization")
		expected := "Bearer " + key
		if auth != expected {
			w.Header().Set("Content-Type", "application/json")
			w.WriteHeader(http.StatusUnauthorized)
			fmt.Fprintf(w, `{"error":"unauthorized","code":401}`)
			return
		}
		next(w, r)
	}
}

// loggingMiddleware logs each incoming request.
func loggingMiddleware(next http.Handler) http.Handler {
	return http.HandlerFunc(func(w http.ResponseWriter, r *http.Request) {
		start := time.Now()
		rw := &responseWriter{ResponseWriter: w, status: http.StatusOK}
		next.ServeHTTP(rw, r)
		slog.Info("request",
			"method", r.Method,
			"path", r.URL.Path,
			"status", rw.status,
			"duration_ms", time.Since(start).Milliseconds(),
		)
	})
}

type responseWriter struct {
	http.ResponseWriter
	status int
}

func (rw *responseWriter) WriteHeader(status int) {
	rw.status = status
	rw.ResponseWriter.WriteHeader(status)
}
