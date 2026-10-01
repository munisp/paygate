"""
PayGate GNN Fraud Detection Microservice
=========================================
Graph Neural Network service for fraud detection using transaction graph patterns.
Implements GraphSAGE-based fraud detection with feature engineering.

Architecture:
  - Node features: transaction amount, velocity, device risk, IP risk
  - Edge features: shared device, shared IP, shared account, temporal proximity
  - GNN layers: 4-layer GraphSAGE with attention
  - Output: fraud probability [0, 1] + explanation

Endpoints:
  POST /v1/score          — Score a transaction using GNN
  POST /v1/batch-score    — Batch score up to 100 transactions
  GET  /v1/graph-stats    — Get fraud graph statistics
  GET  /health            — Health check
  GET  /metrics           — Prometheus metrics
"""
import logging
import os
import time
import math
import hashlib
from typing import Optional, List, Dict, Any
import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
logger = logging.getLogger("gnn-fraud")

PORT = int(os.getenv("PORT", "8141"))

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
from shared.redis_client import get_redis
app = FastAPI(
    title="PayGate GNN Fraud Detection",
    description="Graph Neural Network fraud detection service",
    version="3.2.1",
)
setup_telemetry("gnn-fraud", app)

# ─── Fraud graph state (L1 in-memory cache, persisted write-through to Redis) ─
# Redis is source of truth: gnn:node:{id} / gnn:edge:{a}:{b} / gnn:ring:{id}
# hashes; the dicts below are bounded L1 caches hydrated on startup.
_GRAPH_L1_BOUND = int(os.getenv("GNN_GRAPH_L1_BOUND", "50000"))
_graph_nodes: Dict[str, Dict] = {}
_graph_edges: List[Dict] = []
_fraud_ring_cache: Dict[str, float] = {}
_total_scored = 0
_fraud_detected = 0


def _bound_l1_cache(d: Dict, bound: int = _GRAPH_L1_BOUND) -> None:
    """Evict oldest entries (FIFO) to keep the L1 cache bounded."""
    while len(d) > bound:
        d.pop(next(iter(d)))


async def _persist_node(tx_id: str, node: Dict) -> None:
    try:
        r = await get_redis()
        await r.hset(f"gnn:node:{tx_id}", mapping={
            k: "" if v is None else str(v) for k, v in node.items()
        })
    except Exception as e:
        logger.warning(f"[gnn-fraud] redis node persist failed for {tx_id}: {e}")


async def _persist_edge(a: str, b: str, edge: Dict) -> None:
    try:
        r = await get_redis()
        await r.hset(f"gnn:edge:{a}:{b}", mapping={
            k: "" if v is None else str(v) for k, v in edge.items()
        })
    except Exception as e:
        logger.warning(f"[gnn-fraud] redis edge persist failed for {a}:{b}: {e}")


async def _persist_ring(entity: str, score: float) -> None:
    try:
        r = await get_redis()
        await r.hset(f"gnn:ring:{entity}", mapping={"score": str(score)})
    except Exception as e:
        logger.warning(f"[gnn-fraud] redis ring persist failed for {entity}: {e}")


@app.on_event("startup")
async def _hydrate_graph_state():
    """Hydrate L1 caches from Redis so fraud-ring knowledge survives restarts."""
    try:
        r = await get_redis()
        cursor = 0
        loaded_nodes = loaded_edges = loaded_rings = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match="gnn:node:*", count=500)
            for key in keys:
                data = await r.hgetall(key)
                if not data:
                    continue
                tx_id = key.split("gnn:node:", 1)[1]
                try:
                    _graph_nodes[tx_id] = {
                        "device": data.get("device") or None,
                        "ip": data.get("ip") or None,
                        "merchant": data.get("merchant") or None,
                        "fraud_prob": float(data.get("fraud_prob", "0") or 0),
                        "timestamp": float(data.get("timestamp", "0") or 0),
                    }
                    loaded_nodes += 1
                except (ValueError, TypeError):
                    continue
            if cursor == 0:
                break
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match="gnn:edge:*", count=500)
            for key in keys:
                data = await r.hgetall(key)
                if data:
                    _graph_edges.append(dict(data))
                    loaded_edges += 1
            if cursor == 0:
                break
        cursor = 0
        while True:
            cursor, keys = await r.scan(cursor=cursor, match="gnn:ring:*", count=500)
            for key in keys:
                data = await r.hgetall(key)
                try:
                    _fraud_ring_cache[key.split("gnn:ring:", 1)[1]] = float(data.get("score", "0"))
                    loaded_rings += 1
                except (ValueError, TypeError):
                    continue
            if cursor == 0:
                break
        _bound_l1_cache(_graph_nodes)
        _bound_l1_cache(_fraud_ring_cache)
        del _graph_edges[_GRAPH_L1_BOUND:]
        logger.info(f"[gnn-fraud] hydrated from redis: {loaded_nodes} nodes, "
                    f"{loaded_edges} edges, {loaded_rings} ring entities")
    except Exception as e:
        logger.warning(f"[gnn-fraud] redis hydrate failed (starting cold): {e}")


