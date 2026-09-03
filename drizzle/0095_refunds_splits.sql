-- 0095: refunds + split payments engine (Paystack parity)
-- Idempotent: safe to re-run.

-- ─── Refunds ────────────────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS refunds (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  transaction_ref text NOT NULL,
  transaction_id text,
  amount_kobo bigint,                -- NULL = full refund of remaining balance
  currency text NOT NULL DEFAULT 'NGN',
  status text NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','processing','needs_attention','failed','processed')),
  merchant_note text,
  customer_note text,
  processor text,                    -- rail used for the reversal (e.g. 'stripe', 'manual')
  refunded_by text,                  -- actor (user openId / api key id)
  deducted_amount bigint,            -- amount actually deducted from settlement
  fully_deducted boolean NOT NULL DEFAULT false,
  expected_at timestamp,             -- expected customer value date
  refunded_at timestamp,
  retry_account jsonb,               -- customer account details supplied on retry
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS refunds_merchant_idx ON refunds (merchant_id);
CREATE INDEX IF NOT EXISTS refunds_tx_ref_idx ON refunds (transaction_ref);
CREATE INDEX IF NOT EXISTS refunds_status_idx ON refunds (status);
CREATE INDEX IF NOT EXISTS refunds_created_idx ON refunds (created_at);

-- ─── Split groups (Paystack /split parity) ──────────────────────────────────
CREATE TABLE IF NOT EXISTS split_groups (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  name text NOT NULL,
  split_code text NOT NULL,          -- 'SPL_...'
  type text NOT NULL CHECK (type IN ('percentage','flat')),
  currency text NOT NULL DEFAULT 'NGN',
  bearer_type text NOT NULL DEFAULT 'account'
    CHECK (bearer_type IN ('account','subaccount','all','all_proportional')),
  bearer_subaccount_id text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS split_groups_code_uniq ON split_groups (split_code);
CREATE INDEX IF NOT EXISTS split_groups_merchant_idx ON split_groups (merchant_id);

CREATE TABLE IF NOT EXISTS split_group_members (
  id text PRIMARY KEY,
  group_id text NOT NULL REFERENCES split_groups (id) ON DELETE CASCADE,
  subaccount_ref text NOT NULL,
  share bigint NOT NULL,             -- percentage: basis points (10000 = 100%); flat: kobo
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS split_group_members_uniq
  ON split_group_members (group_id, subaccount_ref);
CREATE INDEX IF NOT EXISTS split_group_members_group_idx
  ON split_group_members (group_id);

-- ─── split_payments: upgrade in place (merchant scoping + split code) ───────
ALTER TABLE split_payments ADD COLUMN IF NOT EXISTS merchant_id text;
ALTER TABLE split_payments ADD COLUMN IF NOT EXISTS split_code text;
CREATE INDEX IF NOT EXISTS sp_merchant_idx ON split_payments (merchant_id);
CREATE INDEX IF NOT EXISTS sp_split_code_idx ON split_payments (split_code);
