"""PayGate Mutual Funds Service v2.1 — NAV tracking, SIP, portfolio management

NAV PRICING POLICY (fail loud, never fabricate):
  NAV / YTD / AUM are never hardcoded. A tradable NAV is sourced, in order:
    1. Cowrywise fund-administration API (COWRYWISE_BASE_URL + COWRYWISE_API_KEY)
    2. Latest row of the fund_nav_history table (populated by the NAV sync job)
  If neither source yields a price, invest/redeem return HTTP 503 and the
  catalogue marks the fund as nav_available=false. Real money is never
  settled against an invented price.
"""
import logging, os, time, uuid
from datetime import datetime, timezone
from typing import Optional
import aiohttp
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("mutual-funds")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
COWRYWISE_BASE_URL = os.getenv("COWRYWISE_BASE_URL", "https://api.cowrywise.com/v1").rstrip("/")
COWRYWISE_API_KEY = os.getenv("COWRYWISE_API_KEY", "")
NAV_CACHE_TTL_SECONDS = int(os.getenv("NAV_CACHE_TTL_SECONDS", "300"))
PORT = int(os.getenv("PORT", "9031"))
app = FastAPI(title="PayGate Mutual Funds Service", version="2.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])
_pool = None
async def get_pool():
    global _pool
    if _pool is None:
        try: _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e: logger.warning(f"DB: {e}")
    return _pool

# Fund catalogue — METADATA ONLY. No nav/ytd_return/aum here: those are market
# data and must come from the fund administrator (Cowrywise) or the NAV table.
FUNDS = [
    {"id":"fund-001","name":"PayGate Money Market Fund","category":"money_market","currency":"NGN","min_investment":5000,"risk":"low"},
    {"id":"fund-002","name":"PayGate Equity Growth Fund","category":"equity","currency":"NGN","min_investment":10000,"risk":"high"},
    {"id":"fund-003","name":"PayGate Fixed Income Fund","category":"fixed_income","currency":"NGN","min_investment":5000,"risk":"medium"},
    {"id":"fund-004","name":"PayGate Balanced Fund","category":"balanced","currency":"NGN","min_investment":10000,"risk":"medium"},
    {"id":"fund-005","name":"PayGate Dollar Fund","category":"foreign","currency":"USD","min_investment":100,"risk":"low"},
]

# Small in-process NAV cache: { fund_id: (nav, source, fetched_at_epoch) }
_nav_cache: dict = {}


async def _cowrywise_nav(fund: dict) -> Optional[float]:
    """Fetch the fund's NAV from the Cowrywise fund-administration API.

    Returns None when Cowrywise is unconfigured, unreachable, or does not list
    the fund. Never returns an invented value.
    """
    if not COWRYWISE_API_KEY:
        return None
    try:
        headers = {"Authorization": f"Bearer {COWRYWISE_API_KEY}", "Accept": "application/json"}
        timeout = aiohttp.ClientTimeout(total=8)
        async with aiohttp.ClientSession(timeout=timeout) as session:
            async with session.get(f"{COWRYWISE_BASE_URL}/funds", headers=headers) as resp:
                if resp.status != 200:
                    body = await resp.text()
                    logger.error(f"Cowrywise /funds returned HTTP {resp.status}: {body[:200]}")
                    return None
                payload = await resp.json()
        items = payload.get("data") or payload.get("funds") or []
        # Match by configured Cowrywise fund id (env) or by name.
        env_id = os.getenv(f"COWRYWISE_FUND_ID_{fund['id'].upper().replace('-', '_')}", "")
        short_name = fund["name"].replace("PayGate ", "").strip().lower()
        for item in items:
            item_id = str(item.get("id") or item.get("fund_id") or "")
            item_name = str(item.get("name") or "").lower()
            if (env_id and item_id == env_id) or (short_name and short_name in item_name):
                for key in ("nav", "unit_price", "nav_price", "price"):
                    if item.get(key) is not None:
                        return float(item[key])
        logger.error(f"Cowrywise fund list did not include a match for {fund['name']}")
        return None
    except Exception as e:
        logger.error(f"Cowrywise NAV fetch failed for {fund['id']}: {e}")
        return None


async def _db_nav(fund_id: str, pool) -> Optional[float]:
    """Latest NAV recorded in the fund_nav_history table (populated by the NAV sync job)."""
    if not pool:
        return None
    try:
        async with pool.acquire() as c:
            row = await c.fetchrow(
                "SELECT nav_price FROM fund_nav_history WHERE fund_id=$1 ORDER BY nav_date DESC LIMIT 1",
                fund_id,
            )
            if row and row["nav_price"] is not None:
                return float(row["nav_price"])
    except Exception as e:
        logger.error(f"NAV table lookup failed for {fund_id}: {e}")
    return None


async def get_live_nav(fund: dict, pool) -> tuple[Optional[float], Optional[str]]:
    """Return (nav, source). (None, None) when no real price exists — callers
    settling money MUST fail loud in that case."""
    cached = _nav_cache.get(fund["id"])
    if cached and (time.time() - cached[2]) < NAV_CACHE_TTL_SECONDS:
        return cached[0], cached[1]
    nav = await _cowrywise_nav(fund)
    source = "cowrywise" if nav is not None else None
    if nav is None:
        nav = await _db_nav(fund["id"], pool)
        source = "nav_table" if nav is not None else None
    if nav is not None:
        _nav_cache[fund["id"]] = (nav, source, time.time())
    return nav, source


async def require_tradable_nav(fund: dict, pool) -> tuple[float, str]:
    nav, source = await get_live_nav(fund, pool)
    if nav is None:
        logger.error(f"NAV unavailable for {fund['id']} from Cowrywise and NAV table — refusing to price a trade")
        raise HTTPException(
            503,
            f"Live NAV for fund {fund['id']} is unavailable (Cowrywise and NAV table both "
            "returned no price). Trades are blocked rather than priced on fabricated values.",
        )
    return nav, source


class InvestRequest(BaseModel):
    customer_id: str; fund_id: str; amount: float = Field(gt=0); currency: str = "NGN"; investment_type: str = "lumpsum"
class RedeemRequest(BaseModel):
    customer_id: str; fund_id: str; units: Optional[float] = None; amount: Optional[float] = None
class SIPRequest(BaseModel):
    customer_id: str; fund_id: str; monthly_amount: float = Field(gt=0); day_of_month: int = Field(ge=1,le=28); currency: str = "NGN"
@app.get("/health")
async def health():
    pool = await get_pool()
    return {"status":"ok" if pool else "degraded","service":"mutual-funds","version":"2.1.0","cowrywise_configured":bool(COWRYWISE_API_KEY),"ts":datetime.now(timezone.utc).isoformat()}
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
    pool = await get_pool()
    out = []
    for f in funds:
        nav, source = await get_live_nav(f, pool)
        # Never emit invented NAV/YTD/AUM. When no real price exists the fund
        # is explicitly labelled unavailable for trading.
        out.append({**f, "nav": nav, "nav_source": source, "nav_available": nav is not None,
                    "ytd_return": None, "aum": None})
    return {"funds":out,"count":len(out)}
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
    if req.amount < fund["min_investment"]:
        min_inv = fund["min_investment"]
        raise HTTPException(400,f"Minimum investment: {min_inv}")
    pool = await get_pool()
    if not pool:
        raise HTTPException(503,"Investment store unavailable — refusing to record an investment durably")
    nav, nav_source = await require_tradable_nav(fund, pool)
    units = req.amount/nav; inv_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    try:
        async with pool.acquire() as c:
            await c.execute("INSERT INTO fund_investments (id,customer_id,fund_id,units,nav_at_purchase,invested_amount,current_value,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,$6,$7,\'active\',$8) ON CONFLICT DO NOTHING",inv_id,req.customer_id,req.fund_id,units,nav,req.amount,req.currency,now)
    except Exception as e:
        logger.error(f"invest DB write failed: {e}")
        raise HTTPException(503,f"Could not persist investment: {e}")
    return {"investment_id":inv_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"fund_name":fund["name"],"units_allocated":round(units,4),"nav":nav,"nav_source":nav_source,"amount_invested":req.amount,"currency":req.currency,"created_at":now.isoformat()}
@app.post("/mutual-funds/redeem")
async def redeem(req: RedeemRequest):
    fund = next((f for f in FUNDS if f["id"]==req.fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    pool = await get_pool()
    if not pool:
        raise HTTPException(503,"Redemption store unavailable — refusing to record a redemption durably")
    nav, nav_source = await require_tradable_nav(fund, pool)
    units = req.units or ((req.amount/nav) if req.amount else 0)
    if units <= 0: raise HTTPException(400,"Specify units or amount")
    amount = units*nav; red_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    try:
        async with pool.acquire() as c:
            await c.execute("INSERT INTO fund_redemptions (id,customer_id,fund_id,units,nav_at_redemption,amount,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,\'NGN\',\'processing\',$7) ON CONFLICT DO NOTHING",red_id,req.customer_id,req.fund_id,units,nav,amount,now)
    except Exception as e:
        logger.error(f"redeem DB write failed: {e}")
        raise HTTPException(503,f"Could not persist redemption: {e}")
    return {"redemption_id":red_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"units_redeemed":round(units,4),"nav":nav,"nav_source":nav_source,"amount_to_receive":round(amount,2),"settlement_days":3,"created_at":now.isoformat()}
@app.post("/mutual-funds/sip/create")
async def create_sip(req: SIPRequest):
    fund = next((f for f in FUNDS if f["id"]==req.fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    sip_id = str(uuid.uuid4()); now = datetime.now(timezone.utc)
    pool = await get_pool()
    if not pool:
        raise HTTPException(503,"SIP store unavailable — refusing to record a SIP durably")
    try:
        async with pool.acquire() as c:
            await c.execute("INSERT INTO fund_sips (id,customer_id,fund_id,monthly_amount,day_of_month,currency,status,created_at) VALUES ($1,$2,$3,$4,$5,$6,\'active\',$7) ON CONFLICT DO NOTHING",sip_id,req.customer_id,req.fund_id,req.monthly_amount,req.day_of_month,req.currency,now)
    except Exception as e:
        logger.error(f"sip DB write failed: {e}")
        raise HTTPException(503,f"Could not persist SIP: {e}")
    return {"sip_id":sip_id,"customer_id":req.customer_id,"fund_id":req.fund_id,"fund_name":fund["name"],"monthly_amount":req.monthly_amount,"day_of_month":req.day_of_month,"status":"active","created_at":now.isoformat()}
@app.get("/mutual-funds/nav-history")
async def nav_history(fund_id: str = Query(...), days: int = Query(30,ge=1,le=365)):
    fund = next((f for f in FUNDS if f["id"]==fund_id),None)
    if not fund: raise HTTPException(404,"Fund not found")
    pool = await get_pool()
    history = []
    if pool:
        try:
            async with pool.acquire() as c:
                rows = await c.fetch(
                    """SELECT nav_date::text AS date, nav_price AS nav
                       FROM fund_nav_history
                       WHERE fund_id = $1 AND nav_date >= CURRENT_DATE - ($2 || ' days')::INTERVAL
                       ORDER BY nav_date ASC""",
                    fund_id, str(days)
                )
                history = [dict(r) for r in rows]
        except Exception as e:
            logger.warning(f"NAV history DB query failed: {e}")
    # If no DB data, return empty history — do not simulate random prices.
    # current_nav is None when no real price exists (never a hardcoded value).
    current_nav, nav_source = await get_live_nav(fund, pool)
    return {"fund_id":fund_id,"fund_name":fund["name"],"history":history,"current_nav":current_nav,"nav_source":nav_source}
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
