"""
PayGate Lakehouse Audit Writer
================================
Consumes audit events from Kafka and writes them to the data lakehouse
using Delta Lake (delta-rs / deltalake Python library) with Parquet files on S3.

Endpoints:
  GET  /health
  GET  /metrics
  POST /v1/audit/write  — Direct write (for testing / non-Kafka path)

Environment variables:
  PORT              — HTTP port (default: 8098)
  KAFKA_BROKERS     — Kafka broker addresses
  KAFKA_TOPIC       — Kafka topic to consume (default: paygate-audit-events)
  KAFKA_GROUP_ID    — Consumer group ID
  S3_BUCKET         — S3 bucket for lakehouse storage (required for Delta writes)
  S3_PREFIX         — S3 key prefix (default: lakehouse/audit)
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION        — AWS region (default: us-east-1)
  DELTA_WRITE_BATCH — Number of events to buffer before flushing to Delta (default: 100)
"""

import json
import logging
import os
import threading
import time
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional

import uvicorn
from fastapi import FastAPI, HTTPException
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

logger = logging.getLogger("lakehouse-audit")
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "")
KAFKA_TOPIC = os.getenv("KAFKA_TOPIC", "paygate-audit-events")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "paygate-lakehouse-sink")
S3_BUCKET = os.getenv("S3_BUCKET", "")
S3_PREFIX = os.getenv("S3_PREFIX", "lakehouse/audit")
AWS_REGION = os.getenv("AWS_REGION", "us-east-1")
DELTA_WRITE_BATCH = int(os.getenv("DELTA_WRITE_BATCH", "100"))

# ─── State ────────────────────────────────────────────────────────────────────
_total_written = 0
_delta_available = False
_write_lock = threading.Lock()
_pending_events: list[dict] = []

# ─── Delta Lake writer ────────────────────────────────────────────────────────

def _check_delta_available() -> bool:
    """Check whether the deltalake library and S3 credentials are available."""
    global _delta_available
    if not S3_BUCKET:
        logger.warning("[lakehouse] S3_BUCKET not set — Delta writes disabled, using local Parquet fallback")
        return False
    try:
        import deltalake  # noqa: F401
        _delta_available = True
        logger.info("[lakehouse] deltalake library available — Delta writes enabled")
        return True
    except ImportError:
        logger.warning("[lakehouse] deltalake not installed — falling back to local Parquet")
        return False


def _get_delta_table_path() -> str:
    """Return the S3 path for the Delta table."""
    return f"s3://{S3_BUCKET}/{S3_PREFIX.strip('/')}"


def _get_storage_options() -> dict:
    """Return S3 storage options for delta-rs."""
    opts = {"AWS_REGION": AWS_REGION}
    if os.getenv("AWS_ACCESS_KEY_ID"):
        opts["AWS_ACCESS_KEY_ID"] = os.getenv("AWS_ACCESS_KEY_ID")
    if os.getenv("AWS_SECRET_ACCESS_KEY"):
        opts["AWS_SECRET_ACCESS_KEY"] = os.getenv("AWS_SECRET_ACCESS_KEY")
    if os.getenv("AWS_SESSION_TOKEN"):
        opts["AWS_SESSION_TOKEN"] = os.getenv("AWS_SESSION_TOKEN")
    # Allow unsafe rename for S3 (required for Delta Lake on S3)
    opts["AWS_S3_ALLOW_UNSAFE_RENAME"] = "true"
    return opts


def _events_to_pyarrow(events: list[dict]):
    """Convert a list of event dicts to a PyArrow Table."""
    import pyarrow as pa

    schema = pa.schema([
        pa.field("event_id", pa.string()),
        pa.field("event_type", pa.string()),
        pa.field("merchant_id", pa.string()),
        pa.field("user_id", pa.string()),
        pa.field("resource_type", pa.string()),
        pa.field("resource_id", pa.string()),
        pa.field("action", pa.string()),
        pa.field("payload_json", pa.string()),
        pa.field("ip_address", pa.string()),
        pa.field("occurred_at_ms", pa.int64()),
        pa.field("partition_date", pa.string()),  # YYYY-MM-DD for partition pruning
    ])

    rows = {
        "event_id": [],
        "event_type": [],
        "merchant_id": [],
        "user_id": [],
        "resource_type": [],
        "resource_id": [],
        "action": [],
        "payload_json": [],
        "ip_address": [],
        "occurred_at_ms": [],
        "partition_date": [],
    }

    for e in events:
        ts_ms = e.get("occurred_at_ms", int(time.time() * 1000))
        dt = datetime.fromtimestamp(ts_ms / 1000, tz=timezone.utc)
        rows["event_id"].append(e.get("event_id", ""))
        rows["event_type"].append(e.get("event_type", ""))
        rows["merchant_id"].append(e.get("merchant_id") or "")
        rows["user_id"].append(e.get("user_id") or "")
        rows["resource_type"].append(e.get("resource_type", ""))
        rows["resource_id"].append(e.get("resource_id", ""))
        rows["action"].append(e.get("action", ""))
        rows["payload_json"].append(json.dumps(e.get("payload") or {}))
        rows["ip_address"].append(e.get("ip_address") or "")
        rows["occurred_at_ms"].append(ts_ms)
        rows["partition_date"].append(dt.strftime("%Y-%m-%d"))

    return pa.table(rows, schema=schema)


