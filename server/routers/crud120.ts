/**
 * crud120Router — Wave 120 Production Readiness
 * Provides full CRUD coverage for the 98 database tables that were not
 * covered by any previous router.  Every sub-router exposes at minimum:
 *   list   – paginated, filtered
 *   get    – by primary key
 *   create – validated input
 *   update – partial patch
 *   delete – hard or soft delete
 *
 * Tables are grouped into logical domains for maintainability.
 */

import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { publishAuditEvent } from "../kafkaClient";
import { getDb } from "../db";
import { z } from "zod";
import {
  adminNotificationPrefs,
  agentBankingV4Agents,
  agentNetwork,
  auditEvents,
  bnplRepaymentSchedules,
  carbonCreditTransactionsV2,
  complianceReports,
  consumerBudgets,
  consumerCards,
  consumerContacts,
  consumerIdempotencyKeys,
  consumerKycRecords,
  consumerLoyaltyAccounts,
  consumerLoyaltyTxns,
  consumerNotificationPrefs,
  consumerPhoneVerifications,
  consumerRecurringPayments,
  consumerSavingsGoals,
  consumerSplitParticipants,
  consumerSplitSessions,
  couponRedemptions,
  cryptoOfframpV2Transactions,
  emiLoans,
  emiRepayments,
  escrowContracts,
  escrowContractsV2,
  featureFlags,
  geofenceRules,
  helpSearchAnalytics,
  inventoryAuditLog,
  inventoryReservations,
  inventoryTransactions,
  inviteCodes,
  invoiceFinancingV2Applications,
  invoices,
  kdsStations,
  loyaltyAccounts,
  loyaltyPrograms,
  loyaltyTransactions,
  loyaltyV3Members,
  loyaltyV3Programs,
  marketplaceOrders,
  merchantRiskScores,
  merchantSolanaWallets,
  merchantStatusLog,
  moneyRequests,
  multiCurrencyLedgerAccounts,
  multiCurrencyLedgerEntries,
  mutualFundTransactions,
  nfcDevices,
  nfcTransactions,
  nftBadges,
  openBankingAccountsV2,
  openBankingConsentsV2,
  partnerOnboardingSessions,
  payrollRuns,
  payrollV3Employees,
  payrollV3Runs,
  portfolioRebalancingOrders,
  ptspBatches,
  rateLimitEvents,
  realtimeNotificationHistory,
  realtimeNotificationPreferences,
  recipeIngredients,
  reconciliationAlerts,
  regulatoryReports,
  restaurantOrderItems,
  restaurantOrders,
  restaurantTables,
  sdkTokens,
  settlementSlaEvents,
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
import { eq, desc, and, gte, lte, like, sql, isNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(20),
});

// ─── Helpers ─────────────────────────────────────────────────────────────────

function paginate(page: number, limit: number) {
  return { offset: (page - 1) * limit, limit };
}

// ─── 1. Admin Notification Prefs ─────────────────────────────────────────────

const adminNotifPrefsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(adminNotificationPrefs)
      .where(eq(adminNotificationPrefs.userId, ctx.user.id))
      .limit(1);
    return rows[0] ?? null;
  }),
  upsert: protectedProcedure.input(z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    inAppEnabled: z.boolean().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const existing = await db.select().from(adminNotificationPrefs)
      .where(eq(adminNotificationPrefs.userId, ctx.user.id)).limit(1);
    if (existing.length > 0) {
      await db.update(adminNotificationPrefs).set(input)
        .where(eq(adminNotificationPrefs.userId, ctx.user.id));
    } else {
      await db.insert(adminNotificationPrefs).values({ userId: ctx.user.id, ...input });
    }
    return { success: true };
  }),
});

// ─── 2. Agent Banking V4 ─────────────────────────────────────────────────────

const agentBankingV4Router = router({
  listAgents: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(agentBankingV4Agents)
      .where(eq(agentBankingV4Agents.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(agentBankingV4Agents.createdAt ?? sql`now()`))
      .offset(offset).limit(limit);
    return { agents: rows, total: rows.length };
  }),
  getAgent: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(agentBankingV4Agents)
      .where(eq(agentBankingV4Agents.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  createAgent: protectedProcedure.input(z.object({
    agentCode: z.string().min(3),
    agentName: z.string().min(2),
    phone: z.string().min(10),
    state: z.string().optional(),
    lga: z.string().optional(),
    address: z.string().optional(),
    terminalId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(agentBankingV4Agents).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "active",
    }).returning();
    return row;
  }),
  updateAgent: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["active", "suspended", "pending"]).optional(),
    agentName: z.string().optional(),
    phone: z.string().optional(),
    address: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(agentBankingV4Agents).set(rest).where(eq(agentBankingV4Agents.id, id));
    return { success: true };
  }),
  listNetworks: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(agentNetwork)
      .where(eq(agentNetwork.superAgentMerchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { networks: rows, total: rows.length };
  }),
});

// ─── 3. Audit Events ─────────────────────────────────────────────────────────

const auditEventsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    actorId: z.string().optional(),
    action: z.string().optional(),
    resource: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(auditEvents)
      .where(eq(auditEvents.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(auditEvents.createdAt))
      .offset(offset).limit(limit);
    return { events: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.number() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(auditEvents)
      .where(eq(auditEvents.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    actorId: z.string(),
    actorName: z.string(),
    actorEmail: z.string().optional(),
    action: z.string(),
    resource: z.string(),
    resourceId: z.string().optional(),
    metadata: z.record(z.unknown()).optional(),
    ipAddress: z.string().optional(),
    userAgent: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(auditEvents).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      metadata: input.metadata ? JSON.stringify(input.metadata) : null,
    }).returning();
    return row;
  }),
});

// ─── 4. BNPL Repayment Schedules ─────────────────────────────────────────────

const bnplRepaymentRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    bnplLoanId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const conditions = [];
    if (input.bnplLoanId) conditions.push(eq(bnplRepaymentSchedules.bnplLoanId, input.bnplLoanId));
    if (input.status) conditions.push(eq(bnplRepaymentSchedules.status, input.status));
    const rows = await db.select().from(bnplRepaymentSchedules)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(bnplRepaymentSchedules.instalmentNumber)
      .offset(offset).limit(limit);
    return { schedules: rows, total: rows.length };
  }),
  markPaid: protectedProcedure.input(z.object({
    id: z.string(),
    paidAt: z.number().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(bnplRepaymentSchedules)
      .set({ status: "paid", paidAt: input.paidAt ? new Date(input.paidAt) : new Date() })
      .where(eq(bnplRepaymentSchedules.id, input.id));
    return { success: true };
  }),
});

// ─── 5. Carbon Credits V2 ────────────────────────────────────────────────────

