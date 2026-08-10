"""
PayGate Digital Gold Microservice
Handles digital gold purchases, sales, SIP plans, and price feeds.
Integrates with the GoldTech price API and persists holdings in Postgres
(digital_gold_holdings / digital_gold_transactions / gold_sip_plans).

FAIL-LOUD POLICY:
  * Trades NEVER execute against a fallback/mock price. If the GoldTech price
    feed is unavailable, /buy and /sell return HTTP 503.
  * Holdings/transactions/SIP plans are persisted to DATABASE_URL. If the DB
    is unavailable, mutating endpoints return HTTP 503 — customer gold
    positions are never silently kept in process memory.
"""
import logging
import os
import uuid
from datetime import datetime, timezone
from typing import Optional

import aiohttp
import asyncpg
from fastapi import FastAPI, HTTPException, Query
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("digital-gold")

# ─── Configuration ─────────────────────────────────────────────────────────────
# Compose sets GOLDTECH_BASE_URL; GOLDTECH_API_URL is accepted as a legacy
# alias so older deployments keep working.
GOLDTECH_API_URL = (
    os.getenv("GOLDTECH_BASE_URL")
    or os.getenv("GOLDTECH_API_URL")
    or "https://api.goldtech.ng/v1"
).rstrip("/")
GOLDTECH_API_KEY = os.getenv("GOLDTECH_API_KEY", "")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
DATABASE_URL = os.getenv("DATABASE_URL", "")
PORT = int(os.getenv("PORT", "9020"))

app = FastAPI(title="PayGate Digital Gold Service", version="1.1.0")
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

# ─── Database pool ─────────────────────────────────────────────────────────────
_pool: Optional[asyncpg.Pool] = None


async def get_pool() -> Optional[asyncpg.Pool]:
    global _pool
    if _pool is None:
        if not DATABASE_URL:
            logger.error("DATABASE_URL is not set — gold holdings cannot be persisted")
            return None
        try:
            _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
        except Exception as e:
            logger.error(f"DB pool creation failed: {e}")
    return _pool


async def require_pool() -> asyncpg.Pool:
    pool = await get_pool()
    if pool is None:
        raise HTTPException(
            status_code=503,
            detail="Gold holdings store unavailable — refusing to operate on non-durable state",
        )
    return pool

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

