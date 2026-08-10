# PayGate Merchant Portal — Environment Variables Reference

This document describes all environment variables required to run the PayGate Merchant Portal.
All secrets must be configured via the platform's Secrets panel (Settings → Secrets) or injected
via your CI/CD pipeline. **Never commit secrets to version control.**

## Core Application

| Variable | Default | Description |
|---|---|---|
| `NODE_ENV` | `production` | Runtime environment (`development`, `production`) |
| `PORT` | `3000` | HTTP server port |
| `LOG_LEVEL` | `info` | Logging verbosity (`debug`, `info`, `warn`, `error`) |

## Database

| Variable | Required | Description |
|---|---|---|
| `PG_DATABASE_URL` | ✅ | PostgreSQL connection string |

## Authentication

| Variable | Required | Description |
|---|---|---|
| `JWT_SECRET` | ✅ | Session cookie signing secret (min 32 chars) |
| `VITE_APP_ID` | ✅ | Manus OAuth application ID |
| `OAUTH_SERVER_URL` | ✅ | Manus OAuth backend base URL |
| `VITE_OAUTH_PORTAL_URL` | ✅ | Manus login portal URL (frontend) |
| `OWNER_OPEN_ID` | ✅ | Owner's Manus Open ID |
| `OWNER_NAME` | ✅ | Owner's display name |

## Stripe Payments

| Variable | Required | Description |
|---|---|---|
| `STRIPE_SECRET_KEY` | ✅ | Stripe secret key (`sk_test_...` or `sk_live_...`) |
| `STRIPE_WEBHOOK_SECRET` | ✅ | Stripe webhook endpoint secret (`whsec_...`) |
| `VITE_STRIPE_PUBLISHABLE_KEY` | ✅ | Stripe publishable key (`pk_test_...` or `pk_live_...`) |

## Email (SMTP)

| Variable | Required | Description |
|---|---|---|
| `SMTP_HOST` | ✅ | SMTP server hostname |
| `SMTP_PORT` | ✅ | SMTP server port (587 for TLS, 465 for SSL) |
| `SMTP_USER` | ✅ | SMTP username / email address |
| `SMTP_PASS` | ✅ | SMTP password or app password |

## SMS / OTP

| Variable | Required | Description |
|---|---|---|
| `TERMII_API_KEY` | ✅ | Termii SMS API key for OTP delivery |

## KYC Verification

| Variable | Required | Description |
|---|---|---|
| `YOUVERIFY_API_KEY` | ✅ | YouVerify API key for identity verification |

## Bill Payments (VTPass)

| Variable | Required | Description |
|---|---|---|
| `VTPASS_API_KEY` | ✅ | VTPass API key |
| `VTPASS_SECRET_KEY` | ✅ | VTPass secret key |
| `VTPASS_SANDBOX` | — | `true` for sandbox mode (default: `true`) |

## NIBSS / NIP (Bank Transfers)

| Variable | Required | Description |
|---|---|---|
| `NIBSS_GATEWAY_URL` | ✅ | NIBSS gateway base URL |
| `NIBSS_INSTITUTION_CODE` | ✅ | Your institution code assigned by NIBSS |
| `NIBSS_SECRET_KEY` | ✅ | NIBSS API secret key |
| `NIBSS_WEBHOOK_SECRET` | ✅ | NIBSS webhook verification secret |
| `NIP_API_KEY` | ✅ | NIP (NIBSS Instant Payment) API key |

## Redis Cache

| Variable | Required | Description |
|---|---|---|
| `REDIS_URL` | ✅ | Redis connection URL (`redis://host:6379`) |

## CORS

| Variable | Required | Description |
|---|---|---|
| `ALLOWED_ORIGINS` | ✅ | Comma-separated list of allowed CORS origins |

## Push Notifications (Web Push / VAPID)

| Variable | Required | Description |
|---|---|---|
| `VAPID_PUBLIC_KEY` | ✅ | VAPID public key for Web Push |
| `VAPID_PRIVATE_KEY` | ✅ | VAPID private key for Web Push |
| `VAPID_SUBJECT` | ✅ | VAPID subject (mailto: or https: URL) |
| `PUSH_SERVICE_URL` | — | External push notification service URL |
| `PUSH_SERVICE_KEY` | — | External push notification service API key |

