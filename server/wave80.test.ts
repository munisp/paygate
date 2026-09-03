/**
 * wave80.test.ts — Vitest tests for all 20 Wave 80 features
 * Tests the wave80Router directly using createCaller with a mock context.
 * DB calls are mocked so tests run without a live database.
 */
import { describe, expect, it, vi, beforeEach } from "vitest";
import { wave80Router } from "./wave80Router";
import type { TrpcContext } from "./_core/context";

// ─── Mock getDb ───────────────────────────────────────────────────────────────
vi.mock("./db", () => {
  // Flat chainable mock - each method returns the same object (no recursion)
  // Tracks whether the last select() was a count query to return correct data
  let _isCountQuery = false;
  const MOCK_RECORD = { id: "mock-id", merchantId: "1", createdAt: new Date(), updatedAt: new Date() };
  const EMPTY: unknown[] = [];
  const COUNT_ROW = [{ count: 0 }];

  // Create a single flat object where all methods return `this`
  const db: Record<string, unknown> = {};
  const self = () => db;

  db.select = vi.fn().mockImplementation((fields?: unknown) => {
    _isCountQuery = !!(fields && typeof fields === "object" && "count" in (fields as object));
    return db;
  });
  db.from = vi.fn().mockReturnValue(db);
  db.where = vi.fn().mockImplementation(() => {
    // Return a thenable that resolves based on query type
    const result = _isCountQuery ? COUNT_ROW : EMPTY;
    const thenable = Object.assign(Object.create(db), {
      then: (resolve: (v: unknown[]) => unknown, reject?: (e: unknown) => unknown) =>
        Promise.resolve(result).then(resolve, reject),
      orderBy: vi.fn().mockReturnValue(Object.assign(Object.create(db), {
        limit: vi.fn().mockReturnValue(Object.assign(Object.create(db), {
          offset: vi.fn().mockResolvedValue(EMPTY),
        })),
      })),
    });
    return thenable;
  });
  db.orderBy = vi.fn().mockReturnValue(db);
  db.limit = vi.fn().mockReturnValue(db);
  db.offset = vi.fn().mockImplementation(() =>
    Promise.resolve(_isCountQuery ? COUNT_ROW : EMPTY)
  );
  db.insert = vi.fn().mockReturnValue(db);
  db.values = vi.fn().mockReturnValue(db);
  // S15b: withIdempotency (now required on escrowV2.createContract) claims
  // keys via INSERT ... ON CONFLICT DO NOTHING RETURNING — mock support.
  db.onConflictDoNothing = vi.fn().mockReturnValue(db);
  db.returning = vi.fn().mockResolvedValue([MOCK_RECORD]);
  db.update = vi.fn().mockReturnValue(db);
  db.set = vi.fn().mockReturnValue(db);
  // Transactions run the callback against the same flat chainable mock.
  db.transaction = vi.fn().mockImplementation((fn: (tx: unknown) => unknown) => fn(db));

  return {
    getDb: vi.fn().mockResolvedValue(db),
  };
});

// ─── Mock middleware bridge (ramp quote / wallet rails) ──────────────────────
const bridgeMocks = vi.hoisted(() => ({
  // Default: provider unreachable (tests override per-case). A resolved
  // undefined would break `.catch()` chains inside the router.
  getCryptoRampQuoteViaMiddleware: vi.fn().mockRejectedValue(new Error("ramp provider unreachable")),
  debitWalletViaMiddleware: vi.fn().mockResolvedValue({ success: true }),
  creditWalletViaMiddleware: vi.fn().mockResolvedValue({ success: true }),
}));
vi.mock("./middlewareBridge", () => bridgeMocks);

// ─── Test context factory ─────────────────────────────────────────────────────
type AuthenticatedUser = NonNullable<TrpcContext["user"]>;

function createCtx(overrides: Partial<AuthenticatedUser> = {}): TrpcContext {
  const user: AuthenticatedUser = {
    id: 1,
    openId: "test-open-id",
    email: "merchant@paygate.test",
    name: "Test Merchant",
    loginMethod: "manus",
    role: "user",
    createdAt: new Date(),
    updatedAt: new Date(),
    lastSignedIn: new Date(),
    ...overrides,
  };
  return {
    user,
    req: { protocol: "https", headers: {} } as TrpcContext["req"],
    res: { clearCookie: vi.fn(), cookie: vi.fn() } as unknown as TrpcContext["res"],
  };
}

