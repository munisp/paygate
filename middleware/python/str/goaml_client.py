"""
middleware/python/str/goaml_client.py
NFIU goAML REST client for STR submission, status polling, and acknowledgement.
Wires: NFIU goAML API → Fluvio → Kafka → Redis → Temporal retry workflow.
"""

import asyncio
import hashlib
import hmac
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
import redis.asyncio as aioredis
from fluvio import Fluvio, FluvioConfig

logger = logging.getLogger("paygate.goaml")

# ─── Config ───────────────────────────────────────────────────────────────────

GOAML_URL = os.getenv("NFIU_GOAML_URL", "https://goaml.nfiu.gov.ng/api/v1")
GOAML_API_KEY = os.getenv("NFIU_GOAML_API_KEY", "")
GOAML_INSTITUTION_CODE = os.getenv("NIBSS_INSTITUTION_CODE", "")
REDIS_URL = os.getenv("REDIS_URL", "redis://localhost:6379")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "")
MIDDLEWARE_INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")

# ─── goAML Client ─────────────────────────────────────────────────────────────

class GoAMLClient:
    """
    Async NFIU goAML REST client.
    Handles STR submission, status polling, and acknowledgement tracking.
    """

    def __init__(self):
        self.http = httpx.AsyncClient(
            base_url=GOAML_URL,
            headers={
                "Content-Type": "application/json",
                "X-API-Key": GOAML_API_KEY,
                "X-Institution-Code": GOAML_INSTITUTION_CODE,
            },
            timeout=30.0,
        )
        self.redis: Optional[aioredis.Redis] = None
        self.fluvio: Optional[Fluvio] = None

    async def connect(self):
        """Initialise Redis and Fluvio connections."""
        self.redis = await aioredis.from_url(REDIS_URL, decode_responses=True)
        try:
            config = FluvioConfig()
            config.endpoint = FLUVIO_ENDPOINT
            self.fluvio = await Fluvio.connect(config)
        except Exception as e:
            logger.warning(f"Fluvio connection failed (non-fatal): {e}")

    async def close(self):
        await self.http.aclose()
        if self.redis:
            await self.redis.aclose()

    # ── Submit STR ────────────────────────────────────────────────────────────

    async def submit_str(
        self,
        str_id: str,
        merchant_id: str,
        report_ref: str,
        payload: dict,
    ) -> dict:
        """
        Submit an STR to NFIU goAML.
        Returns: {"nfiuRef": str, "status": str, "message": str, "receivedAt": str}
        """
        # Idempotency check
        cache_key = f"str:submitted:{str_id}"
        if self.redis:
            cached = await self.redis.get(cache_key)
            if cached:
                logger.info(f"STR {str_id} already submitted (cached)")
                return json.loads(cached)

        # Sandbox mode
        if not GOAML_API_KEY:
            result = {
                "nfiuRef": f"NFIU-{report_ref}-{int(datetime.now().timestamp())}",
                "status": "received",
                "message": "STR received by NFIU goAML (sandbox mode)",
                "receivedAt": datetime.now(timezone.utc).isoformat(),
            }
            await self._cache_and_publish(str_id, merchant_id, report_ref, result)
            return result

        try:
            response = await self.http.post(
                "/reports/str",
                json={
                    "reportRef": report_ref,
                    "merchantId": merchant_id,
                    "institutionCode": GOAML_INSTITUTION_CODE,
                    **payload,
                },
            )
            response.raise_for_status()
            result = response.json()
            await self._cache_and_publish(str_id, merchant_id, report_ref, result)
            return result
        except httpx.HTTPStatusError as e:
            logger.error(f"goAML submission failed for {str_id}: {e.response.status_code} {e.response.text}")
            raise
        except httpx.RequestError as e:
            logger.error(f"goAML network error for {str_id}: {e}")
            raise

    # ── Poll Status ───────────────────────────────────────────────────────────

    async def poll_status(self, nfiu_ref: str) -> str:
        """
        Poll NFIU goAML for STR acknowledgement status.
        Returns: "pending" | "acknowledged" | "rejected"
        """
        cache_key = f"str:ack:{nfiu_ref}"
        if self.redis:
            cached = await self.redis.get(cache_key)
            if cached:
                return cached

        if not GOAML_API_KEY:
            return "pending"

        try:
            response = await self.http.get(f"/reports/str/{nfiu_ref}/status")
            response.raise_for_status()
            data = response.json()
            status = data.get("status", "pending")

            if status == "acknowledged" and self.redis:
                await self.redis.set(cache_key, status, ex=7 * 24 * 3600)

            return status
        except Exception as e:
            logger.warning(f"goAML status poll failed for {nfiu_ref}: {e}")
            return "pending"

    # ── Batch Poll ────────────────────────────────────────────────────────────

    async def batch_poll(self, nfiu_refs: list[str]) -> dict[str, str]:
        """Poll multiple NFIU refs concurrently."""
        tasks = [self.poll_status(ref) for ref in nfiu_refs]
        results = await asyncio.gather(*tasks, return_exceptions=True)
        return {
            ref: (str(result) if isinstance(result, Exception) else result)
            for ref, result in zip(nfiu_refs, results)
        }

    # ── Private helpers ───────────────────────────────────────────────────────

    async def _cache_and_publish(
        self,
        str_id: str,
        merchant_id: str,
        report_ref: str,
        result: dict,
    ):
        """Cache result in Redis and publish to Fluvio + Kafka bridge."""
        # Redis cache (24h TTL)
        if self.redis:
            await self.redis.set(
                f"str:submitted:{str_id}",
                json.dumps(result),
                ex=24 * 3600,
            )

        # Fluvio publish
        event = {
            "eventType": "str_submitted",
            "strId": str_id,
            "merchantId": merchant_id,
            "reportRef": report_ref,
            "nfiuRef": result.get("nfiuRef"),
            "status": result.get("status"),
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
        await self._publish_fluvio("paygate.str.events", event)

        # Kafka bridge
        await self._publish_kafka_bridge("paygate.str.submitted", event)

    async def _publish_fluvio(self, topic: str, payload: dict):
        if not self.fluvio:
            return
        try:
            producer = await self.fluvio.topic_producer(topic)
            await producer.send_string(json.dumps(payload))
            await producer.flush()
        except Exception as e:
            logger.warning(f"Fluvio publish failed: {e}")

    async def _publish_kafka_bridge(self, topic: str, payload: dict):
        if not MIDDLEWARE_BRIDGE_URL:
            return
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{MIDDLEWARE_BRIDGE_URL}/kafka/publish",
                    json={"topic": topic, "payload": payload},
                    headers={"X-Internal-Key": MIDDLEWARE_INTERNAL_KEY},
                )
        except Exception as e:
            logger.warning(f"Kafka bridge publish failed: {e}")


# ─── Singleton ────────────────────────────────────────────────────────────────

_client: Optional[GoAMLClient] = None


async def get_client() -> GoAMLClient:
    global _client
    if _client is None:
        _client = GoAMLClient()
        await _client.connect()
    return _client
