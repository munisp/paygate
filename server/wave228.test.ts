/**
 * wave228.test.ts — Wave 228 Quick Wins Tests
 *
 * Tests for:
 * 1. PDF export router (transactions, settlements, monthly statement)
 * 2. Cashback/rewards engine (getTierInfo, earnOnTransaction, redeem, listHistory, getAnalytics)
 * 3. API docs router (getCatalogue, getOpenAPISpec, getSDKInfo, getChangelog, search)
 */
import { describe, it, expect, vi, beforeAll } from 'vitest';

// ─── Mock logger ─────────────────────────────────────────────────────────────
vi.mock('./logger', () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

// ─── Mock pdfkit ─────────────────────────────────────────────────────────────
vi.mock('pdfkit', () => ({
  default: class MockPDFDocument {
    private handlers: Record<string, Function[]> = {};
    page = { width: 595, height: 842 };
    y = 100;
    on(event: string, handler: Function) {
      this.handlers[event] = this.handlers[event] || [];
      this.handlers[event].push(handler);
      return this;
    }
    fontSize() { return this; }
    font() { return this; }
    text() { return this; }
    fillColor() { return this; }
    rect() { return this; }
    fill() { return this; }
    addPage() { return this; }
    moveDown() { return this; }
    end() {
      const data = Buffer.from('%PDF-1.4 mock pdf content');
      (this.handlers['data'] || []).forEach(h => h(data));
      (this.handlers['end'] || []).forEach(h => h());
    }
  },
}));

// ─── Mock db ─────────────────────────────────────────────────────────────────
vi.mock('./db', () => ({
  getUserByOpenId: vi.fn().mockResolvedValue({
    id: 42, openId: 'open_wave228', name: 'Test User', email: 'test@wave228.ng',
  }),
  getMerchantByOwnerId: vi.fn().mockResolvedValue({
    id: 'merch_wave228', businessName: 'Wave228 Test Merchant', ownerId: 42,
  }),
  getDb: vi.fn().mockResolvedValue((() => {
    const txRows = [
      { id: 'tx1', reference: 'REF001', amount: 500000, currency: 'NGN', status: 'completed', channel: 'card', customerEmail: 'a@b.com', createdAt: new Date('2026-06-01') },
    ];
    const cbTxRows = [
      { id: 'cb_tx1', merchantId: 'merch_wave228', type: 'earn', amountKobo: 5000, balanceAfterKobo: 55000, transactionId: 'tx1', note: null, createdAt: new Date() },
    ];
    const countRow = [{ total: 1 }];
    const cbBalanceRow = [{
      id: 'cb1', merchantId: 'merch_wave228', cashbackBalanceKobo: 50000,
      totalEarnedKobo: 150000, totalRedeemedKobo: 100000, pendingKobo: 0,
      tier: 'bronze', cashbackRate: '0.02', maxCashbackKobo: 50000,
      minTransactionKobo: 10000, enabled: 1, updatedAt: new Date(), createdAt: new Date(),
    }];
    const analyticsRows = [
      { type: 'earn', total: '150000', txCount: '15' },
      { type: 'redeem', total: '100000', txCount: '10' },
    ];
    let isCountQuery = false;
    const makeWhere = (rows: any[]) => {
      const w: any = {
        then: (res: any, rej?: any) => Promise.resolve(rows).then(res, rej),
        catch: (rej: any) => Promise.resolve(rows).catch(rej),
        orderBy: vi.fn().mockImplementation(() => w),
        groupBy: vi.fn().mockResolvedValue(analyticsRows),
        limit: vi.fn().mockReturnValue({
          offset: vi.fn().mockResolvedValue(cbTxRows),
          then: (res: any) => Promise.resolve(cbTxRows).then(res),
        }),
      };
      return w;
    };
    const chain: any = {
      select: vi.fn().mockImplementation((fields?: any) => {
        isCountQuery = !!(fields && 'total' in fields);
        return chain;
      }),
      from: vi.fn().mockReturnThis(),
      where: vi.fn().mockImplementation(() => makeWhere(isCountQuery ? countRow : cbTxRows)),
      orderBy: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnValue({
        offset: vi.fn().mockResolvedValue(txRows),
        then: (res: any) => Promise.resolve(txRows).then(res),
      }),
      insert: vi.fn().mockReturnThis(),
      values: vi.fn().mockReturnThis(),
      returning: vi.fn().mockResolvedValue(cbBalanceRow),
      update: vi.fn().mockReturnThis(),
      set: vi.fn().mockReturnThis(),
      groupBy: vi.fn().mockResolvedValue(analyticsRows),
      transaction: vi.fn().mockImplementation(async (fn: any) => fn({
        update: vi.fn().mockReturnThis(),
        set: vi.fn().mockReturnThis(),
        where: vi.fn().mockResolvedValue(undefined),
        insert: vi.fn().mockReturnThis(),
        values: vi.fn().mockResolvedValue(undefined),
      })),
    };
    return chain;
  })()),
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────
import type { TrpcContext } from './_core/context';

function makeCtx(): TrpcContext {
  return {
    user: {
      id: 42,
      openId: 'open_wave228',
      email: 'test@wave228.ng',
      name: 'Test User',
      role: 'user',
      loginMethod: 'manus',
      createdAt: new Date(),
      updatedAt: new Date(),
      lastSignedIn: new Date(),
    },
    req: { headers: { origin: 'https://test.manus.space' }, protocol: 'https' } as TrpcContext['req'],
    res: {} as TrpcContext['res'],
  };
}

// ─── Load routers ─────────────────────────────────────────────────────────────
let pdfExportRouter: any;
let cashbackRewardsRouter: any;
let apiDocsRouter: any;

beforeAll(async () => {
  const mod = await import('./routers/wave228');
  pdfExportRouter = mod.pdfExportRouter;
  cashbackRewardsRouter = mod.cashbackRewardsRouter;
  apiDocsRouter = mod.apiDocsRouter;
}, 15000);

// ─── PDF Export Tests ─────────────────────────────────────────────────────────

describe('pdfExportRouter', () => {
  it('exports pdfExportRouter with transactions, settlements, monthlyStatement', () => {
    expect(pdfExportRouter).toBeDefined();
    expect(pdfExportRouter.transactions).toBeDefined();
    expect(pdfExportRouter.settlements).toBeDefined();
    expect(pdfExportRouter.monthlyStatement).toBeDefined();
  });

  it('transactions returns a PDF buffer (base64 string)', async () => {
    const caller = pdfExportRouter.createCaller(makeCtx());
    const result = await caller.transactions({ from: '2026-01-01', to: '2026-06-30' });
    expect(result).toHaveProperty('pdfBase64');
    expect(typeof result.pdfBase64).toBe('string');
    expect(result).toHaveProperty('filename');
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('settlements returns a PDF buffer', async () => {
    const caller = pdfExportRouter.createCaller(makeCtx());
    const result = await caller.settlements({ from: '2026-01-01', to: '2026-06-30' });
    expect(result).toHaveProperty('pdfBase64');
    expect(typeof result.pdfBase64).toBe('string');
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('monthlyStatement accepts year and month', async () => {
    const caller = pdfExportRouter.createCaller(makeCtx());
    const result = await caller.monthlyStatement({ year: 2026, month: 6 });
    expect(result).toHaveProperty('pdfBase64');
    expect(result.filename).toMatch(/\.pdf$/);
  });

  it('transactions filters by status when provided', async () => {
    const caller = pdfExportRouter.createCaller(makeCtx());
    const result = await caller.transactions({ from: '2026-01-01', to: '2026-06-30', status: 'completed' });
    expect(result).toHaveProperty('pdfBase64');
  });
});

// ─── Cashback Rewards Tests ───────────────────────────────────────────────────

describe('cashbackRewardsRouter', () => {
  it('exports all required procedures', () => {
    expect(cashbackRewardsRouter.getBalance).toBeDefined();
    expect(cashbackRewardsRouter.listHistory).toBeDefined();
    expect(cashbackRewardsRouter.earnOnTransaction).toBeDefined();
    expect(cashbackRewardsRouter.redeem).toBeDefined();
    expect(cashbackRewardsRouter.getTierInfo).toBeDefined();
    expect(cashbackRewardsRouter.getAnalytics).toBeDefined();
  });

  it('getTierInfo returns 4 tiers with correct names', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getTierInfo();
    expect(result.tiers).toHaveLength(4);
    const tierNames = result.tiers.map((t: any) => t.name);
    expect(tierNames).toContain('bronze');
    expect(tierNames).toContain('silver');
    expect(tierNames).toContain('gold');
    expect(tierNames).toContain('platinum');
  });

  it('getTierInfo cashback rates increase with tier', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getTierInfo();
    const rates = result.tiers.map((t: any) => t.cashbackRate);
    for (let i = 1; i < rates.length; i++) {
      expect(rates[i]).toBeGreaterThan(rates[i - 1]);
    }
  });

  it('getTierInfo returns description string', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getTierInfo();
    expect(typeof result.description).toBe('string');
    expect(result.description.length).toBeGreaterThan(10);
  });

  it('getBalance returns balance object', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getBalance();
    // getBalance returns the cashbackBalances row (or a newly created one)
    expect(result).toBeDefined();
    expect(typeof result).toBe('object');
  });

  it('earnOnTransaction returns earned amount and new balance', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.earnOnTransaction({ transactionId: 'tx_test', transactionAmountKobo: 100000 });
    expect(result).toHaveProperty('earned');
    expect(result).toHaveProperty('newBalance');
    expect(typeof result.earned).toBe('number');
  });

  it('listHistory returns items array', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.listHistory({ limit: 10, offset: 0 });
    // listHistory returns { rows, total, limit, offset }
    expect(result).toHaveProperty('rows');
    expect(Array.isArray(result.rows)).toBe(true);
  });

  it('getAnalytics returns summary object', async () => {
    const caller = cashbackRewardsRouter.createCaller(makeCtx());
    const result = await caller.getAnalytics({ from: '2026-01-01', to: '2026-06-30' });
    expect(result).toHaveProperty('totalEarnedKobo');
    expect(result).toHaveProperty('totalRedeemedKobo');
    expect(result).toHaveProperty('earnCount');
    expect(result).toHaveProperty('redeemCount');
  });
});

// ─── API Docs Tests ───────────────────────────────────────────────────────────

describe('apiDocsRouter', () => {
  it('exports all required procedures', () => {
    expect(apiDocsRouter.getCatalogue).toBeDefined();
    expect(apiDocsRouter.getOpenAPISpec).toBeDefined();
    expect(apiDocsRouter.getSDKInfo).toBeDefined();
    expect(apiDocsRouter.getChangelog).toBeDefined();
    expect(apiDocsRouter.search).toBeDefined();
  });

  it('getCatalogue returns version, baseUrl, procedures, groups', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getCatalogue();
    expect(result.version).toMatch(/^\d+\.\d+\.\d+$/);
    expect(result.baseUrl).toMatch(/^https?:\/\//);
    expect(Array.isArray(result.procedures)).toBe(true);
    expect(result.procedures.length).toBeGreaterThan(10);
    expect(Array.isArray(result.groups)).toBe(true);
    expect(result.groups).toContain('Payments');
    expect(result.groups).toContain('Cashback');
  });

  it('getCatalogue procedures have required fields', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getCatalogue();
    for (const p of result.procedures) {
      expect(p).toHaveProperty('group');
      expect(p).toHaveProperty('name');
      expect(p).toHaveProperty('method');
      expect(p).toHaveProperty('path');
      expect(p).toHaveProperty('summary');
      expect(p).toHaveProperty('auth');
      expect(p).toHaveProperty('params');
    }
  });

  it('getOpenAPISpec returns valid OpenAPI 3.0 structure', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getOpenAPISpec();
    expect(result.openapi).toBe('3.0.3');
    expect(result.info).toHaveProperty('title');
    expect(result.info).toHaveProperty('version');
    expect(result.servers).toHaveLength(2);
    expect(result.paths).toBeDefined();
    expect(Object.keys(result.paths).length).toBeGreaterThan(5);
    expect(result.components.securitySchemes).toHaveProperty('bearerAuth');
  });

  it('getOpenAPISpec includes cashback endpoints', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getOpenAPISpec();
    const paths = Object.keys(result.paths);
    expect(paths.some(p => p.includes('cashback'))).toBe(true);
  });

  it('getSDKInfo returns packages and webhookEvents', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getSDKInfo();
    expect(Array.isArray(result.packages)).toBe(true);
    expect(result.packages.length).toBeGreaterThanOrEqual(4);
    expect(Array.isArray(result.webhookEvents)).toBe(true);
    expect(result.webhookEvents).toContain('payment.completed');
    expect(result.webhookEvents).toContain('cashback.earned');
    expect(result.webhookEvents).toContain('cashback.redeemed');
  });

  it('getSDKInfo packages have required fields', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getSDKInfo();
    for (const pkg of result.packages) {
      expect(pkg).toHaveProperty('language');
      expect(pkg).toHaveProperty('package');
      expect(pkg).toHaveProperty('version');
      expect(pkg).toHaveProperty('installCmd');
    }
  });

  it('getChangelog returns array of versions in descending order', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.getChangelog();
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    for (const entry of result) {
      expect(entry).toHaveProperty('version');
      expect(entry).toHaveProperty('date');
      expect(entry).toHaveProperty('changes');
      expect(Array.isArray(entry.changes)).toBe(true);
    }
    expect(result[0].version).toBe('2.0.0');
  });

  it('search finds procedures by cashback keyword', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.search({ query: 'cashback' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    expect(result.every((p: any) =>
      p.name.toLowerCase().includes('cashback') ||
      p.summary.toLowerCase().includes('cashback') ||
      p.group.toLowerCase().includes('cashback')
    )).toBe(true);
  });

  it('search finds procedures by payments keyword', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.search({ query: 'payments' });
    expect(result.length).toBeGreaterThan(0);
  });

  it('search returns empty array for unknown keyword', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.search({ query: 'xyznonexistent999' });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBe(0);
  });

  it('search finds PDF export procedures', async () => {
    const caller = apiDocsRouter.createCaller(makeCtx());
    const result = await caller.search({ query: 'pdf' });
    expect(result.length).toBeGreaterThan(0);
    expect(result.some((p: any) =>
      p.name.toLowerCase().includes('pdf') || p.summary.toLowerCase().includes('pdf')
    )).toBe(true);
  });
});
