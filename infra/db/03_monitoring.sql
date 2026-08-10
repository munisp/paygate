-- =============================================================================
-- PayGate PostgreSQL Monitoring Setup
-- Run once on the production primary instance.
-- =============================================================================

-- Enable pg_stat_statements (requires superuser; add to postgresql.conf:
--   shared_preload_libraries = 'pg_stat_statements'
--   pg_stat_statements.max = 10000
--   pg_stat_statements.track = all
-- Then restart PostgreSQL.)
CREATE EXTENSION IF NOT EXISTS pg_stat_statements;

-- ─── Top 10 slowest queries (by total execution time) ─────────────────────────
-- Run this periodically or via a monitoring cron:
SELECT
  round(total_exec_time::numeric, 2) AS total_ms,
  calls,
  round(mean_exec_time::numeric, 2)  AS mean_ms,
  round(stddev_exec_time::numeric, 2) AS stddev_ms,
  rows,
  query
FROM pg_stat_statements
ORDER BY total_exec_time DESC
LIMIT 10;

-- ─── Queries with high I/O (block reads) ─────────────────────────────────────
SELECT
  calls,
  shared_blks_read + shared_blks_hit AS total_blocks,
  round((shared_blks_read::numeric / NULLIF(calls, 0)), 2) AS blks_read_per_call,
  query
FROM pg_stat_statements
WHERE calls > 100
ORDER BY shared_blks_read DESC
LIMIT 10;

-- ─── Table bloat check ────────────────────────────────────────────────────────
SELECT
  schemaname,
  relname AS tablename,
  n_live_tup,
  n_dead_tup,
  round(n_dead_tup::numeric / NULLIF(n_live_tup + n_dead_tup, 0) * 100, 2) AS dead_pct,
  last_autovacuum,
  last_autoanalyze
FROM pg_stat_user_tables
WHERE n_dead_tup > 1000
ORDER BY dead_pct DESC;

-- ─── Index usage (find unused indexes) ───────────────────────────────────────
SELECT
  schemaname,
  relname AS tablename,
  indexrelname AS indexname,
  idx_scan,
  idx_tup_read,
  idx_tup_fetch
FROM pg_stat_user_indexes
WHERE idx_scan = 0
  AND schemaname = 'public'
ORDER BY relname;

-- ─── Connection pool usage ────────────────────────────────────────────────────
SELECT
  datname,
  count(*) AS total_connections,
  count(*) FILTER (WHERE state = 'active') AS active,
  count(*) FILTER (WHERE state = 'idle') AS idle,
  count(*) FILTER (WHERE state = 'idle in transaction') AS idle_in_tx
FROM pg_stat_activity
GROUP BY datname
ORDER BY total_connections DESC;

-- ─── Lock contention ─────────────────────────────────────────────────────────
SELECT
  pid,
  now() - pg_stat_activity.query_start AS duration,
  query,
  state
FROM pg_stat_activity
WHERE (now() - pg_stat_activity.query_start) > interval '5 seconds'
  AND state != 'idle'
ORDER BY duration DESC;

-- ─── Idempotency TTL cleanup (run daily via pg_cron) ─────────────────────────
-- DELETE FROM idempotency_requests
-- WHERE created_at < NOW() - INTERVAL '24 hours';

-- ─── NIP account cache TTL cleanup (run daily via pg_cron) ───────────────────
-- DELETE FROM nip_account_cache
-- WHERE created_at < NOW() - INTERVAL '24 hours';

-- ─── Notification cleanup (run weekly via pg_cron) ────────────────────────────
-- DELETE FROM merchant_notifications
-- WHERE created_at < NOW() - INTERVAL '90 days';

-- ─── Push token cleanup (run weekly via pg_cron) ─────────────────────────────
-- DELETE FROM device_push_tokens
-- WHERE updated_at < NOW() - INTERVAL '30 days';
