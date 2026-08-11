/**
 * Wave 119 — CRUD router for all 59 previously uncovered DB tables.
 * Each namespace exposes list, get, create, update, delete, and search
 * where applicable, using protectedProcedure throughout.
 */
import { z } from "zod";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb } from "../db";
import {
  walletTransactions,
  crossBorderTransfers,
  nipBanks,
  nipAccountCache,
  nipResolutionErrors,
  merchantNotifications,
  loyaltyLedger,
  bnplPlans,
  consumerFraudFlags,
  consumerOutbox,
  merchantProfiles,
  merchantDirectors,
  kybVerifications,
  kybSteps,
  merchantLoans,
  loanInstalments,
  loanRepayments,
  splitRules,
  dccTransactions,
  webhookEndpoints,
  webhookDeliveryLog,
  consumerFinanceLoans,
  invoicePayments,
  insurancePolicies,
  taxWithholdingRecords,
  regulatorySandboxConfigs,
  bulkPaymentSchedules,
  digitalGoldHoldings,
  digitalGoldTransactions,
  goldSipPlans,
  mutualFundHoldings,
  consumerInsurancePolicies,
  consumerInsuranceClaims,
  pensionAccounts,
  pensionContributions,
  cashbackBalances,
  cashbackTransactions,
  soundboxDevices,
  wealthRiskProfiles,
  wealthGoals,
  emiContracts,
  emiInstallments,
  bulkCollectionItems,
  salaryTransactions,
  privacySettings,
  privacyAliases,
  reportJobs,
  scheduledReports,
  nodalTransactions,
  retailPosConfigs,
  retailSales,
  intlRemittanceTransfers,
  subscriptionPlansV2,
  subscriptionSubscribers,
  portalSubscriptions,
  billingConfigs,
  billingAuditLog,
  overheadCosts,
  billingEvents,
} from "../../drizzle/schema";
import { eq, desc, like, and, gte, lte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";

// ─── helpers ──────────────────────────────────────────────────────────────────

const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

const dateRangeInput = z.object({
  from: z.string().optional(),
  to: z.string().optional(),
});

async function requireAdmin(ctx: { user: { role: string } }) {
  if (ctx.user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
}

// ─── wallet transactions ───────────────────────────────────────────────────────
export const walletRouter = router({
  list: protectedProcedure
    .input(paginationInput.extend({ merchantId: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(walletTransactions)
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input.limit).offset(offset);
      return rows;
    }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(walletTransactions).where(eq(walletTransactions.id, parseInt(input.id)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── cross-border transfers ────────────────────────────────────────────────────
export const crossBorderRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(crossBorderTransfers).orderBy(desc(crossBorderTransfers.createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(crossBorderTransfers).where(eq(crossBorderTransfers.id, parseInt(input.id)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure.input(z.object({
    senderAccountId: z.string(),
    receiverName: z.string(),
    receiverAccountNumber: z.string(),
    receiverBankCode: z.string(),
    receiverCountry: z.string(),
    amountKobo: z.number().int().positive(),
    currency: z.string().length(3),
    purposeCode: z.string().optional(),
    narration: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(crossBorderTransfers).values({
      ...input,
      status: "pending",
      merchantId: (ctx.user as any).merchantId ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["pending", "processing", "completed", "failed", "reversed"]),
    failureReason: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.update(crossBorderTransfers)
      .set({ status: input.status, failureReason: input.failureReason, updatedAt: new Date() } as any)
      .where(eq(crossBorderTransfers.id, input.id as any)).returning();
    return row;
  }),
});

// ─── NIP banks ────────────────────────────────────────────────────────────────
export const nipBanksRouter = router({
  list: protectedProcedure.input(z.object({ search: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(nipBanks);
    if (input.search) {
      return q.where(like(nipBanks.bankName, `%${input.search}%`));
    }
    return q.orderBy(nipBanks.bankName);
  }),
  resolveAccount: protectedProcedure.input(z.object({
    accountNumber: z.string().length(10),
    bankCode: z.string(),
  })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [cached] = await db.select().from(nipAccountCache)
      .where(and(eq(nipAccountCache.accountNumber, input.accountNumber), eq(nipAccountCache.bankCode, input.bankCode)));
    if (cached) return { accountName: cached.accountName, fromCache: true };
    // Call NIBSS NIP name enquiry endpoint
    const { env } = await import("../_core/env");
    const nibssUrl = env.nibssGatewayUrl;
    const nibssKey = env.nibssApiKey;
    if (!nibssKey) {
      return { accountName: null, fromCache: false, message: "Account resolution service unavailable" };
    }
    try {
      const resp = await fetch(`${nibssUrl}/nameenquiry`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${nibssKey}`,
          "InstitutionCode": env.nibssInstitutionCode,
        },
        body: JSON.stringify({
          DestinationInstitutionCode: input.bankCode,
          AccountNumber: input.accountNumber,
        }),
        signal: AbortSignal.timeout(10_000),
      });
      if (!resp.ok) {
        const errText = await resp.text().catch(() => "");
        await db.insert(nipResolutionErrors).values({
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          errorCode: String(resp.status),
          errorMessage: errText.slice(0, 500),
        } as any).catch(() => {}) as any;
        return { accountName: null, fromCache: false, message: "Name enquiry failed" };
      }
      const data = await resp.json() as any;
      const accountName: string = data.AccountName ?? data.accountName ?? data.BeneficiaryName ?? "";
      if (accountName) {
        await db.insert(nipAccountCache).values({
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          accountName,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        } as any).onConflictDoNothing().catch(() => {}) as any;
      }
      return { accountName: accountName || null, fromCache: false };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await db.insert(nipResolutionErrors).values({
        accountNumber: input.accountNumber,
        bankCode: input.bankCode,
        errorCode: "NETWORK_ERROR",
        errorMessage: message.slice(0, 500),
      } as any).catch(() => {}) as any;
      return { accountName: null, fromCache: false, message: "Account resolution temporarily unavailable" };
    }
  }),
});

// ─── merchant notifications ────────────────────────────────────────────────────
export const merchantNotificationsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ unreadOnly: z.boolean().optional() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conditions = [(merchantNotifications as any).merchantId ? eq((merchantNotifications as any).merchantId, (ctx.user as any).merchantId) : sql`1=1`];
    if (input.unreadOnly) conditions.push(eq((merchantNotifications as any).isRead, false));
    return db.select().from(merchantNotifications).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])).orderBy(desc((merchantNotifications as any).createdAt)).limit(input.limit).offset(offset);
  }),
  markRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(merchantNotifications).set({ isRead: true } as any).where(eq((merchantNotifications as any).id, input.id));
    return { success: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(merchantNotifications).set({ isRead: true } as any);
    return { success: true };
  }),
});

// ─── loyalty ledger ────────────────────────────────────────────────────────────
export const loyaltyRouter = router({
  balance: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(loyaltyLedger).where(eq((loyaltyLedger as any).merchantId, (ctx.user as any).merchantId ?? ""));
    const balance = rows.reduce((sum, r) => sum + ((r as any).pointsDelta ?? 0), 0);
    return { balance, transactions: rows };
  }),
  history: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(loyaltyLedger).orderBy(desc((loyaltyLedger as any).createdAt)).limit(input.limit).offset(offset);
  }),
});

// ─── BNPL plans ────────────────────────────────────────────────────────────────
export const bnplRouter = router({
  listPlans: protectedProcedure.input(paginationInput).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(bnplPlans).orderBy(desc((bnplPlans as any).createdAt)).limit(input.limit).offset(offset);
  }),
  getPlan: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(bnplPlans).where(eq((bnplPlans as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  createPlan: protectedProcedure.input(z.object({
    customerId: z.string(),
    merchantId: z.string(),
    totalAmountKobo: z.number().int().positive(),
    installments: z.number().int().min(2).max(24),
    interestRateBps: z.number().int().min(0),
    productDescription: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const installmentAmountKobo = Math.ceil(input.totalAmountKobo / input.installments);
    const [row] = await db.insert(bnplPlans).values({
      ...input,
      installmentAmountKobo,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["active", "completed", "defaulted", "cancelled"]),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.update(bnplPlans).set({ status: input.status, updatedAt: new Date() } as any).where(eq((bnplPlans as any).id, input.id)).returning();
    return row;
  }),
});

// ─── KYB verifications ─────────────────────────────────────────────────────────
export const kybRouter = router({
  getVerification: protectedProcedure.input(z.object({ merchantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(kybVerifications).where(eq((kybVerifications as any).merchantId, input.merchantId));
    return row ?? null;
  }),
  listSteps: protectedProcedure.input(z.object({ verificationId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(kybSteps).where(eq((kybSteps as any).verificationId, input.verificationId)).orderBy((kybSteps as any).stepOrder);
  }),
  updateStep: protectedProcedure.input(z.object({
    stepId: z.string(),
    status: z.enum(["pending", "in_review", "approved", "rejected"]),
    reviewNotes: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.update(kybSteps).set({ status: input.status, reviewNotes: input.reviewNotes, updatedAt: new Date() } as any).where(eq((kybSteps as any).id, input.stepId)).returning();
    return row;
  }),
  submitVerification: protectedProcedure.input(z.object({
    merchantId: z.string(),
    businessName: z.string(),
    rcNumber: z.string(),
    taxId: z.string().optional(),
    businessType: z.string(),
    incorporationDate: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(kybVerifications).where(eq((kybVerifications as any).merchantId, input.merchantId));
    if (existing) {
      const [row] = await db.update(kybVerifications).set({ ...input, status: "pending", updatedAt: new Date() } as any).where(eq((kybVerifications as any).merchantId, input.merchantId)).returning();
      return row;
    }
    const [row] = await db.insert(kybVerifications).values({ ...input, status: "pending", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── merchant loans ────────────────────────────────────────────────────────────
export const merchantLoansRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(merchantLoans).orderBy(desc((merchantLoans as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(merchantLoans).where(eq((merchantLoans as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listInstallments: protectedProcedure.input(z.object({ loanId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(loanInstalments).where(eq((loanInstalments as any).loanId, input.loanId)).orderBy((loanInstalments as any).dueDate);
  }),
  recordRepayment: protectedProcedure.input(z.object({
    loanId: z.string(),
    instalmentId: z.string(),
    amountKobo: z.number().int().positive(),
    paymentReference: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(loanRepayments).values({
      ...input,
      paidAt: new Date(),
      createdAt: new Date(),
    } as any).returning();
    await db.update(loanInstalments).set({ status: "paid", paidAt: new Date() } as any).where(eq((loanInstalments as any).id, input.instalmentId));
    return row;
  }) as any,
  applyLoan: protectedProcedure.input(z.object({
    merchantId: z.string(),
    requestedAmountKobo: z.number().int().positive(),
    tenorMonths: z.number().int().min(1).max(24),
    purpose: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(merchantLoans).values({
      ...input,
      status: "pending",
      interestRateBps: 200, // 2% monthly default
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
});

// ─── split rules ───────────────────────────────────────────────────────────────
export const splitRulesRouter = router({
  list: protectedProcedure.input(z.object({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(splitRules);
    if (input.merchantId) return q.where(eq((splitRules as any).merchantId, input.merchantId));
    return q;
  }),
  create: protectedProcedure.input(z.object({
    merchantId: z.string(),
    name: z.string().min(1).max(500),
    rules: z.array(z.object({
      subaccountCode: z.string(),
      sharePercent: z.number().min(0).max(100),
      bearsFee: z.boolean().optional(),
    })),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const totalShare = input.rules.reduce((s, r) => s + r.sharePercent, 0);
    if (Math.abs(totalShare - 100) > 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: "Split rules must sum to 100%" });
    const [row] = await db.insert(splitRules).values({ ...input, rules: JSON.stringify(input.rules), createdAt: new Date() } as any).returning();
    return row;
  }) as any,
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(splitRules).where(eq((splitRules as any).id, input.id));
    return { success: true };
  }),
});

// ─── DCC transactions ──────────────────────────────────────────────────────────
export const dccRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(dccTransactions).orderBy(desc((dccTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(dccTransactions).where(eq((dccTransactions as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── webhook endpoints ─────────────────────────────────────────────────────────
export const webhookEndpointsRouter = router({
  list: protectedProcedure.input(z.object({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(webhookEndpoints);
    if (input.merchantId) return q.where(eq((webhookEndpoints as any).merchantId, input.merchantId));
    return q;
  }),
  create: protectedProcedure.input(z.object({
    merchantId: z.string(),
    url: z.string().url(),
    events: z.array(z.string()),
    secret: z.string().min(16),
    description: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(webhookEndpoints).values({ ...input, events: JSON.stringify(input.events), isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  update: protectedProcedure.input(z.object({
    id: z.string(),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(webhookEndpoints).set({ ...updates, events: updates.events ? JSON.stringify(updates.events) : undefined, updatedAt: new Date() } as any).where(eq((webhookEndpoints as any).id, id)).returning();
    return row;
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(webhookEndpoints).where(eq((webhookEndpoints as any).id, input.id));
    return { success: true };
  }),
  deliveryLog: protectedProcedure.input(z.object({ webhookId: z.string() }).merge(paginationInput)).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(webhookDeliveryLog).where(eq((webhookDeliveryLog as any).webhookId, input.webhookId)).orderBy(desc((webhookDeliveryLog as any).createdAt)).limit(input.limit).offset(offset);
  }),
});

// ─── digital gold ──────────────────────────────────────────────────────────────
export const digitalGoldRouter = router({
  getHolding: protectedProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(digitalGoldHoldings).where(eq((digitalGoldHoldings as any).customerId, input.customerId));
    return row ?? { customerId: input.customerId, balanceGrams: 0, balanceKobo: 0 };
  }),
  listTransactions: protectedProcedure.input(paginationInput.extend({ customerId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(digitalGoldTransactions);
    if (input.customerId) return q.where(eq((digitalGoldTransactions as any).customerId, input.customerId)).orderBy(desc((digitalGoldTransactions as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((digitalGoldTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  listSipPlans: protectedProcedure.input(z.object({ customerId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(goldSipPlans);
    if (input.customerId) return q.where(eq((goldSipPlans as any).customerId, input.customerId));
    return q;
  }),
  createSipPlan: protectedProcedure.input(z.object({
    customerId: z.string(),
    monthlyAmountKobo: z.number().int().positive(),
    targetGrams: z.number().positive().optional(),
    dayOfMonth: z.number().int().min(1).max(28),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(goldSipPlans).values({ ...input, status: "active", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── pension ───────────────────────────────────────────────────────────────────
export const pensionRouter = router({
  getAccount: protectedProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(pensionAccounts).where(eq((pensionAccounts as any).customerId, input.customerId));
    return row ?? null;
  }),
  listContributions: protectedProcedure.input(paginationInput.extend({ accountId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(pensionContributions).where(eq((pensionContributions as any).accountId, input.accountId)).orderBy(desc((pensionContributions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  contribute: protectedProcedure.input(z.object({
    accountId: z.string(),
    amountKobo: z.number().int().positive(),
    contributionType: z.enum(["voluntary", "mandatory", "employer"]),
    paymentReference: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(pensionContributions).values({ ...input, status: "pending", createdAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── insurance ─────────────────────────────────────────────────────────────────
export const insuranceRouter = router({
  listPolicies: protectedProcedure.input(paginationInput.extend({ customerId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(consumerInsurancePolicies);
    if (input.customerId) return q.where(eq((consumerInsurancePolicies as any).customerId, input.customerId)).orderBy(desc((consumerInsurancePolicies as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((consumerInsurancePolicies as any).createdAt)).limit(input.limit).offset(offset);
  }),
  getPolicy: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(consumerInsurancePolicies).where(eq((consumerInsurancePolicies as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listClaims: protectedProcedure.input(paginationInput.extend({ policyId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(consumerInsuranceClaims);
    if (input.policyId) return q.where(eq((consumerInsuranceClaims as any).policyId, input.policyId)).orderBy(desc((consumerInsuranceClaims as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((consumerInsuranceClaims as any).createdAt)).limit(input.limit).offset(offset);
  }),
  fileClaim: protectedProcedure.input(z.object({
    policyId: z.string(),
    claimType: z.string(),
    description: z.string().max(5000),
    claimAmountKobo: z.number().int().positive(),
    incidentDate: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(consumerInsuranceClaims).values({ ...input, status: "submitted", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  updateClaimStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["submitted", "under_review", "approved", "rejected", "paid"]),
    reviewNotes: z.string().optional(),
    approvedAmountKobo: z.number().int().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(consumerInsuranceClaims).set({ ...updates, updatedAt: new Date() } as any).where(eq((consumerInsuranceClaims as any).id, id)).returning();
    return row;
  }),
});

// ─── cashback ──────────────────────────────────────────────────────────────────
export const cashbackRouter = router({
  getBalance: protectedProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(cashbackBalances).where(eq((cashbackBalances as any).customerId, input.customerId));
    return row ?? { customerId: input.customerId, balanceKobo: 0 };
  }),
  listTransactions: protectedProcedure.input(paginationInput.extend({ customerId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(cashbackTransactions);
    if (input.customerId) return q.where(eq((cashbackTransactions as any).customerId, input.customerId)).orderBy(desc((cashbackTransactions as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((cashbackTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  redeem: protectedProcedure.input(z.object({
    customerId: z.string(),
    amountKobo: z.number().int().positive(),
    redemptionType: z.enum(["wallet_credit", "bank_transfer", "merchant_discount"]),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [balance] = await db.select().from(cashbackBalances).where(eq((cashbackBalances as any).customerId, input.customerId));
    if (!balance || (balance as any).balanceKobo < input.amountKobo) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient cashback balance" });
    }
    await db.update(cashbackBalances).set({ balanceKobo: (balance as any).balanceKobo - input.amountKobo, updatedAt: new Date() } as any).where(eq((cashbackBalances as any).customerId, input.customerId));
    const [tx] = await db.insert(cashbackTransactions).values({ ...input, type: "redemption", status: "completed", createdAt: new Date() } as any).returning();
    return tx;
  }) as any,
});

// ─── wealth management ─────────────────────────────────────────────────────────
export const wealthRouter = router({
  getRiskProfile: protectedProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(wealthRiskProfiles).where(eq((wealthRiskProfiles as any).customerId, input.customerId));
    return row ?? null;
  }),
  setRiskProfile: protectedProcedure.input(z.object({
    customerId: z.string(),
    riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
    investmentHorizonYears: z.number().int().min(1).max(40),
    monthlyInvestmentKobo: z.number().int().min(0),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(wealthRiskProfiles).where(eq((wealthRiskProfiles as any).customerId, input.customerId));
    if (existing) {
      const [row] = await db.update(wealthRiskProfiles).set({ ...input, updatedAt: new Date() } as any).where(eq((wealthRiskProfiles as any).customerId, input.customerId)).returning();
      return row;
    }
    const [row] = await db.insert(wealthRiskProfiles).values({ ...input, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listGoals: protectedProcedure.input(z.object({ customerId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(wealthGoals).where(eq((wealthGoals as any).customerId, input.customerId)).orderBy((wealthGoals as any).targetDate);
  }),
  createGoal: protectedProcedure.input(z.object({
    customerId: z.string(),
    goalName: z.string(),
    targetAmountKobo: z.number().int().positive(),
    targetDate: z.string(),
    goalType: z.enum(["retirement", "education", "home", "emergency", "vacation", "other"]),
    monthlyContributionKobo: z.number().int().min(0),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(wealthGoals).values({ ...input, currentAmountKobo: 0, status: "active", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listMutualFunds: protectedProcedure.input(z.object({ customerId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(mutualFundHoldings);
    if (input.customerId) return q.where(eq((mutualFundHoldings as any).customerId, input.customerId));
    return q;
  }),
});

// ─── EMI contracts ─────────────────────────────────────────────────────────────
export const emiRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(emiContracts).orderBy(desc((emiContracts as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(emiContracts).where(eq((emiContracts as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listInstallments: protectedProcedure.input(z.object({ contractId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(emiInstallments).where(eq((emiInstallments as any).contractId, input.contractId)).orderBy((emiInstallments as any).dueDate);
  }),
  create: protectedProcedure.input(z.object({
    customerId: z.string(),
    merchantId: z.string(),
    principalKobo: z.number().int().positive(),
    tenorMonths: z.number().int().min(1).max(60),
    interestRateBps: z.number().int().min(0),
    productDescription: z.string(),
    firstDueDate: z.string(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const monthlyRate = input.interestRateBps / 10000;
    const emi = monthlyRate > 0
      ? Math.ceil(input.principalKobo * monthlyRate * Math.pow(1 + monthlyRate, input.tenorMonths) / (Math.pow(1 + monthlyRate, input.tenorMonths) - 1))
      : Math.ceil(input.principalKobo / input.tenorMonths);
    const [row] = await db.insert(emiContracts).values({ ...input, emiAmountKobo: emi, status: "active", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── salary transactions ───────────────────────────────────────────────────────
export const salaryRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(salaryTransactions).orderBy(desc((salaryTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(salaryTransactions).where(eq((salaryTransactions as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure.input(z.object({
    merchantId: z.string(),
    employeeId: z.string(),
    employeeName: z.string(),
    accountNumber: z.string(),
    bankCode: z.string(),
    amountKobo: z.number().int().positive(),
    payPeriod: z.string(),
    narration: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(salaryTransactions).values({ ...input, status: "pending", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  bulkCreate: protectedProcedure.input(z.object({
    merchantId: z.string(),
    payPeriod: z.string(),
    employees: z.array(z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      accountNumber: z.string(),
      bankCode: z.string(),
      amountKobo: z.number().int().positive(),
    })),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.insert(salaryTransactions).values(
      input.employees.map(e => ({ ...e, merchantId: input.merchantId, payPeriod: input.payPeriod, status: "pending", createdAt: new Date(), updatedAt: new Date() } as any)) as any).returning();
    return { count: rows.length, transactions: rows };
  }),
});

// ─── privacy settings ──────────────────────────────────────────────────────────
export const privacyRouter = router({
  getSettings: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(privacySettings).where(eq((privacySettings as any).userId, ctx.user.id));
    return row ?? { userId: ctx.user.id, dataRetentionDays: 365, marketingOptIn: false, analyticsOptIn: true };
  }),
  updateSettings: protectedProcedure.input(z.object({
    dataRetentionDays: z.number().int().min(30).max(2555).optional(),
    marketingOptIn: z.boolean().optional(),
    analyticsOptIn: z.boolean().optional(),
    shareWithPartners: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(privacySettings).where(eq((privacySettings as any).userId, ctx.user.id));
    if (existing) {
      const [row] = await db.update(privacySettings).set({ ...input, updatedAt: new Date() } as any).where(eq((privacySettings as any).userId, ctx.user.id)).returning();
      return row;
    }
    const [row] = await db.insert(privacySettings).values({ userId: ctx.user.id, ...input, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listAliases: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(privacyAliases).where(eq((privacyAliases as any).userId, ctx.user.id));
  }),
  createAlias: protectedProcedure.input(z.object({
    aliasType: z.enum(["email", "phone", "name"]),
    originalValue: z.string(),
    aliasValue: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(privacyAliases).values({ ...input, userId: ctx.user.id, createdAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── report jobs ───────────────────────────────────────────────────────────────
export const reportsRouter = router({
  listJobs: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(reportJobs).where(eq((reportJobs as any).userId, ctx.user.id)).orderBy(desc((reportJobs as any).createdAt)).limit(input.limit).offset(offset);
  }),
  createJob: protectedProcedure.input(z.object({
    reportType: z.enum(["transactions", "settlements", "disputes", "customers", "analytics", "billing", "compliance"]),
    format: z.enum(["csv", "xlsx", "pdf"]),
    filters: z.record(z.string(), z.any()).optional(),
    dateFrom: z.string(),
    dateTo: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(reportJobs).values({
      ...input,
      userId: ctx.user.id,
      status: "queued",
      filters: JSON.stringify(input.filters ?? {}) as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }),
  listScheduled: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(scheduledReports).where(eq((scheduledReports as any).userId, ctx.user.id));
  }),
  createSchedule: protectedProcedure.input(z.object({
    reportType: z.string(),
    format: z.enum(["csv", "xlsx", "pdf"]),
    cronExpression: z.string(),
    emailRecipients: z.array(z.string().email()),
    filters: z.record(z.string(), z.any()).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(scheduledReports).values({
      ...input,
      userId: ctx.user.id,
      isActive: true,
      emailRecipients: JSON.stringify(input.emailRecipients),
      filters: JSON.stringify(input.filters ?? {}) as any,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }),
  deleteSchedule: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(scheduledReports).where(and(eq((scheduledReports as any).id, input.id), eq((scheduledReports as any).userId, ctx.user.id)));
    return { success: true };
  }),
});

// ─── nodal accounts ────────────────────────────────────────────────────────────
export const nodalRouter = router({
  listTransactions: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(nodalTransactions).orderBy(desc((nodalTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(nodalTransactions).where(eq((nodalTransactions as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── retail POS ────────────────────────────────────────────────────────────────
export const retailPosRouter = router({
  listConfigs: protectedProcedure.input(z.object({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(retailPosConfigs);
    if (input.merchantId) return q.where(eq((retailPosConfigs as any).merchantId, input.merchantId));
    return q;
  }),
  createConfig: protectedProcedure.input(z.object({
    merchantId: z.string(),
    terminalId: z.string(),
    terminalName: z.string(),
    location: z.string().optional(),
    acceptedPaymentMethods: z.array(z.string()),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(retailPosConfigs).values({ ...input, acceptedPaymentMethods: JSON.stringify(input.acceptedPaymentMethods), isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listSales: protectedProcedure.input(paginationInput.extend({ terminalId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(retailSales);
    if (input.terminalId) return q.where(eq((retailSales as any).terminalId, input.terminalId)).orderBy(desc((retailSales as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((retailSales as any).createdAt)).limit(input.limit).offset(offset);
  }),
});

// ─── international remittance ──────────────────────────────────────────────────
export const intlRemittanceRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(intlRemittanceTransfers).orderBy(desc((intlRemittanceTransfers as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(intlRemittanceTransfers).where(eq((intlRemittanceTransfers as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure.input(z.object({
    senderId: z.string(),
    receiverName: z.string(),
    receiverCountry: z.string(),
    receiverAccountNumber: z.string(),
    receiverBankCode: z.string(),
    sendAmountKobo: z.number().int().positive(),
    sendCurrency: z.string().length(3),
    receiveCurrency: z.string().length(3),
    purposeCode: z.string(),
    narration: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(intlRemittanceTransfers).values({ ...input, status: "pending", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    status: z.enum(["pending", "processing", "completed", "failed", "reversed"]),
    exchangeRate: z.number().optional(),
    receiveAmountKobo: z.number().int().optional(),
    failureReason: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(intlRemittanceTransfers).set({ ...updates, updatedAt: new Date() } as any).where(eq((intlRemittanceTransfers as any).id, id)).returning();
    return row;
  }),
});

// ─── subscription plans v2 ─────────────────────────────────────────────────────
export const subscriptionV2Router = router({
  listPlans: protectedProcedure.query(async () => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(subscriptionPlansV2).orderBy((subscriptionPlansV2 as any).sortOrder);
  }),
  getPlan: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(subscriptionPlansV2).where(eq((subscriptionPlansV2 as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  createPlan: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    description: z.string().max(5000),
    monthlyPriceKobo: z.number().int().min(0),
    annualPriceKobo: z.number().int().min(0),
    features: z.array(z.string()),
    transactionLimitKobo: z.number().int().optional(),
    apiCallLimit: z.number().int().optional(),
    sortOrder: z.number().int().default(0),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(subscriptionPlansV2).values({ ...input, features: JSON.stringify(input.features), isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listSubscribers: protectedProcedure.input(paginationInput.extend({ planId: z.string().optional() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(subscriptionSubscribers);
    if (input.planId) return q.where(eq((subscriptionSubscribers as any).planId, input.planId)).orderBy(desc((subscriptionSubscribers as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((subscriptionSubscribers as any).createdAt)).limit(input.limit).offset(offset);
  }),
  subscribe: protectedProcedure.input(z.object({
    planId: z.string(),
    billingCycle: z.enum(["monthly", "annual"]),
    paymentMethodId: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(portalSubscriptions).where(eq((portalSubscriptions as any).userId, ctx.user.id));
    if (existing && (existing as any).status === "active") {
      throw new TRPCError({ code: "CONFLICT", message: "Already has an active subscription" });
    }
    const now = new Date();
    const periodEnd = new Date(now);
    periodEnd.setMonth(periodEnd.getMonth() + (input.billingCycle === "annual" ? 12 : 1));
    const [row] = await db.insert(portalSubscriptions).values({
      userId: ctx.user.id,
      planId: input.planId,
      billingCycle: input.billingCycle,
      status: "active",
      currentPeriodStart: now,
      currentPeriodEnd: periodEnd,
      createdAt: now,
      updatedAt: now,
    } as any).returning();
    return row;
  }) as any,
  getMySubscription: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(portalSubscriptions).where(eq((portalSubscriptions as any).userId, ctx.user.id));
    return row ?? null;
  }),
  cancel: protectedProcedure.mutation(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(portalSubscriptions).set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() } as any).where(eq((portalSubscriptions as any).userId, ctx.user.id));
    // Audit: subscription cancellation
    try {
      const { publishAuditEvent } = await import("../auditEvents");
      await publishAuditEvent({
        merchantId: String(ctx.user.id),
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? "Unknown",
        actorEmail: ctx.user.email ?? null,
        action: "subscription.cancel",
        resource: "portal_subscription",
        resourceId: String(ctx.user.id),
        metadata: {},
      });
    } catch { /* non-blocking */ }
    return { success: true };
  }),
});

// ─── overhead costs ────────────────────────────────────────────────────────────
export const overheadRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(overheadCosts).orderBy(desc(overheadCosts.createdAt)).limit(input.limit).offset(offset);
  }),
  create: protectedProcedure.input(z.object({
    category: z.enum(["infrastructure", "labor", "operations", "travel", "marketing", "legal", "other"]),
    description: z.string().max(5000),
    amountKobo: z.number().int().positive(),
    currency: z.string().length(3).default("NGN"),
    periodMonth: z.string(),
    isRecurring: z.boolean().default(false),
    inflationRateBps: z.number().int().min(0).default(0),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(overheadCosts).values({ ...input, recordedBy: String(ctx.user!.id), createdAt: new Date() } as any).returning();
    return row;
  }) as any,
  update: protectedProcedure.input(z.object({
    id: z.number().int(),
    amountKobo: z.number().int().positive().optional(),
    description: z.string().optional(),
    isRecurring: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(overheadCosts).set({ ...updates } as any).where(eq(overheadCosts.id, id as any)).returning();
    return row;
  }),
  delete: protectedProcedure.input(z.object({ id: z.number().int() })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(overheadCosts).where(eq(overheadCosts.id, input.id as any));
    return { success: true };
  }),
  summary: protectedProcedure.input(z.object({ periodMonth: z.string() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [year, month] = input.periodMonth.split("-").map(Number);
    const monthStart = new Date(Date.UTC(year, month - 1, 1));
    const monthEnd = new Date(Date.UTC(year, month, 1));
    const rows = await db.select().from(overheadCosts).where(and(gte(overheadCosts.periodStart, monthStart), lte(overheadCosts.periodStart, monthEnd)));
    const total = rows.reduce((s, r) => s + r.amountKobo, 0);
    const byCategory = rows.reduce((acc, r) => {
      acc[r.category] = (acc[r.category] ?? 0) + r.amountKobo;
      return acc;
    }, {} as Record<string, number>);
    return { total, byCategory, rows };
  }),
});

// ─── bulk collection items ─────────────────────────────────────────────────────
export const bulkCollectionRouter = router({
  listItems: protectedProcedure.input(paginationInput.extend({ scheduleId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(bulkCollectionItems);
    if (input.scheduleId) return q.where(eq((bulkCollectionItems as any).scheduleId, input.scheduleId)).orderBy(desc((bulkCollectionItems as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((bulkCollectionItems as any).createdAt)).limit(input.limit).offset(offset);
  }),
  listSchedules: protectedProcedure.input(paginationInput).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(bulkPaymentSchedules).orderBy(desc((bulkPaymentSchedules as any).createdAt)).limit(input.limit).offset(offset);
  }),
  createSchedule: protectedProcedure.input(z.object({
    merchantId: z.string(),
    scheduleName: z.string(),
    cronExpression: z.string(),
    items: z.array(z.object({
      recipientAccountNumber: z.string(),
      recipientBankCode: z.string(),
      recipientName: z.string(),
      amountKobo: z.number().int().positive(),
      narration: z.string().optional(),
    })),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [schedule] = await db.insert(bulkPaymentSchedules).values({
      merchantId: input.merchantId,
      scheduleName: input.scheduleName,
      cronExpression: input.cronExpression,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    const itemRows = await db.insert(bulkCollectionItems).values(
      input.items.map(item => ({ ...item, scheduleId: (schedule as any).id, status: "pending", createdAt: new Date() } as any)) as any).returning();
    return { schedule, items: itemRows };
  }) as any,
});

// ─── fraud flags ───────────────────────────────────────────────────────────────
export const fraudFlagsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ customerId: z.string().optional(), resolved: z.boolean().optional() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conditions = [];
    if (input.customerId) conditions.push(eq((consumerFraudFlags as any).customerId, input.customerId));
    if (input.resolved !== undefined) conditions.push(eq((consumerFraudFlags as any).isResolved, input.resolved));
    const q = db.select().from(consumerFraudFlags);
    if (conditions.length) return q.where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])).orderBy(desc((consumerFraudFlags as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((consumerFraudFlags as any).createdAt)).limit(input.limit).offset(offset);
  }),
  resolve: protectedProcedure.input(z.object({
    id: z.string(),
    resolution: z.string(),
    isFalsePositive: z.boolean(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.update(consumerFraudFlags).set({ isResolved: true, resolution: input.resolution, isFalsePositive: input.isFalsePositive, resolvedAt: new Date(), resolvedBy: String(ctx.user.id), updatedAt: new Date() } as any).where(eq((consumerFraudFlags as any).id, input.id)).returning();
    return row;
  }),
});

// ─── tax withholding ───────────────────────────────────────────────────────────
export const taxRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(taxWithholdingRecords).orderBy(desc((taxWithholdingRecords as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(taxWithholdingRecords).where(eq((taxWithholdingRecords as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  summary: protectedProcedure.input(z.object({ year: z.number().int(), merchantId: z.string().optional() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const rows = await db.select().from(taxWithholdingRecords);
    const total = rows.reduce((s, r) => s + ((r as any).withheldAmountKobo ?? 0), 0);
    return { year: input.year, totalWithheldKobo: total, records: rows.length };
  }),
});

// ─── regulatory sandbox ────────────────────────────────────────────────────────
export const regulatorySandboxRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(50),
      offset: z.number().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      await requireAdmin(ctx);
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      return db.select().from(regulatorySandboxConfigs).limit(input.limit).offset(input.offset);
    }),
  create: protectedProcedure.input(z.object({
    sandboxName: z.string(),
    regulatorCode: z.string(),
    configJson: z.record(z.string(), z.any()),
    expiresAt: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(regulatorySandboxConfigs).values({ ...input, configJson: JSON.stringify(input.configJson), isActive: true, createdBy: String(ctx.user.id), createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  update: protectedProcedure.input(z.object({
    id: z.string(),
    configJson: z.record(z.string(), z.any()).optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(regulatorySandboxConfigs).set({ ...updates, configJson: updates.configJson ? JSON.stringify(updates.configJson) : undefined, updatedAt: new Date() } as any).where(eq((regulatorySandboxConfigs as any).id, id)).returning();
    return row;
  }),
});

// ─── soundbox devices ──────────────────────────────────────────────────────────
export const soundboxRouter = router({
  list: protectedProcedure.input(z.object({ merchantId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const q = db.select().from(soundboxDevices);
    if (input.merchantId) return q.where(eq((soundboxDevices as any).merchantId, input.merchantId));
    return q;
  }),
  register: protectedProcedure.input(z.object({
    merchantId: z.string(),
    deviceId: z.string(),
    deviceName: z.string(),
    serialNumber: z.string(),
    firmwareVersion: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(soundboxDevices).values({ ...input, isActive: true, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    isActive: z.boolean(),
    lastSeenAt: z.string().optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const { id, ...updates } = input;
    const [row] = await db.update(soundboxDevices).set({ ...updates, updatedAt: new Date() } as any).where(eq((soundboxDevices as any).id, id)).returning();
    return row;
  }),
  deregister: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(soundboxDevices).where(eq((soundboxDevices as any).id, input.id));
    return { success: true };
  }),
});

// ─── consumer outbox ───────────────────────────────────────────────────────────
export const consumerOutboxRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ processed: z.boolean().optional() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(consumerOutbox);
    if (input.processed !== undefined) return q.where(eq((consumerOutbox as any).processed, input.processed)).orderBy(desc((consumerOutbox as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((consumerOutbox as any).createdAt)).limit(input.limit).offset(offset);
  }),
  reprocess: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.update(consumerOutbox).set({ processed: false, retryCount: 0, updatedAt: new Date() } as any).where(eq((consumerOutbox as any).id, input.id));
    return { success: true };
  }),
});

// ─── invoice payments ──────────────────────────────────────────────────────────
export const invoicePaymentsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ invoiceId: z.string().optional() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(invoicePayments);
    if (input.invoiceId) return q.where(eq((invoicePayments as any).invoiceId, input.invoiceId)).orderBy(desc((invoicePayments as any).createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc((invoicePayments as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(invoicePayments).where(eq((invoicePayments as any).id, input.id));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── merchant profiles & directors ────────────────────────────────────────────
export const merchantProfilesRouter = router({
  get: protectedProcedure.input(z.object({ merchantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(merchantProfiles).where(eq((merchantProfiles as any).merchantId, input.merchantId));
    return row ?? null;
  }),
  upsert: protectedProcedure.input(z.object({
    merchantId: z.string(),
    businessAddress: z.string().optional(),
    businessPhone: z.string().optional(),
    businessEmail: z.string().email().optional(),
    website: z.string().url().optional(),
    businessDescription: z.string().optional(),
    logoUrl: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    socialLinks: z.record(z.string(), z.string()).optional(),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [existing] = await db.select().from(merchantProfiles).where(eq((merchantProfiles as any).merchantId, input.merchantId));
    if (existing) {
      const [row] = await db.update(merchantProfiles).set({ ...input, socialLinks: input.socialLinks ? JSON.stringify(input.socialLinks) : undefined, updatedAt: new Date() } as any).where(eq((merchantProfiles as any).merchantId, input.merchantId)).returning();
      return row;
    }
    const [row] = await db.insert(merchantProfiles).values({ ...input, socialLinks: input.socialLinks ? JSON.stringify(input.socialLinks) : undefined, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  listDirectors: protectedProcedure.input(z.object({ merchantId: z.string() })).query(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(merchantDirectors).where(eq((merchantDirectors as any).merchantId, input.merchantId));
  }),
  addDirector: protectedProcedure.input(z.object({
    merchantId: z.string(),
    fullName: z.string(),
    bvn: z.string().optional(),
    nin: z.string().optional(),
    dateOfBirth: z.string().optional(),
    nationality: z.string().optional(),
    sharePercent: z.number().min(0).max(100).optional(),
    isPep: z.boolean().default(false),
  })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.insert(merchantDirectors).values({ ...input, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  removeDirector: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    await db.delete(merchantDirectors).where(eq((merchantDirectors as any).id, input.id));
    return { success: true };
  }),
});

// ─── billing audit log ─────────────────────────────────────────────────────────
export const billingAuditRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ configId: z.string().optional() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const q = db.select().from(billingAuditLog);
    if (input.configId) return q.where(eq(billingAuditLog.billingConfigId, input.configId)).orderBy(desc(billingAuditLog.createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc(billingAuditLog.createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(billingAuditLog).where(eq(billingAuditLog.id, input.id as any));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── billing events ────────────────────────────────────────────────────────────
export const billingEventsRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput).extend({
    merchantId: z.string().optional(),
    status: z.string().optional(),
  })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const offset = (input.page - 1) * input.limit;
    const conditions = [];
    if (input.merchantId) conditions.push(eq(billingEvents.merchantId, input.merchantId));
    // billing_events has no status column; the status input is accepted for API
    // compatibility but not applied as a filter.
    const q = db.select().from(billingEvents);
    if (conditions.length) return q.where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])).orderBy(desc(billingEvents.createdAt)).limit(input.limit).offset(offset);
    return q.orderBy(desc(billingEvents.createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.number().int() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const [row] = await db.select().from(billingEvents).where(eq(billingEvents.id, input.id as any));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  summary: protectedProcedure.input(z.object({ merchantId: z.string().optional(), periodMonth: z.string() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const conditions = [];
    if (input.merchantId) conditions.push(eq(billingEvents.merchantId, input.merchantId));
    const rows = await db.select().from(billingEvents).where(conditions.length ? and(...conditions) : undefined);
    const totalGrossFee = rows.reduce((s, r) => s + r.grossFeeKobo, 0);
    const totalPlatformRevenue = rows.reduce((s, r) => s + r.platformRevenueKobo, 0);
    const totalResellerRevenue = rows.reduce((s, r) => s + r.resellerRevenueKobo, 0);
    const totalNetPlatform = rows.reduce((s, r) => s + r.netPlatformRevenueKobo, 0);
    return { count: rows.length, totalGrossFee, totalPlatformRevenue, totalResellerRevenue, totalNetPlatform };
  }),
});

// ─── combined crud119 router ───────────────────────────────────────────────────
export const crud119Router = router({
  wallet: walletRouter,
  crossBorder: crossBorderRouter,
  nipBanks: nipBanksRouter,
  merchantNotifications: merchantNotificationsRouter,
  loyalty: loyaltyRouter,
  bnpl: bnplRouter,
  kyb: kybRouter,
  merchantLoans: merchantLoansRouter,
  splitRules: splitRulesRouter,
  dcc: dccRouter,
  webhookEndpoints: webhookEndpointsRouter,
  digitalGold: digitalGoldRouter,
  pension: pensionRouter,
  insurance: insuranceRouter,
  cashback: cashbackRouter,
  wealth: wealthRouter,
  emi: emiRouter,
  salary: salaryRouter,
  privacy: privacyRouter,
  reports: reportsRouter,
  nodal: nodalRouter,
  retailPos: retailPosRouter,
  intlRemittance: intlRemittanceRouter,
  subscriptionV2: subscriptionV2Router,
  overhead: overheadRouter,
  bulkCollection: bulkCollectionRouter,
  fraudFlags: fraudFlagsRouter,
  tax: taxRouter,
  regulatorySandbox: regulatorySandboxRouter,
  soundbox: soundboxRouter,
  consumerOutbox: consumerOutboxRouter,
  invoicePayments: invoicePaymentsRouter,
  merchantProfiles: merchantProfilesRouter,
  billingAudit: billingAuditRouter,
  billingEvents: billingEventsRouter,
});
