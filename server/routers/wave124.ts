/**
 * Wave 124 — Definitive Production-Readiness Router
 * Covers all remaining uncovered DB tables and closes every audit gap.
 * All column names verified against drizzle/schema.ts.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import * as schema from "../../drizzle/schema";
import { eq, desc, and, gte, lte, like, sql, asc, inArray, gt } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { withIdempotency } from "../idempotency";

// ─── R4 security helpers ─────────────────────────────────────────────────────
/** Platform-admin gate: DB re-check users.role === 'admin' (adminRouter.ts:25-38 pattern). */
async function requirePlatformAdmin(openId: string): Promise<void> {
  const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
    .where(eq(schema.users.openId, openId)).limit(1);
  if (!caller || caller.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

/** Resolve the caller's user row from the session (fail closed). */
async function requireCtxUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  return user;
}

/** Resolve the caller's merchant server-side (chargebackLifecycle.ts resolveMerchantId pattern). */
async function resolveCtxMerchant(openId: string) {
  const user = await requireCtxUser(openId);
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

/**
 * Merchant scoping for list/stats reads: platform admins may filter by any
 * merchantId; every other caller is hard-scoped to their OWN merchant so a
 * client-supplied merchantId can never read another merchant's rows.
 */
async function applyMerchantScope(openId: string, requestedMerchantId: string | undefined, column: any, conditions: any[]): Promise<void> {
  const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
    .where(eq(schema.users.openId, openId)).limit(1);
  if (caller?.role === "admin") {
    if (requestedMerchantId) conditions.push(eq(column, requestedMerchantId));
    return;
  }
  const merchant = await resolveCtxMerchant(openId);
  conditions.push(eq(column, merchant.id));
}

// ─── 1. Bill Payments ─────────────────────────────────────────────────────────
export const billPaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      // R4: client userId filter removed — users may only ever list their OWN bill payments.
      const user = await requireCtxUser(ctx.user.openId);
      const conditions: any[] = [eq(schema.billPayments.userId, user.id)];
      if (input.status) conditions.push(eq(schema.billPayments.status, input.status as any));
      const rows = await db.select().from(schema.billPayments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.billPayments.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.billPayments)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: ownership check — users may only read their OWN bill payments.
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.select().from(schema.billPayments)
        .where(and(eq(schema.billPayments.id, input.id), eq(schema.billPayments.userId, user.id)));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Bill payment not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      category: z.string(),
      billerCode: z.string(),
      billerName: z.string(),
      customerReference: z.string(),
      amountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4 F1-3: userId/walletId are resolved server-side from the session —
      // the client can no longer create bill payments for other users/wallets.
      const user = await requireCtxUser(ctx.user.openId);
      const [wallet] = await db.select().from(schema.consumerWallets)
        .where(and(
          eq(schema.consumerWallets.userId, user.id),
          eq(schema.consumerWallets.currency, input.currency),
        ))
        .limit(1);
      if (!wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found. Please top up first." });
      const [row] = await db.insert(schema.billPayments).values({
        userId: user.id,
        walletId: wallet.id,
        category: input.category,
        billerCode: input.billerCode,
        billerName: input.billerName,
        customerReference: input.customerReference,
        amountKobo: input.amountKobo,
        currency: input.currency,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["processing", "completed", "failed"]),
      providerRef: z.string().optional(),
      failureReason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4 F1-3: ownership check + transition guard. The row's userId must match
      // the session user, and only non-terminal rows may transition
      // (pending → processing/completed/failed; processing → completed/failed).
      // Terminal states are not re-enterable. ('cancelled' is not enum-valid for
      // bill_payments and is therefore not writable here.)
      const user = await requireCtxUser(ctx.user.openId);
      const { id, ...data } = input;
      const allowedFrom: Array<"pending" | "processing" | "completed" | "failed"> =
        input.status === "processing" ? ["pending"] : ["pending", "processing"];
      const [row] = await db.update(schema.billPayments)
        .set({ ...data, updatedAt: new Date() } as any)
        .where(and(
          eq(schema.billPayments.id, id),
          eq(schema.billPayments.userId, user.id),
          inArray(schema.billPayments.status, allowedFrom),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Bill payment not found, not owned by you, or in a terminal state" });
      return row;
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      pending: sql<number>`count(*) filter (where status = 'pending')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
      totalAmountKobo: sql<number>`coalesce(sum(amount_kobo) filter (where status = 'completed'), 0)`,
    }).from(schema.billPayments);
    return stats;
  }),
});

// ─── 2. Carbon Credits ────────────────────────────────────────────────────────
export const carbonCreditsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      merchantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.carbonCredits.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.carbonCredits.status as any, input.status));
      const rows = await db.select().from(schema.carbonCredits)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.carbonCredits.createdAt))
        .limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.carbonCredits.creditId, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.carbonCredits.merchantId, conditions);
      const [row] = await db.select().from(schema.carbonCredits)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Carbon credit not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      projectId: z.string(),
      projectName: z.string(),
      tonnes: z.string(),
      pricePerTonneKobo: z.number().int().positive(),
      totalKobo: z.number().int().positive(),
      vintage: z.string().optional(),
      standard: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.insert(schema.carbonCredits).values({
        ...input,
        merchantId: merchant.id,
        creditId: `CC-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: "pending",
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  retire: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership + status guard — only the owning merchant may retire, and
      // a credit cannot be retired twice.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.carbonCredits)
        .set({ status: "retired" as any, retiredAt: new Date() } as any)
        .where(and(
          eq(schema.carbonCredits.creditId, input.id),
          eq(schema.carbonCredits.merchantId, merchant.id),
          sql`${schema.carbonCredits.status} <> 'retired'`,
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Carbon credit not found, not owned by you, or already retired" });
      return row;
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      retired: sql<number>`count(*) filter (where status = 'retired')`,
      totalKobo: sql<number>`coalesce(sum(total_kobo), 0)`,
    }).from(schema.carbonCredits);
    return stats;
  }),
});

// ─── 3. Consumer Finance Loans ────────────────────────────────────────────────
export const consumerFinanceLoansRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      customerId: z.string().optional(),
      merchantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.consumerFinanceLoans.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.consumerFinanceLoans.status as any, input.status));
      if (input.customerId) conditions.push(eq(schema.consumerFinanceLoans.customerId, input.customerId));
      const rows = await db.select().from(schema.consumerFinanceLoans)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.consumerFinanceLoans.createdAt))
        .limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.consumerFinanceLoans.loanId, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.consumerFinanceLoans.merchantId, conditions);
      const [row] = await db.select().from(schema.consumerFinanceLoans)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found" });
      return row;
    }),

  applyLoan: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      amountKobo: z.number().int().positive(),
      termDays: z.number().min(1).max(730).default(30),
      rateAnnualPct: z.string().default("5"),
      dueDate: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.insert(schema.consumerFinanceLoans).values({
        ...input,
        merchantId: merchant.id,
        loanId: `LOAN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        outstandingKobo: input.amountKobo,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  approve: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4 F7#9: loan approval is a platform operation — platform-admin gate
      // (DB re-check of users.role) + status guard so only pending applications
      // can be activated.
      await requirePlatformAdmin(ctx.user.openId);
      const [row] = await db.update(schema.consumerFinanceLoans)
        .set({ status: "active" as any, updatedAt: new Date() } as any)
        .where(and(
          eq(schema.consumerFinanceLoans.loanId, input.id),
          inArray(schema.consumerFinanceLoans.status, ["pending", "pending_review"]),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "CONFLICT", message: "Loan not found or not in a pending state" });
      return row;
    }),

  reject: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4 F7#9: platform-admin gate + status guard (only pending loans can be rejected).
      await requirePlatformAdmin(ctx.user.openId);
      const [row] = await db.update(schema.consumerFinanceLoans)
        .set({ status: "rejected" as any, updatedAt: new Date() } as any)
        .where(and(
          eq(schema.consumerFinanceLoans.loanId, input.id),
          inArray(schema.consumerFinanceLoans.status, ["pending", "pending_review"]),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "CONFLICT", message: "Loan not found or not in a pending state" });
      return row;
    }),

  bulkApprove: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4 F7#9: platform-admin gate + status guard; reports actually-updated rows.
      await requirePlatformAdmin(ctx.user.openId);
      const rows = await db.update(schema.consumerFinanceLoans)
        .set({ status: "active" as any, updatedAt: new Date() } as any)
        .where(and(
          inArray(schema.consumerFinanceLoans.loanId, input.ids),
          inArray(schema.consumerFinanceLoans.status, ["pending", "pending_review"]),
        ))
        .returning({ loanId: schema.consumerFinanceLoans.loanId });
      return { updated: rows.length, skipped: input.ids.length - rows.length };
    }),
  bulkReject: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      // R4 F7#9: platform-admin gate + status guard; reports actually-updated rows.
      await requirePlatformAdmin(ctx.user.openId);
      const rows = await db.update(schema.consumerFinanceLoans)
        .set({ status: "rejected" as any, updatedAt: new Date() } as any)
        .where(and(
          inArray(schema.consumerFinanceLoans.loanId, input.ids),
          inArray(schema.consumerFinanceLoans.status, ["pending", "pending_review"]),
        ))
        .returning({ loanId: schema.consumerFinanceLoans.loanId });
      return { updated: rows.length, skipped: input.ids.length - rows.length };
    }),
  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where status = 'pending')`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      totalAmountKobo: sql<number>`coalesce(sum(amount_kobo), 0)`,
    }).from(schema.consumerFinanceLoans);
    return stats;
  }),
});

