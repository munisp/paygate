/**
 * PayGate Demo Seed Script — Schema-Aware Version
 * Seeds all dashboard-visible tables with realistic demo data.
 * Run: node seed-demo.mjs
 */
import pg from "pg";
const { Pool } = pg;

const pool = new Pool({
  connectionString:
    process.env.PG_DATABASE_URL ??
// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
    "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev",
  max: 5,
});

const q = (sql, params = []) => pool.query(sql, params);

// ── helpers ───────────────────────────────────────────────────────────────────
const rand = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const daysAgo = (n) => new Date(Date.now() - n * 86_400_000);
const hoursAgo = (n) => new Date(Date.now() - n * 3_600_000);
const uid = () => Math.random().toString(36).slice(2, 12);

const CURRENCIES = ["NGN", "KES", "GHS", "USD", "ZAR"];
const NAMES = [
  "Adaeze Okonkwo", "Emeka Nwosu", "Fatima Al-Hassan", "Kwame Mensah",
  "Ngozi Adeyemi", "Seun Adesanya", "Amara Diallo", "Kofi Asante",
  "Chidinma Eze", "Babatunde Okafor", "Aisha Musa", "Yusuf Ibrahim",
  "Blessing Nwachukwu", "Tunde Fashola", "Zainab Suleiman", "Olumide Adekunle",
  "Chiamaka Obi", "Femi Kuti", "Nkechi Agu", "Musa Garba",
];
const BANKS = ["Access Bank", "GTBank", "First Bank", "Zenith Bank", "UBA", "Fidelity Bank"];
const MERCHANT_NAMES = ["PayGate Demo Merchant", "TechShop Lagos", "AfriMart", "QuickBuy NG", "EasyPay Africa"];
const OWNER_ID = 1; // existing user id from users table
const TENANT_ID = "tenant_demo_001";
const MERCHANT_IDS = ["merch_001", "merch_002", "merch_003", "merch_004", "merch_005"];

