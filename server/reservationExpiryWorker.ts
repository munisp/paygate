/**
 * PayGate Reservation Expiry Worker
 *
 * Scans completed transactions that hold an active inventory reservation
 * older than EXPIRY_THRESHOLD_MS (default 15 minutes). For each expired
 * reservation it:
 *   1. Calls the Rust Inventory Engine to release the reservation.
 *   2. Updates the transaction metadata to mark the reservation as "expired".
 *
 * Runs every POLL_INTERVAL_MS (default 5 minutes) in the portal server.
 * Fail-open: any error is logged and the worker continues.
 *
 * Usage: call startReservationExpiryWorker() once in server/_core/index.ts
 */
import { logger } from './logger';
import { isSuppressedWorkerError } from './workerErrorFilter';
import { getDb } from "./db";
import { transactions } from "../drizzle/schema";
import { and, eq, lt, sql } from "drizzle-orm";
import { rustReleaseInventory } from "./microservices";
import { notifyOwner } from "./_core/notification";

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const EXPIRY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function startReservationExpiryWorker(): void {
  logger.info("[reservationExpiry] Worker started (poll every 5 min, threshold 15 min)");
  const tick = async () => {
    try {
      const db = await getDb();
      if (!db) return;

      const cutoff = new Date(Date.now() - EXPIRY_THRESHOLD_MS);

      // Find completed transactions created before the cutoff that still have
      // an active inventory reservation (status not yet "released" or "expired").
      const rows = await db
        .select({ id: transactions.id, metadata: transactions.metadata })
        .from(transactions)
        .where(
          and(
            eq(transactions.status, "completed"),
            lt(transactions.createdAt, cutoff),
          )
        )
        .limit(50);

      // Filter in JS: only rows with inventoryReservationId and no terminal status
      const expired = rows.filter(r => {
        const meta = (r.metadata ?? {}) as Record<string, any>;
        return (
          typeof meta.inventoryReservationId === "string" &&
          meta.inventoryReservationId.length > 0 &&
          meta.inventoryReservationStatus !== "released" &&
          meta.inventoryReservationStatus !== "expired"
        );
      });

      if (expired.length === 0) return;

      logger.info(`[reservationExpiry] Processing ${expired.length} expired reservation(s)`);

      await Promise.allSettled(
        expired.map(async (row) => {
          const meta = (row.metadata ?? {}) as Record<string, any>;
          const reservationId = meta.inventoryReservationId as string;
          const amountKobo = (meta.amount ?? 0) as number;
          const amountNaira = (amountKobo / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });

          // 1. CLAIM atomically: guarded status flip (active → expiring).
          //    Only one worker tick/instance can win; losers see 0 rows and
          //    skip, so the release call below can never run twice.
          const claimed = await db.execute(sql`
            UPDATE transactions
            SET metadata = COALESCE(metadata, '{}'::jsonb)
                  || '{"inventoryReservationStatus":"expiring"}'::jsonb,
                updated_at = NOW()
            WHERE id = ${row.id}
              AND COALESCE(metadata->>'inventoryReservationStatus', 'active')
                    NOT IN ('released', 'expired', 'expiring')
            RETURNING id
          `);
          if (!claimed.rows.length) return; // another tick/instance claimed it

          // 2. RELEASE the hold. If this fails, roll the claim back so the
          //    next tick retries — previously the row was marked "expired"
          //    regardless, permanently leaking the unreleased reservation.
          try {
            await rustReleaseInventory(reservationId);
          } catch (e) {
            const errMsg = (e as Error).message;
            logger.error(`[reservationExpiry] RELEASE FAILED for ${reservationId} (tx ${row.id}) — will retry next tick: ${errMsg}`);
            await db.execute(sql`
              UPDATE transactions
              SET metadata = metadata - 'inventoryReservationStatus',
                  updated_at = NOW()
              WHERE id = ${row.id}
                AND metadata->>'inventoryReservationStatus' = 'expiring'
            `).catch((rbErr: Error) =>
              logger.error(`[reservationExpiry] CRITICAL: claim rollback failed for tx ${row.id}: ${rbErr.message}`)
            );
            notifyOwner({
              title: "⚠️ Inventory reservation release FAILED",
              content: `Reservation ${reservationId} for transaction ${row.id} (${amountNaira}) could NOT be released: ${errMsg}. The worker will retry, but if this persists the inventory hold must be released manually.`,
            }).catch((nErr: Error) => logger.warn("[reservationExpiry] notifyOwner failed (non-fatal):", nErr.message));
            return;
          }

          // 3. Release succeeded — flip claimed row to terminal "expired".
          await db.execute(sql`
            UPDATE transactions
            SET metadata = metadata || '{"inventoryReservationStatus":"expired"}'::jsonb,
                updated_at = NOW()
            WHERE id = ${row.id}
              AND metadata->>'inventoryReservationStatus' = 'expiring'
          `);

          // Notify owner — fire-and-forget, never blocks expiry processing
          notifyOwner({
            title: "Inventory reservation expired",
            content: `Reservation ${reservationId} for transaction ${row.id} (${amountNaira}) has expired and been released. Check the transaction for details.`,
          }).catch((e: Error) => logger.warn("[reservationExpiry] notifyOwner failed (non-fatal):", e.message));
        })
      );
    } catch (err) {
      if (!isSuppressedWorkerError(err)) {
        logger.error("[reservationExpiry] Worker error:", err);
      }
    }
  };

  // Run immediately on start, then on interval
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
