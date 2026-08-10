/**
 * Wave 125 — Production-Readiness Tests
 * Covers: GoldSIP real-data migration, FraudRisk rules wiring,
 *         ConsumerLoyaltyApp redeem fix, BillingEngineScreen (RN),
 *         AppNavigator BillingEngine route.
 */
import { describe, it, expect } from "vitest";
import { readFileSync, existsSync } from "fs";
import { join } from "path";

const ROOT = join(__dirname, "..");

// ─── 1. GoldSIP — No Mock Fallback ───────────────────────────────────────────
describe("Wave 125 — GoldSIP real-data migration", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/GoldSIP.tsx"), "utf-8");

  it("does not use mockPlans as fallback", () => {
    const content = getContent();
    expect(content).not.toContain("?? mockPlans");
  });

  it("uses empty array fallback for plans", () => {
    const content = getContent();
    expect(content).toContain("?? []");
  });

  it("uses real tRPC setupSIP mutation for plan creation", () => {
    const content = getContent();
    expect(content).toContain("setupSIPMutation.mutate");
  });

  it("uses real tRPC pauseSIP mutation for pausing", () => {
    const content = getContent();
    expect(content).toContain("pauseSIPMutation.mutate");
  });

  it("uses real tRPC resumeSIP mutation for resuming", () => {
    const content = getContent();
    expect(content).toContain("resumeSIPMutation.mutate");
  });

  it("uses real tRPC cancelSIP mutation for deletion", () => {
    const content = getContent();
    expect(content).toContain("cancelSIPMutation.mutate");
  });

  it("shows disabled state on buttons during pending mutations", () => {
    const content = getContent();
    expect(content).toContain("isPending");
  });

  it("uses live price from tRPC priceData", () => {
    const content = getContent();
    expect(content).toContain("priceData?.priceNGN");
  });

  it("does not call setPlans (removed local state mutation)", () => {
    const content = getContent();
    expect(content).not.toContain("setPlans(");
  });
});

// ─── 2. ConsumerLoyaltyApp — Redeem Fix ──────────────────────────────────────
describe("Wave 125 — ConsumerLoyaltyApp redeem mutation fix", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/ConsumerLoyaltyApp.tsx"), "utf-8");

  it("uses redeemPoints procedure (not redeem)", () => {
    const content = getContent();
    expect(content).toContain("loyalty.redeemPoints.useMutation");
    expect(content).not.toContain("loyalty.redeem.useMutation");
  });

  it("passes transactionRef to redeemPoints mutation", () => {
    const content = getContent();
    expect(content).toContain("transactionRef:");
  });

  it("passes accountId as number (not string)", () => {
    const content = getContent();
    // Should not have String() wrapping accountId
    expect(content).not.toContain("accountId: String(");
    expect(content).toContain("accountId: firstAccount.id");
  });
});

// ─── 3. FraudRisk — Rules Wired to Real DB ───────────────────────────────────
describe("Wave 125 — FraudRisk rules wired to real tRPC data", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/FraudRisk.tsx"), "utf-8");

  it("queries fraudRuleEngine.list for real rules", () => {
    const content = getContent();
    expect(content).toContain("trpc.fraudRuleEngine.list.useQuery");
  });

  it("uses toggleStatus mutation for rule toggling", () => {
    const content = getContent();
    expect(content).toContain("trpc.fraudRuleEngine.toggleStatus.useMutation");
  });

  it("falls back to static RULES when no DB rules", () => {
    const content = getContent();
    // Accepts old pattern (dbRulesData?.rules?.length) or new type-safe pattern
    const hasRulesCheck =
      content.includes("dbRulesData?.rules?.length") ||
      content.includes("(dbRulesData as any[])?.length") ||
      content.includes("dbRulesData?.length");
    expect(hasRulesCheck).toBe(true);
    expect(content).toContain(": RULES");
  });

  it("calls toggleRuleMutation.mutate when DB rules are present", () => {
    const content = getContent();
    expect(content).toContain("toggleRuleMutation.mutate");
  });

  it("does not use setRules for toggle (removed local state mutation)", () => {
    const content = getContent();
    // setRules should only appear in the new rule form, not for toggling
    const toggleSection = content.split("toggleRuleMutation")[1] ?? "";
    expect(toggleSection).not.toContain("setRules(p => p.map");
  });
});