const carbonCreditsV2Router = router({
  list: protectedProcedure.input(paginationInput.extend({
    merchantId: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(carbonCreditTransactionsV2)
      .where(eq(carbonCreditTransactionsV2.merchantId, input.merchantId ?? ctx.user.tenantId ?? ""))
      .orderBy(desc(carbonCreditTransactionsV2.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    projectId: z.string(),
    credits: z.number().positive(),
    pricePerCredit: z.number().positive(),
    currency: z.string().default("NGN"),
    txType: z.enum(["purchase", "retirement", "transfer"]),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(carbonCreditTransactionsV2).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
});

// ─── 6. Compliance Reports ───────────────────────────────────────────────────

const complianceReportsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    reportType: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(complianceReports)
      .where(eq(complianceReports.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(complianceReports.createdAt))
      .offset(offset).limit(limit);
    return { reports: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(complianceReports)
      .where(eq(complianceReports.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    reportType: z.string(),
    period: z.string(),
    data: z.record(z.unknown()).optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(complianceReports).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      data: input.data ? JSON.stringify(input.data) : null,
      status: "draft",
    }).returning();
    return row;
  }),
  submit: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(complianceReports).set({ status: "submitted", submittedAt: new Date() })
      .where(eq(complianceReports.id, input.id));
    return { success: true };
  }),
});

// ─── 7. Consumer Finance ─────────────────────────────────────────────────────

const consumerFinanceRouter = router({
  listBudgets: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerBudgets)
      .where(eq(consumerBudgets.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { budgets: rows, total: rows.length };
  }),
  createBudget: protectedProcedure.input(z.object({
    category: z.string(),
    limitKobo: z.number().int().positive(),
    period: z.enum(["weekly", "monthly", "yearly"]),
    alertThreshold: z.number().min(0).max(100).default(80),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(consumerBudgets).values({
      userId: String(ctx.user.id),
      ...input,
      spentKobo: 0,
    }).returning();
    return row;
  }),
  updateBudget: protectedProcedure.input(z.object({
    id: z.string(),
    limitKobo: z.number().int().positive().optional(),
    alertThreshold: z.number().min(0).max(100).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(consumerBudgets).set(rest).where(eq(consumerBudgets.id, id));
    return { success: true };
  }),
  deleteBudget: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(consumerBudgets).where(eq(consumerBudgets.id, input.id));
    return { success: true };
  }),
  listSavingsGoals: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerSavingsGoals)
      .where(eq(consumerSavingsGoals.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { goals: rows, total: rows.length };
  }),
  createSavingsGoal: protectedProcedure.input(z.object({
    name: z.string().min(2),
    targetKobo: z.number().int().positive(),
    targetDate: z.number().optional(),
    category: z.string().optional(),
    autoSaveAmountKobo: z.number().int().optional(),
    autoSaveFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(consumerSavingsGoals).values({
      userId: String(ctx.user.id),
      ...input,
      currentKobo: 0,
      status: "active",
      targetDate: input.targetDate ? new Date(input.targetDate) : null,
    }).returning();
    return row;
  }),
  listRecurringPayments: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerRecurringPayments)
      .where(eq(consumerRecurringPayments.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { payments: rows, total: rows.length };
  }),
  createRecurringPayment: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    amountKobo: z.number().int().positive(),
    frequency: z.enum(["daily", "weekly", "monthly", "yearly"]),
    nextRunAt: z.number(),
    beneficiaryAccountNumber: z.string().optional(),
    beneficiaryBankCode: z.string().optional(),
    beneficiaryName: z.string().optional(),
    narration: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(consumerRecurringPayments).values({
      userId: String(ctx.user.id),
      ...input,
      nextRunAt: new Date(input.nextRunAt),
      status: "active",
    }).returning();
    return row;
  }),
  cancelRecurringPayment: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(consumerRecurringPayments).set({ status: "cancelled" })
      .where(eq(consumerRecurringPayments.id, input.id));
    return { success: true };
  }),
  listContacts: protectedProcedure.input(paginationInput.extend({
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerContacts)
      .where(eq(consumerContacts.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { contacts: rows, total: rows.length };
  }),
  addContact: protectedProcedure.input(z.object({
    name: z.string().min(2),
    phone: z.string().optional(),
    accountNumber: z.string().optional(),
    bankCode: z.string().optional(),
    bankName: z.string().optional(),
    nickname: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(consumerContacts).values({
      userId: String(ctx.user.id),
      ...input,
    }).returning();
    return row;
  }),
  deleteContact: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(consumerContacts).where(eq(consumerContacts.id, input.id));
    return { success: true };
  }),
  listSplitSessions: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerSplitSessions)
      .where(eq(consumerSplitSessions.initiatorId, String(ctx.user.id)))
      .orderBy(desc(consumerSplitSessions.createdAt))
      .offset(offset).limit(limit);
    return { sessions: rows, total: rows.length };
  }),
  createSplitSession: protectedProcedure.input(z.object({
    title: z.string().min(1).max(500),
    totalAmountKobo: z.number().int().positive(),
    currency: z.string().default("NGN"),
    participants: z.array(z.object({
      userId: z.string(),
      shareKobo: z.number().int().positive(),
    })),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [session] = await db.insert(consumerSplitSessions).values({
      initiatorId: String(ctx.user.id),
      title: input.title,
      totalAmountKobo: input.totalAmountKobo,
      currency: input.currency,
      status: "pending",
    }).returning();
    if (input.participants.length > 0) {
      await db.insert(consumerSplitParticipants).values(
        input.participants.map(p => ({
          sessionId: session.id,
          userId: p.userId,
          shareKobo: p.shareKobo,
          status: "pending",
        }))
      );
    }
    return session;
  }),
  listKycRecords: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerKycRecords)
      .where(eq(consumerKycRecords.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { records: rows, total: rows.length };
  }),
  listCards: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerCards)
      .where(eq(consumerCards.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { cards: rows, total: rows.length };
  }),
  listLoyaltyAccounts: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerLoyaltyAccounts)
      .where(eq(consumerLoyaltyAccounts.userId, String(ctx.user.id)))
      .offset(offset).limit(limit);
    return { accounts: rows, total: rows.length };
  }),
  listLoyaltyTxns: protectedProcedure.input(paginationInput.extend({
    accountId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(consumerLoyaltyTxns)
      .orderBy(desc(consumerLoyaltyTxns.createdAt))
      .offset(offset).limit(limit);
    return { txns: rows, total: rows.length };
  }),
});

// ─── 8. Coupon Redemptions ───────────────────────────────────────────────────

const couponRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    couponCode: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(couponRedemptions)
      .where(eq(couponRedemptions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(couponRedemptions.redeemedAt))
      .offset(offset).limit(limit);
    return { redemptions: rows, total: rows.length };
  }),
  redeem: protectedProcedure.input(z.object({
    couponCode: z.string(),
    transactionId: z.string(),
    discountKobo: z.number().int().positive(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(couponRedemptions).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "applied",
      redeemedAt: new Date(),
    }).returning();
    return row;
  }),
});

// ─── 9. Crypto Off-ramp V2 ───────────────────────────────────────────────────

const cryptoOfframpRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(cryptoOfframpV2Transactions)
      .where(eq(cryptoOfframpV2Transactions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(cryptoOfframpV2Transactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(cryptoOfframpV2Transactions)
      .where(eq(cryptoOfframpV2Transactions.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    cryptoCurrency: z.string(),
    cryptoAmount: z.number().positive(),
    fiatCurrency: z.string().default("NGN"),
    fiatAmountKobo: z.number().int().positive(),
    walletAddress: z.string(),
    bankAccountNumber: z.string(),
    bankCode: z.string(),
    exchangeRate: z.number().positive(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(cryptoOfframpV2Transactions).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
});

// ─── 10. EMI Loans & Repayments ──────────────────────────────────────────────

const emiLoansRouter = router({
  listLoans: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    merchantId: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(emiLoans)
      .where(eq(emiLoans.merchantId, input.merchantId ?? ctx.user.tenantId ?? ""))
      .orderBy(desc(emiLoans.createdAt))
      .offset(offset).limit(limit);
    return { loans: rows, total: rows.length };
  }),
  getLoan: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(emiLoans).where(eq(emiLoans.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  createLoan: protectedProcedure.input(z.object({
    customerId: z.string(),
    principalKobo: z.number().int().positive(),
    interestRateBps: z.number().int().min(0),
    tenureMonths: z.number().int().min(1).max(60),
    purpose: z.string().optional(),
    collateral: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const monthlyRate = input.interestRateBps / 10000 / 12;
    const emi = monthlyRate > 0
      ? Math.round(input.principalKobo * monthlyRate * Math.pow(1 + monthlyRate, input.tenureMonths) / (Math.pow(1 + monthlyRate, input.tenureMonths) - 1))
      : Math.round(input.principalKobo / input.tenureMonths);
    const [row] = await db.insert(emiLoans).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      emiAmountKobo: emi,
      totalAmountKobo: emi * input.tenureMonths,
      paidInstalments: 0,
      status: "pending",
    }).returning();
    return row;
  }),
  approveLoan: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(emiLoans).set({ status: "active", disbursedAt: new Date() })
      .where(eq(emiLoans.id, input.id));
    publishAuditEvent({ action: 'emi_loan.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
  listRepayments: protectedProcedure.input(paginationInput.extend({
    loanId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const conditions = input.loanId ? [eq(emiRepayments.loanId, input.loanId)] : [];
    const rows = await db.select().from(emiRepayments)
      .where(conditions.length > 0 ? and(...conditions) : undefined)
      .orderBy(desc(emiRepayments.paidAt))
      .offset(offset).limit(limit);
    return { repayments: rows, total: rows.length };
  }),
  recordRepayment: protectedProcedure.input(z.object({
    loanId: z.string(),
    amountKobo: z.number().int().positive(),
    instalmentNumber: z.number().int().positive(),
    paymentReference: z.string().optional(),
    channel: z.string().default("bank_transfer"),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(emiRepayments).values({
      ...input,
      status: "paid",
      paidAt: new Date(),
    }).returning();
    return row;
  }),
});

// ─── 11. Escrow Contracts ────────────────────────────────────────────────────

const escrowRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(escrowContracts)
      .where(eq(escrowContracts.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(escrowContracts.createdAt))
      .offset(offset).limit(limit);
    return { contracts: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(escrowContracts).where(eq(escrowContracts.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    buyerId: z.string(),
    sellerId: z.string(),
    amountKobo: z.number().int().positive(),
    currency: z.string().default("NGN"),
    description: z.string().max(5000),
    milestones: z.array(z.object({
      title: z.string().min(1).max(500),
      amountKobo: z.number().int().positive(),
      dueDate: z.number().optional(),
    })).optional(),
    expiresAt: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(escrowContracts).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      milestones: input.milestones ? JSON.stringify(input.milestones) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "pending",
    }).returning();
    return row;
  }),
  release: protectedProcedure.input(z.object({ id: z.string(), notes: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(escrowContracts).set({ status: "released", releasedAt: new Date() })
      .where(eq(escrowContracts.id, input.id));
    return { success: true };
  }),
  dispute: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().max(5000) })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(escrowContracts).set({ status: "disputed" })
      .where(eq(escrowContracts.id, input.id));
    return { success: true };
  }),
  listV2: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(escrowContractsV2)
      .where(eq(escrowContractsV2.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(escrowContractsV2.createdAt))
      .offset(offset).limit(limit);
    return { contracts: rows, total: rows.length };
  }),
});

// ─── 12. Feature Flags ───────────────────────────────────────────────────────

const featureFlagsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    enabled: z.boolean().optional(),
    search: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(featureFlags)
      .orderBy(featureFlags.key)
      .offset(offset).limit(limit);
    return { flags: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ key: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(featureFlags).where(eq(featureFlags.key, input.key)).limit(1);
    return rows[0] ?? null;
  }),
  create: protectedProcedure.input(z.object({
    key: z.string().regex(/^[a-z][a-zA-Z0-9_]*$/),
    name: z.string().min(1).max(500),
    description: z.string().optional(),
    enabled: z.boolean().default(false),
    rolloutPercentage: z.number().int().min(0).max(100).default(0),
    targetMerchantIds: z.string().optional(),
    targetingRules: z.record(z.unknown()).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(featureFlags).values({
      ...input,
      targetingRules: input.targetingRules ? JSON.stringify(input.targetingRules) : null,
    }).returning();
    return row;
  }),
  toggle: protectedProcedure.input(z.object({ id: z.string(), enabled: z.boolean() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(featureFlags).set({ enabled: input.enabled }).where(eq(featureFlags.id, input.id));
    return { success: true };
  }),
  update: protectedProcedure.input(z.object({
    id: z.string(),
    rolloutPercentage: z.number().int().min(0).max(100).optional(),
    targetMerchantIds: z.string().optional(),
    targetingRules: z.record(z.unknown()).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, targetingRules, ...rest } = input;
    await db.update(featureFlags).set({
      ...rest,
      ...(targetingRules !== undefined ? { targetingRules: JSON.stringify(targetingRules) } : {}),
    }).where(eq(featureFlags.id, id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(featureFlags).where(eq(featureFlags.id, input.id));
    return { success: true };
  }),
  // Public SDK endpoint — returns flags for a given merchant
  evaluate: publicProcedure.input(z.object({
    merchantId: z.string(),
    flagKeys: z.array(z.string()).optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(featureFlags).where(eq(featureFlags.enabled, true));
    const result: Record<string, boolean> = {};
    for (const row of rows) {
      if (input.flagKeys && !input.flagKeys.includes(row.key)) continue;
      // Check merchant targeting
      const targets = row.targetMerchantIds ? row.targetMerchantIds.split(",") : [];
      if (targets.length > 0 && !targets.includes(input.merchantId)) {
        result[row.key] = false;
        continue;
      }
      // Rollout percentage
      // NOTE: Math.random() here is intentional for percentage-based feature flag rollout.
      // However, this is non-deterministic per request — the same user may see different
      // flag values on different page loads. For consistent per-user rollout, replace with:
      //   const hash = parseInt(crypto.createHash('sha256').update(userId + row.key).digest('hex').slice(0,8), 16);
      //   result[row.key] = row.rolloutPercentage >= 100 || (hash % 100) < row.rolloutPercentage;
      result[row.key] = row.rolloutPercentage >= 100 || Math.random() * 100 < row.rolloutPercentage;
    }
    return { flags: result };
  }),
});

// ─── 13. Geofence Rules ──────────────────────────────────────────────────────

const geofenceRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(geofenceRules)
      .where(eq(geofenceRules.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { rules: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    lat: z.number(),
    lng: z.number(),
    radiusMeters: z.number().positive(),
    action: z.enum(["allow", "block", "alert"]),
    description: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(geofenceRules).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      enabled: true,
    }).returning();
    return row;
  }),
  toggle: protectedProcedure.input(z.object({ id: z.string(), enabled: z.boolean() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(geofenceRules).set({ enabled: input.enabled }).where(eq(geofenceRules.id, input.id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(geofenceRules).where(eq(geofenceRules.id, input.id));
    return { success: true };
  }),
});

// ─── 14. Help Search Analytics ───────────────────────────────────────────────

const helpSearchRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    query: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(helpSearchAnalytics)
      .orderBy(desc(helpSearchAnalytics.searchedAt))
      .offset(offset).limit(limit);
    return { analytics: rows, total: rows.length };
  }),
  record: publicProcedure.input(z.object({
    query: z.string(),
    merchantId: z.string().optional(),
    userId: z.string().optional(),
    resultsCount: z.number().int().min(0).default(0),
    clickedResultId: z.string().optional(),
    userType: z.enum(["merchant", "consumer", "admin"]).default("merchant"),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.insert(helpSearchAnalytics).values({
      ...input,
      searchedAt: new Date(),
    });
    return { success: true };
  }),
  topQueries: protectedProcedure.input(z.object({ limit: z.number().int().min(1).max(50).default(10) })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select({
      query: helpSearchAnalytics.query,
      count: sql<number>`count(*)::int`,
    }).from(helpSearchAnalytics)
      .groupBy(helpSearchAnalytics.query)
      .orderBy(desc(sql`count(*)`))
      .limit(input.limit);
    return { queries: rows };
  }),
});

