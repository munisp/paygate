/**
 * refundsDisputesFixes.test.ts — regression tests for the refunds/disputes
 * audit fixes: C2 over-refund race, C8 Stripe idempotency, H8 reconciler,
 * H9 wallet debit, H27 refund-vs-chargeback, C18/H6 chargeback lifecycle,
 * H7 dispute guards + SLA sweepers.
 * Mocking pattern follows refunds.test.ts / alertSubscriptions.test.ts.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  refunds: new Map<string, any>(),
  tx: null as any,
  chargebacks: new Map<string, any>(),
  wallets: [] as any[],
  walletTxs: [] as any[],
  splitPayments: new Map<string, any>(),
  disputes: new Map<string, any>(),
  timeline: [] as any[],
  events: [] as any[],
  idemStore: new Map<string, any>(),
  merchant: { id: 'merch_1', ownerId: 99 } as any,
  fetchCalls: [] as any[],
  fetchImpl: null as null | ((url: any, init?: any) => Promise<any>),
  forUpdateSeen: 0,
  transactionCalls: 0,
  nextRefund: 0,
}));

const OPEN_CB = ['open', 'under_review', 'pre_arbitration', 'arbitration'];

// ─── drizzle-orm mock ─────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  sql: (strings: TemplateStringsArray, ...vals: any[]) => {
    const flat = (vs: any[]): any[] =>
      vs.flatMap((v) => (v && typeof v === 'object' && 'text' in v ? flat(v.values) : [v]));
    return { text: (strings as unknown as string[]).join('¤'), values: flat(vals) };
  },
  eq: vi.fn((...a: any[]) => ({ op: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
  count: vi.fn(() => 'count()'),
}));

// ─── schema mock (chainable drizzle paths) ────────────────────────────────────
vi.mock('../../drizzle/schema', () => ({
  chargebacks: {
    id: 'chargebacks.id', merchantId: 'chargebacks.merchantId',
    status: 'chargebacks.status', createdAt: 'chargebacks.createdAt',
  },
  chargebackEvidencePackages: {
    chargebackId: 'cep.chargebackId', uploadedAt: 'cep.uploadedAt',
  },
  chargebackTimeline: {
    chargebackId: 'ct.chargebackId', occurredAt: 'ct.occurredAt',
  },
  transferDisputes: {
    id: 'transferDisputes.id', status: 'transferDisputes.status',
    disputeType: 'transferDisputes.disputeType',
    initiatedByDfspId: 'transferDisputes.initiatedByDfspId',
    createdAt: 'transferDisputes.createdAt',
  },
  feePostings: {},
}));

// ─── db mock ──────────────────────────────────────────────────────────────────
vi.mock('../../server/db', () => {
  const rows = (r: any[]) => ({ rows: r });

  function findWallet(merchantId: string, currency: string) {
    return h.wallets.find((w) => w.merchant_id === merchantId && w.currency === currency);
  }

  const execute = async (q: { text: string; values: any[] }) => {
    const t = q.text.trim();
    const v = q.values;

    // ── refunds.create: locked transaction read (+ open chargeback count) ──
    if (t.startsWith('SELECT id, reference, amount, currency, status, channel, metadata')) {
      if (t.includes('FOR UPDATE')) h.forUpdateSeen++;
      if (!h.tx) return rows([]);
      const open = [...h.chargebacks.values()].filter(
        (c) => OPEN_CB.includes(c.status) &&
          (c.transaction_id === h.tx.id || c.transaction_id === h.tx.reference),
      ).length;
      return rows([{ ...h.tx, open_chargebacks: open }]);
    }
    if (t.startsWith('SELECT id, reference, channel, metadata')) {
      return rows(h.tx ? [h.tx] : []);
    }
    // prior refunds sum
    if (t.includes('SUM(amount_kobo)') && !t.includes('GROUP BY status')) {
      const active = ['pending', 'processing', 'needs_attention', 'processed'];
      const total = [...h.refunds.values()]
        .filter((r) => active.includes(r.status) && r.transaction_ref === v[1])
        .reduce((a, r) => a + Number(r.amount_kobo), 0);
      return rows([{ total }]);
    }
    if (t.startsWith('INSERT INTO refunds')) {
      const [id, merchant_id, transaction_ref, transaction_id, amount_kobo, currency,
        status, merchant_note, customer_note, processor, refunded_by,
        deducted_amount, fully_deducted, expected_at, refunded_at, retry_account,
        created_at, updated_at] = v;
      const row = { id, merchant_id, transaction_ref, transaction_id, amount_kobo, currency,
        status, merchant_note, customer_note, processor, refunded_by,
        deducted_amount, fully_deducted, expected_at, refunded_at, retry_account,
        stripe_refund_id: null, created_at, updated_at };
      h.refunds.set(id, row);
      return rows([row]);
    }
    if (t.startsWith('SELECT * FROM refunds WHERE id')) {
      const row = h.refunds.get(v[0]);
      return rows(row && row.merchant_id === v[1] ? [row] : []);
    }
    if (t.startsWith('UPDATE refunds SET') && t.includes('status =')) {
      const [next, processor, deducted_amount, fully_deducted, refunded_at, expected_at,
        retry_account, now, id, merchantId, fromStatus] = v;
      const row = h.refunds.get(id);
      if (!row || row.merchant_id !== merchantId || row.status !== fromStatus) return rows([]);
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
      return rows([{ ...row }]);
    }
    if (t.startsWith('UPDATE refunds SET stripe_refund_id')) {
      const [stripeId, now, id, merchantId] = v;
      const row = h.refunds.get(id);
      if (row && row.merchant_id === merchantId && !row.stripe_refund_id) {
        row.stripe_refund_id = stripeId;
        row.updated_at = now;
      }
      return rows([]);
    }
    if (t.startsWith('UPDATE refunds SET') && t.includes('retry_account =')) {
      const [retry_account, processor, now, id, merchantId] = v;
      const row = h.refunds.get(id);
      if (!row || row.merchant_id !== merchantId) return rows([]);
      Object.assign(row, { retry_account, processor, updated_at: now });
      return rows([{ ...row }]);
    }
    // reconciler sweep
    if (t.startsWith("SELECT * FROM refunds") && t.includes("status = 'processing'")) {
      const cutoff = v[0];
      return rows([...h.refunds.values()].filter(
        (r) => r.status === 'processing' && r.updated_at < cutoff,
      ));
    }

    // ── wallets ──
    if (t.startsWith('SELECT id, balance FROM wallets')) {
      const w = findWallet(v[0], v[1]);
      return rows(w ? [{ id: w.id, balance: w.balance }] : []);
    }
    if (t.startsWith('UPDATE wallets SET balance')) {
      const [after, now, id, beforeGuard] = v;
      const w = h.wallets.find((x) => x.id === id);
      if (!w || w.balance !== beforeGuard) return rows([]);
      w.balance = after;
      w.updated_at = now;
      return rows([{ id: w.id }]);
    }
    if (t.startsWith('INSERT INTO wallet_transactions')) {
      const [tenant_id, wallet_id, type, amount, currency, balance_before,
        balance_after, description, reference, channel, status] = v;
      if (h.walletTxs.some((x) => x.tenant_id === tenant_id && x.reference === reference)) {
        return rows([]); // ON CONFLICT DO NOTHING
      }
      h.walletTxs.push({ tenant_id, wallet_id, type, amount, currency, balance_before,
        balance_after, description, reference, channel, status });
      return rows([]);
    }
    if (t.includes('reserved_balance = GREATEST')) {
      const [delta, now, merchantId] = v;
      const ws = h.wallets.filter((x) => x.merchant_id === merchantId);
      for (const w of ws) {
        const nb = BigInt(w.reserved_balance ?? '0') + BigInt(delta);
        w.reserved_balance = (nb < 0n ? 0n : nb).toString();
        w.updated_at = now;
      }
      return rows(ws.map((w) => ({ id: w.id })));
    }
    if (t.startsWith('SELECT merchant_id FROM wallets')) {
      const w = h.wallets.find(
        (x) => (x.merchant_id === v[0] || x.user_id === v[0]) && x.currency === v[v.length - 1],
      );
      return rows(w ? [{ merchant_id: w.merchant_id }] : []);
    }

    // ── chargebacks ──
    if (t.startsWith('SELECT * FROM chargebacks WHERE id')) {
      const c = h.chargebacks.get(v[0]);
      return rows(c && c.merchant_id === v[1] ? [c] : []);
    }
    if (t.startsWith('UPDATE chargebacks SET')) {
      const [next, resolved_at, now, id, merchantId, fromStatus] = v;
      const c = h.chargebacks.get(id);
      if (!c || c.merchant_id !== merchantId || c.status !== fromStatus) return rows([]);
      Object.assign(c, { status: next, resolved_at: resolved_at ?? c.resolved_at, updated_at: now });
      return rows([{ ...c }]);
    }
    if (t.startsWith('INSERT INTO chargeback_timeline')) {
      h.timeline.push(v);
      return rows([]);
    }
    if (t.startsWith('SELECT id, merchant_id FROM chargebacks')) {
      const now = new Date().toISOString();
      return rows([...h.chargebacks.values()].filter(
        (c) => OPEN_CB.includes(c.status) && c.due_date && c.due_date < now,
      ).map((c) => ({ id: c.id, merchant_id: c.merchant_id })));
    }

    // ── split_payments ──
    if (t.startsWith('SELECT reference FROM transactions')) {
      return rows(h.tx ? [{ reference: h.tx.reference }] : []);
    }
    if (t.startsWith('SELECT * FROM split_payments WHERE reference')) {
      return rows([...h.splitPayments.values()].filter(
        (s) => s.reference === v[0] && s.status === 'completed',
      ));
    }
    if (t.startsWith('INSERT INTO split_payments')) {
      const [split_payment_id, split_rule_id, total_amount_kobo, reference, legs,
        status, merchant_id, created_at, updated_at] = v;
      if (h.splitPayments.has(split_payment_id)) return rows([]); // ON CONFLICT
      const row = { split_payment_id, split_rule_id, total_amount_kobo, reference,
        legs: JSON.parse(legs), status, merchant_id, created_at, updated_at };
      h.splitPayments.set(split_payment_id, row);
      return rows([row]);
    }
    if (t.startsWith("UPDATE split_payments SET status = 'reversed'")) {
      const [now, id] = v;
      const sp = h.splitPayments.get(id);
      if (sp) { sp.status = 'reversed'; sp.updated_at = now; }
      return rows([]);
    }

    // ── transfer_disputes (sweeper, raw) ──
    if (t.startsWith('SELECT * FROM transfer_disputes')) {
      const now = new Date().toISOString();
      return rows([...h.disputes.values()].filter(
        (d) => ['OPEN', 'UNDER_REVIEW', 'ESCALATED'].includes(d.status) &&
          d.sla_deadline && d.sla_deadline < now,
      ));
    }
    if (t.startsWith('UPDATE transfer_disputes SET')) {
      const [resolved_at, updated_at, id] = v;
      const d = h.disputes.get(id);
      if (!d || !['OPEN', 'UNDER_REVIEW', 'ESCALATED'].includes(d.status)) return rows([]);
      Object.assign(d, { status: 'RESOLVED', resolution: 'auto_accepted_sla', resolved_at, updated_at });
      return rows([{ id }]);
    }

    throw new Error(`unexpected SQL: ${t.slice(0, 90)}`);
  };

  // Chainable select (chargebackLifecycle submitEvidence path)
  function makeSelect(): any {
    const q: any = { _where: null };
    q.from = vi.fn(() => q);
    q.where = vi.fn((w: any) => { q._where = w; return q; });
    q.orderBy = vi.fn(() => q);
    q.limit = vi.fn(async () => {
      const idVals: string[] = [];
      const collect = (node: any) => {
        if (!node || typeof node !== 'object') return;
        if (node.op === 'eq') idVals.push(node.a[1]);
        if (Array.isArray(node.a)) node.a.forEach(collect);
      };
      collect(q._where);
      const cbs = [...h.chargebacks.values()];
      return cbs.filter((c) => idVals.includes(c.id)).slice(0, 1)
        .map((c) => ({ ...c, evidenceDeadline: c.evidence_deadline, dueDate: c.due_date,
          merchantId: c.merchant_id, transactionId: c.transaction_id }));
    });
    return q;
  }

  const db: any = {
    execute,
    select: vi.fn(() => makeSelect()),
    insert: vi.fn(() => {
      const c: any = {};
      c.values = vi.fn(() => c);
      c.returning = vi.fn(async () => []);
      return c;
    }),
    update: vi.fn((table: any) => {
      const c: any = { _set: null, _where: null };
      c.set = vi.fn((s: any) => { c._set = s; return c; });
      c.where = vi.fn((w: any) => { c._where = w; return c; });
      c.returning = vi.fn(async () => {
        // resolveDispute guarded flip: eq(id) + sql status-IN guard
        const idVals: string[] = [];
        let guardText = '';
        const collect = (node: any) => {
          if (!node || typeof node !== 'object') return;
          if (node.op === 'eq') idVals.push(node.a[1]);
          if ('text' in node) guardText += node.text;
          if (Array.isArray(node.a)) node.a.forEach(collect);
        };
        collect(c._where);
        const d = h.disputes.get(idVals[0]);
        const guarded = guardText.includes("IN ('OPEN', 'UNDER_REVIEW', 'ESCALATED')");
        if (!d) return [];
        if (guarded && !['OPEN', 'UNDER_REVIEW', 'ESCALATED'].includes(d.status)) return [];
        Object.assign(d, c._set);
        return [d];
      });
      return c;
    }),
    transaction: vi.fn(async (fn: any) => { h.transactionCalls++; return fn(db); }),
  };

  return {
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === 'open_7' ? { id: 7, openId } : null),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
  };
});

vi.mock('../../server/idempotency', () => ({
  withIdempotency: async (opts: any) => {
    const k = `${opts.merchantId}:${opts.key}`;
    if (h.idemStore.has(k)) return h.idemStore.get(k);
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

vi.mock('../../server/pbac', () => ({
  requirePermission: vi.fn(async () => {}),
  resolveMerchantTeamRole: vi.fn(async (openId: string) => ({ role: 'owner', openId })),
  permifyCheck: vi.fn(async () => 'allowed'),
  checkPermissionDetailed: vi.fn(async () => ({ decision: 'allowed' })),
}));

vi.mock('../../server/storage', () => ({
  storagePut: vi.fn(async () => ({ url: 'https://files.example.com/x' })),
}));

// ─── Subjects under test ──────────────────────────────────────────────────────
import {
  refundsRouter,
  reconcileProcessingRefunds,
  transitionRefundStatus,
} from './refunds';
import {
  chargebackLifecycleRouter,
  transitionChargebackStatus,
  autoAcceptExpiredChargebacks,
} from './chargebackLifecycle';
import {
  nexthubDisputesRouter,
  autoAcceptExpiredDisputes,
} from './nexthubDisputes';
import { getDb } from '../../server/db';

const ctx: any = {
  user: { id: 7, openId: 'open_7', role: 'admin' },
  req: { headers: {} },
  res: {},
};
const makeCaller = (c: any = ctx) => refundsRouter.createCaller(c);
const cbCaller = (c: any = ctx) => chargebackLifecycleRouter.createCaller(c);
const dspCaller = (c: any = ctx) => nexthubDisputesRouter.createCaller(c);

function seedTx(over: any = {}) {
  h.tx = {
    id: 'txn_1', reference: 'TXN-ABC', amount: 100_000, currency: 'NGN',
    status: 'success', channel: 'card', metadata: {}, ...over,
  };
}

function seedWallet(over: any = {}) {
  const w = {
    id: h.wallets.length + 1, tenant_id: 'ten_default', user_id: 'u_1',
    merchant_id: 'merch_1', currency: 'NGN', balance: '200000',
    reserved_balance: '0', ...over,
  };
  h.wallets.push(w);
  return w;
}

function seedChargeback(over: any = {}) {
  const c = {
    id: `cb_${h.chargebacks.size + 1}`, merchant_id: 'merch_1',
    transaction_id: 'txn_1', amount_kobo: 50_000, currency: 'NGN',
    reason: 'fraudulent', status: 'open',
    due_date: new Date(Date.now() + 7 * 86400_000).toISOString(),
    evidence_deadline: new Date(Date.now() + 5 * 86400_000).toISOString(),
    created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    ...over,
  };
  h.chargebacks.set(c.id, c);
  return c;
}

beforeEach(() => {
  h.refunds.clear();
  h.chargebacks.clear();
  h.splitPayments.clear();
  h.disputes.clear();
  h.wallets.length = 0;
  h.walletTxs.length = 0;
  h.timeline.length = 0;
  h.events.length = 0;
  h.fetchCalls.length = 0;
  h.idemStore.clear();
  h.merchant = { id: 'merch_1', ownerId: 99 };
  h.forUpdateSeen = 0;
  h.transactionCalls = 0;
  delete process.env.STRIPE_SECRET_KEY;
  h.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({}), text: async () => '{}' });
  vi.stubGlobal('fetch', (...a: any[]) => { h.fetchCalls.push(a); return h.fetchImpl!(a[0], a[1]); });
});

// ─── C2: over-refund race ─────────────────────────────────────────────────────
describe('C2 over-refund race', () => {
  it('locks the transactions row (FOR UPDATE) inside one DB transaction', async () => {
    seedTx();
    await makeCaller().create({
      idempotencyKey: 'c2-key-0001', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    expect(h.forUpdateSeen).toBeGreaterThan(0);
    expect(h.transactionCalls).toBeGreaterThan(0);
  });

  it('a second create with a different idempotency key cannot over-refund', async () => {
    seedTx();
    const first: any = await makeCaller().create({
      idempotencyKey: 'c2-key-0002', transactionRef: 'TXN-ABC', amountKobo: 60_000,
    });
    expect(first.amount_kobo).toBe(60_000);
    // concurrent-style second create (different key) sees the locked-in sum
    await expect(makeCaller().create({
      idempotencyKey: 'c2-key-0003', transactionRef: 'TXN-ABC', amountKobo: 60_000,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /refundable balance/ });
    // and the exact remaining balance still succeeds
    const second: any = await makeCaller().create({
      idempotencyKey: 'c2-key-0004', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    expect(second.amount_kobo).toBe(40_000);
  });
});

// ─── C8: Stripe refund idempotency ────────────────────────────────────────────
describe('C8 Stripe refund idempotency', () => {
  it('sends Idempotency-Key refund_<refund.id> on POST /v1/refunds', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedTx({ metadata: { stripePaymentIntentId: 'pi_123' } });
    const res: any = await makeCaller().create({
      idempotencyKey: 'c8-key-0001', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    const post = h.fetchCalls.find(([u, i]: any) => u === 'https://api.stripe.com/v1/refunds' && i?.method === 'POST');
    expect(post).toBeTruthy();
    expect(post[1].headers['Idempotency-Key']).toBe(`refund_${res.id}`);
  });

  it('on timeout/abort it adopts an already-created Stripe refund instead of parking', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedTx({ metadata: { stripePaymentIntentId: 'pi_123' } });
    h.fetchImpl = async (url: any, init?: any) => {
      if (init?.method === 'POST') throw new Error('The operation was aborted due to timeout');
      // GET /v1/refunds?payment_intent=... → Stripe DID create it
      return { ok: true, status: 200, json: async () => ({ data: [{ id: 're_adopt1', amount: 40_000, status: 'succeeded' }] }) };
    };
    const res: any = await makeCaller().create({
      idempotencyKey: 'c8-key-0002', transactionRef: 'TXN-ABC', amountKobo: 40_000,
    });
    expect(res.status).toBe('processing');
    expect(res.reversal.accepted).toBe(true);
    expect(h.refunds.get(res.id).stripe_refund_id).toBe('re_adopt1');
  });

  it('retryWithCustomerDetails skips re-issue when a stripe refund id exists', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedTx({ metadata: { stripePaymentIntentId: 'pi_123' } });
    h.refunds.set('ref_na', {
      id: 'ref_na', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      transaction_id: 'txn_1', amount_kobo: 25_000, currency: 'NGN',
      status: 'needs_attention', processor: 'stripe', retry_account: null,
      stripe_refund_id: 're_existing', fully_deducted: false,
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
    });
    const res: any = await makeCaller().retryWithCustomerDetails({
      id: 'ref_na', idempotencyKey: 'c8-key-0003',
      account: { accountNumber: '0123456789', bankCode: '044' },
    });
    expect(res.status).toBe('processing');
    expect(res.reversal.adopted).toBe(true);
    // no new POST to Stripe
    expect(h.fetchCalls.filter(([u, i]: any) => i?.method === 'POST')).toHaveLength(0);
  });
});

// ─── H8 + H9: reconciler and wallet debit ─────────────────────────────────────
describe('H8 reconciler / H9 wallet debit', () => {
  function seedProcessing(over: any = {}) {
    const r = {
      id: 'ref_p1', merchant_id: 'merch_1', transaction_ref: 'TXN-ABC',
      transaction_id: 'txn_1', amount_kobo: 30_000, currency: 'NGN',
      status: 'processing', processor: 'stripe', stripe_refund_id: 're_x1',
      fully_deducted: false,
      created_at: new Date(Date.now() - 3600_000).toISOString(),
      updated_at: new Date(Date.now() - 10 * 60_000).toISOString(), // older than 5 min
      ...over,
    };
    h.refunds.set(r.id, r);
    return r;
  }

  it('succeeded → processed + merchant wallet debited + refund.processed emitted', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedProcessing();
    const w = seedWallet({ balance: '200000' });
    h.fetchImpl = async () => ({ ok: true, status: 200, json: async () => ({ id: 're_x1', status: 'succeeded' }) });
    const out = await reconcileProcessingRefunds();
    expect(out).toMatchObject({ scanned: 1, processed: 1, errors: [] });
    expect(h.refunds.get('ref_p1').status).toBe('processed');
    expect(h.refunds.get('ref_p1').refunded_at).toBeTruthy();
    expect(h.refunds.get('ref_p1').deducted_amount).toBe(30_000);
    expect(w.balance).toBe('170000'); // 200_000 - 30_000
    expect(h.walletTxs).toHaveLength(1);
    expect(h.walletTxs[0]).toMatchObject({
      type: 'debit', amount: '30000', reference: 'refund_ref_p1', channel: 'refund',
      balance_before: '200000', balance_after: '170000',
    });
    expect(h.events.map((e) => e.event)).toContain('refund.processed');
  });

  it('failed/canceled → failed; requires_attention → needs_attention', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedProcessing();
    seedProcessing({ id: 'ref_p2', stripe_refund_id: 're_x2' });
    seedProcessing({ id: 'ref_p3', stripe_refund_id: 're_x3' });
    seedWallet();
    const statuses: Record<string, string> = { re_x1: 'failed', re_x2: 'canceled', re_x3: 'requires_attention' };
    h.fetchImpl = async (url: any) => {
      const id = String(url).split('/').pop()!;
      return { ok: true, status: 200, json: async () => ({ id, status: statuses[id] }) };
    };
    const out = await reconcileProcessingRefunds();
    expect(out.failed).toBe(2);
    expect(out.needsAttention).toBe(1);
    expect(h.refunds.get('ref_p1').status).toBe('failed');
    expect(h.refunds.get('ref_p2').status).toBe('failed');
    expect(h.refunds.get('ref_p3').status).toBe('needs_attention');
    expect(h.events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['refund.failed', 'refund.needs_attention']),
    );
  });

  it('fails loud per-row and continues the sweep', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_x';
    seedProcessing();
    seedProcessing({ id: 'ref_p2', stripe_refund_id: 're_x2' });
    seedWallet();
    h.fetchImpl = async (url: any) => {
      if (String(url).endsWith('re_x1')) return { ok: false, status: 500, json: async () => ({}) };
      return { ok: true, status: 200, json: async () => ({ id: 're_x2', status: 'succeeded' }) };
    };
    const out = await reconcileProcessingRefunds();
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].refundId).toBe('ref_p1');
    expect(out.processed).toBe(1);
    expect(h.refunds.get('ref_p1').status).toBe('processing'); // untouched
    expect(h.refunds.get('ref_p2').status).toBe('processed');
  });
});

// ─── H27: refund vs open chargeback ───────────────────────────────────────────
describe('H27 refund vs open chargeback', () => {
  it('rejects create with CONFLICT when an open chargeback exists', async () => {
    seedTx();
    seedChargeback({ status: 'under_review' });
    await expect(makeCaller().create({
      idempotencyKey: 'h27-key-001', transactionRef: 'TXN-ABC', amountKobo: 10_000,
    })).rejects.toMatchObject({ code: 'CONFLICT', message: /open chargeback/i });
  });

  it('allows create once the chargeback is closed', async () => {
    seedTx();
    seedChargeback({ status: 'closed_won' });
    const res: any = await makeCaller().create({
      idempotencyKey: 'h27-key-002', transactionRef: 'TXN-ABC', amountKobo: 10_000,
    });
    expect(res.amount_kobo).toBe(10_000);
  });
});

// ─── C18/H6: chargeback state machine ─────────────────────────────────────────
describe('C18/H6 chargeback state machine', () => {
  it('follows the legal chain open→under_review→pre_arbitration→arbitration→closed_won', async () => {
    const db: any = await getDb();
    const cb = seedChargeback();
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'under_review');
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'pre_arbitration');
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'arbitration');
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'closed_won');
    expect(h.chargebacks.get(cb.id).status).toBe('closed_won');
  });

  it('rejects illegal jumps and terminal exits with CONFLICT', async () => {
    const db: any = await getDb();
    const cb = seedChargeback();
    await expect(transitionChargebackStatus(db, 'merch_1', cb.id, 'arbitration'))
      .rejects.toMatchObject({ code: 'CONFLICT', message: /Illegal chargeback status transition/ });
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'under_review');
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'closed_won');
    // closed_won is terminal
    await expect(transitionChargebackStatus(db, 'merch_1', cb.id, 'closed_lost'))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('guarded flip: a concurrent transition yields CONFLICT (0 rows)', async () => {
    const db: any = await getDb();
    const cb = seedChargeback();
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'under_review');
    // stale caller still thinks it is 'open' and tries open→under_review again
    await transitionChargebackStatus(db, 'merch_1', cb.id, 'pre_arbitration');
    await expect(transitionChargebackStatus(db, 'merch_1', cb.id, 'arbitration'))
      .resolves.toBeTruthy();
    expect(h.chargebacks.get(cb.id).status).toBe('arbitration');
  });

  it('escalate routes through the state machine', async () => {
    const cb = seedChargeback({ status: 'under_review' });
    const res: any = await cbCaller().escalate({
      chargebackId: cb.id, reason: 'scheme requested arbitration', newStatus: 'pre_arbitration',
    });
    expect(res.success).toBe(true);
    expect(h.chargebacks.get(cb.id).status).toBe('pre_arbitration');
    // illegal: pre_arbitration → closed stage is allowed, but backwards is not
    await expect(cbCaller().escalate({
      chargebackId: cb.id, reason: 'backwards', newStatus: 'pre_arbitration',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('submitEvidence rejects when closed or past the deadline', async () => {
    const closed = seedChargeback({ status: 'closed_lost' });
    await expect(cbCaller().submitEvidence({
      chargebackId: closed.id, evidenceType: 'receipt', fileName: 'r.pdf',
      fileKey: 'k', fileUrl: 'https://files.example.com/r.pdf', mimeType: 'application/pdf',
    })).rejects.toMatchObject({ code: 'CONFLICT' });

    const late = seedChargeback({
      status: 'open',
      evidence_deadline: new Date(Date.now() - 60_000).toISOString(),
      due_date: new Date(Date.now() - 30_000).toISOString(),
    });
    await expect(cbCaller().submitEvidence({
      chargebackId: late.id, evidenceType: 'receipt', fileName: 'r.pdf',
      fileKey: 'k', fileUrl: 'https://files.example.com/r.pdf', mimeType: 'application/pdf',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST', message: /deadline/i });
  });

  it('closed_lost debits the wallet, releases the hold, reverses split legs and emits events', async () => {
    const db: any = await getDb();
    const w = seedWallet({ balance: '200000', reserved_balance: '50000' });
    seedTx();
    const cb = seedChargeback({ status: 'under_review', amount_kobo: 50_000 });
    h.splitPayments.set('sp_1', {
      split_payment_id: 'sp_1', split_rule_id: 'rule_1',
      total_amount_kobo: 60_000, reference: 'TXN-ABC',
      legs: [{ recipient: 'sub_1', amountKobo: 60_000 }],
      status: 'completed', merchant_id: 'merch_1',
    });
    const row = await transitionChargebackStatus(db, 'merch_1', cb.id, 'closed_lost');
    expect(row.status).toBe('closed_lost');
    // wallet debited + hold released
    expect(w.balance).toBe('150000');
    expect(w.reserved_balance).toBe('0');
    expect(h.walletTxs[0]).toMatchObject({
      type: 'debit', amount: '50000', reference: `chargeback_${cb.id}`, channel: 'chargeback',
    });
    // split reversal legs
    const rev = h.splitPayments.get('rev_sp_1');
    expect(rev).toBeTruthy();
    expect(rev.status).toBe('reversed');
    expect(rev.total_amount_kobo).toBe(-60_000);
    expect(rev.legs).toEqual([{ recipient: 'sub_1', amountKobo: -60_000 }]);
    expect(h.splitPayments.get('sp_1').status).toBe('reversed');
    expect(row.split_legs_reversed).toBe(1);
    // events
    expect(h.events.map((e) => e.event)).toEqual(
      expect.arrayContaining(['chargeback.closed_lost', 'split.reversed']),
    );
    // timeline recorded
    expect(h.timeline.length).toBeGreaterThan(0);
  });
});

// ─── H7: dispute guards + sweepers ────────────────────────────────────────────
describe('H7 disputes', () => {
  function seedDispute(over: any = {}) {
    const d = {
      id: `dsp_${h.disputes.size + 1}`, transfer_id: 'tr_1',
      initiated_by_dfsp_id: 'dfsp_a', responding_dfsp_id: 'dfsp_b',
      dispute_type: 'DUPLICATE', status: 'OPEN',
      amount_kobo: 75_000, currency: 'NGN', reason: 'duplicate payment',
      sla_deadline: new Date(Date.now() + 24 * 3600_000).toISOString(),
      created_at: new Date().toISOString(), updated_at: new Date().toISOString(),
      ...over,
    };
    h.disputes.set(d.id, d);
    return d;
  }

  it('resolveDispute double-resolve → CONFLICT', async () => {
    const d = seedDispute();
    const first: any = await dspCaller().resolveDispute({ disputeId: d.id, outcome: 'UPHELD' });
    expect(first.status).toBe('RESOLVED');
    await expect(dspCaller().resolveDispute({ disputeId: d.id, outcome: 'REJECTED' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('autoAcceptExpiredDisputes auto-accepts, debits the wallet, emits dispute.resolved', async () => {
    const d = seedDispute({ sla_deadline: new Date(Date.now() - 60_000).toISOString() });
    const open = seedDispute({ id: 'dsp_open' }); // not expired
    const w = seedWallet({ merchant_id: 'dfsp_b', balance: '100000' });
    const out = await autoAcceptExpiredDisputes();
    expect(out).toMatchObject({ scanned: 1, accepted: 1, errors: [] });
    expect(h.disputes.get(d.id).status).toBe('RESOLVED');
    expect(h.disputes.get(d.id).resolution).toBe('auto_accepted_sla');
    expect(h.disputes.get(open.id).status).toBe('OPEN');
    expect(w.balance).toBe('25000'); // 100_000 - 75_000
    expect(h.walletTxs[0]).toMatchObject({
      type: 'debit', amount: '75000', reference: `dispute_${d.id}`, channel: 'dispute',
    });
    expect(h.events.map((e) => e.event)).toContain('dispute.resolved');
  });

  it('autoAcceptExpiredDisputes fails loud per-row when no wallet exists', async () => {
    seedDispute({ sla_deadline: new Date(Date.now() - 60_000).toISOString() });
    const out = await autoAcceptExpiredDisputes();
    expect(out.accepted).toBe(0);
    expect(out.errors).toHaveLength(1);
    expect(out.errors[0].error).toMatch(/No wallet found/);
  });

  it('autoAcceptExpiredChargebacks closes past-due chargebacks as lost with wallet debit', async () => {
    const w = seedWallet({ balance: '200000', reserved_balance: '50000' });
    seedTx();
    const cb = seedChargeback({
      due_date: new Date(Date.now() - 60_000).toISOString(), amount_kobo: 50_000,
    });
    const out = await autoAcceptExpiredChargebacks();
    expect(out).toMatchObject({ scanned: 1, closed: 1, errors: [] });
    expect(h.chargebacks.get(cb.id).status).toBe('closed_lost');
    expect(w.balance).toBe('150000');
    expect(w.reserved_balance).toBe('0');
    expect(h.events.map((e) => e.event)).toContain('chargeback.closed_lost');
  });
});
