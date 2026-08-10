/**
 * wave85.security32.test.ts — Security Tests for Wave 32
 * VULN-051 through VULN-060
 */
import { describe, it, expect } from "vitest";
import {
  validateInviteCode,
  isInviteCodeFormatValid,
  validateSSODiscoveryUrl,
  sanitizeSSOClientSecret,
  isValidPlan,
  getPlanLimits,
  checkPlanLimit,
  calculateInvoiceAmount,
  validateInvoiceStatus,
  validateCorridorFee,
  validateCorridorAmounts,
  validateRepaymentAmount,
  validateRepaymentStatus,
  sanitizeOnboardingSession,
  validateStripeWebhookTimestamp,
  assertSubscriptionOwnership,
  createSSOState,
  validateSSOState,
} from "./security32";

// ─── VULN-051: Invite Code Enumeration Prevention ────────────────────────────
describe("VULN-051 — Invite Code Enumeration Prevention", () => {
  it("validates matching invite codes in timing-safe manner", () => {
    expect(validateInviteCode("PG-KUDA2024", "PG-KUDA2024")).toBe(true);
  });

  it("rejects mismatched invite codes", () => {
    expect(validateInviteCode("PG-FAKE2024", "PG-KUDA2024")).toBe(false);
  });

  it("is case-insensitive for invite code comparison", () => {
    expect(validateInviteCode("pg-kuda2024", "PG-KUDA2024")).toBe(true);
  });

  it("rejects empty invite codes", () => {
    expect(validateInviteCode("", "PG-KUDA2024")).toBe(false);
    expect(validateInviteCode("PG-KUDA2024", "")).toBe(false);
  });

  it("validates invite code format PG-XXXX####", () => {
    expect(isInviteCodeFormatValid("PG-KUDA2024")).toBe(true);
    expect(isInviteCodeFormatValid("PG-FLWV2024")).toBe(true);
  });

  it("rejects invalid invite code formats", () => {
    expect(isInviteCodeFormatValid("INVALID")).toBe(false);
    expect(isInviteCodeFormatValid("PG-123")).toBe(false);
    expect(isInviteCodeFormatValid("pg-kuda2024")).toBe(false); // lowercase
    expect(isInviteCodeFormatValid("PG-KUDA20245")).toBe(false); // extra digit
  });
});

// ─── VULN-052: SSO Misconfiguration Prevention ───────────────────────────────
describe("VULN-052 — SSO Misconfiguration Prevention", () => {
  it("accepts valid HTTPS discovery URLs", () => {
    const result = validateSSODiscoveryUrl("https://accounts.google.com/.well-known/openid-configuration");
    expect(result.valid).toBe(true);
  });

  it("rejects HTTP discovery URLs", () => {
    const result = validateSSODiscoveryUrl("http://accounts.google.com/.well-known/openid-configuration");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("HTTPS");
  });

  it("rejects localhost discovery URLs (SSRF prevention)", () => {
    const result = validateSSODiscoveryUrl("https://localhost/openid-configuration");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("internal");
  });

  it("rejects private IP discovery URLs (SSRF prevention)", () => {
    expect(validateSSODiscoveryUrl("https://192.168.1.1/oidc").valid).toBe(false);
    expect(validateSSODiscoveryUrl("https://10.0.0.1/oidc").valid).toBe(false);
    expect(validateSSODiscoveryUrl("https://172.16.0.1/oidc").valid).toBe(false);
  });

  it("rejects internal hostname discovery URLs", () => {
    expect(validateSSODiscoveryUrl("https://auth.internal/oidc").valid).toBe(false);
    expect(validateSSODiscoveryUrl("https://auth.local/oidc").valid).toBe(false);
  });

  it("sanitizes SSO client secrets in responses", () => {
    const sanitized = sanitizeSSOClientSecret("super-secret-key-12345");
    expect(sanitized).not.toContain("super-secret");
    expect(sanitized).toMatch(/\*+\.\.\./);
  });

  it("handles null client secrets gracefully", () => {
    expect(sanitizeSSOClientSecret(null)).toBeNull();
    expect(sanitizeSSOClientSecret(undefined)).toBeNull();
  });
});

