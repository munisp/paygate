/**
 * PayGate Wave 78 — Extended Seed Script
 * Seeds all 26 new Wave 76/77 feature tables with realistic Nigerian demo data.
 * Run: DATABASE_URL="postgresql://..." node seed-wave78.mjs
 *
 * Tables seeded:
 *   digitalGoldHoldings, digitalGoldTransactions, goldSipPlans,
 *   mutualFundHoldings, mutualFundTransactions,
 *   consumerInsurancePolicies, consumerInsuranceClaims,
 *   pensionAccounts, pensionContributions,
 *   cashbackBalances, cashbackTransactions,
 *   soundboxDevices,
 *   wealthRiskProfiles, wealthGoals,
 *   emiContracts, emiInstallments,
 *   bulkCollections, bulkCollectionItems,
 *   salaryAccounts, salaryTransactions,
 *   privacySettings, privacyAliases,
 *   reportJobs, scheduledReports,
 *   nodalAccounts, nodalTransactions,
 *   retailPosConfigs, retailSales,
 *   intlRemittanceTransfers,
 *   subscriptionPlansV2, subscriptionSubscribers,
 *   portalSubscriptions
 */
import pg from "pg";
import { randomUUID, randomBytes } from "crypto";

const DB_URL =
  process.env.DATABASE_URL ||
// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
  "postgresql://paygate:paygate@localhost:5432/paygate";
const client = new pg.Client({ connectionString: DB_URL });
await client.connect();
console.log("Connected to PostgreSQL — Wave 78 seed");

// ─── Helpers ──────────────────────────────────────────────────────────────────
const uid = () => randomUUID();
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;
const daysAgo = (n) => new Date(Date.now() - n * 86400000);
const daysFromNow = (n) => new Date(Date.now() + n * 86400000);
const MERCHANT_ID = "mch_acme_001";

// Get the owner user id
const ownerRes = await client.query(
  `SELECT id FROM users WHERE email = 'demo@paygate.ng' LIMIT 1`
);
const USER_ID = ownerRes.rows[0]?.id ?? 1;
console.log(`Using user_id=${USER_ID}`);

// ─── 1. Digital Gold Holdings ─────────────────────────────────────────────────
console.log("Seeding digital gold holdings...");
const goldHoldings = [
  { weight: 5.5, buyPrice: 285000, type: "buy" },
  { weight: 10.0, buyPrice: 520000, type: "buy" },
  { weight: 2.25, buyPrice: 116250, type: "buy" },
];
const goldHoldingIds = [];
for (const g of goldHoldings) {
  const res = await client.query(
    `INSERT INTO digital_gold_holdings (user_id, weight_grams, purchase_price_kobo, current_price_kobo, transaction_type, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,'active',NOW(),NOW()) RETURNING id`,
    [USER_ID, g.weight, g.buyPrice, Math.round(g.buyPrice * 1.03), g.type]
  );
  goldHoldingIds.push(res.rows[0].id);
}
console.log(`  ${goldHoldingIds.length} gold holdings seeded`);

// ─── 2. Digital Gold Transactions ─────────────────────────────────────────────
console.log("Seeding digital gold transactions...");
for (let i = 0; i < 8; i++) {
  const type = pick(["buy", "buy", "buy", "sell"]);
  await client.query(
    `INSERT INTO digital_gold_transactions (user_id, transaction_type, weight_grams, price_per_gram_kobo, total_amount_kobo, reference, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'completed',NOW() - INTERVAL '${randInt(1,90)} days')`,
    [USER_ID, type, randInt(1, 20) * 0.5, randInt(50000, 60000), randInt(50000, 1200000), `GOLD-${randomBytes(4).toString("hex").toUpperCase()}`]
  );
}
console.log("  8 gold transactions seeded");

// ─── 3. Gold SIP Plans ────────────────────────────────────────────────────────
console.log("Seeding gold SIP plans...");
await client.query(
  `INSERT INTO gold_sip_plans (user_id, amount_kobo, frequency, next_execution_date, status, created_at, updated_at)
   VALUES ($1,50000,'monthly',$2,'active',NOW(),NOW())`,
  [USER_ID, daysFromNow(15)]
);
console.log("  1 gold SIP plan seeded");

