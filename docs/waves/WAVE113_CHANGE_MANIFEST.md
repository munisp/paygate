# Wave 113 — Change Manifest

**Date:** 2026-04-27  
**Status:** Complete  
**Test results:** Vitest 3,473/3,473 · Python pytest 70/70 · TypeScript exit 0

---

## Summary

Wave 113 closes the loop on the Wave 112 USSD Language Picker feature by wiring the Settings toggle into the live USSD microservice, surfacing a support action in the portal UI, and adding a full integration test suite for the new tRPC procedures.

---

## Changes

### 1. `/api/merchant-config/:merchantId` — Portal Server Endpoint

**File:** `server/_core/index.ts` (line 1730)

A new internal REST endpoint was added to the Express server. It is protected by the `INTERNAL_API_KEY` header and returns the merchant's runtime configuration flags — initially just `ussdLangPickerEnabled`. This endpoint is the bridge between the portal database and the USSD Python microservice.

| Field | Value |
|---|---|
| Route | `GET /api/merchant-config/:merchantId` |
| Auth | `x-internal-api-key: <INTERNAL_API_KEY>` |
| Response | `{ merchantId, ussdLangPickerEnabled }` |
| Error codes | 401 (bad key), 400 (invalid ID), 404 (not found), 503 (DB unavailable) |

### 2. USSD Service — Merchant Config Polling

**File:** `python-services/merchant-ussd-fallback/main.py`

The USSD microservice now fetches its configuration from the portal on startup. Two new env vars control this:

| Env Var | Purpose |
|---|---|
| `MERCHANT_PORTAL_URL` | Base URL of the portal (e.g. `https://portal.example.com`) |
| `MERCHANT_ID` | Numeric merchant DB ID for this USSD deployment |

The `_fetch_merchant_config()` async helper is called in the `lifespan` context manager after Redis initialisation. If the portal is unreachable or the env vars are not set, the service falls back to the static `LANG_PICKER_ENABLED` env var (default `true`). The runtime flag `_lang_picker_enabled` replaces the static `LANG_PICKER_ENABLED` constant in the state machine, so the toggle takes effect without redeploying the container.

### 3. `ussd.resetLangPref` — tRPC Procedure

**File:** `server/routers.ts` (ussdRouter)

A new protected mutation was added to the `ussdRouter`. Support agents can call this to clear a customer's stored Redis language preference. It proxies a `DELETE /lang-pref/{phone}` request to the USSD microservice using the `USSD_GATEWAY_URL` env var. A 404 response from the service is treated as success (preference already cleared).

### 4. Reset Language Preference Button — USSDSessions Page

**File:** `client/src/pages/USSDSessions.tsx`

The Session Detail dialog now includes a "Support actions" section at the bottom. A "Reset Language Preference" button (amber, with `Languages` icon) opens a confirmation dialog before calling `trpc.ussd.resetLangPref`. The confirmation dialog shows the customer's MSISDN and explains the effect of the action.

### 5. Wave 113 Vitest Integration Tests

**File:** `server/wave113.settingsUssd.test.ts` (17 new tests)

| Suite | Tests |
|---|---|
| `settings.getUssdLangPickerEnabled` | Returns `true` default, returns `false` when stored, returns `true` when null, throws UNAUTHORIZED, returns default when no merchant |
| `settings.updateUssdLangPickerEnabled` | Persists `false`, persists `true`, throws UNAUTHORIZED, rejects non-boolean (Zod), throws NOT_FOUND when no merchant |
| `ussd.resetLangPref` | Throws PRECONDITION_FAILED when URL not set, throws UNAUTHORIZED, rejects short phone (Zod), rejects long phone (Zod), calls DELETE endpoint, treats 404 as success, throws INTERNAL_SERVER_ERROR on 500 |

---

## Test Coverage Delta

| Suite | Wave 112 | Wave 113 | Delta |
|---|---|---|---|
| Vitest (Node.js) | 3,456 | 3,473 | +17 |
| Python pytest | 70 | 70 | 0 |
| TypeScript errors | 0 | 0 | 0 |

---

## Files Changed

| File | Change |
|---|---|
| `server/_core/index.ts` | Added `/api/merchant-config/:merchantId` endpoint |
| `server/routers.ts` | Added `ussd.resetLangPref` mutation |
| `client/src/pages/USSDSessions.tsx` | Added Reset Language Preference button and confirmation dialog |
| `python-services/merchant-ussd-fallback/main.py` | Added `_fetch_merchant_config()`, `MERCHANT_PORTAL_URL`, `MERCHANT_ID`, `_lang_picker_enabled` |
| `python-services/merchant-ussd-fallback/requirements.txt` | `httpx>=0.27.0` (already present via `httpx==0.28.1`) |
| `server/wave113.settingsUssd.test.ts` | New: 17 integration tests |
| `todo.md` | Wave 113 items added and marked complete |

---

## Suggested Next Steps (Wave 114)

1. **Add a periodic config refresh to the USSD service** — currently `_fetch_merchant_config()` is called only once at startup. Adding a background task that re-fetches every 5 minutes would allow operators to toggle the picker without restarting the USSD container.
2. **Add the `MERCHANT_PORTAL_URL` and `MERCHANT_ID` env vars to the USSD service Docker Compose / Helm chart** — these are new required env vars for the merchant-config polling feature; they need to be documented in the deployment runbook and added to the service's environment configuration.
3. **Add an audit log entry when a support agent resets a language preference** — the `resetLangPref` mutation currently silently proxies to the USSD service; logging the action (actor, phone, timestamp) to the `audit_logs` table would improve support accountability.
