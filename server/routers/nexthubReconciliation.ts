/**
 * NextHub Reconciliation Router
 *
 * Manages reconciliation exceptions (breaks) between hub records and rail records.
 * Four break types: TIMING, AMOUNT, MISSING_DEBIT, DUPLICATE_CREDIT.
 * Auto-resolution SLAs: Timing 2h, Amount 4h, Missing Debit 1h, Duplicate Credit 30min.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { reconciliationExceptions, settlementWindows } from "../../drizzle/schema";
import { eq, desc, sql, and, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const BREAK_SLA_MINUTES: Record<string, number> = {
  TIMING: 120,
  AMOUNT: 240,
  MISSING_DEBIT: 60,
  DUPLICATE_CREDIT: 30,
};

export const nexthubReconciliationRouter = router({

  /** List reconciliation exceptions with filters */
  listExceptions: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["OPEN", "AUTO_RESOLVED", "ESCALATED", "CLOSED", "ALL"]).default("ALL"),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL", "ALL"]).default("ALL"),
      breakType: z.enum(["TIMING", "AMOUNT", "MISSING_DEBIT", "DUPLICATE_CREDIT", "ALL"]).default("ALL"),
      windowId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(reconciliationExceptions.status, input.status));
      if (input.severity !== "ALL") conditions.push(eq(reconciliationExceptions.severity, input.severity));
      if (input.breakType !== "ALL") conditions.push(eq(reconciliationExceptions.breakType, input.breakType));
      if (input.windowId) conditions.push(eq(reconciliationExceptions.windowId, input.windowId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [exceptions, countResult] = await Promise.all([
        db.select().from(reconciliationExceptions)
          .where(whereClause)
          .orderBy(desc(reconciliationExceptions.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(reconciliationExceptions)
          .where(whereClause),
      ]);

      return {
        exceptions,
        total: countResult[0]?.count ?? 0,
        limit: input.limit,
        offset: input.offset,
      };
    }),

  /** Get a single reconciliation exception */
  getException: protectedProcedure
    .input(z.object({ exceptionId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [exception] = await db.select()
        .from(reconciliationExceptions)
        .where(eq(reconciliationExceptions.id, input.exceptionId))
        .limit(1);

      if (!exception) throw new TRPCError({ code: "NOT_FOUND", message: "Exception not found" });
      return exception;
    }),

  /** Raise a new reconciliation exception */
  raiseException: protectedProcedure
    .input(z.object({
      windowId: z.string(),
      transferId: z.string().optional(),
      dfspId: z.string().optional(),
      breakType: z.enum(["TIMING", "AMOUNT", "MISSING_DEBIT", "DUPLICATE_CREDIT"]),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      hubAmountKobo: z.number().optional(),
      railAmountKobo: z.number().optional(),
      currency: z.string().default("NGN"),
      description: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const discrepancyAmountKobo = (input.hubAmountKobo !== undefined && input.railAmountKobo !== undefined)
        ? Math.abs(input.hubAmountKobo - input.railAmountKobo)
        : undefined;

      const slaMinutes = BREAK_SLA_MINUTES[input.breakType];

      const [exception] = await db.insert(reconciliationExceptions).values({
        windowId: input.windowId,
        transferId: input.transferId,
        dfspId: input.dfspId,
        breakType: input.breakType,
        severity: input.severity,
        status: "OPEN",
        hubAmountKobo: input.hubAmountKobo,
        railAmountKobo: input.railAmountKobo,
        discrepancyAmountKobo,
        currency: input.currency,
        description: input.description,
        autoResolveSlaMinutes: slaMinutes,
      }).returning();

      return exception;
    }),

  /** Resolve an exception (manual or auto) */
  resolveException: protectedProcedure
    .input(z.object({
      exceptionId: z.string(),
      resolutionNotes: z.string().optional(),
      notes: z.string().optional(),
      status: z.enum(["AUTO_RESOLVED", "CLOSED"]).optional(),
      resolution: z.enum(["AUTO_RESOLVED", "CLOSED"]).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const resolvedStatus = input.status ?? input.resolution ?? "CLOSED";
      const resolvedNotes = input.resolutionNotes ?? input.notes ?? "";

      const [updated] = await db.update(reconciliationExceptions)
        .set({
          status: resolvedStatus,
          resolutionNotes: resolvedNotes,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(reconciliationExceptions.id, input.exceptionId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Exception not found" });
      return updated;
    }),

  /** Escalate an exception to a compliance officer */
  escalateException: protectedProcedure
    .input(z.object({
      exceptionId: z.string(),
      assignedTo: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [updated] = await db.update(reconciliationExceptions)
        .set({
          status: "ESCALATED",
          escalatedAt: new Date(),
          assignedTo: input.assignedTo,
          resolutionNotes: input.notes,
          updatedAt: new Date(),
        })
        .where(eq(reconciliationExceptions.id, input.exceptionId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Exception not found" });
      return updated;
    }),

  /** Get reconciliation dashboard statistics */
  getStats: protectedProcedure
    .input(z.object({}).optional())
    .query(async () => {
      const db = await getDb();

      const [stats] = await db.select({
        openCount: sql<number>`coalesce(sum(case when status = 'OPEN' then 1 else 0 end), 0)::int`,
        totalOpen: sql<number>`coalesce(sum(case when status = 'OPEN' then 1 else 0 end), 0)::int`,
        totalCritical: sql<number>`coalesce(sum(case when severity = 'CRITICAL' and status = 'OPEN' then 1 else 0 end), 0)::int`,
        escalatedCount: sql<number>`coalesce(sum(case when status = 'ESCALATED' then 1 else 0 end), 0)::int`,
        totalEscalated: sql<number>`coalesce(sum(case when status = 'ESCALATED' then 1 else 0 end), 0)::int`,
        autoResolvedCount: sql<number>`coalesce(sum(case when status = 'AUTO_RESOLVED' then 1 else 0 end), 0)::int`,
        resolvedToday: sql<number>`coalesce(sum(case when status in ('AUTO_RESOLVED', 'CLOSED') then 1 else 0 end), 0)::int`,
        avgResolutionMinutes: sql<number>`coalesce(sum(case when resolved_at is not null then 1 else 0 end), 0)::int`,
        totalDiscrepancyKobo: sql<number>`coalesce(sum(case when status = 'OPEN' then discrepancy_amount_kobo else 0 end), 0)::bigint`,
      }).from(reconciliationExceptions);

      const byBreakType = await db.select({
        breakType: reconciliationExceptions.breakType,
        count: sql<number>`count(*)::int`,
      })
        .from(reconciliationExceptions)
        .where(eq(reconciliationExceptions.status, "OPEN"))
        .groupBy(reconciliationExceptions.breakType);

      return { ...stats, byBreakType };
    }),

  /** Auto-resolve exceptions that have passed their SLA (called by Temporal heartbeat) */
  autoResolveSlaBreaches: protectedProcedure
    .mutation(async () => {
      const db = await getDb();

      const resolved = await db.update(reconciliationExceptions)
        .set({
          status: "AUTO_RESOLVED",
          resolutionNotes: "Auto-resolved: SLA elapsed without manual intervention",
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(reconciliationExceptions.status, "OPEN"),
          sql`created_at + (auto_resolve_sla_minutes * interval '1 minute') < now()`,
          sql`auto_resolve_sla_minutes is not null`,
        ))
        .returning();

      return { resolved: resolved.length };
    }),

  /** createException — log a new reconciliation break */
  createException: protectedProcedure
    .input(z.object({
      windowId: z.string(),
      transferId: z.string().optional(),
      hubTransferId: z.string().optional(),
      railReference: z.string().nullable().optional(),
      dfspId: z.string().optional(),
      payerFspId: z.string().optional(),
      payeeFspId: z.string().optional(),
      breakType: z.enum(["AMOUNT_MISMATCH", "MISSING_TRANSFER", "DUPLICATE", "TIMING", "FX_RATE"]),
      severity: z.enum(["LOW", "MEDIUM", "HIGH", "CRITICAL"]).default("MEDIUM"),
      hubAmountKobo: z.number().optional(),
      railAmountKobo: z.number().optional(),
      hubAmountMinor: z.number().nullable().optional(),
      railAmountMinor: z.number().nullable().optional(),
      currency: z.string().default("NGN"),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const hubAmt = input.hubAmountKobo ?? input.hubAmountMinor ?? undefined;
      const railAmt = input.railAmountKobo ?? input.railAmountMinor ?? undefined;
      const discrepancy = (hubAmt != null && railAmt != null)
        ? Math.abs(hubAmt - railAmt)
        : undefined;
      const [ex] = await db.insert(reconciliationExceptions).values({
        windowId: input.windowId,
        transferId: input.transferId ?? input.hubTransferId,
        dfspId: input.dfspId ?? input.payerFspId,
        breakType: input.breakType,
        severity: input.severity,
        hubAmountKobo: hubAmt,
        railAmountKobo: railAmt,
        discrepancyAmountKobo: discrepancy,
        currency: input.currency,
        description: input.description,
        status: "OPEN",
      }).returning();
      return ex;
    }),
});