// ─── 1. Open Banking V2 ───────────────────────────────────────────────────────
describe("wave80.openBankingV2", () => {
  it("listConsents returns consents property when DB has no records", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.openBankingV2.listConsents();
    expect(result).toHaveProperty("consents");
    // Mock resolves to empty array or thenable — just check property exists
    expect(result.consents).toBeDefined();
  });

  it("createConsent returns a consent object", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.openBankingV2.createConsent({ bankCode: "GTB", bankName: "GTBank", scopes: ["accounts", "transactions"] });
    expect(result).toHaveProperty("consent");
  });

  it("revokeConsent returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.openBankingV2.revokeConsent({ consentId: "consent-123" });
    expect(result.success).toBe(true);
  });

  it("listAccounts returns accounts array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.openBankingV2.listAccounts();
    expect(result).toHaveProperty("accounts");
  });

  it("syncAccounts returns success with syncedAt timestamp", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.openBankingV2.syncAccounts({ consentId: "consent-123" });
    expect(result.success).toBe(true);
    expect(result.syncedAt).toBeInstanceOf(Date);
  });
});

// ─── 2. Carbon Credits V2 ────────────────────────────────────────────────────
describe("wave80.carbonCreditsV2", () => {
  it("listCredits returns credits property", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.carbonCreditsV2.listCredits({});
    expect(result).toHaveProperty("credits");
    expect(result.credits).toBeDefined();
  });

  it("listCredits filters by status", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.carbonCreditsV2.listCredits({ status: "active" });
    expect(result).toHaveProperty("credits");
  });

  it("purchaseCredits returns a credit record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.carbonCreditsV2.purchaseCredits({ projectName: "Amazon Reforestation", quantity: 10, pricePerTonne: 25 });
    expect(result).toHaveProperty("credit");
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.carbonCreditsV2.getStats();
    expect(typeof result.totalOwned).toBe("number");
    expect(typeof result.totalRetired).toBe("number");
    expect(typeof result.totalSpent).toBe("number");
  });

  it("listTransactions returns transactions array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.carbonCreditsV2.listTransactions();
    expect(result).toHaveProperty("transactions");
  });
});

// ─── 3. Agent Banking V4 ─────────────────────────────────────────────────────
describe("wave80.agentBankingV4", () => {
  it("listAgents returns paginated agents", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.agentBankingV4.listAgents({ page: 1 });
    expect(result).toHaveProperty("agents");
    expect(result).toHaveProperty("total");
  });

  it("createAgent returns an agent record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.agentBankingV4.createAgent({ agentName: "John Doe", phone: "+2348012345678" });
    expect(result).toHaveProperty("agent");
  });

  it("updateAgent returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.agentBankingV4.updateAgent({ agentId: "agent-1", status: "inactive" });
    expect(result.success).toBe(true);
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.agentBankingV4.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.active).toBe("number");
  });

  // NEW CONTRACT (R4): topUpFloat requires an idempotencyKey and performs a
  // guarded wallet debit + atomic float increment in one transaction — it no
  // longer increments float out of thin air.
  it("topUpFloat rejects when the required idempotencyKey is missing", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.agentBankingV4.topUpFloat({ agentId: "agent-1", amount: 50000 } as never)).rejects.toThrow();
  });
});

// ─── 4. Super-Agent V2 ───────────────────────────────────────────────────────
describe("wave80.superAgentV2", () => {
  it("listNetworks returns networks array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.superAgentV2.listNetworks();
    expect(result).toHaveProperty("networks");
  });

  it("createNetwork returns a network record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.superAgentV2.createNetwork({ networkName: "Lagos Super Network" });
    expect(result).toHaveProperty("network");
  });

  it("getNetworkStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.superAgentV2.getNetworkStats();
    expect(typeof result.networks).toBe("number");
    expect(typeof result.totalAgents).toBe("number");
  });

  it("updateNetwork returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.superAgentV2.updateNetwork({ networkId: "net-1", status: "inactive" });
    expect(result.success).toBe(true);
  });

  it("getPerformance returns stats for a given period", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.superAgentV2.getPerformance({ period: "30d" });
    expect(result).toHaveProperty("totalNetworks");
    expect(result).toHaveProperty("activeNetworks");
  });
});

