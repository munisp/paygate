// Billing Engine tRPC Router
// Provides RBAC-protected procedures for billing config management.
// All mutations emit audit log entries and owner notifications.

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { pbacProcedure, router } from "../_core/trpc";

// PBAC: billing config reads require billing:view; writes require billing:manage
// (admin + finance_manager per the local role matrix in server/pbac.ts).
const viewBilling = pbacProcedure("view_billing");
const manageBilling = pbacProcedure("manage_billing");
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
  getActive: viewBilling
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
  listVersions: viewBilling
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
  create: manageBilling
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
  update: manageBilling
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
  activate: manageBilling
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
  getAuditLog: viewBilling
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
  recordOverheadCost: manageBilling
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
  getOverheadCosts: viewBilling
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
  getMetricsSummary: viewBilling
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
  getOverheadByCategory: viewBilling
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
  listBillingEvents: viewBilling
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

// ─── Wave 117 additions ────────────────────────────────────────────────────────
// These are appended as a separate export to avoid re-editing the main router.
// They are merged into billingRouter via router merging in routers.ts.

const BILLING_TIER_TEMPLATES = {
  starter: {
    pricingModel: "per_transaction" as const,
    feeRate: 0.015,
    feeCapKobo: 200_000,
    feeFloorKobo: 0,
    platformShare: 0.65,
    resellerShare: 0.35,
    interchangeCostKobo: 5_000,
    signOnFeeKobo: 0,
    signOnPlatformShare: 0.70,
    subscriptionFeeKobo: 0,
    subscriptionPlatformShare: 0.65,
    notes: "Starter tier — free onboarding, 1.5% per transaction, ₦2,000 cap",
  },
  growth: {
    pricingModel: "hybrid" as const,
    feeRate: 0.012,
    feeCapKobo: 150_000,
    feeFloorKobo: 0,
    platformShare: 0.65,
    resellerShare: 0.35,
    interchangeCostKobo: 5_000,
    signOnFeeKobo: 5_000_000,  // ₦50,000 in kobo
    signOnPlatformShare: 0.70,
    subscriptionFeeKobo: 15_000_000, // ₦150,000/month in kobo
    subscriptionPlatformShare: 0.65,
    notes: "Growth tier — ₦50k sign-on, ₦150k/month + 1.2% per transaction",
  },
  enterprise: {
    pricingModel: "hybrid" as const,
    feeRate: 0.008,
    feeCapKobo: 100_000,
    feeFloorKobo: 0,
    platformShare: 0.70,
    resellerShare: 0.30,
    interchangeCostKobo: 5_000,
    signOnFeeKobo: 20_000_000, // ₦200,000 in kobo
    signOnPlatformShare: 0.75,
    subscriptionFeeKobo: 50_000_000, // ₦500,000/month in kobo
    subscriptionPlatformShare: 0.70,
    notes: "Enterprise tier — ₦200k sign-on, ₦500k/month + 0.8% per transaction",
  },
};

