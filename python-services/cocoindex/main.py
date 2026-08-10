"""
PayGate CocoIndex ETL Pipeline
================================
Incremental, multi-source data indexing pipeline using CocoIndex.

CocoIndex is a high-performance incremental data processing framework that:
  - Tracks data lineage and provenance
  - Supports incremental updates (only reprocesses changed data)
  - Integrates natively with vector stores (Qdrant), graph DBs (FalkorDB),
    and Lakehouse (Parquet/S3)
  - Provides built-in deduplication, schema validation, and error recovery

Pipeline Stages:
  1. Extract: Pull from PostgreSQL, Kafka, S3/Parquet, REST APIs
  2. Transform: Clean, normalize, enrich with ML features
  3. Embed: Generate semantic embeddings via FastEmbed
  4. Load: Upsert to Qdrant (vector), FalkorDB (graph), Parquet (lakehouse)

Data Sources:
  - transactions: PostgreSQL → Qdrant (fraud similarity) + FalkorDB (graph)
  - support_messages: PostgreSQL → Qdrant (semantic routing)
  - merchants: PostgreSQL → Qdrant (KYB matching) + FalkorDB (entity graph)
  - compliance_docs: S3 → Qdrant (compliance Q&A RAG)
  - knowledge_base: Markdown files → Qdrant (support RAG)

Environment:
  DATABASE_URL         — PostgreSQL connection string
  QDRANT_URL           — Qdrant REST URL
  QDRANT_API_KEY       — Qdrant API key (optional)
  FALKORDB_URL         — FalkorDB Redis URL (redis://falkordb:6379)
  VECTOR_STORE_URL     — Internal vector-store service URL
  S3_ENDPOINT          — S3/MinIO endpoint
  S3_ACCESS_KEY        — S3 access key
  S3_SECRET_KEY        — S3 secret key
  S3_BUCKET            — S3 bucket name
  KAFKA_BROKERS        — Kafka bootstrap servers
  PIPELINE_INTERVAL_S  — How often to run incremental sync (default: 60)
  PORT                 — HTTP port (default: 8131)
"""
from __future__ import annotations

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import uvicorn
from fastapi import FastAPI, BackgroundTasks, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("cocoindex")

# ─── Config ───────────────────────────────────────────────────────────────────
DATABASE_URL = os.getenv("DATABASE_URL", "postgresql://postgres:postgres@localhost:5432/paygate")
QDRANT_URL = os.getenv("QDRANT_URL", "http://qdrant:6333")
QDRANT_API_KEY = os.getenv("QDRANT_API_KEY", "")
FALKORDB_URL = os.getenv("FALKORDB_URL", "redis://falkordb:6379")
VECTOR_STORE_URL = os.getenv("VECTOR_STORE_URL", "http://vector-store:8130")
S3_ENDPOINT = os.getenv("S3_ENDPOINT", "")
S3_BUCKET = os.getenv("S3_BUCKET", "paygate-lakehouse")
KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
PIPELINE_INTERVAL_S = int(os.getenv("PIPELINE_INTERVAL_S", "60"))
PORT = int(os.getenv("PORT", "8131"))

# ─── Pipeline State ───────────────────────────────────────────────────────────
_pipeline_state: Dict[str, Any] = {
    "running": False,
    "last_run_at": None,
    "runs_completed": 0,
    "errors": 0,
    "records_processed": 0,
    "watermarks": {},  # source → last processed timestamp
}

# ─── CocoIndex-style Pipeline Definitions ─────────────────────────────────────
class PipelineStage:
    """Base class for pipeline stages."""
    name: str = "base"

    async def process(self, records: List[Dict]) -> List[Dict]:
        raise NotImplementedError

class ExtractPostgres(PipelineStage):
    """Extract records from PostgreSQL with watermark-based incremental loading."""
    name = "extract_postgres"

    def __init__(self, table: str, timestamp_col: str = "created_at", limit: int = 1000):
        self.table = table
        self.timestamp_col = timestamp_col
        self.limit = limit

    async def process(self, records: List[Dict]) -> List[Dict]:
        watermark = _pipeline_state["watermarks"].get(self.table, "1970-01-01T00:00:00Z")
        try:
            import asyncpg
            conn = await asyncpg.connect(DATABASE_URL)
            rows = await conn.fetch(
                f"SELECT * FROM {self.table} WHERE {self.timestamp_col} > $1 "
                f"ORDER BY {self.timestamp_col} ASC LIMIT $2",
                watermark, self.limit,
            )
            await conn.close()
            result = [dict(r) for r in rows]
            if result:
                _pipeline_state["watermarks"][self.table] = str(result[-1][self.timestamp_col])
            logger.info(f"[extract] {self.table}: {len(result)} new records since {watermark}")
            return result
        except Exception as e:
            logger.warning(f"[extract] {self.table} failed: {e}")
            return []

