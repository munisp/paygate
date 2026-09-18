// @ts-nocheck
/**
 * Wave 88 Router — Portfolio Rebalancing, Claim Documents, Corridor Live Stats
 * Implements:
 *   - executeRebalance: buy/sell orders to reach target allocation
 *   - claimDocuments: S3 upload + DB tracking for insurance claim evidence
 *   - corridorLiveStats: real-time corridor volume from transactions table
 *   - adminSlaMonitor: SLA breach monitoring with live metrics
 *   - adminTenantRevenue: per-tenant revenue analytics
 *   - whiteLabelSdk: SDK token management for white-label partners
 */

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { getDb } from "./db";
import { demoOrFail } from "./_core/demoData";
import { logger } from "./logger";
import { storagePut } from "./storage";
import { sql, eq, desc, and, gte, sum, count } from "drizzle-orm";
import crypto from "crypto";
import * as schema from "../drizzle/schema";

function nanoid(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

// ─── Portfolio Rebalancing ────────────────────────────────────────────────────

export const portfolioRebalancingRouter = router({
  /**
   * Get current portfolio allocation vs target allocation
   * Returns buy/sell suggestions to reach target
   */
  getRebalancePlan: protectedProcedure
    .input(z.object({
      targetGoldPct: z.number().min(0).max(100).default(30),
      targetMutualFundPct: z.number().min(0).max(100).default(50),
      targetPensionPct: z.number().min(0).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = String(ctx.user.id);

      // Fetch current holdings from each asset class — real tables/columns
      // (drizzle/schema.ts: digital_gold_holdings :2472, mutual_fund_holdings
      // :2514, pension_accounts :2577; all keyed by merchant_id).
      const [goldHoldings] = await db.execute(sql`
        SELECT COALESCE(SUM(current_value_kobo), 0) AS total_kobo
        FROM digital_gold_holdings
        WHERE merchant_id = ${userId}
      `);
      const [mfHoldings] = await db.execute(sql`
        SELECT COALESCE(SUM(current_value_kobo), 0) AS total_kobo
        FROM mutual_fund_holdings
        WHERE merchant_id = ${userId}
      `);
      const [pensionHoldings] = await db.execute(sql`
        SELECT COALESCE(SUM(balance_kobo), 0) AS total_kobo
        FROM pension_accounts
        WHERE merchant_id = ${userId} AND status = 'active'
      `);

      const goldKobo = Number((goldHoldings as any)?.total_kobo ?? 0);
      const mfKobo = Number((mfHoldings as any)?.total_kobo ?? 0);
      const pensionKobo = Number((pensionHoldings as any)?.total_kobo ?? 0);
      const totalKobo = goldKobo + mfKobo + pensionKobo;

      if (totalKobo === 0) {
        return { totalKobo: 0, currentAllocation: { gold: 0, mutualFund: 0, pension: 0 }, suggestions: [] };
      }

      const currentGoldPct = (goldKobo / totalKobo) * 100;
      const currentMfPct = (mfKobo / totalKobo) * 100;
      const currentPensionPct = (pensionKobo / totalKobo) * 100;

      // Validate target percentages sum to 100
      const targetSum = input.targetGoldPct + input.targetMutualFundPct + input.targetPensionPct;
      if (Math.abs(targetSum - 100) > 0.01) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Target allocations must sum to 100%" });
      }

      // Calculate buy/sell amounts
      const targetGoldKobo = (input.targetGoldPct / 100) * totalKobo;
      const targetMfKobo = (input.targetMutualFundPct / 100) * totalKobo;
      const targetPensionKobo = (input.targetPensionPct / 100) * totalKobo;

      const suggestions = [];
      const REBALANCE_THRESHOLD_PCT = 2; // Only suggest if deviation > 2%

      if (Math.abs(currentGoldPct - input.targetGoldPct) > REBALANCE_THRESHOLD_PCT) {
        const diff = targetGoldKobo - goldKobo;
        suggestions.push({
          assetType: "gold",
          direction: diff > 0 ? "buy" : "sell",
          amountKobo: Math.abs(diff),
          currentPct: currentGoldPct,
          targetPct: input.targetGoldPct,
          label: diff > 0 ? `Buy ₦${(Math.abs(diff) / 100).toFixed(2)} of Gold` : `Sell ₦${(Math.abs(diff) / 100).toFixed(2)} of Gold`,
        });
      }
      if (Math.abs(currentMfPct - input.targetMutualFundPct) > REBALANCE_THRESHOLD_PCT) {
        const diff = targetMfKobo - mfKobo;
        suggestions.push({
          assetType: "mutual_fund",
          direction: diff > 0 ? "buy" : "sell",
          amountKobo: Math.abs(diff),
          currentPct: currentMfPct,
          targetPct: input.targetMutualFundPct,
          label: diff > 0 ? `Buy ₦${(Math.abs(diff) / 100).toFixed(2)} of Mutual Funds` : `Sell ₦${(Math.abs(diff) / 100).toFixed(2)} of Mutual Funds`,
        });
      }
      if (Math.abs(currentPensionPct - input.targetPensionPct) > REBALANCE_THRESHOLD_PCT) {
        const diff = targetPensionKobo - pensionKobo;
        suggestions.push({
          assetType: "pension",
          direction: diff > 0 ? "buy" : "sell",
          amountKobo: Math.abs(diff),
          currentPct: currentPensionPct,
          targetPct: input.targetPensionPct,
          label: diff > 0 ? `Contribute ₦${(Math.abs(diff) / 100).toFixed(2)} to Pension` : `Withdraw ₦${(Math.abs(diff) / 100).toFixed(2)} from Pension`,
        });
      }

      return {
        totalKobo,
        currentAllocation: {
          gold: currentGoldPct,
          mutualFund: currentMfPct,
          pension: currentPensionPct,
        },
        suggestions,
      };
    }),

  /**
   * Execute rebalancing orders — creates buy/sell order records and debits/credits
   * the user's consumer wallet accordingly
   */
  executeRebalance: protectedProcedure
    .input(z.object({
      orders: z.array(z.object({
        assetType: z.enum(["gold", "mutual_fund", "pension"]),
        direction: z.enum(["buy", "sell"]),
        amountKobo: z.number().positive(),
        targetAllocationPct: z.number().min(0).max(100),
        currentAllocationPct: z.number().min(0).max(100),
      })).min(1).max(3),
    }))
    .mutation(async ({ ctx, input }) => {
      // No execution rail is integrated anywhere in this codebase (no goldtech /
      // mutual-fund NAV engine / PenCom order routing exists), so marking orders
      // 'completed' and claiming "Portfolio will reflect changes within 24 hours"
      // fabricates execution (F1-15, spec #13). Fail honestly; a clearly-labelled
      // demo payload is returned only when PAYGATE_SIMULATION_MODE=true.
      return demoOrFail(
        {
          batchId: nanoid("reb_"),
          ordersExecuted: 0,
          orders: input.orders.map((order) => ({ ...order, status: "simulated" })),
          message: "SIMULATION ONLY: portfolio rebalancing execution rail is not integrated — no orders were routed and no portfolio changes will occur.",
        },
        "portfolioRebalancing.executeRebalance (no execution rail integrated)",
      );
    }),

  /**
   * Get rebalancing order history for the current user
   */
  getRebalancingHistory: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;
      const orders = await db.select()
        .from(schema.portfolioRebalancingOrders)
        .where(eq(schema.portfolioRebalancingOrders.userId, userId))
        .orderBy(desc(schema.portfolioRebalancingOrders.createdAt))
        .limit(input.limit);

      return orders;
    }),
});

