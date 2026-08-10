/**
 * Wave 107 — PBAC + Security Hardening Tests
 *
 * Tests cover:
 *  1. PBAC policy definitions (role-permission matrix)
 *  2. Nonce replay attack protection
 *  3. NIBSS webhook HMAC-SHA256 signature verification
 *  4. Login brute-force protection (in-memory)
 *  5. checkPermission local fallback (Permify offline)
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  PBAC_POLICIES,
  checkPermission,
  validateNonce,
  verifyWebhookSignature,
  recordLoginAttempt,
  clearLoginAttempts,
  isLockedOut,
} from "./pbac";

// ─── 1. PBAC Policy Definitions ──────────────────────────────────────────────

describe("PBAC_POLICIES", () => {
  it("defines all expected resource types", () => {
    const expected = [
      "transaction", "payout", "dispute", "kyc", "api_key",
      "webhook", "virtual_card", "settlement", "fraud_rule",
      "compliance_report", "team_member", "payment_link",
      "escrow", "carbon_credit", "loyalty_program", "admin_panel",
    ];
    for (const resource of expected) {
      expect(PBAC_POLICIES).toHaveProperty(resource);
    }
  });

  it("each resource has a non-empty actions array", () => {
    for (const [resource, policy] of Object.entries(PBAC_POLICIES)) {
      expect(policy.actions.length, `${resource} should have actions`).toBeGreaterThan(0);
    }
  });

  it("payout resource requires owner", () => {
    expect(PBAC_POLICIES.payout.ownerRequired).toBe(true);
  });

  it("transaction resource does not require owner", () => {
    expect(PBAC_POLICIES.transaction.ownerRequired).toBe(false);
  });
});

// ─── 2. checkPermission (local matrix fallback) ───────────────────────────────

describe("checkPermission — local matrix fallback", () => {
  // Mock fetch to simulate Permify being offline
  beforeEach(() => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("Permify offline")));
  });

  it("allows admin to view transactions", async () => {
    const allowed = await checkPermission("u1", "admin", "transaction", "view");
    expect(allowed).toBe(true);
  });

  it("allows owner to approve payouts", async () => {
    const allowed = await checkPermission("u1", "owner", "payout", "approve");
    expect(allowed).toBe(true);
  });

  it("denies viewer from creating fraud rules", async () => {
    const allowed = await checkPermission("u1", "viewer", "fraud_rule", "create");
    expect(allowed).toBe(false);
  });

  it("denies developer from impersonating users (admin_panel)", async () => {
    const allowed = await checkPermission("u1", "developer", "admin_panel", "impersonate");
    expect(allowed).toBe(false);
  });

  it("allows compliance_officer to generate compliance reports", async () => {
    const allowed = await checkPermission("u1", "compliance_officer", "compliance_report", "generate");
    expect(allowed).toBe(true);
  });

  it("denies user from toggling fraud rules", async () => {
    const allowed = await checkPermission("u1", "user", "fraud_rule", "toggle");
    expect(allowed).toBe(false);
  });

  it("falls back to user role for unknown roles", async () => {
    // Unknown role should map to "user" permissions
    const allowed = await checkPermission("u1", "unknown_role", "transaction", "view");
    expect(allowed).toBe(true); // user can view transactions
  });
});

// ─── 3. Nonce Replay Attack Protection ───────────────────────────────────────

describe("validateNonce — replay attack protection", () => {
  it("accepts a valid nonce on first use", () => {
    const nonce = "secure-nonce-abc-123-xyz-456-789";
    expect(() => validateNonce(nonce)).not.toThrow();
  });

  it("rejects a nonce that has already been used", () => {
    const nonce = "replay-test-nonce-abc-123-xyz-789";
    validateNonce(nonce); // First use — should succeed
    expect(() => validateNonce(nonce)).toThrowError(/Duplicate request/);
  });

  it("rejects nonces shorter than 16 characters", () => {
    expect(() => validateNonce("short")).toThrowError(/valid idempotency nonce/);
  });

  it("rejects empty nonce", () => {
    expect(() => validateNonce("")).toThrowError(/valid idempotency nonce/);
  });

  it("accepts different nonces independently", () => {
    const nonce1 = "unique-nonce-aaa-111-bbb-222-ccc";
    const nonce2 = "unique-nonce-ddd-333-eee-444-fff";
    expect(() => validateNonce(nonce1)).not.toThrow();
    expect(() => validateNonce(nonce2)).not.toThrow();
  });
});

// ─── 4. NIBSS Webhook Signature Verification ─────────────────────────────────

describe("verifyWebhookSignature — NIBSS HMAC-SHA256", () => {
  const secret = "test-nibss-secret-key-2026";
  const payload = Buffer.from(JSON.stringify({ type: "batch.confirmed", batchId: "b_001" }));

  function computeHmac(body: Buffer, key: string): string {
    const { createHmac } = require("crypto");
    return createHmac("sha256", key).update(body).digest("hex");
  }

  it("accepts a valid HMAC-SHA256 signature (raw hex)", () => {
    const sig = computeHmac(payload, secret);
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("accepts a valid signature with sha256= prefix", () => {
    const sig = `sha256=${computeHmac(payload, secret)}`;
    expect(verifyWebhookSignature(payload, sig, secret)).toBe(true);
  });

  it("rejects an invalid signature", () => {
    const badSig = "0000000000000000000000000000000000000000000000000000000000000000";
    expect(verifyWebhookSignature(payload, badSig, secret)).toBe(false);
  });

  it("rejects signature from wrong secret", () => {
    const wrongSig = computeHmac(payload, "wrong-secret");
    expect(verifyWebhookSignature(payload, wrongSig, secret)).toBe(false);
  });

  it("accepts string payload as well as Buffer", () => {
    const strPayload = JSON.stringify({ type: "batch.confirmed", batchId: "b_001" });
    const sig = computeHmac(Buffer.from(strPayload), secret);
    expect(verifyWebhookSignature(strPayload, sig, secret)).toBe(true);
  });

  it("fails open (returns true) when secret is not configured", () => {
    // Dev mode: no secret configured → fail open
    expect(verifyWebhookSignature(payload, "any-sig", "")).toBe(true);
  });
});

// ─── 5. Login Brute Force Protection ─────────────────────────────────────────

describe("recordLoginAttempt — brute force protection", () => {
  beforeEach(() => {
    // Clear state between tests
    clearLoginAttempts("test-user@example.com");
    clearLoginAttempts("attacker@example.com");
  });

  it("does not throw on first failed attempt", () => {
    expect(() => recordLoginAttempt("test-user@example.com")).not.toThrow();
  });

  it("does not throw on 4 failed attempts", () => {
    for (let i = 0; i < 4; i++) {
      expect(() => recordLoginAttempt("test-user@example.com")).not.toThrow();
    }
  });

  it("locks out after 5 failed attempts", () => {
    for (let i = 0; i < 5; i++) {
      try { recordLoginAttempt("attacker@example.com"); } catch { /* expected on 5th */ }
    }
    expect(isLockedOut("attacker@example.com")).toBe(true);
  });

  it("throws TOO_MANY_REQUESTS when locked out", () => {
    // Trigger lockout
    for (let i = 0; i < 5; i++) {
      try { recordLoginAttempt("attacker@example.com"); } catch { /* ignore */ }
    }
    // Next attempt should throw
    expect(() => recordLoginAttempt("attacker@example.com")).toThrowError(/locked/i);
  });

  it("clearLoginAttempts removes lockout", () => {
    for (let i = 0; i < 5; i++) {
      try { recordLoginAttempt("attacker@example.com"); } catch { /* ignore */ }
    }
    expect(isLockedOut("attacker@example.com")).toBe(true);
    clearLoginAttempts("attacker@example.com");
    expect(isLockedOut("attacker@example.com")).toBe(false);
  });

  it("isLockedOut returns false for unknown identifier", () => {
    expect(isLockedOut("never-tried@example.com")).toBe(false);
  });
});
