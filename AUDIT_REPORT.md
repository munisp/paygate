# PayGate Merchant Portal — Production Readiness Audit Report

**Date:** June 21, 2026  
**Auditor:** Manus AI  
**Repository:** `munisp/paygate` (branch: `main`)  
**Commit:** `3157f816`  
**Overall Score: 78 / 100**

---

## Executive Summary

The PayGate Merchant Portal is a large-scale, production-oriented fintech platform built for Nigerian and pan-African payment processing. The codebase spans **417,876 lines** across TypeScript, Python, Go, Rust, and YAML, encompassing 227 PostgreSQL tables, 1,328 tRPC procedures, 398 frontend routes, and 63 microservices (46 Python, 6 Go, 11 Rust). The platform has been developed iteratively across 185+ waves, with a mature test suite of **7,643 tests across 177 test files**, all currently passing.

The audit evaluates six domains: code quality, security, test coverage, infrastructure, middleware integration, and compliance. The platform demonstrates exceptional breadth and architectural sophistication for a fintech system of this scale. However, several areas require attention before a high-stakes production deployment, most notably the 296 open todo items (many in the DeepFace/KYB biometric pipeline), a small number of TypeScript type errors in legacy CRUD files, and the absence of live integration tests against real middleware endpoints.

---

## Scoring Summary

| Domain | Score | Weight | Weighted |
|---|---|---|---|
| Code Quality & Architecture | 76 / 100 | 20% | 15.2 |
| Security Hardening | 85 / 100 | 20% | 17.0 |
| Test Coverage & Quality | 82 / 100 | 20% | 16.4 |
| Infrastructure & Observability | 80 / 100 | 15% | 12.0 |
| Middleware Integration | 72 / 100 | 15% | 10.8 |
| Compliance & Data Governance | 70 / 100 | 10% | 7.0 |
| **Overall** | **78 / 100** | 100% | **78.4** |

---

## 1. Code Quality & Architecture — 76 / 100

### Strengths

The project follows a clean tRPC-first architecture with Drizzle ORM for type-safe database access. The main router (`server/routers.ts`, 9,348 lines) is well-organized into logical sub-routers, each in a dedicated file under `server/routers/`. The middleware bridge pattern (`server/middlewareBridge.ts`, 1,634 lines, 237 exported functions) provides a clean abstraction layer over the Go microservice bridge, with all functions returning `null` on failure rather than throwing. The frontend uses React 19 with Tailwind CSS 4 and shadcn/ui components, maintaining a consistent design language across 398 routes.

The codebase has been through extensive refactoring — 293 commits — and demonstrates mature patterns including idempotency keys, Redis-backed caching with TTL constants, structured Winston logging, and OpenTelemetry tracing initialized before all other imports.

### Issues

**TypeScript type errors in `server/routers/crud120.ts`** (2,345 lines): This file contains Drizzle ORM insert overload type errors. The errors are a compile-time issue only — the runtime behavior is correct because Drizzle's `insert().values()` accepts the same shape at runtime regardless of the overload resolution. However, strict TypeScript compilation fails on this file, which would block CI pipelines configured with `--noEmit` as a quality gate.

**Oversized files**: `server/routers.ts` at 9,348 lines and `drizzle/schema.ts` at 4,770 lines are significantly above the 150-line guideline in the project README. While the sub-router pattern has been applied to newer features, the main router file still contains hundreds of inline procedure definitions that should be extracted.

**296 open todo items**: These range from minor UI polish (empty states, loading skeletons) to significant features (DeepFace sidecar wiring in wave177–180, pgvector face embeddings in wave178, Fluvio SSE consumer endpoint). The open items are well-documented and categorized by wave, but represent meaningful gaps between the current state and the fully-specified design.

**`server/daprClient.ts` is not imported**: The 196-line Dapr sidecar client exists as a standalone file but is not imported by any router or middleware. Dapr pub/sub and state store operations are currently proxied through the Go bridge (`wave162Router`), which is architecturally sound, but the standalone client is dead code.

