# PayGate Merchant Portal — Complete Environment Variables Reference (Wave 119)

This document is the authoritative reference for all environment variables across all services
in the PayGate Merchant Portal platform. It supersedes `environment-variables.md` and `ENV_REFERENCE.md`.

---

## Portal (Node.js / Express + tRPC)

| Variable | Required | Description | Example |
|---|---|---|---|
| `DATABASE_URL` | ✅ | MySQL/TiDB connection string | `mysql://paygate:secret@db:3306/paygate` |
| `JWT_SECRET` | ✅ | JWT signing secret (min 32 chars) | `your-32-char-minimum-secret-here-abc` |
| `INTERNAL_API_KEY` | ✅ | Internal service-to-service key | `internal-api-key-32-chars-minimum-here` |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID | `app_abc123` |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL | `https://oauth.manus.space` |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) | `https://portal.manus.space` |
| `OWNER_OPEN_ID` | ✅ | Owner's Manus OpenID | `user_abc123` |
| `OWNER_NAME` | ✅ | Owner's display name | `PayGate Admin` |
| `BUILT_IN_FORGE_API_URL` | ✅ | Manus built-in API base URL | `https://api.manus.space` |
| `BUILT_IN_FORGE_API_KEY` | ✅ | Manus built-in API key (server-side) | `forge_key_...` |
| `VITE_FRONTEND_FORGE_API_KEY` | ✅ | Manus built-in API key (frontend) | `forge_key_...` |
| `VITE_FRONTEND_FORGE_API_URL` | ✅ | Manus built-in API URL (frontend) | `https://api.manus.space` |
| `VITE_APP_TITLE` | ⬜ | App title shown in browser tab | `PayGate Merchant Portal` |
| `VITE_APP_LOGO` | ⬜ | App logo URL | `https://cdn.../logo.png` |
| `LOG_LEVEL` | ⬜ | Logging verbosity | `info` |
| `ALLOWED_ORIGINS` | ⬜ | CORS allowed origins (comma-separated) | `https://merchant.paygate.ng` |

---

## Stripe Payments

| Variable | Required | Description | Example |
|---|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook signature secret | `whsec_...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe publishable key (frontend) | `pk_live_...` |

---

## Middleware Services

| Variable | Required | Description | Default |
|---|---|---|---|
| `MIDDLEWARE_BRIDGE_URL` | ✅ | Go middleware bridge URL | `http://paygate-bridge:8090` |
| `MIDDLEWARE_INTERNAL_KEY` | ✅ | Bridge authentication key | — |
| `REDIS_URL` | ✅ | Redis connection URL | `redis://redis:6379` |
| `TEMPORAL_HOST_PORT` | ✅ | Temporal server address | `temporal:7233` |
| `TEMPORAL_NAMESPACE` | ⬜ | Temporal namespace | `paygate` |
| `KAFKA_BOOTSTRAP_SERVERS` | ✅ | Kafka broker addresses | `kafka:9092` |
| `FLUVIO_ENDPOINT` | ⬜ | Fluvio streaming endpoint | `fluvio:9003` |
| `TIGERBEETLE_ADDRESS` | ✅ | TigerBeetle ledger address | `tigerbeetle:3000` |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | ⬜ | OpenTelemetry collector endpoint | `http://otel-collector:4317` |
| `OTEL_SERVICE_NAME` | ⬜ | Service name for tracing | `paygate-portal` |

---

## Authentication & Authorization

| Variable | Required | Description | Default |
|---|---|---|---|
| `KEYCLOAK_URL` | ✅ | Keycloak base URL | `http://keycloak:8080` |
| `VITE_KEYCLOAK_URL` | ✅ | Keycloak URL (frontend) | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | ✅ | Keycloak realm name | `paygate` |
| `KEYCLOAK_CLIENT_ID` | ✅ | Keycloak client ID | `paygate-portal` |
| `KEYCLOAK_CLIENT_SECRET` | ✅ | Keycloak client secret | — |
| `PERMIFY_URL` | ✅ | Permify PBAC service URL | `http://permify:3476` |
| `PERMIFY_API_KEY` | ✅ | Permify API key | — |

---

## Payment Gateways

| Variable | Required | Description | Default |
|---|---|---|---|
| `MOJALOOP_URL` | ✅ | Mojaloop switch URL | `http://mojaloop:3000` |
| `MOJALOOP_API_KEY` | ✅ | Mojaloop API key | — |
| `NIBSS_GATEWAY_URL` | ✅ | NIBSS NIP gateway URL | `https://nibss-gateway.ng` |
| `NIBSS_INSTITUTION_CODE` | ✅ | NIBSS institution code | `000001` |
| `NIBSS_SECRET_KEY` | ✅ | NIBSS HMAC signing key | — |
| `NIBSS_WEBHOOK_SECRET` | ✅ | NIBSS webhook verification secret | — |
| `NIP_API_KEY` | ✅ | NIP direct API key | — |
| `USSD_GATEWAY_URL` | ⬜ | USSD gateway endpoint | `http://ussd-gateway:8080` |