export const billingExtRouter = router({
  // Provisions a billing config from a named tier template during tenant onboarding.
  // Triggers the Temporal ProvisionBillingWorkflow via the middleware bridge.
  provisionBillingTier: manageBilling
    .input(z.object({
      tenantId: z.string(),
      tier: z.enum(["starter", "growth", "enterprise", "custom"]),
      customFeeRate: z.number().min(0).max(0.05).optional(),
      customSignOnFeeKobo: z.number().int().min(0).optional(),
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);
      const template = input.tier === "custom"
        ? {
            ...BILLING_TIER_TEMPLATES.starter,
            pricingModel: "per_transaction" as const,
            feeRate: input.customFeeRate ?? 0.015,
            signOnFeeKobo: input.customSignOnFeeKobo ?? 0,
            notes: `Custom tier configured during onboarding by ${ctx.user.openId}`,
          }
        : BILLING_TIER_TEMPLATES[input.tier];

      const { billingConfigs } = await import("../../drizzle/schema");
      const db = await requireDb();
      const id = randomUUID();

      const [config] = await db.insert(billingConfigs).values({
        id,
        tenantId: input.tenantId,
        status: "active",
        active: true,
        ...template,
        monthlyOverheadCapKobo: 0,
        createdBy: String(ctx.user.id),
        version: 1,
      }).returning();

      await logBillingAudit({
        tenantId: input.tenantId,
        billingConfigId: id,
        actorId: String(ctx.user.id),
        actorRole: ctx.user.role,
        action: "provisioned_via_onboarding",
        afterState: { tier: input.tier, ...config },
        reason: input.reason ?? `Tier '${input.tier}' selected during tenant onboarding`,
      });

      // Trigger Temporal ProvisionBillingWorkflow via middleware bridge (fire-and-forget)
      const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
      if (bridgeUrl) {
        fetch(`${bridgeUrl}/workflows/provision-billing`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
          },
          body: JSON.stringify({
            tenantId: input.tenantId,
            billingConfigId: id,
            tier: input.tier,
            actorId: String(ctx.user.id),
          }),
        }).catch((e: Error) => {
          console.warn("[billing] Temporal workflow trigger failed (non-fatal):", e.message);
        });
      }

      await notifyOwner({
        title: `New Tenant Billing Provisioned — ${input.tier} tier`,
        content: `Tenant ${input.tenantId} provisioned with ${input.tier} billing tier. Fee rate: ${(template.feeRate * 100).toFixed(1)}%. Config ID: ${id}`,
      });

      return { config, tier: input.tier, provisioned: true };
    }),

  // Returns aggregated revenue, EBITDA, and split data for the billing analytics page.
  getAnalytics: viewBilling
    .input(z.object({
      tenantId: z.string(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);
      const { billingEvents, overheadCosts: billingOverheadCosts } = await import("../../drizzle/schema");
      const { sql, eq, and, gte, lte } = await import("drizzle-orm");
      const db = await requireDb();

      const to = input.to ?? new Date();
      const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);

      const [totals] = await db
        .select({
          totalTransactions: sql<number>`count(*)`,
          totalAmountKobo: sql<number>`coalesce(sum(${billingEvents.amountKobo}), 0)`,
          totalGrossFeeKobo: sql<number>`coalesce(sum(${billingEvents.grossFeeKobo}), 0)`,
          totalPlatformRevenueKobo: sql<number>`coalesce(sum(${billingEvents.platformRevenueKobo}), 0)`,
          totalResellerRevenueKobo: sql<number>`coalesce(sum(${billingEvents.resellerRevenueKobo}), 0)`,
          totalInterchangeCostKobo: sql<number>`coalesce(sum(${billingEvents.interchangeCostKobo}), 0)`,
          totalNetPlatformKobo: sql<number>`coalesce(sum(${billingEvents.netPlatformRevenueKobo}), 0)`,
        })
        .from(billingEvents)
        .where(and(
          eq(billingEvents.tenantId, input.tenantId),
          gte(billingEvents.occurredAt, from),
          lte(billingEvents.occurredAt, to),
        ));

      const [overheadTotals] = await db
        .select({
          totalOverheadKobo: sql<number>`coalesce(sum(amount_kobo), 0)`,
        })
        .from(billingOverheadCosts)
        .where(and(
          eq(billingOverheadCosts.tenantId, input.tenantId),
          gte(billingOverheadCosts.periodStart, from),
          lte(billingOverheadCosts.periodStart, to),
        ));

      const totalOverheadKobo = Number(overheadTotals?.totalOverheadKobo ?? 0);
      const totalNetPlatformKobo = Number(totals?.totalNetPlatformKobo ?? 0);
      const ebitdaKobo = totalNetPlatformKobo - totalOverheadKobo;
      const grossFeeKobo = Number(totals?.totalGrossFeeKobo ?? 0);
      const ebitdaMarginPct = grossFeeKobo > 0 ? (ebitdaKobo / grossFeeKobo) * 100 : 0;

      return {
        period: { from, to },
        totals: {
          transactions: Number(totals?.totalTransactions ?? 0),
          amountKobo: Number(totals?.totalAmountKobo ?? 0),
          grossFeeKobo,
          platformRevenueKobo: Number(totals?.totalPlatformRevenueKobo ?? 0),
          resellerRevenueKobo: Number(totals?.totalResellerRevenueKobo ?? 0),
          interchangeCostKobo: Number(totals?.totalInterchangeCostKobo ?? 0),
          netPlatformKobo: totalNetPlatformKobo,
          overheadKobo: totalOverheadKobo,
          ebitdaKobo,
          ebitdaMarginPct: Math.round(ebitdaMarginPct * 100) / 100,
        },
      };
    }),

  // Returns daily/weekly/monthly revenue time series for billing analytics charts.
  getRevenueTimeSeries: viewBilling
    .input(z.object({
      tenantId: z.string(),
      from: z.date().optional(),
      to: z.date().optional(),
      granularity: z.enum(["day", "week", "month"]).default("day"),
    }))
    .query(async ({ ctx, input }) => {
      assertBillingAdmin(ctx.user.role);
      const { billingEvents } = await import("../../drizzle/schema");
      const { sql, eq, and, gte, lte } = await import("drizzle-orm");
      const db = await requireDb();

      const to = input.to ?? new Date();
      const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const truncFn = input.granularity;

      const rows = await db
        .select({
          period: sql<string>`date_trunc(${truncFn}, ${billingEvents.occurredAt})::date`,
          transactions: sql<number>`count(*)`,
          grossFeeKobo: sql<number>`coalesce(sum(${billingEvents.grossFeeKobo}), 0)`,
          platformRevenueKobo: sql<number>`coalesce(sum(${billingEvents.platformRevenueKobo}), 0)`,
          resellerRevenueKobo: sql<number>`coalesce(sum(${billingEvents.resellerRevenueKobo}), 0)`,
          netPlatformKobo: sql<number>`coalesce(sum(${billingEvents.netPlatformRevenueKobo}), 0)`,
        })
        .from(billingEvents)
        .where(and(
          eq(billingEvents.tenantId, input.tenantId),
          gte(billingEvents.occurredAt, from),
          lte(billingEvents.occurredAt, to),
        ))
        .groupBy(sql`date_trunc(${truncFn}, ${billingEvents.occurredAt})`)
        .orderBy(sql`date_trunc(${truncFn}, ${billingEvents.occurredAt})`);

      return rows.map(r => ({
        period: String(r.period),
        transactions: Number(r.transactions),
        grossFeeKobo: Number(r.grossFeeKobo),
        platformRevenueKobo: Number(r.platformRevenueKobo),
        resellerRevenueKobo: Number(r.resellerRevenueKobo),
        netPlatformKobo: Number(r.netPlatformKobo),
      }));
    }),
});