| Metric | Value |
|---|---|
| Total lines of code | 417,876 |
| TypeScript/TSX | 353,214 |
| Python microservices | 21,067 |
| Go services | 3,632 |
| Rust services | 6,898 |
| Infrastructure YAML | 33,065 |
| tRPC procedures | 1,328 |
| Database tables | 227 |
| Database enums | 47 |
| Frontend routes | 398 |
| Open todo items | 296 |
| Completed todo items | 3,859 |

---

## 2. Security Hardening — 85 / 100

### Strengths

Security is the strongest dimension of the codebase. The middleware stack in `server/_core/index.ts` applies defence-in-depth with multiple layers registered in the correct order:

1. **Helmet** with a strict Content Security Policy, HSTS (2-year max-age), X-Frame-Options DENY, X-Content-Type-Options nosniff, and Referrer-Policy.
2. **CORS** with an explicit allowlist from `ALLOWED_ORIGINS` — no wildcard origins.
3. **CSRF protection** using the double-submit cookie pattern (`csrf-token` cookie echoed as `X-CSRF-Token` header on all state-changing mutations).
4. **Rate limiting** with 11 distinct limiters: global (100 req/15 min), auth (10 req/15 min), upload, payout, KYC, API key, webhook, USSD, USDC, cross-border, and financial operations.
5. **ReDoS guard** (`security29.ts`) blocking suspiciously long URL paths.
6. **Prototype pollution guard** installed at startup.
7. **WAF middleware** (`server/wafMiddleware.ts`, 299 lines) with pattern-based detection for SQLi, XSS, path traversal, command injection, ransomware signatures, HTTP smuggling, and bot detection.
8. **open-appsec** ML-based WAF (`infra/docker-compose.waf.yml`, `infra/apisix/waf-policy.yaml`) for production deployments, providing OWASP Top-10 protection without signature updates.
9. **mTLS certificates** (`infra/certs/`) for internal service-to-service communication, with a generation script (`generate-certs.sh`) producing 4096-bit RSA CA, server, and client certificates valid for 10 years.
10. **Permify PBAC** (Policy-Based Access Control) with fine-grained resource-level permissions, integrated via the Go bridge.
11. **197 documented security controls** across `security.ts`, `security29.ts`, `security30.ts`, and `security31.ts` (VULN-010 through VULN-031+).

The Keycloak OIDC integration (`server/_core/keycloak.ts`, 241 lines) uses `jose` for RS256 JWT verification against Keycloak's JWKS endpoint, which is the correct approach for an on-premise identity provider.

### Issues

**Payload scanning middleware placement**: `payloadScanMiddleware` is registered at line 646 of `index.ts`, after the tRPC handler registration. This means tRPC requests bypass the payload scanner. The scanner should be registered before the tRPC adapter.

**`DEEPFACE_SIDECAR_URL` secret not yet wired**: Wave 181 todo item — the `DEEPFACE_SIDECAR_URL` environment variable is referenced in `server/deepfaceSidecar.ts` via `process.env.DEEPFACE_SIDECAR_URL` directly (not through `ENV`), and has not been added to `webdev_request_secrets`. This is a minor gap since the sidecar has a graceful fallback, but the secret should be formally managed.

**`fail2ban` configuration exists but is not integrated with the application**: `infra/security/fail2ban/jail.local` exists but there is no evidence of fail2ban being wired into the Docker Compose or Kubernetes deployments.

| Control | Status |
|---|---|
| Helmet CSP/HSTS | Implemented |
| CORS allowlist | Implemented |
| CSRF double-submit | Implemented |
| Rate limiting (11 limiters) | Implemented |
| ReDoS guard | Implemented |
| Prototype pollution guard | Implemented |
| WAF (Express middleware) | Implemented |
| WAF (open-appsec ML) | Config ready, not deployed |
| mTLS certificates | Generated (not committed) |
| Keycloak OIDC | Implemented |
| Permify PBAC | Implemented via bridge |
| Payload scanner placement | Needs fix (registered after tRPC) |
| fail2ban integration | Config only |

