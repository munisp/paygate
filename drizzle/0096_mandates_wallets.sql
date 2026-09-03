-- 0096: direct-debit mandates + Apple/Google Pay wallet acceptance (Paystack parity+)
-- Idempotent: safe to re-run.

-- ─── Direct-debit mandates ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS debit_mandates (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  customer_id text,
  customer_email text NOT NULL,
  mandate_reference text NOT NULL,
  authorization_code text NOT NULL,
  bank_code text,
  account_number_masked text,
  account_number_hash text,
  account_name text,
  address jsonb,
  status varchar(16) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending','approved','active','paused','cancelled','failed')),
  activation_charge_kobo bigint NOT NULL DEFAULT 5000,
  reusable boolean NOT NULL DEFAULT true,
  expires_at timestamp,
  approved_at timestamp,
  activated_at timestamp,
  cancelled_at timestamp,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS debit_mandates_reference_uniq
  ON debit_mandates (mandate_reference);
CREATE UNIQUE INDEX IF NOT EXISTS debit_mandates_authorization_code_uniq
  ON debit_mandates (authorization_code);
CREATE INDEX IF NOT EXISTS debit_mandates_merchant_idx
  ON debit_mandates (merchant_id);
CREATE INDEX IF NOT EXISTS debit_mandates_merchant_customer_idx
  ON debit_mandates (merchant_id, customer_email);
CREATE INDEX IF NOT EXISTS debit_mandates_expires_idx
  ON debit_mandates (expires_at) WHERE expires_at IS NOT NULL;

-- ─── Apple Pay merchant domains ─────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS wallet_domains (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  domain text NOT NULL,
  provider varchar(16) NOT NULL DEFAULT 'apple_pay' CHECK (provider IN ('apple_pay')),
  status varchar(16) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','verified','failed')),
  verification_token text,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS wallet_domains_merchant_domain_uniq
  ON wallet_domains (merchant_id, domain);
CREATE INDEX IF NOT EXISTS wallet_domains_merchant_idx
  ON wallet_domains (merchant_id);

-- ─── Tokenized wallet payment instruments (Apple Pay / Google Pay) ──────────
CREATE TABLE IF NOT EXISTS wallet_payment_instruments (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  customer_email text NOT NULL,
  provider varchar(16) NOT NULL CHECK (provider IN ('apple_pay','google_pay')),
  token_ref text NOT NULL,
  display_name text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamp NOT NULL DEFAULT now(),
  updated_at timestamp NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS wallet_instruments_merchant_idx
  ON wallet_payment_instruments (merchant_id);
CREATE INDEX IF NOT EXISTS wallet_instruments_merchant_customer_idx
  ON wallet_payment_instruments (merchant_id, customer_email);
