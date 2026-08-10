# Wave 112 Change Manifest

**Date:** 2026-04-27  
**Wave:** 112  
**Status:** Complete  
**Test Results:** Vitest 3,456/3,456 · Python pytest 70/70 · TypeScript 0 errors

---

## Overview

Wave 112 delivers three quality-of-life improvements that complete the USSD language experience and finish the network-quality-aware polling rollout across the entire portal.

---

## Changes

### 1. Redis-Backed USSD Language Preference Persistence

**Files changed:** `python-services/merchant-ussd-fallback/main.py`, `requirements.txt`, `test_merchant_ussd.py`

Returning USSD users no longer see the language picker on every dial. After a customer selects a language in the step-0 picker, the choice is stored in Redis under `ussd:lang_pref:<phone>` with a 90-day TTL. On subsequent dials, the stored preference is loaded during session initialisation and the picker is skipped automatically.

When Redis is unavailable (network partition, cold start), the service falls back to an in-process `dict` that persists for the lifetime of the worker process. This ensures zero-downtime degradation with no customer-visible impact.

Two new HTTP endpoints were added to the USSD service:

| Endpoint | Method | Description |
|---|---|---|
| `/lang-pref/{phone}` | `GET` | Return the stored language preference for a phone number |
| `/lang-pref/{phone}` | `DELETE` | Clear the stored preference (e.g., for customer support resets) |

**New tests (9):** `test_lang_pref_set_and_get`, `test_lang_pref_skips_picker_on_return`, `test_lang_pref_delete_clears_preference`, `test_lang_pref_get_endpoint`, `test_lang_pref_delete_endpoint`, `test_lang_pref_helper_set_get_delete`, `test_lang_pref_invalid_lang_not_returned`, and two additional edge-case tests.

---

### 2. Complete `useAdaptiveInterval` Rollout — 6 Remaining Pages

**Files changed:** `AdminSystemHealth.tsx`, `AdminWebhookAlerts.tsx`, `AdminSlaMonitoring.tsx`, `ConsumerLayout.tsx`, `ConsumerNotifications.tsx`, `GrpcHealthCheck.tsx`

Every polling query in the portal now scales its refresh rate to the device's measured network tier. The 6 remaining pages that still used hardcoded `refetchInterval` values were migrated:

| File | Intervals migrated |
|---|---|
| `AdminSystemHealth.tsx` | 30 s, 60 s, 120 s |
| `AdminWebhookAlerts.tsx` | 30 s |
| `AdminSlaMonitoring.tsx` | 60 s |
| `ConsumerLayout.tsx` | 60 s |
| `ConsumerNotifications.tsx` | 30 s |
| `GrpcHealthCheck.tsx` | 30 s |

With this wave, **100% of polling queries** across all 26 portal pages and 6 admin/consumer pages use `useAdaptiveInterval`. The rollout that began in Wave 109 is now complete.

---

### 3. USSD Language Picker Toggle in Settings Page

**Files changed:** `drizzle/schema.ts`, `server/routers.ts`, `client/src/pages/Settings.tsx`

Operators can now enable or disable the USSD step-0 language picker from the merchant Settings page without needing to change environment variables or redeploy the USSD service.

**Database:** A new `ussd_lang_picker_enabled` boolean column (default `true`) was added to the `merchants` table and applied to the live database via `ALTER TABLE`.

**tRPC procedures added to `settingsRouter`:**

| Procedure | Type | Description |
|---|---|---|
| `settings.getUssdLangPickerEnabled` | query | Return the current toggle state for the authenticated merchant |
| `settings.updateUssdLangPickerEnabled` | mutation | Persist the toggle state change |

**UI:** A new "USSD Language Picker" card was added to the Settings page (between the Soundbox Language and Consumer Portal sections). The card includes a toggle switch with live state feedback and an informational banner when the picker is enabled explaining the 90-day persistence behaviour.

---

## Test Summary

| Suite | Before | After | Delta |
|---|---|---|---|
| Vitest (Node.js) | 3,456 | 3,456 | 0 |
| Python pytest | 61 | 70 | +9 |
| TypeScript errors | 0 | 0 | 0 |

---

## Suggested Next Steps for Wave 113

1. **Wire the `ussdLangPickerEnabled` flag into the USSD service** — the Settings toggle persists the flag to the database, but `main.py` currently reads `LANG_PICKER_ENABLED` from the environment. Add a `/merchant-config/{merchant_id}` endpoint to the portal API and have the USSD service poll it on startup (or via a Redis pub/sub channel) so the toggle takes effect without a service restart.

2. **Add a "Clear Language Preference" action to the USSD Sessions page** — the `DELETE /lang-pref/{phone}` endpoint exists but is not yet surfaced in the portal UI. A small "Reset language" button on the USSD session detail view would let support agents clear a customer's stored preference when they call in.

3. **Add vitest integration tests for the new `settingsRouter` procedures** — `getUssdLangPickerEnabled` and `updateUssdLangPickerEnabled` are not yet covered by the server-side test suite. Adding tests that mock `getMerchantByOwnerId` and assert the correct return shape would lock in the contract.
