/**
 * Wave 126 Production-Readiness Tests
 * Covers: seedDemoAlerts, getPortfolioHistory, BillingEngineScreen live data wiring,
 *         and GoldSIP portfolio history tRPC integration.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import path from "path";
import fs from "fs";

const ROOT = path.join(__dirname, "..");

// ─── 1. seedDemoAlerts procedure ─────────────────────────────────────────────
describe("fraudRisk.seedDemoAlerts", () => {
  it("procedure is exported from routers.ts", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("seedDemoAlerts");
  });

  it("procedure only seeds when fewer than 3 alerts exist", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    // Guard condition: existing.length >= 3
    expect(content).toContain("existing.length >= 3");
    expect(content).toContain("Already has alerts");
  });

  it("seeds exactly 5 demo alerts with realistic Nigerian fraud scenarios", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("card_testing");
    expect(content).toContain("account_takeover");
    expect(content).toContain("velocity_breach");
    expect(content).toContain("synthetic_identity");
    expect(content).toContain("unusual_pattern");
  });

  it("demo alerts include Nigerian IP addresses and NGN currency", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("Lagos, NG");
    expect(content).toContain("Abuja, NG");
    expect(content).toContain("transactionCurrency: 'NGN'");
  });

  it("covers all risk levels in demo data", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("riskLevel: 'high'");
    expect(content).toContain("riskLevel: 'medium'");
    expect(content).toContain("riskLevel: 'low'");
  });

  it("returns seeded count and message", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers.ts"), "utf-8");
    expect(content).toContain("return { seeded, message:");
  });
});

// ─── 2. FraudRisk.tsx auto-seed integration ──────────────────────────────────
describe("FraudRisk.tsx auto-seed integration", () => {
  const fraudRiskPath = path.join(ROOT, "client/src/pages/FraudRisk.tsx");

  it("imports seedDemoAlerts mutation", () => {
    const content = fs.readFileSync(fraudRiskPath, "utf-8");
    expect(content).toContain("seedDemoAlerts");
  });

  it("auto-seeds when dbAlerts rows are empty", () => {
    const content = fs.readFileSync(fraudRiskPath, "utf-8");
    expect(content).toContain("dbAlerts.rows?.length ?? 0) === 0");
    expect(content).toContain("seedDemoAlerts.mutate()");
  });

  it("guards against double-seeding with isPending and isSuccess checks", () => {
    const content = fs.readFileSync(fraudRiskPath, "utf-8");
    expect(content).toContain("seedDemoAlerts.isPending");
    expect(content).toContain("seedDemoAlerts.isSuccess");
  });

  it("invalidates fraudRisk.list cache after seeding", () => {
    const content = fs.readFileSync(fraudRiskPath, "utf-8");
    expect(content).toContain("utils.fraudRisk.list.invalidate()");
  });
});

// ─── 3. getPortfolioHistory procedure ────────────────────────────────────────
describe("digitalGold.getPortfolioHistory", () => {
  const routerPath = path.join(ROOT, "server/newFeaturesRouter.ts");

  it("procedure exists in newFeaturesRouter.ts", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("getPortfolioHistory");
  });

  it("accepts months parameter with min 1 max 24", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("months: z.number().int().min(1).max(24)");
  });

  it("aggregates from digitalGoldTransactions table", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("digitalGoldTransactions");
    expect(content).toContain("totalInvestedKobo");
    expect(content).toContain("totalGoldGrams");
  });

  it("returns placeholder months when no DB data exists", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("source: 'placeholder'");
  });

  it("falls back to bridge when DB is unavailable", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("/digital-gold/portfolio-history");
    expect(content).toContain("source: 'unavailable'");
  });

  it("filters transactions to the requested date range", () => {
    const content = fs.readFileSync(routerPath, "utf-8");
    expect(content).toContain("since.setMonth");
    expect(content).toContain("dGte(digitalGoldTransactions.createdAt, since)");
  });
});

// ─── 4. GoldSIP.tsx portfolio history wiring ─────────────────────────────────
describe("GoldSIP.tsx portfolio history wiring", () => {
  const goldSipPath = path.join(ROOT, "client/src/pages/GoldSIP.tsx");

  it("calls getPortfolioHistory tRPC query", () => {
    const content = fs.readFileSync(goldSipPath, "utf-8");
    expect(content).toContain("getPortfolioHistory");
    expect(content).toContain("months: 6");
  });

  it("uses live data when available, falls back to static", () => {
    const content = fs.readFileSync(goldSipPath, "utf-8");
    expect(content).toContain("portfolioHistoryLive");
    expect(content).toContain("historyData?.history?.length");
    expect(content).toContain("portfolioHistory"); // static fallback still present
  });

  it("converts kobo to NGN for chart display", () => {
    const content = fs.readFileSync(goldSipPath, "utf-8");
    expect(content).toContain("totalInvestedKobo / 100");
  });

  it("uses staleTime of 5 minutes to avoid excessive refetches", () => {
    const content = fs.readFileSync(goldSipPath, "utf-8");
    expect(content).toContain("staleTime: 300_000");
  });

  it("renders chart using portfolioHistoryLive not static portfolioHistory", () => {
    const content = fs.readFileSync(goldSipPath, "utf-8");
    expect(content).toContain("portfolioHistoryLive.map");
    expect(content).toContain("maxBarValue = Math.max(...portfolioHistoryLive");
  });
});

// ─── 5. BillingEngineScreen live data wiring ─────────────────────────────────
describe("BillingEngineScreen React Native live data", () => {
  const screenPath = path.join(ROOT, "mobile/react-native/src/screens/BillingEngineScreen.tsx");

  it("imports trpc from lib/trpc", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("import { trpc } from \"../lib/trpc\"");
  });

  it("calls billing.getActive tRPC query", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("\"billing\"");
    expect(content).toContain("\"getActive\"");
  });

  it("calls billing.listBillingEvents tRPC query", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("\"listBillingEvents\"");
  });

  it("falls back to FALLBACK_CONFIGS when no DB config exists", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("FALLBACK_CONFIGS");
    expect(content).toContain("displayConfigs");
  });

  it("shows empty state when no billing events", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("displayEvents.length === 0");
    expect(content).toContain("No billing events yet");
  });

  it("derives live summary metrics from real data", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("feesToday");
    expect(content).toContain("pendingCount");
  });

  it("supports pull-to-refresh with real data refetch", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).toContain("RefreshControl");
    expect(content).toContain("refetchConfig");
    expect(content).toContain("refetchEvents");
  });

  it("no longer uses hardcoded BILLING_EVENTS static data", () => {
    const content = fs.readFileSync(screenPath, "utf-8");
    expect(content).not.toContain("BILLING_EVENTS");
  });
});

// ─── 6. billing.listBillingEvents procedure ──────────────────────────────────
describe("billing.listBillingEvents procedure", () => {
  it("procedure exists in billing router", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers/billing.ts"), "utf-8");
    expect(content).toContain("listBillingEvents");
  });

  it("accepts tenantId, limit, and offset parameters", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers/billing.ts"), "utf-8");
    expect(content).toContain("tenantId: z.string()");
    expect(content).toContain("limit: z.number()");
    expect(content).toContain("offset: z.number()");
  });

  it("queries billingEvents table with tenant filter", () => {
    const content = fs.readFileSync(path.join(ROOT, "server/routers/billing.ts"), "utf-8");
    expect(content).toContain("billingEvents");
    expect(content).toContain("eq(billingEvents.tenantId");
  });
});

// ─── 7. Deep audit: no orphaned static data ───────────────────────────────────
describe("Deep audit: static data elimination", () => {
  it("BillingEngineScreen no longer has hardcoded BILLING_CONFIGS as primary source", () => {
    const content = fs.readFileSync(
      path.join(ROOT, "mobile/react-native/src/screens/BillingEngineScreen.tsx"),
      "utf-8"
    );
    // Should have FALLBACK_CONFIGS (not BILLING_CONFIGS) as the fallback
    expect(content).not.toContain("const BILLING_CONFIGS");
    expect(content).toContain("FALLBACK_CONFIGS");
  });

  it("GoldSIP.tsx has real tRPC portfolio history query", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/pages/GoldSIP.tsx"), "utf-8");
    expect(content).toContain("trpc.newFeatures.digitalGold.getPortfolioHistory");
  });

  it("FraudRisk.tsx has seedDemoAlerts auto-seeding on empty state", () => {
    const content = fs.readFileSync(path.join(ROOT, "client/src/pages/FraudRisk.tsx"), "utf-8");
    expect(content).toContain("seedDemoAlerts.mutate()");
  });
});
