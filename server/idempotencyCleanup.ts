import { logger } from './logger';
/**
 * Idempotency Key TTL Cleanup Worker
 *
 * Periodically purges expired idempotency records from the database.
 * Runs every 6 hours and deletes all rows where expiresAt < NOW().
 *
 * Usage: call startIdempotencyCleanupWorker() once in server/_core/index.ts
 */

import { lt } from "drizzle-orm";
import { getDb } from "./db";
import { idempotencyRequests } from "../drizzle/schema";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BATCH_LIMIT = 10_000;

async function cleanupExpiredKeys(): Promise<void> {
  const db = await getDb();
  if (!db) return;

  const now = new Date();

  try {
    const result = await db
      .delete(idempotencyRequests)
      .where(lt(idempotencyRequests.expiresAt, now));

    const deleted = (result as any)?.rowsAffected ?? 0;
    if (deleted > 0) {
      console.info(`[idempotencyCleanup] Purged ${deleted} expired idempotency keys`);
    }
  } catch (err) {
    logger.error("[idempotencyCleanup] Cleanup error:", err);
  }
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startIdempotencyCleanupWorker(): void {
  if (cleanupInterval) return;

  // Run immediately on startup, then every 6 hours
  cleanupExpiredKeys().catch(console.error);

  cleanupInterval = setInterval(() => {
    cleanupExpiredKeys().catch(console.error);
  }, CLEANUP_INTERVAL_MS);

  console.info("[idempotencyCleanup] Worker started (interval=6h)");
}

export function stopIdempotencyCleanupWorker(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
