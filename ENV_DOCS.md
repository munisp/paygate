# PayGate Platform — Environment Variables Reference

This document lists every environment variable required across all three PayGate portals.
All secrets must be injected at deploy time; **never commit `.env` files**.

---

## Merchant Portal (`paygate-merchant-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string for the merchant portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign session cookies (min 32 chars) |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | ✅ | Owner's Manus OpenID (for notifications) |
| `OWNER_NAME` | ✅ | Owner's display name |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | ✅ | Manus built-in APIs URL (frontend) |
| `MIDDLEWARE_BRIDGE_URL` | ⚠️ Optional | URL of the Go middleware bridge (Temporal, Kafka, Dapr). Falls back gracefully when absent. |
| `MIDDLEWARE_INTERNAL_KEY` | ⚠️ Optional | HMAC key for middleware bridge authentication |
| `AWS_ACCESS_KEY_ID` | ⚠️ Optional | S3-compatible storage access key (auto-injected by Manus) |
| `AWS_SECRET_ACCESS_KEY` | ⚠️ Optional | S3-compatible storage secret (auto-injected by Manus) |
| `AWS_REGION` | ⚠️ Optional | S3 region (auto-injected by Manus) |
| `S3_BUCKET_NAME` | ⚠️ Optional | S3 bucket name (auto-injected by Manus) |

---

## Consumer Portal (`paygate-consumer-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string for the consumer portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign consumer session tokens |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |
| `VITE_FRONTEND_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (frontend) |
| `VITE_FRONTEND_FORGE_API_URL` | ✅ | Manus built-in APIs URL (frontend) |
| `MERCHANT_PORTAL_URL` | ⚠️ Optional | Internal URL for merchant portal API calls |
| `AWS_ACCESS_KEY_ID` | ⚠️ Optional | S3 access key for KYC document uploads |
| `AWS_SECRET_ACCESS_KEY` | ⚠️ Optional | S3 secret for KYC document uploads |
| `AWS_REGION` | ⚠️ Optional | S3 region |
| `S3_BUCKET_NAME` | ⚠️ Optional | S3 bucket name |

---

## Admin Portal (`paygate-admin-portal`)

| Variable | Required | Description |
|---|---|---|
| `DATABASE_URL` | ✅ | PostgreSQL connection string for the admin portal DB |
| `JWT_SECRET` | ✅ | Secret used to sign admin session tokens |
| `ADMIN_DEFAULT_EMAIL` | ⚠️ Optional | Default super-admin email for first-run seeding |
| `ADMIN_DEFAULT_PASSWORD` | ⚠️ Optional | Default super-admin password (change immediately after first login) |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in APIs base URL |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Bearer token for Manus built-in APIs (server-side) |

---

## Go Middleware Bridge (`paygate-middleware`)

| Variable | Required | Description |
|---|---|---|
| `TEMPORAL_HOST` | ✅ | Temporal server host:port |
| `KAFKA_BROKERS` | ✅ | Comma-separated Kafka broker addresses |
| `DAPR_HTTP_PORT` | ✅ | Dapr sidecar HTTP port |
| `REDIS_URL` | ✅ | Redis connection URL for caching and rate limiting |
| `TIGERBEETLE_CLUSTER_ID` | ✅ | TigerBeetle cluster ID |
| `TIGERBEETLE_ADDRESSES` | ✅ | TigerBeetle node addresses |
| `INTERNAL_KEY` | ✅ | HMAC key for internal service authentication (must match `MIDDLEWARE_INTERNAL_KEY`) |
| `KEYCLOAK_URL` | ⚠️ Optional | Keycloak base URL for role sync |
| `KEYCLOAK_REALM` | ⚠️ Optional | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | ⚠️ Optional | Keycloak client ID |
| `KEYCLOAK_CLIENT_SECRET` | ⚠️ Optional | Keycloak client secret |
| `PERMIFY_URL` | ⚠️ Optional | Permify authorization service URL |
| `FLUVIO_URL` | ⚠️ Optional | Fluvio streaming platform URL |

---

## Security Notes

1. **JWT_SECRET** must be at least 32 characters of random entropy. Generate with: `openssl rand -base64 48`
2. **ADMIN_DEFAULT_PASSWORD** must be changed immediately after first login. The system enforces a minimum of 12 characters.
3. **MIDDLEWARE_INTERNAL_KEY** must match between the portal and bridge. Generate with: `openssl rand -hex 32`
4. All database passwords must be rotated before production go-live.
5. S3 bucket must have server-side encryption enabled (AES-256 or KMS).
6. Enable HTTPS/TLS termination at the load balancer level; the Node.js servers serve HTTP internally.

---

## Production Checklist

- [ ] All `✅ Required` variables are set in the deployment environment
- [ ] JWT_SECRET is at least 32 characters and unique per portal
- [ ] ADMIN_DEFAULT_PASSWORD has been changed after first login
- [ ] Database SSL mode is enabled (`?ssl=true` or `sslmode=require`)
- [ ] S3 bucket has server-side encryption enabled
- [ ] Rate limiting is tuned for expected production traffic
- [ ] CORS origins are restricted to known frontend domains
- [ ] Helmet security headers are enabled (already wired in all portals)
- [ ] Health check endpoints are configured at `/health`
- [ ] Log aggregation (e.g., Datadog, Loki) is connected
- [ ] Alerting is configured for error rate > 1% and p99 latency > 2s

## Wave 32/33 Microservice URLs (Optional — fall back to DB-only mode when absent)

| Variable | Default | Description |
|---|---|---|
| `INVENTORY_ENGINE_URL` | `http://localhost:8091` | Rust inventory cost engine HTTP API |
| `LOYALTY_LEDGER_URL` | `http://localhost:8092` | Rust loyalty points ledger HTTP API |
| `PAYROLL_SERVICE_URL` | `http://localhost:8093` | Python payroll calculation service |
| `KIOSK_HEALTH_URL` | `http://localhost:8094` | Python kiosk health anomaly detector |

