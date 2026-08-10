-- Wave 32 Comprehensive Seed Script
-- Seeds all 131 empty tables with realistic production data

-- ============================================================
-- USERS & MERCHANTS (needed as FK references)
-- ============================================================
INSERT INTO users (id, open_id, name, email, role, created_at) VALUES
  (9001, 'seed_user_9001', 'Alice Merchant', 'alice@paygate.io', 'user', NOW()),
  (9002, 'seed_user_9002', 'Bob Merchant', 'bob@paygate.io', 'user', NOW()),
  (9003, 'seed_user_9003', 'Carol Admin', 'carol@paygate.io', 'admin', NOW())
ON CONFLICT (id) DO NOTHING;

-- ============================================================
-- MERCHANT PROFILES
-- ============================================================
INSERT INTO merchant_profiles (user_id, business_name, business_type, registration_number, tax_id, website, support_email, support_phone, address_line1, city, state, country, postal_code, status, created_at)
SELECT 9001, 'Alice Ventures Ltd', 'fintech', 'RC123456', 'TIN987654', 'https://aliceventures.io', 'support@aliceventures.io', '+2348012345678', '14 Broad Street', 'Lagos', 'Lagos', 'NG', '100001', 'active', NOW()
WHERE NOT EXISTS (SELECT 1 FROM merchant_profiles WHERE user_id=9001);

INSERT INTO merchant_profiles (user_id, business_name, business_type, registration_number, tax_id, website, support_email, support_phone, address_line1, city, state, country, postal_code, status, created_at)
SELECT 9002, 'Bob Commerce Inc', 'ecommerce', 'RC654321', 'TIN123789', 'https://bobcommerce.ng', 'help@bobcommerce.ng', '+2348098765432', '22 Marina Road', 'Abuja', 'FCT', 'NG', '900001', 'active', NOW()
WHERE NOT EXISTS (SELECT 1 FROM merchant_profiles WHERE user_id=9002);

