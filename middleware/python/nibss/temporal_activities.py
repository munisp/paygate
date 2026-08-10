"""
Temporal activity stubs for NIP settlement, reversal, and retry workflows.
"""
import logging
import os
from datetime import timedelta
from typing import Any

from temporalio import activity, workflow
from temporalio.client import Client
from temporalio.worker import Worker

logger = logging.getLogger(__name__)

TEMPORAL_HOST = os.getenv("TEMPORAL_HOST_PORT", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "paygate")
MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "http://localhost:8080")
INTERNAL_API_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")


@activity.defn
async def settle_nip_transfer(params: dict[str, Any]) -> dict[str, Any]:
    """Post double-entry settlement to TigerBeetle via bridge."""
    import aiohttp
    reference = params["reference"]
    amount = params["amount"]
    merchant_id = params.get("merchantId", "")

    async with aiohttp.ClientSession() as session:
        resp = await session.post(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/tigerbeetle/nip-settle",
            json={"reference": reference, "amount": amount, "merchantId": merchant_id},
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )
        result = await resp.json()

    logger.info(f"[temporal] NIP settled: ref={reference} result={result}")
    return result


@activity.defn
async def reverse_nip_transfer(params: dict[str, Any]) -> dict[str, Any]:
    """Reverse a NIP transfer on timeout or NIBSS reversal."""
    import aiohttp
    reference = params["reference"]
    reason = params.get("reason", "timeout")

    async with aiohttp.ClientSession() as session:
        resp = await session.post(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/nibss/reverse",
            json={"reference": reference, "reason": reason},
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )
        result = await resp.json()

    logger.info(f"[temporal] NIP reversed: ref={reference} reason={reason}")
    return result


@activity.defn
async def notify_merchant_nip_status(params: dict[str, Any]) -> None:
    """Send webhook notification to merchant on NIP status change."""
    import aiohttp
    merchant_id = params["merchantId"]
    reference = params["reference"]
    status = params["status"]
    amount = params.get("amount", 0)

    async with aiohttp.ClientSession() as session:
        await session.post(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/webhooks/deliver",
            json={
                "merchantId": merchant_id,
                "event": "nip.payment.status",
                "data": {"reference": reference, "status": status, "amount": amount},
            },
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )


@workflow.defn
class NipSettlementWorkflow:
    @workflow.run
    async def run(self, params: dict[str, Any]) -> dict[str, Any]:
        reference = params["reference"]
        amount = params["amount"]
        merchant_id = params.get("merchantId", "")

        # 1. Settle to TigerBeetle
        result = await workflow.execute_activity(
            settle_nip_transfer,
            {"reference": reference, "amount": amount, "merchantId": merchant_id},
            start_to_close_timeout=timedelta(seconds=30),
        )

        # 2. Notify merchant
        await workflow.execute_activity(
            notify_merchant_nip_status,
            {"merchantId": merchant_id, "reference": reference, "status": "paid", "amount": amount},
            start_to_close_timeout=timedelta(seconds=10),
        )

        return result


async def run_worker() -> None:
    client = await Client.connect(TEMPORAL_HOST, namespace=TEMPORAL_NAMESPACE)
    worker = Worker(
        client,
        task_queue="nip-settlement",
        workflows=[NipSettlementWorkflow],
        activities=[settle_nip_transfer, reverse_nip_transfer, notify_merchant_nip_status],
    )
    await worker.run()


if __name__ == "__main__":
    import asyncio
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run_worker())