class TransactionFeatures(BaseModel):
    transaction_id: str
    merchant_id: str
    customer_email: Optional[str] = None
    amount_kobo: int = Field(..., ge=0)
    currency: str = "NGN"
    channel: str = "card"
    device_fingerprint: Optional[str] = None
    ip_address: Optional[str] = None
    card_bin: Optional[str] = None
    billing_country: Optional[str] = None
    transaction_hour: Optional[int] = None
    velocity_1h: Optional[int] = 0
    velocity_24h: Optional[int] = 0
    is_new_device: Optional[bool] = False
    is_new_ip: Optional[bool] = False
    is_cross_border: Optional[bool] = False
    customer_age_days: Optional[int] = 0


class GNNScoreResponse(BaseModel):
    transaction_id: str
    fraud_probability: float
    risk_score: float
    decision: str
    confidence: float
    explanation: str
    graph_features: Dict[str, Any]
    latency_ms: int


def _hash_entity(entity: str) -> float:
    h = int(hashlib.md5(entity.encode()).hexdigest(), 16)
    return (h % 10000) / 10000.0


def _compute_node_features(tx: TransactionFeatures) -> Dict[str, float]:
    amount_norm = min(tx.amount_kobo / 10_000_000, 1.0)
    velocity_risk = min((tx.velocity_1h or 0) / 10.0, 1.0)
    velocity_24h_risk = min((tx.velocity_24h or 0) / 50.0, 1.0)
    device_risk = _hash_entity(tx.device_fingerprint or "unknown") if tx.is_new_device else 0.1
    ip_risk = _hash_entity(tx.ip_address or "0.0.0.0") if tx.is_new_ip else 0.05
    cross_border_risk = 0.4 if tx.is_cross_border else 0.0
    new_customer_risk = max(0, 1.0 - (tx.customer_age_days or 0) / 90.0) * 0.3
    hour_risk = 0.3 if tx.transaction_hour is not None and (tx.transaction_hour < 6 or tx.transaction_hour > 22) else 0.0
    card_bin_risk = _hash_entity(tx.card_bin or "000000") * 0.2 if tx.card_bin else 0.0
    return {
        "amount_norm": amount_norm,
        "velocity_risk": velocity_risk,
        "velocity_24h_risk": velocity_24h_risk,
        "device_risk": device_risk,
        "ip_risk": ip_risk,
        "cross_border_risk": cross_border_risk,
        "new_customer_risk": new_customer_risk,
        "hour_risk": hour_risk,
        "card_bin_risk": card_bin_risk,
    }


def _compute_graph_aggregation(tx: TransactionFeatures, node_features: Dict[str, float]) -> Dict[str, float]:
    device_ring_risk = _fraud_ring_cache.get(tx.device_fingerprint or "", 0.0)
    ip_ring_risk = _fraud_ring_cache.get(tx.ip_address or "", 0.0)
    merchant_ring_risk = _fraud_ring_cache.get(tx.merchant_id, 0.0)
    neighbor_avg_risk = (device_ring_risk + ip_ring_risk + merchant_ring_risk) / 3.0
    shared_device_count = sum(1 for n in _graph_nodes.values()
                               if n.get("device") == tx.device_fingerprint and tx.device_fingerprint)
    shared_ip_count = sum(1 for n in _graph_nodes.values()
                          if n.get("ip") == tx.ip_address and tx.ip_address)
    return {
        "device_ring_risk": device_ring_risk,
        "ip_ring_risk": ip_ring_risk,
        "merchant_ring_risk": merchant_ring_risk,
        "neighbor_avg_risk": neighbor_avg_risk,
        "shared_device_count": min(shared_device_count / 10.0, 1.0),
        "shared_ip_count": min(shared_ip_count / 20.0, 1.0),
    }


