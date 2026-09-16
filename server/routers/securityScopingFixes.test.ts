/**
 * securityScopingFixes.test.ts — regression tests for the audited security
 * findings C14 (PBAC merchant-team role), H21/H22 (cross-merchant IDOR),
 * H24 (rate-limit classifier) and the audit actor-forgery fix.
 *
 * Mocking pattern follows apApprovals.test.ts: drizzle/schema is mocked with
 * string column names, drizzle-orm operators return structured condition
 * objects (so tests can assert the WHERE carries a merchant predicate), and
 * server/db is a chainable fake with queued select/returning results.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Shared mock state ────────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  returningQueue: [] as any[][],
  whereConds: [] as any[],
  insertedValues: [] as any[],
  updateSets: [] as any[],
  merchantForOwner: { id: "merch_1", ownerId: 7 } as any,
}));

// ─── drizzle/schema mock (string column names; only tables under test) ───────
vi.mock("../../drizzle/schema", () => ({
  users: { id: "users.id", openId: "users.openId", role: "users.role", name: "users.name", email: "users.email" },
  teamMembers: { id: "teamMembers.id", merchantId: "teamMembers.merchantId", userId: "teamMembers.userId", role: "teamMembers.role", status: "teamMembers.status" },
  ptspBatches: { id: "ptspBatches.id", merchantId: "ptspBatches.merchantId", status: "ptspBatches.status" },
  emiLoans: { id: "emiLoans.id", userId: "emiLoans.userId", status: "emiLoans.status" },
  auditEvents: { id: "auditEvents.id", merchantId: "auditEvents.merchantId" },
  regulatoryReports: { id: "regulatoryReports.id", merchantId: "regulatoryReports.merchantId", status: "regulatoryReports.status" },
  reconciliationAlerts: { id: "reconciliationAlerts.id", merchantId: "reconciliationAlerts.merchantId", status: "reconciliationAlerts.status" },
}));

vi.mock("drizzle-orm", () => ({
  eq: vi.fn((...a: any[]) => ({ op: "eq", a })),
  and: vi.fn((...a: any[]) => ({ op: "and", a })),
  or: vi.fn((...a: any[]) => ({ op: "or", a })),
  desc: vi.fn((c: any) => ({ op: "desc", c })),
  asc: vi.fn((c: any) => ({ op: "asc", c })),
  inArray: vi.fn((...a: any[]) => ({ op: "inArray", a })),
  isNull: vi.fn((c: any) => ({ op: "isNull", c })),
  gte: vi.fn((...a: any[]) => ({ op: "gte", a })),
  lte: vi.fn((...a: any[]) => ({ op: "lte", a })),
  like: vi.fn((...a: any[]) => ({ op: "like", a })),
  sql: vi.fn(() => ({ op: "sql" })),
}));

// ─── server/db mock (chainable fake, queued results) ─────────────────────────
vi.mock("../../server/db", () => {
  function makeSelectQuery(): any {
    const q: any = {};
    q.from = vi.fn(() => q);
    q.where = vi.fn((c: any) => { h.whereConds.push(c); return q; });
    q.orderBy = vi.fn(() => q);
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
    values: vi.fn((v: any) => {
      h.insertedValues.push(v);
      return { returning: vi.fn(async () => [v]) };
    }),
  }));
  db.update = vi.fn(() => {
    const u: any = {};
    u.set = vi.fn((v: any) => { h.updateSets.push(v); return u; });
    u.where = vi.fn((c: any) => { h.whereConds.push(c); return u; });
    u.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return u;
  });
  db.delete = vi.fn(() => {
    const d: any = {};
    d.where = vi.fn((c: any) => { h.whereConds.push(c); return d; });
    d.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    return d;
  });
  db.transaction = vi.fn(async (fn: any) => fn(db));
  return {
    getDb: vi.fn(async () => db),
    db,
    getUserByOpenId: vi.fn(async (openId: string) => ({ id: 7, openId, name: "Owner One", email: "o@example.com" })),
    getMerchantByOwnerId: vi.fn(async () => h.merchantForOwner),
  };
});

vi.mock("../kafkaClient", () => ({ publishAuditEvent: vi.fn(async () => true) }));
vi.mock("../_core/demoData", () => ({ demoOrFail: (v: any) => v }));

import { crud120Router } from "./crud120";
import { resolveMerchantTeamRole, requirePermission, MONEY_ACTIONS } from "../pbac";
import { classifyTrpcRequest } from "../rateLimit";

const ctx = {
  user: { id: 7, openId: "open-1", name: "Owner One", email: "o@example.com", role: "user" },
} as any;
const caller = crud120Router.createCaller(ctx);

function reset() {
  h.selectQueue = [];
  h.returningQueue = [];
  h.whereConds = [];
  h.insertedValues = [];
  h.updateSets = [];
  h.merchantForOwner = { id: "merch_1", ownerId: 7 };
}

/** Flatten condition tree to the list of eq(column, value) leaves. */
function eqLeaves(cond: any): Array<[any, any]> {
  if (!cond || typeof cond !== "object") return [];
  if (cond.op === "eq") return [[cond.a[0], cond.a[1]]];
  if (Array.isArray(cond.a)) return cond.a.flatMap(eqLeaves);
  return [];
}

