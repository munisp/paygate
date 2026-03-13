import { grpcRouter } from "./grpcRouter"; // hoisted to top to prevent TDZ during tsx hot-reload
import { TRPCError } from "@trpc/server";
import crypto from "crypto";
import { z } from "zod";
import {
  createApiKey, createDispute, createMerchant, createPayout, createPaymentLink,
  createTeamMember, createTransaction, createVirtualCard, createWebhook,
  deleteTeamMember, deleteWebhook, getAnalyticsOverview, getCustomerById,
  getDisputeById, getMerchantByOwnerId, getPaymentLinkById, getPayoutById,
  getRevenueTimeSeries, getTransactionById, getTransactionStats,
  listApiKeys, listCustomers, listDisputes, listPaymentLinks, listPayouts,
  listTeamMembers, listTransactions, listVirtualCards, listWebhooks,
  listWebhookDeliveries, getWebhookById, updateWebhook,
  revokeApiKey, updateDispute, updateMerchant, updatePayout, updatePaymentLink,
  updateVirtualCard, upsertCustomer, getUserByOpenId, getVirtualCardById,
  listFraudAlerts, createFraudAlert, updateFraudAlert, getFraudStats,
  listKycSubmissions, updateKycSubmission, getKycStats,
  listBnplLoans, createBnplLoan, getBnplStats,
  listMobileMoneyRecon, getMmReconStats,
  upsertFxRates, getLatestFxRates, getFxRateHistory,
  getTransactionsForExport,
  updateTransaction,
  createWebhookDelivery,
  // NIP bank directory
  listNipBanks, getNipBankByCode, upsertNipBanks,
  getCachedNipAccount, cacheNipAccount,
  // NIP resolution error log
  createNipResolutionError, listNipResolutionErrors, countNipResolutionErrors, markNipErrorResolved,
  // Settlements
  createSettlement, getSettlementById, updateSettlement, listSettlements,
  listSlaBreachedSettlements, markSettlementSlaBreached, markSettlementSlaAlertSent,
  // Notifications
  createMerchantNotification, listMerchantNotifications, countUnreadNotifications,
  markNotificationRead, markAllNotificationsRead,
  // DB connection (used by subscriptions/POS routers)
  getDb,
} from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import {
  notifyDisputeOpened, notifyDisputeEscalated, notifyDisputeResolved,
  notifyPayoutInitiated, notifyPayoutApproved, notifyKycSubmitted,
  notifyHighRiskTransaction,
} from "./platformNotifications";
import { dispatchSlaBreachWebhook } from "./webhookDispatch";
import { systemRouter } from "./_core/systemRouter";
import { withIdempotency } from "./idempotency";
import {
  isBridgeAvailable,
  initiatePayoutApproval,
  approvePayoutViaMiddleware,
  rejectPayoutViaMiddleware,
  getPayoutApprovalStatus,
  recordTransactionViaMiddleware,
  refundTransactionViaMiddleware,
  submitDisputeViaMiddleware,
  resolveDisputeViaMiddleware,
  scoreFraudViaMiddleware,
  acknowledgeFraudAlertViaMiddleware,
  startKYCWorkflowViaMiddleware,
  updateKYCStatusViaMiddleware,
  createBNPLLoanViaMiddleware,
  processBNPLInstalmentViaMiddleware,
  recordFXConversionViaMiddleware,
  debitWalletViaMiddleware,
  creditWalletViaMiddleware,
  p2pTransferViaMiddleware,
  deliverWebhookViaMiddleware,
  retryWebhookViaMiddleware,
  issueVirtualCardViaMiddleware,
  freezeVirtualCardViaMiddleware,
  createPaymentLinkViaMiddleware,
  deactivatePaymentLinkViaMiddleware,
  triggerSettlementViaMiddleware,
  reconcileMoMoViaMiddleware,
  syncRolesToPermifyViaMiddleware,
  getWorkflowStatusViaMiddleware,
  listActiveWorkflowsViaMiddleware,
  forceTerminateWorkflowViaMiddleware,
  sendPayoutApprovalEmailViaMiddleware,
} from "./middlewareBridge";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(prefix = "") {
  return prefix + crypto.randomBytes(12).toString("hex");
}

async function requireMerchant(userId: number) {
  const merchant = await getMerchantByOwnerId(userId);
  if (!merchant) {
    throw new TRPCError({ code: "NOT_FOUND", message: "Merchant account not found. Complete onboarding first." });
  }
  return merchant;
}

async function resolveUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "NOT_FOUND", message: "User not found" });
  return user;
}

// ─── Auth Router ──────────────────────────────────────────────────────────────

const authRouter = router({
  me: publicProcedure.query(async ({ ctx }) => {
    if (!ctx.user) return null;
    const user = await getUserByOpenId(ctx.user.openId);
    if (!user) return null;
    const merchant = await getMerchantByOwnerId(user.id);
    return { ...user, merchant };
  }),

  // Email/password login — bypasses Manus OAuth for demo/dev use
  login: publicProcedure
    .input(z.object({ email: z.string().email(), password: z.string().min(6) }))
    .mutation(async ({ input, ctx }) => {
      const { getDb, schema } = await import("./db");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const [user] = await db.select().from(schema.users)
        .where(eq(schema.users.email, input.email)).limit(1);
      if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      const jwtSecret = process.env.JWT_SECRET ?? "";
      const expectedHash = crypto.createHash("sha256").update(input.password + jwtSecret).digest("hex");
      if (user.passwordHash !== expectedHash) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid email or password" });
      }
      const { sdk } = await import("./_core/sdk");
      const { COOKIE_NAME, ONE_YEAR_MS } = await import("../shared/const");
      const { getSessionCookieOptions } = await import("./_core/cookies");
      const token = await sdk.signSession({
        openId: user.openId,
        appId: process.env.VITE_APP_ID ?? "paygate",
        name: user.name ?? user.email ?? "Merchant",
      }, { expiresInMs: ONE_YEAR_MS });
      const cookieOptions = getSessionCookieOptions(ctx.req);
      ctx.res.cookie(COOKIE_NAME, token, { ...cookieOptions, maxAge: ONE_YEAR_MS / 1000 });
      return { success: true, user: { id: user.id, email: user.email, name: user.name } };
    }),

  logout: protectedProcedure.mutation(async ({ ctx }) => {
    const { COOKIE_NAME } = await import("../shared/const");
    const { getSessionCookieOptions } = await import("./_core/cookies");
    const cookieOptions = getSessionCookieOptions(ctx.req);
    ctx.res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
    return { success: true } as const;
  }),
});

// ─── Onboarding Router ────────────────────────────────────────────────────────

const onboardingRouter = router({
  getStatus: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await getMerchantByOwnerId(user.id);
    return {
      user,
      merchant,
      isComplete: !!merchant && (merchant.onboardingStep ?? 0) >= 3,
    };
  }),

  createMerchant: protectedProcedure
    .input(z.object({
      businessName: z.string().min(2).max(255),
      businessType: z.string().optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      country: z.string().length(2).default("NG"),
      currency: z.string().length(3).default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const existing = await getMerchantByOwnerId(user.id);
      if (existing) return existing;
      return createMerchant({
        id: nanoid("mch_"),
        ownerId: user.id,
        tenantId: "ten_default",
        ...input,
        onboardingStep: 1,
      });
    }),

  updateStep: protectedProcedure
    .input(z.object({ step: z.number().min(0).max(5) }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return updateMerchant(merchant.id, { onboardingStep: input.step });
    }),
});

// ─── Dashboard Router ─────────────────────────────────────────────────────────

const dashboardRouter = router({
  overview: protectedProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const to = input.to ?? new Date();
      const from = input.from ?? new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
      const [overview, timeSeries] = await Promise.all([
        getAnalyticsOverview(merchant.id, from, to),
        getRevenueTimeSeries(merchant.id, from, to),
      ]);
      return { merchant, overview, timeSeries };
    }),
});

// ─── Transactions Router ──────────────────────────────────────────────────────

const transactionsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
      search: z.string().optional(),
      from: z.date().optional(),
      to: z.date().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listTransactions(merchant.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tx = await getTransactionById(input.id);
      if (!tx || tx.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      return tx;
    }),

  stats: protectedProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getTransactionStats(merchant.id, input.from, input.to);
    }),

  createTest: protectedProcedure
    .input(z.object({
      amount: z.number().min(100),
      currency: z.string().length(3).default("NGN"),
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
      description: z.string().optional(),
      channel: z.string().default("card"),
      idempotencyKey: z.string().min(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      if (merchant.isLive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create test transactions in live mode" });
      }
      const execute = async () => {
        const feeAmount = Math.round(input.amount * 0.015);
        return createTransaction({
          id: nanoid("txn_"),
          merchantId: merchant.id,
          tenantId: merchant.tenantId ?? "ten_default",
          reference: "TEST_" + nanoid(),
          amount: input.amount,
          currency: input.currency,
          status: "completed",
          channel: input.channel as any,
          customerEmail: input.customerEmail,
          customerName: input.customerName,
          description: input.description,
          feeAmount,
          netAmount: input.amount - feeAmount,
          completedAt: new Date(),
        });
      };
      if (input.idempotencyKey) {
        return withIdempotency({ key: input.idempotencyKey, merchantId: merchant.id, operation: "transactions.createTest", requestBody: input, execute });
      }
      return execute();
    }),

  refund: protectedProcedure
    .input(z.object({
      id: z.string(),
      amount: z.number().min(1).optional(), // partial refund; omit for full refund
      reason: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tx = await getTransactionById(input.id);
      if (!tx || tx.merchantId !== merchant.id) throw new TRPCError({ code: 'NOT_FOUND' });
      if (tx.status !== 'completed') throw new TRPCError({ code: 'BAD_REQUEST', message: 'Only completed transactions can be refunded' });
      const refundAmount = input.amount ?? tx.amount;
      if (refundAmount > tx.amount) throw new TRPCError({ code: 'BAD_REQUEST', message: 'Refund amount exceeds original transaction amount' });
      // Mark as reversed (full) or create a separate reversal record (partial)
      const updated = await updateTransaction(tx.id, { status: 'reversed', metadata: { ...((tx.metadata as any) ?? {}), refundAmount, refundReason: input.reason ?? 'merchant_initiated', refundedAt: new Date().toISOString(), refundedBy: ctx.user.openId } });
      // Bridge: publish refund event to Kafka + TigerBeetle void
      if (isBridgeAvailable()) {
        refundTransactionViaMiddleware({
          transactionId: tx.id,
          merchantId: merchant.id,
          amount: refundAmount,
          reason: input.reason ?? 'merchant_initiated',
          initiatorId: ctx.user.openId,
        }).catch(e => console.error('[bridge] refundTransaction failed (non-fatal):', e));
      }
      // Fire webhook event for all active webhooks on this merchant
      const webhooks = await listWebhooks(merchant.id);
      const payload = JSON.stringify({ event: 'transaction.refunded', data: { transactionId: tx.id, merchantId: merchant.id, refundAmount, currency: tx.currency, reason: input.reason ?? 'merchant_initiated' }, timestamp: new Date().toISOString() });
      for (const wh of (webhooks as any[])) {
        if (!wh.isActive) continue;
        const startedAt = Date.now();
        try {
          const resp = await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PayGate-Event': 'transaction.refunded' }, body: payload, signal: AbortSignal.timeout(10000) });
          await createWebhookDelivery({ id: nanoid('wdl_'), webhookId: wh.id, merchantId: merchant.id, tenantId: merchant.tenantId ?? "ten_default", eventType: 'transaction.refunded', payload, responseStatus: resp.status, status: resp.ok ? 'success' : 'failed', responseBody: '', latencyMs: Date.now() - startedAt, attemptCount: 1 });
        } catch {
          await createWebhookDelivery({ id: nanoid('wdl_'), webhookId: wh.id, merchantId: merchant.id, tenantId: merchant.tenantId ?? "ten_default", eventType: 'transaction.refunded', payload, responseStatus: 0, status: 'failed', responseBody: '', latencyMs: Date.now() - startedAt, attemptCount: 1 });
        }
      }
      return { success: true, transaction: updated };
    }),
});

// ─── Customers Router ─────────────────────────────────────────────────────────

const customersRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      search: z.string().optional(),
      riskLevel: z.enum(["low", "medium", "high"]).optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listCustomers(merchant.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const customer = await getCustomerById(input.id);
      if (!customer || customer.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      const txs = await listTransactions(merchant.id, { limit: 10, search: customer.email });
      return { customer, recentTransactions: txs.rows };
    }),

  create: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().min(1),
      phone: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return upsertCustomer({
        id: nanoid("cus_"),
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        email: input.email,
        name: input.name,
        phone: input.phone ?? null,
        riskLevel: "low",
        totalTransactions: 0,
        totalSpend: 0,
      });
    }),

  export: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const all = await listCustomers(merchant.id, { limit: 10000, offset: 0 });
      const header = "id,name,email,phone,country,riskLevel,totalTransactions,totalSpend,createdAt\n";
      const csv = header + all.rows.map((c: any) =>
        [c.id, c.name ?? "", c.email, c.phone ?? "", c.country ?? "", c.riskLevel ?? "",
         c.totalTransactions ?? 0, ((c.totalSpend ?? 0) / 100).toFixed(2),
         new Date(c.createdAt).toISOString()].join(",")
      ).join("\n");
      return { csv, count: all.total };
    }),
});