// ─── 4. Mutual Fund Holdings ──────────────────────────────────────────────────
console.log("Seeding mutual fund holdings...");
const funds = [
  { fundId: "COWRY-EQUITY-001", name: "CowryWise Equity Fund", units: 150.5, nav: 12500 },
  { fundId: "COWRY-FIXED-001", name: "CowryWise Fixed Income Fund", units: 500.0, nav: 10200 },
  { fundId: "PIGG-BALANCED-001", name: "PiggyVest Balanced Fund", units: 75.25, nav: 18000 },
];
for (const f of funds) {
  await client.query(
    `INSERT INTO mutual_fund_holdings (user_id, fund_id, fund_name, units_held, average_nav_kobo, current_nav_kobo, total_invested_kobo, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW())`,
    [USER_ID, f.fundId, f.name, f.units, f.nav, Math.round(f.nav * 1.05), Math.round(f.units * f.nav)]
  );
}
console.log("  3 mutual fund holdings seeded");

// ─── 5. Mutual Fund Transactions ──────────────────────────────────────────────
console.log("Seeding mutual fund transactions...");
for (let i = 0; i < 6; i++) {
  await client.query(
    `INSERT INTO mutual_fund_transactions (user_id, fund_id, transaction_type, units, nav_kobo, amount_kobo, reference, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,'completed',NOW() - INTERVAL '${randInt(1,60)} days')`,
    [USER_ID, pick(["COWRY-EQUITY-001", "COWRY-FIXED-001"]), pick(["buy", "buy", "redeem"]),
     randInt(10, 100) * 0.5, randInt(10000, 20000), randInt(100000, 2000000),
     `MF-${randomBytes(4).toString("hex").toUpperCase()}`]
  );
}
console.log("  6 mutual fund transactions seeded");

// ─── 6. Consumer Insurance Policies ──────────────────────────────────────────
console.log("Seeding consumer insurance policies...");
const policies = [
  { type: "life", provider: "AXA Mansard", premium: 150000, coverage: 50000000 },
  { type: "health", provider: "Hygeia HMO", premium: 80000, coverage: 10000000 },
  { type: "device", provider: "Leadway Assurance", premium: 25000, coverage: 500000 },
];
const policyIds = [];
for (const p of policies) {
  const res = await client.query(
    `INSERT INTO consumer_insurance_policies (user_id, policy_type, provider_name, premium_kobo, coverage_amount_kobo, policy_number, start_date, end_date, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW()) RETURNING id`,
    [USER_ID, p.type, p.provider, p.premium, p.coverage,
     `POL-${randomBytes(5).toString("hex").toUpperCase()}`,
     daysAgo(90), daysFromNow(275)]
  );
  policyIds.push(res.rows[0].id);
}
console.log("  3 insurance policies seeded");

// ─── 7. Consumer Insurance Claims ────────────────────────────────────────────
console.log("Seeding insurance claims...");
await client.query(
  `INSERT INTO consumer_insurance_claims (policy_id, user_id, claim_amount_kobo, description, status, reference, created_at, updated_at)
   VALUES ($1,$2,$3,$4,'pending',$5,NOW(),NOW())`,
  [policyIds[1], USER_ID, 250000, "Outpatient consultation and medication",
   `CLM-${randomBytes(4).toString("hex").toUpperCase()}`]
);
console.log("  1 insurance claim seeded");

// ─── 8. Pension Accounts ──────────────────────────────────────────────────────
console.log("Seeding pension accounts...");
const pensionRes = await client.query(
  `INSERT INTO pension_accounts (user_id, rsa_pin, pfa_code, pfa_name, employer_name, monthly_contribution_kobo, status, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,'active',NOW(),NOW()) RETURNING id`,
  [USER_ID, `PEN${randomBytes(6).toString("hex").toUpperCase().slice(0,12)}`,
   "PFA001", "ARM Pension Managers", "Acme Corp Nigeria Ltd", 50000]
);
const pensionId = pensionRes.rows[0].id;
console.log("  1 pension account seeded");

