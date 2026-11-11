/**
 * wave7GapFixes.test.ts — Wave-7 gap-closure coverage:
 *
 *   A.2  emiRouter.create generates the full emi_installments schedule
 *        (N rows, sum == totalAmountKobo; zero-rate sum == principal)
 *   A.4  regulatorAuth magic-token roundtrip (insert → consume+invalidate
 *        → regulator_sessions row; reuse/expiry rejected)
 *   B.10 wave80 ussdSessionV2.updateMenuFlow persists to ussd_menu_flows
 *        (upsert) and getMenuFlow reads the persisted config back
 *
 * Mocking pattern follows alertSubscriptions.test.ts: server/db is mocked
 * with chainable query builders and queued results; drizzle-orm is REAL
 * (its operators only build query objects); drizzle/schema is REAL so table
 * identity can be asserted on captured insert calls.
 */
import { describe, it, expect, vi, beforeEach } from "vitest";

// ─── hoisted mock state ───────────────────────────────────────────────────────
const h = vi.hoisted(() => ({
  selectQueue: [] as any[][],
  returningQueue: [] as any[][],
  inserts: [] as Array<{ table: any; values: any }>,
  updates: [] as Array<{ table: any; set: any }>,
  emailSent: [] as Array<{ to: string; subject: string }>,
  emailResult: true as boolean,
}));

vi.mock("../../server/db", () => {
  function makeSelectQuery(): any {
    const q: any = {};
    q.from = vi.fn(() => q);
    q.where = vi.fn(() => q);
    q.orderBy = vi.fn(() => q);
    q.offset = vi.fn(() => q);
    q.limit = vi.fn(async () => (h.selectQueue.length ? h.selectQueue.shift()! : []));
    q.then = (resolve: any, reject: any) => {
      const v = h.selectQueue.length ? h.selectQueue.shift()! : [];
      return Promise.resolve(v).then(resolve, reject);
    };
    return q;
  }
  function makeInsert(): any {
    const c: any = {};
    c.values = vi.fn((v: any) => {
      c._values = v;
      return c;
    });
    c.onConflictDoUpdate = vi.fn(() => c);
    c.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    c.then = (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject);
    return c;
  }
  const db: any = {};
  db.select = vi.fn(() => makeSelectQuery());
  db.insert = vi.fn((table: any) => {
    const c = makeInsert();
    const origValues = c.values;
    c.values = vi.fn((v: any) => { h.inserts.push({ table, values: v }); return origValues(v); });
    return c;
  });
  db.update = vi.fn((table: any) => {
    const c: any = {};
    c.set = vi.fn((s: any) => { h.updates.push({ table, set: s }); return c; });
    c.where = vi.fn(() => c);
    c.returning = vi.fn(async () => (h.returningQueue.length ? h.returningQueue.shift()! : []));
    c.then = (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject);
    return c;
  });
  db.delete = vi.fn(() => {
    const c: any = {};
    c.where = vi.fn(() => c);
    c.returning = vi.fn(async () => []);
    c.then = (resolve: any, reject: any) => Promise.resolve(undefined).then(resolve, reject);
    c.catch = vi.fn(() => c);
    return c;
  });
  db.transaction = vi.fn(async (fn: any) => fn(db));
  return {
    db,
    getDb: vi.fn(async () => db),
    getUserByOpenId: vi.fn(async (openId: string) =>
      openId === "open_7" ? { id: 7, openId, name: "Merchant Owner", email: "m@example.com" } : null),
    getMerchantByOwnerId: vi.fn(async () => ({ id: "merch_1", ownerId: 7 })),
  };
});

vi.mock("../../server/emailService", () => ({
  sendEmail: vi.fn(async (opts: any) => {
    h.emailSent.push({ to: opts.to, subject: opts.subject });
    return h.emailResult;
  }),
}));

vi.mock("../../server/logger", () => ({
  logger: { info: vi.fn(), warn: vi.fn(), error: vi.fn() },
}));

