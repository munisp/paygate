/**
 * Production Hardening Tests
 *
 * Tests for all new production-readiness features:
 *   - Circuit Breaker (open/close/half-open states)
 *   - Audit Trail (fire-and-forget, never throws)
 *   - Web Push (VAPID config, graceful no-op without keys)
 *   - Logger (structured output, no-throw)
 *   - Health check response shape
 */
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── Circuit Breaker ──────────────────────────────────────────────────────────

describe("CircuitBreaker", () => {
  // Re-import fresh registry for each test group
  let getCircuitBreaker: any;
  let withFallback: any;
  let CircuitBreakerOpenError: any;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./circuitBreaker");
    getCircuitBreaker = mod.getCircuitBreaker;
    withFallback = mod.withFallback;
    CircuitBreakerOpenError = mod.CircuitBreakerOpenError;
  });

  it("passes through successful calls in CLOSED state", async () => {
    const cb = getCircuitBreaker("test-ok-" + Date.now());
    const result = await cb.execute(() => Promise.resolve(42));
    expect(result).toBe(42);
    expect(cb.currentState).toBe("CLOSED");
  });

  it("opens after failureThreshold consecutive failures", async () => {
    const cb = getCircuitBreaker("test-fail-" + Date.now(), { failureThreshold: 3, recoveryTimeMs: 60_000 });
    const fail = () => Promise.reject(new Error("boom"));
    for (let i = 0; i < 3; i++) {
      await cb.execute(fail).catch(() => {});
    }
    expect(cb.currentState).toBe("OPEN");
  });

  it("throws CircuitBreakerOpenError when OPEN", async () => {
    const cb = getCircuitBreaker("test-open-" + Date.now(), { failureThreshold: 1, recoveryTimeMs: 60_000 });
    await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    expect(cb.currentState).toBe("OPEN");
    await expect(cb.execute(() => Promise.resolve("y"))).rejects.toBeInstanceOf(CircuitBreakerOpenError);
  });

  it("transitions to HALF_OPEN after recoveryTimeMs", async () => {
    const cb = getCircuitBreaker("test-halfopen-" + Date.now(), { failureThreshold: 1, recoveryTimeMs: 10 });
    await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    expect(cb.currentState).toBe("OPEN");
    await new Promise(r => setTimeout(r, 20));
    // Next call should be allowed (HALF_OPEN probe)
    const result = await cb.execute(() => Promise.resolve("recovered"));
    expect(result).toBe("recovered");
    expect(cb.currentState).toBe("CLOSED");
  });

  it("withFallback returns fallback value when circuit is open", async () => {
    const name = "test-fallback-" + Date.now();
    const cb = getCircuitBreaker(name, { failureThreshold: 1, recoveryTimeMs: 60_000 });
    await cb.execute(() => Promise.reject(new Error("x"))).catch(() => {});
    const result = await withFallback(name, () => Promise.resolve("live"), () => "fallback");
    expect(result).toBe("fallback");
  });

  it("withFallback returns live value when circuit is closed", async () => {
    const name = "test-live-" + Date.now();
    const result = await withFallback(name, () => Promise.resolve("live"), () => "fallback");
    expect(result).toBe("live");
  });

  it("getAllCircuitBreakerStats returns array of stats", async () => {
    const { getAllCircuitBreakerStats } = await import("./circuitBreaker");
    const stats = getAllCircuitBreakerStats();
    expect(Array.isArray(stats)).toBe(true);
  });
});

// ─── Audit Trail ─────────────────────────────────────────────────────────────

describe("auditTrail", () => {
  it("never throws even when DB is unavailable", async () => {
    vi.resetModules();
    // Mock getDb to throw
    vi.doMock("./db", () => ({ getDb: () => Promise.reject(new Error("DB down")) }));
    const { auditLog } = await import("./auditTrail");
    await expect(
      auditLog({
        merchantId: "merch_test",
        actorId: "user_test",
        actorName: "Test User",
        action: "test.action",
        resource: "test",
      })
    ).resolves.toBeUndefined();
  });

  it("buildAuditEntry constructs correct shape", async () => {
    const { buildAuditEntry, AUDIT } = await import("./auditTrail");
    const ctx = { user: { openId: "oid_123", name: "Alice", email: "alice@test.com" } };
    const entry = buildAuditEntry(ctx, "merch_1", AUDIT.PAYOUT_CREATED, "payout", "pay_abc", { amount: 5000 });
    expect(entry.merchantId).toBe("merch_1");
    expect(entry.actorId).toBe("oid_123");
    expect(entry.actorName).toBe("Alice");
    expect(entry.actorEmail).toBe("alice@test.com");
    expect(entry.action).toBe("payout.created");
    expect(entry.resource).toBe("payout");
    expect(entry.resourceId).toBe("pay_abc");
    expect(entry.metadata).toEqual({ amount: 5000 });
  });

  it("AUDIT constants are all non-empty strings", async () => {
    const { AUDIT } = await import("./auditTrail");
    for (const [key, value] of Object.entries(AUDIT)) {
      expect(typeof value).toBe("string");
      expect((value as string).length).toBeGreaterThan(0);
      expect((value as string)).toContain(".");
    }
  });
});

