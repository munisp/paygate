#!/usr/bin/env bash
# PayGate Merchant Portal — Production Smoke Test Suite v21
# Run with: bash scripts/smoke-test.sh [BASE_URL]
# Default BASE_URL: http://localhost:3000

BASE="${1:-http://localhost:3000}"
PASS=0; FAIL=0

check() {
  local desc="$1" expected="$2"
  local actual
  actual=$(eval "$3" 2>/dev/null) || actual="ERROR"
  if [[ "$actual" == "$expected" ]]; then
    echo "  ✓ $desc"
    ((PASS++))
  else
    echo "  ✗ $desc (expected=$expected, got=$actual)"
    ((FAIL++))
  fi
}

echo "=== PayGate Smoke Tests v21 ==="
echo "Target: $BASE"
echo ""

# Core health
check "Health endpoint returns 200"           "200"         "curl -s -o /dev/null -w '%{http_code}' $BASE/api/health"
check "Frontend SPA served (200)"             "200"         "curl -s -o /dev/null -w '%{http_code}' $BASE/"
check "404 SPA fallback (200)"                "200"         "curl -s -o /dev/null -w '%{http_code}' $BASE/nonexistent-route"

# Auth protection
check "tRPC protected procedure returns 401"  "UNAUTHORIZED" "curl -s '$BASE/api/trpc/dashboard.overview?input=%7B%7D' | python3 -c \"import sys,json; d=json.load(sys.stdin); print(d['error']['json']['data']['code'])\" 2>/dev/null"
check "SSE transactions endpoint auth-gated"  "401"         "curl -s -o /dev/null -w '%{http_code}' $BASE/api/events/transactions"

# Security headers
check "CSP header present"                    "1"           "curl -s -I $BASE/ 2>/dev/null | grep -c 'Content-Security-Policy' || echo 0"
check "HSTS header present"                   "1"           "curl -s -I $BASE/ 2>/dev/null | grep -c 'Strict-Transport-Security' || echo 0"
check "X-Frame-Options present"               "1"           "curl -s -I $BASE/ 2>/dev/null | grep -c 'X-Frame-Options' || echo 0"
check "X-Content-Type-Options present"        "1"           "curl -s -I $BASE/ 2>/dev/null | grep -c 'X-Content-Type-Options' || echo 0"
check "Permissions-Policy present"            "1"           "curl -s -I $BASE/ 2>/dev/null | grep -c 'Permissions-Policy' || echo 0"

# Webhook validation
check "Stripe webhook rejects invalid sig"    "400"         "curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/stripe/webhook -H 'Content-Type: application/json' -d '{\"type\":\"test\"}'"
check "File upload rejects empty request"     "400"         "curl -s -o /dev/null -w '%{http_code}' -X POST $BASE/api/upload"

# Monitoring
check "Security report accessible"           "200"         "curl -s -o /dev/null -w '%{http_code}' $BASE/api/security/report"
check "Metrics endpoint accessible"          "200"         "curl -s -o /dev/null -w '%{http_code}' $BASE/api/metrics"

echo ""
echo "Results: $PASS passed, $FAIL failed out of $((PASS+FAIL)) tests"
if [[ $FAIL -eq 0 ]]; then
  echo "✓ ALL SMOKE TESTS PASSED"
  exit 0
else
  echo "✗ $FAIL SMOKE TEST(S) FAILED"
  exit 1
fi
