# Wave 116 — Production Readiness Sprint: Change Manifest

**Date:** 2026-05-09  
**Checkpoint:** (see webdev checkpoint after this wave)  
**Test counts:** Vitest 52/52 (Wave 115+116) · Python pytest 76/76 · TypeScript exit 0

---

## Summary

Wave 116 is a comprehensive production-readiness sprint driven by a 14-dimension audit of the PayGate platform. It delivers security hardening, billing engine PBAC enforcement, Docker Compose for all billing services, seed data, smoke tests, and mobile parity (Flutter + React Native) for the billing engine.

---

## 1. Audit Findings (WAVE116_AUDIT_FINDINGS.md)

A full audit document cataloguing all gaps across:
- Orphaned router files not wired to `appRouter`
- Pages with no tRPC calls (12 identified)
- Missing CRUD coverage on 8 database tables
- Security vulnerabilities (no PBAC, no payload scanning, no ransomware mitigation)
- Middleware disconnects (Kafka, Fluvio, Dapr, Temporal, TigerBeetle, OpenSearch)
- PWA/mobile parity gaps (billing screen missing from Flutter and React Native)
- Seed data and smoke test gaps

---

## 2. Security Hardening (`server/security116.ts`)

### New module: `server/security116.ts`
A comprehensive security middleware module providing:

| Feature | Implementation |
|---|---|
| **PBAC permission matrix** | Role → permission mapping for `billing:read/write/activate/audit` |
| **Payload threat scanner** | SQL injection, XSS, ransomware file extension detection; blocks on financial paths |
| **Adaptive rate limiter** | Per-IP sliding window with configurable limits per route category |
| **Auth failure logger** | Structured logging of PBAC denials to OpenSearch audit index |
| **Security score reporter** | `/api/security/report` endpoint returning 0–100 security posture score |
| **DDoS mitigation** | Payload size limits, connection throttling, suspicious pattern detection |

### Wired into `server/_core/index.ts`
- `payloadScanMiddleware` applied after body parser, before tRPC handler
- Blocks ransomware file extensions on all paths
- Blocks SQL/XSS on financial paths (`/api/trpc/billing`, `/api/trpc/payouts`, `/api/trpc/settlements`)

### Billing router PBAC upgrade (`server/routers/billing.ts`)
- `assertBillingAdmin()` upgraded to use `security116.assertBillingPermission()`
- All write/activate/audit procedures now enforce PBAC before DB access
- Auth failures logged to audit trail automatically

---

## 3. Docker Compose for Billing Engine (`docker/docker-compose.billing-engine.yml`)

Complete Docker Compose file for all 5 billing engine services:

| Service | Port | Technology |
|---|---|---|
| `billing-core` | 8093 | Rust (Axum) |
| `billing-event-ingestor` | 8094 | Go |
| `billing-onboarding-worker` | 8095 | Go + Temporal |
| `billing-audit-rbac` | 8096 | Go + Keycloak + Permify + OpenSearch |
| `billing-settlement-bridge` | 8097 | Python + Mojaloop |

All services connect to the shared middleware network (`paygate-middleware`), use environment variable injection for secrets, and have health check endpoints.

### Dockerfiles written for all 5 services:
- `billing-engine/rust-billing-core/Dockerfile` — multi-stage Rust build
- `billing-engine/go-event-ingestor/Dockerfile` — multi-stage Go build
- `billing-engine/go-onboarding-workflow/Dockerfile` — multi-stage Go build
- `billing-engine/go-audit-rbac/Dockerfile` — multi-stage Go build
- `billing-engine/python-settlement-lakehouse/Dockerfile` — Python slim image

---

## 4. Seed Data (`billing-engine/seed/billing_seed.sql`)

SQL seed script populating:
- 3 billing configs (Starter, Growth, Enterprise tiers with realistic Nigerian market rates)
- 3 billing audit log entries (system-created at onboarding)
- 3 billing events (demo transactions showing fee computation)

Idempotent (`ON CONFLICT DO NOTHING`) — safe to run multiple times.

---

## 5. Smoke Test (`billing-engine/tests/smoke_test.sh`)

Bash smoke test script checking:
- Health endpoints for all 5 billing engine services
- Portal tRPC health and security report endpoint
- Middleware: APISIX, OpenSearch, Keycloak, Temporal UI
- Fee computation API (POST to Rust billing core)

Usage: `./billing-engine/tests/smoke_test.sh http://localhost`

---

## 6. Mobile Parity

