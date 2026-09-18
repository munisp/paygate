/**
 * customerRisk.test.ts — Paystack set_risk_action + /customer/validate tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const h = vi.hoisted(() => {
  const state = {
    matchers: [] as { match: string; respond: (text: string) => any[] }[],
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

const dispatchSpy = vi.hoisted(() => vi.fn(async () => ({ dispatched: 1, failed: 0 })));
vi.mock("../webhookEvents", () => ({ dispatchWebhookEvent: dispatchSpy }));

import { customerRiskRouter, assertCustomerNotDenied, getCustomerRiskAction } from "./customerRisk";

const ctx = { user: { id: 7, openId: "open-1", name: "Tester", email: "t@example.com", role: "user" } } as any;
const caller = customerRiskRouter.createCaller(ctx);

const CUSTOMER = { id: "cus_1", email: "ada@example.com", riskAction: "default" };

beforeEach(() => {
  h.state.matchers = [];
  h.state.executed = [];
  dispatchSpy.mockClear();
  process.env.MIDDLEWARE_BRIDGE_URL = "http://bridge.test";
  vi.stubGlobal("fetch", vi.fn(async (url: any, init: any) => {
    const body = init?.body ? JSON.parse(init.body) : {};
    const res = h.state.fetchHandler ? h.state.fetchHandler(String(url), body) : {};
    return { ok: true, status: 200, json: async () => res, text: async () => JSON.stringify(res) } as any;
  }));
});

afterEach(() => {
  vi.unstubAllGlobals();
  delete process.env.MIDDLEWARE_BRIDGE_URL;
});

describe("customerRisk.setRiskAction", () => {
  it("sets risk_action on the customer row", async () => {
    h.state.matchers.push({ match: "FROM customers", respond: () => [CUSTOMER] });
    const res = await caller.setRiskAction({ customer: "ada@example.com", risk_action: "deny" });
    expect(res).toMatchObject({ customerId: "cus_1", riskAction: "deny" });
    expect(h.state.executed.some((t) => t.includes("UPDATE customers"))).toBe(true);
  });

  it("throws NOT_FOUND for an unknown customer", async () => {
    h.state.matchers.push({ match: "FROM customers", respond: () => [] });
    await expect(caller.setRiskAction({ customer: "ghost@example.com", risk_action: "allow" }))
      .rejects.toMatchObject({ code: "NOT_FOUND" });
  });
});

describe("assertCustomerNotDenied (charge-path guard)", () => {
  it("throws FORBIDDEN when risk_action = deny", async () => {
    h.state.matchers.push({ match: "FROM customers", respond: () => [{ riskAction: "deny" }] });
    await expect(assertCustomerNotDenied("merch_1", "ada@example.com"))
      .rejects.toMatchObject({ code: "FORBIDDEN" });
  });

  it("passes for allow and default", async () => {
    h.state.matchers.push({ match: "FROM customers", respond: () => [{ riskAction: "allow" }] });
    await expect(assertCustomerNotDenied("merch_1", "ada@example.com")).resolves.toBeUndefined();

    h.state.matchers = [{ match: "FROM customers", respond: () => [{ riskAction: "default" }] }];
    await expect(assertCustomerNotDenied("merch_1", "ada@example.com")).resolves.toBeUndefined();
    await expect(getCustomerRiskAction("merch_1", "ada@example.com")).resolves.toBe("default");
  });
});

describe("customerRisk.validateCustomer", () => {
  const INPUT = {
    customer_code: "cus_1", country: "NG" as const, type: "bank_account" as const,
    account_number: "0123456789", bank_code: "044", first_name: "Ada", last_name: "Lovelace",
  };

  it("resolves via name enquiry and emits customer.identification.success", async () => {
    h.state.fetchHandler = () => ({ accountName: "Ada Lovelace", responseCode: "00" });
    h.state.matchers.push({ match: "FROM customers", respond: () => [CUSTOMER] });
    const res = await caller.validateCustomer(INPUT);
    expect(res.status).toBe("success");
    const events = dispatchSpy.mock.calls.map((c) => c[0].event);
    expect(events).toContain("customer.identification.success");
    // identification record persisted (masked payload insert)
    expect(h.state.executed.some((t) => t.includes("INSERT INTO customer_identifications"))).toBe(true);
  });

  it("emits customer.identification.failed with reason on name mismatch", async () => {
    h.state.fetchHandler = () => ({ accountName: "Completely Different", responseCode: "00" });
    h.state.matchers.push({ match: "FROM customers", respond: () => [CUSTOMER] });
    const res = await caller.validateCustomer(INPUT);
    expect(res.status).toBe("failed");
    expect((res as any).reason).toMatch(/name does not match/i);
    const failed = dispatchSpy.mock.calls.find((c) => c[0].event === "customer.identification.failed");
    expect(failed).toBeTruthy();
    expect(failed![0].data.reason).toMatch(/name does not match/i);
  });

  it("marks failed when the identification provider is unreachable", async () => {
    delete process.env.MIDDLEWARE_BRIDGE_URL; // no NIBSS gateway either
    h.state.matchers.push({ match: "FROM customers", respond: () => [CUSTOMER] });
    const res = await caller.validateCustomer(INPUT);
    expect(res.status).toBe("failed");
    expect((res as any).reason).toMatch(/unreachable/i);
  });
});
