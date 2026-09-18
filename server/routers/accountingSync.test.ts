/**
 * accountingSync.test.ts
 * Vitest unit tests for the accounting sync tRPC router (P0-e).
 *
 * Mocking pattern follows hostedCheckout.test.ts (vi.mock drizzle/schema +
 * server/db chainable mocks) plus vi.stubGlobal('fetch') for the
 * accounting-sync service boundary. The fake db implements the exact drizzle
 * chains the router uses and records every mutation so tests can assert
 * "bill created exactly once" / "locked token refresh" semantics.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted holders (available inside vi.mock factories) ────────────────────
const h = vi.hoisted(() => {
  const state = {
    selects: [] as any[][],
    insertReturns: {} as Record<string, any[][]>,
    updateReturns: [] as any[][],
  };
  const calls = {
    insert: [] as { table: string; values: any }[],
    update: [] as { table: string; set: any }[],
    delete: [] as string[],
  };

  function chain(db: any, op: string, table?: any): any {
    const c: any = {
      from: () => c,
      orderBy: () => c,
      limit: async () => state.selects.shift() ?? [],
      values: (v: any) => {
        calls.insert.push({ table: table.__t, values: v });
        return c;
      },
      onConflictDoUpdate: () => c,
      onConflictDoNothing: () => c,
      set: (v: any) => {
        calls.update.push({ table: table.__t, set: v });
        return c;
      },
      where: () => (op === 'delete' ? Promise.resolve([]) : c),
      returning: async () => {
        if (op === 'insert') {
          const q = state.insertReturns[table.__t];
          return q && q.length ? q.shift()! : [{ id: 'new-id' }];
        }
        return state.updateReturns.shift() ?? [];
      },
    };
    return c;
  }

  const fakeDb: any = {
    select: () => chain(fakeDb, 'select'),
    insert: (t: any) => chain(fakeDb, 'insert', t),
    update: (t: any) => chain(fakeDb, 'update', t),
    delete: (t: any) => {
      calls.delete.push(t.__t);
      return chain(fakeDb, 'delete', t);
    },
  };

  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../../drizzle/schema', () => ({
  accountingConnections: { __t: 'accounting_connections' },
  accountingSyncRuns: { __t: 'accounting_sync_runs' },
  accountingEntityMap: { __t: 'accounting_entity_map' },
  apBills: { __t: 'ap_bills' },
  apPayments: { __t: 'ap_payments' },
  invoices: { __t: 'invoices' },
  vendors: { __t: 'vendors' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
  lt: vi.fn((c: any, v: any) => ({ op: 'lt', c, v })),
  inArray: vi.fn((c: any, v: any) => ({ op: 'inArray', c, v })),
}));

vi.mock('../../server/db', () => ({
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open-1', name: 'Tester' })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7 })),
}));

vi.mock('../idempotency', () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock('../kafkaClient', () => ({
  publishEvent: vi.fn(async () => true),
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
import { accountingSyncRouter } from './accountingSync';

const ctx = {
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user' },
} as any;

const caller = accountingSyncRouter.createCaller(ctx);

const ACTIVE_CONN = {
  id: 'conn-1',
  merchantId: 'merch_1',
  provider: 'quickbooks',
  status: 'active',
  realmId: 'realm-42',
  accessTokenEnc: 'enc_a',
  refreshTokenEnc: 'enc_r',
  tokenExpiresAt: new Date(Date.now() + 3600e3),
  scopes: 'com.intuit.quickbooks.accounting',
  syncCursor: null,
};

const PULLED_BILL = {
  remote_id: 'R1',
  vendor_name: 'Acme Supplies',
  bill_number: 'B-100',
  total_kobo: 125000,
  due_date: '2026-01-15',
  currency: 'NGN',
  updated_at: '2025-12-01T00:00:00Z',
  raw: { Id: 'R1', DocNumber: 'B-100' },
};

function okJson(body: any) {
  return { ok: true, status: 200, json: async () => body, text: async () => JSON.stringify(body) };
}

function fetchMock() {
  return (globalThis as any).fetch as ReturnType<typeof vi.fn>;
}

beforeEach(() => {
  h.state.selects = [];
  h.state.insertReturns = {};
  h.state.updateReturns = [];
  h.calls.insert = [];
  h.calls.update = [];
  h.calls.delete = [];
  vi.stubGlobal('fetch', vi.fn());
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Tests ────────────────────────────────────────────────────────────────────
describe('accountingSync.connect', () => {
  it('propagates 503 provider_not_configured from the sync service', async () => {
    fetchMock().mockResolvedValueOnce({
      ok: false,
      status: 503,
      text: async () => '{"detail":"provider_not_configured","provider":"quickbooks"}',
    });
    await expect(caller.connect({ provider: 'quickbooks' }))
      .rejects.toThrow(/503[\s\S]*provider_not_configured/);
    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toContain('/quickbooks/oauth/url');
    expect(init.method).toBe('POST');
  });

  it('returns the consent URL on success', async () => {
    fetchMock().mockResolvedValueOnce(okJson({ url: 'https://appcenter.intuit.com/connect/oauth2?x=1' }));
    const result = await caller.connect({ provider: 'quickbooks' });
    expect(result.url).toContain('https://appcenter.intuit.com/');
  });
});

describe('accountingSync.handleCallback', () => {
  it('exchanges the code and upserts a merchant-scoped connection', async () => {
    fetchMock().mockResolvedValueOnce(okJson({
      access_token_enc: 'enc_a',
      refresh_token_enc: 'enc_r',
      expires_in: 3600,
      realm_id: 'realm-42',
      scopes: 'com.intuit.quickbooks.accounting',
    }));
    h.state.insertReturns = { accounting_connections: [[{ id: 'conn-1' }]] };

    const result = await caller.handleCallback({
      provider: 'quickbooks', code: 'auth-code-123', realmId: 'realm-42',
    });

    expect(result).toMatchObject({
      connectionId: 'conn-1', provider: 'quickbooks', status: 'active', realmId: 'realm-42',
    });
    const [url, init] = fetchMock().mock.calls[0];
    expect(String(url)).toContain('/quickbooks/oauth/exchange');
    expect(JSON.parse(init.body)).toMatchObject({ code: 'auth-code-123', realm_id: 'realm-42' });

    const upsert = h.calls.insert.find((c) => c.table === 'accounting_connections');
    expect(upsert).toBeDefined();
    expect(upsert!.values).toMatchObject({
      merchantId: 'merch_1',
      provider: 'quickbooks',
      status: 'active',
      realmId: 'realm-42',
      accessTokenEnc: 'enc_a',
      refreshTokenEnc: 'enc_r',
    });
    expect(upsert!.values.tokenExpiresAt).toBeInstanceOf(Date);
  });

  it('requires a code or odoo credentials', async () => {
    await expect(caller.handleCallback({ provider: 'quickbooks' }))
      .rejects.toThrow(/code or odoo credentials/);
  });
});

describe('accountingSync.syncNow pull', () => {
  function stubPull(records: any[]) {
    fetchMock().mockImplementation(async (url: any) => {
      if (String(url).includes('/pull')) {
        return okJson({ records, records_in: records.length, next_cursor: '101' });
      }
      throw new Error(`unexpected fetch ${url}`);
    });
  }

  it('creates an ap_bills row only once for the same remote_id (entity_map hit)', async () => {
    const existingMap = {
      id: 9, connectionId: 'conn-1', entity: 'bill', localId: 'bill-1', remoteId: 'R1',
    };
    h.state.selects = [
      [ACTIVE_CONN],   // sync 1: connection ownership lookup
      [],              // sync 1: entity_map lookup for R1 → miss
      [ACTIVE_CONN],   // sync 2: connection ownership lookup
      [existingMap],   // sync 2: entity_map lookup for R1 → hit
    ];
    h.state.insertReturns = {
      accounting_sync_runs: [[{ id: 1 }], [{ id: 2 }]],
      ap_bills: [[{ id: 'bill-1' }]],
    };
    stubPull([PULLED_BILL]);

    const input = {
      connectionId: 'conn-1', direction: 'pull' as const, entity: 'bill' as const,
    };
    const r1 = await caller.syncNow({ ...input, idempotencyKey: 'sync-key-0001' });
    const r2 = await caller.syncNow({ ...input, idempotencyKey: 'sync-key-0002' });

    expect(r1).toMatchObject({ runId: 1, status: 'succeeded', recordsIn: 1 });
    expect(r2).toMatchObject({ runId: 2, status: 'succeeded', recordsIn: 1 });

    const billInserts = h.calls.insert.filter((c) => c.table === 'ap_bills');
    expect(billInserts).toHaveLength(1);
    expect(billInserts[0].values).toMatchObject({
      merchantId: 'merch_1',
      billNumber: 'B-100',
      status: 'draft',
      source: 'accounting_sync',
      totalKobo: 125000,
      idempotencyKey: 'acct:conn-1:R1',
    });

    const mapInserts = h.calls.insert.filter((c) => c.table === 'accounting_entity_map');
    expect(mapInserts).toHaveLength(1);
    expect(mapInserts[0].values).toMatchObject({
      connectionId: 'conn-1', entity: 'bill', localId: 'bill-1', remoteId: 'R1',
    });

    // Second run hit the map → only a remoteUpdatedAt touch, no new local row.
    const mapUpdates = h.calls.update.filter((c) => c.table === 'accounting_entity_map');
    expect(mapUpdates).toHaveLength(1);
    expect(fetchMock()).toHaveBeenCalledTimes(2);
  });

  it('triggers a single-writer locked refresh when the token is expired', async () => {
    const expiredConn = { ...ACTIVE_CONN, tokenExpiresAt: new Date(Date.now() - 3600e3) };
    const lease = new Date(Date.now() + 10 * 60e3);
    const refreshed = { ...ACTIVE_CONN, accessTokenEnc: 'enc_new' };
    h.state.selects = [[expiredConn]];
    h.state.insertReturns = { accounting_sync_runs: [[{ id: 3 }]] };
    h.state.updateReturns = [
      [{ ...expiredConn, tokenExpiresAt: lease }],  // claim (single writer won)
      [refreshed],                                   // apply refreshed tokens
      [],                                            // syncCursor/lastSyncAt update
      [],                                            // finishRun
    ];
    fetchMock().mockImplementation(async (url: any, init: any) => {
      const u = String(url);
      if (u.includes('/quickbooks/refresh')) {
        expect(JSON.parse(init.body)).toEqual({ refresh_token_enc: 'enc_r' });
        return okJson({ access_token_enc: 'enc_new', refresh_token_enc: 'enc_r2', expires_in: 3600 });
      }
      if (u.includes('/quickbooks/pull')) {
        expect(JSON.parse(init.body).access_token_enc).toBe('enc_new');
        return okJson({ records: [], records_in: 0, next_cursor: null });
      }
      throw new Error(`unexpected fetch ${u}`);
    });

    const result = await caller.syncNow({
      connectionId: 'conn-1', direction: 'pull', entity: 'bill',
      idempotencyKey: 'sync-key-refresh',
    });

    expect(result.status).toBe('succeeded');
    // Refresh happened BEFORE the pull.
    expect(String(fetchMock().mock.calls[0][0])).toContain('/quickbooks/refresh');
    expect(String(fetchMock().mock.calls[1][0])).toContain('/quickbooks/pull');

    const connUpdates = h.calls.update.filter((c) => c.table === 'accounting_connections');
    // Update 1 = claim lease; update 2 = refreshed tokens persisted.
    expect(connUpdates.length).toBeGreaterThanOrEqual(2);
    expect(connUpdates[0].set.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(connUpdates[1].set).toMatchObject({
      accessTokenEnc: 'enc_new',
      refreshTokenEnc: 'enc_r2',
      status: 'active',
    });
    expect(connUpdates[1].set.tokenExpiresAt.getTime()).toBeGreaterThan(Date.now());
  });
});

describe('accountingSync guards', () => {
  it('listConnections never selects token columns', async () => {
    h.state.selects = [[{
      id: 'conn-1', merchantId: 'merch_1', provider: 'xero', status: 'active',
      realmId: 'tenant-1', scopes: null, tokenExpiresAt: null, lastSyncAt: null,
      syncCursor: null, createdAt: new Date(), updatedAt: new Date(),
    }]];
    const rows = await caller.listConnections();
    expect(rows).toHaveLength(1);
    const serialized = JSON.stringify(rows);
    expect(serialized).not.toContain('accessTokenEnc');
    expect(serialized).not.toContain('refreshTokenEnc');
    expect(serialized).not.toContain('enc_a');
  });

  it('disconnect deletes only a merchant-owned connection', async () => {
    h.state.selects = [[ACTIVE_CONN]];
    const result = await caller.disconnect({ connectionId: 'conn-1' });
    expect(result).toEqual({ deleted: true, connectionId: 'conn-1' });
    expect(h.calls.delete).toEqual(['accounting_connections']);
  });

  it('syncNow rejects connections owned by another merchant', async () => {
    h.state.selects = [[]]; // ownership lookup misses
    await expect(caller.syncNow({
      connectionId: 'conn-x', direction: 'pull', entity: 'bill',
      idempotencyKey: 'sync-key-other',
    })).rejects.toThrow(/Connection not found/);
    expect(fetchMock()).not.toHaveBeenCalled();
  });

  it('syncNow requires an idempotency key of at least 8 chars', async () => {
    await expect(caller.syncNow({
      connectionId: 'conn-1', direction: 'pull', entity: 'bill',
      idempotencyKey: 'short',
    })).rejects.toThrow();
  });
});
