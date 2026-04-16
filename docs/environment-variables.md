# PayGate Merchant Portal — Environment Variables Reference

This document lists all environment variables used by the PayGate Merchant Portal.
Copy this reference to create your deployment `.env` file.

---

## Required Variables

| Variable | Description | Example |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | `postgresql://paygate:secret@db:5432/paygate` |
| `JWT_SECRET` | JWT signing secret (min 32 chars) | `your-32-char-minimum-secret-here-abc` |
| `INTERNAL_API_KEY` | Internal service-to-service key (min 32 chars) | `internal-api-key-32-chars-minimum-here` |
| `VITE_APP_ID` | Manus OAuth application ID | `app_abc123` |
| `OAUTH_SERVER_URL` | Manus OAuth backend base URL | `https://oauth.manus.space` |
| `VITE_OAUTH_PORTAL_URL` | Manus login portal URL | `https://portal.manus.space` |

---

## Stripe Payments

| Variable | Description | Example |
|---|---|---|
| `STRIPE_SECRET_KEY` | Stripe secret key | `sk_live_...` |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature secret | `whsec_...` |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Stripe publishable key (frontend) | `pk_live_...` |

---

## Middleware Services

| Variable | Description | Default |
|---|---|---|
| `MIDDLEWARE_BRIDGE_URL` | Go middleware bridge URL | `http://paygate-bridge:8090` |
| `MIDDLEWARE_INTERNAL_KEY` | Bridge authentication key | — |
| `REDIS_URL` | Redis connection URL | `redis://redis:6379` |
| `TEMPORAL_HOST_PORT` | Temporal server address | `temporal:7233` |
| `TEMPORAL_NAMESPACE` | Temporal namespace | `paygate` |
| `KAFKA_BOOTSTRAP_SERVERS` | Kafka broker addresses | `kafka:9092` |
| `FLUVIO_ENDPOINT` | Fluvio streaming endpoint | `fluvio:9003` |

---

## Nigerian Payment Infrastructure

| Variable | Description |
|---|---|
| `NIBSS_GATEWAY_URL` | NIBSS NIP gateway URL |
| `NIBSS_INSTITUTION_CODE` | Your NIBSS institution code |
| `NIBSS_SECRET_KEY` | NIBSS API secret (min 16 chars) |
| `NIBSS_WEBHOOK_SECRET` | NIBSS webhook verification secret |
| `NIP_API_KEY` | NIP name enquiry API key |
| `MOJALOOP_URL` | Mojaloop hub URL |
| `MOJALOOP_API_KEY` | Mojaloop API key |
| `VTPASS_API_KEY` | VTpass bill payments API key |
| `VTPASS_SECRET_KEY` | VTpass secret key |
| `VTPASS_SANDBOX` | Use VTpass sandbox (`true`/`false`) |
| `TERMII_API_KEY` | Termii SMS OTP API key |
| `YOUVERIFY_API_KEY` | Youverify KYC (BVN/NIN) API key |
| `USSD_GATEWAY_URL` | USSD gateway URL |

---

## KYC / Identity Services

| Variable | Description |
|---|---|
| `FRAUD_SCORING_URL` | Fraud scoring microservice URL |
| `PERMIFY_URL` | Permify authorization service URL |
| `PERMIFY_API_KEY` | Permify API key |

---

## Authentication (Keycloak)

| Variable | Description | Default |
|---|---|---|
| `KEYCLOAK_URL` | Keycloak server URL | `http://keycloak:8080` |
| `KEYCLOAK_REALM` | Keycloak realm | `paygate` |
| `KEYCLOAK_CLIENT_ID` | Keycloak client ID | `paygate-portal` |
| `KEYCLOAK_CLIENT_SECRET` | Keycloak client secret | — |
| `VITE_KEYCLOAK_URL` | Keycloak URL for frontend | same as above |

---

## Push Notifications

| Variable | Description |
|---|---|
| `VAPID_PUBLIC_KEY` | VAPID public key for Web Push (P-256 uncompressed, base64url) |
| `VAPID_PRIVATE_KEY` | VAPID private key for Web Push (32-byte scalar, base64url) |
| `VAPID_SUBJECT` | VAPID subject — `mailto:push@paygate.ng` or `https://paygate.ng` |
| `PUSH_SERVICE_URL` | Push notification service URL (fallback FCM proxy) |
| `PUSH_SERVICE_KEY` | Push service authentication key |

