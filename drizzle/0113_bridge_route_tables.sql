-- 0113_bridge_route_tables.sql — wave-7 go-bridge tier-1to5 route persistence
--
-- server/tier1to5Router.ts proxies 52 paths to go-bridge; the bridge mux had
-- no registrations for any of them, so mutations 404'd and persisted nothing.
-- The new handlers (go-bridge/internal/handlers/tier1to5_*.go) persist to
-- existing drizzle tables where they exist (merchant_loans, loan_instalments,
-- split_rules, split_payments, subscription_plans, subscription_subscribers,
-- subscription_charges, dcc_transactions, fx_rates, reconciliation_alerts,
-- invoices, chargebacks, kyb_verifications, kyb_steps, compliance_reports,
-- loyalty_accounts, loyalty_transactions, loyalty_ledger, webhook_endpoints,
-- webhook_delivery_log, open_banking_consents_v2, sdk_tokens).
--
-- This migration creates the five tables that had no drizzle equivalent, and
-- adds dcc_transactions.lock_id so /dcc/execute is idempotent per rate lock.

-- Loan offers generated for merchant loan applications (/lending/offers,
-- /lending/accept).
CREATE TABLE IF NOT EXISTS loan_offers (
  offer_id        TEXT PRIMARY KEY,
  application_id  TEXT NOT NULL,
  merchant_id     TEXT NOT NULL,
  amount_kobo     BIGINT NOT NULL,
  rate_annual_pct TEXT NOT NULL DEFAULT '0',
  term_days       INTEGER NOT NULL DEFAULT 90,
  status          TEXT NOT NULL DEFAULT 'open', -- open | accepted | expired | withdrawn
  expires_at      TIMESTAMPTZ,
  created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS loan_offers_app_idx      ON loan_offers (application_id);
CREATE INDEX IF NOT EXISTS loan_offers_merchant_idx ON loan_offers (merchant_id);
CREATE INDEX IF NOT EXISTS loan_offers_status_idx   ON loan_offers (status);

-- DCC merchant margin configs (/dcc/margin-config GET/POST).
CREATE TABLE IF NOT EXISTS dcc_margin_configs (
  merchant_id   TEXT NOT NULL,
  currency_pair TEXT NOT NULL,
  margin_pct    TEXT NOT NULL DEFAULT '0',
  created_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at    TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY (merchant_id, currency_pair)
);

-- DCC rate locks (/dcc/lock-rate, consumed by /dcc/execute).
CREATE TABLE IF NOT EXISTS dcc_rate_locks (
  lock_id        TEXT PRIMARY KEY,
  merchant_id    TEXT NOT NULL,
  from_currency  TEXT NOT NULL,
  to_currency    TEXT NOT NULL,
  amount_kobo    BIGINT NOT NULL,
  mid_rate       TEXT NOT NULL,
  customer_rate  TEXT NOT NULL,
  margin_pct     TEXT NOT NULL DEFAULT '0',
  status         TEXT NOT NULL DEFAULT 'locked', -- locked | executed | expired
  expires_at     TIMESTAMPTZ NOT NULL,
  created_at     TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS dcc_locks_merchant_idx ON dcc_rate_locks (merchant_id);
CREATE INDEX IF NOT EXISTS dcc_locks_status_idx   ON dcc_rate_locks (status);

-- Idempotency link from an executed conversion back to its rate lock.
ALTER TABLE dcc_transactions ADD COLUMN IF NOT EXISTS lock_id TEXT;
CREATE UNIQUE INDEX IF NOT EXISTS dcc_tx_lock_uidx
  ON dcc_transactions (lock_id) WHERE lock_id IS NOT NULL;

-- Reconciliation run reports (/reconciliation/run, /reconciliation/report).
CREATE TABLE IF NOT EXISTS reconciliation_runs (
  report_id    TEXT PRIMARY KEY,
  merchant_id  TEXT NOT NULL,
  period_start TEXT NOT NULL,
  period_end   TEXT NOT NULL,
  sources      JSONB,
  status       TEXT NOT NULL DEFAULT 'running', -- running | completed | failed
  summary      JSONB,
  created_at   TIMESTAMPTZ NOT NULL DEFAULT now(),
  completed_at TIMESTAMPTZ
);
CREATE INDEX IF NOT EXISTS recon_runs_merchant_idx ON reconciliation_runs (merchant_id);

-- Device fingerprints / session risk records (/session-risk/*).
CREATE TABLE IF NOT EXISTS session_fingerprints (
  id                TEXT PRIMARY KEY,
  user_id           TEXT NOT NULL,
  fingerprint_id    TEXT NOT NULL,
  components        JSONB,
  user_agent        TEXT,
  ip_address        TEXT,
  timezone          TEXT,
  screen_resolution TEXT,
  risk_score        INTEGER NOT NULL DEFAULT 0,
  risk_level        TEXT NOT NULL DEFAULT 'low', -- low | medium | high
  created_at        TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS session_fp_user_idx  ON session_fingerprints (user_id);
CREATE INDEX IF NOT EXISTS session_fp_print_idx ON session_fingerprints (fingerprint_id);
