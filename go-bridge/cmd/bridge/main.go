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
	"encoding/json"
	"fmt"
	"log/slog"
	"net/http"
	"os"
	"os/signal"
	"strconv"
	"syscall"
	"time"

	"github.com/paygate/go-bridge/internal/apisix"
	"github.com/paygate/go-bridge/internal/dapr"
	"github.com/paygate/go-bridge/internal/fluvio"
	"github.com/paygate/go-bridge/internal/keycloak"
	"github.com/paygate/go-bridge/internal/pgdb"
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

	// Keycloak init
	keycloak.Init()
	slog.Info("Keycloak client initialised")

	// Dapr init
	dapr.Init()
	slog.Info("Dapr client initialised")

	// APISIX init
	apisix.Init()
	slog.Info("APISIX client initialised")

	// Kafka consumer init — start consuming inbound events
	kafkaConsumer := kafka.NewDefaultConsumer()

	// Fluvio SSE consumer init
	sseConsumer := fluvio.GetSSEConsumer()

	// Start background workers
	ctxWorkers, cancelWorkers := context.WithCancel(context.Background())
	defer cancelWorkers()
	go kafkaConsumer.Start(ctxWorkers)
	go sseConsumer.Start(ctxWorkers)

	// Register APISIX routes (non-blocking, best-effort)
	go func() {
		if err := apisix.RegisterPayGateRoutes(context.Background()); err != nil {
			slog.Warn("APISIX route registration failed", "err", err)
		}
	}()

	// Ensure pgdb is used (suppress unused import)
	_ = pgdb.Get

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

	// ── Fluvio SSE stream endpoint ──────────────────────────────────────────────
	// Clients subscribe to GET /v1/stream/events for real-time SSE updates
	mux.HandleFunc("GET /v1/stream/events", authMiddleware(sseConsumer.ServeSSE))

	// ── Dapr subscription config endpoint ────────────────────────────────────────
	// Required by Dapr sidecar to discover which topics this app subscribes to
	mux.HandleFunc("GET /dapr/subscribe", func(w http.ResponseWriter, r *http.Request) {
		w.Header().Set("Content-Type", "application/json")
		jsonBytes, _ := json.Marshal(dapr.DefaultSubscriptions())
		w.Write(jsonBytes)
	})

	// Temporal workflow observability
	mux.HandleFunc("GET /v1/workflows/active", authMiddleware(handlers.ListActiveWorkflows))
	mux.HandleFunc("GET /v1/workflows/{id}/status", authMiddleware(handlers.GetWorkflowStatus))
	mux.HandleFunc("POST /v1/workflows/{id}/terminate", authMiddleware(handlers.TerminateWorkflow))
	// Fraud ring escalation workflow
	mux.HandleFunc("POST /v1/workflows/fraud-ring-escalation", authMiddleware(handlers.StartFraudRingEscalationWorkflow))

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

	// ── Lending & Credit ────────────────────────────────────────────────────
	mux.HandleFunc("POST /v1/lending/applications", authMiddleware(handlers.CreateLoanApplication))
	mux.HandleFunc("POST /v1/lending/applications/{id}/disburse", authMiddleware(handlers.DisburseLoan))
	mux.HandleFunc("POST /v1/lending/applications/{id}/repay", authMiddleware(handlers.RecordLoanRepayment))
	mux.HandleFunc("GET /v1/lending/applications/{id}/status", authMiddleware(handlers.GetLoanStatus))

	// ── Split Payments ───────────────────────────────────────────────────────
	mux.HandleFunc("POST /v1/split-payments/rules", authMiddleware(handlers.CreateSplitRule))
	mux.HandleFunc("POST /v1/split-payments/execute", authMiddleware(handlers.ExecuteSplitPayment))
	mux.HandleFunc("GET /v1/split-payments/ledger", authMiddleware(handlers.GetSplitLedger))
	mux.HandleFunc("POST /v1/split-payments/settle", authMiddleware(handlers.TriggerSplitSettlement))

	// ── Dynamic Currency Conversion ──────────────────────────────────────────
	mux.HandleFunc("GET /v1/dcc/rate", authMiddleware(handlers.GetDCCRate))
	mux.HandleFunc("POST /v1/dcc/convert", authMiddleware(handlers.ExecuteDCCConversion))
	mux.HandleFunc("GET /v1/dcc/margin-config", authMiddleware(handlers.GetDCCMarginConfig))
	mux.HandleFunc("PUT /v1/dcc/margin-config", authMiddleware(handlers.UpdateDCCMarginConfig))

	// ── Invoices ─────────────────────────────────────────────────────────────
	mux.HandleFunc("POST /v1/invoices", authMiddleware(handlers.CreateInvoice))
	mux.HandleFunc("POST /v1/invoices/{id}/send", authMiddleware(handlers.SendInvoice))
	mux.HandleFunc("POST /v1/invoices/{id}/payment", authMiddleware(handlers.RecordInvoicePayment))
	mux.HandleFunc("GET /v1/invoices/{id}", authMiddleware(handlers.GetInvoice))
	mux.HandleFunc("GET /v1/invoices", authMiddleware(handlers.ListMerchantInvoices))

	// ── Embedded Finance / Open Banking ──────────────────────────────────────────────
	mux.HandleFunc("POST /v1/embedded/sdk-token", authMiddleware(handlers.IssueSDKToken))
	mux.HandleFunc("POST /v1/embedded/open-banking/data", authMiddleware(handlers.GetOpenBankingData))
	mux.HandleFunc("POST /v1/embedded/webhooks/register", authMiddleware(handlers.RegisterWebhookEndpoint))

	// ── Tier 6: Insurance Premium Collection ────────────────────────────────
	mux.HandleFunc("GET /insurance/products", authMiddleware(handlers.GetInsuranceProducts))
	mux.HandleFunc("POST /insurance/enroll", authMiddleware(handlers.EnrollInsuranceCustomer))
	mux.HandleFunc("POST /insurance/collect-premium", authMiddleware(handlers.CollectInsurancePremium))
	mux.HandleFunc("GET /insurance/policies", authMiddleware(handlers.GetInsurancePolicies))
	mux.HandleFunc("POST /insurance/claim", authMiddleware(handlers.FileInsuranceClaim))
	// ── Tier 6: Carbon Credit Marketplace ────────────────────────────────────
	mux.HandleFunc("GET /carbon/listings", authMiddleware(handlers.GetCarbonListings))
	mux.HandleFunc("POST /carbon/purchase", authMiddleware(handlers.PurchaseCarbonCredits))
	mux.HandleFunc("GET /carbon/certificates", authMiddleware(handlers.GetCarbonCertificates))
	mux.HandleFunc("GET /carbon/emissions-report", authMiddleware(handlers.GetCarbonEmissionsReport))
	// ── Tier 6: NFT Loyalty Badges ────────────────────────────────────────────
	mux.HandleFunc("POST /nft/create-collection", authMiddleware(handlers.CreateNFTCollection))
	mux.HandleFunc("POST /nft/mint", authMiddleware(handlers.MintNFTBadge))
	mux.HandleFunc("GET /nft/collections", authMiddleware(handlers.GetNFTCollections))
	mux.HandleFunc("GET /nft/customer-badges", authMiddleware(handlers.GetCustomerNFTBadges))
	// ── Tier 6: BNPL v2 ───────────────────────────────────────────────────────
	mux.HandleFunc("GET /bnpl-v2/eligibility", authMiddleware(handlers.CheckBNPLv2Eligibility))
	mux.HandleFunc("POST /bnpl-v2/create-loan", authMiddleware(handlers.CreateBNPLv2Loan))
	mux.HandleFunc("GET /bnpl-v2/loans", authMiddleware(handlers.GetBNPLv2Loans))
	mux.HandleFunc("POST /bnpl-v2/repayment", authMiddleware(handlers.RecordBNPLv2Repayment))
	// ── Tier 6: Crypto On/Off Ramp ────────────────────────────────────────────
	mux.HandleFunc("GET /crypto-ramp/quote", authMiddleware(handlers.GetCryptoRampQuote))
	mux.HandleFunc("POST /crypto-ramp/execute", authMiddleware(handlers.ExecuteCryptoRamp))
	mux.HandleFunc("GET /crypto-ramp/wallets", authMiddleware(handlers.GetCryptoWallets))
	mux.HandleFunc("GET /crypto-ramp/transactions", authMiddleware(handlers.GetCryptoTransactions))
	// ── Tier 7: Escrow Service ────────────────────────────────────────────────
	mux.HandleFunc("POST /escrow/create", authMiddleware(handlers.CreateEscrow))
	mux.HandleFunc("POST /escrow/fund", authMiddleware(handlers.FundEscrow))
	mux.HandleFunc("POST /escrow/release", authMiddleware(handlers.ReleaseEscrow))
	mux.HandleFunc("POST /escrow/dispute", authMiddleware(handlers.DisputeEscrow))
	mux.HandleFunc("GET /escrow/list", authMiddleware(handlers.ListEscrows))
	// ── Tier 7: Bulk Payment Scheduler ───────────────────────────────────────
	mux.HandleFunc("POST /bulk-scheduler/create", authMiddleware(handlers.CreateBulkSchedule))
	mux.HandleFunc("GET /bulk-scheduler/list", authMiddleware(handlers.ListBulkSchedules))
	mux.HandleFunc("GET /bulk-scheduler/results", authMiddleware(handlers.GetBulkScheduleResults))
	mux.HandleFunc("POST /bulk-scheduler/cancel", authMiddleware(handlers.CancelBulkSchedule))
	// ── Tier 7: Tax Withholding Engine ───────────────────────────────────────
	mux.HandleFunc("GET /tax/calculate", authMiddleware(handlers.CalculateTax))
	mux.HandleFunc("GET /tax/summary", authMiddleware(handlers.GetTaxSummary))
	mux.HandleFunc("POST /tax/remit", authMiddleware(handlers.RemitTax))
	mux.HandleFunc("POST /tax/certificate", authMiddleware(handlers.GetTaxCertificate))
	// ── Tier 7: Regulatory Sandbox ────────────────────────────────────────────
	mux.HandleFunc("GET /regulatory-sandbox/scenarios", authMiddleware(handlers.GetRegulatoryScenarios))
	mux.HandleFunc("POST /regulatory-sandbox/enable", authMiddleware(handlers.EnableRegulatorySandbox))
	mux.HandleFunc("GET /regulatory-sandbox/status", authMiddleware(handlers.GetRegulatorySandboxStatus))
	mux.HandleFunc("POST /regulatory-sandbox/run-scenario", authMiddleware(handlers.RunRegulatoryScenario))
	mux.HandleFunc("POST /regulatory-sandbox/submit", authMiddleware(handlers.SubmitRegulatoryReport))
	// ── Tier 7: Multi-Currency Wallet v2 ─────────────────────────────────────
	mux.HandleFunc("GET /multi-wallet/balances", authMiddleware(handlers.GetMultiWalletBalances))
	mux.HandleFunc("POST /multi-wallet/create", authMiddleware(handlers.CreateMultiWallet))
	mux.HandleFunc("POST /multi-wallet/convert", authMiddleware(handlers.ConvertMultiWallet))
	mux.HandleFunc("POST /multi-wallet/sweep", authMiddleware(handlers.SweepMultiWallet))
	mux.HandleFunc("GET /multi-wallet/history", authMiddleware(handlers.GetMultiWalletHistory))
	// ── Tier 8: RTGS ─────────────────────────────────────────────────────────
	mux.HandleFunc("POST /rtgs/initiate", authMiddleware(handlers.InitiateRTGS))
	mux.HandleFunc("GET /rtgs/status", authMiddleware(handlers.GetRTGSStatus))
	mux.HandleFunc("GET /rtgs/limits", authMiddleware(handlers.GetRTGSLimits))
	mux.HandleFunc("GET /rtgs/history", authMiddleware(handlers.GetRTGSHistory))
	// ── Tier 8: ISO 20022 ─────────────────────────────────────────────────────
	mux.HandleFunc("POST /iso20022/send", authMiddleware(handlers.SendISO20022Message))
	mux.HandleFunc("GET /iso20022/messages", authMiddleware(handlers.GetISO20022Messages))
	mux.HandleFunc("GET /iso20022/schema", authMiddleware(handlers.GetISO20022Schema))
	mux.HandleFunc("POST /iso20022/acknowledge", authMiddleware(handlers.AcknowledgeISO20022))
	// ── Tier 8: Open Finance Hub ──────────────────────────────────────────────
	mux.HandleFunc("GET /open-finance/providers", authMiddleware(handlers.GetOpenFinanceProviders))
	mux.HandleFunc("POST /open-finance/connect", authMiddleware(handlers.ConnectOpenFinanceProvider))
	mux.HandleFunc("GET /open-finance/data", authMiddleware(handlers.GetOpenFinanceData))
	mux.HandleFunc("POST /open-finance/revoke", authMiddleware(handlers.RevokeOpenFinanceConnection))
	// ── Tier 8: White-Label SDK ───────────────────────────────────────────────
	mux.HandleFunc("GET /white-label/config", authMiddleware(handlers.GetWhiteLabelConfig))
	mux.HandleFunc("POST /white-label/update-branding", authMiddleware(handlers.UpdateWhiteLabelBranding))
	mux.HandleFunc("POST /white-label/rotate-key", authMiddleware(handlers.RotateWhiteLabelKey))
	mux.HandleFunc("GET /white-label/analytics", authMiddleware(handlers.GetWhiteLabelAnalytics))
	mux.HandleFunc("GET /white-label/integration-guide", authMiddleware(handlers.GetWhiteLabelIntegrationGuide))
	// ── Tier 8: Super App Shell ───────────────────────────────────────────────
	mux.HandleFunc("GET /super-app/config", authMiddleware(handlers.GetSuperAppConfig))
	mux.HandleFunc("POST /super-app/update-modules", authMiddleware(handlers.UpdateSuperAppModules))
	mux.HandleFunc("POST /super-app/push-update", authMiddleware(handlers.PushSuperAppUpdate))
	mux.HandleFunc("GET /super-app/stats", authMiddleware(handlers.GetSuperAppStats))
	// ── Tier 8: Lakehouse v2 ──────────────────────────────────────────────────
	mux.HandleFunc("GET /lakehouse-v2/datasets", authMiddleware(handlers.GetLakehouseDatasets))
	mux.HandleFunc("POST /lakehouse-v2/query", authMiddleware(handlers.QueryLakehouse))
	mux.HandleFunc("GET /lakehouse-v2/sample", authMiddleware(handlers.SampleLakehouseDataset))
	mux.HandleFunc("POST /lakehouse-v2/export", authMiddleware(handlers.ExportLakehouseData))
	mux.HandleFunc("POST /lakehouse-v2/save-query", authMiddleware(handlers.SaveLakehouseQuery))
	mux.HandleFunc("GET /lakehouse-v2/saved-queries", authMiddleware(handlers.GetSavedLakehouseQueries))
	// ── Tier 8: Payroll v2 ────────────────────────────────────────────────────
	mux.HandleFunc("POST /payroll-v2/run", authMiddleware(handlers.RunPayrollV2))
	mux.HandleFunc("GET /payroll-v2/runs", authMiddleware(handlers.GetPayrollRuns))
	mux.HandleFunc("POST /payroll-v2/approve", authMiddleware(handlers.ApprovePayrollRun))
	mux.HandleFunc("GET /payroll-v2/payslip", authMiddleware(handlers.GetPayslipV2))
	mux.HandleFunc("POST /payroll-v2/pension-remittance", authMiddleware(handlers.RemitPensionV2))
	// ── Tier 8: Agent Banking v2 ──────────────────────────────────────────────
	mux.HandleFunc("POST /agent-banking-v2/onboard", authMiddleware(handlers.OnboardAgentV2))
	mux.HandleFunc("GET /agent-banking-v2/network", authMiddleware(handlers.GetAgentNetworkV2))
	mux.HandleFunc("POST /agent-banking-v2/fund-float", authMiddleware(handlers.FundAgentFloatV2))
	mux.HandleFunc("POST /agent-banking-v2/suspend", authMiddleware(handlers.SuspendAgentV2))
	mux.HandleFunc("GET /agent-banking-v2/performance", authMiddleware(handlers.GetAgentPerformanceV2))
	// ── Tier 8: Remittance v2 ─────────────────────────────────────────────────
	mux.HandleFunc("GET /remittance-v2/corridors", authMiddleware(handlers.GetRemittanceCorridors))
	mux.HandleFunc("GET /remittance-v2/quote", authMiddleware(handlers.GetRemittanceQuote))
	mux.HandleFunc("POST /remittance-v2/send", authMiddleware(handlers.SendRemittanceV2))
	mux.HandleFunc("GET /remittance-v2/track", authMiddleware(handlers.TrackRemittanceV2))
	mux.HandleFunc("GET /remittance-v2/history", authMiddleware(handlers.GetRemittanceHistory))
	// ── Tier 8: POS Terminal v2 ───────────────────────────────────────────────
	mux.HandleFunc("POST /pos-v2/provision", authMiddleware(handlers.ProvisionPOSTerminalV2))
	mux.HandleFunc("GET /pos-v2/terminals", authMiddleware(handlers.GetPOSTerminalsV2))
	mux.HandleFunc("GET /pos-v2/health", authMiddleware(handlers.GetPOSTerminalHealthV2))
	mux.HandleFunc("POST /pos-v2/push-config", authMiddleware(handlers.PushPOSConfigV2))
	mux.HandleFunc("GET /pos-v2/transactions", authMiddleware(handlers.GetPOSTransactionsV2))
	// ── Agent Banking (v3) ──────────────────────────────────────────────────
	agentH := handlers.NewAgentBankingHandler(pgdb.Get(), redis.Get(), kafka.GetProducer(), tb.Get())
	mux.HandleFunc("POST /agent/register", authMiddleware(agentH.RegisterAgent))
	mux.HandleFunc("POST /agent/{agentId}/float/topup", authMiddleware(agentH.TopUpFloat))
	mux.HandleFunc("POST /agent/{agentId}/deposit", authMiddleware(agentH.ProcessAgentDeposit))
	mux.HandleFunc("POST /agent/{agentId}/withdrawal", authMiddleware(agentH.ProcessAgentWithdrawal))
	mux.HandleFunc("POST /agent/{agentId}/commission", authMiddleware(agentH.RecordAgentCommission))
	mux.HandleFunc("GET /agent/network", authMiddleware(agentH.GetAgentNetwork))
	mux.HandleFunc("GET /agent/{agentId}/float", authMiddleware(agentH.GetFloatBalance))

	// ── Loyalty Merchant ────────────────────────────────────────────────────
	loyaltyH := handlers.NewLoyaltyMerchantHandler(pgdb.Get(), redis.Get(), kafka.GetProducer())
	mux.HandleFunc("POST /loyalty/configure", authMiddleware(loyaltyH.ConfigureLoyaltyProgram))
	mux.HandleFunc("GET /loyalty/analytics", authMiddleware(loyaltyH.GetLoyaltyAnalytics))
	mux.HandleFunc("POST /loyalty/coalition", authMiddleware(loyaltyH.CreateCoalition))
	mux.HandleFunc("GET /loyalty/redemption-stats", authMiddleware(loyaltyH.GetRedemptionStats))

	// ── SDK Relay ────────────────────────────────────────────────────────────
	sdkH := handlers.NewSDKRelayHandler(pgdb.Get(), redis.Get(), kafka.GetProducer())
	mux.HandleFunc("POST /sdk/keys", authMiddleware(sdkH.GenerateSDKKey))
	mux.HandleFunc("GET /sdk/keys", authMiddleware(sdkH.ListSDKIntegrations))
	mux.HandleFunc("GET /sdk/keys/{keyId}/analytics", authMiddleware(sdkH.GetSDKAnalytics))
	mux.HandleFunc("POST /sdk/keys/{keyId}/rotate", authMiddleware(sdkH.RotateSDKKey))
	mux.HandleFunc("POST /sdk/webhook/relay", authMiddleware(sdkH.RelayWebhook))

	// ── New Feature Routes ────────────────────────────────────────────────────
	// Digital Gold
	mux.HandleFunc("GET /digital-gold/holdings", authMiddleware(handlers.GetDigitalGoldHoldings))
	mux.HandleFunc("POST /digital-gold/buy", authMiddleware(handlers.BuyDigitalGold))
	mux.HandleFunc("POST /digital-gold/sell", authMiddleware(handlers.SellDigitalGold))
	mux.HandleFunc("GET /digital-gold/history", authMiddleware(handlers.GetDigitalGoldHistory))
	mux.HandleFunc("POST /digital-gold/sip/create", authMiddleware(handlers.CreateGoldSIP))
	// Mutual Funds
	mux.HandleFunc("GET /mutual-funds/list", authMiddleware(handlers.ListMutualFunds))
	mux.HandleFunc("GET /mutual-funds/details", authMiddleware(handlers.GetMutualFundDetails))
	mux.HandleFunc("POST /mutual-funds/invest", authMiddleware(handlers.InvestInMutualFund))
	mux.HandleFunc("GET /mutual-funds/portfolio", authMiddleware(handlers.GetMutualFundPortfolio))
	mux.HandleFunc("POST /mutual-funds/redeem", authMiddleware(handlers.RedeemMutualFund))
	// Consumer Insurance
	mux.HandleFunc("GET /consumer-insurance/products", authMiddleware(handlers.ListInsuranceProducts))
	mux.HandleFunc("POST /consumer-insurance/purchase", authMiddleware(handlers.PurchaseInsurancePolicy))
	mux.HandleFunc("GET /consumer-insurance/policies", authMiddleware(handlers.GetActivePolicies))
	mux.HandleFunc("POST /consumer-insurance/claim", authMiddleware(handlers.FileInsuranceClaim))
	mux.HandleFunc("GET /consumer-insurance/claims", authMiddleware(handlers.GetInsuranceClaims))
	// Pension / NPS
	mux.HandleFunc("GET /pension/account", authMiddleware(handlers.GetPensionAccount))
	mux.HandleFunc("POST /pension/contribute", authMiddleware(handlers.MakePensionContribution))
	mux.HandleFunc("GET /pension/statement", authMiddleware(handlers.GetPensionStatements))
	mux.HandleFunc("GET /pension/fund-performance", authMiddleware(handlers.ListPFAs))
	// Cashback & Rewards
	mux.HandleFunc("GET /cashback/balance", authMiddleware(handlers.GetCashbackBalance))
	mux.HandleFunc("GET /cashback/history", authMiddleware(handlers.GetCashbackTransactions))
	mux.HandleFunc("POST /cashback/redeem", authMiddleware(handlers.RedeemCashback))
	mux.HandleFunc("GET /cashback/merchant-config", authMiddleware(handlers.GetCashbackOffers))
	mux.HandleFunc("POST /cashback/merchant-config/update", authMiddleware(handlers.RedeemCashback))
	// Voice Payments (Soundbox)
	mux.HandleFunc("POST /soundbox/register", authMiddleware(handlers.RegisterSoundboxDevice))
	mux.HandleFunc("GET /soundbox/devices", authMiddleware(handlers.GetSoundboxDevices))
	mux.HandleFunc("POST /soundbox/configure", authMiddleware(handlers.UpdateSoundboxSettings))
	mux.HandleFunc("POST /soundbox/test-audio", authMiddleware(handlers.GetSoundboxPayments))
	mux.HandleFunc("GET /soundbox/stats", authMiddleware(handlers.GetSoundboxPayments))
	mux.HandleFunc("GET /soundbox/alerts", authMiddleware(handlers.GetSoundboxDevices))
	// Wealth Management
	mux.HandleFunc("GET /wealth/portfolio", authMiddleware(handlers.GetWealthPortfolio))
	mux.HandleFunc("GET /wealth/recommendations", authMiddleware(handlers.GetWealthRecommendations))
	mux.HandleFunc("GET /wealth/risk-profile", authMiddleware(handlers.GetWealthPortfolio))
	mux.HandleFunc("POST /wealth/risk-profile/set", authMiddleware(handlers.CreateWealthGoal))
	mux.HandleFunc("GET /wealth/goals", authMiddleware(handlers.GetWealthGoals))
	mux.HandleFunc("POST /wealth/goals/create", authMiddleware(handlers.CreateWealthGoal))
	// EMI Checkout
	mux.HandleFunc("GET /emi/plans", authMiddleware(handlers.GetEMIPlans))
	mux.HandleFunc("POST /emi/initiate", authMiddleware(handlers.CreateEMIApplication))
	mux.HandleFunc("GET /emi/schedule", authMiddleware(handlers.GetEMISchedule))
	mux.HandleFunc("GET /emi/merchant-config", authMiddleware(handlers.GetEMIPlans))
	mux.HandleFunc("POST /emi/merchant-config/update", authMiddleware(handlers.GetEMISchedule))
	// Bulk Collections
	mux.HandleFunc("POST /bulk-collections/create", authMiddleware(handlers.CreateBulkCollection))
	mux.HandleFunc("GET /bulk-collections/list", authMiddleware(handlers.ListBulkCollections))
	mux.HandleFunc("GET /bulk-collections/details", authMiddleware(handlers.ListBulkCollections))
	mux.HandleFunc("POST /bulk-collections/remind", authMiddleware(handlers.SendCollectionReminders))
	mux.HandleFunc("GET /bulk-collections/export", authMiddleware(handlers.GetCollectionAnalytics))
	// API Docs Portal
	mux.HandleFunc("GET /api-docs/list", authMiddleware(handlers.GetReportTemplates))
	mux.HandleFunc("GET /api-docs/endpoint", authMiddleware(handlers.GetReportTemplates))
	mux.HandleFunc("GET /api-docs/changelog", authMiddleware(handlers.ListReports))
	mux.HandleFunc("GET /api-docs/usage-stats", authMiddleware(handlers.GenerateReport))
	mux.HandleFunc("POST /api-docs/generate-key", authMiddleware(handlers.CreateScheduledReport))
	// Salary Accounts
	mux.HandleFunc("POST /salary-accounts/open", authMiddleware(handlers.CreateSalaryAccount))
	mux.HandleFunc("GET /salary-accounts/account", authMiddleware(handlers.ListSalaryAccounts))
	mux.HandleFunc("GET /salary-accounts/transactions", authMiddleware(handlers.ListSalaryAccounts))
	mux.HandleFunc("POST /salary-accounts/advance", authMiddleware(handlers.RequestSalaryAdvance))
	// Privacy Payments
	mux.HandleFunc("POST /privacy/generate-id", authMiddleware(handlers.CreatePrivatePayment))
	mux.HandleFunc("GET /privacy/settings", authMiddleware(handlers.GetPrivacySettings))
	mux.HandleFunc("POST /privacy/settings/update", authMiddleware(handlers.UpdatePrivacySettings))
	mux.HandleFunc("GET /privacy/history", authMiddleware(handlers.GetPrivateTransactions))
	// Reports Center
	mux.HandleFunc("POST /reports/transactions", authMiddleware(handlers.GenerateReport))
	mux.HandleFunc("POST /reports/settlements", authMiddleware(handlers.GenerateReport))
	mux.HandleFunc("POST /reports/customers", authMiddleware(handlers.GenerateReport))
	mux.HandleFunc("POST /reports/tax", authMiddleware(handlers.GenerateReport))
	mux.HandleFunc("GET /reports/list", authMiddleware(handlers.ListReports))
	mux.HandleFunc("GET /reports/scheduled", authMiddleware(handlers.ListReports))
	mux.HandleFunc("POST /reports/schedule", authMiddleware(handlers.CreateScheduledReport))
	// Nodal Accounts
	mux.HandleFunc("POST /nodal-accounts/create", authMiddleware(handlers.CreateNodalAccount))
	mux.HandleFunc("GET /nodal-accounts/list", authMiddleware(handlers.ListNodalAccounts))
	mux.HandleFunc("GET /nodal-accounts/transactions", authMiddleware(handlers.GetNodalTransactions))
	mux.HandleFunc("POST /nodal-accounts/transfer", authMiddleware(handlers.GetNodalTransactions))
	// Smart Retail POS
	mux.HandleFunc("GET /smart-retail/config", authMiddleware(handlers.ListPOSProducts))
	mux.HandleFunc("POST /smart-retail/sale", authMiddleware(handlers.ProcessRetailSale))
	mux.HandleFunc("GET /smart-retail/inventory-alerts", authMiddleware(handlers.UpdatePOSInventory))
	mux.HandleFunc("GET /smart-retail/daily-summary", authMiddleware(handlers.GetPOSSalesAnalytics))
	mux.HandleFunc("POST /smart-retail/print-receipt", authMiddleware(handlers.ProcessRetailSale))
	// International Remittance
	mux.HandleFunc("GET /intl-remittance/corridors", authMiddleware(handlers.GetRemittanceCorridors))
	mux.HandleFunc("GET /intl-remittance/quote", authMiddleware(handlers.GetRemittanceQuote))
	mux.HandleFunc("POST /intl-remittance/transfer", authMiddleware(handlers.CreateRemittance))
	mux.HandleFunc("GET /intl-remittance/track", authMiddleware(handlers.CreateRemittance))
	mux.HandleFunc("GET /intl-remittance/history", authMiddleware(handlers.GetRemittanceHistory))
	// Subscription Billing V2
	mux.HandleFunc("GET /subscriptions-v2/plans", authMiddleware(handlers.ListSubscriptionPlans))
	mux.HandleFunc("POST /subscriptions-v2/plans/create", authMiddleware(handlers.CreateSubscriptionPlan))
	mux.HandleFunc("GET /subscriptions-v2/subscribers", authMiddleware(handlers.ListSubscribers))
	mux.HandleFunc("POST /subscriptions-v2/cancel", authMiddleware(handlers.CancelSubscription))
	mux.HandleFunc("POST /subscriptions-v2/pause", authMiddleware(handlers.PauseSubscription))
	mux.HandleFunc("GET /subscriptions-v2/churn", authMiddleware(handlers.GetChurnAnalytics))

	// ── Tax Engine (Python: tax-engine:9013) ────────────────────────────────
	mux.HandleFunc("GET /tax-engine/calculate", authMiddleware(handlers.ProxyTaxEngineCalculate))
	mux.HandleFunc("GET /tax-engine/remittance", authMiddleware(handlers.ProxyTaxEngineRemittance))
	mux.HandleFunc("GET /tax-engine/rates", handlers.ProxyTaxEngineRates)
	// ── Carbon Oracle (Python: carbon-oracle:9011) ───────────────────────────
	mux.HandleFunc("GET /carbon-oracle/projects", authMiddleware(handlers.ProxyCarbonOracleProjects))
	mux.HandleFunc("GET /carbon-oracle/price", handlers.ProxyCarbonOraclePrice)
	mux.HandleFunc("POST /carbon-oracle/calculate", authMiddleware(handlers.ProxyCarbonOracleCalculate))
	mux.HandleFunc("POST /carbon-oracle/retire", authMiddleware(handlers.ProxyCarbonOracleRetire))

	// ── Server───────────────────────────────────────────────────────────────
	port := os.Getenv("BRIDGE_PORT")
	if port == "" {
		port = "8080"
	}


