"""
PayGate AML Transaction Monitoring Engine
Real-time AML rule engine consuming Kafka transaction events.
Uses Redis for velocity checks, Postgres for case management,
and Permify for policy enforcement.
"""
import asyncio
import json
import logging
import os
import uuid
from datetime import datetime, timezone, timedelta
from enum import Enum
from typing import Dict, List, Optional, Tuple

import aiohttp
import asyncpg
import redis.asyncio as aioredis
from confluent_kafka import Consumer, KafkaError
from fastapi import FastAPI, HTTPException, Query
from pydantic import BaseModel

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("aml-monitor")

# ─── Configuration ─────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
KAFKA_BOOTSTRAP_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "aml-monitor")
PERMIFY_URL = os.getenv("PERMIFY_URL", "http://localhost:3476")
PERMIFY_API_KEY = os.getenv("PERMIFY_API_KEY", "permify-api-key-default")
PORT = int(os.getenv("PORT", "8097"))

# ─── AML Rule Thresholds ───────────────────────────────────────────────────────
RULES = {
    "velocity_1h": {
        "description": "More than 10 transactions in 1 hour",
        "max_count": 10,
        "window_seconds": 3600,
        "risk_score": 40,
        "action": "flag",
    },
    "velocity_24h": {
        "description": "More than 50 transactions in 24 hours",
        "max_count": 50,
        "window_seconds": 86400,
        "risk_score": 50,
        "action": "flag",
    },
    "large_transaction": {
        "description": "Single transaction above ₦5,000,000",
        "threshold_kobo": 500_000_000,
        "risk_score": 60,
        "action": "review",
    },
    "daily_volume": {
        "description": "Daily volume exceeds ₦10,000,000",
        "threshold_kobo": 1_000_000_000,
        "window_seconds": 86400,
        "risk_score": 70,
        "action": "review",
    },
    "round_amount": {
        "description": "Suspiciously round amounts (structuring indicator)",
        "risk_score": 20,
        "action": "flag",
    },
    "rapid_succession": {
        "description": "5+ transactions within 5 minutes",
        "max_count": 5,
        "window_seconds": 300,
        "risk_score": 55,
        "action": "review",
    },
    "new_account_large_tx": {
        "description": "Account < 30 days old with transaction > ₦500,000",
        "account_age_days": 30,
        "threshold_kobo": 50_000_000,
        "risk_score": 65,
        "action": "review",
    },
    "cross_border_high_value": {
        "description": "Cross-border transaction above ₦2,000,000",
        "threshold_kobo": 200_000_000,
        "risk_score": 75,
        "action": "block",
    },
    "ctr_threshold": {
        "description": "Cash Transaction Report: single cash transaction ≥ ₦5,000,000 (CBN requirement)",
        "threshold_kobo": 500_000_000,
        "risk_score": 80,
        "action": "ctr_report",
    },
    "str_pattern": {
        "description": "Suspicious Transaction Report: multiple transactions just below CTR threshold",
        "threshold_kobo": 490_000_000,
        "count_window": 3,
        "window_seconds": 86400,
        "risk_score": 85,
        "action": "str_report",
    },
}


class AlertSeverity(str, Enum):
    LOW = "low"
    MEDIUM = "medium"
    HIGH = "high"
    CRITICAL = "critical"


class AMLAlert(BaseModel):
    alert_id: str
    transaction_id: str
    merchant_id: str
    customer_id: Optional[str]
    rule_id: str
    rule_description: str
    risk_score: int
    severity: AlertSeverity
    action: str
    amount_kobo: int
    currency: str
    triggered_at: datetime
    status: str = "open"
    notes: Optional[str]


class AMLCaseUpdateRequest(BaseModel):
    alert_id: str
    status: str  # "open" | "under_review" | "cleared" | "escalated" | "reported"
    notes: str
    reviewed_by: str


# ─── Redis velocity helpers ────────────────────────────────────────────────────

_redis: Optional[aioredis.Redis] = None


async def get_redis() -> aioredis.Redis:
    global _redis
    if _redis is None:
        _redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
    return _redis


async def check_velocity(entity_id: str, rule_id: str, window_seconds: int, max_count: int) -> Tuple[bool, int]:
    """Check if entity has exceeded velocity threshold. Returns (exceeded, current_count)."""
    r = await get_redis()
    key = f"aml:velocity:{rule_id}:{entity_id}"
    now = datetime.now(timezone.utc).timestamp()
    window_start = now - window_seconds

    # Sliding window using sorted set
    pipe = r.pipeline()
    pipe.zremrangebyscore(key, 0, window_start)
    pipe.zadd(key, {f"{now}:{uuid.uuid4()}": now})
    pipe.zcard(key)
    pipe.expire(key, window_seconds + 60)
    results = await pipe.execute()

    current_count = results[2]
    return current_count > max_count, current_count


