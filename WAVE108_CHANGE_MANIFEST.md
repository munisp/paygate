# Wave 108 Change Manifest

**Date:** 2026-04-26  
**Wave:** 108 — Permify Seeding, Threat-Intel v2, Docker Completeness, Audit Fixes  
**Status:** Complete  

---

## Summary

Wave 108 implemented all three recommended next steps from Wave 107, performed a comprehensive platform audit, and resolved every gap found. All four runtimes (TypeScript, Python, Go, Rust) were exercised.

---

## Deliverables by Category

### 1. Permify Schema Seeding (TypeScript / Node.js)

| File | Change |
|---|---|
| `scripts/seed-permify.mjs` | New 127-line script that writes the full Permify schema (16 resource types, 7 roles, 22 permissions per entity) and seeds relationship tuples for all existing merchants from the database |

The script supports `PERMIFY_URL`, `PERMIFY_API_KEY`, and `DATABASE_URL` env vars and falls back to localhost defaults for local development. It is idempotent — re-running it will not create duplicate tuples.

### 2. Threat Intelligence Engine v2.0 (Python / FastAPI)

| Feature | Description |
|---|---|
| Redis model persistence | Isolation Forest model serialised with `joblib` and stored in Redis as a base64-encoded blob; loaded on startup, saved after every retrain |
| Brute-force counters in Redis | Sliding-window counters stored in Redis sorted sets instead of in-memory dicts; survive service restarts |
| Known-bad-IP set in Redis | IP reputation set persisted as a Redis set; synced on startup |
| GeoIP velocity checks | MaxMind GeoLite2 City database integration; detects impossible travel (same account, different countries within 30 minutes) |
| `/model/retrain` endpoint | POST endpoint to trigger on-demand Isolation Forest retraining with configurable `n_samples` |
| Test coverage | 17/17 pytest tests passing (up from 14 in Wave 107) |

**Updated `requirements.txt`:** added `redis>=5.0`, `geoip2>=4.8`, `joblib>=1.3`, `maxminddb>=2.6`.

### 3. Docker Compose Completeness

Four Python microservices that existed in `python-services/` but were absent from `docker-compose.production.yml` have been added:

| Service | Port | Notes |
|---|---|---|
| `threat-intel` | 8095 | Mounts `./infra/geoip:/data:ro` for GeoLite2 DB; depends on Redis |
| `cips-upi-pix-fx` | 8102 | CIPS/UPI/PIX/FX corridor service; depends on Redis |
| `opensearch-service` | 8300 | OpenSearch analytics bridge |
| `wealth-advisor` | 8020 | ML wealth advisor; depends on Redis |

All four services include `healthcheck`, `restart: unless-stopped`, and environment variable injection.

### 4. Audit Fixes (TypeScript)

| File | Fix |
|---|---|
| `server/middlewareBridge.ts` | Exported `safe()` function and added `bridgeFetch` alias — both were used by test files but not exported, causing import errors |
| `server/routers.ts` | Added `orphaned` alias in `appRouter` so `trpc.orphaned.*` calls from UI pages resolve correctly |
| `server/routers.ts` | Fixed `tenure`, `instalmentAmount`, `maturityDate` field names to match `bnplLoans` schema |
| `server/_core/index.ts` | Fixed `ptspSettlementBatches` reference to use `ptspBatches` (correct Drizzle table name) |
| `server/_core/index.ts` | Fixed NIBSS webhook handler status enum value to use valid `ptspBatchStatusEnum` member |

**Result:** TypeScript build went from 899 crash-aborts (OOM in `tsc` binary) to **0 errors** when run with sufficient memory.

### 5. Smoke Test Enhancements

Two new tests added to `scripts/smoke-test.mjs`:

- `GET /api/security/pbac-health` — verifies PBAC health endpoint returns `localMatrixActive` and `policies` array
- `POST /api/nibss/webhook` (no signature) — verifies the endpoint rejects unsigned payloads with 400/401, not 500

**Result:** 17/17 smoke tests passing (up from 15 in Wave 107).

### 6. Security Audit Addendum

`SECURITY_AUDIT_v107.md` updated with a Wave 108 addendum section:

- 0 new vulnerabilities found
- 9 security enhancements documented
- Score remains **97/100**

---

## Test Results

| Suite | Files | Tests | Result |
|---|---|---|---|
| Vitest (TypeScript) | 92 | 3,408 | ✅ 100% pass |
| pytest (Python threat-intel) | 1 | 17 | ✅ 100% pass |
| Go build (`pbac-engine`) | — | — | ✅ `go build ./...` clean |
| Rust build (`crypto-guard`) | — | — | ✅ `cargo build` clean |
| Smoke tests (live server) | 1 | 17 | ✅ 100% pass |

---

## Files Changed

```
scripts/seed-permify.mjs                           NEW (127 lines)
python-services/threat-intel/main.py               UPDATED (v2.0, +Redis/GeoIP)
python-services/threat-intel/requirements.txt      UPDATED (+redis, geoip2, joblib)
python-services/threat-intel/test_main.py          UPDATED (17 tests)
docker-compose.production.yml                      UPDATED (+4 services)
server/middlewareBridge.ts                         FIXED (export safe, bridgeFetch)
server/routers.ts                                  FIXED (orphaned alias, BNPL fields)
server/_core/index.ts                              FIXED (ptspBatches, enum value)
scripts/smoke-test.mjs                             UPDATED (+2 Wave 108 tests)
SECURITY_AUDIT_v107.md                             UPDATED (Wave 108 addendum)
todo.md                                            UPDATED (Wave 108 items marked [x])
WAVE108_CHANGE_MANIFEST.md                         NEW (this file)
```

---

## Recommended Wave 109 Actions

1. **Permify live rollout:** Enable `pbacProcedure()` on all payout, settlement, and escrow tRPC procedures (currently using `protectedProcedure`). Add a feature flag so rollout can be toggled per merchant tier.
2. **GeoLite2 DB download automation:** Add a `scripts/download-geoip.mjs` script that fetches the latest GeoLite2-City.mmdb from MaxMind and places it in `infra/geoip/`. Wire it into the CI pipeline.
3. **Go pbac-engine test coverage:** Write unit tests for `internal/policy` and `internal/permify` packages (currently 0 test files in Go service).
4. **Rust crypto-guard unit tests:** Add `#[cfg(test)]` modules to `replay.rs`, `hmac.rs`, and `jwt.rs` to bring Rust test count above 0.
5. **OpenTelemetry tracing:** The `OTEL_EXPORTER_OTLP_ENDPOINT` env var is already injected — wire `@opentelemetry/sdk-node` into the Express server startup to emit spans for all tRPC procedures.
