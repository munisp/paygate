/**
 * NextHub Disputes Router
 *
 * Manages formal transfer disputes raised by DFSPs.
 * Dispute types: DUPLICATE, WRONG_AMOUNT, UNAUTHORISED, NOT_RECEIVED.
 * Outcomes: UPHELD (reversal + TigerBeetle), REJECTED (penalty billing), ESCALATED.
 */
import { z } from "zod";
import { pbacProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { transferDisputes, feePostings } from "../../drizzle/schema";
import { eq, desc, sql, and } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// SLA in hours per dispute type
const DISPUTE_SLA_HOURS: Record<string, number> = {
  DUPLICATE: 24,
  DUPLICATE_PAYMENT: 24,
  WRONG_AMOUNT: 48,
  UNAUTHORISED: 24,
  NOT_RECEIVED: 72,
};

const PENALTY_BPS = 200; // 2% penalty on rejected disputes

export const nexthubDisputesRouter = router({

  /** List disputes with filters */
  listDisputes: pbacProcedure("trigger_settlement")
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      status: z.enum(["OPEN", "UNDER_REVIEW", "UPHELD", "REJECTED", "ESCALATED", "ALL"]).default("ALL"),
      disputeType: z.enum(["DUPLICATE", "DUPLICATE_PAYMENT", "WRONG_AMOUNT", "UNAUTHORISED", "NOT_RECEIVED", "ALL"]).default("ALL"),
      dfspId: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.status !== "ALL") conditions.push(eq(transferDisputes.status, input.status));
      if (input.disputeType !== "ALL") conditions.push(eq(transferDisputes.disputeType, input.disputeType));
      if (input.dfspId) conditions.push(eq(transferDisputes.initiatedByDfspId, input.dfspId));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [disputes, countResult] = await Promise.all([
        db.select().from(transferDisputes)
          .where(whereClause)
          .orderBy(desc(transferDisputes.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(transferDisputes)
          .where(whereClause),
      ]);

      return { disputes, total: countResult[0]?.count ?? 0 };
    }),

  /** Get a single dispute */
  getDispute: pbacProcedure("trigger_settlement")
    .input(z.object({ disputeId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [dispute] = await db.select()
        .from(transferDisputes)
        .where(eq(transferDisputes.id, input.disputeId))
        .limit(1);

      if (!dispute) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });
      return dispute;
    }),

  /** Raise a new dispute */
  raiseDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      transferId: z.string(),
      initiatedByDfspId: z.string(),
      respondingDfspId: z.string().optional(),
      disputeType: z.enum(["DUPLICATE", "DUPLICATE_PAYMENT", "WRONG_AMOUNT", "UNAUTHORISED", "NOT_RECEIVED"]),
      amountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
      reason: z.string().min(10).max(2000),
      evidence: z.string().optional(), // JSON array of evidence items
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const slaHours = DISPUTE_SLA_HOURS[input.disputeType];
      const slaDeadline = new Date();
      slaDeadline.setHours(slaDeadline.getHours() + slaHours);

      const [dispute] = await db.insert(transferDisputes).values({
        transferId: input.transferId,
        initiatedByDfspId: input.initiatedByDfspId,
        respondingDfspId: input.respondingDfspId,
        disputeType: input.disputeType,
        status: "OPEN",
        amountKobo: input.amountKobo,
        currency: input.currency,
        reason: input.reason,
        evidence: input.evidence,
        slaDeadline,
      }).returning();

      return dispute;
    }),

  /** Move a dispute to UNDER_REVIEW */
  reviewDispute: pbacProcedure("trigger_settlement")
    .input(z.object({ disputeId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(transferDisputes)
        .set({ status: "UNDER_REVIEW", updatedAt: new Date() })
        .where(and(eq(transferDisputes.id, input.disputeId), eq(transferDisputes.status, "OPEN")))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Open dispute not found" });
      return updated;
    }),

  /** Uphold a dispute — triggers reversal transfer via TigerBeetle */
  upholdDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      disputeId: z.string(),
      resolutionNotes: z.string(),
      reversalTransferId: z.string().optional(), // TigerBeetle reversal ID
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [dispute] = await db.select()
        .from(transferDisputes)
        .where(eq(transferDisputes.id, input.disputeId))
        .limit(1);

      if (!dispute) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });
      if (!["OPEN", "UNDER_REVIEW"].includes(dispute.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot uphold a ${dispute.status} dispute` });
      }

      // Guarded update — re-check status in the WHERE clause so two
      // concurrent uphold calls (or an uphold racing a reject) can't both win.
      const [updated] = await db.update(transferDisputes)
        .set({
          status: "UPHELD",
          resolution: "UPHELD",
          resolutionNotes: input.resolutionNotes,
          reversalTransferId: input.reversalTransferId,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(and(
          eq(transferDisputes.id, input.disputeId),
          sql`${transferDisputes.status} IN ('OPEN', 'UNDER_REVIEW')`,
        ))
        .returning();

      if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Dispute was already resolved by another request" });

      // In production: publish nexthub.disputes.upheld to Fluvio
      // Rust nexthub-settlement will post VOID_PENDING_TRANSFER to TigerBeetle

      return updated;
    }),

  /** Reject a dispute — applies penalty fee to the initiating DFSP */
  rejectDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      disputeId: z.string(),
      resolutionNotes: z.string(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const [dispute] = await db.select()
        .from(transferDisputes)
        .where(eq(transferDisputes.id, input.disputeId))
        .limit(1);

      if (!dispute) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });
      if (!["OPEN", "UNDER_REVIEW"].includes(dispute.status)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot reject a ${dispute.status} dispute` });
      }

      const penaltyAmountKobo = Math.floor((dispute.amountKobo * PENALTY_BPS) / 10_000);

      // Penalty posting + status flip must be ATOMIC — a partial failure must
      // never leave a penalty billed against a dispute that wasn't rejected.
      // The guarded UPDATE additionally makes a duplicate reject (which would
      // double-bill the penalty) fail loud.
      const updated = await db.transaction(async (tx) => {
        const [row] = await tx.update(transferDisputes)
          .set({
            status: "REJECTED",
            resolution: "REJECTED",
            resolutionNotes: input.resolutionNotes,
            penaltyAmountKobo,
            resolvedAt: new Date(),
            updatedAt: new Date(),
          })
          .where(and(
            eq(transferDisputes.id, input.disputeId),
            sql`${transferDisputes.status} IN ('OPEN', 'UNDER_REVIEW')`,
          ))
          .returning();

        if (!row) throw new TRPCError({ code: "CONFLICT", message: "Dispute was already resolved by another request" });

        await tx.insert(feePostings).values({
          transferId: dispute.transferId,
          dfspId: dispute.initiatedByDfspId,
          feeType: "PENALTY",
          feeCategory: "DEBIT",
          amountKobo: penaltyAmountKobo,
          currency: dispute.currency,
          billedAt: new Date(),
        });

        return row;
      });

      return updated;
    }),

  /** Escalate a dispute to the scheme operator */
  escalateDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      disputeId: z.string(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(transferDisputes)
        .set({
          status: "ESCALATED",
          resolutionNotes: input.notes,
          updatedAt: new Date(),
        })
        .where(eq(transferDisputes.id, input.disputeId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });
      return updated;
    }),

  /** Get dispute dashboard statistics */
  getStats: pbacProcedure("trigger_settlement")
    .query(async () => {
      const db = await getDb();

      const [stats] = await db.select({
        totalOpen: sql<number>`sum(case when status = 'OPEN' then 1 else 0 end)::int`,
        underReview: sql<number>`sum(case when status = 'UNDER_REVIEW' then 1 else 0 end)::int`,
        upheldThisMonth: sql<number>`sum(case when status = 'UPHELD' and resolved_at >= date_trunc('month', now()) then 1 else 0 end)::int`,
        rejectedThisMonth: sql<number>`sum(case when status = 'REJECTED' and resolved_at >= date_trunc('month', now()) then 1 else 0 end)::int`,
        escalated: sql<number>`sum(case when status = 'ESCALATED' then 1 else 0 end)::int`,
        totalPenaltiesKobo: sql<number>`coalesce(sum(case when status = 'REJECTED' then penalty_amount_kobo else 0 end), 0)::bigint`,
        slaBreach: sql<number>`sum(case when status in ('OPEN', 'UNDER_REVIEW') and sla_deadline < now() then 1 else 0 end)::int`,
      }).from(transferDisputes);

      return stats;
    }),

  /** Alias for raiseDispute — accepts extended input for API compatibility */
  createDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      transferId: z.string(),
      initiatingFspId: z.string(),
      respondingFspId: z.string(),
      disputeType: z.enum(["DUPLICATE", "DUPLICATE_PAYMENT", "WRONG_AMOUNT", "UNAUTHORISED", "NOT_RECEIVED"]),
      claimedAmountMinor: z.number(),
      currency: z.string().default("NGN"),
      description: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [dispute] = await db.insert(transferDisputes).values({
        transferId: input.transferId,
        initiatedByDfspId: input.initiatingFspId,
        respondingDfspId: input.respondingFspId,
        disputeType: input.disputeType,
        amountKobo: input.claimedAmountMinor,
        currency: input.currency,
        reason: input.description ?? input.disputeType,
        status: "OPEN",
        slaDeadline: new Date(Date.now() + 48 * 3600 * 1000),
      }).returning();
      return { ...dispute, outcome: null };
    }),

  /** resolveDispute — marks a dispute as RESOLVED with an outcome */
  resolveDispute: pbacProcedure("trigger_settlement")
    .input(z.object({
      disputeId: z.string(),
      outcome: z.enum(["UPHELD", "REJECTED", "WITHDRAWN"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(transferDisputes)
        .set({
          status: "RESOLVED",
          resolution: input.outcome,
          resolutionNotes: input.notes ?? null,
          resolvedAt: new Date(),
          updatedAt: new Date(),
        })
        .where(eq(transferDisputes.id, input.disputeId))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Dispute not found" });
      return { ...updated, outcome: updated.resolution };
    }),
});