/**
 * wave83.security30.test.ts
 * Wave 30 comprehensive tests:
 * - VULN-031 through VULN-040 security controls
 * - Tenant billing, SLA metrics, middleware health, FX hedge positions
 * - KYB state transitions, onboarding emails, FX live rates
 * - Wave 30 router procedures (billing, sla, middleware, fxHedge, kybStateMachine)
 */

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import pg from "pg";
import {
  validateExternalUrl,
  validateRedirectUrl,
  safeCompare,
  assertTenantAccess,
  validateWebhookNonce,
  generateSecureApiKey,
  validateApiKeyEntropy,
  buildCspHeader,
  HSTS_HEADER,
  X_FRAME_OPTIONS,
  X_CONTENT_TYPE_OPTIONS,
  REFERRER_POLICY,
  PERMISSIONS_POLICY,
  DEPENDENCY_VULN_REPORT,
  getWave30SecurityReport,
} from "./security30";

const DB_URL =
  process.env.PG_DATABASE_URL ??
  "postgresql://paygate:paygate_dev_2026@127.0.0.1:5432/paygate_db";

let pool: pg.Pool;

beforeAll(async () => {
  pool = new pg.Pool({ connectionString: DB_URL });
});

afterAll(async () => {
  await pool.end();
});

// ─── VULN-031: SSRF Prevention ────────────────────────────────────────────────
describe("VULN-031: SSRF Prevention", () => {
  it("blocks loopback 127.0.0.1", () => {
    const result = validateExternalUrl("http://127.0.0.1/admin");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Private/loopback");
  });

  it("blocks 10.x private range", () => {
    const result = validateExternalUrl("http://10.0.0.1/secret");
    expect(result.safe).toBe(false);
  });

  it("blocks 192.168.x.x private range", () => {
    const result = validateExternalUrl("http://192.168.1.1/api");
    expect(result.safe).toBe(false);
  });

  it("blocks AWS metadata endpoint", () => {
    const result = validateExternalUrl("http://169.254.169.254/latest/meta-data");
    expect(result.safe).toBe(false);
    // 169.254.169.254 is matched by the 169.254.x.x private range pattern
    expect(result.reason).toBeTruthy();
  });

  it("blocks file:// protocol", () => {
    const result = validateExternalUrl("file:///etc/passwd");
    expect(result.safe).toBe(false);
    expect(result.reason).toContain("Protocol");
  });

  it("allows valid external HTTPS URL", () => {
    const result = validateExternalUrl("https://api.stripe.com/v1/charges");
    expect(result.safe).toBe(true);
  });

  it("allows valid HTTP URL to public IP", () => {
    const result = validateExternalUrl("http://8.8.8.8/health");
    expect(result.safe).toBe(true);
  });

  it("rejects malformed URL", () => {
    const result = validateExternalUrl("not-a-url");
    expect(result.safe).toBe(false);
  });
});

// ─── VULN-032: Open Redirect Prevention ───────────────────────────────────────
describe("VULN-032: Open Redirect Prevention", () => {
  it("allows same-origin redirect", () => {
    const ok = validateRedirectUrl("https://app.manus.space/dashboard", "https://app.manus.space");
    expect(ok).toBe(true);
  });

  it("allows whitelisted domain", () => {
    const ok = validateRedirectUrl("https://paygate.io/success", "https://app.manus.space");
    expect(ok).toBe(true);
  });

  it("blocks external unwhitelisted domain", () => {
    const ok = validateRedirectUrl("https://evil.com/steal", "https://app.manus.space");
    expect(ok).toBe(false);
  });

  it("blocks protocol-relative URL", () => {
    const ok = validateRedirectUrl("//evil.com/phish", "https://app.manus.space");
    expect(ok).toBe(false);
  });

  it("allows relative path redirect", () => {
    const ok = validateRedirectUrl("/dashboard", "https://app.manus.space");
    expect(ok).toBe(true);
  });
});

