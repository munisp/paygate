-- =============================================================================
-- PayGate Table Partitioning Strategy
-- Uses pg_partman for automated monthly partition management.
-- Run AFTER initial data migration. Requires pg_partman extension.
-- =============================================================================

-- Enable pg_partman extension (requires superuser)
CREATE EXTENSION IF NOT EXISTS pg_partman;

-- ─── transactions — monthly range partitioning ────────────────────────────────
-- Step 1: Rename existing table
ALTER TABLE transactions RENAME TO transactions_old;

-- Step 2: Create partitioned parent table
CREATE TABLE transactions (
  LIKE transactions_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

-- Step 3: Register with pg_partman (creates partitions automatically)
SELECT partman.create_parent(
  p_parent_table  => 'public.transactions',
  p_control       => 'created_at',
  p_type          => 'range',
  p_interval      => 'monthly',
  p_premake       => 3  -- pre-create 3 future months
);

-- Step 4: Configure retention (keep 24 months, archive older)
UPDATE partman.part_config
SET retention = '24 months',
    retention_keep_table = true,
    infinite_time_partitions = true
WHERE parent_table = 'public.transactions';

-- Step 5: Migrate data from old table
INSERT INTO transactions SELECT * FROM transactions_old;
DROP TABLE transactions_old;

-- ─── audit_events — monthly range partitioning ────────────────────────────────
ALTER TABLE audit_events RENAME TO audit_events_old;

CREATE TABLE audit_events (
  LIKE audit_events_old INCLUDING ALL
) PARTITION BY RANGE (created_at);

SELECT partman.create_parent(
  p_parent_table  => 'public.audit_events',
  p_control       => 'created_at',
  p_type          => 'range',
  p_interval      => 'monthly',
  p_premake       => 3
);

UPDATE partman.part_config
SET retention = '84 months',  -- 7 years regulatory retention
    retention_keep_table = true,
    infinite_time_partitions = true
WHERE parent_table = 'public.audit_events';

INSERT INTO audit_events SELECT * FROM audit_events_old;
DROP TABLE audit_events_old;

-- ─── Automated maintenance cron (run via pg_cron or external scheduler) ───────
-- Schedule partition maintenance every day at 02:00 UTC
-- Requires pg_cron extension:
-- SELECT cron.schedule('partman-maintenance', '0 2 * * *',
--   $$CALL partman.run_maintenance_proc()$$);

-- ─── Verify partitions ────────────────────────────────────────────────────────
SELECT
  parent.relname AS parent_table,
  child.relname  AS partition_name,
  pg_get_expr(child.relpartbound, child.oid) AS partition_range
FROM pg_inherits
JOIN pg_class parent ON pg_inherits.inhparent = parent.oid
JOIN pg_class child  ON pg_inherits.inhrelid  = child.oid
WHERE parent.relname IN ('transactions', 'audit_events')
ORDER BY parent.relname, child.relname;
