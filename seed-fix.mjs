/**
 * PayGate Schema-Corrected Seed Fix
 * Seeds tables that had schema mismatches in seed-remaining.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

const PG_URL = 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';
const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(p='id') { return `${p}_${Date.now()}_${Math.random().toString(36).slice(2,8)}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function daysFromNow(n) { const d = new Date(); d.setDate(d.getDate() + n); return d; }

const NAMES = ['Adebayo Okafor','Chidinma Eze','Emeka Nwosu','Fatima Aliyu','Gbenga Adeleke',
  'Halima Musa','Ibrahim Sule','Jumoke Adeyemi','Kelechi Obi','Lola Adesanya'];

async function tryInsert(client, sql, params, label) {
  try { await client.query(sql, params); return true; }
  catch(e) { console.warn(`  ⚠ ${label}: ${e.message.slice(0,100)}`); return false; }
}

async function run() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  console.log('✅ Connected\n');

  // ── ussd_sessions ──────────────────────────────────────────────────────────
  console.log('📟 ussd_sessions...');
  let c = 0;
  for (let i = 0; i < 20; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO ussd_sessions (id, merchant_id, tenant_id, session_id, msisdn, service_code, 
        status, steps, last_input, amount_kobo, currency, started_at, ended_at, created_at)
      VALUES ($1,$2,$3,$4,$5,'*737#',$6,$7,$8,$9,'NGN',$10,$11,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('ussd'), pick(MERCHANT_IDS), TENANT_ID, uid('sess'),
      `+23480${String(10000000+i).slice(1)}`,
      pick(['completed','active','timeout','failed']),
      JSON.stringify([{step:1,prompt:'Enter amount',input:'5000'}]),
      '1', rand(100000,5000000), daysAgo(rand(0,30)), daysAgo(rand(0,30))
    ], `ussd_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── agent_network ──────────────────────────────────────────────────────────
  console.log('🤝 agent_network...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO agent_network (id, super_agent_merchant_id, sub_agent_merchant_id, status, 
        joined_at, total_volume_kobo, transaction_count, fraud_incidents, settlement_rate)
      VALUES ($1,$2,$3,'active',$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
    `, [uid('agnt'), MERCHANT_IDS[0], MERCHANT_IDS[i%5], daysAgo(rand(30,365)),
      rand(1000000,50000000), rand(100,5000), rand(0,5), (95+rand(0,5))/100
    ], `agnt_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── nip_banks ─────────────────────────────────────────────────────────────
  console.log('🏦 nip_banks...');
  const banks = [
    {code:'044',name:'Access Bank',short:'ACCESS'},
    {code:'011',name:'First Bank of Nigeria',short:'FIRSTBANK'},
    {code:'058',name:'Guaranty Trust Bank',short:'GTBANK'},
    {code:'033',name:'United Bank for Africa',short:'UBA'},
    {code:'057',name:'Zenith Bank',short:'ZENITH'},
    {code:'070',name:'Fidelity Bank',short:'FIDELITY'},
    {code:'232',name:'Sterling Bank',short:'STERLING'},
    {code:'035',name:'Wema Bank',short:'WEMA'},
    {code:'214',name:'First City Monument Bank',short:'FCMB'},
    {code:'076',name:'Polaris Bank',short:'POLARIS'},
    {code:'301',name:'Jaiz Bank',short:'JAIZ'},
    {code:'082',name:'Keystone Bank',short:'KEYSTONE'},
  ];
  c = 0;
  for (const b of banks) {
    const ok = await tryInsert(client, `
      INSERT INTO nip_banks (id, bank_code, bank_name, short_name, nip_code, category, 
        is_active, supports_nip, supports_ussd, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'commercial',true,true,true,NOW(),NOW())
      ON CONFLICT (bank_code) DO NOTHING
    `, [uid('bank'), b.code, b.name, b.short, b.code], `bank_${b.code}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── nip_account_cache ─────────────────────────────────────────────────────
  console.log('📋 nip_account_cache...');
  c = 0;
  for (let i = 0; i < 20; i++) {
    const b = pick(banks);
    const ok = await tryInsert(client, `
      INSERT INTO nip_account_cache (id, tenant_id, bank_code, account_number, account_name, 
        session_id, expires_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('nac'), TENANT_ID, b.code, String(rand(1000000000,9999999999)),
      pick(NAMES), uid('sess'), daysFromNow(rand(1,30))
    ], `nac_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── nodal_accounts ────────────────────────────────────────────────────────
  console.log('🏛️ nodal_accounts...');
  c = 0;
  for (let i = 0; i < 5; i++) {
    const b = pick(banks);
    const ok = await tryInsert(client, `
      INSERT INTO nodal_accounts (id, merchant_id, account_number, bank_name, bank_code, 
        purpose, description, balance_kobo, status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('nodal'), pick(MERCHANT_IDS), String(rand(1000000000,9999999999)),
      b.name, b.code, pick(['settlement','collection','escrow','float']),
      `Nodal account for ${pick(['settlements','collections','escrow'])}`,
      rand(10000000,500000000)
    ], `nodal_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── nodal_transactions ────────────────────────────────────────────────────
  console.log('💱 nodal_transactions...');
  const nodalRows = await client.query(`SELECT id FROM nodal_accounts LIMIT 5`);
  c = 0;
  for (const nr of nodalRows.rows) {
    for (let i = 0; i < 5; i++) {
      const ok = await tryInsert(client, `
        INSERT INTO nodal_transactions (id, nodal_account_id, merchant_id, tenant_id, 
          type, amount_kobo, reference, status, created_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',NOW() - ($8 || ' hours')::interval)
        ON CONFLICT (id) DO NOTHING
      `, [uid('ntxn'), nr.id, pick(MERCHANT_IDS), TENANT_ID,
        pick(['credit','debit']), rand(100000,5000000), uid('REF'), String(i*12)
      ], `ntxn_${i}`);
      if (ok) c++;
    }
  }
  console.log(`  ✓ ${c} rows`);

  // ── regulatory_reports ────────────────────────────────────────────────────
  console.log('📊 regulatory_reports...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO regulatory_reports (id, merchant_id, report_type, period, regulator, 
        status, submitted_at, report_data, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('regrep'), pick(MERCHANT_IDS),
      pick(['cbn_monthly','fiu_str','cbn_quarterly','nibss_weekly']),
      `${new Date().getFullYear()}-${String(rand(1,12)).padStart(2,'0')}`,
      pick(['CBN','NFIU','NIBSS']),
      pick(['submitted','pending','draft']),
      i%2===0 ? daysAgo(rand(1,10)) : null,
      JSON.stringify({ total_transactions: rand(100,10000), total_volume: rand(1000000,500000000) })
    ], `regrep_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── report_jobs ───────────────────────────────────────────────────────────
  console.log('📈 report_jobs...');
  c = 0;
  for (let i = 0; i < 15; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO report_jobs (id, merchant_id, type, format, from_date, to_date, 
        filters, status, row_count, download_url, expires_at, created_at, completed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW() - ($12 || ' hours')::interval,$13)
      ON CONFLICT (id) DO NOTHING
    `, [uid('rjob'), pick(MERCHANT_IDS),
      pick(['transaction_summary','payout_report','fraud_report','settlement_report']),
      pick(['csv','xlsx','pdf']),
      daysAgo(30), new Date(),
      JSON.stringify({ merchant_id: pick(MERCHANT_IDS) }),
      pick(['completed','pending','failed','completed','completed']),
      rand(100,10000),
      i%3!==2 ? `https://cdn.paygate.ng/reports/report_${i}.csv` : null,
      daysFromNow(rand(1,7)),
      String(i*4),
      i%3!==2 ? daysAgo(rand(0,2)) : null
    ], `rjob_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── scheduled_reports ─────────────────────────────────────────────────────
  console.log('⏰ scheduled_reports...');
  c = 0;
  for (let i = 0; i < 8; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO scheduled_reports (id, merchant_id, name, type, format, frequency, 
        recipients, is_active, next_run_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('sr'), pick(MERCHANT_IDS),
      `${pick(['Daily','Weekly','Monthly'])} ${pick(['Transaction','Payout','Fraud'])} Report`,
      pick(['transaction_summary','payout_report','fraud_report']),
      pick(['csv','xlsx']),
      pick(['daily','weekly','monthly']),
      JSON.stringify([`ops@paygate.ng`]),
      daysFromNow(rand(1,7))
    ], `sr_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── sdk_tokens ────────────────────────────────────────────────────────────
  console.log('🔐 sdk_tokens...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO sdk_tokens (token_id, merchant_id, token_hash, expires_at, scopes, 
        is_revoked, created_at)
      VALUES ($1,$2,$3,$4,$5,false,NOW())
      ON CONFLICT (token_id) DO NOTHING
    `, [uid('sdk'), pick(MERCHANT_IDS),
      `hash_${Math.random().toString(36).slice(2,34)}`,
      daysFromNow(rand(30,365)),
      JSON.stringify(['payments','refunds','customers'])
    ], `sdk_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── subscription_plans_v2 ─────────────────────────────────────────────────
  console.log('📋 subscription_plans_v2...');
  const plans = [
    { name: 'Starter', price: 500000, features: ['100 txns/mo','Basic analytics'] },
    { name: 'Growth', price: 1500000, features: ['1000 txns/mo','Advanced analytics','API access'] },
    { name: 'Enterprise', price: 5000000, features: ['Unlimited txns','Custom analytics','Dedicated support'] },
  ];
  c = 0;
  for (const p of plans) {
    const ok = await tryInsert(client, `
      INSERT INTO subscription_plans_v2 (id, merchant_id, name, description, price_kobo, 
        currency, interval, interval_count, trial_days, features, active_subscribers, 
        status, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,'NGN','monthly',1,14,$6,$7,'active',NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('plan'), MERCHANT_IDS[0], p.name, `${p.name} plan for growing businesses`,
      p.price, JSON.stringify(p.features), rand(0,100)
    ], `plan_${p.name}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── subscription_subscribers ──────────────────────────────────────────────
  console.log('👤 subscription_subscribers...');
  const planRows = await client.query(`SELECT id FROM subscription_plans_v2 LIMIT 3`);
  c = 0;
  for (let i = 0; i < 20; i++) {
    if (!planRows.rows.length) break;
    const ok = await tryInsert(client, `
      INSERT INTO subscription_subscribers (id, plan_id, merchant_id, customer_email, 
        customer_name, status, current_period_start, current_period_end, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('sub'), pick(planRows.rows).id, pick(MERCHANT_IDS),
      `subscriber${i}@example.ng`, pick(NAMES),
      pick(['active','active','active','cancelled','paused']),
      daysAgo(rand(1,30)), daysFromNow(rand(1,30))
    ], `sub_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── usdc_deposits ─────────────────────────────────────────────────────────
  console.log('💎 usdc_deposits...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO usdc_deposits (id, wallet_address, merchant_id, amount_lamports, 
        solana_signature, solana_slot, network, detected_at, processed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, [uid('usdcd'),
      `0x${Math.random().toString(16).slice(2).padEnd(40,'0')}`,
      pick(MERCHANT_IDS),
      rand(1000000, 1000000000),
      `sig_${Math.random().toString(36).slice(2,50)}`,
      rand(100000000, 200000000),
      pick(['mainnet','devnet']),
      daysAgo(rand(0,30)),
      i%3!==2 ? daysAgo(rand(0,29)) : null
    ], `usdcd_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── privacy_settings ──────────────────────────────────────────────────────
  console.log('🔒 privacy_settings...');
  c = 0;
  for (const mid of MERCHANT_IDS) {
    const ok = await tryInsert(client, `
      INSERT INTO privacy_settings (id, merchant_id, privacy_mode, hide_business_name, 
        hide_bank_details, use_private_alias, private_alias, updated_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
      ON CONFLICT (merchant_id) DO NOTHING
    `, [uid('priv'), mid, pick(['standard','enhanced','strict']),
      rand(0,1)===1, rand(0,1)===1, rand(0,1)===1,
      `alias_${mid.replace('merch_','m')}`
    ], `priv_${mid}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── geofence_rules ────────────────────────────────────────────────────────
  console.log('🗺️ geofence_rules...');
  const locs = [
    {lat:6.4531,lng:3.3958},{lat:6.4281,lng:3.4219},{lat:9.0579,lng:7.4951},
    {lat:12.0022,lng:8.5920},{lat:4.8156,lng:7.0498}
  ];
  c = 0;
  for (let i = 0; i < 10; i++) {
    const loc = pick(locs);
    const ok = await tryInsert(client, `
      INSERT INTO geofence_rules (id, merchant_id, name, center_lat, center_lng, 
        radius_meters, active, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,true,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('geo'), pick(MERCHANT_IDS), `Zone ${i+1}`,
      loc.lat+(Math.random()-0.5)*0.01, loc.lng+(Math.random()-0.5)*0.01,
      rand(500,5000)
    ], `geo_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── dcc_transactions ──────────────────────────────────────────────────────
  console.log('💱 dcc_transactions...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok = await tryInsert(client, `
      INSERT INTO dcc_transactions (conversion_id, merchant_id, from_currency, to_currency, 
        original_amount_kobo, converted_amount_kobo, mid_rate, customer_rate, margin_pct, 
        transfer_id, status, created_at)
      VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7,$8,$9,$10,NOW())
      ON CONFLICT (conversion_id) DO NOTHING
    `, [uid('dcc'), pick(MERCHANT_IDS), pick(['USD','GBP','EUR']),
      rand(100,10000)*100, rand(100000,15000000),
      1580+rand(-100,100), 1580+rand(0,50),
      (rand(1,5)/100).toFixed(4),
      uid('trf'),
      pick(['completed','pending','failed'])
    ], `dcc_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── consumer_finance_loans ────────────────────────────────────────────────
  console.log('🏦 consumer_finance_loans...');
  const custRows = await client.query(`SELECT id FROM customers LIMIT 10`);
  c = 0;
  for (let i = 0; i < 15; i++) {
    if (!custRows.rows.length) break;
    const ok = await tryInsert(client, `
      INSERT INTO consumer_finance_loans (loan_id, customer_id, merchant_id, amount_kobo, 
        outstanding_kobo, status, term_days, rate_annual_pct, due_date, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,NOW() - ($10 || ' days')::interval,NOW())
      ON CONFLICT (loan_id) DO NOTHING
    `, [uid('cfl'), pick(custRows.rows).id, pick(MERCHANT_IDS),
      rand(100000,5000000), rand(0,5000000),
      pick(['active','active','active','completed','defaulted']),
      pick([30,60,90,180,365]),
      (rand(15,35)/100).toFixed(2),
      daysFromNow(rand(1,180)),
      String(i*7)
    ], `cfl_${i}`);
    if (ok) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── tenant_config ─────────────────────────────────────────────────────────
  console.log('⚙️ tenant_config...');
  const ok = await tryInsert(client, `
    INSERT INTO tenant_config (id, tenant_id, card_fees_bps, bank_transfer_fees_bps, 
      mobile_money_fees_bps, cross_border_fees_bps, bnpl_fees_bps, fx_spread_bps, 
      settlement_frequency, settlement_cutoff_hour, settlement_min_amount, 
      bnpl_max_installments, bnpl_max_loan_amount, bnpl_interest_rate_bps, 
      api_rate_limit_rpm, payout_approval_threshold, payout_approval_enabled, 
      settlement_sla_hours, updated_at, updated_by)
    VALUES ($1,$2,150,50,100,300,200,200,'daily',17,100000,12,5000000,1500,1000,500000,true,24,NOW(),$3)
    ON CONFLICT (tenant_id) DO NOTHING
  `, [uid('cfg'), TENANT_ID, 'admin@paygate.ng'], 'tenant_config');
  console.log(`  ✓ ${ok ? 1 : 0} rows`);

  // ── device_push_tokens ────────────────────────────────────────────────────
  console.log('📱 device_push_tokens...');
  const userRows = await client.query(`SELECT id FROM users LIMIT 5`);
  c = 0;
  for (const ur of userRows.rows) {
    const ok2 = await tryInsert(client, `
      INSERT INTO device_push_tokens (id, merchant_id, user_id, token, platform, 
        device_id, app_version, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,'1.0.0',true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('dpt'), pick(MERCHANT_IDS), ur.id,
      `fcm_${Math.random().toString(36).slice(2,30)}`,
      pick(['android','ios','web']),
      uid('dev')
    ], `dpt_${ur.id}`);
    if (ok2) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── bulk_payment_schedules ────────────────────────────────────────────────
  console.log('📅 bulk_payment_schedules...');
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok2 = await tryInsert(client, `
      INSERT INTO bulk_payment_schedules (id, merchant_id, tenant_id, name, 
        total_amount_kobo, recipient_count, status, scheduled_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('bps'), pick(MERCHANT_IDS), TENANT_ID,
      `Bulk ${pick(['Salary','Vendor','Commission','Refund'])} Payment ${i+1}`,
      rand(1000000,50000000), rand(10,500),
      pick(['pending','processing','completed','failed','completed']),
      daysFromNow(rand(0,7))
    ], `bps_${i}`);
    if (ok2) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── loyalty_v3_programs ───────────────────────────────────────────────────
  console.log('⭐ loyalty_v3_programs...');
  const loyPrograms = [
    { name: 'Gold Rewards', pts: 5 },
    { name: 'Silver Points', pts: 3 },
    { name: 'Bronze Club', pts: 1 },
    { name: 'Platinum Elite', pts: 10 },
  ];
  c = 0;
  for (const p of loyPrograms) {
    const ok2 = await tryInsert(client, `
      INSERT INTO loyalty_v3_programs (id, merchant_id, tenant_id, name, description, 
        points_per_naira, redemption_rate, is_active, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('loyp'), pick(MERCHANT_IDS), TENANT_ID, p.name,
      `Earn points on every purchase`, p.pts, (p.pts/1000).toFixed(3)
    ], `loyp_${p.name}`);
    if (ok2) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── loyalty_v3_members ────────────────────────────────────────────────────
  console.log('👥 loyalty_v3_members...');
  const loyProgRows = await client.query(`SELECT id FROM loyalty_v3_programs LIMIT 4`);
  c = 0;
  for (let i = 0; i < 20; i++) {
    if (!loyProgRows.rows.length) break;
    const ok2 = await tryInsert(client, `
      INSERT INTO loyalty_v3_members (id, program_id, merchant_id, tenant_id, 
        customer_email, customer_name, points_balance, tier, total_earned, total_redeemed, 
        created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW() - ($11 || ' days')::interval,NOW())
      ON CONFLICT (id) DO NOTHING
    `, [uid('loym'), pick(loyProgRows.rows).id, pick(MERCHANT_IDS), TENANT_ID,
      `loyalty${i}@example.ng`, pick(NAMES),
      rand(100,50000), pick(['bronze','silver','gold','platinum']),
      rand(1000,100000), rand(0,10000), String(i*15)
    ], `loym_${i}`);
    if (ok2) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── ptsp_batches ──────────────────────────────────────────────────────────
  console.log('📦 ptsp_batches...');
  const termRows = await client.query(`SELECT id FROM pos_terminals LIMIT 5`);
  const termIds = termRows.rows.map(r => r.id);
  c = 0;
  for (let i = 0; i < 10; i++) {
    const ok2 = await tryInsert(client, `
      INSERT INTO ptsp_batches (id, merchant_id, tenant_id, terminal_id, 
        transaction_count, total_amount_kobo, status, settled_at, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW() - ($9 || ' hours')::interval)
      ON CONFLICT (id) DO NOTHING
    `, [uid('ptsp'), pick(MERCHANT_IDS), TENANT_ID,
      termIds.length ? pick(termIds) : null,
      rand(10,200), rand(1000000,50000000),
      pick(['settled','pending','failed','settled','settled']),
      i%3!==2 ? daysAgo(rand(1,5)) : null,
      String(i*24)
    ], `ptsp_${i}`);
    if (ok2) c++;
  }
  console.log(`  ✓ ${c} rows`);

  // ── Final stats ────────────────────────────────────────────────────────────
  const stats = await client.query(`
    SELECT relname as table_name, n_live_tup as rows
    FROM pg_stat_user_tables 
    WHERE n_live_tup > 0 
    ORDER BY n_live_tup DESC
  `);
  
  console.log(`\n✅ Seed fix complete!`);
  console.log(`\n📊 All populated tables (${stats.rows.length}):`);
  for (const r of stats.rows) {
    console.log(`  ${r.table_name}: ${r.rows} rows`);
  }

  await client.end();
}

run().catch(e => { console.error('❌', e.message); process.exit(1); });
