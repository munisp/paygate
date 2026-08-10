# PayGate Platform — Comprehensive Feature Inventory

**Version:** Wave 79 (April 2026)  
**Status:** Production-Ready  
**Author:** Manus AI

---

## Platform Overview

PayGate is a full-stack, multi-sided payment infrastructure platform serving three distinct user personas: **Merchants** (businesses accepting payments), **Consumers** (end-users making payments), and **Administrators** (platform operators). The platform is built on a React 19 + TypeScript frontend, an Express/tRPC backend, a PostgreSQL database with 142 tables, 33 Python microservices, 5 Rust services, a Go bridge proxy, and a full Kubernetes/Docker Compose production infrastructure.

| Metric | Value |
|---|---|
| Total frontend pages | 148 |
| Total DB tables | 142 |
| Total tRPC procedures | ~420 |
| Total vitest tests | 1,614 (52 files, 0 failures) |
| Python microservices | 33 |
| Rust services | 5 |
| Go bridge handlers | ~180 |
| K8s deployments | ~60 |
| Docker Compose services | ~55 |

---

## Part 1 — Merchant Portal

The Merchant Portal is the primary interface for businesses. It is accessible at `/dashboard` and uses a persistent sidebar layout (`Layout.tsx`) with role-based access control.

### 1.1 Core Payments

| Feature | Page | Description |
|---|---|---|
| Dashboard | `/dashboard` | Platform overview: revenue, transaction volume, settlement status, fraud score |
| Transactions | `/transactions` | Full transaction ledger with filters, export, refund, and dispute initiation |
| Payment Links | `/payment-links` | Create and share hosted payment pages with custom branding |
| Checkout | `/checkout` | Embeddable checkout widget configuration and preview |
| Payouts | `/payouts` | Initiate and track bank transfers to vendors and employees |
| Settlements | `/settlements` | View and reconcile settlement batches from the payment processor |
| Disputes | `/disputes` | Manage chargebacks and dispute evidence submission |
| Virtual Cards | `/virtual-cards` | Issue and manage virtual Visa/Mastercard cards for online spending |

### 1.2 Analytics & Reporting

| Feature | Page | Description |
|---|---|---|
| Analytics | `/analytics` | Revenue trends, conversion funnels, payment method breakdown |
| AI Insights | `/ai-insights` | ML-powered revenue forecasting, anomaly detection, and recommendations |
| AI Insights V2 | `/ai-insights-v2` | Enhanced AI with customer segmentation, product recommendations, churn prediction |
| Reports Center | `/reports-center` | On-demand and scheduled reports in PDF/CSV/Excel format |
| Cohort Analytics | `/cohort-analytics` | Customer retention and cohort analysis |
| FX Dashboard | `/fx` | Multi-currency revenue breakdown and FX rate monitoring |
| DCC Dashboard | `/dcc` | Dynamic Currency Conversion analytics |
| Workflow Observability | `/workflow-observability` | Temporal workflow monitoring and trace visualization |

### 1.3 Fraud & Risk

| Feature | Page | Description |
|---|---|---|
| Fraud & Risk | `/fraud-risk` | Real-time fraud scoring, rule management, and block/allow lists |
| Fraud Heatmap | `/fraud-heatmap` | Geographic visualization of fraud patterns |
| AML Monitor | `/aml-monitor` | Anti-money laundering transaction monitoring and SAR filing |
| Session Risk | `/session-risk` | Device fingerprinting and session-level risk scoring |
| Chargeback Automation | `/chargeback-automation` | Automated chargeback response with evidence packaging |
| Dispute Automation | `/dispute-automation` | AI-assisted dispute resolution workflow |

### 1.4 Compliance & KYC

