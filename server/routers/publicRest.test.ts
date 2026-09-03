/**
 * publicRest.test.ts — Vitest tests for the Paystack-parity public REST v1 API.
 *
 * Spins up a real Express app on an ephemeral port and exercises the router
 * over HTTP (fetch), against the repo-standard in-memory fake DB (a chainable
 * Proxy whose terminal await shifts queued result sets — same pattern as
 * directDebit.test.ts). The idempotency store is the REAL withIdempotency
 * against the fake DB, so claim/replay/409 semantics are genuinely exercised.
 */

import { describe, it, expect, vi, beforeEach, afterAll } from 'vitest';
import express from 'express';
import type { Server } from 'http';
import { createHash } from 'crypto';

// ─── Hoisted fake DB ─────────────────────────────────────────────────────────
const h = vi.hoisted(() => {
  const state = { results: [] as any[] };
  const calls = { insert: [] as any[], update: [] as any[], events: [] as any[] };

  function makeChain(kind: string): any {
    const chain: any = new Proxy({}, {
      get(_t, prop: string) {
        if (prop === 'then' || prop === 'catch' || prop === 'finally') {
          const p = Promise.resolve().then(() => state.results.shift() ?? []);
          return (p as any)[prop].bind(p);
        }
        return (...args: any[]) => {
          if (kind === 'insert' && prop === 'values') calls.insert.push(args[0]);
          if (kind === 'update' && prop === 'set') calls.update.push(args[0]);
          return chain;
        };
      },
    });
    return chain;
  }

  const fakeDb: any = {
    select: () => makeChain('select'),
    insert: () => makeChain('insert'),
    update: () => makeChain('update'),
    delete: () => makeChain('delete'),
  };
  return { state, calls, fakeDb };
});

// ─── Module mocks ─────────────────────────────────────────────────────────────
vi.mock('../../server/db', () => ({
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: 'open-1' })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: 'merch_1', ownerId: 7 })),
}));

vi.mock('../../server/rateLimit', () => ({
  expressRateLimit: vi.fn(() => (req: any, res: any, next: any) => {
    res.setHeader('X-RateLimit-Limit', '100');
    res.setHeader('X-RateLimit-Remaining', '99');
    next();
  }),
  trpcApiRateLimit: vi.fn(() => (_r: any, _s: any, n: any) => n()),
  rateLimit: vi.fn(() => (_o: any, n: any) => n()),
}));

vi.mock('../../server/webhookEvents', () => ({
  dispatchWebhookEvent: vi.fn(async (payload: any) => {
    h.calls.events.push({ event: payload.event, data: payload.data });
    return { dispatched: 1, failed: 0 };
  }),
  buildWebhookPayload: vi.fn((event: string, merchantId: string, tenantId: string, data: any) => ({
    event, merchantId, tenantId, data, id: 'evt_test', timestamp: new Date().toISOString(),
  })),
}));

vi.mock('../../server/logger', () => ({
  logger: { warn: vi.fn(), info: vi.fn(), error: vi.fn() },
}));

// ─── Subject under test ───────────────────────────────────────────────────────
import { createPublicRestRouter } from './publicRest';
import { hashSecretKey } from './publicRestAuth';

const KEY = 'sk_test_' + 'a'.repeat(48);
const KEY_HASH = hashSecretKey(KEY);
const REVOKED_KEY = 'sk_test_' + 'b'.repeat(48);
const REVOKED_HASH = hashSecretKey(REVOKED_KEY);

const app = express();
app.use(express.json());
app.use('/api/v1', createPublicRestRouter());

let server: Server;
let base: string;

beforeEach(async () => {
  h.state.results.length = 0;
  h.calls.insert.length = 0;
  h.calls.update.length = 0;
  h.calls.events.length = 0;
  delete process.env.STRIPE_SECRET_KEY;
  delete process.env.MIDDLEWARE_BRIDGE_URL;
  if (!server) {
    await new Promise<void>((resolve) => {
      server = app.listen(0, '127.0.0.1', () => {
        base = `http://127.0.0.1:${(server.address() as any).port}`;
        resolve();
      });
    });
  }
});

afterAll(() => { server?.close(); });

