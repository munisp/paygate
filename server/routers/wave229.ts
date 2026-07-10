/**
 * Wave 229 — Billing Engine Analytics Dashboard
 *
 * Procedures:
 * - billingAnalyticsV2.getInvoiceAging     — invoice aging buckets (current, 1-30, 31-60, 61-90, 90+)
 * - billingAnalyticsV2.getSubscriptionHealth — subscription health metrics (active, paused, failed, churned)
 * - billingAnalyticsV2.getRevenueKpis      — revenue KPIs with period-over-period comparison
 * - billingAnalyticsV2.getInvoiceTrend     — daily/weekly invoice creation + payment trend
 * - billingAnalyticsV2.getTopMerchants     — top merchants by billed amount
 * - billingAnalyticsV2.getFailedPayments   — failed subscription payment log
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  invoices,
  subscriptions,
  billingEvents,
} from "../../drizzle/schema";
import { eq, desc, and, gte, lte, sql, lt, isNull, not, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return db;
}

function assertAdmin(role: string) {
  if (!["admin", "platform_admin", "billing_admin"].includes(role)) {
    throw new TRPCError({ code: "FORBIDDEN", message: "Billing admin access required" });
  }
}

const now = () => new Date();
const daysAgo = (d: number) => new Date(Date.now() - d * 86400_000);

// ─── Billing Analytics V2 Router ─────────────────────────────────────────────

export const billingAnalyticsV2Router = router({
  /**
   * Invoice aging report — buckets outstanding invoices by days overdue.
   * Buckets: current (not yet due), 1-30, 31-60, 61-90, 90+ days overdue.
   */
  getInvoiceAging: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      currency: z.string().default("NGN"),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();
      const today = now();

      const conditions: any[] = [
        eq(invoices.status, "unpaid"),
        isNotNull(invoices.dueDate),
      ];
      if (input.merchantId) conditions.push(eq(invoices.merchantId, input.merchantId));
      if (input.currency) conditions.push(eq(invoices.currency, input.currency));

      const unpaidInvoices = await db
        .select({
          invoiceId: invoices.invoiceId,
          merchantId: invoices.merchantId,
          totalKobo: invoices.totalKobo,
          dueDate: invoices.dueDate,
          createdAt: invoices.createdAt,
        })
        .from(invoices)
        .where(and(...conditions));

      // Bucket each invoice
      const buckets = {
        current: { count: 0, totalKobo: 0, invoices: [] as any[] },
        days1_30: { count: 0, totalKobo: 0, invoices: [] as any[] },
        days31_60: { count: 0, totalKobo: 0, invoices: [] as any[] },
        days61_90: { count: 0, totalKobo: 0, invoices: [] as any[] },
        days90plus: { count: 0, totalKobo: 0, invoices: [] as any[] },
      };

      for (const inv of unpaidInvoices) {
        if (!inv.dueDate) continue;
        const due = new Date(inv.dueDate);
        const daysOverdue = Math.floor((today.getTime() - due.getTime()) / 86400_000);
        const item = {
          invoiceId: inv.invoiceId,
          merchantId: inv.merchantId,
          totalKobo: inv.totalKobo,
          dueDate: inv.dueDate,
          daysOverdue: Math.max(0, daysOverdue),
        };

        if (daysOverdue <= 0) {
          buckets.current.count++;
          buckets.current.totalKobo += inv.totalKobo;
          buckets.current.invoices.push(item);
        } else if (daysOverdue <= 30) {
          buckets.days1_30.count++;
          buckets.days1_30.totalKobo += inv.totalKobo;
          buckets.days1_30.invoices.push(item);
        } else if (daysOverdue <= 60) {
          buckets.days31_60.count++;
          buckets.days31_60.totalKobo += inv.totalKobo;
          buckets.days31_60.invoices.push(item);
        } else if (daysOverdue <= 90) {
          buckets.days61_90.count++;
          buckets.days61_90.totalKobo += inv.totalKobo;
          buckets.days61_90.invoices.push(item);
        } else {
          buckets.days90plus.count++;
          buckets.days90plus.totalKobo += inv.totalKobo;
          buckets.days90plus.invoices.push(item);
        }
      }

      const totalOutstandingKobo = unpaidInvoices.reduce((s, i) => s + i.totalKobo, 0);

      return {
        buckets: [
          { label: "Current", key: "current", ...buckets.current },
          { label: "1–30 days", key: "days1_30", ...buckets.days1_30 },
          { label: "31–60 days", key: "days31_60", ...buckets.days31_60 },
          { label: "61–90 days", key: "days61_90", ...buckets.days61_90 },
          { label: "90+ days", key: "days90plus", ...buckets.days90plus },
        ],
        totalOutstandingKobo,
        totalUnpaidCount: unpaidInvoices.length,
        generatedAt: today,
      };
    }),

  /**
   * Subscription health metrics — active, paused, failed, cancelled, churned.
   * Also returns MRR (monthly recurring revenue) and churn rate.
   */
  getSubscriptionHealth: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      tenantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();

      const conditions: any[] = [];
      if (input.merchantId) conditions.push(eq(subscriptions.merchantId, input.merchantId));
      if (input.tenantId) conditions.push(eq(subscriptions.tenantId, input.tenantId));

      const statusCounts = await db
        .select({
          status: subscriptions.status,
          count: sql<number>`count(*)`,
          totalAmountKobo: sql<number>`coalesce(sum(${subscriptions.amountKobo}), 0)`,
        })
        .from(subscriptions)
        .where(conditions.length > 0 ? and(...conditions) : undefined)
        .groupBy(subscriptions.status);

      const byStatus: Record<string, { count: number; totalAmountKobo: number }> = {};
      for (const row of statusCounts) {
        byStatus[row.status] = {
          count: Number(row.count),
          totalAmountKobo: Number(row.totalAmountKobo),
        };
      }

      const active = byStatus["active"] ?? { count: 0, totalAmountKobo: 0 };
      const paused = byStatus["paused"] ?? { count: 0, totalAmountKobo: 0 };
      const failed = byStatus["failed"] ?? { count: 0, totalAmountKobo: 0 };
      const cancelled = byStatus["cancelled"] ?? { count: 0, totalAmountKobo: 0 };
      const completed = byStatus["completed"] ?? { count: 0, totalAmountKobo: 0 };

      // MRR: sum of active monthly-equivalent amounts
      const mrrRows = await db
        .select({
          interval: subscriptions.interval,
          totalAmountKobo: sql<number>`coalesce(sum(${subscriptions.amountKobo}), 0)`,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, "active"),
            ...(conditions.length > 0 ? conditions : []),
          ),
        )
        .groupBy(subscriptions.interval);

      let mrrKobo = 0;
      for (const row of mrrRows) {
        const amt = Number(row.totalAmountKobo);
        switch (row.interval) {
          case "daily": mrrKobo += amt * 30; break;
          case "weekly": mrrKobo += amt * 4.33; break;
          case "monthly": mrrKobo += amt; break;
          case "quarterly": mrrKobo += amt / 3; break;
          case "annually": mrrKobo += amt / 12; break;
          default: mrrKobo += amt; break;
        }
      }

      const total = Object.values(byStatus).reduce((s, v) => s + v.count, 0);
      const churnRate = total > 0 ? ((cancelled.count + failed.count) / total) * 100 : 0;
      const failureRate = total > 0 ? (failed.count / total) * 100 : 0;

      // Recent failures (last 7 days)
      const recentFailures = await db
        .select({
          id: subscriptions.id,
          merchantId: subscriptions.merchantId,
          customerEmail: subscriptions.customerEmail,
          planName: subscriptions.planName,
          amountKobo: subscriptions.amountKobo,
          currency: subscriptions.currency,
          failureReason: subscriptions.failureReason,
          updatedAt: subscriptions.updatedAt,
        })
        .from(subscriptions)
        .where(
          and(
            eq(subscriptions.status, "failed"),
            gte(subscriptions.updatedAt, daysAgo(7)),
            ...(conditions.length > 0 ? conditions : []),
          ),
        )
        .orderBy(desc(subscriptions.updatedAt))
        .limit(20);

      return {
        summary: {
          active: active.count,
          paused: paused.count,
          failed: failed.count,
          cancelled: cancelled.count,
          completed: completed.count,
          total,
        },
        mrrKobo: Math.round(mrrKobo),
        churnRate: Math.round(churnRate * 100) / 100,
        failureRate: Math.round(failureRate * 100) / 100,
        recentFailures,
        generatedAt: now(),
      };
    }),

  /**
   * Revenue KPIs with period-over-period comparison.
   */
  getRevenueKpis: protectedProcedure
    .input(z.object({
      tenantId: z.string(),
      days: z.number().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();

      const currentFrom = daysAgo(input.days);
      const previousFrom = daysAgo(input.days * 2);
      const previousTo = daysAgo(input.days);

      async function getPeriodTotals(from: Date, to: Date) {
        const [row] = await db
          .select({
            txCount: sql<number>`count(*)`,
            grossFeeKobo: sql<number>`coalesce(sum(${billingEvents.grossFeeKobo}), 0)`,
            platformRevenueKobo: sql<number>`coalesce(sum(${billingEvents.platformRevenueKobo}), 0)`,
            netPlatformKobo: sql<number>`coalesce(sum(${billingEvents.netPlatformRevenueKobo}), 0)`,
            amountKobo: sql<number>`coalesce(sum(${billingEvents.amountKobo}), 0)`,
          })
          .from(billingEvents)
          .where(
            and(
              eq(billingEvents.tenantId, input.tenantId),
              gte(billingEvents.occurredAt, from),
              lte(billingEvents.occurredAt, to),
            ),
          );
        return {
          txCount: Number(row?.txCount ?? 0),
          grossFeeKobo: Number(row?.grossFeeKobo ?? 0),
          platformRevenueKobo: Number(row?.platformRevenueKobo ?? 0),
          netPlatformKobo: Number(row?.netPlatformKobo ?? 0),
          amountKobo: Number(row?.amountKobo ?? 0),
        };
      }

      const [current, previous] = await Promise.all([
        getPeriodTotals(currentFrom, now()),
        getPeriodTotals(previousFrom, previousTo),
      ]);

      function pctChange(curr: number, prev: number) {
        if (prev === 0) return curr > 0 ? 100 : 0;
        return Math.round(((curr - prev) / prev) * 10000) / 100;
      }

      return {
        current,
        previous,
        changes: {
          txCount: pctChange(current.txCount, previous.txCount),
          grossFeeKobo: pctChange(current.grossFeeKobo, previous.grossFeeKobo),
          platformRevenueKobo: pctChange(current.platformRevenueKobo, previous.platformRevenueKobo),
          netPlatformKobo: pctChange(current.netPlatformKobo, previous.netPlatformKobo),
          amountKobo: pctChange(current.amountKobo, previous.amountKobo),
        },
        period: { from: currentFrom, to: now(), days: input.days },
      };
    }),

  /**
   * Daily invoice creation + payment trend.
   */
  getInvoiceTrend: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(),
      days: z.number().min(7).max(90).default(30),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();
      const since = daysAgo(input.days);

      const conditions: any[] = [gte(invoices.createdAt, since)];
      if (input.merchantId) conditions.push(eq(invoices.merchantId, input.merchantId));

      const result = await db
        .select({
          day: sql<string>`DATE_TRUNC('day', ${invoices.createdAt})::date`,
          created: sql<number>`count(*)`,
          paid: sql<number>`count(*) filter (where ${invoices.status} = 'paid')`,
          unpaid: sql<number>`count(*) filter (where ${invoices.status} = 'unpaid')`,
          totalKobo: sql<number>`coalesce(sum(${invoices.totalKobo}), 0)`,
          paidKobo: sql<number>`coalesce(sum(${invoices.totalKobo}) filter (where ${invoices.status} = 'paid'), 0)`,
        })
        .from(invoices)
        .where(and(...conditions))
        .groupBy(sql`DATE_TRUNC('day', ${invoices.createdAt})`)
        .orderBy(sql`DATE_TRUNC('day', ${invoices.createdAt})`);

      return result.map((r) => ({
        day: String(r.day),
        created: Number(r.created),
        paid: Number(r.paid),
        unpaid: Number(r.unpaid),
        totalKobo: Number(r.totalKobo),
        paidKobo: Number(r.paidKobo),
        collectionRate: Number(r.created) > 0
          ? Math.round((Number(r.paid) / Number(r.created)) * 10000) / 100
          : 0,
      }));
    }),

  /**
   * Top merchants by billed amount in the given period.
   */
  getTopMerchants: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
      limit: z.number().min(1).max(50).default(10),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();
      const since = daysAgo(input.days);

      const result = await db
        .select({
          merchantId: invoices.merchantId,
          invoiceCount: sql<number>`count(*)`,
          totalKobo: sql<number>`coalesce(sum(${invoices.totalKobo}), 0)`,
          paidKobo: sql<number>`coalesce(sum(${invoices.totalKobo}) filter (where ${invoices.status} = 'paid'), 0)`,
          unpaidKobo: sql<number>`coalesce(sum(${invoices.totalKobo}) filter (where ${invoices.status} = 'unpaid'), 0)`,
        })
        .from(invoices)
        .where(gte(invoices.createdAt, since))
        .groupBy(invoices.merchantId)
        .orderBy(desc(sql`coalesce(sum(${invoices.totalKobo}), 0)`))
        .limit(input.limit);

      return result.map((r) => ({
        merchantId: r.merchantId,
        invoiceCount: Number(r.invoiceCount),
        totalKobo: Number(r.totalKobo),
        paidKobo: Number(r.paidKobo),
        unpaidKobo: Number(r.unpaidKobo),
        collectionRate: Number(r.totalKobo) > 0
          ? Math.round((Number(r.paidKobo) / Number(r.totalKobo)) * 10000) / 100
          : 0,
      }));
    }),

  /**
   * Failed subscription payments log (last N days).
   */
  getFailedPayments: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(14),
      merchantId: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      assertAdmin(ctx.user.role);
      const db = await requireDb();
      const since = daysAgo(input.days);

      const conditions: any[] = [
        eq(subscriptions.status, "failed"),
        gte(subscriptions.updatedAt, since),
      ];
      if (input.merchantId) conditions.push(eq(subscriptions.merchantId, input.merchantId));

      const rows = await db
        .select({
          id: subscriptions.id,
          merchantId: subscriptions.merchantId,
          customerEmail: subscriptions.customerEmail,
          customerName: subscriptions.customerName,
          planName: subscriptions.planName,
          amountKobo: subscriptions.amountKobo,
          currency: subscriptions.currency,
          interval: subscriptions.interval,
          failureReason: subscriptions.failureReason,
          lastRunAt: subscriptions.lastRunAt,
          updatedAt: subscriptions.updatedAt,
        })
        .from(subscriptions)
        .where(and(...conditions))
        .orderBy(desc(subscriptions.updatedAt))
        .limit(50);

      return rows;
    }),
});
