/**
 * apVendorDirectory.test.ts
 * Vitest unit tests for the AP vendor directory router (Melio P1-b).
 * Mocking pattern follows server/routers/hostedCheckout.test.ts:
 * vi.mock server/db chainable mocks + createCaller through the real tRPC stack.
 * drizzle/schema is NOT mocked — real table definitions work standalone with
 * drizzle-orm operators (eq/and/sql) without a live connection.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─── Mocks (hoisted — factories must not reference module-level vars) ─────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
  getUserByOpenId: vi.fn(),
  getMerchantByOwnerId: vi.fn(),
}));

vi.mock("../idempotency", () => ({
  // Pass-through: execute immediately, no key persistence in unit tests.
  withIdempotency: vi.fn((opts: { execute: () => Promise<unknown> }) => opts.execute()),
}));

vi.mock("../kafkaClient", () => ({
  publishEvent: vi.fn().mockResolvedValue(true),
  KAFKA_TOPICS: { NOTIFICATIONS: "paygate.notifications" },
}));

vi.mock("../auditTrail", () => ({
  auditLog: vi.fn().mockResolvedValue(undefined),
  buildAuditEntry: vi.fn(
    (ctx: any, merchantId: string, action: string, resource: string, resourceId?: string, metadata?: unknown) => ({
      merchantId,
      actorId: ctx.user.openId,
      actorName: ctx.user.name ?? ctx.user.openId,
      action,
      resource,
      resourceId,
      metadata,
    }),
  ),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Imports under test (after mocks) ─────────────────────────────────────────

import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { publishEvent } from "../kafkaClient";
import { auditLog } from "../auditTrail";
import type { TrpcContext } from "../_core/context";

// ─── Mock Drizzle DB ──────────────────────────────────────────────────────────

/**
 * Chainable Drizzle mock with result queues:
 *  - each select query (terminated by await/.limit/.offset) shifts selectQueue
 *  - each update...returning() shifts updateQueue
 *  - update...where() awaited without returning resolves [] (fire-and-forget)
 *  - insert...values() awaited without returning resolves []
 */
function createMockDb() {
  const selectQueue: any[][] = [];
  const updateQueue: any[][] = [];
  const insertQueue: any[][] = [];
  const setCalls: Array<{ table: any; value: any }> = [];
  const insertCalls: Array<{ table: any; value: any }> = [];

  function makeSelectChain(): any {
    let resolved = false;
    const resolveOnce = (): Promise<any[]> => {
      if (resolved) return Promise.resolve([]);
      resolved = true;
      return Promise.resolve(selectQueue.length ? selectQueue.shift()! : []);
    };
    const chain: any = {
      from: vi.fn(() => chain),
      where: vi.fn(() => chain),
      orderBy: vi.fn(() => chain),
      groupBy: vi.fn(() => chain),
      innerJoin: vi.fn(() => chain),
      leftJoin: vi.fn(() => chain),
      limit: vi.fn(() => resolveOnce()),
      offset: vi.fn(() => resolveOnce()),
      returning: vi.fn(() => resolveOnce()),
      then: (onF: any, onR: any) => resolveOnce().then(onF, onR),
    };
    return chain;
  }

  const db: any = {
    select: vi.fn(() => makeSelectChain()),
    update: vi.fn((table: any) => ({
      set: vi.fn((value: any) => {
        setCalls.push({ table, value });
        return {
          where: vi.fn(() => ({
            returning: vi.fn(() => Promise.resolve(updateQueue.length ? updateQueue.shift()! : [])),
            then: (onF: any, onR: any) => Promise.resolve([]).then(onF, onR),
          })),
        };
      }),
    })),
    insert: vi.fn((table: any) => ({
      values: vi.fn((value: any) => {
        insertCalls.push({ table, value });
        return {
          returning: vi.fn(() => Promise.resolve(insertQueue.length ? insertQueue.shift()! : [])),
          onConflictDoNothing: vi.fn(() => ({ returning: vi.fn(() => Promise.resolve([])) })),
          then: (onF: any, onR: any) => Promise.resolve([]).then(onF, onR),
        };
      }),
    })),
    selectQueue,
    updateQueue,
    insertQueue,
    setCalls,
    insertCalls,
  };
  db.transaction = vi.fn(async (fn: any) => fn(db));
  return db;
}

