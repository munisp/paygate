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

// ─── Server Health ────────────────────────────────────────────────────────────
describe("Server Health", () => {
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
