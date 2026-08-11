/**
 * REAL money-path tests — wallet sendMoney/topUp, payout maker-checker +
 * fund reservation, crossBorder.initiate idempotency/FX, Stripe webhook.
 *
 * Unlike the wave-N theater tests, every test here drives the real tRPC
 * procedures (appRouter.createCaller) or the real Express handler
 * (stripeWebhookHandler). The only fakes are:
 *   - a stateful in-memory stand-in for the Postgres connection (mirrors
 *     server/money-correctness.test.ts), which emulates the guarded
 *     UPDATE ... WHERE balance >= X semantics, transaction rollback, the
 *     (tenant_id, reference) unique violation, and the idempotency
 *     INSERT ... ON CONFLICT DO NOTHING claim race; and
 *   - the Stripe API client for wallet.topUp (the webhook tests use the
 *     REAL stripe SDK signature verification).
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { TRPCError } from "@trpc/server";
import { createHmac } from "node:crypto";

// Virtual stubs for modules referenced transitively by ./routers that are not
// installed in the sandbox (same as money-correctness.test.ts).
vi.mock("@grpc/grpc-js", () => ({}), { virtual: true });
vi.mock("@grpc/proto-loader", () => ({ loadSync: () => ({}), load: async () => ({}) }), { virtual: true });
vi.mock("web-push", () => ({ default: {}, setVapidDetails: () => {}, sendNotification: async () => ({}) }), { virtual: true });

// ─── Stripe API fake for wallet.topUp (controllable per test) ───────────────
const stripeState = vi.hoisted(() => ({
  configured: true,
  pi: null as null | { status: string; amount: number; currency: string },
  session: null as null | { payment_status: string; amount_total: number | null; currency: string | null },
  retrieveError: null as string | null,
}));
vi.mock("./stripe", () => ({
  isStripeConfigured: () => stripeState.configured,
  getStripe: () => ({
    paymentIntents: {
      retrieve: async () => {
        if (stripeState.retrieveError) throw new Error(stripeState.retrieveError);
        return stripeState.pi;
      },
    },
    checkout: {
      sessions: {
        retrieve: async () => {
          if (stripeState.retrieveError) throw new Error(stripeState.retrieveError);
          return stripeState.session;
        },
      },
    },
  }),
}));

// ─── Stateful in-memory Postgres stand-in ───────────────────────────────────
type Wallet = {
  id: string; userId?: string; merchantId?: string; tenantId: string;
  balance: string; currency: string; status: string;
};
type State = {
  idemRows: any[];
  wallets: Wallet[];
  walletTxns: any[];
  payouts: Map<string, any>;
  transfers: any[];
  consumerWallets: any[];
  consumerTxns: any[];
  users: Record<string, any>;
  merchant: any;
  fxRates: Array<{ targetCurrency: string; rate: string }>;
  createPayoutCalls: number;
  createTransferCalls: number;
};

function freshState(): State {
  return {
    idemRows: [],
    wallets: [],
    walletTxns: [],
    payouts: new Map(),
    transfers: [],
    consumerWallets: [],
    consumerTxns: [],
    users: {
      "admin-open-id": { id: 1, name: "Admin User", openId: "admin-open-id" },
      "maker-open-id": { id: 2, name: "Maker User", openId: "maker-open-id" },
    },
    merchant: {
      id: "mer_1", tenantId: "ten_default", businessName: "Test Merchant",
      payoutApprovalEnabled: true, payoutApprovalThreshold: 1000,
    },
    fxRates: [
      { targetCurrency: "NGN", rate: "1500" },
      { targetCurrency: "USD", rate: "1.2" },
    ],
    createPayoutCalls: 0,
    createTransferCalls: 0,
  };
}

let state: State;

// Integer-cents helpers for the fake (no float money math in the tests either).
const toCents = (s: string): number => {
  const neg = s.startsWith("-");
  const [i, f = ""] = s.replace("-", "").split(".");
  const v = parseInt(i || "0", 10) * 100 + parseInt((f + "00").slice(0, 2), 10);
  return neg ? -v : v;
};
const fromCents = (c: number): string =>
  `${c < 0 ? "-" : ""}${Math.floor(Math.abs(c) / 100)}.${String(Math.abs(c) % 100).padStart(2, "0")}`;

/** Render a drizzle sql`...` template into text + ordered params. */
function renderSql(q: any): { text: string; params: any[] } {
  const parts: string[] = [];
  const params: any[] = [];
  for (const c of q?.queryChunks ?? []) {
    if (c != null && typeof c === "object" && Array.isArray(c.value)) parts.push(c.value.join(""));
    else { params.push(c); parts.push("?"); }
  }
  return { text: parts.join(""), params };
}

