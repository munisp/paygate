#!/usr/bin/env bash
# ─── PayGate Middleware Smoke Tests ──────────────────────────────────────────
# Tests all 13 middleware services + Go/Rust/Python microservices
# Usage: ./scripts/smoke-test-middleware.sh [--local | --docker | --k8s]
# Exit code: 0 = all pass, 1 = failures

set -euo pipefail

MODE="${1:---local}"
PASS=0
FAIL=0
SKIP=0
RESULTS=()

# ── Colors ────────────────────────────────────────────────────────────────────
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

# ── Helpers ───────────────────────────────────────────────────────────────────
pass() { echo -e "${GREEN}✓${NC} $1"; PASS=$((PASS+1)); RESULTS+=("PASS: $1"); }
fail() { echo -e "${RED}✗${NC} $1 — $2"; FAIL=$((FAIL+1)); RESULTS+=("FAIL: $1 — $2"); }
skip() { echo -e "${YELLOW}⊘${NC} $1 (skipped: $2)"; SKIP=$((SKIP+1)); RESULTS+=("SKIP: $1"); }
section() { echo -e "\n${BLUE}══ $1 ══${NC}"; }

http_check() {
  local name="$1" url="$2" expected="${3:-200}"
  local status
  status=$(curl -s -o /dev/null -w "%{http_code}" --max-time 5 "$url" 2>/dev/null || echo "000")
  if [[ "$status" == "$expected" ]]; then
    pass "$name (HTTP $status)"
  else
    fail "$name" "expected HTTP $expected, got $status at $url"
  fi
}

tcp_check() {
  local name="$1" host="$2" port="$3"
  if nc -z -w3 "$host" "$port" 2>/dev/null; then
    pass "$name (TCP $host:$port)"
  else
    fail "$name" "TCP connection refused at $host:$port"
  fi
}

cmd_check() {
  local name="$1"; shift
  if "$@" &>/dev/null; then
    pass "$name"
  else
    fail "$name" "command failed: $*"
  fi
}

# ── Base URLs (configurable per mode) ────────────────────────────────────────
case "$MODE" in
  --docker)
    KAFKA_HOST=localhost; KAFKA_PORT=9092
    REDIS_HOST=localhost; REDIS_PORT=6379
    POSTGRES_HOST=localhost; POSTGRES_PORT=5432
    OPENSEARCH_URL=http://localhost:9200
    KEYCLOAK_URL=http://localhost:8180
    PERMIFY_URL=http://localhost:3476
    TEMPORAL_HOST=localhost; TEMPORAL_PORT=7233
    TIGERBEETLE_URL=http://localhost:8200
    LAKEHOUSE_URL=http://localhost:8125
    GO_BRIDGE_URL=http://localhost:8090
    APISIX_URL=http://localhost:9080
    FLUVIO_HOST=localhost; FLUVIO_PORT=9003
    APP_URL=http://localhost:3000
    ;;
  --k8s)
    NS=paygate-middleware
    KAFKA_HOST=kafka-service.$NS.svc.cluster.local; KAFKA_PORT=9092
    REDIS_HOST=redis-service.$NS.svc.cluster.local; REDIS_PORT=6379
    POSTGRES_HOST=postgres-service.$NS.svc.cluster.local; POSTGRES_PORT=5432
    OPENSEARCH_URL=http://opensearch-service.$NS.svc.cluster.local:9200
    KEYCLOAK_URL=http://keycloak-service.$NS.svc.cluster.local:8080
    PERMIFY_URL=http://permify-service.$NS.svc.cluster.local:3476
    TEMPORAL_HOST=temporal-service.$NS.svc.cluster.local; TEMPORAL_PORT=7233
    TIGERBEETLE_URL=http://tigerbeetle-service.$NS.svc.cluster.local:8200
    LAKEHOUSE_URL=http://lakehouse-service.$NS.svc.cluster.local:8125
    GO_BRIDGE_URL=http://go-bridge-service.$NS.svc.cluster.local:8080
    APISIX_URL=http://apisix.$NS.svc.cluster.local:9080
    FLUVIO_HOST=fluvio-sc.$NS.svc.cluster.local; FLUVIO_PORT=9003
    APP_URL=http://paygate-app-service.paygate-app.svc.cluster.local:3000
    ;;
  *)  # --local (default)
    KAFKA_HOST=localhost; KAFKA_PORT=9092
    REDIS_HOST=localhost; REDIS_PORT=6379
    POSTGRES_HOST=localhost; POSTGRES_PORT=5432
    OPENSEARCH_URL=http://localhost:9200
    KEYCLOAK_URL=http://localhost:8180
    PERMIFY_URL=http://localhost:3476
    TEMPORAL_HOST=localhost; TEMPORAL_PORT=7233
    TIGERBEETLE_URL=http://localhost:8200
    LAKEHOUSE_URL=http://localhost:8125
    GO_BRIDGE_URL=http://localhost:8090
    APISIX_URL=http://localhost:9080
    FLUVIO_HOST=localhost; FLUVIO_PORT=9003
    APP_URL=http://localhost:3000
    ;;
