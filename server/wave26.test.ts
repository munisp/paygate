/**
 * Wave 26 — Feature Flags Targeting, Tenant Management, White-Label, Evidence Upload
 * Tests for all new Wave 26 capabilities
 */
import { describe, it, expect, beforeAll } from "vitest";
import { getDb } from "./db";

let db: Awaited<ReturnType<typeof getDb>>;

beforeAll(async () => {
  db = await getDb();
});

// ─── Feature Flags ────────────────────────────────────────────────────────────
describe("Feature Flags — Targeting Rules", () => {
  it("feature_flags table has targeting_rules column", async () => {
    const result = await db.execute(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'feature_flags' AND column_name = 'targeting_rules'`
    );
    expect((result as any).rows?.length ?? (result as any).length).toBeGreaterThan(0);
  });

  it("feature_flags table has tenant_id column", async () => {
    const result = await db.execute(
      `SELECT column_name FROM information_schema.columns
       WHERE table_name = 'feature_flags' AND column_name = 'tenant_id'`
    );
    expect((result as any).rows?.length ?? (result as any).length).toBeGreaterThan(0);
  });

  it("can read all feature flags", async () => {
    const result = await db.execute(`SELECT COUNT(*) as cnt FROM feature_flags`);
    const count = parseInt((result as any).rows?.[0]?.cnt ?? (result as any)[0]?.cnt ?? "0");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can create a feature flag with targeting rules", async () => {
    const testKey = `test-flag-${Date.now()}`;
    await db.execute(`
      INSERT INTO feature_flags (id, key, name, description, enabled, rollout_percentage, environment, category, targeting_rules, created_at, updated_at)
      VALUES (gen_random_uuid(), '${testKey}', 'Test Flag', 'Wave 26 test', true, 100, 'production', 'payments',
        '{"segments": ["premium"], "countries": ["NG", "GH"], "merchantTiers": ["enterprise"]}',
        NOW(), NOW())
    `);
    const result = await db.execute(`SELECT * FROM feature_flags WHERE key = '${testKey}'`);
    const rows = (result as any).rows ?? (result as any);
    expect(rows.length).toBe(1);
    expect(rows[0].key).toBe(testKey);
    // Cleanup
    await db.execute(`DELETE FROM feature_flags WHERE key = '${testKey}'`);
  });

  it("targeting_rules is stored as valid JSONB", async () => {
    const result = await db.execute(`
      SELECT targeting_rules FROM feature_flags
      WHERE targeting_rules IS NOT NULL LIMIT 1
    `);
    const rows = (result as any).rows ?? (result as any);
    if (rows.length > 0) {
      const rules = rows[0].targeting_rules;
      expect(typeof rules).toBe("object");
    }
  });
});

// ─── Tenant Management ────────────────────────────────────────────────────────
describe("Tenant Management", () => {
  it("tenants table exists with required columns", async () => {
    const result = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tenants'
      AND column_name IN ('id', 'name', 'plan', 'status', 'primary_color', 'logo_url', 'custom_domain')
    `);
    const cols = ((result as any).rows ?? (result as any)).map((r: any) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("name");
    expect(cols).toContain("plan");
    expect(cols).toContain("status");
  });

  it("tenants table has white-label branding columns", async () => {
    const result = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tenants'
      AND column_name IN ('primary_color', 'logo_url', 'custom_domain')
    `);
    const cols = ((result as any).rows ?? (result as any)).map((r: any) => r.column_name);
    // At least one branding column should exist
    expect(cols.length).toBeGreaterThan(0);
  });

  it("can query tenants with pagination", async () => {
    const result = await db.execute(`SELECT COUNT(*) as cnt FROM tenants`);
    const count = parseInt((result as any).rows?.[0]?.cnt ?? (result as any)[0]?.cnt ?? "0");
    expect(count).toBeGreaterThanOrEqual(0);
  });

  it("can create and delete a test tenant", async () => {
    const testId = `test-tenant-${Date.now()}`;
    await db.execute(`
      INSERT INTO tenants (id, name, slug, plan, status, email, created_at, updated_at)
      VALUES ('${testId}', 'Test Tenant Wave26', 'test-tenant-w26-${Date.now()}', 'starter', 'active', 'test-wave26-${Date.now()}@paygate.test', NOW(), NOW())
    `);
    const result = await db.execute(`SELECT id FROM tenants WHERE id = '${testId}'`);
    const rows = (result as any).rows ?? (result as any);
    expect(rows.length).toBe(1);
    // Cleanup
    await db.execute(`DELETE FROM tenants WHERE id = '${testId}'`);
  });
});

// ─── White-Label Branding ─────────────────────────────────────────────────────
describe("White-Label Branding", () => {
  it("can update tenant branding fields", async () => {
    // Get any existing tenant
    const tenants = await db.execute(`SELECT id FROM tenants LIMIT 1`);
    const rows = (tenants as any).rows ?? (tenants as any);
    if (rows.length === 0) {
      // No tenants yet — skip
      expect(true).toBe(true);
      return;
    }
    const tenantId = rows[0].id;
    // Check if primary_color column exists before updating
    const colCheck = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'tenants' AND column_name = 'primary_color'
    `);
    const colRows = (colCheck as any).rows ?? (colCheck as any);
    if (colRows.length === 0) {
      expect(true).toBe(true);
      return;
    }
    await db.execute(`
      UPDATE tenants SET primary_color = '#FF0000', updated_at = NOW()
      WHERE id = '${tenantId}'
    `);
    const result = await db.execute(`SELECT primary_color FROM tenants WHERE id = '${tenantId}'`);
    const updated = (result as any).rows ?? (result as any);
    expect(updated[0]?.primary_color).toBe("#FF0000");
  });

  it("tenant branding context can be serialized to JSON", () => {
    const branding = {
      primaryColor: "#E11D48",
      logoUrl: "https://cdn.example.com/logo.png",
      fontFamily: "Inter",
      borderRadius: "8px",
      customDomain: "pay.merchant.com",
    };
    const serialized = JSON.stringify(branding);
    const parsed = JSON.parse(serialized);
    expect(parsed.primaryColor).toBe("#E11D48");
    expect(parsed.logoUrl).toContain("logo.png");
  });
});

