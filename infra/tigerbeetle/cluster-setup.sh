#!/usr/bin/env bash
# =============================================================================
# PayGate TigerBeetle 3-Node Cluster Setup
# Run on each node separately with NODE_INDEX=0|1|2
# Requires: tigerbeetle binary in PATH
# =============================================================================
set -euo pipefail

CLUSTER_ID="${TIGERBEETLE_CLUSTER_ID:-0}"
NODE_INDEX="${NODE_INDEX:-0}"
DATA_DIR="${TIGERBEETLE_DATA_DIR:-/var/lib/tigerbeetle}"
DATA_FILE="${DATA_DIR}/${CLUSTER_ID}_${NODE_INDEX}.tigerbeetle"
DATA_SIZE="${TIGERBEETLE_DATA_SIZE:-8GB}"

# Cluster addresses — all 3 nodes
ADDRESSES="${TIGERBEETLE_ADDRESSES:-10.0.0.1:3902,10.0.0.2:3902,10.0.0.3:3902}"

echo "=== PayGate TigerBeetle Node ${NODE_INDEX} Setup ==="
echo "  Cluster ID : ${CLUSTER_ID}"
echo "  Data file  : ${DATA_FILE}"
echo "  Data size  : ${DATA_SIZE}"
echo "  Addresses  : ${ADDRESSES}"
echo ""

mkdir -p "${DATA_DIR}"

# ─── Format (only run once per node) ─────────────────────────────────────────
if [ ! -f "${DATA_FILE}" ]; then
  echo "[1/2] Formatting TigerBeetle data file..."
  tigerbeetle format \
    --cluster="${CLUSTER_ID}" \
    --replica="${NODE_INDEX}" \
    --replica-count=3 \
    --size="${DATA_SIZE}" \
    "${DATA_FILE}"
  echo "      Done."
else
  echo "[1/2] Data file already exists — skipping format."
fi

# ─── Start ────────────────────────────────────────────────────────────────────
echo "[2/2] Starting TigerBeetle node ${NODE_INDEX}..."
exec tigerbeetle start \
  --addresses="${ADDRESSES}" \
  "${DATA_FILE}"
