/**
 * Wave 25 Seed Script
 * Seeds: sdk_tokens, payout_batches, refunds, help_search_analytics, rate_limit_events
 */
import pg from "pg";
import crypto from "crypto";

const { Pool } = pg;

const pool = new Pool({
  host: "localhost",
  port: 5432,
  database: "paygate_dev",
  user: "paygate",
  password: "paygate_dev_2026",
});

const randomId = () => crypto.randomUUID();
const randomHex = (n = 32) => crypto.randomBytes(n).toString("hex");

async function seedSdkTokens(client) {
  console.log("Seeding sdk_tokens...");
  // Actual schema: token_id, merchant_id, token_hash, expires_at, scopes, is_revoked, created_at
  const tokens = [
    { merchant_id: "merchant_001", scopes: ["read", "transactions"], is_revoked: 0 },
    { merchant_id: "merchant_002", scopes: ["read", "write", "payouts"], is_revoked: 0 },
    { merchant_id: "merchant_003", scopes: ["admin"], is_revoked: 0 },
    { merchant_id: "merchant_004", scopes: ["read"], is_revoked: 1 },
    { merchant_id: "merchant_005", scopes: ["read", "write"], is_revoked: 0 },
  ];

  for (const t of tokens) {
    const tokenId = `tok_${randomHex(16)}`;
    const expiresAt = new Date(Date.now() + 365 * 24 * 3600 * 1000);
    await client.query(`
      INSERT INTO sdk_tokens (token_id, merchant_id, token_hash, expires_at, scopes, is_revoked, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, NOW())
      ON CONFLICT (token_id) DO NOTHING
    `, [tokenId, t.merchant_id, randomHex(32), expiresAt, JSON.stringify(t.scopes), t.is_revoked]);
  }
  console.log(`  Inserted ${tokens.length} SDK tokens`);
}

async function seedHelpSearchAnalytics(client) {
  console.log("Seeding help_search_analytics (Wave 25 entries)...");

  const tableCheck = await client.query(`SELECT to_regclass('public.help_search_analytics') AS exists`);
  if (!tableCheck.rows[0].exists) {
    console.log("  help_search_analytics table not found, skipping");
    return;
  }

  const queries = [
    { query: "how to refund", source: "merchant", results_count: 3, clicked_result: "refund-guide" },
    { query: "payout batch", source: "merchant", results_count: 5, clicked_result: "payout-batching" },
    { query: "sdk token", source: "merchant", results_count: 2, clicked_result: "sdk-tokens" },
    { query: "rate limit exceeded", source: "merchant", results_count: 1, clicked_result: "rate-limits" },
    { query: "chargeback evidence", source: "merchant", results_count: 4, clicked_result: "chargebacks" },
    { query: "wallet balance", source: "consumer", results_count: 6, clicked_result: "wallet-guide" },
    { query: "bnpl limit", source: "consumer", results_count: 3, clicked_result: "bnpl-guide" },
    { query: "dispute transaction", source: "consumer", results_count: 5, clicked_result: "disputes-guide" },
    { query: "referral code", source: "consumer", results_count: 2, clicked_result: "referrals-guide" },
    { query: "savings goal", source: "consumer", results_count: 4, clicked_result: "savings-guide" },
    { query: "budget alert", source: "consumer", results_count: 3, clicked_result: "budgets-guide" },
    { query: "kyc upgrade", source: "consumer", results_count: 5, clicked_result: "kyc-guide" },
    { query: "api key", source: "merchant", results_count: 4, clicked_result: "api-keys-guide" },
    { query: "webhook setup", source: "merchant", results_count: 6, clicked_result: "webhooks-guide" },
    { query: "settlement timing", source: "merchant", results_count: 3, clicked_result: "settlements-guide" },
  ];

  for (const q of queries) {
    const daysAgo = Math.floor(Math.random() * 30);
    await client.query(`
      INSERT INTO help_search_analytics (id, query, source, results_count, clicked_result, created_at)
      VALUES ($1, $2, $3, $4, $5, NOW() - INTERVAL '${daysAgo} days')
      ON CONFLICT DO NOTHING
    `, [randomId(), q.query, q.source, q.results_count, q.clicked_result]);
  }
  console.log(`  Inserted ${queries.length} help search analytics entries`);
}

