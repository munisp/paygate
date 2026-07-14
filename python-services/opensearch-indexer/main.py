"""
PayGate OpenSearch Audit Log Indexer
======================================
Kafka consumer that indexes all PayGate audit events, transactions, fraud signals,
and insider threat alerts into OpenSearch for compliance, forensics, and analytics.

Architecture:
  - Kafka consumer group: paygate-opensearch-indexer
  - OpenSearch: full-text + structured search over financial events
  - Bulk indexing with configurable batch size and flush interval
  - Dead-letter queue for failed indexing attempts
  - Index lifecycle management (ILM) with 30-day hot, 90-day warm, 365-day cold

Topics consumed:
  paygate.audit.events              → paygate-audit-logs-{YYYY.MM.dd}
  paygate.transaction.created       → paygate-transactions-{YYYY.MM.dd}
  paygate.fraud.alert               → paygate-fraud-signals-{YYYY.MM.dd}
  paygate.insider.threat.events     → paygate-insider-threat-{YYYY.MM.dd}
  paygate.settlement.confirmed      → paygate-settlements-{YYYY.MM.dd}
  paygate.kyb.status.change         → paygate-kyb-events-{YYYY.MM.dd}
  paygate.payout.approved           → paygate-payouts-{YYYY.MM.dd}

Environment variables:
  KAFKA_BROKERS          — Kafka bootstrap servers (default: kafka:29092)
  KAFKA_GROUP_ID         — Consumer group ID (default: paygate-opensearch-indexer)
  OPENSEARCH_URL         — OpenSearch endpoint (default: http://opensearch:9200)
  OPENSEARCH_USER        — Basic auth username (default: admin)
  OPENSEARCH_PASS        — Basic auth password
  BATCH_SIZE             — Documents per bulk request (default: 100)
  FLUSH_INTERVAL_SECS    — Max seconds between flushes (default: 5)
  DLQ_TOPIC              — Dead-letter topic (default: paygate.opensearch.dlq)
  LOG_LEVEL              — Logging level (default: INFO)
"""
from __future__ import annotations

import json
import logging
import os
import signal
import sys
import threading
import time
from collections import defaultdict
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional

import requests
from confluent_kafka import Consumer, KafkaError, KafkaException, Producer

# ─── Configuration ────────────────────────────────────────────────────────────

KAFKA_BROKERS = os.getenv("KAFKA_BROKERS", "kafka:29092")
KAFKA_GROUP_ID = os.getenv("KAFKA_GROUP_ID", "paygate-opensearch-indexer")
OPENSEARCH_URL = os.getenv("OPENSEARCH_URL", "http://opensearch:9200").rstrip("/")
OPENSEARCH_USER = os.getenv("OPENSEARCH_USER", "admin")
OPENSEARCH_PASS = os.getenv("OPENSEARCH_PASS", "")
BATCH_SIZE = int(os.getenv("BATCH_SIZE", "100"))
FLUSH_INTERVAL_SECS = float(os.getenv("FLUSH_INTERVAL_SECS", "5"))
DLQ_TOPIC = os.getenv("DLQ_TOPIC", "paygate.opensearch.dlq")
LOG_LEVEL = os.getenv("LOG_LEVEL", "INFO").upper()

logging.basicConfig(
    level=getattr(logging, LOG_LEVEL, logging.INFO),
    format="%(asctime)s %(levelname)s %(name)s %(message)s",
)
logger = logging.getLogger("opensearch-indexer")

# ─── Topic → Index mapping ────────────────────────────────────────────────────

def daily_index(base: str) -> str:
    """Returns a date-partitioned index name, e.g. paygate-audit-logs-2026.06.21"""
    today = datetime.now(timezone.utc).strftime("%Y.%m.%d")
    return f"{base}-{today}"

TOPIC_INDEX_MAP: Dict[str, str] = {
    "paygate.audit.events":          "paygate-audit-logs",
    "paygate.transaction.created":   "paygate-transactions",
    "paygate.fraud.alert":           "paygate-fraud-signals",
    "paygate.insider.threat.events": "paygate-insider-threat",
    "paygate.settlement.confirmed":  "paygate-settlements",
    "paygate.kyb.status.change":     "paygate-kyb-events",
    "paygate.payout.approved":       "paygate-payouts",
}

TOPICS = list(TOPIC_INDEX_MAP.keys())

# ─── OpenSearch helpers ───────────────────────────────────────────────────────

def _auth() -> Optional[tuple]:
    if OPENSEARCH_USER and OPENSEARCH_PASS:
        return (OPENSEARCH_USER, OPENSEARCH_PASS)
    return None

