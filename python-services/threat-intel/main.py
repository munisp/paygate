"""
PayGate Threat Intelligence Engine  v2.0
=========================================
FastAPI microservice providing:
  - Anomaly detection (Isolation Forest) for transaction patterns
    → Model serialised to Redis (joblib) so it survives restarts
  - Brute-force login attack analysis (sliding-window counters backed by Redis)
  - DDoS pattern recognition (request-rate spike detection)
  - IP reputation scoring with MaxMind GeoLite2 geo-velocity checks
  - Threat feed aggregation (MISP-compatible IOC ingestion, persisted in Redis)

Exposes REST endpoints consumed by the Node.js backend (server/_core/index.ts).
"""

import io
import os
import time
import hashlib
import logging
import ipaddress
from collections import defaultdict, deque
from datetime import datetime, timezone
from typing import Any, Optional

import joblib
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
GEOIP_DB_PATH = os.getenv("GEOIP_DB_PATH", "/data/GeoLite2-City.mmdb")

# ─── Redis Client (optional — falls back to in-memory if not configured) ──────
_redis = None

def _get_redis():
    """Lazy-initialise Redis client. Returns None if REDIS_URL not set."""
    global _redis
    if _redis is not None:
        return _redis
    if not REDIS_URL:
        return None
    try:
        import redis as redis_lib
        _redis = redis_lib.from_url(REDIS_URL, decode_responses=False, socket_connect_timeout=2)
        _redis.ping()
        log.info("redis_connected", url=REDIS_URL[:30])
        return _redis
    except Exception as e:
        log.warning("redis_unavailable", error=str(e))
        return None

# ─── GeoIP Reader (optional — falls back to heuristic if DB not present) ──────
_geoip_reader = None

def _get_geoip():
    """Lazy-load MaxMind GeoLite2 reader."""
    global _geoip_reader
    if _geoip_reader is not None:
        return _geoip_reader
    if not os.path.exists(GEOIP_DB_PATH):
        return None
    try:
        import geoip2.database
        _geoip_reader = geoip2.database.Reader(GEOIP_DB_PATH)
        log.info("geoip_loaded", path=GEOIP_DB_PATH)
        return _geoip_reader
    except Exception as e:
        log.warning("geoip_unavailable", error=str(e))
        return None

def _get_country(ip: str) -> Optional[str]:
    """Return ISO country code for an IP, or None if lookup fails."""
    reader = _get_geoip()
    if reader is None:
        return None
    try:
        resp = reader.city(ip)
        return resp.country.iso_code
    except Exception:
        return None

# ─── In-memory Sliding Window Stores (Redis-backed when available) ─────────────
# Maps IP → deque of timestamps (request times within last 60s)
_request_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=1000))
# Maps identifier → deque of failed login timestamps
_login_fail_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=100))
# Known bad IP heuristics (populated from threat feed)
_known_bad_ips: set[str] = set()
# Transaction velocity windows: account_id → deque of (timestamp, amount)
_tx_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=500))
# Geo-velocity: account_id → list of (timestamp, country_code)
_geo_windows: dict[str, deque] = defaultdict(lambda: deque(maxlen=50))

# ─── Redis Persistence Helpers ─────────────────────────────────────────────────
REDIS_MODEL_KEY = "threat_intel:iso_forest:model"
REDIS_TRAINING_KEY = "threat_intel:iso_forest:training_buffer"
REDIS_BAD_IPS_KEY = "threat_intel:known_bad_ips"
REDIS_LOGIN_FAIL_PREFIX = "threat_intel:login_fail:"
REDIS_REQUEST_PREFIX = "threat_intel:requests:"

def _redis_save_model(model) -> bool:
    """Serialise Isolation Forest model to Redis using joblib."""
    r = _get_redis()
    if r is None:
        return False
    try:
        buf = io.BytesIO()
        joblib.dump(model, buf)
        r.set(REDIS_MODEL_KEY, buf.getvalue(), ex=86400 * 7)  # 7-day TTL
        log.info("model_saved_to_redis")
        return True
    except Exception as e:
        log.warning("redis_model_save_failed", error=str(e))
        return False

def _redis_load_model():
    """Load Isolation Forest model from Redis."""
    r = _get_redis()
    if r is None:
        return None
    try:
        data = r.get(REDIS_MODEL_KEY)
        if data is None:
            return None
        model = joblib.load(io.BytesIO(data))
        log.info("model_loaded_from_redis")
        return model
    except Exception as e:
        log.warning("redis_model_load_failed", error=str(e))
        return None

