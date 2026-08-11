#!/bin/bash
# =============================================================================
# Build custom Caddy binary with PayGate plugins
# =============================================================================
set -euo pipefail

CADDY_VERSION="v2.9.1"
OUTPUT_DIR="$(dirname "$0")/../bin"

mkdir -p "$OUTPUT_DIR"

echo "Building Caddy ${CADDY_VERSION} with PayGate plugins..."

docker run --rm \
  -v "$OUTPUT_DIR:/output" \
  caddy:${CADDY_VERSION}-builder \
  xcaddy build ${CADDY_VERSION} \
    --with github.com/greenpau/caddy-security@v1.1.28 \
    --with github.com/mholt/caddy-l4@v0.0.0-20241209172512-4b8f824e2d24 \
    --with github.com/caddy-dns/cloudflare@v0.0.0-20240703190432-89f16b99c18e \
    --with github.com/mholt/caddy-ratelimit@v0.0.0-20220811233237-2f9a6f2c2f0d \
    --with github.com/caddyserver/cache-handler@v0.14.0 \
    --output /output/caddy

echo "Build complete: $OUTPUT_DIR/caddy"
echo "Version info:"
"$OUTPUT_DIR/caddy" version
