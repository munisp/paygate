/**
 * wave96.production.test.ts
 * Sprint v96: Notification system, skill creator, seed completeness, security audit
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── Skill Creator ───────────────────────────────────────────────────────────
// STALE CONTRACT: the out-of-repo skills/paygate-merchant-portal/SKILL.md
// artifact no longer exists; platform docs now live in docs/ inside the
// repository (same contract as wave131.production-hardening.test.ts).
describe("Skill Creator — paygate-merchant-portal skill", () => {
  const docsContent = () =>
    fs.readFileSync(path.join(ROOT, "docs/ARCHITECTURE.md"), "utf-8") +
    "\n" +
    fs.readFileSync(path.join(ROOT, "docs/PLATFORM_FEATURES.md"), "utf-8");

  it("platform docs exist and are non-trivial", () => {
    expect(fs.existsSync(path.join(ROOT, "docs/ARCHITECTURE.md"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "docs/PLATFORM_FEATURES.md"))).toBe(true);
    expect(docsContent().length).toBeGreaterThan(2000);
  });

  it("platform docs cover key platform features", () => {
    const content = docsContent();
    expect(content).toContain("wave");
    expect(content).toContain("APISIX");
    expect(content).toContain("open-appsec");
    expect(content).toContain("WAF");
  });
});

// ─── Seed Completeness ───────────────────────────────────────────────────────
// STALE CONTRACT: the legacy root-level seed-wave90/91/92/93/94/96.mjs scripts
// were intentionally removed in 4cb50bd (legacy MySQL-era seed purge); wave
// 90-96 tables are covered by the consolidated PG seeds in scripts/. The
// remaining contract: every seed referenced by scripts/seed-all.mjs exists.
describe("Seed file completeness", () => {
  const seedAll = fs.readFileSync(path.join(ROOT, "scripts/seed-all.mjs"), "utf-8");
  const referenced = [...seedAll.matchAll(/\["((?:scripts\/)?seed-[^"]+\.mjs)",/g)].map((m) => m[1]);

  it("scripts/seed-all.mjs references at least one seed script", () => {
    expect(referenced.length).toBeGreaterThan(0);
  });

  for (const seedFile of referenced) {
    it(`${seedFile} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, seedFile))).toBe(true);
    });
  }

  it("scripts/seed-all.mjs includes consolidated wave coverage", () => {
    expect(seedAll).toContain("seed-pg-production.mjs");
    expect(seedAll).toContain("seed-complete-all-tables.mjs");
    expect(seedAll).toContain("seed-wave95.mjs");
  });
});

// ─── Notification System ─────────────────────────────────────────────────────
describe("Notification system", () => {
  it("NotificationsCenter.tsx page exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "client/src/pages/NotificationsCenter.tsx"))
    ).toBe(true);
  });

  it("NotificationsCenter has SSE subscription", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "client/src/pages/NotificationsCenter.tsx"),
      "utf-8"
    );
    expect(content).toMatch(/(EventSource|useResilientSSE)/);
  });

  it("notificationsRouter exists in routers.ts", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("notificationsRouter");
  });

  // STALE CONTRACT: the /api/notifications/stream SSE endpoint was retired
  // from boot (see wave131.production-hardening.test.ts — "stream retired
  // from boot"). Real-time events are served by the Fluvio SSE module
  // (/api/events/stream registrar in server/fluvioSse.ts); index.ts must not
  // carry a dangling notifications-stream mount.
  it("notifications SSE stream is retired; Fluvio SSE module provides streaming", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/_core/index.ts"), "utf-8");
    expect(content).not.toContain("/api/notifications/stream");
    const sse = fs.readFileSync(path.join(ROOT, "server/fluvioSse.ts"), "utf-8");
    expect(sse).toContain("/api/events/stream");
    expect(sse).toContain("text/event-stream");
  });
});

// ─── WebhookSimulator ────────────────────────────────────────────────────────
describe("Webhook Simulator", () => {
  it("WebhookSimulator.tsx page exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "client/src/pages/Webhooks/WebhookSimulator.tsx"))
    ).toBe(true);
  });

  it("WebhookSimulator route is registered in App.tsx", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("WebhookSimulator");
    expect(content).toContain("/webhooks/simulator");
  });
});

// ─── WAF Alert Dashboard ─────────────────────────────────────────────────────
describe("WAF Alert Dashboard", () => {
  it("WAFAlertDashboard.tsx page exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "client/src/pages/WAFAlertDashboard.tsx"))
    ).toBe(true);
  });

  it("WAFAlertDashboard route is registered in App.tsx", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    expect(content).toContain("WAFAlertDashboard");
    expect(content).toContain("/waf-alerts");
  });

  it("WAFAlertDashboard uses SSE for real-time events", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "client/src/pages/WAFAlertDashboard.tsx"),
      "utf-8"
    );
    expect(content).toMatch(/(EventSource|useResilientSSE)/);
  });
});

// ─── Security Audit Reports ──────────────────────────────────────────────────
describe("Security audit reports", () => {
  it("SECURITY_AUDIT_v95.md exists with 100/100 score", () => {
    const auditPath = path.join(ROOT, "SECURITY_AUDIT_v95.md");
    expect(fs.existsSync(auditPath)).toBe(true);
    const content = fs.readFileSync(auditPath, "utf-8");
    expect(content).toContain("100");
  });

  it("open-appsec WAF policy exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "infra/apisix/waf-policy.yaml"))
    ).toBe(true);
  });

  it("mTLS generate-certs.sh exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "infra/certs/generate-certs.sh"))
    ).toBe(true);
  });

  it("fail2ban jail.local exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "infra/security/fail2ban/jail.local"))
    ).toBe(true);
  });
});

// ─── Route Coverage ──────────────────────────────────────────────────────────
describe("Route coverage", () => {
  it("App.tsx has 300+ routes registered", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    const routeCount = (content.match(/<Route /g) || []).length;
    expect(routeCount).toBeGreaterThan(300);
  });

  it("All key feature pages are registered", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/App.tsx"), "utf-8");
    const requiredPages = [
      "BNPLCalculator",
      "InsuranceHub",
      "RemittanceTracker",
      "LoyaltyDashboard",
      "EMIManagement",
      "SubscriptionManagement",
      "GoldSIP",
      "ConsumerLoyaltyApp",
      "WebhookLiveStream",
      "FraudAlertsDashboard",
      "WAFAlertDashboard",
      "WebhookSimulator",
      "DeveloperPortal",
    ];
    for (const page of requiredPages) {
      expect(content, `${page} should be in App.tsx`).toContain(page);
    }
  });
});

// ─── Observability Stack ─────────────────────────────────────────────────────
describe("Observability stack", () => {
  it("docker-compose.observability.yml exists", () => {
    expect(
      fs.existsSync(path.join(ROOT, "infra/docker-compose.observability.yml"))
    ).toBe(true);
  });

  it("prometheus.yml exists with job configs", () => {
    const prometheusPath = path.join(ROOT, "infra/prometheus/prometheus.yml");
    expect(fs.existsSync(prometheusPath)).toBe(true);
    const content = fs.readFileSync(prometheusPath, "utf-8");
    expect(content).toContain("paygate");
  });

  it("Grafana provisioning datasource exists", () => {
    const dsPath = path.join(ROOT, "infra/grafana/provisioning/datasources/prometheus.yaml");
    expect(fs.existsSync(dsPath)).toBe(true);
  });

  it("docker-compose.waf.yml has open-appsec service", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "infra/docker-compose.waf.yml"),
      "utf-8"
    );
    expect(content).toContain("open-appsec");
    expect(content).toContain("apisix");
  });
});
