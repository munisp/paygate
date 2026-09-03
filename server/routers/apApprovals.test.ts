/**
 * apApprovals.test.ts
 * Vitest unit tests for the AP bill approval rules engine (Melio spec P1-a).
 * Mocking pattern follows hostedCheckout.test.ts / apBillInbox.test.ts
 * (vi.mock drizzle/schema + server/db chainable mocks, queued results).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state (hoisted so vi.mock factories can reference it) ───────
const h = vi.hoisted(() => ({
  // select(...) chains end in .limit(n) — each call shifts one queued result.
  selectQueue: [] as any[][],
  // update/delete(...) chains end in .returning() — each call shifts one.
  returningQueue: [] as any[][],
  insertedValues: [] as any[],
  updateSets: [] as any[],
  auditEvents: [] as any[],
  published: [] as any[],
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  apBills: {
    id: 'apBills.id', merchantId: 'apBills.merchantId', status: 'apBills.status',
    vendorId: 'apBills.vendorId', createdAt: 'apBills.createdAt',
  },
  apBillApprovalRules: {
    id: 'rules.id', merchantId: 'rules.merchantId', priority: 'rules.priority',
    isActive: 'rules.isActive',
  },
  apBillApprovals: {
    id: 'approvals.id', billId: 'approvals.billId', step: 'approvals.step',
    approverUserId: 'approvals.approverUserId', status: 'approvals.status',
  },
  merchantNotifications: { id: 'notifications.id', merchantId: 'notifications.merchantId' },
  users: { id: 'users.id', email: 'users.email', name: 'users.name' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ op: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  asc: vi.fn((c: any) => ({ op: 'asc', c })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
  inArray: vi.fn((...a: any[]) => ({ op: 'inArray', a })),
}));

vi.mock('../../server/db', () => {
  // Fresh query-builder object per select() — thenable so chains without a
  // .limit() terminal resolve to the next queued select result when awaited.
  function makeSelectQuery(): any {
    const q: any = {};
    q.from = vi.fn(() => q);
    q.where = vi.fn(() => q);
    q.orderBy = vi.fn(() => q);
    q.innerJoin = vi.fn(() => q);
    q.limit = vi.fn(async () => (h.selectQueue.length ? h.selectQueue.shift()! : []));
    q.then = (resolve: any, reject: any) => {
      const v = h.selectQueue.length ? h.selectQueue.shift()! : [];
      return Promise.resolve(v).then(resolve, reject);
    };
    return q;
  }
  const db: any = {};
  db.select = vi.fn(() => makeSelectQuery());
  db.insert = vi.fn(() => ({
    values: vi.fn(async (v: any) => { h.insertedValues.push(v); return []; }),
  }));
  db.update = vi.fn(() => {
    const u: any = {};
    u.set = vi.fn((v: any) => { h.updateSets.push(v); return u; });
    u.where = vi.fn(() => u);
    u.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return u;
  });
  db.delete = vi.fn(() => {
    const d: any = {};
    d.where = vi.fn(() => d);
    d.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return d;
  });
  db.transaction = vi.fn(async (fn: any) => fn(db));
  return {
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async (openId: string) => ({ id: 7, openId, name: 'Approver', email: 'a@example.com' })),
    getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 99 })),
  };
});

vi.mock('../../server/pbac', () => ({
  requirePermission: vi.fn(async () => undefined),
}));

vi.mock('../../server/auditTrail', () => ({
  auditLog: vi.fn(async (e: any) => { h.auditEvents.push(e); }),
}));

vi.mock('../../server/emailService', () => ({
  sendEmail: vi.fn(async () => true),
}));

vi.mock('../../server/kafkaClient', () => ({
  publishEvent: vi.fn(async (topic: string, payload: any) => { h.published.push({ topic, payload }); return true; }),
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { apApprovalsRouter, __approvalInternals } from './apApprovals';

const { evaluateApprovalChain, defaultApprovalChain, approveStepCore, rejectStepCore } =
  __approvalInternals;

const approverCtx: any = {
  user: { id: 7, openId: 'open_7', name: 'Approver', email: 'a@example.com', role: 'admin' },
  req: { headers: {} },
  res: {},
};

function makeCaller(ctx: any = approverCtx) {
  return apApprovalsRouter.createCaller(ctx);
}

/** Bill in pending_approval created by someone else (user 1), approver is 7. */
const billRow = {
  id: 'bill-1', merchantId: 'merch_1', vendorId: 'v1', billNumber: 'INV-001',
  status: 'pending_approval', totalKobo: 3000, createdBy: 1,
};

