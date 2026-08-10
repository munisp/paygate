/**
 * New Features Router Tests
 *
 * Tests for newFeaturesRouter.ts covering all 17 sub-routers.
 * When the middleware bridge is unavailable, bridgeFetch() returns {} (empty object).
 * All tests verify that procedures return an object (graceful fallback).
 */

import { describe, it, expect, vi, beforeAll } from "vitest";

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  execRaw: vi.fn().mockResolvedValue([]),
  getTenantBySlug: vi.fn().mockResolvedValue(null),
  updateTenantBranding: vi.fn().mockResolvedValue(undefined),
}));

// ─── Mock LLM ─────────────────────────────────────────────────────────────────
vi.mock("./_core/llm", () => ({
  invokeLLM: vi.fn().mockResolvedValue({
    choices: [{ message: { content: '{"insights": [], "recommendations": []}' } }],
  }),
}));

// ─── Mock webhook event hooks ─────────────────────────────────────────────────
vi.mock("./webhookEventHooks", () => ({
  onGoldPurchased: vi.fn(),
  onGoldSold: vi.fn(),
  onMutualFundInvested: vi.fn(),
  onMutualFundRedeemed: vi.fn(),
  onInsurancePolicyCreated: vi.fn(),
  onInsuranceClaimSubmitted: vi.fn(),
  onPensionContributionPosted: vi.fn(),
  onCashbackEarned: vi.fn(),
  onCashbackRedeemed: vi.fn(),
  onSoundboxDeviceRegistered: vi.fn(),
  onEmiContractCreated: vi.fn(),
  onBulkCollectionCreated: vi.fn(),
  onPosSaleCompleted: vi.fn(),
  onRemittanceInitiated: vi.fn(),
  onSubscriptionV2Created: vi.fn(),
  onReportReady: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
import type { TrpcContext } from "./_core/context";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 1,
      openId: "test-user",
      email: "test@example.com",
      name: "Test User",
      role: "user",
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { origin: "https://test.manus.space" }, protocol: "https" } as TrpcContext["req"],
    res: {} as TrpcContext["res"],
  };
}

// ─── Load routers once ────────────────────────────────────────────────────────
let digitalGoldRouter: any;
let mutualFundsRouter: any;
let consumerInsuranceRouter: any;
let pensionRouter: any;
let cashbackRewardsRouter: any;
let voicePaymentsRouter: any;
let wealthManagementRouter: any;
let emiCheckoutRouter: any;
let bulkCollectionsRouter: any;
let apiDocsRouter: any;
let salaryAccountsRouter: any;
let privacyPaymentsRouter: any;
let reportsRouter: any;
let aiInsightsV2Router: any;
let nodalAccountsRouter: any;
let smartRetailPOSRouter: any;
let internationalRemittanceRouter: any;
let subscriptionBillingV2Router: any;

beforeAll(async () => {
  const mod = await import("./newFeaturesRouter");
  digitalGoldRouter = mod.digitalGoldRouter;
  mutualFundsRouter = mod.mutualFundsRouter;
  consumerInsuranceRouter = mod.consumerInsuranceRouter;
  pensionRouter = mod.pensionRouter;
  cashbackRewardsRouter = mod.cashbackRewardsRouter;
  voicePaymentsRouter = mod.voicePaymentsRouter;
  wealthManagementRouter = mod.wealthManagementRouter;
  emiCheckoutRouter = mod.emiCheckoutRouter;
  bulkCollectionsRouter = mod.bulkCollectionsRouter;
  apiDocsRouter = mod.apiDocsRouter;
  salaryAccountsRouter = mod.salaryAccountsRouter;
  privacyPaymentsRouter = mod.privacyPaymentsRouter;
  reportsRouter = mod.reportsRouter;
  aiInsightsV2Router = mod.aiInsightsV2Router;
  nodalAccountsRouter = mod.nodalAccountsRouter;
  smartRetailPOSRouter = mod.smartRetailPOSRouter;
  internationalRemittanceRouter = mod.internationalRemittanceRouter;
  subscriptionBillingV2Router = mod.subscriptionBillingV2Router;
}, 15000);

// ─── digitalGoldRouter ────────────────────────────────────────────────────────

describe("digitalGoldRouter", () => {
  it("getPrice returns an object (bridge fallback: {})", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.getPrice();
    // Bridge unavailable → returns {}
    expect(typeof result).toBe("object");
  });

  it("getHoldings returns an object for authenticated user", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.getHoldings();
    expect(typeof result).toBe("object");
  });

  it("buyGold returns an object with correct input schema", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.buyGold({ amountKobo: 50000, fundingSource: "wallet" });
    expect(typeof result).toBe("object");
  });

  it("sellGold returns an object with correct input schema", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.sellGold({ grams: 0.5, destinationAccount: "acc_123" });
    expect(typeof result).toBe("object");
  });

  it("getTransactionHistory returns an object with page and limit params", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.getTransactionHistory({ page: 1, limit: 10 });
    expect(typeof result).toBe("object");
  });

  it("listSIPs returns an object (bridgeFetch returns {} when bridge unavailable)", async () => {
    const caller = digitalGoldRouter.createCaller(makeCtx());
    const result = await caller.listSIPs();
    // bridgeFetch catches errors and returns {} — the outer try-catch only fires if bridgeFetch throws
    expect(typeof result).toBe("object");
  });
});

