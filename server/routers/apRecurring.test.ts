/**
 * apRecurring.test.ts
 * Vitest unit tests for the P1-d recurring auto-pay router (apRecurringRouter)
 * and the shared schedule executor (executeRecurringScheduleRun in
 * server/cronJobs.ts, exercised through triggerNow).
 *
 * Mock pattern follows server/routers/hostedCheckout.test.ts
 * (vi.mock drizzle/schema + server/db chainable mocks).
 * server/cronJobs is intentionally NOT mocked — triggerNow must run the real
 * core executor against the mocked db so bill status / skip behaviour is
 * tested end-to-end.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const mockGetDb = vi.fn();
const mockAuditLog = vi.fn(async () => undefined);

// Stateful withIdempotency fake: mimics the real claim semantics — same key +
// different request body ⇒ CONFLICT; same key + same body ⇒ replay.
const idemStore = new Map<string, { hash: string; response: unknown }>();
function simpleHash(body: unknown): string {
  const sort = (v: any): any => Array.isArray(v) ? v.map(sort)
    : v && typeof v === "object" && Object.getPrototypeOf(v) === Object.prototype
      ? Object.fromEntries(Object.keys(v).sort().map((k) => [k, sort(v[k])]))
      : v;
  return JSON.stringify(sort(body));
}

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock("../../drizzle/schema", () => ({
  apRecurringSchedules: {},
  apBills: {},
  apBillLineItems: {},
  merchantNotifications: {},
}));

vi.mock("../db", () => ({
  getDb: mockGetDb,
  getUserByOpenId: vi.fn(async (openId: string) => ({
    id: 7,
    openId,
    name: "Test Merchant",
    email: "merchant@test.com",
  })),
  getMerchantByOwnerId: vi.fn(async () => ({
    id: "merch-1",
    ownerId: 7,
    tenantId: "ten_default",
    businessName: "Test Co",
  })),
}));

vi.mock("../idempotency", () => ({
  withIdempotency: vi.fn(async (opts: {
    key: string;
    requestBody: unknown;
    execute: () => Promise<unknown>;
  }) => {
    const hash = simpleHash(opts.requestBody);
    const existing = idemStore.get(opts.key);
    if (existing) {
      if (existing.hash !== hash) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Idempotency key was already used with a different request payload",
        });
      }
      return existing.response; // replay
    }
    const response = await opts.execute();
    idemStore.set(opts.key, { hash, response });
    return response;
  }),
}));

vi.mock("../kafkaClient", () => ({
  publishEvent: vi.fn(async () => true),
}));

vi.mock("../auditTrail", () => ({
  auditLog: mockAuditLog,
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// cronJobs.ts transitive deps (cronJobs itself is real — see header comment)
vi.mock("../emailService", () => ({
  sendEmail: vi.fn(async () => undefined),
}));

vi.mock("../_core/notification", () => ({
  notifyOwner: vi.fn(async () => true),
}));

vi.mock("../workerErrorFilter", () => ({
  isSuppressedWorkerError: vi.fn(() => false),
}));

vi.mock("../middlewareBridge", () => ({
  buyDigitalGoldViaMiddleware: vi.fn(),
  isBridgeAvailable: vi.fn(() => false),
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

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

const TEMPLATE = {
  description: "Monthly office supplies",
  lineItems: [
    { description: "Supplies", quantity: 2, unitPriceKobo: 50_000 }, // ₦1,000.00
  ],
  taxKobo: 7_500, // ₦75.00 → total 107_500 kobo
};
const TEMPLATE_TOTAL = 107_500;

const BASE_SCHEDULE = {
  id: 42,
  merchantId: "merch-1",
  vendorId: "ven-1",
  billTemplate: TEMPLATE,
  frequency: "monthly",
  nextRunAt: new Date(Date.now() - 60_000), // due (past)
  lastRunAt: null,
  runCount: 0,
  maxRuns: null,
  maxAmountKobo: null,
  autoApproveBelowKobo: null,
  isActive: true,
  createdBy: 7,
  createdAt: new Date(),
};

/** Thenable chainable select mock resolving to `rows`. */
function chainable(rows: any[]) {
  const q: any = {
    from: () => q,
    where: () => q,
    limit: () => q,
    orderBy: () => q,
    offset: () => q,
    then: (resolve: any, reject: any) => Promise.resolve(rows).then(resolve, reject),
  };
  return q;
}

/**
 * Mock db capturing insert values per table-mock identity and serving queued
 * select/update-returning results in call order.
 */
