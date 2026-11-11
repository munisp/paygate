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
  nexthubBulkTransfers,
  nexthubFxRates,
  nexthubLiquidityWindows,
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

      // A2-HIGH-1 writer note: nexthub_transfers rows are written by the
      // external NextHub/Mojaloop-compatible hub switch (transfer
      // prepare/fulfil path, outside this Node codebase) as transfers are
      // committed to the current window; this router only READS them for
      // settlement aggregation. No in-repo writer exists by design.
      // Aggregate net positions per DFSP from nexthub_transfers in this window.
      // NOTE: the previous query used `case when payer_fsp_id = payer_fsp_id`
      // (a tautology, always true) — each (payer, payee) group contributes its
      // full amount sum to the payer's debits and the payee's credits, so a
      // single plain SUM is the truthful expression.
      const positions = await db
        .select({
          payerFspId: nexthubTransfers.payerFspId,
          payeeFspId: nexthubTransfers.payeeFspId,
          totalAmount: sql<number>`sum(amount_kobo)::bigint`,
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
        const amount = p.totalAmount ?? 0;
        const debit = netMap.get(p.payerFspId) ?? { debits: 0, credits: 0, count: 0 };
        debit.debits += amount;
        debit.count += p.count ?? 0;
        netMap.set(p.payerFspId, debit);

        const credit = netMap.get(p.payeeFspId) ?? { debits: 0, credits: 0, count: 0 };
        credit.credits += amount;
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

      const totalAmount = netPositionRows.reduce((sum, p) => sum + Math.abs(p.netPositionKobo), 0);

      // Positions insert + status flip are ATOMIC, and the flip is guarded on
      // status='OPEN' — two concurrent closeWindow calls can't both insert net
      // positions (which would double-count settlement amounts).
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(settlementWindows)
          .set({
            status: "CLOSED",
            closedAt: new Date(),
            totalTransfers: netPositionRows.reduce((sum, p) => sum + p.transferCount, 0),
            totalAmountKobo: totalAmount,
            updatedAt: new Date(),
          })
          .where(and(
            eq(settlementWindows.id, input.windowId),
            eq(settlementWindows.status, "OPEN"),
          ))
          .returning();

        if (!row) throw new TRPCError({ code: "CONFLICT", message: "Window was already closed by another request" });

        if (netPositionRows.length > 0) {
          await tx.insert(settlementNetPositions).values(netPositionRows);
        }
        return row;
      });

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

      // Mark as SETTLING — guarded so two concurrent settle calls can't both
      // trigger the TigerBeetle batch for the same window (double settlement).
      const [updated] = await db.update(settlementWindows)
        .set({ status: "SETTLING", updatedAt: new Date() })
        .where(and(
          eq(settlementWindows.id, input.windowId),
          eq(settlementWindows.status, "CLOSED"),
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Window settlement was already triggered by another request" });

      // R4 F15: HONEST STATUS — there is NO Fluvio publish and NO Rust
      // nexthub-settlement worker integrated in this deployment, so no
      // TigerBeetle batch posting has been triggered. The window is parked in
      // SETTLING (guard prevents duplicate triggers); it transitions to
      // SETTLED only when a real settlement worker calls the settled webhook.
      // Previously this returned "batch posting in progress", which was a lie.
      return {
        window: updated,
        message:
          "Window marked SETTLING. No settlement worker is integrated in this deployment — TigerBeetle batch posting has NOT been triggered. The window settles when the nexthub-settlement service is integrated and reports completion via the settled webhook.",
      };
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

  // ─── Bulk Transfers (Mojaloop bulk-transfer projection) ────────────────────
  // nexthub_bulk_transfers previously had NO writer. These procedures persist
  // the bulk-transfer lifecycle the hub orchestrates (RECEIVED → PROCESSING →
  // COMPLETED | FAILED).

  /** registerBulkTransfer — persist an inbound bulk transfer */
  registerBulkTransfer: pbacProcedure("trigger_settlement")
    .input(z.object({
      bulkTransferId: z.string().min(1).max(64),
      bulkQuoteId: z.string().max(64).optional(),
      payerFsp: z.string().min(1).max(64),
      payeeFsp: z.string().min(1).max(64),
      totalTransfers: z.number().int().min(1),
      expiration: z.string().datetime().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.insert(nexthubBulkTransfers).values({
        bulkTransferId: input.bulkTransferId,
        bulkQuoteId: input.bulkQuoteId ?? null,
        payerFsp: input.payerFsp,
        payeeFsp: input.payeeFsp,
        totalTransfers: input.totalTransfers,
        state: "RECEIVED",
        expiration: input.expiration ? new Date(input.expiration) : null,
      }).returning();
      return row;
    }),

  /** recordBulkTransferProgress — update completion counts and terminal state */
  recordBulkTransferProgress: pbacProcedure("trigger_settlement")
    .input(z.object({
      bulkTransferId: z.string().min(1).max(64),
      completedTransfers: z.number().int().min(0),
      failedTransfers: z.number().int().min(0),
      errorCode: z.string().max(8).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [existing] = await db.select().from(nexthubBulkTransfers)
        .where(eq(nexthubBulkTransfers.bulkTransferId, input.bulkTransferId))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Bulk transfer not found" });
      const done = input.completedTransfers + input.failedTransfers >= existing.totalTransfers;
      const state = !done
        ? "PROCESSING"
        : input.failedTransfers > 0 ? "FAILED" : "COMPLETED";
      const [row] = await db.update(nexthubBulkTransfers)
        .set({
          completedTransfers: input.completedTransfers,
          failedTransfers: input.failedTransfers,
          state,
          errorCode: input.errorCode ?? null,
          completedAt: done ? new Date() : null,
          updatedAt: new Date(),
        })
        .where(eq(nexthubBulkTransfers.bulkTransferId, input.bulkTransferId))
        .returning();
      return row;
    }),

  /** listBulkTransfers — paginated bulk-transfer list */
  listBulkTransfers: pbacProcedure("trigger_settlement")
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      state: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const whereClause = input.state ? eq(nexthubBulkTransfers.state, input.state) : undefined;
      const [rows, countResult] = await Promise.all([
        db.select().from(nexthubBulkTransfers)
          .where(whereClause)
          .orderBy(desc(nexthubBulkTransfers.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` }).from(nexthubBulkTransfers).where(whereClause),
      ]);
      return { bulkTransfers: rows, total: countResult[0]?.count ?? 0 };
    }),

  // ─── Hub FX Rates (nexthub_fx_rates) ───────────────────────────────────────
  // The hub's own FX oracle quotes used for cross-currency settlement.
  // nexthub_fx_rates previously had NO writer.

  /** publishFxRate — register a new rate quote for a currency pair */
  publishFxRate: pbacProcedure("trigger_settlement")
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      rate: z.string().regex(/^\d+(\.\d+)?$/, "rate must be a positive decimal string"),
      provider: z.string().max(64).default("nexthub-fx"),
      validFrom: z.string().datetime(),
      validTo: z.string().datetime(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const validFrom = new Date(input.validFrom);
      const validTo = new Date(input.validTo);
      if (validTo.getTime() <= validFrom.getTime()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "validTo must be after validFrom" });
      }
      const [row] = await db.insert(nexthubFxRates).values({
        sourceCurrency: input.sourceCurrency.toUpperCase(),
        targetCurrency: input.targetCurrency.toUpperCase(),
        rate: input.rate,
        provider: input.provider,
        validFrom,
        validTo,
      }).returning();
      return row;
    }),

  /** getFxRate — latest currently-valid rate for a pair (404 when none) */
  getFxRate: pbacProcedure("trigger_settlement")
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const now = new Date();
      const [row] = await db.select().from(nexthubFxRates)
        .where(and(
          eq(nexthubFxRates.sourceCurrency, input.sourceCurrency.toUpperCase()),
          eq(nexthubFxRates.targetCurrency, input.targetCurrency.toUpperCase()),
          lte(nexthubFxRates.validFrom, now),
          gte(nexthubFxRates.validTo, now),
        ))
        .orderBy(desc(nexthubFxRates.validFrom))
        .limit(1);
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No valid FX rate for this pair" });
      return row;
    }),

  // ─── Liquidity Windows (nexthub_liquidity_windows) ─────────────────────────
  // Participant liquidity reservations backing settlement. The table
  // previously had NO writer.

  /** openLiquidityWindow — reserve participant liquidity until closesAt */
  openLiquidityWindow: pbacProcedure("trigger_settlement")
    .input(z.object({
      participantId: z.string().min(1),
      currency: z.string().length(3).default("NGN"),
      amountKobo: z.number().int().positive(),
      closesAt: z.string().datetime(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const closesAt = new Date(input.closesAt);
      if (closesAt.getTime() <= Date.now()) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "closesAt must be in the future" });
      }
      const [row] = await db.insert(nexthubLiquidityWindows).values({
        participantId: input.participantId,
        currency: input.currency.toUpperCase(),
        amount: input.amountKobo,
        closesAt,
        status: "OPEN",
      }).returning();
      return row;
    }),

  /** closeLiquidityWindow — terminal transition OPEN → CLOSED */
  closeLiquidityWindow: pbacProcedure("trigger_settlement")
    .input(z.object({ windowId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [row] = await db.update(nexthubLiquidityWindows)
        .set({ status: "CLOSED" })
        .where(and(
          eq(nexthubLiquidityWindows.windowId, input.windowId),
          eq(nexthubLiquidityWindows.status, "OPEN"),
        ))
        .returning();
      if (!row) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Liquidity window not found or not OPEN" });
      }
      return row;
    }),

  /** listLiquidityWindows — current liquidity windows, optionally by participant */
  listLiquidityWindows: pbacProcedure("trigger_settlement")
    .input(z.object({
      participantId: z.string().optional(),
      status: z.enum(["OPEN", "CLOSED", "ALL"]).default("ALL"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const conditions = [];
      if (input.participantId) conditions.push(eq(nexthubLiquidityWindows.participantId, input.participantId));
      if (input.status !== "ALL") conditions.push(eq(nexthubLiquidityWindows.status, input.status));
      return db.select().from(nexthubLiquidityWindows)
        .where(conditions.length ? and(...conditions as [any, ...any[]]) : undefined)
        .orderBy(desc(nexthubLiquidityWindows.openedAt));
    }),
});
