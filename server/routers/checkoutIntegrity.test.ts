/**
 * checkoutIntegrity.test.ts
 * Wave-99 checkout integrity tests for hostedCheckout:
 *   C12 tamper rejection (link amount/currency/isActive/usageLimit),
 *   C11 expired-session confirm paths (PI-success auto-refund, PI-pending expire),
 *   C17 nipWebhook wrong-amount rejection + bank.transfer.rejected event,
 *   C3/M18 getStatus DTO shape + read-only bank_transfer projection,
 *   H11 invoice overpayment guard (guarded paid_kobo UPDATE),
 *   H13 USDC confirmUsdcPayment behavior.
 *
 * Mocking pattern follows server/routers/arPartialPayments.test.ts — a
 * chainable, queue-driven fake db — extended with an `execute` raw-SQL
 * recorder (customerRisk.test.ts style) for the guarded UPDATE / outbox INSERT.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  function sqlText(q: any): string {
    if (typeof q === "string") return q;
    if (!q || typeof q !== "object") return String(q ?? "");
    const chunks = q.queryChunks ?? [q];
    return chunks
      .map((c: any) => {
        const v = c?.value ?? c;
        if (Array.isArray(v)) return v.join("");
        if (v && typeof v === "object" && Array.isArray(v.queryChunks)) return sqlText(v);
        return String(v ?? "");
      })
      .join("");
  }
  const state = {
    calls: [] as Array<{ method: string; args: any[] }>,
    queue: [] as any[],
    executed: [] as string[],
    executeMatchers: [] as { match: string; respond: () => any }[],
    piResponse: { status: "succeeded", amount: 50000 } as any,
    refundOk: true,
    nipBridgeStatus: null as null | { status: string; paidAt?: string },
    kafkaOk: true,
    ledgerOk: true,
    applyInvoicePayment: vi.fn(async () => ({ paymentId: "pay_1", status: "paid", totalKobo: 50000, paidKobo: 50000 })),
  };
  const fakeDb: any = {};
  for (const m of [
    "select", "from", "where", "limit", "offset", "orderBy", "insert", "values",
    "update", "set", "delete", "innerJoin", "for", "onConflictDoNothing",
    "groupBy", "returning",
  ]) {
    fakeDb[m] = (...args: any[]) => {
      state.calls.push({ method: m, args });
      return fakeDb;
    };
  }
  // Awaiting any position of the chain resolves the next queued result.
  fakeDb.then = (res: any, rej: any) => {
    const v = state.queue.length ? state.queue.shift() : [];
    return Promise.resolve(v).then(res, rej);
  };
  fakeDb.transaction = async (fn: any) => fn(fakeDb);
  fakeDb.execute = async (q: any) => {
    const text = sqlText(q);
    state.executed.push(text);
    for (const m of state.executeMatchers) {
      if (text.includes(m.match)) return m.respond();
    }
    return { rows: [] };
  };
  return { state, fakeDb };
});

vi.mock("../db", () => ({
  db: h.fakeDb,
  getUserByOpenId: vi.fn().mockResolvedValue({ id: 1, openId: "op_merchant", name: "Merchant User" }),
  getMerchantByOwnerId: vi.fn().mockResolvedValue({
    id: "mer_1", tenantId: "ten_1", ownerId: 1, businessName: "Test Merchant",
  }),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

const dispatchSpy = vi.hoisted(() => vi.fn(async () => ({ dispatched: 1, failed: 0 })));
vi.mock("../webhookEvents", () => ({ dispatchWebhookEvent: dispatchSpy }));

vi.mock("./arPartialPayments", () => ({
  __partialInternals: {
    applyInvoicePayment: (...args: any[]) => h.state.applyInvoicePayment(...args),
    sumPaymentsKobo: (rows: any[]) => rows.reduce((s, r) => s + Number(r.amountKobo ?? 0), 0),
  },
}));

vi.mock("./arFeeChoice", () => ({
  __feeChoiceInternals: {
    resolveSurchargeBps: vi.fn(async () => 290),
    computeSurchargeKobo: vi.fn((base: number, bps: number) => Math.round((base * bps) / 10000)),
  },
}));

vi.mock("./customerRisk", () => ({
  assertCustomerNotDenied: vi.fn(async () => undefined),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { hostedCheckoutRouter } from "./hostedCheckout";

function makeCtx(): any {
  return { req: { headers: {}, socket: { remoteAddress: "10.0.0.9" } }, res: {} };
}
const caller = hostedCheckoutRouter.createCaller(makeCtx());

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function makeLink(overrides: Record<string, unknown> = {}) {
  return {
    id: "plink_1",
    tenantId: "ten_1",
    merchantId: "mer_1",
    slug: "test-link",
    title: "Test Link",
    description: null,
    amount: null,
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

function makeSession(overrides: Record<string, unknown> = {}) {
  return {
    id: "sess_1",
    paymentLinkId: "plink_1",
    merchantId: "mer_1",
    tenantId: "ten_1",
    customerEmail: null,
    customerName: null,
    customerPhone: null,
    amountKobo: 50000,
    currency: "NGN",
    description: null,
    reference: "PG_1_ABC",
    status: "processing",
    paymentMethod: "card",
    stripePaymentIntentId: "pi_123",
    stripeClientSecret: "secret_123",
    nipVirtualAccountNumber: "1234567890",
    nipBankCode: "058",
    nipBankName: "GTBank",
    nipSessionId: "nip_sess_1",
    nipExpiresAt: null,
    metadata: {},
    paidAt: null,
    expiresAt: new Date(Date.now() + 30 * 60 * 1000),
    createdAt: new Date(),
    updatedAt: new Date(),
    ...overrides,
  };
}

beforeEach(() => {
  h.state.calls = [];
  h.state.queue = [];
  h.state.executed = [];
  h.state.executeMatchers = [];
  h.state.piResponse = { status: "succeeded", amount: 50000 };
  h.state.refundOk = true;
  h.state.nipBridgeStatus = null;
  h.state.kafkaOk = true;
  h.state.ledgerOk = true;
  h.state.applyInvoicePayment.mockClear();
  dispatchSpy.mockClear();
  process.env.MIDDLEWARE_BRIDGE_URL = "http://bridge.test";
  process.env.NIP_WEBHOOK_SECRET = "nipsecret";
  process.env.USDC_CONFIRM_SECRET = "usdcsecret";
  process.env.STRIPE_SECRET_KEY = "sk_test_x";
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const u = String(url);
    let res: any = {};
    let ok = true;
    let status = 200;
    if (u.startsWith("https://api.stripe.com/v1/refunds")) {
      ok = h.state.refundOk;
      status = ok ? 200 : 502;
      res = { id: "re_1" };
    } else if (u.includes("/cancel")) {
      res = { id: "pi_123", status: "canceled" };
    } else if (u.startsWith("https://api.stripe.com/v1/payment_intents/")) {
      res = h.state.piResponse;
    } else if (u.includes("/nip/session-status/")) {
      res = h.state.nipBridgeStatus ?? { status: "pending" };
    } else if (u.includes("/kafka/publish")) {
      ok = h.state.kafkaOk;
      status = ok ? 200 : 500;
    } else if (u.includes("/v1/ledger/transfer")) {
      ok = h.state.ledgerOk;
      status = ok ? 200 : 502;
      res = ok
        ? { transferId: "3f6a2b1c-1111-4222-8333-944455556666", status: "COMMITTED" }
        : { error: "transfer_failed" };
    } else if (u.includes("/temporal/start")) {
      res = { workflowId: "wf_1" };
    }
    return { ok, status, json: async () => res, text: async () => JSON.stringify(res) } as any;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MIDDLEWARE_BRIDGE_URL;
  delete process.env.NIP_WEBHOOK_SECRET;
  delete process.env.USDC_CONFIRM_SECRET;
  delete process.env.STRIPE_SECRET_KEY;
});

// ─── C12: tamper rejection ────────────────────────────────────────────────────
describe("C12 initiatePayment tamper rejection", () => {
  const baseInput = {
    paymentLinkId: "plink_1",
    merchantId: "mer_1",
    tenantId: "ten_1",
    paymentMethod: "card" as const,
  };

  it("rejects an inactive payment link", async () => {
    h.state.queue.push([makeLink({ isActive: false })]);
    await expect(caller.initiatePayment({ ...baseInput, amountKobo: 50000 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/no longer active/i) });
  });

  it("rejects when the usage limit is exhausted (guarded claim returns 0 rows)", async () => {
    h.state.queue.push([makeLink({ usageLimit: 1, usageCount: 1 })]);
    h.state.queue.push([]); // guarded UPDATE ... RETURNING → 0 rows
    await expect(caller.initiatePayment({ ...baseInput, amountKobo: 50000 }))
      .rejects.toMatchObject({ code: "CONFLICT", message: expect.stringMatching(/usage limit/i) });
  });

  it("forces the link's fixed amount server-side (client amount ignored)", async () => {
    h.state.queue.push([makeLink({ amount: 50000, currency: "NGN" })]); // select link
    h.state.queue.push([makeLink({ usageCount: 1 })]);                    // usage claim
    h.state.queue.push([]);                                               // invoice lookup → none
    h.state.queue.push([{ id: "sess_1" }]);                               // session insert returning
    const res = await caller.initiatePayment({ ...baseInput, amountKobo: 1 }); // tamper attempt
    expect(res).toBeTruthy();
    const valuesCall = h.state.calls.find((c) => c.method === "values");
    expect(valuesCall).toBeTruthy();
    expect(Number((valuesCall!.args[0] as any).amountKobo)).toBe(50000);
  });

  it("rejects a client currency that mismatches a fixed-amount link", async () => {
    h.state.queue.push([makeLink({ amount: 50000, currency: "USD" })]);
    h.state.queue.push([makeLink({ usageCount: 1 })]);
    h.state.queue.push([]); // invoice lookup
    await expect(caller.initiatePayment({ ...baseInput, amountKobo: 50000, currency: "NGN" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/currency mismatch/i) });
  });

  it("enforces the ₦100 (10000 kobo) minimum on plain links", async () => {
    h.state.queue.push([makeLink()]);
    h.state.queue.push([makeLink({ usageCount: 1 })]);
    h.state.queue.push([]); // invoice lookup
    await expect(caller.initiatePayment({ ...baseInput, amountKobo: 5000 }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/Minimum amount is ₦100/) });
  });
});

// ─── C11: expired-session confirm paths ───────────────────────────────────────
describe("C11 confirmPayment expiry handling", () => {
  it("refunds a succeeded PI on an expired session and marks expired_refunded", async () => {
    h.state.queue.push([makeSession({ expiresAt: new Date(Date.now() - 60_000) })]); // select session
    h.state.queue.push([]); // mark expired_refunded update
    h.state.piResponse = { status: "succeeded", amount: 50000 };
    await expect(caller.confirmPayment({ sessionId: "sess_1" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/refunded/i) });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.status === "expired_refunded")).toBe(true);
  });

  it("marks expired + cancels the PI when the PI never succeeded", async () => {
    h.state.queue.push([makeSession({ expiresAt: new Date(Date.now() - 60_000) })]);
    h.state.queue.push([]); // mark expired update
    h.state.piResponse = { status: "requires_payment_method" };
    await expect(caller.confirmPayment({ sessionId: "sess_1" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/expired/i) });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.status === "expired")).toBe(true);
    // No completion flip was ever attempted for the expired session.
    expect(sets.some((s) => s.status === "completed")).toBe(false);
  });

  it("fails loud when the late-payment refund errors", async () => {
    h.state.queue.push([makeSession({ expiresAt: new Date(Date.now() - 60_000) })]);
    h.state.piResponse = { status: "succeeded", amount: 50000 };
    h.state.refundOk = false;
    await expect(caller.confirmPayment({ sessionId: "sess_1" }))
      .rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.status === "expired_refunded")).toBe(false);
  });
});

// ─── C17: nipWebhook wrong-amount rejection ───────────────────────────────────
describe("C17 nipWebhook amount verification", () => {
  const nipInput = {
    nipSessionId: "nip_sess_1",
    status: "paid" as const,
    paidAt: new Date().toISOString(),
    signature: "nipsecret",
  };

  it("rejects a wrong amount, records wrong_amount metadata, emits bank.transfer.rejected", async () => {
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]); // select by nipSessionId
    h.state.queue.push([]); // metadata update
    const res = await caller.nipWebhook({ ...nipInput, amount: 40000 });
    expect(res).toMatchObject({ status: "rejected", reason: "wrong_amount" });
    const events = dispatchSpy.mock.calls.map((c) => c[0].event);
    expect(events).toContain("bank.transfer.rejected");
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.metadata?.nip_rejection === "wrong_amount")).toBe(true);
    // Never completed.
    expect(sets.some((s) => s.status === "completed")).toBe(false);
  });

  it("rejects when amount is missing entirely", async () => {
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]);
    h.state.queue.push([]); // metadata update
    const res = await caller.nipWebhook(nipInput as any);
    expect(res).toMatchObject({ status: "rejected", reason: "amount_missing" });
    expect(dispatchSpy.mock.calls.map((c) => c[0].event)).toContain("bank.transfer.rejected");
  });

  it("parks a payment landing in an expired session (no completion)", async () => {
    h.state.queue.push([makeSession({
      paymentMethod: "bank_transfer",
      expiresAt: new Date(Date.now() - 60_000),
    })]);
    h.state.queue.push([]); // park metadata update
    const res = await caller.nipWebhook({ ...nipInput, amount: 50000 });
    expect(res).toMatchObject({ status: "parked", reason: "session_expired" });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.metadata?.late_payment_parked === "true")).toBe(true);
    expect(sets.some((s) => s.status === "completed")).toBe(false);
  });
});

// ─── C3/M18: getStatus DTO + read-only bank_transfer ──────────────────────────
describe("C3/M18 getStatus", () => {
  it("returns a whitelisted DTO without PII/secrets", async () => {
    h.state.queue.push([makeSession({ status: "completed", paidAt: new Date() })]);
    const res = await caller.getStatus({ sessionId: "sess_1" });
    expect(Object.keys(res).sort()).toEqual(
      ["amountKobo", "currency", "paidAt", "paymentMethod", "reference", "status"].sort(),
    );
    const json = JSON.stringify(res);
    expect(json).not.toContain("secret_123");
    expect(json).not.toContain("1234567890"); // NIP VA number
  });

  it("is READ-ONLY for bank_transfer: bridge 'paid' is a projection, never a write", async () => {
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]);
    h.state.nipBridgeStatus = { status: "paid", paidAt: new Date().toISOString() };
    const res = await caller.getStatus({ sessionId: "sess_1" });
    expect(res.status).toBe("bridge_reported_paid");
    // No UPDATE against hosted_payment_sessions was issued.
    expect(h.state.calls.some((c) => c.method === "update")).toBe(false);
  });

  it("projects expired for out-of-date bank_transfer sessions without writing", async () => {
    h.state.queue.push([makeSession({
      paymentMethod: "bank_transfer",
      expiresAt: new Date(Date.now() - 60_000),
    })]);
    const res = await caller.getStatus({ sessionId: "sess_1" });
    expect(res.status).toBe("expired");
    expect(h.state.calls.some((c) => c.method === "update")).toBe(false);
  });
});

// ─── H11: invoice overpayment guard ───────────────────────────────────────────
describe("H11 settleLinkedInvoice overpayment guard", () => {
  const nipInput = {
    nipSessionId: "nip_sess_1",
    status: "paid" as const,
    paidAt: new Date().toISOString(),
    signature: "nipsecret",
    amount: 50000,
  };
  const invoiceSession = () => makeSession({
    paymentMethod: "bank_transfer",
    metadata: { invoiceId: "INV-1", baseAmountKobo: "50000" },
  });

  it("settles the invoice when the guarded paid_kobo UPDATE succeeds", async () => {
    h.state.queue.push([invoiceSession()]);  // select session
    h.state.queue.push([invoiceSession()]);  // completion flip returning
    h.state.executeMatchers.push({
      match: "UPDATE invoices",
      respond: () => ({ rows: [{ invoice_id: "INV-1" }] }),
    });
    const res = await caller.nipWebhook(nipInput);
    expect(res).toMatchObject({ received: true, matched: true });
    expect(h.state.executed.some((t) => t.includes("UPDATE invoices") && t.includes("paid_kobo"))).toBe(true);
    expect(h.state.applyInvoicePayment).toHaveBeenCalledTimes(1);
  });

  it("flags excess instead of inserting when the guarded UPDATE admits 0 rows", async () => {
    h.state.queue.push([invoiceSession()]);
    h.state.queue.push([invoiceSession()]); // completion flip
    h.state.executeMatchers.push({
      match: "UPDATE invoices",
      respond: () => ({ rows: [] }), // guard rejects — overpayment
    });
    await caller.nipWebhook(nipInput);
    expect(h.state.applyInvoicePayment).not.toHaveBeenCalled();
    const outbox = h.state.executed.find((t) => t.includes("INSERT INTO ledger_outbox"));
    expect(outbox).toBeTruthy();
    expect(outbox).toContain("invoice.excess_payment");
  });
});

// ─── H13: USDC confirmation ───────────────────────────────────────────────────
describe("H13 confirmUsdcPayment", () => {
  const usdcInput = {
    sessionId: "sess_1",
    amountKobo: 50000,
    txSignature: "sig_abc",
    internalKey: "usdcsecret",
  };
  const usdcSession = (overrides: Record<string, unknown> = {}) =>
    makeSession({ paymentMethod: "usdc", stripePaymentIntentId: null, ...overrides });

  it("completes a USDC session with correct key + amount (guarded flip + ledger)", async () => {
    h.state.queue.push([usdcSession()]); // select session
    h.state.queue.push([usdcSession()]); // completion flip returning
    h.state.queue.push([]);              // tigerBeetleTransferId update
    const res = await caller.confirmUsdcPayment(usdcInput);
    expect(res).toMatchObject({ success: true });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.status === "completed")).toBe(true);
    // TB transfer went to the REAL bridge ledger route.
    const fetchMock = globalThis.fetch as any;
    const urls = fetchMock.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u: string) => u.includes("/v1/ledger/transfer"))).toBe(true);
    expect(urls.some((u: string) => u.includes("/tigerbeetle/transfer"))).toBe(false);
  });

  it("rejects an amount mismatch (never completes)", async () => {
    h.state.queue.push([usdcSession()]);
    const res = await caller.confirmUsdcPayment({ ...usdcInput, amountKobo: 1 });
    expect(res).toMatchObject({ success: false, reason: "amount_mismatch" });
    const sets = h.state.calls.filter((c) => c.method === "set").map((c) => c.args[0]);
    expect(sets.some((s) => s.status === "completed")).toBe(false);
  });

  it("parks a deposit into an expired session", async () => {
    h.state.queue.push([usdcSession({ expiresAt: new Date(Date.now() - 60_000) })]);
    const res = await caller.confirmUsdcPayment(usdcInput);
    expect(res).toMatchObject({ success: false, reason: "session_expired" });
  });

  it("refuses unauthenticated confirmation (fail closed)", async () => {
    await expect(caller.confirmUsdcPayment({ ...usdcInput, internalKey: "wrong__key" }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });
});

// ─── C1/#10: outbox durability on side-effect failure ─────────────────────────
describe("C1/#10 durable outbox", () => {
  it("writes a ledger_outbox row when the TB transfer fails (nipWebhook path)", async () => {
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]);
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]); // flip
    h.state.ledgerOk = false;
    const res = await caller.nipWebhook({
      nipSessionId: "nip_sess_1", status: "paid", paidAt: new Date().toISOString(),
      signature: "nipsecret", amount: 50000,
    });
    expect(res).toMatchObject({ received: true, matched: true });
    const outbox = h.state.executed.find((t) => t.includes("INSERT INTO ledger_outbox") && t.includes("ledger.transfer"));
    expect(outbox).toBeTruthy();
  });

  it("writes a kafka.payment.completed outbox row when Kafka publish fails", async () => {
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]);
    h.state.queue.push([makeSession({ paymentMethod: "bank_transfer" })]); // flip
    h.state.kafkaOk = false;
    await caller.nipWebhook({
      nipSessionId: "nip_sess_1", status: "paid", paidAt: new Date().toISOString(),
      signature: "nipsecret", amount: 50000,
    });
    const outbox = h.state.executed.find((t) => t.includes("INSERT INTO ledger_outbox") && t.includes("kafka.payment.completed"));
    expect(outbox).toBeTruthy();
  });
});
