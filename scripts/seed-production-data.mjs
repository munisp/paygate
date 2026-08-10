#!/usr/bin/env node
/**
 * PayGate Merchant Portal — Production Seed Script
 * Seeds essential reference data, default configurations, and demo merchant data.
 *
 * Usage:
 *   node scripts/seed-production-data.mjs
 *   NODE_ENV=production node scripts/seed-production-data.mjs --admin-only
 *   node scripts/seed-production-data.mjs --demo
 */

import { createRequire } from "module";
const require = createRequire(import.meta.url);

// ─── Parse CLI flags ──────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const ADMIN_ONLY = args.includes("--admin-only");
const DEMO_MODE = args.includes("--demo");
const DRY_RUN = args.includes("--dry-run");

// ─── Database connection ──────────────────────────────────────────────────────
const DATABASE_URL = process.env.DATABASE_URL;
if (!DATABASE_URL) {
  console.error("❌ DATABASE_URL environment variable is required");
  process.exit(1);
}

// Dynamic import to handle ESM/CJS compatibility
const { drizzle } = await import("drizzle-orm/mysql2");
const mysql = await import("mysql2/promise");

const connection = await mysql.default.createConnection(DATABASE_URL);
const db = drizzle(connection);

console.log("🌱 PayGate Production Seed Script");
console.log(`   Mode: ${ADMIN_ONLY ? "admin-only" : DEMO_MODE ? "demo" : "full"}`);
console.log(`   Dry run: ${DRY_RUN}`);
console.log(`   Database: ${DATABASE_URL.replace(/:[^:@]+@/, ":***@")}`);
console.log("");

// ─── Helper ───────────────────────────────────────────────────────────────────
async function runSQL(label, sql, params = []) {
  if (DRY_RUN) {
    console.log(`  [DRY RUN] ${label}`);
    return;
  }
  try {
    await connection.execute(sql, params);
    console.log(`  ✅ ${label}`);
  } catch (err) {
    if (err.code === "ER_DUP_ENTRY" || err.message?.includes("duplicate")) {
      console.log(`  ⏭  ${label} (already exists)`);
    } else {
      console.error(`  ❌ ${label}: ${err.message}`);
    }
  }
}

// ─── 1. Admin User ────────────────────────────────────────────────────────────
console.log("👤 Seeding admin user...");

const OWNER_OPEN_ID = process.env.OWNER_OPEN_ID || "owner-default-open-id";
const OWNER_NAME = process.env.OWNER_NAME || "PayGate Admin";
const OWNER_EMAIL = process.env.OWNER_EMAIL || "admin@paygate.ng";

await runSQL(
  `Admin user: ${OWNER_EMAIL}`,
  `INSERT IGNORE INTO users (openId, name, email, role, createdAt, updatedAt)
   VALUES (?, ?, ?, 'admin', NOW(), NOW())`,
  [OWNER_OPEN_ID, OWNER_NAME, OWNER_EMAIL]
);

if (ADMIN_ONLY) {
  console.log("\n✅ Admin-only seed complete.");
  await connection.end();
  process.exit(0);
}

// ─── 2. System Configurations ─────────────────────────────────────────────────
console.log("\n⚙️  Seeding system configurations...");

const systemConfigs = [
  ["payment_link_base_url", "https://pay.paygate.ng", "Base URL for payment links"],
  ["max_transaction_amount_kobo", "10000000000", "Maximum single transaction amount (₦100,000,000)"],
  ["min_transaction_amount_kobo", "100", "Minimum single transaction amount (₦1)"],
  ["fx_spread_percentage", "1.5", "Default FX spread percentage"],
  ["settlement_cycle_hours", "24", "Default settlement cycle in hours"],
  ["fraud_score_threshold", "0.75", "Fraud score threshold for auto-block"],
  ["kyc_required_amount_kobo", "5000000", "KYC required above this amount (₦50,000)"],
  ["webhook_retry_count", "3", "Number of webhook delivery retries"],
  ["webhook_retry_delay_seconds", "60", "Delay between webhook retries"],
  ["api_rate_limit_per_minute", "1000", "Default API rate limit per minute"],
];

for (const [key, value, description] of systemConfigs) {
  await runSQL(
    `Config: ${key}`,
    `INSERT IGNORE INTO system_configs (config_key, config_value, description, createdAt, updatedAt)
     VALUES (?, ?, ?, NOW(), NOW())
     ON DUPLICATE KEY UPDATE config_value = VALUES(config_value)`,
    [key, value, description]
  );
}

// ─── 3. Supported Currencies ──────────────────────────────────────────────────
console.log("\n💱 Seeding supported currencies...");

const currencies = [
  ["NGN", "Nigerian Naira", "₦", true],
  ["USD", "US Dollar", "$", true],
  ["GBP", "British Pound", "£", true],
  ["EUR", "Euro", "€", true],
  ["GHS", "Ghanaian Cedi", "₵", true],
  ["KES", "Kenyan Shilling", "KSh", true],
  ["ZAR", "South African Rand", "R", true],
  ["XOF", "West African CFA Franc", "CFA", true],
  ["USDC", "USD Coin (Stablecoin)", "USDC", true],
];

for (const [code, name, symbol, isActive] of currencies) {
  await runSQL(
    `Currency: ${code}`,
    `INSERT IGNORE INTO currencies (code, name, symbol, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, ?, NOW(), NOW())`,
    [code, name, symbol, isActive ? 1 : 0]
  );
}

// ─── 4. Nigerian Bank Directory (NIP Banks) ───────────────────────────────────
console.log("\n🏦 Seeding Nigerian bank directory...");

