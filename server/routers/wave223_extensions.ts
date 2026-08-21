/**
 * Wave 223 Extension Router
 * Provides all missing sub-routers needed by Wave 223 UI pages:
 * auditLogs, revenueAnalytics, fxRates, apiRateLimits,
 * notificationPreferences, posTerminals, settlementBanks (ext),
 * kycDocuments, merchantVerification, ndcPositionLimits,
 * bulkTransfers, dfspTopology
 */
import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { demoOrFail } from "../_core/demoData";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { TRPCError } from "@trpc/server";
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
  nexthubDfsps,
} from "../../drizzle/schema";
import { storagePut } from "../storage";
import { notifyOwner } from "../_core/notification";
import { dispatchWebhookEvent, buildWebhookPayload } from "../webhookEvents";
import { notifyMerchant } from "../pushClient";
import { publishEvent, KAFKA_TOPICS } from "../kafkaClient";

/**
 * Resolve the caller's merchant from the server-side session (never from
 * client-supplied input). Same pattern as chargebackLifecycle.ts.
 */
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

// ─── 1. Audit Logs ─────────────────────────────────────────────────────────
const auditLogsRouter = router({
  // Platform-wide audit trail read (all merchants/actors) — admin only.
  list: adminProcedure
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
  // Platform FX-rate writes feed cross-border quote math — admin only.
  create: adminProcedure
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
  update: adminProcedure
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
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const merchantId = await resolveMerchantId(ctx.user.openId);
      return db.select().from(apiRateLimitRules)
        .where(eq(apiRateLimitRules.merchantId, merchantId))
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const { id, ...rest } = input;
      const [row] = await db.update(apiRateLimitRules)
        .set({ ...rest, updatedAt: new Date() } as any)
        .where(and(eq(apiRateLimitRules.id, id), eq(apiRateLimitRules.merchantId, merchantId))).returning();
      if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Rate limit rule not found" });
      return row;
    }),
  getUsage: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const since = new Date(Date.now() - 60_000);
      const result = await db.execute(sql`
        SELECT resource AS endpoint, COUNT(*) AS requests_last_minute
        FROM audit_logs WHERE created_at >= ${since}
        AND merchant_id = ${merchantId}
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
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) return null;
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [row] = await db.select().from(realtimeNotificationPreferences)
        .where(eq(realtimeNotificationPreferences.merchantId, merchantId));
      return row ?? null;
    }),
  save: protectedProcedure
    .input(z.object({
      emailEnabled: z.boolean().default(true),
      smsEnabled: z.boolean().default(false),
      pushEnabled: z.boolean().default(false),
      webhookEnabled: z.boolean().default(false),
      digestFrequency: z.enum(["realtime", "hourly", "daily", "weekly"]).default("realtime"),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // merchantId resolved from the session — a caller can no longer rewrite
      // another merchant's notification preferences.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const existing = await db.select().from(realtimeNotificationPreferences)
        .where(eq(realtimeNotificationPreferences.merchantId, merchantId));
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
          .where(eq(realtimeNotificationPreferences.merchantId, merchantId))
          .returning();
        return row;
      }
      const [row] = await db.insert(realtimeNotificationPreferences)
        .values({ merchantId, ...values } as any)
        .returning();
      return row;
    }),
});

// ─── 6. POS Terminals ─────────────────────────────────────────────────────
const posTerminalsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conditions: any[] = [eq(posTerminals.merchantId, merchantId)];
      if (input.status) conditions.push(eq(posTerminals.status, input.status as any));
      return db.select().from(posTerminals)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(posTerminals.createdAt));
    }),
  create: protectedProcedure
    .input(z.object({
      serialNumber: z.string(),
      label: z.string().optional(),
      location: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // merchantId/tenantId resolved from the session — never trust client input.
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
      const merchant = await getMerchantByOwnerId(user.id);
      if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
      const id = `pos_${Date.now()}_${crypto.randomUUID().slice(0, 8)}`;
      const [row] = await db.insert(posTerminals).values({
        id,
        merchantId: merchant.id,
        tenantId: merchant.tenantId,
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
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const merchantId = await resolveMerchantId(ctx.user.openId);
      await db.delete(posTerminals).where(and(eq(posTerminals.id, input.id), eq(posTerminals.merchantId, merchantId)));
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
  // Platform settlement-bank directory mutations — admin only.
  create: adminProcedure
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
  setStatus: adminProcedure
    .input(z.object({ id: z.string(), status: z.enum(["active", "inactive", "suspended"]) }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const [row] = await db.update(settlementBanks)
        .set({ status: input.status, updatedAt: new Date() } as any)
        .where(eq(settlementBanks.id, input.id)).returning();
      return row;
    }),
  delete: adminProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      await db.delete(settlementBanks).where(eq(settlementBanks.id, input.id));
      return { success: true };
    }),
});

// ─── 8. KYC Documents ─────────────────────────────────────────────────────
// Same document-type allowlist as wave122 kybDocUpload (ALLOWED_DOC_TYPES).
const KYC_DOC_TYPES = [
  "cac_certificate",
  "tin_certificate",
  "utility_bill",
  "director_id",
  "bank_statement",
  "memorandum",
  "board_resolution",
  "proof_of_address",
] as const;

const kycDocumentsRouter = router({
  list: protectedProcedure
    .input(z.object({ documentType: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) return [];
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conditions: any[] = [eq(kybDocuments.merchantId, merchantId)];
      if (input.documentType) conditions.push(eq(kybDocuments.documentType, input.documentType));
      return db.select().from(kybDocuments)
        .where(conditions.length ? and(...conditions) : undefined)
        .orderBy(desc(kybDocuments.uploadedAt));
    }),
  upload: protectedProcedure
    .input(z.object({
      documentType: z.enum(KYC_DOC_TYPES),
      fileName: z.string().min(1).max(255),
      fileBase64: z.string(),
      mimeType: z.string().default("application/pdf"),
      verificationId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      // merchantId resolved from the session — never trust client input.
      const merchantId = await resolveMerchantId(ctx.user.openId);
      // Sanitize every storage-key segment so crafted names cannot escape the
      // kyc/ prefix (chargebackLifecycle.ts safeName pattern).
      const safeSegment = (s: string) => s.replace(/[^a-zA-Z0-9._-]/g, "_");
      const buffer = Buffer.from(input.fileBase64, "base64");
      const fileKey = `kyc/${safeSegment(merchantId)}/${input.documentType}/${Date.now()}-${safeSegment(input.fileName)}`;
      const { url } = await storagePut(fileKey, buffer, input.mimeType);
      const [row] = await db.insert(kybDocuments).values({
        merchantId,
        verificationId: input.verificationId ?? `VER-${Date.now()}`,
        documentType: input.documentType,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        mimeType: input.mimeType,
        fileSizeBytes: buffer.length,
        uploadedBy: String(ctx.user.id),
        status: "pending",
        uploadedAt: new Date(),
      } as any).returning();
      return row;
    }),
  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const merchantId = await resolveMerchantId(ctx.user.openId);
      await db.delete(kybDocuments).where(and(eq(kybDocuments.id, input.id), eq(kybDocuments.merchantId, merchantId)));
      return { success: true };
    }),
});

// ─── 9. Merchant Verification ─────────────────────────────────────────────
// KYB review queue + decisions across ALL merchants — reviewer-facing,
// admin only. The reviewer identity always comes from the session.
const merchantVerificationRouter = router({
  list: adminProcedure
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
  startReview: adminProcedure
    .input(z.object({
      id: z.string(),
      // Accepted for backwards compatibility but IGNORED — the reviewer is the
      // authenticated admin.
      reviewerId: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const reviewerId = String(ctx.user.id);
      const [row] = await db.update(kybVerifications)
        .set({ status: "in_review", initiatedBy: reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      return row;
    }),
  approve: adminProcedure
    .input(z.object({
      id: z.string(),
      // IGNORED — reviewer identity comes from the session.
      reviewerId: z.string().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const reviewerId = String(ctx.user.id);
      const [row] = await db.update(kybVerifications)
        .set({ status: "approved", initiatedBy: reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      // ── In-app notification (existing) ────────────────────────────────────
      await notifyOwner({ title: "Merchant KYB Approved", content: `KYB ${input.id} approved by ${reviewerId}.` });
      // ── Kafka: kyb.approved event (Fix 2) ─────────────────────────────────
      publishEvent(
        KAFKA_TOPICS.KYC,
        {
          type: "kyb.approved",
          verificationId: input.id,
          merchantId: row?.merchantId ?? "",
          reviewerId,
          notes: input.notes ?? null,
          timestamp: new Date().toISOString(),
        },
        row?.merchantId ?? input.id,
        { "x-event-type": "kyb.approved" },
      ).catch(() => {});
      // ── Webhook: kyb.approved (Fix 2) ─────────────────────────────────────
      if (row?.merchantId) {
        dispatchWebhookEvent(
          buildWebhookPayload("kyc.approved", row.merchantId, "", { verificationId: input.id, reviewerId, notes: input.notes ?? null }),
        ).catch(() => {});
        // ── Push notification: kyb.approved (Fix 2) ─────────────────────────
        notifyMerchant({
          merchantId: row.merchantId,
          notification: {
            title: "KYB Approved",
            body: "Your business verification has been approved. You now have full access.",
          },
          type: "kyc_approved",
          data: { verificationId: input.id },
        }).catch(() => {});
      }
      return row;
    }),
  reject: adminProcedure
    .input(z.object({
      id: z.string(),
      // IGNORED — reviewer identity comes from the session.
      reviewerId: z.string().optional(),
      reason: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const db = await getDb();
      if (!db) throw new Error("DB unavailable");
      const reviewerId = String(ctx.user.id);
      const [row] = await db.update(kybVerifications)
        .set({ status: "rejected", initiatedBy: reviewerId, updatedAt: new Date() } as any)
        .where(eq(kybVerifications.verificationId, input.id)).returning();
      // ── In-app notification (existing) ────────────────────────────────────
      await notifyOwner({ title: "Merchant KYB Rejected", content: `KYB ${input.id} rejected. Reason: ${input.reason}` });
      // ── Kafka: kyb.rejected event (Fix 2) ─────────────────────────────────
      publishEvent(
        KAFKA_TOPICS.KYC,
        {
          type: "kyb.rejected",
          verificationId: input.id,
          merchantId: row?.merchantId ?? "",
          reviewerId,
          reason: input.reason,
          timestamp: new Date().toISOString(),
        },
        row?.merchantId ?? input.id,
        { "x-event-type": "kyb.rejected" },
      ).catch(() => {});
      // ── Webhook: kyb.rejected (Fix 2) ─────────────────────────────────────
      if (row?.merchantId) {
        dispatchWebhookEvent(
          buildWebhookPayload("kyc.rejected", row.merchantId, "", { verificationId: input.id, reviewerId, reason: input.reason }),
        ).catch(() => {});
        // ── Push notification: kyb.rejected (Fix 2) ─────────────────────────
        notifyMerchant({
          merchantId: row.merchantId,
          notification: {
            title: "KYB Not Approved",
            body: `Your business verification was not approved. Reason: ${input.reason}`,
          },
          type: "kyc_rejected",
          data: { verificationId: input.id, reason: input.reason },
        }).catch(() => {});
      }
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
      // Accepted for backwards compatibility but IGNORED — the merchant is
      // resolved from the authenticated session, never from the client.
      merchantId: z.string().optional(),
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
    .mutation(async ({ input, ctx }) => {
      // Merchant identity from the session — a caller cannot submit a batch on
      // behalf of another merchant.
      await resolveMerchantId(ctx.user.openId);
      // STUB: no persistence and no payout/bridge integration exists for bulk
      // transfers yet. Fail loud in production (demoOrFail) instead of
      // fabricating a "queued" batch that will never be executed.
      const batchId = `BULK-${Date.now()}-${crypto.randomUUID().slice(0, 4).toUpperCase()}`;
      const result = demoOrFail(
        { batchId, status: "queued", count: input.transfers.length },
        "wave223.bulkTransfers.submit",
      );
      await notifyOwner({ title: "Bulk Transfer Submitted (SIMULATION)", content: `Batch "${input.batchName}" (${batchId}) with ${input.transfers.length} transfers submitted (simulated — no real transfers queued).` });
      return result;
    }),
});

// ─── 11. DFSP Topology ────────────────────────────────────────────────────
// Backing client: client/src/pages/nexthub/DFSPTopologyMap.tsx
//   topology.nodes → { id, name, type, status, latencyMs?, transferCount? }
//   topology.edges → { from, to, volume }[]
// Nodes come from nexthub_dfsps (plus the NextHub switch itself as the hub).
// Edges and transfer counts are aggregated from real nexthub_transfers rows —
// when no transfers exist, edges is truthfully empty (never fabricated links).
const dfspTopologyRouter = router({
  get: protectedProcedure.query(async () => {
    const db = (await getDb())!;

    const dfsps = await db
      .select({
        dfspId: nexthubDfsps.dfspId,
        dfspName: nexthubDfsps.dfspName,
        dfspType: nexthubDfsps.dfspType,
        status: nexthubDfsps.status,
      })
      .from(nexthubDfsps)
      .orderBy(nexthubDfsps.dfspName)
      .limit(500);

    // Real per-DFSP transfer counts (payer + payee legs).
    const countRows = await db.execute(sql`
      SELECT fsp, COUNT(*)::int AS c FROM (
        SELECT payer_fsp_id AS fsp FROM nexthub_transfers
        UNION ALL
        SELECT payee_fsp_id AS fsp FROM nexthub_transfers
      ) legs
      GROUP BY fsp
    `);
    const countByFsp = new Map<string, number>(
      (countRows.rows as any[]).map((r) => [String(r.fsp), Number(r.c)])
    );

    // Real DFSP↔DFSP edges from observed transfers.
    const edgeRows = await db.execute(sql`
      SELECT payer_fsp_id AS "from", payee_fsp_id AS "to", COUNT(*)::int AS volume
      FROM nexthub_transfers
      GROUP BY payer_fsp_id, payee_fsp_id
      ORDER BY volume DESC
      LIMIT 1000
    `);
    const dfspIds = new Set(dfsps.map((d) => d.dfspId));
    const edges = (edgeRows.rows as any[]).map((r) => ({
      from: String(r.from),
      to: String(r.to),
      volume: Number(r.volume),
    }));

    const nodes = [
      {
        id: "nexthub-hub",
        name: "NextHub Switch",
        type: "hub",
        status: "active",
        transferCount: [...countByFsp.values()].reduce((a, b) => a + b, 0),
      },
      ...dfsps.map((d) => ({
        id: d.dfspId,
        name: d.dfspName,
        type: d.dfspType,
        // Table stores uppercase status; the map renders lowercase statuses.
        status: d.status.toLowerCase(),
        transferCount: countByFsp.get(d.dfspId) ?? 0,
      })),
    ];

    // Every edge endpoint must resolve to a rendered node: the hub node stands
    // in for any transfer counterparty that is not a registered DFSP.
    const normalisedEdges = edges.map((e) => ({
      from: dfspIds.has(e.from) ? e.from : "nexthub-hub",
      to: dfspIds.has(e.to) ? e.to : "nexthub-hub",
      volume: e.volume,
    }));

    return {
      nodes,
      edges: normalisedEdges,
      source: "nexthub_dfsps+nexthub_transfers",
      generatedAt: new Date().toISOString(),
    };
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
  dfspTopology: dfspTopologyRouter,
});
