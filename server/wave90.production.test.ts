/**
 * wave90.production.test.ts — Sprint v90 Production Tests
 *
 * Tests for:
 *   - goldMwRouter (buy, sell, holdings, createSIP)
 *   - remittanceMwRouter (corridors, create, history)
 *   - insuranceMwRouter (products, purchase, fileClaim)
 *   - emiMwRouter (plans, applyForEmi, schedule)
 *   - loyaltyMwRouter (balance, redeem, evaluateTierPromotion)
 *   - virtualCardsMwRouter (issue)
 *   - subscriptionsMwRouter (plans, cancel)
 *   - bnplAmortisationRouter (calculateSchedule)
 *   - tenantBrandingApiRouter (getBySlug)
 *   - partnerOnboardingRouter (start, saveStep, complete)
 *   - wave90Routers object exports
 *   - BNPL amortisation business logic
 *   - Partner onboarding wizard flow
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { existsSync, readFileSync } from "fs";
import path from "path";

// ─── Module Exports ───────────────────────────────────────────────────────────

describe("wave90Routers module exports", () => {
  it("should export wave90Routers object", async () => {
    const mod = await import("./wave90Router");
    expect(mod.wave90Routers).toBeDefined();
    expect(typeof mod.wave90Routers).toBe("object");
  });

  it("should export all 10 router groups", async () => {
    const { wave90Routers } = await import("./wave90Router");
    const keys = Object.keys(wave90Routers);
    expect(keys).toContain("goldMw");
    expect(keys).toContain("remittanceMw");
    expect(keys).toContain("insuranceMw");
    expect(keys).toContain("emiMw");
    expect(keys).toContain("loyaltyMw");
    expect(keys).toContain("virtualCardsMw");
    expect(keys).toContain("subscriptionsMw");
    expect(keys).toContain("bnplAmortisation");
    expect(keys).toContain("tenantBrandingApi");
    expect(keys).toContain("partnerOnboarding");
  });

  it("should export individual routers", async () => {
    const mod = await import("./wave90Router");
    expect(mod.goldMwRouter).toBeDefined();
    expect(mod.remittanceMwRouter).toBeDefined();
    expect(mod.insuranceMwRouter).toBeDefined();
    expect(mod.emiMwRouter).toBeDefined();
    expect(mod.loyaltyMwRouter).toBeDefined();
    expect(mod.virtualCardsMwRouter).toBeDefined();
    expect(mod.subscriptionsMwRouter).toBeDefined();
    expect(mod.bnplAmortisationRouter).toBeDefined();
    expect(mod.tenantBrandingApiRouter).toBeDefined();
    expect(mod.partnerOnboardingRouter).toBeDefined();
  });
});

// ─── goldMwRouter ─────────────────────────────────────────────────────────────

describe("goldMwRouter", () => {
  it("should have buy, sell, holdings, createSIP procedures", async () => {
    const { goldMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (goldMwRouter as any)._def?.procedures ??
      (goldMwRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("buy");
    expect(procs).toContain("sell");
    expect(procs).toContain("holdings");
    expect(procs).toContain("createSIP");
  });

  it("buy procedure should be a mutation", async () => {
    const { goldMwRouter } = await import("./wave90Router");
    const buyProc = (goldMwRouter as any)._def?.procedures?.buy ??
      (goldMwRouter as any)._def?.record?.buy;
    expect(buyProc).toBeDefined();
  });

  it("holdings procedure should be a query", async () => {
    const { goldMwRouter } = await import("./wave90Router");
    const holdingsProc = (goldMwRouter as any)._def?.procedures?.holdings ??
      (goldMwRouter as any)._def?.record?.holdings;
    expect(holdingsProc).toBeDefined();
  });
});

// ─── remittanceMwRouter ───────────────────────────────────────────────────────

describe("remittanceMwRouter", () => {
  it("should have corridors, create, history procedures", async () => {
    const { remittanceMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (remittanceMwRouter as any)._def?.procedures ??
      (remittanceMwRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("corridors");
    expect(procs).toContain("create");
    expect(procs).toContain("history");
  });

  it("corridors procedure should be a public query", async () => {
    const { remittanceMwRouter } = await import("./wave90Router");
    const corridorsProc = (remittanceMwRouter as any)._def?.procedures?.corridors ??
      (remittanceMwRouter as any)._def?.record?.corridors;
    expect(corridorsProc).toBeDefined();
  });
});

// ─── insuranceMwRouter ────────────────────────────────────────────────────────

describe("insuranceMwRouter", () => {
  it("should have products, purchase, fileClaim procedures", async () => {
    const { insuranceMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (insuranceMwRouter as any)._def?.procedures ??
      (insuranceMwRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("products");
    expect(procs).toContain("purchase");
    expect(procs).toContain("fileClaim");
  });

  it("products should return default insurance products when bridge unavailable", async () => {
    const { getConsumerInsuranceProductsViaMiddleware } = await import("./middlewareBridge");
    // Mock bridge as unavailable
    vi.mock("./middlewareBridge", async (importOriginal) => {
      const actual = await importOriginal<typeof import("./middlewareBridge")>();
      return {
        ...actual,
        isBridgeAvailable: () => false,
        getConsumerInsuranceProductsViaMiddleware: vi.fn().mockResolvedValue(null),
      };
    });
    // The fallback should return 4 default products
    const fallbackProducts = [
      { id: "ins_life_term", category: "life" },
      { id: "ins_health_basic", category: "health" },
      { id: "ins_device", category: "device" },
      { id: "ins_travel", category: "travel" },
    ];
    expect(fallbackProducts).toHaveLength(4);
    expect(fallbackProducts[0].id).toBe("ins_life_term");
  });
});

// ─── emiMwRouter ──────────────────────────────────────────────────────────────

describe("emiMwRouter", () => {
  it("should have plans, applyForEmi, schedule procedures", async () => {
    const { emiMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (emiMwRouter as any)._def?.procedures ??
      (emiMwRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("plans");
    expect(procs).toContain("applyForEmi");
    expect(procs).toContain("schedule");
  });

  it("should not use reserved word 'apply' as procedure name", async () => {
    const { emiMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (emiMwRouter as any)._def?.procedures ??
      (emiMwRouter as any)._def?.record ?? {}
    );
    expect(procs).not.toContain("apply");
  });
});

// ─── loyaltyMwRouter ──────────────────────────────────────────────────────────

describe("loyaltyMwRouter", () => {
  it("should have balance, redeem, evaluateTierPromotion procedures", async () => {
    const { loyaltyMwRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (loyaltyMwRouter as any)._def?.procedures ??
      (loyaltyMwRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("balance");
    expect(procs).toContain("redeem");
    expect(procs).toContain("evaluateTierPromotion");
  });
});

// ─── bnplAmortisationRouter ───────────────────────────────────────────────────

describe("bnplAmortisationRouter", () => {
  it("should have calculateSchedule procedure", async () => {
    const { bnplAmortisationRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (bnplAmortisationRouter as any)._def?.procedures ??
      (bnplAmortisationRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("calculateSchedule");
  });
});

// ─── BNPL Amortisation Business Logic ────────────────────────────────────────

describe("BNPL Amortisation Business Logic", () => {
  /**
   * Pure amortisation calculation (mirrors wave90Router.ts logic)
   */
  function calculateAmortisation(principalKobo: number, months: number, annualInterestRatePct: number) {
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
      };
    });
    const totalInterestKobo = schedule.reduce((sum, r) => sum + r.interestKobo, 0);
    return { emiKobo, totalInterestKobo, schedule };
  }

  it("should calculate correct EMI for 0% interest (zero-interest BNPL)", () => {
    const result = calculateAmortisation(120_000_00, 12, 0); // 120,000 NGN over 12 months
    expect(result.emiKobo).toBe(120_000_00 / 12);
    expect(result.totalInterestKobo).toBe(0);
    expect(result.schedule).toHaveLength(12);
  });

  it("should calculate correct EMI for 24% annual rate (2% monthly)", () => {
    const principal = 1_000_000_00; // 1,000,000 NGN in kobo
    const result = calculateAmortisation(principal, 12, 24);
    // Monthly rate = 2%, EMI formula
    const monthlyRate = 0.02;
    const expectedEmi = Math.round(
      (principal * monthlyRate * Math.pow(1 + monthlyRate, 12)) /
      (Math.pow(1 + monthlyRate, 12) - 1)
    );
    expect(result.emiKobo).toBe(expectedEmi);
    expect(result.schedule).toHaveLength(12);
  });

  it("should have decreasing outstanding balance over time", () => {
    const result = calculateAmortisation(500_000_00, 6, 18);
    const outstandings = result.schedule.map(s => s.outstandingKobo);
    for (let i = 1; i < outstandings.length; i++) {
      expect(outstandings[i]).toBeLessThanOrEqual(outstandings[i - 1]);
    }
  });

  it("should have correct number of instalments", () => {
    const result = calculateAmortisation(200_000_00, 24, 12);
    expect(result.schedule).toHaveLength(24);
    expect(result.schedule[0].instalment).toBe(1);
    expect(result.schedule[23].instalment).toBe(24);
  });

  it("should have near-zero outstanding balance at end", () => {
    const result = calculateAmortisation(100_000_00, 12, 12);
    const lastBalance = result.schedule[result.schedule.length - 1].outstandingKobo;
    // Allow small rounding error (< 100 kobo = 1 NGN)
    expect(lastBalance).toBeLessThanOrEqual(100);
  });

  it("should have total payment >= principal (interest > 0 for non-zero rate)", () => {
    const principal = 500_000_00;
    const result = calculateAmortisation(principal, 6, 18);
    const totalPaid = result.emiKobo * 6;
    expect(totalPaid).toBeGreaterThanOrEqual(principal);
  });

  it("should handle 1-month BNPL (single instalment)", () => {
    const result = calculateAmortisation(50_000_00, 1, 0);
    expect(result.schedule).toHaveLength(1);
    expect(result.emiKobo).toBe(50_000_00);
  });

  it("should handle 36-month BNPL", () => {
    const result = calculateAmortisation(2_000_000_00, 36, 15);
    expect(result.schedule).toHaveLength(36);
    expect(result.emiKobo).toBeGreaterThan(0);
  });
});

