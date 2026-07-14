"""
NextHub Insurance Lapse Prediction Service
ML-based service for predicting policy lapse risk and triggering proactive retention.

Features:
- Rule-based lapse risk scoring (production: XGBoost model)
- Proactive retention campaign triggers
- Kafka event publishing for lapse events
- Redis-cached risk scores

Integrates with:
- Kafka: paygate.insurance.* topics
- Redis: risk score cache (TTL 24h)
- PostgreSQL: policy data
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Optional

from fastapi import FastAPI, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from aiokafka import AIOKafkaProducer
import redis.asyncio as aioredis

logger = logging.getLogger(__name__)

app = FastAPI(
    title="NextHub Insurance Lapse Detector",
    description="ML-based insurance policy lapse prediction and retention",
    version="1.0.0",
)
app.add_middleware(CORSMiddleware, allow_origins=["*"], allow_methods=["*"], allow_headers=["*"])

KAFKA_BOOTSTRAP = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")

# ─── Models ────────────────────────────────────────────────────────────────────

class PolicyRiskInput(BaseModel):
    policyId: str
    policyNumber: str
    policyType: str
    premiumAmount: float
    currency: str
    frequency: str  # MONTHLY, QUARTERLY, ANNUAL, WEEKLY
    missedPayments: int
    gracePeriodDays: int
    daysSinceLastPayment: int
    holderAge: Optional[int] = None
    holderIncomeSegment: Optional[str] = None  # LOW, MEDIUM, HIGH
    previousLapses: int = 0
    claimsHistory: int = 0  # Number of claims filed
    policyAgeDays: int = 0


class LapseRiskResult(BaseModel):
    policyId: str
    lapseProbability: float  # 0.0 - 1.0
    riskLevel: str  # LOW, MEDIUM, HIGH, CRITICAL
    riskFactors: list[str]
    retentionActions: list[str]
    predictedLapseDate: Optional[str] = None
    scoredAt: str


class RetentionCampaignRequest(BaseModel):
    policyId: str
    riskLevel: str
    channels: list[str] = ["SMS", "PUSH", "EMAIL"]


# ─── Lapse Risk Scorer ─────────────────────────────────────────────────────────

class LapseRiskScorer:
    """
    Rule-based lapse risk scorer.
    Production version: XGBoost model trained on historical policy data.
    """

    def score(self, policy: PolicyRiskInput) -> LapseRiskResult:
        risk_score = 0.0
        risk_factors = []
        retention_actions = []

        # ── Payment behaviour ─────────────────────────────────────────────────
        if policy.missedPayments >= 3:
            risk_score += 50.0
            risk_factors.append(f"MISSED_PAYMENTS:{policy.missedPayments}")
            retention_actions.append("URGENT_OUTREACH")
        elif policy.missedPayments == 2:
            risk_score += 30.0
            risk_factors.append("TWO_MISSED_PAYMENTS")
            retention_actions.append("PAYMENT_REMINDER_CALL")
        elif policy.missedPayments == 1:
            risk_score += 15.0
            risk_factors.append("ONE_MISSED_PAYMENT")
            retention_actions.append("PAYMENT_REMINDER_SMS")

        # ── Grace period proximity ─────────────────────────────────────────────
        grace_remaining = policy.gracePeriodDays - policy.daysSinceLastPayment
        if grace_remaining <= 7 and grace_remaining > 0:
            risk_score += 20.0
            risk_factors.append(f"GRACE_PERIOD_EXPIRING:{grace_remaining}d")
            retention_actions.append("GRACE_PERIOD_WARNING")
        elif grace_remaining <= 0:
            risk_score += 40.0
            risk_factors.append("GRACE_PERIOD_EXCEEDED")
            retention_actions.append("LAPSE_PREVENTION_CALL")

        # ── Income segment ────────────────────────────────────────────────────
        if policy.holderIncomeSegment == "LOW":
            risk_score += 10.0
            risk_factors.append("LOW_INCOME_SEGMENT")
            retention_actions.append("OFFER_PREMIUM_REDUCTION")
        elif policy.holderIncomeSegment == "MEDIUM":
            risk_score += 5.0

        # ── Policy age ────────────────────────────────────────────────────────
        if policy.policyAgeDays < 90:
            risk_score += 15.0
            risk_factors.append("NEW_POLICY_HIGH_LAPSE_RISK")
            retention_actions.append("ONBOARDING_SUPPORT_CALL")

        # ── Previous lapses ───────────────────────────────────────────────────
        if policy.previousLapses > 0:
            risk_score += policy.previousLapses * 10.0
            risk_factors.append(f"PREVIOUS_LAPSES:{policy.previousLapses}")

        # ── Micro-insurance specific ──────────────────────────────────────────
        if policy.policyType == "MICRO":
            if policy.premiumAmount > 5000:  # NGN
                risk_score += 10.0
                risk_factors.append("MICRO_PREMIUM_AFFORDABILITY")
                retention_actions.append("OFFER_INSTALMENT_PLAN")

        # ── Claims history (inverse indicator — claimants tend to stay) ───────
        if policy.claimsHistory > 0:
            risk_score = max(0, risk_score - 10.0)

        risk_score = min(risk_score, 100.0)
        lapse_probability = risk_score / 100.0

        # Determine risk level
        if risk_score >= 70:
            risk_level = "CRITICAL"
        elif risk_score >= 50:
            risk_level = "HIGH"
        elif risk_score >= 25:
            risk_level = "MEDIUM"
        else:
            risk_level = "LOW"

        # Predict lapse date
        predicted_lapse_date = None
        if risk_score >= 50 and policy.gracePeriodDays > 0:
            days_to_lapse = max(0, policy.gracePeriodDays - policy.daysSinceLastPayment)
            predicted_lapse_date = (
                datetime.now(timezone.utc) + timedelta(days=days_to_lapse)
            ).strftime("%Y-%m-%d")

        # Deduplicate retention actions
        retention_actions = list(dict.fromkeys(retention_actions))

        return LapseRiskResult(
            policyId=policy.policyId,
            lapseProbability=lapse_probability,
            riskLevel=risk_level,
            riskFactors=risk_factors,
            retentionActions=retention_actions,
            predictedLapseDate=predicted_lapse_date,
            scoredAt=datetime.now(timezone.utc).isoformat(),
        )


scorer = LapseRiskScorer()

# ─── Application State ─────────────────────────────────────────────────────────

redis_client: Optional[aioredis.Redis] = None
kafka_producer: Optional[AIOKafkaProducer] = None


@app.on_event("startup")
async def startup():
    global redis_client, kafka_producer
    redis_client = aioredis.from_url(REDIS_URL, decode_responses=True)
    try:
        kafka_producer = AIOKafkaProducer(
            bootstrap_servers=KAFKA_BOOTSTRAP,
            value_serializer=lambda v: json.dumps(v).encode(),
        )
        await kafka_producer.start()
    except Exception as e:
        logger.warning(f"Kafka startup failed: {e}")


@app.on_event("shutdown")
async def shutdown():
    if kafka_producer:
        await kafka_producer.stop()


# ─── API Endpoints ─────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "lapse-detector"}


@app.post("/lapse/score", response_model=LapseRiskResult)
async def score_lapse_risk(policy: PolicyRiskInput, background_tasks: BackgroundTasks):
    """Score the lapse risk for a policy."""
    result = scorer.score(policy)

    # Cache score
    if redis_client:
        cache_key = f"lapse_risk:{policy.policyId}"
        await redis_client.setex(cache_key, 86400, result.model_dump_json())

    # Publish high-risk events to Kafka
    if result.riskLevel in ("HIGH", "CRITICAL"):
        background_tasks.add_task(publish_lapse_risk_event, result)

    return result


@app.post("/lapse/batch-score")
async def batch_score(policies: list[PolicyRiskInput]):
    """Score lapse risk for multiple policies in batch."""
    results = [scorer.score(p) for p in policies]
    return {
        "total": len(results),
        "critical": sum(1 for r in results if r.riskLevel == "CRITICAL"),
        "high": sum(1 for r in results if r.riskLevel == "HIGH"),
        "medium": sum(1 for r in results if r.riskLevel == "MEDIUM"),
        "low": sum(1 for r in results if r.riskLevel == "LOW"),
        "results": results,
    }


@app.post("/retention/trigger")
async def trigger_retention(req: RetentionCampaignRequest, background_tasks: BackgroundTasks):
    """Trigger a retention campaign for a high-risk policy."""
    background_tasks.add_task(publish_retention_event, req)
    return {
        "policyId": req.policyId,
        "campaignTriggered": True,
        "channels": req.channels,
        "triggeredAt": datetime.now(timezone.utc).isoformat(),
    }


# ─── Helpers ───────────────────────────────────────────────────────────────────

async def publish_lapse_risk_event(result: LapseRiskResult):
    if not kafka_producer:
        return
    try:
        event = {
            "eventType": "policy.lapse_risk_detected",
            "policyId": result.policyId,
            "riskLevel": result.riskLevel,
            "lapseProbability": result.lapseProbability,
            "riskFactors": result.riskFactors,
            "retentionActions": result.retentionActions,
            "predictedLapseDate": result.predictedLapseDate,
            "timestamp": result.scoredAt,
        }
        await kafka_producer.send("paygate.insurance.lapse_risk", value=event)
    except Exception as e:
        logger.error(f"Failed to publish lapse risk event: {e}")


async def publish_retention_event(req: RetentionCampaignRequest):
    if not kafka_producer:
        return
    try:
        event = {
            "eventType": "policy.retention_campaign_triggered",
            "policyId": req.policyId,
            "riskLevel": req.riskLevel,
            "channels": req.channels,
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await kafka_producer.send("paygate.insurance.retention", value=event)
    except Exception as e:
        logger.error(f"Failed to publish retention event: {e}")


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8093")))
