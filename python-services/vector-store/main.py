"""
PayGate Vector Store Service
============================
Production-grade semantic search and similarity service backed by Qdrant.

Architecture:
  - Qdrant: high-performance vector database (HNSW indexing, sub-ms search)
  - FastEmbed: lightweight embedding model (BAAI/bge-small-en-v1.5, 384-dim)
  - FastAPI: REST API for embedding, upsert, search, and RAG
  - PostgreSQL: metadata store for document provenance
  - Kafka: event-driven indexing pipeline (new transactions → embed → upsert)

Collections:
  - paygate_transactions: transaction embeddings for fraud similarity search
  - paygate_support: support ticket embeddings for semantic routing
  - paygate_merchants: merchant profile embeddings for KYB matching
  - paygate_compliance: regulatory document embeddings for compliance Q&A
  - paygate_knowledge: internal knowledge base for RAG-powered support

Endpoints:
  GET  /health
  GET  /metrics
  POST /v1/embed                     — embed text(s) and return vectors
  POST /v1/upsert/{collection}       — upsert vectors into a collection
  POST /v1/search/{collection}       — semantic similarity search
  POST /v1/rag/query                 — RAG: retrieve + generate answer via LLM
  POST /v1/fraud/similar             — find transactions similar to a given one
  POST /v1/support/route             — route support ticket to best category
  POST /v1/index/transaction         — index a single transaction (Kafka trigger)
  POST /v1/index/batch               — batch index from Parquet/Lakehouse

Environment:
  QDRANT_URL          — Qdrant gRPC/REST URL (default: http://qdrant:6333)
  QDRANT_API_KEY      — Qdrant API key (optional, for Qdrant Cloud)
  EMBEDDING_MODEL     — FastEmbed model (default: BAAI/bge-small-en-v1.5)
  EMBEDDING_DIM       — Embedding dimension (default: 384)
  DATABASE_URL        — PostgreSQL for metadata
  LLM_API_URL         — LLM API for RAG generation
  LLM_API_KEY         — LLM API key
  KAFKA_BROKERS       — Kafka bootstrap servers (optional)
  PORT                — HTTP port (default: 8130)
"""
from __future__ import annotations

import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
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
logger = logging.getLogger("vector-store")

# ─── Config ───────────────────────────────────────────────────────────────────
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
EMBEDDING_MODEL = os.getenv("EMBEDDING_MODEL", "BAAI/bge-small-en-v1.5")
EMBEDDING_DIM = int(os.getenv("EMBEDDING_DIM", "384"))
DATABASE_URL = os.getenv("DATABASE_URL", "")  # required env; no default credentials (was postgres:postgres)
LLM_API_URL = os.getenv("LLM_API_URL", "http://ollama:11434")
LLM_API_KEY = os.getenv("LLM_API_KEY", "")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
PORT = int(os.getenv("PORT", "8130"))

# ─── Qdrant Collections ───────────────────────────────────────────────────────
COLLECTIONS = {
    "transactions": {
        "name": "paygate_transactions",
        "description": "Transaction embeddings for fraud similarity detection",
        "dim": EMBEDDING_DIM,
        "distance": "Cosine",
    },
    "support": {
        "name": "paygate_support",
        "description": "Support ticket embeddings for semantic routing and RAG",
        "dim": EMBEDDING_DIM,
        "distance": "Cosine",
    },
    "merchants": {
        "name": "paygate_merchants",
        "description": "Merchant profile embeddings for KYB similarity matching",
        "dim": EMBEDDING_DIM,
        "distance": "Cosine",
    },
    "compliance": {
        "name": "paygate_compliance",
        "description": "Regulatory document embeddings for compliance Q&A",
        "dim": EMBEDDING_DIM,
        "distance": "Cosine",
    },
    "knowledge": {
        "name": "paygate_knowledge",
        "description": "Internal knowledge base for RAG-powered merchant support",
        "dim": EMBEDDING_DIM,
        "distance": "Cosine",
    },
}

