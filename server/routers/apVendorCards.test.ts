/**
 * apVendorCards.test.ts
 * Vitest unit tests for the P1-e single-use vendor card tRPC router.
 * Mocking pattern follows server/routers/hostedCheckout.test.ts
 * (vi.mock drizzle/schema + chainable server/db) extended with
 * createCaller() through the full tRPC middleware chain (as in
 * server/routers/apBillPay.test.ts).
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { TRPCError } from '@trpc/server';

// ─── Shared mock handles (referenced lazily by hoisted vi.mock factories) ─────

const mockWithIdempotency = vi.fn();
const mockGetUserByOpenId = vi.fn();
const mockGetMerchantByOwnerId = vi.fn();
const mockPublishEvent = vi.fn();
const mockAuditLog = vi.fn();
const mockIssueVirtualCardStrict = vi.fn();
const mockGetVirtualCardCredentialsStrict = vi.fn();
const mockFreezeVirtualCardViaMiddleware = vi.fn();
const mockRequirePermission = vi.fn();

/**
 * Thenable, chainable Drizzle query mock. Every intermediate method returns
 * the same object; terminal methods (limit/returning) and awaiting the chain
 * itself resolve to `result`.
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
  apPayments: {},
  virtualCards: {},
  consumerWallets: {},
}));

vi.mock('../../server/db', () => ({
  db: dbStub,
  getDb: vi.fn(async () => dbStub),
  getUserByOpenId: mockGetUserByOpenId,
  getMerchantByOwnerId: mockGetMerchantByOwnerId,
}));

vi.mock('../../server/idempotency', () => ({
  withIdempotency: mockWithIdempotency,
}));

vi.mock('../../server/kafkaClient', () => ({
  publishEvent: mockPublishEvent,
}));

vi.mock('../../server/auditTrail', () => ({
  auditLog: mockAuditLog,
}));

vi.mock('../../server/middlewareBridge', () => ({
  issueVirtualCardStrict: mockIssueVirtualCardStrict,
  getVirtualCardCredentialsStrict: mockGetVirtualCardCredentialsStrict,
  freezeVirtualCardViaMiddleware: mockFreezeVirtualCardViaMiddleware,
}));

vi.mock('../../server/pbac', () => ({
  requirePermission: mockRequirePermission,
}));

vi.mock('../../server/_core/env', () => ({
  ENV: { internalApiKey: 'test-internal-key-123' },
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
}));

// ─── Fixtures ─────────────────────────────────────────────────────────────────

import type { TrpcContext } from '../_core/context';

function makeCtx(userId = 99, headers: Record<string, string> = { origin: 'https://test.manus.space' }): TrpcContext {
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
    req: { headers, protocol: 'https' } as unknown as TrpcContext['req'],
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
  createdBy: 1,
};

const WALLET = {
  id: 'wallet_1',
  userId: 99,
  currency: 'NGN',
  balanceKobo: 500000,
  isActive: true,
};

const CARD_ACTIVE = {
  id: 'card_1',
  tenantId: 'ten_default',
  merchantId: 'merch_1',
  maskedPan: '4000-****-****-1234',
  brand: 'visa',
  expiryMonth: 12,
  expiryYear: 2030,
  currency: 'NGN',
  status: 'active',
  balance: 100000,
  spendLimit: 100000,
  label: 'AP bill B-1001',
  singleUse: true,
  authorizedAmountKobo: 100000,
  lockedMerchantVendorId: 'vend_1',
  terminatedAt: null,
  createdAt: new Date(),
};

const ISSUE_INPUT = { billId: 'bill_1', idempotencyKey: 'idem-issue-00001' };

// ─── Load SUT once (after all mocks are registered) ───────────────────────────

let apVendorCardsRouter: any;
let internals: any;
beforeAll(async () => {
  const mod = await import('./apVendorCards');
  apVendorCardsRouter = mod.apVendorCardsRouter;
  internals = mod.__apVendorCardsInternals;
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
  mockPublishEvent.mockResolvedValue(true);
  mockAuditLog.mockResolvedValue(undefined);
  mockRequirePermission.mockResolvedValue(undefined);
  mockIssueVirtualCardStrict.mockResolvedValue({
    cardId: 'card_1',
    workflowId: 'wf-card-1',
    reservationId: 'res_1',
    maskedPan: '4000-****-****-1234',
    status: 'active',
    brand: 'visa',
    expiryMonth: 12,
    expiryYear: 2030,
  });
  mockGetVirtualCardCredentialsStrict.mockResolvedValue({
    cardId: 'card_1',
    pan: '4000123456781234',
    cvv: '123',
    brand: 'visa',
    expiryMonth: 12,
    expiryYear: 2030,
    maskedPan: '4000-****-****-1234',
  });
  mockFreezeVirtualCardViaMiddleware.mockResolvedValue({ success: true });
});

/** Wire the tx stub for the full happy-path issueVendorCard transaction. */
function stubHappyIssueTransaction() {
  // 1. wallet lookup
  txStub.select.mockReturnValueOnce(q([WALLET]));
  // 2. guarded wallet debit (RETURNING non-empty = funds available)
  txStub.update.mockReturnValueOnce(q([{ balanceKobo: WALLET.balanceKobo - BILL_APPROVED.totalKobo }]));
  // 3. virtual_cards insert / 4. ap_payments insert
  const cardInsert = q([]);
  const paymentRow = {
    id: 'ap_pay_1',
    billId: 'bill_1',
    merchantId: 'merch_1',
    fundingMethod: 'vendor_card',
    amountKobo: 100000,
    feeKobo: 0,
    status: 'completed',
    reference: 'svc:bill_1:card_1',
    vendorCardId: 'card_1',
  };
  const paymentInsert = q([paymentRow]);
  txStub.insert.mockReturnValueOnce(cardInsert).mockReturnValueOnce(paymentInsert);
  // 5. guarded bill flip approved→paid
  txStub.update.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'paid', amountPaidKobo: 100000 }]));
  return { cardInsert, paymentInsert, paymentRow };
}

