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
  revokeApiKey, updateDispute, updateMerchant, updatePayout, updatePaymentLink,
  updateVirtualCard, upsertCustomer, getUserByOpenId, getVirtualCardById,
} from "./db";
import { protectedProcedure, publicProcedure, router } from "./_core/trpc";
import { systemRouter } from "./_core/systemRouter";

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
    }))
    .mutation(async ({ ctx, input }) => {
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      if (merchant.isLive) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create test transactions in live mode" });
      }
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
      return createPayout({
        id: nanoid("pyo_"),
        merchantId: merchant.id,
        reference: nanoid("PYO_"),
        amount: input.amount,
        currency: input.currency,
        bankCode: input.bankCode,
        accountNumber: input.accountNumber,
        accountName: input.accountName,
        narration: input.narration,
        feeAmount,
        status: "pending",
      });
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
  disputes: disputesRouter,
  virtualCards: virtualCardsRouter,
  paymentLinks: paymentLinksRouter,
  team: teamRouter,
  settings: settingsRouter,
  analytics: analyticsRouter,
  middleware: middlewareRouter,
});

export type AppRouter = typeof appRouter;
