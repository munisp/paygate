// @vitest-environment node
/**
 * wave5.nonceGuard.test.ts — M1 wave-5 in-memory store fixes.
 *
 * Covers:
 *  1. claimNonce semantics (first=true, second=false; scoped; TTL)
 *  2. claimNonce fail-closed in production when Redis is unavailable
 *  3. EMI double-disbursement guard — second call rejected (conditional UPDATE)
 *  4. One rate-limit window — ring export limit throws after 10/hour
 */

import { describe, it, expect, beforeEach, afterAll, vi } from "vitest";

// ─── Fake DB for the EMI disbursement guard ──────────────────────────────────
// Emulates the atomic conditional UPDATE: a loan row can transition
// disbursing → disbursed exactly once; the second UPDATE matches zero rows.
const loanStatus = new Map<string, string>();

vi.mock("./db", () => ({
  getDb: async () => ({
    execute: async () => {
      // security33.checkEmiDisbursementIdempotency issues exactly one UPDATE;
      // extract the loanId from the query chunks is unnecessary — we emulate
      // per-loan transitions via a module-level queue set by the test.
      const loanId = (globalThis as any).__testLoanId as string;
      if (loanStatus.get(loanId) === "disbursing") {
        loanStatus.set(loanId, "disbursed");
        return { rows: [{ id: loanId }] };
      }
      return { rows: [] };
    },
  }),
}));

import { claimNonce, bumpCounter, __setGuardRedisForTest } from "./nonceGuard";
import { checkEmiDisbursementIdempotency, checkRingExportRateLimit } from "./security33";

beforeEach(() => {
  // Force the dev in-process fallback (no Redis) for deterministic tests.
  __setGuardRedisForTest(null);
});

afterAll(() => {
  __setGuardRedisForTest(null);
});

// ─── 1. claimNonce ───────────────────────────────────────────────────────────
describe("claimNonce — shared replay guard", () => {
  it("first claim returns true, second claim returns false", async () => {
    const id = `nonce-${Date.now()}-${Math.random()}`;
    expect(await claimNonce("test", id, 60_000)).toBe(true);
    expect(await claimNonce("test", id, 60_000)).toBe(false);
  });

  it("nonces are scoped — same id in a different scope claims independently", async () => {
    const id = `scoped-${Date.now()}-${Math.random()}`;
    expect(await claimNonce("scopeA", id, 60_000)).toBe(true);
    expect(await claimNonce("scopeB", id, 60_000)).toBe(true);
    expect(await claimNonce("scopeA", id, 60_000)).toBe(false);
  });

  it("expired nonce can be claimed again", async () => {
    const id = `ttl-${Date.now()}-${Math.random()}`;
    expect(await claimNonce("test", id, 5)).toBe(true);
    await new Promise((r) => setTimeout(r, 10));
    expect(await claimNonce("test", id, 60_000)).toBe(true);
  });

  it("fails CLOSED in production when Redis is unavailable", async () => {
    const savedEnv = process.env.NODE_ENV;
    process.env.NODE_ENV = "production";
    try {
      __setGuardRedisForTest(null);
      await expect(claimNonce("prod", `p-${Date.now()}`, 60_000)).rejects.toThrow(/fail-closed|unavailable/i);
    } finally {
      process.env.NODE_ENV = savedEnv;
    }
  });
});

// ─── 2. EMI double-disbursement guard ────────────────────────────────────────
describe("checkEmiDisbursementIdempotency — atomic DB guard", () => {
  it("first disbursement succeeds, second is rejected with CONFLICT", async () => {
    const loanId = `loan-${Date.now()}`;
    loanStatus.set(loanId, "disbursing");
    (globalThis as any).__testLoanId = loanId;

    await expect(checkEmiDisbursementIdempotency(loanId)).resolves.toBeUndefined();
    expect(loanStatus.get(loanId)).toBe("disbursed");

    await expect(checkEmiDisbursementIdempotency(loanId)).rejects.toThrowError(/already disbursed/i);
  });

  it("rejects a loan that is not in a disbursable state", async () => {
    const loanId = `loan-pending-${Date.now()}`;
    loanStatus.set(loanId, "pending_approval");
    (globalThis as any).__testLoanId = loanId;
    await expect(checkEmiDisbursementIdempotency(loanId)).rejects.toThrowError();
  });
});

// ─── 3. Rate-limit window (ring export 10/hour) ──────────────────────────────
describe("checkRingExportRateLimit — fixed window counter", () => {
  it("allows 10 exports then throws TOO_MANY_REQUESTS", async () => {
    const userId = `ring-user-${Date.now()}-${Math.random()}`;
    for (let i = 0; i < 10; i++) {
      await expect(checkRingExportRateLimit(userId)).resolves.toBeUndefined();
    }
    await expect(checkRingExportRateLimit(userId)).rejects.toThrowError(/rate limit exceeded/i);
  });

  it("bumpCounter counts within a fixed window", async () => {
    const id = `ctr-${Date.now()}-${Math.random()}`;
    expect(await bumpCounter("wtest", id, 60_000)).toBe(1);
    expect(await bumpCounter("wtest", id, 60_000)).toBe(2);
    expect(await bumpCounter("wtest", id, 60_000)).toBe(3);
  });
});
