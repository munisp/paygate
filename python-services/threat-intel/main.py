"""
PayGate Threat Intelligence Engine
===================================
FastAPI microservice providing:
  - Anomaly detection (Isolation Forest) for transaction patterns
  - Brute-force login attack analysis (sliding-window counters)
  - DDoS pattern recognition (request-rate spike detection)
  - IP reputation scoring (geo-velocity + known-bad-IP heuristics)
  - Threat feed aggregation (MISP-compatible IOC ingestion)

Exposes REST endpoints consumed by the Node.js backend (server/_core/index.ts).
"""

import os
import time
import hashlib
import logging
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Optional

import numpy as np
import structlog
import uvicorn
from fastapi import FastAPI, HTTPException, Header, Request
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel, Field
from prometheus_client import Counter, Histogram, generate_latest, CONTENT_TYPE_LATEST
from starlette.responses import Response

# ─── Structured Logging ────────────────────────────────────────────────────────
structlog.configure(
    processors=[
        structlog.processors.TimeStamper(fmt="iso"),
        structlog.processors.add_log_level,
        structlog.processors.JSONRenderer(),
    ],
    wrapper_class=structlog.make_filtering_bound_logger(logging.INFO),
)
log = structlog.get_logger()

# ─── Prometheus Metrics ────────────────────────────────────────────────────────
ANOMALY_COUNTER = Counter("threat_intel_anomalies_total", "Total anomalies detected", ["type"])
ANALYSIS_LATENCY = Histogram("threat_intel_analysis_seconds", "Analysis latency", ["endpoint"])
REQUEST_COUNTER = Counter("threat_intel_requests_total", "Total requests", ["endpoint", "status"])

# ─── Configuration ─────────────────────────────────────────────────────────────
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
REDIS_URL = os.getenv("REDIS_URL", "")
PORT = int(os.getenv("THREAT_INTEL_PORT", "8095"))

# ─── In-memory Sliding Window Stores ──────────────────────────────────────────
# Maps IP → deque of timestamps (request times within last 60s)
_request_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
# Maps identifier → deque of failed login timestamps
_login_fail_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
# Known bad IP heuristics (populated from threat feed)
_known_bad_ips: set[str] = set()
# Transaction velocity windows: account_id → deque of (timestamp, amount)
_tx_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))

# ─── Isolation Forest (lazy-loaded) ───────────────────────────────────────────
_iso_forest = None
_iso_forest_trained = False
_iso_training_buffer: list[list[float]] = []
ISO_MIN_SAMPLES = 50  # Minimum samples before training

def _get_iso_forest():
    """Lazy-load and train Isolation Forest when enough samples are available."""
    global _iso_forest, _iso_forest_trained
    if _iso_forest_trained:
        return _iso_forest
    if len(_iso_training_buffer) < ISO_MIN_SAMPLES:
        return None
    from sklearn.ensemble import IsolationForest
    _iso_forest = IsolationForest(
        n_estimators=100,
        contamination=0.05,  # 5% expected anomaly rate
        random_state=42,
        n_jobs=-1,
    )
    X = np.array(_iso_training_buffer)
    _iso_forest.fit(X)
    _iso_forest_trained = True
    log.info("isolation_forest_trained", samples=len(_iso_training_buffer))
    return _iso_forest

# ─── FastAPI App ───────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate Threat Intelligence Engine",
    version="1.0.0",
    description="Real-time threat detection: anomaly analysis, brute-force detection, DDoS recognition",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# ─── Auth Middleware ───────────────────────────────────────────────────────────
def _verify_key(x_internal_key: Optional[str]) -> None:
    """Verify internal API key. Fail-open in dev (no key configured)."""
    if not INTERNAL_API_KEY:
        return  # Dev mode — no key required
    if x_internal_key != INTERNAL_API_KEY:
        raise HTTPException(status_code=401, detail="Unauthorized: invalid internal API key")

# ─── Pydantic Models ───────────────────────────────────────────────────────────