// ─── 9. Pension Contributions ─────────────────────────────────────────────────
console.log("Seeding pension contributions...");
for (let i = 0; i < 6; i++) {
  await client.query(
    `INSERT INTO pension_contributions (pension_account_id, user_id, employee_contribution_kobo, employer_contribution_kobo, total_kobo, period_month, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'posted',NOW() - INTERVAL '${i} months')`,
    [pensionId, USER_ID, 50000, 100000, 150000, `${2025}-${String(12 - i).padStart(2, "0")}`]
  );
}
console.log("  6 pension contributions seeded");

// ─── 10. Cashback Balances ────────────────────────────────────────────────────
console.log("Seeding cashback balances...");
await client.query(
  `INSERT INTO cashback_balances (user_id, total_points, total_kobo_equivalent, lifetime_points_earned, lifetime_kobo_redeemed, updated_at)
   VALUES ($1,2500,250000,3200,70000,NOW())
   ON CONFLICT (user_id) DO UPDATE SET total_points=2500, total_kobo_equivalent=250000, updated_at=NOW()`,
  [USER_ID]
);
console.log("  1 cashback balance seeded");

// ─── 11. Cashback Transactions ────────────────────────────────────────────────
console.log("Seeding cashback transactions...");
for (let i = 0; i < 10; i++) {
  const type = pick(["earn", "earn", "earn", "redeem"]);
  const points = type === "earn" ? randInt(10, 200) : -randInt(50, 500);
  await client.query(
    `INSERT INTO cashback_transactions (user_id, transaction_type, points, kobo_equivalent, description, reference, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW() - INTERVAL '${randInt(1,60)} days')`,
    [USER_ID, type, points, Math.abs(points) * 100,
     type === "earn" ? `Cashback on ${pick(["card payment", "transfer", "bill payment", "QR payment"])}` : "Points redeemed for wallet credit",
     `CB-${randomBytes(4).toString("hex").toUpperCase()}`]
  );
}
console.log("  10 cashback transactions seeded");

// ─── 12. Soundbox Devices ─────────────────────────────────────────────────────
console.log("Seeding soundbox devices...");
const soundboxes = [
  { deviceId: "SB-NG-001234", merchantName: "Acme Superstore Ikeja", lang: "en" },
  { deviceId: "SB-NG-005678", merchantName: "Acme Superstore Lekki", lang: "yo" },
];
for (const s of soundboxes) {
  await client.query(
    `INSERT INTO soundbox_devices (user_id, device_id, merchant_name, language, volume_level, status, last_ping_at, created_at, updated_at)
     VALUES ($1,$2,$3,$4,80,'active',NOW(),NOW(),NOW())`,
    [USER_ID, s.deviceId, s.merchantName, s.lang]
  );
}
console.log("  2 soundbox devices seeded");

// ─── 13. Wealth Risk Profiles ─────────────────────────────────────────────────
console.log("Seeding wealth risk profiles...");
await client.query(
  `INSERT INTO wealth_risk_profiles (user_id, risk_tolerance, investment_horizon_years, monthly_income_kobo, monthly_expenses_kobo, existing_investments_kobo, created_at, updated_at)
   VALUES ($1,'moderate',10,500000,200000,5000000,NOW(),NOW())
   ON CONFLICT (user_id) DO UPDATE SET risk_tolerance='moderate', updated_at=NOW()`,
  [USER_ID]
);
console.log("  1 wealth risk profile seeded");