# ─── Qdrant client (lazy init) ────────────────────────────────────────────────
_qdrant_client = None

def get_qdrant():
    global _qdrant_client
    if _qdrant_client is None:
        try:
            from qdrant_client import QdrantClient
            from qdrant_client.models import Distance, VectorParams
            kwargs = {"url": QDRANT_URL, "timeout": 10}
            if QDRANT_API_KEY:
                kwargs["api_key"] = QDRANT_API_KEY
            _qdrant_client = QdrantClient(**kwargs)
            logger.info(f"[qdrant] Connected to {QDRANT_URL}")
            # Ensure all collections exist
            _ensure_collections(_qdrant_client)
        except Exception as e:
            logger.warning(f"[qdrant] Connection failed: {e} — running in degraded mode")
            _qdrant_client = None
    return _qdrant_client

def _ensure_collections(client):
    """Create collections if they don't exist."""
    try:
        from qdrant_client.models import Distance, VectorParams
        existing = {c.name for c in client.get_collections().collections}
        for key, cfg in COLLECTIONS.items():
            if cfg["name"] not in existing:
                dist = Distance.COSINE if cfg["distance"] == "Cosine" else Distance.EUCLID
                client.create_collection(
                    collection_name=cfg["name"],
                    vectors_config=VectorParams(size=cfg["dim"], distance=dist),
                )
                logger.info(f"[qdrant] Created collection: {cfg['name']}")
    except Exception as e:
        logger.warning(f"[qdrant] Collection setup failed: {e}")

# ─── Embedding model (lazy init) ──────────────────────────────────────────────
_embed_model = None

def get_embedder():
    global _embed_model
    if _embed_model is None:
        try:
            from fastembed import TextEmbedding
            _embed_model = TextEmbedding(model_name=EMBEDDING_MODEL)
            logger.info(f"[embed] Loaded model: {EMBEDDING_MODEL}")
        except Exception as e:
            logger.warning(f"[embed] FastEmbed unavailable: {e}")
            _embed_model = None
    return _embed_model

def embed_texts(texts: List[str]) -> List[List[float]]:
    """Embed a list of texts. Falls back to zero vectors if model unavailable."""
    embedder = get_embedder()
    if embedder is None:
        # Fallback: deterministic hash-based pseudo-embedding for testing
        import hashlib
        result = []
        for text in texts:
            h = hashlib.sha256(text.encode()).digest()
            vec = [(b / 255.0) * 2 - 1 for b in h]  # 32 dims
            # Pad to EMBEDDING_DIM
            while len(vec) < EMBEDDING_DIM:
                vec.extend(vec[:min(32, EMBEDDING_DIM - len(vec))])
            result.append(vec[:EMBEDDING_DIM])
        return result
    try:
        embeddings = list(embedder.embed(texts))
        return [e.tolist() for e in embeddings]
    except Exception as e:
        logger.error(f"[embed] Embedding failed: {e}")
        raise HTTPException(status_code=500, detail=f"Embedding failed: {e}")

# ─── Pydantic Models ──────────────────────────────────────────────────────────
class EmbedRequest(BaseModel):
    texts: List[str] = Field(..., min_length=1, max_length=100)

class EmbedResponse(BaseModel):
    embeddings: List[List[float]]
    model: str
    dim: int
    count: int

class UpsertPoint(BaseModel):
    id: str = Field(default_factory=lambda: str(uuid.uuid4()))
    text: str
    payload: Dict[str, Any] = Field(default_factory=dict)

class UpsertRequest(BaseModel):
    points: List[UpsertPoint] = Field(..., min_length=1, max_length=1000)

class SearchRequest(BaseModel):
    query: str
    limit: int = Field(default=10, ge=1, le=100)
    score_threshold: float = Field(default=0.7, ge=0.0, le=1.0)
    filter: Optional[Dict[str, Any]] = None

class SearchResult(BaseModel):
    id: str
    score: float
    payload: Dict[str, Any]
    text: Optional[str] = None

