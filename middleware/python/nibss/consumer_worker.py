"""
NIP Transfer Consumer Worker
Consumes Kafka events from paygate.nibss.* topics and:
  - Updates DB transfer status via REST
  - Publishes analytics to Lakehouse
  - Triggers Temporal workflows for settlement/reversal
  - Fans out to Fluvio for real-time UI updates
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from aiokafka import AIOKafkaConsumer
from fluvio import Fluvio
from temporalio.client import Client as TemporalClient

logger = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
FLUVIO_ENDPOINT = os.getenv("FLUVIO_ENDPOINT", "")
TEMPORAL_HOST = os.getenv("TEMPORAL_HOST_PORT", "localhost:7233")
TEMPORAL_NAMESPACE = os.getenv("TEMPORAL_NAMESPACE", "paygate")
MIDDLEWARE_BRIDGE_URL = os.getenv("MIDDLEWARE_BRIDGE_URL", "http://localhost:8080")
INTERNAL_API_KEY = os.getenv("MIDDLEWARE_INTERNAL_KEY", "")

NIP_TOPICS = [
    "paygate.nibss.payment.received",
    "paygate.nibss.transfer.completed",
    "paygate.nibss.virtual_account",
    "paygate.nibss.name_enquiry",
]


async def handle_payment_received(event: dict[str, Any]) -> None:
    """Handle a NIP virtual account payment notification."""
    reference = event.get("reference", "")
    status = event.get("status", "failed")
    amount = event.get("amount", 0)

    logger.info(f"[nip-consumer] payment received: ref={reference} status={status} amount={amount}")

    # 1. Update virtual account status via bridge REST
    import aiohttp
    async with aiohttp.ClientSession() as session:
        await session.patch(
            f"{MIDDLEWARE_BRIDGE_URL}/internal/nip/virtual-accounts/{reference}",
            json={"status": status, "paidAmount": amount, "paidAt": datetime.now(timezone.utc).isoformat()},
            headers={"X-Internal-Key": INTERNAL_API_KEY},
        )

    # 2. Trigger Temporal settlement workflow if paid
    if status == "paid":
        try:
            temporal = await TemporalClient.connect(TEMPORAL_HOST, namespace=TEMPORAL_NAMESPACE)
            await temporal.start_workflow(
                "NipSettlementWorkflow",
                {"reference": reference, "amount": amount},
                id=f"nip-settle-{reference}",
                task_queue="nip-settlement",
            )
        except Exception as e:
            logger.error(f"[nip-consumer] temporal workflow error: {e}")

    # 3. Publish to Fluvio for real-time UI
    if FLUVIO_ENDPOINT:
        try:
            fluvio = await Fluvio.connect()
            producer = await fluvio.topic_producer("paygate-nibss-events")
            await producer.send_string(json.dumps(event))
        except Exception as e:
            logger.warning(f"[nip-consumer] fluvio publish error: {e}")


async def handle_transfer_completed(event: dict[str, Any]) -> None:
    """Handle a NIP outbound transfer completion."""
    reference = event.get("reference", "")
    session_id = event.get("sessionId", "")
    response_code = event.get("responseCode", "")

    logger.info(f"[nip-consumer] transfer completed: ref={reference} code={response_code}")

    # Publish analytics event to Lakehouse
    analytics_event = {
        "event_type": "nip_transfer_completed",
        "reference": reference,
        "session_id": session_id,
        "response_code": response_code,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    await publish_to_lakehouse(analytics_event)


async def publish_to_lakehouse(event: dict[str, Any]) -> None:
    """Write event to Lakehouse via REST."""
    import aiohttp
    try:
        async with aiohttp.ClientSession() as session:
            await session.post(
                f"{MIDDLEWARE_BRIDGE_URL}/internal/lakehouse/events",
                json=event,
                headers={"X-Internal-Key": INTERNAL_API_KEY},
            )
    except Exception as e:
        logger.warning(f"[nip-consumer] lakehouse write error: {e}")


async def consume_nip_events() -> None:
    consumer = AIOKafkaConsumer(
        *NIP_TOPICS,
        bootstrap_servers=KAFKA_BROKERS,
        group_id="nip-consumer-worker",
        auto_offset_reset="latest",
        value_deserializer=lambda v: json.loads(v.decode("utf-8")),
    )
    await consumer.start()
    logger.info(f"[nip-consumer] Listening on topics: {NIP_TOPICS}")

    try:
        async for msg in consumer:
            event = msg.value
            topic = msg.topic
            try:
                if topic == "paygate.nibss.payment.received":
                    await handle_payment_received(event)
                elif topic == "paygate.nibss.transfer.completed":
                    await handle_transfer_completed(event)
                else:
                    logger.debug(f"[nip-consumer] unhandled topic: {topic}")
            except Exception as e:
                logger.error(f"[nip-consumer] handler error: topic={topic} err={e}")
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(consume_nip_events())
