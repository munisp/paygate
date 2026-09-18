/**
 * onboardingHardening.test.ts — regression tests for the onboarding/KYC
 * hardening wave (audit gaps G1–G8):
 *
 *   G1  wave27.kyb.updateStatus is platform-admin only; kyb.list is scoped to
 *       the caller's merchant unless platform admin
 *   G2  complianceKyc.updateStatus rejects merchant self-approval
 *   G3  complianceKyc.overrideLiveness requires platform admin
 *   G4  complianceKyc.checkLiveness verifies submission ownership (IDOR)
 *   G5  saveLivenessResult (kyc + complianceKyc) never trusts client `passed`
 *   G6  wave223 onboarding sessions are owner-scoped; approve/reject admin-only
 *   G7  assertApprovedKyc gates payouts.create / payouts.createBulk
 *
 * Mocking pattern follows securityScopingFixes.test.ts / parityFixes.test.ts /
 * payoutsFxFixes.test.ts: server/db is a chainable fake with queued select
 * results, execRaw is queued separately, drizzle-orm is REAL (sql`` templates
 * render to inspectable text), and ../pbac is mocked (must include
 * resolveMerchantTeamRole) so pbacProcedure passes without Permify.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

vi.mock("@grpc/grpc-js", () => ({}), { virtual: true });
vi.mock("@grpc/proto-loader", () => ({ loadSync: () => ({}), load: async () => ({}) }), { virtual: true });
vi.mock("web-push", () => ({ default: {}, setVapidDetails: () => {}, sendNotification: async () => ({}) }), { virtual: true });

// ─── Hoisted fake state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  returningQueue: [] as any[][],
  whereConds: [] as any[],
  updateSets: [] as any[],
  insertedValues: [] as any[],
  execCalls: [] as string[],
  execRawQueue: [] as any[][],
  execRawCalls: [] as Array<{ query: string; params: any[] }>,
  merchant: { id: "merch_1", ownerId: 7, tenantId: "ten_default", businessName: "Test Merchant" } as any,
  user: { id: 7, openId: "user-open", name: "User", email: "u@example.com", role: "user" } as any,
}));

function reset() {
  h.selectQueue = [];
  h.returningQueue = [];
  h.whereConds = [];
  h.updateSets = [];
  h.insertedValues = [];
  h.execCalls = [];
  h.execRawQueue = [];
  h.execRawCalls = [];
  h.merchant = { id: "merch_1", ownerId: 7, tenantId: "ten_default", businessName: "Test Merchant" };
  h.user = { id: 7, openId: "user-open", name: "User", email: "u@example.com", role: "user" };
}

/** Collect every string leaf out of a drizzle sql``/condition object tree. */
function sqlTextOf(q: any): string {
  const seen = new Set<any>();
  const parts: string[] = [];
  const walk = (v: any) => {
    if (v == null) return;
    if (typeof v === "string") { parts.push(v); return; }
    if (typeof v !== "object") return;
    if (seen.has(v)) return;
    seen.add(v);
    if (Array.isArray(v)) { v.forEach(walk); return; }
    for (const key of Object.keys(v)) walk(v[key]);
  };
  walk(q);
  return parts.join(" ");
}

