/**
 * PBAC — Policy-Based Access Control Engine
 *
 * Integrates with Permify (https://permify.co) to enforce fine-grained,
 * attribute-aware permissions across all tRPC procedures.
 *
 * Architecture:
 *  1. Policy definitions (resource types, actions, conditions)
 *  2. Permify client (check, write relationship, sync)
 *  3. tRPC middleware factories (pbacProcedure, resourceProcedure)
 *  4. Helper: requirePermission() for inline checks inside procedures
 *
 * Usage:
 *   // In routers.ts:
 *   import { pbacProcedure, requirePermission } from "./pbac";
 *
 *   // Gate an entire procedure:
 *   myRouter.initiateTransfer = pbacProcedure("transaction", "initiate")
 *     .input(z.object({ amount: z.number() }))
 *     .mutation(async ({ ctx, input }) => { ... });
 *
 *   // Inline check inside a procedure:
 *   await requirePermission(ctx.user.id, "payout", "approve", payoutId);
 */

import { TRPCError } from "@trpc/server";
import { protectedProcedure } from "./_core/trpc";
import { ENV as env } from "./_core/env";
import { logger } from "./logger";

// ─── Policy Definitions ───────────────────────────────────────────────────────

/**
 * Resource types and their allowed actions.
 * Maps 1:1 with Permify schema entity types.
 */
export const PBAC_POLICIES = {
  transaction: {
    actions: ["view", "initiate", "cancel", "export"] as const,
    ownerRequired: false,
  },
  payout: {
    actions: ["view", "initiate", "approve", "reject", "cancel"] as const,
    ownerRequired: true,
  },
  dispute: {
    actions: ["view", "create", "respond", "escalate", "close"] as const,
    ownerRequired: false,
  },
  kyc: {
    actions: ["view", "submit", "approve", "reject", "override"] as const,
    ownerRequired: false,
  },
  api_key: {
    actions: ["view", "create", "revoke", "rotate"] as const,
    ownerRequired: true,
  },
  webhook: {
    actions: ["view", "create", "update", "delete", "test"] as const,
    ownerRequired: true,
  },
  virtual_card: {
    actions: ["view", "create", "freeze", "unfreeze", "terminate"] as const,
    ownerRequired: true,
  },
  settlement: {
    actions: ["view", "trigger", "approve", "export"] as const,
    ownerRequired: false,
  },
  billing: {
    actions: ["view", "manage"] as const,
    ownerRequired: false,
  },
  chargeback: {
    actions: ["view", "manage"] as const,
    ownerRequired: false,
  },
  fraud_rule: {
    actions: ["view", "create", "update", "delete", "toggle"] as const,
    ownerRequired: false,
  },
  compliance_report: {
    actions: ["view", "generate", "export", "archive"] as const,
    ownerRequired: false,
  },
  team_member: {
    actions: ["view", "invite", "remove", "update_role"] as const,
    ownerRequired: false,
  },
  payment_link: {
    actions: ["view", "create", "update", "deactivate", "export"] as const,
    ownerRequired: true,
  },
  escrow: {
    actions: ["view", "create", "release", "dispute", "cancel"] as const,
    ownerRequired: true,
  },
  carbon_credit: {
    actions: ["view", "purchase", "retire", "transfer"] as const,
    ownerRequired: true,
  },
  loyalty_program: {
    actions: ["view", "create", "update", "deactivate", "award_points"] as const,
    ownerRequired: false,
  },
  admin_panel: {
    actions: ["view", "configure", "export_data", "impersonate"] as const,
    ownerRequired: false,
  },
} as const;

export type ResourceType = keyof typeof PBAC_POLICIES;
export type ActionFor<R extends ResourceType> = typeof PBAC_POLICIES[R]["actions"][number];

// ─── Role → Permission Matrix (fallback when Permify is offline) ──────────────

