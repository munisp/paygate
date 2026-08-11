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
    // Real contract: sessions whose openId starts with the cron prefix are
    // short-circuited into a buildCronUser() principal with isCron=true.
    const sdk = readFileSync(join(process.cwd(), "server", "_core", "sdk.ts"), "utf8");
    expect(sdk).toContain("CRON_OPEN_ID_PREFIX");
    expect(sdk).toContain('CRON_OPEN_ID_PREFIX = "cron_"');
    expect(sdk).toContain("session.openId.startsWith(CRON_OPEN_ID_PREFIX)");
    expect(sdk).toContain("buildCronUser");
    expect(sdk).toContain("isCron: true");
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

describe("Scheduled heartbeat — /api/scheduled/checkBreaches", () => {
  // Real contract: the nightly-security-audit endpoint was removed. The
  // remaining scheduled surface is the cron-only /api/scheduled/checkBreaches
  // heartbeat (threshold breach detection, owner notification, 500 on error),
  // plus rate limiting on all /api/scheduled routes.
  const readIndex = () => readFileSync(join(process.cwd(), "server", "_core", "index.ts"), "utf8");

  it("heartbeat handler is registered in index.ts", () => {
    expect(readIndex()).toContain('"/api/scheduled/checkBreaches"');
  });

  it("handler authenticates the caller and requires a cron principal", () => {
    const index = readIndex();
    expect(index).toContain("sdk.authenticateRequest");
    expect(index).toContain("user.isCron");
  });

  it("handler returns 403 for non-cron callers", () => {
    const index = readIndex();
    expect(index).toContain("cron-only endpoint");
    expect(index).toContain("403");
  });

  it("handler evaluates warn/critical thresholds", () => {
    const index = readIndex();
    expect(index).toContain("lagWarn");
    expect(index).toContain("memCriticalPct");
    expect(index).toContain('severity: "critical"');
  });

  it("handler persists breach events and notifies the owner on critical breaches", () => {
    const index = readIndex();
    expect(index).toContain("breach_events");
    expect(index).toContain("notifyOwner");
  });

  it("handler returns a structured breach summary", () => {
    const index = readIndex();
    expect(index).toContain("breaches: breachItems.length");
    expect(index).toContain("critical: criticalItems.length");
  });

  it("handler has proper error handling with 500 response", () => {
    const index = readIndex();
    expect(index).toContain("res.status(500)");
  });

  it("scheduled routes are rate limited (token-leak throttle)", () => {
    const index = readIndex();
    expect(index).toContain('"/api/scheduled"');
    expect(index).toContain("auth:scheduled");
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
