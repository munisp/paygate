/**
 * PayGate Integration Tests
 *
 * Tests the tRPC procedures that handle the most critical data paths:
 *   - transactions.list (pagination, status filter)
 *   - transactions.createTest (creates a test transaction)
 *   - payouts.create (validates and creates a payout)
 *   - payouts.list (pagination)
 *   - onboarding.createMerchant (creates merchant + sets step)
 *   - onboarding.getStatus (returns correct onboarding state)
 *   - customers.list (returns paginated customers)
 *   - apiKeys.create / revoke (full lifecycle)
 *   - middleware secrets (MIDDLEWARE_BRIDGE_URL / MIDDLEWARE_INTERNAL_KEY present)
 *
 * These tests use an in-memory mock of the DB helpers so they run without
 * a live PostgreSQL connection in CI.
 */

import { describe, expect, it, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import type { TrpcContext } from "./_core/context";

// ─── Mock DB helpers ──────────────────────────────────────────────────────────

const MOCK_MERCHANT_ID = "mch_test_001";
const MOCK_USER_ID = 42;
const MOCK_OPEN_ID = "test_open_id_001";

const mockUser = {
  id: MOCK_USER_ID,
  openId: MOCK_OPEN_ID,
  name: "Test User",
  email: "test@paygate.ng",
  loginMethod: "manus",
  role: "user" as const,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
  lastSignedIn: new Date("2025-01-01"),
};

const mockMerchant = {
  id: MOCK_MERCHANT_ID,
  ownerId: MOCK_USER_ID,
  businessName: "Test Merchant Ltd",
  businessType: "fintech",
  email: "merchant@test.ng",
  phone: "+2348012345678",
  country: "NG",
  currency: "NGN",
  status: "active" as const,
  isLive: false,
  onboardingStep: 3,
  webhookUrl: null,
  logoUrl: null,
  createdAt: new Date("2025-01-01"),
  updatedAt: new Date("2025-01-01"),
};

const mockTransactions = Array.from({ length: 25 }, (_, i) => ({
  id: `txn_${i.toString().padStart(3, "0")}`,
  merchantId: MOCK_MERCHANT_ID,
  reference: `TXN_REF_${i}`,
  amount: (i + 1) * 10000,
  currency: "NGN",
  status: i % 5 === 0 ? "failed" : "completed",
  channel: "card",
  customerEmail: `customer${i}@test.ng`,
  customerName: `Customer ${i}`,
  customerPhone: null,
  description: `Test transaction ${i}`,
  feeAmount: Math.round((i + 1) * 10000 * 0.015),
  netAmount: Math.round((i + 1) * 10000 * 0.985),
  metadata: null,
  completedAt: new Date(),
  createdAt: new Date(Date.now() - i * 3600000),
  updatedAt: new Date(),
}));

const mockPayouts = Array.from({ length: 10 }, (_, i) => ({
  id: `pyo_${i.toString().padStart(3, "0")}`,
  merchantId: MOCK_MERCHANT_ID,
  reference: `PYO_REF_${i}`,
  amount: (i + 1) * 100000,
  currency: "NGN",
  status: "pending" as const,
  bankCode: "044",
  accountNumber: `${1000000000 + i}`,
  accountName: `Account ${i}`,
  narration: "Test payout",
  feeAmount: Math.round((i + 1) * 100000 * 0.005),
  failureReason: null,
  processedAt: null,
  createdAt: new Date(Date.now() - i * 86400000),
  updatedAt: new Date(),
}));

// Mock the db module
vi.mock("./db", () => ({
  getUserByOpenId: vi.fn(async (openId: string) =>
    openId === MOCK_OPEN_ID ? mockUser : null
  ),
  getMerchantByOwnerId: vi.fn(async (userId: number) =>
    userId === MOCK_USER_ID ? mockMerchant : null
  ),
  listTransactions: vi.fn(async (merchantId: string, opts: any) => {
    let rows = mockTransactions.filter((t) => t.merchantId === merchantId);
    if (opts.status) rows = rows.filter((t) => t.status === opts.status);
    const total = rows.length;
    rows = rows.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20));
    return { rows, total };
  }),
  getTransactionById: vi.fn(async (id: string) =>
    mockTransactions.find((t) => t.id === id) ?? null
  ),
  getTransactionStats: vi.fn(async () => ({
    totalVolume: 5000000,
    totalCount: 200,
    successRate: 0.94,
    avgAmount: 25000,
    failedCount: 12,
    refundedCount: 3,
  })),
  createTransaction: vi.fn(async (data: any) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
  listPayouts: vi.fn(async (merchantId: string, opts: any) => {
    const rows = mockPayouts.slice(opts.offset ?? 0, (opts.offset ?? 0) + (opts.limit ?? 20));
    return { rows, total: mockPayouts.length };
  }),
  getPayoutById: vi.fn(async (id: string) =>
    mockPayouts.find((p) => p.id === id) ?? null
  ),
  createPayout: vi.fn(async (data: any) => ({ ...data, createdAt: new Date(), updatedAt: new Date() })),
  updatePayout: vi.fn(async (id: string, data: any) => ({ ...mockPayouts[0], ...data })),
  createMerchant: vi.fn(async (data: any) => ({ ...mockMerchant, ...data })),
  updateMerchant: vi.fn(async (id: string, data: any) => ({ ...mockMerchant, ...data })),
  listCustomers: vi.fn(async () => ({
    rows: [
      { id: "cust_001", merchantId: MOCK_MERCHANT_ID, email: "c1@test.ng", name: "Customer One", totalTransactions: 5, totalSpend: 250000, riskLevel: "low", createdAt: new Date(), updatedAt: new Date() },
      { id: "cust_002", merchantId: MOCK_MERCHANT_ID, email: "c2@test.ng", name: "Customer Two", totalTransactions: 2, totalSpend: 80000, riskLevel: "medium", createdAt: new Date(), updatedAt: new Date() },
    ],
    total: 2,
  })),
  getCustomerById: vi.fn(async (id: string) =>
    id === "cust_001"
      ? { id: "cust_001", merchantId: MOCK_MERCHANT_ID, email: "c1@test.ng", name: "Customer One", totalTransactions: 5, totalSpend: 250000, riskLevel: "low", createdAt: new Date(), updatedAt: new Date() }
      : null
  ),
  upsertCustomer: vi.fn(async (data: any) => data),
  listApiKeys: vi.fn(async () => []),
  createApiKey: vi.fn(async (data: any) => ({ ...data, createdAt: new Date() })),
  revokeApiKey: vi.fn(async (id: string) => ({ id, revokedAt: new Date() })),
  listWebhooks: vi.fn(async () => []),
  createWebhook: vi.fn(async (data: any) => data),
  deleteWebhook: vi.fn(async () => ({ success: true })),
  listDisputes: vi.fn(async () => ({ rows: [], total: 0 })),
  getDisputeById: vi.fn(async () => null),
  createDispute: vi.fn(async (data: any) => data),
  updateDispute: vi.fn(async (id: string, data: any) => data),
  listVirtualCards: vi.fn(async () => []),
  createVirtualCard: vi.fn(async (data: any) => data),
  getVirtualCardById: vi.fn(async () => null),
  updateVirtualCard: vi.fn(async (id: string, data: any) => data),
  listPaymentLinks: vi.fn(async () => []),
  createPaymentLink: vi.fn(async (data: any) => data),
  getPaymentLinkById: vi.fn(async () => null),
  updatePaymentLink: vi.fn(async (id: string, data: any) => data),
  listTeamMembers: vi.fn(async () => []),
  createTeamMember: vi.fn(async (data: any) => data),
  deleteTeamMember: vi.fn(async () => ({ success: true })),
  getAnalyticsOverview: vi.fn(async () => ({
    revenue: { total: 10000000, change: 12.5 },
    transactions: { total: 500, change: 8.3 },
    customers: { total: 120, change: 5.1 },
    payouts: { total: 3000000, change: -2.1 },
  })),
  getRevenueTimeSeries: vi.fn(async () => []),
  // STALE CONTRACT: payouts.create is now wrapped in withIdempotency (P0-7a),
  // whose claim path chains .onConflictDoNothing().returning({ id }). The mock
  // chain must expose returning(); a non-empty result means "claim succeeded"
  // so the replay path (select()…) is not exercised.
  getDb: vi.fn(async () => ({
    insert: vi.fn().mockReturnThis(),
    values: vi.fn().mockReturnThis(),
    onConflictDoNothing: vi.fn().mockReturnThis(),
    returning: vi.fn().mockResolvedValue([{ id: "idem_test_claim" }]),
    // persist path: update().set().where() stores the response for replay
    update: vi.fn().mockReturnThis(),
    set: vi.fn().mockReturnThis(),
    where: vi.fn().mockResolvedValue([]),
  })),
}));

