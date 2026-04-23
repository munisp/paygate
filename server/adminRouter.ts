/**
 * adminRouter.ts — Full Admin Portal tRPC Router
 *
 * Covers:
 *  1. Platform Overview (KPIs, revenue, active merchants)
 *  2. Merchant Management (list, approve, suspend, update fees)
 *  3. KYC Review Queue (list submissions, approve/reject)
 *  4. Dispute Management (platform-wide disputes, escalate, resolve)
 *  5. Fraud Oversight (platform-wide fraud alerts, ban, whitelist)
 *  6. Revenue & Fee Management (fee tiers, override, revenue summary)
 *  7. Settlement Management (platform settlements, force-settle)
 *  8. Compliance Reporting (AML flags, SAR generation, regulatory export)
 *  9. System Health (microservice status, DB health, queue depth)
 * 10. Audit Trail Admin (platform-wide audit log, export)
 * 11. Notification Center Admin (broadcast notifications)
 * 12. Configuration Panel (feature flags, rate limits, maintenance mode)
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { getDb } from "./db";
import { sql, eq, desc, and, gte, lte, like, count, sum } from "drizzle-orm";

// ─── Admin guard middleware ────────────────────────────────────────────────────
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const { users } = await import("../drizzle/schema");
  const [user] = await db.select({ role: users.role })
    .from(users)
    .where(eq(users.openId, ctx.user.openId))
    .limit(1);
  if (!user || user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

// ─── 1. Platform Overview ─────────────────────────────────────────────────────
const platformOverviewRouter = router({
  getKPIs: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const { merchants, transactions, users, disputes } = await import("../drizzle/schema");
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1);
    const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const endOfLastMonth = new Date(now.getFullYear(), now.getMonth(), 0);

    const [totalMerchants] = await db.select({ cnt: count() }).from(merchants);
    const [activeMerchants] = await db.select({ cnt: count() }).from(merchants)
      .where(eq(merchants.status, "active"));
    const [totalUsers] = await db.select({ cnt: count() }).from(users);
    const [totalTx] = await db.select({ cnt: count(), vol: sum(transactions.amount) })
      .from(transactions)
      .where(gte(transactions.createdAt, startOfMonth));
    const [lastMonthTx] = await db.select({ cnt: count(), vol: sum(transactions.amount) })
      .from(transactions)
      .where(and(
        gte(transactions.createdAt, startOfLastMonth),
        lte(transactions.createdAt, endOfLastMonth)
      ));
    const [openDisputes] = await db.select({ cnt: count() }).from(disputes)
      .where(eq(disputes.status, "open"));

    const thisVol = Number(totalTx?.vol ?? 0);
    const lastVol = Number(lastMonthTx?.vol ?? 0);
    const volumeGrowth = lastVol > 0 ? ((thisVol - lastVol) / lastVol) * 100 : 0;

    return {
      totalMerchants: totalMerchants?.cnt ?? 0,
      activeMerchants: activeMerchants?.cnt ?? 0,
      totalUsers: totalUsers?.cnt ?? 0,
      monthlyTransactions: totalTx?.cnt ?? 0,
      monthlyVolumeKobo: thisVol,
      volumeGrowthPct: Math.round(volumeGrowth * 10) / 10,
      openDisputes: openDisputes?.cnt ?? 0,
    };
  }),

  getRevenueTimeSeries: adminProcedure
    .input(z.object({ days: z.number().int().min(7).max(365).default(30) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { transactions } = await import("../drizzle/schema");
      const cutoff = new Date();
      cutoff.setDate(cutoff.getDate() - input.days);
      const rows = await db.select({
        date: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`,
        volume: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        txCount: sql<number>`count(*)`,
        successCount: sql<number>`count(*) filter (where ${transactions.status} = 'success')`,
      })
        .from(transactions)
        .where(gte(transactions.createdAt, cutoff))
        .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`)
        .orderBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD') asc`);
      return rows;
    }),

  getTopMerchants: adminProcedure
    .input(z.object({ limit: z.number().int().min(5).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { merchants, transactions } = await import("../drizzle/schema");
      const startOfMonth = new Date(new Date().getFullYear(), new Date().getMonth(), 1);
      const rows = await db.select({
        merchantId: merchants.id,
        businessName: merchants.businessName,
        currency: merchants.currency,
        volume: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        txCount: sql<number>`count(${transactions.id})`,
      })
        .from(merchants)
        .leftJoin(transactions, and(
          eq(transactions.merchantId, merchants.id),
          gte(transactions.createdAt, startOfMonth)
        ))
        .groupBy(merchants.id, merchants.businessName, merchants.currency)
        .orderBy(sql`sum(${transactions.amount}) desc nulls last`)
        .limit(input.limit);
      return rows;
    }),
});

// ─── 2. Merchant Management ───────────────────────────────────────────────────
const merchantMgmtRouter = router({
  listMerchants: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      search: z.string().optional(),
      status: z.enum(["active", "suspended", "pending", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { merchants: [], total: 0 };
      const { merchants } = await import("../drizzle/schema");
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.status !== "all") conditions.push(eq(merchants.status, input.status));
      if (input.search) conditions.push(like(merchants.businessName, `%${input.search}%`));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, [{ cnt }]] = await Promise.all([
        db.select().from(merchants)
          .where(whereClause)
          .orderBy(desc(merchants.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ cnt: count() }).from(merchants).where(whereClause),
      ]);
      return { merchants: rows, total: cnt ?? 0 };
    }),

  getMerchantDetail: adminProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchants, transactions, disputes } = await import("../drizzle/schema");
      const [merchant] = await db.select().from(merchants)
        .where(eq(merchants.id, input.merchantId)).limit(1);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND", message: "Merchant not found" });
      const [txStats] = await db.select({
        total: count(),
        volume: sum(transactions.amount),
      }).from(transactions).where(eq(transactions.merchantId, input.merchantId));
      const [disputeStats] = await db.select({ total: count() }).from(disputes)
        .where(eq(disputes.merchantId, input.merchantId));
      return { merchant, txStats, disputeStats };
    }),

  updateMerchantStatus: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      status: z.enum(["active", "suspended", "pending"]),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchants } = await import("../drizzle/schema");
      await db.update(merchants)
        .set({ status: input.status, updatedAt: new Date() })
        .where(eq(merchants.id, input.merchantId));
      return { updated: true, merchantId: input.merchantId, status: input.status };
    }),

  updateMerchantFees: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      feePercent: z.number().min(0).max(10),
      flatFeeKobo: z.number().int().min(0),
      tier: z.enum(["standard", "growth", "enterprise"]).default("standard"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchants } = await import("../drizzle/schema");
      await db.update(merchants)
        .set({
          feePercent: String(input.feePercent),
          flatFeeKobo: input.flatFeeKobo,
          tier: input.tier,
          updatedAt: new Date(),
        } as any)
        .where(eq(merchants.id, input.merchantId));
      return { updated: true };
    }),
});

// ─── 3. KYC Review Queue ──────────────────────────────────────────────────────
const kycReviewRouter = router({
  listPending: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      status: z.enum(["pending", "approved", "rejected", "all"]).default("pending"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { submissions: [], total: 0 };
      const { kycSubmissions } = await import("../drizzle/schema");
      const offset = (input.page - 1) * input.limit;
      const whereClause = input.status !== "all"
        ? eq(kycSubmissions.status, input.status as any)
        : undefined;
      const [rows, [{ cnt }]] = await Promise.all([
        db.select().from(kycSubmissions)
          .where(whereClause)
          .orderBy(desc(kycSubmissions.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ cnt: count() }).from(kycSubmissions).where(whereClause),
      ]);
      return { submissions: rows, total: cnt ?? 0 };
    }),

  reviewSubmission: adminProcedure
    .input(z.object({
      submissionId: z.number().int(),
      decision: z.enum(["approved", "rejected"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { kycSubmissions } = await import("../drizzle/schema");
      await db.update(kycSubmissions)
        .set({
          status: input.decision as any,
          reviewedAt: new Date(),
          reviewedBy: ctx.user.openId,
          rejectionReason: input.decision === 'rejected' ? (input.notes ?? null) : null,
          updatedAt: new Date(),
        } as any)
        .where(eq(kycSubmissions.id, input.submissionId as any));
      return { reviewed: true, decision: input.decision };
    }),

  getStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const { kycSubmissions } = await import("../drizzle/schema");
    const rows = await db.select({
      status: kycSubmissions.status,
      cnt: count(),
    }).from(kycSubmissions).groupBy(kycSubmissions.status);
    return rows.reduce((acc, r) => ({ ...acc, [r.status as string]: r.cnt }), {} as Record<string, number>);
  }),
});

// ─── 4. Dispute Management ────────────────────────────────────────────────────
const disputeMgmtRouter = router({
  listAll: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      status: z.enum(["open", "under_review", "resolved", "escalated", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { disputes: [], total: 0 };
      const { disputes } = await import("../drizzle/schema");
      const offset = (input.page - 1) * input.limit;
      const whereClause = input.status !== "all"
        ? eq(disputes.status, input.status as any)
        : undefined;
      const [rows, [{ cnt }]] = await Promise.all([
        db.select().from(disputes).where(whereClause)
          .orderBy(desc(disputes.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ cnt: count() }).from(disputes).where(whereClause),
      ]) as any;
      return { disputes: rows, total: cnt ?? 0 };
    }),

  resolveDispute: adminProcedure
    .input(z.object({
      disputeId: z.string(),
      resolution: z.enum(["merchant_wins", "customer_wins", "partial_refund"]),
      refundAmountKobo: z.number().int().min(0).optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { disputes } = await import("../drizzle/schema");
      await db.update(disputes)
        .set({
          status: "resolved" as any,
          resolution: input.resolution as any,
          resolvedAt: new Date(),
          adminNotes: input.notes ?? null,
        } as any)
        .where(eq(disputes.id, input.disputeId));
      return { resolved: true, resolution: input.resolution };
    }),

  escalateDispute: adminProcedure
    .input(z.object({ disputeId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { disputes } = await import("../drizzle/schema");
      await db.update(disputes)
        .set({ status: "escalated" as any, adminNotes: input.reason } as any)
        .where(eq(disputes.id, input.disputeId));
      return { escalated: true };
    }),
});

// ─── 5. Fraud Oversight ───────────────────────────────────────────────────────
const fraudOversightRouter = router({
  listAlerts: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      status: z.enum(["open", "acknowledged", "resolved", "all"]).default("all"),
      minScore: z.number().min(0).max(100).default(0),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { alerts: [], total: 0 };
      const { fraudAlerts } = await import("../drizzle/schema");
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.status !== "all") conditions.push(eq(fraudAlerts.status, input.status as any));
      if (input.minScore > 0) conditions.push(gte(fraudAlerts.riskScore, input.minScore));
      const whereClause = conditions.length > 0 ? and(...conditions) : undefined;
      const [rows, [{ cnt }]] = await Promise.all([
        db.select().from(fraudAlerts).where(whereClause)
          .orderBy(desc(fraudAlerts.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ cnt: count() }).from(fraudAlerts).where(whereClause),
      ]) as any;
      return { alerts: rows, total: cnt ?? 0 };
    }),

  banMerchant: adminProcedure
    .input(z.object({ merchantId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchants } = await import("../drizzle/schema");
      await db.update(merchants)
        .set({ status: "suspended" as any, updatedAt: new Date() } as any)
        .where(eq(merchants.id, input.merchantId));
      return { banned: true, merchantId: input.merchantId };
    }),

  getPlatformFraudStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const { fraudAlerts, transactions } = await import("../drizzle/schema");
    const last30 = new Date();
    last30.setDate(last30.getDate() - 30);
    const [alertStats] = await db.select({
      total: count(),
      highRisk: sql<number>`count(*) filter (where ${fraudAlerts.riskScore} >= 80)`,
      medRisk: sql<number>`count(*) filter (where ${fraudAlerts.riskScore} >= 50 and ${fraudAlerts.riskScore} < 80)`,
    }).from(fraudAlerts).where(gte(fraudAlerts.createdAt, last30));
    const [txStats] = await db.select({
      total: count(),
      blocked: sql<number>`count(*) filter (where ${transactions.status} = 'blocked')`,
    }).from(transactions).where(gte(transactions.createdAt, last30));
    return { alertStats, txStats };
  }),
});

// ─── 6. Revenue & Fee Management ─────────────────────────────────────────────
const revenueMgmtRouter = router({
  getSummary: adminProcedure
    .input(z.object({ period: z.enum(["day", "week", "month", "year"]).default("month") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const { transactions } = await import("../drizzle/schema");
      const cutoff = new Date();
      if (input.period === "day") cutoff.setDate(cutoff.getDate() - 1);
      else if (input.period === "week") cutoff.setDate(cutoff.getDate() - 7);
      else if (input.period === "month") cutoff.setMonth(cutoff.getMonth() - 1);
      else cutoff.setFullYear(cutoff.getFullYear() - 1);
      const [stats] = await db.select({
        totalVolume: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        totalFees: sql<number>`coalesce(sum(${transactions.feeAmount}), 0)`,
        txCount: count(),
        successCount: sql<number>`count(*) filter (where ${transactions.status} = 'success')`,
        avgTxSize: sql<number>`coalesce(avg(${transactions.amount}), 0)`,
      }).from(transactions).where(gte(transactions.createdAt, cutoff));
      return stats;
    }),

  getFeeTierConfig: adminProcedure.query(async () => {
    // Return current fee tier configuration
    return {
      tiers: [
        { name: "standard", feePercent: 1.5, flatFeeKobo: 10000, description: "Default tier for new merchants" },
        { name: "growth", feePercent: 1.2, flatFeeKobo: 7500, description: "For merchants with NGN 1M+ monthly volume" },
        { name: "enterprise", feePercent: 0.8, flatFeeKobo: 5000, description: "For merchants with NGN 10M+ monthly volume" },
      ],
      caps: {
        maxFeeKobo: 200000, // NGN 2,000 cap
        minFeeKobo: 5000,   // NGN 50 minimum
      },
    };
  }),

  getRevenueByMerchant: adminProcedure
    .input(z.object({
      limit: z.number().int().min(5).max(100).default(20),
      period: z.enum(["month", "quarter", "year"]).default("month"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const { transactions, merchants } = await import("../drizzle/schema");
      const cutoff = new Date();
      if (input.period === "month") cutoff.setMonth(cutoff.getMonth() - 1);
      else if (input.period === "quarter") cutoff.setMonth(cutoff.getMonth() - 3);
      else cutoff.setFullYear(cutoff.getFullYear() - 1);
      const rows = await db.select({
        merchantId: merchants.id,
        businessName: merchants.businessName,
        volume: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        fees: sql<number>`coalesce(sum(${transactions.feeAmount}), 0)`,
        txCount: count(transactions.id),
      })
        .from(merchants)
        .leftJoin(transactions, and(
          eq(transactions.merchantId, merchants.id),
          gte(transactions.createdAt, cutoff),
          sql`${transactions.status} = 'success'`
        ))
        .groupBy(merchants.id, merchants.businessName)
        .orderBy(sql`sum(${transactions.feeAmount}) desc nulls last`)
        .limit(input.limit);
      return rows;
    }),
});

// ─── 7. Settlement Management ─────────────────────────────────────────────────
const settlementMgmtRouter = router({
  listAll: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      status: z.enum(["pending", "processing", "completed", "failed", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { settlements: [], total: 0 };
      const { settlements } = await import("../drizzle/schema");
      const offset = (input.page - 1) * input.limit;
      const whereClause = input.status !== "all"
        ? eq(settlements.status, input.status as any)
        : undefined;
      const [rows, [{ cnt }]] = await Promise.all([
        db.select().from(settlements)
          .where(whereClause)
          .orderBy(desc(settlements.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ cnt: count() }).from(settlements).where(whereClause),
      ]);
      return { settlements: rows, total: cnt ?? 0 };
    }),

  forceSettle: adminProcedure
    .input(z.object({ settlementId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { settlements } = await import("../drizzle/schema");
      await db.update(settlements)
        .set({ status: "processing" as any, updatedAt: new Date() } as any)
        .where(eq(settlements.id, input.settlementId));
      return { forced: true, settlementId: input.settlementId };
    }),

  getSettlementStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const { settlements } = await import("../drizzle/schema");
    const rows = await db.select({
      status: settlements.status,
      cnt: count(),
      totalAmount: sql<number>`coalesce(sum(${settlements.amount}), 0)`,
    }).from(settlements).groupBy(settlements.status);
    return rows;
  }),
});

// ─── 8. Compliance Reporting ──────────────────────────────────────────────────
const complianceRouter = router({
  getAMLFlags: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(100).default(20),
      severity: z.enum(["low", "medium", "high", "critical", "all"]).default("all"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { flags: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      // Query audit_events for AML-tagged events
      const rows = await db.execute(
        sql`SELECT id, merchant_id, action, metadata, created_at
            FROM audit_events
            WHERE action LIKE 'aml.%'
            ORDER BY created_at DESC
            LIMIT ${input.limit} OFFSET ${offset}`
      );
      const [{ cnt }] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM audit_events WHERE action LIKE 'aml.%'`
      ) as any;
      return {
        flags: (Array.from(rows as any) as any[]).map(r => ({
          id: r.id,
          merchantId: r.merchant_id,
          action: r.action,
          metadata: r.metadata,
          createdAt: r.created_at,
        })),
        total: Number(cnt?.cnt ?? 0),
      };
    }),

  generateSARReport: adminProcedure
    .input(z.object({
      merchantId: z.string(),
      startDate: z.string(),
      endDate: z.string(),
      reason: z.string(),
    }))
    .mutation(async ({ input }) => {
      // Generate a Suspicious Activity Report summary
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { transactions, merchants } = await import("../drizzle/schema");
      const [merchant] = await db.select().from(merchants)
        .where(eq(merchants.id, input.merchantId)).limit(1);
      if (!merchant) throw new TRPCError({ code: "NOT_FOUND" });
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const [txStats] = await db.select({
        total: count(),
        volume: sum(transactions.amount),
        avgSize: sql<number>`avg(${transactions.amount})`,
      }).from(transactions).where(and(
        eq(transactions.merchantId, input.merchantId),
        gte(transactions.createdAt, start),
        lte(transactions.createdAt, end)
      ));
      return {
        reportId: `SAR-${Date.now()}`,
        merchantId: input.merchantId,
        businessName: merchant.businessName,
        period: { start: input.startDate, end: input.endDate },
        reason: input.reason,
        summary: txStats,
        generatedAt: new Date().toISOString(),
        status: "draft",
      };
    }),

  getRegulatoryExport: adminProcedure
    .input(z.object({
      reportType: z.enum(["cbn_monthly", "efcc_suspicious", "nfiu_ctr", "custom"]),
      startDate: z.string(),
      endDate: z.string(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], reportType: input.reportType };
      const { transactions } = await import("../drizzle/schema");
      const start = new Date(input.startDate);
      const end = new Date(input.endDate);
      const rows = await db.select({
        date: sql<string>`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`,
        count: count(),
        volume: sql<number>`coalesce(sum(${transactions.amount}), 0)`,
        currency: transactions.currency,
      })
        .from(transactions)
        .where(and(gte(transactions.createdAt, start), lte(transactions.createdAt, end)))
        .groupBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD')`, transactions.currency)
        .orderBy(sql`to_char(${transactions.createdAt}, 'YYYY-MM-DD') asc`);
      return { rows, reportType: input.reportType, generatedAt: new Date().toISOString() };
    }),
});

// ─── 9. System Health ─────────────────────────────────────────────────────────
const systemHealthRouter = router({
  getOverview: adminProcedure.query(async () => {
    const services = [
      { name: "PostgreSQL/TiDB", endpoint: process.env.DATABASE_URL ? "configured" : "missing", critical: true },
      { name: "Go Bridge", endpoint: process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8080", critical: true },
      { name: "Digital Gold Service", endpoint: process.env.DIGITAL_GOLD_SERVICE_URL ?? "http://digital-gold-service:9020", critical: false },
      { name: "Mutual Funds Service", endpoint: process.env.MUTUAL_FUNDS_SERVICE_URL ?? "http://mutual-funds-service:9021", critical: false },
      { name: "Pension Service", endpoint: process.env.PENSION_SERVICE_URL ?? "http://pension-service:9022", critical: false },
      { name: "EMI Service", endpoint: process.env.EMI_SERVICE_URL ?? "http://emi-service:9025", critical: false },
      { name: "Remittance Service", endpoint: process.env.INTL_REMITTANCE_SERVICE_URL ?? "http://intl-remittance-service:9029", critical: false },
      { name: "Soundbox Service", endpoint: process.env.SOUNDBOX_SERVICE_URL ?? "http://soundbox-service:9023", critical: false },
      { name: "Wealth Management", endpoint: process.env.WEALTH_MGMT_SERVICE_URL ?? "http://wealth-mgmt-service:9024", critical: false },
      { name: "Bulk Collections", endpoint: process.env.BULK_COLLECTIONS_SERVICE_URL ?? "http://bulk-collections-service:9026", critical: false },
    ];

    // Ping each service
    const results = await Promise.allSettled(
      services.map(async (svc) => {
        if (svc.endpoint === "configured" || svc.endpoint === "missing") {
          return { ...svc, status: svc.endpoint === "configured" ? "healthy" : "degraded", latencyMs: 0 };
        }
        const start = Date.now();
        try {
          const res = await fetch(`${svc.endpoint}/health`, { signal: AbortSignal.timeout(3000) });
          return { ...svc, status: res.ok ? "healthy" : "degraded", latencyMs: Date.now() - start };
        } catch {
          return { ...svc, status: "down", latencyMs: Date.now() - start };
        }
      })
    );

    return results.map((r, i) =>
      r.status === "fulfilled" ? r.value : { ...services[i], status: "down", latencyMs: 0 }
    );
  }),

  getDatabaseStats: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return null;
    const tables = ["users", "merchants", "transactions", "disputes", "fraud_alerts", "kyc_submissions", "settlements"];
    const counts = await Promise.all(
      tables.map(async (table) => {
        try {
          const [{ cnt }] = await db.execute(sql`SELECT COUNT(*) as cnt FROM ${sql.identifier(table)}`) as any;
          return { table, count: Number(cnt ?? 0) };
        } catch {
          return { table, count: -1 };
        }
      })
    );
    return counts;
  }),

  getIndexHealth: adminProcedure.query(async () => {
    const db = await getDb();
    if (!db) return { indexes: [], tables: [], summary: { totalIndexes: 0, unusedIndexes: 0, bloatedTables: 0 } };
    try {
      // Unused indexes (scans == 0, not primary keys)
      const unusedIndexes = await db.execute(sql.raw(`
        SELECT
          schemaname,
          tablename,
          indexname,
          idx_scan AS scans,
          idx_tup_read AS tuples_read,
          idx_tup_fetch AS tuples_fetched,
          pg_size_pretty(pg_relation_size(indexrelid)) AS index_size,
          pg_relation_size(indexrelid) AS index_size_bytes
        FROM pg_stat_user_indexes
        WHERE idx_scan = 0
          AND indexname NOT LIKE '%_pkey'
          AND indexname NOT LIKE '%_unique'
        ORDER BY pg_relation_size(indexrelid) DESC
        LIMIT 30
      `));

      // All indexes with usage stats
      const allIndexes = await db.execute(sql.raw(`
        SELECT
          s.schemaname,
          s.tablename,
          s.indexname,
          s.idx_scan AS scans,
          s.idx_tup_read AS tuples_read,
          pg_size_pretty(pg_relation_size(s.indexrelid)) AS index_size,
          pg_relation_size(s.indexrelid) AS index_size_bytes,
          CASE WHEN s.idx_scan = 0 AND s.indexname NOT LIKE '%_pkey' THEN true ELSE false END AS is_unused
        FROM pg_stat_user_indexes s
        ORDER BY pg_relation_size(s.indexrelid) DESC
        LIMIT 50
      `));

      // Table bloat and seq scan stats
      const tableStats = await db.execute(sql.raw(`
        SELECT
          schemaname,
          relname AS tablename,
          seq_scan,
          seq_tup_read,
          idx_scan,
          n_tup_ins AS inserts,
          n_tup_upd AS updates,
          n_tup_del AS deletes,
          n_live_tup AS live_tuples,
          n_dead_tup AS dead_tuples,
          CASE WHEN n_live_tup > 0 THEN ROUND((n_dead_tup::numeric / n_live_tup) * 100, 2) ELSE 0 END AS bloat_pct,
          pg_size_pretty(pg_total_relation_size(relid)) AS total_size,
          pg_total_relation_size(relid) AS total_size_bytes,
          last_vacuum,
          last_autovacuum,
          last_analyze,
          last_autoanalyze
        FROM pg_stat_user_tables
        ORDER BY pg_total_relation_size(relid) DESC
        LIMIT 30
      `));

      // Cache hit ratio
      const cacheStats = await db.execute(sql.raw(`
        SELECT
          SUM(heap_blks_hit) AS heap_hits,
          SUM(heap_blks_read) AS heap_reads,
          CASE WHEN SUM(heap_blks_hit) + SUM(heap_blks_read) > 0
            THEN ROUND((SUM(heap_blks_hit)::numeric / (SUM(heap_blks_hit) + SUM(heap_blks_read))) * 100, 2)
            ELSE 0
          END AS cache_hit_pct
        FROM pg_statio_user_tables
      `));

      const indexArr = Array.from(allIndexes as any);
      const tableArr = Array.from(tableStats as any);
      const cacheArr = Array.from(cacheStats as any);
      const unusedArr = Array.from(unusedIndexes as any);

      const bloatedTables = tableArr.filter((t: any) => Number(t.bloat_pct) > 20).length;

      return {
        indexes: indexArr,
        tables: tableArr,
        unusedIndexes: unusedArr,
        cacheHitPct: (cacheArr[0] as any)?.cache_hit_pct ?? 0,
        summary: {
          totalIndexes: indexArr.length,
          unusedIndexes: unusedArr.length,
          bloatedTables,
          cacheHitPct: (cacheArr[0] as any)?.cache_hit_pct ?? 0,
        },
      };
    } catch (e: any) {
      // pg_stat_* views may not be available on all DB engines (e.g. TiDB)
      return {
        indexes: [],
        tables: [],
        unusedIndexes: [],
        cacheHitPct: 0,
        summary: { totalIndexes: 0, unusedIndexes: 0, bloatedTables: 0, cacheHitPct: 0, error: e.message },
      };
    }
  }),

  // ─── Slow Queries (pg_stat_statements) ─────────────────────────────────────
  getSlowQueries: adminProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      thresholdMs: z.number().min(0).default(500),
      orderBy: z.enum(["mean_exec_time", "total_exec_time", "calls", "max_exec_time"]).default("mean_exec_time"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], error: "DB unavailable" };
      // Whitelist the order column to prevent injection
      const ORDER_COLS: Record<string, string> = {
        mean_exec_time: "mean_exec_time",
        total_exec_time: "total_exec_time",
        calls: "calls",
        max_exec_time: "max_exec_time",
      };
      const orderCol = ORDER_COLS[input.orderBy] ?? "mean_exec_time";
      const safeLimit = Math.min(Math.max(1, input.limit), 100);
      try {
        const rows = await db.execute(sql.raw(`
          SELECT
            queryid::text                                                   AS queryid,
            LEFT(query, 300)                                                AS query_preview,
            calls,
            ROUND(mean_exec_time::numeric, 2)                              AS mean_exec_time_ms,
            ROUND(max_exec_time::numeric, 2)                               AS max_exec_time_ms,
            ROUND(min_exec_time::numeric, 2)                               AS min_exec_time_ms,
            ROUND(total_exec_time::numeric, 2)                             AS total_exec_time_ms,
            ROUND(stddev_exec_time::numeric, 2)                            AS stddev_exec_time_ms,
            rows,
            ROUND(
              (shared_blks_hit::numeric /
               NULLIF(shared_blks_hit + shared_blks_read, 0)) * 100, 2
            )                                                              AS cache_hit_pct,
            shared_blks_read,
            shared_blks_hit,
            temp_blks_written,
            blk_read_time,
            blk_write_time
          FROM pg_stat_statements
          WHERE mean_exec_time >= ${input.thresholdMs}
            AND query NOT LIKE '%pg_stat_statements%'
            AND query NOT LIKE '%pg_class%'
            AND query NOT LIKE '%pg_stat%'
          ORDER BY ${orderCol} DESC
          LIMIT ${safeLimit}
        `));
        return { rows: Array.from(rows as any), error: null };
      } catch (e: any) {
        if (e.message?.includes("pg_stat_statements")) {
          return {
            rows: [],
            error: "pg_stat_statements extension not loaded. Run: CREATE EXTENSION IF NOT EXISTS pg_stat_statements;",
          };
        }
        return { rows: [], error: e.message };
      }
    }),

  resetSlowQueryStats: adminProcedure
    .mutation(async () => {
      const db = await getDb();
      if (!db) return { success: false, error: "DB unavailable" };
      try {
        await db.execute(sql.raw(`SELECT pg_stat_statements_reset()`));
        return { success: true, resetAt: new Date().toISOString() };
      } catch (e: any) {
        return { success: false, error: e.message };
      }
    }),
});

// ─── 10. Audit Trail Admin ────────────────────────────────────────────────────
const auditAdminRouter = router({
  listAll: adminProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(10).max(200).default(50),
      action: z.string().optional(),
      merchantId: z.string().optional(),
      startDate: z.string().optional(),
      endDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [], total: 0 };
      const offset = (input.page - 1) * input.limit;
      // Build fully parameterized conditions using Drizzle sql template literals
      const whereParts: any[] = [];
      if (input.action) whereParts.push(sql`action LIKE ${'%' + input.action + '%'}`);
      if (input.merchantId) whereParts.push(sql`merchant_id = ${input.merchantId}`);
      if (input.startDate) whereParts.push(sql`created_at >= ${new Date(input.startDate)}`);
      if (input.endDate) whereParts.push(sql`created_at <= ${new Date(input.endDate)}`);
      const safeLimit = Math.min(Math.max(1, input.limit), 500);
      const safeOffset = Math.max(0, offset);
      const whereClause = whereParts.length > 0
        ? sql`WHERE ${sql.join(whereParts, sql` AND `)}`
        : sql``;
      const rows = await db.execute(
        sql`SELECT * FROM audit_events ${whereClause} ORDER BY created_at DESC LIMIT ${safeLimit} OFFSET ${safeOffset}`
      );
      const [{ cnt }] = await db.execute(
        sql`SELECT COUNT(*) as cnt FROM audit_events ${whereClause}`
      ) as any;
      return { events: Array.from((rows as any)), total: Number(cnt?.cnt ?? 0) };
    }),

  exportCSV: adminProcedure
    .input(z.object({
      startDate: z.string(),
      endDate: z.string(),
      merchantId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const rows = await db.execute(
        sql`SELECT id, merchant_id, actor_id, actor_name, action, resource, resource_id, ip_address, created_at
            FROM audit_events
            WHERE created_at BETWEEN ${new Date(input.startDate)} AND ${new Date(input.endDate)}
            ${input.merchantId ? sql`AND merchant_id = ${input.merchantId}` : sql``}
            ORDER BY created_at DESC
            LIMIT 10000`
      );
      // Return as CSV string
      const headers = ["id", "merchant_id", "actor_id", "actor_name", "action", "resource", "resource_id", "ip_address", "created_at"];
      const csvRows = (Array.from(rows as any) as any[]).map(r =>
        headers.map(h => JSON.stringify(r[h] ?? "")).join(",")
      );
      return { csv: [headers.join(","), ...csvRows].join("\n"), rowCount: csvRows.length };
    }),
});

// ─── 11. Notification Center Admin ───────────────────────────────────────────
const notifAdminRouter = router({
  broadcast: adminProcedure
    .input(z.object({
      title: z.string().min(1).max(200),
      message: z.string().min(1).max(2000),
      targetType: z.enum(["all_merchants", "specific_merchants", "all_users"]),
      merchantIds: z.array(z.string()).optional(),
      priority: z.enum(["low", "normal", "high", "critical"]).default("normal"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchants } = await import("../drizzle/schema");
      let targetMerchantIds: string[] = [];
      if (input.targetType === "all_merchants") {
        const allMerchants = await db.select({ id: merchants.id }).from(merchants)
          .where(eq(merchants.status, "active"));
        targetMerchantIds = allMerchants.map(m => m.id);
      } else if (input.targetType === "specific_merchants" && input.merchantIds) {
        targetMerchantIds = input.merchantIds;
      }
      // Insert notifications for each target merchant
      if (targetMerchantIds.length > 0) {
        const { createMerchantNotification } = await import("./db");
        await Promise.all(
          targetMerchantIds.slice(0, 500).map(mId =>
            createMerchantNotification({
              merchantId: mId,
              type: "system_broadcast",
              title: input.title,
              message: input.message,
              priority: input.priority,
            } as any).catch(() => null)
          )
        );
      }
      return {
        sent: true,
        recipientCount: targetMerchantIds.length,
        broadcastId: `bcast_${Date.now()}`,
      };
    }),

  listBroadcasts: adminProcedure
    .input(z.object({ limit: z.number().int().min(5).max(100).default(20) }))
    .query(async () => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(
        sql`SELECT type, title, message, created_at, COUNT(*) as recipient_count
            FROM merchant_notifications
            WHERE type = 'system_broadcast'
            GROUP BY type, title, message, created_at
            ORDER BY created_at DESC
            LIMIT 20`
      );
      return Array.from((rows as any));
    }),
});

// ─── 12. Configuration Panel ──────────────────────────────────────────────────
const configPanelRouter = router({
  getFeatureFlags: adminProcedure.query(async () => {
    // Return current feature flag configuration
    return {
      flags: [
        { key: "digital_gold_enabled", value: true, description: "Enable Digital Gold trading" },
        { key: "mutual_funds_enabled", value: true, description: "Enable Mutual Funds investment" },
        { key: "pension_nps_enabled", value: true, description: "Enable Pension/NPS contributions" },
        { key: "international_remittance_enabled", value: true, description: "Enable international remittance" },
        { key: "emi_checkout_enabled", value: true, description: "Enable EMI checkout" },
        { key: "bnpl_enabled", value: true, description: "Enable Buy Now Pay Later" },
        { key: "crypto_ramp_enabled", value: false, description: "Enable crypto on/off ramp" },
        { key: "consumer_portal_enabled", value: true, description: "Enable consumer portal" },
        { key: "ollama_ai_enabled", value: true, description: "Enable local Ollama AI features" },
        { key: "maintenance_mode", value: false, description: "Put platform in maintenance mode" },
      ],
    };
  }),

  updateFeatureFlag: adminProcedure
    .input(z.object({
      key: z.string().min(1),
      value: z.boolean(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      // In production, this would update a feature_flags table or Redis key
      return { updated: true, key: input.key, value: input.value };
    }),

  getRateLimits: adminProcedure.query(async () => {
    return {
      limits: [
        { endpoint: "/api/trpc", requestsPerMinute: 600, burstLimit: 100 },
        { endpoint: "/api/trpc/transactions.create", requestsPerMinute: 60, burstLimit: 10 },
        { endpoint: "/api/trpc/payouts.create", requestsPerMinute: 30, burstLimit: 5 },
        { endpoint: "/api/trpc/auth.login", requestsPerMinute: 10, burstLimit: 3 },
        { endpoint: "/api/stripe/webhook", requestsPerMinute: 300, burstLimit: 50 },
      ],
    };
  }),

  setMaintenanceMode: adminProcedure
    .input(z.object({ enabled: z.boolean(), message: z.string().optional() }))
    .mutation(async ({ input }) => {
      // In production, update Redis key or env var
      return {
        maintenanceMode: input.enabled,
        message: input.message ?? "Platform is under maintenance. Please try again later.",
        updatedAt: new Date().toISOString(),
      };
    }),
});

// ─── Admin Webhook Failure Alerts Router ────────────────────────────────────
const webhookAlertsAdminRouter = router({
  summary: adminProcedure
    .input(z.object({ windowMinutes: z.number().min(5).max(1440).default(60) }))
    .query(async ({ input }) => {
      const { getAdminWebhookFailureSummary } = await import('./webhookFailureAlerts');
      return getAdminWebhookFailureSummary(input.windowMinutes);
    }),
  acknowledge: adminProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ input }) => {
      const { acknowledgeAlert } = await import('./webhookFailureAlerts');
      acknowledgeAlert(input.deliveryId);
      return { acknowledged: true, deliveryId: input.deliveryId };
    }),
  acknowledgeAll: adminProcedure
    .input(z.object({ windowMinutes: z.number().min(5).max(1440).default(60) }))
    .mutation(async ({ input }) => {
      const { getAdminWebhookFailureSummary, acknowledgeAlert } = await import('./webhookFailureAlerts');
      const summary = await getAdminWebhookFailureSummary(input.windowMinutes);
      summary.recentFailures.forEach((f) => acknowledgeAlert(f.id));
      return { acknowledged: summary.recentFailures.length };
    }),
  poll: adminProcedure
    .query(async () => {
      const { pollWebhookFailures } = await import('./webhookFailureAlerts');
      return pollWebhookFailures();
    }),
});

// ─── Compose Admin Router ─────────────────────────────────────────────────────
export const adminRouter = router({
  overview: platformOverviewRouter,
  merchants: merchantMgmtRouter,
  kyc: kycReviewRouter,
  disputes: disputeMgmtRouter,
  fraud: fraudOversightRouter,
  revenue: revenueMgmtRouter,
  settlements: settlementMgmtRouter,
  compliance: complianceRouter,
  health: systemHealthRouter,
  audit: auditAdminRouter,
  notifications: notifAdminRouter,
  config: configPanelRouter,
  webhookAlerts: webhookAlertsAdminRouter,
});