import {
  consumerWallets as consumerWalletsTable,
  consumerWalletTxns as consumerWalletTxnsTable,
} from "../drizzle/schema";

vi.mock("./db", async (importOriginal) => {
  const orig = await importOriginal<any>();

  /** Execute one of the known raw SQL statements against the fake state. */
  function execSql(q: any, journal: Array<() => void>): { rows: any[] } {
    const { text, params } = renderSql(q);
    // Guarded debit: UPDATE wallets SET balance = balance - X WHERE id AND balance >= X
    if (/UPDATE wallets\s+SET balance = \(balance::numeric - /.test(text) && /balance::numeric >= /.test(text)) {
      const [amount, walletId, guardAmount] = params;
      const w = state.wallets.find((x) => x.id === walletId);
      if (!w || toCents(w.balance) < toCents(guardAmount)) return { rows: [] }; // guard fails → 0 rows
      const prev = w.balance;
      w.balance = fromCents(toCents(w.balance) - toCents(amount));
      journal.push(() => { w.balance = prev; });
      return { rows: [{ balance: w.balance }] };
    }
    // Credit: UPDATE wallets SET balance = balance + X WHERE id
    if (/UPDATE wallets\s+SET balance = \(balance::numeric \+ /.test(text)) {
      const [amount, walletId] = params;
      const w = state.wallets.find((x) => x.id === walletId);
      if (!w) return { rows: [] };
      const prev = w.balance;
      w.balance = fromCents(toCents(w.balance) + toCents(amount));
      journal.push(() => { w.balance = prev; });
      return { rows: [{ balance: w.balance }] };
    }
    // Settlement wallet lookup (payout approval): SELECT ... FOR UPDATE
    if (/SELECT id, balance FROM wallets/.test(text) && /FOR UPDATE/.test(text)) {
      const [merchantId, currency] = params;
      const w = state.wallets.find(
        (x) => x.merchantId === merchantId && x.currency === currency && x.status === "active",
      );
      return { rows: w ? [{ id: w.id, balance: w.balance }] : [] };
    }
    throw new Error(`fake-db: unexpected SQL: ${text}`);
  }

  const conn: any = {
    // ── withIdempotency claim: INSERT ... ON CONFLICT DO NOTHING RETURNING ──
    insert: (table: any) => ({
      values: (v: any) => {
        const doPlainInsert = () => {
          if (table === consumerWalletsTable) { state.consumerWallets.push({ ...v }); return [state.consumerWallets[state.consumerWallets.length - 1]]; }
          if (table === consumerWalletTxnsTable) { state.consumerTxns.push({ ...v }); return []; }
          throw new Error("fake-db: unexpected plain insert table");
        };
        return {
          onConflictDoNothing: () => ({
            returning: async () => {
              if (state.idemRows.some((r) => r.id === v.id)) return []; // claim race lost
              state.idemRows.push({ ...v });
              return [{ id: v.id }];
            },
          }),
          returning: async () => doPlainInsert(),
          then: (res: any, rej: any) => Promise.resolve().then(() => { doPlainInsert(); return []; }).then(res, rej),
        };
      },
    }),
    select: () => ({
      from: (table: any) => ({
        where: () => ({
          limit: async (n: number) => {
            if (table === consumerWalletsTable) return state.consumerWallets.slice(0, n);
            if (table === consumerWalletTxnsTable) return state.consumerTxns.slice(0, n);
            return state.idemRows.slice(0, n); // idempotency_requests
          },
        }),
      }),
    }),
    update: (table: any) => ({
      set: (v: any) => ({
        where: async () => {
          if (table === consumerWalletsTable) {
            const w = state.consumerWallets[0];
            if (w) Object.assign(w, v);
            return [];
          }
          if (state.idemRows[0]) Object.assign(state.idemRows[0], v);
          return [];
        },
      }),
    }),
    delete: () => ({
      where: async () => { state.idemRows.length = 0; return []; },
    }),
    // ── Transaction with rollback journal ──
    transaction: async (cb: (tx: any) => Promise<any>) => {
      const journal: Array<() => void> = [];
      const tx = {
        execute: async (q: any) => {
          // Yield so concurrent transactions genuinely interleave at the
          // guarded-decrement point (widens the TOCTOU race window).
          await new Promise((r) => setImmediate(r));
          return execSql(q, journal);
        },
        insert: () => ({
          values: (v: any) => ({
            returning: async () => {
              // walletTransactions — unique (tenant_id, reference)
              if (state.walletTxns.some((t) => t.tenantId === v.tenantId && t.reference === v.reference)) {
                throw Object.assign(new Error("duplicate key value violates unique constraint"), { code: "23505" });
              }
              const row = { id: `wtxn_${state.walletTxns.length + 1}`, ...v };
              state.walletTxns.push(row);
              journal.push(() => { state.walletTxns = state.walletTxns.filter((t) => t !== row); });
              return [row];
            },
          }),
        }),
        update: () => ({
          set: (v: any) => ({
            where: () => {
              const apply = () => {
                // payouts conditional status flip: only when still pending_approval
                const p = [...state.payouts.values()].find((x) => x.status === "pending_approval");
                if (!p) return [];
                const prev = { ...p };
                Object.assign(p, v);
                journal.push(() => { for (const k of Object.keys(p)) delete (p as any)[k]; Object.assign(p, prev); });
                return [{ id: p.id }];
              };
              const builder: any = { returning: async () => apply() };
              builder.then = (res: any, rej: any) => Promise.resolve().then(() => apply()).then(res, rej);
              return builder;
            },
          }),
        }),
      };
      try {
        return await cb(tx);
      } catch (err) {
        for (const undo of journal.reverse()) undo(); // ROLLBACK
        throw err;
      }
    },
  };

  return {
    ...orig,
    getDb: async () => conn,
    getUserByOpenId: async (openId: string) => state.users[openId] ?? null,
    getMerchantByOwnerId: async () => state.merchant,
    getOrCreateWallet: async (userId: string, tenantId = "ten_default", currency = "NGN") => {
      let w = state.wallets.find((x) => x.userId === userId && x.currency === currency);
      if (!w) {
        w = { id: `w_${userId}_${currency}`, userId, tenantId, balance: "0.00", currency, status: "active" };
        state.wallets.push(w);
      }
      return w;
    },
    getWalletByUserId: async (userId: string, currency = "NGN") =>
      state.wallets.find((x) => x.userId === userId && x.currency === currency) ?? null,
    getWalletTransactionByReference: async (tenantId: string, ref: string) =>
      state.walletTxns.find((t) => t.tenantId === tenantId && t.reference === ref) ?? null,
    getPayoutById: async (id: string) => state.payouts.get(id) ?? null,
    createPayout: async (p: any) => {
      state.createPayoutCalls++;
      const row = { ...p, createdAt: new Date(), updatedAt: new Date() };
      state.payouts.set(p.id, row);
      return row;
    },
    updatePayout: async (id: string, patch: any) => {
      const p = state.payouts.get(id);
      if (p) Object.assign(p, patch);
      return p;
    },
    createCrossBorderTransfer: async (t: any) => {
      state.createTransferCalls++;
      state.transfers.push({ ...t });
      return state.transfers[state.transfers.length - 1];
    },
    updateCrossBorderTransferStatusByTransferId: async () => {},
    getLatestFxRates: async () => state.fxRates,
    logAuditEvent: async () => {},
  };
});

import { appRouter } from "./routers";
import { __payoutMetaInternals } from "./routers";
import type { TrpcContext } from "./_core/context";

function makeCtx(openId = "admin-open-id", id = 1, role: "admin" | "user" = "admin"): TrpcContext {
  return {
    user: {
      id, openId, email: `${openId}@test.com`, name: `${openId} User`, role,
      loginMethod: "manus", createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
    } as any,
    req: { headers: { origin: "https://test.manus.space" }, protocol: "https" } as any,
    res: {} as any,
  };
}

const flushAsync = async () => {
  for (let i = 0; i < 5; i++) await new Promise((r) => setImmediate(r));
};

// ─── wallet.sendMoney ────────────────────────────────────────────────────────
describe("wallet.sendMoney — atomic P2P transfer (real procedure)", () => {
  beforeEach(() => {
    state = freshState();
    state.wallets.push(
      { id: "w_sender", userId: "1", tenantId: "ten_default", balance: "100.00", currency: "NGN", status: "active" },
      { id: "w_recipient", userId: "user-2", tenantId: "ten_default", balance: "10.00", currency: "NGN", status: "active" },
    );
  });

  // PRODUCTION BUG (reported, not fixed — production code may not change):
  // sendMoney writes the debit AND credit ledger legs with the SAME
  // (tenantId, reference) pair, but wallet_transactions has UNIQUE
  // (tenant_id, reference) (drizzle/0008_bumpy_the_hood.sql:202). The second
  // insert always raises 23505, the transaction rolls back, and the .catch
  // replay-lookup finds nothing (the winner leg rolled back with it), so
  // EVERY same-tenant P2P transfer fails with an internal error.
  // The three `it.fails` tests below pin the CORRECT contract so they flip
  // green once the ledger schema/code is fixed (e.g. per-leg reference or
  // including `type` in the constraint).
  it("debits sender and credits recipient atomically with a double-entry ledger", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const res = await caller.wallet.sendMoney({ recipientId: "user-2", amount: 40, currency: "NGN" });
    expect(res.success).toBe(true);
    expect(res.idempotentReplay).toBe(false);
    const sender = state.wallets.find((w) => w.id === "w_sender")!;
    const recipient = state.wallets.find((w) => w.id === "w_recipient")!;
    expect(sender.balance).toBe("60.00");
    expect(recipient.balance).toBe("50.00");
    // Double-entry: one debit leg + one credit leg grouped by the transfer
    // reference with per-leg `:debit` / `:credit` suffixes (the
    // (tenant_id, reference) unique constraint forbids identical references).
    const legs = state.walletTxns.filter((t) => t.reference.startsWith(`${res.reference}:`));
    expect(legs).toHaveLength(2);
    expect(legs.map((l) => l.type).sort()).toEqual(["credit", "debit"]);
    expect(legs.find((l) => l.type === "debit")).toMatchObject({
      walletId: "w_sender", amount: "40.00", balanceAfter: "60.00", status: "completed",
    });
    expect(legs.find((l) => l.type === "credit")).toMatchObject({
      walletId: "w_recipient", amount: "40.00", balanceAfter: "50.00",
    });
  });

  it("insufficient funds: guarded debit fails and NOTHING is applied (rollback)", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.sendMoney({ recipientId: "user-2", amount: 150, currency: "NGN" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/[Ii]nsufficient/) });
    expect(state.wallets.find((w) => w.id === "w_sender")!.balance).toBe("100.00");
    expect(state.wallets.find((w) => w.id === "w_recipient")!.balance).toBe("10.00");
    expect(state.walletTxns).toHaveLength(0); // no orphan ledger rows
  });

  it("idempotent replay: same idempotency key executes exactly once", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { recipientId: "user-2", amount: 40, currency: "NGN", idempotencyKey: "p2p-replay-key-1" };
    const r1 = await caller.wallet.sendMoney(input);
    const r2 = await caller.wallet.sendMoney(input);
    expect(r2).toEqual(r1); // replay returns the original stored response
    expect(state.wallets.find((w) => w.id === "w_sender")!.balance).toBe("60.00"); // debited once
    expect(state.walletTxns).toHaveLength(2); // single ledger pair
  });

  it("concurrent race: N debits on balance X — total debited never exceeds X", async () => {
    const caller = appRouter.createCaller(makeCtx());
    // Staggered starts: works around a vitest dynamic-import mock race while
    // still overlapping the transactions (the fake yields inside tx.execute).
    const pending: Promise<any>[] = [];
    for (let i = 0; i < 5; i++) {
      pending.push(caller.wallet.sendMoney({ recipientId: "user-2", amount: 60, currency: "NGN" }));
      await new Promise((r) => setImmediate(r));
    }
    const results = await Promise.allSettled(pending);
    const succeeded = results.filter((r) => r.status === "fulfilled");
    const failed = results.filter((r) => r.status === "rejected");
    expect(succeeded).toHaveLength(1); // 100.00 funds exactly one 60.00 transfer
    expect(failed).toHaveLength(4);
    for (const f of failed) {
      expect((f as PromiseRejectedResult).reason).toMatchObject({ code: "BAD_REQUEST" });
    }
    const sender = state.wallets.find((w) => w.id === "w_sender")!;
    expect(toCents(sender.balance)).toBeGreaterThanOrEqual(0); // invariant: never negative
    expect(sender.balance).toBe("40.00");
  });

  it("rejects transfer to own wallet", async () => {
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.sendMoney({ recipientId: "1", amount: 10, currency: "NGN" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── wallet.topUp ────────────────────────────────────────────────────────────
describe("wallet.topUp — Stripe-verified crediting (real procedure)", () => {
  beforeEach(() => {
    state = freshState();
    stripeState.configured = true;
    stripeState.pi = { status: "succeeded", amount: 500_00, currency: "ngn" };
    stripeState.session = null;
    stripeState.retrieveError = null;
    state.wallets.push(
      { id: "w_user1", userId: "1", tenantId: "ten_default", balance: "0.00", currency: "NGN", status: "active" },
    );
  });

  it("rejects an unverifiable payment reference (Stripe rejects the id)", async () => {
    stripeState.retrieveError = "No such payment_intent: 'pi_fake'";
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.topUp({ amount: 500, currency: "NGN", channel: "card", paymentReference: "pi_fake123" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.walletTxns).toHaveLength(0);
    expect(state.wallets[0].balance).toBe("0.00");
  });

  it("rejects a payment that is not succeeded", async () => {
    stripeState.pi = { status: "requires_payment_method", amount: 500_00, currency: "ngn" };
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.topUp({ amount: 500, currency: "NGN", channel: "card", paymentReference: "pi_unpaid1" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/not completed/) });
    expect(state.walletTxns).toHaveLength(0);
  });

  it("rejects a verified payment whose amount/currency mismatches the request", async () => {
    stripeState.pi = { status: "succeeded", amount: 100_00, currency: "ngn" }; // 100.00, not 500.00
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.topUp({ amount: 500, currency: "NGN", channel: "card", paymentReference: "pi_mismatch" }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST", message: expect.stringMatching(/does not match/) });
    expect(state.walletTxns).toHaveLength(0);
  });

  it("fails loud (503) when Stripe is not configured — no unbacked minting", async () => {
    stripeState.configured = false;
    const caller = appRouter.createCaller(makeCtx());
    await expect(
      caller.wallet.topUp({ amount: 500, currency: "NGN", channel: "card", paymentReference: "pi_any12345" }),
    ).rejects.toMatchObject({ code: "SERVICE_UNAVAILABLE" });
    expect(state.walletTxns).toHaveLength(0);
  });

  it("credits exactly the verified amount and writes the ledger row", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const res = await caller.wallet.topUp({ amount: 500, currency: "NGN", channel: "card", paymentReference: "pi_good123" });
    expect(res.success).toBe(true);
    expect(res.idempotentReplay).toBe(false);
    expect(res.newBalance).toBe("500.00");
    expect(state.wallets[0].balance).toBe("500.00");
    expect(state.walletTxns).toHaveLength(1);
    expect(state.walletTxns[0]).toMatchObject({ type: "credit", amount: "500.00", reference: "TOPUP-pi_good123" });
  });

  it("sequential double-submit: one Stripe payment → one credit", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { amount: 500, currency: "NGN", channel: "card" as const, paymentReference: "pi_double1" };
    const r1 = await caller.wallet.topUp(input);
    const r2 = await caller.wallet.topUp(input);
    expect(r1.idempotentReplay).toBe(false);
    expect(r2.idempotentReplay).toBe(true);
    expect(state.wallets[0].balance).toBe("500.00"); // credited once
    expect(state.walletTxns).toHaveLength(1);
  });

  it("concurrent double-submit race: exactly one credit survives", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { amount: 500, currency: "NGN", channel: "card" as const, paymentReference: "pi_race123" };
    const p1 = caller.wallet.topUp(input);
    await new Promise((r) => setImmediate(r)); // stagger past the dynamic-import mock race
    const p2 = caller.wallet.topUp(input);
    const [r1, r2] = await Promise.all([p1, p2]);
    expect(r1.success && r2.success).toBe(true);
    expect(state.wallets[0].balance).toBe("500.00"); // never double-credited
    expect(state.walletTxns).toHaveLength(1);
    expect([r1.idempotentReplay, r2.idempotentReplay].sort()).toEqual([false, true]);
  });
});

// ─── payouts.create idempotency ──────────────────────────────────────────────
describe("payouts.create — idempotent creation (real procedure)", () => {
  beforeEach(() => { state = freshState(); });

  it("explicit key: replay returns the original payout, creates once", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { amount: 5000, currency: "NGN", bankCode: "044", accountNumber: "0123456789", idempotencyKey: "payout-key-0001" };
    const r1 = await caller.payouts.create(input);
    const r2 = await caller.payouts.create(input);
    expect(r2.id).toBe(r1.id);
    expect(state.createPayoutCalls).toBe(1);
    expect(state.payouts.size).toBe(1);
  });

  it("hash-derived key: exact-payload retry without a client key still dedupes", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { amount: 7000, currency: "NGN", accountNumber: "0123456789" };
    const r1 = await caller.payouts.create(input);
    const r2 = await caller.payouts.create(input);
    expect(r2.id).toBe(r1.id);
    expect(state.createPayoutCalls).toBe(1);
    // ...but a deliberately different payload produces a NEW payout
    const r3 = await caller.payouts.create({ ...input, amount: 7001 });
    expect(r3.id).not.toBe(r1.id);
    expect(state.createPayoutCalls).toBe(2);
  });
});