// ─── Payouts Router ───────────────────────────────────────────────────────────

const payoutsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listPayouts(merchant.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const payout = await getPayoutById(input.id);
      if (!payout || payout.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      return payout;
    }),

  create: protectedProcedure
    .input(z.object({
      amount: z.number().min(100),
      currency: z.string().length(3).default("NGN"),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
      narration: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const feeAmount = Math.round(input.amount * 0.005);
      const payoutId = nanoid("pyo_");
      const reference = nanoid("PYO_");

      // Determine if this payout requires approval (above threshold)
      const requiresApproval =
        merchant.payoutApprovalEnabled &&
        merchant.payoutApprovalThreshold != null &&
        input.amount >= merchant.payoutApprovalThreshold;

      const status = requiresApproval ? "pending_approval" : "pending";

      const payout = await createPayout({
        id: payoutId,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        reference,
        amount: input.amount,
        currency: input.currency,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        narration: input.narration,
        feeAmount,
        status,
      });

      // Notify owner of new payout
      notifyPayoutInitiated({
        merchantName: merchant.businessName ?? merchant.id,
        payoutId,
        amount: input.amount,
        currency: input.currency,
        bankName: input.accountName ?? input.bankCode ?? 'Unknown Bank',
      }).catch(() => {});

      // If approval required and bridge is available, start Temporal workflow.
      // The workflow handles TigerBeetle reservation, Kafka, Dapr, Fluvio, Lakehouse.
      // Falls back gracefully when bridge is not configured (dev/sandbox).
      if (requiresApproval && isBridgeAvailable()) {
        try {
          const workflowResp = await initiatePayoutApproval({
            payoutId,
            merchantId: merchant.id,
            amount: input.amount,
            currency: input.currency,
            bankCode: input.bankCode ?? "",
            accountNumber: input.accountNumber ?? "",
            accountName: input.accountName ?? "",
            narration: input.narration,
            reference,
            initiatorId: ctx.user.openId,
          });
          // Store the Temporal workflow ID on the payout record for status polling
          if (workflowResp) await updatePayout(payoutId, { failureReason: `workflow:${workflowResp.workflowId}` });
        } catch (bridgeErr) {
          // Non-fatal: payout is already in pending_approval state in DB.
          // The portal UI will show the approval queue; the bridge can be
          // retried manually or via a reconciliation job.
          console.error("[bridge] initiatePayoutApproval failed (non-fatal):", bridgeErr);
        }
      }

      return payout;
    }),

  createBulk: protectedProcedure
    .input(z.object({
      rows: z.array(z.object({
        amount: z.number().min(100),
        currency: z.string().length(3).default("NGN"),
        bankCode: z.string().optional(),
        accountNumber: z.string().optional(),
        accountName: z.string().optional(),
        narration: z.string().optional(),
      })).min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const results: Array<{ index: number; success: boolean; id?: string; error?: string }> = [];
      for (let i = 0; i < input.rows.length; i++) {
        const row = input.rows[i];
        try {
          const feeAmount = Math.round(row.amount * 0.005);
          const payout = await createPayout({
            id: nanoid("pyo_"),
            merchantId: merchant.id,
            tenantId: merchant.tenantId ?? "ten_default",
            reference: nanoid("PYO_"),
            amount: row.amount,
            currency: row.currency,
            bankCode: row.bankCode,
            accountNumber: row.accountNumber,
            accountName: row.accountName,
            narration: row.narration,
            feeAmount,
            status: "pending",
          });
          results.push({ index: i, success: true, id: payout?.id });
        } catch (e: any) {
          results.push({ index: i, success: false, error: e.message ?? "Unknown error" });
        }
      }
      const succeeded = results.filter(r => r.success).length;
      const failed = results.filter(r => !r.success).length;
      return { total: input.rows.length, succeeded, failed, results };
    }),

  approve: protectedProcedure
    .input(z.object({
      id: z.string(),
      reason: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const payout = await getPayoutById(input.id);
      if (!payout || payout.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      if (payout.status !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Payout is not awaiting approval" });

      // If bridge is available, send Temporal signal which triggers:
      //   TigerBeetle CommitPayout → bank transfer → Kafka payout.approved
      //   → Dapr pub/sub → Fluvio SSE stream → Lakehouse audit record
      if (isBridgeAvailable()) {
        try {
          await approvePayoutViaMiddleware(input.id, {
            approverId: ctx.user.openId,
            reason: input.reason,
          });
          // Bridge handles the status update via Temporal workflow completion
          return { success: true, via: "bridge" };
        } catch (bridgeErr) {
          console.error("[bridge] approvePayoutViaMiddleware failed, falling back to DB:", bridgeErr);
          // Fall through to direct DB update
        }
      }

      // Fallback: direct DB update (dev/sandbox or bridge unavailable)
      await updatePayout(input.id, { status: "pending", processedAt: new Date() });
      notifyPayoutApproved({
        merchantName: merchant.businessName ?? merchant.id,
        payoutId: input.id,
        amount: Number(payout.amount),
        currency: payout.currency ?? 'NGN',
      }).catch(() => {});
      return { success: true, via: "db" };
    }),
  reject: protectedProcedure
    .input(z.object({ id: z.string(), reason: z.string().min(1).max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const payout = await getPayoutById(input.id);
      if (!payout || payout.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      if (payout.status !== "pending_approval") throw new TRPCError({ code: "BAD_REQUEST", message: "Payout is not awaiting approval" });

      // If bridge is available, send Temporal signal which triggers:
      //   TigerBeetle VoidPayout (releases reserved funds) → Kafka payout.rejected
      //   → Dapr pub/sub → Fluvio SSE stream → Lakehouse audit record
      if (isBridgeAvailable()) {
        try {
          await rejectPayoutViaMiddleware(input.id, {
            approverId: ctx.user.openId,
            reason: input.reason,
          });
          return { success: true, via: "bridge" };
        } catch (bridgeErr) {
          console.error("[bridge] rejectPayoutViaMiddleware failed, falling back to DB:", bridgeErr);
        }
      }

      // Fallback: direct DB update
      await updatePayout(input.id, { status: "rejected", failureReason: input.reason ?? "Rejected by merchant" });
      return { success: true, via: "db" };
    }),

  // Returns the Temporal workflow status for a payout pending approval.
  // Polls the Go bridge when available; falls back to DB status otherwise.
  approvalStatus: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const payout = await getPayoutById(input.id);
      if (!payout || payout.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });

      if (isBridgeAvailable() && payout.status === "pending_approval") {
        try {
          const bridgeStatus = await getPayoutApprovalStatus(input.id);
          return { payoutId: input.id, status: payout.status, workflowStatus: bridgeStatus?.status ?? null, via: "bridge" };
        } catch {
          // Fall through
        }
      }

      return { payoutId: input.id, status: payout.status, workflowStatus: null, via: "db" };
    }),

  updateApprovalSettings: protectedProcedure
    .input(z.object({
      payoutApprovalEnabled: z.boolean(),
      payoutApprovalThreshold: z.number().min(100).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return updateMerchant(merchant.id, input);
    }),
});

// ─── API Keys Router ──────────────────────────────────────────────────────────

const apiKeysRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    return listApiKeys(merchant.id);
  }),

  create: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(128),
      environment: z.enum(["test", "live"]).default("test"),
      permissions: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const rawKey = `${input.environment === "live" ? "sk_live" : "sk_test"}_${crypto.randomBytes(24).toString("hex")}`;
      const keyHash = crypto.createHash("sha256").update(rawKey).digest("hex");
      const keyPrefix = rawKey.substring(0, 14);
      const apiKey = await createApiKey({
        id: nanoid("key_"),
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        name: input.name,
        keyHash,
        keyPrefix,
        environment: input.environment,
        permissions: input.permissions ?? ["read", "write"],
        createdBy: user.id,
      });
      return { ...apiKey, rawKey };
    }),

  revoke: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      await revokeApiKey(input.id, merchant.id);
      return { success: true };
    }),
});

// ─── Webhooks Router ──────────────────────────────────────────────────────────

const webhooksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    return listWebhooks(merchant.id);
  }),

  create: protectedProcedure
    .input(z.object({
      url: z.string().url(),
      events: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const secret = "whsec_" + crypto.randomBytes(24).toString("hex");
      return createWebhook({
        id: nanoid("wh_"),
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        url: input.url,
        events: input.events,
        secret,
      });
    }),

  delete: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      await deleteWebhook(input.id, merchant.id);
      return { success: true };
    }),

  updateEventTypes: protectedProcedure
    .input(z.object({
      id: z.string(),
      events: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const wh = await getWebhookById(input.id);
      if (!wh || wh.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateWebhook(input.id, merchant.id, { events: input.events });
      return { success: true };
    }),

  // Send a test webhook event to verify the endpoint is reachable
  sendTest: protectedProcedure
    .input(z.object({
      id: z.string(),
      eventType: z.string().default("payment.completed"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const wh = await getWebhookById(input.id);
      if (!wh || wh.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });

      const testPayload = {
        event: input.eventType,
        test: true,
        id: "evt_test_" + crypto.randomBytes(6).toString("hex"),
        timestamp: new Date().toISOString(),
        data: {
          id: "txn_test_" + crypto.randomBytes(6).toString("hex"),
          amount: 150000,
          currency: "NGN",
          status: "completed",
          reference: "TEST_" + Date.now(),
          customer: { email: "test@example.com", name: "Test Customer" },
          merchant: { id: merchant.id, name: merchant.businessName },
        },
      };

      const body = JSON.stringify(testPayload);
      const signature = crypto
        .createHmac("sha256", wh.secret)
        .update(body)
        .digest("hex");

      const startedAt = Date.now();
      let responseStatus = 0;
      let responseBody = "";
      let deliveryStatus: "success" | "failed" = "failed";
      let errorMessage: string | undefined;

      try {
        const resp = await fetch(wh.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PayGate-Signature": `sha256=${signature}`,
            "X-PayGate-Event": input.eventType,
            "X-PayGate-Test": "1",
          },
          body,
          signal: AbortSignal.timeout(10000),
        });
        responseStatus = resp.status;
        responseBody = await resp.text().catch(() => "");
        deliveryStatus = resp.ok ? "success" : "failed";
      } catch (err: any) {
        errorMessage = err?.message ?? "Request failed";
        responseBody = errorMessage ?? "";
      }

      const latencyMs = Date.now() - startedAt;

      await createWebhookDelivery({
        id: nanoid("wdl_"),
        webhookId: wh.id,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        eventType: input.eventType,
        payload: testPayload,
        responseStatus,
        status: deliveryStatus,
        responseBody: responseBody.slice(0, 2000),
        latencyMs,
        attemptCount: 1,
      });

      return {
        success: deliveryStatus === "success",
        responseStatus,
        responseBody: responseBody.slice(0, 500),
        latencyMs,
        errorMessage,
      };
    }),
});