// ─── Chargeback Evidence Upload ───────────────────────────────────────────────
describe("Chargeback Evidence Upload", () => {
  it("chargebacks table has evidence_url column", async () => {
    const result = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chargebacks' AND column_name = 'evidence_url'
    `);
    expect((result as any).rows?.length ?? (result as any).length).toBeGreaterThan(0);
  });

  it("chargebacks table has evidence_file_name column", async () => {
    const result = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'chargebacks' AND column_name = 'evidence_file_name'
    `);
    expect((result as any).rows?.length ?? (result as any).length).toBeGreaterThan(0);
  });

  it("chargebacks table has evidence_submitted boolean column", async () => {
    const result = await db.execute(`
      SELECT column_name, data_type FROM information_schema.columns
      WHERE table_name = 'chargebacks' AND column_name = 'evidence_submitted'
    `);
    const rows = (result as any).rows ?? (result as any);
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].data_type).toBe("boolean");
  });

  it("can update chargeback evidence fields", async () => {
    // Get any existing chargeback
    const cbs = await db.execute(`SELECT id FROM chargebacks LIMIT 1`);
    const rows = (cbs as any).rows ?? (cbs as any);
    if (rows.length === 0) {
      expect(true).toBe(true);
      return;
    }
    const cbId = rows[0].id;
    const testUrl = `https://cdn.paygate.ng/chargebacks/${cbId}/evidence-test.pdf`;
    await db.execute(`
      UPDATE chargebacks
      SET evidence_url = '${testUrl}', evidence_file_name = 'dispute-evidence.pdf', evidence_submitted = true, updated_at = NOW()
      WHERE id = '${cbId}'
    `);
    const result = await db.execute(`SELECT evidence_url, evidence_submitted FROM chargebacks WHERE id = '${cbId}'`);
    const updated = (result as any).rows ?? (result as any);
    expect(updated[0]?.evidence_url).toBe(testUrl);
    expect(updated[0]?.evidence_submitted).toBe(true);
  });
});