async function main() {
  console.log("🌱 Starting PayGate demo seed...\n");

  // ── 1. Tenant ──────────────────────────────────────────────────────────────
  console.log("  → tenants");
  await q(`
    INSERT INTO tenants (id, name, slug, plan, status, email, country, created_at, updated_at)
    VALUES ($1, $2, $3, $4, $5, $6, $7, NOW(), NOW())
    ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name, plan = EXCLUDED.plan
  `, [TENANT_ID, "PayGate Demo Corp", "paygate-demo", "enterprise", "active", "admin@paygate-demo.com", "NG"]);

  // ── 2. Merchants ───────────────────────────────────────────────────────────
  console.log("  → merchants");
  for (let i = 0; i < MERCHANT_IDS.length; i++) {
    const mid = MERCHANT_IDS[i];
    await q(`
      INSERT INTO merchants (id, tenant_id, owner_id, business_name, business_type, email, status, is_live, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $9)
      ON CONFLICT (id) DO UPDATE SET business_name = EXCLUDED.business_name, status = EXCLUDED.status
    `, [mid, TENANT_ID, OWNER_ID, MERCHANT_NAMES[i],
        pick(["retail", "ecommerce", "hospitality", "fintech", "logistics"]),
        `merchant${i + 1}@paygate-demo.com`, "active", true,
        daysAgo(rand(30, 365))]);
  }

  // ── 3. Customers ───────────────────────────────────────────────────────────
  console.log("  → customers (50)");
  const customerIds = [];
  for (let i = 0; i < 50; i++) {
    const cid = `cust_${String(i + 1).padStart(4, "0")}`;
    customerIds.push(cid);
    const name = NAMES[i % NAMES.length];
    const email = `${name.toLowerCase().replace(/ /g, ".")}${i}@example.com`;
    await q(`
      INSERT INTO customers (id, tenant_id, merchant_id, name, email, phone, risk_level, total_transactions, total_spend, created_at, updated_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $10)
      ON CONFLICT (id) DO UPDATE SET name = EXCLUDED.name
    `, [cid, TENANT_ID, pick(MERCHANT_IDS), name, email,
        `+234${rand(700, 999)}${rand(1000000, 9999999)}`,
        pick(["low", "low", "low", "medium", "high"]),
        rand(1, 50), rand(5000, 5000000), daysAgo(rand(1, 180))]);
  }

  // ── 4. Transactions (90 days of data) ─────────────────────────────────────
  console.log("  → transactions (500)");
  for (let i = 0; i < 500; i++) {
    const tid = `txn_${uid()}`;
    const daysBack = rand(0, 90);
    const amount = rand(1000, 500000);
    const fee = Math.floor(amount * 0.015);
    const net = amount - fee;
    const custId = pick(customerIds);
    const custName = NAMES[rand(0, NAMES.length - 1)];
    const merchantId = pick(MERCHANT_IDS);
    const status = pick(["completed", "completed", "completed", "failed", "pending"]);
    await q(`
      INSERT INTO transactions (id, tenant_id, merchant_id, reference, amount, currency, status, channel,
        customer_email, customer_name, fee_amount, net_amount, completed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$14)
      ON CONFLICT (id) DO NOTHING
    `, [tid, TENANT_ID, merchantId, `REF-${tid.toUpperCase()}`,
        amount, pick(["NGN", "NGN", "NGN", "KES", "GHS"]),
        status, pick(["card", "card", "bank_transfer", "ussd", "qr", "mobile_money"]),
        `${custName.toLowerCase().replace(/ /g, ".")}@example.com`, custName,
        fee, net,
        status === "completed" ? daysAgo(daysBack) : null,
        daysAgo(daysBack)]);
  }

  // ── 5. Wallets ─────────────────────────────────────────────────────────────
  console.log("  → wallets");
  for (const mid of MERCHANT_IDS) {
    for (const cur of ["NGN", "USD", "KES"]) {
      const wid = `wal_${mid}_${cur}`;
      await q(`
        INSERT INTO wallets (id, tenant_id, merchant_id, currency, balance, ledger_balance, created_at, updated_at)
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        ON CONFLICT (id) DO UPDATE SET balance = EXCLUDED.balance
      `, [wid, TENANT_ID, mid, cur, rand(500000, 50000000), rand(500000, 50000000)]);
    }
  }

  // ── 6. Payouts ─────────────────────────────────────────────────────────────
  console.log("  → payouts (30)");
  for (let i = 0; i < 30; i++) {
    const pid = `pout_${uid()}`;
    const status = pick(["pending", "processing", "completed", "completed", "completed"]);
    await q(`
      INSERT INTO payouts (id, tenant_id, merchant_id, reference, amount, currency, status, bank_code, account_number, account_name, narration, processed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
      ON CONFLICT (id) DO NOTHING
    `, [pid, TENANT_ID, pick(MERCHANT_IDS), `POUT-${pid.toUpperCase()}`,
        rand(50000, 5000000), "NGN", status,
        pick(["044", "058", "011", "057", "033"]),
        `00${rand(10000000, 99999999)}`, pick(NAMES),
        "Merchant settlement payout",
        status === "completed" ? daysAgo(rand(0, 5)) : null,
        daysAgo(rand(0, 30))]);
  }

  // ── 7. Settlements ─────────────────────────────────────────────────────────
  console.log("  → settlements (20)");
  for (let i = 0; i < 20; i++) {
    const sid = `sett_${uid()}`;
    const status = pick(["pending", "processing", "completed", "completed"]);
    await q(`
      INSERT INTO settlements (id, tenant_id, merchant_id, amount, currency, status, settled_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$8)
      ON CONFLICT (id) DO NOTHING
    `, [sid, TENANT_ID, pick(MERCHANT_IDS), rand(100000, 10000000), "NGN", status,
        status === "completed" ? daysAgo(rand(0, 7)) : null,
        daysAgo(rand(0, 10))]);
  }

  // ── 8. Disputes ────────────────────────────────────────────────────────────
  console.log("  → disputes (15)");
  for (let i = 0; i < 15; i++) {
    const did = `disp_${uid()}`;
    await q(`
      INSERT INTO disputes (id, tenant_id, merchant_id, transaction_id, amount, currency, status, reason, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [did, TENANT_ID, pick(MERCHANT_IDS), `txn_${uid()}`,
        rand(5000, 200000), "NGN",
        pick(["open", "open", "under_review", "resolved", "closed"]),
        pick(["Unauthorized transaction", "Item not received", "Duplicate charge", "Product not as described"]),
        daysAgo(rand(0, 30))]);
  }

  // ── 9. Virtual Cards ───────────────────────────────────────────────────────
  console.log("  → virtual_cards (20)");
  for (let i = 0; i < 20; i++) {
    const vcid = `vc_${uid()}`;
    await q(`
      INSERT INTO virtual_cards (id, tenant_id, merchant_id, customer_id, last4, brand, status, currency, balance, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [vcid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        String(rand(1000, 9999)), pick(["visa", "mastercard"]),
        pick(["active", "active", "active", "frozen", "terminated"]),
        "USD", rand(0, 5000), daysAgo(rand(0, 90))]);
  }

  // ── 10. Fraud Alerts ───────────────────────────────────────────────────────
  console.log("  → fraud_alerts (25)");
  for (let i = 0; i < 25; i++) {
    const fid = `fraud_${uid()}`;
    await q(`
      INSERT INTO fraud_alerts (id, tenant_id, merchant_id, transaction_id, alert_type, risk_score, status, details, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [fid, TENANT_ID, pick(MERCHANT_IDS), `txn_${uid()}`,
        pick(["velocity", "geo_anomaly", "device_fingerprint", "card_testing", "account_takeover"]),
        rand(40, 99),
        pick(["open", "open", "reviewing", "resolved", "false_positive"]),
        JSON.stringify({ ip: `192.168.${rand(1,254)}.${rand(1,254)}`, country: pick(["NG","GH","KE","ZA"]) }),
        hoursAgo(rand(0, 72))]);
  }

  // ── 11. FX Rates ───────────────────────────────────────────────────────────
  console.log("  → fx_rates");
  const fxPairs = [
    ["NGN", "USD", 0.00065], ["NGN", "GBP", 0.00052], ["NGN", "EUR", 0.00060],
    ["KES", "USD", 0.0077], ["GHS", "USD", 0.083], ["ZAR", "USD", 0.055],
    ["USD", "NGN", 1540], ["USD", "KES", 130], ["USD", "GHS", 12],
    ["EUR", "NGN", 1680], ["GBP", "NGN", 1950],
  ];
  for (const [from, to, rate] of fxPairs) {
    await q(`
      INSERT INTO fx_rates (id, from_currency, to_currency, rate, source, updated_at)
      VALUES ($1, $2, $3, $4, 'CBN', NOW())
      ON CONFLICT (id) DO UPDATE SET rate = EXCLUDED.rate, updated_at = NOW()
    `, [`fx_${from}_${to}`, from, to, rate]);
  }

  // ── 12. API Keys ───────────────────────────────────────────────────────────
  console.log("  → api_keys");
  for (const mid of MERCHANT_IDS.slice(0, 3)) {
    for (const env of ["live", "test"]) {
      const kid = `key_${mid}_${env}`;
      await q(`
        INSERT INTO api_keys (id, tenant_id, merchant_id, name, key_prefix, key_hash, environment, created_at, updated_at)
        VALUES ($1,$2,$3,$4,$5,$6,$7,NOW(),NOW())
        ON CONFLICT (id) DO NOTHING
      `, [kid, TENANT_ID, mid, `${env === "live" ? "Production" : "Test"} Key`,
          `pk_${env}_${uid()}`,
          `hashed_${uid()}${uid()}`, env]);
    }
  }

  // ── 13. Payment Links ──────────────────────────────────────────────────────
  console.log("  → payment_links (10)");
  for (let i = 0; i < 10; i++) {
    const plid = `pl_${uid()}`;
    await q(`
      INSERT INTO payment_links (id, tenant_id, merchant_id, title, amount, currency, status, slug, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [plid, TENANT_ID, pick(MERCHANT_IDS),
        pick(["Invoice Payment", "Product Purchase", "Service Fee", "Subscription", "Donation"]),
        rand(5000, 500000), "NGN",
        pick(["active", "active", "active", "inactive", "expired"]),
        `pay-${uid().slice(0,8)}`, daysAgo(rand(0, 60))]);
  }

  // ── 14. Subscriptions ─────────────────────────────────────────────────────
  console.log("  → subscriptions (15)");
  for (let i = 0; i < 15; i++) {
    const subid = `sub_${uid()}`;
    await q(`
      INSERT INTO subscriptions (id, tenant_id, merchant_id, customer_id, plan_name, amount, currency, interval, status, current_period_start, current_period_end, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
      ON CONFLICT (id) DO NOTHING
    `, [subid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        pick(["Starter", "Growth", "Enterprise", "Pro", "Basic"]),
        pick([5000, 15000, 50000, 100000, 250000]), "NGN",
        pick(["monthly", "monthly", "yearly", "weekly"]),
        pick(["active", "active", "active", "paused", "cancelled"]),
        daysAgo(rand(1, 30)), daysAgo(-rand(1, 30)), daysAgo(rand(30, 180))]);
  }

  // ── 15. BNPL Loans ─────────────────────────────────────────────────────────
  console.log("  → bnpl_loans (10)");
  for (let i = 0; i < 10; i++) {
    const lid = `bnpl_${uid()}`;
    await q(`
      INSERT INTO bnpl_loans (id, tenant_id, merchant_id, customer_id, amount, currency, status, installments, paid_installments, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [lid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        rand(20000, 500000), "NGN",
        pick(["active", "active", "completed", "defaulted", "pending"]),
        pick([3, 4, 6, 12]), rand(0, 6), daysAgo(rand(0, 90))]);
  }

  // ── 16. POS Terminals ─────────────────────────────────────────────────────
  console.log("  → pos_terminals (12)");
  for (let i = 0; i < 12; i++) {
    const ptid = `pos_${uid()}`;
    await q(`
      INSERT INTO pos_terminals (id, tenant_id, merchant_id, serial_number, model, status, location_name, last_seen_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [ptid, TENANT_ID, pick(MERCHANT_IDS),
        `SN${rand(100000, 999999)}`,
        pick(["PAX_A920", "Ingenico_Move5000", "Verifone_VX520", "Sunmi_P2"]),
        pick(["active", "active", "active", "inactive", "maintenance"]),
        pick(["Lagos HQ", "Abuja Branch", "Port Harcourt", "Kano Office", "Ibadan Store"]),
        hoursAgo(rand(0, 48)), daysAgo(rand(30, 365))]);
  }

  // ── 17. KYC Submissions ────────────────────────────────────────────────────
  console.log("  → kyc_submissions (20)");
  for (let i = 0; i < 20; i++) {
    const kid = `kyc_${uid()}`;
    await q(`
      INSERT INTO kyc_submissions (id, tenant_id, merchant_id, customer_id, doc_type, status, submitted_at, reviewed_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8)
      ON CONFLICT (id) DO NOTHING
    `, [kid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        pick(["national_id", "passport", "drivers_license", "bvn", "nin"]),
        pick(["pending", "under_review", "approved", "approved", "rejected"]),
        daysAgo(rand(0, 30)),
        rand(0, 1) ? daysAgo(rand(0, 10)) : null]);
  }

  // ── 18. Audit Events ───────────────────────────────────────────────────────
  console.log("  → audit_events (30)");
  const auditActions = [
    "user.login", "transaction.created", "payout.approved", "api_key.created",
    "webhook.updated", "dispute.opened", "kyc.submitted", "settings.updated",
    "merchant.onboarded", "fraud_alert.resolved",
  ];
  for (let i = 0; i < 30; i++) {
    const aid = `audit_${uid()}`;
    const name = pick(NAMES);
    await q(`
      INSERT INTO audit_events (id, tenant_id, merchant_id, actor, action, resource_type, resource_id, ip_address, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, [aid, TENANT_ID, pick(MERCHANT_IDS),
        `${name.toLowerCase().replace(/ /g, ".")}@paygate-demo.com`,
        pick(auditActions),
        pick(["transaction", "payout", "user", "api_key", "webhook"]),
        `res_${uid().slice(0,8)}`,
        `41.${rand(1,254)}.${rand(1,254)}.${rand(1,254)}`,
        daysAgo(rand(0, 30))]);
  }

  // ── 19. Merchant Loans ─────────────────────────────────────────────────────
  console.log("  → merchant_loans (5)");
  for (let i = 0; i < 5; i++) {
    const mlid = `loan_${uid()}`;
    await q(`
      INSERT INTO merchant_loans (id, tenant_id, merchant_id, amount, currency, interest_rate, status, disbursed_at, due_date, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [mlid, TENANT_ID, pick(MERCHANT_IDS),
        rand(500000, 10000000), "NGN",
        (rand(8, 24) / 100).toFixed(4),
        pick(["active", "active", "repaid", "overdue"]),
        daysAgo(rand(30, 180)), daysAgo(-rand(30, 180)),
        daysAgo(rand(30, 180))]);
  }

  // ── 20. QR Payments ────────────────────────────────────────────────────────
  console.log("  → qr_payments (20)");
  for (let i = 0; i < 20; i++) {
    const qid = `qr_${uid()}`;
    await q(`
      INSERT INTO qr_payments (id, tenant_id, merchant_id, customer_id, amount, currency, status, qr_code, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [qid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        rand(500, 100000), pick(["NGN", "KES", "GHS"]),
        pick(["completed", "completed", "pending", "expired"]),
        `QR${uid().toUpperCase()}`, daysAgo(rand(0, 30))]);
  }

  // ── 21. Payroll Runs ───────────────────────────────────────────────────────
  console.log("  → payroll_runs (6)");
  for (let i = 0; i < 6; i++) {
    const prid = `pr_${uid()}`;
    const month = new Date();
    month.setMonth(month.getMonth() - i);
    await q(`
      INSERT INTO payroll_runs (id, tenant_id, merchant_id, period_label, total_gross, total_net, employee_count, status, processed_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [prid, TENANT_ID, pick(MERCHANT_IDS),
        month.toLocaleString("default", { month: "long", year: "numeric" }),
        rand(5000000, 50000000), rand(4000000, 45000000), rand(10, 150),
        i === 0 ? "pending" : "completed",
        i === 0 ? null : daysAgo(i * 30 - 5),
        daysAgo(i * 30)]);
  }

  // ── 22. Staff Members ──────────────────────────────────────────────────────
  console.log("  → staff_members (20)");
  for (let i = 0; i < 20; i++) {
    const smid = `staff_${uid()}`;
    const name = NAMES[i % NAMES.length];
    await q(`
      INSERT INTO staff_members (id, tenant_id, merchant_id, name, email, role, department, salary, status, hired_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      ON CONFLICT (id) DO NOTHING
    `, [smid, TENANT_ID, pick(MERCHANT_IDS), name,
        `${name.toLowerCase().replace(/ /g, ".")}${i}@company.com`,
        pick(["engineer", "manager", "analyst", "designer", "support"]),
        pick(["Engineering", "Finance", "Operations", "Sales", "Customer Success"]),
        rand(150000, 800000), "active",
        daysAgo(rand(90, 730)), daysAgo(rand(90, 730))]);
  }

  // ── 23. Inventory Items ────────────────────────────────────────────────────
  console.log("  → inventory_items (15)");
  const products = ["Laptop Stand", "USB-C Hub", "Wireless Mouse", "Keyboard", "Monitor",
    "Headphones", "Webcam", "Desk Lamp", "Power Bank", "Phone Case",
    "Tablet Cover", "HDMI Cable", "SD Card", "Printer Paper", "Toner Cartridge"];
  for (let i = 0; i < 15; i++) {
    const iid = `inv_${uid()}`;
    await q(`
      INSERT INTO inventory_items (id, tenant_id, merchant_id, name, sku, quantity, unit_price, reorder_level, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [iid, TENANT_ID, pick(MERCHANT_IDS), products[i],
        `SKU-${String(i + 1).padStart(4, "0")}`,
        rand(0, 500), rand(1000, 150000), rand(5, 50), daysAgo(rand(30, 365))]);
  }

  // ── 24. Cross-Border Transfers ─────────────────────────────────────────────
  console.log("  → cross_border_transfers (10)");
  for (let i = 0; i < 10; i++) {
    const cbid = `cb_${uid()}`;
    await q(`
      INSERT INTO cross_border_transfers (id, tenant_id, merchant_id, sender_amount, sender_currency, receiver_amount, receiver_currency, status, provider, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [cbid, TENANT_ID, pick(MERCHANT_IDS),
        rand(10000, 1000000), pick(["NGN", "KES", "GHS"]),
        rand(10, 1000), pick(["USD", "GBP", "EUR"]),
        pick(["completed", "completed", "pending", "failed"]),
        pick(["Wise", "Flutterwave", "Paystack", "Remitly"]),
        daysAgo(rand(0, 30))]);
  }

  // ── 25. USDC Payouts ───────────────────────────────────────────────────────
  console.log("  → usdc_payouts (8)");
  for (let i = 0; i < 8; i++) {
    const upid = `usdcp_${uid()}`;
    await q(`
      INSERT INTO usdc_payouts (id, tenant_id, merchant_id, amount_usdc, destination_address, network, status, tx_hash, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [upid, TENANT_ID, pick(MERCHANT_IDS),
        (rand(100, 50000) / 100).toFixed(2),
        `0x${uid()}${uid()}${uid()}`.slice(0, 42),
        pick(["ethereum", "polygon", "solana", "base"]),
        pick(["completed", "completed", "pending", "failed"]),
        `0x${uid()}${uid()}${uid()}${uid()}`.slice(0, 66),
        daysAgo(rand(0, 30))]);
  }

  // ── 26. Reconciliation Alerts ──────────────────────────────────────────────
  console.log("  → reconciliation_alerts (8)");
  for (let i = 0; i < 8; i++) {
    const rid = `recon_${uid()}`;
    await q(`
      INSERT INTO reconciliation_alerts (id, tenant_id, merchant_id, alert_type, amount, currency, status, description, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [rid, TENANT_ID, pick(MERCHANT_IDS),
        pick(["missing_settlement", "duplicate_transaction", "amount_mismatch", "timing_gap"]),
        rand(10000, 500000), "NGN",
        pick(["open", "open", "investigating", "resolved"]),
        pick(["Settlement amount does not match transaction total",
              "Duplicate transaction detected within 5 minutes",
              "Amount mismatch between gateway and bank statement",
              "Settlement delayed beyond SLA"]),
        daysAgo(rand(0, 14))]);
  }

  // ── 27. Merchant Notifications ─────────────────────────────────────────────
  console.log("  → merchant_notifications (15)");
  const notifMessages = [
    { title: "Settlement Processed", body: "₦2,450,000 has been settled to your bank account." },
    { title: "New Dispute Filed", body: "A customer has filed a dispute for transaction TXN-001234." },
    { title: "Fraud Alert", body: "Suspicious activity detected on your account. Please review." },
    { title: "KYC Approved", body: "Your KYC documents have been verified successfully." },
    { title: "Payout Completed", body: "Your payout of ₦500,000 has been processed." },
    { title: "API Key Created", body: "A new live API key was generated from IP 41.58.120.45." },
    { title: "Webhook Failure", body: "3 webhook deliveries failed in the last hour." },
    { title: "Monthly Statement Ready", body: "Your March 2026 statement is now available." },
  ];
  for (let i = 0; i < 15; i++) {
    const nid = `notif_${uid()}`;
    const msg = notifMessages[i % notifMessages.length];
    await q(`
      INSERT INTO merchant_notifications (id, tenant_id, merchant_id, title, body, read, created_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7)
      ON CONFLICT (id) DO NOTHING
    `, [nid, TENANT_ID, pick(MERCHANT_IDS), msg.title, msg.body,
        rand(0, 1) === 1, hoursAgo(rand(0, 72))]);
  }

  // ── 28. Team Members ───────────────────────────────────────────────────────
  console.log("  → team_members (8)");
  for (let i = 0; i < 8; i++) {
    const tmid = `tm_${uid()}`;
    const name = NAMES[i];
    await q(`
      INSERT INTO team_members (id, tenant_id, merchant_id, name, email, role, status, invited_at, joined_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9)
      ON CONFLICT (id) DO NOTHING
    `, [tmid, TENANT_ID, "merch_001", name,
        `${name.toLowerCase().replace(/ /g, ".")}${i}@paygate-demo.com`,
        pick(["owner", "admin", "developer", "finance", "support"]),
        pick(["active", "active", "active", "pending"]),
        daysAgo(rand(30, 180)), daysAgo(rand(0, 30))]);
  }

  // ── 29. Invoices ───────────────────────────────────────────────────────────
  console.log("  → invoices (10)");
  for (let i = 0; i < 10; i++) {
    const invid = `inv_${uid()}`;
    await q(`
      INSERT INTO invoices (id, tenant_id, merchant_id, customer_id, amount, currency, status, due_date, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [invid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        rand(10000, 500000), "NGN",
        pick(["draft", "sent", "paid", "paid", "overdue"]),
        daysAgo(-rand(1, 30)), daysAgo(rand(0, 30))]);
  }

  // ── 30. Escrow Contracts ───────────────────────────────────────────────────
  console.log("  → escrow_contracts (5)");
  for (let i = 0; i < 5; i++) {
    const eid = `esc_${uid()}`;
    await q(`
      INSERT INTO escrow_contracts (id, tenant_id, merchant_id, buyer_id, seller_id, amount, currency, status, milestone, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [eid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds), pick(customerIds),
        rand(50000, 2000000), "NGN",
        pick(["active", "active", "completed", "disputed"]),
        pick(["Awaiting delivery", "In transit", "Delivered - pending confirmation", "Released"]),
        daysAgo(rand(0, 60))]);
  }

  // ── 31. Purchase Orders ────────────────────────────────────────────────────
  console.log("  → purchase_orders (8)");
  for (let i = 0; i < 8; i++) {
    const poid = `po_${uid()}`;
    await q(`
      INSERT INTO purchase_orders (id, tenant_id, merchant_id, vendor_name, total_amount, currency, status, expected_delivery, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$9)
      ON CONFLICT (id) DO NOTHING
    `, [poid, TENANT_ID, pick(MERCHANT_IDS),
        pick(["Dangote Supplies", "Lagos Tech Hub", "Abuja Electronics", "PH Logistics", "Kano Traders"]),
        rand(100000, 5000000), "NGN",
        pick(["draft", "approved", "in_transit", "delivered", "delivered"]),
        daysAgo(-rand(1, 30)), daysAgo(rand(0, 30))]);
  }

  // ── 32. Carbon Credits ─────────────────────────────────────────────────────
  console.log("  → carbon_credits (5)");
  for (let i = 0; i < 5; i++) {
    const ccid = `cc_${uid()}`;
    await q(`
      INSERT INTO carbon_credits (id, tenant_id, merchant_id, project_name, credits_amount, price_per_credit, currency, status, vintage_year, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      ON CONFLICT (id) DO NOTHING
    `, [ccid, TENANT_ID, pick(MERCHANT_IDS),
        pick(["Mangrove Restoration Nigeria", "Solar Farm Kenya", "Wind Energy Ghana", "Reforestation Cameroon"]),
        rand(10, 500), rand(500, 5000), "USD",
        pick(["active", "active", "retired", "pending"]),
        pick([2023, 2024, 2025]), daysAgo(rand(0, 180))]);
  }

  // ── 33. NFT Badges ─────────────────────────────────────────────────────────
  console.log("  → nft_badges (8)");
  for (let i = 0; i < 8; i++) {
    const nbid = `nft_${uid()}`;
    await q(`
      INSERT INTO nft_badges (id, tenant_id, merchant_id, customer_id, badge_name, badge_type, token_id, contract_address, network, minted_at, created_at, updated_at)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
      ON CONFLICT (id) DO NOTHING
    `, [nbid, TENANT_ID, pick(MERCHANT_IDS), pick(customerIds),
        pick(["Gold Member", "Top Spender", "Early Adopter", "Loyalty Champion", "VIP Customer"]),
        pick(["loyalty", "achievement", "membership"]),
        rand(1000, 99999), `0x${uid()}${uid()}`.slice(0,42),
        pick(["polygon", "ethereum", "base"]),
        daysAgo(rand(0, 90)), daysAgo(rand(0, 90))]);
  }

  console.log("\n✅ Demo seed complete!");
  console.log("   Seeded: 1 tenant, 5 merchants, 50 customers, 500 transactions");
  console.log("   30 payouts, 20 settlements, 15 disputes, 20 virtual cards");
  console.log("   25 fraud alerts, 12 POS terminals, 15 subscriptions, 10 BNPL loans");
  console.log("   20 staff, 15 inventory items, 10 invoices, 5 escrow contracts");
  console.log("   8 purchase orders, 5 carbon credits, 8 NFT badges, and more.");
  await pool.end();
}

main().catch((err) => {
  console.error("❌ Seed failed:", err.message);
  console.error(err.stack);
  process.exit(1);
});
