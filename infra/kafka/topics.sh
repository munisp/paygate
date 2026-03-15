#!/usr/bin/env bash
# =============================================================================
# PayGate Kafka Topic Provisioning
# Run once against the production Kafka cluster.
# Requires: kafka-topics.sh in PATH (Kafka CLI tools)
# =============================================================================
set -euo pipefail

BOOTSTRAP="${KAFKA_BOOTSTRAP_SERVERS:-kafka-1:9092,kafka-2:9092,kafka-3:9092}"
REPLICATION="${KAFKA_REPLICATION_FACTOR:-3}"

echo "=== PayGate Kafka Topic Provisioning ==="
echo "  Bootstrap : ${BOOTSTRAP}"
echo "  Replication factor: ${REPLICATION}"
echo ""

create_topic() {
  local topic="$1"
  local partitions="$2"
  local retention_ms="$3"
  echo "Creating topic: ${topic} (partitions=${partitions}, retention=${retention_ms}ms)"
  kafka-topics.sh \
    --bootstrap-server "${BOOTSTRAP}" \
    --create \
    --if-not-exists \
    --topic "${topic}" \
    --partitions "${partitions}" \
    --replication-factor "${REPLICATION}" \
    --config min.insync.replicas=2 \
    --config retention.ms="${retention_ms}" \
    --config compression.type=lz4 \
    --config cleanup.policy=delete
}

# ─── Core payment topics ──────────────────────────────────────────────────────
create_topic "paygate.transaction.completed"  32  604800000   # 7 days
create_topic "paygate.transaction.failed"     16  604800000   # 7 days
create_topic "paygate.payout.initiated"       16  604800000   # 7 days
create_topic "paygate.settlement.triggered"    8  604800000   # 7 days
create_topic "paygate.fraud.alert"             8  2592000000  # 30 days
create_topic "paygate.audit.events"           16  7776000000  # 90 days
create_topic "paygate.nibss.confirmation"      8  604800000   # 7 days

echo ""
echo "=== Listing all PayGate topics ==="
kafka-topics.sh \
  --bootstrap-server "${BOOTSTRAP}" \
  --list \
  | grep "^paygate\."

echo ""
echo "=== Topic provisioning complete ==="
