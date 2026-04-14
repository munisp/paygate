"""PayGate Mutual Funds Service v2.0 — NAV tracking, SIP, portfolio management"""
import logging, os, uuid, random
from datetime import datetime, timezone, timedelta
from typing import Optional
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mutual-funds")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
PORT = int(os.getenv("PORT", "9031"))
app = FastAPI(title="PayGate Mutual Funds Service", version="2.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool
FUNDS = [
    {"id":"fund-001","name":"PayGate Money Market Fund","category":"money_market","nav":100.50,"currency":"NGN","min_investment":5000,"risk":"low","ytd_return":12.5,"aum":2500000000},
    {"id":"fund-002","name":"PayGate Equity Growth Fund","category":"equity","nav":245.80,"currency":"NGN","min_investment":10000,"risk":"high","ytd_return":28.3,"aum":1800000000},
    {"id":"fund-003","name":"PayGate Fixed Income Fund","category":"fixed_income","nav":150.25,"currency":"NGN","min_investment":5000,"risk":"medium","ytd_return":15.8,"aum":3200000000},
    {"id":"fund-004","name":"PayGate Balanced Fund","category":"balanced","nav":180.60,"currency":"NGN","min_investment":10000,"risk":"medium","ytd_return":20.1,"aum":1200000000},
    {"id":"fund-005","name":"PayGate Dollar Fund","category":"foreign","nav":1.05,"currency":"USD","min_investment":100,"risk":"low","ytd_return":5.2,"aum":450000000},
]
class InvestRequest(BaseModel):
    customer_id: str; fund_id: str; amount: float = Field(gt=0); currency: str = "NGN"; investment_type: str = "lumpsum"
class RedeemRequest(BaseModel):
    customer_id: str; fund_id: str; units: Optional[float] = None; amount: Optional[float] = None
class SIPRequest(BaseModel):
    customer_id: str; fund_id: str; monthly_amount: float = Field(gt=0); day_of_month: int = Field(ge=1,le=28); currency: str = "NGN"
@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"mutual-funds","version":"2.0.0","ts":datetime.now(timezone.utc).isoformat()}
@app.get("/metrics")
async def metrics():
    pool = await get_pool()
    cnt = 0
    if pool:
        try:
            async with pool.acquire() as c:
                r = await c.fetchrow("SELECT COUNT(*) as n FROM fund_investments")
                cnt = r["n"] if r else 0
        except Exception: pass
    return {"service":"mutual-funds","total_investments":cnt,"available_funds":len(FUNDS),"ts":datetime.now(timezone.utc).isoformat()}
@app.get("/mutual-funds/list")
async def list_funds(category: Optional[str] = None, risk: Optional[str] = None):
    funds = FUNDS
    if category: funds = [f for f in funds if f["category"]==category]
    if risk: funds = [f for f in funds if f["risk"]==risk]
    return {"funds":funds,"count":len(funds)}
@app.get("/mutual-funds/portfolio")
async def get_portfolio(customer_id: str = Query(...)):
    pool = await get_pool()
    holdings = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows = await c.fetch("SELECT * FROM fund_investments WHERE customer_id=$1 AND status=\'active\'",customer_id)
                holdings = [dict(r) for r in rows]
        except Exception: pass
    total_value = sum(float(h.get("current_value") or 0) for h in holdings)
    total_invested = sum(float(h.get("invested_amount") or 0) for h in holdings)
    returns = total_value - total_invested
    return {"customer_id":customer_id,"holdings":holdings,"total_value":total_value,"total_invested":total_invested,"returns":returns,"returns_pct":round(returns/total_invested*100,2) if total_invested>0 else 0}
@app.post("/mutual-funds/invest")
async def invest(req: InvestRequest):
    fund = next((f for f in FUNDS if f["id"]==req.fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    if req.amount < fund["min_investment"]: raise HTTPException(400,f"Minimum investment: {fund[\'min_investment\']}")
    units = req.amount/fund["nav"]; inv_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO fund_investments (id,customer_id,fund_id,units,nav_at_purchase,invested_amount,current_value,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,\'active\',$8) ON CONFLICT DO NOTHING",inv_id,req.customer_id,req.fund_id,units,fund["nav"],req.amount,req.currency,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"investment_id":inv_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"fund_name":fund["name"],"units_allocated":round(units,4),"nav":fund["nav"],"amount_invested":req.amount,"currency":req.currency,"created_at":now.isoformat()}
@app.post("/mutual-funds/redeem")
async def redeem(req: RedeemRequest):
    fund = next((f for f in FUNDS if f["id"]==req.fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    units = req.units or ((req.amount/fund["nav"]) if req.amount else 0)
    if units <= 0: raise HTTPException(400,"Specify units or amount")
    amount = units*fund["nav"]; red_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO fund_redemptions (id,customer_id,fund_id,units,nav_at_redemption,amount,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,\'NGN\',\'processing\',$7) ON CONFLICT DO NOTHING",red_id,req.customer_id,req.fund_id,units,fund["nav"],amount,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"redemption_id":red_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"units_redeemed":round(units,4),"nav":fund["nav"],"amount_to_receive":round(amount,2),"settlement_days":3,"created_at":now.isoformat()}
@app.post("/mutual-funds/sip/create")
async def create_sip(req: SIPRequest):
    fund = next((f for f in FUNDS if f["id"]==req.fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    sip_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool = await get_pool()
    if pool:
        try:
            async with pool.acquire() as c:
                await c.execute("INSERT INTO fund_sips (id,customer_id,fund_id,monthly_amount,day_of_month,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,\'active\',$7) ON CONFLICT DO NOTHING",sip_id,req.customer_id,req.fund_id,req.monthly_amount,req.day_of_month,req.currency,now)
        except Exception as e: logger.warning(f"DB: {e}")
    return {"sip_id":sip_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"fund_name":fund["name"],"monthly_amount":req.monthly_amount,"day_of_month":req.day_of_month,"status":"active","created_at":now.isoformat()}
@app.get("/mutual-funds/nav-history")
async def nav_history(fund_id: str = Query(...), days: int = Query(30,ge=1,le=365)):
    fund = next((f for f in FUNDS if f["id"]==fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    random.seed(fund_id); history = []; base_nav = fund["nav"]*0.85
    for i in range(days):
        d = datetime.now(timezone.utc)-timedelta(days=days-i)
        base_nav *= (1+random.uniform(-0.005,0.008))
        history.append({"date":d.date().isoformat(),"nav":round(base_nav,4)})
    return {"fund_id":fund_id,"fund_name":fund["name"],"history":history,"current_nav":fund["nav"]}
@app.get("/mutual-funds/sips")
async def list_sips(customer_id: str = Query(...)):
    pool = await get_pool()
    rows = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows = [dict(r) for r in await c.fetch("SELECT * FROM fund_sips WHERE customer_id=$1 ORDER BY created_at DESC",customer_id)]
        except Exception: pass
    return {"customer_id":customer_id,"sips":rows,"count":len(rows)}
if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
