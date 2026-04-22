"""PayGate Wealth Management Service v2.0 — Portfolio, goals, risk profiling"""
import logging, os, uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("wealth-management")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
PORT = int(os.getenv("PORT", "9035"))
app = FastAPI(title="PayGate Wealth Management Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool

RISK_PROFILES = {
    "conservative": {"equity":20,"bonds":60,"money_market":20,"expected_return":10.0},
    "moderate": {"equity":40,"bonds":40,"money_market":20,"expected_return":15.0},
    "balanced": {"equity":60,"bonds":30,"money_market":10,"expected_return":18.0},
    "aggressive": {"equity":80,"bonds":15,"money_market":5,"expected_return":22.0},
    "very_aggressive": {"equity":95,"bonds":5,"money_market":0,"expected_return":28.0},
}

ASSET_CLASSES = [
    {"id":"equity-ngx","name":"NGX Equity","type":"equity","currency":"NGN","ytd_return":28.5,"risk":"high"},
    {"id":"bonds-fg","name":"FGN Bonds","type":"bonds","currency":"NGN","ytd_return":16.2,"risk":"low"},
    {"id":"tbills","name":"Treasury Bills","type":"money_market","currency":"NGN","ytd_return":18.5,"risk":"very_low"},
    {"id":"eurobonds","name":"Nigeria Eurobonds","type":"bonds","currency":"USD","ytd_return":8.5,"risk":"medium"},
    {"id":"reits","name":"Nigerian REITs","type":"real_estate","currency":"NGN","ytd_return":22.0,"risk":"medium"},
    {"id":"gold","name":"Digital Gold","type":"commodity","currency":"NGN","ytd_return":15.0,"risk":"medium"},
]

class RiskProfileRequest(BaseModel):
    customer_id: str; risk_score: int = Field(ge=1,le=100); risk_category: str
    investment_horizon_years: int = Field(ge=1,le=40,default=10)

class GoalRequest(BaseModel):
    customer_id: str; goal_name: str; target_amount: float = Field(gt=0)
    target_date: str; goal_type: str = "general"; current_savings: float = 0.0

def calc_monthly_contribution(target, current, years, annual_return):
    if years <= 0: return max(0, target - current)
    months = years * 12; r = annual_return / 100 / 12
    if r == 0: return max(0, (target - current * (1+annual_return/100)**years) / months)
    fv_current = current * (1+r)**months
    remaining = target - fv_current
    if remaining <= 0: return 0.0
    return remaining * r / ((1+r)**months - 1)

@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"wealth-management","version":"2.0.0","ts":datetime.now(timezone.utc).isoformat()}

@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM wealth_portfolios")
                cnt = r["n"] if r else 0
        except Exception: pass
    return {"service":"wealth-management","total_portfolios":cnt,"risk_profiles":list(RISK_PROFILES.keys()),"ts":datetime.now(timezone.utc).isoformat()}

@app.get("/wealth/portfolio")
async def get_portfolio(customer_id: str = Query(...)):
    pool = await get_pool()
    portfolio, holdings = None, []
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM wealth_portfolios WHERE customer_id=$1",customer_id)
                if r: portfolio = dict(r)
                rows = await c.fetch("SELECT * FROM wealth_holdings WHERE customer_id=$1",customer_id)
                holdings = [dict(r) for r in rows]
        except Exception: pass
    total_value = sum(float(h.get("current_value") or 0) for h in holdings)
    total_invested = sum(float(h.get("invested_amount") or 0) for h in holdings)
    returns = total_value - total_invested
    return {"customer_id":customer_id,"portfolio":portfolio,"holdings":holdings,"total_value":total_value,"total_invested":total_invested,"returns":returns,"returns_pct":round(returns/total_invested*100,2) if total_invested>0 else 0}