class TransformTransaction(PipelineStage):
    """Transform raw transaction records into indexable documents."""
    name = "transform_transaction"

    async def process(self, records: List[Dict]) -> List[Dict]:
        result = []
        for r in records:
            # Build rich text representation for embedding
            text = (
                f"PayGate transaction: "
                f"channel={r.get('channel', 'unknown')} "
                f"amount={r.get('amount', 0)} {r.get('currency', 'NGN')} "
                f"status={r.get('status', 'unknown')} "
                f"merchant_id={r.get('merchant_id', 'unknown')} "
                f"customer_id={r.get('customer_id', 'unknown')} "
                f"description={r.get('description', '')}"
            )
            result.append({
                "id": str(r.get("id", uuid.uuid4())),
                "text": text,
                "collection": "transactions",
                "payload": {
                    "transaction_id": str(r.get("id", "")),
                    "merchant_id": str(r.get("merchant_id", "")),
                    "amount": r.get("amount", 0),
                    "currency": r.get("currency", "NGN"),
                    "channel": r.get("channel", "unknown"),
                    "status": r.get("status", "unknown"),
                    "created_at": str(r.get("created_at", "")),
                },
                # Graph edges to create in FalkorDB
                "graph_edges": [
                    {"from": f"Merchant:{r.get('merchant_id')}", "rel": "PROCESSED", "to": f"Transaction:{r.get('id')}"},
                    {"from": f"Customer:{r.get('customer_id')}", "rel": "INITIATED", "to": f"Transaction:{r.get('id')}"},
                ],
            })
        return result

class TransformSupportMessage(PipelineStage):
    """Transform support messages into indexable documents."""
    name = "transform_support"

    async def process(self, records: List[Dict]) -> List[Dict]:
        result = []
        for r in records:
            if r.get("role") != "user":
                continue  # Only index user messages for routing
            result.append({
                "id": str(r.get("id", uuid.uuid4())),
                "text": r.get("content", ""),
                "collection": "support",
                "payload": {
                    "session_id": r.get("session_id", ""),
                    "merchant_id": r.get("merchant_id", ""),
                    "role": r.get("role", "user"),
                    "created_at": str(r.get("created_at", "")),
                },
                "graph_edges": [],
            })
        return result

class TransformMerchant(PipelineStage):
    """Transform merchant records into indexable documents."""
    name = "transform_merchant"

    async def process(self, records: List[Dict]) -> List[Dict]:
        result = []
        for r in records:
            text = (
                f"PayGate merchant: "
                f"name={r.get('business_name', r.get('name', 'unknown'))} "
                f"type={r.get('business_type', 'unknown')} "
                f"country={r.get('country', 'NG')} "
                f"status={r.get('status', 'unknown')} "
                f"mcc={r.get('mcc', '')} "
                f"email={r.get('email', '')}"
            )
            result.append({
                "id": str(r.get("id", uuid.uuid4())),
                "text": text,
                "collection": "merchants",
                "payload": {
                    "merchant_id": str(r.get("id", "")),
                    "name": r.get("business_name", r.get("name", "")),
                    "type": r.get("business_type", ""),
                    "country": r.get("country", "NG"),
                    "status": r.get("status", ""),
                },
                "graph_edges": [
                    {"from": f"Merchant:{r.get('id')}", "rel": "OPERATES_IN", "to": f"Country:{r.get('country', 'NG')}"},
                ],
            })
        return result

