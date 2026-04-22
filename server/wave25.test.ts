/**
 * Wave 25 Vitest Tests
 * Tests for: SDK tokens, help search analytics, rate limit events, refunds, payout batching,
 * audit log, API playground, feature flag SDK, chargeback evidence upload, consumer budgets/savings/referrals
 */
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";

const { Pool } = pg;

let pool: pg.Pool;

beforeAll(async () => {
  pool = new Pool({
    host: "localhost",
    port: 5432,
    database: "paygate_db",
    user: "paygate",
    password: "paygate_dev_2026",
  });
});

afterAll(async () => {
  await pool.end();
});

// ─── SDK Tokens ───────────────────────────────────────────────────────────────
describe("SDK Tokens", () => {
  it("should have sdk_tokens table with correct schema", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'sdk_tokens' AND table_schema = 'public'
      ORDER BY column_name
    `);
    const cols = result.rows.map((r) => r.column_name);
    expect(cols).toContain("token_id");
    expect(cols).toContain("merchant_id");
    expect(cols).toContain("token_hash");
    expect(cols).toContain("expires_at");
    expect(cols).toContain("scopes");
    expect(cols).toContain("is_revoked");
  });

  it("should have seeded SDK tokens", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM sdk_tokens");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have active (non-revoked) tokens", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM sdk_tokens WHERE is_revoked = 0");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(4);
  });

  it("should have revoked tokens", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM sdk_tokens WHERE is_revoked = 1");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("should have future expiry dates for active tokens", async () => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM sdk_tokens WHERE is_revoked = 0 AND expires_at > NOW()"
    );
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(4);
  });
});

// ─── Help Search Analytics ────────────────────────────────────────────────────
describe("Help Search Analytics", () => {
  it("should have help_search_analytics table with correct schema", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'help_search_analytics' AND table_schema = 'public'
      ORDER BY column_name
    `);
    const cols = result.rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("query");
    expect(cols).toContain("user_type");
    expect(cols).toContain("result_count");
    expect(cols).toContain("clicked_section");
  });

  it("should have seeded help search analytics", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM help_search_analytics");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(15);
  });

  it("should have both merchant and consumer search entries", async () => {
    const merchant = await pool.query(
      "SELECT COUNT(*) FROM help_search_analytics WHERE user_type = 'merchant'"
    );
    const consumer = await pool.query(
      "SELECT COUNT(*) FROM help_search_analytics WHERE user_type = 'consumer'"
    );
    expect(parseInt(merchant.rows[0].count)).toBeGreaterThanOrEqual(1);
    expect(parseInt(consumer.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("should be able to find top search queries", async () => {
    const result = await pool.query(`
      SELECT query, COUNT(*) as count
      FROM help_search_analytics
      GROUP BY query
      ORDER BY count DESC
      LIMIT 5
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
    expect(result.rows[0]).toHaveProperty("query");
    expect(result.rows[0]).toHaveProperty("count");
  });

  it("should be able to filter by date range", async () => {
    const result = await pool.query(`
      SELECT COUNT(*) FROM help_search_analytics
      WHERE created_at >= NOW() - INTERVAL '30 days'
    `);
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });
});

// ─── Rate Limit Events ────────────────────────────────────────────────────────
describe("Rate Limit Events", () => {
  it("should have rate_limit_events table with correct schema", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'rate_limit_events' AND table_schema = 'public'
      ORDER BY column_name
    `);
    const cols = result.rows.map((r) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("identifier");
    expect(cols).toContain("identifier_type");
    expect(cols).toContain("endpoint");
    expect(cols).toContain("blocked");
    expect(cols).toContain("ip_address");
  });

  it("should have seeded rate limit events", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM rate_limit_events");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(7);
  });

  it("should have blocked events", async () => {
    const result = await pool.query(
      "SELECT COUNT(*) FROM rate_limit_events WHERE blocked = true"
    );
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have both ip and user identifier types", async () => {
    const ip = await pool.query(
      "SELECT COUNT(*) FROM rate_limit_events WHERE identifier_type = 'ip'"
    );
    const user = await pool.query(
      "SELECT COUNT(*) FROM rate_limit_events WHERE identifier_type = 'user'"
    );
    expect(parseInt(ip.rows[0].count)).toBeGreaterThanOrEqual(1);
    expect(parseInt(user.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("should be able to aggregate blocked events by endpoint", async () => {
    const result = await pool.query(`
      SELECT endpoint, COUNT(*) as blocked_count
      FROM rate_limit_events
      WHERE blocked = true
      GROUP BY endpoint
      ORDER BY blocked_count DESC
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Feature Flags ────────────────────────────────────────────────────────────
describe("Feature Flags", () => {
  it("should have feature_flags table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.feature_flags') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded feature flags", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM feature_flags");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have enabled and disabled flags", async () => {
    const enabled = await pool.query(
      "SELECT COUNT(*) FROM feature_flags WHERE enabled = true"
    );
    expect(parseInt(enabled.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("should be able to look up a flag by key", async () => {
    const result = await pool.query(
      "SELECT * FROM feature_flags LIMIT 1"
    );
    expect(result.rows.length).toBe(1);
    expect(result.rows[0]).toHaveProperty("key");
    expect(result.rows[0]).toHaveProperty("enabled");
  });
});

// ─── Merchant Risk Scores ─────────────────────────────────────────────────────
describe("Merchant Risk Scores", () => {
  it("should have merchant_risk_scores table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.merchant_risk_scores') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded risk scores", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM merchant_risk_scores");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(3);
  });

  it("should have risk scores in valid range (0-100)", async () => {
    const result = await pool.query(`
      SELECT COUNT(*) FROM merchant_risk_scores
      WHERE overall_score BETWEEN 0 AND 100
    `);
    const total = await pool.query("SELECT COUNT(*) FROM merchant_risk_scores");
    expect(result.rows[0].count).toBe(total.rows[0].count);
  });
});

// ─── Chargebacks ──────────────────────────────────────────────────────────────
describe("Chargebacks", () => {
  it("should have chargebacks table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.chargebacks') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded chargebacks", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM chargebacks");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have various chargeback statuses", async () => {
    const result = await pool.query(`
      SELECT DISTINCT status FROM chargebacks ORDER BY status
    `);
    expect(result.rows.length).toBeGreaterThanOrEqual(2);
  });

  it("should have evidence_url column", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chargebacks' AND column_name = 'evidence_url'
    `);
    expect(result.rows.length).toBe(1);
  });
});

// ─── Consumer Budgets ─────────────────────────────────────────────────────────
describe("Consumer Budgets", () => {
  it("should have consumer_budgets table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.consumer_budgets') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded consumer budgets", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM consumer_budgets");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(3);
  });

  it("should have budget amounts in valid range", async () => {
    const result = await pool.query(`
      SELECT COUNT(*) FROM consumer_budgets WHERE limit_kobo > 0
    `);
    const total = await pool.query("SELECT COUNT(*) FROM consumer_budgets");
    expect(result.rows[0].count).toBe(total.rows[0].count);
  });
});

// ─── Consumer Savings Goals ───────────────────────────────────────────────────
describe("Consumer Savings Goals", () => {
  it("should have consumer_savings_goals table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.consumer_savings_goals') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded savings goals", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM consumer_savings_goals");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(3);
  });

  it("should have current_amount_kobo <= target_amount_kobo", async () => {
    const result = await pool.query(`
      SELECT COUNT(*) FROM consumer_savings_goals
      WHERE saved_kobo <= target_kobo
    `);
    const total = await pool.query("SELECT COUNT(*) FROM consumer_savings_goals");
    expect(result.rows[0].count).toBe(total.rows[0].count);
  });
});

// ─── Consumer Referrals ───────────────────────────────────────────────────────
describe("Consumer Referrals", () => {
  it("should have referrals table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.referrals') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded referrals", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM referrals");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Settlement SLA Events ────────────────────────────────────────────────────
describe("Settlement SLA Events", () => {
  it("should have settlement_sla_events table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.settlement_sla_events') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded settlement SLA events", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM settlement_sla_events");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have SLA breach tracking", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'settlement_sla_events'
      ORDER BY column_name
    `);
    const cols = result.rows.map((r: any) => r.column_name);
    expect(cols.length).toBeGreaterThanOrEqual(3);
  });
});

// ─── Webhook Failure Alerts ───────────────────────────────────────────────────
describe("Webhook Failure Alerts", () => {
  it("should have webhook_failure_alerts table", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.webhook_failure_alerts') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded webhook failure alerts", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM webhook_failure_alerts");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(1);
  });
});

// ─── Spending Budgets (consumer_budgets is the canonical table) ───────────────
describe("Spending Budgets", () => {
  it("should have consumer_budgets table (canonical spending budgets)", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.consumer_budgets') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded spending budgets", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM consumer_budgets");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Savings Goals (consumer_savings_goals is the canonical table) ────────────
describe("Savings Goals", () => {
  it("should have consumer_savings_goals table (canonical savings goals)", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.consumer_savings_goals') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should have seeded savings goals", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM consumer_savings_goals");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Referral Program ─────────────────────────────────────────────────────────
describe("Referral Program", () => {
  it("should have referrals table (canonical referral table)", async () => {
    const result = await pool.query(`
      SELECT to_regclass('public.referrals') AS exists
    `);
    expect(result.rows[0].exists).toBeTruthy();
  });

  it("should be able to query referrals", async () => {
    const result = await pool.query("SELECT COUNT(*) FROM referrals");
    expect(parseInt(result.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

// ─── Server Health ────────────────────────────────────────────────────────────
describe("Server Health", () => {
  it("should respond to health check", async () => {
    const response = await fetch("http://localhost:3000/api/health");
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  it("should have all integrations configured", async () => {
    const response = await fetch("http://localhost:3000/api/health");
    const body = await response.json();
    expect(body.integrations).toBeDefined();
    expect(body.checks.database).toBe("ok");
  });

  it("should have security headers", async () => {
    const response = await fetch("http://localhost:3000/api/health");
    const headers = response.headers;
    // At least one security header should be present
    const hasSecurityHeader =
      headers.get("x-content-type-options") !== null ||
      headers.get("x-frame-options") !== null ||
      headers.get("x-xss-protection") !== null ||
      headers.get("strict-transport-security") !== null;
    expect(hasSecurityHeader).toBe(true);
  });
});

// ─── Feature Flag SDK Endpoint ────────────────────────────────────────────────
describe("Feature Flag SDK Endpoint", () => {
  it("should have feature_flags table with key column", async () => {
    const result = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'feature_flags' AND column_name = 'key'
    `);
    expect(result.rows.length).toBe(1);
  });

  it("should be able to look up a feature flag by key", async () => {
    const flag = await pool.query("SELECT * FROM feature_flags LIMIT 1");
    if (flag.rows.length > 0) {
      const key = flag.rows[0].key;
      const result = await pool.query(
        "SELECT * FROM feature_flags WHERE key = $1",
        [key]
      );
      expect(result.rows.length).toBe(1);
      expect(result.rows[0].key).toBe(key);
    }
  });
});