@app.post("/wealth/risk-profile/set")
async def set_risk_profile(req: RiskProfileRequest):
    if req.risk_category not in RISK_PROFILES: raise HTTPException(400,f"Invalid risk category. Valid: {list(RISK_PROFILES.keys())}")
    profile = RISK_PROFILES[req.risk_category]
    profile_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO wealth_risk_profiles (id,customer_id,risk_score,risk_category,investment_horizon_years,equity_pct,bonds_pct,money_market_pct,expected_return,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10) ON CONFLICT (customer_id) DO UPDATE SET risk_score=$3,risk_category=$4,investment_horizon_years=$5,equity_pct=$6,bonds_pct=$7,money_market_pct=$8,expected_return=$9,updated_at=$10",profile_id,req.customer_id,req.risk_score,req.risk_category,req.investment_horizon_years,profile["equity"],profile["bonds"],profile["money_market"],profile["expected_return"],now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"profile_id":profile_id,"customer_id":req.customer_id,"risk_score":req.risk_score,"risk_category":req.risk_category,"allocation":profile,"expected_annual_return":profile["expected_return"],"set_at":now.isoformat()}

@app.get("/wealth/risk-profile")
async def get_risk_profile(customer_id: str = Query(...)):
    pool = await get_pool()
    profile = None
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT * FROM wealth_risk_profiles WHERE customer_id=$1",customer_id)
                if r: profile = dict(r)
        except Exception: pass
    if not profile: return {"customer_id":customer_id,"risk_category":"moderate","risk_score":50,"allocation":RISK_PROFILES["moderate"],"note":"Default profile"}
    return profile

@app.post("/wealth/goals/create")
async def create_goal(req: GoalRequest):
    pool = await get_pool()
    risk_cat = "moderate"
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT risk_category FROM wealth_risk_profiles WHERE customer_id=$1",req.customer_id)
                if r: risk_cat = r["risk_category"]
        except Exception: pass
    profile = RISK_PROFILES.get(risk_cat, RISK_PROFILES["moderate"])
    try:
        target_dt = datetime.fromisoformat(req.target_date)
        years = max(0.5,(target_dt - datetime.now(timezone.utc)).days/365)
    except Exception: years = 5.0
    monthly = calc_monthly_contribution(req.target_amount, req.current_savings, years, profile["expected_return"])
    goal_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool2 = await get_pool()
    if pool2:
        try:
            async with pool2.acquire() as c:
                await c.execute("INSERT INTO wealth_goals (id,customer_id,goal_name,goal_type,target_amount,current_savings,target_date,monthly_contribution,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',$9) ON CONFLICT DO NOTHING",goal_id,req.customer_id,req.goal_name,req.goal_type,req.target_amount,req.current_savings,req.target_date,monthly,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"goal_id":goal_id,"customer_id":req.customer_id,"goal_name":req.goal_name,"target_amount":req.target_amount,"target_date":req.target_date,"monthly_contribution":round(monthly,2),"years_to_goal":round(years,1),"assumed_return_pct":profile["expected_return"],"created_at":now.isoformat()}

@app.get("/wealth/goals")
async def list_goals(customer_id: str = Query(...)):
    pool = await get_pool()
    rows = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows=[dict(r) for r in await c.fetch("SELECT * FROM wealth_goals WHERE customer_id=$1 AND status='active' ORDER BY created_at DESC",customer_id)]
        except Exception: pass
    return {"customer_id":customer_id,"goals":rows,"count":len(rows)}

@app.get("/wealth/recommendations")
async def get_recommendations(customer_id: str = Query(...)):
    pool = await get_pool()
    risk_cat = "moderate"
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT risk_category FROM wealth_risk_profiles WHERE customer_id=$1",customer_id)
                if r: risk_cat = r["risk_category"]
        except Exception: pass
    profile = RISK_PROFILES.get(risk_cat, RISK_PROFILES["moderate"])
    recs = []
    for asset in ASSET_CLASSES:
        if asset["type"]=="equity" and profile["equity"]>40: recs.append({**asset,"recommendation":"buy","rationale":"Aligns with your equity allocation target"})
        elif asset["type"]=="bonds" and profile["bonds"]>30: recs.append({**asset,"recommendation":"hold","rationale":"Provides portfolio stability"})
        elif asset["type"]=="money_market" and profile["money_market"]>10: recs.append({**asset,"recommendation":"buy","rationale":"Liquidity buffer for short-term needs"})
    return {"customer_id":customer_id,"risk_category":risk_cat,"recommendations":recs[:5],"generated_at":datetime.now(timezone.utc).isoformat()}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=4, log_level="warning")
