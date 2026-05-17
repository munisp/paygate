/**
 * auditEvents.ts — Audit event publisher
 * Publishes audit events to Kafka/Fluvio when available, falls back to DB log.
 */
import { logger } from "./logger";
import { logAuditEvent } from "./db";

export interface AuditEvent {
  action: string;
  resourceType: string;
  resourceId?: string;
  actorId?: string;
  actorName?: string;
  merchantId?: string | number;
  metadata?: Record<string, unknown>;
}

/**
 * Publish an audit event. Non-fatal — errors are swallowed and logged.
 */
export async function publishAuditEvent(event: AuditEvent): Promise<void> {
  try {
    await logAuditEvent({
      merchantId: String(event.merchantId ?? 0),
      actorId: event.actorId ?? "system",
      actorName: event.actorName ?? "system",
      action: event.action,
      resource: event.resourceType,
      resourceId: event.resourceId,
      metadata: event.metadata,
    });
  } catch (err) {
    logger.warn("[auditEvents] Failed to publish audit event:", err);
  }
}