These services are optional. When the environment variables are not set, the tRPC procedures fall back to direct PostgreSQL queries. For production, deploy each Rust/Python service and set the URLs accordingly.

### Starting Rust Services
```bash
# Inventory Engine (port 8091)
cd /home/ubuntu/paygate-middleware/rust/inventory-engine
DATABASE_URL="postgres://..." cargo run --release

# Loyalty Ledger (port 8092)
cd /home/ubuntu/paygate-middleware/rust/loyalty-ledger
DATABASE_URL="postgres://..." cargo run --release
```

### Starting Python Services
```bash
# Payroll Service (port 8093)
cd /home/ubuntu/paygate-middleware/python/payroll
DATABASE_URL="postgres://..." uvicorn payroll_service:app --host 0.0.0.0 --port 8093

# Kiosk Health Service (port 8094)
cd /home/ubuntu/paygate-middleware/python/kiosk_health
DATABASE_URL="postgres://..." uvicorn kiosk_health_service:app --host 0.0.0.0 --port 8094
```

---

## Wave 85+ Complete Variable Reference (All Services)

The following variables are used across all microservices, bridges, and integrations. All are **Optional** in development (stub/fallback mode) and **Required in production** when the corresponding service is deployed.

### Core Server
| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `development` | `development` or `production` |
| `PORT` | `3000` | HTTP server port |
| `ALLOWED_ORIGINS` | `*` | Comma-separated CORS allowed origins |
| `LOG_LEVEL` | `info` | `debug`, `info`, `warn`, `error` |
| `INTERNAL_API_KEY` | — | Internal service-to-service auth key |
| `PORTAL_TRPC_URL` | `/api/trpc` | tRPC endpoint URL |

### Keycloak (Enterprise SSO)
| Variable | Default | Description |
|---|---|---|
| `KEYCLOAK_URL` | — | Keycloak server base URL |
| `KEYCLOAK_REALM` | `paygate` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | — | Keycloak client ID |
| `KEYCLOAK_CLIENT_SECRET` | — | Keycloak client secret |
| `VITE_KEYCLOAK_URL` | — | Keycloak URL for frontend |

