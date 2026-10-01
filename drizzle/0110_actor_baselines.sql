-- 0110_actor_baselines.sql — M3 wave-5 (insider-threat-engine)
--
-- Persist the previously in-memory-only behavioural baselines
-- (rust-services/insider-threat-engine BehaviouralEngine DashMap) to Postgres.
--
-- The DashMap remains as a bounded L1 cache (10k entries, ~10% eviction);
-- this table is the durable write-through store: /baseline/update upserts,
-- /score lazy-loads on an L1 miss. recent_timestamps velocity windows are
-- intentionally not persisted — they rebuild from live traffic after restart.

CREATE TABLE IF NOT EXISTS actor_baselines (
  actor_id        TEXT NOT NULL,
  action          TEXT NOT NULL,
  ema             DOUBLE PRECISION NOT NULL DEFAULT 0,
  emv             DOUBLE PRECISION NOT NULL DEFAULT 1,
  count           BIGINT NOT NULL DEFAULT 0,
  known_devices   JSONB NOT NULL DEFAULT '[]'::jsonb,
  known_countries JSONB NOT NULL DEFAULT '[]'::jsonb,
  hour_counts     JSONB NOT NULL DEFAULT '[]'::jsonb,
  updated_at      TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (actor_id, action)
);
CREATE INDEX IF NOT EXISTS actor_baselines_updated_idx ON actor_baselines (updated_at DESC);