esac

echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  PayGate Middleware Smoke Tests  (mode: $MODE)${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"
echo "Started: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"

# ─── 1. Kafka ─────────────────────────────────────────────────────────────────
section "1. Kafka"
tcp_check "Kafka broker reachable" "$KAFKA_HOST" "$KAFKA_PORT"
if command -v kafka-topics &>/dev/null; then
  cmd_check "Kafka list topics" kafka-topics --bootstrap-server "$KAFKA_HOST:$KAFKA_PORT" --list
else
  skip "Kafka topic list" "kafka-topics CLI not installed"
fi

# ─── 2. Redis ─────────────────────────────────────────────────────────────────
section "2. Redis"
tcp_check "Redis reachable" "$REDIS_HOST" "$REDIS_PORT"
if command -v redis-cli &>/dev/null; then
  REDIS_PONG=$(redis-cli -h "$REDIS_HOST" -p "$REDIS_PORT" -a "${REDIS_PASSWORD:?REDIS_PASSWORD must be set — no hardcoded default allowed}" ping 2>/dev/null || echo "FAIL")
  if [[ "$REDIS_PONG" == "PONG" ]]; then
    pass "Redis PING/PONG"
  else
    fail "Redis PING/PONG" "expected PONG, got $REDIS_PONG"
  fi
else
  skip "Redis PING" "redis-cli not installed"
fi

# ─── 3. PostgreSQL ────────────────────────────────────────────────────────────
section "3. PostgreSQL"
tcp_check "PostgreSQL reachable" "$POSTGRES_HOST" "$POSTGRES_PORT"
if command -v psql &>/dev/null; then
  cmd_check "PostgreSQL query" psql "postgresql://paygate:${POSTGRES_PASSWORD:?POSTGRES_PASSWORD must be set — no hardcoded default allowed}@$POSTGRES_HOST:$POSTGRES_PORT/paygate" -c "SELECT 1"
else
  skip "PostgreSQL query" "psql not installed"
fi

# ─── 4. OpenSearch ────────────────────────────────────────────────────────────
section "4. OpenSearch"
http_check "OpenSearch cluster health" "$OPENSEARCH_URL/_cluster/health"
http_check "OpenSearch paygate-transactions index" "$OPENSEARCH_URL/paygate-transactions"
http_check "OpenSearch paygate-crossborder index" "$OPENSEARCH_URL/paygate-crossborder"

# ─── 5. Keycloak ──────────────────────────────────────────────────────────────
section "5. Keycloak"
http_check "Keycloak master realm" "$KEYCLOAK_URL/realms/master/.well-known/openid-configuration"
http_check "Keycloak paygate realm" "$KEYCLOAK_URL/realms/paygate/.well-known/openid-configuration"

# ─── 6. Permify ───────────────────────────────────────────────────────────────
section "6. Permify"
http_check "Permify health" "$PERMIFY_URL/healthz"

# ─── 7. Temporal ──────────────────────────────────────────────────────────────
section "7. Temporal"
tcp_check "Temporal gRPC reachable" "$TEMPORAL_HOST" "$TEMPORAL_PORT"
if command -v tctl &>/dev/null; then
  cmd_check "Temporal cluster health" tctl --address "$TEMPORAL_HOST:$TEMPORAL_PORT" cluster health
else
  skip "Temporal tctl check" "tctl not installed"
fi

# ─── 8. TigerBeetle Ledger ────────────────────────────────────────────────────
section "8. TigerBeetle Ledger (Rust)"
http_check "TigerBeetle health" "$TIGERBEETLE_URL/health"
http_check "TigerBeetle stats" "$TIGERBEETLE_URL/stats"

# ─── 9. Lakehouse (Python) ────────────────────────────────────────────────────
section "9. Lakehouse (Python)"
http_check "Lakehouse health" "$LAKEHOUSE_URL/health"
http_check "Lakehouse tables" "$LAKEHOUSE_URL/tables"

# ─── 10. Go Bridge ────────────────────────────────────────────────────────────
section "10. Go Bridge"
http_check "Go Bridge health" "$GO_BRIDGE_URL/health"
http_check "Go Bridge Kafka status" "$GO_BRIDGE_URL/kafka/status"
http_check "Go Bridge Temporal status" "$GO_BRIDGE_URL/temporal/status"
http_check "Go Bridge Redis status" "$GO_BRIDGE_URL/redis/status"
http_check "Go Bridge TigerBeetle status" "$GO_BRIDGE_URL/tigerbeetle/status"
http_check "Go Bridge Keycloak status" "$GO_BRIDGE_URL/keycloak/status"
http_check "Go Bridge Permify status" "$GO_BRIDGE_URL/permify/status"

# ─── 11. APISIX ───────────────────────────────────────────────────────────────
section "11. APISIX Gateway"
http_check "APISIX proxy" "$APISIX_URL" "404"  # 404 is expected with no route matched
http_check "APISIX admin API" "${APISIX_URL/9080/9180}/apisix/admin/routes"

# ─── 12. Fluvio ───────────────────────────────────────────────────────────────
section "12. Fluvio"
tcp_check "Fluvio SC reachable" "$FLUVIO_HOST" "$FLUVIO_PORT"

# ─── 13. Application tRPC API ─────────────────────────────────────────────────
section "13. PayGate Application"
http_check "App server health" "$APP_URL/api/health" "200"
http_check "App tRPC endpoint" "$APP_URL/api/trpc" "400"  # 400 = missing procedure (expected)

# ─── 14. Go Microservices ─────────────────────────────────────────────────────
section "14. Go Microservices"
if [[ -f /home/ubuntu/paygate-merchant-portal/go-services/mojaloop-fspiop-adapter/bin/adapter ]]; then
  pass "Mojaloop FSPIOP adapter binary exists"
else
  skip "Mojaloop FSPIOP adapter binary" "not built yet (run: make build-go)"
fi
if [[ -f /home/ubuntu/paygate-merchant-portal/go-services/cips-gateway/bin/gateway ]]; then
  pass "CIPS gateway binary exists"
else
  skip "CIPS gateway binary" "not built yet"
fi
if [[ -f /home/ubuntu/paygate-merchant-portal/go-services/upi-gateway/bin/gateway ]]; then
  pass "UPI gateway binary exists"
else
  skip "UPI gateway binary" "not built yet"
fi
if [[ -f /home/ubuntu/paygate-merchant-portal/go-services/pix-gateway/bin/gateway ]]; then
  pass "PIX gateway binary exists"
else
  skip "PIX gateway binary" "not built yet"
fi

# ─── 15. Rust Microservices ───────────────────────────────────────────────────
section "15. Rust Microservices"
if [[ -f /home/ubuntu/paygate-merchant-portal/rust-services/cross-border-fraud-engine/target/release/cross_border_fraud_engine ]]; then
  pass "Cross-border fraud engine binary exists"
else
  skip "Cross-border fraud engine binary" "not built yet (run: make build-rust)"
fi
if [[ -f /home/ubuntu/paygate-merchant-portal/rust-services/tigerbeetle-ledger/target/release/tigerbeetle_ledger ]]; then
  pass "TigerBeetle ledger binary exists"
else
  skip "TigerBeetle ledger binary" "not built yet"
fi

# ─── 16. Python Microservices ─────────────────────────────────────────────────
section "16. Python Microservices"
cmd_check "Python FX service syntax" python3 -m py_compile \
  /home/ubuntu/paygate-merchant-portal/python-services/cips-upi-pix-fx/main.py
cmd_check "Python OpenSearch service syntax" python3 -m py_compile \
  /home/ubuntu/paygate-merchant-portal/python-services/opensearch-service/main.py
cmd_check "Python Lakehouse ingestion syntax" python3 -m py_compile \
  /home/ubuntu/paygate-merchant-portal/python-services/lakehouse-v2/crossborder_ingestion.py

# ─── 17. Docker Compose files ─────────────────────────────────────────────────
section "17. Infrastructure Files"
[[ -f /home/ubuntu/paygate-merchant-portal/docker/docker-compose.middleware.yml ]] && \
  pass "docker-compose.middleware.yml exists" || fail "docker-compose.middleware.yml" "file missing"
[[ -f /home/ubuntu/paygate-merchant-portal/k8s/middleware-stack.yaml ]] && \
  pass "k8s/middleware-stack.yaml exists" || fail "k8s/middleware-stack.yaml" "file missing"
if command -v docker &>/dev/null; then
  cmd_check "Docker Compose YAML valid" docker compose \
    -f /home/ubuntu/paygate-merchant-portal/docker/docker-compose.middleware.yml config --quiet
else
  skip "Docker Compose YAML validation" "docker not installed"
fi

# ─── Summary ──────────────────────────────────────────────────────────────────
TOTAL=$((PASS+FAIL+SKIP))
echo ""
echo -e "${BLUE}╔══════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║  Smoke Test Results                                  ║${NC}"
echo -e "${BLUE}╠══════════════════════════════════════════════════════╣${NC}"
echo -e "${BLUE}║${NC}  Total:  $TOTAL"
echo -e "${BLUE}║${NC}  ${GREEN}Pass:   $PASS${NC}"
echo -e "${BLUE}║${NC}  ${RED}Fail:   $FAIL${NC}"
echo -e "${BLUE}║${NC}  ${YELLOW}Skip:   $SKIP${NC}"
echo -e "${BLUE}╚══════════════════════════════════════════════════════╝${NC}"

# Write results to file
REPORT_FILE="/tmp/smoke-test-$(date +%Y%m%d-%H%M%S).txt"
{
  echo "PayGate Middleware Smoke Test Report"
  echo "Mode: $MODE"
  echo "Date: $(date -u '+%Y-%m-%dT%H:%M:%SZ')"
  echo "Total: $TOTAL | Pass: $PASS | Fail: $FAIL | Skip: $SKIP"
  echo ""
  for r in "${RESULTS[@]}"; do echo "$r"; done
} > "$REPORT_FILE"
echo "Report saved: $REPORT_FILE"

if [[ $FAIL -gt 0 ]]; then
  echo -e "\n${RED}Some tests failed. Check services are running.${NC}"
  exit 1
else
  echo -e "\n${GREEN}All reachable services passed!${NC}"
  exit 0
fi