// ─── 14. Wealth Goals ─────────────────────────────────────────────────────────
console.log("Seeding wealth goals...");
const goals = [
  { name: "Emergency Fund", target: 3000000, current: 1200000, type: "emergency_fund" },
  { name: "House Down Payment", target: 20000000, current: 5000000, type: "home_purchase" },
  { name: "Children Education", target: 10000000, current: 2500000, type: "education" },
];
for (const g of goals) {
  await client.query(
    `INSERT INTO wealth_goals (user_id, goal_name, goal_type, target_amount_kobo, current_amount_kobo, target_date, status, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,'on_track',NOW(),NOW())`,
    [USER_ID, g.name, g.type, g.target, g.current, daysFromNow(randInt(365, 1825))]
  );
}
console.log("  3 wealth goals seeded");

// ─── 15. EMI Contracts ────────────────────────────────────────────────────────
console.log("Seeding EMI contracts...");
const emiRes = await client.query(
  `INSERT INTO emi_contracts (user_id, merchant_id, product_name, principal_kobo, interest_rate_percent, tenure_months, monthly_installment_kobo, total_payable_kobo, down_payment_kobo, status, start_date, end_date, reference, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active',$10,$11,$12,NOW(),NOW()) RETURNING id`,
  [USER_ID, MERCHANT_ID, "Samsung Galaxy S24 Ultra", 1500000, 2.5, 12, 140625, 1687500, 150000,
   daysAgo(30), daysFromNow(335), `EMI-${randomBytes(5).toString("hex").toUpperCase()}`]
);
const emiId = emiRes.rows[0].id;
console.log("  1 EMI contract seeded");

// ─── 16. EMI Installments ─────────────────────────────────────────────────────
console.log("Seeding EMI installments...");
for (let i = 1; i <= 12; i++) {
  const status = i <= 1 ? "paid" : i === 2 ? "due" : "upcoming";
  await client.query(
    `INSERT INTO emi_installments (emi_contract_id, installment_number, due_date, amount_kobo, status, paid_at, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
    [emiId, i, daysAgo(30 - i * 30), 140625, status, status === "paid" ? daysAgo(31 - i * 30) : null]
  );
}
console.log("  12 EMI installments seeded");

// ─── 17. Bulk Collections ─────────────────────────────────────────────────────
console.log("Seeding bulk collections...");
const bulkRes = await client.query(
  `INSERT INTO bulk_collections (merchant_id, name, description, total_amount_kobo, collected_amount_kobo, item_count, status, due_date, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,'active',$7,NOW(),NOW()) RETURNING id`,
  [MERCHANT_ID, "Q1 2025 Vendor Payments", "Quarterly vendor payment batch", 5000000, 2500000, 25,
   daysFromNow(14)]
);
const bulkId = bulkRes.rows[0].id;
console.log("  1 bulk collection seeded");

// ─── 18. Bulk Collection Items ────────────────────────────────────────────────
console.log("Seeding bulk collection items...");
const vendors = ["Dangote Supplies", "Innoson Motors", "Eko Atlantic Vendors", "Lagos Wholesale Market", "Alaba Electronics"];
for (let i = 0; i < 5; i++) {
  await client.query(
    `INSERT INTO bulk_collection_items (bulk_collection_id, recipient_name, account_number, bank_code, amount_kobo, status, reference, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,NOW())`,
    [bulkId, vendors[i], `0${randInt(100000000, 999999999)}`, pick(["058", "011", "033", "044", "050"]),
     randInt(100000, 500000), pick(["pending", "completed", "completed", "completed"]),
     `BC-${randomBytes(4).toString("hex").toUpperCase()}`]
  );
}
console.log("  5 bulk collection items seeded");

// ─── 19. Salary Accounts ──────────────────────────────────────────────────────
console.log("Seeding salary accounts...");
await client.query(
  `INSERT INTO salary_accounts (user_id, employer_name, employer_rc_number, bank_code, account_number, account_name, monthly_salary_kobo, salary_day, status, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'active',NOW(),NOW())`,
  [USER_ID, "Acme Corp Nigeria Ltd", "RC-1234567", "058", "0123456789", "Demo Owner", 500000, 25]
);
console.log("  1 salary account seeded");

// ─── 20. Salary Transactions ──────────────────────────────────────────────────
console.log("Seeding salary transactions...");
for (let i = 0; i < 3; i++) {
  await client.query(
    `INSERT INTO salary_transactions (user_id, amount_kobo, period_month, status, reference, credited_at, created_at)
     VALUES ($1,$2,$3,'credited',$4,$5,NOW() - INTERVAL '${i} months')`,
    [USER_ID, 500000, `${2025}-${String(12 - i).padStart(2, "0")}`,
     `SAL-${randomBytes(4).toString("hex").toUpperCase()}`, daysAgo(i * 30 + 5)]
  );
}
console.log("  3 salary transactions seeded");

// ─── 21. Privacy Settings ─────────────────────────────────────────────────────
console.log("Seeding privacy settings...");
await client.query(
  `INSERT INTO privacy_settings (user_id, hide_balance, hide_transactions, private_alias_enabled, created_at, updated_at)
   VALUES ($1,false,false,true,NOW(),NOW())
   ON CONFLICT (user_id) DO UPDATE SET private_alias_enabled=true, updated_at=NOW()`,
  [USER_ID]
);
console.log("  1 privacy settings seeded");

// ─── 22. Privacy Aliases ──────────────────────────────────────────────────────
console.log("Seeding privacy aliases...");
await client.query(
  `INSERT INTO privacy_aliases (user_id, alias, is_active, created_at, updated_at)
   VALUES ($1,$2,true,NOW(),NOW())`,
  [USER_ID, `anon_${randomBytes(6).toString("hex")}`]
);
console.log("  1 privacy alias seeded");

// ─── 23. Report Jobs ──────────────────────────────────────────────────────────
console.log("Seeding report jobs...");
const reportTypes = ["transactions", "settlements", "customers", "fraud_summary"];
for (const rt of reportTypes) {
  await client.query(
    `INSERT INTO report_jobs (merchant_id, report_type, date_from, date_to, format, status, download_url, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'csv','completed',$5,NOW() - INTERVAL '${randInt(1,30)} days',NOW())`,
    [MERCHANT_ID, rt, daysAgo(60), daysAgo(1),
     `https://cdn.paygate.ng/reports/${MERCHANT_ID}/${rt}_${randomBytes(4).toString("hex")}.csv`]
  );
}
console.log("  4 report jobs seeded");