beforeEach(() => {
  h.selectQueue = [];
  h.returningQueue = [];
  h.insertedValues = [];
  h.updateSets = [];
  h.auditEvents = [];
  h.published = [];
  vi.clearAllMocks();
});

// ─── evaluateApprovalChain (pure) ─────────────────────────────────────────────

describe('evaluateApprovalChain (pure)', () => {
  it('orders matched rules by priority ASC into 1-based steps', () => {
    const chain = evaluateApprovalChain({ totalKobo: 1000, vendorId: null }, [
      { id: 3, priority: 10, approverUserId: 30 },
      { id: 1, priority: 1, approverUserId: 10 },
      { id: 2, priority: 5, approverUserId: 20 },
    ]);
    expect(chain.map((s) => s.step)).toEqual([1, 2, 3]);
    expect(chain.map((s) => s.approverUserId)).toEqual([10, 20, 30]);
    expect(chain.map((s) => s.ruleId)).toEqual([1, 2, 3]);
  });

  it('breaks priority ties by rule id', () => {
    const chain = evaluateApprovalChain({ totalKobo: 1000 }, [
      { id: 9, priority: 0, approverUserId: 90 },
      { id: 4, priority: 0, approverUserId: 40 },
    ]);
    expect(chain.map((s) => s.ruleId)).toEqual([4, 9]);
  });

  it('enforces the amount range (min inclusive lower, max inclusive upper)', () => {
    const rules = [
      { id: 1, minAmountKobo: 1000, maxAmountKobo: 5000, approverUserId: 10 },
      { id: 2, minAmountKobo: 5001, approverUserId: 20 },
    ];
    // below min of rule 1, below min of rule 2 → none
    expect(evaluateApprovalChain({ totalKobo: 500 }, rules)).toEqual([]);
    // inside rule 1 range only
    expect(evaluateApprovalChain({ totalKobo: 3000 }, rules).map((s) => s.ruleId)).toEqual([1]);
    // above max of rule 1, inside rule 2
    expect(evaluateApprovalChain({ totalKobo: 9000 }, rules).map((s) => s.ruleId)).toEqual([2]);
    // null bounds are unbounded
    expect(evaluateApprovalChain({ totalKobo: 1 }, [{ id: 5 }] as any).map((s) => s.ruleId)).toEqual([5]);
  });

  it('matches vendorId exactly; null rule vendorId is a wildcard', () => {
    const rules = [
      { id: 1, vendorId: 'v1', approverUserId: 10 },
      { id: 2, vendorId: null, approverUserId: 20 },
    ];
    expect(evaluateApprovalChain({ totalKobo: 100, vendorId: 'v1' }, rules).map((s) => s.ruleId)).toEqual([1, 2]);
    expect(evaluateApprovalChain({ totalKobo: 100, vendorId: 'v2' }, rules).map((s) => s.ruleId)).toEqual([2]);
  });

  it('skips inactive rules and clamps requiredApprovals to 1..5', () => {
    const chain = evaluateApprovalChain({ totalKobo: 100 }, [
      { id: 1, isActive: false, approverUserId: 10 },
      { id: 2, requiredApprovals: 9, approverUserId: 20 },
    ]);
    expect(chain).toHaveLength(1);
    expect(chain[0].ruleId).toBe(2);
    expect(chain[0].requiredApprovals).toBe(5);
  });

  it('returns [] when nothing matches (caller applies default admin step)', () => {
    expect(evaluateApprovalChain({ totalKobo: 100 }, [])).toEqual([]);
    const def = defaultApprovalChain(99);
    expect(def).toHaveLength(1);
    expect(def[0]).toMatchObject({ step: 1, approverUserId: 99, approverRole: 'admin', requiredApprovals: 1 });
  });
});

// ─── approveStepCore (guarded decision) ───────────────────────────────────────

