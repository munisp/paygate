"""
PayGate Digital Gold Microservice
Handles digital gold purchases, sales, SIP plans, and price feeds.
Integrates with GoldTech API and stores holdings in the database.
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Optional
import aiohttp
from fastapi import FastAPI, HTTPException, Query, Header
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("digital-gold")

# ─── Configuration ─────────────────────────────────────────────────────────────
GOLDTECH_API_URL = os.getenv("GOLDTECH_API_URL", "https://api.goldtech.ng/v1")
GOLDTECH_API_KEY = os.getenv("GOLDTECH_API_KEY", "goldtech-api-key-default")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "paygate-internal-key-default")
PORT = int(os.getenv("PORT", "9020"))

app = FastAPI(title="PayGate Digital Gold Service", version="1.0.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── In-memory store (replace with DB in production) ──────────────────────────
_holdings: dict = {}
_transactions: dict = {}
_sip_plans: dict = {}

# ─── Models ───────────────────────────────────────────────────────────────────
class BuyGoldRequest(BaseModel):
    userId: int
    amountKobo: int
    paymentMethod: str = "wallet"

class SellGoldRequest(BaseModel):
    userId: int
    grams: float

class SIPPlanRequest(BaseModel):
    userId: int
    monthlyAmountKobo: int
    dayOfMonth: int = 1
    durationMonths: int = 12

# ─── Helpers ──────────────────────────────────────────────────────────────────
async def get_live_gold_price() -> dict:
    """Fetch live gold price from GoldTech API, fallback to mock."""
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{GOLDTECH_API_URL}/price",
                headers={"X-API-Key": GOLDTECH_API_KEY},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    return await resp.json()
    except Exception as e:
        logger.warning(f"GoldTech price fetch failed: {e}, using mock")
    # Mock fallback
    return {
        "pricePerGramKobo": 8_500_00,  # ₦8,500 per gram
        "pricePerOzUSD": 2050.0,
        "change24hPct": 0.42,
        "updatedAt": datetime.now(timezone.utc).isoformat(),
        "currency": "NGN",
    }

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    return {"status": "ok", "service": "digital-gold", "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/price")
async def get_price():
    return await get_live_gold_price()

@app.get("/holdings")
async def get_holdings(userId: int = Query(...)):
    holding = _holdings.get(str(userId), {
        "userId": userId,
        "grams": 0.0,
        "currentValueKobo": 0,
        "totalInvestedKobo": 0,
        "totalReturnKobo": 0,
        "totalReturnPct": 0.0,
        "avgBuyPricePerGram": 0,
        "lastUpdated": datetime.now(timezone.utc).isoformat(),
    })
    price_data = await get_live_gold_price()
    if holding["grams"] > 0:
        holding["currentValueKobo"] = int(holding["grams"] * price_data["pricePerGramKobo"])
        holding["totalReturnKobo"] = holding["currentValueKobo"] - holding["totalInvestedKobo"]
        if holding["totalInvestedKobo"] > 0:
            holding["totalReturnPct"] = round(holding["totalReturnKobo"] / holding["totalInvestedKobo"] * 100, 2)
    return holding

@app.post("/buy")
async def buy_gold(req: BuyGoldRequest):
    price_data = await get_live_gold_price()
    grams_purchased = req.amountKobo / price_data["pricePerGramKobo"]
    tx_id = f"GLD-{uuid.uuid4().hex[:12].upper()}"
    # Update holdings
    key = str(req.userId)
    if key not in _holdings:
        _holdings[key] = {"userId": req.userId, "grams": 0.0, "totalInvestedKobo": 0, "avgBuyPricePerGram": price_data["pricePerGramKobo"]}
    _holdings[key]["grams"] = round(_holdings[key]["grams"] + grams_purchased, 6)
    _holdings[key]["totalInvestedKobo"] += req.amountKobo
    _holdings[key]["avgBuyPricePerGram"] = int(_holdings[key]["totalInvestedKobo"] / _holdings[key]["grams"])
    # Record transaction
    tx = {
        "transactionId": tx_id,
        "type": "buy",
        "grams": round(grams_purchased, 6),
        "amountKobo": req.amountKobo,
        "pricePerGramKobo": price_data["pricePerGramKobo"],
        "status": "completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _transactions.setdefault(key, []).append(tx)
    logger.info(f"Gold purchase: userId={req.userId} grams={grams_purchased:.4f} amountKobo={req.amountKobo}")
    return tx

@app.post("/sell")
async def sell_gold(req: SellGoldRequest):
    key = str(req.userId)
    holding = _holdings.get(key)
    if not holding or holding["grams"] < req.grams:
        raise HTTPException(status_code=400, detail="Insufficient gold balance")
    price_data = await get_live_gold_price()
    proceeds_kobo = int(req.grams * price_data["pricePerGramKobo"] * 0.99)  # 1% spread
    tx_id = f"GLD-{uuid.uuid4().hex[:12].upper()}"
    _holdings[key]["grams"] = round(_holdings[key]["grams"] - req.grams, 6)
    tx = {
        "transactionId": tx_id,
        "type": "sell",
        "grams": req.grams,
        "proceedsKobo": proceeds_kobo,
        "pricePerGramKobo": price_data["pricePerGramKobo"],
        "status": "completed",
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    _transactions.setdefault(key, []).append(tx)
    return tx

@app.get("/history")
async def get_history(userId: int = Query(...), page: int = Query(1), limit: int = Query(20)):
    key = str(userId)
    txs = _transactions.get(key, [])
    start = (page - 1) * limit
    return {"transactions": txs[start:start + limit], "total": len(txs)}

@app.post("/sip/create")
async def create_sip(req: SIPPlanRequest):
    plan_id = f"SIP-{uuid.uuid4().hex[:10].upper()}"
    plan = {
        "planId": plan_id,
        "userId": req.userId,
        "monthlyAmountKobo": req.monthlyAmountKobo,
        "dayOfMonth": req.dayOfMonth,
        "durationMonths": req.durationMonths,
        "completedMonths": 0,
        "totalInvestedKobo": 0,
        "status": "active",
        "nextDebitDate": datetime.now(timezone.utc).replace(day=req.dayOfMonth).isoformat(),
        "createdAt": datetime.now(timezone.utc).isoformat(),
    }
    _sip_plans[plan_id] = plan
    return plan

@app.get("/sip/list")
async def list_sip_plans(userId: int = Query(...)):
    plans = [p for p in _sip_plans.values() if p["userId"] == userId]
    return {"plans": plans}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT)
