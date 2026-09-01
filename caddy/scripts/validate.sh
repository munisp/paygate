#!/bin/bash
# =============================================================================
# Validate Caddy configuration before deployment
# =============================================================================
set -euo pipefail

SCRIPT_DIR="$(dirname "$0")"
CADDY_DIR="$SCRIPT_DIR/.."

echo "Validating Caddyfile..."
caddy validate --config "$CADDY_DIR/Caddyfile" --adapter caddyfile

echo "Validating L4 JSON config..."
caddy validate --config "$CADDY_DIR/config/caddy-l4.json"

echo "All configurations valid ✓"