// ── Cross-Border Rails (CIPS / UPI / PIX / Mojaloop) ────────────────────────
mux.HandleFunc("POST /v1/cips/transfer", authMiddleware(handlers.ProxyCIPSTransfer))
mux.HandleFunc("GET /v1/cips/status", authMiddleware(handlers.GetCIPSTransferStatus))
mux.HandleFunc("GET /v1/cips/corridors", authMiddleware(handlers.GetCIPSCorridors))
mux.HandleFunc("GET /v1/cips/health", handlers.GetCIPSHealth)

mux.HandleFunc("POST /v1/upi/pay", authMiddleware(handlers.ProxyUPIPay))
mux.HandleFunc("POST /v1/upi/collect", authMiddleware(handlers.ProxyUPICollect))
mux.HandleFunc("GET /v1/upi/vpa/resolve", authMiddleware(handlers.ResolveUPIVPA))
mux.HandleFunc("GET /v1/upi/status", authMiddleware(handlers.GetUPITransferStatus))
mux.HandleFunc("GET /v1/upi/health", handlers.GetUPIHealth)

mux.HandleFunc("POST /v1/pix/payment", authMiddleware(handlers.ProxyPIXPayment))
mux.HandleFunc("POST /v1/pix/key/lookup", authMiddleware(handlers.LookupPIXKey))
mux.HandleFunc("GET /v1/pix/status", authMiddleware(handlers.GetPIXTransferStatus))
mux.HandleFunc("GET /v1/pix/health", handlers.GetPIXHealth)