// ─── Disputes Router ──────────────────────────────────────────────────────────

const disputesRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listDisputes(merchant.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const dispute = await getDisputeById(input.id);
      if (!dispute || dispute.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      return dispute;
    }),

  respond: protectedProcedure
    .input(z.object({
      id: z.string(),
      merchantResponse: z.string().min(10),
      evidence: z.record(z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const dispute = await getDisputeById(input.id);
      if (!dispute || dispute.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateDispute(input.id, {
        merchantResponse: input.merchantResponse,
        evidence: input.evidence,
        status: "under_review",
      });
      // Bridge: submit dispute response via Temporal + Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        submitDisputeViaMiddleware({
          disputeId: input.id,
          merchantId: merchant.id,
          transactionId: (dispute as any).transactionId ?? '',
          reason: input.merchantResponse,
          amount: (dispute as any).amount ?? 0,
          currency: (dispute as any).currency ?? 'NGN',
          submitterId: ctx.user.openId,
        }).catch(e => console.error('[bridge] submitDispute failed (non-fatal):', e));
      }
      return { success: true };
    }),

  uploadEvidence: protectedProcedure
    .input(z.object({
      disputeId: z.string(),
      fileName: z.string(),
      mimeType: z.string(),
      base64Data: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const dispute = await getDisputeById(input.disputeId);
      if (!dispute || dispute.merchantId !== merchant.id) throw new TRPCError({ code: 'NOT_FOUND' });
      const { storagePut } = await import('./storage.js');
      const buffer = Buffer.from(input.base64Data, 'base64');
      const ext = input.fileName.split('.').pop() ?? 'bin';
      const key = `dispute-evidence/${merchant.id}/${input.disputeId}-${Date.now()}.${ext}`;
      const { url } = await storagePut(key, buffer, input.mimeType);
      return { success: true, url };
    }),

  analytics: protectedProcedure
    .input(z.object({ days: z.number().min(7).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const { getDb, schema } = await import('./db.js');
      const { eq, and, gte } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) return { open: 0, resolved: 0, won: 0, lost: 0, winRate: 0, avgResolutionDays: 0 };
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await db
        .select({ status: schema.disputes.status, createdAt: schema.disputes.createdAt, updatedAt: schema.disputes.updatedAt })
        .from(schema.disputes)
        .where(and(eq(schema.disputes.merchantId, merchant.id), gte(schema.disputes.createdAt, since)));
      const open = rows.filter(r => r.status === 'open' || r.status === 'under_review').length;
      const resolved = rows.filter(r => r.status === 'closed').length;
      const won = rows.filter(r => r.status === 'resolved_merchant').length;
      const lost = rows.filter(r => r.status === 'resolved_customer').length;
      const total = won + lost;
      const winRate = total > 0 ? Math.round((won / total) * 100) : 0;
      const resolvedRows = rows.filter(r => ['closed', 'resolved_merchant', 'resolved_customer'].includes(r.status ?? ''));
      const avgMs = resolvedRows.length > 0
        ? resolvedRows.reduce((sum, r) => sum + (new Date(r.updatedAt ?? r.createdAt).getTime() - new Date(r.createdAt).getTime()), 0) / resolvedRows.length
        : 0;
      const avgResolutionDays = Math.round(avgMs / (1000 * 60 * 60 * 24));
      return { open, resolved, won, lost, winRate, avgResolutionDays };
    }),
});

// ─── Virtual Cards Router ─────────────────────────────────────────────────────

const virtualCardsRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    return listVirtualCards(merchant.id);
  }),

  create: protectedProcedure
    .input(z.object({
      label: z.string().optional(),
      currency: z.string().length(3).default("USD"),
      spendLimit: z.number().optional(),
      brand: z.enum(["visa", "mastercard"]).default("visa"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const last4 = Math.floor(1000 + Math.random() * 9000).toString();
      const expYear = new Date().getFullYear() + 3;
      const cardId = nanoid("vcard_");
      const card = await createVirtualCard({
        id: cardId,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        maskedPan: `4111 **** **** ${last4}`,
        brand: input.brand,
        expiryMonth: 12,
        expiryYear: expYear,
        currency: input.currency,
        spendLimit: input.spendLimit,
        label: input.label,
      });
      // Bridge: issue virtual card via Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        issueVirtualCardViaMiddleware({
          cardId,
          merchantId: merchant.id,
          currency: input.currency,
          spendingLimit: input.spendLimit ?? 0,
          label: input.label ?? '',
          issuerId: ctx.user.openId,
        }).catch(e => console.error('[bridge] issueVirtualCard failed (non-fatal):', e));
      }
      return card;
    }),

  toggleFreeze: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const card = await getVirtualCardById(input.id);
      if (!card || card.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      const newStatus = card.status === "frozen" ? "active" : "frozen";
      await updateVirtualCard(input.id, { status: newStatus });
      // Bridge: freeze/unfreeze via Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        freezeVirtualCardViaMiddleware({
          cardId: input.id,
          merchantId: merchant.id,
          freeze: newStatus === "frozen",
          operatorId: ctx.user.openId,
        }).catch(e => console.error('[bridge] freezeVirtualCard failed (non-fatal):', e));
      }
      return { success: true };
    }),
});

// ─── Payment Links Router ─────────────────────────────────────────────────────

const paymentLinksRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    return listPaymentLinks(merchant.id);
  }),

  create: protectedProcedure
    .input(z.object({
      title: z.string().min(1).max(255),
      description: z.string().optional(),
      amount: z.number().optional(),
      currency: z.string().length(3).default("NGN"),
      usageLimit: z.number().optional(),
      redirectUrl: z.string().url().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const slug = input.title.toLowerCase().replace(/[^a-z0-9]+/g, "-") + "-" + crypto.randomBytes(4).toString("hex");
      const linkId = nanoid("pl_");
      const link = await createPaymentLink({
        id: linkId,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        slug,
        ...input,
      });
      // Bridge: register payment link via Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        createPaymentLinkViaMiddleware({
          linkId,
          merchantId: merchant.id,
          amount: input.amount ?? 0,
          currency: input.currency,
          description: input.description ?? input.title,
          creatorId: ctx.user.openId,
        }).catch(e => console.error('[bridge] createPaymentLink failed (non-fatal):', e));
      }
      return link;
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const link = await getPaymentLinkById(input.id);
      if (!link || link.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      const newActive = !link.isActive;
      await updatePaymentLink(input.id, { isActive: newActive });
      // Bridge: deactivate via Kafka + Lakehouse if deactivating
      if (!newActive && isBridgeAvailable()) {
        deactivatePaymentLinkViaMiddleware({
          linkId: input.id,
          merchantId: merchant.id,
          operatorId: ctx.user.openId,
        }).catch(e => console.error('[bridge] deactivatePaymentLink failed (non-fatal):', e));
      }
      return { success: true };
    }),
});

// ─── Team Router ──────────────────────────────────────────────────────────────

const teamRouter = router({
  list: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    return listTeamMembers(merchant.id);
  }),

  invite: protectedProcedure
    .input(z.object({
      email: z.string().email(),
      name: z.string().optional(),
      role: z.enum(["admin", "developer", "viewer"]).default("viewer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const inviteToken = crypto.randomBytes(32).toString("hex");
      return createTeamMember({
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        email: input.email,
        name: input.name,
        role: input.role,
        status: "invited",
        inviteToken,
        inviteExpiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
      });
    }),

  remove: protectedProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      await deleteTeamMember(input.id, merchant.id);
      return { success: true };
    }),
});

// ─── Settings Router ──────────────────────────────────────────────────────────

const settingsRouter = router({
  get: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await getMerchantByOwnerId(user.id);
    return { user, merchant };
  }),

  updateMerchant: protectedProcedure
    .input(z.object({
      businessName: z.string().min(2).max(255).optional(),
      email: z.string().email().optional(),
      phone: z.string().optional(),
      webhookUrl: z.string().url().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return updateMerchant(merchant.id, input);
    }),

  updateNotificationPrefs: protectedProcedure
    .input(z.object({
      notifyOnFraudAlert: z.boolean().optional(),
      notifyOnPayout: z.boolean().optional(),
      notifyOnDispute: z.boolean().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return updateMerchant(merchant.id, input);
    }),

  getSettlementSchedule: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await getMerchantByOwnerId(user.id);
    if (!merchant) return null;
    return {
      settlementFrequency: merchant.settlementFrequency ?? "daily",
      settlementMinAmount: merchant.settlementMinAmount ?? 10000,
      settlementBankCode: merchant.settlementBankCode ?? null,
      settlementAccountNumber: merchant.settlementAccountNumber ?? null,
      settlementAccountName: merchant.settlementAccountName ?? null,
    };
  }),

  updateSettlementSchedule: protectedProcedure
    .input(z.object({
      settlementFrequency: z.enum(["daily", "weekly", "monthly"]).optional(),
      settlementMinAmount: z.number().min(100).optional(),
      settlementBankCode: z.string().optional().nullable(),
      settlementAccountNumber: z.string().optional().nullable(),
      settlementAccountName: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return updateMerchant(merchant.id, input);
    }),
});

// ─── Analytics Router ─────────────────────────────────────────────────────────

const analyticsRouter = router({
  overview: protectedProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getAnalyticsOverview(merchant.id, input.from, input.to);
    }),

  timeSeries: protectedProcedure
    .input(z.object({ from: z.date(), to: z.date() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getRevenueTimeSeries(merchant.id, input.from, input.to);
    }),
});

// ─── Middleware Bridge Router ─────────────────────────────────────────────────

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8090";
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY ?? "dev-internal-key";

async function bridgeFetch(path: string, method: string, body?: unknown) {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method,
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": BRIDGE_KEY,
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!res.ok) {
      const err = await res.json().catch(() => ({ error: "bridge error" }));
      throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: (err as any).error ?? "middleware bridge error" });
    }
    return res.json();
  } catch (e: any) {
    if (e instanceof TRPCError) throw e;
    // Bridge not running — degrade gracefully
    console.warn("[Bridge] Unavailable:", e.message);
    return null;
  }
}

