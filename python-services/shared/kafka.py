"""
PayGate Shared Kafka Client
Thin wrappers around aiokafka for all Python microservices.
"""
from typing import Any, Callable, Optional
import json
import asyncio
from .config import KAFKA_BOOTSTRAP
from .logging import get_logger

logger = get_logger("kafka")


class KafkaProducer:
    """Async Kafka producer with JSON serialization."""

    def __init__(self, bootstrap_servers: str = KAFKA_BOOTSTRAP):
        self.bootstrap_servers = bootstrap_servers
        self._producer = None

    async def start(self):
        try:
            from aiokafka import AIOKafkaProducer  # type: ignore
            self._producer = AIOKafkaProducer(
                bootstrap_servers=self.bootstrap_servers,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
            await self._producer.start()
            logger.info(f"Kafka producer connected to {self.bootstrap_servers}")
        except Exception as e:
            logger.warning(f"Kafka producer unavailable: {e} — operating in no-op mode")

    async def send(self, topic: str, value: Any, key: Optional[str] = None):
        if not self._producer:
            logger.debug(f"[no-op] Kafka send: topic={topic} key={key}")
            return
        try:
            key_bytes = key.encode("utf-8") if key else None
            await self._producer.send(topic, value=value, key=key_bytes)
        except Exception as e:
            logger.error(f"Kafka send failed: {e}")

    async def stop(self):
        if self._producer:
            await self._producer.stop()


class KafkaConsumer:
    """Async Kafka consumer with JSON deserialization."""

    def __init__(self, topics: list[str], group_id: str, bootstrap_servers: str = KAFKA_BOOTSTRAP):
        self.topics = topics
        self.group_id = group_id
        self.bootstrap_servers = bootstrap_servers
        self._consumer = None

    async def start(self):
        try:
            from aiokafka import AIOKafkaConsumer  # type: ignore
            self._consumer = AIOKafkaConsumer(
                *self.topics,
                bootstrap_servers=self.bootstrap_servers,
                group_id=self.group_id,
                value_deserializer=lambda v: json.loads(v.decode("utf-8")),
                auto_offset_reset="earliest",
            )
            await self._consumer.start()
            logger.info(f"Kafka consumer started: topics={self.topics} group={self.group_id}")
        except Exception as e:
            logger.warning(f"Kafka consumer unavailable: {e}")

    async def consume(self, handler: Callable[[Any], Any]):
        if not self._consumer:
            logger.debug("Kafka consumer not available — skipping consume loop")
            return
        async for msg in self._consumer:
            try:
                await handler(msg.value)
            except Exception as e:
                logger.error(f"Consumer handler error: {e}")

    async def stop(self):
        if self._consumer:
            await self._consumer.stop()
