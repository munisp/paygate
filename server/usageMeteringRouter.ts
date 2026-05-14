/**
 * Usage Metering Router
 * Tracks API calls, transaction volume, storage, and active users per tenant.
 * Provides quota checking and invoice generation for billing.
 */
import { z } from "zod";
import { router, protectedProcedure } from "./_core/trpc";
import { db } from "./db";
import { tenantUsageMetrics, tenantBillingInvoices, tenantPlanLimits } from "../drizzle/schema";
import { eq, and, desc, gte, lte } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

export const usageMeteringRouter = router({
  /** Track a usage event for the current tenant */
  track: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      period: z.string().optional(), // YYYY-MM format, defaults to current month
      apiCalls: z.number().int().min(0).default(0),
      txVolume: z.number().min(0).default(0),
      txCount: z.number().int().min(0).default(0),
      storageBytes: z.number().int().min(0).default(0),
      webhookDeliveries: z.number().int().min(0).default(0),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const dbClient = getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";
      const period = input.period ?? new Date().toISOString().slice(0, 7); // YYYY-MM

      // Upsert usage metrics for this period
      const existing = await dbClient
        .select()
        .from(tenantUsageMetrics)
        .where(and(eq(tenantUsageMetrics.tenantId, tenantId), eq(tenantUsageMetrics.period, period)))
        .limit(1);

      if (existing.length > 0) {
        const row = existing[0];
        await dbClient
          .update(tenantUsageMetrics)
          .set({
            apiCalls: row.apiCalls + input.apiCalls,
            txVolume: row.txVolume + input.txVolume,
            txCount: row.txCount + input.txCount,
            storageBytes: row.storageBytes + input.storageBytes,
            webhookDeliveries: row.webhookDeliveries + input.webhookDeliveries,
            updatedAt: new Date(),
          })
          .where(eq(tenantUsageMetrics.id, row.id));
      } else {
        await dbClient.insert(tenantUsageMetrics).values({
          tenantId,
          period,
          apiCalls: input.apiCalls,
          txVolume: input.txVolume,
          txCount: input.txCount,
          storageBytes: input.storageBytes,
          webhookDeliveries: input.webhookDeliveries,
        });
      }
      return { success: true };
    }),

  /** Get usage metrics for a tenant */
  getUsage: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      period: z.string().optional(),
      months: z.number().int().min(1).max(12).default(3),
    }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const dbClient = getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";

      if (input.period) {
        const rows = await dbClient
          .select()
          .from(tenantUsageMetrics)
          .where(and(eq(tenantUsageMetrics.tenantId, tenantId), eq(tenantUsageMetrics.period, input.period)))
          .limit(1);
        return rows[0] ?? { tenantId, period: input.period, apiCalls: 0, txVolume: 0, txCount: 0, storageBytes: 0, activeUsers: 0, webhookDeliveries: 0 };
      }

      // Return last N months
      const rows = await dbClient
        .select()
        .from(tenantUsageMetrics)
        .where(eq(tenantUsageMetrics.tenantId, tenantId))
        .orderBy(desc(tenantUsageMetrics.period))
        .limit(input.months);
      return rows;
    }),

  /** Check if tenant is within quota limits */
  checkQuota: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      plan: z.enum(["starter", "growth", "enterprise"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const dbClient = getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";
      const plan = input.plan ?? "starter";
      const period = new Date().toISOString().slice(0, 7);

      // Get current usage
      const usageRows = await dbClient
        .select()
        .from(tenantUsageMetrics)
        .where(and(eq(tenantUsageMetrics.tenantId, tenantId), eq(tenantUsageMetrics.period, period)))
        .limit(1);
      const usage = usageRows[0] ?? { apiCalls: 0, txVolume: 0, txCount: 0, storageBytes: 0, activeUsers: 0 };

      // Get plan limits
      const limitRows = await dbClient
        .select()
        .from(tenantPlanLimits)
        .where(eq(tenantPlanLimits.plan, plan))
        .limit(1);

      // Default plan limits if not in DB
      const defaultLimits: Record<string, { maxApiCalls: number; maxTxVolume: number; maxUsers: number; maxCorridors: number }> = {
        starter: { maxApiCalls: 10_000, maxTxVolume: 1_000_000, maxUsers: 5, maxCorridors: 2 },
        growth: { maxApiCalls: 100_000, maxTxVolume: 50_000_000, maxUsers: 25, maxCorridors: 10 },
        enterprise: { maxApiCalls: 10_000_000, maxTxVolume: 1_000_000_000, maxUsers: 500, maxCorridors: 100 },
      };
      const limits = limitRows[0] ?? defaultLimits[plan] ?? defaultLimits.starter;

      return {
        tenantId,
        plan,
        period,
        usage: {
          apiCalls: usage.apiCalls,
          txVolume: usage.txVolume,
          txCount: usage.txCount,
          storageBytes: usage.storageBytes,
          activeUsers: usage.activeUsers,
        },
        limits: {
          maxApiCalls: limits.maxApiCalls,
          maxTxVolume: limits.maxTxVolume,
          maxUsers: limits.maxUsers,
          maxCorridors: limits.maxCorridors,
        },
        quotaStatus: {
          apiCallsOk: usage.apiCalls < limits.maxApiCalls,
          txVolumeOk: usage.txVolume < limits.maxTxVolume,
          usersOk: usage.activeUsers < limits.maxUsers,
          apiCallsPct: Math.round((usage.apiCalls / limits.maxApiCalls) * 100),
          txVolumePct: Math.round((usage.txVolume / limits.maxTxVolume) * 100),
        },
      };
    }),

  /** Get billing invoices for a tenant */
  getInvoices: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      status: z.enum(["draft", "open", "paid", "void", "uncollectible"]).optional(),
      limit: z.number().int().min(1).max(50).default(12),
    }))
    .query(async ({ ctx, input }) => {
      const { getDb } = await import("./db");
      const dbClient = getDb();
      const tenantId = input.tenantId ?? ctx.user.tenantId ?? "platform";

      const conditions = [eq(tenantBillingInvoices.tenantId, tenantId)];
      if (input.status) {
        conditions.push(eq(tenantBillingInvoices.status, input.status));
      }

      const rows = await dbClient
        .select()
        .from(tenantBillingInvoices)
        .where(and(...conditions))
        .orderBy(desc(tenantBillingInvoices.createdAt))
        .limit(input.limit);
      return rows;
    }),

  /** Create a billing invoice for a tenant (admin only) */
  createInvoice: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      period: z.string(),
      amountUsd: z.number().min(0),
      lineItems: z.string().optional(),
      dueDate: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (ctx.user.role !== "admin") throw new TRPCError({ code: "FORBIDDEN" });
      const { getDb } = await import("./db");
      const dbClient = getDb();
      const [invoice] = await dbClient
        .insert(tenantBillingInvoices)
        .values({
          tenantId: input.tenantId,
          period: input.period,
          amountUsd: input.amountUsd,
          lineItems: input.lineItems,
          dueDate: input.dueDate,
          status: "open",
        })
        .returning();
      return invoice;
    }),
});
