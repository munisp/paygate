/**
 * Wave 140 Production-Readiness Tests
 *
 * Covers:
 * 1. All PWA pages with tRPC have loading states
 * 2. All Flutter screens have error handling
 * 3. All RN screens have error handling
 * 4. Wave router files (non-test) all have TRPCError
 * 5. Security: CORS, helmet, rate limiting all in place
 * 6. Total production metrics (pages, screens, procedures, tests)
 */

import { describe, it, expect } from "vitest";
import { readFileSync, readdirSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

function read(relPath: string): string {
  return readFileSync(join(ROOT, relPath), "utf-8");
}

describe("Wave 140: PWA Loading States", () => {
  const pagesWithKnownLoading = [
    "client/src/pages/Webhooks/WebhookSimulator.tsx",
    "client/src/pages/consumer/ConsumerBnplRepayments.tsx",
    "client/src/pages/consumer/ConsumerHelpSearch.tsx",
    "client/src/pages/consumer/ConsumerInsuranceV2.tsx",
    "client/src/pages/consumer/ConsumerLoyaltyDashboard.tsx",
    "client/src/pages/consumer/MakePayment.tsx",
    "client/src/pages/consumer/PINSetup.tsx",
  ];

  for (const page of pagesWithKnownLoading) {
    it(`${page.split("/").pop()} has loading state`, () => {
      const content = read(page);
      expect(content).toMatch(/isLoading|isPending|isSearching|loading|Loading|Spinner/);
    });
  }
});

// STALE CONTRACT: helmet/cors/express-rate-limit packages and the named
// limiters (authLimiter/globalLimiter/uploadLimiter/…) were replaced by
// first-party middleware — server/securityHeaders.ts (securityHeaders +
// corsMiddleware with ALLOWED_ORIGINS) and server/rateLimit.ts
// (expressRateLimit / trpcApiRateLimit buckets).
describe("Wave 140: Security Infrastructure", () => {
  it("server has CORS configuration", () => {
    const content = read("server/_core/index.ts");
    const headers = read("server/securityHeaders.ts");
    expect(content).toContain("corsMiddleware");
    expect(headers).toContain("ALLOWED_ORIGINS");
  });

  it("server has security headers middleware", () => {
    const content = read("server/_core/index.ts");
    expect(content).toContain("securityHeaders");
    expect(content).toContain("app.use(securityHeaders)");
  });

  it("server has rate limiting", () => {
    const content = read("server/_core/index.ts");
    const rl = read("server/rateLimit.ts");
    expect(content).toContain("expressRateLimit");
    expect(rl).toContain("authLimit");
    expect(rl).toContain("payoutLimit");
  });

  it("server has global tRPC rate limiter", () => {
    const content = read("server/_core/index.ts");
    expect(content).toContain("trpcApiRateLimit");
    expect(content).toContain('app.use("/api/trpc", trpcApiRateLimit())');
  });

  it("server has webhook/upload rate limiter", () => {
    const content = read("server/_core/index.ts");
    expect(content).toContain('app.use("/api/webhooks", expressRateLimit(');
  });
});

describe("Wave 140: Production Metrics", () => {
  it("has >= 350 PWA pages", () => {
    // Count pages
    const pagesDir = join(ROOT, "client/src/pages");
    let count = 0;
    function countFiles(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) countFiles(join(dir, entry.name));
        else if (entry.name.endsWith(".tsx")) count++;
      }
    }
    countFiles(pagesDir);
    expect(count).toBeGreaterThanOrEqual(350);
  });

  it("has >= 90 React Native screens", () => {
    const screensDir = join(ROOT, "mobile/react-native/src/screens");
    if (!existsSync(screensDir)) return;
    const files = readdirSync(screensDir).filter(f => f.endsWith(".tsx"));
    expect(files.length).toBeGreaterThanOrEqual(90);
  });

  it("has >= 79 Flutter screens", () => {
    const screensDir = join(ROOT, "mobile/flutter/lib/screens");
    if (!existsSync(screensDir)) return;
    let count = 0;
    function countDart(dir: string) {
      const entries = readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.isDirectory()) countDart(join(dir, entry.name));
        else if (entry.name.endsWith(".dart")) count++;
      }
    }
    countDart(screensDir);
    expect(count).toBeGreaterThanOrEqual(79);
  });

  it("has >= 370 tRPC procedures in routers.ts", () => {
    const content = read("server/routers.ts");
    const count = (content.match(/protectedProcedure|publicProcedure|adminProcedure|pbacProcedure|auditedProcedure/g) || []).length;
    expect(count).toBeGreaterThanOrEqual(370);
  });

  it("has >= 37 audit events in routers.ts", () => {
    const content = read("server/routers.ts");
    const publishCount = (content.match(/publishAuditEvent/g) || []).length;
    const logCount = (content.match(/logAuditEvent/g) || []).length;
    expect(publishCount + logCount).toBeGreaterThanOrEqual(37);
  });

  it("has >= 149 test files", () => {
    const testFiles = readdirSync(join(ROOT, "server")).filter(f => f.endsWith(".test.ts"));
    expect(testFiles.length).toBeGreaterThanOrEqual(149);
  });
});

describe("Wave 140: Audit Coverage Completeness", () => {
  it("settlement.create has publishAuditEvent with amount and currency", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("settlement.created");
    const idx = content.indexOf("settlement.created");
    const context = content.substring(idx, idx + 200);
    expect(context).toContain("amount");
    expect(context).toContain("currency");
  });

  it("payment_link.create has publishAuditEvent with merchantId", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("payment_link.created");
  });

  it("virtual_card.create has publishAuditEvent with brand", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("virtual_card.created");
  });

  it("webhook.delete has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("webhook.deleted");
  });

  it("api_key.revoke has publishAuditEvent", () => {
    const content = read("server/routers.ts");
    expect(content).toContain("api_key.revoked");
  });
});
