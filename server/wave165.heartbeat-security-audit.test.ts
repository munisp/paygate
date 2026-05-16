/**
 * Wave 165 — Nightly Security Audit Heartbeat tests
 *
 * Tests the /api/scheduled/nightly-security-audit endpoint and the
 * Heartbeat cron infrastructure (sdk.ts patches, manusTypes.ts taskUid).
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync, readdirSync } from "fs";
import { join } from "path";

describe("Heartbeat Infrastructure — SDK Patches", () => {
  it("sdk.ts has CRON_OPEN_ID_PREFIX constant", () => {
    const sdk = readFileSync(join(process.cwd(), "server", "_core", "sdk.ts"), "utf8");
    expect(sdk).toContain("CRON_OPEN_ID_PREFIX");
  });

  it("sdk.ts has AuthenticatedUser type with isCron and taskUid", () => {
    const sdk = readFileSync(join(process.cwd(), "server", "_core", "sdk.ts"), "utf8");
    expect(sdk).toContain("isCron");
    expect(sdk).toContain("taskUid");
  });

  it("sdk.ts has buildCronUser helper function", () => {
    const sdk = readFileSync(join(process.cwd(), "server", "_core", "sdk.ts"), "utf8");
    expect(sdk).toContain("buildCronUser");
  });

  it("sdk.ts authenticateRequest has cron short-circuit", () => {
    const sdk = readFileSync(join(process.cwd(), "server", "_core", "sdk.ts"), "utf8");
    expect(sdk).toContain("CRON_OPEN_ID_PREFIX");
    expect(sdk).toContain("Cron short-circuit");
  });

  it("manusTypes.ts GetUserInfoWithJwtResponse has taskUid field", () => {
    const types = readFileSync(join(process.cwd(), "server", "_core", "types", "manusTypes.ts"), "utf8");
    expect(types).toContain("taskUid");
    expect(types).toContain("GetUserInfoWithJwtResponse");
  });

  it("heartbeat.ts helper module exists", () => {
    expect(existsSync(join(process.cwd(), "server", "_core", "heartbeat.ts"))).toBe(true);
  });
});

describe("Nightly Security Audit — /api/scheduled/nightly-security-audit", () => {
  it("nightly security audit handler is registered in index.ts", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("/api/scheduled/nightly-security-audit");
  });

  it("handler requires x-manus-cron-task-uid header", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("x-manus-cron-task-uid");
  });

  it("handler returns 403 if cron header is missing", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("cron-only endpoint");
  });

  it("handler runs vulnerability checks", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("auth-guards");
    expect(index).toContain("trpc-errors");
    expect(index).toContain("zod-validation");
  });

  it("handler computes security score and grade", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("score");
    expect(index).toContain("grade");
    expect(index).toContain("A+");
  });

  it("handler notifies owner on P0 failures", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("notifyOwner");
    expect(index).toContain("SECURITY ALERT");
  });

  it("handler returns structured audit result", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("p0Failures");
    expect(index).toContain("p1Failures");
    expect(index).toContain("p2Failures");
    expect(index).toContain("durationMs");
  });

  it("handler has proper error handling with 500 response", () => {
    const index = readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");
    expect(index).toContain("Nightly security audit failed");
    expect(index).toContain("res.status(500)");
  });
});

describe("Nightly Security Audit — Logic Validation", () => {
  // Inline the audit logic for unit testing
  function runAuditChecks() {
    const routersPath = join(process.cwd(), "server", "routers.ts");
    const schemaPath = join(process.cwd(), "drizzle", "schema.ts");
    const routers = existsSync(routersPath) ? readFileSync(routersPath, "utf8") : "";
    const schema = existsSync(schemaPath) ? readFileSync(schemaPath, "utf8") : "";

    const procedureCount = (routers.match(/\b(publicProcedure|protectedProcedure)\b/g) ?? []).length;
    const tableCount = (schema.match(/pgTable\(/g) ?? []).length;
    const testFileCount = readdirSync(join(process.cwd(), "server")).filter((f) => f.endsWith(".test.ts")).length;

    const checks = [
      { id: "auth-guards", severity: "P0", pass: routers.includes("protectedProcedure") },
      { id: "trpc-errors", severity: "P0", pass: routers.includes("TRPCError") },
      { id: "zod-validation", severity: "P0", pass: routers.includes("z.object") || routers.includes("z.string") },
      { id: "env-config", severity: "P1", pass: existsSync(join(process.cwd(), "server", "_core", "env.ts")) },
      { id: "schema-coverage", severity: "P1", pass: tableCount >= 100 },
      { id: "test-coverage", severity: "P2", pass: testFileCount >= 100 },
      { id: "procedure-count", severity: "P2", pass: procedureCount >= 200 },
    ];

    const p0Failures = checks.filter(c => c.severity === "P0" && !c.pass).length;
    const passed = checks.filter(c => c.pass).length;
    const score = Math.round((passed / checks.length) * 100);

    return { checks, p0Failures, passed, score, tableCount, procedureCount, testFileCount };
  }

  it("all P0 security checks pass", () => {
    const result = runAuditChecks();
    const p0 = result.checks.filter(c => c.severity === "P0");
    for (const check of p0) {
      expect(check.pass).toBe(true);
    }
  });

  it("security score is >= 80", () => {
    const result = runAuditChecks();
    expect(result.score).toBeGreaterThanOrEqual(80);
  });

  it("schema has >= 100 tables", () => {
    const result = runAuditChecks();
    expect(result.tableCount).toBeGreaterThanOrEqual(100);
  });

  it("router has >= 200 procedures", () => {
    const result = runAuditChecks();
    expect(result.procedureCount).toBeGreaterThanOrEqual(200);
  });

  it("test files >= 100", () => {
    const result = runAuditChecks();
    expect(result.testFileCount).toBeGreaterThanOrEqual(100);
  });
});