## Observability

| Variable | Required | Description |
|---|---|---|
| `OTEL_SERVICE_NAME` | — | OpenTelemetry service name |
| `OTEL_EXPORTER_OTLP_ENDPOINT` | — | OTLP exporter endpoint |

## Analytics

| Variable | Required | Description |
|---|---|---|
| `VITE_ANALYTICS_ENDPOINT` | — | Analytics server endpoint |
| `VITE_ANALYTICS_WEBSITE_ID` | — | Analytics website identifier |

## Middleware / Bridge

| Variable | Required | Description |
|---|---|---|
| `MIDDLEWARE_BRIDGE_URL` | — | Internal middleware bridge URL |
| `MIDDLEWARE_INTERNAL_KEY` | — | Middleware authentication key |
| `INTERNAL_API_KEY` | — | Internal API authentication key |
| `PORTAL_TRPC_URL` | — | tRPC endpoint URL for inter-service calls |

## Payment Operations

| Variable | Required | Description |
|---|---|---|
| `PAYMENT_LINK_BASE_URL` | ✅ | Base URL for payment links |
| `PAYOUT_APPROVER_EMAIL` | ✅ | Email address for payout approval notifications |

## Mojaloop (Interoperability)

| Variable | Required | Description |
|---|---|---|
| `MOJALOOP_URL` | — | Mojaloop API base URL |
| `MOJALOOP_API_KEY` | — | Mojaloop API key |

## USSD Gateway

| Variable | Required | Description |
|---|---|---|
| `USSD_GATEWAY_URL` | — | USSD gateway base URL |

## Temporal Workflow Engine

| Variable | Required | Description |
|---|---|---|
| `TEMPORAL_HOST_PORT` | — | Temporal server host:port |
| `TEMPORAL_NAMESPACE` | — | Temporal namespace |

## Fraud Scoring

| Variable | Required | Description |
|---|---|---|
| `FRAUD_SCORING_URL` | — | Internal fraud scoring service URL |

## Permify (Authorization)

| Variable | Required | Description |
|---|---|---|
| `PERMIFY_URL` | — | Permify authorization service URL |
| `PERMIFY_API_KEY` | — | Permify API key |

## Keycloak (Enterprise SSO)

| Variable | Required | Description |
|---|---|---|
| `KEYCLOAK_URL` | — | Keycloak server URL |
| `KEYCLOAK_REALM` | — | Keycloak realm name |
| `KEYCLOAK_CLIENT_ID` | — | Keycloak client ID |
| `KEYCLOAK_CLIENT_SECRET` | — | Keycloak client secret |
| `VITE_KEYCLOAK_URL` | — | Keycloak URL for frontend |

## Event Streaming

| Variable | Required | Description |
|---|---|---|
| `FLUVIO_ENDPOINT` | — | Fluvio streaming endpoint |
| `KAFKA_BOOTSTRAP_SERVERS` | — | Kafka bootstrap server addresses |

## TigerBeetle Ledger

| Variable | Required | Description |
|---|---|---|
| `TIGERBEETLE_ADDRESS` | — | TigerBeetle server address |

## Sync Relay

| Variable | Required | Description |
|---|---|---|
| `SYNC_RELAY_URL` | — | Sync relay service URL |
| `SYNC_RELAY_KEY` | — | Sync relay authentication key |

## App Branding

| Variable | Required | Description |
|---|---|---|
| `VITE_APP_TITLE` | — | Application title shown in the browser |
| `VITE_APP_LOGO` | — | URL to the application logo image |

## Manus Built-in APIs

| Variable | Required | Description |
|---|---|---|
| `BUILT_IN_FORGE_API_URL` | — | Manus built-in API base URL |
| `BUILT_IN_FORGE_API_KEY` | — | Manus built-in API key (server-side) |
| `VITE_FRONTEND_FORGE_API_URL` | — | Manus built-in API URL for frontend |
| `VITE_FRONTEND_FORGE_API_KEY` | — | Manus built-in API key (frontend) |

---

## Generating VAPID Keys

```bash
npx web-push generate-vapid-keys
```

## Generating a Strong JWT Secret

```bash
node -e "console.log(require('crypto').randomBytes(48).toString('hex'))"
```
