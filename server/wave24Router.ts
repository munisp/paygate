/**
 * Wave 24 — Production Feature Router
 *
 * Procedures:
 *  - wave24.helpAnalytics.trackSearch / getTopQueries / getUnansweredQueries
 *  - wave24.featureFlags.list / create / toggle / update / delete
 *  - wave24.merchantRisk.getScore / recalculate / list
 *  - wave24.budgets.list / create / update / delete
 *  - wave24.savingsGoals.list / create / deposit / update / delete
 *  - wave24.referrals.getMyCode / getStats / list
 *  - wave24.chargebacks.list / get / create / submitEvidence / updateStatus
 *  - wave24.settlementSla.list / getStats / escalate
 *  - wave24.webhookSimulator.getEventTypes / simulate / getLogs
 *  - wave24.merchantActions.ban / suspend / unsuspend / getStatusLog
 *  - wave24.receipts.get / getOrCreate / sendEmail
 */

import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { getDb } from "./db";
import {
  helpSearchAnalytics,
  featureFlags,
  merchantRiskScores,
  consumerBudgets,
  consumerSavingsGoals,
  referrals,
  chargebacks,
  settlementSlaEvents,
  webhookSimulatorLogs,
  merchantStatusLog,
  transactionReceipts,
  merchants,
  webhooks,
} from "../drizzle/schema";
import { eq, desc, asc, and, sql, count } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── DB helper ────────────────────────────────────────────────────────────────
async function requireDb() {
  const d = await getDb();
  if (!d) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return d;
}

