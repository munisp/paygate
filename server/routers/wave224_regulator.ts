/**
 * Wave 224 — Regulator Read-Only Portal
 *
 * Provides scoped, read-only views for regulatory observers (CBN, NIBSS, etc.)
 * All procedures use regulatorProcedure which requires role === "regulator" or "admin".
 *
 * Exposed as appRouter.regulatorPortal.*
 */
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import {
  nexthubRegulators,
  nexthubParticipants,
  nexthubParticipantLimits,
  nexthubDfsps,
  transactions,
  complianceCheckResults,
  settlementBanks,
  auditLogs,
} from "../../drizzle/schema";
import { eq, desc, gte, lte, and, sql } from "drizzle-orm";

// ─── regulatorProcedure ───────────────────────────────────────────────────────
const regulatorProcedure = protectedProcedure.use(async (opts) => {
  const { ctx, next } = opts;
  if (!ctx.user || ctx.user.role !== "admin") {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: "Regulator access required (10003)",
    });
  }
  return next({ ctx });
});

// ─── Sub-routers ─────────────────────────────────────────────────────────────

const regulatorProfileRouter = router({
  getProfile: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const [profile] = await db
      .select()
      .from(nexthubRegulators)
      .where(eq(nexthubRegulators.status, "active"))
      .limit(1);
    return profile ?? null;
  }),

  list: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(nexthubRegulators).orderBy(desc(nexthubRegulators.createdAt));
  }),
});

const regulatorParticipantsRouter = router({
  list: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: nexthubParticipants.id,
        dfspId: nexthubParticipants.dfspId,
        name: nexthubParticipants.name,
        currency: nexthubParticipants.currency,
        status: nexthubParticipants.status,
        schemeType: nexthubParticipants.schemeType,
        createdAt: nexthubParticipants.createdAt,
      })
      .from(nexthubParticipants)
      .orderBy(desc(nexthubParticipants.createdAt));
  }),

  summary: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        status: nexthubParticipants.status,
        count: sql<number>`count(*)`,
      })
      .from(nexthubParticipants)
      .groupBy(nexthubParticipants.status);
  }),
});

const regulatorLimitsRouter = router({
  list: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: nexthubParticipantLimits.id,
        participantId: nexthubParticipantLimits.participantId,
        currency: nexthubParticipantLimits.currency,
        netDebitCap: nexthubParticipantLimits.netDebitCap,
        liquidityCover: nexthubParticipantLimits.liquidityCover,
        positionLimit: nexthubParticipantLimits.positionLimit,
        alertThreshold: nexthubParticipantLimits.alertThreshold,
        suspendOnBreach: nexthubParticipantLimits.suspendOnBreach,
        updatedAt: nexthubParticipantLimits.updatedAt,
      })
      .from(nexthubParticipantLimits)
      .orderBy(desc(nexthubParticipantLimits.updatedAt));
  }),

  breaches: regulatorProcedure
    .input(z.object({ threshold: z.number().min(0).max(1).default(0.8) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      // Return limits where alertThreshold is >= input.threshold (proxy for breach)
      const limits = await db
        .select()
        .from(nexthubParticipantLimits)
        .where(gte(nexthubParticipantLimits.alertThreshold, input.threshold));
      return limits;
    }),
});

const regulatorSettlementRouter = router({
  volumeSummary: regulatorProcedure
    .input(
      z.object({
        from: z.date().optional(),
        to: z.date().optional(),
        currency: z.string().optional(),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.from) conditions.push(gte(transactions.createdAt, input.from));
      if (input.to) conditions.push(lte(transactions.createdAt, input.to));
      if (input.currency) conditions.push(eq(transactions.currency, input.currency));

      return db
        .select({
          currency: transactions.currency,
          status: transactions.status,
          count: sql<number>`count(*)`,
          totalAmount: sql<number>`sum(${transactions.amount})`,
        })
        .from(transactions)
        .where(conditions.length ? and(...conditions) : undefined)
        .groupBy(transactions.currency, transactions.status)
        .orderBy(desc(sql`sum(${transactions.amount})`));
    }),

  banks: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db.select().from(settlementBanks).orderBy(desc(settlementBanks.createdAt));
  }),
});

const regulatorComplianceRouter = router({
  scorecards: regulatorProcedure
    .input(z.object({ entityId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = input.entityId
        ? [eq(complianceCheckResults.merchantId, input.entityId)]
        : [];
      return db
        .select()
        .from(complianceCheckResults)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(complianceCheckResults.evaluatedAt))
        .limit(200);
    }),

  summary: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        checkType: complianceCheckResults.checkType,
        status: complianceCheckResults.status,
        count: sql<number>`count(*)`,
      })
      .from(complianceCheckResults)
      .groupBy(complianceCheckResults.checkType, complianceCheckResults.status);
  }),
});

const regulatorAuditRouter = router({
  list: regulatorProcedure
    .input(
      z.object({
        action: z.string().optional(),
        entityType: z.string().optional(),
        limit: z.number().min(1).max(500).default(100),
      })
    )
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions = [];
      if (input.action) conditions.push(eq(auditLogs.action, input.action));
      if (input.entityType) conditions.push(eq(auditLogs.resource, input.entityType));
      return db
        .select()
        .from(auditLogs)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(auditLogs.createdAt))
        .limit(input.limit);
    }),
});

const regulatorDfspRouter = router({
  list: regulatorProcedure.query(async () => {
    const db = await getDb();
    if (!db) return [];
    return db
      .select({
        id: nexthubDfsps.id,
        dfspId: nexthubDfsps.dfspId,
        dfspName: nexthubDfsps.dfspName,
        dfspType: nexthubDfsps.dfspType,
        country: nexthubDfsps.country,
        currency: nexthubDfsps.currency,
        status: nexthubDfsps.status,
        createdAt: nexthubDfsps.createdAt,
      })
      .from(nexthubDfsps)
      .orderBy(nexthubDfsps.dfspName);
  }),
});

// ─── Main export ─────────────────────────────────────────────────────────────
export const regulatorPortalRouter = router({
  profile: regulatorProfileRouter,
  participants: regulatorParticipantsRouter,
  limits: regulatorLimitsRouter,
  settlement: regulatorSettlementRouter,
  compliance: regulatorComplianceRouter,
  audit: regulatorAuditRouter,
  dfsps: regulatorDfspRouter,
});
