/**
 * parityFixes.test.ts — cross-cutting audit-fix tests that do not belong to a
 * single existing suite:
 *
 *   H14 — expireStalePendingCharges sweeper (called by cronJobs)
 *   M20 — subscription manage tokens are single-use (410-style second use)
 *
 * Mocking pattern follows paymentRequests.test.ts: server/db mocked with a
 * match-queued execute(), drizzle-orm REAL (sql only builds query objects).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  execQueue: [] as Array<{ match: string; rows: any[] }>,
  execCalls: [] as string[],
  events: [] as Array<{ event: string; merchantId: string; data: any }>,
}));

function sqlTextOf(q: any): string {
  const seen = new Set<any>();
  const parts: string[] = [];
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === 'string') { parts.push(v); return; }
    if (typeof v !== 'object') return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const key of Object.keys(v)) walk(v[key]);
  };
  walk(q);
  return parts.join(' ');
}

vi.mock('../../server/db', () => {
  const db: any = {
    execute: vi.fn(async (q: any) => {
      const text = sqlTextOf(q);
      h.execCalls.push(text);
      const idx = h.execQueue.findIndex((e) => text.includes(e.match));
      if (idx === -1) return { rows: [] };
      const [entry] = h.execQueue.splice(idx, 1);
      return { rows: entry.rows };
    }),
  };
  return {
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open_7' })),
    getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7 })),
  };
});

vi.mock('../../server/webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (payload: any) => {
    h.events.push({ event: payload.event, merchantId: payload.merchantId, data: payload.data });
    return { dispatched: 1, failed: 0 };
  }),
}));

vi.mock('../../server/emailService', () => ({
  sendEmail: vi.fn(async () => true),
}));

vi.mock('../../server/rateLimit', () => ({
  expressRateLimit: vi.fn(() => (_r: any, _s: any, n: any) => n()),
  trpcApiRateLimit: vi.fn(() => (_r: any, _s: any, n: any) => n()),
  rateLimit: vi.fn(() => (_o: any, n: any) => n()),
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── subjects ─────────────────────────────────────────────────────────────────
import { expireStalePendingCharges } from './publicRest';
import { subscriptionExtrasRouter, signManageToken } from './subscriptionExtras';

beforeEach(() => {
  h.execQueue.length = 0;
  h.execCalls.length = 0;
  h.events.length = 0;
  process.env.SUBSCRIPTION_MANAGE_SECRET = 'test-manage-secret';
});

// ─── H14 pending-charge expiry sweeper ────────────────────────────────────────
describe('H14 expireStalePendingCharges (called by cronJobs)', () => {
  it("flips stale pending transactions to failed with gateway_response='expired'", async () => {
    h.execQueue.push({ match: 'UPDATE transactions', rows: [{ id: 'txn_1' }, { id: 'txn_2' }] });
    const res = await expireStalePendingCharges(45);
    expect(res.expired).toBe(2);
    const q = h.execCalls[0];
    expect(q).toContain("status = 'failed'");
    expect(q).toContain('expired');
    expect(q).toContain("status = 'pending'");
  });

  it('rejects a non-positive TTL', async () => {
    await expect(expireStalePendingCharges(0)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(expireStalePendingCharges(-5)).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

// ─── M20 single-use manage tokens ─────────────────────────────────────────────
describe('M20 verifyManageToken single-use', () => {
  const caller = () => subscriptionExtrasRouter.createCaller({} as any);

  function queueTokenLookups(_token: string, usedAt: Date | null) {
    h.execQueue.push({
      match: 'FROM subscription_manage_tokens',
      rows: [{
        id: 'smt_1', subscriptionId: 'sub_1', merchantId: 'merch_1',
        expiresAt: new Date(Date.now() + 3600_000), usedAt,
      }],
    });
  }

  it('first verify succeeds and stamps used_at; second use fails 410-style', async () => {
    const token = signManageToken('sub_1', Date.now() + 3600_000);
    // First use: not yet consumed → guarded claim succeeds → subscription returned.
    queueTokenLookups(token, null);
    h.execQueue.push(
      { match: 'UPDATE subscription_manage_tokens', rows: [{ id: 'smt_1' }] }, // single-use claim
      { match: 'FROM subscriptions', rows: [{ id: 'sub_1', merchantId: 'merch_1', customerEmail: 'a@b.c', customerName: 'A' }] },
    );
    const first = await caller().verifyManageToken({ token });
    expect(first.subscription.id).toBe('sub_1');
    expect(h.execCalls.some((c) => c.includes('UPDATE subscription_manage_tokens SET used_at'))).toBe(true);

    // Second use: used_at is set → 410-style PRECONDITION_FAILED, no data leak.
    queueTokenLookups(token, new Date());
    await expect(caller().verifyManageToken({ token }))
      .rejects.toMatchObject({ code: 'PRECONDITION_FAILED', message: expect.stringMatching(/already been used/i) });
  });

  it('a lost claim race is also rejected (0 rows from the guarded update)', async () => {
    const token = signManageToken('sub_1', Date.now() + 3600_000);
    queueTokenLookups(token, null);
    h.execQueue.push({ match: 'UPDATE subscription_manage_tokens', rows: [] }); // race lost
    await expect(caller().verifyManageToken({ token }))
      .rejects.toMatchObject({ code: 'PRECONDITION_FAILED' });
  });

  it('expired and unknown tokens are still rejected', async () => {
    const token = signManageToken('sub_1', Date.now() + 3600_000);
    h.execQueue.push({
      match: 'FROM subscription_manage_tokens',
      rows: [{ id: 'smt_1', subscriptionId: 'sub_1', merchantId: 'merch_1', expiresAt: new Date(Date.now() - 1000), usedAt: null }],
    });
    await expect(caller().verifyManageToken({ token })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    h.execQueue.push({ match: 'FROM subscription_manage_tokens', rows: [] });
    await expect(caller().verifyManageToken({ token })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});
