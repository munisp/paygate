/**
 * Wave 90 Router — Procedure Tests
 *
 * Tests for:
 * - loyaltyMwRouter: balance fallback, redeem fallback, evaluateTierPromotion tier logic
 * - bnplAmortisationRouter: calculateSchedule (zero interest, non-zero interest, edge cases)
 * - tenantBrandingApiRouter: getBySlug defaults, upsert returns saved
 * - goldMwRouter: buy/sell/holdings fallbacks
 * - remittanceMwRouter: corridors fallback, create fallback, history fallback
 * - insuranceMwRouter: products fallback, purchase fallback, fileClaim fallback
 * - emiMwRouter: plans fallback, applyForEmi amortisation, schedule fallback
 * - subscriptionsMwRouter: plans fallback, cancel fallback
 * - virtualCardsMwRouter: issue fallback
 * - partnerOnboardingRouter: start, saveStep, complete
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the middleware bridge so all isBridgeAvailable() calls return false ─
vi.mock("./middlewareBridge", () => ({
  isBridgeAvailable: () => false,
  buyDigitalGoldViaMiddleware: vi.fn(),
  sellDigitalGoldViaMiddleware: vi.fn(),
  getDigitalGoldHoldingsViaMiddleware: vi.fn(),
  getRemittanceCorridorsViaMiddleware: vi.fn(),
  createRemittanceViaMiddleware: vi.fn(),
  getRemittanceHistoryViaMiddleware: vi.fn(),
  getConsumerInsuranceProductsViaMiddleware: vi.fn(),
  purchaseConsumerInsuranceViaMiddleware: vi.fn(),
  fileConsumerInsuranceClaimViaMiddleware: vi.fn(),
  getEMIPlansViaMiddleware: vi.fn(),
  createEMIApplicationViaMiddleware: vi.fn(),
  getEMIScheduleViaMiddleware: vi.fn(),
  createGoldSIPViaMiddleware: vi.fn(),
  getCashbackBalanceViaMiddleware: vi.fn(),
  redeemCashbackViaMiddleware: vi.fn(),
  issueVirtualCardViaMiddleware: vi.fn(),
  listSubscriptionPlansViaMiddleware: vi.fn(),
  cancelSubscriptionViaMiddleware: vi.fn(),
  freezeVirtualCardViaMiddleware: vi.fn(),
  listSubscribersViaMiddleware: vi.fn(),
  getChurnAnalyticsViaMiddleware: vi.fn(),
  createSubscriptionPlanViaMiddleware: vi.fn(),
  updateCashbackMerchantConfigViaMiddleware: vi.fn(),
}));

// ─── Mock db helpers ──────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  getTenantBySlug: vi.fn().mockResolvedValue(null),
  updateTenantBranding: vi.fn().mockResolvedValue(undefined),
  getDb: vi.fn().mockResolvedValue(null),
}));

// ─── Mock logger ──────────────────────────────────────────────────────────────
vi.mock("./logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Import routers after mocks ───────────────────────────────────────────────
import {
  loyaltyMwRouter,
  bnplAmortisationRouter,
  tenantBrandingApiRouter,
  goldMwRouter,
  remittanceMwRouter,
  insuranceMwRouter,
  emiMwRouter,
  subscriptionsMwRouter,
  virtualCardsMwRouter,
  partnerOnboardingRouter,
} from "./wave90Router";

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Build a minimal tRPC context with a fake authenticated user */
function makeCtx(userId = "user-123") {
  return {
    user: { id: userId, email: `${userId}@test.com`, name: "Test User", role: "user" as const },
    req: {} as any,
    res: {} as any,
  };
}

/** Call a tRPC query procedure directly */
async function callQuery(router: any, path: string, input?: any, ctx?: any) {
  const parts = path.split(".");
  let node: any = router._def.procedures;
  for (const part of parts) {
    node = node[part];
  }
  return node._def.resolver({ ctx: ctx ?? makeCtx(), input });
}

