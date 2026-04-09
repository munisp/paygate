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

	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/handlers"
	"github.com/paygate/go-bridge/internal/kafka"
	"github.com/paygate/go-bridge/internal/permify"
	"github.com/paygate/go-bridge/internal/redis"
	tb "github.com/paygate/go-bridge/internal/tigerbeetle"
)

func main() {
	// ── Logging ──────────────────────────────────────────────────────────────
	slog.SetDefault(slog.New(slog.NewJSONHandler(os.Stdout, &slog.HandlerOptions{
		Level: slog.LevelInfo,
	})))

	// ── Startup env var validation ──────────────────────────────────────────
// Warn (not fatal) for optional but recommended env vars so the bridge
// starts in degraded mode rather than refusing to start entirely.
requiredEnvVars := []struct {
key     string
fatal   bool
purpose string
}{
{"BRIDGE_INTERNAL_KEY", false, "bearer token for portal→bridge auth (dev mode: skipped)"},
{"DATABASE_URL", true, "MySQL/TiDB connection string"},
}
recommendedEnvVars := []struct {
key     string
purpose string
}{
{"PORTAL_TRPC_URL", "portal tRPC URL for reconciler alert push"},
{"MIDDLEWARE_INTERNAL_KEY", "shared HMAC key for bridge→portal auth"},
{"TEMPORAL_HOST_PORT", "Temporal server address for settlement workflows"},
{"NIBSS_GATEWAY_URL", "NIBSS NIP gateway base URL"},
}
for _, ev := range requiredEnvVars {
if os.Getenv(ev.key) == "" {
if ev.fatal {
slog.Error("required env var missing", "key", ev.key, "purpose", ev.purpose)
os.Exit(1)
}
slog.Warn("optional env var not set — running in degraded mode", "key", ev.key, "purpose", ev.purpose)
}
}
for _, ev := range recommendedEnvVars {
if os.Getenv(ev.key) == "" {
slog.Warn("recommended env var not set", "key", ev.key, "purpose", ev.purpose)
}
}
slog.Info("env var validation complete")

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

	// Redis init
	redis.Init()
	slog.Info("Redis client initialised")

	// Kafka init
	kafka.GetProducer()
	slog.Info("Kafka producer initialised")

	// Fluvio init
	fluvio.Init()
	slog.Info("Fluvio producer initialised")

	// Permify init
	permify.Init()
	slog.Info("Permify client initialised")

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
	// NIBSS PTSP batch confirmation webhook (HMAC-verified, no auth middleware)
	mux.HandleFunc("POST /v1/pos/settlement/confirm", handlers.PTSPConfirmationWebhook)

	// Transaction operations
	mux.HandleFunc("POST /v1/transactions/record", authMiddleware(handlers.RecordTransaction))
	mux.HandleFunc("POST /v1/transactions/refund", authMiddleware(handlers.RefundTransaction))

	// Dispute operations
	mux.HandleFunc("POST /v1/disputes/submit", authMiddleware(handlers.SubmitDispute))
	mux.HandleFunc("POST /v1/disputes/resolve", authMiddleware(handlers.ResolveDispute))

	// FX operations
	mux.HandleFunc("POST /v1/fx/convert", authMiddleware(handlers.RecordFXConversion))

	// Fraud operations
	mux.HandleFunc("POST /v1/fraud/score", authMiddleware(handlers.ScoreFraud))
	mux.HandleFunc("POST /v1/fraud/alerts/{id}/acknowledge", authMiddleware(handlers.AcknowledgeFraudAlert))

	// KYC operations
	mux.HandleFunc("POST /v1/kyc/start", authMiddleware(handlers.StartKYCWorkflow))
	mux.HandleFunc("POST /v1/kyc/{id}/update-status", authMiddleware(handlers.UpdateKYCStatus))

	// BNPL operations
	mux.HandleFunc("POST /v1/bnpl/loans/create", authMiddleware(handlers.CreateBNPLLoan))
	mux.HandleFunc("POST /v1/bnpl/loans/{id}/instalment", authMiddleware(handlers.ProcessBNPLInstalment))

	// Virtual card operations
	mux.HandleFunc("POST /v1/virtual-cards/issue", authMiddleware(handlers.IssueVirtualCard))
	mux.HandleFunc("POST /v1/virtual-cards/{id}/freeze", authMiddleware(handlers.FreezeVirtualCard))
	mux.HandleFunc("POST /v1/virtual-cards/{id}/unfreeze", authMiddleware(handlers.UnfreezeVirtualCard))
	mux.HandleFunc("POST /v1/virtual-cards/{id}/terminate", authMiddleware(handlers.TerminateVirtualCard))

	// Payment link operations
	mux.HandleFunc("POST /v1/payment-links/create", authMiddleware(handlers.CreatePaymentLink))

	// Webhook delivery operations
	mux.HandleFunc("POST /v1/webhooks/deliver", authMiddleware(handlers.DeliverWebhook))
	mux.HandleFunc("POST /v1/webhooks/deliveries/{id}/retry", authMiddleware(handlers.RetryWebhookDelivery))

	// Mobile money reconciliation
	mux.HandleFunc("POST /v1/mobile-money/reconcile", authMiddleware(handlers.ReconcileMoMo))

	// Auth / role sync
	mux.HandleFunc("POST /v1/auth/sync-roles", authMiddleware(handlers.SyncRolesToPermify))

	// Temporal workflow observability
	mux.HandleFunc("GET /v1/workflows/active", authMiddleware(handlers.ListActiveWorkflows))
	mux.HandleFunc("GET /v1/workflows/{id}/status", authMiddleware(handlers.GetWorkflowStatus))
	mux.HandleFunc("POST /v1/workflows/{id}/terminate", authMiddleware(handlers.TerminateWorkflow))

	// Notifications
	mux.HandleFunc("POST /v1/notifications/payout-approval-email", authMiddleware(handlers.SendPayoutApprovalEmail))

	// NIP / NIBSS name enquiry
	mux.HandleFunc("POST /v1/nibss/name-enquiry", authMiddleware(handlers.NIPNameEnquiry))
	// USDC payout operations (native Solana engine)
	mux.HandleFunc("POST /v1/usdc/payout", authMiddleware(handlers.InitiateUSDCPayout))
	mux.HandleFunc("POST /v1/usdc/wallet/validate", authMiddleware(handlers.ValidateUSDCWallet))
	mux.HandleFunc("GET /v1/usdc/balance", authMiddleware(handlers.GetUSDCBalance))

	// Consumer wallet operations
	mux.HandleFunc("POST /v1/consumer/wallet/credit", authMiddleware(handlers.ConsumerWalletCredit))
	mux.HandleFunc("POST /v1/consumer/wallet/debit", authMiddleware(handlers.ConsumerWalletDebit))
	mux.HandleFunc("POST /v1/consumer/transfer/p2p", authMiddleware(handlers.ConsumerP2PTransfer))
	mux.HandleFunc("POST /v1/consumer/transfer/bank", authMiddleware(handlers.ConsumerBankTransfer))
	mux.HandleFunc("POST /v1/consumer/bill-pay", authMiddleware(handlers.ConsumerBillPay))
	mux.HandleFunc("POST /v1/consumer/fraud/score", authMiddleware(handlers.ConsumerFraudScore))
	mux.HandleFunc("POST /api/mobile/sync", authMiddleware(handlers.ConsumerMobileSync))

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
