# Wave 116 — Comprehensive Production Readiness Audit

**Date:** 2026-05-09  
**Auditor:** Manus AI  
**Scope:** Full platform audit across all 14 dimensions from user requirements

---

## 1. Router / Service Wiring Audit

### Status: GOOD (minor gaps)
- **Total server router files:** 76 (excluding tests, _core, db, storage)
- **All major routers wired in appRouter:** ✅ wave24–wave34, wave68, wave80, wave88–wave90, wave99, wave104, billing, middleware, admin, tier1to5, tier6to8, etc.
- **Sub-routers in `server/routers/`:** 6 files — all imported ✅
- **Orphaned router files:** NONE — all 76 are either imported or are utility modules (not routers)

### Gaps to fix:
- `billing-engine` billing router needs `billingRouter` exposed via sidebar nav link
- `middlewareDashboardRouter` is imported but has no sidebar nav entry

---

## 2. Database Tables vs CRUD Coverage

### Status: GOOD (252 tables, 307/319 pages have tRPC calls)
- **Total DB tables:** 252
- **Pages with tRPC calls:** 307/319 (96%)
- **Pages without tRPC (12):** All are either Gated wrappers (pass-through to inner page), Home, NotFound, or docs pages — ACCEPTABLE

### Gaps:
- `billingConfigs`, `billingAuditLog`, `overheadCosts`, `billingEvents` — new Wave 115 tables need sidebar nav
- `ussdSessions` — no dedicated CRUD page (managed via USSD service)

---

## 3. Security Vulnerabilities

### Status: STRONG (multiple security layers present)
- **PBAC:** `server/pbac.ts` (625 lines) — implemented and used in 35+ places ✅
- **Rate limiting:** `server/rateLimit.ts` (209 lines) ✅
- **Security headers:** `server/securityHeaders.ts` (102 lines) ✅
- **Security layers:** security.ts, security27–33.ts (wave-by-wave hardening) ✅
- **Input validation:** tRPC Zod schemas on all procedures ✅
- **Hardcoded secrets:** NONE found ✅

### Gaps to fix:
1. **PBAC not enforced on billing router** — billing mutations need PBAC checks
2. **Missing CSRF protection** on the webhook endpoint (raw body parser bypasses express.json)
3. **No DDoS/ransomware-specific mitigations** documented — need: request size limits, payload scanning, circuit breakers on all external calls
4. **OpenAppSec WAF** config exists in `infra/docker-compose.waf.yml` but not wired to APISIX routes for billing endpoints
5. **Missing security audit log** for failed auth attempts on billing config changes

---

## 4. WebSocket / Offline Resilience

### Status: STRONG (already implemented)
- `client/src/lib/resilientWS.ts` (419 lines) — full WS → SSE → long-poll fallback ✅
- `client/src/lib/networkQuality.ts` (201 lines) — 2G/offline detection ✅
- `client/src/lib/offlineQueue.ts` (278 lines) + `offlineQueueV2.ts` (440 lines) ✅
- Service worker at `client/public/sw.js` ✅

### Gaps:
- `resilientWS.ts` is defined but only used in `POSTerminals.tsx` — needs to be used in ALL real-time pages (Transactions, Webhooks, KDS, etc.)
- Offline queue not integrated with billing events

---

## 5. Middleware Integration

### Status: COMPLETE (all middleware present in Docker Compose)
All middleware services are configured in `docker/docker-compose.middleware.yml`:
- ✅ Kafka (Confluent 7.6.0)
- ✅ Fluvio (infinyon/fluvio:latest)
- ✅ Temporal (temporalio/auto-setup:1.24.2)
- ✅ Keycloak (24.0.3)
- ✅ Permify (v0.9.6)
- ✅ Redis (7.2)
- ✅ OpenSearch (2.13.0)
- ✅ APISIX (3.9.0)
- ✅ TigerBeetle (custom container)
- ✅ Dapr (daprd:1.13.4)
- ✅ Lakehouse (custom container)