function createMockDb(opts: {
  selectResults?: any[][];
  updateReturning?: any[][];
  insertReturning?: any[][];
} = {}) {
  let selectCall = 0;
  let updateCall = 0;
  let insertCall = 0;
  const inserts: Array<{ table: unknown; values: any }> = [];
  const updates: Array<{ set: any }> = [];

  const db: any = {
    select: vi.fn(() => chainable(opts.selectResults?.[selectCall++] ?? [])),
    insert: vi.fn((table: unknown) => ({
      values: vi.fn((v: any) => {
        inserts.push({ table, values: v });
        const idx = insertCall++;
        const q: any = {
          returning: vi.fn(async () => opts.insertReturning?.[idx] ?? [{ id: "inserted-id" }]),
          then: (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject),
        };
        return q;
      }),
    })),
    update: vi.fn(() => ({
      set: vi.fn((s: any) => {
        updates.push({ set: s });
        const q: any = {
          where: vi.fn(() => ({
            returning: vi.fn(async () => opts.updateReturning?.[updateCall++] ?? []),
          })),
        };
        return q;
      }),
    })),
    __inserts: inserts,
    __updates: updates,
  };
  return db;
}

// ─── Load router after mocks ──────────────────────────────────────────────────

let apRecurringRouter: any;
let __apRecurringInternals: any;

beforeEach(async () => {
  vi.clearAllMocks();
  idemStore.clear();
  const mod = await import("./apRecurring");
  apRecurringRouter = mod.apRecurringRouter;
  __apRecurringInternals = mod.__apRecurringInternals;
});

// ─── computeFirstNextRunAt (pure) ─────────────────────────────────────────────

