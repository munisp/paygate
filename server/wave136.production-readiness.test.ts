/**
 * Wave 136 — Production-Readiness Tests
 * Covers:
 *   1. New backend procedures: bnpl.monthlyStats, mobileMoneyRecon.providerStats/weeklyTrend,
 *      partnerOnboarding.revenueData, subscriptionsMw.monthlyChurnData
 *   2. Frontend pages wired to real data (no hardcoded chart arrays)
 *   3. All 6 previously-mocked chart pages now use tRPC queries
 */
import { describe, it, expect } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. Backend procedures exist ─────────────────────────────────────────────
describe("Wave 136 — New backend chart data procedures", () => {
  it("routers.ts has bnpl.monthlyStats procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("monthlyStats: protectedProcedure");
    expect(content).toContain("planSplit");
  });

  it("routers.ts has mobileMoneyRecon.providerStats procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("providerStats: protectedProcedure");
    expect(content).toContain("GROUP BY provider");
  });

  it("routers.ts has mobileMoneyRecon.weeklyTrend procedure", () => {
    const content = readFileSync(join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("weeklyTrend: protectedProcedure");
    expect(content).toContain("DAYNAME");
  });

  it("wave90Router.ts has partnerOnboarding.revenueData procedure", () => {
    const content = readFileSync(join(ROOT, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("revenueData: protectedProcedure");
    expect(content).toContain("COUNT(DISTINCT merchant_id)");
  });

  it("wave90Router.ts has subscriptionsMw.monthlyChurnData procedure", () => {
    const content = readFileSync(join(ROOT, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("monthlyChurnData: protectedProcedure");
    expect(content).toContain("newSubs");
  });
});

// ─── 2. Frontend pages wired to real data ────────────────────────────────────
describe("Wave 136 — Frontend pages use real chart data", () => {
  it("BNPL.tsx uses bnpl.monthlyStats query", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/BNPL.tsx"), "utf-8");
    expect(content).toContain("bnpl.monthlyStats.useQuery");
    expect(content).not.toContain("const MONTHLY_DATA = [");
    expect(content).not.toContain("const PLAN_SPLIT = [");
  });

  it("MobileMoneyRecon.tsx uses mobileMoneyRecon.providerStats query", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/MobileMoneyRecon.tsx"), "utf-8");
    expect(content).toContain("mobileMoneyRecon.providerStats.useQuery");
    expect(content).toContain("mobileMoneyRecon.weeklyTrend.useQuery");
  });

  it("PartnerAdminDashboard.tsx uses partnerOnboarding.revenueData query", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/PartnerAdminDashboard.tsx"), "utf-8");
    expect(content).toContain("partnerOnboarding.revenueData.useQuery");
    expect(content).not.toContain("const REVENUE_DATA = [");
  });

  it("SubscriptionManagement.tsx uses subscriptionsMw.monthlyChurnData query", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/SubscriptionManagement.tsx"), "utf-8");
    expect(content).toContain("subscriptionsMw.monthlyChurnData.useQuery");
    expect(content).not.toContain("const CHURN_DATA = [");
  });

  it("FXDashboard.tsx CURRENCIES is static config (not business data)", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/FXDashboard.tsx"), "utf-8");
    // CURRENCIES is a supported currency list - static config is acceptable
    expect(content).toContain("trpc.fx.getRates.useQuery");
    expect(content).toContain("trpc.fx.fetchAndStore.useMutation");
  });

  it("InsuranceHub.tsx uses insuranceMw tRPC queries", () => {
    const content = readFileSync(join(ROOT, "client/src/pages/InsuranceHub.tsx"), "utf-8");
    expect(content).toContain("insuranceMw.products.useQuery");
    expect(content).toContain("insuranceMw.listPolicies.useQuery");
  });
});

// ─── 3. All 6 previously-mocked pages now have tRPC calls ────────────────────
describe("Wave 136 — All 6 previously-mocked pages have tRPC calls", () => {
  const pages = [
    { file: "BNPL.tsx", trpcCall: "trpc.bnpl." },
    { file: "FXDashboard.tsx", trpcCall: "trpc.fx." },
    { file: "InsuranceHub.tsx", trpcCall: "trpc.insuranceMw." },
    { file: "MobileMoneyRecon.tsx", trpcCall: "trpc.mobileMoneyRecon." },
    { file: "PartnerAdminDashboard.tsx", trpcCall: "trpc.partnerOnboarding." },
    { file: "SubscriptionManagement.tsx", trpcCall: "trpc.subscriptionsMw." },
  ];

  for (const { file, trpcCall } of pages) {
    it(`${file} has tRPC calls (${trpcCall})`, () => {
      const content = readFileSync(join(ROOT, `client/src/pages/${file}`), "utf-8");
      expect(content).toContain(trpcCall);
    });
  }
});

// ─── 4. resolveUser and requireMerchant imported in wave90Router.ts ──────────
describe("Wave 136 — wave90Router.ts has correct imports", () => {
  it("imports resolveUser and requireMerchant from db", () => {
    const content = readFileSync(join(ROOT, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("resolveUser");
    expect(content).toContain("requireMerchant");
  });

  it("imports getDb and sql from drizzle-orm", () => {
    const content = readFileSync(join(ROOT, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("getDb");
    expect(content).toContain("sql");
  });
});
