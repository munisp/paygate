"""
PayGate Cohort Analytics Service
Provides cohort retention analysis, LTV calculation, and churn prediction.
Uses PostgreSQL (not MySQL) — all SQL uses standard ANSI / PostgreSQL syntax.
"""
from __future__ import annotations
import os
import logging
from datetime import datetime, timedelta
from typing import Optional, List, Dict, Any
import numpy as np
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel
import sqlalchemy as sa
from sqlalchemy import text
import uvicorn

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("cohort-analytics")

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate Cohort Analytics", version="1.0.0")
setup_telemetry("cohort-analytics", app)

DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
engine = sa.create_engine(DATABASE_URL, pool_pre_ping=True, pool_size=5)

# ─── Models ──────────────────────────────────────────────────────────────────

class CohortRequest(BaseModel):
    merchant_id: Optional[str] = None
    cohort_period: str = "monthly"  # monthly | weekly
    periods: int = 12
    min_cohort_size: int = 5

class RetentionMatrix(BaseModel):
    cohorts: List[str]
    retention_data: List[List[Optional[float]]]
    cohort_sizes: List[int]

class LTVResponse(BaseModel):
    cohort: str
    avg_ltv: float
    median_ltv: float
    p90_ltv: float
    customer_count: int

class ChurnPrediction(BaseModel):
    customer_id: str
    churn_probability: float
    risk_level: str  # low | medium | high | critical
    last_transaction_days: int
    predicted_churn_date: Optional[str]

# ─── Helpers ─────────────────────────────────────────────────────────────────

def get_cohort_label(dt: datetime, period: str) -> str:
    if period == "weekly":
        return dt.strftime("%Y-W%V")
    return dt.strftime("%Y-%m")

def churn_risk(days_since_last_tx: int, avg_tx_interval: float) -> tuple[float, str]:
    """Simple rule-based churn scoring."""
    if avg_tx_interval <= 0:
        avg_tx_interval = 30
    ratio = days_since_last_tx / avg_tx_interval
    prob = min(1.0, max(0.0, (ratio - 1.0) / 3.0))
    if prob < 0.3:
        level = "low"
    elif prob < 0.6:
        level = "medium"
    elif prob < 0.85:
        level = "high"
    else:
        level = "critical"
    return round(prob, 3), level

# ─── Routes ──────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {"status": "ok", "service": "cohort-analytics"}

@app.post("/cohorts/retention")
def get_retention_matrix(req: CohortRequest) -> dict:
    """Build a cohort retention matrix from transaction data."""
    try:
        with engine.connect() as conn:
            # PostgreSQL syntax: NOW() - INTERVAL, no DATE_SUB
            query = text("""
                SELECT
                    t.customer_id,
                    MIN(t.created_at) OVER (PARTITION BY t.customer_id) AS first_tx_date,
                    t.created_at AS tx_date,
                    t.amount_kobo
                FROM transactions t
                WHERE t.status = 'success'
                  AND (:merchant_id IS NULL OR t.merchant_id = :merchant_id)
                  AND t.created_at >= NOW() - INTERVAL ':months months'
                ORDER BY t.customer_id, t.created_at
            """)
            rows = conn.execute(query, {
                "merchant_id": req.merchant_id,
                "months": req.periods + 1
            }).fetchall()

        if not rows:
            return _mock_retention()

        # Build cohort map
        customer_cohort: Dict[str, str] = {}
        cohort_customers: Dict[str, set] = {}
        cohort_period_activity: Dict[str, Dict[str, set]] = {}

        for row in rows:
            cid = str(row.customer_id)
            first_dt = row.first_tx_date if isinstance(row.first_tx_date, datetime) else datetime.fromisoformat(str(row.first_tx_date))
            tx_dt = row.tx_date if isinstance(row.tx_date, datetime) else datetime.fromisoformat(str(row.tx_date))

            cohort = get_cohort_label(first_dt, req.cohort_period)
            period = get_cohort_label(tx_dt, req.cohort_period)

            if cid not in customer_cohort:
                customer_cohort[cid] = cohort

            cohort_key = customer_cohort[cid]
            cohort_customers.setdefault(cohort_key, set()).add(cid)
            cohort_period_activity.setdefault(cohort_key, {}).setdefault(period, set()).add(cid)

        cohort_list = sorted(cohort_customers.keys())
        all_periods = sorted(set(
            p for periods in cohort_period_activity.values() for p in periods
        ))

        retention_data = []
        cohort_sizes = []

        for cohort in cohort_list:
            base_size = len(cohort_customers.get(cohort, set()))
            if base_size < req.min_cohort_size:
                continue
            cohort_sizes.append(base_size)
            row_data = []
            for period in all_periods:
                if period < cohort:
                    row_data.append(None)
                else:
                    active = len(cohort_period_activity.get(cohort, {}).get(period, set()))
                    row_data.append(round(active / base_size * 100, 1))
            retention_data.append(row_data)

        return {
            "cohorts": cohort_list,
            "periods": all_periods,
            "retention_data": retention_data,
            "cohort_sizes": cohort_sizes,
        }
    except Exception as e:
        logger.error(f"Retention matrix error: {e}")
        return _mock_retention()

