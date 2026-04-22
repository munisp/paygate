/**
 * PayGate Merchant Portal — Database Seed Script
 *
 * Populates all tables with realistic fixture data for development,
 * staging, and CI environments. Designed to be idempotent: every INSERT
 * uses ON CONFLICT DO NOTHING so re-running is safe.
 *
 * Usage:
 *   PG_DATABASE_URL="postgresql://..." pnpm db:seed
 */
import "dotenv/config";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { sql } from "drizzle-orm";

const connectionString =
  process.env.PG_DATABASE_URL ||
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db";
const pool = new Pool({ connectionString, max: 5 });
const db = drizzle(pool);

async function exec(query: string) {
  await db.execute(sql.raw(query));
}

// Fixed text IDs
const T1 = "tenant-acme-001";
const T2 = "tenant-beta-002";
const T3 = "tenant-gamma-003";
const M1 = "merch-acme-001";
const M2 = "merch-beta-002";
const M3 = "merch-gamma-003";
const C1 = "cust-001";
const C2 = "cust-002";
const C3 = "cust-003";
const C4 = "cust-004";
const C5 = "cust-005";
const TX1 = "txn-001";
const TX2 = "txn-002";
const TX3 = "txn-003";
const TX4 = "txn-004";
const TX5 = "txn-005";
const WH1 = "wh-001";
const WH2 = "wh-002";
const WH3 = "wh-003";

