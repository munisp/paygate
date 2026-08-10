# PayGate Environment Variables Reference

All environment variables are pre-configured via the platform secrets manager. This document serves as a reference for local development and deployment.

## Core Application

| Variable | Default | Description |
|---|---|---|
| `VITE_APP_TITLE` | `PayGate` | App display name |
| `VITE_APP_ID` | *(injected)* | Manus OAuth App ID |
| `VITE_APP_LOGO` | *(CDN URL)* | Logo URL |

## Database

| Variable | Default | Description |
|---|---|---|
| `DATABASE_URL` | *(injected)* | MySQL/TiDB connection string |
| `PG_DATABASE_URL` | *(injected)* | PostgreSQL for analytics/lakehouse |

## Authentication

| Variable | Default | Description |
|---|---|---|
| `JWT_SECRET` | *(injected)* | Session cookie signing secret (min 32 chars) |
| `OAUTH_SERVER_URL` | *(injected)* | Manus OAuth backend |
| `VITE_OAUTH_PORTAL_URL` | *(injected)* | Manus login portal |
| `OWNER_OPEN_ID` | *(injected)* | Owner Manus OpenID |
| `OWNER_NAME` | *(injected)* | Owner display name |

## Keycloak (Identity Provider)

| Variable | Default | Description |
|---|---|---|
| `KEYCLOAK_URL` | `http://localhost:8080` | Keycloak server URL |
| `KEYCLOAK_REALM` | `paygate` | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | `paygate-backend` | Keycloak client ID |
| `KEYCLOAK_CLIENT_SECRET` | *(injected)* | Keycloak client secret |
| `VITE_KEYCLOAK_URL` | `http://localhost:8080` | Frontend Keycloak URL |

## Permify (Authorization)

| Variable | Default | Description |
|---|---|---|
| `PERMIFY_URL` | `http://localhost:3476` | Permify gRPC/HTTP URL |
| `PERMIFY_API_KEY` | *(injected)* | Permify API key |

## Redis

| Variable | Default | Description |
|---|---|---|
| `REDIS_URL` | `redis://localhost:6379` | Redis connection URL |

## Kafka / Event Streaming

| Variable | Default | Description |
|---|---|---|
| `KAFKA_BOOTSTRAP_SERVERS` | `localhost:9092` | Kafka broker addresses |
| `FLUVIO_ENDPOINT` | `localhost:9003` | Fluvio streaming endpoint |

## Temporal (Workflow Engine)

| Variable | Default | Description |
|---|---|---|
| `TEMPORAL_HOST_PORT` | `localhost:7233` | Temporal server address |
| `TEMPORAL_NAMESPACE` | `paygate-production` | Temporal namespace |

## TigerBeetle (Ledger)

| Variable | Default | Description |
|---|---|---|
| `TIGERBEETLE_ADDRESS` | `localhost:3000` | TigerBeetle cluster address |

## Stripe (Payments)

| Variable | Default | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | *(injected)* | Stripe secret key |
| `VITE_STRIPE_PUBLISHABLE_KEY` | *(injected)* | Stripe publishable key |
| `STRIPE_WEBHOOK_SECRET` | *(injected)* | Stripe webhook signing secret |

## NIBSS (Nigeria Interbank Settlement System)

| Variable | Default | Description |
|---|---|---|
| `NIBSS_GATEWAY_URL` | *(injected)* | NIBSS API gateway URL |
| `NIBSS_INSTITUTION_CODE` | *(injected)* | Your NIBSS institution code |
| `NIBSS_SECRET_KEY` | *(injected)* | NIBSS API secret key |
| `NIBSS_WEBHOOK_SECRET` | *(injected)* | NIBSS webhook verification secret |
| `NIP_API_KEY` | *(injected)* | NIP (NIBSS Instant Payment) API key |

## Mojaloop (Open Finance)