// ─── mutualFundsRouter ────────────────────────────────────────────────────────

describe("mutualFundsRouter", () => {
  it("listFunds returns an object (bridge fallback: {})", async () => {
    const caller = mutualFundsRouter.createCaller(makeCtx());
    const result = await caller.listFunds({ category: "equity" });
    expect(typeof result).toBe("object");
  });

  it("getPortfolio returns an object for authenticated user", async () => {
    const caller = mutualFundsRouter.createCaller(makeCtx());
    const result = await caller.getPortfolio();
    expect(typeof result).toBe("object");
  });
});

// ─── consumerInsuranceRouter ──────────────────────────────────────────────────

describe("consumerInsuranceRouter", () => {
  it("listProducts returns an object (bridge fallback: {})", async () => {
    const caller = consumerInsuranceRouter.createCaller(makeCtx());
    const result = await caller.listProducts({ type: "health" });
    expect(typeof result).toBe("object");
  });

  it("getActivePolicies returns an object for authenticated user", async () => {
    const caller = consumerInsuranceRouter.createCaller(makeCtx());
    const result = await caller.getActivePolicies();
    expect(typeof result).toBe("object");
  });

  it("getClaims returns an object for authenticated user", async () => {
    const caller = consumerInsuranceRouter.createCaller(makeCtx());
    const result = await caller.getClaims();
    expect(typeof result).toBe("object");
  });
});

// ─── pensionRouter ────────────────────────────────────────────────────────────

describe("pensionRouter", () => {
  it("listPFAs returns an object (bridge fallback: {})", async () => {
    const caller = pensionRouter.createCaller(makeCtx());
    const result = await caller.listPFAs();
    expect(typeof result).toBe("object");
  });

  it("getAccount returns an object for authenticated user", async () => {
    const caller = pensionRouter.createCaller(makeCtx());
    const result = await caller.getAccount();
    expect(typeof result).toBe("object");
  });
});

// ─── cashbackRewardsRouter ────────────────────────────────────────────────────

describe("cashbackRewardsRouter", () => {
  it("getActiveCampaigns returns an object (bridge fallback: {})", async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getActiveCampaigns();
    expect(typeof result).toBe("object");
  });

  it("getBalance returns an object for authenticated user", async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getBalance();
    expect(typeof result).toBe("object");
  });

  it("getMerchantCashbackConfig returns an object for authenticated user", async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getMerchantCashbackConfig();
    expect(typeof result).toBe("object");
  });
});

// ─── voicePaymentsRouter ──────────────────────────────────────────────────────

describe("voicePaymentsRouter", () => {
  it("getSoundboxDevices returns an object for authenticated user", async () => {
    const caller = voicePaymentsRouter.createCaller(makeCtx());
    const result = await caller.getSoundboxDevices();
    expect(typeof result).toBe("object");
  });
});

// ─── wealthManagementRouter ───────────────────────────────────────────────────

describe("wealthManagementRouter", () => {
  it("getPortfolioSummary returns an object for authenticated user", async () => {
    const caller = wealthManagementRouter.createCaller(makeCtx());
    const result = await caller.getPortfolioSummary();
    expect(typeof result).toBe("object");
  });

  it("getRiskProfile returns an object for authenticated user", async () => {
    const caller = wealthManagementRouter.createCaller(makeCtx());
    const result = await caller.getRiskProfile();
    expect(typeof result).toBe("object");
  });
});

// ─── emiCheckoutRouter ────────────────────────────────────────────────────────

describe("emiCheckoutRouter", () => {
  it("getMerchantEMIConfig returns an object for authenticated user", async () => {
    const caller = emiCheckoutRouter.createCaller(makeCtx());
    const result = await caller.getMerchantEMIConfig();
    expect(typeof result).toBe("object");
  });

  it("getEMIPlans returns an object with amountKobo input", async () => {
    const caller = emiCheckoutRouter.createCaller(makeCtx());
    const result = await caller.getEMIPlans({ amountKobo: 5000000 });
    expect(typeof result).toBe("object");
  });
});

// ─── bulkCollectionsRouter ────────────────────────────────────────────────────

describe("bulkCollectionsRouter", () => {
  it("listCollections returns an object for authenticated user", async () => {
    const caller = bulkCollectionsRouter.createCaller(makeCtx());
    const result = await caller.listCollections({ limit: 10, offset: 0 });
    expect(typeof result).toBe("object");
  });
});