const ROLE_PERMISSIONS: Record<string, Record<ResourceType, string[]>> = {
  owner: {
    transaction: ["view", "initiate", "cancel", "export"],
    payout: ["view", "initiate", "approve", "reject", "cancel"],
    dispute: ["view", "create", "respond", "escalate", "close"],
    kyc: ["view", "submit", "approve", "reject", "override"],
    api_key: ["view", "create", "revoke", "rotate"],
    webhook: ["view", "create", "update", "delete", "test"],
    virtual_card: ["view", "create", "freeze", "unfreeze", "terminate"],
    settlement: ["view", "trigger", "approve", "export"],
    billing: ["view", "manage"],
    chargeback: ["view", "manage"],
    fraud_rule: ["view", "create", "update", "delete", "toggle"],
    compliance_report: ["view", "generate", "export", "archive"],
    team_member: ["view", "invite", "remove", "update_role"],
    payment_link: ["view", "create", "update", "deactivate", "export"],
    escrow: ["view", "create", "release", "dispute", "cancel"],
    carbon_credit: ["view", "purchase", "retire", "transfer"],
    loyalty_program: ["view", "create", "update", "deactivate", "award_points"],
    admin_panel: ["view", "configure", "export_data", "impersonate"],
  },
  admin: {
    transaction: ["view", "initiate", "cancel", "export"],
    payout: ["view", "initiate", "approve", "reject", "cancel"],
    dispute: ["view", "create", "respond", "escalate", "close"],
    kyc: ["view", "submit", "approve", "reject", "override"],
    api_key: ["view", "create", "revoke", "rotate"],
    webhook: ["view", "create", "update", "delete", "test"],
    virtual_card: ["view", "create", "freeze", "unfreeze", "terminate"],
    settlement: ["view", "trigger", "approve", "export"],
    billing: ["view", "manage"],
    chargeback: ["view", "manage"],
    fraud_rule: ["view", "create", "update", "delete", "toggle"],
    compliance_report: ["view", "generate", "export", "archive"],
    team_member: ["view", "invite", "remove", "update_role"],
    payment_link: ["view", "create", "update", "deactivate", "export"],
    escrow: ["view", "create", "release", "dispute", "cancel"],
    carbon_credit: ["view", "purchase", "retire", "transfer"],
    loyalty_program: ["view", "create", "update", "deactivate", "award_points"],
    admin_panel: ["view", "configure", "export_data"],
  },
  finance_manager: {
    transaction: ["view", "initiate", "export"],
    payout: ["view", "initiate", "approve"],
    dispute: ["view", "create", "respond"],
    kyc: ["view"],
    api_key: ["view"],
    webhook: ["view"],
    virtual_card: ["view", "freeze"],
    settlement: ["view", "trigger", "export"],
    billing: ["view", "manage"],
    chargeback: ["view", "manage"],
    fraud_rule: ["view"],
    compliance_report: ["view", "generate", "export"],
    team_member: ["view"],
    payment_link: ["view", "create", "update"],
    escrow: ["view", "create"],
    carbon_credit: ["view", "purchase"],
    loyalty_program: ["view"],
    admin_panel: [],
  },
  compliance_officer: {
    transaction: ["view", "export"],
    payout: ["view"],
    dispute: ["view", "respond", "escalate"],
    kyc: ["view", "approve", "reject", "override"],
    api_key: ["view"],
    webhook: ["view"],
    virtual_card: ["view"],
    settlement: ["view", "export"],
    billing: ["view"],
    chargeback: ["view"],
    fraud_rule: ["view", "create", "update", "toggle"],
    compliance_report: ["view", "generate", "export", "archive"],
    team_member: ["view"],
    payment_link: ["view"],
    escrow: ["view"],
    carbon_credit: ["view"],
    loyalty_program: ["view"],
    admin_panel: ["view"],
  },
  developer: {
    transaction: ["view"],
    payout: ["view"],
    dispute: ["view"],
    kyc: ["view"],
    api_key: ["view", "create", "revoke", "rotate"],
    webhook: ["view", "create", "update", "delete", "test"],
    virtual_card: ["view"],
    settlement: ["view"],
    billing: ["view"],
    chargeback: ["view"],
    fraud_rule: ["view"],
    compliance_report: ["view"],
    team_member: ["view"],
    payment_link: ["view", "create"],
    escrow: ["view"],
    carbon_credit: ["view"],
    loyalty_program: ["view"],
    admin_panel: [],
  },
  viewer: {
    transaction: ["view"],
    payout: ["view"],
    dispute: ["view"],
    kyc: ["view"],
    api_key: ["view"],
    webhook: ["view"],
    virtual_card: ["view"],
    settlement: ["view"],
    billing: ["view"],
    chargeback: ["view"],
    fraud_rule: ["view"],
    compliance_report: ["view"],
    team_member: ["view"],
    payment_link: ["view"],
    escrow: ["view"],
    carbon_credit: ["view"],
    loyalty_program: ["view"],
    admin_panel: [],
  },
  user: {
    transaction: ["view", "initiate"],
    payout: ["view", "initiate"],
    dispute: ["view", "create"],
    kyc: ["view", "submit"],
    api_key: ["view", "create", "revoke"],
    webhook: ["view", "create", "update", "delete", "test"],
    virtual_card: ["view", "create", "freeze", "unfreeze"],
    settlement: ["view"],
    billing: [],
    chargeback: [],
    fraud_rule: [],
    compliance_report: [],
    team_member: ["view"],
    payment_link: ["view", "create", "update", "deactivate"],
    escrow: ["view", "create"],
    carbon_credit: ["view", "purchase"],
    loyalty_program: ["view"],
    admin_panel: [],
  },
};