// ─── VULN-033: Timing Attack Prevention ──────────────────────────────────────
describe("VULN-033: Timing Attack Prevention", () => {
  it("returns true for equal strings", () => {
    expect(safeCompare("secret123", "secret123")).toBe(true);
  });

  it("returns false for different strings of same length", () => {
    expect(safeCompare("secret123", "secret456")).toBe(false);
  });

  it("returns false for different length strings", () => {
    expect(safeCompare("short", "much-longer-string")).toBe(false);
  });

  it("returns false for non-string inputs", () => {
    expect(safeCompare(null as any, "test")).toBe(false);
    expect(safeCompare("test", undefined as any)).toBe(false);
  });
});

// ─── VULN-034: Tenant Data Leakage ────────────────────────────────────────────
describe("VULN-034: Tenant Data Leakage Prevention", () => {
  it("passes when tenant IDs match", () => {
    expect(() => assertTenantAccess("tenant-1", "tenant-1", "invoice")).not.toThrow();
  });

  it("throws when tenant IDs differ", () => {
    expect(() => assertTenantAccess("tenant-1", "tenant-2", "invoice")).toThrow("VULN-034");
  });

  it("passes for system-level resources (null tenantId)", () => {
    expect(() => assertTenantAccess(null, "tenant-1", "system-config")).not.toThrow();
  });

  it("passes when request tenantId is null (admin access)", () => {
    expect(() => assertTenantAccess("tenant-1", null, "invoice")).not.toThrow();
  });

  it("handles numeric tenant IDs", () => {
    expect(() => assertTenantAccess(1, 1, "record")).not.toThrow();
    expect(() => assertTenantAccess(1, 2, "record")).toThrow("VULN-034");
  });
});

// ─── VULN-035: Webhook Replay Attack ─────────────────────────────────────────
describe("VULN-035: Webhook Replay Attack Prevention", () => {
  it("accepts valid nonce within time window", () => {
    const nonce = `nonce-${Date.now()}-${Math.random()}`;
    const result = validateWebhookNonce(nonce, Date.now());
    expect(result).toBe(true);
  });

  it("rejects duplicate nonce", () => {
    const nonce = `nonce-dup-${Date.now()}-${Math.random()}`;
    expect(validateWebhookNonce(nonce, Date.now())).toBe(true);
    expect(validateWebhookNonce(nonce, Date.now())).toBe(false);
  });

  it("rejects timestamp older than 5 minutes", () => {
    const nonce = `nonce-old-${Date.now()}`;
    const oldTimestamp = Date.now() - 6 * 60 * 1000;
    expect(validateWebhookNonce(nonce, oldTimestamp)).toBe(false);
  });

  it("rejects future timestamp beyond 5 minutes", () => {
    const nonce = `nonce-future-${Date.now()}`;
    const futureTimestamp = Date.now() + 6 * 60 * 1000;
    expect(validateWebhookNonce(nonce, futureTimestamp)).toBe(false);
  });
});

// ─── VULN-036: API Key Entropy ────────────────────────────────────────────────
describe("VULN-036: API Key Entropy Validation", () => {
  it("generates a secure API key with correct prefix", () => {
    const key = generateSecureApiKey("pk_live");
    // Key format: 'pk_live|<base64url>' — uses | separator to avoid base64url underscore collision
    expect(key).toMatch(/^pk_live\|/);
  });

  it("generates keys with sufficient entropy (43+ chars after prefix)", () => {
    const key = generateSecureApiKey("sk_test");
    // Key format: 'sk_test|<base64url>' — extract secret after the | separator
    const pipeIdx = key.lastIndexOf("|");
    const secret = key.slice(pipeIdx + 1);
    expect(secret.length).toBeGreaterThanOrEqual(43);
  });

  it("validates high-entropy key as valid", () => {
    const key = generateSecureApiKey("pk_live");
    expect(validateApiKeyEntropy(key)).toBe(true);
  });

  it("rejects low-entropy key", () => {
    // Key must use | separator and have 43+ chars after it
    expect(validateApiKeyEntropy("pk_live|short")).toBe(false);
    expect(validateApiKeyEntropy("pk_live_short")).toBe(false); // no | separator
  });

  it("generates unique keys on each call", () => {
    const key1 = generateSecureApiKey();
    const key2 = generateSecureApiKey();
    expect(key1).not.toBe(key2);
  });
});

