import { logger } from './logger';
import { isSuppressedWorkerError } from './workerErrorFilter';
/**
 * Idempotency Key TTL Cleanup Worker
 *
 * Periodically purges expired idempotency records from the database.
 * Runs every 6 hours and deletes all rows where expiresAt < NOW().
 *
 * Usage: call startIdempotencyCleanupWorker() once in server/_core/index.ts
 */

import { lt, sql } from "drizzle-orm";
import { getDb } from "./db";
import { idempotencyRequests } from "../drizzle/schema";
import { STUCK_102_THRESHOLD_MS, synthesizeFromEntityRef } from "./idempotency";

const CLEANUP_INTERVAL_MS = 6 * 60 * 60 * 1000; // 6 hours
const BATCH_LIMIT = 10_000;

/**
 * C16(d): reap stuck-102 placeholder rows (winner crashed mid-execution).
 * - entity_ref present  → synthesize the success response onto the row
 *   (responseStatus 200) so a later client replay returns it instead of 409.
 * - entity_ref absent   → mark failed for audit, then evict so the client can
 *   re-execute with the same key.
 */
export async function reapStuck102Rows(): Promise<{ synthesized: number; evicted: number }> {
  const db = await getDb();
  if (!db) return { synthesized: 0, evicted: 0 };
  const cutoff = new Date(Date.now() - STUCK_102_THRESHOLD_MS);

  let rows: any[] = [];
  try {
    const result = await db.execute(sql`
      SELECT id, entity_table, entity_id FROM idempotency_requests
      WHERE response_status = 102 AND response_body IS NULL AND created_at < ${cutoff}
      LIMIT 500
    `);
    rows = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
  } catch (err) {
    // entity_* columns may not exist yet (migration 0104 pending) — fall back
    // to evicting plain stuck-102 rows without entity synthesis.
    try {
      const result = await db.execute(sql`
        SELECT id FROM idempotency_requests
        WHERE response_status = 102 AND response_body IS NULL AND created_at < ${cutoff}
        LIMIT 500
      `);
      rows = (result as any)?.rows ?? (Array.isArray(result) ? result : []);
    } catch (err2) {
      if (!isSuppressedWorkerError(err2)) logger.error("[idempotencyCleanup] stuck-102 scan error:", err2);
      return { synthesized: 0, evicted: 0 };
    }
    if ((err as any)?.code !== "42703") {
      logger.warn(`[idempotencyCleanup] entity-ref columns unavailable (${(err as Error).message}) — evicting without synthesis`);
    }
  }

  let synthesized = 0;
  let evicted = 0;
  for (const row of rows) {
    try {
      let done = false;
      if (row.entity_table && row.entity_id) {
        const body = await synthesizeFromEntityRef(row.entity_table, row.entity_id);
        if (body) {
          await db.execute(sql`
            UPDATE idempotency_requests
            SET response_status = 200, response_body = ${JSON.stringify(body)}::jsonb
            WHERE id = ${row.id} AND response_status = 102
          `);
          synthesized++;
          done = true;
        }
      }
      if (!done) {
        await db.execute(sql`
          UPDATE idempotency_requests
          SET response_status = 500,
              response_body = '{"error":"stuck-102 reaped without entity reference","code":"INTERNAL_SERVER_ERROR"}'::jsonb
          WHERE id = ${row.id} AND response_status = 102
        `);
        await db.execute(sql`DELETE FROM idempotency_requests WHERE id = ${row.id} AND response_status = 500`);
        evicted++;
      }
    } catch (rowErr) {
      if (!isSuppressedWorkerError(rowErr)) logger.error(`[idempotencyCleanup] stuck-102 reap failed for ${row.id}:`, rowErr);
    }
  }
  if (synthesized + evicted > 0) {
    console.info(`[idempotencyCleanup] Reaped stuck-102 rows: ${synthesized} synthesized, ${evicted} evicted`);
  }
  return { synthesized, evicted };
}

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
    if (!isSuppressedWorkerError(err)) {
      logger.error("[idempotencyCleanup] Cleanup error:", err);
    }
  }

  // C16(d): also reap stuck-102 placeholders on the same cadence.
  await reapStuck102Rows();
}

let cleanupInterval: ReturnType<typeof setInterval> | null = null;

export function startIdempotencyCleanupWorker(): void {
  if (cleanupInterval) return;

  // Run immediately on startup, then every 6 hours
  cleanupExpiredKeys().catch(e => { if (!isSuppressedWorkerError(e)) console.error('[idempotencyCleanup] Startup error:', e); });

  cleanupInterval = setInterval(() => {
    cleanupExpiredKeys().catch(e => { if (!isSuppressedWorkerError(e)) console.error('[idempotencyCleanup] Error:', e); });
  }, CLEANUP_INTERVAL_MS);

  console.info("[idempotencyCleanup] Worker started (interval=6h)");
}

export function stopIdempotencyCleanupWorker(): void {
  if (cleanupInterval) {
    clearInterval(cleanupInterval);
    cleanupInterval = null;
  }
}