### Flutter: `mobile/flutter/lib/screens/billing/billing_engine_screen.dart`
Full billing engine screen with:
- 3-tab layout: Active Config, Version History, Audit Log
- Metric cards for fee rate, platform/reseller split, sign-on fee, subscription fee
- Version history list with active badge
- Audit log with action icons and color coding
- Pull-to-refresh, loading states, error recovery
- Riverpod state management integration

### React Native: `mobile/react-native/app/(tabs)/billing-engine.tsx`
Full billing engine screen (Expo Router) with:
- Same 3-tab layout as Flutter
- tRPC integration via `trpc.billing.*` hooks
- Native StyleSheet styling matching PayGate design system
- RefreshControl, ActivityIndicator, empty states

---

## 7. Sidebar Navigation Update

`client/src/components/Layout.tsx` — Added **Billing Engine** nav item to the "Subscriptions & Billing" section, linking to `/billing-engine`.

---

## 8. Tests

### `server/wave116.security.test.ts` — 22 new tests
- **PBAC Permission Enforcement** (5 tests): admin/finance_manager/user/unknown role coverage
- **Payload Threat Scanner** (10 tests): SQL injection, XSS, ransomware extension detection; financial vs non-financial path blocking
- **Auth Failure Logging** (3 tests): field completeness, multiple failures, anonymous attempts
- **Security Score Computation** (4 tests): full stack = 100, partial = correct weighted score, empty = 0, cap at 100

### Combined test results
| Suite | Tests | Status |
|---|---|---|
| Wave 115 billing (Vitest) | 30 | ✓ All pass |
| Wave 116 security (Vitest) | 22 | ✓ All pass |
| Python USSD (pytest) | 76 | ✓ All pass |

---

## Files Added/Modified

| File | Action | Description |
|---|---|---|
| `WAVE116_AUDIT_FINDINGS.md` | Added | Full 14-dimension audit report |
| `server/security116.ts` | Added | Security hardening module (PBAC, payload scan, rate limit) |
| `server/_core/index.ts` | Modified | Wire `payloadScanMiddleware` into middleware chain |
| `server/routers/billing.ts` | Modified | PBAC enforcement via `security116.assertBillingPermission()` |
| `docker/docker-compose.billing-engine.yml` | Added | Docker Compose for all 5 billing engine services |
| `billing-engine/rust-billing-core/Dockerfile` | Added | Rust multi-stage build |
| `billing-engine/go-event-ingestor/Dockerfile` | Added | Go multi-stage build |
| `billing-engine/go-onboarding-workflow/Dockerfile` | Added | Go multi-stage build |
| `billing-engine/go-audit-rbac/Dockerfile` | Added | Go multi-stage build |
| `billing-engine/python-settlement-lakehouse/Dockerfile` | Added | Python slim build |
| `billing-engine/seed/billing_seed.sql` | Added | Seed data for 3 billing tiers |
| `billing-engine/tests/smoke_test.sh` | Added | Smoke test for all billing engine services |
| `mobile/flutter/lib/screens/billing/billing_engine_screen.dart` | Added | Flutter billing engine screen |
| `mobile/react-native/app/(tabs)/billing-engine.tsx` | Added | React Native billing engine screen |
| `client/src/components/Layout.tsx` | Modified | Add Billing Engine sidebar nav item |
| `server/wave116.security.test.ts` | Added | 22 security hardening tests |

---

## Nigerian Market Research (embedded in financial model)

The financial model tool (`paygate-financial-model.html`) now embeds the full market research findings:
- Paystack/Flutterwave/KoraPay competitive fee analysis
- CBN 2026 draft merchant service charge cap (0.5% / ₦10,000 max)
- Nigeria SME ability-to-pay assessment (₦5,000–₦50,000/month tolerance)
- 6 pre-built scenarios from Micro Starter to Fintech Partnership tier

---

## Suggested Next Steps for Wave 117

1. **Real-time billing event pipeline** — Connect the Go Kafka consumer to the live transaction processing pipeline so `billing_events` rows populate from actual payment data.
2. **Tenant onboarding wizard billing step** — Add a pricing tier selector to the partner onboarding flow, triggering the Temporal `ProvisionBillingWorkflow` automatically.
3. **Billing dashboard analytics** — Add a `/billing-engine/analytics` sub-page showing monthly revenue, EBITDA trend, and platform/reseller split charts using the `billing_events` table data.
4. **OpenSearch audit log viewer** — Surface the OpenSearch-indexed PBAC denial events in the portal's audit log page for real-time security monitoring.
5. **Fix pre-existing DB connectivity failures** — The 140 Vitest failures (ECONNREFUSED 127.0.0.1:5432) are all pre-existing from Wave 113. Resolving them requires either a local PostgreSQL instance in the sandbox or mocking the DB layer in tests.
