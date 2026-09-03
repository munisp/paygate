import { logger } from './logger';
/**
 * notificationPurge.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Periodic cleanup worker for old merchant notifications.
 *
 * Runs every 24 hours (configurable via NOTIFICATION_PURGE_INTERVAL_MS).
 * Purges notifications that are:
 *   1. Older than NOTIFICATION_RETENTION_DAYS (default: 90 days)
 *   2. Already read (isRead = true) and older than READ_NOTIFICATION_RETENTION_DAYS (default: 30 days)
 *
 * Fail-open: errors are logged and the worker retries on the next cycle.
 */

import { getDb } from "./db";
import { isSuppressedWorkerError } from './workerErrorFilter';

const PURGE_INTERVAL_MS =
  Number(process.env.NOTIFICATION_PURGE_INTERVAL_MS) || 24 * 60 * 60 * 1000; // 24 h

const RETENTION_DAYS =
  Number(process.env.NOTIFICATION_RETENTION_DAYS) || 90;

const READ_RETENTION_DAYS =
  Number(process.env.READ_NOTIFICATION_RETENTION_DAYS) || 30;

async function runPurge(): Promise<void> {
  logger.info("[notificationPurge] Starting merchant notification purge…");
  try {
    const db = await getDb();
    if (!db) {
      logger.warn("[notificationPurge] DB unavailable — skipping");
      return;
    }

    const { merchantNotifications } = await import("../drizzle/schema");
    const { lt, and, eq, or } = await import("drizzle-orm");

    const oldThreshold = new Date(Date.now() - RETENTION_DAYS * 24 * 60 * 60 * 1000);
    const readThreshold = new Date(Date.now() - READ_RETENTION_DAYS * 24 * 60 * 60 * 1000);

    const result = await db
      .delete(merchantNotifications)
      .where(
        or(
          // All notifications older than retention period
          lt(merchantNotifications.createdAt, oldThreshold),
          // Read notifications older than read retention period
          and(
            eq(merchantNotifications.isRead, true),
            lt(merchantNotifications.createdAt, readThreshold),
          ),
        ),
      )
      .returning({ id: merchantNotifications.id });

    logger.info(`[notificationPurge] Purged ${result.length} old notifications`);
  } catch (err) {
    if (!isSuppressedWorkerError(err)) {
      console.error(
        "[notificationPurge] Purge failed:",
        err instanceof Error ? err.message : err,
      );
    }
  }
}

let _timer: ReturnType<typeof setInterval> | null = null;

export function startNotificationPurgeWorker(): void {
  if (_timer) return;
  // First run after 2 minutes (stagger from other workers), then on interval
  setTimeout(() => {
    runPurge().catch((e) => console.error("[notificationPurge] tick failed:", e instanceof Error ? e.message : e));
    _timer = setInterval(() => {
      runPurge().catch((e) => console.error("[notificationPurge] tick failed:", e instanceof Error ? e.message : e));
    }, PURGE_INTERVAL_MS);
  }, 2 * 60_000);
  console.log(
    `[notificationPurge] Worker scheduled — interval: ${PURGE_INTERVAL_MS / 86_400_000}d, ` +
    `retention: ${RETENTION_DAYS}d (all) / ${READ_RETENTION_DAYS}d (read)`,
  );
}

export function stopNotificationPurgeWorker(): void {
  if (_timer) {
    clearInterval(_timer);
    _timer = null;
  }
}