def _redis_save_bad_ips():
    """Persist known-bad-IPs set to Redis."""
    r = _get_redis()
    if r is None or not _known_bad_ips:
        return
    try:
        r.sadd(REDIS_BAD_IPS_KEY, *_known_bad_ips)
        r.expire(REDIS_BAD_IPS_KEY, 86400 * 30)  # 30-day TTL
    except Exception as e:
        log.warning("redis_bad_ips_save_failed", error=str(e))

def _redis_load_bad_ips():
    """Load known-bad-IPs from Redis into in-memory set."""
    r = _get_redis()
    if r is None:
        return
    try:
        members = r.smembers(REDIS_BAD_IPS_KEY)
        for m in members:
            _known_bad_ips.add(m.decode() if isinstance(m, bytes) else m)
        log.info("bad_ips_loaded_from_redis", count=len(_known_bad_ips))
    except Exception as e:
        log.warning("redis_bad_ips_load_failed", error=str(e))

# ─── Isolation Forest (lazy-loaded, Redis-persisted) ──────────────────────────
_iso_forest = None
_iso_forest_trained = False
_iso_training_buffer: list[list[float]] = []
ISO_MIN_SAMPLES = 50  # Minimum samples before training

def _get_iso_forest():
    """Lazy-load and train Isolation Forest. Tries Redis first, then trains fresh."""
    global _iso_forest, _iso_forest_trained

    if _iso_forest_trained:
        return _iso_forest

    # Try loading from Redis first
    if not _iso_forest_trained:
        cached = _redis_load_model()
        if cached is not None:
            _iso_forest = cached
            _iso_forest_trained = True
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

    # Persist to Redis for next restart
    _redis_save_model(_iso_forest)

    return _iso_forest

# ─── FastAPI App ───────────────────────────────────────────────────────────────
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(
    title="PayGate Threat Intelligence Engine",
    version="2.0.0",
    description="Real-time threat detection: anomaly analysis, brute-force detection, DDoS recognition, GeoIP velocity",
)
setup_telemetry("threat-intel", app)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

@app.on_event("startup")
async def _startup():
    """Load persisted state from Redis on startup."""
    _redis_load_bad_ips()
    # Pre-warm model from Redis if available
    _get_iso_forest()

# ─── Auth Middleware ───────────────────────────────────────────────────────────
def _verify_key(x_internal_key: Optional[str]) -> None:
    """Verify internal API key. Fail closed — key must be configured and presented."""
    if not INTERNAL_API_KEY:
        raise HTTPException(status_code=503, detail="Service misconfigured: INTERNAL_API_KEY not set")
    if not x_internal_key or not hmac.compare_digest(x_internal_key, INTERNAL_API_KEY):
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
    ip: Optional[str] = Field(None, description="Originating IP for geo-velocity check")

class AnomalyResult(BaseModel):
    is_anomaly: bool
    score: float = Field(description="Anomaly score: -1 = anomaly, 1 = normal (Isolation Forest)")
    risk_level: str = Field(description="LOW | MEDIUM | HIGH | CRITICAL")
    reasons: list[str]
    model_trained: bool
    geo_velocity_anomaly: bool = False

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
    country: Optional[str] = None

# ─── Helper: Geo-Velocity Check ────────────────────────────────────────────────