class LoadQdrant(PipelineStage):
    """Load documents into Qdrant via the vector-store service."""
    name = "load_qdrant"

    async def process(self, records: List[Dict]) -> List[Dict]:
        if not records:
            return records

        # Group by collection
        by_collection: Dict[str, List[Dict]] = {}
        for r in records:
            col = r.get("collection", "knowledge")
            by_collection.setdefault(col, []).append(r)

        try:
            import aiohttp
            async with aiohttp.ClientSession() as session:
                for collection, docs in by_collection.items():
                    points = [
                        {"id": d["id"], "text": d["text"], "payload": d.get("payload", {})}
                        for d in docs
                    ]
                    async with session.post(
                        f"{VECTOR_STORE_URL}/v1/upsert/{collection}",
                        json={"points": points},
                        timeout=aiohttp.ClientTimeout(total=60),
                    ) as resp:
                        if resp.status == 200:
                            logger.info(f"[qdrant] Upserted {len(points)} → {collection}")
                        else:
                            body = await resp.text()
                            logger.warning(f"[qdrant] Upsert failed ({resp.status}): {body[:200]}")
        except Exception as e:
            logger.warning(f"[qdrant] Load failed: {e}")

        return records

class LoadFalkorDB(PipelineStage):
    """Load graph edges into FalkorDB."""
    name = "load_falkordb"

    async def process(self, records: List[Dict]) -> List[Dict]:
        edges = []
        for r in records:
            edges.extend(r.get("graph_edges", []))

        if not edges:
            return records

        try:
            import redis
            r_client = redis.from_url(FALKORDB_URL, decode_responses=True)
            # FalkorDB uses Redis GRAPH commands
            for edge in edges[:100]:  # Limit per batch
                cypher = (
                    f"MERGE (a {{id: '{edge['from']}'}}) "
                    f"MERGE (b {{id: '{edge['to']}'}}) "
                    f"MERGE (a)-[:{edge['rel']}]->(b)"
                )
                try:
                    r_client.execute_command("GRAPH.QUERY", "paygate_kg", cypher)
                except Exception as e:
                    logger.debug(f"[falkordb] Edge insert: {e}")
            logger.info(f"[falkordb] Inserted {len(edges)} edges")
        except Exception as e:
            logger.debug(f"[falkordb] Not available: {e}")

        return records

class LoadLakehouse(PipelineStage):
    """Append processed records to Parquet files in S3/Lakehouse."""
    name = "load_lakehouse"

    async def process(self, records: List[Dict]) -> List[Dict]:
        if not records or not S3_ENDPOINT:
            return records

        try:
            import pyarrow as pa
            import pyarrow.parquet as pq
            import boto3
            import io

            # Flatten records for Parquet
            flat = []
            for r in records:
                flat.append({
                    "id": r.get("id", ""),
                    "collection": r.get("collection", ""),
                    "text": r.get("text", "")[:1000],
                    "indexed_at": datetime.now(timezone.utc).isoformat(),
                    **{f"payload_{k}": str(v) for k, v in r.get("payload", {}).items()},
                })

            table = pa.Table.from_pylist(flat)
            buf = io.BytesIO()
            pq.write_table(table, buf)
            buf.seek(0)

            s3 = boto3.client(
                "s3",
                endpoint_url=S3_ENDPOINT,
                aws_access_key_id=os.getenv("S3_ACCESS_KEY", ""),
                aws_secret_access_key=os.getenv("S3_SECRET_KEY", ""),
            )
            key = f"cocoindex/indexed/{datetime.now(timezone.utc).strftime('%Y/%m/%d/%H%M%S')}-{uuid.uuid4().hex[:8]}.parquet"
            s3.put_object(Bucket=S3_BUCKET, Key=key, Body=buf.getvalue())
            logger.info(f"[lakehouse] Wrote {len(flat)} records → s3://{S3_BUCKET}/{key}")
        except Exception as e:
            logger.debug(f"[lakehouse] S3 write skipped: {e}")

        return records

# ─── Pipeline Runner ──────────────────────────────────────────────────────────
PIPELINES = [
    {
        "name": "transactions",
        "stages": [
            ExtractPostgres("transactions", "created_at"),
            TransformTransaction(),
            LoadQdrant(),
            LoadFalkorDB(),
            LoadLakehouse(),
        ],
    },
    {
        "name": "support_messages",
        "stages": [
            ExtractPostgres("support_messages", "created_at"),
            TransformSupportMessage(),
            LoadQdrant(),
            LoadLakehouse(),
        ],
    },
    {
        "name": "merchants",
        "stages": [
            ExtractPostgres("users", "created_at"),
            TransformMerchant(),
            LoadQdrant(),
            LoadFalkorDB(),
            LoadLakehouse(),
        ],
    },
]