// ─── Fixtures ─────────────────────────────────────────────────────────────────
function keyRow(over: Record<string, unknown> = {}) {
  return {
    id: 'key_1', merchantId: 'merch_1', label: 'default', keyHash: KEY_HASH,
    keyPrefix: 'sk_test', last4: 'aaaa', status: 'active',
    lastUsedAt: null, createdAt: new Date(), revokedAt: null, ...over,
  };
}

/** Queue a successful secret-key auth (select hit + lastUsed update drain). */
function queueAuth(row = keyRow()) {
  h.state.results.push([row]); // api_secret_keys select
  h.state.results.push([]);    // lastUsedAt fire-and-forget update (drains a slot)
}

function txRow(over: Record<string, unknown> = {}) {
  return {
    id: 'txn_1', tenantId: 'ten_default', merchantId: 'merch_1',
    reference: 'PG_1_ABC', amount: 50000, currency: 'NGN',
    status: 'completed', channel: 'card', customerEmail: 'c@example.com',
    customerName: null, customerPhone: null, description: null,
    feeAmount: 500, netAmount: 49500, metadata: {}, completedAt: new Date(),
    gnnScore: null, gnnRingDetected: false, gnnScoredAt: null,
    createdAt: new Date(), updatedAt: new Date(), ...over,
  };
}

// Capture the REAL fetch before any test stubs the global (handlers under
// test call the stubbed one; the test harness must keep hitting the server).
const realFetch = globalThis.fetch.bind(globalThis);

const get = (path: string, key = KEY) =>
  realFetch(`${base}${path}`, { headers: { Authorization: `Bearer ${key}` } });
const post = (path: string, body: unknown, extraHeaders: Record<string, string> = {}, key = KEY) =>
  realFetch(`${base}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}`, ...extraHeaders },
    body: JSON.stringify(body),
  });

// ─── Auth ─────────────────────────────────────────────────────────────────────
describe('secret-key auth', () => {
  it('rejects requests without a Bearer key (401 envelope)', async () => {
    const res = await fetch(`${base}/api/v1/transaction`);
    expect(res.status).toBe(401);
    const json = await res.json() as any;
    expect(json).toMatchObject({ status: false, data: null });
  });

  it('rejects an unknown key (401)', async () => {
    h.state.results.push([]); // api_secret_keys miss
    h.state.results.push([]); // developer_api_keys miss
    const res = await get('/api/v1/transaction');
    expect(res.status).toBe(401);
  });

  it('rejects a revoked key (401)', async () => {
    h.state.results.push([keyRow({ keyHash: REVOKED_HASH, status: 'revoked', revokedAt: new Date() })]);
    const res = await get('/api/v1/transaction', REVOKED_KEY);
    expect(res.status).toBe(401);
    const json = await res.json() as any;
    expect(json.message).toMatch(/revoked/i);
  });

  it('accepts a valid key and attaches rate-limit headers', async () => {
    queueAuth();
    h.state.results.push([txRow()]); // list query
    const res = await get('/api/v1/transaction');
    expect(res.status).toBe(200);
    expect(res.headers.get('x-ratelimit-limit')).toBe('100');
    expect(res.headers.get('x-ratelimit-remaining')).toBe('99');
    const json = await res.json() as any;
    expect(json.status).toBe(true);
    expect(json.data.transactions[0].reference).toBe('PG_1_ABC');
    expect(json.data.meta).toMatchObject({ page: 1, perPage: 50 });
  });
});

