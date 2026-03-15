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
import { getDb } from "./db";
import { transactions } from "../drizzle/schema";
import { and, eq, isNotNull, lt, sql } from "drizzle-orm";
import { rustReleaseInventory } from "./microservices";

const POLL_INTERVAL_MS = 5 * 60 * 1000;   // 5 minutes
const EXPIRY_THRESHOLD_MS = 15 * 60 * 1000; // 15 minutes

export function startReservationExpiryWorker(): void {
  console.log("[reservationExpiry] Worker started (poll every 5 min, threshold 15 min)");
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

      console.log(`[reservationExpiry] Processing ${expired.length} expired reservation(s)`);

      await Promise.allSettled(
        expired.map(async (row) => {
          const meta = (row.metadata ?? {}) as Record<string, any>;
          const reservationId = meta.inventoryReservationId as string;
          try {
            await rustReleaseInventory(reservationId);
          } catch (e) {
            console.warn(`[reservationExpiry] Release failed for ${reservationId} (non-fatal):`, (e as Error).message);
          }
          // Mark as expired regardless of whether the release call succeeded
          await db
            .update(transactions)
            .set({
              metadata: sql`${transactions.metadata}::jsonb || '{"inventoryReservationStatus":"expired"}'::jsonb`,
              updatedAt: new Date(),
            })
            .where(eq(transactions.id, row.id));
        })
      );
    } catch (err) {
      console.error("[reservationExpiry] Worker error:", err);
    }
  };

  // Run immediately on start, then on interval
  tick();
  setInterval(tick, POLL_INTERVAL_MS);
}
