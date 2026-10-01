-- 0107_security_event_persistence.sql — A2-MEDIUM-1
--
-- Persist the previously in-memory-only security/audit stores to Postgres:
--  1. auth_failure_events   ← server/security116.ts logAuthFailure ring buffer
--  2. waf_block_events      ← server/security120.ts recordWAFBlock ring buffer
--  3. webhook_alert_acks    ← server/webhookFailureAlerts.ts acknowledgedIds set
--
-- The in-memory structures remain as fast read caches; these tables are the
-- durable write-through store (fire-and-forget inserts, hydrated on startup).

CREATE TABLE IF NOT EXISTS auth_failure_events (
  id          BIGSERIAL PRIMARY KEY,
  user_id     INTEGER,
  user_email  TEXT,
  action      TEXT NOT NULL,
  resource    TEXT NOT NULL,
  ip          TEXT,
  reason      TEXT NOT NULL,
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS auth_failure_events_created_idx ON auth_failure_events (created_at DESC);
CREATE INDEX IF NOT EXISTS auth_failure_events_user_idx    ON auth_failure_events (user_id);
CREATE INDEX IF NOT EXISTS auth_failure_events_ip_idx      ON auth_failure_events (ip);

CREATE TABLE IF NOT EXISTS waf_block_events (
  id          BIGSERIAL PRIMARY KEY,
  ip          TEXT NOT NULL,
  path        TEXT NOT NULL,
  method      TEXT NOT NULL,
  reason      TEXT NOT NULL,
  severity    TEXT NOT NULL DEFAULT 'high',
  created_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS waf_block_events_created_idx ON waf_block_events (created_at DESC);
CREATE INDEX IF NOT EXISTS waf_block_events_ip_idx      ON waf_block_events (ip);

CREATE TABLE IF NOT EXISTS webhook_alert_acks (
  id           BIGSERIAL PRIMARY KEY,
  delivery_id  TEXT NOT NULL,           -- the alert id (delivery id or dlq:<id>)
  acknowledged_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (delivery_id)
);