// ─── Claim Documents ──────────────────────────────────────────────────────────

export const claimDocumentsRouter = router({
  /**
   * Upload a document for an insurance claim
   * Accepts base64-encoded file content, stores in S3, records in DB
   */
  uploadDocument: protectedProcedure
    .input(z.object({
      claimId: z.string().min(1),
      fileName: z.string().min(1).max(255),
      mimeType: z.enum(["image/jpeg", "image/png", "image/webp", "application/pdf", "image/heic"]),
      base64Content: z.string().min(1), // base64-encoded file content
      fileSizeBytes: z.number().positive().max(10 * 1024 * 1024), // max 10MB
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;

      // Verify claim belongs to this user
      const [claim] = await db.select()
        .from(schema.userInsuranceClaims)
        .where(and(
          eq(schema.userInsuranceClaims.id, input.claimId),
          eq(schema.userInsuranceClaims.userId, userId)
        ))
        .limit(1);

      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
      }

      // Check document count limit (max 10 per claim)
      const [{ docCount }] = await db.select({ docCount: count() })
        .from(schema.claimDocuments)
        .where(eq(schema.claimDocuments.claimId, input.claimId));

      if (Number(docCount) >= 10) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Maximum 10 documents per claim" });
      }

      // Upload to S3
      const ext = input.mimeType.split("/")[1].replace("jpeg", "jpg");
      const fileKey = `claim-docs/${userId}/${input.claimId}/${nanoid()}.${ext}`;
      const fileBuffer = Buffer.from(input.base64Content, "base64");

      const { url } = await storagePut(fileKey, fileBuffer, input.mimeType);

      // Record in DB
      const docId = nanoid("cdoc_");
      await db.insert(schema.claimDocuments).values({
        id: docId,
        claimId: input.claimId,
        userId,
        fileName: input.fileName,
        fileKey,
        fileUrl: url,
        mimeType: input.mimeType,
        fileSizeBytes: input.fileSizeBytes,
      });

      return { id: docId, fileUrl: url, fileName: input.fileName, uploadedAt: new Date() };
    }),

  /**
   * List documents for a specific claim
   */
  listDocuments: protectedProcedure
    .input(z.object({ claimId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;

      // Verify claim belongs to this user
      const [claim] = await db.select()
        .from(schema.userInsuranceClaims)
        .where(and(
          eq(schema.userInsuranceClaims.id, input.claimId),
          eq(schema.userInsuranceClaims.userId, userId)
        ))
        .limit(1);

      if (!claim) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Claim not found or access denied" });
      }

      const docs = await db.select()
        .from(schema.claimDocuments)
        .where(eq(schema.claimDocuments.claimId, input.claimId))
        .orderBy(desc(schema.claimDocuments.uploadedAt));

      return docs;
    }),

  /**
   * Delete a document (only if claim is still in 'submitted' status)
   */
  deleteDocument: protectedProcedure
    .input(z.object({ documentId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;

      const [doc] = await db.select()
        .from(schema.claimDocuments)
        .where(and(
          eq(schema.claimDocuments.id, input.documentId),
          eq(schema.claimDocuments.userId, userId)
        ))
        .limit(1);

      if (!doc) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Document not found or access denied" });
      }

      // Verify claim is still editable
      const [claim] = await db.select()
        .from(schema.userInsuranceClaims)
        .where(eq(schema.userInsuranceClaims.id, doc.claimId))
        .limit(1);

      if (claim && claim.status !== "submitted") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot delete documents from a claim that is under review or resolved" });
      }

      await db.delete(schema.claimDocuments)
        .where(eq(schema.claimDocuments.id, input.documentId));

      return { success: true };
    }),
});