// ─── VULN-053: Plan Limit Bypass Prevention ──────────────────────────────────
describe("VULN-053 — Plan Limit Bypass Prevention", () => {
  it("validates known plan names", () => {
    expect(isValidPlan("free")).toBe(true);
    expect(isValidPlan("starter")).toBe(true);
    expect(isValidPlan("growth")).toBe(true);
    expect(isValidPlan("business")).toBe(true);
    expect(isValidPlan("enterprise")).toBe(true);
  });

  it("rejects unknown plan names", () => {
    expect(isValidPlan("unlimited")).toBe(false);
    expect(isValidPlan("admin")).toBe(false);
    expect(isValidPlan("")).toBe(false);
    expect(isValidPlan("FREE")).toBe(false); // case sensitive
  });

  it("returns correct limits for free plan", () => {
    const limits = getPlanLimits("free");
    expect(limits.maxApiCallsPerMonth).toBe(1000);
    expect(limits.maxUsers).toBe(2);
    expect(limits.priceUsdPerMonth).toBe(0);
  });

  it("returns free plan limits for unknown plans (safe default)", () => {
    const limits = getPlanLimits("hacked-plan");
    expect(limits.maxApiCallsPerMonth).toBe(1000);
  });

  it("checks plan limit correctly", () => {
    const result = checkPlanLimit("free", "maxUsers", 1);
    expect(result.allowed).toBe(true);
    expect(result.limit).toBe(2);
  });

  it("blocks when plan limit is exceeded", () => {
    const result = checkPlanLimit("free", "maxUsers", 2);
    expect(result.allowed).toBe(false);
  });
});

// ─── VULN-054: Billing Invoice Tampering Prevention ──────────────────────────
describe("VULN-054 — Billing Invoice Tampering Prevention", () => {
  it("calculates invoice amount from plan, not client input", () => {
    const amount = calculateInvoiceAmount("starter", 30);
    expect(amount).toBeCloseTo(49, 0);
  });

  it("pro-rates invoice for partial months", () => {
    const amount = calculateInvoiceAmount("growth", 15);
    expect(amount).toBeCloseTo(99.5, 0);
  });

  it("validates invoice status transitions", () => {
    expect(validateInvoiceStatus("draft")).toBe(true);
    expect(validateInvoiceStatus("open")).toBe(true);
    expect(validateInvoiceStatus("paid")).toBe(true);
    expect(validateInvoiceStatus("void")).toBe(true);
  });

  it("rejects invalid invoice statuses", () => {
    expect(validateInvoiceStatus("approved")).toBe(false);
    expect(validateInvoiceStatus("pending")).toBe(false);
    expect(validateInvoiceStatus("")).toBe(false);
  });
});

// ─── VULN-055: Corridor Fee Manipulation Prevention ──────────────────────────
describe("VULN-055 — Corridor Fee Manipulation Prevention", () => {
  it("accepts valid corridor fees", () => {
    expect(validateCorridorFee(1.5).valid).toBe(true);
    expect(validateCorridorFee(0).valid).toBe(true);
    expect(validateCorridorFee(10).valid).toBe(true);
  });

  it("rejects negative corridor fees", () => {
    const result = validateCorridorFee(-1);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("negative");
  });

  it("rejects corridor fees above 10%", () => {
    const result = validateCorridorFee(10.01);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("exceed 10%");
  });

  it("validates corridor amount bounds", () => {
    expect(validateCorridorAmounts(1, 10000).valid).toBe(true);
  });

  it("rejects invalid corridor amount ranges", () => {
    expect(validateCorridorAmounts(100, 50).valid).toBe(false);
    expect(validateCorridorAmounts(-1, 1000).valid).toBe(false);
    expect(validateCorridorAmounts(100, 2000000).valid).toBe(false);
  });
});

// ─── VULN-056: BNPL Repayment Forgery Prevention ─────────────────────────────
describe("VULN-056 — BNPL Repayment Forgery Prevention", () => {
  it("accepts exact repayment amounts", () => {
    const result = validateRepaymentAmount(52500, 52500);
    expect(result.valid).toBe(true);
  });

  it("accepts amounts within tolerance", () => {
    const result = validateRepaymentAmount(52500, 52500.005);
    expect(result.valid).toBe(true);
  });

  it("rejects underpayments", () => {
    const result = validateRepaymentAmount(52500, 52000);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("does not match");
  });

  it("rejects zero or negative repayment amounts", () => {
    expect(validateRepaymentAmount(52500, 0).valid).toBe(false);
    expect(validateRepaymentAmount(52500, -100).valid).toBe(false);
  });

  it("validates repayment status transitions", () => {
    expect(validateRepaymentStatus("pending", "paid").valid).toBe(true);
    expect(validateRepaymentStatus("pending", "overdue").valid).toBe(true);
    expect(validateRepaymentStatus("overdue", "paid").valid).toBe(true);
  });

  it("prevents illegal repayment status transitions", () => {
    expect(validateRepaymentStatus("paid", "pending").valid).toBe(false);
    expect(validateRepaymentStatus("paid", "overdue").valid).toBe(false);
    expect(validateRepaymentStatus("pending", "pending").valid).toBe(false);
  });
});

