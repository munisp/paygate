/**
 * Orphan wiring tests (W8a)
 *
 * Verifies that previously-exported-but-unmounted server capabilities are now
 * wired in server/_core/index.ts and server/cronJobs.ts:
 *  1. Security middleware (security124 / security27 / security116 /
 *     security32 / security120 / wafMiddleware) — each is a function, behaves
 *     correctly when invoked directly, and is mounted in the Express app.
 *  2. /metrics (tenant-aggregated Prometheus) — mounted with an internal-only
 *     / PROMETHEUS_ENABLED guard.
 *  3. Tenant branding + saga SSE stream routes mounted.
 *  4. SCUML expiry job — POST route mounted and a daily cron entry registered.
 *  5. digitalGold.getPortfolioHistory returns honest empty (source 'live')
 *     when the DB has no rows — no fabricated placeholder months.
 *
 * supertest is not a dependency, so middleware is exercised directly with
 * mock req/res/next and mounts are asserted against the source of
 * _core/index.ts (the same pattern used by wave126.production-readiness.test.ts).
 */

import { describe, it, expect, vi, beforeEach } from "vitest";
import { readFileSync } from "fs";
import { join } from "path";

// ─── Mocks (shared by gold-history + cron tests) ─────────────────────────────
const mockGetDb = vi.fn();
vi.mock("../db", () => ({
  getDb: (...args: unknown[]) => mockGetDb(...args),
  execRaw: vi.fn().mockResolvedValue([]),
}));

vi.mock("../logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() },
  logProcedure: vi.fn(),
}));

