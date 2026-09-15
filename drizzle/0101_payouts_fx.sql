-- 0101: Payout reservation + maker-checker + FX audit fixes.
--  - payouts.reserved_amount: kobo reserved at creation (amount + fee), released
--    on reject/fail, consumed on execution.
--  - payouts.rejection_reason: dedicated column so rejections no longer
--    overwrite the failure_reason maker-checker metadata.
--  - payout_status enum: 'approving' (double-approval guard flip state) and
--    'workflow_pending' (bridge workflow-start failed; retry via outbox).
-- Idempotent: safe to re-run.

ALTER TABLE payouts ADD COLUMN IF NOT EXISTS reserved_amount bigint NOT NULL DEFAULT 0;
ALTER TABLE payouts ADD COLUMN IF NOT EXISTS rejection_reason text;

DO $$
BEGIN
  BEGIN
    ALTER TYPE payout_status ADD VALUE 'approving';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
  BEGIN
    ALTER TYPE payout_status ADD VALUE 'workflow_pending';
  EXCEPTION WHEN duplicate_object THEN NULL;
  END;
END $$;

CREATE INDEX IF NOT EXISTS payouts_status_reserved_idx ON payouts (status) WHERE reserved_amount > 0;

-- Retry outbox for payouts whose Temporal approval-workflow start failed
-- (status = 'workflow_pending'). A sweeper drains this and re-signals the bridge.
CREATE TABLE IF NOT EXISTS payout_workflow_outbox (
  id bigserial PRIMARY KEY,
  payout_id text NOT NULL REFERENCES payouts(id) ON DELETE CASCADE,
  payload jsonb NOT NULL,
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  created_at timestamp NOT NULL DEFAULT now(),
  processed_at timestamp
);
CREATE UNIQUE INDEX IF NOT EXISTS payout_workflow_outbox_payout_uniq
  ON payout_workflow_outbox (payout_id) WHERE processed_at IS NULL;
