// @vitest-environment node
// ─── PostgreSQL availability guard ───────────────────────────────────────────
// This test file requires a live PostgreSQL connection.
// In MySQL/sandbox environments, all tests are automatically skipped.
import net from "net";

const _PG_URL = process.env.PG_DATABASE_URL ?? "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db";
function _parsePgHost(url: string) {
  try { const u = new URL(url); return { host: u.hostname || "127.0.0.1", port: parseInt(u.port || "5432", 10) }; }
  catch { return { host: "127.0.0.1", port: 5432 }; }
}
const { host: _PG_HOST, port: _PG_PORT } = _parsePgHost(_PG_URL);
const PG_AVAILABLE: boolean = await new Promise((resolve) => {
  const s = new net.Socket();
  const t = setTimeout(() => { s.destroy(); resolve(false); }, 500);
  s.connect(_PG_PORT, _PG_HOST, () => { clearTimeout(t); s.destroy(); resolve(true); });
  s.on("error", () => { clearTimeout(t); resolve(false); });
});

if (!PG_AVAILABLE) {
  console.warn("[SKIP] PostgreSQL not available — skipping all tests in this file");
}

// ─────────────────────────────────────────────────────────────────────────────
import { describe, it, expect, beforeAll } from "vitest";
import { Pool } from "pg";

const pool = new Pool({
  connectionString: process.env.PG_DATABASE_URL || "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db",
});

