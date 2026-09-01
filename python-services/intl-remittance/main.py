"""PayGate International Remittance Service v2.0 — Full cross-border transfer engine"""
import logging, os, uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("intl-remittance")
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
PORT = int(os.getenv("PORT", "9030"))
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate International Remittance Service", version="2.0.0")
setup_telemetry("intl-remittance", app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB pool failed: {e}")
    return _pool

RATES = {
    "NGN/USD": 0.00065, "USD/NGN": 1540.0, "NGN/GBP": 0.00052, "GBP/NGN": 1920.0,
    "NGN/EUR": 0.00060, "EUR/NGN": 1665.0, "NGN/GHS": 0.0095, "GHS/NGN": 105.0,
    "NGN/KES": 0.084, "KES/NGN": 11.9, "NGN/ZAR": 0.012, "ZAR/NGN": 83.0,
}

CORRIDORS = [
    {"id": "NGN-USD", "from": "NGN", "to": "USD", "delivery_time": "1-2 business days", "fee_pct": 1.5, "min_amount": 5000, "max_amount": 5000000, "enabled": True},
    {"id": "NGN-GBP", "from": "NGN", "to": "GBP", "delivery_time": "1-2 business days", "fee_pct": 1.8, "min_amount": 5000, "max_amount": 3000000, "enabled": True},
    {"id": "NGN-EUR", "from": "NGN", "to": "EUR", "delivery_time": "1-2 business days", "fee_pct": 1.8, "min_amount": 5000, "max_amount": 3000000, "enabled": True},
    {"id": "NGN-GHS", "from": "NGN", "to": "GHS", "delivery_time": "Same day", "fee_pct": 1.0, "min_amount": 1000, "max_amount": 1000000, "enabled": True},
    {"id": "NGN-KES", "from": "NGN", "to": "KES", "delivery_time": "Same day", "fee_pct": 1.0, "min_amount": 1000, "max_amount": 1000000, "enabled": True},
    {"id": "NGN-ZAR", "from": "NGN", "to": "ZAR", "delivery_time": "1 business day", "fee_pct": 1.2, "min_amount": 2000, "max_amount": 2000000, "enabled": True},
]


class RemittanceRequest(BaseModel):
    merchant_id: str
    sender_id: str
    recipient_name: str
    recipient_account: str
    recipient_bank_code: str
    recipient_country: str
    amount: float = Field(gt=0)
    from_currency: str = "NGN"
    to_currency: str = "USD"
    corridor: str
    purpose: str = "family_support"
    sender_note: Optional[str] = None


@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status": "ok" if pool else "degraded", "service": "intl-remittance", "version": "2.0.0", "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt, vol = 0, 0.0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n, COALESCE(SUM(amount),0) as vol FROM remittances")
                cnt, vol = (r["n"], float(r["vol"])) if r else (0, 0.0)
        except Exception:
            pass
    return {"service": "intl-remittance", "total_transfers": cnt, "total_volume": vol, "active_corridors": len(CORRIDORS), "ts": datetime.now(timezone.utc).isoformat()}


@app.get("/intl-remittance/corridors")
async def list_corridors():
    return {"corridors": [c for c in CORRIDORS if c["enabled"]], "count": len(CORRIDORS)}


@app.get("/intl-remittance/quote")
async def get_quote(
    from_currency: str = Query(...),
    to_currency: str = Query(...),
    amount: float = Query(..., gt=0),
    corridor: str = Query(...)
):
    corr = next((c for c in CORRIDORS if c["id"] == corridor), None)
    if not corr:
        raise HTTPException(404, f"Corridor {corridor} not found")
    if amount < corr["min_amount"]:
        raise HTTPException(400, f"Amount below corridor minimum: {corr['min_amount']}")
    if amount > corr["max_amount"]:
        raise HTTPException(400, f"Amount exceeds corridor maximum: {corr['max_amount']}")
    rate = RATES.get(f"{from_currency}/{to_currency}", 1.0)
    fee = amount * corr["fee_pct"] / 100
    net = (amount - fee) * rate
    expires = datetime.now(timezone.utc) + timedelta(minutes=15)
    return {
        "quote_id": str(uuid.uuid4()),
        "from_currency": from_currency, "to_currency": to_currency,
        "send_amount": amount, "fee": round(fee, 2),
        "exchange_rate": rate, "receive_amount": round(net, 4),
        "delivery_time": corr["delivery_time"], "corridor": corridor,
        "expires_at": expires.isoformat(), "rate_valid_minutes": 15,
    }


@app.post("/intl-remittance/transfer")
async def create_transfer(req: RemittanceRequest):
    corr = next((c for c in CORRIDORS if c["id"] == req.corridor), None)
    if not corr:
        raise HTTPException(404, "Corridor not found")
    rate = RATES.get(f"{req.from_currency}/{req.to_currency}", 1.0)
    fee = req.amount * corr["fee_pct"] / 100
    net = (req.amount - fee) * rate
    rid = str(uuid.uuid4())
    tracking = f"PGR{rid[:8].upper()}"
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute(
                    """INSERT INTO remittances
                       (id, merchant_id, sender_id, recipient_name, recipient_account,
                        recipient_bank_code, recipient_country, amount, fee, exchange_rate,
                        net_amount, from_currency, to_currency, corridor, purpose,
                        status, tracking_code, created_at, updated_at)
                       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,'processing',$16,$17,$17)
                       ON CONFLICT DO NOTHING""",
                    rid, req.merchant_id, req.sender_id, req.recipient_name,
                    req.recipient_account, req.recipient_bank_code, req.recipient_country,
                    req.amount, fee, rate, net, req.from_currency, req.to_currency,
                    req.corridor, req.purpose, tracking, now
                )
        except Exception as e:
            logger.warning(f"DB: {e}")
    return {
        "remittance_id": rid, "tracking_code": tracking, "status": "processing",
        "send_amount": req.amount, "fee": round(fee, 2), "exchange_rate": rate,
        "receive_amount": round(net, 4), "delivery_time": corr["delivery_time"],
        "created_at": now.isoformat(),
    }


@app.get("/intl-remittance/track")
async def track(tracking_code: str = Query(...)):
    pool = await get_pool()
    transfer = None
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM remittances WHERE tracking_code=$1", tracking_code)
                if r:
                    transfer = dict(r)
        except Exception:
            pass
    if not transfer:
        raise HTTPException(404, "Transfer not found")
    return {"tracking_code": tracking_code, "status": transfer.get("status", "processing"), "transfer": transfer}


@app.get("/intl-remittance/history")
async def history(merchant_id: str = Query(...), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as c:
                offset = (page - 1) * page_size
                rows = [dict(r) for r in await c.fetch("SELECT * FROM remittances WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", merchant_id, page_size, offset)]
                cr = await c.fetchrow("SELECT COUNT(*) as n FROM remittances WHERE merchant_id=$1", merchant_id)
                total = cr["n"] if cr else 0
        except Exception as e:
            logger.warning(f"DB: {e}")
    return {"transfers": rows, "total": total, "page": page, "page_size": page_size}


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
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, workers=4, log_level="warning")