// ─── initialize → verify contract ────────────────────────────────────────────
describe('POST /transaction/initialize', () => {
  const body = { email: 'c@example.com', amount: 50000 };

  it('creates a hosted session and returns authorization_url/access_code/reference', async () => {
    queueAuth();
    h.state.results.push([]);                      // hosted session by reference
    h.state.results.push([]);                      // transaction by reference
    h.state.results.push([{ tenantId: 'ten_default' }]); // merchant
    // insert(hostedPaymentSessions) resolves default []
    const res = await post('/api/v1/transaction/initialize', body);
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.status).toBe(true);
    expect(json.data.reference).toMatch(/^PG_/);
    expect(json.data.authorization_url).toContain(json.data.reference);
    expect(json.data.access_code).toMatch(/^ac_/);
    expect(h.calls.insert[0]).toMatchObject({
      merchantId: 'merch_1', amountKobo: 50000, currency: 'NGN', status: 'pending',
    });
  });

  it('returns the existing session on a duplicate reference (reference idempotency)', async () => {
    queueAuth();
    h.state.results.push([{
      id: 'sess_existing', reference: 'REF_DUP', amountKobo: 50000,
      merchantId: 'merch_1', status: 'pending',
    }]);
    const res = await post('/api/v1/transaction/initialize', { ...body, reference: 'REF_DUP' });
    const json = await res.json() as any;
    expect(json.data.reference).toBe('REF_DUP');
    expect(json.data.reused).toBe(true);
    expect(h.calls.insert).toHaveLength(0);
  });

  it('validates email and amount (400)', async () => {
    queueAuth();
    const res = await post('/api/v1/transaction/initialize', { email: 'nope', amount: -5 });
    expect(res.status).toBe(400);
  });

  it('GET /transaction/verify returns status AND amount (verify contract)', async () => {
    queueAuth();
    h.state.results.push([txRow({ status: 'completed', amount: 50000 })]);
    const res = await get('/api/v1/transaction/verify/PG_1_ABC');
    expect(res.status).toBe(200);
    const json = await res.json() as any;
    expect(json.data).toMatchObject({
      status: 'success', amount: 50000, reference: 'PG_1_ABC', channel: 'card', currency: 'NGN',
    });
    expect(json.data.paid_at).toBeTruthy();
  });

  it('verify 404s on an unknown reference', async () => {
    queueAuth();
    h.state.results.push([]); // transactions
    h.state.results.push([]); // hosted sessions
    const res = await get('/api/v1/transaction/verify/NOPE');
    expect(res.status).toBe(404);
  });
});

// ─── Idempotency-Key on POSTs ─────────────────────────────────────────────────
describe('Idempotency-Key', () => {
  const body = { email: 'c@example.com', amount: 1000 };

  function queueInitializeHappyPath() {
    h.state.results.push([]);                          // hosted session by ref
    h.state.results.push([]);                          // transaction by ref
    h.state.results.push([{ tenantId: 'ten_default' }]); // merchant
  }

  it('replays the cached response for a repeated key (no re-execution)', async () => {
    const headers = { 'Idempotency-Key': 'idem-key-0001' };
    // Request 1: auth, claim INSERT wins, execute, persist UPDATE.
    queueAuth();
    h.state.results.push([{ id: 'rest:merch_1:idem-key-0001' }]); // claim
    queueInitializeHappyPath();
    const res1 = await post('/api/v1/transaction/initialize', body, headers);
    expect(res1.status).toBe(200);
    const j1 = await res1.json() as any;

    // Request 2: auth, claim loses, select returns the stored row → replay.
    queueAuth();
    h.state.results.push([]); // claim conflict
    h.state.results.push([{
      id: 'rest:merch_1:idem-key-0001', merchantId: 'merch_1',
      requestHash: createHash('sha256').update(JSON.stringify(body)).digest('hex'),
      responseStatus: 200, responseBody: j1.data,
      expiresAt: new Date(Date.now() + 3600_000),
    }]);
    const sessionInsertsBefore = h.calls.insert.filter((v) => v && 'amountKobo' in v).length;
    const res2 = await post('/api/v1/transaction/initialize', body, headers);
    const j2 = await res2.json() as any;
    expect(res2.status).toBe(200);
    expect(j2.data).toEqual(j1.data);
    // The handler body never re-executed: no new hosted-session insert.
    // (The idempotency claim INSERT itself is expected — claim-then-execute.)
    expect(h.calls.insert.filter((v) => v && 'amountKobo' in v).length).toBe(sessionInsertsBefore);
  });

  it('returns 409 when the same key carries a different body', async () => {
    const headers = { 'Idempotency-Key': 'idem-key-0002' };
    queueAuth();
    h.state.results.push([]); // claim conflict
    h.state.results.push([{
      id: 'rest:merch_1:idem-key-0002', merchantId: 'merch_1',
      requestHash: 'different-hash', responseStatus: 200, responseBody: { ok: 1 },
      expiresAt: new Date(Date.now() + 3600_000),
    }]);
    const res = await post('/api/v1/transaction/initialize', body, headers);
    expect(res.status).toBe(409);
    const json = await res.json() as any;
    expect(json.status).toBe(false);
  });
});