---

## Notifications & Messaging

| Variable | Required | Description | Default |
|---|---|---|---|
| `SMTP_HOST` | ✅ | SMTP server hostname | `smtp.sendgrid.net` |
| `SMTP_PORT` | ✅ | SMTP server port | `587` |
| `SMTP_USER` | ✅ | SMTP username | `apikey` |
| `SMTP_PASS` | ✅ | SMTP password / API key | — |
| `TERMII_API_KEY` | ⬜ | Termii SMS API key (Nigeria) | — |
| `PUSH_SERVICE_URL` | ⬜ | Push notification service URL | — |
| `PUSH_SERVICE_KEY` | ⬜ | Push notification service key | — |
| `VAPID_PUBLIC_KEY` | ⬜ | VAPID public key for Web Push | — |
| `VAPID_PRIVATE_KEY` | ⬜ | VAPID private key for Web Push | — |
| `VAPID_SUBJECT` | ⬜ | VAPID subject (mailto: or URL) | `mailto:admin@paygate.ng` |

---

## Analytics & Monitoring

| Variable | Required | Description | Default |
|---|---|---|---|
| `VITE_ANALYTICS_ENDPOINT` | ⬜ | Analytics tracking endpoint | — |
| `VITE_ANALYTICS_WEBSITE_ID` | ⬜ | Analytics website/property ID | — |
| `FRAUD_SCORING_URL` | ⬜ | Fraud scoring microservice URL | `http://fraud-scorer:8080` |
| `SYNC_RELAY_URL` | ⬜ | Sync relay service URL | — |
| `SYNC_RELAY_KEY` | ⬜ | Sync relay authentication key | — |

---

## Compliance & KYC

| Variable | Required | Description | Default |
|---|---|---|---|
| `YOUVERIFY_API_KEY` | ✅ | YouVerify KYC API key | — |

---

## Billing Engine

| Variable | Required | Description | Default |
|---|---|---|---|
| `PG_DATABASE_URL` | ✅ | PostgreSQL URL for billing engine | `postgresql://paygate:secret@db:5432/paygate` |
| `PORTAL_TRPC_URL` | ✅ | Portal tRPC API URL | `http://portal:3000/api/trpc` |
| `PAYOUT_APPROVER_EMAIL` | ⬜ | Email for payout approval notifications | `payouts@paygate.ng` |
| `PAYMENT_LINK_BASE_URL` | ⬜ | Base URL for payment links | `https://pay.paygate.ng` |
| `MERCHANT_PORTAL_URL` | ⬜ | Merchant portal public URL | `https://merchant.paygate.ng` |

---

## VTPass (Bill Payments)

| Variable | Required | Description | Default |
|---|---|---|---|
| `VTPASS_API_KEY` | ⬜ | VTPass API key | — |
| `VTPASS_SECRET_KEY` | ⬜ | VTPass secret key | — |
| `VTPASS_SANDBOX` | ⬜ | Enable VTPass sandbox mode | `true` |

---

## Rust Billing Core (billing-engine/rust-billing-core)

| Variable | Required | Description | Default |
|---|---|---|---|
| `RUST_BILLING_PORT` | ⬜ | HTTP port for billing core | `8093` |
| `TIGERBEETLE_ADDRESS` | ✅ | TigerBeetle address | `tigerbeetle:3000` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string | — |
| `KAFKA_BOOTSTRAP_SERVERS` | ✅ | Kafka brokers | `kafka:9092` |
| `RUST_LOG` | ⬜ | Rust log level | `info` |

---

## Go Event Ingestor (billing-engine/go-event-ingestor)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8094` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string | — |
| `KAFKA_BOOTSTRAP_SERVERS` | ✅ | Kafka brokers | `kafka:9092` |
| `FLUVIO_ENDPOINT` | ⬜ | Fluvio endpoint | `fluvio:9003` |
| `TIGERBEETLE_ADDRESS` | ✅ | TigerBeetle address | `tigerbeetle:3000` |
| `BILLING_CORE_URL` | ⬜ | Rust billing core URL | `http://billing-core:8093` |

---

## Go Onboarding Workflow (billing-engine/go-onboarding-workflow)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8095` |
| `TEMPORAL_HOST_PORT` | ✅ | Temporal server address | `temporal:7233` |
| `TEMPORAL_NAMESPACE` | ⬜ | Temporal namespace | `paygate` |
| `PORTAL_TRPC_URL` | ✅ | Portal tRPC URL | `http://portal:3000/api/trpc` |
| `INTERNAL_API_KEY` | ✅ | Portal auth key | — |

---

## Go Audit RBAC (billing-engine/go-audit-rbac)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8096` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string | — |
| `KEYCLOAK_URL` | ✅ | Keycloak URL | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | ✅ | Keycloak realm | `paygate` |
| `KEYCLOAK_CLIENT_ID` | ✅ | Keycloak client ID | `paygate-billing` |
| `KEYCLOAK_CLIENT_SECRET` | ✅ | Keycloak client secret | — |
| `PERMIFY_URL` | ✅ | Permify URL | `http://permify:3476` |
| `PERMIFY_API_KEY` | ✅ | Permify API key | — |
| `OPENSEARCH_URL` | ✅ | OpenSearch URL | `http://opensearch:9200` |
| `OPENSEARCH_INDEX` | ⬜ | OpenSearch audit index | `paygate-billing-audit` |

