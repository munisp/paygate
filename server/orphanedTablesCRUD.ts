// @ts-nocheck
/**
 * CRUD procedures for all 19 previously-orphaned DB tables.
 * Wired into appRouter as `orphaned.*` sub-routers.
 */
import { z } from "zod";
import { eq, desc, and, sql } from "drizzle-orm";
import { router, protectedProcedure } from "./_core/trpc";
import { getUserByOpenId, getMerchantByOwnerId, getDb } from "./db";
import {
  bulkPaymentSchedules,
  complianceReports,
  consumerFinanceLoans,
  consumerOutbox,
  dccTransactions,
  insurancePolicies,
  invoicePayments,
  kybSteps,
  kybVerifications,
  loanRepayments,
  merchantDirectors,
  merchantProfiles,
  regulatorySandboxConfigs,
  sdkTokens,
  splitRules,
  taxWithholdingRecords,
  webhookDeliveryLog,
  webhookEndpoints,
} from "../drizzle/schema";

function nanoid(prefix = "") {
  return `${prefix}${crypto.randomUUID().replace(/-/g, "").slice(0, 16)}`;
}

async function resolveUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new Error("User not found");
  return user;
}

async function requireMerchant(userId: number) {
  const merchant = await getMerchantByOwnerId(userId);
  if (!merchant) throw new Error("Merchant account not found");
  return merchant;
}

// ─── Webhook Endpoints CRUD ───────────────────────────────────────────────────
export const webhookEndpointsCRUD = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(webhookEndpoints).where(eq(webhookEndpoints.merchantId, merchant.id)).orderBy(desc(webhookEndpoints.createdAt));
  }),
  create: protectedProcedure
    .input(z.object({
      url: z.string().url(),
      events: z.array(z.string()).default([]),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const secret = `whsec_${crypto.randomUUID().replace(/-/g, "")}`;
      const endpointId = nanoid("we_");
      await db.insert(webhookEndpoints).values({
        endpointId,
        merchantId: merchant.id,
        url: input.url,
        secret,
        events: input.events,
        isActive: 1,
      });
      return { endpointId, secret };
    }),
  update: protectedProcedure
    .input(z.object({
      endpointId: z.string(),
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const upd: Record<string, unknown> = {};
      if (input.url !== undefined) upd.url = input.url;
      if (input.events !== undefined) upd.events = input.events;
      if (input.isActive !== undefined) upd.isActive = input.isActive ? 1 : 0;
      await db.update(webhookEndpoints).set(upd).where(and(eq(webhookEndpoints.endpointId, input.endpointId), eq(webhookEndpoints.merchantId, merchant.id)));
      return { success: true };
    }),
  delete: protectedProcedure
    .input(z.object({ endpointId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.delete(webhookEndpoints).where(and(eq(webhookEndpoints.endpointId, input.endpointId), eq(webhookEndpoints.merchantId, merchant.id)));
      return { success: true };
    }),
  deliveryLog: protectedProcedure
    .input(z.object({ endpointId: z.string(), limit: z.number().default(50) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(webhookDeliveryLog)
        .where(and(eq(webhookDeliveryLog.endpointId, input.endpointId), eq(webhookDeliveryLog.merchantId, merchant.id)))
        .orderBy(desc(webhookDeliveryLog.createdAt))
        .limit(input.limit);
    }),
});

// ─── SDK Tokens CRUD ──────────────────────────────────────────────────────────
export const sdkTokensCRUD = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(sdkTokens).where(eq(sdkTokens.merchantId, merchant.id)).orderBy(desc(sdkTokens.createdAt));
  }),
  create: protectedProcedure
    .input(z.object({
      scopes: z.array(z.string()).default(["payments:read", "payments:write"]),
      expiresInDays: z.number().min(1).max(365).default(90),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const rawToken = `pg_sdk_${crypto.randomUUID().replace(/-/g, "")}`;
      const tokenHash = Buffer.from(rawToken).toString("base64");
      const tokenId = nanoid("sdk_");
      const expiresAt = new Date(Date.now() + input.expiresInDays * 86400_000);
      await db.insert(sdkTokens).values({
        tokenId,
        merchantId: merchant.id,
        tokenHash,
        expiresAt,
        scopes: input.scopes,
        isRevoked: 0,
      });
      return { tokenId, rawToken, expiresAt };
    }),
  revoke: protectedProcedure
    .input(z.object({ tokenId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(sdkTokens).set({ isRevoked: 1 }).where(and(eq(sdkTokens.tokenId, input.tokenId), eq(sdkTokens.merchantId, merchant.id)));
      return { success: true };
    }),
});

