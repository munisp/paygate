# PayGate Merchant Portal — TODO

## Database

- [x] Switch driver from mysql2 to postgres (drizzle-orm/node-postgres)
- [x] Rewrite schema.ts with pgTable / pgEnum
- [x] Update drizzle.config.ts dialect to postgresql
- [x] Run pnpm db:push against PostgreSQL

## Middleware Gap Closure

- [x] TigerBeetle: Rust client crate with CGo FFI bridge
- [x] TigerBeetle: add `tigerbeetle-go` to go.mod with CGo support
- [x] Go bridge: write `cmd/bridge/main.go` entry point
- [x] Go bridge: Dockerfile for bridge sidecar
- [x] Portal: import middlewareRouter into server/routers.ts
- [x] Portal: add MIDDLEWARE_BRIDGE_URL env var

## Backend tRPC Procedures

- [x] transactions: list, get, create, stats
- [x] customers: list, get, create, stats
- [x] payouts: list, get, create, approve
- [x] analytics: overview, revenue, volume, fraud
- [x] apiKeys: list, create, revoke
- [x] webhooks: list, create, delete, test
- [x] disputes: list, get, submit, respond
- [x] virtualCards: list, create, freeze, unfreeze
- [x] paymentLinks: list, create, deactivate
- [x] settings: get, update (business, bank, notifications)
- [x] team: list members, invite, update role, remove
- [x] onboarding: getStatus, completeStep

## PWA

- [x] Generate all 8 icon sizes (72–512px)
- [x] Upload icons to CDN
- [x] Fix manifest.webmanifest icon paths
- [x] Verify service worker offline page

## Mobile App

- [x] Update API base URL to portal backend
- [x] Implement JWT auth flow (login → token → storage)
- [x] Wire transactions screen to live API
- [x] Wire dashboard screen to live API

## Demo Data Seed
- [x] Write seed.mjs script with realistic merchants, customers, transactions, payouts, disputes, API keys, webhooks
- [x] Run seed against local PostgreSQL
- [x] Verify all dashboard pages render with data

## Production Secrets
- [x] Request DATABASE_URL (PostgreSQL production connection string)
- [x] Request MIDDLEWARE_BRIDGE_URL (Go sidecar URL)
- [x] Request MIDDLEWARE_INTERNAL_KEY (shared secret for bridge auth)

## Expanded Test Suite
- [x] transactions.list — pagination, filtering by status/date
- [x] payouts.create — validates amount, currency, bank details
- [x] onboarding.createMerchant — creates merchant + sets onboarding step
- [x] customers.list — returns paginated customer list
- [x] apiKeys.create / revoke — full lifecycle test

## Live Data Wiring (all pages currently use static/hardcoded data)
- [x] Dashboard.tsx — connect to trpc.dashboard.overview (KPIs + charts)
- [x] Analytics.tsx — connect to trpc.analytics.overview + timeSeries
- [x] Transactions.tsx — connect to trpc.transactions.list with pagination/filter
- [x] Payouts.tsx — connect to trpc.payouts.list + trpc.payouts.create
- [x] Customers.tsx — connect to trpc.customers.list
- [x] APIKeys.tsx — connect to trpc.apiKeys.list + create + revoke
- [x] Webhooks.tsx — connect to trpc.webhooks.list + create + delete + delivery log
- [x] Disputes.tsx — connect to trpc.disputes.list
- [x] VirtualCards.tsx — connect to trpc.virtualCards.list + create
- [x] PaymentLinks.tsx — connect to trpc.paymentLinks.list + create
- [x] Settings.tsx — connect to trpc.settings.get + update
- [x] TeamRoles.tsx — connect to trpc.team.list + invite + remove

## Webhook Delivery Log
- [x] Add webhook_deliveries table to schema
- [x] Run pnpm db:push for new table
- [x] Add delivery log tRPC procedures
- [x] Show delivery history in Webhooks.tsx UI

## Non-Merchant Features (audit)
- [x] BNPL.tsx — currently all static UI, no backend
- [x] FXDashboard.tsx — static FX rates, no live data
- [x] FraudRisk.tsx — static risk scores, no backend
- [x] MobileMoneyRecon.tsx — static reconciliation data
- [x] ComplianceKYC.tsx — static KYC status
- [x] Checkout.tsx — static checkout flow demo
- [x] DisputeWorkflow.tsx — static workflow steps

