#!/usr/bin/env bash
# gen-certs.sh — generate PayGate mTLS CA/server/client keypairs.
#
# Usage: scripts/gen-certs.sh [validity_days]
#
# Private keys (*.key) are written to infra/certs/ and are gitignored —
# never commit them. The previously committed keys (removed in the 2026-05
# security remediation) are compromised; regenerate and redeploy.
set -euo pipefail

REPO_ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
exec bash "$REPO_ROOT/infra/certs/generate-certs.sh" "$@"