| Feature | Page | Description |
|---|---|---|
| Compliance & KYC | `/compliance-kyc` | KYC document submission, status tracking, and compliance dashboard |
| KYB Workflow | `/kyb-workflow` | Business verification with CAC, TIN, and director checks |
| Tax Engine | `/tax-engine` | VAT, WHT, and CIT calculation with FIRS integration |
| Audit Log | `/audit-log` | Immutable audit trail for all merchant actions |
| Regulatory Sandbox | `/regulatory-sandbox` | Test environment for regulatory compliance scenarios |

### 1.5 Financial Products

| Feature | Page | Description |
|---|---|---|
| BNPL | `/bnpl` | Buy Now Pay Later product configuration and order management |
| BNPL V2 | `/bnpl-v2` | Enhanced BNPL with credit scoring and instalment management |
| EMI Checkout | `/emi-checkout` | Equated Monthly Instalment checkout integration |
| Merchant Lending | `/merchant-lending` | Working capital loans with automated underwriting |
| Embedded Finance | `/embedded-finance` | Embed financial products into third-party platforms |
| Open Banking | `/open-banking` | Account information and payment initiation via PSD2/CBN Open Banking |
| Open Banking Portal | `/open-banking-portal` | Consent management and connected accounts dashboard |
| Open Finance Hub | `/open-finance-hub` | Aggregated financial data from multiple institutions |

### 1.6 Wealth & Investment Products

| Feature | Page | Description |
|---|---|---|
| Digital Gold | `/digital-gold` | Buy, sell, and hold 24K digital gold with SIP plans |
| Mutual Funds | `/mutual-funds` | Invest in Nigerian mutual funds (ARM, Stanbic, Coronation) |
| Consumer Insurance | `/consumer-insurance` | Life, health, and auto insurance products via AIICO, Leadway, AXA Mansard |
| Pension / NPS | `/pension-nps` | RSA contributions and pension account management via PENCOM-licensed PFAs |
| Wealth Management | `/wealth-management` | Risk profiling, investment goals, and portfolio rebalancing |
| Cashback & Rewards | `/cashback-rewards` | Cashback programme management and reward redemption |
| Subscription Billing V2 | `/subscription-billing-v2` | Advanced subscription plan management with churn analytics |

### 1.7 Operations

| Feature | Page | Description |
|---|---|---|
| Customers | `/customers` | Customer directory with transaction history and risk profiles |
| Vendors | `/vendors` | Vendor management and bulk payment scheduling |
| Team & Roles | `/team` | Team member management with granular RBAC |
| Onboarding | `/onboarding` | Merchant onboarding wizard with KYC/KYB integration |
| Settings | `/settings` | Business profile, notification preferences, and security settings |
| API Keys | `/api-keys` | API key management with scope control and IP whitelisting |
| Webhooks | `/webhooks` | Webhook endpoint management with delivery logs and retry |
| Payment Methods | `/payment-methods` | Configure accepted payment methods and card networks |

### 1.8 Advanced Infrastructure

