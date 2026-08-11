/**
 * PayGate Bootstrap Seed
 * Creates the foundational data: tenants, users, merchants, customers, transactions
 * Run this BEFORE seed-full.mjs and seed-wave85-complete.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

const PG_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL?.startsWith('postgresql') ? process.env.DATABASE_URL : 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';

const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }

async function run() {
  const client = new Client({ connectionString: 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev' });
  await client.connect();
  console.log('✅ Connected to PostgreSQL');

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  console.log('\n📦 Seeding tenants...');
  await client.query(`
    INSERT INTO tenants (id, name, slug, status, plan, email, phone, country, bnpl_enabled, cross_border_enabled, virtual_cards_enabled, created_at, updated_at)
    VALUES ($1, $2, $3, 'active', 'enterprise', $4, $5, 'NG', true, true, true, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name=EXCLUDED.name, status='active', updated_at=NOW()
  `, [TENANT_ID, 'PayGate Demo Platform', 'paygate-demo', 'admin@paygate.ng', '+2348000000001']);
  // Also update slug conflict
  await client.query(`UPDATE tenants SET id=$1 WHERE slug='paygate-demo' AND id!=$1`, [TENANT_ID]).catch(() => {});
  console.log('  ✓ tenant_demo_001');

  // ── 2. Users ───────────────────────────────────────────────────────────────
  console.log('\n👤 Seeding users...');
  const users = [
    { open_id: 'owner_001', name: 'Adebayo Okafor', email: 'adebayo@paygate.ng', role: 'admin' },
    { open_id: 'user_002', name: 'Chidinma Eze', email: 'chidinma@paygate.ng', role: 'user' },
    { open_id: 'user_003', name: 'Emeka Nwosu', email: 'emeka@paygate.ng', role: 'user' },
    { open_id: 'user_004', name: 'Fatima Aliyu', email: 'fatima@paygate.ng', role: 'user' },
    { open_id: 'user_005', name: 'Gbenga Adeleke', email: 'gbenga@paygate.ng', role: 'user' },
  ];
  for (const u of users) {
    await client.query(`
      INSERT INTO users (open_id, name, email, role, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, NOW(), NOW())
      ON CONFLICT (open_id) DO UPDATE SET name=EXCLUDED.name, updated_at=NOW()
    `, [u.open_id, u.name, u.email, u.role, TENANT_ID]);
    console.log(`  ✓ ${u.name}`);
  }

  // Get user IDs
  const userRows = await client.query(`SELECT id, open_id FROM users WHERE tenant_id=$1 ORDER BY id`, [TENANT_ID]);
  const userIdMap = {};
  for (const r of userRows.rows) userIdMap[r.open_id] = r.id;
  const ownerUserId = userIdMap['owner_001'] || 1;
  console.log(`  Owner user ID: ${ownerUserId}`);

  // ── 3. Merchants ───────────────────────────────────────────────────────────
  console.log('\n🏪 Seeding merchants...');
  const merchants = [
    { id: 'merch_001', name: 'Lagos Digital Pay', type: 'ecommerce', email: 'ops@lagosdigitalpay.ng', phone: '+2348012345678', status: 'active' },
    { id: 'merch_002', name: 'Abuja Tech Finance', type: 'fintech', email: 'ops@abujatech.ng', phone: '+2348023456789', status: 'active' },
    { id: 'merch_003', name: 'Kano Commerce Hub', type: 'retail', email: 'ops@kanocommerce.ng', phone: '+2348034567890', status: 'active' },
    { id: 'merch_004', name: 'Port Harcourt Retail', type: 'retail', email: 'ops@phretail.ng', phone: '+2348045678901', status: 'active' },
    { id: 'merch_005', name: 'Ibadan Digital Pay', type: 'ecommerce', email: 'ops@ibadanpay.ng', phone: '+2348056789012', status: 'pending' },
  ];
  for (const m of merchants) {
    await client.query(`
      INSERT INTO merchants (id, owner_id, business_name, business_type, email, phone, country, currency, status, is_live, onboarding_step, tenant_id, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, 'NG', 'NGN', $7, true, 5, $8, NOW(), NOW())
      ON CONFLICT (id) DO UPDATE SET business_name=EXCLUDED.business_name, status=EXCLUDED.status, updated_at=NOW()
    `, [m.id, ownerUserId, m.name, m.type, m.email, m.phone, m.status, TENANT_ID]);
    console.log(`  ✓ ${m.name}`);
  }

  // ── 4. Customers ───────────────────────────────────────────────────────────
  console.log('\n👥 Seeding customers...');
  const nigerianNames = [
    'Adebayo Okafor','Chidinma Eze','Emeka Nwosu','Fatima Aliyu','Gbenga Adeleke',
    'Halima Musa','Ibrahim Sule','Jumoke Adeyemi','Kelechi Obi','Lola Adesanya',
    'Musa Garba','Ngozi Okonkwo','Ola Fashola','Priscilla Ike','Rotimi Bello',
    'Sade Afolabi','Tunde Bakare','Uche Okafor','Victoria Eze','Wale Adegoke',
  ];
  for (let i = 0; i < 20; i++) {
    const name = nigerianNames[i];
    const [first, last] = name.split(' ');
    try {
      await client.query(`
        INSERT INTO customers (id, merchant_id, email, name, phone, country, tenant_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'NG', $6, NOW() - ($7 || ' days')::interval, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        `cust_${String(i+1).padStart(3,'0')}`,
        MERCHANT_IDS[i % 5],
        `${first.toLowerCase()}.${last.toLowerCase()}@example.ng`,
        name,
        `+23480${String(10000000 + i).slice(1)}`,
        TENANT_ID,
        String(i * 5)
      ]);
    } catch(e) { console.warn(`  ⚠ customer ${i}: ${e.message.slice(0,80)}`); }
  }
  console.log('  ✓ 20 customers');

  // ── 5. Transactions ────────────────────────────────────────────────────────
  console.log('\n💳 Seeding transactions...');
  const txStatuses = ['successful', 'successful', 'successful', 'failed', 'pending'];
  const channels = ['card', 'bank_transfer', 'ussd', 'qr', 'mobile_money'];
  let txCount = 0;
  for (let i = 0; i < 50; i++) {
    const status = txStatuses[i % txStatuses.length];
    const amount = rand(1000, 500000);
    try {
      await client.query(`
        INSERT INTO transactions (id, merchant_id, customer_id, reference, amount, currency, status, channel, description, fee, tenant_id, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, 'NGN', $6, $7, $8, $9, $10, NOW() - ($11 || ' hours')::interval, NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        `txn_${String(i+1).padStart(4,'0')}`,
        MERCHANT_IDS[i % 5],
        `cust_${String((i % 20) + 1).padStart(3,'0')}`,
        `REF${Date.now()}${i}`,
        amount,
        status,
        channels[i % channels.length],
        `Payment for order #${1000 + i}`,
        Math.floor(amount * 0.015),
        TENANT_ID,
        String(i * 12)
      ]);
      txCount++;
    } catch(e) { console.warn(`  ⚠ txn ${i}: ${e.message.slice(0,80)}`); }
  }
  console.log(`  ✓ ${txCount} transactions`);

  await client.end();
  console.log('\n✅ Bootstrap seed complete!');
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