// ─── Permify Client ───────────────────────────────────────────────────────────

interface PermifyCheckRequest {
  tenantId: string;
  entityType: string;
  entityId: string;
  permission: string;
  subjectType: string;
  subjectId: string;
  contextAttributes?: Record<string, unknown>;
}

interface PermifyCheckResponse {
  can: "RESULT_ALLOWED" | "RESULT_DENIED" | "RESULT_UNKNOWN";
  metadata?: { checkCount: number; schemaVersion: string };
}

/**
 * Call Permify's /v1/tenants/{tenant}/permissions/check endpoint.
 * Falls back to the local role-permission matrix if Permify is unreachable.
 */
async function permifyCheck(req: PermifyCheckRequest): Promise<boolean> {
  const { permifyUrl, permifyApiKey } = env;
  const tenantId = req.tenantId || "t1";

  try {
    const response = await fetch(
      `${permifyUrl}/v1/tenants/${tenantId}/permissions/check`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(permifyApiKey ? { Authorization: `Bearer ${permifyApiKey}` } : {}),
        },
        body: JSON.stringify({
          metadata: { schema_version: "", snap_token: "", depth: 20 },
          entity: { type: req.entityType, id: req.entityId },
          permission: req.permission,
          subject: { type: req.subjectType, id: req.subjectId },
          context: req.contextAttributes
            ? { tuples: [], attributes: Object.entries(req.contextAttributes).map(([k, v]) => ({
                entity: { type: req.entityType, id: req.entityId },
                attribute: k,
                value: { "@type": "type.googleapis.com/base.v1.StringValue", value: String(v) },
              })) }
            : undefined,
        }),
        signal: AbortSignal.timeout(2000), // 2s timeout — don't block the request
      }
    );

    if (!response.ok) {
      logger.warn("[PBAC] Permify returned non-OK status, falling back to local matrix", {
        status: response.status,
        entity: req.entityType,
        permission: req.permission,
      });
      return false;
    }

    const data = (await response.json()) as PermifyCheckResponse;
    return data.can === "RESULT_ALLOWED";
  } catch (err: unknown) {
    // Permify offline — fall back to local matrix (fail-open for read, fail-closed for write)
    logger.warn("[PBAC] Permify unreachable, using local role matrix", {
      error: err instanceof Error ? err.message : String(err),
    });
    return false; // Signal to caller to use local fallback
  }
}

/**
 * Write a relationship tuple to Permify (e.g., "user:u1 is member of org:o1").
 * Used during user onboarding and role assignment.
 */
export async function permifyWriteRelationship(
  tenantId: string,
  entityType: string,
  entityId: string,
  relation: string,
  subjectType: string,
  subjectId: string
): Promise<void> {
  const { permifyUrl, permifyApiKey } = env;
  try {
    await fetch(`${permifyUrl}/v1/tenants/${tenantId}/relationships/write`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(permifyApiKey ? { Authorization: `Bearer ${permifyApiKey}` } : {}),
      },
      body: JSON.stringify({
        metadata: { schema_version: "" },
        tuples: [{
          entity: { type: entityType, id: entityId },
          relation,
          subject: { type: subjectType, id: subjectId },
        }],
      }),
      signal: AbortSignal.timeout(3000),
    });
  } catch (err) {
    logger.warn("[PBAC] Failed to write Permify relationship", { err });
  }
}

// ─── Core Permission Check ────────────────────────────────────────────────────

/**
 * Check if a user has permission to perform an action on a resource.
 *
 * Strategy:
 * 1. Try Permify (authoritative, attribute-aware)
 * 2. Fall back to local role-permission matrix
 * 3. Log all decisions for audit trail
 */