// ─── 4. Coupons ───────────────────────────────────────────────────────────────
export const couponsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      isActive: z.boolean().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const conditions: any[] = [];
      if (input.isActive !== undefined) conditions.push(eq(schema.coupons.isActive, input.isActive));
      if (input.search) conditions.push(like(schema.coupons.code, `%${input.search.toUpperCase()}%`));
      const rows = await db.select().from(schema.coupons)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.coupons.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.coupons)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(schema.coupons)
        .where(eq(schema.coupons.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Coupon not found" });
      return row;
    }),

  validate: publicProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const [coupon] = await db.select().from(schema.coupons)
        .where(and(
          eq(schema.coupons.code, input.code.toUpperCase()),
          eq(schema.coupons.isActive, true),
        ));
      if (!coupon) return { valid: false, reason: "Coupon not found or inactive" };
      const now = new Date();
      if (coupon.validUntil && new Date(coupon.validUntil) < now) return { valid: false, reason: "Coupon has expired" };
      if (coupon.validFrom && new Date(coupon.validFrom) > now) return { valid: false, reason: "Coupon not yet active" };
      if (coupon.usageLimit && coupon.usageCount >= coupon.usageLimit) return { valid: false, reason: "Usage limit reached" };
      return { valid: true, coupon };
    }),

  create: protectedProcedure
    .input(z.object({
      code: z.string().min(3).max(50),
      type: z.enum(["percent", "fixed", "free_transfer"]),
      value: z.number().positive(),
      minAmountKobo: z.number().int().min(0).default(0),
      maxDiscountKobo: z.number().int().optional(),
      usageLimit: z.number().optional(),
      perUserLimit: z.number().default(1),
      validFrom: z.string(),
      validUntil: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: coupon creation mints discount value — platform-admin gated (spec #1/#3).
      await requirePlatformAdmin(ctx.user.openId);
      const [row] = await db.insert(schema.coupons).values({
        ...input,
        id: `CPN-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        code: input.code.toUpperCase(),
        isActive: true,
        usageCount: 0,
        validFrom: new Date(input.validFrom),
        validUntil: new Date(input.validUntil),
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      isActive: z.boolean().optional(),
      usageLimit: z.number().optional(),
      validUntil: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      const { id, validUntil, ...data } = input;
      const [row] = await db.update(schema.coupons)
        .set({ ...data, ...(validUntil ? { validUntil: new Date(validUntil) } : {}) } as any)
        .where(eq(schema.coupons.id, id))
        .returning();
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.delete(schema.coupons).where(eq(schema.coupons.id, input.id));
      return { success: true };
    }),

  bulkDeactivate: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.update(schema.coupons)
        .set({ isActive: false } as any)
        .where(inArray(schema.coupons.id, input.ids));
      return { updated: input.ids.length };
    }),
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.delete(schema.coupons).where(inArray(schema.coupons.id, input.ids));
      return { deleted: input.ids.length };
    }),
  bulkActivate: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.update(schema.coupons)
        .set({ isActive: true } as any)
        .where(inArray(schema.coupons.id, input.ids));
      return { updated: input.ids.length };
    }),
  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where is_active = true)`,
      totalRedemptions: sql<number>`coalesce(sum(usage_count), 0)`,
    }).from(schema.coupons);
    return stats;
  }),
});