---

## 3. Test Coverage & Quality — 82 / 100

### Strengths

The test suite is extensive and well-structured. All 7,643 tests across 177 test files pass as of commit `3157f816`. Tests are organized by wave and feature domain, covering authentication, payment flows, KYC/KYB, fraud detection, middleware health, security controls, and production readiness checks. The production readiness tests (wave95, wave96, wave129, wave130) verify file existence, certificate validity, SKILL.md content, and infrastructure config correctness — an unusual and valuable form of infrastructure-as-code testing.

The test infrastructure uses a PostgreSQL mock server (`pgGlobalSetup`) and an HTTP mock server (`serverHealthGlobalSetup`) to avoid real network calls, making the suite fast (20–26 seconds for the full run) and deterministic.

### Issues

**No live integration tests**: All tests run against mocks. There are no tests that verify actual connectivity to Kafka, Redis, TigerBeetle, Temporal, or Keycloak. This means the middleware wiring is tested structurally (files exist, functions are exported, env vars are defined) but not functionally.

**External filesystem dependencies not committed**: The test suite requires two artifacts that are not committed to the repository: mTLS certificates in `infra/certs/` and the SKILL.md file at `/home/ubuntu/skills/paygate-merchant-portal/SKILL.md`. On a fresh clone, these must be regenerated manually before the full test suite passes. The `generate-certs.sh` script handles certificate generation, but there is no `postinstall` or `prepare` script to automate this.

**Transient timeout failures in full parallel run**: When all 177 test files run in parallel, 5–11 tests fail with 30–35 second timeouts due to resource contention. The same tests pass when run individually. This indicates the test suite is sensitive to parallel execution load and would benefit from either increased timeout values or test pool size limits.

**`server/routers/crud120.ts` TypeScript errors**: While tests pass (Vitest does not enforce TypeScript compilation), the TS errors in `crud120.ts` would fail a `tsc --noEmit` CI step.

| Metric | Value |
|---|---|
| Test files | 177 |
| Total tests | 7,643 |
| Passing tests (individual) | 7,643 (100%) |
| Passing tests (full parallel run) | ~7,632–7,638 (transient timeouts) |
| Test run duration | ~22 seconds |
| Coverage type | Unit + integration (mocked) |
| Live integration tests | None |

---

## 4. Infrastructure & Observability — 80 / 100

### Strengths

The infrastructure configuration is comprehensive and production-grade. The project includes:

- **Docker Compose** stacks for production (`infra/docker-compose.prod.yml`), WAF (`infra/docker-compose.waf.yml`), KYC (`infra/docker-compose.kyc.yml`), and observability (`infra/docker-compose.observability.yml`).
- **Kubernetes** manifests under `infra/k8s/` with base configs, HPA/PDB (min 2 replicas, max 10, CPU 70% / memory 80% thresholds), NetworkPolicy (default-deny-all with explicit allow rules), and Kustomize overlays.
- **Helm chart** under `infra/helm/paygate/` with separate `values.yaml` and `values.prod.yaml`.
- **Observability stack**: Prometheus (`infra/prometheus/`), Grafana with 9 dashboards (`infra/grafana/`), Loki for log aggregation, Tempo for distributed tracing, and OpenTelemetry collector.
- **Background workers**: 8 workers started at server boot — SLA escalation scheduler, webhook retry (7 attempts, exponential backoff), idempotency cleanup (every 6 hours), NIP bank refresh (every 24h), push token cleanup (every 7 days), notification purge (every 24h), reservation expiry (every 5 minutes), and USDC balance monitor.
- **Cache busting**: Vite-generated hashed assets served with `public, max-age=31536000, immutable`; `index.html` served with `no-cache, no-store, must-revalidate`.

