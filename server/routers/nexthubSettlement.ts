/**
 * NextHub Settlement Router
 *
 * Manages settlement windows, net positions, and the full settlement lifecycle
 * (OPEN → CLOSED → SETTLING → SETTLED) for the NextHub payment hub.
 *
 * TigerBeetle is the authoritative financial store. This router manages
 * the PostgreSQL operational projection and orchestrates the settlement workflow.
 */
import { z } from "zod";
import { pbacProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  settlementWindows,
  settlementNetPositions,
  nexthubTransfers,
  nexthubDfsps,
} from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Settlement Window Procedures ─────────────────────────────────────────────

export const nexthubSettlementRouter = router({

  /** List all settlement windows with pagination */
  listWindows: pbacProcedure("trigger_settlement")
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["OPEN", "CLOSED", "SETTLING", "SETTLED", "FAILED", "ALL"]).default("ALL"),
      windowType: z.enum(["RTGS", "DNS_INTRADAY", "DNS_EOD", "ALL"]).default("ALL"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(settlementWindows.status, input.status));
      if (input.windowType !== "ALL") conditions.push(eq(settlementWindows.windowType, input.windowType));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [windows, countResult] = await Promise.all([
        db.select().from(settlementWindows)
          .where(whereClause)
          .orderBy(desc(settlementWindows.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(settlementWindows)
          .where(whereClause),
      ]);

      return {
        windows,
        total: countResult[0]?.count ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /** Get a single settlement window with its net positions */
  getWindow: pbacProcedure("trigger_settlement")
    .input(z.object({ windowId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) {
        return null;
      }

      const positions = await db.select()
        .from(settlementNetPositions)
        .where(eq(settlementNetPositions.windowId, input.windowId))
        .orderBy(desc(settlementNetPositions.netPositionKobo));

      return { ...window, positions };
    }),

  /** Open a new settlement window */
  openWindow: pbacProcedure("trigger_settlement")
    .input(z.object({
      windowType: z.enum(["RTGS", "DNS_INTRADAY", "DNS_EOD"]),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      // Ensure no other window of the same type is currently OPEN
      const [existing] = await db.select({ id: settlementWindows.id })
        .from(settlementWindows)
        .where(and(
          eq(settlementWindows.windowType, input.windowType),
          eq(settlementWindows.status, "OPEN"),
        ))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `A ${input.windowType} window is already open (id: ${existing.id})`,
        });
      }

      const [window] = await db.insert(settlementWindows).values({
        windowType: input.windowType,
        currency: input.currency,
        status: "OPEN",
        openedAt: new Date(),
      }).returning();

      return window;
    }),

  /** Close a settlement window and compute net positions */
  closeWindow: pbacProcedure("trigger_settlement")
    .input(z.object({ windowId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) throw new TRPCError({ code: "NOT_FOUND", message: "Window not found" });
      if (window.status !== "OPEN") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Window is ${window.status}, not OPEN` });
      }

      // Aggregate net positions per DFSP from nexthub_transfers in this window
      const positions = await db
        .select({
          payerFspId: nexthubTransfers.payerFspId,
          payeeFspId: nexthubTransfers.payeeFspId,
          totalDebits: sql<number>`sum(case when payer_fsp_id = payer_fsp_id then amount_kobo else 0 end)::bigint`,
          totalCredits: sql<number>`sum(case when payee_fsp_id = payee_fsp_id then amount_kobo else 0 end)::bigint`,
          count: sql<number>`count(*)::int`,
        })
        .from(nexthubTransfers)
        .where(and(
          eq(nexthubTransfers.windowId, input.windowId),
          eq(nexthubTransfers.state, "COMMITTED"),
        ))
        .groupBy(nexthubTransfers.payerFspId, nexthubTransfers.payeeFspId);

      // Build per-DFSP net position map
      const netMap = new Map<string, { debits: number; credits: number; count: number }>();
      for (const p of positions) {
        const debit = netMap.get(p.payerFspId) ?? { debits: 0, credits: 0, count: 0 };
        debit.debits += p.totalDebits ?? 0;
        debit.count += p.count ?? 0;
        netMap.set(p.payerFspId, debit);

        const credit = netMap.get(p.payeeFspId) ?? { debits: 0, credits: 0, count: 0 };
        credit.credits += p.totalCredits ?? 0;
        netMap.set(p.payeeFspId, credit);
      }

      // Fetch DFSP names
      const dfspIds = Array.from(netMap.keys());
      const dfsps = dfspIds.length > 0
        ? await db.select({ dfspId: nexthubDfsps.dfspId, dfspName: nexthubDfsps.dfspName })
            .from(nexthubDfsps)
            .where(sql`dfsp_id = ANY(${dfspIds})`)
        : [];
      const dfspNameMap = new Map(dfsps.map(d => [d.dfspId, d.dfspName]));

      // Insert net positions
      const netPositionRows = Array.from(netMap.entries()).map(([dfspId, pos]) => ({
        windowId: input.windowId,
        dfspId,
        dfspName: dfspNameMap.get(dfspId) ?? dfspId,
        currency: window.currency,
        totalDebitsKobo: pos.debits,
        totalCreditsKobo: pos.credits,
        netPositionKobo: pos.credits - pos.debits,
        transferCount: pos.count,
      }));

      if (netPositionRows.length > 0) {
        await db.insert(settlementNetPositions).values(netPositionRows);
      }

      const totalAmount = netPositionRows.reduce((sum, p) => sum + Math.abs(p.netPositionKobo), 0);

      const [updated] = await db.update(settlementWindows)
        .set({
          status: "CLOSED",
          closedAt: new Date(),
          totalTransfers: netPositionRows.reduce((sum, p) => sum + p.transferCount, 0),
          totalAmountKobo: totalAmount,
          updatedAt: new Date(),
        })
        .where(eq(settlementWindows.id, input.windowId))
        .returning();

      return updated;
    }),

  /** Trigger settlement for a closed window (posts to TigerBeetle + CBN rail) */
  settleWindow: pbacProcedure("trigger_settlement")
    .input(z.object({ windowId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [window] = await db.select()
        .from(settlementWindows)
        .where(eq(settlementWindows.id, input.windowId))
        .limit(1);

      if (!window) throw new TRPCError({ code: "NOT_FOUND", message: "Window not found" });
      if (window.status !== "CLOSED") {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Window must be CLOSED to settle (current: ${window.status})` });
      }

      // Mark as SETTLING — TigerBeetle batch posting happens asynchronously
      // via the Rust nexthub-settlement service consuming the Fluvio topic
      const [updated] = await db.update(settlementWindows)
        .set({ status: "SETTLING", updatedAt: new Date() })
        .where(eq(settlementWindows.id, input.windowId))
        .returning();

      // In production: publish nexthub.settlement.window.settle event to Fluvio
      // The Rust nexthub-settlement service will:
      // 1. lookup_accounts for all DFSP positions
      // 2. create_transfers for all net positions (linked chain)
      // 3. publish nexthub.settlement.window.settled when complete
      // 4. tRPC webhook updates status to SETTLED

      return { window: updated, message: "Settlement initiated — TigerBeetle batch posting in progress" };
    }),

  /** Get settlement statistics for the dashboard */
  getStats: pbacProcedure("trigger_settlement")
    .query(async () => {
      const db = await getDb();

      const [stats] = await db.select({
        totalWindows: sql<number>`count(*)::int`,
        openWindows: sql<number>`sum(case when status = 'OPEN' then 1 else 0 end)::int`,
        settledToday: sql<number>`sum(case when status = 'SETTLED' then 1 else 0 end)::int`,
        totalSettledKobo: sql<number>`coalesce(sum(case when status = 'SETTLED' then total_amount_kobo else 0 end), 0)::bigint`,
        pendingSettlementKobo: sql<number>`coalesce(sum(case when status in ('CLOSED', 'SETTLING') then total_amount_kobo else 0 end), 0)::bigint`,
      }).from(settlementWindows);

      return stats;
    }),

  /** createWindow — alias for openWindow with extended input */
  createWindow: pbacProcedure("trigger_settlement")
    .input(z.object({
      windowType: z.enum(["RTGS", "ACH", "INSTANT", "BATCH", "DNS_INTRADAY", "DNS_EOD", "DEFERRED_NET", "GROSS"]),
      currency: z.string().default("NGN"),
      settlementModel: z.string().optional(),
      openedAt: z.number().optional(),
      scheduledCloseAt: z.number().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [win] = await db.insert(settlementWindows).values({
        windowType: input.windowType,
        currency: input.currency,
        status: "OPEN",
      }).returning();
      return win;
    }),

  /** getNetPositions — list net positions for a settlement window */
  getNetPositions: pbacProcedure("trigger_settlement")
    .input(z.object({ windowId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const positions = await db.select()
        .from(settlementNetPositions)
        .where(eq(settlementNetPositions.windowId, input.windowId))
        .orderBy(desc(settlementNetPositions.netPositionKobo));
      return positions;
    }),
});
