"""PayGate EMI Service v2.0 — Equated Monthly Instalments with amortization"""
import logging, os, uuid, math
from datetime import datetime, timezone, timedelta, date
from typing import Optional, List
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("emi-service")
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
PORT = int(os.getenv("PORT", "9029"))

app = FastAPI(title="PayGate EMI Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB pool failed: {e}")
    return _pool

class EMIPlanRequest(BaseModel):
    merchant_id: str
    plan_name: str
    tenure_months: int = Field(ge=1, le=60)
    interest_rate_annual: float = Field(ge=0, le=100)  # Annual %
    processing_fee_pct: float = Field(ge=0, le=10)
    min_amount: float = Field(ge=0)
    max_amount: float = Field(ge=0)
    currency: str = "NGN"
    enabled: bool = True

class EMIApplicationRequest(BaseModel):
    customer_id: str
    merchant_id: str
    plan_id: str
    principal_amount: float = Field(gt=0)
    purpose: Optional[str] = None

class EMIRepaymentRequest(BaseModel):
    application_id: str
    instalment_number: int = Field(ge=1)
    amount: float = Field(gt=0)
    payment_reference: str

def amortize(principal: float, annual_rate: float, tenure_months: int) -> List[dict]:
    """Generate full amortization schedule."""
    if annual_rate == 0:
        emi = principal / tenure_months
        return [{"instalment": i+1, "emi": round(emi, 2), "principal": round(emi, 2), "interest": 0.0, "balance": round(principal - emi*(i+1), 2)} for i in range(tenure_months)]
    monthly_rate = annual_rate / 100 / 12
    emi = principal * monthly_rate * (1 + monthly_rate)**tenure_months / ((1 + monthly_rate)**tenure_months - 1)
    schedule = []
    balance = principal
    for i in range(tenure_months):
        interest = balance * monthly_rate
        principal_part = emi - interest
        balance -= principal_part
        schedule.append({"instalment": i+1, "emi": round(emi, 2), "principal": round(principal_part, 2), "interest": round(interest, 2), "balance": round(max(0, balance), 2)})
    return schedule

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status": "ok" if pool else "degraded", "service": "emi-service", "version": "2.0.0", "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM emi_applications")
                cnt = r["n"] if r else 0
        except Exception: pass
    return {"service": "emi-service", "total_applications": cnt, "ts": datetime.now(timezone.utc).isoformat()}

@app.get("/emi/plans")
async def list_plans(merchant_id: str = Query(...)):
    pool = await get_pool()
    plans = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows = await c.fetch("SELECT * FROM emi_plans WHERE merchant_id=$1 AND enabled=true ORDER BY tenure_months", merchant_id)
                plans = [dict(r) for r in rows]
        except Exception as e: logger.warning(f"DB: {e}")
    if not plans:
        # Default plans
        plans = [
            {"id": "plan-3m", "name": "3 Month EMI", "tenure_months": 3, "interest_rate_annual": 18.0, "processing_fee_pct": 1.0, "min_amount": 5000, "max_amount": 500000, "currency": "NGN"},
            {"id": "plan-6m", "name": "6 Month EMI", "tenure_months": 6, "interest_rate_annual": 18.0, "processing_fee_pct": 1.5, "min_amount": 10000, "max_amount": 1000000, "currency": "NGN"},
            {"id": "plan-12m", "name": "12 Month EMI", "tenure_months": 12, "interest_rate_annual": 24.0, "processing_fee_pct": 2.0, "min_amount": 20000, "max_amount": 2000000, "currency": "NGN"},
        ]
    return {"plans": plans, "merchant_id": merchant_id}

