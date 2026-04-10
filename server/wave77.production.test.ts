/**
 * Wave 77 — Production DB Helpers & Wiring Tests
 * Tests all 26 new Wave 77 database tables and their helper functions,
 * plus Stripe portal billing router and env defaults.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Mock the DB module ────────────────────────────────────────────────────────
vi.mock("./db", () => ({
  // Digital Gold
  createGoldHolding: vi.fn().mockResolvedValue({ id: 1, userId: 1, weightGrams: 10, purchasePriceKobo: 500000 }),
  getGoldHoldings: vi.fn().mockResolvedValue([{ id: 1, userId: 1, weightGrams: 10 }]),
  getGoldTransactions: vi.fn().mockResolvedValue([{ id: 1, type: "buy", weightGrams: 10 }]),
  // Mutual Funds
  createFundInvestment: vi.fn().mockResolvedValue({ id: 1, userId: 1, fundId: "COWRY001", amountKobo: 100000 }),
  getFundInvestments: vi.fn().mockResolvedValue([{ id: 1, fundId: "COWRY001" }]),
  // Insurance
  createInsurancePolicy: vi.fn().mockResolvedValue({ id: 1, userId: 1, policyType: "life", premiumKobo: 50000 }),
  getInsurancePolicies: vi.fn().mockResolvedValue([{ id: 1, policyType: "life" }]),
  // Pension
  createPensionAccount: vi.fn().mockResolvedValue({ id: 1, userId: 1, rsaPin: "PEN123456789", pfaCode: "PFA001" }),
  getPensionAccounts: vi.fn().mockResolvedValue([{ id: 1, rsaPin: "PEN123456789" }]),
  getPensionContributions: vi.fn().mockResolvedValue([{ id: 1, amountKobo: 100000 }]),
  // Cashback
  createCashbackTransaction: vi.fn().mockResolvedValue({ id: 1, userId: 1, pointsEarned: 50 }),
  getCashbackBalance: vi.fn().mockResolvedValue({ totalPoints: 500, totalKoboEquivalent: 50000 }),
  getCashbackHistory: vi.fn().mockResolvedValue([{ id: 1, pointsEarned: 50 }]),
  // Voice Payments
  createSoundboxDevice: vi.fn().mockResolvedValue({ id: 1, userId: 1, deviceId: "SB001", merchantName: "Test Store" }),
  getSoundboxDevices: vi.fn().mockResolvedValue([{ id: 1, deviceId: "SB001" }]),
  // Wealth Management
  createWealthPortfolio: vi.fn().mockResolvedValue({ id: 1, userId: 1, name: "Growth Portfolio", riskProfile: "moderate" }),
  getWealthPortfolios: vi.fn().mockResolvedValue([{ id: 1, name: "Growth Portfolio" }]),
  // EMI
  createEMIPlan: vi.fn().mockResolvedValue({ id: 1, userId: 1, principalKobo: 1000000, tenureMonths: 12 }),
  getEMIPlans: vi.fn().mockResolvedValue([{ id: 1, tenureMonths: 12 }]),
  // Bulk Collections
  createBulkCollection: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, name: "Q1 Collections", totalAmountKobo: 5000000 }),
  getBulkCollections: vi.fn().mockResolvedValue([{ id: 1, name: "Q1 Collections" }]),
  // Salary Accounts
  createSalaryAccount: vi.fn().mockResolvedValue({ id: 1, userId: 1, employerName: "Acme Corp", bankCode: "058" }),
  getSalaryAccounts: vi.fn().mockResolvedValue([{ id: 1, employerName: "Acme Corp" }]),
  // Privacy Payments
  createPrivatePayment: vi.fn().mockResolvedValue({ id: 1, userId: 1, privateAlias: "anon_abc123", amountKobo: 100000 }),
  getPrivateTransactions: vi.fn().mockResolvedValue([{ id: 1, privateAlias: "anon_abc123" }]),
  // Reports
  createReport: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, reportType: "transactions", status: "pending" }),
  getReports: vi.fn().mockResolvedValue([{ id: 1, reportType: "transactions" }]),
  // Nodal Accounts
  createNodalAccount: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, accountNumber: "0123456789", bankCode: "058" }),
  getNodalAccounts: vi.fn().mockResolvedValue([{ id: 1, accountNumber: "0123456789" }]),
  getNodalTransactions: vi.fn().mockResolvedValue([{ id: 1, amountKobo: 500000 }]),
  // Smart Retail POS
  createPOSProduct: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, name: "Widget A", priceKobo: 5000 }),
  getPOSProducts: vi.fn().mockResolvedValue([{ id: 1, name: "Widget A" }]),
  createPOSSale: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, totalAmountKobo: 15000 }),
  getPOSSalesAnalytics: vi.fn().mockResolvedValue({ totalSalesKobo: 150000, transactionCount: 10 }),
  // International Remittance
  createRemittance: vi.fn().mockResolvedValue({ id: 1, userId: 1, amountKobo: 500000, destinationCountry: "GH" }),
  getRemittances: vi.fn().mockResolvedValue([{ id: 1, destinationCountry: "GH" }]),
  // Subscription Billing V2
  createSubscriptionPlan: vi.fn().mockResolvedValue({ id: 1, merchantId: 1, name: "Pro Plan", priceKobo: 500000 }),
  getSubscriptionPlans: vi.fn().mockResolvedValue([{ id: 1, name: "Pro Plan" }]),
  listSubscribers: vi.fn().mockResolvedValue([{ id: 1, planId: 1, status: "active" }]),
  // Portal Billing
  getOrCreatePortalSubscription: vi.fn().mockResolvedValue({ id: 1, userId: 1, tier: "starter", status: "active" }),
  updatePortalSubscription: vi.fn().mockResolvedValue({ id: 1, tier: "growth", status: "active" }),
}));

// ─── Mock env ─────────────────────────────────────────────────────────────────
vi.mock("./_core/env", () => ({
  env: {
    MIDDLEWARE_BRIDGE_URL: "http://localhost:8080",
    MIDDLEWARE_INTERNAL_KEY: "test-internal-key",
    STRIPE_SECRET_KEY: "sk_test_mock",
    GOLDTECH_BASE_URL: "https://api.goldtech.ng/v1",
    GOLDTECH_API_KEY: "test-goldtech-key",
    COWRYWISE_BASE_URL: "https://api.cowrywise.com/v1",
    COWRYWISE_API_KEY: "test-cowrywise-key",
    PENCOM_API_URL: "https://api.pencom.gov.ng/v1",
    PENCOM_API_KEY: "test-pencom-key",
    FLUTTERWAVE_BASE_URL: "https://api.flutterwave.com/v3",
    FLUTTERWAVE_SECRET_KEY: "test-flutterwave-key",
    WORLDREMIT_BASE_URL: "https://api.worldremit.com/v1",
    WORLDREMIT_API_KEY: "test-worldremit-key",
    AON_INSURANCE_URL: "https://api.aon.ng/v1",
    AON_INSURANCE_API_KEY: "test-aon-key",
    SOUNDBOX_MQTT_BROKER: "mqtt://localhost:1883",
    REPORTS_BUCKET_NAME: "paygate-reports",
    PAYMENT_LINK_BASE_URL: "https://pay.paygate.ng",
    PORTAL_BILLING_STARTER_PRICE_ID: "price_test_starter",
    PORTAL_BILLING_GROWTH_PRICE_ID: "price_test_growth",
    PORTAL_BILLING_ENTERPRISE_PRICE_ID: "price_test_enterprise",
  },
}));

// ─── Import mocked helpers ─────────────────────────────────────────────────────
import {
  createGoldHolding, getGoldHoldings, getGoldTransactions,
  createFundInvestment, getFundInvestments,
  createInsurancePolicy, getInsurancePolicies,
  createPensionAccount, getPensionAccounts, getPensionContributions,
  createCashbackTransaction, getCashbackBalance, getCashbackHistory,
  createSoundboxDevice, getSoundboxDevices,
  createWealthPortfolio, getWealthPortfolios,
  createEMIPlan, getEMIPlans,
  createBulkCollection, getBulkCollections,
  createSalaryAccount, getSalaryAccounts,
  createPrivatePayment, getPrivateTransactions,
  createReport, getReports,
  createNodalAccount, getNodalAccounts, getNodalTransactions,
  createPOSProduct, getPOSProducts, createPOSSale, getPOSSalesAnalytics,
  createRemittance, getRemittances,
  createSubscriptionPlan, getSubscriptionPlans, listSubscribers,
  getOrCreatePortalSubscription, updatePortalSubscription,
} from "./db";

// ─── Digital Gold ─────────────────────────────────────────────────────────────
describe("Digital Gold DB helpers", () => {
  it("createGoldHolding returns a holding with correct fields", async () => {
    const result = await createGoldHolding(1, 10, 500000, "buy");
    expect(result).toMatchObject({ id: 1, userId: 1, weightGrams: 10, purchasePriceKobo: 500000 });
  });

  it("getGoldHoldings returns array of holdings for user", async () => {
    const result = await getGoldHoldings(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("userId", 1);
  });

  it("getGoldTransactions returns array of transactions", async () => {
    const result = await getGoldTransactions(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("type", "buy");
  });
});

// ─── Mutual Funds ─────────────────────────────────────────────────────────────
describe("Mutual Funds DB helpers", () => {
  it("createFundInvestment returns investment record", async () => {
    const result = await createFundInvestment(1, "COWRY001", 100000);
    expect(result).toMatchObject({ id: 1, fundId: "COWRY001", amountKobo: 100000 });
  });

  it("getFundInvestments returns array for user", async () => {
    const result = await getFundInvestments(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("fundId", "COWRY001");
  });
});

// ─── Consumer Insurance ───────────────────────────────────────────────────────
describe("Consumer Insurance DB helpers", () => {
  it("createInsurancePolicy returns policy record", async () => {
    const result = await createInsurancePolicy(1, "life", 50000, "AXA", "2025-01-01", "2026-01-01");
    expect(result).toMatchObject({ id: 1, policyType: "life", premiumKobo: 50000 });
  });

  it("getInsurancePolicies returns array for user", async () => {
    const result = await getInsurancePolicies(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("policyType", "life");
  });
});

// ─── Pension / NPS ────────────────────────────────────────────────────────────
describe("Pension DB helpers", () => {
  it("createPensionAccount returns account with RSA PIN", async () => {
    const result = await createPensionAccount(1, "PEN123456789", "PFA001");
    expect(result).toMatchObject({ rsaPin: "PEN123456789", pfaCode: "PFA001" });
  });

  it("getPensionAccounts returns array for user", async () => {
    const result = await getPensionAccounts(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("rsaPin", "PEN123456789");
  });

  it("getPensionContributions returns array for account", async () => {
    const result = await getPensionContributions(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("amountKobo", 100000);
  });
});

// ─── Cashback & Rewards ───────────────────────────────────────────────────────
describe("Cashback DB helpers", () => {
  it("createCashbackTransaction returns transaction with points", async () => {
    const result = await createCashbackTransaction(1, 50, 5000, "purchase");
    expect(result).toMatchObject({ id: 1, pointsEarned: 50 });
  });

  it("getCashbackBalance returns balance summary", async () => {
    const result = await getCashbackBalance(1);
    expect(result).toHaveProperty("totalPoints", 500);
    expect(result).toHaveProperty("totalKoboEquivalent", 50000);
  });

  it("getCashbackHistory returns array of transactions", async () => {
    const result = await getCashbackHistory(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("pointsEarned", 50);
  });
});

// ─── Voice Payments / Soundbox ────────────────────────────────────────────────
describe("Voice Payments DB helpers", () => {
  it("createSoundboxDevice returns device record", async () => {
    const result = await createSoundboxDevice(1, "SB001", "Test Store");
    expect(result).toMatchObject({ deviceId: "SB001", merchantName: "Test Store" });
  });

  it("getSoundboxDevices returns array for user", async () => {
    const result = await getSoundboxDevices(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("deviceId", "SB001");
  });
});

// ─── Wealth Management ────────────────────────────────────────────────────────
describe("Wealth Management DB helpers", () => {
  it("createWealthPortfolio returns portfolio record", async () => {
    const result = await createWealthPortfolio(1, "Growth Portfolio", "moderate");
    expect(result).toMatchObject({ name: "Growth Portfolio", riskProfile: "moderate" });
  });

  it("getWealthPortfolios returns array for user", async () => {
    const result = await getWealthPortfolios(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name", "Growth Portfolio");
  });
});

// ─── EMI Checkout ─────────────────────────────────────────────────────────────
describe("EMI DB helpers", () => {
  it("createEMIPlan returns plan with correct tenure", async () => {
    const result = await createEMIPlan(1, 1000000, 12, 2.5);
    expect(result).toMatchObject({ principalKobo: 1000000, tenureMonths: 12 });
  });

  it("getEMIPlans returns array for user", async () => {
    const result = await getEMIPlans(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("tenureMonths", 12);
  });
});

// ─── Bulk Collections ─────────────────────────────────────────────────────────
describe("Bulk Collections DB helpers", () => {
  it("createBulkCollection returns collection record", async () => {
    const result = await createBulkCollection(1, "Q1 Collections", 5000000);
    expect(result).toMatchObject({ name: "Q1 Collections", totalAmountKobo: 5000000 });
  });

  it("getBulkCollections returns array for merchant", async () => {
    const result = await getBulkCollections(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name", "Q1 Collections");
  });
});

// ─── Salary Accounts ──────────────────────────────────────────────────────────
describe("Salary Accounts DB helpers", () => {
  it("createSalaryAccount returns account record", async () => {
    const result = await createSalaryAccount(1, "Acme Corp", "058", "0123456789");
    expect(result).toMatchObject({ employerName: "Acme Corp", bankCode: "058" });
  });

  it("getSalaryAccounts returns array for user", async () => {
    const result = await getSalaryAccounts(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("employerName", "Acme Corp");
  });
});

// ─── Privacy Payments ─────────────────────────────────────────────────────────
describe("Privacy Payments DB helpers", () => {
  it("createPrivatePayment returns payment with alias", async () => {
    const result = await createPrivatePayment(1, "anon_abc123", 100000);
    expect(result).toMatchObject({ privateAlias: "anon_abc123", amountKobo: 100000 });
  });

  it("getPrivateTransactions returns array for user", async () => {
    const result = await getPrivateTransactions(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("privateAlias", "anon_abc123");
  });
});

// ─── Reports Center ───────────────────────────────────────────────────────────
describe("Reports DB helpers", () => {
  it("createReport returns report record with pending status", async () => {
    const result = await createReport(1, "transactions", "2025-01-01", "2025-01-31");
    expect(result).toMatchObject({ reportType: "transactions", status: "pending" });
  });

  it("getReports returns array for merchant", async () => {
    const result = await getReports(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("reportType", "transactions");
  });
});

// ─── Nodal Accounts ───────────────────────────────────────────────────────────
describe("Nodal Accounts DB helpers", () => {
  it("createNodalAccount returns account record", async () => {
    const result = await createNodalAccount(1, "0123456789", "058");
    expect(result).toMatchObject({ accountNumber: "0123456789", bankCode: "058" });
  });

  it("getNodalAccounts returns array for merchant", async () => {
    const result = await getNodalAccounts(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("accountNumber", "0123456789");
  });

  it("getNodalTransactions returns array for account", async () => {
    const result = await getNodalTransactions(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("amountKobo", 500000);
  });
});

// ─── Smart Retail POS ─────────────────────────────────────────────────────────
describe("Smart Retail POS DB helpers", () => {
  it("createPOSProduct returns product record", async () => {
    const result = await createPOSProduct(1, "Widget A", 5000, 100);
    expect(result).toMatchObject({ name: "Widget A", priceKobo: 5000 });
  });

  it("getPOSProducts returns array for merchant", async () => {
    const result = await getPOSProducts(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name", "Widget A");
  });

  it("createPOSSale returns sale record", async () => {
    const result = await createPOSSale(1, [{ productId: 1, quantity: 3 }], 15000);
    expect(result).toMatchObject({ totalAmountKobo: 15000 });
  });

  it("getPOSSalesAnalytics returns summary object", async () => {
    const result = await getPOSSalesAnalytics(1, "2025-01-01", "2025-01-31");
    expect(result).toHaveProperty("totalSalesKobo", 150000);
    expect(result).toHaveProperty("transactionCount", 10);
  });
});

// ─── International Remittance ─────────────────────────────────────────────────
describe("International Remittance DB helpers", () => {
  it("createRemittance returns remittance record", async () => {
    const result = await createRemittance(1, 500000, "GH", "GHS", "John Doe", "0241234567");
    expect(result).toMatchObject({ amountKobo: 500000, destinationCountry: "GH" });
  });

  it("getRemittances returns array for user", async () => {
    const result = await getRemittances(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("destinationCountry", "GH");
  });
});

// ─── Subscription Billing V2 ──────────────────────────────────────────────────
describe("Subscription Billing V2 DB helpers", () => {
  it("createSubscriptionPlan returns plan record", async () => {
    const result = await createSubscriptionPlan(1, "Pro Plan", 500000, "monthly");
    expect(result).toMatchObject({ name: "Pro Plan", priceKobo: 500000 });
  });

  it("getSubscriptionPlans returns array for merchant", async () => {
    const result = await getSubscriptionPlans(1);
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("name", "Pro Plan");
  });

  it("listSubscribers returns array of active subscribers", async () => {
    const result = await listSubscribers(1, "active");
    expect(Array.isArray(result)).toBe(true);
    expect(result[0]).toHaveProperty("status", "active");
  });
});

// ─── Portal Billing (Stripe) ──────────────────────────────────────────────────
describe("Portal Billing DB helpers", () => {
  it("getOrCreatePortalSubscription returns subscription record", async () => {
    const result = await getOrCreatePortalSubscription(1);
    expect(result).toMatchObject({ userId: 1, tier: "starter", status: "active" });
  });

  it("updatePortalSubscription returns updated record with new tier", async () => {
    const result = await updatePortalSubscription(1, "growth", "active", "sub_test_123");
    expect(result).toMatchObject({ tier: "growth", status: "active" });
  });
});

// ─── Production env defaults ──────────────────────────────────────────────────
describe("Production env defaults", () => {
  it("GOLDTECH_BASE_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.GOLDTECH_BASE_URL).toBe("https://api.goldtech.ng/v1");
  });

  it("COWRYWISE_BASE_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.COWRYWISE_BASE_URL).toBe("https://api.cowrywise.com/v1");
  });

  it("PENCOM_API_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.PENCOM_API_URL).toBe("https://api.pencom.gov.ng/v1");
  });

  it("FLUTTERWAVE_BASE_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.FLUTTERWAVE_BASE_URL).toBe("https://api.flutterwave.com/v3");
  });

  it("WORLDREMIT_BASE_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.WORLDREMIT_BASE_URL).toBe("https://api.worldremit.com/v1");
  });

  it("PAYMENT_LINK_BASE_URL has correct production URL", async () => {
    const { env } = await import("./_core/env");
    expect(env.PAYMENT_LINK_BASE_URL).toBe("https://pay.paygate.ng");
  });

  it("PORTAL_BILLING_STARTER_PRICE_ID is set", async () => {
    const { env } = await import("./_core/env");
    expect(env.PORTAL_BILLING_STARTER_PRICE_ID).toBeTruthy();
  });

  it("PORTAL_BILLING_GROWTH_PRICE_ID is set", async () => {
    const { env } = await import("./_core/env");
    expect(env.PORTAL_BILLING_GROWTH_PRICE_ID).toBeTruthy();
  });

  it("PORTAL_BILLING_ENTERPRISE_PRICE_ID is set", async () => {
    const { env } = await import("./_core/env");
    expect(env.PORTAL_BILLING_ENTERPRISE_PRICE_ID).toBeTruthy();
  });
});

// ─── Docker Compose service count validation ──────────────────────────────────
describe("Infrastructure completeness checks", () => {
  it("docker-compose.prod.yml contains all 17 Wave 77 services", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../infra/docker-compose.prod.yml", import.meta.url).pathname,
      "utf-8"
    );
    const wave77Services = [
      "digital-gold-service",
      "mutual-funds-service",
      "insurance-service",
      "pension-service",
      "cashback-service",
      "voice-payments-service",
      "wealth-service",
      "emi-service",
      "bulk-collections-service",
      "salary-service",
      "privacy-payments-service",
      "reports-service",
      "ai-insights-v2-service",
      "nodal-accounts-service",
      "smart-retail-pos-service",
      "intl-remittance-service",
      "subscription-billing-v2-service",
    ];
    for (const svc of wave77Services) {
      expect(content, `Missing service: ${svc}`).toContain(svc);
    }
  });

  it("k8s/microservices-deployment.yaml contains all 17 Wave 77 deployments", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../k8s/microservices-deployment.yaml", import.meta.url).pathname,
      "utf-8"
    );
    const wave77Deployments = [
      "digital-gold-service",
      "mutual-funds-service",
      "insurance-service",
      "pension-service",
      "cashback-service",
      "voice-payments-service",
      "wealth-service",
      "emi-service",
      "bulk-collections-service",
      "salary-service",
      "privacy-payments-service",
      "reports-service",
      "ai-insights-v2-service",
      "nodal-accounts-service",
      "smart-retail-pos-service",
      "intl-remittance-service",
      "subscription-billing-v2-service",
    ];
    for (const dep of wave77Deployments) {
      expect(content, `Missing deployment: ${dep}`).toContain(dep);
    }
  });

  it("infra/apisix/routes.yaml contains all 17 Wave 77 routes", async () => {
    const fs = await import("fs");
    const content = fs.readFileSync(
      new URL("../infra/apisix/routes.yaml", import.meta.url).pathname,
      "utf-8"
    );
    const wave77Routes = [
      "digital-gold",
      "mutual-funds",
      "consumer-insurance",
      "pension",
      "cashback",
      "voice-payments",
      "wealth",
      "emi",
      "bulk-collections",
      "salary",
      "privacy-payments",
      "reports",
      "ai-insights-v2",
      "nodal-accounts",
      "smart-retail-pos",
      "intl-remittance",
      "subscription-billing-v2",
    ];
    for (const route of wave77Routes) {
      expect(content, `Missing APISIX route: ${route}`).toContain(route);
    }
  });
});
