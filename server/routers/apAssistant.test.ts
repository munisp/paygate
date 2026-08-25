/**
 * apAssistant.test.ts
 * Vitest unit tests for the AP assistant tRPC router (P2-a).
 *
 * Mocking pattern follows hostedCheckout.test.ts / accountingSync.test.ts:
 * vi.mock drizzle/schema + server/db chainable mocks, vi.stubGlobal('fetch')
 * for the art-reasoning service boundary. The fake db records every insert /
 * update so tests can assert "ask never mutates AP state" and "confirmAction
 * never touches payout primitives".
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

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
      // Terminal await (e.g. select().from().where() with no limit).
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
  apBills: { __t: 'ap_bills' },
  vendors: { __t: 'vendors' },
  taxWithholdingRecords: { __t: 'tax_withholding_records' },
  aiAuditTrail: { __t: 'ai_audit_trail' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  asc: vi.fn((c: any) => ({ op: 'asc', c })),
  gte: vi.fn((c: any, v: any) => ({ op: 'gte', c, v })),
  lte: vi.fn((c: any, v: any) => ({ op: 'lte', c, v })),
  inArray: vi.fn((c: any, v: any) => ({ op: 'inArray', c, v })),
}));

vi.mock('../../server/db', () => ({
  db: h.fakeDb,
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open-1', name: 'Tester' })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7, tenantId: 'ten_1' })),
}));

vi.mock('../idempotency', () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
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
import { apAssistantRouter, __apAssistantInternals } from './apAssistant';

const ctx = {
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user' },
} as any;

const caller = apAssistantRouter.createCaller(ctx);

const fetchMock = vi.fn();

const TRACE_ID = 'aaaaaaaa-1111-2222-3333-bbbbbbbbbbbb';

function auditRowWithProposals(proposals: any[]) {
  return {
    id: TRACE_ID,
    transactionId: 'svc-trace-1',
    merchantId: 'merch_1',
    modelId: 'art-reasoning',
    decision: 'REVIEW',
    confidence: 0.8,
    features: JSON.stringify({ inputHash: 'hash', context: {}, proposals }),
    explanation: 'answer',
  };
}

const DRAFT_PROPOSAL = {
  type: 'draft_payment',
  billId: 'bill-1',
  amountKobo: 500_000,
  fundingMethod: 'wallet',
  rationale: 'due in 3 days',
};

beforeEach(() => {
  h.state.selects.length = 0;
  h.state.updateReturns.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
  fetchMock.mockReset();
  vi.stubGlobal('fetch', fetchMock);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── ask ──────────────────────────────────────────────────────────────────────
describe('apAssistant.ask', () => {
  it('returns answer + proposals + traceId and persists an ai_audit_trail row', async () => {
    // select order: upcoming bills, vendor ids, wht rows
    h.state.selects.push(
      [{ id: 'bill-1', status: 'approved', totalKobo: 500_000, dueDate: new Date() }],
      [{ id: 'v1' }, { id: 'v2' }],
      [{ taxAmountKobo: 10_000 }, { taxAmountKobo: 5_000 }],
    );
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({
        trace_id: 'svc-trace-1',
        answer: 'Pay vendor X first — it is due soonest.',
        confidence: 0.85,
        steps: [
          { action: 'query_bills', action_input: {} },
          { action: 'draft_payment', action_input: { billId: 'bill-1', amountKobo: 500_000, fundingMethod: 'wallet', rationale: 'due in 3 days' } },
        ],
        total_steps: 2,
        duration_ms: 420,
      }),
    });

    const res = await caller.ask({ question: 'Which bills should I pay first?' });

    expect(res.answer).toContain('vendor X');
    expect(res.traceId).toBeTruthy();
    expect(res.proposals).toHaveLength(1);
    expect(res.proposals[0]).toMatchObject({
      type: 'draft_payment', billId: 'bill-1', amountKobo: 500_000, fundingMethod: 'wallet',
    });

    // Service contract: proposal-only execution + internal auth header.
    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain('/v1/reason');
    expect(init.headers['X-Internal-Key']).toBeDefined();
    const body = JSON.parse(init.body);
    expect(body.constraints).toEqual({ execution: 'proposal_only' });
    expect(body.tools).toEqual(['query_bills', 'draft_payment', 'summarize_ap']);

    // Audit row persisted honestly.
    const auditInserts = h.calls.insert.filter((c) => c.table === 'ai_audit_trail');
    expect(auditInserts).toHaveLength(1);
    expect(auditInserts[0].values.modelId).toBe('art-reasoning');
    expect(auditInserts[0].values.decision).toBe('REVIEW');
    expect(auditInserts[0].values.transactionId).toBe('svc-trace-1');
    expect(JSON.parse(auditInserts[0].values.features).proposals).toHaveLength(1);
  });

  it('NEVER mutates AP state — zero UPDATEs and no writes to ap_bills/ap_payments', async () => {
    h.state.selects.push([], [], []);
    fetchMock.mockResolvedValue({
      ok: true,
      json: async () => ({ trace_id: 'svc-2', answer: 'ok', steps: [], total_steps: 1, duration_ms: 5 }),
    });

    await caller.ask({ question: 'Summarise my AP position' });

    expect(h.calls.update).toHaveLength(0);
    const mutatedTables = h.calls.insert.map((c) => c.table);
    expect(mutatedTables).not.toContain('ap_bills');
    expect(mutatedTables).not.toContain('ap_payments');
    expect(mutatedTables.every((t) => t === 'ai_audit_trail')).toBe(true);
  });

  it('propagates 503 when the reasoning service returns an HTTP error (no fabricated answer)', async () => {
    h.state.selects.push([], [], []);
    fetchMock.mockResolvedValue({ ok: false, status: 502 });

    const err = await caller.ask({ question: 'What is due this week?' }).catch((e) => e);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
    // No audit row persisted for a failed call — no fabricated trace.
    expect(h.calls.insert).toHaveLength(0);
  });

  it('propagates 503 when the reasoning service is unreachable', async () => {
    h.state.selects.push([], [], []);
    fetchMock.mockRejectedValue(new Error('connect ECONNREFUSED'));

    const err = await caller.ask({ question: 'What is due this week?' }).catch((e) => e);
    expect(err.code).toBe('SERVICE_UNAVAILABLE');
  });
});

// ─── confirmAction ────────────────────────────────────────────────────────────
describe('apAssistant.confirmAction', () => {
  const KEY = 'confirm-key-0001';

  it('validates the proposal and returns a payBill payload WITHOUT executing it', async () => {
    h.state.selects.push(
      [auditRowWithProposals([DRAFT_PROPOSAL])],
      [{ id: 'bill-1', merchantId: 'merch_1', status: 'approved', totalKobo: 1_000_000, amountPaidKobo: 0 }],
    );

    const res = await caller.confirmAction({ traceId: TRACE_ID, proposalIndex: 0, idempotencyKey: KEY });

    expect(res.requiresApproval).toBe(true);
    expect(res.nextStep).toBe('apBillPay.payBill');
    expect(res.validatedPayload).toMatchObject({
      billId: 'bill-1', amountKobo: 500_000, fundingMethod: 'wallet',
    });

    // The assistant must never bypass maker-checker: no payout primitives, no
    // AP mutations — zero inserts/updates issued by the confirm path itself.
    expect(h.calls.update).toHaveLength(0);
    expect(h.calls.insert).toHaveLength(0);
  });

  it('rejects a bill that is not in approved|partially_paid status', async () => {
    h.state.selects.push(
      [auditRowWithProposals([DRAFT_PROPOSAL])],
      [{ id: 'bill-1', merchantId: 'merch_1', status: 'draft', totalKobo: 1_000_000, amountPaidKobo: 0 }],
    );

    const err = await caller.confirmAction({ traceId: TRACE_ID, proposalIndex: 0, idempotencyKey: KEY }).catch((e) => e);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('draft');
    expect(h.calls.update).toHaveLength(0);
    expect(h.calls.insert).toHaveLength(0);
  });

  it('rejects a proposed amount above the remaining balance', async () => {
    h.state.selects.push(
      [auditRowWithProposals([DRAFT_PROPOSAL])],
      [{ id: 'bill-1', merchantId: 'merch_1', status: 'partially_paid', totalKobo: 600_000, amountPaidKobo: 200_000 }],
    );

    const err = await caller.confirmAction({ traceId: TRACE_ID, proposalIndex: 0, idempotencyKey: KEY }).catch((e) => e);
    expect(err.code).toBe('CONFLICT');
    expect(err.message).toContain('exceeds remaining');
  });

  it('rejects a trace owned by another merchant', async () => {
    h.state.selects.push([]); // ownership-scoped select returns nothing

    const err = await caller.confirmAction({ traceId: TRACE_ID, proposalIndex: 0, idempotencyKey: KEY }).catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });

  it('rejects an unknown proposal index', async () => {
    h.state.selects.push([auditRowWithProposals([DRAFT_PROPOSAL])]);

    const err = await caller.confirmAction({ traceId: TRACE_ID, proposalIndex: 5, idempotencyKey: KEY }).catch((e) => e);
    expect(err.code).toBe('BAD_REQUEST');
  });
});

// ─── getTrace ─────────────────────────────────────────────────────────────────
describe('apAssistant.getTrace', () => {
  it('returns the audit row and the service trace when available', async () => {
    h.state.selects.push([auditRowWithProposals([])]);
    fetchMock.mockResolvedValue({ ok: true, json: async () => ({ trace_id: 'svc-trace-1', steps: [] }) });

    const res = await caller.getTrace({ traceId: TRACE_ID });
    expect(res.audit.id).toBe(TRACE_ID);
    expect(res.serviceTrace).toMatchObject({ trace_id: 'svc-trace-1' });
    expect(String(fetchMock.mock.calls[0][0])).toContain('/v1/trace/svc-trace-1');
  });

  it('is non-fatal when the trace service is down (serviceTrace null)', async () => {
    h.state.selects.push([auditRowWithProposals([])]);
    fetchMock.mockRejectedValue(new Error('timeout'));

    const res = await caller.getTrace({ traceId: TRACE_ID });
    expect(res.audit.id).toBe(TRACE_ID);
    expect(res.serviceTrace).toBeNull();
  });

  it('enforces ownership', async () => {
    h.state.selects.push([]);
    const err = await caller.getTrace({ traceId: TRACE_ID }).catch((e) => e);
    expect(err.code).toBe('NOT_FOUND');
  });
});

// ─── internals ────────────────────────────────────────────────────────────────
describe('apAssistant internals', () => {
  it('extractProposals drops malformed draft_payment steps', () => {
    const proposals = __apAssistantInternals.extractProposals({
      trace_id: 't',
      answer: 'a',
      steps: [
        { action: 'draft_payment', action_input: { billId: 'b1', amountKobo: 100 } },
        { action: 'draft_payment', action_input: { billId: 'b2' } },          // no amount → dropped
        { action: 'draft_payment', action_input: { amountKobo: -5 } },        // no bill + bad amount → dropped
        { action: 'query_bills', action_input: {} },
      ],
    } as any);
    expect(proposals).toHaveLength(1);
    expect(proposals[0]).toMatchObject({ billId: 'b1', amountKobo: 100, fundingMethod: 'wallet' });
  });
});
