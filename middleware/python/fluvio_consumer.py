"""
fluvio_consumer.py — FastAPI Fluvio consumer worker for terminal events.

This service:
  1. Subscribes to paygate.terminal.events via the Fluvio HTTP proxy
  2. Dispatches events to the analytics aggregator, Lakehouse writer,
     and Temporal workflow stubs
  3. Exposes a /health endpoint for Kubernetes liveness probes
  4. Exposes a /metrics endpoint for Prometheus scraping

Run:
  uvicorn fluvio_consumer:app --host 0.0.0.0 --port 8091 --workers 2
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from contextlib import asynccontextmanager
from typing import Any

import httpx
from fastapi import FastAPI
from fastapi.responses import JSONResponse, PlainTextResponse
from pydantic import BaseModel, Field

from analytics_aggregator import TerminalAnalyticsAggregator
from lakehouse_writer import LakehouseWriter
from temporal_activities import TerminalTemporalStub

# ─── Logging ──────────────────────────────────────────────────────────────────

logging.basicConfig(
    level=os.getenv("LOG_LEVEL", "INFO"),
    format="%(asctime)s [%(levelname)s] %(name)s: %(message)s",
)
logger = logging.getLogger("terminal.fluvio_consumer")

# ─── Config ───────────────────────────────────────────────────────────────────

FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "http://localhost:9003")
FLUVIO_TOPIC = "paygate.terminal.events"
FLUVIO_PARTITION = 0
POLL_INTERVAL_MS = int(os.getenv("FLUVIO_POLL_INTERVAL_MS", "200"))
MAX_RECORDS_PER_POLL = int(os.getenv("FLUVIO_MAX_RECORDS", "100"))

# ─── Event models ─────────────────────────────────────────────────────────────

class TerminalEvent(BaseModel):
    event_id: str
    event_type: str
    terminal_id: str
    serial_number: str
    merchant_id: str
    tenant_id: str
    timestamp: str
    payload: dict[str, Any] = Field(default_factory=dict)


# ─── Consumer ─────────────────────────────────────────────────────────────────

class FluvioTerminalConsumer:
    """Polls Fluvio HTTP proxy for terminal events and dispatches to sinks."""

    def __init__(self):
        self.client = httpx.AsyncClient(timeout=10.0)
        self.aggregator = TerminalAnalyticsAggregator()
        self.lakehouse = LakehouseWriter()
        self.temporal = TerminalTemporalStub()
        self._running = False
        self._offset = "earliest"
        self._processed = 0
        self._errors = 0

    async def start(self):
        self._running = True
        logger.info("Fluvio consumer started topic=%s", FLUVIO_TOPIC)
        while self._running:
            try:
                events = await self._fetch_events()
                for event in events:
                    await self._dispatch(event)
                    self._processed += 1
                if not events:
                    await asyncio.sleep(POLL_INTERVAL_MS / 1000)
            except Exception as exc:
                self._errors += 1
                logger.error("Consumer loop error: %s", exc, exc_info=True)
                await asyncio.sleep(2)

    async def stop(self):
        self._running = False
        await self.client.aclose()
        logger.info("Fluvio consumer stopped. processed=%d errors=%d",
                    self._processed, self._errors)

    async def _fetch_events(self) -> list[TerminalEvent]:
        url = (
            f"{FLUVIO_ENDPOINT}/consume/{FLUVIO_TOPIC}"
            f"?partition={FLUVIO_PARTITION}"
            f"&offset={self._offset}"
            f"&max_records={MAX_RECORDS_PER_POLL}"
        )
        resp = await self.client.get(url)
        if resp.status_code == 204:
            return []
        resp.raise_for_status()
        raw = resp.json()
        events = []
        for item in raw:
            try:
                events.append(TerminalEvent(**item))
            except Exception as e:
                logger.warning("Skipping malformed event: %s", e)
        return events

    async def _dispatch(self, event: TerminalEvent):
        """Fan-out event to all downstream sinks concurrently."""
        tasks = [
            self.aggregator.process(event),
            self.lakehouse.write(event),
        ]
        # Trigger Temporal workflows only for actionable events
        if event.event_type in ("txn_completed", "txn_failed", "refunded"):
            tasks.append(self.temporal.trigger(event))

        results = await asyncio.gather(*tasks, return_exceptions=True)
        for i, result in enumerate(results):
            if isinstance(result, Exception):
                logger.error("Sink[%d] error for event %s: %s", i, event.event_id, result)


# ─── Singleton consumer ───────────────────────────────────────────────────────

_consumer: FluvioTerminalConsumer | None = None


@asynccontextmanager
async def lifespan(app: FastAPI):
    global _consumer
    _consumer = FluvioTerminalConsumer()
    task = asyncio.create_task(_consumer.start())
    yield
    if _consumer:
        await _consumer.stop()
    task.cancel()


# ─── FastAPI app ──────────────────────────────────────────────────────────────

app = FastAPI(
    title="PayGate Terminal Fluvio Consumer",
    version="1.0.0",
    lifespan=lifespan,
)


@app.get("/health")
async def health():
    return JSONResponse({"ok": True, "service": "terminal-fluvio-consumer"})


@app.get("/metrics", response_class=PlainTextResponse)
async def metrics():
    """Prometheus-compatible metrics endpoint."""
    if not _consumer:
        return "# consumer not started\n"
    lines = [
        "# HELP terminal_events_processed_total Total terminal events processed",
        "# TYPE terminal_events_processed_total counter",
        f"terminal_events_processed_total {_consumer._processed}",
        "# HELP terminal_events_errors_total Total processing errors",
        "# TYPE terminal_events_errors_total counter",
        f"terminal_events_errors_total {_consumer._errors}",
        f"terminal_consumer_running {1 if _consumer._running else 0}",
    ]
    return "\n".join(lines) + "\n"


@app.get("/status")
async def status():
    if not _consumer:
        return JSONResponse({"running": False})
    return JSONResponse({
        "running": _consumer._running,
        "processed": _consumer._processed,
        "errors": _consumer._errors,
        "topic": FLUVIO_TOPIC,
    })
