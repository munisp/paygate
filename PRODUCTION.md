# PayGate Merchant Portal — Production Readiness Guide

## Overview

The PayGate Merchant Portal is a full-stack, production-ready payment infrastructure platform built on:

- **Frontend**: React 19 + Tailwind CSS 4 + shadcn/ui + tRPC client
- **Backend**: Node.js + Express 4 + tRPC 11 + Drizzle ORM
- **Database**: MySQL/TiDB (via `DATABASE_URL`)
- **Auth**: Manus OAuth (session cookies, JWT-signed)
- **Payments**: Stripe (portal billing subscriptions)
- **Storage**: AWS S3 (file uploads)

---

## Architecture

```
client/                    React 19 SPA (Vite)
  src/
    pages/                 180+ feature pages
      tier1to5/            Core banking features (Waves 1–5)
      tier6to8/            Advanced features (Waves 6–8)
      wave80/              Wave 80 new features
      consumer/            Consumer-facing app pages
    components/            Reusable UI components
    lib/
      trpc.ts              tRPC client binding
      validation.ts        Shared form validation utilities
server/
  routers.ts               Main tRPC router (core features)
  tier1to5Router.ts        Tier 1–5 feature router
  tier6to8Router.ts        Tier 6–8 feature router
  newFeaturesRouter.ts     New features router
  wave80Router.ts          Wave 80 router
  webhookDispatch.ts       Outbound webhook dispatcher
  webhookEvents.ts         Webhook event type definitions
  webhookEventHooks.ts     Mutation → webhook event wiring
  portalBillingRouter.ts   Stripe portal billing
  circuitBreaker.ts        Circuit breaker for external services
  auditTrail.ts            Audit logging
  rateLimiter.ts           Rate limiting middleware
drizzle/
  schema.ts                Database schema (all tables)
shared/
  const.ts                 Shared constants & enums
  types.ts                 Shared TypeScript types
```

---

## Environment Variables

All required environment variables are injected automatically by the Manus platform. The following are the key ones:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | MySQL/TiDB connection string | (required) |
| `JWT_SECRET` | Session cookie signing | (required) |
| `VITE_APP_ID` | Manus OAuth app ID | (required) |
| `STRIPE_SECRET_KEY` | Stripe API key | (required for billing) |
| `STRIPE_WEBHOOK_SECRET` | Stripe webhook signature | (required for billing) |
| `MIDDLEWARE_BRIDGE_URL` | Go middleware bridge URL | `http://localhost:8080` |
| `MIDDLEWARE_INTERNAL_KEY` | Bridge auth key | (optional) |

All service URLs have sensible localhost defaults for development. See `server/_core/env.ts` for the complete list.

---

## Database

### Schema

The database schema is defined in `drizzle/schema.ts` and covers:

- **Core**: `users`, `merchants`, `tenants`, `transactions`, `payouts`, `disputes`, `webhooks`
- **KYB/KYC**: `kybApplications`, `kybDocuments`
- **Billing**: `portalSubscriptions`, `portalInvoices`
- **Features**: 100+ additional tables for all feature modules

### Migrations

```bash
pnpm db:push    # Generate and apply migrations
```

### Seeding

```bash
node seed-full.mjs              # Core seed data
node seed-wave85-complete.mjs   # Wave 85 comprehensive seed
```

---

## API Structure

All API calls go through tRPC at `/api/trpc`. The router hierarchy is:

```
appRouter
├── auth.*                    Login, logout, me
├── system.*                  Health check, notify owner
├── onboarding.*              Merchant onboarding
├── transactions.*            Payment transactions
├── payouts.*                 Payout management
├── disputes.*                Dispute handling
├── customers.*               Customer management
├── webhooks.*                Webhook configuration
├── billing.*                 Portal billing (Stripe)
├── portalBilling.*           Portal subscription plans
├── tier1to5.*                Core banking features
│   ├── lending.*             Loan management
│   ├── chargeback.*          Chargeback automation
│   ├── openBanking.*         Open banking portal
│   └── ...                   (20+ sub-routers)
├── tier6to8.*                Advanced features
│   ├── insurance.*           Insurance products
│   ├── remittanceV2.*        International remittance
│   ├── agentBankingV2.*      Agent banking network
│   └── ...                   (30+ sub-routers)
├── newFeatures.*             New feature modules
│   ├── digitalGold.*         Digital gold trading
│   ├── portalBilling.*       Portal subscription billing
│   ├── bulkCollections.*     Bulk payment collections
│   └── ...                   (15+ sub-routers)
└── wave80.*                  Wave 80 features
    ├── openBankingV2.*       Open banking v2
    ├── reconciliation.*      Reconciliation alerts
    ├── multiCurrencyLedger.* Multi-currency accounts
    └── ...                   (12+ sub-routers)
```

