"""PayGate Salary Accounts Service v2.0 — Employer payroll and salary advance"""
import logging, os, uuid
from datetime import datetime, timezone
from typing import Optional, List
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("salary-accounts")
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
PORT = int(os.getenv("PORT", "9033"))
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate Salary Accounts Service", version="2.0.0")
setup_telemetry("salary-accounts", app)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool

MAX_ADVANCE_PCT = 0.50
ADVANCE_FEE_PCT = 0.015

class OpenAccountRequest(BaseModel):
    merchant_id: str; employee_id: str; full_name: str; bank_code: str
    account_number: str; monthly_salary: float = Field(gt=0); currency: str = "NGN"
    department: Optional[str] = None; grade_level: Optional[str] = None

class PayrollRequest(BaseModel):
    merchant_id: str; payroll_date: str; employees: List[dict]; narration: str = "Monthly Salary Payment"

class AdvanceRequest(BaseModel):
    account_id: str; amount: float = Field(gt=0); reason: str; repayment_months: int = Field(ge=1,le=6)

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"salary-accounts","version":"2.0.0","ts":datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM salary_accounts")
                cnt = r["n"] if r else 0
        except Exception: pass
    return {"service":"salary-accounts","total_accounts":cnt,"max_advance_pct":MAX_ADVANCE_PCT,"ts":datetime.now(timezone.utc).isoformat()}

@app.post("/salary-accounts/open")
async def open_account(req: OpenAccountRequest):
    account_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    max_advance = req.monthly_salary * MAX_ADVANCE_PCT
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO salary_accounts (id,merchant_id,employee_id,full_name,bank_code,account_number,monthly_salary,currency,max_advance_amount,status,department,grade_level,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12) ON CONFLICT DO NOTHING",account_id,req.merchant_id,req.employee_id,req.full_name,req.bank_code,req.account_number,req.monthly_salary,req.currency,max_advance,req.department,req.grade_level,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"account_id":account_id,"employee_id":req.employee_id,"merchant_id":req.merchant_id,"full_name":req.full_name,"monthly_salary":req.monthly_salary,"max_advance_amount":max_advance,"status":"active","created_at":now.isoformat()}

@app.get("/salary-accounts/account")
async def list_accounts(merchant_id: str = Query(...), page: int = Query(1,ge=1), page_size: int = Query(20)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as c:
                offset=(page-1)*page_size
                rows=[dict(r) for r in await c.fetch("SELECT * FROM salary_accounts WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",merchant_id,page_size,offset)]
                cr=await c.fetchrow("SELECT COUNT(*) as n FROM salary_accounts WHERE merchant_id=$1",merchant_id)
                total=cr["n"] if cr else 0
        except Exception as e: logger.warning(f"DB: {e}")
    return {"accounts":rows,"total":total,"page":page}

@app.post("/salary-accounts/payroll")
async def process_payroll(req: PayrollRequest):
    payroll_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    total_amount = sum(e.get("net_salary",0) for e in req.employees)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO payroll_runs (id,merchant_id,payroll_date,employee_count,total_amount,narration,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,'processing',$7) ON CONFLICT DO NOTHING",payroll_id,req.merchant_id,req.payroll_date,len(req.employees),total_amount,req.narration,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"payroll_id":payroll_id,"merchant_id":req.merchant_id,"employee_count":len(req.employees),"total_amount":total_amount,"status":"processing","initiated_at":now.isoformat()}

@app.post("/salary-accounts/advance")
async def request_advance(req: AdvanceRequest):
    pool = await get_pool()
    account = None
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM salary_accounts WHERE id=$1",req.account_id)
                if r: account = dict(r)
        except Exception: pass
    if not account: raise HTTPException(404,"Salary account not found")
    max_advance = float(account.get("max_advance_amount",0))
    if req.amount > max_advance: raise HTTPException(400,f"Amount exceeds maximum advance: {max_advance}")
    fee = req.amount * ADVANCE_FEE_PCT
    monthly_repayment = (req.amount + fee) / req.repayment_months
    advance_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool2 = await get_pool()
    if pool2:
        try:
            async with pool2.acquire() as c:
                await c.execute("INSERT INTO salary_advances (id,account_id,amount,fee,monthly_repayment,repayment_months,reason,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,'approved',$8) ON CONFLICT DO NOTHING",advance_id,req.account_id,req.amount,fee,monthly_repayment,req.repayment_months,req.reason,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"advance_id":advance_id,"account_id":req.account_id,"amount":req.amount,"fee":round(fee,2),"monthly_repayment":round(monthly_repayment,2),"repayment_months":req.repayment_months,"status":"approved","approved_at":now.isoformat()}

@app.get("/salary-accounts/advances")
async def list_advances(account_id: str = Query(...)):
    pool = await get_pool()
    rows = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows=[dict(r) for r in await c.fetch("SELECT * FROM salary_advances WHERE account_id=$1 ORDER BY created_at DESC",account_id)]
        except Exception: pass
    return {"account_id":account_id,"advances":rows,"count":len(rows)}

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
