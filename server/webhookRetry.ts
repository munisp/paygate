import { logger } from './logger';
import { isSuppressedWorkerError } from './workerErrorFilter';
/**
 * PayGate Webhook Retry Service
 *
 * Implements exponential backoff retry for failed webhook deliveries.
 * Runs as a background process in the portal server.
 *
 * Retry schedule (exponential backoff with jitter):
 *   Attempt 1: immediate
 *   Attempt 2: 1 minute
 *   Attempt 3: 5 minutes
 *   Attempt 4: 30 minutes
 *   Attempt 5: 2 hours
 *   Attempt 6: 12 hours
 *   Attempt 7: 24 hours (final — moves to dead-letter after this)
 *
 * After 7 failed attempts, the delivery stays 'failed' with
 * attemptCount >= 7 and no next_retry_at — that IS the dead-letter state
 * (webhook_delivery_status enum has no 'dead_letter'/'cancelled' values;
 * spec #12 — dead-lettered rows are filtered by attemptCount at read time).
 *
 * Usage: call startWebhookRetryWorker() once in server/_core/index.ts
 */

import crypto from "crypto";
import { and, eq, lt, lte, ne, sql } from "drizzle-orm";
import { getDb } from "./db";
import { webhookDeliveries, webhooks } from "../drizzle/schema";

// ─── Retry schedule (delays in milliseconds) ─────────────────────────────────
const RETRY_DELAYS_MS = [
  0,           // attempt 1 — immediate
  60_000,      // attempt 2 — 1 minute
  300_000,     // attempt 3 — 5 minutes
  1_800_000,   // attempt 4 — 30 minutes
  7_200_000,   // attempt 5 — 2 hours
  43_200_000,  // attempt 6 — 12 hours
  86_400_000,  // attempt 7 — 24 hours (final)
];

const MAX_ATTEMPTS = RETRY_DELAYS_MS.length;
const WORKER_INTERVAL_MS = 30_000; // poll every 30 seconds
const BATCH_SIZE = 50;

// ─── Jitter helper ────────────────────────────────────────────────────────────
function withJitter(delayMs: number, jitterFraction = 0.2): number {
  const jitter = delayMs * jitterFraction * (Math.random() * 2 - 1);
  return Math.max(0, Math.floor(delayMs + jitter));
}

// ─── Next retry time ──────────────────────────────────────────────────────────
function nextRetryAt(attemptCount: number): Date {
  const delayMs = RETRY_DELAYS_MS[Math.min(attemptCount, MAX_ATTEMPTS - 1)] ?? RETRY_DELAYS_MS[MAX_ATTEMPTS - 1];
  return new Date(Date.now() + withJitter(delayMs));
}

// ─── Deliver a single webhook ─────────────────────────────────────────────────
async function deliverWebhook(
  delivery: typeof webhookDeliveries.$inferSelect,
  endpoint: typeof webhooks.$inferSelect,
): Promise<{ success: boolean; statusCode?: number; error?: string }> {
  const payloadStr = JSON.stringify(delivery.payload);
  const signature =
    "sha256=" +
    crypto
      .createHmac("sha256", endpoint.secret)
      .update(payloadStr)
      .digest("hex");

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 10_000);
    const start = Date.now();

    const res = await fetch(endpoint.url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-PayGate-Signature": signature,
        "X-PayGate-Event": delivery.eventType,
        "X-PayGate-Delivery": delivery.id,
        "X-PayGate-Timestamp": new Date().toISOString(),
        "X-PayGate-Retry-Attempt": String(delivery.attemptCount + 1),
      },
      body: payloadStr,
      signal: controller.signal,
    });

    clearTimeout(timeout);
    const latencyMs = Date.now() - start;
    const responseBody = await res.text().catch(() => "");

    return {
      success: res.ok,
      statusCode: res.status,
    };
  } catch (err) {
    return {
      success: false,
      error: (err as Error).message,
    };
  }
}