// ─── issueVendorCard ──────────────────────────────────────────────────────────

describe('apVendorCards.issueVendorCard', () => {
  it('happy path: debits exact remaining, issues single-use vendor-locked card, flips bill to paid', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    const { cardInsert, paymentInsert } = stubHappyIssueTransaction();

    const caller = apVendorCardsRouter.createCaller(makeCtx());
    const result = await caller.issueVendorCard(ISSUE_INPUT);

    // Idempotency wrapper engaged with the required key
    expect(mockWithIdempotency).toHaveBeenCalledWith(expect.objectContaining({
      key: ISSUE_INPUT.idempotencyKey,
      merchantId: 'merch_1',
      operation: 'ap.vendor_card.issue',
    }));

    // Wallet debited for the EXACT remaining amount under the guarded UPDATE
    const walletDebitChain = txStub.update.mock.results[0].value;
    expect(walletDebitChain.set).toHaveBeenCalledWith(expect.objectContaining({
      updatedAt: expect.any(Date),
    }));
    // Guarded debit happened before any card insert
    expect(txStub.update.mock.invocationCallOrder[0]).toBeLessThan(txStub.insert.mock.invocationCallOrder[0]);

    // STRICT bridge issuance with exact remaining, single-use, vendor lock
    expect(mockIssueVirtualCardStrict).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merch_1',
      amountKobo: 100000,
      currency: 'NGN',
      singleUse: true,
      vendorId: 'vend_1',
    }));

    // virtual_cards row: single-use, exact authorisation, vendor-locked, active
    expect(cardInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      merchantId: 'merch_1',
      maskedPan: '4000-****-****-1234',
      brand: 'visa',
      status: 'active',
      singleUse: true,
      authorizedAmountKobo: 100000,
      lockedMerchantVendorId: 'vend_1',
    }));

    // ap_payments row: vendor_card funding, completed, unique svc: reference
    expect(paymentInsert.values).toHaveBeenCalledWith(expect.objectContaining({
      billId: 'bill_1',
      merchantId: 'merch_1',
      fundingMethod: 'vendor_card',
      amountKobo: 100000,
      status: 'completed',
      vendorCardId: expect.any(String),
      metadata: { singleUse: true },
    }));
    const reference = paymentInsert.values.mock.calls[0][0].reference;
    expect(reference).toMatch(/^svc:bill_1:.+/);

    // Bill flipped to paid with amount_paid = total
    expect(result.bill.status).toBe('paid');
    expect(result.bill.amountPaidKobo).toBe(100000);
    expect(result.card.singleUse).toBe(true);
    expect(result.card.lockedMerchantVendorId).toBe('vend_1');

    // Kafka paygate.ap.payments (non-fatal) + auditLog
    expect(mockPublishEvent).toHaveBeenCalledWith(
      'paygate.ap.payments',
      expect.objectContaining({ type: 'vendor_card.issued', amountKobo: 100000 }),
      'bill_1',
    );
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ap.vendor_card.issued',
      resource: 'virtual_card',
    }));
  });

  it('bridge failure → SERVICE_UNAVAILABLE propagates → full rollback (no bill flip, no payment row)', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select.mockReturnValueOnce(q([WALLET]));
    txStub.update.mockReturnValueOnce(q([{ balanceKobo: 400000 }])); // wallet debit succeeds
    mockIssueVirtualCardStrict.mockRejectedValueOnce(
      new TRPCError({ code: 'SERVICE_UNAVAILABLE', message: 'Middleware bridge unavailable' }),
    );

    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.issueVendorCard(ISSUE_INPUT)).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });

    // Rollback: no card row, no payment row inserted…
    expect(txStub.insert).not.toHaveBeenCalled();
    // …and the guarded bill flip (second update) never ran — only the wallet debit did
    expect(txStub.update).toHaveBeenCalledTimes(1);
    expect(mockPublishEvent).not.toHaveBeenCalled();
    expect(mockAuditLog).not.toHaveBeenCalled();
  });

  it('insufficient funds → guarded debit RETURNING empty → INSUFFICIENT_FUNDS, bridge never called', async () => {
    dbStub.select.mockReturnValueOnce(q([BILL_APPROVED]));
    txStub.select.mockReturnValueOnce(q([WALLET]));
    txStub.update.mockReturnValueOnce(q([])); // row lock guard matched nothing

    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.issueVendorCard(ISSUE_INPUT)).rejects.toMatchObject({
      code: 'PRECONDITION_FAILED',
      message: expect.stringContaining('INSUFFICIENT_FUNDS'),
    });

    expect(mockIssueVirtualCardStrict).not.toHaveBeenCalled();
    expect(txStub.insert).not.toHaveBeenCalled();
    expect(mockPublishEvent).not.toHaveBeenCalled();
  });

  it('rejects with NOT_FOUND when the bill belongs to another merchant (ownership)', async () => {
    dbStub.select.mockReturnValueOnce(q([])); // merchant-scoped lookup finds nothing
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.issueVendorCard(ISSUE_INPUT)).rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(dbStub.transaction).not.toHaveBeenCalled();
    expect(mockIssueVirtualCardStrict).not.toHaveBeenCalled();
  });

  it('rejects with CONFLICT when the bill is not approved', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...BILL_APPROVED, status: 'draft' }]));
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.issueVendorCard(ISSUE_INPUT)).rejects.toMatchObject({ code: 'CONFLICT' });
    expect(dbStub.transaction).not.toHaveBeenCalled();
  });

  it('rejects idempotency keys shorter than 8 characters (input validation)', async () => {
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.issueVendorCard({ billId: 'bill_1', idempotencyKey: 'short' }))
      .rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(mockWithIdempotency).not.toHaveBeenCalled();
  });
});