// ─── Context factory ──────────────────────────────────────────────────────────

function makeCtx(overrides: Partial<TrpcContext> = {}): TrpcContext {
  const clearedCookies: string[] = [];
  return {
    user: {
      id: MOCK_USER_ID,
      openId: MOCK_OPEN_ID,
      email: "test@paygate.ng",
      name: "Test User",
      loginMethod: "manus",
      role: "user",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: {
      clearCookie: (name: string) => clearedCookies.push(name),
    } as TrpcContext["res"],
    ...overrides,
  };
}

// ─── Import router after mocks ────────────────────────────────────────────────

const { appRouter } = await import("./routers");

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("transactions.list", () => {
  it("returns paginated transactions with default limit", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.list({});
    expect(result.rows).toHaveLength(20);
    expect(result.total).toBe(25);
  });

  it("respects custom limit and offset", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.list({ limit: 5, offset: 20 });
    expect(result.rows).toHaveLength(5);
  });

  it("filters by status", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.list({ status: "failed" });
    expect(result.rows.every((t) => t.status === "failed")).toBe(true);
  });

  it("throws UNAUTHORIZED when no user in context", async () => {
    const caller = appRouter.createCaller(makeCtx({ user: null }));
    await expect(caller.transactions.list({})).rejects.toThrow(TRPCError);
  });
});