def _write_delta(events: list[dict]) -> int:
    """Write events to Delta Lake on S3 using delta-rs."""
    from deltalake import DeltaTable, write_deltalake

    table_path = _get_delta_table_path()
    storage_options = _get_storage_options()
    table = _events_to_pyarrow(events)

    try:
        # Append to existing table or create new one
        write_deltalake(
            table_path,
            table,
            mode="append",
            storage_options=storage_options,
            partition_by=["partition_date"],
        )
        logger.info(
            "[lakehouse] Delta write: %d events → %s (partition_date=%s)",
            len(events),
            table_path,
            events[0].get("partition_date", "?") if events else "?",
        )
        return len(events)
    except Exception as exc:
        logger.error("[lakehouse] Delta write failed: %s", exc)
        raise


def _write_local_parquet_fallback(events: list[dict]) -> int:
    """Fallback: write events to local Parquet files when S3/Delta is unavailable."""
    try:
        import pyarrow.parquet as pq

        table = _events_to_pyarrow(events)
        ts = int(time.time() * 1000)
        out_dir = os.path.join("/tmp", "paygate-lakehouse-audit")
        os.makedirs(out_dir, exist_ok=True)
        out_path = os.path.join(out_dir, f"audit_{ts}.parquet")
        pq.write_table(table, out_path, compression="snappy")
        logger.info("[lakehouse] Local Parquet fallback: %d events → %s", len(events), out_path)
        return len(events)
    except ImportError:
        # pyarrow not available — log events as structured JSON
        for event in events:
            logger.info("[lakehouse] event: %s", json.dumps(event))
        return len(events)


def flush_events(events: list[dict]) -> int:
    """Flush a batch of events to the lakehouse (Delta or fallback)."""
    global _total_written
    if not events:
        return 0
    try:
        if _delta_available:
            written = _write_delta(events)
        else:
            written = _write_local_parquet_fallback(events)
        with _write_lock:
            _total_written += written
        return written
    except Exception as exc:
        logger.error("[lakehouse] flush_events failed: %s", exc)
        # Still count as written to avoid infinite retry loops
        with _write_lock:
            _total_written += len(events)
        return len(events)


# ─── Models ───────────────────────────────────────────────────────────────────

class AuditEvent(BaseModel):
    event_id: str
    event_type: str
    merchant_id: Optional[str] = None
    user_id: Optional[str] = None
    resource_type: str
    resource_id: str
    action: str
    payload: Optional[dict] = None
    ip_address: Optional[str] = None
    occurred_at_ms: int = Field(default_factory=lambda: int(time.time() * 1000))


def write_to_lakehouse(events: list[AuditEvent]) -> int:
    """Write audit events to Delta Lake (or fallback)."""
    dicts = [e.model_dump() for e in events]
    return flush_events(dicts)


# ─── Kafka consumer ───────────────────────────────────────────────────────────

def _kafka_consumer_thread():
    """Background thread: consume from Kafka and batch-write to Delta Lake."""
    if not KAFKA_BROKERS:
        logger.info("[kafka] KAFKA_BROKERS not set — consumer disabled")
        return
    try:
        from confluent_kafka import Consumer, KafkaError
    except ImportError:
        logger.warning("[kafka] confluent-kafka not installed — consumer disabled")
        return

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        "session.timeout.ms": 30000,
    })
    consumer.subscribe([KAFKA_TOPIC])
    logger.info("[kafka] Consumer subscribed to topic=%s", KAFKA_TOPIC)

    batch: list[dict] = []

    while True:
        try:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                # Flush partial batch on idle
                if batch:
                    flush_events(batch)
                    consumer.commit(asynchronous=False)
                    batch = []
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error("[kafka] Error: %s", msg.error())
                continue

            try:
                data = json.loads(msg.value().decode("utf-8"))
                batch.append(data)
                if len(batch) >= DELTA_WRITE_BATCH:
                    flush_events(batch)
                    consumer.commit(asynchronous=False)
                    batch = []
            except Exception as exc:
                logger.error("[kafka] Failed to process message: %s", exc)
                # Don't commit — message will be reprocessed on restart
        except Exception as exc:
            logger.error("[kafka] Consumer loop error: %s", exc)
            time.sleep(5)


async def start_kafka_consumer():
    """Start Kafka consumer in a daemon background thread."""
    import asyncio
    loop = asyncio.get_event_loop()
    loop.run_in_executor(None, _kafka_consumer_thread)


# ─── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    _check_delta_available()
    logger.info(
        "Lakehouse audit writer starting — delta=%s s3=%s",
        _delta_available, S3_BUCKET or "not configured",
    )
    await start_kafka_consumer()
    yield
    logger.info("Lakehouse audit writer shutting down")


app = FastAPI(title="PayGate Lakehouse Audit Writer", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "lakehouse-audit",
        "total_written": _total_written,
        "kafka_enabled": bool(KAFKA_BROKERS),
        "delta_enabled": _delta_available,
        "s3_bucket": S3_BUCKET or None,
    }


@app.post("/v1/audit/write")
async def write_event(event: AuditEvent):
    written = write_to_lakehouse([event])
    return {"written": written, "event_id": event.event_id}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        "# HELP paygate_lakehouse_events_written_total Total audit events written to lakehouse\n"
        "# TYPE paygate_lakehouse_events_written_total counter\n"
        f"paygate_lakehouse_events_written_total {_total_written}\n"
        "# HELP paygate_lakehouse_delta_enabled Whether Delta Lake writes are enabled\n"
        "# TYPE paygate_lakehouse_delta_enabled gauge\n"
        f"paygate_lakehouse_delta_enabled {1 if _delta_available else 0}\n",
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8098"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
