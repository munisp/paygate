/**
 * NextHub Billing Router
 *
 * Manages DFSP fee tiers, monthly invoice generation, and billing statements.
 * Four fee categories: SCHEME_FEE, INTERCHANGE, FX_MARKUP, PENALTY.
 * Three fee tier models: flat rate, tiered-by-amount, volume-based monthly discount.
 */
import { z } from "zod";
import { pbacProcedure, router } from "../_core/trpc";

// PBAC: DFSP billing reads require billing:view; tier/invoice writes require billing:manage.
const viewBilling = pbacProcedure("view_billing");
const manageBilling = pbacProcedure("manage_billing");
import { getDb } from "../db";
import {
  nexthubInvoices,
  feePostings,
  dfspFeeTiers,
  nexthubDfsps,
} from "../../drizzle/schema";
import { eq, desc, sql, and, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const nexthubBillingRouter = router({

  // ─── Fee Tiers ──────────────────────────────────────────────────────────────

  /** List fee tiers for a DFSP */
  listFeeTiers: viewBilling
    .input(z.object({ dfspId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      return db.select().from(dfspFeeTiers)
        .where(eq(dfspFeeTiers.dfspId, input.dfspId))
        .orderBy(desc(dfspFeeTiers.effectiveFrom));
    }),

  /** Create or update a fee tier for a DFSP */
  upsertFeeTier: manageBilling
    .input(z.object({
      dfspId: z.string(),
      feeType: z.enum(["SCHEME_FEE", "INTERCHANGE", "FX_MARKUP", "PENALTY"]),
      tierModel: z.enum(["flat", "tiered", "volume"]).default("flat"),
      flatRateBps: z.number().int().min(0).max(10000).optional(),
      minFeeKobo: z.number().int().min(0).optional(),
      maxFeeKobo: z.number().int().min(0).optional(),
      tierBands: z.string().optional(), // JSON
      volumeDiscountBands: z.string().optional(), // JSON
      effectiveFrom: z.date().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [tier] = await db.insert(dfspFeeTiers).values({
        dfspId: input.dfspId,
        feeType: input.feeType,
        tierModel: input.tierModel,
        flatRateBps: input.flatRateBps,
        minFeeKobo: input.minFeeKobo,
        maxFeeKobo: input.maxFeeKobo,
        tierBands: input.tierBands,
        volumeDiscountBands: input.volumeDiscountBands,
        effectiveFrom: input.effectiveFrom ?? new Date(),
      }).returning();
      return tier;
    }),

  // ─── Fee Postings ────────────────────────────────────────────────────────────

  /** List fee postings for a DFSP with date range */
  listFeePostings: viewBilling
    .input(z.object({
      dfspId: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      feeType: z.enum(["SCHEME_FEE", "INTERCHANGE", "FX_MARKUP", "PENALTY", "ALL"]).default("ALL"),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [eq(feePostings.dfspId, input.dfspId)];
      if (input.feeType !== "ALL") conditions.push(eq(feePostings.feeType, input.feeType));
      if (input.from) conditions.push(gte(feePostings.createdAt, input.from));
      if (input.to) conditions.push(lte(feePostings.createdAt, input.to));

      const [postings, countResult] = await Promise.all([
        db.select().from(feePostings)
          .where(and(...conditions))
          .orderBy(desc(feePostings.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(feePostings)
          .where(and(...conditions)),
      ]);

      return { postings, total: countResult[0]?.count ?? 0 };
    }),

  // ─── Invoices ────────────────────────────────────────────────────────────────

  /** List invoices with filters */
  listInvoices: viewBilling
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
      dfspId: z.string().optional(),
      status: z.enum(["DRAFT", "ISSUED", "PAID", "OVERDUE", "ALL"]).default("ALL"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      

      const conditions = [];
      if (input.dfspId) conditions.push(eq(nexthubInvoices.dfspId, input.dfspId));
      if (input.status !== "ALL") conditions.push(eq(nexthubInvoices.status, input.status));

      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;

      const [invoices, countResult] = await Promise.all([
        db.select().from(nexthubInvoices)
          .where(whereClause)
          .orderBy(desc(nexthubInvoices.createdAt))
          .limit(input.limit)
          .offset(input.offset),
        db.select({ count: sql<number>`count(*)::int` })
          .from(nexthubInvoices)
          .where(whereClause),
      ]);

      return { invoices, total: countResult[0]?.count ?? 0 };
    }),

  /** Get a single invoice */
  getInvoice: viewBilling
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      const [invoice] = await db.select()
        .from(nexthubInvoices)
        .where(eq(nexthubInvoices.id, input.invoiceId))
        .limit(1);

      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return invoice;
    }),

  /** Generate a monthly invoice for a DFSP */
  generateMonthlyInvoice: manageBilling
    .input(z.object({
      dfspId: z.string(),
      billingYear: z.number().int().min(2024).max(2099),
      billingMonth: z.number().int().min(1).max(12),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();

      const periodStart = new Date(input.billingYear, input.billingMonth - 1, 1);
      const periodEnd = new Date(input.billingYear, input.billingMonth, 0, 23, 59, 59);

      // Check for existing invoice
      const [existing] = await db.select({ id: nexthubInvoices.id })
        .from(nexthubInvoices)
        .where(and(
          eq(nexthubInvoices.dfspId, input.dfspId),
          gte(nexthubInvoices.billingPeriodStart, periodStart),
          lte(nexthubInvoices.billingPeriodEnd, periodEnd),
        ))
        .limit(1);

      if (existing) {
        throw new TRPCError({
          code: "CONFLICT",
          message: `Invoice already exists for ${input.dfspId} in ${input.billingYear}-${input.billingMonth} (id: ${existing.id})`,
        });
      }

      // Get DFSP name
      const [dfsp] = await db.select({ dfspName: nexthubDfsps.dfspName })
        .from(nexthubDfsps)
        .where(eq(nexthubDfsps.dfspId, input.dfspId))
        .limit(1);

      // Aggregate fee postings for the period
      const [totals] = await db.select({
        schemeFees: sql<number>`coalesce(sum(case when fee_type = 'SCHEME_FEE' then amount_kobo else 0 end), 0)::bigint`,
        interchange: sql<number>`coalesce(sum(case when fee_type = 'INTERCHANGE' then amount_kobo else 0 end), 0)::bigint`,
        fxMarkup: sql<number>`coalesce(sum(case when fee_type = 'FX_MARKUP' then amount_kobo else 0 end), 0)::bigint`,
        penalties: sql<number>`coalesce(sum(case when fee_type = 'PENALTY' then amount_kobo else 0 end), 0)::bigint`,
      })
        .from(feePostings)
        .where(and(
          eq(feePostings.dfspId, input.dfspId),
          gte(feePostings.createdAt, periodStart),
          lte(feePostings.createdAt, periodEnd),
        ));

      const totalAmount = (totals?.schemeFees ?? 0) + (totals?.interchange ?? 0) +
        (totals?.fxMarkup ?? 0) + (totals?.penalties ?? 0);

      const dueAt = new Date(periodEnd);
      dueAt.setDate(dueAt.getDate() + 30); // Net 30

      const [invoice] = await db.insert(nexthubInvoices).values({
        dfspId: input.dfspId,
        dfspName: dfsp?.dfspName ?? input.dfspId,
        billingPeriodStart: periodStart,
        billingPeriodEnd: periodEnd,
        totalSchemeFeesKobo: totals?.schemeFees ?? 0,
        totalInterchangeKobo: totals?.interchange ?? 0,
        totalFxMarkupKobo: totals?.fxMarkup ?? 0,
        totalPenaltiesKobo: totals?.penalties ?? 0,
        totalAmountKobo: totalAmount,
        status: "DRAFT",
        dueAt,
        issuedAt: new Date(),
      }).returning();

      return invoice;
    }),

  /** Issue (finalise) a draft invoice */
  issueInvoice: manageBilling
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(nexthubInvoices)
        .set({ status: "ISSUED", issuedAt: new Date(), updatedAt: new Date() })
        .where(and(eq(nexthubInvoices.id, input.invoiceId), eq(nexthubInvoices.status, "DRAFT")))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Draft invoice not found" });
      return updated;
    }),

  /** Mark an invoice as paid */
  markInvoicePaid: manageBilling
    .input(z.object({
      invoiceId: z.string(),
      tigerBeetleTransferId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      const [updated] = await db.update(nexthubInvoices)
        .set({
          status: "PAID",
          paidAt: new Date(),
          tigerBeetleInvoiceTransferId: input.tigerBeetleTransferId,
          updatedAt: new Date(),
        })
        .where(eq(nexthubInvoices.id, input.invoiceId))
        .returning();

      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      return updated;
    }),

  /** Get billing dashboard statistics */
  getStats: viewBilling
    .query(async () => {
      const db = await getDb();

      const [stats] = await db.select({
        totalInvoices: sql<number>`count(*)::int`,
        draftInvoices: sql<number>`sum(case when status = 'DRAFT' then 1 else 0 end)::int`,
        issuedInvoices: sql<number>`sum(case when status = 'ISSUED' then 1 else 0 end)::int`,
        overdueInvoices: sql<number>`sum(case when status = 'OVERDUE' then 1 else 0 end)::int`,
        totalBilledKobo: sql<number>`coalesce(sum(total_amount_kobo), 0)::bigint`,
        totalPaidKobo: sql<number>`coalesce(sum(case when status = 'PAID' then total_amount_kobo else 0 end), 0)::bigint`,
        totalOutstandingKobo: sql<number>`coalesce(sum(case when status in ('ISSUED', 'OVERDUE') then total_amount_kobo else 0 end), 0)::bigint`,
      }).from(nexthubInvoices);

      return stats;
    }),

  /** Get merchant billing statement (fee summary for a period) */
  getMerchantStatement: viewBilling
    .input(z.object({
      dfspId: z.string(),
      from: z.date(),
      to: z.date(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();

      const [summary] = await db.select({
        totalFees: sql<number>`coalesce(sum(amount_kobo), 0)::bigint`,
        schemeFees: sql<number>`coalesce(sum(case when fee_type = 'SCHEME_FEE' then amount_kobo else 0 end), 0)::bigint`,
        interchange: sql<number>`coalesce(sum(case when fee_type = 'INTERCHANGE' then amount_kobo else 0 end), 0)::bigint`,
        fxMarkup: sql<number>`coalesce(sum(case when fee_type = 'FX_MARKUP' then amount_kobo else 0 end), 0)::bigint`,
        penalties: sql<number>`coalesce(sum(case when fee_type = 'PENALTY' then amount_kobo else 0 end), 0)::bigint`,
        transactionCount: sql<number>`count(distinct transfer_id)::int`,
      })
        .from(feePostings)
        .where(and(
          eq(feePostings.dfspId, input.dfspId),
          gte(feePostings.createdAt, input.from),
          lte(feePostings.createdAt, input.to),
        ));

      return summary;
    }),

  /** getBillingSummary — aggregate billing stats for a DFSP over a period */
  getBillingSummary: viewBilling
    .input(z.object({
      dfspId: z.string().optional(),
      periodStart: z.number().optional(),
      periodEnd: z.number().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      const from = input.from ?? (input.periodStart ? new Date(input.periodStart) : new Date(Date.now() - 30 * 24 * 3600 * 1000));
      const to = input.to ?? (input.periodEnd ? new Date(input.periodEnd) : new Date());
      const conditions = [
        gte(feePostings.createdAt, from),
        lte(feePostings.createdAt, to),
      ];
      if (input.dfspId) conditions.push(eq(feePostings.dfspId, input.dfspId));
      const [summary] = await db.select({
        totalSchemeFeeMinor: sql<number>`coalesce(sum(case when fee_type = 'SCHEME_FEE' then amount_kobo else 0 end), 0)::bigint`,
        totalInterchangeMinor: sql<number>`coalesce(sum(case when fee_type = 'INTERCHANGE' then amount_kobo else 0 end), 0)::bigint`,
        totalFxMarkupMinor: sql<number>`coalesce(sum(case when fee_type = 'FX_MARKUP' then amount_kobo else 0 end), 0)::bigint`,
        totalPenaltyMinor: sql<number>`coalesce(sum(case when fee_type = 'PENALTY' then amount_kobo else 0 end), 0)::bigint`,
        totalFeesKobo: sql<number>`coalesce(sum(amount_kobo), 0)::bigint`,
        netKobo: sql<number>`coalesce(sum(case when fee_category = 'DEBIT' then -amount_kobo else amount_kobo end), 0)::bigint`,
      }).from(feePostings)
        .where(and(...conditions));
      // pg returns bigint aggregates as strings — coerce to numbers for the API contract
      return {
        totalSchemeFeeMinor: Number(summary.totalSchemeFeeMinor),
        totalInterchangeMinor: Number(summary.totalInterchangeMinor),
        totalFxMarkupMinor: Number(summary.totalFxMarkupMinor),
        totalPenaltyMinor: Number(summary.totalPenaltyMinor),
        totalFeesKobo: Number(summary.totalFeesKobo),
        netKobo: Number(summary.netKobo),
      };
    }),
});