class RAGRequest(BaseModel):
    query: str
    collection: str = "knowledge"
    top_k: int = Field(default=5, ge=1, le=20)
    system_prompt: Optional[str] = None
    max_tokens: int = Field(default=512, ge=64, le=4096)

class RAGResponse(BaseModel):
    answer: str
    sources: List[SearchResult]
    query: str
    model: str

class FraudSimilarityRequest(BaseModel):
    """Find transactions similar to a given one for fraud ring detection."""
    transaction_id: str
    merchant_id: str
    amount_kobo: int
    channel: str
    customer_ip: Optional[str] = None
    device_fingerprint: Optional[str] = None
    card_last4: Optional[str] = None
    limit: int = Field(default=10, ge=1, le=50)
    score_threshold: float = Field(default=0.85, ge=0.5, le=1.0)

class SupportRouteRequest(BaseModel):
    """Route a support message to the best category."""
    message: str
    session_id: Optional[str] = None
    merchant_id: Optional[str] = None

class IndexTransactionRequest(BaseModel):
    transaction_id: str
    merchant_id: str
    amount_kobo: int
    currency: str = "NGN"
    channel: str
    status: str
    customer_id: Optional[str] = None
    description: Optional[str] = None
    metadata: Optional[Dict[str, Any]] = None

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] PayGate Vector Store starting...")
    # Pre-warm connections
    get_qdrant()
    get_embedder()
    logger.info("[startup] Ready")
    yield
    logger.info("[shutdown] PayGate Vector Store stopping...")

# ─── App ──────────────────────────────────────────────────────────────────────
import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
app = FastAPI(
    title="PayGate Vector Store",
    description="Semantic search and similarity service backed by Qdrant",
    version="1.0.0",
    lifespan=lifespan,
)
setup_telemetry("vector-store", app)

# ─── Health ───────────────────────────────────────────────────────────────────
@app.get("/health")
async def health():
    qdrant_ok = False
    try:
        client = get_qdrant()
        if client:
            client.get_collections()
            qdrant_ok = True
    except Exception:
        pass

    embed_ok = get_embedder() is not None

    return {
        "status": "ok" if qdrant_ok else "degraded",
        "qdrant": qdrant_ok,
        "embedding_model": embed_ok,
        "model": EMBEDDING_MODEL,
        "dim": EMBEDDING_DIM,
        "collections": list(COLLECTIONS.keys()),
        "timestamp_ms": int(time.time() * 1000),
    }

@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    try:
        from prometheus_client import generate_latest, CONTENT_TYPE_LATEST
        return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)
    except ImportError:
        return PlainTextResponse("# prometheus_client not installed\n")

# ─── Embed ────────────────────────────────────────────────────────────────────
@app.post("/v1/embed", response_model=EmbedResponse)
async def embed(req: EmbedRequest):
    start = time.time()
    vectors = embed_texts(req.texts)
    return EmbedResponse(
        embeddings=vectors,
        model=EMBEDDING_MODEL,
        dim=EMBEDDING_DIM,
        count=len(vectors),
    )

# ─── Upsert ───────────────────────────────────────────────────────────────────
@app.post("/v1/upsert/{collection}")
async def upsert(collection: str, req: UpsertRequest):
    if collection not in COLLECTIONS:
        raise HTTPException(status_code=404, detail=f"Unknown collection: {collection}")

    client = get_qdrant()
    if not client:
        raise HTTPException(status_code=503, detail="Qdrant unavailable")

    from qdrant_client.models import PointStruct

    texts = [p.text for p in req.points]
    vectors = embed_texts(texts)

    points = [
        PointStruct(
            id=p.id,
            vector=vectors[i],
            payload={**p.payload, "_text": p.text},
        )
        for i, p in enumerate(req.points)
    ]

    collection_name = COLLECTIONS[collection]["name"]
    client.upsert(collection_name=collection_name, points=points)

    logger.info(f"[upsert] {len(points)} points → {collection_name}")
    return {"upserted": len(points), "collection": collection_name}

