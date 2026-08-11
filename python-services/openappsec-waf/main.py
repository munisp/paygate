"""
PayGate OpenAppSec WAF Integration Service
===========================================
Bridges OpenAppSec (open-source ML-based WAF) with the PayGate platform.

Responsibilities:
  1. Expose a policy management REST API for the merchant portal
  2. Consume WAF block/allow events from OpenAppSec syslog/webhook and publish to Kafka
  3. Sync per-merchant IP allowlists and rate-limit policies to OpenAppSec via its API
  4. Provide a real-time threat feed endpoint consumed by APISIX for dynamic blocking

Architecture:
  - OpenAppSec agent runs as a sidecar/DaemonSet and calls this service for policy decisions
  - This service maintains a Redis cache of blocked IPs, rate limits, and merchant policies
  - Kafka topic `paygate.waf.events` receives all WAF decisions for audit and SIEM

Endpoints:
  GET  /health
  GET  /v1/waf/policy/{merchant_id}      — get merchant WAF policy
  PUT  /v1/waf/policy/{merchant_id}      — update merchant WAF policy
  POST /v1/waf/event                     — receive WAF event from OpenAppSec
  GET  /v1/waf/blocked-ips               — list currently blocked IPs (for APISIX sync)
  POST /v1/waf/ip-allowlist/{merchant_id} — add IP to merchant allowlist
  DELETE /v1/waf/ip-allowlist/{merchant_id}/{ip} — remove IP from allowlist
  GET  /v1/waf/stats                     — aggregated WAF statistics

Environment variables:
  PORT                  — HTTP port (default: 8130)
  REDIS_URL             — Redis connection string (default: redis://redis:6379/0)
  KAFKA_BROKERS         — Kafka bootstrap servers (default: kafka:29092)
  OPENAPPSEC_API_URL    — OpenAppSec management API URL (default: http://openappsec:8080)
  OPENAPPSEC_API_KEY    — OpenAppSec API key
  APISIX_ADMIN_URL      — APISIX admin API URL (default: http://apisix:9180)
  APISIX_API_KEY        — APISIX admin API key (default: edd1c9f034335f136f87ad84b625c8f1)
  IP_BLOCK_TTL_SECS     — How long to block an IP (default: 3600)
  LOG_LEVEL             — Logging level (default: INFO)
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import redis
import requests
import uvicorn
from confluent_kafka import Producer
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

# ─── Configuration ────────────────────────────────────────────────────────────

PORT = int(os.getenv("PORT", "8130"))
REDIS_URL = os.getenv("REDIS_URL", "redis://redis:6379/0")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:29092")
OPENAPPSEC_API_URL = os.getenv("OPENAPPSEC_API_URL", "http://openappsec:8080").rstrip("/")
OPENAPPSEC_API_KEY = os.getenv("OPENAPPSEC_API_KEY", "")
APISIX_ADMIN_URL = os.getenv("APISIX_ADMIN_URL", "http://apisix:9180").rstrip("/")
APISIX_API_KEY = os.getenv("APISIX_API_KEY", "edd1c9f034335f136f87ad84b625c8f1")
IP_BLOCK_TTL_SECS = int(os.getenv("IP_BLOCK_TTL_SECS", "3600"))
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("openappsec-waf")

# ─── Redis client ─────────────────────────────────────────────────────────────

_redis: Optional[redis.Redis] = None

def get_redis() -> redis.Redis:
    global _redis
    if _redis is None:
        _redis = redis.from_url(REDIS_URL, decode_responses=True)
    return _redis

# ─── Kafka producer ───────────────────────────────────────────────────────────

_producer: Optional[Producer] = None

def get_producer() -> Producer:
    global _producer
    if _producer is None:
        _producer = Producer({"bootstrap.servers": KAFKA_BROKERS})
    return _producer

def publish_waf_event(event: Dict) -> None:
    try:
        payload = json.dumps(event).encode()
        get_producer().produce("paygate.waf.events", key=event.get("id", "").encode(), value=payload)
        get_producer().poll(0)
    except Exception as e:
        logger.error("Kafka publish failed: %s", e)

# ─── APISIX sync ─────────────────────────────────────────────────────────────

def sync_blocked_ip_to_apisix(ip: str, block: bool) -> None:
    """Add or remove an IP from APISIX's IP restriction plugin via admin API."""
    headers = {"X-API-KEY": APISIX_API_KEY, "Content-Type": "application/json"}
    route_id = "paygate-global"
    url = f"{APISIX_ADMIN_URL}/apisix/admin/routes/{route_id}"
    try:
        resp = requests.get(url, headers=headers, timeout=5)
        if resp.status_code != 200:
            logger.warning("APISIX get route failed: %s", resp.status_code)
            return
        route = resp.json().get("value", {})
        plugins = route.get("plugins", {})
        ip_restriction = plugins.get("ip-restriction", {"whitelist": [], "blacklist": []})

        blacklist: List[str] = ip_restriction.get("blacklist", [])
        if block and ip not in blacklist:
            blacklist.append(ip)
        elif not block and ip in blacklist:
            blacklist.remove(ip)

        ip_restriction["blacklist"] = blacklist
        plugins["ip-restriction"] = ip_restriction
        route["plugins"] = plugins

        r = requests.put(url, json=route, headers=headers, timeout=5)
        if r.status_code in (200, 201):
            logger.info("APISIX IP %s %s", ip, "blocked" if block else "unblocked")
        else:
            logger.warning("APISIX sync failed: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("APISIX sync error: %s", e)

# ─── Pydantic models ──────────────────────────────────────────────────────────

class WAFPolicy(BaseModel):
    merchant_id: str
    enabled: bool = True
    rate_limit_rps: int = Field(default=100, ge=1, le=10000)
    ip_allowlist: List[str] = Field(default_factory=list)
    ip_blocklist: List[str] = Field(default_factory=list)
    block_tor_exit_nodes: bool = True
    block_known_scanners: bool = True
    min_threat_score_to_block: int = Field(default=80, ge=0, le=100)
    custom_rules: List[Dict[str, Any]] = Field(default_factory=list)

class WAFEvent(BaseModel):
    source_ip: str
    merchant_id: Optional[str] = None
    path: str
    method: str
    threat_type: str  # e.g. "sqli", "xss", "rce", "lfi", "csrf"
    threat_score: int = Field(ge=0, le=100)
    action: str  # "block" | "detect" | "allow"
    user_agent: Optional[str] = None
    request_id: Optional[str] = None
    timestamp: Optional[str] = None

class IPAllowlistEntry(BaseModel):
    ip: str
    label: Optional[str] = None

# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(title="PayGate OpenAppSec WAF", version="1.0.0")

@app.get("/health")
def health():
    try:
        get_redis().ping()
        redis_ok = True
    except Exception:
        redis_ok = False
    return {"status": "ok", "redis": redis_ok, "timestamp": datetime.now(timezone.utc).isoformat()}

@app.get("/v1/waf/policy/{merchant_id}")
def get_policy(merchant_id: str):
    r = get_redis()
    raw = r.get(f"waf:policy:{merchant_id}")
    if not raw:
        # Return default policy
        policy = WAFPolicy(merchant_id=merchant_id)
        return policy.model_dump()
    return json.loads(raw)

@app.put("/v1/waf/policy/{merchant_id}")
def update_policy(merchant_id: str, policy: WAFPolicy):
    policy.merchant_id = merchant_id
    r = get_redis()
    r.set(f"waf:policy:{merchant_id}", policy.model_dump_json())

    # Sync IP blocklist to APISIX
    for ip in policy.ip_blocklist:
        r.setex(f"waf:blocked_ip:{ip}", IP_BLOCK_TTL_SECS, merchant_id)
        sync_blocked_ip_to_apisix(ip, block=True)

    logger.info("WAF policy updated for merchant %s", merchant_id)
    return {"status": "updated", "merchant_id": merchant_id}

@app.post("/v1/waf/event")
async def receive_waf_event(event: WAFEvent):
    """Receive a WAF decision event from OpenAppSec."""
    event_id = str(uuid.uuid4())
    r = get_redis()

    # Auto-block IPs with high threat scores
    if event.action == "block" and event.threat_score >= 80:
        r.setex(f"waf:blocked_ip:{event.source_ip}", IP_BLOCK_TTL_SECS, event.merchant_id or "global")
        sync_blocked_ip_to_apisix(event.source_ip, block=True)
        logger.warning("Auto-blocked IP %s (score=%d, type=%s)", event.source_ip, event.threat_score, event.threat_type)

    # Increment threat counters
    r.incr(f"waf:stats:total")
    r.incr(f"waf:stats:{event.action}")
    r.incr(f"waf:stats:threat:{event.threat_type}")

    # Publish to Kafka
    kafka_event = {
        "id": event_id,
        "source_ip": event.source_ip,
        "merchant_id": event.merchant_id,
        "path": event.path,
        "method": event.method,
        "threat_type": event.threat_type,
        "threat_score": event.threat_score,
        "action": event.action,
        "user_agent": event.user_agent,
        "request_id": event.request_id,
        "timestamp": event.timestamp or datetime.now(timezone.utc).isoformat(),
        "@timestamp": datetime.now(timezone.utc).isoformat(),
    }
    publish_waf_event(kafka_event)

    return {"status": "received", "event_id": event_id, "auto_blocked": event.action == "block" and event.threat_score >= 80}

@app.get("/v1/waf/blocked-ips")
def get_blocked_ips():
    """Return all currently blocked IPs (consumed by APISIX for sync)."""
    r = get_redis()
    keys = r.keys("waf:blocked_ip:*")
    blocked = []
    for key in keys:
        ip = key.replace("waf:blocked_ip:", "")
        ttl = r.ttl(key)
        blocked.append({"ip": ip, "ttl_remaining": ttl})
    return {"blocked_ips": blocked, "count": len(blocked)}

@app.post("/v1/waf/ip-allowlist/{merchant_id}")
def add_to_allowlist(merchant_id: str, entry: IPAllowlistEntry):
    r = get_redis()
    raw = r.get(f"waf:policy:{merchant_id}")
    policy = WAFPolicy(**json.loads(raw)) if raw else WAFPolicy(merchant_id=merchant_id)

    if entry.ip not in policy.ip_allowlist:
        policy.ip_allowlist.append(entry.ip)
        r.set(f"waf:policy:{merchant_id}", policy.model_dump_json())

    # Remove from blocklist if present
    r.delete(f"waf:blocked_ip:{entry.ip}")
    sync_blocked_ip_to_apisix(entry.ip, block=False)

    return {"status": "added", "ip": entry.ip, "merchant_id": merchant_id}

@app.delete("/v1/waf/ip-allowlist/{merchant_id}/{ip}")
def remove_from_allowlist(merchant_id: str, ip: str):
    r = get_redis()
    raw = r.get(f"waf:policy:{merchant_id}")
    if not raw:
        raise HTTPException(status_code=404, detail="Policy not found")
    policy = WAFPolicy(**json.loads(raw))
    if ip in policy.ip_allowlist:
        policy.ip_allowlist.remove(ip)
        r.set(f"waf:policy:{merchant_id}", policy.model_dump_json())
    return {"status": "removed", "ip": ip}

@app.get("/v1/waf/stats")
def get_stats():
    r = get_redis()
    return {
        "total": int(r.get("waf:stats:total") or 0),
        "blocked": int(r.get("waf:stats:block") or 0),
        "detected": int(r.get("waf:stats:detect") or 0),
        "allowed": int(r.get("waf:stats:allow") or 0),
        "sqli": int(r.get("waf:stats:threat:sqli") or 0),
        "xss": int(r.get("waf:stats:threat:xss") or 0),
        "rce": int(r.get("waf:stats:threat:rce") or 0),
        "lfi": int(r.get("waf:stats:threat:lfi") or 0),
        "currently_blocked_ips": len(r.keys("waf:blocked_ip:*")),
    }

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
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level=LOG_LEVEL.lower())