// ─── 5. Device Push Tokens ────────────────────────────────────────────────────
export const devicePushTokensRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      userId: z.number().optional(),
      platform: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers only ever see their OWN device tokens.
      const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
        .where(eq(schema.users.openId, ctx.user.openId)).limit(1);
      if (caller?.role === "admin") {
        if (input.merchantId) conditions.push(eq(schema.devicePushTokens.merchantId, input.merchantId));
        if (input.userId) conditions.push(eq(schema.devicePushTokens.userId, input.userId));
      } else {
        const user = await requireCtxUser(ctx.user.openId);
        conditions.push(eq(schema.devicePushTokens.userId, user.id));
      }
      if (input.platform) conditions.push(eq(schema.devicePushTokens.platform, input.platform));
      return db.select().from(schema.devicePushTokens)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.devicePushTokens.createdAt));
    }),

  register: protectedProcedure
    .input(z.object({
      token: z.string(),
      platform: z.string().default("fcm"),
      deviceId: z.string().optional(),
      appVersion: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: userId/merchantId resolved server-side from the session
      // (routers.ts registerPushToken pattern: 'consumer' when no merchant).
      const user = await requireCtxUser(ctx.user.openId);
      const merchant = await getMerchantByOwnerId(user.id);
      const merchantId = merchant?.id ?? "consumer";
      // Upsert by token
      const existing = await db.select().from(schema.devicePushTokens)
        .where(eq(schema.devicePushTokens.token, input.token));
      if (existing.length > 0) {
        const [row] = await db.update(schema.devicePushTokens)
          .set({ merchantId, userId: user.id, isActive: true, updatedAt: new Date() } as any)
          .where(eq(schema.devicePushTokens.token, input.token))
          .returning();
        return row;
      }
      const [row] = await db.insert(schema.devicePushTokens).values({
        ...input,
        merchantId,
        userId: user.id,
        isActive: true,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  deregister: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — users may only deregister their OWN tokens.
      const user = await requireCtxUser(ctx.user.openId);
      await db.update(schema.devicePushTokens)
        .set({ isActive: false, updatedAt: new Date() } as any)
        .where(and(
          eq(schema.devicePushTokens.token, input.token),
          eq(schema.devicePushTokens.userId, user.id),
        ));
      return { success: true };
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where is_active = true)`,
      fcm: sql<number>`count(*) filter (where platform = 'fcm')`,
      apns: sql<number>`count(*) filter (where platform = 'apns')`,
      web: sql<number>`count(*) filter (where platform = 'web')`,
    }).from(schema.devicePushTokens);
    return stats;
  }),
});

// ─── 6. Fraud Alert Comments ──────────────────────────────────────────────────
export const fraudAlertCommentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      alertId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ input }) => {
      return db.select().from(schema.fraudAlertComments)
        .where(eq(schema.fraudAlertComments.alertId, input.alertId))
        .orderBy(asc(schema.fraudAlertComments.createdAt))
        .limit(input.limit);
    }),

  add: protectedProcedure
    .input(z.object({
      alertId: z.string(),
      body: z.string().min(1).max(2000),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId + authorName resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.insert(schema.fraudAlertComments).values({
        id: `FAC-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        alertId: input.alertId,
        merchantId: merchant.id,
        authorName: user.name ?? user.email ?? `user:${user.id}`,
        body: input.body,
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — merchants may only delete comments on their own alerts.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      await db.delete(schema.fraudAlertComments)
        .where(and(
          eq(schema.fraudAlertComments.id, input.id),
          eq(schema.fraudAlertComments.merchantId, merchant.id),
        ));
      return { success: true };
    }),
});

// ─── 7. Idempotency Requests ──────────────────────────────────────────────────
export const idempotencyRequestsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      merchantId: z.string().optional(),
      operation: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.idempotencyRequests.merchantId, conditions);
      if (input.operation) conditions.push(eq(schema.idempotencyRequests.operation, input.operation));
      const rows = await db.select().from(schema.idempotencyRequests)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.idempotencyRequests.createdAt))
        .limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      expired: sql<number>`count(*) filter (where expires_at < now())`,
      active: sql<number>`count(*) filter (where expires_at >= now())`,
    }).from(schema.idempotencyRequests);
    return stats;
  }),

  purgeExpired: protectedProcedure.mutation(async ({ ctx }) => {
    // R4: platform-maintenance op — platform-admin gated.
    await requirePlatformAdmin(ctx.user.openId);
    await db.delete(schema.idempotencyRequests)
      .where(lte(schema.idempotencyRequests.expiresAt, new Date()));
    return { purged: true };
  }),
});

// ─── 8. Insurance Policies ────────────────────────────────────────────────────
export const insurancePoliciesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      customerId: z.string().optional(),
      merchantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.insurancePolicies.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.insurancePolicies.status as any, input.status));
      if (input.customerId) conditions.push(eq(schema.insurancePolicies.customerId, input.customerId));
      const rows = await db.select().from(schema.insurancePolicies)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.insurancePolicies.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.insurancePolicies)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.insurancePolicies.policyId, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.insurancePolicies.merchantId, conditions);
      const [row] = await db.select().from(schema.insurancePolicies)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      productId: z.string(),
      productName: z.string(),
      provider: z.string(),
      premiumKobo: z.number().int().positive(),
      coverageType: z.string(),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.insert(schema.insurancePolicies).values({
        ...input,
        merchantId: merchant.id,
        policyId: `POL-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`,
        status: "active",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — only the owning merchant may cancel a policy.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.insurancePolicies)
        .set({ status: "cancelled" as any })
        .where(and(
          eq(schema.insurancePolicies.policyId, input.id),
          eq(schema.insurancePolicies.merchantId as any, merchant.id),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Policy not found or not owned by you" });
      return row;
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      expired: sql<number>`count(*) filter (where status = 'expired')`,
      cancelled: sql<number>`count(*) filter (where status = 'cancelled')`,
      totalPremiumKobo: sql<number>`coalesce(sum(premium_kobo) filter (where status = 'active'), 0)`,
    }).from(schema.insurancePolicies);
    return stats;
  }),
});

