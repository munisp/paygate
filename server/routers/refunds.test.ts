/**
 * refunds.test.ts — lifecycle, needs_attention retry gating, over-refund
 * rejection, idempotent create replay. Mocking pattern follows
 * alertSubscriptions.test.ts (vi.mock server/db chain, hoisted state).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  refunds: new Map<string, any>(),
  tx: null as any,
  events: [] as any[],
  idemStore: new Map<string, any>(),
  merchant: { id: 'merch_1', ownerId: 99 } as any,
  fetchImpl: null as null | ((...a: any[]) => Promise<any>),
}));

// drizzle-orm sql tag → inspectable query object (nested fragments collapse).
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...vals: any[]) => {
    // Flatten nested sql`` fragments so handlers see all bound values in order.
    const flat = (vs: any[]): any[] =>
      vs.flatMap((v) => (v && typeof v === 'object' && 'text' in v ? flat(v.values) : [v]));
    return { text: (strings as unknown as string[]).join('¤'), values: flat(vals) };
  },
}));

vi.mock('../../server/db', () => {
  const execute = async (q: { text: string; values: any[] }) => {
    const t = q.text.trim();
    const v = q.values;
    // transactions lookup
    if (t.startsWith('SELECT id, reference, amount, currency, status, channel, metadata') || t.startsWith('SELECT id, reference, channel, metadata')) {
      return { rows: h.tx ? [h.tx] : [] };
    }
    // prior refunds sum
    if (t.includes('SUM(amount_kobo)') && !t.includes('GROUP BY status')) {
      const active = ['pending', 'processing', 'needs_attention', 'processed'];
      const total = [...h.refunds.values()]
        .filter((r) => active.includes(r.status) && r.transaction_ref === v[1])
        .reduce((a, r) => a + Number(r.amount_kobo), 0);
      return { rows: [{ total }] };
    }
    if (t.startsWith('INSERT INTO refunds')) {
      const [id, merchant_id, transaction_ref, transaction_id, amount_kobo, currency,
        status, merchant_note, customer_note, processor, refunded_by,
        deducted_amount, fully_deducted, expected_at, refunded_at, retry_account,
        created_at, updated_at] = v;
      const row = { id, merchant_id, transaction_ref, transaction_id, amount_kobo, currency,
        status, merchant_note, customer_note, processor, refunded_by,
        deducted_amount, fully_deducted, expected_at, refunded_at, retry_account,
        created_at, updated_at };
      h.refunds.set(id, row);
      return { rows: [row] };
    }
    if (t.startsWith('SELECT * FROM refunds WHERE id')) {
      const row = h.refunds.get(v[0]);
      return { rows: row && row.merchant_id === v[1] ? [row] : [] };
    }
    if (t.startsWith('UPDATE refunds SET\n      status')) {
      // transitionRefundStatus guarded update
      const [next, processor, deducted_amount, fully_deducted, refunded_at, expected_at,
        retry_account, now, id, merchantId, fromStatus] = v;
      const row = h.refunds.get(id);
      if (!row || row.merchant_id !== merchantId || row.status !== fromStatus) return { rows: [] };
      Object.assign(row, {
        status: next,
        processor: processor ?? row.processor,
        deducted_amount: deducted_amount ?? row.deducted_amount,
        fully_deducted: fully_deducted ?? row.fully_deducted,
        refunded_at: refunded_at ?? row.refunded_at,
        expected_at: expected_at ?? row.expected_at,
        retry_account: retry_account ?? row.retry_account,
        updated_at: now,
      });
      return { rows: [{ ...row }] };
    }
    if (t.startsWith('UPDATE refunds SET\n              retry_account')) {
      const [retry_account, processor, now, id, merchantId] = v;
      const row = h.refunds.get(id);
      if (!row || row.merchant_id !== merchantId) return { rows: [] };
      Object.assign(row, { retry_account, processor, updated_at: now });
      return { rows: [{ ...row }] };
    }
    if (t.startsWith('SELECT * FROM refunds\n      WHERE merchant_id')) {
      // list: status filter is the only dynamic value we assert on
      let rows = [...h.refunds.values()].filter((r) => r.merchant_id === v[0]);
      const status = v.find((x) => typeof x === 'string' &&
        ['pending','processing','needs_attention','failed','processed'].includes(x));
      if (status) rows = rows.filter((r) => r.status === status);
      rows.sort((a, b) => (a.id < b.id ? -1 : 1));
      return { rows };
    }
    if (t.includes('GROUP BY status')) {
      const by: Record<string, { count: number; total_kobo: number }> = {};
      for (const r of [...h.refunds.values()].filter((r) => r.merchant_id === v[0])) {
        by[r.status] ??= { count: 0, total_kobo: 0 };
        by[r.status].count++;
        by[r.status].total_kobo += Number(r.amount_kobo);
      }
      return { rows: Object.entries(by).map(([status, x]) => ({ status, ...x })) };
    }
    throw new Error(`unexpected SQL: ${t.slice(0, 80)}`);
  };
  return {
    getDb: vi.fn(async () => ({ execute })),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === 'open_7' ? { id: 7, openId } : null),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
  };
});

vi.mock('../../server/idempotency', () => ({
  withIdempotency: async (opts: any) => {
    const k = `${opts.merchantId}:${opts.key}`;
    if (h.idemStore.has(k)) return h.idemStore.get(k); // replay: no re-execute
    const r = await opts.execute();
    h.idemStore.set(k, r);
    return r;
  },
}));

vi.mock('../../server/webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (p: any) => { h.events.push(p); return { dispatched: 1, failed: 0 }; }),
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

import { refundsRouter, transitionRefundStatus } from './refunds';
import { getDb } from '../../server/db';

const ctx: any = {
  user: { id: 7, openId: 'open_7', role: 'user' },
  req: { headers: {} },
  res: {},
};
const makeCaller = (c: any = ctx) => refundsRouter.createCaller(c);

function seedTx(over: any = {}) {
  h.tx = {
    id: 'txn_1', reference: 'TXN-ABC', amount: 100_000, currency: 'NGN',
    status: 'success', channel: 'card', metadata: {}, ...over,
  };
}

beforeEach(() => {
  h.refunds.clear();
  h.events.length = 0;
  h.idemStore.clear();
  h.merchant = { id: 'merch_1', ownerId: 99 };
  delete process.env.STRIPE_SECRET_KEY;
  h.fetchImpl = async () => ({ ok: true, status: 200, text: async () => '{}' });
  vi.stubGlobal('fetch', (...a: any[]) => h.fetchImpl!(...a));
});

describe('refunds.create', () => {
  it('parks in needs_attention when the rail has no refund API (fail loud, no fabricated success)', async () => {
    seedTx();
    const caller = makeCaller();
    const res: any = await caller.create({
      idempotencyKey: 'idem-key-0001', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    expect(res.status).toBe('needs_attention');
    expect(res.reversal.accepted).toBe(false);
    expect(res.reversal.reason).toMatch(/no automated refund API/i);
    expect(h.events.map((e) => e.event)).toEqual(['refund.pending', 'refund.needs_attention']);
  });

  it('drives Stripe reversal to processing when configured', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedTx({ metadata: { stripePaymentIntentId: 'pi_123' } });
    const caller = makeCaller();
    const res: any = await caller.create({
      idempotencyKey: 'idem-key-0002', transactionRef: 'TXN-ABC',
    }); // full refund
    expect(res.status).toBe('processing');
    expect(res.amount_kobo).toBe(100_000);
    expect(res.reversal).toEqual({ accepted: true, processor: 'stripe' });
    expect(h.events.map((e) => e.event)).toEqual(['refund.pending', 'refund.processing']);
  });

  it('rejects refunds on non-successful transactions', async () => {
    seedTx({ status: 'failed' });
    await expect(makeCaller().create({
      idempotencyKey: 'idem-key-0003', transactionRef: 'TXN-ABC',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects transactions owned by another merchant (NOT_FOUND)', async () => {
    h.tx = null; // fake DB only returns rows for merch_1 queries via h.tx
    await expect(makeCaller().create({
      idempotencyKey: 'idem-key-0004', transactionRef: 'TXN-OTHER',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('rejects over-refund (partial > original minus prior refunds)', async () => {
    seedTx();
    h.refunds.set('ref_prior', {
      id: 'ref_prior', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      amount_kobo: 60_000, status: 'processed',
    });
    await expect(makeCaller().create({
      idempotencyKey: 'idem-key-0005', transactionRef: 'TXN-ABC', amountKobo: 50_000,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /refundable balance/ });
    // exactly the remaining balance is fine
    const res: any = await makeCaller().create({
      idempotencyKey: 'idem-key-0006', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    expect(res.amount_kobo).toBe(40_000);
  });

  it('idempotent replay returns the stored response without re-executing', async () => {
    seedTx();
    const caller = makeCaller();
    const first: any = await caller.create({
      idempotencyKey: 'idem-key-0007', transactionRef: 'TXN-ABC', amountKobo: 10_000,
    });
    const second: any = await caller.create({
      idempotencyKey: 'idem-key-0007', transactionRef: 'TXN-ABC', amountKobo: 10_000,
    });
    expect(second.id).toBe(first.id);
    expect([...h.refunds.values()].filter((r) => r.transaction_ref === 'TXN-ABC')).toHaveLength(1);
    // events only from the first execution
    expect(h.events).toHaveLength(2);
  });
});

describe('refunds.retryWithCustomerDetails', () => {
  async function seedNeedsAttention() {
    seedTx();
    const res: any = await makeCaller().create({
      idempotencyKey: 'idem-seed', transactionRef: 'TXN-ABC', amountKobo: 25_000,
    });
    expect(res.status).toBe('needs_attention');
    return res.id as string;
  }

  it('only retries from needs_attention; other statuses get CONFLICT', async () => {
    const id = await seedNeedsAttention();
    // Force it into processed (terminal) and confirm retry is refused.
    const db: any = await getDb();
    await transitionRefundStatus(db, 'merch_1', id, 'processing', {});
    // processing → retry refused
    await expect(makeCaller().retryWithCustomerDetails({
      id, idempotencyKey: 'idem-retry-01',
      account: { accountNumber: '0123456789', bankCode: '044' },
    })).rejects.toMatchObject({ code: 'CONFLICT', message: /needs_attention/ });
  });

  it('stores retry account and re-attempts; without a disbursement rail it stays needs_attention with explicit reason', async () => {
    const id = await seedNeedsAttention();
    const res: any = await makeCaller().retryWithCustomerDetails({
      id, idempotencyKey: 'idem-retry-02',
      account: { accountNumber: '0123456789', bankCode: '044', accountName: 'Ada' },
    });
    expect(res.status).toBe('needs_attention');
    expect(res.retry_account).toBe(JSON.stringify({ accountNumber: '0123456789', bankCode: '044', accountName: 'Ada' }));
    expect(res.reversal.accepted).toBe(false);
    expect(res.reversal.reason).toMatch(/manual settlement/i);
  });

  it('moves to processing when a rail accepts the retried reversal', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedTx({ metadata: { stripePaymentIntentId: 'pi_9' } });
    // Seed directly in needs_attention (bypass create's stripe path).
    h.refunds.set('ref_na', {
      id: 'ref_na', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      transaction_id: 'txn_1', amount_kobo: 25_000, currency: 'NGN',
      status: 'needs_attention', processor: 'manual', retry_account: null,
      fully_deducted: false, created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const res: any = await makeCaller().retryWithCustomerDetails({
      id: 'ref_na', idempotencyKey: 'idem-retry-03',
      account: { accountNumber: '0123456789', bankCode: '044' },
    });
    expect(res.status).toBe('processing');
    expect(h.events.map((e) => e.event)).toContain('refund.processing');
  });
});

describe('status transition guard', () => {
  it('processed is terminal; illegal transitions throw CONFLICT', async () => {
    h.refunds.set('ref_done', {
      id: 'ref_done', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      amount_kobo: 5_000, status: 'processed', fully_deducted: true,
    });
    const db: any = await getDb();
    await expect(transitionRefundStatus(db, 'merch_1', 'ref_done', 'failed'))
      .rejects.toMatchObject({ code: 'CONFLICT', message: /Illegal refund status transition/ });
  });

  it('emits refund.processed on completion', async () => {
    h.refunds.set('ref_p', {
      id: 'ref_p', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      amount_kobo: 5_000, status: 'processing', fully_deducted: false,
    });
    const db: any = await getDb();
    const row = await transitionRefundStatus(db, 'merch_1', 'ref_p', 'processed', {
      deducted_amount: 5_000, fully_deducted: true, refunded_at: new Date().toISOString(),
    });
    expect(row.status).toBe('processed');
    expect(h.events.at(-1).event).toBe('refund.processed');
  });
});

describe('refunds.list / get / stats', () => {
  it('filters by status and scopes to merchant', async () => {
    h.refunds.set('r1', { id: 'r1', merchant_id: 'merch_1', transaction_ref: 'T', amount_kobo: 100, status: 'pending' });
    h.refunds.set('r2', { id: 'r2', merchant_id: 'merch_1', transaction_ref: 'T', amount_kobo: 200, status: 'processed' });
    h.refunds.set('r3', { id: 'r3', merchant_id: 'other', transaction_ref: 'T', amount_kobo: 300, status: 'pending' });
    const caller = makeCaller();
    const pending = await caller.list({ status: 'pending', limit: 25 });
    expect(pending.items.map((r: any) => r.id)).toEqual(['r1']);
    const all = await caller.list({ limit: 25 });
    expect(all.items).toHaveLength(2);
    const stats = await caller.stats({});
    expect(stats.byStatus.pending.count).toBe(1);
    expect(stats.byStatus.processed.totalKobo).toBe(200);
    const got = await caller.get({ id: 'r2' });
    expect(got.amount_kobo).toBe(200);
    await expect(caller.get({ id: 'r3' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
