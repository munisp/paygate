/**
 * interchange.ts — Full DB-backed interchange fee router.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count, sum } from 'drizzle-orm';

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

export const interchangeRouter = router({
  getSchedule: protectedProcedure
    .input(z.object({
      scheme: z.enum(['visa', 'mastercard', 'verve', 'amex']).optional(),
      channel: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: any[] = [eq(schema.interchangeSchedule.isActive, true)];
      if (input.scheme) conditions.push(eq(schema.interchangeSchedule.scheme, input.scheme));
      if (input.channel) conditions.push(eq(schema.interchangeSchedule.channel, input.channel));
      const rows = await (await getDbInstance()).select().from(schema.interchangeSchedule)
        .where(and(...conditions))
        .orderBy(schema.interchangeSchedule.scheme, schema.interchangeSchedule.channel);
      return { rows, total: rows.length };
    }),

  listFeeRecords: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
      billingPeriod: z.string().optional(),
      scheme: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const conditions: any[] = [eq(schema.interchangeFeeRecords.merchantId, merchantId)];
      if (input.billingPeriod) conditions.push(eq(schema.interchangeFeeRecords.billingPeriod, input.billingPeriod));
      if (input.scheme) conditions.push(eq(schema.interchangeFeeRecords.scheme, input.scheme));
      const [rows, [{ total }], [{ totalFee }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.interchangeFeeRecords)
          .where(and(...conditions))
          .orderBy(desc(schema.interchangeFeeRecords.createdAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.interchangeFeeRecords).where(and(...conditions)),
        (await getDbInstance()).select({ totalFee: sum(schema.interchangeFeeRecords.feeKobo) }).from(schema.interchangeFeeRecords).where(and(...conditions)),
      ]);
      return { rows, total, totalFeeKobo: Number(totalFee ?? 0), page: input.page, pageSize: input.pageSize };
    }),

  summary: protectedProcedure
    .input(z.object({ billingPeriod: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const period = input.billingPeriod ?? new Date().toISOString().substring(0, 7);
      const rows = await (await getDbInstance()).select({
        scheme: schema.interchangeFeeRecords.scheme,
        totalFee: sum(schema.interchangeFeeRecords.feeKobo),
        txCount: count(),
      })
        .from(schema.interchangeFeeRecords)
        .where(and(eq(schema.interchangeFeeRecords.merchantId, merchantId), eq(schema.interchangeFeeRecords.billingPeriod, period)))
        .groupBy(schema.interchangeFeeRecords.scheme);
      return { period, byScheme: rows };
    }),
});
