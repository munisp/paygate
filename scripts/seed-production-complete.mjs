#!/usr/bin/env node
/**
 * PayGate Complete Production Seed Script
 * Seeds all tables with realistic Nigerian fintech data
 * Usage: node scripts/seed-production-complete.mjs
 */
import pg from 'pg';
const { Pool } = pg;

// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
const DB_URL = process.env.PG_DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const pool = new Pool({ connectionString: DB_URL, max: 5 });

const id = (prefix) => `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

const BANKS = ['GTBank', 'Access Bank', 'Zenith Bank', 'First Bank', 'UBA', 'Stanbic IBTC', 'Fidelity Bank', 'Polaris Bank'];
const CHANNELS = ['card', 'bank_transfer', 'ussd', 'mobile_money', 'qr_code', 'bnpl'];
const STATUSES = ['completed', 'completed', 'completed', 'failed', 'pending', 'reversed'];
const CURRENCIES = ['NGN', 'NGN', 'NGN', 'USD', 'GBP'];
const MERCHANT_CATEGORIES = ['retail', 'food_beverage', 'healthcare', 'education', 'logistics', 'fintech'];
const RISK_LEVELS = ['low', 'low', 'low', 'medium', 'high'];

async function run() {
  const client = await pool.connect();
  try {
    console.log('🌱 Starting PayGate complete seed...');

    // ── Users ──────────────────────────────────────────────────────────────────
    const userIds = [];
    const users = [
      { openId: 'seed_admin_001', name: 'Chidi Okonkwo', email: 'chidi@paygate.ng', role: 'admin' },
      { openId: 'seed_merchant_001', name: 'Amaka Eze', email: 'amaka@techmart.ng', role: 'user' },
      { openId: 'seed_merchant_002', name: 'Emeka Nwosu', email: 'emeka@quickfood.ng', role: 'user' },
      { openId: 'seed_merchant_003', name: 'Ngozi Adeyemi', email: 'ngozi@healthplus.ng', role: 'user' },
      { openId: 'seed_merchant_004', name: 'Tunde Bakare', email: 'tunde@edutech.ng', role: 'user' },
      { openId: 'seed_merchant_005', name: 'Fatima Bello', email: 'fatima@logistics.ng', role: 'user' },
    ];
    for (const u of users) {
      const r = await client.query(
        `INSERT INTO users (open_id, name, email, role, last_signed_in, created_at, updated_at)
         VALUES ($1,$2,$3,$4,NOW(),NOW(),NOW())
         ON CONFLICT (open_id) DO UPDATE SET name=$2, email=$3, role=$4, updated_at=NOW()
         RETURNING id`,
        [u.openId, u.name, u.email, u.role]
      );
      userIds.push({ id: r.rows[0].id, ...u });
    }
    console.log(`  ✓ ${users.length} users seeded`);

    // ── Merchants ──────────────────────────────────────────────────────────────
    const merchantData = [
      { name: 'TechMart Nigeria', category: 'retail', city: 'Lagos', state: 'Lagos', userId: userIds[1].id },
      { name: 'QuickFood Delivery', category: 'food_beverage', city: 'Abuja', state: 'FCT', userId: userIds[2].id },
      { name: 'HealthPlus Pharmacy', category: 'healthcare', city: 'Port Harcourt', state: 'Rivers', userId: userIds[3].id },
      { name: 'EduTech Academy', category: 'education', city: 'Ibadan', state: 'Oyo', userId: userIds[4].id },
      { name: 'SwiftLog Logistics', category: 'logistics', city: 'Kano', state: 'Kano', userId: userIds[5].id },
    ];
    const merchantIds = [];
    for (const m of merchantData) {
      const mid = `mer_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      await client.query(
        `INSERT INTO merchants (id, owner_id, business_name, business_category, city, state, country, status, kyc_status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,$6,'NG','active','approved',NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [mid, m.userId, m.name, m.category, m.city, m.state]
      );
      merchantIds.push(mid);
    }
    console.log(`  ✓ ${merchantData.length} merchants seeded`);

    // ── Transactions ───────────────────────────────────────────────────────────
    let txCount = 0;
    for (const mid of merchantIds) {
      for (let i = 0; i < 40; i++) {
        const amount = rand(500, 500000);
        const fee = Math.round(amount * 0.015);
        const status = pick(STATUSES);
        const daysAgo = rand(0, 90);
        const txId = `txn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO transactions (id, merchant_id, amount, fee_amount, currency, channel, status, reference, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW()-INTERVAL '${daysAgo} days',NOW()-INTERVAL '${daysAgo} days')
           ON CONFLICT (id) DO NOTHING`,
          [txId, mid, amount, fee, pick(CURRENCIES), pick(CHANNELS), status, `REF${Date.now()}${i}`]
        );
        txCount++;
      }
    }
    console.log(`  ✓ ${txCount} transactions seeded`);

    // ── Customers ──────────────────────────────────────────────────────────────
    const customerNames = [
      ['Adaeze Obi', 'adaeze@gmail.com', '+2348012345678'],
      ['Babatunde Adewale', 'baba@yahoo.com', '+2348023456789'],
      ['Chioma Nwosu', 'chioma@outlook.com', '+2348034567890'],
      ['Damilola Afolabi', 'dami@gmail.com', '+2348045678901'],
      ['Efosa Osagie', 'efosa@hotmail.com', '+2348056789012'],
      ['Funke Akindele', 'funke@gmail.com', '+2348067890123'],
      ['Gbenga Olatunji', 'gbenga@yahoo.com', '+2348078901234'],
      ['Halima Musa', 'halima@gmail.com', '+2348089012345'],
    ];
    let custCount = 0;
    for (const mid of merchantIds) {
      for (const [name, email, phone] of customerNames) {
        const cid = `cus_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO customers (id, merchant_id, name, email, phone, risk_level, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [cid, mid, name, email, phone, pick(RISK_LEVELS)]
        );
        custCount++;
      }
    }
    console.log(`  ✓ ${custCount} customers seeded`);

    // ── Payouts ────────────────────────────────────────────────────────────────
    let payoutCount = 0;
    for (const mid of merchantIds) {
      for (let i = 0; i < 8; i++) {
        const pid = `pay_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const amount = rand(50000, 2000000);
        const daysAgo = rand(0, 60);
        const status = pick(['pending', 'approved', 'completed', 'completed', 'completed']);
        await client.query(
          `INSERT INTO payouts (id, merchant_id, amount, currency, status, bank_name, account_number, account_name, created_at, updated_at)
           VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7,NOW()-INTERVAL '${daysAgo} days',NOW()-INTERVAL '${daysAgo} days')
           ON CONFLICT (id) DO NOTHING`,
          [pid, mid, amount, status, pick(BANKS), `00${rand(10000000, 99999999)}`, 'Business Account']
        );
        payoutCount++;
      }
    }
    console.log(`  ✓ ${payoutCount} payouts seeded`);

    // ── Fraud Alerts ───────────────────────────────────────────────────────────
    let fraudCount = 0;
    for (const mid of merchantIds.slice(0, 3)) {
      for (let i = 0; i < 5; i++) {
        const fid = `fra_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const severity = pick(['low', 'medium', 'high', 'critical']);
        await client.query(
          `INSERT INTO fraud_alerts (id, merchant_id, alert_type, severity, description, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'open',NOW()-INTERVAL '${rand(0,30)} days',NOW())
           ON CONFLICT (id) DO NOTHING`,
          [fid, mid, pick(['velocity_breach', 'device_fingerprint', 'geo_anomaly', 'card_testing', 'account_takeover']),
           severity, `Suspicious ${severity} risk activity detected on account`]
        );
        fraudCount++;
      }
    }
    console.log(`  ✓ ${fraudCount} fraud alerts seeded`);

    // ── Disputes ───────────────────────────────────────────────────────────────
    let disputeCount = 0;
    for (const mid of merchantIds.slice(0, 3)) {
      for (let i = 0; i < 4; i++) {
        const did = `dis_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const status = pick(['open', 'under_review', 'resolved', 'resolved']);
        await client.query(
          `INSERT INTO disputes (id, merchant_id, amount, currency, reason, status, created_at, updated_at)
           VALUES ($1,$2,$3,'NGN',$4,$5,NOW()-INTERVAL '${rand(0,45)} days',NOW())
           ON CONFLICT (id) DO NOTHING`,
          [did, mid, rand(5000, 500000), pick(['unauthorized_transaction', 'product_not_received', 'duplicate_charge', 'subscription_cancelled']), status]
        );
        disputeCount++;
      }
    }
    console.log(`  ✓ ${disputeCount} disputes seeded`);

    // ── Virtual Cards ──────────────────────────────────────────────────────────
    let vcCount = 0;
    for (const mid of merchantIds.slice(0, 3)) {
      for (let i = 0; i < 3; i++) {
        const vcid = `vc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO virtual_cards (id, merchant_id, card_number_masked, card_type, status, spending_limit, balance, currency, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,$7,'NGN',NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [vcid, mid, `**** **** **** ${rand(1000, 9999)}`, pick(['visa', 'mastercard']),
           pick(['active', 'active', 'frozen']), rand(100000, 1000000), rand(10000, 500000)]
        );
        vcCount++;
      }
    }
    console.log(`  ✓ ${vcCount} virtual cards seeded`);

    // ── Payment Links ──────────────────────────────────────────────────────────
    let plCount = 0;
    for (const mid of merchantIds) {
      for (let i = 0; i < 3; i++) {
        const plid = `pl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO payment_links (id, merchant_id, title, amount, currency, status, slug, created_at, updated_at)
           VALUES ($1,$2,$3,$4,'NGN',$5,$6,NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [plid, mid, pick(['Product Payment', 'Service Fee', 'Subscription', 'Invoice']),
           rand(5000, 500000), pick(['active', 'active', 'inactive']), `link_${Math.random().toString(36).slice(2, 10)}`]
        );
        plCount++;
      }
    }
    console.log(`  ✓ ${plCount} payment links seeded`);

    // ── Webhooks ───────────────────────────────────────────────────────────────
    let whCount = 0;
    for (const mid of merchantIds) {
      const whid = `wh_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await client.query(
        `INSERT INTO webhooks (id, merchant_id, url, events, secret, status, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [whid, mid, `https://api.merchant${whCount + 1}.ng/webhooks/paygate`,
         JSON.stringify(['transaction.completed', 'payout.processed', 'dispute.created']),
         `whsec_${Math.random().toString(36).slice(2, 34)}`]
      );
      whCount++;
    }
    console.log(`  ✓ ${whCount} webhooks seeded`);

    // ── API Keys ───────────────────────────────────────────────────────────────
    let akCount = 0;
    for (const mid of merchantIds) {
      for (const env of ['live', 'test']) {
        const akid = `ak_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO api_keys (id, merchant_id, name, key_hash, key_prefix, environment, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,$6,'active',NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [akid, mid, `${env === 'live' ? 'Production' : 'Test'} API Key`,
           `hash_${Math.random().toString(36).slice(2, 34)}`,
           `pg_${env}_${Math.random().toString(36).slice(2, 10)}`, env]
        );
        akCount++;
      }
    }
    console.log(`  ✓ ${akCount} API keys seeded`);

    // ── Team Members ───────────────────────────────────────────────────────────
    let tmCount = 0;
    const teamRoles = ['admin', 'developer', 'finance', 'support', 'viewer'];
    for (const mid of merchantIds) {
      for (let i = 0; i < 3; i++) {
        const tmid = `tm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        await client.query(
          `INSERT INTO team_members (id, merchant_id, email, name, role, status, created_at, updated_at)
           VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW())
           ON CONFLICT (id) DO NOTHING`,
          [tmid, mid, `team${tmCount}@merchant.ng`, `Team Member ${tmCount + 1}`, pick(teamRoles)]
        );
        tmCount++;
      }
    }
    console.log(`  ✓ ${tmCount} team members seeded`);

    // ── KYC Submissions ────────────────────────────────────────────────────────
    let kycCount = 0;
    for (const mid of merchantIds) {
      const kycid = `kyc_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
      await client.query(
        `INSERT INTO kyc_submissions (id, merchant_id, document_type, document_number, status, submitted_at, created_at, updated_at)
         VALUES ($1,$2,$3,$4,$5,NOW(),NOW(),NOW())
         ON CONFLICT (id) DO NOTHING`,
        [kycid, mid, pick(['bvn', 'nin', 'passport', 'drivers_license']),
         `DOC${rand(10000000, 99999999)}`, pick(['approved', 'approved', 'pending', 'under_review'])]
      );
      kycCount++;
    }
    console.log(`  ✓ ${kycCount} KYC submissions seeded`);

    // ── Support Messages ───────────────────────────────────────────────────────
    let smCount = 0;
    for (const u of userIds.slice(1, 4)) {
      for (let i = 0; i < 3; i++) {
        const smid = `sm_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
        const sessionId = `sess_${Math.random().toString(36).slice(2, 12)}`;
        await client.query(
          `INSERT INTO support_messages (id, user_id, session_id, role, content, status, created_at)
           VALUES ($1,$2,$3,'user',$4,'open',NOW()-INTERVAL '${rand(0,7)} days')
           ON CONFLICT (id) DO NOTHING`,
          [smid, u.id, sessionId, pick([
            'How do I set up webhooks for my integration?',
            'My payout is stuck in pending status for 3 days',
            'Can I get a refund for a failed transaction?',
            'How do I generate API keys for production?',
            'What are the settlement times for bank transfers?'
          ])]
        );
        smCount++;
      }
    }
    console.log(`  ✓ ${smCount} support messages seeded`);

    console.log('\n✅ PayGate complete seed finished successfully!');
    console.log(`   Total records: ${users.length + merchantData.length + txCount + custCount + payoutCount + fraudCount + disputeCount + vcCount + plCount + whCount + akCount + tmCount + kycCount + smCount}`);
  } catch (err) {
    console.error('❌ Seed error:', err.message);
    throw err;
  } finally {
    client.release();
    await pool.end();
  }
}

run().catch(console.error);
