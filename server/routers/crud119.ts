/**
 * Wave 119 — CRUD router for all 59 previously uncovered DB tables.
 * Each namespace exposes list, get, create, update, delete, and search
 * where applicable, using protectedProcedure throughout.
 */
import { z } from "zod";
import type { SQL } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { randomUUID } from "crypto";
import {
  wallets,
  walletTransactions,
  crossBorderTransfers,
  nipBanks,
  nipAccountCache,
  nipResolutionErrors,
  merchantNotifications,
  loyaltyAccounts,
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
  invoices,
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
  bulkCollections,
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
import { eq, desc, like, and, gte, lte, sql, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { demoOrFail } from "../_core/demoData";

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

/**
 * Resolve the caller's merchant from the server-side session (never from
 * client-supplied input). Same pattern as chargebackLifecycle.ts.
 */
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

async function resolveMerchantId(openId: string): Promise<string> {
  return (await resolveMerchant(openId)).id;
}

// ─── wallet transactions ───────────────────────────────────────────────────────
export const walletRouter = router({
  list: protectedProcedure
    .input(paginationInput)
    .query(async ({ input, ctx }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      // wallet_transactions has no merchant_id; scope through the owning wallet.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const merchantWallets = db.select({ id: wallets.id }).from(wallets)
        .where(eq(wallets.merchantId, merchantId));
      const offset = (input.page - 1) * input.limit;
      const rows = await db.select().from(walletTransactions)
        .where(inArray(walletTransactions.walletId, merchantWallets))
        .orderBy(desc(walletTransactions.createdAt))
        .limit(input.limit).offset(offset);
      return rows;
    }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select({ tx: walletTransactions }).from(walletTransactions)
      .innerJoin(wallets, eq(wallets.id, walletTransactions.walletId))
      .where(and(eq(walletTransactions.id, parseInt(input.id)), eq(wallets.merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row.tx;
  }),
});

// ─── cross-border transfers ────────────────────────────────────────────────────
export const crossBorderRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(crossBorderTransfers).where(eq(crossBorderTransfers.merchantId, merchantId)).orderBy(desc(crossBorderTransfers.createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(crossBorderTransfers).where(and(eq(crossBorderTransfers.id, parseInt(input.id)), eq(crossBorderTransfers.merchantId, merchantId)));
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
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // STUB: this CRUD insert predates the quote+bridge initiate flow
    // (crossBorder.initiate in routers.ts). The input shape never matched the
    // cross_border_transfers schema (no transfer_id/quote_id/source_amount/
    // target_amount/exchange_rate/corridor/tenant_id), so the insert always
    // threw. Inserting a transfer row without a real quote and rail submission
    // would fabricate a money-movement record — fail loud in production
    // instead. Live transfers go through crossBorder.initiate.
    return demoOrFail({
      status: "not_executed",
      merchantId,
      receiverName: input.receiverName,
      message: "SIMULATED — no real transfer created; use crossBorder.initiate for live transfers",
    }, "crud119.crossBorder.create");
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
  })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Caller identity supplies tenant/merchant for cache + audit rows.
    const merchant = await resolveMerchant(ctx.user.openId);
    const [cached] = await db.select().from(nipAccountCache)
      .where(and(
        eq(nipAccountCache.tenantId, merchant.tenantId),
        eq(nipAccountCache.accountNumber, input.accountNumber),
        eq(nipAccountCache.bankCode, input.bankCode),
        sql`${nipAccountCache.expiresAt} > now()`,
      ));
    if (cached) return { accountName: cached.accountName, fromCache: true };
    // Call NIBSS NIP name enquiry endpoint
    const { env } = await import("../_core/env");
    const nibssUrl = env.nibssGatewayUrl;
    const nibssKey = env.nibssApiKey;
    if (!nibssKey) {
      // Fail loud: payment forms must NOT proceed without payee verification.
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Account resolution service unavailable: NIBSS is not configured" });
    }
    // Audit insert matching drizzle/schema.ts nip_resolution_errors (NOT NULL
    // tenantId/merchantId). A logging failure must not mask the real result.
    const logResolutionError = async (errorCode: string, errorMessage: string, errorSource: string) => {
      try {
        await db.insert(nipResolutionErrors).values({
          tenantId: merchant.tenantId,
          merchantId: merchant.id,
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          errorCode,
          errorMessage: errorMessage.slice(0, 500),
          errorSource,
        });
      } catch (logErr) {
        console.warn("[nipBanks.resolveAccount] failed to persist resolution error:", logErr);
      }
    };
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
        await logResolutionError(String(resp.status), errText || "Name enquiry failed", "nibss");
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Name enquiry failed (NIBSS HTTP ${resp.status})` });
      }
      const data = await resp.json() as any;
      const accountName: string = data.AccountName ?? data.accountName ?? data.BeneficiaryName ?? "";
      if (!accountName) {
        await logResolutionError("EMPTY_ACCOUNT_NAME", "NIBSS returned no account name", "nibss");
        throw new TRPCError({ code: "NOT_FOUND", message: "No account name found for this account number and bank" });
      }
      try {
        await db.insert(nipAccountCache).values({
          id: randomUUID(),
          tenantId: merchant.tenantId,
          accountNumber: input.accountNumber,
          bankCode: input.bankCode,
          accountName,
          expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        }).onConflictDoNothing();
      } catch (cacheErr) {
        console.warn("[nipBanks.resolveAccount] failed to cache resolution:", cacheErr);
      }
      return { accountName, fromCache: false };
    } catch (err) {
      if (err instanceof TRPCError) throw err;
      const message = err instanceof Error ? err.message : String(err);
      await logResolutionError("NETWORK_ERROR", message, "timeout");
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Account resolution temporarily unavailable" });
    }
  }),
});

// ─── merchant notifications ────────────────────────────────────────────────────
export const merchantNotificationsRouter = router({
  list: protectedProcedure.input(paginationInput.extend({ unreadOnly: z.boolean().optional() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const conditions = [eq((merchantNotifications as any).merchantId, merchantId)];
    if (input.unreadOnly) conditions.push(eq((merchantNotifications as any).isRead, false));
    return db.select().from(merchantNotifications).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])).orderBy(desc((merchantNotifications as any).createdAt)).limit(input.limit).offset(offset);
  }),
  markRead: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await db.update(merchantNotifications).set({ isRead: true } as any).where(and(eq((merchantNotifications as any).id, input.id), eq((merchantNotifications as any).merchantId, merchantId)));
    return { success: true };
  }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Scoped: previously marked EVERY merchant's notifications read.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await db.update(merchantNotifications).set({ isRead: true } as any).where(eq((merchantNotifications as any).merchantId, merchantId));
    return { success: true };
  }),
});

// ─── loyalty ledger ────────────────────────────────────────────────────────────
// loyalty_ledger has no merchant column; ownership flows through
// loyalty_accounts (ledger.account_id ↔ loyalty_accounts.account_id).
export const loyaltyRouter = router({
  balance: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const rows = await db.select({ entry: loyaltyLedger }).from(loyaltyLedger)
      .innerJoin(loyaltyAccounts, eq(loyaltyAccounts.accountId, (loyaltyLedger as any).accountId))
      .where(eq(loyaltyAccounts.merchantId, merchantId))
      .orderBy(desc((loyaltyLedger as any).createdAt));
    const entries = rows.map(r => r.entry);
    const balance = entries.length ? Number((entries[0] as any).balanceAfter ?? 0) : 0;
    return { balance, transactions: entries };
  }),
  history: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const rows = await db.select({ entry: loyaltyLedger }).from(loyaltyLedger)
      .innerJoin(loyaltyAccounts, eq(loyaltyAccounts.accountId, (loyaltyLedger as any).accountId))
      .where(eq(loyaltyAccounts.merchantId, merchantId))
      .orderBy(desc((loyaltyLedger as any).createdAt))
      .limit(input.limit).offset(offset);
    return rows.map(r => r.entry);
  }),
});

// ─── BNPL plans ────────────────────────────────────────────────────────────────
export const bnplRouter = router({
  listPlans: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(bnplPlans).where(eq((bnplPlans as any).merchantId, merchantId)).orderBy(desc((bnplPlans as any).createdAt)).limit(input.limit).offset(offset);
  }),
  getPlan: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(bnplPlans).where(and(eq((bnplPlans as any).id, input.id), eq((bnplPlans as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  createPlan: protectedProcedure.input(z.object({
    totalAmountKobo: z.number().int().positive(),
    installments: z.number().int().min(2).max(24),
    interestRateBps: z.number().int().min(0),
    productDescription: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session; columns match drizzle bnpl_plans
    // (a merchant-owned plan catalog: name/installments/interest_rate/min/max).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(bnplPlans).values({
      id: randomUUID(),
      merchantId,
      name: input.productDescription,
      installments: input.installments,
      interestRate: input.interestRateBps,
      maxAmount: input.totalAmountKobo,
      active: true,
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
  getVerification: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(kybVerifications).where(eq((kybVerifications as any).merchantId, merchantId));
    return row ?? null;
  }),
  listSteps: protectedProcedure.input(z.object({ verificationId: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [verification] = await db.select().from(kybVerifications).where(and(eq((kybVerifications as any).verificationId, input.verificationId), eq((kybVerifications as any).merchantId, merchantId)));
    if (!verification) throw new TRPCError({ code: "NOT_FOUND", message: "Verification not found" });
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
    businessName: z.string(),
    rcNumber: z.string(),
    taxId: z.string().optional(),
    businessType: z.string(),
    incorporationDate: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [existing] = await db.select().from(kybVerifications).where(eq((kybVerifications as any).merchantId, merchantId));
    if (existing) {
      const [row] = await db.update(kybVerifications).set({ ...input, merchantId, status: "pending", updatedAt: new Date() } as any).where(eq((kybVerifications as any).merchantId, merchantId)).returning();
      return row;
    }
    const [row] = await db.insert(kybVerifications).values({ verificationId: randomUUID(), ...input, merchantId, status: "pending", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── merchant loans ────────────────────────────────────────────────────────────
export const merchantLoansRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(merchantLoans).where(eq((merchantLoans as any).merchantId, merchantId)).orderBy(desc((merchantLoans as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // PK is loan_id (there is no `id` column); ownership-scoped.
    const [row] = await db.select().from(merchantLoans).where(and(eq((merchantLoans as any).loanId, input.id), eq((merchantLoans as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listInstallments: protectedProcedure.input(z.object({ loanId: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(loanInstalments).where(and(eq((loanInstalments as any).loanId, input.loanId), eq((loanInstalments as any).merchantId, merchantId))).orderBy((loanInstalments as any).dueDate);
  }),
  recordRepayment: protectedProcedure.input(z.object({
    loanId: z.string(),
    instalmentId: z.string(),
    amountKobo: z.number().int().positive(),
    paymentReference: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Money path: the loan/instalment must belong to the caller's merchant.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [instalment] = await db.select().from(loanInstalments)
      .where(and(eq((loanInstalments as any).id, input.instalmentId), eq((loanInstalments as any).loanId, input.loanId), eq((loanInstalments as any).merchantId, merchantId)));
    if (!instalment) throw new TRPCError({ code: "NOT_FOUND", message: "Loan instalment not found" });
    const [row] = await db.insert(loanRepayments).values({
      loanId: input.loanId,
      merchantId,
      amountKobo: input.amountKobo,
      transferId: input.paymentReference,
      createdAt: new Date(),
    } as any).returning();
    await db.update(loanInstalments).set({ status: "paid", paidAt: new Date() } as any).where(eq((loanInstalments as any).id, input.instalmentId));
    return row;
  }) as any,
  applyLoan: protectedProcedure.input(z.object({
    requestedAmountKobo: z.number().int().positive(),
    tenorMonths: z.number().int().min(1).max(24),
    purpose: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(merchantLoans).values({
      loanId: randomUUID(),
      merchantId,
      requestedKobo: input.requestedAmountKobo,
      termDays: input.tenorMonths * 30,
      purposeCode: input.purpose,
      status: "pending_review",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
});

// ─── split rules ───────────────────────────────────────────────────────────────
export const splitRulesRouter = router({
  // split_rules has no merchant_id column; ownership is tracked via created_by.
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    return db.select().from(splitRules).where(eq((splitRules as any).createdBy, String(ctx.user.id)));
  }),
  create: protectedProcedure.input(z.object({
    name: z.string().min(1).max(500),
    rules: z.array(z.object({
      subaccountCode: z.string(),
      sharePercent: z.number().min(0).max(100),
      bearsFee: z.boolean().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const totalShare = input.rules.reduce((s, r) => s + r.sharePercent, 0);
    if (Math.abs(totalShare - 100) > 0.01) throw new TRPCError({ code: "BAD_REQUEST", message: "Split rules must sum to 100%" });
    // Ownership from the session — the client can no longer hijack another
    // merchant's settlement splits. Columns match drizzle split_rules.
    const [row] = await db.insert(splitRules).values({
      ruleId: randomUUID(),
      ruleName: input.name,
      recipients: input.rules,
      createdBy: String(ctx.user.id),
      isActive: 1,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    await requireAdmin(ctx);
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // PK is rule_id (there is no `id` column).
    await db.delete(splitRules).where(eq((splitRules as any).ruleId, input.id));
    return { success: true };
  }),
});

// ─── DCC transactions ──────────────────────────────────────────────────────────
export const dccRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(dccTransactions).where(eq((dccTransactions as any).merchantId, merchantId)).orderBy(desc((dccTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // PK is conversion_id (there is no `id` column); ownership-scoped.
    const [row] = await db.select().from(dccTransactions).where(and(eq((dccTransactions as any).conversionId, input.id), eq((dccTransactions as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── webhook endpoints ─────────────────────────────────────────────────────────
export const webhookEndpointsRouter = router({
  // PK is endpoint_id (there is no `id` column); every query is scoped to the
  // session-resolved merchant so webhook URLs/secrets can't be hijacked.
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(webhookEndpoints).where(eq((webhookEndpoints as any).merchantId, merchantId));
  }),
  create: protectedProcedure.input(z.object({
    url: z.string().url(),
    events: z.array(z.string()),
    secret: z.string().min(16),
    description: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(webhookEndpoints).values({ endpointId: randomUUID(), merchantId, url: input.url, events: input.events, secret: input.secret, isActive: 1, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  update: protectedProcedure.input(z.object({
    id: z.string(),
    url: z.string().url().optional(),
    events: z.array(z.string()).optional(),
    isActive: z.boolean().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const { id, ...updates } = input;
    const set: Record<string, unknown> = { updatedAt: new Date() };
    if (updates.url !== undefined) set.url = updates.url;
    if (updates.events !== undefined) set.events = updates.events;
    if (updates.isActive !== undefined) set.isActive = updates.isActive ? 1 : 0;
    const [row] = await db.update(webhookEndpoints).set(set as any).where(and(eq((webhookEndpoints as any).endpointId, id), eq((webhookEndpoints as any).merchantId, merchantId))).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook endpoint not found" });
    return row;
  }),
  delete: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await db.delete(webhookEndpoints).where(and(eq((webhookEndpoints as any).endpointId, input.id), eq((webhookEndpoints as any).merchantId, merchantId)));
    return { success: true };
  }),
  deliveryLog: protectedProcedure.input(z.object({ webhookId: z.string() }).merge(paginationInput)).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    // webhook_delivery_log column is endpoint_id (no webhook_id column).
    return db.select().from(webhookDeliveryLog).where(and(eq((webhookDeliveryLog as any).endpointId, input.webhookId), eq((webhookDeliveryLog as any).merchantId, merchantId))).orderBy(desc((webhookDeliveryLog as any).createdAt)).limit(input.limit).offset(offset);
  }),
});

// ─── digital gold ──────────────────────────────────────────────────────────────
// Gold holdings/SIP plans are owned by a merchant (schema has merchant_id;
// there is NO customer_id column — the old queries referenced a nonexistent
// column and any caller could read/act on arbitrary customers).
export const digitalGoldRouter = router({
  getHolding: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(digitalGoldHoldings).where(eq((digitalGoldHoldings as any).merchantId, merchantId));
    return row ?? null;
  }),
  listTransactions: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(digitalGoldTransactions).where(eq((digitalGoldTransactions as any).merchantId, merchantId)).orderBy(desc((digitalGoldTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  listSipPlans: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(goldSipPlans).where(eq((goldSipPlans as any).merchantId, merchantId));
  }),
  createSipPlan: protectedProcedure.input(z.object({
    monthlyAmountKobo: z.number().int().positive(),
    targetGrams: z.number().positive().optional(),
    dayOfMonth: z.number().int().min(1).max(28),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Columns match drizzle gold_sip_plans (amount_kobo, frequency).
    const [row] = await db.insert(goldSipPlans).values({ merchantId, amountKobo: input.monthlyAmountKobo, frequency: "monthly", status: "active", createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
});

// ─── pension ───────────────────────────────────────────────────────────────────
// Pension accounts/contributions are merchant-owned (schema merchant_id; no
// customer_id column exists).
export const pensionRouter = router({
  getAccount: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(pensionAccounts).where(eq((pensionAccounts as any).merchantId, merchantId));
    return row ?? null;
  }),
  listContributions: protectedProcedure.input(paginationInput.extend({ accountId: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    // Column is pension_account_id (no account_id); merchant-scoped.
    return db.select().from(pensionContributions).where(and(eq((pensionContributions as any).pensionAccountId, input.accountId), eq((pensionContributions as any).merchantId, merchantId))).orderBy(desc((pensionContributions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  contribute: protectedProcedure.input(z.object({
    accountId: z.string(),
    amountKobo: z.number().int().positive(),
    contributionType: z.enum(["voluntary", "mandatory", "employer"]),
    paymentReference: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // Money path: the pension account must belong to the caller's merchant.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [account] = await db.select().from(pensionAccounts).where(and(eq((pensionAccounts as any).id, input.accountId), eq((pensionAccounts as any).merchantId, merchantId)));
    if (!account) throw new TRPCError({ code: "NOT_FOUND", message: "Pension account not found" });
    const [row] = await db.insert(pensionContributions).values({
      pensionAccountId: input.accountId,
      merchantId,
      amountKobo: input.amountKobo,
      type: input.contributionType,
      reference: input.paymentReference,
      status: "pending",
      createdAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
});

// ─── insurance ─────────────────────────────────────────────────────────────────
export const insuranceRouter = router({
  listPolicies: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(consumerInsurancePolicies).where(eq((consumerInsurancePolicies as any).merchantId, merchantId)).orderBy(desc((consumerInsurancePolicies as any).createdAt)).limit(input.limit).offset(offset);
  }),
  getPolicy: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(consumerInsurancePolicies).where(and(eq((consumerInsurancePolicies as any).id, input.id), eq((consumerInsurancePolicies as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listClaims: protectedProcedure.input(paginationInput.extend({ policyId: z.string().optional() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const conditions = [eq((consumerInsuranceClaims as any).merchantId, merchantId)];
    if (input.policyId) conditions.push(eq((consumerInsuranceClaims as any).policyId, input.policyId));
    return db.select().from(consumerInsuranceClaims).where(conditions.length === 1 ? conditions[0] : and(...conditions as [any, ...any[]])).orderBy(desc((consumerInsuranceClaims as any).createdAt)).limit(input.limit).offset(offset);
  }),
  fileClaim: protectedProcedure.input(z.object({
    policyId: z.string(),
    claimType: z.string(),
    description: z.string().max(5000),
    claimAmountKobo: z.number().int().positive(),
    incidentDate: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // The policy must belong to the caller's merchant before a claim is filed.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [policy] = await db.select().from(consumerInsurancePolicies).where(and(eq((consumerInsurancePolicies as any).id, input.policyId), eq((consumerInsurancePolicies as any).merchantId, merchantId)));
    if (!policy) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
    // Columns match drizzle consumer_insurance_claims (no claim_type /
    // incident_date columns — they are folded into description).
    const [row] = await db.insert(consumerInsuranceClaims).values({
      policyId: input.policyId,
      merchantId,
      description: `[${input.claimType}] ${input.description} (incident: ${input.incidentDate})`,
      claimAmountKobo: input.claimAmountKobo,
      status: "submitted",
      createdAt: new Date(),
    } as any).returning();
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
// Cashback balances/transactions are merchant-owned (schema merchant_id,
// cashback_balance_kobo; no customer_id / balance_kobo columns exist).
export const cashbackRouter = router({
  getBalance: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(cashbackBalances).where(eq((cashbackBalances as any).merchantId, merchantId));
    return row ?? null;
  }),
  listTransactions: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(cashbackTransactions).where(eq((cashbackTransactions as any).merchantId, merchantId)).orderBy(desc((cashbackTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  redeem: protectedProcedure.input(z.object({
    amountKobo: z.number().int().positive(),
    redemptionType: z.enum(["wallet_credit", "bank_transfer", "merchant_discount"]),
    idempotencyKey: z.string().min(8).max(128),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Idempotent replay: a retried redemption returns the original record
    // instead of debiting twice.
    const [existing] = await db.select().from(cashbackTransactions).where(and(
      eq((cashbackTransactions as any).merchantId, merchantId),
      eq((cashbackTransactions as any).relatedTransactionId, input.idempotencyKey),
      eq((cashbackTransactions as any).type, "redemption"),
    ));
    if (existing) return existing;
    // Atomic guarded debit: the balance check and the decrement are a single
    // UPDATE, so concurrent redemptions cannot overdraw (no check-then-act).
    const [debited] = await db.update(cashbackBalances).set({
      cashbackBalanceKobo: sql`${(cashbackBalances as any).cashbackBalanceKobo} - ${input.amountKobo}`,
      totalRedeemedKobo: sql`${(cashbackBalances as any).totalRedeemedKobo} + ${input.amountKobo}`,
      updatedAt: new Date(),
    } as any).where(and(
      eq((cashbackBalances as any).merchantId, merchantId),
      gte((cashbackBalances as any).cashbackBalanceKobo, input.amountKobo),
    )).returning();
    if (!debited) {
      throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient cashback balance" });
    }
    const [tx] = await db.insert(cashbackTransactions).values({
      merchantId,
      type: "redemption",
      amountKobo: input.amountKobo,
      description: `Cashback redemption via ${input.redemptionType}`,
      relatedTransactionId: input.idempotencyKey,
      status: "completed",
      createdAt: new Date(),
    } as any).returning();
    return tx;
  }) as any,
});

// ─── wealth management ─────────────────────────────────────────────────────────
// Wealth profiles/goals/fund holdings are merchant-owned (schema merchant_id;
// no customer_id columns exist — the old queries hit nonexistent columns).
export const wealthRouter = router({
  getRiskProfile: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(wealthRiskProfiles).where(eq((wealthRiskProfiles as any).merchantId, merchantId));
    return row ?? null;
  }),
  setRiskProfile: protectedProcedure.input(z.object({
    riskTolerance: z.enum(["conservative", "moderate", "aggressive"]),
    investmentHorizonYears: z.number().int().min(1).max(40),
    monthlyInvestmentKobo: z.number().int().min(0),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Map to real columns: risk_category / investment_horizon
    // (wealth_risk_profiles has no updated_at column).
    const mapped = {
      riskCategory: input.riskTolerance,
      investmentHorizon: `${input.investmentHorizonYears} years`,
      lastAssessed: new Date(),
    };
    const [existing] = await db.select().from(wealthRiskProfiles).where(eq((wealthRiskProfiles as any).merchantId, merchantId));
    if (existing) {
      const [row] = await db.update(wealthRiskProfiles).set(mapped as any).where(eq((wealthRiskProfiles as any).merchantId, merchantId)).returning();
      return row;
    }
    const [row] = await db.insert(wealthRiskProfiles).values({ merchantId, ...mapped, createdAt: new Date() } as any).returning();
    return row;
  }) as any,
  listGoals: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(wealthGoals).where(eq((wealthGoals as any).merchantId, merchantId)).orderBy((wealthGoals as any).deadline);
  }),
  createGoal: protectedProcedure.input(z.object({
    goalName: z.string(),
    targetAmountKobo: z.number().int().positive(),
    targetDate: z.string(),
    goalType: z.enum(["retirement", "education", "home", "emergency", "vacation", "other"]),
    monthlyContributionKobo: z.number().int().min(0),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Columns match drizzle wealth_goals (name/category/deadline).
    const [row] = await db.insert(wealthGoals).values({
      merchantId,
      name: input.goalName,
      category: input.goalType,
      targetAmountKobo: input.targetAmountKobo,
      deadline: new Date(input.targetDate),
      currentAmountKobo: 0,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  listMutualFunds: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(mutualFundHoldings).where(eq((mutualFundHoldings as any).merchantId, merchantId));
  }),
});

// ─── EMI contracts ─────────────────────────────────────────────────────────────
export const emiRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(emiContracts).where(eq((emiContracts as any).merchantId, merchantId)).orderBy(desc((emiContracts as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(emiContracts).where(and(eq((emiContracts as any).id, input.id), eq((emiContracts as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  listInstallments: protectedProcedure.input(z.object({ contractId: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Ownership via the parent contract; column is emi_contract_id.
    const [contract] = await db.select().from(emiContracts).where(and(eq((emiContracts as any).id, input.contractId), eq((emiContracts as any).merchantId, merchantId)));
    if (!contract) throw new TRPCError({ code: "NOT_FOUND", message: "EMI contract not found" });
    return db.select().from(emiInstallments).where(eq((emiInstallments as any).emiContractId, input.contractId)).orderBy((emiInstallments as any).dueDate);
  }),
  create: protectedProcedure.input(z.object({
    customerId: z.string().optional(),
    orderId: z.string(),
    planId: z.string().optional(),
    principalKobo: z.number().int().positive(),
    tenorMonths: z.number().int().min(1).max(60),
    interestRateBps: z.number().int().min(0),
    productDescription: z.string(),
    firstDueDate: z.string(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const monthlyRate = input.interestRateBps / 10000;
    const emi = monthlyRate > 0
      ? Math.ceil(input.principalKobo * monthlyRate * Math.pow(1 + monthlyRate, input.tenorMonths) / (Math.pow(1 + monthlyRate, input.tenorMonths) - 1))
      : Math.ceil(input.principalKobo / input.tenorMonths);
    // Columns match drizzle emi_contracts (tenure, total_amount_kobo,
    // monthly_installment_kobo are NOT NULL).
    const [row] = await db.insert(emiContracts).values({
      merchantId,
      customerId: input.customerId ?? null,
      orderId: input.orderId,
      planId: input.planId ?? `emi-${input.tenorMonths}m-${input.interestRateBps}bps`,
      tenure: input.tenorMonths,
      principalKobo: input.principalKobo,
      interestRate: (input.interestRateBps / 100).toString(),
      totalAmountKobo: emi * input.tenorMonths,
      monthlyInstallmentKobo: emi,
      status: "active",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
});

// ─── salary transactions ───────────────────────────────────────────────────────
export const salaryRouter = router({
  list: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(salaryTransactions).where(eq((salaryTransactions as any).merchantId, merchantId)).orderBy(desc((salaryTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(salaryTransactions).where(and(eq((salaryTransactions as any).id, input.id), eq((salaryTransactions as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure.input(z.object({
    salaryAccountId: z.string(),
    employeeId: z.string(),
    employeeName: z.string(),
    accountNumber: z.string(),
    bankCode: z.string(),
    amountKobo: z.number().int().positive(),
    payPeriod: z.string(),
    narration: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    // Columns match drizzle salary_transactions (salary_account_id, type,
    // amount_kobo, description, reference are the real columns).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(salaryTransactions).values({
      salaryAccountId: input.salaryAccountId,
      merchantId,
      type: "salary",
      amountKobo: input.amountKobo,
      description: input.narration ?? `Salary ${input.payPeriod} — ${input.employeeName} (${input.employeeId}, ${input.bankCode}/${input.accountNumber})`,
      reference: randomUUID(),
      status: "pending",
      createdAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  bulkCreate: protectedProcedure.input(z.object({
    salaryAccountId: z.string(),
    payPeriod: z.string(),
    employees: z.array(z.object({
      employeeId: z.string(),
      employeeName: z.string(),
      accountNumber: z.string(),
      bankCode: z.string(),
      amountKobo: z.number().int().positive(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const rows = await db.insert(salaryTransactions).values(
      input.employees.map(e => ({
        salaryAccountId: input.salaryAccountId,
        merchantId,
        type: "salary",
        amountKobo: e.amountKobo,
        description: `Salary ${input.payPeriod} — ${e.employeeName} (${e.employeeId}, ${e.bankCode}/${e.accountNumber})`,
        reference: randomUUID(),
        status: "pending",
        createdAt: new Date(),
      } as any)) as any).returning();
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
  listTransactions: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(nodalTransactions).where(eq((nodalTransactions as any).merchantId, merchantId)).orderBy(desc((nodalTransactions as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(nodalTransactions).where(and(eq((nodalTransactions as any).id, input.id), eq((nodalTransactions as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
});

// ─── retail POS ────────────────────────────────────────────────────────────────
export const retailPosRouter = router({
  listConfigs: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(retailPosConfigs).where(eq((retailPosConfigs as any).merchantId, merchantId));
  }),
  createConfig: protectedProcedure.input(z.object({
    terminalId: z.string(),
    terminalName: z.string(),
    location: z.string().optional(),
    acceptedPaymentMethods: z.array(z.string()),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session; columns match drizzle
    // retail_pos_configs (store_name/store_address — one config per merchant).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(retailPosConfigs).values({
      merchantId,
      storeName: input.terminalName,
      storeAddress: input.location ?? null,
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  listSales: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(retailSales).where(eq((retailSales as any).merchantId, merchantId)).orderBy(desc((retailSales as any).createdAt)).limit(input.limit).offset(offset);
  }),
});

// ─── international remittance ──────────────────────────────────────────────────
export const intlRemittanceRouter = router({
  list: protectedProcedure.input(paginationInput.merge(dateRangeInput)).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(intlRemittanceTransfers).where(eq((intlRemittanceTransfers as any).merchantId, merchantId)).orderBy(desc((intlRemittanceTransfers as any).createdAt)).limit(input.limit).offset(offset);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(intlRemittanceTransfers).where(and(eq((intlRemittanceTransfers as any).id, input.id), eq((intlRemittanceTransfers as any).merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row;
  }),
  create: protectedProcedure.input(z.object({
    corridorId: z.string(),
    receiverName: z.string(),
    receiverCountry: z.string(),
    receiverAccountNumber: z.string(),
    receiverBankCode: z.string(),
    sendAmountUSD: z.string(),
    receiveAmount: z.string(),
    receiveCurrency: z.string().length(3),
    exchangeRate: z.string(),
    feeUSD: z.string(),
    purposeCode: z.string(),
    narration: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session — never trust client input.
    // Columns match drizzle intl_remittance_transfers (corridor_id,
    // send_amount_usd, fee_usd etc. are NOT NULL).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(intlRemittanceTransfers).values({
      merchantId,
      corridorId: input.corridorId,
      sendAmountUSD: input.sendAmountUSD,
      receiveAmount: input.receiveAmount,
      receiveCurrency: input.receiveCurrency,
      exchangeRate: input.exchangeRate,
      feeUSD: input.feeUSD,
      recipientName: input.receiverName,
      recipientAccountNumber: input.receiverAccountNumber,
      recipientBankCode: input.receiverBankCode,
      recipientCountry: input.receiverCountry,
      purpose: input.purposeCode + (input.narration ? ` — ${input.narration}` : ""),
      trackingNumber: randomUUID(),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
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
  listItems: protectedProcedure.input(paginationInput.extend({ collectionId: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    // Items hang off bulk_collections (collection_id); verify ownership via the
    // parent collection before returning anything.
    const [collection] = await db.select().from(bulkCollections).where(and(eq((bulkCollections as any).id, input.collectionId), eq((bulkCollections as any).merchantId, merchantId)));
    if (!collection) throw new TRPCError({ code: "NOT_FOUND", message: "Collection not found" });
    const offset = (input.page - 1) * input.limit;
    return db.select().from(bulkCollectionItems).where(eq((bulkCollectionItems as any).collectionId, input.collectionId)).orderBy(desc((bulkCollectionItems as any).createdAt)).limit(input.limit).offset(offset);
  }),
  listSchedules: protectedProcedure.input(paginationInput).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    return db.select().from(bulkPaymentSchedules).where(eq((bulkPaymentSchedules as any).merchantId, merchantId)).orderBy(desc((bulkPaymentSchedules as any).createdAt)).limit(input.limit).offset(offset);
  }),
  createSchedule: protectedProcedure.input(z.object({
    scheduleName: z.string(),
    scheduledAt: z.string(),
    items: z.array(z.object({
      recipientAccountNumber: z.string(),
      recipientBankCode: z.string(),
      recipientName: z.string(),
      amountKobo: z.number().int().positive(),
      narration: z.string().optional(),
    })),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session; columns match drizzle
    // bulk_payment_schedules (recipients/total_amount_kobo/scheduled_at NOT NULL).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [schedule] = await db.insert(bulkPaymentSchedules).values({
      scheduleId: randomUUID(),
      merchantId,
      scheduleName: input.scheduleName,
      recipients: input.items,
      totalAmountKobo: input.items.reduce((s, i) => s + i.amountKobo, 0),
      scheduledAt: new Date(input.scheduledAt),
      status: "pending",
      createdAt: new Date(),
      updatedAt: new Date(),
    } as any).returning();
    return { schedule, itemCount: input.items.length };
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
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    await requireAdmin(ctx);
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
  list: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(soundboxDevices).where(eq((soundboxDevices as any).merchantId, merchantId));
  }),
  register: protectedProcedure.input(z.object({
    deviceId: z.string(),
    deviceName: z.string(),
    serialNumber: z.string(),
    firmwareVersion: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session; columns match drizzle
    // soundbox_devices (device_id unique, name, status).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(soundboxDevices).values({
      merchantId,
      deviceId: input.deviceId,
      name: input.deviceName,
      status: "online",
      createdAt: new Date(),
    } as any).returning();
    return row;
  }) as any,
  updateStatus: protectedProcedure.input(z.object({
    id: z.string(),
    isActive: z.boolean(),
    lastSeenAt: z.string().optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.update(soundboxDevices).set({
      status: input.isActive ? "online" : "offline",
      ...(input.lastSeenAt ? { lastSeen: new Date(input.lastSeenAt) } : {}),
    } as any).where(and(eq((soundboxDevices as any).id, input.id), eq((soundboxDevices as any).merchantId, merchantId))).returning();
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Soundbox device not found" });
    return row;
  }),
  deregister: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await db.delete(soundboxDevices).where(and(eq((soundboxDevices as any).id, input.id), eq((soundboxDevices as any).merchantId, merchantId)));
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
  // invoice_payments has no merchant_id; scope through the owning invoice
  // (invoices.merchant_id). NOTE: invoice_payments has no created_at column —
  // order by paid_at.
  list: protectedProcedure.input(paginationInput.extend({ invoiceId: z.string().optional() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const conditions = [eq(invoices.merchantId, merchantId)];
    if (input.invoiceId) conditions.push(eq(invoicePayments.invoiceId, input.invoiceId));
    const rows = await db.select({ payment: invoicePayments }).from(invoicePayments)
      .innerJoin(invoices, eq(invoices.invoiceId, invoicePayments.invoiceId))
      .where(and(...(conditions.filter(Boolean) as SQL[])))
      .orderBy(desc(invoicePayments.paidAt)).limit(input.limit).offset(offset);
    return rows.map((r) => r.payment);
  }),
  get: protectedProcedure.input(z.object({ id: z.string() })).query(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select({ payment: invoicePayments }).from(invoicePayments)
      .innerJoin(invoices, eq(invoices.invoiceId, invoicePayments.invoiceId))
      .where(and(eq(invoicePayments.id, input.id), eq(invoices.merchantId, merchantId)));
    if (!row) throw new TRPCError({ code: "NOT_FOUND" });
    return row.payment;
  }),
});

// ─── merchant profiles & directors ────────────────────────────────────────────
export const merchantProfilesRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.select().from(merchantProfiles).where(eq((merchantProfiles as any).merchantId, merchantId));
    return row ?? null;
  }),
  upsert: protectedProcedure.input(z.object({
    businessName: z.string().min(1),
    businessAddress: z.string().optional(),
    businessPhone: z.string().optional(),
    businessEmail: z.string().email().optional(),
    website: z.string().url().optional(),
    businessDescription: z.string().optional(),
    logoUrl: z.string().url().optional(),
    supportEmail: z.string().email().optional(),
    supportPhone: z.string().optional(),
    socialLinks: z.record(z.string(), z.string()).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    // merchantId resolved from the session; columns match drizzle
    // merchant_profiles (business_name/address — PK is merchant_id).
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const mapped = {
      businessName: input.businessName,
      address: input.businessAddress ?? null,
      updatedAt: new Date(),
    };
    const [existing] = await db.select().from(merchantProfiles).where(eq((merchantProfiles as any).merchantId, merchantId));
    if (existing) {
      const [row] = await db.update(merchantProfiles).set(mapped as any).where(eq((merchantProfiles as any).merchantId, merchantId)).returning();
      return row;
    }
    const [row] = await db.insert(merchantProfiles).values({ merchantId, ...mapped, createdAt: new Date() } as any).returning();
    return row;
  }) as any,
  listDirectors: protectedProcedure.query(async ({ ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return db.select().from(merchantDirectors).where(eq((merchantDirectors as any).merchantId, merchantId));
  }),
  addDirector: protectedProcedure.input(z.object({
    fullName: z.string(),
    bvn: z.string().optional(),
    nin: z.string().optional(),
    dateOfBirth: z.string().optional(),
    nationality: z.string().optional(),
    sharePercent: z.number().min(0).max(100).optional(),
    isPep: z.boolean().default(false),
  })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const [row] = await db.insert(merchantDirectors).values({ ...input, merchantId, createdAt: new Date(), updatedAt: new Date() } as any).returning();
    return row;
  }) as any,
  removeDirector: protectedProcedure.input(z.object({ id: z.string() })).mutation(async ({ input, ctx }) => {
    const db = (await getDb())!;
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
    const merchantId = await resolveMerchantId(ctx.user.openId);
    await db.delete(merchantDirectors).where(and(eq((merchantDirectors as any).id, input.id), eq((merchantDirectors as any).merchantId, merchantId)));
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