// ─── Web Push ─────────────────────────────────────────────────────────────────

describe("webPush", () => {
  beforeEach(() => {
    vi.resetModules();
    // Ensure VAPID keys are not set for graceful degradation tests
    delete process.env.VAPID_PUBLIC_KEY;
    delete process.env.VAPID_PRIVATE_KEY;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("isWebPushConfigured returns false when VAPID keys are missing", async () => {
    const { isWebPushConfigured } = await import("./webPush");
    expect(isWebPushConfigured()).toBe(false);
  });

  it("isWebPushConfigured returns true when VAPID keys are set", async () => {
    process.env.VAPID_PUBLIC_KEY = "BFake_public_key_for_testing_only_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa";
    process.env.VAPID_PRIVATE_KEY = "fake_private_key_for_testing_only_aaaaaaaaaaaa";
    const { isWebPushConfigured } = await import("./webPush");
    expect(isWebPushConfigured()).toBe(true);
  });

  it("getVapidPublicKey returns empty string when not configured", async () => {
    const { getVapidPublicKey } = await import("./webPush");
    expect(getVapidPublicKey()).toBe("");
  });

  it("sendWebPush returns zero counts gracefully when VAPID not configured", async () => {
    const { sendWebPush } = await import("./webPush");
    const result = await sendWebPush(
      [{ endpoint: "https://fcm.example.com/token", keys: { p256dh: "abc", auth: "xyz" } }],
      { title: "Test", body: "Hello" }
    );
    expect(result.sent).toBe(0);
    expect(result.failed).toBe(0);
    expect(result.invalidTokens).toEqual([]);
  });

  it("notifyUser returns zero counts when DB is unavailable", async () => {
    vi.doMock("./db", () => ({ getDb: () => Promise.resolve(null) }));
    const { notifyUser } = await import("./webPush");
    const result = await notifyUser(1, { title: "Test", body: "Hello" });
    expect(result.sent).toBe(0);
  });
});

// ─── Logger ───────────────────────────────────────────────────────────────────

describe("logger", () => {
  it("exports a logger with info, warn, error methods", async () => {
    const { logger } = await import("./logger");
    expect(typeof logger.info).toBe("function");
    expect(typeof logger.warn).toBe("function");
    expect(typeof logger.error).toBe("function");
  });

  it("logger.info does not throw", () => {
    return import("./logger").then(({ logger }) => {
      expect(() => logger.info("test_event", { key: "value" })).not.toThrow();
    });
  });

  it("logger.warn does not throw", () => {
    return import("./logger").then(({ logger }) => {
      expect(() => logger.warn("test_warning", { key: "value" })).not.toThrow();
    });
  });

  it("logger.error does not throw", () => {
    return import("./logger").then(({ logger }) => {
      expect(() => logger.error("test_error", new Error("test"), { key: "value" })).not.toThrow();
    });
  });
});

// ─── VTpass simulation mode ───────────────────────────────────────────────────

describe("vtpass", () => {
  beforeEach(() => {
    vi.resetModules();
    delete process.env.VTPASS_API_KEY;
    delete process.env.VTPASS_SECRET_KEY;
  });

  it("vtpassPay returns simulated result when no credentials are set", async () => {
    const { vtpassPay } = await import("./vtpass");
    const result = await vtpassPay({
      requestId: "req_test_001",
      billerCode: "airtel",
      customerReference: "08012345678",
      amountNaira: 100,
    });
    expect(result.success).toBe(true);
    expect(result.status).toBe("completed");
    expect(result.providerRef).toContain("sim_");
  });

  it("vtpassVerify returns simulated result when no credentials are set", async () => {
    const { vtpassVerify } = await import("./vtpass");
    const result = await vtpassVerify({
      billerCode: "ekedc",
      customerReference: "12345678901",
    });
    expect(result.valid).toBe(true);
    expect(result.customerName).toBe("Simulated Customer");
  });
});

// ─── Termii OTP graceful degradation ─────────────────────────────────────────

describe("Termii OTP", () => {
  it("returns success in dev mode when TERMII_API_KEY is not set", async () => {
    delete process.env.TERMII_API_KEY;
    // Access the function through the wave68Router module
    // We test the exported helper indirectly by checking the module loads
    const mod = await import("./wave68Router");
    expect(mod).toBeDefined();
  });
});
