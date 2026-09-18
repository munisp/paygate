-- 0104_platform_ops.sql
-- Platform-ops audit fixes (C9, C10, C16, H20, M6).
-- Idempotent: every statement is safe to re-run.

-- ─── C16: idempotency entity-ref columns ─────────────────────────────────────
-- Mutations stamp the created entity on the placeholder row DURING execution
-- (markIdempotencyEntity); a stuck-102 replay older than 15 min can then
-- synthesize the success response from the entity instead of re-executing.
ALTER TABLE idempotency_requests ADD COLUMN IF NOT EXISTS entity_table text;
ALTER TABLE idempotency_requests ADD COLUMN IF NOT EXISTS entity_id text;

-- ─── H20: webhook_deliveries updated_at (dead-letter visibility) ─────────────
-- Dead-letter rows (attempt_count >= 7) are surfaced by the failure alerter
-- using COALESCE(updated_at, created_at) as the freshness cursor.
ALTER TABLE webhook_deliveries ADD COLUMN IF NOT EXISTS updated_at timestamptz;

-- ─── C10: subscription renewal dunning columns ───────────────────────────────
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS retry_count integer NOT NULL DEFAULT 0;
ALTER TABLE subscriptions ADD COLUMN IF NOT EXISTS authorization_code text;

-- ─── M6: cashback redemption idempotent-replay unique index ──────────────────
-- ON CONFLICT (merchant_id, related_transaction_id, type) DO NOTHING target.
CREATE UNIQUE INDEX IF NOT EXISTS cashback_tx_redemption_replay_uniq
  ON cashback_transactions (merchant_id, related_transaction_id, type);

-- ─── C9: Stripe webhook event durability ─────────────────────────────────────
-- Raw event is persisted FIRST, then ACKed 200; a processor re-attempts
-- pending/failed rows so no verified event is ever lost to a crash.
CREATE TABLE IF NOT EXISTS stripe_webhook_events (
  id           text PRIMARY KEY,               -- Stripe event id (evt_...)
  type         text NOT NULL,
  payload      jsonb NOT NULL,                 -- full raw event payload
  status       text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processed','failed')),
  error        text,
  created_at   timestamptz NOT NULL DEFAULT now(),
  processed_at timestamptz
);
CREATE INDEX IF NOT EXISTS stripe_webhook_events_status_idx
  ON stripe_webhook_events (status);