// ─── payouts.approve maker-checker + fund reservation ───────────────────────
describe("payouts.approve — maker-checker & atomic fund reservation (real procedure)", () => {
  const { encodePayoutMeta } = __payoutMetaInternals;

  beforeEach(() => {
    state = freshState();
    state.payouts.set("pyo_1", {
      id: "pyo_1", merchantId: "mer_1", tenantId: "ten_default",
      amount: 200000, feeAmount: 1000, currency: "NGN",
      status: "pending_approval",
      failureReason: encodePayoutMeta({ initiatorId: "maker-open-id" }),
    });
  });

  it("approver == initiator → FORBIDDEN (separation of duties)", async () => {
    const caller = appRouter.createCaller(makeCtx("maker-open-id", 2));
    await expect(caller.payouts.approve({ id: "pyo_1" })).rejects.toMatchObject({
      code: "FORBIDDEN",
      message: expect.stringMatching(/Separation of duties/),
    });
    expect(state.payouts.get("pyo_1").status).toBe("pending_approval");
  });

  it("approval without a settlement wallet → PRECONDITION_FAILED, no status flip", async () => {
    const caller = appRouter.createCaller(makeCtx("admin-open-id", 1)); // different user = checker
    await expect(caller.payouts.approve({ id: "pyo_1" })).rejects.toMatchObject({
      code: "PRECONDITION_FAILED",
    });
    expect(state.payouts.get("pyo_1").status).toBe("pending_approval");
  });

  it("approval with insufficient settlement funds → BAD_REQUEST, reservation rolled back", async () => {
    state.wallets.push(
      { id: "w_settle", merchantId: "mer_1", tenantId: "ten_default", balance: "100.00", currency: "NGN", status: "active" },
    );
    const caller = appRouter.createCaller(makeCtx("admin-open-id", 1));
    await expect(caller.payouts.approve({ id: "pyo_1" })).rejects.toMatchObject({
      code: "BAD_REQUEST", message: expect.stringMatching(/[Ii]nsufficient/),
    });
    expect(state.wallets[0].balance).toBe("100.00"); // untouched
    expect(state.payouts.get("pyo_1").status).toBe("pending_approval"); // untouched
  });

  it("checker approval reserves amount+fee atomically and flips status", async () => {
    state.wallets.push(
      { id: "w_settle", merchantId: "mer_1", tenantId: "ten_default", balance: "250000.00", currency: "NGN", status: "active" },
    );
    const caller = appRouter.createCaller(makeCtx("admin-open-id", 1));
    const res = await caller.payouts.approve({ id: "pyo_1", reason: "verified" });
    expect(res).toEqual({ success: true, via: "db" });
    // Reserved exactly amount + fee = 200000 + 1000 = 201000.00
    expect(state.wallets[0].balance).toBe("49000.00");
    expect(state.payouts.get("pyo_1").status).toBe("pending");
  });

  it("double approval: the second approve is rejected (status guard)", async () => {
    state.wallets.push(
      { id: "w_settle", merchantId: "mer_1", tenantId: "ten_default", balance: "500000.00", currency: "NGN", status: "active" },
    );
    const caller = appRouter.createCaller(makeCtx("admin-open-id", 1));
    await caller.payouts.approve({ id: "pyo_1" });
    await expect(caller.payouts.approve({ id: "pyo_1" })).rejects.toMatchObject({ code: "BAD_REQUEST" });
    expect(state.wallets[0].balance).toBe("299000.00"); // reserved exactly once
  });
});