// ─── VULN-057: Partner Onboarding Data Leakage Prevention ────────────────────
describe("VULN-057 — Partner Onboarding Data Leakage Prevention", () => {
  it("strips sensitive fields from onboarding session", () => {
    const rawSession = {
      id: "sess-001",
      company_name: "Test Corp",
      step: 3,
      status: "in_progress",
      created_at: new Date(),
      rc_number: "RC-12345678",
      fee_structure: { rate: 1.5, flat: 0 },
      client_secret: "super-secret",
    };
    const sanitized = sanitizeOnboardingSession(rawSession);
    expect(sanitized.companyName).toBe("Test Corp");
    expect(sanitized.step).toBe(3);
    expect((sanitized as Record<string, unknown>).rc_number).toBeUndefined();
    expect((sanitized as Record<string, unknown>).fee_structure).toBeUndefined();
    expect((sanitized as Record<string, unknown>).client_secret).toBeUndefined();
  });
});

// ─── VULN-058: Stripe Webhook Replay Attack Prevention ───────────────────────
describe("VULN-058 — Stripe Webhook Replay Attack Prevention", () => {
  it("accepts fresh webhook timestamps", () => {
    const now = Math.floor(Date.now() / 1000);
    const result = validateStripeWebhookTimestamp(now - 60); // 1 minute old
    expect(result.valid).toBe(true);
  });

  it("rejects stale webhook timestamps (replay attack)", () => {
    const staleTimestamp = Math.floor(Date.now() / 1000) - 400; // 6+ minutes old
    const result = validateStripeWebhookTimestamp(staleTimestamp);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("too old");
  });

  it("rejects future webhook timestamps", () => {
    const futureTimestamp = Math.floor(Date.now() / 1000) + 120; // 2 minutes in future
    const result = validateStripeWebhookTimestamp(futureTimestamp);
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("future");
  });
});

// ─── VULN-059: Cross-Tenant Subscription Access Prevention ───────────────────
describe("VULN-059 — Cross-Tenant Subscription Access Prevention", () => {
  it("allows owner to access their own subscription", () => {
    expect(() => assertSubscriptionOwnership("42", "42")).not.toThrow();
    expect(() => assertSubscriptionOwnership(42, 42)).not.toThrow();
  });

  it("throws when user tries to access another user's subscription", () => {
    expect(() => assertSubscriptionOwnership("42", "99")).toThrow("Access denied");
    expect(() => assertSubscriptionOwnership(42, 99)).toThrow("Access denied");
  });

  it("handles string/number type coercion correctly", () => {
    expect(() => assertSubscriptionOwnership("42", 42)).not.toThrow();
    expect(() => assertSubscriptionOwnership(42, "42")).not.toThrow();
  });
});

// ─── VULN-060: SSO Token Injection Prevention ────────────────────────────────
describe("VULN-060 — SSO Token Injection Prevention", () => {
  it("creates SSO state with cryptographic nonce", () => {
    const state = createSSOState("tenant-001", "https://app.paygate.ng/callback");
    expect(state.nonce).toHaveLength(64); // 32 bytes hex = 64 chars
    expect(state.tenantId).toBe("tenant-001");
    expect(state.redirectUri).toBe("https://app.paygate.ng/callback");
  });

  it("validates fresh SSO state", () => {
    const state = createSSOState("tenant-001", "https://app.paygate.ng/callback");
    const result = validateSSOState(state, "tenant-001");
    expect(result.valid).toBe(true);
  });

  it("rejects SSO state with wrong tenant ID", () => {
    const state = createSSOState("tenant-001", "https://app.paygate.ng/callback");
    const result = validateSSOState(state, "tenant-999");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("mismatch");
  });

  it("rejects expired SSO state", () => {
    const state = createSSOState("tenant-001", "https://app.paygate.ng/callback");
    // Simulate expired state by backdating createdAt
    state.createdAt = Date.now() - 15 * 60 * 1000; // 15 minutes ago
    const result = validateSSOState(state, "tenant-001");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("expired");
  });

  it("rejects SSO state with short nonce", () => {
    const state = createSSOState("tenant-001", "https://app.paygate.ng/callback");
    state.nonce = "short";
    const result = validateSSOState(state, "tenant-001");
    expect(result.valid).toBe(false);
    expect(result.reason).toContain("nonce");
  });
});
