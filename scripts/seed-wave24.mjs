/**
 * Wave 24 Seed Data Script (PostgreSQL)
 * Matches actual DB schema columns from migration 0043
 * Usage: npx tsx scripts/seed-wave24.mjs
 */
import pg from "pg";
import { randomUUID } from "crypto";

// NOTE: fallback targets the LOCAL embedded dev DB (localhost) only — safe for dev/test seeds.
const DB_URL = process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_dev";
const pool = new pg.Pool({ connectionString: DB_URL, max: 5 });
const client = await pool.connect();
console.log("✅ Connected to PostgreSQL");

const now = Date.now();
const daysAgo = (d) => new Date(now - d * 86400000);

// ─── Feature Flags ─────────────────────────────────────────────────────────
const featureFlags = [
  { key: "bnpl_v3", name: "BNPL v3", description: "Next-gen BNPL with 12-month plans", enabled: true, rolloutPct: 100, category: "feature" },
  { key: "crypto_offramp", name: "Crypto Off-Ramp", description: "USDC/USDT to NGN off-ramp", enabled: true, rolloutPct: 50, category: "feature" },
  { key: "ai_fraud_v2", name: "AI Fraud Detection v2", description: "ML-based fraud scoring upgrade", enabled: false, rolloutPct: 0, category: "feature" },
  { key: "consumer_budgets", name: "Consumer Budgets", description: "Spending budget tracking for consumers", enabled: true, rolloutPct: 100, category: "feature" },
  { key: "savings_goals", name: "Savings Goals", description: "Goal-based savings for consumers", enabled: true, rolloutPct: 100, category: "feature" },
  { key: "referral_program", name: "Referral Program", description: "Invite friends and earn rewards", enabled: true, rolloutPct: 100, category: "feature" },
  { key: "webhook_simulator", name: "Webhook Simulator", description: "Test webhook delivery in sandbox", enabled: true, rolloutPct: 100, category: "feature" },
  { key: "settlement_sla", name: "Settlement SLA Tracking", description: "Track settlement SLA compliance", enabled: true, rolloutPct: 100, category: "ops" },
  { key: "voice_payments", name: "Voice Payments", description: "Pay via voice commands", enabled: false, rolloutPct: 0, category: "experimental" },
  { key: "carbon_credits", name: "Carbon Credits", description: "Carbon offset for transactions", enabled: false, rolloutPct: 10, category: "experimental" },
];

let ffCount = 0;
for (const f of featureFlags) {
  try {
    await client.query(
      `INSERT INTO feature_flags (id, key, name, description, enabled, rollout_percentage, category, created_by, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,NOW(),NOW())
       ON CONFLICT (key) DO NOTHING`,
      [randomUUID(), f.key, f.name, f.description, f.enabled, f.rolloutPct, f.category, "system"]
    );
    ffCount++;
  } catch (e) { console.warn(`  skip flag ${f.key}: ${e.message}`); }
}
console.log(`✅ Seeded ${ffCount} feature flags`);

// ─── Help Search Analytics ──────────────────────────────────────────────────
const helpQueries = [
  ["how to add bank account", "merchant", 3, 1],
  ["webhook setup", "merchant", 2, 1],
  ["refund customer", "merchant", 5, 0],
  ["kyc verification", "merchant", 4, 1],
  ["payment link", "merchant", 8, 1],
  ["how to send money", "consumer", 12, 1],
  ["bill payment", "consumer", 7, 1],
  ["loyalty points", "consumer", 3, 1],
  ["dispute transaction", "consumer", 6, 1],
  ["change pin", "consumer", 4, 1],
  ["api rate limits", "merchant", 2, 0],
  ["webhook secret", "merchant", 3, 1],
  ["settlement schedule", "merchant", 5, 1],
  ["cross border fees", "consumer", 4, 0],
  ["savings goal interest", "consumer", 2, 0],
];

let hsaCount = 0;
for (const [query, userType, count, hasClick] of helpQueries) {
  for (let i = 0; i < count; i++) {
    try {
      await client.query(
        `INSERT INTO help_search_analytics (id, query, user_type, result_count, clicked_section, session_id, created_at)
         VALUES ($1,$2,$3,$4,$5,$6,$7)`,
        [
          randomUUID(), query, userType,
          hasClick ? Math.floor(Math.random() * 5) + 1 : 0,
          hasClick ? "getting-started" : null,
          randomUUID().slice(0, 16),
          daysAgo(Math.floor(Math.random() * 30)),
        ]
      );
      hsaCount++;
    } catch (e) { console.warn(`  skip hsa: ${e.message}`); }
  }
}
console.log(`✅ Seeded ${hsaCount} help search analytics rows`);