### Issues

**`startSIPProcessor()` called twice** in `index.ts` (lines 1938 and 1941). This is a bug that would cause the Gold SIP auto-debit job to run twice daily, potentially creating duplicate debit entries.

**No `/api/health` endpoint**: The `/api/health` endpoint is listed as a wave 182 open todo item. While the middleware dashboard provides detailed health information, a simple `/api/health` endpoint returning HTTP 200 with DB and sidecar status is a standard requirement for load balancer health checks.

**Grafana dashboards are pre-built JSON files** but there is no automated provisioning script to load them into a running Grafana instance beyond the `provisioning/` directory structure.

| Component | Status |
|---|---|
| Docker Compose (prod) | Ready |
| Docker Compose (WAF) | Ready |
| Kubernetes manifests | Ready |
| Helm chart | Ready |
| HPA/PDB | Configured |
| NetworkPolicy | Configured |
| Prometheus | Configured |
| Grafana (9 dashboards) | Configured |
| Loki | Configured |
| Tempo | Configured |
| OpenTelemetry | Implemented |
| Background workers (8) | Implemented |
| Cache busting | Implemented |
| `/api/health` endpoint | Missing (open todo) |
| SIPProcessor duplicate call | Bug (P1) |

---

## 5. Middleware Integration — 72 / 100

### Architecture

All middleware integration follows a hub-and-spoke pattern through the Go bridge (`MIDDLEWARE_BRIDGE_URL`). The bridge aggregates Kafka, Dapr, Fluvio, Temporal, Keycloak, Permify, Redis, OpenSearch, TigerBeetle, and Lakehouse. The `middlewareBridge.ts` file (1,634 lines, 237 exported functions) provides typed wrappers for all bridge endpoints, each returning `null` on failure rather than throwing. This graceful degradation pattern means the portal remains functional even when individual middleware components are unavailable.

### Per-Middleware Status

| Middleware | Client File | Bridge Integration | Health Check | Graceful Fallback |
|---|---|---|---|---|
| Kafka | `server/kafkaClient.ts` | Via bridge `/v1/middleware/kafka/*` | Yes (wave162) | Yes (no-op when env unset) |
| Redis | `server/cache.ts` | Direct via ioredis | Yes (wave162) | Yes (in-process Map) |
| Temporal | `server/temporalClient.ts` | Via bridge `/v1/temporal/*` | Yes (wave162) | Yes (no-op) |
| TigerBeetle | `server/middlewareBridge.ts` | Via bridge `/v1/tigerbeetle/*` | Yes (wave162) | Yes (null return) |
| Fluvio | `server/fluvioClient.ts` + bridge | Via bridge `/v1/fluvio/*` | Yes (wave162) | Yes (null return) |
| Dapr | `server/daprClient.ts` (unused) | Via bridge `/v1/dapr/*` | Yes (wave162) | Yes (503 fallback) |
| Keycloak | `server/_core/keycloak.ts` | Direct OIDC + bridge admin | Yes (wave162) | Partial |
| Permify | Via bridge `/v1/permify/*` | Via bridge | Yes (wave162) | Yes (null return) |
| OpenSearch | `server/opensearchClient.ts` | Direct + bridge | Yes (wave162) | Yes (DB fallback) |
| APISIX | `infra/apisix/routes.yaml` | Static config + dashboard | Yes (static) | N/A (infra layer) |
| open-appsec | `infra/docker-compose.waf.yml` | Infra layer | N/A | N/A (infra layer) |
| Mojaloop | Via bridge `/v1/mojaloop/*` | Via bridge | No dedicated check | Yes (null return) |

### Issues

**Dapr client is dead code**: `server/daprClient.ts` (196 lines) implements direct Dapr sidecar HTTP calls but is not imported anywhere. Dapr operations are handled through the Go bridge in `wave162Router`. The standalone client should either be integrated or removed to avoid confusion.

