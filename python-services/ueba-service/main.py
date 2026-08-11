"""
PayGate UEBA (User and Entity Behaviour Analytics) Service
============================================================
FastAPI service that implements:

1. **Peer-group analysis** — compares an actor's behaviour against their role
   cohort (e.g., all finance-admins) using Isolation Forest.
2. **Temporal pattern analysis** — detects actions outside the actor's normal
   working hours using a Gaussian model.
3. **Alert enrichment** — enriches raw insider-threat events from Kafka with
   ML-derived context and pushes them back to the Rust engine for baseline
   updates.
4. **Policy evaluation** — evaluates configurable insider-threat policies and
   returns a policy verdict.

Endpoints:
  POST /v1/ueba/analyse          — analyse a single action event
  POST /v1/ueba/peer-group       — compare actor against role cohort
  POST /v1/ueba/alert/enrich     — enrich a raw alert with ML context
  POST /v1/ueba/policy/evaluate  — evaluate policies for an action
  GET  /health                   — liveness probe
  GET  /metrics                  — Prometheus metrics

Environment variables:
  PORT                      — HTTP port (default: 8301)
  INSIDER_THREAT_ENGINE_URL — Rust engine URL (default: http://localhost:8300)
  REDIS_URL                 — Redis connection URL
  KAFKA_BROKERS             — Kafka broker addresses
  LOG_LEVEL                 — Logging level (default: INFO)
"""

import json
import logging
import math
import os
import time
from collections import defaultdict
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import httpx
import numpy as np
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("ueba-service")

# ─── Prometheus metrics ────────────────────────────────────────────────────────

try:
    from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
    REQUESTS_TOTAL = Counter("ueba_requests_total", "Total UEBA requests", ["endpoint"])
    ANALYSIS_DURATION = Histogram("ueba_analysis_duration_seconds", "Analysis latency")
    ALERTS_ENRICHED = Counter("ueba_alerts_enriched_total", "Total alerts enriched")
    POLICY_VIOLATIONS = Counter("ueba_policy_violations_total", "Policy violations", ["policy"])
    PROMETHEUS_AVAILABLE = True
except ImportError:
    PROMETHEUS_AVAILABLE = False

# ─── Configuration ─────────────────────────────────────────────────────────────

RUST_ENGINE_URL = os.getenv("INSIDER_THREAT_ENGINE_URL", "http://localhost:8300")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
PORT = int(os.getenv("PORT", "8301"))

# ─── In-memory state (production: back with Redis) ────────────────────────────

# actor_id -> list of (hour, day_of_week, action) tuples
actor_history: Dict[str, List[Dict]] = defaultdict(list)

# role -> list of action counts per actor (for peer-group Isolation Forest)
role_cohort: Dict[str, List[Dict]] = defaultdict(list)

# ─── Request/response models ───────────────────────────────────────────────────

class ActionEvent(BaseModel):
    event_id: str
    actor_id: str
    merchant_id: str
    action: str
    role: Optional[str] = "unknown"
    ip_address: Optional[str] = ""
    device_hash: Optional[str] = ""
    geo_country: Optional[str] = ""
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    risk_score: Optional[float] = 0.0
    occurred_at: Optional[str] = None

class AnalysisResult(BaseModel):
    event_id: str
    actor_id: str
    action: str
    peer_group_anomaly_score: float
    temporal_anomaly_score: float
    composite_ueba_score: float
    ueba_factors: List[str]
    recommendation: str  # "allow" | "flag" | "block" | "require_approval"

class PeerGroupRequest(BaseModel):
    actor_id: str
    role: str
    action: str
    action_count_last_24h: int

class PeerGroupResult(BaseModel):
    actor_id: str
    role: str
    cohort_size: int
    actor_percentile: float  # 0-100
    is_outlier: bool
    outlier_score: float

class AlertEnrichRequest(BaseModel):
    event_id: str
    actor_id: str
    merchant_id: str
    action: str
    role: Optional[str] = "unknown"
    raw_risk_score: float
    risk_factors: List[str]
    occurred_at: Optional[str] = None

class AlertEnrichResult(BaseModel):
    event_id: str
    enriched_risk_score: float
    enriched_risk_level: str
    additional_factors: List[str]
    recommended_action: str
    alert_priority: str  # "low" | "medium" | "high" | "critical"

