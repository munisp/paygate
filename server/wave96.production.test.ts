/**
 * wave96.production.test.ts
 * Sprint v96: Notification system, skill creator, seed completeness, security audit
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

// ─── Skill Creator ───────────────────────────────────────────────────────────
describe("Skill Creator — paygate-merchant-portal skill", () => {
  it("skill SKILL.md exists and is non-trivial", () => {
    const skillPath = path.join(ROOT, "../skills/paygate-merchant-portal/SKILL.md");
    expect(fs.existsSync(skillPath)).toBe(true);
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content.length).toBeGreaterThan(2000);
  });

  it("skill covers key platform features", () => {
    const skillPath = path.join(ROOT, "../skills/paygate-merchant-portal/SKILL.md");
    const content = fs.readFileSync(skillPath, "utf-8");
    expect(content).toContain("wave");
    expect(content).toContain("APISIX");
    expect(content).toContain("open-appsec");
    expect(content).toContain("WAF");
  });
});

// ─── Seed Completeness ───────────────────────────────────────────────────────
describe("Seed file completeness", () => {
  const seedFiles = [
    "seed-wave90.mjs",
    "seed-wave91.mjs",
    "seed-wave92.mjs",
    "seed-wave93.mjs",
    "seed-wave94.mjs",
    "seed-wave95.mjs",
    "seed-wave96.mjs",
  ];

  for (const seedFile of seedFiles) {
    it(`${seedFile} exists`, () => {
      expect(fs.existsSync(path.join(ROOT, seedFile))).toBe(true);
    });
  }

  it("scripts/seed-all.mjs includes wave90-96 seeds", () => {
    const content = fs.readFileSync(path.join(ROOT, "scripts/seed-all.mjs"), "utf-8");
    expect(content).toContain("seed-wave90.mjs");
    expect(content).toContain("seed-wave91.mjs");
    expect(content).toContain("seed-wave92.mjs");
    expect(content).toContain("seed-wave93.mjs");
    expect(content).toContain("seed-wave94.mjs");
    expect(content).toContain("seed-wave95.mjs");
    expect(content).toContain("seed-wave96.mjs");
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
    expect(content).toContain("EventSource");
  });

  it("notificationsRouter exists in routers.ts", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("notificationsRouter");
  });

  it("SSE notifications stream endpoint exists in index.ts", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/_core/index.ts"), "utf-8");
    expect(content).toContain("/api/notifications/stream");
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
    expect(content).toContain("EventSource");
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