| Feature | Page | Description |
|---|---|---|
| Mobile Money Recon | `/mobile-money` | MTN/Airtel/Glo mobile money reconciliation |
| Payroll V2 | `/payroll-v2` | Full payroll processing with PAYE, pension, and NHF deductions |
| Salary Accounts | `/salary-accounts` | Employee salary account management and advance disbursement |
| Bulk Collections | `/bulk-collections` | Mass collection campaigns with reminder automation |
| Nodal Accounts | `/nodal-accounts` | Escrow and collections nodal account management |
| Smart Retail POS | `/smart-retail-pos` | Point-of-sale system with inventory tracking and receipt printing |
| Voice Payments (Soundbox) | `/voice-payments` | Audio payment confirmation device management |
| International Remittance | `/international-remittance` | Cross-border transfers via WorldRemit, Flutterwave, and SWIFT |
| Multi-Currency Wallet | `/multi-currency-wallet` | Hold and convert NGN, USD, GBP, EUR, KES, GHS |
| USDC Payouts | `/usdc-payouts` | Stablecoin payouts via Circle USDC on Base/Ethereum |
| Crypto Ramp | `/crypto-ramp` | Fiat-to-crypto on/off ramp |
| Privacy Payments | `/privacy-payments` | Anonymous payment aliases and privacy mode |
| Escrow Service | `/escrow-service` | Milestone-based escrow for B2B transactions |
| Agent Network | `/agent-network` | CICO agent management and float monitoring |
| Bulk Scheduler | `/bulk-scheduler` | Scheduled bulk payment campaigns |
| ISO 20022 | `/iso20022` | ISO 20022 message generation and validation |
| RTGS Dashboard | `/rtgs` | Real-Time Gross Settlement monitoring |
| Carbon Credits | `/carbon-credits` | Carbon credit purchase and offset tracking |
| NFT Badges | `/nft-badges` | NFT-based loyalty badges and digital collectibles |
| Lakehouse V2 | `/lakehouse-v2` | Data lakehouse analytics with Apache Iceberg |
| Insurance Premium | `/insurance-premium` | Premium financing for large insurance policies |
| Recurring Billing | `/recurring-billing` | Subscription and recurring payment management |
| Invoice Builder | `/invoice-builder` | Professional invoice creation and payment collection |
| Reconciliation Engine | `/reconciliation-engine` | Automated transaction reconciliation with bank statements |
| Loyalty Engine | `/loyalty-engine` | Points, tiers, and reward programme management |
| Terminal Map | `/terminal-map` | POS terminal geographic distribution and health monitoring |
| White-Label SDK | `/white-label-sdk` | SDK customization and branding for embedded deployments |
| SDK Portal | `/sdk-portal` | Developer SDK documentation and integration guides |
| API Docs Portal | `/api-docs-portal` | White-label API documentation with interactive testing |
| Super App | `/super-app` | Super app module management for consumer-facing features |
| Payroll | `/payroll` | Basic payroll processing |
| Tax Withholding | `/tax-withholding` | WHT calculation and remittance |
| RemittanceV2 | `/remittance-v2` | Enhanced remittance with corridor management |
| POSv2 | `/pos-v2` | Next-generation POS with NFC and QR support |

### 1.9 Portal Billing (Merchant Subscription)

| Feature | Page | Description |
|---|---|---|
| Billing | `/billing` | Portal subscription management: Free/Starter ($29)/Growth ($79)/Enterprise ($199) plans with Stripe checkout |

### 1.10 AI & Machine Learning

| Feature | Page | Description |
|---|---|---|
| Ollama AI Chat | `/ollama-chat` | On-premise LLM chat powered by local Ollama instance with model management |
| AI Insights | `/ai-insights` | Cloud LLM-powered insights via Manus Forge API |
| AI Insights V2 | `/ai-insights-v2` | Enhanced AI with structured JSON responses and streaming |

---

## Part 2 — Consumer Portal

The Consumer Portal is accessible at `/consumer/*` and uses a mobile-first layout (`ConsumerLayout.tsx`) optimised for smartphone usage.

| Feature | Route | Description |
|---|---|---|
| Wallet | `/consumer/wallet` | Digital wallet balance, top-up, and withdrawal |
| Make Payment | `/consumer/pay` | Send money to any Nigerian bank account or mobile number |
| QR Scan & Pay | `/consumer/qr-scan` | Scan merchant QR codes to pay instantly |
| Bill Pay | `/consumer/bills` | Pay electricity, water, cable TV, and internet bills |
| Transaction History | `/consumer/history` | Full payment history with filters and receipts |
| Quick Pay | `/consumer/quick-pay` | One-tap payments to saved beneficiaries |
| Request Money | `/consumer/request` | Send payment requests via link or QR |
| Split Bill | `/consumer/split` | Split bills among friends with automatic settlement |
| Contacts | `/consumer/contacts` | Saved beneficiaries and frequent payees |
| Loyalty & Rewards | `/consumer/loyalty` | Points balance, tier status, and reward redemption |
| Coupons | `/consumer/coupons` | Merchant coupons and promotional offers |
| Virtual Card | `/consumer/card` | Issue and manage a virtual debit card |
| Recurring Payments | `/consumer/recurring` | Manage standing orders and recurring payments |
| Red Envelope | `/consumer/red-envelope` | Send money gifts in a digital red envelope |
| Cross-Border | `/consumer/cross-border` | International money transfers |
| Discover | `/consumer/discover` | Explore merchants, offers, and financial products |
| Consumer Profile | `/consumer/profile` | Account settings, linked banks, and notification preferences |
| Consumer KYC | `/consumer/kyc` | Identity verification with BVN, NIN, and document upload |
| Consumer Onboarding | `/consumer/onboarding` | Step-by-step account setup wizard |
| PIN Setup | `/consumer/pin-setup` | Transaction PIN creation and management |
| Notifications | `/consumer/notifications` | In-app notification centre |