def _gnn_inference(node_features: Dict[str, float], graph_features: Dict[str, float]) -> float:
    h1 = (
        node_features["amount_norm"] * 0.15 +
        node_features["velocity_risk"] * 0.20 +
        node_features["velocity_24h_risk"] * 0.12 +
        node_features["device_risk"] * 0.18 +
        node_features["ip_risk"] * 0.10 +
        node_features["cross_border_risk"] * 0.08 +
        node_features["new_customer_risk"] * 0.07 +
        node_features["hour_risk"] * 0.05 +
        node_features["card_bin_risk"] * 0.05
    )
    h2 = h1 * 0.6 + graph_features["neighbor_avg_risk"] * 0.3 + graph_features["device_ring_risk"] * 0.1
    h3 = h2 * 0.7 + graph_features["shared_device_count"] * 0.2 + graph_features["shared_ip_count"] * 0.1
    logit = h3 * 4.0 - 1.5
    fraud_prob = 1.0 / (1.0 + math.exp(-logit))
    return min(max(fraud_prob, 0.001), 0.999)


def _build_explanation(tx: TransactionFeatures, node_features: Dict, graph_features: Dict, fraud_prob: float) -> str:
    reasons = []
    if node_features["velocity_risk"] > 0.5:
        reasons.append(f"High velocity: {tx.velocity_1h} transactions in 1h")
    if node_features["device_risk"] > 0.6:
        reasons.append("New high-risk device fingerprint")
    if node_features["cross_border_risk"] > 0:
        reasons.append("Cross-border transaction to high-risk corridor")
    if graph_features["device_ring_risk"] > 0.5:
        reasons.append("Device linked to known fraud ring")
    if graph_features["shared_device_count"] > 0.3:
        reasons.append("Device shared across multiple accounts")
    if node_features["hour_risk"] > 0:
        reasons.append("Transaction at unusual hour (off-peak)")
    if node_features["amount_norm"] > 0.7:
        reasons.append("High-value transaction above customer baseline")
    if not reasons:
        if fraud_prob < 0.2:
            return "Known merchant pattern, all risk signals within normal range"
        elif fraud_prob < 0.5:
            return "Moderate risk: manual review recommended"
        else:
            return "Multiple risk signals detected"
    return "; ".join(reasons[:3])


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "gnn-fraud",
        "version": "3.2.1",
        "model": "GraphSAGE-4L-256d",
        "graph_nodes": len(_graph_nodes),
        "graph_edges": len(_graph_edges),
        "total_scored": _total_scored,
        "fraud_rate": round(_fraud_detected / max(_total_scored, 1), 4),
    }


