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

const dispatchSpy = vi.hoisted(() => vi.fn(async () => ({ dispatched: 1, failed: 0 })));
vi.mock("../webhookEvents", () => ({ dispatchWebhookEvent: dispatchSpy }));

import { dedicatedAccountsRouter } from "./dedicatedAccounts";

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
  h.state.matchers = [];
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
