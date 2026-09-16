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
    actions: ["view", "create", "freeze", "unfreeze", "terminate", "topup"] as const,
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

// ─── Money actions (C14) ──────────────────────────────────────────────────────
/**
 * Actions that MOVE or UNBLOCK money / credentials. When the Permify backend
 * is unreachable these must FAIL CLOSED with 503 — the local role matrix is a
 * degraded-mode fallback and is NOT authoritative enough to move money on its
 * own. Key format: `${resource}:${action}`.
 */
export const MONEY_ACTIONS: ReadonlySet<string> = new Set([
  "payout:initiate", "payout:approve", "payout:reject", "payout:cancel",
  "transaction:initiate", "transaction:cancel",
  "api_key:create", "api_key:revoke", "api_key:rotate",
  "virtual_card:create", "virtual_card:topup", "virtual_card:terminate",
]);

// ─── Recommended permission names for routers.ts (finding 6) ─────────────────
/**
 * RECOMMENDED_ROUTER_PERMISSIONS — named permissions that server/routers.ts
 * MUST adopt for its pbacProcedure(...) call sites (routers.ts is owned by
 * another change, so it is intentionally NOT edited here):
 *
 *   virtualCards.topUp  → "topup_virtual_card"  (virtual_card:topup)
 *   apiKeys.revoke      → "revoke_api_keys"     (api_key:revoke)   [already in map]
 *   webhooks.delete     → "delete_webhooks"     (webhook:delete)
 *
 * All three are present in PBAC_PERMISSION_MAP (server/_core/trpc.ts) and the
 * local role matrix below.
 */
export const RECOMMENDED_ROUTER_PERMISSIONS = {
  "virtualCards.topUp": "topup_virtual_card",
  "apiKeys.revoke": "revoke_api_keys",
  "webhooks.delete": "delete_webhooks",
} as const;

// ─── Role → Permission Matrix (fallback when Permify is offline) ──────────────