## Merchant Portal — Wave 3
- [x] Real-time owner notifications on fraud alert + KYC status change
- [x] FX rate fetcher: fx_rates table + scheduled tRPC + FXDashboard live data
- [x] Transaction CSV export (transactions.export + download handler)

## Archive PWA Integration
- [x] WebAuthn biometric auth in portal login/settings
- [x] QR payment generation page in portal
- [x] UniversalSearch in portal header
- [x] SecurityDashboard page in portal
- [x] Service worker offline support
- [x] PaymentRequestButton (Apple/Google Pay) in checkout

## Consumer PWA (separate app)
- [x] Scaffold consumer PWA Vite project
- [x] Consumer wallet dashboard
- [x] P2P transfer page
- [x] QR payments page
- [x] Bill pay page
- [x] BNPL checkout page
- [x] Consumer auth (login/signup/onboarding)
- [x] Wire consumer tRPC backend procedures

## Developer Portal
- [x] SDK inventory page (JS/Node/Python/PHP/Android/iOS)
- [x] Developer portal page with API docs and sandbox

## Language-Specific Implementations (Go / Rust / Python)
- [x] Go: Mojaloop DFSP adapter in middleware bridge (party lookup, quotes, transfers, callbacks)
- [x] Go: Cross-border transfer handler with Mojaloop + BRICS Pay routing
- [x] Rust: BRICS Pay RSA/ECDSA cryptographic signer crate
- [x] Rust: TigerBeetle wallet ledger bridge (wallet debit/credit via FFI)
- [x] Python: ML fraud scoring service (GNN + Bayesian inference)
- [x] Python: USSD gateway session handler (Redis-backed state machine)
- [x] Python: STK Push / M-Pesa channel handler
- [x] Schema: wallets, wallet_transactions, cross_border_transfers tables
- [x] Portal: consumer wallet balance tRPC procedures + UI
- [x] Portal: P2P payment history page (/consumer/history)
- [x] Portal: cross-border transfers UI (Mojaloop + BRICS Pay)
- [x] Portal: developer portal page with SDK docs and live API key injection

## Next Steps (Wave 4)
- [x] Wire Go middleware bridge: crossBorder.initiate calls MIDDLEWARE_BRIDGE_URL /v1/cross-border/transfer
- [x] Wire Go middleware bridge: crossBorder.getQuote calls MIDDLEWARE_BRIDGE_URL /v1/cross-border/quote
- [x] Cross-Border page: live FX rate ticker with spread indicator (30s auto-refresh)
- [x] Developer Portal: pk_test / pk_live key toggle
- [x] Developer Portal: Run in Sandbox button that fires a real test charge
- [x] Write vitest tests for new procedures

## Wave 5
- [x] Cross-Border: quote expiry countdown bar (visual progress bar, auto-refetch on expiry)
- [x] Developer Portal: Webhook Event Log viewer (last 20 deliveries, payload inspector)
- [x] Cross-Border FX ticker: corridor volume heatmap overlay on each tile
- [x] Write vitest tests for Wave 5 logic

## Wave 6 — Features
- [x] Webhook retry: trpc.webhookDeliveries.retry procedure + Retry button in Event Log
- [x] Transfer receipt: notifyOwner after crossBorder.initiate succeeds
- [x] Corridor comparison view: side-by-side table on Cross-Border page

## Wave 6 — Audit & Production Hardening
- [x] Comprehensive service/router/DB/env audit
- [x] UI end-to-end audit: every nav link, button, dropdown, search, CRUD
- [x] Fix all orphaned services and disconnected features
- [x] Replace all mock/stub data with real implementations
- [x] Complete all outstanding TODOs
- [x] Production security hardening (rate limiting, input validation, error masking)
- [x] Generate unified archive (paygate_source_v6.tar.gz — 2172 source files, 13 MB)

## Wave 7
- [x] Fraud alert banner: real-time sticky banner on dashboard for high-severity alerts with Acknowledge action
- [x] Transaction refund flow: transactions.refund tRPC procedure + Refund button in Transaction Detail dialog
- [x] Onboarding progress tracker: persistent sidebar progress bar from onboarding.getStatus
- [x] Consumer portal: confirmed embedded in merchant portal at /consumer/* routes
- [x] gRPC: PaymentService, FraudService, FXService, WalletService proto + Go server + client helper
- [x] Idempotency: idempotency_requests table, withIdempotency middleware, wired on createTest/sendMoney/initiate
- [x] Write vitest tests for Wave 7 (28 new tests, 112 total)