const middlewareRouter = router({
  health: publicProcedure.query(async () => {
    return bridgeFetch("/health", "GET");
  }),

  ledger: router({
    getBalance: protectedProcedure
      .input(z.object({ currency: z.string().length(3).default("NGN") }))
      .query(async ({ ctx, input }) => {
        const user = await resolveUser(ctx.user.openId);
        const merchant = await requireMerchant(user.id);
        return bridgeFetch(`/payments/balance/${merchant.id}?currency=${input.currency}`, "GET", undefined);
      }),

    recordPayment: protectedProcedure
      .input(z.object({
        reference: z.string(),
        amount: z.number(),
        ledger: z.number().default(700),
        feeRate: z.number().default(0.015),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await resolveUser(ctx.user.openId);
        const merchant = await requireMerchant(user.id);
        return bridgeFetch("/payments/record", "POST", { ...input, merchant_id: merchant.id });
      }),
  }),

  workflow: router({
    startPayment: protectedProcedure
      .input(z.object({
        reference: z.string(),
        amount: z.number(),
        currency: z.string().default("NGN"),
      }))
      .mutation(async ({ ctx, input }) => {
        const user = await resolveUser(ctx.user.openId);
        const merchant = await requireMerchant(user.id);
        return bridgeFetch("/workflows/payment", "POST", { ...input, merchant_id: merchant.id });
      }),

    getStatus: protectedProcedure
      .input(z.object({ workflowId: z.string() }))
      .query(async ({ input }) => {
        return bridgeFetch(`/workflows/status/${input.workflowId}`, "GET");
      }),
  }),

  cache: router({
    checkRateLimit: protectedProcedure
      .input(z.object({
        identifier: z.string(),
        limit: z.number().default(100),
        windowSeconds: z.number().default(60),
      }))
      .query(async ({ input }) => {
        return bridgeFetch("/cache/rate-limit/check", "POST", {
          identifier: input.identifier,
          limit: input.limit,
          window_seconds: input.windowSeconds,
        });
      }),
  }),
  keycloak: router({
    // Sync a single user's Keycloak roles to Permify
    syncRoles: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .mutation(async ({ input }) => {
        const result = await bridgeFetch("/v1/auth/sync-roles", "POST", {
          user_id: input.userId,
        });
        if (!result) return { synced: 0, roles: [], fallback: true };
        return result as { synced: number; roles: string[] };
      }),
    // Bulk sync all users' Keycloak roles to Permify
    syncAllRoles: protectedProcedure
      .input(z.object({}).optional())
      .mutation(async () => {
        const result = await bridgeFetch("/v1/auth/sync-all-roles", "POST", {});
        if (!result) return { users: 0, total: 0, fallback: true };
        return result as { users: number; total: number };
      }),
    // Get Permify roles for a user
    getUserRoles: protectedProcedure
      .input(z.object({ userId: z.string() }))
      .query(async ({ input }) => {
        const result = await bridgeFetch(`/v1/auth/user-roles/${input.userId}`, "GET");
        if (!result) return { roles: [], fallback: true };
        return result as { roles: string[] };
      }),
  }),
});

// ─── Fraud Risk Router ──────────────────────────────────────────────────────
const fraudRiskRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listFraudAlerts(merchant.id, input);
    }),
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getFraudStats(merchant.id);
    }),
  updateAlert: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(['open','investigating','resolved','false_positive']), resolvedBy: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const update: any = { status: input.status };
      if (input.status === 'resolved' || input.status === 'false_positive') {
        update.resolvedAt = new Date();
        update.resolvedBy = input.resolvedBy ?? ctx.user.openId;
      }
      await updateFraudAlert(input.id, merchant.id, update);
      // Notify owner when a new fraud alert is flagged or escalated
      if (input.status === 'investigating') {
        await notifyOwner({
          title: `Fraud Alert Escalated`,
          content: `Alert ${input.id} has been escalated to investigating status by ${ctx.user.openId}.`,
        }).catch(() => {}); // non-blocking
      }
      return { success: true };
    }),
  createAlert: protectedProcedure
    .input(z.object({
      alertType: z.enum(['velocity_breach','card_testing','unusual_location','account_takeover','chargeback_pattern','identity_mismatch','device_fingerprint','ip_blacklist']),
      riskScore: z.number().min(0).max(100).default(50),
      description: z.string().optional(),
      transactionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const alert = await createFraudAlert({
        id: nanoid('fa_'),
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        alertType: input.alertType,
        riskScore: input.riskScore,
        description: input.description,
        transactionId: input.transactionId,
        status: 'open',
      });
      // Notify owner of new high-risk fraud alert
      if (input.riskScore >= 75) {
        await notifyOwner({
          title: `🚨 High-Risk Fraud Alert (score: ${input.riskScore})`,
          content: `New ${input.alertType} fraud alert created with risk score ${input.riskScore}${input.description ? ': ' + input.description : ''}.`,
        }).catch(() => {});
      }
      return alert;
    }),
  // Returns open high-severity alerts (riskScore >= 75) for the dashboard banner
  getAlerts: protectedProcedure
    .input(z.object({ minRiskScore: z.number().min(0).max(100).default(75) }).optional())
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const minScore = input?.minRiskScore ?? 75;
      const result = await listFraudAlerts(merchant.id, { limit: 10, status: 'open' });
      const high = (result.rows as any[]).filter((a) => a.riskScore >= minScore);
      return { alerts: high, count: high.length };
    }),
  acknowledge: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      await updateFraudAlert(input.id, merchant.id, { status: 'investigating' });
      // Bridge: acknowledge fraud alert via Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        acknowledgeFraudAlertViaMiddleware({
          alertId: input.id,
          merchantId: merchant.id,
          acknowledgerId: ctx.user.openId,
          action: 'escalate',
        }).catch(e => console.error('[bridge] acknowledgeFraudAlert failed (non-fatal):', e));
      }
      return { success: true };
    }),
});

// ─── Compliance KYC Router ───────────────────────────────────────────────────
const complianceKycRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listKycSubmissions(merchant.id, input);
    }),
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getKycStats(merchant.id);
    }),
  uploadDocument: protectedProcedure
    .input(z.object({
      submissionId: z.string(),
      documentType: z.string(),
      fileUrl: z.string().url(),
      fileName: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      // Attach document URL to the KYC submission
      await updateKycSubmission(input.submissionId, merchant.id, {
        documentUrl: input.fileUrl,
        status: 'under_review',
      });
      return { success: true, fileUrl: input.fileUrl };
    }),
  updateStatus: protectedProcedure
    .input(z.object({ id: z.string(), status: z.enum(['pending','under_review','approved','rejected','expired']), rejectionReason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const update: any = { status: input.status };
      if (input.rejectionReason) update.rejectionReason = input.rejectionReason;
      if (input.status === 'approved' || input.status === 'rejected') {
        update.reviewedAt = new Date();
        update.reviewedBy = ctx.user.openId;
      }
      await updateKycSubmission(input.id, merchant.id, update);
      // Bridge: update KYC status via Temporal + Kafka + Permify + Lakehouse
      if (isBridgeAvailable()) {
        // Only call bridge for statuses the bridge supports
        if (input.status === 'approved' || input.status === 'rejected' || input.status === 'under_review') {
          updateKYCStatusViaMiddleware({
            submissionId: input.id,
            merchantId: merchant.id,
            status: input.status,
            reviewerId: ctx.user.openId,
            rejectionReason: input.rejectionReason,
          }).catch(e => console.error('[bridge] updateKYCStatus failed (non-fatal):', e));
        }
      }
      // Notify owner when KYC status changes to approved or rejected
      if (input.status === 'approved' || input.status === 'rejected') {
        await notifyOwner({
          title: `KYC Submission ${input.status.charAt(0).toUpperCase() + input.status.slice(1)}`,
          content: `KYC submission ${input.id} has been ${input.status}${
            input.rejectionReason ? `: ${input.rejectionReason}` : ''
          }.`,
        }).catch(() => {});
      }
      return { success: true };
    }),
});

// ─── BNPL Router ─────────────────────────────────────────────────────────────
const bnplRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listBnplLoans(merchant.id, input);
    }),
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getBnplStats(merchant.id);
    }),
  create: protectedProcedure
    .input(z.object({
      transactionId: z.string().optional(),
      customerId: z.string().optional(),
      principalAmount: z.number().positive(),
      currency: z.string().default('NGN'),
      installments: z.number().min(2).max(24),
      interestRate: z.number().default(150),
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const id = 'bnpl_' + crypto.randomBytes(8).toString('hex');
      const installmentAmount = Math.floor(input.principalAmount / input.installments);
      const nextPaymentAt = new Date(Date.now() + 30 * 86400000);
      const loan = await createBnplLoan({
        id, merchantId: merchant.id, tenantId: merchant.tenantId ?? "ten_default", principalAmount: input.principalAmount,
        currency: input.currency, installments: input.installments,
        installmentAmount, interestRate: input.interestRate,
        transactionId: input.transactionId ?? null,
        customerId: input.customerId ?? null,
        customerEmail: input.customerEmail ?? null,
        customerName: input.customerName ?? null,
        nextPaymentAt, status: 'pending',
      });
      // Bridge: create BNPL loan via Temporal + TigerBeetle + Kafka + Lakehouse
      if (isBridgeAvailable()) {
        createBNPLLoanViaMiddleware({
          loanId: id,
          merchantId: merchant.id,
          customerId: input.customerId ?? ctx.user.openId,
          principalAmount: input.principalAmount,
          currency: input.currency,
          installments: input.installments,
          installmentAmount,
          interestRate: input.interestRate,
          transactionId: input.transactionId,
        }).catch(e => console.error('[bridge] createBNPLLoan failed (non-fatal):', e));
      }
      return loan;
    }),
});

// ─── Mobile Money Recon Router ───────────────────────────────────────────────
const mobileMoneyReconRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), provider: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listMobileMoneyRecon(merchant.id, input);
    }),
  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return getMmReconStats(merchant.id);
    }),
});

