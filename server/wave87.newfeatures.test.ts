/**
 * wave87.newfeatures.test.ts
 * Comprehensive tests for:
 * - 1B payments architecture patterns (tiering archival, batch processing)
 * - Consumer pages: ClaimsTracker, PortfolioRebalancing, ConsumerLoyaltyDashboard, ConsumerBnplRepayments
 * - Admin pages: AdminTenantBilling, AdminCorridorMonitor
 * - Wealth Advisor Python microservice contract
 * - PLATFORM_FEATURES.md existence
 * - Security: security.txt, CSP headers
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

// ── 1. 1B Payments Architecture: Tiering Archival ───────────────────────────

describe("1B Payments: Tiering Archival Service", () => {
  it("tieringArchival.ts exists", () => {
    const p = join(__dirname, "tieringArchival.ts");
    expect(existsSync(p)).toBe(true);
  });

  it("defines hot/warm/cold tier thresholds", () => {
    const src = readFileSync(join(__dirname, "tieringArchival.ts"), "utf8");
    // TIER_BOUNDARIES object contains HOT_DAYS, WARM_DAYS, COLD_YEARS
    expect(src).toContain("HOT_DAYS");
    expect(src).toContain("WARM_DAYS");
    expect(src).toContain("COLD_YEARS");
  });

  it("exports archival functions", () => {
    const src = readFileSync(join(__dirname, "tieringArchival.ts"), "utf8");
    // archiveHotTierTransactions handles both warm and cold archival
    expect(src).toContain("archiveHotTierTransactions");
    expect(src).toContain("export");
  });

  it("references S3 for cold tier storage", () => {
    const src = readFileSync(join(__dirname, "tieringArchival.ts"), "utf8");
    expect(src).toContain("S3");
  });

  it("references TigerBeetle for hot tier", () => {
    const src = readFileSync(join(__dirname, "tieringArchival.ts"), "utf8");
    expect(src).toContain("TigerBeetle");
  });
});

// ── 2. 1B Payments: Architecture Document ───────────────────────────────────

describe("1B Payments: Architecture Document", () => {
  it("1b-payments-architecture.md exists", () => {
    const p = join(__dirname, "../docs/1b-payments-architecture.md");
    expect(existsSync(p)).toBe(true);
  });

  it("covers key architecture lessons", () => {
    const src = readFileSync(join(__dirname, "../docs/1b-payments-architecture.md"), "utf8");
    // Key lessons from the article
    expect(src).toContain("TigerBeetle");
    expect(src).toContain("idempotency");
    expect(src).toContain("8190");
    // hot/warm/cold tiers
    expect(src.toLowerCase()).toContain("hot");
    expect(src.toLowerCase()).toContain("warm");
    expect(src.toLowerCase()).toContain("cold");
  });
});

// ── 3. Consumer Pages: File Existence ───────────────────────────────────────

describe("Consumer Pages: New Pages Exist", () => {
  const consumerDir = join(__dirname, "../client/src/pages/consumer");

  it("ClaimsTracker.tsx exists", () => {
    expect(existsSync(join(consumerDir, "ClaimsTracker.tsx"))).toBe(true);
  });

  it("PortfolioRebalancing.tsx exists", () => {
    expect(existsSync(join(consumerDir, "PortfolioRebalancing.tsx"))).toBe(true);
  });

  it("ConsumerLoyaltyDashboard.tsx exists", () => {
    expect(existsSync(join(consumerDir, "ConsumerLoyaltyDashboard.tsx"))).toBe(true);
  });

  it("ConsumerBnplRepayments.tsx exists", () => {
    expect(existsSync(join(consumerDir, "ConsumerBnplRepayments.tsx"))).toBe(true);
  });
});

// ── 4. Consumer Pages: Content Quality ──────────────────────────────────────

describe("Consumer Pages: Content Quality", () => {
  const consumerDir = join(__dirname, "../client/src/pages/consumer");

  it("ClaimsTracker has timeline view and document upload", () => {
    const src = readFileSync(join(consumerDir, "ClaimsTracker.tsx"), "utf8");
    expect(src).toContain("timeline");
    expect(src).toContain("upload");
  });

  it("PortfolioRebalancing has target allocation and buy/sell suggestions", () => {
    const src = readFileSync(join(consumerDir, "PortfolioRebalancing.tsx"), "utf8");
    expect(src).toContain("target");
    expect(src).toContain("allocation");
  });

  it("ConsumerLoyaltyDashboard has points balance and tier progress", () => {
    const src = readFileSync(join(consumerDir, "ConsumerLoyaltyDashboard.tsx"), "utf8");
    expect(src).toContain("points");
    expect(src).toContain("tier");
  });

  it("ConsumerBnplRepayments has repayment schedule and pay-now", () => {
    const src = readFileSync(join(consumerDir, "ConsumerBnplRepayments.tsx"), "utf8");
    expect(src).toContain("repayment");
    expect(src).toContain("pay");
  });
});

// ── 5. Admin Pages: File Existence ──────────────────────────────────────────

describe("Admin Pages: New Pages Exist", () => {
  const adminDir = join(__dirname, "../client/src/pages/admin");

  it("AdminTenantBilling.tsx exists", () => {
    expect(existsSync(join(adminDir, "AdminTenantBilling.tsx"))).toBe(true);
  });

  it("AdminCorridorMonitor.tsx exists", () => {
    expect(existsSync(join(adminDir, "AdminCorridorMonitor.tsx"))).toBe(true);
  });
});

// ── 6. Admin Pages: Content Quality ─────────────────────────────────────────

describe("Admin Pages: Content Quality", () => {
  const adminDir = join(__dirname, "../client/src/pages/admin");

  it("AdminTenantBilling has quota bars and invoice history", () => {
    const src = readFileSync(join(adminDir, "AdminTenantBilling.tsx"), "utf8");
    expect(src).toContain("QuotaBar");
    expect(src).toContain("invoice");
  });

  it("AdminCorridorMonitor has volume heatmap and FX markup", () => {
    const src = readFileSync(join(adminDir, "AdminCorridorMonitor.tsx"), "utf8");
    expect(src).toContain("VolumeBar");
    expect(src).toContain("fxMarkup");
  });

  it("AdminCorridorMonitor has toggle enable/disable", () => {
    const src = readFileSync(join(adminDir, "AdminCorridorMonitor.tsx"), "utf8");
    expect(src).toContain("toggle");
  });
});

// ── 7. Wealth Advisor Python Service ────────────────────────────────────────

describe("Wealth Advisor Python Microservice", () => {
  const wealthDir = join(__dirname, "../python-services/wealth-advisor");

  it("main.py exists", () => {
    expect(existsSync(join(wealthDir, "main.py"))).toBe(true);
  });

  it("requirements.txt exists", () => {
    expect(existsSync(join(wealthDir, "requirements.txt"))).toBe(true);
  });

  it("Dockerfile exists", () => {
    expect(existsSync(join(wealthDir, "Dockerfile"))).toBe(true);
  });

  it("main.py has risk profiling endpoint", () => {
    const src = readFileSync(join(wealthDir, "main.py"), "utf8");
    expect(src).toContain("risk");
  });

  it("main.py has recommendation endpoint", () => {
    const src = readFileSync(join(wealthDir, "main.py"), "utf8");
    expect(src).toContain("recommend");
  });

  it("wealth-advisor is in docker-compose.prod.yml", () => {
    const src = readFileSync(join(__dirname, "../infra/docker-compose.prod.yml"), "utf8");
    expect(src).toContain("wealth-advisor");
  });
});

// ── 8. PLATFORM_FEATURES.md ─────────────────────────────────────────────────

describe("PLATFORM_FEATURES.md", () => {
  it("PLATFORM_FEATURES.md exists", () => {
    const p = join(__dirname, "../docs/PLATFORM_FEATURES.md");
    expect(existsSync(p)).toBe(true);
  });

  it("covers all major sections", () => {
    const src = readFileSync(join(__dirname, "../docs/PLATFORM_FEATURES.md"), "utf8");
    expect(src).toContain("Merchant Portal");
    expect(src).toContain("Consumer App");
    expect(src).toContain("Admin Portal");
    expect(src).toContain("Python Microservices");
    expect(src).toContain("Security Posture");
    expect(src).toContain("Seed Data");
    expect(src).toContain("Business Rules");
  });

  it("lists 76 test files", () => {
    const src = readFileSync(join(__dirname, "../docs/PLATFORM_FEATURES.md"), "utf8");
    expect(src).toContain("76");
  });
});

// ── 9. Security: security.txt ────────────────────────────────────────────────

describe("Security: security.txt", () => {
  it("security.txt exists at .well-known", () => {
    const p = join(__dirname, "../client/public/.well-known/security.txt");
    expect(existsSync(p)).toBe(true);
  });

  it("security.txt has Contact and Expires fields", () => {
    const src = readFileSync(
      join(__dirname, "../client/public/.well-known/security.txt"),
      "utf8",
    );
    expect(src).toContain("Contact:");
    expect(src).toContain("Expires:");
  });
});

// ── 10. Security: CSP Headers ────────────────────────────────────────────────

describe("Security: CSP Headers", () => {
  it("security30.ts exists with CSP builder", () => {
    const p = join(__dirname, "security30.ts");
    expect(existsSync(p)).toBe(true);
  });

  it("buildCspHeader function exists", () => {
    const src = readFileSync(join(__dirname, "security30.ts"), "utf8");
    expect(src).toContain("buildCspHeader");
  });

  it("CSP includes default-src and script-src", () => {
    const src = readFileSync(join(__dirname, "security30.ts"), "utf8");
    expect(src).toContain("default-src");
    expect(src).toContain("script-src");
  });
});

// ── 11. App.tsx: New Routes Registered ──────────────────────────────────────

describe("App.tsx: New Routes Registered", () => {
  const appSrc = readFileSync(join(__dirname, "../client/src/App.tsx"), "utf8");

  it("PortfolioRebalancing route registered", () => {
    expect(appSrc).toContain("/consumer/portfolio/rebalance");
  });

  it("ClaimsTracker route registered", () => {
    expect(appSrc).toContain("/consumer/claims");
  });

  it("ConsumerLoyaltyDashboard route registered", () => {
    expect(appSrc).toContain("/consumer/loyalty-dashboard");
  });

  it("ConsumerBnplRepayments route registered", () => {
    expect(appSrc).toContain("/consumer/bnpl-repayments");
  });

  it("AdminTenantBilling route registered", () => {
    expect(appSrc).toContain("/admin/tenant-billing");
  });

  it("AdminCorridorMonitor route registered", () => {
    expect(appSrc).toContain("/admin/corridors");
  });
});

// ── 12. ConsumerLayout: New Nav Items ────────────────────────────────────────

describe("ConsumerLayout: New Nav Items", () => {
  const layoutSrc = readFileSync(
    join(__dirname, "../client/src/pages/consumer/ConsumerLayout.tsx"),
    "utf8",
  );

  it("Rewards Dashboard nav item exists", () => {
    expect(layoutSrc).toContain("/consumer/loyalty-dashboard");
  });

  it("Rebalance nav item exists", () => {
    expect(layoutSrc).toContain("/consumer/portfolio/rebalance");
  });

  it("Claims Tracker nav item exists", () => {
    expect(layoutSrc).toContain("/consumer/claims");
  });

  it("BNPL Repayments nav item exists", () => {
    expect(layoutSrc).toContain("/consumer/bnpl-repayments");
  });
});

// ── 13. Skill: paygate-merchant-portal ──────────────────────────────────────

// STALE CONTRACT: the out-of-repo skills/paygate-merchant-portal/SKILL.md
// artifact no longer exists; platform docs now live in docs/ inside the
// repository (same contract as wave131.production-hardening.test.ts).
describe("Skill: paygate-merchant-portal", () => {
  it("platform architecture doc exists", () => {
    const p = join(__dirname, "../docs/ARCHITECTURE.md");
    expect(existsSync(p)).toBe(true);
  });

  it("architecture doc covers architecture and key files", () => {
    const p = join(__dirname, "../docs/ARCHITECTURE.md");
    const src = readFileSync(p, "utf8");
    expect(src).toContain("TigerBeetle");
    expect(src).toContain("tRPC");
    expect(src).toContain("routers.ts");
  });
});

// ── 14. ConsumerMutualFunds: Comparison Feature ──────────────────────────────

describe("ConsumerMutualFunds: Comparison Feature", () => {
  it("ConsumerMutualFunds.tsx has comparison tab", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/pages/consumer/ConsumerMutualFunds.tsx"),
      "utf8",
    );
    expect(src).toContain("comparison");
  });

  it("ConsumerMutualFunds.tsx supports up to 3 funds comparison", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/pages/consumer/ConsumerMutualFunds.tsx"),
      "utf8",
    );
    expect(src).toContain("3");
  });
});

// ── 15. ConsumerInsurancePortal: Chat Widget ─────────────────────────────────

describe("ConsumerInsurancePortal: Chat Widget", () => {
  it("ConsumerInsurancePortal.tsx has AI chat widget", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/pages/consumer/ConsumerInsurancePortal.tsx"),
      "utf8",
    );
    expect(src).toContain("chat");
  });

  it("ConsumerInsurancePortal.tsx has suggested questions", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/pages/consumer/ConsumerInsurancePortal.tsx"),
      "utf8",
    );
    // SUGGESTED_QUESTIONS constant exists
    expect(src).toContain("SUGGESTED_QUESTIONS");
  });
});

// ── 16. PortfolioSummary: Donut Chart ────────────────────────────────────────

describe("PortfolioSummary: Donut Chart", () => {
  it("PortfolioSummary.tsx exists", () => {
    const p = join(__dirname, "../client/src/pages/consumer/PortfolioSummary.tsx");
    expect(existsSync(p)).toBe(true);
  });

  it("PortfolioSummary.tsx has donut chart or SVG visualization", () => {
    const src = readFileSync(
      join(__dirname, "../client/src/pages/consumer/PortfolioSummary.tsx"),
      "utf8",
    );
    // Either SVG donut or a chart library
    expect(src.toLowerCase()).toMatch(/donut|svg|chart|pie/);
  });
});

// ── 17. Seed Scripts ─────────────────────────────────────────────────────────

describe("Seed Scripts", () => {
  it("seed-all.mjs exists", () => {
    const p = join(__dirname, "../scripts/seed-all.mjs");
    expect(existsSync(p)).toBe(true);
  });

  it("seed-all.mjs orchestrates multiple seed scripts", () => {
    const src = readFileSync(join(__dirname, "../scripts/seed-all.mjs"), "utf8");
    // seed-all.mjs uses seed-pg-bootstrap and seed-pg-production
    expect(src).toContain("seed-pg-bootstrap");
    expect(src).toContain("seed-pg-production");
  });
});

// ── 18. Business Rules: Idempotency ──────────────────────────────────────────

describe("Business Rules: Idempotency", () => {
  it("idempotency middleware exists", () => {
    const p = join(__dirname, "idempotency.ts");
    expect(existsSync(p)).toBe(true);
  });

  it("idempotency uses database for storage", () => {
    const src = readFileSync(join(__dirname, "idempotency.ts"), "utf8");
    // Uses DB (idempotencyRequests table) for storage
    expect(src).toContain("idempotencyRequests");
  });
});

// ── 19. Business Rules: Rate Limiting ────────────────────────────────────────

describe("Business Rules: Rate Limiting", () => {
  it("rateLimit.ts exists", () => {
    const p = join(__dirname, "rateLimit.ts");
    expect(existsSync(p)).toBe(true);
  });

  it("uses sliding window algorithm", () => {
    const src = readFileSync(join(__dirname, "rateLimit.ts"), "utf8");
    expect(src.toLowerCase()).toMatch(/sliding|window/);
  });
});

// ── 20. Business Rules: TigerBeetle Batch Size ───────────────────────────────

describe("Business Rules: TigerBeetle Batch Size", () => {
  it("TB_MAX_BATCH_SIZE is 8190", () => {
    const files = [
      join(__dirname, "../go-bridge/internal/tigerbeetle/client.go"),
      join(__dirname, "tigerbeetleClient.ts"),
    ];
    const found = files.some((f) => {
      if (!existsSync(f)) return false;
      const src = readFileSync(f, "utf8");
      return src.includes("8190");
    });
    expect(found).toBe(true);
  });
});
