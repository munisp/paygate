/**
 * PayGate Full Demo Seed Script v2
 * Seeds ALL tables with realistic Nigerian fintech data
 * Run: node seed-full.mjs
 */
import pg from './node_modules/.pnpm/pg@8.20.0/node_modules/pg/lib/index.js';
const { Client } = pg;

// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
const PG_URL = process.env.PG_DATABASE_URL || 'postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev';

const TENANT_ID = 'tenant-paygate-demo-001';
const MERCHANT_IDS = ['merch_001', 'merch_002', 'merch_003', 'merch_004', 'merch_005'];
const M = MERCHANT_IDS[0]; // primary merchant

function rand(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function pick(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function uid(prefix) { return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`; }
function daysAgo(n) { const d = new Date(); d.setDate(d.getDate() - n); return d; }
function hoursAgo(n) { const d = new Date(); d.setHours(d.getHours() - n); return d; }

const NIGERIAN_NAMES = ['Adebayo Okafor','Chidinma Eze','Emeka Nwosu','Fatima Aliyu','Gbenga Adeleke','Halima Musa','Ibrahim Sule','Jumoke Adeyemi','Kelechi Obi','Lola Adesanya','Musa Garba','Ngozi Okonkwo','Ola Fashola','Priscilla Ike','Rotimi Bello','Sade Afolabi','Tunde Bakare','Uche Okafor','Victoria Eze','Wale Adegoke'];
const NIGERIAN_BANKS = [
  {code:'044',name:'Access Bank'},{code:'023',name:'Citibank'},{code:'050',name:'EcoBank'},
  {code:'011',name:'First Bank'},{code:'214',name:'FCMB'},{code:'070',name:'Fidelity Bank'},
  {code:'058',name:'GTBank'},{code:'030',name:'Heritage Bank'},{code:'301',name:'Jaiz Bank'},
  {code:'082',name:'Keystone Bank'},{code:'076',name:'Polaris Bank'},{code:'221',name:'Stanbic IBTC'},
  {code:'068',name:'Standard Chartered'},{code:'232',name:'Sterling Bank'},{code:'032',name:'Union Bank'},
  {code:'033',name:'UBA'},{code:'215',name:'Unity Bank'},{code:'035',name:'Wema Bank'},
  {code:'057',name:'Zenith Bank'}
];
const STATES = ['Lagos','Abuja','Kano','Rivers','Oyo','Kaduna','Enugu','Delta','Anambra','Ogun'];
const LGAS = ['Ikeja','Victoria Island','Lekki','Surulere','Yaba','Oshodi','Apapa','Mushin','Ikorodu','Agege'];

async function seed() {
  const client = new Client({ connectionString: PG_URL });
  await client.connect();
  console.log('Connected to PostgreSQL');

  try {
    // ─── WALLETS ───────────────────────────────────────────────────────────────
    console.log('Seeding wallets...');
    const walletIds = [];
    for (const mid of MERCHANT_IDS) {
      for (const currency of ['NGN','USD','GBP','EUR']) {
        const balance = rand(500000, 50000000).toString();
        const res = await client.query(`
          INSERT INTO wallets (user_id, merchant_id, currency, balance, ledger_balance, status, tier, daily_limit, monthly_limit, tenant_id)
          VALUES ($1,$2,$3,$4,$5,'active','premium','5000000','50000000',$6)
          ON CONFLICT DO NOTHING RETURNING id
        `, ['1', mid, currency, balance, balance, TENANT_ID]);
        if (res.rows[0]) walletIds.push(res.rows[0].id);
      }
    }
    console.log(`  → ${walletIds.length} wallets`);

    // ─── WALLET TRANSACTIONS ───────────────────────────────────────────────────
    console.log('Seeding wallet_transactions...');
    const types = ['credit','debit','fee','reversal'];
    const channels = ['web','mobile','api','pos','ussd'];
    let wtCount = 0;
    for (const wid of walletIds.slice(0, 4)) {
      for (let i = 0; i < 25; i++) {
        const amount = rand(5000, 2000000).toString();
        await client.query(`
          INSERT INTO wallet_transactions (wallet_id, type, amount, currency, balance_before, balance_after, description, reference, channel, counterparty_name, status, tenant_id)
          VALUES ($1,$2,$3,'NGN',$4,$5,$6,$7,$8,$9,'completed',$10)
        `, [wid, pick(types), amount, rand(1000000,10000000).toString(), rand(1000000,10000000).toString(),
            `${pick(types)} via ${pick(channels)}`, uid('wtxn'), pick(channels), pick(NIGERIAN_NAMES), TENANT_ID]);
        wtCount++;
      }
    }
    console.log(`  → ${wtCount} wallet_transactions`);

    // ─── PAYOUTS ───────────────────────────────────────────────────────────────
    console.log('Seeding payouts...');
    const payoutStatuses = ['pending','processing','completed','completed','completed','failed'];
    for (let i = 0; i < 60; i++) {
      const bank = pick(NIGERIAN_BANKS);
      const name = pick(NIGERIAN_NAMES);
      await client.query(`
        INSERT INTO payouts (id, merchant_id, reference, amount, currency, status, bank_code, account_number, account_name, narration, fee_amount, processed_at, tenant_id)
        VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [uid('pyo'), pick(MERCHANT_IDS), uid('REF'), rand(50000,5000000), pick(payoutStatuses),
          bank.code, `0${rand(10000000,99999999)}`, name, `Payout to ${name}`, rand(50,500),
          daysAgo(rand(0,30)), TENANT_ID]);
    }
    console.log('  → 60 payouts');

    // ─── VIRTUAL CARDS ─────────────────────────────────────────────────────────
    console.log('Seeding virtual_cards...');
    const cardBrands = ['visa','mastercard'];
    for (let i = 0; i < 20; i++) {
      const brand = pick(cardBrands);
      const last4 = rand(1000,9999);
      await client.query(`
        INSERT INTO virtual_cards (id, merchant_id, masked_pan, brand, expiry_month, expiry_year, currency, status, balance, spend_limit, label, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [uid('vc'), pick(MERCHANT_IDS), `****-****-****-${last4}`, brand,
          rand(1,12), rand(2026,2029), pick(['USD','NGN']), pick(['active','active','active','frozen']),
          rand(0,500000), rand(500000,5000000), `${brand.toUpperCase()} Card ${i+1}`, TENANT_ID]);
    }
    console.log('  → 20 virtual_cards');

    // ─── API KEYS ──────────────────────────────────────────────────────────────
    console.log('Seeding api_keys...');
    const keyNames = ['Production Key','Test Key','Mobile App Key','Web Integration','POS Integration','Partner API'];
    for (let i = 0; i < 12; i++) {
      const env = i < 6 ? 'live' : 'test';
      await client.query(`
        INSERT INTO api_keys (id, merchant_id, name, key_hash, key_prefix, environment, permissions, is_active, last_used_at, created_by, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT DO NOTHING
      `, [uid('ak'), pick(MERCHANT_IDS), pick(keyNames), uid('hash'), env === 'live' ? 'pk_live_' : 'pk_test_',
          env, JSON.stringify(['transactions:read','payouts:write','customers:read']),
          i < 10, hoursAgo(rand(1,720)), 1, TENANT_ID]);
    }
    console.log('  → 12 api_keys');

    // ─── WEBHOOKS ──────────────────────────────────────────────────────────────
    console.log('Seeding webhooks...');
    const webhookEvents = [
      ['payment.success','payment.failed'],
      ['payout.completed','payout.failed'],
      ['customer.created','kyc.approved'],
      ['dispute.opened','dispute.resolved'],
      ['subscription.renewed','subscription.cancelled']
    ];
    for (let i = 0; i < 10; i++) {
      await client.query(`
        INSERT INTO webhooks (id, merchant_id, url, events, secret, is_active, last_delivered_at, failure_count, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [uid('wh'), pick(MERCHANT_IDS), `https://api.merchant${i+1}.ng/webhooks/paygate`,
          JSON.stringify(pick(webhookEvents)), uid('whsec'), i < 8, hoursAgo(rand(1,48)), rand(0,3), TENANT_ID]);
    }
    console.log('  → 10 webhooks');

    // ─── PAYMENT LINKS ─────────────────────────────────────────────────────────
    console.log('Seeding payment_links...');
    const linkTitles = ['School Fees Payment','Rent Collection','Product Purchase','Service Fee','Donation Portal','Event Ticket','Subscription Renewal','Invoice Payment'];
    for (let i = 0; i < 20; i++) {
      await client.query(`
        INSERT INTO payment_links (id, merchant_id, slug, title, description, amount, currency, is_active, usage_limit, usage_count, redirect_url, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,'NGN',$7,$8,$9,$10,$11)
        ON CONFLICT DO NOTHING
      `, [uid('pl'), pick(MERCHANT_IDS), uid('link'), pick(linkTitles),
          'Secure payment powered by PayGate', rand(500000,5000000), i < 16,
          pick([null, 100, 500, 1000]), rand(0,200), `https://merchant${i}.ng/thank-you`, TENANT_ID]);
    }
    console.log('  → 20 payment_links');

    // ─── TEAM MEMBERS ──────────────────────────────────────────────────────────
    console.log('Seeding team_members...');
    const teamRoles = ['admin','developer','viewer'];
    const teamStatuses = ['active','active','active','invited','disabled'];
    for (let i = 0; i < 25; i++) {
      const name = pick(NIGERIAN_NAMES);
      const mId = pick(MERCHANT_IDS);
      await client.query(`
        INSERT INTO team_members (merchant_id, email, name, role, status, joined_at, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING`,
        [mId, `team_${mId}_${i}@paygate.ng`, name, pick(teamRoles), pick(teamStatuses), daysAgo(rand(1,365)), TENANT_ID]);
    }
    console.log('  → 25 team_members');

    // ─── DISPUTES ──────────────────────────────────────────────────────────────
    console.log('Seeding disputes...');
    const disputeStatuses = ['open','under_review','resolved_merchant','resolved_customer','closed'];
    const disputeReasons = ['unauthorized_transaction','duplicate_charge','service_not_rendered','product_not_received','incorrect_amount'];
    for (let i = 0; i < 30; i++) {
      await client.query(`
        INSERT INTO disputes (id, merchant_id, reference, amount, currency, status, reason, due_date, tenant_id)
        VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('dis'), pick(MERCHANT_IDS), uid('DIS'), rand(10000,2000000),
          pick(disputeStatuses), pick(disputeReasons), daysAgo(rand(-14, 30)), TENANT_ID]);
    }
    console.log('  → 30 disputes');

    // ─── FRAUD ALERTS ──────────────────────────────────────────────────────────
    console.log('Seeding fraud_alerts...');
    const alertTypes = ['velocity_breach','unusual_location','device_fingerprint','card_testing','account_takeover','identity_mismatch'];
    const alertStatuses = ['open','investigating','resolved','false_positive'];
    for (let i = 0; i < 40; i++) {
      await client.query(`
        INSERT INTO fraud_alerts (id, merchant_id, alert_type, risk_score, status, description, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [uid('fa'), pick(MERCHANT_IDS), pick(alertTypes), rand(40,99),
          pick(alertStatuses), `Suspicious activity detected: ${pick(alertTypes)} pattern`, TENANT_ID]);
    }
    console.log('  → 40 fraud_alerts');

    // ─── KYC SUBMISSIONS ───────────────────────────────────────────────────────
    console.log('Seeding kyc_submissions...');
    const docTypes = ['national_id','passport','cac_certificate','bank_statement','utility_bill','drivers_license'];
    const kycStatuses = ['pending','approved','approved','approved','rejected','under_review'];
    // Get customer IDs
    const custRes = await client.query('SELECT id FROM customers LIMIT 20');
    const custIds = custRes.rows.map(r => r.id);
    for (let i = 0; i < 30; i++) {
      await client.query(`
        INSERT INTO kyc_submissions (id, merchant_id, customer_id, doc_type, status, document_url, reviewed_at, tenant_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('kyc'), pick(MERCHANT_IDS), custIds[i % custIds.length] || null,
          pick(docTypes), pick(kycStatuses),
          `https://cdn.paygate.ng/kyc/${uid('doc')}.jpg`, daysAgo(rand(1,60)), TENANT_ID]);
    }
    console.log('  → 30 kyc_submissions');

    // ─── POS TERMINALS ─────────────────────────────────────────────────────────
    console.log('Seeding pos_terminals...');
    const posModels = ['soundbox_basic','pos_lite','pos_smart','ussd_terminal'];
    const posStatuses = ['active','active','active','inactive','maintenance'];
    for (let i = 0; i < 30; i++) {
      const txCount = rand(100, 5000);
      await client.query(`
        INSERT INTO pos_terminals (id, merchant_id, tenant_id, serial_number, model, label, location, status, last_heartbeat_at, firmware_version, total_transactions, total_volume_kobo)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [uid('pos'), pick(MERCHANT_IDS), TENANT_ID, `SN${rand(100000,999999)}`,
          pick(posModels), `Terminal ${i+1}`, `${pick(LGAS)}, ${pick(STATES)}`,
          pick(posStatuses), hoursAgo(rand(0,72)), `v${rand(1,3)}.${rand(0,9)}.${rand(0,9)}`,
          txCount, txCount * rand(5000, 50000)]);
    }
    console.log('  → 30 pos_terminals');

    // ─── SUBSCRIPTIONS ─────────────────────────────────────────────────────────
    console.log('Seeding subscriptions...');
    const subStatuses = ['active','active','active','paused','cancelled','completed'];
    const intervals = ['daily','weekly','monthly','monthly','quarterly','annually'];
    const planNames = ['Basic Plan','Standard Plan','Premium Plan','Enterprise Plan','Custom Plan'];
    for (let i = 0; i < 40; i++) {
      const name = pick(NIGERIAN_NAMES);
      const bank = pick(NIGERIAN_BANKS);
      const startAt = daysAgo(rand(30, 365));
      const nextRun = new Date(startAt);
      nextRun.setMonth(nextRun.getMonth() + 1);
      await client.query(`
        INSERT INTO subscriptions (id, merchant_id, tenant_id, customer_email, customer_name, customer_phone, plan_name, amount_kobo, currency, interval, completed_cycles, start_at, next_run_at, status, bank_code, account_number, account_name)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NGN',$9,$10,$11,$12,$13,$14,$15,$16)
        ON CONFLICT DO NOTHING
      `, [uid('sub'), pick(MERCHANT_IDS), TENANT_ID,
          `${name.toLowerCase().replace(' ','.')}@email.com`, name,
          `080${rand(10000000,99999999)}`, pick(planNames), rand(500000,5000000),
          pick(intervals), rand(0,24), startAt, nextRun, pick(subStatuses),
          bank.code, `0${rand(10000000,99999999)}`, name]);
    }
    console.log('  → 40 subscriptions');

    // ─── MERCHANT LOANS ────────────────────────────────────────────────────────
    console.log('Seeding merchant_loans...');
    const loanStatuses = ['active','active','pending_review','repaid','defaulted'];
    const purposes = ['inventory','equipment','working_capital','expansion','marketing'];
    for (let i = 0; i < 20; i++) {
      const requested = rand(500000, 50000000);
      const approved = Math.floor(requested * 0.9);
      await client.query(`
        INSERT INTO merchant_loans (loan_id, merchant_id, status, requested_kobo, approved_kobo, amount_kobo, outstanding_kobo, credit_score, risk_band, rate_annual_pct, term_days, purpose_code, disbursed_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
        ON CONFLICT DO NOTHING
      `, [uid('loan'), pick(MERCHANT_IDS), pick(loanStatuses), requested, approved, approved,
          Math.floor(approved * rand(10,90) / 100), rand(550,850), pick(['A','B','C','D']),
          (rand(15,35) / 10).toFixed(1), pick([90,180,365]), pick(purposes), daysAgo(rand(1,180))]);
    }
    console.log('  → 20 merchant_loans');

    // ─── INVOICES ──────────────────────────────────────────────────────────────
    console.log('Seeding invoices...');
    const invoiceStatuses = ['paid','paid','sent','draft','overdue'];
    for (let i = 0; i < 40; i++) {
      const name = pick(NIGERIAN_NAMES);
      const subtotal = rand(100000, 5000000);
      const tax = Math.floor(subtotal * 0.075);
      const dueDate = new Date(); dueDate.setDate(dueDate.getDate() + rand(-30, 30));
      await client.query(`
        INSERT INTO invoices (invoice_id, merchant_id, customer_email, customer_name, line_items, subtotal_kobo, tax_kobo, total_kobo, currency, status, due_date, paid_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NGN',$9,$10,$11)
        ON CONFLICT DO NOTHING
      `, [uid('inv'), pick(MERCHANT_IDS), `${name.toLowerCase().replace(' ','.')}@client.ng`, name,
          JSON.stringify([{description:'Professional Services',quantity:1,unit_price:subtotal,total:subtotal}]),
          subtotal, tax, subtotal + tax, pick(invoiceStatuses),
          dueDate.toISOString().split('T')[0], i < 20 ? daysAgo(rand(1,30)) : null]);
    }
    console.log('  → 40 invoices');

    // ─── FX RATES ──────────────────────────────────────────────────────────────
    console.log('Seeding fx_rates...');
    const fxPairs = [
      ['NGN','USD','0.00065'],['NGN','GBP','0.00051'],['NGN','EUR','0.00060'],
      ['NGN','CAD','0.00089'],['NGN','AUD','0.00099'],['NGN','ZAR','0.012'],
      ['USD','NGN','1540.00'],['GBP','NGN','1960.00'],['EUR','NGN','1680.00'],
      ['USD','GBP','0.785'],['USD','EUR','0.920'],['USD','CAD','1.365']
    ];
    for (const [base, target, rate] of fxPairs) {
      await client.query(`
        INSERT INTO fx_rates (base_currency, target_currency, rate, source, fetched_at)
        VALUES ($1,$2,$3,'cbn-api',NOW())
      `, [base, target, rate]);
    }
    console.log('  → 12 fx_rates');

    // ─── INVENTORY ITEMS ───────────────────────────────────────────────────────
    console.log('Seeding inventory_items...');
    const items = [
      ['POS Paper Roll','roll',500,50,2500],['Thermal Receipt Paper','pack',200,30,4500],
      ['Card Reader','unit',45,5,35000],['Cash Drawer','unit',12,2,85000],
      ['Barcode Scanner','unit',8,2,45000],['Label Printer','unit',5,1,125000],
      ['USB Hub','unit',20,5,8500],['Power Bank 20000mAh','unit',30,10,25000],
      ['HDMI Cable','unit',50,10,3500],['Ethernet Cable 5m','unit',100,20,2500]
    ];
    const invIds = [];
    for (const [name, unit, stock, reorder, cost] of items) {
      for (const mid of MERCHANT_IDS.slice(0,3)) {
        const res = await client.query(`
          INSERT INTO inventory_items (id, merchant_id, name, unit, current_stock, reorder_level, cost_per_unit)
          VALUES ($1,$2,$3,$4,$5,$6,$7)
          ON CONFLICT DO NOTHING RETURNING id
        `, [uid('inv'), mid, name, unit, stock + rand(-10,50), reorder, cost]);
        if (res.rows[0]) invIds.push({id: res.rows[0].id, mid, name});
      }
    }
    console.log(`  → ${invIds.length} inventory_items`);

    // ─── PURCHASE ORDERS ───────────────────────────────────────────────────────
    console.log('Seeding purchase_orders...');
    const poStatuses = ['pending','approved','received','cancelled'];
    const vendors = ['TechSupply NG','POS World','Digital Solutions Ltd','Office Mart','Gadget Hub'];
    for (let i = 0; i < 25; i++) {
      const inv = pick(invIds);
      const qty = rand(10, 200);
      const unitCost = rand(2000, 50000);
      await client.query(`
        INSERT INTO purchase_orders (id, merchant_id, inventory_item_id, item_name, vendor_name, quantity, unit, unit_cost_kobo, total_cost_kobo, status, created_by)
        VALUES ($1,$2,$3,$4,$5,$6,'unit',$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
      `, [uid('po'), inv.mid, inv.id, inv.name, pick(vendors), qty, unitCost, qty * unitCost, pick(poStatuses), 'admin']);
    }
    console.log('  → 25 purchase_orders');

    // ─── STAFF MEMBERS ─────────────────────────────────────────────────────────
    console.log('Seeding staff_members...');
    const staffRoles = ['manager','cashier','server','security','cleaner','supervisor'];
    const staffIds = [];
    for (let i = 0; i < 30; i++) {
      const name = pick(NIGERIAN_NAMES);
      const bank = pick(NIGERIAN_BANKS);
      const mid = pick(MERCHANT_IDS);
      const res = await client.query(`
        INSERT INTO staff_members (id, merchant_id, name, role, hourly_rate_kobo, bank_code, account_number, active)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING RETURNING id
      `, [uid('stf'), mid, name, pick(staffRoles), rand(50000,200000), bank.code, `0${rand(10000000,99999999)}`, i < 25]);
      if (res.rows[0]) staffIds.push({id: res.rows[0].id, mid});
    }
    console.log(`  → ${staffIds.length} staff_members`);

    // ─── PAYROLL RUNS ──────────────────────────────────────────────────────────
    console.log('Seeding payroll_runs...');
    const payrollStatuses = ['completed','completed','processing','draft'];
    for (let i = 0; i < 12; i++) {
      const periodStart = daysAgo(30 * (i + 1));
      const periodEnd = daysAgo(30 * i + 1);
      await client.query(`
        INSERT INTO payroll_runs (id, merchant_id, period_start, period_end, status, total_kobo, staff_count)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [uid('pr'), pick(MERCHANT_IDS), periodStart, periodEnd, pick(payrollStatuses),
          rand(5000000, 50000000), rand(10, 50)]);
    }
    console.log('  → 12 payroll_runs');

    // ─── MOBILE MONEY RECON ────────────────────────────────────────────────────
    console.log('Seeding mobile_money_recon...');
    const mmProviders = ['mtn_momo','airtel_money','glo_xchange','9mobile_payit','opay','palmpay'];
    const mmStatuses = ['matched','matched','pending','unmatched'];
    for (let i = 0; i < 50; i++) {
      await client.query(`
        INSERT INTO mobile_money_recon (id, merchant_id, provider, provider_ref, amount, currency, status, reconciled_at, tenant_id)
        VALUES ($1,$2,$3,$4,$5,'NGN',$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('mmr'), pick(MERCHANT_IDS), pick(mmProviders), uid('MMREF'), rand(5000, 500000),
          pick(mmStatuses), daysAgo(rand(0,30)), TENANT_ID]);
    }
    console.log('  → 50 mobile_money_recon');

    // ─── RECONCILIATION ALERTS ─────────────────────────────────────────────────
    console.log('Seeding reconciliation_alerts...');
    for (let i = 0; i < 15; i++) {
      const pg_bal = rand(10000000, 100000000);
      const tb_bal = pg_bal + rand(-500000, 500000);
      await client.query(`
        INSERT INTO reconciliation_alerts (id, merchant_id, currency, pg_balance, tb_balance, delta, status, notes)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('ra'), pick(MERCHANT_IDS), pick(['NGN','USD']), pg_bal, tb_bal, Math.abs(pg_bal - tb_bal),
          pick(['open','resolved']), 'Auto-detected balance discrepancy']);
    }
    console.log('  → 15 reconciliation_alerts');

    // ─── MERCHANT NOTIFICATIONS ────────────────────────────────────────────────
    console.log('Seeding merchant_notifications...');
    const notifTypes = ['payment_received','payout_completed','dispute_opened','kyc_approved','fraud_alert','low_balance','api_key_expiry'];
    const notifTitles = {
      payment_received: 'Payment Received',
      payout_completed: 'Payout Completed',
      dispute_opened: 'New Dispute Opened',
      kyc_approved: 'KYC Verification Approved',
      fraud_alert: 'Fraud Alert Detected',
      low_balance: 'Low Wallet Balance',
      api_key_expiry: 'API Key Expiring Soon'
    };
    for (let i = 0; i < 60; i++) {
      const type = pick(notifTypes);
      await client.query(`
        INSERT INTO merchant_notifications (merchant_id, type, title, body, is_read)
        VALUES ($1,$2,$3,$4,$5)
      `, [pick(MERCHANT_IDS), type, notifTitles[type],
          `Your ${type.replace(/_/g,' ')} notification - ${new Date().toLocaleDateString()}`,
          i < 40]);
    }
    console.log('  → 60 merchant_notifications');

    // ─── AUDIT EVENTS ──────────────────────────────────────────────────────────
    console.log('Seeding audit_events...');
    const auditActions = ['login','logout','api_key_created','payout_initiated','settings_updated','team_member_added','webhook_created','dispute_responded'];
    for (let i = 0; i < 80; i++) {
      const name = pick(NIGERIAN_NAMES);
      await client.query(`
        INSERT INTO audit_events (merchant_id, actor_id, actor_name, actor_email, action, resource, resource_id, ip_address)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      `, [pick(MERCHANT_IDS), `user_${rand(1,10)}`, name,
          `${name.toLowerCase().replace(' ','.')}@merchant.ng`,
          pick(auditActions), pick(['transaction','payout','api_key','webhook','team_member']),
          uid('res'), `${rand(102,198)}.${rand(1,254)}.${rand(1,254)}.${rand(1,254)}`]);
    }
    console.log('  → 80 audit_events');

    // ─── BNPL PLANS ────────────────────────────────────────────────────────────
    console.log('Seeding bnpl_plans...');
    const bnplPlanData = [
      ['3-Month Plan',3,0,5000,500000],
      ['6-Month Plan',6,5,50000,2000000],
      ['12-Month Plan',12,10,100000,5000000],
      ['24-Month Plan',24,15,200000,10000000]
    ];
    for (const [name, installments, rate, min, max] of bnplPlanData) {
      for (const mid of MERCHANT_IDS.slice(0,3)) {
        await client.query(`
          INSERT INTO bnpl_plans (id, merchant_id, name, installments, interest_rate, min_amount, max_amount, currency, active)
          VALUES ($1,$2,$3,$4,$5,$6,$7,'NGN',true)
          ON CONFLICT DO NOTHING
        `, [uid('bp'), mid, name, installments, rate, min, max]);
      }
    }
    console.log('  → 12 bnpl_plans');

    // ─── BNPL LOANS ────────────────────────────────────────────────────────────
    console.log('Seeding bnpl_loans...');
    const bnplStatuses = ['active','active','completed','defaulted','pending'];
    for (let i = 0; i < 30; i++) {
      const principal = rand(50000, 2000000);
      const installments = pick([3,6,12]);
      await client.query(`
        INSERT INTO bnpl_loans (id, merchant_id, customer_id, principal_amount, currency, installments, installment_amount, interest_rate, status, next_payment_at, tenant_id)
        VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
      `, [uid('bl'), pick(MERCHANT_IDS), custIds[i % custIds.length] || null,
          principal, installments, Math.floor(principal / installments), rand(0,15),
          pick(bnplStatuses), daysAgo(rand(-30, 30)), TENANT_ID]);
    }
    console.log('  → 30 bnpl_loans');

    // ─── CARBON CREDITS ────────────────────────────────────────────────────────
    console.log('Seeding carbon_credits...');
    const ccProjects = [
      ['PROJ_001','Borno Solar Farm','2023','VCS'],
      ['PROJ_002','Lagos Mangrove Restoration','2022','Gold Standard'],
      ['PROJ_003','Kano Wind Energy','2024','VCS'],
      ['PROJ_004','Niger Delta Cookstoves','2023','Gold Standard'],
      ['PROJ_005','Abuja Urban Forest','2024','VCS']
    ];
    const ccStatuses = ['active','active','retired','pending'];
    for (let i = 0; i < 25; i++) {
      const proj = pick(ccProjects);
      await client.query(`
        INSERT INTO carbon_credits (credit_id, merchant_id, project_id, project_name, tonnes, price_per_tonne_kobo, total_kobo, vintage, standard, status, retired_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)
        ON CONFLICT DO NOTHING
      `, [uid('cc'), pick(MERCHANT_IDS), proj[0], proj[1],
          (rand(10, 500) / 10).toFixed(1), rand(500000, 2000000),
          rand(5000000, 100000000), proj[2], proj[3], pick(ccStatuses),
          i < 5 ? daysAgo(rand(1,90)) : null]);
    }
    console.log('  → 25 carbon_credits');

    // ─── ESCROW CONTRACTS ──────────────────────────────────────────────────────
    console.log('Seeding escrow_contracts...');
    const escrowStatuses = ['funded','funded','released','disputed','expired'];
    for (let i = 0; i < 20; i++) {
      const buyer = pick(MERCHANT_IDS);
      const seller = pick(MERCHANT_IDS.filter(m => m !== buyer));
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + rand(7, 90));
      await client.query(`
        INSERT INTO escrow_contracts (escrow_id, buyer_merchant_id, seller_merchant_id, amount_kobo, currency, conditions, status, expires_at)
        VALUES ($1,$2,$3,$4,'NGN',$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [uid('esc'), buyer, seller, rand(100000, 10000000),
          JSON.stringify({delivery_confirmed: false, inspection_period_days: 7}),
          pick(escrowStatuses), expiresAt]);
    }
    console.log('  → 20 escrow_contracts');

    // ─── USDC PAYOUTS ──────────────────────────────────────────────────────────
    console.log('Seeding usdc_payouts...');
    const usdcStatuses = ['completed','completed','pending','processing','failed'];
    const solanaWallets = [
      '7xKXtg2CW87d97TXJSDpbD5jBkheTqA83TZRuJosgAsU',
      '9WzDXwBbmkg8ZTbNMqUxvQRAyrZzDsGYdLVL9zYtAWWM',
      'HN7cABqLq46Es1jh92dQQisAq662SmxELLLsHHe4YWrH'
    ];
    for (let i = 0; i < 20; i++) {
      const lamports = rand(1000000, 100000000);
      await client.query(`
        INSERT INTO usdc_payouts (id, merchant_id, recipient_wallet, amount_lamports, status, fraud_score, reference, network)
        VALUES ($1,$2,$3,$4,$5,$6,$7,'mainnet')
        ON CONFLICT DO NOTHING
      `, [uid('usdc'), pick(MERCHANT_IDS), pick(solanaWallets), lamports,
          pick(usdcStatuses), rand(0,30), uid('USDC')]);
    }
    console.log('  → 20 usdc_payouts');

    // ─── TAX WITHHOLDING RECORDS ───────────────────────────────────────────────
    console.log('Seeding tax_withholding_records...');
    const taxTypes = ['WHT','VAT','CIT'];
    const taxStatuses = ['remitted','remitted','pending','overdue'];
    for (let i = 0; i < 30; i++) {
      const gross = rand(500000, 10000000);
      const rate = pick(['7.5','5.0','10.0','2.5']);
      const tax = Math.floor(gross * parseFloat(rate) / 100);
      const month = String(rand(1,12)).padStart(2,'0');
      const year = pick([2024,2025,2026]);
      await client.query(`
        INSERT INTO tax_withholding_records (id, merchant_id, gross_amount_kobo, tax_amount_kobo, net_amount_kobo, tax_type, tax_rate_pct, period, status, remitted_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
        ON CONFLICT DO NOTHING
      `, [uid('twr'), pick(MERCHANT_IDS), gross, tax, gross - tax,
          pick(taxTypes), rate, `${year}-${month}`, pick(taxStatuses),
          i < 20 ? daysAgo(rand(1,60)) : null]);
    }
    console.log('  → 30 tax_withholding_records');

    // ─── COMPLIANCE REPORTS ────────────────────────────────────────────────────
    console.log('Seeding compliance_reports...');
    const reportTypes = ['AML_SCREENING','KYC_REVIEW','PEP_CHECK','SANCTIONS_SCAN','TRANSACTION_MONITORING'];
    const riskLevels = ['low','low','medium','high'];
    for (let i = 0; i < 20; i++) {
      await client.query(`
        INSERT INTO compliance_reports (report_id, merchant_id, report_type, status, risk_level, findings, generated_at)
        VALUES ($1,$2,$3,'completed',$4,$5,$6)
        ON CONFLICT DO NOTHING
      `, [uid('cr'), pick(MERCHANT_IDS), pick(reportTypes), pick(riskLevels),
          `No critical findings. ${rand(0,3)} minor observations noted.`, daysAgo(rand(1,90))]);
    }
    console.log('  → 20 compliance_reports');

    // ─── BILL PAYMENTS ─────────────────────────────────────────────────────────
    console.log('Seeding bill_payments...');
    const billCategories = ['electricity','airtime','data','cable_tv','water','insurance','betting'];
    const billers = {
      electricity: ['EKEDC','IKEDC','AEDC','PHEDC'],
      airtime: ['MTN','Airtel','Glo','9mobile'],
      data: ['MTN Data','Airtel Data','Glo Data'],
      cable_tv: ['DSTV','GOtv','StarTimes'],
      water: ['Lagos Water','Abuja Water'],
      insurance: ['AIICO','Leadway','AXA Mansard'],
      betting: ['Bet9ja','SportyBet','1xBet']
    };
    // Seed consumer_wallets first (needed for bill_payments FK)
    const cwRes = await client.query('SELECT id FROM consumer_wallets LIMIT 5');
    let cwIds = cwRes.rows.map(r => r.id);
    if (cwIds.length === 0) {
      for (let i = 0; i < 5; i++) {
        const cwId = uid('cw');
        await client.query(`INSERT INTO consumer_wallets (id, user_id, currency, balance_kobo) VALUES ($1, 1, 'NGN', $2) ON CONFLICT DO NOTHING`, [cwId, rand(10000, 5000000)]);
        cwIds.push(cwId);
      }
    }
    for (let i = 0; i < 50; i++) {
      const cat = pick(billCategories);
      const biller = pick(billers[cat]);
      await client.query(`
        INSERT INTO bill_payments (id, user_id, wallet_id, category, biller_code, biller_name, customer_reference, amount_kobo, currency, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'NGN',$9)
        ON CONFLICT DO NOTHING
      `, [uid('bp'), 1, cwIds[i % cwIds.length], cat,
          `${biller.toUpperCase().replace(' ','_')}_001`, biller,
          `CUST${rand(100000,999999)}`, rand(5000, 500000), pick(['completed','completed','pending','failed'])]);
    }
    console.log('  → 50 bill_payments');

    // ─── NFC DEVICES ───────────────────────────────────────────────────────────
    console.log('Seeding nfc_devices...');
    const nfcTypes = ['android','ios','dedicated_reader'];
    const nfcStatuses = ['active','active','inactive'];
    for (let i = 0; i < 20; i++) {
      const txCount = rand(50, 2000);
      await client.query(`
        INSERT INTO nfc_devices (id, merchant_id, device_id, device_name, device_type, status, last_seen, total_transactions, total_volume)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [uid('nfc'), pick(MERCHANT_IDS), uid('DEV'), `NFC Device ${i+1}`,
          pick(nfcTypes), pick(nfcStatuses), hoursAgo(rand(0,168)),
          txCount, txCount * rand(5000,100000)]);
    }
    console.log('  → 20 nfc_devices');

    // ─── MULTI-CURRENCY LEDGER ─────────────────────────────────────────────────
    console.log('Seeding multi_currency_ledger_accounts and entries...');
    const mcAcctRes = await client.query('SELECT id FROM multi_currency_ledger_accounts LIMIT 10');
    let mcAcctIds = mcAcctRes.rows.map(r => r.id);
    if (mcAcctIds.length === 0) {
      // Create accounts first
      for (const mid of MERCHANT_IDS.slice(0,3)) {
        for (const currency of ['NGN','USD','GBP','EUR']) {
          const res = await client.query(`
            INSERT INTO multi_currency_ledger_accounts (id, merchant_id, currency, balance, status)
            VALUES ($1,$2,$3,$4,'active')
            ON CONFLICT DO NOTHING RETURNING id
          `, [uid('mcla'), mid, currency, rand(100000, 50000000)]);
          if (res.rows[0]) mcAcctIds.push(res.rows[0].id);
        }
      }
    }
    for (let i = 0; i < 50; i++) {
      const acctId = pick(mcAcctIds);
      await client.query(`
        INSERT INTO multi_currency_ledger_entries (id, merchant_id, account_id, type, amount, currency, description, reference)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('mcle'), pick(MERCHANT_IDS), acctId, pick(['credit','debit']),
          rand(10000, 5000000), pick(['NGN','USD','GBP','EUR']),
          `FX ${pick(['conversion','settlement','transfer'])}`, uid('MCREF')]);
    }
    console.log(`  → ${mcAcctIds.length} accounts + 50 entries`);

    // ─── AGENT BANKING V4 ──────────────────────────────────────────────────────
    console.log('Seeding agent_banking_v4_agents...');
    const agentTiers = ['standard','premium','super'];
    const agentStatuses = ['active','active','active','suspended'];
    for (let i = 0; i < 30; i++) {
      const name = pick(NIGERIAN_NAMES);
      const txCount = rand(100, 5000);
      await client.query(`
        INSERT INTO agent_banking_v4_agents (id, merchant_id, agent_code, agent_name, phone, state, lga, status, tier, float_balance, daily_limit, total_transactions)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
        ON CONFLICT DO NOTHING
      `, [uid('agt'), pick(MERCHANT_IDS), `AGT${rand(10000,99999)}`, name,
          `080${rand(10000000,99999999)}`, pick(STATES), pick(LGAS),
          pick(agentStatuses), pick(agentTiers), rand(50000,5000000),
          rand(500000,5000000), txCount]);
    }
    console.log('  → 30 agent_banking_v4_agents');

    // ─── OPEN BANKING CONSENTS V2 ──────────────────────────────────────────────
    console.log('Seeding open_banking_consents_v2...');
    const obStatuses = ['active','active','revoked','expired'];
    for (let i = 0; i < 20; i++) {
      const bank = pick(NIGERIAN_BANKS);
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + rand(30, 365));
      await client.query(`
        INSERT INTO open_banking_consents_v2 (id, merchant_id, bank_code, bank_name, scopes, status, consent_token, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('obc'), pick(MERCHANT_IDS), bank.code, bank.name,
          pick(['accounts,transactions','accounts,transactions,payments','accounts']),
          pick(obStatuses), uid('consent_tok'), expiresAt]);
    }
    console.log('  → 20 open_banking_consents_v2');

    // ─── NFT BADGES ────────────────────────────────────────────────────────────
    console.log('Seeding nft_badges...');
    const badgeTypes = ['top_merchant','volume_milestone','compliance_star','early_adopter','payment_champion','fraud_fighter'];
    const badgeStatuses = ['minted','minted','minting','failed'];
    for (let i = 0; i < 20; i++) {
      const type = pick(badgeTypes);
      await client.query(`
        INSERT INTO nft_badges (badge_id, recipient_id, recipient_type, badge_type, badge_name, metadata, mint_tx_hash, network, status, minted_at)
        VALUES ($1,$2,'merchant',$3,$4,$5,$6,'solana',$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('nft'), pick(MERCHANT_IDS), type,
          type.replace(/_/g,' ').replace(/\b\w/g, c => c.toUpperCase()),
          JSON.stringify({level: rand(1,5), points: rand(100,10000)}),
          i < 15 ? `${uid('tx')}...${uid('sig')}` : null,
          pick(badgeStatuses), i < 15 ? daysAgo(rand(1,90)) : null]);
    }
    console.log('  → 20 nft_badges');

    // ─── PORTAL SUBSCRIPTIONS ──────────────────────────────────────────────────
    console.log('Seeding portal_subscriptions...');
    const portalPlans = ['starter','growth','enterprise'];
    const portalStatuses = ['active','active','trialing','cancelled'];
    for (const mid of MERCHANT_IDS) {
      await client.query(`
        INSERT INTO portal_subscriptions (id, merchant_id, plan, status, current_period_start, current_period_end, stripe_subscription_id)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT DO NOTHING
      `, [uid('ps'), mid, pick(portalPlans), pick(portalStatuses),
          daysAgo(30), daysAgo(-30), `sub_${uid('stripe')}`]);
    }
    console.log('  → 5 portal_subscriptions');

    // ─── PAYROLL V3 EMPLOYEES ──────────────────────────────────────────────────
    console.log('Seeding payroll_v3_employees...');
    const departments = ['Engineering','Finance','Operations','Sales','Customer Support','Compliance'];
    const payrollEmpIds = [];
    for (let i = 0; i < 30; i++) {
      const name = pick(NIGERIAN_NAMES);
      const bank = pick(NIGERIAN_BANKS);
      const mid = pick(MERCHANT_IDS);
      const res = await client.query(`
        INSERT INTO payroll_v3_employees (id, merchant_id, employee_id, full_name, email, department, gross_salary, bank_code, account_number, tax_pin, status)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'active')
        ON CONFLICT DO NOTHING RETURNING id
      `, [uid('emp'), mid, `EMP${rand(10000,99999)}`, name, `${name.toLowerCase().replace(' ','.')}@company.ng`,
          pick(departments), rand(1000000, 10000000), bank.code, `0${rand(10000000,99999999)}`,
          `TIN${rand(100000000,999999999)}`]);
      if (res.rows[0]) payrollEmpIds.push({id: res.rows[0].id, mid});
    }
    console.log(`  → ${payrollEmpIds.length} payroll_v3_employees`);

    // ─── PAYROLL V3 RUNS ───────────────────────────────────────────────────────
    console.log('Seeding payroll_v3_runs...');
    for (let i = 0; i < 6; i++) {
      const periodStart = daysAgo(30 * (i + 1));
      const periodEnd = daysAgo(30 * i + 1);
      await client.query(`
        INSERT INTO payroll_v3_runs (id, merchant_id, run_name, period, status, total_gross, total_deductions, total_net, total_employees)
        VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [uid('pvr'), pick(MERCHANT_IDS), `Payroll ${periodStart.toLocaleString('default',{month:'long'})} ${periodStart.getFullYear()}`,
          `${periodStart.getFullYear()}-${String(periodStart.getMonth()+1).padStart(2,'0')}`,
          i === 0 ? 'processing' : 'completed',
          rand(20000000,100000000), rand(2000000,10000000), rand(15000000,85000000), rand(10,50)]);
    }
    console.log('  → 6 payroll_v3_runs');

    // ─── CARBON CREDITS V2 ─────────────────────────────────────────────────────
    console.log('Seeding carbon_credits_v2...');
    for (let i = 0; i < 15; i++) {
      const proj = pick(ccProjects);
      await client.query(`
        INSERT INTO carbon_credits_v2 (id, merchant_id, project_name, project_type, country, vintage_year, quantity, price_per_tonne, status, certification_body)
        VALUES ($1,$2,$3,$4,'NG',$5,$6,$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [uid('ccv2'), pick(MERCHANT_IDS), proj[1],
          pick(['reforestation','solar','wind','cookstoves','mangrove']),
          parseInt(proj[2]), rand(10, 500), rand(500000, 2000000),
          pick(['available','retired','pending']), proj[3]]);
    }
    console.log('  → 15 carbon_credits_v2');

    // ─── ESCROW CONTRACTS V2 ───────────────────────────────────────────────────
    console.log('Seeding escrow_contracts_v2...');
    for (let i = 0; i < 15; i++) {
      const buyer = pick(MERCHANT_IDS);
      const seller = pick(MERCHANT_IDS.filter(m => m !== buyer));
      const expiresAt = new Date(); expiresAt.setDate(expiresAt.getDate() + rand(7, 90));
      await client.query(`
        INSERT INTO escrow_contracts_v2 (id, merchant_id, buyer_id, seller_id, title, amount, currency, status, release_conditions, expires_at)
        VALUES ($1,$2,$3,$4,$5,$6,'NGN',$7,$8,$9)
        ON CONFLICT DO NOTHING
      `, [uid('escv2'), buyer, buyer, seller,
          pick(['Software License','Goods Delivery','Service Contract','Equipment Purchase','Consulting Agreement']),
          rand(200000, 20000000), pick(['pending','funded','released','disputed']),
          'Delivery confirmed by buyer', expiresAt]);
    }
    console.log('  → 15 escrow_contracts_v2');

    // ─── OPEN BANKING ACCOUNTS V2 ──────────────────────────────────────────────
    console.log('Seeding open_banking_accounts_v2...');
    const obConsentRes = await client.query('SELECT id FROM open_banking_consents_v2 LIMIT 10');
    const obConsentIds = obConsentRes.rows.map(r => r.id);
    for (let i = 0; i < 20; i++) {
      const bank = pick(NIGERIAN_BANKS);
      const name = pick(NIGERIAN_NAMES);
      await client.query(`
        INSERT INTO open_banking_accounts_v2 (id, consent_id, merchant_id, bank_code, account_number, account_type, currency, balance, last_sync_at)
        VALUES ($1,$2,$3,$4,$5,$6,'NGN',$7,$8)
        ON CONFLICT DO NOTHING
      `, [uid('oba'), obConsentIds[i % Math.max(obConsentIds.length,1)] || uid('c'),
          pick(MERCHANT_IDS), bank.code,
          `0${rand(10000000,99999999)}`, pick(['current','savings']),
          rand(100000, 50000000), hoursAgo(rand(1,24))]);
    }
    console.log('  → 20 open_banking_accounts_v2');

    // ─── MULTI-CURRENCY LEDGER ACCOUNTS (if not created above) ────────────────
    // Already handled above

    // ─── KYCS ──────────────────────────────────────────────────────────────────
    // Already seeded above

    // ─── FINAL SUMMARY ─────────────────────────────────────────────────────────
    const tableRes = await client.query(`
      SELECT table_name, 
             (SELECT COUNT(*) FROM information_schema.tables t2 WHERE t2.table_name = t.table_name) as exists
      FROM information_schema.tables t
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name
    `);

    console.log('\n=== SEED COMPLETE ===');
    
    // Count rows in key tables
    const keyTables = ['transactions','customers','wallets','wallet_transactions','payouts','virtual_cards',
      'api_keys','webhooks','payment_links','team_members','disputes','fraud_alerts','kyc_submissions',
      'pos_terminals','subscriptions','merchant_loans','invoices','fx_rates','inventory_items',
      'purchase_orders','staff_members','payroll_runs','mobile_money_recon','reconciliation_alerts',
      'merchant_notifications','audit_events','bnpl_plans','bnpl_loans','carbon_credits','escrow_contracts',
      'usdc_payouts','tax_withholding_records','compliance_reports','bill_payments','nfc_devices',
      'multi_currency_ledger_entries','agent_banking_v4_agents','open_banking_consents_v2','nft_badges',
      'portal_subscriptions','payroll_v3_employees','payroll_v3_runs'];

    for (const tbl of keyTables) {
      try {
        const r = await client.query(`SELECT COUNT(*) FROM ${tbl}`);
        console.log(`  ${tbl}: ${r.rows[0].count} rows`);
      } catch (e) {
        console.log(`  ${tbl}: (error: ${e.message})`);
      }
    }

  } catch (err) {
    console.error('SEED ERROR:', err.message);
    console.error(err.stack);
  } finally {
    await client.end();
  }
}

seed();
