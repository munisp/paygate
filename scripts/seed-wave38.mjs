/**
 * Wave 38 Seed Script
 * Seeds: sip_plans, sip_executions, emi_loans, emi_repayments, user_insurance_claims, dispute_notes
 */
import pg from 'pg';
import { randomUUID } from 'crypto';
const { Pool } = pg;

// TLS: DB certificate verification is ON by default (secure). Set
// SEED_TLS_INSECURE=true to disable verification for self-signed dev DBs only.
const SEED_TLS_INSECURE = process.env.SEED_TLS_INSECURE === 'true';
if (SEED_TLS_INSECURE) console.warn('⚠️  SEED_TLS_INSECURE=true — DB TLS certificate verification DISABLED (dev only)');
const SEED_SSL = SEED_TLS_INSECURE ? { rejectUnauthorized: false } : true;

const pool = new Pool({
  connectionString: process.env.PG_DATABASE_URL || process.env.DATABASE_URL,
  ssl: process.env.PG_DATABASE_URL ? SEED_SSL : false,
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

// Get a real user ID from the database
async function getFirstUserId() {
  const res = await q(`SELECT id FROM users LIMIT 1`);
  return res.rows[0]?.id || 'user_demo_001';
}

async function seedSipPlans() {
  if (!(await tableExists('sip_plans'))) {
    console.log('sip_plans table not found, creating...');
    await q(`CREATE TABLE IF NOT EXISTS sip_plans (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      asset_type VARCHAR(50) NOT NULL,
      amount_kobo BIGINT NOT NULL,
      frequency VARCHAR(20) NOT NULL DEFAULT 'monthly',
      status VARCHAR(20) NOT NULL DEFAULT 'active',
      total_invested_kobo BIGINT NOT NULL DEFAULT 0,
      execution_count INT NOT NULL DEFAULT 0,
      last_executed_at TIMESTAMPTZ,
      next_execution_at TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  const userId = await getFirstUserId();
  const plans = [
    { id: `sip_${randomUUID().slice(0,8)}`, user_id: userId, asset_type: 'gold', amount_kobo: 500000, frequency: 'monthly', status: 'active', total_invested_kobo: 2500000, execution_count: 5, next_execution_at: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000) },
    { id: `sip_${randomUUID().slice(0,8)}`, user_id: userId, asset_type: 'mutual_fund', amount_kobo: 1000000, frequency: 'monthly', status: 'active', total_invested_kobo: 5000000, execution_count: 5, next_execution_at: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
    { id: `sip_${randomUUID().slice(0,8)}`, user_id: userId, asset_type: 'pension', amount_kobo: 250000, frequency: 'weekly', status: 'active', total_invested_kobo: 5000000, execution_count: 20, next_execution_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { id: `sip_${randomUUID().slice(0,8)}`, user_id: userId, asset_type: 'gold', amount_kobo: 200000, frequency: 'daily', status: 'paused', total_invested_kobo: 6000000, execution_count: 30, next_execution_at: new Date(Date.now() + 1 * 24 * 60 * 60 * 1000) },
  ];

  for (const p of plans) {
    await q(`INSERT INTO sip_plans (id, user_id, asset_type, amount_kobo, frequency, status, total_invested_kobo, execution_count, next_execution_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [p.id, p.user_id, p.asset_type, p.amount_kobo, p.frequency, p.status, p.total_invested_kobo, p.execution_count, p.next_execution_at]);
  }
  console.log(`✓ Seeded ${plans.length} SIP plans`);
  return plans[0].id;
}

async function seedSipExecutions(planId) {
  if (!(await tableExists('sip_executions'))) {
    console.log('sip_executions table not found, creating...');
    await q(`CREATE TABLE IF NOT EXISTS sip_executions (
      id VARCHAR(50) PRIMARY KEY,
      plan_id VARCHAR(50) NOT NULL,
      amount_kobo BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      error_message TEXT,
      executed_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  const executions = Array.from({ length: 5 }, (_, i) => ({
    id: `sipexec_${randomUUID().slice(0,8)}`,
    plan_id: planId,
    amount_kobo: 500000,
    status: i === 2 ? 'failed' : 'completed',
    error_message: i === 2 ? 'Insufficient wallet balance' : null,
    executed_at: new Date(Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000),
  }));

  for (const e of executions) {
    await q(`INSERT INTO sip_executions (id, plan_id, amount_kobo, status, error_message, executed_at)
      VALUES ($1,$2,$3,$4,$5,$6)
      ON CONFLICT (id) DO NOTHING`,
      [e.id, e.plan_id, e.amount_kobo, e.status, e.error_message, e.executed_at]);
  }
  console.log(`✓ Seeded ${executions.length} SIP executions`);
}

async function seedEmiLoans() {
  // emi_loans table already exists with columns: id, user_id, principal_kobo, emi_kobo, tenure_months, annual_rate_pct, purpose, status, next_payment_date
  const userId = await getFirstUserId();
  const loans = [
    { id: `loan_${randomUUID().slice(0,8)}`, user_id: userId, purpose: 'Home Renovation', principal_kobo: 50000000, annual_rate_pct: 18.00, tenure_months: 12, emi_kobo: 4583333, status: 'active', next_payment_date: new Date(Date.now() + 15 * 24 * 60 * 60 * 1000) },
    { id: `loan_${randomUUID().slice(0,8)}`, user_id: userId, purpose: 'Education', principal_kobo: 20000000, annual_rate_pct: 15.00, tenure_months: 24, emi_kobo: 970000, status: 'active', next_payment_date: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000) },
    { id: `loan_${randomUUID().slice(0,8)}`, user_id: userId, purpose: 'Business Equipment', principal_kobo: 100000000, annual_rate_pct: 20.00, tenure_months: 36, emi_kobo: 3716667, status: 'closed', next_payment_date: null },
  ];

  for (const l of loans) {
    await q(`INSERT INTO emi_loans (id, user_id, purpose, principal_kobo, annual_rate_pct, tenure_months, emi_kobo, status, next_payment_date)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING`,
      [l.id, l.user_id, l.purpose, l.principal_kobo, l.annual_rate_pct, l.tenure_months, l.emi_kobo, l.status, l.next_payment_date]);
  }
  console.log(`✓ Seeded ${loans.length} EMI loans`);
  return loans[0].id;
}

async function seedEmiRepayments(loanId) {
  if (!(await tableExists('emi_repayments'))) {
    console.log('emi_repayments table not found, creating...');
    await q(`CREATE TABLE IF NOT EXISTS emi_repayments (
      id VARCHAR(50) PRIMARY KEY,
      loan_id VARCHAR(50) NOT NULL,
      amount_kobo BIGINT NOT NULL,
      status VARCHAR(20) NOT NULL DEFAULT 'completed',
      paid_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  const repayments = Array.from({ length: 3 }, (_, i) => ({
    id: `repay_${randomUUID().slice(0,8)}`,
    loan_id: loanId,
    amount_kobo: 4583333,
    status: 'completed',
    paid_at: new Date(Date.now() - (i + 1) * 30 * 24 * 60 * 60 * 1000),
  }));

  for (const r of repayments) {
    await q(`INSERT INTO emi_repayments (id, loan_id, amount_kobo, status, paid_at)
      VALUES ($1,$2,$3,$4,$5)
      ON CONFLICT (id) DO NOTHING`,
      [r.id, r.loan_id, r.amount_kobo, r.status, r.paid_at]);
  }
  console.log(`✓ Seeded ${repayments.length} EMI repayments`);
}

async function seedInsuranceClaims() {
  if (!(await tableExists('user_insurance_claims'))) {
    console.log('user_insurance_claims table not found, creating...');
    await q(`CREATE TABLE IF NOT EXISTS user_insurance_claims (
      id VARCHAR(50) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      policy_id VARCHAR(50) NOT NULL,
      claim_type VARCHAR(100) NOT NULL,
      description TEXT,
      amount_kobo BIGINT NOT NULL DEFAULT 0,
      status VARCHAR(20) NOT NULL DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  const userId = await getFirstUserId();
  const claims = [
    { id: `claim_${randomUUID().slice(0,8)}`, user_id: userId, policy_id: 'pol_demo_001', claim_type: 'Medical Reimbursement', description: 'Hospital admission for malaria treatment', amount_kobo: 15000000, status: 'approved' },
    { id: `claim_${randomUUID().slice(0,8)}`, user_id: userId, policy_id: 'pol_demo_002', claim_type: 'Device Theft', description: 'Smartphone stolen at bus stop', amount_kobo: 25000000, status: 'under_review' },
    { id: `claim_${randomUUID().slice(0,8)}`, user_id: userId, policy_id: 'pol_demo_001', claim_type: 'Outpatient Consultation', description: 'Specialist consultation fee', amount_kobo: 5000000, status: 'pending' },
  ];

  for (const c of claims) {
    await q(`INSERT INTO user_insurance_claims (id, user_id, policy_id, claim_type, description, amount_kobo, status)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [c.id, c.user_id, c.policy_id, c.claim_type, c.description, c.amount_kobo, c.status]);
  }
  console.log(`✓ Seeded ${claims.length} insurance claims`);
}

async function seedDisputeNotes() {
  if (!(await tableExists('dispute_notes'))) {
    console.log('dispute_notes table not found, creating...');
    await q(`CREATE TABLE IF NOT EXISTS dispute_notes (
      id VARCHAR(50) PRIMARY KEY,
      dispute_id VARCHAR(50) NOT NULL,
      author_id VARCHAR(50) NOT NULL,
      author_role VARCHAR(20) NOT NULL DEFAULT 'merchant',
      note TEXT NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    )`);
  }

  // Get a real dispute ID if available
  const disputeRes = await q(`SELECT id FROM disputes LIMIT 1`).catch(() => ({ rows: [] }));
  const disputeId = disputeRes.rows[0]?.id || 'disp_demo_001';
  const userId = await getFirstUserId();

  const notes = [
    { id: `dnote_${randomUUID().slice(0,8)}`, dispute_id: disputeId, merchant_id: userId, author_id: userId, author_name: 'Merchant', note: 'Customer claims they never received the goods. We have delivery confirmation from our logistics partner.', visibility: 'all' },
    { id: `dnote_${randomUUID().slice(0,8)}`, dispute_id: disputeId, merchant_id: userId, author_id: 'admin_001', author_name: 'Admin', note: 'Requested delivery proof from merchant. Awaiting documentation.', visibility: 'internal' },
    { id: `dnote_${randomUUID().slice(0,8)}`, dispute_id: disputeId, merchant_id: userId, author_id: userId, author_name: 'Merchant', note: 'Uploaded delivery receipt and GPS tracking screenshot as evidence.', visibility: 'all' },
  ];

  for (const n of notes) {
    await q(`INSERT INTO dispute_notes (id, dispute_id, merchant_id, author_id, author_name, note, visibility)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING`,
      [n.id, n.dispute_id, n.merchant_id, n.author_id, n.author_name, n.note, n.visibility]);
  }
  console.log(`✓ Seeded ${notes.length} dispute notes`);
}

async function main() {
  console.log('🌱 Wave 38 Seed Script Starting...\n');
  try {
    const sipPlanId = await seedSipPlans();
    await seedSipExecutions(sipPlanId);
    const loanId = await seedEmiLoans();
    await seedEmiRepayments(loanId);
    await seedInsuranceClaims();
    await seedDisputeNotes();
    console.log('\n✅ Wave 38 seed complete!');
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    process.exit(1);
  } finally {
    await pool.end();
  }
}

main();