class TransactionFeatures(BaseModel):
    account_id: str
    amount: float = Field(gt=0)
    currency: str = "NGN"
    merchant_category: str = "unknown"
    hour_of_day: int = Field(ge=0, le=23)
    day_of_week: int = Field(ge=0, le=6)
    is_international: bool = False
    velocity_1h: int = Field(ge=0, description="Number of transactions in last 1 hour")
    velocity_24h: int = Field(ge=0, description="Number of transactions in last 24 hours")

class AnomalyResult(BaseModel):
    is_anomaly: bool
    score: float = Field(description="Anomaly score: -1 = anomaly, 1 = normal (Isolation Forest)")
    risk_level: str = Field(description="LOW | MEDIUM | HIGH | CRITICAL")
    reasons: list[str]
    model_trained: bool

class LoginAttemptEvent(BaseModel):
    identifier: str = Field(description="IP address or email hash")
    success: bool
    ip: str
    user_agent: Optional[str] = None
    timestamp_ms: Optional[int] = None

class BruteForceResult(BaseModel):
    is_brute_force: bool
    attempts_last_10min: int
    attempts_last_1h: int
    risk_level: str
    lockout_recommended: bool

class RequestEvent(BaseModel):
    ip: str
    path: str
    method: str
    status_code: int
    response_time_ms: float
    timestamp_ms: Optional[int] = None

class DDoSResult(BaseModel):
    is_ddos: bool
    requests_per_minute: float
    spike_ratio: float = Field(description="Current RPM / baseline RPM")
    risk_level: str
    affected_paths: list[str]

class ThreatFeedEntry(BaseModel):
    ip: Optional[str] = None
    domain: Optional[str] = None
    hash: Optional[str] = None
    threat_type: str = "unknown"
    confidence: float = Field(ge=0.0, le=1.0, default=0.5)
    source: str = "manual"

class IPReputationResult(BaseModel):
    ip: str
    is_known_bad: bool
    reputation_score: float = Field(description="0.0 (clean) to 1.0 (malicious)")
    risk_factors: list[str]
    geo_velocity_anomaly: bool

# ─── Helper: Extract Features ──────────────────────────────────────────────────

def _extract_features(tx: TransactionFeatures) -> list[float]:
    """Convert transaction to numeric feature vector for Isolation Forest."""
    category_map = {
        "food": 0, "retail": 1, "travel": 2, "entertainment": 3,
        "utilities": 4, "financial": 5, "crypto": 6, "unknown": 7,
    }
    return [
        float(tx.amount),
        float(tx.hour_of_day),
        float(tx.day_of_week),
        float(1 if tx.is_international else 0),
        float(tx.velocity_1h),
        float(tx.velocity_24h),
        float(category_map.get(tx.merchant_category.lower(), 7)),
    ]

def _rule_based_anomaly(tx: TransactionFeatures) -> tuple[bool, list[str]]:
    """Fast rule-based anomaly detection (runs before ML model)."""
    reasons = []
    # High velocity
    if tx.velocity_1h > 20:
        reasons.append(f"Extreme velocity: {tx.velocity_1h} transactions in 1 hour")
    elif tx.velocity_1h > 10:
        reasons.append(f"High velocity: {tx.velocity_1h} transactions in 1 hour")
    # Unusual hours (2am–5am local)
    if 2 <= tx.hour_of_day <= 5:
        reasons.append(f"Unusual transaction hour: {tx.hour_of_day}:00")
    # Large amounts (>500k NGN or equivalent)
    if tx.currency == "NGN" and tx.amount > 500_000:
        reasons.append(f"Large NGN transaction: ₦{tx.amount:,.0f}")
    elif tx.currency == "USD" and tx.amount > 5_000:
        reasons.append(f"Large USD transaction: ${tx.amount:,.2f}")
    # International + high amount
    if tx.is_international and tx.amount > 100_000:
        reasons.append("International high-value transaction")
    return len(reasons) > 0, reasons

# ─── Endpoints ─────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "threat-intel",
        "version": "1.0.0",
        "model_trained": _iso_forest_trained,
        "training_samples": len(_iso_training_buffer),
        "known_bad_ips": len(_known_bad_ips),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.get("/metrics")
def metrics():
    return Response(generate_latest(), media_type=CONTENT_TYPE_LATEST)