mux.HandleFunc("POST /v1/mojaloop/transfer", authMiddleware(handlers.ProxyMojaloopTransfer))
mux.HandleFunc("GET /v1/mojaloop/quote", authMiddleware(handlers.GetMojaloopQuote))
mux.HandleFunc("GET /v1/mojaloop/parties", authMiddleware(handlers.GetMojaloopParties))
mux.HandleFunc("GET /v1/mojaloop/health", handlers.GetMojaloopHealth)

// ── OpenSearch ───────────────────────────────────────────────────────────────
mux.HandleFunc("POST /v1/opensearch/query", authMiddleware(handlers.ProxyOpenSearchQuery))
mux.HandleFunc("POST /v1/opensearch/index", authMiddleware(handlers.ProxyOpenSearchIndex))
mux.HandleFunc("GET /v1/opensearch/health", handlers.GetOpenSearchHealth)

// ── TigerBeetle Ledger ───────────────────────────────────────────────────────
mux.HandleFunc("GET /v1/ledger/accounts", authMiddleware(handlers.GetLedgerAccounts))
mux.HandleFunc("POST /v1/ledger/transfer", authMiddleware(handlers.CreateLedgerTransfer))
mux.HandleFunc("GET /v1/ledger/balance", authMiddleware(handlers.GetLedgerBalance))
mux.HandleFunc("GET /v1/ledger/health", handlers.GetLedgerHealth)

	srv := &http.Server{
		Addr:              ":" + port,
		Handler:           loggingMiddleware(mux),
		ReadTimeout:       30 * time.Second,
		ReadHeaderTimeout: 5 * time.Second,   // mitigate Slowloris attacks
		WriteTimeout:      60 * time.Second,  // allow long-running Temporal starts
		IdleTimeout:       120 * time.Second,
		MaxHeaderBytes:    1 << 20,           // 1 MB
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