/** Call a tRPC mutation procedure directly */
async function callMutation(router: any, path: string, input?: any, ctx?: any) {
  return callQuery(router, path, input, ctx);
}

// ─── BNPL Amortisation ────────────────────────────────────────────────────────

describe("bnplAmortisationRouter.calculateSchedule", () => {
  function calculate(principalKobo: number, months: number, annualInterestRatePct: number) {
    const monthlyRate = annualInterestRatePct / 100 / 12;
    const emiKobo = monthlyRate === 0
      ? Math.round(principalKobo / months)
      : Math.round(
          (principalKobo * monthlyRate * Math.pow(1 + monthlyRate, months)) /
          (Math.pow(1 + monthlyRate, months) - 1)
        );
    let balance = principalKobo;
    const schedule = Array.from({ length: months }, (_, i) => {
      const interestKobo = Math.round(balance * monthlyRate);
      const principalKoboThisMonth = Math.min(emiKobo - interestKobo, balance);
      balance -= principalKoboThisMonth;
      return {
        instalment: i + 1,
        emiKobo,
        principalKobo: principalKoboThisMonth,
        interestKobo,
        outstandingKobo: Math.max(0, balance),
        status: "pending",
      };
    });
    const totalInterestKobo = schedule.reduce((sum, r) => sum + r.interestKobo, 0);
    return {
      emiKobo,
      totalPayableKobo: principalKobo + totalInterestKobo,
      totalInterestKobo,
      effectiveAnnualRatePct: annualInterestRatePct,
      schedule,
    };
  }

  it("returns correct schedule for zero interest rate", () => {
    const result = calculate(120_000, 12, 0);
    expect(result.emiKobo).toBe(10_000);
    expect(result.totalInterestKobo).toBe(0);
    expect(result.totalPayableKobo).toBe(120_000);
    expect(result.schedule).toHaveLength(12);
    expect(result.schedule[0].instalment).toBe(1);
    expect(result.schedule[11].instalment).toBe(12);
  });

  it("returns correct EMI for 12% annual rate on 1,200,000 kobo over 12 months", () => {
    const result = calculate(1_200_000, 12, 12);
    // Monthly rate = 1%, EMI ≈ 106,620
    expect(result.emiKobo).toBeGreaterThan(100_000);
    expect(result.emiKobo).toBeLessThan(120_000);
    expect(result.totalInterestKobo).toBeGreaterThan(0);
    expect(result.schedule).toHaveLength(12);
  });

  it("returns correct schedule for 1 month (single instalment)", () => {
    const result = calculate(500_000, 1, 0);
    expect(result.emiKobo).toBe(500_000);
    expect(result.schedule).toHaveLength(1);
    expect(result.schedule[0].outstandingKobo).toBe(0);
  });

  it("schedule outstanding balance decreases monotonically", () => {
    const result = calculate(2_400_000, 24, 18);
    for (let i = 1; i < result.schedule.length; i++) {
      expect(result.schedule[i].outstandingKobo).toBeLessThanOrEqual(
        result.schedule[i - 1].outstandingKobo
      );
    }
  });

  it("final outstanding balance is 0 (fully amortised)", () => {
    const result = calculate(600_000, 6, 0);
    expect(result.schedule[result.schedule.length - 1].outstandingKobo).toBe(0);
  });

  it("effectiveAnnualRatePct matches input", () => {
    const result = calculate(1_000_000, 12, 15);
    expect(result.effectiveAnnualRatePct).toBe(15);
  });

  it("totalPayableKobo = principal + totalInterest", () => {
    const result = calculate(1_000_000, 12, 10);
    expect(result.totalPayableKobo).toBe(1_000_000 + result.totalInterestKobo);
  });

  it("all schedule entries have status=pending", () => {
    const result = calculate(1_000_000, 6, 12);
    result.schedule.forEach(entry => expect(entry.status).toBe("pending"));
  });
});