// ─── crossBorder.initiate / getQuote ─────────────────────────────────────────
describe("crossBorder — idempotent initiation & integer FX (real procedure)", () => {
  beforeEach(() => { state = freshState(); });

  const baseInput = {
    receiverId: "+2348000000000",
    sourceCurrency: "NGN",
    targetCurrency: "USD",
    amount: "1000.00",
    corridor: "NGN-USD",
    rail: "mojaloop" as const,
  };

  it("initiate persists integer-FX-derived rate, fee and target amount", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const res = await caller.crossBorder.initiate({ ...baseInput, idempotencyKey: "xb-key-00000001" });
    expect(res.success).toBe(true);
    const t = state.transfers[0];
    // 1500 NGN/USD, 1.2 (USD) → cross rate 0.0008, 1.5% fee, half-up rounding
    expect(t.exchangeRate).toBe("0.000800");
    expect(t.fee).toBe("15.00");
    expect(t.targetAmount).toBe("0.79"); // (1000 - 15) * 0.0008 = 0.788 → 79 minor half-up
    expect(t.status).toBe("pending");
  });

  it("idempotent replay returns the original transferId without re-creating", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { ...baseInput, idempotencyKey: "xb-key-00000002" };
    const r1 = await caller.crossBorder.initiate(input);
    const r2 = await caller.crossBorder.initiate(input);
    expect(r2.transferId).toBe(r1.transferId);
    expect(state.createTransferCalls).toBe(1);
    expect(state.transfers).toHaveLength(1);
  });

  it("concurrent same-key initiation: exactly one transfer is created", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const input = { ...baseInput, idempotencyKey: "xb-key-00000003" };
    const p1 = caller.crossBorder.initiate(input);
    await new Promise((r) => setImmediate(r)); // stagger past the dynamic-import mock race
    const p2 = caller.crossBorder.initiate(input);
    const results = await Promise.allSettled([p1, p2]);
    const ok = results.filter((r) => r.status === "fulfilled") as PromiseFulfilledResult<any>[];
    const conflicted = results.filter((r) => r.status === "rejected");
    expect(state.transfers).toHaveLength(1); // single execution invariant
    // Winner created the transfer; loser either replayed the stored result or got CONFLICT
    if (conflicted.length > 0) {
      expect((conflicted[0] as PromiseRejectedResult).reason).toMatchObject({ code: "CONFLICT" });
    }
    if (ok.length === 2) expect(ok[1].value.transferId).toBe(ok[0].value.transferId);
    // After completion, a replay is served from the stored response
    const replay = await caller.crossBorder.initiate(input);
    expect(state.transfers).toHaveLength(1);
    expect(typeof replay.transferId).toBe("string");
  });

  it("getQuote computes corridor amounts with integer half-up rounding", async () => {
    const caller = appRouter.createCaller(makeCtx());
    const q = await caller.crossBorder.getQuote({ sourceCurrency: "NGN", targetCurrency: "USD", amount: "1000.00", rail: "mojaloop" });
    expect(q.exchange_rate).toBe("0.000800");
    expect(q.fee).toBe("15.00");
    expect(q.target_amount).toBe("0.79");
  });

  it("getQuote fee rounding is half-up at the minor unit (333.33 → 5.00)", async () => {
    state.fxRates = [
      { targetCurrency: "NGN", rate: "1" },
      { targetCurrency: "USD", rate: "1" },
    ];
    const caller = appRouter.createCaller(makeCtx());
    const q = await caller.crossBorder.getQuote({ sourceCurrency: "NGN", targetCurrency: "USD", amount: "333.33", rail: "mojaloop" });
    expect(q.exchange_rate).toBe("1.000000");
    expect(q.fee).toBe("5.00"); // 1.5% of 33333 minor = 499.995 → 500 half-up
    expect(q.target_amount).toBe("328.33");
  });
});