class PolicyEvaluateRequest(BaseModel):
    actor_id: str
    merchant_id: str
    action: str
    role: Optional[str] = "unknown"
    risk_score: float
    risk_factors: List[str]
    geo_country: Optional[str] = ""
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)

class PolicyViolation(BaseModel):
    policy_id: str
    policy_name: str
    severity: str  # "low" | "medium" | "high" | "critical"
    description: str

class PolicyEvaluateResult(BaseModel):
    actor_id: str
    action: str
    verdict: str  # "allow" | "flag" | "block" | "require_approval"
    violations: List[PolicyViolation]
    total_violations: int

# ─── Insider-threat policies ───────────────────────────────────────────────────

POLICIES = [
    {
        "id": "P001",
        "name": "High-risk score block",
        "severity": "critical",
        "description": "Block actions with risk score >= 85",
        "check": lambda r: r.risk_score >= 85,
        "verdict": "block",
    },
    {
        "id": "P002",
        "name": "Dual-control for privileged actions",
        "severity": "high",
        "description": "Require approval for privileged actions with score >= 50",
        "check": lambda r: r.risk_score >= 50 and r.action in {
            "payout.approve", "apikey.create", "apikey.revoke",
            "role.escalate", "settlement.force", "user.disable", "data.export"
        },
        "verdict": "require_approval",
    },
    {
        "id": "P003",
        "name": "Off-hours privileged action flag",
        "severity": "medium",
        "description": "Flag privileged actions outside business hours (08:00-18:00 Mon-Fri)",
        "check": lambda r: (r.hour_of_day < 8 or r.hour_of_day >= 18 or r.day_of_week in {0, 6})
                           and r.action in {
                               "payout.approve", "apikey.create", "settlement.force",
                               "role.escalate", "data.export"
                           },
        "verdict": "flag",
    },
    {
        "id": "P004",
        "name": "New geo-country block",
        "severity": "high",
        "description": "Block privileged actions from a new geo-country",
        "check": lambda r: "new_country" in " ".join(r.risk_factors),
        "verdict": "require_approval",
    },
    {
        "id": "P005",
        "name": "New device flag",
        "severity": "medium",
        "description": "Flag privileged actions from a new device",
        "check": lambda r: "new_device" in r.risk_factors,
        "verdict": "flag",
    },
    {
        "id": "P006",
        "name": "Velocity limit flag",
        "severity": "medium",
        "description": "Flag actions when velocity anomaly is detected",
        "check": lambda r: any("velocity" in f or "high_velocity" in f for f in r.risk_factors),
        "verdict": "flag",
    },
    {
        "id": "P007",
        "name": "Data export restriction",
        "severity": "high",
        "description": "Always require approval for data export actions",
        "check": lambda r: r.action == "data.export",
        "verdict": "require_approval",
    },
]

# ─── Temporal anomaly model ────────────────────────────────────────────────────

def temporal_anomaly_score(actor_id: str, hour: int, day_of_week: int) -> float:
    """
    Returns a 0-1 anomaly score based on how unusual the hour+day combination
    is for this actor. Uses a simple Gaussian model over historical hours.
    """
    history = actor_history.get(actor_id, [])
    if len(history) < 10:
        # Not enough history — return low score
        return 0.1

    hours = [h["hour"] for h in history]
    mean_hour = np.mean(hours)
    std_hour = np.std(hours) if np.std(hours) > 0 else 4.0

    # Z-score for current hour
    z = abs(hour - mean_hour) / std_hour
    # Sigmoid-like mapping to [0, 1]
    score = 1.0 - math.exp(-0.3 * max(0, z - 1.5))
    return min(score, 1.0)

# ─── Peer-group Isolation Forest ──────────────────────────────────────────────

def peer_group_anomaly(actor_id: str, role: str, action: str, count_24h: int) -> PeerGroupResult:
    """
    Compare the actor's action count against their role cohort using a simple
    percentile-based outlier detection (production: use sklearn IsolationForest).
    """
    cohort = role_cohort.get(role, [])
    cohort_counts = [
        c.get("count", 0) for c in cohort
        if c.get("action") == action and c.get("actor_id") != actor_id
    ]

    if len(cohort_counts) < 3:
        return PeerGroupResult(
            actor_id=actor_id,
            role=role,
            cohort_size=len(cohort_counts),
            actor_percentile=50.0,
            is_outlier=False,
            outlier_score=0.0,
        )

    arr = np.array(cohort_counts + [count_24h], dtype=float)
    mean = np.mean(arr)
    std = np.std(arr) if np.std(arr) > 0 else 1.0
    z = (count_24h - mean) / std
    percentile = float(np.sum(arr <= count_24h) / len(arr) * 100)
    is_outlier = abs(z) > 2.5
    outlier_score = min(abs(z) / 5.0, 1.0)

    return PeerGroupResult(
        actor_id=actor_id,
        role=role,
        cohort_size=len(cohort_counts),
        actor_percentile=round(percentile, 1),
        is_outlier=is_outlier,
        outlier_score=round(outlier_score, 3),
    )