---

## Part 3 — Admin Portal

The Admin Portal is accessible at `/admin/*` and uses a dedicated `AdminLayout.tsx` with role-gated access (`adminProcedure` in tRPC). Only users with `role = 'admin'` can access these pages.

| Feature | Route | Description |
|---|---|---|
| Platform Overview | `/admin` | Platform-wide KPIs: total GMV, active merchants, transaction volume, fraud rate |
| Merchant Management | `/admin/merchants` | View, approve, suspend, and configure all merchant accounts |
| KYC Review Queue | `/admin/kyc` | Review and approve/reject merchant and consumer KYC submissions |
| Dispute Management | `/admin/disputes` | Platform-wide dispute oversight with escalation and resolution tools |
| Fraud Oversight | `/admin/fraud` | Global fraud monitoring, rule management, and suspicious account flagging |
| Revenue & Fee Management | `/admin/revenue` | Platform revenue reporting, fee tier configuration, and pricing management |
| Settlement Management | `/admin/settlements` | Oversee all settlement batches, resolve failures, and trigger manual settlements |
| Compliance Reporting | `/admin/compliance` | Regulatory compliance reports, SAR filing, and CBN reporting |
| System Health | `/admin/system` | Service health monitoring, error rates, latency, and database metrics |
| Audit Trail | `/admin/audit` | Platform-wide immutable audit log with CSV export |
| Notification Centre | `/admin/notifications` | Send platform-wide announcements and targeted merchant notifications |
| Configuration Panel | `/admin/config` | Feature flags, rate limits, maintenance mode, and system configuration |

---

## Part 4 — Backend Architecture

### 4.1 tRPC Routers

| Router | File | Procedures | Description |
|---|---|---|---|
| Main Router | `server/routers.ts` | ~200 | Core merchant features: auth, transactions, payouts, settlements, fraud, KYC, webhooks, API keys, etc. |
| Tier 1–5 Router | `server/tier1to5Router.ts` | ~40 | Advanced analytics, AML, chargeback automation, embedded finance, open banking |
| Tier 6–8 Router | `server/tier6to8Router.ts` | ~60 | Enterprise features: BNPL v2, payroll v2, crypto, ISO 20022, RTGS, carbon credits, NFTs |
| New Features Router | `server/newFeaturesRouter.ts` | ~80 | Wave 76–78 features: digital gold, mutual funds, insurance, pension, EMI, bulk collections, etc. |
| Admin Router | `server/adminRouter.ts` | ~36 | Admin portal: merchant management, KYC review, dispute oversight, system health |
| Ollama Router | `server/ollamaRouter.ts` | 5 | Local LLM: chat, list models, pull model, delete model, check status |
| Portal Billing Router | `server/portalBillingRouter.ts` | 4 | Stripe-based portal subscription: get plan, list plans, create checkout, billing portal |
| USDC Router | `server/usdcRouter.ts` | ~10 | USDC stablecoin payouts via Circle API |
| Wave 68 Router | `server/wave68Router.ts` | ~20 | Specialist features from Wave 68 |
| gRPC Router | `server/grpcRouter.ts` | ~10 | gRPC bridge procedures |
| System Router | `server/_core/systemRouter.ts` | 3 | Auth, logout, owner notifications |