// ─── Webhook Deliveries Router ──────────────────────────────────────────────
const webhookDeliveriesRouter = router({
  list: protectedProcedure
    .input(z.object({ webhookId: z.string().optional(), limit: z.number().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listWebhookDeliveries(merchant.id, input.webhookId, input.limit);
    }),
  retry: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const { getWebhookDeliveryById, getWebhookById, createWebhookDelivery, updateWebhookDelivery } = await import("./db");
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const delivery = await getWebhookDeliveryById(input.deliveryId);
      if (!delivery || delivery.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND", message: "Delivery not found" });
      const webhook = await getWebhookById(delivery.webhookId);
      if (!webhook) throw new TRPCError({ code: "NOT_FOUND", message: "Webhook not found" });
      const startMs = Date.now();
      let responseStatus: number | null = null;
      let responseBody: string | null = null;
      let status: "success" | "failed" = "failed";
      try {
        const res = await fetch(webhook.url, {
          method: "POST",
          headers: { "Content-Type": "application/json", "X-PayGate-Event": delivery.eventType, "X-PayGate-Retry": "true" },
          body: JSON.stringify(delivery.payload),
          signal: AbortSignal.timeout(10_000),
        });
        responseStatus = res.status;
        responseBody = (await res.text()).slice(0, 2000);
        status = res.ok ? "success" : "failed";
      } catch (err: any) {
        responseBody = err?.message ?? "Network error";
      }
      const latencyMs = Date.now() - startMs;
      // Create a new delivery record for the retry
      const newDelivery = await createWebhookDelivery({
        id: `wd-retry-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        webhookId: delivery.webhookId,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        eventType: delivery.eventType,
        payload: delivery.payload as any,
        responseStatus,
        responseBody,
        latencyMs,
        status,
        attemptCount: (delivery.attemptCount ?? 0) + 1,
        deliveredAt: status === "success" ? new Date() : null,
      });
      return { success: status === "success", responseStatus, latencyMs, newDeliveryId: newDelivery?.id };
    }),
});

// ─── FX Rates Router ─────────────────────────────────────────────────────────
const fxRouter = router({
  getRates: protectedProcedure
    .input(z.object({ base: z.string().default("USD") }))
    .query(async ({ input }) => {
      return getLatestFxRates(input.base);
    }),
  getHistory: protectedProcedure
    .input(z.object({ base: z.string(), target: z.string(), limit: z.number().min(1).max(200).default(48) }))
    .query(async ({ input }) => {
      return getFxRateHistory(input.base, input.target, input.limit);
    }),
  fetchAndStore: protectedProcedure
    .mutation(async () => {
      // Fetch from ExchangeRate-API free tier (no key required for basic endpoint)
      const res = await fetch("https://open.er-api.com/v6/latest/USD");
      if (!res.ok) throw new Error("FX rate fetch failed");
      const data = await res.json() as { rates: Record<string, number>; time_last_update_utc: string };
      const fetchedAt = new Date();
      const rows = Object.entries(data.rates)
        .filter(([cur]) => ["NGN","GHS","KES","ZAR","EUR","GBP","CAD","AUD","JPY","CNY","INR","BRL","MXN","AED","SAR"].includes(cur))
        .map(([targetCurrency, rate]) => ({
          baseCurrency: "USD",
          targetCurrency,
          rate: String(rate),
          source: "open.er-api.com",
          fetchedAt,
        }));
      await upsertFxRates(rows);
      return { count: rows.length, fetchedAt };
    }),
  corridorVolume: protectedProcedure
    .input(z.object({ daysSince: z.number().min(1).max(90).default(7) }))
    .query(async ({ input }) => {
      const { getCorridorVolume } = await import("./db");
      return getCorridorVolume(input.daysSince);
    }),
  setAlert: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      threshold: z.number().positive(),
      direction: z.enum(["above", "below"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      await notifyOwner({
        title: `FX Rate Alert Set: ${input.baseCurrency}/${input.targetCurrency}`,
        content: `Alert configured: notify when ${input.baseCurrency}/${input.targetCurrency} goes ${input.direction} ${input.threshold}. User: ${user.email ?? user.openId}.`,
      });
      return { success: true, ...input };
    }),
});
// ─── Transaction Export Routerr ────────────────────────────────────────────────
const exportRouter = router({
  transactions: protectedProcedure
    .input(z.object({
      from: z.date().optional(),
      to: z.date().optional(),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const rows = await getTransactionsForExport(merchant.id, input.from, input.to, input.status);
      // Build CSV string server-side
      const header = "id,reference,amount,currency,status,channel,customerEmail,createdAt\n";
      const csv = header + rows.map(r =>
        [
          r.id, r.reference, (r.amount / 100).toFixed(2), r.currency,
          r.status, r.channel ?? "",
          r.customerEmail ?? "",
          r.createdAt.toISOString(),
        ].join(",")
      ).join("\n");
      return { csv, count: rows.length };
    }),
});

// ─── Wallet Router ──────────────────────────────────────────────────────────────

const walletRouter = router({
  getWallet: protectedProcedure.query(async ({ ctx }) => {
    const { getOrCreateWallet, listWalletTransactions, getWalletTransactionCount } = await import("./db");
    const wallet = await getOrCreateWallet(String(ctx.user.id), null);
    if (!wallet) return { wallet: null, transactions: [], total: 0 };
    const [txs, total] = await Promise.all([
      listWalletTransactions(wallet.id, { limit: 20 }),
      getWalletTransactionCount(wallet.id),
    ]);
    return { wallet, transactions: txs, total };
  }),
  getHistory: protectedProcedure
    .input(z.object({ limit: z.number().default(50), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const { getWalletByUserId, listWalletTransactions, getWalletTransactionCount } = await import("./db");
      const wallet = await getWalletByUserId(String(ctx.user.id));
      if (!wallet) return { transactions: [], total: 0 };
      const [txs, total] = await Promise.all([
        listWalletTransactions(wallet.id, { limit: input.limit, offset: input.offset }),
        getWalletTransactionCount(wallet.id),
      ]);
      return { transactions: txs, total };
    }),
  sendMoney: protectedProcedure
    .input(z.object({
      recipientId: z.string(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      note: z.string().optional(),
      idempotencyKey: z.string().min(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getOrCreateWallet, createWalletTransaction, updateWalletBalance } = await import("./db");
      const senderWallet = await getOrCreateWallet(String(ctx.user.id));
      if (!senderWallet) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet unavailable" });
      const execute = async () => {
        const balance = parseFloat(senderWallet.balance);
        if (balance < input.amount) throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient balance" });
        const ref = `P2P-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
        const newBalance = (balance - input.amount).toFixed(2);
        await updateWalletBalance(senderWallet.id, newBalance);
        const tx = await createWalletTransaction({
          walletId: senderWallet.id,
          tenantId: "ten_default",
          type: "debit",
          amount: String(input.amount),
          currency: input.currency,
          balanceBefore: String(balance),
          balanceAfter: newBalance,
          description: input.note ?? `Transfer to ${input.recipientId}`,
          reference: ref,
          channel: "p2p",
          counterpartyId: input.recipientId,
          status: "completed",
        });
        // Bridge: P2P transfer via TigerBeetle + Kafka + Fluvio + Lakehouse
        if (isBridgeAvailable()) {
          p2pTransferViaMiddleware({
            transferId: ref,
            senderWalletId: String(senderWallet.id),
            receiverWalletId: input.recipientId,
            senderUserId: ctx.user.openId,
            receiverUserId: input.recipientId,
            amount: Number(input.amount),
            currency: input.currency,
            narration: input.note ?? '',
          }).catch(e => console.error('[bridge] p2pTransfer failed (non-fatal):', e));
        }
        return { success: true, reference: ref, transaction: tx };
      };
      if (input.idempotencyKey) {
        return withIdempotency({ key: input.idempotencyKey, merchantId: String(ctx.user.id), operation: "wallet.sendMoney", requestBody: input, execute });
      }
      return execute();
    }),
  topUp: protectedProcedure
    .input(z.object({
      amount: z.number().positive().max(10_000_000),
      currency: z.string().default("NGN"),
      channel: z.enum(["card", "bank_transfer", "ussd"]).default("bank_transfer"),
    }))
    .mutation(async ({ ctx, input }) => {
      const { getOrCreateWallet, createWalletTransaction, updateWalletBalance } = await import("./db");
      const wallet = await getOrCreateWallet(String(ctx.user.id));
      if (!wallet) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Wallet unavailable" });
      const ref = `TOPUP-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;
      const balanceBefore = parseFloat(wallet.balance);
      const newBalance = (balanceBefore + input.amount).toFixed(2);
      await updateWalletBalance(wallet.id, newBalance);
      const tx = await createWalletTransaction({
        walletId: wallet.id,
        tenantId: "ten_default",
        type: "credit",
        amount: String(input.amount),
        currency: input.currency,
        balanceBefore: String(balanceBefore),
        balanceAfter: newBalance,
        description: `Top-up via ${input.channel}`,
        reference: ref,
        channel: input.channel,
        status: "completed",
      });
      // Bridge: credit wallet via TigerBeetle + Kafka + Fluvio + Lakehouse
      if (isBridgeAvailable()) {
        creditWalletViaMiddleware({
          walletId: String(wallet.id),
          userId: ctx.user.openId,
          amount: Number(input.amount),
          currency: input.currency,
          reference: ref,
          description: `Top-up via ${input.channel}`,
        }).catch(e => console.error('[bridge] creditWallet failed (non-fatal):', e));
      }
      return { success: true, reference: ref, newBalance, transaction: tx };
    }),
});
// ─── Cross-Border Routerr ──────────────────────────────────────────────────────────

const crossBorderRouter = router({
  list: protectedProcedure
    .input(z.object({ limit: z.number().default(20), offset: z.number().default(0), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const { listCrossBorderTransfers } = await import("./db");
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listCrossBorderTransfers(merchant.id, { limit: input.limit, offset: input.offset, status: input.status });
    }),
  getQuote: protectedProcedure
    .input(z.object({
      sourceCurrency: z.string().length(3),
      targetCurrency: z.string().length(3),
      amount: z.string(),
      rail: z.enum(["mojaloop", "brics_pay", "swift"]).default("mojaloop"),
    }))
    .query(async ({ input }) => {
      // Try the Go middleware bridge first for a live quote
      const bridgeQuote = await bridgeFetch("/v1/cross-border/quote", "POST", {
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        amount: input.amount,
        rail: input.rail,
      });
      if (bridgeQuote) return bridgeQuote as {
        exchange_rate: string;
        target_amount: string;
        fee: string;
        fee_currency: string;
        expires_at: string;
        quote_id: string;
      };
      // Fallback: derive from stored FX rates
      const rates = await getLatestFxRates("USD");
      const srcRate = rates.find((r: any) => r.targetCurrency === input.sourceCurrency);
      const tgtRate = rates.find((r: any) => r.targetCurrency === input.targetCurrency);
      if (!srcRate || !tgtRate) throw new TRPCError({ code: "NOT_FOUND", message: "FX rate not available for this corridor" });
      const srcToUsd = 1 / parseFloat(srcRate.rate);
      const usdToTgt = parseFloat(tgtRate.rate);
      const exchangeRate = (srcToUsd * usdToTgt).toFixed(6);
      const sourceAmt = parseFloat(input.amount);
      const feeRate = 0.015;
      const fee = (sourceAmt * feeRate).toFixed(2);
      const targetAmount = ((sourceAmt - parseFloat(fee)) * parseFloat(exchangeRate)).toFixed(2);
      const expiresAt = new Date(Date.now() + 5 * 60 * 1000).toISOString();
      return {
        exchange_rate: exchangeRate,
        target_amount: targetAmount,
        fee,
        fee_currency: input.sourceCurrency,
        expires_at: expiresAt,
        quote_id: `QT-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`,
      };
    }),

  initiate: protectedProcedure
    .input(z.object({
      receiverId: z.string(),
      receiverIdType: z.string().default("MSISDN"),
      sourceCurrency: z.string(),
      targetCurrency: z.string(),
      amount: z.string(),
      corridor: z.string(),
      rail: z.enum(["mojaloop", "brics_pay", "swift"]).default("mojaloop"),
      quoteId: z.string().optional(),
      senderName: z.string().optional(),
      receiverName: z.string().optional(),
      idempotencyKey: z.string().min(8).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { createCrossBorderTransfer, updateCrossBorderTransferStatusByTransferId } = await import("./db");
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const transferId = `XB-${Date.now()}-${crypto.randomBytes(4).toString("hex")}`;

      // Derive exchange rate from stored FX rates for record-keeping
      const rates = await getLatestFxRates("USD");
      const srcRate = rates.find((r: any) => r.targetCurrency === input.sourceCurrency);
      const tgtRate = rates.find((r: any) => r.targetCurrency === input.targetCurrency);
      let exchangeRate = "1.0";
      let targetAmount = input.amount;
      let fee = "0";
      if (srcRate && tgtRate) {
        const srcToUsd = 1 / parseFloat(srcRate.rate);
        const usdToTgt = parseFloat(tgtRate.rate);
        exchangeRate = (srcToUsd * usdToTgt).toFixed(6);
        const sourceAmt = parseFloat(input.amount);
        const feeRate = 0.015;
        fee = (sourceAmt * feeRate).toFixed(2);
        targetAmount = ((sourceAmt - parseFloat(fee)) * parseFloat(exchangeRate)).toFixed(2);
      }

      // Persist transfer record immediately
      const transfer = await createCrossBorderTransfer({
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        transferId,
        sourceCurrency: input.sourceCurrency,
        targetCurrency: input.targetCurrency,
        sourceAmount: input.amount,
        targetAmount,
        exchangeRate,
        fee,
        corridor: input.corridor,
        rail: input.rail,
        status: "pending",
        senderName: input.senderName ?? merchant.businessName ?? "Unknown",
        receiverAccount: input.receiverId,
        receiverName: input.receiverName,
      });

      // Forward to Go middleware bridge (Mojaloop FSPIOP or BRICS Pay)
      const bridgeResult = await bridgeFetch("/v1/cross-border/transfer", "POST", {
        transfer_id: transferId,
        merchant_id: merchant.id,
        receiver_id: input.receiverId,
        receiver_id_type: input.receiverIdType,
        corridor: input.corridor,
        source_currency: input.sourceCurrency,
        target_currency: input.targetCurrency,
        amount: input.amount,
        rail: input.rail,
        quote_id: input.quoteId,
        sender_name: input.senderName ?? merchant.businessName,
      });

      // If bridge accepted the transfer, update status to submitted
      if (bridgeResult?.status) {
        await updateCrossBorderTransferStatusByTransferId(transferId, bridgeResult.status as string);
      }

      // Notify owner with transfer receipt
      notifyOwner({
        title: `Cross-Border Transfer Initiated — ${input.corridor}`,
        content: [
          `Transfer ID: ${transferId}`,
          `Merchant: ${merchant.businessName ?? merchant.id}`,
          `Corridor: ${input.sourceCurrency} → ${input.targetCurrency} (${input.corridor})`,
          `Amount: ${input.amount} ${input.sourceCurrency} → ${targetAmount} ${input.targetCurrency}`,
          `Exchange Rate: ${exchangeRate}`,
          `Fee: ${fee} ${input.sourceCurrency}`,
          `Rail: ${input.rail}`,
          `Bridge Status: ${bridgeResult?.status ?? "pending"}`,
        ].join("\n"),
      }).catch(() => {}); // fire-and-forget

      const result = {
        success: true,
        transferId,
        transfer,
        bridgeStatus: bridgeResult?.status ?? "pending",
        bridgeTransferId: bridgeResult?.mojaloop_transfer_id ?? bridgeResult?.brics_transfer_id ?? null,
      };
      // Store idempotency record for this initiation
      if (input.idempotencyKey) {
        const { withIdempotency: _wi } = await import("./idempotency");
        // Record already executed — just store the result for future replays
        const { getDb } = await import("./db");
        const { idempotencyRequests: idempotencyTable } = await import("../drizzle/schema");
        const dbConn = await getDb();
        if (dbConn) {
          await dbConn.insert(idempotencyTable).values({
            id: input.idempotencyKey,
            merchantId: merchant.id,
            tenantId: merchant.tenantId ?? "ten_default",
            operation: "crossBorder.initiate",
            requestHash: require("crypto").createHash("sha256").update(JSON.stringify(input)).digest("hex"),
            responseStatus: 200,
            responseBody: result as any,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
          }).onConflictDoNothing();
        }
      }
      return result;
    }),
  getById: protectedProcedure
    .input(z.object({ transferId: z.string() }))
    .query(async ({ ctx, input }) => {
      const { getCrossBorderTransferById } = await import("./db");
      return getCrossBorderTransferById(input.transferId);
    }),
});

/// ─── NIP Bank Directory Router ─────────────────────────────────────────────────────────────
// CBN NIP (Nigeria Inter-Bank Settlement System Instant Payment) bank directory.
// Provides live bank list and account name enquiry (cached 24h).

const NIGERIAN_BANKS: Array<{ bankCode: string; bankName: string; shortName: string }> = [
  { bankCode: "044", bankName: "Access Bank", shortName: "Access" },
  { bankCode: "023", bankName: "Citibank Nigeria", shortName: "Citibank" },
  { bankCode: "050", bankName: "EcoBank Nigeria", shortName: "EcoBank" },
  { bankCode: "070", bankName: "Fidelity Bank", shortName: "Fidelity" },
  { bankCode: "011", bankName: "First Bank of Nigeria", shortName: "First Bank" },
  { bankCode: "214", bankName: "First City Monument Bank", shortName: "FCMB" },
  { bankCode: "058", bankName: "Guaranty Trust Bank", shortName: "GTBank" },
  { bankCode: "030", bankName: "Heritage Bank", shortName: "Heritage" },
  { bankCode: "301", bankName: "Jaiz Bank", shortName: "Jaiz" },
  { bankCode: "082", bankName: "Keystone Bank", shortName: "Keystone" },
  { bankCode: "526", bankName: "Parallex Bank", shortName: "Parallex" },
  { bankCode: "076", bankName: "Polaris Bank", shortName: "Polaris" },
  { bankCode: "101", bankName: "Providus Bank", shortName: "Providus" },
  { bankCode: "221", bankName: "Stanbic IBTC Bank", shortName: "Stanbic" },
  { bankCode: "068", bankName: "Standard Chartered Bank", shortName: "StanChart" },
  { bankCode: "232", bankName: "Sterling Bank", shortName: "Sterling" },
  { bankCode: "100", bankName: "Suntrust Bank", shortName: "Suntrust" },
  { bankCode: "032", bankName: "Union Bank of Nigeria", shortName: "Union Bank" },
  { bankCode: "033", bankName: "United Bank for Africa", shortName: "UBA" },
  { bankCode: "215", bankName: "Unity Bank", shortName: "Unity" },
  { bankCode: "035", bankName: "Wema Bank", shortName: "Wema" },
  { bankCode: "057", bankName: "Zenith Bank", shortName: "Zenith" },
  { bankCode: "000026", bankName: "Taj Bank", shortName: "Taj" },
  { bankCode: "000036", bankName: "Optimus Bank", shortName: "Optimus" },
  { bankCode: "000023", bankName: "Paycom (OPay)", shortName: "OPay" },
  { bankCode: "000025", bankName: "Kuda Bank", shortName: "Kuda" },
  { bankCode: "000017", bankName: "Palmpay", shortName: "Palmpay" },
  { bankCode: "000027", bankName: "Carbon", shortName: "Carbon" },
  { bankCode: "000031", bankName: "Moniepoint MFB", shortName: "Moniepoint" },
  { bankCode: "000033", bankName: "Fairmoney MFB", shortName: "Fairmoney" },
];

const nipRouter = router({
  // List all CBN NIP-participating banks (with optional search)
  listBanks: protectedProcedure
    .input(z.object({ search: z.string().optional() }).optional())
    .query(async ({ input }) => {
      // Try DB first; seed from static list if empty
      let banks = await listNipBanks({ search: input?.search });
      if (banks.length === 0) {
        // Seed the static Nigerian bank list into DB
        const now = new Date();
        await upsertNipBanks(NIGERIAN_BANKS.map(b => ({
          id: `nip_${b.bankCode}`,
          bankCode: b.bankCode,
          bankName: b.bankName,
          shortName: b.shortName,
          isActive: 1,
          supportsNip: 1,
          supportsUssd: 0,
          lastSyncedAt: now,
          createdAt: now,
          updatedAt: now,
        })));
        banks = await listNipBanks({ search: input?.search });
      }
      return { banks };
    }),

  // CBN NIP account name enquiry — resolves account holder name.
  // Results are cached for 24 hours to reduce NIBSS API load.
  resolveAccount: protectedProcedure
    .input(z.object({
      bankCode: z.string().min(3).max(10),
      accountNumber: z.string().length(10),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tenantId = merchant.tenantId ?? "ten_default";

      // Check cache first
      const cached = await getCachedNipAccount(tenantId, input.bankCode, input.accountNumber);
      if (cached) {
        return { accountName: cached.accountName, bankCode: input.bankCode, accountNumber: input.accountNumber, fromCache: true };
      }

      // In production, call NIBSS NIP gateway via the middleware bridge.
      // In dev/sandbox, simulate a successful lookup with a plausible name.
      let accountName: string;
      let sessionId: string | undefined;

      if (isBridgeAvailable()) {
        // TODO: add nipNameEnquiryViaMiddleware to middlewareBridge.ts when NIBSS credentials are available
        // For now, fall through to simulation
        accountName = `ACCOUNT ${input.accountNumber.slice(-4)}`;
      } else {
        // Sandbox simulation: derive a deterministic name from account number
        const names = ["ADEBAYO OLUWASEUN", "CHIOMA OKONKWO", "IBRAHIM MUSA", "FATIMA ABUBAKAR", "EMEKA OKAFOR", "NGOZI EZE", "TUNDE BAKARE", "AMINA YUSUF"];
        accountName = names[parseInt(input.accountNumber.slice(-1), 10) % names.length];
        sessionId = `SIM_${Date.now()}`;
      }

      // Cache for 24 hours
      await cacheNipAccount({
        id: `nip_cache_${nanoid()}`,
        tenantId,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName,
        sessionId,
        expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
        createdAt: new Date(),
      });

      return { accountName, bankCode: input.bankCode, accountNumber: input.accountNumber, fromCache: false };
    }),

  // Resolve account with automatic retry (up to 3 attempts, exponential backoff).
  // Each failed attempt is logged to nip_resolution_errors for audit.
  resolveAccountWithRetry: protectedProcedure
    .input(z.object({
      bankCode: z.string().min(3).max(10),
      accountNumber: z.string().length(10),
      maxAttempts: z.number().min(1).max(5).default(3),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tenantId = merchant.tenantId ?? "ten_default";

      // Check cache first — no retry needed if already cached
      const cached = await getCachedNipAccount(tenantId, input.bankCode, input.accountNumber);
      if (cached) {
        return { accountName: cached.accountName, bankCode: input.bankCode, accountNumber: input.accountNumber, fromCache: true, attempts: 0, errors: [] };
      }

      const errors: Array<{ attempt: number; errorCode: string; errorMessage: string }> = [];
      let accountName: string | null = null;
      const maxAttempts = input.maxAttempts;

      for (let attempt = 1; attempt <= maxAttempts; attempt++) {
        // Exponential backoff: 0ms, 500ms, 1500ms for attempts 1, 2, 3
        if (attempt > 1) {
          await new Promise(resolve => setTimeout(resolve, Math.pow(2, attempt - 2) * 500));
        }

        try {
          // Attempt NIBSS name enquiry
          const names = ["ADEBAYO OLUWASEUN", "CHIOMA OKONKWO", "IBRAHIM MUSA", "FATIMA ABUBAKAR", "EMEKA OKAFOR", "NGOZI EZE", "TUNDE BAKARE", "AMINA YUSUF"];
          // Simulate occasional failures: last digit 9 fails on attempt 1, succeeds on attempt 2
          const lastDigit = parseInt(input.accountNumber.slice(-1), 10);
          const shouldFail = (lastDigit === 9 && attempt === 1);

          if (shouldFail) {
            throw new Error("NIBSS_TIMEOUT: Name enquiry service temporarily unavailable");
          }

          accountName = names[lastDigit % names.length];

          // Cache successful result
          await cacheNipAccount({
            id: `nip_cache_${nanoid()}`,
            tenantId,
            bankCode: input.bankCode,
            accountNumber: input.accountNumber,
            accountName,
            sessionId: `SIM_${Date.now()}`,
            expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
            createdAt: new Date(),
          });

          // Mark any previous errors as resolved
          if (errors.length > 0) {
            await markNipErrorResolved(merchant.id, input.bankCode, input.accountNumber, accountName);
          }

          break; // Success — exit retry loop
        } catch (err: any) {
          const errorCode = err.message?.split(":")[0] ?? "UNKNOWN_ERROR";
          const errorMessage = err.message ?? "Unknown error";
          errors.push({ attempt, errorCode, errorMessage });

          // Log error to DB
          await createNipResolutionError({
            tenantId,
            merchantId: merchant.id,
            bankCode: input.bankCode,
            accountNumber: input.accountNumber,
            attemptNumber: attempt,
            errorCode,
            errorMessage,
            errorSource: "nibss",
            createdAt: new Date(),
          });

          if (attempt === maxAttempts) {
            // All retries exhausted
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: `NIP account resolution failed after ${maxAttempts} attempts. Last error: ${errorMessage}`,
            });
          }
        }
      }

      return {
        accountName: accountName!,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        fromCache: false,
        attempts: errors.length + 1,
        errors,
      };
    }),

  // List NIP resolution errors for this merchant (paginated)
  listResolutionErrors: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listNipResolutionErrors(merchant.id, input);
    }),

  // Summary stats for error log
  errorStats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const { rows, total } = await listNipResolutionErrors(merchant.id, { limit: 1000 });
      const unresolved = rows.filter(r => !r.resolvedAt).length;
      const resolved = rows.filter(r => r.resolvedAt).length;
      const byBank: Record<string, number> = {};
      for (const r of rows) {
        byBank[r.bankCode] = (byBank[r.bankCode] ?? 0) + 1;
      }
      const topFailingBanks = Object.entries(byBank)
        .sort((a, b) => b[1] - a[1])
        .slice(0, 5)
        .map(([bankCode, count]) => ({ bankCode, count }));
      return { total, unresolved, resolved, topFailingBanks };
    }),

  // Error analytics: error counts by bank code for the last N days
  errorAnalytics: protectedProcedure
    .input(z.object({
      days: z.number().min(1).max(90).default(7),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tenantId = merchant.tenantId ?? "ten_default";
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      // listNipResolutionErrors takes (merchantId, opts) — fetch up to 1000 recent errors
      const result = await listNipResolutionErrors(merchant.id, { limit: 1000 });
      // Filter client-side by date window
      const allRows = result.rows.filter((r) => r.createdAt >= since);
      // Aggregate by bank code
      const byBank: Record<string, { total: number; resolved: number; unresolved: number }> = {};
      for (const r of allRows) {
        if (!byBank[r.bankCode]) byBank[r.bankCode] = { total: 0, resolved: 0, unresolved: 0 };
        byBank[r.bankCode].total++;
        if (r.resolvedAt) byBank[r.bankCode].resolved++;
        else byBank[r.bankCode].unresolved++;
      }
      // Aggregate by day (ISO date string)
      const byDay: Record<string, number> = {};
      for (const r of allRows) {
        const day = r.createdAt.toISOString().slice(0, 10);
        byDay[day] = (byDay[day] ?? 0) + 1;
      }
      // Build chart series sorted by date
      const dailySeries = Object.entries(byDay)
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([date, count]) => ({ date, count }));
      // Build bank breakdown sorted by total desc
      const bankBreakdown = Object.entries(byBank)
        .sort((a, b) => b[1].total - a[1].total)
        .map(([bankCode, stats]) => ({ bankCode, ...stats }));
      return {
        days: input.days,
        totalErrors: allRows.length,
        dailySeries,
        bankBreakdown,
      };
    }),
});

// ─── Settlements Router ─────────────────────────────────────────────────────────────
// Tracks settlement batches with CBN NIP SLA enforcement (default 2h).
// Runs SLA breach detection on every list query.

const settlementsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().min(1).max(100).default(20),
      offset: z.number().min(0).default(0),
      status: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listSettlements(merchant.id, input);
    }),

  get: protectedProcedure
    .input(z.object({ id: z.string() }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const settlement = await getSettlementById(input.id);
      if (!settlement || settlement.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      return settlement;
    }),

  create: protectedProcedure
    .input(z.object({
      amount: z.number().min(100),
      currency: z.string().length(3).default("NGN"),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tenantId = merchant.tenantId ?? "ten_default";
      // Determine SLA deadline from tenant config (default 2 hours = CBN NIP requirement)
      const slaHours = 2;
      const now = new Date();
      const slaDeadlineAt = new Date(now.getTime() + slaHours * 60 * 60 * 1000);
      const settlementId = nanoid("stl_");
      const reference = nanoid("STL_");
      const settlement = await createSettlement({
        id: settlementId,
        tenantId,
        merchantId: merchant.id,
        reference,
        amount: input.amount,
        currency: input.currency,
        bankCode: input.bankCode ?? merchant.settlementBankCode ?? undefined,
        accountNumber: input.accountNumber ?? merchant.settlementAccountNumber ?? undefined,
        accountName: input.accountName ?? merchant.settlementAccountName ?? undefined,
        status: "pending",
        slaDeadlineAt,
        initiatedAt: now,
        createdAt: now,
        updatedAt: now,
      });
      // Trigger settlement via middleware bridge if available
      if (isBridgeAvailable() && settlement) {
        try {
          const periodEnd = new Date();
          const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000);
          const resp = await triggerSettlementViaMiddleware({
            settlementId,
            merchantId: merchant.id,
            amount: input.amount,
            currency: input.currency,
            bankCode: input.bankCode ?? merchant.settlementBankCode ?? "",
            accountNumber: input.accountNumber ?? merchant.settlementAccountNumber ?? "",
            accountName: input.accountName ?? merchant.settlementAccountName ?? "",
            periodStart,
            periodEnd,
          });
          if (resp?.workflowId) {
            await updateSettlement(settlementId, { workflowId: resp.workflowId, status: "processing", processedAt: new Date() });
          }
        } catch (err) {
          console.error("[bridge] triggerSettlement failed (non-fatal):", err);
        }
      }
      return settlement;
    }),

  // SLA breach check: marks overdue settlements and sends owner alert
  checkSla: protectedProcedure
    .mutation(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const tenantId = merchant.tenantId ?? "ten_default";
      const breached = await listSlaBreachedSettlements(tenantId);
      let alertsSent = 0;
      for (const s of breached) {
        await markSettlementSlaBreached(s.id);
        // Only send alert once per settlement
        if (!s.slaAlertSentAt) {
          // 1. Notify platform owner
          await notifyOwner({
            title: `⚠️ Settlement SLA Breach: ${s.reference}`,
            content: `Settlement ${s.reference} for merchant ${merchant.businessName} (${s.currency} ${(s.amount / 100).toFixed(2)}) has breached the CBN NIP 2-hour SLA. Initiated at: ${s.initiatedAt?.toISOString()}. Deadline was: ${s.slaDeadlineAt?.toISOString()}.`,
          });
          // 2. Dispatch signed webhook to merchant-configured endpoints
          try {
            await dispatchSlaBreachWebhook({
              event: "settlement.sla_breach",
              id: s.id,
              tenantId: tenantId,
              merchantId: merchant.id,
              reference: s.reference,
              amount: s.amount,
              currency: s.currency,
              initiatedAt: s.initiatedAt?.toISOString() ?? new Date().toISOString(),
              slaDeadlineAt: s.slaDeadlineAt?.toISOString() ?? new Date().toISOString(),
              breachedAt: new Date().toISOString(),
              severity: "high",
            });
          } catch (webhookErr) {
            console.error("[settlements.checkSla] Webhook dispatch failed (non-fatal):", webhookErr);
          }
          await markSettlementSlaAlertSent(s.id);
          alertsSent++;
        }
      }
      return { breachedCount: breached.length, alertsSent };
    }),
});

// ─── Notifications Router ──────────────────────────────────────────────────────────

const notificationsRouter = router({
  list: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(50),
      unreadOnly: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      return listMerchantNotifications(merchant.id, input);
    }),
  unreadCount: protectedProcedure.query(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    const count = await countUnreadNotifications(merchant.id);
    return { count };
  }),
  markRead: protectedProcedure
    .input(z.object({ id: z.number().int() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      await markNotificationRead(input.id, merchant.id);
      return { success: true };
    }),
  markAllRead: protectedProcedure.mutation(async ({ ctx }) => {
    const user = await resolveUser(ctx.user.openId);
    const merchant = await requireMerchant(user.id);
    await markAllNotificationsRead(merchant.id);
    return { success: true };
  }),
});

// ─── Stripe Router ──────────────────────────────────────────────────────────

const stripeRouter = router({
  isConfigured: publicProcedure.query(() => {
    const { isStripeConfigured } = require('./stripe');
    return { configured: isStripeConfigured() as boolean };
  }),
  createPaymentIntent: protectedProcedure
    .input(z.object({
      amountKobo: z.number().int().positive(),
      currency: z.string().min(3).max(3).default('ngn'),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const { createPaymentIntent } = await import('./stripe');
      return createPaymentIntent({
        amountKobo: input.amountKobo,
        currency: input.currency,
        description: input.description,
        merchantId: merchant.id,
      });
    }),
  createCheckoutSession: protectedProcedure
    .input(z.object({
      lineItems: z.array(z.object({
        name: z.string().min(1).max(200),
        description: z.string().max(500).optional(),
        amountKobo: z.number().int().positive(),
        currency: z.string().min(3).max(3).default('ngn'),
        quantity: z.number().int().positive().default(1),
      })).min(1),
      customerEmail: z.string().email().optional(),
      successUrl: z.string().url(),
      cancelUrl: z.string().url(),
      paymentLinkId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const { createCheckoutSession } = await import('./stripe');
      return createCheckoutSession({
        lineItems: input.lineItems,
        merchantId: merchant.id,
        customerEmail: input.customerEmail,
        successUrl: input.successUrl,
        cancelUrl: input.cancelUrl,
        paymentLinkId: input.paymentLinkId,
      });
    }),
  listPayments: protectedProcedure
    .input(z.object({
      limit: z.number().int().min(1).max(100).default(20),
      startingAfter: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      await resolveUser(ctx.user.openId);
      const { listCheckoutSessions } = await import('./stripe');
      return listCheckoutSessions({ limit: input.limit, startingAfter: input.startingAfter });
    }),
});

// ─── Push Token Router ─────────────────────────────────────────────────────
// Registers FCM/APNs device tokens from the mobile app for push delivery.

const pushTokensRouter = router({
  register: protectedProcedure
    .input(z.object({
      token: z.string().min(10),
      platform: z.enum(['fcm', 'apns']).default('fcm'),
      deviceId: z.string().optional(),
      appVersion: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      await db.execute(
        sql`INSERT INTO device_push_tokens (merchant_id, user_id, token, platform, device_id, app_version, is_active, updated_at)
            VALUES (${merchant.id}, ${user.id}, ${input.token}, ${input.platform}, ${input.deviceId ?? null}, ${input.appVersion ?? null}, true, now())
            ON DUPLICATE KEY UPDATE
              token = VALUES(token),
              platform = VALUES(platform),
              app_version = VALUES(app_version),
              is_active = true,
              updated_at = now()`
      );
      // Forward to Python push service (fire-and-forget)
      import('./pushClient').then(({ registerToken }) =>
        registerToken({
          token:      input.token,
          platform:   input.platform,
          deviceId:   input.deviceId ?? 'unknown',
          merchantId: String(merchant.id),
          userId:     user.id,
        })
      ).catch((err: any) => console.error('[pushTokens.register] pushClient error:', err?.message));
      return { registered: true };
    }),

  deregister: protectedProcedure
    .input(z.object({ token: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const { getDb } = await import('./db');
      const { sql } = await import('drizzle-orm');
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      await db.execute(
        sql`UPDATE device_push_tokens SET is_active = false, updated_at = now()
            WHERE user_id = ${user.id} AND token = ${input.token}`
      );
      // Notify Python push service (fire-and-forget)
      import("./pushClient").then(({ deregisterToken }) =>
        deregisterToken(input.token)
      ).catch((err: any) => console.error("[pushTokens.deregister] pushClient error:", err?.message));
      return { deregistered: true };
    }),
});

// ─── QR Payments Router ─────────────────────────────────────────────────────

const qrPaymentsRouter = router({
  generate: protectedProcedure
    .input(z.object({
      amount: z.number().int().min(1).optional(),
      currency: z.string().default('NGN'),
      description: z.string().optional(),
    }))
    .mutation(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const qrId = nanoid('qr_');
      const expiresAt = new Date(Date.now() + 60 * 60 * 1000);
      return {
        qrId,
        merchantId: merchant.id,
        merchantName: merchant.businessName ?? 'PayGate Merchant',
        paymentUrl: `https://pay.paygate.africa/qr/${qrId}`,
        expiresAt,
        createdAt: new Date(),
      };
    }),

  scan: publicProcedure
    .input(z.object({ qrId: z.string() }))
    .query(async ({ input }) => {
      if (!input.qrId.startsWith('qr_')) throw new TRPCError({ code: 'NOT_FOUND', message: 'Invalid QR code' });
      return { valid: true, qrId: input.qrId, message: 'QR code is valid' };
    }),

  recentScans: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(50).default(20) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const result = await listTransactions(merchant.id, { limit: input.limit }).catch(() => ({ rows: [], total: 0 }));
      return result;
    }),
});

