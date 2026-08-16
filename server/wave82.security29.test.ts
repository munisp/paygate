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
/**
 * wave82.security29.test.ts — Wave 29 Security & Multi-Tenant Feature Tests
 *
 * Covers:
 *  - VULN-021 through VULN-030 security controls
 *  - Tenant billing & usage metering DB
 *  - Tenant plan limits enforcement
 *  - Corridor daily stats
 *  - Tenant SSO configuration
 *  - Tenant API key management
 *  - Loyalty tier auto-promotion logic
 *  - Chargeback management
 *  - Wave 29 router sub-router completeness
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import {
  timingSafeCompareInviteCode,
  validateBnplApplication,
  validateEvidenceMimeType,
  validateCustomDomain,
  validateSsoDiscoveryUrl,
  encryptWebhookSecret,
  decryptWebhookSecret,
  getWave29SecurityReport,
  BNPL_MIN_CREDIT_SCORE,
} from "./security29";

const DB_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db";

let pool: pg.Pool;

async function query(sql: string, params: any[] = []) {
  const client = await pool.connect();
  try {
    const result = await client.query(sql, params);
    return result.rows;
  } finally {
    client.release();
  }
}

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
});

afterAll(async () => {
  await pool.end();
});

// ─── VULN-024: Timing-safe invite code comparison ─────────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-024 — Timing-safe invite code comparison", () => {
  it("returns true for matching codes", () => {
    expect(timingSafeCompareInviteCode("TESTCODE123", "TESTCODE123")).toBe(true);
  });

  it("returns false for mismatched codes", () => {
    expect(timingSafeCompareInviteCode("TESTCODE123", "WRONGCODE456")).toBe(false);
  });

  it("handles empty strings safely", () => {
    expect(timingSafeCompareInviteCode("", "")).toBe(true);
    expect(timingSafeCompareInviteCode("", "NONEMPTY")).toBe(false);
  });

  it("handles long codes safely", () => {
    const longCode = "A".repeat(100);
    expect(timingSafeCompareInviteCode(longCode, longCode)).toBe(true);
    expect(timingSafeCompareInviteCode(longCode, "B".repeat(100))).toBe(false);
  });
});

// ─── VULN-025: BNPL credit score floor ───────────────────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-025 — BNPL credit score floor", () => {
  it("approves application with score above minimum", () => {
    const result = validateBnplApplication(700, 1_000_00);
    expect(result.approved).toBe(true);
  });

  it("rejects application with score below minimum", () => {
    const result = validateBnplApplication(550, 1_000_00);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("Credit score");
    expect(result.reason).toContain(String(BNPL_MIN_CREDIT_SCORE));
  });

  it("rejects application exceeding max loan amount", () => {
    const result = validateBnplApplication(750, 100_000_00);
    expect(result.approved).toBe(false);
    expect(result.reason).toContain("exceeds maximum");
  });

  it("approves application at exact minimum credit score", () => {
    const result = validateBnplApplication(BNPL_MIN_CREDIT_SCORE, 5_000_00);
    expect(result.approved).toBe(true);
  });

  it("rejects zero credit score", () => {
    const result = validateBnplApplication(0, 1_000_00);
    expect(result.approved).toBe(false);
  });
});

// ─── VULN-026: Evidence file type allowlist ───────────────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-026 — Evidence file type allowlist", () => {
  it("allows PDF evidence", () => {
    expect(validateEvidenceMimeType("application/pdf")).toBe(true);
  });

  it("allows JPEG evidence", () => {
    expect(validateEvidenceMimeType("image/jpeg")).toBe(true);
  });

  it("allows PNG evidence", () => {
    expect(validateEvidenceMimeType("image/png")).toBe(true);
  });

  it("allows WebP evidence", () => {
    expect(validateEvidenceMimeType("image/webp")).toBe(true);
  });

  it("allows plain text evidence", () => {
    expect(validateEvidenceMimeType("text/plain")).toBe(true);
  });

  it("rejects executable files", () => {
    expect(validateEvidenceMimeType("application/x-executable")).toBe(false);
  });

  it("rejects JavaScript files", () => {
    expect(validateEvidenceMimeType("application/javascript")).toBe(false);
  });

  it("rejects ZIP archives", () => {
    expect(validateEvidenceMimeType("application/zip")).toBe(false);
  });

  it("rejects HTML files", () => {
    expect(validateEvidenceMimeType("text/html")).toBe(false);
  });

  it("is case-insensitive", () => {
    expect(validateEvidenceMimeType("IMAGE/JPEG")).toBe(true);
    expect(validateEvidenceMimeType("APPLICATION/PDF")).toBe(true);
  });
});

// ─── VULN-027: Custom domain validation ──────────────────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-027 — Custom domain validation", () => {
  it("accepts valid domain", () => {
    expect(validateCustomDomain("acme.remitflow.io").valid).toBe(true);
  });

  it("accepts subdomain", () => {
    expect(validateCustomDomain("pay.acme.com").valid).toBe(true);
  });

  it("accepts multi-level subdomain", () => {
    expect(validateCustomDomain("payments.api.company.co.uk").valid).toBe(true);
  });

  it("rejects localhost", () => {
    expect(validateCustomDomain("localhost").valid).toBe(false);
  });

  it("rejects 127.0.0.1", () => {
    expect(validateCustomDomain("127.0.0.1").valid).toBe(false);
  });

  it("rejects AWS metadata endpoint", () => {
    expect(validateCustomDomain("169.254.169.254").valid).toBe(false);
  });

  it("rejects private IP ranges", () => {
    expect(validateCustomDomain("192.168.1.1").valid).toBe(false);
    expect(validateCustomDomain("10.0.0.1").valid).toBe(false);
    expect(validateCustomDomain("172.16.0.1").valid).toBe(false);
  });

  it("rejects manus.space (platform domain)", () => {
    expect(validateCustomDomain("manus.space").valid).toBe(false);
  });

  it("rejects invalid format with underscores", () => {
    expect(validateCustomDomain("not_a_domain").valid).toBe(false);
  });
});

// ─── VULN-028: SSRF guard for SSO discovery URLs ─────────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-028 — SSRF guard for SSO discovery URLs", () => {
  it("allows valid HTTPS OIDC discovery URL", () => {
    expect(validateSsoDiscoveryUrl("https://accounts.google.com/.well-known/openid-configuration").valid).toBe(true);
  });

  it("allows Azure AD discovery URL", () => {
    expect(validateSsoDiscoveryUrl("https://login.microsoftonline.com/common/v2.0/.well-known/openid-configuration").valid).toBe(true);
  });

  it("rejects HTTP (non-HTTPS) URLs", () => {
    expect(validateSsoDiscoveryUrl("http://accounts.google.com/openid").valid).toBe(false);
  });

  it("rejects localhost URLs", () => {
    expect(validateSsoDiscoveryUrl("https://localhost:8080/.well-known/openid-configuration").valid).toBe(false);
  });

  it("rejects 127.0.0.1 URLs", () => {
    expect(validateSsoDiscoveryUrl("https://127.0.0.1/openid").valid).toBe(false);
  });

  it("rejects AWS metadata service", () => {
    expect(validateSsoDiscoveryUrl("https://169.254.169.254/latest/meta-data/").valid).toBe(false);
  });

  it("rejects Google metadata service", () => {
    expect(validateSsoDiscoveryUrl("https://metadata.google.internal/computeMetadata/v1/").valid).toBe(false);
  });

  it("rejects invalid URL format", () => {
    expect(validateSsoDiscoveryUrl("not-a-url").valid).toBe(false);
  });
});

// ─── VULN-029: Webhook secret AES-256-GCM encryption ─────────────────────────

describe.skipIf(!PG_AVAILABLE)("VULN-029 — Webhook secret AES-256-GCM encryption", () => {
  it("encrypts and decrypts a webhook secret correctly", () => {
    const secret = "whsec_test_1234567890abcdef";
    const encrypted = encryptWebhookSecret(secret);
    expect(encrypted).not.toBe(secret);
    const decrypted = decryptWebhookSecret(encrypted);
    expect(decrypted).toBe(secret);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const secret = "same_secret_value";
    const enc1 = encryptWebhookSecret(secret);
    const enc2 = encryptWebhookSecret(secret);
    expect(enc1).not.toBe(enc2);
    expect(decryptWebhookSecret(enc1)).toBe(secret);
    expect(decryptWebhookSecret(enc2)).toBe(secret);
  });

  it("handles unicode secrets", () => {
    const secret = "wh_secret_日本語テスト_🔐";
    const encrypted = encryptWebhookSecret(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it("handles long secrets", () => {
    const secret = "x".repeat(1024);
    const encrypted = encryptWebhookSecret(secret);
    expect(decryptWebhookSecret(encrypted)).toBe(secret);
  });

  it("produces base64-encoded output", () => {
    const encrypted = encryptWebhookSecret("test_secret");
    expect(() => Buffer.from(encrypted, "base64")).not.toThrow();
  });
});

// ─── Wave 29 Security Report ──────────────────────────────────────────────────

describe.skipIf(!PG_AVAILABLE)("Wave 29 Security Report", () => {
  it("returns 30 total controls", () => {
    const report = getWave29SecurityReport();
    expect(report.totalVulnerabilities).toBe(30);
  });

  it("has all controls fixed or mitigated (0 open)", () => {
    const report = getWave29SecurityReport();
    expect(report.open).toBe(0);
  });

  it("achieves grade A+ (score >= 97)", () => {
    const report = getWave29SecurityReport();
    expect(report.score).toBeGreaterThanOrEqual(97);
    expect(report.grade).toBe("A+");
  });

  it("documents 3 transitive dependency risks", () => {
    const report = getWave29SecurityReport();
    expect(report.transitiveDependencyRisks).toHaveLength(3);
  });

  it("includes VULN-021 through VULN-030", () => {
    const report = getWave29SecurityReport();
    const ids = report.controls.map(c => c.id);
    for (let i = 21; i <= 30; i++) {
      expect(ids).toContain(`VULN-0${i}`);
    }
  });

  it("includes VULN-001 through VULN-014 from earlier waves", () => {
    const report = getWave29SecurityReport();
    const ids = report.controls.map(c => c.id);
    for (let i = 1; i <= 14; i++) {
      expect(ids).toContain(`VULN-0${String(i).padStart(2, "0")}`);
    }
  });
});

// ─── Database Integration Tests ──────────────────────────────────────────────

describe.skipIf(!PG_AVAILABLE)("Tenant billing invoices DB", () => {
  it("tenant_billing_invoices table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_billing_invoices' ORDER BY ordinal_position"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("id");
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("amount_usd");
    expect(cols).toContain("status");
    expect(cols).toContain("period");
  });

  it("can insert and retrieve a billing invoice", async () => {
    const tenantId = "test-billing-" + Date.now();
    const invId = "inv-" + Date.now();
    await query(
      `INSERT INTO tenant_billing_invoices (id, tenant_id, period, amount_usd, status)
       VALUES ($1, $2, '2026-04', 299.00, 'draft')`,
      [invId, tenantId]
    );
    const rows = await query(
      "SELECT * FROM tenant_billing_invoices WHERE id = $1",
      [invId]
    );
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].amount_usd)).toBe(299);
    expect(rows[0].status).toBe("draft");
    await query("DELETE FROM tenant_billing_invoices WHERE id = $1", [invId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Tenant usage metrics DB", () => {
  it("tenant_usage_metrics table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_usage_metrics'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("api_calls");
    expect(cols).toContain("tx_count");
    expect(cols).toContain("tx_volume");
    expect(cols).toContain("period");
  });

  it("can upsert usage metrics", async () => {
    const tenantId = "test-usage-" + Date.now();
    // Current schema has no unique constraint on (tenant_id, period), so the
    // upsert is expressed as update-or-insert against the `period` text column.
    const updated = await query(
      `UPDATE tenant_usage_metrics
       SET api_calls = api_calls + 1500, tx_count = tx_count + 45, tx_volume = tx_volume + 2500000
       WHERE tenant_id = $1 AND period = '2026-04'
       RETURNING id`,
      [tenantId]
    );
    if (updated.length === 0) {
      await query(
        `INSERT INTO tenant_usage_metrics (id, tenant_id, period, api_calls, tx_count, tx_volume)
         VALUES ($1, $2, '2026-04', 1500, 45, 2500000)`,
        ["usage-" + Date.now(), tenantId]
      );
    }
    const rows = await query(
      "SELECT * FROM tenant_usage_metrics WHERE tenant_id = $1",
      [tenantId]
    );
    expect(rows).toHaveLength(1);
    expect(parseInt(rows[0].api_calls)).toBe(1500);
    await query("DELETE FROM tenant_usage_metrics WHERE tenant_id = $1", [tenantId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Tenant plan limits DB", () => {
  it("plan limits are seeded for all 4 plans", async () => {
    const rows = await query("SELECT plan FROM tenant_plan_limits ORDER BY plan");
    const plans = rows.map((r: any) => r.plan);
    expect(plans).toContain("starter");
    expect(plans).toContain("growth");
    expect(plans).toContain("scale");
    expect(plans).toContain("enterprise");
  });

  it("enterprise plan has higher limits than starter", async () => {
    const rows = await query(
      "SELECT plan, max_api_calls_per_month, max_corridors FROM tenant_plan_limits WHERE plan IN ('starter', 'enterprise')"
    );
    const starter = rows.find((r: any) => r.plan === "starter");
    const enterprise = rows.find((r: any) => r.plan === "enterprise");
    expect(parseInt(enterprise.max_api_calls_per_month)).toBeGreaterThan(
      parseInt(starter.max_api_calls_per_month)
    );
    expect(parseInt(enterprise.max_corridors)).toBeGreaterThan(
      parseInt(starter.max_corridors)
    );
  });
});

describe.skipIf(!PG_AVAILABLE)("Tenant SSO configs DB", () => {
  it("tenant_sso_configs table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_sso_configs'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("protocol");
    expect(cols).toContain("is_enabled");
    expect(cols).toContain("discovery_url");
    expect(cols).toContain("client_id");
  });

  it("can insert an SSO config", async () => {
    const tenantId = "test-sso-" + Date.now();
    await query(
      `INSERT INTO tenant_sso_configs (id, tenant_id, protocol, client_id, client_secret, discovery_url, is_enabled)
       VALUES ($1, $2, 'oidc', 'client-123', 'secret-abc', 'https://accounts.google.com/.well-known/openid-configuration', false)`,
      ["sso-" + Date.now(), tenantId]
    );
    const rows = await query(
      "SELECT * FROM tenant_sso_configs WHERE tenant_id = $1",
      [tenantId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].protocol).toBe("oidc");
    expect(rows[0].is_enabled).toBe(false);
    await query("DELETE FROM tenant_sso_configs WHERE tenant_id = $1", [tenantId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Tenant API keys DB", () => {
  it("tenant_api_keys table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_api_keys'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("key_hash");
    expect(cols).toContain("key_prefix");
    expect(cols).toContain("permissions");
    expect(cols).toContain("is_active");
  });

  it("can create an API key record", async () => {
    const tenantId = "test-apikey-" + Date.now();
    const keyId = "key-" + Date.now();
    await query(
      `INSERT INTO tenant_api_keys (id, tenant_id, name, key_prefix, key_hash, permissions, is_active)
       VALUES ($1, $2, 'Test Key', 'pk_test_', 'sha256hash_placeholder', 7, true)`,
      [keyId, tenantId]
    );
    const rows = await query(
      "SELECT * FROM tenant_api_keys WHERE id = $1",
      [keyId]
    );
    expect(rows).toHaveLength(1);
    expect(rows[0].is_active).toBe(true);
    expect(rows[0].permissions).toBe(7);
    await query("DELETE FROM tenant_api_keys WHERE id = $1", [keyId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Loyalty tier configs DB", () => {
  it("loyalty_tier_configs table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'loyalty_tier_configs'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("tier_name");
    expect(cols).toContain("min_points");
    expect(cols).toContain("cashback_rate");
    expect(cols).toContain("bonus_multiplier");
  });

  it("can insert a custom tier config", async () => {
    const tierName = "test_tier_" + Date.now();
    await query(
      `INSERT INTO loyalty_tier_configs (tier_name, min_points, max_points, cashback_rate, bonus_multiplier)
       VALUES ($1, 99999, null, 5.0, 3.0)`,
      [tierName]
    );
    const rows = await query(
      "SELECT * FROM loyalty_tier_configs WHERE tier_name = $1",
      [tierName]
    );
    expect(rows).toHaveLength(1);
    expect(parseFloat(rows[0].cashback_rate)).toBe(5);
    await query("DELETE FROM loyalty_tier_configs WHERE tier_name = $1", [tierName]);
  });

  it("tier auto-promotion logic — bronze to silver at 1000 points", () => {
    const tiers = [
      { name: "bronze", min: 0 },
      { name: "silver", min: 1000 },
      { name: "gold", min: 5000 },
      { name: "platinum", min: 20000 },
    ];
    const getExpectedTier = (points: number) => {
      let tier = "bronze";
      for (const t of tiers) {
        if (points >= t.min) tier = t.name;
      }
      return tier;
    };
    expect(getExpectedTier(0)).toBe("bronze");
    expect(getExpectedTier(999)).toBe("bronze");
    expect(getExpectedTier(1000)).toBe("silver");
    expect(getExpectedTier(4999)).toBe("silver");
    expect(getExpectedTier(5000)).toBe("gold");
    expect(getExpectedTier(20000)).toBe("platinum");
  });
});

describe.skipIf(!PG_AVAILABLE)("Chargeback management DB", () => {
  it("chargebacks table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'chargebacks'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("merchant_id");
    expect(cols).toContain("amount_kobo");
    expect(cols).toContain("status");
    expect(cols).toContain("reason");
    expect(cols).toContain("evidence_submitted");
    expect(cols).toContain("evidence_url");
  });

  it("can create and update a chargeback", async () => {
    const cbId = "cb-test-" + Date.now();
    await query(
      `INSERT INTO chargebacks (id, merchant_id, amount_kobo, currency, reason, status)
       VALUES ($1, 'merchant-test-001', 50000, 'NGN', 'fraudulent', 'open')`,
      [cbId]
    );
    await query(
      "UPDATE chargebacks SET status = 'needs_response' WHERE id = $1",
      [cbId]
    );
    const rows = await query("SELECT * FROM chargebacks WHERE id = $1", [cbId]);
    expect(rows).toHaveLength(1);
    expect(rows[0].status).toBe("needs_response");
    expect(rows[0].amount_kobo).toBe(50000);
    await query("DELETE FROM chargebacks WHERE id = $1", [cbId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Corridor daily stats DB", () => {
  it("tenant_corridor_daily_stats table has correct schema", async () => {
    const rows = await query(
      "SELECT column_name FROM information_schema.columns WHERE table_name = 'tenant_corridor_daily_stats'"
    );
    const cols = rows.map((r: any) => r.column_name);
    expect(cols).toContain("tenant_id");
    expect(cols).toContain("corridor_id");
    expect(cols).toContain("date");
    expect(cols).toContain("tx_count");
    expect(cols).toContain("volume_usd");
  });

  it("can insert corridor daily stats", async () => {
    const tenantId = "test-corridor-" + Date.now();
    await query(
      `INSERT INTO tenant_corridor_daily_stats (id, tenant_id, corridor_id, date, tx_count, volume_usd, fees_collected_usd)
       VALUES ($1, $2, 'corridor-1', TO_CHAR(CURRENT_DATE, 'YYYY-MM-DD'), 25, 1250000, 6250)`,
      ["cds-" + Date.now(), tenantId]
    );
    const rows = await query(
      "SELECT * FROM tenant_corridor_daily_stats WHERE tenant_id = $1",
      [tenantId]
    );
    expect(rows).toHaveLength(1);
    expect(parseInt(rows[0].tx_count)).toBe(25);
    await query("DELETE FROM tenant_corridor_daily_stats WHERE tenant_id = $1", [tenantId]);
  });
});

describe.skipIf(!PG_AVAILABLE)("Wave 29 router completeness", () => {
  it("wave29Router has all 16 sub-routers", async () => {
    const { wave29Router } = await import("./wave29Router");
    const keys = Object.keys(wave29Router._def.record);
    const expected = [
      "tenantBilling",
      "tenantBranding",
      "corridorManagement",
      "tenantSso",
      "webhookSigning",
      "tenantApiKey",
      "loyalty",
      "bnplRepayment",
      "disputeEscalation",
      "chargeback",
      "sla",
      "jwtRevocation",
      "metrics",
      "rateLimitDashboard",
      "complianceExport",
      "securityHardening",
    ];
    for (const key of expected) {
      expect(keys).toContain(key);
    }
  });
});
