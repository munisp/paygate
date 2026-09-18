/**
 * dedicatedAccounts.test.ts — Paystack /dedicated_account parity tests.
 *
 * Mocking pattern follows accountingSync.test.ts: server/db is mocked with a
 * fake db whose `execute()` dispatches canned rows by SQL text match;
 * drizzle-orm is NOT mocked (the real `sql` tag just builds query objects);
 * webhookEvents + idempotency are mocked; fetch is stubbed at the bridge
 * boundary.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => {
  type Matcher = { match: string; respond: (text: string) => any[] };
  const state = {
    matchers: [] as Matcher[],
    executed: [] as string[],
    fetchHandler: null as null | ((url: string, body: any) => any),
  };
  function sqlText(q: any): string {
    if (typeof q === "string") return q;
    if (!q || typeof q !== "object") return String(q ?? "");
    const chunks = q.queryChunks ?? [q];
    return chunks
      .map((c: any) => {
        const v = c?.value ?? c;
        if (Array.isArray(v)) return v.join("");
        if (v && typeof v === "object" && Array.isArray(v.queryChunks)) return sqlText(v);
        return String(v ?? "");
      })
      .join("");
  }
  const fakeDb: any = {
    execute: async (q: any) => {
      const text = sqlText(q);
      state.executed.push(text);
      for (const m of state.matchers) {
        if (text.includes(m.match)) return { rows: m.respond(text) };
      }
      return { rows: [] };
    },
  };
  return { state, fakeDb };
});

vi.mock("../../server/db", () => ({
  getDb: vi.fn(async () => h.fakeDb),
  getUserByOpenId: vi.fn(async () => ({ id: 7, openId: "open-1" })),
  getMerchantByOwnerId: vi.fn(async () => ({ id: "merch_1", ownerId: 7 })),
}));

vi.mock("../idempotency", () => ({
  withIdempotency: vi.fn(async (opts: any) => opts.execute()),
}));

vi.mock("../pbac", () => ({
  requirePermission: vi.fn(async () => {}),
  resolveMerchantTeamRole: vi.fn(async () => ({ merchantId: "merch_1", role: "owner" })),
}));

const dispatchSpy = vi.hoisted(() => vi.fn(async () => ({ dispatched: 1, failed: 0 })));
vi.mock("../webhookEvents", () => ({ dispatchWebhookEvent: dispatchSpy }));

import { dedicatedAccountsRouter, reapStaleDvaAssignments } from "./dedicatedAccounts";

const ctx = { user: { id: 7, openId: "open-1", name: "Tester", email: "t@example.com", role: "user" } } as any;
const caller = dedicatedAccountsRouter.createCaller(ctx);

const BANK_ROW = {
  bankCode: "044",
  bankName: "Test Bank",
  shortName: "TB",
  nipCode: "999044",
  providerSlug: "test-bank",
};

function reset() {
  // H12 duplicate-assign guard: no pre-existing active DVA by default.
  h.state.matchers = [{ match: "dva_active_dup_check", respond: () => [] }];
  h.state.executed = [];
  dispatchSpy.mockClear();
  process.env.MIDDLEWARE_BRIDGE_URL = "http://bridge.test";
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const res = h.state.fetchHandler ? h.state.fetchHandler(String(url), body) : { accountNumber: "0123456789" };
    return { ok: true, status: 200, json: async () => res, text: async () => JSON.stringify(res) } as any;
  }));
}

beforeEach(reset);
afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MIDDLEWARE_BRIDGE_URL;
});

describe("dedicatedAccounts.assign", () => {
  it("happy path: pending → assigned, emits dedicatedaccount.assign.success", async () => {
    h.state.matchers.push(
      { match: "FROM nip_banks", respond: () => [BANK_ROW] },
      { match: "INSERT INTO customers", respond: () => [{ id: "cus_1" }] },
      { match: "INSERT INTO nip_virtual_accounts", respond: () => [] },
      { match: "UPDATE nip_virtual_accounts", respond: () => [] },
      {
        match: "FROM nip_virtual_accounts",
        respond: () => [{
          id: 11, merchantId: "merch_1", customerId: "cus_1",
          accountNumber: "0123456789", assignmentStatus: "assigned",
          status: "pending", dedicated: true, reference: "dva_x",
        }],
      },
    );
    const result = await caller.assign({
      email: "ada@example.com", first_name: "Ada", last_name: "Lovelace",
      phone: "08012345678", preferred_bank: "test-bank", country: "NG",
    });
    expect(result.assignmentStatus).toBe("assigned");
    expect(result.accountNumber).toBe("0123456789");
    // pending row persisted before provisioning
    expect(h.state.executed.some((t) => t.includes("INSERT INTO nip_virtual_accounts"))).toBe(true);
    const events = dispatchSpy.mock.calls.map((c) => c[0].event);
    expect(events).toContain("dedicatedaccount.assign.success");
    expect(events).not.toContain("dedicatedaccount.assign.failed");
  });

  it("validation failure: emits dedicatedaccount.assign.failed with reason", async () => {
    h.state.fetchHandler = () => ({ verified: false, responseCode: "99" });
    h.state.matchers.push(
      { match: "FROM nip_banks", respond: () => [BANK_ROW] },
      { match: "INSERT INTO customers", respond: () => [{ id: "cus_1" }] },
      {
        match: "FROM nip_virtual_accounts",
        respond: () => [{
          id: 12, merchantId: "merch_1", customerId: "cus_1",
          accountNumber: "PENDING:dva_x", assignmentStatus: "failed", status: "cancelled",
        }],
      },
    );
    const result = await caller.assign({
      email: "ada@example.com", first_name: "Ada", last_name: "Lovelace",
      phone: "08012345678", preferred_bank: "test-bank", country: "NG",
      bvn: "12345678901",
    });
    expect(result.assignmentStatus).toBe("failed");
    const failed = dispatchSpy.mock.calls.find((c) => c[0].event === "dedicatedaccount.assign.failed");
    expect(failed).toBeTruthy();
    expect(failed![0].data.reason).toMatch(/BVN validation failed/);
  });

  it("unknown preferred_bank → BAD_REQUEST", async () => {
    h.state.matchers.push({ match: "FROM nip_banks", respond: () => [] });
    await expect(caller.assign({
      email: "a@b.c", first_name: "A", last_name: "B",
      phone: "08012345678", preferred_bank: "no-such-bank", country: "NG",
    })).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("dedicatedAccounts.requery", () => {
  const DVA = {
    id: 5, merchantId: "merch_1", accountNumber: "0123456789",
    reference: "dva_ref5", lastRequeryAt: null as any, dedicated: true,
  };

  it("queues a recheck and enforces the 10-minute cooldown", async () => {
    let row = { ...DVA };
    h.state.matchers.push(
      { match: "FROM nip_virtual_accounts", respond: () => [row] },
      { match: "UPDATE nip_virtual_accounts", respond: () => [] },
    );
    const first = await caller.requery({
      account_number: "0123456789", provider_slug: "test-bank", date: "2025-01-15",
    });
    expect(first.status).toBe("queued");

    // Simulate the persisted last_requery_at from the first call.
    row = { ...DVA, lastRequeryAt: new Date() };
    await expect(caller.requery({
      account_number: "0123456789", provider_slug: "test-bank", date: "2025-01-15",
    })).rejects.toMatchObject({ code: "TOO_MANY_REQUESTS" });
  });

  it("fails loud when the recon path is unreachable", async () => {
    delete process.env.MIDDLEWARE_BRIDGE_URL;
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [DVA] });
    await expect(caller.requery({
      account_number: "0123456789", provider_slug: "test-bank", date: "2025-01-15",
    })).rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("dedicatedAccounts splits", () => {
  const DVA = { id: 9, merchantId: "merch_1", accountNumber: "0123456789", splitCode: null, dedicated: true };

  it("addSplit stores split_code on the DVA row", async () => {
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [DVA] });
    const res = await caller.addSplit({ account_number: "0123456789", split_code: "SPL_abc" });
    expect(res.splitCode).toBe("SPL_abc");
    const update = h.state.executed.find((t) => t.includes("UPDATE nip_virtual_accounts"));
    expect(update).toBeTruthy();
    expect(update).toContain("split_code");
  });

  it("removeSplit clears split_code", async () => {
    h.state.matchers.push({
      match: "FROM nip_virtual_accounts",
      respond: () => [{ ...DVA, splitCode: "SPL_abc" }],
    });
    const res = await caller.removeSplit({ account_number: "0123456789" });
    expect(res.splitCode).toBeNull();
  });

  it("rejects splits on another merchant's account", async () => {
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [] });
    await expect(caller.addSplit({ account_number: "9999999999", split_code: "SPL_x" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("H12 duplicate assign guard", () => {
  it("returns the existing active DVA idempotently instead of provisioning a second", async () => {
    h.state.matchers = [
      {
        match: "dva_active_dup_check",
        respond: () => [{
          id: 42, merchantId: "merch_1", customerId: "cus_1",
          customerEmail: "ada@example.com", accountNumber: "9876543210",
          assignmentStatus: "assigned", status: "active", reference: "dva_existing",
        }],
      },
      { match: "INSERT INTO customers", respond: () => [{ id: "cus_1" }] },
    ];
    const result: any = await caller.assign({
      email: "ada@example.com", first_name: "Ada", last_name: "Lovelace",
      phone: "08012345678", preferred_bank: "test-bank", country: "NG",
    });
    expect(result.reused).toBe(true);
    expect(result.accountNumber).toBe("9876543210");
    // No new DVA row was inserted, no provider call made.
    expect(h.state.executed.some((t) => t.includes("INSERT INTO nip_virtual_accounts"))).toBe(false);
  });
});

describe("H12 reapStaleDvaAssignments (called by cronJobs)", () => {
  it("flips stale assignment_pending rows to failed and emits events", async () => {
    h.state.matchers.push({
      match: "UPDATE nip_virtual_accounts",
      respond: () => [
        { merchant_id: "merch_1", reference: "dva_stale1", customer_id: "cus_1", customer_email: "a@b.c" },
        { merchant_id: "merch_1", reference: "dva_stale2", customer_id: "cus_2", customer_email: "c@d.e" },
      ],
    });
    const res = await reapStaleDvaAssignments(30);
    expect(res.reaped).toBe(2);
    const failed = dispatchSpy.mock.calls.filter((c) => c[0].event === "dedicatedaccount.assign.failed");
    expect(failed).toHaveLength(2);
    expect(failed[0][0].data.reason).toMatch(/timed out/);
  });

  it("rejects a non-positive TTL", async () => {
    await expect(reapStaleDvaAssignments(0)).rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("H12 dvaInboundCredit", () => {
  const ACTIVE_DVA = {
    id: 7, merchantId: "merch_1", customerId: "cus_1", customerEmail: "ada@example.com",
    accountNumber: "0123456789", bankName: "Test Bank", status: "active",
    assignmentStatus: "assigned", dedicated: true, deactivatedAt: null, reference: "dva_7",
  };

  it("credits an active DVA and emits payment.completed", async () => {
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [ACTIVE_DVA] });
    const res: any = await caller.dvaInboundCredit({
      account_number: "0123456789", amount_kobo: 25000,
      sender_name: "Ada Lovelace", session_id: "nip_sess_1",
    });
    expect(res.status).toBe("OK");
    expect(res.merchantId).toBe("merch_1");
    expect(h.state.executed.some((t) => t.includes("INSERT INTO transactions"))).toBe(true);
    const evt = dispatchSpy.mock.calls.find((c) => c[0].event === "payment.completed");
    expect(evt).toBeTruthy();
    expect(evt![0].data.wrong_amount).toBe(false);
  });

  it("flags a wrong-amount credit when an expected amount is supplied", async () => {
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [ACTIVE_DVA] });
    const res: any = await caller.dvaInboundCredit({
      account_number: "0123456789", amount_kobo: 20000, expected_amount_kobo: 25000,
    });
    expect(res.status).toBe("FLAGGED");
    expect(res.wrongAmount).toBe(true);
  });

  it("REJECTS a deactivated account and emits bank.transfer.rejected", async () => {
    h.state.matchers.push({
      match: "FROM nip_virtual_accounts",
      respond: () => [{ ...ACTIVE_DVA, deactivatedAt: new Date(), status: "cancelled" }],
    });
    const res: any = await caller.dvaInboundCredit({ account_number: "0123456789", amount_kobo: 25000 });
    expect(res.status).toBe("REJECT");
    expect(h.state.executed.some((t) => t.includes("INSERT INTO transactions"))).toBe(false);
    expect(dispatchSpy.mock.calls.some((c) => c[0].event === "bank.transfer.rejected")).toBe(true);
  });

  it("REJECTS an unknown account number without crediting anything", async () => {
    h.state.matchers.push({ match: "FROM nip_virtual_accounts", respond: () => [] });
    const res: any = await caller.dvaInboundCredit({ account_number: "0000000000", amount_kobo: 25000 });
    expect(res.status).toBe("REJECT");
    expect(res.reason).toMatch(/unknown/);
  });
});

describe("dedicatedAccounts.availableProviders", () => {
  it("lists banks with pay_with_bank_transfer capability", async () => {
    h.state.matchers.push({
      match: "FROM nip_banks",
      respond: () => [
        { providerSlug: "wema-bank", bankName: "Wema Bank", bankCode: "035", nipCode: "999035", category: "commercial" },
        { providerSlug: null, bankName: "Test Bank", bankCode: "044", nipCode: "999044", category: "commercial" },
      ],
    });
    const providers = await caller.availableProviders();
    expect(providers).toHaveLength(2);
    expect(providers[0]).toMatchObject({ provider_slug: "wema-bank", pay_with_bank_transfer: true });
    // slug fallback derived from bank name when provider_slug column is null
    expect(providers[1].provider_slug).toBe("test-bank");
  });
});
