"""
middleware/python/momo/webhook_processor.py
Mobile Money webhook processor — consumes paygate.momo.*.events from Fluvio,
updates transaction status via TypeScript backend bridge, writes to Lakehouse.
Supports: MTN MoMo, Airtel Money, M-Pesa, OPay, PalmPay, Wave, Orange.
"""

import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Optional

import httpx
from fastapi import FastAPI, Request, HTTPException
from fluvio import Fluvio, FluvioConfig, Offset

logger = logging.getLogger("paygate.momo.processor")

FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "localhost:9003")
MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "")
MIDDLEWARE_INTERNAL_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")

MOMO_PROVIDERS = ["mtn", "airtel", "mpesa", "opay", "palmpay", "wave", "orange"]

app = FastAPI(title="PayGate MoMo Webhook Processor", version="1.0.0")

# ─── Processor ────────────────────────────────────────────────────────────────

class MoMoWebhookProcessor:
    """
    Processes MoMo webhook events from Fluvio topics.
    Updates the TypeScript backend's momo_transactions table via the bridge.
    """

    def __init__(self):
        self.processed: dict[str, str] = {}  # externalRef → status (in-memory dedup)
        self.stats: dict[str, dict] = {p: {"completed": 0, "failed": 0, "pending": 0} for p in MOMO_PROVIDERS}

    async def process(self, event: dict):
        provider = event.get("provider", "unknown")
        external_ref = event.get("externalRef") or event.get("external_ref")
        status = event.get("status", "PENDING")
        amount = event.get("amount", 0)
        currency = event.get("currency", "NGN")
        financial_txn_id = event.get("financialTxnId") or event.get("financial_txn_id")
        internal_ref = event.get("internalRef") or event.get("internal_ref")

        if not external_ref:
            logger.warning(f"MoMo event missing externalRef: {event}")
            return

        # Dedup check
        if self.processed.get(external_ref) == status:
            logger.debug(f"Duplicate MoMo event for {external_ref}, skipping")
            return
        self.processed[external_ref] = status

        # Update stats
        if provider in self.stats:
            status_key = status.lower()
            if status_key in ("successful", "completed"):
                self.stats[provider]["completed"] += 1
            elif status_key == "failed":
                self.stats[provider]["failed"] += 1
            else:
                self.stats[provider]["pending"] += 1

        # Notify TypeScript backend to update momo_transactions
        await self._notify_backend(
            external_ref=external_ref,
            internal_ref=internal_ref,
            provider=provider,
            status=status,
            financial_txn_id=financial_txn_id,
            amount=amount,
            currency=currency,
        )

        # Write to Lakehouse
        await self._write_lakehouse(event)

        logger.info(f"Processed MoMo event: provider={provider} ref={external_ref} status={status}")

    async def _notify_backend(self, **kwargs):
        if not MIDDLEWARE_BRIDGE_URL:
            return
        try:
            async with httpx.AsyncClient(timeout=5.0) as client:
                await client.post(
                    f"{MIDDLEWARE_BRIDGE_URL}/internal/momo/webhook-complete",
                    json={**kwargs, "processedAt": datetime.now(timezone.utc).isoformat()},
                    headers={"X-Internal-Key": MIDDLEWARE_INTERNAL_KEY},
                )
        except Exception as e:
            logger.warning(f"Backend notification failed: {e}")

    async def _write_lakehouse(self, event: dict):
        if not MIDDLEWARE_BRIDGE_URL:
            return
        try:
            async with httpx.AsyncClient(timeout=3.0) as client:
                await client.post(
                    f"{MIDDLEWARE_BRIDGE_URL}/lakehouse/write",
                    json={"table": "momo_webhook_events", **event,
                          "processedAt": datetime.now(timezone.utc).isoformat()},
                    headers={"X-Internal-Key": MIDDLEWARE_INTERNAL_KEY},
                )
        except Exception as e:
            logger.debug(f"Lakehouse write failed (non-fatal): {e}")


processor = MoMoWebhookProcessor()


# ─── Fluvio consumers (one per provider) ─────────────────────────────────────

async def consume_provider(provider: str):
    topic = f"paygate.momo.{provider}.events"
    while True:
        try:
            config = FluvioConfig()
            config.endpoint = FLUVIO_ENDPOINT
            fluvio = await Fluvio.connect(config)
            consumer = await fluvio.partition_consumer(topic, 0)
            stream = await consumer.stream(Offset.end())
            logger.info(f"MoMo consumer started for {topic}")
            async for record in stream:
                try:
                    event = json.loads(record.value_string())
                    await processor.process(event)
                except Exception as e:
                    logger.warning(f"Failed to process {topic} event: {e}")
        except Exception as e:
            logger.error(f"Fluvio consumer error for {topic}: {e}")
            await asyncio.sleep(5)


# ─── FastAPI ──────────────────────────────────────────────────────────────────

@app.on_event("startup")
async def startup():
    for provider in MOMO_PROVIDERS:
        asyncio.create_task(consume_provider(provider))


@app.get("/health")
async def health():
    return {"status": "ok", "service": "momo-webhook-processor"}


@app.get("/stats")
async def get_stats():
    return {"providers": processor.stats, "processedCount": len(processor.processed)}


if __name__ == "__main__":
    import uvicorn
    uvicorn.run(app, host="0.0.0.0", port=int(os.getenv("PORT", "8005")))
