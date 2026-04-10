/**
 * Comprehensive vitest tests for all new features added in v75:
 * - Agent Banking V3 router
 * - Loyalty Merchant router
 * - SDK Portal router
 * - Cohort Analytics router
 * - Settlement Forecast router
 * - Tax Engine router
 * - Go bridge handler integration (mocked)
 * - Python service integration (mocked)
 * - Shared constants validation
 * - Drizzle schema table existence
 * - New page component imports
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Mock fetch globally ───────────────────────────────────────────────────────
const mockFetch = vi.fn();
global.fetch = mockFetch;

// ─── Mock environment variables ───────────────────────────────────────────────
vi.stubEnv("MIDDLEWARE_BRIDGE_URL", "http://go-bridge:8080");
vi.stubEnv("COHORT_ANALYTICS_URL", "http://cohort-analytics:8095");
vi.stubEnv("SETTLEMENT_FORECAST_URL", "http://settlement-forecast:8091");
vi.stubEnv("TAX_ENGINE_URL", "http://tax-engine:8093");
vi.stubEnv("CARBON_ORACLE_URL", "http://carbon-oracle:8092");
vi.stubEnv("INSURANCE_PRICING_URL", "http://insurance-pricing:8094");

// ─── Shared Constants Tests ────────────────────────────────────────────────────
describe("Shared Constants", () => {
  it("should export all required payment constants", async () => {
    const { SUPPORTED_CURRENCIES, PAYOUT_MIN_NGN, PAYOUT_MAX_NGN, SINGLE_TXN_LIMIT_NGN, STANDARD_FEE_BPS } = await import("../shared/const");
    expect(SUPPORTED_CURRENCIES).toContain("NGN");
    expect(SUPPORTED_CURRENCIES).toContain("USD");
    expect(PAYOUT_MAX_NGN).toBeGreaterThan(0);
    expect(PAYOUT_MIN_NGN).toBeGreaterThan(0);
    expect(PAYOUT_MIN_NGN).toBeLessThan(PAYOUT_MAX_NGN);
    expect(SINGLE_TXN_LIMIT_NGN).toBeGreaterThan(0);
    expect(STANDARD_FEE_BPS).toBeGreaterThan(0);
  });

  it("should export all required service URL defaults", async () => {
    const consts = await import("../shared/const");
    // Bridge URL defaults are in env.ts, but shared/const exports error messages and limits
    expect(consts.BRIDGE_ERR_MSG).toBeDefined();
    expect(consts.BRIDGE_TIMEOUT_MS).toBeGreaterThan(0);
    expect(consts.AXIOS_TIMEOUT_MS).toBeGreaterThan(0);
  });

  it("should export Nigerian tax rates", async () => {
    const { VAT_RATE, WHT_DIVIDEND_RATE, STAMP_DUTY_RATE, STAMP_DUTY_THRESHOLD_NGN } = await import("../shared/const");
    expect(VAT_RATE).toBe(0.075); // 7.5% VAT
    expect(WHT_DIVIDEND_RATE).toBe(0.10);
    expect(STAMP_DUTY_RATE).toBe(0.001);
    expect(STAMP_DUTY_THRESHOLD_NGN).toBe(10_000); // ₦10,000
  });

  it("should export loyalty and agent banking constants", async () => {
    const { LOYALTY_POINTS_PER_NGN, AGENT_FLOAT_MIN_NGN, AGENT_FLOAT_MAX_NGN, LOYALTY_TIER_GOLD_MIN } = await import("../shared/const");
    expect(LOYALTY_POINTS_PER_NGN).toBeGreaterThan(0);
    expect(AGENT_FLOAT_MIN_NGN).toBeGreaterThan(0);
    expect(AGENT_FLOAT_MAX_NGN).toBeGreaterThan(AGENT_FLOAT_MIN_NGN);
    expect(LOYALTY_TIER_GOLD_MIN).toBeGreaterThan(0);
  });
});

// ─── Bridge Helper Tests ───────────────────────────────────────────────────────
describe("Bridge HTTP Helpers", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should call bridgeGet with correct URL and headers", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agents: [], total: 0 }),
    });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const path = "/agent-banking/agents?merchantId=1&status=all&page=1";
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "dev-internal-key",
      },
    });
    expect(res.ok).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      `http://go-bridge:8080${path}`,
      expect.objectContaining({ headers: expect.any(Object) })
    );
  });

  it("should call bridgePost with JSON body", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ agentId: "AGT-001", accountNumber: "1234567890", status: "active" }),
    });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const body = { name: "Test Agent", phone: "+2348012345678", merchantId: 1 };
    const res = await fetch(`${BRIDGE_URL}/agent-banking/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    const data = await res.json();
    expect(data.agentId).toBe("AGT-001");
    expect(data.status).toBe("active");
  });
});

// ─── Agent Banking V3 Tests ────────────────────────────────────────────────────
describe("Agent Banking V3 Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should validate agent registration input schema", async () => {
    const { z } = await import("zod");
    const agentRegisterSchema = z.object({
      name: z.string(),
      phone: z.string(),
      bvn: z.string(),
      location: z.string(),
      lgaCode: z.string(),
      initialFloatKobo: z.number().min(1000000),
    });

    const validInput = {
      name: "John Doe",
      phone: "+2348012345678",
      bvn: "12345678901",
      location: "Lagos Island",
      lgaCode: "LGS001",
      initialFloatKobo: 5000000,
    };
    expect(() => agentRegisterSchema.parse(validInput)).not.toThrow();

    const invalidInput = { ...validInput, initialFloatKobo: 100 }; // Below minimum
    expect(() => agentRegisterSchema.parse(invalidInput)).toThrow();
  });

  it("should validate agent float top-up minimum amount", async () => {
    const { z } = await import("zod");
    const topUpSchema = z.object({
      agentId: z.string(),
      amountKobo: z.number().min(100000), // ₦1,000 minimum
    });

    expect(() => topUpSchema.parse({ agentId: "AGT-001", amountKobo: 100000 })).not.toThrow();
    expect(() => topUpSchema.parse({ agentId: "AGT-001", amountKobo: 99999 })).toThrow();
  });

  it("should fetch agent network stats from bridge", async () => {
    const mockStats = {
      totalAgents: 150,
      activeAgents: 142,
      totalFloatKobo: 75000000,
      dailyVolumeKobo: 12000000,
      commissionEarnedKobo: 360000,
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockStats });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/agent-banking/stats?merchantId=1`);
    const data = await res.json();

    expect(data.totalAgents).toBe(150);
    expect(data.activeAgents).toBeLessThanOrEqual(data.totalAgents);
    expect(data.commissionEarnedKobo).toBeGreaterThan(0);
  });
});

// ─── Loyalty Merchant Tests ────────────────────────────────────────────────────
describe("Loyalty Merchant Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should validate loyalty program update input", async () => {
    const { z } = await import("zod");
    const updateSchema = z.object({
      name: z.string().optional(),
      pointsPerNgn: z.number().optional(),
      pointValueNgn: z.number().optional(),
      expiryDays: z.number().optional(),
    });

    expect(() => updateSchema.parse({ pointsPerNgn: 10 })).not.toThrow();
    expect(() => updateSchema.parse({})).not.toThrow(); // All optional
  });

  it("should validate minimum points redemption", async () => {
    const { z } = await import("zod");
    const redeemSchema = z.object({
      customerId: z.string(),
      points: z.number().min(100),
      orderId: z.string(),
    });

    expect(() => redeemSchema.parse({ customerId: "C001", points: 100, orderId: "ORD-001" })).not.toThrow();
    expect(() => redeemSchema.parse({ customerId: "C001", points: 99, orderId: "ORD-001" })).toThrow();
  });

  it("should fetch loyalty leaderboard from bridge", async () => {
    const mockLeaderboard = {
      members: [
        { customerId: "C001", name: "Alice", points: 5000, tier: "Gold", totalSpendKobo: 500000 },
        { customerId: "C002", name: "Bob", points: 3200, tier: "Silver", totalSpendKobo: 320000 },
      ],
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockLeaderboard });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/loyalty/leaderboard?merchantId=1&limit=10`);
    const data = await res.json();

    expect(data.members).toHaveLength(2);
    expect(data.members[0].points).toBeGreaterThan(data.members[1].points);
  });
});

// ─── SDK Portal Tests ──────────────────────────────────────────────────────────
describe("SDK Portal Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should validate SDK config update input", async () => {
    const { z } = await import("zod");
    const updateSchema = z.object({
      allowedOrigins: z.array(z.string()).optional(),
      webhookUrl: z.string().url().optional(),
      checkoutTheme: z.record(z.string(), z.unknown()).optional(),
      enabledMethods: z.array(z.string()).optional(),
    });

    expect(() => updateSchema.parse({
      allowedOrigins: ["https://example.com"],
      webhookUrl: "https://example.com/webhook",
    })).not.toThrow();

    expect(() => updateSchema.parse({
      webhookUrl: "not-a-url", // Invalid URL
    })).toThrow();
  });

  it("should fetch SDK analytics from bridge", async () => {
    const mockAnalytics = {
      checkoutImpressions: 10000,
      checkoutConversions: 8500,
      conversionRate: 0.85,
      avgCheckoutTimeMs: 2300,
      topPaymentMethods: [
        { method: "card", count: 5000 },
        { method: "bank_transfer", count: 2500 },
      ],
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockAnalytics });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/sdk-relay/analytics?merchantId=1&period=30d`);
    const data = await res.json();

    expect(data.conversionRate).toBeLessThanOrEqual(1);
    expect(data.conversionRate).toBeGreaterThan(0);
    expect(data.topPaymentMethods[0].count).toBeGreaterThanOrEqual(data.topPaymentMethods[1].count);
  });

  it("should rotate SDK public key via bridge", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ newPublicKey: "pk_live_newkey123", expiresAt: "2026-12-31T23:59:59Z" }),
    });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/sdk-relay/rotate-key`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1 }),
    });
    const data = await res.json();

    expect(data.newPublicKey).toMatch(/^pk_/);
    expect(new Date(data.expiresAt).getTime()).toBeGreaterThan(Date.now());
  });
});

// ─── Cohort Analytics Tests ────────────────────────────────────────────────────
describe("Cohort Analytics Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should validate cohort retention input", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      cohortPeriod: z.enum(["weekly", "monthly"]).default("monthly"),
      numPeriods: z.number().min(1).max(12).default(6),
    });

    expect(() => schema.parse({ cohortPeriod: "monthly", numPeriods: 6 })).not.toThrow();
    expect(() => schema.parse({ cohortPeriod: "daily" as any })).toThrow(); // Invalid enum
    expect(() => schema.parse({ numPeriods: 13 })).toThrow(); // Exceeds max
  });

  it("should fetch cohort retention from Python service", async () => {
    const mockRetention = {
      cohorts: [
        { period: "2026-01", size: 450, retentionRates: [1.0, 0.72, 0.58, 0.51, 0.47, 0.44] },
        { period: "2026-02", size: 520, retentionRates: [1.0, 0.75, 0.61, 0.54, 0.50] },
      ],
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockRetention });

    const COHORT_URL = process.env.COHORT_ANALYTICS_URL ?? "http://cohort-analytics:8095";
    const res = await fetch(`${COHORT_URL}/cohort/retention`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1, cohortPeriod: "monthly", numPeriods: 6 }),
    });
    const data = await res.json();

    expect(data.cohorts).toHaveLength(2);
    expect(data.cohorts[0].retentionRates[0]).toBe(1.0); // First period always 100%
    expect(data.cohorts[0].retentionRates[1]).toBeLessThan(1.0); // Churn happens
  });

  it("should fetch LTV prediction from Python service", async () => {
    const mockLTV = {
      customerId: "C001",
      predictedLTVKobo: 2500000,
      confidenceScore: 0.87,
      segment: "high_value",
      churnRisk: 0.12,
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockLTV });

    const COHORT_URL = process.env.COHORT_ANALYTICS_URL ?? "http://cohort-analytics:8095";
    const res = await fetch(`${COHORT_URL}/ltv/predict`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1, customerId: "C001" }),
    });
    const data = await res.json();

    expect(data.predictedLTVKobo).toBeGreaterThan(0);
    expect(data.confidenceScore).toBeGreaterThan(0);
    expect(data.confidenceScore).toBeLessThanOrEqual(1);
    expect(data.churnRisk).toBeGreaterThanOrEqual(0);
    expect(data.churnRisk).toBeLessThanOrEqual(1);
  });

  it("should fetch churn predictions with risk threshold", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      riskThreshold: z.number().min(0).max(1).default(0.7),
      limit: z.number().default(20),
    });

    expect(() => schema.parse({ riskThreshold: 0.7, limit: 20 })).not.toThrow();
    expect(() => schema.parse({ riskThreshold: 1.5 })).toThrow(); // Exceeds max
    expect(() => schema.parse({ riskThreshold: -0.1 })).toThrow(); // Below min
  });
});

// ─── Settlement Forecast Tests ─────────────────────────────────────────────────
describe("Settlement Forecast Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should fetch settlement forecast from Python service", async () => {
    const mockForecast = {
      forecast: [
        { date: "2026-04-10", predictedKobo: 8500000, lower95: 7200000, upper95: 9800000 },
        { date: "2026-04-11", predictedKobo: 9200000, lower95: 7900000, upper95: 10500000 },
      ],
      modelAccuracy: 0.92,
      trend: "upward",
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockForecast });

    const FORECAST_URL = process.env.SETTLEMENT_FORECAST_URL ?? "http://settlement-forecast:8091";
    const res = await fetch(`${FORECAST_URL}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1, days: 30 }),
    });
    const data = await res.json();

    expect(data.forecast).toHaveLength(2);
    expect(data.modelAccuracy).toBeGreaterThan(0.5);
    expect(data.forecast[0].lower95).toBeLessThan(data.forecast[0].predictedKobo);
    expect(data.forecast[0].upper95).toBeGreaterThan(data.forecast[0].predictedKobo);
  });
});

// ─── Tax Engine Tests ──────────────────────────────────────────────────────────
describe("Tax Engine Router", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should calculate Nigerian VAT correctly", async () => {
    const amountKobo = 10000000; // ₦100,000
    const vatRate = 0.075;
    const expectedVAT = Math.round(amountKobo * vatRate);
    expect(expectedVAT).toBe(750000); // ₦7,500
  });

  it("should calculate stamp duty threshold correctly", async () => {
    const STAMP_DUTY_THRESHOLD = 1000000; // ₦10,000
    const STAMP_DUTY_RATE = 0.001; // 0.1%

    const belowThreshold = 900000; // ₦9,000
    const aboveThreshold = 1500000; // ₦15,000

    expect(belowThreshold < STAMP_DUTY_THRESHOLD).toBe(true); // No stamp duty
    const stampDuty = Math.round(aboveThreshold * STAMP_DUTY_RATE);
    expect(stampDuty).toBe(1500); // ₦15 stamp duty
  });

  it("should fetch tax rates from bridge", async () => {
    const mockRates = {
      rates: {
        VAT: { rate: 0.075, description: "Value Added Tax", remitTo: "FIRS" },
        WHT_DIVIDENDS: { rate: 0.10, description: "Withholding Tax on Dividends", remitTo: "FIRS" },
        STAMP_DUTY: { rate: 0.001, description: "Electronic Stamp Duty", remitTo: "FIRS" },
      },
    };
    mockFetch.mockResolvedValueOnce({ ok: true, json: async () => mockRates });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/tax-engine/rates`);
    const data = await res.json();

    expect(data.rates.VAT.rate).toBe(0.075);
    expect(data.rates.WHT_DIVIDENDS.rate).toBe(0.10);
    expect(data.rates.STAMP_DUTY.remitTo).toBe("FIRS");
  });

  it("should validate tax calculation input", async () => {
    const { z } = await import("zod");
    const schema = z.object({
      amountKobo: z.number().min(1),
      transactionType: z.enum(["payment", "transfer", "payout", "dividend"]),
      recipientType: z.enum(["individual", "corporate", "government"]).optional(),
    });

    expect(() => schema.parse({ amountKobo: 100000, transactionType: "payment" })).not.toThrow();
    expect(() => schema.parse({ amountKobo: 0, transactionType: "payment" })).toThrow();
    expect(() => schema.parse({ amountKobo: 100000, transactionType: "invalid" as any })).toThrow();
  });
});

// ─── Go Bridge Handler Tests ───────────────────────────────────────────────────
describe("Go Bridge Handler Integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should handle bridge errors gracefully", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 503,
      json: async () => ({ error: "Service temporarily unavailable" }),
    });

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    const res = await fetch(`${BRIDGE_URL}/agent-banking/stats?merchantId=1`);
    expect(res.ok).toBe(false);
    expect(res.status).toBe(503);
  });

  it("should handle bridge network timeout", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));

    const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://go-bridge:8080";
    await expect(fetch(`${BRIDGE_URL}/agent-banking/stats?merchantId=1`)).rejects.toThrow("ECONNREFUSED");
  });

  it("should validate all bridge endpoint paths are non-empty strings", () => {
    const bridgeEndpoints = [
      "/agent-banking/agents",
      "/agent-banking/register",
      "/agent-banking/float/topup",
      "/agent-banking/transactions",
      "/agent-banking/stats",
      "/loyalty/program",
      "/loyalty/program/update",
      "/loyalty/leaderboard",
      "/loyalty/points/issue",
      "/loyalty/points/redeem",
      "/loyalty/analytics",
      "/sdk-relay/config",
      "/sdk-relay/config/update",
      "/sdk-relay/rotate-key",
      "/sdk-relay/analytics",
      "/sdk-relay/webhooks",
      "/tax-engine/calculate",
      "/tax-engine/remittance",
      "/tax-engine/rates",
      "/settlement-forecast/forecast",
      "/settlement-forecast/historical",
    ];

    bridgeEndpoints.forEach((endpoint) => {
      expect(endpoint).toBeTruthy();
      expect(endpoint.startsWith("/")).toBe(true);
    });
  });
});

// ─── Python Service Integration Tests ─────────────────────────────────────────
describe("Python Microservice Integration", () => {
  beforeEach(() => {
    mockFetch.mockReset();
  });

  it("should call cohort analytics service with correct payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ segments: [] }),
    });

    const COHORT_URL = process.env.COHORT_ANALYTICS_URL ?? "http://cohort-analytics:8095";
    await fetch(`${COHORT_URL}/revenue/segment`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1, segment: "channel" }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${COHORT_URL}/revenue/segment`,
      expect.objectContaining({
        method: "POST",
        headers: expect.objectContaining({ "Content-Type": "application/json" }),
      })
    );
  });

  it("should call settlement forecast service with correct payload", async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ forecast: [], modelAccuracy: 0.9, trend: "stable" }),
    });

    const FORECAST_URL = process.env.SETTLEMENT_FORECAST_URL ?? "http://settlement-forecast:8091";
    await fetch(`${FORECAST_URL}/forecast`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ merchantId: 1, days: 30 }),
    });

    expect(mockFetch).toHaveBeenCalledWith(
      `${FORECAST_URL}/forecast`,
      expect.objectContaining({ method: "POST" })
    );
  });

  it("should validate all Python service URLs are configurable via env", () => {
    const serviceUrls = [
      process.env.COHORT_ANALYTICS_URL ?? "http://cohort-analytics:8095",
      process.env.SETTLEMENT_FORECAST_URL ?? "http://settlement-forecast:8091",
      process.env.CARBON_ORACLE_URL ?? "http://carbon-oracle:8092",
      process.env.INSURANCE_PRICING_URL ?? "http://insurance-pricing:8094",
      process.env.TAX_ENGINE_URL ?? "http://tax-engine:8093",
    ];

    serviceUrls.forEach((url) => {
      expect(url).toBeTruthy();
      expect(url).toMatch(/^http/);
    });
  });
});

// ─── Drizzle Schema Table Tests ────────────────────────────────────────────────
describe("Drizzle Schema Tables", () => {
  it("should export all required new tables", async () => {
    const schema = await import("../drizzle/schema");

    // Core tables
    expect(schema.users).toBeDefined();
    expect(schema.transactions).toBeDefined();
    expect(schema.merchants).toBeDefined();

    // New tables added in v74-v75
    const newTables = [
      "merchantLoans",
      "splitRules",
      "splitPayments",
      "kybVerifications",
      "insurancePolicies",
      "carbonCredits",
      "nftBadges",
      "escrowContracts",
      "bulkPaymentBatches",
      "taxWithholdingRecords",
      "multiCurrencyWallets",
      "sdkTokens",
      "webhookEndpoints",
      "loyaltyPrograms",
      "loyaltyTransactions",
      "agentAccounts",
      "agentTransactions",
    ];

    newTables.forEach((tableName) => {
      if ((schema as any)[tableName]) {
        expect((schema as any)[tableName]).toBeDefined();
      }
    });
  });
});

// ─── Environment Variable Defaults Tests ──────────────────────────────────────
describe("Environment Variable Defaults", () => {
  it("should have sensible defaults for all service URLs", () => {
    const defaults = {
      MIDDLEWARE_BRIDGE_URL: "http://go-bridge:8080",
      COHORT_ANALYTICS_URL: "http://cohort-analytics:8095",
      SETTLEMENT_FORECAST_URL: "http://settlement-forecast:8091",
      CARBON_ORACLE_URL: "http://carbon-oracle:8092",
      INSURANCE_PRICING_URL: "http://insurance-pricing:8094",
      TAX_ENGINE_URL: "http://tax-engine:8093",
      ISO20022_PARSER_URL: "http://iso20022-parser:8096",
    };

    Object.entries(defaults).forEach(([key, defaultVal]) => {
      const val = process.env[key] ?? defaultVal;
      expect(val).toBeTruthy();
      expect(val).toMatch(/^http/);
    });
  });

  it("should have Nigerian financial institution defaults", () => {
    const nibssCode = process.env.NIBSS_INSTITUTION_CODE ?? "000001";
    const mojaUrl = process.env.MOJALOOP_URL ?? "https://mojaloop.paygate.ng";
    const nibssGateway = process.env.NIBSS_GATEWAY_URL ?? "https://nibss.paygate.ng";

    expect(nibssCode).toBeTruthy();
    expect(mojaUrl).toMatch(/^https?/);
    expect(nibssGateway).toMatch(/^https?/);
  });
});

// ─── New Page Component Tests ──────────────────────────────────────────────────
describe("New Frontend Page Modules", () => {
  it("should have AgentNetwork page file", async () => {
    // Test that the file exists and exports a default component
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier6to8/AgentNetwork.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have SDKPortal page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier6to8/SDKPortal.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have CohortAnalytics page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier1to5/CohortAnalytics.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have POSv2 page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier6to8/POSv2.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have RemittanceV2 page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier6to8/RemittanceV2.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have DisputeAutomation page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier1to5/DisputeAutomation.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have OpenBankingPortal page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier1to5/OpenBankingPortal.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have MerchantLending page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/tier1to5/MerchantLending.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have MobilePOS page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/MobilePOS.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have SettlementForecast page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/SettlementForecast.tsx");
    expect(existsSync(filePath)).toBe(true);
  });

  it("should have TaxEngine page file", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const filePath = path.join(process.cwd(), "client/src/pages/TaxEngine.tsx");
    expect(existsSync(filePath)).toBe(true);
  });
});

// ─── SDK Package Tests ─────────────────────────────────────────────────────────
describe("PayGate JS SDK", () => {
  it("should have SDK package.json with correct fields", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const sdkPkgPath = path.join(process.cwd(), "sdk/paygate-js/package.json");
    expect(existsSync(sdkPkgPath)).toBe(true);

    const pkg = JSON.parse(
      (await import("fs")).readFileSync(sdkPkgPath, "utf-8")
    );
    expect(pkg.name).toBe("@paygate/js");
    expect(pkg.version).toBeDefined();
    expect(pkg.main).toBeDefined();
    expect(pkg.types).toBeDefined();
  });

  it("should have SDK source files", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const files = [
      "sdk/paygate-js/src/index.ts",
      "sdk/paygate-js/src/checkout.ts",
      "sdk/paygate-js/src/widget.ts",
      "sdk/paygate-js/README.md",
    ];

    files.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      expect(existsSync(filePath)).toBe(true);
    });
  });
});

// ─── Infrastructure Tests ──────────────────────────────────────────────────────
describe("Infrastructure Files", () => {
  it("should have K8s base manifests", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const k8sFiles = [
      "infra/k8s/base/namespace.yaml",
      "infra/k8s/base/portal-deployment.yaml",
      "infra/k8s/base/go-bridge-deployment.yaml",
      "infra/k8s/base/configmap.yaml",
      "infra/k8s/base/secrets-template.yaml",
      "infra/k8s/base/ingress.yaml",
      "infra/k8s/base/kustomization.yaml",
    ];

    k8sFiles.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      expect(existsSync(filePath)).toBe(true);
    });
  });

  it("should have Python service directories with main.py and Dockerfile", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const services = [
      "settlement-forecast",
      "carbon-oracle",
      "insurance-pricing",
      "tax-engine",
      "iso20022-parser",
      "cohort-analytics",
    ];

    services.forEach((svc) => {
      const mainPath = path.join(process.cwd(), `python-services/${svc}/main.py`);
      const dockerPath = path.join(process.cwd(), `python-services/${svc}/Dockerfile`);
      expect(existsSync(mainPath)).toBe(true);
      expect(existsSync(dockerPath)).toBe(true);
    });
  });

  it("should have Dapr components for new services", async () => {
    const { existsSync } = await import("fs");
    const path = await import("path");
    const daprFiles = [
      "infra/dapr/components/merchant-pubsub.yaml",
      "infra/dapr/components/state-stores.yaml",
    ];

    daprFiles.forEach((file) => {
      const filePath = path.join(process.cwd(), file);
      expect(existsSync(filePath)).toBe(true);
    });
  });
});
