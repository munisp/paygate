/**
 * arPartialPayments.test.ts
 * Unit tests for the P2-c AR partial-payments router.
 *
 * Mocking pattern follows server/routers/hostedCheckout.test.ts (vi.mock of
 * server/db with a chainable query builder) — extended here with a result
 * QUEUE so each awaited query in a procedure resolves the next queued value,
 * and a call log so guarded UPDATE payloads can be asserted.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: any[] }>,
  queue: [] as any[],
  idempotencyCalls: [] as any[],
  kafkaEvents: [] as any[],
  auditEntries: [] as any[],
}));

// ─── Chainable db mock (queue-driven) ─────────────────────────────────────────
vi.mock("../db", () => {
  const chain: any = {};
  for (const m of [
    "select", "from", "where", "limit", "offset", "orderBy", "insert", "values",
    "update", "set", "delete", "innerJoin", "for", "onConflictDoNothing",
    "groupBy", "returning",
  ]) {
    chain[m] = (...args: any[]) => {
      h.calls.push({ method: m, args });
      return chain;
    };
  }
  // Awaiting any position of the chain resolves the next queued result.
  chain.then = (res: any, rej: any) => {
    const v = h.queue.length ? h.queue.shift() : [];
    return Promise.resolve(v).then(res, rej);
  };
  chain.transaction = async (fn: any) => fn(chain);
  return {
    db: chain,
    getUserByOpenId: vi.fn().mockResolvedValue({ id: 1, openId: "op_merchant", name: "Merchant User" }),
    getMerchantByOwnerId: vi.fn().mockResolvedValue({
      id: "mer_1", tenantId: "ten_default", ownerId: 1, businessName: "Test Merchant",
    }),
  };
});

vi.mock("../idempotency", () => ({
  withIdempotency: (opts: any) => {
    h.idempotencyCalls.push(opts);
    return opts.execute();
  },
}));

vi.mock("../auditTrail", () => ({
  auditLog: (entry: any) => {
    h.auditEntries.push(entry);
    return Promise.resolve();
  },
}));

vi.mock("../kafkaClient", () => ({
  publishEvent: (topic: string, value: any) => {
    h.kafkaEvents.push({ topic, value });
    return Promise.resolve(true);
  },
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// pbacProcedure('approve_payout') lazily imports ../pbac at call time.
vi.mock("../pbac", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}));

// ─── Subject under test (real router; real drizzle schema for column refs) ───
import { arPartialPaymentsRouter, __partialInternals } from "./arPartialPayments";

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function makeCtx(): any {
  return {
    user: {
      id: 1,
      openId: "op_merchant",
      email: "merchant@example.com",
      name: "Merchant User",
      role: "user",
      loginMethod: "manus",
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: {} },
    res: {},
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: "INV-1",
    merchantId: "mer_1",
    customerEmail: "cust@example.com",
    customerName: "Customer",
    lineItems: [],
    subtotalKobo: 10000,
    taxKobo: 0,
    totalKobo: 10000,
    currency: "NGN",
    status: "sent",
    dueDate: null,
    paidAt: null,
    paymentLinkUrl: "https://pay.example.com/checkout/plink_1",
    notes: null,
    feePolicy: "merchant_absorbs",
    surchargeBps: 290,
    allowPartial: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

const IDEM = { idempotencyKey: "idem-key-123456" };

beforeEach(() => {
  h.calls.length = 0;
  h.queue.length = 0;
  h.idempotencyCalls.length = 0;
  h.kafkaEvents.length = 0;
  h.auditEntries.length = 0;
});

// ─── recomputeStatus (pure) ───────────────────────────────────────────────────
describe("recomputeStatus (pure)", () => {
  it("returns 'paid' when paidKobo >= totalKobo", () => {
    expect(__partialInternals.recomputeStatus(10000, 10000)).toBe("paid");
    expect(__partialInternals.recomputeStatus(10000, 15000)).toBe("paid");
  });

  it("returns 'partially_paid' when 0 < paidKobo < totalKobo", () => {
    expect(__partialInternals.recomputeStatus(10000, 1)).toBe("partially_paid");
    expect(__partialInternals.recomputeStatus(10000, 9999)).toBe("partially_paid");
  });

  it("returns 'sent' when nothing has been paid", () => {
    expect(__partialInternals.recomputeStatus(10000, 0)).toBe("sent");
  });

  it("never returns 'paid' for a zero-total invoice with zero paid", () => {
    expect(__partialInternals.recomputeStatus(0, 0)).toBe("sent");
  });
});

// ─── recordInvoicePayment ─────────────────────────────────────────────────────
describe("recordInvoicePayment", () => {
  it("records a partial payment and flips the invoice to partially_paid", async () => {
    const invoice = makeInvoice();
    h.queue.push(
      [invoice],                                        // FOR UPDATE invoice lock
      [],                                               // existing payments
      [invoice],                                        // applyInvoicePayment re-read
      [{ id: "pay_1", invoiceId: "INV-1", amountKobo: 4000 }], // insert returning
      [{ id: "pay_1", amountKobo: 4000, metadata: null }],     // recompute sum
      [{ ...invoice, status: "partially_paid" }],       // guarded update returning
    );

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    const result = await caller.recordInvoicePayment({
      invoiceId: "INV-1",
      amountKobo: 4000,
      method: "bank_transfer",
      reference: "NIP-REF-0001",
      ...IDEM,
    });

    expect(result.success).toBe(true);
    expect(result.status).toBe("partially_paid");
    expect(result.balanceDueKobo).toBe(6000);

    // Guarded status flip payload: partially_paid, NO paidAt.
    const setCalls = h.calls.filter((c) => c.method === "set");
    const invoiceSet = setCalls[setCalls.length - 1].args[0];
    expect(invoiceSet.status).toBe("partially_paid");
    expect("paidAt" in invoiceSet).toBe(false);

    // Idempotency wrapper engaged with the caller's key.
    expect(h.idempotencyCalls).toHaveLength(1);
    expect(h.idempotencyCalls[0].key).toBe(IDEM.idempotencyKey);
    expect(h.idempotencyCalls[0].merchantId).toBe("mer_1");

    // Audit + non-fatal Kafka domain event.
    expect(h.auditEntries[0]?.action).toBe("ar.invoice.payment_recorded");
    expect(h.kafkaEvents[0]?.topic).toBe("paygate.ar.invoices");
  });

  it("flips to paid (with paidAt) when the payment settles the full balance", async () => {
    const invoice = makeInvoice();
    h.queue.push(
      [invoice],
      [{ id: "pay_0", amountKobo: 4000, metadata: null }],     // 4000 already paid
      [invoice],
      [{ id: "pay_1", invoiceId: "INV-1", amountKobo: 6000 }],
      [
        { id: "pay_0", amountKobo: 4000, metadata: null },
        { id: "pay_1", amountKobo: 6000, metadata: null },
      ],
      [{ ...invoice, status: "paid" }],
    );

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    const result = await caller.recordInvoicePayment({
      invoiceId: "INV-1",
      amountKobo: 6000,
      method: "card",
      reference: "CARD-REF-0002",
      ...IDEM,
    });

    expect(result.status).toBe("paid");
    expect(result.balanceDueKobo).toBe(0);
    const setCalls = h.calls.filter((c) => c.method === "set");
    const invoiceSet = setCalls[setCalls.length - 1].args[0];
    expect(invoiceSet.status).toBe("paid");
    expect(invoiceSet.paidAt).toBeInstanceOf(Date);
  });

  it("rejects overpayment beyond the balance due", async () => {
    const invoice = makeInvoice();
    h.queue.push([invoice], []);

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    await expect(
      caller.recordInvoicePayment({
        invoiceId: "INV-1",
        amountKobo: 10001,
        method: "cash",
        reference: "CASH-REF-0003",
        ...IDEM,
      }),
    ).rejects.toThrow(/exceeds the balance due/);

    // No ledger row may be written on rejection.
    expect(h.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("rejects a partial payment when the invoice disallows partial payments", async () => {
    const invoice = makeInvoice({ allowPartial: false });
    h.queue.push([invoice], []);

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    await expect(
      caller.recordInvoicePayment({
        invoiceId: "INV-1",
        amountKobo: 5000,
        method: "wallet",
        reference: "WLT-REF-00004",
        ...IDEM,
      }),
    ).rejects.toThrow(/does not allow partial payments/);
    expect(h.calls.filter((c) => c.method === "insert")).toHaveLength(0);
  });

  it("accepts a FULL payment even when partial payments are disallowed", async () => {
    const invoice = makeInvoice({ allowPartial: false });
    h.queue.push(
      [invoice],
      [],
      [invoice],
      [{ id: "pay_1", invoiceId: "INV-1", amountKobo: 10000 }],
      [{ id: "pay_1", amountKobo: 10000, metadata: null }],
      [{ ...invoice, status: "paid" }],
    );

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    const result = await caller.recordInvoicePayment({
      invoiceId: "INV-1",
      amountKobo: 10000,
      method: "ussd",
      reference: "USSD-REF-0005",
      ...IDEM,
    });
    expect(result.status).toBe("paid");
  });

  it("rejects payments on a paid invoice (terminal state)", async () => {
    const invoice = makeInvoice({ status: "paid" });
    h.queue.push([invoice]);

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    await expect(
      caller.recordInvoicePayment({
        invoiceId: "INV-1",
        amountKobo: 100,
        method: "cash",
        reference: "CASH-REF-0006",
        ...IDEM,
      }),
    ).rejects.toThrow(/'paid'/);
  });
});

// ─── getBalanceDue ────────────────────────────────────────────────────────────
describe("getBalanceDue", () => {
  it("never returns a negative balance", async () => {
    const invoice = makeInvoice();
    h.queue.push(
      [invoice],
      [{ id: "pay_1", amountKobo: 12000, metadata: null }], // over-recorded ledger
    );

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    const result = await caller.getBalanceDue({ invoiceId: "INV-1" });
    expect(result.paidKobo).toBe(12000);
    expect(result.balanceDueKobo).toBe(0);
  });
});

// ─── refundPartialPayment ─────────────────────────────────────────────────────
describe("refundPartialPayment", () => {
  it("marks the payment refunded and flips a paid invoice back to partially_paid", async () => {
    const invoice = makeInvoice({ status: "paid", paidAt: new Date() });
    const payment = { id: "pay_1", invoiceId: "INV-1", amountKobo: 4000, metadata: null, reference: "NIP-REF-0001" };
    h.queue.push(
      [{ payment, invoice }],                          // ownership join
      [invoice],                                       // FOR UPDATE lock
      [{ ...payment, metadata: { status: "refunded" } }], // mark refunded returning
      [
        { id: "pay_1", amountKobo: 4000, metadata: { status: "refunded" } },
        { id: "pay_2", amountKobo: 6000, metadata: null },
      ],                                               // recompute sum (refund excluded)
      [{ ...invoice, status: "partially_paid", paidAt: null }], // guarded flip
    );

    const caller = arPartialPaymentsRouter.createCaller(makeCtx());
    const result = await caller.refundPartialPayment({
      paymentId: "pay_1",
      ...IDEM,
    });

    expect(result.success).toBe(true);
    expect(result.alreadyRefunded).toBe(false);
    expect(result.status).toBe("partially_paid");
    expect(result.balanceDueKobo).toBe(4000);

    // Payment row marked refunded via metadata.
    const setCalls = h.calls.filter((c) => c.method === "set");
    const paymentSet = setCalls[0].args[0];
    expect(paymentSet.metadata.status).toBe("refunded");
    expect(typeof paymentSet.metadata.refundedAt).toBe("string");
    // Invoice flip cleared paidAt.
    const invoiceSet = setCalls[setCalls.length - 1].args[0];
    expect(invoiceSet.status).toBe("partially_paid");
    expect(invoiceSet.paidAt).toBeNull();

    expect(h.auditEntries[0]?.action).toBe("ar.invoice.payment_refunded");
  });
});
