-- =============================================================================
-- PayGate Production Database Indexes
-- Run with: psql $DATABASE_URL -f infra/db/01_production_indexes.sql
-- All indexes use CONCURRENTLY to avoid locking production tables.
-- =============================================================================

-- ─── transactions ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_merchant_status_date
  ON transactions (merchant_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_merchant_channel_date
  ON transactions (merchant_id, channel, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_tx_status_date
  ON transactions (status, created_at DESC);

-- ─── audit_events ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_merchant_action_date
  ON audit_events (merchant_id, action, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_actor_date
  ON audit_events (actor_id, created_at DESC);

-- ─── settlements ──────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlements_status_sla
  ON settlements (status, sla_deadline ASC)
  WHERE status NOT IN ('settled', 'cancelled');

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_settlements_merchant_status
  ON settlements (merchant_id, status, created_at DESC);

-- ─── payouts ──────────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_merchant_status
  ON payouts (merchant_id, status, created_at DESC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_status_created
  ON payouts (status, created_at DESC)
  WHERE status IN ('pending_approval', 'pending', 'processing');

-- ─── fraud_alerts ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_merchant_status_score
  ON fraud_alerts (merchant_id, status, risk_score DESC);

-- ─── webhook_deliveries ───────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wh_delivery_webhook_status
  ON webhook_deliveries (webhook_id, status, next_retry_at ASC);

CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wh_delivery_retry
  ON webhook_deliveries (next_retry_at ASC)
  WHERE status IN ('failed', 'pending');

-- ─── wallet_transactions ──────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_wallet_date
  ON wallet_transactions (wallet_id, created_at DESC);

-- ─── cross_border_transfers ───────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_xborder_merchant_status
  ON cross_border_transfers (merchant_id, status, created_at DESC);

-- ─── nip_account_cache ────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_nip_cache_account_bank
  ON nip_account_cache (account_number, bank_code);

-- ─── idempotency_requests ─────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_created
  ON idempotency_requests (created_at ASC);

-- ─── subscriptions ────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_subscriptions_next_charge
  ON subscriptions (next_charge_at ASC)
  WHERE status = 'active';

-- ─── restaurant_orders ────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_restaurant_orders_merchant_status
  ON restaurant_orders (merchant_id, status, created_at DESC);

-- ─── inventory_items ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_inventory_low_stock
  ON inventory_items (merchant_id, current_stock, reorder_level)
  WHERE current_stock <= reorder_level;

-- ─── staff_shifts ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_staff_shifts_staff_date
  ON staff_shifts (staff_id, start_time DESC);

-- ─── payroll_runs ─────────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payroll_merchant_period
  ON payroll_runs (merchant_id, period DESC);

-- ─── purchase_orders ──────────────────────────────────────────────────────────
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_po_merchant_status
  ON purchase_orders (merchant_id, status, created_at DESC);

-- =============================================================================
-- Verify index creation
-- =============================================================================
SELECT
  schemaname,
  tablename,
  indexname,
  indexdef
FROM pg_indexes
WHERE schemaname = 'public'
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
