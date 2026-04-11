import { logger } from './logger';
/**
 * SLA Breach Webhook Dispatch
 * Sends HMAC-SHA256 signed webhook payloads to merchant-configured endpoints
 * whenever a settlement SLA breach is detected.
 *
 * Delivery flow:
 *   1. Load all active webhooks for the merchant that subscribe to "settlement.sla_breach"
 *   2. Build a signed payload (X-PayGate-Signature: sha256=<hmac>)
 *   3. Attempt HTTP POST with 5s timeout
 *   4. Log delivery result to webhook_deliveries table
 *   5. If bridge is available, also dispatch via deliverWebhookViaMiddleware for
 *      Kafka fan-out, Redis retry state, and Lakehouse audit trail
 */

import crypto from "crypto";
import { getDb } from "./db";
import { webhooks, webhookDeliveries } from "../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { deliverWebhookViaMiddleware } from "./middlewareBridge";

export interface SlaBreachPayload {
  event: "settlement.sla_breach";
  id: string;
  tenantId: string;
  merchantId: string;
  reference: string;
  amount: number;
  currency: string;
  initiatedAt: string;
  slaDeadlineAt: string;
  breachedAt: string;
  severity: "high" | "critical";
}

/**
 * Build HMAC-SHA256 signature for a payload string.
 * Header format: X-PayGate-Signature: sha256=<hex>
 */
export function signPayload(secret: string, payloadStr: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
}

/**
 * Dispatch SLA breach webhook to all active merchant endpoints subscribed to
 * "settlement.sla_breach". Returns the number of successful deliveries.
 */
export async function dispatchSlaBreachWebhook(
  payload: SlaBreachPayload,
): Promise<{ dispatched: number; failed: number }> {
  const db = await getDb();
  if (!db) return { dispatched: 0, failed: 0 };
  const payloadStr = JSON.stringify(payload);
  let dispatched = 0;
  let failed = 0;

  // Load active webhooks for this merchant that include "settlement.sla_breach"
  const endpoints = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.merchantId, payload.merchantId),
        eq(webhooks.isActive, true),
      ),
    );

  // Filter to those subscribed to settlement.sla_breach
  const subscribed = endpoints.filter((w: typeof webhooks.$inferSelect) => {
    const events = (w.events as string[]) ?? [];
    return events.includes("settlement.sla_breach") || events.includes("*");
  });

  for (const endpoint of subscribed) {
    const deliveryId = `wdl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const signature = signPayload(endpoint.secret, payloadStr);
    let success = false;
    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PayGate-Signature": signature,
          "X-PayGate-Event": payload.event,
          "X-PayGate-Delivery": deliveryId,
          "X-PayGate-Timestamp": new Date().toISOString(),
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      statusCode = res.status;
      responseBody = await res.text().catch(() => "");
      success = res.ok;
      if (success) dispatched++;
      else failed++;
    } catch (err) {
      errorMessage = (err as Error).message;
      failed++;
    }

    // Log delivery to webhook_deliveries
    try {
      await db!.insert(webhookDeliveries).values({
        id: deliveryId,
        tenantId: payload.tenantId,
        webhookId: endpoint.id,
        merchantId: payload.merchantId,
        eventType: payload.event,
        payload: payload as unknown as Record<string, unknown>,
        responseStatus: statusCode ?? null,
        responseBody: responseBody ?? null,
        latencyMs: null,
        status: success ? "success" : "failed",
        attemptCount: 1,
        deliveredAt: success ? new Date() : null,
      });
    } catch (dbErr) {
      logger.error("[webhookDispatch] Failed to log delivery:", dbErr);
    }

    // Also dispatch via middleware bridge for Kafka/Redis/Lakehouse fan-out
    try {
      await deliverWebhookViaMiddleware({
        deliveryId,
        webhookId: endpoint.id,
        merchantId: payload.merchantId,
        eventType: payload.event,
        payload: payload as unknown as Record<string, unknown>,
        targetUrl: endpoint.url,
        secret: endpoint.secret,
      });
    } catch {
      // Non-fatal: bridge may be offline
    }
  }

  return { dispatched, failed };
}

/**
 * Generic webhook dispatcher — fires a webhook event to all active merchant
 * endpoints subscribed to the given event type.
 *
 * Supports all event types defined in WEBHOOK_EVENTS plus new feature events:
 *   gold.purchased, insurance.created, remittance.initiated,
 *   pension.contribution, cashback.earned, bulk.completed, salary.credited,
 *   nodal.credited, subscription.renewed, subscription.cancelled, etc.
 */
export interface GenericWebhookPayload {
  event: string;
  id: string;
  tenantId: string;
  merchantId: string;
  data: Record<string, unknown>;
  createdAt?: string;
}

export async function dispatchWebhook(
  payload: GenericWebhookPayload,
): Promise<{ dispatched: number; failed: number }> {
  const db = await getDb();
  if (!db) return { dispatched: 0, failed: 0 };

  const payloadStr = JSON.stringify({ ...payload, createdAt: payload.createdAt ?? new Date().toISOString() });
  let dispatched = 0;
  let failed = 0;

  const endpoints = await db
    .select()
    .from(webhooks)
    .where(
      and(
        eq(webhooks.merchantId, payload.merchantId),
        eq(webhooks.isActive, true),
      ),
    );

  const subscribed = endpoints.filter((w: typeof webhooks.$inferSelect) => {
    const events = (w.events as string[]) ?? [];
    return events.includes(payload.event) || events.includes("*");
  });

  for (const endpoint of subscribed) {
    const deliveryId = `wdl_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
    const signature = signPayload(endpoint.secret, payloadStr);
    let success = false;
    let statusCode: number | undefined;
    let responseBody: string | undefined;
    let errorMessage: string | undefined;
    const startMs = Date.now();

    try {
      const controller = new AbortController();
      const timeout = setTimeout(() => controller.abort(), 5000);
      const res = await fetch(endpoint.url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-PayGate-Signature": signature,
          "X-PayGate-Event": payload.event,
          "X-PayGate-Delivery": deliveryId,
          "X-PayGate-Timestamp": new Date().toISOString(),
        },
        body: payloadStr,
        signal: controller.signal,
      });
      clearTimeout(timeout);
      statusCode = res.status;
      responseBody = await res.text().catch(() => "");
      success = res.ok;
      if (success) dispatched++;
      else failed++;
    } catch (err) {
      errorMessage = (err as Error).message;
      failed++;
    }

    const latencyMs = Date.now() - startMs;

    try {
      await db!.insert(webhookDeliveries).values({
        id: deliveryId,
        tenantId: payload.tenantId,
        webhookId: endpoint.id,
        merchantId: payload.merchantId,
        eventType: payload.event,
        payload: payload as unknown as Record<string, unknown>,
        responseStatus: statusCode ?? null,
        responseBody: responseBody ?? null,
        latencyMs,
        status: success ? "success" : "failed",
        attemptCount: 1,
        deliveredAt: success ? new Date() : null,
      });
    } catch (dbErr) {
      logger.error("[webhookDispatch] Failed to log delivery:", dbErr);
    }

    try {
      await deliverWebhookViaMiddleware({
        deliveryId,
        webhookId: endpoint.id,
        merchantId: payload.merchantId,
        eventType: payload.event,
        payload: payload as unknown as Record<string, unknown>,
        targetUrl: endpoint.url,
        secret: endpoint.secret,
      });
    } catch {
      // Non-fatal: bridge may be offline
    }

    if (errorMessage) {
      logger.warn(`[webhookDispatch] Delivery ${deliveryId} failed: ${errorMessage}`);
    }
  }

  return { dispatched, failed };
}