// ─── server/db mock ───────────────────────────────────────────────────────────
vi.mock("../db", async (importOriginal) => {
  const orig = await importOriginal<any>();
  function makeSelectQuery(): any {
    const q: any = {};
    q.from = vi.fn(() => q);
    q.where = vi.fn((c: any) => { h.whereConds.push(c); return q; });
    q.orderBy = vi.fn(() => q);
    q.groupBy = vi.fn(() => q);
    q.limit = vi.fn(() => q);
    q.offset = vi.fn(() => q);
    q.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    q.then = (resolve: any, reject: any) => {
      const v = h.selectQueue.length ? h.selectQueue.shift()! : [];
      return Promise.resolve(v).then(resolve, reject);
    };
    return q;
  }
  const db: any = {};
  db.select = vi.fn(() => makeSelectQuery());
  db.insert = vi.fn(() => ({
    values: vi.fn((v: any) => {
      h.insertedValues.push(v);
      return { returning: vi.fn(async () => [v]), then: (res: any) => Promise.resolve([v]).then(res) };
    }),
  }));
  db.update = vi.fn(() => {
    const u: any = {};
    u.set = vi.fn((v: any) => { h.updateSets.push(v); return u; });
    u.where = vi.fn((c: any) => { h.whereConds.push(c); return u; });
    u.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    u.then = (res: any) => Promise.resolve({ rowCount: 1 }).then(res);
    return u;
  });
  db.execute = vi.fn(async (q: any) => {
    h.execCalls.push(sqlTextOf(q));
    return { rows: [] };
  });
  return {
    ...orig,
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async (openId: string) => ({ ...h.user, openId })),
    getMerchantByOwnerId: vi.fn(async () => h.merchant),
    updateKycSubmission: vi.fn(async () => null),
    listKycSubmissions: vi.fn(async () => ({ rows: [], total: 0 })),
    execRaw: vi.fn(async (_db: any, query: string, params: any[] = []) => {
      h.execRawCalls.push({ query, params });
      return h.execRawQueue.length ? h.execRawQueue.shift()! : [];
    }),
  };
});

// ─── PBAC mock (MUST include resolveMerchantTeamRole — pbacProcedure uses it) ─
vi.mock("../pbac", () => ({
  resolveMerchantTeamRole: vi.fn(async () => ({ role: "owner", source: "test" })),
  requirePermission: vi.fn(async () => {}),
  MONEY_ACTIONS: [],
}));

vi.mock("../idempotency", () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
  derivePayoutIdempotencyKey: vi.fn(() => "test-idem-key"),
}));

vi.mock("../kafkaClient", () => ({
  publishAuditEvent: vi.fn(async () => true),
  publishPayoutEvent: vi.fn(async () => true),
}));

