# PayGate Platform — Complete Feature Inventory

> Last updated: 2026-04-23 | Version: v87 | Tests: 76 files · 2,606 tests

---

## Architecture Overview

PayGate is a production-grade, multi-tenant payment infrastructure platform built for the African fintech market. It combines a React 19 + Tailwind 4 frontend, Express 4 + tRPC 11 backend, TigerBeetle double-entry ledger, PostgreSQL (TiDB-compatible), Redis, Kafka, and a suite of Python microservices.

| Layer | Technology |
|---|---|
| Frontend | React 19, Tailwind 4, shadcn/ui, Wouter, tRPC client |
| Backend | Express 4, tRPC 11, Drizzle ORM, Superjson |
| Ledger | TigerBeetle (batch size 8,190; zero-fsync) |
| Database | PostgreSQL / TiDB (MySQL-compatible) |
| Cache / Rate-limit | Redis (sliding-window, idempotency) |
| Messaging | Kafka (partitioned by merchant_id) |
| Auth | Manus OAuth + JWT session cookies |
| Payments | Stripe (subscriptions + webhooks) |
| Observability | Prometheus + Grafana (12 dashboards) |
| Infrastructure | Docker Compose (prod + dev), K8s YAML, APISIX gateway |

---

## 1. Merchant Portal (Core)

| Feature | Route | Status |
|---|---|---|
| Dashboard | `/dashboard` | ✅ |
| Transactions (search, filter, export) | `/transactions` | ✅ |
| Customers (CRUD, KYC status) | `/customers` | ✅ |
| Virtual Cards | `/virtual-cards` | ✅ |
| Analytics | `/analytics` | ✅ |
| Merchant Analytics Dashboard | `/merchant-analytics` | ✅ |
| Checkout | `/checkout` | ✅ |
| API Keys (create, rotate, revoke) | `/api-keys` | ✅ |
| Webhooks (CRUD, delivery logs) | `/webhooks` | ✅ |
| Webhook Deliveries | `/webhook-deliveries` | ✅ |
| Settings | `/settings` | ✅ |
| Payouts | `/payouts` | ✅ |
| USDC Payouts | `/usdc-payouts` | ✅ |
| Disputes (workflow) | `/disputes` | ✅ |
| Dispute Workflow | `/dispute-workflow` | ✅ |
| Payment Links | `/payment-links` | ✅ |
| Fraud & Risk | `/fraud-risk` | ✅ |
| Reconciliation Alerts | `/reconciliation-alerts` | ✅ |
| BNPL | `/bnpl` | ✅ |
| FX Dashboard | `/fx` | ✅ |
| Team & Roles | `/team` | ✅ |
| Mobile Money Recon | `/mobile-money` | ✅ |
| Compliance KYC | `/compliance-kyc` | ✅ |
| Compliance Settings | `/compliance-settings` | ✅ |
| QR Payments | `/qr-payments` | ✅ |
| Cross-Border | `/cross-border` | ✅ |
| Developer Portal | `/developer` | ✅ |
| Workflow Observability | `/workflow` | ✅ |
| Keycloak Role Sync | `/keycloak-roles` | ✅ |
| NIP Banks | `/nip-banks` | ✅ |
| Subscriptions | `/subscriptions` | ✅ |
| POS Terminals | `/pos-terminals` | ✅ |
| Terminal Map | `/terminal-map` | ✅ |
| POS Reconciliation | `/pos-recon` | ✅ |
| PTSP Settlement | `/ptsp-settlement` | ✅ |
| PTSP Batches | `/ptsp-batches` | ✅ |
| Agent Banking | `/agent-banking` | ✅ |
| Kiosk Health | `/kiosk-health` | ✅ |
| Restaurant Floor Plan | `/restaurant/floor` | ✅ |
| Restaurant Orders | `/restaurant/orders` | ✅ |
| Restaurant Menu | `/restaurant/menu` | ✅ |
| Restaurant Loyalty | `/restaurant/loyalty` | ✅ |
| Restaurant Online Ordering | `/restaurant/online` | ✅ |
| Kitchen Display | `/kitchen` | ✅ |
| Inventory | `/inventory` | ✅ |
| Payroll | `/payroll` | ✅ |
| Geofence Alerts | `/geofence` | ✅ |
| Microservice Health | `/microservice-health` | ✅ |
| Audit Log | `/audit-log` | ✅ |
| Purchase Orders | `/purchase-orders` | ✅ |
| Vendors | `/vendors` | ✅ |
| Settlements | `/settlements` | ✅ |
| Merchant Lending | `/merchant-lending` | ✅ |
| Split Payments | `/split-payments` | ✅ |
| Refund Workflow | `/refund-workflow` | ✅ |
| Payout Batching | `/payout-batching` | ✅ |
| Transaction Receipt | `/receipt/:id` | ✅ |
| Settlement Forecast | `/settlement-forecast` | ✅ |
| Tax Engine | `/tax-engine` | ✅ |
| Mobile POS | `/mobile-pos` | ✅ |
| Billing | `/billing` | ✅ |
| Consumer Analytics | `/consumer-analytics` | ✅ |
| Consumer Disputes | `/consumer-disputes` | ✅ |
| Notifications Center | `/notifications` | ✅ |
| Merchant Notification Preferences | `/notifications/preferences` | ✅ |
| Quick Pay | `/quick-pay` | ✅ |
| Settings Payments | `/settings/payments` | ✅ |
| Go-Live Checklist | `/go-live` | ✅ |
| Ollama Chat | `/ollama-chat` | ✅ |
| API Docs Portal | `/api-docs` | ✅ |

