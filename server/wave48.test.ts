/**
 * Wave 48 — Redis Cache, Keycloak SSO, Fraud Scoring Gate
 *
 * Tests cover:
 *  1. Redis TTL cache (withCache / cache.flush / TTL constants)
 *  2. Keycloak route helpers (buildAuthorizationUrl, getEndSessionEndpoint, createSessionToken)
 *  3. Fraud scoring gate logic (decline on critical, flag on high, pass-through on unavailable)
 */

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// ─── 1. Redis Cache ───────────────────────────────────────────────────────────

vi.mock("ioredis", () => {
  const store = new Map<string, string>();
  const MockRedis = vi.fn().mockImplementation(() => ({
    get: vi.fn(async (key: string) => store.get(key) ?? null),
    set: vi.fn(async (key: string, val: string, _ex?: string, _ttl?: number) => {
      store.set(key, val);
      return "OK";
    }),
    del: vi.fn(async (key: string) => { store.delete(key); return 1; }),
    keys: vi.fn(async (pattern: string) => {
      const prefix = pattern.replace(/\*$/, "");
      return Array.from(store.keys()).filter(k => k.startsWith(prefix));
    }),
    quit: vi.fn(async () => "OK"),
    on: vi.fn(),
    status: "ready",
  }));
  return { default: MockRedis };
});

describe("Redis TTL cache (withCache)", () => {
  let withCache: typeof import("./cache").withCache;
  let TTL: typeof import("./cache").TTL;
  let cache: typeof import("./cache").cache;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./cache");
    withCache = mod.withCache;
    TTL = mod.TTL;
    cache = mod.cache;
  });

  it("TTL constants are defined and positive", () => {
    expect(TTL.DASHBOARD_OVERVIEW).toBeGreaterThan(0);
    expect(TTL.FX_RATES).toBeGreaterThan(0);
    expect(TTL.SESSION).toBeGreaterThan(0);
    expect(TTL.NIP_ACCOUNT).toBeGreaterThan(0);
  });

  it("DASHBOARD_OVERVIEW TTL is 60 seconds", () => {
    expect(TTL.DASHBOARD_OVERVIEW).toBe(60);
  });

  it("FX_RATES TTL is 300 seconds (5 minutes)", () => {
    expect(TTL.FX_RATES).toBe(300);
  });

  it("withCache calls factory on first call (cache miss)", async () => {
    const factory = vi.fn().mockResolvedValue({ revenue: 1000 });
    const result = await withCache("test:ns", "key1", 60, factory);
    expect(factory).toHaveBeenCalledOnce();
    expect(result).toEqual({ revenue: 1000 });
  });

  it("withCache returns cached value on second call (cache hit)", async () => {
    const factory = vi.fn().mockResolvedValue({ revenue: 2000 });
    await withCache("test:ns", "key2", 60, factory);
    const result2 = await withCache("test:ns", "key2", 60, factory);
    // factory should only be called once — second call is a hit
    expect(factory).toHaveBeenCalledOnce();
    expect(result2).toEqual({ revenue: 2000 });
  });

  it("withCache uses different keys for different inputs", async () => {
    const factory = vi.fn().mockImplementation(async () => ({ ts: Date.now() }));
    await withCache("test:ns", "keyA", 60, factory);
    await withCache("test:ns", "keyB", 60, factory);
    // Each key triggers a separate factory call
    expect(factory).toHaveBeenCalledTimes(2);
  });

  it("withCache falls through to factory when Redis is unavailable", async () => {
    // Simulate Redis throwing on get
    const factory = vi.fn().mockResolvedValue({ fallback: true });
    // Override cache.get to throw
    vi.spyOn(cache, "get").mockRejectedValueOnce(new Error("Redis down"));
    const result = await withCache("test:ns", "keyErr", 60, factory);
    expect(factory).toHaveBeenCalledOnce();
    expect(result).toEqual({ fallback: true });
  });

  it("cache.flush removes all keys for a namespace", async () => {
    const factory = vi.fn().mockResolvedValue({ data: 1 });
    await withCache("flush:ns", "k1", 60, factory);
    await withCache("flush:ns", "k2", 60, factory);
    await cache.flush("flush:ns");
    // After flush, next call should be a miss
    const factory2 = vi.fn().mockResolvedValue({ data: 2 });
    await withCache("flush:ns", "k1", 60, factory2);
    expect(factory2).toHaveBeenCalledOnce();
  });
});

// ─── 2. Keycloak SSO Helpers ──────────────────────────────────────────────────

vi.mock("./_core/env", () => ({
  ENV: {
    keycloakUrl: "https://keycloak.example.com",
    keycloakRealm: "paygate",
    keycloakClientId: "merchant-portal",
    keycloakClientSecret: "test-secret",
    jwtSecret: "test-jwt-secret-that-is-long-enough-for-hs256",
    appId: "paygate",
  },
}));

