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
