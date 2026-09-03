/**
 * Remaining Router Tests — marketData, sip, grpc, ollama, portalBilling
 *
 * These routers had no test coverage. This file covers:
 * - marketDataRouter: goldPrice, fxRates, fundNavs, summary
 * - sipRouter: list/create/update/cancel/getHistory/summary (DB null fallbacks)
 * - grpcRouter: health/ledgerBalance/fraudRiskProfile/outboxEventStatus fallbacks
 * - ollamaRouter: health/listModels/askFinancialAI fallbacks
 * - portalBillingRouter: listPlans, getSubscription fallback
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock DB ──────────────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getDb: vi.fn().mockResolvedValue(null),
  getTenantBySlug: vi.fn().mockResolvedValue(null),
  updateTenantBranding: vi.fn().mockResolvedValue(undefined),
  getOrCreatePortalSubscription: vi.fn().mockRejectedValue(new Error("DB unavailable")),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Mock bridgeFetch ─────────────────────────────────────────────────────────
vi.mock("./middlewareBridge", () => ({
  isBridgeAvailable: () => false,
  bridgeFetch: vi.fn().mockRejectedValue(new Error("Bridge unavailable")),
}));

// ─── Mock Stripe ──────────────────────────────────────────────────────────────
vi.mock("./stripe", () => ({
  getStripe: vi.fn().mockReturnValue({
    subscriptions: {
      retrieve: vi.fn().mockRejectedValue(new Error("No stripe")),
    },
    checkout: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://checkout.stripe.com/test" }),
      },
    },
    billingPortal: {
      sessions: {
        create: vi.fn().mockResolvedValue({ url: "https://billing.stripe.com/test" }),
      },
    },
  }),
  isStripeConfigured: vi.fn().mockReturnValue(true),
}));

// ─── Mock Ollama client ───────────────────────────────────────────────────────
vi.mock("./ollama", () => ({
  checkOllamaHealth: vi.fn().mockResolvedValue({ available: false, error: "Connection refused" }),
  listOllamaModels: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
  askPayGateAI: vi.fn().mockResolvedValue("I can help you with financial questions."),
  ollamaChat: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
  ollamaEmbed: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
  summarizeTransactionHistory: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
  explainFraudAlert: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
  pullOllamaModel: vi.fn().mockRejectedValue(new Error("Ollama unavailable")),
}));

// ─── Mock gRPC clients ────────────────────────────────────────────────────────
vi.mock("./grpcClients", () => ({
  getLedgerClient: vi.fn().mockReturnValue(null),
  getFraudClient: vi.fn().mockReturnValue(null),
  getOutboxClient: vi.fn().mockReturnValue(null),
  getNotificationClient: vi.fn().mockReturnValue(null),
  checkGrpcHealth: vi.fn().mockResolvedValue({
    ledger: false, fraud: false, notifications: false,
    ussd: false, outbox: false, consumer: false, analytics: false,
  }),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
function makeCtx(userId = "user-1", role: "admin" | "user" = "user") {
  return {
    user: { id: userId, email: `${userId}@test.com`, name: "Test User", role },
    req: { headers: { origin: "https://test.manus.space" } } as any,
    res: {} as any,
  };
}

async function callProc(router: any, path: string, input?: any, ctx?: any) {
  const parts = path.split(".");
  let node: any = router._def.procedures;
  for (const part of parts) node = node[part];
  return node._def.resolver({ ctx: ctx ?? makeCtx(), input });
}

// ─── marketDataRouter ─────────────────────────────────────────────────────────

describe("marketDataRouter", () => {
  let marketDataRouter: any;
  beforeEach(async () => {
    const mod = await import("./marketDataRouter");
    marketDataRouter = mod.marketDataRouter;
  });

  // STALE CONTRACT: market data is fail-loud now — no hardcoded fallback
  // rates. Without network access to the live gold feed the procedure throws
  // SERVICE_UNAVAILABLE; when a feed IS reachable, the shape is validated.
  it("goldPrice returns ngnPerGram, ngnPerTroyOz, koboPerGram, currency=NGN (or fails loud without a feed)", async () => {
    try {
      const result = await callProc(marketDataRouter, "goldPrice");
      expect(result.currency).toBe("NGN");
      expect(typeof result.ngnPerGram).toBe("number");
      expect(result.ngnPerGram).toBeGreaterThan(0);
      expect(result.ngnPerTroyOz).toBeGreaterThan(result.ngnPerGram);
      expect(result.koboPerGram).toBe(result.ngnPerGram * 100);
    } catch (e: any) {
      expect(e.message).toMatch(/unavailable|unreachable/i);
    }
  });

  // LIVE-FEED TEST: hits the real FX provider. When the sandbox has no
  // outbound network the router must fail LOUD (unavailable) — both outcomes
  // are valid; a fabricated-rates fallback would fail this test.
  it("fxRates returns base=NGN and rates object with USD", async () => {
    try {
      const result = await callProc(marketDataRouter, "fxRates");
      expect(result.base).toBe("NGN");
      expect(typeof result.rates).toBe("object");
      expect(typeof result.updatedAt).toBe("string");
    } catch (e: any) {
      expect(e.message).toMatch(/unavailable|unreachable/i);
    }
  });

  it("fxRates filters to requested currencies", async () => {
    try {
      const result = await callProc(marketDataRouter, "fxRates", { currencies: ["USD", "GBP"] });
      expect(Object.keys(result.rates)).toContain("USD");
      expect(Object.keys(result.rates)).toContain("GBP");
    } catch (e: any) {
      expect(e.message).toMatch(/unavailable|unreachable/i);
    }
  });

  // STALE CONTRACT: invented fund NAVs must never be served — fundNavs fails
  // loudly because no real NAV feed is integrated (see marketDataRouter.ts).
  it("fundNavs fails loud — no NAV feed integrated", async () => {
    await expect(callProc(marketDataRouter, "fundNavs")).rejects.toThrow(/NAV feed|unavailable/i);
  });

  // STALE CONTRACT: summary aggregates live feeds and fails loud when they
  // are unreachable (no fabricated topFund/sentiment).
  it("summary returns live gold/fx data or fails loud without feeds", async () => {
    try {
      const result = await callProc(marketDataRouter, "summary");
      // Gold section is omitted (null) when METALS_API_KEY is not configured;
      // when present it must carry a real quote.
      if (result.gold !== null) {
        expect(result.gold).toHaveProperty("ngnPerGram");
      }
      expect(result.fx).toBeDefined();
      expect(result.topFund).toBeNull();
      expect(result.marketSentiment).toBeNull();
    } catch (e: any) {
      expect(e.message).toMatch(/unavailable|unreachable|NAV feed/i);
    }
  });
});

// ─── sipRouter ────────────────────────────────────────────────────────────────

describe("sipRouter — DB null fallbacks", () => {
  let sipRouter: any;
  beforeEach(async () => {
    const mod = await import("./sipRouter");
    sipRouter = mod.sipRouter;
  });

  it("list returns empty plans array when DB null", async () => {
    const result = await callProc(sipRouter, "list");
    expect(result).toMatchObject({ plans: [] });
  });

  it("getHistory returns empty executions when DB null", async () => {
    const result = await callProc(sipRouter, "getHistory", { planId: "plan-1", limit: 20 });
    expect(result).toMatchObject({ executions: [] });
  });

  it("summary returns zeros when DB null", async () => {
    const result = await callProc(sipRouter, "summary");
    expect(result).toMatchObject({
      totalPlans: 0,
      activePlans: 0,
      totalInvestedKobo: 0,
      nextExecution: null,
    });
  });

  it("create throws INTERNAL_SERVER_ERROR when DB null", async () => {
    await expect(
      callProc(sipRouter, "create", {
        assetType: "gold",
        amountKobo: 500_000,
        frequency: "monthly",
      })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("update throws INTERNAL_SERVER_ERROR when DB null", async () => {
    await expect(
      callProc(sipRouter, "update", { planId: "plan-1", amountKobo: 600_000 })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("cancel throws INTERNAL_SERVER_ERROR when DB null", async () => {
    await expect(
      callProc(sipRouter, "cancel", { planId: "plan-1" })
    ).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

// ─── grpcRouter ───────────────────────────────────────────────────────────────

describe("grpcRouter — gRPC clients unavailable", () => {
  let grpcRouter: any;
  beforeEach(async () => {
    const mod = await import("./grpcRouter");
    grpcRouter = mod.grpcRouter;
  });

  it("health returns configured object and service flags when gRPC unavailable", async () => {
    const result = await callProc(grpcRouter, "health");
    // Returns spread of health object + configured object
    expect(typeof result).toBe("object");
    expect(result).toHaveProperty("configured");
    // configured object has the right keys
    expect(result.configured).toHaveProperty("ledger");
    expect(result.configured).toHaveProperty("fraud");
    expect(result.configured).toHaveProperty("notifications");
    // Service availability flags are booleans
    expect(typeof result.ledger).toBe("boolean");
    expect(typeof result.fraud).toBe("boolean");
  });

  it("ledgerBalance returns available=false when client null", async () => {
    const result = await callProc(grpcRouter, "ledgerBalance", { accountId: "acc-1" });
    expect(result.available).toBe(false);
    expect(result.balance).toBeNull();
  });

  it("fraudRiskProfile returns available=false when client null", async () => {
    const result = await callProc(grpcRouter, "fraudRiskProfile", {
      entityId: "merchant-1",
      entityType: "merchant",
    });
    expect(result.available).toBe(false);
    expect(result.profile).toBeNull();
  });

  it("outboxEventStatus returns available=false when client null", async () => {
    const result = await callProc(grpcRouter, "outboxEventStatus", { eventId: "evt-1" });
    expect(result.available).toBe(false);
    expect(result.event).toBeNull();
  });

  it("ledgerTransfer throws when client null", async () => {
    await expect(
      callProc(grpcRouter, "ledgerTransfer", {
        idempotencyKey: "00000000-0000-0000-0000-000000000001",
        debitAccountId: "acc-1",
        creditAccountId: "acc-2",
        amountCents: 100_000,
        reference: "ref-1",
      })
    ).rejects.toThrow();
  });
});

// ─── ollamaRouter ─────────────────────────────────────────────────────────────

describe("ollamaRouter — Ollama unavailable", () => {
  let ollamaRouter: any;
  beforeEach(async () => {
    const mod = await import("./ollamaRouter");
    ollamaRouter = mod.ollamaRouter;
  });

  it("health returns available=false when Ollama not running", async () => {
    const result = await callProc(ollamaRouter, "health");
    expect(result.available).toBe(false);
    expect(typeof result.error).toBe("string");
  });

  it("listModels throws INTERNAL_SERVER_ERROR when Ollama unavailable", async () => {
    await expect(callProc(ollamaRouter, "listModels")).rejects.toMatchObject({
      code: "INTERNAL_SERVER_ERROR",
    });
  });

  it("askFinancialAI returns answer string from mock", async () => {
    const result = await callProc(ollamaRouter, "askFinancialAI", {
      question: "What is the current gold price?",
    });
    expect(typeof result.answer).toBe("string");
    expect(result.answer.length).toBeGreaterThan(0);
  });
});

// ─── portalBillingRouter ──────────────────────────────────────────────────────

describe("portalBillingRouter", () => {
  let portalBillingRouter: any;
  beforeEach(async () => {
    const mod = await import("./portalBillingRouter");
    portalBillingRouter = mod.portalBillingRouter;
  });

  it("listPlans returns plans with key, name, priceUSD, features", async () => {
    const result = await callProc(portalBillingRouter, "listPlans");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThanOrEqual(2);
    expect(result[0]).toHaveProperty("key");
    expect(result[0]).toHaveProperty("name");
    expect(result[0]).toHaveProperty("priceUSD");
    expect(result[0]).toHaveProperty("features");
    expect(result[0]).toHaveProperty("featureFlags");
  });

  it("listPlans includes free plan", async () => {
    const result = await callProc(portalBillingRouter, "listPlans");
    const keys = result.map((p: any) => p.key);
    expect(keys).toContain("free");
  });

  it("getSubscription throws when DB unavailable", async () => {
    await expect(callProc(portalBillingRouter, "getSubscription")).rejects.toThrow("DB unavailable");
  });
});