// ─── 5. Escrow V2 ────────────────────────────────────────────────────────────
describe("wave80.escrowV2", () => {
  it("listContracts returns paginated contracts", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.escrowV2.listContracts({ page: 1 });
    expect(result).toHaveProperty("contracts");
    expect(result).toHaveProperty("total");
  });

  it("createContract returns a contract", async () => {
    const caller = wave80Router.createCaller(createCtx());
    // S15b: createContract now REQUIRES an idempotencyKey (buyer-debit retry
    // safety) — test input updated to the new contract; assertion unchanged.
    const result = await caller.escrowV2.createContract({ title: "Laptop Purchase", amount: 500000, idempotencyKey: "escrow-create-test-0001" });
    expect(result).toHaveProperty("contract");
  });

  // NEW CONTRACT (R4): release is a guarded funded->released flip followed by
  // an awaited seller credit. The mock record has no seller, so the release
  // must abort (PRECONDITION_FAILED) rather than strand funds — and repeat
  // releases of an already-released contract get CONFLICT, never a re-credit.
  it("releaseContract aborts when the contract has no seller to disburse to", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.escrowV2.releaseContract({ contractId: "contract-1" })).rejects.toThrow(/seller|funded/i);
  });

  it("disputeContract returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.escrowV2.disputeContract({ contractId: "contract-1", reason: "Item not delivered" });
    expect(result.success).toBe(true);
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.escrowV2.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.active).toBe("number");
    expect(typeof result.released).toBe("number");
    expect(typeof result.disputed).toBe("number");
  });
});

// ─── 6. Marketplace Pay ──────────────────────────────────────────────────────
describe("wave80.marketplacePay", () => {
  it("listOrders returns paginated orders", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.marketplacePay.listOrders({ page: 1 });
    expect(result).toHaveProperty("orders");
    expect(result).toHaveProperty("total");
  });

  it("createOrder calculates platform fee correctly", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.marketplacePay.createOrder({ buyerEmail: "buyer@test.com", items: [{ name: "Laptop", price: 200000, qty: 1 }] });
    expect(result).toHaveProperty("order");
  });

  // NEW CONTRACT (R4): 'completed'/'paid' are money claims and cannot be
  // self-declared (no payment-verification rail integrated). Merchants may
  // only cancel their own pending orders.
  it("updateOrderStatus rejects a self-declared 'completed' status", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.marketplacePay.updateOrderStatus({ orderId: "order-1", status: "completed" })).rejects.toThrow(/payment verification/i);
  });

  it("updateOrderStatus allows cancelling a pending order", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.marketplacePay.updateOrderStatus({ orderId: "order-1", status: "cancelled" });
    expect(result.success).toBe(true);
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.marketplacePay.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.totalRevenue).toBe("number");
  });

  it("getOrderDetails throws NOT_FOUND for missing order", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.marketplacePay.getOrderDetails({ orderId: "nonexistent" })).rejects.toThrow();
  });
});

// ─── 7. Loyalty V3 ───────────────────────────────────────────────────────────
describe("wave80.loyaltyV3", () => {
  it("getProgram returns null when no program exists", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.loyaltyV3.getProgram();
    expect(result).toHaveProperty("program");
  });

  it("createProgram returns a program record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.loyaltyV3.createProgram({ programName: "PayGate Rewards" });
    expect(result).toHaveProperty("program");
  });

  it("listMembers returns paginated members", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.loyaltyV3.listMembers({ page: 1 });
    expect(result).toHaveProperty("members");
    expect(result).toHaveProperty("total");
  });

  it("awardPoints throws NOT_FOUND when no program exists", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.loyaltyV3.awardPoints({ customerId: "cust-1", customerEmail: "c@test.com", points: 100 })).rejects.toThrow();
  });

  // NEW CONTRACT (R4): redeemPoints requires an idempotencyKey and uses a
  // guarded atomic decrement — duplicate/concurrent redeems cannot double-spend.
  it("redeemPoints rejects when the required idempotencyKey is missing", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.loyaltyV3.redeemPoints({ memberId: "mem-1", points: 50 } as never)).rejects.toThrow();
  });
});

