/**
 * directDebit.test.ts
 * Vitest unit tests for the direct-debit mandate tRPC router.
 *
 * Covers: state machine (pending→approved→active→paused→active→cancelled +
 * illegal transitions), activation-charge fail-loud when the rail is
 * unconfigured, debit idempotency replay, and account-number masking helpers.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// ─── Hoisted holders ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = {
    selects: [] as any[][],
  };
  const calls = {
    insert: [] as { table: string; values: any }[],
    update: [] as { table: string; set: any }[],
    events: [] as { event: string; data: any }[],
  };

  function chain(db: any, op: string, table?: any): any {
    const c: any = {
      from: () => c,
      orderBy: () => c,
      limit: async () => state.selects.shift() ?? [],
      values: (v: any) => {
        calls.insert.push({ table: table?.__t ?? 'local', values: v });
        return c;
      },
      set: (v: any) => {
        calls.update.push({ table: table?.__t ?? 'local', set: v });
        return c;
      },
      where: () => c,
      returning: async () => [{ id: 'new-id' }],
    };
    return c;
  }

  const fakeDb: any = {
    select: () => chain(fakeDb, 'select'),
    insert: (t: any) => chain(fakeDb, 'insert', t),
    update: (t: any) => chain(fakeDb, 'update', t),
    delete: (t: any) => chain(fakeDb, 'delete', t),
  };

  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../../drizzle/schema', () => ({
  transactions: { __t: 'transactions' },
  customers: { __t: 'customers' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
  isNotNull: vi.fn((c: any) => ({ op: 'isNotNull', c })),
  gte: vi.fn((c: any, v: any) => ({ op: 'gte', c, v })),
  lte: vi.fn((c: any, v: any) => ({ op: 'lte', c, v })),
}));

vi.mock('../../server/db', () => ({
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open-1', name: 'Tester' })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7 })),
}));

vi.mock('../idempotency', () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock('../webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (payload: any) => {
    h.calls.events.push({ event: payload.event, data: payload.data });
    return { dispatched: 0, failed: 0 };
  }),
}));

vi.mock('../pbac', () => ({
  requirePermission: vi.fn(async () => {}),
}));

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { directDebitRouter, maskAccountNumber, hashAccountNumber, buildHostedConsentUrl, ACTIVATION_CHARGE_KOBO } from './directDebit';

const ctx = {
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user' },
} as any;
const caller = directDebitRouter.createCaller(ctx);

function mandate(over: Partial<any> = {}) {
  return {
    id: 'ddm_1',
    merchantId: 'merch_1',
    customerId: 'cust_1',
    customerEmail: 'c@example.com',
    mandateReference: 'DD_1_ABC',
    authorizationCode: 'AUTH_DD_XYZ',
    bankCode: '058',
    accountNumberMasked: '******9012',
    accountNumberHash: 'hash',
    accountName: null,
    address: null,
    status: 'pending',
    activationChargeKobo: 5000,
    reusable: true,
    expiresAt: null,
    approvedAt: null,
    activatedAt: null,
    cancelledAt: null,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

beforeEach(() => {
  h.state.selects.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
  h.calls.events.length = 0;
  delete process.env.DIRECT_DEBIT_RAIL_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.DIRECT_DEBIT_RAIL_URL;
});

// ─── Helpers ──────────────────────────────────────────────────────────────────
describe('masking / hashing helpers', () => {
  it('masks account number to last 4 digits only', () => {
    expect(maskAccountNumber('0123456789')).toBe('******6789');
    expect(maskAccountNumber('0123456789')).not.toContain('1234');
  });
  it('rejects too-short account numbers', () => {
    expect(() => maskAccountNumber('12')).toThrow();
  });
  it('hashes deterministically and never equals the PAN', () => {
    const a = hashAccountNumber('0123456789');
    expect(a).toBe(hashAccountNumber('0123456789'));
    expect(a).toMatch(/^[0-9a-f]{64}$/);
    expect(a).not.toContain('0123456789');
  });
  it('builds a hosted-consent URL with optional callback', () => {
    const url = buildHostedConsentUrl('ACC123', 'https://shop.example/cb');
    expect(url).toContain('/direct-debit/consent/ACC123');
    expect(url).toContain('callback_url=');
  });
});

// ─── Initiate / verify ────────────────────────────────────────────────────────
describe('initiateAuthorization', () => {
  it('creates a pending mandate and returns redirect_url/access_code/reference', async () => {
    h.state.selects.push([]); // customer lookup: no existing customer
    const res = await caller.initiateAuthorization({
      email: 'c@example.com',
      channel: 'direct_debit',
      callback_url: 'https://shop.example/cb',
      account: { number: '0123456789', bank_code: '058' },
      address: { street: '1 A St', city: 'Lagos', state: 'LA' },
    });
    expect(res.reference).toMatch(/^DD_/);
    expect(res.access_code).toBeTruthy();
    expect(res.redirect_url).toContain('/direct-debit/consent/');
    const insert = h.calls.insert.find((i) => i.values.status === 'pending');
    expect(insert).toBeTruthy();
    expect(insert!.values.accountNumberMasked).toBe('******6789');
    expect(insert!.values.accountNumberHash).toMatch(/^[0-9a-f]{64}$/);
    expect(JSON.stringify(insert!.values)).not.toContain('0123456789');
    expect(insert!.values.activationChargeKobo).toBe(ACTIVATION_CHARGE_KOBO);
    expect(h.calls.events.some((e) => e.event === 'direct_debit.authorization.created')).toBe(true);
  });

  it('rejects account without address (all-or-none prefill)', async () => {
    await expect(caller.initiateAuthorization({
      email: 'c@example.com',
      channel: 'direct_debit',
      account: { number: '0123456789', bank_code: '058' },
    } as any)).rejects.toThrow();
  });
});

describe('verifyAuthorization', () => {
  it('returns status + authorization_code', async () => {
    h.state.selects.push([mandate({ status: 'active' })]);
    const res = await caller.verifyAuthorization({ reference: 'DD_1_ABC' });
    expect(res.status).toBe('active');
    expect(res.authorization_code).toBe('AUTH_DD_XYZ');
  });
  it('404s on unknown reference', async () => {
    h.state.selects.push([]);
    await expect(caller.verifyAuthorization({ reference: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── State machine ────────────────────────────────────────────────────────────
describe('mandate state machine', () => {
  it('walks pending → approved → active → paused → active → cancelled', async () => {
    h.state.selects.push([mandate({ status: 'pending' })]);
    const approved = await caller.markApproved({ authorization_code: 'AUTH_DD_XYZ' });
    expect(approved.status).toBe('approved');

    h.state.selects.push([mandate({ status: 'approved' })]);
    const active = await caller.markActive({ authorization_code: 'AUTH_DD_XYZ' });
    expect(active.status).toBe('active');
    expect(h.calls.events.some((e) => e.event === 'direct_debit.authorization.active')).toBe(true);

    h.state.selects.push([mandate({ status: 'active' })]);
    const paused = await caller.pause({ authorization_code: 'AUTH_DD_XYZ' });
    expect(paused.status).toBe('paused');
    expect(h.calls.events.some((e) => e.event === 'direct_debit.mandate.paused')).toBe(true);

    h.state.selects.push([mandate({ status: 'paused' })]);
    const resumed = await caller.resume({ authorization_code: 'AUTH_DD_XYZ' });
    expect(resumed.status).toBe('active');
    expect(h.calls.events.some((e) => e.event === 'direct_debit.mandate.resumed')).toBe(true);

    h.state.selects.push([mandate({ status: 'active' })]);
    const cancelled = await caller.deactivate({ authorization_code: 'AUTH_DD_XYZ' });
    expect(cancelled.status).toBe('cancelled');
    expect(h.calls.events.some((e) => e.event === 'direct_debit.authorization.deactivated')).toBe(true);
  });

  it('rejects illegal transitions', async () => {
    // pending → active (skipping approved)
    h.state.selects.push([mandate({ status: 'pending' })]);
    await expect(caller.markActive({ authorization_code: 'AUTH_DD_XYZ' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // paused → approved
    h.state.selects.push([mandate({ status: 'paused' })]);
    await expect(caller.markApproved({ authorization_code: 'AUTH_DD_XYZ' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // cancelled (terminal) → active
    h.state.selects.push([mandate({ status: 'cancelled' })]);
    await expect(caller.resume({ authorization_code: 'AUTH_DD_XYZ' })).rejects.toMatchObject({ code: 'CONFLICT' });
    // approved → paused (must activate first)
    h.state.selects.push([mandate({ status: 'approved' })]);
    await expect(caller.pause({ authorization_code: 'AUTH_DD_XYZ' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ─── Activation charge fail-loud ──────────────────────────────────────────────
describe('activationCharge', () => {
  it('fails loud 503 when the debit rail is unconfigured, keeps status approved', async () => {
    delete process.env.DIRECT_DEBIT_RAIL_URL;
    h.state.selects.push([mandate({ status: 'approved' })]);
    await expect(caller.activationCharge({ authorization_id: 'ddm_1' }))
      .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    // no status flip, no success event
    expect(h.calls.update.filter((u) => u.set.status && u.set.status !== 'approved')).toHaveLength(0);
    expect(h.calls.events.some((e) => e.event === 'direct_debit.authorization.active')).toBe(false);
  });

  it('queues the refundable ₦50 debit when the rail responds OK', async () => {
    process.env.DIRECT_DEBIT_RAIL_URL = 'http://rail.local';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    h.state.selects.push([mandate({ status: 'approved' })]);
    const res = await caller.activationCharge({ authorization_id: 'ddm_1' });
    expect(res.status).toBe('queued');
    expect(res.amountKobo).toBe(5000);
    expect(res.refundable).toBe(true);
  });

  it('rejects activation charge on a non-approved mandate', async () => {
    h.state.selects.push([mandate({ status: 'pending' })]);
    await expect(caller.activationCharge({ authorization_id: 'ddm_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ─── Debit ────────────────────────────────────────────────────────────────────
describe('debit', () => {
  const debitInput = {
    authorization_code: 'AUTH_DD_XYZ',
    email: 'c@example.com',
    amount: 250000,
    idempotencyKey: 'idem-key-123456',
  };

  it('creates a transaction and completes via the rail', async () => {
    process.env.DIRECT_DEBIT_RAIL_URL = 'http://rail.local';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    h.state.selects.push([mandate({ status: 'active' })]);
    const res = await caller.debit(debitInput);
    expect(res.status).toBe('completed');
    const txInsert = h.calls.insert.find((i) => i.table === 'transactions');
    expect(txInsert).toBeTruthy();
    expect(txInsert!.values.amount).toBe(250000);
    expect(txInsert!.values.status).toBe('processing');
    expect(h.calls.events.some((e) => e.event === 'direct_debit.debit.success')).toBe(true);
  });

  it('fails loud and marks the transaction failed when rail unconfigured', async () => {
    delete process.env.DIRECT_DEBIT_RAIL_URL;
    h.state.selects.push([mandate({ status: 'active' })]);
    await expect(caller.debit(debitInput)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(h.calls.update.some((u) => u.set.status === 'failed')).toBe(true);
    expect(h.calls.events.some((e) => e.event === 'direct_debit.debit.failed')).toBe(true);
  });

  it('rejects debit on a non-active mandate', async () => {
    h.state.selects.push([mandate({ status: 'paused' })]);
    await expect(caller.debit(debitInput)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects debit when the email does not own the authorization', async () => {
    h.state.selects.push([mandate({ status: 'active' })]);
    await expect(caller.debit({ ...debitInput, email: 'other@example.com' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('replays idempotent responses instead of re-executing', async () => {
    const { withIdempotency } = await import('../idempotency');
    const mock = withIdempotency as unknown as ReturnType<typeof vi.fn>;
    mock.mockResolvedValueOnce({ transactionId: 'txn_cached', reference: 'DDD_cached', status: 'completed', amountKobo: 250000 });
    const res = await caller.debit(debitInput);
    expect(res.transactionId).toBe('txn_cached');
    // replay: no new transaction insert
    expect(h.calls.insert.filter((i) => i.table === 'transactions')).toHaveLength(0);
  });
});

// ─── Listing ──────────────────────────────────────────────────────────────────
describe('listMandateAuthorizations / listExpiring', () => {
  it('lists authorizations for a customer', async () => {
    h.state.selects.push([mandate(), mandate({ id: 'ddm_2', status: 'active' })]);
    const res = await caller.listMandateAuthorizations({ customer_email: 'c@example.com' });
    expect(res.authorizations).toHaveLength(2);
    expect(res.authorizations[0].accountNumberMasked).toBe('******9012');
  });
  it('lists expiring mandates', async () => {
    h.state.selects.push([mandate({ status: 'active', expiresAt: new Date(Date.now() + 86400e3) })]);
    const res = await caller.listExpiring({ within_days: 30 });
    expect(res.expiring).toHaveLength(1);
    expect(res.withinDays).toBe(30);
  });
});
