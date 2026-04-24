#!/usr/bin/env node
/**
 * seed-wave91.mjs — Wave 91 seed data
 * BNPL Calculator plans, Insurance Hub policies, EMI applications, Subscription plans
 */
import { createConnection } from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.PG_DATABASE_URL || process.env.DATABASE_URL;
if (!DB_URL) { console.log("[seed-wave91] No DB URL — skipping"); process.exit(0); }

async function main() {
  const conn = await createConnection(DB_URL);
  console.log("[seed-wave91] Connected");

  // BNPL Calculator demo plans
  await conn.execute(`INSERT IGNORE INTO bnpl_plans (id, merchant_id, name, min_amount, max_amount, tenure_months, interest_rate, processing_fee_pct, status, created_at) VALUES
    (9100, 1, 'PayLater 3M', 5000, 500000, 3, 0.00, 1.5, 'active', NOW()),
    (9101, 1, 'PayLater 6M', 10000, 1000000, 6, 2.5, 1.5, 'active', NOW()),
    (9102, 1, 'PayLater 12M', 20000, 2000000, 12, 4.0, 2.0, 'active', NOW()),
    (9103, 1, 'PayLater 24M', 50000, 5000000, 24, 6.0, 2.5, 'active', NOW())
  `).catch(() => {});

  // Insurance policies
  await conn.execute(`INSERT IGNORE INTO insurance_policies (id, merchant_id, customer_id, product_type, premium_amount, coverage_amount, start_date, end_date, status, created_at) VALUES
    (9100, 1, 1, 'life', 5000, 5000000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 'active', NOW()),
    (9101, 1, 2, 'health', 8000, 2000000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 'active', NOW()),
    (9102, 1, 3, 'device', 2500, 300000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 1 YEAR), 'active', NOW()),
    (9103, 1, 4, 'travel', 3500, 1000000, CURDATE(), DATE_ADD(CURDATE(), INTERVAL 6 MONTH), 'active', NOW())
  `).catch(() => {});

  // EMI applications
  await conn.execute(`INSERT IGNORE INTO emi_applications (id, merchant_id, customer_id, loan_amount, tenure_months, interest_rate, monthly_instalment, status, purpose, created_at) VALUES
    (9100, 1, 1, 150000, 12, 18.0, 13750, 'approved', 'Electronics purchase', NOW()),
    (9101, 1, 2, 300000, 24, 16.0, 14850, 'active', 'Home appliances', NOW()),
    (9102, 1, 3, 75000, 6, 20.0, 13500, 'pending', 'Mobile phone', NOW()),
    (9103, 1, 4, 500000, 36, 15.0, 17350, 'approved', 'Furniture', NOW())
  `).catch(() => {});

  // Subscription plans
  await conn.execute(`INSERT IGNORE INTO subscription_plans (id, merchant_id, name, description, amount, currency, interval_type, interval_count, trial_days, status, created_at) VALUES
    (9100, 1, 'Starter Monthly', 'Basic features for small businesses', 5000, 'NGN', 'month', 1, 14, 'active', NOW()),
    (9101, 1, 'Growth Monthly', 'Advanced analytics and integrations', 15000, 'NGN', 'month', 1, 14, 'active', NOW()),
    (9102, 1, 'Enterprise Monthly', 'Full platform access + dedicated support', 50000, 'NGN', 'month', 1, 30, 'active', NOW()),
    (9103, 1, 'Starter Annual', 'Basic features — save 20% annually', 48000, 'NGN', 'year', 1, 14, 'active', NOW()),
    (9104, 1, 'Growth Annual', 'Advanced features — save 20% annually', 144000, 'NGN', 'year', 1, 14, 'active', NOW())
  `).catch(() => {});

  await conn.end();
  console.log("[seed-wave91] ✓ Done");
}

main().catch(e => { console.error("[seed-wave91] Error:", e.message); process.exit(0); });
