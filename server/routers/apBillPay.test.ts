/**
 * apBillPay.test.ts
 * Vitest unit tests for the P0-a AP bill payment tRPC router.
 * Mocking pattern follows server/routers/hostedCheckout.test.ts
 * (vi.mock drizzle/schema + chainable server/db + stripe) extended with
 * createCaller() through the full tRPC middleware chain.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Shared mock handles (referenced lazily by hoisted vi.mock factories) ─────

const mockComputeWht = vi.fn();
const mockWithIdempotency = vi.fn();
const mockGetUserByOpenId = vi.fn();
const mockGetMerchantByOwnerId = vi.fn();
const mockCreatePayout = vi.fn();
const mockUpdatePayout = vi.fn();
const mockCreatePaymentIntent = vi.fn();
const mockIsStripeConfigured = vi.fn();
const mockInitiatePayoutApproval = vi.fn();
const mockPublishEvent = vi.fn();
const mockAuditLog = vi.fn();
const mockRequirePermission = vi.fn();

/**
 * Thenable, chainable Drizzle query mock. Every intermediate method returns
 * the same object; terminal methods (limit/offset/returning) and awaiting the
 * chain itself resolve to `result`.
 */
function q(result: any) {
  const p = Promise.resolve(result);
  const self: any = {};
  self.then = (onFulfilled: any, onRejected: any) => p.then(onFulfilled, onRejected);
  for (const m of ['from', 'where', 'set', 'values', 'orderBy', 'groupBy', 'onConflictDoNothing']) {
    self[m] = vi.fn(() => self);
  }
  self.limit = vi.fn(() => p);
  self.offset = vi.fn(() => p);
  self.returning = vi.fn(() => p);
  return self;
}

const dbStub: any = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
  transaction: vi.fn(),
};
const txStub: any = {
  select: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

// ─── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  apBills: {},
  apBillLineItems: {},
  apPayments: {},
  vendorCredits: {},
  vendors: {},
  consumerWallets: {},
  idempotencyRequests: {},
}));

vi.mock('../../server/db', () => ({
  db: dbStub,
  getDb: vi.fn(async () => dbStub),
  getUserByOpenId: mockGetUserByOpenId,
  getMerchantByOwnerId: mockGetMerchantByOwnerId,
  createPayout: mockCreatePayout,
  updatePayout: mockUpdatePayout,
}));

vi.mock('../../server/idempotency', () => ({
  withIdempotency: mockWithIdempotency,
}));

vi.mock('./taxCompliance', () => ({
  computeBillWhtForBill: mockComputeWht,
}));

vi.mock('../../server/kafkaClient', () => ({
  publishEvent: mockPublishEvent,
}));

