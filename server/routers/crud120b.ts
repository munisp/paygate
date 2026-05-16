/**
 * crud120b — Wave 120 Part B
 * Continuation of crud120: sections 41–60 + final export
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { z } from "zod";
import {
  splitBillSessions,
  splitBillShares,
  splitPayments,
  staffMembers,
  staffShifts,
  stripeSubscriptions,
  subscriptionCharges,
  superAgentV2Networks,
  supportMessages,
  taxFilingRecords,
  tenantBillingInvoices,
  tenantConfig,
  tenantCorridorDailyStats,
  tenantCorridors,
  tenantFeeOverrides,
  tenantPlanLimits,
  tenantSsoConfigs,
  tenantUsageMetrics,
  tenants,
  transactionReceipts,
  usdcDeposits,
  usdcPayouts,
  usdcV2Transactions,
  usdcV2Wallets,
  userInsuranceClaims,
  webhookSimulatorLogs,
} from "../../drizzle/schema";
import { eq, desc, and, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(20),
});

function paginate(page: number, limit: number) {
  return { offset: (page - 1) * limit, limit };
}

// ─── 41. Split Bill ──────────────────────────────────────────────────────────

export const splitBillRouter = router({
  listSessions: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(splitBillSessions)
      .where(eq(splitBillSessions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(splitBillSessions.createdAt))
      .offset(offset).limit(limit);
    return { sessions: rows, total: rows.length };
  }),
  createSession: protectedProcedure.input(z.object({
    orderId: z.string().optional(),
    totalAmountKobo: z.number().int().positive(),
    splitType: z.enum(["equal", "custom", "item_based"]),
    participantCount: z.number().int().min(2).max(20),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [session] = await db.insert(splitBillSessions).values({
      merchantId: ctx.user.tenantId ?? "",
      orderId: input.orderId ?? null,
      totalAmountKobo: input.totalAmountKobo,
      splitType: input.splitType,
      participantCount: input.participantCount,
      notes: input.notes ?? null,
      status: "pending",
    }).returning();
    // Auto-create equal shares if splitType is equal
    if (input.splitType === "equal") {
      const shareKobo = Math.floor(input.totalAmountKobo / input.participantCount);
      await db.insert(splitBillShares).values(
        Array.from({ length: input.participantCount }, (_, i) => ({
          sessionId: session.id,
          participantIndex: i + 1,
          shareKobo,
          status: "pending",
        }))
      );
    }
    return session;
  }),
  listShares: protectedProcedure.input(z.object({ sessionId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(splitBillShares)
      .where(eq(splitBillShares.sessionId, input.sessionId));
    return { shares: rows };
  }),
  payShare: protectedProcedure.input(z.object({
    shareId: z.string(),
    paymentReference: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(splitBillShares).set({ status: "paid", paidAt: new Date() })
      .where(eq(splitBillShares.id, input.shareId));
    return { success: true };
  }),
  listSplitPayments: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(splitPayments)
      .where(eq(splitPayments.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(splitPayments.createdAt))
      .offset(offset).limit(limit);
    return { payments: rows, total: rows.length };
  }),
});

// ─── 42. Staff ───────────────────────────────────────────────────────────────

export const staffRouter = router({
  listMembers: protectedProcedure.input(paginationInput.extend({
    department: z.string().optional(),
    role: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(staffMembers)
      .where(eq(staffMembers.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { members: rows, total: rows.length };
  }),
  getMember: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(staffMembers).where(eq(staffMembers.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  createMember: protectedProcedure.input(z.object({
    name: z.string().min(1),
    role: z.string().default("server"),
    hourlyRateKobo: z.number().int().min(0).default(0),
    bankCode: z.string().optional(),
    accountNumber: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(staffMembers).values({
      merchantId: ctx.user.tenantId ?? "",
      name: input.name,
      role: input.role,
      hourlyRateKobo: input.hourlyRateKobo,
      bankCode: input.bankCode ?? null,
      accountNumber: input.accountNumber ?? null,
      active: true,
    }).returning();
    return row;
  }),
  updateMember: protectedProcedure.input(z.object({
    id: z.string(),
    name: z.string().optional(),
    role: z.string().optional(),
    active: z.boolean().optional(),
    hourlyRateKobo: z.number().int().min(0).optional(),
    bankCode: z.string().optional(),
    accountNumber: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(staffMembers).set(rest).where(eq(staffMembers.id, id));
    return { success: true };
  }),
  deleteMember: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(staffMembers).set({ active: false }).where(eq(staffMembers.id, input.id));
    return { success: true };
  }),
  listShifts: protectedProcedure.input(paginationInput.extend({
    staffId: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(staffShifts)
      .where(eq(staffShifts.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(staffShifts.clockIn))
      .offset(offset).limit(limit);
    return { shifts: rows, total: rows.length };
  }),
  createShift: protectedProcedure.input(z.object({
    staffId: z.string(),
    clockIn: z.number(),
    clockOut: z.number().optional(),
    tipsKobo: z.number().int().min(0).default(0),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(staffShifts).values({
      merchantId: ctx.user.tenantId ?? "",
      staffId: input.staffId,
      clockIn: new Date(input.clockIn),
      clockOut: input.clockOut ? new Date(input.clockOut) : null,
      tipsKobo: input.tipsKobo,
    }).returning();
    return row;
  }),
  clockIn: protectedProcedure.input(z.object({ shiftId: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(staffShifts).set({ clockIn: new Date() })
      .where(eq(staffShifts.id, input.shiftId));
    return { success: true };
  }),
  clockOut: protectedProcedure.input(z.object({ shiftId: z.number() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(staffShifts).set({ clockOut: new Date() })
      .where(eq(staffShifts.id, input.shiftId));
    return { success: true };
  }),
});

// ─── 43. Stripe Subscriptions ────────────────────────────────────────────────

export const stripeSubscriptionsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(stripeSubscriptions)
      .where(eq(stripeSubscriptions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(stripeSubscriptions.createdAt))
      .offset(offset).limit(limit);
    return { subscriptions: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(stripeSubscriptions).where(eq(stripeSubscriptions.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  listCharges: protectedProcedure.input(paginationInput.extend({
    subscriptionId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(subscriptionCharges)
      .where(eq(subscriptionCharges.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(subscriptionCharges.createdAt))
      .offset(offset).limit(limit);
    return { charges: rows, total: rows.length };
  }),
});

// ─── 44. Super Agent V2 Networks ─────────────────────────────────────────────

export const superAgentV2Router = router({
  listNetworks: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(superAgentV2Networks)
      .where(eq(superAgentV2Networks.superAgentMerchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(superAgentV2Networks.createdAt))
      .offset(offset).limit(limit);
    return { networks: rows, total: rows.length };
  }),
  addSubAgent: protectedProcedure.input(z.object({
    subAgentMerchantId: z.string(),
    commissionBps: z.number().int().min(0).max(10000).default(100),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(superAgentV2Networks).values({
      superAgentMerchantId: ctx.user.tenantId ?? "",
      subAgentMerchantId: input.subAgentMerchantId,
      commissionBps: input.commissionBps,
      notes: input.notes ?? null,
      status: "active",
    }).returning();
    return row;
  }),
  suspend: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(superAgentV2Networks).set({ status: "suspended" })
      .where(eq(superAgentV2Networks.id, input.id));
    return { success: true };
  }),
  reactivate: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(superAgentV2Networks).set({ status: "active" })
      .where(eq(superAgentV2Networks.id, input.id));
    return { success: true };
  }),
});

// ─── 45. Support Messages ────────────────────────────────────────────────────

export const supportRouter = router({
  listSessions: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    merchantId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    // Get distinct session IDs with latest message
    const rows = await db.selectDistinctOn([supportMessages.sessionId], {
      sessionId: supportMessages.sessionId,
      merchantId: supportMessages.merchantId,
      lastMessage: supportMessages.content,
      lastMessageAt: supportMessages.createdAt,
      status: supportMessages.status,
    }).from(supportMessages)
      .orderBy(supportMessages.sessionId, desc(supportMessages.createdAt))
      .offset(offset).limit(limit);
    return { sessions: rows, total: rows.length };
  }),
  getSession: protectedProcedure.input(z.object({ sessionId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(supportMessages)
      .where(eq(supportMessages.sessionId, input.sessionId))
      .orderBy(supportMessages.createdAt);
    return { messages: rows };
  }),
  sendMessage: protectedProcedure.input(z.object({
    sessionId: z.string(),
    content: z.string().min(1),
    role: z.enum(["user", "agent", "system"]).default("user"),
    metadata: z.record(z.unknown()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(supportMessages).values({
      sessionId: input.sessionId,
      merchantId: ctx.user.tenantId ?? null,
      userId: String(ctx.user.id),
      role: input.role,
      content: input.content,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      status: "sent",
    }).returning();
    return row;
  }),
  startSession: protectedProcedure.input(z.object({
    initialMessage: z.string().min(1),
    category: z.string().optional(),
    priority: z.enum(["low", "medium", "high", "urgent"]).default("medium"),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const sessionId = `SUP-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [row] = await db.insert(supportMessages).values({
      sessionId,
      merchantId: ctx.user.tenantId ?? null,
      userId: String(ctx.user.id),
      role: "user",
      content: input.initialMessage,
      metadata: JSON.stringify({ category: input.category, priority: input.priority }),
      status: "sent",
    }).returning();
    return { sessionId, message: row };
  }),
  closeSession: protectedProcedure.input(z.object({ sessionId: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(supportMessages).set({ status: "closed" })
      .where(eq(supportMessages.sessionId, input.sessionId));
    return { success: true };
  }),
});

// ─── 46. Tax Filing Records ──────────────────────────────────────────────────

export const taxFilingRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    taxType: z.string().optional(),
    status: z.string().optional(),
    year: z.number().int().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(taxFilingRecords)
      .where(eq(taxFilingRecords.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(taxFilingRecords.createdAt))
      .offset(offset).limit(limit);
    return { records: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(taxFilingRecords).where(eq(taxFilingRecords.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    taxType: z.string().default("VAT"),
    period: z.string(),
    taxableAmount: z.number().int().min(0),
    taxAmount: z.number().int().min(0),
    dueDate: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(taxFilingRecords).values({
      merchantId: ctx.user.tenantId ?? "",
      taxType: input.taxType,
      period: input.period,
      taxableAmount: input.taxableAmount,
      taxAmount: input.taxAmount,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      status: "draft",
    }).returning();
    return row;
  }),
  file: protectedProcedure.input(z.object({
    id: z.string(),
    receiptNumber: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(taxFilingRecords).set({
      status: "filed",
      filedAt: new Date(),
      receiptNumber: input.receiptNumber ?? null,
    }).where(eq(taxFilingRecords.id, input.id));
    return { success: true };
  }),
  markPaid: protectedProcedure.input(z.object({
    id: z.string(),
    receiptNumber: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(taxFilingRecords).set({
      status: "paid",
      receiptNumber: input.receiptNumber ?? null,
    }).where(eq(taxFilingRecords.id, input.id));
    return { success: true };
  }),
});

// ─── 47. Tenant Management ───────────────────────────────────────────────────

export const tenantMgmtRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    plan: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(tenants)
      .orderBy(desc(tenants.createdAt))
      .offset(offset).limit(limit);
    return { tenants: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(tenants).where(eq(tenants.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    id: z.string().regex(/^ten_[a-z0-9_]+$/),
    name: z.string().min(2),
    slug: z.string().regex(/^[a-z0-9-]+$/),
    email: z.string().email(),
    phone: z.string().optional(),
    plan: z.enum(["starter", "growth", "enterprise"]).default("starter"),
    country: z.string().length(2).default("NG"),
    currency: z.string().length(3).default("NGN"),
    timezone: z.string().default("Africa/Lagos"),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(tenants).values({
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
  update: protectedProcedure.input(z.object({
    id: z.string(),
    name: z.string().optional(),
    email: z.string().email().optional(),
    phone: z.string().optional(),
    plan: z.enum(["starter", "growth", "enterprise"]).optional(),
    status: z.enum(["pending", "active", "suspended", "terminated"]).optional(),
    logoUrl: z.string().url().optional(),
    websiteUrl: z.string().url().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(tenants).set(rest).where(eq(tenants.id, id));
    return { success: true };
  }),
  suspend: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().max(5000) })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(tenants).set({ status: "suspended" }).where(eq(tenants.id, input.id));
    return { success: true };
  }),
  getConfig: protectedProcedure.input(z.object({ tenantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(tenantConfig)
      .where(eq(tenantConfig.tenantId, input.tenantId)).limit(1);
    return rows[0] ?? null;
  }),
  updateConfig: protectedProcedure.input(z.object({
    tenantId: z.string(),
    cardFeesBps: z.number().int().min(0).optional(),
    bankTransferFeesBps: z.number().int().min(0).optional(),
    mobileMoneyFeesBps: z.number().int().min(0).optional(),
    crossBorderFeesBps: z.number().int().min(0).optional(),
    bnplFeesBps: z.number().int().min(0).optional(),
    settlementDelayHours: z.number().int().min(0).optional(),
    kycLevel: z.number().int().min(0).max(3).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { tenantId, ...rest } = input;
    const existing = await db.select().from(tenantConfig)
      .where(eq(tenantConfig.tenantId, tenantId)).limit(1);
    if (existing.length > 0) {
      await db.update(tenantConfig).set(rest).where(eq(tenantConfig.tenantId, tenantId));
    } else {
      await db.insert(tenantConfig).values({ tenantId, ...rest });
    }
    return { success: true };
  }),
  listCorridors: protectedProcedure.input(paginationInput.extend({
    tenantId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(tenantCorridors)
      .offset(offset).limit(limit);
    return { corridors: rows, total: rows.length };
  }),
  createCorridor: protectedProcedure.input(z.object({
    tenantId: z.string(),
    sourceCurrency: z.string().length(3),
    destinationCurrency: z.string().length(3),
    sourceCountry: z.string().length(2),
    destinationCountry: z.string().length(2),
    feesBps: z.number().int().min(0).default(200),
    fxMarkupBps: z.number().int().min(0).default(100),
    minAmountKobo: z.number().int().positive().optional(),
    maxAmountKobo: z.number().int().positive().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(tenantCorridors).values({
      ...input,
      status: "active",
    }).returning();
    return row;
  }),
  listCorridorStats: protectedProcedure.input(paginationInput.extend({
    tenantId: z.string().optional(),
    corridorId: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(tenantCorridorDailyStats)
      .orderBy(desc(tenantCorridorDailyStats.date))
      .offset(offset).limit(limit);
    return { stats: rows, total: rows.length };
  }),
  listFeeOverrides: protectedProcedure.input(paginationInput.extend({
    tenantId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(tenantFeeOverrides)
      .offset(offset).limit(limit);
    return { overrides: rows, total: rows.length };
  }),
  createFeeOverride: protectedProcedure.input(z.object({
    tenantId: z.string(),
    feeType: z.string(),
    overrideBps: z.number().int().min(0),
    reason: z.string().optional(),
    expiresAt: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(tenantFeeOverrides).values({
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "active",
    }).returning();
    return row;
  }),
  getPlanLimits: protectedProcedure.input(z.object({ tenantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(tenantPlanLimits)
      .where(eq(tenantPlanLimits.tenantId, input.tenantId)).limit(1);
    return rows[0] ?? null;
  }),
  getSsoConfig: protectedProcedure.input(z.object({ tenantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(tenantSsoConfigs)
      .where(eq(tenantSsoConfigs.tenantId, input.tenantId)).limit(1);
    return rows[0] ?? null;
  }),
  upsertSsoConfig: protectedProcedure.input(z.object({
    tenantId: z.string(),
    provider: z.enum(["saml", "oidc", "google", "microsoft", "okta"]),
    entityId: z.string().optional(),
    ssoUrl: z.string().url().optional(),
    certificate: z.string().optional(),
    clientId: z.string().optional(),
    clientSecret: z.string().optional(),
    discoveryUrl: z.string().url().optional(),
    enabled: z.boolean().default(false),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { tenantId, ...rest } = input;
    const existing = await db.select().from(tenantSsoConfigs)
      .where(eq(tenantSsoConfigs.tenantId, tenantId)).limit(1);
    if (existing.length > 0) {
      await db.update(tenantSsoConfigs).set(rest).where(eq(tenantSsoConfigs.tenantId, tenantId));
    } else {
      await db.insert(tenantSsoConfigs).values({ tenantId, ...rest });
    }
    return { success: true };
  }),
  getUsageMetrics: protectedProcedure.input(z.object({
    tenantId: z.string(),
    period: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(tenantUsageMetrics)
      .where(eq(tenantUsageMetrics.tenantId, input.tenantId))
      .orderBy(desc(tenantUsageMetrics.recordedAt))
      .limit(1);
    return rows[0] ?? null;
  }),
  listBillingInvoices: protectedProcedure.input(paginationInput.extend({
    tenantId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(tenantBillingInvoices)
      .orderBy(desc(tenantBillingInvoices.createdAt))
      .offset(offset).limit(limit);
    return { invoices: rows, total: rows.length };
  }),
});

// ─── 48. Transaction Receipts ────────────────────────────────────────────────

export const transactionReceiptsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    transactionId: z.string().optional(),
    channel: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(transactionReceipts)
      .where(eq(transactionReceipts.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(transactionReceipts.createdAt))
      .offset(offset).limit(limit);
    return { receipts: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(transactionReceipts).where(eq(transactionReceipts.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  generate: protectedProcedure.input(z.object({
    transactionId: z.string(),
    emailAddress: z.string().email().optional(),
    pdfUrl: z.string().url().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const receiptNumber = `RCT-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(transactionReceipts).values({
      merchantId: ctx.user.tenantId ?? "",
      transactionId: input.transactionId,
      receiptNumber,
      emailAddress: input.emailAddress ?? null,
      pdfUrl: input.pdfUrl ?? null,
      viewCount: 0,
    }).returning();
    return row;
  }),
  resend: protectedProcedure.input(z.object({ id: z.string(), emailAddress: z.string().email().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(transactionReceipts).set({
      emailSentAt: new Date(),
      ...(input.emailAddress ? { emailAddress: input.emailAddress } : {}),
    }).where(eq(transactionReceipts.id, input.id));
    return { success: true };
  }),
});

// ─── 49. USDC ────────────────────────────────────────────────────────────────

export const usdcRouter = router({
  listDeposits: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(usdcDeposits)
      .where(eq(usdcDeposits.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(usdcDeposits.createdAt))
      .offset(offset).limit(limit);
    return { deposits: rows, total: rows.length };
  }),
  createDeposit: protectedProcedure.input(z.object({
    walletAddress: z.string(),
    amountUsdc: z.number().positive(),
    txHash: z.string().optional(),
    network: z.enum(["ethereum", "polygon", "solana", "base", "arbitrum"]).default("ethereum"),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(usdcDeposits).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
  listPayouts: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(usdcPayouts)
      .where(eq(usdcPayouts.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(usdcPayouts.createdAt))
      .offset(offset).limit(limit);
    return { payouts: rows, total: rows.length };
  }),
  createPayout: protectedProcedure.input(z.object({
    destinationAddress: z.string(),
    amountUsdc: z.number().positive(),
    network: z.enum(["ethereum", "polygon", "solana", "base", "arbitrum"]).default("ethereum"),
    memo: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(usdcPayouts).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
  listV2Wallets: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(usdcV2Wallets)
      .where(eq(usdcV2Wallets.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { wallets: rows, total: rows.length };
  }),
  createV2Wallet: protectedProcedure.input(z.object({
    label: z.string().min(1).max(500),
    network: z.enum(["ethereum", "polygon", "solana", "base", "arbitrum"]),
    walletAddress: z.string(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(usdcV2Wallets).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      balanceUsdc: 0,
      status: "active",
    }).returning();
    return row;
  }),
  listV2Transactions: protectedProcedure.input(paginationInput.extend({
    walletId: z.string().optional(),
    txType: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(usdcV2Transactions)
      .where(eq(usdcV2Transactions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(usdcV2Transactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
});

// ─── 50. User Insurance Claims ───────────────────────────────────────────────

export const insuranceClaimsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    claimType: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(userInsuranceClaims)
      .where(eq(userInsuranceClaims.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(userInsuranceClaims.createdAt))
      .offset(offset).limit(limit);
    return { claims: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(userInsuranceClaims).where(eq(userInsuranceClaims.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    policyId: z.string(),
    claimType: z.string(),
    claimAmountKobo: z.number().int().positive(),
    incidentDate: z.number(),
    description: z.string().max(5000),
    documents: z.array(z.string()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const claimNumber = `CLM-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(userInsuranceClaims).values({
      merchantId: ctx.user.tenantId ?? "",
      userId: String(ctx.user.id),
      claimNumber,
      policyId: input.policyId,
      claimType: input.claimType,
      claimAmountKobo: input.claimAmountKobo,
      incidentDate: new Date(input.incidentDate),
      description: input.description,
      documents: input.documents ? JSON.stringify(input.documents) : null,
      status: "submitted",
    }).returning();
    return row;
  }),
  approve: protectedProcedure.input(z.object({
    id: z.string(),
    approvedAmountKobo: z.number().int().positive(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(userInsuranceClaims).set({
      status: "approved",
      approvedAmountKobo: input.approvedAmountKobo,
      approvedAt: new Date(),
    }).where(eq(userInsuranceClaims.id, input.id));
    return { success: true };
  }),
  reject: protectedProcedure.input(z.object({
    id: z.string(),
    reason: z.string().max(5000),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(userInsuranceClaims).set({
      status: "rejected",
      rejectionReason: input.reason,
      rejectedAt: new Date(),
    }).where(eq(userInsuranceClaims.id, input.id));
    return { success: true };
  }),
  pay: protectedProcedure.input(z.object({
    id: z.string(),
    paymentReference: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(userInsuranceClaims).set({ status: "paid", paidAt: new Date() })
      .where(eq(userInsuranceClaims.id, input.id));
    return { success: true };
  }),
});

// ─── 51. Webhook Simulator Logs ──────────────────────────────────────────────

export const webhookSimulatorRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    eventType: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(webhookSimulatorLogs)
      .where(eq(webhookSimulatorLogs.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(webhookSimulatorLogs.createdAt))
      .offset(offset).limit(limit);
    return { logs: rows, total: rows.length };
  }),
  simulate: protectedProcedure.input(z.object({
    webhookId: z.string(),
    eventType: z.string(),
    payload: z.record(z.unknown()),
    targetUrl: z.string().url(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const startTime = Date.now();
    let responseStatus = 0;
    let responseBody = "";
    let status = "pending";
    try {
      const response = await fetch(input.targetUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Webhook-Simulator": "paygate",
          "X-Event-Type": input.eventType,
        },
        body: JSON.stringify(input.payload),
        signal: AbortSignal.timeout(10000),
      });
      responseStatus = response.status;
      responseBody = await response.text().catch(() => "");
      status = response.ok ? "success" : "failed";
    } catch (err) {
      status = "failed";
      responseBody = err instanceof Error ? err.message : "Unknown error";
    }
    const latencyMs = Date.now() - startTime;
    const [row] = await db.insert(webhookSimulatorLogs).values({
      merchantId: ctx.user.tenantId ?? "",
      webhookId: input.webhookId,
      eventType: input.eventType,
      payload: JSON.stringify(input.payload),
      responseStatus,
      responseBody,
      durationMs: latencyMs,
      success: status === "success",
      error: status !== "success" ? responseBody : null,
    }).returning();
    return row;
  }),
  retry: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(webhookSimulatorLogs).where(eq(webhookSimulatorLogs.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    const log = rows[0];
    const startTime = Date.now();
    let responseStatus = 0;
    let responseBody = "";
    let status = "pending";
    const targetUrl = (log as any).targetUrl ?? "";
    try {
      const response = await fetch(targetUrl, {
        method: "POST",
        headers: { "Content-Type": "application/json", "X-Webhook-Retry": "true" },
        body: log.payload,
        signal: AbortSignal.timeout(10000),
      });
      responseStatus = response.status;
      responseBody = await response.text().catch(() => "");
      status = response.ok ? "success" : "failed";
    } catch (err) {
      status = "failed";
      responseBody = err instanceof Error ? err.message : "Unknown error";
    }
    const latencyMs = Date.now() - startTime;
    await db.update(webhookSimulatorLogs).set({
      responseStatus,
      responseBody,
      durationMs: latencyMs,
      success: status === "success",
      error: status !== "success" ? responseBody : null,
    }).where(eq(webhookSimulatorLogs.id, input.id));
    return { success: true, status, responseStatus, latencyMs };
  }),
  clear: protectedProcedure.mutation(async ({ ctx }) => {
    const db = (await getDb())!;
    await db.delete(webhookSimulatorLogs)
      .where(eq(webhookSimulatorLogs.merchantId, ctx.user.tenantId ?? ""));
    return { success: true };
  }),
});
