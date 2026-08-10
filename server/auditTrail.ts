/**
 * Centralized Audit Trail
 *
 * Provides a single `auditLog()` function that writes to the `audit_events` table.
 * All admin/merchant mutations should call this after performing their action.
 *
 * The function is fire-and-forget (non-blocking) — it never throws.
 * Errors are logged via Winston but do not affect the calling procedure.
 */
import { logger } from "./logger";

export interface AuditEntry {
  merchantId: string;
  actorId: string;       // user openId or "system"
  actorName: string;
  actorEmail?: string;
  action: string;        // e.g. "payout.created", "settings.updated", "api_key.deleted"
  resource: string;      // e.g. "payout", "webhook", "api_key", "team_member"
  resourceId?: string;
  metadata?: Record<string, unknown>;
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Write an audit event to the database.
 * Non-blocking — errors are swallowed and logged.
 */
export async function auditLog(entry: AuditEntry): Promise<void> {
  try {
    const { getDb } = await import("./db");
    const { auditEvents } = await import("../drizzle/schema");
    const db = await getDb();
    if (!db) return;
    await db.insert(auditEvents).values({
      merchantId: entry.merchantId,
      actorId: entry.actorId,
      actorName: entry.actorName,
      actorEmail: entry.actorEmail,
      action: entry.action,
      resource: entry.resource,
      resourceId: entry.resourceId,
      metadata: entry.metadata ?? null,
      ipAddress: entry.ipAddress,
      userAgent: entry.userAgent,
    });
  } catch (err: any) {
    // Never throw — audit failure must not break the business operation
    logger.warn("audit_log_failed", { action: entry.action, error: err.message });
  }
}

/**
 * Build an AuditEntry from a tRPC context + mutation details.
 * Extracts actor info from the authenticated user context.
 */
export function buildAuditEntry(
  ctx: { user: { openId: string; name?: string | null; email?: string | null } },
  merchantId: string,
  action: string,
  resource: string,
  resourceId?: string,
  metadata?: Record<string, unknown>
): AuditEntry {
  return {
    merchantId,
    actorId: ctx.user.openId,
    actorName: ctx.user.name ?? ctx.user.openId,
    actorEmail: ctx.user.email ?? undefined,
    action,
    resource,
    resourceId,
    metadata,
  };
}

// ─── Action constants ─────────────────────────────────────────────────────────
// Standardised action names to ensure consistent audit trail queries.

export const AUDIT = {
  // Payouts
  PAYOUT_CREATED: "payout.created",
  PAYOUT_APPROVED: "payout.approved",
  PAYOUT_REJECTED: "payout.rejected",
  PAYOUT_CANCELLED: "payout.cancelled",

  // API Keys
  API_KEY_CREATED: "api_key.created",
  API_KEY_DELETED: "api_key.deleted",
  API_KEY_ROLLED: "api_key.rolled",

  // Webhooks
  WEBHOOK_CREATED: "webhook.created",
  WEBHOOK_UPDATED: "webhook.updated",
  WEBHOOK_DELETED: "webhook.deleted",
  WEBHOOK_TESTED: "webhook.tested",

  // Team
  TEAM_MEMBER_INVITED: "team.member_invited",
  TEAM_MEMBER_REMOVED: "team.member_removed",
  TEAM_ROLE_CHANGED: "team.role_changed",

  // Settings
  SETTINGS_UPDATED: "settings.updated",
  SETTLEMENT_SETTINGS_UPDATED: "settings.settlement_updated",
  NOTIFICATION_SETTINGS_UPDATED: "settings.notifications_updated",
  RECON_ALERT_SETTINGS_UPDATED: "settings.recon_alert_updated",

  // Disputes
  DISPUTE_OPENED: "dispute.opened",
  DISPUTE_RESOLVED: "dispute.resolved",
  DISPUTE_ESCALATED: "dispute.escalated",
  DISPUTE_EVIDENCE_UPLOADED: "dispute.evidence_uploaded",

  // Virtual Cards
  CARD_ISSUED: "card.issued",
  CARD_FROZEN: "card.frozen",
  CARD_UNFROZEN: "card.unfrozen",
  CARD_TERMINATED: "card.terminated",
  CARD_LIMIT_UPDATED: "card.limit_updated",

  // Transactions
  TRANSACTION_REFUNDED: "transaction.refunded",
  TRANSACTION_RETRIED: "transaction.retried",

  // Fraud
  FRAUD_ALERT_SNOOZED: "fraud_alert.snoozed",
  FRAUD_ALERT_RESOLVED: "fraud_alert.resolved",
  FRAUD_RULE_CREATED: "fraud_rule.created",
  FRAUD_RULE_UPDATED: "fraud_rule.updated",
  FRAUD_RULE_DELETED: "fraud_rule.deleted",

  // Payment Links
  PAYMENT_LINK_CREATED: "payment_link.created",
  PAYMENT_LINK_DEACTIVATED: "payment_link.deactivated",

  // BNPL
  BNPL_PLAN_CREATED: "bnpl_plan.created",
  BNPL_PLAN_TOGGLED: "bnpl_plan.toggled",

  // Checkout
  CHECKOUT_THEME_UPDATED: "checkout.theme_updated",

  // System
  SYSTEM_NOTIFICATION_SENT: "system.notification_sent",
} as const;