@app.post("/analyze/transaction", response_model=AnomalyResult)
def analyze_transaction(
    tx: TransactionFeatures,
    x_internal_key: Optional[str] = Header(None),
):
    """
    Analyze a transaction for anomalies using Isolation Forest + rule-based checks.
    Returns risk level and reasons for flagging.
    """
    _verify_key(x_internal_key)
    start = time.monotonic()

    reasons: list[str] = []
    is_anomaly = False
    score = 0.0

    # 1. Rule-based checks (fast path)
    rule_anomaly, rule_reasons = _rule_based_anomaly(tx)
    reasons.extend(rule_reasons)

    # 2. Add to training buffer and update velocity window
    features = _extract_features(tx)
    _iso_training_buffer.append(features)
    now = time.time()
    _tx_windows[tx.account_id].append((now, tx.amount))

    # 3. ML anomaly detection (if model trained)
    model = _get_iso_forest()
    if model is not None:
        X = np.array([features])
        pred = model.predict(X)[0]   # -1 = anomaly, 1 = normal
        raw_score = model.score_samples(X)[0]  # More negative = more anomalous
        score = float(raw_score)
        if pred == -1:
            is_anomaly = True
            reasons.append(f"ML model flagged as anomaly (score: {score:.3f})")
    else:
        # Model not trained yet — use rules only
        is_anomaly = rule_anomaly
        score = -1.0 if rule_anomaly else 0.5

    # 4. Determine risk level
    n_reasons = len(reasons)
    if is_anomaly and n_reasons >= 3:
        risk_level = "CRITICAL"
    elif is_anomaly and n_reasons >= 2:
        risk_level = "HIGH"
    elif is_anomaly or n_reasons >= 1:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    if is_anomaly:
        ANOMALY_COUNTER.labels(type="transaction").inc()

    ANALYSIS_LATENCY.labels(endpoint="transaction").observe(time.monotonic() - start)
    REQUEST_COUNTER.labels(endpoint="transaction", status="ok").inc()

    return AnomalyResult(
        is_anomaly=is_anomaly,
        score=score,
        risk_level=risk_level,
        reasons=reasons,
        model_trained=_iso_forest_trained,
    )

@app.post("/analyze/login", response_model=BruteForceResult)
def analyze_login(
    event: LoginAttemptEvent,
    x_internal_key: Optional[str] = Header(None),
):
    """
    Analyze login events for brute-force patterns.
    Uses sliding window counters over 10-minute and 1-hour windows.
    """
    _verify_key(x_internal_key)

    now_ms = event.timestamp_ms or int(time.time() * 1000)
    now_s = now_ms / 1000

    if not event.success:
        _login_fail_windows[event.identifier].append(now_s)

    # Count failures in windows
    window_10min = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 600)
    window_1h = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 3600)

    # Thresholds
    is_brute_force = window_10min >= 5 or window_1h >= 15
    lockout_recommended = window_10min >= 5

    if window_10min >= 10 or window_1h >= 30:
        risk_level = "CRITICAL"
    elif window_10min >= 5 or window_1h >= 15:
        risk_level = "HIGH"
    elif window_10min >= 3:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    if is_brute_force:
        ANOMALY_COUNTER.labels(type="brute_force").inc()

    REQUEST_COUNTER.labels(endpoint="login", status="ok").inc()

    return BruteForceResult(
        is_brute_force=is_brute_force,
        attempts_last_10min=window_10min,
        attempts_last_1h=window_1h,
        risk_level=risk_level,
        lockout_recommended=lockout_recommended,
    )