// ─── 9. Loan Repayments ───────────────────────────────────────────────────────
export const loanRepaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      loanId: z.string().optional(),
      merchantId: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.loanRepayments.merchantId, conditions);
      if (input.loanId) conditions.push(eq(schema.loanRepayments.loanId, input.loanId));
      const rows = await db.select().from(schema.loanRepayments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.loanRepayments.createdAt))
        .limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  record: protectedProcedure
    .input(z.object({
      loanId: z.string(),
      amountKobo: z.number().int().positive(),
      transferId: z.string().optional(),
      method: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4 F1-4a: merchant resolved server-side from the session; the repayment
      // must reference an ACTIVE loan owned by the caller's merchant — clients
      // can no longer record repayments against arbitrary merchants/loans.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [loan] = await db.select().from(schema.consumerFinanceLoans)
        .where(and(
          eq(schema.consumerFinanceLoans.loanId, input.loanId),
          eq(schema.consumerFinanceLoans.merchantId, merchant.id),
        ))
        .limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found for this merchant" });
      if (loan.status !== "active") {
        throw new TRPCError({ code: "CONFLICT", message: `Repayments can only be recorded against an active loan (current status: ${loan.status})` });
      }
      const [row] = await db.insert(schema.loanRepayments).values({
        loanId: input.loanId,
        merchantId: merchant.id,
        amountKobo: input.amountKobo,
        transferId: input.transferId ?? null,
        method: input.method ?? null,
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  stats: protectedProcedure
    .input(z.object({ loanId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [];
      await applyMerchantScope(ctx.user.openId, undefined, schema.loanRepayments.merchantId, conditions);
      if (input.loanId) conditions.push(eq(schema.loanRepayments.loanId, input.loanId));
      const [stats] = await db.select({
        total: sql<number>`count(*)`,
        totalAmountKobo: sql<number>`coalesce(sum(amount_kobo), 0)`,
      }).from(schema.loanRepayments)
        .where(conditions.length ? and(...conditions) : undefined);
      return stats;
    }),

  // markPaid is a semantic alias for record — used by the LoanRepayments UI
  markPaid: protectedProcedure
    .input(z.object({
      loanId: z.string(),
      amountKobo: z.number().int().positive(),
      paymentReference: z.string().min(1),
      method: z.string().optional().default("manual"),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4 F1-4a: merchant resolved server-side; ownership + status guard — the
      // repayment can only be recorded against an ACTIVE loan owned by the
      // caller's merchant (loan_repayments has no scheduled/pending status
      // column, so the guard is enforced on the parent loan); a non-empty
      // paymentReference is REQUIRED so every "paid" repayment is traceable to
      // a real external payment (spec #3).
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [loan] = await db.select().from(schema.consumerFinanceLoans)
        .where(and(
          eq(schema.consumerFinanceLoans.loanId, input.loanId),
          eq(schema.consumerFinanceLoans.merchantId, merchant.id),
        ))
        .limit(1);
      if (!loan) throw new TRPCError({ code: "NOT_FOUND", message: "Loan not found for this merchant" });
      if (loan.status !== "active") {
        throw new TRPCError({ code: "CONFLICT", message: `Repayments can only be marked paid against an active loan (current status: ${loan.status})` });
      }
      const [row] = await db.insert(schema.loanRepayments).values({
        loanId: input.loanId,
        merchantId: merchant.id,
        amountKobo: input.amountKobo,
        transferId: input.paymentReference,
        method: input.method ?? "manual",
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),
});

// ─── 10. POS Terminals ────────────────────────────────────────────────────────
export const posTerminalsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      merchantId: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.posTerminals.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.posTerminals.status, input.status as any));
      if (input.search) conditions.push(like(schema.posTerminals.serialNumber, `%${input.search}%`));
      const rows = await db.select().from(schema.posTerminals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.posTerminals.createdAt as any))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.posTerminals)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.posTerminals.id, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.posTerminals.merchantId, conditions);
      const [row] = await db.select().from(schema.posTerminals)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found" });
      return row;
    }),

  provision: protectedProcedure
    .input(z.object({
      serialNumber: z.string(),
      model: z.string().default("soundbox_basic"),
      label: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId/tenantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.insert(schema.posTerminals).values({
        ...input,
        merchantId: merchant.id,
        tenantId: merchant.tenantId,
        id: `pos_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "active",
        audioAlertsEnabled: true,
        audioLanguage: "en",
        totalTransactions: 0,
        totalVolumeKobo: 0,
      } as any).returning();
      return row;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["active", "inactive", "maintenance", "stolen"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — only the owning merchant may change terminal status.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.posTerminals)
        .set({ status: input.status as any })
        .where(and(
          eq(schema.posTerminals.id, input.id),
          eq(schema.posTerminals.merchantId, merchant.id),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Terminal not found or not owned by you" });
      return row;
    }),

  heartbeat: protectedProcedure
    .input(z.object({ id: z.string(), firmwareVersion: z.string().optional(), ipAddress: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — a caller may only heartbeat their own merchant's terminals.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.posTerminals)
        .set({
          lastHeartbeatAt: new Date(),
          ...(input.firmwareVersion ? { firmwareVersion: input.firmwareVersion } : {}),
          ...(input.ipAddress ? { ipAddress: input.ipAddress } : {}),
        } as any)
        .where(and(
          eq(schema.posTerminals.id, input.id),
          eq(schema.posTerminals.merchantId, merchant.id),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Terminal not found or not owned by you" });
      return row;
    }),

  getTransactions: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      limit: z.number().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      return db.select().from(schema.posTransactions)
        .where(eq(schema.posTransactions.terminalId, input.terminalId))
        .orderBy(desc(schema.posTransactions.createdAt as any))
        .limit(input.limit);
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      inactive: sql<number>`count(*) filter (where status = 'inactive')`,
      maintenance: sql<number>`count(*) filter (where status = 'maintenance')`,
    }).from(schema.posTerminals);
    return stats;
  }),
});

// ─── 11. POS Transactions ─────────────────────────────────────────────────────
export const posTransactionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      terminalId: z.string().optional(),
      merchantId: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.posTransactions.merchantId, conditions);
      if (input.terminalId) conditions.push(eq(schema.posTransactions.terminalId, input.terminalId));
      if (input.status) conditions.push(eq(schema.posTransactions.status, input.status));
      const rows = await db.select().from(schema.posTransactions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.posTransactions.createdAt as any))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.posTransactions)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.posTransactions.id, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.posTransactions.merchantId, conditions);
      const [row] = await db.select().from(schema.posTransactions)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "POS transaction not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      amountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
      channel: z.enum(["qr", "card", "nip", "ussd"]).default("card"),
      maskedPan: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side; the terminal must belong to the
      // caller's merchant — clients can no longer fabricate completed POS
      // transactions against arbitrary merchants.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [terminal] = await db.select().from(schema.posTerminals)
        .where(and(
          eq(schema.posTerminals.id, input.terminalId),
          eq(schema.posTerminals.merchantId, merchant.id),
        ))
        .limit(1);
      if (!terminal) throw new TRPCError({ code: "NOT_FOUND", message: "Terminal not found for this merchant" });
      const [row] = await db.insert(schema.posTransactions).values({
        ...input,
        merchantId: merchant.id,
        id: `ptxn_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "completed",
        settlementStatus: "pending",
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  stats: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [];
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.posTransactions.merchantId, conditions);
      const [stats] = await db.select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        totalAmountKobo: sql<number>`coalesce(sum(amount_kobo) filter (where status = 'completed'), 0)`,
      }).from(schema.posTransactions)
        .where(conditions.length ? and(...conditions) : undefined);
      return stats;
    }),
});

