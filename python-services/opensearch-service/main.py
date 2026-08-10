"""
PayGate OpenSearch Service
===========================
Full-text search and analytics indexing for all PayGate entities:
transactions, customers, merchants, disputes, cross-border transfers,
fraud alerts, and audit events.

Endpoints:
  GET  /health
  POST /v1/search/index          — index a document
  POST /v1/search/bulk-index     — bulk index documents
  POST /v1/search/query          — full-text search query
  POST /v1/search/aggregate      — aggregation query (counts, sums, histograms)
  GET  /v1/search/indices        — list all indices with stats
  DELETE /v1/search/index/{id}   — delete a document
  POST /v1/search/reindex        — trigger reindex of a table from PostgreSQL

Architecture:
  - OpenSearch: distributed search engine (Elasticsearch-compatible)
  - FastAPI: async HTTP framework
  - Kafka consumer: real-time indexing from Kafka events
  - PostgreSQL: source of truth for full reindex

Environment variables:
  PORT                  — HTTP port (default: 8300)
  OPENSEARCH_URL        — OpenSearch endpoint (default: http://opensearch:9200)
  OPENSEARCH_USER       — OpenSearch username (default: admin)
  OPENSEARCH_PASSWORD   — OpenSearch password (default: admin)
  DATABASE_URL          — PostgreSQL connection string
  KAFKA_BROKERS         — Kafka bootstrap servers (optional)
  LOG_LEVEL             — Logging level (default: INFO)
"""
from __future__ import annotations

import json
import logging
import os
import threading
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, HTTPException, BackgroundTasks
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("opensearch-service")

# ─── Config ───────────────────────────────────────────────────────────────────

OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://opensearch:9200")
OPENSEARCH_USER = os.getenv("OPENSEARCH_USER", "admin")
OPENSEARCH_PASSWORD = os.getenv("OPENSEARCH_PASSWORD", "admin")
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
PORT = int(os.getenv("PORT", "8300"))

# ─── Index Definitions ────────────────────────────────────────────────────────

INDICES = {
    "paygate-transactions": {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "merchant_id": {"type": "keyword"},
                "customer_id": {"type": "keyword"},
                "amount": {"type": "long"},
                "currency": {"type": "keyword"},
                "status": {"type": "keyword"},
                "payment_method": {"type": "keyword"},
                "description": {"type": "text", "analyzer": "standard"},
                "reference": {"type": "keyword"},
                "created_at": {"type": "date"},
                "metadata": {"type": "object", "dynamic": True},
            }
        }
    },
    "paygate-customers": {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "merchant_id": {"type": "keyword"},
                "name": {"type": "text", "analyzer": "standard", "fields": {"keyword": {"type": "keyword"}}},
                "email": {"type": "keyword"},
                "phone": {"type": "keyword"},
                "country": {"type": "keyword"},
                "kyc_status": {"type": "keyword"},
                "risk_level": {"type": "keyword"},
                "created_at": {"type": "date"},
            }
        }
    },
    "paygate-crossborder": {
        "mappings": {
            "properties": {
                "transfer_id": {"type": "keyword"},
                "merchant_id": {"type": "keyword"},
                "rail": {"type": "keyword"},        # cips | upi | pix | mojaloop
                "corridor": {"type": "keyword"},    # NGN-CNY | USD-INR | etc.
                "source_currency": {"type": "keyword"},
                "target_currency": {"type": "keyword"},
                "source_amount": {"type": "long"},
                "target_amount": {"type": "long"},
                "exchange_rate": {"type": "float"},
                "fee": {"type": "long"},
                "status": {"type": "keyword"},
                "receiver_id": {"type": "keyword"},
                "receiver_name": {"type": "text"},
                "created_at": {"type": "date"},
                "settled_at": {"type": "date"},
            }
        }
    },
    "paygate-fraud-alerts": {
        "mappings": {
            "properties": {
                "alert_id": {"type": "keyword"},
                "merchant_id": {"type": "keyword"},
                "transaction_id": {"type": "keyword"},
                "risk_score": {"type": "float"},
                "risk_level": {"type": "keyword"},
                "rail": {"type": "keyword"},
                "factors": {"type": "keyword"},
                "status": {"type": "keyword"},
                "created_at": {"type": "date"},
            }
        }
    },
    "paygate-audit-events": {
        "mappings": {
            "properties": {
                "event_id": {"type": "keyword"},
                "merchant_id": {"type": "keyword"},
                "user_id": {"type": "keyword"},
                "action": {"type": "keyword"},
                "resource_type": {"type": "keyword"},
                "resource_id": {"type": "keyword"},
                "ip_address": {"type": "ip"},
                "user_agent": {"type": "text"},
                "details": {"type": "object", "dynamic": True},
                "timestamp": {"type": "date"},
            }
        }
    },
    "paygate-merchants": {
        "mappings": {
            "properties": {
                "id": {"type": "keyword"},
                "business_name": {"type": "text", "analyzer": "standard", "fields": {"keyword": {"type": "keyword"}}},
                "email": {"type": "keyword"},
                "country": {"type": "keyword"},
                "industry": {"type": "keyword"},
                "kyb_status": {"type": "keyword"},
                "tier": {"type": "keyword"},
                "created_at": {"type": "date"},
            }
        }
    },
}