---

## 2. Tier 1–5 Advanced Features

| Feature | Route | Status |
|---|---|---|
| Recurring Billing | `/recurring-billing` | ✅ |
| DCC Dashboard | `/dcc` | ✅ |
| Reconciliation Engine | `/recon-engine` | ✅ |
| Invoice Builder | `/invoices` | ✅ |
| Chargeback Automation | `/chargebacks` | ✅ |
| AML Monitor | `/aml` | ✅ |
| KYB Workflow | `/kyb` | ✅ |
| Session Risk | `/session-risk` | ✅ |
| Open Banking | `/open-banking` | ✅ |
| Loyalty Engine | `/loyalty-engine` | ✅ |
| Embedded Finance | `/embedded-finance` | ✅ |
| AI Insights | `/ai-insights` | ✅ |
| Fraud Heatmap | `/fraud-heatmap` | ✅ |
| Cohort Analytics | `/cohort-analytics` | ✅ |
| Dispute Automation | `/dispute-automation` | ✅ |
| Open Banking Portal | `/open-banking-portal` | ✅ |
| Merchant Lending V2 | `/merchant-lending-v2` | ✅ |

---

## 3. Tier 6–8 Enterprise Features

| Feature | Route | Status |
|---|---|---|
| Insurance Premium | `/insurance-premium` | ✅ |
| Carbon Credits | `/carbon-credits` | ✅ |
| NFT Badges | `/nft-badges` | ✅ |
| BNPL V2 | `/bnpl-v2` | ✅ |
| Crypto Ramp | `/crypto-ramp` | ✅ |
| Escrow Service | `/escrow` | ✅ |
| Bulk Scheduler | `/bulk-scheduler` | ✅ |
| Tax Withholding | `/tax-withholding` | ✅ |
| Regulatory Sandbox | `/regulatory-sandbox` | ✅ |
| Multi-Currency Wallet | `/multi-currency` | ✅ |
| RTGS Dashboard | `/rtgs` | ✅ |
| ISO 20022 | `/iso20022` | ✅ |
| Open Finance Hub | `/open-finance` | ✅ |
| White Label SDK | `/white-label-sdk` | ✅ |
| Super App | `/super-app` | ✅ |
| Lakehouse V2 | `/lakehouse` | ✅ |
| Payroll V2 | `/payroll-v2` | ✅ |
| Agent Network | `/agent-network` | ✅ |
| SDK Portal | `/sdk-portal` | ✅ |
| POS V2 | `/pos-v2` | ✅ |
| Remittance V2 | `/remittance-v2` | ✅ |

---

## 4. Wave 80–86 New Features

| Feature | Route | Status |
|---|---|---|
| Open Banking V2 | `/open-banking-v2` | ✅ |
| Carbon Credits V2 | `/carbon-credits-v2` | ✅ |
| Agent Banking V4 | `/agent-banking-v4` | ✅ |
| Super Agent V2 | `/super-agent-v2` | ✅ |
| Escrow V2 | `/escrow-v2` | ✅ |
| Marketplace Pay | `/marketplace-pay` | ✅ |
| Loyalty V3 | `/loyalty-v3` | ✅ |
| Crypto Offramp V2 | `/crypto-offramp-v2` | ✅ |
| NFC Pay | `/nfc-pay` | ✅ |
| QR Merchant Analytics | `/qr-analytics` | ✅ |
| Pricing Page | `/pricing` | ✅ |
| Billing Page | `/billing` | ✅ |
| Feature Gate | (component) | ✅ |

---

## 5. Consumer App (PWA)

