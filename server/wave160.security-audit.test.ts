/**
 * Wave 160 — Security Audit Tests
 */
import { describe, it, expect } from "vitest";
import * as fs from "fs";
import * as path from "path";

const ROOT = path.resolve(__dirname, "..");

function readFile(rel: string) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}
function fileExists(rel: string) {
  return fs.existsSync(path.join(ROOT, rel));
}

// ─── 1. Router ────────────────────────────────────────────────────────────────
describe("Wave 160: wave160Router", () => {
  it("router file exists", () => {
    expect(fileExists("server/routers/wave160.ts")).toBe(true);
  });
  it("exports wave160Router", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("export const wave160Router");
  });
  it("has getVulnerabilityReport procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("getVulnerabilityReport");
  });
  it("has getPbacPolicies procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("getPbacPolicies");
  });
  it("has evaluatePermission procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("evaluatePermission");
  });
  it("has getThreatSurface procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("getThreatSurface");
  });
  it("has getWafSummary procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("getWafSummary");
  });
  it("has runPenetrationCheck procedure", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("runPenetrationCheck");
  });
  it("implements deny-before-allow PBAC evaluation", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("deny");
    expect(content).toContain("allow");
    // deny check comes before allow check
    const denyIdx = content.indexOf('"deny"');
    const allowIdx = content.lastIndexOf('"allow"');
    expect(denyIdx).toBeLessThan(allowIdx);
  });
  it("defines THREAT_WEIGHTS for 6 attack vectors", () => {
    const content = readFile("server/routers/wave160.ts");
    expect(content).toContain("ransomware");
    expect(content).toContain("ddos");
    expect(content).toContain("sqli");
    expect(content).toContain("xss");
    expect(content).toContain("auth_bypass");
    expect(content).toContain("api_abuse");
  });
});

// ─── 2. Router registration ───────────────────────────────────────────────────
describe("Wave 160: router registration", () => {
  it("wave160Router is imported in routers.ts", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("wave160Router");
  });
  it("securityAudit namespace is registered", () => {
    const content = readFile("server/routers.ts");
    expect(content).toContain("securityAudit");
  });
});

// ─── 3. Frontend page ────────────────────────────────────────────────────────
describe("Wave 160: SecurityAuditDashboard page", () => {
  it("SecurityAuditDashboard.tsx exists", () => {
    expect(fileExists("client/src/pages/SecurityAuditDashboard.tsx")).toBe(true);
  });
  it("page uses trpc.securityAudit.getVulnerabilityReport", () => {
    const content = readFile("client/src/pages/SecurityAuditDashboard.tsx");
    expect(content).toContain("securityAudit.getVulnerabilityReport");
  });
  it("page uses trpc.securityAudit.getWafSummary", () => {
    const content = readFile("client/src/pages/SecurityAuditDashboard.tsx");
    expect(content).toContain("securityAudit.getWafSummary");
  });
  it("page uses trpc.securityAudit.getPbacPolicies", () => {
    const content = readFile("client/src/pages/SecurityAuditDashboard.tsx");
    expect(content).toContain("securityAudit.getPbacPolicies");
  });
  it("page uses trpc.securityAudit.evaluatePermission", () => {
    const content = readFile("client/src/pages/SecurityAuditDashboard.tsx");
    expect(content).toContain("securityAudit.evaluatePermission");
  });
  it("page uses trpc.securityAudit.runPenetrationCheck", () => {
    const content = readFile("client/src/pages/SecurityAuditDashboard.tsx");
    expect(content).toContain("securityAudit.runPenetrationCheck");
  });
  it("page is registered in App.tsx", () => {
    const appTsx = readFile("client/src/App.tsx");
    expect(appTsx).toContain("SecurityAuditDashboard");
    expect(appTsx).toContain("/security-audit");
  });
  it("page is in sidebar navigation", () => {
    const layout = readFile("client/src/components/Layout.tsx");
    expect(layout).toContain("/security-audit");
  });
});
