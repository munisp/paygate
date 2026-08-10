/**
 * Wave 148 Production-Readiness Tests
 *
 * Focus: Audit events on critical mutations.
 * Verifies that cancelSubscription and other critical mutations emit audit events.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const serverDir = path.resolve(__dirname);

function readFile(relPath: string): string {
  return fs.readFileSync(path.join(serverDir, relPath), "utf-8");
}

describe("Wave 148: Critical mutations emit audit events", () => {
  it("portalBillingRouter.ts: cancelSubscription emits audit event", () => {
    const content = readFile("portalBillingRouter.ts");
    const cancelSection = content.match(/cancelSubscription:[\s\S]*?return \{ success: true \};[\s\S]*?\}\),/);
    expect(cancelSection).toBeTruthy();
    expect(cancelSection![0]).toMatch(/publishAuditEvent|auditEvent|audit_events/);
  });

  it("routers/crud119.ts: cancel emits audit event", () => {
    const content = readFile("routers/crud119.ts");
    const cancelSection = content.match(/cancel:\s*protectedProcedure\.mutation[\s\S]*?return \{ success: true \};[\s\S]*?\}\),/);
    expect(cancelSection).toBeTruthy();
    expect(cancelSection![0]).toMatch(/publishAuditEvent|auditEvent|audit_events/);
  });

  it("portalBillingRouter.ts: cancelSubscription uses subscription.cancel action", () => {
    const content = readFile("portalBillingRouter.ts");
    expect(content).toMatch(/action:\s*["']subscription\.cancel["']/);
  });

  it("routers/crud119.ts: cancel uses subscription.cancel action", () => {
    const content = readFile("routers/crud119.ts");
    expect(content).toMatch(/action:\s*["']subscription\.cancel["']/);
  });
});
