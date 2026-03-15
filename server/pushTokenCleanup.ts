/**
 * pushTokenCleanup.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodic cleanup worker for stale device push tokens.
 *
 * Runs every 7 days (configurable via PUSH_TOKEN_CLEANUP_INTERVAL_MS).
 * Removes tokens that:
 *   1. Have not been seen in more than 90 days (stale devices)
 *   2. Were explicitly invalidated (isActive = 0)
 *
 * Fail-open: errors are logged and the worker retries on the next cycle.
 */

import { getDb } from "./db";

const CLEANUP_INTERVAL_MS =
  Number(process.env.PUSH_TOKEN_CLEANUP_INTERVAL_MS) || 7 * 24 * 60 * 60 * 1000; // 7 days

const STALE_AFTER_DAYS =
  Number(process.env.PUSH_TOKEN_STALE_DAYS) || 90;

async function runCleanup(): Promise<void> {
  console.log("[pushTokenCleanup] Starting stale push token cleanup…");
  try {
    const db = await getDb();
    if (!db) {
      console.warn("[pushTokenCleanup] DB unavailable — skipping");
      return;
    }

    const { devicePushTokens } = await import("../drizzle/schema");
    const { lt, or, eq, and } = await import("drizzle-orm");

    const staleThreshold = new Date(Date.now() - STALE_AFTER_DAYS * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(devicePushTokens)
      .where(
        or(
          // Tokens not updated in STALE_AFTER_DAYS
          lt(devicePushTokens.updatedAt, staleThreshold),
          // Explicitly deactivated tokens
          eq(devicePushTokens.isActive, false),
        ),
      )
      .returning({ id: devicePushTokens.id });

    console.log(`[pushTokenCleanup] Removed ${result.length} stale/inactive push tokens`);
  } catch (err) {
    console.error(
      "[pushTokenCleanup] Cleanup failed:",
      err instanceof Error ? err.message : err,
    );
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startPushTokenCleanupWorker(): void {
  if (_timer) return;
  // First run after 1 minute (let server warm up), then on interval
  setTimeout(() => {
    runCleanup().catch(() => {});
    _timer = setInterval(() => {
      runCleanup().catch(() => {});
    }, CLEANUP_INTERVAL_MS);
  }, 60_000);
  console.log(`[pushTokenCleanup] Worker scheduled — interval: ${CLEANUP_INTERVAL_MS / 86_400_000}d, stale threshold: ${STALE_AFTER_DAYS}d`);
}

export function stopPushTokenCleanupWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