vi.mock("../../server/idempotency", () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock("../../server/middlewareBridge", () => ({
  debitWalletViaMiddleware: vi.fn(async () => null),
  creditWalletViaMiddleware: vi.fn(async () => null),
  getCryptoRampQuoteViaMiddleware: vi.fn(async () => ({ rate: 1 })),
}));

// ─── subjects ─────────────────────────────────────────────────────────────────
import { buildEmiSchedule, emiRouter } from "./crud119";
import { regulatorAuthRouter } from "./regulatorAuth";
import { wave80Router } from "../wave80Router";
import {
  emiContracts,
  emiInstallments,
  regulatorMagicTokens,
  regulatorSessions,
  ussdMenuFlows,
} from "../../drizzle/schema";

const ctx: any = {
  user: { id: 7, openId: "open_7", name: "Merchant Owner", email: "m@example.com", role: "user" },
  req: { headers: {}, protocol: "https", get: () => "localhost" },
  res: { clearCookie: vi.fn(), cookie: vi.fn() },
};

beforeEach(() => {
  h.selectQueue.length = 0;
  h.returningQueue.length = 0;
  h.inserts.length = 0;
  h.updates.length = 0;
  h.emailSent.length = 0;
  h.emailResult = true;
});

// ─── A.2: EMI schedule generation ─────────────────────────────────────────────
describe("buildEmiSchedule (A.2)", () => {
  it("zero-interest: N rows sum EXACTLY to principal", () => {
    const { rows, totalAmountKobo, emiKobo } = buildEmiSchedule({
      principalKobo: 120_000,
      tenorMonths: 12,
      interestRateBps: 0,
      firstDueDate: new Date("2026-02-01T00:00:00Z"),
    });
    expect(rows).toHaveLength(12);
    expect(emiKobo).toBe(10_000);
    expect(totalAmountKobo).toBe(120_000);
    expect(rows.reduce((s, r) => s + r.amountKobo, 0)).toBe(120_000);
    expect(rows[0].dueDate.toISOString().slice(0, 10)).toBe("2026-02-01");
    expect(rows[11].dueDate.toISOString().slice(0, 10)).toBe("2027-01-01");
    expect(rows.map((r) => r.installmentNo)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });

  it("interest-bearing: rows sum to totalAmountKobo (final row absorbs rounding)", () => {
    const { rows, totalAmountKobo, emiKobo } = buildEmiSchedule({
      principalKobo: 100_001,
      tenorMonths: 7,
      interestRateBps: 1200, // 12% per-period per existing convention
      firstDueDate: new Date("2026-03-15T00:00:00Z"),
    });
    expect(rows).toHaveLength(7);
    expect(totalAmountKobo).toBe(emiKobo * 7);
    expect(rows.reduce((s, r) => s + r.amountKobo, 0)).toBe(totalAmountKobo);
    expect(rows[6].amountKobo).toBeGreaterThan(0);
  });

  it("emiRouter.create persists contract AND full installment schedule in one transaction", async () => {
    // Contract insert returning a row with an id; everything else default.
    h.returningQueue.push([{ id: "emi_contract_1" }]);
    const caller = emiRouter.createCaller(ctx);
    const contract = await caller.create({
      orderId: "ord_1",
      principalKobo: 240_000,
      tenorMonths: 6,
      interestRateBps: 0,
      productDescription: "Test product",
      firstDueDate: "2026-03-01",
    });
    expect(contract.id).toBe("emi_contract_1");

    const contractInsert = h.inserts.find((i) => i.table === emiContracts);
    const scheduleInsert = h.inserts.find((i) => i.table === emiInstallments);
    expect(contractInsert).toBeDefined();
    expect(scheduleInsert).toBeDefined();
    const rows = scheduleInsert!.values as any[];
    expect(rows).toHaveLength(6);
    expect(rows.every((r) => r.emiContractId === "emi_contract_1")).toBe(true);
    expect(rows.every((r) => r.status === "pending")).toBe(true);
    expect(rows.reduce((s, r) => s + r.amountKobo, 0)).toBe(240_000);
    expect(contractInsert!.values.totalAmountKobo).toBe(240_000);
  });
});

// ─── A.4: regulator magic-token roundtrip ─────────────────────────────────────
describe("regulatorAuth magic tokens (A.4)", () => {
  const REGULATOR = {
    id: "reg_1",
    regulatorCode: "CBN",
    regulatorName: "Central Bank",
    jurisdiction: "NG",
    regulatoryType: "central_bank",
    contactEmail: "sup@cbn.gov.ng",
    dataAccessLevel: "aggregate",
    status: "active",
  };

  it("requestMagicLink → verifyMagicToken: token persisted, consumed, session created", async () => {
    const caller = regulatorAuthRouter.createCaller(ctx);

    // requestMagicLink: resolveRegulator select → [REGULATOR]; insert returning → row
    h.selectQueue.push([REGULATOR]);
    h.returningQueue.push([{ id: "mt_1" }]);
    const issued = await caller.requestMagicLink({ email: "sup@cbn.gov.ng" });
    expect(issued.success).toBe(true);

    const tokenInsert = h.inserts.find((i) => i.table === regulatorMagicTokens);
    expect(tokenInsert).toBeDefined();
    expect(tokenInsert!.values.regulatorId).toBe("reg_1");
    expect(tokenInsert!.values.email).toBe("sup@cbn.gov.ng");
    expect(typeof tokenInsert!.values.token).toBe("string");
    expect(tokenInsert!.values.token.length).toBe(64);
    expect(tokenInsert!.values.expiresAt.getTime()).toBeGreaterThan(Date.now());
    expect(h.emailSent).toHaveLength(1);

    // verifyMagicToken: select token row (unused, unexpired), claim via
    // update...returning, insert session, select regulator.
    const tokenRow = {
      id: "mt_1",
      regulatorId: "reg_1",
      email: "sup@cbn.gov.ng",
      token: tokenInsert!.values.token,
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: null,
      createdAt: new Date(),
    };
    h.selectQueue.push([tokenRow]); // token lookup
    h.returningQueue.push([{ ...tokenRow, usedAt: new Date() }]); // atomic claim
    h.returningQueue.push([{ id: "sess_1", sessionToken: "sess_tok_123", expiresAt: new Date(Date.now() + 8 * 3600_000) }]);
    h.selectQueue.push([REGULATOR]); // regulator reload
    const verified = await caller.verifyMagicToken({ token: tokenRow.token });
    expect(verified.success).toBe(true);
    expect(verified.sessionToken).toBe("sess_tok_123");
    expect(verified.regulator?.regulatorCode).toBe("CBN");

    // Token marked used + session persisted
    const claim = h.updates.find((u) => u.table === regulatorMagicTokens);
    expect(claim).toBeDefined();
    expect(claim!.set.usedAt).toBeInstanceOf(Date);
    const sessionInsert = h.inserts.find((i) => i.table === regulatorSessions);
    expect(sessionInsert).toBeDefined();
    expect(sessionInsert!.values.regulatorId).toBe("reg_1");
  });

  it("verifyMagicToken rejects an already-used token", async () => {
    const caller = regulatorAuthRouter.createCaller(ctx);
    h.selectQueue.push([{
      id: "mt_2",
      regulatorId: "reg_1",
      email: "sup@cbn.gov.ng",
      token: "x".repeat(64),
      expiresAt: new Date(Date.now() + 10 * 60 * 1000),
      usedAt: new Date(), // already consumed
      createdAt: new Date(),
    }]);
    await expect(caller.verifyMagicToken({ token: "x".repeat(64) }))
      .rejects.toThrow(/already been used/);
  });

  it("requestMagicLink fails loud for an unregistered regulator email", async () => {
    const caller = regulatorAuthRouter.createCaller(ctx);
    h.selectQueue.push([]); // no regulator row
    await expect(caller.requestMagicLink({ email: "nobody@example.com" }))
      .rejects.toThrow(/No active regulator profile/);
    expect(h.inserts.find((i) => i.table === regulatorMagicTokens)).toBeUndefined();
    expect(h.emailSent).toHaveLength(0);
  });
});

// ─── B.10: updateMenuFlow persists ────────────────────────────────────────────
describe("ussdSessionV2 menu flow persistence (B.10)", () => {
  const MENUS = [
    { id: "main", title: "Main Menu", options: ["1. Balance", "2. Transfer", "0. Exit"] },
    { id: "transfer", title: "Transfer", options: ["1. To Bank", "0. Back"] },
  ];

  it("updateMenuFlow upserts into ussd_menu_flows", async () => {
    const caller = wave80Router.createCaller(ctx);
    const res = await caller.ussdSessionV2.updateMenuFlow({ menus: MENUS });
    expect(res).toEqual({ success: true, updatedMenus: 2 });
    const insert = h.inserts.find((i) => i.table === ussdMenuFlows);
    expect(insert).toBeDefined();
    expect(insert!.values.merchantId).toBe("7");
    expect(insert!.values.menus).toEqual(MENUS);
  });

  it("getMenuFlow returns the persisted config when a row exists", async () => {
    h.selectQueue.push([{ id: "umf_1", merchantId: "7", menus: MENUS }]);
    const caller = wave80Router.createCaller(ctx);
    const res = await caller.ussdSessionV2.getMenuFlow();
    expect(res.persisted).toBe(true);
    expect(res.menus).toEqual(MENUS);
  });
});