@app.post("/emi/plans/create")
async def create_plan(req: EMIPlanRequest):
    plan_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO emi_plans (id, merchant_id, plan_name, tenure_months, interest_rate_annual, processing_fee_pct, min_amount, max_amount, currency, enabled, created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT DO NOTHING", plan_id, req.merchant_id, req.plan_name, req.tenure_months, req.interest_rate_annual, req.processing_fee_pct, req.min_amount, req.max_amount, req.currency, req.enabled, now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"plan_id": plan_id, "merchant_id": req.merchant_id, "plan_name": req.plan_name, "tenure_months": req.tenure_months, "interest_rate_annual": req.interest_rate_annual, "created_at": now.isoformat()}

@app.post("/emi/initiate")
async def initiate_emi(req: EMIApplicationRequest):
    pool = await get_pool()
    # Get plan details
    plan = {"tenure_months": 12, "interest_rate_annual": 24.0, "processing_fee_pct": 2.0, "min_amount": 0, "max_amount": 10_000_000}
    if pool:
        try:
            async with pool.acquire() as c:
                pr = await c.fetchrow("SELECT * FROM emi_plans WHERE id=$1", req.plan_id)
                if pr: plan = dict(pr)
        except Exception: pass
    # Validate amount
    if req.principal_amount < plan.get("min_amount", 0):
        raise HTTPException(400, f"Amount below plan minimum: {plan.get('min_amount')}")
    if req.principal_amount > plan.get("max_amount", 10_000_000):
        raise HTTPException(400, f"Amount exceeds plan maximum: {plan.get('max_amount')}")
    tenure = plan.get("tenure_months", 12)
    rate = plan.get("interest_rate_annual", 24.0)
    fee_pct = plan.get("processing_fee_pct", 2.0)
    processing_fee = req.principal_amount * fee_pct / 100
    schedule = amortize(req.principal_amount, rate, tenure)
    emi_amount = schedule[0]["emi"] if schedule else 0
    application_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO emi_applications (id, customer_id, merchant_id, plan_id, principal_amount, processing_fee, emi_amount, tenure_months, interest_rate_annual, status, created_at, updated_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$10) ON CONFLICT DO NOTHING", application_id, req.customer_id, req.merchant_id, req.plan_id, req.principal_amount, processing_fee, emi_amount, tenure, rate, now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"application_id": application_id, "customer_id": req.customer_id, "principal_amount": req.principal_amount, "processing_fee": processing_fee, "emi_amount": emi_amount, "tenure_months": tenure, "interest_rate_annual": rate, "status": "active", "schedule": schedule[:3], "total_schedule_count": len(schedule), "created_at": now.isoformat()}

@app.get("/emi/schedule")
async def get_schedule(application_id: str = Query(...)):
    pool = await get_pool()
    app_data = None
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM emi_applications WHERE id=$1", application_id)
                if r: app_data = dict(r)
        except Exception: pass
    if not app_data:
        raise HTTPException(404, "EMI application not found")
    schedule = amortize(float(app_data["principal_amount"]), float(app_data["interest_rate_annual"]), int(app_data["tenure_months"]))
    paid_instalments = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM emi_repayments WHERE application_id=$1 AND status='paid'", application_id)
                paid_instalments = r["n"] if r else 0
        except Exception: pass
    next_due = None
    remaining = 0
    for s in schedule:
        if s["instalment"] > paid_instalments:
            next_due = s
            remaining = float(app_data["principal_amount"]) - sum(s2["principal"] for s2 in schedule[:paid_instalments])
            break
    return {"application_id": application_id, "schedule": schedule, "paid_instalments": paid_instalments, "next_due": next_due, "remaining_amount": max(0, remaining), "status": app_data.get("status", "active")}

@app.post("/emi/repay")
async def record_repayment(req: EMIRepaymentRequest):
    pool = await get_pool()
    repayment_id = str(uuid.uuid4())
    now = datetime.now(timezone.utc)
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO emi_repayments (id, application_id, instalment_number, amount, payment_reference, status, paid_at) VALUES ($1,$2,$3,$4,$5,'paid',$6) ON CONFLICT DO NOTHING", repayment_id, req.application_id, req.instalment_number, req.amount, req.payment_reference, now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"repayment_id": repayment_id, "application_id": req.application_id, "instalment_number": req.instalment_number, "amount": req.amount, "status": "paid", "paid_at": now.isoformat()}

@app.get("/emi/merchant-config")
async def get_emi_merchant_config(merchant_id: str = Query(...)):
    pool = await get_pool()
    config = {"merchant_id": merchant_id, "enabled": True, "max_tenure_months": 24, "default_interest_rate": 18.0}
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM emi_merchant_configs WHERE merchant_id=$1", merchant_id)
                if r: config = dict(r)
        except Exception: pass
    return config

@app.post("/emi/merchant-config/update")
async def update_emi_merchant_config(merchant_id: str, enabled: bool = True, max_tenure_months: int = 24):
    pool = await get_pool()
    now = datetime.now(timezone.utc)
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO emi_merchant_configs (id, merchant_id, enabled, max_tenure_months, updated_at) VALUES ($1,$2,$3,$4,$5) ON CONFLICT (merchant_id) DO UPDATE SET enabled=$3, max_tenure_months=$4, updated_at=$5", str(uuid.uuid4()), merchant_id, enabled, max_tenure_months, now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"success": True, "merchant_id": merchant_id, "enabled": enabled, "max_tenure_months": max_tenure_months, "updated_at": now.isoformat()}

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
