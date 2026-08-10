-- ═══════════════════════════════════════════════════════════════════════════════
-- Wave 124 Seed Data
-- Tables: bill_payments, carbon_credits, subscriptions, coupons, qr_payments,
--         referrals, ussd_sessions, pos_terminals, pos_transactions,
--         purchase_orders, insurance_policies, loan_repayments,
--         saved_beneficiaries, device_push_tokens, fraud_alert_comments,
--         red_envelopes, red_envelope_claims, audit_events, idempotency_requests
-- ═══════════════════════════════════════════════════════════════════════════════

-- Prerequisites: merchants table must have at least one row
-- Replace 'merchant_001' with an actual merchant ID from your merchants table

-- ─── Bill Payments ───────────────────────────────────────────────────────────
INSERT INTO bill_payments (id, merchant_id, tenant_id, biller_code, biller_name, category, customer_reference, amount_kobo, currency, status, transaction_ref, narration, created_at, updated_at)
VALUES
  ('bp_001', 'merchant_001', 'tenant_001', 'DSTV_COMPACT', 'DSTV Compact', 'cable_tv', 'IUC1234567890', 450000, 'NGN', 'success', 'TXN_BP_001', 'DSTV Compact monthly subscription', NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days'),
  ('bp_002', 'merchant_001', 'tenant_001', 'IKEDC_PREPAID', 'Ikeja Electric Prepaid', 'electricity', 'METER12345678', 1000000, 'NGN', 'success', 'TXN_BP_002', 'Electricity prepaid token purchase', NOW() - INTERVAL '3 days', NOW() - INTERVAL '3 days'),
  ('bp_003', 'merchant_001', 'tenant_001', 'MTN_AIRTIME', 'MTN Nigeria Airtime', 'airtime', '08012345678', 200000, 'NGN', 'success', 'TXN_BP_003', 'MTN airtime top-up', NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('bp_004', 'merchant_001', 'tenant_001', 'GOTV_JINJA', 'GOtv Jinja', 'cable_tv', 'IUC9876543210', 180000, 'NGN', 'pending', NULL, 'GOtv Jinja monthly subscription', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('bp_005', 'merchant_001', 'tenant_001', 'AEDC_PREPAID', 'Abuja Electric Prepaid', 'electricity', 'METER87654321', 750000, 'NGN', 'failed', NULL, 'Electricity prepaid token purchase', NOW() - INTERVAL '6 hours', NOW() - INTERVAL '6 hours')
ON CONFLICT (id) DO NOTHING;

-- ─── Carbon Credits ───────────────────────────────────────────────────────────
INSERT INTO carbon_credits (id, merchant_id, tenant_id, credit_type, project_name, project_id, registry, vintage_year, quantity_tonnes, price_per_tonne_usd, total_value_usd, status, serial_number, retirement_reason, retired_at, certificate_url, created_at, updated_at)
VALUES
  ('cc_001', 'merchant_001', 'tenant_001', 'VCS', 'Amazon Reforestation Project', 'VCS-2024-001', 'Verra', 2023, 100.00, 15.50, 1550.00, 'active', 'VCS-2024-001-001-100', NULL, NULL, NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
  ('cc_002', 'merchant_001', 'tenant_001', 'Gold Standard', 'Solar Energy Kenya', 'GS-2023-042', 'Gold Standard', 2022, 50.00, 18.00, 900.00, 'active', 'GS-2023-042-001-050', NULL, NULL, NULL, NOW() - INTERVAL '20 days', NOW() - INTERVAL '20 days'),
  ('cc_003', 'merchant_001', 'tenant_001', 'VCS', 'Mangrove Conservation Nigeria', 'VCS-2023-089', 'Verra', 2023, 200.00, 12.00, 2400.00, 'retired', 'VCS-2023-089-001-200', 'Corporate carbon neutrality commitment 2024', NOW() - INTERVAL '5 days', 'https://registry.verra.org/certs/VCS-2023-089-001-200.pdf', NOW() - INTERVAL '60 days', NOW() - INTERVAL '5 days'),
  ('cc_004', 'merchant_001', 'tenant_001', 'ACR', 'Wind Farm Katsina', 'ACR-2024-015', 'American Carbon Registry', 2024, 75.00, 20.00, 1500.00, 'active', 'ACR-2024-015-001-075', NULL, NULL, NULL, NOW() - INTERVAL '10 days', NOW() - INTERVAL '10 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Subscriptions ────────────────────────────────────────────────────────────
INSERT INTO subscriptions (id, merchant_id, tenant_id, customer_email, customer_name, customer_phone, plan_name, amount_kobo, currency, interval, total_cycles, completed_cycles, start_at, next_run_at, last_run_at, status, bank_code, account_number, account_name, description, created_at, updated_at)
VALUES
  ('sub_001', 'merchant_001', 'tenant_001', 'john.doe@example.com', 'John Doe', '08012345678', 'Premium Monthly', 2500000, 'NGN', 'monthly', NULL, 3, NOW() - INTERVAL '90 days', NOW() + INTERVAL '30 days', NOW() - INTERVAL '30 days', 'active', '058', '0123456789', 'John Doe', 'Premium plan monthly subscription', NOW() - INTERVAL '90 days', NOW() - INTERVAL '30 days'),
  ('sub_002', 'merchant_001', 'tenant_001', 'jane.smith@example.com', 'Jane Smith', '08098765432', 'Basic Weekly', 500000, 'NGN', 'weekly', 52, 12, NOW() - INTERVAL '84 days', NOW() + INTERVAL '7 days', NOW() - INTERVAL '7 days', 'active', '033', '9876543210', 'Jane Smith', 'Basic plan weekly subscription', NOW() - INTERVAL '84 days', NOW() - INTERVAL '7 days'),
  ('sub_003', 'merchant_001', 'tenant_001', 'bob.jones@example.com', 'Bob Jones', '07011223344', 'Enterprise Annual', 30000000, 'NGN', 'annually', 3, 1, NOW() - INTERVAL '365 days', NOW() + INTERVAL '365 days', NOW() - INTERVAL '365 days', 'active', '044', '5555555555', 'Bob Jones', 'Enterprise plan annual subscription', NOW() - INTERVAL '365 days', NOW() - INTERVAL '365 days'),
  ('sub_004', 'merchant_001', 'tenant_001', 'alice.wonder@example.com', 'Alice Wonder', '09011223344', 'Starter Monthly', 1000000, 'NGN', 'monthly', 12, 6, NOW() - INTERVAL '180 days', NOW() + INTERVAL '15 days', NOW() - INTERVAL '15 days', 'paused', '058', '1111111111', 'Alice Wonder', 'Starter plan monthly subscription', NOW() - INTERVAL '180 days', NOW() - INTERVAL '15 days'),
  ('sub_005', 'merchant_001', 'tenant_001', 'charlie.brown@example.com', 'Charlie Brown', '08055667788', 'Premium Monthly', 2500000, 'NGN', 'monthly', NULL, 2, NOW() - INTERVAL '60 days', NOW() + INTERVAL '5 days', NOW() - INTERVAL '25 days', 'cancelled', '033', '2222222222', 'Charlie Brown', 'Premium plan monthly subscription', NOW() - INTERVAL '60 days', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Coupons ──────────────────────────────────────────────────────────────────
INSERT INTO coupons (id, merchant_id, tenant_id, code, discount_type, discount_value, min_order_kobo, max_discount_kobo, max_usage, usage_count, is_active, valid_from, valid_until, description, created_at, updated_at)
VALUES
  ('coup_001', 'merchant_001', 'tenant_001', 'WELCOME20', 'percentage', 20.00, 100000, 500000, 100, 23, true, NOW() - INTERVAL '30 days', NOW() + INTERVAL '60 days', 'Welcome 20% discount for new customers', NOW() - INTERVAL '30 days', NOW()),
  ('coup_002', 'merchant_001', 'tenant_001', 'FLAT500', 'fixed_amount', 50000, 200000, NULL, 50, 12, true, NOW() - INTERVAL '15 days', NOW() + INTERVAL '45 days', 'Flat ₦500 off on orders above ₦2,000', NOW() - INTERVAL '15 days', NOW()),
  ('coup_003', 'merchant_001', 'tenant_001', 'SUMMER30', 'percentage', 30.00, 500000, 1000000, 200, 200, false, NOW() - INTERVAL '90 days', NOW() - INTERVAL '1 day', 'Summer sale 30% discount (expired)', NOW() - INTERVAL '90 days', NOW() - INTERVAL '1 day'),
  ('coup_004', 'merchant_001', 'tenant_001', 'FREESHIP', 'free_shipping', 0.00, 50000, NULL, NULL, 45, true, NOW() - INTERVAL '7 days', NOW() + INTERVAL '23 days', 'Free shipping on all orders', NOW() - INTERVAL '7 days', NOW()),
  ('coup_005', 'merchant_001', 'tenant_001', 'BOGO-DEAL', 'buy_x_get_y', 100.00, 1000000, NULL, 30, 8, true, NOW() - INTERVAL '3 days', NOW() + INTERVAL '27 days', 'Buy 2 get 1 free promotion', NOW() - INTERVAL '3 days', NOW())
ON CONFLICT (id) DO NOTHING;

-- ─── QR Payments ──────────────────────────────────────────────────────────────
INSERT INTO qr_payments (id, merchant_id, tenant_id, reference, amount_kobo, currency, status, qr_code_url, qr_code_data, expires_at, paid_at, payer_name, payer_phone, transaction_id, created_at, updated_at)
VALUES
  ('qr_001', 'merchant_001', 'tenant_001', 'QR-2024-001', 500000, 'NGN', 'paid', 'https://cdn.paygate.ng/qr/QR-2024-001.png', 'data:image/png;base64,iVBORw0KGgo=', NOW() + INTERVAL '5 minutes', NOW() - INTERVAL '2 hours', 'Emeka Okafor', '08012345678', 'TXN_QR_001', NOW() - INTERVAL '3 hours', NOW() - INTERVAL '2 hours'),
  ('qr_002', 'merchant_001', 'tenant_001', 'QR-2024-002', 1200000, 'NGN', 'paid', 'https://cdn.paygate.ng/qr/QR-2024-002.png', 'data:image/png;base64,iVBORw0KGgo=', NOW() + INTERVAL '5 minutes', NOW() - INTERVAL '1 day', 'Fatima Bello', '07098765432', 'TXN_QR_002', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('qr_003', 'merchant_001', 'tenant_001', 'QR-2024-003', 250000, 'NGN', 'pending', 'https://cdn.paygate.ng/qr/QR-2024-003.png', 'data:image/png;base64,iVBORw0KGgo=', NOW() + INTERVAL '4 minutes', NULL, NULL, NULL, NULL, NOW() - INTERVAL '1 minute', NOW() - INTERVAL '1 minute'),
  ('qr_004', 'merchant_001', 'tenant_001', 'QR-2024-004', 750000, 'NGN', 'expired', 'https://cdn.paygate.ng/qr/QR-2024-004.png', 'data:image/png;base64,iVBORw0KGgo=', NOW() - INTERVAL '1 hour', NULL, NULL, NULL, NULL, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ─── Referrals ────────────────────────────────────────────────────────────────
INSERT INTO referrals (id, merchant_id, tenant_id, referrer_id, referred_id, referral_code, status, reward_type, reward_amount_kobo, reward_paid_at, conversion_event, created_at, updated_at)
VALUES
  ('ref_001', 'merchant_001', 'tenant_001', 'user_001', 'user_002', 'REF-USER001-A1B2', 'converted', 'cash', 50000, NOW() - INTERVAL '5 days', 'first_transaction', NOW() - INTERVAL '10 days', NOW() - INTERVAL '5 days'),
  ('ref_002', 'merchant_001', 'tenant_001', 'user_001', 'user_003', 'REF-USER001-C3D4', 'converted', 'cash', 50000, NOW() - INTERVAL '3 days', 'first_transaction', NOW() - INTERVAL '7 days', NOW() - INTERVAL '3 days'),
  ('ref_003', 'merchant_001', 'tenant_001', 'user_002', 'user_004', 'REF-USER002-E5F6', 'pending', 'cash', 50000, NULL, NULL, NOW() - INTERVAL '2 days', NOW() - INTERVAL '2 days'),
  ('ref_004', 'merchant_001', 'tenant_001', 'user_003', 'user_005', 'REF-USER003-G7H8', 'registered', 'cash', 50000, NULL, NULL, NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ─── USSD Sessions ────────────────────────────────────────────────────────────
INSERT INTO ussd_sessions (id, merchant_id, tenant_id, session_code, phone_number, network, current_menu, menu_path, session_data, status, started_at, last_activity_at, ended_at, created_at, updated_at)
VALUES
  ('ussd_001', 'merchant_001', 'tenant_001', 'SESS_001', '+2348012345678', 'MTN', 'main_menu', ARRAY['main_menu'], '{"balance": 150000}', 'completed', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
  ('ussd_002', 'merchant_001', 'tenant_001', 'SESS_002', '+2348098765432', 'Airtel', 'transfer_menu', ARRAY['main_menu', 'transfer_menu'], '{"amount": 50000}', 'active', NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '1 minute', NULL, NOW() - INTERVAL '5 minutes', NOW() - INTERVAL '1 minute'),
  ('ussd_003', 'merchant_001', 'tenant_001', 'SESS_003', '+2347011223344', 'Glo', 'main_menu', ARRAY['main_menu'], '{}', 'timeout', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ─── POS Terminals ────────────────────────────────────────────────────────────
INSERT INTO pos_terminals (id, merchant_id, tenant_id, serial_number, model, label, location, status, last_heartbeat_at, firmware_version, ip_address, audio_alerts_enabled, audio_language, total_transactions, total_volume_kobo, created_at, updated_at)
VALUES
  ('pos_001', 'merchant_001', 'tenant_001', 'SN001234567890', 'soundbox_pro', 'Main Counter', 'Lagos Island Branch', 'active', NOW() - INTERVAL '5 minutes', '2.1.4', '192.168.1.101', true, 'en', 1250, 125000000, NOW() - INTERVAL '90 days', NOW() - INTERVAL '5 minutes'),
  ('pos_002', 'merchant_001', 'tenant_001', 'SN009876543210', 'mpos_lite', 'Gate 2', 'Victoria Island Branch', 'active', NOW() - INTERVAL '10 minutes', '1.8.2', '192.168.1.102', true, 'yo', 875, 87500000, NOW() - INTERVAL '60 days', NOW() - INTERVAL '10 minutes'),
  ('pos_003', 'merchant_001', 'tenant_001', 'SN005555555555', 'android_pos', 'Cashier 3', 'Ikeja Branch', 'maintenance', NOW() - INTERVAL '2 days', '3.0.1', NULL, false, 'en', 320, 32000000, NOW() - INTERVAL '30 days', NOW() - INTERVAL '2 days'),
  ('pos_004', 'merchant_001', 'tenant_001', 'SN001111111111', 'soundbox_basic', 'Mobile Unit', 'Field Operations', 'inactive', NOW() - INTERVAL '7 days', '1.5.0', NULL, true, 'ha', 45, 4500000, NOW() - INTERVAL '14 days', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Purchase Orders ──────────────────────────────────────────────────────────
INSERT INTO purchase_orders (id, merchant_id, tenant_id, po_number, vendor_name, vendor_email, vendor_phone, line_items, subtotal_kobo, tax_kobo, total_kobo, currency, status, payment_terms, delivery_date, notes, approved_by, approved_at, created_by, created_at, updated_at)
VALUES
  ('po_001', 'merchant_001', 'tenant_001', 'PO-2024-001', 'TechSupplies Ltd', 'orders@techsupplies.ng', '08012345678', '[{"description": "POS Terminal Soundbox Pro", "quantity": 10, "unitPriceKobo": 150000, "totalKobo": 1500000}]', 1500000, 225000, 1725000, 'NGN', 'approved', 'net_30', NOW() + INTERVAL '14 days', 'Urgent order for new branch expansion', 'admin_001', NOW() - INTERVAL '2 days', 'user_001', NOW() - INTERVAL '5 days', NOW() - INTERVAL '2 days'),
  ('po_002', 'merchant_001', 'tenant_001', 'PO-2024-002', 'Office Essentials NG', 'procurement@officeessentials.ng', '07098765432', '[{"description": "Receipt Paper Rolls", "quantity": 500, "unitPriceKobo": 5000, "totalKobo": 2500000}]', 2500000, 375000, 2875000, 'NGN', 'pending', 'net_15', NOW() + INTERVAL '7 days', 'Monthly consumables order', NULL, NULL, 'user_002', NOW() - INTERVAL '1 day', NOW() - INTERVAL '1 day'),
  ('po_003', 'merchant_001', 'tenant_001', 'PO-2024-003', 'Network Solutions', 'sales@networksolutions.ng', '09011223344', '[{"description": "CAT6 Network Cable (100m)", "quantity": 5, "unitPriceKobo": 80000, "totalKobo": 400000}]', 400000, 60000, 460000, 'NGN', 'delivered', 'net_30', NOW() - INTERVAL '2 days', 'Network infrastructure upgrade', 'admin_001', NOW() - INTERVAL '10 days', 'user_001', NOW() - INTERVAL '14 days', NOW() - INTERVAL '2 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Insurance Policies ───────────────────────────────────────────────────────
INSERT INTO insurance_policies (id, merchant_id, tenant_id, policy_number, insurer_name, policy_type, coverage_amount_kobo, premium_kobo, premium_frequency, start_date, end_date, status, beneficiary_name, beneficiary_relationship, terms_url, created_at, updated_at)
VALUES
  ('ins_001', 'merchant_001', 'tenant_001', 'POL-2024-001', 'AXA Mansard Insurance', 'business_liability', 50000000000, 500000, 'monthly', NOW() - INTERVAL '180 days', NOW() + INTERVAL '185 days', 'active', 'PayGate Merchant 001 Ltd', 'self', 'https://axamansard.com/policies/POL-2024-001', NOW() - INTERVAL '180 days', NOW()),
  ('ins_002', 'merchant_001', 'tenant_001', 'POL-2024-002', 'Leadway Assurance', 'cyber_liability', 10000000000, 250000, 'monthly', NOW() - INTERVAL '90 days', NOW() + INTERVAL '275 days', 'active', 'PayGate Merchant 001 Ltd', 'self', 'https://leadway.com/policies/POL-2024-002', NOW() - INTERVAL '90 days', NOW()),
  ('ins_003', 'merchant_001', 'tenant_001', 'POL-2023-015', 'AIICO Insurance', 'equipment_insurance', 5000000000, 100000, 'monthly', NOW() - INTERVAL '365 days', NOW() - INTERVAL '1 day', 'expired', 'PayGate Merchant 001 Ltd', 'self', 'https://aiico.com/policies/POL-2023-015', NOW() - INTERVAL '365 days', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ─── Loan Repayments ──────────────────────────────────────────────────────────
INSERT INTO loan_repayments (id, loan_id, merchant_id, tenant_id, amount_kobo, currency, payment_method, status, nip_session_id, failure_reason, due_date, paid_at, created_at, updated_at)
VALUES
  ('rep_001', 'loan_001', 'merchant_001', 'tenant_001', 500000, 'NGN', 'bank_transfer', 'success', 'NIP_REP_001', NULL, NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days', NOW() - INTERVAL '30 days'),
  ('rep_002', 'loan_001', 'merchant_001', 'tenant_001', 500000, 'NGN', 'bank_transfer', 'success', 'NIP_REP_002', NULL, NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days', NOW() - INTERVAL '60 days'),
  ('rep_003', 'loan_001', 'merchant_001', 'tenant_001', 500000, 'NGN', 'bank_transfer', 'pending', NULL, NULL, NOW() + INTERVAL '1 day', NULL, NOW(), NOW()),
  ('rep_004', 'loan_002', 'merchant_001', 'tenant_001', 1000000, 'NGN', 'direct_debit', 'failed', NULL, 'Insufficient funds in account', NOW() - INTERVAL '5 days', NULL, NOW() - INTERVAL '5 days', NOW() - INTERVAL '5 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Saved Beneficiaries ──────────────────────────────────────────────────────
INSERT INTO saved_beneficiaries (id, merchant_id, tenant_id, user_id, nickname, bank_code, bank_name, account_number, account_name, currency, is_favorite, last_used_at, use_count, created_at, updated_at)
VALUES
  ('ben_001', 'merchant_001', 'tenant_001', 'user_001', 'Mum', '058', 'GTBank', '0123456789', 'Grace Adeyemi', 'NGN', true, NOW() - INTERVAL '2 days', 15, NOW() - INTERVAL '90 days', NOW() - INTERVAL '2 days'),
  ('ben_002', 'merchant_001', 'tenant_001', 'user_001', 'Office Rent', '033', 'Access Bank', '9876543210', 'Lagos Properties Ltd', 'NGN', true, NOW() - INTERVAL '30 days', 12, NOW() - INTERVAL '365 days', NOW() - INTERVAL '30 days'),
  ('ben_003', 'merchant_001', 'tenant_001', 'user_001', 'Supplier A', '044', 'First Bank', '5555555555', 'Ade Supplies Ltd', 'NGN', false, NOW() - INTERVAL '7 days', 8, NOW() - INTERVAL '180 days', NOW() - INTERVAL '7 days'),
  ('ben_004', 'merchant_001', 'tenant_001', 'user_002', 'Dad', '058', 'GTBank', '1111111111', 'Emmanuel Okonkwo', 'NGN', true, NOW() - INTERVAL '1 day', 22, NOW() - INTERVAL '120 days', NOW() - INTERVAL '1 day')
ON CONFLICT (id) DO NOTHING;

-- ─── Device Push Tokens ───────────────────────────────────────────────────────
INSERT INTO device_push_tokens (id, merchant_id, tenant_id, user_id, token, platform, device_id, app_version, is_active, created_at, updated_at)
VALUES
  ('dpt_001', 'merchant_001', 'tenant_001', 1, 'fcm_token_abc123xyz456_device_001', 'fcm', 'device_001_android', '3.2.1', true, NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day'),
  ('dpt_002', 'merchant_001', 'tenant_001', 1, 'apns_token_def456uvw789_device_002', 'apns', 'device_002_ios', '3.2.1', true, NOW() - INTERVAL '15 days', NOW() - INTERVAL '2 days'),
  ('dpt_003', 'merchant_001', 'tenant_001', 2, 'fcm_token_ghi789rst012_device_003', 'fcm', 'device_003_android', '3.1.0', false, NOW() - INTERVAL '60 days', NOW() - INTERVAL '30 days'),
  ('dpt_004', 'merchant_001', 'tenant_001', 3, 'web_push_token_jkl012mno345', 'web', NULL, NULL, true, NOW() - INTERVAL '7 days', NOW() - INTERVAL '7 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Fraud Alert Comments ─────────────────────────────────────────────────────
INSERT INTO fraud_alert_comments (id, alert_id, merchant_id, tenant_id, author_id, author_name, comment, is_internal, created_at, updated_at)
VALUES
  ('fac_001', 'alert_001', 'merchant_001', 'tenant_001', 'user_001', 'John Analyst', 'Reviewed transaction history — customer has consistent purchase pattern. Likely false positive.', true, NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'),
  ('fac_002', 'alert_001', 'merchant_001', 'tenant_001', 'user_002', 'Jane Supervisor', 'Confirmed false positive. Dismissing alert. Customer notified.', true, NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'),
  ('fac_003', 'alert_002', 'merchant_001', 'tenant_001', 'user_001', 'John Analyst', 'Escalating to fraud team — multiple failed PIN attempts from different IPs in 10 minutes.', true, NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes')
ON CONFLICT (id) DO NOTHING;

-- ─── Red Envelopes ────────────────────────────────────────────────────────────
INSERT INTO red_envelopes (id, merchant_id, tenant_id, sender_id, title, message, total_amount_kobo, currency, envelope_type, max_claims, claim_count, amount_per_claim_kobo, status, expires_at, created_at, updated_at)
VALUES
  ('re_001', 'merchant_001', 'tenant_001', 'user_001', 'Happy New Year!', 'Wishing everyone a prosperous new year!', 1000000, 'NGN', 'equal', 10, 7, 100000, 'active', NOW() + INTERVAL '7 days', NOW() - INTERVAL '2 days', NOW()),
  ('re_002', 'merchant_001', 'tenant_001', 'user_002', 'Team Bonus', 'Great work this quarter!', 5000000, 'NGN', 'random', 20, 20, NULL, 'completed', NOW() - INTERVAL '1 day', NOW() - INTERVAL '30 days', NOW() - INTERVAL '1 day'),
  ('re_003', 'merchant_001', 'tenant_001', 'user_001', 'Birthday Celebration', 'Happy birthday to our valued customers!', 2000000, 'NGN', 'equal', 5, 0, 400000, 'expired', NOW() - INTERVAL '1 hour', NOW() - INTERVAL '8 days', NOW() - INTERVAL '1 hour')
ON CONFLICT (id) DO NOTHING;

-- ─── Audit Events ─────────────────────────────────────────────────────────────
INSERT INTO audit_events (id, tenant_id, merchant_id, actor_id, actor_type, action, resource_type, resource_id, old_value, new_value, ip_address, user_agent, metadata, created_at)
VALUES
  ('ae_001', 'tenant_001', 'merchant_001', 'user_001', 'user', 'subscription.created', 'subscription', 'sub_001', NULL, '{"planName": "Premium Monthly", "amountKobo": 2500000}', '192.168.1.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', '{"source": "web_portal"}', NOW() - INTERVAL '90 days'),
  ('ae_002', 'tenant_001', 'merchant_001', 'user_001', 'user', 'coupon.created', 'coupon', 'coup_001', NULL, '{"code": "WELCOME20", "discountType": "percentage", "discountValue": 20}', '192.168.1.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', '{"source": "web_portal"}', NOW() - INTERVAL '30 days'),
  ('ae_003', 'tenant_001', 'merchant_001', 'user_002', 'user', 'pos_terminal.registered', 'pos_terminal', 'pos_001', NULL, '{"serialNumber": "SN001234567890", "model": "soundbox_pro"}', '10.0.0.1', 'PayGate Mobile App/3.2.1 iOS/17.0', '{"source": "mobile_app"}', NOW() - INTERVAL '90 days'),
  ('ae_004', 'tenant_001', 'merchant_001', 'user_001', 'user', 'purchase_order.approved', 'purchase_order', 'po_001', '{"status": "pending"}', '{"status": "approved"}', '192.168.1.1', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/120.0', '{"source": "web_portal", "approvalNote": "Approved for Q4 expansion"}', NOW() - INTERVAL '2 days'),
  ('ae_005', 'tenant_001', 'merchant_001', 'system', 'system', 'subscription.charge_failed', 'subscription', 'sub_004', '{"status": "active"}', '{"status": "paused", "failureReason": "Insufficient funds"}', NULL, 'PayGate Subscription Engine/1.0', '{"source": "subscription_engine", "attemptCount": 3}', NOW() - INTERVAL '15 days')
ON CONFLICT (id) DO NOTHING;

-- ─── Idempotency Requests ─────────────────────────────────────────────────────
INSERT INTO idempotency_requests (id, tenant_id, merchant_id, idempotency_key, method, path, request_hash, response_status, response_body, expires_at, created_at)
VALUES
  ('idem_001', 'tenant_001', 'merchant_001', 'idem-key-bill-payment-001', 'POST', '/api/trpc/billPayments.initiate', 'sha256:abc123def456', 200, '{"transactionRef": "TXN_BP_001", "status": "success"}', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '5 days'),
  ('idem_002', 'tenant_001', 'merchant_001', 'idem-key-qr-payment-003', 'POST', '/api/trpc/qrPayments.create', 'sha256:ghi789jkl012', 200, '{"id": "qr_003", "qrCodeUrl": "https://cdn.paygate.ng/qr/QR-2024-003.png"}', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '1 minute'),
  ('idem_003', 'tenant_001', 'merchant_001', 'idem-key-subscription-001', 'POST', '/api/trpc/subscriptions.create', 'sha256:mno345pqr678', 200, '{"id": "sub_001", "status": "active"}', NOW() + INTERVAL '24 hours', NOW() - INTERVAL '90 days')
ON CONFLICT (id) DO NOTHING;