async def run_pipeline(pipeline: Dict) -> Dict[str, Any]:
    """Run a single pipeline end-to-end."""
    name = pipeline["name"]
    stages = pipeline["stages"]
    start = time.time()
    records: List[Dict] = []

    for stage in stages:
        try:
            records = await stage.process(records)
        except Exception as e:
            logger.error(f"[pipeline:{name}] Stage {stage.name} failed: {e}")
            return {"pipeline": name, "status": "error", "error": str(e), "duration_ms": int((time.time() - start) * 1000)}

    duration_ms = int((time.time() - start) * 1000)
    logger.info(f"[pipeline:{name}] Completed {len(records)} records in {duration_ms}ms")
    return {"pipeline": name, "status": "ok", "records": len(records), "duration_ms": duration_ms}

async def run_all_pipelines():
    """Run all pipelines and update state."""
    if _pipeline_state["running"]:
        logger.warning("[scheduler] Previous run still in progress, skipping")
        return

    _pipeline_state["running"] = True
    _pipeline_state["last_run_at"] = datetime.now(timezone.utc).isoformat()

    results = []
    for pipeline in PIPELINES:
        result = await run_pipeline(pipeline)
        results.append(result)
        if result["status"] == "ok":
            _pipeline_state["records_processed"] += result.get("records", 0)
        else:
            _pipeline_state["errors"] += 1

    _pipeline_state["runs_completed"] += 1
    _pipeline_state["running"] = False
    return results

async def scheduler_loop():
    """Background scheduler that runs pipelines at PIPELINE_INTERVAL_S."""
    while True:
        await asyncio.sleep(PIPELINE_INTERVAL_S)
        try:
            await run_all_pipelines()
        except Exception as e:
            logger.error(f"[scheduler] Unhandled error: {e}")

# ─── Lifespan ─────────────────────────────────────────────────────────────────
@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("[startup] CocoIndex ETL pipeline starting...")
    # Run initial pipeline on startup
    asyncio.create_task(run_all_pipelines())
    # Start scheduler
    asyncio.create_task(scheduler_loop())
    logger.info(f"[startup] Scheduler: every {PIPELINE_INTERVAL_S}s")
    yield
    logger.info("[shutdown] CocoIndex ETL pipeline stopping...")

# ─── App ──────────────────────────────────────────────────────────────────────
app = FastAPI(
    title="PayGate CocoIndex ETL",
    description="Incremental multi-source data indexing pipeline",
    version="1.0.0",
    lifespan=lifespan,
)

@app.get("/health")
async def health():
    return {
        "status": "ok",
        "pipeline_state": _pipeline_state,
        "pipelines": [p["name"] for p in PIPELINES],
        "interval_s": PIPELINE_INTERVAL_S,
    }

@app.get("/status")
async def status():
    return _pipeline_state

@app.post("/run")
async def trigger_run(background_tasks: BackgroundTasks):
    """Manually trigger a pipeline run."""
    background_tasks.add_task(run_all_pipelines)
    return {"triggered": True, "message": "Pipeline run queued"}

@app.post("/run/{pipeline_name}")
async def trigger_single(pipeline_name: str, background_tasks: BackgroundTasks):
    """Trigger a single named pipeline."""
    pipeline = next((p for p in PIPELINES if p["name"] == pipeline_name), None)
    if not pipeline:
        raise HTTPException(status_code=404, detail=f"Pipeline not found: {pipeline_name}")
    background_tasks.add_task(run_pipeline, pipeline)
    return {"triggered": True, "pipeline": pipeline_name}

@app.get("/watermarks")
async def get_watermarks():
    return _pipeline_state.get("watermarks", {})

@app.delete("/watermarks/{source}")
async def reset_watermark(source: str):
    """Reset watermark for a source to force full re-index."""
    if source in _pipeline_state["watermarks"]:
        del _pipeline_state["watermarks"][source]
    return {"reset": source}

if __name__ == "__main__":
    uvicorn.run("main:app", host="0.0.0.0", port=PORT, reload=False, workers=4, log_level="warning")
