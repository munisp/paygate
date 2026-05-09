// Billing Engine tRPC Router
// Provides RBAC-protected procedures for billing config management.
// All mutations emit audit log entries and owner notifications.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import { randomUUID } from "crypto";
import { notifyOwner } from "../_core/notification";
import { assertBillingPermission, logAuthFailure } from "../security116";

// ── Permission helpers ────────────────────────────────────────────────────────

function assertBillingAdmin(role: string, userId?: number, action?: string) {
  try {
    assertBillingPermission(role, "billing:write", { userId, action });
  } catch (err) {
    logAuthFailure({
      userId,
      action: action ?? "billing:write",
      resource: "billing_config",
      reason: `Role '${role}' lacks billing:write permission`,
    });
    throw err;
  }
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ── Audit helper ──────────────────────────────────────────────────────────────

async function logBillingAudit(params: {
  tenantId: string;
  billingConfigId?: string | null;
  actorId: string;
  actorRole: string;
  action: string;
  beforeState?: unknown;
  afterState?: unknown;
  reason?: string;
}) {
  const { billingAuditLog } = await import("../../drizzle/schema");
  const db = await getDb();
  if (!db) return;
  await db.insert(billingAuditLog).values({
    id: randomUUID(),
    tenantId: params.tenantId,
    billingConfigId: params.billingConfigId ?? null,
    actorId: params.actorId,
    actorRole: params.actorRole,
    action: params.action,
    beforeState: params.beforeState ?? null,
    afterState: params.afterState ?? null,
    reason: params.reason ?? null,
  });
}

// ── Schemas ───────────────────────────────────────────────────────────────────

const BillingConfigCreateSchema = z.object({
  tenantId: z.string(),
  pricingModel: z.enum(["per_transaction", "subscription", "hybrid"]).default("per_transaction"),
  feeRate: z.number().min(0).max(0.05).default(0.015),
  feeCapKobo: z.number().int().min(0).default(200_000),
  feeFloorKobo: z.number().int().min(0).default(0),
  platformShare: z.number().min(0).max(1).default(0.65),
  resellerShare: z.number().min(0).max(1).default(0.35),
  interchangeCostKobo: z.number().int().min(0).default(5_000),
  signOnFeeKobo: z.number().int().min(0).default(0),
  signOnPlatformShare: z.number().min(0).max(1).default(0.70),
  subscriptionFeeKobo: z.number().int().min(0).default(0),
  subscriptionPlatformShare: z.number().min(0).max(1).default(0.65),
  monthlyOverheadCapKobo: z.number().int().min(0).optional(),
  notes: z.string().optional(),
  reason: z.string().optional(),
});

const BillingConfigUpdateSchema = BillingConfigCreateSchema.partial().extend({
  id: z.string(),
  reason: z.string().min(1, "A reason is required for billing config changes"),
});

// ── Router ────────────────────────────────────────────────────────────────────

export const billingRouter = router({

  // Get the active billing config for a tenant
  getActive: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { billingConfigs } = await import("../../drizzle/schema");
      const { and, desc, eq } = await import("drizzle-orm");
      const db = await requireDb();
      const rows = await db
        .select()
        .from(billingConfigs)
        .where(and(eq(billingConfigs.tenantId, input.tenantId), eq(billingConfigs.active, true)))
        .orderBy(desc(billingConfigs.version))
        .limit(1);
      return rows[0] ?? null;
    }),

  // List all billing config versions for a tenant (audit history)
  listVersions: protectedProcedure
    .input(z.object({ tenantId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { billingConfigs } = await import("../../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = await requireDb();
      return db
        .select()
        .from(billingConfigs)
        .where(eq(billingConfigs.tenantId, input.tenantId))
        .orderBy(desc(billingConfigs.version));
    }),

  // Create a new billing config (draft)
  create: protectedProcedure
    .input(BillingConfigCreateSchema)
    .mutation(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);

      if (input.platformShare + input.resellerShare > 1.0001) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Platform share + reseller share must not exceed 100%",
        });
      }

      const { billingConfigs } = await import("../../drizzle/schema");
      const db = await requireDb();
      const id = randomUUID();
      const [config] = await db.insert(billingConfigs).values({
        id,
        tenantId: input.tenantId,
        status: "draft",
        active: false,
        pricingModel: input.pricingModel,
        feeRate: input.feeRate,
        feeCapKobo: input.feeCapKobo,
        feeFloorKobo: input.feeFloorKobo,
        platformShare: input.platformShare,
        resellerShare: input.resellerShare,
        interchangeCostKobo: input.interchangeCostKobo,
        signOnFeeKobo: input.signOnFeeKobo,
        signOnPlatformShare: input.signOnPlatformShare,
        subscriptionFeeKobo: input.subscriptionFeeKobo,
        subscriptionPlatformShare: input.subscriptionPlatformShare,
        monthlyOverheadCapKobo: input.monthlyOverheadCapKobo ?? 0,
        notes: input.notes ?? null,
        createdBy: String(ctx.user.id),
        version: 1,
      }).returning();

      await logBillingAudit({
        tenantId: input.tenantId,
        billingConfigId: id,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role,
        action: "created",
        afterState: config,
        reason: input.reason,
      });

      return config;
    }),

  // Update a draft billing config
  update: protectedProcedure
    .input(BillingConfigUpdateSchema)
    .mutation(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);

      const { billingConfigs } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await requireDb();

      const [existing] = await db
        .select()
        .from(billingConfigs)
        .where(eq(billingConfigs.id, input.id))
        .limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND" });
      if (existing.status === "active") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Cannot edit an active billing config. Create a new version instead.",
        });
      }

      const { id, reason, tenantId: _t, ...updates } = input;
      const [updated] = await db
        .update(billingConfigs)
        .set({ ...updates, updatedAt: new Date() })
        .where(eq(billingConfigs.id, id))
        .returning();

      await logBillingAudit({
        tenantId: existing.tenantId,
        billingConfigId: id,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role,
        action: "updated",
        beforeState: existing,
        afterState: updated,
        reason,
      });

      await notifyOwner({
        title: "Billing Config Updated",
        content: `Billing config ${id} for tenant ${existing.tenantId} was updated by ${ctx.user.id}. Reason: ${reason}`,
      });

      return updated;
    }),

  // Activate a draft billing config (deactivates the current active one)
  activate: protectedProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);

      const { billingConfigs } = await import("../../drizzle/schema");
      const { and, eq } = await import("drizzle-orm");
      const db = await requireDb();

      const [draft] = await db
        .select()
        .from(billingConfigs)
        .where(eq(billingConfigs.id, input.id))
        .limit(1);
      if (!draft) throw new TRPCError({ code: "NOT_FOUND" });
      if (draft.status !== "draft") {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "Only draft configs can be activated",
        });
      }

      const [currentActive] = await db
        .select()
        .from(billingConfigs)
        .where(and(eq(billingConfigs.tenantId, draft.tenantId), eq(billingConfigs.active, true)))
        .limit(1);

      if (currentActive) {
        await db
          .update(billingConfigs)
          .set({ active: false, status: "superseded", effectiveTo: new Date(), updatedAt: new Date() })
          .where(eq(billingConfigs.id, currentActive.id));

        await logBillingAudit({
          tenantId: draft.tenantId,
          billingConfigId: currentActive.id,
          actorId: String(ctx.user.id),
          actorRole: ctx.user.role,
          action: "superseded",
          beforeState: currentActive,
          reason: input.reason,
        });
      }

      const [activated] = await db
        .update(billingConfigs)
        .set({
          active: true,
          status: "active",
          approvedBy: String(ctx.user.id),
          approvedAt: new Date(),
          effectiveFrom: new Date(),
          version: (currentActive?.version ?? 0) + 1,
          updatedAt: new Date(),
        })
        .where(eq(billingConfigs.id, input.id))
        .returning();

      await logBillingAudit({
        tenantId: draft.tenantId,
        billingConfigId: input.id,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role,
        action: "activated",
        beforeState: draft,
        afterState: activated,
        reason: input.reason,
      });

      await notifyOwner({
        title: "Billing Config Activated",
        content: `New billing config (v${activated.version}) activated for tenant ${draft.tenantId} by ${ctx.user.id}. Pricing model: ${activated.pricingModel}, Fee rate: ${((activated.feeRate ?? 0) * 100).toFixed(2)}%`,
      });

      return activated;
    }),

  // Get billing audit log for a tenant
  getAuditLog: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      limit: z.number().int().min(1).max(100).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { billingAuditLog } = await import("../../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = await requireDb();
      return db
        .select()
        .from(billingAuditLog)
        .where(eq(billingAuditLog.tenantId, input.tenantId))
        .orderBy(desc(billingAuditLog.createdAt))
        .limit(input.limit)
        .offset(input.offset);
    }),

  // Record an overhead cost entry
  recordOverheadCost: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      category: z.enum(["infrastructure", "labor", "travel", "marketing", "compliance", "support", "other"]),
      amountKobo: z.number().int().min(1),
      description: z.string().min(1),
      periodStart: z.date(),
      periodEnd: z.date(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);

      const { overheadCosts } = await import("../../drizzle/schema");
      const db = await requireDb();
      const [cost] = await db.insert(overheadCosts).values({
        id: randomUUID(),
        tenantId: input.tenantId,
        category: input.category,
        amountKobo: input.amountKobo,
        description: input.description,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        recordedBy: String(ctx.user.id),
      }).returning();

      return cost;
    }),

  // Get overhead costs for a tenant and period
  getOverheadCosts: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      periodStart: z.date(),
      periodEnd: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const { overheadCosts } = await import("../../drizzle/schema");
      const { and, desc, eq, gte, lte } = await import("drizzle-orm");
      const db = await requireDb();
      return db
        .select()
        .from(overheadCosts)
        .where(and(
          eq(overheadCosts.tenantId, input.tenantId),
          gte(overheadCosts.periodStart, input.periodStart),
          lte(overheadCosts.periodEnd, input.periodEnd)
        ))
        .orderBy(desc(overheadCosts.createdAt));
    }),

  // Get billing metrics summary for a tenant and period
  getMetricsSummary: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      periodStart: z.date(),
      periodEnd: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const { billingEvents, overheadCosts } = await import("../../drizzle/schema");
      const { and, eq, gte, lte, sql, sum } = await import("drizzle-orm");
      const db = await requireDb();

      const [eventMetrics] = await db
        .select({
          totalTransactions: sql<number>`count(*)::int`,
          totalVolumeKobo: sum(billingEvents.amountKobo),
          totalGrossFeeKobo: sum(billingEvents.grossFeeKobo),
          totalPlatformRevenueKobo: sum(billingEvents.platformRevenueKobo),
          totalResellerRevenueKobo: sum(billingEvents.resellerRevenueKobo),
          totalInterchangeCostKobo: sum(billingEvents.interchangeCostKobo),
          totalNetPlatformRevenueKobo: sum(billingEvents.netPlatformRevenueKobo),
        })
        .from(billingEvents)
        .where(and(
          eq(billingEvents.tenantId, input.tenantId),
          gte(billingEvents.occurredAt, input.periodStart),
          lte(billingEvents.occurredAt, input.periodEnd)
        ));

      const [overheadMetrics] = await db
        .select({ totalOverheadKobo: sum(overheadCosts.amountKobo) })
        .from(overheadCosts)
        .where(and(
          eq(overheadCosts.tenantId, input.tenantId),
          gte(overheadCosts.periodStart, input.periodStart),
          lte(overheadCosts.periodEnd, input.periodEnd)
        ));

      const netRevenue = Number(eventMetrics?.totalNetPlatformRevenueKobo ?? 0);
      const totalOverhead = Number(overheadMetrics?.totalOverheadKobo ?? 0);
      const ebitda = netRevenue - totalOverhead;
      const ebitdaMarginBps = netRevenue > 0 ? Math.round((ebitda / netRevenue) * 10000) : 0;

      return {
        tenantId: input.tenantId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd,
        totalTransactions: eventMetrics?.totalTransactions ?? 0,
        totalVolumeKobo: Number(eventMetrics?.totalVolumeKobo ?? 0),
        totalGrossFeeKobo: Number(eventMetrics?.totalGrossFeeKobo ?? 0),
        totalPlatformRevenueKobo: Number(eventMetrics?.totalPlatformRevenueKobo ?? 0),
        totalResellerRevenueKobo: Number(eventMetrics?.totalResellerRevenueKobo ?? 0),
        totalInterchangeCostKobo: Number(eventMetrics?.totalInterchangeCostKobo ?? 0),
        totalNetPlatformRevenueKobo: netRevenue,
        totalOverheadKobo: totalOverhead,
        ebitdaKobo: ebitda,
        ebitdaMarginBps,
      };
    }),

  // Get overhead breakdown by category
  getOverheadByCategory: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      periodStart: z.date(),
      periodEnd: z.date(),
    }))
    .query(async ({ ctx, input }) => {
      const { overheadCosts } = await import("../../drizzle/schema");
      const { and, eq, gte, lte, sum } = await import("drizzle-orm");
      const db = await requireDb();
      return db
        .select({
          category: overheadCosts.category,
          totalKobo: sum(overheadCosts.amountKobo),
        })
        .from(overheadCosts)
        .where(and(
          eq(overheadCosts.tenantId, input.tenantId),
          gte(overheadCosts.periodStart, input.periodStart),
          lte(overheadCosts.periodEnd, input.periodEnd)
        ))
        .groupBy(overheadCosts.category);
    }),

  // List recent billing events for a tenant
  listBillingEvents: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { billingEvents } = await import("../../drizzle/schema");
      const { desc, eq } = await import("drizzle-orm");
      const db = await requireDb();
      return db
        .select()
        .from(billingEvents)
        .where(eq(billingEvents.tenantId, input.tenantId))
        .orderBy(desc(billingEvents.occurredAt))
        .limit(input.limit)
        .offset(input.offset);
    }),
});
