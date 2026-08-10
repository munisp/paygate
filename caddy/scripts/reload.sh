#!/bin/bash
# =============================================================================
# Zero-downtime Caddy config reload via Admin API
# =============================================================================
set -euo pipefail

CADDY_ADMIN_URL="${CADDY_ADMIN_URL:-http://localhost:2019}"
CADDY_DIR="$(dirname "$0")/.."

echo "Reloading Caddy configuration (zero-downtime)..."

# Validate first
caddy validate --config "$CADDY_DIR/Caddyfile" --adapter caddyfile

# Reload via Admin API
curl -s -X POST "${CADDY_ADMIN_URL}/load" \
  -H "Content-Type: text/caddyfile" \
  --data-binary @"$CADDY_DIR/Caddyfile"

echo "Reload complete ✓"
echo "Active config: ${CADDY_ADMIN_URL}/config/"