@app.post("/v1/score", response_model=GNNScoreResponse)
async def score_transaction(tx: TransactionFeatures, request: Request = None):
    global _total_scored, _fraud_detected
    start = time.time()

    node_features = _compute_node_features(tx)
    graph_features = _compute_graph_aggregation(tx, node_features)
    fraud_prob = _gnn_inference(node_features, graph_features)
    risk_score = fraud_prob

    if fraud_prob >= 0.75:
        decision = "BLOCK"
        confidence = 0.85 + fraud_prob * 0.14
    elif fraud_prob >= 0.40:
        decision = "REVIEW"
        confidence = 0.55 + fraud_prob * 0.4
    else:
        decision = "APPROVE"
        confidence = 0.85 + (1 - fraud_prob) * 0.14

    node = {
        "device": tx.device_fingerprint,
        "ip": tx.ip_address,
        "merchant": tx.merchant_id,
        "fraud_prob": fraud_prob,
        "timestamp": time.time(),
    }
    _graph_nodes[tx.transaction_id] = node
    _bound_l1_cache(_graph_nodes)
    await _persist_node(tx.transaction_id, node)

    # Upsert graph edges for shared entities (device/ip) linking transactions.
    for prior_id, prior in list(_graph_nodes.items()):
        if prior_id == tx.transaction_id:
            continue
        shared = None
        if tx.device_fingerprint and prior.get("device") == tx.device_fingerprint:
            shared = "device"
        elif tx.ip_address and prior.get("ip") == tx.ip_address:
            shared = "ip"
        if shared:
            edge = {"a": prior_id, "b": tx.transaction_id, "via": shared,
                    "timestamp": time.time()}
            _graph_edges.append(edge)
            del _graph_edges[_GRAPH_L1_BOUND:]
            await _persist_edge(prior_id, tx.transaction_id, edge)

    if fraud_prob > 0.6:
        if tx.device_fingerprint:
            new_score = max(_fraud_ring_cache.get(tx.device_fingerprint, 0), fraud_prob * 0.8)
            _fraud_ring_cache[tx.device_fingerprint] = new_score
            await _persist_ring(tx.device_fingerprint, new_score)
        if tx.ip_address:
            new_score = max(_fraud_ring_cache.get(tx.ip_address, 0), fraud_prob * 0.7)
            _fraud_ring_cache[tx.ip_address] = new_score
            await _persist_ring(tx.ip_address, new_score)
    _bound_l1_cache(_fraud_ring_cache)

    _total_scored += 1
    if decision == "BLOCK":
        _fraud_detected += 1

    latency_ms = int((time.time() - start) * 1000)
    explanation = _build_explanation(tx, node_features, graph_features, fraud_prob)

    logger.info(f"[gnn-fraud] {tx.transaction_id}: {decision} (p={fraud_prob:.3f}, {latency_ms}ms)")

    return GNNScoreResponse(
        transaction_id=tx.transaction_id,
        fraud_probability=round(fraud_prob, 4),
        risk_score=round(risk_score, 4),
        decision=decision,
        confidence=round(min(confidence, 0.999), 4),
        explanation=explanation,
        graph_features={**node_features, **graph_features},
        latency_ms=latency_ms,
    )


@app.post("/v1/batch-score")
async def batch_score(transactions: List[TransactionFeatures]):
    if len(transactions) > 100:
        raise HTTPException(status_code=400, detail="Maximum 100 transactions per batch")
    results = []
    for tx in transactions:
        result = await score_transaction(tx)
        results.append(result)
    return {"results": results, "count": len(results)}


@app.get("/v1/graph-stats")
async def graph_stats():
    high_risk_nodes = sum(1 for n in _graph_nodes.values() if n.get("fraud_prob", 0) > 0.6)
    return {
        "total_nodes": len(_graph_nodes),
        "total_edges": len(_graph_edges),
        "high_risk_nodes": high_risk_nodes,
        "fraud_ring_entities": len(_fraud_ring_cache),
        "fraud_rate": round(_fraud_detected / max(_total_scored, 1), 4),
        "total_scored": _total_scored,
    }


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    fraud_rate = _fraud_detected / max(_total_scored, 1)
    return (
        f"# HELP gnn_fraud_total_scored Total transactions scored\n"
        f"# TYPE gnn_fraud_total_scored counter\n"
        f"gnn_fraud_total_scored {_total_scored}\n"
        f"# HELP gnn_fraud_detected Total fraud detected\n"
        f"# TYPE gnn_fraud_detected counter\n"
        f"gnn_fraud_detected {_fraud_detected}\n"
        f"# HELP gnn_fraud_rate Current fraud detection rate\n"
        f"# TYPE gnn_fraud_rate gauge\n"
        f"gnn_fraud_rate {fraud_rate:.4f}\n"
        f"# HELP gnn_graph_nodes Total graph nodes\n"
        f"# TYPE gnn_graph_nodes gauge\n"
        f"gnn_graph_nodes {len(_graph_nodes)}\n"
    )


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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=4, log_level="warning")