describe("__apRecurringInternals.computeFirstNextRunAt", () => {
  const now = new Date("2026-03-10T12:00:00.000Z");

  it("keeps a future startAt as the first run", () => {
    const startAt = new Date("2026-03-15T09:00:00.000Z");
    for (const frequency of ["weekly", "monthly", "quarterly"] as const) {
      expect(__apRecurringInternals.computeFirstNextRunAt(frequency, startAt, now)).toEqual(startAt);
    }
  });

  it("advances a past startAt by whole weeks until it is in the future (weekly)", () => {
    const startAt = new Date("2026-03-01T09:00:00.000Z"); // 9 days before now
    const next = __apRecurringInternals.computeFirstNextRunAt("weekly", startAt, now);
    // 2026-03-01 + 7d = 03-08 (past), + 7d = 03-15 (future)
    expect(next).toEqual(new Date("2026-03-15T09:00:00.000Z"));
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("advances a past startAt by whole months (monthly)", () => {
    const startAt = new Date("2026-01-20T09:00:00.000Z");
    const next = __apRecurringInternals.computeFirstNextRunAt("monthly", startAt, now);
    // 01-20 → 02-20 (past) → 03-20 (future)
    expect(next).toEqual(new Date("2026-03-20T09:00:00.000Z"));
  });

  it("advances a past startAt by quarters (quarterly)", () => {
    const startAt = new Date("2025-06-15T09:00:00.000Z");
    const next = __apRecurringInternals.computeFirstNextRunAt("quarterly", startAt, now);
    // 06-15 → 09-15 → 12-15 → 2026-03-15 (past? 03-15 > 03-10 → future)
    expect(next).toEqual(new Date("2026-03-15T09:00:00.000Z"));
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("never returns a slot in the past even for very old start dates", () => {
    const startAt = new Date("2020-01-01T00:00:00.000Z");
    for (const frequency of ["weekly", "monthly", "quarterly"] as const) {
      const next = __apRecurringInternals.computeFirstNextRunAt(frequency, startAt, now);
      expect(next.getTime()).toBeGreaterThan(now.getTime());
      // ...and the previous slot must be in the past (tightest future slot)
      const prev = frequency === "weekly"
        ? new Date(next.getTime() - 7 * 24 * 3600 * 1000)
        : (() => { const d = new Date(next.getTime()); d.setUTCMonth(d.getUTCMonth() - (frequency === "monthly" ? 1 : 3)); return d; })();
      expect(prev.getTime()).toBeLessThanOrEqual(now.getTime());
    }
  });
});

// ─── createSchedule ───────────────────────────────────────────────────────────

describe("createSchedule", () => {
  it("computes the first next_run_at from frequency + startAt and inserts it", async () => {
    const db = createMockDb({
      insertReturning: [[{ ...BASE_SCHEDULE, nextRunAt: new Date("2026-03-20T09:00:00.000Z") }]],
    });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const pastStart = new Date(Date.now() - 40 * 24 * 3600 * 1000); // ~40 days ago
    const res = await caller.createSchedule({
      vendorId: "ven-1",
      billTemplate: TEMPLATE,
      frequency: "monthly",
      startAt: pastStart,
      maxRuns: 12,
      maxAmountKobo: 500_000,
      autoApproveBelowKobo: 200_000,
      idempotencyKey: "create-sched-key-1",
    });

    expect(res.schedule).toBeTruthy();
    expect(db.insert).toHaveBeenCalledTimes(1);
    const values = db.__inserts[0].values;
    expect(values.merchantId).toBe("merch-1");
    expect(values.vendorId).toBe("ven-1");
    expect(values.frequency).toBe("monthly");
    expect(values.maxRuns).toBe(12);
    expect(values.maxAmountKobo).toBe(500_000);
    expect(values.autoApproveBelowKobo).toBe(200_000);
    expect(values.createdBy).toBe(7);
    expect(values.isActive).toBe(true);
    expect(values.nextRunAt).toBeInstanceOf(Date);
    // first next_run_at must be the tightest future monthly slot
    expect(values.nextRunAt.getTime()).toBeGreaterThan(Date.now());
    const oneBack = new Date(values.nextRunAt.getTime());
    oneBack.setUTCMonth(oneBack.getUTCMonth() - 1);
    expect(oneBack.getTime()).toBeLessThanOrEqual(Date.now());
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "ap_recurring.schedule_created",
      merchantId: "merch-1",
    }));
  });

  it("weekly frequency lands on a 7-day-aligned future slot", async () => {
    const db = createMockDb({ insertReturning: [[BASE_SCHEDULE]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const pastStart = new Date(Date.now() - 10 * 24 * 3600 * 1000);
    await caller.createSchedule({
      billTemplate: TEMPLATE,
      frequency: "weekly",
      startAt: pastStart,
      idempotencyKey: "create-sched-key-2",
    });

    const nextRunAt: Date = db.__inserts[0].values.nextRunAt;
    expect(nextRunAt.getTime()).toBeGreaterThan(Date.now());
    // aligned to the weekly cadence of startAt (difference is a whole number of weeks)
    const diffWeeks = (nextRunAt.getTime() - pastStart.getTime()) / (7 * 24 * 3600 * 1000);
    expect(Number.isInteger(diffWeeks)).toBe(true);
  });

  it("rejects idempotency-key reuse with a different payload (CONFLICT)", async () => {
    const db = createMockDb({ insertReturning: [[BASE_SCHEDULE], [BASE_SCHEDULE]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await caller.createSchedule({
      billTemplate: TEMPLATE,
      frequency: "monthly",
      startAt: new Date(Date.now() + 86_400_000),
      idempotencyKey: "dup-key-123",
    });
    await expect(caller.createSchedule({
      billTemplate: { ...TEMPLATE, description: "CHANGED" },
      frequency: "monthly",
      startAt: new Date(Date.now() + 86_400_000),
      idempotencyKey: "dup-key-123",
    })).rejects.toMatchObject({ code: "CONFLICT" });
    // Only the first request executed the insert
    expect(db.insert).toHaveBeenCalledTimes(1);
  });

  it("replays the stored response for same key + same payload (no double insert)", async () => {
    const db = createMockDb({ insertReturning: [[BASE_SCHEDULE]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const input = {
      billTemplate: TEMPLATE,
      frequency: "monthly" as const,
      startAt: new Date(Date.now() + 86_400_000),
      idempotencyKey: "replay-key-1",
    };
    const first = await caller.createSchedule(input);
    const second = await caller.createSchedule(input);
    expect(db.insert).toHaveBeenCalledTimes(1);
    expect(second).toEqual(first);
  });
});

// ─── updateSchedule ───────────────────────────────────────────────────────────

describe("updateSchedule", () => {
  it("guards on id + merchantId and updates only allowed fields", async () => {
    const db = createMockDb({ updateReturning: [[{ ...BASE_SCHEDULE, maxAmountKobo: 999_000 }]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.updateSchedule({
      scheduleId: 42,
      maxAmountKobo: 999_000,
      autoApproveBelowKobo: 100_000,
      nextRunAt: new Date("2026-04-01T00:00:00.000Z"),
    });
    expect(res.schedule.maxAmountKobo).toBe(999_000);
    expect(db.update).toHaveBeenCalledTimes(1);
    const set = db.__updates[0].set;
    expect(Object.keys(set).sort()).toEqual(["autoApproveBelowKobo", "maxAmountKobo", "nextRunAt"]);
    // immutable fields can never be smuggled into the SET clause
    expect(set).not.toHaveProperty("billTemplate");
    expect(set).not.toHaveProperty("frequency");
    expect(set).not.toHaveProperty("vendorId");
  });

  it("allows clearing a limit with an explicit null", async () => {
    const db = createMockDb({ updateReturning: [[BASE_SCHEDULE]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await caller.updateSchedule({ scheduleId: 42, maxAmountKobo: null });
    expect(db.__updates[0].set).toEqual({ maxAmountKobo: null });
  });

  it("throws NOT_FOUND when the guarded update hits no row (other merchant's schedule)", async () => {
    const db = createMockDb({ updateReturning: [[]] }); // ownership guard rejected the write
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.updateSchedule({ scheduleId: 999, isActive: false }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("rejects an empty update", async () => {
    const db = createMockDb();
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.updateSchedule({ scheduleId: 42 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(db.update).not.toHaveBeenCalled();
  });
});

// ─── cancelSchedule ───────────────────────────────────────────────────────────

describe("cancelSchedule", () => {
  it("flips is_active via guarded update", async () => {
    const db = createMockDb({ updateReturning: [[{ ...BASE_SCHEDULE, isActive: false }]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.cancelSchedule({ scheduleId: 42 });
    expect(res.schedule.isActive).toBe(false);
    expect(db.__updates[0].set).toEqual({ isActive: false });
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "ap_recurring.schedule_cancelled",
    }));
  });

  it("CONFLICT when already cancelled (guarded update empty, schedule exists)", async () => {
    const db = createMockDb({
      updateReturning: [[]],
      selectResults: [[{ id: 42 }]],
    });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.cancelSchedule({ scheduleId: 42 }))
      .rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("NOT_FOUND for another merchant's schedule", async () => {
    const db = createMockDb({ updateReturning: [[]], selectResults: [[]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.cancelSchedule({ scheduleId: 999 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── triggerNow (runs the real cron executor against the mock db) ────────────

describe("triggerNow", () => {
  function setupTrigger(schedule: any) {
    const claimed = { ...schedule, runCount: (schedule.runCount ?? 0) + 1 };
    const db = createMockDb({
      selectResults: [[schedule]],          // pre-claim ownership read
      updateReturning: [[claimed]],         // guarded claim
    });
    mockGetDb.mockResolvedValue(db);
    return { db, claimed };
  }

  it("creates a bill with status 'approved' when total <= autoApproveBelowKobo", async () => {
    const schedule = { ...BASE_SCHEDULE, autoApproveBelowKobo: TEMPLATE_TOTAL }; // total <= threshold
    const { db } = setupTrigger(schedule);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-aa1" });

    expect(res.run.status).toBe("created");
    expect(res.run.totalKobo).toBe(TEMPLATE_TOTAL);
    expect(res.run.billId).toBeTruthy();
    // 2 inserts: ap_bills + ap_bill_line_items
    expect(db.insert).toHaveBeenCalledTimes(2);
    const billValues = db.__inserts[0].values;
    expect(billValues.status).toBe("approved");
    expect(billValues.totalKobo).toBe(TEMPLATE_TOTAL);
    expect(billValues.subtotalKobo).toBe(100_000);
    expect(billValues.taxKobo).toBe(7_500);
    expect(billValues.source).toBe("manual");
    expect(billValues.sourceRef).toBe("recurring:42:1");
    expect(billValues.billNumber).toBe("REC-42-1");
    expect(billValues.merchantId).toBe("merch-1");
    expect(billValues.createdBy).toBe(7);
    expect(billValues.idempotencyKey).toMatch(/^recurring:42:.+$/);
    const itemValues = db.__inserts[1].values;
    expect(itemValues).toHaveLength(1);
    expect(itemValues[0]).toMatchObject({
      billId: res.run.billId,
      description: "Supplies",
      unitPriceKobo: 50_000,
      amountKobo: 100_000,
    });
    // claim advanced the schedule
    expect(db.update).toHaveBeenCalledTimes(1);
    expect(db.__updates[0].set).toHaveProperty("lastRunAt");
    expect(db.__updates[0].set).toHaveProperty("nextRunAt");
    expect(db.__updates[0].set).toHaveProperty("runCount");
  });

  it("creates a bill with status 'pending_approval' when total > autoApproveBelowKobo", async () => {
    const schedule = { ...BASE_SCHEDULE, autoApproveBelowKobo: TEMPLATE_TOTAL - 1 };
    const { db } = setupTrigger(schedule);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-pa1" });

    expect(res.run.status).toBe("created");
    expect(db.__inserts[0].values.status).toBe("pending_approval");
  });

  it("creates a 'pending_approval' bill when no auto-approve threshold is set", async () => {
    const { db } = setupTrigger({ ...BASE_SCHEDULE });
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-pa2" });
    expect(res.run.status).toBe("created");
    expect(db.__inserts[0].values.status).toBe("pending_approval");
  });

  it("skips bill creation and notifies the merchant when total exceeds maxAmountKobo", async () => {
    const schedule = { ...BASE_SCHEDULE, maxAmountKobo: TEMPLATE_TOTAL - 1 };
    const { db } = setupTrigger(schedule);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-mx1" });

    expect(res.run.status).toBe("skipped_max_amount");
    expect(res.run.billId).toBeNull();
    expect(res.run.totalKobo).toBe(TEMPLATE_TOTAL);
    // Exactly ONE insert: the merchant_notifications warning — no ap_bills row
    expect(db.insert).toHaveBeenCalledTimes(1);
    const notif = db.__inserts[0].values;
    expect(notif.merchantId).toBe("merch-1");
    expect(notif.type).toBe("ap_recurring");
    expect(notif.title).toMatch(/amount limit exceeded/i);
    expect(notif.priority).toBe("high");
    // audited as a skip
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: "ap_recurring.run_skipped_max_amount",
      actorId: "system",
    }));
  });

  it("CONFLICT when the schedule is inactive", async () => {
    const db = createMockDb({ selectResults: [[{ ...BASE_SCHEDULE, isActive: false }]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-ia1" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.update).not.toHaveBeenCalled();
    expect(db.insert).not.toHaveBeenCalled();
  });

  it("NOT_FOUND for another merchant's schedule", async () => {
    const db = createMockDb({ selectResults: [[]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.triggerNow({ scheduleId: 999, idempotencyKey: "trigger-key-nf1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("CONFLICT when the guarded claim loses the race / max runs reached", async () => {
    const db = createMockDb({
      selectResults: [[BASE_SCHEDULE]],
      updateReturning: [[]], // claim guard rejected (concurrent run or max_runs)
    });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.triggerNow({ scheduleId: 42, idempotencyKey: "trigger-key-cr1" }))
      .rejects.toMatchObject({ code: "CONFLICT" });
    expect(db.insert).not.toHaveBeenCalled();
  });
});

// ─── runHistory / getSchedule / listSchedules ────────────────────────────────

describe("runHistory", () => {
  it("returns bills for an owned schedule", async () => {
    const bills = [
      { id: "b-2", sourceRef: "recurring:42:2", totalKobo: TEMPLATE_TOTAL },
      { id: "b-1", sourceRef: "recurring:42:1", totalKobo: TEMPLATE_TOTAL },
    ];
    const db = createMockDb({ selectResults: [[BASE_SCHEDULE], bills] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.runHistory({ scheduleId: 42 });
    expect(res.schedule.id).toBe(42);
    expect(res.bills).toHaveLength(2);
    expect(res.bills[0].sourceRef).toMatch(/^recurring:42:/);
  });

  it("NOT_FOUND for another merchant's schedule", async () => {
    const db = createMockDb({ selectResults: [[]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.runHistory({ scheduleId: 999 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("getSchedule / listSchedules", () => {
  it("getSchedule returns the owned schedule", async () => {
    const db = createMockDb({ selectResults: [[BASE_SCHEDULE]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.getSchedule({ scheduleId: 42 });
    expect(res.schedule.id).toBe(42);
  });

  it("getSchedule NOT_FOUND for another merchant's schedule", async () => {
    const db = createMockDb({ selectResults: [[]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    await expect(caller.getSchedule({ scheduleId: 999 }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("listSchedules returns the merchant's schedules", async () => {
    const db = createMockDb({ selectResults: [[BASE_SCHEDULE, { ...BASE_SCHEDULE, id: 43 }]] });
    mockGetDb.mockResolvedValue(db);
    const caller = apRecurringRouter.createCaller(makeCtx());

    const res = await caller.listSchedules({ isActive: true });
    expect(res.schedules).toHaveLength(2);
  });
});
