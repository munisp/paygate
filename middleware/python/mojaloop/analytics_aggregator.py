"""
Mojaloop Analytics Aggregator
==============================
Aggregates Mojaloop transfer metrics into Redis for real-time dashboards
and writes daily summaries to the Lakehouse (Parquet via S3).
"""
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import redis.asyncio as aioredis

from models import (
    PartyFoundEvent, QuoteAcceptedEvent,
    TransferCompletedEvent, TransferFailedEvent,
)

logger = logging.getLogger(__name__)

REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")


class MojaloopAnalyticsAggregator:
    """Aggregates Mojaloop metrics in Redis with daily rollup keys."""

    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None

    async def _get_redis(self) -> aioredis.Redis:
        if self.redis is None:
            self.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        return self.redis

    def _day_key(self, merchant_id: str, date: Optional[datetime] = None) -> str:
        d = (date or datetime.now(timezone.utc)).strftime("%Y-%m-%d")
        return f"mojaloop:analytics:{merchant_id}:{d}"

    async def record_transfer_completed(self, event: TransferCompletedEvent):
        r = await self._get_redis()
        key = self._day_key(event.merchant_id, event.timestamp)
        pipe = r.pipeline()
        pipe.hincrby(key, "transfers_completed", 1)
        try:
            amount_kobo = int(float(event.amount) * 100)
            pipe.hincrby(key, "volume_minor_units", amount_kobo)
        except ValueError:
            pass
        pipe.expire(key, 86400 * 90)  # 90-day TTL
        await pipe.execute()
        logger.info("Analytics: transfer completed merchant=%s amount=%s %s",
                    event.merchant_id, event.amount, event.currency)

    async def record_transfer_failed(self, event: TransferFailedEvent):
        r = await self._get_redis()
        key = self._day_key(event.merchant_id, event.timestamp)
        pipe = r.pipeline()
        pipe.hincrby(key, "transfers_failed", 1)
        pipe.hincrby(key, f"error_{event.error_code}", 1)
        pipe.expire(key, 86400 * 90)
        await pipe.execute()

    async def record_party_lookup(self, event: PartyFoundEvent):
        r = await self._get_redis()
        key = self._day_key(event.merchant_id, event.timestamp)
        await r.hincrby(key, "party_lookups", 1)
        await r.expire(key, 86400 * 90)

    async def record_quote_accepted(self, event: QuoteAcceptedEvent):
        r = await self._get_redis()
        key = self._day_key(event.merchant_id, event.timestamp)
        await r.hincrby(key, "quotes_accepted", 1)
        await r.expire(key, 86400 * 90)

    async def get_daily_stats(self, merchant_id: str, date: datetime) -> dict:
        r = await self._get_redis()
        key = self._day_key(merchant_id, date)
        data = await r.hgetall(key)
        return {
            "date": date.strftime("%Y-%m-%d"),
            "merchant_id": merchant_id,
            "transfers_completed": int(data.get("transfers_completed", 0)),
            "transfers_failed": int(data.get("transfers_failed", 0)),
            "volume_minor_units": int(data.get("volume_minor_units", 0)),
            "party_lookups": int(data.get("party_lookups", 0)),
            "quotes_accepted": int(data.get("quotes_accepted", 0)),
        }
