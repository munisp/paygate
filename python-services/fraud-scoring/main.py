"""
PayGate Fraud Scoring Microservice
===================================
FastAPI service that scores transactions for fraud risk using a rule-based
engine with optional ML model integration.

Endpoints:
  POST /v1/score        — Score a transaction
  POST /v1/batch-score  — Batch score up to 100 transactions
  GET  /health          — Health check
  GET  /metrics         — Prometheus metrics

Environment variables:
  PORT                  — HTTP port (default: 8083)
  KAFKA_BROKERS         — Kafka broker addresses for streaming signals
  FLUVIO_ENDPOINT       — Fluvio endpoint for fraud signal streaming
  MODEL_PATH            — Path to pickled ML model (optional)
  LOG_LEVEL             — Logging level (default: INFO)
"""

import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("fraud-scoring")

# ─── Prometheus metrics ────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
    SCORE_REQUESTS = Counter("paygate_fraud_score_requests_total", "Total score requests", ["result"])
    SCORE_LATENCY = Histogram("paygate_fraud_score_duration_seconds", "Score request duration")
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False
    logger.warning("prometheus_client not installed — metrics disabled")

# ─── Models ───────────────────────────────────────────────────────────────────

class TransactionInput(BaseModel):
    tx_id: str = Field(..., description="Unique transaction ID")
    merchant_id: str
    amount_kobo: int = Field(..., gt=0)
    currency: str = Field(default="NGN", max_length=3)
    channel: str = Field(..., description="web|mobile|pos|ussd|api|usdc_payout")
    customer_ip: Optional[str] = None
    customer_id: Optional[str] = None
    card_last4: Optional[str] = None
    card_country: Optional[str] = None
    device_fingerprint: Optional[str] = None
    metadata: Optional[dict] = None
    # USDC-specific fields (populated when channel == "usdc_payout")
    usdc_recipient_wallet: Optional[str] = None
    usdc_amount_lamports: Optional[int] = None
    usdc_first_payout: Optional[bool] = None  # True if merchant's first USDC payout
    usdc_wallet_age_days: Optional[int] = None  # Age of recipient wallet (from on-chain data)

class ScoreResponse(BaseModel):
    tx_id: str
    risk_score: int = Field(..., ge=0, le=100)
    risk_level: str  # "low" | "medium" | "high" | "critical"
    signals: list[str]
    recommended_action: str  # "allow" | "review" | "block"
    scored_at_ms: int

class BatchScoreRequest(BaseModel):
    transactions: list[TransactionInput] = Field(..., max_length=100)

class BatchScoreResponse(BaseModel):
    results: list[ScoreResponse]
    total: int
    duration_ms: int

# ─── Scoring engine ───────────────────────────────────────────────────────────

# High-risk countries for card transactions
HIGH_RISK_COUNTRIES = {"NG", "GH", "KE", "ZA"}  # Adjust based on actual risk data
BLOCKED_COUNTRIES = set()  # Add sanctioned countries

# Velocity thresholds
MAX_AMOUNT_KOBO = 10_000_000_00  # 10M NGN
LARGE_AMOUNT_KOBO = 1_000_000_00  # 1M NGN

# USDC thresholds
USDC_LARGE_PAYOUT_LAMPORTS = 10_000 * 1_000_000  # 10,000 USDC
USDC_VERY_LARGE_PAYOUT_LAMPORTS = 100_000 * 1_000_000  # 100,000 USDC
# Known high-risk Solana wallets (placeholder — populate from OFAC SDN list)
USDC_SANCTIONED_WALLETS: set[str] = set()


