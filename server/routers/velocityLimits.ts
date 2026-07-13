/**
 * velocityLimits.ts — Full DB-backed velocity limits router.
 */
import { router, protectedProcedure } from '../_core/trpc';
import { z } from 'zod';
import { getUserByOpenId, getMerchantByOwnerId, getDb } from '../db';
import * as schema from '../../drizzle/schema';
import { eq, and, desc, count } from 'drizzle-orm';

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

export const velocityLimitsRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.velocityLimitConfigs)
          .where(eq(schema.velocityLimitConfigs.merchantId, merchantId))
          .orderBy(desc(schema.velocityLimitConfigs.createdAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.velocityLimitConfigs)
          .where(eq(schema.velocityLimitConfigs.merchantId, merchantId)),
      ]);
      return { rows, total, page: input.page, pageSize: input.pageSize };
    }),

  create: protectedProcedure
    .input(z.object({
      channel: z.string(),
      limitType: z.string(),
      maxCount: z.number().optional(),
      maxAmountKobo: z.number().optional(),
      singleTxMaxKobo: z.number().optional(),
      riskTier: z.string().default('standard'),
      windowSeconds: z.number().default(3600),
      effectiveFrom: z.string(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const [row] = await (await getDbInstance()).insert(schema.velocityLimitConfigs).values({
        ...input,
        merchantId,
        effectiveFrom: new Date(input.effectiveFrom),
        setBy: ctx.user!.openId,
        isActive: true,
      }).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      isActive: z.boolean().optional(),
      maxCount: z.number().optional(),
      maxAmountKobo: z.number().optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const { id, ...updates } = input;
      const [row] = await (await getDbInstance()).update(schema.velocityLimitConfigs)
        .set({ ...updates, updatedAt: new Date() })
        .where(and(eq(schema.velocityLimitConfigs.id, id), eq(schema.velocityLimitConfigs.merchantId, merchantId)))
        .returning();
      return row;
    }),

  listBreaches: protectedProcedure
    .input(z.object({
      page: z.number().min(1).default(1),
      pageSize: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user!.openId);
      const offset = (input.page - 1) * input.pageSize;
      const [rows, [{ total }]] = await Promise.all([
        (await getDbInstance()).select().from(schema.velocityBreaches)
          .where(eq(schema.velocityBreaches.merchantId, merchantId))
          .orderBy(desc(schema.velocityBreaches.breachedAt))
          .limit(input.pageSize).offset(offset),
        (await getDbInstance()).select({ total: count() }).from(schema.velocityBreaches)
          .where(eq(schema.velocityBreaches.merchantId, merchantId)),
      ]);
      return { rows, total };
    }),
});
