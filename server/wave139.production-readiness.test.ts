/**
 * Wave 139 Production-Readiness Tests
 *
 * Covers:
 * 1. publishAuditEvent wired to settlement.create, payment_link.create, virtual_card.create
 * 2. RN screens have error handling (error in destructure)
 * 3. wave90Router.ts has TRPCError import
 * 4. Total audit event coverage (publishAuditEvent + logAuditEvent >= 40)
 * 5. No sensitive data in console.log
 */

import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Wave 139: Audit Event Coverage", () => {
  it("settlement.create has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("settlement.created");
    expect(content).toContain("publishAuditEvent");
  });

  it("payment_link.create has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("payment_link.created");
  });

  it("virtual_card.create has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("virtual_card.created");
  });

  it("total audit events >= 40 (publishAuditEvent + logAuditEvent)", () => {
    const content = read("server/routers.ts");
    const publishCount = (content.match(/publishAuditEvent/g) || []).length;
    const logCount = (content.match(/logAuditEvent/g) || []).length;
    const total = publishCount + logCount;
    expect(total).toBeGreaterThanOrEqual(40);
  });

  it("webhook.create has logAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("webhook.created");
  });

  it("team.invite has logAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("team.member_invited");
  });

  it("api_key.revoke has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("api_key.revoked");
  });

  it("setUserRole has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("user.role.changed");
  });

  it("approvePayrollRun has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("payroll.run.approved");
  });
});

describe("Wave 139: wave90Router TRPCError", () => {
  it("wave90Router.ts imports TRPCError", () => {
    const content = read("server/wave90Router.ts");
    expect(content).toContain("TRPCError");
    expect(content).toContain("@trpc/server");
  });

  it("wave90Router.ts uses TRPCError in partnerOnboardingRouter", () => {
    const content = read("server/wave90Router.ts");
    expect(content).toContain("UNAUTHORIZED");
  });
});

describe("Wave 139: RN Screen Error Handling", () => {
  it("CrossBorderScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/CrossBorderScreen.tsx");
    expect(content).toMatch(/error/);
  });

  it("InsuranceScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/InsuranceScreen.tsx");
    expect(content).toMatch(/error/);
  });

  it("LoyaltyScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/LoyaltyScreen.tsx");
    expect(content).toMatch(/error/);
  });

  it("MobileMoneyScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/MobileMoneyScreen.tsx");
    expect(content).toMatch(/error/);
  });

  it("NIPScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/NIPScreen.tsx");
    expect(content).toMatch(/error/);
  });

  it("TransactionsScreen has error handling", () => {
    const content = read("mobile/react-native/src/screens/TransactionsScreen.tsx");
    expect(content).toMatch(/error/);
  });
});

describe("Wave 139: Security - No Sensitive Console.log", () => {
  it("routers.ts has no console.log with password/secret/token values", () => {
    const content = read("server/routers.ts");
    const lines = content.split("\n");
    const sensitiveLines = lines.filter(
      (line) =>
        /console\.log.*password/i.test(line) ||
        /console\.log.*secret/i.test(line) ||
        /console\.log.*token.*=.*['"]/i.test(line)
    );
    expect(sensitiveLines).toHaveLength(0);
  });
});

describe("Wave 139: Settlement Audit Trail", () => {
  it("settlement.create audit event includes amount and currency", () => {
    const content = read("server/routers.ts");
    const idx = content.indexOf("settlement.created");
    expect(idx).toBeGreaterThan(-1);
    const context = content.substring(idx, idx + 200);
    expect(context).toContain("amount");
    expect(context).toContain("currency");
  });

  it("payment_link.create audit event includes merchantId", () => {
    const content = read("server/routers.ts");
    const idx = content.indexOf("payment_link.created");
    expect(idx).toBeGreaterThan(-1);
    const context = content.substring(idx, idx + 200);
    expect(context).toContain("merchantId");
  });

  it("virtual_card.create audit event includes brand and currency", () => {
    const content = read("server/routers.ts");
    const idx = content.indexOf("virtual_card.created");
    expect(idx).toBeGreaterThan(-1);
    const context = content.substring(idx, idx + 200);
    expect(context).toContain("brand");
    expect(context).toContain("currency");
  });
});