async function seedTenants() {
  await exec(`
    INSERT INTO tenants (id, name, slug, plan, status, email, country, created_at, updated_at)
    VALUES
      ('${T1}', 'Acme Fintech Seed',     'acme-fintech-seed',     'growth',     'active', 'seed@acme.ng',  'NG', NOW(), NOW()),
      ('${T2}', 'Beta Payments Seed',    'beta-payments-seed',    'starter',    'active', 'seed@beta.ng',  'NG', NOW(), NOW()),
      ('${T3}', 'Gamma Remittance Seed', 'gamma-remittance-seed', 'enterprise', 'active', 'seed@gamma.ng', 'NG', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedMerchants() {
  await exec(`
    INSERT INTO merchants (id, owner_id, business_name, business_type, email, phone, country, currency, status, tenant_id, created_at, updated_at)
    VALUES
      ('${M1}', 1, 'Acme Fintech Ltd',     'fintech',    'merchant@acme.ng',  '+2348012345678', 'NG', 'NGN', 'active',    '${T1}', NOW(), NOW()),
      ('${M2}', 2, 'Beta Payments Ltd',    'payments',   'merchant@beta.ng',  '+2348023456789', 'NG', 'NGN', 'active',    '${T2}', NOW(), NOW()),
      ('${M3}', 3, 'Gamma Remittance Ltd', 'remittance', 'merchant@gamma.ng', '+2348034567890', 'NG', 'NGN', 'suspended', '${T3}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedCustomers() {
  await exec(`
    INSERT INTO customers (id, merchant_id, email, name, phone, risk_level, total_transactions, total_spend, tenant_id, plan_id, created_at, updated_at)
    VALUES
      ('${C1}', '${M1}', 'alice@example.com', 'Alice Okonkwo',  '+2348011111111', 'low',    12, 1500000, '${T1}', 'starter', NOW(), NOW()),
      ('${C2}', '${M1}', 'bob@example.com',   'Bob Adeyemi',    '+2348022222222', 'medium',  5,  750000, '${T1}', 'starter', NOW(), NOW()),
      ('${C3}', '${M2}', 'carol@example.com', 'Carol Eze',      '+2348033333333', 'low',     8,  900000, '${T2}', 'starter', NOW(), NOW()),
      ('${C4}', '${M2}', 'dave@example.com',  'Dave Nwachukwu', '+2348044444444', 'high',    2,  200000, '${T2}', 'starter', NOW(), NOW()),
      ('${C5}', '${M3}', 'eve@example.com',   'Eve Osei',       '+2348055555555', 'low',    20, 5000000, '${T3}', 'starter', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedTransactions() {
  await exec(`
    INSERT INTO transactions (id, merchant_id, reference, amount, currency, status, channel, customer_email, customer_name, fee_amount, net_amount, tenant_id, created_at, updated_at)
    VALUES
      ('${TX1}', '${M1}', 'REF-001', 150000, 'NGN', 'completed',  'card',          'alice@example.com', 'Alice Okonkwo',  2250, 147750, '${T1}', NOW() - interval '1 day',     NOW()),
      ('${TX2}', '${M1}', 'REF-002', 320000, 'NGN', 'completed',  'bank_transfer', 'bob@example.com',   'Bob Adeyemi',    4800, 315200, '${T1}', NOW() - interval '2 days',    NOW()),
      ('${TX3}', '${M1}', 'REF-003',  75000, 'NGN', 'failed',     'card',          'alice@example.com', 'Alice Okonkwo',     0,      0, '${T1}', NOW() - interval '3 days',    NOW()),
      ('${TX4}', '${M2}', 'REF-004', 180000, 'NGN', 'completed',  'mobile_money',  'carol@example.com', 'Carol Eze',      2700, 177300, '${T2}', NOW() - interval '4 days',    NOW()),
      ('${TX5}', '${M3}', 'REF-005', 950000, 'NGN', 'processing', 'bank_transfer', 'eve@example.com',   'Eve Osei',      14250, 935750, '${T3}', NOW() - interval '30 minutes',NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedPayouts() {
  await exec(`
    INSERT INTO payouts (id, merchant_id, reference, amount, currency, status, bank_code, account_number, account_name, narration, fee_amount, tenant_id, created_at, updated_at)
    VALUES
      ('payout-001', '${M1}', 'PO-001', 1000000, 'NGN', 'completed',        '058', '0123456789', 'Alice Okonkwo',  'Weekly settlement', 1500, '${T1}', NOW() - interval '1 day',     NOW()),
      ('payout-002', '${M1}', 'PO-002',  500000, 'NGN', 'pending',          '044', '9876543210', 'Bob Adeyemi',    'Ad-hoc payout',      750, '${T1}', NOW() - interval '2 hours',   NOW()),
      ('payout-003', '${M2}', 'PO-003', 2000000, 'NGN', 'completed',        '057', '1122334455', 'Carol Eze',      'Monthly settlement', 3000, '${T2}', NOW() - interval '2 days',    NOW()),
      ('payout-004', '${M2}', 'PO-004',  750000, 'NGN', 'failed',           '033', '5544332211', 'Dave Nwachukwu', 'Failed payout',      1125, '${T2}', NOW() - interval '3 days',    NOW()),
      ('payout-005', '${M3}', 'PO-005', 3500000, 'NGN', 'pending_approval', '011', '6677889900', 'Eve Osei',       'Large payout',       5250, '${T3}', NOW() - interval '30 minutes',NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedDisputes() {
  await exec(`
    INSERT INTO disputes (id, merchant_id, transaction_id, reference, amount, currency, status, reason, tenant_id, created_at, updated_at)
    VALUES
      ('dispute-001', '${M1}', '${TX3}', 'DSP-001',  75000, 'NGN', 'open',              'Unauthorized transaction', '${T1}', NOW() - interval '1 day',  NOW()),
      ('dispute-002', '${M2}', '${TX4}', 'DSP-002', 180000, 'NGN', 'resolved_merchant', 'Item not received',        '${T2}', NOW() - interval '5 days', NOW()),
      ('dispute-003', '${M1}', '${TX1}', 'DSP-003', 150000, 'NGN', 'under_review',      'Duplicate charge',         '${T1}', NOW() - interval '2 days', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedApiKeys() {
  await exec(`
    INSERT INTO api_keys (id, merchant_id, name, key_hash, key_prefix, environment, permissions, is_active, tenant_id, created_at)
    VALUES
      ('apikey-001', '${M1}', 'Production Key', 'hash_prod_acme_001',  'pk_live_acme',  'live', '["read","write"]', TRUE, '${T1}', NOW() - interval '30 days'),
      ('apikey-002', '${M1}', 'Test Key',        'hash_test_acme_001', 'pk_test_acme',  'test', '["read","write"]', TRUE, '${T1}', NOW() - interval '30 days'),
      ('apikey-003', '${M2}', 'Production Key',  'hash_prod_beta_001', 'pk_live_beta',  'live', '["read"]',         TRUE, '${T2}', NOW() - interval '20 days'),
      ('apikey-004', '${M3}', 'Production Key',  'hash_prod_gamma_001','pk_live_gamma', 'live', '["read","write"]', TRUE, '${T3}', NOW() - interval '15 days')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedWebhooks() {
  await exec(`
    INSERT INTO webhooks (id, merchant_id, url, events, secret, is_active, tenant_id, created_at, updated_at)
    VALUES
      ('${WH1}', '${M1}', 'https://acme.example.com/webhooks',  '["payment.success","payment.failed"]',  'whsec_acme_001',  TRUE, '${T1}', NOW(), NOW()),
      ('${WH2}', '${M2}', 'https://beta.example.com/webhooks',  '["payout.completed"]',                  'whsec_beta_001',  TRUE, '${T2}', NOW(), NOW()),
      ('${WH3}', '${M3}', 'https://gamma.example.com/webhooks', '["dispute.opened","dispute.resolved"]', 'whsec_gamma_001', TRUE, '${T3}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedVirtualCards() {
  await exec(`
    INSERT INTO virtual_cards (id, merchant_id, masked_pan, brand, expiry_month, expiry_year, currency, status, balance, spend_limit, label, tenant_id, created_at, updated_at)
    VALUES
      ('vcard-001', '${M1}', '**** **** **** 1234', 'visa',       12, 2026, 'USD', 'active',  50000, 100000, 'Marketing Card', '${T1}', NOW(), NOW()),
      ('vcard-002', '${M1}', '**** **** **** 5678', 'mastercard',  6, 2027, 'USD', 'active',  25000,  50000, 'Ops Card',       '${T1}', NOW(), NOW()),
      ('vcard-003', '${M2}', '**** **** **** 9012', 'visa',        3, 2026, 'USD', 'frozen',  10000,  20000, 'Dev Card',       '${T2}', NOW(), NOW()),
      ('vcard-004', '${M3}', '**** **** **** 3456', 'mastercard',  9, 2028, 'USD', 'active', 100000, 200000, 'Executive Card', '${T3}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedPaymentLinks() {
  await exec(`
    INSERT INTO payment_links (id, merchant_id, slug, title, description, amount, currency, is_active, usage_count, tenant_id, created_at, updated_at)
    VALUES
      ('plink-001', '${M1}', 'acme-inv-001',  'Invoice #INV-001', 'Payment for services',    150000, 'NGN', TRUE,  3, '${T1}', NOW(), NOW()),
      ('plink-002', '${M1}', 'acme-prod-001', 'Product Purchase', 'Buy our premium product', 250000, 'NGN', TRUE,  1, '${T1}', NOW(), NOW()),
      ('plink-003', '${M2}', 'beta-svc-001',  'Service Fee',      'Monthly service fee',      75000, 'NGN', FALSE, 0, '${T2}', NOW(), NOW()),
      ('plink-004', '${M3}', 'gamma-rem-001', 'Remittance',       'Cross-border transfer',   500000, 'NGN', TRUE,  7, '${T3}', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedFraudAlerts() {
  await exec(`
    INSERT INTO fraud_alerts (id, merchant_id, transaction_id, alert_type, risk_score, status, description, tenant_id, created_at, updated_at)
    VALUES
      ('fraud-001', '${M1}', '${TX3}', 'velocity_breach',    92, 'open',        'High velocity transaction detected',  '${T1}', NOW() - interval '2 hours',    NOW()),
      ('fraud-002', '${M2}', '${TX4}', 'unusual_location',   78, 'investigating','Unusual location for this customer', '${T2}', NOW() - interval '1 day',      NOW()),
      ('fraud-003', '${M3}', '${TX5}', 'card_testing',       95, 'open',        'Possible card testing pattern',       '${T3}', NOW() - interval '30 minutes', NOW()),
      ('fraud-004', '${M1}', '${TX2}', 'chargeback_pattern', 65, 'resolved',    'Chargeback pattern resolved',         '${T1}', NOW() - interval '3 days',     NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedSettlements() {
  await exec(`
    INSERT INTO settlements (id, tenant_id, merchant_id, reference, amount, currency, bank_code, account_number, account_name, status, created_at, updated_at)
    VALUES
      ('settle-001', '${T1}', '${M1}', 'SET-001', 5000000, 'NGN', '058', '0123456789', 'Acme Fintech Ltd',    'completed', NOW() - interval '1 day',   NOW()),
      ('settle-002', '${T2}', '${M2}', 'SET-002', 3500000, 'NGN', '057', '1122334455', 'Beta Payments Ltd',   'completed', NOW() - interval '2 days',  NOW()),
      ('settle-003', '${T3}', '${M3}', 'SET-003', 8000000, 'NGN', '011', '6677889900', 'Gamma Remittance Ltd','pending',   NOW() - interval '3 hours', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedFxRates() {
  await exec(`
    INSERT INTO fx_rates (base_currency, target_currency, rate, source, fetched_at)
    VALUES
      ('NGN', 'USD', '0.000625', 'exchangerate-api', NOW()),
      ('NGN', 'EUR', '0.000580', 'exchangerate-api', NOW()),
      ('NGN', 'GBP', '0.000495', 'exchangerate-api', NOW()),
      ('USD', 'NGN', '1600.00',  'exchangerate-api', NOW()),
      ('EUR', 'NGN', '1724.14',  'exchangerate-api', NOW()),
      ('GBP', 'NGN', '2020.20',  'exchangerate-api', NOW())
    ON CONFLICT DO NOTHING;
  `);
}

async function seedFxLiveRates() {
  await exec(`
    INSERT INTO fx_live_rates (base_currency, quote_currency, rate, source, pair, fetched_at)
    VALUES
      ('NGN', 'USD', 0.000625, 'provider', 'NGN/USD', NOW()),
      ('NGN', 'EUR', 0.000580, 'provider', 'NGN/EUR', NOW()),
      ('NGN', 'GBP', 0.000495, 'provider', 'NGN/GBP', NOW()),
      ('USD', 'NGN', 1600.00,  'provider', 'USD/NGN', NOW()),
      ('EUR', 'NGN', 1724.14,  'provider', 'EUR/NGN', NOW())
    ON CONFLICT DO NOTHING;
  `);
}

async function seedFxHedgePositions() {
  await exec(`
    INSERT INTO fx_hedge_positions (base_currency, quote_currency, notional_amount, hedge_rate, status, opened_at)
    VALUES
      ('NGN', 'USD', 10000000, 0.000625, 'active', NOW() - interval '1 day'),
      ('NGN', 'EUR',  5000000, 0.000580, 'active', NOW() - interval '7 days'),
      ('USD', 'NGN',     6250, 1600.00,  'active', NOW() - interval '2 hours'),
      ('NGN', 'GBP',  8000000, 0.000495, 'active', NOW() - interval '3 days'),
      ('EUR', 'NGN',  3000000, 1724.14,  'closed', NOW() - interval '14 days')
    ON CONFLICT DO NOTHING;
  `);
}

async function seedKycSubmissions() {
  await exec(`
    INSERT INTO kyc_submissions (id, merchant_id, customer_id, doc_type, status, tenant_id, created_at, updated_at)
    VALUES
      ('kyc-001', '${M1}', '${C1}', 'national_id',     'approved',     '${T1}', NOW() - interval '10 days', NOW()),
      ('kyc-002', '${M1}', '${C2}', 'passport',        'under_review', '${T1}', NOW() - interval '3 days',  NOW()),
      ('kyc-003', '${M2}', '${C3}', 'drivers_license', 'approved',     '${T2}', NOW() - interval '7 days',  NOW()),
      ('kyc-004', '${M2}', '${C4}', 'utility_bill',    'rejected',     '${T2}', NOW() - interval '14 days', NOW()),
      ('kyc-005', '${M3}', '${C5}', 'cac_certificate', 'pending',      '${T3}', NOW() - interval '1 day',   NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedTeamMembers() {
  await exec(`
    INSERT INTO team_members (merchant_id, user_id, email, name, role, status, tenant_id, created_at, updated_at)
    VALUES
      ('${M1}', 1, 'alice@acme.ng', 'Alice Okonkwo',  'admin',     'active',  '${T1}', NOW(), NOW()),
      ('${M1}', 2, 'bob@acme.ng',   'Bob Adeyemi',    'developer', 'active',  '${T1}', NOW(), NOW()),
      ('${M2}', 3, 'carol@beta.ng', 'Carol Eze',      'admin',     'active',  '${T2}', NOW(), NOW()),
      ('${M2}', 4, 'dave@beta.ng',  'Dave Nwachukwu', 'viewer',    'invited', '${T2}', NOW(), NOW()),
      ('${M3}', 5, 'eve@gamma.ng',  'Eve Osei',       'admin',     'active',  '${T3}', NOW(), NOW())
    ON CONFLICT (tenant_id, merchant_id, email) DO NOTHING;
  `);
}

async function seedAuditEvents() {
  await exec(`
    INSERT INTO audit_events (merchant_id, actor_id, actor_name, actor_email, action, resource, resource_id, ip_address, created_at)
    VALUES
      ('${M1}', '1', 'Alice Okonkwo', 'alice@acme.ng', 'CREATE', 'api_key',  'apikey-001', '192.168.1.1', NOW() - interval '1 day'),
      ('${M1}', '1', 'Alice Okonkwo', 'alice@acme.ng', 'UPDATE', 'merchant', '${M1}',      '192.168.1.1', NOW() - interval '2 days'),
      ('${M2}', '3', 'Carol Eze',     'carol@beta.ng', 'CREATE', 'webhook',  '${WH2}',     '10.0.0.5',    NOW() - interval '3 days'),
      ('${M3}', '5', 'Eve Osei',      'eve@gamma.ng',  'DELETE', 'api_key',  'apikey-004', '172.16.0.10', NOW() - interval '4 days')
    ON CONFLICT DO NOTHING;
  `);
}

async function seedWebhookDeliveries() {
  await exec(`
    INSERT INTO webhook_deliveries (id, webhook_id, merchant_id, event_type, payload, response_status, latency_ms, status, attempt_count, delivered_at, tenant_id, created_at)
    VALUES
      ('wdel-001', '${WH1}', '${M1}', 'payment.success', '{"event":"payment.success","amount":150000}'::jsonb, 200, 145, 'success', 1, NOW() - interval '1 day',  '${T1}', NOW() - interval '1 day'),
      ('wdel-002', '${WH1}', '${M1}', 'payment.failed',  '{"event":"payment.failed","amount":75000}'::jsonb,  500, 320, 'failed',  3, NULL,                       '${T1}', NOW() - interval '3 days'),
      ('wdel-003', '${WH2}', '${M2}', 'payout.completed','{"event":"payout.completed","amount":2000000}'::jsonb,200,98,'success', 1, NOW() - interval '2 days',  '${T2}', NOW() - interval '2 days')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedSlaMetrics() {
  await exec(`
    INSERT INTO sla_metrics (service_name, metric_type, value, target, period_start, period_end, service, uptime_pct, avg_latency_ms)
    VALUES
      ('payment-processor', 'uptime',  99.95, 99.9,  NOW() - interval '30 days', NOW(), 'payment-processor', 99.95, 145),
      ('payout-engine',     'uptime',  99.80, 99.5,  NOW() - interval '30 days', NOW(), 'payout-engine',     99.80, 320),
      ('fraud-detection',   'latency', 85.00, 100.0, NOW() - interval '30 days', NOW(), 'fraud-detection',   99.99,  85),
      ('kyc-service',       'uptime',  99.70, 99.0,  NOW() - interval '30 days', NOW(), 'kyc-service',       99.70, 210)
    ON CONFLICT DO NOTHING;
  `);
}

async function seedMiddlewareHealthLogs() {
  await exec(`
    INSERT INTO middleware_health_logs (service_name, status, latency_ms, service, uptime_pct, checked_at)
    VALUES
      ('payment-processor', 'up', 145, 'payment-processor', 99.95, NOW() - interval '5 minutes'),
      ('payout-engine',     'up', 320, 'payout-engine',     99.80, NOW() - interval '5 minutes'),
      ('fraud-detection',   'up',  85, 'fraud-detection',   99.99, NOW() - interval '5 minutes'),
      ('kyc-service',       'up', 200, 'kyc-service',       99.70, NOW() - interval '5 minutes'),
      ('nibss-gateway',     'up', 200, 'nibss-gateway',     99.50, NOW() - interval '5 minutes')
    ON CONFLICT DO NOTHING;
  `);
}

async function seedPartnerTenants() {
  await exec(`
    INSERT INTO partner_tenants (partner_id, tenant_id, relationship_type, commission_rate, status, name, email, country, plan, created_at)
    VALUES
      ('${T1}', '${T2}', 'reseller', 5.0, 'active', 'Acme-Beta Partnership',  'partner@acme.ng', 'NG', 'growth',  NOW()),
      ('${T1}', '${T3}', 'referral', 2.5, 'active', 'Acme-Gamma Partnership', 'partner@acme.ng', 'NG', 'starter', NOW())
    ON CONFLICT DO NOTHING;
  `);
}

async function seedTenantUsers() {
  await exec(`
    INSERT INTO tenant_users (tenant_id, user_id, role, is_active, name, email, invited_at, joined_at)
    VALUES
      ('${T1}', 1, 'owner',  TRUE, 'Alice Okonkwo', 'alice@acme.ng',  NOW() - interval '30 days', NOW() - interval '30 days'),
      ('${T1}', 2, 'member', TRUE, 'Bob Adeyemi',   'bob@acme.ng',    NOW() - interval '20 days', NOW() - interval '19 days'),
      ('${T2}', 3, 'owner',  TRUE, 'Carol Eze',     'carol@beta.ng',  NOW() - interval '25 days', NOW() - interval '25 days'),
      ('${T3}', 5, 'owner',  TRUE, 'Eve Osei',      'eve@gamma.ng',   NOW() - interval '15 days', NOW() - interval '15 days')
    ON CONFLICT DO NOTHING;
  `);
}

async function seedTenantCorridors() {
  await exec(`
    INSERT INTO tenant_corridors (id, tenant_id, source_currency, dest_currency, is_enabled, fx_markup_pct, daily_limit_usd, min_amount_usd, max_amount_usd, created_at, updated_at)
    VALUES
      ('corridor-001', '${T1}', 'NGN', 'USD', TRUE, 1.5, 50000,  1, 10000, NOW(), NOW()),
      ('corridor-002', '${T1}', 'NGN', 'EUR', TRUE, 1.8, 30000,  1,  5000, NOW(), NOW()),
      ('corridor-003', '${T2}', 'NGN', 'GBP', TRUE, 2.0, 20000,  1,  5000, NOW(), NOW()),
      ('corridor-004', '${T3}', 'NGN', 'USD', TRUE, 1.2, 100000, 1, 50000, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedTenantFeeOverrides() {
  await exec(`
    INSERT INTO tenant_fee_overrides (id, tenant_id, transaction_type, flat_fee_ngn, percentage_fee, is_active, effective_from)
    VALUES
      ('fee-001', '${T1}', 'card',          0, 1.5, TRUE, NOW() - interval '30 days'),
      ('fee-002', '${T1}', 'bank_transfer', 50, 0.5, TRUE, NOW() - interval '30 days'),
      ('fee-003', '${T2}', 'card',          0, 1.8, TRUE, NOW() - interval '20 days'),
      ('fee-004', '${T3}', 'bank_transfer', 0, 0.8, TRUE, NOW() - interval '15 days')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedTenantPlanLimits() {
  await exec(`
    INSERT INTO tenant_plan_limits (id, plan, max_api_calls_per_month, max_tx_volume_usd_per_month, max_users, max_corridors, max_webhooks, max_api_keys, price_usd_per_month)
    VALUES
      ('plan-starter',    'starter',     10000,  100000,   5,   3,   5,   3,   0),
      ('plan-growth',     'growth',     100000, 1000000,  25,  10,  20,  10,  99),
      ('plan-enterprise', 'enterprise', 999999, 9999999, 999, 999, 999, 999, 499)
    ON CONFLICT (plan) DO NOTHING;
  `);
}

async function seedTenantBillingInvoices() {
  await exec(`
    INSERT INTO tenant_billing_invoices (id, tenant_id, period, amount_usd, status, period_year, period_month, plan, created_at, updated_at)
    VALUES
      ('inv-001', '${T1}', '2026-03',  99.0, 'paid', 2026, 3, 'growth',     NOW() - interval '30 days', NOW()),
      ('inv-002', '${T1}', '2026-04',  99.0, 'open', 2026, 4, 'growth',     NOW() - interval '1 day',   NOW()),
      ('inv-003', '${T2}', '2026-03',   0.0, 'paid', 2026, 3, 'starter',    NOW() - interval '30 days', NOW()),
      ('inv-004', '${T3}', '2026-03', 499.0, 'paid', 2026, 3, 'enterprise', NOW() - interval '30 days', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedTenantUsageMetrics() {
  await exec(`
    INSERT INTO tenant_usage_metrics (tenant_id, period, api_calls, tx_volume, tx_count, active_users, webhook_deliveries, period_year, period_month, created_at, updated_at)
    VALUES
      ('${T1}', '2026-04',  45230, 1250000.0,  3420, 12,  2100, 2026, 4, NOW(), NOW()),
      ('${T2}', '2026-04',   8900,  320000.0,   890,  5,   450, 2026, 4, NOW(), NOW()),
      ('${T3}', '2026-04',  92100, 8500000.0, 12300, 45,  8900, 2026, 4, NOW(), NOW())
    ON CONFLICT DO NOTHING;
  `);
}

async function seedFeatureFlags() {
  await exec(`
    INSERT INTO feature_flags (id, key, name, description, enabled, rollout_percentage, environment, category, created_at, updated_at)
    VALUES
      ('ff-001', 'bnpl_enabled',         'BNPL Feature',          'Enable Buy Now Pay Later',     TRUE,  100, 'production', 'feature', NOW(), NOW()),
      ('ff-002', 'cross_border_enabled', 'Cross-border Payments', 'Enable cross-border payments', TRUE,  100, 'production', 'feature', NOW(), NOW()),
      ('ff-003', 'virtual_cards_v2',     'Virtual Cards V2',      'New virtual card UI',          FALSE,  10, 'production', 'feature', NOW(), NOW()),
      ('ff-004', 'ai_fraud_detection',   'AI Fraud Detection',    'ML-based fraud scoring',       TRUE,   50, 'production', 'feature', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedBnplPlans() {
  await exec(`
    INSERT INTO bnpl_plans (id, merchant_id, name, installments, interest_rate, min_amount, max_amount, currency, active, created_at, updated_at)
    VALUES
      ('bnpl-001', '${M1}', 'Pay in 3',   3, 0, 5000,   500000, 'NGN', TRUE, NOW(), NOW()),
      ('bnpl-002', '${M1}', 'Pay in 6',   6, 5, 10000, 1000000, 'NGN', TRUE, NOW(), NOW()),
      ('bnpl-003', '${M2}', 'Pay in 12', 12, 8, 20000, 2000000, 'NGN', TRUE, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedLoyaltyPrograms() {
  await exec(`
    INSERT INTO loyalty_programs (id, merchant_id, points_per_kobo, redeem_rate, active, created_at)
    VALUES
      ('loyalty-prog-001', '${M1}', 1, 100, TRUE, NOW()),
      ('loyalty-prog-002', '${M2}', 2,  50, TRUE, NOW()),
      ('loyalty-prog-003', '${M3}', 1, 200, TRUE, NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedLoyaltyAccounts() {
  await exec(`
    INSERT INTO loyalty_accounts (id, merchant_id, points_balance, lifetime_points, program_id, created_at, updated_at)
    VALUES
      ('lacct-001', '${M1}', 15000, 50000, 'loyalty-prog-001', NOW(), NOW()),
      ('lacct-002', '${M1}',  8000, 20000, 'loyalty-prog-001', NOW(), NOW()),
      ('lacct-003', '${M2}', 32000, 80000, 'loyalty-prog-002', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedConsumerWallets() {
  await exec(`
    INSERT INTO consumer_wallets (id, user_id, currency, balance_kobo, is_active, created_at, updated_at)
    VALUES
      ('cwallet-001', 1, 'NGN',  500000, TRUE, NOW(), NOW()),
      ('cwallet-002', 2, 'NGN',  250000, TRUE, NOW(), NOW()),
      ('cwallet-003', 3, 'NGN',  750000, TRUE, NOW(), NOW()),
      ('cwallet-004', 4, 'NGN',   10000, TRUE, NOW(), NOW()),
      ('cwallet-005', 5, 'NGN', 1000000, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedNipBanks() {
  await exec(`
    INSERT INTO nip_banks (id, bank_code, bank_name, short_name, nip_code, category, is_active, supports_nip, supports_ussd, created_at, updated_at)
    VALUES
      ('bank-001', '058', 'Guaranty Trust Bank',   'GTBank',   '058', 'commercial', 1, 1, 1, NOW(), NOW()),
      ('bank-002', '044', 'Access Bank',           'Access',   '044', 'commercial', 1, 1, 1, NOW(), NOW()),
      ('bank-003', '057', 'Zenith Bank',           'Zenith',   '057', 'commercial', 1, 1, 1, NOW(), NOW()),
      ('bank-004', '033', 'United Bank for Africa','UBA',      '033', 'commercial', 1, 1, 1, NOW(), NOW()),
      ('bank-005', '011', 'First Bank of Nigeria', 'FirstBank','011', 'commercial', 1, 1, 1, NOW(), NOW()),
      ('bank-006', '232', 'Sterling Bank',         'Sterling', '232', 'commercial', 1, 1, 0, NOW(), NOW()),
      ('bank-007', '215', 'Unity Bank',            'Unity',    '215', 'commercial', 1, 1, 0, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedMerchantRiskScores() {
  await exec(`
    INSERT INTO merchant_risk_scores (id, merchant_id, overall_score, fraud_score, chargeback_score, kyc_score, transaction_score, velocity_score, risk_level, calculated_at, created_at)
    VALUES
      ('risk-001', '${M1}', 85, 90, 80, 95, 88, 72, 'low',    NOW(), NOW()),
      ('risk-002', '${M2}', 62, 55, 70, 80, 65, 40, 'medium', NOW(), NOW()),
      ('risk-003', '${M3}', 35, 30, 25, 60, 40, 20, 'high',   NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedConsumerBudgets() {
  await exec(`
    INSERT INTO consumer_budgets (id, user_id, category, limit_kobo, spent_kobo, period, alert_at, is_active, created_at, updated_at)
    VALUES
      ('budget-001', 1, 'food',          50000, 32000, 'monthly', 80, TRUE, NOW(), NOW()),
      ('budget-002', 1, 'entertainment', 20000, 18000, 'monthly', 90, TRUE, NOW(), NOW()),
      ('budget-003', 2, 'transport',     30000, 15000, 'monthly', 80, TRUE, NOW(), NOW()),
      ('budget-004', 3, 'utilities',     40000, 22000, 'monthly', 75, TRUE, NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedConsumerSavingsGoals() {
  await exec(`
    INSERT INTO consumer_savings_goals (id, user_id, name, description, target_kobo, saved_kobo, auto_save_enabled, auto_save_amount_kobo, auto_save_frequency, status, created_at, updated_at)
    VALUES
      ('goal-001', 1, 'Emergency Fund', 'Six months expenses', 600000, 250000, TRUE,  10000, 'monthly', 'active', NOW(), NOW()),
      ('goal-002', 1, 'New Laptop',     'MacBook Pro',         350000, 120000, FALSE,     0, 'monthly', 'active', NOW(), NOW()),
      ('goal-003', 2, 'Vacation',       'Trip to Dubai',       500000,  50000, TRUE,   5000, 'monthly', 'active', NOW(), NOW()),
      ('goal-004', 3, 'Wedding Fund',   'Wedding savings',    2000000, 800000, TRUE,  20000, 'monthly', 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedReferrals() {
  await exec(`
    INSERT INTO referrals (id, referrer_id, referee_id, referral_code, status, referrer_reward_kobo, referee_reward_kobo, created_at, updated_at)
    VALUES
      ('ref-001', 1, 2, 'ALICE2024-001', 'completed', 50000, 25000, NOW() - interval '10 days', NOW()),
      ('ref-002', 1, 3, 'ALICE2024-002', 'completed', 50000, 25000, NOW() - interval '5 days',  NOW()),
      ('ref-003', 3, 4, 'CAROL2024-001', 'pending',   50000, 25000, NOW() - interval '1 day',   NOW())
    ON CONFLICT (referral_code) DO NOTHING;
  `);
}

async function seedHelpSearchAnalytics() {
  await exec(`
    INSERT INTO help_search_analytics (id, query, user_type, user_id, result_count, clicked_section, session_id, created_at)
    VALUES
      ('hsa-001', 'how to create api key',     'merchant', '${M1}', 5, 'api-keys', 'sess-001', NOW() - interval '1 day'),
      ('hsa-002', 'webhook setup',             'merchant', '${M1}', 3, 'webhooks', 'sess-001', NOW() - interval '1 day'),
      ('hsa-003', 'payout approval threshold', 'merchant', '${M2}', 4, 'payouts',  'sess-002', NOW() - interval '2 days'),
      ('hsa-004', 'kyc document requirements', 'merchant', '${M3}', 6, 'kyc',      'sess-003', NOW() - interval '3 days')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedInviteCodes() {
  await exec(`
    INSERT INTO invite_codes (code, type, uses_remaining, uses_total, created_by, tenant_id, is_active, created_at)
    VALUES
      ('INVITE-MERCH-001', 'merchant',    5, 5, 'admin@paygate.ng', '${T1}', TRUE, NOW()),
      ('INVITE-TEAM-001',  'team_member', 3, 3, 'admin@paygate.ng', '${T1}', TRUE, NOW()),
      ('INVITE-PART-001',  'partner',     1, 1, 'admin@paygate.ng', NULL,    TRUE, NOW())
    ON CONFLICT DO NOTHING;
  `);
}

async function seedSubscriptionPlans() {
  await exec(`
    INSERT INTO subscription_plans_v2 (id, merchant_id, name, description, price_kobo, currency, interval, interval_count, trial_days, status, created_at, updated_at)
    VALUES
      ('subplan-001', '${M1}', 'Basic Plan',   'Access to basic features',   500000, 'NGN', 'monthly', 1, 14, 'active', NOW(), NOW()),
      ('subplan-002', '${M1}', 'Pro Plan',     'Access to all features',    1500000, 'NGN', 'monthly', 1,  7, 'active', NOW(), NOW()),
      ('subplan-003', '${M1}', 'Annual Basic', 'Annual basic subscription', 5000000, 'NGN', 'yearly',  1, 30, 'active', NOW(), NOW()),
      ('subplan-004', '${M2}', 'Starter Plan', 'Entry level plan',           250000, 'NGN', 'monthly', 1,  0, 'active', NOW(), NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedIdempotencyRequests() {
  await exec(`
    INSERT INTO idempotency_requests (id, merchant_id, operation, request_hash, response_status, response_body, expires_at, tenant_id, created_at)
    VALUES
      ('idem-001', '${M1}', 'payouts.create',      'hash-001', 200, '{"id":"payout-001"}'::jsonb, NOW() + interval '23 hours', '${T1}', NOW() - interval '1 hour'),
      ('idem-002', '${M1}', 'transactions.create', 'hash-002', 200, '{"id":"txn-001"}'::jsonb,    NOW() + interval '22 hours', '${T1}', NOW() - interval '2 hours'),
      ('idem-003', '${M2}', 'payouts.create',      'hash-003', 200, '{"id":"payout-003"}'::jsonb, NOW() + interval '21 hours', '${T2}', NOW() - interval '3 hours')
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedRegulatoryReports() {
  await exec(`
    INSERT INTO regulatory_reports (id, merchant_id, report_type, period, regulator, status, submitted_at, created_at, updated_at)
    VALUES
      ('regrep-001', '${M1}', 'CBN_MONTHLY', '2026-03', 'CBN',  'submitted', NOW() - interval '28 days', NOW() - interval '30 days', NOW()),
      ('regrep-002', '${M1}', 'FIRS_ANNUAL', '2025',    'FIRS', 'pending',   NULL,                       NOW() - interval '5 days',  NOW()),
      ('regrep-003', '${M2}', 'CBN_MONTHLY', '2026-03', 'CBN',  'submitted', NOW() - interval '27 days', NOW() - interval '30 days', NOW())
    ON CONFLICT (id) DO NOTHING;
  `);
}

async function seedComplianceReports() {
  await exec(`
    INSERT INTO compliance_reports (report_id, merchant_id, report_type, status, risk_level, generated_at, created_at, updated_at)
    VALUES
      ('comprep-001', '${M1}', 'AML_SCREENING',   'passed',  'low',  NOW() - interval '7 days',  NOW() - interval '7 days',  NOW()),
      ('comprep-002', '${M2}', 'KYC_REVIEW',      'passed',  'low',  NOW() - interval '14 days', NOW() - interval '14 days', NOW()),
      ('comprep-003', '${M3}', 'SANCTIONS_CHECK', 'flagged', 'high', NOW() - interval '3 days',  NOW() - interval '3 days',  NOW())
    ON CONFLICT (report_id) DO NOTHING;
  `);
}

// ─── Main ─────────────────────────────────────────────────────────────────────
async function main() {
  console.log("🌱 PayGate seed starting…");
  const steps: Array<[string, () => Promise<void>]> = [
    ["tenants",                  seedTenants],
    ["merchants",                seedMerchants],
    ["customers",                seedCustomers],
    ["transactions",             seedTransactions],
    ["payouts",                  seedPayouts],
    ["disputes",                 seedDisputes],
    ["api_keys",                 seedApiKeys],
    ["webhooks",                 seedWebhooks],
    ["virtual_cards",            seedVirtualCards],
    ["payment_links",            seedPaymentLinks],
    ["fraud_alerts",             seedFraudAlerts],
    ["settlements",              seedSettlements],
    ["fx_rates",                 seedFxRates],
    ["fx_live_rates",            seedFxLiveRates],
    ["fx_hedge_positions",       seedFxHedgePositions],
    ["kyc_submissions",          seedKycSubmissions],
    ["team_members",             seedTeamMembers],
    ["audit_events",             seedAuditEvents],
    ["webhook_deliveries",       seedWebhookDeliveries],
    ["sla_metrics",              seedSlaMetrics],
    ["middleware_health_logs",   seedMiddlewareHealthLogs],
    ["partner_tenants",          seedPartnerTenants],
    ["tenant_users",             seedTenantUsers],
    ["tenant_corridors",         seedTenantCorridors],
    ["tenant_fee_overrides",     seedTenantFeeOverrides],
    ["tenant_plan_limits",       seedTenantPlanLimits],
    ["tenant_billing_invoices",  seedTenantBillingInvoices],
    ["tenant_usage_metrics",     seedTenantUsageMetrics],
    ["feature_flags",            seedFeatureFlags],
    ["bnpl_plans",               seedBnplPlans],
    ["loyalty_programs",         seedLoyaltyPrograms],
    ["loyalty_accounts",         seedLoyaltyAccounts],
    ["consumer_wallets",         seedConsumerWallets],
    ["nip_banks",                seedNipBanks],
    ["merchant_risk_scores",     seedMerchantRiskScores],
    ["consumer_budgets",         seedConsumerBudgets],
    ["consumer_savings_goals",   seedConsumerSavingsGoals],
    ["referrals",                seedReferrals],
    ["help_search_analytics",    seedHelpSearchAnalytics],
    ["invite_codes",             seedInviteCodes],
    ["subscription_plans_v2",    seedSubscriptionPlans],
    ["idempotency_requests",     seedIdempotencyRequests],
    ["regulatory_reports",       seedRegulatoryReports],
    ["compliance_reports",       seedComplianceReports],
  ];

  let passed = 0;
  let failed = 0;
  for (const [name, fn] of steps) {
    try {
      await fn();
      console.log(`  ✓ ${name}`);
      passed++;
    } catch (err: any) {
      console.error(`  ✗ ${name}: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n🌱 Seed complete: ${passed} passed, ${failed} failed`);
  await pool.end();
  if (failed > 0) process.exit(1);
}

main().catch((err) => {
  console.error("Seed failed:", err);
  process.exit(1);
});
