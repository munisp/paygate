/**
 * PayGate Wave 78 — Fixed Seed Script
 * Uses correct column names from the actual DB schema.
 * Run: node seed-wave78-fixed.mjs
 */
import pg from "pg";
import { randomUUID } from "crypto";

const DB_URL =
  process.env.DATABASE_URL ||
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";

const client = new pg.Client({ connectionString: DB_URL });

async function q(sql, params = []) {
  return client.query(sql, params);
}

async function main() {
  await client.connect();
  console.log("Connected to PostgreSQL — Wave 78 fixed seed");

  // Get first merchant_id
  const userRes = await q("SELECT id FROM users LIMIT 1");
  if (userRes.rows.length === 0) {
    console.log("No users found — skipping seed");
    await client.end();
    return;
  }
  const merchantId = String(userRes.rows[0].id);
  console.log(`Using merchant_id=${merchantId}`);

  // ── Digital Gold Holdings ─────────────────────────────────────────────────
  console.log("Seeding digital_gold_holdings...");
  await q(`INSERT INTO digital_gold_holdings (id, merchant_id, gold_grams, purchased_grams, avg_purchase_price_per_gram, current_price_per_gram, current_value_kobo, unrealized_pnl_kobo)
    VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, "12.5", "15.0", 8500000, 9200000, 115000000, 8750000]);

  // ── Digital Gold Transactions ─────────────────────────────────────────────
  console.log("Seeding digital_gold_transactions...");
  for (const [type, grams, amount] of [["buy", "5.0", 42500000], ["buy", "10.0", 85000000], ["sell", "2.5", 23000000]]) {
    await q(`INSERT INTO digital_gold_transactions (id, merchant_id, type, gold_grams, amount_kobo, price_per_gram)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, type, grams, amount, 8500000]);
  }

  // ── Gold SIP Plans ────────────────────────────────────────────────────────
  console.log("Seeding gold_sip_plans...");
  await q(`INSERT INTO gold_sip_plans (id, merchant_id, amount_kobo, frequency, status, next_run_at)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, 5000000, "monthly", "active", new Date(Date.now() + 30*24*60*60*1000)]);

  // ── Mutual Fund Holdings ──────────────────────────────────────────────────
  console.log("Seeding mutual_fund_holdings...");
  for (const [fundId, fundName, units, nav] of [
    ["ARM-MMF", "ARM Money Market Fund", "1250.50", 1000],
    ["STANBIC-ETF", "Stanbic IBTC ETF 30", "500.00", 2500],
    ["CORONATION-BOND", "Coronation Fixed Income Fund", "800.00", 1500],
  ]) {
    await q(`INSERT INTO mutual_fund_holdings (id, merchant_id, fund_id, fund_name, units, avg_nav_at_purchase)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, fundId, fundName, units, nav]);
  }

  // ── Consumer Insurance Policies ───────────────────────────────────────────
  console.log("Seeding consumer_insurance_policies...");
  for (const [productId, productName, provider, premium] of [
    ["AIICO-LIFE-BASIC", "Life Insurance Basic", "AIICO Insurance", 5000000],
    ["LEADWAY-HEALTH-PLUS", "Health Insurance Plus", "Leadway Assurance", 12000000],
    ["MANSARD-AUTO", "Auto Insurance Comprehensive", "AXA Mansard", 35000000],
  ]) {
    await q(`INSERT INTO consumer_insurance_policies (id, merchant_id, customer_id, product_id, product_name, provider, premium_kobo, coverage_kobo, status, start_date, end_date)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, `CUST-${randomUUID().slice(0,8)}`, productId, productName, provider, premium, premium * 100, "active",
       new Date(), new Date(Date.now() + 365*24*60*60*1000)]);
  }

  // ── Pension Accounts ──────────────────────────────────────────────────────
  console.log("Seeding pension_accounts...");
  await q(`INSERT INTO pension_accounts (id, merchant_id, rsa_pin, pfa, fund_type, balance_kobo)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, `PEN${Date.now().toString().slice(-10)}`, "Stanbic IBTC Pension Managers", "RSA_FUND_II", 4500000000]);

  // ── Cashback Balances ─────────────────────────────────────────────────────
  console.log("Seeding cashback_balances...");
  await q(`INSERT INTO cashback_balances (id, merchant_id, cashback_balance_kobo, total_earned_kobo, total_redeemed_kobo, pending_kobo)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, 125000, 450000, 325000, 25000]);

  // ── Soundbox Devices ──────────────────────────────────────────────────────
  console.log("Seeding soundbox_devices...");
  for (const [deviceId, name, status] of [
    [`SB-${randomUUID().slice(0,8).toUpperCase()}`, "Main Counter Soundbox", "active"],
    [`SB-${randomUUID().slice(0,8).toUpperCase()}`, "Back Office Soundbox", "active"],
  ]) {
    await q(`INSERT INTO soundbox_devices (id, merchant_id, device_id, name, status, volume)
      VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, deviceId, name, status, 80]);
  }

  // ── Wealth Risk Profiles ──────────────────────────────────────────────────
  console.log("Seeding wealth_risk_profiles...");
  await q(`INSERT INTO wealth_risk_profiles (id, merchant_id, risk_score, risk_category, investment_horizon, last_assessed)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, 65, "moderate", "5_to_10_years", new Date()]);

  // ── EMI Contracts ─────────────────────────────────────────────────────────
  console.log("Seeding emi_contracts...");
  for (const [amount, tenure, monthly] of [
    [25000000, 12, 2291667],
    [50000000, 24, 2291667],
  ]) {
    const orderId = `ORD-${randomUUID().slice(0,8)}`;
    const total = amount + Math.round(amount * 0.15); // 15% interest
    await q(`INSERT INTO emi_contracts (id, merchant_id, customer_id, order_id, plan_id, tenure, principal_kobo, total_amount_kobo, monthly_installment_kobo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, `CUST-${randomUUID().slice(0,8)}`, orderId, `PLAN-${tenure}M`, tenure, amount, total, monthly, "active"]);
  }

  // ── Bulk Collections ──────────────────────────────────────────────────────
  console.log("Seeding bulk_collections...");
  const collId = randomUUID();
  await q(`INSERT INTO bulk_collections (id, merchant_id, name, description, due_date, status)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [collId, merchantId, "Q1 2026 School Fees", "Bulk school fees collection for Q1 2026", new Date(Date.now() + 14*24*60*60*1000), "active"]);

  // ── Salary Accounts ───────────────────────────────────────────────────────
  console.log("Seeding salary_accounts...");
  for (const [name, email, acct, bankName, bankCode, salary] of [
    ["Adaeze Okonkwo", "adaeze@example.ng", "0123456789", "Access Bank", "044", 45000000],
    ["Emeka Nwosu", "emeka@example.ng", "0987654321", "GTBank", "058", 60000000],
    ["Fatima Aliyu", "fatima@example.ng", "1122334455", "Zenith Bank", "057", 55000000],
  ]) {
    await q(`INSERT INTO salary_accounts (id, merchant_id, employee_id, employee_name, employee_email, account_number, bank_name, bank_code, salary_kobo, max_advance_kobo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, `EMP-${randomUUID().slice(0,8)}`, name, email, acct, bankName, bankCode, salary, Math.round(salary * 0.5), "active"]);
  }

  // ── Privacy Settings ──────────────────────────────────────────────────────
  console.log("Seeding privacy_settings...");
  await q(`INSERT INTO privacy_settings (id, merchant_id, privacy_mode, hide_business_name, hide_bank_details, use_private_alias)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, 'standard', 0, 0, 0]);

  // ── Report Jobs ───────────────────────────────────────────────────────────
  console.log("Seeding report_jobs...");
  for (const [type, format] of [["transaction_summary", "pdf"], ["settlement_report", "csv"], ["fraud_analysis", "excel"]]) {
    await q(`INSERT INTO report_jobs (id, merchant_id, type, format, from_date, to_date, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, type, format,
       new Date(Date.now() - 30*24*60*60*1000), new Date(), "completed"]);
  }

  // ── Nodal Accounts ────────────────────────────────────────────────────────
  console.log("Seeding nodal_accounts...");
  for (const [acct, bank, code, purpose] of [
    ["0123456789", "Access Bank", "044", "escrow"],
    ["9876543210", "GTBank", "058", "collections"],
  ]) {
    await q(`INSERT INTO nodal_accounts (id, merchant_id, account_number, bank_name, bank_code, purpose, balance_kobo, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, acct, bank, code, purpose, 10000000000, "active"]);
  }

  // ── Retail POS Configs ────────────────────────────────────────────────────
  console.log("Seeding retail_pos_configs...");
  await q(`INSERT INTO retail_pos_configs (id, merchant_id, store_name, store_address, currency, tax_rate)
    VALUES ($1, $2, $3, $4, $5, $6) ON CONFLICT DO NOTHING`,
    [randomUUID(), merchantId, "PayGate Demo Store", "123 Broad Street, Lagos Island, Lagos", "NGN", "0.075"]);

  // ── Subscription Plans V2 ─────────────────────────────────────────────────
  console.log("Seeding subscription_plans_v2...");
  for (const [name, desc, price, billingInterval] of [
    ["Basic Monthly", "Essential features for small businesses", 500000, "monthly"],
    ["Pro Monthly", "Advanced features for growing businesses", 1500000, "monthly"],
    ["Enterprise Annual", "Full platform access with priority support", 15000000, "yearly"],
  ]) {
    await q(`INSERT INTO subscription_plans_v2 (id, merchant_id, name, description, price_kobo, currency, interval, status)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8) ON CONFLICT DO NOTHING`,
      [randomUUID(), merchantId, name, desc, price, "NGN", billingInterval, "active"]);
  }

  console.log("✅ Wave 78 seed complete!");
  await client.end();
}

main().catch(err => {
  console.error("Seed failed:", err.message);
  process.exit(1);
});
