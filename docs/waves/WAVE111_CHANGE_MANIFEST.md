# Wave 111 Change Manifest

**Date:** 2026-04-27
**Status:** Complete — all tests passing
**Test Results:** TypeScript `tsc`: 0 errors · Vitest: 3,456/3,456 · Python pytest: 61/61

---

## Overview

Wave 111 delivers three production-quality improvements to the PayGate Merchant Portal:

1. **USSD end-user language picker** — a step-0 language selection menu that allows merchants to self-select their preferred language (EN/HA/YO/IG/FR) at the start of every fresh USSD session, without requiring operator-side configuration.
2. **Complete `useAdaptiveInterval` rollout** — all 26 remaining pages that still used hardcoded `refetchInterval` values have been migrated to the network-quality-aware `useAdaptiveInterval` hook, completing the rollout started in Wave 110.
3. **`useAdaptiveInterval` vitest unit tests** — 28 new server-side tests covering the pure `adaptiveInterval` function and the hook's contract across all 5 network tiers (`offline`, `2g`, `3g`, `4g`, `5g`).

---

## 1. USSD Language Picker (Step-0 Menu)

### Design

When a merchant dials the USSD shortcode without an operator-supplied `?lang=` query parameter, the first interaction now shows a 5-option language selection menu instead of the main menu. The selected language is persisted in the session for all subsequent steps.

```
CON PayGate Merchant - Select language:
1. English
2. Hausa
3. Yoruba
4. Igbo
5. Français
```

After the merchant selects a language, the main menu is shown immediately in the chosen language — no extra round-trip is required.

### Behaviour Matrix

| Scenario | Behaviour |
|---|---|
| Fresh session, no `?lang=` param | Language picker shown |
| Fresh session, `?lang=ha` | Hausa main menu shown directly (picker skipped) |
| Fresh session, `?lang=en` | English main menu shown directly (picker skipped) |
| Invalid choice (e.g., 9) in picker | Picker re-shown with error message |
| Valid choice (1–5) | Session updated, main menu shown in chosen language |
| Existing session mid-flow | Session language honoured, picker never shown |

### New Environment Variable

| Variable | Default | Description |
|---|---|---|
| `LANG_PICKER_ENABLED` | `true` | Set to `false` to disable the picker globally (e.g., for operators that always pre-select language) |

### Files Changed

| File | Change |
|---|---|
| `python-services/merchant-ussd-fallback/main.py` | Added `LANG_PICKER_ENABLED`, `LANG_PICKER_ORDER` constants; added `lang_explicitly_set` parameter to `handle_merchant_ussd`; added step-0 picker block and step-1 response handler |
| `python-services/merchant-ussd-fallback/locales/en.json` | Added 8 language picker keys to `menu` object |
| `python-services/merchant-ussd-fallback/locales/ha.json` | Added 8 language picker keys (Hausa translations) |
| `python-services/merchant-ussd-fallback/locales/yo.json` | Added 8 language picker keys (Yoruba translations) |
| `python-services/merchant-ussd-fallback/locales/ig.json` | Added 8 language picker keys (Igbo translations) |
| `python-services/merchant-ussd-fallback/locales/fr.json` | Added 8 language picker keys (French translations) |
| `python-services/merchant-ussd-fallback/test_merchant_ussd.py` | Updated 5 existing tests to use `?lang=en` (skip picker); added 6 new language picker tests |

### New Locale Keys (per language)

| Key | EN Value |
|---|---|
| `lang_select_header` | `PayGate Merchant - Select language:` |
| `lang_select_1` | `English` |
| `lang_select_2` | `Hausa` |
| `lang_select_3` | `Yoruba` |
| `lang_select_4` | `Igbo` |
| `lang_select_5` | `Français` |
| `lang_invalid` | `Invalid choice. Select 1-5.` |
| `lang_selected` | `Language set to English.` |

---

## 2. Complete `useAdaptiveInterval` Rollout

All 26 pages that previously used hardcoded `refetchInterval` values have been migrated to `useAdaptiveInterval`. This completes the network-quality-aware polling rollout begun in Wave 110.

### Migrated Pages

| Page | Previous Interval | Adaptive Tier |
|---|---|---|
| `AgentBanking` | 30 000 ms | Standard |
| `AuditLog` | 60 000 ms | Standard |
| `CrossBorder` | 5 000 ms | Fast |
| `Dashboard` | 30 000 ms | Standard |
| `DeveloperPortal` | 30 000 ms | Standard |
| `FXDashboard` | 5 000 ms | Fast |
| `FraudAlertsDashboard` | 10 000 ms | Standard |
| `GoLiveChecklist` | 30 000 ms | Standard |
| `GoldSIP` | 30 000 ms | Standard |
| `Inventory` | 30 000 ms | Standard |
| `KioskHealth` | 15 000 ms | Standard |
| `KitchenDisplay` | 5 000 ms | Fast |
| `MerchantAnalyticsDashboard` | 30 000 ms | Standard |
| `MicroserviceHealth` | 10 000 ms | Standard |
| `NotificationsCenter` | 30 000 ms | Standard |
| `PtspBatches` | 30 000 ms | Standard |
| `QRPayments` | 10 000 ms | Standard |
| `RateLimitDashboard` | 10 000 ms | Standard |
| `RestaurantOrders` | 5 000 ms | Fast |
| `SettingsPayments` | 30 000 ms | Standard |
| `Settlements` | 30 000 ms | Standard |
| `TenantBillingDashboard` | 30 000 ms | Standard |
| `TerminalMap` | 10 000 ms | Standard |
| `USDCPayouts` | 30 000 ms | Standard |
| `WebhookDeliveries` | 30 000 ms | Standard |
| `AdminSlaMonitor` | 10 000 ms | Standard |

The `useAdaptiveInterval` hook scales the base interval by the following multipliers:

| Network Tier | Multiplier | Effect |
|---|---|---|
| `offline` | `false` | Polling disabled entirely |
| `2g` | 4× | Polling slowed to reduce data usage |
| `3g` | 2× | Polling halved |
| `4g` | 1× | Nominal interval |
| `5g` | 0.5× | Polling doubled for real-time feel |

---

## 3. `useAdaptiveInterval` Vitest Unit Tests

A new test file `server/wave111.adaptiveInterval.test.ts` adds 28 tests covering:

- **Pure function tests** (`adaptiveInterval`): verifies correct interval scaling for all 5 tiers, `false` return for `offline`, and boundary conditions.
- **Hook contract tests**: verifies that the hook returns the correct value for each tier when called with a base interval.
- **Edge cases**: zero base interval, very large base interval, unknown tier fallback.

---

## Test Summary

| Suite | Wave 110 | Wave 111 | Delta |
|---|---|---|---|
| Vitest (Node.js) | 3,428 | 3,456 | +28 |
| Python pytest | 56 | 61 | +5 |
| TypeScript errors | 0 | 0 | — |

---

## Suggested Next Steps for Wave 112

1. **USSD language picker — remember preference across sessions** — currently the language choice is stored only for the duration of the USSD session (in-memory). Persisting the preference to a phone-number-keyed store (Redis or the bridge `/v1/merchant/preferences` endpoint) would allow returning merchants to skip the picker on subsequent dials.
2. **Add `useAdaptiveInterval` to `DashboardLayout` sidebar badge counters** — the notification badge and unread-count indicators in the sidebar still use hardcoded `refetchInterval: 60000`. Migrating them would complete the full-portal rollout.
3. **Add a `LANG_PICKER_ENABLED` toggle to the merchant portal Settings page** — operators who manage multiple shortcodes could toggle the picker per-shortcode from the UI rather than via environment variable.