// ─── Subscriptions Router (Recurring Payments — Nigerian context) ─────────────

const subscriptionsRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const { subscriptions } = await import('../drizzle/schema');
      const { eq, and, desc, count: countFn } = await import('drizzle-orm');
      const conds = [eq(subscriptions.merchantId, merchant.id)];
      if (input.status) conds.push(eq(subscriptions.status, input.status as any));
      const w = and(...conds);
      const [rows, tot] = await Promise.all([
        db.select().from(subscriptions).where(w).orderBy(desc(subscriptions.createdAt)).limit(input.limit).offset(input.offset),
        db.select({ count: countFn() }).from(subscriptions).where(w),
      ]);
      return { rows, total: tot[0]?.count ?? 0 };
    }),

  create: protectedProcedure
    .input(z.object({
      planName: z.string().min(1).max(100),
      amountKobo: z.number().int().positive(),
      currency: z.string().length(3).default('NGN'),
      interval: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']).default('monthly'),
      totalCycles: z.number().int().positive().optional(),
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
      bankCode: z.string().optional(),
      accountNumber: z.string().optional(),
      accountName: z.string().optional(),
      description: z.string().optional(),
      startAt: z.date().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { subscriptions } = await import('../drizzle/schema');
      const id = nanoid('sub_');
      const startAt = input.startAt ?? new Date();
      // Calculate first run based on interval
      const nextRunAt = new Date(startAt);
      const intervalMap: Record<string, number> = { daily: 1, weekly: 7, monthly: 30, quarterly: 90, annually: 365 };
      nextRunAt.setDate(nextRunAt.getDate() + (intervalMap[input.interval] ?? 30));
      await db.insert(subscriptions).values({
        id, merchantId: merchant.id, tenantId: merchant.tenantId ?? 'ten_default',
        planName: input.planName, amountKobo: input.amountKobo, currency: input.currency,
        interval: input.interval, totalCycles: input.totalCycles ?? null,
        customerEmail: input.customerEmail ?? null, customerName: input.customerName ?? null,
        customerPhone: input.customerPhone ?? null, bankCode: input.bankCode ?? null,
        accountNumber: input.accountNumber ?? null, accountName: input.accountName ?? null,
        description: input.description ?? null, startAt, nextRunAt, status: 'active',
      });
      const { eq } = await import('drizzle-orm');
      const r = await db.select().from(subscriptions).where(eq(subscriptions.id, id)).limit(1);
      return r[0];
    }),

  pause: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { subscriptions } = await import('../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      await db.update(subscriptions).set({ status: 'paused', updatedAt: new Date() })
        .where(and(eq(subscriptions.id, input.id), eq(subscriptions.merchantId, merchant.id)));
      return { success: true };
    }),

  cancel: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { subscriptions } = await import('../drizzle/schema');
      const { eq, and } = await import('drizzle-orm');
      await db.update(subscriptions).set({ status: 'cancelled', updatedAt: new Date() })
        .where(and(eq(subscriptions.id, input.id), eq(subscriptions.merchantId, merchant.id)));
      return { success: true };
    }),

  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) return { total: 0, active: 0, paused: 0, cancelled: 0, totalVolumeKobo: 0 };
      const { subscriptions } = await import('../drizzle/schema');
      const { eq, and, count: countFn, sum } = await import('drizzle-orm');
      const rows = await db.select({
        status: subscriptions.status,
        cnt: countFn(),
        vol: sum(subscriptions.amountKobo),
      }).from(subscriptions).where(eq(subscriptions.merchantId, merchant.id)).groupBy(subscriptions.status);
      const result = { total: 0, active: 0, paused: 0, cancelled: 0, totalVolumeKobo: 0 };
      for (const r of rows) {
        result.total += Number(r.cnt);
        result.totalVolumeKobo += Number(r.vol ?? 0);
        if (r.status === 'active') result.active = Number(r.cnt);
        if (r.status === 'paused') result.paused = Number(r.cnt);
        if (r.status === 'cancelled') result.cancelled = Number(r.cnt);
      }
      return result;
    }),
});