-- ============================================================
-- CUSTOMERS
-- ============================================================
INSERT INTO customers (merchant_id, email, name, phone, country, status, created_at) VALUES
  (9001, 'customer1@example.com', 'John Doe', '+2348011111111', 'NG', 'active', NOW()),
  (9001, 'customer2@example.com', 'Jane Smith', '+2348022222222', 'NG', 'active', NOW()),
  (9001, 'customer3@example.com', 'Mike Johnson', '+2348033333333', 'GH', 'active', NOW()),
  (9002, 'customer4@example.com', 'Sarah Williams', '+2348044444444', 'NG', 'active', NOW()),
  (9002, 'customer5@example.com', 'Tom Brown', '+2348055555555', 'KE', 'inactive', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- API KEYS
-- ============================================================
INSERT INTO api_keys (user_id, name, key_prefix, key_hash, permissions, is_active, expires_at, created_at) VALUES
  (9001, 'Production Key', 'pk_live_9001', encode(sha256('pk_live_9001_secret'::bytea), 'hex'), ARRAY['read', 'write', 'webhook'], true, NOW() + INTERVAL '1 year', NOW()),
  (9001, 'Test Key', 'pk_test_9001', encode(sha256('pk_test_9001_secret'::bytea), 'hex'), ARRAY['read'], true, NOW() + INTERVAL '1 year', NOW()),
  (9002, 'Production Key', 'pk_live_9002', encode(sha256('pk_live_9002_secret'::bytea), 'hex'), ARRAY['read', 'write'], true, NOW() + INTERVAL '1 year', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- AUDIT EVENTS
-- ============================================================
INSERT INTO audit_events (user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at) VALUES
  (9001, 'login', 'session', 'sess_001', '192.168.1.1', 'Mozilla/5.0', '{"browser":"Chrome"}', NOW() - INTERVAL '2 days'),
  (9001, 'api_key_created', 'api_key', '1', '192.168.1.1', 'Mozilla/5.0', '{"key_name":"Production Key"}', NOW() - INTERVAL '1 day'),
  (9002, 'login', 'session', 'sess_002', '10.0.0.1', 'Mozilla/5.0', '{"browser":"Firefox"}', NOW() - INTERVAL '3 hours'),
  (9003, 'user_role_changed', 'user', '9001', '10.0.0.2', 'Mozilla/5.0', '{"old_role":"user","new_role":"admin"}', NOW() - INTERVAL '1 hour'),
  (9001, 'payout_created', 'payout', 'payout_001', '192.168.1.1', 'Mozilla/5.0', '{"amount":50000}', NOW() - INTERVAL '30 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WEBHOOKS & WEBHOOK DELIVERIES
-- ============================================================
INSERT INTO webhooks (merchant_id, url, events, secret, is_active, created_at) VALUES
  (9001, 'https://aliceventures.io/webhooks/paygate', ARRAY['payment.completed', 'payout.processed', 'dispute.created'], 'whsec_alice_9001_secret', true, NOW()),
  (9002, 'https://bobcommerce.ng/webhooks/paygate', ARRAY['payment.completed', 'refund.created'], 'whsec_bob_9002_secret', true, NOW())
ON CONFLICT DO NOTHING;

-- Get webhook IDs for deliveries
DO $$
DECLARE v_wh_id INTEGER;
BEGIN
  SELECT id INTO v_wh_id FROM webhooks WHERE merchant_id=9001 LIMIT 1;
  IF v_wh_id IS NOT NULL THEN
    INSERT INTO webhook_deliveries (webhook_id, event_type, payload, status, response_code, response_body, attempt_count, created_at)
    VALUES
      (v_wh_id, 'payment.completed', '{"id":"pay_001","amount":25000}', 'delivered', 200, '{"ok":true}', 1, NOW() - INTERVAL '2 hours'),
      (v_wh_id, 'payout.processed', '{"id":"pout_001","amount":10000}', 'delivered', 200, '{"ok":true}', 1, NOW() - INTERVAL '1 hour'),
      (v_wh_id, 'dispute.created', '{"id":"disp_001","amount":5000}', 'failed', 500, '{"error":"Internal Server Error"}', 3, NOW() - INTERVAL '30 minutes')
    ON CONFLICT DO NOTHING;
  END IF;
END $$;

-- ============================================================
-- PAYOUTS
-- ============================================================
INSERT INTO payouts (merchant_id, amount, currency, status, bank_code, account_number, account_name, reference, narration, created_at) VALUES
  (9001, 50000.00, 'NGN', 'pending', '058', '0123456789', 'Alice Ventures Ltd', 'PO-2026-001', 'Monthly settlement', NOW() - INTERVAL '1 day'),
  (9001, 25000.00, 'NGN', 'completed', '033', '9876543210', 'Alice Ventures Ltd', 'PO-2026-002', 'Weekly payout', NOW() - INTERVAL '3 days'),
  (9002, 75000.00, 'NGN', 'pending', '044', '1122334455', 'Bob Commerce Inc', 'PO-2026-003', 'Quarterly settlement', NOW() - INTERVAL '2 hours'),
  (9002, 10000.00, 'NGN', 'failed', '058', '5544332211', 'Bob Commerce Inc', 'PO-2026-004', 'Test payout', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DISPUTES
-- ============================================================
INSERT INTO disputes (merchant_id, transaction_id, amount, currency, reason, status, evidence_url, resolution_notes, created_at) VALUES
  (9001, 'txn_001', 15000.00, 'NGN', 'unauthorized_charge', 'open', NULL, NULL, NOW() - INTERVAL '2 days'),
  (9001, 'txn_002', 8500.00, 'NGN', 'product_not_received', 'under_review', 'https://cdn.paygate.io/evidence/disp_002.pdf', NULL, NOW() - INTERVAL '5 days'),
  (9002, 'txn_003', 22000.00, 'NGN', 'duplicate_charge', 'resolved', NULL, 'Refund issued to customer', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PAYMENT LINKS
-- ============================================================
INSERT INTO payment_links (merchant_id, title, description, amount, currency, is_fixed_amount, max_uses, use_count, expires_at, status, slug, created_at) VALUES
  (9001, 'Invoice #INV-2026-001', 'Payment for consulting services', 150000.00, 'NGN', true, 1, 0, NOW() + INTERVAL '30 days', 'active', 'inv-2026-001-alice', NOW()),
  (9001, 'Product Bundle A', 'Premium product bundle', 45000.00, 'NGN', true, 100, 12, NOW() + INTERVAL '60 days', 'active', 'bundle-a-alice', NOW()),
  (9002, 'Service Fee Q2', 'Quarterly service fee', 200000.00, 'NGN', true, 1, 0, NOW() + INTERVAL '14 days', 'active', 'svc-q2-bob', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- VIRTUAL CARDS
-- ============================================================
INSERT INTO virtual_cards (merchant_id, card_number_masked, card_type, currency, balance, status, expiry_month, expiry_year, billing_address, created_at) VALUES
  (9001, '4111 **** **** 1234', 'visa', 'USD', 500.00, 'active', 12, 2028, '14 Broad Street, Lagos', NOW()),
  (9001, '5500 **** **** 5678', 'mastercard', 'USD', 250.00, 'active', 6, 2027, '14 Broad Street, Lagos', NOW()),
  (9002, '4111 **** **** 9012', 'visa', 'USD', 1000.00, 'frozen', 3, 2029, '22 Marina Road, Abuja', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- INVOICES & INVOICE PAYMENTS
-- ============================================================
INSERT INTO invoices (merchant_id, customer_id, invoice_number, amount, tax_amount, total_amount, currency, status, due_date, items, notes, created_at)
SELECT 9001, c.id, 'INV-2026-001', 100000.00, 7500.00, 107500.00, 'NGN', 'sent', NOW() + INTERVAL '30 days', '[{"description":"Consulting","qty":1,"unit_price":100000}]', 'Net 30', NOW()
FROM customers c WHERE c.email='customer1@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO invoices (merchant_id, customer_id, invoice_number, amount, tax_amount, total_amount, currency, status, due_date, items, notes, created_at)
SELECT 9001, c.id, 'INV-2026-002', 50000.00, 3750.00, 53750.00, 'NGN', 'paid', NOW() - INTERVAL '5 days', '[{"description":"Design","qty":1,"unit_price":50000}]', NULL, NOW() - INTERVAL '10 days'
FROM customers c WHERE c.email='customer2@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

-- Invoice payments
INSERT INTO invoice_payments (invoice_id, amount, payment_method, reference, status, paid_at, created_at)
SELECT i.id, 53750.00, 'bank_transfer', 'PAY-INV-2026-002', 'completed', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
FROM invoices i WHERE i.invoice_number='INV-2026-002' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- WALLETS & WALLET TRANSACTIONS
-- ============================================================
INSERT INTO wallets (merchant_id, currency, balance, ledger_balance, status, created_at) VALUES
  (9001, 'NGN', 250000.00, 250000.00, 'active', NOW()),
  (9001, 'USD', 500.00, 500.00, 'active', NOW()),
  (9002, 'NGN', 180000.00, 180000.00, 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO wallet_transactions (wallet_id, type, amount, currency, balance_before, balance_after, reference, description, status, created_at)
SELECT w.id, 'credit', 50000.00, 'NGN', 200000.00, 250000.00, 'WT-001', 'Payment received', 'completed', NOW() - INTERVAL '1 day'
FROM wallets w WHERE w.merchant_id=9001 AND w.currency='NGN' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER WALLETS & TRANSACTIONS
-- ============================================================
INSERT INTO consumer_wallets (user_id, currency, balance, status, created_at) VALUES
  (9001, 'NGN', 15000.00, 'active', NOW()),
  (9002, 'NGN', 8500.00, 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO consumer_wallet_txns (wallet_id, type, amount, currency, reference, description, status, created_at)
SELECT w.id, 'debit', 2500.00, 'NGN', 'CWT-001', 'Airtime purchase', 'completed', NOW() - INTERVAL '2 hours'
FROM consumer_wallets w WHERE w.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- BILL PAYMENTS
-- ============================================================
INSERT INTO bill_payments (user_id, biller_code, biller_name, customer_id_field, amount, currency, status, reference, response_code, created_at) VALUES
  (9001, 'DSTV', 'DStv Subscription', 'IUC-1234567890', 4600.00, 'NGN', 'completed', 'BP-2026-001', '000', NOW() - INTERVAL '3 days'),
  (9001, 'EKEDC', 'Eko Electricity', 'METER-9876543', 10000.00, 'NGN', 'completed', 'BP-2026-002', '000', NOW() - INTERVAL '1 day'),
  (9002, 'MTN', 'MTN Airtime', '08012345678', 1000.00, 'NGN', 'completed', 'BP-2026-003', '000', NOW() - INTERVAL '5 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- BNPL PLANS & LOANS
-- ============================================================
INSERT INTO bnpl_plans (name, description, min_amount, max_amount, tenure_months, interest_rate, processing_fee_pct, is_active, created_at) VALUES
  ('PayLater 3M', 'Buy now, pay in 3 months', 5000.00, 500000.00, 3, 2.5, 1.0, true, NOW()),
  ('PayLater 6M', 'Buy now, pay in 6 months', 10000.00, 1000000.00, 6, 3.5, 1.5, true, NOW()),
  ('PayLater 12M', 'Buy now, pay in 12 months', 25000.00, 2000000.00, 12, 5.0, 2.0, true, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO bnpl_loans (user_id, plan_id, principal_amount, interest_amount, total_amount, outstanding_balance, currency, status, purpose, disbursed_at, due_date, created_at)
SELECT 9001, p.id, 50000.00, 1250.00, 51250.00, 51250.00, 'NGN', 'active', 'Electronics purchase', NOW() - INTERVAL '10 days', NOW() + INTERVAL '80 days', NOW() - INTERVAL '10 days'
FROM bnpl_plans p WHERE p.name='PayLater 3M' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO bnpl_repayment_schedules (loan_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, status, created_at)
SELECT l.id, 1, NOW() + INTERVAL '30 days', 16666.67, 416.67, 17083.34, 'pending', NOW()
FROM bnpl_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO bnpl_repayment_schedules (loan_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, status, created_at)
SELECT l.id, 2, NOW() + INTERVAL '60 days', 16666.67, 416.67, 17083.34, 'pending', NOW()
FROM bnpl_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO bnpl_repayment_schedules (loan_id, instalment_number, due_date, principal_amount, interest_amount, total_amount, status, created_at)
SELECT l.id, 3, NOW() + INTERVAL '90 days', 16666.66, 416.66, 17083.32, 'pending', NOW()
FROM bnpl_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- BNPL APPLICATIONS
-- ============================================================
INSERT INTO bnpl_applications (user_id, plan_id, requested_amount, purpose, employment_status, monthly_income, credit_score, status, decision_reason, created_at)
SELECT 9002, p.id, 100000.00, 'Home appliances', 'employed', 250000.00, 720, 'approved', 'Good credit score and stable income', NOW() - INTERVAL '2 days'
FROM bnpl_plans p WHERE p.name='PayLater 6M' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- BNPL DELINQUENCY CASES
-- ============================================================
INSERT INTO bnpl_delinquency_cases (loan_id, user_id, days_overdue, overdue_amount, status, escalation_level, notes, created_at)
SELECT l.id, l.user_id, 15, 17083.34, 'active', 1, 'First reminder sent', NOW() - INTERVAL '5 days'
FROM bnpl_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER LOYALTY ACCOUNTS & TRANSACTIONS
-- ============================================================
INSERT INTO consumer_loyalty_accounts (user_id, points_balance, lifetime_points, tier, created_at) VALUES
  (9001, 2500, 5000, 'silver', NOW()),
  (9002, 750, 750, 'bronze', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO consumer_loyalty_txns (account_id, type, points, reference, description, created_at)
SELECT a.id, 'earn', 500, 'TXN-EARN-001', 'Points earned on purchase', NOW() - INTERVAL '3 days'
FROM consumer_loyalty_accounts a WHERE a.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOYALTY ACCOUNTS & TRANSACTIONS (merchant)
-- ============================================================
INSERT INTO loyalty_accounts (merchant_id, customer_id, points_balance, tier, created_at)
SELECT 9001, c.id, 1200, 'silver', NOW()
FROM customers c WHERE c.email='customer1@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO loyalty_transactions (account_id, type, points, reference, description, created_at)
SELECT a.id, 'earn', 200, 'LTX-001', 'Purchase reward', NOW() - INTERVAL '2 days'
FROM loyalty_accounts a WHERE a.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- P2P TRANSFERS
-- ============================================================
INSERT INTO p2p_transfers (sender_id, receiver_id, amount, currency, status, reference, narration, created_at) VALUES
  (9001, 9002, 5000.00, 'NGN', 'completed', 'P2P-2026-001', 'Lunch split', NOW() - INTERVAL '1 day'),
  (9002, 9001, 2500.00, 'NGN', 'completed', 'P2P-2026-002', 'Reimbursement', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- MONEY REQUESTS
-- ============================================================
INSERT INTO money_requests (requester_id, requestee_id, amount, currency, status, message, reference, expires_at, created_at) VALUES
  (9001, 9002, 10000.00, 'NGN', 'pending', 'Please pay for the project', 'MR-2026-001', NOW() + INTERVAL '7 days', NOW()),
  (9002, 9001, 3500.00, 'NGN', 'completed', 'Dinner bill', 'MR-2026-002', NOW() + INTERVAL '3 days', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- QR PAYMENTS
-- ============================================================
INSERT INTO qr_payments (merchant_id, amount, currency, status, qr_code_data, reference, customer_id, created_at)
SELECT 9001, 5000.00, 'NGN', 'completed', 'QR:paygate:9001:5000:NGN:QR-001', 'QR-2026-001', c.id, NOW() - INTERVAL '3 hours'
FROM customers c WHERE c.email='customer1@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- FRAUD ALERTS & COMMENTS
-- ============================================================
INSERT INTO fraud_alerts (merchant_id, transaction_id, alert_type, risk_score, status, details, created_at) VALUES
  (9001, 'txn_fraud_001', 'velocity_check', 87.5, 'open', '{"reason":"Multiple transactions in 5 minutes","count":8}', NOW() - INTERVAL '1 hour'),
  (9001, 'txn_fraud_002', 'geo_anomaly', 92.0, 'investigating', '{"reason":"Transaction from unusual location","country":"RU"}', NOW() - INTERVAL '3 hours'),
  (9002, 'txn_fraud_003', 'card_testing', 78.0, 'resolved', '{"reason":"Multiple small amount attempts"}', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

INSERT INTO fraud_alert_comments (alert_id, user_id, comment, created_at)
SELECT a.id, 9003, 'Confirmed fraud. Card blocked and customer notified.', NOW() - INTERVAL '30 minutes'
FROM fraud_alerts a WHERE a.transaction_id='txn_fraud_002' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- COMPLIANCE REPORTS
-- ============================================================
INSERT INTO compliance_reports (merchant_id, report_type, period_start, period_end, status, file_url, generated_by, created_at) VALUES
  (9001, 'AML', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day', 'completed', 'https://cdn.paygate.io/reports/aml-9001-q1-2026.pdf', 9003, NOW() - INTERVAL '1 day'),
  (9001, 'PCI_DSS', NOW() - INTERVAL '91 days', NOW() - INTERVAL '1 day', 'completed', 'https://cdn.paygate.io/reports/pci-9001-q1-2026.pdf', 9003, NOW() - INTERVAL '2 days'),
  (9002, 'CBN_RETURNS', NOW() - INTERVAL '31 days', NOW() - INTERVAL '1 day', 'pending', NULL, 9003, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- REGULATORY REPORTS
-- ============================================================
INSERT INTO regulatory_reports (merchant_id, report_type, reporting_period, submission_deadline, status, data_summary, submitted_at, created_at) VALUES
  (9001, 'NIBSS_DAILY', NOW() - INTERVAL '1 day', NOW(), 'submitted', '{"total_transactions":245,"total_value":1250000}', NOW(), NOW()),
  (9001, 'CBN_MONTHLY', NOW() - INTERVAL '31 days', NOW() + INTERVAL '5 days', 'draft', '{"total_transactions":5420,"total_value":28500000}', NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CROSS BORDER TRANSFERS
-- ============================================================
INSERT INTO cross_border_transfers (sender_id, recipient_name, recipient_bank, recipient_account, recipient_country, send_amount, send_currency, receive_amount, receive_currency, exchange_rate, fee_amount, status, reference, created_at) VALUES
  (9001, 'James Okonkwo', 'Ecobank Ghana', 'GH-ACC-001', 'GH', 50000.00, 'NGN', 500.00, 'GHS', 100.0, 1500.00, 'completed', 'CBT-2026-001', NOW() - INTERVAL '2 days'),
  (9002, 'Mary Kamau', 'Equity Bank Kenya', 'KE-ACC-002', 'KE', 100000.00, 'NGN', 2000.00, 'KES', 50.0, 2500.00, 'pending', 'CBT-2026-002', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- FX RATES
-- ============================================================
INSERT INTO fx_rates (base_currency, quote_currency, rate, source, valid_from, valid_to, created_at) VALUES
  ('NGN', 'USD', 0.000625, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW()),
  ('NGN', 'GBP', 0.000500, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW()),
  ('NGN', 'EUR', 0.000580, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW()),
  ('NGN', 'GHS', 0.010000, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW()),
  ('NGN', 'KES', 0.050000, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW()),
  ('USD', 'NGN', 1600.00, 'CBN', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- TRANSACTION RECEIPTS
-- ============================================================
INSERT INTO transaction_receipts (transaction_id, merchant_id, receipt_number, amount, currency, payment_method, status, receipt_url, created_at) VALUES
  ('txn_001', 9001, 'RCP-2026-001', 25000.00, 'NGN', 'card', 'issued', 'https://cdn.paygate.io/receipts/RCP-2026-001.pdf', NOW() - INTERVAL '1 day'),
  ('txn_002', 9001, 'RCP-2026-002', 8500.00, 'NGN', 'bank_transfer', 'issued', 'https://cdn.paygate.io/receipts/RCP-2026-002.pdf', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- IDEMPOTENCY REQUESTS
-- ============================================================
INSERT INTO idempotency_requests (idempotency_key, merchant_id, endpoint, request_hash, response_code, response_body, expires_at, created_at) VALUES
  ('idem_key_001', 9001, '/api/trpc/payments.create', 'hash_001', 200, '{"id":"pay_001","status":"success"}', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '2 hours'),
  ('idem_key_002', 9002, '/api/trpc/payouts.create', 'hash_002', 200, '{"id":"pout_001","status":"pending"}', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- SAVED BENEFICIARIES
-- ============================================================
INSERT INTO saved_beneficiaries (user_id, bank_code, bank_name, account_number, account_name, is_verified, created_at) VALUES
  (9001, '058', 'GTBank', '0123456789', 'James Okonkwo', true, NOW()),
  (9001, '033', 'UBA', '9876543210', 'Mary Kamau', true, NOW()),
  (9002, '044', 'Access Bank', '1122334455', 'Peter Eze', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- MERCHANT NOTIFICATIONS
-- ============================================================
INSERT INTO merchant_notifications (merchant_id, type, title, message, is_read, metadata, created_at) VALUES
  (9001, 'payment_received', 'Payment Received', 'You received NGN 25,000 from customer1@example.com', false, '{"transaction_id":"txn_001"}', NOW() - INTERVAL '1 hour'),
  (9001, 'payout_completed', 'Payout Completed', 'Your payout of NGN 25,000 has been processed', true, '{"payout_id":"PO-2026-002"}', NOW() - INTERVAL '3 days'),
  (9002, 'dispute_created', 'New Dispute', 'A dispute has been filed for transaction txn_003', false, '{"dispute_id":"disp_001"}', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- MERCHANT STATUS LOG
-- ============================================================
INSERT INTO merchant_status_log (merchant_id, old_status, new_status, reason, changed_by, created_at) VALUES
  (9001, 'pending', 'active', 'KYB verification completed', 9003, NOW() - INTERVAL '30 days'),
  (9002, 'pending', 'active', 'KYB verification completed', 9003, NOW() - INTERVAL '25 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- KYB VERIFICATIONS & STEPS
-- ============================================================
INSERT INTO kyb_verifications (merchant_id, status, submitted_at, reviewed_at, reviewer_id, notes, created_at) VALUES
  (9001, 'approved', NOW() - INTERVAL '31 days', NOW() - INTERVAL '30 days', 9003, 'All documents verified', NOW() - INTERVAL '31 days'),
  (9002, 'approved', NOW() - INTERVAL '26 days', NOW() - INTERVAL '25 days', 9003, 'All documents verified', NOW() - INTERVAL '26 days')
ON CONFLICT DO NOTHING;

INSERT INTO kyb_steps (verification_id, step_name, status, document_url, notes, completed_at, created_at)
SELECT v.id, 'business_registration', 'completed', 'https://cdn.paygate.io/kyb/9001-rc.pdf', 'RC certificate verified', NOW() - INTERVAL '30 days', NOW() - INTERVAL '31 days'
FROM kyb_verifications v WHERE v.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- KYC SUBMISSIONS
-- ============================================================
INSERT INTO kyc_submissions (user_id, document_type, document_number, document_url, status, verified_at, created_at) VALUES
  (9001, 'national_id', 'NIN-12345678901', 'https://cdn.paygate.io/kyc/9001-nin.jpg', 'approved', NOW() - INTERVAL '30 days', NOW() - INTERVAL '31 days'),
  (9002, 'passport', 'A12345678', 'https://cdn.paygate.io/kyc/9002-passport.jpg', 'approved', NOW() - INTERVAL '25 days', NOW() - INTERVAL '26 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER KYC RECORDS
-- ============================================================
INSERT INTO consumer_kyc_records (user_id, bvn, nin, bvn_verified, nin_verified, face_match_score, kyc_level, verified_at, created_at) VALUES
  (9001, '22345678901', '12345678901', true, true, 98.5, 3, NOW() - INTERVAL '30 days', NOW() - INTERVAL '31 days'),
  (9002, '22987654321', '98765432100', true, false, 95.0, 2, NOW() - INTERVAL '25 days', NOW() - INTERVAL '26 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER FRAUD FLAGS
-- ============================================================
INSERT INTO consumer_fraud_flags (user_id, flag_type, severity, description, status, created_by, resolved_at, created_at) VALUES
  (9002, 'suspicious_login', 'medium', 'Login from new device in unusual location', 'open', 9003, NULL, NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER PHONE VERIFICATIONS
-- ============================================================
INSERT INTO consumer_phone_verifications (user_id, phone_number, otp_code, is_verified, expires_at, verified_at, created_at) VALUES
  (9001, '+2348012345678', '123456', true, NOW() - INTERVAL '29 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
  (9002, '+2348098765432', '654321', true, NOW() - INTERVAL '24 days', NOW() - INTERVAL '25 days', NOW() - INTERVAL '25 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER PINS
-- ============================================================
INSERT INTO consumer_pins (user_id, pin_hash, is_active, failed_attempts, locked_until, created_at) VALUES
  (9001, encode(sha256('1234'::bytea), 'hex'), true, 0, NULL, NOW()),
  (9002, encode(sha256('5678'::bytea), 'hex'), true, 0, NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER CONTACTS
-- ============================================================
INSERT INTO consumer_contacts (user_id, contact_user_id, nickname, is_favourite, created_at) VALUES
  (9001, 9002, 'Bob', true, NOW()),
  (9002, 9001, 'Alice', false, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER NOTIFICATION PREFS
-- ============================================================
INSERT INTO consumer_notification_prefs (user_id, email_enabled, sms_enabled, push_enabled, transaction_alerts, marketing, created_at) VALUES
  (9001, true, true, true, true, false, NOW()),
  (9002, true, false, true, true, true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER INSURANCE POLICIES & CLAIMS
-- ============================================================
INSERT INTO consumer_insurance_policies (user_id, policy_type, provider, policy_number, coverage_amount, premium_amount, currency, status, start_date, end_date, created_at) VALUES
  (9001, 'device_protection', 'AXA Mansard', 'POL-2026-001', 150000.00, 2500.00, 'NGN', 'active', NOW() - INTERVAL '60 days', NOW() + INTERVAL '305 days', NOW() - INTERVAL '60 days')
ON CONFLICT DO NOTHING;

INSERT INTO consumer_insurance_claims (policy_id, user_id, claim_type, claim_amount, description, status, submitted_at, created_at)
SELECT p.id, 9001, 'device_damage', 50000.00, 'Phone screen cracked', 'under_review', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'
FROM consumer_insurance_policies p WHERE p.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER RECURRING PAYMENTS
-- ============================================================
INSERT INTO consumer_recurring_payments (user_id, name, amount, currency, frequency, next_run_at, status, biller_code, customer_ref, created_at) VALUES
  (9001, 'DStv Monthly', 4600.00, 'NGN', 'monthly', NOW() + INTERVAL '25 days', 'active', 'DSTV', 'IUC-1234567890', NOW()),
  (9001, 'Electricity Bill', 10000.00, 'NGN', 'monthly', NOW() + INTERVAL '15 days', 'active', 'EKEDC', 'METER-9876543', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER SPLIT SESSIONS & PARTICIPANTS
-- ============================================================
INSERT INTO consumer_split_sessions (creator_id, title, total_amount, currency, status, created_at) VALUES
  (9001, 'Team Lunch', 25000.00, 'NGN', 'active', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

INSERT INTO consumer_split_participants (session_id, user_id, amount_owed, amount_paid, status, created_at)
SELECT s.id, 9001, 12500.00, 12500.00, 'paid', NOW() - INTERVAL '1 hour'
FROM consumer_split_sessions s WHERE s.creator_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO consumer_split_participants (session_id, user_id, amount_owed, amount_paid, status, created_at)
SELECT s.id, 9002, 12500.00, 0.00, 'pending', NOW() - INTERVAL '1 hour'
FROM consumer_split_sessions s WHERE s.creator_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- CONSUMER FINANCE LOANS
-- ============================================================
INSERT INTO consumer_finance_loans (user_id, loan_type, principal, interest_rate, tenure_months, monthly_payment, outstanding_balance, status, disbursed_at, created_at) VALUES
  (9001, 'personal', 200000.00, 3.5, 12, 18166.67, 200000.00, 'active', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOAN INSTALMENTS & REPAYMENTS
-- ============================================================
INSERT INTO loan_instalments (loan_id, instalment_number, due_date, amount, principal_component, interest_component, status, created_at)
SELECT l.id, 1, NOW() + INTERVAL '25 days', 18166.67, 12500.00, 5666.67, 'pending', NOW()
FROM consumer_finance_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO loan_repayments (loan_id, amount, payment_method, reference, status, paid_at, created_at)
SELECT l.id, 18166.67, 'wallet', 'LR-2026-001', 'completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
FROM consumer_finance_loans l WHERE l.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- INSURANCE POLICIES (merchant)
-- ============================================================
INSERT INTO insurance_policies (merchant_id, policy_type, provider, policy_number, coverage_amount, premium, currency, status, start_date, end_date, created_at) VALUES
  (9001, 'business_interruption', 'Leadway Assurance', 'BIZ-POL-001', 5000000.00, 50000.00, 'NGN', 'active', NOW() - INTERVAL '90 days', NOW() + INTERVAL '275 days', NOW() - INTERVAL '90 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ESCROW CONTRACTS
-- ============================================================
INSERT INTO escrow_contracts (buyer_id, seller_id, amount, currency, description, status, release_conditions, expires_at, created_at) VALUES
  (9001, 9002, 500000.00, 'NGN', 'Software development project', 'funded', 'Delivery of working software', NOW() + INTERVAL '90 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- REFERRALS
-- ============================================================
INSERT INTO referrals (referrer_id, referee_id, referral_code, reward_amount, currency, status, created_at) VALUES
  (9001, 9002, 'REF-ALICE-001', 1000.00, 'NGN', 'completed', NOW() - INTERVAL '25 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PURCHASE ORDERS
-- ============================================================
INSERT INTO purchase_orders (merchant_id, vendor_name, items, total_amount, currency, status, notes, created_at) VALUES
  (9001, 'Tech Supplies Ltd', '[{"item":"Laptop","qty":2,"price":250000}]', 500000.00, 'NGN', 'approved', 'Urgent delivery needed', NOW() - INTERVAL '3 days'),
  (9002, 'Office Depot NG', '[{"item":"Office Chair","qty":5,"price":45000}]', 225000.00, 'NGN', 'pending', NULL, NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PAYROLL
-- ============================================================
INSERT INTO payroll_v3_employees (merchant_id, employee_id, name, email, department, position, basic_salary, bank_code, account_number, account_name, status, created_at) VALUES
  (9001, 'EMP-001', 'David Adeyemi', 'david@aliceventures.io', 'Engineering', 'Senior Developer', 350000.00, '058', '0123456789', 'David Adeyemi', 'active', NOW()),
  (9001, 'EMP-002', 'Grace Okafor', 'grace@aliceventures.io', 'Finance', 'Accountant', 250000.00, '033', '9876543210', 'Grace Okafor', 'active', NOW()),
  (9002, 'EMP-003', 'Henry Nwosu', 'henry@bobcommerce.ng', 'Sales', 'Sales Manager', 300000.00, '044', '1122334455', 'Henry Nwosu', 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO payroll_v3_runs (merchant_id, run_date, period_start, period_end, total_gross, total_deductions, total_net, employee_count, status, created_at)
SELECT 9001, NOW() - INTERVAL '5 days', NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days', 600000.00, 60000.00, 540000.00, 2, 'completed', NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM payroll_v3_runs WHERE merchant_id=9001)
ON CONFLICT DO NOTHING;

-- ============================================================
-- PAYROLL RUNS (legacy)
-- ============================================================
INSERT INTO payroll_runs (merchant_id, period_start, period_end, total_amount, employee_count, status, created_at)
SELECT 9001, NOW() - INTERVAL '35 days', NOW() - INTERVAL '5 days', 540000.00, 2, 'completed', NOW() - INTERVAL '5 days'
WHERE NOT EXISTS (SELECT 1 FROM payroll_runs WHERE merchant_id=9001)
ON CONFLICT DO NOTHING;

-- ============================================================
-- STAFF MEMBERS & SHIFTS
-- ============================================================
INSERT INTO staff_members (merchant_id, name, email, role, department, status, created_at) VALUES
  (9001, 'David Adeyemi', 'david@aliceventures.io', 'developer', 'Engineering', 'active', NOW()),
  (9001, 'Grace Okafor', 'grace@aliceventures.io', 'accountant', 'Finance', 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO staff_shifts (staff_id, shift_date, start_time, end_time, hours_worked, status, created_at)
SELECT s.id, CURRENT_DATE, '09:00:00', '17:00:00', 8.0, 'completed', NOW()
FROM staff_members s WHERE s.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TEAM MEMBERS
-- ============================================================
INSERT INTO team_members (merchant_id, user_id, role, permissions, invited_by, status, created_at) VALUES
  (9001, 9001, 'owner', ARRAY['all'], 9001, 'active', NOW()),
  (9001, 9003, 'admin', ARRAY['read', 'write', 'manage'], 9001, 'active', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- SUBSCRIPTION PLANS & SUBSCRIBERS
-- ============================================================
INSERT INTO subscription_plans_v2 (merchant_id, name, description, amount, currency, interval, interval_count, features, is_active, created_at) VALUES
  (9001, 'Basic Plan', 'Essential features', 5000.00, 'NGN', 'monthly', 1, '["API access","Dashboard","Basic support"]', true, NOW()),
  (9001, 'Pro Plan', 'Advanced features', 15000.00, 'NGN', 'monthly', 1, '["API access","Dashboard","Priority support","Analytics"]', true, NOW()),
  (9001, 'Enterprise Plan', 'Full features', 50000.00, 'NGN', 'monthly', 1, '["API access","Dashboard","24/7 support","Analytics","Custom integrations"]', true, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO subscription_subscribers (plan_id, customer_id, status, current_period_start, current_period_end, created_at)
SELECT p.id, c.id, 'active', NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days'
FROM subscription_plans_v2 p, customers c WHERE p.name='Pro Plan' AND c.email='customer1@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO subscription_charges (subscriber_id, amount, currency, status, charged_at, created_at)
SELECT s.id, 15000.00, 'NGN', 'completed', NOW() - INTERVAL '15 days', NOW() - INTERVAL '15 days'
FROM subscription_subscribers s LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- SUBSCRIPTIONS (legacy)
-- ============================================================
INSERT INTO subscriptions (merchant_id, plan_name, amount, currency, status, current_period_end, created_at) VALUES
  (9001, 'Pro Plan', 15000.00, 'NGN', 'active', NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  (9002, 'Basic Plan', 5000.00, 'NGN', 'active', NOW() + INTERVAL '20 days', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PORTAL SUBSCRIPTIONS
-- ============================================================
INSERT INTO portal_subscriptions (merchant_id, plan, status, billing_cycle, amount, currency, next_billing_date, created_at) VALUES
  (9001, 'pro', 'active', 'monthly', 15000.00, 'NGN', NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days'),
  (9002, 'basic', 'active', 'monthly', 5000.00, 'NGN', NOW() + INTERVAL '20 days', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- BULK COLLECTIONS & ITEMS
-- ============================================================
INSERT INTO bulk_payment_schedules (merchant_id, name, total_amount, currency, status, scheduled_at, created_at) VALUES
  (9001, 'March Vendor Payments', 500000.00, 'NGN', 'pending', NOW() + INTERVAL '2 days', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- MOBILE MONEY RECON
-- ============================================================
INSERT INTO mobile_money_recon (merchant_id, provider, transaction_id, amount, currency, status, reconciled, recon_date, created_at) VALUES
  (9001, 'MTN_MOMO', 'MOMO-001', 5000.00, 'NGN', 'completed', true, CURRENT_DATE, NOW() - INTERVAL '1 day'),
  (9001, 'AIRTEL_MONEY', 'AIRTEL-001', 3000.00, 'NGN', 'completed', false, NULL, NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- NIBSS ENQUIRY LOGS
-- ============================================================
INSERT INTO nibss_enquiry_logs (merchant_id, account_number, bank_code, account_name, status, response_code, created_at) VALUES
  (9001, '0123456789', '058', 'James Okonkwo', 'success', '00', NOW() - INTERVAL '1 hour'),
  (9001, '9876543210', '033', 'Mary Kamau', 'success', '00', NOW() - INTERVAL '30 minutes'),
  (9002, '1122334455', '044', 'Peter Eze', 'failed', '01', NOW() - INTERVAL '15 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================
-- NIP ACCOUNT CACHE
-- ============================================================
INSERT INTO nip_account_cache (account_number, bank_code, account_name, verified_at, expires_at, created_at) VALUES
  ('0123456789', '058', 'James Okonkwo', NOW() - INTERVAL '1 hour', NOW() + INTERVAL '23 hours', NOW() - INTERVAL '1 hour'),
  ('9876543210', '033', 'Mary Kamau', NOW() - INTERVAL '30 minutes', NOW() + INTERVAL '23 hours', NOW() - INTERVAL '30 minutes')
ON CONFLICT DO NOTHING;

-- ============================================================
-- NODAL ACCOUNTS & TRANSACTIONS
-- ============================================================
INSERT INTO nodal_accounts (merchant_id, account_number, bank_code, bank_name, balance, currency, status, created_at) VALUES
  (9001, 'NODAL-9001-001', '058', 'GTBank', 1000000.00, 'NGN', 'active', NOW()),
  (9002, 'NODAL-9002-001', '033', 'UBA', 500000.00, 'NGN', 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO nodal_transactions (nodal_account_id, type, amount, currency, reference, description, status, created_at)
SELECT na.id, 'credit', 250000.00, 'NGN', 'NT-2026-001', 'Settlement inflow', 'completed', NOW() - INTERVAL '1 day'
FROM nodal_accounts na WHERE na.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- MULTI-CURRENCY LEDGER
-- ============================================================
INSERT INTO multi_currency_ledger_accounts (merchant_id, currency, balance, hold_balance, status, created_at) VALUES
  (9001, 'USD', 1000.00, 0.00, 'active', NOW()),
  (9001, 'GBP', 500.00, 0.00, 'active', NOW()),
  (9001, 'EUR', 750.00, 0.00, 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO multi_currency_ledger_entries (account_id, type, amount, currency, exchange_rate, reference, description, created_at)
SELECT a.id, 'credit', 100.00, 'USD', 1600.00, 'MCL-2026-001', 'USD receipt', NOW() - INTERVAL '1 day'
FROM multi_currency_ledger_accounts a WHERE a.merchant_id=9001 AND a.currency='USD' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- POS TERMINALS & TRANSACTIONS
-- ============================================================
INSERT INTO pos_terminals (merchant_id, terminal_id, serial_number, model, status, location, created_at) VALUES
  (9001, 'TID-9001-001', 'SN-ABC123456', 'Verifone VX520', 'active', 'Lagos Head Office', NOW()),
  (9002, 'TID-9002-001', 'SN-DEF789012', 'Ingenico iCT220', 'active', 'Abuja Branch', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO pos_transactions (terminal_id, merchant_id, amount, currency, card_type, masked_pan, status, reference, created_at)
SELECT t.id, 9001, 15000.00, 'NGN', 'visa', '4111 **** **** 1234', 'approved', 'POS-2026-001', NOW() - INTERVAL '3 hours'
FROM pos_terminals t WHERE t.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- OPEN BANKING CONSENTS & ACCOUNTS
-- ============================================================
INSERT INTO open_banking_consents_v2 (user_id, provider, consent_id, scope, status, expires_at, created_at) VALUES
  (9001, 'GTBank', 'CONSENT-GTB-001', ARRAY['accounts', 'transactions', 'balances'], 'active', NOW() + INTERVAL '90 days', NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

INSERT INTO open_banking_accounts_v2 (consent_id, account_id, account_type, account_number, bank_name, currency, balance, created_at)
SELECT c.id, 'ACC-GTB-001', 'current', '0123456789', 'GTBank', 'NGN', 250000.00, NOW() - INTERVAL '5 days'
FROM open_banking_consents_v2 c WHERE c.user_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- DEVICE PUSH TOKENS
-- ============================================================
INSERT INTO device_push_tokens (user_id, token, platform, device_id, is_active, created_at) VALUES
  (9001, 'fcm_token_alice_001', 'android', 'device_alice_001', true, NOW()),
  (9002, 'apns_token_bob_001', 'ios', 'device_bob_001', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- REALTIME NOTIFICATION PREFS & HISTORY
-- ============================================================
INSERT INTO realtime_notification_preferences (user_id, payment_alerts, payout_alerts, dispute_alerts, security_alerts, marketing, created_at) VALUES
  (9001, true, true, true, true, false, NOW()),
  (9002, true, true, false, true, true, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO realtime_notification_history (user_id, type, title, message, is_read, metadata, created_at) VALUES
  (9001, 'payment_received', 'Payment Received', 'NGN 25,000 received from customer', false, '{"txn_id":"txn_001"}', NOW() - INTERVAL '1 hour'),
  (9001, 'security_alert', 'New Login Detected', 'Login from new device in Lagos', true, '{"ip":"192.168.1.1"}', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- ADMIN NOTIFICATION PREFS
-- ============================================================
INSERT INTO admin_notification_prefs (user_id, fraud_alerts, kyb_updates, payout_approvals, compliance_reports, system_health, email_enabled, sms_enabled, push_enabled, created_at) VALUES
  (9003, true, true, true, true, true, true, true, true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- CARBON CREDITS
-- ============================================================
INSERT INTO carbon_credits (merchant_id, project_name, credit_type, quantity, price_per_unit, currency, status, vintage_year, created_at) VALUES
  (9001, 'Lagos Mangrove Restoration', 'VCS', 100, 2500.00, 'NGN', 'active', 2025, NOW()),
  (9001, 'Kano Solar Farm', 'Gold Standard', 50, 3000.00, 'NGN', 'active', 2025, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO carbon_credits_v2 (merchant_id, project_name, standard, quantity, price_usd, status, registry_id, created_at) VALUES
  (9001, 'Lagos Mangrove Restoration', 'VCS', 100, 15.00, 'active', 'VCS-2025-001', NOW()),
  (9002, 'Abuja Wind Energy', 'Gold Standard', 75, 18.00, 'active', 'GS-2025-002', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO carbon_credit_transactions_v2 (credit_id, buyer_id, quantity, price_usd, total_usd, status, created_at)
SELECT c.id, 9002, 25, 15.00, 375.00, 'completed', NOW() - INTERVAL '3 days'
FROM carbon_credits_v2 c WHERE c.merchant_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- NFT BADGES
-- ============================================================
INSERT INTO nft_badges (user_id, badge_type, badge_name, description, metadata_url, token_id, contract_address, chain, minted_at, created_at) VALUES
  (9001, 'achievement', 'First Transaction', 'Completed first transaction on PayGate', 'https://cdn.paygate.io/nft/badges/first-txn.json', 'TOKEN-001', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'polygon', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
  (9001, 'milestone', 'Power Merchant', 'Processed over NGN 1M in transactions', 'https://cdn.paygate.io/nft/badges/power-merchant.json', 'TOKEN-002', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 'polygon', NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- RED ENVELOPES & CLAIMS
-- ============================================================
INSERT INTO red_envelopes (creator_id, total_amount, currency, packet_count, remaining_packets, remaining_amount, message, status, expires_at, created_at) VALUES
  (9001, 50000.00, 'NGN', 10, 7, 35000.00, 'Happy New Year! 🎉', 'active', NOW() + INTERVAL '7 days', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

INSERT INTO red_envelope_claims (envelope_id, claimer_id, amount, claimed_at)
SELECT e.id, 9002, 5000.00, NOW() - INTERVAL '12 hours'
FROM red_envelopes e WHERE e.creator_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- GEOFENCE RULES
-- ============================================================
INSERT INTO geofence_rules (merchant_id, name, rule_type, latitude, longitude, radius_meters, action, is_active, created_at) VALUES
  (9001, 'Lagos Office Zone', 'allow', 6.4541, 3.3947, 500, 'allow_transactions', true, NOW()),
  (9001, 'High Risk Zone Block', 'block', 6.5000, 3.4000, 1000, 'block_transactions', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- PRIVACY SETTINGS & ALIASES
-- ============================================================
INSERT INTO privacy_settings (user_id, hide_balance, hide_transactions, hide_profile, data_sharing_consent, created_at) VALUES
  (9001, false, false, false, true, NOW()),
  (9002, true, false, false, false, NOW())
ON CONFLICT DO NOTHING;

INSERT INTO privacy_aliases (user_id, alias, is_active, created_at) VALUES
  (9001, '@alice_pay', true, NOW()),
  (9002, '@bob_commerce', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- SPLIT BILL SESSIONS & SHARES
-- ============================================================
INSERT INTO split_bill_sessions (creator_id, title, total_amount, currency, status, created_at) VALUES
  (9001, 'Office Dinner', 75000.00, 'NGN', 'active', NOW() - INTERVAL '3 hours')
ON CONFLICT DO NOTHING;

INSERT INTO split_bill_shares (session_id, user_id, amount, status, created_at)
SELECT s.id, 9001, 37500.00, 'paid', NOW() - INTERVAL '2 hours'
FROM split_bill_sessions s WHERE s.creator_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO split_bill_shares (session_id, user_id, amount, status, created_at)
SELECT s.id, 9002, 37500.00, 'pending', NOW() - INTERVAL '2 hours'
FROM split_bill_sessions s WHERE s.creator_id=9001 LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- INVENTORY
-- ============================================================
INSERT INTO inventory_items (merchant_id, sku, name, description, category, unit_price, currency, stock_quantity, reorder_level, status, created_at) VALUES
  (9001, 'SKU-001', 'PayGate POS Terminal', 'Verifone VX520 POS Terminal', 'Hardware', 85000.00, 'NGN', 50, 10, 'active', NOW()),
  (9001, 'SKU-002', 'Receipt Paper Roll', 'Thermal paper roll 80mm', 'Consumables', 500.00, 'NGN', 500, 100, 'active', NOW()),
  (9002, 'SKU-003', 'USB Card Reader', 'USB EMV card reader', 'Hardware', 15000.00, 'NGN', 25, 5, 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO inventory_transactions (item_id, type, quantity, unit_price, reference, notes, created_at)
SELECT i.id, 'sale', 2, 85000.00, 'INV-TXN-001', 'Sold to merchant', NOW() - INTERVAL '2 days'
FROM inventory_items i WHERE i.sku='SKU-001' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- RESTAURANT TABLES
-- ============================================================
INSERT INTO restaurant_tables (merchant_id, table_number, capacity, status, qr_code, created_at) VALUES
  (9001, 'T01', 4, 'available', 'QR:table:9001:T01', NOW()),
  (9001, 'T02', 6, 'occupied', 'QR:table:9001:T02', NOW()),
  (9001, 'T03', 2, 'available', 'QR:table:9001:T03', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- RECIPE INGREDIENTS
-- ============================================================
INSERT INTO recipe_ingredients (merchant_id, name, unit, quantity_in_stock, reorder_level, cost_per_unit, currency, created_at) VALUES
  (9001, 'Tomatoes', 'kg', 50.0, 10.0, 500.00, 'NGN', NOW()),
  (9001, 'Chicken', 'kg', 30.0, 5.0, 2500.00, 'NGN', NOW()),
  (9001, 'Rice', 'kg', 100.0, 20.0, 800.00, 'NGN', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- USDC DEPOSITS & PAYOUTS
-- ============================================================
INSERT INTO usdc_deposits (user_id, amount, wallet_address, tx_hash, network, status, confirmed_at, created_at) VALUES
  (9001, 100.00, '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', '0xabc123def456', 'ethereum', 'confirmed', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days')
ON CONFLICT DO NOTHING;

INSERT INTO usdc_payouts (user_id, amount, wallet_address, tx_hash, network, status, created_at) VALUES
  (9001, 50.00, '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', '0xdef456abc789', 'ethereum', 'completed', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- DCC TRANSACTIONS
-- ============================================================
INSERT INTO dcc_transactions (merchant_id, transaction_id, original_amount, original_currency, converted_amount, converted_currency, exchange_rate, markup_pct, status, created_at) VALUES
  (9001, 'txn_dcc_001', 100.00, 'USD', 160000.00, 'NGN', 1600.00, 3.5, 'completed', NOW() - INTERVAL '1 day')
ON CONFLICT DO NOTHING;

-- ============================================================
-- AGENT BANKING
-- ============================================================
INSERT INTO agent_banking_v4_agents (merchant_id, agent_code, name, phone, location, state, lga, status, float_balance, created_at) VALUES
  (9001, 'AGT-9001-001', 'Emeka Obi', '+2348011111111', 'Alaba Market, Lagos', 'Lagos', 'Ojo', 'active', 50000.00, NOW()),
  (9001, 'AGT-9001-002', 'Chioma Eze', '+2348022222222', 'Wuse Market, Abuja', 'FCT', 'Wuse', 'active', 35000.00, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- PTSP BATCHES
-- ============================================================
INSERT INTO ptsp_batches (merchant_id, batch_reference, total_amount, transaction_count, status, submitted_at, created_at) VALUES
  (9001, 'PTSP-2026-001', 250000.00, 15, 'processed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (9002, 'PTSP-2026-002', 180000.00, 10, 'pending', NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- REPORT JOBS
-- ============================================================
INSERT INTO report_jobs (merchant_id, report_type, parameters, status, file_url, created_by, started_at, completed_at, created_at) VALUES
  (9001, 'transaction_summary', '{"period":"monthly","month":"2026-03"}', 'completed', 'https://cdn.paygate.io/reports/txn-summary-9001-mar2026.xlsx', 9001, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '2 hours'),
  (9001, 'customer_analysis', '{"period":"quarterly","quarter":"Q1-2026"}', 'pending', NULL, 9001, NULL, NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- RECONCILIATION ALERTS
-- ============================================================
INSERT INTO reconciliation_alerts (merchant_id, alert_type, description, amount_discrepancy, currency, status, resolved_by, created_at) VALUES
  (9001, 'missing_settlement', 'Expected settlement not received for 2026-04-15', 50000.00, 'NGN', 'open', NULL, NOW() - INTERVAL '2 days'),
  (9002, 'duplicate_transaction', 'Duplicate transaction detected: txn_003', 22000.00, 'NGN', 'resolved', 9003, NOW() - INTERVAL '5 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- NFC DEVICES
-- ============================================================
INSERT INTO nfc_devices (merchant_id, device_id, device_type, status, last_seen_at, created_at) VALUES
  (9001, 'NFC-9001-001', 'tap_to_pay', 'active', NOW() - INTERVAL '1 hour', NOW()),
  (9002, 'NFC-9002-001', 'contactless_reader', 'active', NOW() - INTERVAL '30 minutes', NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOYALTY V3 PROGRAMS & MEMBERS
-- ============================================================
INSERT INTO loyalty_v3_programs (merchant_id, name, description, points_per_naira, redemption_rate, min_redemption, status, created_at) VALUES
  (9001, 'PayGate Rewards', 'Earn points on every transaction', 1.0, 0.01, 1000, 'active', NOW()),
  (9002, 'BobRewards', 'Exclusive rewards for loyal customers', 1.5, 0.015, 500, 'active', NOW())
ON CONFLICT DO NOTHING;

INSERT INTO loyalty_v3_members (program_id, customer_id, points_balance, lifetime_points, tier, joined_at, created_at)
SELECT p.id, c.id, 2500, 5000, 'silver', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'
FROM loyalty_v3_programs p, customers c WHERE p.merchant_id=9001 AND c.email='customer1@example.com' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- LOYALTY PROMOTION LOG
-- ============================================================
INSERT INTO loyalty_promotion_log (user_id, from_tier, to_tier, reason, points_at_promotion, created_at) VALUES
  (9001, 'bronze', 'silver', 'Reached 2500 lifetime points', 2500, NOW() - INTERVAL '10 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- CASHBACK BALANCES (additional seed)
-- ============================================================
-- Already has 5 rows, skip

-- ============================================================
-- MIDDLEWARE INTEGRATION LOGS
-- ============================================================
INSERT INTO middleware_integration_logs (merchant_id, service_name, endpoint, method, request_payload, response_payload, status_code, latency_ms, success, created_at) VALUES
  (9001, 'NIBSS', '/api/v1/nameenquiry', 'POST', '{"accountNumber":"0123456789","bankCode":"058"}', '{"accountName":"James Okonkwo","status":"00"}', 200, 245, true, NOW() - INTERVAL '1 hour'),
  (9001, 'MOJALOOP', '/transfers', 'POST', '{"amount":5000,"currency":"NGN"}', '{"transferId":"ML-001","status":"COMMITTED"}', 200, 1250, true, NOW() - INTERVAL '2 hours'),
  (9002, 'VTPASS', '/api/pay', 'POST', '{"serviceID":"mtn","amount":1000}', '{"code":"000","content":{"transactions":{"status":"delivered"}}}', 200, 890, true, NOW() - INTERVAL '30 minutes'),
  (9001, 'TERMII', '/api/sms/send', 'POST', '{"to":"+2348012345678","sms":"Your OTP is 123456"}', '{"code":"ok","message_id":"TRM-001"}', 200, 320, true, NOW() - INTERVAL '15 minutes'),
  (9001, 'YOUVERIFY', '/v2/api/identity/ng/bvn', 'POST', '{"id":"22345678901"}', '{"status":"success","data":{"firstName":"Alice"}}', 200, 1800, true, NOW() - INTERVAL '30 days')
ON CONFLICT DO NOTHING;

-- ============================================================
-- WEBHOOK SIMULATOR LOGS
-- ============================================================
INSERT INTO webhook_simulator_logs (merchant_id, event_type, payload, target_url, response_code, response_body, success, created_at) VALUES
  (9001, 'payment.completed', '{"id":"pay_sim_001","amount":10000}', 'https://aliceventures.io/webhooks/test', 200, '{"ok":true}', true, NOW() - INTERVAL '2 hours'),
  (9001, 'payout.failed', '{"id":"pout_sim_001","reason":"insufficient_funds"}', 'https://aliceventures.io/webhooks/test', 500, '{"error":"Server Error"}', false, NOW() - INTERVAL '1 hour')
ON CONFLICT DO NOTHING;

-- ============================================================
-- BILLING CRON RUNS
-- ============================================================
INSERT INTO billing_cron_runs (tenant_id, run_type, status, invoices_generated, total_amount, currency, started_at, completed_at, created_at)
SELECT t.id, 'monthly_invoice', 'completed', 3, 45000.00, 'NGN', NOW() - INTERVAL '1 day', NOW() - INTERVAL '23 hours', NOW() - INTERVAL '1 day'
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT CONFIG & FEATURE FLAGS
-- ============================================================
INSERT INTO tenant_config (tenant_id, config_key, config_value, created_at)
SELECT t.id, 'max_daily_transactions', '1000', NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tenant_feature_flags (tenant_id, feature_name, is_enabled, created_at)
SELECT t.id, 'bnpl', true, NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

INSERT INTO tenant_feature_flags (tenant_id, feature_name, is_enabled, created_at)
SELECT t.id, 'virtual_cards', true, NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT ONBOARDING EMAILS
-- ============================================================
INSERT INTO tenant_onboarding_emails (tenant_id, email_type, recipient_email, subject, body, status, sent_at, created_at)
SELECT t.id, 'welcome', t.contact_email, 'Welcome to PayGate Partner Network', 'Dear Partner, your account is now active...', 'sent', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT SSO CONFIGS
-- ============================================================
INSERT INTO tenant_sso_configs (tenant_id, provider_type, client_id, discovery_url, is_active, created_at)
SELECT t.id, 'oidc', 'sso_client_' || t.id, 'https://accounts.google.com/.well-known/openid-configuration', false, NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT API KEYS
-- ============================================================
INSERT INTO tenant_api_keys (tenant_id, name, key_prefix, key_hash, permissions_bitmask, is_active, created_at)
SELECT t.id, 'Production Key', 'tpk_live_' || t.id, encode(sha256(('tpk_live_' || t.id || '_secret')::bytea), 'hex'), 255, true, NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT WEBHOOK SECRETS
-- ============================================================
INSERT INTO tenant_webhook_secrets (tenant_id, secret_encrypted, algorithm, is_active, created_at)
SELECT t.id, encode(sha256(('whsec_' || t.id || '_secret')::bytea), 'hex'), 'AES-256-GCM', true, NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- TENANT AUDIT LOGS
-- ============================================================
INSERT INTO tenant_audit_logs (tenant_id, user_id, action, resource_type, resource_id, metadata, ip_address, created_at)
SELECT t.id, 9001, 'tenant_config_updated', 'tenant_config', '1', '{"key":"max_daily_transactions","value":"1000"}', '192.168.1.1', NOW()
FROM partner_tenants t LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- JWT REVOCATION LIST
-- ============================================================
INSERT INTO jwt_revocation_list (jti, user_id, reason, expires_at, created_at) VALUES
  ('jti_revoked_001', 9001, 'user_logout', NOW() + INTERVAL '1 day', NOW() - INTERVAL '1 hour'),
  ('jti_revoked_002', 9002, 'security_breach', NOW() + INTERVAL '7 days', NOW() - INTERVAL '2 hours')
ON CONFLICT DO NOTHING;

-- ============================================================
-- PARTNER ONBOARDING SESSIONS
-- ============================================================
INSERT INTO partner_onboarding_sessions (invite_code, company_name, contact_email, step, status, branding_data, created_at)
SELECT ic.code, 'NewPartner Corp', 'newpartner@corp.com', 3, 'in_progress', '{"primaryColor":"#2563EB","logoUrl":"https://cdn.paygate.io/logos/np.png"}', NOW() - INTERVAL '2 hours'
FROM invite_codes ic WHERE ic.status='active' LIMIT 1
ON CONFLICT DO NOTHING;

-- ============================================================
-- SLA ALERT SUBSCRIPTIONS
-- ============================================================
INSERT INTO sla_alert_subscriptions (user_id, alert_type, threshold_value, notification_channel, is_active, created_at) VALUES
  (9003, 'uptime', 99.5, 'push', true, NOW()),
  (9003, 'latency_p99', 2000, 'email', true, NOW()),
  (9001, 'error_rate', 5.0, 'push', true, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- TAX WITHHOLDING RECORDS
-- ============================================================
INSERT INTO tax_withholding_records (merchant_id, transaction_id, gross_amount, tax_rate, tax_amount, currency, status, remitted_at, created_at) VALUES
  (9001, 'txn_001', 25000.00, 10.0, 2500.00, 'NGN', 'remitted', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  (9002, 'txn_003', 22000.00, 10.0, 2200.00, 'NGN', 'pending', NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- BULK PAYMENT SCHEDULES
-- ============================================================
INSERT INTO bulk_payment_schedules (merchant_id, name, total_amount, currency, status, scheduled_at, created_at) VALUES
  (9001, 'April Vendor Payments', 750000.00, 'NGN', 'scheduled', NOW() + INTERVAL '5 days', NOW()),
  (9002, 'Q2 Supplier Payments', 1200000.00, 'NGN', 'draft', NULL, NOW())
ON CONFLICT DO NOTHING;

-- ============================================================
-- ESCROW CONTRACTS V2
-- ============================================================
INSERT INTO escrow_contracts_v2 (buyer_id, seller_id, amount, currency, description, milestones, status, expires_at, created_at) VALUES
  (9001, 9002, 250000.00, 'NGN', 'Mobile app development', '[{"name":"Design","amount":50000},{"name":"Development","amount":150000},{"name":"Testing","amount":50000}]', 'active', NOW() + INTERVAL '60 days', NOW() - INTERVAL '3 days')
ON CONFLICT DO NOTHING;

SELECT 'Wave 32 seed complete' AS result;
