#!/usr/bin/env bash
# PayGate Complete Archive Generator v71
# Generates a comprehensive archive from /home/ubuntu
# Excludes: Rust build artifacts, node_modules, .git, browser data, toolchain caches
set -euo pipefail

ARCHIVE_NAME="paygate_COMPLETE_v71.tar.gz"
OUTPUT_PATH="/home/ubuntu/${ARCHIVE_NAME}"

echo "=== PayGate Complete Archive Generator v71 ==="
echo "Output: ${OUTPUT_PATH}"
echo ""

# Count expected files first
echo "Counting source files..."
EXPECTED=$(find /home/ubuntu \
  -not -path '*/rust-services/wallet-ffi/target/*' \
  -not -path '*/rust/paygate-wallet-ffi/target/*' \
  -not -path '*/paygate-merchant-portal/node_modules/*' \
  -not -path '*/paygate-merchant-portal/.git/*' \
  -not -path '*/.cargo/registry/*' \
  -not -path '*/.cargo/git/*' \
  -not -path '*/.rustup/toolchains/*' \
  -not -path '*/.cache/*' \
  -not -path '*/.nvm/*' \
  -not -path '*/.npm/*' \
  -not -path '*/.local/*' \
  -not -path '*/.config/*' \
  -not -path '*/.pki/*' \
  -not -path '*/.browser_data_dir/*' \
  -not -path '*/go/pkg/*' \
  -not -path '*/terminal_full_output/*' \
  -not -name "*.tar.gz" \
  -type f 2>/dev/null | wc -l)
echo "Expected source files: ${EXPECTED}"
echo ""

# Generate archive
echo "Generating archive..."
cd /home/ubuntu
tar -czf "${OUTPUT_PATH}" \
  --exclude='paygate-merchant-portal/rust-services/wallet-ffi/target' \
  --exclude='paygate-merchant-portal/rust/paygate-wallet-ffi/target' \
  --exclude='paygate-merchant-portal/node_modules' \
  --exclude='paygate-merchant-portal/.git' \
  --exclude='.cargo/registry' \
  --exclude='.cargo/git' \
  --exclude='.rustup/toolchains' \
  --exclude='.cache' \
  --exclude='.nvm' \
  --exclude='.npm' \
  --exclude='.local' \
  --exclude='.config' \
  --exclude='.pki' \
  --exclude='.browser_data_dir' \
  --exclude='go/pkg' \
  --exclude='terminal_full_output' \
  --exclude='*.tar.gz' \
  --exclude='paygate_COMPLETE_v71.tar.gz' \
  . 2>/dev/null || true

echo ""
echo "=== Archive Complete ==="
ls -lh "${OUTPUT_PATH}"
ACTUAL=$(tar -tzf "${OUTPUT_PATH}" 2>/dev/null | wc -l)
echo "Entries in archive: ${ACTUAL}"
echo ""
echo "=== Archive Contents Summary ==="
tar -tzf "${OUTPUT_PATH}" 2>/dev/null | grep -E "^\.\/paygate-merchant-portal\/[^/]+\/$" || true
echo ""
echo "=== Top-level files/dirs ==="
tar -tzf "${OUTPUT_PATH}" 2>/dev/null | grep -E "^\./[^/]+$" | head -30 || true
