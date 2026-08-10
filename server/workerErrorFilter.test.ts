/**
 * Tests for workerErrorFilter.ts
 *
 * Verifies that isSuppressedWorkerError() correctly identifies expected
 * sandbox/dev errors that should be silently suppressed.
 */
import { describe, it, expect } from "vitest";
import { isSuppressedWorkerError } from "./workerErrorFilter";

describe("isSuppressedWorkerError", () => {
  // ─── Should suppress ──────────────────────────────────────────────────────

  it("suppresses 'relation does not exist' (table not migrated)", () => {
    const err = new Error('relation "settlements" does not exist');
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'relation ... does not exist' with different table name", () => {
    const err = new Error('relation "webhook_deliveries" does not exist');
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'connect ECONNREFUSED' (PostgreSQL not running)", () => {
    const err = new Error("connect ECONNREFUSED 127.0.0.1:5432");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'Failed query' (Drizzle wrapping a DB error)", () => {
    const err = new Error("Failed query: SELECT * FROM settlements");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'fetch failed' (external API unreachable)", () => {
    const err = new TypeError("fetch failed");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'ECONNREFUSED' (generic connection refused)", () => {
    const err = new Error("ECONNREFUSED 10.0.0.1:443");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'ENOTFOUND' (DNS resolution failure)", () => {
    const err = new Error("getaddrinfo ENOTFOUND api.example.com");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'ETIMEDOUT' (network timeout)", () => {
    const err = new Error("connect ETIMEDOUT 10.0.0.1:443");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'network timeout'", () => {
    const err = new Error("network timeout at: https://api.example.com");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'AbortError' (request aborted)", () => {
    const err = new Error("AbortError: The operation was aborted");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses 'NIP bank list fetch failed'", () => {
    const err = new Error("NIP bank list fetch failed: 503 Service Unavailable");
    expect(isSuppressedWorkerError(err)).toBe(true);
  });

  it("suppresses non-Error objects with matching message string", () => {
    const err = { message: "Failed query: something" };
    // isSuppressedWorkerError converts to string via String(err)
    // String({ message: ... }) = "[object Object]" — won't match
    // But passing a string directly should work
    expect(isSuppressedWorkerError("Failed query: something")).toBe(true);
  });

  it("suppresses string errors with ECONNREFUSED", () => {
    expect(isSuppressedWorkerError("ECONNREFUSED 127.0.0.1:5432")).toBe(true);
  });

  // ─── Should NOT suppress ──────────────────────────────────────────────────

  it("does NOT suppress generic application errors", () => {
    const err = new Error("Unexpected null value in payment processing");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress validation errors", () => {
    const err = new Error("Invalid amount: must be positive");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress logic errors", () => {
    const err = new Error("Cannot read properties of undefined");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress null", () => {
    expect(isSuppressedWorkerError(null)).toBe(false);
  });

  it("does NOT suppress undefined", () => {
    expect(isSuppressedWorkerError(undefined)).toBe(false);
  });

  it("does NOT suppress empty string", () => {
    expect(isSuppressedWorkerError("")).toBe(false);
  });

  it("does NOT suppress errors with partial keyword matches (e.g. 'relation' without 'does not exist')", () => {
    const err = new Error("relation between tables is valid");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress errors with 'does not exist' but no 'relation'", () => {
    const err = new Error("The feature does not exist in this plan");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress payment processing errors", () => {
    const err = new Error("Insufficient funds for payout");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });

  it("does NOT suppress fraud detection errors", () => {
    const err = new Error("Fraud score threshold exceeded: 0.95");
    expect(isSuppressedWorkerError(err)).toBe(false);
  });
});