---

## Python Settlement Bridge (billing-engine/python-settlement-lakehouse)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8097` |
| `MOJALOOP_URL` | ✅ | Mojaloop switch URL | — |
| `MOJALOOP_API_KEY` | ✅ | Mojaloop API key | — |
| `KAFKA_BOOTSTRAP_SERVERS` | ✅ | Kafka brokers | `kafka:9092` |
| `DATABASE_URL` | ✅ | PostgreSQL connection string | — |
| `LAKEHOUSE_URL` | ⬜ | Data lakehouse endpoint | — |
| `LAKEHOUSE_API_KEY` | ⬜ | Lakehouse API key | — |

---

## Python USSD Fallback (python-services/merchant-ussd-fallback)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8080` |
| `PORTAL_BASE_URL` | ✅ | Portal URL for config fetch | `http://portal:3000` |
| `INTERNAL_API_KEY` | ✅ | Portal auth key | — |
| `REDIS_URL` | ✅ | Redis URL for language prefs | `redis://redis:6379` |
| `LANG_PICKER_ENABLED` | ⬜ | Enable USSD language picker | `true` |
| `DEFAULT_LANGUAGE` | ⬜ | Default USSD language | `en` |
| `CONFIG_REFRESH_INTERVAL_SECS` | ⬜ | Config refresh interval | `300` |
| `TERMII_API_KEY` | ⬜ | Termii SMS key | — |

---

## Go Middleware Bridge (middleware-bridge/)

| Variable | Required | Description | Default |
|---|---|---|---|
| `PORT` | ⬜ | HTTP port | `8090` |
| `KAFKA_BOOTSTRAP_SERVERS` | ✅ | Kafka brokers | `kafka:9092` |
| `FLUVIO_ENDPOINT` | ⬜ | Fluvio endpoint | `fluvio:9003` |
| `REDIS_URL` | ✅ | Redis URL | `redis://redis:6379` |
| `TEMPORAL_HOST_PORT` | ✅ | Temporal address | `temporal:7233` |
| `TIGERBEETLE_ADDRESS` | ✅ | TigerBeetle address | `tigerbeetle:3000` |
| `OPENSEARCH_URL` | ✅ | OpenSearch URL | `http://opensearch:9200` |
| `KEYCLOAK_URL` | ✅ | Keycloak URL | `http://keycloak:8080` |
| `PERMIFY_URL` | ✅ | Permify URL | `http://permify:3476` |
| `INTERNAL_API_KEY` | ✅ | Internal auth key | — |

---

## Wave 119 New Variables

The following variables were added or documented in Wave 119:

| Variable | Service | Description |
|---|---|---|
| `OPENSEARCH_URL` | Go Audit RBAC, Middleware Bridge | OpenSearch cluster URL for audit log indexing |
| `OPENSEARCH_INDEX` | Go Audit RBAC | Audit log index name |
| `LAKEHOUSE_URL` | Python Settlement | Data lakehouse ingest endpoint |
| `LAKEHOUSE_API_KEY` | Python Settlement | Lakehouse authentication key |
| `CONFIG_REFRESH_INTERVAL_SECS` | USSD Fallback | How often to refresh merchant config from portal |

---

## Quick Setup Checklist

For a minimal development environment, these variables are required:

```bash
# Portal
DATABASE_URL=mysql://paygate:secret@localhost:3306/paygate
JWT_SECRET=dev-jwt-secret-at-least-32-chars-long
INTERNAL_API_KEY=dev-internal-key-at-least-32-chars
VITE_APP_ID=dev-app-id
OAUTH_SERVER_URL=https://oauth.manus.space
VITE_OAUTH_PORTAL_URL=https://portal.manus.space

# Middleware (can be disabled in dev with fallbacks)
REDIS_URL=redis://localhost:6379
MIDDLEWARE_BRIDGE_URL=http://localhost:8090
MIDDLEWARE_INTERNAL_KEY=dev-bridge-key

# Billing Engine
TIGERBEETLE_ADDRESS=localhost:3000
KAFKA_BOOTSTRAP_SERVERS=localhost:9092
TEMPORAL_HOST_PORT=localhost:7233

# Auth
KEYCLOAK_URL=http://localhost:8080
KEYCLOAK_REALM=paygate
KEYCLOAK_CLIENT_ID=paygate-portal
KEYCLOAK_CLIENT_SECRET=dev-keycloak-secret
PERMIFY_URL=http://localhost:3476
PERMIFY_API_KEY=dev-permify-key
```

All services gracefully degrade when optional middleware is unavailable in development.
See `billing-engine/tests/smoke_test.sh` for health check verification.