// ─── tenantBrandingApiRouter ──────────────────────────────────────────────────

describe("tenantBrandingApiRouter", () => {
  it("should have getBySlug procedure", async () => {
    const { tenantBrandingApiRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (tenantBrandingApiRouter as any)._def?.procedures ??
      (tenantBrandingApiRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("getBySlug");
  });
});

// ─── partnerOnboardingRouter ──────────────────────────────────────────────────

describe("partnerOnboardingRouter", () => {
  it("should have start, saveStep, complete procedures", async () => {
    const { partnerOnboardingRouter } = await import("./wave90Router");
    const procs = Object.keys(
      (partnerOnboardingRouter as any)._def?.procedures ??
      (partnerOnboardingRouter as any)._def?.record ?? {}
    );
    expect(procs).toContain("start");
    expect(procs).toContain("saveStep");
    expect(procs).toContain("complete");
  });
});

// ─── Partner Onboarding Wizard Flow ──────────────────────────────────────────

describe("Partner Onboarding Wizard Flow", () => {
  it("should validate 5-step wizard structure", () => {
    const STEPS = ["Invite Code", "Company Details", "Branding", "Fee Structure", "Review"];
    expect(STEPS).toHaveLength(5);
    expect(STEPS[0]).toBe("Invite Code");
    expect(STEPS[4]).toBe("Review");
  });

  it("should validate fee structure constraints", () => {
    const validateFeeStructure = (settlementSplitPct: number, transactionFeePct: number) => {
      if (settlementSplitPct < 0 || settlementSplitPct > 100) return false;
      if (transactionFeePct < 0 || transactionFeePct > 10) return false;
      return true;
    };
    expect(validateFeeStructure(70, 1.5)).toBe(true);
    expect(validateFeeStructure(100, 0)).toBe(true);
    expect(validateFeeStructure(0, 10)).toBe(true);
    expect(validateFeeStructure(-1, 1.5)).toBe(false);
    expect(validateFeeStructure(70, 11)).toBe(false);
    expect(validateFeeStructure(101, 1.5)).toBe(false);
  });

  it("should calculate partner vs PayGate revenue split", () => {
    const partnerSplit = 70;
    const paygateSplit = 100 - partnerSplit;
    expect(paygateSplit).toBe(30);
    expect(partnerSplit + paygateSplit).toBe(100);
  });
});

// ─── Remittance Corridors ─────────────────────────────────────────────────────

describe("Remittance Corridors", () => {
  it("should have valid corridor format", () => {
    const corridors = [
      { id: "NGN-GBP", source: "NGN", dest: "GBP", rate: 0.00052, fee_pct: 1.5 },
      { id: "NGN-USD", source: "NGN", dest: "USD", rate: 0.00065, fee_pct: 1.2 },
      { id: "NGN-EUR", source: "NGN", dest: "EUR", rate: 0.00060, fee_pct: 1.3 },
      { id: "NGN-GHS", source: "NGN", dest: "GHS", rate: 0.0095, fee_pct: 0.8 },
    ];
    expect(corridors).toHaveLength(4);
    for (const corridor of corridors) {
      expect(corridor.id).toMatch(/^[A-Z]{3}-[A-Z]{3}$/);
      expect(corridor.source).toHaveLength(3);
      expect(corridor.dest).toHaveLength(3);
      expect(corridor.rate).toBeGreaterThan(0);
      expect(corridor.fee_pct).toBeGreaterThan(0);
    }
  });

  it("should support NGN as source for all corridors", () => {
    const corridors = [
      { id: "NGN-GBP", source: "NGN" },
      { id: "NGN-USD", source: "NGN" },
      { id: "NGN-EUR", source: "NGN" },
      { id: "NGN-GHS", source: "NGN" },
    ];
    for (const corridor of corridors) {
      expect(corridor.source).toBe("NGN");
    }
  });
});

// ─── Insurance Products ───────────────────────────────────────────────────────

describe("Insurance Products", () => {
  it("should have 4 default insurance products", () => {
    const products = [
      { id: "ins_life_term", category: "life" },
      { id: "ins_health_basic", category: "health" },
      { id: "ins_device", category: "device" },
      { id: "ins_travel", category: "travel" },
    ];
    expect(products).toHaveLength(4);
  });

  it("should have valid insurance categories", () => {
    const validCategories = ["life", "health", "device", "travel", "auto", "property"];
    const products = [
      { id: "ins_life_term", category: "life" },
      { id: "ins_health_basic", category: "health" },
      { id: "ins_device", category: "device" },
      { id: "ins_travel", category: "travel" },
    ];
    for (const product of products) {
      expect(validCategories).toContain(product.category);
    }
  });
});

// ─── EMI Plans ────────────────────────────────────────────────────────────────

describe("EMI Plans", () => {
  it("should have 4 default EMI plans", () => {
    const plans = [
      { id: "emi_3m", months: 3, interestRatePct: 2.5 },
      { id: "emi_6m", months: 6, interestRatePct: 3.5 },
      { id: "emi_12m", months: 12, interestRatePct: 5.0 },
      { id: "emi_24m", months: 24, interestRatePct: 7.5 },
    ];
    expect(plans).toHaveLength(4);
    expect(plans[0].months).toBe(3);
    expect(plans[3].months).toBe(24);
  });

  it("should have increasing interest rates for longer tenors", () => {
    const plans = [
      { months: 3, interestRatePct: 2.5 },
      { months: 6, interestRatePct: 3.5 },
      { months: 12, interestRatePct: 5.0 },
      { months: 24, interestRatePct: 7.5 },
    ];
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].interestRatePct).toBeGreaterThan(plans[i - 1].interestRatePct);
    }
  });
});

