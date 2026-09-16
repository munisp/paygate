/**
 * platformOpsFixes.test.ts — tests for the platform-ops audit fixes.
 *
 * Covers:
 *   C15 — failed first webhook delivery gets nextRetryAt (retry worker picks it up)
 *   H19 — exactly one HTTP transport per endpoint per event (bridge = audit only)
 *   C16 — stuck-102 replay: entity-ref → synthesized success; no entity → re-execute;
 *         5xx/throwable errors are never persisted
 *   C9  — Stripe events persisted before ACK; processor retries pending/failed rows
 *   C10 — subscription sweeper claim math (interval advance, dunning, total_cycles)
 *   M6  — cashback redemption unique-conflict → idempotent replay
 *   M11 — customer anonymize / merge
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createHash } from "crypto";

// ─── Shared mocks ─────────────────────────────────────────────────────────────
const mockGetDb = vi.fn();
vi.mock("../db", () => ({
  getDb: mockGetDb,
  getUserByOpenId: vi.fn().mockResolvedValue({ id: 7, openId: "u1" }),
  getMerchantByOwnerId: vi.fn().mockResolvedValue({ id: "merch_1" }),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

const mockBridgeDeliver = vi.fn().mockResolvedValue(null);
vi.mock("../middlewareBridge", () => ({
  deliverWebhookViaMiddleware: mockBridgeDeliver,
}));

const mockDispatchWebhookEvent = vi.fn().mockResolvedValue({ dispatched: 0, failed: 0 });
vi.mock("../webhookEvents", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return {
    ...orig,
    dispatchWebhookEvent: mockDispatchWebhookEvent,
    // exposed for the C15/H19 suites that need the REAL dispatcher
    __origDispatchWebhookEvent: orig.dispatchWebhookEvent,
  };
});

vi.mock("./publicRest", () => ({})); // no executeChargeAuthorization export → fallback rail

vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));

const hashBody = (b: unknown) => createHash("sha256").update(JSON.stringify(b)).digest("hex");

// ═══════════════════════════════════════════════════════════════════════════════
// C15 + H19: webhookEvents dispatch
// ═══════════════════════════════════════════════════════════════════════════════
describe("C15/H19 webhookEvents.dispatchWebhookEvent", () => {
  const endpoint = { id: "wh_1", url: "https://merchant.example/hook", secret: "sek", isActive: true, events: ["payment.completed"] };
  const payload = {
    event: "payment.completed" as const,
    id: "evt_1",
    tenantId: "ten_default",
    merchantId: "merch_1",
    timestamp: new Date().toISOString(),
    data: { reference: "ref_1" },
  };

  function makeDispatchDb(inserted: any[]) {
    return {
      select: () => ({ from: () => ({ where: async () => [endpoint] }) }),
      insert: () => ({ values: async (v: any) => { inserted.push(v); } }),
    };
  }

  beforeEach(() => { vi.clearAllMocks(); });

  it("failed first delivery is inserted with nextRetryAt = scheduleRetry(1)", async () => {
    const inserted: any[] = [];
    mockGetDb.mockResolvedValue(makeDispatchDb(inserted));
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("connection refused")));

    const we = await import("../webhookEvents");
    const dispatch = (we as any).__origDispatchWebhookEvent ?? we.dispatchWebhookEvent;
    const res = await dispatch(payload);

    expect(res.failed).toBe(1);
    expect(inserted).toHaveLength(1);
    expect(inserted[0].status).toBe("failed");
    expect(inserted[0].attemptCount).toBe(1);
    expect(inserted[0].nextRetryAt).toBeInstanceOf(Date);
    // scheduleRetry(1) = now + ~1min (jittered ±20%): must be in the future.
    expect(inserted[0].nextRetryAt.getTime()).toBeGreaterThan(Date.now());
    expect(inserted[0].nextRetryAt.getTime()).toBeLessThan(Date.now() + 5 * 60_000);
    vi.unstubAllGlobals();
  });

  it("successful delivery is inserted with nextRetryAt null", async () => {
    const inserted: any[] = [];
    mockGetDb.mockResolvedValue(makeDispatchDb(inserted));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" }));

    const we = await import("../webhookEvents");
    const dispatch = (we as any).__origDispatchWebhookEvent ?? we.dispatchWebhookEvent;
    await dispatch(payload);

    expect(inserted[0].status).toBe("success");
    expect(inserted[0].nextRetryAt).toBeNull();
    vi.unstubAllGlobals();
  });

  it("H19: exactly one HTTP POST per endpoint; bridge called with targetUrl stripped", async () => {
    const inserted: any[] = [];
    mockGetDb.mockResolvedValue(makeDispatchDb(inserted));
    const mockFetch = vi.fn().mockResolvedValue({ ok: true, status: 200, text: async () => "ok" });
    vi.stubGlobal("fetch", mockFetch);

    const we = await import("../webhookEvents");
    const dispatch = (we as any).__origDispatchWebhookEvent ?? we.dispatchWebhookEvent;
    await dispatch(payload);

    // One direct POST to the merchant endpoint — no second transport.
    expect(mockFetch).toHaveBeenCalledTimes(1);
    expect(mockFetch.mock.calls[0][0]).toBe(endpoint.url);
    // Bridge is audit fan-out ONLY: targetUrl must be stripped (empty).
    expect(mockBridgeDeliver).toHaveBeenCalledTimes(1);
    expect(mockBridgeDeliver.mock.calls[0][0].targetUrl).toBe("");
    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C16: idempotency stuck-102 recovery + 5xx non-persistence
// ═══════════════════════════════════════════════════════════════════════════════
describe("C16 withIdempotency stuck-102 recovery", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  function makeIdemDb(opts: {
    claimQueue: any[][];
    existingRows: any[];
    executeQueue?: any[];
  }) {
    const calls = { updates: [] as any[], deletes: 0, executes: [] as any[] };
    const execQueue = [...(opts.executeQueue ?? [])];
    const db = {
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => opts.claimQueue.length > 0 ? opts.claimQueue.shift()! : [],
          }),
        }),
      }),
      select: () => ({ from: () => ({ where: () => ({ limit: async () => opts.existingRows }) }) }),
      update: () => ({ set: (v: any) => { calls.updates.push(v); return { where: async () => {} }; } }),
      delete: () => ({ where: async () => { calls.deletes++; } }),
      execute: async (q: any) => { calls.executes.push(q); return execQueue.length > 0 ? execQueue.shift() : { rows: [] }; },
    };
    return { db, calls };
  }

  const baseOpts = (body: unknown) => ({
    key: "idem_key_123456",
    merchantId: "merch_1",
    operation: "transactions.create",
    requestBody: body,
  });

  it("stuck-102 WITH entity ref synthesizes the success response (no re-execution)", async () => {
    const body = { amount: 500 };
    const stuckRecord = {
      id: "idem_key_123456",
      requestHash: hashBody(body),
      responseStatus: 102,
      responseBody: null,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(Date.now() - 20 * 60_000), // 20 min old → stuck
    };
    const { db } = makeIdemDb({
      claimQueue: [[]], // claim loses the race → replay path
      existingRows: [stuckRecord],
      executeQueue: [
        { rows: [{ entity_table: "transactions", entity_id: "txn_1" }] }, // readEntityRef
        { rows: [{ id: "txn_1", amount: 500, status: "completed" }] },      // entity lookup
        { rows: [] },                                                       // persist synthesized 200
      ],
    });
    mockGetDb.mockResolvedValue(db);

    const { withIdempotency } = await import("../idempotency");
    const execute = vi.fn().mockResolvedValue({ should: "never run" });
    const result: any = await withIdempotency({ ...baseOpts(body), execute });

    expect(execute).not.toHaveBeenCalled();
    expect(result.id).toBe("txn_1");
    expect(result.replayed).toBe(true);
  });

  it("stuck-102 WITHOUT entity ref marks failed, evicts, and re-executes", async () => {
    const body = { amount: 500 };
    const stuckRecord = {
      id: "idem_key_123456",
      requestHash: hashBody(body),
      responseStatus: 102,
      responseBody: null,
      expiresAt: new Date(Date.now() + 3600_000),
      createdAt: new Date(Date.now() - 20 * 60_000),
    };
    const { db, calls } = makeIdemDb({
      claimQueue: [[], [{ id: "idem_key_123456" }]], // lose, then win after eviction
      existingRows: [stuckRecord],
      executeQueue: [
        { rows: [{ entity_table: null, entity_id: null }] }, // readEntityRef
        { rows: [] },                                        // mark failed
      ],
    });
    mockGetDb.mockResolvedValue(db);

    const { withIdempotency } = await import("../idempotency");
    const execute = vi.fn().mockResolvedValue({ ok: 1 });
    const result: any = await withIdempotency({ ...baseOpts(body), execute });

    expect(calls.deletes).toBeGreaterThanOrEqual(1); // stuck row evicted
    expect(execute).toHaveBeenCalledTimes(1);        // re-executed as fresh claim
    expect(result).toEqual({ ok: 1 });
  });

  it("5xx / throwable infrastructure errors are NEVER persisted (placeholder evicted)", async () => {
    const body = { amount: 500 };
    const { db, calls } = makeIdemDb({
      claimQueue: [[{ id: "idem_key_123456" }]], // we win the claim
      existingRows: [],
    });
    mockGetDb.mockResolvedValue(db);

    const { withIdempotency } = await import("../idempotency");
    const execute = vi.fn().mockRejectedValue(new Error("kafka exploded"));

    await expect(withIdempotency({ ...baseOpts(body), execute })).rejects.toThrow("kafka exploded");
    // No response row persisted (no update with a 500 body)...
    expect(calls.updates).toHaveLength(0);
    // ...and the placeholder was evicted so the client can retry.
    expect(calls.deletes).toBe(1);
  });

  it("business 4xx errors ARE persisted for deterministic replay", async () => {
    const body = { amount: 500 };
    const { db, calls } = makeIdemDb({
      claimQueue: [[{ id: "idem_key_123456" }]],
      existingRows: [],
    });
    mockGetDb.mockResolvedValue(db);

    const { withIdempotency } = await import("../idempotency");
    const { TRPCError } = await import("@trpc/server");
    const execute = vi.fn().mockRejectedValue(new TRPCError({ code: "BAD_REQUEST", message: "Insufficient funds" }));

    await expect(withIdempotency({ ...baseOpts(body), execute })).rejects.toThrow("Insufficient funds");
    expect(calls.updates).toHaveLength(1);
    expect(calls.updates[0].responseStatus).toBe(400);
    expect(calls.deletes).toBe(0);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C9: stripe webhook durability — persisted-first processing + processor retry
// ═══════════════════════════════════════════════════════════════════════════════
describe("C9 processPendingStripeEvents", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("claims pending/failed rows and marks them processed", async () => {
    const executed: any[] = [];
    const event = { id: "evt_1", type: "account.updated", data: { object: {} } };
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "evt_1", payload: event }] }) // claim
        .mockResolvedValue({ rows: [] }),                                    // status updates
    };
    mockGetDb.mockResolvedValue(db);

    const { processPendingStripeEvents } = await import("../stripe");
    const processed = await processPendingStripeEvents(10);

    expect(processed).toBe(1);
    expect(db.execute).toHaveBeenCalledTimes(2); // claim + processed update
  });

  it("processing failure keeps the row as 'failed' for a later retry", async () => {
    const event = {
      id: "evt_2",
      type: "payment_intent.succeeded",
      data: { object: { id: "pi_1", amount: 1000, currency: "ngn", metadata: { type: "consumer_wallet_topup", user_id: "5" } } },
    };
    // claim succeeds; the wallet-credit path then blows up on the fake db
    // (no select support) → processStoredStripeEvent records status='failed'.
    const db = {
      execute: vi.fn()
        .mockResolvedValueOnce({ rows: [{ id: "evt_2", payload: event }] })
        .mockResolvedValue({ rows: [] }),
      select: () => { throw new Error("db on fire"); },
    };
    mockGetDb.mockResolvedValue(db);

    const { processPendingStripeEvents } = await import("../stripe");
    const processed = await processPendingStripeEvents(10);

    expect(processed).toBe(1); // attempted
    expect(db.execute).toHaveBeenCalledTimes(2); // claim + failed update
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// C10: subscription renewal sweeper
// ═══════════════════════════════════════════════════════════════════════════════
describe("C10 subscription renewal schedule math", () => {
  it("addOnePeriod advances calendar-aware intervals", async () => {
    const { addOnePeriod } = await import("../jobs/subscriptionRenewal");
    const base = new Date("2026-01-15T00:00:00Z");
    expect(addOnePeriod(base, "daily").toISOString()).toBe("2026-01-16T00:00:00.000Z");
    expect(addOnePeriod(base, "weekly").toISOString()).toBe("2026-01-22T00:00:00.000Z");
    expect(addOnePeriod(base, "monthly").getUTCMonth()).toBe(1); // Feb
    expect(addOnePeriod(base, "quarterly").getUTCMonth()).toBe(3); // Apr
    expect(addOnePeriod(base, "annually").getUTCFullYear()).toBe(2027);
  });

  it("computeCatchUpNextRunAt skips whole past-due periods into the future", async () => {
    const { computeCatchUpNextRunAt } = await import("../jobs/subscriptionRenewal");
    const due = new Date("2026-01-01T00:00:00Z");
    const now = new Date("2026-03-15T00:00:00Z");
    const next = computeCatchUpNextRunAt(due, "monthly", now);
    // Jan 1 → Feb 1 → Mar 1 → Apr 1 (first slot strictly after now)
    expect(next.toISOString()).toBe("2026-04-01T00:00:00.000Z");
    expect(next.getTime()).toBeGreaterThan(now.getTime());
  });

  it("dunning schedule: +1d / +3d / +5d, then exhausted", async () => {
    const { computeDunningNextRunAt, MAX_DUNNING_RETRIES } = await import("../jobs/subscriptionRenewal");
    const now = new Date("2026-06-01T00:00:00Z");
    expect(computeDunningNextRunAt(1, now)!.toISOString()).toBe("2026-06-02T00:00:00.000Z");
    expect(computeDunningNextRunAt(2, now)!.toISOString()).toBe("2026-06-04T00:00:00.000Z");
    expect(computeDunningNextRunAt(3, now)!.toISOString()).toBe("2026-06-06T00:00:00.000Z");
    expect(MAX_DUNNING_RETRIES).toBe(3);
    expect(computeDunningNextRunAt(4, now)).toBeNull();
  });
});

describe("C10 runDueSubscriptionRenewals (fake db)", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const baseSub = {
    id: "sub_1", merchant_id: "merch_1", customer_email: "c@x.com",
    amount_kobo: 50000, currency: "NGN", interval: "monthly",
    total_cycles: null, completed_cycles: 0, retry_count: 0,
    authorization_code: "AUTH_1", metadata: null,
  };

  function makeSweepDb(sub: any, executeQueue: any[] = []) {
    const executed: any[] = [];
    const queue = [...executeQueue];
    const db = {
      execute: vi.fn(async (q: any) => {
        executed.push(q);
        return queue.length > 0 ? queue.shift() : { rows: [] };
      }),
    };
    // chargeSubscriptionAuthorization resolves its own db via getDb() — point
    // it at the same fake (queue position 2 = authorization lookup).
    mockGetDb.mockResolvedValue(db);
    return { db, executed };
  }

  function stubRail(status: string) {
    process.env.MIDDLEWARE_BRIDGE_URL = "http://bridge.test";
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ status, gateway_response: status === "success" ? "Approved" : "Insufficient funds" }),
    }));
  }

  it("successful charge: charge row recorded, cycle incremented, renewed event emitted", async () => {
    stubRail("success");
    const { db } = makeSweepDb(baseSub, [
      { rows: [baseSub] },                                        // claim RETURNING
      { rows: [{ active: true, reusable: true }] },               // authorization lookup
      { rows: [] },                                               // INSERT subscription_charges
      { rows: [] },                                               // UPDATE subscriptions
    ]);
    const { runDueSubscriptionRenewals } = await import("../jobs/subscriptionRenewal");
    const res = await runDueSubscriptionRenewals(db);

    expect(res.claimed).toBe(1);
    expect(res.renewed).toBe(1);
    expect(res.completed).toBe(0);
    expect(mockDispatchWebhookEvent).toHaveBeenCalledTimes(1);
    const emitted = mockDispatchWebhookEvent.mock.calls[0][0];
    expect(emitted.event).toBe("subscription_v2.renewed");
    expect(emitted.data.completed_cycles).toBe(1);
    vi.unstubAllGlobals();
  });

  it("total_cycles reached → subscription completed", async () => {
    stubRail("success");
    const sub = { ...baseSub, total_cycles: 2, completed_cycles: 1 };
    const { db } = makeSweepDb(sub, [
      { rows: [sub] },
      { rows: [{ active: true, reusable: true }] },
      { rows: [] },
      { rows: [] },
    ]);
    const { runDueSubscriptionRenewals } = await import("../jobs/subscriptionRenewal");
    const res = await runDueSubscriptionRenewals(db);

    expect(res.completed).toBe(1);
    expect(res.renewed).toBe(0);
    expect(mockDispatchWebhookEvent.mock.calls[0][0].data.status).toBe("completed");
    vi.unstubAllGlobals();
  });

  it("failed charge → dunning retry scheduled (+1d), no not_renew yet", async () => {
    stubRail("failed");
    const { db } = makeSweepDb(baseSub, [
      { rows: [baseSub] },
      { rows: [{ active: true, reusable: true }] },
      { rows: [] }, // INSERT failed charge
      { rows: [] }, // UPDATE dunning
    ]);
    const { runDueSubscriptionRenewals } = await import("../jobs/subscriptionRenewal");
    const res = await runDueSubscriptionRenewals(db);

    expect(res.dunning).toBe(1);
    expect(res.nonRenewing).toBe(0);
    expect(mockDispatchWebhookEvent).not.toHaveBeenCalled();
    vi.unstubAllGlobals();
  });

  it("final dunning retry exhausted → non-renewing + subscription.not_renew emitted", async () => {
    stubRail("failed");
    const sub = { ...baseSub, retry_count: 3 }; // next failure is the 4th → exhausted
    const { db } = makeSweepDb(sub, [
      { rows: [sub] },
      { rows: [{ active: true, reusable: true }] },
      { rows: [] },
      { rows: [] },
    ]);
    const { runDueSubscriptionRenewals } = await import("../jobs/subscriptionRenewal");
    const res = await runDueSubscriptionRenewals(db);

    expect(res.nonRenewing).toBe(1);
    expect(mockDispatchWebhookEvent).toHaveBeenCalledTimes(1);
    expect(mockDispatchWebhookEvent.mock.calls[0][0].event).toBe("subscription.not_renew");
    vi.unstubAllGlobals();
  });

  it("inactive authorization → skipped + flagged (no charge attempted, no dunning)", async () => {
    const mockFetch = vi.fn();
    vi.stubGlobal("fetch", mockFetch);
    const { db } = makeSweepDb(baseSub, [
      { rows: [baseSub] },
      { rows: [{ active: false, reusable: true }] }, // inactive auth
      { rows: [] },                                   // UPDATE flag
    ]);
    const { runDueSubscriptionRenewals } = await import("../jobs/subscriptionRenewal");
    const res = await runDueSubscriptionRenewals(db);

    expect(res.skippedInactiveAuth).toBe(1);
    expect(res.dunning).toBe(0);
    expect(mockFetch).not.toHaveBeenCalled(); // rail never hit
    vi.unstubAllGlobals();
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M6: cashback redeem — unique conflict → idempotent replay
// ═══════════════════════════════════════════════════════════════════════════════
describe("M6 cashback redeem conflict → replay", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  const input = { amountKobo: 25000, redemptionType: "wallet_credit" as const, idempotencyKey: "idem-redeem-001" };
  const winnerRow = { id: "cbt_winner", merchantId: "merch_1", type: "redemption", amountKobo: 25000, relatedTransactionId: input.idempotencyKey };

  function makeTx(opts: { conflict: boolean }) {
    const state = { selectCalls: 0, debitCalls: 0 };
    const newRow = { id: "cbt_new", merchantId: "merch_1", type: "redemption", amountKobo: 25000, relatedTransactionId: input.idempotencyKey };
    const tx = {
      select: () => ({
        from: () => ({
          where: async () => {
            state.selectCalls++;
            // 1st select = in-tx replay pre-check (empty); later = post-conflict winner read
            return state.selectCalls === 1 ? [] : [winnerRow];
          },
        }),
      }),
      update: () => ({
        set: () => ({
          where: (arg?: any) => {
            state.debitCalls++;
            return { returning: async () => [{ id: "cb_1" }] };
          },
        }),
      }),
      insert: () => ({
        values: () => ({
          onConflictDoNothing: () => ({
            returning: async () => (opts.conflict ? [] : [newRow]),
          }),
        }),
      }),
    };
    return { tx, state, newRow };
  }

  it("ON CONFLICT DO NOTHING + in-tx pre-check: conflict returns the existing record", async () => {
    const { tx, state } = makeTx({ conflict: true });
    mockGetDb.mockResolvedValue({ transaction: async (fn: any) => fn(tx) });

    const { cashbackRouter } = await import("./crud119");
    const caller = cashbackRouter.createCaller({ user: { openId: "u1", role: "user" } } as any);
    const result: any = await caller.redeem(input);

    expect(result).toEqual(winnerRow);            // existing record returned, not a new one
    expect(state.debitCalls).toBe(2);             // debit + compensating undo-debit
  });

  it("no conflict → inserts and returns the new redemption", async () => {
    const { tx, newRow } = makeTx({ conflict: false });
    mockGetDb.mockResolvedValue({ transaction: async (fn: any) => fn(tx) });

    const { cashbackRouter } = await import("./crud119");
    const caller = cashbackRouter.createCaller({ user: { openId: "u1", role: "user" } } as any);
    const result: any = await caller.redeem(input);

    expect(result).toEqual(newRow);
  });
});

// ═══════════════════════════════════════════════════════════════════════════════
// M11: customer anonymize / merge
// ═══════════════════════════════════════════════════════════════════════════════
describe("M11 customerLifecycle", () => {
  beforeEach(() => { vi.clearAllMocks(); });

  it("anonymizeCustomer scrubs PII and tokenizes historical transactions", async () => {
    const executed: string[] = [];
    let call = 0;
    const db: any = {
      execute: vi.fn(async (q: any) => {
        call++;
        if (call === 1) return { rows: [{ id: "cust_1", email: "ada@example.com" }] }; // customer lookup
        if (call === 3) return { rows: [], rowCount: 4 };                                // transactions tokenized
        return { rows: [] };
      }),
      transaction: async (fn: any) => fn(db),
    };
    mockGetDb.mockResolvedValue(db);

    const { anonymizeCustomer } = await import("../customerLifecycle");
    const res = await anonymizeCustomer("merch_1", "cust_1");

    expect(res.anonymized).toBe(true);
    expect(res.transactionsScrubbed).toBe(4);
    expect(db.execute).toHaveBeenCalledTimes(3); // lookup + customers scrub + transactions tokenize
  });

  it("anonymizeCustomer on unknown customer is a no-op (fail loud via log)", async () => {
    const db: any = {
      execute: vi.fn(async () => ({ rows: [] })),
      transaction: async (fn: any) => fn(db),
    };
    mockGetDb.mockResolvedValue(db);

    const { anonymizeCustomer } = await import("../customerLifecycle");
    const res = await anonymizeCustomer("merch_1", "cust_missing");
    expect(res.anonymized).toBe(false);
    expect(db.execute).toHaveBeenCalledTimes(1); // lookup only
  });

  it("mergeCustomers repoints FKs, folds stats, deletes source — atomically", async () => {
    const db: any = {
      execute: vi.fn(async () => ({
        rows: [
          { id: "cust_src", email: "src@x.com", total_transactions: 2, total_spend: 1000 },
          { id: "cust_tgt", email: "tgt@x.com", total_transactions: 5, total_spend: 9000 },
        ],
        rowCount: 1,
      })),
      transaction: async (fn: any) => fn(db),
    };
    mockGetDb.mockResolvedValue(db);

    const { mergeCustomers } = await import("../customerLifecycle");
    const res = await mergeCustomers("merch_1", "cust_src", "cust_tgt");

    expect(res.merged).toBe(true);
    // 3 FK repoints + email repoint + stats fold + source delete + initial lookup
    expect(db.execute).toHaveBeenCalledTimes(1 + 3 + 1 + 1 + 1);
    expect(res.repointed["payment_requests.customer_id"]).toBe(1);
    expect(res.repointed["transactions.customer_email"]).toBe(1);
  });

  it("mergeCustomers with a missing party does not merge", async () => {
    const db: any = {
      execute: vi.fn(async () => ({ rows: [{ id: "cust_tgt", email: "tgt@x.com" }] })),
      transaction: async (fn: any) => fn(db),
    };
    mockGetDb.mockResolvedValue(db);

    const { mergeCustomers } = await import("../customerLifecycle");
    const res = await mergeCustomers("merch_1", "cust_src", "cust_tgt");
    expect(res.merged).toBe(false);
  });
});