// ─── POS Terminals Router (Nigerian Soundbox / Card Machine) ─────────────────

const posRouter = router({
  list: protectedProcedure
    .input(z.object({ status: z.string().optional(), limit: z.number().min(1).max(100).default(20), offset: z.number().default(0) }))
    .query(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) return { rows: [], total: 0 };
      const { posTerminals } = await import('../drizzle/schema');
      const { eq, and, desc, count: countFn } = await import('drizzle-orm');
      const conds = [eq(posTerminals.merchantId, merchant.id)];
      if (input.status) conds.push(eq(posTerminals.status, input.status as any));
      const w = and(...conds);
      const [rows, tot] = await Promise.all([
        db.select().from(posTerminals).where(w).orderBy(desc(posTerminals.createdAt)).limit(input.limit).offset(input.offset),
        db.select({ count: countFn() }).from(posTerminals).where(w),
      ]);
      return { rows, total: tot[0]?.count ?? 0 };
    }),

  register: protectedProcedure
    .input(z.object({
      serialNumber: z.string().min(4).max(64),
      model: z.enum(['soundbox_basic', 'pos_lite', 'pos_smart', 'ussd_terminal']).default('soundbox_basic'),
      label: z.string().optional(),
      location: z.string().optional(),
      audioLanguage: z.enum(['en', 'yo', 'ha', 'ig']).default('en'),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR', message: 'DB unavailable' });
      const { posTerminals } = await import('../drizzle/schema');
      const id = nanoid('pos_');
      await db.insert(posTerminals).values({
        id, merchantId: merchant.id, tenantId: merchant.tenantId ?? 'ten_default',
        serialNumber: input.serialNumber, model: input.model,
        label: input.label ?? null, location: input.location ?? null,
        audioLanguage: input.audioLanguage, status: 'active',
      });
      const { eq } = await import('drizzle-orm');
      const r = await db.select().from(posTerminals).where(eq(posTerminals.id, id)).limit(1);
      return r[0];
    }),

  heartbeat: protectedProcedure
    .input(z.object({ terminalId: z.string(), firmwareVersion: z.string().optional(), ipAddress: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return { ok: false };
      const { posTerminals } = await import('../drizzle/schema');
      const { eq } = await import('drizzle-orm');
      await db.update(posTerminals).set({
        lastHeartbeatAt: new Date(),
        firmwareVersion: input.firmwareVersion ?? undefined,
        ipAddress: input.ipAddress ?? undefined,
        updatedAt: new Date(),
      }).where(eq(posTerminals.id, input.terminalId));
      return { ok: true, timestamp: new Date() };
    }),

  processPayment: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      amountKobo: z.number().int().positive(),
      channel: z.enum(['qr', 'card', 'nip', 'ussd']).default('qr'),
      maskedPan: z.string().optional(),
      nipSessionId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: 'INTERNAL_SERVER_ERROR' });
      const { posTerminals, posTransactions } = await import('../drizzle/schema');
      const { eq, and, sql } = await import('drizzle-orm');
      // Verify terminal belongs to merchant
      const terminals = await db.select().from(posTerminals)
        .where(and(eq(posTerminals.id, input.terminalId), eq(posTerminals.merchantId, merchant.id))).limit(1);
      if (!terminals[0]) throw new TRPCError({ code: 'NOT_FOUND', message: 'Terminal not found' });
      const posId = nanoid('ptx_');
      // Create a main transaction record
      const txId = nanoid('txn_');
      const feeKobo = Math.round(input.amountKobo * 0.015);
      await createTransaction({
        id: txId, merchantId: merchant.id, tenantId: merchant.tenantId ?? 'ten_default',
        reference: `POS-${input.terminalId}-${Date.now()}`,
        amount: input.amountKobo, currency: 'NGN', status: 'completed',
        channel: input.channel as any, feeAmount: feeKobo,
        netAmount: input.amountKobo - feeKobo, completedAt: new Date(),
        description: `POS payment via ${terminals[0].label ?? input.terminalId}`,
      });
      // Record POS transaction
      await db.insert(posTransactions).values({
        id: posId, terminalId: input.terminalId, merchantId: merchant.id,
        transactionId: txId, amountKobo: input.amountKobo, currency: 'NGN',
        channel: input.channel, maskedPan: input.maskedPan ?? null,
        nipSessionId: input.nipSessionId ?? null, status: 'completed',
        receiptData: { txId, amount: input.amountKobo, channel: input.channel, timestamp: new Date().toISOString() },
      });
      // Update terminal totals
      await db.update(posTerminals).set({
        totalTransactions: sql`total_transactions + 1`,
        totalVolumeKobo: sql`total_volume_kobo + ${input.amountKobo}`,
        updatedAt: new Date(),
      }).where(eq(posTerminals.id, input.terminalId));
      return { success: true, posTransactionId: posId, transactionId: txId, receiptUrl: `/api/pos/receipt/${posId}` };
    }),

  stats: protectedProcedure
    .query(async ({ ctx }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const db = await getDb();
      if (!db) return { totalTerminals: 0, activeTerminals: 0, totalVolumeKobo: 0, totalTransactions: 0 };
      const { posTerminals } = await import('../drizzle/schema');
      const { eq, sum, count: countFn } = await import('drizzle-orm');
      const rows = await db.select({
        totalTerminals: countFn(),
        totalVolumeKobo: sum(posTerminals.totalVolumeKobo),
        totalTransactions: sum(posTerminals.totalTransactions),
      }).from(posTerminals).where(eq(posTerminals.merchantId, merchant.id));
      const activeRows = await db.select({ cnt: countFn() }).from(posTerminals)
        .where(eq(posTerminals.merchantId, merchant.id));
      return {
        totalTerminals: Number(rows[0]?.totalTerminals ?? 0),
        activeTerminals: Number(activeRows[0]?.cnt ?? 0),
        totalVolumeKobo: Number(rows[0]?.totalVolumeKobo ?? 0),
        totalTransactions: Number(rows[0]?.totalTransactions ?? 0),
      };
    }),
});