// ─── Charge state machine ─────────────────────────────────────────────────────
describe('POST /charge', () => {
  const baseCharge = { email: 'c@example.com', amount: 20000 };

  it('card success → status success + reusable authorization recorded', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'pi_1', status: 'succeeded',
      latest_charge: { payment_method_details: { card: { fingerprint: 'fp_1', brand: 'visa', issuer: 'GTB' } } },
    }), { status: 200 })));
    // Note: auth middleware still runs through the real fetch path? No — auth is DB-based.
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]); // merchant
    // insert(transactions) → default []
    h.state.results.push([]); // cardAuthorizations signature lookup miss
    h.state.results.push([{   // insert(cardAuthorizations).returning()
      id: 'cauth_1', authorizationCode: 'AUTH_new1', last4: '4081',
      brand: 'visa', bank: 'GTB', reusable: true,
    }]);
    // Restore global fetch AFTER auth is not an issue (auth uses no fetch).
    const res = await post('/api/v1/charge', {
      ...baseCharge,
      card: { number: '4084084084084081', cvv: '408', expiry_month: '12', expiry_year: '2030' },
    });
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('success');
    expect(json.data.authorization.authorization_code).toBe('AUTH_new1');
    expect(h.calls.events.some((e) => e.event === 'payment.completed')).toBe(true);
  });

  it('card requires_action → open_url state', async () => {
    process.env.STRIPE_SECRET_KEY = 'sk_test_dummy';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      id: 'pi_2', status: 'requires_action',
      next_action: { redirect_to_url: { url: 'https://3ds.example/abc' } },
    }), { status: 200 })));
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    const res = await post('/api/v1/charge', {
      ...baseCharge,
      card: { number: '4084084084084081', cvv: '408', expiry_month: '12', expiry_year: '2030' },
    });
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(json.data.status).toBe('open_url');
    expect(json.data.url).toBe('https://3ds.example/abc');
  });

  it('card rail unconfigured → 503 (fail loud)', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    const res = await post('/api/v1/charge', {
      ...baseCharge,
      card: { number: '4084084084084081', cvv: '408', expiry_month: '12', expiry_year: '2030' },
    });
    expect(res.status).toBe(503);
    const json = await res.json() as any;
    expect(json.status).toBe(false);
  });

  it('ussd → pay_offline with a dial code', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    const res = await post('/api/v1/charge', { ...baseCharge, ussd: { bank_code: '058' } });
    const json = await res.json() as any;
    expect(json.data.status).toBe('pay_offline');
    expect(json.data.ussd_code).toMatch(/^\*737\*/);
  });

  it('mobile_money with no rail configured → 503 (fail loud)', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    const res = await post('/api/v1/charge', { ...baseCharge, mobile_money: { phone: '0803', provider: 'mtn' } });
    expect(res.status).toBe(503);
  });

  it('bank → pending with virtual account display text', async () => {
    process.env.MIDDLEWARE_BRIDGE_URL = 'http://bridge.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      accountNumber: '0123456789', bankCode: '058', bankName: 'GTBank',
      sessionId: 'nip_1', expiresAt: new Date().toISOString(),
    }), { status: 200 })));
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    const res = await post('/api/v1/charge', { ...baseCharge, bank: { code: '058' } });
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(json.data.status).toBe('pending');
    expect(json.data.display_text).toContain('0123456789');
  });

  it('submit_otp without a reference → 400', async () => {
    queueAuth();
    const res = await post('/api/v1/charge/submit_otp', {});
    expect(res.status).toBe(400);
  });

  it('submit_otp on an unknown charge → 404', async () => {
    queueAuth();
    h.state.results.push([]); // transaction lookup
    const res = await post('/api/v1/charge/submit_otp', { reference: 'PG_X', otp: '123456' });
    expect(res.status).toBe(404);
  });

  it('submit_otp on a pending charge → pending continuation', async () => {
    process.env.MIDDLEWARE_BRIDGE_URL = 'http://bridge.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({ ok: true }), { status: 200 })));
    queueAuth();
    h.state.results.push([txRow({ status: 'pending' })]);
    const res = await post('/api/v1/charge/submit_otp', { reference: 'PG_1_ABC', otp: '123456' });
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('pending');
  });

  it('GET /charge/:reference reports pending check', async () => {
    queueAuth();
    h.state.results.push([txRow({ status: 'pending' })]);
    const res = await get('/api/v1/charge/PG_1_ABC');
    const json = await res.json() as any;
    expect(json.data.status).toBe('pending');
  });
});