// ─── updated_at stamping (H20) ────────────────────────────────────────────────
// webhook_deliveries.updated_at is added by migration 0104 and is NOT in the
// drizzle schema table object (schema.ts is append-only) — stamp it via raw SQL
// so the failure alerter can use updated_at as its dead-letter freshness cursor.
async function stampUpdatedAt(db: any, deliveryId: string): Promise<void> {
  try {
    await db.execute(sql`UPDATE webhook_deliveries SET updated_at = NOW() WHERE id = ${deliveryId}`);
  } catch {
    // Column may not exist yet (migration pending) — non-fatal.
  }
}

// ─── Retry worker ─────────────────────────────────────────────────────────────
async function processRetries() {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  // Find failed deliveries that are due for retry
  const due = await db
    .select()
    .from(webhookDeliveries)
    .where(
      and(
        eq(webhookDeliveries.status, "failed"),
        lte(webhookDeliveries.nextRetryAt as any, now),
        lt(webhookDeliveries.attemptCount, MAX_ATTEMPTS),
      )
    )
    .limit(BATCH_SIZE);

  if (due.length === 0) return;

  console.info(`[webhookRetry] Processing ${due.length} failed deliveries`);

  for (const delivery of due) {
    // Load the webhook endpoint
    const endpointRows = await db
      .select()
      .from(webhooks)
      .where(eq(webhooks.id, delivery.webhookId))
      .limit(1);

    if (!endpointRows.length || !endpointRows[0].isActive) {
      // R4 F14 (spec #12): 'cancelled' is NOT in the webhook_delivery_status
      // enum (pending|success|failed|retrying) — writing it would throw or
      // corrupt. Terminally park the delivery as 'failed' with
      // attemptCount = MAX_ATTEMPTS so it is never selected for retry again.
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          attemptCount: MAX_ATTEMPTS,
          nextRetryAt: null,
        } as any)
        .where(eq(webhookDeliveries.id, delivery.id));
      await stampUpdatedAt(db, delivery.id);
      logger.warn(`[webhookRetry] Delivery ${delivery.id} parked (endpoint deleted or disabled) — no further retries`);
      continue;
    }

    const endpoint = endpointRows[0];
    const { success, statusCode, error } = await deliverWebhook(delivery, endpoint);
    const newAttemptCount = delivery.attemptCount + 1;

    if (success) {
      await db
        .update(webhookDeliveries)
        .set({
          status: "success",
          attemptCount: newAttemptCount,
          responseStatus: statusCode ?? null,
          deliveredAt: new Date(),
        } as any)
        .where(eq(webhookDeliveries.id, delivery.id));
      await stampUpdatedAt(db, delivery.id);

      console.info(`[webhookRetry] Delivery ${delivery.id} succeeded on attempt ${newAttemptCount}`);
    } else if (newAttemptCount >= MAX_ATTEMPTS) {
      // Dead-letter (spec #12): 'dead_letter' is NOT in the
      // webhook_delivery_status enum. The dead-letter state is represented as
      // status='failed' with attemptCount >= MAX_ATTEMPTS and no next retry —
      // readers filter on attemptCount.
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          attemptCount: newAttemptCount,
          responseStatus: statusCode ?? null,
          nextRetryAt: null,
        } as any)
        .where(eq(webhookDeliveries.id, delivery.id));
      await stampUpdatedAt(db, delivery.id);

      logger.warn(`[webhookRetry] Delivery ${delivery.id} dead-lettered (status=failed, attemptCount=${newAttemptCount} >= ${MAX_ATTEMPTS})`);
    } else {
      // Schedule next retry
      const retryAt = nextRetryAt(newAttemptCount);
      await db
        .update(webhookDeliveries)
        .set({
          status: "failed",
          attemptCount: newAttemptCount,
          responseStatus: statusCode ?? null,
          nextRetryAt: retryAt,
        } as any)
        .where(eq(webhookDeliveries.id, delivery.id));
      await stampUpdatedAt(db, delivery.id);

      console.info(
        `[webhookRetry] Delivery ${delivery.id} retry ${newAttemptCount}/${MAX_ATTEMPTS} scheduled at ${retryAt.toISOString()}`
      );
    }
  }
}

// ─── Start worker ─────────────────────────────────────────────────────────────
let workerInterval: ReturnType<typeof setInterval> | null = null;

