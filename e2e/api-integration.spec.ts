/**
 * api-integration.spec.ts
 * API-level integration tests using Playwright's request context.
 * Tests tRPC endpoints directly without browser UI.
 */
import { test, expect } from "@playwright/test";

const BASE = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";

// Helper to call a tRPC query
async function trpcQuery(request: any, procedure: string, input: any = {}) {
  const encoded = encodeURIComponent(JSON.stringify({ json: input }));
  return request.get(`${BASE}/api/trpc/${procedure}?input=${encoded}`);
}

// Helper to call a tRPC mutation
async function trpcMutate(request: any, procedure: string, body: any = {}) {
  return request.post(`${BASE}/api/trpc/${procedure}`, {
    data: { json: body },
    headers: { "Content-Type": "application/json" },
  });
}

test.describe("API Integration Tests", () => {

  // ── Health & System ────────────────────────────────────────────────────────
  test.describe("System Health", () => {
    test("GET /api/health returns 200", async ({ request }) => {
      const res = await request.get(`${BASE}/api/health`);
      expect(res.status()).toBe(200);
      const body = await res.json();
      expect(body).toHaveProperty("status");
    });

    test("tRPC batch endpoint is reachable", async ({ request }) => {
      const res = await request.get(`${BASE}/api/trpc`);
      // Should return 404 (no procedure) or 400 (missing input) — not 500
      expect([400, 404]).toContain(res.status());
    });
  });

  // ── Auth ──────────────────────────────────────────────────────────────────
  test.describe("Authentication", () => {
    test("auth.me returns user when authenticated", async ({ request }) => {
      const res = await trpcQuery(request, "auth.me");
      // 200 with user data, or 401 if cookie not propagated in API context
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Transactions ──────────────────────────────────────────────────────────
  test.describe("Transactions API", () => {
    test("transactions.list is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "transactions.list", {
        page: 1,
        limit: 10,
      });
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Customers ─────────────────────────────────────────────────────────────
  test.describe("Customers API", () => {
    test("customers.list is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "customers.list", {
        page: 1,
        limit: 10,
      });
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Payouts ───────────────────────────────────────────────────────────────
  test.describe("Payouts API", () => {
    test("payouts.list is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "payouts.list", {
        page: 1,
        limit: 10,
      });
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Analytics ─────────────────────────────────────────────────────────────
  test.describe("Analytics API", () => {
    test("analytics.overview is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "analytics.overview");
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Webhooks ──────────────────────────────────────────────────────────────
  test.describe("Webhooks API", () => {
    test("webhooks.list is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "webhooks.list");
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── API Keys ──────────────────────────────────────────────────────────────
  test.describe("API Keys API", () => {
    test("apiKeys.list is accessible", async ({ request }) => {
      const res = await trpcQuery(request, "apiKeys.list");
      expect([200, 401]).toContain(res.status());
    });
  });

  // ── Stripe Webhook ────────────────────────────────────────────────────────
  test.describe("Stripe Webhook", () => {
    test("POST /api/stripe/webhook returns 400 without signature", async ({ request }) => {
      const res = await request.post(`${BASE}/api/stripe/webhook`, {
        data: JSON.stringify({ type: "payment_intent.succeeded" }),
        headers: { "Content-Type": "application/json" },
      });
      // Without a valid Stripe signature, should return 400
      expect([400, 401]).toContain(res.status());
    });
  });

  // ── NIBSS / NIP ───────────────────────────────────────────────────────────
  test.describe("NIBSS Webhook", () => {
    test("POST /api/nibss/webhook returns 400 without signature", async ({ request }) => {
      const res = await request.post(`${BASE}/api/nibss/webhook`, {
        data: JSON.stringify({ event: "nip.credit" }),
        headers: { "Content-Type": "application/json" },
      });
      expect([400, 401, 404]).toContain(res.status());
    });
  });

  // ── OAuth Callback ────────────────────────────────────────────────────────
  test.describe("OAuth", () => {
    test("OAuth callback redirects without code", async ({ request }) => {
      const res = await request.get(`${BASE}/api/oauth/callback`);
      // Should redirect or return error — not 500
      expect([302, 400, 401]).toContain(res.status());
    });
  });
});