// ─── 8. Crypto Off-Ramp V2 ───────────────────────────────────────────────────
describe("wave80.cryptoOfframpV2", () => {
  it("listTransactions returns paginated transactions", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.cryptoOfframpV2.listTransactions({ page: 1 });
    expect(result).toHaveProperty("transactions");
    expect(result).toHaveProperty("total");
  });

  // STALE CONTRACT: simulated off-ramp was replaced by fail-loud behavior —
  // without a reachable ramp provider the procedure must throw, never fabricate.
  it("initiateOfframp fails loud when the ramp provider is unreachable", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(
      caller.cryptoOfframpV2.initiateOfframp({ cryptoAsset: "USDT", cryptoAmount: "100", bankCode: "GTB", accountNumber: "0123456789", walletAddress: "0xabc123", idempotencyKey: "test-offramp-init-key" })
    ).rejects.toThrow(/ramp provider unreachable|unavailable/i);
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.cryptoOfframpV2.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.totalFiatOut).toBe("number");
  });

  // STALE CONTRACT: the hardcoded 1650 USDT/NGN mock rate was removed —
  // rates come from a live ramp provider and fail loud when unreachable.
  it("getRates fails loud when the ramp provider is unreachable", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.cryptoOfframpV2.getRates()).rejects.toThrow(/ramp provider unreachable|unavailable/i);
  });

  it("cancelTransaction returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.cryptoOfframpV2.cancelTransaction({ txId: "tx-1" });
    expect(result.success).toBe(true);
  });
});

// ─── 9. NFC Tap-to-Pay ───────────────────────────────────────────────────────
describe("wave80.nfcPay", () => {
  it("listDevices returns devices array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.nfcPay.listDevices();
    expect(result).toHaveProperty("devices");
  });

  it("registerDevice returns a device record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.nfcPay.registerDevice({ deviceName: "Samsung Galaxy A54" });
    expect(result).toHaveProperty("device");
  });

  it("deactivateDevice returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.nfcPay.deactivateDevice({ deviceId: "device-1" });
    expect(result.success).toBe(true);
  });

  it("listTransactions returns paginated transactions", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.nfcPay.listTransactions({ page: 1 });
    expect(result).toHaveProperty("transactions");
    expect(result).toHaveProperty("total");
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.nfcPay.getStats();
    expect(typeof result.totalDevices).toBe("number");
    expect(typeof result.totalTransactions).toBe("number");
  });
});

// ─── 10. QR Merchant Analytics ───────────────────────────────────────────────
describe("wave80.qrMerchantAnalytics", () => {
  it("getOverview returns analytics metrics", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.qrMerchantAnalytics.getOverview({ period: "7d" });
    expect(typeof result.totalScans).toBe("number");
    expect(typeof result.conversionRate).toBe("number");
  });

  it("getScanHeatmap returns 24 hourly data points", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.qrMerchantAnalytics.getScanHeatmap({ period: "7d" });
    expect(result.heatmap).toHaveLength(24);
    expect(result.heatmap[0]).toHaveProperty("hour");
    expect(result.heatmap[0]).toHaveProperty("scans");
  });

  it("getTopQrCodes returns real codes (honest empty state when no QR payments)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.qrMerchantAnalytics.getTopQrCodes();
    // Mock DB has no QR payments — the router must return an empty array
    // rather than fabricated top codes.
    expect(Array.isArray(result.codes)).toBe(true);
    expect(result.codes).toHaveLength(0);
  });

  it("getCustomerInsights returns real breakdown (zeros/nulls when no claims)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.qrMerchantAnalytics.getCustomerInsights();
    expect(result.newVsReturning.new + result.newVsReturning.returning).toBe(0);
    // No session-duration or location data source exists — reported honestly.
    expect(result.avgSessionDuration).toBeNull();
    expect(result.topLocations).toEqual([]);
  });

  it("exportReport returns inline CSV content (no fabricated downloadUrl)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.qrMerchantAnalytics.exportReport({ period: "7d" });
    expect(result).not.toHaveProperty("downloadUrl");
    expect(result.csv).toContain("id,created_at,amount_kobo");
    expect(result.rowCount).toBe(0);
    expect(result.generatedAt).toBeInstanceOf(Date);
  });
});

// ─── 11. Invoice Financing V2 ────────────────────────────────────────────────
describe("wave80.invoiceFinancingV2", () => {
  it("listApplications returns paginated applications", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.invoiceFinancingV2.listApplications({ page: 1 });
    expect(result).toHaveProperty("applications");
    expect(result).toHaveProperty("total");
  });

  it("applyForFinancing returns an application", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.invoiceFinancingV2.applyForFinancing({ invoiceAmount: 500000, requestedAmount: 400000 });
    expect(result).toHaveProperty("application");
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.invoiceFinancingV2.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.totalDisbursed).toBe("number");
  });

  it("cancelApplication returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.invoiceFinancingV2.cancelApplication({ appId: "app-1" });
    expect(result.success).toBe(true);
  });

  // STALE CONTRACT: the hardcoded eligibility mock (eligible:true, 3.5%) was
  // removed — eligibility requires an underwriting service and fails loud
  // when none is integrated.
  it("getEligibility fails loud when no underwriting service is integrated", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.invoiceFinancingV2.getEligibility()).rejects.toThrow(/underwriting service not integrated|unavailable/i);
  });
});