---

## Stripe Integration

### Portal Billing Plans

Three subscription tiers are defined in `server/portalBillingRouter.ts`:

| Plan | Price | Features |
|---|---|---|
| Starter | ₦15,000/month | Core payments, basic analytics |
| Growth | ₦45,000/month | + Advanced features, priority support |
| Enterprise | ₦150,000/month | + All features, dedicated support |

### Webhook Events Handled

- `checkout.session.completed` — Activate new subscription
- `customer.subscription.updated` — Update plan/status
- `customer.subscription.deleted` — Cancel subscription
- `invoice.paid` — Record successful payment
- `invoice.payment_failed` — Mark subscription as past_due

### Testing

Use card `4242 4242 4242 4242` with any future expiry and any 3-digit CVV.

---

## Outbound Webhooks

Merchants can configure webhook endpoints to receive real-time events. The system dispatches events for:

- `payment.success`, `payment.failed`
- `payout.completed`, `payout.failed`
- `dispute.opened`, `dispute.resolved`
- `kyb.approved`, `kyb.rejected`
- `loan.disbursed`, `loan.repayment`, `loan.default`
- `settlement.completed`, `refund.completed`
- `subscription.renewed`, `subscription.cancelled`
- `agent.transaction`, `escrow.released`, `bulk.completed`
- 20+ additional event types for all feature modules

Webhook delivery includes:
- HMAC-SHA256 signature in `X-PayGate-Signature` header
- Automatic retry with exponential backoff (3 attempts)
- Delivery log stored in `webhookDeliveries` table

---

## Production Hardening

### Circuit Breaker

All external service calls are wrapped in circuit breakers (`server/circuitBreaker.ts`):
- Opens after 5 consecutive failures
- Half-open after 30 seconds
- Closes on first successful call

### Rate Limiting

API endpoints are rate-limited (`server/rateLimiter.ts`):
- Default: 100 requests/minute per IP
- Auth endpoints: 10 requests/minute
- Webhook endpoints: 1000 requests/minute

### Audit Trail

All state-changing operations are logged to the `auditLogs` table (`server/auditTrail.ts`):
- User ID, action, entity type/ID, before/after state
- Timestamp and IP address

### Structured Logging

All server logs use structured JSON format with:
- Log level (info/warn/error)
- Timestamp (ISO 8601)
- Request ID (for tracing)
- User ID (when authenticated)
- Duration (for performance monitoring)

---

## Testing

```bash
pnpm test           # Run all tests (56 files, 1943 tests)
pnpm test --watch   # Watch mode
```

Test coverage includes:
- Auth flow (login, logout, session)
- All tRPC procedures (unit tests)
- Circuit breaker state machine
- Audit trail (fire-and-forget)
- Web push notifications
- Production hardening features
- Form validation utilities (35 tests)
- Database helper functions
- Webhook dispatch
- Rate limiting

---

## Deployment

1. Create a checkpoint in the Manus UI
2. Click the **Publish** button in the Management UI header
3. Configure custom domain in Settings → Domains (optional)

### Pre-deployment Checklist

- [ ] All environment variables configured in Settings → Secrets
- [ ] Stripe keys configured in Settings → Payment
- [ ] Database migrations applied (`pnpm db:push`)
- [ ] Seed data loaded (optional, for demo)
- [ ] Stripe sandbox claimed at dashboard.stripe.com
- [ ] Webhook endpoint URL updated in Stripe Dashboard

---

## Feature Flags

Feature flags are defined in `shared/const.ts` under `FEATURE_FLAGS`. All flags default to `true` in development. In production, control them via environment variables or the database.

---

## Security

- All API endpoints require authentication (except public procedures)
- Admin-only procedures check `ctx.user.role === 'admin'`
- Webhook signatures verified with HMAC-SHA256
- Stripe webhook signatures verified with `stripe.webhooks.constructEvent()`
- Session cookies are HttpOnly, Secure, SameSite=Lax
- All user inputs validated with Zod schemas on the server
- File uploads validated for type and size before S3 upload

---

## Support

For technical issues, visit [https://help.manus.im](https://help.manus.im)
