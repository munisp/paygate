-- 0108_go_cache_tables.sql — audit M2 (go-bridge wave-5 in-memory store fixes)
--
-- Durable write-through store for go-bridge/internal/redis/crossborder_cache.go
-- (previously in-memory only — idempotency keys and transfer state were lost
-- on restart and raced under concurrency), plus an atomic invoice number
-- sequence replacing the racy `invoiceCounter++` in internal/handlers/invoices.go.
--
-- The in-memory structures remain as fast read caches; these tables are the
-- durable write-through store for money/idempotency paths.

CREATE TABLE IF NOT EXISTS idempotency_keys (
  key        TEXT PRIMARY KEY,
  result     JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL
);
CREATE INDEX IF NOT EXISTS idempotency_keys_expires_idx ON idempotency_keys (expires_at);

CREATE TABLE IF NOT EXISTS transfer_state (
  transfer_id TEXT PRIMARY KEY,
  state       JSONB NOT NULL,
  updated_at  TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Atomic invoice number allocation (SELECT nextval('invoice_number_seq')).
-- START WITH 100001 to stay above the historical in-memory base of 100000.
CREATE SEQUENCE IF NOT EXISTS invoice_number_seq START WITH 100001 INCREMENT BY 1;
