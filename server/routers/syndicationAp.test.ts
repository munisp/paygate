/**
 * syndicationAp.test.ts
 * Vitest unit tests for the AP syndication tRPC router (P2-b).
 *
 * Mocking pattern follows hostedCheckout.test.ts / accountingSync.test.ts:
 * vi.mock drizzle/schema + server/db chainable mocks. The fake db records
 * every insert / update so tests can assert "raw key is never persisted —
 * only the sha256 hash" and "getPartnerUsage aggregates by day".
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'node:crypto';

// ─── Hoisted holders (available inside vi.mock factories) ────────────────────
const h = vi.hoisted(() => {
  const state = {
    selects: [] as any[][],
    updateReturns: [] as any[][],
  };
  const calls = {
    insert: [] as { table: string; values: any }[],
    update: [] as { table: string; set: any }[],
  };

  function chain(db: any, op: string, table?: any): any {
    const c: any = {
      from: () => c,
      innerJoin: () => c,
      orderBy: () => c,
      where: () => c,
      limit: async () => state.selects.shift() ?? [],
      values: async (v: any) => {
        calls.insert.push({ table: table?.__t, values: v });
        return [{ id: 'new-id' }];
      },
      set: (v: any) => {
        calls.update.push({ table: table?.__t, set: v });
        return c;
      },
      returning: async () => state.updateReturns.shift() ?? [],
      // Terminal await (e.g. select().from().where() / update().set().where()).
      then: (resolve: any, reject: any) =>
        Promise.resolve(state.selects.shift() ?? []).then(resolve, reject),
    };
    return c;
  }

  const fakeDb: any = {
    select: () => chain(fakeDb, 'select'),
    insert: (t: any) => chain(fakeDb, 'insert', t),
    update: (t: any) => chain(fakeDb, 'update', t),
  };

  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../../drizzle/schema', () => ({
  featureFlags: { __t: 'feature_flags' },
  tenants: { __t: 'tenants' },
  tenantApiKeys: { __t: 'tenant_api_keys' },
  merchants: { __t: 'merchants' },
  users: { __t: 'users' },
  apBills: { __t: 'ap_bills' },
  apPayments: { __t: 'ap_payments' },
  accountingConnections: { __t: 'accounting_connections' },
  accountingSyncRuns: { __t: 'accounting_sync_runs' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  or: vi.fn((...args: any[]) => ({ op: 'or', args })),
  gte: vi.fn((c: any, v: any) => ({ op: 'gte', c, v })),
  lt: vi.fn((c: any, v: any) => ({ op: 'lt', c, v })),
  inArray: vi.fn((c: any, v: any) => ({ op: 'inArray', c, v })),
  isNull: vi.fn((c: any) => ({ op: 'isNull', c })),
}));

vi.mock('../../server/db', () => ({
  db: h.fakeDb,
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open-1', name: 'Tester' })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7, tenantId: 'ten_1' })),
}));

vi.mock('../auditTrail', () => ({
  auditLog: vi.fn(async () => {}),
  buildAuditEntry: vi.fn(
    (ctx: any, merchantId: string, action: string, resource: string, resourceId?: string, metadata?: any) => ({
      merchantId, action, resource, resourceId, metadata,
      actorId: ctx.user.openId, actorName: 'Tester',
    }),
  ),
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { syndicationApRouter, __syndicationApInternals } from './syndicationAp';

const tenantCtx = {
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user', tenantId: 'ten_1' },
} as any;

const caller = syndicationApRouter.createCaller(tenantCtx);

function sha256(s: string) {
  return createHash('sha256').update(s).digest('hex');
}

beforeEach(() => {
  h.state.selects.length = 0;
  h.state.updateReturns.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
});

// ─── getPartnerApConfig ───────────────────────────────────────────────────────
describe('syndicationAp.getPartnerApConfig', () => {
  it('evaluates AP flags for the tenant and returns branding', async () => {
    h.state.selects.push(
      // feature flag rows (global + tenant overrides for the 4 AP keys)
      [
        { key: 'ap_bill_pay_enabled', enabled: true, rolloutPercentage: 0, targetMerchantIds: 'ten_1,ten_2', tenantId: null },
        { key: 'ap_inbox_enabled', enabled: true, rolloutPercentage: 100, targetMerchantIds: null, tenantId: null },
        { key: 'ap_pay_over_time_enabled', enabled: false, rolloutPercentage: 100, targetMerchantIds: null, tenantId: null },
        { key: 'ap_accounting_sync_enabled', enabled: true, rolloutPercentage: 50, targetMerchantIds: null, tenantId: null },
      ],
      // tenants row for branding
      [{ id: 'ten_1', name: 'Acme Pay', logoUrl: 'https://logo', primaryColor: '#111111', accentColor: '#222222', secondaryColor: '#333333', fontFamily: 'Inter', faviconUrl: null, footerText: 'footer', supportEmail: 's@acme', customDomain: null }],
    );

    const res = await caller.getPartnerApConfig();

    expect(res.tenantId).toBe('ten_1');
    expect(res.apBillPayEnabled).toBe(true);        // targeted at ten_1
    expect(res.apInboxEnabled).toBe(true);          // global 100% rollout
    expect(res.payOverTimeEnabled).toBe(false);     // disabled row
    expect(res.accountingSyncEnabled).toBe(false);  // 50% rollout, untargeted → deterministic OFF
    expect(res.branding).toMatchObject({ name: 'Acme Pay', primaryColor: '#111111', supportEmail: 's@acme' });
  });

  it('prefers a per-tenant override row over the global row', async () => {
    h.state.selects.push(
      [
        { key: 'ap_bill_pay_enabled', enabled: true, rolloutPercentage: 100, targetMerchantIds: null, tenantId: null },
        { key: 'ap_bill_pay_enabled', enabled: false, rolloutPercentage: 100, targetMerchantIds: null, tenantId: 'ten_1' },
      ],
      [],
    );

    const res = await caller.getPartnerApConfig();
    expect(res.apBillPayEnabled).toBe(false);
  });
});

// ─── setPartnerApConfig ───────────────────────────────────────────────────────
describe('syndicationAp.setPartnerApConfig', () => {
  it('enables a flag by adding the tenant to the flag row target list (guarded update)', async () => {
    h.state.selects.push(
      [{ role: 'admin' }],  // platformAdminProcedure DB re-check
      [{ id: 'f1', key: 'ap_bill_pay_enabled', enabled: false, rolloutPercentage: 0, targetMerchantIds: null, tenantId: null }],
    );
    h.state.updateReturns.push([{ id: 'f1' }]);

    const res = await caller.setPartnerApConfig({ tenantId: 'ten_9', flags: { apBillPayEnabled: true } });

    expect(res.tenantId).toBe('ten_9');
    expect(res.applied).toEqual({ apBillPayEnabled: true });
    expect(h.calls.update).toHaveLength(1);
    expect(h.calls.update[0].table).toBe('feature_flags');
    expect(h.calls.update[0].set.enabled).toBe(true);
    expect(h.calls.update[0].set.targetMerchantIds).toBe('ten_9');
  });

  it('disables a flag by removing only that tenant from the target list', async () => {
    h.state.selects.push(
      [{ role: 'admin' }],
      [{ id: 'f1', key: 'ap_inbox_enabled', enabled: true, rolloutPercentage: 0, targetMerchantIds: 'ten_9,ten_1', tenantId: null }],
    );
    h.state.updateReturns.push([{ id: 'f1' }]);

    const res = await caller.setPartnerApConfig({ tenantId: 'ten_9', flags: { apInboxEnabled: false } });

    expect(res.applied).toEqual({ apInboxEnabled: false });
    expect(h.calls.update[0].set.targetMerchantIds).toBe('ten_1');
  });

  it('creates the flag row when enabling a flag that does not exist yet', async () => {
    h.state.selects.push(
      [{ role: 'admin' }],
      [], // no existing flag row
    );

    const res = await caller.setPartnerApConfig({ tenantId: 'ten_9', flags: { payOverTimeEnabled: true } });

    expect(res.applied).toEqual({ payOverTimeEnabled: true });
    const flagInserts = h.calls.insert.filter((c) => c.table === 'feature_flags');
    expect(flagInserts).toHaveLength(1);
    expect(flagInserts[0].values).toMatchObject({
      key: 'ap_pay_over_time_enabled', enabled: true, rolloutPercentage: 100, targetMerchantIds: 'ten_9',
    });
  });

  it('rejects non-admin callers (DB role re-check, same gate as featureFlagsRouter writes)', async () => {
    h.state.selects.push([{ role: 'user' }]);

    const err = await caller.setPartnerApConfig({ tenantId: 'ten_9', flags: { apBillPayEnabled: true } }).catch((e) => e);
    expect(err.code).toBe('FORBIDDEN');
    expect(h.calls.update).toHaveLength(0);
    expect(h.calls.insert).toHaveLength(0);
  });
});

// ─── rotatePartnerKey ─────────────────────────────────────────────────────────
describe('syndicationAp.rotatePartnerKey', () => {
  it('returns the raw key once and stores ONLY the sha256 hash (+ revokes previous keys)', async () => {
    h.state.selects.push(
      [{ role: 'admin' }],  // admin re-check
      [],                   // terminal await of the revoke UPDATE
    );

    const res = await caller.rotatePartnerKey({ tenantId: 'ten_1' });

    // Raw key format: pk_ap_ + 32 bytes hex (64 chars), returned in the response only.
    expect(res.raw).toMatch(/^pk_ap_[0-9a-f]{64}$/);
    expect(res.prefix).toBe(res.raw.slice(0, 16));

    // Previous active keys revoked.
    expect(h.calls.update).toHaveLength(1);
    expect(h.calls.update[0].table).toBe('tenant_api_keys');
    expect(h.calls.update[0].set.isActive).toBe(false);

    // Stored row: hash only, NEVER the raw key.
    const keyInserts = h.calls.insert.filter((c) => c.table === 'tenant_api_keys');
    expect(keyInserts).toHaveLength(1);
    const stored = keyInserts[0].values;
    expect(stored.keyHash).toBe(sha256(res.raw));
    expect(stored.keyHash).not.toBe(res.raw);
    expect(stored.keyPrefix).toBe(res.prefix);
    expect(stored.tenantId).toBe('ten_1');
    expect(stored.isActive).toBe(true);
    expect(stored.scopes).toEqual(['ap_bills.create', 'ap_bills.read']);
    for (const v of Object.values(stored)) {
      expect(v).not.toBe(res.raw);
    }
  });

  it('rejects non-admin callers', async () => {
    h.state.selects.push([{ role: 'merchant_admin' }]);
    const err = await caller.rotatePartnerKey({ tenantId: 'ten_1' }).catch((e) => e);
    expect(err.code).toBe('FORBIDDEN');
    expect(h.calls.insert).toHaveLength(0);
  });
});

// ─── getPartnerUsage ──────────────────────────────────────────────────────────
describe('syndicationAp.getPartnerUsage', () => {
  it('aggregates bills / completed payments / succeeded sync runs by day for the tenant', async () => {
    h.state.selects.push(
      [{ id: 'm1' }, { id: 'm2' }],  // merchants under ten_1
      [
        { totalKobo: 1_000_000, createdAt: new Date('2025-03-05T10:00:00Z') },
        { totalKobo: 2_000_000, createdAt: new Date('2025-03-05T15:00:00Z') },
        { totalKobo: 500_000, createdAt: new Date('2025-03-07T09:00:00Z') },
      ],
      [{ amountKobo: 1_500_000, createdAt: new Date('2025-03-05T16:00:00Z') }],
      [
        { startedAt: new Date('2025-03-07T01:00:00Z') },
        { startedAt: new Date('2025-03-07T02:00:00Z') },
      ],
    );

    const res = await caller.getPartnerUsage({ period: '2025-03' });

    expect(res.tenantId).toBe('ten_1');
    expect(res.period).toBe('2025-03');
    expect(res.days).toHaveLength(2);

    const d5 = res.days.find((d) => d.date === '2025-03-05')!;
    expect(d5).toMatchObject({
      billsCreated: 2, billVolumeKobo: 3_000_000,
      paymentsCompleted: 1, paymentVolumeKobo: 1_500_000,
      syncRunsSucceeded: 0,
    });

    const d7 = res.days.find((d) => d.date === '2025-03-07')!;
    expect(d7).toMatchObject({
      billsCreated: 1, billVolumeKobo: 500_000,
      paymentsCompleted: 0, syncRunsSucceeded: 2,
    });

    expect(res.totals).toEqual({
      billsCreated: 3, billVolumeKobo: 3_500_000,
      paymentsCompleted: 1, paymentVolumeKobo: 1_500_000,
      syncRunsSucceeded: 2,
    });

    // Read-only endpoint — no metering writes, no mutations at all.
    expect(h.calls.insert).toHaveLength(0);
    expect(h.calls.update).toHaveLength(0);
  });

  it('returns zeroed usage when the tenant has no merchants', async () => {
    h.state.selects.push([]); // no merchants

    const res = await caller.getPartnerUsage({ period: '2025-03' });
    expect(res.days).toEqual([]);
    expect(res.totals).toEqual({
      billsCreated: 0, billVolumeKobo: 0,
      paymentsCompleted: 0, paymentVolumeKobo: 0,
      syncRunsSucceeded: 0,
    });
  });
});

// ─── internals ────────────────────────────────────────────────────────────────
describe('syndicationAp internals', () => {
  it('generatePartnerKey produces a pk_ap_ key whose hash is sha256(raw)', () => {
    const { raw, prefix, hash } = __syndicationApInternals.generatePartnerKey();
    expect(raw).toMatch(/^pk_ap_[0-9a-f]{64}$/);
    expect(prefix).toBe(raw.slice(0, 16));
    expect(hash).toBe(sha256(raw));
  });

  it('periodBounds returns the UTC month window', () => {
    const { start, end } = __syndicationApInternals.periodBounds('2025-03');
    expect(start.toISOString()).toBe('2025-03-01T00:00:00.000Z');
    expect(end.toISOString()).toBe('2025-04-01T00:00:00.000Z');
  });

  it('evaluateFlagForTenant is deterministic for sub-100% untargeted rollouts', async () => {
    const { evaluateFlagForTenant } = __syndicationApInternals;
    expect(evaluateFlagForTenant(
      [{ enabled: true, rolloutPercentage: 99, targetMerchantIds: null, tenantId: null }], 'ten_1',
    )).toBe(false);
    expect(evaluateFlagForTenant(
      [{ enabled: true, rolloutPercentage: 10, targetMerchantIds: 'ten_1', tenantId: null }], 'ten_1',
    )).toBe(true);
    expect(evaluateFlagForTenant([], 'ten_1')).toBe(false);
  });
});