// ─── Help Search Analytics ────────────────────────────────────────────────────
export const helpAnalyticsRouter = router({
  trackSearch: publicProcedure
    .input(z.object({
      query: z.string().min(1).max(200),
      userType: z.enum(["merchant", "consumer", "admin"]).default("merchant"),
      userId: z.string().optional(),
      resultCount: z.number().int().min(0).default(0),
      clickedSection: z.string().optional(),
      sessionId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      await d.insert(helpSearchAnalytics).values({
        id: crypto.randomUUID(),
        query: input.query.toLowerCase().trim(),
        userType: input.userType,
        userId: input.userId,
        resultCount: input.resultCount,
        clickedSection: input.clickedSection,
        sessionId: input.sessionId,
      });
      return { tracked: true };
    }),

  getTopQueries: protectedProcedure
    .input(z.object({
      userType: z.enum(["merchant", "consumer", "admin", "all"]).default("all"),
      days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await d.execute(sql`
        SELECT query, user_type, COUNT(*) as search_count,
               AVG(result_count) as avg_results,
               SUM(CASE WHEN clicked_section IS NOT NULL THEN 1 ELSE 0 END) as click_count
        FROM help_search_analytics
        WHERE created_at >= ${since}
        ${input.userType !== "all" ? sql`AND user_type = ${input.userType}` : sql``}
        GROUP BY query, user_type
        ORDER BY search_count DESC
        LIMIT ${input.limit}
      `);
      return rows.rows as Array<{
        query: string; user_type: string; search_count: number;
        avg_results: number; click_count: number;
      }>;
    }),

  getUnansweredQueries: protectedProcedure
    .input(z.object({
      days: z.number().int().min(1).max(90).default(30),
      limit: z.number().int().min(1).max(50).default(20),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await d.execute(sql`
        SELECT query, COUNT(*) as search_count
        FROM help_search_analytics
        WHERE created_at >= ${since} AND result_count = 0
        GROUP BY query
        ORDER BY search_count DESC
        LIMIT ${input.limit}
      `);
      return rows.rows as Array<{ query: string; search_count: number }>;
    }),
});

// ─── Feature Flags ────────────────────────────────────────────────────────────
export const featureFlagsRouter = router({
  list: protectedProcedure
    .input(z.object({
      category: z.string().optional(),
      enabled: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const conditions = [];
      if (input.category) conditions.push(eq(featureFlags.category, input.category));
      if (input.enabled !== undefined) conditions.push(eq(featureFlags.enabled, input.enabled));
      return d.select().from(featureFlags)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(featureFlags.createdAt));
    }),

  create: protectedProcedure
    .input(z.object({
      key: z.string().min(1).max(100).regex(/^[a-z0-9_-]+$/),
      name: z.string().min(1).max(200),
      description: z.string().optional(),
      enabled: z.boolean().default(false),
      rolloutPercentage: z.number().int().min(0).max(100).default(0),
      category: z.enum(["feature", "experiment", "kill-switch"]).default("feature"),
      environment: z.enum(["production", "staging", "all"]).default("production"),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const existing = await d.select({ id: featureFlags.id })
        .from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Feature flag '${input.key}' already exists` });
      }
      const [flag] = await d.insert(featureFlags).values({
        id: crypto.randomUUID(),
        key: input.key,
        name: input.name,
        description: input.description,
        enabled: input.enabled,
        rolloutPercentage: input.rolloutPercentage,
        category: input.category,
        environment: input.environment,
        createdBy: ctx.user.openId,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      }).returning();
      return flag;
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const [updated] = await d.update(featureFlags)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(featureFlags.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Feature flag not found" });
      return updated;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(200).optional(),
      description: z.string().optional(),
      rolloutPercentage: z.number().int().min(0).max(100).optional(),
      expiresAt: z.string().datetime().nullable().optional(),
      targetingRules: z.object({
        segments: z.array(z.string()).optional(),
        tiers: z.array(z.string()).optional(),
        countries: z.array(z.string()).optional(),
        userIds: z.array(z.string()).optional(),
        customRules: z.array(z.object({
          attribute: z.string(),
          operator: z.enum(["eq", "neq", "gt", "lt", "contains", "in"]),
          value: z.union([z.string(), z.number(), z.array(z.string())]),
        })).optional(),
      }).nullable().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const { id, expiresAt, targetingRules, ...rest } = input;
      const updateData: Record<string, unknown> = { ...rest, updatedAt: new Date() };
      if (expiresAt !== undefined) updateData.expiresAt = expiresAt ? new Date(expiresAt) : null;
      if (targetingRules !== undefined) updateData.targetingRules = targetingRules;
      const [updated] = await d.update(featureFlags).set(updateData).where(eq(featureFlags.id, id)).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Feature flag not found" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      await d.delete(featureFlags).where(eq(featureFlags.id, input.id));
      return { deleted: true };
    }),
});

// ─── Merchant Risk Scoring ────────────────────────────────────────────────────
function calculateRiskLevel(score: number): string {
  if (score >= 80) return "critical";
  if (score >= 60) return "high";
  if (score >= 40) return "medium";
  return "low";
}

async function computeMerchantRiskScore(merchantId: string) {
  const d = await requireDb();
  const factors: string[] = [];
  let fraudScore = 0;
  let chargebackScore = 0;
  let kycScore = 0;
  let transactionScore = 0;
  let velocityScore = 0;

  // Chargeback ratio
  const cbRows = await d.execute(sql`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status IN ('open','under_review') THEN 1 ELSE 0 END) as open_count
    FROM chargebacks WHERE merchant_id = ${merchantId}
  `);
  const cbData = cbRows.rows[0] as { total: string; open_count: string } | undefined;
  const cbTotal = parseInt(cbData?.total ?? "0");
  const cbOpen = parseInt(cbData?.open_count ?? "0");
  if (cbTotal > 10) { chargebackScore += 30; factors.push("High chargeback volume (>10)"); }
  else if (cbTotal > 5) { chargebackScore += 15; factors.push("Elevated chargeback volume (>5)"); }
  if (cbOpen > 3) { chargebackScore += 20; factors.push("Multiple open chargebacks"); }

  // Transaction velocity (last 24h)
  const velRows = await d.execute(sql`
    SELECT COUNT(*) as count_24h
    FROM transactions
    WHERE merchant_id = ${merchantId}
      AND created_at >= NOW() - INTERVAL '24 hours'
  `);
  const velData = velRows.rows[0] as { count_24h: string } | undefined;
  const count24h = parseInt(velData?.count_24h ?? "0");
  if (count24h > 1000) { velocityScore += 25; factors.push("Very high transaction velocity (>1000/day)"); }
  else if (count24h > 500) { velocityScore += 10; factors.push("High transaction velocity (>500/day)"); }

  // KYC/KYB status
  const merchantRows = await d.select({ status: merchants.status })
    .from(merchants).where(eq(merchants.id, merchantId)).limit(1);
  const merchant = merchantRows[0];
  if (merchant?.status === "suspended") { kycScore += 40; factors.push("Merchant currently suspended"); }
  else if (merchant?.status === "pending") { kycScore += 20; factors.push("KYB verification pending"); }

  // Failed transactions ratio (last 7 days)
  const txRows = await d.execute(sql`
    SELECT COUNT(*) as total,
           SUM(CASE WHEN status = 'failed' THEN 1 ELSE 0 END) as failed
    FROM transactions WHERE merchant_id = ${merchantId}
      AND created_at >= NOW() - INTERVAL '7 days'
  `);
  const txData = txRows.rows[0] as { total: string; failed: string } | undefined;
  const txTotal = parseInt(txData?.total ?? "0");
  const txFailed = parseInt(txData?.failed ?? "0");
  if (txTotal > 0) {
    const failRate = txFailed / txTotal;
    if (failRate > 0.3) { transactionScore += 30; factors.push(`High failure rate (${Math.round(failRate * 100)}%)`); }
    else if (failRate > 0.15) { transactionScore += 15; factors.push(`Elevated failure rate (${Math.round(failRate * 100)}%)`); }
  }

  const overallScore = Math.min(100, Math.round(
    (fraudScore * 0.3) + (chargebackScore * 0.25) + (kycScore * 0.2) +
    (transactionScore * 0.15) + (velocityScore * 0.1)
  ));

  let recommendation = "No action required.";
  if (overallScore >= 80) recommendation = "Immediate review required. Consider temporary suspension.";
  else if (overallScore >= 60) recommendation = "Enhanced monitoring recommended. Schedule compliance review.";
  else if (overallScore >= 40) recommendation = "Monitor closely. Request updated KYB documentation.";

  return { overallScore, fraudScore, chargebackScore, kycScore, transactionScore, velocityScore, factors, recommendation };
}

export const merchantRiskRouter = router({
  getScore: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const existing = await d.select().from(merchantRiskScores)
        .where(eq(merchantRiskScores.merchantId, input.merchantId))
        .orderBy(desc(merchantRiskScores.calculatedAt)).limit(1);
      return existing[0] ?? null;
    }),

  recalculate: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const scores = await computeMerchantRiskScore(input.merchantId);
      const [record] = await d.insert(merchantRiskScores).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        overallScore: scores.overallScore,
        fraudScore: scores.fraudScore,
        chargebackScore: scores.chargebackScore,
        kycScore: scores.kycScore,
        transactionScore: scores.transactionScore,
        velocityScore: scores.velocityScore,
        riskLevel: calculateRiskLevel(scores.overallScore),
        factors: JSON.stringify(scores.factors),
        recommendation: scores.recommendation,
        reviewedBy: ctx.user.openId,
        reviewedAt: new Date(),
        calculatedAt: new Date(),
      }).returning();
      return record;
    }),

  list: protectedProcedure
    .input(z.object({
      riskLevel: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const conditions = input.riskLevel !== "all"
        ? [eq(merchantRiskScores.riskLevel, input.riskLevel)]
        : [];
      const rows = await d.select().from(merchantRiskScores)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(merchantRiskScores.overallScore))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await d.select({ total: count() }).from(merchantRiskScores)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return { items: rows, total };
    }),
});

// ─── Consumer Budgets ─────────────────────────────────────────────────────────
export const budgetsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const d = await requireDb();
      return d.select().from(consumerBudgets)
        .where(and(eq(consumerBudgets.userId, ctx.user.id), eq(consumerBudgets.isActive, true)))
        .orderBy(asc(consumerBudgets.category)).limit(input.limit).offset(input.offset);
    }),

  create: protectedProcedure
    .input(z.object({
      category: z.enum(["food", "transport", "shopping", "bills", "entertainment", "other"]),
      limitKobo: z.number().int().min(100),
      period: z.enum(["weekly", "monthly"]).default("monthly"),
      alertAt: z.number().int().min(50).max(100).default(80),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const existing = await d.select({ id: consumerBudgets.id }).from(consumerBudgets)
        .where(and(
          eq(consumerBudgets.userId, ctx.user.id),
          eq(consumerBudgets.category, input.category),
          eq(consumerBudgets.isActive, true),
        )).limit(1);
      if (existing.length > 0) {
        throw new TRPCError({ code: "CONFLICT", message: `Budget for ${input.category} already exists` });
      }
      const resetAt = new Date();
      if (input.period === "monthly") {
        resetAt.setMonth(resetAt.getMonth() + 1);
        resetAt.setDate(1);
      } else {
        resetAt.setDate(resetAt.getDate() + 7);
      }
      const [budget] = await d.insert(consumerBudgets).values({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        category: input.category,
        limitKobo: input.limitKobo,
        period: input.period,
        alertAt: input.alertAt,
        resetAt,
      }).returning();
      return budget;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      limitKobo: z.number().int().min(100).optional(),
      alertAt: z.number().int().min(50).max(100).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const { id, ...rest } = input;
      const [updated] = await d.update(consumerBudgets)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(consumerBudgets.id, id), eq(consumerBudgets.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Budget not found" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      await d.update(consumerBudgets)
        .set({ isActive: false, updatedAt: new Date() })
        .where(and(eq(consumerBudgets.id, input.id), eq(consumerBudgets.userId, ctx.user.id)));
      return { deleted: true };
    }),
});

// ─── Consumer Savings Goals ───────────────────────────────────────────────────
export const savingsGoalsRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      const d = await requireDb();
      return d.select().from(consumerSavingsGoals)
        .where(eq(consumerSavingsGoals.userId, ctx.user.id))
        .orderBy(desc(consumerSavingsGoals.createdAt)).limit(input.limit).offset(input.offset);
    }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      description: z.string().optional(),
      targetKobo: z.number().int().min(100),
      autoSaveEnabled: z.boolean().default(false),
      autoSaveAmountKobo: z.number().int().min(0).default(0),
      autoSaveFrequency: z.enum(["daily", "weekly", "monthly"]).default("monthly"),
      targetDate: z.string().datetime().optional(),
      emoji: z.string().max(10).default("🎯"),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const [goal] = await d.insert(consumerSavingsGoals).values({
        id: crypto.randomUUID(),
        userId: ctx.user.id,
        name: input.name,
        description: input.description,
        targetKobo: input.targetKobo,
        autoSaveEnabled: input.autoSaveEnabled,
        autoSaveAmountKobo: input.autoSaveAmountKobo,
        autoSaveFrequency: input.autoSaveFrequency,
        targetDate: input.targetDate ? new Date(input.targetDate) : undefined,
        emoji: input.emoji,
      }).returning();
      return goal;
    }),

  deposit: protectedProcedure
    .input(z.object({
      id: z.string(),
      amountKobo: z.number().int().min(100),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const [goal] = await d.select().from(consumerSavingsGoals)
        .where(and(eq(consumerSavingsGoals.id, input.id), eq(consumerSavingsGoals.userId, ctx.user.id)))
        .limit(1);
      if (!goal) throw new TRPCError({ code: "NOT_FOUND", message: "Savings goal not found" });
      const newSaved = goal.savedKobo + input.amountKobo;
      const completed = newSaved >= goal.targetKobo;
      const [updated] = await d.update(consumerSavingsGoals)
        .set({
          savedKobo: newSaved,
          status: completed ? "completed" : "active",
          completedAt: completed ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(consumerSavingsGoals.id, input.id))
        .returning();
      return updated;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      name: z.string().min(1).max(100).optional(),
      description: z.string().optional(),
      targetKobo: z.number().int().min(100).optional(),
      status: z.enum(["active", "paused", "cancelled"]).optional(),
      emoji: z.string().max(10).optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const { id, ...rest } = input;
      const [updated] = await d.update(consumerSavingsGoals)
        .set({ ...rest, updatedAt: new Date() })
        .where(and(eq(consumerSavingsGoals.id, id), eq(consumerSavingsGoals.userId, ctx.user.id)))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Goal not found" });
      return updated;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      await d.delete(consumerSavingsGoals)
        .where(and(eq(consumerSavingsGoals.id, input.id), eq(consumerSavingsGoals.userId, ctx.user.id)));
      return { deleted: true };
    }),
});

// ─── Referral Program ─────────────────────────────────────────────────────────
function generateReferralCode(userId: number): string {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const prefix = "PG";
  let code = prefix;
  const seed = userId.toString().padStart(6, "0");
  for (let i = 0; i < 6; i++) {
    code += chars[parseInt(seed[i % seed.length]) % chars.length];
  }
  return code + Math.random().toString(36).slice(2, 4).toUpperCase();
}

export const referralsRouter = router({
  getMyCode: protectedProcedure.query(async ({ ctx }) => {
    const d = await requireDb();
    const existing = await d.select().from(referrals)
      .where(eq(referrals.referrerId, ctx.user.id))
      .orderBy(asc(referrals.createdAt)).limit(1);
    if (existing[0]) return existing[0];
    const code = generateReferralCode(ctx.user.id);
    const expires = new Date();
    expires.setFullYear(expires.getFullYear() + 1);
    const [created] = await d.insert(referrals).values({
      id: crypto.randomUUID(),
      referrerId: ctx.user.id,
      referralCode: code,
      expiresAt: expires,
    }).returning();
    return created;
  }),

  getStats: protectedProcedure.query(async ({ ctx }) => {
    const d = await requireDb();
    const rows = await d.execute(sql`
      SELECT
        COUNT(*) as total_referrals,
        SUM(CASE WHEN status = 'qualified' THEN 1 ELSE 0 END) as qualified,
        SUM(CASE WHEN status = 'rewarded' THEN 1 ELSE 0 END) as rewarded,
        SUM(CASE WHEN referrer_paid THEN referrer_reward_kobo ELSE 0 END) as total_earned_kobo
      FROM referrals WHERE referrer_id = ${ctx.user.id}
    `);
    return rows.rows[0] as {
      total_referrals: string; qualified: string; rewarded: string; total_earned_kobo: string;
    };
  }),

  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(50).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input, ctx }) => {
      const d = await requireDb();
      const rows = await d.select().from(referrals)
        .where(eq(referrals.referrerId, ctx.user.id))
        .orderBy(desc(referrals.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await d.select({ total: count() }).from(referrals)
        .where(eq(referrals.referrerId, ctx.user.id));
      return { items: rows, total };
    }),
});

// ─── Chargeback Management ────────────────────────────────────────────────────
export const chargebacksRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const conditions = [];
      if (input.merchantId) conditions.push(eq(chargebacks.merchantId, input.merchantId));
      if (input.status) conditions.push(eq(chargebacks.status, input.status));
      const rows = await d.select().from(chargebacks)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(chargebacks.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await d.select({ total: count() }).from(chargebacks)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return { items: rows, total };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const [cb] = await d.select().from(chargebacks).where(eq(chargebacks.id, input.id)).limit(1);
      if (!cb) throw new TRPCError({ code: "NOT_FOUND", message: "Chargeback not found" });
      return cb;
    }),

  create: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      transactionId: z.string().optional(),
      amountKobo: z.number().int().min(1),
      currency: z.string().default("NGN"),
      reason: z.enum(["duplicate", "fraudulent", "product_not_received", "product_unacceptable", "credit_not_processed", "general"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const dueDate = new Date();
      dueDate.setDate(dueDate.getDate() + 7);
      const evidenceDeadline = new Date();
      evidenceDeadline.setDate(evidenceDeadline.getDate() + 5);
      const [cb] = await d.insert(chargebacks).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        transactionId: input.transactionId,
        amountKobo: input.amountKobo,
        currency: input.currency,
        reason: input.reason,
        notes: input.notes,
        dueDate,
        evidenceDeadline,
      }).returning();
      return cb;
    }),

  submitEvidence: protectedProcedure
    .input(z.object({
      id: z.string(),
      evidence: z.object({
        customerEmail: z.string().optional(),
        customerName: z.string().optional(),
        productDescription: z.string().optional(),
        shippingDocumentation: z.string().optional(),
        refundPolicy: z.string().optional(),
        serviceDate: z.string().optional(),
        additionalNotes: z.string().optional(),
      }),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const [updated] = await d.update(chargebacks)
        .set({
          evidence: JSON.stringify(input.evidence),
          evidenceSubmitted: true,
          status: "under_review",
          updatedAt: new Date(),
        })
        .where(eq(chargebacks.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Chargeback not found" });
      return updated;
    }),

  updateStatus: protectedProcedure
    .input(z.object({
      id: z.string(),
      status: z.enum(["open", "under_review", "won", "lost", "accepted", "withdrawn"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const resolved = ["won", "lost", "accepted", "withdrawn"].includes(input.status);
      const [updated] = await d.update(chargebacks)
        .set({
          status: input.status,
          notes: input.notes,
          resolvedAt: resolved ? new Date() : undefined,
          updatedAt: new Date(),
        })
        .where(eq(chargebacks.id, input.id))
        .returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Chargeback not found" });
      return updated;
    }),
});

// ─── Settlement SLA ───────────────────────────────────────────────────────────
export const settlementSlaRouter = router({
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      status: z.string().optional(),
      breachedOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const conditions = [];
      if (input.merchantId) conditions.push(eq(settlementSlaEvents.merchantId, input.merchantId));
      if (input.status) conditions.push(eq(settlementSlaEvents.status, input.status));
      if (input.breachedOnly) conditions.push(eq(settlementSlaEvents.slaBreached, true));
      const rows = await d.select().from(settlementSlaEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(desc(settlementSlaEvents.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await d.select({ total: count() }).from(settlementSlaEvents)
        .where(conditions.length > 0 ? and(...conditions) : undefined);
      return { items: rows, total };
    }),

  getStats: protectedProcedure
    .input(z.object({ merchantId: z.string().optional(), days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await d.execute(sql`
        SELECT
          COUNT(*) as total,
          SUM(CASE WHEN sla_breached THEN 1 ELSE 0 END) as breached,
          SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed,
          AVG(breach_minutes) as avg_breach_minutes,
          SUM(amount_kobo) as total_volume_kobo
        FROM settlement_sla_events
        WHERE created_at >= ${since}
        ${input.merchantId ? sql`AND merchant_id = ${input.merchantId}` : sql``}
      `);
      return rows.rows[0] as {
        total: string; breached: string; completed: string;
        avg_breach_minutes: string; total_volume_kobo: string;
      };
    }),

  escalate: protectedProcedure
    .input(z.object({ id: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const [sla] = await d.select().from(settlementSlaEvents)
        .where(eq(settlementSlaEvents.id, input.id)).limit(1);
      if (!sla) throw new TRPCError({ code: "NOT_FOUND", message: "SLA event not found" });
      const newLevel = Math.min(3, sla.escalationLevel + 1);
      const [updated] = await d.update(settlementSlaEvents)
        .set({ escalationLevel: newLevel, escalatedAt: new Date(), notes: input.notes ?? sla.notes, updatedAt: new Date() })
        .where(eq(settlementSlaEvents.id, input.id))
        .returning();
      return updated;
    }),
});

// ─── Webhook Event Simulator ──────────────────────────────────────────────────
const SAMPLE_PAYLOADS: Record<string, object> = {
  "transaction.completed": {
    event: "transaction.completed",
    data: { id: "txn_sample_001", reference: "REF-2026-001", amount: 500000, currency: "NGN", status: "completed" },
  },
  "transaction.failed": {
    event: "transaction.failed",
    data: { id: "txn_sample_002", reference: "REF-2026-002", amount: 250000, currency: "NGN", status: "failed", failureReason: "Insufficient funds" },
  },
  "payout.completed": {
    event: "payout.completed",
    data: { id: "payout_sample_001", reference: "PAY-2026-001", amount: 1000000, currency: "NGN", status: "completed" },
  },
  "dispute.opened": {
    event: "dispute.opened",
    data: { id: "disp_sample_001", reason: "Customer claims non-delivery", status: "open" },
  },
  "refund.processed": {
    event: "refund.processed",
    data: { id: "ref_sample_001", amount: 500000, currency: "NGN", status: "completed" },
  },
};

export const webhookSimulatorRouter = router({
  getEventTypes: publicProcedure.query(() => Object.keys(SAMPLE_PAYLOADS)),

  simulate: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      webhookId: z.string().optional(),
      eventType: z.string(),
      customPayload: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      const payload = input.customPayload
        ? JSON.parse(input.customPayload)
        : (SAMPLE_PAYLOADS[input.eventType] ?? { event: input.eventType, data: {} });

      let webhookUrl: string | null = null;
      if (input.webhookId) {
        const [wh] = await d.select({ url: webhooks.url })
          .from(webhooks).where(eq(webhooks.id, input.webhookId)).limit(1);
        webhookUrl = wh?.url ?? null;
      } else {
        const [wh] = await d.select({ url: webhooks.url })
          .from(webhooks).where(eq(webhooks.merchantId, input.merchantId)).limit(1);
        webhookUrl = wh?.url ?? null;
      }

      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let durationMs: number | null = null;
      let success = false;
      let error: string | null = null;

      if (webhookUrl) {
        const start = Date.now();
        try {
          const res = await fetch(webhookUrl, {
            method: "POST",
            headers: { "Content-Type": "application/json", "X-PayGate-Event": input.eventType },
            body: JSON.stringify(payload),
            signal: AbortSignal.timeout(10000),
          });
          responseStatus = res.status;
          responseBody = await res.text().catch(() => "");
          durationMs = Date.now() - start;
          success = res.ok;
        } catch (e: unknown) {
          durationMs = Date.now() - start;
          error = e instanceof Error ? e.message : "Unknown error";
        }
      } else {
        error = "No webhook URL configured for this merchant";
      }

      const [log] = await d.insert(webhookSimulatorLogs).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        webhookId: input.webhookId,
        eventType: input.eventType,
        payload: JSON.stringify(payload),
        responseStatus,
        responseBody,
        durationMs,
        success,
        error,
      }).returning();

      return log;
    }),

  getLogs: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const rows = await d.select().from(webhookSimulatorLogs)
        .where(eq(webhookSimulatorLogs.merchantId, input.merchantId))
        .orderBy(desc(webhookSimulatorLogs.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ total }] = await d.select({ total: count() }).from(webhookSimulatorLogs)
        .where(eq(webhookSimulatorLogs.merchantId, input.merchantId));
      return { items: rows, total };
    }),
});

// ─── Merchant Actions (Admin) ─────────────────────────────────────────────────
export const merchantActionsRouter = router({
  ban: protectedProcedure
    .input(z.object({ merchantId: z.string(), reason: z.string().min(10), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const [merchant] = await d.select({ status: merchants.status })
        .from(merchants).where(eq(merchants.id, input.merchantId)).limit(1);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      await d.update(merchants).set({ status: "closed", updatedAt: new Date() }).where(eq(merchants.id, input.merchantId));
      const [log] = await d.insert(merchantStatusLog).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        action: "ban",
        reason: input.reason,
        notes: input.notes,
        performedBy: ctx.user.openId,
        previousStatus: merchant.status,
        newStatus: "closed",
      }).returning();
      return log;
    }),

  suspend: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      reason: z.string().min(10),
      notes: z.string().optional(),
      expiresAt: z.string().datetime().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const [merchant] = await d.select({ status: merchants.status })
        .from(merchants).where(eq(merchants.id, input.merchantId)).limit(1);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      await d.update(merchants).set({ status: "suspended", updatedAt: new Date() }).where(eq(merchants.id, input.merchantId));
      const [log] = await d.insert(merchantStatusLog).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        action: "suspend",
        reason: input.reason,
        notes: input.notes,
        performedBy: ctx.user.openId,
        previousStatus: merchant.status,
        newStatus: "suspended",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      }).returning();
      return log;
    }),

  unsuspend: protectedProcedure
    .input(z.object({ merchantId: z.string(), reason: z.string().min(5), notes: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const [merchant] = await d.select({ status: merchants.status })
        .from(merchants).where(eq(merchants.id, input.merchantId)).limit(1);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      await d.update(merchants).set({ status: "active", updatedAt: new Date() }).where(eq(merchants.id, input.merchantId));
      const [log] = await d.insert(merchantStatusLog).values({
        id: crypto.randomUUID(),
        merchantId: input.merchantId,
        action: "unsuspend",
        reason: input.reason,
        notes: input.notes,
        performedBy: ctx.user.openId,
        previousStatus: merchant.status,
        newStatus: "active",
      }).returning();
      return log;
    }),

  getStatusLog: protectedProcedure
    .input(z.object({ merchantId: z.string(), limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ input }) => {
      const d = await requireDb();
      return d.select().from(merchantStatusLog)
        .where(eq(merchantStatusLog.merchantId, input.merchantId))
        .orderBy(desc(merchantStatusLog.createdAt))
        .limit(input.limit);
    }),
});

// ─── Transaction Receipts ─────────────────────────────────────────────────────
export const receiptsRouter = router({
  get: protectedProcedure
    .input(z.object({ transactionId: z.string() }))
    .query(async ({ input }) => {
      const d = await requireDb();
      const [receipt] = await d.select().from(transactionReceipts)
        .where(eq(transactionReceipts.transactionId, input.transactionId)).limit(1);
      return receipt ?? null;
    }),

  getOrCreate: protectedProcedure
    .input(z.object({ transactionId: z.string(), merchantId: z.string().optional() }))
    .mutation(async ({ input, ctx }) => {
      const d = await requireDb();
      const existing = await d.select().from(transactionReceipts)
        .where(eq(transactionReceipts.transactionId, input.transactionId)).limit(1);
      if (existing[0]) {
        await d.update(transactionReceipts)
          .set({ viewCount: existing[0].viewCount + 1 })
          .where(eq(transactionReceipts.id, existing[0].id));
        return existing[0];
      }
      const now = new Date();
      const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
      const suffix = Math.random().toString(36).slice(2, 8).toUpperCase();
      const receiptNumber = `RCP-${dateStr}-${suffix}`;
      const [receipt] = await d.insert(transactionReceipts).values({
        id: crypto.randomUUID(),
        transactionId: input.transactionId,
        userId: ctx.user.id,
        merchantId: input.merchantId,
        receiptNumber,
      }).returning();
      return receipt;
    }),

  sendEmail: protectedProcedure
    .input(z.object({ transactionId: z.string(), emailAddress: z.string().email() }))
    .mutation(async ({ input }) => {
      const d = await requireDb();
      await d.update(transactionReceipts)
        .set({ emailSentAt: new Date(), emailAddress: input.emailAddress })
        .where(eq(transactionReceipts.transactionId, input.transactionId));
      return { sent: true };
    }),
});

// ─── Combined Wave 24 Router ──────────────────────────────────────────────────
export const wave24Router = router({
  helpAnalytics: helpAnalyticsRouter,
  featureFlags: featureFlagsRouter,
  merchantRisk: merchantRiskRouter,
  budgets: budgetsRouter,
  savingsGoals: savingsGoalsRouter,
  referrals: referralsRouter,
  chargebacks: chargebacksRouter,
  settlementSla: settlementSlaRouter,
  webhookSimulator: webhookSimulatorRouter,
  merchantActions: merchantActionsRouter,
  receipts: receiptsRouter,
});
