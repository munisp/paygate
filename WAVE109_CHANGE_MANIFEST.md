# Wave 109 — Offline-First Resilience Layer
**Date:** Apr 27 2026  
**Scope:** All four runtimes (TypeScript, Python, Go, Rust)  
**Vitest:** 93 files · 3,428 tests · 100% pass rate  
**Python:** 50 tests (17 threat-intel + 33 USSD fallback) · 100% pass rate  
**Go:** All packages build cleanly · All test files pass  

---

## Problem Statement

WebSockets and Server-Sent Events (SSE) are inherently fragile on the network conditions
prevalent across sub-Saharan Africa and other developing regions:

| Network Condition | Typical RTT | Typical Downlink | Impact on WebSocket/SSE |
|---|---|---|---|
| Rural 2G (GPRS/EDGE) | 600–2,000 ms | 50–200 Kbps | Frequent TCP resets; SSE reconnects every 30–90 s |
| Urban 3G | 150–400 ms | 0.5–5 Mbps | Intermittent drops during handoffs |
| Load-shedding (power cuts) | N/A | 0 | Complete offline periods of 2–12 h |
| Shared WiFi hotspot | 200–800 ms | 0.1–2 Mbps | High packet loss; long-poll preferred over streaming |

The previous implementation used raw `new EventSource(...)` and `new WebSocket(...)` with
no reconnect backoff, no polling fallback, and no offline queue — meaning any network
interruption silently dropped real-time updates and lost in-flight mutations.

---

## New Files

### TypeScript (`client/src/lib/`)

| File | Purpose |
|---|---|
| `networkQuality.ts` | Measures RTT and downlink via `navigator.connection` + active probes; classifies into `offline / 2G / 3G / 4G / 5G`; emits change events; provides `adaptiveInterval(baseMs)` helper |
| `resilientWS.ts` | Drop-in WebSocket replacement: exponential backoff (base 1 s, cap 60 s) with ±30% jitter; automatic SSE fallback when WS fails 3× consecutively; long-poll fallback when SSE also fails; quality-aware heartbeat interval |
| `resilientSSE.ts` | `useResilientSSE<T>()` React hook: reconnect with full-jitter backoff; heartbeat timeout detection; automatic polling fallback at `pollIntervalMs`; `pauseOnHidden` flag to pause on hidden tabs |
| `offlineQueueV2.ts` | IndexedDB-backed mutation queue: 4 priority levels (CRITICAL=0, HIGH=1, NORMAL=2, LOW=3); idempotency key deduplication; conflict resolution (last-write-wins or merge); LZ-string compression for large payloads; max 5 retries with exponential delay (2 s base, 5 min cap) |

### TypeScript (`client/src/components/`)

| File | Purpose |
|---|---|
| `NetworkQualityBanner.tsx` | Persistent banner in `DashboardLayout` showing: connection tier badge (colour-coded), offline queue depth, last-sync timestamp; collapses when tier ≥ 4G and queue is empty |

### Service Worker (`client/public/`)

| File | Purpose |
|---|---|
| `sw-resilience.js` | Workbox-style strategies: Cache-First for static assets; Stale-While-Revalidate for tRPC GET queries; Network-First with 5 s timeout for mutations; Background Sync registration for queued mutations; Push notification queue with 24 h TTL |

### Python (`python-services/merchant-ussd-fallback/`)

| File | Purpose |
|---|---|
| `main.py` | FastAPI microservice exposing USSD session state machine: `*347*1#` balance check, `*347*2*AMOUNT*ACCT#` transfer initiation, `*347*3#` account freeze; Termii SMS gateway integration; session state stored in Redis with 10 min TTL |
| `test_merchant_ussd.py` | 33 pytest tests covering all session transitions, auth, error paths, and SMS delivery |
| `requirements.txt` | `fastapi`, `uvicorn`, `redis`, `httpx`, `python-multipart` |

### Go (`go-bridge/internal/handlers/`)

| File | Purpose |
|---|---|
| `bandwidth_probe.go` | `GET /api/probe/ping` — returns RTT echo with server timestamp; `POST /api/probe/measure` — accepts client-measured RTT + throughput, classifies tier, recommends compression (`br` for 2G/3G, `gzip` for 4G, `none` for 5G) and payload size (`minimal / compact / standard / full`) |
| `bandwidth_probe_test.go` | Unit tests for tier classification and recommendation logic |

### TypeScript (`server/`)

| File | Purpose |
|---|---|
| `resilience.test.ts` | 25 vitest tests covering: networkQuality tier classification, adaptive intervals, jitter bounds, offlineQueueV2 priority sorting and retry logic, USSD state machine, Go bandwidth probe logic (mirrored in TS), Service Worker cache strategy |

---

## Modified Files

### Raw EventSource → `useResilientSSE` Migration

All 6 raw `new EventSource(...)` usages replaced:

| File | Old | New |
|---|---|---|
| `client/src/hooks/useTransactionStream.ts` | `new EventSource("/api/events/transactions")` | `useResilientSSE({ url, pollUrl, pollIntervalMs: 10_000 })` |
| `client/src/pages/FraudAlertsDashboard.tsx` | `new EventSource("/api/events/fraud-stream")` | `useResilientSSE({ url, pollUrl, pollIntervalMs: 8_000 })` |
| `client/src/components/NotificationPanel.tsx` | `new EventSource("/api/events/notifications")` × 2 | `useResilientSSE({ url, pollUrl: "/api/trpc/notifications.list", pollIntervalMs: 20_000 })` |
| `client/src/pages/NotificationsCenter.tsx` | `new EventSource("/api/notifications/stream")` | `useResilientSSE({ url, pollUrl, pollIntervalMs: 20_000 })` |
| `client/src/pages/WAFAlertDashboard.tsx` | `new EventSource("/api/events/fraud-stream")` | `useResilientSSE({ url, pollUrl, pollIntervalMs: 15_000 })` |

### Raw WebSocket → `useResilientWS` Migration

| File | Old | New |
|---|---|---|
| `client/src/pages/POSTerminals.tsx` | `new WebSocket(wsUrl)` with manual reconnect | `useResilientWS({ url, onMessage, onConnected, onDisconnected })` |

### Go Bug Fixes (pre-existing corruption)

| File | Fix |
|---|---|
| `go-bridge/internal/handlers/crossborder_handlers.go` | Rewrote: file had Unicode box-drawing characters embedded in Go syntax, causing parse errors |
| `go-bridge/internal/keycloak/oidc_permify.go` | Renamed `Client` struct to `OIDCPermifyClient` to resolve duplicate declaration with `keycloak/client.go` |
| `go-bridge/internal/handlers/proxy_helper.go` | Added missing `ProxyToService` helper function referenced by crossborder handlers |
| `go-bridge/internal/fluvio/crossborder_stream.go` | Fixed two 4-argument `Produce()` calls to use the correct 3-argument signature |

### Service Worker Registration

`client/src/main.tsx` — registers `sw-resilience.js` alongside the existing `sw.js`, initialises
`networkQuality` monitoring on app start.

### DashboardLayout

`client/src/components/DashboardLayout.tsx` — imports and renders `NetworkQualityBanner` above
the main content area.

### Test Updates

`server/wave95.production.test.ts` and `server/wave96.production.test.ts` — updated 3 assertions
from `toContain("EventSource")` to `toMatch(/(EventSource|useResilientSSE)/)` to reflect the
migration from raw EventSource to the resilient abstraction.

---

## Architecture Overview

```
Browser
  ├── networkQuality.ts ──────── measures RTT/downlink, classifies tier
  │     └── emits "quality-change" events consumed by:
  │           ├── resilientSSE.ts  (adjusts reconnect backoff + poll interval)
  │           ├── resilientWS.ts   (adjusts heartbeat interval)
  │           └── offlineQueueV2.ts (adjusts flush aggressiveness)
  │
  ├── resilientWS.ts ─────────── WS → SSE → long-poll fallback chain
  ├── resilientSSE.ts ─────────── SSE → polling fallback
  ├── offlineQueueV2.ts ──────── IndexedDB queue, priority flush, idempotency
  └── sw-resilience.js ───────── Cache-First / SWR / Background Sync

Go Bridge
  └── /api/probe/ping|measure ── RTT echo + tier classification for client

Python (merchant-ussd-fallback)
  └── USSD state machine ──────── *347# menu → balance / transfer / freeze
        └── Termii SMS gateway ── SMS OTP + confirmation for offline ops

Fallback Chain (worst case: load-shedding / no data)
  1. SSE stream drops → polling fallback at adaptive interval
  2. Polling fails → mutations queued in IndexedDB (offlineQueueV2)
  3. Data completely unavailable → USSD *347# on any feature phone
  4. Power restored → Background Sync flushes queue in priority order
```

---

## Test Summary

| Runtime | Test File | Tests | Result |
|---|---|---|---|
| TypeScript (vitest) | `server/resilience.test.ts` | 25 | ✅ Pass |
| TypeScript (vitest) | All 92 existing files | 3,403 | ✅ Pass |
| **TypeScript total** | **93 files** | **3,428** | **✅ 100%** |
| Python | `test_main.py` (threat-intel) | 17 | ✅ Pass |
| Python | `test_merchant_ussd.py` | 33 | ✅ Pass |
| **Python total** | **2 files** | **50** | **✅ 100%** |
| Go | `internal/handlers`, `nibss`, `relay`, `solana`, `temporal`, `reconciler` | All | ✅ Pass |
| Rust | `crypto-guard` (Wave 107) | All | ✅ Pass |