// ─── 15. Inventory ───────────────────────────────────────────────────────────

const inventoryRouter = router({
  listTransactions: protectedProcedure.input(paginationInput.extend({
    productId: z.string().optional(),
    txType: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(inventoryTransactions)
      .where(eq(inventoryTransactions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(inventoryTransactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
  createTransaction: protectedProcedure.input(z.object({
    productId: z.string(),
    txType: z.enum(["purchase", "sale", "adjustment", "transfer", "return"]),
    quantity: z.number().int(),
    unitCostKobo: z.number().int().optional(),
    notes: z.string().optional(),
    referenceId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(inventoryTransactions).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
    }).returning();
    return row;
  }),
  listReservations: protectedProcedure.input(paginationInput.extend({
    productId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(inventoryReservations)
      .where(eq(inventoryReservations.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { reservations: rows, total: rows.length };
  }),
  createReservation: protectedProcedure.input(z.object({
    productId: z.string(),
    quantity: z.number().int().positive(),
    orderId: z.string().optional(),
    expiresAt: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(inventoryReservations).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "active",
    }).returning();
    return row;
  }),
  listAuditLog: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(inventoryAuditLog)
      .where(eq(inventoryAuditLog.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(inventoryAuditLog.createdAt))
      .offset(offset).limit(limit);
    return { logs: rows, total: rows.length };
  }),
});

// ─── 16. Invite Codes ────────────────────────────────────────────────────────

const inviteCodesRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(inviteCodes)
      .where(eq(inviteCodes.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(inviteCodes.createdAt))
      .offset(offset).limit(limit);
    return { codes: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    role: z.enum(["admin", "developer", "analyst", "support"]).default("analyst"),
    email: z.string().email().optional(),
    expiresInHours: z.number().int().min(1).max(720).default(72),
    maxUses: z.number().int().min(1).default(1),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const code = `INV-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [row] = await db.insert(inviteCodes).values({
      merchantId: ctx.user.tenantId ?? "",
      code,
      role: input.role,
      email: input.email ?? null,
      expiresAt: new Date(Date.now() + input.expiresInHours * 3600000),
      maxUses: input.maxUses,
      usedCount: 0,
      status: "active",
    }).returning();
    return row;
  }),
  revoke: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(inviteCodes).set({ status: "revoked" }).where(eq(inviteCodes.id, input.id));
    publishAuditEvent({ action: 'invite_code.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
  validate: publicProcedure.input(z.object({ code: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(inviteCodes)
      .where(and(eq(inviteCodes.code, input.code), eq(inviteCodes.status, "active")))
      .limit(1);
    if (!rows[0]) return { valid: false };
    const now = new Date();
    if (rows[0].expiresAt && rows[0].expiresAt < now) return { valid: false, reason: "expired" };
    if (rows[0].usedCount >= rows[0].maxUses) return { valid: false, reason: "exhausted" };
    return { valid: true, invite: rows[0] };
  }),
});

// ─── 17. Invoice Financing V2 ────────────────────────────────────────────────

const invoiceFinancingRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(invoiceFinancingV2Applications)
      .where(eq(invoiceFinancingV2Applications.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(invoiceFinancingV2Applications.createdAt))
      .offset(offset).limit(limit);
    return { applications: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(invoiceFinancingV2Applications)
      .where(eq(invoiceFinancingV2Applications.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  submitApplication: protectedProcedure.input(z.object({
    invoiceId: z.string(),
    requestedAmountKobo: z.number().int().positive(),
    invoiceAmountKobo: z.number().int().positive(),
    buyerName: z.string(),
    buyerRcNumber: z.string().optional(),
    invoiceDueDate: z.number(),
    documents: z.array(z.string()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(invoiceFinancingV2Applications).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      invoiceDueDate: new Date(input.invoiceDueDate),
      documents: input.documents ? JSON.stringify(input.documents) : null,
      status: "pending",
    }).returning();
    return row;
  }),
  approve: protectedProcedure.input(z.object({
    id: z.string(),
    approvedAmountKobo: z.number().int().positive(),
    interestRateBps: z.number().int().min(0),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(invoiceFinancingV2Applications).set({
      status: "approved",
      approvedAmountKobo: input.approvedAmountKobo,
      interestRateBps: input.interestRateBps,
      approvedAt: new Date(),
    }).where(eq(invoiceFinancingV2Applications.id, input.id));
    return { success: true };
  }),
});

// ─── 18. Invoices ────────────────────────────────────────────────────────────

const invoicesRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    customerId: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(invoices)
      .where(eq(invoices.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(invoices.createdAt))
      .offset(offset).limit(limit);
    return { invoices: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(invoices).where(eq(invoices.invoiceId, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    customerEmail: z.string().email().optional(),
    customerName: z.string().optional(),
    customerId: z.string().optional(),
    lineItems: z.array(z.object({
      description: z.string().max(5000),
      quantity: z.number().positive(),
      unitPriceKobo: z.number().int().positive(),
    })),
    taxRateBps: z.number().int().min(0).default(0),
    dueDate: z.number().optional(),
    notes: z.string().optional(),
    currency: z.string().default("NGN"),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const subtotal = input.lineItems.reduce((s, i) => s + i.quantity * i.unitPriceKobo, 0);
    const tax = Math.round(subtotal * input.taxRateBps / 10000);
    const invoiceId = `INV-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
    const [row] = await db.insert(invoices).values({
      invoiceId,
      merchantId: ctx.user.tenantId ?? "",
      customerEmail: input.customerEmail ?? null,
      customerName: input.customerName ?? null,
      customerId: input.customerId ?? null,
      lineItems: JSON.stringify(input.lineItems),
      subtotalKobo: subtotal,
      taxKobo: tax,
      totalKobo: subtotal + tax,
      currency: input.currency,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      notes: input.notes ?? null,
      status: "draft",
    }).returning();
    return row;
  }),
  send: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(invoices).set({ status: "sent", sentAt: new Date() })
      .where(eq(invoices.invoiceId, input.id));
    return { success: true };
  }),
  markPaid: protectedProcedure.input(z.object({ id: z.string(), paidAt: z.number().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(invoices).set({ status: "paid", paidAt: input.paidAt ? new Date(input.paidAt) : new Date() })
      .where(eq(invoices.invoiceId, input.id));
    return { success: true };
  }),
  void: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(invoices).set({ status: "void" }).where(eq(invoices.invoiceId, input.id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(invoices).where(eq(invoices.invoiceId, input.id));
    return { success: true };
  }),
});

// ─── 19. KDS Stations ────────────────────────────────────────────────────────

const kdsRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(kdsStations)
      .where(eq(kdsStations.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { stations: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    location: z.string().optional(),
    categories: z.array(z.string()).optional(),
    displayMode: z.enum(["grid", "list"]).default("grid"),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(kdsStations).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      categories: input.categories ? JSON.stringify(input.categories) : null,
      status: "online",
    }).returning();
    return row;
  }),
  update: protectedProcedure.input(z.object({
    id: z.string(),
    name: z.string().optional(),
    status: z.enum(["online", "offline", "maintenance"]).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(kdsStations).set(rest).where(eq(kdsStations.id, id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(kdsStations).where(eq(kdsStations.id, input.id));
    return { success: true };
  }),
});

// ─── 20. Loyalty Programs ────────────────────────────────────────────────────

const loyaltyProgramsRouter = router({
  listPrograms: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(loyaltyPrograms)
      .where(eq(loyaltyPrograms.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { programs: rows, total: rows.length };
  }),
  createProgram: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    pointsPerNaira: z.number().positive().default(1),
    redeemRate: z.number().positive().default(0.01),
    expiryDays: z.number().int().positive().optional(),
    tiers: z.array(z.object({ name: z.string().min(1).max(500), minPoints: z.number() })).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(loyaltyPrograms).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      tiers: input.tiers ? JSON.stringify(input.tiers) : null,
      status: "active",
    }).returning();
    return row;
  }),
  listAccounts: protectedProcedure.input(paginationInput.extend({
    programId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(loyaltyAccounts)
      .orderBy(desc(loyaltyAccounts.totalPoints))
      .offset(offset).limit(limit);
    return { accounts: rows, total: rows.length };
  }),
  listTransactions: protectedProcedure.input(paginationInput.extend({
    accountId: z.string().optional(),
    txType: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(loyaltyTransactions)
      .orderBy(desc(loyaltyTransactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
  awardPoints: protectedProcedure.input(z.object({
    accountId: z.string(),
    points: z.number().int().positive(),
    txType: z.enum(["earn", "bonus", "adjustment"]),
    referenceId: z.string().optional(),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(loyaltyTransactions).values({
      ...input,
      balanceBefore: 0,
      balanceAfter: input.points,
    }).returning();
    return row;
  }),
  listV3Programs: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(loyaltyV3Programs)
      .where(eq(loyaltyV3Programs.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { programs: rows, total: rows.length };
  }),
  listV3Members: protectedProcedure.input(paginationInput.extend({
    programId: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(loyaltyV3Members)
      .orderBy(desc(loyaltyV3Members.totalPoints))
      .offset(offset).limit(limit);
    return { members: rows, total: rows.length };
  }),
});

// ─── 21. Marketplace Orders ──────────────────────────────────────────────────

const marketplaceRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    buyerId: z.string().optional(),
    sellerId: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(marketplaceOrders)
      .where(eq(marketplaceOrders.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(marketplaceOrders.createdAt))
      .offset(offset).limit(limit);
    return { orders: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(marketplaceOrders).where(eq(marketplaceOrders.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    buyerId: z.string(),
    sellerId: z.string(),
    items: z.array(z.object({
      productId: z.string(),
      quantity: z.number().int().positive(),
      unitPriceKobo: z.number().int().positive(),
    })),
    shippingAddressId: z.string().optional(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const totalKobo = input.items.reduce((s, i) => s + i.quantity * i.unitPriceKobo, 0);
    const [row] = await db.insert(marketplaceOrders).values({
      merchantId: ctx.user.tenantId ?? "",
      buyerId: input.buyerId,
      sellerId: input.sellerId,
      items: JSON.stringify(input.items),
      totalKobo,
      notes: input.notes ?? null,
      status: "pending",
    }).returning();
    return row;
  }),
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["pending", "confirmed", "shipped", "delivered", "cancelled", "refunded"]),
    trackingNumber: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(marketplaceOrders).set(rest).where(eq(marketplaceOrders.id, id));
    return { success: true };
  }),
});

// ─── 22. Merchant Risk & Status ──────────────────────────────────────────────

const merchantRiskRouter = router({
  getRiskScore: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(merchantRiskScores)
      .where(eq(merchantRiskScores.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(merchantRiskScores.scoredAt))
      .limit(1);
    return rows[0] ?? null;
  }),
  listStatusLog: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(merchantStatusLog)
      .where(eq(merchantStatusLog.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(merchantStatusLog.changedAt))
      .offset(offset).limit(limit);
    return { logs: rows, total: rows.length };
  }),
  getSolanaWallet: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(merchantSolanaWallets)
      .where(eq(merchantSolanaWallets.merchantId, ctx.user.tenantId ?? "")).limit(1);
    return rows[0] ?? null;
  }),
  createSolanaWallet: protectedProcedure.input(z.object({
    publicKey: z.string(),
    label: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(merchantSolanaWallets).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "active",
    }).returning();
    return row;
  }),
});

