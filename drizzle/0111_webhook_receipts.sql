-- 0111_webhook_receipts.sql — durable inbound webhook receipts (go-bridge)
--
-- go-bridge webhook handlers (nibss_webhook.go, sdk_relay.go) previously
-- forwarded inbound webhooks without a durable receipt record first — a
-- crash between receipt and forwarding lost the event. Handlers now write a
-- receipt row BEFORE forwarding, mark forwarded_at on success, and record
-- forward_error on failure so events can be replayed.

CREATE TABLE IF NOT EXISTS webhook_receipts (
  id           BIGSERIAL PRIMARY KEY,
  source       TEXT NOT NULL,
  event_id     TEXT,
  payload      JSONB NOT NULL,
  received_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
  forwarded_at TIMESTAMPTZ,
  forward_error TEXT
);

CREATE INDEX IF NOT EXISTS webhook_receipts_unforwarded_idx
  ON webhook_receipts (received_at)
  WHERE forwarded_at IS NULL;