// ─── Get merchant IDs ───────────────────────────────────────────────────────
const { rows: merchantRows } = await client.query("SELECT id FROM merchants LIMIT 5");
const merchantIds = merchantRows.length > 0
  ? merchantRows.map(r => r.id)
  : ["00000000-0000-0000-0000-000000000001"];

// ─── Chargebacks ────────────────────────────────────────────────────────────
const reasons = ["product_not_received", "unauthorized_transaction", "duplicate_charge", "product_not_as_described", "credit_not_processed"];
const cbStatuses = ["open", "under_review", "won", "lost", "accepted"];
const currencies = ["NGN", "USD", "GBP"];

let cbCount = 0;
for (let i = 0; i < 15; i++) {
  const merchantId = merchantIds[i % merchantIds.length];
  const status = cbStatuses[i % cbStatuses.length];
  const dueDate = new Date(now + (i % 3 === 0 ? -5 : 7) * 86400000);
  try {
    await client.query(
      `INSERT INTO chargebacks (id, merchant_id, transaction_id, amount_kobo, currency, reason, status, due_date, evidence_submitted, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [
        randomUUID(), merchantId, `TXN-CB-${String(i).padStart(4, "0")}`,
        Math.floor(Math.random() * 500000) + 10000,
        currencies[i % currencies.length], reasons[i % reasons.length], status, dueDate,
        i % 3 === 0,
        status === "won" ? "Merchant provided proof of delivery" : status === "lost" ? "Customer confirmed unauthorized" : null,
      ]
    );
    cbCount++;
  } catch (e) { console.warn(`  skip chargeback ${i}: ${e.message}`); }
}
console.log(`✅ Seeded ${cbCount} chargebacks`);

// ─── Settlement SLA Events ──────────────────────────────────────────────────
const slaStatuses = ["pending", "processing", "completed", "breached", "delayed"];
let slaCount = 0;
for (let i = 0; i < 20; i++) {
  const merchantId = merchantIds[i % merchantIds.length];
  const slaStatus = slaStatuses[i % slaStatuses.length];
  const expectedBy = new Date(now + Math.random() * 86400000 * 2);
  const completedAt = slaStatus === "completed" ? new Date(expectedBy.getTime() - Math.random() * 3600000) : null;
  const slaBreached = slaStatus === "breached";
  try {
    await client.query(
      `INSERT INTO settlement_sla_events (id, settlement_id, merchant_id, amount_kobo, currency, status, expected_by, completed_at, sla_breached, notes, created_at, updated_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,NOW(),NOW())`,
      [
        randomUUID(), `SETTLE-${String(i).padStart(6, "0")}`, merchantId,
        Math.floor(Math.random() * 5000000) + 100000, "NGN", slaStatus,
        expectedBy, completedAt, slaBreached,
        slaBreached ? "Settlement delayed due to bank downtime" : null,
      ]
    );
    slaCount++;
  } catch (e) { console.warn(`  skip sla ${i}: ${e.message}`); }
}
console.log(`✅ Seeded ${slaCount} settlement SLA events`);

// ─── Merchant Risk Scores ───────────────────────────────────────────────────
let riskCount = 0;
for (let i = 0; i < merchantIds.length; i++) {
  const merchantId = merchantIds[i];
  const overallScore = Math.floor(Math.random() * 100);
  const riskLevel = overallScore < 25 ? "low" : overallScore < 50 ? "medium" : overallScore < 75 ? "high" : "critical";
  const factors = overallScore > 50
    ? JSON.stringify(["High chargeback ratio", "Multiple failed KYC attempts", "Unusual transaction velocity"])
    : JSON.stringify(["Clean transaction history", "KYC verified"]);
  try {
    await client.query(
      `INSERT INTO merchant_risk_scores (id, merchant_id, overall_score, risk_level, fraud_score, chargeback_score, kyc_score, transaction_score, velocity_score, factors, recommendation, calculated_at, created_at)
       VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,NOW(),NOW())
       ON CONFLICT (id) DO NOTHING`,
      [
        randomUUID(), merchantId, overallScore, riskLevel,
        Math.floor(overallScore * 0.3), Math.floor(overallScore * 0.25),
        Math.floor(overallScore * 0.2), Math.floor(overallScore * 0.15),
        Math.floor(overallScore * 0.1), factors,
        overallScore > 75 ? "Immediate review required — consider account suspension" :
          overallScore > 50 ? "Enhanced monitoring recommended" : "No action required",
      ]
    );
    riskCount++;
  } catch (e) { console.warn(`  skip risk ${merchantId}: ${e.message}`); }
}
console.log(`✅ Seeded ${riskCount} merchant risk scores`);

client.release();
await pool.end();
console.log("\n🎉 Wave 24 seed data complete!");
