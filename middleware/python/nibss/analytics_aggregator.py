"""
NIP Analytics Aggregator — computes daily/weekly NIP payment metrics
and writes them to the Lakehouse.
"""
import asyncio
import logging
import os
from datetime import datetime, timezone, timedelta
from typing import Any

logger = logging.getLogger(__name__)

MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "http://localhost:8080")
INTERNAL_API_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")


async def aggregate_daily_nip_metrics(date: datetime | None = None) -> dict[str, Any]:
    """Aggregate NIP transfer metrics for a given date."""
    import aiohttp
    target_date = date or (datetime.now(timezone.utc) - timedelta(days=1))
    date_str = target_date.strftime("%Y-%m-%d")

    async with aiohttp.ClientSession() as session:
        resp = await session.get(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/nip/metrics/daily",
            params={"date": date_str},
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )
        metrics = await resp.json()

    # Write to Lakehouse
    async with aiohttp.ClientSession() as session:
        await session.post(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/lakehouse/metrics",
            json={
                "metric_type": "nip_daily",
                "date": date_str,
                "data": metrics,
                "computed_at": datetime.now(timezone.utc).isoformat(),
            },
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )

    logger.info(f"[nip-analytics] Aggregated metrics for {date_str}: {metrics}")
    return metrics


async def run_aggregator() -> None:
    """Run the aggregator on a schedule (every hour)."""
    while True:
        try:
            await aggregate_daily_nip_metrics()
        except Exception as e:
            logger.error(f"[nip-analytics] aggregation error: {e}")
        await asyncio.sleep(3600)


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_aggregator())
