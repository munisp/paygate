"""
PayGate OpenSearch Indexer Service (Wave 133)
─────────────────────────────────────────────
Consumes Kafka topics (transactions, audit_events, fraud_alerts, kyc_events)
and indexes documents into OpenSearch for full-text search and analytics.

Environment variables:
  KAFKA_BOOTSTRAP_SERVERS  — comma-separated Kafka brokers (default: kafka:9092)
  OPENSEARCH_URL           — OpenSearch base URL (default: http://opensearch:9200)
  OPENSEARCH_USER          — basic-auth username (default: admin)
  OPENSEARCH_PASS          — basic-auth password (default: admin)
  INTERNAL_API_KEY         — bearer token for /index and /search HTTP endpoints
  LOG_LEVEL                — DEBUG | INFO | WARNING | ERROR (default: INFO)
"""

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from typing import Any

import httpx
from aiokafka import AIOKafkaConsumer
from fastapi import Depends, FastAPI, HTTPException, Request, status
from fastapi.responses import JSONResponse
from pydantic import BaseModel

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=getattr(logging, os.getenv("LOG_LEVEL", "INFO").upper(), logging.INFO),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
log = logging.getLogger("opensearch-indexer")


import secrets as _secrets_mod
import sys as _sys_mod


def _require_secret_env(var_name, fallback_env=None):
    """Fail closed: no hardcoded default credentials (cips-gateway main.go:48-56 pattern).

    Production (ENV/APP_ENV=production) with the variable unset -> FATAL log + exit.
    Dev -> per-boot random value (secrets.token_hex) logged once; never a
    well-known default.
    """
    value = os.getenv(var_name, "")
    if not value and fallback_env:
        value = os.getenv(fallback_env, "")
    if value:
        return value
    env = (os.getenv("ENV") or os.getenv("APP_ENV") or "").strip().lower()
    if env in ("production", "prod"):
        log.critical("FATAL: %s must be set when ENV=production -- refusing to serve", var_name)
        _sys_mod.exit(1)
    value = "dev-" + _secrets_mod.token_hex(16)
    log.warning("%s unset -- generated per-boot dev value; set %s to real credentials", var_name, var_name)
    return value

# ─── Config ───────────────────────────────────────────────────────────────────
KAFKA_SERVERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "kafka:9092")
OS_URL = os.getenv("OPENSEARCH_URL", "http://opensearch:9200").rstrip("/")
OS_USER = os.getenv("OPENSEARCH_USER", "admin")
OS_PASS = _require_secret_env("OPENSEARCH_PASS")
INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")

TOPICS = {
    "paygate.transactions": "pg_transactions",
    "paygate.audit_events": "pg_audit_events",
    "paygate.fraud_alerts": "pg_fraud_alerts",
    "paygate.kyc_events": "pg_kyc_events",
}

# ─── OpenSearch client ────────────────────────────────────────────────────────
_os_client: httpx.AsyncClient | None = None


def get_os_client() -> httpx.AsyncClient:
    global _os_client
    if _os_client is None or _os_client.is_closed:
        _os_client = httpx.AsyncClient(
            base_url=OS_URL,
            auth=(OS_USER, OS_PASS),
            timeout=10.0,
            verify=False,  # allow self-signed certs in dev
        )
    return _os_client


async def ensure_indices() -> None:
    """Create index templates for all PayGate indices if they don't exist."""
    client = get_os_client()
    for index in TOPICS.values():
        try:
            r = await client.head(f"/{index}")
            if r.status_code == 404:
                await client.put(
                    f"/{index}",
                    json={
                        "settings": {"number_of_shards": 1, "number_of_replicas": 1},
                        "mappings": {
                            "properties": {
                                "timestamp": {"type": "date"},
                                "merchant_id": {"type": "keyword"},
                                "user_id": {"type": "keyword"},
                                "event_type": {"type": "keyword"},
                                "amount": {"type": "double"},
                                "currency": {"type": "keyword"},
                                "status": {"type": "keyword"},
                                "payload": {"type": "object", "enabled": False},
                            }
                        },
                    },
                )
                log.info("Created index %s", index)
        except Exception as exc:
            log.warning("Could not ensure index %s: %s", index, exc)


async def index_document(index: str, doc_id: str, doc: dict) -> bool:
    """Index a single document into OpenSearch. Returns True on success."""
    client = get_os_client()
    try:
        r = await client.put(f"/{index}/_doc/{doc_id}", json=doc)
        if r.status_code not in (200, 201):
            log.warning("Index %s doc %s → HTTP %d: %s", index, doc_id, r.status_code, r.text[:200])
            return False
        return True
    except Exception as exc:
        log.error("Failed to index doc %s in %s: %s", doc_id, index, exc)
        return False


# ─── Kafka consumer ───────────────────────────────────────────────────────────
_consumer_task: asyncio.Task | None = None