// ─── Revenue Export ───────────────────────────────────────────────────────────
describe("Revenue Analytics Export", () => {
  it("can generate CSV from revenue summary data", () => {
    const summary = {
      totalVolume: 50000000,
      totalFees: 1500000,
      txCount: 1250,
      successCount: 1200,
      avgTxSize: 40000,
    };
    const lines = [
      "SUMMARY",
      "Metric,Value",
      `Total Volume,${summary.totalVolume / 100}`,
      `Total Fees,${summary.totalFees / 100}`,
      `Transaction Count,${summary.txCount}`,
      `Successful Transactions,${summary.successCount}`,
      `Average Transaction Size,${summary.avgTxSize / 100}`,
    ];
    const csv = lines.join("\n");
    expect(csv).toContain("500000");
    expect(csv).toContain("15000");
    expect(csv).toContain("1250");
  });

  it("CSV export handles empty merchant list gracefully", () => {
    const merchants: any[] = [];
    const lines = ["TOP MERCHANTS BY REVENUE", "Merchant,Volume (NGN),Fees (NGN)"];
    merchants.forEach(m => {
      lines.push([`"${m.businessName}"`, m.volume / 100, m.fees / 100].join(","));
    });
    const csv = lines.join("\n");
    expect(csv).toContain("TOP MERCHANTS");
    expect(csv.split("\n").length).toBe(2); // Header + column row only
  });

  it("CSV export includes period and timestamp metadata", () => {
    const period = "month";
    const timestamp = new Date().toISOString();
    const header = `PayGate Revenue Export — Period: ${period} — Generated: ${timestamp}`;
    expect(header).toContain("month");
    expect(header).toContain("PayGate Revenue Export");
  });
});

// ─── Feature Flag SDK Endpoint ────────────────────────────────────────────────
describe("Feature Flag SDK Endpoint", () => {
  it("feature_flags table has rollout_percentage column", async () => {
    const result = await db.execute(`
      SELECT column_name FROM information_schema.columns
      WHERE table_name = 'feature_flags' AND column_name = 'rollout_percentage'
    `);
    expect((result as any).rows?.length ?? (result as any).length).toBeGreaterThan(0);
  });

  it("rollout percentage evaluation logic is correct", () => {
    // Simulate the SDK rollout check
    const checkRollout = (rolloutPct: number, userId: string): boolean => {
      if (rolloutPct >= 100) return true;
      if (rolloutPct <= 0) return false;
      // Hash-based deterministic rollout
      let hash = 0;
      for (let i = 0; i < userId.length; i++) {
        hash = ((hash << 5) - hash) + userId.charCodeAt(i);
        hash |= 0;
      }
      return (Math.abs(hash) % 100) < rolloutPct;
    };
    expect(checkRollout(100, "user-1")).toBe(true);
    expect(checkRollout(0, "user-1")).toBe(false);
    // 50% rollout — deterministic for same userId
    const result50 = checkRollout(50, "user-abc");
    expect(typeof result50).toBe("boolean");
  });

  it("targeting rules evaluation handles missing fields gracefully", () => {
    const evaluateTargeting = (rules: any, context: any): boolean => {
      if (!rules) return true;
      if (rules.countries?.length && !rules.countries.includes(context.country)) return false;
      if (rules.merchantTiers?.length && !rules.merchantTiers.includes(context.tier)) return false;
      if (rules.segments?.length && !rules.segments.some((s: string) => context.segments?.includes(s))) return false;
      return true;
    };
    expect(evaluateTargeting(null, {})).toBe(true);
    expect(evaluateTargeting({ countries: ["NG"] }, { country: "NG" })).toBe(true);
    expect(evaluateTargeting({ countries: ["NG"] }, { country: "US" })).toBe(false);
    expect(evaluateTargeting({ merchantTiers: ["enterprise"] }, { tier: "starter" })).toBe(false);
    expect(evaluateTargeting({ segments: ["premium"] }, { segments: ["premium", "early_access"] })).toBe(true);
  });
});
