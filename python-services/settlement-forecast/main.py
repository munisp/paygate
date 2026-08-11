"""
Settlement Forecast Microservice
Predicts next settlement amount and date for merchants using rolling 30-day history.
Exposes: GET /forecast?merchant_id=<id>&days=7
"""
import os
import json
import logging
from datetime import datetime, timedelta, timezone
from typing import Optional
import psycopg2
from psycopg2.extras import RealDictCursor
from flask import Flask, jsonify, request

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
log = logging.getLogger("settlement-forecast")

app = Flask(__name__)

# ─── Mandatory internal service-to-service auth (fail closed) ───────────────
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks.
import hmac as _hmac_mod

_INTERNAL_AUTH_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@app.before_request
def _require_internal_api_key():
    if request.path in _AUTH_EXEMPT_PATHS:
        return None
    if not _INTERNAL_AUTH_KEY:
        return jsonify({"detail": "Service misconfigured: INTERNAL_API_KEY not set"}), 503
    if not _hmac_mod.compare_digest(
        request.headers.get("x-internal-key", ""), _INTERNAL_AUTH_KEY
    ):
        return jsonify({"detail": "Unauthorized"}), 401
    return None


DATABASE_URL = os.environ.get("DATABASE_URL", "")


def get_conn():
    return psycopg2.connect(DATABASE_URL, cursor_factory=RealDictCursor)


@app.route("/health")
def health():
    return jsonify({"status": "ok", "service": "settlement-forecast"})


@app.route("/forecast")
def forecast():
    merchant_id = request.args.get("merchant_id")
    days = int(request.args.get("days", 7))
    if not merchant_id:
        return jsonify({"error": "merchant_id required"}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        # Get last 30 days of completed transactions
        cur.execute(
            """
            SELECT DATE(created_at) AS day,
                   SUM(net_amount) AS net_kobo,
                   COUNT(*) AS txn_count
            FROM transactions
            WHERE merchant_id = %s
              AND status = 'completed'
              AND created_at >= NOW() - INTERVAL '30 days'
            GROUP BY DATE(created_at)
            ORDER BY day
            """,
            (merchant_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        if not rows:
            return jsonify({
                "merchant_id": merchant_id,
                "forecast_days": days,
                "daily_avg_kobo": 0,
                "projected_total_kobo": 0,
                "confidence": "low",
                "next_settlement_date": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d"),
                "data_points": 0,
            })

        daily_amounts = [float(r["net_kobo"] or 0) for r in rows]
        avg = sum(daily_amounts) / len(daily_amounts)
        projected = avg * days

        # Confidence based on data points
        data_points = len(rows)
        confidence = "high" if data_points >= 20 else "medium" if data_points >= 7 else "low"

        # Simple trend: compare last 7 days vs prior 7 days
        recent = daily_amounts[-7:] if len(daily_amounts) >= 7 else daily_amounts
        prior = daily_amounts[-14:-7] if len(daily_amounts) >= 14 else daily_amounts
        recent_avg = sum(recent) / len(recent) if recent else avg
        prior_avg = sum(prior) / len(prior) if prior else avg
        trend_pct = ((recent_avg - prior_avg) / prior_avg * 100) if prior_avg > 0 else 0

        return jsonify({
            "merchant_id": merchant_id,
            "forecast_days": days,
            "daily_avg_kobo": round(avg),
            "projected_total_kobo": round(projected),
            "confidence": confidence,
            "trend_pct": round(trend_pct, 2),
            "next_settlement_date": (datetime.now(timezone.utc) + timedelta(days=1)).strftime("%Y-%m-%d"),
            "data_points": data_points,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        log.error("forecast error: %s", e)
        return jsonify({"error": str(e)}), 500


@app.route("/cohort")
def cohort():
    """Cohort analysis: customer retention by signup month."""
    merchant_id = request.args.get("merchant_id")
    if not merchant_id:
        return jsonify({"error": "merchant_id required"}), 400

    try:
        conn = get_conn()
        cur = conn.cursor()
        cur.execute(
            """
            SELECT
                TO_CHAR(c.created_at, 'YYYY-MM') AS cohort_month,
                COUNT(DISTINCT c.id) AS total_customers,
                COUNT(DISTINCT CASE WHEN t.created_at >= c.created_at + INTERVAL '30 days' THEN c.id END) AS retained_30d,
                COUNT(DISTINCT CASE WHEN t.created_at >= c.created_at + INTERVAL '90 days' THEN c.id END) AS retained_90d
            FROM customers c
            LEFT JOIN transactions t ON t.customer_email = c.email AND t.merchant_id = c.merchant_id
            WHERE c.merchant_id = %s
              AND c.created_at >= NOW() - INTERVAL '12 months'
            GROUP BY cohort_month
            ORDER BY cohort_month
            """,
            (merchant_id,),
        )
        rows = cur.fetchall()
        cur.close()
        conn.close()

        cohorts = []
        for r in rows:
            total = r["total_customers"] or 1
            cohorts.append({
                "cohort_month": r["cohort_month"],
                "total_customers": r["total_customers"],
                "retention_30d_pct": round((r["retained_30d"] or 0) / total * 100, 1),
                "retention_90d_pct": round((r["retained_90d"] or 0) / total * 100, 1),
            })

        return jsonify({
            "merchant_id": merchant_id,
            "cohorts": cohorts,
            "generated_at": datetime.now(timezone.utc).isoformat(),
        })
    except Exception as e:
        log.error("cohort error: %s", e)
        return jsonify({"error": str(e)}), 500


if __name__ == "__main__":
    port = int(os.environ.get("PORT", 9010))
    log.info("settlement-forecast starting on port %d", port)
    app.run(host="0.0.0.0", port=port)
