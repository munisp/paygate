-- 0106_perf_indexes.sql — PS5/PS8 performance indexes
--
-- 1. pg_trgm trigram indexes for the ILIKE '%...%' search columns used by
--    listTransactions (reference, customer_email, customer_name) and
--    listCustomers (email, name, phone) in server/db.ts. Without these the
--    search path is a sequential scan over the full table.
-- 2. Hot-path composite indexes. NOTE: merchant_id+created_at composites on
--    transactions / payouts / customers already exist in schema.ts
--    (transactions_merchant_created_idx, payouts_merchant_created_idx,
--    customers_merchant_created_idx) — intentionally NOT duplicated here.
--    A "ledger_entries" table does not exist in this schema (the ledger is
--    multi_currency_ledger_entries / TigerBeetle), so nothing is added for it.
-- 3. keycloak_events(user_id, event_type, received_at DESC) supports the
--    batched geo-enrichment queries in the admin sessions endpoints (PS8).

CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Trigram indexes for ILIKE search (transactions)
CREATE INDEX IF NOT EXISTS transactions_reference_trgm_idx
  ON transactions USING gin (reference gin_trgm_ops);
CREATE INDEX IF NOT EXISTS transactions_customer_email_trgm_idx
  ON transactions USING gin (customer_email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS transactions_customer_name_trgm_idx
  ON transactions USING gin (customer_name gin_trgm_ops);

-- Trigram indexes for ILIKE search (customers)
CREATE INDEX IF NOT EXISTS customers_email_trgm_idx
  ON customers USING gin (email gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_name_trgm_idx
  ON customers USING gin (name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS customers_phone_trgm_idx
  ON customers USING gin (phone gin_trgm_ops);

-- Batched login-geo lookups (admin sessions list / CSV export)
CREATE INDEX IF NOT EXISTS keycloak_events_user_type_received_idx
  ON keycloak_events (user_id, event_type, received_at DESC);