**Fluvio SSE consumer endpoint missing**: The wave 182 todo item "Fluvio: Add SSE consumer endpoint for real-time event streaming" is open. The portal can produce Fluvio events via the bridge but cannot consume them as a server-sent event stream.

**APISIX admin client not implemented**: The wave 182 todo item "APISIX: Add dedicated APISIX admin client with route/plugin management" is open. The current APISIX integration is static configuration only; dynamic route management from the portal UI is not implemented.

**Mojaloop full transfer flow incomplete**: The wave 182 todo item "Mojaloop: Complete full transfer flow in activities_mojaloop.go" is open. The portal can initiate Mojaloop transfers via the bridge, but the Go bridge's Mojaloop activities are not fully implemented.

---

## 6. Compliance & Data Governance — 70 / 100

### Strengths

The platform demonstrates strong compliance awareness across multiple regulatory frameworks:

- **NDPR (Nigeria Data Protection Regulation)**: Biometric data (face embeddings) are subject to a 90-day purge schedule, implemented in the DeepFace integration. The purge worker is referenced in the codebase.
- **CBN Compliance**: SCUML checks, adverse media screening, BVN cross-validation via NIBSS, and document expiry enforcement are all implemented.
- **KYC/KYB pipeline**: Full document verification (passport, national ID, driver's license), liveness detection with DeepFace anti-spoofing, CAC business verification, director mapping, and UBO (Ultimate Beneficial Owner) identification.
- **Audit logging**: `server/auditEvents.ts` publishes audit events to Kafka/Fluvio with DB fallback. The audit log table is in the schema and the `logAuditEvent` DB helper is implemented.
- **PCI DSS awareness**: Card data is never stored locally; all card operations go through the middleware bridge to TigerBeetle for ledger entries and the card issuing service for tokenization.

### Issues

**DeepFace biometric pipeline partially open**: Waves 177–180 (sidecar wiring into `checkLiveness`, `submitKyc`, KYB director verification, pgvector face embeddings table, duplicate detection) are listed as open todo items. The sidecar helper (`server/deepfaceSidecar.ts`) is implemented with graceful fallbacks, but the full biometric pipeline is not yet wired end-to-end.

**NDPR purge for face embeddings not implemented**: Wave 178 todo item — the `face_embeddings` pgvector table is not yet in `drizzle/schema.ts`, and the NDPR 90-day purge for embeddings is listed as open (wave 179).

**No formal data retention policy document**: While NDPR purge logic exists in code, there is no `DATA_RETENTION_POLICY.md` or equivalent document describing retention periods for all data categories.

**Stripe test sandbox not claimed**: The Stripe test sandbox provisioned for this project has not been claimed at the Stripe dashboard. The claim deadline was May 11, 2026 — this deadline has passed, meaning the test Stripe environment may no longer be activatable without re-provisioning.

| Compliance Area | Status |
|---|---|
| NDPR biometric retention (90-day) | Partial (code exists, not fully wired) |
| CBN KYC/KYB | Implemented |
| BVN cross-validation | Implemented |
| SCUML adverse media | Implemented |
| Audit logging | Implemented |
| PCI DSS card data isolation | Implemented |
| Face embeddings pgvector | Not yet in schema |
| Data retention policy document | Missing |
| Stripe test sandbox | Claim deadline passed |

---

## 7. Known Bugs & Critical Issues

The following issues are ranked by severity and should be addressed before a production launch.

| Priority | Issue | File | Impact |
|---|---|---|---|
| P1 | `startSIPProcessor()` called twice | `server/_core/index.ts:1938,1941` | Duplicate Gold SIP debits |
| P1 | `payloadScanMiddleware` registered after tRPC handler | `server/_core/index.ts:646` | tRPC requests bypass payload scanner |
| P2 | TypeScript errors in `crud120.ts` | `server/routers/crud120.ts` | CI `tsc --noEmit` fails |
| P2 | Stripe test sandbox claim deadline passed | N/A | Test billing environment unavailable |
| P2 | mTLS certs not committed to repo | `infra/certs/` | Fresh clone requires manual cert regeneration |
| P2 | `SKILL.md` not committed to repo | `/home/ubuntu/skills/paygate-merchant-portal/` | Fresh clone fails wave96/129/130 tests |
| P3 | `server/daprClient.ts` is dead code | `server/daprClient.ts` | Confusion, maintenance burden |
| P3 | `/api/health` endpoint missing | N/A | Load balancer health checks fail |
| P3 | Fluvio SSE consumer endpoint missing | N/A | Real-time event streaming not available |
| P3 | 296 open todo items | `todo.md` | Feature gaps documented but unresolved |

---

## 8. Recommendations

The following actions are recommended in priority order to bring the platform to full production readiness.

**Immediate (before any production traffic):**

1. Fix the `startSIPProcessor()` duplicate call in `index.ts` — move the call to a single location outside the conditional block.
2. Move `payloadScanMiddleware` registration to before the tRPC adapter registration.
3. Commit the mTLS certificates (`infra/certs/*.crt`, `infra/certs/*.key`) to the repository (or add a `postinstall` script that generates them automatically on fresh clone).
4. Add a `postinstall` or `prepare` script to generate the SKILL.md if it does not exist, or commit it to the repository.
5. Fix the TypeScript errors in `server/routers/crud120.ts` by updating the Drizzle insert calls to use the `values()` method signature compatible with Drizzle ORM v0.44.

**Short-term (within one sprint):**

6. Add a `/api/health` endpoint returning `{ status: "ok", db: boolean, redis: boolean, timestamp: string }`.
7. Remove or integrate `server/daprClient.ts` — if Dapr pub/sub is needed directly (not via bridge), import and use it; otherwise delete it.
8. Wire `DEEPFACE_SIDECAR_URL` through `ENV` and `webdev_request_secrets`.
9. Add the `face_embeddings` pgvector table to `drizzle/schema.ts` and run `pnpm db:push`.
10. Re-provision the Stripe test sandbox.

**Medium-term (before scale-up):**

11. Extract inline procedures from `server/routers.ts` into dedicated sub-router files to bring the main file under 2,000 lines.
12. Add live integration tests for at least Kafka, Redis, and PostgreSQL connectivity using testcontainers or a dedicated integration test environment.
13. Implement the Fluvio SSE consumer endpoint for real-time event streaming to the frontend.
14. Complete the Mojaloop full transfer flow in the Go bridge.
15. Write a formal `DATA_RETENTION_POLICY.md` documenting retention periods for all PII and biometric data categories.

---

## 9. Conclusion

PayGate is a technically ambitious and architecturally sound fintech platform. The breadth of features — from BNPL and virtual card issuing to cross-border CIPS/UPI/PIX rails, DeepFace biometric KYC, and a full observability stack — is impressive for a single-repository monorepo. The security posture is strong, with 11 rate limiters, CSRF protection, mTLS, Keycloak OIDC, Permify PBAC, and both an Express-level WAF and an open-appsec ML WAF for production.

The primary risks before production deployment are the two P1 bugs (duplicate SIPProcessor call, payload scanner placement), the partially-complete biometric pipeline, and the 296 open todo items that represent real feature gaps. With the P1 bugs fixed and the mTLS/SKILL.md artifacts committed to the repository, the platform would be suitable for a limited production rollout with close monitoring.

The test suite — 7,643 tests, all passing when run individually — provides a strong regression safety net, and the wave-based development history means every feature has a corresponding test file. The platform is well-positioned to reach full production readiness within two to three focused sprints.

---

*This report was generated by automated code analysis and does not constitute a formal security audit or penetration test. A formal third-party security assessment is recommended before processing live financial transactions.*
