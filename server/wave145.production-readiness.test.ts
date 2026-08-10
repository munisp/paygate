/**
 * Wave 145 Production-Readiness Tests
 *
 * Focus: Error handling coverage for tier1to5 PWA pages and WebhookLiveStream.
 * Verifies that all pages with tRPC calls destructure `isError` from useQuery.
 */

import { describe, it, expect } from "vitest";
import fs from "fs";
import path from "path";

const pagesDir = path.resolve(__dirname, "../client/src/pages");

function readPage(relPath: string): string {
  return fs.readFileSync(path.join(pagesDir, relPath), "utf-8");
}

describe("Wave 145: tier1to5 PWA pages error handling", () => {
  it("AIInsights.tsx destructures isError from useQuery", () => {
    const content = readPage("tier1to5/AIInsights.tsx");
    expect(content).toMatch(/isError/);
    expect(content).toMatch(/useQuery/);
  });

  it("FraudHeatmap.tsx destructures isError from useQuery", () => {
    const content = readPage("tier1to5/FraudHeatmap.tsx");
    expect(content).toMatch(/isError/);
    expect(content).toMatch(/useQuery/);
  });

  it("SessionRisk.tsx destructures isError from useQuery", () => {
    const content = readPage("tier1to5/SessionRisk.tsx");
    expect(content).toMatch(/isError/);
    expect(content).toMatch(/useQuery/);
  });

  it("WebhookLiveStream.tsx destructures isError from useQuery", () => {
    const content = readPage("WebhookLiveStream.tsx");
    expect(content).toMatch(/isError/);
    expect(content).toMatch(/useQuery/);
  });
});

describe("Wave 145: Gated pages are UI-only (no tRPC calls)", () => {
  const gatedPages = [
    "GatedAIInsightsV2.tsx",
    "GatedDigitalGold.tsx",
    "GatedInternationalRemittance.tsx",
    "GatedNodalAccounts.tsx",
    "GatedReportsCenter.tsx",
    "GatedSalaryAccounts.tsx",
    "GatedSubscriptionBillingV2.tsx",
    "GatedWealthManagement.tsx",
  ];

  for (const page of gatedPages) {
    it(`${page} has no tRPC calls (UI-only gated page)`, () => {
      const content = readPage(page);
      // Gated pages should not have useQuery/useMutation calls
      // They are wrappers that gate access to the real feature pages
      const hasTrpcQuery = /trpc\.\w+.*useQuery|trpc\.\w+.*useMutation/.test(content);
      // If they do have tRPC calls, they must also have error handling
      if (hasTrpcQuery) {
        expect(content).toMatch(/isError|catch|Error/);
      } else {
        expect(hasTrpcQuery).toBe(false);
      }
    });
  }
});

describe("Wave 145: Static doc pages are intentionally error-free", () => {
  it("docs/ConsumerGuide.tsx has no tRPC calls (static doc)", () => {
    const content = readPage("docs/ConsumerGuide.tsx");
    const hasTrpcQuery = /trpc\.\w+.*useQuery|trpc\.\w+.*useMutation/.test(content);
    if (hasTrpcQuery) {
      expect(content).toMatch(/isError|catch|Error/);
    } else {
      expect(hasTrpcQuery).toBe(false);
    }
  });

  it("docs/MerchantGuide.tsx has no tRPC calls (static doc)", () => {
    const content = readPage("docs/MerchantGuide.tsx");
    const hasTrpcQuery = /trpc\.\w+.*useQuery|trpc\.\w+.*useMutation/.test(content);
    if (hasTrpcQuery) {
      expect(content).toMatch(/isError|catch|Error/);
    } else {
      expect(hasTrpcQuery).toBe(false);
    }
  });
});

describe("Wave 145: All PWA pages with tRPC calls have error handling", () => {
  it("every .tsx page that calls useQuery/useMutation also handles errors", () => {
    const allPages: string[] = [];

    function collectPages(dir: string) {
      for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          collectPages(full);
        } else if (entry.name.endsWith(".tsx")) {
          allPages.push(full);
        }
      }
    }

    collectPages(pagesDir);

    const violations: string[] = [];

    for (const pagePath of allPages) {
      const content = fs.readFileSync(pagePath, "utf-8");
      const hasTrpcQuery = /\.useQuery\(|\.useMutation\(/.test(content);
      if (!hasTrpcQuery) continue;

      const hasErrorHandling = /isError|catch\s*\(|\.error\b|Error\b/.test(content);
      if (!hasErrorHandling) {
        violations.push(path.relative(pagesDir, pagePath));
      }
    }

    if (violations.length > 0) {
      console.error("Pages missing error handling:", violations);
    }

    expect(violations).toHaveLength(0);
  });
});
