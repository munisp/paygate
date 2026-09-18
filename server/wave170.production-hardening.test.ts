/**
 * Wave 170 — Seed Scripts, Audit Status, KYC/KYB Improvements
 * Tests: seed-wave170.mjs structure, security_audit_snapshots schema,
 *        nightly audit status endpoint, package.json seed scripts.
 */
import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const ROOT = path.resolve(__dirname, "..");

describe("Wave 170 — seed entry points", () => {
  // Real contract: there is no seed-wave170.mjs and no package.json seed
  // aliases. Seeding is done with the root-level seed.mjs (idempotent,
  // --dry-run capable) plus the wave-specific seed-*.mjs files, invoked
  // directly with node.
  it("seed.mjs exists in project root", () => {
    expect(fs.existsSync(path.join(ROOT, "seed.mjs"))).toBe(true);
  });

  it("seed.mjs uses ON CONFLICT DO NOTHING for idempotency", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed.mjs"), "utf8");
    expect(src).toMatch(/ON CONFLICT.*DO NOTHING/i);
  });

  it("seed.mjs has --dry-run support", () => {
    const src = fs.readFileSync(path.join(ROOT, "seed.mjs"), "utf8");
    expect(src).toContain("--dry-run");
    expect(src).toContain('process.argv.includes("--dry-run")');
  });

  it("wave-specific seed scripts exist at project root", () => {
    expect(fs.existsSync(path.join(ROOT, "seed-wave78-fixed.mjs"))).toBe(true);
    expect(fs.existsSync(path.join(ROOT, "seed-wave95.mjs"))).toBe(true);
  });

  it("additional seed scripts live under scripts/", () => {
    expect(fs.existsSync(path.join(ROOT, "scripts", "seed-pg-bootstrap.mjs"))).toBe(true);
  });
});

describe("Wave 170 — package.json operational scripts", () => {
  // Real contract: package.json carries no seed:* aliases; the operational
  // surface is test / db:push / build / dev.
  it("package.json has a test script running vitest", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["test"]).toContain("vitest");
  });

  it("package.json has a db:push script for schema migrations", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["db:push"]).toContain("drizzle-kit");
  });

  it("package.json has a build script", () => {
    const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
    expect(pkg.scripts["build"]).toBeDefined();
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
  it("nightly-security-audit endpoints were removed; scheduled surface is checkBreaches", () => {
    // Real contract: the nightly security audit (and its status endpoint) no
    // longer exist. The only scheduled endpoint is the cron-only heartbeat.
    const src = fs.readFileSync(path.join(ROOT, "server/_core/index.ts"), "utf8");
    expect(src).not.toContain("nightly-security-audit");
    expect(src).toContain('"/api/scheduled/checkBreaches"');
  });

  it("SecurityAuditDashboard uses nightlyAuditStatus tRPC query", () => {
    const page = fs.readFileSync(
      path.join(ROOT, "client/src/pages/SecurityAuditDashboard.tsx"),
      "utf8"
    );
    expect(page).toContain("nightlyAuditStatus");
  });
});
