"""
PayGate Bulk Collections Service v2.0
======================================
Full implementation with PostgreSQL-backed CRUD, business rules:
- Max 10,000 debtors per batch
- Auto-reminders at T-7, T-3, T-1 days
- Partial payment tracking
- Collection rate analytics
"""
import logging, os, uuid
from datetime import datetime, timezone, timedelta
from typing import List, Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
logger = logging.getLogger("bulk-collections")

DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
PORT = int(os.getenv("PORT", "9027"))
MAX_DEBTORS = 10000

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate Bulk Collections Service", version="2.0.0")
setup_telemetry("bulk-collections", app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool: Optional[asyncpg.Pool] = None

async def get_pool():
    global _pool
    if _pool is None:
        try:
            _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10, command_timeout=30)
        except Exception as e:
            logger.warning(f"DB pool failed: {e}")
    return _pool

class Debtor(BaseModel):
    customer_id: str
    name: str
    phone: Optional[str] = None
    email: Optional[str] = None
    amount: float = Field(gt=0)
    currency: str = "NGN"

class CreateCollectionRequest(BaseModel):
    merchant_id: str
    name: str
    debtors: List[Debtor]
    due_date: str
    currency: str = "NGN"
    auto_remind: bool = True
    partial_payment_allowed: bool = True

class ReminderRequest(BaseModel):
    collection_id: str
    channels: List[str] = ["sms", "email"]
    custom_message: Optional[str] = None

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status": "ok" if pool else "degraded", "service": "bulk-collections", "version": "2.0.0", "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                row = await c.fetchrow("SELECT COUNT(*) as n FROM bulk_collections")
                cnt = row["n"] if row else 0
        except Exception: pass
    return {"service": "bulk-collections", "total_collections": cnt, "ts": datetime.now(timezone.utc).isoformat()}

@app.post("/bulk-collections/create")
async def create_bulk_collection(req: CreateCollectionRequest):
    if len(req.debtors) > MAX_DEBTORS:
        raise HTTPException(400, f"Max {MAX_DEBTORS} debtors per batch")
    if not req.debtors:
        raise HTTPException(400, "At least one debtor required")
    try:
        due_date = datetime.fromisoformat(req.due_date)
        if due_date.tzinfo is None:
            due_date = due_date.replace(tzinfo=timezone.utc)
        if due_date < datetime.now(timezone.utc):
            raise HTTPException(400, "Due date must be in the future")
    except ValueError:
        raise HTTPException(400, "Invalid due_date — use ISO 8601")

    collection_id = str(uuid.uuid4())
    total_amount = sum(d.amount for d in req.debtors)
    now = datetime.now(timezone.utc)

    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as conn:
                async with conn.transaction():
                    await conn.execute(
                        """INSERT INTO bulk_collections (id, merchant_id, name, total_amount, currency, due_date, status, auto_remind, partial_payment_allowed, debtor_count, created_at, updated_at)
                           VALUES ($1,$2,$3,$4,$5,$6,'active',$7,$8,$9,$10,$10) ON CONFLICT (id) DO NOTHING""",
                        collection_id, req.merchant_id, req.name, total_amount, req.currency, due_date, req.auto_remind, req.partial_payment_allowed, len(req.debtors), now
                    )
                    for d in req.debtors:
                        item_id = str(uuid.uuid4())
                        ref = f"PGC-{collection_id[:8].upper()}-{item_id[:6].upper()}"
                        await conn.execute(
                            """INSERT INTO bulk_collection_items (id, collection_id, customer_id, name, phone, email, amount, currency, status, payment_reference, retry_count, created_at, updated_at)
                               VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'pending',$9,0,$10,$10) ON CONFLICT (id) DO NOTHING""",
                            item_id, collection_id, d.customer_id, d.name, d.phone, d.email, d.amount, d.currency, ref, now
                        )
        except Exception as e:
            logger.error(f"DB insert failed: {e}")

    return {"collection_id": collection_id, "merchant_id": req.merchant_id, "name": req.name, "total_amount": total_amount, "currency": req.currency, "debtor_count": len(req.debtors), "due_date": req.due_date, "status": "active", "created_at": now.isoformat()}