| Variable | Default | Description |
|---|---|---|
| `MOJALOOP_URL` | `http://localhost:8200` | Mojaloop FSPIOP adapter URL |
| `MOJALOOP_API_KEY` | *(injected)* | Mojaloop API key |

## Cross-Border Rail URLs

| Variable | Default | Description |
|---|---|---|
| `CIPS_GATEWAY_URL` | `http://localhost:8201` | CIPS (China) gateway URL |
| `UPI_GATEWAY_URL` | `http://localhost:8202` | UPI (India) gateway URL |
| `PIX_GATEWAY_URL` | `http://localhost:8203` | PIX (Brazil) gateway URL |

## Middleware Bridge

| Variable | Default | Description |
|---|---|---|
| `MIDDLEWARE_BRIDGE_URL` | `http://localhost:8090` | Go bridge service URL |
| `MIDDLEWARE_INTERNAL_KEY` | *(injected)* | Internal auth key for bridge |
| `INTERNAL_API_KEY` | *(injected)* | Internal service-to-service key |

## Manus Built-in APIs

| Variable | Default | Description |
|---|---|---|
| `BUILT_IN_FORGE_API_URL` | *(injected)* | Manus built-in API URL |
| `BUILT_IN_FORGE_API_KEY` | *(injected)* | Manus built-in API key (server-side) |
| `VITE_FRONTEND_FORGE_API_URL` | *(injected)* | Frontend API URL |
| `VITE_FRONTEND_FORGE_API_KEY` | *(injected)* | Frontend API key |

## SMTP (Email)

| Variable | Default | Description |
|---|---|---|
| `SMTP_HOST` | `smtp.gmail.com` | SMTP server host |
| `SMTP_PORT` | `587` | SMTP server port |
| `SMTP_USER` | *(injected)* | SMTP username/email |
| `SMTP_PASS` | *(injected)* | SMTP password or app password |

## Push Notifications

| Variable | Default | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | *(injected)* | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | *(injected)* | VAPID private key for Web Push |
| `VAPID_SUBJECT` | `mailto:admin@paygate.com` | VAPID contact email |
| `PUSH_SERVICE_URL` | `http://localhost:8236` | Push notification service URL |
| `PUSH_SERVICE_KEY` | *(injected)* | Push service auth key |

## Third-Party Services

| Variable | Default | Description |
|---|---|---|
| `TERMII_API_KEY` | *(injected)* | Termii SMS API key |
| `VTPASS_API_KEY` | *(injected)* | VTPass API key |
| `VTPASS_SECRET_KEY` | *(injected)* | VTPass secret key |
| `VTPASS_SANDBOX` | `true` | Use VTPass sandbox (set `false` for production) |
| `YOUVERIFY_API_KEY` | *(injected)* | YouVerify KYC API key |

## Observability

| Variable | Default | Description |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | `http://localhost:4317` | OTLP collector endpoint |
| `OTEL_SERVICE_NAME` | `paygate-merchant-portal` | Service name for traces/metrics |
| `LOG_LEVEL` | `info` | Log level: `debug\|info\|warn\|error` |

## Analytics

| Variable | Default | Description |
|---|---|---|
| `VITE_ANALYTICS_ENDPOINT` | *(injected)* | Analytics ingestion endpoint |
| `VITE_ANALYTICS_WEBSITE_ID` | *(injected)* | Analytics website ID |

## Python Microservice URLs

