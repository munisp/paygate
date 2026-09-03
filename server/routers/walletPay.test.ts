/**
 * walletPay.test.ts
 * Vitest unit tests for the Apple Pay / Google Pay wallet router.
 *
 * Covers: domain CRUD + duplicate rejection + format validation, cursor
 * pagination, verify fail-loud without Apple Pay env, decryptWalletToken
 * fail-loud without key, instrument lifecycle, and charge fail-loud paths.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { createCipheriv, randomBytes } from 'node:crypto';

// ─── Hoisted holders ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = {
    selects: [] as any[][],
  };
  const calls = {
    insert: [] as { table: string; values: any }[],
    update: [] as { table: string; set: any }[],
    delete: [] as string[],
    events: [] as { event: string; data: any }[],
  };

  function chain(db: any, op: string, table?: any): any {
    const c: any = {
      from: () => c,
      orderBy: () => c,
      limit: async () => state.selects.shift() ?? [],
      values: (v: any) => { calls.insert.push({ table: table?.__t ?? 'local', values: v }); return c; },
      set: (v: any) => { calls.update.push({ table: table?.__t ?? 'local', set: v }); return c; },
      where: () => (op === 'delete' ? Promise.resolve([]) : c),
      returning: async () => [{ id: 'new-id' }],
    };
    return c;
  }

  const fakeDb: any = {
    select: () => chain(fakeDb, 'select'),
    insert: (t: any) => chain(fakeDb, 'insert', t),
    update: (t: any) => chain(fakeDb, 'update', t),
    delete: (t: any) => { calls.delete.push(t?.__t ?? 'local'); return chain(fakeDb, 'delete', t); },
  };

  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('drizzle-orm', () => ({
  eq: vi.fn((c: any, v: any) => ({ op: 'eq', c, v })),
  and: vi.fn((...args: any[]) => ({ op: 'and', args })),
  desc: vi.fn((c: any) => ({ op: 'desc', c })),
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

vi.mock('../logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import {
  walletPayRouter,
  APPLE_PAY_ASSOCIATION_PATH,
  buildApplePayAssociationContent,
  decryptWalletToken,
} from './walletPay';

const ctx = {
  user: { id: 7, openId: 'open-1', name: 'Tester', email: 't@example.com', role: 'user' },
} as any;
const caller = walletPayRouter.createCaller(ctx);

const TEST_KEY = randomBytes(32); // AES-256

function encryptWalletToken(payload: Record<string, unknown>): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', TEST_KEY, iv);
  const data = Buffer.concat([cipher.update(JSON.stringify(payload), 'utf8'), cipher.final()]);
  return [iv, cipher.getAuthTag(), data].map((b) => b.toString('base64url')).join('.');
}

function domain(over: Partial<any> = {}) {
  return {
    id: 'wdom_1', merchantId: 'merch_1', domain: 'shop.example.com',
    provider: 'apple_pay', status: 'pending', verificationToken: 'TOK',
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

function instrument(over: Partial<any> = {}) {
  return {
    id: 'wpi_1', merchantId: 'merch_1', customerEmail: 'c@example.com',
    provider: 'apple_pay', tokenRef: 'tokref_abc123', displayName: 'Apple Pay •••• 1234',
    active: true, createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

beforeEach(() => {
  h.state.selects.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
  h.calls.delete.length = 0;
  h.calls.events.length = 0;
  delete process.env.APPLE_PAY_MERCHANT_ID;
  delete process.env.APPLE_PAY_MERCHANT_CERT_PATH;
  delete process.env.WALLET_TOKEN_DECRYPT_KEY;
  delete process.env.CARD_CHARGE_RAIL_URL;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

// ─── Apple Pay association file ───────────────────────────────────────────────
describe('Apple Pay domain-association file', () => {
  it('exposes the well-known path', () => {
    expect(APPLE_PAY_ASSOCIATION_PATH).toBe('/.well-known/apple-developer-merchantid-domain-association');
  });
  it('fails loud when APPLE_PAY_MERCHANT_ID is unset', () => {
    expect(() => buildApplePayAssociationContent()).toThrowError(/APPLE_PAY_MERCHANT_ID/);
  });
  it('returns the merchant id when configured', async () => {
    process.env.APPLE_PAY_MERCHANT_ID = 'merchant.com.paygate.test';
    const res = await caller.getApplePayDomainAssociationFile();
    expect(res.path).toBe(APPLE_PAY_ASSOCIATION_PATH);
    expect(res.content).toBe('merchant.com.paygate.test');
  });
});

// ─── Domain CRUD ──────────────────────────────────────────────────────────────
describe('Apple Pay domain CRUD', () => {
  it('registers a valid domain as pending', async () => {
    h.state.selects.push([]); // duplicate check
    const res = await caller.registerApplePayDomain({ domain: 'Shop.Example.com' });
    expect(res.domain).toBe('shop.example.com');
    expect(res.status).toBe('pending');
    expect(res.verificationToken).toBeTruthy();
  });

  it('rejects malformed domains', async () => {
    await expect(caller.registerApplePayDomain({ domain: 'not a domain!' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    await expect(caller.registerApplePayDomain({ domain: '-bad.com' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
  });

  it('rejects duplicate domains per merchant', async () => {
    h.state.selects.push([domain()]);
    await expect(caller.registerApplePayDomain({ domain: 'shop.example.com' }))
      .rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('lists with cursor pagination (next/previous)', async () => {
    const many = Array.from({ length: 25 }, (_, i) => domain({ id: `wdom_${i}`, domain: `d${i}.example.com` }));
    h.state.selects.push(many);
    const page1 = await caller.listApplePayDomains({ limit: 10 });
    expect(page1.domains).toHaveLength(10);
    expect(page1.nextCursor).toBeTruthy();
    expect(page1.previousCursor).toBeNull();

    h.state.selects.push(many);
    const page2 = await caller.listApplePayDomains({ limit: 10, cursor: page1.nextCursor! });
    expect(page2.domains).toHaveLength(10);
    expect(page2.previousCursor).toBeTruthy();

    h.state.selects.push(many);
    const page3 = await caller.listApplePayDomains({ limit: 10, cursor: page2.nextCursor! });
    expect(page3.domains).toHaveLength(5);
    expect(page3.nextCursor).toBeNull();
  });

  it('deletes an existing domain', async () => {
    h.state.selects.push([domain()]);
    const res = await caller.deleteApplePayDomain({ domain_id: 'wdom_1' });
    expect(res.deleted).toBe(true);
    expect(h.calls.delete.length).toBe(1);
  });

  it('404s deleting an unknown domain', async () => {
    h.state.selects.push([]);
    await expect(caller.deleteApplePayDomain({ domain_id: 'nope' })).rejects.toMatchObject({ code: 'NOT_FOUND' });
  });
});

// ─── verifyApplePayDomain fail-loud ───────────────────────────────────────────
describe('verifyApplePayDomain', () => {
  it('fails loud 503 when Apple Pay env is not configured; never fakes verified', async () => {
    h.state.selects.push([domain()]);
    await expect(caller.verifyApplePayDomain({ domain_id: 'wdom_1' }))
      .rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
    expect(h.calls.update.filter((u) => u.set.status === 'verified')).toHaveLength(0);
  });

  it('marks verified only on a successful Apple response', async () => {
    process.env.APPLE_PAY_MERCHANT_ID = 'merchant.com.paygate.test';
    process.env.APPLE_PAY_MERCHANT_CERT_PATH = '/tmp/apple-pay.pem';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    h.state.selects.push([domain()]);
    const res = await caller.verifyApplePayDomain({ domain_id: 'wdom_1' });
    expect(res.status).toBe('verified');
    expect(h.calls.update.some((u) => u.set.status === 'verified')).toBe(true);
  });

  it('marks failed when Apple rejects', async () => {
    process.env.APPLE_PAY_MERCHANT_ID = 'merchant.com.paygate.test';
    process.env.APPLE_PAY_MERCHANT_CERT_PATH = '/tmp/apple-pay.pem';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, status: 400 })));
    h.state.selects.push([domain()]);
    await expect(caller.verifyApplePayDomain({ domain_id: 'wdom_1' })).rejects.toMatchObject({ code: 'BAD_REQUEST' });
    expect(h.calls.update.some((u) => u.set.status === 'failed')).toBe(true);
  });
});

// ─── decryptWalletToken ───────────────────────────────────────────────────────
describe('decryptWalletToken', () => {
  it('fails loud 503 without WALLET_TOKEN_DECRYPT_KEY', () => {
    expect(() => decryptWalletToken('apple_pay', 'a.b.c')).toThrowError(/WALLET_TOKEN_DECRYPT_KEY/);
  });
  it('fails loud 503 with a malformed key', () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = 'not-hex';
    expect(() => decryptWalletToken('apple_pay', 'a.b.c')).toThrowError(/WALLET_TOKEN_DECRYPT_KEY/);
  });
  it('rejects a malformed envelope', () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = TEST_KEY.toString('hex');
    expect(() => decryptWalletToken('apple_pay', 'garbage')).toThrowError(/Malformed/);
  });
  it('decrypts a valid token envelope', () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = TEST_KEY.toString('hex');
    const token = encryptWalletToken({ panLast4: '1234', cryptogram: 'crypto', expiryMonth: '12', expiryYear: '2030' });
    const res = decryptWalletToken('google_pay', token);
    expect(res.panLast4).toBe('1234');
    expect(res.cryptogram).toBe('crypto');
    expect(res.provider).toBe('google_pay');
  });
  it('rejects tampered ciphertext', () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = TEST_KEY.toString('hex');
    const token = encryptWalletToken({ panLast4: '1234', cryptogram: 'crypto' });
    const parts = token.split('.');
    parts[2] = Buffer.from('tampered-ciphertext!!').toString('base64url');
    expect(() => decryptWalletToken('apple_pay', parts.join('.'))).toThrowError(/decryption failed/i);
  });
});

// ─── Instrument lifecycle + charge ────────────────────────────────────────────
describe('wallet instruments', () => {
  it('creates an instrument', async () => {
    const res = await caller.createWalletInstrument({
      customer_email: 'c@example.com',
      provider: 'apple_pay',
      token_ref: 'tokref_abc123',
      display_name: 'Apple Pay •••• 1234',
    });
    expect(res.active).toBe(true);
    expect(res.displayName).toBe('Apple Pay •••• 1234');
  });

  it('lists and deactivates instruments; deactivating twice conflicts', async () => {
    h.state.selects.push([instrument()]);
    const list = await caller.listInstruments({ customer_email: 'c@example.com' });
    expect(list.instruments).toHaveLength(1);

    h.state.selects.push([instrument()]);
    const deact = await caller.deactivateInstrument({ instrument_id: 'wpi_1' });
    expect(deact.active).toBe(false);

    h.state.selects.push([instrument({ active: false })]);
    await expect(caller.deactivateInstrument({ instrument_id: 'wpi_1' })).rejects.toMatchObject({ code: 'CONFLICT' });
  });

  it('charge fails loud without decrypt key', async () => {
    h.state.selects.push([instrument()]);
    await expect(caller.chargeWalletInstrument({
      instrument_id: 'wpi_1', amount: 100000, token: 'aaaa.bbbb.ccccdddd', idempotencyKey: 'idem-wallet-1',
    })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE' });
  });

  it('charge fails loud without card rail (after successful decrypt)', async () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = TEST_KEY.toString('hex');
    const token = encryptWalletToken({ panLast4: '1234', cryptogram: 'crypto' });
    h.state.selects.push([instrument()]);
    await expect(caller.chargeWalletInstrument({
      instrument_id: 'wpi_1', amount: 100000, token, idempotencyKey: 'idem-wallet-2',
    })).rejects.toMatchObject({ code: 'SERVICE_UNAVAILABLE', message: expect.stringMatching(/CARD_CHARGE_RAIL_URL/) });
  });

  it('charge completes when decrypt + rail are configured', async () => {
    process.env.WALLET_TOKEN_DECRYPT_KEY = TEST_KEY.toString('hex');
    process.env.CARD_CHARGE_RAIL_URL = 'http://rail.local';
    vi.stubGlobal('fetch', vi.fn(async () => ({ ok: true, status: 200 })));
    const token = encryptWalletToken({ panLast4: '1234', cryptogram: 'crypto' });
    h.state.selects.push([instrument()]);
    const res = await caller.chargeWalletInstrument({
      instrument_id: 'wpi_1', amount: 100000, token, idempotencyKey: 'idem-wallet-3',
    });
    expect(res.status).toBe('completed');
    expect(res.reference).toMatch(/^WLT_/);
  });

  it('charge rejects an inactive instrument', async () => {
    h.state.selects.push([instrument({ active: false })]);
    await expect(caller.chargeWalletInstrument({
      instrument_id: 'wpi_1', amount: 100000, token: 'aaaa.bbbb.ccccdddd', idempotencyKey: 'idem-wallet-4',
    })).rejects.toMatchObject({ code: 'CONFLICT' });
  });
});