vi.mock('../../server/auditTrail', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('../../server/stripe', () => ({
  createPaymentIntent: mockCreatePaymentIntent,
  isStripeConfigured: mockIsStripeConfigured,
}));

vi.mock('../../server/middlewareBridge', () => ({
  initiatePayoutApproval: mockInitiatePayoutApproval,
}));

vi.mock('../../server/pbac', () => ({
  requirePermission: mockRequirePermission,
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import type { TrpcContext } from '../_core/context';

function makeCtx(userId = 99): TrpcContext {
  return {
    user: {
      id: userId,
      openId: `user-${userId}-open-id`,
      email: `user${userId}@test.com`,
      name: `User ${userId}`,
      role: 'admin',
      loginMethod: 'manus',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { origin: 'https://test.manus.space' }, protocol: 'https' } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  } as TrpcContext;
}

const MERCHANT = { id: 'merch_1', tenantId: 'ten_default', ownerId: 99 };

const BILL_APPROVED = {
  id: 'bill_1',
  merchantId: 'merch_1',
  vendorId: 'vend_1',
  billNumber: 'B-1001',
  status: 'approved',
  currency: 'NGN',
  subtotalKobo: 100000,
  taxKobo: 0,
  whtKobo: 0,
  totalKobo: 100000,
  amountPaidKobo: 0,
  createdBy: 1, // ≠ ctx.user.id (99) → maker≠checker satisfied
};

const VENDOR = {
  id: 'vend_1',
  merchantId: 'merch_1',
  name: 'Acme Supplies',
  bankCode: '058',
  accountNumber: '0123456789',
  accountName: 'Acme Supplies Ltd',
};

const CREATE_INPUT = {
  vendorId: 'vend_1',
  billNumber: 'B-1001',
  taxKobo: 0,
  lineItems: [
    { description: 'Consulting services', quantity: 2, unitPriceKobo: 50000 },
  ],
  idempotencyKey: 'idem-key-00000001',
};

// ─── Load SUT once (after all mocks are registered) ───────────────────────────

let apBillPayRouter: any;
let internals: any;
beforeAll(async () => {
  const mod = await import('./apBillPay');
  apBillPayRouter = mod.apBillPayRouter;
  internals = mod.__apBillPayInternals;
});

// ─── Default mock behaviour ───────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  for (const stub of [dbStub, txStub]) {
    stub.select.mockReset();
    stub.insert.mockReset();
    stub.update.mockReset();
    stub.delete.mockReset();
  }
  dbStub.transaction.mockReset();
  dbStub.transaction.mockImplementation(async (fn: any) => fn(txStub));

  mockGetUserByOpenId.mockResolvedValue({ id: 99, openId: 'user-99-open-id' });
  mockGetMerchantByOwnerId.mockResolvedValue(MERCHANT);
  mockWithIdempotency.mockImplementation((opts: any) => opts.execute());
  mockComputeWht.mockResolvedValue({ whtKobo: 0, whtRatePct: null, applied: false });
  mockPublishEvent.mockResolvedValue(true);
  mockAuditLog.mockResolvedValue(undefined);
  mockRequirePermission.mockResolvedValue(undefined);
  mockIsStripeConfigured.mockReturnValue(true);
  mockCreatePaymentIntent.mockResolvedValue({
    clientSecret: 'cs_test', paymentIntentId: 'pi_123', status: 'requires_payment_method',
  });
  mockCreatePayout.mockResolvedValue({ id: 'po_1' });
  mockUpdatePayout.mockResolvedValue({ id: 'po_1', status: 'failed' });
  mockInitiatePayoutApproval.mockResolvedValue({
    workflowId: 'wf_1', runId: 'run_1', status: 'pending', createdAt: new Date().toISOString(),
  });
});

// ─── createBill ───────────────────────────────────────────────────────────────

describe('apBillPay.createBill', () => {
  it('computes totals, invokes the WHT helper, and persists the bill', async () => {
    mockComputeWht.mockResolvedValue({ whtKobo: 5000, whtRatePct: 5, applied: true });
    const billRow = {
      ...BILL_APPROVED, status: 'draft', subtotalKobo: 100000,
      whtKobo: 5000, totalKobo: 95000,
    };
    const insertChain = q([billRow]);
    txStub.insert.mockReturnValueOnce(insertChain).mockReturnValueOnce(q([]));

    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.createBill(CREATE_INPUT);

    // WHT helper invoked with the contracted signature
    expect(mockComputeWht).toHaveBeenCalledWith({
      merchantId: 'merch_1',
      vendorId: 'vend_1',
      subtotalKobo: 100000, // 2 × 50,000
    });
    // Bill insert carries WHT + net total (subtotal + tax − wht)
    expect(insertChain.values).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merch_1',
      subtotalKobo: 100000,
      whtKobo: 5000,
      totalKobo: 95000,
      status: 'draft',
      idempotencyKey: CREATE_INPUT.idempotencyKey,
    }));
    expect(result.wht).toEqual({ whtKobo: 5000, whtRatePct: 5, applied: true });
    expect(mockPublishEvent).toHaveBeenCalledWith('paygate.ap.bills', expect.objectContaining({ type: 'created' }), 'bill_1');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({ action: 'ap_bill.created' }));
  });

  it('rejects with CONFLICT when the idempotency key was used with a different body', async () => {
    mockWithIdempotency.mockImplementationOnce(() => {
      throw new TRPCError({
        code: 'CONFLICT',
        message: "Idempotency key 'idem-key-00000001' was already used with a different request body.",
      });
    });
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.createBill(CREATE_INPUT)).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects idempotency keys shorter than 8 characters (input validation)', async () => {
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.createBill({ ...CREATE_INPUT, idempotencyKey: 'short' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockWithIdempotency).not.toHaveBeenCalled();
  });
});

// ─── approveBill — guarded transition + maker≠checker ────────────────────────

