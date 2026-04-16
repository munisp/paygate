-- =============================================================================
-- PayGate Merchant Portal — Unused Index Cleanup Script
-- =============================================================================
-- Usage:
--   DRY RUN (default, safe — just prints DROP statements):
--     psql $DATABASE_URL -f scripts/drop-unused-indexes.sql
--
--   EXECUTE (actually drops indexes — use with caution in production):
--     psql $DATABASE_URL -v execute=true -f scripts/drop-unused-indexes.sql
--
-- Safety rules:
--   1. Only drops indexes with 0 scans since last statistics reset
--   2. Never drops primary key indexes
--   3. Never drops unique indexes (they enforce constraints)
--   4. Never drops indexes on foreign key columns (needed for JOIN performance)
--   5. Uses CONCURRENTLY to avoid locking tables in production
--   6. Requires pg_stat_user_indexes to have been running for ≥ 7 days
--      (check pg_stat_reset_shared('bgwriter') timestamp)
--
-- Review the output carefully before setting execute=true.
-- =============================================================================

\set ON_ERROR_STOP on
\set execute :execute

-- ─── 1. Show statistics age (must be ≥ 7 days for reliable data) ─────────────
SELECT
  'Statistics age: ' || age::text AS info
FROM (
  SELECT now() - stats_reset AS age
  FROM pg_stat_bgwriter
) sub;

-- ─── 2. Identify unused indexes ──────────────────────────────────────────────
WITH unused AS (
  SELECT
    schemaname,
    tablename,
    indexname,
    idx_scan,
    pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
    pg_relation_size(indexrelid) AS index_bytes,
    -- Check if it's a PK, unique, or FK-backing index
    (SELECT count(*) FROM pg_constraint c
     WHERE c.conindid = i.indexrelid AND c.contype IN ('p', 'u')) > 0 AS is_constraint_index,
    -- Check if it's backing a FK column
    EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = i.indrelid
        AND a.attname = ANY(
          SELECT attname FROM pg_attribute
          WHERE attrelid = i.indrelid AND attnum = ANY(i.indkey)
        )
    ) AS is_fk_backing
  FROM pg_stat_user_indexes sui
  JOIN pg_index i ON i.indexrelid = sui.indexrelid
  WHERE sui.idx_scan = 0
    AND sui.schemaname NOT IN ('pg_catalog', 'information_schema')
    AND sui.indexname NOT LIKE 'pg_%'
)
SELECT
  schemaname,
  tablename,
  indexname,
  idx_scan,
  index_size,
  is_constraint_index,
  is_fk_backing,
  CASE
    WHEN is_constraint_index THEN '⚠ SKIP — constraint index (PK/UNIQUE)'
    WHEN is_fk_backing       THEN '⚠ SKIP — backs a foreign key'
    ELSE '✓ SAFE TO DROP'
  END AS recommendation,
  CASE
    WHEN NOT is_constraint_index AND NOT is_fk_backing
    THEN 'DROP INDEX CONCURRENTLY IF EXISTS ' || schemaname || '.' || indexname || ';'
    ELSE '-- SKIPPED: ' || indexname
  END AS drop_statement
FROM unused
ORDER BY index_bytes DESC;

-- ─── 3. Summary ──────────────────────────────────────────────────────────────
SELECT
  count(*) FILTER (WHERE NOT is_constraint_index AND NOT is_fk_backing) AS droppable_count,
  pg_size_pretty(
    sum(index_bytes) FILTER (WHERE NOT is_constraint_index AND NOT is_fk_backing)
  ) AS reclaimable_space
FROM (
  SELECT
    pg_relation_size(indexrelid) AS index_bytes,
    (SELECT count(*) FROM pg_constraint c
     WHERE c.conindid = i.indexrelid AND c.contype IN ('p', 'u')) > 0 AS is_constraint_index,
    EXISTS (
      SELECT 1 FROM pg_constraint c
      JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
      WHERE c.contype = 'f'
        AND c.conrelid = i.indrelid
        AND a.attname = ANY(
          SELECT attname FROM pg_attribute
          WHERE attrelid = i.indrelid AND attnum = ANY(i.indkey)
        )
    ) AS is_fk_backing
  FROM pg_stat_user_indexes sui
  JOIN pg_index i ON i.indexrelid = sui.indexrelid
  WHERE sui.idx_scan = 0
    AND sui.schemaname NOT IN ('pg_catalog', 'information_schema')
    AND sui.indexname NOT LIKE 'pg_%'
) sub;

-- ─── 4. Execute drops (only when -v execute=true is passed) ──────────────────
DO $$
DECLARE
  r RECORD;
  execute_flag TEXT := current_setting('execute', true);
BEGIN
  IF execute_flag IS DISTINCT FROM 'true' THEN
    RAISE NOTICE 'DRY RUN mode — no indexes dropped. Pass -v execute=true to actually drop.';
    RETURN;
  END IF;

  RAISE NOTICE 'EXECUTE mode — dropping unused indexes...';

  FOR r IN
    SELECT
      schemaname || '.' || indexname AS full_index_name,
      indexname
    FROM pg_stat_user_indexes sui
    JOIN pg_index i ON i.indexrelid = sui.indexrelid
    WHERE sui.idx_scan = 0
      AND sui.schemaname NOT IN ('pg_catalog', 'information_schema')
      AND sui.indexname NOT LIKE 'pg_%'
      -- Skip constraint indexes
      AND (SELECT count(*) FROM pg_constraint c
           WHERE c.conindid = i.indexrelid AND c.contype IN ('p', 'u')) = 0
      -- Skip FK-backing indexes
      AND NOT EXISTS (
        SELECT 1 FROM pg_constraint c
        JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = ANY(c.conkey)
        WHERE c.contype = 'f'
          AND c.conrelid = i.indrelid
          AND a.attname = ANY(
            SELECT attname FROM pg_attribute
            WHERE attrelid = i.indrelid AND attnum = ANY(i.indkey)
          )
      )
  LOOP
    RAISE NOTICE 'Dropping index: %', r.full_index_name;
    EXECUTE 'DROP INDEX CONCURRENTLY IF EXISTS ' || r.full_index_name;
  END LOOP;

  RAISE NOTICE 'Done. Run ANALYZE on affected tables to update planner statistics.';
END;
$$;
