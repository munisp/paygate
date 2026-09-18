-- 0100_refunds_disputes.sql — refunds/disputes audit fixes (idempotent).
--
-- 1. refunds.stripe_refund_id: stores the adopted/issued Stripe refund id so
--    retries and the settlement reconciler never double-issue (C8).
-- 2. wallets.reserved_balance: kobo (text, bigint-safe) held against open
--    chargebacks so disputed funds cannot be paid out (H6c).
-- 3. Supporting indexes. A cross-row "sum(refunds) <= transaction.amount"
--    guard is not expressible as a plain CHECK/UNIQUE constraint; the race is
--    closed in code with SELECT ... FOR UPDATE on the transactions row inside
--    one DB transaction (C2). The partial unique index below hardens the
--    stripe adoption path against duplicate rows for the same rail refund.

ALTER TABLE refunds ADD COLUMN IF NOT EXISTS stripe_refund_id text;

ALTER TABLE wallets ADD COLUMN IF NOT EXISTS reserved_balance text NOT NULL DEFAULT '0';

CREATE INDEX IF NOT EXISTS refunds_processing_updated_idx
  ON refunds (status, updated_at)
  WHERE status = 'processing';

CREATE UNIQUE INDEX IF NOT EXISTS refunds_stripe_refund_uniq
  ON refunds (stripe_refund_id)
  WHERE stripe_refund_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS chargebacks_open_txn_idx
  ON chargebacks (transaction_id)
  WHERE status IN ('open', 'under_review', 'pre_arbitration', 'arbitration');
