/**
 * pgMemSetup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Vitest global setup that replaces the `pg` module with an in-memory
 * PostgreSQL emulator (pg-mem) so PG-dependent tests run without a real DB.
 *
 * This file is referenced in vitest.config.ts as a setupFile.
 * It patches the module registry BEFORE any test file imports `pg`.
 */
import { newDb } from "pg-mem";
import { vi } from "vitest";

// Create a single shared in-memory DB instance for the entire test run
const pgMemDb = newDb();

// Seed all tables that the PG-dependent test files require
async function seedPgMemDb() {
  const pool = pgMemDb.adapters.createPg().Pool;
  const p = new pool();

  const ddl = `
    -- Wave 27 tables
    CREATE TABLE IF NOT EXISTS bnpl_applications (
      id SERIAL PRIMARY KEY,
      consumer_id TEXT NOT NULL,
      requested_limit INTEGER NOT NULL DEFAULT 0,
      approved_limit INTEGER,
      score NUMERIC,
      status TEXT DEFAULT 'pending',
      monthly_income NUMERIC,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS loyalty_tier_configs (
      id SERIAL PRIMARY KEY,
      tier_name TEXT NOT NULL UNIQUE,
      min_points INTEGER NOT NULL DEFAULT 0,
      max_points INTEGER,
      cashback_rate NUMERIC NOT NULL DEFAULT 0.5,
      bonus_multiplier NUMERIC NOT NULL DEFAULT 1.0,
      perks_description TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS payout_approvals (
      id SERIAL PRIMARY KEY,
      payout_id TEXT NOT NULL,
      approver_id TEXT NOT NULL,
      status TEXT DEFAULT 'pending',
      approved_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhook_retry_queue (
      id SERIAL PRIMARY KEY,
      webhook_id TEXT NOT NULL,
      endpoint_url TEXT NOT NULL,
      payload JSONB,
      attempt_count INTEGER DEFAULT 0,
      next_retry_at TIMESTAMPTZ,
      status TEXT DEFAULT 'pending',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS kyb_verifications (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      document_type TEXT,
      document_url TEXT,
      status TEXT DEFAULT 'pending',
      reviewer_id TEXT,
      reviewed_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS compliance_reports (
      id SERIAL PRIMARY KEY,
      report_type TEXT NOT NULL,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      generated_by TEXT,
      file_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Wave 28 / Wave 81 tables
    CREATE TABLE IF NOT EXISTS tenants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      slug TEXT NOT NULL UNIQUE,
      plan TEXT DEFAULT 'starter',
      status TEXT DEFAULT 'active',
      owner_id TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tenant_billing (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id),
      billing_period TEXT NOT NULL,
      amount_kobo BIGINT NOT NULL DEFAULT 0,
      status TEXT DEFAULT 'pending',
      invoice_url TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS tenant_usage_metrics (
      id SERIAL PRIMARY KEY,
      tenant_id INTEGER REFERENCES tenants(id),
      metric_name TEXT NOT NULL,
      metric_value NUMERIC NOT NULL DEFAULT 0,
      recorded_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Wave 29 / Wave 82 tables
    CREATE TABLE IF NOT EXISTS api_keys (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      key_hash TEXT NOT NULL UNIQUE,
      label TEXT,
      scopes TEXT[],
      is_active BOOLEAN DEFAULT TRUE,
      last_used_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      revoked_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS rate_limit_events (
      id SERIAL PRIMARY KEY,
      ip_address TEXT NOT NULL,
      endpoint TEXT NOT NULL,
      request_count INTEGER DEFAULT 1,
      window_start TIMESTAMPTZ DEFAULT NOW(),
      blocked BOOLEAN DEFAULT FALSE
    );
    CREATE TABLE IF NOT EXISTS audit_logs (
      id SERIAL PRIMARY KEY,
      actor_id TEXT NOT NULL,
      action TEXT NOT NULL,
      resource_type TEXT,
      resource_id TEXT,
      ip_address TEXT,
      user_agent TEXT,
      metadata JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Wave 30 / Wave 83 tables
    CREATE TABLE IF NOT EXISTS sla_metrics (
      id SERIAL PRIMARY KEY,
      service_name TEXT NOT NULL,
      uptime_pct NUMERIC NOT NULL DEFAULT 99.9,
      avg_latency_ms INTEGER DEFAULT 0,
      p99_latency_ms INTEGER DEFAULT 0,
      error_rate NUMERIC DEFAULT 0,
      period_start TIMESTAMPTZ NOT NULL,
      period_end TIMESTAMPTZ NOT NULL,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS fx_hedge_positions (
      id SERIAL PRIMARY KEY,
      currency_pair TEXT NOT NULL,
      notional_amount NUMERIC NOT NULL,
      hedge_rate NUMERIC NOT NULL,
      direction TEXT NOT NULL DEFAULT 'buy',
      status TEXT DEFAULT 'open',
      opened_at TIMESTAMPTZ DEFAULT NOW(),
      closed_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS middleware_health_checks (
      id SERIAL PRIMARY KEY,
      service_name TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'healthy',
      latency_ms INTEGER DEFAULT 0,
      checked_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Wave 31 / Wave 84 tables
    CREATE TABLE IF NOT EXISTS ussd_sessions (
      id SERIAL PRIMARY KEY,
      session_id TEXT NOT NULL UNIQUE,
      msisdn TEXT NOT NULL,
      session_token TEXT NOT NULL,
      state TEXT DEFAULT 'active',
      menu_stack JSONB,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      expires_at TIMESTAMPTZ
    );
    CREATE TABLE IF NOT EXISTS billing_cron_logs (
      id SERIAL PRIMARY KEY,
      run_at TIMESTAMPTZ DEFAULT NOW(),
      tenants_billed INTEGER DEFAULT 0,
      total_amount_kobo BIGINT DEFAULT 0,
      status TEXT DEFAULT 'success',
      error_message TEXT
    );
    CREATE TABLE IF NOT EXISTS delinquent_accounts (
      id SERIAL PRIMARY KEY,
      merchant_id TEXT NOT NULL,
      amount_overdue_kobo BIGINT NOT NULL DEFAULT 0,
      days_overdue INTEGER DEFAULT 0,
      status TEXT DEFAULT 'active',
      masked_account TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    -- Smoke test tables
    CREATE TABLE IF NOT EXISTS merchants (
      id SERIAL PRIMARY KEY,
      name TEXT NOT NULL,
      email TEXT NOT NULL UNIQUE,
      status TEXT DEFAULT 'active',
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS transactions (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER,
      amount_kobo BIGINT NOT NULL,
      currency TEXT DEFAULT 'NGN',
      status TEXT DEFAULT 'pending',
      reference TEXT UNIQUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhooks (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER,
      endpoint_url TEXT NOT NULL,
      events TEXT[],
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS webhook_deliveries (
      id SERIAL PRIMARY KEY,
      webhook_id INTEGER REFERENCES webhooks(id),
      event_type TEXT NOT NULL,
      payload JSONB,
      status TEXT DEFAULT 'pending',
      response_code INTEGER,
      delivered_at TIMESTAMPTZ,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS virtual_cards (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER,
      card_number_masked TEXT NOT NULL,
      status TEXT DEFAULT 'active',
      spend_limit_kobo BIGINT DEFAULT 0,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS fx_rates (
      id SERIAL PRIMARY KEY,
      base_currency TEXT NOT NULL,
      quote_currency TEXT NOT NULL,
      rate NUMERIC NOT NULL,
      source TEXT DEFAULT 'internal',
      fetched_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pos_terminals (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER,
      terminal_id TEXT NOT NULL UNIQUE,
      model TEXT,
      status TEXT DEFAULT 'active',
      location TEXT,
      created_at TIMESTAMPTZ DEFAULT NOW()
    );
    CREATE TABLE IF NOT EXISTS pos_products (
      id SERIAL PRIMARY KEY,
      merchant_id INTEGER,
      name TEXT NOT NULL,
      sku TEXT UNIQUE,
      price_kobo BIGINT NOT NULL DEFAULT 0,
      category TEXT,
      stock_count INTEGER DEFAULT 0,
      is_active BOOLEAN DEFAULT TRUE,
      created_at TIMESTAMPTZ DEFAULT NOW(),
      updated_at TIMESTAMPTZ DEFAULT NOW()
    );
  `;

  // Execute DDL statements one by one
  const statements = ddl.split(';').map(s => s.trim()).filter(s => s.length > 0);
  for (const stmt of statements) {
    try {
      await p.query(stmt);
    } catch (e: any) {
      // Ignore "already exists" errors
      if (!e.message?.includes('already exists')) {
        console.warn(`[pgMemSetup] DDL warning: ${e.message} for: ${stmt.slice(0, 60)}`);
      }
    }
  }

  // Seed data for tests that expect COUNT >= 10
  for (let i = 1; i <= 15; i++) {
    try {
      await p.query(
        `INSERT INTO bnpl_applications (consumer_id, requested_limit, score, status, monthly_income)
         VALUES ($1, $2, $3, $4, $5)`,
        [`consumer_${i}`, i * 50000, 600 + i * 10, i % 3 === 0 ? 'approved' : 'pending', i * 100000]
      );
    } catch { /* ignore duplicates */ }
  }

  for (const tier of ['Bronze', 'Silver', 'Gold', 'Platinum']) {
    try {
      await p.query(
        `INSERT INTO loyalty_tier_configs (tier_name, min_points, cashback_rate, bonus_multiplier)
         VALUES ($1, $2, $3, $4)`,
        [tier, tier === 'Bronze' ? 0 : tier === 'Silver' ? 1000 : tier === 'Gold' ? 5000 : 20000,
         tier === 'Bronze' ? 0.5 : tier === 'Silver' ? 1.0 : tier === 'Gold' ? 1.5 : 2.0,
         tier === 'Bronze' ? 1.0 : tier === 'Silver' ? 1.2 : tier === 'Gold' ? 1.5 : 2.0]
      );
    } catch { /* ignore duplicates */ }
  }

  for (let i = 1; i <= 5; i++) {
    try {
      await p.query(
        `INSERT INTO tenants (name, slug, plan, status) VALUES ($1, $2, $3, $4)`,
        [`Tenant ${i}`, `tenant-${i}`, i % 2 === 0 ? 'growth' : 'starter', 'active']
      );
    } catch { /* ignore duplicates */ }
  }

  for (let i = 1; i <= 10; i++) {
    try {
      await p.query(
        `INSERT INTO merchants (name, email, status) VALUES ($1, $2, $3)`,
        [`Merchant ${i}`, `merchant${i}@example.com`, 'active']
      );
    } catch { /* ignore duplicates */ }
  }

  await p.end();
}

// Export the pg-mem db for use in tests
export { pgMemDb };

// Run the seed
await seedPgMemDb();

// Patch the `pg` module so all test files get pg-mem instead of real pg
vi.mock("pg", async () => {
  const { newDb } = await import("pg-mem");
  // Reuse the same shared DB instance
  const { pgMemDb } = await import("./pgMemSetup.js");
  const pgAdapter = pgMemDb.adapters.createPg();
  return {
    default: pgAdapter,
    Pool: pgAdapter.Pool,
    Client: pgAdapter.Client,
    types: {
      setTypeParser: () => {},
      getTypeParser: () => (val: string) => val,
    },
  };
});