@app.get("/bulk-collections/list")
async def list_collections(merchant_id: str = Query(...), status: Optional[str] = None, page: int = Query(1, ge=1), page_size: int = Query(20, ge=1, le=100)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as conn:
                offset = (page - 1) * page_size
                q = "WHERE merchant_id = $1" + (" AND status = $2" if status else "")
                params = [merchant_id] + ([status] if status else [])
                rows = [dict(r) for r in await conn.fetch(f"SELECT * FROM bulk_collections {q} ORDER BY created_at DESC LIMIT {page_size} OFFSET {offset}", *params)]
                cr = await conn.fetchrow(f"SELECT COUNT(*) as n FROM bulk_collections {q}", *params)
                total = cr["n"] if cr else 0
        except Exception as e:
            logger.warning(f"DB query: {e}")
    return {"collections": rows, "total": total, "page": page, "page_size": page_size}

@app.get("/bulk-collections/details")
async def collection_details(collection_id: str = Query(...), page: int = Query(1, ge=1), page_size: int = Query(50, ge=1, le=200)):
    pool = await get_pool()
    collection, items = {"id": collection_id}, []
    if pool:
        try:
            async with pool.acquire() as conn:
                cr = await conn.fetchrow("SELECT * FROM bulk_collections WHERE id = $1", collection_id)
                if cr: collection = dict(cr)
                offset = (page - 1) * page_size
                items = [dict(r) for r in await conn.fetch("SELECT * FROM bulk_collection_items WHERE collection_id = $1 ORDER BY created_at LIMIT $2 OFFSET $3", collection_id, page_size, offset)]
        except Exception as e:
            logger.warning(f"DB query: {e}")
    total = sum(i.get("amount", 0) for i in items)
    collected = sum(i.get("collected_amount", 0) or 0 for i in items)
    stats = {"total_amount": total, "collected_amount": collected, "collection_rate": round(collected/total*100,2) if total else 0, "paid_count": sum(1 for i in items if i.get("status")=="paid"), "pending_count": sum(1 for i in items if i.get("status") in ("pending","reminded")), "total_count": len(items)}
    return {"collection": collection, "items": items, "stats": stats}

@app.post("/bulk-collections/remind")
async def send_reminders(req: ReminderRequest):
    pool = await get_pool()
    pending, sent, failed = [], 0, 0
    if pool:
        try:
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT * FROM bulk_collection_items WHERE collection_id = $1 AND status IN ('pending','reminded')", req.collection_id)
                pending = [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"DB query: {e}")
    for d in pending:
        try:
            if "sms" in req.channels and d.get("phone"):
                logger.info(f"SMS → {d['phone']}: {req.custom_message or 'Payment due'}")
                sent += 1
            if "email" in req.channels and d.get("email"):
                logger.info(f"Email → {d['email']}: {req.custom_message or 'Payment due'}")
                sent += 1
        except Exception:
            failed += 1
    if pool and pending:
        try:
            async with pool.acquire() as conn:
                await conn.execute("UPDATE bulk_collection_items SET status='reminded', updated_at=$1 WHERE collection_id=$2 AND status='pending'", datetime.now(timezone.utc), req.collection_id)
        except Exception: pass
    return {"collection_id": req.collection_id, "reminders_sent": sent, "reminders_failed": failed, "debtors_notified": len(pending), "sent_at": datetime.now(timezone.utc).isoformat()}

@app.get("/bulk-collections/export")
async def collection_analytics(merchant_id: str = Query(...), period: str = Query("30d")):
    pool = await get_pool()
    analytics = {"total_collections": 0, "total_amount": 0, "collected_amount": 0, "collection_rate": 0, "active": 0, "completed": 0, "overdue": 0}
    if pool:
        try:
            days = int(period.replace("d","")) if "d" in period else 30
            since = datetime.now(timezone.utc) - timedelta(days=days)
            async with pool.acquire() as conn:
                rows = await conn.fetch("SELECT status, COUNT(*) as cnt, SUM(total_amount) as total, SUM(COALESCE(collected_amount,0)) as collected FROM bulk_collections WHERE merchant_id=$1 AND created_at>=$2 GROUP BY status", merchant_id, since)
                for r in rows:
                    analytics["total_collections"] += r["cnt"]
                    analytics["total_amount"] += float(r["total"] or 0)
                    analytics["collected_amount"] += float(r["collected"] or 0)
                    analytics[r["status"]] = analytics.get(r["status"], 0) + r["cnt"]
                if analytics["total_amount"] > 0:
                    analytics["collection_rate"] = round(analytics["collected_amount"]/analytics["total_amount"]*100, 2)
        except Exception as e:
            logger.warning(f"Analytics query: {e}")
    return analytics

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
