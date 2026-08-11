"""
PayGate Push Notification Service
====================================
FastAPI microservice that dispatches FCM (Firebase Cloud Messaging) and
APNs (Apple Push Notification service) push notifications for both the
merchant portal and consumer portal.

Endpoints:
  POST /notify/merchant       — Notify all active devices of a merchant
  POST /notify/consumer       — Notify all active devices of a consumer user
  POST /notify/tokens         — Notify an explicit list of FCM/APNs tokens
  POST /notify/topic          — Broadcast to a Firebase topic
  POST /tokens/register       — Register a device token
  POST /tokens/deregister     — Deregister a device token
  GET  /health                — Health check
  GET  /metrics               — Prometheus metrics

Environment variables:
  PORT                  — HTTP port (default: 8096)
  FIREBASE_PROJECT_ID   — Firebase project ID (required for FCM)
  FIREBASE_CREDENTIALS  — Path to Firebase service account JSON (optional)
  FIREBASE_CREDENTIALS_JSON — Firebase service account JSON string (optional)
  APNS_KEY_ID           — APNs key ID
  APNS_TEAM_ID          — APNs team ID
  APNS_PRIVATE_KEY      — APNs private key (PEM string)
  APNS_BUNDLE_ID        — iOS app bundle ID
  DATABASE_URL          — PostgreSQL connection string (for token lookup)
  API_KEY               — Bearer token for authenticating callers
  LOG_LEVEL             — Logging level (default: INFO)
"""
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("push-service")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

# ─── Prometheus metrics ────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
    PUSH_REQUESTS = Counter("paygate_push_requests_total", "Total push requests", ["channel", "result"])
    PUSH_LATENCY = Histogram("paygate_push_duration_seconds", "Push request duration")
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False
    logger.warning("prometheus_client not installed — metrics disabled")

# ─── Config ───────────────────────────────────────────────────────────────────
API_KEY = os.getenv("API_KEY", "")
FIREBASE_PROJECT_ID = os.getenv("FIREBASE_PROJECT_ID", "")
APNS_KEY_ID = os.getenv("APNS_KEY_ID", "")
APNS_TEAM_ID = os.getenv("APNS_TEAM_ID", "")
APNS_BUNDLE_ID = os.getenv("APNS_BUNDLE_ID", "com.paygate.consumer")
DATABASE_URL = os.getenv("DATABASE_URL", "")

# ─── FCM client (firebase-admin SDK) ─────────────────────────────────────────
_fcm_app = None

def get_fcm_app():
    global _fcm_app
    if _fcm_app is not None:
        return _fcm_app
    try:
        import firebase_admin
        from firebase_admin import credentials
        cred_json = os.getenv("FIREBASE_CREDENTIALS_JSON", "")
        cred_path = os.getenv("FIREBASE_CREDENTIALS", "")
        if cred_json:
            cred_dict = json.loads(cred_json)
            cred = credentials.Certificate(cred_dict)
        elif cred_path and os.path.exists(cred_path):
            cred = credentials.Certificate(cred_path)
        else:
            cred = credentials.ApplicationDefault()
        _fcm_app = firebase_admin.initialize_app(cred)
        logger.info("Firebase Admin SDK initialized")
    except Exception as e:
        logger.warning(f"Firebase Admin SDK not available: {e} — FCM disabled")
        _fcm_app = None
    return _fcm_app

# ─── Database connection ──────────────────────────────────────────────────────
_db_conn = None

async def get_db():
    global _db_conn
    if _db_conn is not None:
        return _db_conn
    if not DATABASE_URL:
        return None
    try:
        import asyncpg
        _db_conn = await asyncpg.connect(DATABASE_URL)
        logger.info("Database connected")
    except Exception as e:
        logger.warning(f"Database not available: {e}")
        _db_conn = None
    return _db_conn

# ─── Models ───────────────────────────────────────────────────────────────────
class PushNotification(BaseModel):
    title: str
    body: str
    image_url: Optional[str] = None

class NotifyMerchantRequest(BaseModel):
    merchant_id: str
    notification: PushNotification
    notification_type: str = "generic"
    data: dict = Field(default_factory=dict)
    user_id: Optional[int] = None

class NotifyConsumerRequest(BaseModel):
    user_id: int
    notification: PushNotification
    notification_type: str = "generic"
    data: dict = Field(default_factory=dict)