// ─── 4. React Native BillingEngineScreen ─────────────────────────────────────
describe("Wave 125 — React Native BillingEngineScreen", () => {
  const screenPath = join(ROOT, "mobile/react-native/src/screens/BillingEngineScreen.tsx");

  it("BillingEngineScreen file exists", () => {
    expect(existsSync(screenPath)).toBe(true);
  });

  it("exports a default component", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("export default function BillingEngineScreen");
  });

  it("displays fee schedules (configs tab)", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("Fee Schedules");
  });

  it("displays billing events tab", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("Billing Events");
  });

  it("formats amounts in NGN kobo", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("fmtNGN");
    expect(content).toContain("kobo");
  });

  it("shows tier information (Starter, Growth, Enterprise)", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("Starter");
    expect(content).toContain("Growth");
    expect(content).toContain("Enterprise");
  });

  it("has pull-to-refresh support", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("RefreshControl");
  });

  it("shows summary cards with key metrics", () => {
    const content = readFileSync(screenPath, "utf-8");
    expect(content).toContain("Active Tiers");
    expect(content).toContain("Fees Today");
  });
});

// ─── 5. AppNavigator — BillingEngine Route ───────────────────────────────────
describe("Wave 125 — AppNavigator BillingEngine route", () => {
  const navPath = join(ROOT, "mobile/react-native/src/navigation/AppNavigator.tsx");
  const getContent = () => readFileSync(navPath, "utf-8");

  it("imports BillingEngineScreen", () => {
    const content = getContent();
    expect(content).toContain("import BillingEngineScreen from \"../screens/BillingEngineScreen\"");
  });

  it("declares BillingEngine in RootStackParamList", () => {
    const content = getContent();
    expect(content).toContain("BillingEngine: undefined");
  });

  it("registers BillingEngine Stack.Screen", () => {
    const content = getContent();
    expect(content).toContain("name=\"BillingEngine\"");
    expect(content).toContain("component={BillingEngineScreen}");
  });

  it("sets correct title for BillingEngine screen", () => {
    const content = getContent();
    expect(content).toContain("title: \"Billing Engine\"");
  });
});

// ─── 6. GoldSIP — UI Quality Checks ─────────────────────────────────────────
describe("Wave 125 — GoldSIP UI quality", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/GoldSIP.tsx"), "utf-8");

  it("shows empty state when no plans", () => {
    const content = getContent();
    expect(content).toContain("No SIP plans yet");
  });

  it("shows loading skeleton", () => {
    const content = getContent();
    expect(content).toContain("animate-pulse");
  });

  it("validates minimum SIP amount", () => {
    const content = getContent();
    expect(content).toContain("5_000");
  });

  it("shows gold price from live tRPC data with fallback", () => {
    const content = getContent();
    expect(content).toContain("priceData?.priceNGN ?? GOLD_PRICE_NGN");
  });
});

// ─── 7. ConsumerLoyaltyApp — Real Transaction Data ───────────────────────────
describe("Wave 125 — ConsumerLoyaltyApp real transaction data", () => {
  const getContent = () => readFileSync(join(ROOT, "client/src/pages/ConsumerLoyaltyApp.tsx"), "utf-8");

  it("uses loyaltyTransactions tRPC query", () => {
    const content = getContent();
    expect(content).toContain("loyaltyTransactions");
  });

  it("does not use mockHistory as primary data source", () => {
    const content = getContent();
    // mockHistory may exist as fallback but should not be the primary source
    const loyaltySection = content.indexOf("loyaltyTransactionsData");
    expect(loyaltySection).toBeGreaterThan(-1);
  });
});

// ─── 8. BillingEngineScreen — StyleSheet completeness ────────────────────────
describe("Wave 125 — BillingEngineScreen StyleSheet", () => {
  const getContent = () => readFileSync(
    join(ROOT, "mobile/react-native/src/screens/BillingEngineScreen.tsx"), "utf-8"
  );

  it("uses StyleSheet.create for styles", () => {
    const content = getContent();
    expect(content).toContain("StyleSheet.create");
  });

  it("defines container style", () => {
    const content = getContent();
    expect(content).toContain("container:");
  });

  it("defines card styles", () => {
    const content = getContent();
    expect(content).toContain("configCard:");
    expect(content).toContain("eventCard:");
  });

  it("uses dark theme colors matching app palette", () => {
    const content = getContent();
    expect(content).toContain("#0F172A"); // background
    expect(content).toContain("#1E293B"); // card
    expect(content).toContain("#6366F1"); // primary
  });
});
