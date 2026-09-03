/**
 * cardTokenization.test.ts — Vitest unit tests for the card authorization
 * tRPC router (list / fetch / deactivate / recordAuthorization) and the
 * exported recordAuthorizationFromCharge() integration hook.
 *
 * Follows the repo's in-memory fake-DB pattern (see directDebit.test.ts):
 * a chainable Proxy whose terminal await shifts queued result sets.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted fake DB ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = { results: [] as any[] };
  const calls = { insert: [] as any[], update: [] as any[] };

  function makeChain(kind: string): any {
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          const p = Promise.resolve().then(() => state.results.shift() ?? []);
          return (p as any)[prop].bind(p);
        }
        return (...args: any[]) => {
          if (kind === 'insert' && prop === 'values') calls.insert.push(args[0]);
          if (kind === 'update' && prop === 'set') calls.update.push(args[0]);
          return chain;
        };
      },
    });
    return chain;
  }

  const fakeDb: any = {
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  };
  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
}));

vi.mock('drizzle-orm/pg-core', () => {
  const col: any = new Proxy({}, { get: () => () => col });
  return {
    pgTable: vi.fn(() => ({})),
    text: vi.fn(() => col),
    boolean: vi.fn(() => col),
    timestamp: vi.fn(() => col),
    index: vi.fn(() => col),
  };
});

vi.mock('../../server/db', () => ({
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async (openId: string) =>
    openId === 'open-1' ? { id: 7, openId, name: 'Tester' } : null),
  getMerchantByOwnerId: vi.fn(async (ownerId: number) =>
    ownerId === 7 ? { id: 'merch_1', ownerId } : null),
}));

vi.mock('../../server/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import {
  cardTokenizationRouter,
  recordAuthorizationFromCharge,
  computeCardSignature,
  generateAuthorizationCode,
} from './cardTokenization';

const caller = cardTokenizationRouter.createCaller({
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user' },
} as any);

const anonCaller = cardTokenizationRouter.createCaller({ user: null } as any);

function authzRow(over: Record<string, unknown> = {}) {
  return {
    id: 'cauth_1',
    merchantId: 'merch_1',
    customerEmail: 'c@example.com',
    authorizationCode: 'AUTH_abc123',
    reusable: true,
    signature: 'sig_test',
    bin: '408408',
    last4: '4081',
    brand: 'visa',
    cardType: 'debit',
    bank: 'Test Bank',
    expMonth: '12',
    expYear: '2030',
    channel: 'card',
    active: true,
    createdAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  h.state.results.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
});

// ─── Signature / code helpers ────────────────────────────────────────────────
describe('card signature helpers', () => {
  it('produces a stable HMAC signature per PAN fingerprint', () => {
    const a = computeCardSignature('fp_123');
    const b = computeCardSignature('fp_123');
    expect(a).toBe(b);
    expect(a).toMatch(/^sig_[a-f0-9]{64}$/);
    expect(computeCardSignature('fp_other')).not.toBe(a);
  });

  it('generates Paystack-style authorization codes', () => {
    const code = generateAuthorizationCode();
    expect(code).toMatch(/^AUTH_[a-f0-9]{24}$/);
    expect(generateAuthorizationCode()).not.toBe(code);
  });
});

// ─── list / fetch / deactivate ───────────────────────────────────────────────
describe('cardTokenization.list', () => {
  it('returns the merchant’s authorizations', async () => {
    h.state.results.push([authzRow()]);
    const rows = await caller.list({ limit: 10, activeOnly: false });
    expect(rows).toHaveLength(1);
    expect(rows[0].authorizationCode).toBe('AUTH_abc123');
  });

  it('requires authentication', async () => {
    await expect(anonCaller.list({ limit: 10, activeOnly: false })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('cardTokenization.fetch', () => {
  it('fetches by authorization_code', async () => {
    h.state.results.push([authzRow()]);
    const row = await caller.fetch({ authorizationCode: 'AUTH_abc123' });
    expect(row.id).toBe('cauth_1');
  });

  it('throws NOT_FOUND for an unknown authorization', async () => {
    h.state.results.push([]);
    await expect(caller.fetch({ authorizationCode: 'AUTH_nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

describe('cardTokenization.deactivate', () => {
  it('deactivates an authorization (Paystack deactivate semantics)', async () => {
    h.state.results.push([{ id: 'cauth_1' }]);
    const res = await caller.deactivate({ authorizationCode: 'AUTH_abc123' });
    expect(res.success).toBe(true);
    expect(h.calls.update[0]).toMatchObject({ active: false, reusable: false });
  });

  it('throws NOT_FOUND when nothing was deactivated', async () => {
    h.state.results.push([]);
    await expect(caller.deactivate({ authorizationCode: 'AUTH_ghost' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── recordAuthorization / recordAuthorizationFromCharge ─────────────────────
describe('recordAuthorizationFromCharge', () => {
  it('reuses an existing authorization for the same card signature', async () => {
    const existing = authzRow();
    h.state.results.push([existing]); // signature lookup hit
    const saved = await recordAuthorizationFromCharge({
      merchantId: 'merch_1', customerEmail: 'c@example.com', panFingerprint: 'fp_x',
    });
    expect(saved.id).toBe('cauth_1');
    expect(h.calls.insert).toHaveLength(0);
  });

  it('inserts a new reusable authorization for a new card', async () => {
    h.state.results.push([]); // signature lookup miss
    const inserted = authzRow({ id: 'cauth_new' });
    h.state.results.push([inserted]); // insert().returning()
    const saved = await recordAuthorizationFromCharge({
      merchantId: 'merch_1', customerEmail: 'c@example.com',
      panFingerprint: 'fp_new', last4: '4081', brand: 'visa',
      expMonth: 12, expYear: 2030,
    });
    expect(saved.authorizationCode).toBe('AUTH_abc123');
    expect(h.calls.insert).toHaveLength(1);
    expect(h.calls.insert[0]).toMatchObject({
      merchantId: 'merch_1', customerEmail: 'c@example.com',
      reusable: true, active: true, expMonth: '12', expYear: '2030',
    });
  });
});

describe('cardTokenization.recordAuthorization', () => {
  it('scopes the insert to the caller’s merchant', async () => {
    h.state.results.push([]); // signature miss
    h.state.results.push([authzRow()]); // returning
    const res = await caller.recordAuthorization({
      customerEmail: 'c@example.com', panFingerprint: 'fp_y', last4: '9999',
    });
    expect(res.merchantId).toBe('merch_1');
    expect(h.calls.insert[0].merchantId).toBe('merch_1');
  });
});
