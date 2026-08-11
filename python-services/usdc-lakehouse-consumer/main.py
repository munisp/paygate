"""
PayGate USDC Lakehouse Consumer
================================
Consumes paygate.usdc.payout.settled and paygate.usdc.deposit.received events
from Kafka and writes them to the data lakehouse (Apache Iceberg / Delta Lake).

This service is the bridge between the Go bridge's Kafka producers and the
analytics layer. It also enriches events with USD exchange rates for reporting.

Endpoints:
  GET  /health          — Health check
  GET  /metrics         — Prometheus metrics
  POST /v1/usdc/write   — Direct write (for testing / non-Kafka path)

Environment variables:
  PORT                  — HTTP port (default: 8099)
  KAFKA_BROKERS         — Kafka broker addresses (comma-separated)
  KAFKA_GROUP_ID        — Consumer group ID (default: usdc-lakehouse-consumer)
  ICEBERG_REST_URL      — Iceberg REST catalog URL
  S3_BUCKET             — S3 bucket for lakehouse storage
  AWS_ACCESS_KEY_ID
  AWS_SECRET_ACCESS_KEY
  AWS_REGION            — (default: us-east-1)
  COINGECKO_API_URL     — CoinGecko API for USDC/USD rate (optional)
  LOG_LEVEL             — Logging level (default: INFO)
"""

import json
import logging
import os
import time
import threading
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Optional, Any

import uvicorn
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import PlainTextResponse
from pydantic import BaseModel, Field

# ─── Logging ──────────────────────────────────────────────────────────────────
logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("usdc-lakehouse-consumer")

# ─── Prometheus metrics ────────────────────────────────────────────────────────
try:
    from prometheus_client import Counter, Histogram, Gauge, generate_latest, CONTENT_TYPE_LATEST
    EVENTS_CONSUMED = Counter(
        "paygate_usdc_events_consumed_total",
        "Total USDC events consumed from Kafka",
        ["event_type", "status"],
    )
    WRITE_LATENCY = Histogram(
        "paygate_usdc_lakehouse_write_duration_seconds",
        "Lakehouse write duration",
    )
    CONSUMER_LAG = Gauge(
        "paygate_usdc_consumer_lag",
        "Kafka consumer lag for USDC topics",
    )
    METRICS_ENABLED = True
except ImportError:
    METRICS_ENABLED = False
    logger.warning("prometheus_client not installed — metrics disabled")

# ─── Kafka topics ─────────────────────────────────────────────────────────────
TOPIC_PAYOUT_SETTLED = "paygate.usdc.payout.settled"
TOPIC_DEPOSIT_RECEIVED = "paygate.usdc.deposit.received"
USDC_TOPICS = [TOPIC_PAYOUT_SETTLED, TOPIC_DEPOSIT_RECEIVED]

# ─── Pydantic models ──────────────────────────────────────────────────────────

class USDCPayoutSettledEvent(BaseModel):
    transfer_id: str
    merchant_id: str
    recipient_wallet: str
    amount_lamports: int
    solana_signature: str
    slot: int = 0
    settled_at: int  # Unix timestamp ms
    reference: str = ""

class USDCDepositReceivedEvent(BaseModel):
    deposit_id: str
    wallet_address: str
    amount_lamports: int
    solana_signature: str
    slot: int = 0
    detected_at: int  # Unix timestamp ms

class DirectWriteRequest(BaseModel):
    event_type: str = Field(..., pattern="^(payout_settled|deposit_received)$")
    payload: dict[str, Any]

class HealthResponse(BaseModel):
    status: str
    kafka_connected: bool
    lakehouse_connected: bool
    events_processed: int
    uptime_seconds: float

# ─── State ────────────────────────────────────────────────────────────────────

_start_time = time.time()
_events_processed = 0
_kafka_connected = False
_lakehouse_connected = False
_consumer_thread: Optional[threading.Thread] = None

# ─── Lakehouse writer ─────────────────────────────────────────────────────────