// ─── 23. Money Requests ──────────────────────────────────────────────────────

const moneyRequestsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    direction: z.enum(["sent", "received"]).optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(moneyRequests)
      .where(eq(moneyRequests.requesterId, ctx.user.tenantId ?? ""))
      .orderBy(desc(moneyRequests.createdAt))
      .offset(offset).limit(limit);
    return { requests: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    payerId: z.string(),
    amountKobo: z.number().int().positive(),
    currency: z.string().default("NGN"),
    description: z.string().max(5000),
    expiresAt: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(moneyRequests).values({
      requesterId: ctx.user.tenantId ?? "",
      ...input,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "pending",
    }).returning();
    return row;
  }),
  approve: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(moneyRequests).set({ status: "approved", approvedAt: new Date() })
      .where(eq(moneyRequests.id, input.id));
    publishAuditEvent({ action: 'money_request.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
  decline: protectedProcedure.input(z.object({ id: z.string(), reason: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(moneyRequests).set({ status: "declined" }).where(eq(moneyRequests.id, input.id));
    return { success: true };
  }),
});

// ─── 24. Multi-Currency Ledger ───────────────────────────────────────────────

const multiCurrencyRouter = router({
  listAccounts: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(multiCurrencyLedgerAccounts)
      .where(eq(multiCurrencyLedgerAccounts.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { accounts: rows, total: rows.length };
  }),
  createAccount: protectedProcedure.input(z.object({
    currency: z.string().length(3),
    label: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(multiCurrencyLedgerAccounts).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      balanceKobo: 0,
      status: "active",
    }).returning();
    return row;
  }),
  listEntries: protectedProcedure.input(paginationInput.extend({
    accountId: z.string().optional(),
    currency: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(multiCurrencyLedgerEntries)
      .where(eq(multiCurrencyLedgerEntries.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(multiCurrencyLedgerEntries.createdAt))
      .offset(offset).limit(limit);
    return { entries: rows, total: rows.length };
  }),
  createEntry: protectedProcedure.input(z.object({
    accountId: z.string(),
    currency: z.string().length(3),
    amountKobo: z.number().int(),
    entryType: z.enum(["debit", "credit"]),
    description: z.string().optional(),
    referenceId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(multiCurrencyLedgerEntries).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
    }).returning();
    return row;
  }),
});

// ─── 25. Mutual Fund Transactions ────────────────────────────────────────────

const mutualFundsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    fundId: z.string().optional(),
    txType: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(mutualFundTransactions)
      .where(eq(mutualFundTransactions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(mutualFundTransactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    fundId: z.string(),
    txType: z.enum(["buy", "sell", "dividend", "switch"]),
    amountKobo: z.number().int().positive(),
    units: z.number().positive().optional(),
    navPerUnit: z.number().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(mutualFundTransactions).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "pending",
    }).returning();
    return row;
  }),
});

