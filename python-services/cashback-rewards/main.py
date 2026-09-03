"""PayGate Cashback Rewards Service v2.0 — Full implementation"""
import logging, os, uuid, math
from datetime import datetime, timezone, timedelta
from typing import Optional, List
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cashback-rewards")
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
PORT = int(os.getenv("PORT", "9028"))

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate Cashback Rewards Service", version="2.0.0")
setup_telemetry("cashback-rewards", app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB pool failed: {e}")
    return _pool

# Business rules
DEFAULT_CASHBACK_RATE = float(os.getenv("DEFAULT_CASHBACK_RATE", "0.015"))  # 1.5%
MAX_CASHBACK_PER_TXN = float(os.getenv("MAX_CASHBACK_PER_TXN", "5000"))     # NGN 5000
MIN_TXN_FOR_CASHBACK = float(os.getenv("MIN_TXN_FOR_CASHBACK", "500"))      # NGN 500
CASHBACK_EXPIRY_DAYS = int(os.getenv("CASHBACK_EXPIRY_DAYS", "365"))

class EarnCashbackRequest(BaseModel):
    customer_id: str
    merchant_id: str
    transaction_id: str
    transaction_amount: float = Field(gt=0)
    currency: str = "NGN"
    category: Optional[str] = None

class RedeemCashbackRequest(BaseModel):
    customer_id: str
    merchant_id: str
    amount: float = Field(gt=0)
    redemption_channel: str = "wallet"

class MerchantConfigRequest(BaseModel):
    merchant_id: str
    cashback_rate: float = Field(ge=0, le=0.5)
    min_transaction_amount: float = Field(ge=0)
    max_cashback_per_txn: Optional[float] = None
    enabled: bool = True
    categories: Optional[List[str]] = None

def calculate_cashback(amount: float, rate: float, max_cashback: float, min_txn: float) -> float:
    if amount < min_txn: return 0.0
    earned = amount * rate
    return min(earned, max_cashback)

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status": "ok" if pool else "degraded", "service": "cashback-rewards", "version": "2.0.0", "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    total_earned = 0.0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COALESCE(SUM(amount),0) as total FROM cashback_transactions WHERE type='earn'")
                total_earned = float(r["total"]) if r else 0.0
        except Exception: pass
    return {"service": "cashback-rewards", "total_earned_ngn": total_earned, "default_rate": DEFAULT_CASHBACK_RATE, "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/cashback/balance")
async def get_balance(customer_id: str = Query(...)):
    pool = await get_pool()
    balance, pending = 0.0, 0.0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COALESCE(SUM(CASE WHEN type='earn' THEN amount ELSE -amount END),0) as bal FROM cashback_transactions WHERE customer_id=$1 AND status='confirmed'", customer_id)
                balance = float(r["bal"]) if r else 0.0
                pr = await c.fetchrow("SELECT COALESCE(SUM(amount),0) as p FROM cashback_transactions WHERE customer_id=$1 AND type='earn' AND status='pending'", customer_id)
                pending = float(pr["p"]) if pr else 0.0
        except Exception as e: logger.warning(f"DB: {e}")
    return {"customer_id": customer_id, "balance": max(0, balance), "pending_balance": pending, "currency": "NGN", "ts": datetime.now(timezone.utc).isoformat()}

@app.post("/cashback/earn")
async def earn_cashback(req: EarnCashbackRequest):
    pool = await get_pool()
    # Get merchant config
    rate, max_cb, min_txn = DEFAULT_CASHBACK_RATE, MAX_CASHBACK_PER_TXN, MIN_TXN_FOR_CASHBACK
    if pool:
        try:
            async with pool.acquire() as c:
                mc = await c.fetchrow("SELECT cashback_rate, max_cashback_per_txn, min_transaction_amount FROM cashback_merchant_configs WHERE merchant_id=$1 AND enabled=true", req.merchant_id)
                if mc:
                    rate = float(mc["cashback_rate"])
                    max_cb = float(mc["max_cashback_per_txn"] or MAX_CASHBACK_PER_TXN)
                    min_txn = float(mc["min_transaction_amount"] or MIN_TXN_FOR_CASHBACK)
        except Exception: pass
    earned = calculate_cashback(req.transaction_amount, rate, max_cb, min_txn)
    if earned <= 0:
        return {"customer_id": req.customer_id, "earned": 0, "reason": "transaction_below_minimum", "currency": req.currency}
    txn_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    expires_at = now + timedelta(days=CASHBACK_EXPIRY_DAYS)
    if pool is None:
        raise HTTPException(status_code=503, detail="Cashback store unavailable — cashback was NOT credited")
    try:
        async with pool.acquire() as c:
            await c.execute("INSERT INTO cashback_transactions (id, customer_id, merchant_id, transaction_id, type, amount, currency, status, rate_applied, expires_at, created_at) VALUES ($1,$2,$3,$4,'earn',$5,$6,'confirmed',$7,$8,$9) ON CONFLICT DO NOTHING", txn_id, req.customer_id, req.merchant_id, req.transaction_id, earned, req.currency, rate, expires_at, now)
    except Exception as e:
        logger.error(f"DB insert failed: {e}")
        raise HTTPException(status_code=503, detail="Cashback persist failed — nothing was credited") from e
    return {"cashback_id": txn_id, "customer_id": req.customer_id, "earned": earned, "rate_applied": rate, "currency": req.currency, "expires_at": expires_at.isoformat(), "transaction_id": req.transaction_id}

@app.post("/cashback/redeem")
async def redeem_cashback(req: RedeemCashbackRequest):
    pool = await get_pool()
    # Check balance
    balance = 0.0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COALESCE(SUM(CASE WHEN type='earn' THEN amount ELSE -amount END),0) as bal FROM cashback_transactions WHERE customer_id=$1 AND status='confirmed'", req.customer_id)
                balance = float(r["bal"]) if r else 0.0
        except Exception: pass
    if req.amount > balance:
        raise HTTPException(400, f"Insufficient cashback balance. Available: {balance:.2f}")
    txn_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO cashback_transactions (id, customer_id, merchant_id, transaction_id, type, amount, currency, status, created_at) VALUES ($1,$2,$3,$4,'redeem',$5,'NGN','confirmed',$6) ON CONFLICT DO NOTHING", txn_id, req.customer_id, req.merchant_id, txn_id, req.amount, now)
        except Exception as e: logger.warning(f"DB insert: {e}")
    return {"redemption_id": txn_id, "customer_id": req.customer_id, "redeemed": req.amount, "new_balance": max(0, balance - req.amount), "channel": req.redemption_channel, "redeemed_at": now.isoformat()}

@app.get("/cashback/history")
async def cashback_history(customer_id: str = Query(...), page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as c:
                offset = (page-1)*page_size
                rows = [dict(r) for r in await c.fetch("SELECT * FROM cashback_transactions WHERE customer_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3", customer_id, page_size, offset)]
                cr = await c.fetchrow("SELECT COUNT(*) as n FROM cashback_transactions WHERE customer_id=$1", customer_id)
                total = cr["n"] if cr else 0
        except Exception as e: logger.warning(f"DB: {e}")
    return {"customer_id": customer_id, "history": rows, "total": total, "page": page}

@app.get("/cashback/merchant-config")
async def get_merchant_config(merchant_id: str = Query(...)):
    pool = await get_pool()
    config = {"merchant_id": merchant_id, "cashback_rate": DEFAULT_CASHBACK_RATE, "min_transaction_amount": MIN_TXN_FOR_CASHBACK, "max_cashback_per_txn": MAX_CASHBACK_PER_TXN, "enabled": True}
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM cashback_merchant_configs WHERE merchant_id=$1", merchant_id)
                if r: config = dict(r)
        except Exception: pass
    return config

@app.post("/cashback/merchant-config/update")
async def update_merchant_config(req: MerchantConfigRequest):
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    if pool is None:
        raise HTTPException(status_code=503, detail="Cashback store unavailable — config was NOT updated")
    try:
        async with pool.acquire() as c:
            await c.execute("INSERT INTO cashback_merchant_configs (id, merchant_id, cashback_rate, min_transaction_amount, max_cashback_per_txn, enabled, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$7) ON CONFLICT (merchant_id) DO UPDATE SET cashback_rate=$3, min_transaction_amount=$4, max_cashback_per_txn=$5, enabled=$6, updated_at=$7", str(uuid.uuid4()), req.merchant_id, req.cashback_rate, req.min_transaction_amount, req.max_cashback_per_txn or MAX_CASHBACK_PER_TXN, req.enabled, now)
    except Exception as e:
        logger.error(f"DB upsert failed: {e}")
        raise HTTPException(status_code=503, detail="Merchant config persist failed — nothing was updated") from e
    return {"success": True, "merchant_id": req.merchant_id, "cashback_rate": req.cashback_rate, "updated_at": now.isoformat()}

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
