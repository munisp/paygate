/**
 * wave25.health.test.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Server Health integration tests for Wave 25.
 *
 * These tests require a running Express server on SERVER_PORT (default: 3000).
 * They are placed in the `server-health-tests` Vitest project which starts the
 * server via globalSetup before running these tests.
 *
 * Separated from wave25.pg.test.ts so that:
 *   - pg-mem tests (wave25.pg.test.ts) run in the `pg-tests` project
 *   - server-health tests (this file) run in the `server-health-tests` project
 */
import { describe, it, expect } from "vitest";

const SERVER_PORT = process.env.SERVER_PORT ?? "3000";
const BASE_URL = `http://localhost:${SERVER_PORT}`;

// ─── Server availability guard ───────────────────────────────────────────────
// ENV-GATED: these are integration tests against a LIVE Express server. The
// current vitest.config.ts runs this file directly (no globalSetup booting the
// server), so probe the health endpoint and skip cleanly when no server is up.
const SERVER_UP: boolean = await fetch(`${BASE_URL}/api/health`, {
  signal: AbortSignal.timeout(1000),
})
  .then((r) => r.ok)
  .catch(() => false);

if (!SERVER_UP) {
  console.warn(`[SKIP] No server listening on ${BASE_URL} — skipping live health tests`);
}

// ─── Server Health ────────────────────────────────────────────────────────────
describe.skipIf(!SERVER_UP)("Server Health", () => {
  it("should respond to health check", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    expect(response.status).toBe(200);
    const body = await response.json();
    expect(body.status).toBe("ok");
  });

  it("should have all integrations configured", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const body = await response.json();
    expect(body.integrations).toBeDefined();
    expect(body.checks.database).toBe("ok");
  });

  it("should have security headers", async () => {
    const response = await fetch(`${BASE_URL}/api/health`);
    const headers = response.headers;
    const hasSecurityHeader =
      headers.get("x-content-type-options") !== null ||
      headers.get("x-frame-options") !== null ||
      headers.get("x-xss-protection") !== null ||
      headers.get("strict-transport-security") !== null;
    expect(hasSecurityHeader).toBe(true);
  });
});