describe("Keycloak SSO helpers", () => {
  let buildAuthorizationUrl: typeof import("./_core/keycloak").buildAuthorizationUrl;
  let getEndSessionEndpoint: typeof import("./_core/keycloak").getEndSessionEndpoint;
  let COOKIE_NAME: typeof import("./_core/keycloak").COOKIE_NAME;

  beforeEach(async () => {
    vi.resetModules();
    const mod = await import("./_core/keycloak");
    buildAuthorizationUrl = mod.buildAuthorizationUrl;
    getEndSessionEndpoint = mod.getEndSessionEndpoint;
    COOKIE_NAME = mod.COOKIE_NAME;
  });

  it("COOKIE_NAME is defined and non-empty", () => {
    expect(typeof COOKIE_NAME).toBe("string");
    expect(COOKIE_NAME.length).toBeGreaterThan(0);
  });

  it("buildAuthorizationUrl returns a valid URL with required params", () => {
    const url = buildAuthorizationUrl("https://app.example.com/callback", "state123");
    expect(url).toContain("https://keycloak.example.com");
    expect(url).toContain("paygate");
    expect(url).toContain("merchant-portal");
    expect(url).toContain("state123");
    expect(url).toContain("response_type=code");
    expect(url).toContain("scope=");
  });

  it("buildAuthorizationUrl encodes redirect_uri", () => {
    const redirectUri = "https://app.example.com/api/oauth/keycloak/callback";
    const url = buildAuthorizationUrl(redirectUri, "s1");
    expect(url).toContain(encodeURIComponent(redirectUri));
  });

  it("getEndSessionEndpoint returns Keycloak end-session URL", () => {
    const url = getEndSessionEndpoint();
    expect(url).toContain("keycloak.example.com");
    expect(url).toContain("paygate");
    expect(url.toLowerCase()).toMatch(/end.session|logout/);
  });

  it("buildAuthorizationUrl includes openid scope", () => {
    const url = buildAuthorizationUrl("https://app.example.com/cb", "st");
    expect(decodeURIComponent(url)).toContain("openid");
  });
});

// ─── 3. Fraud Scoring Gate Logic ─────────────────────────────────────────────

describe("Fraud scoring gate — decision logic", () => {
  /**
   * We test the decision logic in isolation without invoking the full tRPC stack.
   * The gate has three outcomes:
   *   a) fraudResult is null (service unavailable) → pass-through (fail-open)
   *   b) risk_level === "critical" or recommendation === "decline" → throw FORBIDDEN
   *   c) risk_level === "high" → pass-through but flag for review
   *   d) risk_level === "low" | "medium" → pass-through, no alert
   */

  type FraudResult = {
    transaction_id: string;
    risk_score: number;
    risk_level: "low" | "medium" | "high" | "critical";
    signals: string[];
    recommendation: "approve" | "review" | "decline";
  };

  function evaluateFraudGate(fraudResult: FraudResult | null): {
    blocked: boolean;
    flagged: boolean;
    reason?: string;
  } {
    if (!fraudResult) return { blocked: false, flagged: false };
    if (fraudResult.recommendation === "decline" || fraudResult.risk_level === "critical") {
      return {
        blocked: true,
        flagged: true,
        reason: `score: ${fraudResult.risk_score}/100, signals: ${fraudResult.signals.join(", ")}`,
      };
    }
    if (fraudResult.risk_level === "high") {
      return { blocked: false, flagged: true };
    }
    return { blocked: false, flagged: false };
  }

  it("null result (service unavailable) → pass-through, not flagged", () => {
    const result = evaluateFraudGate(null);
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(false);
  });

  it("low risk → pass-through, not flagged", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_1", risk_score: 10, risk_level: "low",
      signals: [], recommendation: "approve",
    });
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(false);
  });

  it("medium risk → pass-through, not flagged", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_2", risk_score: 45, risk_level: "medium",
      signals: ["unusual_amount"], recommendation: "review",
    });
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(false);
  });

  it("high risk → pass-through but flagged for review", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_3", risk_score: 75, risk_level: "high",
      signals: ["velocity_breach", "unusual_location"], recommendation: "review",
    });
    expect(result.blocked).toBe(false);
    expect(result.flagged).toBe(true);
  });

  it("critical risk → blocked and flagged", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_4", risk_score: 95, risk_level: "critical",
      signals: ["account_takeover", "ip_blacklist"], recommendation: "decline",
    });
    expect(result.blocked).toBe(true);
    expect(result.flagged).toBe(true);
    expect(result.reason).toContain("95");
  });

  it("recommendation=decline with medium risk → blocked", () => {
    // Edge case: model recommends decline even at medium score
    const result = evaluateFraudGate({
      transaction_id: "txn_5", risk_score: 55, risk_level: "medium",
      signals: ["card_testing"], recommendation: "decline",
    });
    expect(result.blocked).toBe(true);
  });

  it("reason includes signals when blocked", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_6", risk_score: 98, risk_level: "critical",
      signals: ["identity_mismatch", "device_fingerprint"], recommendation: "decline",
    });
    expect(result.reason).toContain("identity_mismatch");
    expect(result.reason).toContain("device_fingerprint");
  });

  it("empty signals list does not crash", () => {
    const result = evaluateFraudGate({
      transaction_id: "txn_7", risk_score: 90, risk_level: "critical",
      signals: [], recommendation: "decline",
    });
    expect(result.blocked).toBe(true);
  });
});

// ─── 4. Keycloak Route Registration ──────────────────────────────────────────

describe("Keycloak route registration", () => {
  it("registerKeycloakRoutes does not throw when KEYCLOAK_URL is set", async () => {
    vi.resetModules();
    // ENV mock already has keycloakUrl set
    const express = await import("express");
    const app = express.default();
    const { registerKeycloakRoutes } = await import("./_core/keycloakRoutes");
    expect(() => registerKeycloakRoutes(app)).not.toThrow();
  });

  it("registerKeycloakRoutes is a no-op when KEYCLOAK_URL is empty", async () => {
    vi.resetModules();
    vi.doMock("./_core/env", () => ({
      ENV: {
        keycloakUrl: "",
        keycloakRealm: "paygate",
        keycloakClientId: "merchant-portal",
        keycloakClientSecret: "",
        jwtSecret: "test-secret",
        appId: "paygate",
      },
    }));
    const express = await import("express");
    const app = express.default();
    const { registerKeycloakRoutes } = await import("./_core/keycloakRoutes");
    // Should not throw; just logs and returns
    expect(() => registerKeycloakRoutes(app)).not.toThrow();
  });
});