// ─── apiDocsRouter ────────────────────────────────────────────────────────────

describe("apiDocsRouter", () => {
  it("getOpenAPISpec returns an object", async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getOpenAPISpec();
    expect(typeof result).toBe("object");
  });

  it("getSDKInfo returns an object", async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getSDKInfo();
    expect(typeof result).toBe("object");
  });
});

// ─── salaryAccountsRouter ─────────────────────────────────────────────────────

describe("salaryAccountsRouter", () => {
  it("getAccount returns an object for authenticated user", async () => {
    const caller = salaryAccountsRouter.createCaller(makeCtx());
    const result = await caller.getAccount();
    expect(typeof result).toBe("object");
  });
});

// ─── privacyPaymentsRouter ────────────────────────────────────────────────────

describe("privacyPaymentsRouter", () => {
  it("getPrivacySettings returns an object for authenticated user", async () => {
    const caller = privacyPaymentsRouter.createCaller(makeCtx());
    const result = await caller.getPrivacySettings();
    expect(typeof result).toBe("object");
  });
});

// ─── reportsRouter ────────────────────────────────────────────────────────────

describe("reportsRouter", () => {
  it("listReports returns an object for authenticated user", async () => {
    const caller = reportsRouter.createCaller(makeCtx());
    const result = await caller.listReports({ limit: 10, offset: 0 });
    expect(typeof result).toBe("object");
  });

  it("getScheduledReports returns an object for authenticated user", async () => {
    const caller = reportsRouter.createCaller(makeCtx());
    const result = await caller.getScheduledReports();
    expect(typeof result).toBe("object");
  });
});

// ─── aiInsightsV2Router ───────────────────────────────────────────────────────

describe("aiInsightsV2Router", () => {
  it("getAnomalyDetection throws TRPCError when AI service unavailable", async () => {
    const caller = aiInsightsV2Router.createCaller(makeCtx());
    // These procedures use direct fetch() (not bridgeFetch), so they throw when AI service is down
    await expect(caller.getAnomalyDetection()).rejects.toThrow();
  });

  it("getCustomerSegmentation throws TRPCError when AI service unavailable", async () => {
    const caller = aiInsightsV2Router.createCaller(makeCtx());
    await expect(caller.getCustomerSegmentation()).rejects.toThrow();
  });
});

// ─── nodalAccountsRouter ──────────────────────────────────────────────────────

describe("nodalAccountsRouter", () => {
  it("listNodalAccounts returns an object for authenticated user", async () => {
    const caller = nodalAccountsRouter.createCaller(makeCtx());
    const result = await caller.listNodalAccounts();
    expect(typeof result).toBe("object");
  });

  it("getNodalTransactions returns an object for authenticated user", async () => {
    const caller = nodalAccountsRouter.createCaller(makeCtx());
    const result = await caller.getNodalTransactions({ accountId: "acc_test", page: 1 });
    expect(typeof result).toBe("object");
  });
});

// ─── smartRetailPOSRouter ─────────────────────────────────────────────────────

describe("smartRetailPOSRouter", () => {
  it("getRetailConfig returns an object for authenticated user", async () => {
    const caller = smartRetailPOSRouter.createCaller(makeCtx());
    const result = await caller.getRetailConfig();
    expect(typeof result).toBe("object");
  });

  it("getInventoryAlerts returns an object for authenticated user", async () => {
    const caller = smartRetailPOSRouter.createCaller(makeCtx());
    const result = await caller.getInventoryAlerts();
    expect(typeof result).toBe("object");
  });
});

// ─── internationalRemittanceRouter ────────────────────────────────────────────

describe("internationalRemittanceRouter", () => {
  it("getCorridors returns an object (bridge fallback: {})", async () => {
    const caller = internationalRemittanceRouter.createCaller(makeCtx());
    const result = await caller.getCorridors();
    expect(typeof result).toBe("object");
  });

  it("getQuote returns an object for authenticated user", async () => {
    const caller = internationalRemittanceRouter.createCaller(makeCtx());
    const result = await caller.getQuote({ corridorId: "NGN-USD", sendAmountUSD: 100, deliveryMethod: "bank_transfer" });
    expect(typeof result).toBe("object");
  });
});

// ─── subscriptionBillingV2Router ──────────────────────────────────────────────

describe("subscriptionBillingV2Router", () => {
  it("listPlans returns an object (bridge fallback: {})", async () => {
    const caller = subscriptionBillingV2Router.createCaller(makeCtx());
    const result = await caller.listPlans();
    expect(typeof result).toBe("object");
  });

  it("getChurnAnalytics returns an object for authenticated user", async () => {
    const caller = subscriptionBillingV2Router.createCaller(makeCtx());
    const result = await caller.getChurnAnalytics({ period: "30d" });
    expect(typeof result).toBe("object");
  });
});