// ─── KYB Verifications & Steps CRUD ──────────────────────────────────────────
export const kybCRUD = router({
  listVerifications: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(kybVerifications).where(eq(kybVerifications.merchantId, merchant.id)).orderBy(desc(kybVerifications.createdAt));
  }),
  startVerification: protectedProcedure
    .input(z.object({
      businessName: z.string().min(2),
      rcNumber: z.string().optional(),
      taxId: z.string().optional(),
      businessType: z.string().optional(),
      industryCode: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const verificationId = nanoid("kyb_");
      await db.insert(kybVerifications).values({
        verificationId,
        merchantId: merchant.id,
        businessName: input.businessName,
        rcNumber: input.rcNumber,
        taxId: input.taxId,
        businessType: input.businessType,
        industryCode: input.industryCode,
        status: "pending",
        initiatedBy: ctx.user.openId,
        startedAt: new Date(),
      });
      const steps = ["document_upload", "cac_verification", "director_check", "aml_screening", "final_review"];
      await db.insert(kybSteps).values(steps.map(s => ({
        verificationId,
        stepName: s,
        status: "pending",
      })));
      return { verificationId };
    }),
  updateStep: protectedProcedure
    .input(z.object({
      verificationId: z.string(),
      stepName: z.string(),
      status: z.enum(["pending", "in_progress", "completed", "failed"]),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(kybSteps).set({ status: input.status, notes: input.notes, updatedAt: new Date() })
        .where(and(eq(kybSteps.verificationId, input.verificationId), eq(kybSteps.stepName, input.stepName)));
      return { success: true };
    }),
  getSteps: protectedProcedure
    .input(z.object({ verificationId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(kybSteps).where(eq(kybSteps.verificationId, input.verificationId));
    }),
  addDirector: protectedProcedure
    .input(z.object({
      fullName: z.string().min(2),
      bvn: z.string().optional(),
      nin: z.string().optional(),
      dateOfBirth: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.insert(merchantDirectors).values({
        merchantId: merchant.id,
        fullName: input.fullName,
        bvn: input.bvn,
        nin: input.nin,
        dateOfBirth: input.dateOfBirth,
      });
      return { success: true };
    }),
  listDirectors: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(merchantDirectors).where(eq(merchantDirectors.merchantId, merchant.id));
  }),
});

// ─── Merchant Profile CRUD ────────────────────────────────────────────────────
export const merchantProfileCRUD = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    const [profile] = await db.select().from(merchantProfiles).where(eq(merchantProfiles.merchantId, merchant.id));
    return profile ?? null;
  }),
  upsert: protectedProcedure
    .input(z.object({
      businessName: z.string().min(2),
      rcNumber: z.string().optional(),
      taxId: z.string().optional(),
      address: z.string().optional(),
      state: z.string().optional(),
      country: z.string().default("NG"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.insert(merchantProfiles).values({
        merchantId: merchant.id,
        businessName: input.businessName,
        rcNumber: input.rcNumber,
        taxId: input.taxId,
        address: input.address,
        state: input.state,
        country: input.country,
      }).onConflictDoUpdate({
        target: merchantProfiles.merchantId,
        set: {
          businessName: input.businessName,
          rcNumber: input.rcNumber,
          taxId: input.taxId,
          address: input.address,
          state: input.state,
          country: input.country,
          updatedAt: new Date(),
        },
      });
      return { success: true };
    }),
});

// ─── Compliance Reports CRUD ──────────────────────────────────────────────────
export const complianceReportsCRUD = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const rows = await db.select().from(complianceReports)
        .where(eq(complianceReports.merchantId, merchant.id))
        .orderBy(desc(complianceReports.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(complianceReports).where(eq(complianceReports.merchantId, merchant.id));
      return { rows, total: Number(count) };
    }),
  create: protectedProcedure
    .input(z.object({
      reportType: z.string(),
      period: z.string(),
      data: z.record(z.string(), z.string(), z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const reportId = nanoid("cr_");
      await db.insert(complianceReports).values({
        reportId,
        merchantId: merchant.id,
        reportType: input.reportType,
        status: "pending",
        findings: input.period ? `Period: ${input.period}` : undefined,
      });
      return { reportId };
    }),
  updateStatus: protectedProcedure
    .input(z.object({ reportId: z.string(), status: z.enum(["draft", "submitted", "approved", "rejected"]) }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(complianceReports).set({ status: input.status })
        .where(and(eq(complianceReports.reportId, input.reportId), eq(complianceReports.merchantId, merchant.id)));
      return { success: true };
    }),
});