// ─── charge_authorization ─────────────────────────────────────────────────────
describe('POST /transaction/charge_authorization', () => {
  const authz = {
    id: 'cauth_1', merchantId: 'merch_1', customerEmail: 'c@example.com',
    authorizationCode: 'AUTH_ok', reusable: true, active: true,
    last4: '4081', brand: 'visa', bank: 'GTB',
  };
  const body = { authorization_code: 'AUTH_ok', email: 'c@example.com', amount: 5000 };

  it('validates required fields (400)', async () => {
    queueAuth();
    const res = await post('/api/v1/transaction/charge_authorization', { email: 'c@example.com' });
    expect(res.status).toBe(400);
  });

  it('404s for an unknown authorization_code', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]); // merchant
    h.state.results.push([]);                            // cardAuthorizations
    const res = await post('/api/v1/transaction/charge_authorization', body);
    expect(res.status).toBe(404);
  });

  it('rejects a deactivated authorization (400)', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([{ ...authz, active: false }]);
    const res = await post('/api/v1/transaction/charge_authorization', body);
    expect(res.status).toBe(400);
  });

  it('queue=true → pending without touching the rail', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([authz]);
    const res = await post('/api/v1/transaction/charge_authorization', { ...body, queue: true });
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('pending');
    expect(h.calls.insert.some((v) => v.metadata?.queued === true)).toBe(true);
  });

  it('rail unavailable → 503 (fail loud, no fabricated success)', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([authz]);
    const res = await post('/api/v1/transaction/charge_authorization', body);
    expect(res.status).toBe(503);
  });

  it('2FA-paused flow → paused:true + authorization_url', async () => {
    process.env.MIDDLEWARE_BRIDGE_URL = 'http://bridge.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      paused: true, authorization_url: 'https://3ds.example/xyz',
    }), { status: 200 })));
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([authz]);
    const res = await post('/api/v1/transaction/charge_authorization', body);
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.paused).toBe(true);
    expect(json.data.authorization_url).toContain('3ds.example');
  });
});

// ─── partial_debit ────────────────────────────────────────────────────────────
describe('POST /transaction/partial_debit', () => {
  const body = {
    authorization_code: 'AUTH_ok', email: 'c@example.com',
    currency: 'NGN', amount: 10000, at_least: 5000,
  };

  it('validates at_least <= amount (400)', async () => {
    queueAuth();
    const res = await post('/api/v1/transaction/partial_debit', { ...body, at_least: 20000 });
    expect(res.status).toBe(400);
  });

  it('fails loud (503) when the rail cannot preflight balance', async () => {
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([{
      id: 'cauth_1', merchantId: 'merch_1', customerEmail: 'c@example.com',
      authorizationCode: 'AUTH_ok', reusable: true, active: true,
    }]);
    const res = await post('/api/v1/transaction/partial_debit', body);
    expect(res.status).toBe(503);
  });

  it('distinguishes amount vs requested_amount on a partial charge', async () => {
    process.env.MIDDLEWARE_BRIDGE_URL = 'http://bridge.test';
    vi.stubGlobal('fetch', vi.fn(async () => new Response(JSON.stringify({
      status: 'success', chargedAmountKobo: 7000,
    }), { status: 200 })));
    queueAuth();
    h.state.results.push([{ tenantId: 'ten_default' }]);
    h.state.results.push([{
      id: 'cauth_1', merchantId: 'merch_1', customerEmail: 'c@example.com',
      authorizationCode: 'AUTH_ok', reusable: true, active: true,
    }]);
    const res = await post('/api/v1/transaction/partial_debit', body);
    vi.unstubAllGlobals();
    const json = await res.json() as any;
    expect(res.status).toBe(200);
    expect(json.data.status).toBe('success');
    expect(json.data.amount).toBe(7000);
    expect(json.data.requested_amount).toBe(10000);
  });
});