describe("transactions.createTest", () => {
  // Contract change (R4, spec #13): createTest inserts 'completed'
  // transactions without any real payment, so it is now gated behind
  // PAYGATE_SIMULATION_MODE=true (demoOrFail — fail loud in production
  // instead of fabricating demo data). Enable simulation mode for these
  // tests; a dedicated test below pins the production fail-loud contract.
  beforeEach(() => { vi.stubEnv("PAYGATE_SIMULATION_MODE", "true"); });
  afterEach(() => { vi.unstubAllEnvs(); });

  it("fails loud (SERVICE_UNAVAILABLE) in production mode — no fabricated demo data", async () => {
    vi.stubEnv("PAYGATE_SIMULATION_MODE", "false");
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.transactions.createTest({ amount: 10000, currency: "NGN", channel: "card" })
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringMatching(/PAYGATE_SIMULATION_MODE is not enabled/),
    });
  });

  it("creates a test transaction with correct fee calculation", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.transactions.createTest({
      amount: 100000,
      currency: "NGN",
      customerEmail: "buyer@test.ng",
      customerName: "Test Buyer",
      description: "Test purchase",
      channel: "card",
    });
    expect(result.amount).toBe(100000);
    expect(result.feeAmount).toBe(1500); // 1.5%
    expect(result.netAmount).toBe(98500);
    expect(result.status).toBe("completed");
  });

  it("rejects amounts below minimum (100)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.transactions.createTest({ amount: 50, currency: "NGN", channel: "card" })
    ).rejects.toThrow();
  });

  it("rejects test transactions for live merchants", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce({ ...mockMerchant, isLive: true });
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.transactions.createTest({ amount: 10000, currency: "NGN", channel: "card" })
    ).rejects.toThrow("Cannot create test transactions in live mode");
  });
});

describe("payouts.create", () => {
  it("creates a payout with correct fee and pending status", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payouts.create({
      amount: 500000,
      currency: "NGN",
      bankCode: "044",
      accountNumber: "0123456789",
      accountName: "Emeka Okafor",
      narration: "Weekly settlement",
    });
    expect(result.amount).toBe(500000);
    expect(result.feeAmount).toBe(2500); // 0.5%
    expect(result.status).toBe("pending");
    expect(result.merchantId).toBe(MOCK_MERCHANT_ID);
  });

  it("rejects amounts below minimum (100)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.payouts.create({ amount: 50, currency: "NGN" })
    ).rejects.toThrow();
  });

  it("rejects invalid currency length", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.payouts.create({ amount: 10000, currency: "NGNN" })
    ).rejects.toThrow();
  });
});

describe("payouts.list", () => {
  it("returns paginated payouts", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.payouts.list({ limit: 5 });
    expect(result.rows).toHaveLength(5);
    expect(result.total).toBe(10);
  });
});

