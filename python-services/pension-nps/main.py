"""PayGate Pension/NPS Service v2.0"""
import logging, os, uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("pension-nps")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
PORT = int(os.getenv("PORT", "9032"))
app = FastAPI(title="PayGate Pension/NPS Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool

CONTRIBUTION_RATE_EMPLOYEE = 0.08
CONTRIBUTION_RATE_EMPLOYER = 0.10
RETIREMENT_AGE = 60

class EnrollRequest(BaseModel):
    employee_id: str; merchant_id: str; full_name: str; date_of_birth: str
    monthly_salary: float = Field(gt=0); pfa_code: str = "PAYGATE-PFA"; voluntary_contribution: float = 0.0

class ContributionRequest(BaseModel):
    pfa_id: str; merchant_id: str; employee_id: str
    employee_contribution: float = Field(ge=0); employer_contribution: float = Field(ge=0)
    month: str; salary: float = Field(gt=0)

def calc_contribs(salary, voluntary=0):
    return {"employee": round(salary*CONTRIBUTION_RATE_EMPLOYEE,2), "employer": round(salary*CONTRIBUTION_RATE_EMPLOYER,2), "voluntary": voluntary, "total": round(salary*(CONTRIBUTION_RATE_EMPLOYEE+CONTRIBUTION_RATE_EMPLOYER)+voluntary,2)}

def retirement_date(dob):
    try:
        d = datetime.fromisoformat(dob)
        return d.replace(year=d.year+RETIREMENT_AGE).date().isoformat()
    except Exception: return "unknown"

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"pension-nps","version":"2.0.0","ts":datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM pension_accounts")
                cnt = r["n"] if r else 0
        except Exception: pass
    return {"service":"pension-nps","total_accounts":cnt,"contribution_rate_employee":CONTRIBUTION_RATE_EMPLOYEE,"contribution_rate_employer":CONTRIBUTION_RATE_EMPLOYER,"ts":datetime.now(timezone.utc).isoformat()}

@app.post("/pension/enroll")
async def enroll(req: EnrollRequest):
    pfa_id = f"PFA{uuid.uuid4().hex[:10].upper()}"
    now = datetime.now(timezone.utc)
    ret_date = retirement_date(req.date_of_birth)
    contribs = calc_contribs(req.monthly_salary, req.voluntary_contribution)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO pension_accounts (id,employee_id,merchant_id,full_name,date_of_birth,monthly_salary,pfa_code,pfa_id,employee_contribution_rate,employer_contribution_rate,voluntary_contribution,status,retirement_date,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'active',$12,$13) ON CONFLICT DO NOTHING",str(uuid.uuid4()),req.employee_id,req.merchant_id,req.full_name,req.date_of_birth,req.monthly_salary,req.pfa_code,pfa_id,CONTRIBUTION_RATE_EMPLOYEE,CONTRIBUTION_RATE_EMPLOYER,req.voluntary_contribution,ret_date,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"pfa_id":pfa_id,"employee_id":req.employee_id,"merchant_id":req.merchant_id,"full_name":req.full_name,"monthly_contributions":contribs,"retirement_date":ret_date,"status":"active","enrolled_at":now.isoformat()}

@app.post("/pension/contribute")
async def contribute(req: ContributionRequest):
    contrib_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    total = req.employee_contribution + req.employer_contribution
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO pension_contributions (id,pfa_id,merchant_id,employee_id,employee_contribution,employer_contribution,total_contribution,salary,month,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'confirmed',$10) ON CONFLICT DO NOTHING",contrib_id,req.pfa_id,req.merchant_id,req.employee_id,req.employee_contribution,req.employer_contribution,total,req.salary,req.month,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"contribution_id":contrib_id,"pfa_id":req.pfa_id,"total_contribution":total,"month":req.month,"status":"confirmed","recorded_at":now.isoformat()}

@app.get("/pension/statement")
async def statement(pfa_id: str = Query(...)):
    pool = await get_pool()
    account, contributions = None, []
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM pension_accounts WHERE pfa_id=$1",pfa_id)
                if r: account = dict(r)
                rows = await c.fetch("SELECT * FROM pension_contributions WHERE pfa_id=$1 ORDER BY month DESC LIMIT 24",pfa_id)
                contributions = [dict(r) for r in rows]
        except Exception: pass
    total_balance = sum(float(c.get("total_contribution") or 0) for c in contributions)
    return {"pfa_id":pfa_id,"account":account,"contributions":contributions,"total_balance":total_balance,"count":len(contributions)}

@app.get("/pension/accounts")
async def list_accounts(merchant_id: str = Query(...), page: int = Query(1,ge=1), page_size: int = Query(20)):
    pool = await get_pool()
    rows, total = [], 0
    if pool:
        try:
            async with pool.acquire() as c:
                offset=(page-1)*page_size
                rows=[dict(r) for r in await c.fetch("SELECT * FROM pension_accounts WHERE merchant_id=$1 ORDER BY created_at DESC LIMIT $2 OFFSET $3",merchant_id,page_size,offset)]
                cr=await c.fetchrow("SELECT COUNT(*) as n FROM pension_accounts WHERE merchant_id=$1",merchant_id)
                total=cr["n"] if cr else 0
        except Exception as e: logger.warning(f"DB: {e}")
    return {"accounts":rows,"total":total,"page":page}

@app.get("/pension/calculator")
async def calculator(monthly_salary: float = Query(...,gt=0), current_age: int = Query(...,ge=18,le=59), voluntary_pct: float = Query(0,ge=0,le=50)):
    years = RETIREMENT_AGE - current_age; months = years*12
    contribs = calc_contribs(monthly_salary, monthly_salary*voluntary_pct/100)
    monthly_total = contribs["total"]; r = 0.12/12
    fv = monthly_total*((1+r)**months-1)/r*(1+r)
    return {"monthly_salary":monthly_salary,"years_to_retire":years,"monthly_contributions":contribs,"estimated_corpus":round(fv,2),"assumed_annual_return_pct":12.0}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, workers=4, log_level="warning")