# ─── Search ───────────────────────────────────────────────────────────────────
@app.post("/v1/search/{collection}", response_model=List[SearchResult])
async def search(collection: str, req: SearchRequest):
    if collection not in COLLECTIONS:
        raise HTTPException(status_code=404, detail=f"Unknown collection: {collection}")

    client = get_qdrant()
    if not client:
        raise HTTPException(status_code=503, detail="Qdrant unavailable")

    query_vector = embed_texts([req.query])[0]
    collection_name = COLLECTIONS[collection]["name"]

    from qdrant_client.models import Filter, FieldCondition, MatchValue

    qdrant_filter = None
    if req.filter:
        conditions = [
            FieldCondition(key=k, match=MatchValue(value=v))
            for k, v in req.filter.items()
        ]
        from qdrant_client.models import Filter as QFilter
        qdrant_filter = QFilter(must=conditions)

    results = client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=req.limit,
        score_threshold=req.score_threshold,
        query_filter=qdrant_filter,
        with_payload=True,
    )

    return [
        SearchResult(
            id=str(r.id),
            score=r.score,
            payload={k: v for k, v in (r.payload or {}).items() if k != "_text"},
            text=(r.payload or {}).get("_text"),
        )
        for r in results
    ]

# ─── RAG Query ────────────────────────────────────────────────────────────────
@app.post("/v1/rag/query", response_model=RAGResponse)
async def rag_query(req: RAGRequest):
    if req.collection not in COLLECTIONS:
        raise HTTPException(status_code=404, detail=f"Unknown collection: {req.collection}")

    # 1. Retrieve relevant documents
    client = get_qdrant()
    if not client:
        raise HTTPException(status_code=503, detail="Qdrant unavailable")

    query_vector = embed_texts([req.query])[0]
    collection_name = COLLECTIONS[req.collection]["name"]

    results = client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=req.top_k,
        score_threshold=0.5,
        with_payload=True,
    )

    sources = [
        SearchResult(
            id=str(r.id),
            score=r.score,
            payload={k: v for k, v in (r.payload or {}).items() if k != "_text"},
            text=(r.payload or {}).get("_text"),
        )
        for r in results
    ]

    # 2. Build context from retrieved documents
    context_parts = []
    for i, src in enumerate(sources, 1):
        text = src.text or str(src.payload)
        context_parts.append(f"[{i}] {text[:500]}")
    context = "\n\n".join(context_parts)

    # 3. Generate answer via LLM (Ollama or Forge API)
    system_prompt = req.system_prompt or (
        "You are a helpful PayGate support assistant. Answer the user's question "
        "using only the provided context. If the context doesn't contain enough "
        "information, say so honestly. Be concise and professional."
    )

    answer = "I could not find relevant information to answer your question."
    model_used = "none"

    try:
        import aiohttp
        async with aiohttp.ClientSession() as session:
            # Try Ollama first (local, private)
            ollama_payload = {
                "model": "llama3.2",
                "messages": [
                    {"role": "system", "content": system_prompt},
                    {"role": "user", "content": f"Context:\n{context}\n\nQuestion: {req.query}"},
                ],
                "stream": False,
                "options": {"num_predict": req.max_tokens, "temperature": 0.3},
            }
            async with session.post(
                f"{LLM_API_URL}/api/chat",
                json=ollama_payload,
                timeout=aiohttp.ClientTimeout(total=30),
            ) as resp:
                if resp.status == 200:
                    data = await resp.json()
                    answer = data.get("message", {}).get("content", answer)
                    model_used = data.get("model", "ollama")
    except Exception as e:
        logger.warning(f"[rag] LLM call failed: {e}")

    return RAGResponse(
        answer=answer,
        sources=sources,
        query=req.query,
        model=model_used,
    )

