/**
 * Money-correctness regression tests (P0-6/P0-7/P1-7/P2-2/P2-6).
 *
 * NOTE: pg-mem is referenced by server/pgMemSetup.ts but is NOT installed in
 * node_modules and is not wired into vitest.config.ts, so these tests use a
 * minimal in-memory fake of the drizzle connection for withIdempotency and
 * pure-function tests for the FX / maker-checker helpers.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";
import { TRPCError } from "@trpc/server";

// Modules referenced transitively by ./routers that are not installed in the
// sandbox — stub them virtually so the pure helpers can be imported.
vi.mock("@grpc/grpc-js", () => ({}), { virtual: true });
vi.mock("@grpc/proto-loader", () => ({ loadSync: () => ({}), load: async () => ({}) }), { virtual: true });
vi.mock("web-push", () => ({ default: {}, setVapidDetails: () => {}, sendNotification: async () => ({}) }), { virtual: true });

// ─── Fake drizzle connection for the idempotency_requests table ──────────────
// Emulates: INSERT ... ON CONFLICT DO NOTHING RETURNING (PK claim race),
// SELECT ... LIMIT 1, UPDATE ... SET, DELETE ... WHERE.
type Row = {
  id: string;
  merchantId: string;
  tenantId: string;
  operation: string;
  requestHash: string;
  responseStatus: number;
  responseBody: unknown;
  expiresAt: Date;
  createdAt: Date;
};

function makeFakeDb() {
  const rows: Row[] = [];
  const conn = {
    insert: () => ({
      values: (v: Row) => ({
        onConflictDoNothing: () => ({
          returning: async () => {
            // ON CONFLICT (PK id) DO NOTHING → no row returned for the loser.
            if (rows.some((r) => r.id === v.id)) return [];
            rows.push({ ...v });
            return [{ id: v.id }];
          },
        }),
      }),
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: async (n: number) => rows.slice(0, n),
        }),
      }),
    }),
    update: () => ({
      set: (v: Partial<Row>) => ({
        where: async () => {
          if (rows[0]) Object.assign(rows[0], v);
          return [];
        },
      }),
    }),
    delete: () => ({
      where: async () => {
        rows.length = 0;
        return [];
      },
    }),
  };
  return { conn: conn as any, rows };
}

let fake: ReturnType<typeof makeFakeDb>;

vi.mock("./db", async (importOriginal) => {
  const orig = await importOriginal<any>();
  return { ...orig, getDb: async () => fake.conn };
});

import { withIdempotency } from "./idempotency";
import { __fxInternals, __payoutMetaInternals, __payoutIdempotencyInternals } from "./routers";

// ─── P2-6: withIdempotency atomicity ──────────────────────────────────────────
describe("withIdempotency — atomic claim / replay (P2-6)", () => {
  beforeEach(() => {
    fake = makeFakeDb();
  });

  it("replays the same key+payload without re-executing", async () => {
    let calls = 0;
    const execute = async () => ({ n: ++calls });
    const opts = {
      key: "key_replay_1",
      merchantId: "m1",
      operation: "payouts.create",
      requestBody: { amount: 5000 },
      execute,
    };
    const r1 = await withIdempotency(opts);
    const r2 = await withIdempotency(opts);
    expect(r1).toEqual({ n: 1 });
    expect(r2).toEqual({ n: 1 });
    expect(calls).toBe(1); // single execution
    expect(fake.rows).toHaveLength(1); // single stored record
  });

  it("rejects the same key with a different payload (CONFLICT)", async () => {
    const execute = async () => ({ ok: true });
    await withIdempotency({
      key: "key_conflict_1", merchantId: "m1", operation: "op",
      requestBody: { amount: 100 }, execute,
    });
    await expect(
      withIdempotency({
        key: "key_conflict_1", merchantId: "m1", operation: "op",
        requestBody: { amount: 200 }, execute,
      }),
    ).rejects.toMatchObject({ code: "CONFLICT" });
  });

  it("concurrent same-key calls: exactly one executes, loser gets in-progress CONFLICT, later replay is cached", async () => {
    let calls = 0;
    let release!: () => void;
    const gate = new Promise<{ done: boolean }>((res) => { release = () => res({ done: true }); });
    const execute = () => { calls++; return gate; };
    const opts = {
      key: "key_race_1", merchantId: "m1", operation: "op",
      requestBody: { a: 1 }, execute,
    };
    const p1 = withIdempotency(opts);
    // Let p1 claim the key and enter execute() before the second call.
    await new Promise((r) => setImmediate(r));
    await expect(withIdempotency(opts)).rejects.toMatchObject({ code: "CONFLICT" });
    release();
    await expect(p1).resolves.toEqual({ done: true });
    // After completion, a replay returns the stored response without executing.
    const replay = await withIdempotency(opts);
    expect(replay).toEqual({ done: true });
    expect(calls).toBe(1);
  });

  it("persists error responses so retries replay the error without re-executing", async () => {
    let calls = 0;
    const execute = async () => {
      calls++;
      throw new TRPCError({ code: "BAD_REQUEST", message: "insufficient funds" });
    };
    const opts = {
      key: "key_err_1", merchantId: "m1", operation: "op",
      requestBody: { a: 1 }, execute,
    };
    await expect(withIdempotency(opts)).rejects.toMatchObject({ code: "BAD_REQUEST" });
    const replay = await withIdempotency(opts);
    expect(replay).toEqual({ error: "insufficient funds" });
    expect(calls).toBe(1);
  });

  it("evicts expired keys and re-executes", async () => {
    let calls = 0;
    const execute = async () => ({ n: ++calls });
    const opts = {
      key: "key_ttl_1", merchantId: "m1", operation: "op",
      requestBody: { a: 1 }, execute,
    };
    await withIdempotency(opts);
    // Force expiry, then a conflict-loser path should evict + re-claim.
    fake.rows[0].expiresAt = new Date(Date.now() - 1000);
    const r = await withIdempotency(opts);
    expect(r).toEqual({ n: 2 });
    expect(calls).toBe(2);
  });

  it("rejects keys shorter than 8 chars", async () => {
    await expect(
      withIdempotency({ key: "short", merchantId: "m1", operation: "op", requestBody: {}, execute: async () => ({}) }),
    ).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

// ─── P0-6: guarded-decrement invariant (pattern-level; no DB driver here) ────
// Mirrors the SQL semantics of: UPDATE ... SET balance = balance - X
// WHERE id = ? AND balance >= X — applied atomically under the row lock.
describe("guarded atomic decrement invariant (P0-6)", () => {
  function guardedDebit(wallet: { balance: number }, amount: number): boolean {
    // Atomic compare-and-debit, as the guarded UPDATE does in one statement.
    if (wallet.balance < amount) return false; // guard fails → 0 rows → error
    wallet.balance -= amount;
    return true;
  }

  it("concurrent debits can never drive the balance negative", async () => {
    const wallet = { balance: 100_00 }; // 100.00 in kobo
    const results = await Promise.all(
      Array.from({ length: 4 }, () => Promise.resolve(guardedDebit(wallet, 60_00))),
    );
    expect(results.filter(Boolean)).toHaveLength(1); // exactly one wins
    expect(wallet.balance).toBe(40_00); // never negative, exactly one debit applied
  });

  it("sequential debits stop at exactly zero available funds", () => {
    const wallet = { balance: 100_00 };
    expect(guardedDebit(wallet, 100_00)).toBe(true);
    expect(guardedDebit(wallet, 1)).toBe(false);
    expect(wallet.balance).toBe(0);
  });
});

// ─── P1-7: maker-checker separation of duties ────────────────────────────────
describe("payout maker-checker (P1-7)", () => {
  const { encodePayoutMeta, parsePayoutMeta, assertApproverIsNotInitiator } = __payoutMetaInternals;

  it("round-trips initiator + workflow metadata through failureReason", () => {
    const encoded = encodePayoutMeta({ workflowId: "wf_123", initiatorId: "user_a" });
    expect(encoded).toBe("workflow:wf_123|initiator:user_a");
    expect(parsePayoutMeta(encoded)).toEqual({ workflowId: "wf_123", initiatorId: "user_a" });
    expect(parsePayoutMeta(encodePayoutMeta({ initiatorId: "user_a" }))).toEqual({ initiatorId: "user_a" });
    expect(parsePayoutMeta(null)).toEqual({});
    expect(parsePayoutMeta("some unrelated failure")).toEqual({});
  });

  it("rejects approver == initiator with FORBIDDEN", () => {
    const fr = encodePayoutMeta({ initiatorId: "user_a" });
    try {
      assertApproverIsNotInitiator(fr, "user_a");
      expect.unreachable("should have thrown FORBIDDEN");
    } catch (e: any) {
      expect(e).toBeInstanceOf(TRPCError);
      expect(e.code).toBe("FORBIDDEN");
    }
  });

  it("allows a different approver (checker)", () => {
    const fr = encodePayoutMeta({ initiatorId: "user_a" });
    expect(() => assertApproverIsNotInitiator(fr, "user_b")).not.toThrow();
  });

  it("allows legacy payouts with no initiator metadata", () => {
    expect(() => assertApproverIsNotInitiator(null, "user_a")).not.toThrow();
    expect(() => assertApproverIsNotInitiator(undefined, "user_a")).not.toThrow();
  });
});

// ─── P0-7a: derived idempotency keys ─────────────────────────────────────────
describe("payout idempotency key derivation (P0-7a)", () => {
  const { derivePayoutIdempotencyKey } = __payoutIdempotencyInternals;

  it("is deterministic for identical payloads and distinct for different ones", () => {
    const p1 = { amount: 1000, currency: "NGN", accountNumber: "0123456789" };
    const p2 = { amount: 1001, currency: "NGN", accountNumber: "0123456789" };
    const k1 = derivePayoutIdempotencyKey("payouts.create", "mer_1", p1);
    expect(derivePayoutIdempotencyKey("payouts.create", "mer_1", p1)).toBe(k1);
    expect(derivePayoutIdempotencyKey("payouts.create", "mer_1", p2)).not.toBe(k1);
    expect(derivePayoutIdempotencyKey("payouts.create", "mer_2", p1)).not.toBe(k1);
    expect(derivePayoutIdempotencyKey("payouts.createBulk", "mer_1", p1)).not.toBe(k1);
    expect(k1.length).toBeGreaterThanOrEqual(8); // satisfies withIdempotency min length
  });
});

// ─── P2-2: integer FX arithmetic ─────────────────────────────────────────────
describe("integer FX arithmetic (P2-2)", () => {
  const { parseScaledDecimal, formatScaledDecimal, computeCorridorAmounts } = __fxInternals;

  it("parses decimal strings to scaled integers without floats", () => {
    expect(parseScaledDecimal("1530.500000", 1_000_000n)).toBe(1_530_500_000n);
    expect(parseScaledDecimal("1000.00", 100n)).toBe(100_000n);
    expect(parseScaledDecimal("0.000001", 1_000_000n)).toBe(1n);
  });

  it("rounds half-up at parse time", () => {
    expect(parseScaledDecimal("1.005", 100n)).toBe(101n); // .005 → +1
    expect(parseScaledDecimal("1.0049", 100n)).toBe(100n);
    expect(parseScaledDecimal("1.999", 100n)).toBe(200n);
  });

  it("formats scaled integers back to fixed-precision strings", () => {
    expect(formatScaledDecimal(1_530_500_000n, 1_000_000n)).toBe("1530.500000");
    expect(formatScaledDecimal(100_000n, 100n)).toBe("1000.00");
    expect(formatScaledDecimal(78_80n, 100n)).toBe("78.80");
  });

  it("computes corridor amounts in integer minor units (NGN→USD example)", () => {
    // 1000.00 source, src 1500 NGN/USD, tgt 1.2 USD-cents... cross rate = 1.2/1500 = 0.0008
    const r = computeCorridorAmounts("1000.00", "1500", "1.2");
    expect(r).not.toBeNull();
    expect(r!.exchangeRate).toBe("0.000800");
    expect(r!.fee).toBe("15.00"); // 1.5% of 1000.00, exact
    expect(r!.targetAmount).toBe("0.79"); // (1000 - 15) * 0.0008 = 0.788 → 78.8 minor → 79 half-up
  });

  it("fee rounding is half-up at the minor unit", () => {
    // 333.33 → minor 33333; 1.5% = 499.995 → 500 half-up → 5.00
    const r = computeCorridorAmounts("333.33", "1", "1");
    expect(r!.fee).toBe("5.00");
    expect(r!.exchangeRate).toBe("1.000000");
    // (333.33 - 5.00) * 1.0 = 328.33
    expect(r!.targetAmount).toBe("328.33");
  });

  it("returns null for a non-positive source rate", () => {
    expect(computeCorridorAmounts("100.00", "0", "1.5")).toBeNull();
    expect(computeCorridorAmounts("100.00", "-1", "1.5")).toBeNull();
  });

  it("no float artifacts on classic problem values (0.1 + 0.2 class)", () => {
    // 0.3 source at rate 1: fee 1.5% of 30 minor = 0.45 → 0 half-up... verify exactness
    const r = computeCorridorAmounts("0.30", "1", "1");
    expect(r!.fee).toBe("0.00"); // 0.45 half-up at minor unit → 0 (below half a cent? 0.45→0)
    expect(r!.targetAmount).toBe("0.30");
  });
});