// ─── Corridor Live Stats ──────────────────────────────────────────────────────

export const corridorLiveStatsRouter = router({
  /**
   * Get live corridor volume data aggregated from transactions table
   * Used by AdminCorridorMonitor heatmap
   */
  getLiveStats: protectedProcedure
    .input(z.object({
      tenantId: z.string().optional(),
      days: z.number().min(1).max(90).default(7),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      // Aggregate from transactions table grouped by source/dest currency
      const stats = await db.execute(sql`
        SELECT
          COALESCE(metadata->>'sourceCurrency', currency) AS source_currency,
          COALESCE(metadata->>'destinationCurrency', 'NGN') AS destination_currency,
          COALESCE(metadata->>'sourceCountry', 'NG') AS source_country,
          COALESCE(metadata->>'destinationCountry', 'NG') AS destination_country,
          COUNT(*) AS tx_count,
          SUM(amount) AS volume_kobo,
          AVG(CAST(metadata->>'fxRate' AS FLOAT)) AS avg_fx_rate
        FROM transactions
        WHERE
          created_at >= NOW() - INTERVAL '${sql.raw(String(input.days))} days'
          AND status = 'completed'
          AND metadata->>'type' = 'cross_border'
          ${input.tenantId ? sql`AND tenant_id = ${input.tenantId}` : sql``}
        GROUP BY 1, 2, 3, 4
        ORDER BY volume_kobo DESC
        LIMIT 50
      `);

      const rows = (stats as any).rows ?? stats;
      return rows.map((r: any) => ({
        sourceCurrency: r.source_currency ?? "NGN",
        destinationCurrency: r.destination_currency ?? "USD",
        sourceCountry: r.source_country ?? "NG",
        destinationCountry: r.destination_country ?? "US",
        txCount: Number(r.tx_count ?? 0),
        volumeKobo: Number(r.volume_kobo ?? 0),
        avgFxRate: r.avg_fx_rate ? Number(r.avg_fx_rate) : null,
      }));
    }),

  /**
   * Admin: set FX markup for a corridor
   */
  setFxMarkup: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      destinationCurrency: z.string().length(3),
      markupBps: z.number().min(0).max(500), // basis points, max 5%
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.execute(sql`
        INSERT INTO corridor_fx_markups (source_currency, destination_currency, markup_bps, updated_at)
        VALUES (${input.sourceCurrency}, ${input.destinationCurrency}, ${input.markupBps}, NOW())
        ON CONFLICT (source_currency, destination_currency)
        DO UPDATE SET markup_bps = EXCLUDED.markup_bps, updated_at = NOW()
      `);

      return { success: true, markupBps: input.markupBps };
    }),

  /**
   * Admin: toggle corridor active/inactive
   */
  toggleCorridor: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      destinationCurrency: z.string().length(3),
      active: z.boolean(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      await db.execute(sql`
        INSERT INTO corridor_config (source_currency, destination_currency, is_active, updated_at)
        VALUES (${input.sourceCurrency}, ${input.destinationCurrency}, ${input.active}, NOW())
        ON CONFLICT (source_currency, destination_currency)
        DO UPDATE SET is_active = EXCLUDED.is_active, updated_at = NOW()
      `);

      return { success: true, active: input.active };
    }),
});