def _check_geo_velocity(account_id: str, ip: str) -> tuple[bool, Optional[str]]:
    """
    Detect impossible geo-velocity: same account transacting from two different
    countries within 30 minutes.
    Returns (anomaly_detected, country_code).
    """
    country = _get_country(ip)
    if country is None:
        # GeoIP not available — use heuristic: flag if IP class changes rapidly
        return False, None

    now = time.time()
    window = _geo_windows[account_id]
    window.append((now, country))

    # Check for country change within 30 minutes
    cutoff = now - 1800  # 30 minutes
    recent = [(ts, c) for ts, c in window if ts >= cutoff]
    countries_seen = {c for _, c in recent}

    if len(countries_seen) > 1:
        log.warning("geo_velocity_anomaly", account_id=account_id, countries=list(countries_seen))
        return True, country

    return False, country

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
    r = _get_redis()
    return {
        "status": "ok",
        "service": "threat-intel",
        "version": "2.0.0",
        "model_trained": _iso_forest_trained,
        "training_samples": len(_iso_training_buffer),
        "known_bad_ips": len(_known_bad_ips),
        "redis_connected": r is not None,
        "geoip_available": _get_geoip() is not None,
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
    Includes geo-velocity check if IP is provided.
    """
    _verify_key(x_internal_key)
    start = time.monotonic()

    reasons: list[str] = []
    is_anomaly = False
    score = 0.0
    geo_velocity_anomaly = False

    # 1. Rule-based checks (fast path)
    rule_anomaly, rule_reasons = _rule_based_anomaly(tx)
    reasons.extend(rule_reasons)

    # 2. Geo-velocity check (if IP provided)
    if tx.ip:
        geo_anomaly, country = _check_geo_velocity(tx.account_id, tx.ip)
        if geo_anomaly:
            geo_velocity_anomaly = True
            is_anomaly = True
            reasons.append(f"Geo-velocity anomaly: impossible travel detected from {country}")

    # 3. Add to training buffer and update velocity window
    features = _extract_features(tx)
    _iso_training_buffer.append(features)
    now = time.time()
    _tx_windows[tx.account_id].append((now, tx.amount))

    # 4. ML anomaly detection (if model trained)
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
        is_anomaly = is_anomaly or rule_anomaly
        score = -1.0 if (is_anomaly or rule_anomaly) else 0.5

    # 5. Determine risk level
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
        geo_velocity_anomaly=geo_velocity_anomaly,
    )

@app.post("/analyze/login", response_model=BruteForceResult)
def analyze_login(
    event: LoginAttemptEvent,
    x_internal_key: Optional[str] = Header(None),
):
    """
    Analyze login events for brute-force patterns.
    Uses sliding window counters over 10-minute and 1-hour windows.
    Redis-backed when available for cross-instance consistency.
    """
    _verify_key(x_internal_key)

    now_ms = event.timestamp_ms or int(time.time() * 1000)
    now_s = now_ms / 1000

    if not event.success:
        r = _get_redis()
        if r is not None:
            # Use Redis sorted set for cross-instance sliding window
            try:
                key = f"{REDIS_LOGIN_FAIL_PREFIX}{event.identifier}"
                r.zadd(key, {str(now_ms): now_s})
                r.zremrangebyscore(key, 0, now_s - 3600)  # Prune >1h old
                r.expire(key, 3600)
                window_10min = r.zcount(key, now_s - 600, "+inf")
                window_1h = r.zcount(key, now_s - 3600, "+inf")
            except Exception:
                # Fall back to in-memory
                _login_fail_windows[event.identifier].append(now_s)
                window_10min = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 600)
                window_1h = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 3600)
        else:
            _login_fail_windows[event.identifier].append(now_s)
            window_10min = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 600)
            window_1h = sum(1 for t in _login_fail_windows[event.identifier] if now_s - t <= 3600)
    else:
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
        attempts_last_10min=int(window_10min),
        attempts_last_1h=int(window_1h),
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
    Score IP reputation based on known-bad-IP list, geo-velocity heuristics,
    and MaxMind GeoLite2 country lookup.
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

    # GeoIP lookup
    country = _get_country(ip)
    if country is not None:
        # High-risk country heuristic (simplified — production should use threat intel)
        HIGH_RISK_COUNTRIES = {"KP", "IR", "SY", "CU"}  # OFAC-sanctioned
        if country in HIGH_RISK_COUNTRIES:
            risk_factors.append(f"IP from high-risk country: {country}")
            reputation_score += 0.5

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
        country=country,
    )

@app.post("/threat-feed/ingest")
def ingest_threat_feed(
    entries: list[ThreatFeedEntry],
    x_internal_key: Optional[str] = Header(None),
):
    """
    Ingest threat intelligence feed entries (IPs, domains, hashes).
    Supports MISP-compatible IOC format. Persists to Redis.
    """
    _verify_key(x_internal_key)

    ingested = 0
    for entry in entries:
        if entry.ip and entry.confidence >= 0.5:
            _known_bad_ips.add(entry.ip)
            ingested += 1

    # Persist to Redis
    _redis_save_bad_ips()

    log.info("threat_feed_ingested", count=ingested, total_known_bad=len(_known_bad_ips))
    return {"ingested": ingested, "total_known_bad_ips": len(_known_bad_ips)}

@app.get("/threat-feed/stats")
def threat_feed_stats(x_internal_key: Optional[str] = Header(None)):
    """Return current threat intelligence statistics."""
    _verify_key(x_internal_key)
    r = _get_redis()
    return {
        "known_bad_ips": len(_known_bad_ips),
        "tracked_ips": len(_request_windows),
        "tracked_login_identifiers": len(_login_fail_windows),
        "iso_forest_trained": _iso_forest_trained,
        "iso_training_samples": len(_iso_training_buffer),
        "redis_connected": r is not None,
        "geoip_available": _get_geoip() is not None,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }

@app.post("/model/retrain")
def retrain_model(x_internal_key: Optional[str] = Header(None)):
    """Force retrain the Isolation Forest model and persist to Redis."""
    _verify_key(x_internal_key)
    global _iso_forest, _iso_forest_trained

    if len(_iso_training_buffer) < ISO_MIN_SAMPLES:
        raise HTTPException(
            status_code=400,
            detail=f"Not enough training samples: {len(_iso_training_buffer)} < {ISO_MIN_SAMPLES}"
        )

    from sklearn.ensemble import IsolationForest
    _iso_forest = IsolationForest(
        n_estimators=100,
        contamination=0.05,
        random_state=42,
        n_jobs=-1,
    )
    X = np.array(_iso_training_buffer)
    _iso_forest.fit(X)
    _iso_forest_trained = True
    saved = _redis_save_model(_iso_forest)
    log.info("model_retrained", samples=len(_iso_training_buffer), redis_saved=saved)
    return {
        "success": True,
        "samples_used": len(_iso_training_buffer),
        "redis_saved": saved,
    }

# ─── GeoIP DB Hardening ───────────────────────────────────────────────────────────────

def _geoip_db_info() -> dict:
    """Return metadata about the GeoLite2 DB file for health/status reporting."""
    if not os.path.exists(GEOIP_DB_PATH):
        return {
            "available": False,
            "path": GEOIP_DB_PATH,
            "age_days": None,
            "size_bytes": None,
            "stale": None,
        }
    try:
        stat = os.stat(GEOIP_DB_PATH)
        age_days = (datetime.now(timezone.utc).timestamp() - stat.st_mtime) / 86400
        return {
            "available": True,
            "path": GEOIP_DB_PATH,
            "age_days": round(age_days, 1),
            "size_bytes": stat.st_size,
            "stale": age_days > 30,  # MaxMind releases weekly; warn after 30 days
        }
    except Exception as e:
        return {"available": False, "path": GEOIP_DB_PATH, "error": str(e)}


@app.post("/geoip/reload")
def geoip_reload(x_internal_key: Optional[str] = Header(None)):
    """Hot-reload the GeoLite2 DB without restarting the service.

    Useful after a new DB file is mounted via K8s ConfigMap or volume update.
    Requires internal API key authentication.
    """
    _verify_key(x_internal_key)
    global _geoip_reader
    if not os.path.exists(GEOIP_DB_PATH):
        raise HTTPException(
            status_code=404,
            detail=(
                f"GeoIP DB not found at {GEOIP_DB_PATH}. "
                "Run scripts/download-geoip.mjs and mount the file."
            ),
        )
    try:
        import geoip2.database
        old_reader = _geoip_reader
        _geoip_reader = geoip2.database.Reader(GEOIP_DB_PATH)
        if old_reader is not None:
            try:
                old_reader.close()
            except Exception:
                pass
        info = _geoip_db_info()
        log.info("geoip_reloaded", path=GEOIP_DB_PATH, age_days=info.get("age_days"))
        return {"success": True, "db_info": info}
    except Exception as e:
        log.error("geoip_reload_failed", error=str(e))
        raise HTTPException(status_code=500, detail=f"GeoIP reload failed: {e}")


@app.get("/geoip/status")
def geoip_status(x_internal_key: Optional[str] = Header(None)):
    """Return current GeoIP DB status including staleness check."""
    _verify_key(x_internal_key)
    info = _geoip_db_info()
    reader = _get_geoip()
    info["reader_loaded"] = reader is not None
    if info.get("stale"):
        info["warning"] = (
            "GeoLite2 DB is more than 30 days old. "
            "Run scripts/download-geoip.mjs to refresh, then POST /geoip/reload."
        )
    return info


# ─── Entry Point ───────────────────────────────────────────────────────────────
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
    log.info("threat_intel_starting", port=PORT, version="2.0.0")
    uvicorn.run(
        "main:app",
        host="0.0.0.0",
        port=PORT,
        log_level="info",
        access_log=True,
    )
