/**
 * Wave 150 Production-Readiness Tests
 *
 * Focus: Final comprehensive audit.
 * - Schema index coverage
 * - No bare fire-and-forget audit events
 * - Webhook signature verification present
 * - API key creation returns rawKey only once
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const serverDir = path.resolve(__dirname);
const projectDir = path.resolve(__dirname, "..");

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(serverDir, relPath), "utf-8");
}

function readProjectFile(relPath: string): string {
  return fs.readFileSync(path.join(projectDir, relPath), "utf-8");
}

describe("Wave 150: Final comprehensive production audit", () => {
  it("schema.ts: has substantial index coverage (>= 400 indexes)", () => {
    const content = readProjectFile("drizzle/schema.ts");
    const indexCount = (content.match(/\bindex\(/g) ?? []).length;
    const uniqueIndexCount = (content.match(/\buniqueIndex\(/g) ?? []).length;
    expect(indexCount + uniqueIndexCount).toBeGreaterThanOrEqual(400);
  });

  it("schema.ts: has >= 200 tables defined", () => {
    const content = readProjectFile("drizzle/schema.ts");
    const tableCount = (content.match(/\bpgTable\(/g) ?? []).length;
    expect(tableCount).toBeGreaterThanOrEqual(200);
  });

  it("routers.ts: fire-and-forget audit events have .catch() handlers", () => {
    const content = readFile("routers.ts");
    // Find publishAuditEvent calls that are fire-and-forget
    const lines = content.split("\n");
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes("publishAuditEvent(") && !line.trim().startsWith("//") && !line.includes("await ")) {
        // Check if within 8 lines there's a .catch (multi-line publishAuditEvent calls)
        const context = lines.slice(i, i + 9).join("\n");
        expect(context).toMatch(/\.catch\(/);
      }
    }
  });

  it("stripe.ts: webhook endpoint has signature verification", () => {
    const content = readFile("stripe.ts");
    expect(content).toMatch(/constructEvent|verifySignature|STRIPE_WEBHOOK_SECRET/);
  });

  it("routers.ts: API key creation returns rawKey with warning or once-only note", () => {
    const content = readFile("routers.ts");
    // The rawKey should be returned only at creation time
    expect(content).toMatch(/rawKey/);
    // Should not return rawKey in list operations
    const listSection = content.match(/list:\s*(?:protected|public)Procedure[\s\S]*?(?=\n  \w+:)/);
    if (listSection) {
      expect(listSection[0]).not.toMatch(/rawKey/);
    }
  });

  it("portalBillingRouter.ts: cancelSubscription has audit trail", () => {
    const content = readFile("portalBillingRouter.ts");
    expect(content).toMatch(/publishAuditEvent/);
    expect(content).toMatch(/subscription\.cancel/);
  });

  it("tier1to5Router.ts: AML fetch calls have error handling", () => {
    const content = readFile("tier1to5Router.ts");
    // Should have TRPCError for failed external calls
    expect(content).toMatch(/TRPCError.*INTERNAL_SERVER_ERROR/);
    // No bare fetch-then-json without ok check
    const barePattern = /const res = await fetch\([^;]+\);\n\s*return res\.json\(\);/;
    expect(content).not.toMatch(barePattern);
  });

  it("wave146 pagination: all list procedures have limit/offset input", () => {
    // Verify no bare list: protectedProcedure.query( exists
    const filesToCheck = [
      "routers.ts",
      "wave24Router.ts",
      "wave68Router.ts",
      "sipRouter.ts",
    ];
    for (const file of filesToCheck) {
      const content = readFile(file);
      const bareListPattern = /(?<![a-zA-Z])list:\s*protectedProcedure\.query\(/g;
      const matches = content.match(bareListPattern);
      expect(matches).toBeNull();
    }
  });

  it("wave147 validation: free-text fields have length constraints", () => {
    const filesToCheck = ["adminRouter.ts", "tier1to5Router.ts"];
    for (const file of filesToCheck) {
      const content = readFile(file);
      const bareNamePattern = /(?<![a-zA-Z])name\s*:\s*z\.string\(\)(?!\s*\.)/g;
      const matches = content.match(bareNamePattern);
      expect(matches).toBeNull();
    }
  });
});