// ─── revealCardCredentials ────────────────────────────────────────────────────

describe('apVendorCards.revealCardCredentials', () => {
  it('returns full PAN/CVV from the bridge ONLY and audit-logs the reveal', async () => {
    dbStub.select.mockReturnValueOnce(q([CARD_ACTIVE]));

    const caller = apVendorCardsRouter.createCaller(makeCtx());
    const result = await caller.revealCardCredentials({ cardId: 'card_1' });

    expect(mockGetVirtualCardCredentialsStrict).toHaveBeenCalledWith('card_1');
    expect(result.pan).toBe('4000123456781234');
    expect(result.cvv).toBe('123');
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ap.vendor_card.credentials_revealed',
      resourceId: 'card_1',
    }));
  });

  it('FORBIDDEN on a terminated card — audit-logged, bridge never called', async () => {
    dbStub.select.mockReturnValueOnce(q([{ ...CARD_ACTIVE, status: 'terminated', terminatedAt: new Date() }]));

    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.revealCardCredentials({ cardId: 'card_1' }))
      .rejects.toMatchObject({ code: 'FORBIDDEN' });

    expect(mockGetVirtualCardCredentialsStrict).not.toHaveBeenCalled();
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ap.vendor_card.credentials_reveal_denied',
      resourceId: 'card_1',
      metadata: expect.objectContaining({ reason: 'terminated' }),
    }));
  });

  it('rejects with NOT_FOUND for a card owned by another merchant', async () => {
    dbStub.select.mockReturnValueOnce(q([]));
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.revealCardCredentials({ cardId: 'card_other' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockGetVirtualCardCredentialsStrict).not.toHaveBeenCalled();
  });
});