class NotifyTokensRequest(BaseModel):
    tokens: list[str] = Field(..., min_length=1, max_length=500)
    notification: PushNotification
    notification_type: str = "generic"
    data: dict = Field(default_factory=dict)

class NotifyTopicRequest(BaseModel):
    topic: str = Field(..., pattern=r'^[a-zA-Z0-9_\-\.]+$')
    notification: PushNotification
    notification_type: str = "generic"
    data: dict = Field(default_factory=dict)

class RegisterTokenRequest(BaseModel):
    token: str
    platform: str = Field(..., pattern=r'^(fcm|apns)$')
    device_id: str
    merchant_id: Optional[str] = None
    user_id: Optional[int] = None

class DeregisterTokenRequest(BaseModel):
    token: str

class DispatchResult(BaseModel):
    success_count: int
    failure_count: int
    total_tokens: int
    invalid_tokens: list[str] = Field(default_factory=list)
    # True when NO real delivery happened (FCM unconfigured). Callers and
    # metrics must treat simulated=True as delivery failure — never success.
    simulated: bool = False
    detail: Optional[str] = None

# ─── FCM dispatch ─────────────────────────────────────────────────────────────
def send_fcm_multicast(tokens: list[str], notification: PushNotification, data: dict) -> DispatchResult:
    """Send FCM multicast message to a list of tokens."""
    if not tokens:
        return DispatchResult(success_count=0, failure_count=0, total_tokens=0)
    app = get_fcm_app()
    if app is None:
        # FAIL LOUD: report total failure — never fabricate delivery of
        # debit/fraud/OTP alerts that were never sent.
        logger.error(
            f"[FCM] UNCONFIGURED — push to {len(tokens)} tokens NOT delivered: {notification.title}"
        )
        return DispatchResult(
            success_count=0,
            failure_count=len(tokens),
            total_tokens=len(tokens),
            simulated=True,
            detail="FCM is not configured (no Firebase credentials); notification was NOT delivered",
        )
    try:
        from firebase_admin import messaging
        # Convert data values to strings (FCM requirement)
        str_data = {k: str(v) for k, v in data.items()}
        # Batch into groups of 500 (FCM limit)
        success_count = 0
        failure_count = 0
        invalid_tokens = []
        for i in range(0, len(tokens), 500):
            batch = tokens[i:i+500]
            message = messaging.MulticastMessage(
                tokens=batch,
                notification=messaging.Notification(
                    title=notification.title,
                    body=notification.body,
                    image=notification.image_url,
                ),
                data=str_data,
                android=messaging.AndroidConfig(
                    priority="high",
                    notification=messaging.AndroidNotification(
                        sound="default",
                        channel_id="paygate_notifications",
                    ),
                ),
                apns=messaging.APNSConfig(
                    payload=messaging.APNSPayload(
                        aps=messaging.Aps(sound="default", badge=1),
                    ),
                ),
            )
            response = messaging.send_each_for_multicast(message)
            success_count += response.success_count
            failure_count += response.failure_count
            for idx, resp in enumerate(response.responses):
                if not resp.success and resp.exception:
                    err_code = getattr(resp.exception, 'code', '')
                    if err_code in ('registration-token-not-registered', 'invalid-argument'):
                        invalid_tokens.append(batch[idx])
        return DispatchResult(
            success_count=success_count,
            failure_count=failure_count,
            total_tokens=len(tokens),
            invalid_tokens=invalid_tokens,
        )
    except Exception as e:
        logger.error(f"[FCM] Multicast error: {e}")
        return DispatchResult(success_count=0, failure_count=len(tokens), total_tokens=len(tokens))

def send_fcm_topic(topic: str, notification: PushNotification, data: dict) -> DispatchResult:
    """Send FCM topic message."""
    app = get_fcm_app()
    if app is None:
        logger.error(f"[FCM] UNCONFIGURED — topic push to {topic} NOT delivered: {notification.title}")
        return DispatchResult(
            success_count=0,
            failure_count=1,
            total_tokens=1,
            simulated=True,
            detail="FCM is not configured (no Firebase credentials); topic message was NOT delivered",
        )
    try:
        from firebase_admin import messaging
        str_data = {k: str(v) for k, v in data.items()}
        message = messaging.Message(
            topic=topic,
            notification=messaging.Notification(title=notification.title, body=notification.body),
            data=str_data,
        )
        messaging.send(message)
        return DispatchResult(success_count=1, failure_count=0, total_tokens=1)
    except Exception as e:
        logger.error(f"[FCM] Topic push error: {e}")
        return DispatchResult(success_count=0, failure_count=1, total_tokens=1)