// ─── 12. Purchase Orders ──────────────────────────────────────────────────────
export const purchaseOrdersRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      merchantId: z.string().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.purchaseOrders.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.purchaseOrders.status, input.status));
      if (input.search) conditions.push(like(schema.purchaseOrders.itemName, `%${input.search}%`));
      const rows = await db.select().from(schema.purchaseOrders)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.purchaseOrders.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.purchaseOrders)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.purchaseOrders.id, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.purchaseOrders.merchantId, conditions);
      const [row] = await db.select().from(schema.purchaseOrders)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Purchase order not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      inventoryItemId: z.string().optional(),
      itemName: z.string(),
      vendorName: z.string().optional(),
      quantity: z.number().positive(),
      unit: z.string().default("unit"),
      unitCostKobo: z.number().int().min(0).default(0),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId/createdBy resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const user = await requireCtxUser(ctx.user.openId);
      const totalCostKobo = input.quantity * input.unitCostKobo;
      const [row] = await db.insert(schema.purchaseOrders).values({
        ...input,
        merchantId: merchant.id,
        createdBy: user.name ?? user.email ?? `user:${user.id}`,
        id: `po_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        totalCostKobo,
        status: "pending",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["approved", "received", "cancelled"]),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership + transition guard — pending→approved→received,
      // pending/approved→cancelled; no backward or cross-merchant transitions.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const allowedFrom: Record<string, string[]> = {
        approved: ["pending"],
        received: ["approved"],
        cancelled: ["pending", "approved"],
      };
      const [row] = await db.update(schema.purchaseOrders)
        .set({ status: input.status, updatedAt: new Date() })
        .where(and(
          eq(schema.purchaseOrders.id, input.id),
          eq(schema.purchaseOrders.merchantId, merchant.id),
          inArray(schema.purchaseOrders.status, allowedFrom[input.status] ?? []),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Purchase order not found, not owned by you, or invalid status transition" });
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — only the owning merchant may delete a PO.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      await db.delete(schema.purchaseOrders)
        .where(and(
          eq(schema.purchaseOrders.id, input.id),
          eq(schema.purchaseOrders.merchantId, merchant.id),
        ));
      return { success: true };
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where status = 'pending')`,
      approved: sql<number>`count(*) filter (where status = 'approved')`,
      received: sql<number>`count(*) filter (where status = 'received')`,
      totalCostKobo: sql<number>`coalesce(sum(total_cost_kobo), 0)`,
    }).from(schema.purchaseOrders);
    return stats;
  }),
});

