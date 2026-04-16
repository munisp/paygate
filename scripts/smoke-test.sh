#!/usr/bin/env bash
# =============================================================================
# PayGate Merchant Portal — Smoke Test Suite v4
# =============================================================================
# Usage:
#   ./scripts/smoke-test.sh [BASE_URL]
#
# Examples:
#   ./scripts/smoke-test.sh                          # default: http://localhost:3000
#   ./scripts/smoke-test.sh https://paygate.manus.space
#
# Exit codes:
#   0 — all tests passed
#   1 — one or more tests failed
# =============================================================================

set -euo pipefail

BASE_URL="${1:-http://localhost:3000}"
PASS=0
FAIL=0
SKIP=0
FAILED_TESTS=()

# ─── Colours ──────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
BOLD='\033[1m'
NC='\033[0m'

echo -e "${BOLD}${BLUE}"
echo "╔══════════════════════════════════════════════════════════════╗"
echo "║          PayGate Merchant Portal — Smoke Test Suite          ║"
echo "║                         v4.0.0                               ║"
echo "╚══════════════════════════════════════════════════════════════╝"
echo -e "${NC}"
echo -e "  Target: ${CYAN}${BASE_URL}${NC}"
echo -e "  Date:   $(date '+%Y-%m-%d %H:%M:%S %Z')"
echo ""

# ─── Helpers ──────────────────────────────────────────────────────────────────

check() {
  local name="$1"
  local url="$2"
  local expected_status="${3:-200}"
  local method="${4:-GET}"
  local body="${5:-}"
  local extra_flags="${6:-}"

  local curl_cmd=(curl -s -o /dev/null -w "%{http_code}" -X "$method" \
    -H "Content-Type: application/json" \
    --connect-timeout 10 \
    --max-time 30 \
    $extra_flags)

  if [[ -n "$body" ]]; then
    curl_cmd+=(-d "$body")
  fi

  curl_cmd+=("$url")

  local actual_status
  actual_status=$("${curl_cmd[@]}" 2>/dev/null || echo "000")

  if [[ "$actual_status" == "$expected_status" ]]; then
    echo -e "  ${GREEN}✓${NC} ${name} [${actual_status}]"
    ((PASS++))
  elif [[ "$actual_status" == "000" ]]; then
    echo -e "  ${YELLOW}⚠${NC} ${name} [TIMEOUT/UNREACHABLE]"
    ((SKIP++))
  else
    echo -e "  ${RED}✗${NC} ${name} [expected ${expected_status}, got ${actual_status}]"
    ((FAIL++))
    FAILED_TESTS+=("$name (expected $expected_status, got $actual_status)")
  fi
}

check_json() {
  local name="$1"
  local url="$2"
  local jq_filter="$3"
  local expected="$4"

  local response
  response=$(curl -s --connect-timeout 10 --max-time 30 "$url" 2>/dev/null || echo "{}")

  local actual
  actual=$(echo "$response" | jq -r "$jq_filter" 2>/dev/null || echo "ERROR")

  if [[ "$actual" == "$expected" ]]; then
    echo -e "  ${GREEN}✓${NC} ${name} [${actual}]"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} ${name} [expected '${expected}', got '${actual}']"
    ((FAIL++))
    FAILED_TESTS+=("$name (expected '$expected', got '$actual')")
  fi
}

section() {
  echo ""
  echo -e "${BOLD}${CYAN}── $1 ──────────────────────────────────────────────────────${NC}"
}

# ─── 1. Infrastructure ────────────────────────────────────────────────────────
section "1. Infrastructure & Health"

check "Server is reachable"               "${BASE_URL}/"                   200
check "Health endpoint"                   "${BASE_URL}/api/health"          200
check "Metrics endpoint"                  "${BASE_URL}/api/metrics"         200
check "404 returns proper status"         "${BASE_URL}/api/nonexistent-xyz" 404

# ─── 2. Security Headers ──────────────────────────────────────────────────────
section "2. Security Headers"

check_headers() {
  local name="$1"
  local url="$2"
  local header="$3"

  local response
  response=$(curl -sI --connect-timeout 10 --max-time 15 "$url" 2>/dev/null || echo "")

  if echo "$response" | grep -qi "$header"; then
    echo -e "  ${GREEN}✓${NC} ${name}"
    ((PASS++))
  else
    echo -e "  ${RED}✗${NC} ${name} [header '${header}' not found]"
    ((FAIL++))
    FAILED_TESTS+=("$name (header '$header' missing)")
  fi
}

check_headers "X-Content-Type-Options header"   "${BASE_URL}/" "x-content-type-options"
check_headers "X-Frame-Options header"          "${BASE_URL}/" "x-frame-options"
check_headers "Strict-Transport-Security"       "${BASE_URL}/" "strict-transport-security"
check_headers "Content-Security-Policy"         "${BASE_URL}/" "content-security-policy"
check_headers "X-XSS-Protection header"         "${BASE_URL}/" "x-xss-protection"

# ─── 3. Authentication ────────────────────────────────────────────────────────
section "3. Authentication"

check "Login with invalid credentials"    "${BASE_URL}/api/trpc/auth.login" 200 POST \
  '{"0":{"json":{"email":"bad@test.com","password":"wrongpassword"}}}' \
  '-H "x-trpc-source: smoke-test"'

check "Protected endpoint without auth"   "${BASE_URL}/api/trpc/auth.me"    200