@app.post("/analyze/ddos", response_model=DDoSResult)
def analyze_ddos(
    event: RequestEvent,
    x_internal_key: Optional[str] = Header(None),
):
    """
    Analyze request events for DDoS patterns.
    Detects request-rate spikes using a 60-second sliding window.
    """
    _verify_key(x_internal_key)

    now_s = (event.timestamp_ms or int(time.time() * 1000)) / 1000
    _request_windows[event.ip].append(now_s)

    # Count requests in last 60 seconds
    recent = [t for t in _request_windows[event.ip] if now_s - t <= 60]
    rpm = len(recent)

    # Baseline: 10 req/min is normal; 50+ is suspicious; 200+ is DDoS
    baseline_rpm = 10.0
    spike_ratio = rpm / baseline_rpm

    is_ddos = rpm >= 200 or spike_ratio >= 20
    if rpm >= 500 or spike_ratio >= 50:
        risk_level = "CRITICAL"
    elif rpm >= 200 or spike_ratio >= 20:
        risk_level = "HIGH"
    elif rpm >= 100 or spike_ratio >= 10:
        risk_level = "MEDIUM"
    else:
        risk_level = "LOW"

    # Track affected paths (last 20 paths for this IP)
    affected_paths: list[str] = [event.path]

    if is_ddos:
        ANOMALY_COUNTER.labels(type="ddos").inc()

    REQUEST_COUNTER.labels(endpoint="ddos", status="ok").inc()

    return DDoSResult(
        is_ddos=is_ddos,
        requests_per_minute=float(rpm),
        spike_ratio=spike_ratio,
        risk_level=risk_level,
        affected_paths=affected_paths,
    )

@app.post("/analyze/ip-reputation", response_model=IPReputationResult)
def analyze_ip_reputation(
    ip: str,
    x_internal_key: Optional[str] = Header(None),
):
    """
    Score IP reputation based on known-bad-IP list and geo-velocity heuristics.
    """
    _verify_key(x_internal_key)

    risk_factors: list[str] = []
    reputation_score = 0.0

    # Known bad IP
    is_known_bad = ip in _known_bad_ips
    if is_known_bad:
        risk_factors.append("IP in known-bad threat feed")
        reputation_score += 0.8

    # High request rate (DDoS indicator)
    now_s = time.time()
    recent_requests = sum(1 for t in _request_windows[ip] if now_s - t <= 60)
    if recent_requests >= 200:
        risk_factors.append(f"Extremely high request rate: {recent_requests} req/min")
        reputation_score += 0.6
    elif recent_requests >= 50:
        risk_factors.append(f"High request rate: {recent_requests} req/min")
        reputation_score += 0.3

    # High login failure rate
    recent_fails = sum(1 for t in _login_fail_windows[ip] if now_s - t <= 600)
    if recent_fails >= 5:
        risk_factors.append(f"High login failure rate: {recent_fails} failures in 10min")
        reputation_score += 0.4

    # Geo-velocity anomaly (simplified: flag if IP appears in multiple windows rapidly)
    geo_velocity_anomaly = recent_requests > 100 and recent_fails > 3
    if geo_velocity_anomaly:
        risk_factors.append("Geo-velocity anomaly detected")
        reputation_score += 0.3

    reputation_score = min(reputation_score, 1.0)
    REQUEST_COUNTER.labels(endpoint="ip_reputation", status="ok").inc()

    return IPReputationResult(
        ip=ip,
        is_known_bad=is_known_bad,
        reputation_score=reputation_score,
        risk_factors=risk_factors,
        geo_velocity_anomaly=geo_velocity_anomaly,
    )

@app.post("/threat-feed/ingest")
def ingest_threat_feed(
    entries: list[ThreatFeedEntry],
    x_internal_key: Optional[str] = Header(None),
):
    """
    Ingest threat intelligence feed entries (IPs, domains, hashes).
    Supports MISP-compatible IOC format.
    """
    _verify_key(x_internal_key)

    ingested = 0
    for entry in entries:
        if entry.ip and entry.confidence >= 0.5:
            _known_bad_ips.add(entry.ip)
            ingested += 1

    log.info("threat_feed_ingested", count=ingested, total_known_bad=len(_known_bad_ips))
    return {"ingested": ingested, "total_known_bad_ips": len(_known_bad_ips)}

@app.get("/threat-feed/stats")
def threat_feed_stats(x_internal_key: Optional[str] = Header(None)):
    """Return current threat intelligence statistics."""
    _verify_key(x_internal_key)
    return {
        "known_bad_ips": len(_known_bad_ips),
        "tracked_ips": len(_request_windows),
        "tracked_login_identifiers": len(_login_fail_windows),
        "iso_forest_trained": _iso_forest_trained,
        "iso_training_samples": len(_iso_training_buffer),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

# ─── Entry Point ───────────────────────────────────────────────────────────────
if __name__ == "__main__":
    log.info("threat_intel_starting", port=PORT)
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
        access_log=True,
    )