| Feature | Route | Status |
|---|---|---|
| Consumer Wallet | `/consumer` | ✅ |
| Quick Pay | `/consumer/quick-pay` | ✅ |
| Discover | `/consumer/discover` | ✅ |
| Transaction History | `/consumer/history` | ✅ |
| Profile | `/consumer/profile` | ✅ |
| Send Money | `/consumer/send` | ✅ |
| QR Scan & Pay | `/consumer/qr-scan` | ✅ |
| Request Money | `/consumer/request-money` | ✅ |
| Split Bill | `/consumer/split-bill` | ✅ |
| Recurring Payments | `/consumer/recurring` | ✅ |
| Bill Pay | `/consumer/bills` | ✅ |
| My Card | `/consumer/card` | ✅ |
| International Transfer | `/consumer/cross-border` | ✅ |
| Spending Analytics | `/consumer/analytics` | ✅ |
| Loyalty Points | `/consumer/loyalty` | ✅ |
| Rewards Dashboard | `/consumer/loyalty-dashboard` | ✅ |
| Coupons & Offers | `/consumer/coupons` | ✅ |
| Contacts | `/consumer/contacts` | ✅ |
| Identity Verification | `/consumer/kyc` | ✅ |
| PIN Setup | `/consumer/pin` | ✅ |
| Disputes | `/consumer/disputes` | ✅ |
| Portfolio Summary | `/consumer/portfolio` | ✅ |
| Portfolio Rebalancing | `/consumer/portfolio/rebalance` | ✅ |
| Digital Gold | `/consumer/gold` | ✅ |
| Mutual Funds (+ comparison) | `/consumer/mutual-funds` | ✅ |
| Pension | `/consumer/pension` | ✅ |
| EMI Loans | `/consumer/emi` | ✅ |
| Send Abroad | `/consumer/remittance` | ✅ |
| Insurance (+ AI chat) | `/consumer/insurance-portal` | ✅ |
| Claims Tracker | `/consumer/claims` | ✅ |
| BNPL Repayments | `/consumer/bnpl-repayments` | ✅ |
| Subscriptions | `/consumer/subscriptions` | ✅ |
| SIP Scheduler | `/consumer/sip` | ✅ |
| Notification Centre | `/consumer/notification-centre` | ✅ |
| Wallet Statement | `/consumer/statement` | ✅ |
| Help Guide | `/consumer/help` | ✅ |
| Financial Hub | `/consumer/financial` | ✅ |

---

## 6. Admin Portal

| Feature | Route | Status |
|---|---|---|
| Admin Dashboard | `/admin` | ✅ |
| Merchant Management | `/admin/merchants` | ✅ |
| User Management | `/admin/users` | ✅ |
| Transaction Monitoring | `/admin/transactions` | ✅ |
| Dispute Review | `/admin/disputes` | ✅ |
| Compliance | `/admin/compliance` | ✅ |
| Fraud Review | `/admin/fraud` | ✅ |
| Fee Management | `/admin/fees` | ✅ |
| Settlement Management | `/admin/settlements` | ✅ |
| Audit Trail | `/admin/audit` | ✅ |
| Revenue Dashboard | `/admin/revenue` | ✅ |
| API Playground | `/admin/api-playground` | ✅ |
| Rate Limit Dashboard | `/admin/rate-limits` | ✅ |
| SDK Tokens | `/admin/sdk-tokens` | ✅ |
| Tenant Management | `/admin/tenants` | ✅ |
| White Label | `/admin/white-label` | ✅ |
| KYB Review | `/admin/kyb-review` | ✅ |
| FX Hedging | `/admin/fx-hedging` | ✅ |
| Payout Approval | `/admin/payout-approval` | ✅ |
| Compliance Reports | `/admin/compliance-reports` | ✅ |
| Security Score | `/admin/security-score` | ✅ |
| Webhook Retry | `/admin/webhook-retry` | ✅ |
| Data Pipeline | `/admin/data-pipeline` | ✅ |
| BNPL Underwriting | `/admin/bnpl-underwriting` | ✅ |
| Loyalty Tier Engine | `/admin/loyalty-tiers` | ✅ |
| Invite Codes | `/admin/invite-codes` | ✅ |
| Tenant Billing | `/admin/tenant-billing` | ✅ |
| Corridor Monitor | `/admin/corridors` | ✅ |
| Tenant Admin Dashboard | `/admin/tenant` | ✅ |

---

## 7. Python Microservices

| Service | Port | Status |
|---|---|---|
| digital-gold | 8010 | ✅ |
| mutual-funds | 8011 | ✅ |
| emi-service | 8012 | ✅ |
| intl-remittance | 8013 | ✅ |
| subscription-billing-v2 | 8014 | ✅ |
| wealth-advisor | 8015 | ✅ |