# ─── Fraud Similarity Search ──────────────────────────────────────────────────
@app.post("/v1/fraud/similar")
async def fraud_similar(req: FraudSimilarityRequest):
    """
    Find transactions similar to the given one for fraud ring detection.
    Uses semantic embedding of transaction features to find behavioral clusters.
    """
    # Build a textual representation of the transaction for embedding
    tx_text = (
        f"transaction channel={req.channel} amount_kobo={req.amount_kobo} "
        f"merchant={req.merchant_id} "
        f"ip={req.customer_ip or 'unknown'} "
        f"device={req.device_fingerprint or 'unknown'} "
        f"card_last4={req.card_last4 or 'unknown'}"
    )

    client = get_qdrant()
    if not client:
        return {"similar_transactions": [], "fraud_ring_detected": False, "message": "Qdrant unavailable"}

    query_vector = embed_texts([tx_text])[0]
    collection_name = COLLECTIONS["transactions"]["name"]

    results = client.search(
        collection_name=collection_name,
        query_vector=query_vector,
        limit=req.limit,
        score_threshold=req.score_threshold,
        with_payload=True,
    )

    similar = [
        {
            "transaction_id": (r.payload or {}).get("transaction_id", str(r.id)),
            "similarity_score": r.score,
            "merchant_id": (r.payload or {}).get("merchant_id"),
            "amount_kobo": (r.payload or {}).get("amount_kobo"),
            "channel": (r.payload or {}).get("channel"),
            "status": (r.payload or {}).get("status"),
        }
        for r in results
        if (r.payload or {}).get("transaction_id") != req.transaction_id
    ]

    # Fraud ring heuristic: 3+ similar transactions from different merchants
    unique_merchants = {s["merchant_id"] for s in similar if s["merchant_id"]}
    fraud_ring_detected = len(similar) >= 3 and len(unique_merchants) >= 2

    return {
        "transaction_id": req.transaction_id,
        "similar_transactions": similar,
        "fraud_ring_detected": fraud_ring_detected,
        "fraud_ring_size": len(similar),
        "unique_merchants_involved": len(unique_merchants),
        "risk_signal": "high" if fraud_ring_detected else "low",
    }

# ─── Support Routing ──────────────────────────────────────────────────────────
SUPPORT_CATEGORIES = [
    ("transaction_failure", "failed transaction payment error declined"),
    ("payout_issue", "payout missing delay settlement bank transfer"),
    ("api_integration", "API webhook integration SDK error code"),
    ("kyc_verification", "KYC KYB verification document identity"),
    ("dispute_chargeback", "dispute chargeback evidence fraud unauthorized"),
    ("virtual_card", "virtual card freeze unfreeze limit"),
    ("bnpl", "buy now pay later installment loan credit"),
    ("fx_crossborder", "FX foreign exchange cross-border international transfer"),
    ("account_settings", "account settings team password login 2FA"),
    ("billing_subscription", "billing subscription plan upgrade invoice"),
]

@app.post("/v1/support/route")
async def support_route(req: SupportRouteRequest):
    """
    Route a support message to the best category using semantic similarity.
    Falls back to keyword matching if Qdrant is unavailable.
    """
    client = get_qdrant()

    if client:
        # Semantic routing via Qdrant
        query_vector = embed_texts([req.message])[0]
        collection_name = COLLECTIONS["support"]["name"]

        try:
            results = client.search(
                collection_name=collection_name,
                query_vector=query_vector,
                limit=3,
                score_threshold=0.5,
                with_payload=True,
            )
            if results:
                top = results[0]
                return {
                    "category": (top.payload or {}).get("category", "general"),
                    "confidence": top.score,
                    "method": "semantic",
                    "session_id": req.session_id,
                }
        except Exception:
            pass

    # Fallback: keyword-based routing
    msg_lower = req.message.lower()
    best_category = "general"
    best_score = 0.0

    for category, keywords in SUPPORT_CATEGORIES:
        kw_list = keywords.split()
        matches = sum(1 for kw in kw_list if kw in msg_lower)
        score = matches / len(kw_list)
        if score > best_score:
            best_score = score
            best_category = category

    return {
        "category": best_category,
        "confidence": best_score,
        "method": "keyword",
        "session_id": req.session_id,
    }

