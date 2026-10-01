# Wave 4 — Full-Stack Alignment & Integration Audit/Remediation

## Goal
1. Frontend↔Backend parity: every tRPC router/procedure has UI; every UI page/feature has backing endpoints; zero orphans either direction (web PWA + Flutter + React Native).
2. DB integration: every feature is wired to Postgres CRUD (drizzle) — no in-memory-only or stub persistence on production paths.
3. Middleware/integration matrix: verify real wiring (not stubs) for Kafka, Dapr, Fluvio, Temporal, Postgres, Keycloak, Permify, Redis, Mojaloop, OpenSearch, OpenAppSec, APISIX, TigerBeetle, Apache Sedona, GeoLibre (opengeos), lakehouse — across TS/Go/Rust/Python components.

## Stage 1 — Parallel audits (explore agents, read-only)
- A1 Router↔UI parity: enumerate all tRPC routers/procedures (server/routers.ts + server/routers/*) vs client/src/pages+App.tsx routes vs mobile/flutter screens vs mobile/react-native app routes. Output: procedures-without-UI, pages-without-endpoints, per-platform gaps.
- A2 DB/CRUD integration: for each domain feature, verify drizzle-backed CRUD exists and is called (server/db.ts + drizzle/schema.ts); flag in-memory maps/arrays used as primary persistence on production paths; flag tables with no reader/writer and writers with no table.
- A3 Integration matrix: for each of the 15 listed integrations, find client/SDK code, config, wiring point (mount/middleware/env), and classify REAL / PARTIAL / STUB / ABSENT per language (TS server, go-bridge, rust-services, python). Include Sedona/GeoLibre/lakehouse geo-analytics stack — check python services.
- A4 Middleware ordering & coverage: verify security/observability middleware actually mounted (openappsec, apisix gateway config, keycloak auth, permify checks, redis cache/ratelimit) on all ingress paths (tRPC, REST, SSE, webhooks, go-bridge).

## Stage 2 — Fixers (coder agents, disjoint ownership)
- W13: server wiring gaps from A2/A3/A4 (server/**, drizzle/0107 if needed)
- W14: web client gaps from A1 (client/**)
- W15: mobile gaps from A1 (mobile/**)
- W16: go/rust/python integration gaps from A3 (go-bridge/**, rust-services/**, python/**)
Dispatch only for findings confirmed REAL gaps; stubs that are intentional documented boundaries are reported, not rewritten.

## Stage 3 — Gates & delivery
- Gates: server tsc, client tsc (4GB), go build/vet, cargo check, targeted vitest
- Apply any new migration to paygate_monitor + snapshot
- Commit, push via PAT (git push, single commit), verify remote tip
- Final report .md + .docx with REF tags

## Constraints
Fail-loud; no mocks/placeholders on production paths; don't weaken tests; FUSE/NOEXEC/bootstrap_env.sh; money bigint kobo; PBAC semantics preserved.
