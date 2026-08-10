"""
analytics_aggregator.py — Real-time terminal analytics aggregation.

Maintains per-terminal and per-merchant counters in Redis:
  - Transaction count and volume (hourly, daily, monthly buckets)
  - Average ticket size
  - Success/failure rates
  - Top payment methods
  - Peak hour analysis

Writes aggregated snapshots to the portal DB via the bridge API.
"""

from __future__ import annotations

import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Any

import httpx
import redis.asyncio as aioredis

logger = logging.getLogger("terminal.analytics_aggregator")

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "http://localhost:8080")
INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")


class TerminalAnalyticsAggregator:
    """Aggregates terminal events into Redis counters and periodic DB snapshots."""

    def __init__(self):
        self._redis: aioredis.Redis | None = None
        self._http = httpx.AsyncClient(timeout=5.0)

    async def _get_redis(self) -> aioredis.Redis:
        if self._redis is None:
            self._redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        return self._redis

    async def process(self, event: Any) -> None:
        """Process a terminal event and update analytics counters."""
        event_type = event.event_type
        terminal_id = event.terminal_id
        merchant_id = event.merchant_id
        payload = event.payload

        if event_type == "txn_completed":
            await self._record_transaction(terminal_id, merchant_id, payload, success=True)
        elif event_type == "txn_failed":
            await self._record_transaction(terminal_id, merchant_id, payload, success=False)
        elif event_type == "refunded":
            await self._record_refund(terminal_id, merchant_id, payload)
        elif event_type == "heartbeat":
            await self._update_heartbeat(terminal_id, merchant_id)

    async def _record_transaction(
        self,
        terminal_id: str,
        merchant_id: str,
        payload: dict,
        success: bool,
    ) -> None:
        r = await self._get_redis()
        now = datetime.now(timezone.utc)
        hour_bucket = now.strftime("%Y%m%d%H")
        day_bucket = now.strftime("%Y%m%d")
        month_bucket = now.strftime("%Y%m")

        amount = payload.get("amount_kobo", 0)
        payment_method = payload.get("payment_method", "unknown")
        status_key = "success" if success else "failed"

        pipe = r.pipeline()

        for prefix in [
            f"terminal:analytics:{terminal_id}",
            f"merchant:analytics:{merchant_id}",
        ]:
            # Hourly bucket
            pipe.hincrby(f"{prefix}:hourly:{hour_bucket}", f"count_{status_key}", 1)
            if success and amount:
                pipe.hincrby(f"{prefix}:hourly:{hour_bucket}", "volume", amount)
            pipe.expire(f"{prefix}:hourly:{hour_bucket}", 48 * 3600)  # 48h TTL

            # Daily bucket
            pipe.hincrby(f"{prefix}:daily:{day_bucket}", f"count_{status_key}", 1)
            if success and amount:
                pipe.hincrby(f"{prefix}:daily:{day_bucket}", "volume", amount)
            pipe.expire(f"{prefix}:daily:{day_bucket}", 90 * 86400)  # 90d TTL

            # Monthly bucket
            pipe.hincrby(f"{prefix}:monthly:{month_bucket}", f"count_{status_key}", 1)
            if success and amount:
                pipe.hincrby(f"{prefix}:monthly:{month_bucket}", "volume", amount)
            pipe.expire(f"{prefix}:monthly:{month_bucket}", 365 * 86400)  # 1y TTL

            # Payment method breakdown
            pipe.hincrby(f"{prefix}:methods:{day_bucket}", payment_method, 1)
            pipe.expire(f"{prefix}:methods:{day_bucket}", 90 * 86400)

        await pipe.execute()

        # Persist snapshot to DB every 100 transactions (sampled)
        count_key = f"terminal:analytics:{terminal_id}:daily:{day_bucket}"
        count = await r.hget(count_key, "count_success")
        if count and int(count) % 100 == 0:
            await self._persist_snapshot(terminal_id, merchant_id, day_bucket)

    async def _record_refund(self, terminal_id: str, merchant_id: str, payload: dict) -> None:
        r = await self._get_redis()
        day_bucket = datetime.now(timezone.utc).strftime("%Y%m%d")
        amount = payload.get("amount_kobo", 0)

        pipe = r.pipeline()
        for prefix in [
            f"terminal:analytics:{terminal_id}",
            f"merchant:analytics:{merchant_id}",
        ]:
            pipe.hincrby(f"{prefix}:daily:{day_bucket}", "count_refunded", 1)
            pipe.hincrby(f"{prefix}:daily:{day_bucket}", "volume_refunded", amount)
        await pipe.execute()

    async def _update_heartbeat(self, terminal_id: str, merchant_id: str) -> None:
        r = await self._get_redis()
        now_ts = int(time.time())
        await r.set(f"terminal:last_seen:{terminal_id}", now_ts, ex=3600)

    async def _persist_snapshot(
        self, terminal_id: str, merchant_id: str, day_bucket: str
    ) -> None:
        """Write an analytics snapshot to the portal DB via bridge."""
        r = await self._get_redis()
        key = f"terminal:analytics:{terminal_id}:daily:{day_bucket}"
        data = await r.hgetall(key)
        if not data:
            return

        snapshot = {
            "terminal_id": terminal_id,
            "merchant_id": merchant_id,
            "date": day_bucket,
            "count_success": int(data.get("count_success", 0)),
            "count_failed": int(data.get("count_failed", 0)),
            "count_refunded": int(data.get("count_refunded", 0)),
            "volume_kobo": int(data.get("volume", 0)),
            "volume_refunded_kobo": int(data.get("volume_refunded", 0)),
        }

        try:
            resp = await self._http.post(
                f"{BRIDGE_URL}/terminal/analytics/snapshot",
                json=snapshot,
                headers={"X-Internal-Key": INTERNAL_KEY},
            )
            resp.raise_for_status()
        except Exception as e:
            logger.warning("Failed to persist analytics snapshot: %s", e)

    async def get_daily_stats(
        self, terminal_id: str, days: int = 30
    ) -> list[dict]:
        """Return daily stats for the last N days (from Redis)."""
        r = await self._get_redis()
        results = []
        now = datetime.now(timezone.utc)
        for i in range(days):
            from datetime import timedelta
            day = now - timedelta(days=i)
            bucket = day.strftime("%Y%m%d")
            key = f"terminal:analytics:{terminal_id}:daily:{bucket}"
            data = await r.hgetall(key)
            results.append({
                "date": day.strftime("%Y-%m-%d"),
                "count_success": int(data.get("count_success", 0)),
                "count_failed": int(data.get("count_failed", 0)),
                "count_refunded": int(data.get("count_refunded", 0)),
                "volume_kobo": int(data.get("volume", 0)),
            })
        return list(reversed(results))