@app.get("/cohorts/ltv")
def get_ltv_by_cohort(
    merchant_id: Optional[str] = Query(None),
    periods: int = Query(12),
    cohort_period: str = Query("monthly")
) -> List[dict]:
    """Calculate LTV per cohort."""
    try:
        with engine.connect() as conn:
            query = text("""
                SELECT
                    t.customer_id,
                    MIN(t.created_at) AS first_tx_date,
                    SUM(t.amount_kobo) / 100.0 AS total_spend
                FROM transactions t
                WHERE t.status = 'success'
                  AND (:merchant_id IS NULL OR t.merchant_id = :merchant_id)
                  AND t.created_at >= NOW() - INTERVAL ':months months'
                GROUP BY t.customer_id
            """)
            rows = conn.execute(query, {"merchant_id": merchant_id, "months": periods}).fetchall()

        cohort_spends: Dict[str, List[float]] = {}
        for row in rows:
            first_dt = row.first_tx_date if isinstance(row.first_tx_date, datetime) else datetime.fromisoformat(str(row.first_tx_date))
            cohort = get_cohort_label(first_dt, cohort_period)
            cohort_spends.setdefault(cohort, []).append(float(row.total_spend or 0))

        results = []
        for cohort, spends in sorted(cohort_spends.items()):
            arr = np.array(spends)
            results.append({
                "cohort": cohort,
                "avg_ltv": round(float(np.mean(arr)), 2),
                "median_ltv": round(float(np.median(arr)), 2),
                "p90_ltv": round(float(np.percentile(arr, 90)), 2),
                "customer_count": len(spends),
            })
        return results
    except Exception as e:
        logger.error(f"LTV error: {e}")
        return _mock_ltv()

@app.get("/cohorts/churn-predictions")
def get_churn_predictions(
    merchant_id: Optional[str] = Query(None),
    limit: int = Query(50),
    risk_level: Optional[str] = Query(None)
) -> List[dict]:
    """Predict churn risk for active customers."""
    try:
        with engine.connect() as conn:
            # PostgreSQL: use EXTRACT(EPOCH FROM ...) / 86400 for day differences
            query = text("""
                WITH tx_intervals AS (
                    SELECT
                        customer_id,
                        created_at,
                        LAG(created_at) OVER (PARTITION BY customer_id ORDER BY created_at) AS prev_tx
                    FROM transactions
                    WHERE status = 'success'
                      AND (:merchant_id IS NULL OR merchant_id = :merchant_id)
                      AND created_at >= NOW() - INTERVAL '12 months'
                ),
                customer_stats AS (
                    SELECT
                        customer_id,
                        MAX(created_at) AS last_tx_date,
                        COUNT(*) AS tx_count,
                        AVG(EXTRACT(EPOCH FROM (created_at - prev_tx)) / 86400) AS avg_interval_days
                    FROM tx_intervals
                    GROUP BY customer_id
                    HAVING COUNT(*) >= 2
                )
                SELECT customer_id, last_tx_date, tx_count, avg_interval_days
                FROM customer_stats
                ORDER BY last_tx_date ASC
                LIMIT :limit
            """)
            rows = conn.execute(query, {"merchant_id": merchant_id, "limit": limit * 2}).fetchall()

        predictions = []
        for row in rows:
            last_dt = row.last_tx_date if isinstance(row.last_tx_date, datetime) else datetime.fromisoformat(str(row.last_tx_date))
            days_since = (datetime.utcnow() - last_dt.replace(tzinfo=None)).days
            avg_interval = float(row.avg_interval_days or 30)
            prob, level = churn_risk(days_since, avg_interval)

            if risk_level and level != risk_level:
                continue

            predicted_churn = None
            if prob > 0.5:
                predicted_churn = (datetime.utcnow() + timedelta(days=max(0, int(avg_interval * 1.5 - days_since)))).strftime("%Y-%m-%d")

            predictions.append({
                "customer_id": str(row.customer_id),
                "churn_probability": prob,
                "risk_level": level,
                "last_transaction_days": days_since,
                "predicted_churn_date": predicted_churn,
            })

        return predictions[:limit]
    except Exception as e:
        logger.error(f"Churn prediction error: {e}")
        return _mock_churn()

# ─── Empty fallbacks (returned when DB is unavailable) ────────────────────────
# Return empty/zero-value structures so no synthetic data is served in production.
# Callers should surface a "data unavailable" state to the UI.

def _mock_retention() -> dict:
    """Return empty retention structure when DB is unavailable."""
    return {"cohorts": [], "periods": [], "retention_data": [], "cohort_sizes": []}

def _mock_ltv() -> List[dict]:
    """Return empty LTV list when DB is unavailable."""
    return []

def _mock_churn() -> List[dict]:
    """Return empty churn list when DB is unavailable."""
    return []

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
    port = int(os.getenv("PORT", "9015"))
    uvicorn.run(app, host="0.0.0.0", port=port, workers=4, log_level="warning")