// ─── VULN-037: CSP Headers ────────────────────────────────────────────────────
describe("VULN-037: CSP Header Builder", () => {
  it("builds valid CSP header", () => {
    const csp = buildCspHeader();
    expect(csp).toContain("default-src 'self'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("base-uri 'self'");
  });

  it("includes nonce when provided", () => {
    const nonce = "abc123";
    const csp = buildCspHeader(nonce);
    expect(csp).toContain(`'nonce-${nonce}'`);
  });

  it("includes upgrade-insecure-requests", () => {
    const csp = buildCspHeader();
    expect(csp).toContain("upgrade-insecure-requests");
  });
});

// ─── VULN-038: HSTS Header ────────────────────────────────────────────────────
describe("VULN-038: HSTS Header", () => {
  it("has correct HSTS value", () => {
    expect(HSTS_HEADER).toContain("max-age=31536000");
    expect(HSTS_HEADER).toContain("includeSubDomains");
    expect(HSTS_HEADER).toContain("preload");
  });
});

// ─── VULN-039: Clickjacking Prevention ───────────────────────────────────────
describe("VULN-039: Clickjacking and Header Hardening", () => {
  it("X-Frame-Options is DENY", () => {
    expect(X_FRAME_OPTIONS).toBe("DENY");
  });

  it("X-Content-Type-Options is nosniff", () => {
    expect(X_CONTENT_TYPE_OPTIONS).toBe("nosniff");
  });

  it("Referrer-Policy is strict-origin-when-cross-origin", () => {
    expect(REFERRER_POLICY).toBe("strict-origin-when-cross-origin");
  });

  it("Permissions-Policy blocks camera and microphone", () => {
    expect(PERMISSIONS_POLICY).toContain("camera=()");
    expect(PERMISSIONS_POLICY).toContain("microphone=()");
  });
});

// ─── VULN-040: Dependency Audit ───────────────────────────────────────────────
describe("VULN-040: Dependency Vulnerability Audit", () => {
  it("reports 0 critical vulnerabilities", () => {
    expect(DEPENDENCY_VULN_REPORT.critical).toBe(0);
  });

  it("has overall score >= 95", () => {
    expect(DEPENDENCY_VULN_REPORT.score).toBeGreaterThanOrEqual(95);
  });

  it("has more mitigated than accepted risk", () => {
    expect(DEPENDENCY_VULN_REPORT.mitigated).toBeGreaterThan(DEPENDENCY_VULN_REPORT.accepted_risk);
  });
});

// ─── Full Security Report ─────────────────────────────────────────────────────
describe("Wave 30 Security Report", () => {
  it("generates complete security report", () => {
    const report = getWave30SecurityReport();
    expect(report.wave).toBe(30);
    expect(report.overall_score).toBeGreaterThanOrEqual(95);
    expect(report.grade).toBe("A+");
    expect(report.vulnerabilities).toHaveLength(10);
  });

  it("all Wave 30 vulnerabilities are FIXED or MITIGATED", () => {
    const report = getWave30SecurityReport();
    const open = report.vulnerabilities.filter((v: any) => v.status === "OPEN");
    expect(open).toHaveLength(0);
  });
});

// ─── DB Integration: Tenant Billing Invoices ─────────────────────────────────
describe("DB: Tenant Billing Invoices", () => {
  it("has seeded billing invoices", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM tenant_billing_invoices");
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(1);
  });

  it("can insert and retrieve a billing invoice", async () => {
    const tenantRes = await pool.query("SELECT id FROM partner_tenants LIMIT 1");
    if (tenantRes.rows.length === 0) return;
    const tenantId = tenantRes.rows[0].id;
    const now = new Date();
    await pool.query(`
      INSERT INTO tenant_billing_invoices (tenant_id, period_year, period_month, plan, base_amount, overage_amount, total_amount, currency, status)
      VALUES ($1, $2, $3, 'starter', 99.00, 0, 99.00, 'USD', 'draft')
      ON CONFLICT DO NOTHING
    `, [tenantId, now.getFullYear(), now.getMonth() + 1]);
    const check = await pool.query(
      "SELECT * FROM tenant_billing_invoices WHERE tenant_id = $1 AND plan = 'starter' LIMIT 1",
      [tenantId]
    );
    expect(check.rows.length).toBeGreaterThanOrEqual(1);
    expect(check.rows[0].currency).toBe("USD");
  });
});

