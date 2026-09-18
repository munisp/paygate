/**
 * apPayOverTime.test.ts
 * Vitest unit tests for the P0-c B2B Pay-Over-Time router.
 * Mock pattern follows server/routers/hostedCheckout.test.ts
 * (vi.mock drizzle/schema + server/db chainable mocks).
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const mockGetDb = vi.fn();
const mockCreatePayout = vi.fn();
const mockInitiatePayoutApproval = vi.fn();

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../drizzle/schema", () => ({
  apBills: {},
  apPayments: {},
  bnplLoans: {},
  bnplPlans: {},
  bnplRepaymentSchedules: {},
  vendors: {},
  wallets: {},
  walletTransactions: {},
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
  getUserByOpenId: vi.fn(async (openId: string) => ({
    id: 7,
    openId,
    name: "Test Merchant",
    email: "merchant@test.com",
  })),
  requireMerchant: vi.fn(async () => ({
    id: "merch-1",
    tenantId: "ten_default",
    businessName: "Test Co",
  })),
  createPayout: mockCreatePayout,
}));

vi.mock("../middlewareBridge", () => ({
  initiatePayoutApproval: mockInitiatePayoutApproval,
}));

vi.mock("../idempotency", () => ({
  // Execute-through: idempotency persistence is covered by idempotency.ts tests.
  withIdempotency: vi.fn((opts: { execute: () => Promise<unknown> }) => opts.execute()),
}));

vi.mock("../kafkaClient", () => ({
  publishEvent: vi.fn(async () => true),
}));

vi.mock("../auditTrail", () => ({
  auditLog: vi.fn(async () => undefined),
}));

vi.mock("../_core/env", () => ({
  ENV: {
    creditScoringUrl: "http://credit-scoring.test",
    internalApiKey: "test-internal-key",
  },
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const APPROVED_BILL = {
  id: "bill-1",
  merchantId: "merch-1",
  vendorId: "ven-1",
  billNumber: "INV-0001",
  status: "approved",
  totalKobo: 12_000_000, // ₦120,000
  amountPaidKobo: 0,
  currency: "NGN",
};

const VENDOR = {
  id: "ven-1",
  merchantId: "merch-1",
  name: "Vendor Co",
  bankCode: "058",
  accountNumber: "0123456789",
  accountName: "Vendor Co Ltd",
};

function makeCtx() {
  return {
    user: {
      id: 7,
      openId: "user-open-id",
      email: "merchant@test.com",
      name: "Test Merchant",
      role: "user",
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} },
    res: {},
  } as any;
}

/** Thenable chainable query mock resolving to `rows`. */
function chainable(rows: any[]) {
  const q: any = {
    from: () => q,
    where: () => q,
    limit: () => q,
    orderBy: () => q,
    offset: () => q,
    innerJoin: () => q,
    leftJoin: () => q,
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

/**
 * Mock db whose transaction() emulates rollback semantics: staged insert
 * values are only moved to `committed` when the callback resolves; on throw
 * they are discarded (the PG transaction would roll back).
 */
function createTxMockDb(opts: {
  selectResults: any[][];
  updateReturning?: any[][];
}) {
  const committed: any[] = [];
  let selectCall = 0;
  let updateCall = 0;
  const staged: any[] = [];
  const txExecute = vi.fn();

  const tx: any = {
    insert: vi.fn(() => ({
      values: vi.fn((v: any) => {
        staged.push(v);
        const q: any = {
          returning: vi.fn(async () => [{ id: "row-id" }]),
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
        return q;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn(() => ({
        where: vi.fn(() => ({
          returning: vi.fn(async () => {
            const r = opts.updateReturning?.[updateCall] ?? [{ id: "updated" }];
            updateCall++;
            return r;
          }),
        })),
      })),
    })),
    select: vi.fn(() => chainable(opts.selectResults[selectCall++] ?? [])),
    execute: txExecute,
  };

  const db: any = {
    select: vi.fn(() => chainable(opts.selectResults[selectCall++] ?? [])),
    transaction: vi.fn(async (cb: (tx: any) => Promise<unknown>) => {
      const start = staged.length;
      try {
        const res = await cb(tx);
        committed.push(...staged.splice(start));
        return res;
      } catch (e) {
        staged.length = start; // rollback — discard staged writes
        throw e;
      }
    }),
    __committed: committed,
    __tx: tx,
  };
  return db;
}

function stubFetchScore(scoreBody: any) {
  const fetchMock = vi.fn(async (url: string) => {
    if (url.includes("/score/merchant/")) {
      return { ok: true, json: async () => scoreBody } as any;
    }
    // emi-service sidecalls
    return { ok: true, json: async () => ({ plan_id: "emi-plan-1" }) } as any;
  });
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

// ─── Load router after mocks ──────────────────────────────────────────────────

let apPayOverTimeRouter: any;
let __payOverTimeInternals: any;

beforeEach(async () => {
  vi.clearAllMocks();
  const mod = await import("./apPayOverTime");
  apPayOverTimeRouter = mod.apPayOverTimeRouter;
  __payOverTimeInternals = mod.__payOverTimeInternals;
});

// ─── amortize pure function ───────────────────────────────────────────────────

describe("__payOverTimeInternals.amortize", () => {
  it("zero rate splits principal evenly", () => {
    const schedule = __payOverTimeInternals.amortize(9000, 0, 3);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toEqual({ instalment: 1, emi: 3000, principal: 3000, interest: 0, balance: 6000 });
    expect(schedule[2]).toEqual({ instalment: 3, emi: 3000, principal: 3000, interest: 0, balance: 0 });
  });

  it("matches emi-service amortize for ₦120,000 @ 18% over 3 months", () => {
    // Values produced by python-services/emi-service amortize(120000, 18, 3).
    const schedule = __payOverTimeInternals.amortize(120000, 18, 3);
    expect(schedule).toHaveLength(3);
    expect(schedule[0]).toEqual({ instalment: 1, emi: 41205.96, principal: 39405.96, interest: 1800, balance: 80594.04 });
    expect(schedule[1]).toEqual({ instalment: 2, emi: 41205.96, principal: 39997.04, interest: 1208.91, balance: 40597 });
    expect(schedule[2]).toEqual({ instalment: 3, emi: 41205.96, principal: 40597, interest: 608.96, balance: 0 });
  });

  it("matches emi-service amortize for ₦10,000 @ 12% over 12 months", () => {
    const schedule = __payOverTimeInternals.amortize(10000, 12, 12);
    expect(schedule).toHaveLength(12);
    expect(schedule[0]).toEqual({ instalment: 1, emi: 888.49, principal: 788.49, interest: 100, balance: 9211.51 });
    expect(schedule[11]).toEqual({ instalment: 12, emi: 888.49, principal: 879.69, interest: 8.8, balance: 0 });
  });

  it("rate card is keyed by credit band in basis points", () => {
    const card = __payOverTimeInternals.PAY_OVER_TIME_RATE_CARD;
    expect(card.excellent.aprBps[3]).toBe(1800);
    expect(card.poor.aprBps[12]).toBe(4200);
    expect(__payOverTimeInternals.resolveRiskBand(800, "excellent")).toBe("excellent");
    expect(__payOverTimeInternals.resolveRiskBand(700, undefined)).toBe("good");
    expect(__payOverTimeInternals.resolveRiskBand(450, "very_poor")).toBe("very_poor");
  });
});

// ─── createPlan transactional rollback ───────────────────────────────────────

describe("apPayOverTime.createPlan", () => {
  it("rolls back ALL plan rows when payout initiation throws (no plan without funds)", async () => {
    const db = createTxMockDb({ selectResults: [[APPROVED_BILL], [VENDOR]] });
    mockGetDb.mockResolvedValue(db);
    stubFetchScore({ score: 800, risk_band: "excellent", max_loan_kobo: 100_000_000 });
    mockCreatePayout.mockResolvedValue({ id: "payout-1" });
    mockInitiatePayoutApproval.mockRejectedValue(new Error("bridge unavailable"));

    const caller = apPayOverTimeRouter.createCaller(makeCtx());
    await expect(
      caller.createPlan({ billId: "bill-1", offerId: "inst3", idempotencyKey: "idem-key-0001" }),
    ).rejects.toThrow("bridge unavailable");

    // The vendor payout was attempted (STRICT)…
    expect(mockCreatePayout).toHaveBeenCalledTimes(1);
    expect(mockInitiatePayoutApproval).toHaveBeenCalledTimes(1);
    // …but NOTHING committed: no bnpl_plans, bnpl_loans,
    // bnpl_repayment_schedules or ap_payments rows survive the rollback.
    expect(db.__committed).toHaveLength(0);
  });

  it("commits plan + loan + schedule + payment rows and flips the bill on success", async () => {
    const db = createTxMockDb({ selectResults: [[APPROVED_BILL], [VENDOR]] });
    mockGetDb.mockResolvedValue(db);
    stubFetchScore({ score: 800, risk_band: "excellent", max_loan_kobo: 100_000_000 });
    mockCreatePayout.mockResolvedValue({ id: "payout-1" });
    mockInitiatePayoutApproval.mockResolvedValue({ workflowId: "wf-1", runId: "run-1", status: "pending", createdAt: new Date().toISOString() });

    const caller = apPayOverTimeRouter.createCaller(makeCtx());
    const result = await caller.createPlan({
      billId: "bill-1",
      offerId: "inst3",
      idempotencyKey: "idem-key-0002",
    });

    expect(result.billStatus).toBe("paid");
    expect(result.installments).toBe(3);
    expect(result.principalKobo).toBe(12_000_000);
    // 1 bnpl_plans + 1 bnpl_loans + 3 bnpl_repayment_schedules + 1 ap_payments
    expect(db.__committed).toHaveLength(6);
    const apPaymentRow = db.__committed.find((v: any) => v.fundingMethod === "pay_over_time");
    expect(apPaymentRow).toBeTruthy();
    expect(apPaymentRow.metadata.planId).toBe(result.planId);
    expect(apPaymentRow.metadata.loanId).toBe(result.loanId);
    // STRICT payout initiation carried the vendor's real bank details
    expect(mockInitiatePayoutApproval).toHaveBeenCalledWith(
      expect.objectContaining({
        amount: 12_000_000,
        bankCode: "058",
        accountNumber: "0123456789",
        merchantId: "merch-1",
      }),
    );
  });

  it("fails 503 when credit scoring is unavailable (no fabricated terms)", async () => {
    const db = createTxMockDb({ selectResults: [[APPROVED_BILL]] });
    mockGetDb.mockResolvedValue(db);
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("connection refused"); }));

    const caller = apPayOverTimeRouter.createCaller(makeCtx());
    await expect(
      caller.getOffers({ billId: "bill-1" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
  });
});

// ─── repayInstallment guarded flip ───────────────────────────────────────────

describe("apPayOverTime.repayInstallment", () => {
  it("rejects an already-paid instalment via the guarded flip (CONFLICT) and never debits the wallet", async () => {
    const PAID_SCHEDULE = {
      id: "sch-1",
      bnplLoanId: "loan-1",
      instalmentNumber: 1,
      totalInstalments: 3,
      totalDueNgn: 41205.96,
      lateFeeNgn: 0,
      paidAmountNgn: null,
      status: "paid",
    };
    const LOAN = { id: "loan-1", merchantId: "merch-1", currency: "NGN", paidAmount: 0 };
    // Guarded UPDATE ... WHERE status IN ('pending','overdue') RETURNING →
    // zero rows for an already-paid instalment.
    const db = createTxMockDb({
      selectResults: [[PAID_SCHEDULE], [LOAN]],
      updateReturning: [[]],
    });
    mockGetDb.mockResolvedValue(db);

    const caller = apPayOverTimeRouter.createCaller(makeCtx());
    await expect(
      caller.repayInstallment({ scheduleId: "sch-1", idempotencyKey: "idem-key-0003" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // The guarded flip ran first and short-circuited — no wallet debit SQL
    // was ever issued inside the transaction.
    expect(db.__tx.execute).not.toHaveBeenCalled();
    expect(db.__committed).toHaveLength(0);
  });
});