// ─── 24. Scheduled Reports ────────────────────────────────────────────────────
console.log("Seeding scheduled reports...");
await client.query(
  `INSERT INTO scheduled_reports (merchant_id, report_type, frequency, format, email, next_run_at, is_active, created_at, updated_at)
   VALUES ($1,'transactions','weekly','csv','demo@paygate.ng',$2,true,NOW(),NOW())`,
  [MERCHANT_ID, daysFromNow(7)]
);
console.log("  1 scheduled report seeded");

// ─── 25. Nodal Accounts ───────────────────────────────────────────────────────
console.log("Seeding nodal accounts...");
const nodalRes = await client.query(
  `INSERT INTO nodal_accounts (merchant_id, account_number, bank_code, bank_name, account_name, purpose, balance_kobo, status, created_at, updated_at)
   VALUES ($1,$2,$3,$4,$5,$6,$7,'active',NOW(),NOW()) RETURNING id`,
  [MERCHANT_ID, "0987654321", "058", "GTBank", "Acme Corp Nodal Account",
   "escrow", 25000000]
);
const nodalId = nodalRes.rows[0].id;
console.log("  1 nodal account seeded");

// ─── 26. Nodal Transactions ───────────────────────────────────────────────────
console.log("Seeding nodal transactions...");
for (let i = 0; i < 5; i++) {
  await client.query(
    `INSERT INTO nodal_transactions (nodal_account_id, merchant_id, transaction_type, amount_kobo, reference, description, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,'completed',NOW() - INTERVAL '${randInt(1,30)} days')`,
    [nodalId, MERCHANT_ID, pick(["credit", "debit"]), randInt(100000, 5000000),
     `NOD-${randomBytes(4).toString("hex").toUpperCase()}`,
     pick(["Customer escrow deposit", "Merchant settlement", "Refund hold", "Platform fee deduction"])]
  );
}
console.log("  5 nodal transactions seeded");