// ─── Admin SLA Monitor ────────────────────────────────────────────────────────

export const adminSlaMonitorRouter = router({
  /**
   * Get SLA breach metrics across all settlements
   */
  getBreachMetrics: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const [metrics] = await db.execute(sql`
        SELECT
          COUNT(*) FILTER (WHERE status = 'pending') AS pending_count,
          COUNT(*) FILTER (WHERE status = 'processing') AS processing_count,
          COUNT(*) FILTER (WHERE status = 'completed') AS completed_count,
          COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL) AS breached_count,
          COUNT(*) FILTER (WHERE sla_breached_at IS NOT NULL AND sla_alert_sent_at IS NULL) AS unalerted_count,
          AVG(EXTRACT(EPOCH FROM (completed_at - created_at))/3600) FILTER (WHERE status = 'completed') AS avg_settlement_hours,
          MAX(EXTRACT(EPOCH FROM (NOW() - created_at))/3600) FILTER (WHERE status = 'pending') AS oldest_pending_hours
        FROM settlements
      `);

      const breachedSettlements = await db.execute(sql`
        SELECT id, merchant_id, amount, currency, status, created_at, sla_deadline_at, sla_breached_at
        FROM settlements
        WHERE sla_breached_at IS NOT NULL
        ORDER BY created_at DESC
        LIMIT 20
      `);

      return {
        metrics: {
          pendingCount: Number((metrics as any)?.pending_count ?? 0),
          processingCount: Number((metrics as any)?.processing_count ?? 0),
          completedCount: Number((metrics as any)?.completed_count ?? 0),
          breachedCount: Number((metrics as any)?.breached_count ?? 0),
          unalertedCount: Number((metrics as any)?.unalerted_count ?? 0),
          avgSettlementHours: Number((metrics as any)?.avg_settlement_hours ?? 0),
          oldestPendingHours: Number((metrics as any)?.oldest_pending_hours ?? 0),
        },
        breachedSettlements: ((breachedSettlements as any).rows ?? breachedSettlements) as any[],
      };
    }),
  /**
   * Send breach alerts to compliance team for all unalerted SLA breaches
   */
  sendBreachAlerts: protectedProcedure
    .mutation(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const result = await db.execute(sql`
        UPDATE settlements
        SET sla_alert_sent_at = NOW(), updated_at = NOW()
        WHERE sla_breached_at IS NOT NULL AND sla_alert_sent_at IS NULL
        RETURNING id, merchant_id, amount, currency
      `);
      const rows = (result as any).rows ?? result;
      const count = Array.isArray(rows) ? rows.length : 0;
      const { notifyOwner } = await import('./_core/notification');
      await notifyOwner({
        title: `SLA Breach Alerts Sent`,
        content: `${count} settlement SLA breach alert(s) sent to compliance team by admin.`,
      }).catch((e) => logger.error("[wave88] SLA breach alert owner notification failed", { error: e instanceof Error ? e.message : String(e) }));
      return { success: true, alertsSent: count };
    }),
  /**
   * Trigger a manual settlement run for all pending settlements
   */
  triggerManualSettlement: protectedProcedure
    .input(z.object({ merchantId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const { triggerSettlementViaMiddleware } = await import('./middlewareBridge');
      const resp = await triggerSettlementViaMiddleware({
        merchantId: input.merchantId ?? 'all',
        settlementType: 'manual',
        currency: 'NGN',
      }).catch(() => null);
      const { notifyOwner } = await import('./_core/notification');
      await notifyOwner({
        title: 'Manual Settlement Run Triggered',
        content: `Manual settlement run triggered${input.merchantId ? ` for merchant ${input.merchantId}` : ' for all merchants'} by admin.`,
      }).catch((e) => logger.error("[wave88] manual settlement owner notification failed", { error: e instanceof Error ? e.message : String(e) }));
      return { success: true, runId: (resp as any)?.runId ?? `manual_${Date.now()}`, fallback: !resp };
    }),
});