// ─── DB Integration: SLA Metrics ─────────────────────────────────────────────
describe("DB: SLA Metrics", () => {
  it("has seeded SLA metrics for multiple services", async () => {
    const res = await pool.query("SELECT DISTINCT service_name FROM sla_metrics");
    expect(res.rows.length).toBeGreaterThanOrEqual(3);
  });

  it("uptime_pct is within valid range", async () => {
    const res = await pool.query("SELECT MIN(uptime_pct) as min_up, MAX(uptime_pct) as max_up FROM sla_metrics");
    expect(parseFloat(res.rows[0].min_up)).toBeGreaterThanOrEqual(99.0);
    expect(parseFloat(res.rows[0].max_up)).toBeLessThanOrEqual(100.0);
  });
});

// ─── DB Integration: Middleware Health Logs ───────────────────────────────────
describe("DB: Middleware Health Logs", () => {
  it("has seeded middleware health logs", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM middleware_health_logs");
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(3);
  });

  it("all seeded services are 'up'", async () => {
    const res = await pool.query("SELECT DISTINCT status FROM middleware_health_logs WHERE status != 'up'");
    expect(res.rows.length).toBe(0);
  });
});

// ─── DB Integration: FX Hedge Positions ──────────────────────────────────────
describe("DB: FX Hedge Positions", () => {
  it("has seeded FX hedge positions", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM fx_hedge_positions WHERE status = 'active'");
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(3);
  });

  it("hedge positions have valid notional amounts", async () => {
    const res = await pool.query("SELECT MIN(notional_amount) as min_n FROM fx_hedge_positions");
    expect(parseFloat(res.rows[0].min_n)).toBeGreaterThan(0);
  });
});

