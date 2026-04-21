/**
 * Wave 34 Seed Script
 * Seeds: gnn_thresholds, fraud_rings, emi_loans, insurance_policies, webhook_events
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
const { Pool } = pg;

const pool = new Pool({
  connectionString: process.env.PG_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.PG_DATABASE_URL ? { rejectUnauthorized: false } : false,
});

async function q(sql, params = []) {
  const client = await pool.connect();
  try {
    return await client.query(sql, params);
  } finally {
    client.release();
  }
}

async function tableExists(name) {
  const res = await q(`SELECT 1 FROM information_schema.tables WHERE table_name=$1`, [name]);
  return res.rowCount > 0;
}

async function seedGnnThresholds() {
  if (!(await tableExists('gnn_thresholds'))) {
    console.log('Creating gnn_thresholds table...');
    await q(`CREATE TABLE IF NOT EXISTS gnn_thresholds (
      id SERIAL PRIMARY KEY,
      plan_id VARCHAR(50) NOT NULL UNIQUE,
      gnn_threshold_kobo BIGINT NOT NULL DEFAULT 0,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }
  const plans = [
    { plan_id: 'starter', gnn_threshold_kobo: 0 },
    { plan_id: 'growth', gnn_threshold_kobo: 10000000 },
    { plan_id: 'enterprise', gnn_threshold_kobo: 5000000 },
  ];
  for (const p of plans) {
    await q(`INSERT INTO gnn_thresholds (plan_id, gnn_threshold_kobo) VALUES ($1, $2)
      ON CONFLICT (plan_id) DO UPDATE SET gnn_threshold_kobo = EXCLUDED.gnn_threshold_kobo, updated_at = NOW()`,
      [p.plan_id, p.gnn_threshold_kobo]);
  }
  console.log(`✓ Seeded ${plans.length} GNN threshold records`);
}

async function seedFraudRings() {
  if (!(await tableExists('fraud_rings'))) {
    console.log('Creating fraud_rings table...');
    await q(`CREATE TABLE IF NOT EXISTS fraud_rings (
      id VARCHAR(50) PRIMARY KEY,
      ring_name VARCHAR(255) NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      member_count INT NOT NULL DEFAULT 0,
      total_fraud_amount_kobo BIGINT NOT NULL DEFAULT 0,
      detection_method VARCHAR(100),
      risk_score INT NOT NULL DEFAULT 0,
      notes TEXT,
      detected_at TIMESTAMPTZ DEFAULT NOW(),
      frozen_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }
  const rings = [
    { id: 'ring_001', ring_name: 'Lagos Card Cloning Ring', status: 'frozen', member_count: 12, total_fraud_amount_kobo: 45000000, detection_method: 'GNN GraphSAGE', risk_score: 97, notes: 'Coordinated card cloning operation across 5 ATMs in Lagos Island', detected_at: new Date(Date.now() - 7*24*3600*1000) },
    { id: 'ring_002', ring_name: 'Abuja Account Takeover Ring', status: 'active', member_count: 7, total_fraud_amount_kobo: 23500000, detection_method: 'GNN + Rule-based', risk_score: 89, notes: 'SIM swap + OTP bypass pattern detected', detected_at: new Date(Date.now() - 3*24*3600*1000) },
    { id: 'ring_003', ring_name: 'PH BVN Fraud Network', status: 'investigating', member_count: 23, total_fraud_amount_kobo: 78000000, detection_method: 'GNN GraphSAGE', risk_score: 95, notes: 'Multiple accounts sharing BVN patterns', detected_at: new Date(Date.now() - 14*24*3600*1000) },
    { id: 'ring_004', ring_name: 'Kano Money Mule Network', status: 'active', member_count: 5, total_fraud_amount_kobo: 12000000, detection_method: 'Rule-based', risk_score: 72, notes: 'Rapid fund movement through multiple accounts', detected_at: new Date(Date.now() - 1*24*3600*1000) },
    { id: 'ring_005', ring_name: 'Cross-Border Remittance Fraud', status: 'resolved', member_count: 9, total_fraud_amount_kobo: 156000000, detection_method: 'GNN GraphSAGE', risk_score: 99, notes: 'International wire fraud ring — resolved with EFCC', detected_at: new Date(Date.now() - 30*24*3600*1000) },
  ];
  for (const r of rings) {
    await q(`INSERT INTO fraud_rings (id, ring_name, status, member_count, total_fraud_amount_kobo, detection_method, risk_score, notes, detected_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO UPDATE SET status=EXCLUDED.status, member_count=EXCLUDED.member_count, updated_at=NOW()`,
      [r.id, r.ring_name, r.status, r.member_count, r.total_fraud_amount_kobo, r.detection_method, r.risk_score, r.notes, r.detected_at]);
  }
  console.log(`✓ Seeded ${rings.length} fraud ring records`);
}

async function seedEmiLoans() {
  if (!(await tableExists('emi_loans'))) {
    console.log('Creating emi_loans table...');
    await q(`CREATE TABLE IF NOT EXISTS emi_loans (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(100) NOT NULL,
      principal_kobo BIGINT NOT NULL,
      emi_kobo BIGINT NOT NULL,
      tenure_months INT NOT NULL,
      annual_rate_pct DECIMAL(5,2) NOT NULL DEFAULT 24,
      purpose TEXT NOT NULL,
      status VARCHAR(50) NOT NULL DEFAULT 'active',
      next_payment_date TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }
  const loans = [
    { id: 'emi_demo_001', user_id: 'demo_user', principal_kobo: 50000000, emi_kobo: 4711700, tenure_months: 12, annual_rate_pct: 24, purpose: 'Business equipment purchase', status: 'active', next_payment_date: new Date(Date.now() + 15*24*3600*1000) },
    { id: 'emi_demo_002', user_id: 'demo_user', principal_kobo: 100000000, emi_kobo: 5224400, tenure_months: 24, annual_rate_pct: 24, purpose: 'Working capital', status: 'active', next_payment_date: new Date(Date.now() + 7*24*3600*1000) },
    { id: 'emi_demo_003', user_id: 'demo_user', principal_kobo: 20000000, emi_kobo: 6800000, tenure_months: 3, annual_rate_pct: 24, purpose: 'Medical expenses', status: 'completed', next_payment_date: null },
  ];
  for (const l of loans) {
    await q(`INSERT INTO emi_loans (id, user_id, principal_kobo, emi_kobo, tenure_months, annual_rate_pct, purpose, status, next_payment_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [l.id, l.user_id, l.principal_kobo, l.emi_kobo, l.tenure_months, l.annual_rate_pct, l.purpose, l.status, l.next_payment_date]);
  }
  console.log(`✓ Seeded ${loans.length} EMI loan records`);
}

async function seedInsurancePolicies() {
  // Table already exists with columns: policy_id, customer_id, merchant_id, product_id, product_name, provider, premium_kobo, coverage_type, status, expires_at
  const policies = [
    { policy_id: 'pol_demo_001', customer_id: 'demo_user', merchant_id: 'merch_001', product_id: 'device_insurance', product_name: 'Device Insurance', provider: 'PayGate Insure', premium_kobo: 50000, coverage_type: 'device', status: 'active', expires_at: new Date(Date.now() + 25*24*3600*1000) },
    { policy_id: 'pol_demo_002', customer_id: 'demo_user', merchant_id: 'merch_001', product_id: 'health_insurance', product_name: 'Health Insurance', provider: 'PayGate Insure', premium_kobo: 200000, coverage_type: 'health', status: 'active', expires_at: new Date(Date.now() + 18*24*3600*1000) },
    { policy_id: 'pol_demo_003', customer_id: 'demo_user', merchant_id: 'merch_001', product_id: 'life_insurance', product_name: 'Life Insurance', provider: 'PayGate Insure', premium_kobo: 150000, coverage_type: 'life', status: 'expired', expires_at: new Date(Date.now() - 5*24*3600*1000) },
  ];
  for (const p of policies) {
    await q(`INSERT INTO insurance_policies (policy_id, customer_id, merchant_id, product_id, product_name, provider, premium_kobo, coverage_type, status, expires_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
      ON CONFLICT (policy_id) DO NOTHING`,
      [p.policy_id, p.customer_id, p.merchant_id, p.product_id, p.product_name, p.provider, p.premium_kobo, p.coverage_type, p.status, p.expires_at]);
  }
  console.log(`✓ Seeded ${policies.length} insurance policy records`);
}

async function seedWebhookEvents() {
  if (!(await tableExists('webhook_events_log'))) {
    console.log('Creating webhook_events_log table...');
    await q(`CREATE TABLE IF NOT EXISTS webhook_events_log (
      id VARCHAR(50) PRIMARY KEY,
      event_type VARCHAR(100) NOT NULL,
      endpoint_url TEXT NOT NULL,
      payload JSONB,
      status VARCHAR(50) NOT NULL DEFAULT 'pending',
      attempt_count INT NOT NULL DEFAULT 0,
      response_code INT,
      response_body TEXT,
      next_retry_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      delivered_at TIMESTAMPTZ
    )`);
  }
  const eventTypes = ['payment.completed', 'payment.failed', 'refund.processed', 'dispute.opened', 'dispute.resolved', 'payout.initiated', 'payout.completed', 'kyc.approved', 'kyc.rejected', 'subscription.created'];
  const statuses = ['delivered', 'delivered', 'delivered', 'failed', 'pending', 'retrying'];
  const endpoints = ['https://webhook.merchant1.com/paygate', 'https://api.merchant2.ng/webhooks', 'https://hooks.merchant3.io/payments'];
  const events = Array.from({ length: 30 }, (_, i) => ({
    id: `evt_${randomUUID().replace(/-/g,'').slice(0,16)}`,
    event_type: eventTypes[i % eventTypes.length],
    endpoint_url: endpoints[i % endpoints.length],
    payload: { event: eventTypes[i % eventTypes.length], data: { amount: (i + 1) * 100000 } },
    status: statuses[i % statuses.length],
    attempt_count: statuses[i % statuses.length] === 'delivered' ? 1 : Math.floor(Math.random() * 3) + 1,
    response_code: statuses[i % statuses.length] === 'delivered' ? 200 : (statuses[i % statuses.length] === 'failed' ? 500 : null),
  }));
  for (const e of events) {
    await q(`INSERT INTO webhook_events_log (id, event_type, endpoint_url, payload, status, attempt_count, response_code)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [e.id, e.event_type, e.endpoint_url, JSON.stringify(e.payload), e.status, e.attempt_count, e.response_code]);
  }
  console.log(`✓ Seeded ${events.length} webhook event records`);
}

async function main() {
  console.log('🌱 Starting Wave 34 seed...\n');
  try {
    await seedGnnThresholds();
    await seedFraudRings();
    await seedEmiLoans();
    await seedInsurancePolicies();
    await seedWebhookEvents();
    console.log('\n✅ Wave 34 seed complete!');
  } catch (err) {
    console.error('❌ Seed failed:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
