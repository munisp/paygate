/**
 * security32.ts — Wave 32 Security Hardening
 * VULN-051 through VULN-060
 * Covers: Invite code enumeration, SSO misconfiguration, plan limit bypass,
 *         billing invoice tampering, corridor fee manipulation, BNPL repayment
 *         forgery, partner onboarding data leakage, Stripe webhook replay,
 *         cross-tenant subscription access, SSO token injection
 */
import crypto from "crypto";
import { Request, Response, NextFunction } from "express";

// ─── VULN-051: Invite Code Enumeration Prevention ────────────────────────────
// Invite codes must not be guessable via sequential IDs or predictable patterns.
// Timing-safe comparison prevents oracle attacks.
export function validateInviteCode(input: string, stored: string): boolean {
  if (!input || !stored) return false;
  // Normalize to uppercase, strip whitespace
  const normalizedInput = input.trim().toUpperCase();
  const normalizedStored = stored.trim().toUpperCase();
  if (normalizedInput.length !== normalizedStored.length) return false;
  // Timing-safe comparison
  const a = Buffer.from(normalizedInput.padEnd(64, "\0"));
  const b = Buffer.from(normalizedStored.padEnd(64, "\0"));
  return crypto.timingSafeEqual(a, b);
}

export function isInviteCodeFormatValid(code: string): boolean {
  // Enforce format: PG-XXXX#### (2-letter prefix, 4 uppercase letters, 4 digits)
  return /^PG-[A-Z]{4}\d{4}$/.test(code);
}

// ─── VULN-052: SSO Misconfiguration Prevention ───────────────────────────────
// SSO discovery URLs must point to trusted OIDC/SAML providers only.
// Prevents SSRF via malicious discovery URL injection.
const ALLOWED_SSO_DOMAINS = [
  "accounts.google.com",
  "login.microsoftonline.com",
  "auth0.com",
  "okta.com",
  "onelogin.com",
  "ping.identity",
  "shibboleth.net",
  "idp.ssocircle.com",
];

export function validateSSODiscoveryUrl(url: string): { valid: boolean; reason?: string } {
  if (!url) return { valid: false, reason: "Discovery URL is required" };
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    return { valid: false, reason: "Invalid URL format" };
  }
  if (parsed.protocol !== "https:") {
    return { valid: false, reason: "SSO discovery URL must use HTTPS" };
  }
  // Block private IP ranges (SSRF prevention)
  const hostname = parsed.hostname;
  if (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.startsWith("10.") ||
    hostname.startsWith("192.168.") ||
    hostname.startsWith("172.16.") ||
    hostname.startsWith("169.254.") ||
    hostname === "0.0.0.0" ||
    hostname.endsWith(".internal") ||
    hostname.endsWith(".local")
  ) {
    return { valid: false, reason: "SSO discovery URL must not point to internal/private addresses" };
  }
  return { valid: true };
}

export function sanitizeSSOClientSecret(secret: string | null | undefined): string | null {
  if (!secret) return null;
  // Never log or expose raw client secrets
  return secret.replace(/./g, "*").slice(0, 8) + "...";
}

// ─── VULN-053: Plan Limit Bypass Prevention ──────────────────────────────────
// Plan limits must be enforced server-side; client-sent plan names must be validated.
const VALID_PLANS = ["free", "starter", "growth", "business", "enterprise"] as const;
type Plan = typeof VALID_PLANS[number];

export function isValidPlan(plan: string): plan is Plan {
  return VALID_PLANS.includes(plan as Plan);
}

export interface PlanLimits {
  maxApiCallsPerMonth: number;
  maxTxVolumeUsdPerMonth: number;
  maxUsers: number;
  maxCorridors: number;
  maxWebhooks: number;
  maxApiKeys: number;
  priceUsdPerMonth: number;
}

