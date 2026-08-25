"""
PayGate AI Merchant Insights Service
Generates AI-powered business insights, cohort analytics, and predictive forecasting.
Uses the built-in LLM API, Postgres lakehouse, and Fluvio streaming.
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from typing import Dict, List, Optional

import asyncpg
import aiohttp
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("ai-insights")


import secrets as _secrets_mod
import sys as _sys_mod


def _require_secret_env(var_name):
    """Fail closed: no hardcoded default secrets (cips-gateway main.go:48-56 pattern).

    Production (ENV/APP_ENV=production) with the variable unset -> FATAL log + exit.
    Dev -> per-boot random value (secrets.token_hex) logged once; never a
    well-known default.
    """
    value = os.getenv(var_name, "")
    if value:
        return value
    env = (os.getenv("ENV") or os.getenv("APP_ENV") or "").strip().lower()
    if env in ("production", "prod"):
        logger.critical("FATAL: %s must be set when ENV=production -- refusing to serve", var_name)
        _sys_mod.exit(1)
    value = "dev-" + _secrets_mod.token_hex(16)
    logger.warning("%s unset -- generated per-boot dev value; set %s to a real secret", var_name, var_name)
    return value

# ─── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
BUILT_IN_FORGE_API_URL = os.getenv("BUILT_IN_FORGE_API_URL", "https://api.manus.im/v1")
BUILT_IN_FORGE_API_KEY = os.getenv("BUILT_IN_FORGE_API_KEY", "")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
SYNC_RELAY_URL = os.getenv("SYNC_RELAY_URL", "http://localhost:8090")
SYNC_RELAY_KEY = _require_secret_env("SYNC_RELAY_KEY")
PORT = int(os.getenv("PORT", "8098"))

# ─── Models ────────────────────────────────────────────────────────────────────

class InsightRequest(BaseModel):
    merchant_id: str
    period_days: int = 30
    insight_types: List[str] = ["revenue", "customers", "products", "risk"]


class CohortAnalysisRequest(BaseModel):
    merchant_id: str
    cohort_period: str = "monthly"  # "weekly" | "monthly"
    lookback_months: int = 6


class SettlementForecastRequest(BaseModel):
    merchant_id: str
    forecast_days: int = 7


# ─── Database helpers ──────────────────────────────────────────────────────────

_pool: Optional[asyncpg.Pool] = None


async def db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def get_merchant_transaction_summary(merchant_id: str, days: int) -> Dict:
    """Aggregate transaction metrics for a merchant over the last N days."""
    db = await db_pool()
    row = await db.fetchrow(
        """
        SELECT
            COUNT(*) AS total_transactions,
            SUM(amount_kobo) AS total_volume_kobo,
            AVG(amount_kobo) AS avg_transaction_kobo,
            COUNT(DISTINCT customer_id) AS unique_customers,
            COUNT(CASE WHEN status = 'failed' THEN 1 END) AS failed_transactions,
            COUNT(CASE WHEN status = 'completed' THEN 1 END) AS completed_transactions,
            MAX(amount_kobo) AS max_transaction_kobo,
            MIN(amount_kobo) FILTER (WHERE amount_kobo > 0) AS min_transaction_kobo
        FROM transactions
        WHERE merchant_id = $1
          AND created_at > NOW() - ($2 || ' days')::INTERVAL
        """,
        merchant_id, str(days),
    )
    return dict(row) if row else {}


async def get_revenue_trend(merchant_id: str, days: int) -> List[Dict]:
    """Get daily revenue trend for a merchant."""
    db = await db_pool()
    rows = await db.fetch(
        """
        SELECT
            DATE_TRUNC('day', created_at) AS day,
            COUNT(*) AS transaction_count,
            SUM(amount_kobo) AS volume_kobo,
            COUNT(DISTINCT customer_id) AS unique_customers
        FROM transactions
        WHERE merchant_id = $1
          AND created_at > NOW() - ($2 || ' days')::INTERVAL
          AND status = 'completed'
        GROUP BY 1
        ORDER BY 1 ASC
        """,
        merchant_id, str(days),
    )
    return [dict(r) for r in rows]


async def get_top_categories(merchant_id: str, days: int) -> List[Dict]:
    """Get top transaction categories for a merchant."""
    db = await db_pool()
    rows = await db.fetch(
        """
        SELECT
            COALESCE(category, 'general') AS category,
            COUNT(*) AS count,
            SUM(amount_kobo) AS volume_kobo
        FROM transactions
        WHERE merchant_id = $1
          AND created_at > NOW() - ($2 || ' days')::INTERVAL
          AND status = 'completed'
        GROUP BY 1
        ORDER BY volume_kobo DESC
        LIMIT 10
        """,
        merchant_id, str(days),
    )
    return [dict(r) for r in rows]


async def get_cohort_data(merchant_id: str, lookback_months: int) -> List[Dict]:
    """Get cohort retention data for a merchant."""
    db = await db_pool()
    rows = await db.fetch(
        """
        WITH first_txn AS (
            SELECT
                customer_id,
                DATE_TRUNC('month', MIN(created_at)) AS cohort_month
            FROM transactions
            WHERE merchant_id = $1 AND status = 'completed'
            GROUP BY customer_id
        ),
        activity AS (
            SELECT
                t.customer_id,
                f.cohort_month,
                DATE_TRUNC('month', t.created_at) AS activity_month
            FROM transactions t
            JOIN first_txn f ON t.customer_id = f.customer_id
            WHERE t.merchant_id = $1 AND t.status = 'completed'
        )
        SELECT
            cohort_month,
            activity_month,
            COUNT(DISTINCT customer_id) AS active_customers,
            EXTRACT(EPOCH FROM (activity_month - cohort_month)) / 2592000 AS months_since_first
        FROM activity
        WHERE cohort_month > NOW() - ($2 || ' months')::INTERVAL
        GROUP BY 1, 2
        ORDER BY 1, 2
        """,
        merchant_id, str(lookback_months),
    )
    return [dict(r) for r in rows]


async def get_settlement_history(merchant_id: str, days: int) -> List[Dict]:
    """Get settlement history for forecasting."""
    db = await db_pool()
    rows = await db.fetch(
        """
        SELECT
            DATE_TRUNC('day', settled_at) AS settlement_date,
            SUM(amount_kobo) AS settled_kobo,
            COUNT(*) AS batch_count,
            EXTRACT(DOW FROM settled_at) AS day_of_week,
            EXTRACT(HOUR FROM settled_at) AS settlement_hour
        FROM settlements
        WHERE merchant_id = $1
          AND settled_at > NOW() - ($2 || ' days')::INTERVAL
        GROUP BY 1, 4, 5
        ORDER BY 1 ASC
        """,
        merchant_id, str(days),
    )
    return [dict(r) for r in rows]


# ─── LLM integration ──────────────────────────────────────────────────────────

async def invoke_llm(messages: List[Dict], response_format: Optional[Dict] = None) -> str:
    """Call the built-in Forge LLM API."""
    async with aiohttp.ClientSession() as session:
        payload = {
            "model": "gpt-4o-mini",
            "messages": messages,
        }
        if response_format:
            payload["response_format"] = response_format

        async with session.post(
            f"{BUILT_IN_FORGE_API_URL}/chat/completions",
            json=payload,
            headers={
                "Authorization": f"Bearer {BUILT_IN_FORGE_API_KEY}",
                "Content-Type": "application/json",
            },
            timeout=aiohttp.ClientTimeout(total=60),
        ) as resp:
            if resp.status != 200:
                text = await resp.text()
                raise ValueError(f"LLM API error {resp.status}: {text}")
            data = await resp.json()
            return data["choices"][0]["message"]["content"]


# ─── Insight generation ────────────────────────────────────────────────────────

async def generate_merchant_insights(merchant_id: str, period_days: int) -> Dict:
    """Generate AI-powered insights for a merchant."""
    # Gather data
    summary = await get_merchant_transaction_summary(merchant_id, period_days)
    trend = await get_revenue_trend(merchant_id, period_days)
    categories = await get_top_categories(merchant_id, period_days)

    if not summary or not summary.get("total_transactions"):
        return {
            "merchant_id": merchant_id,
            "period_days": period_days,
            "insights": [],
            "summary": "Insufficient data for insights generation.",
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }

    # Prepare context for LLM
    total_vol_ngn = (summary.get("total_volume_kobo") or 0) / 100
    avg_tx_ngn = (summary.get("avg_transaction_kobo") or 0) / 100
    failure_rate = 0
    if summary.get("total_transactions", 0) > 0:
        failure_rate = (summary.get("failed_transactions", 0) / summary["total_transactions"]) * 100

    # Compute week-over-week trend
    mid = len(trend) // 2
    first_half_vol = sum(r.get("volume_kobo", 0) for r in trend[:mid]) if trend else 0
    second_half_vol = sum(r.get("volume_kobo", 0) for r in trend[mid:]) if trend else 0
    wow_change = ((second_half_vol - first_half_vol) / max(first_half_vol, 1)) * 100

    context = f"""