// ─── 13. QR Payments ──────────────────────────────────────────────────────────
export const qrPaymentsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      merchantId: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.qrPayments.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.qrPayments.status, input.status as any));
      const rows = await db.select().from(schema.qrPayments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.qrPayments.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.qrPayments)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.qrPayments.id, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.qrPayments.merchantId, conditions);
      const [row] = await db.select().from(schema.qrPayments)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "QR payment not found" });
      return row;
    }),

  generate: protectedProcedure
    .input(z.object({
      amount: z.number().positive().optional(),
      currency: z.string().default("NGN"),
      description: z.string().optional(),
      expiresInMinutes: z.number().min(1).max(1440).default(30),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const expiresAt = new Date(Date.now() + input.expiresInMinutes * 60 * 1000);
      const transactionRef = `QR-${Date.now()}-${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
      const [row] = await db.insert(schema.qrPayments).values({
        merchantId: merchant.id,
        amount: input.amount,
        currency: input.currency,
        description: input.description,
        status: "pending",
        transactionRef,
        expiresAt,
        metadata: JSON.stringify({ type: "paygate_qr", merchantId: merchant.id }),
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  claim: protectedProcedure
    .input(z.object({
      id: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: claimedBy resolved server-side; guarded claim — only a pending,
      // unexpired QR may be claimed (prevents double-claim / expired claims).
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.update(schema.qrPayments)
        .set({
          status: "claimed",
          claimedBy: user.id,
          claimedAt: new Date(),
          updatedAt: new Date(),
        } as any)
        .where(and(
          eq(schema.qrPayments.id, input.id),
          eq(schema.qrPayments.status, "pending"),
          gt(schema.qrPayments.expiresAt, new Date()),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "CONFLICT", message: "QR payment not found, already claimed, or expired" });
      return row;
    }),

  stats: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [];
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.qrPayments.merchantId, conditions);
      const [stats] = await db.select({
        total: sql<number>`count(*)`,
        claimed: sql<number>`count(*) filter (where status = 'claimed')`,
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        expired: sql<number>`count(*) filter (where status = 'expired')`,
        totalAmount: sql<number>`coalesce(sum(amount) filter (where status = 'claimed'), 0)`,
      }).from(schema.qrPayments)
        .where(conditions.length ? and(...conditions) : undefined);
      return stats;
    }),
  scan: publicProcedure
    .input(z.object({ qrId: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(schema.qrPayments)
        .where(eq(schema.qrPayments.transactionRef, input.qrId));
      if (!row) return { valid: false, qrId: input.qrId, message: 'QR code not found or expired' };
      if (row.status === 'expired') return { valid: false, qrId: input.qrId, message: 'QR code has expired' };
      return { valid: true, qrId: input.qrId, merchantId: row.merchantId, amount: row.amount, currency: row.currency, message: 'QR code is valid' };
    }),
  recentScans: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ input }) => {
      const rows = await db.select().from(schema.qrPayments)
        .where(eq(schema.qrPayments.status, 'claimed'))
        .orderBy(desc(schema.qrPayments.createdAt))
        .limit(input.limit);
      return { rows, total: rows.length };
    }),
});

// ─── 14. Red Envelopes ────────────────────────────────────────────────────────
export const redEnvelopesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      senderId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers only ever see their OWN envelopes.
      const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
        .where(eq(schema.users.openId, ctx.user.openId)).limit(1);
      if (caller?.role === "admin") {
        if (input.senderId) conditions.push(eq(schema.redEnvelopes.senderId, input.senderId));
      } else {
        const user = await requireCtxUser(ctx.user.openId);
        conditions.push(eq(schema.redEnvelopes.senderId, user.id));
      }
      if (input.status) conditions.push(eq(schema.redEnvelopes.status, input.status as any));
      const rows = await db.select().from(schema.redEnvelopes)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.redEnvelopes.createdAt))
        .limit(input.limit).offset(input.offset);
      return { rows, total: rows.length };
    }),

  create: protectedProcedure
    .input(z.object({
      idempotencyKey: z.string().min(8),
      // S15b: kobo is an integer minor unit — fractional kobo is invalid money.
      totalAmountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
      slots: z.number().min(1).max(100).default(5),
      message: z.string().optional(),
      expiresInHours: z.number().min(1).max(168).default(24),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4 F4-1 (money-printer fix): the sender and their wallet are resolved
      // server-side from the session — the client can no longer supply
      // senderId/senderWalletId. The sender's wallet is debited atomically via
      // a guarded UPDATE (... WHERE balance_kobo >= amount RETURNING) inside the
      // SAME transaction as the envelope insert and the ledger txn row, so no
      // 'active' envelope can exist without real funds backing it (claim path
      // server/routers.ts:9716+ credits real wallets). Mirrors the funded
      // create at server/routers.ts:9641-9697. Idempotency key REQUIRED (spec #6).
      const user = await requireCtxUser(ctx.user.openId);
      const { expiresInHours, idempotencyKey } = input;
      return withIdempotency({
        key: idempotencyKey,
        merchantId: `consumer:${user.id}`,
        operation: "redEnvelopes.create",
        requestBody: input,
        execute: async () => {
          return db.transaction(async (tx) => {
            const [wallet] = await tx.select().from(schema.consumerWallets)
              .where(and(
                eq(schema.consumerWallets.userId, user.id),
                eq(schema.consumerWallets.currency, input.currency),
                eq(schema.consumerWallets.isActive, true),
              ))
              .limit(1);
            if (!wallet) throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found. Please top up first." });
            // Guarded atomic debit — the WHERE clause enforces sufficient funds under the row lock.
            const debitRows = await tx.update(schema.consumerWallets)
              .set({ balanceKobo: sql`${schema.consumerWallets.balanceKobo} - ${input.totalAmountKobo}`, updatedAt: new Date() })
              .where(and(
                eq(schema.consumerWallets.id, wallet.id),
                gte(schema.consumerWallets.balanceKobo, input.totalAmountKobo),
              ))
              .returning({ balanceKobo: schema.consumerWallets.balanceKobo });
            if (!debitRows[0]) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
            const newBalance = debitRows[0].balanceKobo;
            const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000);
            const [row] = await tx.insert(schema.redEnvelopes).values({
              senderId: user.id,
              senderWalletId: wallet.id,
              totalAmountKobo: input.totalAmountKobo,
              currency: input.currency,
              slots: input.slots,
              message: input.message,
              status: "active",
              claimedSlots: 0,
              expiresAt,
              createdAt: new Date(),
              updatedAt: new Date(),
            } as any).returning();
            await tx.insert(schema.consumerWalletTxns).values({
              walletId: wallet.id,
              userId: user.id,
              type: "red_envelope_send",
              amountKobo: input.totalAmountKobo,
              currency: input.currency,
              balanceAfterKobo: newBalance,
              description: `Red envelope created (${input.slots} slots)`,
              reference: row.id,
              status: "completed",
              createdAt: new Date(),
            } as any);
            return row;
          });
        },
      });
    }),

  getClaims: protectedProcedure
    .input(z.object({ envelopeId: z.string() }))
    .query(async ({ input }) => {
      return db.select().from(schema.redEnvelopeClaims)
        .where(eq(schema.redEnvelopeClaims.envelopeId, input.envelopeId))
        .orderBy(desc(schema.redEnvelopeClaims.claimedAt));
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      fullyClaimed: sql<number>`count(*) filter (where status = 'fully_claimed')`,
      expired: sql<number>`count(*) filter (where status = 'expired')`,
      totalAmountKobo: sql<number>`coalesce(sum(total_amount_kobo), 0)`,
    }).from(schema.redEnvelopes);
    return stats;
  }),
});

// ─── 15. Referrals ────────────────────────────────────────────────────────────
export const referralsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      referrerId: z.number().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers only ever see their OWN referrals.
      const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
        .where(eq(schema.users.openId, ctx.user.openId)).limit(1);
      if (caller?.role === "admin") {
        if (input.referrerId) conditions.push(eq(schema.referrals.referrerId, input.referrerId));
      } else {
        const user = await requireCtxUser(ctx.user.openId);
        conditions.push(eq(schema.referrals.referrerId, user.id));
      }
      if (input.status) conditions.push(eq(schema.referrals.status, input.status));
      const rows = await db.select().from(schema.referrals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.referrals.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.referrals)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  create: protectedProcedure
    .input(z.object({
      referrerRewardKobo: z.number().int().default(50000),
      refereeRewardKobo: z.number().int().default(25000),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: referrerId resolved server-side — users can only create referrals for themselves.
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.insert(schema.referrals).values({
        ...input,
        referrerId: user.id,
        referralCode: `REF-${Math.random().toString(36).slice(2, 10).toUpperCase()}`,
        status: "pending",
        referrerPaid: false,
        refereePaid: false,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),

  complete: protectedProcedure
    .input(z.object({ referralCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: refereeId resolved server-side; only pending referrals may complete.
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.update(schema.referrals)
        .set({ status: "completed", refereeId: user.id, updatedAt: new Date() } as any)
        .where(and(
          eq(schema.referrals.referralCode, input.referralCode),
          eq(schema.referrals.status, "pending"),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "CONFLICT", message: "Referral not found or already completed/cancelled" });
      return row;
    }),

  stats: protectedProcedure
    .input(z.object({ referrerId: z.number().optional() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers only ever see their OWN referral stats.
      const [caller] = await db.select({ role: schema.users.role }).from(schema.users)
        .where(eq(schema.users.openId, ctx.user.openId)).limit(1);
      let conditions: any[];
      if (caller?.role === "admin") {
        conditions = input.referrerId ? [eq(schema.referrals.referrerId, input.referrerId)] : [];
      } else {
        const user = await requireCtxUser(ctx.user.openId);
        conditions = [eq(schema.referrals.referrerId, user.id)];
      }
      const [stats] = await db.select({
        total: sql<number>`count(*)`,
        completed: sql<number>`count(*) filter (where status = 'completed')`,
        pending: sql<number>`count(*) filter (where status = 'pending')`,
        totalReferrerRewardsKobo: sql<number>`coalesce(sum(referrer_reward_kobo) filter (where status = 'completed'), 0)`,
      }).from(schema.referrals)
        .where(conditions.length ? and(...conditions) : undefined);
      return stats;
    }),
  bulkApprove: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: completing referrals releases reward value — platform-admin gated (spec #1/#3).
      await requirePlatformAdmin(ctx.user.openId);
      await db.update(schema.referrals)
        .set({ status: "completed" as any, updatedAt: new Date() } as any)
        .where(inArray(schema.referrals.id, input.ids));
      return { updated: input.ids.length };
    }),
  bulkReject: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.update(schema.referrals)
        .set({ status: "cancelled" as any, updatedAt: new Date() } as any)
        .where(inArray(schema.referrals.id, input.ids));
      return { updated: input.ids.length };
    }),
  bulkDelete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      await db.delete(schema.referrals).where(inArray(schema.referrals.id, input.ids));
      return { deleted: input.ids.length };
    }),
  bulkComplete: protectedProcedure
    .input(z.object({ ids: z.array(z.string()).min(1).max(100) }))
    .mutation(async ({ ctx, input }) => {
      // R4: completing referrals releases reward value — platform-admin gated (spec #1/#3).
      await requirePlatformAdmin(ctx.user.openId);
      await db.update(schema.referrals)
        .set({ status: "completed" as any, updatedAt: new Date() } as any)
        .where(inArray(schema.referrals.id, input.ids));
      return { updated: input.ids.length };
    }),
});

// ─── 16. Saved Beneficiaries ──────────────────────────────────────────────────
export const savedBeneficiariesRouter = router({
  list: protectedProcedure
    .query(async ({ ctx }) => {
      // R4: client userId filter removed — users may only list their OWN beneficiaries.
      const user = await requireCtxUser(ctx.user.openId);
      return db.select().from(schema.savedBeneficiaries)
        .where(eq(schema.savedBeneficiaries.userId, user.id))
        .orderBy(desc(schema.savedBeneficiaries.lastUsedAt));
    }),

  add: protectedProcedure
    .input(z.object({
      accountNumber: z.string(),
      bankCode: z.string(),
      bankName: z.string(),
      accountName: z.string(),
      nickname: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: userId resolved server-side from the session.
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.insert(schema.savedBeneficiaries).values({
        ...input,
        userId: user.id,
        transferCount: 1,
        lastUsedAt: new Date(),
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      nickname: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — users may only update their OWN beneficiaries.
      const user = await requireCtxUser(ctx.user.openId);
      const { id, ...data } = input;
      const [row] = await db.update(schema.savedBeneficiaries)
        .set(data as any)
        .where(and(
          eq(schema.savedBeneficiaries.id, id),
          eq(schema.savedBeneficiaries.userId, user.id),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Beneficiary not found or not owned by you" });
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — users may only delete their OWN beneficiaries.
      const user = await requireCtxUser(ctx.user.openId);
      await db.delete(schema.savedBeneficiaries)
        .where(and(
          eq(schema.savedBeneficiaries.id, input.id),
          eq(schema.savedBeneficiaries.userId, user.id),
        ));
      return { success: true };
    }),

  incrementUsage: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership guard — users may only touch their OWN beneficiaries.
      const user = await requireCtxUser(ctx.user.openId);
      const [row] = await db.update(schema.savedBeneficiaries)
        .set({
          transferCount: sql`transfer_count + 1`,
          lastUsedAt: new Date(),
        } as any)
        .where(and(
          eq(schema.savedBeneficiaries.id, input.id),
          eq(schema.savedBeneficiaries.userId, user.id),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Beneficiary not found or not owned by you" });
      return row;
    }),
});

// ─── 17. Subscriptions ────────────────────────────────────────────────────────
export const subscriptionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      merchantId: z.string().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.subscriptions.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.subscriptions.status, input.status as any));
      const rows = await db.select().from(schema.subscriptions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.subscriptions.createdAt as any))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.subscriptions)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      // R4: non-admin callers are hard-scoped to their own merchant.
      const conditions: any[] = [eq(schema.subscriptions.id, input.id)];
      await applyMerchantScope(ctx.user.openId, undefined, schema.subscriptions.merchantId, conditions);
      const [row] = await db.select().from(schema.subscriptions)
        .where(and(...conditions));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found" });
      return row;
    }),

  create: protectedProcedure
    .input(z.object({
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
      planName: z.string(),
      amountKobo: z.number().int().positive(),
      currency: z.string().default("NGN"),
      interval: z.enum(["daily", "weekly", "monthly", "quarterly", "annually"]).default("monthly"),
      totalCycles: z.number().optional(),
      startAt: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId/tenantId resolved server-side from the session.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const startAt = new Date(input.startAt);
      const [row] = await db.insert(schema.subscriptions).values({
        ...input,
        merchantId: merchant.id,
        tenantId: merchant.tenantId,
        id: `sub_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`,
        status: "active",
        completedCycles: 0,
        startAt,
        nextRunAt: startAt,
      } as any).returning();
      return row;
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership + transition guard — only active/paused subscriptions of
      // the caller's merchant may be cancelled.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.subscriptions)
        .set({ status: "cancelled" as any })
        .where(and(
          eq(schema.subscriptions.id, input.id),
          eq(schema.subscriptions.merchantId, merchant.id),
          inArray(schema.subscriptions.status, ["active", "paused"]),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Subscription not found, not owned by you, or already cancelled" });
      return row;
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership + transition guard — active → paused only.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.subscriptions)
        .set({ status: "paused" as any })
        .where(and(
          eq(schema.subscriptions.id, input.id),
          eq(schema.subscriptions.merchantId, merchant.id),
          eq(schema.subscriptions.status, "active"),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Subscription not found, not owned by you, or not active" });
      return row;
    }),

  resume: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: ownership + transition guard — paused → active only.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.update(schema.subscriptions)
        .set({ status: "active" as any })
        .where(and(
          eq(schema.subscriptions.id, input.id),
          eq(schema.subscriptions.merchantId, merchant.id),
          eq(schema.subscriptions.status, "paused"),
        ))
        .returning();
      if (!row) throw new TRPCError({ code: "FORBIDDEN", message: "Subscription not found, not owned by you, or not paused" });
      return row;
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      paused: sql<number>`count(*) filter (where status = 'paused')`,
      cancelled: sql<number>`count(*) filter (where status = 'cancelled')`,
      mrrKobo: sql<number>`coalesce(sum(amount_kobo) filter (where status = 'active' and interval = 'monthly'), 0)`,
    }).from(schema.subscriptions);
    return stats;
  }),
});

// ─── 18. USSD Sessions ────────────────────────────────────────────────────────
export const ussdSessionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      merchantId: z.string().optional(),
      msisdn: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.ussdSessions.merchantId, conditions);
      if (input.status) conditions.push(eq(schema.ussdSessions.status, input.status as any));
      if (input.msisdn) conditions.push(like(schema.ussdSessions.msisdn, `%${input.msisdn}%`));
      const rows = await db.select().from(schema.ussdSessions)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(schema.ussdSessions.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.ussdSessions)
        .where(conditions.length ? and(...conditions) : undefined);
      return { rows, total: Number(count) };
    }),

  get: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const [row] = await db.select().from(schema.ussdSessions)
        .where(eq(schema.ussdSessions.sessionId, input.sessionId));
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "USSD session not found" });
      return row;
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      active: sql<number>`count(*) filter (where status = 'active')`,
      completed: sql<number>`count(*) filter (where status = 'completed')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
      timedOut: sql<number>`count(*) filter (where status = 'timed_out')`,
    }).from(schema.ussdSessions);
    return stats;
  }),

  terminate: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // R4: session termination is a platform operation — platform-admin gated
      // (prevents any user killing other users' USSD sessions).
      await requirePlatformAdmin(ctx.user.openId);
      const [row] = await db.update(schema.ussdSessions)
        .set({ status: "failed" as any, endedAt: new Date() } as any)
        .where(eq(schema.ussdSessions.sessionId, input.sessionId))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "USSD session not found" });
      return row;
    }),
});