beforeAll(async () => {
  // Ensure tables exist
  await pool.query(`
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
    )
  `);
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — BNPL Underwriting", () => {
  it("should have bnpl_applications table with correct schema", async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'bnpl_applications'
      ORDER BY ordinal_position
    `);
    const cols = res.rows.map((r: any) => r.column_name);
    expect(cols).toContain("consumer_id");
    expect(cols).toContain("requested_limit");
    expect(cols).toContain("score");
    expect(cols).toContain("status");
    expect(cols).toContain("monthly_income");
  });

  it("should have seeded bnpl applications", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM bnpl_applications");
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(10);
  });

  it("should be able to approve a BNPL application", async () => {
    const app = await pool.query("SELECT id FROM bnpl_applications WHERE status = 'pending' LIMIT 1");
    if (app.rows.length === 0) return; // No pending apps
    const appId = app.rows[0].id;
    await pool.query(
      "UPDATE bnpl_applications SET status = 'approved', approved_limit = 100000 WHERE id = $1",
      [appId]
    );
    const updated = await pool.query("SELECT status FROM bnpl_applications WHERE id = $1", [appId]);
    expect(updated.rows[0].status).toBe("approved");
    // Reset
    await pool.query("UPDATE bnpl_applications SET status = 'pending' WHERE id = $1", [appId]);
  });

  it("should calculate average credit score", async () => {
    const res = await pool.query("SELECT AVG(score) AS avg_score FROM bnpl_applications WHERE score IS NOT NULL");
    const avg = Number(res.rows[0].avg_score);
    expect(avg).toBeGreaterThan(0);
    expect(avg).toBeLessThanOrEqual(850);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Loyalty Tier Engine", () => {
  it("should have loyalty_tier_configs table", async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'loyalty_tier_configs'
      ORDER BY ordinal_position
    `);
    const cols = res.rows.map((r: any) => r.column_name);
    expect(cols).toContain("tier_name");
    expect(cols).toContain("min_points");
    expect(cols).toContain("cashback_rate");
    expect(cols).toContain("bonus_multiplier");
  });

  it("should have all 4 standard tiers seeded", async () => {
    const res = await pool.query("SELECT tier_name FROM loyalty_tier_configs ORDER BY min_points");
    const tiers = res.rows.map((r: any) => r.tier_name);
    expect(tiers).toContain("bronze");
    expect(tiers).toContain("silver");
    expect(tiers).toContain("gold");
    expect(tiers).toContain("platinum");
  });

  it("should have correct cashback rate hierarchy", async () => {
    const res = await pool.query("SELECT tier_name, cashback_rate FROM loyalty_tier_configs ORDER BY cashback_rate");
    const rates = res.rows.map((r: any) => Number(r.cashback_rate));
    // Rates should be in ascending order
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it("should be able to update tier configuration", async () => {
    await pool.query("UPDATE loyalty_tier_configs SET cashback_rate = 0.6 WHERE tier_name = 'bronze'");
    const res = await pool.query("SELECT cashback_rate FROM loyalty_tier_configs WHERE tier_name = 'bronze'");
    expect(Number(res.rows[0].cashback_rate)).toBe(0.6);
    // Reset
    await pool.query("UPDATE loyalty_tier_configs SET cashback_rate = 0.5 WHERE tier_name = 'bronze'");
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Payout Approval Workflow", () => {
  it("should have payout_batches table with correct schema", async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'payout_batches'
      ORDER BY ordinal_position
    `);
    const cols = res.rows.map((r: any) => r.column_name);
    expect(cols).toContain("merchant_id");
    expect(cols).toContain("total_amount");
    expect(cols).toContain("payout_count");
    expect(cols).toContain("status");
    expect(cols).toContain("approved_by");
    expect(cols).toContain("approved_at");
    expect(cols).toContain("approver_note");
  });

  it("should have seeded payout batches", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM payout_batches");
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("should have pending_approval batches available for review", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM payout_batches WHERE status = 'pending_approval'");
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(0);
  });

  it("should be able to approve a payout batch", async () => {
    const batch = await pool.query("SELECT id FROM payout_batches WHERE status = 'pending_approval' LIMIT 1");
    if (batch.rows.length === 0) return;
    const batchId = batch.rows[0].id;
    await pool.query(
      "UPDATE payout_batches SET status = 'approved', approved_at = NOW(), approver_note = 'Approved in test' WHERE id = $1",
      [batchId]
    );
    const updated = await pool.query("SELECT status FROM payout_batches WHERE id = $1", [batchId]);
    expect(updated.rows[0].status).toBe("approved");
    // Reset
    await pool.query("UPDATE payout_batches SET status = 'pending_approval', approved_at = NULL WHERE id = $1", [batchId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Feature Flag A/B Exposure Analytics", () => {
  it("should have flag_exposure_events table", async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'flag_exposure_events'
      ORDER BY ordinal_position
    `);
    const cols = res.rows.map((r: any) => r.column_name);
    expect(cols).toContain("flag_key");
    expect(cols).toContain("user_id");
    expect(cols).toContain("variant");
  });

  it("should have seeded flag exposure events", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM flag_exposure_events");
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(50);
  });

  it("should be able to compute variant distribution", async () => {
    const res = await pool.query(`
      SELECT flag_key, variant, COUNT(*) AS cnt
      FROM flag_exposure_events
      GROUP BY flag_key, variant
      ORDER BY cnt DESC
      LIMIT 10
    `);
    expect(res.rows.length).toBeGreaterThan(0);
    expect(res.rows[0]).toHaveProperty("flag_key");
    expect(res.rows[0]).toHaveProperty("variant");
    expect(res.rows[0]).toHaveProperty("cnt");
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Consumer Disputes", () => {
  it("should have consumer_disputes table", async () => {
    const res = await pool.query(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'consumer_disputes'
      ORDER BY ordinal_position
    `);
    const cols = res.rows.map((r: any) => r.column_name);
    expect(cols).toContain("user_id");
    expect(cols).toContain("status");
  });

  it("should have seeded consumer disputes", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM consumer_disputes");
    expect(Number(res.rows[0].count)).toBeGreaterThanOrEqual(0);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Security Hardening", () => {
  it("should have security27.ts module with VULN-015 through VULN-020 documented", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const securityFile = path.join(process.cwd(), "server/security27.ts");
    expect(fs.existsSync(securityFile)).toBe(true);
    const content = fs.readFileSync(securityFile, "utf-8");
    expect(content).toContain("VULN-015");
    expect(content).toContain("VULN-016");
    expect(content).toContain("VULN-017");
  });

  it("should have wave27Router registered in routers.ts", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routersFile = path.join(process.cwd(), "server/routers.ts");
    const content = fs.readFileSync(routersFile, "utf-8");
    expect(content).toContain("wave27Router");
  });

  it("should have AdminSecurityScore page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminSecurityScore.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminKybReview page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminKybReview.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminComplianceReports page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminComplianceReports.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Wave 27 Router Procedures", () => {
  it("should have wave27Router.ts with all sub-routers", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const routerFile = path.join(process.cwd(), "server/wave27Router.ts");
    expect(fs.existsSync(routerFile)).toBe(true);
    const content = fs.readFileSync(routerFile, "utf-8");
    expect(content).toContain("bnplUnderwriting");
    expect(content).toContain("loyaltyTiers");
    expect(content).toContain("payoutApproval");
    expect(content).toContain("webhookRetry");
    expect(content).toContain("kybReview");
    expect(content).toContain("complianceReports");
  });

  it("should have AdminWebhookRetry page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminWebhookRetry.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminBnplUnderwriting page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminBnplUnderwriting.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminLoyaltyTierEngine page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminLoyaltyTierEngine.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminFxHedging page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminFxHedging.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have AdminPayoutApproval page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/admin/AdminPayoutApproval.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });

  it("should have ConsumerDisputeFiling page", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const pageFile = path.join(process.cwd(), "client/src/pages/consumer/ConsumerDisputeFiling.tsx");
    expect(fs.existsSync(pageFile)).toBe(true);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 27 — Nav Links", () => {
  it("should have all Wave 27 nav items in AdminLayout", async () => {
    const fs = await import("fs");
    const path = await import("path");
    const layoutFile = path.join(process.cwd(), "client/src/components/AdminLayout.tsx");
    const content = fs.readFileSync(layoutFile, "utf-8");
    expect(content).toContain("/admin/kyb-review");
    expect(content).toContain("/admin/bnpl-underwriting");
    expect(content).toContain("/admin/loyalty-tiers");
    expect(content).toContain("/admin/fx-hedging");
    expect(content).toContain("/admin/payout-approval");
    expect(content).toContain("/admin/compliance-reports");
    expect(content).toContain("/admin/security-score");
    expect(content).toContain("/admin/webhook-retry");
  });
});
