-- ============================================================================
-- PayGate PostgreSQL Performance Tuning Script
-- Target: PostgreSQL 15 on production hardware (8GB+ RAM, SSD storage)
-- Generated: 2026-04-16
-- Apply with: psql -h HOST -U paygate -d paygate_prod -f postgres-performance-tuning.sql
-- ============================================================================

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 1: MISSING COMPOSITE INDEXES (HIGH IMPACT)
-- These cover the most common query patterns in the PayGate application.
-- Each index is created CONCURRENTLY to avoid locking production tables.
-- ─────────────────────────────────────────────────────────────────────────────

-- transactions: merchant + status + created_at (dashboard list, analytics)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_merchant_status_created
  ON transactions (merchant_id, status, created_at DESC);

-- transactions: tenant + created_at (tenant-scoped time-range queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_tenant_created
  ON transactions (tenant_id, created_at DESC);

-- transactions: merchant + amount (high-value transaction reports)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_merchant_amount
  ON transactions (merchant_id, amount DESC);

-- transactions: partial index for pending/processing (hot path for retry logic)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_pending
  ON transactions (merchant_id, created_at DESC)
  WHERE status IN ('pending', 'processing');

-- wallet_transactions: wallet + type + created_at (wallet statement)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_wallet_type_created
  ON wallet_transactions (wallet_id, type, created_at DESC);

-- wallet_transactions: merchant + created_at (merchant reconciliation)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallet_tx_merchant_created
  ON wallet_transactions (merchant_id, created_at DESC);

-- wallets: currency + balance (multi-currency balance queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_wallets_currency_balance
  ON wallets (merchant_id, currency, balance DESC);

-- payouts: merchant + status + created_at (payout dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_merchant_status_created
  ON payouts (merchant_id, status, created_at DESC);

-- payouts: scheduled_at (settlement scheduler)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_scheduled_at
  ON payouts (scheduled_at)
  WHERE status = 'pending';

-- disputes: merchant + status + created_at (dispute management)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_merchant_status_created
  ON disputes (merchant_id, status, created_at DESC);

-- disputes: due_date (SLA monitoring — disputes due soon)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_disputes_due_date
  ON disputes (due_date)
  WHERE status NOT IN ('resolved', 'closed');

-- fraud_alerts: merchant + severity + created_at (fraud dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_merchant_riskscore_created
  ON fraud_alerts (merchant_id, risk_score DESC, created_at DESC);

-- fraud_alerts: transaction_id (fraud → transaction join)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_fraud_transaction_id
  ON fraud_alerts (transaction_id);

-- merchant_notifications: merchant + is_read + created_at (notification feed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_merchant_unread_created
  ON merchant_notifications (merchant_id, is_read, created_at DESC);

-- merchant_notifications: merchant + type + created_at (filtered feed)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_merchant_type_created
  ON merchant_notifications (merchant_id, type, created_at DESC);

-- merchant_notifications: partial index for unread (badge count)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_unread_partial
  ON merchant_notifications (merchant_id)
  WHERE is_read = false AND dismissed_at IS NULL;

-- webhook_deliveries: status + next_retry_at (retry worker — hot path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_retry_worker
  ON webhook_deliveries (status, next_retry_at)
  WHERE status IN ('pending', 'failed') AND attempt_count < 5;

-- webhook_deliveries: webhook_id + created_at (delivery history)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_webhook_delivery_history
  ON webhook_deliveries (webhook_id, created_at DESC);

-- audit_events: merchant + created_at + action (audit log queries)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_audit_merchant_created_action
  ON audit_events (merchant_id, created_at DESC, action);

-- kyc_submissions: merchant + status + created_at (KYC dashboard)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyc_merchant_status_created
  ON kyc_submissions (merchant_id, status, created_at DESC);

-- kyb_verifications: merchant + status (KYB pipeline)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_kyb_merchant_status
  ON kyb_verifications (merchant_id, status);

-- api_keys: key_hash (API authentication — extremely hot path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_api_keys_hash
  ON api_keys (key_hash)
  WHERE revoked_at IS NULL;

-- users: open_id (OAuth login lookup)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_users_open_id
  ON users (open_id);

-- merchants: owner_id (merchant lookup by user)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_merchants_owner
  ON merchants (owner_id);

-- idempotency_requests: key + merchant_id (idempotency check — hot path)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_key_merchant
  ON idempotency_requests (idempotency_key, merchant_id);

-- idempotency_requests: expires_at (cleanup job)
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_idempotency_expires
  ON idempotency_requests (expires_at)
  WHERE expires_at IS NOT NULL;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 2: COVERING INDEXES (AVOID HEAP FETCHES)
-- Index-only scans eliminate heap access for the most frequent read patterns.
-- ─────────────────────────────────────────────────────────────────────────────

-- Transaction list page: all columns needed for the list view
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_txn_list_covering
  ON transactions (merchant_id, created_at DESC)
  INCLUDE (id, reference, amount, currency, status, type);

-- Notification feed: all columns needed for the feed card
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_notif_feed_covering
  ON merchant_notifications (merchant_id, created_at DESC)
  INCLUDE (id, type, title, body, is_read, priority, action_url);

-- Payout list: covering index for payout dashboard
CREATE INDEX CONCURRENTLY IF NOT EXISTS idx_payouts_list_covering
  ON payouts (merchant_id, created_at DESC)
  INCLUDE (id, reference, amount, currency, status, scheduled_at);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 3: STATISTICS TARGETS (BETTER QUERY PLANS)
-- Increase statistics for high-cardinality columns used in WHERE/JOIN clauses.
-- ─────────────────────────────────────────────────────────────────────────────

ALTER TABLE transactions ALTER COLUMN merchant_id SET STATISTICS 500;
ALTER TABLE transactions ALTER COLUMN status SET STATISTICS 200;
ALTER TABLE transactions ALTER COLUMN created_at SET STATISTICS 500;
ALTER TABLE transactions ALTER COLUMN amount SET STATISTICS 300;

ALTER TABLE wallet_transactions ALTER COLUMN wallet_id SET STATISTICS 500;
ALTER TABLE wallet_transactions ALTER COLUMN merchant_id SET STATISTICS 500;
ALTER TABLE wallet_transactions ALTER COLUMN created_at SET STATISTICS 500;

ALTER TABLE merchant_notifications ALTER COLUMN merchant_id SET STATISTICS 300;
ALTER TABLE merchant_notifications ALTER COLUMN type SET STATISTICS 200;

ALTER TABLE fraud_alerts ALTER COLUMN merchant_id SET STATISTICS 300;
ALTER TABLE fraud_alerts ALTER COLUMN status SET STATISTICS 200;

ALTER TABLE webhook_deliveries ALTER COLUMN status SET STATISTICS 200;
ALTER TABLE webhook_deliveries ALTER COLUMN next_retry_at SET STATISTICS 300;

-- Refresh statistics after changes
ANALYZE transactions;
ANALYZE wallet_transactions;
ANALYZE merchant_notifications;
ANALYZE fraud_alerts;
ANALYZE webhook_deliveries;
ANALYZE payouts;
ANALYZE disputes;
ANALYZE audit_events;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 4: AUTOVACUUM TUNING (PER TABLE)
-- High-write tables need more aggressive autovacuum to prevent bloat.
-- ─────────────────────────────────────────────────────────────────────────────

-- transactions: very high write rate — vacuum more aggressively
ALTER TABLE transactions SET (
  autovacuum_vacuum_scale_factor = 0.01,    -- vacuum after 1% dead tuples
  autovacuum_analyze_scale_factor = 0.005,  -- analyze after 0.5% changes
  autovacuum_vacuum_cost_delay = 2,         -- less throttling
  autovacuum_vacuum_threshold = 100,
  autovacuum_analyze_threshold = 50
);

-- wallet_transactions: high write rate
ALTER TABLE wallet_transactions SET (
  autovacuum_vacuum_scale_factor = 0.01,
  autovacuum_analyze_scale_factor = 0.005,
  autovacuum_vacuum_cost_delay = 2
);

-- merchant_notifications: moderate write, frequent deletes (dismiss)
ALTER TABLE merchant_notifications SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 5
);

-- webhook_deliveries: status updates cause many dead tuples
ALTER TABLE webhook_deliveries SET (
  autovacuum_vacuum_scale_factor = 0.02,
  autovacuum_analyze_scale_factor = 0.01,
  autovacuum_vacuum_cost_delay = 2
);

-- audit_events: append-only, analyze less frequently
ALTER TABLE audit_events SET (
  autovacuum_vacuum_scale_factor = 0.05,
  autovacuum_analyze_scale_factor = 0.02
);

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 5: TABLE PARTITIONING SETUP
-- Partition the two largest tables by time for query pruning and archival.
-- NOTE: This is a migration plan — run during a maintenance window.
-- ─────────────────────────────────────────────────────────────────────────────

-- Partitioned transactions table (range by created_at month)
-- Step 1: Create partitioned table
CREATE TABLE IF NOT EXISTS transactions_partitioned (
  LIKE transactions INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Step 2: Create monthly partitions (2025-01 through 2026-12)
DO $$
DECLARE
  y INT;
  m INT;
  start_date DATE;
  end_date DATE;
  partition_name TEXT;
BEGIN
  FOR y IN 2025..2026 LOOP
    FOR m IN 1..12 LOOP
      start_date := make_date(y, m, 1);
      end_date   := start_date + INTERVAL '1 month';
      partition_name := format('transactions_p%s_%s', y, lpad(m::text, 2, '0'));
      IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF transactions_partitioned
           FOR VALUES FROM (%L) TO (%L)',
          partition_name, start_date, end_date
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

-- Default partition for future data
CREATE TABLE IF NOT EXISTS transactions_p_default
  PARTITION OF transactions_partitioned DEFAULT;

-- Partitioned audit_events table (range by created_at month)
CREATE TABLE IF NOT EXISTS audit_events_partitioned (
  LIKE audit_events INCLUDING ALL
) PARTITION BY RANGE (created_at);

DO $$
DECLARE
  y INT;
  m INT;
  start_date DATE;
  end_date DATE;
  partition_name TEXT;
BEGIN
  FOR y IN 2025..2026 LOOP
    FOR m IN 1..12 LOOP
      start_date := make_date(y, m, 1);
      end_date   := start_date + INTERVAL '1 month';
      partition_name := format('audit_events_p%s_%s', y, lpad(m::text, 2, '0'));
      IF NOT EXISTS (
        SELECT 1 FROM pg_class WHERE relname = partition_name
      ) THEN
        EXECUTE format(
          'CREATE TABLE IF NOT EXISTS %I PARTITION OF audit_events_partitioned
           FOR VALUES FROM (%L) TO (%L)',
          partition_name, start_date, end_date
        );
      END IF;
    END LOOP;
  END LOOP;
END $$;

CREATE TABLE IF NOT EXISTS audit_events_p_default
  PARTITION OF audit_events_partitioned DEFAULT;

-- Enable partition-wise operations for the planner
-- (Set in postgresql.conf: enable_partitionwise_join = on, enable_partitionwise_aggregate = on)

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 6: SLOW QUERY MONITORING VIEWS
-- ─────────────────────────────────────────────────────────────────────────────

-- Enable pg_stat_statements extension (run as superuser)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- View: top 20 slowest queries by total execution time
CREATE OR REPLACE VIEW v_slow_queries AS
SELECT
  round(total_exec_time::numeric, 2)   AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)    AS mean_ms,
  round(stddev_exec_time::numeric, 2)  AS stddev_ms,
  round((100 * total_exec_time / sum(total_exec_time) OVER ())::numeric, 2) AS pct_total,
  left(query, 120)                     AS query_snippet
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 20;

-- View: tables with most dead tuples (bloat candidates)
CREATE OR REPLACE VIEW v_table_bloat AS
SELECT
  schemaname,
  relname AS table_name,
  n_live_tup,
  n_dead_tup,
  round(100.0 * n_dead_tup / NULLIF(n_live_tup + n_dead_tup, 0), 2) AS dead_pct,
  last_vacuum,
  last_autovacuum,
  last_analyze,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY n_dead_tup DESC;

-- View: index usage statistics (find unused indexes)
CREATE OR REPLACE VIEW v_index_usage AS
SELECT
  schemaname,
  relname AS table_name,
  indexrelname AS index_name,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch,
  pg_size_pretty(pg_relation_size(indexrelid)) AS index_size
FROM pg_stat_user_indexes
ORDER BY idx_scan ASC, pg_relation_size(indexrelid) DESC;

-- View: cache hit ratio (should be > 99% in production)
CREATE OR REPLACE VIEW v_cache_hit_ratio AS
SELECT
  'index hit rate' AS name,
  round(100.0 * sum(idx_blks_hit) / NULLIF(sum(idx_blks_hit) + sum(idx_blks_read), 0), 2) AS ratio
FROM pg_statio_user_indexes
UNION ALL
SELECT
  'table hit rate',
  round(100.0 * sum(heap_blks_hit) / NULLIF(sum(heap_blks_hit) + sum(heap_blks_read), 0), 2)
FROM pg_statio_user_tables;

-- View: long-running queries (> 5 seconds)
CREATE OR REPLACE VIEW v_long_running_queries AS
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state,
  wait_event_type,
  wait_event
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > INTERVAL '5 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- View: lock contention
CREATE OR REPLACE VIEW v_lock_contention AS
SELECT
  blocked_locks.pid     AS blocked_pid,
  blocked_activity.usename AS blocked_user,
  blocking_locks.pid    AS blocking_pid,
  blocking_activity.usename AS blocking_user,
  blocked_activity.query AS blocked_statement,
  blocking_activity.query AS current_statement_in_blocking_process
FROM pg_catalog.pg_locks blocked_locks
JOIN pg_catalog.pg_stat_activity blocked_activity ON blocked_activity.pid = blocked_locks.pid
JOIN pg_catalog.pg_locks blocking_locks
  ON blocking_locks.locktype = blocked_locks.locktype
  AND blocking_locks.database IS NOT DISTINCT FROM blocked_locks.database
  AND blocking_locks.relation IS NOT DISTINCT FROM blocked_locks.relation
  AND blocking_locks.page IS NOT DISTINCT FROM blocked_locks.page
  AND blocking_locks.tuple IS NOT DISTINCT FROM blocked_locks.tuple
  AND blocking_locks.virtualxid IS NOT DISTINCT FROM blocked_locks.virtualxid
  AND blocking_locks.transactionid IS NOT DISTINCT FROM blocked_locks.transactionid
  AND blocking_locks.classid IS NOT DISTINCT FROM blocked_locks.classid
  AND blocking_locks.objid IS NOT DISTINCT FROM blocked_locks.objid
  AND blocking_locks.objsubid IS NOT DISTINCT FROM blocked_locks.objsubid
  AND blocking_locks.pid != blocked_locks.pid
JOIN pg_catalog.pg_stat_activity blocking_activity ON blocking_activity.pid = blocking_locks.pid
WHERE NOT blocked_locks.granted;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 7: CONNECTION POOLING GUIDANCE (PgBouncer)
-- Apply these settings to pgbouncer.ini for production
-- ─────────────────────────────────────────────────────────────────────────────

-- PgBouncer recommended configuration (comment block — not SQL):
/*
[databases]
paygate_prod = host=127.0.0.1 port=5432 dbname=paygate_prod

[pgbouncer]
listen_port = 6432
listen_addr = 0.0.0.0
auth_type = scram-sha-256
auth_file = /etc/pgbouncer/userlist.txt
pool_mode = transaction          -- transaction pooling for stateless app servers
max_client_conn = 1000           -- total client connections
default_pool_size = 25           -- server connections per db/user pair
min_pool_size = 5                -- keep 5 connections warm
reserve_pool_size = 5            -- emergency reserve
reserve_pool_timeout = 3         -- seconds before using reserve
server_idle_timeout = 600        -- close idle server connections after 10min
client_idle_timeout = 0          -- never close idle client connections
server_lifetime = 3600           -- recycle server connections hourly
max_db_connections = 50          -- cap total server connections per DB
query_timeout = 30               -- kill queries > 30s
server_reset_query = DISCARD ALL -- clean state between clients
log_connections = 0
log_disconnections = 0
log_pooler_errors = 1
stats_period = 60
*/

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 8: POSTGRESQL.CONF TUNING (for 8GB RAM, SSD, 8 CPU production)
-- Apply by editing postgresql.conf or using ALTER SYSTEM
-- ─────────────────────────────────────────────────────────────────────────────

-- Memory (25% of RAM for shared_buffers, 75% for effective_cache_size)
ALTER SYSTEM SET shared_buffers = '2GB';
ALTER SYSTEM SET effective_cache_size = '6GB';
ALTER SYSTEM SET work_mem = '64MB';                  -- per sort/hash operation
ALTER SYSTEM SET maintenance_work_mem = '512MB';     -- for VACUUM, CREATE INDEX
ALTER SYSTEM SET wal_buffers = '64MB';

-- Connections (use PgBouncer in front — keep max_connections low)
ALTER SYSTEM SET max_connections = 100;

-- Checkpoints (spread I/O over longer intervals)
ALTER SYSTEM SET checkpoint_completion_target = 0.9;
ALTER SYSTEM SET max_wal_size = '4GB';
ALTER SYSTEM SET min_wal_size = '1GB';

-- Parallelism
ALTER SYSTEM SET max_parallel_workers_per_gather = 4;
ALTER SYSTEM SET max_parallel_workers = 8;
ALTER SYSTEM SET max_worker_processes = 16;
ALTER SYSTEM SET enable_partitionwise_join = on;
ALTER SYSTEM SET enable_partitionwise_aggregate = on;

-- SSD-optimised I/O
ALTER SYSTEM SET random_page_cost = 1.1;             -- SSD: much lower than HDD default of 4
ALTER SYSTEM SET effective_io_concurrency = 200;     -- SSD: high concurrency
ALTER SYSTEM SET seq_page_cost = 1.0;

-- Statistics
ALTER SYSTEM SET default_statistics_target = 200;    -- more histogram buckets

-- Logging (slow query detection)
ALTER SYSTEM SET log_min_duration_statement = 1000;  -- log queries > 1 second
ALTER SYSTEM SET log_checkpoints = on;
ALTER SYSTEM SET log_lock_waits = on;
ALTER SYSTEM SET log_temp_files = '10MB';            -- log temp file usage > 10MB
ALTER SYSTEM SET track_io_timing = on;               -- needed for EXPLAIN (BUFFERS)

-- JIT (disable for OLTP — adds latency for short queries)
ALTER SYSTEM SET jit = off;

-- Reload configuration (no restart needed for most settings)
SELECT pg_reload_conf();

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 9: MAINTENANCE PROCEDURES
-- ─────────────────────────────────────────────────────────────────────────────

-- Manual VACUUM ANALYZE on critical tables (run during low-traffic window)
VACUUM (ANALYZE, VERBOSE) transactions;
VACUUM (ANALYZE, VERBOSE) wallet_transactions;
VACUUM (ANALYZE, VERBOSE) merchant_notifications;
VACUUM (ANALYZE, VERBOSE) webhook_deliveries;
VACUUM (ANALYZE, VERBOSE) audit_events;

-- Reindex bloated indexes (run CONCURRENTLY in production)
REINDEX INDEX CONCURRENTLY idx_txn_merchant_status_created;
REINDEX INDEX CONCURRENTLY idx_notif_merchant_unread_created;
REINDEX INDEX CONCURRENTLY idx_webhook_retry_worker;

-- ─────────────────────────────────────────────────────────────────────────────
-- SECTION 10: HEALTH CHECK QUERIES
-- Run these after applying the tuning to verify improvements.
-- ─────────────────────────────────────────────────────────────────────────────

-- Verify cache hit ratios
SELECT * FROM v_cache_hit_ratio;

-- Check for unused indexes (candidates for removal)
SELECT table_name, index_name, index_size
FROM v_index_usage
WHERE idx_scan = 0 AND index_name NOT LIKE '%_pkey'
ORDER BY index_size DESC
LIMIT 20;

-- Check table bloat
SELECT * FROM v_table_bloat LIMIT 10;

-- Verify new indexes exist
SELECT indexname, indexdef
FROM pg_indexes
WHERE tablename IN ('transactions', 'merchant_notifications', 'webhook_deliveries', 'payouts')
  AND indexname LIKE 'idx_%'
ORDER BY tablename, indexname;