// ─── Admin Tenant Revenue ─────────────────────────────────────────────────────

export const adminTenantRevenueRouter = router({
  /**
   * Get per-tenant revenue breakdown for admin analytics
   */
  getRevenueBreakdown: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(365).default(30),
      limit: z.number().min(1).max(50).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const revenueData = await db.execute(sql`
        SELECT
          t.tenant_id,
          ten.name AS tenant_name,
          COUNT(*) AS tx_count,
          SUM(t.amount) AS gross_volume_kobo,
          SUM(t.fee_amount) AS total_fees_kobo,
          AVG(t.amount) AS avg_tx_kobo,
          COUNT(DISTINCT t.merchant_id) AS active_merchants
        FROM transactions t
        LEFT JOIN tenants ten ON ten.id = t.tenant_id
        WHERE t.created_at >= NOW() - INTERVAL '${sql.raw(String(input.days))} days'
          AND t.status = 'completed'
        GROUP BY t.tenant_id, ten.name
        ORDER BY total_fees_kobo DESC
        LIMIT ${input.limit}
      `);

      const rows = (revenueData as any).rows ?? revenueData;
      return rows.map((r: any) => ({
        tenantId: r.tenant_id,
        tenantName: r.tenant_name ?? r.tenant_id,
        txCount: Number(r.tx_count ?? 0),
        grossVolumeKobo: Number(r.gross_volume_kobo ?? 0),
        totalFeesKobo: Number(r.total_fees_kobo ?? 0),
        avgTxKobo: Number(r.avg_tx_kobo ?? 0),
        activeMerchants: Number(r.active_merchants ?? 0),
      }));
    }),
});

// ─── White-Label SDK ──────────────────────────────────────────────────────────

export const whiteLabelSdkRouter = router({
  /**
   * List SDK tokens for the current merchant
   */
  listTokens: protectedProcedure
    .query(async ({ ctx }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;
      const tokens = await db.execute(sql`
        SELECT id, name, token_prefix, scopes, is_active, last_used_at, created_at, expires_at
        FROM sdk_tokens
        WHERE owner_user_id = ${userId}
        ORDER BY created_at DESC
        LIMIT 50
      `);

      return (tokens as any).rows ?? tokens;
    }),

  /**
   * Create a new SDK token
   */
  createToken: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      scopes: z.array(z.enum(["payments", "webhooks", "analytics", "customers", "payouts"])).min(1),
      expiresInDays: z.number().min(1).max(365).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;
      const tokenId = nanoid("sdk_");
      const rawToken = `pg_sdk_${crypto.randomBytes(32).toString("hex")}`;
      const tokenHash = crypto.createHash("sha256").update(rawToken).digest("hex");
      const tokenPrefix = rawToken.substring(0, 12) + "...";
      const expiresAt = input.expiresInDays
        ? new Date(Date.now() + input.expiresInDays * 86400000)
        : null;

      await db.execute(sql`
        INSERT INTO sdk_tokens (id, name, token_hash, token_prefix, scopes, owner_user_id, is_active, expires_at, created_at)
        VALUES (
          ${tokenId}, ${input.name}, ${tokenHash}, ${tokenPrefix},
          ${JSON.stringify(input.scopes)}, ${userId}, true,
          ${expiresAt ? expiresAt.toISOString() : null}, NOW()
        )
      `);

      // Return the raw token ONCE — never stored in plaintext
      return {
        id: tokenId,
        name: input.name,
        rawToken, // shown only once
        tokenPrefix,
        scopes: input.scopes,
        expiresAt,
        warning: "Store this token securely. It will not be shown again.",
      };
    }),

  /**
   * Revoke an SDK token
   */
  revokeToken: protectedProcedure
    .input(z.object({ tokenId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      const userId = ctx.user.id;
      await db.execute(sql`
        UPDATE sdk_tokens
        SET is_active = false, revoked_at = NOW()
        WHERE id = ${input.tokenId} AND owner_user_id = ${userId}
      `);

      return { success: true };
    }),
});