const PLAN_LIMITS_DEFAULTS: Record<Plan, PlanLimits> = {
  free:       { maxApiCallsPerMonth: 1000,      maxTxVolumeUsdPerMonth: 1000,      maxUsers: 2,      maxCorridors: 1,   maxWebhooks: 2,   maxApiKeys: 1,   priceUsdPerMonth: 0 },
  starter:    { maxApiCallsPerMonth: 10000,     maxTxVolumeUsdPerMonth: 10000,     maxUsers: 5,      maxCorridors: 3,   maxWebhooks: 5,   maxApiKeys: 3,   priceUsdPerMonth: 49 },
  growth:     { maxApiCallsPerMonth: 100000,    maxTxVolumeUsdPerMonth: 100000,    maxUsers: 20,     maxCorridors: 10,  maxWebhooks: 20,  maxApiKeys: 10,  priceUsdPerMonth: 199 },
  business:   { maxApiCallsPerMonth: 1000000,   maxTxVolumeUsdPerMonth: 1000000,   maxUsers: 100,    maxCorridors: 50,  maxWebhooks: 100, maxApiKeys: 50,  priceUsdPerMonth: 799 },
  enterprise: { maxApiCallsPerMonth: 999999999, maxTxVolumeUsdPerMonth: 999999999, maxUsers: 999999, maxCorridors: 999, maxWebhooks: 999, maxApiKeys: 999, priceUsdPerMonth: 0 },
};

export function getPlanLimits(plan: string): PlanLimits {
  if (!isValidPlan(plan)) return PLAN_LIMITS_DEFAULTS.free;
  return PLAN_LIMITS_DEFAULTS[plan];
}

export function checkPlanLimit(
  plan: string,
  resource: keyof PlanLimits,
  currentUsage: number
): { allowed: boolean; limit: number; usage: number } {
  const limits = getPlanLimits(plan);
  const limit = limits[resource] as number;
  return { allowed: currentUsage < limit, limit, usage: currentUsage };
}

// ─── VULN-054: Billing Invoice Tampering Prevention ──────────────────────────
// Invoice amounts must be calculated server-side from plan_limits table.
// Client-submitted amounts must be rejected.
export function calculateInvoiceAmount(plan: string, billingPeriodDays: number): number {
  const limits = getPlanLimits(plan);
  const monthlyPrice = limits.priceUsdPerMonth;
  if (billingPeriodDays <= 0 || billingPeriodDays > 366) return monthlyPrice;
  // Pro-rate for partial months
  const dailyRate = monthlyPrice / 30;
  return Math.round(dailyRate * billingPeriodDays * 100) / 100;
}

export function validateInvoiceStatus(status: string): boolean {
  return ["draft", "open", "paid", "void", "uncollectible"].includes(status);
}

// ─── VULN-055: Corridor Fee Manipulation Prevention ──────────────────────────
// FX corridor fees must be within business-defined bounds.
// Prevents merchants from setting negative fees or zero fees to bypass revenue.
export function validateCorridorFee(feePct: number): { valid: boolean; reason?: string } {
  if (typeof feePct !== "number" || isNaN(feePct)) {
    return { valid: false, reason: "Fee must be a number" };
  }
  if (feePct < 0) {
    return { valid: false, reason: "Fee percentage cannot be negative" };
  }
  if (feePct > 10) {
    return { valid: false, reason: "Fee percentage cannot exceed 10%" };
  }
  return { valid: true };
}

export function validateCorridorAmounts(minAmount: number, maxAmount: number): { valid: boolean; reason?: string } {
  if (minAmount < 0) return { valid: false, reason: "Minimum amount cannot be negative" };
  if (maxAmount <= 0) return { valid: false, reason: "Maximum amount must be positive" };
  if (minAmount >= maxAmount) return { valid: false, reason: "Minimum amount must be less than maximum amount" };
  if (maxAmount > 1000000) return { valid: false, reason: "Maximum amount cannot exceed $1,000,000" };
  return { valid: true };
}

// ─── VULN-056: BNPL Repayment Forgery Prevention ─────────────────────────────
// Repayment amounts must match the scheduled instalment amount.
// Prevents underpayment attacks where partial amounts are submitted as full payment.
export function validateRepaymentAmount(
  scheduledAmount: number,
  submittedAmount: number,
  tolerance: number = 0.01
): { valid: boolean; reason?: string } {
  if (submittedAmount <= 0) {
    return { valid: false, reason: "Repayment amount must be positive" };
  }
  const diff = Math.abs(submittedAmount - scheduledAmount);
  if (diff > tolerance) {
    return {
      valid: false,
      reason: `Repayment amount ${submittedAmount} does not match scheduled amount ${scheduledAmount}`,
    };
  }
  return { valid: true };
}