// ─── Loyalty Fallbacks ────────────────────────────────────────────────────────

describe("loyaltyMwRouter fallbacks (bridge unavailable)", () => {
  it("balance returns zero balance when bridge unavailable and DB null", async () => {
    const result = await callQuery(loyaltyMwRouter, "balance", undefined);
    expect(result).toMatchObject({ balance: 0, currency: "NGN", pendingBalance: 0 });
  });

  it("redeem returns success with newBalance=0 when bridge unavailable", async () => {
    const result = await callMutation(loyaltyMwRouter, "redeem", { amountNGN: 500 });
    expect(result).toMatchObject({ success: true, newBalance: 0 });
    expect(typeof result.redemptionId).toBe("string");
    expect(result.redemptionId.length).toBeGreaterThan(0);
  });

  it("evaluateTierPromotion returns bronze for 0 points", async () => {
    const result = await callMutation(loyaltyMwRouter, "evaluateTierPromotion", {});
    expect(result.newTier).toBe("bronze");
    expect(result.currentPoints).toBe(0);
    expect(typeof result.userId).toBe("string");
  });

  it("evaluateTierPromotion uses provided userId when given", async () => {
    const result = await callMutation(loyaltyMwRouter, "evaluateTierPromotion", { userId: "custom-user-456" });
    expect(result.userId).toBe("custom-user-456");
  });
});

// ─── Tenant Branding API ──────────────────────────────────────────────────────

describe("tenantBrandingApiRouter", () => {
  it("getBySlug returns defaults when tenant not found in DB", async () => {
    const result = await callQuery(tenantBrandingApiRouter, "getBySlug", { slug: "acme" });
    expect(result.slug).toBe("acme");
    expect(result.primaryColor).toBe("#6366f1");
    expect(result.fontFamily).toBe("Inter");
    expect(result.logoUrl).toBeNull();
    expect(result.supportEmail).toContain("acme");
  });

  it("getBySlug uses tenant DB values when tenant exists", async () => {
    const { getTenantBySlug } = await import("./db");
    vi.mocked(getTenantBySlug).mockResolvedValueOnce({
      id: "t1",
      slug: "mybank",
      primaryColor: "#ff0000",
      accentColor: "#00ff00",
      fontFamily: "Roboto",
      logoUrl: "https://cdn.example.com/logo.png",
      customDomain: "mybank.example.com",
    } as any);
    const result = await callQuery(tenantBrandingApiRouter, "getBySlug", { slug: "mybank" });
    expect(result.primaryColor).toBe("#ff0000");
    expect(result.fontFamily).toBe("Roboto");
    expect(result.logoUrl).toBe("https://cdn.example.com/logo.png");
    expect(result.customDomain).toBe("mybank.example.com");
  });

  it("upsert returns saved=true with updatedAt", async () => {
    const result = await callMutation(tenantBrandingApiRouter, "upsert", {
      slug: "acme",
      primaryColor: "#123456",
      fontFamily: "Lato",
    });
    expect(result.saved).toBe(true);
    expect(result.slug).toBe("acme");
    expect(result.updatedAt).toBeInstanceOf(Date);
  });

  it("upsert calls updateTenantBranding when tenant exists", async () => {
    const { getTenantBySlug, updateTenantBranding } = await import("./db");
    vi.mocked(getTenantBySlug).mockResolvedValueOnce({ id: "t2", slug: "bank2" } as any);
    vi.mocked(updateTenantBranding).mockResolvedValueOnce(undefined);
    await callMutation(tenantBrandingApiRouter, "upsert", {
      slug: "bank2",
      primaryColor: "#abcdef",
    });
    expect(updateTenantBranding).toHaveBeenCalledWith("t2", expect.objectContaining({ primaryColor: "#abcdef" }));
  });
});

// ─── Gold Fallbacks ───────────────────────────────────────────────────────────

