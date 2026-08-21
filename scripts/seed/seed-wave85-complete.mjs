/**
 * PayGate Wave 85 — Complete Seed Script
 * Seeds ALL previously unseeded tables with realistic Nigerian fintech data.
 * Depends on: tenants, users, merchants already existing (run seed-full.mjs first).
 *
 * Run: node seed-wave85-complete.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
const PG_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];
const M = MERCHANT_IDS[0];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d; }

const NIGERIAN_NAMES = [
  'Adebayo Okafor','Chidinma Eze','Emeka Nwosu','Fatima Aliyu','Gbenga Adeleke',
  'Halima Musa','Ibrahim Sule','Jumoke Adeyemi','Kelechi Obi','Lola Adesanya',
  'Musa Garba','Ngozi Okonkwo','Ola Fashola','Priscilla Ike','Rotimi Bello',
  'Sade Afolabi','Tunde Bakare','Uche Okafor','Victoria Eze','Wale Adegoke',
];
const NIGERIAN_BANKS = [
  {code:'044',name:'Access Bank'},{code:'011',name:'First Bank'},
  {code:'058',name:'GTBank'},{code:'033',name:'UBA'},{code:'057',name:'Zenith Bank'},
  {code:'070',name:'Fidelity Bank'},{code:'232',name:'Sterling Bank'},
];
const CURRENCIES = ['NGN','USD','GBP','EUR','GHS','KES','ZAR'];
const COUNTRIES = ['NG','US','GB','GH','KE','ZA','DE'];

async function run() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  console.log('Connected to database');

  // ── Helpers ────────────────────────────────────────────────────────────────
  async function upsert(table, rows, conflictCol = 'id') {
    if (!rows.length) return;
    const cols = Object.keys(rows[0]);
    const vals = rows.map((r, ri) => `(${cols.map((_, ci) => `$${ri * cols.length + ci + 1}`).join(',')})`).join(',');
    const flat = rows.flatMap(r => cols.map(c => r[c]));
    try {
      await client.query(
        `INSERT INTO ${table} (${cols.join(',')}) VALUES ${vals} ON CONFLICT (${conflictCol}) DO NOTHING`,
        flat
      );
      console.log(`  ✓ ${table}: ${rows.length} rows`);
    } catch (e) {
      console.warn(`  ✗ ${table}: ${e.message.slice(0, 80)}`);
    }
  }

  // ── 1. Customers ──────────────────────────────────────────────────────────
  const customerIds = Array.from({ length: 20 }, (_, i) => `cust_${String(i+1).padStart(3,'0')}`);
  await upsert('customers', customerIds.map((id, i) => ({
    id,
    tenant_id: TENANT_ID,
    merchant_id: pick(MERCHANT_IDS),
    email: `customer${i+1}@demo.ng`,
    name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    phone: `+2348${String(rand(10000000, 99999999))}`,
    risk_level: pick(['low','low','low','medium','high']),
    total_transactions: rand(1, 200),
    total_volume: rand(10000, 5000000),
    created_at: daysAgo(rand(30, 365)),
  })));

  // ── 2. Transactions ───────────────────────────────────────────────────────
  const txRows = Array.from({ length: 50 }, (_, i) => ({
    id: `tx_${String(i+1).padStart(4,'0')}`,
    tenant_id: TENANT_ID,
    merchant_id: pick(MERCHANT_IDS),
    reference: `REF${Date.now()}${i}`,
    amount: rand(1000, 500000),
    currency: 'NGN',
    status: pick(['completed','completed','completed','failed','pending']),
    channel: pick(['card','bank_transfer','mobile_money','ussd','qr']),
    customer_email: `customer${rand(1,20)}@demo.ng`,
    customer_name: NIGERIAN_NAMES[i % NIGERIAN_NAMES.length],
    fee: rand(10, 500),
    created_at: daysAgo(rand(0, 90)),
    updated_at: daysAgo(rand(0, 30)),
  }));
  await upsert('transactions', txRows);

  // ── 3. Merchants (ensure demo merchants exist) ────────────────────────────
  // (already seeded by seed-full.mjs — skip)

  // ── 4. Tenants & TenantConfig ─────────────────────────────────────────────
  await upsert('tenants', [{
    id: TENANT_ID,
    name: 'PayGate Demo Ltd',
    slug: 'paygate-demo',
    status: 'active',
    plan: 'enterprise',
    email: 'admin@paygate-demo.ng',
    phone: '+2348012345678',
    country: 'NG',
    created_at: daysAgo(365),
    updated_at: daysAgo(1),
  }]);
  await upsert('tenant_config', [{
    id: `tc_${TENANT_ID}`,
    tenant_id: TENANT_ID,
    settlement_freq: 'daily',
    settlement_bank_code: '058',
    settlement_account_number: '0123456789',
    settlement_account_name: 'PayGate Demo Ltd',
    webhook_url: 'https://demo.paygate.ng/webhooks',
    webhook_secret: 'whsec_demo_secret_key_2026',
    created_at: daysAgo(365),
    updated_at: daysAgo(1),
  }], 'tenant_id');

  // ── 5. Webhook Endpoints & Deliveries ────────────────────────────────────
  const webhookEndpointIds = ['whe_001','whe_002'];
  await upsert('webhook_endpoints', [
    { id: 'whe_001', merchant_id: M, url: 'https://demo.paygate.ng/webhooks/primary', secret: 'whsec_001', events: JSON.stringify(['payment.completed','payout.completed','dispute.created']), is_active: true, created_at: daysAgo(90) },
    { id: 'whe_002', merchant_id: M, url: 'https://demo.paygate.ng/webhooks/secondary', secret: 'whsec_002', events: JSON.stringify(['fraud.alert','kyc.approved']), is_active: false, created_at: daysAgo(60) },
  ]);
  await upsert('webhook_deliveries', Array.from({ length: 10 }, (_, i) => ({
    id: `whd_${String(i+1).padStart(3,'0')}`,
    webhook_id: 'whe_001',
    event_type: pick(['payment.completed','payout.completed','fraud.alert']),
    payload: JSON.stringify({ event: 'payment.completed', amount: rand(1000, 100000) }),
    status: pick(['delivered','delivered','failed','pending']),
    response_code: pick([200, 200, 200, 500, null]),
    attempts: rand(1, 3),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 6. Settlements ────────────────────────────────────────────────────────
  await upsert('settlements', Array.from({ length: 10 }, (_, i) => ({
    id: `stl_${String(i+1).padStart(3,'0')}`,
    tenant_id: TENANT_ID,
    merchant_id: M,
    amount: rand(50000, 2000000),
    fee: rand(500, 5000),
    net_amount: rand(45000, 1995000),
    currency: 'NGN',
    status: pick(['completed','completed','pending','processing']),
    bank_code: pick(NIGERIAN_BANKS).code,
    account_number: `${rand(1000000000, 9999999999)}`,
    account_name: pick(NIGERIAN_NAMES),
    period_start: daysAgo(rand(7, 30)),
    period_end: daysAgo(rand(1, 7)),
    created_at: daysAgo(rand(1, 30)),
  })));

  // ── 7. Loyalty Programs & Accounts ───────────────────────────────────────
  await upsert('loyalty_programs', [
    { id: 'lp_001', merchant_id: M, name: 'PayGate Rewards', earn_rate: 1, redeem_rate: 100, min_redeem_points: 500, is_active: true, created_at: daysAgo(180) },
    { id: 'lp_002', merchant_id: MERCHANT_IDS[1], name: 'Premium Points', earn_rate: 2, redeem_rate: 50, min_redeem_points: 200, is_active: true, created_at: daysAgo(90) },
  ]);
  await upsert('loyalty_accounts', customerIds.slice(0, 10).map((cid, i) => ({
    id: `la_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    customer_id: cid,
    program_id: 'lp_001',
    points_balance: rand(100, 10000),
    lifetime_points: rand(500, 50000),
    tier: pick(['bronze','silver','gold','platinum']),
    created_at: daysAgo(rand(30, 180)),
  })));
  await upsert('loyalty_transactions', Array.from({ length: 20 }, (_, i) => ({
    id: `lt_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    customer_id: pick(customerIds.slice(0, 10)),
    program_id: 'lp_001',
    type: pick(['earn','earn','earn','redeem']),
    points: rand(10, 500),
    reference: `LREF${Date.now()}${i}`,
    description: pick(['Purchase reward','Bonus points','Referral reward','Redeemed for discount']),
    created_at: daysAgo(rand(0, 90)),
  })));

  // ── 8. Insurance Policies ─────────────────────────────────────────────────
  await upsert('insurance_policies', Array.from({ length: 8 }, (_, i) => ({
    id: `ins_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    customer_name: NIGERIAN_NAMES[i],
    customer_email: `customer${i+1}@demo.ng`,
    product_code: pick(['LIFE_BASIC','HEALTH_PLUS','MOTOR_COMP','TRAVEL_INT']),
    premium_kobo: rand(500000, 5000000),
    sum_assured_kobo: rand(10000000, 100000000),
    status: pick(['active','active','active','expired','cancelled']),
    start_date: daysAgo(rand(30, 365)),
    end_date: new Date(Date.now() + rand(30, 365) * 86400000),
    policy_number: `POL${Date.now()}${i}`,
    created_at: daysAgo(rand(30, 365)),
  })));

  // ── 9. Coupons ────────────────────────────────────────────────────────────
  await upsert('coupons', [
    { id: 'cpn_001', merchant_id: M, code: 'WELCOME10', discount_type: 'percentage', discount_value: 10, min_order_kobo: 500000, max_uses: 1000, uses_count: 234, is_active: true, expires_at: new Date(Date.now() + 30 * 86400000), created_at: daysAgo(60) },
    { id: 'cpn_002', merchant_id: M, code: 'FLAT500', discount_type: 'fixed', discount_value: 50000, min_order_kobo: 200000, max_uses: 500, uses_count: 89, is_active: true, expires_at: new Date(Date.now() + 14 * 86400000), created_at: daysAgo(30) },
    { id: 'cpn_003', merchant_id: M, code: 'SUMMER25', discount_type: 'percentage', discount_value: 25, min_order_kobo: 1000000, max_uses: 200, uses_count: 200, is_active: false, expires_at: daysAgo(7), created_at: daysAgo(90) },
  ]);

  // ── 10. Menu Categories & Items ───────────────────────────────────────────
  const menuCatIds = ['mcat_001','mcat_002','mcat_003','mcat_004'];
  await upsert('menu_categories', [
    { id: 'mcat_001', merchant_id: M, name: 'Starters', description: 'Light bites and appetizers', sort_order: 1, is_active: true, created_at: daysAgo(180) },
    { id: 'mcat_002', merchant_id: M, name: 'Main Course', description: 'Hearty Nigerian dishes', sort_order: 2, is_active: true, created_at: daysAgo(180) },
    { id: 'mcat_003', merchant_id: M, name: 'Drinks', description: 'Beverages and cocktails', sort_order: 3, is_active: true, created_at: daysAgo(180) },
    { id: 'mcat_004', merchant_id: M, name: 'Desserts', description: 'Sweet endings', sort_order: 4, is_active: true, created_at: daysAgo(180) },
  ]);
  await upsert('menu_items', [
    { id: 'mi_001', merchant_id: M, category_id: 'mcat_001', name: 'Puff Puff', description: 'Deep fried dough balls', price_kobo: 50000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_002', merchant_id: M, category_id: 'mcat_001', name: 'Suya Skewers', description: 'Spiced grilled beef skewers', price_kobo: 150000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_003', merchant_id: M, category_id: 'mcat_002', name: 'Jollof Rice & Chicken', description: 'Classic party jollof with grilled chicken', price_kobo: 350000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_004', merchant_id: M, category_id: 'mcat_002', name: 'Egusi Soup & Eba', description: 'Melon seed soup with cassava fufu', price_kobo: 280000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_005', merchant_id: M, category_id: 'mcat_002', name: 'Pepper Soup', description: 'Spicy catfish pepper soup', price_kobo: 200000, is_available: false, created_at: daysAgo(180) },
    { id: 'mi_006', merchant_id: M, category_id: 'mcat_003', name: 'Chapman', description: 'Classic Nigerian cocktail', price_kobo: 80000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_007', merchant_id: M, category_id: 'mcat_003', name: 'Zobo Drink', description: 'Hibiscus flower drink', price_kobo: 50000, is_available: true, created_at: daysAgo(180) },
    { id: 'mi_008', merchant_id: M, category_id: 'mcat_004', name: 'Chin Chin', description: 'Crunchy fried snack', price_kobo: 100000, is_available: true, created_at: daysAgo(180) },
  ]);

  // ── 11. Restaurant Tables & Orders ───────────────────────────────────────
  await upsert('restaurant_tables', [
    { id: 'rt_001', merchant_id: M, table_number: 'T01', capacity: 4, status: 'available', created_at: daysAgo(180) },
    { id: 'rt_002', merchant_id: M, table_number: 'T02', capacity: 2, status: 'occupied', created_at: daysAgo(180) },
    { id: 'rt_003', merchant_id: M, table_number: 'T03', capacity: 6, status: 'available', created_at: daysAgo(180) },
    { id: 'rt_004', merchant_id: M, table_number: 'T04', capacity: 8, status: 'reserved', created_at: daysAgo(180) },
    { id: 'rt_005', merchant_id: M, table_number: 'VIP1', capacity: 10, status: 'available', created_at: daysAgo(180) },
  ]);
  const restaurantOrderIds = Array.from({ length: 10 }, (_, i) => `ro_${String(i+1).padStart(3,'0')}`);
  await upsert('restaurant_orders', restaurantOrderIds.map((id, i) => ({
    id,
    merchant_id: M,
    table_id: pick(['rt_001','rt_002','rt_003','rt_004','rt_005']),
    order_number: `ORD${String(i+1).padStart(4,'0')}`,
    status: pick(['pending','preparing','ready','served','paid']),
    total_kobo: rand(200000, 2000000),
    notes: i % 3 === 0 ? 'No pepper please' : null,
    created_at: daysAgo(rand(0, 30)),
    updated_at: daysAgo(rand(0, 7)),
  })));
  await upsert('restaurant_order_items', restaurantOrderIds.flatMap((oid, i) =>
    Array.from({ length: rand(1, 4) }, (_, j) => ({
      id: `roi_${i}_${j}`,
      order_id: oid,
      menu_item_id: pick(['mi_001','mi_002','mi_003','mi_004','mi_006','mi_007']),
      quantity: rand(1, 3),
      unit_price_kobo: rand(50000, 350000),
      notes: null,
      created_at: daysAgo(rand(0, 30)),
    }))
  ));

  // ── 12. KDS Stations ─────────────────────────────────────────────────────
  await upsert('kds_stations', [
    { id: 'kds_001', merchant_id: M, name: 'Main Kitchen', type: 'kitchen', is_active: true, created_at: daysAgo(90) },
    { id: 'kds_002', merchant_id: M, name: 'Bar Station', type: 'bar', is_active: true, created_at: daysAgo(90) },
    { id: 'kds_003', merchant_id: M, name: 'Dessert Station', type: 'dessert', is_active: false, created_at: daysAgo(90) },
  ]);

  // ── 13. Cross-Border Transfers ────────────────────────────────────────────
  await upsert('cross_border_transfers', Array.from({ length: 10 }, (_, i) => ({
    id: `cbt_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    sender_name: NIGERIAN_NAMES[i],
    sender_country: 'NG',
    receiver_name: NIGERIAN_NAMES[(i + 5) % NIGERIAN_NAMES.length],
    receiver_country: pick(COUNTRIES.filter(c => c !== 'NG')),
    send_amount: rand(10000, 500000),
    send_currency: 'NGN',
    receive_amount: rand(50, 2000),
    receive_currency: pick(['USD','GBP','EUR','GHS']),
    exchange_rate: (rand(150, 170) / 100),
    fee_kobo: rand(5000, 25000),
    status: pick(['completed','completed','pending','processing','failed']),
    reference: `CBT${Date.now()}${i}`,
    created_at: daysAgo(rand(0, 60)),
  })));

  // ── 14. P2P Transfers ─────────────────────────────────────────────────────
  await upsert('p2p_transfers', Array.from({ length: 15 }, (_, i) => ({
    id: `p2p_${String(i+1).padStart(3,'0')}`,
    sender_wallet_id: `cw_${String(rand(1,10)).padStart(3,'0')}`,
    receiver_wallet_id: `cw_${String(rand(1,10)).padStart(3,'0')}`,
    amount_kobo: rand(100000, 5000000),
    note: pick(['Lunch split','Rent contribution','Thanks!','Birthday gift',null]),
    status: pick(['completed','completed','pending','failed']),
    reference: `P2P${Date.now()}${i}`,
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 15. Money Requests ────────────────────────────────────────────────────
  await upsert('money_requests', Array.from({ length: 10 }, (_, i) => ({
    id: `mr_${String(i+1).padStart(3,'0')}`,
    requester_wallet_id: `cw_${String(rand(1,5)).padStart(3,'0')}`,
    payer_phone: `+2348${String(rand(10000000, 99999999))}`,
    amount_kobo: rand(100000, 2000000),
    note: pick(['Owe me from dinner','Shared taxi fare','Contribution for gift',null]),
    status: pick(['pending','paid','expired','cancelled']),
    expires_at: new Date(Date.now() + rand(1, 7) * 86400000),
    created_at: daysAgo(rand(0, 14)),
  })));

  // ── 16. Red Envelopes ─────────────────────────────────────────────────────
  await upsert('red_envelopes', [
    { id: 're_001', sender_wallet_id: 'cw_001', total_amount_kobo: 1000000, remaining_amount_kobo: 400000, max_claims: 5, claims_count: 3, message: 'Happy New Year! 🎊', expires_at: new Date(Date.now() + 2 * 86400000), created_at: daysAgo(1) },
    { id: 're_002', sender_wallet_id: 'cw_002', total_amount_kobo: 500000, remaining_amount_kobo: 0, max_claims: 3, claims_count: 3, message: 'Eid Mubarak! 🌙', expires_at: daysAgo(1), created_at: daysAgo(5) },
  ]);
  await upsert('red_envelope_claims', [
    { id: 'rec_001', envelope_id: 're_001', claimer_wallet_id: 'cw_003', amount_kobo: 200000, created_at: daysAgo(1) },
    { id: 'rec_002', envelope_id: 're_001', claimer_wallet_id: 'cw_004', amount_kobo: 250000, created_at: daysAgo(1) },
    { id: 'rec_003', envelope_id: 're_001', claimer_wallet_id: 'cw_005', amount_kobo: 150000, created_at: hoursAgo(2) },
  ]);

  // ── 17. Split Bill Sessions ───────────────────────────────────────────────
  await upsert('split_bill_sessions', [
    { id: 'sbs_001', creator_wallet_id: 'cw_001', title: 'Team Lunch at Chicken Republic', total_amount_kobo: 1500000, status: 'active', created_at: daysAgo(1) },
    { id: 'sbs_002', creator_wallet_id: 'cw_002', title: 'Birthday Dinner', total_amount_kobo: 3200000, status: 'completed', created_at: daysAgo(7) },
  ]);
  await upsert('split_bill_shares', [
    { id: 'sbs_s_001', session_id: 'sbs_001', wallet_id: 'cw_001', share_kobo: 375000, status: 'paid', created_at: daysAgo(1) },
    { id: 'sbs_s_002', session_id: 'sbs_001', wallet_id: 'cw_003', share_kobo: 375000, status: 'pending', created_at: daysAgo(1) },
    { id: 'sbs_s_003', session_id: 'sbs_001', wallet_id: 'cw_004', share_kobo: 375000, status: 'pending', created_at: daysAgo(1) },
    { id: 'sbs_s_004', session_id: 'sbs_001', wallet_id: 'cw_005', share_kobo: 375000, status: 'paid', created_at: daysAgo(1) },
  ]);

  // ── 18. Saved Beneficiaries ───────────────────────────────────────────────
  await upsert('saved_beneficiaries', Array.from({ length: 8 }, (_, i) => ({
    id: `sb_${String(i+1).padStart(3,'0')}`,
    wallet_id: 'cw_001',
    name: NIGERIAN_NAMES[i],
    phone: `+2348${String(rand(10000000, 99999999))}`,
    bank_code: pick(NIGERIAN_BANKS).code,
    account_number: `${rand(1000000000, 9999999999)}`,
    is_favourite: i < 3,
    created_at: daysAgo(rand(7, 90)),
  })));

  // ── 19. Consumer Contacts ─────────────────────────────────────────────────
  await upsert('consumer_contacts', Array.from({ length: 10 }, (_, i) => ({
    id: `cc_${String(i+1).padStart(3,'0')}`,
    owner_wallet_id: 'cw_001',
    contact_wallet_id: `cw_${String(i+2).padStart(3,'0')}`,
    nickname: NIGERIAN_NAMES[i].split(' ')[0],
    is_favourite: i < 3,
    created_at: daysAgo(rand(7, 90)),
  })));

  // ── 20. Consumer Recurring Payments ──────────────────────────────────────
  await upsert('consumer_recurring_payments', [
    { id: 'crp_001', wallet_id: 'cw_001', biller_code: 'DSTV', customer_reference: '1234567890', amount_kobo: 180000, frequency: 'monthly', next_run_at: new Date(Date.now() + 7 * 86400000), is_active: true, created_at: daysAgo(60) },
    { id: 'crp_002', wallet_id: 'cw_001', biller_code: 'IKEDC', customer_reference: '0987654321', amount_kobo: 500000, frequency: 'monthly', next_run_at: new Date(Date.now() + 14 * 86400000), is_active: true, created_at: daysAgo(45) },
    { id: 'crp_003', wallet_id: 'cw_002', biller_code: 'MTN_DATA', customer_reference: '08012345678', amount_kobo: 100000, frequency: 'weekly', next_run_at: new Date(Date.now() + 3 * 86400000), is_active: false, created_at: daysAgo(30) },
  ]);

  // ── 21. Consumer KYC Records ──────────────────────────────────────────────
  await upsert('consumer_kyc_records', Array.from({ length: 5 }, (_, i) => ({
    id: `ckr_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(i+1).padStart(3,'0')}`,
    tier: pick([1, 2, 3]),
    bvn: `${rand(10000000000, 99999999999)}`,
    nin: `${rand(10000000000, 99999999999)}`,
    bvn_verified: i < 3,
    nin_verified: i < 2,
    selfie_url: null,
    address_verified: i < 2,
    created_at: daysAgo(rand(30, 180)),
    updated_at: daysAgo(rand(0, 30)),
  })));

  // ── 22. QR Payments ───────────────────────────────────────────────────────
  await upsert('qr_payments', Array.from({ length: 10 }, (_, i) => ({
    id: `qrp_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    amount_kobo: rand(100000, 500000),
    currency: 'NGN',
    reference: `QR${Date.now()}${i}`,
    status: pick(['completed','completed','pending','expired']),
    customer_wallet_id: i < 5 ? `cw_${String(rand(1,5)).padStart(3,'0')}` : null,
    created_at: daysAgo(rand(0, 30)),
    expires_at: new Date(Date.now() + rand(1, 24) * 3600000),
  })));

  // ── 23. USSD Sessions ─────────────────────────────────────────────────────
  await upsert('ussd_sessions', Array.from({ length: 8 }, (_, i) => ({
    id: `uss_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    session_id: `SESS${Date.now()}${i}`,
    phone_number: `+2348${String(rand(10000000, 99999999))}`,
    service_code: '*737#',
    current_menu: pick(['main','transfer','balance','bills']),
    state: JSON.stringify({ step: rand(1, 5), data: {} }),
    status: pick(['active','completed','timeout']),
    created_at: daysAgo(rand(0, 7)),
    updated_at: daysAgo(rand(0, 1)),
  })));

  // ── 24. Geofence Rules ────────────────────────────────────────────────────
  await upsert('geofence_rules', [
    { id: 'gfr_001', merchant_id: M, name: 'Lagos Metro Zone', lat: 6.5244, lng: 3.3792, radius_meters: 50000, action: 'allow', is_active: true, created_at: daysAgo(90) },
    { id: 'gfr_002', merchant_id: M, name: 'Abuja FCT Zone', lat: 9.0579, lng: 7.4951, radius_meters: 30000, action: 'allow', is_active: true, created_at: daysAgo(90) },
    { id: 'gfr_003', merchant_id: M, name: 'High Risk Zone', lat: 5.5167, lng: 5.7500, radius_meters: 10000, action: 'block', is_active: false, created_at: daysAgo(30) },
  ]);

  // ── 25. DCC Transactions ──────────────────────────────────────────────────
  await upsert('dcc_transactions', Array.from({ length: 8 }, (_, i) => ({
    id: `dcc_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    original_amount: rand(10000, 500000),
    original_currency: 'NGN',
    converted_amount: rand(50, 2000),
    converted_currency: pick(['USD','GBP','EUR']),
    exchange_rate: (rand(150, 170) / 100),
    margin_percent: 3.5,
    transaction_id: `tx_${String(rand(1,50)).padStart(4,'0')}`,
    status: pick(['completed','completed','pending']),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 26. Regulatory Sandbox Configs ───────────────────────────────────────
  await upsert('regulatory_sandbox_configs', [
    { id: 'rsc_001', merchant_id: M, sandbox_name: 'CBN Sandbox v2', provider: 'CBN', api_endpoint: 'https://sandbox.cbn.gov.ng/api/v2', api_key: 'cbn_sandbox_key_demo', is_active: true, created_at: daysAgo(60) },
    { id: 'rsc_002', merchant_id: M, sandbox_name: 'NIBSS Test', provider: 'NIBSS', api_endpoint: 'https://test.nibss-plc.com.ng/api', api_key: 'nibss_test_key_demo', is_active: false, created_at: daysAgo(30) },
  ]);

  // ── 27. Inventory Transactions ────────────────────────────────────────────
  await upsert('inventory_transactions', Array.from({ length: 10 }, (_, i) => ({
    id: `invt_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    item_id: `inv_${String(rand(1,5)).padStart(3,'0')}`,
    type: pick(['sale','restock','adjustment','return']),
    quantity: rand(1, 50),
    reference: `INVREF${Date.now()}${i}`,
    notes: null,
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 28. Invoice Payments ──────────────────────────────────────────────────
  await upsert('invoice_payments', Array.from({ length: 8 }, (_, i) => ({
    id: `invp_${String(i+1).padStart(3,'0')}`,
    invoice_id: `inv_${String(rand(1,10)).padStart(3,'0')}`,
    amount_kobo: rand(50000, 500000),
    payment_method: pick(['bank_transfer','card','wallet']),
    reference: `IPAY${Date.now()}${i}`,
    status: pick(['completed','completed','pending']),
    paid_at: daysAgo(rand(0, 30)),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 29. KYB Steps & Verifications ────────────────────────────────────────
  await upsert('kyb_verifications', [
    { id: 'kybv_001', merchant_id: M, status: 'approved', submitted_at: daysAgo(30), reviewed_at: daysAgo(25), reviewer_notes: 'All documents verified', created_at: daysAgo(30) },
    { id: 'kybv_002', merchant_id: MERCHANT_IDS[1], status: 'pending', submitted_at: daysAgo(5), reviewed_at: null, reviewer_notes: null, created_at: daysAgo(5) },
  ]);
  await upsert('kyb_steps', [
    { id: 'kybs_001', verification_id: 'kybv_001', step_name: 'business_registration', status: 'approved', document_url: 'https://cdn.paygate.ng/kyb/cac_cert.pdf', created_at: daysAgo(30) },
    { id: 'kybs_002', verification_id: 'kybv_001', step_name: 'director_id', status: 'approved', document_url: 'https://cdn.paygate.ng/kyb/director_id.jpg', created_at: daysAgo(30) },
    { id: 'kybs_003', verification_id: 'kybv_001', step_name: 'bank_statement', status: 'approved', document_url: 'https://cdn.paygate.ng/kyb/bank_stmt.pdf', created_at: daysAgo(30) },
    { id: 'kybs_004', verification_id: 'kybv_002', step_name: 'business_registration', status: 'pending', document_url: null, created_at: daysAgo(5) },
  ]);

  // ── 30. Merchant Directors ────────────────────────────────────────────────
  await upsert('merchant_directors', [
    { id: 'md_001', merchant_id: M, name: 'Adebayo Okafor', role: 'CEO', bvn: '22345678901', nin: '12345678901', id_type: 'national_id', id_number: 'NIN12345678', verified: true, created_at: daysAgo(90) },
    { id: 'md_002', merchant_id: M, name: 'Chidinma Eze', role: 'CFO', bvn: '22345678902', nin: '12345678902', id_type: 'passport', id_number: 'A12345678', verified: true, created_at: daysAgo(90) },
  ]);

  // ── 31. Merchant Profiles ─────────────────────────────────────────────────
  await upsert('merchant_profiles', MERCHANT_IDS.map((mid, i) => ({
    id: `mp_${String(i+1).padStart(3,'0')}`,
    merchant_id: mid,
    logo_url: `https://cdn.paygate.ng/logos/merchant_${i+1}.png`,
    banner_url: null,
    description: `Demo merchant ${i+1} — Nigerian fintech showcase`,
    website: `https://merchant${i+1}.demo.ng`,
    support_email: `support@merchant${i+1}.demo.ng`,
    support_phone: `+2348${String(rand(10000000, 99999999))}`,
    social_instagram: `@merchant${i+1}`,
    social_twitter: `@merchant${i+1}`,
    created_at: daysAgo(180),
    updated_at: daysAgo(rand(1, 30)),
  })));

  // ── 32. Loan Instalments & Repayments ─────────────────────────────────────
  await upsert('loan_instalments', Array.from({ length: 12 }, (_, i) => ({
    id: `li_${String(i+1).padStart(3,'0')}`,
    loan_id: `ml_${String(rand(1,5)).padStart(3,'0')}`,
    instalment_number: i + 1,
    due_date: new Date(Date.now() + (i - 3) * 30 * 86400000),
    amount_kobo: rand(50000, 200000),
    status: i < 3 ? 'paid' : i < 6 ? 'overdue' : 'pending',
    paid_at: i < 3 ? daysAgo(rand(1, 90)) : null,
    created_at: daysAgo(90),
  })));
  await upsert('loan_repayments', Array.from({ length: 8 }, (_, i) => ({
    id: `lr_${String(i+1).padStart(3,'0')}`,
    loan_id: `ml_${String(rand(1,5)).padStart(3,'0')}`,
    amount_kobo: rand(50000, 200000),
    payment_method: pick(['bank_transfer','card','wallet']),
    reference: `LREP${Date.now()}${i}`,
    status: 'completed',
    created_at: daysAgo(rand(0, 60)),
  })));

  // ── 33. Wealth Goals & Risk Profiles ─────────────────────────────────────
  await upsert('wealth_risk_profiles', [
    { id: 'wrp_001', merchant_id: M, risk_tolerance: 'moderate', investment_horizon: '5_years', monthly_income_kobo: 5000000, monthly_expenses_kobo: 2000000, created_at: daysAgo(60) },
    { id: 'wrp_002', merchant_id: MERCHANT_IDS[1], risk_tolerance: 'aggressive', investment_horizon: '10_years', monthly_income_kobo: 10000000, monthly_expenses_kobo: 3000000, created_at: daysAgo(30) },
  ]);
  await upsert('wealth_goals', [
    { id: 'wg_001', merchant_id: M, name: 'Emergency Fund', target_amount_kobo: 30000000, current_amount_kobo: 12000000, target_date: new Date(Date.now() + 365 * 86400000), status: 'active', created_at: daysAgo(90) },
    { id: 'wg_002', merchant_id: M, name: 'Business Expansion', target_amount_kobo: 100000000, current_amount_kobo: 45000000, target_date: new Date(Date.now() + 2 * 365 * 86400000), status: 'active', created_at: daysAgo(60) },
    { id: 'wg_003', merchant_id: MERCHANT_IDS[1], name: 'Retirement Fund', target_amount_kobo: 500000000, current_amount_kobo: 80000000, target_date: new Date(Date.now() + 20 * 365 * 86400000), status: 'active', created_at: daysAgo(30) },
  ]);

  // ── 34. NIP Banks & Account Cache ─────────────────────────────────────────
  await upsert('nip_banks', NIGERIAN_BANKS.map((b, i) => ({
    id: `nipb_${String(i+1).padStart(3,'0')}`,
    bank_code: b.code,
    bank_name: b.name,
    is_active: true,
    created_at: daysAgo(365),
    updated_at: daysAgo(1),
  })), 'bank_code');
  await upsert('nip_account_cache', Array.from({ length: 10 }, (_, i) => ({
    id: `nac_${String(i+1).padStart(3,'0')}`,
    account_number: `${rand(1000000000, 9999999999)}`,
    bank_code: pick(NIGERIAN_BANKS).code,
    account_name: NIGERIAN_NAMES[i],
    cached_at: daysAgo(rand(0, 7)),
    expires_at: new Date(Date.now() + 7 * 86400000),
  })));

  // ── 35. Nodal Accounts & Transactions ────────────────────────────────────
  await upsert('nodal_accounts', [
    { id: 'na_001', merchant_id: M, account_number: '0123456789', bank_code: '058', bank_name: 'GTBank', balance_kobo: 50000000, currency: 'NGN', is_active: true, created_at: daysAgo(180) },
    { id: 'na_002', merchant_id: M, account_number: '9876543210', bank_code: '033', bank_name: 'UBA', balance_kobo: 25000000, currency: 'NGN', is_active: true, created_at: daysAgo(90) },
  ]);
  await upsert('nodal_transactions', Array.from({ length: 10 }, (_, i) => ({
    id: `nt_${String(i+1).padStart(3,'0')}`,
    nodal_account_id: pick(['na_001','na_002']),
    type: pick(['credit','debit']),
    amount_kobo: rand(100000, 5000000),
    reference: `NODAL${Date.now()}${i}`,
    description: pick(['Settlement credit','Payout debit','Refund credit','Fee debit']),
    status: 'completed',
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 36. Realtime Notification Preferences & History ───────────────────────
  await upsert('realtime_notification_preferences', MERCHANT_IDS.map((mid, i) => ({
    id: `rnp_${String(i+1).padStart(3,'0')}`,
    merchant_id: mid,
    email_enabled: true,
    push_enabled: i < 3,
    sms_enabled: i < 2,
    events: JSON.stringify(['payment.completed','payout.completed','fraud.alert']),
    created_at: daysAgo(90),
    updated_at: daysAgo(rand(1, 30)),
  })));
  await upsert('realtime_notification_history', Array.from({ length: 15 }, (_, i) => ({
    id: `rnh_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    event_type: pick(['payment.completed','payout.completed','fraud.alert','kyc.approved']),
    channel: pick(['email','push','sms']),
    title: 'Payment Received',
    body: `Transaction of ₦${rand(1000, 100000).toLocaleString()} completed`,
    status: pick(['delivered','delivered','failed']),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 37. Regulatory Reports ────────────────────────────────────────────────
  await upsert('regulatory_reports', Array.from({ length: 5 }, (_, i) => ({
    id: `rr_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    report_type: pick(['CBN_STR','NFIU_CTR','FIRS_WHT','SEC_FILING']),
    period: `${2025 + Math.floor(i/4)}-Q${(i % 4) + 1}`,
    status: pick(['submitted','submitted','draft','pending']),
    file_url: i < 3 ? `https://cdn.paygate.ng/reports/reg_${i+1}.pdf` : null,
    submitted_at: i < 3 ? daysAgo(rand(7, 90)) : null,
    created_at: daysAgo(rand(7, 90)),
  })));

  // ── 38. PTSP Batches ──────────────────────────────────────────────────────
  await upsert('ptsp_batches', Array.from({ length: 5 }, (_, i) => ({
    id: `ptsp_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    batch_reference: `PTSP${Date.now()}${i}`,
    total_amount_kobo: rand(1000000, 50000000),
    transaction_count: rand(10, 500),
    status: pick(['processed','processed','pending','failed']),
    processed_at: i < 3 ? daysAgo(rand(1, 30)) : null,
    created_at: daysAgo(rand(1, 30)),
  })));

  // ── 39. Report Jobs & Scheduled Reports ──────────────────────────────────
  await upsert('report_jobs', Array.from({ length: 5 }, (_, i) => ({
    id: `rj_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    report_type: pick(['transactions','settlements','disputes','payouts']),
    status: pick(['completed','completed','processing','failed']),
    file_url: i < 3 ? `https://cdn.paygate.ng/reports/rpt_${i+1}.csv` : null,
    params: JSON.stringify({ from: daysAgo(30).toISOString(), to: new Date().toISOString() }),
    created_at: daysAgo(rand(0, 30)),
    completed_at: i < 3 ? daysAgo(rand(0, 30)) : null,
  })));
  await upsert('scheduled_reports', [
    { id: 'sr_001', merchant_id: M, report_type: 'transactions', frequency: 'daily', email: 'admin@demo.ng', is_active: true, last_run_at: daysAgo(1), next_run_at: new Date(Date.now() + 86400000), created_at: daysAgo(30) },
    { id: 'sr_002', merchant_id: M, report_type: 'settlements', frequency: 'weekly', email: 'finance@demo.ng', is_active: true, last_run_at: daysAgo(7), next_run_at: new Date(Date.now() + 7 * 86400000), created_at: daysAgo(60) },
  ]);

  // ── 40. SDK Tokens ────────────────────────────────────────────────────────
  await upsert('sdk_tokens', [
    { id: 'sdkt_001', merchant_id: M, token: 'pgk_test_sdk_demo_token_001', platform: 'web', is_active: true, created_at: daysAgo(90), expires_at: new Date(Date.now() + 365 * 86400000) },
    { id: 'sdkt_002', merchant_id: M, token: 'pgk_test_sdk_demo_token_002', platform: 'ios', is_active: true, created_at: daysAgo(60), expires_at: new Date(Date.now() + 365 * 86400000) },
    { id: 'sdkt_003', merchant_id: M, token: 'pgk_test_sdk_demo_token_003', platform: 'android', is_active: false, created_at: daysAgo(30), expires_at: daysAgo(1) },
  ]);

  // ── 41. Staff Shifts ──────────────────────────────────────────────────────
  await upsert('staff_shifts', Array.from({ length: 10 }, (_, i) => ({
    id: `ss_${String(i+1).padStart(3,'0')}`,
    staff_id: `stf_${String(rand(1,5)).padStart(3,'0')}`,
    merchant_id: M,
    shift_date: daysAgo(rand(0, 14)),
    start_time: '08:00',
    end_time: '16:00',
    status: pick(['completed','completed','scheduled','absent']),
    created_at: daysAgo(rand(0, 14)),
  })));

  // ── 42. Subscription Plans V2 & Subscribers ───────────────────────────────
  await upsert('subscription_plans_v2', [
    { id: 'spv2_001', merchant_id: M, name: 'Basic Monthly', description: 'Essential features', amount_kobo: 500000, currency: 'NGN', interval: 'monthly', trial_days: 14, is_active: true, created_at: daysAgo(180) },
    { id: 'spv2_002', merchant_id: M, name: 'Pro Monthly', description: 'Advanced features', amount_kobo: 1500000, currency: 'NGN', interval: 'monthly', trial_days: 7, is_active: true, created_at: daysAgo(180) },
    { id: 'spv2_003', merchant_id: M, name: 'Enterprise Annual', description: 'Full suite', amount_kobo: 15000000, currency: 'NGN', interval: 'yearly', trial_days: 30, is_active: true, created_at: daysAgo(90) },
  ]);
  await upsert('subscription_subscribers', Array.from({ length: 8 }, (_, i) => ({
    id: `ssub_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    plan_id: pick(['spv2_001','spv2_002','spv2_003']),
    customer_email: `customer${i+1}@demo.ng`,
    customer_name: NIGERIAN_NAMES[i],
    status: pick(['active','active','active','cancelled','trial']),
    current_period_start: daysAgo(rand(1, 30)),
    current_period_end: new Date(Date.now() + rand(1, 30) * 86400000),
    created_at: daysAgo(rand(30, 180)),
  })));
  await upsert('subscription_charges', Array.from({ length: 10 }, (_, i) => ({
    id: `sc_${String(i+1).padStart(3,'0')}`,
    subscriber_id: `ssub_${String(rand(1,8)).padStart(3,'0')}`,
    amount_kobo: rand(500000, 15000000),
    status: pick(['paid','paid','failed','pending']),
    charged_at: daysAgo(rand(0, 60)),
    created_at: daysAgo(rand(0, 60)),
  })));

  // ── 43. USDC Deposits ─────────────────────────────────────────────────────
  await upsert('usdc_deposits', Array.from({ length: 5 }, (_, i) => ({
    id: `usdcd_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    wallet_address: `0x${Math.random().toString(16).slice(2, 42)}`,
    amount_usdc: (rand(100, 10000) / 100).toFixed(2),
    tx_hash: `0x${Math.random().toString(16).slice(2, 66)}`,
    status: pick(['confirmed','confirmed','pending']),
    confirmed_at: i < 3 ? daysAgo(rand(0, 30)) : null,
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 44. Fraud Alert Comments ──────────────────────────────────────────────
  await upsert('fraud_alert_comments', Array.from({ length: 8 }, (_, i) => ({
    id: `fac_${String(i+1).padStart(3,'0')}`,
    alert_id: `fa_${String(rand(1,10)).padStart(3,'0')}`,
    author_id: rand(1, 5),
    comment: pick(['Investigating this transaction','Confirmed fraud - blocking account','False positive - cleared','Escalated to compliance team','Customer contacted for verification']),
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 45. Device Push Tokens ────────────────────────────────────────────────
  await upsert('device_push_tokens', Array.from({ length: 5 }, (_, i) => ({
    id: `dpt_${String(i+1).padStart(3,'0')}`,
    user_id: rand(1, 5),
    token: `fcm_token_demo_${i+1}_${Math.random().toString(36).slice(2, 20)}`,
    platform: pick(['ios','android','web']),
    is_active: true,
    created_at: daysAgo(rand(0, 30)),
    updated_at: daysAgo(rand(0, 7)),
  })));

  // ── 46. POS Transactions ──────────────────────────────────────────────────
  await upsert('pos_transactions', Array.from({ length: 15 }, (_, i) => ({
    id: `post_${String(i+1).padStart(3,'0')}`,
    terminal_id: pick(['pos_001','pos_002','pos_003']),
    merchant_id: M,
    amount_kobo: rand(100000, 500000),
    currency: 'NGN',
    card_last4: `${rand(1000, 9999)}`,
    card_brand: pick(['visa','mastercard']),
    status: pick(['approved','approved','declined','reversed']),
    reference: `POST${Date.now()}${i}`,
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 47. Consumer Finance Loans ────────────────────────────────────────────
  await upsert('consumer_finance_loans', Array.from({ length: 5 }, (_, i) => ({
    id: `cfl_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(i+1).padStart(3,'0')}`,
    product_code: pick(['PAYDAY_LOAN','SALARY_ADVANCE','MICRO_LOAN']),
    amount_kobo: rand(500000, 5000000),
    interest_rate: (rand(5, 25) / 100).toFixed(4),
    tenure_days: pick([30, 60, 90, 180]),
    status: pick(['active','active','repaid','defaulted']),
    disbursed_at: daysAgo(rand(30, 90)),
    due_date: new Date(Date.now() + rand(1, 60) * 86400000),
    created_at: daysAgo(rand(30, 90)),
  })));

  // ── 48. Privacy Settings & Aliases ────────────────────────────────────────
  await upsert('privacy_settings', MERCHANT_IDS.map((mid, i) => ({
    id: `ps_${String(i+1).padStart(3,'0')}`,
    merchant_id: mid,
    mask_customer_data: i < 2,
    retain_data_days: pick([90, 180, 365, 730]),
    gdpr_compliant: true,
    created_at: daysAgo(90),
    updated_at: daysAgo(rand(1, 30)),
  })));
  await upsert('privacy_aliases', Array.from({ length: 5 }, (_, i) => ({
    id: `pa_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    original_email: `customer${i+1}@demo.ng`,
    alias_email: `alias_${Math.random().toString(36).slice(2, 10)}@paygate-privacy.ng`,
    created_at: daysAgo(rand(0, 30)),
  })));

  // ── 49. Bulk Payment Schedules ────────────────────────────────────────────
  await upsert('bulk_payment_schedules', [
    { id: 'bps_001', merchant_id: M, name: 'Monthly Vendor Payments', description: 'Pay all vendors on the 25th', schedule_cron: '0 9 25 * *', next_run_at: new Date(Date.now() + 14 * 86400000), is_active: true, created_at: daysAgo(60) },
    { id: 'bps_002', merchant_id: M, name: 'Weekly Staff Allowances', description: 'Weekly transport allowances', schedule_cron: '0 8 * * 5', next_run_at: new Date(Date.now() + 3 * 86400000), is_active: true, created_at: daysAgo(30) },
  ]);

  // ── 50. Consumer Disputes ─────────────────────────────────────────────────
  await upsert('consumer_disputes', Array.from({ length: 5 }, (_, i) => ({
    id: `cd_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(rand(1,5)).padStart(3,'0')}`,
    transaction_id: `tx_${String(rand(1,50)).padStart(4,'0')}`,
    reason: pick(['unauthorized_transaction','wrong_amount','service_not_received','duplicate_charge']),
    description: 'I did not authorize this transaction',
    status: pick(['open','under_review','resolved','closed']),
    created_at: daysAgo(rand(0, 30)),
    updated_at: daysAgo(rand(0, 7)),
  })));

  // ── 51. Consumer Pins ─────────────────────────────────────────────────────
  // (hashed PINs — use bcrypt hash of "1234" for demo)
  await upsert('consumer_pins', Array.from({ length: 5 }, (_, i) => ({
    id: `cp_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(i+1).padStart(3,'0')}`,
    pin_hash: '$2b$10$demo_hash_placeholder_for_pin_1234',
    created_at: daysAgo(rand(30, 90)),
    updated_at: daysAgo(rand(0, 30)),
  })));

  // ── 52. Consumer Fraud Flags ──────────────────────────────────────────────
  await upsert('consumer_fraud_flags', Array.from({ length: 3 }, (_, i) => ({
    id: `cff_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(rand(1,5)).padStart(3,'0')}`,
    flag_type: pick(['velocity_breach','geo_anomaly','device_mismatch']),
    severity: pick(['low','medium','high']),
    details: JSON.stringify({ description: 'Suspicious activity detected', score: rand(60, 95) }),
    resolved: i === 0,
    created_at: daysAgo(rand(0, 14)),
  })));

  // ── 53. Agent Network ─────────────────────────────────────────────────────
  await upsert('agent_network', Array.from({ length: 5 }, (_, i) => ({
    id: `an_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    agent_code: `AGT${String(i+1).padStart(4,'0')}`,
    name: NIGERIAN_NAMES[i],
    phone: `+2348${String(rand(10000000, 99999999))}`,
    location: pick(['Lagos Island','Ikeja','Surulere','Victoria Island','Lekki']),
    status: pick(['active','active','inactive','suspended']),
    daily_limit_kobo: rand(500000, 5000000),
    created_at: daysAgo(rand(30, 180)),
  })));

  // ── 54. Idempotency Requests ──────────────────────────────────────────────
  await upsert('idempotency_requests', Array.from({ length: 5 }, (_, i) => ({
    id: `ir_${String(i+1).padStart(3,'0')}`,
    merchant_id: M,
    idempotency_key: `idem_key_${Date.now()}_${i}`,
    endpoint: pick(['/api/trpc/payments.initiate','/api/trpc/payouts.create']),
    response: JSON.stringify({ success: true, id: `tx_${i+1}` }),
    created_at: daysAgo(rand(0, 7)),
    expires_at: new Date(Date.now() + 24 * 3600000),
  })));

  // ── 55. Consumer Outbox ───────────────────────────────────────────────────
  await upsert('consumer_outbox', Array.from({ length: 5 }, (_, i) => ({
    id: `co_${String(i+1).padStart(3,'0')}`,
    event_type: pick(['wallet.credited','wallet.debited','kyc.approved','pin.changed']),
    payload: JSON.stringify({ wallet_id: `cw_${i+1}`, amount: rand(100000, 1000000) }),
    status: pick(['processed','processed','pending']),
    created_at: daysAgo(rand(0, 7)),
    processed_at: i < 3 ? daysAgo(rand(0, 7)) : null,
  })));

  // ── 56. Consumer Phone Verifications ─────────────────────────────────────
  await upsert('consumer_phone_verifications', Array.from({ length: 5 }, (_, i) => ({
    id: `cpv_${String(i+1).padStart(3,'0')}`,
    phone: `+2348${String(rand(10000000, 99999999))}`,
    otp_hash: `$2b$10$demo_otp_hash_${i}`,
    verified: i < 3,
    expires_at: new Date(Date.now() + 10 * 60000),
    created_at: daysAgo(rand(0, 7)),
  })));

  // ── 57. Consumer Idempotency Keys ─────────────────────────────────────────
  await upsert('consumer_idempotency_keys', Array.from({ length: 5 }, (_, i) => ({
    id: `cik_${String(i+1).padStart(3,'0')}`,
    wallet_id: `cw_${String(i+1).padStart(3,'0')}`,
    key: `consumer_idem_${Date.now()}_${i}`,
    response: JSON.stringify({ success: true }),
    created_at: daysAgo(rand(0, 3)),
    expires_at: new Date(Date.now() + 24 * 3600000),
  })));

  // ── 58. Consumer Loyalty V3 ───────────────────────────────────────────────
  await upsert('loyalty_v3_programs', [
    { id: 'lv3p_001', merchant_id: M, name: 'PayGate Stars', earn_per_kobo: 0.001, redeem_rate: 100, min_redeem: 500, is_active: true, created_at: daysAgo(60) },
  ]);
  await upsert('loyalty_v3_members', Array.from({ length: 5 }, (_, i) => ({
    id: `lv3m_${String(i+1).padStart(3,'0')}`,
    program_id: 'lv3p_001',
    customer_id: customerIds[i],
    points_balance: rand(100, 5000),
    tier: pick(['bronze','silver','gold']),
    created_at: daysAgo(rand(30, 90)),
  })));

  console.log('\n✅ Wave 85 seed complete!');
  await client.end();
}

run().catch(e => {
  console.error('Seed failed:', e.message);
  process.exit(1);
});
