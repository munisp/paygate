# PayGate Merchant USSD Fallback Service — Deployment Runbook

**Version:** Wave 114  
**Service:** `merchant-ussd-fallback`  
**Runtime:** Python 3.11 + FastAPI + Uvicorn  
**Port:** `8099` (default)

---

## Overview

The USSD Fallback Service provides a USSD/SMS interface for merchants to access critical payment operations (balance checks, payout approvals, payment link creation, account freeze) when the primary web portal is unavailable. It supports five languages (EN/HA/YO/IG/FR) with Redis-backed language preference persistence and a 90-day TTL.

---

## Prerequisites

| Requirement | Version |
|---|---|
| Python | 3.11+ |
| pip packages | `fastapi`, `uvicorn`, `httpx`, `redis[asyncio]`, `python-multipart` |
| Redis | 6.0+ (optional — falls back to in-process dict) |
| Network access | Portal API (`MERCHANT_PORTAL_URL`) |

Install dependencies:

```bash
pip install fastapi uvicorn httpx "redis[asyncio]" python-multipart
```

---

## Environment Variables

All variables are optional unless marked **required**.

### Core Authentication

| Variable | Required | Default | Description |
|---|---|---|---|
| `INTERNAL_API_KEY` | **Yes** | — | Shared secret for `/api/*` admin endpoints. Set on both the service and any callers. |

### USSD Gateway

| Variable | Required | Default | Description |
|---|---|---|---|
| `USSD_GATEWAY_URL` | **Yes** (for `resetLangPref`) | — | Base URL of the USSD gateway operator (e.g., Africa's Talking). Used by the portal's `ussd.resetLangPref` tRPC mutation to confirm the reset with the upstream gateway. |
| `AT_API_KEY` | No | `""` | Africa's Talking API key for outbound USSD sessions. |

### SMS / Alerts

| Variable | Required | Default | Description |
|---|---|---|---|
| `TERMII_API_KEY` | No | `""` | Termii API key for OTP and alert SMS delivery. Leave empty to disable SMS. |

### Bridge / Portal Integration

| Variable | Required | Default | Description |
|---|---|---|---|
| `BRIDGE_URL` | No | `""` | Base URL of the middleware bridge for balance, payout, and payment-link operations. Leave empty to return graceful "service unavailable" responses. |
| `MERCHANT_PORTAL_URL` | No | `""` | Base URL of the PayGate Merchant Portal (e.g., `https://portal.paygate.ng`). Required for dynamic config polling (Wave 113+). |
| `MERCHANT_ID` | No | `""` | Merchant ID used when polling `/api/merchant-config/:merchantId`. |

### Redis (Language Preference Persistence)

| Variable | Required | Default | Description |
|---|---|---|---|
| `REDIS_URL` | No | `""` | Redis connection URL (e.g., `redis://localhost:6379/0`). When unset, language preferences are stored in an in-process dictionary (lost on restart). |

### Feature Flags

| Variable | Required | Default | Description |
|---|---|---|---|
| `LANG_PICKER_ENABLED` | No | `true` | Show the step-0 language selection menu to end users. Can be overridden dynamically by polling `MERCHANT_PORTAL_URL` (see Wave 113). Set to `false` to default all sessions to English. |
| `CONFIG_REFRESH_INTERVAL_SECS` | No | `300` | How often (in seconds) the service re-polls `MERCHANT_PORTAL_URL` for updated merchant config. Added in Wave 114. Minimum recommended value: `60`. |

### Logging

| Variable | Required | Default | Description |
|---|---|---|---|
| `LOG_LEVEL` | No | `INFO` | Python logging level (`DEBUG`, `INFO`, `WARNING`, `ERROR`). |

---

## Starting the Service

```bash
# Development
uvicorn main:app --host 0.0.0.0 --port 8099 --reload

# Production
uvicorn main:app --host 0.0.0.0 --port 8099 --workers 2
```

### Docker

```dockerfile
FROM python:3.11-slim
WORKDIR /app
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt
COPY . .
EXPOSE 8099
CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8099"]
```

```bash
docker build -t paygate-ussd-fallback .
docker run -p 8099:8099 \
  -e INTERNAL_API_KEY=<secret> \
  -e BRIDGE_URL=https://bridge.internal \
  -e MERCHANT_PORTAL_URL=https://portal.paygate.ng \
  -e MERCHANT_ID=42 \
  -e REDIS_URL=redis://redis:6379/0 \
  paygate-ussd-fallback
```

---

## Health Check

```bash
curl http://localhost:8099/health
# {"status":"ok","service":"merchant-ussd-fallback","active_sessions":0}
```

---

## USSD Callback Endpoint

**POST** `/v1/ussd/merchant/callback`

Form fields: `sessionId`, `phoneNumber`, `text`, `serviceCode`

Optional query param: `?lang=en|ha|yo|ig|fr` (operator pre-selection, skips language picker)

---

## Background Config Refresh (Wave 114)

On startup, the service fetches merchant config from `MERCHANT_PORTAL_URL/api/merchant-config/:merchantId` and launches a background asyncio task (`_config_refresh_loop`) that re-polls every `CONFIG_REFRESH_INTERVAL_SECS` seconds. This allows the portal operator to toggle `LANG_PICKER_ENABLED` without restarting the USSD service.

If the portal is unreachable, the service falls back to the `LANG_PICKER_ENABLED` env var and logs a warning. The background loop catches all exceptions and continues running.

---

## Language Preference Reset (Wave 113)

The portal's `ussd.resetLangPref` tRPC mutation calls `USSD_GATEWAY_URL` to clear a subscriber's stored language preference. The `USSD_GATEWAY_URL` environment variable **must** be set for this mutation to succeed; otherwise it returns `PRECONDITION_FAILED`.

---

## Running Tests

```bash
pip install pytest pytest-asyncio httpx python-multipart
python3 -m pytest -q
# Expected: 76 passed (Wave 114)
```

---

## Changelog

| Wave | Change |
|---|---|
| Wave 109 | Initial service — USSD state machine, OTP, SMS alerts, rate limiting |
| Wave 110 | i18n expansion: EN/HA/YO/IG/FR locale files, 38 new keys |
| Wave 111 | Step-0 language picker menu, `LANG_PICKER_ENABLED` env var |
| Wave 112 | Redis language preference persistence (90-day TTL, in-process fallback) |
| Wave 113 | Portal config polling on startup (`MERCHANT_PORTAL_URL`, `MERCHANT_ID`) |
| Wave 114 | Background config refresh loop (`_config_refresh_loop`, `CONFIG_REFRESH_INTERVAL_SECS`) |
