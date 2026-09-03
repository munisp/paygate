"""
PayGate FX Rate Feed Service
Streams live FX rates from external providers into Fluvio and Redis.
Supports DCC (Dynamic Currency Conversion) rate locking.
"""
import asyncio
import hmac
import json
import logging
import os
import time
from datetime import datetime, timezone
from typing import Dict, Optional

import aiohttp
import redis.asyncio as aioredis
from aiohttp import web

logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s: %(message)s")
logger = logging.getLogger("fx-rate-feed")

import sys, os as _os_telemetry
sys.path.insert(0, _os_telemetry.path.join(_os_telemetry.path.dirname(__file__), '..'))
from shared.telemetry import setup_telemetry
setup_telemetry("fx-rate-feed")


import secrets as _secrets_mod
import sys as _sys_mod


def _require_secret_env(var_name):
    """Fail closed: no hardcoded default secrets (cips-gateway main.go:48-56 pattern).

    Production (ENV/APP_ENV=production) with the variable unset -> FATAL log + exit.
    Dev -> per-boot random value (secrets.token_hex) logged once; never a
    well-known default.
    """
    value = os.getenv(var_name, "")
    if value:
        return value
    env = (os.getenv("ENV") or os.getenv("APP_ENV") or "").strip().lower()
    if env in ("production", "prod"):
        logger.critical("FATAL: %s must be set when ENV=production -- refusing to serve", var_name)
        _sys_mod.exit(1)
    value = "dev-" + _secrets_mod.token_hex(16)
    logger.warning("%s unset -- generated per-boot dev value; set %s to a real secret", var_name, var_name)
    return value

# ─── Configuration ─────────────────────────────────────────────────────────────
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379/0")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
SYNC_RELAY_URL = os.getenv("SYNC_RELAY_URL", "http://localhost:8090")
SYNC_RELAY_KEY = _require_secret_env("SYNC_RELAY_KEY")
FX_PROVIDER_URL = os.getenv("FX_PROVIDER_URL", "https://api.exchangerate-api.com/v4/latest")
FX_API_KEY = os.getenv("FX_API_KEY", "")
POLL_INTERVAL_SECONDS = int(os.getenv("FX_POLL_INTERVAL", "30"))

# Currency pairs to track
TRACKED_PAIRS = [
    ("USD", "NGN"),
    ("EUR", "NGN"),
    ("GBP", "NGN"),
    ("USD", "GHS"),
    ("USD", "KES"),
    ("USD", "ZAR"),
    ("USD", "EGP"),
    ("EUR", "GHS"),
    ("GBP", "KES"),
    ("USD", "XOF"),  # West African CFA
    ("USD", "XAF"),  # Central African CFA
]

# No fallback rates: publishing hardcoded rates as if live is fabrication.
# On provider failure the publish cycle is skipped; previously published rates
# expire via their Redis TTL (120s) and consumers must fail closed.