async def get_volume_in_window(entity_id: str, window_seconds: int) -> int:
    """Get total transaction volume for entity in window (kobo)."""
    r = await get_redis()
    key = f"aml:volume:{entity_id}:{window_seconds}"
    val = await r.get(key)
    return int(val) if val else 0


async def add_volume(entity_id: str, amount_kobo: int, window_seconds: int):
    """Add transaction amount to entity volume tracker."""
    r = await get_redis()
    key = f"aml:volume:{entity_id}:{window_seconds}"
    pipe = r.pipeline()
    pipe.incrby(key, amount_kobo)
    pipe.expire(key, window_seconds + 60)
    await pipe.execute()


# ─── AML Rule Engine ───────────────────────────────────────────────────────────

async def evaluate_transaction(event: dict) -> List[AMLAlert]:
    """Evaluate a transaction event against all AML rules."""
    alerts: List[AMLAlert] = []
    tx_id = event.get("transaction_id", event.get("id", ""))
    merchant_id = event.get("merchant_id", "")
    customer_id = event.get("customer_id", "")
    amount_kobo = int(event.get("amount_kobo", 0))
    currency = event.get("currency", "NGN")
    is_cross_border = event.get("is_cross_border", False)
    payment_type = event.get("payment_type", "")
    now = datetime.now(timezone.utc)

    def make_alert(rule_id: str, notes: str = None) -> AMLAlert:
        rule = RULES[rule_id]
        score = rule["risk_score"]
        severity = (
            AlertSeverity.CRITICAL if score >= 80 else
            AlertSeverity.HIGH if score >= 65 else
            AlertSeverity.MEDIUM if score >= 40 else
            AlertSeverity.LOW
        )
        return AMLAlert(
            alert_id=str(uuid.uuid4()),
            transaction_id=tx_id,
            merchant_id=merchant_id,
            customer_id=customer_id or None,
            rule_id=rule_id,
            rule_description=rule["description"],
            risk_score=score,
            severity=severity,
            action=rule["action"],
            amount_kobo=amount_kobo,
            currency=currency,
            triggered_at=now,
            notes=notes,
        )

    # Rule: velocity_1h
    exceeded, count = await check_velocity(merchant_id, "velocity_1h", 3600, RULES["velocity_1h"]["max_count"])
    if exceeded:
        alerts.append(make_alert("velocity_1h", f"Count in last hour: {count}"))

    # Rule: velocity_24h
    exceeded, count = await check_velocity(merchant_id, "velocity_24h", 86400, RULES["velocity_24h"]["max_count"])
    if exceeded:
        alerts.append(make_alert("velocity_24h", f"Count in last 24h: {count}"))

    # Rule: rapid_succession
    exceeded, count = await check_velocity(merchant_id, "rapid_succession", 300, RULES["rapid_succession"]["max_count"])
    if exceeded:
        alerts.append(make_alert("rapid_succession", f"Count in last 5 minutes: {count}"))

    # Rule: large_transaction
    if amount_kobo >= RULES["large_transaction"]["threshold_kobo"]:
        alerts.append(make_alert("large_transaction", f"Amount: ₦{amount_kobo/100:,.2f}"))

    # Rule: daily_volume
    await add_volume(merchant_id, amount_kobo, 86400)
    daily_vol = await get_volume_in_window(merchant_id, 86400)
    if daily_vol >= RULES["daily_volume"]["threshold_kobo"]:
        alerts.append(make_alert("daily_volume", f"Daily volume: ₦{daily_vol/100:,.2f}"))

    # Rule: round_amount (structuring indicator — amounts divisible by 100,000 kobo = ₦1,000)
    if amount_kobo >= 10_000_000 and amount_kobo % 100_000 == 0:
        alerts.append(make_alert("round_amount", f"Round amount: ₦{amount_kobo/100:,.0f}"))

    # Rule: cross_border_high_value
    if is_cross_border and amount_kobo >= RULES["cross_border_high_value"]["threshold_kobo"]:
        alerts.append(make_alert("cross_border_high_value", f"Cross-border amount: ₦{amount_kobo/100:,.2f}"))

    # Rule: CTR (Cash Transaction Report)
    if payment_type == "cash" and amount_kobo >= RULES["ctr_threshold"]["threshold_kobo"]:
        alerts.append(make_alert("ctr_threshold", f"CTR required for ₦{amount_kobo/100:,.2f} cash transaction"))

    # Rule: STR pattern (multiple transactions just below CTR threshold)
    if amount_kobo >= RULES["str_pattern"]["threshold_kobo"]:
        exceeded, count = await check_velocity(merchant_id, "str_pattern", 86400, RULES["str_pattern"]["count_window"])
        if exceeded:
            alerts.append(make_alert("str_pattern", f"Possible structuring: {count} near-threshold transactions today"))

    return alerts


# ─── Database helpers ──────────────────────────────────────────────────────────

_pool: Optional[asyncpg.Pool] = None


async def db_pool() -> asyncpg.Pool:
    global _pool
    if _pool is None:
        _pool = await asyncpg.create_pool(DATABASE_URL, min_size=2, max_size=10)
    return _pool


