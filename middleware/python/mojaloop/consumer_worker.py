"""
Mojaloop Python Consumer Worker
================================
Consumes Mojaloop transfer events from Kafka, fans out to Fluvio,
aggregates analytics, and triggers Temporal workflows.

Topics consumed:
  paygate.mojaloop.transfer.completed
  paygate.mojaloop.transfer.failed
  paygate.mojaloop.party.found
  paygate.mojaloop.quote.accepted

Fluvio topics produced:
  paygate.mojaloop.fluvio.analytics
  paygate.mojaloop.fluvio.transfer.completed (mirror for Python consumers)
"""
import asyncio
import json
import logging
import os
from datetime import datetime, timezone
from typing import Any

from confluent_kafka import Consumer, KafkaError, KafkaException
from dotenv import load_dotenv

from models import (
    PartyFoundEvent,
    QuoteAcceptedEvent,
    TransferCompletedEvent,
    TransferFailedEvent,
)
from analytics_aggregator import MojaloopAnalyticsAggregator
from temporal_activities import trigger_transfer_workflow

load_dotenv()
logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(message)s")
logger = logging.getLogger(__name__)

KAFKA_BROKERS = os.getenv("KAFKA_BOOTSTRAP_SERVERS", "localhost:9092")
TOPICS = [
    "paygate.mojaloop.transfer.completed",
    "paygate.mojaloop.transfer.failed",
    "paygate.mojaloop.party.found",
    "paygate.mojaloop.quote.accepted",
]


class MojaloopConsumerWorker:
    """Kafka consumer that processes Mojaloop events and fans out to downstream services."""

    def __init__(self):
        self.consumer = Consumer({
            "bootstrap.servers": KAFKA_BROKERS,
            "group.id": "mojaloop-python-worker",
            "auto.offset.reset": "earliest",
            "enable.auto.commit": True,
            "session.timeout.ms": 30_000,
        })
        self.analytics = MojaloopAnalyticsAggregator()
        self.running = False

    async def start(self):
        """Subscribe to topics and start consuming."""
        self.consumer.subscribe(TOPICS)
        self.running = True
        logger.info("Mojaloop consumer worker started, subscribed to %s", TOPICS)
        await self._consume_loop()

    async def _consume_loop(self):
        loop = asyncio.get_event_loop()
        while self.running:
            msg = await loop.run_in_executor(None, lambda: self.consumer.poll(timeout=1.0))
            if msg is None:
                continue
            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error("Kafka error: %s", msg.error())
                continue
            await self._handle_message(msg.topic(), msg.value())

    async def _handle_message(self, topic: str, raw: bytes):
        try:
            data: dict[str, Any] = json.loads(raw)
        except json.JSONDecodeError as e:
            logger.error("Failed to parse message: %s", e)
            return

        logger.info("Processing Mojaloop event from topic=%s merchant_id=%s",
                    topic, data.get("merchant_id", "unknown"))

        if topic == "paygate.mojaloop.transfer.completed":
            event = TransferCompletedEvent(**data)
            await self._handle_transfer_completed(event)

        elif topic == "paygate.mojaloop.transfer.failed":
            event = TransferFailedEvent(**data)
            await self._handle_transfer_failed(event)

        elif topic == "paygate.mojaloop.party.found":
            event = PartyFoundEvent(**data)
            await self.analytics.record_party_lookup(event)

        elif topic == "paygate.mojaloop.quote.accepted":
            event = QuoteAcceptedEvent(**data)
            await self.analytics.record_quote_accepted(event)

    async def _handle_transfer_completed(self, event: TransferCompletedEvent):
        """Process a completed transfer: update analytics, trigger Temporal workflow."""
        # 1. Record analytics
        await self.analytics.record_transfer_completed(event)

        # 2. Trigger Temporal post-transfer workflow (receipt email, ledger update, etc.)
        try:
            await trigger_transfer_workflow(event)
        except Exception as e:
            logger.error("Failed to trigger Temporal workflow for transfer %s: %s",
                         event.transfer_id, e)

        logger.info(
            "Transfer completed: transfer_id=%s merchant_id=%s amount=%s %s",
            event.transfer_id, event.merchant_id, event.amount, event.currency
        )

    async def _handle_transfer_failed(self, event: TransferFailedEvent):
        """Process a failed transfer: update analytics, alert merchant."""
        await self.analytics.record_transfer_failed(event)
        logger.warning(
            "Transfer failed: transfer_id=%s merchant_id=%s error=%s %s",
            event.transfer_id, event.merchant_id, event.error_code, event.error_description
        )

    def stop(self):
        self.running = False
        self.consumer.close()
        logger.info("Mojaloop consumer worker stopped")


async def main():
    worker = MojaloopConsumerWorker()
    try:
        await worker.start()
    except KeyboardInterrupt:
        worker.stop()


if __name__ == "__main__":
    asyncio.run(main())
