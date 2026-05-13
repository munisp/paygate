/**
 * permifyClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Permify fine-grained authorization (PBAC) client for PayGate.
 * Permify implements Google Zanzibar-style relationship-based access control.
 *
 * Schema:
 *   entity merchant {}
 *   entity user {
 *     relation owner @merchant
 *     relation admin @merchant
 *     relation member @merchant
 *     action view_transactions = owner or admin or member
 *     action create_payout = owner or admin
 *     action approve_payout = owner
 *     action manage_team = owner or admin
 *     action view_analytics = owner or admin or member
 *     action manage_api_keys = owner or admin
 *     action manage_webhooks = owner or admin
 *     action view_disputes = owner or admin or member
 *     action respond_dispute = owner or admin
 *     action manage_settings = owner
 *   }
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface PermifySubject {
  type: "user";
  id: string;
}

export interface PermifyRelationship {
  entity: { type: string; id: string };
  relation: string;
  subject: PermifySubject;
}

export interface PermifyCheckResult {
  allowed: boolean;
  reason?: string;
}

// ─── Lazy client ─────────────────────────────────────────────────────────────
async function permifyRequest(path: string, body: unknown): Promise<unknown> {
  const url = ENV.permifyUrl;
  const key = ENV.permifyApiKey;
  if (!url) return null;

  try {
    const res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(key ? { Authorization: `Bearer ${key}` } : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) {
      console.warn(`[permify] Request to ${path} failed: ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[permify] Request failed:`, err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Check if a user is allowed to perform an action on an entity.
 * Falls back to `true` when Permify is not configured (dev mode).
 */
export async function checkPermission(
  userId: string,
  action: string,
  entityType: string,
  entityId: string,
  tenantId = "default"
): Promise<PermifyCheckResult> {
  if (!ENV.permifyUrl) {
    // Dev mode: allow all
    return { allowed: true, reason: "permify_not_configured" };
  }

  try {
    const result = await permifyRequest(
      `/v1/tenants/${tenantId}/permissions/check`,
      {
        metadata: { schema_version: "", snap_token: "", depth: 20 },
        entity: { type: entityType, id: entityId },
        permission: action,
        subject: { type: "user", id: userId },
      }
    ) as any;

    return {
      allowed: result?.can === "CHECK_RESULT_ALLOWED",
      reason: result?.can,
    };
  } catch (err) {
    console.error("[permify] checkPermission error:", err);
    return { allowed: false, reason: "error" };
  }
}

/**
 * Write a relationship tuple to Permify.
 */
export async function writeRelationship(
  relationship: PermifyRelationship,
  tenantId = "default"
): Promise<boolean> {
  if (!ENV.permifyUrl) return true;

  try {
    const result = await permifyRequest(
      `/v1/tenants/${tenantId}/relationships/write`,
      {
        metadata: { schema_version: "" },
        tuples: [
          {
            entity: relationship.entity,
            relation: relationship.relation,
            subject: { type: relationship.subject.type, id: relationship.subject.id },
          },
        ],
      }
    );
    return result !== null;
  } catch {
    return false;
  }
}

/**
 * Delete a relationship tuple from Permify.
 */
export async function deleteRelationship(
  relationship: PermifyRelationship,
  tenantId = "default"
): Promise<boolean> {
  if (!ENV.permifyUrl) return true;

  try {
    const result = await permifyRequest(
      `/v1/tenants/${tenantId}/relationships/delete`,
      {
        filter: {
          entity_type: relationship.entity.type,
          entity_id: relationship.entity.id,
          relation: relationship.relation,
          subject: { type: relationship.subject.type, id: relationship.subject.id },
        },
      }
    );
    return result !== null;
  } catch {
    return false;
  }
}

/**
 * Assign a merchant role to a user.
 */
export async function assignMerchantRole(
  userId: string,
  merchantId: string,
  role: "owner" | "admin" | "member"
): Promise<boolean> {
  return writeRelationship({
    entity: { type: "merchant", id: merchantId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

/**
 * Revoke a merchant role from a user.
 */
export async function revokeMerchantRole(
  userId: string,
  merchantId: string,
  role: "owner" | "admin" | "member"
): Promise<boolean> {
  return deleteRelationship({
    entity: { type: "merchant", id: merchantId },
    relation: role,
    subject: { type: "user", id: userId },
  });
}

/**
 * Check if a user can perform a specific merchant action.
 * Convenience wrapper with PayGate-specific actions.
 */
export async function canPerformMerchantAction(
  userId: string,
  merchantId: string,
  action:
    | "view_transactions"
    | "create_payout"
    | "approve_payout"
    | "manage_team"
    | "view_analytics"
    | "manage_api_keys"
    | "manage_webhooks"
    | "view_disputes"
    | "respond_dispute"
    | "manage_settings"
): Promise<boolean> {
  const result = await checkPermission(userId, action, "merchant", merchantId);
  return result.allowed;
}
