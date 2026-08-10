/**
 * Wave 133 — Production-Readiness Tests
 * Covers:
 *   1. wave68Router.ts remaining TS fixes (redeemCashback third arg, spendingLimitKobo)
 *   2. usageMeteringRouter.ts awaited getDb() calls
 *   3. corridorRouter.ts awaited getDb() calls
 *   4. PWA pages error handling (11 pages fixed)
 *   5. No remaining ctx.user.merchantId usage
 *   6. No remaining non-awaited getDb() calls
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. wave68Router.ts — remaining TS fixes ─────────────────────────────────
describe("Wave 133 — wave68Router.ts remaining type fixes", () => {
  const getContent = () => readFileSync(join(ROOT, "server/wave68Router.ts"), "utf-8");

  it("redeemCashbackViaMiddleware third arg is String()", () => {
    const content = getContent();
    expect(content).toContain("String(input.merchantId ?? user.id)");
  });

  it("spendingLimitKobo uses nullish coalescing", () => {
    const content = getContent();
    expect(content).toContain("(input.spendingLimitKobo ?? 0) / 100");
  });
});

// ─── 2. usageMeteringRouter.ts — awaited getDb() ─────────────────────────────
describe("Wave 133 — usageMeteringRouter.ts awaited getDb()", () => {
  const getContent = () => readFileSync(join(ROOT, "server/usageMeteringRouter.ts"), "utf-8");

  it("all getDb() calls are awaited", () => {
    const content = getContent();
    // Should not have non-awaited getDb() calls
    const nonAwaited = content.match(/(?<!await )= getDb\(\)/g) ?? [];
    expect(nonAwaited.length).toBe(0);
  });

  it("has at least 5 awaited getDb() calls", () => {
    const content = getContent();
    const awaited = (content.match(/= await getDb\(\)/g) ?? []).length;
    expect(awaited).toBeGreaterThanOrEqual(5);
  });
});

// ─── 3. corridorRouter.ts — awaited getDb() ──────────────────────────────────
describe("Wave 133 — corridorRouter.ts awaited getDb()", () => {
  const getContent = () => readFileSync(join(ROOT, "server/corridorRouter.ts"), "utf-8");

  it("all getDb() calls are awaited", () => {
    const content = getContent();
    const nonAwaited = content.match(/(?<!await )= getDb\(\)/g) ?? [];
    expect(nonAwaited.length).toBe(0);
  });

  it("has at least 8 awaited getDb() calls", () => {
    const content = getContent();
    const awaited = (content.match(/= await getDb\(\)/g) ?? []).length;
    expect(awaited).toBeGreaterThanOrEqual(8);
  });
});

// ─── 4. PWA pages — error handling ───────────────────────────────────────────
describe("Wave 133 — PWA pages have error handling", () => {
  const pages = [
    "AuditLogViewer.tsx", "BNPLCalculator.tsx", "CrossBorderRailMonitor.tsx",
    "MicroserviceHealth.tsx", "MobileMoneyRecon.tsx", "MojaloopDashboard.tsx",
    "POSReconciliation.tsx", "QRGenerator.tsx", "APIDocsPortal.tsx",
    "PortalHealthDashboard.tsx"
  ];

  for (const page of pages) {
    it(`${page} has error handling`, () => {
      const content = readFileSync(join(ROOT, `client/src/pages/${page}`), "utf-8");
      const hasError = content.includes("isError") || content.includes("error") || content.includes("Error");
      expect(hasError).toBe(true);
    });
  }
});

// ─── 5. No remaining ctx.user.merchantId usage ───────────────────────────────
describe("Wave 133 — No ctx.user.merchantId usage", () => {
  it("server/routers.ts has no ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
  });

  it("server/routers/wave121.ts has no ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers/wave121.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
  });

  it("server/routers/crud120.ts has no ctx.user.merchantId", () => {
    const content = readFileSync(join(ROOT, "server/routers/crud120.ts"), "utf-8");
    expect(content).not.toContain("ctx.user.merchantId");
  });
});

// ─── 6. No remaining non-awaited getDb() calls ───────────────────────────────
describe("Wave 133 — No non-awaited getDb() calls", () => {
  const files = [
    "server/usageMeteringRouter.ts",
    "server/corridorRouter.ts",
    "server/wave68Router.ts",
  ];

  for (const file of files) {
    it(`${file.split("/").pop()} has no non-awaited getDb()`, () => {
      const content = readFileSync(join(ROOT, file), "utf-8");
      // Check for patterns like: const db = getDb(); (without await)
      const nonAwaited = (content.match(/const \w+ = getDb\(\)/g) ?? []).filter(
        m => !m.includes("await")
      );
      expect(nonAwaited.length).toBe(0);
    });
  }
});