---

## 8. Go Bridge Services

| Service | Port | Status |
|---|---|---|
| go-bridge (main gateway) | 8080 | ✅ |
| APISIX route manager | internal | ✅ |
| TigerBeetle client | internal | ✅ |
| Fraud ring escalation | internal | ✅ |
| GNN fraud scoring | internal | ✅ |

---

## 9. Infrastructure

| Component | Status |
|---|---|
| Docker Compose (dev) | ✅ |
| Docker Compose (prod) | ✅ |
| K8s YAML (all services) | ✅ |
| APISIX gateway config | ✅ |
| Prometheus scrape configs | ✅ |
| Grafana dashboards (12) | ✅ |
| Grafana alert rules | ✅ |
| Redis Sentinel config | ✅ |
| Kafka topic configs | ✅ |
| TigerBeetle cluster config | ✅ |
| Hot/warm/cold tiering archival | ✅ |

---

## 10. Security Posture

| Control | Status |
|---|---|
| Helmet.js (HSTS, X-Frame, X-Content-Type) | ✅ |
| Content-Security-Policy with nonce | ✅ |
| Redis sliding-window rate limiting | ✅ |
| Idempotency key enforcement | ✅ |
| JWT session cookies (httpOnly, secure, sameSite) | ✅ |
| Input sanitization (Zod schemas) | ✅ |
| SQL injection prevention (Drizzle ORM parameterized) | ✅ |
| CORS whitelist | ✅ |
| Audit logging (all mutations) | ✅ |
| OWASP Top 10 audit (wave83) | ✅ |
| security.txt at /.well-known/security.txt | ✅ |
| VULN-034/035/036 fixed | ✅ |
| 30 VULN-* items tracked and resolved | ✅ |

---

## 11. Testing

| Suite | Files | Tests | Status |
|---|---|---|---|
| wave01–wave10 | 10 | ~200 | ✅ |
| wave11–wave20 | 10 | ~300 | ✅ |
| wave21–wave30 | 10 | ~350 | ✅ |
| wave31–wave40 | 10 | ~250 | ✅ |
| wave41–wave50 | 10 | ~280 | ✅ |
| wave51–wave60 | 10 | ~300 | ✅ |
| wave61–wave70 | 10 | ~250 | ✅ |
| wave71–wave80 | 10 | ~300 | ✅ |
| wave81–wave87 | 7 | ~376 | ✅ |
| **Total** | **76** | **2,606** | **✅** |

---

## 12. Seed Data

| Script | Tables Seeded | Status |
|---|---|---|
| seed-merchants.mjs | merchants, merchant_profiles | ✅ |
| seed-transactions.mjs | transactions, ledger_entries | ✅ |
| seed-customers.mjs | customers | ✅ |
| seed-disputes.mjs | disputes | ✅ |
| seed-feature-flags.mjs | feature_flags | ✅ |
| seed-tenants.mjs | tenants | ✅ |
| seed-corridors.mjs | corridors | ✅ |
| seed-loyalty.mjs | loyalty_tiers, loyalty_points | ✅ |
| seed-insurance.mjs | insurance_policies, claims | ✅ |
| seed-bnpl.mjs | bnpl_loans, repayment_schedules | ✅ |
| seed-portfolio.mjs | portfolio_holdings | ✅ |
| **seed-all.mjs** | **all above** | **✅** |

---

## 13. Key Business Rules

- **Idempotency**: All payment mutations require `X-Idempotency-Key` header; duplicate requests return cached response within 24h TTL.
- **Batch transfers**: TigerBeetle processes up to 8,190 transfers per batch; overflow queued to Kafka.
- **Hot/warm/cold tiering**: Transfers < 90d in TigerBeetle (hot), 90d–1yr in PostgreSQL (warm), 1–10yr in S3 Parquet (cold).
- **Rate limiting**: 1,000 req/min per merchant (sliding window); 100 req/min per consumer; 10,000 req/min per platform.
- **FX markup**: Per-corridor bps markup applied at settlement; configurable via Admin Corridor Monitor.
- **Subscription gating**: Features gated by Stripe plan (starter/growth/enterprise); FeatureGate component enforces on frontend.
- **KYB/KYC**: Merchants must complete KYB before live payments; consumers must complete KYC for transfers > ₦50,000.
- **Dispute SLA**: Disputes auto-escalated after 7 days; chargebacks auto-filed after 14 days.
- **Settlement**: T+1 settlement for NGN; T+2 for cross-border; RTGS for amounts > ₦10M.
- **Fraud scoring**: GNN model scores every transaction; scores > 0.85 auto-blocked; 0.65–0.85 flagged for review.