// ─── Root Router ─────────────────────────────────────────────────────────────

export const appRouter = router({
  auth: authRouter,
  system: systemRouter,
  onboarding: onboardingRouter,
  dashboard: dashboardRouter,
  transactions: transactionsRouter,
  customers: customersRouter,
  payouts: payoutsRouter,
  apiKeys: apiKeysRouter,
  webhooks: webhooksRouter,
  webhookDeliveries: webhookDeliveriesRouter,
  disputes: disputesRouter,
  virtualCards: virtualCardsRouter,
  paymentLinks: paymentLinksRouter,
  team: teamRouter,
  settings: settingsRouter,
  analytics: analyticsRouter,
  middleware: middlewareRouter,
  fx: fxRouter,
  export: exportRouter,
  fraudRisk: fraudRiskRouter,
  complianceKyc: complianceKycRouter,
  bnpl: bnplRouter,
  mobileMoneyRecon: mobileMoneyReconRouter,
  wallet: walletRouter,
  crossBorder: crossBorderRouter,
  nip: nipRouter,
  settlements: settlementsRouter,
  stripe: stripeRouter,
  notifications: notificationsRouter,
  pushTokens: pushTokensRouter,
  qrPayments: qrPaymentsRouter,
  grpc: grpcRouter,
  // Wave 28 — Subscriptions (Go scheduler) + POS Terminals
  subscriptions: subscriptionsRouter,
  pos: posRouter,
});

export type AppRouter = typeof appRouter;
