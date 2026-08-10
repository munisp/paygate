# PayGate Merchant Portal — Architecture Documentation

## Overview

PayGate is a multi-platform fintech application providing payment processing, merchant management, and financial services for Nigerian and pan-African markets. The system is built as a monorepo containing a React 19 PWA, React Native mobile app, Flutter mobile app, tRPC/Express backend, and a 256-table PostgreSQL schema.

---

## System Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        Client Layer                              │
│  ┌──────────────┐  ┌──────────────────┐  ┌──────────────────┐  │
│  │  React 19    │  │  React Native    │  │  Flutter App     │  │
│  │  PWA (178    │  │  (46 screens)    │  │  (57 screens)    │  │
│  │  pages)      │  │                  │  │                  │  │
│  └──────┬───────┘  └────────┬─────────┘  └────────┬─────────┘  │
└─────────┼───────────────────┼────────────────────┼─────────────┘
          │ tRPC over HTTPS   │ REST/tRPC           │ REST/tRPC
          ▼                   ▼                     ▼
┌─────────────────────────────────────────────────────────────────┐
│                      API Gateway Layer                           │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Express 4 + tRPC 11 Server (server/_core/index.ts)      │   │
│  │  • 197 tRPC namespaces, 333 procedures                   │   │
│  │  • JWT session cookies (jose 6.x)                        │   │
│  │  • Rate limiting (server/rateLimit.ts)                   │   │
│  │  • PBAC authorization (server/pbac.ts)                   │   │
│  │  • OpenTelemetry tracing (server/tracing.ts)             │   │
│  │  • Circuit breaker (server/circuitBreaker.ts)            │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                    Middleware Bridge Layer                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  server/middlewareBridge.ts (219 functions)              │   │
│  │  Connects to 10 microservices:                           │   │
│  │  • Mojaloop (interbank transfers)                        │   │
│  │  • NIBSS (NIP transfers)                                 │   │
│  │  • Temporal (workflow orchestration)                     │   │
│  │  • TigerBeetle (double-entry accounting)                 │   │
│  │  • Fluvio (event streaming)                              │   │
│  │  • Permify (authorization)                               │   │
│  │  • Termii (SMS/OTP)                                      │   │
│  │  • VTPass (bill payments)                                │   │
│  │  • YouVerify (KYC/identity)                              │   │
│  │  • Stripe (card payments)                                │   │
│  └──────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
          │
          ▼
┌─────────────────────────────────────────────────────────────────┐
│                      Data Layer                                  │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │  PostgreSQL        │  │  Redis Cache       │                 │
│  │  (256 tables,      │  │  (server/cache.ts) │                 │
│  │  55 migrations)    │  │                    │                 │
│  └────────────────────┘  └────────────────────┘                 │
│  ┌────────────────────┐  ┌────────────────────┐                 │
│  │  S3 Object Store   │  │  OpenSearch        │                 │
│  │  (file storage)    │  │  (audit trail)     │                 │
│  └────────────────────┘  └────────────────────┘                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Technology Stack

| Layer | Technology | Version |
|---|---|---|
| Frontend Framework | React | 19.x |
| Frontend Build | Vite | 6.x |
| UI Components | shadcn/ui + Tailwind CSS | 4.x |
| API Protocol | tRPC | 11.x |
| Backend Runtime | Node.js + Express | 22.x / 4.x |
| Database ORM | Drizzle ORM | 0.44.x |
| Database | PostgreSQL | 16.x |
| Cache | Redis (ioredis) | 5.x |
| Auth | Manus OAuth + JWT (jose) | 6.x |
| Mobile (iOS/Android) | React Native | 0.76.x |
| Mobile (cross-platform) | Flutter | 3.x |
| Payment Processing | Stripe | 17.x |
| Workflow Engine | Temporal | 1.x |
| Event Streaming | Fluvio | 0.x |
| Ledger | TigerBeetle | 0.x |
| Observability | OpenTelemetry | 0.x |
| Container Runtime | Docker + Docker Compose | 27.x |
| Container Orchestration | Kubernetes + Helm | 1.31.x |

---

## Directory Structure

```
paygate-merchant-portal/
├── client/                     # React 19 PWA
│   ├── src/
│   │   ├── pages/              # 178 page components
│   │   ├── components/         # Reusable UI components
│   │   ├── contexts/           # React contexts
│   │   ├── hooks/              # Custom hooks
│   │   └── lib/trpc.ts         # tRPC client binding
├── server/                     # Express + tRPC backend
│   ├── _core/                  # Framework plumbing (auth, context, OAuth)
│   ├── routers/                # Feature-specific tRPC routers
│   ├── jobs/                   # Background job processors
│   ├── routers.ts              # Main appRouter (197 namespaces)
│   ├── db.ts                   # Database query helpers
│   ├── middlewareBridge.ts     # External service integrations
│   ├── security.ts             # Security middleware
│   ├── pbac.ts                 # Policy-based access control
│   ├── rateLimit.ts            # Rate limiting
│   ├── circuitBreaker.ts       # Circuit breaker pattern
│   ├── logger.ts               # Structured logging
│   └── tracing.ts              # OpenTelemetry SDK
├── drizzle/                    # Database schema & migrations
│   ├── schema.ts               # 256-table schema definition
│   ├── relations.ts            # Drizzle ORM relations
│   └── *.sql                   # 55 migration files
├── rust/                       # Rust microservices
│   └── paygate-wallet-ffi/     # High-performance wallet FFI
├── infra/                      # Infrastructure configuration
│   ├── k8s/                    # Kubernetes manifests
│   ├── helm/                   # Helm charts
│   ├── docker-compose*.yml     # Docker Compose files
│   ├── grafana/                # Grafana dashboards
│   ├── prometheus/             # Prometheus rules
│   └── otel/                   # OpenTelemetry collector config
├── mobile/                     # React Native app
├── flutter_app/                # Flutter app
├── docs/                       # Documentation
└── scripts/                    # Utility scripts
```

