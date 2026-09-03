/**
 * apBillInbox.test.ts
 * Vitest unit tests for the AP bill inbox router (Melio spec P0-b).
 * Mocking pattern follows hostedCheckout.test.ts (chainable db mock).
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ─── Shared mock state (hoisted so vi.mock factories can reference it) ───────
const h = vi.hoisted(() => ({
  selectResult: [] as any[],
  returningResult: [{ id: 'bill-1' }] as any[],
  insertedValues: [] as any[],
  updateSets: [] as any[],
}));

// ─── Mocks ────────────────────────────────────────────────────────────────────

vi.mock('../../drizzle/schema', () => ({
  apBills: { id: 'apBills.id', merchantId: 'apBills.merchantId', status: 'apBills.status', createdAt: 'apBills.createdAt' },
  apBillLineItems: { billId: 'apBillLineItems.billId' },
}));

vi.mock('drizzle-orm', () => ({
  eq: vi.fn((...a: any[]) => ({ op: 'eq', a })),
  and: vi.fn((...a: any[]) => ({ op: 'and', a })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
  inArray: vi.fn((...a: any[]) => ({ op: 'inArray', a })),
}));

vi.mock('../../server/db', () => {
  const chain: any = {};
  chain.select = vi.fn(() => chain);
  chain.from = vi.fn(() => chain);
  chain.where = vi.fn(() => chain);
  chain.orderBy = vi.fn(() => chain);
  chain.insert = vi.fn(() => chain);
  chain.values = vi.fn(async (v: any) => { h.insertedValues.push(v); });
  chain.update = vi.fn(() => chain);
  chain.set = vi.fn((v: any) => { h.updateSets.push(v); return chain; });
  chain.delete = vi.fn(() => chain);
  chain.returning = vi.fn(async () => h.returningResult);
  chain.limit = vi.fn(async () => h.selectResult);
  return {
    getDb: vi.fn(async () => chain),
    getUserByOpenId: vi.fn(async (openId: string) => ({ id: 7, openId, name: 'Test User', email: 't@example.com' })),
    getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1' })),
    logAuditEvent: vi.fn(async () => ({})),
  };
});

vi.mock('../../server/storage', () => ({
  storagePut: vi.fn(async (key: string) => ({ url: `https://files.example/${key}`, key })),
}));

vi.mock('../../server/kafkaClient', () => ({
  publishEvent: vi.fn(async () => true),
}));

vi.mock('../../server/idempotency', () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock('../../server/_core/env', () => ({
  ENV: {
    internalApiKey: 'test-internal-key-123',
    kycOcrUrl: 'http://kyc-ocr:8011',
    billInboxUrl: 'http://bill-inbox:8108',
  },
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────

import { apBillInboxRouter, __apBillInboxInternals } from './apBillInbox';

const userCtx: any = {
  user: { id: 7, openId: 'open_1', name: 'Test User', email: 't@example.com', role: 'user' },
  req: { headers: {} },
  res: {},
};

function makeCaller(ctx: any = userCtx) {
  return apBillInboxRouter.createCaller(ctx);
}

beforeEach(() => {
  h.selectResult = [];
  h.returningResult = [{ id: 'bill-1' }];
  h.insertedValues = [];
  h.updateSets = [];
  vi.stubGlobal('fetch', vi.fn(async () => ({
    ok: true,
    json: async () => ({ structured_data: { vendor_name: 'Acme Ltd' }, overall_confidence: 0.9 }),
  })));
});

// ─── Tests ────────────────────────────────────────────────────────────────────

describe('apBillInbox.uploadBillDocument', () => {
  it('creates an ap_bills row in pending_extraction with source=upload', async () => {
    const caller = makeCaller();
    const result = await caller.uploadBillDocument({
      fileName: 'invoice-001.pdf',
      contentType: 'application/pdf',
      base64Data: Buffer.from('%PDF-1.4 fake').toString('base64'),
    });
    expect(result.status).toBe('pending_extraction');
    expect(result.billId).toBeTruthy();
    expect(result.documentUrl).toContain('ap-bills/merch_1/upload/');

    const billInsert = h.insertedValues.find((v) => !Array.isArray(v) && v.source === 'upload');
    expect(billInsert).toBeTruthy();
    expect(billInsert.status).toBe('pending_extraction');
    expect(billInsert.merchantId).toBe('merch_1');
    expect(billInsert.documentUrl).toBe(result.documentUrl);
  });

  it('rejects unsupported content types', async () => {
    const caller = makeCaller();
    await expect(caller.uploadBillDocument({
      fileName: 'evil.exe',
      contentType: 'application/x-msdownload',
      base64Data: Buffer.from('x').toString('base64'),
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('requires an authenticated user', async () => {
    const caller = makeCaller({ ...userCtx, user: null });
    await expect(caller.uploadBillDocument({
      fileName: 'invoice.pdf',
      contentType: 'application/pdf',
      base64Data: Buffer.from('x').toString('base64'),
    })).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });
});

describe('apBillInbox.confirmExtractedBill', () => {
  const extractedBill = {
    id: '11111111-1111-4111-8111-111111111111',
    merchantId: 'merch_1',
    status: 'extracted',
    source: 'upload',
    currency: 'NGN',
    billNumber: null,
    dueDate: null,
    extractedData: {
      vendor_name: 'Acme Ltd',
      bill_number: 'INV-42',
      total_kobo: 150000,
      subtotal_kobo: 140000,
      tax_kobo: 10000,
      line_items: [{ description: 'Consulting', quantity: 1, unit_price_kobo: 140000, amount_kobo: 140000 }],
    },
  };

  it('rejects when the bill is not in extracted status', async () => {
    h.selectResult = [{ ...extractedBill, status: 'draft' }];
    h.returningResult = []; // guarded flip finds no row
    const caller = makeCaller();
    await expect(caller.confirmExtractedBill({
      billId: extractedBill.id,
      idempotencyKey: 'confirm-key-0001',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('applies extracted fields and flips extracted→draft on success', async () => {
    h.selectResult = [extractedBill];
    h.returningResult = [{ id: extractedBill.id }];
    const caller = makeCaller();
    const result = await caller.confirmExtractedBill({
      billId: extractedBill.id,
      idempotencyKey: 'confirm-key-0002',
    });
    expect(result.status).toBe('draft');
    expect(result.totalKobo).toBe(150000);
    expect(result.lineItemCount).toBe(1);

    const setPayload = h.updateSets.find((s) => s.status === 'draft');
    expect(setPayload).toBeTruthy();
    expect(setPayload.billNumber).toBe('INV-42');
    expect(setPayload.totalKobo).toBe(150000);

    const lineItems = h.insertedValues.find((v) => Array.isArray(v));
    expect(lineItems).toBeTruthy();
    expect(lineItems[0].description).toBe('Consulting');
    expect(lineItems[0].amountKobo).toBe(140000);
  });

  it('human corrections override extracted fields', async () => {
    h.selectResult = [extractedBill];
    h.returningResult = [{ id: extractedBill.id }];
    const caller = makeCaller();
    const result = await caller.confirmExtractedBill({
      billId: extractedBill.id,
      corrections: { total_kobo: 155000, bill_number: 'INV-42-A' },
      idempotencyKey: 'confirm-key-0003',
    });
    expect(result.totalKobo).toBe(155000);
    const setPayload = h.updateSets.find((s) => s.status === 'draft');
    expect(setPayload.billNumber).toBe('INV-42-A');
  });
});

describe('apBillInbox.receiveEmailBill', () => {
  const input = {
    merchantId: 'merch_1',
    fileName: 'emailed-invoice.pdf',
    contentType: 'application/pdf',
    base64Data: Buffer.from('%PDF emailed').toString('base64'),
    fromAddress: 'vendor@acme.example',
    messageId: '<msg-1@acme.example>',
  };

  it('rejects a bad internal key', async () => {
    const caller = makeCaller({ user: null, req: { headers: { 'x-internal-key': 'wrong-key' } }, res: {} });
    await expect(caller.receiveEmailBill(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('rejects when the internal key header is missing', async () => {
    const caller = makeCaller({ user: null, req: { headers: {} }, res: {} });
    await expect(caller.receiveEmailBill(input)).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('creates a pending_extraction bill with source=email for the correct key', async () => {
    const caller = makeCaller({ user: null, req: { headers: { 'x-internal-key': 'test-internal-key-123' } }, res: {} });
    const result = await caller.receiveEmailBill(input);
    expect(result.status).toBe('pending_extraction');
    const billInsert = h.insertedValues.find((v) => !Array.isArray(v) && v.source === 'email');
    expect(billInsert).toBeTruthy();
    expect(billInsert.sourceRef).toBe('<msg-1@acme.example>');
    expect(billInsert.status).toBe('pending_extraction');
  });
});

describe('apBillInbox internals', () => {
  it('sanitizes storage key segments', () => {
    expect(__apBillInboxInternals.safeSegment('../../etc/passwd')).toBe('.._.._etc_passwd');
    expect(__apBillInboxInternals.safeSegment('inv #42 (final).pdf')).toBe('inv__42__final_.pdf');
  });
});
