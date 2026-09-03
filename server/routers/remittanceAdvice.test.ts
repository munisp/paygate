/**
 * remittanceAdvice.test.ts
 * Vitest unit tests for the remittance advice router (Melio P1-f).
 * Mocking pattern follows server/routers/hostedCheckout.test.ts (vi.mock
 * server/db chainable mocks + createCaller through the real tRPC stack).
 * drizzle/schema is NOT mocked — real table definitions work standalone with
 * drizzle-orm operators without a live connection.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from "vitest";

// ─── Mocks (hoisted — factories must not reference module-level vars) ─────────

vi.mock("../db", () => ({
  getDb: vi.fn(),
  getUserByOpenId: vi.fn(),
  getMerchantByOwnerId: vi.fn(),
}));

vi.mock("../idempotency", () => ({
  withIdempotency: vi.fn((opts: { execute: () => Promise<unknown> }) => opts.execute()),
}));

vi.mock("../kafkaClient", () => ({
  publishEvent: vi.fn().mockResolvedValue(true),
  KAFKA_TOPICS: { NOTIFICATIONS: "paygate.notifications" },
}));

vi.mock("../fluvioClient", () => ({
  produceRecord: vi.fn().mockResolvedValue(true),
  FLUVIO_TOPICS: { NOTIFICATION_STREAM: "notification-stream" },
}));

vi.mock("../emailService", () => ({
  sendEmail: vi.fn().mockResolvedValue(true),
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
import { sendEmail } from "../emailService";
import { publishEvent } from "../kafkaClient";
import { produceRecord } from "../fluvioClient";
import { auditLog } from "../auditTrail";
import type { TrpcContext } from "../_core/context";

// ─── Mock Drizzle DB ──────────────────────────────────────────────────────────

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

function makePaymentRow(overrides: Partial<any> = {}) {
  return {
    payment: {
      id: "pay-1",
      billId: "bill-1",
      merchantId: MERCHANT_ID,
      amountKobo: 95_000,
      feeKobo: 0,
      status: "completed",
      reference: "AP-REF-2026-0009",
      remittanceSentAt: null,
      metadata: null,
      createdAt: new Date("2026-02-01"),
      ...((overrides.payment as object) ?? {}),
    },
    bill: {
      id: "bill-1",
      merchantId: MERCHANT_ID,
      vendorId: "v1",
      billNumber: "INV-009",
      totalKobo: 100_000,
      whtKobo: 5_000,
      status: "paid",
      ...((overrides.bill as object) ?? {}),
    },
  };
}

function makeVendor(overrides: Partial<any> = {}) {
  return {
    id: "v1",
    merchantId: MERCHANT_ID,
    name: "Acme Supplies Ltd",
    email: "ap@acme.example",
    ...overrides,
  };
}

// ─── Setup ────────────────────────────────────────────────────────────────────

let router: any;
let internals: any;
let db: ReturnType<typeof createMockDb>;

beforeAll(async () => {
  const mod = await import("./remittanceAdvice");
  router = mod.remittanceAdviceRouter;
  internals = mod.__remittanceInternals;
});

beforeEach(() => {
  vi.clearAllMocks();
  db = createMockDb();
  vi.mocked(getDb).mockResolvedValue(db);
  vi.mocked(getUserByOpenId).mockResolvedValue({ id: 7, openId: "merchant-open-id" } as any);
  vi.mocked(getMerchantByOwnerId).mockResolvedValue({ id: MERCHANT_ID } as any);
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe("remittanceAdvice internals — buildAdviceHtml", () => {
  it("renders the WHT withheld line, payment reference and net paid", () => {
    const html = internals.buildAdviceHtml(
      { name: "Acme Supplies Ltd", email: "ap@acme.example" },
      { reference: "AP-REF-2026-0009", amountKobo: 95_000, feeKobo: 0, createdAt: new Date("2026-02-01") },
      [
        { billNumber: "INV-009", totalKobo: 100_000, whtKobo: 5_000 },
        { billNumber: "INV-010", totalKobo: 50_000, whtKobo: 2_500 },
      ],
      "Test Merchant",
    );

    expect(html).toContain("AP-REF-2026-0009"); // reference
    expect(html).toContain("WHT withheld"); // WHT column header
    expect(html).toContain("Total WHT withheld"); // WHT summary line
    expect(html).toContain("INV-009");
    expect(html).toContain("INV-010");
    expect(html).toContain("₦1,000.00"); // 100_000 kobo gross line
    expect(html).toContain("₦75.00"); // 7_500 kobo total WHT (5000 + 2500)
    expect(html).toContain("₦950.00"); // net paid
    expect(html).toContain("Acme Supplies Ltd");
    expect(html).toContain("Test Merchant");
  });

  it("escapes HTML in vendor / merchant names", () => {
    const html = internals.buildAdviceHtml(
      { name: '<script>alert("x")</script>', email: null },
      { reference: "REF-1", amountKobo: 100, createdAt: null },
      [],
      "M<b>erchant",
    );
    expect(html).not.toContain("<script>");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("M&lt;b&gt;erchant");
  });
});

describe("remittanceAdvice.sendAdvice", () => {
  it("sends once — a second call without resendAdvice fails guarded (no duplicate remittance_sent_at)", async () => {
    const caller = router.createCaller(makeCtx());

    // ── First call: claim succeeds → email + notification + events ──────────
    db.selectQueue.push([makePaymentRow()]); // payment + bill join
    db.selectQueue.push([makeVendor()]); // vendor lookup
    db.updateQueue.push([{ id: "pay-1", remittanceSentAt: new Date() }]); // guarded claim

    const first = await caller.sendAdvice({ apPaymentId: "pay-1", idempotencyKey: "idem-remit-0001" });
    expect(first.emailSent).toBe(true);
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(vi.mocked(sendEmail).mock.calls[0][0]).toMatchObject({
      to: "ap@acme.example",
      subject: expect.stringContaining("AP-REF-2026-0009"),
    });
    // Guarded claim wrote remittance_sent_at.
    expect(db.setCalls[0].value).toHaveProperty("remittanceSentAt");
    // In-app notification recorded + both event buses fired + audit written.
    const notifInserts = db.insertCalls.filter((c) => c.value && c.value.entityType === "ap_payment");
    expect(notifInserts.length).toBeGreaterThanOrEqual(1);
    expect(publishEvent).toHaveBeenCalledWith(
      "paygate.notifications",
      expect.objectContaining({ type: "ap.remittance.sent", apPaymentId: "pay-1" }),
      "pay-1",
    );
    expect(produceRecord).toHaveBeenCalledWith(
      "notification-stream",
      expect.objectContaining({ type: "ap.remittance.sent" }),
      "pay-1",
    );
    expect(auditLog).toHaveBeenCalledTimes(1);

    // ── Second call (new idempotency key, no resend): claim is guarded ──────
    vi.clearAllMocks();
    const db2 = createMockDb();
    vi.mocked(getDb).mockResolvedValue(db2);
    db2.selectQueue.push([makePaymentRow({ payment: { remittanceSentAt: new Date("2026-02-01") } })]);
    db2.selectQueue.push([makeVendor()]);
    db2.updateQueue.push([]); // WHERE remittance_sent_at IS NULL matches nothing

    await expect(
      caller.sendAdvice({ apPaymentId: "pay-1", idempotencyKey: "idem-remit-0002" }),
    ).rejects.toMatchObject({ code: "CONFLICT" });

    // No duplicate send: email, notification, events and audit all untouched.
    expect(sendEmail).not.toHaveBeenCalled();
    expect(db2.insertCalls).toHaveLength(0);
    expect(publishEvent).not.toHaveBeenCalled();
    expect(produceRecord).not.toHaveBeenCalled();
    expect(auditLog).not.toHaveBeenCalled();
  });

  it("records (not silently drops) the advice when the vendor has no email", async () => {
    db.selectQueue.push([makePaymentRow()]);
    db.selectQueue.push([makeVendor({ email: null })]);
    db.updateQueue.push([{ id: "pay-1", remittanceSentAt: new Date() }]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.sendAdvice({ apPaymentId: "pay-1", idempotencyKey: "idem-remit-0003" });

    expect(result.emailSent).toBe(false);
    expect(sendEmail).not.toHaveBeenCalled();
    // The skip is recorded as a merchant notification — never silent.
    const skipNotif = db.insertCalls.find((c) => c.value?.type === "ap_remittance_skipped");
    expect(skipNotif).toBeTruthy();
    expect(skipNotif!.value.body).toContain("no email");
  });

  it("rejects payments owned by another merchant (ownership via bill join)", async () => {
    db.selectQueue.push([]); // join with merchant filter → no row

    const caller = router.createCaller(makeCtx());
    await expect(
      caller.sendAdvice({ apPaymentId: "pay-9", idempotencyKey: "idem-remit-0004" }),
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("remittanceAdvice.resendAdvice", () => {
  it("bumps sendCount in ap_payments.metadata and resends", async () => {
    db.selectQueue.push([
      makePaymentRow({ payment: { remittanceSentAt: new Date("2026-02-01"), metadata: { sendCount: 1 } } }),
    ]);
    db.selectQueue.push([makeVendor()]);
    db.updateQueue.push([{ id: "pay-1", remittanceSentAt: new Date(), metadata: { sendCount: 2 } }]);

    const caller = router.createCaller(makeCtx());
    const result = await caller.resendAdvice({ apPaymentId: "pay-1" });

    expect(result.sendCount).toBe(2);
    expect(result.emailSent).toBe(true);
    expect(db.setCalls[0].value.metadata).toEqual({ sendCount: 2 });
    expect(auditLog).toHaveBeenCalledTimes(1);
  });

  it("refuses to resend when nothing was ever sent", async () => {
    db.selectQueue.push([makePaymentRow()]); // remittanceSentAt: null
    db.selectQueue.push([makeVendor()]);

    const caller = router.createCaller(makeCtx());
    await expect(caller.resendAdvice({ apPaymentId: "pay-1" })).rejects.toMatchObject({ code: "CONFLICT" });
  });
});