# ─── Rust engine baseline update ──────────────────────────────────────────────

async def push_baseline_update(actor_id: str, action: str, value: float,
                                device_hash: str = "", geo_country: str = "",
                                hour_of_day: int = 0):
    """Push a baseline observation to the Rust engine."""
    payload = {
        "actor_id": actor_id,
        "action": action,
        "observed_value": value,
        "device_hash": device_hash or None,
        "geo_country": geo_country or None,
        "hour_of_day": hour_of_day,
    }
    try:
        async with httpx.AsyncClient(timeout=1.0) as client:
            await client.post(f"{RUST_ENGINE_URL}/baseline/update", json=payload)
    except Exception as e:
        logger.warning("Failed to push baseline update to Rust engine: %s", e)

# ─── Lifespan ─────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("UEBA service starting on port %d", PORT)
    logger.info("Rust engine URL: %s", RUST_ENGINE_URL)
    yield
    logger.info("UEBA service shutting down")

# ─── App ──────────────────────────────────────────────────────────────────────

app = FastAPI(
    title="PayGate UEBA Service",
    description="User and Entity Behaviour Analytics for insider threat detection",
    version="1.0.0",
    lifespan=lifespan,
)

# ─── Endpoints ────────────────────────────────────────────────────────────────

@app.post("/v1/ueba/analyse", response_model=AnalysisResult)
async def analyse(event: ActionEvent):
    if PROMETHEUS_AVAILABLE:
        REQUESTS_TOTAL.labels(endpoint="analyse").inc()

    start = time.time()

    # Record history
    actor_history[event.actor_id].append({
        "hour": event.hour_of_day,
        "day": event.day_of_week,
        "action": event.action,
    })
    # Keep last 500 events per actor
    if len(actor_history[event.actor_id]) > 500:
        actor_history[event.actor_id] = actor_history[event.actor_id][-500:]

    # Update role cohort
    cohort_entry = next(
        (c for c in role_cohort[event.role]
         if c.get("actor_id") == event.actor_id and c.get("action") == event.action),
        None
    )
    if cohort_entry:
        cohort_entry["count"] = cohort_entry.get("count", 0) + 1
    else:
        role_cohort[event.role].append({
            "actor_id": event.actor_id,
            "action": event.action,
            "count": 1,
        })

    # Temporal anomaly
    temporal_score = temporal_anomaly_score(
        event.actor_id, event.hour_of_day, event.day_of_week
    )

    # Peer-group anomaly
    count_24h = sum(
        1 for h in actor_history[event.actor_id]
        if h.get("action") == event.action
    )
    pg = peer_group_anomaly(event.actor_id, event.role, event.action, count_24h)
    peer_score = pg.outlier_score

    # Composite UEBA score (0-100)
    composite = min((temporal_score * 40 + peer_score * 60), 100.0)

    ueba_factors = []
    if temporal_score > 0.5:
        ueba_factors.append(f"temporal_anomaly:{temporal_score:.2f}")
    if pg.is_outlier:
        ueba_factors.append(f"peer_group_outlier:p{pg.actor_percentile:.0f}")

    recommendation = "allow"
    if composite >= 75:
        recommendation = "block"
    elif composite >= 50:
        recommendation = "require_approval"
    elif composite >= 25:
        recommendation = "flag"

    # Push baseline update to Rust engine
    await push_baseline_update(
        actor_id=event.actor_id,
        action=event.action,
        value=float(count_24h),
        device_hash=event.device_hash or "",
        geo_country=event.geo_country or "",
        hour_of_day=event.hour_of_day,
    )

    if PROMETHEUS_AVAILABLE:
        ANALYSIS_DURATION.observe(time.time() - start)

    return AnalysisResult(
        event_id=event.event_id,
        actor_id=event.actor_id,
        action=event.action,
        peer_group_anomaly_score=round(peer_score, 3),
        temporal_anomaly_score=round(temporal_score, 3),
        composite_ueba_score=round(composite, 2),
        ueba_factors=ueba_factors,
        recommendation=recommendation,
    )


