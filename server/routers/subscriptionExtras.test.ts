/**
 * subscriptionExtras.test.ts — manage-link tokens + expiring-cards capability tests.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import crypto from "crypto";

const h = vi.hoisted(() => {
  const state = {
    matchers: [] as { match: string; respond: (text: string) => any[] }[],
    executed: [] as string[],
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

const sendEmailSpy = vi.hoisted(() => vi.fn(async () => true));
vi.mock("../emailService", () => ({ sendEmail: sendEmailSpy }));

import {
  subscriptionExtrasRouter,
  signManageToken,
  EXPIRING_CARDS_SUPPORTED,
} from "./subscriptionExtras";

const ctx = { user: { id: 7, openId: "open-1", name: "Tester", email: "t@example.com", role: "user" } } as any;
const caller = subscriptionExtrasRouter.createCaller(ctx);

const SUB = {
  id: "sub_1", merchantId: "merch_1", tenantId: "ten_default",
  customerEmail: "ada@example.com", customerName: "Ada Lovelace",
  planName: "Pro", amountKobo: 500000, currency: "NGN", interval: "monthly",
  status: "active", nextRunAt: new Date("2025-02-01"),
};

beforeEach(() => {
  h.state.matchers = [];
  h.state.executed = [];
  dispatchSpy.mockClear();
  sendEmailSpy.mockClear();
  process.env.SUBSCRIPTION_MANAGE_SECRET = "test-secret";
  process.env.MERCHANT_PORTAL_URL = "https://portal.test";
});

afterEach(() => {
  delete process.env.SUBSCRIPTION_MANAGE_SECRET;
  delete process.env.MERCHANT_PORTAL_URL;
});

describe("subscriptionExtras.getManageLink", () => {
  it("returns a signed hosted link, stores token hash, emits manage_link.created", async () => {
    h.state.matchers.push({ match: "FROM subscriptions", respond: () => [SUB] });
    const res = await caller.getManageLink({ code: "sub_1" });
    expect(res.url).toMatch(/^https:\/\/portal\.test\/manage-subscription\/.+\..+$/);
    expect(h.state.executed.some((t) => t.includes("INSERT INTO subscription_manage_tokens"))).toBe(true);
    // only the sha256 HASH is persisted, never the raw token
    const insert = h.state.executed.find((t) => t.includes("INSERT INTO subscription_manage_tokens"))!;
    expect(insert).not.toContain(res.token);
    const events = dispatchSpy.mock.calls.map((c) => c[0].event);
    expect(events).toContain("subscription.manage_link.created");
  });

  it("fails loud when the signing secret is unset", async () => {
    delete process.env.SUBSCRIPTION_MANAGE_SECRET;
    delete process.env.INTERNAL_API_KEY;
    h.state.matchers.push({ match: "FROM subscriptions", respond: () => [SUB] });
    await expect(caller.getManageLink({ code: "sub_1" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });

  it("rejects manage links for cancelled subscriptions", async () => {
    h.state.matchers.push({ match: "FROM subscriptions", respond: () => [{ ...SUB, status: "cancelled" }] });
    await expect(caller.getManageLink({ code: "sub_1" }))
      .rejects.toMatchObject({ code: "BAD_REQUEST" });
  });
});

describe("subscriptionExtras.verifyManageToken", () => {
  function storedRowFor(token: string, expiresAt: Date) {
    return {
      id: "smt_1", subscriptionId: "sub_1", merchantId: "merch_1",
      expiresAt, usedAt: null,
      _hash: crypto.createHash("sha256").update(token).digest("hex"),
    };
  }

  it("verifies a valid token and returns subscription + customer", async () => {
    const token = signManageToken("sub_1", Date.now() + 60_000);
    storedRowFor(token); // documents the hash the fake db matches on
    h.state.matchers.push(
      { match: "FROM subscription_manage_tokens", respond: () => [storedRowFor(token, new Date(Date.now() + 60_000))] },
      { match: "FROM subscriptions", respond: () => [SUB] },
    );
    const res = await caller.verifyManageToken({ token });
    expect(res.subscription.id).toBe("sub_1");
    expect(res.customer).toEqual({ email: "ada@example.com", name: "Ada Lovelace" });
  });

  it("rejects an expired token (signature valid, exp in the past)", async () => {
    const token = signManageToken("sub_1", Date.now() - 60_000);
    await expect(caller.verifyManageToken({ token }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", message: expect.stringMatching(/expired/i) });
  });

  it("rejects a tampered token signature", async () => {
    const token = signManageToken("sub_1", Date.now() + 60_000);
    const [payload] = token.split(".");
    await expect(caller.verifyManageToken({ token: `${payload}.tampersig` }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED" });
  });

  it("rejects a token with no stored hash", async () => {
    const token = signManageToken("sub_1", Date.now() + 60_000);
    h.state.matchers.push({ match: "FROM subscription_manage_tokens", respond: () => [] });
    await expect(caller.verifyManageToken({ token }))
      .rejects.toMatchObject({ code: "UNAUTHORIZED", message: expect.stringMatching(/unknown/i) });
  });
});

describe("subscriptionExtras.sendManageLinkByEmail", () => {
  it("sends the link via the email notification path", async () => {
    h.state.matchers.push({ match: "FROM subscriptions", respond: () => [SUB] });
    const res = await caller.sendManageLinkByEmail({ code: "sub_1" });
    expect(res).toMatchObject({ sent: true, email: "ada@example.com" });
    expect(sendEmailSpy).toHaveBeenCalledOnce();
    expect(sendEmailSpy.mock.calls[0][0].html).toContain("/manage-subscription/");
  });

  it("fails loud when email delivery is unavailable", async () => {
    sendEmailSpy.mockResolvedValueOnce(false);
    h.state.matchers.push({ match: "FROM subscriptions", respond: () => [SUB] });
    await expect(caller.sendManageLinkByEmail({ code: "sub_1" }))
      .rejects.toMatchObject({ code: "INTERNAL_SERVER_ERROR" });
  });
});

describe("subscriptionExtras expiring cards (capability-gated, fabrication-free)", () => {
  it("listExpiringCards reports supported=false with no fabricated rows", async () => {
    expect(EXPIRING_CARDS_SUPPORTED).toBe(false);
    const res = await caller.listExpiringCards({});
    expect(res).toEqual({ supported: false, items: [] });
  });

  it("expiringCardsDigest is scheduler-callable and emits nothing when unsupported", async () => {
    const res = await caller.expiringCardsDigest({});
    expect(res).toEqual({ supported: false, merchantsProcessed: 0, eventsEmitted: 0 });
    const events = dispatchSpy.mock.calls.map((c) => c[0].event);
    expect(events).not.toContain("subscription.expiring_cards");
  });
});