def score_transaction(tx: TransactionInput) -> ScoreResponse:
    """Rule-based fraud scoring engine."""
    signals: list[str] = []
    score = 0

    # ─── Amount rules ─────────────────────────────────────────────────────────
    if tx.amount_kobo > MAX_AMOUNT_KOBO:
        signals.append("amount_exceeds_limit")
        score += 40
    elif tx.amount_kobo > LARGE_AMOUNT_KOBO:
        signals.append("large_amount")
        score += 15

    # ─── Card country rules ───────────────────────────────────────────────────
    if tx.card_country and tx.card_country.upper() in BLOCKED_COUNTRIES:
        signals.append("blocked_country")
        score += 50
    elif tx.card_country and tx.card_country.upper() not in HIGH_RISK_COUNTRIES:
        signals.append("foreign_card")
        score += 10

    # ─── Channel rules ────────────────────────────────────────────────────────
    if tx.channel == "api" and tx.amount_kobo > LARGE_AMOUNT_KOBO:
        signals.append("large_api_transaction")
        score += 20

    # ─── Missing device fingerprint ───────────────────────────────────────────
    if tx.channel in ("web", "mobile") and not tx.device_fingerprint:
        signals.append("missing_device_fingerprint")
        score += 10

    # ─── IP-based rules ───────────────────────────────────────────────────────
    if tx.customer_ip and tx.customer_ip.startswith("10."):
        # Internal IP on a web transaction — suspicious
        if tx.channel == "web":
            signals.append("internal_ip_web_transaction")
            score += 15

    # ─── USDC payout-specific rules ───────────────────────────────────────────
    if tx.channel == "usdc_payout":
        # Sanctioned wallet check (OFAC / internal blocklist)
        if tx.usdc_recipient_wallet and tx.usdc_recipient_wallet in USDC_SANCTIONED_WALLETS:
            signals.append("usdc_sanctioned_wallet")
            score += 100  # Always block
        # Very large USDC payout
        if tx.usdc_amount_lamports and tx.usdc_amount_lamports >= USDC_VERY_LARGE_PAYOUT_LAMPORTS:
            signals.append("usdc_very_large_payout")
            score += 35
        elif tx.usdc_amount_lamports and tx.usdc_amount_lamports >= USDC_LARGE_PAYOUT_LAMPORTS:
            signals.append("usdc_large_payout")
            score += 15
        # First-ever USDC payout from this merchant — elevated review
        if tx.usdc_first_payout:
            signals.append("usdc_first_payout")
            score += 10
        # Very new recipient wallet (< 7 days old) — common in scam flows
        if tx.usdc_wallet_age_days is not None and tx.usdc_wallet_age_days < 7:
            signals.append("usdc_new_recipient_wallet")
            score += 20
        # Wallet address not provided
        if not tx.usdc_recipient_wallet:
            signals.append("usdc_missing_wallet")
            score += 30

    # ─── Clamp score ──────────────────────────────────────────────────────────
    score = min(score, 100)

    # ─── Risk level ───────────────────────────────────────────────────────────
    if score >= 80:
        risk_level = "critical"
        action = "block"
    elif score >= 60:
        risk_level = "high"
        action = "review"
    elif score >= 30:
        risk_level = "medium"
        action = "review"
    else:
        risk_level = "low"
        action = "allow"

    return ScoreResponse(
        tx_id=tx.tx_id,
        risk_score=score,
        risk_level=risk_level,
        signals=signals,
        recommended_action=action,
        scored_at_ms=int(time.time() * 1000),
    )


# ─── App lifecycle ────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Fraud scoring service starting up")
    yield
    logger.info("Fraud scoring service shutting down")


app = FastAPI(
    title="PayGate Fraud Scoring",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
async def health():
    return {"status": "ok", "service": "fraud-scoring"}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    if not METRICS_ENABLED:
        return PlainTextResponse("# metrics disabled\n", media_type="text/plain")
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/score", response_model=ScoreResponse)
async def score(tx: TransactionInput):
    start = time.time()
    try:
        result = score_transaction(tx)
        if METRICS_ENABLED:
            SCORE_REQUESTS.labels(result=result.risk_level).inc()
        return result
    except Exception as e:
        logger.error(f"Scoring error for tx {tx.tx_id}: {e}")
        raise HTTPException(status_code=500, detail="Scoring failed")
    finally:
        if METRICS_ENABLED:
            SCORE_LATENCY.observe(time.time() - start)


@app.post("/v1/batch-score", response_model=BatchScoreResponse)
async def batch_score(req: BatchScoreRequest):
    start = time.time()
    results = [score_transaction(tx) for tx in req.transactions]
    duration_ms = int((time.time() - start) * 1000)
    return BatchScoreResponse(results=results, total=len(results), duration_ms=duration_ms)


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8083"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False, workers=2)
