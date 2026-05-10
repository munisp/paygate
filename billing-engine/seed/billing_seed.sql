-- ─── Billing Engine Seed Data ─────────────────────────────────────────────────
-- Run after db:push to populate default billing configs for demo tenants.
-- Usage: psql $PG_DATABASE_URL -f billing-engine/seed/billing_seed.sql

-- ── Billing Configs ───────────────────────────────────────────────────────────

-- Starter tier: per-transaction, 1.5% capped at ₦2,000 (200,000 kobo)
INSERT INTO billing_configs (
  id, tenant_id, status, active, pricing_model,
  fee_rate, fee_cap_kobo, fee_floor_kobo,
  platform_share, reseller_share,
  interchange_cost_kobo,
  sign_on_fee_kobo, sign_on_platform_share,
  subscription_fee_kobo, subscription_platform_share,
  monthly_overhead_cap_kobo,
  notes, created_by, version,
  effective_from, created_at, updated_at
) VALUES (
  'bc-starter-001', 'tenant-demo-001', 'active', true, 'per_transaction',
  0.015, 200000, 0,
  0.65, 0.35,
  5000,
  0, 0.70,
  0, 0.65,
  80000000,
  'Default Starter tier — 1.5% / ₦2,000 cap, 65/35 split', 'system', 1,
  NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Growth tier: hybrid, 1.2% + ₦50,000/month subscription
INSERT INTO billing_configs (
  id, tenant_id, status, active, pricing_model,
  fee_rate, fee_cap_kobo, fee_floor_kobo,
  platform_share, reseller_share,
  interchange_cost_kobo,
  sign_on_fee_kobo, sign_on_platform_share,
  subscription_fee_kobo, subscription_platform_share,
  monthly_overhead_cap_kobo,
  notes, created_by, version,
  effective_from, created_at, updated_at
) VALUES (
  'bc-growth-001', 'tenant-demo-002', 'active', true, 'hybrid',
  0.012, 200000, 0,
  0.68, 0.32,
  5000,
  500000, 0.75,
  5000000, 0.70,
  120000000,
  'Growth tier — 1.2% hybrid + ₦50K/month, 68/32 split', 'system', 1,
  NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- Enterprise tier: subscription only, ₦500,000/month flat
INSERT INTO billing_configs (
  id, tenant_id, status, active, pricing_model,
  fee_rate, fee_cap_kobo, fee_floor_kobo,
  platform_share, reseller_share,
  interchange_cost_kobo,
  sign_on_fee_kobo, sign_on_platform_share,
  subscription_fee_kobo, subscription_platform_share,
  monthly_overhead_cap_kobo,
  notes, created_by, version,
  effective_from, created_at, updated_at
) VALUES (
  'bc-enterprise-001', 'tenant-demo-003', 'active', true, 'subscription',
  0.0, 0, 0,
  0.72, 0.28,
  0,
  2000000, 0.80,
  50000000, 0.72,
  200000000,
  'Enterprise tier — ₦500K/month flat subscription, 72/28 split', 'system', 1,
  NOW(), NOW(), NOW()
) ON CONFLICT (id) DO NOTHING;

-- ── Billing Audit Log Entries (demo) ─────────────────────────────────────────

INSERT INTO billing_audit_log (
  id, tenant_id, billing_config_id, actor_id, actor_role,
  action, before_state, after_state, reason, created_at
) VALUES
  (
    'bal-001', 'tenant-demo-001', 'bc-starter-001', 'system', 'admin',
    'created', NULL,
    '{"pricingModel":"per_transaction","feeRate":0.015,"platformShare":0.65}',
    'Initial billing config provisioned at tenant onboarding', NOW()
  ),
  (
    'bal-002', 'tenant-demo-002', 'bc-growth-001', 'system', 'admin',
    'created', NULL,
    '{"pricingModel":"hybrid","feeRate":0.012,"platformShare":0.68}',
    'Initial billing config provisioned at tenant onboarding', NOW()
  ),
  (
    'bal-003', 'tenant-demo-003', 'bc-enterprise-001', 'system', 'admin',
    'created', NULL,
    '{"pricingModel":"subscription","feeRate":0.0,"platformShare":0.72}',
    'Initial billing config provisioned at tenant onboarding', NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ── Billing Events (demo — simulated transactions) ────────────────────────────

INSERT INTO billing_events (
  id, tenant_id, transaction_id, billing_config_id,
  transaction_amount_kobo, fee_kobo, platform_revenue_kobo, reseller_revenue_kobo,
  interchange_cost_kobo, net_platform_kobo,
  pricing_model, fee_rate_applied, status,
  processed_at, created_at
) VALUES
  (
    'be-001', 'tenant-demo-001', 'txn-demo-001', 'bc-starter-001',
    1000000, 15000, 9750, 5250,
    5000, 4750,
    'per_transaction', 0.015, 'settled',
    NOW() - INTERVAL '2 hours', NOW() - INTERVAL '2 hours'
  ),
  (
    'be-002', 'tenant-demo-001', 'txn-demo-002', 'bc-starter-001',
    500000, 7500, 4875, 2625,
    5000, -125,
    'per_transaction', 0.015, 'settled',
    NOW() - INTERVAL '1 hour', NOW() - INTERVAL '1 hour'
  ),
  (
    'be-003', 'tenant-demo-002', 'txn-demo-003', 'bc-growth-001',
    2000000, 24000, 16320, 7680,
    5000, 11320,
    'hybrid', 0.012, 'settled',
    NOW() - INTERVAL '30 minutes', NOW() - INTERVAL '30 minutes'
  )
ON CONFLICT (id) DO NOTHING;

-- Confirm seed
SELECT
  bc.tenant_id,
  bc.pricing_model,
  bc.fee_rate,
  bc.platform_share,
  bc.reseller_share,
  bc.status,
  COUNT(be.id) AS event_count
FROM billing_configs bc
LEFT JOIN billing_events be ON be.billing_config_id = bc.id
GROUP BY bc.id, bc.tenant_id, bc.pricing_model, bc.fee_rate, bc.platform_share, bc.reseller_share, bc.status
ORDER BY bc.tenant_id;

-- ─── Wave 119 Additional Seed Data ────────────────────────────────────────────
-- Additional seed data for tables covered by crud119Router.
-- Covers: overhead_costs, subscription_plans_v2, portal_subscriptions

-- ── Overhead Costs ────────────────────────────────────────────────────────────
INSERT INTO overhead_costs (
  id, tenant_id, category, label, amount_kobo, currency,
  billing_period, effective_from, notes, created_at, updated_at
) VALUES
  (
    'oc-infra-001', 'tenant-demo-001', 'infrastructure', 'Cloud Hosting (AWS)',
    500000, 'NGN', 'monthly', NOW() - INTERVAL '30 days',
    'AWS EC2 + RDS monthly cost', NOW(), NOW()
  ),
  (
    'oc-labor-001', 'tenant-demo-001', 'labor', 'Engineering Team',
    5000000, 'NGN', 'monthly', NOW() - INTERVAL '30 days',
    'Core engineering headcount', NOW(), NOW()
  ),
  (
    'oc-ops-001', 'tenant-demo-001', 'operations', 'Customer Support',
    800000, 'NGN', 'monthly', NOW() - INTERVAL '30 days',
    'Support team operational cost', NOW(), NOW()
  ),
  (
    'oc-travel-001', 'tenant-demo-001', 'travel', 'Business Travel',
    200000, 'NGN', 'monthly', NOW() - INTERVAL '30 days',
    'Monthly travel budget', NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ── Subscription Plans V2 ─────────────────────────────────────────────────────
INSERT INTO subscription_plans_v2 (
  id, name, description, amount_kobo, currency, billing_interval,
  trial_days, features, active, created_at, updated_at
) VALUES
  (
    'plan-starter', 'Starter', 'For small merchants getting started',
    0, 'NGN', 'monthly', 30,
    '{"transactions":1000,"apiCalls":10000,"support":"email"}',
    true, NOW(), NOW()
  ),
  (
    'plan-growth', 'Growth', 'For growing businesses',
    5000000, 'NGN', 'monthly', 14,
    '{"transactions":50000,"apiCalls":500000,"support":"priority","analytics":true}',
    true, NOW(), NOW()
  ),
  (
    'plan-enterprise', 'Enterprise', 'For large-scale operations',
    50000000, 'NGN', 'monthly', 0,
    '{"transactions":-1,"apiCalls":-1,"support":"dedicated","analytics":true,"customIntegrations":true}',
    true, NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- ── Portal Subscriptions ──────────────────────────────────────────────────────
INSERT INTO portal_subscriptions (
  id, tenant_id, plan_id, status, current_period_start, current_period_end,
  cancel_at_period_end, created_at, updated_at
) VALUES
  (
    'sub-demo-001', 'tenant-demo-001', 'plan-starter', 'active',
    NOW() - INTERVAL '15 days', NOW() + INTERVAL '15 days',
    false, NOW(), NOW()
  ),
  (
    'sub-demo-002', 'tenant-demo-002', 'plan-growth', 'active',
    NOW() - INTERVAL '5 days', NOW() + INTERVAL '25 days',
    false, NOW(), NOW()
  ),
  (
    'sub-demo-003', 'tenant-demo-003', 'plan-enterprise', 'active',
    NOW() - INTERVAL '1 day', NOW() + INTERVAL '29 days',
    false, NOW(), NOW()
  )
ON CONFLICT (id) DO NOTHING;

-- Confirm Wave 119 seed
SELECT 'overhead_costs' AS table_name, COUNT(*) AS row_count FROM overhead_costs
UNION ALL
SELECT 'subscription_plans_v2', COUNT(*) FROM subscription_plans_v2
UNION ALL
SELECT 'portal_subscriptions', COUNT(*) FROM portal_subscriptions;

-- ─── Wave 120 Seed Data ───────────────────────────────────────────────────────

-- Staff members seed
INSERT IGNORE INTO staff_members (id, merchant_id, name, role, department, phone, status, hire_date, created_at) VALUES
  ('staff-001', 'merchant-001', 'Amara Okafor', 'cashier', 'operations', '+2348012345678', 'active', '2024-01-15', NOW()),
  ('staff-002', 'merchant-001', 'Emeka Nwosu', 'supervisor', 'operations', '+2348023456789', 'active', '2023-06-01', NOW()),
  ('staff-003', 'merchant-001', 'Fatima Bello', 'accountant', 'finance', '+2348034567890', 'active', '2024-03-10', NOW());

-- Staff shifts seed
INSERT IGNORE INTO staff_shifts (id, staff_member_id, clock_in, clock_out, duration_minutes, location, status, created_at) VALUES
  ('shift-001', 'staff-001', DATE_SUB(NOW(), INTERVAL 8 HOUR), DATE_SUB(NOW(), INTERVAL 0 HOUR), 480, 'Main Branch', 'completed', NOW()),
  ('shift-002', 'staff-002', DATE_SUB(NOW(), INTERVAL 9 HOUR), DATE_SUB(NOW(), INTERVAL 1 HOUR), 480, 'Main Branch', 'completed', NOW());

-- Insurance claims seed
INSERT IGNORE INTO insurance_claims (id, merchant_id, policy_id, claim_type, amount, status, description, submitted_at, created_at) VALUES
  ('claim-001', 'merchant-001', 'policy-001', 'fire', 500000, 'under_review', 'Equipment damaged in electrical fire', DATE_SUB(NOW(), INTERVAL 5 DAY), NOW()),
  ('claim-002', 'merchant-001', 'policy-002', 'theft', 250000, 'approved', 'POS terminal stolen', DATE_SUB(NOW(), INTERVAL 10 DAY), NOW());

-- Support sessions seed
INSERT IGNORE INTO support_sessions (id, merchant_id, subject, priority, status, agent_id, created_at) VALUES
  ('session-001', 'merchant-001', 'Unable to process refunds', 'high', 'resolved', 'agent-001', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('session-002', 'merchant-001', 'API integration question', 'medium', 'open', 'agent-002', DATE_SUB(NOW(), INTERVAL 1 DAY));

-- Support messages seed
INSERT IGNORE INTO support_messages (id, session_id, sender_id, sender_type, message, created_at) VALUES
  ('msg-001', 'session-001', 'merchant-001', 'merchant', 'I cannot process refunds for transactions older than 7 days', DATE_SUB(NOW(), INTERVAL 2 DAY)),
  ('msg-002', 'session-001', 'agent-001', 'agent', 'Refund window is configurable. I will update your settings now.', DATE_SUB(NOW(), INTERVAL 2 DAY));

-- USDC wallets seed
INSERT IGNORE INTO usdc_wallets (id, merchant_id, network, wallet_address, balance, status, created_at) VALUES
  ('usdc-wallet-001', 'merchant-001', 'ethereum', '0x742d35Cc6634C0532925a3b844Bc454e4438f44e', 10000.00, 'active', NOW()),
  ('usdc-wallet-002', 'merchant-001', 'polygon', '0x8626f6940E2eb28930eFb4CeF49B2d1F2C9C1199', 5000.00, 'active', NOW());

-- Tax filing records seed
INSERT IGNORE INTO tax_filing_records (id, merchant_id, tax_type, period, taxable_amount, tax_amount, status, reference_number, submitted_at, created_at) VALUES
  ('tax-001', 'merchant-001', 'VAT', '2025-Q1', 5000000, 375000, 'submitted', 'FIRS-2025-001234', DATE_SUB(NOW(), INTERVAL 30 DAY), NOW()),
  ('tax-002', 'merchant-001', 'WHT', '2025-Q1', 2000000, 100000, 'approved', 'FIRS-2025-005678', DATE_SUB(NOW(), INTERVAL 25 DAY), NOW());

-- Split bill sessions seed
INSERT IGNORE INTO split_bill_sessions (id, merchant_id, title, total_amount, currency, status, participant_count, created_at) VALUES
  ('split-001', 'merchant-001', 'Team Lunch - April 2025', 45000, 'NGN', 'settled', 5, DATE_SUB(NOW(), INTERVAL 7 DAY)),
  ('split-002', 'merchant-001', 'Office Supplies Q2', 120000, 'NGN', 'active', 3, DATE_SUB(NOW(), INTERVAL 1 DAY));

-- Webhook simulator logs seed
INSERT IGNORE INTO webhook_simulator_logs (id, merchant_id, event_type, target_url, payload, response_code, latency_ms, status, created_at) VALUES
  ('wsim-001', 'merchant-001', 'payment.completed', 'https://webhook.site/test-123', '{"amount":50000,"currency":"NGN"}', 200, 145, 'success', DATE_SUB(NOW(), INTERVAL 3 DAY)),
  ('wsim-002', 'merchant-001', 'payout.initiated', 'https://webhook.site/test-123', '{"payoutId":"po-001","amount":25000}', 404, 89, 'failed', DATE_SUB(NOW(), INTERVAL 2 DAY));

-- Transaction receipts seed
INSERT IGNORE INTO transaction_receipts (id, transaction_id, merchant_id, receipt_number, amount, currency, customer_email, customer_phone, items, issued_at, created_at) VALUES
  ('rcpt-001', 'txn-001', 'merchant-001', 'RCP-2025-000001', 50000, 'NGN', 'customer@example.com', '+2348011111111', '[{"name":"Product A","qty":2,"price":25000}]', DATE_SUB(NOW(), INTERVAL 5 DAY), NOW()),
  ('rcpt-002', 'txn-002', 'merchant-001', 'RCP-2025-000002', 75000, 'NGN', 'buyer@example.com', '+2348022222222', '[{"name":"Service B","qty":1,"price":75000}]', DATE_SUB(NOW(), INTERVAL 3 DAY), NOW());