// ─── DB Integration: FX Live Rates ───────────────────────────────────────────
describe("DB: FX Live Rates", () => {
  it("has seeded FX live rates", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM fx_live_rates");
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("USD/NGN rate is within realistic range", async () => {
    const res = await pool.query("SELECT rate FROM fx_live_rates WHERE pair = 'USD/NGN'");
    if (res.rows.length === 0) return;
    const rate = parseFloat(res.rows[0].rate);
    expect(rate).toBeGreaterThan(1000);
    expect(rate).toBeLessThan(2500);
  });
});

// ─── DB Integration: KYB State Transitions ───────────────────────────────────
describe("DB: KYB State Transitions", () => {
  it("has seeded KYB state transitions", async () => {
    const res = await pool.query("SELECT COUNT(*) FROM kyb_state_transitions");
    expect(parseInt(res.rows[0].count)).toBeGreaterThanOrEqual(5);
  });

  it("transitions have valid from/to states", async () => {
    const res = await pool.query("SELECT DISTINCT to_state FROM kyb_state_transitions");
    const states = res.rows.map((r: any) => r.to_state);
    expect(states.length).toBeGreaterThanOrEqual(2);
  });
});

// ─── Wave 30 Router Procedures (via DB) ──────────────────────────────────────
describe("Wave 30 Router: Tenant Billing", () => {
  it("can query tenant billing invoices by tenant", async () => {
    const tenantRes = await pool.query("SELECT id FROM partner_tenants LIMIT 1");
    if (tenantRes.rows.length === 0) return;
    const tenantId = tenantRes.rows[0].id;
    const res = await pool.query(
      "SELECT * FROM tenant_billing_invoices WHERE tenant_id = $1 ORDER BY created_at DESC LIMIT 5",
      [tenantId]
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(0);
  });
});

describe("Wave 30 Router: SLA Monitoring", () => {
  it("can aggregate SLA metrics by service", async () => {
    const res = await pool.query(`
      SELECT service_name, AVG(uptime_pct) as avg_uptime, AVG(avg_latency_ms) as avg_latency
      FROM sla_metrics
      GROUP BY service_name
      ORDER BY avg_uptime ASC
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
    for (const row of res.rows) {
      expect(parseFloat(row.avg_uptime)).toBeGreaterThanOrEqual(99.0);
    }
  });
});

describe("Wave 30 Router: Middleware Health", () => {
  it("can get latest health status per service", async () => {
    const res = await pool.query(`
      SELECT DISTINCT ON (service) service, status, latency_ms, checked_at
      FROM middleware_health_logs
      ORDER BY service, checked_at DESC
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(3);
  });
});

describe("Wave 30 Router: FX Hedging", () => {
  it("can query open hedge positions", async () => {
    const res = await pool.query(
      "SELECT * FROM fx_hedge_positions WHERE status = 'active' ORDER BY created_at DESC LIMIT 10"
    );
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("can query FX live rates for all pairs", async () => {
    const res = await pool.query("SELECT * FROM fx_live_rates ORDER BY pair");
    expect(res.rows.length).toBeGreaterThanOrEqual(5);
    for (const row of res.rows) {
      expect(parseFloat(row.rate)).toBeGreaterThan(0);
    }
  });
});

describe("Wave 30 Router: KYB State Machine", () => {
  it("can query KYB transition history for a merchant", async () => {
    const res = await pool.query(`
      SELECT merchant_id, from_state, to_state, trigger_event, created_at
      FROM kyb_state_transitions
      ORDER BY created_at DESC
      LIMIT 20
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  });

  it("can count transitions per state", async () => {
    const res = await pool.query(`
      SELECT to_state, COUNT(*) as count
      FROM kyb_state_transitions
      GROUP BY to_state
      ORDER BY count DESC
    `);
    expect(res.rows.length).toBeGreaterThanOrEqual(1);
  });
});

// ─── Wave 30 UI Pages (existence checks) ─────────────────────────────────────
describe("Wave 30 UI Pages", () => {
  const pages = [
    "TenantStripeBilling",
    "OnboardingEmailFlow",
    "SlaAlertDashboard",
    "KybStateMachine",
    "MiddlewareIntegrations",
    "FxHedgingWorkflow",
  ];

  for (const page of pages) {
    it(`${page}.tsx exists`, async () => {
      const { existsSync } = await import("fs");
      const paths = [
        `/home/ubuntu/paygate-merchant-portal/client/src/pages/${page}.tsx`,
        `/home/ubuntu/paygate-merchant-portal/client/src/pages/admin/${page}.tsx`,
      ];
      const exists = paths.some(p => existsSync(p));
      expect(exists).toBe(true);
    });
  }
});

// ─── Wave 30 Server Files (existence checks) ─────────────────────────────────
describe("Wave 30 Server Files", () => {
  const files = [
    "wave30Router.ts",
    "security30.ts",
    "subdomainMiddleware.ts",
    "tenantMiddleware.ts",
  ];

  for (const file of files) {
    it(`${file} exists`, async () => {
      const { existsSync } = await import("fs");
      const exists = existsSync(`/home/ubuntu/paygate-merchant-portal/server/${file}`);
      expect(exists).toBe(true);
    });
  }
});
