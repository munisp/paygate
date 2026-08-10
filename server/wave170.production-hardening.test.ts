/**
 * Wave 170 — Seed Scripts, Audit Status, KYC/KYB Improvements
 * Tests: seed-wave170.mjs structure, security_audit_snapshots schema,
 *        nightly audit status endpoint, package.json seed scripts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Wave 170 — seed-wave170.mjs", () => {
  it("seed-wave170.mjs exists in project root", () => {
    expect(fs.existsSync(path.join(ROOT, "seed-wave170.mjs"))).toBe(true);
  });

  it("seed-wave170.mjs uses ON CONFLICT DO NOTHING for idempotency", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed-wave170.mjs"), "utf8");
    expect(src).toMatch(/ON CONFLICT.*DO NOTHING/i);
  });

  it("seed-wave170.mjs seeds security_audit_snapshots table", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed-wave170.mjs"), "utf8");
    expect(src).toContain("security_audit_snapshots");
  });

  it("seed-wave170.mjs seeds keycloak_role_sync_logs table", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed-wave170.mjs"), "utf8");
    expect(src).toContain("keycloak_role_sync_logs");
  });

  it("seed-wave170.mjs has --dry-run support", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed-wave170.mjs"), "utf8");
    expect(src).toContain("dry-run");
  });

  it("seed-wave170.mjs has error collection pattern", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed-wave170.mjs"), "utf8");
    expect(src).toMatch(/errors\s*=\s*\[\]/);
  });
});

describe("Wave 170 — package.json seed scripts", () => {
  it("package.json has seed:wave170 script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["seed:wave170"]).toBeDefined();
    expect(pkg.scripts["seed:wave170"]).toContain("seed-wave170.mjs");
  });

  it("package.json has seed script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["seed"]).toBeDefined();
  });

  it("package.json has seed:dry script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["seed:dry"]).toBeDefined();
    expect(pkg.scripts["seed:dry"]).toContain("--dry-run");
  });
});

describe("Wave 170 — security_audit_snapshots schema", () => {
  it("schema.ts exports securityAuditSnapshots table", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    expect(schema).toContain("security_audit_snapshots");
  });

  it("security_audit_snapshots has merchantId column", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    const idx = schema.indexOf("security_audit_snapshots");
    const block = schema.slice(idx, idx + 600);
    expect(block).toContain("merchant_id");
  });

  it("security_audit_snapshots has score column", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    const idx = schema.indexOf("security_audit_snapshots");
    const block = schema.slice(idx, idx + 600);
    expect(block).toMatch(/score|overall_score/);
  });

  it("security_audit_snapshots has createdAt column", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    const idx = schema.indexOf("security_audit_snapshots");
    const block = schema.slice(idx, idx + 600);
    expect(block).toContain("created_at");
  });
});

describe("Wave 170 — keycloak_role_sync_logs schema", () => {
  it("schema.ts exports keycloakRoleSyncLogs table", () => {
    const schema = fs.readFileSync(path.join(ROOT, "drizzle/schema.ts"), "utf8");
    expect(schema).toContain("keycloak_role_sync_logs");
  });
});

describe("Wave 170 — nightly audit status endpoint", () => {
  it("index.ts has GET /api/scheduled/nightly-security-audit/status endpoint", () => {
    const src = fs.readFileSync(path.join(ROOT, "server/_core/index.ts"), "utf8");
    expect(src).toContain("/api/scheduled/nightly-security-audit/status");
  });

  it("SecurityAuditDashboard uses nightlyAuditStatus tRPC query", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "client/src/pages/SecurityAuditDashboard.tsx"),
      "utf8"
    );
    expect(page).toContain("nightlyAuditStatus");
  });
});