# ─── Token lookup helpers ─────────────────────────────────────────────────────
async def get_merchant_tokens(merchant_id: str, user_id: Optional[int] = None) -> list[str]:
    """Look up active FCM tokens for a merchant."""
    db = await get_db()
    if db is None:
        return []
    try:
        if user_id:
            rows = await db.fetch(
                "SELECT token FROM device_push_tokens WHERE merchant_id = $1 AND user_id = $2 AND is_active = true",
                merchant_id, user_id
            )
        else:
            rows = await db.fetch(
                "SELECT token FROM device_push_tokens WHERE merchant_id = $1 AND is_active = true",
                merchant_id
            )
        return [row['token'] for row in rows]
    except Exception as e:
        logger.error(f"[DB] get_merchant_tokens error: {e}")
        return []

async def get_consumer_tokens(user_id: int) -> list[str]:
    """Look up active FCM tokens for a consumer user."""
    db = await get_db()
    if db is None:
        return []
    try:
        rows = await db.fetch(
            "SELECT token FROM device_push_tokens WHERE user_id = $1 AND is_active = true",
            user_id
        )
        return [row['token'] for row in rows]
    except Exception as e:
        logger.error(f"[DB] get_consumer_tokens error: {e}")
        return []

# ─── Auth middleware ──────────────────────────────────────────────────────────
def verify_api_key(request: Request):
    if not API_KEY:
        return  # No key configured — allow all (dev mode)
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or auth[7:] != API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized")

# ─── App lifecycle ─────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Push service starting up")
    if get_fcm_app() is None:
        # Loud startup alert: every notification will report simulated=True /
        # failure_count=total until Firebase credentials are configured.
        logger.error(
            "FCM IS UNCONFIGURED (no FIREBASE_CREDENTIALS_JSON / FIREBASE_CREDENTIALS / ADC). "
            "Push notifications will NOT be delivered; dispatches report failure_count=total."
        )
    yield
    logger.info("Push service shutting down")

app = FastAPI(
    title="PayGate Push Notification Service",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "push-service",
        "fcm_enabled": get_fcm_app() is not None,
        "db_connected": (await get_db()) is not None,
    }

@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    if not METRICS_ENABLED:
        return PlainTextResponse("# metrics disabled\n", media_type="text/plain")
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/notify/merchant", response_model=DispatchResult)
async def notify_merchant(req: NotifyMerchantRequest, request: Request):
    verify_api_key(request)
    start = time.time()
    tokens = await get_merchant_tokens(req.merchant_id, req.user_id)
    if not tokens:
        logger.info(f"[push] No active tokens for merchant {req.merchant_id}")
        return DispatchResult(success_count=0, failure_count=0, total_tokens=0)
    data = {**req.data, "notification_type": req.notification_type, "merchant_id": req.merchant_id}
    result = send_fcm_multicast(tokens, req.notification, data)
    if METRICS_ENABLED:
        PUSH_REQUESTS.labels(channel="merchant", result=("success" if result.failure_count == 0 and not result.simulated else ("failed" if result.success_count == 0 else "partial"))).inc()
        PUSH_LATENCY.observe(time.time() - start)
    logger.info(f"[push] merchant={req.merchant_id} sent={result.success_count} failed={result.failure_count}")
    return result

@app.post("/notify/consumer", response_model=DispatchResult)
async def notify_consumer(req: NotifyConsumerRequest, request: Request):
    """Send push notification to all active devices of a consumer user."""
    verify_api_key(request)
    start = time.time()
    tokens = await get_consumer_tokens(req.user_id)
    if not tokens:
        logger.info(f"[push] No active tokens for consumer user {req.user_id}")
        return DispatchResult(success_count=0, failure_count=0, total_tokens=0)
    data = {**req.data, "notification_type": req.notification_type, "user_id": str(req.user_id)}
    result = send_fcm_multicast(tokens, req.notification, data)
    if METRICS_ENABLED:
        PUSH_REQUESTS.labels(channel="consumer", result=("success" if result.failure_count == 0 and not result.simulated else ("failed" if result.success_count == 0 else "partial"))).inc()
        PUSH_LATENCY.observe(time.time() - start)
    logger.info(f"[push] consumer user_id={req.user_id} sent={result.success_count} failed={result.failure_count}")
    return result

