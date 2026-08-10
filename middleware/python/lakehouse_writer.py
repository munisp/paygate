"""
lakehouse_writer.py — Writes terminal events to the Lakehouse (Iceberg/Delta Lake).

Batches events in memory and flushes to the Lakehouse REST API every N events
or every T seconds, whichever comes first. This provides a durable audit trail
for compliance, analytics, and ML feature engineering.

Lakehouse schema: terminal_events
  - event_id STRING NOT NULL
  - event_type STRING NOT NULL
  - terminal_id STRING NOT NULL
  - serial_number STRING NOT NULL
  - merchant_id STRING NOT NULL
  - tenant_id STRING NOT NULL
  - event_timestamp TIMESTAMP NOT NULL
  - payload_json STRING
  - ingested_at TIMESTAMP NOT NULL
  - partition: date(event_timestamp)
"""

from __future__ import annotations

import asyncio
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx

logger = logging.getLogger("terminal.lakehouse_writer")

LAKEHOUSE_URL = os.getenv("LAKEHOUSE_URL", "http://localhost:8090")
LAKEHOUSE_TABLE = "terminal_events"
BATCH_SIZE = int(os.getenv("LAKEHOUSE_BATCH_SIZE", "50"))
FLUSH_INTERVAL_S = float(os.getenv("LAKEHOUSE_FLUSH_INTERVAL_S", "10"))
INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")


class LakehouseWriter:
    """Buffers terminal events and writes them to the Lakehouse in batches."""

    def __init__(self):
        self._buffer: list[dict] = []
        self._last_flush = time.monotonic()
        self._http = httpx.AsyncClient(timeout=30.0)
        self._lock = asyncio.Lock()
        self._written = 0
        self._errors = 0

    async def write(self, event: Any) -> None:
        """Add an event to the write buffer. Flushes if batch is full or time elapsed."""
        record = self._to_record(event)
        async with self._lock:
            self._buffer.append(record)
            should_flush = (
                len(self._buffer) >= BATCH_SIZE
                or (time.monotonic() - self._last_flush) >= FLUSH_INTERVAL_S
            )
        if should_flush:
            await self.flush()

    def _to_record(self, event: Any) -> dict:
        return {
            "event_id": event.event_id,
            "event_type": event.event_type,
            "terminal_id": event.terminal_id,
            "serial_number": event.serial_number,
            "merchant_id": event.merchant_id,
            "tenant_id": event.tenant_id,
            "event_timestamp": event.timestamp,
            "payload_json": json.dumps(event.payload) if isinstance(event.payload, dict) else str(event.payload),
            "ingested_at": datetime.now(timezone.utc).isoformat(),
        }

    async def flush(self) -> None:
        """Flush the buffer to the Lakehouse."""
        async with self._lock:
            if not self._buffer:
                return
            batch = self._buffer.copy()
            self._buffer.clear()
            self._last_flush = time.monotonic()

        try:
            resp = await self._http.post(
                f"{LAKEHOUSE_URL}/write",
                json={"table": LAKEHOUSE_TABLE, "records": batch},
                headers={"X-Internal-Key": INTERNAL_KEY, "Content-Type": "application/json"},
            )
            resp.raise_for_status()
            self._written += len(batch)
            logger.debug("Lakehouse: wrote %d records (total=%d)", len(batch), self._written)
        except Exception as e:
            self._errors += 1
            logger.error("Lakehouse write failed: %s (batch_size=%d)", e, len(batch))
            # Re-queue failed records (up to 2× batch size to avoid unbounded growth)
            async with self._lock:
                if len(self._buffer) < BATCH_SIZE * 2:
                    self._buffer = batch + self._buffer

    @property
    def stats(self) -> dict:
        return {"written": self._written, "errors": self._errors, "buffered": len(self._buffer)}