describe('approveStepCore', () => {
  async function getDb() {
    const { getDb } = await import('../../server/db');
    return getDb();
  }

  it('rejects maker = checker with FORBIDDEN before any write', async () => {
    h.selectQueue = [[{ ...billRow, createdBy: 7 }]];
    const db = await getDb();
    await expect(approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7,
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
    // No approval UPDATE was attempted (bill select consumed, no .set calls).
    expect(h.updateSets).toHaveLength(0);
  });

  it('rejects a wrong approver (empty guarded RETURNING) with CONFLICT', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }]];
    h.returningQueue = [[]]; // guarded UPDATE matched nothing
    const db = await getDb();
    await expect(approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 42,
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects a double-approve (row already decided) with CONFLICT', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }]];
    h.returningQueue = [[]]; // second approval finds no pending row
    const db = await getDb();
    await expect(approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7,
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects when no pending step exists with CONFLICT', async () => {
    h.selectQueue = [[billRow], []]; // no open step
    const db = await getDb();
    await expect(approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7,
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('throws NOT_FOUND for an unknown bill', async () => {
    h.selectQueue = [[]];
    const db = await getDb();
    await expect(approveStepCore(db, {
      merchantId: 'merch_1', billId: 'nope', approverUserId: 7,
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });

  it('flips the bill to approved when the last step is approved', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }], []]; // bill, open step, no remaining pending
    h.returningQueue = [[{ id: 11, status: 'approved' }], [{ ...billRow, status: 'approved' }]];
    const db = await getDb();
    const result = await approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7, notes: 'ok',
    });
    expect(result).toMatchObject({ billId: 'bill-1', step: 1, billApproved: true });
    // First .set = approval decision; second .set = bill flip to approved.
    expect(h.updateSets[0]).toMatchObject({ status: 'approved', notes: 'ok' });
    expect(h.updateSets[1]).toMatchObject({ status: 'approved' });
  });

  it('does NOT flip the bill while later steps remain pending', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }], [{ step: 2 }]]; // step 2 still pending
    h.returningQueue = [[{ id: 11, status: 'approved' }]];
    const db = await getDb();
    const result = await approveStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7,
    });
    expect(result.billApproved).toBe(false);
    expect(h.updateSets).toHaveLength(1); // only the approval decision, no bill flip
  });
});

// ─── rejectStepCore ───────────────────────────────────────────────────────────