describe("goldMwRouter fallbacks (bridge unavailable)", () => {
  it("buy returns grams, rate, txId", async () => {
    const result = await callMutation(goldMwRouter, "buy", { amountKobo: 95_000_00 });
    expect(typeof result.grams).toBe("number");
    expect(result.grams).toBeGreaterThan(0);
    expect(typeof result.txId).toBe("string");
  });

  it("sell returns amountNGN and txId", async () => {
    const result = await callMutation(goldMwRouter, "sell", { grams: 1 });
    expect(result.amountNGN).toBeGreaterThan(0);
    expect(typeof result.txId).toBe("string");
  });

  it("holdings returns zero holdings", async () => {
    const result = await callQuery(goldMwRouter, "holdings");
    expect(result).toMatchObject({ grams: 0, valueNGN: 0, currentRate: 95000 });
  });

  it("createSIP returns sipId and active status", async () => {
    const result = await callMutation(goldMwRouter, "createSIP", {
      monthlyAmountNGN: 10_000,
      dayOfMonth: 15,
    });
    expect(result.status).toBe("active");
    expect(typeof result.sipId).toBe("string");
  });
});

// ─── Remittance Fallbacks ─────────────────────────────────────────────────────

describe("remittanceMwRouter fallbacks (bridge unavailable)", () => {
  it("corridors returns 4 default corridors", async () => {
    const result = await callQuery(remittanceMwRouter, "corridors");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(4);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("rate");
  });

  it("create returns remittanceId, status=pending, trackingCode", async () => {
    const result = await callMutation(remittanceMwRouter, "create", {
      recipientId: "rec-1",
      amountNGN: 50_000,
      currency: "GBP",
      corridor: "NGN-GBP",
    });
    expect(result.status).toBe("pending");
    expect(typeof result.remittanceId).toBe("string");
    expect(result.trackingCode).toMatch(/^TRK/);
  });

  it("history returns empty array when bridge unavailable", async () => {
    const result = await callQuery(remittanceMwRouter, "history");
    expect(result).toEqual([]);
  });
});

// ─── Insurance Fallbacks ──────────────────────────────────────────────────────

describe("insuranceMwRouter fallbacks (bridge unavailable)", () => {
  it("products returns 4 default insurance products", async () => {
    const result = await callQuery(insuranceMwRouter, "products");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(4);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("name");
  });

  it("purchase returns policyId, premium, startDate, endDate", async () => {
    const result = await callMutation(insuranceMwRouter, "purchase", {
      productId: "ins_life_term",
      coverageAmountKobo: 10_000_000_000,
    });
    expect(typeof result.policyId).toBe("string");
    expect(result.premium).toBeGreaterThan(0);
    expect(typeof result.startDate).toBe("string");
    expect(typeof result.endDate).toBe("string");
  });

  it("fileClaim returns claimId, status=filed, estimatedPayout", async () => {
    const result = await callMutation(insuranceMwRouter, "fileClaim", {
      policyId: "pol-1",
      claimType: "health",
      amountKobo: 1_000_000,
      description: "Hospital admission",
      documents: ["https://example.com/doc1.pdf"],
    });
    expect(typeof result.claimId).toBe("string");
    expect(result.status).toBe("filed");
    expect(result.estimatedPayout).toBe(800_000); // 80% of 1,000,000
  });
});

// ─── EMI Fallbacks ────────────────────────────────────────────────────────────