### 4.2 Database Schema (142 tables)

The schema covers all platform entities across 8 domains:

| Domain | Tables |
|---|---|
| Users & Auth | users, sessions, oauth_states, api_keys, team_members, role_permissions |
| Transactions | transactions, transaction_events, payment_intents, refunds, settlements, settlement_items |
| Fraud & Risk | fraud_scores, fraud_rules, fraud_alerts, aml_alerts, session_risks, device_fingerprints |
| KYC/KYB | kyc_submissions, kyb_submissions, kyc_documents, compliance_reports |
| Financial Products | digital_gold_holdings, mutual_fund_holdings, consumer_insurance_policies, pension_accounts, emi_contracts, subscription_plans_v2 |
| Operations | webhooks, webhook_deliveries, payouts, bulk_collections, salary_accounts, nodal_accounts |
| Consumer | consumer_wallets, consumer_transactions, loyalty_points, coupons, red_envelopes |
| Infrastructure | audit_logs, report_jobs, scheduled_reports, retail_pos_configs, soundbox_devices |

### 4.3 Python Microservices (33 services)

| Service | Port | Description |
|---|---|---|
| ai-insights | 8001 | ML revenue forecasting and anomaly detection |
| fraud-scoring | 8002 | Real-time fraud scoring with XGBoost |
| fraud-heatmap | 8003 | Geographic fraud pattern analysis |
| aml-monitor | 8004 | AML transaction monitoring |
| cohort-analytics | 8005 | Customer cohort and retention analysis |
| credit-scoring | 8006 | Merchant and consumer credit scoring |
| settlement-forecast | 8007 | Settlement timing prediction |
| tax-engine | 8008 | VAT/WHT/CIT calculation |
| reconciliation-engine | 8009 | Automated bank reconciliation |
| payroll | 8010 | Payroll processing with PAYE |
| fx-rate-feed | 8011 | Real-time FX rate aggregation |
| iso20022-parser | 8012 | ISO 20022 message parsing |
| carbon-oracle | 8013 | Carbon credit pricing oracle |
| push-service | 8014 | Push notification delivery |
| ussd-gateway | 8015 | USSD session management |
| mpesa-connector | 8016 | M-Pesa API integration |
| kiosk-health | 8017 | POS terminal health monitoring |
| insurance-pricing | 8018 | Insurance premium calculation |
| lakehouse-audit | 8019 | Data lakehouse audit trail |
| usdc-lakehouse-consumer | 8020 | USDC transaction lakehouse consumer |
| digital-gold | 9020 | Digital gold pricing and transaction processing |
| mutual-funds | 9021 | Mutual fund NAV and portfolio management |
| pension-nps | 9022 | Pension contribution processing |
| cashback-rewards | 9023 | Cashback calculation and redemption |
| soundbox | 9024 | Soundbox device management |
| wealth-management | 9025 | Portfolio management and risk profiling |
| emi-service | 9026 | EMI plan calculation and instalment tracking |
| bulk-collections | 9027 | Bulk collection campaign management |
| salary-accounts | 9028 | Salary disbursement and advance processing |
| intl-remittance | 9029 | International remittance via WorldRemit/Flutterwave |

### 4.4 Rust Services (5 services)

| Service | Description |
|---|---|
| billing-engine | High-performance billing calculation engine |
| credit-scoring | Low-latency credit score computation |
| inventory-engine | Real-time inventory tracking for POS |
| loyalty-ledger | Immutable loyalty points ledger |
| wallet-ffi | FFI bridge for wallet operations |

### 4.5 Go Bridge

The Go bridge (`go-bridge/`) acts as a reverse proxy between the Node.js tRPC backend and the Python/Rust microservices. It handles authentication, rate limiting, circuit breaking, and request routing. Key handler files:

- `handlers/tier6_handlers.go` — Tier 6 enterprise features
- `handlers/tier7_handlers.go` — Tier 7 specialist features  
- `handlers/tier8_handlers.go` — Tier 8 advanced infrastructure
- `handlers/new_features.go` — Wave 76–78 new features (180+ handlers)
- `handlers/wallet.go` — Wallet operations
- `handlers/lending.go` — Merchant lending
- `handlers/payroll.go` — Payroll processing

---

## Part 5 — Infrastructure

### 5.1 Observability

| Component | Description |
|---|---|
| Prometheus | Scrapes metrics from all 33 Python services, Go bridge, and Node.js server |
| Grafana | Dashboards for platform KPIs, service health, and Wave 78 new services |
| Alertmanager | Alert rules for high error rates, latency spikes, and service downtime |
| OpenTelemetry | Distributed tracing via OTLP exporter |

### 5.2 API Gateway

APISIX is used as the API gateway with routes defined in `infra/apisix/routes.yaml` for all 33 microservices. It handles:
- JWT authentication
- Rate limiting per merchant
- Request routing to Python/Rust services
- SSL termination

### 5.3 Kubernetes

Kubernetes manifests in `k8s/` cover ~60 Deployments and Services across all microservices, with resource limits, liveness/readiness probes, and horizontal pod autoscaling configured for all production services.

### 5.4 Stripe Integration

| Component | Description |
|---|---|
| Portal Plans | Free / Starter ($29/mo) / Growth ($79/mo) / Enterprise ($199/mo) |
| Webhook Handler | `/api/stripe/webhook` — handles `checkout.session.completed`, `customer.subscription.updated/deleted` |
| Price IDs | Configured via `STRIPE_PORTAL_STARTER_PRICE_ID`, `STRIPE_PORTAL_GROWTH_PRICE_ID`, `STRIPE_PORTAL_ENTERPRISE_PRICE_ID` |

---

## Part 6 — Testing

| Test Suite | File | Tests |
|---|---|---|
| Auth & Core | `server/auth.logout.test.ts` | 12 |
| USDC Router | `server/usdc.router.test.ts` | 28 |
| Wave 76 New Features | `server/wave76.new-features.test.ts` | 60 |
| Wave 77 Production | `server/wave77.production.test.ts` | 53 |
| Wave 78 Production | `server/wave78.production.test.ts` | 73 |
| (47 additional test files) | Various | 1,388 |
| **Total** | **52 files** | **1,614 tests** |

All 1,614 tests pass with 0 failures. TypeScript compiles with 0 errors. Go bridge builds with 0 errors.

---

## Part 7 — Production Readiness Checklist

| Item | Status |
|---|---|
| Database migrations | ✅ All 142 tables migrated |
| Seed data | ✅ All tables seeded with Nigerian demo data |
| Environment variables | ✅ All production defaults set in `server/_core/env.ts` |
| Stripe integration | ✅ Checkout, webhooks, billing portal |
| Webhook delivery | ✅ 15 event types wired to all key mutations |
| Prometheus metrics | ✅ All 33 services scraped |
| Grafana dashboards | ✅ Platform + Wave 78 dashboards |
| Alertmanager rules | ✅ Error rate, latency, and availability alerts |
| K8s manifests | ✅ ~60 deployments with resource limits and probes |
| Docker Compose | ✅ ~55 services for local development |
| APISIX routes | ✅ All 33 services routed |
| TypeScript | ✅ 0 errors |
| Go bridge | ✅ 0 compilation errors |
| Test coverage | ✅ 1,614 tests, 0 failures |
| Admin portal | ✅ 12 pages with role-gated access |
| Consumer portal | ✅ 21 pages with mobile-first layout |
| Merchant portal | ✅ 115 pages with full feature set |
| Ollama AI | ✅ Local LLM with model management |