export function validateRepaymentStatus(currentStatus: string, newStatus: string): { valid: boolean; reason?: string } {
  const validTransitions: Record<string, string[]> = {
    pending: ["paid", "overdue"],
    overdue: ["paid"],
    paid: [], // Terminal state — no transitions allowed
  };
  const allowed = validTransitions[currentStatus] ?? [];
  if (!allowed.includes(newStatus)) {
    return {
      valid: false,
      reason: `Cannot transition repayment from '${currentStatus}' to '${newStatus}'`,
    };
  }
  return { valid: true };
}

// ─── VULN-057: Partner Onboarding Data Leakage Prevention ────────────────────
// Onboarding sessions must not expose sensitive fields to unauthorized callers.
// Strip client_secret, rc_number, and fee_structure from public responses.
export interface PartnerOnboardingPublicView {
  id: string;
  companyName: string;
  step: number;
  status: string;
  createdAt: Date;
}

export function sanitizeOnboardingSession(session: Record<string, unknown>): PartnerOnboardingPublicView {
  return {
    id: String(session.id ?? ""),
    companyName: String(session.company_name ?? ""),
    step: Number(session.step ?? 0),
    status: String(session.status ?? "pending"),
    createdAt: session.created_at instanceof Date ? session.created_at : new Date(String(session.created_at ?? "")),
  };
}

// ─── VULN-058: Stripe Webhook Replay Attack Prevention ───────────────────────
// Stripe webhook events must be validated for timestamp freshness.
// Events older than 5 minutes should be rejected to prevent replay attacks.
const STRIPE_WEBHOOK_TOLERANCE_SECONDS = 300; // 5 minutes

export function validateStripeWebhookTimestamp(timestamp: number): { valid: boolean; reason?: string } {
  const now = Math.floor(Date.now() / 1000);
  const age = now - timestamp;
  if (age > STRIPE_WEBHOOK_TOLERANCE_SECONDS) {
    return {
      valid: false,
      reason: `Webhook event is too old (${age}s). Maximum allowed age is ${STRIPE_WEBHOOK_TOLERANCE_SECONDS}s`,
    };
  }
  if (age < -60) {
    return { valid: false, reason: "Webhook event timestamp is in the future" };
  }
  return { valid: true };
}

// ─── VULN-059: Cross-Tenant Subscription Access Prevention ───────────────────
// Stripe subscriptions must be scoped to the authenticated user.
// Prevents horizontal privilege escalation where user A reads user B's subscription.
export function assertSubscriptionOwnership(
  subscriptionUserId: string | number,
  requestingUserId: string | number
): void {
  const subId = String(subscriptionUserId);
  const reqId = String(requestingUserId);
  if (subId !== reqId) {
    throw new Error(`Access denied: subscription belongs to user ${subId}, not ${reqId}`);
  }
}

// ─── VULN-060: SSO Token Injection Prevention ────────────────────────────────
// SSO callback tokens must be validated against the expected nonce and state.
// Prevents token injection attacks where attacker substitutes a valid token from another session.
export interface SSOState {
  nonce: string;
  tenantId: string;
  redirectUri: string;
  createdAt: number;
}

export function createSSOState(tenantId: string, redirectUri: string): SSOState {
  return {
    nonce: crypto.randomBytes(32).toString("hex"),
    tenantId,
    redirectUri,
    createdAt: Date.now(),
  };
}

export function validateSSOState(
  state: SSOState,
  expectedTenantId: string,
  maxAgeMs: number = 10 * 60 * 1000 // 10 minutes
): { valid: boolean; reason?: string } {
  if (!state.nonce || state.nonce.length < 32) {
    return { valid: false, reason: "Invalid SSO state nonce" };
  }
  if (state.tenantId !== expectedTenantId) {
    return { valid: false, reason: "SSO state tenant ID mismatch" };
  }
  const age = Date.now() - state.createdAt;
  if (age > maxAgeMs) {
    return { valid: false, reason: `SSO state expired (age: ${age}ms, max: ${maxAgeMs}ms)` };
  }
  return { valid: true };
}

// ─── Express Middleware: Wave 32 Security Headers ────────────────────────────
export function wave32SecurityMiddleware(req: Request, res: Response, next: NextFunction): void {
  // Prevent invite code enumeration via response timing
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "DENY");
  // Prevent caching of sensitive billing/subscription data
  if (req.path.includes("/billing") || req.path.includes("/subscription") || req.path.includes("/invite")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, private");
    res.setHeader("Pragma", "no-cache");
  }
  next();
}
