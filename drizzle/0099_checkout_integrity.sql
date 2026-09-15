-- 0099: Checkout integrity hardening
--  * ledger_outbox: durable fallback rows for failed TigerBeetle transfers and
--    failed Kafka payment.completed publishes (C1 / outbox wiring). A row is
--    written BEFORE the money path returns null/continues so nothing is lost.
--  * invoices.paid_kobo: atomic reservation counter used by the hosted-checkout
--    settlement guard (H11) — UPDATE ... SET paid_kobo = paid_kobo + x
--    WHERE paid_kobo + x <= total_kobo — so concurrent settlements can never
--    overpay an invoice.
-- Idempotent: safe to re-run.

CREATE TABLE IF NOT EXISTS ledger_outbox (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id text NOT NULL,
  merchant_id text NOT NULL,
  kind text NOT NULL,               -- 'ledger.transfer' | 'kafka.payment.completed' | ...
  reference text NOT NULL,
  amount_kobo bigint NOT NULL DEFAULT 0,
  payload jsonb,
  status text NOT NULL DEFAULT 'pending',   -- pending | delivered | failed
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ledger_outbox_status_chk'
  ) THEN
    ALTER TABLE ledger_outbox
      ADD CONSTRAINT ledger_outbox_status_chk
      CHECK (status IN ('pending','delivered','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS ledger_outbox_status_idx ON ledger_outbox (status, created_at);
CREATE INDEX IF NOT EXISTS ledger_outbox_merchant_idx ON ledger_outbox (merchant_id);
CREATE INDEX IF NOT EXISTS ledger_outbox_reference_idx ON ledger_outbox (reference);

-- H11: per-invoice overpayment guard counter.
ALTER TABLE invoices ADD COLUMN IF NOT EXISTS paid_kobo bigint NOT NULL DEFAULT 0;