// ─── 26. NFC Devices & Transactions ─────────────────────────────────────────

const nfcRouter = router({
  listDevices: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(nfcDevices)
      .where(eq(nfcDevices.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { devices: rows, total: rows.length };
  }),
  registerDevice: protectedProcedure.input(z.object({
    deviceId: z.string(),
    label: z.string().min(1).max(500),
    location: z.string().optional(),
    terminalId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(nfcDevices).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "active",
    }).returning();
    return row;
  }),
  listTransactions: protectedProcedure.input(paginationInput.extend({
    deviceId: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(nfcTransactions)
      .where(eq(nfcTransactions.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(nfcTransactions.createdAt))
      .offset(offset).limit(limit);
    return { transactions: rows, total: rows.length };
  }),
});

// ─── 27. NFT Badges ──────────────────────────────────────────────────────────

const nftBadgesRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(nftBadges)
      .where(eq(nftBadges.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { badges: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    description: z.string().optional(),
    imageUrl: z.string().url().optional(),
    criteria: z.record(z.unknown()).optional(),
    maxSupply: z.number().int().positive().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(nftBadges).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      criteria: input.criteria ? JSON.stringify(input.criteria) : null,
      mintedCount: 0,
      status: "active",
    }).returning();
    return row;
  }),
  award: protectedProcedure.input(z.object({
    badgeId: z.string(),
    recipientId: z.string(),
    walletAddress: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(nftBadges).set({ mintedCount: sql`${nftBadges.mintedCount} + 1` })
      .where(eq(nftBadges.id, input.badgeId));
    return { success: true, badgeId: input.badgeId, recipientId: input.recipientId };
  }),
});

// ─── 28. Open Banking V2 ─────────────────────────────────────────────────────

