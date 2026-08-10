#!/usr/bin/env bash
# =============================================================================
# PayGate Fluvio Topic Setup
# Run after Fluvio cluster is healthy.
# Requires: fluvio CLI in PATH
# =============================================================================
set -euo pipefail

FLUVIO_ENDPOINT="${FLUVIO_ENDPOINT:-localhost:9003}"

echo "=== PayGate Fluvio Topic Setup ==="
echo "  Endpoint: ${FLUVIO_ENDPOINT}"
echo ""

create_topic() {
  local topic="$1"
  local partitions="$2"
  local retention_secs="$3"
  echo "Creating topic: ${topic} (partitions=${partitions}, retention=${retention_secs}s)"
  fluvio topic create "${topic}" \
    --partitions "${partitions}" \
    --replication 2 \
    --retention-time "${retention_secs}s" \
    2>/dev/null || echo "  Topic '${topic}' already exists — skipping."
}

# ─── Payout approval event stream ─────────────────────────────────────────────
create_topic "paygate-payout-approval-events"  8  604800  # 7 days

# ─── Settlement event stream ──────────────────────────────────────────────────
create_topic "paygate-settlement-events"        4  604800  # 7 days

# ─── Real-time transaction feed (for live dashboard) ─────────────────────────
create_topic "paygate-transaction-feed"        16  3600    # 1 hour (hot stream)

# ─── Fraud signal stream ──────────────────────────────────────────────────────
create_topic "paygate-fraud-signals"            8  2592000 # 30 days

echo ""
echo "=== Listing all PayGate Fluvio topics ==="
fluvio topic list | grep "paygate-" || echo "  No topics found."

echo ""
echo "=== Fluvio topic setup complete ==="