async def kafka_consumer_loop() -> None:
    """Long-running coroutine that consumes all PayGate Kafka topics."""
    log.info("Starting Kafka consumer on %s, topics: %s", KAFKA_SERVERS, list(TOPICS))
    consumer = AIOKafkaConsumer(
        *TOPICS.keys(),
        bootstrap_servers=KAFKA_SERVERS,
        group_id="opensearch-indexer",
        auto_offset_reset="earliest",
        enable_auto_commit=True,
        value_deserializer=lambda v: json.loads(v.decode("utf-8", errors="replace")),
    )
    try:
        await consumer.start()
        log.info("Kafka consumer started")
        async for msg in consumer:
            index = TOPICS.get(msg.topic, "pg_unknown")
            doc = msg.value if isinstance(msg.value, dict) else {"raw": msg.value}
            # Ensure timestamp field
            if "timestamp" not in doc:
                doc["timestamp"] = int(time.time() * 1000)
            doc_id = doc.get("id") or doc.get("transaction_id") or str(uuid.uuid4())
            ok = await index_document(index, str(doc_id), doc)
            if ok:
                log.debug("Indexed %s/%s", index, doc_id)
    except asyncio.CancelledError:
        log.info("Kafka consumer loop cancelled")
    except Exception as exc:
        log.error("Kafka consumer error: %s", exc, exc_info=True)
    finally:
        try:
            await consumer.stop()
        except Exception:
            pass


# ─── FastAPI lifespan ─────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_task
    await ensure_indices()
    _consumer_task = asyncio.create_task(kafka_consumer_loop())
    yield
    if _consumer_task and not _consumer_task.done():
        _consumer_task.cancel()
        try:
            await _consumer_task
        except asyncio.CancelledError:
            pass
    if _os_client and not _os_client.is_closed:
        await _os_client.aclose()


import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(title="PayGate OpenSearch Indexer", version="1.0.0", lifespan=lifespan)
setup_telemetry("opensearch-indexer", app)


# ─── Auth dependency ──────────────────────────────────────────────────────────
async def require_api_key(request: Request) -> None:
    # Fail closed: key must be configured and presented; constant-time compare.
    if not INTERNAL_API_KEY:
        raise HTTPException(status_code=status.HTTP_503_SERVICE_UNAVAILABLE, detail="Service misconfigured: INTERNAL_API_KEY not set")
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer ") or not hmac.compare_digest(auth[7:], INTERNAL_API_KEY):
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail="Invalid API key")


# ─── Models ───────────────────────────────────────────────────────────────────
class IndexRequest(BaseModel):
    index: str
    doc_id: str | None = None
    document: dict[str, Any]


class SearchRequest(BaseModel):
    index: str
    query: str
    filters: dict[str, Any] | None = None
    from_: int = 0
    size: int = 20


# ─── Endpoints ────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    """Liveness probe."""
    client = get_os_client()
    try:
        r = await client.get("/_cluster/health", timeout=3.0)
        os_status = r.json().get("status", "unknown") if r.status_code == 200 else "unreachable"
    except Exception:
        os_status = "unreachable"
    return {"status": "ok", "opensearch": os_status}


@app.post("/index", dependencies=[Depends(require_api_key)])
async def index_doc(req: IndexRequest):
    """Manually index a document."""
    doc_id = req.doc_id or str(uuid.uuid4())
    ok = await index_document(req.index, doc_id, req.document)
    if not ok:
        raise HTTPException(status_code=502, detail="OpenSearch indexing failed")
    return {"ok": True, "index": req.index, "doc_id": doc_id}


@app.post("/search", dependencies=[Depends(require_api_key)])
async def search_docs(req: SearchRequest):
    """Full-text search across a PayGate index."""
    client = get_os_client()
    must: list[dict] = [{"multi_match": {"query": req.query, "fields": ["*"]}}]
    if req.filters:
        for k, v in req.filters.items():
            must.append({"term": {k: v}})
    body = {
        "from": req.from_,
        "size": req.size,
        "query": {"bool": {"must": must}},
        "sort": [{"timestamp": {"order": "desc"}}],
    }
    try:
        r = await client.post(f"/{req.index}/_search", json=body)
        if r.status_code != 200:
            raise HTTPException(status_code=502, detail=f"OpenSearch error: {r.text[:200]}")
        data = r.json()
        hits = data.get("hits", {})
        return {
            "total": hits.get("total", {}).get("value", 0),
            "hits": [h["_source"] for h in hits.get("hits", [])],
        }
    except HTTPException:
        raise
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))


@app.get("/indices", dependencies=[Depends(require_api_key)])
async def list_indices():
    """List all PayGate indices and their document counts."""
    client = get_os_client()
    try:
        r = await client.get("/_cat/indices/pg_*?format=json")
        return r.json() if r.status_code == 200 else []
    except Exception as exc:
        raise HTTPException(status_code=502, detail=str(exc))

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