// ─── 19. WAF Alerts (via auditEvents with source filter) ──────────────────────
export const wafAlertsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      merchantId: z.string().optional(),
      dateFrom: z.string().optional(),
      dateTo: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const conditions: any[] = [like(schema.auditEvents.action, "waf.%")];
      // R4: non-admin callers are hard-scoped to their own merchant.
      await applyMerchantScope(ctx.user.openId, input.merchantId, schema.auditEvents.merchantId, conditions);
      if (input.dateFrom) conditions.push(gte(schema.auditEvents.createdAt, new Date(input.dateFrom)));
      if (input.dateTo) conditions.push(lte(schema.auditEvents.createdAt, new Date(input.dateTo)));
      const rows = await db.select().from(schema.auditEvents)
        .where(and(...conditions))
        .orderBy(desc(schema.auditEvents.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(schema.auditEvents)
        .where(and(...conditions));
      return { rows, total: Number(count) };
    }),

  stats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      today: sql<number>`count(*) filter (where created_at >= now() - interval '1 day')`,
      thisWeek: sql<number>`count(*) filter (where created_at >= now() - interval '7 days')`,
    }).from(schema.auditEvents)
      .where(like(schema.auditEvents.action, "waf.%"));
    return stats;
  }),

  getTopAttackers: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      return db.select({
        ipAddress: schema.auditEvents.ipAddress,
        count: sql<number>`count(*)`,
        lastSeen: sql<Date>`max(created_at)`,
      }).from(schema.auditEvents)
        .where(like(schema.auditEvents.action, "waf.%"))
        .groupBy(schema.auditEvents.ipAddress)
        .orderBy(desc(sql`count(*)`))
        .limit(input.limit);
    }),

  ingest: protectedProcedure
    .input(z.object({
      attackType: z.string(),
      sourceIp: z.string(),
      endpoint: z.string(),
      severity: z.string().default("medium"),
      blocked: z.boolean().default(true),
      ruleId: z.string().optional(),
      country: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // R4: merchantId resolved server-side — callers can no longer inject
      // forged WAF audit events against arbitrary merchants.
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [row] = await db.insert(schema.auditEvents).values({
        merchantId: merchant.id,
        actorId: "system",
        actorName: "OpenAppSec WAF",
        action: `waf.${input.attackType}`,
        resource: "waf",
        resourceId: input.endpoint,
        ipAddress: input.sourceIp,
        metadata: {
          severity: input.severity,
          blocked: input.blocked,
          ruleId: input.ruleId,
          country: input.country,
        },
        createdAt: new Date(),
      } as any).returning();
      return row;
    }),
});