async function seedRateLimitEvents(client) {
  console.log("Seeding rate_limit_events...");

  const tableCheck = await client.query(`SELECT to_regclass('public.rate_limit_events') AS exists`);
  if (!tableCheck.rows[0].exists) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS rate_limit_events (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        ip TEXT,
        user_id UUID,
        endpoint TEXT NOT NULL,
        limit_type TEXT NOT NULL DEFAULT 'api',
        blocked_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  Created rate_limit_events table");
  }

  const endpoints = ["/api/trpc/transactions.list", "/api/trpc/auth.me", "/api/trpc/payouts.create", "/api/stripe/webhook", "/api/trpc/customers.list"];
  const ips = ["102.89.45.12", "197.210.54.89", "41.58.102.34", "154.113.22.67", "197.149.85.44"];

  for (let i = 0; i < 25; i++) {
    const hoursAgo = Math.floor(Math.random() * 72);
    await client.query(`
      INSERT INTO rate_limit_events (id, ip, endpoint, limit_type, blocked_at, created_at)
      VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${hoursAgo} hours', NOW() - INTERVAL '${hoursAgo} hours')
      ON CONFLICT DO NOTHING
    `, [randomId(), ips[i % ips.length], endpoints[i % endpoints.length], i % 3 === 0 ? "auth" : "api"]);
  }
  console.log("  Inserted 25 rate limit events");
}

async function seedRefunds(client) {
  console.log("Seeding refunds table...");

  const tableCheck = await client.query(`SELECT to_regclass('public.refunds') AS exists`);
  if (!tableCheck.rows[0].exists) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS refunds (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        transaction_id UUID,
        amount_kobo INTEGER NOT NULL,
        reason TEXT NOT NULL,
        status TEXT NOT NULL DEFAULT 'pending',
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  Created refunds table");
  }

  const reasons = ["Customer request", "Duplicate charge", "Product not delivered", "Wrong amount charged", "Fraudulent transaction"];
  const statuses = ["pending", "success", "failed", "pending", "success"];

  for (let i = 0; i < 15; i++) {
    const daysAgo = Math.floor(Math.random() * 30);
    const amountKobo = (Math.floor(Math.random() * 50000) + 5000) * 100;
    await client.query(`
      INSERT INTO refunds (id, amount_kobo, reason, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${daysAgo} days')
      ON CONFLICT DO NOTHING
    `, [randomId(), amountKobo, reasons[i % reasons.length], statuses[i % statuses.length]]);
  }
  console.log("  Inserted 15 refunds");
}

async function seedPayoutBatches(client) {
  console.log("Seeding payout_batches table...");

  const tableCheck = await client.query(`SELECT to_regclass('public.payout_batches') AS exists`);
  if (!tableCheck.rows[0].exists) {
    await client.query(`
      CREATE TABLE IF NOT EXISTS payout_batches (
        id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
        payout_count INTEGER NOT NULL DEFAULT 0,
        total_amount_kobo BIGINT NOT NULL DEFAULT 0,
        status TEXT NOT NULL DEFAULT 'pending',
        processed_at TIMESTAMPTZ,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);
    console.log("  Created payout_batches table");
  }

  const statuses = ["approved", "pending", "approved", "failed", "approved"];
  for (let i = 0; i < 10; i++) {
    const daysAgo = Math.floor(Math.random() * 14);
    const count = Math.floor(Math.random() * 20) + 3;
    const totalKobo = count * (Math.floor(Math.random() * 100000) + 50000) * 100;
    await client.query(`
      INSERT INTO payout_batches (id, payout_count, total_amount_kobo, status, created_at, updated_at)
      VALUES ($1, $2, $3, $4, NOW() - INTERVAL '${daysAgo} days', NOW() - INTERVAL '${daysAgo} days')
      ON CONFLICT DO NOTHING
    `, [randomId(), count, totalKobo, statuses[i % statuses.length]]);
  }
  console.log("  Inserted 10 payout batches");
}

async function main() {
  const client = await pool.connect();
  try {
    console.log("=== Wave 25 Seed Script ===");
    await seedSdkTokens(client);
    await seedHelpSearchAnalytics(client);
    await seedRateLimitEvents(client);
    await seedRefunds(client);
    await seedPayoutBatches(client);
    console.log("\n✅ Wave 25 seed complete!");
  } catch (err) {
    console.error("Seed error:", err.message);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

main();
