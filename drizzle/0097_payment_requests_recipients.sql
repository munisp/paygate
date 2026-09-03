-- 0097: payment_requests + transfer_recipients (Paystack /paymentrequest, /transferrecipient, /balance parity)
-- Idempotent: all statements use IF NOT EXISTS / ON CONFLICT-safe constructs.

-- ─── Payment requests (merchant invoicing) ───────────────────────────────────
CREATE TABLE IF NOT EXISTS payment_requests (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  customer_id text NOT NULL,
  request_code text NOT NULL,
  offline_reference text NOT NULL,
  invoice_number bigint NOT NULL,
  description text,
  amount_kobo bigint NOT NULL,
  line_items jsonb,
  tax jsonb,
  currency text NOT NULL DEFAULT 'NGN',
  due_date timestamptz,
  status varchar(16) NOT NULL DEFAULT 'pending',
  paid boolean NOT NULL DEFAULT false,
  paid_at timestamptz,
  amount_paid_kobo bigint NOT NULL DEFAULT 0,
  pending_amount_kobo bigint NOT NULL DEFAULT 0,
  split_code text,
  has_invoice boolean NOT NULL DEFAULT true,
  last_notified_at timestamptz,
  notification_count integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_request_code_uniq ON payment_requests (request_code);
CREATE UNIQUE INDEX IF NOT EXISTS payment_requests_offline_reference_uniq ON payment_requests (offline_reference);
CREATE INDEX IF NOT EXISTS payment_requests_merchant_idx ON payment_requests (merchant_id);
CREATE INDEX IF NOT EXISTS payment_requests_merchant_status_idx ON payment_requests (merchant_id, status);
CREATE INDEX IF NOT EXISTS payment_requests_customer_idx ON payment_requests (customer_id);

-- Per-merchant invoice number sequence.
CREATE TABLE IF NOT EXISTS payment_request_sequences (
  merchant_id text PRIMARY KEY,
  next_invoice_number bigint NOT NULL DEFAULT 1
);

-- ─── Transfer recipients ─────────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS transfer_recipients (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  recipient_code text NOT NULL,
  type varchar(20) NOT NULL,
  name text,
  account_number text,
  bank_code text,
  currency text NOT NULL DEFAULT 'NGN',
  email text,
  description text,
  metadata jsonb,
  authorization_code text,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS transfer_recipients_recipient_code_uniq ON transfer_recipients (recipient_code);
CREATE INDEX IF NOT EXISTS transfer_recipients_merchant_idx ON transfer_recipients (merchant_id);
-- Idempotent duplicate-create detection target.
CREATE UNIQUE INDEX IF NOT EXISTS transfer_recipients_dedupe_uniq
  ON transfer_recipients (merchant_id, type, account_number, bank_code);

-- ─── Transfer OTP / settings ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS merchant_transfer_settings (
  merchant_id text PRIMARY KEY,
  otp_required boolean NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Pending OTP challenges (e.g. disable-OTP confirmation). Only the SHA-256
-- hash of the code is stored; verification is constant-time.
CREATE TABLE IF NOT EXISTS merchant_transfer_otp_challenges (
  id text PRIMARY KEY,
  merchant_id text NOT NULL,
  purpose varchar(32) NOT NULL,
  code_hash text NOT NULL,
  expires_at timestamptz NOT NULL,
  consumed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS merchant_transfer_otp_challenges_merchant_idx
  ON merchant_transfer_otp_challenges (merchant_id, purpose);