async def save_alert(alert: AMLAlert):
    db = await db_pool()
    await db.execute(
        """
        INSERT INTO aml_alerts (
            alert_id, transaction_id, merchant_id, customer_id,
            rule_id, rule_description, risk_score, severity, action,
            amount_kobo, currency, triggered_at, status, notes
        ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
        ON CONFLICT (alert_id) DO NOTHING
        """,
        alert.alert_id, alert.transaction_id, alert.merchant_id, alert.customer_id,
        alert.rule_id, alert.rule_description, alert.risk_score, alert.severity.value,
        alert.action, alert.amount_kobo, alert.currency, alert.triggered_at,
        alert.status, alert.notes,
    )


# ─── FastAPI app ───────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate AML Monitor", version="1.0.0")


@app.get("/alerts")
async def list_alerts(
    merchant_id: Optional[str] = Query(None),
    severity: Optional[str] = Query(None),
    status: Optional[str] = Query("open"),
    limit: int = Query(50, le=200),
):
    db = await db_pool()
    conditions = []
    params = []
    i = 1

    if merchant_id:
        conditions.append(f"merchant_id = ${i}")
        params.append(merchant_id)
        i += 1
    if severity:
        conditions.append(f"severity = ${i}")
        params.append(severity)
        i += 1
    if status:
        conditions.append(f"status = ${i}")
        params.append(status)
        i += 1

    where = f"WHERE {' AND '.join(conditions)}" if conditions else ""
    params.append(limit)
    rows = await db.fetch(
        f"SELECT * FROM aml_alerts {where} ORDER BY triggered_at DESC LIMIT ${i}",
        *params,
    )
    return {"alerts": [dict(r) for r in rows], "count": len(rows)}


@app.patch("/alerts/{alert_id}")
async def update_alert(alert_id: str, req: AMLCaseUpdateRequest):
    db = await db_pool()
    await db.execute(
        """
        UPDATE aml_alerts
        SET status = $1, notes = $2, reviewed_by = $3, reviewed_at = NOW()
        WHERE alert_id = $4
        """,
        req.status, req.notes, req.reviewed_by, alert_id,
    )
    return {"alert_id": alert_id, "status": req.status, "updated": True}


@app.get("/risk-score/{merchant_id}")
async def get_merchant_risk_score(merchant_id: str):
    """Compute aggregate risk score for a merchant."""
    db = await db_pool()
    rows = await db.fetch(
        """
        SELECT severity, COUNT(*) as count, AVG(risk_score) as avg_score
        FROM aml_alerts
        WHERE merchant_id = $1 AND triggered_at > NOW() - INTERVAL '30 days'
        GROUP BY severity
        """,
        merchant_id,
    )
    total_score = 0
    breakdown = {}
    for row in rows:
        weight = {"critical": 4, "high": 3, "medium": 2, "low": 1}.get(row["severity"], 1)
        total_score += int(row["count"]) * weight * int(row["avg_score"])
        breakdown[row["severity"]] = {"count": int(row["count"]), "avg_score": float(row["avg_score"])}

    risk_level = (
        "critical" if total_score > 1000 else
        "high" if total_score > 500 else
        "medium" if total_score > 100 else
        "low"
    )

    return {
        "merchant_id": merchant_id,
        "composite_score": total_score,
        "risk_level": risk_level,
        "breakdown": breakdown,
        "computed_at": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/health")
async def health():
    return {"status": "ok", "service": "aml-monitor", "timestamp": datetime.now(timezone.utc).isoformat()}


# ─── Kafka consumer ────────────────────────────────────────────────────────────

async def kafka_consumer_loop():
    consumer = Consumer({
        "bootstrap.servers": KAFKA_BOOTSTRAP_SERVERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": True,
    })
    consumer.subscribe(["paygate.transactions", "paygate.payments"])
    logger.info("AML Kafka consumer started")

    try:
        while True:
            msg = consumer.poll(timeout=0.5)
            if msg is None:
                await asyncio.sleep(0.05)
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error(f"Kafka error: {msg.error()}")
                continue

            try:
                event = json.loads(msg.value().decode("utf-8"))
                event_type = event.get("event_type", "")

                if event_type in ("transaction.completed", "payment.completed", "transfer.completed"):
                    alerts = await evaluate_transaction(event)
                    for alert in alerts:
                        await save_alert(alert)
                        logger.warning(
                            f"AML alert: rule={alert.rule_id} severity={alert.severity} "
                            f"merchant={alert.merchant_id} tx={alert.transaction_id}"
                        )
                        if alert.action == "block":
                            logger.critical(f"BLOCKING transaction {alert.transaction_id} — {alert.rule_description}")

            except Exception as e:
                logger.error(f"Error processing AML event: {e}")

    finally:
        consumer.close()


if __name__ == "__main__":
    import uvicorn

    async def startup():
        asyncio.create_task(kafka_consumer_loop())

    app.add_event_handler("startup", startup)
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level="info")
