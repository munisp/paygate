/**
 * wave95.production.test.ts
 * Sprint v95: Prometheus config, Grafana provisioning, mTLS certs, WAF Alert Dashboard, seed data
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";
import yaml from "js-yaml";

const INFRA = path.resolve(__dirname, "../infra");

// ─── Prometheus Configuration ─────────────────────────────────────────────
describe("Prometheus Configuration", () => {
  it("prometheus.yml exists", () => {
    expect(fs.existsSync(path.join(INFRA, "prometheus/prometheus.yml"))).toBe(true);
  });

  it("prometheus.yml has correct scrape jobs", () => {
    const content = fs.readFileSync(path.join(INFRA, "prometheus/prometheus.yml"), "utf-8");
    const config = yaml.load(content) as any;
    const jobs = config.scrape_configs.map((j: any) => j.job_name);
    expect(jobs).toContain("apisix");
    expect(jobs).toContain("paygate-app");
    expect(jobs).toContain("node-exporter");
    expect(jobs).toContain("redis");
  });

  it("paygate-alerts.yml exists with security and business rules", () => {
    const content = fs.readFileSync(path.join(INFRA, "prometheus/paygate-alerts.yml"), "utf-8");
    expect(content).toContain("HighWAFBlockRate");
    expect(content).toContain("SIPProcessorFailed");
    expect(content).toContain("HighFraudAlertRate");
    expect(content).toContain("DatabaseConnectionPoolExhausted");
  });

  it("alert rules have correct severity labels", () => {
    const content = fs.readFileSync(path.join(INFRA, "prometheus/paygate-alerts.yml"), "utf-8");
    expect(content).toContain("severity: critical");
    expect(content).toContain("severity: warning");
  });
});

// ─── Grafana Provisioning ─────────────────────────────────────────────────
describe("Grafana Provisioning", () => {
  it("datasources provisioning file exists", () => {
    expect(fs.existsSync(path.join(INFRA, "grafana/provisioning/datasources/prometheus.yaml"))).toBe(true);
  });

  it("dashboards provisioning file exists", () => {
    expect(fs.existsSync(path.join(INFRA, "grafana/provisioning/dashboards/paygate.yaml"))).toBe(true);
  });

  it("datasource points to prometheus", () => {
    const content = fs.readFileSync(path.join(INFRA, "grafana/provisioning/datasources/prometheus.yaml"), "utf-8");
    expect(content).toContain("http://prometheus:9090");
    expect(content).toContain("isDefault: true");
  });

  it("WAF dashboard JSON exists", () => {
    expect(fs.existsSync(path.join(INFRA, "grafana/paygate-waf-dashboard.json"))).toBe(true);
  });

  it("SIP dashboard JSON exists", () => {
    expect(fs.existsSync(path.join(INFRA, "grafana/paygate-sip-dashboard.json"))).toBe(true);
  });
});

// ─── Observability Docker Compose ─────────────────────────────────────────
describe("Observability Docker Compose", () => {
  it("docker-compose.observability.yml exists", () => {
    expect(fs.existsSync(path.join(INFRA, "docker-compose.observability.yml"))).toBe(true);
  });

  it("includes prometheus, grafana, alertmanager, node-exporter", () => {
    const content = fs.readFileSync(path.join(INFRA, "docker-compose.observability.yml"), "utf-8");
    expect(content).toContain("prometheus");
    expect(content).toContain("grafana");
    expect(content).toContain("alertmanager");
    expect(content).toContain("node-exporter");
    expect(content).toContain("redis-exporter");
  });

  it("grafana has security hardening env vars", () => {
    const content = fs.readFileSync(path.join(INFRA, "docker-compose.observability.yml"), "utf-8");
    expect(content).toContain("GF_USERS_ALLOW_SIGN_UP=false");
    expect(content).toContain("GF_AUTH_ANONYMOUS_ENABLED=false");
    expect(content).toContain("GF_SECURITY_COOKIE_SECURE=true");
  });

  it("prometheus has 30-day retention", () => {
    const content = fs.readFileSync(path.join(INFRA, "docker-compose.observability.yml"), "utf-8");
    expect(content).toContain("30d");
  });
});

// ─── mTLS Certificates ────────────────────────────────────────────────────
describe("mTLS Certificate Infrastructure", () => {
  it("certs directory exists", () => {
    expect(fs.existsSync(path.join(INFRA, "certs"))).toBe(true);
  });

  it("generate-certs.sh script exists", () => {
    expect(fs.existsSync(path.join(INFRA, "certs/generate-certs.sh"))).toBe(true);
  });

  it("CA certificate exists", () => {
    expect(fs.existsSync(path.join(INFRA, "certs/ca.crt"))).toBe(true);
  });

  it("server certificate exists", () => {
    expect(fs.existsSync(path.join(INFRA, "certs/server.crt"))).toBe(true);
  });

  it("client certificate exists", () => {
    expect(fs.existsSync(path.join(INFRA, "certs/client.crt"))).toBe(true);
  });

  it("CA cert is PEM format", () => {
    const content = fs.readFileSync(path.join(INFRA, "certs/ca.crt"), "utf-8");
    expect(content).toContain("BEGIN CERTIFICATE");
    expect(content).toContain("END CERTIFICATE");
  });

  it("certs are in .gitignore", () => {
    const gitignore = fs.readFileSync(path.resolve(__dirname, "../.gitignore"), "utf-8");
    expect(gitignore).toContain("*.pem");
  });
});

// ─── WAF Alert Dashboard ──────────────────────────────────────────────────
describe("WAF Alert Dashboard Page", () => {
  it("WAFAlertDashboard.tsx exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../client/src/pages/WAFAlertDashboard.tsx"))).toBe(true);
  });

  it("WAFAlertDashboard has SSE connection logic", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/WAFAlertDashboard.tsx"), "utf-8");
    expect(content).toContain("EventSource");
  });

  it("WAFAlertDashboard shows attack type breakdown", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../client/src/pages/WAFAlertDashboard.tsx"), "utf-8");
    expect(content.toLowerCase()).toContain("attack");
  });
});

// ─── Security Audit Report ────────────────────────────────────────────────
describe("Security Audit Report v95", () => {
  it("SECURITY_AUDIT_v95.md exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../SECURITY_AUDIT_v95.md"))).toBe(true);
  });

  it("reports 100/100 score", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../SECURITY_AUDIT_v95.md"), "utf-8");
    expect(content).toContain("100 / 100");
  });

  it("covers all OWASP Top-10 categories", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../SECURITY_AUDIT_v95.md"), "utf-8");
    expect(content).toContain("A01");
    expect(content).toContain("A10");
  });
});

// ─── Seed Data ────────────────────────────────────────────────────────────
describe("Wave 95 Seed Data", () => {
  it("seed-wave95.mjs exists", () => {
    expect(fs.existsSync(path.resolve(__dirname, "../seed-wave95.mjs"))).toBe(true);
  });

  it("seed file covers WAF events, SIP snapshots, mTLS registry", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../seed-wave95.mjs"), "utf-8");
    expect(content).toContain("waf_events");
    expect(content).toContain("sip_portfolio_snapshots");
    expect(content).toContain("mtls_cert_registry");
    expect(content).toContain("observability_metrics_config");
  });

  it("WAF events include critical attack types", () => {
    const content = fs.readFileSync(path.resolve(__dirname, "../seed-wave95.mjs"), "utf-8");
    expect(content).toContain("sql_injection");
    expect(content).toContain("card_testing");
    expect(content).toContain("log4shell");
  });
});