// ─── Fixtures ─────────────────────────────────────────────────────────────────

const MERCHANT_ID = "merch_1";

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 7,
      openId: "merchant-open-id",
      email: "merchant@test.com",
      name: "Test Merchant",
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

function makeCredit(overrides: Partial<any> = {}) {
  return {
    id: 1,
    merchantId: MERCHANT_ID,
    vendorId: "v1",
    amountKobo: 80_000,
    remainingKobo: 80_000,
    source: "overpayment",
    billId: null,
    status: "open",
    createdAt: new Date("2026-01-01"),
    appliedAt: null,
    ...overrides,
  };
}

function makeBill(overrides: Partial<any> = {}) {
  return {
    id: "bill-1",
    merchantId: MERCHANT_ID,
    vendorId: "v1",
    billNumber: "INV-001",
    status: "approved",
    currency: "NGN",
    totalKobo: 100_000,
    amountPaidKobo: 0,
    whtKobo: 0,
    createdAt: new Date("2026-01-02"),
    updatedAt: new Date("2026-01-02"),
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let router: any;
let db: ReturnType<typeof createMockDb>;

beforeAll(async () => {
  const mod = await import("./apVendorDirectory");
  router = mod.apVendorDirectoryRouter;
});

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db);
  vi.mocked(getUserByOpenId).mockResolvedValue({ id: 7, openId: "merchant-open-id" } as any);
  vi.mocked(getMerchantByOwnerId).mockResolvedValue({ id: MERCHANT_ID } as any);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("apVendorDirectory.applyCreditToBill", () => {
  it("throws CONFLICT when the guarded credit decrement finds insufficient remaining", async () => {
    // Credit has 300 kobo remaining; we try to apply 500 → guarded UPDATE
    // (WHERE remaining_kobo >= 500) matches nothing → empty RETURNING → CONFLICT.
    db.selectQueue.push([makeCredit({ remainingKobo: 300, amountKobo: 300 })]);
    db.selectQueue.push([makeBill()]);
    db.updateQueue.push([]); // guarded credit decrement → no rows

    const caller = router.createCaller(makeCtx());
    await expect(
      caller.applyCreditToBill({
        creditId: 1,
        billId: "bill-1",
        amountKobo: 500,
        idempotencyKey: "idem-apply-0001",
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // No downstream side effects on the failed path.
    expect(auditLog).not.toHaveBeenCalled();
    expect(publishEvent).not.toHaveBeenCalled();
  });

  it("requires an idempotencyKey of at least 8 chars", async () => {
    const caller = router.createCaller(makeCtx());
    await expect(
      caller.applyCreditToBill({ creditId: 1, billId: "bill-1", amountKobo: 100, idempotencyKey: "short" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });

  it("rejects when credit and bill belong to different vendors", async () => {
    db.selectQueue.push([makeCredit({ vendorId: "v1" })]);
    db.selectQueue.push([makeBill({ vendorId: "v2" })]);

    const caller = router.createCaller(makeCtx());
    await expect(
      caller.applyCreditToBill({
        creditId: 1,
        billId: "bill-1",
        amountKobo: 100,
        idempotencyKey: "idem-apply-0002",
      }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("apVendorDirectory.autoApplyCredits", () => {
  it("applies open credits oldest-first and caps the last one at the bill remaining", async () => {
    // Bill: total 1000, nothing paid → remaining 1000.
    db.selectQueue.push([makeBill({ totalKobo: 1000, amountPaidKobo: 0 })]);
    // Open credits: 800 then 500 — the second must be capped at 200.
    db.selectQueue.push([
      makeCredit({ id: 1, remainingKobo: 800, createdAt: new Date("2026-01-01") }),
      makeCredit({ id: 2, remainingKobo: 500, createdAt: new Date("2026-01-03") }),
    ]);
    // Credit 1: guarded credit update + guarded bill update (vendor balance update is fire-and-forget).
    db.updateQueue.push([{ id: 1, vendorId: "v1", remainingKobo: 0, status: "applied" }]);
    db.updateQueue.push([makeBill({ amountPaidKobo: 800, status: "partially_paid" })]);
    // Credit 2: capped at 200 → remaining 300; bill fully paid.
    db.updateQueue.push([{ id: 2, vendorId: "v1", remainingKobo: 300, status: "open" }]);
    db.updateQueue.push([makeBill({ amountPaidKobo: 1000, status: "paid" })]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.autoApplyCredits({ billId: "bill-1" });

    expect(result.appliedKobo).toBe(1000);
    expect(result.applications).toEqual([
      { creditId: 1, appliedKobo: 800 },
      { creditId: 2, appliedKobo: 200 }, // capped at bill remaining
    ]);
    expect(result.billStatus).toBe("paid");

    // Bill status recompute: first application → partially_paid, second → paid.
    const billSetCalls = db.setCalls.filter((c) => "amountPaidKobo" in c.value && "status" in c.value);
    expect(billSetCalls).toHaveLength(2);
    expect(billSetCalls[0].value.status).toBe("partially_paid");
    expect(billSetCalls[1].value.status).toBe("paid");

    // Credit 1 fully consumed → status flipped to applied; credit 2 stays open.
    const creditSetCalls = db.setCalls.filter((c) => "remainingKobo" in c.value);
    expect(creditSetCalls[0].value.status).toBe("applied");
    expect(creditSetCalls[1].value.status).toBe("open");

    expect(auditLog).toHaveBeenCalledTimes(1);
    expect(publishEvent).toHaveBeenCalledWith(
      "paygate.ap.bills",
      expect.objectContaining({ type: "ap.vendor_credit.auto_applied", billId: "bill-1", appliedKobo: 1000 }),
      "bill-1",
    );
  });

  it("applies nothing when the bill is already fully paid", async () => {
    db.selectQueue.push([makeBill({ totalKobo: 1000, amountPaidKobo: 1000, status: "approved" })]);
    db.selectQueue.push([makeCredit({ id: 1, remainingKobo: 800 })]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.autoApplyCredits({ billId: "bill-1" });

    expect(result.appliedKobo).toBe(0);
    expect(result.applications).toEqual([]);
    expect(db.setCalls).toHaveLength(0);
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("rejects bills that are not in a creditable status", async () => {
    db.selectQueue.push([makeBill({ status: "draft" })]);

    const caller = router.createCaller(makeCtx());
    await expect(caller.autoApplyCredits({ billId: "bill-1" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});

describe("apVendorDirectory.createVendor / updateVendor — TIN enqueue", () => {
  it("createVendor with a TIN inserts an unverified tin_validations row (validator_ref 'pending')", async () => {
    db.insertQueue.push([{ id: "new-vendor", merchantId: MERCHANT_ID, name: "Acme Ltd", tin: "12345678-0001" }]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.createVendor({ name: "Acme Ltd", tin: "12345678-0001" });

    expect(result.vendor.id).toBe("new-vendor");
    // Second insert = the tin_validations enqueue row.
    const tinInsert = db.insertCalls.find((c) => c.value && c.value.subjectType === "vendor");
    expect(tinInsert).toBeTruthy();
    expect(tinInsert!.value.status).toBe("unverified");
    expect(tinInsert!.value.validatorRef).toBe("pending");
    expect(tinInsert!.value.tin).toBe("12345678-0001");
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("updateVendor with a changed TIN re-enqueues validation", async () => {
    db.selectQueue.push([{ id: "v1", merchantId: MERCHANT_ID, name: "Acme", tin: "OLD-TIN-01", isActive: true }]);
    db.updateQueue.push([{ id: "v1", merchantId: MERCHANT_ID, name: "Acme", tin: "12345678-0002" }]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.updateVendor({ vendorId: "v1", tin: "12345678-0002" });

    expect(result.tinValidationEnqueued).toBe(true);
    const tinInsert = db.insertCalls.find((c) => c.value && c.value.subjectType === "vendor");
    expect(tinInsert).toBeTruthy();
    expect(tinInsert!.value.subjectId).toBe("v1");
    expect(tinInsert!.value.status).toBe("unverified");
  });
});