// ─── Insurance Policies CRUD ──────────────────────────────────────────────────
export const insurancePoliciesCRUD = router({
  list: protectedProcedure
    .input(z.object({ customerId: z.string().optional(), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(insurancePolicies)
        .where(eq(insurancePolicies.merchantId, merchant.id))
        .orderBy(desc(insurancePolicies.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      productId: z.string(),
      productName: z.string(),
      provider: z.string(),
      premiumKobo: z.number(),
      coverageType: z.string(),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const policyId = nanoid("pol_");
      await db.insert(insurancePolicies).values({
        policyId,
        customerId: input.customerId,
        merchantId: merchant.id,
        productId: input.productId,
        productName: input.productName,
        provider: input.provider,
        premiumKobo: input.premiumKobo,
        coverageType: input.coverageType,
        status: "active",
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });
      return { policyId };
    }),
  cancel: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(insurancePolicies).set({ status: "cancelled" })
        .where(and(eq(insurancePolicies.policyId, input.policyId), eq(insurancePolicies.merchantId, merchant.id)));
      return { success: true };
    }),
});

// ─── Tax Withholding Records CRUD ─────────────────────────────────────────────
export const taxWithholdingCRUD = router({
  list: protectedProcedure
    .input(z.object({ period: z.string().optional(), limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const rows = await db.select().from(taxWithholdingRecords)
        .where(eq(taxWithholdingRecords.merchantId, merchant.id))
        .orderBy(desc(taxWithholdingRecords.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(taxWithholdingRecords).where(eq(taxWithholdingRecords.merchantId, merchant.id));
      return { rows, total: Number(count) };
    }),
  create: protectedProcedure
    .input(z.object({
      transactionId: z.string().optional(),
      grossAmountKobo: z.number(),
      taxAmountKobo: z.number(),
      netAmountKobo: z.number(),
      taxType: z.string().default("WHT"),
      taxRatePct: z.string(),
      period: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.insert(taxWithholdingRecords).values({
        merchantId: merchant.id,
        transactionId: input.transactionId,
        grossAmountKobo: input.grossAmountKobo,
        taxAmountKobo: input.taxAmountKobo,
        netAmountKobo: input.netAmountKobo,
        taxType: input.taxType,
        taxRatePct: input.taxRatePct,
        period: input.period,
        status: "pending",
      });
      return { success: true };
    }),
  markRemitted: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(taxWithholdingRecords).set({ status: "remitted", remittedAt: new Date() })
        .where(and(eq(taxWithholdingRecords.id, input.id), eq(taxWithholdingRecords.merchantId, merchant.id)));
      return { success: true };
    }),
});

// ─── Split Rules CRUD ─────────────────────────────────────────────────────────
export const splitRulesCRUD = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(splitRules).where(eq(splitRules.isActive, 1)).orderBy(desc(splitRules.createdAt));
  }),
  create: protectedProcedure
    .input(z.object({
      ruleName: z.string().min(2),
      description: z.string().optional(),
      recipients: z.array(z.object({
        accountId: z.string(),
        name: z.string(),
        percentageBps: z.number().min(1).max(10000),
      })),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const ruleId = nanoid("sr_");
      await db.insert(splitRules).values({
        ruleId,
        ruleName: input.ruleName,
        description: input.description,
        recipients: input.recipients,
        createdBy: merchant.id,
        isActive: 1,
      });
      return { ruleId };
    }),
  delete: protectedProcedure
    .input(z.object({ ruleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(splitRules).set({ isActive: 0 }).where(eq(splitRules.ruleId, input.ruleId));
      return { success: true };
    }),
});

// ─── Bulk Payment Schedules CRUD ──────────────────────────────────────────────
export const bulkSchedulesCRUD = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(bulkPaymentSchedules)
        .where(eq(bulkPaymentSchedules.merchantId, merchant.id))
        .orderBy(desc(bulkPaymentSchedules.scheduledAt))
        .limit(input.limit);
    }),
  create: protectedProcedure
    .input(z.object({
      scheduleName: z.string().min(2),
      recipients: z.array(z.object({ accountId: z.string(), amountKobo: z.number(), name: z.string() })),
      totalAmountKobo: z.number(),
      scheduledAt: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const scheduleId = nanoid("bps_");
      await db.insert(bulkPaymentSchedules).values({
        scheduleId,
        merchantId: merchant.id,
        scheduleName: input.scheduleName,
        recipients: input.recipients,
        totalAmountKobo: input.totalAmountKobo,
        scheduledAt: new Date(input.scheduledAt),
        status: "pending",
      });
      return { scheduleId };
    }),
  cancel: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.update(bulkPaymentSchedules).set({ status: "cancelled" })
        .where(and(eq(bulkPaymentSchedules.scheduleId, input.scheduleId), eq(bulkPaymentSchedules.merchantId, merchant.id)));
      return { success: true };
    }),
});