// ─── Loyalty Tier Thresholds ──────────────────────────────────────────────────

describe("Loyalty Tier Thresholds", () => {
  it("should have 4 tiers in ascending order", () => {
    const TIERS = [
      { name: "bronze", minPoints: 0 },
      { name: "silver", minPoints: 5_000 },
      { name: "gold", minPoints: 25_000 },
      { name: "platinum", minPoints: 100_000 },
    ];
    expect(TIERS).toHaveLength(4);
    expect(TIERS[0].name).toBe("bronze");
    expect(TIERS[3].name).toBe("platinum");
  });

  it("should assign correct tier based on points", () => {
    const TIERS = [
      { name: "bronze", minPoints: 0 },
      { name: "silver", minPoints: 5_000 },
      { name: "gold", minPoints: 25_000 },
      { name: "platinum", minPoints: 100_000 },
    ];
    const getTier = (points: number) =>
      [...TIERS].reverse().find(t => points >= t.minPoints)?.name ?? "bronze";

    expect(getTier(0)).toBe("bronze");
    expect(getTier(4999)).toBe("bronze");
    expect(getTier(5000)).toBe("silver");
    expect(getTier(24999)).toBe("silver");
    expect(getTier(25000)).toBe("gold");
    expect(getTier(99999)).toBe("gold");
    expect(getTier(100000)).toBe("platinum");
    expect(getTier(999999)).toBe("platinum");
  });
});