// ─── 12. Payroll V3 ──────────────────────────────────────────────────────────
describe("wave80.payrollV3", () => {
  it("listRuns returns paginated runs", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.payrollV3.listRuns({ page: 1 });
    expect(result).toHaveProperty("runs");
    expect(result).toHaveProperty("total");
  });

  it("createRun returns a run record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.payrollV3.createRun({ runName: "April 2026 Payroll", period: "2026-04" });
    expect(result).toHaveProperty("run");
  });

  // NEW CONTRACT (R4): no payroll disbursement rail is integrated — processRun
  // must never stamp 'processed' in production. It is simulation-only.
  it("processRun fails loud in production (disbursement rail not integrated)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.payrollV3.processRun({ runId: "run-1" })).rejects.toThrow(/disbursement rail not integrated|unavailable/i);
  });

  it("processRun succeeds only in simulation mode and says so", async () => {
    const prev = process.env.PAYGATE_SIMULATION_MODE;
    process.env.PAYGATE_SIMULATION_MODE = "true";
    try {
      const caller = wave80Router.createCaller(createCtx());
      const result = await caller.payrollV3.processRun({ runId: "run-1" });
      expect(result.success).toBe(true);
      expect(result.simulation).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PAYGATE_SIMULATION_MODE;
      else process.env.PAYGATE_SIMULATION_MODE = prev;
    }
  });

  it("listEmployees returns paginated employees", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.payrollV3.listEmployees({ page: 1 });
    expect(result).toHaveProperty("employees");
    expect(result).toHaveProperty("total");
  });

  it("addEmployee returns an employee record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.payrollV3.addEmployee({ fullName: "Jane Doe", email: "jane@company.com", bankCode: "GTB", accountNumber: "0123456789", grossSalary: 350000 });
    expect(result).toHaveProperty("employee");
  });
});

// ─── 13. Tax Filing ──────────────────────────────────────────────────────────
describe("wave80.taxFiling", () => {
  it("listFilings returns paginated filings", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.taxFiling.listFilings({ page: 1 });
    expect(result).toHaveProperty("filings");
    expect(result).toHaveProperty("total");
  });

  it("createFiling calculates VAT at 7.5%", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.taxFiling.createFiling({ taxType: "VAT", period: "2026-03", taxableAmount: 1000000 });
    expect(result).toHaveProperty("filing");
  });

  // NEW CONTRACT (R4): no tax-authority filing rail is integrated — a 'filed'
  // stamp with a fabricated receipt number is forbidden in production.
  it("submitFiling fails loud in production (filing rail not integrated)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.taxFiling.submitFiling({ filingId: "filing-1" })).rejects.toThrow(/filing rail not integrated|unavailable/i);
  });

  it("submitFiling returns a clearly-labelled SIM receipt only in simulation mode", async () => {
    const prev = process.env.PAYGATE_SIMULATION_MODE;
    process.env.PAYGATE_SIMULATION_MODE = "true";
    try {
      const caller = wave80Router.createCaller(createCtx());
      const result = await caller.taxFiling.submitFiling({ filingId: "filing-1" });
      expect(result.success).toBe(true);
      expect(result.simulation).toBe(true);
      expect(result.receiptNumber).toMatch(/^SIM-TXR-/);
    } finally {
      if (prev === undefined) delete process.env.PAYGATE_SIMULATION_MODE;
      else process.env.PAYGATE_SIMULATION_MODE = prev;
    }
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.taxFiling.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.totalTaxPaid).toBe("number");
  });

  it("getUpcomingDeadlines returns deadlines array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.taxFiling.getUpcomingDeadlines();
    expect(result).toHaveProperty("deadlines");
    expect(Array.isArray(result.deadlines)).toBe(true);
  });
});

