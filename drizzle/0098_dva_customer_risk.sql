-- 0098: Dedicated Virtual Accounts completion + customer risk actions + subscription extras
-- (Paystack /dedicated_account, /customer/set_risk_action, /customer/validate,
--  subscription manage-link parity).
-- Idempotent: safe to re-run.

-- ─── Dedicated virtual accounts (extends existing nip_virtual_accounts) ──────
-- The table already exists (created by earlier NIP waves); ADD COLUMN IF NOT EXISTS
-- only — never recreate or duplicate it.
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS dedicated boolean NOT NULL DEFAULT false;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS customer_id text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS customer_email text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS customer_phone text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS preferred_bank text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS provider_slug text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS country varchar(2) NOT NULL DEFAULT 'NG';
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS assignment_status text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS split_code text;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS last_requery_at timestamp;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS assigned_at timestamp;
ALTER TABLE nip_virtual_accounts ADD COLUMN IF NOT EXISTS deactivated_at timestamp;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'nip_va_assignment_status_chk'
  ) THEN
    ALTER TABLE nip_virtual_accounts
      ADD CONSTRAINT nip_va_assignment_status_chk
      CHECK (assignment_status IS NULL OR assignment_status IN ('assignment_pending','assigned','failed'));
  END IF;
END $$;

CREATE INDEX IF NOT EXISTS nip_va_dedicated_idx ON nip_virtual_accounts (merchant_id, dedicated);
CREATE INDEX IF NOT EXISTS nip_va_customer_idx ON nip_virtual_accounts (merchant_id, customer_email) WHERE dedicated;
CREATE UNIQUE INDEX IF NOT EXISTS nip_va_dedicated_account_uniq
  ON nip_virtual_accounts (account_number) WHERE dedicated;

-- ─── NIP banks: DVA provider capability flags ───────────────────────────────
ALTER TABLE nip_banks ADD COLUMN IF NOT EXISTS provider_slug text;
ALTER TABLE nip_banks ADD COLUMN IF NOT EXISTS pay_with_bank_transfer integer NOT NULL DEFAULT 1;
CREATE UNIQUE INDEX IF NOT EXISTS nip_banks_provider_slug_uniq
  ON nip_banks (provider_slug) WHERE provider_slug IS NOT NULL;

-- ─── Customer risk action (Paystack set_risk_action parity) ─────────────────
ALTER TABLE customers ADD COLUMN IF NOT EXISTS risk_action text NOT NULL DEFAULT 'default';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'customers_risk_action_chk'
  ) THEN
    ALTER TABLE customers
      ADD CONSTRAINT customers_risk_action_chk
      CHECK (risk_action IN ('default','allow','deny'));
  END IF;
END $$;

-- ─── Customer identifications (Paystack /customer/validate parity) ──────────
CREATE TABLE IF NOT EXISTS customer_identifications (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  customer_id text NOT NULL,
  type varchar(32) NOT NULL,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','success','failed')),
  reason text,
  payload jsonb, -- masked — never store full BVN / account number in clear
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS customer_identifications_merchant_idx
  ON customer_identifications (merchant_id);
CREATE INDEX IF NOT EXISTS customer_identifications_customer_idx
  ON customer_identifications (merchant_id, customer_id);

-- ─── Subscription manage-link tokens (hosted card-update link) ──────────────
CREATE TABLE IF NOT EXISTS subscription_manage_tokens (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  subscription_id text NOT NULL,
  token_hash text NOT NULL,
  expires_at timestamp NOT NULL,
  used_at timestamp,
  created_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS subscription_manage_tokens_hash_uniq
  ON subscription_manage_tokens (token_hash);
CREATE INDEX IF NOT EXISTS subscription_manage_tokens_sub_idx
  ON subscription_manage_tokens (merchant_id, subscription_id);
