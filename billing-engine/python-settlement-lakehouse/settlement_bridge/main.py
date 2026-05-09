"""
PayGate Billing — Python Settlement Bridge & Lakehouse Pipeline
================================================================
Responsibilities:
  1. Mojaloop settlement integration — receives settlement notifications from
     Mojaloop and reconciles them against TigerBeetle ledger entries.
  2. Lakehouse streaming — consumes billing.computed events from Kafka and
     writes them to a Delta Lake table (S3/MinIO) for analytics.
  3. Overhead cost tracking — periodically aggregates operational costs
     (infrastructure, labor, travel, etc.) and writes to the lakehouse.
  4. Real-time billing dashboard feed — exposes aggregated metrics via
     a FastAPI endpoint consumed by the portal's billing dashboard.
"""

import asyncio
import json
import logging
import os
import time
import uuid
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from typing import Any, Optional

import httpx
import pandas as pd
import pyarrow as pa
import pyarrow.parquet as pq
from confluent_kafka import Consumer, KafkaError, Producer
from deltalake import DeltaTable, write_deltalake
from fastapi import BackgroundTasks, FastAPI, HTTPException, Request
from pydantic import BaseModel, Field
from pydantic_settings import BaseSettings
from tenacity import retry, stop_after_attempt, wait_exponential

# ── Configuration ─────────────────────────────────────────────────────────────

class Settings(BaseSettings):
    server_port: int = 8093
    kafka_brokers: str = "localhost:9092"
    kafka_group_id: str = "settlement-lakehouse"
    kafka_topic_billing_computed: str = "billing.computed"
    kafka_topic_settlement_completed: str = "settlement.completed"
    mojaloop_url: str = "http://localhost:3001"
    mojaloop_api_key: str = ""
    tigerbeetle_http_url: str = "http://localhost:8080"
    lakehouse_s3_bucket: str = "paygate-lakehouse"
    lakehouse_s3_prefix: str = "billing"
    aws_endpoint_url: str = ""  # MinIO endpoint for local dev
    aws_access_key_id: str = ""
    aws_secret_access_key: str = ""
    database_url: str = ""
    redis_url: str = "redis://localhost:6379"
    internal_api_key: str = ""
    portal_internal_api_url: str = "http://localhost:3000"
    log_level: str = "INFO"

    class Config:
        env_file = ".env"
        env_file_encoding = "utf-8"


settings = Settings()

