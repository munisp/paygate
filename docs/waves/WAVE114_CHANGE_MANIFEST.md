# Wave 114 — Change Manifest

**Date:** 2026-04-27  
**Status:** Complete  
**Test results:** Vitest 3,478/3,478 · Python pytest 76/76 · TypeScript exit 0

---

## Summary

Wave 114 completes the USSD Language Picker feature cycle by adding three production-hardening improvements: a background config refresh loop so the USSD service stays in sync with portal settings without a container restart, an audit log entry every time a support agent resets a customer's language preference, and a comprehensive deployment runbook for the USSD microservice.

---

## Changes

### 1. USSD Background Config Refresh Loop

**File:** `python-services/merchant-ussd-fallback/main.py`

The USSD microservice previously fetched merchant config only once at startup. Wave 114 adds a persistent background asyncio task (`_config_refresh_loop`) that re-polls the portal every `CONFIG_REFRESH_INTERVAL_SECS` seconds (default: 300). This means operators can toggle `LANG_PICKER_ENABLED` in the portal Settings page and have the change take effect in the USSD service within five minutes — without restarting the container.

| Addition | Detail |
|---|---|
| `CONFIG_REFRESH_INTERVAL_SECS` constant | `int(os.getenv("CONFIG_REFRESH_INTERVAL_SECS", "300"))` |
| `_config_refresh_loop()` async function | `while True: sleep → _fetch_merchant_config()` with exception guard |
| Lifespan wiring | `asyncio.create_task(_config_refresh_loop())` called after initial fetch |
| Cancellation | Task is cancelled cleanly in the lifespan `finally` block |

The loop catches all exceptions from `_fetch_merchant_config()` and logs a warning, ensuring a transient network error never terminates the background task.

### 2. Audit Log for `ussd.resetLangPref`

**File:** `server/routers.ts` (ussdRouter, `resetLangPref` procedure)

The `resetLangPref` mutation now records an audit log entry after each successful reset. The `logAuditEvent` function was added to the **static import block** of `routers.ts` (line 122) — a prerequisite for `vi.mock('./db')` to intercept it in tests.

The audit call is fire-and-forget (`.catch(err => logger.warn(...))`), so a database write failure does not cause the mutation to fail or roll back the USSD gateway call.

| Audit field | Value |
|---|---|
| `action` | `"ussd.resetLangPref"` |
| `resource` | `"ussd_lang_pref"` |
| `resourceId` | Phone number (MSISDN) |
| `merchantId` | Resolved merchant's DB ID |
| `actorId` | Authenticated user's `openId` |

### 3. USSD Service Deployment Runbook

**File:** `python-services/merchant-ussd-fallback/DEPLOYMENT_RUNBOOK.md` (new)

A comprehensive deployment runbook was written documenting all environment variables for the USSD microservice, including the new Wave 112–114 additions (`REDIS_URL`, `MERCHANT_PORTAL_URL`, `MERCHANT_ID`, `CONFIG_REFRESH_INTERVAL_SECS`, `USSD_GATEWAY_URL`). The runbook also covers Docker deployment, health check endpoint, USSD callback endpoint, and a per-wave changelog.

---

## Test Coverage Delta

| Suite | Wave 113 | Wave 114 | Delta |
|---|---|---|---|
| Vitest (Node.js) | 3,473 | 3,478 | +5 |
| Python pytest | 70 | 76 | +6 |
| TypeScript errors | 0 | 0 | 0 |

### New Vitest Tests — `server/wave114.auditLog.test.ts` (5 tests)

| Test | Assertion |
|---|---|
| `throws PRECONDITION_FAILED when USSD_GATEWAY_URL is not configured` | Mutation returns `PRECONDITION_FAILED` when env var is absent |
| `calls logAuditEvent with action=ussd.resetLangPref after a successful reset` | `logAuditEvent` is called with correct fields after success |
| `audit log failure does not cause the mutation to fail` | Mutation succeeds even when `logAuditEvent` rejects |
| `returns success when USSD service returns 404 (preference not found)` | 404 from gateway is treated as success |
| `throws INTERNAL_SERVER_ERROR when USSD service returns 500` | 500 from gateway propagates as `INTERNAL_SERVER_ERROR` |

### New Python Tests — `test_merchant_ussd.py` (6 tests)

| Test | Assertion |
|---|---|
| `test_config_refresh_interval_constant_exists` | `CONFIG_REFRESH_INTERVAL_SECS` is a positive integer |
| `test_config_refresh_interval_default_value` | Defaults to 300 when env var is not set |
| `test_config_refresh_loop_function_exists` | `_config_refresh_loop` is an async coroutine function |
| `test_config_refresh_loop_calls_fetch` | Loop calls `_fetch_merchant_config` at least once per iteration |
| `test_config_refresh_loop_handles_exception` | Loop continues after a fetch exception (does not crash) |
| `test_config_refresh_loop_uses_correct_interval` | Loop passes `CONFIG_REFRESH_INTERVAL_SECS` to `asyncio.sleep` |

---

## Files Changed

| File | Change |
|---|---|
| `python-services/merchant-ussd-fallback/main.py` | Added `asyncio` import, `CONFIG_REFRESH_INTERVAL_SECS` constant, `_config_refresh_loop()` async function, lifespan wiring |
| `python-services/merchant-ussd-fallback/test_merchant_ussd.py` | 6 new tests for background config refresh loop (70 → 76 total) |
| `python-services/merchant-ussd-fallback/DEPLOYMENT_RUNBOOK.md` | New: comprehensive deployment runbook |
| `server/routers.ts` | Added `logAuditEvent` to static import block; `resetLangPref` now calls `logAuditEvent` (fire-and-forget) |
| `server/wave114.auditLog.test.ts` | New: 5 integration tests for `ussd.resetLangPref` audit log behavior |
| `todo.md` | Wave 114 items marked complete |

---

## Suggested Next Steps (Wave 115)

1. **Configurable refresh interval in Settings UI** — `CONFIG_REFRESH_INTERVAL_SECS` is currently a server-side env var. Exposing it as a merchant-editable field in the Settings page (alongside the Language Picker toggle) would give operators full control without a deployment.

2. **Audit Log viewer in the portal UI** — The `audit_logs` table now receives entries from `resetLangPref`. Adding a read-only "Audit Log" tab to the Settings or Team page would surface these entries to admins, closing the accountability loop.

3. **Node.js-side tests for background refresh** — Wave 114 tests the Python `_config_refresh_loop` thoroughly. A parallel Node.js test verifying that the portal's `/api/merchant-config/:merchantId` endpoint returns fresh data after a DB update would add end-to-end confidence.
