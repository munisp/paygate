-- 0094_public_rest_tokenization.sql
-- Public REST API (Paystack-parity) secret keys + card tokenization.
-- Idempotent: every statement is safe to re-run.

CREATE TABLE IF NOT EXISTS api_secret_keys (
  id          text PRIMARY KEY,
  merchant_id text NOT NULL,
  label       text,
  key_hash    text NOT NULL UNIQUE,
  key_prefix  text NOT NULL CHECK (key_prefix IN ('sk_live','sk_test')),
  last4       text NOT NULL,
  status      text NOT NULL DEFAULT 'active' CHECK (status IN ('active','revoked')),
  last_used_at timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  revoked_at  timestamptz
);

CREATE INDEX IF NOT EXISTS api_secret_keys_merchant_idx ON api_secret_keys (merchant_id);
CREATE INDEX IF NOT EXISTS api_secret_keys_hash_idx ON api_secret_keys (key_hash);

CREATE TABLE IF NOT EXISTS card_authorizations (
  id                 text PRIMARY KEY,
  merchant_id        text NOT NULL,
  customer_email     text NOT NULL,
  authorization_code text NOT NULL UNIQUE,  -- 'AUTH_...'
  reusable           boolean NOT NULL DEFAULT true,
  signature          text,                  -- HMAC of PAN fingerprint (stable per card)
  bin                text,
  last4              text,
  brand              text,
  card_type          text,
  bank               text,
  exp_month          text,
  exp_year           text,
  channel            text NOT NULL DEFAULT 'card',
  active             boolean NOT NULL DEFAULT true,
  created_at         timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS card_authorizations_merchant_idx ON card_authorizations (merchant_id);
CREATE INDEX IF NOT EXISTS card_authorizations_email_idx ON card_authorizations (customer_email);
CREATE INDEX IF NOT EXISTS card_authorizations_signature_idx ON card_authorizations (signature);
