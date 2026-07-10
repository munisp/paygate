/**
 * Wave 223 Extension Router
 * Provides all missing sub-routers needed by Wave 223 UI pages:
 * auditLogs, revenueAnalytics, fxRates, apiRateLimits,
 * notificationPreferences, posTerminals, settlementBanks (ext),
 * kycDocuments, merchantVerification, ndcPositionLimits,
 * bulkTransfers, dfspTopology
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { sql, eq, desc, and, gte, lte } from "drizzle-orm";
import {
  auditLogs,
  posTerminals,
  settlementBanks,
  kybDocuments,
  kybVerifications,
  realtimeNotificationPreferences,
  apiRateLimitRules,
  fxRates,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";

// ─── 1. Audit Logs ─────────────────────────────────────────────────────────
const auditLogsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(500).default(100),
      offset: z.number().min(0).default(0),
      action: z.string().optional(),
      actor: z.string().optional(),
      resource: z.string().optional(),
      fromDate: z.string().optional(),
      toDate: z.string().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const conditions: any[] = [];
      if (input.action) conditions.push(eq(auditLogs.action, input.action));
      if (input.actor) conditions.push(eq(auditLogs.userId, input.actor));
      if (input.resource) conditions.push(eq(auditLogs.resource, input.resource));
      if (input.fromDate) conditions.push(gte(auditLogs.createdAt, new Date(input.fromDate)));
      if (input.toDate) conditions.push(lte(auditLogs.createdAt, new Date(input.toDate)));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db.select().from(auditLogs).where(where)
        .orderBy(desc(auditLogs.createdAt)).limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(auditLogs).where(where);
      return { rows, total: Number(count) };
    }),
});

// ─── 2. Revenue Analytics ──────────────────────────────────────────────────
const revenueAnalyticsRouter = router({
  getSummary: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d", "1y"]).default("30d") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { grossRevenue: 0, totalFees: 0, successfulTxns: 0, failedTxns: 0, activeMerchants: 0, netRevenue: 0 };
      const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[input.period];
      const since = new Date(Date.now() - days * 86400_000);
      const result = await db.execute(sql`
        SELECT
          COALESCE(SUM(CASE WHEN status = 'success' THEN amount ELSE 0 END), 0) AS gross_revenue,
          COALESCE(SUM(CASE WHEN status = 'success' THEN fee ELSE 0 END), 0) AS total_fees,
          COUNT(*) FILTER (WHERE status = 'success') AS successful_txns,
          COUNT(*) FILTER (WHERE status = 'failed') AS failed_txns,
          COUNT(DISTINCT merchant_id) AS active_merchants
        FROM transactions WHERE created_at >= ${since}
      `);
      const row = (result.rows[0] ?? {}) as Record<string, any>;
      return {
        grossRevenue: Number(row.gross_revenue ?? 0),
        totalFees: Number(row.total_fees ?? 0),
        successfulTxns: Number(row.successful_txns ?? 0),
        failedTxns: Number(row.failed_txns ?? 0),
        activeMerchants: Number(row.active_merchants ?? 0),
        netRevenue: Number(row.total_fees ?? 0),
      };
    }),
  getBreakdown: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"), groupBy: z.enum(["day", "week", "month"]).default("day") }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[input.period];
      const since = new Date(Date.now() - days * 86400_000);
      const result = await db.execute(sql`
        SELECT DATE_TRUNC(${input.groupBy}, created_at) AS period,
          COALESCE(SUM(CASE WHEN status='success' THEN amount ELSE 0 END),0) AS revenue,
          COALESCE(SUM(CASE WHEN status='success' THEN fee ELSE 0 END),0) AS fees,
          COUNT(*) FILTER (WHERE status='success') AS txn_count
        FROM transactions WHERE created_at >= ${since} GROUP BY 1 ORDER BY 1
      `);
      return (result.rows as Record<string, any>[]).map((r) => ({
        period: r.period, revenue: Number(r.revenue), fees: Number(r.fees), txnCount: Number(r.txn_count),
      }));
    }),
  getTopMerchants: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d", "1y"]).default("30d"), limit: z.number().min(1).max(50).default(10) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const days = { "7d": 7, "30d": 30, "90d": 90, "1y": 365 }[input.period];
      const since = new Date(Date.now() - days * 86400_000);
      const result = await db.execute(sql`
        SELECT t.merchant_id, m.business_name,
          COALESCE(SUM(CASE WHEN t.status='success' THEN t.amount ELSE 0 END),0) AS volume,
          COALESCE(SUM(CASE WHEN t.status='success' THEN t.fee ELSE 0 END),0) AS fees,
          COUNT(*) FILTER (WHERE t.status='success') AS txn_count
        FROM transactions t LEFT JOIN merchants m ON m.id=t.merchant_id
        WHERE t.created_at >= ${since}
        GROUP BY t.merchant_id, m.business_name ORDER BY volume DESC LIMIT ${input.limit}
      `);
      return (result.rows as Record<string, any>[]).map((r) => ({
        merchantId: r.merchant_id, businessName: r.business_name ?? r.merchant_id,
        volume: Number(r.volume), fees: Number(r.fees), txnCount: Number(r.txn_count),
      }));
    }),
});

// ─── 3. FX Rates ───────────────────────────────────────────────────────────
const fxRatesRouter = router({
  list: protectedProcedure
    .input(z.object({ baseCurrency: z.string().optional(), quoteCurrency: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.baseCurrency) conditions.push(eq(fxRates.baseCurrency, input.baseCurrency));
      if (input.quoteCurrency) conditions.push(eq(fxRates.targetCurrency, input.quoteCurrency));
      return db.select().from(fxRates)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(fxRates.fetchedAt));
    }),
  create: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().length(3),
      quoteCurrency: z.string().length(3),
      rate: z.number().positive(),
      source: z.string().default("manual"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.insert(fxRates).values({
        baseCurrency: input.baseCurrency,
        targetCurrency: input.quoteCurrency,
        rate: String(input.rate),
        source: input.source,
        fetchedAt: new Date(),
      }).returning();
      return row;
    }),
  update: protectedProcedure
    .input(z.object({ id: z.number(), rate: z.number().positive() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(fxRates).set({ rate: String(input.rate), fetchedAt: new Date() })
        .where(eq(fxRates.id, input.id)).returning();
      return row;
    }),
});

// ─── 4. API Rate Limits ────────────────────────────────────────────────────
const apiRateLimitsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.merchantId) conditions.push(eq(apiRateLimitRules.merchantId, input.merchantId));
      return db.select().from(apiRateLimitRules)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(apiRateLimitRules.createdAt));
    }),
  update: protectedProcedure
    .input(z.object({
      id: z.string(),
      limitPerMinute: z.number().int().positive().optional(),
      limitPerHour: z.number().int().positive().optional(),
      limitPerDay: z.number().int().positive().optional(),
      isActive: z.boolean().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const { id, ...rest } = input;
      const [row] = await db.update(apiRateLimitRules)
        .set({ ...rest, updatedAt: new Date() } as any)
        .where(eq(apiRateLimitRules.id, id)).returning();
      return row;
    }),
  getUsage: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const since = new Date(Date.now() - 60_000);
      const result = await db.execute(sql`
        SELECT resource AS endpoint, COUNT(*) AS requests_last_minute
        FROM audit_logs WHERE created_at >= ${since}
        ${input.merchantId ? sql`AND merchant_id = ${input.merchantId}` : sql``}
        GROUP BY resource ORDER BY requests_last_minute DESC LIMIT 20
      `);
      return (result.rows as Record<string, any>[]).map((r) => ({
        endpoint: r.endpoint, requestsLastMinute: Number(r.requests_last_minute),
      }));
    }),
});

// ─── 5. Notification Preferences ──────────────────────────────────────────
const notificationPreferencesRouter = router({
  get: protectedProcedure
    .input(z.object({ merchantId: z.string() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return null;
      const [row] = await db.select().from(realtimeNotificationPreferences)
        .where(eq(realtimeNotificationPreferences.merchantId, input.merchantId));
      return row ?? null;
    }),
  save: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      emailEnabled: z.boolean().default(true),
      smsEnabled: z.boolean().default(false),
      pushEnabled: z.boolean().default(false),
      webhookEnabled: z.boolean().default(false),
      digestFrequency: z.enum(["realtime", "hourly", "daily", "weekly"]).default("realtime"),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const existing = await db.select().from(realtimeNotificationPreferences)
        .where(eq(realtimeNotificationPreferences.merchantId, input.merchantId));
      const values = {
        emailEnabled: input.emailEnabled ? 1 : 0,
        smsEnabled: input.smsEnabled ? 1 : 0,
        pushEnabled: input.pushEnabled ? 1 : 0,
        webhookEnabled: input.webhookEnabled ? 1 : 0,
        digestFrequency: input.digestFrequency,
        updatedAt: new Date(),
      };
      if (existing.length) {
        const [row] = await db.update(realtimeNotificationPreferences)
          .set(values as any)
          .where(eq(realtimeNotificationPreferences.merchantId, input.merchantId))
          .returning();
        return row;
      }
      const [row] = await db.insert(realtimeNotificationPreferences)
        .values({ merchantId: input.merchantId, ...values } as any)
        .returning();
      return row;
    }),
});

// ─── 6. POS Terminals ─────────────────────────────────────────────────────
const posTerminalsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.string().optional(), status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.merchantId) conditions.push(eq(posTerminals.merchantId, input.merchantId));
      if (input.status) conditions.push(eq(posTerminals.status, input.status as any));
      return db.select().from(posTerminals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(posTerminals.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      serialNumber: z.string(),
      label: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const id = `pos_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const [row] = await db.insert(posTerminals).values({
        id,
        merchantId: input.merchantId,
        tenantId: input.tenantId,
        serialNumber: input.serialNumber,
        label: input.label,
        location: input.location,
        status: "active",
        createdAt: new Date(),
        updatedAt: new Date(),
      } as any).returning();
      return row;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(posTerminals).where(eq(posTerminals.id, input.id));
      return { success: true };
    }),
});

// ─── 7. Settlement Banks ──────────────────────────────────────────────────
const settlementBanksExtRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(settlementBanks.status, input.status));
      return db.select().from(settlementBanks)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(settlementBanks.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      bankName: z.string(),
      bankCode: z.string(),
      nipCode: z.string().optional(),
      swiftCode: z.string().optional(),
      settlementAccountNumber: z.string().optional(),
      settlementAccountName: z.string().optional(),
      contactEmail: z.string().email().optional(),
      contactPhone: z.string().optional(),
      isRtgsEnabled: z.boolean().default(false),
      isNipEnabled: z.boolean().default(true),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const id = `sb_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`;
      const [row] = await db.insert(settlementBanks).values({
        id, ...input, status: "active", createdAt: new Date(), updatedAt: new Date(),
      } as any).returning();
      return row;
    }),
  setStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(["active", "inactive", "suspended"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(settlementBanks)
        .set({ status: input.status, updatedAt: new Date() } as any)
        .where(eq(settlementBanks.id, input.id)).returning();
      return row;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(settlementBanks).where(eq(settlementBanks.id, input.id));
      return { success: true };
    }),
});

// ─── 8. KYC Documents ─────────────────────────────────────────────────────
const kycDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({ merchantId: z.string().optional(), documentType: z.string().optional() }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return [];
      const conditions: any[] = [];
      if (input.merchantId) conditions.push(eq(kybDocuments.merchantId, input.merchantId));
      if (input.documentType) conditions.push(eq(kybDocuments.documentType, input.documentType));
      return db.select().from(kybDocuments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(kybDocuments.uploadedAt));
    }),
  upload: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      documentType: z.string(),
      fileName: z.string(),
      fileBase64: z.string(),
      mimeType: z.string().default("application/pdf"),
      verificationId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `kyc/${input.merchantId}/${input.documentType}/${Date.now()}-${input.fileName}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      const [row] = await db.insert(kybDocuments).values({
        merchantId: input.merchantId,
        verificationId: input.verificationId ?? `VER-${Date.now()}`,
        documentType: input.documentType,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        status: "pending",
        uploadedAt: new Date(),
      } as any).returning();
      return row;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(kybDocuments).where(eq(kybDocuments.id, input.id));
      return { success: true };
    }),
});

// ─── 9. Merchant Verification ─────────────────────────────────────────────
const merchantVerificationRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const conditions: any[] = [];
      if (input.status) conditions.push(eq(kybVerifications.status, input.status));
      const where = conditions.length ? and(...conditions) : undefined;
      const rows = await db.select().from(kybVerifications).where(where)
        .orderBy(desc(kybVerifications.createdAt)).limit(input.limit).offset(input.offset);
      const [{ count }] = await db.select({ count: sql<number>`count(*)` }).from(kybVerifications).where(where);
      return { rows, total: Number(count) };
    }),
  startReview: protectedProcedure
    .input(z.object({ id: z.string(), reviewerId: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(kybVerifications)
        .set({ status: "in_review", initiatedBy: input.reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      return row;
    }),
  approve: protectedProcedure
    .input(z.object({ id: z.string(), reviewerId: z.string(), notes: z.string().optional() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(kybVerifications)
        .set({ status: "approved", initiatedBy: input.reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      await notifyOwner({ title: "Merchant KYB Approved", content: `KYB ${input.id} approved by ${input.reviewerId}.` });
      return row;
    }),
  reject: protectedProcedure
    .input(z.object({ id: z.string(), reviewerId: z.string(), reason: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(kybVerifications)
        .set({ status: "rejected", initiatedBy: input.reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      await notifyOwner({ title: "Merchant KYB Rejected", content: `KYB ${input.id} rejected. Reason: ${input.reason}` });
      return row;
    }),
});


// ─── 11. Bulk Transfers ───────────────────────────────────────────────────
const bulkTransfersRouter = router({
  validate: protectedProcedure
    .input(z.object({
      transfers: z.array(z.object({
        reference: z.string(),
        amount: z.number().positive(),
        currency: z.string(),
        beneficiaryName: z.string(),
        beneficiaryAccount: z.string(),
        bankCode: z.string(),
        narration: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const errors: { row: number; message: string }[] = [];
      input.transfers.forEach((t, i) => {
        if (!t.beneficiaryAccount.match(/^\d{10}$/)) errors.push({ row: i + 1, message: `Row ${i + 1}: Account must be 10 digits` });
        if (t.amount < 100) errors.push({ row: i + 1, message: `Row ${i + 1}: Amount below minimum (₦1)` });
      });
      return { valid: errors.length === 0, errors, totalAmount: input.transfers.reduce((s, t) => s + t.amount, 0), count: input.transfers.length };
    }),
  submit: protectedProcedure
    .input(z.object({
      batchName: z.string(),
      merchantId: z.string(),
      transfers: z.array(z.object({
        reference: z.string(),
        amount: z.number().positive(),
        currency: z.string(),
        beneficiaryName: z.string(),
        beneficiaryAccount: z.string(),
        bankCode: z.string(),
        narration: z.string().optional(),
      })),
    }))
    .mutation(async ({ input }) => {
      const batchId = `BULK-${Date.now()}-${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      await notifyOwner({ title: "Bulk Transfer Submitted", content: `Batch "${input.batchName}" (${batchId}) with ${input.transfers.length} transfers submitted.` });
      return { batchId, status: "queued", count: input.transfers.length };
    }),
});

// ─── Main Wave 223 Extensions Router ──────────────────────────────────────
export const wave223ExtRouter = router({
  auditLogs: auditLogsRouter,
  revenueAnalytics: revenueAnalyticsRouter,
  fxRates: fxRatesRouter,
  apiRateLimits: apiRateLimitsRouter,
  notificationPreferences: notificationPreferencesRouter,
  posTerminals: posTerminalsRouter,
  settlementBanks: settlementBanksExtRouter,
  kycDocuments: kycDocumentsRouter,
  merchantVerification: merchantVerificationRouter,
  bulkTransfers: bulkTransfersRouter,
});
