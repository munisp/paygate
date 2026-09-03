/**
 * transferRecipients.test.ts — Paystack /transferrecipient + /balance + OTP
 * controls parity tests. Mocking pattern follows paymentRequests.test.ts.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { createHash } from 'crypto';

// ─── hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  execQueue: [] as Array<{ match: string; rows: any[] }>,
  execCalls: [] as string[],
  merchant: { id: 'merch_1', ownerId: 99, tenantId: 'ten_default' } as any,
  events: [] as Array<{ event: string; merchantId: string; data: any }>,
  novuKey: 'test-novu-key' as string,
  nibssKey: 'test-nibss-key' as string,
  fetchImpl: null as null | ((...a: any[]) => Promise<any>),
  fetchCalls: [] as any[],
}));

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
  get ENV() {
    return {
      novuApiUrl: 'http://novu:3000',
      novuApiKey: h.novuKey,
      nibssGatewayUrl: 'http://nibss:4000',
      nibssApiKey: h.nibssKey,
      nibssInstitutionCode: '999',
    };
  },
}));

vi.mock('../../server/logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

// ─── subject ──────────────────────────────────────────────────────────────────

import { transferRecipientsRouter } from './transferRecipients';

const ctx: any = {
  user: { id: 7, openId: 'open_7', name: 'Owner', email: 'm@example.com', role: 'user' },
  req: { headers: {} },
  res: {},
};
const caller = () => transferRecipientsRouter.createCaller(ctx);

function recipientRow(over: Record<string, any> = {}) {
  return {
    id: 'rcp_1', merchant_id: 'merch_1', recipient_code: 'RCP_ABC',
    type: 'nuban', name: 'Jane Doe', account_number: '0123456789',
    bank_code: '058', currency: 'NGN', email: null, description: null,
    metadata: null, authorization_code: null, active: true, ...over,
  };
}

beforeEach(() => {
  h.execQueue.length = 0;
  h.execCalls.length = 0;
  h.events.length = 0;
  h.fetchCalls.length = 0;
  h.merchant = { id: 'merch_1', ownerId: 99, tenantId: 'ten_default' };
  h.novuKey = 'test-novu-key';
  h.nibssKey = 'test-nibss-key';
  h.fetchImpl = async () => ({ ok: true, status: 202, json: async () => ({}), text: async () => '' } as any);
  vi.stubGlobal('fetch', (...a: any[]) => {
    h.fetchCalls.push(a);
    return h.fetchImpl!(...a);
  });
});

// ─── create ───────────────────────────────────────────────────────────────────

describe('transferRecipients.create', () => {
  it('creates a nuban recipient resolving the account name from cache', async () => {
    h.execQueue.push(
      { match: 'FROM nip_account_cache', rows: [{ account_name: 'Jane Doe' }] },
      { match: 'SELECT * FROM transfer_recipients', rows: [] }, // no duplicate
      { match: 'INSERT INTO transfer_recipients', rows: [recipientRow()] },
    );
    const res = await caller().create({
      type: 'nuban', account_number: '0123456789', bank_code: '058', idempotencyKey: 'idem-rcp-1',
    });
    expect(res.recipient_code).toBe('RCP_ABC');
    expect(res.name).toBe('Jane Doe');
    expect(h.events.map((e) => e.event)).toContain('transfer.recipient.created');
  });

  it('idempotent duplicate create returns the existing record (no event)', async () => {
    h.execQueue.push(
      { match: 'FROM nip_account_cache', rows: [{ account_name: 'Jane Doe' }] },
      { match: 'SELECT * FROM transfer_recipients', rows: [recipientRow()] }, // duplicate found
    );
    const res = await caller().create({
      type: 'nuban', account_number: '0123456789', bank_code: '058', idempotencyKey: 'idem-rcp-2',
    });
    expect(res.id).toBe('rcp_1');
    expect(h.execCalls.some((c) => c.includes('INSERT INTO transfer_recipients'))).toBe(false);
    expect(h.events.length).toBe(0);
  });

  it('fails loud when NUBAN resolution fails (NIBSS error)', async () => {
    h.execQueue.push(
      { match: 'FROM nip_account_cache', rows: [] }, // cache miss
      { match: 'nip_resolution_errors', rows: [] }, // error audit insert
    );
    h.fetchImpl = async () => ({ ok: false, status: 502, text: async () => 'bad gateway' } as any);
    await expect(caller().create({
      type: 'nuban', account_number: '0123456789', bank_code: '058', idempotencyKey: 'idem-rcp-3',
    })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    // No recipient insert attempted.
    expect(h.execCalls.some((c) => c.includes('INSERT INTO transfer_recipients'))).toBe(false);
  });

  it('fails loud when NIBSS is not configured', async () => {
    h.nibssKey = '';
    h.execQueue.push({ match: 'FROM nip_account_cache', rows: [] });
    await expect(caller().create({
      type: 'nuban', account_number: '0123456789', bank_code: '058', idempotencyKey: 'idem-rcp-4',
    })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });
});

// ─── per-type validation ──────────────────────────────────────────────────────

describe('per-type validation', () => {
  it('nuban requires 10-digit account number and bank_code', async () => {
    await expect(caller().create({
      type: 'nuban', account_number: '123', bank_code: '058', idempotencyKey: 'idem-v-1',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().create({
      type: 'nuban', account_number: '0123456789', idempotencyKey: 'idem-v-2',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('mobile_money requires phone-style number + metadata.provider', async () => {
    await expect(caller().create({
      type: 'mobile_money', account_number: '0803', idempotencyKey: 'idem-v-3',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller().create({
      type: 'mobile_money', account_number: '+2348031234567', idempotencyKey: 'idem-v-4',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    h.execQueue.push(
      { match: 'SELECT * FROM transfer_recipients', rows: [] },
      { match: 'INSERT INTO transfer_recipients', rows: [recipientRow({ type: 'mobile_money', bank_code: null })] },
    );
    const res = await caller().create({
      type: 'mobile_money', account_number: '+2348031234567',
      metadata: { provider: 'mtn' }, idempotencyKey: 'idem-v-5',
    });
    expect(res.type).toBe('mobile_money');
  });

  it('authorization requires authorization_code', async () => {
    await expect(caller().create({
      type: 'authorization', idempotencyKey: 'idem-v-6',
    })).rejects.toMatchObject({ code: 'BAD_REQUEST' });

    h.execQueue.push(
      { match: 'SELECT * FROM transfer_recipients', rows: [] },
      { match: 'INSERT INTO transfer_recipients', rows: [recipientRow({ type: 'authorization', authorization_code: 'AUTH_x' })] },
    );
    const res = await caller().create({
      type: 'authorization', authorization_code: 'AUTH_x', idempotencyKey: 'idem-v-7',
    });
    expect(res.authorization_code).toBe('AUTH_x');
  });
});

// ─── bulkCreate ───────────────────────────────────────────────────────────────

describe('transferRecipients.bulkCreate', () => {
  it('splits results into success[] and errors[]', async () => {
    h.execQueue.push(
      // item 1 (valid, cache hit)
      { match: 'FROM nip_account_cache', rows: [{ account_name: 'Jane Doe' }] },
      { match: 'SELECT * FROM transfer_recipients', rows: [] },
      { match: 'INSERT INTO transfer_recipients', rows: [recipientRow()] },
      // item 2 (valid authorization)
      { match: 'SELECT * FROM transfer_recipients', rows: [] },
      { match: 'INSERT INTO transfer_recipients', rows: [recipientRow({ id: 'rcp_2', type: 'authorization' })] },
    );
    const res = await caller().bulkCreate({
      batch: [
        { type: 'nuban', account_number: '0123456789', bank_code: '058' },
        { type: 'authorization', authorization_code: 'AUTH_x' },
        { type: 'nuban', account_number: '12345678901', bank_code: '058' }, // invalid → errors[]
      ],
    });
    expect(res.success).toHaveLength(2);
    expect(res.errors).toHaveLength(1);
    expect(res.errors[0].index).toBe(2);
  });
});

// ─── balances / ledger ────────────────────────────────────────────────────────

describe('balances', () => {
  it('getBalances returns per-currency balances from wallets', async () => {
    h.execQueue.push({
      match: 'FROM wallets',
      rows: [{ currency: 'NGN', balance: '500000', ledger_balance: '480000' }, { currency: 'USD', balance: '1200', ledger_balance: '1200' }],
    });
    const res = await caller().getBalances();
    expect(res).toHaveLength(2);
    expect(res[0]).toMatchObject({ currency: 'NGN', balance: '500000' });
  });

  it('getBalanceLedger maps wallet_transactions to ledger entries', async () => {
    h.execQueue.push({
      match: 'FROM wallet_transactions',
      rows: [{
        balance: '500000', difference: '-20000', reason: 'Payout PO_1',
        model_responsible: 'wallet_transactions', model_ref: '42', currency: 'NGN',
        created_at: '2025-01-01T00:00:00Z',
      }],
    });
    const res = await caller().getBalanceLedger({});
    expect(res[0]).toMatchObject({
      balance: '500000', difference: '-20000', reason: 'Payout PO_1',
      model_responsible: 'wallet_transactions', currency: 'NGN',
    });
  });
});

// ─── OTP controls ─────────────────────────────────────────────────────────────

describe('transfer OTP controls', () => {
  it('disableOtp fails loud and leaves otp_required unchanged when the rail is unconfigured', async () => {
    h.novuKey = '';
    await expect(caller().disableOtp()).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    // No challenge persisted, no settings update.
    expect(h.execCalls.some((c) => c.includes('merchant_transfer_otp_challenges'))).toBe(false);
    expect(h.execCalls.some((c) => c.includes('UPDATE merchant_transfer_settings'))).toBe(false);
  });

  it('disable flow: initiate delivers OTP, finalize with correct OTP flips otp_required', async () => {
    // Initiate.
    const init = await caller().disableOtp();
    expect(init.initiated).toBe(true);
    expect(init.otp_required).toBe(true);
    expect(h.execCalls.some((c) => c.includes('INSERT INTO merchant_transfer_otp_challenges'))).toBe(true);
    // Extract the OTP from the Novu trigger payload.
    const novuCall = h.fetchCalls.find((c) => String(c[0]).includes('/v1/events/trigger'));
    const body = JSON.parse(novuCall[1].body);
    const otp: string = body.payload.otp;
    expect(otp).toMatch(/^\d{6}$/);

    // Finalize with wrong OTP → rejected.
    const wrong = otp === '000000' ? '000001' : '000000';
    h.execQueue.push({
      match: 'FROM merchant_transfer_otp_challenges',
      rows: [{ id: 'chal_1', code_hash: createHash('sha256').update(otp).digest('hex') }],
    });
    await expect(caller().finalizeDisableOtp({ otp: wrong }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });

    // Finalize with correct OTP → otp_required=false.
    h.execQueue.push(
      {
        match: 'FROM merchant_transfer_otp_challenges',
        rows: [{ id: 'chal_1', code_hash: createHash('sha256').update(otp).digest('hex') }],
      },
      { match: 'UPDATE merchant_transfer_otp_challenges', rows: [] }, // consume
      { match: 'UPDATE merchant_transfer_settings', rows: [{ merchant_id: 'merch_1', otp_required: false }] },
    );
    const res = await caller().finalizeDisableOtp({ otp });
    expect(res.otp_required).toBe(false);
  });

  it('finalize with no pending challenge is rejected', async () => {
    h.execQueue.push({ match: 'FROM merchant_transfer_otp_challenges', rows: [] });
    await expect(caller().finalizeDisableOtp({ otp: '123456' }))
      .rejects.toMatchObject({ code: 'UNAUTHORIZED' });
  });

  it('enableOtp re-enables and getTransferSettings returns the row', async () => {
    h.execQueue.push(
      { match: 'INSERT INTO merchant_transfer_settings', rows: [] },
      { match: 'SELECT * FROM merchant_transfer_settings', rows: [{ merchant_id: 'merch_1', otp_required: false }] },
      { match: 'UPDATE merchant_transfer_settings', rows: [{ merchant_id: 'merch_1', otp_required: true }] },
    );
    const res = await caller().enableOtp();
    expect(res.otp_required).toBe(true);

    h.execQueue.push(
      { match: 'INSERT INTO merchant_transfer_settings', rows: [] },
      { match: 'SELECT * FROM merchant_transfer_settings', rows: [{ merchant_id: 'merch_1', otp_required: true }] },
    );
    const settings = await caller().getTransferSettings();
    expect(settings.otp_required).toBe(true);
  });

  it('resendOtp requires a transfer_code or reference', async () => {
    await expect(caller().resendOtp({})).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    const res = await caller().resendOtp({ transfer_code: 'TRF_1' });
    expect(res.sent).toBe(true);
  });
});
