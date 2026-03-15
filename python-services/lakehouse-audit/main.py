"""
PayGate Lakehouse Audit Writer
================================
Consumes audit events from Kafka and writes them to the data lakehouse
(Apache Iceberg via REST catalog or Delta Lake via S3).

Endpoints:
  GET  /health
  GET  /metrics
  POST /v1/audit/write  — Direct write (for testing / non-Kafka path)

Environment variables:
  PORT              — HTTP port (default: 8098)
  KAFKA_BROKERS     — Kafka broker addresses
  KAFKA_TOPIC       — Kafka topic to consume (default: paygate-audit-events)
  KAFKA_GROUP_ID    — Consumer group ID
  ICEBERG_REST_URL  — Iceberg REST catalog URL
  S3_BUCKET         — S3 bucket for lakehouse storage
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION
"""

import json
import logging
import os
import time
from contextlib import asynccontextmanager
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

# ─── Write buffer ─────────────────────────────────────────────────────────────
write_buffer: list[dict] = []
total_written = 0


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
    """
    Write audit events to the lakehouse.
    In production, this uses PyIceberg or delta-rs to write Parquet files to S3.
    """
    global total_written
    # Stub: log events (replace with actual Iceberg/Delta write)
    for event in events:
        logger.info(f"[lakehouse] writing event type={event.event_type} resource={event.resource_type}/{event.resource_id}")
    total_written += len(events)
    return len(events)


async def start_kafka_consumer():
    """Start Kafka consumer in background (requires confluent-kafka)."""
    if not KAFKA_BROKERS:
        logger.info("KAFKA_BROKERS not set — Kafka consumer disabled")
        return
    try:
        from confluent_kafka import Consumer, KafkaError
        consumer = Consumer({
            "bootstrap.servers": KAFKA_BROKERS,
            "group.id": KAFKA_GROUP_ID,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
        })
        consumer.subscribe([KAFKA_TOPIC])
        logger.info(f"Kafka consumer started — topic={KAFKA_TOPIC}")

        import asyncio
        loop = asyncio.get_event_loop()

        def poll_loop():
            while True:
                msg = consumer.poll(timeout=1.0)
                if msg is None:
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    logger.error(f"Kafka error: {msg.error()}")
                    continue
                try:
                    data = json.loads(msg.value().decode("utf-8"))
                    event = AuditEvent(**data)
                    write_to_lakehouse([event])
                except Exception as e:
                    logger.error(f"Failed to process Kafka message: {e}")

        loop.run_in_executor(None, poll_loop)
    except ImportError:
        logger.warning("confluent-kafka not installed — Kafka consumer disabled")


@asynccontextmanager
async def lifespan(app: FastAPI):
    logger.info("Lakehouse audit writer starting")
    await start_kafka_consumer()
    yield
    logger.info("Lakehouse audit writer shutting down")


app = FastAPI(title="PayGate Lakehouse Audit Writer", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {
        "status": "ok",
        "service": "lakehouse-audit",
        "total_written": total_written,
        "kafka_enabled": bool(KAFKA_BROKERS),
    }


@app.post("/v1/audit/write")
async def write_event(event: AuditEvent):
    written = write_to_lakehouse([event])
    return {"written": written, "event_id": event.event_id}


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    return PlainTextResponse(
        f"paygate_lakehouse_events_written_total {total_written}\n",
        media_type="text/plain",
    )


if __name__ == "__main__":
    port = int(os.getenv("PORT", "8098"))
    uvicorn.run("main:app", host="0.0.0.0", port=port, reload=False)