| Variable | Default Port | Service |
|---|---|---|
| `AI_INSIGHTS_URL` | `8220` | AI Insights service |
| `AML_MONITOR_URL` | `8221` | AML monitoring |
| `CASHBACK_REWARDS_URL` | `8222` | Cashback rewards engine |
| `COHORT_ANALYTICS_URL` | `8223` | Cohort analytics |
| `CREDIT_SCORING_PY_URL` | `8224` | Python credit scoring |
| `EMI_SERVICE_URL` | `8225` | EMI calculation service |
| `FRAUD_HEATMAP_URL` | `8226` | Fraud heatmap service |
| `FRAUD_SCORING_URL` | `8100` | Fraud scoring engine |
| `FX_RATE_FEED_URL` | `8227` | FX rate feed |
| `INSURANCE_PRICING_URL` | `8228` | Insurance pricing |
| `ISO20022_PARSER_URL` | `8229` | ISO 20022 message parser |
| `KIOSK_HEALTH_URL` | `8230` | Kiosk health monitor |
| `KYC_OCR_PY_URL` | `8231` | KYC OCR service |
| `LAKEHOUSE_AUDIT_URL` | `8232` | Lakehouse audit service |
| `LIVENESS_DETECTION_URL` | `8233` | Liveness detection |
| `MPESA_CONNECTOR_URL` | `8234` | M-Pesa connector |
| `PENSION_NPS_URL` | `8235` | Pension/NPS service |
| `RECONCILIATION_ENGINE_URL` | `8237` | Reconciliation engine |
| `SETTLEMENT_FORECAST_URL` | `8238` | Settlement forecast |
| `SPARK_COMPACTION_URL` | `8239` | Spark compaction |
| `USDC_LAKEHOUSE_URL` | `8240` | USDC lakehouse consumer |
| `USSD_GATEWAY_URL` | `8241` | USSD gateway |
| `WEALTH_MANAGEMENT_URL` | `8242` | Wealth management |
| `VECTOR_STORE_URL` | `8243` | Vector store |
| `KNOWLEDGE_GRAPH_URL` | `8244` | Knowledge graph |
| `WEALTH_ADVISOR_URL` | `8245` | Wealth advisor |
| `CIPS_UPI_PIX_FX_URL` | `8246` | CIPS/UPI/PIX FX service |
| `OPENSEARCH_SERVICE_URL` | `8247` | OpenSearch service |
| `ART_REASONING_URL` | `8248` | ART reasoning engine |
| `COCOINDEX_URL` | `8249` | CocoIndex service |
| `LAKEHOUSE_AI_URL` | `8250` | Lakehouse AI |
| `GNN_FRAUD_URL` | `8140` | GNN fraud detection |

## Rust Microservice URLs

| Variable | Default Port | Service |
|---|---|---|
| `BILLING_ENGINE_URL` | `8210` | Billing engine |
| `CREDIT_SCORING_URL` | `8211` | Rust credit scoring |
| `INVENTORY_ENGINE_URL` | `8212` | Inventory engine |
| `KYC_OCR_ENGINE_URL` | `8213` | KYC OCR engine |
| `LOYALTY_LEDGER_URL` | `8214` | Loyalty ledger |
| `TIGERBEETLE_RECON_URL` | `8215` | TigerBeetle recon |
| `WALLET_FFI_URL` | `8216` | Wallet FFI |
| `CROSS_BORDER_FRAUD_URL` | `8217` | Cross-border fraud engine |
| `TIGERBEETLE_LEDGER_URL` | `8218` | TigerBeetle ledger |

## Production Checklist

Before going live, verify:

- `JWT_SECRET` is a cryptographically random 64-character string
- All SMTP credentials are set and tested
- `NIBSS_SECRET_KEY` and `NIBSS_INSTITUTION_CODE` are from NIBSS production
- `STRIPE_SECRET_KEY` is the live key (not `sk_test_...`)
- `KEYCLOAK_CLIENT_SECRET` is rotated from default
- VAPID keys are generated with `npx web-push generate-vapid-keys`
- `ALLOWED_ORIGINS` includes only your production domain(s)
- `VTPASS_SANDBOX=false` for production bill payments
- All microservice URLs point to production Docker/K8s services
- `DATABASE_URL` and `PG_DATABASE_URL` use SSL (`?ssl=true&sslmode=require`)
- Redis is configured with AUTH password in production
- Temporal namespace is created in production cluster
- TigerBeetle cluster has 3+ replicas for HA