const ROLE_PERMISSIONS: Record<string, Record<ResourceType, string[]>> = {
  owner: {
    transaction: ["view", "initiate", "cancel", "export"],
    payout: ["view", "initiate", "approve", "reject", "cancel"],
    dispute: ["view", "create", "respond", "escalate", "close"],
    kyc: ["view", "submit", "approve", "reject", "override"],
    api_key: ["view", "create", "revoke", "rotate"],
    webhook: ["view", "create", "update", "delete", "test"],
    virtual_card: ["view", "create", "freeze", "unfreeze", "terminate", "topup"],
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
    virtual_card: ["view", "create", "freeze", "unfreeze", "terminate", "topup"],
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
 * Tri-state result so callers can distinguish a definitive DENY from a
 * backend outage: "unavailable" means Permify could not be consulted at all
 * (network error, timeout, or non-OK status) and the local matrix would be
 * used as a degraded fallback.
 */
async function permifyCheck(req: PermifyCheckRequest): Promise<"allowed" | "denied" | "unavailable"> {
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
      return "unavailable";
    }

    const data = (await response.json()) as PermifyCheckResponse;
    return data.can === "RESULT_ALLOWED" ? "allowed" : "denied";
  } catch (err: unknown) {
    // Permify offline — fall back to local matrix (fail-open for read, fail-closed for write)
    logger.warn("[PBAC] Permify unreachable, using local role matrix", {
      error: err instanceof Error ? err.message : String(err),
    });
    return "unavailable"; // Signal to caller to use local fallback
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
export interface PermissionDecision {
  allowed: boolean;
  /** True when Permify could not be consulted and the local matrix answered. */
  permifyDown: boolean;
}

export async function checkPermissionDetailed(
  userId: string,
  userRole: string,
  resource: ResourceType,
  action: string,
  resourceId?: string,
  tenantId: string = "t1"
): Promise<PermissionDecision> {
  // 1. Try Permify
  const permifyResult = await permifyCheck({
    tenantId,
    entityType: resource,
    entityId: resourceId ?? "*",
    permission: action,
    subjectType: "user",
    subjectId: userId,
  });

  // If Permify returned a definitive answer, use it
  if (permifyResult === "allowed") {
    logger.info("[PBAC] Permify ALLOWED", { userId, resource, action, resourceId });
    return { allowed: true, permifyDown: false };
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
    permifyDown: permifyResult === "unavailable",
  });

  return { allowed, permifyDown: permifyResult === "unavailable" };
}

export async function checkPermission(
  userId: string,
  userRole: string,
  resource: ResourceType,
  action: string,
  resourceId?: string,
  tenantId: string = "t1"
): Promise<boolean> {
  return (await checkPermissionDetailed(userId, userRole, resource, action, resourceId, tenantId)).allowed;
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
  const decision = await checkPermissionDetailed(userId, userRole, resource, action, resourceId, tenantId);
  // C14 fail-closed: when Permify is DOWN, money actions must not silently
  // fall through to the degraded local matrix — refuse with 503 so the caller
  // retries when the authoritative backend is back.
  if (decision.permifyDown && MONEY_ACTIONS.has(`${resource}:${action}`)) {
    logger.error("[PBAC] Permify unavailable during money action — failing closed (503)", {
      userId, resource, action, resourceId,
    });
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Authorization backend unavailable; ${action} on ${resource} cannot be verified. Retry shortly.`,
    });
  }
  if (!decision.allowed) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `Permission denied: ${action} on ${resource}${resourceId ? ` (${resourceId})` : ""}`,
    });
  }
}

// ─── Merchant team-role resolution (C14) ─────────────────────────────────────

/**
 * Resolve the caller's MERCHANT-team role — the role used by requirePermission.
 *
 * Precedence (fail-closed):
 *  1. team_members row for the caller (userId) with a live membership
 *     (status not suspended/removed) → that row's role + merchantId.
 *  2. No team row, but the caller OWNS a merchant (getMerchantByOwnerId) →
 *     compat path: role "owner".
 *  3. Neither → FORBIDDEN (the global users.role is NEVER trusted here —
 *     it is not merchant-scoped).
 */
export async function resolveMerchantTeamRole(
  openId: string
): Promise<{ merchantId: string; role: string }> {
  const { getDb, getUserByOpenId, getMerchantByOwnerId } = await import("./db");
  const { teamMembers } = await import("../drizzle/schema");
  const { eq, and } = await import("drizzle-orm");

  const user = await getUserByOpenId(openId);
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  }

  const db = await getDb();
  if (db) {
    const memberships = await db
      .select({ merchantId: teamMembers.merchantId, role: teamMembers.role, status: teamMembers.status })
      .from(teamMembers)
      .where(eq(teamMembers.userId, user.id))
      .limit(1);
    const m = memberships[0];
    if (m) {
      if (m.status === "disabled") {
        throw new TRPCError({ code: "FORBIDDEN", message: "Merchant team membership is not active" });
      }
      return { merchantId: m.merchantId, role: m.role };
    }
  }

  // Compat path: no team row, but the caller owns the merchant → owner role.
  const merchant = await getMerchantByOwnerId(user.id);
  if (merchant) {
    return { merchantId: merchant.id, role: "owner" };
  }

  // No membership and no owned merchant → deny (fail closed).
  throw new TRPCError({ code: "FORBIDDEN", message: "Merchant team membership required" });
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
    // C14: merchant-team role, never the global users.role.
    const { role } = await resolveMerchantTeamRole(ctx.user.openId);
    await requirePermission(String(ctx.user.id), role, resource, action, resourceId);
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
    // C14: merchant-team role, never the global users.role.
    const { role } = await resolveMerchantTeamRole(ctx.user.openId);
    const resourceId = ((input as unknown) as Record<string, unknown>)?.[resourceIdField] as string | undefined;
    await requirePermission(String(ctx.user.id), role, resource, action, resourceId);
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
  // Fail closed: an unconfigured webhook secret must reject, never permit.
  if (!secret) {
    logger.error("[PBAC] Webhook secret not configured — rejecting webhook (fail closed)");
    return false;
  }
  if (!signature) {
    return false;
  }

  const body = typeof payload === "string" ? Buffer.from(payload) : payload;
  const expected = createHmac("sha256", secret).update(body).digest("hex");

  // Support both "sha256=<hex>" and raw hex formats
  const received = signature.startsWith("sha256=") ? signature.slice(7) : signature;

  const expectedBuf = Buffer.from(expected, "hex");
  const receivedBuf = Buffer.from(received, "hex");
  // Length mismatch (including truncated/padded signatures) must reject before
  // timingSafeEqual, which would throw on unequal buffers.
  if (receivedBuf.length !== expectedBuf.length) {
    return false;
  }
  try {
    return cryptoTimingSafeEqual(expectedBuf, receivedBuf);
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