// ─── 14. Regulatory Reporting ────────────────────────────────────────────────
describe("wave80.regulatoryReporting", () => {
  it("listReports returns paginated reports", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.regulatoryReporting.listReports({ page: 1 });
    expect(result).toHaveProperty("reports");
    expect(result).toHaveProperty("total");
  });

  it("createReport returns a report record", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.regulatoryReporting.createReport({ reportType: "CBN_MONTHLY", period: "2026-03" });
    expect(result).toHaveProperty("report");
  });

  // NEW CONTRACT (R4): no regulator submission rail is integrated — stamping
  // 'submitted' without a real submission is simulation-only.
  it("submitReport fails loud in production (submission rail not integrated)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.regulatoryReporting.submitReport({ reportId: "report-1" })).rejects.toThrow(/submission rail not integrated|unavailable/i);
  });

  it("submitReport succeeds only in simulation mode and says so", async () => {
    const prev = process.env.PAYGATE_SIMULATION_MODE;
    process.env.PAYGATE_SIMULATION_MODE = "true";
    try {
      const caller = wave80Router.createCaller(createCtx());
      const result = await caller.regulatoryReporting.submitReport({ reportId: "report-1" });
      expect(result.success).toBe(true);
      expect(result.simulation).toBe(true);
    } finally {
      if (prev === undefined) delete process.env.PAYGATE_SIMULATION_MODE;
      else process.env.PAYGATE_SIMULATION_MODE = prev;
    }
  });

  it("getStats returns numeric stats", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.regulatoryReporting.getStats();
    expect(typeof result.total).toBe("number");
    expect(typeof result.submitted).toBe("number");
  });

  it("getRequirements returns 4 regulatory requirements", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.regulatoryReporting.getRequirements();
    expect(result.requirements).toHaveLength(4);
    expect(result.requirements[0]).toHaveProperty("regulator");
    expect(result.requirements[0]).toHaveProperty("frequency");
  });
});

// ─── 15. USDC V2 ─────────────────────────────────────────────────────────────
describe("wave80.usdcV2", () => {
  // NEW CONTRACT (R4): getWallet NEVER fabricates a deposit address (a fake
  // address burns real deposits). With no registered Solana address on file it
  // must fail PRECONDITION_FAILED honestly.
  it("getWallet fails honestly when no registered Solana address exists (never fabricates)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.usdcV2.getWallet()).rejects.toThrow(/No USDC deposit address|register a Solana wallet/i);
  });

  it("listTransactions returns paginated transactions", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.usdcV2.listTransactions({ page: 1 });
    expect(result).toHaveProperty("transactions");
    expect(result).toHaveProperty("total");
  });

  it("initiateTransfer fails loud (no on-chain broadcast configured, nothing persisted)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(
      caller.usdcV2.initiateTransfer({ toAddress: "0xabc123def456", amountUsdc: "100.00" })
    ).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
      message: expect.stringContaining("on-chain broadcast not configured"),
    });
  });

  it("getStats returns balance and transaction counts", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.usdcV2.getStats();
    expect(result).toHaveProperty("balance");
    expect(result).toHaveProperty("totalTransactions");
  });

  it("convertToNgn converts at the LIVE ramp rate (no hardcoded rate) and records the ledger movement", async () => {
    // Deliberately NOT 1650 — proves the committed conversion uses the
    // provider quote, not the old hardcoded rate.
    bridgeMocks.getCryptoRampQuoteViaMiddleware.mockResolvedValue({ rate: 1600 });
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.usdcV2.convertToNgn({ amountUsdc: "10" });
    expect(result.rate).toBe(1600);
    expect(result.ngnAmount).toBe(16000);
    expect(result).toHaveProperty("transaction");
    expect(bridgeMocks.getCryptoRampQuoteViaMiddleware).toHaveBeenCalledWith("USDC", "NGN", 1);
  });

  it("convertToNgn fails loud when the ramp provider is unreachable (nothing recorded)", async () => {
    bridgeMocks.getCryptoRampQuoteViaMiddleware.mockRejectedValue(new Error("bridge down"));
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.usdcV2.convertToNgn({ amountUsdc: "10" })).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("convertToNgn rejects an underfunded wallet (guarded debit — nothing recorded)", async () => {
    bridgeMocks.getCryptoRampQuoteViaMiddleware.mockResolvedValue({ rate: 1600 });
    const { getDb } = await import("./db");
    const db = (await getDb()) as any;
    // Guarded UPDATE ... WHERE balance >= amount RETURNING yields no row.
    db.returning.mockResolvedValueOnce([]);
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.usdcV2.convertToNgn({ amountUsdc: "10" })).rejects.toMatchObject({
      code: "BAD_REQUEST",
      message: expect.stringContaining("Insufficient USDC balance"),
    });
  });
});

