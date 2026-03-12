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
} from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { notifyOwner } from "./_core/notification";
import { systemRouter } from "./_core/systemRouter";
import { withIdempotency } from "./idempotency";
import {
  isBridgeAvailable,
  initiatePayoutApproval,
  approvePayoutViaMiddleware,
  rejectPayoutViaMiddleware,
  getPayoutApprovalStatus,
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
      // Fire webhook event for all active webhooks on this merchant
      const webhooks = await listWebhooks(merchant.id);
      const payload = JSON.stringify({ event: 'transaction.refunded', data: { transactionId: tx.id, merchantId: merchant.id, refundAmount, currency: tx.currency, reason: input.reason ?? 'merchant_initiated' }, timestamp: new Date().toISOString() });
      for (const wh of (webhooks as any[])) {
        if (!wh.isActive) continue;
        const startedAt = Date.now();
        try {
          const resp = await fetch(wh.url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-PayGate-Event': 'transaction.refunded' }, body: payload, signal: AbortSignal.timeout(10000) });
          await createWebhookDelivery({ id: nanoid('wdl_'), webhookId: wh.id, merchantId: merchant.id, eventType: 'transaction.refunded', payload, responseStatus: resp.status, status: resp.ok ? 'success' : 'failed', responseBody: '', latencyMs: Date.now() - startedAt, attemptCount: 1 });
        } catch {
          await createWebhookDelivery({ id: nanoid('wdl_'), webhookId: wh.id, merchantId: merchant.id, eventType: 'transaction.refunded', payload, responseStatus: 0, status: 'failed', responseBody: '', latencyMs: Date.now() - startedAt, attemptCount: 1 });
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
          await updatePayout(payoutId, { failureReason: `workflow:${workflowResp.workflowId}` });
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
          return { payoutId: input.id, status: payout.status, workflowStatus: bridgeStatus.status, via: "bridge" };
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
      return { success: true };
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
      return createVirtualCard({
        id: nanoid("vcard_"),
        merchantId: merchant.id,
        maskedPan: `4111 **** **** ${last4}`,
        brand: input.brand,
        expiryMonth: 12,
        expiryYear: expYear,
        currency: input.currency,
        spendLimit: input.spendLimit,
        label: input.label,
      });
    }),

  toggleFreeze: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const card = await getVirtualCardById(input.id);
      if (!card || card.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updateVirtualCard(input.id, { status: card.status === "frozen" ? "active" : "frozen" });
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
      return createPaymentLink({
        id: nanoid("pl_"),
        merchantId: merchant.id,
        slug,
        ...input,
      });
    }),

  toggle: protectedProcedure
    .input(z.object({ id: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      const link = await getPaymentLinkById(input.id);
      if (!link || link.merchantId !== merchant.id) throw new TRPCError({ code: "NOT_FOUND" });
      await updatePaymentLink(input.id, { isActive: !link.isActive });
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
      return createBnplLoan({
        id, merchantId: merchant.id, principalAmount: input.principalAmount,
        currency: input.currency, installments: input.installments,
        installmentAmount, interestRate: input.interestRate,
        transactionId: input.transactionId ?? null,
        customerId: input.customerId ?? null,
        customerEmail: input.customerEmail ?? null,
        customerName: input.customerName ?? null,
        nextPaymentAt, status: 'pending',
      });
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

// ─── Root Router ──────────────────────────────────────────────────────────────

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
});

export type AppRouter = typeof appRouter;
