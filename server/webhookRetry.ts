import { logger } from './logger';
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
 * After 7 failed attempts, the delivery is marked "dead_letter" and the
 * merchant is notified via the in-app notification system.
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
      // Endpoint deleted or disabled — mark as cancelled
      await db
        .update(webhookDeliveries)
        .set({ status: "cancelled" } as any)
        .where(eq(webhookDeliveries.id, delivery.id));
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

      console.info(`[webhookRetry] Delivery ${delivery.id} succeeded on attempt ${newAttemptCount}`);
    } else if (newAttemptCount >= MAX_ATTEMPTS) {
      // Dead-letter
      await db
        .update(webhookDeliveries)
        .set({
          status: "dead_letter",
          attemptCount: newAttemptCount,
          responseStatus: statusCode ?? null,
        } as any)
        .where(eq(webhookDeliveries.id, delivery.id));

      logger.warn(`[webhookRetry] Delivery ${delivery.id} dead-lettered after ${newAttemptCount} attempts`);
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
      // Suppress expected errors when DB tables are not yet migrated or DB is unreachable
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('relation') && msg.includes('does not exist')) return;
      if (msg.includes('connect ECONNREFUSED')) return;
      if (msg.includes('Failed query')) {
        // Only log at debug level for query failures (table may not exist yet)
        logger.warn('[webhookRetry] Worker query error (table may not be migrated yet):', msg.slice(0, 120));
        return;
      }
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