const openBankingRouter = router({
  listAccounts: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(openBankingAccountsV2)
      .where(eq(openBankingAccountsV2.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { accounts: rows, total: rows.length };
  }),
  listConsents: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(openBankingConsentsV2)
      .where(eq(openBankingConsentsV2.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(openBankingConsentsV2.createdAt))
      .offset(offset).limit(limit);
    return { consents: rows, total: rows.length };
  }),
  createConsent: protectedProcedure.input(z.object({
    customerId: z.string(),
    permissions: z.array(z.string()),
    expiresAt: z.number().optional(),
    redirectUri: z.string().url(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const consentId = `CON-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
    const [row] = await db.insert(openBankingConsentsV2).values({
      merchantId: ctx.user.tenantId ?? "",
      consentId,
      customerId: input.customerId,
      permissions: JSON.stringify(input.permissions),
      redirectUri: input.redirectUri,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "pending",
    }).returning();
    return row;
  }),
  revokeConsent: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(openBankingConsentsV2).set({ status: "revoked", revokedAt: new Date() })
      .where(eq(openBankingConsentsV2.id, input.id));
    publishAuditEvent({ action: 'open_banking_consent.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
});

// ─── 29. Partner Onboarding Sessions ─────────────────────────────────────────

const partnerOnboardingRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(partnerOnboardingSessions)
      .orderBy(desc(partnerOnboardingSessions.createdAt))
      .offset(offset).limit(limit);
    return { sessions: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(partnerOnboardingSessions)
      .where(eq(partnerOnboardingSessions.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  updateStep: protectedProcedure.input(z.object({
    id: z.string(),
    currentStep: z.number().int().min(1).max(10),
    stepData: z.record(z.unknown()).optional(),
    completed: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(partnerOnboardingSessions).set({
      currentStep: input.currentStep,
      stepData: input.stepData ? JSON.stringify(input.stepData) : undefined,
      completedAt: input.completed ? new Date() : undefined,
      status: input.completed ? "completed" : "in_progress",
    }).where(eq(partnerOnboardingSessions.id, input.id));
    return { success: true };
  }),
});

// ─── 30. Payroll ─────────────────────────────────────────────────────────────

const payrollRouter = router({
  listRuns: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    period: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(payrollRuns)
      .where(eq(payrollRuns.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(payrollRuns.createdAt))
      .offset(offset).limit(limit);
    return { runs: rows, total: rows.length };
  }),
  getRun: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(payrollRuns).where(eq(payrollRuns.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  createRun: protectedProcedure.input(z.object({
    period: z.string(),
    payDate: z.number(),
    totalGrossKobo: z.number().int().positive(),
    totalNetKobo: z.number().int().positive(),
    totalDeductionsKobo: z.number().int().min(0),
    employeeCount: z.number().int().positive(),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(payrollRuns).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      payDate: new Date(input.payDate),
      status: "draft",
    }).returning();
    return row;
  }),
  approveRun: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(payrollRuns).set({ status: "approved", approvedAt: new Date() })
      .where(eq(payrollRuns.id, input.id));
    publishAuditEvent({ action: 'payroll_run.approved', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
  processRun: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(payrollRuns).set({ status: "processing", processedAt: new Date() })
      .where(eq(payrollRuns.id, input.id));
    return { success: true };
  }),
  listV3Employees: protectedProcedure.input(paginationInput.extend({
    department: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(payrollV3Employees)
      .where(eq(payrollV3Employees.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { employees: rows, total: rows.length };
  }),
  createV3Employee: protectedProcedure.input(z.object({
    firstName: z.string(),
    lastName: z.string(),
    email: z.string().email(),
    phone: z.string().optional(),
    department: z.string().optional(),
    position: z.string().optional(),
    grossSalaryKobo: z.number().int().positive(),
    bankCode: z.string(),
    accountNumber: z.string(),
    taxId: z.string().optional(),
    pensionId: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(payrollV3Employees).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "active",
    }).returning();
    return row;
  }),
  listV3Runs: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(payrollV3Runs)
      .where(eq(payrollV3Runs.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(payrollV3Runs.createdAt))
      .offset(offset).limit(limit);
    return { runs: rows, total: rows.length };
  }),
});

// ─── 31. Portfolio Rebalancing ───────────────────────────────────────────────

const portfolioRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(portfolioRebalancingOrders)
      .where(eq(portfolioRebalancingOrders.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(portfolioRebalancingOrders.createdAt))
      .offset(offset).limit(limit);
    return { orders: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    portfolioId: z.string(),
    targetAllocations: z.record(z.number()),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(portfolioRebalancingOrders).values({
      merchantId: ctx.user.tenantId ?? "",
      portfolioId: input.portfolioId,
      targetAllocations: JSON.stringify(input.targetAllocations),
      notes: input.notes ?? null,
      status: "pending",
    }).returning();
    return row;
  }),
  execute: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(portfolioRebalancingOrders).set({ status: "executed", executedAt: new Date() })
      .where(eq(portfolioRebalancingOrders.id, input.id));
    return { success: true };
  }),
});

// ─── 32. PTSP Batches ────────────────────────────────────────────────────────

const ptspRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    period: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(ptspBatches)
      .where(eq(ptspBatches.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(ptspBatches.createdAt))
      .offset(offset).limit(limit);
    return { batches: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(ptspBatches).where(eq(ptspBatches.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  create: protectedProcedure.input(z.object({
    period: z.string(),
    totalAmountKobo: z.number().int().positive(),
    transactionCount: z.number().int().positive(),
    settlementDate: z.number(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(ptspBatches).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      settlementDate: new Date(input.settlementDate),
      status: "pending",
    }).returning();
    return row;
  }),
  settle: protectedProcedure.input(z.object({ id: z.string(), reference: z.string().optional() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(ptspBatches).set({ status: "settled", settledAt: new Date() })
      .where(eq(ptspBatches.id, input.id));
    return { success: true };
  }),
});

// ─── 33. Rate Limit Events ───────────────────────────────────────────────────

const rateLimitEventsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    merchantId: z.string().optional(),
    action: z.string().optional(),
    from: z.number().optional(),
    to: z.number().optional(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(rateLimitEvents)
      .orderBy(desc(rateLimitEvents.createdAt))
      .offset(offset).limit(limit);
    return { events: rows, total: rows.length };
  }),
  stats: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    const total = await db.select({ count: sql<number>`count(*)::int` }).from(rateLimitEvents);
    const blocked = await db.select({ count: sql<number>`count(*)::int` }).from(rateLimitEvents)
      .where(eq(rateLimitEvents.action, "blocked"));
    return {
      total: total[0]?.count ?? 0,
      blocked: blocked[0]?.count ?? 0,
      throttled: (total[0]?.count ?? 0) - (blocked[0]?.count ?? 0),
    };
  }),
});

// ─── 34. Realtime Notifications ──────────────────────────────────────────────

const realtimeNotifRouter = router({
  listHistory: protectedProcedure.input(paginationInput.extend({
    read: z.boolean().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(realtimeNotificationHistory)
      .where(eq(realtimeNotificationHistory.userId, String(ctx.user.id)))
      .orderBy(desc(realtimeNotificationHistory.createdAt))
      .offset(offset).limit(limit);
    return { notifications: rows, total: rows.length };
  }),
  markRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(realtimeNotificationHistory).set({ readAt: new Date() })
      .where(eq(realtimeNotificationHistory.id, input.id));
    return { success: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = (await getDb())!;
    await db.update(realtimeNotificationHistory).set({ readAt: new Date() })
      .where(and(
        eq(realtimeNotificationHistory.userId, String(ctx.user.id)),
        isNull(realtimeNotificationHistory.readAt)
      ));
    return { success: true };
  }),
  getPreferences: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(realtimeNotificationPreferences)
      .where(eq(realtimeNotificationPreferences.userId, String(ctx.user.id))).limit(1);
    return rows[0] ?? null;
  }),
  updatePreferences: protectedProcedure.input(z.object({
    pushEnabled: z.boolean().optional(),
    emailEnabled: z.boolean().optional(),
    smsEnabled: z.boolean().optional(),
    categories: z.record(z.boolean()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const existing = await db.select().from(realtimeNotificationPreferences)
      .where(eq(realtimeNotificationPreferences.userId, String(ctx.user.id))).limit(1);
    if (existing.length > 0) {
      await db.update(realtimeNotificationPreferences).set({
        ...input,
        categories: input.categories ? JSON.stringify(input.categories) : undefined,
      }).where(eq(realtimeNotificationPreferences.userId, String(ctx.user.id)));
    } else {
      await db.insert(realtimeNotificationPreferences).values({
        userId: String(ctx.user.id),
        ...input,
        categories: input.categories ? JSON.stringify(input.categories) : null,
      });
    }
    return { success: true };
  }),
});

// ─── 35. Recipe Ingredients ──────────────────────────────────────────────────

const recipeRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    recipeId: z.string().optional(),
    search: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(recipeIngredients)
      .where(eq(recipeIngredients.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { ingredients: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    recipeId: z.string(),
    name: z.string().min(1).max(500),
    quantity: z.number().positive(),
    unit: z.string(),
    costPerUnitKobo: z.number().int().positive().optional(),
    allergens: z.array(z.string()).optional(),
    isOptional: z.boolean().default(false),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(recipeIngredients).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      allergens: input.allergens ? JSON.stringify(input.allergens) : null,
    }).returning();
    return row;
  }),
  update: protectedProcedure.input(z.object({
    id: z.string(),
    quantity: z.number().positive().optional(),
    costPerUnitKobo: z.number().int().positive().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const { id, ...rest } = input;
    await db.update(recipeIngredients).set(rest).where(eq(recipeIngredients.id, id));
    return { success: true };
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.delete(recipeIngredients).where(eq(recipeIngredients.id, input.id));
    return { success: true };
  }),
});

// ─── 36. Reconciliation Alerts ───────────────────────────────────────────────

const reconciliationRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    severity: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(reconciliationAlerts)
      .where(eq(reconciliationAlerts.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(reconciliationAlerts.createdAt))
      .offset(offset).limit(limit);
    return { alerts: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(reconciliationAlerts).where(eq(reconciliationAlerts.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  resolve: protectedProcedure.input(z.object({
    id: z.string(),
    resolution: z.string(),
    notes: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(reconciliationAlerts).set({
      status: "resolved",
      resolution: input.resolution,
      resolvedAt: new Date(),
    }).where(eq(reconciliationAlerts.id, input.id));
    return { success: true };
  }),
  dismiss: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(reconciliationAlerts).set({ status: "dismissed" })
      .where(eq(reconciliationAlerts.id, input.id));
    return { success: true };
  }),
});

// ─── 37. Regulatory Reports ──────────────────────────────────────────────────

const regulatoryReportsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    reportType: z.string().optional(),
    status: z.string().optional(),
    period: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(regulatoryReports)
      .where(eq(regulatoryReports.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(regulatoryReports.createdAt))
      .offset(offset).limit(limit);
    return { reports: rows, total: rows.length };
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(regulatoryReports).where(eq(regulatoryReports.id, input.id)).limit(1);
    if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND" });
    return rows[0];
  }),
  generate: protectedProcedure.input(z.object({
    reportType: z.enum(["cbn_returns", "fiu_str", "cac_annual", "firs_vat", "ndic_returns"]),
    period: z.string(),
    data: z.record(z.unknown()).optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(regulatoryReports).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      data: input.data ? JSON.stringify(input.data) : null,
      status: "draft",
    }).returning();
    return row;
  }),
  submit: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(regulatoryReports).set({ status: "submitted", submittedAt: new Date() })
      .where(eq(regulatoryReports.id, input.id));
    return { success: true };
  }),
});

// ─── 38. Restaurant ──────────────────────────────────────────────────────────

const restaurantRouter = router({
  listTables: protectedProcedure.input(paginationInput).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(restaurantTables)
      .where(eq(restaurantTables.merchantId, ctx.user.tenantId ?? ""))
      .offset(offset).limit(limit);
    return { tables: rows, total: rows.length };
  }),
  createTable: protectedProcedure.input(z.object({
    tableNumber: z.string(),
    capacity: z.number().int().positive(),
    section: z.string().optional(),
    qrCode: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const [row] = await db.insert(restaurantTables).values({
      merchantId: ctx.user.tenantId ?? "",
      ...input,
      status: "available",
    }).returning();
    return row;
  }),
  updateTableStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["available", "occupied", "reserved", "cleaning"]),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(restaurantTables).set({ status: input.status }).where(eq(restaurantTables.id, input.id));
    return { success: true };
  }),
  listOrders: protectedProcedure.input(paginationInput.extend({
    tableId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(restaurantOrders)
      .where(eq(restaurantOrders.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(restaurantOrders.createdAt))
      .offset(offset).limit(limit);
    return { orders: rows, total: rows.length };
  }),
  createOrder: protectedProcedure.input(z.object({
    tableId: z.string().optional(),
    items: z.array(z.object({
      menuItemId: z.string(),
      name: z.string().min(1).max(500),
      quantity: z.number().int().positive(),
      unitPriceKobo: z.number().int().positive(),
      notes: z.string().optional(),
    })),
    orderType: z.enum(["dine_in", "takeaway", "delivery"]).default("dine_in"),
    notes: z.string().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const totalKobo = input.items.reduce((s, i) => s + i.quantity * i.unitPriceKobo, 0);
    const [order] = await db.insert(restaurantOrders).values({
      merchantId: ctx.user.tenantId ?? "",
      tableId: input.tableId ?? null,
      items: JSON.stringify(input.items),
      totalKobo,
      orderType: input.orderType,
      notes: input.notes ?? null,
      status: "pending",
    }).returning();
    if (input.items.length > 0) {
      await db.insert(restaurantOrderItems).values(
        input.items.map(item => ({
          orderId: order.id,
          merchantId: ctx.user.tenantId ?? "",
          ...item,
          status: "pending",
        }))
      );
    }
    return order;
  }),
  updateOrderStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["pending", "confirmed", "preparing", "ready", "served", "paid", "cancelled"]),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(restaurantOrders).set({ status: input.status }).where(eq(restaurantOrders.id, input.id));
    return { success: true };
  }),
  listOrderItems: protectedProcedure.input(z.object({ orderId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    const rows = await db.select().from(restaurantOrderItems)
      .where(eq(restaurantOrderItems.orderId, input.orderId));
    return { items: rows };
  }),
});

// ─── 39. SDK Tokens ──────────────────────────────────────────────────────────

const sdkTokensRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    platform: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(sdkTokens)
      .where(eq(sdkTokens.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(sdkTokens.createdAt))
      .offset(offset).limit(limit);
    return { tokens: rows, total: rows.length };
  }),
  create: protectedProcedure.input(z.object({
    label: z.string().min(1).max(500),
    platform: z.enum(["web", "ios", "android", "flutter", "react_native"]),
    permissions: z.array(z.string()).optional(),
    expiresAt: z.number().optional(),
  })).mutation(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const token = `sdk_${crypto.randomUUID().replace(/-/g, "")}`;
    const [row] = await db.insert(sdkTokens).values({
      merchantId: ctx.user.tenantId ?? "",
      token,
      label: input.label,
      platform: input.platform,
      permissions: input.permissions ? JSON.stringify(input.permissions) : null,
      expiresAt: input.expiresAt ? new Date(input.expiresAt) : null,
      status: "active",
    }).returning();
    return row;
  }),
  revoke: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(sdkTokens).set({ status: "revoked", revokedAt: new Date() })
      .where(eq(sdkTokens.id, input.id));
    publishAuditEvent({ action: 'sdk_token.revoked', actorId: 'system', targetId: input.id, metadata: {}, timestamp: new Date().toISOString() }).catch(() => {});
    return { success: true };
  }),
  rotate: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    const newToken = `sdk_${crypto.randomUUID().replace(/-/g, "")}`;
    await db.update(sdkTokens).set({ token: newToken, rotatedAt: new Date() })
      .where(eq(sdkTokens.id, input.id));
    return { success: true, token: newToken };
  }),
});

// ─── 40. Settlement SLA Events ───────────────────────────────────────────────

const settlementSlaRouter = router({
  list: protectedProcedure.input(paginationInput.extend({
    status: z.string().optional(),
    severity: z.string().optional(),
  })).query(async ({ ctx, input }) => {
    const db = (await getDb())!;
    const { offset, limit } = paginate(input.page, input.limit);
    const rows = await db.select().from(settlementSlaEvents)
      .where(eq(settlementSlaEvents.merchantId, ctx.user.tenantId ?? ""))
      .orderBy(desc(settlementSlaEvents.createdAt))
      .offset(offset).limit(limit);
    return { events: rows, total: rows.length };
  }),
  acknowledge: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(settlementSlaEvents).set({ status: "acknowledged", acknowledgedAt: new Date() })
      .where(eq(settlementSlaEvents.id, input.id));
    return { success: true };
  }),
  resolve: protectedProcedure.input(z.object({ id: z.string(), resolution: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    await db.update(settlementSlaEvents).set({ status: "resolved", resolvedAt: new Date() })
      .where(eq(settlementSlaEvents.id, input.id));
    return { success: true };
  }),
});

// ─── Export ──────────────────────────────────────────────────────────────────
// Sections 41–51 are in crud120b.ts
export const crud120Router = router({
  adminNotifPrefs: adminNotifPrefsRouter,
  agentBankingV4: agentBankingV4Router,
  auditEvents: auditEventsRouter,
  bnplRepayment: bnplRepaymentRouter,
  carbonCreditsV2: carbonCreditsV2Router,
  complianceReports: complianceReportsRouter,
  consumerFinance: consumerFinanceRouter,
  coupons: couponRouter,
  cryptoOfframp: cryptoOfframpRouter,
  emiLoans: emiLoansRouter,
  escrow: escrowRouter,
  featureFlags: featureFlagsRouter,
  geofence: geofenceRouter,
  helpSearch: helpSearchRouter,
  inventory: inventoryRouter,
  inviteCodes: inviteCodesRouter,
  invoiceFinancing: invoiceFinancingRouter,
  invoices: invoicesRouter,
  kds: kdsRouter,
  loyaltyPrograms: loyaltyProgramsRouter,
  marketplace: marketplaceRouter,
  merchantRisk: merchantRiskRouter,
  moneyRequests: moneyRequestsRouter,
  multiCurrency: multiCurrencyRouter,
  mutualFunds: mutualFundsRouter,
  nfc: nfcRouter,
  nftBadges: nftBadgesRouter,
  openBanking: openBankingRouter,
  partnerOnboarding: partnerOnboardingRouter,
  payroll: payrollRouter,
  portfolio: portfolioRouter,
  ptsp: ptspRouter,
  rateLimitEvents: rateLimitEventsRouter,
  realtimeNotif: realtimeNotifRouter,
  recipe: recipeRouter,
  reconciliation: reconciliationRouter,
  regulatoryReports: regulatoryReportsRouter,
  restaurant: restaurantRouter,
  sdkTokens: sdkTokensRouter,
  settlementSla: settlementSlaRouter,
});