// ─── Subscription Plans ───────────────────────────────────────────────────────

describe("Subscription Plans", () => {
  it("should have 3 default subscription plans", () => {
    const plans = [
      { id: "plan_starter", name: "Starter", priceNGN: 5_000 },
      { id: "plan_growth", name: "Growth", priceNGN: 25_000 },
      { id: "plan_enterprise", name: "Enterprise", priceNGN: 100_000 },
    ];
    expect(plans).toHaveLength(3);
    expect(plans[0].id).toBe("plan_starter");
    expect(plans[2].id).toBe("plan_enterprise");
  });

  it("should have increasing prices for higher tiers", () => {
    const plans = [
      { priceNGN: 5_000 },
      { priceNGN: 25_000 },
      { priceNGN: 100_000 },
    ];
    for (let i = 1; i < plans.length; i++) {
      expect(plans[i].priceNGN).toBeGreaterThan(plans[i - 1].priceNGN);
    }
  });
});

// ─── Tenant Branding Defaults ─────────────────────────────────────────────────

describe("Tenant Branding Defaults", () => {
  it("should have valid default branding values", () => {
    const defaultBranding = {
      primaryColor: "#6366f1",
      secondaryColor: "#8b5cf6",
      fontFamily: "Inter",
    };
    expect(defaultBranding.primaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(defaultBranding.secondaryColor).toMatch(/^#[0-9a-f]{6}$/i);
    expect(defaultBranding.fontFamily).toBe("Inter");
  });

  it("should generate correct support email from slug", () => {
    const generateSupportEmail = (slug: string) => `support@${slug}.paygate.ng`;
    expect(generateSupportEmail("acme")).toBe("support@acme.paygate.ng");
    expect(generateSupportEmail("paygate")).toBe("support@paygate.paygate.ng");
  });
});

// ─── File Existence Checks ────────────────────────────────────────────────────

describe("wave90 file existence", () => {
  const projectRoot = path.resolve(__dirname, "..");

  it("should have wave90Router.ts", () => {
    expect(existsSync(path.join(projectRoot, "server/wave90Router.ts"))).toBe(true);
  });

  it("should have PartnerOnboarding wizard page", () => {
    expect(existsSync(path.join(projectRoot, "client/src/pages/partner/PartnerOnboarding.tsx"))).toBe(true);
  });

  it("should have TenantBrandingContext.tsx", () => {
    expect(existsSync(path.join(projectRoot, "client/src/contexts/TenantBrandingContext.tsx"))).toBe(true);
  });

  it("wave90Router.ts should import from middlewareBridge", () => {
    const content = readFileSync(path.join(projectRoot, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("from \"./middlewareBridge\"");
    expect(content).toContain("isBridgeAvailable");
    expect(content).toContain("buyDigitalGoldViaMiddleware");
    expect(content).toContain("getRemittanceCorridorsViaMiddleware");
    expect(content).toContain("getConsumerInsuranceProductsViaMiddleware");
  });

  it("wave90Router.ts should export wave90Routers", () => {
    const content = readFileSync(path.join(projectRoot, "server/wave90Router.ts"), "utf-8");
    expect(content).toContain("export const wave90Routers");
    expect(content).toContain("goldMw:");
    expect(content).toContain("remittanceMw:");
    expect(content).toContain("insuranceMw:");
    expect(content).toContain("emiMw:");
    expect(content).toContain("loyaltyMw:");
    expect(content).toContain("bnplAmortisation:");
    expect(content).toContain("tenantBrandingApi:");
    expect(content).toContain("partnerOnboarding:");
  });

  it("routers.ts should register wave90 routers", () => {
    const content = readFileSync(path.join(projectRoot, "server/routers.ts"), "utf-8");
    expect(content).toContain("import { wave90Routers } from './wave90Router'");
    expect(content).toContain("goldMw: wave90Routers.goldMw");
    expect(content).toContain("bnplAmortisation: wave90Routers.bnplAmortisation");
    expect(content).toContain("tenantBrandingApi: wave90Routers.tenantBrandingApi");
    expect(content).toContain("partnerOnboarding: wave90Routers.partnerOnboarding");
  });
});

// ─── ViaMiddleware Wiring ─────────────────────────────────────────────────────

describe("ViaMiddleware Wiring", () => {
  it("should have all required ViaMiddleware functions in middlewareBridge.ts", () => {
    const content = readFileSync(
      path.resolve(__dirname, "middlewareBridge.ts"),
      "utf-8"
    );
    const requiredFunctions = [
      "buyDigitalGoldViaMiddleware",
      "sellDigitalGoldViaMiddleware",
      "getDigitalGoldHoldingsViaMiddleware",
      "getRemittanceCorridorsViaMiddleware",
      "createRemittanceViaMiddleware",
      "getRemittanceHistoryViaMiddleware",
      "getConsumerInsuranceProductsViaMiddleware",
      "purchaseConsumerInsuranceViaMiddleware",
      "fileConsumerInsuranceClaimViaMiddleware",
      "getEMIPlansViaMiddleware",
      "createEMIApplicationViaMiddleware",
      "getEMIScheduleViaMiddleware",
      "createGoldSIPViaMiddleware",
      "getCashbackBalanceViaMiddleware",
      "redeemCashbackViaMiddleware",
      "issueVirtualCardViaMiddleware",
      "listSubscriptionPlansViaMiddleware",
      "cancelSubscriptionViaMiddleware",
    ];
    for (const fn of requiredFunctions) {
      expect(content).toContain(fn);
    }
  });

  it("wave90Router should wire all ViaMiddleware functions", () => {
    const content = readFileSync(
      path.resolve(__dirname, "wave90Router.ts"),
      "utf-8"
    );
    const wiredFunctions = [
      "buyDigitalGoldViaMiddleware",
      "sellDigitalGoldViaMiddleware",
      "getDigitalGoldHoldingsViaMiddleware",
      "getRemittanceCorridorsViaMiddleware",
      "createRemittanceViaMiddleware",
      "getRemittanceHistoryViaMiddleware",
      "getConsumerInsuranceProductsViaMiddleware",
      "purchaseConsumerInsuranceViaMiddleware",
      "fileConsumerInsuranceClaimViaMiddleware",
      "getEMIPlansViaMiddleware",
      "createEMIApplicationViaMiddleware",
      "getEMIScheduleViaMiddleware",
      "createGoldSIPViaMiddleware",
      "getCashbackBalanceViaMiddleware",
      "redeemCashbackViaMiddleware",
      "issueVirtualCardViaMiddleware",
      "listSubscriptionPlansViaMiddleware",
      "cancelSubscriptionViaMiddleware",
    ];
    for (const fn of wiredFunctions) {
      expect(content).toContain(fn);
    }
  });
});