# ─── Index Transaction ────────────────────────────────────────────────────────
@app.post("/v1/index/transaction")
async def index_transaction(req: IndexTransactionRequest, background_tasks: BackgroundTasks):
    """Index a single transaction into the vector store for future similarity search."""
    background_tasks.add_task(_do_index_transaction, req)
    return {"queued": True, "transaction_id": req.transaction_id}

async def _do_index_transaction(req: IndexTransactionRequest):
    client = get_qdrant()
    if not client:
        return

    from qdrant_client.models import PointStruct

    # Build text representation
    tx_text = (
        f"transaction channel={req.channel} amount_kobo={req.amount_kobo} "
        f"currency={req.currency} status={req.status} "
        f"merchant={req.merchant_id} "
        f"customer={req.customer_id or 'unknown'} "
        f"description={req.description or ''}"
    )

    vectors = embed_texts([tx_text])
    point = PointStruct(
        id=req.transaction_id,
        vector=vectors[0],
        payload={
            "_text": tx_text,
            "transaction_id": req.transaction_id,
            "merchant_id": req.merchant_id,
            "amount_kobo": req.amount_kobo,
            "currency": req.currency,
            "channel": req.channel,
            "status": req.status,
            "customer_id": req.customer_id,
            **(req.metadata or {}),
        },
    )

    try:
        client.upsert(
            collection_name=COLLECTIONS["transactions"]["name"],
            points=[point],
        )
        logger.info(f"[index] Transaction {req.transaction_id} indexed")
    except Exception as e:
        logger.error(f"[index] Failed to index transaction {req.transaction_id}: {e}")

# ─── Batch Index from Lakehouse ───────────────────────────────────────────────
class BatchIndexRequest(BaseModel):
    collection: str
    parquet_path: Optional[str] = None  # S3/MinIO path
    records: Optional[List[Dict[str, Any]]] = None  # Direct records
    text_field: str = "text"
    id_field: str = "id"
    batch_size: int = Field(default=100, ge=1, le=1000)

@app.post("/v1/index/batch")
async def batch_index(req: BatchIndexRequest, background_tasks: BackgroundTasks):
    """Batch index records from Parquet/Lakehouse or direct records."""
    if req.collection not in COLLECTIONS:
        raise HTTPException(status_code=404, detail=f"Unknown collection: {req.collection}")

    if not req.records and not req.parquet_path:
        raise HTTPException(status_code=400, detail="Provide either records or parquet_path")

    background_tasks.add_task(_do_batch_index, req)
    return {"queued": True, "collection": req.collection}

async def _do_batch_index(req: BatchIndexRequest):
    client = get_qdrant()
    if not client:
        return

    records = req.records or []

    # Load from Parquet if path provided
    if req.parquet_path and not records:
        try:
            import duckdb
            conn = duckdb.connect()
            rows = conn.execute(f"SELECT * FROM read_parquet('{req.parquet_path}')").fetchall()
            cols = [d[0] for d in conn.description]
            records = [dict(zip(cols, row)) for row in rows]
            conn.close()
            logger.info(f"[batch] Loaded {len(records)} records from {req.parquet_path}")
        except Exception as e:
            logger.error(f"[batch] Failed to load Parquet: {e}")
            return

    from qdrant_client.models import PointStruct

    collection_name = COLLECTIONS[req.collection]["name"]
    total_indexed = 0

    for i in range(0, len(records), req.batch_size):
        batch = records[i:i + req.batch_size]
        texts = [str(r.get(req.text_field, "")) for r in batch]
        vectors = embed_texts(texts)

        points = [
            PointStruct(
                id=str(r.get(req.id_field, str(uuid.uuid4()))),
                vector=vectors[j],
                payload={**r, "_text": texts[j]},
            )
            for j, r in enumerate(batch)
        ]

        try:
            client.upsert(collection_name=collection_name, points=points)
            total_indexed += len(points)
        except Exception as e:
            logger.error(f"[batch] Upsert failed: {e}")

    logger.info(f"[batch] Indexed {total_indexed} records into {collection_name}")

# ─── Main ─────────────────────────────────────────────────────────────────────
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
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=2)