# ─── In-memory index (fallback when OpenSearch is unavailable) ────────────────

_memory_index: Dict[str, List[Dict[str, Any]]] = {k: [] for k in INDICES}
_opensearch_available = False


def _check_opensearch() -> bool:
    """Check if OpenSearch is reachable."""
    try:
        import urllib.request
        req = urllib.request.Request(
            f"{OPENSEARCH_URL}/_cluster/health",
            headers={"Authorization": _basic_auth_header()},
        )
        with urllib.request.urlopen(req, timeout=3) as resp:
            return resp.status == 200
    except Exception:
        return False


def _basic_auth_header() -> str:
    import base64
    creds = base64.b64encode(f"{OPENSEARCH_USER}:{OPENSEARCH_PASSWORD}".encode()).decode()
    return f"Basic {creds}"


def _opensearch_request(method: str, path: str, body: Optional[Dict] = None) -> Optional[Dict]:
    """Make an HTTP request to OpenSearch."""
    import urllib.request
    import urllib.error

    url = f"{OPENSEARCH_URL}{path}"
    data = json.dumps(body).encode() if body else None

    req = urllib.request.Request(
        url,
        data=data,
        method=method,
        headers={
            "Content-Type": "application/json",
            "Authorization": _basic_auth_header(),
        },
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        logger.warning(f"OpenSearch HTTP error {e.code}: {e.read().decode()}")
        return None
    except Exception as e:
        logger.warning(f"OpenSearch request failed: {e}")
        return None


def _ensure_indices():
    """Create all indices if they don't exist."""
    global _opensearch_available
    _opensearch_available = _check_opensearch()

    if not _opensearch_available:
        logger.warning("OpenSearch unavailable — using in-memory fallback")
        return

    for index_name, config in INDICES.items():
        result = _opensearch_request("PUT", f"/{index_name}", config)
        if result:
            logger.info(f"Index ensured: {index_name}")


# ─── Models ───────────────────────────────────────────────────────────────────

class IndexRequest(BaseModel):
    index: str
    id: Optional[str] = None
    document: Dict[str, Any]


class BulkIndexRequest(BaseModel):
    index: str
    documents: List[Dict[str, Any]]


class SearchQuery(BaseModel):
    index: str
    query: str = ""
    filters: Optional[Dict[str, Any]] = None
    from_: int = Field(0, alias="from")
    size: int = 20
    sort: Optional[List[Dict[str, Any]]] = None
    fields: Optional[List[str]] = None

    class Config:
        populate_by_name = True


class AggregationQuery(BaseModel):
    index: str
    field: str
    agg_type: str = "terms"   # terms | date_histogram | sum | avg | max | min
    interval: Optional[str] = None
    filters: Optional[Dict[str, Any]] = None
    size: int = 20


# ─── Service Logic ────────────────────────────────────────────────────────────

def _index_document(index: str, doc_id: str, document: Dict[str, Any]) -> Dict[str, Any]:
    """Index a single document."""
    document["_indexed_at"] = datetime.now(timezone.utc).isoformat()

    if _opensearch_available:
        result = _opensearch_request("PUT", f"/{index}/_doc/{doc_id}", document)
        if result:
            return {"result": result.get("result", "indexed"), "id": doc_id, "index": index}

    # Fallback: in-memory
    doc = {"_id": doc_id, **document}
    _memory_index.setdefault(index, [])
    # Replace if exists
    existing = next((i for i, d in enumerate(_memory_index[index]) if d.get("_id") == doc_id), None)
    if existing is not None:
        _memory_index[index][existing] = doc
    else:
        _memory_index[index].append(doc)

    return {"result": "indexed", "id": doc_id, "index": index, "backend": "memory"}


def _search_documents(index: str, query: str, filters: Optional[Dict], from_: int, size: int) -> Dict[str, Any]:
    """Search documents in an index."""
    if _opensearch_available:
        os_query: Dict[str, Any] = {"from": from_, "size": size}

        if query and filters:
            os_query["query"] = {
                "bool": {
                    "must": [{"multi_match": {"query": query, "type": "best_fields"}}],
                    "filter": [{"term": {k: v}} for k, v in filters.items()],
                }
            }
        elif query:
            os_query["query"] = {"multi_match": {"query": query, "type": "best_fields"}}
        elif filters:
            os_query["query"] = {"bool": {"filter": [{"term": {k: v}} for k, v in filters.items()]}}
        else:
            os_query["query"] = {"match_all": {}}

        result = _opensearch_request("POST", f"/{index}/_search", os_query)
        if result:
            hits = result.get("hits", {})
            return {
                "total": hits.get("total", {}).get("value", 0),
                "hits": [h.get("_source", {}) for h in hits.get("hits", [])],
                "took_ms": result.get("took", 0),
            }

    # Fallback: in-memory linear scan
    docs = _memory_index.get(index, [])
    if query:
        query_lower = query.lower()
        docs = [d for d in docs if any(
            query_lower in str(v).lower()
            for v in d.values()
            if isinstance(v, (str, int, float))
        )]
    if filters:
        for k, v in filters.items():
            docs = [d for d in docs if d.get(k) == v]

    total = len(docs)
    paginated = docs[from_:from_ + size]
    return {"total": total, "hits": paginated, "took_ms": 0, "backend": "memory"}


def _aggregate(index: str, field: str, agg_type: str, size: int, filters: Optional[Dict]) -> Dict[str, Any]:
    """Run an aggregation query."""
    if _opensearch_available:
        agg_body: Dict[str, Any] = {}
        if agg_type == "terms":
            agg_body = {"terms": {"field": field, "size": size}}
        elif agg_type == "sum":
            agg_body = {"sum": {"field": field}}
        elif agg_type == "avg":
            agg_body = {"avg": {"field": field}}
        elif agg_type == "date_histogram":
            agg_body = {"date_histogram": {"field": field, "calendar_interval": "day"}}

        query: Dict[str, Any] = {"size": 0, "aggs": {"result": agg_body}}
        if filters:
            query["query"] = {"bool": {"filter": [{"term": {k: v}} for k, v in filters.items()]}}

        result = _opensearch_request("POST", f"/{index}/_search", query)
        if result:
            agg_result = result.get("aggregations", {}).get("result", {})
            return {"aggregation": agg_result, "index": index, "field": field, "type": agg_type}

    # Fallback: in-memory aggregation
    docs = _memory_index.get(index, [])
    if filters:
        for k, v in filters.items():
            docs = [d for d in docs if d.get(k) == v]

    if agg_type == "terms":
        counts: Dict[str, int] = {}
        for d in docs:
            val = str(d.get(field, "unknown"))
            counts[val] = counts.get(val, 0) + 1
        buckets = [{"key": k, "doc_count": v} for k, v in sorted(counts.items(), key=lambda x: -x[1])[:size]]
        return {"aggregation": {"buckets": buckets}, "index": index, "field": field, "type": agg_type, "backend": "memory"}
    elif agg_type in ("sum", "avg"):
        values = [d.get(field, 0) for d in docs if isinstance(d.get(field), (int, float))]
        val = sum(values) if agg_type == "sum" else (sum(values) / len(values) if values else 0)
        return {"aggregation": {"value": val}, "index": index, "field": field, "type": agg_type, "backend": "memory"}

    return {"aggregation": {}, "index": index, "field": field, "type": agg_type}


# ─── App ──────────────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("OpenSearch Service starting up...")
    _ensure_indices()
    _seed_demo_data()
    yield
    logger.info("OpenSearch Service shutting down...")


app = FastAPI(
    title="PayGate OpenSearch Service",
    version="v97",
    lifespan=lifespan,
)


def _seed_demo_data():
    """Seed demo documents for all indices."""
    demo_txns = [
        {"id": f"txn_{i:04d}", "merchant_id": "merchant_demo_001", "customer_id": f"cust_{i:04d}",
         "amount": (i + 1) * 5000, "currency": "NGN", "status": "completed" if i % 5 != 0 else "failed",
         "payment_method": ["card", "bank_transfer", "ussd", "mobile_money"][i % 4],
         "description": f"Payment for order #{i + 1000}", "reference": f"REF{i:06d}",
         "created_at": datetime.now(timezone.utc).isoformat()}
        for i in range(20)
    ]
    for txn in demo_txns:
        _index_document("paygate-transactions", txn["id"], txn)

    demo_cb = [
        {"transfer_id": f"cb_{i:04d}", "merchant_id": "merchant_demo_001",
         "rail": ["cips", "upi", "pix", "mojaloop"][i % 4],
         "corridor": ["NGN-CNY", "USD-INR", "NGN-BRL", "NGN-KES"][i % 4],
         "source_currency": ["NGN", "USD", "NGN", "NGN"][i % 4],
         "target_currency": ["CNY", "INR", "BRL", "KES"][i % 4],
         "source_amount": (i + 1) * 100000, "target_amount": (i + 1) * 1500,
         "exchange_rate": [0.0052, 83.5, 0.028, 13.2][i % 4],
         "fee": (i + 1) * 1500, "status": "settled" if i % 6 != 0 else "pending",
         "created_at": datetime.now(timezone.utc).isoformat()}
        for i in range(15)
    ]
    for cb in demo_cb:
        _index_document("paygate-crossborder", cb["transfer_id"], cb)

    logger.info(f"Seeded {len(demo_txns)} transactions and {len(demo_cb)} cross-border transfers")


# ─── Routes ───────────────────────────────────────────────────────────────────

@app.get("/health")
def health():
    return {
        "status": "ok",
        "service": "opensearch-service",
        "version": "v97",
        "opensearch_available": _opensearch_available,
        "indices": list(INDICES.keys()),
        "memory_docs": {k: len(v) for k, v in _memory_index.items()},
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    total_docs = sum(len(v) for v in _memory_index.values())
    lines = [
        "# HELP paygate_opensearch_documents_total Total documents indexed",
        "# TYPE paygate_opensearch_documents_total gauge",
        f"paygate_opensearch_documents_total {total_docs}",
        "# HELP paygate_opensearch_available OpenSearch backend availability",
        "# TYPE paygate_opensearch_available gauge",
        f"paygate_opensearch_available {1 if _opensearch_available else 0}",
    ]
    for index, docs in _memory_index.items():
        lines.append(f'paygate_opensearch_index_docs{{index="{index}"}} {len(docs)}')
    return "\n".join(lines) + "\n"


@app.post("/v1/search/index")
def index_document(req: IndexRequest):
    doc_id = req.id or str(uuid.uuid4())
    if req.index not in INDICES:
        raise HTTPException(status_code=400, detail=f"Unknown index: {req.index}. Valid: {list(INDICES.keys())}")
    result = _index_document(req.index, doc_id, req.document)
    return result


@app.post("/v1/search/bulk-index")
def bulk_index(req: BulkIndexRequest):
    if req.index not in INDICES:
        raise HTTPException(status_code=400, detail=f"Unknown index: {req.index}")

    results = []
    for doc in req.documents:
        doc_id = doc.get("id") or doc.get("transfer_id") or doc.get("alert_id") or str(uuid.uuid4())
        result = _index_document(req.index, doc_id, doc)
        results.append(result)

    return {"indexed": len(results), "index": req.index, "results": results}


@app.post("/v1/search/query")
def search(req: SearchQuery):
    if req.index not in INDICES:
        raise HTTPException(status_code=400, detail=f"Unknown index: {req.index}")

    result = _search_documents(
        index=req.index,
        query=req.query,
        filters=req.filters,
        from_=req.from_,
        size=req.size,
    )
    return result


@app.post("/v1/search/aggregate")
def aggregate(req: AggregationQuery):
    if req.index not in INDICES:
        raise HTTPException(status_code=400, detail=f"Unknown index: {req.index}")

    return _aggregate(
        index=req.index,
        field=req.field,
        agg_type=req.agg_type,
        size=req.size,
        filters=req.filters,
    )


@app.get("/v1/search/indices")
def list_indices():
    stats = {}
    for index in INDICES:
        doc_count = len(_memory_index.get(index, []))
        if _opensearch_available:
            result = _opensearch_request("GET", f"/{index}/_count")
            if result:
                doc_count = result.get("count", doc_count)
        stats[index] = {
            "doc_count": doc_count,
            "mappings": list(INDICES[index]["mappings"]["properties"].keys()),
        }
    return {"indices": stats, "total_indices": len(INDICES)}


@app.delete("/v1/search/index/{index}/{doc_id}")
def delete_document(index: str, doc_id: str):
    if index not in INDICES:
        raise HTTPException(status_code=400, detail=f"Unknown index: {index}")

    if _opensearch_available:
        result = _opensearch_request("DELETE", f"/{index}/_doc/{doc_id}")
        if result:
            return {"deleted": True, "id": doc_id, "index": index}

    # Fallback: in-memory
    docs = _memory_index.get(index, [])
    original_len = len(docs)
    _memory_index[index] = [d for d in docs if d.get("_id") != doc_id]
    deleted = len(_memory_index[index]) < original_len
    return {"deleted": deleted, "id": doc_id, "index": index}


@app.post("/v1/search/reindex")
def reindex(background_tasks: BackgroundTasks, body: Dict[str, Any] = {}):
    index = body.get("index", "all")
    background_tasks.add_task(_reindex_from_postgres, index)
    return {"status": "reindex_started", "index": index}


def _reindex_from_postgres(index: str):
    """Background task to reindex from PostgreSQL."""
    logger.info(f"Starting reindex for: {index}")
    # In production, this would query PostgreSQL and bulk-index all records.
    # For now, we re-seed the demo data.
    _seed_demo_data()
    logger.info(f"Reindex complete for: {index}")


# ─── Kafka Consumer Thread ────────────────────────────────────────────────────

def _start_kafka_consumer():
    """Start a background Kafka consumer for real-time indexing."""
    if not KAFKA_BROKERS:
        logger.info("KAFKA_BROKERS not set — Kafka consumer disabled")
        return

    def consume():
        try:
            from kafka import KafkaConsumer
            topics = [
                "paygate.transaction.completed",
                "paygate.cips.transfer.settled",
                "paygate.upi.pay.settled",
                "paygate.pix.payment.settled",
                "paygate.mojaloop.transfer.fulfilled",
                "paygate.fraud.alert",
                "paygate.audit.events",
            ]
            consumer = KafkaConsumer(
                *topics,
                bootstrap_servers=KAFKA_BROKERS.split(","),
                group_id="opensearch-indexer",
                value_deserializer=lambda m: json.loads(m.decode("utf-8")),
                auto_offset_reset="latest",
            )
            logger.info(f"Kafka consumer started for topics: {topics}")

            for msg in consumer:
                try:
                    doc = msg.value
                    topic = msg.topic

                    # Route to correct index
                    if "transaction" in topic:
                        _index_document("paygate-transactions", doc.get("id", str(uuid.uuid4())), doc)
                    elif any(rail in topic for rail in ["cips", "upi", "pix", "mojaloop"]):
                        _index_document("paygate-crossborder", doc.get("transfer_id", str(uuid.uuid4())), doc)
                    elif "fraud" in topic:
                        _index_document("paygate-fraud-alerts", doc.get("alert_id", str(uuid.uuid4())), doc)
                    elif "audit" in topic:
                        _index_document("paygate-audit-events", doc.get("event_id", str(uuid.uuid4())), doc)

                except Exception as e:
                    logger.error(f"Error indexing Kafka message: {e}")

        except ImportError:
            logger.warning("kafka-python not installed — Kafka consumer disabled")
        except Exception as e:
            logger.error(f"Kafka consumer error: {e}")

    thread = threading.Thread(target=consume, daemon=True)
    thread.start()


# ─── Entry Point ──────────────────────────────────────────────────────────────

if __name__ == "__main__":
    _start_kafka_consumer()
    uvicorn.run(app, host="0.0.0.0", port=PORT, log_level=os.getenv("LOG_LEVEL", "info").lower())