### Stripe (Portal Billing)
| Variable | Default | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | — | Stripe secret key (`sk_test_*` or `sk_live_*`) |
| `STRIPE_WEBHOOK_SECRET` | — | Stripe webhook signing secret (`whsec_*`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | — | Stripe publishable key (frontend) |
| `STRIPE_PORTAL_STARTER_PRICE_ID` | — | Stripe Price ID for Starter plan |
| `STRIPE_PORTAL_GROWTH_PRICE_ID` | — | Stripe Price ID for Growth plan |
| `STRIPE_PORTAL_ENTERPRISE_PRICE_ID` | — | Stripe Price ID for Enterprise plan |
| `STRIPE_PORTAL_SUCCESS_URL` | `/billing?success=1` | Checkout success redirect URL |
| `STRIPE_PORTAL_CANCEL_URL` | `/billing` | Checkout cancel redirect URL |

### Email (SMTP)
| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | — | SMTP server hostname |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | — | SMTP username/email |
| `SMTP_PASS` | — | SMTP password |

### Push Notifications
| Variable | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | — | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | — | VAPID private key for Web Push |
| `VAPID_SUBJECT` | `mailto:admin@paygate.ng` | VAPID subject |
| `PUSH_SERVICE_URL` | — | External push notification service URL |
| `PUSH_SERVICE_KEY` | — | External push service API key |
| `PUSH_SERVICE_GRPC_URL` | — | gRPC push service URL |
| `PUSH_TOKEN_CLEANUP_INTERVAL_MS` | `86400000` | Push token cleanup interval (ms) |
| `PUSH_TOKEN_STALE_DAYS` | `30` | Days before push token is stale |

### Redis
| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | — | Redis connection URL (`redis://...`) |

### gRPC Services
| Variable | Default | Description |
|---|---|---|
| `GRPC_BRIDGE_URL` | — | gRPC bridge proxy URL |
| `GRPC_TLS` | `false` | Enable TLS for gRPC connections |
| `GRPC_ANALYTICS_URL` | — | gRPC analytics service URL |
| `GRPC_CONSUMER_URL` | — | gRPC consumer service URL |
| `GRPC_FRAUD_URL` | — | gRPC fraud detection service URL |
| `GRPC_HEALTH_SERVICE_URL` | — | gRPC health check service URL |
| `GRPC_NOTIFY_URL` | — | gRPC notification service URL |
| `GRPC_OUTBOX_URL` | — | gRPC outbox relay service URL |
| `GRPC_USSD_URL` | — | gRPC USSD service URL |
| `ANALYTICS_SERVICE_GRPC_URL` | — | Analytics service gRPC URL |
| `CONSUMER_SERVICE_GRPC_URL` | — | Consumer service gRPC URL |
| `OUTBOX_RELAY_GRPC_URL` | — | Outbox relay gRPC URL |
| `USSD_SERVICE_GRPC_URL` | — | USSD service gRPC URL |

### NIBSS / NIP
| Variable | Default | Description |
|---|---|---|
| `NIBSS_GATEWAY_URL` | `https://nibss.paygate.ng` | NIBSS gateway URL |
| `NIBSS_INSTITUTION_CODE` | — | NIBSS institution code |
| `NIBSS_SECRET_KEY` | — | NIBSS secret key |
| `NIBSS_WEBHOOK_SECRET` | — | NIBSS webhook signing secret |
| `NIBSS_RTGS_KEY` | — | NIBSS RTGS API key |
| `NIBSS_RTGS_URL` | — | NIBSS RTGS endpoint URL |
| `NIP_API_KEY` | — | NIP API key |
| `NIP_BANK_LIST_URL` | — | NIP bank list endpoint URL |
| `NIP_BANK_REFRESH_INTERVAL_MS` | `86400000` | NIP bank list refresh interval (ms) |

### Mojaloop
| Variable | Default | Description |
|---|---|---|
| `MOJALOOP_URL` | — | Mojaloop hub URL |
| `MOJALOOP_API_KEY` | — | Mojaloop API key |

### Payments & Gateways
| Variable | Default | Description |
|---|---|---|
| `PAYMENT_LINK_BASE_URL` | `https://pay.paygate.ng` | Base URL for payment links |
| `MERCHANT_PORTAL_URL` | — | Merchant portal public URL |
| `PAYOUT_APPROVER_EMAIL` | — | Email for payout approval notifications |
| `FLUTTERWAVE_SECRET_KEY` | — | Flutterwave secret key |
| `FLUTTERWAVE_BASE_URL` | `https://api.flutterwave.com/v3` | Flutterwave API base URL |

### VTPass (Bill Payments)
| Variable | Default | Description |
|---|---|---|
| `VTPASS_API_KEY` | — | VTPass API key |
| `VTPASS_SECRET_KEY` | — | VTPass secret key |
| `VTPASS_SANDBOX` | `true` | Use VTPass sandbox (`true`/`false`) |

### Termii (SMS/OTP)
| Variable | Default | Description |
|---|---|---|
| `TERMII_API_KEY` | — | Termii API key for SMS/OTP |

### YouVerify (KYC/AML)
| Variable | Default | Description |
|---|---|---|
| `YOUVERIFY_API_KEY` | — | YouVerify API key for KYC verification |

### Fraud & Risk
| Variable | Default | Description |
|---|---|---|
| `FRAUD_SCORING_URL` | — | Fraud scoring microservice URL |
| `FRAUD_HEATMAP_URL` | — | Fraud heatmap service URL |
| `AML_MONITOR_URL` | — | AML monitoring service URL |
| `CREDIT_SCORING_URL` | — | Credit scoring service URL |
| `CREDIT_BUREAU_URL` | — | Credit bureau API URL |
| `CREDIT_BUREAU_API_KEY` | — | Credit bureau API key |

### Crypto & Digital Assets
| Variable | Default | Description |
|---|---|---|
| `CRYPTO_RAMP_URL` | — | Crypto on-ramp service URL |
| `NFT_SERVICE_URL` | — | NFT minting/management service URL |
| `NFT_RPC_URL` | — | Blockchain RPC URL for NFT operations |
| `NFT_CONTRACT_ADDRESS` | — | NFT smart contract address |
| `YELLOW_CARD_API_KEY` | — | Yellow Card crypto exchange API key |
| `YELLOW_CARD_API_URL` | — | Yellow Card API URL |

### Digital Gold
| Variable | Default | Description |
|---|---|---|
| `DIGITAL_GOLD_URL` | — | Digital gold trading service URL |
| `DIGITAL_GOLD_API_KEY` | — | Digital gold service API key |
| `DIGITAL_GOLD_SERVICE_URL` | — | Digital gold microservice URL |
| `GOLDTECH_API_KEY` | — | GoldTech provider API key |
| `GOLDTECH_API_URL` | — | GoldTech API URL |
| `GOLDTECH_BASE_URL` | `https://api.goldtech.ng` | GoldTech base URL |

### Insurance
| Variable | Default | Description |
|---|---|---|
| `INSURANCE_SERVICE_URL` | — | Insurance microservice URL |
| `INSURANCE_PROVIDER_URL` | — | Insurance provider API URL |
| `INSURANCE_API_KEY` | — | Insurance provider API key |
| `INSURANCE_PRICING_URL` | — | Insurance pricing engine URL |
| `CONSUMER_INSURANCE_URL` | — | Consumer insurance service URL |
| `AON_INSURANCE_URL` | — | AON insurance API URL |
| `AON_INSURANCE_API_KEY` | — | AON insurance API key |

### Pension / NPS
| Variable | Default | Description |
|---|---|---|
| `PENSION_SERVICE_URL` | — | Pension microservice URL |
| `PENSION_ADMIN_URL` | — | Pension admin portal URL |
| `PENSION_API_KEY` | — | Pension provider API key |
| `PENCOM_API_URL` | — | PENCOM (PFA) API URL |
| `PENCOM_API_KEY` | — | PENCOM API key |
| `NHF_URL` | — | National Housing Fund API URL |
| `NHF_API_KEY` | — | National Housing Fund API key |

### Wealth Management
| Variable | Default | Description |
|---|---|---|
| `WEALTH_ENGINE_URL` | — | Wealth management engine URL |
| `WEALTH_ADVISOR_URL` | — | AI wealth advisor service URL |
| `WEALTH_MGMT_SERVICE_URL` | — | Wealth management microservice URL |
| `COWRYWISE_API_KEY` | — | Cowrywise investment API key |
| `COWRYWISE_API_URL` | — | Cowrywise API URL |
| `COWRYWISE_BASE_URL` | `https://api.cowrywise.com` | Cowrywise base URL |
| `MUTUAL_FUNDS_URL` | — | Mutual funds service URL |
| `MUTUAL_FUNDS_SERVICE_URL` | — | Mutual funds microservice URL |

### Loyalty & Rewards
| Variable | Default | Description |
|---|---|---|
| `LOYALTY_LEDGER_URL` | `http://localhost:8092` | Loyalty ledger Rust service URL |
| `LOYALTY_MERCHANT_URL` | — | Loyalty merchant service URL |
| `REWARDS_ENGINE_URL` | — | Cashback/rewards engine URL |
| `CASHBACK_SERVICE_URL` | — | Cashback microservice URL |

### Carbon Credits
| Variable | Default | Description |
|---|---|---|
| `CARBON_ORACLE_URL` | — | Carbon price oracle URL |
| `CARBON_REGISTRY_URL` | — | Carbon registry API URL |
| `CARBON_REGISTRY_API_KEY` | — | Carbon registry API key |
| `CARBON_API_KEY` | — | Carbon credits service API key |

### Remittance & FX
| Variable | Default | Description |
|---|---|---|
| `REMITTANCE_SERVICE_URL` | — | Remittance microservice URL |
| `INTL_REMITTANCE_SERVICE_URL` | — | International remittance service URL |
| `FX_RATE_FEED_URL` | — | FX rate feed WebSocket/REST URL |
| `SWIFT_GPI_URL` | — | SWIFT GPI API URL |
| `SWIFT_API_KEY` | — | SWIFT API key |
| `WORLDREMIT_API_KEY` | — | WorldRemit API key |
| `WORLDREMIT_API_URL` | — | WorldRemit API URL |
| `WORLDREMIT_BASE_URL` | `https://api.worldremit.com` | WorldRemit base URL |

### EMI / BNPL
| Variable | Default | Description |
|---|---|---|
| `EMI_ENGINE_URL` | — | EMI calculation engine URL |
| `EMI_GATEWAY_URL` | — | EMI payment gateway URL |
| `EMI_SERVICE_URL` | — | EMI microservice URL |

### Payroll
| Variable | Default | Description |
|---|---|---|
| `PAYROLL_SERVICE_URL` | `http://localhost:8093` | Payroll processing service URL |
| `SALARY_SERVICE_URL` | — | Salary accounts service URL |
| `SALARY_BANK_URL` | — | Salary bank integration URL |

### Escrow
| Variable | Default | Description |
|---|---|---|
| `ESCROW_SERVICE_URL` | — | Escrow service URL |

### Open Banking / Finance
| Variable | Default | Description |
|---|---|---|
| `OPEN_FINANCE_URL` | — | Open Finance hub URL |
| `OPEN_FINANCE_REGISTRY_URL` | — | Open Finance provider registry URL |
| `OPEN_FINANCE_API_KEY` | — | Open Finance API key |
| `CBN_SANDBOX_URL` | — | CBN Open Banking sandbox URL |
| `CBN_SANDBOX_KEY` | — | CBN Open Banking sandbox key |

### Marketplace & Super App
| Variable | Default | Description |
|---|---|---|
| `MARKETPLACE_PAY_URL` | — | Marketplace payment service URL |
| `SUPER_APP_URL` | — | Super app orchestration service URL |
| `RETAIL_POS_URL` | — | Smart retail POS service URL |

### Inventory & Operations
| Variable | Default | Description |
|---|---|---|
| `INVENTORY_ENGINE_URL` | `http://localhost:8091` | Inventory management Rust service URL |
| `KIOSK_HEALTH_URL` | `http://localhost:8094` | Kiosk health monitoring service URL |
| `SOUNDBOX_GATEWAY_URL` | — | Soundbox payment gateway URL |
| `SOUNDBOX_MQTT_BROKER` | — | Soundbox MQTT broker URL |
| `SOUNDBOX_SERVICE_URL` | — | Soundbox management service URL |

### Bulk Operations
| Variable | Default | Description |
|---|---|---|
| `BULK_COLLECTIONS_URL` | — | Bulk collections service URL |
| `BULK_COLLECTIONS_SERVICE_URL` | — | Bulk collections microservice URL |
| `BULK_SCHEDULER_URL` | — | Bulk scheduler service URL |

### Analytics & Reporting
| Variable | Default | Description |
|---|---|---|
| `AI_INSIGHTS_URL` | — | AI insights service URL |
| `COHORT_ANALYTICS_URL` | — | Cohort analytics service URL |
| `REPORTS_SERVICE_URL` | — | Reports generation service URL |
| `REPORTS_BUCKET_NAME` | `paygate-reports` | S3 bucket name for generated reports |
| `QR_MERCHANT_ANALYTICS_URL` | — | QR merchant analytics service URL |

### Data Lake / Lakehouse
| Variable | Default | Description |
|---|---|---|
| `DELTA_LAKE_URL` | — | Delta Lake / data lake URL |
| `SPARK_THRIFT_URL` | — | Apache Spark Thrift server URL |

### Regulatory & Compliance
| Variable | Default | Description |
|---|---|---|
| `REGULATORY_REPORTING_URL` | — | Regulatory reporting service URL |
| `REGULATORY_REPORTING_API_KEY` | — | Regulatory reporting API key |
| `REG_SANDBOX_URL` | — | Regulatory sandbox service URL |
| `FIRS_TIN_URL` | — | FIRS TIN validation URL |
| `FIRS_API_KEY` | — | FIRS API key |
| `TAX_ENGINE_URL` | — | Tax calculation engine URL |
| `TAX_SERVICE_URL` | — | Tax service URL |
| `TAX_FILING_SERVICE_URL` | — | Tax filing service URL |
| `TAX_FILING_API_KEY` | — | Tax filing service API key |

### Settlement & Reconciliation
| Variable | Default | Description |
|---|---|---|
| `RECONCILIATION_ENGINE_URL` | — | Reconciliation engine service URL |
| `SETTLEMENT_FORECAST_URL` | — | Settlement forecast service URL |
| `NODAL_SERVICE_URL` | — | Nodal accounts service URL |
| `RTGS_URL` | — | RTGS payment service URL |

### SDK & White-Label
| Variable | Default | Description |
|---|---|---|
| `SDK_CDN_URL` | `https://cdn.paygate.ng/sdk` | SDK CDN base URL |
| `SDK_RELAY_URL` | — | SDK relay service URL |
| `WHITE_LABEL_SDK_URL` | — | White-label SDK service URL |
| `API_DOCS_URL` | — | API documentation service URL |

### Ollama (Local LLM)
| Variable | Default | Description |
|---|---|---|
| `OLLAMA_BASE_URL` | `http://localhost:11434` | Ollama server base URL |
| `OLLAMA_DEFAULT_MODEL` | `llama3.2` | Default Ollama model name |
| `OLLAMA_TIMEOUT_MS` | `60000` | Ollama request timeout (ms) |

### TigerBeetle (Ledger)
| Variable | Default | Description |
|---|---|---|
| `TIGERBEETLE_ADDRESS` | `localhost:3001` | TigerBeetle server address |

### Notifications
| Variable | Default | Description |
|---|---|---|
| `NOTIFICATION_PURGE_INTERVAL_MS` | `3600000` | Notification purge interval (ms) |
| `NOTIFICATION_RETENTION_DAYS` | `30` | Days to retain notifications |
| `READ_NOTIFICATION_RETENTION_DAYS` | `7` | Days to retain read notifications before purge |
| `SLA_ESCALATION_INTERVAL_MS` | `300000` | SLA escalation check interval (ms) |
| `SLA_ESCALATION_THRESHOLD_MS` | `86400000` | SLA breach threshold (ms) |
| `REALTIME_NOTIFICATIONS_URL` | — | Realtime notifications WebSocket service URL |

### USSD
| Variable | Default | Description |
|---|---|---|
| `USSD_GATEWAY_URL` | — | USSD gateway URL |

### Multi-Currency
| Variable | Default | Description |
|---|---|---|
| `MULTI_CURRENCY_URL` | — | Multi-currency wallet service URL |
| `MULTI_CURRENCY_LEDGER_URL` | — | Multi-currency ledger service URL |

### Privacy Payments
| Variable | Default | Description |
|---|---|---|
| `PRIVACY_SERVICE_URL` | — | Privacy payments service URL |

### USDC Monitoring
| Variable | Default | Description |
|---|---|---|
| `USDC_ALERT_THRESHOLD_USD` | `10000` | USDC balance alert threshold in USD |
| `USDC_MONITOR_INTERVAL_MS` | `900000` | USDC balance monitor interval (ms) |

### Versioned Service URLs
Variables follow the pattern `<SERVICE>_V<N>_URL` for versioned microservice deployments.
Examples: `AGENT_BANKING_V4_URL`, `BNPL_V2_URL`, `CRYPTO_OFFRAMP_V2_URL`, `ESCROW_V2_URL`,
`INVOICE_FINANCING_V2_URL`, `LOYALTY_V3_URL`, `MOBILE_MONEY_RECON_V2_URL`, `OPEN_BANKING_V2_URL`,
`PAYROLL_V3_URL`, `SUBSCRIPTION_V2_URL`, `SUPER_AGENT_V2_URL`, `USDC_V2_URL`, `USSD_SESSION_V2_URL`.

### Frontend-Only (VITE_*)
| Variable | Default | Description |
|---|---|---|
| `VITE_APP_TITLE` | `PayGate` | Application title in browser tab |
| `VITE_APP_LOGO` | — | CDN URL for application logo |

> **Note:** Variables prefixed `VITE_` are exposed to the frontend bundle — never put secrets in `VITE_*` variables.