# ─── Price feed ────────────────────────────────────────────────────────────────
async def get_live_gold_price() -> Optional[dict]:
    """Fetch the live gold price from the GoldTech API.

    Returns None when the feed is unconfigured or unreachable. There is NO
    mock fallback: a fabricated price must never settle a real-money trade.
    """
    if not GOLDTECH_API_KEY:
        logger.error("GOLDTECH_API_KEY is not set — live price feed unavailable")
        return None
    try:
        async with aiohttp.ClientSession() as session:
            async with session.get(
                f"{GOLDTECH_API_URL}/price",
                headers={"X-API-Key": GOLDTECH_API_KEY},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    data["source"] = "goldtech"
                    return data
                body = await resp.text()
                logger.error(f"GoldTech price feed HTTP {resp.status}: {body[:200]}")
    except Exception as e:
        logger.error(f"GoldTech price fetch failed: {e}")
    return None


async def require_live_gold_price() -> dict:
    price = await get_live_gold_price()
    if price is None or price.get("pricePerGramKobo") is None:
        raise HTTPException(
            status_code=503,
            detail="Live gold price unavailable (GoldTech feed down or unconfigured). "
                   "Trades are blocked rather than executed at a fabricated price.",
        )
    return price

# ─── Routes ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    pool = await get_pool()
    return {
        "status": "ok" if pool else "degraded",
        "service": "digital-gold",
        "db_configured": bool(DATABASE_URL),
        "price_feed_configured": bool(GOLDTECH_API_KEY),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/price")
async def get_price():
    price = await get_live_gold_price()
    if price is None:
        raise HTTPException(status_code=503, detail="Live gold price unavailable — no fallback price is served")
    return price

@app.get("/holdings")
async def get_holdings(userId: int = Query(...)):
    pool = await require_pool()
    merchant_id = str(userId)
    async with pool.acquire() as c:
        row = await c.fetchrow(
            "SELECT * FROM digital_gold_holdings WHERE merchant_id=$1", merchant_id
        )
    if not row:
        return {
            "userId": userId,
            "grams": 0.0,
            "currentValueKobo": 0,
            "totalInvestedKobo": 0,
            "totalReturnKobo": 0,
            "totalReturnPct": 0.0,
            "avgBuyPricePerGram": 0,
            "lastUpdated": None,
        }
    grams = float(row["gold_grams"])
    avg_price = row["avg_purchase_price_per_gram"] or 0
    total_invested = int(round(grams * avg_price)) if avg_price else 0
    price_data = await get_live_gold_price()
    price_stale = price_data is None
    if price_stale:
        # Display only: show the last persisted valuation, explicitly marked
        # stale. Trading endpoints fail closed separately.
        price_per_gram = row["current_price_per_gram"] or 0
        current_value = row["current_value_kobo"] or 0
    else:
        price_per_gram = price_data["pricePerGramKobo"]
        current_value = int(grams * price_per_gram)
    total_return = current_value - total_invested
    return {
        "userId": userId,
        "grams": grams,
        "currentValueKobo": current_value,
        "totalInvestedKobo": total_invested,
        "totalReturnKobo": total_return,
        "totalReturnPct": round(total_return / total_invested * 100, 2) if total_invested > 0 else 0.0,
        "avgBuyPricePerGram": avg_price,
        "price_stale": price_stale,
        "lastUpdated": row["last_updated"].isoformat() if row["last_updated"] else None,
    }

@app.post("/buy")
async def buy_gold(req: BuyGoldRequest):
    pool = await require_pool()
    price_data = await require_live_gold_price()
    price_per_gram = int(price_data["pricePerGramKobo"])
    if price_per_gram <= 0:
        raise HTTPException(status_code=503, detail="GoldTech returned an invalid price — refusing to trade")
    grams_purchased = req.amountKobo / price_per_gram
    tx_id = f"GLD-{uuid.uuid4().hex[:12].upper()}"
    merchant_id = str(req.userId)
    now = datetime.now(timezone.utc)

    try:
        async with pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow(
                    "SELECT * FROM digital_gold_holdings WHERE merchant_id=$1 FOR UPDATE",
                    merchant_id,
                )
                if row:
                    new_grams = float(row["gold_grams"]) + grams_purchased
                    old_cost = float(row["gold_grams"]) * (row["avg_purchase_price_per_gram"] or 0)
                    new_avg = int((old_cost + req.amountKobo) / new_grams) if new_grams > 0 else 0
                    await c.execute(
                        """UPDATE digital_gold_holdings
                           SET gold_grams=$2, purchased_grams=$3,
                               avg_purchase_price_per_gram=$4,
                               current_price_per_gram=$5,
                               current_value_kobo=$6,
                               unrealized_pnl_kobo=$7,
                               last_updated=$8
                           WHERE merchant_id=$1""",
                        merchant_id, f"{new_grams:.6f}",
                        f"{float(row['purchased_grams']) + grams_purchased:.6f}",
                        new_avg, price_per_gram, int(new_grams * price_per_gram),
                        int(new_grams * price_per_gram) - int(new_grams * new_avg), now,
                    )
                else:
                    await c.execute(
                        """INSERT INTO digital_gold_holdings
                           (id, merchant_id, gold_grams, purchased_grams,
                            avg_purchase_price_per_gram, current_price_per_gram,
                            current_value_kobo, unrealized_pnl_kobo, last_updated, created_at)
                           VALUES ($1,$2,$3,$4,$5,$6,$7,0,$8,$8)""",
                        str(uuid.uuid4()), merchant_id, f"{grams_purchased:.6f}",
                        f"{grams_purchased:.6f}", price_per_gram, price_per_gram,
                        req.amountKobo, now,
                    )
                await c.execute(
                    """INSERT INTO digital_gold_transactions
                       (id, merchant_id, type, gold_grams, amount_kobo, price_per_gram, status, reference, created_at)
                       VALUES ($1,$2,'buy',$3,$4,$5,'completed',$6,$7)""",
                    str(uuid.uuid4()), merchant_id, f"{grams_purchased:.6f}",
                    req.amountKobo, price_per_gram, tx_id, now,
                )
    except Exception as e:
        logger.error(f"Gold purchase persistence failed: {e}")
        raise HTTPException(status_code=503, detail=f"Could not persist gold purchase: {e}")

    logger.info(f"Gold purchase: userId={req.userId} grams={grams_purchased:.4f} amountKobo={req.amountKobo}")
    return {
        "transactionId": tx_id,
        "type": "buy",
        "grams": round(grams_purchased, 6),
        "amountKobo": req.amountKobo,
        "pricePerGramKobo": price_per_gram,
        "priceSource": "goldtech",
        "status": "completed",
        "timestamp": now.isoformat(),
    }

@app.post("/sell")
async def sell_gold(req: SellGoldRequest):
    pool = await require_pool()
    price_data = await require_live_gold_price()
    price_per_gram = int(price_data["pricePerGramKobo"])
    proceeds_kobo = int(req.grams * price_per_gram * 0.99)  # 1% spread
    tx_id = f"GLD-{uuid.uuid4().hex[:12].upper()}"
    merchant_id = str(req.userId)
    now = datetime.now(timezone.utc)

    try:
        async with pool.acquire() as c:
            async with c.transaction():
                row = await c.fetchrow(
                    "SELECT * FROM digital_gold_holdings WHERE merchant_id=$1 FOR UPDATE",
                    merchant_id,
                )
                if not row or float(row["gold_grams"]) < req.grams:
                    raise HTTPException(status_code=400, detail="Insufficient gold balance")
                new_grams = float(row["gold_grams"]) - req.grams
                avg_price = row["avg_purchase_price_per_gram"] or 0
                await c.execute(
                    """UPDATE digital_gold_holdings
                       SET gold_grams=$2, current_price_per_gram=$3,
                           current_value_kobo=$4, unrealized_pnl_kobo=$5, last_updated=$6
                       WHERE merchant_id=$1""",
                    merchant_id, f"{new_grams:.6f}", price_per_gram,
                    int(new_grams * price_per_gram),
                    int(new_grams * price_per_gram) - int(new_grams * avg_price), now,
                )
                await c.execute(
                    """INSERT INTO digital_gold_transactions
                       (id, merchant_id, type, gold_grams, amount_kobo, price_per_gram, status, reference, created_at)
                       VALUES ($1,$2,'sell',$3,$4,$5,'completed',$6,$7)""",
                    str(uuid.uuid4()), merchant_id, f"{req.grams:.6f}",
                    proceeds_kobo, price_per_gram, tx_id, now,
                )
    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Gold sale persistence failed: {e}")
        raise HTTPException(status_code=503, detail=f"Could not persist gold sale: {e}")

    return {
        "transactionId": tx_id,
        "type": "sell",
        "grams": req.grams,
        "proceedsKobo": proceeds_kobo,
        "pricePerGramKobo": price_per_gram,
        "priceSource": "goldtech",
        "status": "completed",
        "timestamp": now.isoformat(),
    }

@app.get("/history")
async def get_history(userId: int = Query(...), page: int = Query(1), limit: int = Query(20)):
    pool = await require_pool()
    merchant_id = str(userId)
    async with pool.acquire() as c:
        rows = await c.fetch(
            """SELECT reference AS "transactionId", type, gold_grams AS grams,
                      amount_kobo AS "amountKobo", price_per_gram AS "pricePerGramKobo",
                      status, created_at AS "timestamp"
               FROM digital_gold_transactions
               WHERE merchant_id=$1 ORDER BY created_at DESC
               LIMIT $2 OFFSET $3""",
            merchant_id, limit, (page - 1) * limit,
        )
        total = await c.fetchval(
            "SELECT COUNT(*) FROM digital_gold_transactions WHERE merchant_id=$1", merchant_id
        )
    txs = [dict(r) for r in rows]
    for t in txs:
        if t.get("timestamp"):
            t["timestamp"] = t["timestamp"].isoformat()
    return {"transactions": txs, "total": total or 0}

@app.post("/sip/create")
async def create_sip(req: SIPPlanRequest):
    pool = await require_pool()
    plan_id = f"SIP-{uuid.uuid4().hex[:10].upper()}"
    now = datetime.now(timezone.utc)
    try:
        next_run = now.replace(day=req.dayOfMonth)
    except ValueError:
        next_run = now
    try:
        async with pool.acquire() as c:
            await c.execute(
                """INSERT INTO gold_sip_plans
                   (id, merchant_id, amount_kobo, frequency, status, next_run_at,
                    total_invested_kobo, total_gold_grams, created_at, updated_at)
                   VALUES ($1,$2,$3,'monthly','active',$4,0,'0',$5,$5)""",
                str(uuid.uuid4()), str(req.userId), req.monthlyAmountKobo, next_run, now,
            )
    except Exception as e:
        logger.error(f"SIP plan persistence failed: {e}")
        raise HTTPException(status_code=503, detail=f"Could not persist SIP plan: {e}")
    return {
        "planId": plan_id,
        "userId": req.userId,
        "monthlyAmountKobo": req.monthlyAmountKobo,
        "dayOfMonth": req.dayOfMonth,
        "durationMonths": req.durationMonths,
        "completedMonths": 0,
        "totalInvestedKobo": 0,
        "status": "active",
        "nextDebitDate": next_run.isoformat(),
        "createdAt": now.isoformat(),
    }

@app.get("/sip/list")
async def list_sip_plans(userId: int = Query(...)):
    pool = await require_pool()
    async with pool.acquire() as c:
        rows = await c.fetch(
            "SELECT * FROM gold_sip_plans WHERE merchant_id=$1 ORDER BY created_at DESC",
            str(userId),
        )
    plans = []
    for r in rows:
        plans.append({
            "planId": r["id"],
            "userId": userId,
            "monthlyAmountKobo": r["amount_kobo"],
            "frequency": r["frequency"],
            "status": r["status"],
            "totalInvestedKobo": r["total_invested_kobo"] or 0,
            "totalGoldGrams": float(r["total_gold_grams"] or 0),
            "nextDebitDate": r["next_run_at"].isoformat() if r["next_run_at"] else None,
            "createdAt": r["created_at"].isoformat() if r["created_at"] else None,
        })
    return {"plans": plans}

if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=PORT, workers=4, log_level="warning")