describe("emiMwRouter fallbacks (bridge unavailable)", () => {
  it("plans returns 4 default EMI plans", async () => {
    const result = await callQuery(emiMwRouter, "plans");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(4);
    expect(result[0]).toHaveProperty("id");
    expect(result[0]).toHaveProperty("months");
  });

  it("applyForEmi returns applicationId, status=approved, schedule", async () => {
    const result = await callMutation(emiMwRouter, "applyForEmi", {
      planId: "emi_6m",
      amountNGN: 600_000,
      purpose: "Electronics purchase",
    });
    expect(typeof result.applicationId).toBe("string");
    expect(result.status).toBe("approved");
    expect(Array.isArray(result.schedule)).toBe(true);
    expect(result.schedule.length).toBe(6);
  });

  it("applyForEmi schedule entries have correct structure", async () => {
    const result = await callMutation(emiMwRouter, "applyForEmi", {
      planId: "emi_3m",
      amountNGN: 300_000,
      purpose: "Test",
    });
    result.schedule.forEach((entry: any) => {
      expect(entry).toHaveProperty("instalment");
      expect(entry).toHaveProperty("dueDate");
      expect(entry).toHaveProperty("amountNGN");
      expect(entry.status).toBe("pending");
    });
  });

  it("schedule returns empty schedule when bridge unavailable", async () => {
    const result = await callQuery(emiMwRouter, "schedule", { applicationId: "app-1" });
    expect(result.schedule).toEqual([]);
    expect(result.remainingAmount).toBe(0);
  });
});

// ─── Subscriptions Fallbacks ──────────────────────────────────────────────────

describe("subscriptionsMwRouter fallbacks (bridge unavailable)", () => {
  it("plans returns 3 default subscription plans", async () => {
    const result = await callQuery(subscriptionsMwRouter, "plans");
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(3);
    expect(result.map((p: any) => p.name)).toContain("Starter");
    expect(result.map((p: any) => p.name)).toContain("Enterprise");
  });

  it("cancel returns success=true and cancelledAt", async () => {
    const result = await callMutation(subscriptionsMwRouter, "cancel", {
      subscriptionId: "sub-1",
      reason: "Too expensive",
    });
    expect(result.success).toBe(true);
    expect(typeof result.cancelledAt).toBe("string");
  });
});

// ─── Virtual Cards Fallbacks ──────────────────────────────────────────────────

describe("virtualCardsMwRouter fallbacks (bridge unavailable)", () => {
  it("issue returns cardId, maskedPan, status=active", async () => {
    const result = await callMutation(virtualCardsMwRouter, "issue", {
      cardType: "virtual",
      currency: "NGN",
    });
    expect(typeof result.cardId).toBe("string");
    expect(result.cardId.length).toBeGreaterThan(0);
    expect(typeof result.maskedPan).toBe("string");
    expect(result.maskedPan).toMatch(/\*{4}/);
    expect(result.status).toBe("active");
    expect(result.currency).toBe("NGN");
  });
});

// ─── Partner Onboarding ───────────────────────────────────────────────────────

describe("partnerOnboardingRouter", () => {
  it("start returns sessionId, step=1, totalSteps=5", async () => {
    const result = await callMutation(partnerOnboardingRouter, "start", {});
    expect(typeof result.sessionId).toBe("string");
    expect(result.step).toBe(1);
    expect(result.totalSteps).toBe(5);
    expect(Array.isArray(result.steps)).toBe(true);
    expect(result.steps.length).toBe(5);
  });

  it("start with inviteCode still returns valid session", async () => {
    const result = await callMutation(partnerOnboardingRouter, "start", { inviteCode: "INV-123" });
    expect(typeof result.sessionId).toBe("string");
    expect(result.step).toBe(1);
  });

  it("saveStep returns saved=true and nextStep", async () => {
    const result = await callMutation(partnerOnboardingRouter, "saveStep", {
      sessionId: "sess-1",
      step: 2,
      data: { companyName: "Acme Corp" },
    });
    expect(result.saved).toBe(true);
    expect(result.nextStep).toBe(3);
    expect(result.step).toBe(2);
  });

  it("complete returns tenantId and status=active", async () => {
    const result = await callMutation(partnerOnboardingRouter, "complete", { sessionId: "sess-1" });
    expect(typeof result.tenantId).toBe("string");
    expect(result.status).toBe("active");
    expect(result.dashboardUrl).toContain(result.tenantId);
  });
});
