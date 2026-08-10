/**
 * Wave 132 — Production-Readiness Tests
 * Covers:
 *   1. wave68Router.ts TypeScript fixes (number->string for middleware calls)
 *   2. Admin routes in App.tsx wrapped with AdminGuard
 *   3. IssueVirtualCardRequest correct fields
 *   4. All admin/* routes have AdminGuard protection
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. wave68Router.ts — number->string fixes ───────────────────────────────
describe("Wave 132 — wave68Router.ts type fixes", () => {
  const getContent = () => readFileSync(join(ROOT, "server/wave68Router.ts"), "utf-8");

  it("getCashbackBalanceViaMiddleware receives String(user.id)", () => {
    const content = getContent();
    expect(content).toContain("getCashbackBalanceViaMiddleware(String(user.id))");
  });

  it("redeemCashbackViaMiddleware receives String(user.id)", () => {
    const content = getContent();
    expect(content).toContain("redeemCashbackViaMiddleware(String(user.id),");
  });

  it("listSubscriptionPlansViaMiddleware receives String(user.id)", () => {
    const content = getContent();
    expect(content).toContain("listSubscriptionPlansViaMiddleware(String(user.id))");
  });

  it("issueVirtualCardViaMiddleware uses correct IssueVirtualCardRequest fields", () => {
    const content = getContent();
    // Should have cardId, merchantId, spendingLimit, currency, label, issuerId
    expect(content).toContain("cardId:");
    expect(content).toContain("merchantId:");
    expect(content).toContain("spendingLimit:");
    expect(content).toContain("issuerId:");
  });

  it("no bare ViaMiddleware(user.id) calls remain", () => {
    const content = getContent();
    // Should not have uncoerced user.id passed to middleware
    expect(content).not.toContain("ViaMiddleware(user.id)");
    expect(content).not.toContain("ViaMiddleware(user.id,");
  });
});

// ─── 2. App.tsx — admin routes wrapped with AdminGuard ───────────────────────
describe("Wave 132 — App.tsx admin routes have AdminGuard", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");

  it("no bare admin routes without AdminGuard", () => {
    const content = getContent();
    // All /admin/* routes should have AdminGuard
    const bareAdminRoutes = content.match(/<Route path="\/admin[^"]*" component=\{[^}]+\} \/>/g) ?? [];
    expect(bareAdminRoutes.length).toBe(0);
  });

  it("admin routes use AdminGuard wrapper", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard>");
  });

  it("AdminPlatformOverview is wrapped with AdminGuard", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminPlatformOverview />");
  });

  it("AdminMerchantManagement is wrapped with AdminGuard", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminMerchantManagement />");
  });

  it("AdminKYCReview is wrapped with AdminGuard", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminKYCReview />");
  });

  it("AdminAuditTrail is wrapped with AdminGuard", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminAuditTrail />");
  });
});

// ─── 3. App.tsx — route count sanity check ───────────────────────────────────
describe("Wave 132 — App.tsx route completeness", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");

  it("has at least 300 routes", () => {
    const content = getContent();
    const routeCount = (content.match(/Route path=/g) ?? []).length;
    expect(routeCount).toBeGreaterThanOrEqual(300);
  });

  it("has consumer routes", () => {
    const content = getContent();
    expect(content).toContain('path="/consumer"');
  });

  it("has merchant dashboard route", () => {
    const content = getContent();
    expect(content).toContain('path="/dashboard"');
  });
});

// ─── 4. middlewareBridge.ts — IssueVirtualCardRequest type ───────────────────
describe("Wave 132 — IssueVirtualCardRequest interface", () => {
  const getContent = () => readFileSync(join(ROOT, "server/middlewareBridge.ts"), "utf-8");

  it("IssueVirtualCardRequest has cardId field", () => {
    const content = getContent();
    expect(content).toContain("cardId: string");
  });

  it("IssueVirtualCardRequest has merchantId field", () => {
    const content = getContent();
    expect(content).toContain("merchantId: string");
  });

  it("IssueVirtualCardRequest has spendingLimit field", () => {
    const content = getContent();
    expect(content).toContain("spendingLimit: number");
  });
});

// ─── 5. Security — admin routes protected ────────────────────────────────────
describe("Wave 132 — Security: admin route protection", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/App.tsx"), "utf-8");

  it("AdminGuard is imported", () => {
    const content = getContent();
    expect(content).toContain("AdminGuard");
    expect(content).toContain("RoleGuard");
  });

  it("admin-setup route exists", () => {
    const content = getContent();
    expect(content).toContain('path="/admin-setup"');
  });

  it("admin/audit route is protected", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminAuditTrail />");
  });

  it("admin/fraud route is protected", () => {
    const content = getContent();
    expect(content).toContain("<AdminGuard><AdminFraudOversight />");
  });
});