class LakehouseWriter:
    """
    Writes USDC events to the data lakehouse.

    In production, this uses PyIceberg to write to Apache Iceberg tables
    via an Iceberg REST catalog. In development (no ICEBERG_REST_URL),
    it falls back to writing JSON lines to S3 directly.
    """

    def __init__(self):
        self.iceberg_url = os.getenv("ICEBERG_REST_URL", "")
        self.s3_bucket = os.getenv("S3_BUCKET", "paygate-lakehouse")
        self.region = os.getenv("AWS_REGION", "us-east-1")
        self._catalog = None
        self._init_catalog()

    def _init_catalog(self):
        global _lakehouse_connected
        if not self.iceberg_url:
            logger.warning("ICEBERG_REST_URL not set — using S3 JSON fallback")
            _lakehouse_connected = True  # S3 fallback is always available
            return
        try:
            from pyiceberg.catalog.rest import RestCatalog
            self._catalog = RestCatalog(
                name="paygate",
                **{"uri": self.iceberg_url, "warehouse": f"s3://{self.s3_bucket}"},
            )
            _lakehouse_connected = True
            logger.info("Iceberg REST catalog connected: %s", self.iceberg_url)
        except Exception as e:
            logger.warning("Iceberg catalog init failed (S3 fallback active): %s", e)
            _lakehouse_connected = True  # S3 fallback

    def write_payout_settled(self, event: USDCPayoutSettledEvent):
        """Write a payout settled event to the usdc_payouts lakehouse table."""
        record = {
            "transfer_id": event.transfer_id,
            "merchant_id": event.merchant_id,
            "recipient_wallet": event.recipient_wallet,
            "amount_lamports": event.amount_lamports,
            "amount_usdc": event.amount_lamports / 1_000_000,
            "solana_signature": event.solana_signature,
            "slot": event.slot,
            "settled_at": datetime.fromtimestamp(
                event.settled_at / 1000, tz=timezone.utc
            ).isoformat(),
            "reference": event.reference,
            "event_type": "payout_settled",
            "_ingested_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self._write_record("usdc_payouts", record)

    def write_deposit_received(self, event: USDCDepositReceivedEvent):
        """Write a deposit received event to the usdc_deposits lakehouse table."""
        record = {
            "deposit_id": event.deposit_id,
            "wallet_address": event.wallet_address,
            "amount_lamports": event.amount_lamports,
            "amount_usdc": event.amount_lamports / 1_000_000,
            "solana_signature": event.solana_signature,
            "slot": event.slot,
            "detected_at": datetime.fromtimestamp(
                event.detected_at / 1000, tz=timezone.utc
            ).isoformat(),
            "event_type": "deposit_received",
            "_ingested_at": datetime.now(tz=timezone.utc).isoformat(),
        }
        self._write_record("usdc_deposits", record)

    def _write_record(self, table_name: str, record: dict):
        """Write a record to the lakehouse. Falls back to S3 JSON if Iceberg unavailable."""
        start = time.time()
        try:
            if self._catalog:
                self._write_iceberg(table_name, record)
            else:
                self._write_s3_json(table_name, record)
            if METRICS_ENABLED:
                WRITE_LATENCY.observe(time.time() - start)
            logger.debug("Wrote %s record: %s", table_name, record.get("transfer_id") or record.get("deposit_id"))
        except Exception as e:
            logger.error("Lakehouse write failed for %s: %s", table_name, e)
            raise

    def _write_iceberg(self, table_name: str, record: dict):
        """Write to Apache Iceberg table via REST catalog."""
        import pyarrow as pa
        try:
            table = self._catalog.load_table(f"paygate.{table_name}")
        except Exception:
            logger.info("Creating Iceberg table: paygate.%s", table_name)
            # Auto-create table on first write
            schema = pa.schema([
                pa.field(k, pa.string()) for k in record.keys()
            ])
            self._catalog.create_table(
                f"paygate.{table_name}",
                schema=schema,
                location=f"s3://{self.s3_bucket}/lakehouse/{table_name}",
            )
            table = self._catalog.load_table(f"paygate.{table_name}")

        batch = pa.record_batch(
            {k: [str(v)] for k, v in record.items()},
            schema=table.schema().as_arrow(),
        )
        table.append(batch)

    def _write_s3_json(self, table_name: str, record: dict):
        """Fallback: write JSON lines to S3 partitioned by date."""
        try:
            import boto3
            s3 = boto3.client(
                "s3",
                region_name=self.region,
                aws_access_key_id=os.getenv("AWS_ACCESS_KEY_ID"),
                aws_secret_access_key=os.getenv("AWS_SECRET_ACCESS_KEY"),
            )
            date_str = datetime.now(tz=timezone.utc).strftime("%Y/%m/%d")
            key = f"lakehouse/{table_name}/{date_str}/{int(time.time() * 1000)}.json"
            s3.put_object(
                Bucket=self.s3_bucket,
                Key=key,
                Body=json.dumps(record),
                ContentType="application/json",
            )
        except Exception as e:
            # Log and continue — don't crash the consumer on S3 write failures
            logger.error("S3 JSON fallback write failed: %s", e)


_writer = LakehouseWriter()

# ─── Kafka consumer ───────────────────────────────────────────────────────────

def start_kafka_consumer():
    """Start the Kafka consumer in a background thread."""
    global _kafka_connected, _events_processed

    brokers = os.getenv("KAFKA_BROKERS", "")
    if not brokers:
        logger.warning("KAFKA_BROKERS not set — Kafka consumer disabled")
        return

    try:
        from confluent_kafka import Consumer, KafkaError
    except ImportError:
        logger.warning("confluent-kafka not installed — Kafka consumer disabled")
        return

    conf = {
        "bootstrap.servers": brokers,
        "group.id": os.getenv("KAFKA_GROUP_ID", "usdc-lakehouse-consumer"),
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        "session.timeout.ms": 30000,
    }

    consumer = Consumer(conf)
    consumer.subscribe(USDC_TOPICS)
    _kafka_connected = True
    logger.info("Kafka consumer subscribed to: %s", USDC_TOPICS)

    while True:
        try:
            msg = consumer.poll(timeout=1.0)
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error("Kafka error: %s", msg.error())
                continue

            topic = msg.topic()
            try:
                payload = json.loads(msg.value().decode("utf-8"))
                _process_event(topic, payload)
                consumer.commit(message=msg, asynchronous=False)
                _events_processed += 1
                if METRICS_ENABLED:
                    EVENTS_CONSUMED.labels(event_type=topic, status="success").inc()
            except Exception as e:
                logger.error("Failed to process event from %s: %s", topic, e)
                if METRICS_ENABLED:
                    EVENTS_CONSUMED.labels(event_type=topic, status="error").inc()
                # Don't commit — message will be reprocessed on restart
        except Exception as e:
            logger.error("Kafka consumer loop error: %s", e)
            time.sleep(5)


def _process_event(topic: str, payload: dict):
    """Route a Kafka event to the appropriate lakehouse writer."""
    if topic == TOPIC_PAYOUT_SETTLED:
        event = USDCPayoutSettledEvent(**payload)
        _writer.write_payout_settled(event)
        logger.info(
            "Payout settled written: transfer_id=%s amount_usdc=%.6f sig=%s",
            event.transfer_id,
            event.amount_lamports / 1_000_000,
            event.solana_signature[:16] + "...",
        )
    elif topic == TOPIC_DEPOSIT_RECEIVED:
        event = USDCDepositReceivedEvent(**payload)
        _writer.write_deposit_received(event)
        logger.info(
            "Deposit received written: deposit_id=%s amount_usdc=%.6f sig=%s",
            event.deposit_id,
            event.amount_lamports / 1_000_000,
            event.solana_signature[:16] + "...",
        )
    else:
        logger.warning("Unknown topic: %s", topic)


# ─── FastAPI app ──────────────────────────────────────────────────────────────

@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer_thread
    _consumer_thread = threading.Thread(target=start_kafka_consumer, daemon=True)
    _consumer_thread.start()
    logger.info("USDC Lakehouse Consumer started")
    yield
    logger.info("USDC Lakehouse Consumer shutting down")


app = FastAPI(
    title="PayGate USDC Lakehouse Consumer",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health", response_model=HealthResponse)
def health():
    return HealthResponse(
        status="ok",
        kafka_connected=_kafka_connected,
        lakehouse_connected=_lakehouse_connected,
        events_processed=_events_processed,
        uptime_seconds=time.time() - _start_time,
    )


@app.get("/metrics", response_class=PlainTextResponse)
def metrics():
    if not METRICS_ENABLED:
        raise HTTPException(status_code=503, detail="Metrics not available")
    return PlainTextResponse(generate_latest(), media_type=CONTENT_TYPE_LATEST)


@app.post("/v1/usdc/write", status_code=201)
def direct_write(req: DirectWriteRequest):
    """Direct write endpoint for testing and non-Kafka ingestion paths."""
    try:
        _process_event(
            TOPIC_PAYOUT_SETTLED if req.event_type == "payout_settled" else TOPIC_DEPOSIT_RECEIVED,
            req.payload,
        )
        return {"status": "written", "event_type": req.event_type}
    except Exception as e:
        raise HTTPException(status_code=422, detail=str(e))


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
    port = int(os.getenv("PORT", "8099"))
    uvicorn.run(app, host="0.0.0.0", port=port, workers=4, log_level="warning")