describe('apBillPay.approveBill', () => {
  it('approves a draft bill (no WHT) via the guarded flip', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'draft', createdBy: 1 }]));
    dbStub.update.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'approved' }]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.approveBill({ billId: 'bill_1' });
    expect(result.bill.status).toBe('approved');
    expect(mockRequirePermission).toHaveBeenCalled(); // pbac gate ran
  });

  it('rejects with CONFLICT when the guarded update matches no row (wrong status)', async () => {
    // Bill is already 'approved' — the WHERE status IN (draft, pending_approval)
    // guard matches nothing and RETURNING comes back empty.
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'approved' }]));
    dbStub.update.mockReturnValueOnce(q([]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.approveBill({ billId: 'bill_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('requires pending_approval when WHT is pending on the bill', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'draft', whtKobo: 5000 }]));
    dbStub.update.mockReturnValueOnce(q([])); // draft not in allowedFrom when WHT pending
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.approveBill({ billId: 'bill_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('enforces maker≠checker — the creator cannot approve their own bill', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'draft', createdBy: 99 }]));
    const caller = apBillPayRouter.createCaller(makeCtx(99));
    await expect(caller.approveBill({ billId: 'bill_1' })).rejects.toMatchObject({ code: 'FORBIDDEN' });
  });
});

// ─── voidBill — guarded transition ────────────────────────────────────────────

describe('apBillPay.voidBill', () => {
  it('voids a draft bill', async () => {
    dbStub.update.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'void' }]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.voidBill({ billId: 'bill_1' });
    expect(result.bill.status).toBe('void');
  });

  it('rejects with CONFLICT for a paid bill (guard matches no row)', async () => {
    dbStub.update.mockReturnValueOnce(q([]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.voidBill({ billId: 'bill_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});

// ─── payBill ──────────────────────────────────────────────────────────────────

describe('apBillPay.payBill', () => {
  it('rejects with NOT_FOUND when the bill belongs to another merchant (ownership)', async () => {
    dbStub.select.mockReturnValueOnce(q([])); // merchant-scoped lookup finds nothing
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.payBill({
      billId: 'bill_other_merchant', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000001',
    })).rejects.toMatchObject({ code: 'NOT_FOUND' });
    // Money path never touched
    expect(mockCreatePayout).not.toHaveBeenCalled();
    expect(mockInitiatePayoutApproval).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT when the bill is not in a payable status', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'draft' }]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.payBill({
      billId: 'bill_1', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000002',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('wallet path: debits wallet atomically, creates payout, initiates approval (0.5% fee)', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select
      .mockReturnValueOnce(q([]))                       // no open vendor credits
      .mockReturnValueOnce(q([{ id: 'w1', balanceKobo: 200000 }])) // wallet
      .mockReturnValueOnce(q([VENDOR]));                // vendor bank details
    const apPaymentRow = { id: 'apay_1', billId: 'bill_1', amountKobo: 100000, feeKobo: 500 };
    txStub.insert.mockReturnValueOnce(q([apPaymentRow]));
    txStub.update
      .mockReturnValueOnce(q([{ balanceKobo: 99500 }])) // guarded wallet debit (100000 + 500 fee)
      .mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'paid', amountPaidKobo: 100000 }])) // guarded bill progress
      .mockReturnValueOnce(q([apPaymentRow]));          // ap_payment payoutId backfill

    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.payBill({
      billId: 'bill_1', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000003',
    });

    expect(result.payoutId).toBe('po_1');
    expect(result.fundedKobo).toBe(100000);
    expect(result.feeKobo).toBe(500); // 0.5% flat payout fee
    expect(result.status).toBe('paid');
    expect(mockCreatePayout).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merch_1', amount: 100000, feeAmount: 500,
      bankCode: '058', accountNumber: '0123456789',
    }));
    expect(mockInitiatePayoutApproval).toHaveBeenCalledWith(expect.objectContaining({
      payoutId: 'po_1', merchantId: 'merch_1', amount: 100000,
    }));
    expect(mockPublishEvent).toHaveBeenCalledWith('paygate.ap.bills', expect.objectContaining({ type: 'payment_initiated' }), 'bill_1');
  });

  it('wallet path: insufficient balance aborts before any payout', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select
      .mockReturnValueOnce(q([]))
      .mockReturnValueOnce(q([{ id: 'w1', balanceKobo: 1000 }])); // too low — guarded debit returns nothing
    txStub.update.mockReturnValueOnce(q([])); // guarded debit matches no row

    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.payBill({
      billId: 'bill_1', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000004',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockCreatePayout).not.toHaveBeenCalled();
    expect(mockInitiatePayoutApproval).not.toHaveBeenCalled();
  });

  it('vendor credits cover the bill in full → paid with no payout', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select.mockReturnValueOnce(q([
      { id: 7, merchantId: 'merch_1', vendorId: 'vend_1', remainingKobo: 150000, status: 'open' },
    ]));
    txStub.update
      .mockReturnValueOnce(q([{ id: 7 }])) // atomic credit decrement (remaining 150000 ≥ 100000)
      .mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'paid', amountPaidKobo: 100000 }]));

    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.payBill({
      billId: 'bill_1', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000005',
    });

    expect(result.status).toBe('paid');
    expect(result.creditAppliedKobo).toBe(100000);
    expect(result.fundedKobo).toBe(0);
    expect(mockCreatePayout).not.toHaveBeenCalled();
    expect(mockInitiatePayoutApproval).not.toHaveBeenCalled();
  });

  it('card path: creates a Stripe PaymentIntent with ap_bill_funding metadata + 2.9% fee', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select.mockReturnValueOnce(q([])); // no credits
    dbStub.insert.mockReturnValueOnce(q([{ id: 'apay_card_1' }]));

    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.payBill({
      billId: 'bill_1', fundingMethod: 'card', idempotencyKey: 'idem-pay-00000006',
    });

    expect(mockCreatePaymentIntent).toHaveBeenCalledWith(expect.objectContaining({
      amountKobo: 100000 + 2900, // funded + 2.9% card fee
      currency: 'NGN',
      metadata: { type: 'ap_bill_funding', bill_id: 'bill_1' },
    }));
    expect(result.status).toBe('awaiting_card_payment');
    expect(result.feeKobo).toBe(2900);
    expect(result.paymentIntentId).toBe('pi_123');
    expect(result.feeDisclosure).toContain('2.9%');
  });

  it('rolls back and marks the payout failed when approval initiation throws', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select
      .mockReturnValueOnce(q([]))
      .mockReturnValueOnce(q([{ id: 'w1', balanceKobo: 200000 }]))
      .mockReturnValueOnce(q([VENDOR]));
    txStub.insert.mockReturnValueOnce(q([{ id: 'apay_1' }]));
    txStub.update
      .mockReturnValueOnce(q([{ balanceKobo: 99500 }]))
      .mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'paid' }]));
    mockInitiatePayoutApproval.mockRejectedValueOnce(new Error('bridge unavailable'));

    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.payBill({
      billId: 'bill_1', fundingMethod: 'wallet', idempotencyKey: 'idem-pay-00000007',
    })).rejects.toThrow('bridge unavailable');
    expect(mockUpdatePayout).toHaveBeenCalledWith('po_1', expect.objectContaining({ status: 'failed' }));
  });
});

