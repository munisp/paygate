#!/usr/bin/env bash
# ─── PayGate Unified Seed Runner ─────────────────────────────────────────────
# Runs all seed scripts in the correct dependency order.
# Usage: bash scripts/seed-all.sh [--env production|development]
# ─────────────────────────────────────────────────────────────────────────────
set -euo pipefail

ENV="${1:-development}"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"

# Load .env if present
if [ -f "$PROJECT_DIR/.env" ]; then
  set -a; source "$PROJECT_DIR/.env"; set +a
fi

# Colours
GREEN='\033[0;32m'; YELLOW='\033[1;33m'; RED='\033[0;31m'; NC='\033[0m'
PASS=0; FAIL=0; SKIP=0

log()  { echo -e "${GREEN}[SEED]${NC} $*"; }
warn() { echo -e "${YELLOW}[WARN]${NC} $*"; }
fail() { echo -e "${RED}[FAIL]${NC} $*"; }

run_seed() {
  local name="$1"; local script="$2"
  if [ ! -f "$SCRIPT_DIR/$script" ]; then
    warn "Script not found: $script — skipping"
    SKIP=$((SKIP+1)); return
  fi
  log "Running: $name ($script)..."
  if node "$SCRIPT_DIR/$script" 2>&1 | tail -5; then
    log "✓ $name complete"
    PASS=$((PASS+1))
  else
    fail "✗ $name failed"
    FAIL=$((FAIL+1))
  fi
}

run_sql() {
  local name="$1"; local script="$2"
  if [ ! -f "$SCRIPT_DIR/$script" ]; then
    warn "SQL not found: $script — skipping"
    SKIP=$((SKIP+1)); return
  fi
  log "Running SQL: $name ($script)..."
  if psql "${PG_DATABASE_URL:-postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev}" -f "$SCRIPT_DIR/$script" 2>&1 | tail -3; then
    log "✓ $name complete"
    PASS=$((PASS+1))
  else
    fail "✗ $name failed"
    FAIL=$((FAIL+1))
  fi
}

echo ""
echo "╔══════════════════════════════════════════════════════════╗"
echo "║        PayGate Unified Seed Runner — $ENV              ║"
echo "╚══════════════════════════════════════════════════════════╝"
echo ""

# ─── Phase 1: Bootstrap (users, merchants, base data) ────────────────────────
log "Phase 1: Bootstrap (users, merchants, base data)"
run_seed "Bootstrap" "seed-pg-bootstrap.mjs"

# ─── Phase 2: Core tables (transactions, customers, etc.) ────────────────────
log "Phase 2: Core tables"
run_seed "All tables" "seed-pg-all-tables.mjs"

# ─── Phase 3: Production data (realistic volumes) ────────────────────────────
log "Phase 3: Production data"
run_seed "Production data" "seed-production-data.mjs"
run_seed "Production complete" "seed-production-complete.mjs"

# ─── Phase 4: Admin data ─────────────────────────────────────────────────────
log "Phase 4: Admin data"
run_seed "Production admin" "seed-production-admin.mjs"

# ─── Phase 5: Wave-specific data ─────────────────────────────────────────────
log "Phase 5: Wave-specific data"
run_seed "Wave 24 (FX, cross-border)" "seed-wave24.mjs"
run_seed "Wave 25 (BNPL, lending)" "seed-wave25.mjs"
run_seed "Wave 30 (restaurant, POS)" "seed-wave30.mjs"

# ─── Phase 6: SQL migrations and indexes ─────────────────────────────────────
log "Phase 6: SQL indexes and partitioning"
run_sql  "Wave 32 all tables" "seed-wave32-all-tables.sql"

# ─── Summary ─────────────────────────────────────────────────────────────────
echo ""
echo "══════════════════════════════════════════════════════════"
echo "  Seed Summary: ${PASS} passed | ${FAIL} failed | ${SKIP} skipped"
echo "══════════════════════════════════════════════════════════"
echo ""

if [ "$FAIL" -gt 0 ]; then
  fail "Some seed scripts failed. Check output above."
  exit 1
fi

log "All seed scripts completed successfully!"
