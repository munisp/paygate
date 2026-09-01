/**
 * alertSubscriptions.test.ts
 * Vitest unit tests for the Novu alert-subscription router (OTEL spec §7).
 * Mocking pattern follows hostedCheckout.test.ts / apApprovals.test.ts
 * (vi.mock drizzle/schema + server/db chainable mocks, queued results).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  returningQueue: [] as any[][],
  insertedValues: [] as any[],
  deletedWheres: [] as any[],
  fetchCalls: [] as any[],
  fetchImpl: null as null | ((...a: any[]) => Promise<any>),
  merchant: { id: 'merch_1', ownerId: 99 } as any,
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  alertSubscriptions: {
    id: 'alertSubscriptions.id',
    merchantId: 'alertSubscriptions.merchantId',
    channel: 'alertSubscriptions.channel',
    target: 'alertSubscriptions.target',
    minSeverity: 'alertSubscriptions.minSeverity',
    createdAt: 'alertSubscriptions.createdAt',
  },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ op: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
}));

vi.mock('../../server/db', () => {
  function makeSelectQuery(): any {
    const q: any = {};
    q.from = vi.fn(() => q);
    q.where = vi.fn(() => q);
    q.orderBy = vi.fn(async () => (h.selectQueue.length ? h.selectQueue.shift()! : []));
    q.limit = vi.fn(async () => (h.selectQueue.length ? h.selectQueue.shift()! : []));
    q.then = (resolve: any, reject: any) => {
      const v = h.selectQueue.length ? h.selectQueue.shift()! : [];
      return Promise.resolve(v).then(resolve, reject);
    };
    return q;
  }
  const db: any = {};
  db.select = vi.fn(() => makeSelectQuery());
  db.insert = vi.fn(() => {
    const c: any = {};
    c.values = vi.fn((v: any) => { h.insertedValues.push(v); return c; });
    c.onConflictDoUpdate = vi.fn(() => c);
    c.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return c;
  });
  db.delete = vi.fn(() => {
    const d: any = {};
    d.where = vi.fn((w: any) => { h.deletedWheres.push(w); return d; });
    d.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return d;
  });
  return {
    db,
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === 'open_7' ? { id: 7, openId, name: 'Merchant Owner', email: 'm@example.com' } : null),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
  };
});

vi.mock('../../server/_core/env', () => ({
  ENV: {
    novuApiUrl: 'http://novu-api:3000',
    novuApiKey: 'test-novu-key',
    internalApiKey: 'internal-key',
  },
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { alertSubscriptionsRouter } from './alertSubscriptions';

const ctx: any = {
  user: { id: 7, openId: 'open_7', name: 'Merchant Owner', email: 'm@example.com', role: 'user' },
  req: { headers: {} },
  res: {},
};

function makeCaller(c: any = ctx) {
  return alertSubscriptionsRouter.createCaller(c);
}

beforeEach(() => {
  h.selectQueue.length = 0;
  h.returningQueue.length = 0;
  h.insertedValues.length = 0;
  h.deletedWheres.length = 0;
  h.fetchCalls.length = 0;
  h.merchant = { id: 'merch_1', ownerId: 99 };
  h.fetchImpl = async () => ({ ok: true, status: 201, text: async () => '' });
  vi.stubGlobal('fetch', (...a: any[]) => {
    h.fetchCalls.push(a);
    return h.fetchImpl!(...a);
  });
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('alertSubscriptions.list', () => {
  it('returns subscriptions scoped to the resolved merchant', async () => {
    const rows = [{ id: 'sub_1', merchantId: 'merch_1', channel: 'email', target: 'a@b.co' }];
    h.selectQueue.push(rows);
    const caller = makeCaller();
    const result = await caller.list();
    expect(result).toEqual(rows);
  });

  it('rejects unauthenticated users (no merchant)', async () => {
    h.merchant = null;
    const caller = makeCaller();
    await expect(caller.list()).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('rejects unknown user', async () => {
    const caller = makeCaller({ ...ctx, user: { ...ctx.user, openId: 'nobody' } });
    await expect(caller.list()).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('alertSubscriptions.subscribe', () => {
  it('upserts a Novu subscriber then persists the subscription', async () => {
    const row = { id: 'sub_1', merchantId: 'merch_1', channel: 'email', target: 'ops@acme.com', minSeverity: 'critical' };
    h.returningQueue.push([row]);
    const caller = makeCaller();
    const result = await caller.subscribe({ channel: 'email', target: 'ops@acme.com', minSeverity: 'critical' });
    expect(result).toEqual(row);
    // Novu subscriber upsert called with merchantId as subscriberId (idempotent)
    expect(h.fetchCalls).toHaveLength(1);
    const [url, init] = h.fetchCalls[0];
    expect(url).toBe('http://novu-api:3000/v1/subscribers');
    expect(init.method).toBe('POST');
    expect(init.headers.Authorization).toBe('ApiKey test-novu-key');
    const body = JSON.parse(init.body);
    expect(body.subscriberId).toBe('merch_1');
    expect(body.email).toBe('ops@acme.com');
    // Subscription persisted merchant-scoped
    expect(h.insertedValues[0].merchantId).toBe('merch_1');
    expect(h.insertedValues[0].novuSubscriberId).toBe('merch_1');
  });

  it('applies default minSeverity=warning', async () => {
    h.returningQueue.push([{ id: 'sub_2' }]);
    const caller = makeCaller();
    await caller.subscribe({ channel: 'in_app', target: 'merch_1' });
    expect(h.insertedValues[0].minSeverity).toBe('warning');
  });

  it('rejects invalid email target for email channel', async () => {
    const caller = makeCaller();
    await expect(caller.subscribe({ channel: 'email', target: 'not-an-email' })).rejects.toThrow();
    expect(h.insertedValues).toHaveLength(0);
  });

  it('rejects invalid phone target for sms channel', async () => {
    const caller = makeCaller();
    await expect(caller.subscribe({ channel: 'sms', target: 'abc' })).rejects.toThrow();
    expect(h.insertedValues).toHaveLength(0);
  });

  it('rejects invalid channel', async () => {
    const caller = makeCaller();
    await expect(caller.subscribe({ channel: 'pigeon' as any, target: 'x' })).rejects.toThrow();
  });

  it('THROWS when Novu subscriber creation fails (no silent divergence)', async () => {
    h.fetchImpl = async () => ({ ok: false, status: 500, text: async () => 'boom' });
    const caller = makeCaller();
    await expect(
      caller.subscribe({ channel: 'email', target: 'ops@acme.com' }),
    ).rejects.toMatchObject({ code: 'BAD_GATEWAY' });
    // Subscription must NOT be persisted after Novu failure
    expect(h.insertedValues).toHaveLength(0);
  });

  it('THROWS when Novu is unreachable (network error)', async () => {
    h.fetchImpl = async () => { throw new Error('ECONNREFUSED'); };
    const caller = makeCaller();
    await expect(
      caller.subscribe({ channel: 'sms', target: '+2348012345678' }),
    ).rejects.toMatchObject({ code: 'BAD_GATEWAY' });
    expect(h.insertedValues).toHaveLength(0);
  });
});

describe('alertSubscriptions.unsubscribe', () => {
  it('deletes merchant-scoped subscription', async () => {
    h.returningQueue.push([{ id: 'sub_1' }]);
    const caller = makeCaller();
    const result = await caller.unsubscribe({ id: 'sub_1' });
    expect(result).toEqual({ deleted: true, id: 'sub_1' });
    // scoping: where clause must include merchant id condition
    const whereJson = JSON.stringify(h.deletedWheres[0]);
    expect(whereJson).toContain('alertSubscriptions.merchantId');
  });

  it('throws NOT_FOUND when nothing deleted (wrong merchant or id)', async () => {
    h.returningQueue.push([]);
    const caller = makeCaller();
    await expect(caller.unsubscribe({ id: 'sub_x' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
