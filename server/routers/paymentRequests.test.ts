/**
 * paymentRequests.test.ts — Paystack /paymentrequest parity tests.
 * Mocking pattern follows alertSubscriptions.test.ts: server/db, env, logger
 * mocked; drizzle-orm kept REAL (sql templates only build query objects);
 * db.execute routes to queued results by matching SQL text.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  // Queue of { match: string; rows: any[] } — first matching entry wins (consumed).
  execQueue: [] as Array<{ match: string; rows: any[] }>,
  execCalls: [] as string[],
  merchant: { id: 'merch_1', ownerId: 99, tenantId: 'ten_default' } as any,
  events: [] as Array<{ event: string; merchantId: string; data: any }>,
  novuKey: 'test-novu-key' as string,
  fetchImpl: null as null | ((...a: any[]) => Promise<any>),
  fetchCalls: [] as any[],
}));

// ─── mocks ────────────────────────────────────────────────────────────────────

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
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === 'open_7' ? { id: 7, openId, name: 'Owner', email: 'm@example.com' } : null),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
  };
});

vi.mock('../../server/idempotency', () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock('../../server/webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (payload: any) => {
    h.events.push({ event: payload.event, merchantId: payload.merchantId, data: payload.data });
    return { dispatched: 1, failed: 0 };
  }),
}));

vi.mock('../../server/_core/env', () => ({
  get ENV() { return { novuApiUrl: 'http://novu:3000', novuApiKey: h.novuKey }; },
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── subject ──────────────────────────────────────────────────────────────────

import { paymentRequestsRouter, computeTotal } from './paymentRequests';

const ctx: any = {
  user: { id: 7, openId: 'open_7', name: 'Owner', email: 'm@example.com', role: 'user' },
  req: { headers: {} },
  res: {},
};
const caller = () => paymentRequestsRouter.createCaller(ctx);

function baseRow(over: Record<string, any> = {}) {
  return {
    id: 'pr_1', merchant_id: 'merch_1', customer_id: 'cust_1',
    request_code: 'PRQ_ABC', offline_reference: 'OFR_XYZ', invoice_number: '1',
    description: null, amount_kobo: '100000', line_items: null, tax: null,
    currency: 'NGN', due_date: null, status: 'pending', paid: false,
    paid_at: null, amount_paid_kobo: '0', pending_amount_kobo: '100000',
    split_code: null, has_invoice: true, ...over,
  };
}

beforeEach(() => {
  h.execQueue.length = 0;
  h.execCalls.length = 0;
  h.events.length = 0;
  h.fetchCalls.length = 0;
  h.merchant = { id: 'merch_1', ownerId: 99, tenantId: 'ten_default' };
  h.novuKey = 'test-novu-key';
  h.fetchImpl = async () => ({ ok: true, status: 202, text: async () => '' } as any);
  vi.stubGlobal('fetch', (...a: any[]) => {
    h.fetchCalls.push(a);
    return h.fetchImpl!(...a);
  });
});

// ─── computeTotal ─────────────────────────────────────────────────────────────

describe('computeTotal', () => {
  it('computes line items × quantity plus tax', () => {
    expect(computeTotal(
      [{ name: 'A', amount: 5000, quantity: 2 }, { name: 'B', amount: 1000, quantity: 1 }],
      [{ name: 'VAT', amount: 750 }],
    )).toBe(11750);
  });
  it('handles no tax', () => {
    expect(computeTotal([{ name: 'A', amount: 500, quantity: 3 }], [])).toBe(1500);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('paymentRequests.create', () => {
  it('rejects when both amount and line_items are given', async () => {
    await expect(caller().create({
      customer: 'cust_1', amount: 1000,
      line_items: [{ name: 'A', amount: 1000, quantity: 1 }],
      idempotencyKey: 'idem-key-1',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects when neither amount nor line_items are given', async () => {
    await expect(caller().create({
      customer: 'cust_1', idempotencyKey: 'idem-key-1',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('creates from amount and notifies (paymentrequest.pending)', async () => {
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 6 }] }, // → invoice 5
      { match: 'INSERT INTO payment_requests', rows: [baseRow({ invoice_number: '5' })] },
      { match: 'UPDATE payment_requests', rows: [] }, // last_notified_at
    );
    const res = await caller().create({
      customer: 'cust_1', amount: 100000, idempotencyKey: 'idem-key-2',
    });
    expect(res.invoice_number).toBe('5');
    expect(res.notified).toBe(true);
    expect(h.fetchCalls.length).toBe(1); // Novu trigger
    expect(h.events.map((e) => e.event)).toContain('paymentrequest.pending');
  });

  it('creates from line items with server-computed total', async () => {
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 2 }] },
      { match: 'INSERT INTO payment_requests', rows: [baseRow({ amount_kobo: '11750', pending_amount_kobo: '11750' })] },
      { match: 'UPDATE payment_requests', rows: [] },
    );
    const res = await caller().create({
      customer: 'cust_1',
      line_items: [{ name: 'A', amount: 5000, quantity: 2 }, { name: 'B', amount: 1000, quantity: 1 }],
      tax: [{ name: 'VAT', amount: 750 }],
      idempotencyKey: 'idem-key-3',
    });
    expect(res.amount_kobo).toBe('11750');
  });

  it('draft overrides notification (no notify, no event)', async () => {
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 2 }] },
      { match: 'INSERT INTO payment_requests', rows: [baseRow({ status: 'draft' })] },
    );
    const res = await caller().create({
      customer: 'cust_1', amount: 5000, draft: true, idempotencyKey: 'idem-key-4',
    });
    expect(res.status).toBe('draft');
    expect(res.notified).toBe(false);
    expect(h.fetchCalls.length).toBe(0);
    expect(h.events.length).toBe(0);
  });

  it('fails loud when notification explicitly requested but rail unconfigured', async () => {
    h.novuKey = '';
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 2 }] },
      { match: 'INSERT INTO payment_requests', rows: [baseRow()] },
    );
    await expect(caller().create({
      customer: 'cust_1', amount: 5000, idempotencyKey: 'idem-key-5',
    })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('invoice_number override continues the sequence from the override', async () => {
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 501 }] }, // upsert result
      { match: 'INSERT INTO payment_requests', rows: [baseRow({ invoice_number: '500' })] },
      { match: 'UPDATE payment_requests', rows: [] },
    );
    const res = await caller().create({
      customer: 'cust_1', amount: 1000, invoice_number: 500, idempotencyKey: 'idem-key-6',
    });
    expect(res.invoice_number).toBe('500');
    // Next default allocation continues at 501.
    h.execQueue.push(
      { match: 'payment_request_sequences', rows: [{ next_invoice_number: 502 }] },
      { match: 'INSERT INTO payment_requests', rows: [baseRow({ invoice_number: '501' })] },
      { match: 'UPDATE payment_requests', rows: [] },
    );
    const res2 = await caller().create({
      customer: 'cust_1', amount: 1000, idempotencyKey: 'idem-key-7',
    });
    expect(res2.invoice_number).toBe('501');
  });
});

// ─── lifecycle ────────────────────────────────────────────────────────────────

describe('paymentRequests lifecycle', () => {
  it('finalize moves draft → pending and notifies', async () => {
    h.execQueue.push(
      { match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow({ status: 'draft' })] },
      { match: "SET status = 'pending'", rows: [baseRow()] },
      { match: 'last_notified_at', rows: [] },
    );
    const res = await caller().finalize({ id: 'pr_1' });
    expect(res.status).toBe('pending');
    expect(res.notified).toBe(true);
    expect(h.events.map((e) => e.event)).toContain('paymentrequest.pending');
  });

  it('finalize rejects non-draft', async () => {
    h.execQueue.push({ match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow({ status: 'success' })] });
    await expect(caller().finalize({ id: 'pr_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('update allowed on pending-unpaid; blocked once paid', async () => {
    h.execQueue.push(
      { match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow()] },
      { match: 'UPDATE payment_requests SET', rows: [baseRow({ description: 'new' })] },
    );
    const res = await caller().update({ id: 'pr_1', description: 'new' });
    expect(res.description).toBe('new');

    h.execQueue.push({ match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow({ status: 'success', paid: true })] });
    await expect(caller().update({ id: 'pr_1', description: 'x' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('archive flips status and verify hides archived requests', async () => {
    h.execQueue.push(
      { match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow()] },
      { match: "status = 'archived'", rows: [baseRow({ status: 'archived' })] },
    );
    const res = await caller().archive({ id: 'pr_1' });
    expect(res.status).toBe('archived');

    h.execQueue.push({ match: 'WHERE request_code', rows: [] });
    await expect(caller().verify({ code: 'PRQ_ABC' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── offline payments ─────────────────────────────────────────────────────────

describe('paymentRequests.recordOfflinePayment', () => {
  it('accumulates partial payments and flips to success at full payment', async () => {
    // Partial: 40k of 100k.
    h.execQueue.push(
      { match: 'WHERE offline_reference', rows: [baseRow()] },
      { match: 'UPDATE payment_requests SET', rows: [baseRow({ amount_paid_kobo: '40000', pending_amount_kobo: '60000' })] },
    );
    const partial = await caller().recordOfflinePayment({
      offline_reference: 'OFR_XYZ', amount: 40000, idempotencyKey: 'idem-pay-1',
    });
    expect(partial.status).toBe('pending');
    expect(partial.amount_paid_kobo).toBe('40000');
    expect(h.events.length).toBe(0);

    // Full: remaining 60k.
    h.execQueue.push(
      { match: 'WHERE offline_reference', rows: [baseRow({ amount_paid_kobo: '40000', pending_amount_kobo: '60000' })] },
      { match: 'UPDATE payment_requests SET', rows: [baseRow({ status: 'success', paid: true, amount_paid_kobo: '100000', pending_amount_kobo: '0' })] },
    );
    const full = await caller().recordOfflinePayment({
      offline_reference: 'OFR_XYZ', amount: 60000, idempotencyKey: 'idem-pay-2',
    });
    expect(full.status).toBe('success');
    expect(h.events.map((e) => e.event)).toContain('paymentrequest.success');
  });

  it('rejects overpayment beyond the pending amount', async () => {
    h.execQueue.push({ match: 'WHERE offline_reference', rows: [baseRow({ amount_paid_kobo: '40000' })] });
    await expect(caller().recordOfflinePayment({
      offline_reference: 'OFR_XYZ', amount: 60001, idempotencyKey: 'idem-pay-3',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects unknown offline reference', async () => {
    h.execQueue.push({ match: 'WHERE offline_reference', rows: [] });
    await expect(caller().recordOfflinePayment({
      offline_reference: 'OFR_NOPE', amount: 100, idempotencyKey: 'idem-pay-4',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── list / totals / get ──────────────────────────────────────────────────────

describe('paymentRequests.list / totals / get', () => {
  it('list excludes archived by default', async () => {
    h.execQueue.push({ match: 'SELECT * FROM payment_requests WHERE', rows: [baseRow()] });
    const rows = await caller().list({});
    expect(rows).toHaveLength(1);
    expect(h.execCalls[0]).toContain("status <> 'archived'");
  });

  it('totals groups amounts by currency', async () => {
    h.execQueue.push({ match: 'GROUP BY currency', rows: [{ currency: 'NGN', pending: '5000', successful: '10000', total: '15000' }] });
    const res = await caller().totals();
    expect(res[0]).toMatchObject({ currency: 'NGN', pending: '5000', successful: '10000' });
  });

  it('get includes linked transactions and paid/pending amounts', async () => {
    h.execQueue.push(
      { match: 'SELECT * FROM payment_requests WHERE id', rows: [baseRow({ amount_paid_kobo: '40000', pending_amount_kobo: '60000' })] },
      { match: 'FROM transactions', rows: [{ id: 'tx_1', reference: 'OFR_XYZ', amount: '40000' }] },
    );
    const res = await caller().get({ id: 'pr_1' });
    expect(res.transactions).toHaveLength(1);
    expect(res.amount_paid).toBe('40000');
    expect(res.pending_amount).toBe('60000');
  });
});