export function startWebhookRetryWorker() {
  if (workerInterval) return; // Already running
  console.info("[webhookRetry] Starting retry worker (interval=30s, maxAttempts=7)");
  workerInterval = setInterval(() => {
    processRetries().catch((err) => {
      if (isSuppressedWorkerError(err)) return;
      logger.error("[webhookRetry] Worker error:", err);
    });
  }, WORKER_INTERVAL_MS);
}

export function stopWebhookRetryWorker() {
  if (workerInterval) {
    clearInterval(workerInterval);
    workerInterval = null;
  }
}

// ─── Helper: schedule initial retry ──────────────────────────────────────────
/**
 * Call this when a webhook delivery fails on the first attempt
 * to set the nextRetryAt timestamp.
 */
export function scheduleRetry(attemptCount: number): Date {
  return nextRetryAt(attemptCount);
}

// ─── Dead-letter queue (H20) ──────────────────────────────────────────────────
// Dead-letter state = status 'failed' AND attemptCount >= MAX_ATTEMPTS AND no
// next_retry_at (the webhook_delivery_status enum has no 'dead_letter' value).

export interface DeadLetterDelivery {
  id: string;
  merchantId: string;
  webhookId: string;
  eventType: string;
  responseStatus: number | null;
  attemptCount: number;
  createdAt: string;
  updatedAt: string | null;
}

/**
 * List dead-lettered webhook deliveries (attemptCount >= 7, no retry pending).
 * wire into routers.ts — expose as an admin/merchant list procedure on the
 * existing webhookDeliveries router (that router lives in routers.ts, which is
 * outside this module's ownership).
 */
export async function listDeadLetters(merchantId?: string, limit = 100): Promise<DeadLetterDelivery[]> {
  const db = await getDb();
  if (!db) return [];
  const result = await db.execute(sql`
    SELECT id, merchant_id, webhook_id, event_type, response_status, attempt_count,
           created_at, updated_at
    FROM webhook_deliveries
    WHERE status = 'failed'
      AND attempt_count >= ${MAX_ATTEMPTS}
      AND next_retry_at IS NULL
      ${merchantId ? sql`AND merchant_id = ${merchantId}` : sql``}
    ORDER BY COALESCE(updated_at, created_at) DESC
    LIMIT ${limit}
  `);
  const rows: any[] = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
  return rows.map((r) => ({
    id: r.id,
    merchantId: r.merchant_id,
    webhookId: r.webhook_id,
    eventType: r.event_type,
    responseStatus: r.response_status == null ? null : Number(r.response_status),
    attemptCount: Number(r.attempt_count ?? 0),
    createdAt: r.created_at instanceof Date ? r.created_at.toISOString() : String(r.created_at),
    updatedAt: r.updated_at == null ? null : (r.updated_at instanceof Date ? r.updated_at.toISOString() : String(r.updated_at)),
  }));
}

/**
 * Redrive a dead-lettered delivery: reset attemptCount and schedule it for
 * immediate pickup by the retry worker (nextRetryAt = now, status 'failed').
 * Returns true when the row was a dead-letter and has been re-queued.
 * wire into routers.ts — expose as a mutation on the existing
 * webhookDeliveries router (that router lives in routers.ts, which is outside
 * this module's ownership).
 */
export async function redriveDeadLetter(id: string, merchantId?: string): Promise<boolean> {
  const db = await getDb();
  if (!db) return false;
  const result = await db.execute(sql`
    UPDATE webhook_deliveries
    SET attempt_count = 1,
        next_retry_at = NOW(),
        updated_at = NOW()
    WHERE id = ${id}
      AND status = 'failed'
      AND attempt_count >= ${MAX_ATTEMPTS}
      AND next_retry_at IS NULL
      ${merchantId ? sql`AND merchant_id = ${merchantId}` : sql``}
    RETURNING id
  `);
  const rows: any[] = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
  if (rows.length > 0) {
    logger.info(`[webhookRetry] Dead-letter ${id} redriven — re-queued for immediate retry`);
    return true;
  }
  return false;
}