class FXRateFeed:
    def __init__(self):
        self.redis: Optional[aioredis.Redis] = None
        self.session: Optional[aiohttp.ClientSession] = None
        self._rates: Dict[str, float] = {}

    async def start(self):
        self.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        self.session = aiohttp.ClientSession()
        logger.info("FX Rate Feed service started")
        logger.info(f"Tracking {len(TRACKED_PAIRS)} currency pairs")
        logger.info(f"Poll interval: {POLL_INTERVAL_SECONDS}s")

        # Initial fetch
        await self.fetch_and_publish_rates()

        # Start polling loop
        while True:
            await asyncio.sleep(POLL_INTERVAL_SECONDS)
            await self.fetch_and_publish_rates()

    async def fetch_and_publish_rates(self):
        """Fetch rates from provider and publish to Redis + Fluvio."""
        try:
            rates = await self._fetch_rates_from_provider()
        except Exception as e:
            # Fail closed: never publish fabricated rates.
            logger.error(f"Provider fetch failed -- skipping publish cycle (no fallback rates served): {e}")
            return

        now = datetime.now(timezone.utc).isoformat()
        published = 0

        for from_ccy, to_ccy in TRACKED_PAIRS:
            pair = f"{from_ccy}/{to_ccy}"
            rate = rates.get(pair)
            if rate is None:
                logger.warning(f"Provider returned no rate for {pair} -- skipping (no fabricated fallback)")
                continue

            if rate <= 0:
                continue

            rate_data = {
                "pair": pair,
                "from_currency": from_ccy,
                "to_currency": to_ccy,
                "mid_rate": rate,
                "updated_at": now,
                "source": "fx-rate-feed",
            }

            # Publish to Redis (TTL 120s — rate is stale after 2 minutes)
            redis_key = f"dcc:rate:{pair}"
            await self.redis.setex(redis_key, 120, json.dumps(rate_data))

            # Publish to Fluvio via sync relay
            await self._publish_to_fluvio(pair, rate_data)

            self._rates[pair] = rate
            published += 1

        logger.info(f"Published {published} FX rates at {now}")

    async def _fetch_rates_from_provider(self) -> Dict[str, float]:
        """Fetch rates from external FX provider."""
        rates: Dict[str, float] = {}

        # Fetch USD base rates
        url = f"{FX_PROVIDER_URL}/USD"
        if FX_API_KEY:
            url += f"?apikey={FX_API_KEY}"

        async with self.session.get(url, timeout=aiohttp.ClientTimeout(total=10)) as resp:
            if resp.status != 200:
                raise ValueError(f"Provider returned {resp.status}")
            data = await resp.json()

        usd_rates = data.get("rates", {})

        # Build all pairs from USD base
        for from_ccy, to_ccy in TRACKED_PAIRS:
            pair = f"{from_ccy}/{to_ccy}"
            if from_ccy == "USD":
                rate = usd_rates.get(to_ccy)
                if rate:
                    rates[pair] = float(rate)
            elif to_ccy == "NGN":
                # Cross rate: from_ccy/NGN = (NGN/USD) / (from_ccy/USD)
                ngn_rate = usd_rates.get("NGN")
                from_usd_rate = usd_rates.get(from_ccy)
                if ngn_rate and from_usd_rate and from_usd_rate > 0:
                    rates[pair] = float(ngn_rate) / float(from_usd_rate)

        return rates

    async def _publish_to_fluvio(self, pair: str, rate_data: dict):
        """Publish rate to Fluvio via sync relay."""
        try:
            async with self.session.post(
                f"{SYNC_RELAY_URL}/produce",
                json={
                    "topic": "fx-rates",
                    "key": pair,
                    "value": rate_data,
                },
                headers={"X-Relay-Key": SYNC_RELAY_KEY},
                timeout=aiohttp.ClientTimeout(total=5),
            ) as resp:
                if resp.status != 200:
                    logger.warning(f"Fluvio publish failed for {pair}: {resp.status}")
        except Exception as e:
            logger.debug(f"Fluvio publish error for {pair}: {e}")

    async def stop(self):
        if self.session:
            await self.session.close()
        if self.redis:
            await self.redis.close()


# ─── Mandatory internal service-to-service auth (fail closed) ────────────────
# Matches the pattern used by sibling python-services (see e.g. ai-insights):
# INTERNAL_API_KEY must be configured; every request other than /health and
# /metrics must present it via the X-Internal-Key header. Constant-time
# comparison to resist timing attacks. When the key is NOT configured the
# service answers 503 on all non-exempt routes (never silently open).

_INTERNAL_API_KEY = os.getenv("INTERNAL_API_KEY", "")
_AUTH_EXEMPT_PATHS = frozenset({"/health", "/healthz", "/metrics"})


@web.middleware
async def _require_internal_api_key(request: web.Request, handler):
    if request.path in _AUTH_EXEMPT_PATHS:
        return await handler(request)
    if not _INTERNAL_API_KEY:
        return web.json_response(
            {"detail": "Service misconfigured: INTERNAL_API_KEY not set"},
            status=503,
        )
    if not hmac.compare_digest(
        request.headers.get("X-Internal-Key", ""), _INTERNAL_API_KEY
    ):
        return web.json_response({"detail": "Unauthorized"}, status=401)
    return await handler(request)


# ─── Health endpoint ───────────────────────────────────────────────────────────

async def health_handler(request):
    """Simple health check endpoint."""
    return web.json_response({
        "status": "ok",
        "service": "fx-rate-feed",
        "tracked_pairs": len(TRACKED_PAIRS),
        "rates_count": len(feed._rates),
        "timestamp": datetime.now(timezone.utc).isoformat(),
    })


feed = FXRateFeed()


async def main():
    app = web.Application(middlewares=[_require_internal_api_key])
    app.router.add_get("/health", health_handler)

    runner = web.AppRunner(app)
    await runner.setup()
    site = web.TCPSite(runner, "0.0.0.0", int(os.getenv("PORT", "8095")))
    await site.start()

    logger.info(f"Health endpoint listening on port {os.getenv('PORT', '8095')}")
    await feed.start()


if __name__ == "__main__":
    asyncio.run(main())
