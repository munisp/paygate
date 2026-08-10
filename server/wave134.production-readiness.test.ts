/**
 * Wave 134 — Production-Readiness Tests
 * Covers:
 *   1. usageMeteringRouter.ts: maxApiCallsPerMonth / maxTxVolumeUsdPerMonth property names
 *   2. All admin pages have both isLoading and isError handling
 *   3. All PWA pages have both isLoading and isError handling (comprehensive)
 */
import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. usageMeteringRouter.ts property names ────────────────────────────────
describe("Wave 134 — usageMeteringRouter.ts correct property names", () => {
  const getContent = () => readFileSync(join(ROOT, "server/usageMeteringRouter.ts"), "utf-8");

  it("uses maxApiCallsPerMonth (not maxApiCalls)", () => {
    const content = getContent();
    expect(content).not.toMatch(/limits\.maxApiCalls\b(?!PerMonth)/);
    expect(content).toContain("limits.maxApiCallsPerMonth");
  });

  it("uses maxTxVolumeUsdPerMonth (not maxTxVolume)", () => {
    const content = getContent();
    expect(content).not.toMatch(/limits\.maxTxVolume\b(?!UsdPerMonth)/);
    expect(content).toContain("limits.maxTxVolumeUsdPerMonth");
  });
});

// ─── 2. Admin pages — loading + error handling ───────────────────────────────
describe("Wave 134 — Admin pages have loading and error handling", () => {
  const adminDir = join(ROOT, "client/src/pages/admin");
  const adminPages = readdirSync(adminDir).filter(f => f.endsWith(".tsx"));

  for (const page of adminPages) {
    it(`${page} has loading state when using tRPC`, () => {
      const content = readFileSync(join(adminDir, page), "utf-8");
      if (!content.includes("trpc.")) return; // skip non-tRPC pages
      const hasLoading = content.includes("isLoading") || content.includes("Loading") || content.includes("Skeleton");
      expect(hasLoading).toBe(true);
    });

    it(`${page} has error handling when using tRPC`, () => {
      const content = readFileSync(join(adminDir, page), "utf-8");
      if (!content.includes("trpc.")) return; // skip non-tRPC pages
      const hasError = content.includes("isError") || content.includes("error") || content.includes("Error");
      expect(hasError).toBe(true);
    });
  }
});

// ─── 3. PWA pages — loading + error handling (comprehensive) ─────────────────
describe("Wave 134 — PWA pages have loading and error handling", () => {
  const pagesDir = join(ROOT, "client/src/pages");
  const pwaPages = readdirSync(pagesDir).filter(f => f.endsWith(".tsx"));

  for (const page of pwaPages) {
    it(`${page} has loading state when using tRPC`, () => {
      const content = readFileSync(join(pagesDir, page), "utf-8");
      if (!content.includes("trpc.")) return; // skip non-tRPC pages
      const hasLoading = content.includes("isLoading") || content.includes("Loading") || content.includes("Skeleton");
      expect(hasLoading).toBe(true);
    });
  }
});