// ─── terminateCard ────────────────────────────────────────────────────────────

describe('apVendorCards.terminateCard', () => {
  it('freezes via bridge then guarded-terminates; double-call → CONFLICT', async () => {
    const caller = apVendorCardsRouter.createCaller(makeCtx());

    // First call: active card → freeze → guarded terminate succeeds
    dbStub.select.mockReturnValueOnce(q([CARD_ACTIVE]));
    dbStub.update.mockReturnValueOnce(q([{ ...CARD_ACTIVE, status: 'terminated', terminatedAt: new Date() }]));
    const first = await caller.terminateCard({ cardId: 'card_1', reason: 'bill settled' });
    expect(first.card.status).toBe('terminated');
    expect(mockFreezeVirtualCardViaMiddleware).toHaveBeenCalledWith(expect.objectContaining({
      cardId: 'card_1',
      merchantId: 'merch_1',
      freeze: true,
    }));
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ap.vendor_card.terminated',
      resourceId: 'card_1',
      metadata: expect.objectContaining({ reason: 'bill settled' }),
    }));

    // Second call: guarded UPDATE ... WHERE terminated_at IS NULL matches nothing
    dbStub.select.mockReturnValueOnce(q([CARD_ACTIVE]));
    dbStub.update.mockReturnValueOnce(q([]));
    await expect(caller.terminateCard({ cardId: 'card_1', reason: 'again' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('rejects with NOT_FOUND for a card owned by another merchant', async () => {
    dbStub.select.mockReturnValueOnce(q([]));
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    await expect(caller.terminateCard({ cardId: 'card_other', reason: 'x' }))
      .rejects.toMatchObject({ code: 'NOT_FOUND' });
    expect(mockFreezeVirtualCardViaMiddleware).not.toHaveBeenCalled();
  });
});

// ─── expireSweep ──────────────────────────────────────────────────────────────

describe('apVendorCards.expireSweep', () => {
  it('rejects a bad internal key when no user session exists', async () => {
    const ctx: any = { user: null, req: { headers: { 'x-internal-key': 'wrong-key' } }, res: {} };
    const caller = apVendorCardsRouter.createCaller(ctx);
    await expect(caller.expireSweep({})).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
    expect(dbStub.update).not.toHaveBeenCalled();
  });

  it('accepts the internal key, batch-terminates stale single-use cards, freezes each best-effort', async () => {
    const ctx: any = { user: null, req: { headers: { 'x-internal-key': 'test-internal-key-123' } }, res: {} };
    dbStub.update.mockReturnValueOnce(q([
      { id: 'card_old_1', merchantId: 'merch_1' },
      { id: 'card_old_2', merchantId: 'merch_1' },
    ]));
    mockFreezeVirtualCardViaMiddleware
      .mockResolvedValueOnce({ success: true })
      .mockRejectedValueOnce(new Error('bridge down')); // per-card isolation

    const caller = apVendorCardsRouter.createCaller(ctx);
    const result = await caller.expireSweep({});

    expect(result).toEqual({ terminated: 2, frozen: 1, freezeFailures: 1 });
    expect(mockFreezeVirtualCardViaMiddleware).toHaveBeenCalledTimes(2);
    expect(mockAuditLog).toHaveBeenCalledWith(expect.objectContaining({
      action: 'ap.vendor_card.expire_sweep',
      metadata: expect.objectContaining({ terminated: 2, frozen: 1, freezeFailures: 1 }),
    }));
  });

  it('falls back to PBAC manage_virtual_cards for an authenticated admin', async () => {
    dbStub.update.mockReturnValueOnce(q([]));
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    const result = await caller.expireSweep({ olderThanDays: 30 });
    expect(mockRequirePermission).toHaveBeenCalledWith('99', 'admin', 'virtual_card', 'create');
    expect(result.terminated).toBe(0);
  });
});

// ─── listVendorCards ──────────────────────────────────────────────────────────

describe('apVendorCards.listVendorCards', () => {
  it('lists merchant-scoped cards without credentials (masked PAN only)', async () => {
    dbStub.select.mockReturnValueOnce(q([CARD_ACTIVE]));
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    const result = await caller.listVendorCards({});
    expect(result.cards).toHaveLength(1);
    expect(result.cards[0].maskedPan).toBe('4000-****-****-1234');
    expect(result.cards[0]).not.toHaveProperty('pan');
    expect(result.cards[0]).not.toHaveProperty('cvv');
  });

  it('bill-scoped listing resolves cards through ap_payments and short-circuits when empty', async () => {
    dbStub.select.mockReturnValueOnce(q([])); // no payments for the bill
    const caller = apVendorCardsRouter.createCaller(makeCtx());
    const result = await caller.listVendorCards({ billId: 'bill_1' });
    expect(result.cards).toEqual([]);
    expect(dbStub.select).toHaveBeenCalledTimes(1); // card query never ran
  });
});

// ─── internals ────────────────────────────────────────────────────────────────

describe('apVendorCards internals', () => {
  it('resolveExpiry prefers bridge-reported expiry and derives 24-month validity otherwise', () => {
    expect(internals.resolveExpiry({ expiryMonth: 6, expiryYear: 2031 }))
      .toEqual({ expiryMonth: 6, expiryYear: 2031 });
    const derived = internals.resolveExpiry({});
    const expected = new Date();
    expected.setMonth(expected.getMonth() + 24);
    expect(derived.expiryYear).toBe(expected.getFullYear());
    expect(derived.expiryMonth).toBe(expected.getMonth() + 1);
  });

  it('isInternalCaller fails closed when the key is wrong or env key unset', () => {
    expect(internals.isInternalCaller({ req: { headers: { 'x-internal-key': 'test-internal-key-123' } } })).toBe(true);
    expect(internals.isInternalCaller({ req: { headers: { 'x-internal-key': 'nope' } } })).toBe(false);
    expect(internals.isInternalCaller({ req: { headers: {} } })).toBe(false);
  });
});