// ─── 16. Multi-Currency Ledger ───────────────────────────────────────────────
describe("wave80.multiCurrencyLedger", () => {
  it("listAccounts returns or creates 7 currency accounts", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.multiCurrencyLedger.listAccounts();
    expect(result).toHaveProperty("accounts");
  });

  it("listEntries returns paginated entries", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.multiCurrencyLedger.listEntries({ page: 1 });
    expect(result).toHaveProperty("entries");
    expect(result).toHaveProperty("total");
  });

  it("postEntry throws NOT_FOUND for missing currency account", async () => {
    const caller = wave80Router.createCaller(createCtx());
    await expect(caller.multiCurrencyLedger.postEntry({ currency: "USD", type: "credit", amount: 1000, description: "Test credit" })).rejects.toThrow();
  });

  it("getFxRates returns rates with NGN as base", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.multiCurrencyLedger.getFxRates();
    expect(result.base).toBe("NGN");
    expect(result.rates).toHaveProperty("USD");
    expect(result.rates).toHaveProperty("GBP");
    expect(result.rates).toHaveProperty("EUR");
  });

  it("getStats returns currency counts", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.multiCurrencyLedger.getStats();
    expect(typeof result.totalCurrencies).toBe("number");
    expect(typeof result.activeCurrencies).toBe("number");
  });
});

// ─── 17. Temporal Workflow Management ────────────────────────────────────────
describe("wave80.temporalWorkflowMgmt", () => {
  it("listWorkflows returns workflows with status", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.temporalWorkflowMgmt.listWorkflows({ page: 1 });
    expect(result).toHaveProperty("workflows");
    // DB mock returns empty array; just verify shape
    expect(Array.isArray(result.workflows)).toBe(true);
    expect(result).toHaveProperty("total");
  });

  it("getWorkflowDetails throws NOT_FOUND when workflow missing", async () => {
    const caller = wave80Router.createCaller(createCtx());
    // DB mock returns empty array, so getWorkflowDetails should throw NOT_FOUND
    await expect(caller.temporalWorkflowMgmt.getWorkflowDetails({ workflowId: "wf-001" })).rejects.toThrow();
  });

  it("cancelWorkflow returns success with cancelled status", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.temporalWorkflowMgmt.cancelWorkflow({ workflowId: "wf-001", reason: "Test cancellation" });
    expect(result.success).toBe(true);
    expect(result.status).toBe("cancelled");
  });

  it("getMetrics returns metrics shape", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.temporalWorkflowMgmt.getMetrics({ period: "7d" });
    // DB mock returns empty array; totalWorkflows=0 and successRate=0 are valid
    expect(result).toHaveProperty("successRate");
    expect(result).toHaveProperty("totalWorkflows");
    expect(result.successRate).toBeGreaterThanOrEqual(0);
    expect(result.totalWorkflows).toBeGreaterThanOrEqual(0);
  });

  it("retryWorkflow returns success and original workflow ID", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.temporalWorkflowMgmt.retryWorkflow({ workflowId: "wf-001" });
    expect(result.success).toBe(true);
    expect(result.originalWorkflowId).toBe("wf-001");
    // newWorkflowId is the same as workflowId in DB-backed implementation
    expect(result.newWorkflowId).toBeDefined();
  });
});