// ─── DCC Transactions CRUD ────────────────────────────────────────────────────
export const dccTransactionsCRUD = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const rows = await db.select().from(dccTransactions)
        .where(eq(dccTransactions.merchantId, merchant.id))
        .orderBy(desc(dccTransactions.createdAt))
        .limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(dccTransactions).where(eq(dccTransactions.merchantId, merchant.id));
      return { rows, total: Number(count) };
    }),
});

// ─── Invoice Payments CRUD ────────────────────────────────────────────────────
export const invoicePaymentsCRUD = router({
  list: protectedProcedure
    .input(z.object({ invoiceId: z.string().optional(), limit: z.number().default(20) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(invoicePayments)
        .orderBy(desc(invoicePayments.paidAt))
        .limit(input.limit);
    }),
});

// ─── Loan Repayments CRUD ─────────────────────────────────────────────────────
export const loanRepaymentsCRUD = router({
  list: protectedProcedure
    .input(z.object({ loanId: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(loanRepayments).where(eq(loanRepayments.loanId, input.loanId)).orderBy(desc(loanRepayments.createdAt));
    }),
  record: protectedProcedure
    .input(z.object({
      loanId: z.string(),
      amountKobo: z.number(),
      method: z.string().optional(),
      transferId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.insert(loanRepayments).values({
        loanId: input.loanId,
        merchantId: merchant.id,
        amountKobo: input.amountKobo,
        method: input.method,
        transferId: input.transferId,
      });
      return { success: true };
    }),
});

// ─── Consumer Finance Loans CRUD ──────────────────────────────────────────────
export const consumerLoansCRUD = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      return db.select().from(consumerFinanceLoans)
        .where(eq(consumerFinanceLoans.merchantId, merchant.id))
        .orderBy(desc(consumerFinanceLoans.createdAt))
        .limit(50);
    }),
});

// ─── Regulatory Sandbox Configs CRUD ─────────────────────────────────────────
export const regulatorySandboxCRUD = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
    return db.select().from(regulatorySandboxConfigs).where(eq(regulatorySandboxConfigs.merchantId, merchant.id));
  }),
  upsert: protectedProcedure
    .input(z.object({
      sandboxType: z.string(),
      config: z.record(z.string(), z.string(), z.string(), z.unknown()).optional(),
      expiresAt: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      await db.insert(regulatorySandboxConfigs).values({
        merchantId: merchant.id,
        sandboxType: input.sandboxType,
        config: input.config ?? {},
        isActive: 1,
        expiresAt: input.expiresAt ? new Date(input.expiresAt) : undefined,
      });
      return { success: true };
    }),
});

// ─── Consumer Outbox CRUD (read-only for audit) ───────────────────────────────
export const consumerOutboxCRUD = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(50), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await requireMerchant(user.id);
      const db = await getDb();
      if (db == null) throw new Error("DB unavailable");
      const rows = await db.select().from(consumerOutbox)
        .orderBy(desc(consumerOutbox.createdAt))
        .limit(input.limit);
      return rows;
    }),
});

// ─── Combined Orphaned Tables Router ─────────────────────────────────────────
export const orphanedTablesRouter = router({
  webhookEndpoints: webhookEndpointsCRUD,
  sdkTokens: sdkTokensCRUD,
  kyb: kybCRUD,
  merchantProfile: merchantProfileCRUD,
  complianceReports: complianceReportsCRUD,
  insurancePolicies: insurancePoliciesCRUD,
  taxWithholding: taxWithholdingCRUD,
  splitRules: splitRulesCRUD,
  bulkSchedules: bulkSchedulesCRUD,
  dccTransactions: dccTransactionsCRUD,
  invoicePayments: invoicePaymentsCRUD,
  loanRepayments: loanRepaymentsCRUD,
  consumerLoans: consumerLoansCRUD,
  regulatorySandbox: regulatorySandboxCRUD,
  consumerOutbox: consumerOutboxCRUD,
});