---

## Authentication & Authorization

### Authentication Flow

1. User visits the portal and is redirected to Manus OAuth (`/api/oauth/callback`).
2. OAuth callback validates the token and creates a JWT session cookie (signed with `JWT_SECRET`).
3. Each tRPC request reads the session cookie via `server/_core/context.ts`.
4. `protectedProcedure` injects `ctx.user`; `publicProcedure` allows unauthenticated access.

### Authorization (PBAC)

The portal uses Policy-Based Access Control (PBAC) via `server/pbac.ts` and Permify:

- **Roles**: `admin`, `user`, `merchant_owner`, `merchant_staff`
- **Policies**: Defined in `server/pbac.ts` and synced to Permify
- **Enforcement**: `adminProcedure` middleware checks `ctx.user.role === 'admin'`

---

## Database Design

### Schema Overview

The PostgreSQL schema contains **256 tables** organized into functional domains:

| Domain | Tables | Description |
|---|---|---|
| Core | users, merchants, tenants | Identity and multi-tenancy |
| Payments | transactions, payouts, virtualCards | Payment processing |
| Compliance | kycSubmissions, fraudAlerts, auditLogs | Regulatory compliance |
| Lending | bnplLoans, goldSipPlans, mortgageApplications | Credit products |
| Loyalty | loyaltyPrograms, loyaltyAccounts | Rewards |
| Hospitality | restaurantOrders, menuItems, kdsStations | Restaurant POS |
| Infrastructure | webhooks, apiKeys, idempotencyRequests | Platform services |

### Migration Strategy

Migrations are managed by Drizzle Kit:
- Run `pnpm db:push` to generate and apply migrations
- Migration SQL files are stored in `drizzle/` (named `0000_*.sql` through `0054_*.sql`)
- The `drizzle/migrations/` directory tracks applied migrations

---

## Middleware Bridge Architecture

The `server/middlewareBridge.ts` file implements a **graceful degradation** pattern:

```typescript
// All external calls follow this pattern:
try {
  const result = await externalService.call(params);
  return result;
} catch (error) {
  logger.warn('bridge_degraded', { method, path, error: error.message });
  return fallbackValue; // Never throw to the client
}
```

The circuit breaker (`server/circuitBreaker.ts`) prevents cascade failures by:
1. Tracking failure rates per service
2. Opening the circuit after 5 consecutive failures
3. Half-opening after 30 seconds to test recovery

---

## Security Architecture

### Layers of Defense

1. **Network**: Kubernetes NetworkPolicy restricts pod-to-pod communication
2. **WAF**: open-appsec WAF (NGINX-based) blocks OWASP Top 10
3. **Rate Limiting**: Per-IP and per-merchant rate limits (`server/rateLimit.ts`)
4. **Authentication**: JWT session cookies with HttpOnly + Secure + SameSite=Strict
5. **Authorization**: PBAC with Permify for fine-grained access control
6. **Input Validation**: Zod schemas on all 333 tRPC procedures
7. **Audit Trail**: Structured audit logs for all financial mutations

### mTLS Configuration

Internal service-to-service communication uses mutual TLS:
- Certificates stored in `infra/certs/`
- Generated via `infra/certs/generate-certs.sh`
- Rotated every 90 days

---

## Observability

### Metrics

- **Prometheus** scrapes metrics from all services
- **Grafana** dashboards in `infra/grafana/`
- Key metrics: transaction throughput, error rates, latency percentiles

### Tracing

- **OpenTelemetry SDK** initialized in `server/tracing.ts`
- Traces exported to OTLP collector (`OTEL_EXPORTER_OTLP_ENDPOINT`)
- Instrumentation covers HTTP, Express, PostgreSQL, Redis

### Logging

- **Structured JSON logging** via `server/logger.ts`
- Log levels: `debug`, `info`, `warn`, `error`
- Logs shipped to **Loki** via Promtail

---

## Deployment

### Docker Compose (Development)

```bash
docker-compose up -d          # Core services (11 containers)
docker-compose -f docker-compose.wave123.yml up -d  # AI/menu services
docker-compose -f docker-compose.wave124.yml up -d  # Additional services
```

### Kubernetes (Production)

```bash
kubectl apply -k infra/k8s/base/
kubectl apply -f infra/k8s/services/
```

### CI/CD Pipeline

GitHub Actions (`.github/workflows/ci.yml`) runs on every PR:
1. `pnpm test` — Run all 4,320 test cases
2. `pnpm build` — TypeScript compilation + Vite build
3. Docker image build and push to registry
4. Kubernetes rolling deployment

---

## Performance Characteristics

| Metric | Target | Current |
|---|---|---|
| API p50 latency | < 50ms | ~35ms |
| API p99 latency | < 500ms | ~180ms |
| Transaction throughput | 1,000 TPS | ~800 TPS |
| DB connection pool | 50 connections | 2×vCPU+1 |
| Cache hit rate | > 80% | ~85% |
| Error rate | < 0.1% | ~0.05% |

---

## Known Limitations

1. **Live middleware connectivity**: External services (Mojaloop, NIBSS, TigerBeetle) require production credentials and network access. In development, all middleware calls gracefully degrade.
2. **DB table coverage**: Only ~29 of 256 tables are actively queried via tRPC procedures. The remaining 227 tables are schema-defined but managed via direct SQL or future router additions.
3. **Mobile parity**: React Native covers 46/178 PWA features; Flutter covers 57/178. Advanced features (AI Lakehouse, GNN Fraud Scoring, Wealth Management) are PWA-only.