Merchant ID: {merchant_id}
Period: Last {period_days} days

Transaction Metrics:
- Total transactions: {summary.get('total_transactions', 0):,}
- Total volume: ₦{total_vol_ngn:,.2f}
- Average transaction: ₦{avg_tx_ngn:,.2f}
- Unique customers: {summary.get('unique_customers', 0):,}
- Failure rate: {failure_rate:.1f}%
- Volume trend (first half vs second half): {wow_change:+.1f}%

Top Categories:
{json.dumps([{"category": c["category"], "volume_ngn": c["volume_kobo"]/100, "count": c["count"]} for c in categories[:5]], indent=2)}
"""

    messages = [
        {
            "role": "system",
            "content": (
                "You are a financial analyst for PayGate, a Nigerian payment platform. "
                "Analyze merchant transaction data and provide 3-5 specific, actionable insights. "
                "Focus on: revenue trends, customer behavior, risk indicators, and growth opportunities. "
                "Be specific with numbers. Use Nigerian context (NGN, local market patterns). "
                "Format as JSON with fields: insights (array of {title, description, type, priority, action_item})."
            ),
        },
        {"role": "user", "content": f"Analyze this merchant's performance:\n{context}"},
    ]

    try:
        llm_response = await invoke_llm(messages, response_format={"type": "json_object"})
        insights_data = json.loads(llm_response)
    except Exception as e:
        logger.error(f"LLM insight generation failed: {e}")
        insights_data = {
            "insights": [
                {
                    "title": "Revenue Trend",
                    "description": f"Volume changed {wow_change:+.1f}% in the second half of the period.",
                    "type": "revenue",
                    "priority": "medium",
                    "action_item": "Review pricing and promotions to maintain growth momentum.",
                }
            ]
        }

    return {
        "merchant_id": merchant_id,
        "period_days": period_days,
        "insights": insights_data.get("insights", []),
        "metrics_summary": {
            "total_volume_ngn": total_vol_ngn,
            "total_transactions": summary.get("total_transactions", 0),
            "unique_customers": summary.get("unique_customers", 0),
            "failure_rate_pct": round(failure_rate, 2),
            "wow_volume_change_pct": round(wow_change, 2),
        },
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


async def generate_settlement_forecast(merchant_id: str, forecast_days: int) -> Dict:
    """Predict settlement timing using historical patterns."""
    history = await get_settlement_history(merchant_id, 90)

    if not history:
        return {
            "merchant_id": merchant_id,
            "forecast": [],
            "confidence": "low",
            "note": "Insufficient settlement history for forecasting.",
        }

    # Simple moving average forecast
    recent_daily_avg = sum(r.get("settled_kobo", 0) for r in history[-30:]) / max(len(history[-30:]), 1)

    # Day-of-week adjustment factors
    dow_factors = {}
    for r in history:
        dow = int(r.get("day_of_week", 1))
        if dow not in dow_factors:
            dow_factors[dow] = []
        dow_factors[dow].append(r.get("settled_kobo", 0))

    dow_avg = {dow: sum(vals) / len(vals) for dow, vals in dow_factors.items() if vals}
    overall_avg = sum(dow_avg.values()) / max(len(dow_avg), 1)

    forecast = []
    for i in range(1, forecast_days + 1):
        future_date = datetime.now(timezone.utc) + timedelta(days=i)
        dow = future_date.weekday() + 1  # 1=Monday
        factor = dow_avg.get(dow, overall_avg) / max(overall_avg, 1)
        predicted_kobo = int(recent_daily_avg * factor)

        # Weekends typically have lower settlement
        if dow in (6, 7):
            predicted_kobo = int(predicted_kobo * 0.3)

        forecast.append({
            "date": future_date.strftime("%Y-%m-%d"),
            "day_of_week": future_date.strftime("%A"),
            "predicted_settlement_kobo": predicted_kobo,
            "predicted_settlement_ngn": predicted_kobo / 100,
            "confidence": "medium" if len(history) >= 30 else "low",
        })

    return {
        "merchant_id": merchant_id,
        "forecast": forecast,
        "based_on_days": len(history),
        "confidence": "medium" if len(history) >= 30 else "low",
        "generated_at": datetime.now(timezone.utc).isoformat(),
    }


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate AI Insights", version="1.0.0")


@app.post("/insights")
async def get_insights(req: InsightRequest):
    try:
        return await generate_merchant_insights(req.merchant_id, req.period_days)
    except Exception as e:
        logger.error(f"Insights generation failed: {e}")
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/cohort-analysis")
async def get_cohort_analysis(req: CohortAnalysisRequest):
    try:
        cohort_data = await get_cohort_data(req.merchant_id, req.lookback_months)
        return {
            "merchant_id": req.merchant_id,
            "cohort_period": req.cohort_period,
            "cohorts": cohort_data,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/settlement-forecast")
async def get_settlement_forecast(req: SettlementForecastRequest):
    try:
        return await generate_settlement_forecast(req.merchant_id, req.forecast_days)
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-insights", "timestamp": datetime.now(timezone.utc).isoformat()}


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
