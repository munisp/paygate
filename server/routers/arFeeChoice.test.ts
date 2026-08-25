/**
 * arFeeChoice.test.ts
 * Unit tests for the P1-c AR fee-choice router.
 *
 * Mocking pattern follows server/routers/hostedCheckout.test.ts (vi.mock of
 * server/db with a chainable query builder) — extended with a result QUEUE so
 * each awaited query in a procedure resolves the next queued value.
 */

import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  calls: [] as Array<{ method: string; args: any[] }>,
  queue: [] as any[],
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

// arPartialPayments (imported for shared internals) pulls these modules.
vi.mock("../idempotency", () => ({
  withIdempotency: (opts: any) => opts.execute(),
}));
vi.mock("../kafkaClient", () => ({
  publishEvent: vi.fn().mockResolvedValue(true),
}));
vi.mock("../auditTrail", () => ({
  auditLog: (entry: any) => {
    h.auditEntries.push(entry);
    return Promise.resolve();
  },
}));
vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));
vi.mock("../pbac", () => ({
  requirePermission: vi.fn().mockResolvedValue(undefined),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { arFeeChoiceRouter, __feeChoiceInternals } from "./arFeeChoice";

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

function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "plink_1",
    tenantId: "ten_default",
    merchantId: "mer_1",
    slug: "inv-1",
    title: "Invoice INV-1",
    description: null,
    amount: 100000,
    currency: "NGN",
    isActive: true,
    usageLimit: null,
    usageCount: 0,
    redirectUrl: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

function makeInvoice(overrides: Record<string, unknown> = {}) {
  return {
    invoiceId: "INV-1",
    merchantId: "mer_1",
    customerEmail: "cust@example.com",
    customerName: "Customer",
    lineItems: [],
    subtotalKobo: 100000,
    taxKobo: 0,
    totalKobo: 100000,
    currency: "NGN",
    status: "sent",
    dueDate: null,
    paidAt: null,
    paymentLinkUrl: "https://pay.example.com/checkout/plink_1",
    notes: null,
    feePolicy: "customer_pays",
    surchargeBps: 290,
    allowPartial: true,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  h.calls.length = 0;
  h.queue.length = 0;
  h.auditEntries.length = 0;
});

// ─── getCheckoutQuote ─────────────────────────────────────────────────────────
describe("getCheckoutQuote", () => {
  it("computes the card surcharge from the interchange schedule and ALWAYS returns the disclosure", async () => {
    h.queue.push(
      [makeLink()],                                   // payment link resolution
      [makeInvoice()],                                // invoice bound to the link
      [],                                             // invoice_payments (none yet)
      [{ basisPoints: 290, isActive: true }],         // latest interchange schedule row
    );

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const quote = await caller.getCheckoutQuote({ paymentLinkToken: "plink_1" });

    // round(100000 × 290 / 10000) = 2900
    expect(quote.baseKobo).toBe(100000);
    expect(quote.surchargeBps).toBe(290);
    expect(quote.surchargeKobo).toBe(2900);
    expect(quote.totalDueKobo).toBe(102900);
    expect(quote.balanceDueKobo).toBe(100000);
    expect(quote.disclosureText).toBe(
      "A 2.9% card processing fee is added by the merchant. You can pay by bank transfer to avoid this fee.",
    );
  });

  it("uses the interchange schedule over the invoice's own surcharge_bps (cross-check)", async () => {
    h.queue.push(
      [makeLink()],
      [makeInvoice({ surchargeBps: 290 })],
      [],
      [{ basisPoints: 200, isActive: true }],
    );

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const quote = await caller.getCheckoutQuote({ paymentLinkToken: "plink_1" });

    expect(quote.surchargeBps).toBe(200);
    expect(quote.surchargeKobo).toBe(2000);
    expect(quote.totalDueKobo).toBe(102000);
    expect(quote.disclosureText).toContain("2%");
  });

  it("falls back to invoice.surcharge_bps when the schedule has no active row", async () => {
    h.queue.push(
      [makeLink()],
      [makeInvoice({ surchargeBps: 150 })],
      [],
      [],                                             // no schedule row
    );

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const quote = await caller.getCheckoutQuote({ paymentLinkToken: "plink_1" });

    expect(quote.surchargeBps).toBe(150);
    expect(quote.surchargeKobo).toBe(1500);
    expect(quote.disclosureText).toContain("1.5%");
  });

  it("charges no surcharge and returns no disclosure when the merchant absorbs the fee", async () => {
    h.queue.push(
      [makeLink()],
      [makeInvoice({ feePolicy: "merchant_absorbs" })],
      [],
      // note: no interchange lookup happens for merchant_absorbs
    );

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const quote = await caller.getCheckoutQuote({ paymentLinkToken: "plink_1" });

    expect(quote.surchargeKobo).toBe(0);
    expect(quote.totalDueKobo).toBe(100000);
    expect(quote.disclosureText).toBeNull();
  });

  it("reflects the remaining balance when partial payments already exist", async () => {
    h.queue.push(
      [makeLink()],
      [makeInvoice()],
      [{ id: "pay_1", amountKobo: 40000, metadata: null }],
      [{ basisPoints: 290, isActive: true }],
    );

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const quote = await caller.getCheckoutQuote({ paymentLinkToken: "plink_1" });
    expect(quote.balanceDueKobo).toBe(60000);
  });

  it("rejects an unknown payment link", async () => {
    h.queue.push([]);

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    await expect(
      caller.getCheckoutQuote({ paymentLinkToken: "nope" }),
    ).rejects.toThrow(/Payment link not found/);
  });
});

// ─── setInvoiceFeePolicy ──────────────────────────────────────────────────────
describe("setInvoiceFeePolicy", () => {
  it("guards the UPDATE by id + merchant_id and writes the policy", async () => {
    const updated = makeInvoice({ feePolicy: "customer_pays", surchargeBps: 300 });
    h.queue.push([updated]);

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const result = await caller.setInvoiceFeePolicy({
      invoiceId: "INV-1",
      feePolicy: "customer_pays",
      surchargeBps: 300,
    });

    expect(result.success).toBe(true);
    const setCalls = h.calls.filter((c) => c.method === "set");
    expect(setCalls[0].args[0].feePolicy).toBe("customer_pays");
    expect(setCalls[0].args[0].surchargeBps).toBe(300);
    expect(h.auditEntries[0]?.action).toBe("ar.invoice.fee_policy_updated");
  });

  it("throws NOT_FOUND when the guarded update matches nothing (foreign merchant)", async () => {
    h.queue.push([]);

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    await expect(
      caller.setInvoiceFeePolicy({ invoiceId: "INV-9", feePolicy: "customer_pays" }),
    ).rejects.toThrow(/Invoice not found/);
  });

  it("rejects surcharge_bps above 400", async () => {
    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    await expect(
      caller.setInvoiceFeePolicy({
        invoiceId: "INV-1",
        feePolicy: "customer_pays",
        surchargeBps: 401,
      }),
    ).rejects.toThrow();
  });
});

// ─── feeRecoveryReport ────────────────────────────────────────────────────────
describe("feeRecoveryReport", () => {
  it("sums customer_pays surcharges from invoice_payments metadata, excluding refunds", async () => {
    const rows = [
      {
        payment: {
          id: "pay_1", invoiceId: "INV-1", amountKobo: 100000,
          metadata: { feeKobo: 2900, feePolicy: "customer_pays" },
          paidAt: new Date("2026-04-05T10:00:00Z"),
        },
        invoice: makeInvoice(),
      },
      {
        // refunded — must be excluded
        payment: {
          id: "pay_2", invoiceId: "INV-1", amountKobo: 50000,
          metadata: { feeKobo: 1000, feePolicy: "customer_pays", status: "refunded" },
          paidAt: new Date("2026-04-06T10:00:00Z"),
        },
        invoice: makeInvoice(),
      },
      {
        // no fee metadata — merchant_absorbs path
        payment: {
          id: "pay_3", invoiceId: "INV-1", amountKobo: 20000,
          metadata: null,
          paidAt: new Date("2026-04-07T10:00:00Z"),
        },
        invoice: makeInvoice({ feePolicy: "merchant_absorbs" }),
      },
    ];
    h.queue.push(rows);

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const report = await caller.feeRecoveryReport({});

    expect(report.merchantId).toBe("mer_1");
    expect(report.totalFeesRecoveredKobo).toBe(2900);
    expect(report.paymentCount).toBe(1);
    expect(report.items[0].paymentId).toBe("pay_1");
  });

  it("filters by period (YYYY-MM)", async () => {
    const rows = [
      {
        payment: {
          id: "pay_1", invoiceId: "INV-1", amountKobo: 100000,
          metadata: { feeKobo: 2900, feePolicy: "customer_pays" },
          paidAt: new Date("2026-04-05T10:00:00Z"),
        },
        invoice: makeInvoice(),
      },
      {
        payment: {
          id: "pay_2", invoiceId: "INV-1", amountKobo: 80000,
          metadata: { feeKobo: 1500, feePolicy: "customer_pays" },
          paidAt: new Date("2026-05-02T10:00:00Z"),
        },
        invoice: makeInvoice(),
      },
    ];
    h.queue.push(rows);

    const caller = arFeeChoiceRouter.createCaller(makeCtx());
    const report = await caller.feeRecoveryReport({ period: "2026-05" });
    expect(report.totalFeesRecoveredKobo).toBe(1500);
    expect(report.paymentCount).toBe(1);
  });
});

// ─── pure internals ───────────────────────────────────────────────────────────
describe("__feeChoiceInternals", () => {
  it("computeSurchargeKobo rounds to integer kobo", () => {
    expect(__feeChoiceInternals.computeSurchargeKobo(100000, 290)).toBe(2900);
    expect(__feeChoiceInternals.computeSurchargeKobo(333, 290)).toBe(10); // round(9.657)
    expect(__feeChoiceInternals.computeSurchargeKobo(0, 290)).toBe(0);
    expect(__feeChoiceInternals.computeSurchargeKobo(100000, 0)).toBe(0);
  });

  it("clampBps bounds the rate to 0..400", () => {
    expect(__feeChoiceInternals.clampBps(290)).toBe(290);
    expect(__feeChoiceInternals.clampBps(999)).toBe(400);
    expect(__feeChoiceInternals.clampBps(-5)).toBe(0);
  });
});