beforeEach(reset);
afterEach(() => vi.unstubAllGlobals());

// ─── H21: cross-merchant IDOR rejection ───────────────────────────────────────
describe("H21 — cross-merchant access is rejected", () => {
  it("ptspBatches.settle scopes by merchant and rejects other merchants' batches", async () => {
    // DB returns no row for (id, other-merchant) → NOT_FOUND, never settled.
    h.returningQueue.push([]);
    await expect(caller.ptsp.settle({ id: "ptsp_other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const leaves = h.whereConds.flatMap(eqLeaves);
    expect(leaves).toContainEqual(["ptspBatches.merchantId", "merch_1"]);
  });

  it("ptspBatches.settle succeeds for the caller's own batch", async () => {
    h.returningQueue.push([{ id: "ptsp_mine" }]);
    await expect(caller.ptsp.settle({ id: "ptsp_mine" })).resolves.toEqual({ success: true });
  });

  it("approveLoan rejects a non-admin (lender-side action, fail closed)", async () => {
    h.selectQueue.push([{ role: "user" }]); // requirePlatformAdmin DB check
    await expect(caller.emiLoans.approveLoan({ id: "loan_other" })).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("auditEvents.get scopes by merchant and rejects cross-merchant reads", async () => {
    h.selectQueue.push([]); // (id, other-merchant) finds nothing
    await expect(caller.auditEvents.get({ id: 42 })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const leaves = h.whereConds.flatMap(eqLeaves);
    expect(leaves).toContainEqual(["auditEvents.merchantId", "merch_1"]);
  });

  it("regulatoryReports.submit scopes by merchant and rejects cross-merchant submit", async () => {
    h.returningQueue.push([]);
    await expect(caller.regulatoryReports.submit({ id: "rep_other" })).rejects.toMatchObject({ code: "NOT_FOUND" });
    const leaves = h.whereConds.flatMap(eqLeaves);
    expect(leaves).toContainEqual(["regulatoryReports.merchantId", "merch_1"]);
  });

  it("reconciliationAlerts.resolve scopes by merchant and rejects cross-merchant resolve", async () => {
    h.returningQueue.push([]);
    await expect(
      caller.reconciliation.resolve({ id: "alert_other", resolution: "fixed" })
    ).rejects.toMatchObject({ code: "NOT_FOUND" });
    const leaves = h.whereConds.flatMap(eqLeaves);
    expect(leaves).toContainEqual(["reconciliationAlerts.merchantId", "merch_1"]);
  });
});

// ─── H21: audit actor-forgery ─────────────────────────────────────────────────
describe("H21 — auditEvents.create cannot forge the actor", () => {
  it("actor identity is forced to the authenticated caller; client actor fields are stripped", async () => {
    await caller.auditEvents.create({
      // Forgery attempt — these fields are no longer in the input schema and
      // must never reach the INSERT:
      actorId: "999",
      actorName: "Mallory Admin",
      action: "payout.approved",
      resource: "payout",
    } as any);
    expect(h.insertedValues).toHaveLength(1);
    const v = h.insertedValues[0];
    expect(v.actorId).toBe("7"); // String(ctx.user.id)
    expect(v.actorName).toBe("Owner One"); // server-side user record
    expect(v.merchantId).toBe("merch_1");
    expect(v.action).toBe("payout.approved");
  });
});

// ─── C14: PBAC merchant-team role resolution ──────────────────────────────────
describe("C14 — resolveMerchantTeamRole", () => {
  it("uses the team_members role when a membership row exists (member)", async () => {
    h.selectQueue.push([{ merchantId: "merch_1", role: "finance_manager", status: "active" }]);
    const r = await resolveMerchantTeamRole("open-1");
    expect(r).toEqual({ merchantId: "merch_1", role: "finance_manager" });
  });

  it("uses the team_members role for viewers", async () => {
    h.selectQueue.push([{ merchantId: "merch_1", role: "viewer", status: "invited" }]);
    const r = await resolveMerchantTeamRole("open-1");
    expect(r.role).toBe("viewer");
  });

  it("denies a disabled membership (fail closed)", async () => {
    h.selectQueue.push([{ merchantId: "merch_1", role: "owner", status: "disabled" }]);
    await expect(resolveMerchantTeamRole("open-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("compat path: no team row but caller owns the merchant → owner role", async () => {
    h.selectQueue.push([]); // no team_members row
    const r = await resolveMerchantTeamRole("open-1");
    expect(r).toEqual({ merchantId: "merch_1", role: "owner" });
  });

  it("no membership and no owned merchant → FORBIDDEN (global role never trusted)", async () => {
    h.selectQueue.push([]);
    h.merchantForOwner = null;
    await expect(resolveMerchantTeamRole("open-1")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── C14: money-action fail-closed when Permify is down ───────────────────────
describe("C14 — money actions fail closed (503) when Permify is down", () => {
  it("payout:approve → SERVICE_UNAVAILABLE instead of local-matrix fallback", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("permify down"); }));
    await expect(requirePermission("7", "owner", "payout", "approve")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("api_key:revoke → SERVICE_UNAVAILABLE", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("permify down"); }));
    await expect(requirePermission("7", "owner", "api_key", "revoke")).rejects.toMatchObject({
      code: "SERVICE_UNAVAILABLE",
    });
  });

  it("virtual_card:topup is a money action", () => {
    expect(MONEY_ACTIONS.has("virtual_card:topup")).toBe(true);
  });

  it("non-money actions still use the local matrix when Permify is down (owner → allowed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("permify down"); }));
    await expect(requirePermission("7", "owner", "billing", "view")).resolves.toBeUndefined();
  });

  it("non-money actions deny unknown roles via the matrix (fail closed)", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => { throw new Error("permify down"); }));
    await expect(requirePermission("7", "viewer", "billing", "manage")).rejects.toMatchObject({ code: "FORBIDDEN" });
  });
});

// ─── H24: rate-limit classification ───────────────────────────────────────────
describe("H24 — classifyTrpcRequest", () => {
  it("classifies OTP finalize/verify paths into the strict otp bucket", () => {
    expect(classifyTrpcRequest("POST", ["transfer.finalizeDisableOtp"])).toBe("otp");
    expect(classifyTrpcRequest("POST", ["charge.submit_otp"])).toBe("otp");
    expect(classifyTrpcRequest("POST", ["charge.submitOtp"])).toBe("otp");
  });

  it("classifies public checkout paths into the checkout bucket", () => {
    expect(classifyTrpcRequest("POST", ["hostedCheckout.initiatePayment"])).toBe("checkout");
    expect(classifyTrpcRequest("POST", ["hostedCheckout.confirmPayment"])).toBe("checkout");
  });

  it("classifies new financial prefixes into the financial bucket", () => {
    for (const proc of [
      "refunds.create",
      "paymentRequests.create",
      "transferRecipients.add",
      "dedicatedAccounts.create",
      "splitEngine.split",
      "subscriptionExtras.add",
      "ecommerce.createOrder",
      "directDebit.mandate",
      "walletPay.pay",
      "dva.assign",
      "settlements.trigger",
    ]) {
      expect(classifyTrpcRequest("POST", [proc])).toBe("financial");
    }
  });

  it("keeps payouts in the tightest bucket and exports in the export bucket", () => {
    expect(classifyTrpcRequest("POST", ["payouts.initiate"])).toBe("payout");
    expect(classifyTrpcRequest("POST", ["regulatoryReports.generate"])).toBe("export");
  });

  it("classifies reads, generic mutations, and batched OTP wins", () => {
    expect(classifyTrpcRequest("GET", [])).toBe("read");
    expect(classifyTrpcRequest("POST", ["featureFlags.list"])).toBe("mutation");
    // A batch containing any OTP procedure is classified otp (strictest first).
    expect(classifyTrpcRequest("POST", ["payouts.initiate", "transfer.finalizeDisableOtp"])).toBe("otp");
  });
});
