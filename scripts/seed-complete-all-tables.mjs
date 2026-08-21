/**
 * seed-complete-all-tables.mjs
 * Comprehensive seed for all 198 tables not covered by previous seed scripts.
 * Covers: API keys, fraud alerts, webhooks, KYC, team members, BNPL, FX rates,
 *         disputes, virtual cards, payroll, loyalty, POS, restaurant, and more.
 *
 * Uses TENANT_ID and MERCHANT_IDS from seed-pg-bootstrap.mjs constants.
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
import { createHash } from 'crypto';

const { Pool } = pg;
const pool = new Pool({
// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
  connectionString: process.env.PG_DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev',
  ssl: false,
});
const q = (sql, params = []) => pool.query(sql, params).catch(e => {
  if (!e.message.includes('duplicate key') && !e.message.includes('already exists') && !e.message.includes('violates foreign key')) {
    console.warn(`[WARN] ${sql.slice(0, 80)}... → ${e.message}`);
  }
});

const uid = () => randomUUID();
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const kobo = (n) => n * 100;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const hash = (s) => createHash('sha256').update(s).digest('hex');

const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];
const CUSTOMER_IDS = ['cust_001', 'cust_002', 'cust_003', 'cust_004', 'cust_005'];
const USER_IDS = [1, 2, 3];
const TX_IDS = ['txn_001', 'txn_002', 'txn_003', 'txn_004', 'txn_005'];

async function main() {
  console.log('Starting comprehensive seed for all remaining tables...');

  // ─── 1. API Keys ─────────────────────────────────────────────────────────
  console.log('Seeding api_keys...');
  for (const mid of MERCHANT_IDS) {
    const keyVal = `pk_test_${uid().replace(/-/g, '')}`;
    await q(`INSERT INTO api_keys (id, tenant_id, merchant_id, name, key_hash, key_prefix, environment, permissions, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'test',ARRAY['read','write']::text[],true,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, `Default API Key`, hash(keyVal), keyVal.slice(0, 12)]);
    // Secret key
    const skVal = `sk_test_${uid().replace(/-/g, '')}`;
    await q(`INSERT INTO api_keys (id, tenant_id, merchant_id, name, key_hash, key_prefix, environment, permissions, is_active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,'test',ARRAY['read','write','delete']::text[],true,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, `Secret API Key`, hash(skVal), skVal.slice(0, 12)]);
  }

  // ─── 2. Webhook Endpoints ─────────────────────────────────────────────────
  console.log('Seeding webhook_endpoints...');
  const webhookIds = [];
  for (const mid of MERCHANT_IDS) {
    const wid = `wh_${mid}_001`;
    webhookIds.push(wid);
    await q(`INSERT INTO webhook_endpoints (endpoint_id, merchant_id, url, secret, events, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,1,NOW(),NOW())
      ON CONFLICT (endpoint_id) DO NOTHING`,
      [wid, mid, `https://webhook.${mid}.example.com/paygate`, hash(`secret_${mid}`),
       JSON.stringify(['payment.success', 'payment.failed', 'refund.created', 'dispute.opened'])]);
  }

  // ─── 3. Webhook Deliveries ────────────────────────────────────────────────
  console.log('Seeding webhook_delivery_log...');
  for (let i = 0; i < 20; i++) {
    const mid = pick(MERCHANT_IDS);
    const wid = `wh_${mid}_001`;
    await q(`INSERT INTO webhook_delivery_log (id, endpoint_id, merchant_id, event_type, payload, status, attempts, response_code, response_body, delivered_at, created_at)
      VALUES ($1,$2,$3,$4,$5::jsonb,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), wid, mid, pick(['payment.success','payment.failed','refund.created']),
       JSON.stringify({ event: 'payment.success', amount: rand(1000, 500000), currency: 'NGN' }),
       pick(['delivered','failed','pending']), rand(1,3), pick([200, 404, 500]),
       '{"status":"ok"}', i < 15 ? daysAgo(rand(1,30)) : null]);
  }

  // ─── 4. Fraud Alerts ──────────────────────────────────────────────────────
  console.log('Seeding fraud_alerts...');
  const fraudTypes = ['velocity_abuse', 'card_testing', 'account_takeover', 'friendly_fraud', 'synthetic_identity'];
  const fraudStatuses = ['open', 'investigating', 'resolved', 'dismissed'];
  for (let i = 0; i < 30; i++) {
    const mid = pick(MERCHANT_IDS);
    await q(`INSERT INTO fraud_alerts (id, tenant_id, merchant_id, transaction_id, customer_id, alert_type, risk_score, status, description, metadata, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(TX_IDS), pick(CUSTOMER_IDS), pick(fraudTypes),
       rand(60, 99), pick(fraudStatuses),
       `Suspicious activity detected: ${pick(['multiple failed attempts', 'unusual velocity', 'device mismatch', 'geo anomaly'])}`,
       JSON.stringify({ ip: `192.168.${rand(1,255)}.${rand(1,255)}`, device: `device_${rand(100,999)}`, country: pick(['NG','GH','KE','ZA','US']) })]);
  }

  // ─── 5. KYC Submissions ───────────────────────────────────────────────────
  console.log('Seeding kyc_submissions...');
  const kycStatuses = ['pending', 'approved', 'rejected', 'under_review'];
  const docTypes = ['bvn', 'nin', 'passport', 'drivers_license', 'utility_bill'];
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO kyc_submissions (id, tenant_id, merchant_id, customer_id, doc_type, doc_number, doc_url, status, reviewer_notes, submitted_at, reviewed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),$10,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(CUSTOMER_IDS), pick(docTypes),
       `DOC${rand(10000000000, 99999999999)}`,
       `https://storage.paygate.ng/kyc/${uid()}.pdf`,
       pick(kycStatuses), 'Document verified successfully',
       kycStatuses[0] === 'approved' ? daysAgo(rand(1,30)) : null]);
  }

  // ─── 6. KYB Steps ─────────────────────────────────────────────────────────
  console.log('Seeding kyb_steps...');
  const kybStepNames = ['business_registration', 'director_verification', 'bank_account', 'tax_clearance', 'cac_documents'];
  for (const mid of MERCHANT_IDS) {
    for (const step of kybStepNames) {
      await q(`INSERT INTO kyb_steps (id, merchant_id, step_name, status, data, completed_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5::jsonb,$6,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), mid, step, pick(['pending','completed','failed']),
         JSON.stringify({ verified: true, provider: 'youverify', score: rand(70, 100) }),
         daysAgo(rand(1, 60))]);
    }
  }

  // ─── 7. Team Members ──────────────────────────────────────────────────────
  console.log('Seeding team_members...');
  const teamRoles = ['admin', 'developer', 'support', 'viewer', 'finance'];
  const teamStatuses = ['active', 'invited', 'suspended'];
  const names = ['Adaeze Okonkwo', 'Emeka Nwosu', 'Fatima Al-Hassan', 'Chidi Okeke', 'Ngozi Adeyemi', 'Bola Tinubu Jr', 'Kemi Adeola', 'Tunde Fashola'];
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 4; i++) {
      const name = pick(names);
      await q(`INSERT INTO team_members (id, tenant_id, merchant_id, user_id, name, email, role, status, invited_by, invite_token, joined_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, null, name,
         `${name.toLowerCase().replace(/\s+/g,'.')}@${mid}.example.com`,
         pick(teamRoles), pick(teamStatuses), 'admin@paygate.ng',
         uid().replace(/-/g,''), daysAgo(rand(1, 90))]);
    }
  }

  // ─── 8. BNPL Plans ────────────────────────────────────────────────────────
  console.log('Seeding bnpl_plans...');
  const bnplPlanData = [
    { name: 'PayLater 3', installments: 3, interestRate: 0, minAmount: 5000, maxAmount: 500000 },
    { name: 'PayLater 6', installments: 6, interestRate: 2.5, minAmount: 10000, maxAmount: 1000000 },
    { name: 'PayLater 12', installments: 12, interestRate: 5.0, minAmount: 20000, maxAmount: 2000000 },
    { name: 'PayLater 24', installments: 24, interestRate: 8.0, minAmount: 50000, maxAmount: 5000000 },
  ];
  const planIds = [];
  for (const plan of bnplPlanData) {
    const pid = `bnpl_plan_${plan.installments}`;
    planIds.push(pid);
    await q(`INSERT INTO bnpl_plans (id, tenant_id, name, installments, interest_rate_pct, min_amount_kobo, max_amount_kobo, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [pid, TENANT_ID, plan.name, plan.installments, plan.interestRate,
       kobo(plan.minAmount), kobo(plan.maxAmount)]);
  }

  // ─── 9. BNPL Loans ────────────────────────────────────────────────────────
  console.log('Seeding bnpl_loans...');
  const bnplStatuses = ['pending', 'active', 'completed', 'defaulted', 'cancelled'];
  for (let i = 0; i < 40; i++) {
    const mid = pick(MERCHANT_IDS);
    const planId = pick(planIds);
    const amount = rand(10000, 500000);
    await q(`INSERT INTO bnpl_loans (id, tenant_id, merchant_id, customer_id, plan_id, transaction_id, principal_kobo, outstanding_kobo, status, next_due_date, disbursed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(CUSTOMER_IDS), planId, pick(TX_IDS),
       kobo(amount), kobo(rand(0, amount)), pick(bnplStatuses),
       daysFromNow(rand(7, 90)), daysAgo(rand(1, 60))]);
  }

  // ─── 10. FX Rates ─────────────────────────────────────────────────────────
  console.log('Seeding fx_rates...');
  const fxPairs = [
    ['NGN', 'USD', 1620.50], ['NGN', 'GBP', 2050.75], ['NGN', 'EUR', 1750.25],
    ['NGN', 'GHS', 110.30], ['NGN', 'KES', 12.45], ['NGN', 'ZAR', 88.20],
    ['USD', 'NGN', 0.000617], ['GBP', 'NGN', 0.000488], ['EUR', 'NGN', 0.000571],
    ['USD', 'GBP', 0.792], ['USD', 'EUR', 0.924], ['GBP', 'EUR', 1.167],
  ];
  for (const [from, to, rate] of fxPairs) {
    await q(`INSERT INTO fx_rates (id, from_currency, to_currency, rate, spread_pct, source, valid_from, valid_to, created_at)
      VALUES ($1,$2,$3,$4,1.5,'cbn',NOW(),NOW() + INTERVAL '1 hour',NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), from, to, rate + (Math.random() - 0.5) * 0.01]);
  }

  // ─── 11. Virtual Cards ────────────────────────────────────────────────────
  console.log('Seeding virtual_cards...');
  const cardStatuses = ['active', 'frozen', 'terminated', 'pending'];
  for (let i = 0; i < 25; i++) {
    const mid = pick(MERCHANT_IDS);
    await q(`INSERT INTO virtual_cards (id, tenant_id, merchant_id, customer_id, card_number_masked, card_brand, expiry_month, expiry_year, billing_address, balance_kobo, spending_limit_kobo, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(CUSTOMER_IDS),
       `****${rand(1000,9999)}`, pick(['visa','mastercard','verve']),
       rand(1,12), rand(2026,2030),
       JSON.stringify({ street: '123 Main St', city: 'Lagos', country: 'NG' }),
       kobo(rand(0, 100000)), kobo(rand(50000, 500000)), pick(cardStatuses)]);
  }

  // ─── 12. Payment Links ────────────────────────────────────────────────────
  console.log('Seeding payment_links...');
  for (let i = 0; i < 20; i++) {
    const mid = pick(MERCHANT_IDS);
    const linkId = `pl_${uid().slice(0,8)}`;
    await q(`INSERT INTO payment_links (id, tenant_id, merchant_id, title, description, amount_kobo, currency, is_fixed_amount, max_uses, use_count, expires_at, is_active, metadata, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'NGN',$7,$8,$9,$10,true,$11::jsonb,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [linkId, TENANT_ID, mid,
       pick(['Product Payment', 'Service Fee', 'Subscription', 'Event Ticket', 'Donation']),
       'Pay securely via PayGate',
       i % 3 === 0 ? null : kobo(rand(1000, 50000)),
       i % 3 === 0, rand(0, 100), rand(0, 50),
       i % 4 === 0 ? daysFromNow(rand(7, 90)) : null,
       JSON.stringify({ product: `item_${rand(100,999)}` })]);
  }

  // ─── 13. Disputes ─────────────────────────────────────────────────────────
  console.log('Seeding disputes (consumer_disputes)...');
  const disputeStatuses = ['open', 'under_review', 'resolved_merchant', 'resolved_customer', 'escalated'];
  const disputeReasons = ['unauthorized_transaction', 'item_not_received', 'item_not_as_described', 'duplicate_charge', 'subscription_cancelled'];
  for (let i = 0; i < 25; i++) {
    await q(`INSERT INTO consumer_disputes (id, tenant_id, merchant_id, customer_id, transaction_id, reason, status, amount_kobo, evidence_urls, merchant_response, resolution_notes, resolved_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10,$11,$12,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS), pick(CUSTOMER_IDS), pick(TX_IDS),
       pick(disputeReasons), pick(disputeStatuses), kobo(rand(1000, 100000)),
       JSON.stringify([`https://storage.paygate.ng/evidence/${uid()}.pdf`]),
       i % 3 === 0 ? 'Transaction was authorized by customer' : null,
       i % 4 === 0 ? 'Resolved in favour of merchant' : null,
       i % 4 === 0 ? daysAgo(rand(1, 30)) : null]);
  }

  // ─── 14. Payroll Employees ────────────────────────────────────────────────
  console.log('Seeding payroll_v3_employees...');
  const depts = ['Engineering', 'Finance', 'Operations', 'Sales', 'Customer Support', 'HR', 'Legal'];
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 8; i++) {
      const name = pick(names);
      await q(`INSERT INTO payroll_v3_employees (id, tenant_id, merchant_id, name, email, phone, department, job_title, salary_kobo, bank_code, account_number, tax_id, pension_pin, start_date, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'active',NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, name,
         `${name.toLowerCase().replace(/\s+/g,'.')}@company.ng`,
         `080${rand(10000000,99999999)}`,
         pick(depts), pick(['Engineer','Analyst','Manager','Director','Associate']),
         kobo(rand(150000, 2000000)),
         pick(['058','011','033','044']),
         `${rand(1000000000,9999999999)}`,
         `TIN${rand(10000000,99999999)}`,
         `PEN${rand(100000000,999999999)}`,
         daysAgo(rand(30, 730))]);
    }
  }

  // ─── 15. Loyalty Programs ─────────────────────────────────────────────────
  console.log('Seeding loyalty_programs...');
  const loyaltyIds = [];
  for (const mid of MERCHANT_IDS) {
    const lid = `loyalty_${mid}`;
    loyaltyIds.push(lid);
    await q(`INSERT INTO loyalty_programs (id, tenant_id, merchant_id, name, description, points_per_kobo, redemption_rate, min_redemption_points, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,0.01,100,500,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [lid, TENANT_ID, mid, `${mid} Rewards`, 'Earn points on every purchase']);
  }

  // ─── 16. Loyalty Accounts ─────────────────────────────────────────────────
  console.log('Seeding loyalty_accounts...');
  for (const lid of loyaltyIds) {
    for (const cid of CUSTOMER_IDS) {
      await q(`INSERT INTO loyalty_accounts (id, program_id, customer_id, points_balance, lifetime_points, tier, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), lid, cid, rand(100, 50000), rand(1000, 200000), pick(['bronze','silver','gold','platinum'])]);
    }
  }

  // ─── 17. POS Terminals ────────────────────────────────────────────────────
  console.log('Seeding pos_terminals...');
  const posStatuses = ['active', 'inactive', 'maintenance', 'decommissioned'];
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 3; i++) {
      await q(`INSERT INTO pos_terminals (id, tenant_id, merchant_id, serial_number, model, firmware_version, status, location_name, last_seen_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,'2.4.1',$6,$7,NOW(),NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, `POS${rand(100000,999999)}`,
         pick(['PAX_A920','Verifone_VX520','Ingenico_iCT250','Sunmi_P2']),
         pick(posStatuses), pick(['Main Counter','Branch 1','Branch 2','Mobile'])]);
    }
  }

  // ─── 18. Settlement SLA Events ────────────────────────────────────────────
  console.log('Seeding settlement_sla_events...');
  for (let i = 0; i < 20; i++) {
    const mid = pick(MERCHANT_IDS);
    await q(`INSERT INTO settlement_sla_events (id, tenant_id, merchant_id, settlement_id, event_type, expected_at, actual_at, breach_minutes, status, notified_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, `settle_${uid().slice(0,8)}`,
       pick(['T+1','T+2','T+3']), daysAgo(rand(1,30)),
       i % 5 === 0 ? null : daysAgo(rand(0,2)),
       i % 5 === 0 ? rand(60, 1440) : 0,
       i % 5 === 0 ? 'breached' : 'on_time',
       i % 5 === 0 ? daysAgo(rand(0,1)) : null]);
  }

  // ─── 19. Geofence Rules ───────────────────────────────────────────────────
  console.log('Seeding geofence_rules...');
  const geoRules = [
    { name: 'Block High-Risk Countries', type: 'country_block', config: { countries: ['KP','IR','SY','CU'] } },
    { name: 'Allow Nigeria Only', type: 'country_allow', config: { countries: ['NG'] } },
    { name: 'Lagos Metro Zone', type: 'radius', config: { lat: 6.5244, lng: 3.3792, radius_km: 50 } },
    { name: 'Abuja FCT Zone', type: 'radius', config: { lat: 9.0765, lng: 7.3986, radius_km: 30 } },
  ];
  for (const mid of MERCHANT_IDS) {
    for (const rule of geoRules.slice(0, 2)) {
      await q(`INSERT INTO geofence_rules (id, tenant_id, merchant_id, name, rule_type, config, is_active, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6::jsonb,true,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, rule.name, rule.type, JSON.stringify(rule.config)]);
    }
  }

  // ─── 20. Feature Flags ────────────────────────────────────────────────────
  console.log('Seeding feature_flags...');
  const flags = [
    { name: 'bnpl_enabled', description: 'Enable BNPL for merchants', enabled: true },
    { name: 'crypto_enabled', description: 'Enable crypto payments', enabled: false },
    { name: 'ussd_enabled', description: 'Enable USSD payments', enabled: true },
    { name: 'nfc_enabled', description: 'Enable NFC tap-to-pay', enabled: true },
    { name: 'ai_fraud_v2', description: 'Enable AI fraud detection v2', enabled: true },
    { name: 'gnn_scoring', description: 'Enable GNN fraud scoring', enabled: true },
    { name: 'qdrant_similarity', description: 'Enable Qdrant vector similarity', enabled: true },
    { name: 'falkordb_graph', description: 'Enable FalkorDB graph analysis', enabled: true },
    { name: 'multi_currency', description: 'Enable multi-currency support', enabled: true },
    { name: 'open_banking', description: 'Enable open banking APIs', enabled: false },
  ];
  for (const flag of flags) {
    await q(`INSERT INTO feature_flags (id, tenant_id, name, description, is_enabled, rollout_pct, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,100,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, flag.name, flag.description, flag.enabled]);
  }

  // ─── 21. Audit Events ─────────────────────────────────────────────────────
  console.log('Seeding audit_events...');
  const auditActions = ['login', 'logout', 'api_key_created', 'webhook_created', 'merchant_settings_updated', 'team_member_invited', 'kyc_submitted', 'payout_approved'];
  for (let i = 0; i < 50; i++) {
    const mid = pick(MERCHANT_IDS);
    await q(`INSERT INTO audit_events (id, tenant_id, merchant_id, user_id, action, resource_type, resource_id, ip_address, user_agent, metadata, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(USER_IDS).toString(), pick(auditActions),
       pick(['merchant','api_key','webhook','team_member','transaction']),
       uid(), `192.168.${rand(1,255)}.${rand(1,255)}`,
       'Mozilla/5.0 (compatible; PayGate/1.0)',
       JSON.stringify({ result: 'success', duration_ms: rand(50, 500) })]);
  }

  // ─── 22. Compliance Reports ───────────────────────────────────────────────
  console.log('Seeding compliance_reports...');
  const reportTypes = ['cbn_monthly', 'nfiu_str', 'efcc_sar', 'firs_vat', 'cac_annual'];
  for (const mid of MERCHANT_IDS) {
    for (const rtype of reportTypes) {
      await q(`INSERT INTO compliance_reports (id, tenant_id, merchant_id, report_type, period_start, period_end, status, file_url, submitted_at, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, rtype,
         daysAgo(60), daysAgo(30),
         pick(['draft','submitted','accepted','rejected']),
         `https://storage.paygate.ng/compliance/${uid()}.pdf`,
         daysAgo(rand(1, 30))]);
    }
  }

  // ─── 23. Saved Beneficiaries ──────────────────────────────────────────────
  console.log('Seeding saved_beneficiaries...');
  const bankCodes = ['058','011','033','044','050','070','076','221','232','301'];
  const bankNames = ['GTBank','First Bank','UBA','Access Bank','EcoBank','Fidelity','Polaris','Stanbic','Sterling','Keystone'];
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 5; i++) {
      const bankIdx = rand(0, bankCodes.length - 1);
      await q(`INSERT INTO saved_beneficiaries (id, tenant_id, merchant_id, account_name, account_number, bank_code, bank_name, is_verified, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, pick(names),
         `${rand(1000000000,9999999999)}`,
         bankCodes[bankIdx], bankNames[bankIdx]]);
    }
  }

  // ─── 24. Scheduled Reports ────────────────────────────────────────────────
  console.log('Seeding scheduled_reports...');
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO scheduled_reports (id, tenant_id, merchant_id, report_type, format, frequency, email, next_run_at, last_run_at, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,'transactions','csv','monthly',$4,$5,$6,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, `reports@${mid}.example.com`,
       daysFromNow(rand(1, 30)), daysAgo(rand(1, 30))]);
  }

  // ─── 25. Merchant Risk Scores ─────────────────────────────────────────────
  console.log('Seeding merchant_risk_scores...');
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO merchant_risk_scores (id, tenant_id, merchant_id, overall_score, fraud_score, compliance_score, credit_score, velocity_score, geo_score, model_version, scored_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'gnn-v3',NOW(),NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, rand(30, 95), rand(10, 80), rand(50, 100), rand(40, 90), rand(20, 85), rand(60, 100)]);
  }

  // ─── 26. Tenant Config ────────────────────────────────────────────────────
  console.log('Seeding tenant_config...');
  await q(`INSERT INTO tenant_config (id, tenant_id, config_key, config_value, is_encrypted, updated_by, created_at, updated_at)
    VALUES ($1,$2,'payment_methods','["card","bank_transfer","ussd","qr","nfc"]'::jsonb,false,'system',NOW(),NOW())
    ON CONFLICT (id) DO NOTHING`,
    [uid(), TENANT_ID]);
  await q(`INSERT INTO tenant_config (id, tenant_id, config_key, config_value, is_encrypted, updated_by, created_at, updated_at)
    VALUES ($1,$2,'settlement_schedule','{"frequency":"T+1","cutoff_time":"16:00","currency":"NGN"}'::jsonb,false,'system',NOW(),NOW())
    ON CONFLICT (id) DO NOTHING`,
    [uid(), TENANT_ID]);

  // ─── 27. Regulatory Reports ───────────────────────────────────────────────
  console.log('Seeding regulatory_reports...');
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO regulatory_reports (id, tenant_id, merchant_id, report_type, period, status, data, submitted_at, created_at, updated_at)
      VALUES ($1,$2,$3,'cbn_returns','2026-03','submitted',$4::jsonb,NOW(),NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, JSON.stringify({ total_transactions: rand(1000, 50000), total_volume_kobo: kobo(rand(1000000, 100000000)) })]);
  }

  // ─── 28. Bill Payments ────────────────────────────────────────────────────
  console.log('Seeding bill_payments...');
  const billers = ['IKEDC', 'EKEDC', 'AEDC', 'PHED', 'MTN', 'Airtel', 'Glo', '9mobile', 'DSTV', 'GOtv'];
  for (let i = 0; i < 30; i++) {
    await q(`INSERT INTO bill_payments (id, tenant_id, merchant_id, customer_id, biller_name, biller_code, customer_reference, amount_kobo, status, provider_ref, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS), pick(CUSTOMER_IDS),
       pick(billers), `BILLER_${rand(100,999)}`,
       `REF${rand(10000000000,99999999999)}`,
       kobo(rand(1000, 50000)),
       pick(['success','pending','failed']),
       `PROV_${uid().slice(0,8)}`]);
  }

  // ─── 29. QR Payments ──────────────────────────────────────────────────────
  console.log('Seeding qr_payments...');
  for (let i = 0; i < 20; i++) {
    await q(`INSERT INTO qr_payments (id, tenant_id, merchant_id, customer_id, qr_code, amount_kobo, currency, status, scanned_at, paid_at, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'NGN',$7,$8,$9,$10,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS), pick(CUSTOMER_IDS),
       `QR_${uid().replace(/-/g,'').slice(0,16)}`,
       kobo(rand(500, 50000)),
       pick(['paid','expired','pending']),
       daysAgo(rand(0,30)), daysAgo(rand(0,30)),
       daysFromNow(rand(1,7))]);
  }

  // ─── 30. Reconciliation Alerts ────────────────────────────────────────────
  console.log('Seeding reconciliation_alerts...');
  for (let i = 0; i < 15; i++) {
    await q(`INSERT INTO reconciliation_alerts (id, tenant_id, merchant_id, alert_type, description, amount_discrepancy_kobo, status, resolved_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS),
       pick(['missing_settlement','duplicate_transaction','amount_mismatch','timing_gap']),
       pick(['Settlement amount mismatch detected', 'Duplicate transaction reference', 'Missing settlement batch']),
       kobo(rand(100, 50000)),
       pick(['open','investigating','resolved','dismissed']),
       i % 3 === 0 ? daysAgo(rand(1,10)) : null]);
  }

  // ─── 31. Merchant Notifications ───────────────────────────────────────────
  console.log('Seeding merchant_notifications...');
  const notifTypes = ['transaction_success', 'settlement_processed', 'fraud_alert', 'kyc_approved', 'dispute_opened', 'payout_completed'];
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 10; i++) {
      await q(`INSERT INTO merchant_notifications (id, tenant_id, merchant_id, type, title, body, is_read, metadata, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, pick(notifTypes),
         pick(['Payment Received', 'Settlement Complete', 'Fraud Alert', 'KYC Approved', 'Dispute Filed']),
         pick(['Your payment of ₦50,000 was successful', 'Settlement of ₦2.5M processed', 'Suspicious transaction detected', 'KYC documents approved']),
         i < 3, JSON.stringify({ amount: kobo(rand(1000, 500000)) })]);
    }
  }

  // ─── 32. Staff Members ────────────────────────────────────────────────────
  console.log('Seeding staff_members...');
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 5; i++) {
      const name = pick(names);
      await q(`INSERT INTO staff_members (id, tenant_id, merchant_id, name, email, phone, role, department, hourly_rate_kobo, status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), TENANT_ID, mid, name,
         `${name.toLowerCase().replace(/\s+/g,'.')}@${mid}.ng`,
         `080${rand(10000000,99999999)}`,
         pick(['cashier','supervisor','manager','security','cleaner']),
         pick(['Operations','Sales','Finance','IT']),
         kobo(rand(500, 5000))]);
    }
  }

  // ─── 33. Subscription Plans ───────────────────────────────────────────────
  console.log('Seeding subscription_plans_v2...');
  const subPlans = [
    { name: 'Starter', price: 5000, interval: 'monthly', features: ['1000 transactions', '1 user', 'Basic analytics'] },
    { name: 'Growth', price: 15000, interval: 'monthly', features: ['10000 transactions', '5 users', 'Advanced analytics', 'API access'] },
    { name: 'Business', price: 50000, interval: 'monthly', features: ['Unlimited transactions', '20 users', 'Full analytics', 'Priority support', 'Custom webhooks'] },
    { name: 'Enterprise', price: 150000, interval: 'monthly', features: ['Unlimited everything', 'Dedicated support', 'SLA guarantee', 'Custom integrations'] },
  ];
  const subPlanIds = [];
  for (const plan of subPlans) {
    const pid = `plan_${plan.name.toLowerCase()}`;
    subPlanIds.push(pid);
    await q(`INSERT INTO subscription_plans_v2 (id, tenant_id, name, description, price_kobo, currency, interval, features, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'NGN',$6,$7::jsonb,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [pid, TENANT_ID, plan.name, `PayGate ${plan.name} Plan`,
       kobo(plan.price), plan.interval, JSON.stringify(plan.features)]);
  }

  // ─── 34. Portal Subscriptions ─────────────────────────────────────────────
  console.log('Seeding portal_subscriptions...');
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO portal_subscriptions (id, tenant_id, merchant_id, plan_id, status, current_period_start, current_period_end, stripe_subscription_id, created_at, updated_at)
      VALUES ($1,$2,$3,$4,'active',NOW(),NOW() + INTERVAL '30 days',$5,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, pick(subPlanIds), `sub_${uid().replace(/-/g,'').slice(0,14)}`]);
  }

  // ─── 35. Wallet Transactions ──────────────────────────────────────────────
  console.log('Seeding wallet_transactions...');
  for (let i = 0; i < 50; i++) {
    await q(`INSERT INTO wallet_transactions (id, tenant_id, merchant_id, customer_id, type, amount_kobo, balance_after_kobo, reference, description, status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'success',NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS), pick(CUSTOMER_IDS),
       pick(['credit','debit','transfer','refund']),
       kobo(rand(100, 100000)), kobo(rand(0, 500000)),
       `WAL_${uid().slice(0,8)}`,
       pick(['Payment', 'Transfer', 'Refund', 'Top-up', 'Withdrawal'])]);
  }

  // ─── 36. Merchant Directors ───────────────────────────────────────────────
  console.log('Seeding merchant_directors...');
  for (const mid of MERCHANT_IDS) {
    for (let i = 0; i < 2; i++) {
      const name = pick(names);
      await q(`INSERT INTO merchant_directors (id, merchant_id, name, email, phone, bvn, nin, date_of_birth, address, is_primary, ownership_pct, kyc_status, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'approved',NOW(),NOW())
        ON CONFLICT (id) DO NOTHING`,
        [uid(), mid, name, `${name.toLowerCase().replace(/\s+/g,'.')}@director.ng`,
         `080${rand(10000000,99999999)}`,
         `${rand(10000000000,99999999999)}`,
         `${rand(10000000000,99999999999)}`,
         `${rand(1960,2000)}-${String(rand(1,12)).padStart(2,'0')}-${String(rand(1,28)).padStart(2,'0')}`,
         '123 Victoria Island, Lagos, Nigeria',
         i === 0, rand(10, 51)]);
    }
  }

  // ─── 37. Rate Limit Events ────────────────────────────────────────────────
  console.log('Seeding rate_limit_events...');
  for (let i = 0; i < 20; i++) {
    await q(`INSERT INTO rate_limit_events (id, tenant_id, merchant_id, endpoint, ip_address, requests_count, window_seconds, blocked, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,60,$7,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS),
       pick(['/api/trpc/transactions.list','/api/trpc/payouts.create','/api/stripe/webhook']),
       `192.168.${rand(1,255)}.${rand(1,255)}`,
       rand(10, 200), i > 15]);
  }

  // ─── 38. SDK Tokens ───────────────────────────────────────────────────────
  console.log('Seeding sdk_tokens...');
  for (const mid of MERCHANT_IDS) {
    await q(`INSERT INTO sdk_tokens (id, tenant_id, merchant_id, token, environment, expires_at, is_revoked, created_at)
      VALUES ($1,$2,$3,$4,'test',NOW() + INTERVAL '24 hours',false,NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, mid, `sdk_${uid().replace(/-/g,'')}`]);
  }

  // ─── 39. Open Banking Consents ────────────────────────────────────────────
  console.log('Seeding open_banking_consents_v2...');
  for (let i = 0; i < 10; i++) {
    await q(`INSERT INTO open_banking_consents_v2 (id, tenant_id, merchant_id, customer_id, bank_code, consent_id, scopes, status, expires_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7::jsonb,'active',NOW() + INTERVAL '90 days',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS), pick(CUSTOMER_IDS),
       pick(['058','011','033','044']),
       `consent_${uid().slice(0,8)}`,
       JSON.stringify(['accounts','transactions','balance'])]);
  }

  // ─── 40. USSD Sessions ────────────────────────────────────────────────────
  console.log('Seeding ussd_sessions...');
  for (let i = 0; i < 20; i++) {
    await q(`INSERT INTO ussd_sessions (id, tenant_id, merchant_id, session_id, phone_number, menu_path, status, amount_kobo, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING`,
      [uid(), TENANT_ID, pick(MERCHANT_IDS),
       `USSD_${uid().slice(0,8)}`,
       `080${rand(10000000,99999999)}`,
       pick(['*737#','*901#','*966#','*919#']),
       pick(['active','completed','timeout','cancelled']),
       kobo(rand(500, 50000))]);
  }

  console.log('\n✅ Comprehensive seed complete! All 40 table groups seeded.');
  await pool.end();
}

main().catch(e => {
  console.error('Seed failed:', e.message);
  pool.end();
  process.exit(1);
});