vi.mock("../emailService", () => ({ sendEmail: vi.fn().mockResolvedValue(undefined) }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn().mockResolvedValue(true) }));
vi.mock("../workerErrorFilter", () => ({ isSuppressedWorkerError: vi.fn().mockReturnValue(false) }));
vi.mock("../middlewareBridge", () => ({
  buyDigitalGoldViaMiddleware: vi.fn(),
  isBridgeAvailable: vi.fn().mockReturnValue(false),
}));
vi.mock("../kafkaClient", () => ({ publishEvent: vi.fn(), KAFKA_TOPICS: {} }));
vi.mock("../webhookEventHooks", () => ({
  onGoldPurchased: vi.fn(), onGoldSold: vi.fn(), onMutualFundInvested: vi.fn(),
  onMutualFundRedeemed: vi.fn(), onInsurancePolicyCreated: vi.fn(),
  onInsuranceClaimSubmitted: vi.fn(), onPensionContributionPosted: vi.fn(),
  onCashbackEarned: vi.fn(), onCashbackRedeemed: vi.fn(),
  onSoundboxDeviceRegistered: vi.fn(), onEmiContractCreated: vi.fn(),
  onBulkCollectionCreated: vi.fn(), onPosSaleCompleted: vi.fn(),
  onRemittanceInitiated: vi.fn(), onSubscriptionV2Created: vi.fn(),
  onReportReady: vi.fn(),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────
const CORE_INDEX = join(__dirname, "..", "_core", "index.ts");
const coreSource = readFileSync(CORE_INDEX, "utf-8");

function mockReqRes(overrides: Record<string, unknown> = {}) {
  const headers: Record<string, string> = {};
  const req: any = {
    method: "GET",
    path: "/",
    url: "/",
    headers: {},
    socket: { remoteAddress: "127.0.0.1" },
    ...overrides,
  };
  const res: any = {
    locals: {},
    setHeader: vi.fn((k: string, v: string) => { headers[k.toLowerCase()] = v; }),
    status: vi.fn().mockReturnThis(),
    json: vi.fn().mockReturnThis(),
    send: vi.fn().mockReturnThis(),
    _headers: headers,
  };
  const next = vi.fn();
  return { req, res, next };
}

// ─── 1. Security middleware ───────────────────────────────────────────────────
describe("orphan security middleware — exports and behavior", () => {
  it("security27.cspNonceMiddleware sets a nonce and calls next", async () => {
    const { cspNonceMiddleware } = await import("../security27");
    expect(typeof cspNonceMiddleware).toBe("function");
    const { req, res, next } = mockReqRes();
    cspNonceMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(typeof res.locals.cspNonce).toBe("string");
    expect(res.locals.cspNonce.length).toBeGreaterThan(0);
  });

  it("security32.wave32SecurityMiddleware sets headers and calls next", async () => {
    const { wave32SecurityMiddleware } = await import("../security32");
    expect(typeof wave32SecurityMiddleware).toBe("function");
    const { req, res, next } = mockReqRes();
    wave32SecurityMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
    expect(res._headers["x-content-type-options"]).toBe("nosniff");
  });

  it("security120.openAppSecHeaderMiddleware passes clean requests, blocks WAF-flagged ones", async () => {
    const { openAppSecHeaderMiddleware } = await import("../security120");
    expect(typeof openAppSecHeaderMiddleware).toBe("function");
    const clean = mockReqRes();
    openAppSecHeaderMiddleware(clean.req, clean.res, clean.next);
    expect(clean.next).toHaveBeenCalledOnce();

    const blocked = mockReqRes({ headers: { "x-openappsec-action": "block" } });
    openAppSecHeaderMiddleware(blocked.req, blocked.res, blocked.next);
    expect(blocked.next).not.toHaveBeenCalled();
    expect(blocked.res.status).toHaveBeenCalledWith(403);
  });

  it("security120.burstWindowMiddleware factory returns a middleware that admits the first request", async () => {
    const { burstWindowMiddleware } = await import("../security120");
    expect(typeof burstWindowMiddleware).toBe("function");
    const mw = burstWindowMiddleware();
    expect(typeof mw).toBe("function");
    const { req, res, next } = mockReqRes({ headers: { "x-forwarded-for": "203.0.113.10" } });
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("security124.ddosMitigationMiddleware factory returns a middleware that admits the first request", async () => {
    const { ddosMitigationMiddleware } = await import("../security124");
    expect(typeof ddosMitigationMiddleware).toBe("function");
    const mw = ddosMitigationMiddleware();
    expect(typeof mw).toBe("function");
    const { req, res, next } = mockReqRes({ headers: { "x-forwarded-for": "203.0.113.11" } });
    mw(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("security124.ransomwareDetectionMiddleware passes non-delete requests", async () => {
    const { ransomwareDetectionMiddleware } = await import("../security124");
    expect(typeof ransomwareDetectionMiddleware).toBe("function");
    const { req, res, next } = mockReqRes({ method: "GET", url: "/api/trpc/x.list" });
    ransomwareDetectionMiddleware(req, res, next);
    expect(next).toHaveBeenCalledOnce();
  });

  it("security116.payloadScanMiddleware passes GET and safe POST bodies", async () => {
    const { payloadScanMiddleware } = await import("../security116");
    expect(typeof payloadScanMiddleware).toBe("function");
    const getReq = mockReqRes({ method: "GET" });
    payloadScanMiddleware(getReq.req, getReq.res, getReq.next);
    expect(getReq.next).toHaveBeenCalledOnce();
    const postReq = mockReqRes({ method: "POST", body: { note: "hello" } });
    payloadScanMiddleware(postReq.req, postReq.res, postReq.next);
    expect(postReq.next).toHaveBeenCalledOnce();
  });

  it("wafMiddleware.strictWafMiddleware is a function and rejects POST without JSON content-type", async () => {
    const { strictWafMiddleware } = await import("../wafMiddleware");
    expect(typeof strictWafMiddleware).toBe("function");
    const { req, res, next } = mockReqRes({ method: "POST", headers: {} });
    strictWafMiddleware(req, res, next);
    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(415);
  });
});

describe("orphan security middleware — mounted in _core/index.ts", () => {
  const mounts: Array<[string, string]> = [
    ["cspNonce (security27)", "cspNonceMiddleware"],
    ["wave32Security (security32)", "wave32SecurityMiddleware"],
    ["openAppSecHeader (security120)", "openAppSecHeaderMiddleware"],
    ["ddosMitigation (security124)", "ddosMitigationMiddleware()"],
    ["burstWindow (security120)", "burstWindowMiddleware()"],
    ["ransomwareDetection (security124)", "ransomwareDetectionMiddleware"],
    ["payloadScan (security116)", "payloadScanMiddleware"],
    ["strictWaf (wafMiddleware)", "strictWafMiddleware"],
  ];
  for (const [label, token] of mounts) {
    it(`mounts ${label}`, () => {
      expect(coreSource).toContain(token);
    });
  }

  it("skips security116.cspMiddleware loudly (CSP owned by securityHeaders)", () => {
    expect(coreSource).toContain("cspMiddleware SKIPPED");
  });

  it("guards each mount so a failure logs loudly without crashing boot", () => {
    expect(coreSource).toContain("mountGuarded");
    expect(coreSource).toContain("FAILED to mount orphan middleware");
  });
});

// ─── 2. /metrics + tenant branding + saga stream ─────────────────────────────
describe("metrics / branding / saga stream wiring", () => {
  it("mounts GET /metrics with PROMETHEUS_ENABLED / internal-only guard", () => {
    expect(coreSource).toContain('"/metrics"');
    expect(coreSource).toContain("prometheusMetricsHandler");
    expect(coreSource).toContain("PROMETHEUS_ENABLED");
    expect(coreSource).toContain("isInternalMetricsClient");
  });

  it("prometheusMetricsHandler is a function and 500s loudly when DB is unavailable", async () => {
    mockGetDb.mockResolvedValue(null);
    const { prometheusMetricsHandler } = await import("../subdomainMiddleware");
    expect(typeof prometheusMetricsHandler).toBe("function");
    const { req, res } = mockReqRes();
    await prometheusMetricsHandler(req, res);
    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.send).toHaveBeenCalledWith("# Error generating metrics\n");
  });

  it("mounts subdomainMiddleware and tenant branding routes", () => {
    expect(coreSource).toContain("subdomainMiddleware");
    expect(coreSource).toContain('"/api/tenant-branding/:slug/json"');
    expect(coreSource).toContain("tenantBrandingJsonHandler");
  });

  it("mounts sagaStreamHandler at /api/saga/stream/:sagaId with cookie parsing", () => {
    expect(coreSource).toContain('"/api/saga/stream/:sagaId"');
    expect(coreSource).toContain("sagaStreamHandler");
  });
});

// ─── 3. SCUML expiry job ─────────────────────────────────────────────────────
describe("SCUML expiry job wiring", () => {
  it("mounts POST /api/scheduled/scuml-expiry-check like its sibling jobs", () => {
    expect(coreSource).toContain('"/api/scheduled/scuml-expiry-check"');
    expect(coreSource).toContain("scumlExpiryJobHandler");
  });

  it("cronJobs registers a daily SCUML expiry sweep", async () => {
    const cron = await import("../cronJobs");
    expect(typeof cron.runScumlExpiryCheck).toBe("function");
    const cronSource = readFileSync(join(__dirname, "..", "cronJobs.ts"), "utf-8");
    expect(cronSource).toContain("runScumlExpiryCheck");
    expect(cronSource).toContain("24 * 60 * 60 * 1000");
  });

  it("runScumlExpiryCheck fails closed (403) when cron keys are unset, without throwing", async () => {
    delete process.env.BUILT_IN_FORGE_API_KEY;
    delete process.env.MIDDLEWARE_INTERNAL_KEY;
    const { runScumlExpiryCheck } = await import("../cronJobs");
    const result = await runScumlExpiryCheck();
    expect(result.status).toBe(403);
  });
});

// ─── 4. Gold portfolio history — honest empty, no placeholder ────────────────
describe("digitalGold.getPortfolioHistory", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it("returns empty history with source 'live' when DB has no rows", async () => {
    const chain: any = {
      from: () => chain,
      where: () => chain,
      groupBy: () => chain,
      orderBy: () => Promise.resolve([]),
    };
    mockGetDb.mockResolvedValue({ select: () => chain });

    const { digitalGoldRouter } = await import("../newFeaturesRouter");
    const ctx: any = {
      user: {
        id: 1, openId: "test-user", email: "t@example.com", name: "T",
        role: "user", loginMethod: "manus",
        createdAt: new Date(), updatedAt: new Date(), lastSignedIn: new Date(),
      },
      req: { headers: {} },
      res: {},
    };
    const caller = digitalGoldRouter.createCaller(ctx);
    const result = await caller.getPortfolioHistory({ months: 6 });
    expect(result.source).toBe("live");
    expect(result.history).toEqual([]);
  });

  it("never fabricates placeholder months (source-level regression)", () => {
    const src = readFileSync(join(__dirname, "..", "newFeaturesRouter.ts"), "utf-8");
    expect(src).not.toContain("source: 'placeholder'");
    expect(src).toContain("source: 'live'");
  });
});