### Gaps:
- TigerBeetle container uses custom image but no Dockerfile provided
- Fluvio SPU count is 1 (fine for dev, needs 3+ for production)
- No health check endpoints for Go/Rust services in the compose file
- Billing engine services (Wave 115) not in docker-compose.yml yet

---

## 6. Seed Data & Smoke Tests

### Status: EXTENSIVE (many seed scripts exist)
- 30+ seed scripts covering all waves ✅
- `server/smoke.test.ts` exists ✅
- `scripts/smoke-test.sh`, `smoke-test-e2e.sh`, `smoke-test-middleware.sh` ✅

### Gaps:
- No unified `seed-wave115.mjs` for billing engine tables
- Smoke test doesn't cover billing engine endpoints
- No seed data for `billingConfigs`, `billingAuditLog`, `overheadCosts`

---

## 7. Flutter Mobile App

### Status: PARTIAL (30 Dart files, 20 screens)
- Core screens present: dashboard, transactions, payouts, analytics, disputes, etc. ✅
- Missing screens: billing-engine, virtual cards CRUD, BNPL, FX, QR payments, POS, team management

### Gaps to fix:
- Add Flutter screens for: BillingConfig, VirtualCards, BNPL, FXDashboard, QRPayments, POSTerminals, TeamRoles, PaymentLinks
- Add API service layer (`lib/services/api_service.dart`) connecting to tRPC endpoints
- Add offline support using `hive` or `sqflite` for local caching

---

## 8. React Native App

### Status: PARTIAL (14 screens)
- Core tabs: index, transactions, analytics, payouts, disputes, virtual-cards, notifications, settings, profile ✅
- Missing: billing, BNPL, FX, QR, POS, payment links, team

### Gaps to fix:
- Add tabs for: billing-engine, bnpl, fx, qr-payments, payment-links
- Add offline sync hook using `@react-native-community/netinfo`
- Add biometric auth for sensitive operations

---

## 9. Rust Services

### Status: GOOD (10 services, all have main.rs)
- `billing-engine` (46 lines) — stub, needs full fee computation logic from `billing-engine/rust-billing-core`
- `wallet-ffi` — has `lib.rs` + `server.rs` but no `main.rs` (it's a library, not a server — ACCEPTABLE)
- All others: 147–685 lines, substantive implementations ✅

---

## 10. Python Services

### Status: COMPLETE (45/46 have main.py)
- `shared/` has no main.py — it's a utility module, ACCEPTABLE
- All 45 service main.py files are substantive (128–876 lines) ✅

---

## 11. Go Services

### Status: GOOD (5 services, all have main.go)
- All 5 Go services: 355–864 lines ✅
- Missing: Go service for billing event streaming (billing-engine/go-event-ingestor from Wave 115 is separate)

---

## 12. PWA Parity

### Status: GOOD
- Service worker, manifest, offline queue all present ✅
- `resilientWS.ts` needs broader adoption across real-time pages

---

## 13. Environment Variables

### Status: COMPLETE
- 50+ env vars documented and injected via webdev secrets ✅

---

## 14. TODO/FIXME/Stubs

### Count:
- TODO items in server code: checking...
- Mock data: checking...

---

## Priority Fix List (Wave 116)

### P0 — Security (must fix):
1. Add PBAC checks to billing router mutations
2. Add request size limits and payload scanning middleware
3. Wire OpenAppSec to billing/payment endpoints in APISIX config
4. Add circuit breakers to all external HTTP calls in Go/Python services
5. Add failed-auth audit logging

### P1 — Completeness:
6. Add billing engine to Docker Compose (Wave 115 services)
7. Add seed data for billing engine tables
8. Add smoke tests for billing engine
9. Wire `resilientWS` into Transactions, Webhooks, KDS pages
10. Add Flutter screens: BillingConfig, VirtualCards, BNPL, FX, QR, POS, Team
11. Add React Native tabs: billing, bnpl, fx, qr, payment-links
12. Add TigerBeetle Dockerfile

### P2 — Polish:
13. Add sidebar nav entry for `/billing-engine`
14. Add health checks for Go/Rust services in Docker Compose
15. Unified seed script for Wave 115/116 tables
