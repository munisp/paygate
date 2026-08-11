/**
 * PayGate Remaining Tables Seed
 * Seeds all tables not covered by seed-full.mjs using the ACTUAL schema
 * Run after: seed-bootstrap.mjs && seed-full.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

const PG_URL = 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];
const M = MERCHANT_IDS[0];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(prefix='id') { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }

const NIGERIAN_NAMES = [
  'Adebayo Okafor','Chidinma Eze','Emeka Nwosu','Fatima Aliyu','Gbenga Adeleke',
  'Halima Musa','Ibrahim Sule','Jumoke Adeyemi','Kelechi Obi','Lola Adesanya',
  'Musa Garba','Ngozi Okonkwo','Ola Fashola','Priscilla Ike','Rotimi Bello',
];
const NIGERIAN_BANKS = [
  {code:'044',name:'Access Bank'},{code:'011',name:'First Bank'},
  {code:'058',name:'GTBank'},{code:'033',name:'UBA'},{code:'057',name:'Zenith Bank'},
];

async function tryInsert(client, sql, params, label) {
  try {
    await client.query(sql, params);
    return true;
  } catch(e) {
    if (process.env.DEBUG) console.warn(`  ⚠ ${label}: ${e.message.slice(0,100)}`);
    return false;
  }
}

async function run() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  console.log('✅ Connected to PostgreSQL\n');

  // Get merchant owner user ID
  const userRow = await client.query(`SELECT id FROM users WHERE role='admin' LIMIT 1`);
  const ownerUserId = userRow.rows[0]?.id || 1;

  // ── transactions (correct schema) ─────────────────────────────────────────
  console.log('💳 Seeding transactions...');
  const txStatuses = ['successful','successful','successful','failed','pending','refunded'];
  const txChannels = ['card','bank_transfer','ussd','qr','mobile_money','wallet'];
  let txCount = 0;
  for (let i = 0; i < 100; i++) {
    const amount = rand(500, 5000000);
    const fee = Math.floor(amount * 0.015);
    const ok = await tryInsert(client, `
      INSERT INTO transactions (id, merchant_id, reference, amount, currency, status, channel, 
        customer_email, customer_name, customer_phone, description, fee_amount, net_amount, 
        metadata, created_at, updated_at, tenant_id)
      VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,$8,$9,$10,$11,$12,$13,
        NOW() - ($14 || ' hours')::interval, NOW(), $15)
      ON CONFLICT (id) DO NOTHING
    `, [
      `txn_${String(i+1).padStart(4,'0')}`,
      pick(MERCHANT_IDS),
      `REF${Date.now()}${i}`,
      amount,
      pick(txStatuses),
      pick(txChannels),
      `user${i}@example.ng`,
      pick(NIGERIAN_NAMES),
      `+23480${String(10000000+i).slice(1)}`,
      `Payment for order #${2000+i}`,
      fee,
      amount - fee,
      JSON.stringify({ source: 'web', ip: `192.168.${rand(1,255)}.${rand(1,255)}` }),
      String(i * 6),
      TENANT_ID
    ], `txn_${i}`);
    if (ok) txCount++;
  }
  console.log(`  ✓ ${txCount} transactions`);

  // ── customers (correct schema) ─────────────────────────────────────────────
  console.log('👥 Seeding customers...');
  let custCount = 0;
  for (let i = 0; i < 30; i++) {
    const name = NIGERIAN_NAMES[i % NIGERIAN_NAMES.length];
    const [first, last] = name.split(' ');
    const ok = await tryInsert(client, `
      INSERT INTO customers (id, merchant_id, email, name, phone, risk_level, 
        total_transactions, total_spend, metadata, created_at, updated_at, tenant_id)
      VALUES ($1,$2,$3,$4,$5,'low',$6,$7,$8,
        NOW() - ($9 || ' days')::interval, NOW(), $10)
      ON CONFLICT (id) DO NOTHING
    `, [
      `cust_${String(i+1).padStart(3,'0')}`,
      pick(MERCHANT_IDS),
      `${first.toLowerCase()}.${last.toLowerCase()}${i}@example.ng`,
      name,
      `+23480${String(10000000+i).slice(1)}`,
      rand(1,50),
      rand(10000,5000000),
      JSON.stringify({ source: 'web', verified: true }),
      String(i * 7),
      TENANT_ID
    ], `cust_${i}`);
    if (ok) custCount++;
  }
  console.log(`  ✓ ${custCount} customers`);

  // ── qr_payments ────────────────────────────────────────────────────────────
  console.log('📱 Seeding qr_payments...');
  let qrCount = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO qr_payments (id, merchant_id, amount, currency, description, status, 
        expires_at, transaction_ref, metadata, created_at, updated_at)
      VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7,$8,
        NOW() - ($9 || ' hours')::interval, NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('qr'),
      pick(MERCHANT_IDS),
      rand(500, 100000),
      `QR Payment ${i+1}`,
      pick(['active','claimed','expired']),
      daysFromNow(rand(1,7)),
      i % 3 === 0 ? `REF_QR_${Date.now()}_${i}` : null,
      JSON.stringify({ terminal: `T${rand(100,999)}` }),
      String(i * 3)
    ], `qr_${i}`);
    if (ok) qrCount++;
  }
  console.log(`  ✓ ${qrCount} qr_payments`);

  // ── ussd_sessions ──────────────────────────────────────────────────────────
  console.log('📟 Seeding ussd_sessions...');
  let ussdCount = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO ussd_sessions (id, merchant_id, tenant_id, session_id, msisdn, service_code, 
        status, steps, last_input, amount_kobo, currency, started_at, ended_at, created_at)
      VALUES ($1,$2,$3,$4,$5,'*737#',$6,$7,$8,$9,'NGN',$10,$11,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('ussd'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `sess_${Date.now()}_${i}`,
      `+23480${String(10000000+i).slice(1)}`,
      pick(['completed','active','timeout','failed']),
      JSON.stringify([{step:1,prompt:'Enter amount',input:'5000'},{step:2,prompt:'Confirm?',input:'1'}]),
      '1',
      rand(100000, 5000000),
      daysAgo(rand(0,30)),
      daysAgo(rand(0,30))
    ], `ussd_${i}`);
    if (ok) ussdCount++;
  }
  console.log(`  ✓ ${ussdCount} ussd_sessions`);

  // ── pos_transactions ───────────────────────────────────────────────────────
  console.log('🖥️ Seeding pos_transactions...');
  // Get terminal IDs
  const termRows = await client.query(`SELECT id FROM pos_terminals LIMIT 10`);
  const termIds = termRows.rows.map(r => r.id);
  let posCount = 0;
  for (let i = 0; i < 30; i++) {
    if (!termIds.length) break;
    const ok = await tryInsert(client, `
      INSERT INTO pos_transactions (id, terminal_id, merchant_id, transaction_id, amount_kobo, 
        currency, channel, masked_pan, status, receipt_data, created_at, settlement_status)
      VALUES ($1,$2,$3,$4,$5,'NGN',$6,$7,$8,$9,
        NOW() - ($10 || ' hours')::interval,'pending')
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('postxn'),
      pick(termIds),
      pick(MERCHANT_IDS),
      uid('txn'),
      rand(100000, 5000000),
      pick(['card','contactless','chip']),
      `****${rand(1000,9999)}`,
      pick(['approved','declined','approved','approved']),
      JSON.stringify({ receipt_no: `RCP${rand(100000,999999)}`, cashier: pick(NIGERIAN_NAMES) }),
      String(i * 2)
    ], `postxn_${i}`);
    if (ok) posCount++;
  }
  console.log(`  ✓ ${posCount} pos_transactions`);

  // ── agent_network ──────────────────────────────────────────────────────────
  console.log('🤝 Seeding agent_network...');
  let agentCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO agent_network (id, super_agent_merchant_id, sub_agent_merchant_id, status, 
        joined_at, total_volume_kobo, transaction_count, fraud_incidents, settlement_rate)
      VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('agent'),
      MERCHANT_IDS[0],
      MERCHANT_IDS[i % 5],
      daysAgo(rand(30,365)),
      rand(1000000, 50000000),
      rand(100, 5000),
      rand(0, 5),
      (95 + rand(0,5)) / 100
    ], `agent_${i}`);
    if (ok) agentCount++;
  }
  console.log(`  ✓ ${agentCount} agent_network`);

  // ── idempotency_requests ───────────────────────────────────────────────────
  console.log('🔑 Seeding idempotency_requests...');
  let idempCount = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO idempotency_requests (id, merchant_id, operation, request_hash, 
        response_status, response_body, expires_at, created_at, tenant_id)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),$8)
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('idemp'),
      pick(MERCHANT_IDS),
      pick(['create_payment','initiate_payout','create_refund']),
      `hash_${Math.random().toString(36).slice(2,18)}`,
      pick([200,200,200,400,500]),
      JSON.stringify({ success: true, id: uid('res') }),
      daysFromNow(rand(1,7)),
      TENANT_ID
    ], `idemp_${i}`);
    if (ok) idempCount++;
  }
  console.log(`  ✓ ${idempCount} idempotency_requests`);

  // ── kyb_verifications ─────────────────────────────────────────────────────
  console.log('🔍 Seeding kyb_verifications...');
  let kybCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO kyb_verifications (verification_id, merchant_id, business_name, rc_number, 
        tax_id, business_type, industry_code, status, risk_level, initiated_by, started_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
      ON CONFLICT (verification_id) DO NOTHING
    `, [
      uid('kyb'),
      pick(MERCHANT_IDS),
      `Business ${i+1} Ltd`,
      `RC${rand(100000,999999)}`,
      `TIN${rand(10000000,99999999)}`,
      pick(['limited_company','sole_proprietor','partnership']),
      pick(['4814','5411','7372','5912']),
      pick(['approved','pending','rejected','approved','approved']),
      pick(['low','medium','high']),
      `admin@paygate.ng`,
      daysAgo(rand(1,90))
    ], `kyb_${i}`);
    if (ok) kybCount++;
  }
  console.log(`  ✓ ${kybCount} kyb_verifications`);

  // ── merchant_profiles ─────────────────────────────────────────────────────
  console.log('🏢 Seeding merchant_profiles...');
  let profCount = 0;
  for (const mid of MERCHANT_IDS) {
    const ok = await tryInsert(client, `
      INSERT INTO merchant_profiles (merchant_id, business_name, rc_number, tax_id, address, 
        state, country, kyc_status, kyb_status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'NG',$7,$8,NOW(),NOW())
      ON CONFLICT (merchant_id) DO NOTHING
    `, [
      mid,
      `Business ${mid}`,
      `RC${rand(100000,999999)}`,
      `TIN${rand(10000000,99999999)}`,
      `${rand(1,200)} Victoria Island, Lagos`,
      pick(['Lagos','Abuja','Kano','Rivers','Oyo']),
      pick(['approved','pending']),
      pick(['approved','pending'])
    ], `profile_${mid}`);
    if (ok) profCount++;
  }
  console.log(`  ✓ ${profCount} merchant_profiles`);

  // ── loan_instalments ──────────────────────────────────────────────────────
  console.log('💰 Seeding loan_instalments...');
  const loanRows = await client.query(`SELECT loan_id FROM merchant_loans LIMIT 10`);
  let instCount = 0;
  for (const loanRow of loanRows.rows) {
    for (let i = 0; i < 6; i++) {
      const ok = await tryInsert(client, `
        INSERT INTO loan_instalments (id, loan_id, merchant_id, due_date, amount_kobo, 
          paid_kobo, status, paid_at, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        uid('inst'),
        loanRow.loan_id,
        pick(MERCHANT_IDS),
        daysFromNow(i * 30),
        rand(100000, 1000000),
        i < 2 ? rand(100000, 1000000) : 0,
        i < 2 ? 'paid' : (i === 2 ? 'due' : 'upcoming'),
        i < 2 ? daysAgo(rand(1,60)) : null
      ], `inst_${loanRow.loan_id}_${i}`);
      if (ok) instCount++;
    }
  }
  console.log(`  ✓ ${instCount} loan_instalments`);

  // ── loan_repayments ───────────────────────────────────────────────────────
  console.log('💸 Seeding loan_repayments...');
  let repCount = 0;
  for (const loanRow of loanRows.rows.slice(0,5)) {
    for (let i = 0; i < 3; i++) {
      const ok = await tryInsert(client, `
        INSERT INTO loan_repayments (id, loan_id, merchant_id, amount_kobo, transfer_id, method, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,NOW() - ($7 || ' days')::interval)
        ON CONFLICT (id) DO NOTHING
      `, [
        uid('rep'),
        loanRow.loan_id,
        pick(MERCHANT_IDS),
        rand(100000, 1000000),
        uid('trf'),
        pick(['direct_debit','bank_transfer','wallet']),
        String(i * 30)
      ], `rep_${i}`);
      if (ok) repCount++;
    }
  }
  console.log(`  ✓ ${repCount} loan_repayments`);

  // ── fraud_alert_comments ──────────────────────────────────────────────────
  console.log('🚨 Seeding fraud_alert_comments...');
  const alertRows = await client.query(`SELECT id FROM fraud_alerts LIMIT 10`);
  let facCount = 0;
  for (const alertRow of alertRows.rows) {
    const ok = await tryInsert(client, `
      INSERT INTO fraud_alert_comments (id, alert_id, merchant_id, author_name, body, created_at)
      VALUES ($1,$2,$3,$4,$5,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('fac'),
      alertRow.id,
      pick(MERCHANT_IDS),
      pick(NIGERIAN_NAMES),
      pick([
        'Reviewed and confirmed as fraud. Blocking customer.',
        'False positive - customer verified via phone.',
        'Escalated to compliance team for review.',
        'Pattern matches known card testing attack.',
        'Monitoring closely - no action yet.'
      ])
    ], `fac_${alertRow.id}`);
    if (ok) facCount++;
  }
  console.log(`  ✓ ${facCount} fraud_alert_comments`);

  // ── nip_banks ─────────────────────────────────────────────────────────────
  console.log('🏦 Seeding nip_banks...');
  const banks = [
    {code:'044',name:'Access Bank',short:'ACCESS',active:true},
    {code:'011',name:'First Bank of Nigeria',short:'FIRSTBANK',active:true},
    {code:'058',name:'Guaranty Trust Bank',short:'GTBANK',active:true},
    {code:'033',name:'United Bank for Africa',short:'UBA',active:true},
    {code:'057',name:'Zenith Bank',short:'ZENITH',active:true},
    {code:'070',name:'Fidelity Bank',short:'FIDELITY',active:true},
    {code:'232',name:'Sterling Bank',short:'STERLING',active:true},
    {code:'035',name:'Wema Bank',short:'WEMA',active:true},
    {code:'214',name:'First City Monument Bank',short:'FCMB',active:true},
    {code:'076',name:'Polaris Bank',short:'POLARIS',active:true},
  ];
  let bankCount = 0;
  for (const b of banks) {
    const ok = await tryInsert(client, `
      INSERT INTO nip_banks (bank_code, bank_name, short_name, is_active, created_at)
      VALUES ($1,$2,$3,$4,NOW())
      ON CONFLICT (bank_code) DO NOTHING
    `, [b.code, b.name, b.short, b.active], `bank_${b.code}`);
    if (ok) bankCount++;
  }
  console.log(`  ✓ ${bankCount} nip_banks`);

  // ── nip_account_cache ─────────────────────────────────────────────────────
  console.log('📋 Seeding nip_account_cache...');
  let nacCount = 0;
  for (let i = 0; i < 20; i++) {
    const bank = pick(banks);
    const ok = await tryInsert(client, `
      INSERT INTO nip_account_cache (account_number, bank_code, account_name, merchant_id, 
        tenant_id, created_at, expires_at)
      VALUES ($1,$2,$3,$4,$5,NOW(),$6)
      ON CONFLICT (account_number, bank_code) DO NOTHING
    `, [
      String(rand(1000000000, 9999999999)),
      bank.code,
      pick(NIGERIAN_NAMES),
      pick(MERCHANT_IDS),
      TENANT_ID,
      daysFromNow(rand(1,30))
    ], `nac_${i}`);
    if (ok) nacCount++;
  }
  console.log(`  ✓ ${nacCount} nip_account_cache`);

  // ── nodal_accounts ────────────────────────────────────────────────────────
  console.log('🏛️ Seeding nodal_accounts...');
  let nodalCount = 0;
  for (let i = 0; i < 5; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO nodal_accounts (id, merchant_id, tenant_id, bank_code, account_number, 
        account_name, balance_kobo, reserved_kobo, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('nodal'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      pick(banks).code,
      String(rand(1000000000, 9999999999)),
      `PayGate Nodal ${i+1}`,
      rand(10000000, 500000000),
      rand(1000000, 50000000)
    ], `nodal_${i}`);
    if (ok) nodalCount++;
  }
  console.log(`  ✓ ${nodalCount} nodal_accounts`);

  // ── nodal_transactions ────────────────────────────────────────────────────
  console.log('💱 Seeding nodal_transactions...');
  const nodalRows = await client.query(`SELECT id FROM nodal_accounts LIMIT 5`);
  let nodTxCount = 0;
  for (const nr of nodalRows.rows) {
    for (let i = 0; i < 5; i++) {
      const ok = await tryInsert(client, `
        INSERT INTO nodal_transactions (id, nodal_account_id, merchant_id, tenant_id, 
          type, amount_kobo, reference, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',NOW() - ($8 || ' hours')::interval)
        ON CONFLICT (id) DO NOTHING
      `, [
        uid('ntxn'),
        nr.id,
        pick(MERCHANT_IDS),
        TENANT_ID,
        pick(['credit','debit']),
        rand(100000, 5000000),
        uid('REF'),
        String(i * 12)
      ], `ntxn_${i}`);
      if (ok) nodTxCount++;
    }
  }
  console.log(`  ✓ ${nodTxCount} nodal_transactions`);

  // ── regulatory_reports ────────────────────────────────────────────────────
  console.log('📊 Seeding regulatory_reports...');
  let regCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO regulatory_reports (id, merchant_id, tenant_id, report_type, period_start, 
        period_end, status, submitted_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('regrep'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      pick(['cbn_monthly','fiu_str','cbn_quarterly','nibss_weekly']),
      daysAgo(rand(30,90)),
      daysAgo(rand(1,29)),
      pick(['submitted','pending','draft']),
      i % 2 === 0 ? daysAgo(rand(1,10)) : null
    ], `regrep_${i}`);
    if (ok) regCount++;
  }
  console.log(`  ✓ ${regCount} regulatory_reports`);

  // ── report_jobs ───────────────────────────────────────────────────────────
  console.log('📈 Seeding report_jobs...');
  let rjCount = 0;
  for (let i = 0; i < 15; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO report_jobs (id, merchant_id, tenant_id, type, status, 
        parameters, result_url, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW() - ($8 || ' hours')::interval,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('rjob'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      pick(['transaction_summary','payout_report','fraud_report','settlement_report','customer_report']),
      pick(['completed','pending','failed','completed','completed']),
      JSON.stringify({ start_date: daysAgo(30).toISOString(), end_date: new Date().toISOString(), format: 'csv' }),
      i % 3 !== 2 ? `https://cdn.paygate.ng/reports/report_${uid()}.csv` : null,
      String(i * 4)
    ], `rjob_${i}`);
    if (ok) rjCount++;
  }
  console.log(`  ✓ ${rjCount} report_jobs`);

  // ── scheduled_reports ─────────────────────────────────────────────────────
  console.log('⏰ Seeding scheduled_reports...');
  let srCount = 0;
  for (let i = 0; i < 8; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO scheduled_reports (id, merchant_id, tenant_id, name, type, 
        frequency, recipients, is_active, next_run_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('sr'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `${pick(['Daily','Weekly','Monthly'])} ${pick(['Transaction','Payout','Fraud'])} Report`,
      pick(['transaction_summary','payout_report','fraud_report']),
      pick(['daily','weekly','monthly']),
      JSON.stringify([`ops@paygate.ng`, `finance@paygate.ng`]),
      daysFromNow(rand(1,7))
    ], `sr_${i}`);
    if (ok) srCount++;
  }
  console.log(`  ✓ ${srCount} scheduled_reports`);

  // ── sdk_tokens ────────────────────────────────────────────────────────────
  console.log('🔐 Seeding sdk_tokens...');
  let sdkCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO sdk_tokens (id, merchant_id, tenant_id, token_hash, environment, 
        permissions, is_active, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,true,$7,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('sdk'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `hash_${Math.random().toString(36).slice(2,34)}`,
      pick(['test','live']),
      JSON.stringify(['payments','refunds','customers']),
      daysFromNow(rand(30,365))
    ], `sdk_${i}`);
    if (ok) sdkCount++;
  }
  console.log(`  ✓ ${sdkCount} sdk_tokens`);

  // ── staff_shifts ──────────────────────────────────────────────────────────
  console.log('👷 Seeding staff_shifts...');
  const staffRows = await client.query(`SELECT id FROM staff_members LIMIT 10`);
  let shiftCount = 0;
  for (const sr of staffRows.rows) {
    for (let i = 0; i < 5; i++) {
      const startHour = pick([6,8,9,14,22]);
      const ok = await tryInsert(client, `
        INSERT INTO staff_shifts (id, staff_id, merchant_id, tenant_id, start_time, end_time, 
          status, hours_worked, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW())
        ON CONFLICT (id) DO NOTHING
      `, [
        uid('shift'),
        sr.id,
        pick(MERCHANT_IDS),
        TENANT_ID,
        daysAgo(i),
        new Date(daysAgo(i).getTime() + (8 * 3600000)),
        'completed',
        8
      ], `shift_${sr.id}_${i}`);
      if (ok) shiftCount++;
    }
  }
  console.log(`  ✓ ${shiftCount} staff_shifts`);

  // ── subscription_plans_v2 ─────────────────────────────────────────────────
  console.log('📋 Seeding subscription_plans_v2...');
  const plans = [
    { name: 'Starter', amount: 500000, interval: 'monthly', features: ['100 transactions/mo','Basic analytics','Email support'] },
    { name: 'Growth', amount: 1500000, interval: 'monthly', features: ['1000 transactions/mo','Advanced analytics','Priority support','API access'] },
    { name: 'Enterprise', amount: 5000000, interval: 'monthly', features: ['Unlimited transactions','Custom analytics','Dedicated support','Full API','White-label'] },
    { name: 'Annual Starter', amount: 5000000, interval: 'annual', features: ['100 transactions/mo','Basic analytics','Email support'] },
  ];
  let planCount = 0;
  for (const p of plans) {
    const ok = await tryInsert(client, `
      INSERT INTO subscription_plans_v2 (id, merchant_id, tenant_id, name, amount_kobo, currency, 
        interval, features, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'NGN',$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('plan'),
      M,
      TENANT_ID,
      p.name,
      p.amount,
      p.interval,
      JSON.stringify(p.features)
    ], `plan_${p.name}`);
    if (ok) planCount++;
  }
  console.log(`  ✓ ${planCount} subscription_plans_v2`);

  // ── subscription_subscribers ──────────────────────────────────────────────
  console.log('👤 Seeding subscription_subscribers...');
  const planRows = await client.query(`SELECT id FROM subscription_plans_v2 LIMIT 4`);
  let subCount = 0;
  for (let i = 0; i < 20; i++) {
    if (!planRows.rows.length) break;
    const ok = await tryInsert(client, `
      INSERT INTO subscription_subscribers (id, plan_id, merchant_id, tenant_id, 
        customer_email, customer_name, status, current_period_start, current_period_end, 
        created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('sub'),
      pick(planRows.rows).id,
      pick(MERCHANT_IDS),
      TENANT_ID,
      `subscriber${i}@example.ng`,
      pick(NIGERIAN_NAMES),
      pick(['active','active','active','cancelled','paused']),
      daysAgo(rand(1,30)),
      daysFromNow(rand(1,30))
    ], `sub_${i}`);
    if (ok) subCount++;
  }
  console.log(`  ✓ ${subCount} subscription_subscribers`);

  // ── usdc_deposits ─────────────────────────────────────────────────────────
  console.log('💎 Seeding usdc_deposits...');
  let usdcCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO usdc_deposits (id, merchant_id, tenant_id, amount_usdc, amount_ngn, 
        exchange_rate, status, tx_hash, wallet_address, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() - ($10 || ' hours')::interval,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('usdcd'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      (rand(10, 10000) / 100).toFixed(2),
      rand(15000, 15000000),
      1580 + rand(-50, 50),
      pick(['confirmed','pending','failed','confirmed']),
      `0x${Math.random().toString(16).slice(2).padEnd(64,'0')}`,
      `0x${Math.random().toString(16).slice(2).padEnd(40,'0')}`,
      String(i * 8)
    ], `usdcd_${i}`);
    if (ok) usdcCount++;
  }
  console.log(`  ✓ ${usdcCount} usdc_deposits`);

  // ── privacy_settings ──────────────────────────────────────────────────────
  console.log('🔒 Seeding privacy_settings...');
  let privCount = 0;
  for (const mid of MERCHANT_IDS) {
    const ok = await tryInsert(client, `
      INSERT INTO privacy_settings (id, merchant_id, tenant_id, data_retention_days, 
        pii_masking_enabled, gdpr_mode, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,NOW(),NOW())
      ON CONFLICT (merchant_id) DO NOTHING
    `, [
      uid('priv'),
      mid,
      TENANT_ID,
      rand(90, 730),
      rand(0,1) === 1,
      rand(0,1) === 1
    ], `priv_${mid}`);
    if (ok) privCount++;
  }
  console.log(`  ✓ ${privCount} privacy_settings`);

  // ── bulk_payment_schedules ────────────────────────────────────────────────
  console.log('📅 Seeding bulk_payment_schedules...');
  let bpsCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO bulk_payment_schedules (id, merchant_id, tenant_id, name, 
        total_amount_kobo, recipient_count, status, scheduled_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('bps'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `Bulk Payment ${i+1} - ${pick(['Salary','Vendor','Commission','Refund'])}`,
      rand(1000000, 50000000),
      rand(10, 500),
      pick(['pending','processing','completed','failed','completed']),
      daysFromNow(rand(0,7))
    ], `bps_${i}`);
    if (ok) bpsCount++;
  }
  console.log(`  ✓ ${bpsCount} bulk_payment_schedules`);

  // ── loyalty_v3_programs ───────────────────────────────────────────────────
  console.log('⭐ Seeding loyalty_v3_programs...');
  let loyCount = 0;
  for (let i = 0; i < 5; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO loyalty_v3_programs (id, merchant_id, tenant_id, name, description, 
        points_per_naira, redemption_rate, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('loyp'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `${pick(['Gold','Silver','Bronze','Platinum','Diamond'])} Rewards`,
      `Earn points on every purchase and redeem for discounts`,
      rand(1, 10),
      (rand(50, 200) / 1000).toFixed(3)
    ], `loyp_${i}`);
    if (ok) loyCount++;
  }
  console.log(`  ✓ ${loyCount} loyalty_v3_programs`);

  // ── loyalty_v3_members ────────────────────────────────────────────────────
  console.log('👥 Seeding loyalty_v3_members...');
  const loyProgRows = await client.query(`SELECT id FROM loyalty_v3_programs LIMIT 5`);
  let loyMemCount = 0;
  for (let i = 0; i < 20; i++) {
    if (!loyProgRows.rows.length) break;
    const ok = await tryInsert(client, `
      INSERT INTO loyalty_v3_members (id, program_id, merchant_id, tenant_id, 
        customer_email, customer_name, points_balance, tier, total_earned, total_redeemed, 
        created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() - ($11 || ' days')::interval,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('loym'),
      pick(loyProgRows.rows).id,
      pick(MERCHANT_IDS),
      TENANT_ID,
      `loyalty${i}@example.ng`,
      pick(NIGERIAN_NAMES),
      rand(100, 50000),
      pick(['bronze','silver','gold','platinum']),
      rand(1000, 100000),
      rand(0, 10000),
      String(i * 15)
    ], `loym_${i}`);
    if (ok) loyMemCount++;
  }
  console.log(`  ✓ ${loyMemCount} loyalty_v3_members`);

  // ── ptsp_batches ──────────────────────────────────────────────────────────
  console.log('📦 Seeding ptsp_batches...');
  let ptspCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO ptsp_batches (id, merchant_id, tenant_id, terminal_id, 
        transaction_count, total_amount_kobo, status, settled_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() - ($9 || ' hours')::interval)
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('ptsp'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      termIds.length ? pick(termIds) : null,
      rand(10, 200),
      rand(1000000, 50000000),
      pick(['settled','pending','failed','settled','settled']),
      i % 3 !== 2 ? daysAgo(rand(1,5)) : null,
      String(i * 24)
    ], `ptsp_${i}`);
    if (ok) ptspCount++;
  }
  console.log(`  ✓ ${ptspCount} ptsp_batches`);

  // ── geofence_rules ────────────────────────────────────────────────────────
  console.log('🗺️ Seeding geofence_rules...');
  const locations = [
    { name: 'Lagos Island', lat: 6.4531, lng: 3.3958 },
    { name: 'Victoria Island', lat: 6.4281, lng: 3.4219 },
    { name: 'Abuja CBD', lat: 9.0579, lng: 7.4951 },
    { name: 'Kano City', lat: 12.0022, lng: 8.5920 },
    { name: 'Port Harcourt', lat: 4.8156, lng: 7.0498 },
  ];
  let geoCount = 0;
  for (let i = 0; i < 10; i++) {
    const loc = pick(locations);
    const ok = await tryInsert(client, `
      INSERT INTO geofence_rules (id, merchant_id, tenant_id, name, 
        center_lat, center_lng, radius_meters, action, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('geo'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `${loc.name} Zone ${i+1}`,
      loc.lat + (Math.random() - 0.5) * 0.01,
      loc.lng + (Math.random() - 0.5) * 0.01,
      rand(500, 5000),
      pick(['allow','block','flag'])
    ], `geo_${i}`);
    if (ok) geoCount++;
  }
  console.log(`  ✓ ${geoCount} geofence_rules`);

  // ── dcc_transactions ──────────────────────────────────────────────────────
  console.log('💱 Seeding dcc_transactions...');
  let dccCount = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO dcc_transactions (id, merchant_id, tenant_id, original_amount, 
        original_currency, converted_amount, converted_currency, exchange_rate, 
        status, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() - ($10 || ' hours')::interval)
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('dcc'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      rand(100, 10000),
      pick(['USD','GBP','EUR']),
      rand(100000, 15000000),
      'NGN',
      1580 + rand(-100, 100),
      pick(['completed','pending','failed']),
      String(i * 6)
    ], `dcc_${i}`);
    if (ok) dccCount++;
  }
  console.log(`  ✓ ${dccCount} dcc_transactions`);

  // ── consumer_finance_loans ────────────────────────────────────────────────
  console.log('🏦 Seeding consumer_finance_loans...');
  let cflCount = 0;
  for (let i = 0; i < 15; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO consumer_finance_loans (id, merchant_id, tenant_id, customer_email, 
        customer_name, amount_kobo, outstanding_kobo, interest_rate, term_days, 
        status, disbursed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW() - ($12 || ' days')::interval,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [
      uid('cfl'),
      pick(MERCHANT_IDS),
      TENANT_ID,
      `consumer${i}@example.ng`,
      pick(NIGERIAN_NAMES),
      rand(100000, 5000000),
      rand(0, 5000000),
      (rand(15, 35) / 100).toFixed(2),
      pick([30, 60, 90, 180, 365]),
      pick(['active','active','active','completed','defaulted']),
      daysAgo(rand(1,90)),
      String(i * 7)
    ], `cfl_${i}`);
    if (ok) cflCount++;
  }
  console.log(`  ✓ ${cflCount} consumer_finance_loans`);

  // ── webhook_deliveries ────────────────────────────────────────────────────
  console.log('🔔 Seeding webhook_deliveries...');
  const webhookRows = await client.query(`SELECT id, merchant_id FROM webhooks LIMIT 5`);
  let wdCount = 0;
  for (const wr of webhookRows.rows) {
    for (let i = 0; i < 5; i++) {
      const ok = await tryInsert(client, `
        INSERT INTO webhook_deliveries (id, tenant_id, webhook_id, merchant_id, event_type, 
          payload, response_status, response_body, latency_ms, status, attempt_count, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW() - ($12 || ' hours')::interval)
        ON CONFLICT (id) DO NOTHING
      `, [
        uid('wd'),
        TENANT_ID,
        wr.id,
        wr.merchant_id,
        pick(['payment.success','payment.failed','payout.completed','refund.processed']),
        JSON.stringify({ event: 'payment.success', data: { amount: rand(1000, 500000) } }),
        pick([200, 200, 200, 400, 500]),
        JSON.stringify({ success: true }),
        rand(50, 2000),
        pick(['delivered','delivered','delivered','failed','pending']),
        rand(1, 3),
        String(i * 4)
      ], `wd_${wr.id}_${i}`);
      if (ok) wdCount++;
    }
  }
  console.log(`  ✓ ${wdCount} webhook_deliveries`);

  // ── tenant_config ─────────────────────────────────────────────────────────
  console.log('⚙️ Seeding tenant_config...');
  const configs = [
    { key: 'payment_timeout_seconds', value: '300', type: 'number' },
    { key: 'max_transaction_amount', value: '10000000', type: 'number' },
    { key: 'fraud_score_threshold', value: '75', type: 'number' },
    { key: 'kyc_required_amount', value: '500000', type: 'number' },
    { key: 'webhook_retry_count', value: '3', type: 'number' },
    { key: 'settlement_schedule', value: 'T+1', type: 'string' },
    { key: 'supported_currencies', value: 'NGN,USD,GBP,EUR', type: 'string' },
    { key: 'bnpl_max_amount', value: '5000000', type: 'number' },
  ];
  let cfgCount = 0;
  for (const c of configs) {
    const ok = await tryInsert(client, `
      INSERT INTO tenant_config (id, tenant_id, key, value, type, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,NOW(),NOW())
      ON CONFLICT (tenant_id, key) DO NOTHING
    `, [uid('cfg'), TENANT_ID, c.key, c.value, c.type], `cfg_${c.key}`);
    if (ok) cfgCount++;
  }
  console.log(`  ✓ ${cfgCount} tenant_config`);

  // ── device_push_tokens ────────────────────────────────────────────────────
  console.log('📱 Seeding device_push_tokens...');
  const userRows2 = await client.query(`SELECT id FROM users LIMIT 5`);
  let dptCount = 0;
  for (const ur of userRows2.rows) {
    const ok = await tryInsert(client, `
      INSERT INTO device_push_tokens (user_id, token, platform, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,true,NOW(),NOW())
      ON CONFLICT (user_id, token) DO NOTHING
    `, [
      ur.id,
      `fcm_token_${Math.random().toString(36).slice(2,30)}`,
      pick(['android','ios','web'])
    ], `dpt_${ur.id}`);
    if (ok) dptCount++;
  }
  console.log(`  ✓ ${dptCount} device_push_tokens`);

  // ── Final count ────────────────────────────────────────────────────────────
  const tableCount = await client.query(`
    SELECT count(*) FROM information_schema.tables WHERE table_schema='public' AND table_type='BASE TABLE'
  `);
  const rowCounts = await client.query(`
    SELECT schemaname, tablename, n_live_tup 
    FROM pg_stat_user_tables 
    WHERE n_live_tup > 0 
    ORDER BY n_live_tup DESC 
    LIMIT 20
  `);
  
  console.log(`\n✅ Remaining tables seed complete!`);
  console.log(`📊 Total tables: ${tableCount.rows[0].count}`);
  console.log(`\n📈 Top populated tables:`);
  for (const r of rowCounts.rows) {
    console.log(`  ${r.tablename}: ${r.n_live_tup} rows`);
  }

  await client.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
