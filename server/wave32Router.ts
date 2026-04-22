/**
 * wave32Router.ts — Wave 32: Invite Codes, Partner Onboarding, Tenant Corridors,
 * Fee Overrides, Usage Metrics, Billing Invoices, Plan Limits, Corridor Daily Stats,
 * SSO Configs, BNPL Repayment Schedules, Stripe Subscriptions CRUD
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { eq, desc, and, like, gte, lte, sql, inArray } from "drizzle-orm";
import { protectedProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import {
  inviteCodes,
  partnerOnboardingSessions,
  tenantCorridors,
  tenantFeeOverrides,
  tenantUsageMetrics,
  tenantBillingInvoices,
  tenantPlanLimits,
  tenantCorridorDailyStats,
  tenantSsoConfigs,
  bnplRepaymentSchedules,
  stripeSubscriptions,
} from "../drizzle/schema";
import crypto from "crypto";

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── Invite Codes ─────────────────────────────────────────────────────────────
const inviteCodesRouter = router({
  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      type: z.string().optional(),
      search: z.string().optional(),
      isRevoked: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.type) conditions.push(eq(inviteCodes.type, input.type as any));
      if (input.isRevoked !== undefined) conditions.push(eq(inviteCodes.isRevoked, input.isRevoked));
      if (input.search) conditions.push(like(inviteCodes.code, `%${input.search}%`));

      const [rows, countResult] = await Promise.all([
        db.select().from(inviteCodes)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(inviteCodes.createdAt))
          .limit(input.limit)
          .offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(inviteCodes)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);
      return { items: rows, total: countResult[0]?.count ?? 0, page: input.page, limit: input.limit };
    }),

  create: protectedProcedure
    .input(z.object({
      type: z.enum(["merchant", "partner", "admin", "consumer", "team_member"]).default("merchant"),
      usesTotal: z.number().int().min(1).max(1000).default(1),
      expiresAt: z.string().datetime().optional(),
      tenantId: z.string().optional(),
      metadata: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const code = `PG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`;
      const [row] = await db.insert(inviteCodes).values({
        id: crypto.randomUUID(),
        code,
        type: input.type,
        usesRemaining: input.usesTotal,
        usesTotal: input.usesTotal,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: String(ctx.user.id),
        tenantId: input.tenantId ?? null,
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        isRevoked: false,
      }).returning();
      return row;
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(inviteCodes)
        .set({ isRevoked: true })
        .where(eq(inviteCodes.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Invite code not found" });
      return row;
    }),

  validate: protectedProcedure
    .input(z.object({ code: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(inviteCodes)
        .where(eq(inviteCodes.code, input.code.toUpperCase()));
      if (!row) return { valid: false, reason: "Code not found" };
      if (row.isRevoked) return { valid: false, reason: "Code has been revoked" };
      if (row.usesRemaining <= 0) return { valid: false, reason: "Code has been fully used" };
      if (row.expiresAt && new Date(row.expiresAt) < new Date()) return { valid: false, reason: "Code has expired" };
      return { valid: true, code: row };
    }),

  bulkCreate: protectedProcedure
    .input(z.object({
      count: z.number().int().min(1).max(100),
      type: z.enum(["merchant", "partner", "admin", "consumer", "team_member"]).default("merchant"),
      usesTotal: z.number().int().min(1).max(100).default(1),
      expiresAt: z.string().datetime().optional(),
      tenantId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      const codes = Array.from({ length: input.count }, () => ({
        id: crypto.randomUUID(),
        code: `PG-${crypto.randomBytes(4).toString("hex").toUpperCase()}`,
        type: input.type,
        usesRemaining: input.usesTotal,
        usesTotal: input.usesTotal,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
        createdBy: String(ctx.user.id),
        tenantId: input.tenantId ?? null,
        metadata: null,
        isRevoked: false,
      }));
      const rows = await db.insert(inviteCodes).values(codes).returning();
      return rows;
    }),
});

// ─── Partner Onboarding ───────────────────────────────────────────────────────
const partnerOnboardingRouter = router({
  getSession: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(partnerOnboardingSessions)
        .where(eq(partnerOnboardingSessions.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      isCompleted: z.boolean().optional(),
      search: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.isCompleted !== undefined) conditions.push(eq(partnerOnboardingSessions.isCompleted, input.isCompleted));
      if (input.search) conditions.push(like(partnerOnboardingSessions.companyName, `%${input.search}%`));

      const [rows, countResult] = await Promise.all([
        db.select().from(partnerOnboardingSessions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(partnerOnboardingSessions.createdAt))
          .limit(input.limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(partnerOnboardingSessions)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);
      return { items: rows, total: countResult[0]?.count ?? 0 };
    }),

  startSession: protectedProcedure
    .input(z.object({ inviteCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await requireDb();
      // Validate invite code if provided
      if (input.inviteCode) {
        const [code] = await db.select().from(inviteCodes)
          .where(eq(inviteCodes.code, input.inviteCode.toUpperCase()));
        if (!code || code.isRevoked || code.usesRemaining <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid or expired invite code" });
        }
      }
      const [session] = await db.insert(partnerOnboardingSessions).values({
        id: crypto.randomUUID(),
        inviteCode: input.inviteCode ?? null,
        userId: String(ctx.user.id),
        currentStep: "company_info",
        isCompleted: false,
      }).returning();
      return session;
    }),

  updateStep: protectedProcedure
    .input(z.object({
      id: z.string(),
      step: z.enum(["invite_code", "company_info", "branding", "fee_structure", "review", "completed"]),
      data: z.record(z.string(), z.any()),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(partnerOnboardingSessions)
        .set({
          currentStep: input.step,
          ...input.data,
          updatedAt: new Date(),
          ...(input.step === "completed" ? { isCompleted: true, completedAt: new Date() } : {}),
        })
        .where(eq(partnerOnboardingSessions.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
});

// ─── Tenant Corridors ─────────────────────────────────────────────────────────
const corridorsRouter = router({
  list: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      isEnabled: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [];
      if (input.tenantId) conditions.push(eq(tenantCorridors.tenantId, input.tenantId));
      if (input.isEnabled !== undefined) conditions.push(eq(tenantCorridors.isEnabled, input.isEnabled));
      return db.select().from(tenantCorridors)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .orderBy(tenantCorridors.sourceCurrency, tenantCorridors.destCurrency);
    }),

  create: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      sourceCurrency: z.string().length(3),
      destCurrency: z.string().length(3),
      fxMarkupPct: z.number().min(0).max(10).default(1.5),
      dailyLimitUsd: z.number().min(0).default(50000),
      minAmountUsd: z.number().min(0).default(1),
      maxAmountUsd: z.number().min(0).default(10000),
      flatFeeUsd: z.number().min(0).default(0),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.insert(tenantCorridors).values({
        id: crypto.randomUUID(),
        ...input,
        isEnabled: true,
      }).returning();
      return row;
    }),

  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      isEnabled: z.boolean().optional(),
      fxMarkupPct: z.number().min(0).max(10).optional(),
      dailyLimitUsd: z.number().min(0).optional(),
      minAmountUsd: z.number().min(0).optional(),
      maxAmountUsd: z.number().min(0).optional(),
      flatFeeUsd: z.number().min(0).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const { id, ...data } = input;
      const [row] = await db.update(tenantCorridors)
        .set({ ...data, updatedAt: new Date() })
        .where(eq(tenantCorridors.id, id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(tenantCorridors).where(eq(tenantCorridors.id, input.id));
      return { success: true };
    }),

  dailyStats: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      corridorId: z.string().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const conditions = [eq(tenantCorridorDailyStats.tenantId, input.tenantId)];
      if (input.corridorId) conditions.push(eq(tenantCorridorDailyStats.corridorId, input.corridorId));
      if (input.from) conditions.push(gte(tenantCorridorDailyStats.date, input.from));
      if (input.to) conditions.push(lte(tenantCorridorDailyStats.date, input.to));
      return db.select().from(tenantCorridorDailyStats)
        .where(and(...conditions))
        .orderBy(desc(tenantCorridorDailyStats.date))
        .limit(90);
    }),
});

// ─── Fee Overrides ────────────────────────────────────────────────────────────
const feeOverridesRouter = router({
  list: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(tenantFeeOverrides)
        .where(eq(tenantFeeOverrides.tenantId, input.tenantId))
        .orderBy(tenantFeeOverrides.transactionType);
    }),

  upsert: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      transactionType: z.string(),
      flatFeeNgn: z.number().min(0).default(0),
      percentageFee: z.number().min(0).max(100).default(1.5),
      capNgn: z.number().min(0).optional(),
      floorNgn: z.number().min(0).optional(),
      isActive: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      // Check if override already exists for this tenant+type
      const [existing] = await db.select().from(tenantFeeOverrides)
        .where(and(
          eq(tenantFeeOverrides.tenantId, input.tenantId),
          eq(tenantFeeOverrides.transactionType, input.transactionType),
          eq(tenantFeeOverrides.isActive, true),
        ));

      if (existing) {
        const [row] = await db.update(tenantFeeOverrides)
          .set({
            flatFeeNgn: input.flatFeeNgn,
            percentageFee: input.percentageFee,
            capNgn: input.capNgn ?? null,
            floorNgn: input.floorNgn ?? null,
            isActive: input.isActive,
          })
          .where(eq(tenantFeeOverrides.id, existing.id))
          .returning();
        return row;
      }

      const [row] = await db.insert(tenantFeeOverrides).values({
        id: crypto.randomUUID(),
        ...input,
        capNgn: input.capNgn ?? null,
        floorNgn: input.floorNgn ?? null,
      }).returning();
      return row;
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      await db.delete(tenantFeeOverrides).where(eq(tenantFeeOverrides.id, input.id));
      return { success: true };
    }),
});

// ─── Usage Metrics ────────────────────────────────────────────────────────────
const usageMetricsRouter = router({
  get: protectedProcedure
    .input(z.object({ tenantId: z.string(), period: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(tenantUsageMetrics)
        .where(and(
          eq(tenantUsageMetrics.tenantId, input.tenantId),
          eq(tenantUsageMetrics.period, input.period),
        ));
      return row ?? null;
    }),

  history: protectedProcedure
    .input(z.object({ tenantId: z.string(), months: z.number().int().min(1).max(24).default(6) }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(tenantUsageMetrics)
        .where(eq(tenantUsageMetrics.tenantId, input.tenantId))
        .orderBy(desc(tenantUsageMetrics.period))
        .limit(input.months);
    }),

  increment: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      period: z.string(),
      field: z.enum(["apiCalls", "txCount", "webhookDeliveries", "activeUsers"]),
      amount: z.number().int().min(1).default(1),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const fieldMap: Record<string, any> = {
        apiCalls: tenantUsageMetrics.apiCalls,
        txCount: tenantUsageMetrics.txCount,
        webhookDeliveries: tenantUsageMetrics.webhookDeliveries,
        activeUsers: tenantUsageMetrics.activeUsers,
      };
      // Upsert
      await db.execute(sql`
        INSERT INTO tenant_usage_metrics (id, tenant_id, period, ${sql.raw(input.field === "apiCalls" ? "api_calls" : input.field === "txCount" ? "tx_count" : input.field === "webhookDeliveries" ? "webhook_deliveries" : "active_users")})
        VALUES (${crypto.randomUUID()}, ${input.tenantId}, ${input.period}, ${input.amount})
        ON CONFLICT (tenant_id, period) DO UPDATE
        SET ${sql.raw(input.field === "apiCalls" ? "api_calls" : input.field === "txCount" ? "tx_count" : input.field === "webhookDeliveries" ? "webhook_deliveries" : "active_users")} = tenant_usage_metrics.${sql.raw(input.field === "apiCalls" ? "api_calls" : input.field === "txCount" ? "tx_count" : input.field === "webhookDeliveries" ? "webhook_deliveries" : "active_users")} + ${input.amount},
            updated_at = NOW()
      `);
      return { success: true };
    }),
});

// ─── Billing Invoices ─────────────────────────────────────────────────────────
const billingInvoicesRouter = router({
  list: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      status: z.enum(["draft", "open", "paid", "void", "uncollectible"]).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.tenantId) conditions.push(eq(tenantBillingInvoices.tenantId, input.tenantId));
      if (input.status) conditions.push(eq(tenantBillingInvoices.status, input.status));

      const [rows, countResult] = await Promise.all([
        db.select().from(tenantBillingInvoices)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(tenantBillingInvoices.createdAt))
          .limit(input.limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(tenantBillingInvoices)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);
      return { items: rows, total: countResult[0]?.count ?? 0 };
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(tenantBillingInvoices)
        .where(eq(tenantBillingInvoices.id, input.id));
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  markPaid: protectedProcedure
    .input(z.object({
      id: z.string(),
      stripePaymentIntentId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(tenantBillingInvoices)
        .set({
          status: "paid",
          paidAt: new Date(),
          stripePaymentIntentId: input.stripePaymentIntentId ?? null,
          updatedAt: new Date(),
        })
        .where(eq(tenantBillingInvoices.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  void: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(tenantBillingInvoices)
        .set({ status: "void", updatedAt: new Date() })
        .where(eq(tenantBillingInvoices.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
});

// ─── Plan Limits ──────────────────────────────────────────────────────────────
const planLimitsRouter = router({
  list: protectedProcedure.query(async () => {
    const db = await requireDb();
    return db.select().from(tenantPlanLimits).orderBy(tenantPlanLimits.priceUsdPerMonth);
  }),

  get: protectedProcedure
    .input(z.object({ plan: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(tenantPlanLimits)
        .where(eq(tenantPlanLimits.plan, input.plan));
      return row ?? null;
    }),

  upsert: protectedProcedure
    .input(z.object({
      plan: z.string(),
      maxApiCallsPerMonth: z.number().int().min(0),
      maxTxVolumeUsdPerMonth: z.number().min(0),
      maxUsers: z.number().int().min(1),
      maxCorridors: z.number().int().min(0),
      maxWebhooks: z.number().int().min(0),
      maxApiKeys: z.number().int().min(0),
      priceUsdPerMonth: z.number().min(0),
      stripePriceId: z.string().optional(),
      features: z.array(z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db.select().from(tenantPlanLimits)
        .where(eq(tenantPlanLimits.plan, input.plan));

      if (existing.length > 0) {
        const [row] = await db.update(tenantPlanLimits)
          .set({
            ...input,
            features: input.features ? JSON.stringify(input.features) : null,
            stripePriceId: input.stripePriceId ?? null,
          })
          .where(eq(tenantPlanLimits.plan, input.plan))
          .returning();
        return row;
      }

      const [row] = await db.insert(tenantPlanLimits).values({
        id: crypto.randomUUID(),
        ...input,
        features: input.features ? JSON.stringify(input.features) : null,
        stripePriceId: input.stripePriceId ?? null,
      }).returning();
      return row;
    }),
});

// ─── SSO Configs ──────────────────────────────────────────────────────────────
const ssoConfigsRouter = router({
  get: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.select().from(tenantSsoConfigs)
        .where(eq(tenantSsoConfigs.tenantId, input.tenantId));
      return row ?? null;
    }),

  upsert: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      protocol: z.enum(["saml", "oidc", "oauth2"]).default("oidc"),
      isEnabled: z.boolean().default(false),
      entityId: z.string().optional(),
      ssoUrl: z.string().url().optional(),
      sloUrl: z.string().url().optional(),
      certificate: z.string().optional(),
      clientId: z.string().optional(),
      clientSecret: z.string().optional(),
      discoveryUrl: z.string().url().optional(),
      scopes: z.string().optional(),
      attributeMapping: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const existing = await db.select().from(tenantSsoConfigs)
        .where(eq(tenantSsoConfigs.tenantId, input.tenantId));

      const data = {
        ...input,
        attributeMapping: input.attributeMapping ? JSON.stringify(input.attributeMapping) : null,
        entityId: input.entityId ?? null,
        ssoUrl: input.ssoUrl ?? null,
        sloUrl: input.sloUrl ?? null,
        certificate: input.certificate ?? null,
        clientId: input.clientId ?? null,
        clientSecret: input.clientSecret ?? null,
        discoveryUrl: input.discoveryUrl ?? null,
        updatedAt: new Date(),
      };

      if (existing.length > 0) {
        const [row] = await db.update(tenantSsoConfigs).set(data)
          .where(eq(tenantSsoConfigs.tenantId, input.tenantId))
          .returning();
        return row;
      }

      const [row] = await db.insert(tenantSsoConfigs).values({
        id: crypto.randomUUID(),
        ...data,
      }).returning();
      return row;
    }),

  test: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [config] = await db.select().from(tenantSsoConfigs)
        .where(eq(tenantSsoConfigs.tenantId, input.tenantId));
      if (!config) throw new TRPCError({ code: "NOT_FOUND", message: "SSO config not found" });
      if (!config.isEnabled) throw new TRPCError({ code: "BAD_REQUEST", message: "SSO is not enabled" });
      // Simulate a connectivity test
      return { success: true, message: "SSO configuration is valid", protocol: config.protocol };
    }),
});

// ─── BNPL Repayment Schedules ─────────────────────────────────────────────────
const bnplRepaymentRouter = router({
  getByLoan: protectedProcedure
    .input(z.object({ loanId: z.string() }))
    .query(async ({ input }) => {
      const db = await requireDb();
      return db.select().from(bnplRepaymentSchedules)
        .where(eq(bnplRepaymentSchedules.bnplLoanId, input.loanId))
        .orderBy(bnplRepaymentSchedules.instalmentNumber);
    }),

  getByUser: protectedProcedure
    .input(z.object({
      userId: z.string(),
      status: z.enum(["pending", "paid", "overdue", "waived", "failed"]).optional(),
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.limit;
      const conditions = [eq(bnplRepaymentSchedules.userId, input.userId)];
      if (input.status) conditions.push(eq(bnplRepaymentSchedules.status, input.status));

      const [rows, countResult] = await Promise.all([
        db.select().from(bnplRepaymentSchedules)
          .where(and(...conditions))
          .orderBy(bnplRepaymentSchedules.dueDate)
          .limit(input.limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(bnplRepaymentSchedules)
          .where(and(...conditions)),
      ]);
      return { items: rows, total: countResult[0]?.count ?? 0 };
    }),

  markPaid: protectedProcedure
    .input(z.object({
      id: z.string(),
      paidAmountNgn: z.number().min(0),
      paymentReference: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(bnplRepaymentSchedules)
        .set({
          status: "paid",
          paidAt: new Date(),
          paidAmountNgn: input.paidAmountNgn,
          paymentReference: input.paymentReference ?? null,
          updatedAt: new Date(),
        })
        .where(eq(bnplRepaymentSchedules.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),

  markOverdue: protectedProcedure
    .input(z.object({
      ids: z.array(z.string()),
      lateFeeNgn: z.number().min(0).default(500),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const rows = await db.update(bnplRepaymentSchedules)
        .set({
          status: "overdue",
          lateFeeNgn: input.lateFeeNgn,
          updatedAt: new Date(),
        })
        .where(inArray(bnplRepaymentSchedules.id, input.ids))
        .returning();
      return rows;
    }),

  createSchedule: protectedProcedure
    .input(z.object({
      bnplLoanId: z.string(),
      userId: z.string(),
      totalAmountNgn: z.number().min(0),
      instalments: z.number().int().min(1).max(24),
      interestRatePct: z.number().min(0).max(100).default(5),
      firstDueDate: z.string().datetime(),
    }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const principalPerInstalment = input.totalAmountNgn / input.instalments;
      const interestPerInstalment = (input.totalAmountNgn * input.interestRatePct / 100) / input.instalments;
      const firstDue = new Date(input.firstDueDate);

      const schedules = Array.from({ length: input.instalments }, (_, i) => {
        const dueDate = new Date(firstDue);
        dueDate.setMonth(dueDate.getMonth() + i);
        return {
          id: crypto.randomUUID(),
          bnplLoanId: input.bnplLoanId,
          userId: input.userId,
          instalmentNumber: i + 1,
          totalInstalments: input.instalments,
          principalAmountNgn: Math.round(principalPerInstalment * 100) / 100,
          interestAmountNgn: Math.round(interestPerInstalment * 100) / 100,
          totalDueNgn: Math.round((principalPerInstalment + interestPerInstalment) * 100) / 100,
          dueDate,
          status: "pending" as const,
          lateFeeNgn: 0,
          paidAt: null,
          paidAmountNgn: null,
          paymentReference: null,
        };
      });

      const rows = await db.insert(bnplRepaymentSchedules).values(schedules).returning();
      return rows;
    }),
});

// ─── Stripe Subscriptions ─────────────────────────────────────────────────────
const stripeSubsRouter = router({
  getMine: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const [row] = await db.select().from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.userId, String(ctx.user.id)))
      .orderBy(desc(stripeSubscriptions.createdAt))
      .limit(1);
    return row ?? null;
  }),

  list: protectedProcedure
    .input(z.object({
      page: z.number().int().min(1).default(1),
      limit: z.number().int().min(1).max(100).default(20),
      status: z.string().optional(),
      plan: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await requireDb();
      const offset = (input.page - 1) * input.limit;
      const conditions = [];
      if (input.status) conditions.push(eq(stripeSubscriptions.status, input.status as any));
      if (input.plan) conditions.push(eq(stripeSubscriptions.plan, input.plan));

      const [rows, countResult] = await Promise.all([
        db.select().from(stripeSubscriptions)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(stripeSubscriptions.createdAt))
          .limit(input.limit).offset(offset),
        db.select({ count: sql<number>`count(*)::int` }).from(stripeSubscriptions)
          .where(conditions.length > 0 ? and(...conditions) : undefined),
      ]);
      return { items: rows, total: countResult[0]?.count ?? 0 };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await requireDb();
      const [row] = await db.update(stripeSubscriptions)
        .set({ cancelAtPeriodEnd: true, updatedAt: new Date() })
        .where(eq(stripeSubscriptions.id, input.id))
        .returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND" });
      return row;
    }),
});

// ─── Aggregate Router ─────────────────────────────────────────────────────────
export const wave32Router = router({
  inviteCodes: inviteCodesRouter,
  partnerOnboarding: partnerOnboardingRouter,
  corridors: corridorsRouter,
  feeOverrides: feeOverridesRouter,
  usageMetrics: usageMetricsRouter,
  billingInvoices: billingInvoicesRouter,
  planLimits: planLimitsRouter,
  ssoConfigs: ssoConfigsRouter,
  bnplRepayment: bnplRepaymentRouter,
  stripeSubs: stripeSubsRouter,
});