@app.post("/notify/tokens", response_model=DispatchResult)
async def notify_tokens(req: NotifyTokensRequest, request: Request):
    verify_api_key(request)
    start = time.time()
    data = {**req.data, "notification_type": req.notification_type}
    result = send_fcm_multicast(req.tokens, req.notification, data)
    if METRICS_ENABLED:
        PUSH_REQUESTS.labels(channel="tokens", result=("success" if result.failure_count == 0 and not result.simulated else ("failed" if result.success_count == 0 else "partial"))).inc()
        PUSH_LATENCY.observe(time.time() - start)
    return result

@app.post("/notify/topic", response_model=DispatchResult)
async def notify_topic(req: NotifyTopicRequest, request: Request):
    verify_api_key(request)
    start = time.time()
    data = {**req.data, "notification_type": req.notification_type}
    result = send_fcm_topic(req.topic, req.notification, data)
    if METRICS_ENABLED:
        PUSH_REQUESTS.labels(channel="topic", result=("success" if result.failure_count == 0 and not result.simulated else ("failed" if result.success_count == 0 else "partial"))).inc()
        PUSH_LATENCY.observe(time.time() - start)
    return result

@app.post("/tokens/register")
async def register_token(req: RegisterTokenRequest, request: Request):
    verify_api_key(request)
    db = await get_db()
    if db is None:
        # FAIL LOUD: a token that is not persisted can never receive pushes —
        # pretending it registered breaks every future notification to this device.
        logger.error(f"[push] Token registration FAILED (DB unavailable): device={req.device_id}")
        raise HTTPException(
            status_code=503,
            detail="Token store unavailable — device token was NOT registered",
        )
    try:
        await db.execute(
            """
            INSERT INTO device_push_tokens (token, platform, device_id, merchant_id, user_id, is_active, created_at, updated_at)
            VALUES ($1, $2, $3, $4, $5, true, NOW(), NOW())
            ON CONFLICT (token) DO UPDATE SET
                platform = EXCLUDED.platform,
                device_id = EXCLUDED.device_id,
                merchant_id = EXCLUDED.merchant_id,
                user_id = EXCLUDED.user_id,
                is_active = true,
                updated_at = NOW()
            """,
            req.token, req.platform, req.device_id, req.merchant_id, req.user_id
        )
        logger.info(f"[push] Token registered: device={req.device_id} platform={req.platform}")
        return {"registered": True}
    except Exception as e:
        logger.error(f"[push] Token registration error: {e}")
        raise HTTPException(status_code=500, detail="Token registration failed")

@app.post("/tokens/deregister")
async def deregister_token(req: DeregisterTokenRequest, request: Request):
    verify_api_key(request)
    db = await get_db()
    if db is None:
        logger.error("[push] Token deregistration FAILED (DB unavailable)")
        raise HTTPException(
            status_code=503,
            detail="Token store unavailable — device token was NOT deregistered",
        )
    try:
        await db.execute(
            "UPDATE device_push_tokens SET is_active = false, updated_at = NOW() WHERE token = $1",
            req.token
        )
        return {"deregistered": True}
    except Exception as e:
        logger.error(f"[push] Token deregistration error: {e}")
        raise HTTPException(status_code=500, detail="Token deregistration failed")

# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod
from fastapi import Request as _AuthRequest
from fastapi.responses import JSONResponse as _AuthJSONResponse

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.middleware("http")
async def _require_internal_api_key(request: _AuthRequest, call_next):
    if request.url.path in _AUTH_EXEMPT_PATHS:
        return await call_next(request)
    if not _INTERNAL_AUTH_KEY:
        return _AuthJSONResponse(
            status_code=503,
            content={"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
        )
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return _AuthJSONResponse(status_code=401, content={"detail": "Unauthorized"})
    return await call_next(request)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8096"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=2)