logging.basicConfig(
    level=getattr(logging, settings.log_level),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("settlement_bridge")


# ── Pydantic Models ───────────────────────────────────────────────────────────

class BillingComputedEvent(BaseModel):
    billing_id: str
    tenant_id: str
    merchant_id: str
    reseller_id: Optional[str] = None
    transaction_id: str
    amount_kobo: int
    gross_fee_kobo: int
    platform_revenue_kobo: int
    reseller_revenue_kobo: int
    interchange_cost_kobo: int
    net_platform_revenue_kobo: int
    pricing_model: str
    channel: str
    currency: str = "NGN"
    occurred_at: int  # Unix ms


class SettlementNotification(BaseModel):
    settlement_id: str
    tenant_id: str
    merchant_id: str
    amount_kobo: int
    currency: str = "NGN"
    mojaloop_transfer_id: str
    status: str  # "COMMITTED" | "ABORTED"
    settled_at: int  # Unix ms


class OverheadCostEntry(BaseModel):
    tenant_id: str
    category: str  # "infrastructure" | "labor" | "travel" | "marketing" | "other"
    amount_kobo: int
    description: str
    period_start: int  # Unix ms
    period_end: int    # Unix ms
    recorded_by: str


class BillingMetricsSummary(BaseModel):
    tenant_id: str
    period_start: int
    period_end: int
    total_transactions: int
    total_volume_kobo: int
    total_gross_fee_kobo: int
    total_platform_revenue_kobo: int
    total_reseller_revenue_kobo: int
    total_interchange_cost_kobo: int
    total_net_platform_revenue_kobo: int
    total_overhead_kobo: int
    ebitda_kobo: int
    ebitda_margin_bps: int  # basis points


# ── Lakehouse Writer ──────────────────────────────────────────────────────────

class LakehouseWriter:
    """Writes billing events to Delta Lake tables on S3/MinIO."""

    def __init__(self):
        self.storage_options = {}
        if settings.aws_endpoint_url:
            self.storage_options = {
                "AWS_ENDPOINT_URL": settings.aws_endpoint_url,
                "AWS_ACCESS_KEY_ID": settings.aws_access_key_id,
                "AWS_SECRET_ACCESS_KEY": settings.aws_secret_access_key,
                "AWS_ALLOW_HTTP": "true",
                "AWS_S3_ALLOW_UNSAFE_RENAME": "true",
            }

    def _table_path(self, table_name: str) -> str:
        return f"s3://{settings.lakehouse_s3_bucket}/{settings.lakehouse_s3_prefix}/{table_name}"

    def write_billing_events(self, events: list[dict]) -> None:
        """Append billing computed events to the billing_events Delta table."""
        if not events:
            return

        df = pd.DataFrame(events)
        df["_ingested_at"] = int(time.time() * 1000)
        df["_date"] = pd.to_datetime(df["occurred_at"], unit="ms").dt.date.astype(str)

        table = pa.Table.from_pandas(df)
        write_deltalake(
            self._table_path("billing_events"),
            table,
            mode="append",
            partition_by=["_date", "tenant_id"],
            storage_options=self.storage_options,
        )
        logger.info(f"Wrote {len(events)} billing events to lakehouse")

    def write_settlement_events(self, events: list[dict]) -> None:
        """Append settlement events to the settlement_events Delta table."""
        if not events:
            return

        df = pd.DataFrame(events)
        df["_ingested_at"] = int(time.time() * 1000)
        df["_date"] = pd.to_datetime(df["settled_at"], unit="ms").dt.date.astype(str)

        table = pa.Table.from_pandas(df)
        write_deltalake(
            self._table_path("settlement_events"),
            table,
            mode="append",
            partition_by=["_date", "tenant_id"],
            storage_options=self.storage_options,
        )
        logger.info(f"Wrote {len(events)} settlement events to lakehouse")

    def write_overhead_costs(self, costs: list[dict]) -> None:
        """Append overhead cost entries to the overhead_costs Delta table."""
        if not costs:
            return

        df = pd.DataFrame(costs)
        df["_ingested_at"] = int(time.time() * 1000)

        table = pa.Table.from_pandas(df)
        write_deltalake(
            self._table_path("overhead_costs"),
            table,
            mode="append",
            partition_by=["tenant_id", "category"],
            storage_options=self.storage_options,
        )
        logger.info(f"Wrote {len(costs)} overhead cost entries to lakehouse")

    def compute_billing_summary(
        self, tenant_id: str, period_start: int, period_end: int
    ) -> Optional[BillingMetricsSummary]:
        """Read from Delta Lake and compute a billing summary for a period."""
        try:
            dt = DeltaTable(
                self._table_path("billing_events"),
                storage_options=self.storage_options,
            )
            df = dt.to_pandas(
                filters=[
                    ("tenant_id", "=", tenant_id),
                    ("occurred_at", ">=", period_start),
                    ("occurred_at", "<=", period_end),
                ]
            )

            # Overhead costs
            ot = DeltaTable(
                self._table_path("overhead_costs"),
                storage_options=self.storage_options,
            )
            overhead_df = ot.to_pandas(
                filters=[
                    ("tenant_id", "=", tenant_id),
                    ("period_start", ">=", period_start),
                    ("period_end", "<=", period_end),
                ]
            )

            total_overhead = int(overhead_df["amount_kobo"].sum()) if not overhead_df.empty else 0
            net_revenue = int(df["net_platform_revenue_kobo"].sum()) if not df.empty else 0
            ebitda = net_revenue - total_overhead
            ebitda_margin_bps = int((ebitda / net_revenue * 10000)) if net_revenue > 0 else 0

            return BillingMetricsSummary(
                tenant_id=tenant_id,
                period_start=period_start,
                period_end=period_end,
                total_transactions=len(df),
                total_volume_kobo=int(df["amount_kobo"].sum()) if not df.empty else 0,
                total_gross_fee_kobo=int(df["gross_fee_kobo"].sum()) if not df.empty else 0,
                total_platform_revenue_kobo=int(df["platform_revenue_kobo"].sum()) if not df.empty else 0,
                total_reseller_revenue_kobo=int(df["reseller_revenue_kobo"].sum()) if not df.empty else 0,
                total_interchange_cost_kobo=int(df["interchange_cost_kobo"].sum()) if not df.empty else 0,
                total_net_platform_revenue_kobo=net_revenue,
                total_overhead_kobo=total_overhead,
                ebitda_kobo=ebitda,
                ebitda_margin_bps=ebitda_margin_bps,
            )
        except Exception as e:
            logger.error(f"Failed to compute billing summary: {e}")
            return None


# ── Mojaloop Settlement Bridge ────────────────────────────────────────────────

class MojaloopSettlementBridge:
    """Reconciles Mojaloop settlement notifications with TigerBeetle ledger."""

    def __init__(self, writer: LakehouseWriter):
        self.writer = writer
        self.client = httpx.AsyncClient(timeout=30.0)

    @retry(stop=stop_after_attempt(3), wait=wait_exponential(multiplier=1, min=2, max=10))
    async def reconcile_settlement(self, notification: SettlementNotification) -> bool:
        """
        Reconcile a Mojaloop settlement against TigerBeetle.
        Returns True if reconciliation succeeded.
        """
        logger.info(
            f"Reconciling settlement {notification.settlement_id} "
            f"for tenant {notification.tenant_id}"
        )

        # 1. Verify with Mojaloop API
        resp = await self.client.get(
            f"{settings.mojaloop_url}/v2/settlements/{notification.mojaloop_transfer_id}",
            headers={"Authorization": f"Bearer {settings.mojaloop_api_key}"},
        )
        if resp.status_code != 200:
            logger.error(f"Mojaloop verification failed: {resp.status_code}")
            return False

        mojaloop_data = resp.json()
        if mojaloop_data.get("state") != "COMMITTED":
            logger.warning(f"Settlement not committed: {mojaloop_data.get('state')}")
            return False

        # 2. Post settlement transfer to TigerBeetle
        tb_transfer = {
            "id": str(uuid.uuid4()),
            "debit_account_id": f"settlement_pending_{notification.tenant_id}",
            "credit_account_id": f"settlement_cleared_{notification.tenant_id}",
            "amount": notification.amount_kobo,
            "ledger": 566,  # NGN
            "code": 20,     # Settlement code
            "flags": 0,
            "user_data_128": notification.settlement_id,
        }

        tb_resp = await self.client.post(
            f"{settings.tigerbeetle_http_url}/transfers",
            json={"transfers": [tb_transfer]},
        )
        if tb_resp.status_code >= 400:
            logger.error(f"TigerBeetle settlement post failed: {tb_resp.text}")
            return False

        # 3. Write to lakehouse
        self.writer.write_settlement_events([notification.model_dump()])

        logger.info(f"Settlement {notification.settlement_id} reconciled successfully")
        return True


# ── Kafka Consumer Loop ───────────────────────────────────────────────────────

class BillingKafkaConsumer:
    """Consumes billing.computed events and writes to the lakehouse."""

    def __init__(self, writer: LakehouseWriter):
        self.writer = writer
        self.consumer = Consumer({
            "bootstrap.servers": settings.kafka_brokers,
            "group.id": settings.kafka_group_id,
            "auto.offset.reset": "earliest",
            "enable.auto.commit": False,
        })
        self.consumer.subscribe([settings.kafka_topic_billing_computed])
        self.buffer: list[dict] = []
        self.buffer_size = 100
        self.flush_interval_secs = 30
        self.last_flush = time.time()

    def run(self) -> None:
        logger.info(f"Kafka consumer started on {settings.kafka_topic_billing_computed}")
        try:
            while True:
                msg = self.consumer.poll(timeout=1.0)
                if msg is None:
                    self._maybe_flush()
                    continue
                if msg.error():
                    if msg.error().code() == KafkaError._PARTITION_EOF:
                        continue
                    logger.error(f"Kafka error: {msg.error()}")
                    continue

                try:
                    event = json.loads(msg.value())
                    self.buffer.append(event)
                    if len(self.buffer) >= self.buffer_size:
                        self._flush()
                    self.consumer.commit(message=msg)
                except Exception as e:
                    logger.error(f"Failed to process billing event: {e}")
        finally:
            self._flush()
            self.consumer.close()

    def _maybe_flush(self) -> None:
        if time.time() - self.last_flush >= self.flush_interval_secs:
            self._flush()

    def _flush(self) -> None:
        if self.buffer:
            try:
                self.writer.write_billing_events(self.buffer)
                self.buffer.clear()
                self.last_flush = time.time()
            except Exception as e:
                logger.error(f"Lakehouse flush failed: {e}")


# ── FastAPI Application ───────────────────────────────────────────────────────

writer = LakehouseWriter()
mojaloop_bridge = MojaloopSettlementBridge(writer)


@asynccontextmanager
async def lifespan(app: FastAPI):
    # Start Kafka consumer in background thread
    import threading
    consumer = BillingKafkaConsumer(writer)
    t = threading.Thread(target=consumer.run, daemon=True)
    t.start()
    logger.info("Settlement bridge started")
    yield
    logger.info("Settlement bridge stopping")


app = FastAPI(
    title="PayGate Settlement Bridge & Lakehouse Pipeline",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return {"status": "ok", "service": "python-settlement-lakehouse"}


@app.post("/settlement/notify")
async def receive_settlement_notification(
    notification: SettlementNotification,
    background_tasks: BackgroundTasks,
):
    """Receive a settlement notification from Mojaloop webhook."""
    background_tasks.add_task(mojaloop_bridge.reconcile_settlement, notification)
    return {"status": "accepted", "settlement_id": notification.settlement_id}


@app.post("/overhead/costs")
async def record_overhead_cost(cost: OverheadCostEntry):
    """Record an overhead cost entry (infrastructure, labor, travel, etc.)."""
    cost_dict = cost.model_dump()
    cost_dict["id"] = str(uuid.uuid4())
    cost_dict["recorded_at"] = int(time.time() * 1000)
    writer.write_overhead_costs([cost_dict])
    return {"status": "recorded", "id": cost_dict["id"]}


@app.get("/metrics/summary")
async def get_billing_summary(
    tenant_id: str,
    period_start: int,
    period_end: int,
):
    """Get a billing metrics summary for a tenant and time period."""
    summary = writer.compute_billing_summary(tenant_id, period_start, period_end)
    if summary is None:
        raise HTTPException(status_code=404, detail="No billing data found")
    return summary


@app.get("/metrics/overhead-categories")
async def get_overhead_categories(tenant_id: str, period_start: int, period_end: int):
    """Get overhead costs broken down by category for the financial model."""
    try:
        dt = DeltaTable(
            writer._table_path("overhead_costs"),
            storage_options=writer.storage_options,
        )
        df = dt.to_pandas(
            filters=[
                ("tenant_id", "=", tenant_id),
                ("period_start", ">=", period_start),
                ("period_end", "<=", period_end),
            ]
        )
        if df.empty:
            return {"categories": [], "total_kobo": 0}

        by_category = (
            df.groupby("category")["amount_kobo"]
            .sum()
            .reset_index()
            .rename(columns={"amount_kobo": "total_kobo"})
        )
        return {
            "categories": by_category.to_dict(orient="records"),
            "total_kobo": int(df["amount_kobo"].sum()),
        }
    except Exception as e:
        logger.error(f"Failed to get overhead categories: {e}")
        raise HTTPException(status_code=500, detail=str(e))


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=settings.server_port)