// ─── 27. Retail POS Configs ───────────────────────────────────────────────────
console.log("Seeding retail POS configs...");
await client.query(
  `INSERT INTO retail_pos_configs (merchant_id, store_name, currency, tax_rate_percent, receipt_footer, printer_enabled, created_at, updated_at)
   VALUES ($1,$2,'NGN',7.5,$3,true,NOW(),NOW())
   ON CONFLICT (merchant_id) DO UPDATE SET store_name=$2, updated_at=NOW()`,
  [MERCHANT_ID, "Acme Superstore", "Thank you for shopping at Acme! Visit us again."]
);
console.log("  1 retail POS config seeded");

// ─── 28. Retail Sales ─────────────────────────────────────────────────────────
console.log("Seeding retail sales...");
const products = [
  { name: "Indomie Noodles (carton)", price: 8500 },
  { name: "Peak Milk (tin)", price: 4200 },
  { name: "Coca-Cola (crate)", price: 12000 },
  { name: "Dangote Sugar (50kg)", price: 45000 },
  { name: "Sunlight Detergent (carton)", price: 18000 },
];
for (let i = 0; i < 10; i++) {
  const items = Array.from({ length: randInt(1, 3) }, () => {
    const p = pick(products);
    const qty = randInt(1, 5);
    return { name: p.name, price: p.price, qty, subtotal: p.price * qty };
  });
  const subtotal = items.reduce((s, i) => s + i.subtotal, 0);
  const tax = Math.round(subtotal * 0.075);
  await client.query(
    `INSERT INTO retail_sales (merchant_id, items_json, subtotal_kobo, tax_kobo, total_kobo, payment_method, reference, cashier_name, status, created_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,$8,'completed',NOW() - INTERVAL '${randInt(0,30)} days')`,
    [MERCHANT_ID, JSON.stringify(items), subtotal, tax, subtotal + tax,
     pick(["cash", "card", "transfer", "qr"]),
     `POS-${randomBytes(4).toString("hex").toUpperCase()}`,
     pick(["Chidi Okafor", "Amaka Eze", "Tunde Adeyemi"])]
  );
}
console.log("  10 retail sales seeded");

// ─── 29. International Remittance Transfers ───────────────────────────────────
console.log("Seeding international remittance transfers...");
const corridors = [
  { dest: "GH", destCurrency: "GHS", rate: 0.032, provider: "WorldRemit" },
  { dest: "KE", destCurrency: "KES", rate: 6.8, provider: "Flutterwave" },
  { dest: "ZA", destCurrency: "ZAR", rate: 0.095, provider: "Flutterwave" },
];
for (const c of corridors) {
  const amountKobo = randInt(50000, 500000);
  await client.query(
    `INSERT INTO intl_remittance_transfers (user_id, source_amount_kobo, source_currency, destination_amount, destination_currency, exchange_rate, provider_name, recipient_name, recipient_account, destination_country, status, reference, fee_kobo, created_at, updated_at)
     VALUES ($1,$2,'NGN',$3,$4,$5,$6,$7,$8,$9,'completed',$10,$11,NOW() - INTERVAL '${randInt(1,60)} days',NOW())`,
    [USER_ID, amountKobo, Math.round(amountKobo * c.rate / 100), c.destCurrency,
     c.rate, c.provider, "John Doe Recipient", "1234567890", c.dest,
     `REM-${randomBytes(5).toString("hex").toUpperCase()}`, randInt(1000, 5000)]
  );
}
console.log("  3 remittance transfers seeded");

