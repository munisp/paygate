/**
 * regulatoryReports.ts — Full DB-backed regulatory reports router.
 * Handles CBN Form A/B/C generation, submission, and acknowledgement.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count, gte, lte } from 'drizzle-orm';
import { logger } from '../logger';

async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error('User not found');
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new Error('Merchant not found');
  return merchant.id;
}

async function getDbInstance() {
  const d = await getDb();
  if (!d) throw new Error('Database unavailable');
  return d;
}

export const regulatoryReportsRouter = router({
  /** List regulatory reports */
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      status: z.string().optional(),
      reportType: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(schema.regulatoryReports.merchantId, merchantId)];
      if (input.status) conditions.push(eq(schema.regulatoryReports.status, input.status));
      if (input.reportType) conditions.push(eq(schema.regulatoryReports.reportType, input.reportType));
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.regulatoryReports)
          .where(and(...conditions))
          .orderBy(desc(schema.regulatoryReports.createdAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.regulatoryReports).where(and(...conditions)),
      ]);
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  /** List submission history for a report */
  listSubmissions: protectedProcedure
    .input(z.object({
      reportId: z.string().optional(),
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(schema.regulatoryReportSubmissions.merchantId, merchantId)];
      if (input.reportId) conditions.push(eq(schema.regulatoryReportSubmissions.reportId, input.reportId));
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.regulatoryReportSubmissions)
          .where(and(...conditions))
          .orderBy(desc(schema.regulatoryReportSubmissions.submittedAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.regulatoryReportSubmissions).where(and(...conditions)),
      ]);
      return { rows, total };
    }),

  /** Get upcoming report deadlines */
  upcomingDeadlines: protectedProcedure
    .input(z.object({ daysAhead: z.number().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const now = new Date();
      const future = new Date(now.getTime() + input.daysAhead * 86400_000);
      const rows = await (await getDbInstance()).select().from(schema.regulatoryReports)
        .where(and(
          eq(schema.regulatoryReports.merchantId, merchantId),
          eq(schema.regulatoryReports.status, 'pending'),
        ))
        .orderBy(schema.regulatoryReports.createdAt)
        .limit(20);
      return rows;
    }),

  /** Generate a new regulatory report (Form A/B/C) */
  generate: protectedProcedure
    .input(z.object({
      reportType: z.enum(['CBN_MONTHLY', 'CBN_QUARTERLY', 'NFIU_STR', 'NFIU_CTR']).default('CBN_MONTHLY'),
      period: z.string(),  // YYYY-MM or YYYY-Q1
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [report] = await (await getDbInstance()).insert(schema.regulatoryReports).values({
        merchantId,
        reportType: input.reportType,
        period: input.period,
        regulator: input.reportType.startsWith('NFIU') ? 'NFIU' : 'CBN',
        status: 'pending',
        notes: input.notes,
      }).returning();
      return report;
    }),

  /** Generate CBN Form A */
  generateFormA: protectedProcedure
    .input(z.object({ period: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [report] = await (await getDbInstance()).insert(schema.regulatoryReports).values({
        merchantId, reportType: 'CBN_FORM_A', period: input.period, regulator: 'CBN', status: 'pending',
      }).returning();
      return report;
    }),

  /** Generate CBN Form B */
  generateFormB: protectedProcedure
    .input(z.object({ period: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [report] = await (await getDbInstance()).insert(schema.regulatoryReports).values({
        merchantId, reportType: 'CBN_FORM_B', period: input.period, regulator: 'CBN', status: 'pending',
      }).returning();
      return report;
    }),

  /** Generate CBN Form C */
  generateFormC: protectedProcedure
    .input(z.object({ period: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [report] = await (await getDbInstance()).insert(schema.regulatoryReports).values({
        merchantId, reportType: 'CBN_FORM_C', period: input.period, regulator: 'CBN', status: 'pending',
      }).returning();
      return report;
    }),

  /** Acknowledge a submission (mark as received by regulator) */
  acknowledgeSubmission: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      regulatorRef: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const db = await getDbInstance();
      const [sub] = await db.update(schema.regulatoryReportSubmissions)
        .set({ status: 'acknowledged', acknowledgedAt: new Date(), regulatorRef: input.regulatorRef })
        .where(and(
          eq(schema.regulatoryReportSubmissions.id, input.submissionId),
          eq(schema.regulatoryReportSubmissions.merchantId, merchantId),
        ))
        .returning();
      // Update parent report concurrently (fire-and-forget style — non-blocking to caller)
      if (sub) {
        db.update(schema.regulatoryReports)
          .set({ status: 'acknowledged', acknowledgedAt: new Date() })
          .where(eq(schema.regulatoryReports.id, sub.reportId))
          .catch((e) => logger.error("[regulatoryReports] parent report acknowledgement persistence failed", {
            reportId: sub.reportId,
            error: e instanceof Error ? e.message : String(e),
          })); // best-effort; submission is already acknowledged
      }
      return { success: true };
    }),

  /** Retry a failed submission */
  retrySubmission: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [report] = await (await getDbInstance()).select().from(schema.regulatoryReports)
        .where(and(eq(schema.regulatoryReports.id, input.reportId), eq(schema.regulatoryReports.merchantId, merchantId)))
        .limit(1);
      if (!report) throw new Error('Report not found');
      await (await getDbInstance()).update(schema.regulatoryReports)
        .set({ status: 'pending', updatedAt: new Date() })
        .where(eq(schema.regulatoryReports.id, input.reportId));
      return { success: true };
    }),
});