// ─── 20. Offline Resilience / Sync Queue ─────────────────────────────────────
export const offlineResilienceRouter = router({
  listPendingSync: protectedProcedure
    .input(z.object({
      aggregateId: z.string(),
      limit: z.number().min(1).max(100).default(50),
    }))
    .query(async ({ ctx, input }) => {
      // R4: consumer_outbox is a system sync queue — platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      return db.select().from(schema.consumerOutbox)
        .where(and(
          eq(schema.consumerOutbox.status, "pending"),
          eq(schema.consumerOutbox.aggregateId, input.aggregateId),
        ))
        .orderBy(asc(schema.consumerOutbox.createdAt))
        .limit(input.limit);
    }),

  markSynced: protectedProcedure
    .input(z.object({ ids: z.array(z.string()) }))
    .mutation(async ({ ctx, input }) => {
      // R4: marking outbox rows processed mutates a system queue — platform-admin gated.
      await requirePlatformAdmin(ctx.user.openId);
      for (const id of input.ids) {
        await db.update(schema.consumerOutbox)
          .set({ status: "processed", processedAt: new Date() } as any)
          .where(eq(schema.consumerOutbox.id, id));
      }
      return { synced: input.ids.length };
    }),

  getNetworkStatus: publicProcedure.query(async () => {
    return {
      online: true,
      timestamp: new Date().toISOString(),
      latencyMs: 0,
      version: "wave124",
    };
  }),

  getStats: protectedProcedure.query(async () => {
    const [stats] = await db.select({
      total: sql<number>`count(*)`,
      pending: sql<number>`count(*) filter (where status = 'pending')`,
      processed: sql<number>`count(*) filter (where status = 'processed')`,
      failed: sql<number>`count(*) filter (where status = 'failed')`,
    }).from(schema.consumerOutbox);
    return stats;
  }),
});