// ─── 30. Subscription Plans V2 ────────────────────────────────────────────────
console.log("Seeding subscription plans V2...");
const subPlans = [
  { name: "Basic", price: 100000, interval: "monthly", trialDays: 14 },
  { name: "Pro", price: 250000, interval: "monthly", trialDays: 14 },
  { name: "Enterprise", price: 1000000, interval: "monthly", trialDays: 30 },
];
const subPlanIds = [];
for (const p of subPlans) {
  const res = await client.query(
    `INSERT INTO subscription_plans_v2 (merchant_id, name, description, price_kobo, billing_interval, trial_days, features_json, is_active, created_at, updated_at)
     VALUES ($1,$2,$3,$4,$5,$6,$7,true,NOW(),NOW()) RETURNING id`,
    [MERCHANT_ID, p.name, `${p.name} plan for PayGate merchants`,
     p.price, p.interval, p.trialDays,
     JSON.stringify({ maxTransactions: p.name === "Basic" ? 1000 : p.name === "Pro" ? 10000 : -1, apiAccess: p.name !== "Basic" })]
  );
  subPlanIds.push(res.rows[0].id);
}
console.log("  3 subscription plans V2 seeded");

// ─── 31. Subscription Subscribers ────────────────────────────────────────────
console.log("Seeding subscription subscribers...");
for (let i = 0; i < 5; i++) {
  await client.query(
    `INSERT INTO subscription_subscribers (plan_id, merchant_id, subscriber_email, subscriber_name, status, current_period_start, current_period_end, created_at, updated_at)
     VALUES ($1,$2,$3,$4,'active',$5,$6,NOW(),NOW())`,
    [subPlanIds[i % subPlanIds.length], MERCHANT_ID,
     `subscriber${i + 1}@example.com`, `Subscriber ${i + 1}`,
     daysAgo(randInt(1, 30)), daysFromNow(randInt(1, 30))]
  );
}
console.log("  5 subscription subscribers seeded");

// ─── 32. Portal Subscriptions ─────────────────────────────────────────────────
console.log("Seeding portal subscriptions...");
await client.query(
  `INSERT INTO portal_subscriptions (merchant_id, plan, status, stripe_customer_id, stripe_subscription_id, current_period_start, current_period_end, cancel_at_period_end, created_at, updated_at)
   VALUES ($1,'starter','active',NULL,NULL,$2,$3,false,NOW(),NOW())
   ON CONFLICT (merchant_id) DO UPDATE SET plan='starter', status='active', updated_at=NOW()`,
  [MERCHANT_ID, daysAgo(30), daysFromNow(335)]
);
console.log("  1 portal subscription seeded");

// ─── Summary ──────────────────────────────────────────────────────────────────
console.log("\n✅ Wave 78 seed complete. Counts:");
const counts = await client.query(`
  SELECT
    (SELECT COUNT(*) FROM digital_gold_holdings)         AS gold_holdings,
    (SELECT COUNT(*) FROM digital_gold_transactions)     AS gold_txns,
    (SELECT COUNT(*) FROM mutual_fund_holdings)          AS fund_holdings,
    (SELECT COUNT(*) FROM consumer_insurance_policies)   AS insurance_policies,
    (SELECT COUNT(*) FROM pension_accounts)              AS pension_accounts,
    (SELECT COUNT(*) FROM cashback_balances)             AS cashback_balances,
    (SELECT COUNT(*) FROM soundbox_devices)              AS soundbox_devices,
    (SELECT COUNT(*) FROM wealth_goals)                  AS wealth_goals,
    (SELECT COUNT(*) FROM emi_contracts)                 AS emi_contracts,
    (SELECT COUNT(*) FROM bulk_collections)              AS bulk_collections,
    (SELECT COUNT(*) FROM salary_accounts)               AS salary_accounts,
    (SELECT COUNT(*) FROM nodal_accounts)                AS nodal_accounts,
    (SELECT COUNT(*) FROM retail_sales)                  AS retail_sales,
    (SELECT COUNT(*) FROM intl_remittance_transfers)     AS remittances,
    (SELECT COUNT(*) FROM subscription_plans_v2)         AS sub_plans_v2,
    (SELECT COUNT(*) FROM subscription_subscribers)      AS subscribers,
    (SELECT COUNT(*) FROM portal_subscriptions)          AS portal_subs
`);
console.table(counts.rows[0]);
await client.end();