describe('rejectStepCore', () => {
  async function getDb() {
    const { getDb } = await import('../../server/db');
    return getDb();
  }

  it('rejects the bill and records the decision', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }]];
    h.returningQueue = [[{ id: 11, status: 'rejected' }], [{ ...billRow, status: 'rejected' }]];
    const db = await getDb();
    const result = await rejectStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7, notes: 'amount mismatch',
    });
    expect(result).toMatchObject({ billId: 'bill-1', step: 1, billRejected: true });
    expect(h.updateSets[0]).toMatchObject({ status: 'rejected', notes: 'amount mismatch' });
    expect(h.updateSets[1]).toMatchObject({ status: 'rejected' });
  });

  it('enforces maker ≠ checker on rejection too', async () => {
    h.selectQueue = [[{ ...billRow, createdBy: 7 }]];
    const db = await getDb();
    await expect(rejectStepCore(db, {
      merchantId: 'merch_1', billId: 'bill-1', approverUserId: 7, notes: 'bad bill',
    })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── Router-level (createCaller through pbac middleware) ─────────────────────

describe('apApprovalsRouter.approveStep', () => {
  it('approves the last step and emits audit events for decision + bill flip', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }], []];
    h.returningQueue = [[{ id: 11, status: 'approved' }], [{ ...billRow, status: 'approved' }]];
    const caller = makeCaller();
    const result = await caller.approveStep({ billId: 'bill-1', notes: 'lgtm' });
    expect(result).toMatchObject({ billId: 'bill-1', step: 1, billApproved: true });
    const actions = h.auditEvents.map((e) => e.action);
    expect(actions).toContain('ap_bill.approval_step_approved');
    expect(actions).toContain('ap_bill.approved');
    expect(h.published.some((p) => p.topic === 'paygate.ap.bills' && p.payload.type === 'ap_bill.approved')).toBe(true);
  });

  it('propagates FORBIDDEN for maker = checker', async () => {
    h.selectQueue = [[{ ...billRow, createdBy: 7 }]];
    const caller = makeCaller();
    await expect(caller.approveStep({ billId: 'bill-1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });

  it('requires an authenticated user', async () => {
    const caller = makeCaller({ ...approverCtx, user: null });
    await expect(caller.approveStep({ billId: 'bill-1' })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('apApprovalsRouter.rejectStep', () => {
  it('rejects and notifies the creator via merchant_notifications', async () => {
    h.selectQueue = [[billRow], [{ step: 1 }]];
    h.returningQueue = [[{ id: 11, status: 'rejected' }], [{ ...billRow, status: 'rejected' }]];
    const caller = makeCaller();
    const result = await caller.rejectStep({ billId: 'bill-1', notes: 'duplicate invoice' });
    expect(result).toMatchObject({ billId: 'bill-1', step: 1, billRejected: true });
    const notif = h.insertedValues.find((v) => v && v.type === 'ap_bill_rejected');
    expect(notif).toBeTruthy();
    expect(notif.merchantId).toBe('merch_1');
    expect(h.auditEvents.map((e) => e.action)).toContain('ap_bill.rejected');
  });

  it('requires rejection notes (min 3 chars)', async () => {
    const caller = makeCaller();
    await expect(caller.rejectStep({ billId: 'bill-1', notes: 'x' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });
});

describe('apApprovalsRouter.batchApprove', () => {
  it('isolates per-bill failures and reports per-bill results', async () => {
    // bill-1 succeeds (last step → bill flip); bill-2 fails (wrong approver → empty RETURNING).
    h.selectQueue = [
      [billRow], [{ step: 1 }], [],           // bill-1: bill, open step, no remaining
      [{ ...billRow, id: 'bill-2' }], [{ step: 1 }], // bill-2: bill, open step
    ];
    h.returningQueue = [
      [{ id: 11, status: 'approved' }], [{ ...billRow, status: 'approved' }], // bill-1 writes
      [], // bill-2 guarded update matches nothing
    ];
    const caller = makeCaller();
    const { results } = await caller.batchApprove({ billIds: ['bill-1', 'bill-2'] });
    expect(results).toHaveLength(2);
    expect(results[0]).toMatchObject({ billId: 'bill-1', ok: true });
    expect(results[1]).toMatchObject({ billId: 'bill-2', ok: false });
    expect(results[1].error).toBeTruthy();
  });
});

describe('apApprovalsRouter.submitForApproval', () => {
  it('flips draft → pending_approval, inserts chain rows and notifies approvers', async () => {
    // 1: bill select; 2: rules select; 3+: notification/user lookups (non-fatal).
    h.selectQueue = [
      [{ ...billRow, status: 'draft', createdBy: 7 }],
      [{ id: 1, priority: 1, minAmountKobo: 0, maxAmountKobo: null, vendorId: null, approverUserId: 42, approverRole: 'finance', requiredApprovals: 1, isActive: true }],
      [{ id: 42, email: 'cfo@example.com', name: 'CFO' }],
    ];
    h.returningQueue = [[{ ...billRow, status: 'pending_approval' }]];
    const caller = makeCaller();
    const result = await caller.submitForApproval({ billId: 'bill-1' });
    expect(result).toMatchObject({ billId: 'bill-1', status: 'pending_approval', steps: 1 });
    const approvalRow = h.insertedValues.find((v) => v && v.billId === 'bill-1' && v.status === 'pending');
    expect(approvalRow).toMatchObject({ billId: 'bill-1', step: 1, approverUserId: 42, status: 'pending' });
    const notif = h.insertedValues.find((v) => v && v.type === 'ap_bill_approval_requested');
    expect(notif).toBeTruthy();
    expect(h.auditEvents.map((e) => e.action)).toContain('ap_bill.submitted_for_approval');
    expect(h.published.some((p) => p.payload.type === 'ap_bill.submitted_for_approval')).toBe(true);
  });

  it('falls back to the default merchant-admin (owner) step when no rule matches', async () => {
    h.selectQueue = [
      [{ ...billRow, status: 'draft', createdBy: 7 }],
      [], // no rules
      [{ id: 99, email: 'owner@example.com', name: 'Owner' }],
    ];
    h.returningQueue = [[{ ...billRow, status: 'pending_approval' }]];
    const caller = makeCaller();
    const result = await caller.submitForApproval({ billId: 'bill-1' });
    expect(result.steps).toBe(1);
    const approvalRow = h.insertedValues.find((v) => v && v.billId === 'bill-1' && v.status === 'pending');
    expect(approvalRow.approverUserId).toBe(99); // merchant owner fallback
  });

  it('rejects with CONFLICT when the bill is not draft/extracted (empty guarded RETURNING)', async () => {
    h.selectQueue = [[{ ...billRow, status: 'paid', createdBy: 7 }]];
    h.returningQueue = [[]];
    const caller = makeCaller();
    await expect(caller.submitForApproval({ billId: 'bill-1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

describe('apApprovalsRouter rule CRUD validation', () => {
  it('createRule rejects maxAmountKobo <= minAmountKobo', async () => {
    const caller = makeCaller();
    await expect(caller.createRule({
      name: 'Bad range', priority: 0, minAmountKobo: 5000, maxAmountKobo: 5000,
      requiredApprovals: 1, isActive: true,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('createRule rejects requiredApprovals outside 1..5', async () => {
    const caller = makeCaller();
    await expect(caller.createRule({
      name: 'Too many', priority: 0, minAmountKobo: 0, requiredApprovals: 6, isActive: true,
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('deleteRule throws NOT_FOUND when nothing is deleted', async () => {
    h.returningQueue = [[]];
    const caller = makeCaller();
    await expect(caller.deleteRule({ ruleId: 123 })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});
