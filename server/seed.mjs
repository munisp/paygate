/**
 * seed.mjs — PayGate Merchant Portal Development Seed Data
 * ─────────────────────────────────────────────────────────────────────────────
 * Populates the database with realistic test data for all major entities.
 * Run with: node server/seed.mjs
 *
 * WARNING: This script is for development/staging only. Never run in production.
 */

import { createConnection } from "mysql2/promise";
import { randomUUID } from "crypto";
import * as dotenv from "dotenv";
dotenv.config();

const DB_URL = process.env.DATABASE_URL;
if (!DB_URL) {
  console.error("DATABASE_URL is not set. Exiting.");
  process.exit(1);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function uuid() { return randomUUID(); }
function now() { return new Date(); }
function daysAgo(n) { return new Date(Date.now() - n * 86400000); }
function randomInt(min, max) { return Math.floor(Math.random() * (max - min + 1)) + min; }
function randomFrom(arr) { return arr[Math.floor(Math.random() * arr.length)]; }
function randomAmount(min = 1000, max = 5000000) { return randomInt(min, max); }

const CURRENCIES = ["NGN", "USD", "GBP", "EUR", "GHS", "KES", "ZAR"];
const BANKS = ["044", "011", "058", "033", "035", "070", "076"];
const STATUSES = ["completed", "pending", "failed", "processing"];
const CHANNELS = ["web", "mobile", "ussd", "pos", "api"];

// ─── Seed Data Definitions ────────────────────────────────────────────────────
const MERCHANTS = Array.from({ length: 5 }, (_, i) => ({
  id: uuid(),
  name: `Test Merchant ${i + 1}`,
  email: `merchant${i + 1}@paygate.test`,
  phone: `+234${randomInt(7000000000, 9099999999)}`,
  business_type: randomFrom(["fintech", "ecommerce", "retail", "saas", "logistics"]),
  kyc_status: randomFrom(["approved", "pending", "under_review"]),
  tier: randomFrom(["starter", "growth", "enterprise"]),
  country: randomFrom(["NG", "GH", "KE", "ZA", "UK"]),
  created_at: daysAgo(randomInt(30, 365)),
  updated_at: now(),
}));

const CUSTOMERS = Array.from({ length: 20 }, (_, i) => ({
  id: uuid(),
  merchant_id: randomFrom(MERCHANTS).id,
  email: `customer${i + 1}@test.com`,
  name: `Test Customer ${i + 1}`,
  phone: `+234${randomInt(7000000000, 9099999999)}`,
  country: randomFrom(["NG", "GH", "KE"]),
  created_at: daysAgo(randomInt(1, 180)),
  updated_at: now(),
}));

const TRANSACTIONS = Array.from({ length: 50 }, (_, i) => ({
  id: uuid(),
  merchant_id: randomFrom(MERCHANTS).id,
  customer_id: randomFrom(CUSTOMERS).id,
  reference: `TXN-${Date.now()}-${i}`,
  amount: randomAmount(100, 10000000),
  currency: randomFrom(CURRENCIES),
  status: randomFrom(STATUSES),
  type: randomFrom(["payment", "refund", "transfer", "withdrawal"]),
  channel: randomFrom(CHANNELS),
  description: `Test transaction ${i + 1}`,
  created_at: daysAgo(randomInt(0, 90)),
  updated_at: now(),
}));

const PAYOUTS = Array.from({ length: 10 }, (_, i) => ({
  id: uuid(),
  merchant_id: randomFrom(MERCHANTS).id,
  reference: `PO-${Date.now()}-${i}`,
  amount: randomAmount(10000, 5000000),
  currency: "NGN",
  bank_code: randomFrom(BANKS),
  account_number: `${randomInt(1000000000, 9999999999)}`,
  account_name: `Test Account ${i + 1}`,
  status: randomFrom(["pending", "approved", "processing", "completed", "failed"]),
  narration: `Payout for merchant ${i + 1}`,
  created_at: daysAgo(randomInt(0, 30)),
  updated_at: now(),
}));

const WEBHOOKS = Array.from({ length: 5 }, (_, i) => ({
  id: uuid(),
  merchant_id: randomFrom(MERCHANTS).id,
  url: `https://webhook.site/${uuid()}`,
  events: JSON.stringify(["payment.completed", "payout.processed", "dispute.created"]),
  secret: `whsec_${uuid().replace(/-/g, "")}`,
  is_active: true,
  created_at: daysAgo(randomInt(1, 60)),
  updated_at: now(),
}));

const API_KEYS = Array.from({ length: 5 }, (_, i) => ({
  id: uuid(),
  merchant_id: randomFrom(MERCHANTS).id,
  name: `API Key ${i + 1}`,
  key_prefix: `pk_test_${uuid().slice(0, 8)}`,
  key_hash: `$2b$10$${uuid().replace(/-/g, "").slice(0, 53)}`,
  environment: randomFrom(["test", "live"]),
  permissions: JSON.stringify(["transactions:read", "payouts:write", "webhooks:manage"]),
  is_active: true,
  last_used_at: daysAgo(randomInt(0, 7)),
  created_at: daysAgo(randomInt(1, 90)),
  updated_at: now(),
}));

// ─── Main Seed Function ───────────────────────────────────────────────────────
async function seed() {
  console.log("🌱 Starting PayGate seed data insertion...\n");

  let conn;
  try {
    conn = await createConnection(DB_URL);
    console.log("✅ Connected to database\n");

    // Helper to insert with conflict handling
    async function insertMany(table, rows) {
      if (rows.length === 0) return 0;
      let inserted = 0;
      for (const row of rows) {
        const cols = Object.keys(row);
        const vals = Object.values(row);
        const placeholders = cols.map(() => "?").join(", ");
        const sql = `INSERT IGNORE INTO \`${table}\` (${cols.map(c => `\`${c}\``).join(", ")}) VALUES (${placeholders})`;
        try {
          await conn.execute(sql, vals);
          inserted++;
        } catch (e) {
          // Skip rows that fail (table might not exist yet)
          if (!e.message.includes("doesn't exist")) {
            console.warn(`  ⚠️  ${table}: ${e.message.slice(0, 80)}`);
          }
        }
      }
      return inserted;
    }

    // Insert seed data
    const tables = [
      ["merchants", MERCHANTS],
      ["customers", CUSTOMERS],
      ["transactions", TRANSACTIONS],
      ["payouts", PAYOUTS],
      ["webhooks", WEBHOOKS],
      ["api_keys", API_KEYS],
    ];

    for (const [table, rows] of tables) {
      const count = await insertMany(table, rows);
      console.log(`  📦 ${table}: ${count}/${rows.length} rows inserted`);
    }

    console.log("\n✅ Seed data insertion complete!");
    console.log("\nTest credentials:");
    console.log("  Merchant 1 email: merchant1@paygate.test");
    console.log("  Merchant 2 email: merchant2@paygate.test");
    console.log("  Use card: 4242 4242 4242 4242 (Stripe test)");

  } catch (err) {
    console.error("❌ Seed failed:", err.message);
    process.exit(1);
  } finally {
    if (conn) await conn.end();
  }
}

seed();