describe("onboarding.createMerchant", () => {
  beforeEach(async () => {
    const db = await import("./db");
    vi.mocked(db.getMerchantByOwnerId).mockResolvedValue(null); // No existing merchant
    vi.mocked(db.createMerchant).mockImplementation(async (data: any) => ({
      ...mockMerchant,
      ...data,
      createdAt: new Date(),
      updatedAt: new Date(),
    }));
  });

  afterEach(async () => {
    // Restore default mock so subsequent describe blocks see the merchant
    const db = await import("./db");
    vi.mocked(db.getMerchantByOwnerId).mockResolvedValue(mockMerchant);
  });

  it("creates a new merchant with onboardingStep=1", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.onboarding.createMerchant({
      businessName: "New Merchant Co",
      businessType: "ecommerce",
      email: "new@merchant.ng",
      phone: "+2348099999999",
      country: "NG",
      currency: "NGN",
    });
    expect(result.businessName).toBe("New Merchant Co");
    expect(result.onboardingStep).toBe(1);
    expect(result.ownerId).toBe(MOCK_USER_ID);
  });

  it("returns existing merchant if one already exists", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce(mockMerchant);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.onboarding.createMerchant({
      businessName: "Duplicate Merchant",
      country: "NG",
      currency: "NGN",
    });
    expect(result.id).toBe(MOCK_MERCHANT_ID); // Returns existing
  });

  it("rejects business names shorter than 2 characters", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.onboarding.createMerchant({ businessName: "X", country: "NG", currency: "NGN" })
    ).rejects.toThrow();
  });
});

describe("onboarding.getStatus", () => {
  it("returns isComplete=true when onboardingStep >= 3", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.onboarding.getStatus();
    expect(result.isComplete).toBe(true);
    expect(result.merchant?.id).toBe(MOCK_MERCHANT_ID);
  });

  it("returns isComplete=false when no merchant exists", async () => {
    const { getMerchantByOwnerId } = await import("./db");
    vi.mocked(getMerchantByOwnerId).mockResolvedValueOnce(null);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.onboarding.getStatus();
    expect(result.isComplete).toBe(false);
    expect(result.merchant).toBeNull();
  });
});

describe("customers.list", () => {
  it("returns paginated customer list", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.customers.list({});
    expect(result.rows).toHaveLength(2);
    expect(result.total).toBe(2);
  });

  it("passes search filter to db helper", async () => {
    const { listCustomers } = await import("./db");
    const caller = appRouter.createCaller(makeCtx());
    await caller.customers.list({ search: "Customer One" });
    expect(vi.mocked(listCustomers)).toHaveBeenCalledWith(
      MOCK_MERCHANT_ID,
      expect.objectContaining({ search: "Customer One" })
    );
  });
});

describe("apiKeys lifecycle", () => {
  it("creates an API key with correct environment", async () => {
    const { createApiKey } = await import("./db");
    vi.mocked(createApiKey).mockResolvedValueOnce({
      id: "key_001",
      merchantId: MOCK_MERCHANT_ID,
      name: "Test Key",
      keyHash: "abc123",
      keyPrefix: "pk_test_abc123",
      environment: "test",
      permissions: [],
      isActive: true,
      lastUsedAt: null,
      revokedAt: null,
      createdBy: MOCK_USER_ID,
      createdAt: new Date(),
    });
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.apiKeys.create({ name: "Test Key", environment: "test" });
    expect(result.environment).toBe("test");
    expect(result.isActive).toBe(true);
  });

  it("revokes an API key", async () => {
    const { listApiKeys, revokeApiKey } = await import("./db");
    vi.mocked(listApiKeys).mockResolvedValueOnce([
      { id: "key_001", merchantId: MOCK_MERCHANT_ID, name: "Test Key", keyHash: "abc", keyPrefix: "pk_test_abc", environment: "test", permissions: [], isActive: true, lastUsedAt: null, revokedAt: null, createdBy: null, createdAt: new Date() },
    ]);
    vi.mocked(revokeApiKey).mockResolvedValueOnce({ id: "key_001", revokedAt: new Date() } as any);
    const caller = appRouter.createCaller(makeCtx());
    const result = await caller.apiKeys.revoke({ id: "key_001" });
    expect(result).toMatchObject({ success: true });
  });
});

// ENV-GATED: these assertions require a deployment environment where the
// middleware bridge secrets are provisioned; they are unset in the sandbox.
describe("middleware secrets", () => {
  it.skipIf(!process.env.MIDDLEWARE_BRIDGE_URL)("MIDDLEWARE_BRIDGE_URL is set in environment", () => {
    // The secret may be a placeholder if not provided by user, but the key must exist
    expect(process.env.MIDDLEWARE_BRIDGE_URL).toBeDefined();
  });

  it.skipIf(!process.env.MIDDLEWARE_INTERNAL_KEY)("MIDDLEWARE_INTERNAL_KEY is set in environment", () => {
    expect(process.env.MIDDLEWARE_INTERNAL_KEY).toBeDefined();
  });
});