// ─── payBillConfirm ───────────────────────────────────────────────────────────

describe('apBillPay.payBillConfirm', () => {
  it('dedups on the canonical stripe:pi_ reference for an already-processed PI', async () => {
    dbStub.select.mockReturnValueOnce(q([{
      id: 'apay_1', billId: 'bill_1', merchantId: 'merch_1',
      reference: 'stripe:pi_123', status: 'processing', payoutId: 'po_1',
      amountKobo: 100000, feeKobo: 2900,
    }]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    const result = await caller.payBillConfirm({ paymentIntentId: 'pi_123' });
    expect(result.deduplicated).toBe(true);
    expect(result.payoutId).toBe('po_1');
    expect(mockCreatePayout).not.toHaveBeenCalled();
  });

  it('rejects with NOT_FOUND when the payment reference belongs to another merchant', async () => {
    dbStub.select.mockReturnValueOnce(q([]));
    const caller = apBillPayRouter.createCaller(makeCtx());
    await expect(caller.payBillConfirm({ paymentIntentId: 'pi_other' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── Pure internals — fee schedule ────────────────────────────────────────────

describe('apBillPay fee schedule (__apBillPayInternals)', () => {
  it('card funding fee is 2.9%', () => {
    expect(internals.computeFundingFee('card', 100000)).toBe(2900);
    expect(internals.computeFundingFee('card', 100001)).toBe(2900); // rounds
  });

  it('wallet and bank_transfer use the flat 0.5% payout fee', () => {
    expect(internals.computeFundingFee('wallet', 100000)).toBe(500);
    expect(internals.computeFundingFee('bank_transfer', 100000)).toBe(500);
  });

  it('normalizeLineItems derives amountKobo from quantity × unit price', () => {
    const items = internals.normalizeLineItems([
      { description: 'A', quantity: 3, unitPriceKobo: 33333 },
    ]);
    expect(items[0].amountKobo).toBe(99999);
  });
});
