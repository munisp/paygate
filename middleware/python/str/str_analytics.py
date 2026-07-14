"""
middleware/python/str/str_analytics.py
STR analytics aggregator — consumes paygate.str.events from Fluvio,
aggregates by type/status/overdue, writes to Lakehouse, exposes FastAPI endpoints.
"""

import asyncio
import json
import logging
import os
from collections import defaultdict
from datetime import datetime, timezone, timedelta
from typing import Optional

import httpx
from fastapi import FastAPI, HTTPException
from fluvio import Fluvio, FluvioConfig, Offset

logger = logging.getLogger("paygate.str.analytics")

FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "")
MIDDLEWARE_INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")

app = FastAPI(title="PayGate STR Analytics", version="1.0.0")

# ─── In-memory aggregation store ─────────────────────────────────────────────

class STRAggregator:
    def __init__(self):
        self.by_status: dict[str, int] = defaultdict(int)
        self.by_type: dict[str, int] = defaultdict(int)
        self.by_merchant: dict[str, dict] = defaultdict(lambda: defaultdict(int))
        self.overdue: list[dict] = []
        self.recent_events: list[dict] = []
        self._max_recent = 500

    def ingest(self, event: dict):
        status = event.get("status", "unknown")
        suspicion_type = event.get("suspicionType", "unknown")
        merchant_id = event.get("merchantId", "unknown")
        event_type = event.get("eventType", "unknown")

        self.by_status[status] += 1
        self.by_type[suspicion_type] += 1
        self.by_merchant[merchant_id][event_type] += 1

        # Track overdue STRs (due_at < now and not submitted)
        due_at_str = event.get("dueAt")
        if due_at_str and status not in ("submitted", "acknowledged"):
            try:
                due_at = datetime.fromisoformat(due_at_str)
                if due_at < datetime.now(timezone.utc):
                    self.overdue.append({
                        "strId": event.get("strId"),
                        "merchantId": merchant_id,
                        "dueAt": due_at_str,
                        "status": status,
                        "hoursOverdue": int((datetime.now(timezone.utc) - due_at).total_seconds() / 3600),
                    })
            except ValueError:
                pass

        # Keep recent events ring buffer
        self.recent_events.append(event)
        if len(self.recent_events) > self._max_recent:
            self.recent_events.pop(0)

    def summary(self) -> dict:
        return {
            "byStatus": dict(self.by_status),
            "byType": dict(self.by_type),
            "overdueCount": len(self.overdue),
            "overdueItems": self.overdue[-20:],  # last 20 overdue
            "recentEventCount": len(self.recent_events),
        }

    def merchant_summary(self, merchant_id: str) -> dict:
        return dict(self.by_merchant.get(merchant_id, {}))


aggregator = STRAggregator()


# ─── Fluvio consumer ─────────────────────────────────────────────────────────

async def consume_str_events():
    """Consume paygate.str.events from Fluvio and feed the aggregator."""
    try:
        config = FluvioConfig()
        config.endpoint = FLUVIO_ENDPOINT
        fluvio = await Fluvio.connect(config)
        consumer = await fluvio.partition_consumer("paygate.str.events", 0)
        stream = await consumer.stream(Offset.end())

        logger.info("STR analytics consumer started")
        async for record in stream:
            try:
                event = json.loads(record.value_string())
                aggregator.ingest(event)
                await write_lakehouse(event)
            except Exception as e:
                logger.warning(f"Failed to process STR event: {e}")
    except Exception as e:
        logger.error(f"Fluvio consumer error: {e}")
        await asyncio.sleep(5)
        asyncio.create_task(consume_str_events())  # reconnect


async def write_lakehouse(event: dict):
    """Write STR event to Lakehouse for long-term analytics."""
    if not MIDDLEWARE_BRIDGE_URL:
        return
    try:
        async with httpx.AsyncClient(timeout=3.0) as client:
            await client.post(
                f"{MIDDLEWARE_BRIDGE_URL}/lakehouse/write",
                json={"table": "str_events_log", **event},
                headers={"X-Internal-Key": MIDDLEWARE_INTERNAL_KEY},
            )
    except Exception as e:
        logger.debug(f"Lakehouse write failed (non-fatal): {e}")


# ─── FastAPI endpoints ────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    asyncio.create_task(consume_str_events())


@app.get("/health")
async def health():
    return {"status": "ok", "service": "str-analytics"}


@app.get("/analytics/str/summary")
async def get_summary():
    return aggregator.summary()


@app.get("/analytics/str/merchant/{merchant_id}")
async def get_merchant_summary(merchant_id: str):
    return aggregator.merchant_summary(merchant_id)


@app.get("/analytics/str/overdue")
async def get_overdue():
    return {"overdue": aggregator.overdue, "count": len(aggregator.overdue)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8004")))