def ensure_ilm_policy() -> None:
    """Create a 30/90/365-day ILM policy if it doesn't exist."""
    policy_name = "paygate-events-policy"
    url = f"{OPENSEARCH_URL}/_plugins/_ism/policies/{policy_name}"
    resp = requests.get(url, auth=_auth(), timeout=10)
    if resp.status_code == 200:
        return  # already exists

    policy = {
        "policy": {
            "description": "PayGate events ILM: hot 30d → warm 90d → cold 365d → delete",
            "default_state": "hot",
            "states": [
                {
                    "name": "hot",
                    "actions": [{"rollover": {"min_index_age": "30d"}}],
                    "transitions": [{"state_name": "warm", "conditions": {"min_index_age": "30d"}}],
                },
                {
                    "name": "warm",
                    "actions": [{"read_only": {}}],
                    "transitions": [{"state_name": "cold", "conditions": {"min_index_age": "90d"}}],
                },
                {
                    "name": "cold",
                    "actions": [],
                    "transitions": [{"state_name": "delete", "conditions": {"min_index_age": "365d"}}],
                },
                {"name": "delete", "actions": [{"delete": {}}], "transitions": []},
            ],
        }
    }
    try:
        r = requests.put(url, json=policy, auth=_auth(), timeout=10)
        if r.status_code in (200, 201):
            logger.info("ILM policy created: %s", policy_name)
        else:
            logger.warning("ILM policy creation: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("ILM policy creation failed: %s", e)

def ensure_index_template(base_index: str) -> None:
    """Create an index template for the base index pattern."""
    template_name = f"{base_index}-template"
    url = f"{OPENSEARCH_URL}/_index_template/{template_name}"
    resp = requests.get(url, auth=_auth(), timeout=10)
    if resp.status_code == 200:
        return

    template = {
        "index_patterns": [f"{base_index}-*"],
        "template": {
            "settings": {
                "number_of_shards": 1,
                "number_of_replicas": 1,
                "plugins.index_state_management.policy_id": "paygate-events-policy",
            },
            "mappings": {
                "properties": {
                    "@timestamp": {"type": "date"},
                    "id": {"type": "keyword"},
                    "actor_id": {"type": "keyword"},
                    "merchant_id": {"type": "keyword"},
                    "action": {"type": "keyword"},
                    "status": {"type": "keyword"},
                    "risk_score": {"type": "integer"},
                    "amount_kobo": {"type": "long"},
                    "currency": {"type": "keyword"},
                    "ip_address": {"type": "ip"},
                    "message": {"type": "text", "analyzer": "standard"},
                }
            },
        },
    }
    try:
        r = requests.put(url, json=template, auth=_auth(), timeout=10)
        if r.status_code in (200, 201):
            logger.info("Index template created: %s", template_name)
        else:
            logger.warning("Index template: %s %s", r.status_code, r.text[:200])
    except Exception as e:
        logger.warning("Index template creation failed: %s", e)

def bulk_index(docs: List[Dict[str, Any]]) -> List[Dict]:
    """Send a bulk indexing request to OpenSearch. Returns failed items."""
    if not docs:
        return []

    lines = []
    for doc in docs:
        index = doc.pop("_index")
        doc_id = doc.pop("_id", None)
        meta = {"index": {"_index": index}}
        if doc_id:
            meta["index"]["_id"] = doc_id
        lines.append(json.dumps(meta))
        # Add @timestamp if missing
        if "@timestamp" not in doc:
            doc["@timestamp"] = datetime.now(timezone.utc).isoformat()
        lines.append(json.dumps(doc))

    body = "\n".join(lines) + "\n"
    try:
        resp = requests.post(
            f"{OPENSEARCH_URL}/_bulk",
            data=body,
            headers={"Content-Type": "application/x-ndjson"},
            auth=_auth(),
            timeout=30,
        )
        if resp.status_code >= 400:
            logger.error("Bulk index HTTP error: %s %s", resp.status_code, resp.text[:500])
            return docs  # return all as failed

        result = resp.json()
        failed = []
        if result.get("errors"):
            for item in result.get("items", []):
                op = item.get("index", {})
                if op.get("error"):
                    logger.warning("Index error: %s", op["error"])
                    failed.append(item)
        return failed
    except Exception as e:
        logger.error("Bulk index exception: %s", e)
        return docs

# ─── DLQ Producer ─────────────────────────────────────────────────────────────

_dlq_producer: Optional[Producer] = None

def get_dlq_producer() -> Producer:
    global _dlq_producer
    if _dlq_producer is None:
        _dlq_producer = Producer({"bootstrap.servers": KAFKA_BROKERS})
    return _dlq_producer

def send_to_dlq(topic: str, key: str, value: bytes, error: str) -> None:
    try:
        payload = json.dumps({"original_topic": topic, "key": key, "error": error}).encode()
        get_dlq_producer().produce(DLQ_TOPIC, key=key.encode(), value=payload)
        get_dlq_producer().poll(0)
    except Exception as e:
        logger.error("DLQ send failed: %s", e)

# ─── Indexer ──────────────────────────────────────────────────────────────────

class BatchIndexer:
    """Thread-safe batch indexer with time-based and size-based flushing."""

    def __init__(self) -> None:
        self._buf: List[Dict] = []
        self._lock = threading.Lock()
        self._last_flush = time.monotonic()

    def add(self, doc: Dict) -> None:
        with self._lock:
            self._buf.append(doc)
            should_flush = len(self._buf) >= BATCH_SIZE
        if should_flush:
            self.flush()

    def flush(self) -> None:
        with self._lock:
            if not self._buf:
                return
            batch = self._buf[:]
            self._buf = []
            self._last_flush = time.monotonic()

        failed = bulk_index(batch)
        if failed:
            logger.warning("Bulk index: %d/%d documents failed", len(failed), len(batch))

    def maybe_flush(self) -> None:
        """Flush if the flush interval has elapsed."""
        if time.monotonic() - self._last_flush >= FLUSH_INTERVAL_SECS:
            self.flush()

def enrich_document(topic: str, raw: Dict) -> Dict:
    """Add standard fields to every document before indexing."""
    base_index = TOPIC_INDEX_MAP.get(topic, "paygate-unknown")
    today = datetime.now(timezone.utc).strftime("%Y.%m.%d")

    doc = dict(raw)
    doc["_index"] = f"{base_index}-{today}"
    doc["_id"] = doc.get("id") or doc.get("transaction_id") or doc.get("event_id")
    doc["source_topic"] = topic
    if "@timestamp" not in doc and "timestamp" in doc:
        doc["@timestamp"] = doc["timestamp"]
    return doc

# ─── Main consumer loop ───────────────────────────────────────────────────────

_running = True

def shutdown(signum, frame):
    global _running
    logger.info("Shutdown signal received")
    _running = False

signal.signal(signal.SIGTERM, shutdown)
signal.signal(signal.SIGINT, shutdown)

def main() -> None:
    logger.info("Starting OpenSearch indexer (brokers=%s, group=%s)", KAFKA_BROKERS, KAFKA_GROUP_ID)

    # Ensure ILM policy and index templates
    try:
        ensure_ilm_policy()
        for base_index in set(TOPIC_INDEX_MAP.values()):
            ensure_index_template(base_index)
    except Exception as e:
        logger.warning("OpenSearch setup failed (will retry): %s", e)

    consumer = Consumer({
        "bootstrap.servers": KAFKA_BROKERS,
        "group.id": KAFKA_GROUP_ID,
        "auto.offset.reset": "earliest",
        "enable.auto.commit": False,
        "max.poll.interval.ms": 300_000,
        "session.timeout.ms": 30_000,
    })
    consumer.subscribe(TOPICS)

    indexer = BatchIndexer()
    stats: Dict[str, int] = defaultdict(int)
    last_stats_log = time.monotonic()

    try:
        while _running:
            msg = consumer.poll(timeout=1.0)

            if msg is None:
                indexer.maybe_flush()
                continue

            if msg.error():
                if msg.error().code() == KafkaError._PARTITION_EOF:
                    continue
                logger.error("Kafka error: %s", msg.error())
                continue

            topic = msg.topic()
            key = (msg.key() or b"").decode("utf-8", errors="replace")

            try:
                raw = json.loads(msg.value())
                doc = enrich_document(topic, raw)
                indexer.add(doc)
                stats[topic] += 1
                consumer.commit(asynchronous=True)
            except json.JSONDecodeError as e:
                logger.warning("JSON decode error on %s: %s", topic, e)
                send_to_dlq(topic, key, msg.value(), str(e))
                consumer.commit(asynchronous=True)
            except Exception as e:
                logger.error("Processing error on %s: %s", topic, e)
                send_to_dlq(topic, key, msg.value(), str(e))

            # Log stats every 60 seconds
            if time.monotonic() - last_stats_log >= 60:
                logger.info("Indexed: %s", dict(stats))
                stats.clear()
                last_stats_log = time.monotonic()

    except KafkaException as e:
        logger.error("Fatal Kafka exception: %s", e)
    finally:
        indexer.flush()
        consumer.close()
        logger.info("OpenSearch indexer stopped")

if __name__ == "__main__":
    main()