vi.mock("../auditEvents", () => ({ publishAuditEvent: vi.fn(async () => true) }));
vi.mock("../security27", () => ({ calculateSecurityScore: vi.fn(async () => ({})) }));
vi.mock("../_core/notification", () => ({ notifyOwner: vi.fn(async () => true) }));
vi.mock("../platformNotifications", () => ({
  notifyDisputeOpened: vi.fn(async () => true),
  notifyDisputeEscalated: vi.fn(async () => true),
  notifyDisputeResolved: vi.fn(async () => true),
  notifyPayoutInitiated: vi.fn(async () => true),
  notifyPayoutApproved: vi.fn(async () => true),
  notifyKycSubmitted: vi.fn(async () => true),
  notifyHighRiskTransaction: vi.fn(async () => true),
}));
vi.mock("../logger", () => ({ logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));

// ─── Subjects ─────────────────────────────────────────────────────────────────
import { wave27Router } from "../wave27Router";
import { wave223Router } from "./wave223_onboarding";
import { kycRouter, assertApprovedKyc } from "./kyc";
import { appRouter } from "../routers";

const adminCtx = { user: { id: 1, openId: "admin-open", role: "admin", name: "Admin" } } as any;
const userCtx = { user: { id: 7, openId: "user-open", role: "user", name: "User" } } as any;
const otherCtx = { user: { id: 999, openId: "other-open", role: "user", name: "Other" } } as any;

const wave27 = (ctx: any) => (wave27Router as any).createCaller(ctx);
const wave223 = (ctx: any) => wave223Router.createCaller(ctx);
const kyc = (ctx: any) => kycRouter.createCaller(ctx);
const app = (ctx: any) => appRouter.createCaller(ctx);

/** Queue a users-role lookup (drizzle select) for admin gates. */
function queueRole(role: string) {
  h.selectQueue.push([{ role }]);
}
/** Queue a users-role lookup via execRaw (wave223 gates). */
function queueRoleRaw(role: string) {
  h.execRawQueue.push([{ role }]);
}

beforeEach(reset);

// ─── G1: wave27 kyb alias ─────────────────────────────────────────────────────
describe("G1 wave27.kyb", () => {
  it("updateStatus rejects a non-admin (KYC approval is a reviewer act)", async () => {
    queueRole("user");
    await expect(wave27(userCtx).kyb.updateStatus({ merchantId: "merch_1", status: "approved" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.updateSets.length).toBe(0);
  });

  it("updateStatus succeeds for a platform admin and stamps reviewedBy", async () => {
    queueRole("admin");
    const res = await wave27(adminCtx).kyb.updateStatus({ merchantId: "merch_1", status: "approved", reviewNote: "ok" });
    expect(res).toEqual({ success: true });
    expect(h.updateSets[0].status).toBe("approved");
    expect(h.updateSets[0].reviewedBy).toBe("admin-open");
  });

  it("list scopes rows/total/stats to the caller's merchant", async () => {
    queueRole("user");                       // resolveCallerMerchantScope: role check
    h.selectQueue.push([{ id: "merch_1" }]); // merchant by ownerId
    h.selectQueue.push([]);                  // rows
    h.selectQueue.push([{ total: 0 }]);      // total
    for (let i = 0; i < 5; i++) h.selectQueue.push([{ c: 0 }]); // stats
    const res = await wave27(userCtx).kyb.list({ page: 1, limit: 20 });
    expect(res.total).toBe(0);
    const condText = h.whereConds.map(sqlTextOf).join(" || ");
    expect(condText).toContain("merchant_id");
    expect(condText).toContain("merch_1");
  });

  it("list is unscoped for a platform admin", async () => {
    queueRole("admin");
    h.selectQueue.push([]);                  // rows
    h.selectQueue.push([{ total: 0 }]);
    for (let i = 0; i < 5; i++) h.selectQueue.push([{ c: 0 }]);
    await wave27(adminCtx).kyb.list({ page: 1, limit: 20 });
    const condText = h.whereConds.map(sqlTextOf).join(" || ");
    expect(condText).not.toContain("merch_1");
  });
});

// ─── G2: complianceKyc.updateStatus ──────────────────────────────────────────
describe("G2 complianceKyc.updateStatus", () => {
  it("rejects a merchant approving its OWN KYC", async () => {
    queueRole("user");
    await expect(app(userCtx).complianceKyc.updateStatus({ id: "kyc_1", status: "approved" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.updateSets.length).toBe(0);
  });

  it("platform admin can approve; reviewedBy comes from the session user", async () => {
    queueRole("admin");                      // requireCompliancePlatformAdmin
    h.selectQueue.push([{ merchantId: "merch_1" }]); // target submission lookup
    const res = await app(adminCtx).complianceKyc.updateStatus({ id: "kyc_1", status: "approved" });
    expect(res).toEqual({ success: true });
    expect(h.updateSets[0].reviewedBy).toBe("admin-open");
    expect(h.updateSets[0].reviewedAt).toBeInstanceOf(Date);
  });
});

// ─── G3: complianceKyc.overrideLiveness ──────────────────────────────────────
describe("G3 complianceKyc.overrideLiveness", () => {
  it("rejects a non-admin", async () => {
    queueRole("user");
    await expect(app(userCtx).complianceKyc.overrideLiveness({
      submissionId: "kyc_1", override: true, note: "borderline score, documents verified",
    })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.updateSets.length).toBe(0);
  });

  it("admin override records actor, note and stamps livenessPassedAt", async () => {
    queueRole("admin");
    const res = await app(adminCtx).complianceKyc.overrideLiveness({
      submissionId: "kyc_1", override: true, note: "borderline score, documents verified",
    });
    expect(res.overridden).toBe(true);
    expect(h.updateSets[0].livenessOverrideBy).toBe("admin-open");
    expect(h.updateSets[0].livenessOverrideNote).toContain("borderline");
    expect(h.updateSets[0].livenessPassedAt).toBeInstanceOf(Date);
  });
});

// ─── G4: complianceKyc.checkLiveness IDOR ────────────────────────────────────
describe("G4 complianceKyc.checkLiveness", () => {
  it("rejects a submissionId belonging to another merchant (no throttle/persist writes)", async () => {
    h.selectQueue.push([{ merchantId: "merch_OTHER" }]); // ownership check
    await expect(app(userCtx).complianceKyc.checkLiveness({
      submissionId: "kyc_other", frameBase64: "AAAA", mode: "passive",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.updateSets.length).toBe(0); // no throttle increment, no persist
  });

  it("rejects an unknown submissionId", async () => {
    h.selectQueue.push([]); // ownership check: no row
    await expect(app(userCtx).complianceKyc.checkLiveness({
      submissionId: "kyc_nope", frameBase64: "AAAA", mode: "passive",
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── G5: client-reported liveness is never authoritative ─────────────────────
describe("G5 saveLivenessResult (client report is unverified metadata)", () => {
  it("kyc.saveLivenessResult: passed=true does NOT set livenessPassedAt/livenessScore", async () => {
    h.selectQueue.push([{ id: "kyc_1" }]); // ownership check
    const res = await kyc(userCtx).saveLivenessResult({
      submissionId: "kyc_1", score: 0.99, passed: true, mode: "passive",
    });
    expect(res).toMatchObject({ success: true, verified: false });
    const set = h.updateSets[0];
    expect("livenessPassedAt" in set).toBe(false);
    expect("livenessScore" in set).toBe(false);
    // stored as client-reported metadata via raw SQL, merchant-scoped
    const execText = h.execCalls.join(" || ");
    expect(execText).toContain("client_reported_liveness_passed");
    expect(execText).toContain("merchant_id");
  });

  it("kyc.saveLivenessResult: another merchant's submission → NOT_FOUND", async () => {
    h.selectQueue.push([]); // ownership check finds nothing (scoped query)
    await expect(kyc(userCtx).saveLivenessResult({
      submissionId: "kyc_other", score: 0.9, passed: true,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.updateSets.length).toBe(0);
  });

  it("complianceKyc.saveLivenessResult: passed=true does NOT set livenessPassedAt/livenessScore", async () => {
    h.selectQueue.push([{ id: "kyc_1" }]); // owned check
    const res = await app(userCtx).complianceKyc.saveLivenessResult({
      submissionId: "kyc_1", livenessScore: 0.99, livenessMode: "passive", passed: true,
    });
    expect(res).toMatchObject({ saved: true, verified: false });
    const set = h.updateSets[0];
    expect("livenessPassedAt" in set).toBe(false);
    expect("livenessScore" in set).toBe(false);
    expect(h.execCalls.join(" || ")).toContain("client_reported_liveness_passed");
  });

  it("complianceKyc.saveLivenessResult: unowned submissionId → NOT_FOUND", async () => {
    h.selectQueue.push([]); // owned check
    await expect(app(userCtx).complianceKyc.saveLivenessResult({
      submissionId: "kyc_other", livenessScore: 0.99, livenessMode: "passive", passed: true,
    })).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.updateSets.length).toBe(0);
  });
});

// ─── G6: wave223 onboarding sessions ─────────────────────────────────────────
describe("G6 wave223 onboarding session ownership", () => {
  it("dfsp.approve rejects a non-admin", async () => {
    queueRoleRaw("user");
    await expect(wave223(userCtx).dfspOnboarding.approve({ sessionId: "s_1", dfspId: "d_1" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(h.updateSets.length).toBe(0);
  });

  it("dfsp.approve succeeds for a platform admin", async () => {
    queueRoleRaw("admin");
    const res = await wave223(adminCtx).dfspOnboarding.approve({ sessionId: "s_1", dfspId: "d_1" });
    expect(res).toEqual({ success: true });
    expect(h.updateSets[0].status).toBe("approved");
  });

  it("dfsp.reject rejects a non-admin", async () => {
    queueRoleRaw("user");
    await expect(wave223(userCtx).dfspOnboarding.reject({ sessionId: "s_1", reason: "incomplete" }))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("dfsp.getSession: another user's session → NOT_FOUND", async () => {
    queueRoleRaw("user");                                    // callerScope role
    h.execRawQueue.push([{ created_by_user_id: "999" }]);    // owner row
    await expect(wave223(userCtx).dfspOnboarding.getSession({ sessionId: "s_1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dfsp.getSession: legacy NULL-owner row is admin-only", async () => {
    queueRoleRaw("user");
    h.execRawQueue.push([{ created_by_user_id: null }]);
    await expect(wave223(userCtx).dfspOnboarding.getSession({ sessionId: "s_legacy" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });

  it("dfsp.updateStep: another user's session → NOT_FOUND (no write)", async () => {
    queueRoleRaw("user");
    h.execRawQueue.push([{ created_by_user_id: "999" }]);
    await expect(wave223(userCtx).dfspOnboarding.updateStep({ sessionId: "s_1", step: 2, data: {} }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(h.updateSets.length).toBe(0);
  });

  it("dfsp.updateStep: owner can update", async () => {
    queueRoleRaw("user");
    h.execRawQueue.push([{ created_by_user_id: "7" }]);
    const res = await wave223(userCtx).dfspOnboarding.updateStep({ sessionId: "s_1", step: 2, data: { contactPhone: "123" } });
    expect(res).toEqual({ success: true });
    expect(h.updateSets[0].currentStep).toBe(2);
  });

  it("dfsp.listSessions filters non-admin callers to their own sessions", async () => {
    queueRoleRaw("user");
    h.selectQueue.push([]); // list rows
    await wave223(userCtx).dfspOnboarding.listSessions({});
    const condText = h.whereConds.map(sqlTextOf).join(" || ");
    expect(condText).toContain("created_by_user_id");
  });

  it("dfsp.listSessions is unfiltered for platform admins", async () => {
    queueRoleRaw("admin");
    h.selectQueue.push([]);
    await wave223(adminCtx).dfspOnboarding.listSessions({});
    const condText = h.whereConds.map(sqlTextOf).join(" || ");
    expect(condText).not.toContain("created_by_user_id");
  });

  it("pisp.getSession: another user's session → NOT_FOUND", async () => {
    queueRoleRaw("user");
    h.execRawQueue.push([{ created_by_user_id: "999" }]);
    await expect(wave223(userCtx).pispOnboarding.getSession({ sessionId: "s_1" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

// ─── G7: assertApprovedKyc + payout gate ─────────────────────────────────────
describe("G7 assertApprovedKyc payout gate", () => {
  it("throws PRECONDITION_FAILED when no approved KYC submission exists", async () => {
    h.selectQueue.push([]); // no approved row
    await expect(assertApprovedKyc("merch_1"))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/KYC verification required/) });
  });

  it("passes when an approved submission exists", async () => {
    h.selectQueue.push([{ id: "kyc_1" }]);
    await expect(assertApprovedKyc("merch_1")).resolves.toBeUndefined();
  });

  it("payouts.create is blocked without approved KYC", async () => {
    h.selectQueue.push([]); // assertApprovedKyc lookup → no approved row
    await expect(app(userCtx).payouts.create({ amount: 10000, currency: "NGN" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/KYC verification required/) });
  });

  it("payouts.create proceeds past the KYC gate when approved (fails later on funds, not KYC)", async () => {
    h.selectQueue.push([{ id: "kyc_1" }]); // approved row
    await expect(app(userCtx).payouts.create({ amount: 10000, currency: "NGN" }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/Insufficient funds/) });
  });

  it("payouts.createBulk is blocked without approved KYC", async () => {
    h.selectQueue.push([]);
    await expect(app(userCtx).payouts.createBulk({ rows: [{ amount: 10000, currency: "NGN" }] }))
      .rejects.toMatchObject({ code: "PRECONDITION_FAILED", message: expect.stringMatching(/KYC verification required/) });
  });
});