const nibssBanks = [
  ["058", "Guaranty Trust Bank", "GTBank"],
  ["011", "First Bank of Nigeria", "First Bank"],
  ["033", "United Bank for Africa", "UBA"],
  ["057", "Zenith Bank", "Zenith"],
  ["044", "Access Bank", "Access Bank"],
  ["063", "Diamond Bank (Access Bank)", "Diamond"],
  ["050", "Ecobank Nigeria", "Ecobank"],
  ["070", "Fidelity Bank", "Fidelity"],
  ["076", "Polaris Bank", "Polaris"],
  ["221", "Stanbic IBTC Bank", "Stanbic IBTC"],
  ["068", "Standard Chartered Bank", "Standard Chartered"],
  ["232", "Sterling Bank", "Sterling"],
  ["032", "Union Bank of Nigeria", "Union Bank"],
  ["035", "Wema Bank", "Wema"],
  ["215", "Unity Bank", "Unity Bank"],
  ["301", "Jaiz Bank", "Jaiz Bank"],
  ["090", "Kuda Bank", "Kuda"],
  ["120001", "9PSB (9 Payment Service Bank)", "9PSB"],
  ["100004", "Opay", "Opay"],
  ["100033", "PalmPay", "PalmPay"],
  ["100002", "Paga", "Paga"],
  ["100003", "Paycom (Opay)", "Paycom"],
];

for (const [code, name, shortName] of nibssBanks) {
  await runSQL(
    `Bank: ${code} — ${shortName}`,
    `INSERT IGNORE INTO nip_banks (bankCode, bankName, shortName, isActive, createdAt, updatedAt)
     VALUES (?, ?, ?, 1, NOW(), NOW())`,
    [code, name, shortName]
  );
}

// ─── 5. Demo Merchant (if --demo flag) ───────────────────────────────────────
if (DEMO_MODE) {
  console.log("\n🏪 Seeding demo merchant data...");

  await runSQL(
    "Demo merchant account",
    `INSERT IGNORE INTO merchants (
       userId, businessName, businessEmail, businessPhone,
       businessType, settlementBankCode, settlementAccountNumber,
       kycStatus, isActive, createdAt, updatedAt
     ) VALUES (
       (SELECT id FROM users WHERE email = ? LIMIT 1),
       'PayGate Demo Store', 'demo@paygate.ng', '+2348012345678',
       'ecommerce', '058', '0123456789',
       'approved', 1, NOW(), NOW()
     )`,
    [OWNER_EMAIL]
  );

  await runSQL(
    "Demo API key",
    `INSERT IGNORE INTO api_keys (
       merchantId, keyName, keyHash, keyPrefix, environment,
       isActive, createdAt, updatedAt
     ) VALUES (
       (SELECT id FROM merchants WHERE businessEmail = 'demo@paygate.ng' LIMIT 1),
       'Demo Test Key', SHA2('sk_test_demo_paygate_key_12345', 256),
       'sk_test_demo', 'test', 1, NOW(), NOW()
     )`
  );

  await runSQL(
    "Demo webhook endpoint",
    `INSERT IGNORE INTO webhooks (
       merchantId, url, events, secret, isActive, createdAt, updatedAt
     ) VALUES (
       (SELECT id FROM merchants WHERE businessEmail = 'demo@paygate.ng' LIMIT 1),
       'https://webhook.site/demo-paygate',
       '["payment.success","payment.failed","payout.completed"]',
       'whsec_demo_secret_key_paygate',
       1, NOW(), NOW()
     )`
  );

  // Demo transactions
  const txStatuses = ["success", "success", "success", "failed", "pending"];
  for (let i = 1; i <= 5; i++) {
    await runSQL(
      `Demo transaction #${i}`,
      `INSERT IGNORE INTO transactions (
         merchantId, reference, amount, currency, status,
         customerEmail, customerName, paymentMethod,
         createdAt, updatedAt
       ) VALUES (
         (SELECT id FROM merchants WHERE businessEmail = 'demo@paygate.ng' LIMIT 1),
         ?, ?, 'NGN', ?,
         'customer@example.com', 'Demo Customer', 'card',
         NOW(), NOW()
       )`,
      [
        `TXN-DEMO-${String(i).padStart(6, "0")}`,
        (i * 1000 + 500) * 100, // amounts in kobo
        txStatuses[i - 1],
      ]
    );
  }
}

// ─── 6. Webhook Event Types ───────────────────────────────────────────────────
console.log("\n🔔 Seeding webhook event types...");

const webhookEvents = [
  "payment.success",
  "payment.failed",
  "payment.pending",
  "payout.initiated",
  "payout.completed",
  "payout.failed",
  "refund.initiated",
  "refund.completed",
  "dispute.opened",
  "dispute.resolved",
  "customer.created",
  "subscription.created",
  "subscription.cancelled",
  "virtual_card.created",
  "virtual_card.frozen",
  "kyc.approved",
  "kyc.rejected",
];

for (const event of webhookEvents) {
  await runSQL(
    `Webhook event: ${event}`,
    `INSERT IGNORE INTO webhook_event_types (eventType, description, createdAt)
     VALUES (?, ?, NOW())`,
    [event, `Fired when a ${event.replace(/\./g, " ")} occurs`]
  );
}

// ─── Done ─────────────────────────────────────────────────────────────────────
console.log("\n✅ Seed complete!");
console.log(`   Admin: ${OWNER_EMAIL}`);
if (DEMO_MODE) {
  console.log("   Demo merchant: demo@paygate.ng");
  console.log("   Demo API key prefix: sk_test_demo");
}

await connection.end();
