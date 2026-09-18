/**
 * taxCompliance.test.ts
 * Vitest unit tests for the P0-d Nigerian compliance pack router.
 * Mocking pattern: hostedCheckout.test.ts (vi.mock drizzle/schema + server/db
 * chainable mocks). withIdempotency is replaced with an in-memory claim map so
 * idempotent-replay behaviour is exercised at the router level.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Hoisted mock state ───────────────────────────────────────────────────────

const h = vi.hoisted(() => {
  const dbChain: any = {};
  const methodNames = [
    'select', 'from', 'where', 'orderBy', 'groupBy', 'innerJoin',
    'insert', 'update', 'delete', 'set', 'values', 'offset', 'onConflictDoNothing',
  ];
  const state = {
    dbChain,
    insertValuesCalls: [] as any[],
    updateSetCalls: [] as any[],
    idemStore: new Map<string, { hash: string; body: unknown }>(),
    executeCount: 0,
    getUserByOpenId: vi.fn(),
    getMerchantByOwnerId: vi.fn(),
    auditLog: vi.fn(),
    requirePermission: vi.fn(),
    reset() {
      state.insertValuesCalls = [];
      state.updateSetCalls = [];
      state.idemStore.clear();
      state.executeCount = 0;
      for (const name of methodNames) dbChain[name].mockClear();
      dbChain.limit.mockReset();
      dbChain.for.mockReset();
      dbChain.returning.mockReset();
      dbChain.transaction.mockClear();
    },
  };
  for (const name of methodNames) {
    dbChain[name] = vi.fn((arg: unknown) => {
      if (name === 'values') state.insertValuesCalls.push(arg);
      if (name === 'set') state.updateSetCalls.push(arg);
      return dbChain;
    });
  }
  dbChain.limit = vi.fn(() => Promise.resolve([]));
  dbChain.for = vi.fn(() => Promise.resolve([]));
  dbChain.returning = vi.fn(() => Promise.resolve([]));
  dbChain.transaction = vi.fn((cb: (tx: any) => unknown) => cb(dbChain));
  return state;
});

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  apBills: {},
  taxWithholdingRecords: {},
  tinValidations: {},
  vendors: {},
  whtRemittances: {},
  users: {},
}));

vi.mock('../db', () => ({
  db: h.dbChain,
  getUserByOpenId: h.getUserByOpenId,
  getMerchantByOwnerId: h.getMerchantByOwnerId,
}));

vi.mock('../idempotency', () => ({
  withIdempotency: async (opts: any) => {
    const storeKey = `${opts.merchantId}:${opts.key}`;
    const hash = JSON.stringify(opts.requestBody);
    const existing = h.idemStore.get(storeKey);
    if (existing) {
      if (existing.hash !== hash) {
        const err: any = new Error(`Idempotency key '${opts.key}' was already used with a different request body`);
        err.code = 'CONFLICT';
        throw err;
      }
      return existing.body; // replay: do NOT re-execute
    }
    h.executeCount++;
    const body = await opts.execute();
    h.idemStore.set(storeKey, { hash, body });
    return body;
  },
}));

vi.mock('../auditTrail', () => ({ auditLog: h.auditLog }));

vi.mock('../logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock('../pbac', () => ({ requirePermission: h.requirePermission }));

// ─── Fetch mock ───────────────────────────────────────────────────────────────

const mockFetch = vi.fn();
global.fetch = mockFetch as never;

function fetchOk(body: unknown) {
  return { ok: true, status: 200, json: () => Promise.resolve(body), text: () => Promise.resolve(JSON.stringify(body)) };
}

// ─── Suite ────────────────────────────────────────────────────────────────────

import { computeBillWhtForBill, taxComplianceRouter } from './taxCompliance';

const ctx = {
  user: { id: 7, openId: 'u-1', name: 'Test User', email: 't@example.ng', role: 'user' },
} as any;
const caller = taxComplianceRouter.createCaller(ctx);

beforeEach(() => {
  h.reset();
  mockFetch.mockReset();
  h.getUserByOpenId.mockResolvedValue({ id: 7, openId: 'u-1' });
  h.getMerchantByOwnerId.mockResolvedValue({ id: 'merch_1' });
  h.auditLog.mockResolvedValue(undefined);
  h.requirePermission.mockResolvedValue(undefined);
});

describe('computeBillWhtForBill', () => {
  it('applies the vendor rate with integer kobo math', async () => {
    h.dbChain.limit.mockResolvedValue([{ isWhtApplicable: true, whtRatePct: '10.00' }]);
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: 'vend_1', subtotalKobo: 1_000_000 });
    expect(r).toEqual({ whtKobo: 100_000, whtRatePct: 10, applied: true });
  });

  it('rounds to the nearest kobo for fractional results', async () => {
    h.dbChain.limit.mockResolvedValue([{ isWhtApplicable: true, whtRatePct: '5.00' }]);
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: 'vend_1', subtotalKobo: 999_999 });
    expect(r.whtKobo).toBe(50_000); // 999999 * 500bps / 10000 = 49999.95 → 50000
    expect(Number.isInteger(r.whtKobo)).toBe(true);
  });

  it('returns applied=false for an exempt vendor', async () => {
    h.dbChain.limit.mockResolvedValue([{ isWhtApplicable: false, whtRatePct: '10.00' }]);
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: 'vend_1', subtotalKobo: 1_000_000 });
    expect(r).toEqual({ whtKobo: 0, whtRatePct: null, applied: false });
  });

  it('returns applied=false when the vendor has no rate configured', async () => {
    h.dbChain.limit.mockResolvedValue([{ isWhtApplicable: true, whtRatePct: null }]);
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: 'vend_1', subtotalKobo: 1_000_000 });
    expect(r).toEqual({ whtKobo: 0, whtRatePct: null, applied: false });
  });

  it('returns applied=false for a null vendorId without touching the db', async () => {
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: null, subtotalKobo: 1_000_000 });
    expect(r).toEqual({ whtKobo: 0, whtRatePct: null, applied: false });
    expect(h.dbChain.select).not.toHaveBeenCalled();
  });

  it('returns applied=false when the vendor row is missing', async () => {
    h.dbChain.limit.mockResolvedValue([]);
    const r = await computeBillWhtForBill({ merchantId: 'merch_1', vendorId: 'vend_x', subtotalKobo: 1_000_000 });
    expect(r).toEqual({ whtKobo: 0, whtRatePct: null, applied: false });
  });
});

describe('generateWhtRemittance', () => {
  const records = [
    { id: 'rec1', taxAmountKobo: 100_000, status: 'pending', period: '2026-07' },
    { id: 'rec2', taxAmountKobo: 50_000, status: 'pending', period: '2026-07' },
  ];

  it('aggregates pending records and files with the tax-engine', async () => {
    h.dbChain.for.mockResolvedValue(records);
    h.dbChain.returning.mockResolvedValue([{ id: 9, totalWhtKobo: 150_000, recordCount: 2 }]);
    mockFetch.mockResolvedValue(fetchOk({ payment_reference: 'FIRS-merch_1-202607' }));

    const r = await caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0001' });
    expect(r).toMatchObject({
      remittanceId: 9,
      period: '2026-07',
      totalWhtKobo: 150_000,
      recordCount: 2,
      status: 'filed',
      reference: 'FIRS-merch_1-202607',
    });
    // locked records flipped out of 'pending'
    expect(h.updateSetCalls).toContainEqual({ status: 'filed' });
    // tax-engine called with the aggregated total
    const [, req] = mockFetch.mock.calls[0];
    expect(JSON.parse(req.body)).toMatchObject({ merchant_id: 'merch_1', month: '2026-07', wht_withheld_kobo: 150_000 });
  });

  it('replays the stored response for the same idempotency key without re-executing', async () => {
    h.dbChain.for.mockResolvedValue(records);
    h.dbChain.returning.mockResolvedValue([{ id: 9, totalWhtKobo: 150_000, recordCount: 2 }]);
    mockFetch.mockResolvedValue(fetchOk({ payment_reference: 'FIRS-merch_1-202607' }));

    const first = await caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0002' });
    const second = await caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0002' });
    expect(second).toBe(first); // cached response, no re-execution
    expect(h.executeCount).toBe(1);
    expect(h.dbChain.returning).toHaveBeenCalledTimes(1);
  });

  it('rejects a conflicting replay (same key, different body)', async () => {
    h.dbChain.for.mockResolvedValue(records);
    h.dbChain.returning.mockResolvedValue([{ id: 9, totalWhtKobo: 150_000, recordCount: 2 }]);
    mockFetch.mockResolvedValue(fetchOk({ payment_reference: 'FIRS-x' }));

    await caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0003' });
    await expect(
      caller.generateWhtRemittance({ period: '2026-08', idempotencyKey: 'remit-key-0003' }),
    ).rejects.toThrow(/different request body/);
    expect(h.executeCount).toBe(1);
  });

  it('keeps the remittance in draft when the tax-engine filing fails', async () => {
    h.dbChain.for.mockResolvedValue(records);
    h.dbChain.returning.mockResolvedValue([{ id: 10, totalWhtKobo: 150_000, recordCount: 2 }]);
    mockFetch.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const r = await caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0004' });
    expect(r.status).toBe('draft');
    expect(r.reference).toBeNull();
    expect(r.warning).toMatch(/tax-engine filing failed/);
  });

  it('throws when there are no unremitted records for the period', async () => {
    h.dbChain.for.mockResolvedValue([]);
    await expect(
      caller.generateWhtRemittance({ period: '2026-07', idempotencyKey: 'remit-key-0005' }),
    ).rejects.toThrow(/No unremitted WHT records/);
  });
});

describe('validateVendorTin', () => {
  const vendor = { id: 'vend_1', tin: '1234567890', isWhtApplicable: false, whtRatePct: null };

  it('records unverified when the external lookup is not configured (never fabricated valid)', async () => {
    h.dbChain.limit
      .mockResolvedValueOnce([vendor])   // vendor lookup
      .mockResolvedValueOnce([]);        // existing tin_validations row
    mockFetch.mockResolvedValue(fetchOk({ status: 'unverified', reason: 'external_lookup_not_configured' }));

    const r = await caller.validateVendorTin({ vendorId: 'vend_1' });
    expect(r.status).toBe('unverified');
    expect(r.reason).toBe('external_lookup_not_configured');
    expect(r.vendorUpdated).toBe(false);
    // tin_validations upsert recorded the unverified status
    expect(h.insertValuesCalls.some((v) => v.status === 'unverified' && v.tin === '1234567890')).toBe(true);
    // vendor WHT profile must NOT be modified on unverified
    expect(h.updateSetCalls.some((s) => 'isWhtApplicable' in s)).toBe(false);
  });

  it('degrades to unverified when the tax-engine is unreachable', async () => {
    h.dbChain.limit
      .mockResolvedValueOnce([vendor])
      .mockResolvedValueOnce([]);
    mockFetch.mockRejectedValue(new Error('fetch failed'));

    const r = await caller.validateVendorTin({ vendorId: 'vend_1' });
    expect(r.status).toBe('unverified');
    expect(r.reason).toBe('validation_service_unreachable');
    expect(r.vendorUpdated).toBe(false);
  });

  it('updates the vendor WHT profile only on a registry-confirmed valid', async () => {
    h.dbChain.limit
      .mockResolvedValueOnce([vendor])
      .mockResolvedValueOnce([{ id: 5 }]); // existing validation row → update path
    mockFetch.mockResolvedValue(fetchOk({
      status: 'valid',
      reason: 'registry_confirmed',
      entity_type: 'company',
      wht: { applicable: true, category: 'services', rate_pct: 10 },
    }));

    const r = await caller.validateVendorTin({ vendorId: 'vend_1' });
    expect(r.status).toBe('valid');
    expect(r.vendorUpdated).toBe(true);
    expect(h.updateSetCalls.some((s) => s.isWhtApplicable === true && s.whtRatePct === '10')).toBe(true);
    expect(h.auditLog).toHaveBeenCalled();
  });

  it('404s when the vendor has no TIN on record', async () => {
    h.dbChain.limit.mockResolvedValueOnce([{ ...vendor, tin: null }]);
    await expect(caller.validateVendorTin({ vendorId: 'vend_1' })).rejects.toThrow(/no TIN/);
  });

  it('404s when the vendor does not belong to the merchant', async () => {
    h.dbChain.limit.mockResolvedValueOnce([]);
    await expect(caller.validateVendorTin({ vendorId: 'vend_other' })).rejects.toThrow(/Vendor not found/);
  });
});

describe('recordWhtForBill', () => {
  it('inserts a pending WHT line with integer kobo amounts', async () => {
    h.dbChain.limit.mockResolvedValueOnce([{ id: 'bill_1', vendorId: 'vend_1' }]);
    h.dbChain.returning.mockResolvedValueOnce([{ id: 'wht_1', status: 'pending' }]);

    const r = await caller.recordWhtForBill({
      billId: 'bill_1',
      grossAmountKobo: 1_000_000,
      taxAmountKobo: 100_000,
      taxRatePct: '10.00',
      period: '2026-07',
    });
    expect(r).toMatchObject({ id: 'wht_1', status: 'pending' });
    const inserted = h.insertValuesCalls.find((v) => v.billId === 'bill_1');
    expect(inserted).toMatchObject({
      merchantId: 'merch_1',
      vendorId: 'vend_1',
      grossAmountKobo: 1_000_000,
      taxAmountKobo: 100_000,
      netAmountKobo: 900_000,
      period: '2026-07',
      status: 'pending',
    });
  });

  it('rejects when tax exceeds gross', async () => {
    h.dbChain.limit.mockResolvedValueOnce([{ id: 'bill_1', vendorId: 'vend_1' }]);
    await expect(
      caller.recordWhtForBill({ billId: 'bill_1', grossAmountKobo: 100, taxAmountKobo: 200 }),
    ).rejects.toThrow(/exceeds gross/);
  });
});
