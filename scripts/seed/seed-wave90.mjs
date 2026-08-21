/**
 * PayGate Wave 90 Seed Script
 * ============================
 * Seeds wave90 feature tables:
 *   - digital_gold_holdings (goldMwRouter)
 *   - gold_sip_plans (goldMwRouter)
 *   - intl_remittance_transfers (remittanceMwRouter)
 *   - consumer_insurance_policies (insuranceMwRouter)
 *   - emi_contracts (emiMwRouter)
 *   - cashback_balances (loyaltyMwRouter)
 *   - virtual_cards (virtualCardsMwRouter)
 *   - subscription_plans_v2 (subscriptionsMwRouter)
 *   - portal_subscriptions (subscriptionsMwRouter)
 *   - tenant_branding (tenantBrandingApiRouter)
 *   - partner_onboarding_sessions (partnerOnboardingRouter)
 *
 * Usage:
 *   DATABASE_URL="mysql://..." node seed-wave90.mjs
 *   PG_DATABASE_URL="postgresql://..." node seed-wave90.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
const DATABASE_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const uid = () => crypto.randomUUID();
const now = () => new Date().toISOString();
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000).toISOString();
const daysAhead = (n) => new Date(Date.now() + n * 86_400_000).toISOString();

async function main() {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  console.log('[wave90-seed] Connected to database');

  try {
    // ─── Tenant Branding ────────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding tenant_branding...');
    const tenants = [
      {
        id: uid(), slug: 'acme-fintech', name: 'Acme Fintech',
        primary_color: '#1a73e8', secondary_color: '#34a853',
        font_family: 'Roboto', footer_text: '© 2026 Acme Fintech',
        support_email: 'support@acme-fintech.ng', custom_domain: 'portal.acme-fintech.ng',
        is_active: true, created_at: daysAgo(90),
      },
      {
        id: uid(), slug: 'nova-pay', name: 'Nova Pay',
        primary_color: '#7c3aed', secondary_color: '#db2777',
        font_family: 'Inter', footer_text: '© 2026 Nova Pay',
        support_email: 'help@novapay.ng', custom_domain: null,
        is_active: true, created_at: daysAgo(60),
      },
      {
        id: uid(), slug: 'swift-remit', name: 'Swift Remit',
        primary_color: '#0891b2', secondary_color: '#0d9488',
        font_family: 'Poppins', footer_text: '© 2026 Swift Remit',
        support_email: 'ops@swiftremit.ng', custom_domain: 'app.swiftremit.ng',
        is_active: true, created_at: daysAgo(30),
      },
    ];
    for (const t of tenants) {
      await client.query(`
        INSERT INTO tenant_branding (id, slug, name, primary_color, secondary_color, font_family,
          footer_text, support_email, custom_domain, is_active, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT (slug) DO UPDATE SET
          name = EXCLUDED.name, primary_color = EXCLUDED.primary_color,
          secondary_color = EXCLUDED.secondary_color, is_active = EXCLUDED.is_active
      `, [t.id, t.slug, t.name, t.primary_color, t.secondary_color, t.font_family,
          t.footer_text, t.support_email, t.custom_domain, t.is_active, t.created_at])
        .catch(() => console.log(`  [skip] tenant_branding ${t.slug} — table may not exist yet`));
    }

    // ─── Digital Gold Holdings ───────────────────────────────────────────────
    console.log('[wave90-seed] Seeding digital_gold_holdings...');
    const goldHoldings = [
      { id: uid(), merchant_id: 'merchant_001', quantity_grams: 10.5, avg_buy_price_ngn: 85_000, current_value_ngn: 92_000, status: 'active', created_at: daysAgo(45) },
      { id: uid(), merchant_id: 'merchant_002', quantity_grams: 25.0, avg_buy_price_ngn: 82_000, current_value_ngn: 230_000, status: 'active', created_at: daysAgo(30) },
      { id: uid(), merchant_id: 'merchant_003', quantity_grams: 5.25, avg_buy_price_ngn: 88_000, current_value_ngn: 48_300, status: 'active', created_at: daysAgo(15) },
    ];
    for (const g of goldHoldings) {
      await client.query(`
        INSERT INTO digital_gold_holdings (id, merchant_id, quantity_grams, avg_buy_price_ngn, current_value_ngn, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [g.id, g.merchant_id, g.quantity_grams, g.avg_buy_price_ngn, g.current_value_ngn, g.status, g.created_at])
        .catch(() => console.log(`  [skip] digital_gold_holdings — table may not exist yet`));
    }

    // ─── Gold SIP Plans ──────────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding gold_sip_plans...');
    const sipPlans = [
      { id: uid(), merchant_id: 'merchant_001', monthly_amount_ngn: 50_000, frequency: 'monthly', status: 'active', next_debit_date: daysAhead(15), total_invested_ngn: 200_000, created_at: daysAgo(120) },
      { id: uid(), merchant_id: 'merchant_002', monthly_amount_ngn: 100_000, frequency: 'monthly', status: 'active', next_debit_date: daysAhead(7), total_invested_ngn: 400_000, created_at: daysAgo(90) },
    ];
    for (const s of sipPlans) {
      await client.query(`
        INSERT INTO gold_sip_plans (id, merchant_id, monthly_amount_ngn, frequency, status, next_debit_date, total_invested_ngn, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO NOTHING
      `, [s.id, s.merchant_id, s.monthly_amount_ngn, s.frequency, s.status, s.next_debit_date, s.total_invested_ngn, s.created_at])
        .catch(() => console.log(`  [skip] gold_sip_plans — table may not exist yet`));
    }

    // ─── International Remittance Transfers ──────────────────────────────────
    console.log('[wave90-seed] Seeding intl_remittance_transfers...');
    const remittances = [
      { id: uid(), merchant_id: 'merchant_001', source_currency: 'NGN', dest_currency: 'GBP', source_amount: 500_000, dest_amount: 260, exchange_rate: 0.00052, fee_ngn: 2_500, status: 'completed', recipient_name: 'John Doe', recipient_account: 'GB29NWBK60161331926819', created_at: daysAgo(10) },
      { id: uid(), merchant_id: 'merchant_002', source_currency: 'NGN', dest_currency: 'USD', source_amount: 1_000_000, dest_amount: 650, exchange_rate: 0.00065, fee_ngn: 5_000, status: 'completed', recipient_name: 'Jane Smith', recipient_account: 'US1234567890', created_at: daysAgo(7) },
      { id: uid(), merchant_id: 'merchant_003', source_currency: 'NGN', dest_currency: 'EUR', source_amount: 750_000, dest_amount: 450, exchange_rate: 0.00060, fee_ngn: 3_750, status: 'pending', recipient_name: 'Carlos Ruiz', recipient_account: 'DE89370400440532013000', created_at: daysAgo(2) },
      { id: uid(), merchant_id: 'merchant_001', source_currency: 'NGN', dest_currency: 'GHS', source_amount: 200_000, dest_amount: 1_900, exchange_rate: 0.0095, fee_ngn: 1_000, status: 'completed', recipient_name: 'Kwame Mensah', recipient_account: 'GH1234567890', created_at: daysAgo(5) },
    ];
    for (const r of remittances) {
      await client.query(`
        INSERT INTO intl_remittance_transfers (id, merchant_id, source_currency, dest_currency, source_amount, dest_amount, exchange_rate, fee_ngn, status, recipient_name, recipient_account, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT (id) DO NOTHING
      `, [r.id, r.merchant_id, r.source_currency, r.dest_currency, r.source_amount, r.dest_amount, r.exchange_rate, r.fee_ngn, r.status, r.recipient_name, r.recipient_account, r.created_at])
        .catch(() => console.log(`  [skip] intl_remittance_transfers — table may not exist yet`));
    }

    // ─── Consumer Insurance Policies ─────────────────────────────────────────
    console.log('[wave90-seed] Seeding insurance_policies...');
    const policies = [
      { id: uid(), merchant_id: 'merchant_001', product_id: 'ins_life_term', category: 'life', premium_ngn: 5_000, sum_assured_ngn: 5_000_000, status: 'active', start_date: daysAgo(60), end_date: daysAhead(305), created_at: daysAgo(60) },
      { id: uid(), merchant_id: 'merchant_002', product_id: 'ins_health_basic', category: 'health', premium_ngn: 8_000, sum_assured_ngn: 2_000_000, status: 'active', start_date: daysAgo(30), end_date: daysAhead(335), created_at: daysAgo(30) },
      { id: uid(), merchant_id: 'merchant_003', product_id: 'ins_device', category: 'device', premium_ngn: 2_500, sum_assured_ngn: 300_000, status: 'active', start_date: daysAgo(15), end_date: daysAhead(350), created_at: daysAgo(15) },
      { id: uid(), merchant_id: 'merchant_001', product_id: 'ins_travel', category: 'travel', premium_ngn: 3_000, sum_assured_ngn: 1_000_000, status: 'expired', start_date: daysAgo(90), end_date: daysAgo(30), created_at: daysAgo(90) },
    ];
    for (const p of policies) {
      await client.query(`
        INSERT INTO insurance_policies (id, merchant_id, product_id, category, premium_ngn, sum_assured_ngn, status, start_date, end_date, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING
      `, [p.id, p.merchant_id, p.product_id, p.category, p.premium_ngn, p.sum_assured_ngn, p.status, p.start_date, p.end_date, p.created_at])
        .catch(() => console.log(`  [skip] insurance_policies — table may not exist yet`));
    }

    // ─── EMI Contracts ───────────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding emi_contracts...');
    const emiContracts = [
      { id: uid(), merchant_id: 'merchant_001', plan_id: 'emi_12m', principal_kobo: 500_000_00, monthly_emi_kobo: 46_000_00, months: 12, interest_rate_pct: 5.0, status: 'active', disbursed_at: daysAgo(30), created_at: daysAgo(30) },
      { id: uid(), merchant_id: 'merchant_002', plan_id: 'emi_6m', principal_kobo: 200_000_00, monthly_emi_kobo: 35_500_00, months: 6, interest_rate_pct: 3.5, status: 'active', disbursed_at: daysAgo(15), created_at: daysAgo(15) },
      { id: uid(), merchant_id: 'merchant_003', plan_id: 'emi_24m', principal_kobo: 1_000_000_00, monthly_emi_kobo: 48_000_00, months: 24, interest_rate_pct: 7.5, status: 'pending', disbursed_at: null, created_at: daysAgo(5) },
    ];
    for (const e of emiContracts) {
      await client.query(`
        INSERT INTO emi_contracts (id, merchant_id, plan_id, principal_kobo, monthly_emi_kobo, months, interest_rate_pct, status, disbursed_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT (id) DO NOTHING
      `, [e.id, e.merchant_id, e.plan_id, e.principal_kobo, e.monthly_emi_kobo, e.months, e.interest_rate_pct, e.status, e.disbursed_at, e.created_at])
        .catch(() => console.log(`  [skip] emi_contracts — table may not exist yet`));
    }

    // ─── Cashback Balances ───────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding cashback_balances...');
    const cashbackBalances = [
      { id: uid(), merchant_id: 'merchant_001', balance_ngn: 15_000, tier: 'gold', total_earned_ngn: 50_000, total_redeemed_ngn: 35_000, updated_at: daysAgo(1) },
      { id: uid(), merchant_id: 'merchant_002', balance_ngn: 8_500, tier: 'silver', total_earned_ngn: 25_000, total_redeemed_ngn: 16_500, updated_at: daysAgo(2) },
      { id: uid(), merchant_id: 'merchant_003', balance_ngn: 2_000, tier: 'bronze', total_earned_ngn: 5_000, total_redeemed_ngn: 3_000, updated_at: daysAgo(3) },
    ];
    for (const c of cashbackBalances) {
      await client.query(`
        INSERT INTO cashback_balances (id, merchant_id, balance_ngn, tier, total_earned_ngn, total_redeemed_ngn, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (merchant_id) DO UPDATE SET
          balance_ngn = EXCLUDED.balance_ngn, tier = EXCLUDED.tier, updated_at = EXCLUDED.updated_at
      `, [c.id, c.merchant_id, c.balance_ngn, c.tier, c.total_earned_ngn, c.total_redeemed_ngn, c.updated_at])
        .catch(() => console.log(`  [skip] cashback_balances — table may not exist yet`));
    }

    // ─── Virtual Cards ───────────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding virtual_cards...');
    const virtualCards = [
      { id: uid(), merchant_id: 'merchant_001', card_id: `vc_${uid().slice(0,8)}`, masked_pan: '**** **** **** 4242', card_type: 'virtual', currency: 'NGN', spend_limit_kobo: 1_000_000_00, status: 'active', created_at: daysAgo(20) },
      { id: uid(), merchant_id: 'merchant_002', card_id: `vc_${uid().slice(0,8)}`, masked_pan: '**** **** **** 5555', card_type: 'virtual', currency: 'USD', spend_limit_kobo: 500_000_00, status: 'active', created_at: daysAgo(10) },
      { id: uid(), merchant_id: 'merchant_003', card_id: `vc_${uid().slice(0,8)}`, masked_pan: '**** **** **** 1234', card_type: 'physical', currency: 'NGN', spend_limit_kobo: 2_000_000_00, status: 'frozen', created_at: daysAgo(5) },
    ];
    for (const v of virtualCards) {
      await client.query(`
        INSERT INTO virtual_cards (id, merchant_id, card_id, masked_pan, card_type, currency, spend_limit_kobo, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT (id) DO NOTHING
      `, [v.id, v.merchant_id, v.card_id, v.masked_pan, v.card_type, v.currency, v.spend_limit_kobo, v.status, v.created_at])
        .catch(() => console.log(`  [skip] virtual_cards — table may not exist yet`));
    }

    // ─── Subscription Plans V2 ───────────────────────────────────────────────
    console.log('[wave90-seed] Seeding subscription_plans_v2...');
    const subPlans = [
      { id: 'plan_starter', name: 'Starter', price_ngn: 5_000, billing_cycle: 'monthly', max_transactions: 500, max_team_members: 3, features: JSON.stringify(['basic_analytics', 'api_access', 'email_support']), is_active: true },
      { id: 'plan_growth', name: 'Growth', price_ngn: 25_000, billing_cycle: 'monthly', max_transactions: 5_000, max_team_members: 10, features: JSON.stringify(['advanced_analytics', 'api_access', 'priority_support', 'webhooks', 'fraud_scoring']), is_active: true },
      { id: 'plan_enterprise', name: 'Enterprise', price_ngn: 100_000, billing_cycle: 'monthly', max_transactions: null, max_team_members: null, features: JSON.stringify(['all_features', 'dedicated_support', 'custom_integrations', 'sla_99_9', 'white_label']), is_active: true },
    ];
    for (const p of subPlans) {
      await client.query(`
        INSERT INTO subscription_plans_v2 (id, name, price_ngn, billing_cycle, max_transactions, max_team_members, features, is_active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT (id) DO UPDATE SET
          price_ngn = EXCLUDED.price_ngn, is_active = EXCLUDED.is_active
      `, [p.id, p.name, p.price_ngn, p.billing_cycle, p.max_transactions, p.max_team_members, p.features, p.is_active])
        .catch(() => console.log(`  [skip] subscription_plans_v2 — table may not exist yet`));
    }

    // ─── Portal Subscriptions ────────────────────────────────────────────────
    console.log('[wave90-seed] Seeding portal_subscriptions...');
    const portalSubs = [
      { id: uid(), merchant_id: 'merchant_001', plan_id: 'plan_growth', status: 'active', started_at: daysAgo(60), next_billing_at: daysAhead(30), cancelled_at: null },
      { id: uid(), merchant_id: 'merchant_002', plan_id: 'plan_starter', status: 'active', started_at: daysAgo(30), next_billing_at: daysAhead(1), cancelled_at: null },
      { id: uid(), merchant_id: 'merchant_003', plan_id: 'plan_enterprise', status: 'active', started_at: daysAgo(90), next_billing_at: daysAhead(10), cancelled_at: null },
    ];
    for (const s of portalSubs) {
      await client.query(`
        INSERT INTO portal_subscriptions (id, merchant_id, plan_id, status, started_at, next_billing_at, cancelled_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO NOTHING
      `, [s.id, s.merchant_id, s.plan_id, s.status, s.started_at, s.next_billing_at, s.cancelled_at])
        .catch(() => console.log(`  [skip] portal_subscriptions — table may not exist yet`));
    }

    // ─── Partner Onboarding Sessions ─────────────────────────────────────────
    console.log('[wave90-seed] Seeding partner_onboarding_sessions...');
    const sessions = [
      {
        id: uid(), invite_code: 'PG-PARTNER-2026-DEMO1', user_id: 1, status: 'completed',
        company_name: 'Acme Fintech Ltd', rc_number: 'RC1234567', industry: 'Fintech',
        contact_email: 'ops@acme-fintech.ng', contact_phone: '+234 800 000 0001',
        primary_color: '#1a73e8', secondary_color: '#34a853', font_family: 'Roboto',
        settlement_split_pct: 70, transaction_fee_pct: 1.5, payout_schedule: 'T+1',
        minimum_payout_ngn: 10_000, tenant_id: uid(), completed_at: daysAgo(30), created_at: daysAgo(31),
      },
      {
        id: uid(), invite_code: 'PG-PARTNER-2026-DEMO2', user_id: 2, status: 'in_progress',
        company_name: 'Nova Pay Solutions', rc_number: 'RC7654321', industry: 'Payments',
        contact_email: 'hello@novapay.ng', contact_phone: '+234 800 000 0002',
        primary_color: '#7c3aed', secondary_color: '#db2777', font_family: 'Inter',
        settlement_split_pct: 65, transaction_fee_pct: 2.0, payout_schedule: 'T+2',
        minimum_payout_ngn: 5_000, tenant_id: null, completed_at: null, created_at: daysAgo(5),
      },
    ];
    for (const s of sessions) {
      await client.query(`
        INSERT INTO partner_onboarding_sessions (id, invite_code, user_id, status, company_name, rc_number, industry, contact_email, contact_phone, primary_color, secondary_color, font_family, settlement_split_pct, transaction_fee_pct, payout_schedule, minimum_payout_ngn, tenant_id, completed_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19)
        ON CONFLICT (id) DO NOTHING
      `, [s.id, s.invite_code, s.user_id, s.status, s.company_name, s.rc_number, s.industry, s.contact_email, s.contact_phone, s.primary_color, s.secondary_color, s.font_family, s.settlement_split_pct, s.transaction_fee_pct, s.payout_schedule, s.minimum_payout_ngn, s.tenant_id, s.completed_at, s.created_at])
        .catch(() => console.log(`  [skip] partner_onboarding_sessions — table may not exist yet`));
    }

    console.log('[wave90-seed] ✅ Wave 90 seed complete!');
    console.log('[wave90-seed] Tables seeded:');
    console.log('  - tenant_branding (3 tenants)');
    console.log('  - digital_gold_holdings (3 records)');
    console.log('  - gold_sip_plans (2 plans)');
    console.log('  - intl_remittance_transfers (4 transfers)');
    console.log('  - insurance_policies (4 policies)');
    console.log('  - emi_contracts (3 contracts)');
    console.log('  - cashback_balances (3 balances)');
    console.log('  - virtual_cards (3 cards)');
    console.log('  - subscription_plans_v2 (3 plans)');
    console.log('  - portal_subscriptions (3 subscriptions)');
    console.log('  - partner_onboarding_sessions (2 sessions)');

  } catch (err) {
    console.error('[wave90-seed] Error:', err.message);
    process.exit(1);
  } finally {
    await client.end();
  }
}

main();