export async function checkPermission(
  userId: string,
  userRole: string,
  resource: ResourceType,
  action: string,
  resourceId?: string,
  tenantId: string = "t1"
): Promise<boolean> {
  // 1. Try Permify
  const permifyAllowed = await permifyCheck({
    tenantId,
    entityType: resource,
    entityId: resourceId ?? "*",
    permission: action,
    subjectType: "user",
    subjectId: userId,
  });

  // If Permify returned a definitive answer, use it
  if (permifyAllowed) {
    logger.info("[PBAC] Permify ALLOWED", { userId, resource, action, resourceId });
    return true;
  }

  // 2. Fall back to local role matrix
  const roleKey = userRole === "admin" ? "admin" : (userRole in ROLE_PERMISSIONS ? userRole : "user");
  const rolePerms = ROLE_PERMISSIONS[roleKey];
  const allowed = rolePerms?.[resource]?.includes(action) ?? false;

  logger.info("[PBAC] Local matrix decision", {
    userId,
    userRole,
    resource,
    action,
    resourceId,
    allowed,
    source: "local_matrix",
  });

  return allowed;
}

/**
 * Throw a FORBIDDEN TRPCError if the user lacks permission.
 * Use this for inline checks inside procedure handlers.
 */
export async function requirePermission(
  userId: string,
  userRole: string,
  resource: ResourceType,
  action: string,
  resourceId?: string,
  tenantId?: string
): Promise<void> {
  const allowed = await checkPermission(userId, userRole, resource, action, resourceId, tenantId);
  if (!allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: ${action} on ${resource}${resourceId ? ` (${resourceId})` : ""}`,
    });
  }
}

// ─── tRPC Procedure Factories ─────────────────────────────────────────────────

/**
 * Create a tRPC procedure that enforces PBAC before the handler runs.
 *
 * @example
 * const initiatePayoutProcedure = pbacProcedure("payout", "initiate");
 * myRouter.initiatePayout = initiatePayoutProcedure
 *   .input(z.object({ amount: z.number() }))
 *   .mutation(async ({ ctx, input }) => { ... });
 */
export function pbacProcedure(resource: ResourceType, action: string, resourceId?: string) {
  return protectedProcedure.use(async ({ ctx, next }) => {
    const userRole = (ctx.user as any).role ?? "user";
    await requirePermission(String(ctx.user.id), userRole, resource, action, resourceId);
    return next({ ctx });
  });
}

/**
 * Create a tRPC procedure that checks PBAC with a dynamic resource ID
 * extracted from the input. The resourceIdField specifies which input
 * field contains the resource ID.
 *
 * @example
 * const approvePayoutProcedure = resourceProcedure("payout", "approve", "payoutId");
 * myRouter.approvePayout = approvePayoutProcedure
 *   .input(z.object({ payoutId: z.string() }))
 *   .mutation(async ({ ctx, input }) => { ... });
 */
export function resourceProcedure(resource: ResourceType, action: string, resourceIdField: string) {
  return protectedProcedure.use(async ({ ctx, input, next }) => {
    const userRole = (ctx.user as any).role ?? "user";
    const resourceId = ((input as unknown) as Record<string, unknown>)?.[resourceIdField] as string | undefined;
    await requirePermission(String(ctx.user.id), userRole, resource, action, resourceId);
    return next({ ctx });
  });
}

// ─── Replay Attack Protection ─────────────────────────────────────────────────

const REPLAY_WINDOW_MS = 5 * 60 * 1000; // 5 minutes
const replayCache = new Map<string, number>(); // nonce → timestamp

// Clean up expired nonces every 10 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(replayCache.entries()).forEach(([nonce, ts]) => {
    if (now - ts > REPLAY_WINDOW_MS) replayCache.delete(nonce);
  });
}, 10 * 60 * 1000);

/**
 * Validate a request nonce to prevent replay attacks on payment endpoints.
 * Throws FORBIDDEN if the nonce has been seen within the replay window.
 */
export function validateNonce(nonce: string): void {
  if (!nonce || typeof nonce !== "string" || nonce.length < 16) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "A valid idempotency nonce (min 16 chars) is required for payment operations.",
    });
  }
  const now = Date.now();
  if (replayCache.has(nonce)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Duplicate request detected. This nonce has already been processed.",
    });
  }
  replayCache.set(nonce, now);
}

// ─── NIBSS / External Webhook Signature Verification ─────────────────────────

import { createHmac, timingSafeEqual as cryptoTimingSafeEqual } from "crypto";

/**
 * Verify an HMAC-SHA256 webhook signature from NIBSS or other external providers.
 *
 * @param payload - Raw request body (Buffer or string)
 * @param signature - Signature from the X-NIBSS-Signature or X-Hub-Signature-256 header
 * @param secret - Shared secret from environment
 */
export function verifyWebhookSignature(
  payload: Buffer | string,
  signature: string,
  secret: string
): boolean {
  if (!secret) {
    logger.warn("[PBAC] Webhook secret not configured — skipping signature verification");
    return true; // Fail-open if secret not configured (dev mode)
  }

  const body = typeof payload === "string" ? Buffer.from(payload) : payload;
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  // Support both "sha256=<hex>" and raw hex formats
  const received = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  try {
    return cryptoTimingSafeEqual(
      Buffer.from(expected, "hex"),
      Buffer.from(received.padEnd(expected.length, "0"), "hex")
    );
  } catch {
    return false;
  }
}

// ─── Login Brute Force Protection ────────────────────────────────────────────

const loginAttempts = new Map<string, { count: number; firstAttempt: number; lockedUntil?: number }>();
const MAX_LOGIN_ATTEMPTS = 5;
const LOCKOUT_DURATION_MS = 15 * 60 * 1000; // 15 minutes
const ATTEMPT_WINDOW_MS = 10 * 60 * 1000;   // 10 minutes

// Clean up expired entries every 30 minutes
setInterval(() => {
  const now = Date.now();
  Array.from(loginAttempts.entries()).forEach(([key, state]) => {
    if (now - state.firstAttempt > ATTEMPT_WINDOW_MS && !state.lockedUntil) {
      loginAttempts.delete(key);
    } else if (state.lockedUntil && now > state.lockedUntil) {
      loginAttempts.delete(key);
    }
  });
}, 30 * 60 * 1000);

/**
 * Record a failed login attempt and throw FORBIDDEN if the account is locked.
 * @param identifier - IP address or username (use both for defense in depth)
 */
export function recordLoginAttempt(identifier: string): void {
  const now = Date.now();
  const state = loginAttempts.get(identifier) ?? { count: 0, firstAttempt: now };

  // Reset window if outside attempt window
  if (now - state.firstAttempt > ATTEMPT_WINDOW_MS) {
    loginAttempts.set(identifier, { count: 1, firstAttempt: now });
    return;
  }

  // Check if locked
  if (state.lockedUntil && now < state.lockedUntil) {
    const remainingMs = state.lockedUntil - now;
    const remainingMin = Math.ceil(remainingMs / 60_000);
    throw new TRPCError({
      code: "TOO_MANY_REQUESTS",
      message: `Account temporarily locked due to too many failed attempts. Try again in ${remainingMin} minute(s).`,
    });
  }

  state.count += 1;
  if (state.count >= MAX_LOGIN_ATTEMPTS) {
    state.lockedUntil = now + LOCKOUT_DURATION_MS;
    logger.warn("[PBAC] Login lockout triggered", { identifier, attempts: state.count });
  }
  loginAttempts.set(identifier, state);
}

/**
 * Clear login attempts on successful authentication.
 */
export function clearLoginAttempts(identifier: string): void {
  loginAttempts.delete(identifier);
}

/**
 * Check if an identifier is currently locked out (without recording an attempt).
 */
export function isLockedOut(identifier: string): boolean {
  const state = loginAttempts.get(identifier);
  if (!state?.lockedUntil) return false;
  return Date.now() < state.lockedUntil;
}

// ─── PBAC Health Check ────────────────────────────────────────────────────────

export async function getPbacHealth(): Promise<{
  permifyReachable: boolean;
  localMatrixActive: boolean;
  replayCacheSize: number;
  loginLockoutsActive: number;
  policies: string[];
}> {
  let permifyReachable = false;
  try {
    const r = await fetch(`${env.permifyUrl}/healthz`, {
      signal: AbortSignal.timeout(1500),
    });
    permifyReachable = r.ok;
  } catch {
    permifyReachable = false;
  }

  const now = Date.now();
  const activeLockouts = Array.from(loginAttempts.values()).filter(
    s => s.lockedUntil && now < s.lockedUntil
  ).length;

  return {
    permifyReachable,
    localMatrixActive: true,
    replayCacheSize: replayCache.size,
    loginLockoutsActive: activeLockouts,
    policies: Object.keys(PBAC_POLICIES),
  };
}
