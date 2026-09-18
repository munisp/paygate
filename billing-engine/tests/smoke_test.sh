#!/usr/bin/env bash
# ─── Billing Engine Smoke Test ────────────────────────────────────────────────
# Validates all billing engine service health endpoints and basic API calls.
# Usage: ./billing-engine/tests/smoke_test.sh [BASE_URL]
# Example: ./billing-engine/tests/smoke_test.sh http://localhost

set -euo pipefail

BASE_URL="${1:-http://localhost}"
PASS=0
FAIL=0

check() {
  local name="$1"
  local url="$2"
  local expected="${3:-200}"
  local actual
  actual=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  if [ "$actual" = "$expected" ]; then
    echo "  ✓ $name ($actual)"
    PASS=$((PASS + 1))
  else
    echo "  ✗ $name (expected $expected, got $actual)"
    FAIL=$((FAIL + 1))
  fi
}

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  PayGate Billing Engine Smoke Test"
echo "  Target: $BASE_URL"
echo "═══════════════════════════════════════════════════════════"

echo ""
echo "── Core Services ──────────────────────────────────────────"
check "Rust Billing Core health"          "$BASE_URL:8093/health"
check "Go Event Ingestor health"          "$BASE_URL:8094/health"
check "Go Onboarding Worker health"       "$BASE_URL:8095/health"
check "Go Audit RBAC health"             "$BASE_URL:8096/health"
check "Python Settlement Bridge health"  "$BASE_URL:8097/health"

echo ""
echo "── Portal API ─────────────────────────────────────────────"
check "Portal tRPC health"               "$BASE_URL:3000/api/health"
check "Portal security report"           "$BASE_URL:3000/api/security/report"

echo ""
echo "── Middleware ─────────────────────────────────────────────"
check "APISIX gateway"                   "$BASE_URL:9080/apisix/admin" "404"
check "OpenSearch cluster health"        "$BASE_URL:9200/_cluster/health"
check "Keycloak realm"                   "$BASE_URL:8080/realms/paygate"
check "Temporal UI"                      "$BASE_URL:8088"

echo ""
echo "── Billing Engine API (requires auth token) ───────────────"
# Test fee computation endpoint directly on billing-core
FEE_RESP=$(curl -s -X POST "$BASE_URL:8093/compute-fee" \
  -H "Content-Type: application/json" \
  -d '{"transaction_amount_kobo":1000000,"fee_rate":0.015,"fee_cap_kobo":200000,"fee_floor_kobo":0,"platform_share":0.65,"reseller_share":0.35,"interchange_cost_kobo":5000}' \
  --max-time 5 2>/dev/null || echo "")

if echo "$FEE_RESP" | grep -q "fee_kobo"; then
  echo "  ✓ Fee computation API (fee_kobo present in response)"
  PASS=$((PASS + 1))
else
  echo "  ✗ Fee computation API (unexpected response: $FEE_RESP)"
  FAIL=$((FAIL + 1))
fi

echo ""
echo "═══════════════════════════════════════════════════════════"
echo "  Results: $PASS passed, $FAIL failed"
echo "═══════════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  exit 1
fi
exit 0
