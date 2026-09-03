-- 0092: invoice_payments metadata (fee-choice + partial payment ledger annotations)
ALTER TABLE invoice_payments ADD COLUMN IF NOT EXISTS metadata jsonb;
