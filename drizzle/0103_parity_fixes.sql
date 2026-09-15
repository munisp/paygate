-- 0103: Parity/security fixes (audit wave)
--   C20  — environment (test/live) persisted on hosted_payment_sessions + transactions
--   H12  — partial unique index: one active DVA per (merchant, customer_email)
--   H15  — debit_mandates.last_debit_at (atomic debit claim stamp)
--   H23  — merchant_transfer_otp_challenges.attempts (brute-force lockout)
-- Idempotent: safe to re-run.

-- ─── C20: test/live environment columns ─────────────────────────────────────
ALTER TABLE hosted_payment_sessions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';
ALTER TABLE transactions
  ADD COLUMN IF NOT EXISTS environment text NOT NULL DEFAULT 'live';

CREATE INDEX IF NOT EXISTS transactions_merchant_environment_idx
  ON transactions (merchant_id, environment);
CREATE INDEX IF NOT EXISTS hosted_payment_sessions_merchant_environment_idx
  ON hosted_payment_sessions (merchant_id, environment);

-- ─── H12: one ACTIVE dedicated virtual account per (merchant, customer) ─────
CREATE UNIQUE INDEX IF NOT EXISTS nip_va_dedicated_customer_uniq
  ON nip_virtual_accounts (merchant_id, customer_email)
  WHERE dedicated AND deactivated_at IS NULL;

-- ─── H15: direct-debit atomic claim stamp ────────────────────────────────────
ALTER TABLE debit_mandates
  ADD COLUMN IF NOT EXISTS last_debit_at timestamptz;

-- ─── H23: OTP brute-force lockout counter ────────────────────────────────────
ALTER TABLE merchant_transfer_otp_challenges
  ADD COLUMN IF NOT EXISTS attempts integer NOT NULL DEFAULT 0;