### Generating VAPID Keys

Run the built-in generator script **once per environment**. Keys must **never** be committed to source control.

```bash
# Interactive output (recommended for first-time setup)
pnpm vapid:generate

# .env format — pipe directly into your secrets manager
pnpm vapid:generate:env

# JSON format — useful for CI/CD pipelines
pnpm vapid:generate:json
```

The script uses Node.js built-in `crypto` (no external dependencies) and produces a P-256 ECDH key pair suitable for the W3C Web Push Protocol.

**After generating:**
1. Copy the three values into **Settings → Secrets** in the Manus UI, or add them to your `.env` file.
2. Restart the server — `webPush.ts` reads keys at startup.
3. The `VAPID_PUBLIC_KEY` is served to the frontend via `trpc.pushTokens.getVapidPublicKey` and used by the `PushManager.subscribe()` call in `usePushNotifications.ts`.

---

## Email (SMTP)

| Variable | Description | Default |
|---|---|---|
| `SMTP_HOST` | SMTP server hostname | `smtp.gmail.com` |
| `SMTP_PORT` | SMTP server port | `587` |
| `SMTP_USER` | SMTP username | — |
| `SMTP_PASS` | SMTP password | — |

---

## Observability

| Variable | Description | Default |
|---|---|---|
| `OTEL_EXPORTER_OTLP_ENDPOINT` | OpenTelemetry collector endpoint | `http://otel-collector:4318` |
| `OTEL_SERVICE_NAME` | Service name for traces | `paygate-portal` |
| `LOG_LEVEL` | Logging level | `info` |
| `VITE_ANALYTICS_ENDPOINT` | Analytics endpoint URL | — |
| `VITE_ANALYTICS_WEBSITE_ID` | Analytics website ID | — |

---

## Sync & Relay

| Variable | Description |
|---|---|
| `SYNC_RELAY_URL` | Sync relay service URL |
| `SYNC_RELAY_KEY` | Sync relay authentication key |

---

## TigerBeetle (Ledger)

| Variable | Description | Default |
|---|---|---|
| `TIGERBEETLE_ADDRESS` | TigerBeetle cluster address | `tigerbeetle-1:3000,tigerbeetle-2:3001,tigerbeetle-3:3002` |

---

## Payment Links

| Variable | Description | Default |
|---|---|---|
| `PAYMENT_LINK_BASE_URL` | Base URL for payment links | `https://pay.paygate.ng` |
| `MERCHANT_PORTAL_URL` | Merchant portal URL | `https://portal.paygate.ng` |
| `PORTAL_TRPC_URL` | Internal tRPC URL | `http://paygate-portal:3000/api/trpc` |

---

## Payout Approvals

| Variable | Description |
|---|---|
| `PAYOUT_APPROVER_EMAIL` | Email for payout approval notifications |

---

## Built-in Forge (Manus Platform)

| Variable | Description |
|---|---|
| `BUILT_IN_FORGE_API_URL` | Manus built-in API URL |
| `BUILT_IN_FORGE_API_KEY` | Manus built-in API key (server-side) |
| `VITE_FRONTEND_FORGE_API_URL` | Manus built-in API URL (frontend) |
| `VITE_FRONTEND_FORGE_API_KEY` | Manus built-in API key (frontend) |

---

## Owner Info

| Variable | Description |
|---|---|
| `OWNER_OPEN_ID` | Owner's Manus OpenID |
| `OWNER_NAME` | Owner's display name |

---

## App Branding

| Variable | Description | Default |
|---|---|---|
| `VITE_APP_TITLE` | Application title | `PayGate Merchant Portal` |
| `VITE_APP_LOGO` | Application logo URL | — |
| `VITE_APP_ID` | Application ID | — |

---

## Notes

- All secrets must be at least 32 characters long for production use.
- `JWT_SECRET` and `INTERNAL_API_KEY` are validated at startup — the server will refuse to start in production if they are too short.
- `STRIPE_WEBHOOK_SECRET` must start with `whsec_`.
- Never commit actual secret values to version control. Use a secrets manager (AWS Secrets Manager, HashiCorp Vault, etc.) in production.