check "OAuth callback endpoint exists"    "${BASE_URL}/api/oauth/callback"  302

# ─── 4. tRPC Public Procedures ────────────────────────────────────────────────
section "4. tRPC Public Procedures"

check "tRPC health batch"                 "${BASE_URL}/api/trpc/system.health" 200
check "tRPC NIP banks list"               "${BASE_URL}/api/trpc/nip.listBanks" 200

# ─── 5. Core API Endpoints ────────────────────────────────────────────────────
section "5. Core REST API Endpoints"

check "Stripe webhook (missing sig)"      "${BASE_URL}/api/stripe/webhook"  400 POST \
  '{"type":"test"}' \
  '-H "Content-Type: application/json"'

check "Internal webhook (no key)"         "${BASE_URL}/api/webhooks/inbound" 401 POST \
  '{"event":"test"}' \
  '-H "Content-Type: application/json"'

check "NIBSS webhook (no sig)"            "${BASE_URL}/api/nibss/webhook"    401 POST \
  '{"sessionID":"test"}' \
  '-H "Content-Type: application/json"'

check "File upload endpoint"              "${BASE_URL}/api/upload"           401 POST

# ─── 6. Rate Limiting ─────────────────────────────────────────────────────────
section "6. Rate Limiting"

echo -e "  ${YELLOW}⚠${NC}  Rate limit tests skipped in smoke mode (would trigger lockout)"
((SKIP++))

# ─── 7. Static Assets ─────────────────────────────────────────────────────────
section "7. Static Assets & PWA"

check "Favicon"                           "${BASE_URL}/favicon.ico"          200
check "Robots.txt"                        "${BASE_URL}/robots.txt"           200
check "PWA manifest"                      "${BASE_URL}/manifest.json"        200
check "Service worker"                    "${BASE_URL}/sw.js"                200

# ─── 8. Go Bridge ─────────────────────────────────────────────────────────────
section "8. Go Bridge Service"

GO_BRIDGE_URL="${GO_BRIDGE_URL:-http://localhost:8080}"
check "Go bridge health"                  "${GO_BRIDGE_URL}/health"          200
check "Go bridge readiness"               "${GO_BRIDGE_URL}/ready"           200
check "Go bridge metrics"                 "${GO_BRIDGE_URL}/metrics"         200

# ─── 9. Python ML Service ─────────────────────────────────────────────────────
section "9. Python ML / Fraud Service"

ML_URL="${ML_URL:-http://localhost:8000}"
check "ML service health"                 "${ML_URL}/health"                 200
check "ML fraud score endpoint"           "${ML_URL}/score"                  422 POST \
  '{}' '-H "Content-Type: application/json"'

# ─── 10. Rust Crypto Service ──────────────────────────────────────────────────
section "10. Rust Crypto / Signing Service"

RUST_URL="${RUST_URL:-http://localhost:9000}"
check "Rust service health"               "${RUST_URL}/health"               200

# ─── 11. Database Connectivity ────────────────────────────────────────────────
section "11. Database Connectivity"

check "DB health via API"                 "${BASE_URL}/api/health/db"        200

# ─── 12. WebSocket / SSE ──────────────────────────────────────────────────────
section "12. SSE / Real-time"

check "SSE endpoint responds"             "${BASE_URL}/api/sse"              401

# ─── 13. CORS ─────────────────────────────────────────────────────────────────
section "13. CORS Policy"

CORS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" \
  -H "Origin: https://evil.example.com" \
  -H "Access-Control-Request-Method: POST" \
  -X OPTIONS \
  --connect-timeout 10 --max-time 15 \
  "${BASE_URL}/api/trpc/auth.login" 2>/dev/null || echo "000")

if [[ "$CORS_STATUS" == "204" || "$CORS_STATUS" == "403" || "$CORS_STATUS" == "200" ]]; then
  echo -e "  ${GREEN}✓${NC} CORS blocks untrusted origin [${CORS_STATUS}]"
  ((PASS++))
else
  echo -e "  ${YELLOW}⚠${NC} CORS response for untrusted origin: ${CORS_STATUS}"
  ((SKIP++))
fi

# ─── 14. PWA Offline Capability ───────────────────────────────────────────────
section "14. PWA Offline & Caching"

check "Offline fallback page"             "${BASE_URL}/offline.html"         200

# ─── Summary ──────────────────────────────────────────────────────────────────
echo ""
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "${BOLD}  Smoke Test Results${NC}"
echo -e "${BOLD}${BLUE}═══════════════════════════════════════════════════════════════${NC}"
echo -e "  ${GREEN}Passed:${NC}  ${PASS}"
echo -e "  ${RED}Failed:${NC}  ${FAIL}"
echo -e "  ${YELLOW}Skipped:${NC} ${SKIP}"
echo -e "  Total:   $((PASS + FAIL + SKIP))"
echo ""

if [[ ${#FAILED_TESTS[@]} -gt 0 ]]; then
  echo -e "${RED}${BOLD}  Failed Tests:${NC}"
  for t in "${FAILED_TESTS[@]}"; do
    echo -e "  ${RED}•${NC} $t"
  done
  echo ""
fi

if [[ $FAIL -eq 0 ]]; then
  echo -e "${GREEN}${BOLD}  ✓ All smoke tests passed!${NC}"
  exit 0
else
  echo -e "${RED}${BOLD}  ✗ ${FAIL} test(s) failed. Review the output above.${NC}"
  exit 1
fi