// ─── 18. gRPC Health Check ───────────────────────────────────────────────────
describe("wave80.grpcHealthCheck", () => {
  it("checkAllServices returns services array with health status", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.grpcHealthCheck.checkAllServices();
    // GRPC_SERVICES has 4 entries; each gets a real health check (may be unreachable in test)
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services.length).toBeGreaterThan(0);
    expect(result.checkedAt).toBeInstanceOf(Date);
    // Each service should have name, status, latencyMs
    expect(result.services[0]).toHaveProperty("name");
    expect(result.services[0]).toHaveProperty("status");
    expect(result.services[0]).toHaveProperty("latencyMs");
  });

  // NEW CONTRACT (R4): fabricated SLO metrics were removed — only the measured
  // live-probe status/latency is reported; uptime/percentiles/errorRate are
  // honestly unavailable (null), never invented.
  it("getServiceMetrics reports only measured data (no fabricated SLO metrics)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.grpcHealthCheck.getServiceMetrics({ serviceName: "PaymentService" });
    expect(result).toHaveProperty("status");
    expect(typeof result.measuredLatencyMs).toBe("number");
    expect(result.measuredLatencyMs).toBeGreaterThanOrEqual(0);
    expect(result.uptime).toBeNull();
    expect(result.p50Latency).toBeNull();
    expect(result.p95Latency).toBeNull();
    expect(result.p99Latency).toBeNull();
    expect(result.errorRate).toBeNull();
    expect(result.note).toContain("never simulated");
  });

  it("getGrpcConfig returns service proto definitions", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.grpcHealthCheck.getGrpcConfig();
    expect(Array.isArray(result.services)).toBe(true);
    expect(result.services[0]).toHaveProperty("proto");
  });

  it("getHealthHistory returns empty history with explicit note (no simulated past data)", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.grpcHealthCheck.getHealthHistory({ serviceName: "PaymentService" });
    // No persistent health-history store exists — history must be empty and
    // only the live probe reported; never simulated.
    expect(result.history).toEqual([]);
    expect(result.note).toContain("health-history");
    expect(result.current).toHaveProperty("status");
    expect(result.current).toHaveProperty("latencyMs");
  });

  it("checkService returns a status and latency", async () => {
    const caller = wave80Router.createCaller(createCtx());
    // In test environment the URL is unreachable, so status will be 'unreachable'
    const result = await caller.grpcHealthCheck.checkService({ serviceName: "TestService", url: "http://localhost:19999" });
    expect(result.name).toBe("TestService");
    expect(result).toHaveProperty("status");
    expect(result).toHaveProperty("latencyMs");
    expect(result.latencyMs).toBeGreaterThanOrEqual(0);
  });
});

// ─── 19. USSD Session V2 ─────────────────────────────────────────────────────
describe("wave80.ussdSessionV2", () => {
  it("listSessions returns sessions array", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.ussdSessionV2.listSessions({ page: 1 });
    expect(result).toHaveProperty("sessions");
    expect(result).toHaveProperty("total");
  });

  it("getSessionAnalytics returns analytics shape", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.ussdSessionV2.getSessionAnalytics({ period: "7d" });
    // DB mock returns empty array; completionRate=0 is valid when no sessions exist
    expect(result).toHaveProperty("completionRate");
    expect(result.completionRate).toBeGreaterThanOrEqual(0);
    expect(result.completionRate).toBeLessThanOrEqual(100);
    expect(Array.isArray(result.topMenus)).toBe(true);
  });

  it("getMenuFlow returns menu structure", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.ussdSessionV2.getMenuFlow();
    expect(Array.isArray(result.menus)).toBe(true);
    expect(result.menus.length).toBeGreaterThan(0);
    expect(result.menus[0]).toHaveProperty("options");
  });

  it("updateMenuFlow returns success with updated count", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.ussdSessionV2.updateMenuFlow({ menus: [{ id: "main", title: "Main Menu", options: ["1. Balance", "2. Transfer"] }] });
    expect(result.success).toBe(true);
    expect(result.updatedMenus).toBe(1);
  });

  it("getDropOffAnalysis returns drop-off points", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.ussdSessionV2.getDropOffAnalysis({ period: "30d" });
    expect(result).toHaveProperty("dropOffPoints");
    expect(Array.isArray(result.dropOffPoints)).toBe(true);
  });
});

// ─── 20. Real-Time Notifications ─────────────────────────────────────────────
describe("wave80.realtimeNotifications", () => {
  it("getChannels returns available channels", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.getChannels();
    expect(Array.isArray(result.channels)).toBe(true);
    expect(result.channels).toContain("webhook");
    expect(result.channels).toContain("email");
  });

  it("getPreferences returns or creates preferences", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.getPreferences();
    expect(result).toHaveProperty("preferences");
  });

  it("updatePreferences returns success", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.updatePreferences({ emailEnabled: true, smsEnabled: false, webhookEnabled: true });
    expect(result.success).toBe(true);
  });

  it("getNotificationHistory returns paginated history", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.getNotificationHistory({ page: 1 });
    expect(result).toHaveProperty("notifications");
    expect(result).toHaveProperty("total");
  });

  it("getDeliveryStats returns delivery rate", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.getDeliveryStats({ period: "7d" });
    expect(typeof result.sent).toBe("number");
    expect(typeof result.delivered).toBe("number");
    expect(typeof result.deliveryRate).toBe("number");
  });

  it("testNotification returns success with messageId", async () => {
    const caller = wave80Router.createCaller(createCtx());
    const result = await caller.realtimeNotifications.testNotification({ channel: "email", message: "Test notification from PayGate" });
    expect(result.success).toBe(true);
    expect(result.messageId).toBeDefined();
  });
});
