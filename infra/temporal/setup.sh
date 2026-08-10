#!/usr/bin/env bash
# =============================================================================
# PayGate Temporal Namespace & Worker Setup
# Run after Temporal server is healthy.
# Requires: temporal CLI in PATH
# =============================================================================
set -euo pipefail

TEMPORAL_ADDRESS="${TEMPORAL_ADDRESS:-localhost:7233}"

echo "=== PayGate Temporal Setup ==="
echo "  Server: ${TEMPORAL_ADDRESS}"
echo ""

# ─── Create paygate namespace ─────────────────────────────────────────────────
echo "[1/3] Creating 'paygate' namespace..."
temporal operator namespace create \
  --address "${TEMPORAL_ADDRESS}" \
  --namespace paygate \
  --description "PayGate merchant portal workflows" \
  --retention 30d \
  --history-archival-state enabled \
  --visibility-archival-state enabled \
  2>/dev/null || echo "  Namespace already exists — skipping."

# ─── Verify namespace ─────────────────────────────────────────────────────────
echo "[2/3] Verifying namespace..."
temporal operator namespace describe \
  --address "${TEMPORAL_ADDRESS}" \
  --namespace paygate

# ─── List registered workflows (after worker starts) ─────────────────────────
echo "[3/3] Listing workflow types (requires worker to be running)..."
temporal workflow list \
  --address "${TEMPORAL_ADDRESS}" \
  --namespace paygate \
  --limit 5 \
  2>/dev/null || echo "  No workflows yet — start the bridge worker first."

echo ""
echo "=== Temporal setup complete ==="
echo ""
echo "Task queue: paygate-main"
echo "Workflows registered:"
echo "  - PayoutApprovalWorkflow"
echo "  - SettlementBatchWorkflow"
echo "  - SubscriptionChargeWorkflow"
echo "  - CrossBorderTransferWorkflow"