@app.post("/v1/ueba/peer-group", response_model=PeerGroupResult)
async def peer_group_endpoint(req: PeerGroupRequest):
    if PROMETHEUS_AVAILABLE:
        REQUESTS_TOTAL.labels(endpoint="peer-group").inc()
    return peer_group_anomaly(req.actor_id, req.role, req.action, req.action_count_last_24h)


@app.post("/v1/ueba/alert/enrich", response_model=AlertEnrichResult)
async def enrich_alert(req: AlertEnrichRequest):
    if PROMETHEUS_AVAILABLE:
        REQUESTS_TOTAL.labels(endpoint="alert-enrich").inc()
        ALERTS_ENRICHED.inc()

    additional_factors: List[str] = []

    # Temporal context
    now = datetime.now(timezone.utc)
    hour = now.hour
    temporal_score = temporal_anomaly_score(req.actor_id, hour, now.weekday())
    if temporal_score > 0.4:
        additional_factors.append(f"ueba_temporal_anomaly:{temporal_score:.2f}")

    # Peer-group context
    count_24h = sum(
        1 for h in actor_history.get(req.actor_id, [])
        if h.get("action") == req.action
    )
    pg = peer_group_anomaly(req.actor_id, req.role, req.action, count_24h)
    if pg.is_outlier:
        additional_factors.append(f"ueba_peer_outlier:p{pg.actor_percentile:.0f}")

    # Composite enriched score
    ueba_boost = temporal_score * 15 + pg.outlier_score * 20
    enriched_score = min(req.raw_risk_score + ueba_boost, 100.0)

    risk_level = (
        "critical" if enriched_score >= 85 else
        "high" if enriched_score >= 60 else
        "medium" if enriched_score >= 35 else
        "low"
    )

    recommended_action = (
        "block" if enriched_score >= 85 else
        "require_approval" if enriched_score >= 60 else
        "flag" if enriched_score >= 35 else
        "monitor"
    )

    alert_priority = (
        "critical" if enriched_score >= 85 else
        "high" if enriched_score >= 60 else
        "medium" if enriched_score >= 35 else
        "low"
    )

    return AlertEnrichResult(
        event_id=req.event_id,
        enriched_risk_score=round(enriched_score, 2),
        enriched_risk_level=risk_level,
        additional_factors=additional_factors,
        recommended_action=recommended_action,
        alert_priority=alert_priority,
    )


@app.post("/v1/ueba/policy/evaluate", response_model=PolicyEvaluateResult)
async def evaluate_policies(req: PolicyEvaluateRequest):
    if PROMETHEUS_AVAILABLE:
        REQUESTS_TOTAL.labels(endpoint="policy-evaluate").inc()

    violations: List[PolicyViolation] = []
    final_verdict = "allow"
    verdict_priority = {"allow": 0, "flag": 1, "require_approval": 2, "block": 3}

    for policy in POLICIES:
        try:
            if policy["check"](req):
                violations.append(PolicyViolation(
                    policy_id=policy["id"],
                    policy_name=policy["name"],
                    severity=policy["severity"],
                    description=policy["description"],
                ))
                if PROMETHEUS_AVAILABLE:
                    POLICY_VIOLATIONS.labels(policy=policy["id"]).inc()
                # Escalate verdict to the most restrictive
                if verdict_priority.get(policy["verdict"], 0) > verdict_priority.get(final_verdict, 0):
                    final_verdict = policy["verdict"]
        except Exception as e:
            logger.warning("Policy %s evaluation error: %s", policy["id"], e)

    return PolicyEvaluateResult(
        actor_id=req.actor_id,
        action=req.action,
        verdict=final_verdict,
        violations=violations,
        total_violations=len(violations),
    )


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "ueba-service",
        "actors_tracked": len(actor_history),
        "rust_engine_url": RUST_ENGINE_URL,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    if PROMETHEUS_AVAILABLE:
        return generate_latest()
    return "# Prometheus client not available\n"


# ─── Entry point ──────────────────────────────────────────────────────────────

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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False)
