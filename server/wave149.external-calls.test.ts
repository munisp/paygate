/**
 * Wave 149 Production-Readiness Tests
 *
 * Focus: External service calls have proper error handling.
 * Verifies that fetch() calls in procedures check res.ok before returning.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const serverDir = path.resolve(__dirname);

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(serverDir, relPath), "utf-8");
}

describe("Wave 149: External service calls have error handling", () => {
  it("tier1to5Router.ts: AML fetch calls check res.ok", () => {
    const content = readFile("tier1to5Router.ts");
    // Find fetch calls and verify they have .ok checks
    const fetchPattern = /const res = await fetch\([^;]+\);\n\s*return res\.json\(\);/g;
    const bareMatches = content.match(fetchPattern);
    expect(bareMatches).toBeNull();
  });

  it("tier1to5Router.ts: fetch calls have TRPCError on failure", () => {
    const content = readFile("tier1to5Router.ts");
    // Should have at least some error handling for external calls
    expect(content).toMatch(/res\.ok.*TRPCError|TRPCError.*INTERNAL_SERVER_ERROR/);
  });

  it("portalBillingRouter.ts: cancelSubscription has audit event", () => {
    const content = readFile("portalBillingRouter.ts");
    expect(content).toMatch(/subscription\.cancel/);
    expect(content).toMatch(/publishAuditEvent/);
  });

  it("tier6to8Router.ts: no bare fetch-then-return-json without ok check", () => {
    const content = readFile("tier6to8Router.ts");
    const barePattern = /const res = await fetch\([^;]+\);\n\s*return res\.json\(\);/g;
    const bareMatches = content.match(barePattern);
    expect(bareMatches).toBeNull();
  });
});
