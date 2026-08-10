/**
 * auditEvents.ts — Audit event publisher
 * Publishes audit events to Kafka/Fluvio when available, falls back to DB log.
 */
import { logger } from "./logger";
import { logAuditEvent } from "./db";

export interface AuditEvent {
  action: string;
  resourceType?: string;
  resource?: string;        // alias for resourceType
  resourceId?: string;
  actorId?: string;
  actorName?: string;
  actorEmail?: string | null;  // optional email for audit trail
  targetId?: string;        // target entity ID (e.g. UBO id, verification id)
  userId?: string;          // alias for actorId
  merchantId?: string | number;
  metadata?: Record<string, unknown>;
  timestamp?: string;       // ISO timestamp
  result?: "success" | "failure";
  ipAddress?: string;
  userAgent?: string;
}

/**
 * Publish an audit event. Non-fatal — errors are swallowed and logged.
 */
export async function publishAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await logAuditEvent({
      merchantId: String(event.merchantId ?? 0),
      actorId: event.actorId ?? event.userId ?? "system",
      actorName: event.actorName ?? "system",
      action: event.action,
      resource: event.resourceType ?? event.resource ?? "unknown",
      resourceId: event.resourceId ?? event.targetId,
      metadata: event.metadata,
    });
  } catch (err) {
    logger.warn("[auditEvents] Failed to publish audit event:", err);
  }
}
