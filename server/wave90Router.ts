// @ts-nocheck
/**
 * Wave 90 Router — ViaMiddleware Wiring, Loyalty Cron, BNPL Amortisation
 *
 * This router:
 * 1. Wires all consumer procedures to their ViaMiddleware counterparts
 *    (gold, remittance, insurance, EMI, SIP, loyalty, virtual cards, subscriptions)
 * 2. Adds loyalty tier auto-promotion cron job trigger
 * 3. Adds BNPL amortisation schedule calculation
 * 4. Adds TenantBrandingProvider API endpoint
 * 5. Adds partner onboarding session management
 */

import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { getTenantBySlug, updateTenantBranding, getDb, resolveUser, requireMerchant } from "./db";
import { sql } from "drizzle-orm";
import {
  buyDigitalGoldViaMiddleware,
  sellDigitalGoldViaMiddleware,
  getDigitalGoldHoldingsViaMiddleware,
  getRemittanceCorridorsViaMiddleware,
  createRemittanceViaMiddleware,
  getRemittanceHistoryViaMiddleware,
  getConsumerInsuranceProductsViaMiddleware,
  purchaseConsumerInsuranceViaMiddleware,
  fileConsumerInsuranceClaimViaMiddleware,
  getEMIPlansViaMiddleware,
  createEMIApplicationViaMiddleware,
  getEMIScheduleViaMiddleware,
  createGoldSIPViaMiddleware,
  getCashbackBalanceViaMiddleware,
  redeemCashbackViaMiddleware,
  issueVirtualCardViaMiddleware,
  listSubscriptionPlansViaMiddleware,
  cancelSubscriptionViaMiddleware,
  freezeVirtualCardViaMiddleware,
  listSubscribersViaMiddleware,
  getChurnAnalyticsViaMiddleware,
  createSubscriptionPlanViaMiddleware,
  updateCashbackMerchantConfigViaMiddleware,
  isBridgeAvailable,
} from "./middlewareBridge";
// drizzle imports available if needed
import { nanoid } from "nanoid";
import { logger } from "./logger";

/**
 * FAIL LOUD helper — when the middleware bridge is unavailable or returns no
 * result, surface an explicit error to the caller instead of fabricating
 * financial artifacts (trades, policies, cards, approvals).
 */
function bridgeUnavailable(feature: string): never {
  logger.error(`[wave90] FAIL-LOUD: ${feature} unavailable — middleware bridge down or returned no result`);
  throw new TRPCError({
    code: "SERVICE_UNAVAILABLE",
    message: `${feature} is temporarily unavailable. Please try again later.`,
  });
}

/** Explicit not-implemented error for features with no real persistence path. */
function notImplemented(feature: string): never {
  logger.error(`[wave90] FAIL-LOUD: ${feature} has no real backend integration`);
  throw new TRPCError({
    code: "NOT_IMPLEMENTED",
    message: `${feature} is not available yet.`,
  });
}

// ─── Digital Gold (ViaMiddleware) ───────────────────────────────────────────

export const goldMwRouter = router({
  buy: protectedProcedure
    .input(z.object({ amountKobo: z.number().int().positive() }))
    .mutation(async ({ ctx, input }) => {
      const amountNGN = input.amountKobo / 100;
      if (isBridgeAvailable()) {
        const result = await buyDigitalGoldViaMiddleware(
          String(ctx.user.id),
          String(ctx.user.id),
          amountNGN
        );
        if (result) return result;
      }
      // FAIL LOUD — never fabricate a gold trade at a hardcoded price.
      bridgeUnavailable("Digital gold purchase");
    }),

  sell: protectedProcedure
    .input(z.object({ grams: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await sellDigitalGoldViaMiddleware(
          String(ctx.user.id),
          String(ctx.user.id),
          input.grams
        );
        if (result) return result;
      }
      // FAIL LOUD — never fabricate a gold sale at a hardcoded price.
      bridgeUnavailable("Digital gold sale");
    }),

  holdings: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await getDigitalGoldHoldingsViaMiddleware(String(ctx.user.id));
      if (result) return result;
    }
    // FAIL LOUD — a fabricated rate/zero holdings must not be shown as real.
    bridgeUnavailable("Digital gold holdings");
  }),

  createSIP: protectedProcedure
    .input(z.object({
      monthlyAmountNGN: z.number().positive(),
      dayOfMonth: z.number().int().min(1).max(28),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await createGoldSIPViaMiddleware(
          String(ctx.user.id),
          input.monthlyAmountNGN,
          input.dayOfMonth
        );
        if (result) return result;
      }
      // FAIL LOUD — never report a SIP as active when none was created.
      bridgeUnavailable("Gold SIP creation");
    }),
});

// ─── Remittance (ViaMiddleware) ──────────────────────────────────────────────

export const remittanceMwRouter = router({
  corridors: publicProcedure.query(async () => {
    if (isBridgeAvailable()) {
      const result = await getRemittanceCorridorsViaMiddleware();
      if (result) return result.corridors;
    }
    // FAIL LOUD — never present hardcoded FX corridor rates as live quotes.
    bridgeUnavailable("Remittance corridor quotes");
  }),

  create: protectedProcedure
    .input(z.object({
      recipientId: z.string(),
      amountNGN: z.number().positive(),
      currency: z.string().length(3),
      corridor: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await createRemittanceViaMiddleware(
          String(ctx.user.id),
          String(ctx.user.id),
          input.recipientId,
          input.amountNGN,
          input.currency,
          input.corridor
        );
        if (result) return result;
      }
      // FAIL LOUD — never fabricate a remittance ID / tracking code for a
      // transfer that was never initiated on a real rail.
      bridgeUnavailable("International remittance");
    }),

  history: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await getRemittanceHistoryViaMiddleware(String(ctx.user.id));
      if (result) return result.transfers;
    }
    return [];
  }),
});

// ─── Insurance (ViaMiddleware) ───────────────────────────────────────────────

export const insuranceMwRouter = router({
  products: publicProcedure.query(async () => {
    if (isBridgeAvailable()) {
      const result = await getConsumerInsuranceProductsViaMiddleware();
      if (result) return result.products;
    }
    // FAIL LOUD — never present hardcoded insurance products as purchasable.
    bridgeUnavailable("Insurance product catalogue");
  }),

  purchase: protectedProcedure
    .input(z.object({
      productId: z.string(),
      coverageAmountKobo: z.number().int().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await purchaseConsumerInsuranceViaMiddleware(
          String(ctx.user.id),
          input.productId,
          input.coverageAmountKobo / 100
        );
        if (result) return result;
      }
      // FAIL LOUD — never fabricate a policy; no insurer call means no coverage.
      bridgeUnavailable("Insurance purchase");
    }),

  fileClaim: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      claimType: z.string(),
      amountKobo: z.number().int().positive(),
      description: z.string().max(2000),
      documents: z.array(z.string().url()).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await fileConsumerInsuranceClaimViaMiddleware(
          input.policyId,
          input.claimType,
          input.amountKobo / 100,
          input.description,
          input.documents
        );
        if (result) return result;
      }
      // FAIL LOUD — never fabricate a claim ID or estimated payout.
      bridgeUnavailable("Insurance claim filing");
    }),

  // List user's active insurance policies
  listPolicies: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      try {
        const result = await getConsumerInsuranceProductsViaMiddleware();
        if (result?.policies) return result.policies;
      } catch { /* fallback */ }
    }
    // No fabricated demo rows — empty state when the insurer is unreachable.
    return [];
  }),

  // List user's insurance claims
  listClaims: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      try {
        const result = await getConsumerInsuranceProductsViaMiddleware();
        if (result?.claims) return result.claims;
      } catch { /* fallback */ }
    }
    // No fabricated demo rows — empty state when the insurer is unreachable.
    return [];
  }),
});

// ─── EMI (ViaMiddleware) ─────────────────────────────────────────────────────

export const emiMwRouter = router({
  plans: publicProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await getEMIPlansViaMiddleware("default");
      if (result) return result.plans;
    }
    // FAIL LOUD — never present hardcoded credit plans as live offers.
    bridgeUnavailable("EMI plan catalogue");
  }),

  applyForEmi: protectedProcedure
    .input(z.object({
      planId: z.string(),
      amountNGN: z.number().positive(),
      purpose: z.string().max(200),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await createEMIApplicationViaMiddleware(
          String(ctx.user.id),
          String(ctx.user.id),
          input.amountNGN,
          input.planId
        );
        if (result) return result;
      }
      // FAIL LOUD — never auto-approve a credit application offline. No lender,
      // no credit check, no disbursement happened.
      bridgeUnavailable("EMI credit application");
    }),

  schedule: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await getEMIScheduleViaMiddleware(input.applicationId);
        if (result) return result;
      }
      return { schedule: [], nextDueDate: new Date().toISOString(), remainingAmount: 0 };
    }),
});

// ─── Loyalty (ViaMiddleware) ─────────────────────────────────────────────────

export const loyaltyMwRouter = router({
  balance: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await getCashbackBalanceViaMiddleware(String(ctx.user.id));
      if (result) return result;
    }
    return { balance: 0, currency: "NGN", pendingBalance: 0 };
  }),

  redeem: protectedProcedure
    .input(z.object({ amountNGN: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await redeemCashbackViaMiddleware(
          String(ctx.user.id),
          input.amountNGN,
          String(ctx.user.id)
        );
        if (result) return result;
      }
      // FAIL LOUD — never report a cashback redemption that never happened.
      bridgeUnavailable("Cashback redemption");
    }),

  // Loyalty tier auto-promotion (called by cron)
  evaluateTierPromotion: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const userId = input.userId ?? String(ctx.user.id);
      // Tier thresholds (points)
      const TIERS = [
        { name: "bronze", minPoints: 0 },
        { name: "silver", minPoints: 5_000 },
        { name: "gold", minPoints: 25_000 },
        { name: "platinum", minPoints: 100_000 },
      ];
      // Fetch real current points from loyalty_accounts table
      let currentPoints = 0;
      const db = await getDb();
      if (db) {
        try {
          const rows = await db.execute(sql`SELECT COALESCE(SUM(points_balance), 0) AS total_points FROM loyalty_accounts WHERE merchant_id = ${userId} LIMIT 1`);
          currentPoints = Number((rows as any[])[0]?.total_points ?? 0);
        } catch { currentPoints = 0; }
      }
      const newTier = [...TIERS].reverse().find(t => currentPoints >= t.minPoints)?.name ?? "bronze";
      logger.info(`[loyalty] User ${userId} tier evaluated: ${newTier}`);
      return { userId, newTier, currentPoints };
    }),
});

// ─── Virtual Cards (ViaMiddleware) ───────────────────────────────────────────

export const virtualCardsMwRouter = router({
  issue: protectedProcedure
    .input(z.object({
      cardType: z.enum(["virtual", "physical"]).default("virtual"),
      currency: z.string().length(3).default("NGN"),
      spendLimitKobo: z.number().int().positive().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const cardId = nanoid();
        const result = await issueVirtualCardViaMiddleware({
          cardId,
          merchantId: String(ctx.user.id),
          spendingLimit: input.spendLimitKobo ?? 1_000_000,
          currency: input.currency,
          label: input.cardType,
          issuerId: String(ctx.user.id),
        });
        if (result) return result;
      }
      // FAIL LOUD — never fabricate an "active" card with a random PAN.
      bridgeUnavailable("Virtual card issuance");
    }),
});

// ─── Subscriptions (ViaMiddleware) ───────────────────────────────────────────

export const subscriptionsMwRouter = router({
  plans: publicProcedure.query(async () => {
    if (isBridgeAvailable()) {
      const result = await listSubscriptionPlansViaMiddleware("default");
      if (result) return result.plans;
    }
    // FAIL LOUD — never present hardcoded subscription plans as purchasable.
    bridgeUnavailable("Subscription plan catalogue");
  }),

  cancel: protectedProcedure
    .input(z.object({
      subscriptionId: z.string(),
      reason: z.string().max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await cancelSubscriptionViaMiddleware(
          input.subscriptionId,
          input.reason
        );
        if (result) return result;
      }
      // FAIL LOUD — never report a cancellation that did not happen.
      bridgeUnavailable("Subscription cancellation");
    }),
});

// ─── BNPL Amortisation ───────────────────────────────────────────────────────

export const bnplAmortisationRouter = router({
  calculateSchedule: publicProcedure
    .input(z.object({
      principalKobo: z.number().int().positive(),
      months: z.number().int().min(1).max(36),
      annualInterestRatePct: z.number().min(0).max(100),
    }))
    .query(({ input }) => {
      const { principalKobo, months, annualInterestRatePct } = input;
      const monthlyRate = annualInterestRatePct / 100 / 12;
      const emiKobo = monthlyRate === 0
        ? Math.round(principalKobo / months)
        : Math.round(
            (principalKobo * monthlyRate * Math.pow(1 + monthlyRate, months)) /
            (Math.pow(1 + monthlyRate, months) - 1)
          );
      let balance = principalKobo;
      const schedule = Array.from({ length: months }, (_, i) => {
        const interestKobo = Math.round(balance * monthlyRate);
        const principalKoboThisMonth = Math.min(emiKobo - interestKobo, balance);
        balance -= principalKoboThisMonth;
        return {
          instalment: i + 1,
          dueDate: new Date(Date.now() + (i + 1) * 30 * 24 * 60 * 60 * 1000).toISOString().split("T")[0],
          emiKobo,
          principalKobo: principalKoboThisMonth,
          interestKobo,
          outstandingKobo: Math.max(0, balance),
          status: "pending" as const,
        };
      });
      const totalInterestKobo = schedule.reduce((sum, r) => sum + r.interestKobo, 0);
      return {
        emiKobo,
        totalPayableKobo: principalKobo + totalInterestKobo,
        totalInterestKobo,
        effectiveAnnualRatePct: annualInterestRatePct,
        schedule,
      };
    }),
});

// ─── Tenant Branding API ─────────────────────────────────────────────────────

export const tenantBrandingApiRouter = router({
  getBySlug: publicProcedure
    .input(z.object({ slug: z.string().min(1).max(100) }))
    .query(async ({ input }) => {
      // Fetch from tenants table; fall back to defaults if not found
      const tenant = await getTenantBySlug(input.slug).catch(() => null);
      return {
        slug: input.slug,
        primaryColor: (tenant as any)?.primaryColor ?? "#6366f1",
        accentColor: (tenant as any)?.accentColor ?? "#8b5cf6",
        secondaryColor: (tenant as any)?.accentColor ?? "#8b5cf6",
        fontFamily: (tenant as any)?.fontFamily ?? "Inter",
        logoUrl: (tenant as any)?.logoUrl ?? null,
        faviconUrl: null,
        customDomain: (tenant as any)?.customDomain ?? null,
        supportEmail: `support@${input.slug}.paygate.ng`,
        footerText: `\u00a9 ${new Date().getFullYear()} ${input.slug} \u2014 Powered by PayGate`,
      };
    }),
  // Upsert branding config — called by TenantBrandingAdmin.tsx Save button
  upsert: protectedProcedure
    .input(z.object({
      slug: z.string().min(1).max(100),
      primaryColor: z.string().optional(),
      secondaryColor: z.string().optional(),
      bgColor: z.string().optional(),
      textColor: z.string().optional(),
      fontFamily: z.string().optional(),
      logoUrl: z.string().url().optional().nullable(),
      faviconUrl: z.string().url().optional().nullable(),
      supportEmail: z.string().email().optional(),
      footerText: z.string().max(200).optional(),
      customDomain: z.string().optional().nullable(),
    }))
    .mutation(async ({ ctx, input }) => {
      logger.info(`[tenantBranding] Upsert for slug=${input.slug} by user=${ctx.user.id}`);
      // Fetch tenant to get its ID
      const tenant = await getTenantBySlug(input.slug).catch(() => null);
      if (!tenant) {
        // Never report saved:true when nothing was persisted.
        throw new TRPCError({ code: "NOT_FOUND", message: `Tenant '${input.slug}' not found — branding was NOT saved` });
      }
      try {
        await updateTenantBranding((tenant as any).id, {
          logoUrl: input.logoUrl ?? null,
          primaryColor: input.primaryColor ?? null,
          accentColor: input.secondaryColor ?? null,
          fontFamily: input.fontFamily ?? null,
          customDomain: input.customDomain ?? null,
        });
      } catch (e: any) {
        logger.error(`[tenantBranding] DB update failed: ${e.message}`);
        throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Branding could not be saved" });
      }
      return { slug: input.slug, saved: true, updatedAt: new Date() };
    }),
});

// ─── Partner Onboarding Sessions ─────────────────────────────────────────────

export const partnerOnboardingRouter = router({
  start: protectedProcedure
    .input(z.object({ inviteCode: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      if (!ctx.user) throw new TRPCError({ code: "UNAUTHORIZED", message: "Authentication required" });
      const sessionId = nanoid();
      logger.info(`[partner-onboard] Session ${sessionId} started by ${ctx.user.id}`);
      return {
        sessionId,
        step: 1,
        totalSteps: 5,
        steps: ["Invite Code", "Company Details", "Branding", "Fee Structure", "Review"],
      };
    }),

  saveStep: protectedProcedure
    .input(z.object({
      sessionId: z.string(),
      step: z.number().int().min(1).max(5),
      data: z.record(z.string(), z.string(), z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      // FAIL LOUD — there is no onboarding-session persistence; reporting
      // saved:true while persisting nothing would lose partner data silently.
      logger.error(`[partner-onboard] saveStep called for session ${input.sessionId} but no session store exists`);
      notImplemented("Partner onboarding step persistence");
    }),

  complete: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      // FAIL LOUD — never claim a tenant was created (with an ID, "active"
      // status, and dashboard URL) when nothing was persisted.
      logger.error(`[partner-onboard] complete called for session ${input.sessionId} but tenant provisioning is not implemented`);
      notImplemented("Partner tenant provisioning");
    }),
  // List all partner tenants — used by PartnerAdminDashboard.tsx
  list: protectedProcedure
    .input(z.object({
      search: z.string().optional(),
      status: z.enum(["all", "active", "pending", "suspended"]).optional().default("all"),
      tier: z.enum(["all", "bronze", "silver", "gold", "platinum"]).optional().default("all"),
    }))
    .query(async ({ ctx, input }) => {
      logger.info(`[partner-onboard] List partners requested by user=${ctx.user.id}`);
      // Query the real tenants table — never return hardcoded partner rows.
      const db = await getDb();
      if (!db) bridgeUnavailable("Partner tenant listing");
      const rows = await db!.execute(
        sql`SELECT id, name, slug, status, plan, email, country, created_at FROM tenants ORDER BY created_at DESC LIMIT 200`
      ).catch((err: any) => {
        logger.error(`[partner-onboard] tenants query failed: ${err?.message}`);
        bridgeUnavailable("Partner tenant listing");
      });
      let partners = ((rows as unknown as any[]) ?? []).map((t: any) => ({
        id: t.id,
        name: t.name,
        slug: t.slug,
        status: t.status,
        tier: t.plan,
        revenueNGN: 0,
        merchantCount: 0,
        joinedAt: t.created_at,
        country: t.country,
        contactEmail: t.email,
      }));
      if (input.search) {
        const q = input.search.toLowerCase();
        partners = partners.filter((p: any) => p.name.toLowerCase().includes(q) || p.slug.includes(q) || p.contactEmail.includes(q));
      }
      if (input.status !== "all") partners = partners.filter((p: any) => p.status === input.status);
      const totalRevenue = partners.reduce((s: number, p: any) => s + p.revenueNGN, 0);
      const totalMerchants = partners.reduce((s: number, p: any) => s + p.merchantCount, 0);
      return { partners, totalRevenue, totalMerchants, total: partners.length };
    }),
  // Update partner status — used by PartnerAdminDashboard.tsx suspend/activate buttons
  updateStatus: protectedProcedure
    .input(z.object({
      partnerId: z.string(),
      status: z.enum(["active", "suspended", "pending"]),
    }))
    .mutation(async ({ ctx, input }) => {
      logger.info(`[partner-onboard] Partner ${input.partnerId} status → ${input.status} by user=${ctx.user.id}`);
      // Real DB update — never report success without persisting.
      const db = await getDb();
      if (!db) bridgeUnavailable("Partner status update");
      const result = await db!.execute(
        sql`UPDATE tenants SET status = ${input.status} WHERE id = ${input.partnerId}`
      ).catch((err: any) => {
        logger.error(`[partner-onboard] status update failed: ${err?.message}`);
        bridgeUnavailable("Partner status update");
      });
      const affected = Number((result as any)?.affectedRows ?? (result as any)?.rowCount ?? 0);
      if (affected === 0) {
        throw new TRPCError({ code: "NOT_FOUND", message: `Partner tenant ${input.partnerId} not found` });
      }
      return { partnerId: input.partnerId, status: input.status, updatedAt: new Date() };
    }),
  revenueData: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      const rows = await db.execute(
        sql`SELECT 
          DATE_FORMAT(created_at, '%b') as month,
          COALESCE(SUM(amount), 0) as revenue,
          COUNT(DISTINCT merchant_id) as partners
        FROM transactions
        WHERE created_at >= DATE_SUB(NOW(), INTERVAL ${input.months} MONTH)
          AND status = 'completed'
        GROUP BY DATE_FORMAT(created_at, '%Y-%m')
        ORDER BY DATE_FORMAT(created_at, '%Y-%m') ASC`
      );
      return (rows as any[]).map(r => ({
        month: r.month,
        revenue: Number(r.revenue ?? 0),
        partners: Number(r.partners ?? 0),
      }));
    }),
});


// ─── Wave91 Extensions ───────────────────────────────────────────────────────
// These extend the wave90 routers with additional procedures needed by the UI

// Extend virtualCardsMwRouter with list + freeze
export const virtualCardsMwExtRouter = router({
  issue: virtualCardsMwRouter.issue,
  list: protectedProcedure
    .input(z.object({ limit: z.number().min(1).max(100).default(50), offset: z.number().min(0).default(0) }))
    .query(async ({ ctx, input }) => {
      // Query the issuer via the bridge — never return hardcoded cards.
      if (isBridgeAvailable()) {
        try {
          const resp = await fetch(
            `${process.env.MIDDLEWARE_BRIDGE_URL}/v1/cards?merchantId=${encodeURIComponent(String(ctx.user.id))}&limit=${input.limit}&offset=${input.offset}`,
            { headers: { "x-internal-key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" }, signal: AbortSignal.timeout(10_000) }
          );
          if (resp.ok) return await resp.json();
        } catch (err) {
          logger.error(`[wave90] card list bridge error: ${err instanceof Error ? err.message : err}`);
        }
      }
      bridgeUnavailable("Virtual card listing");
    }),
  freeze: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await freezeVirtualCardViaMiddleware({ cardId: input.cardId, merchantId: String(ctx.user.id), freeze: true } as any);
        if (result) return result;
      }
      // FAIL LOUD — never report a freeze that the issuer never applied.
      bridgeUnavailable("Virtual card freeze");
    }),
  unfreeze: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await freezeVirtualCardViaMiddleware({ cardId: input.cardId, merchantId: String(ctx.user.id), freeze: false } as any);
        if (result) return result;
      }
      // FAIL LOUD — never report an unfreeze that the issuer never applied.
      bridgeUnavailable("Virtual card unfreeze");
    }),
  terminate: protectedProcedure
    .input(z.object({ cardId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        try {
          const resp = await fetch(`${process.env.MIDDLEWARE_BRIDGE_URL}/v1/cards/${encodeURIComponent(input.cardId)}/terminate`, {
            method: "POST",
            headers: { "Content-Type": "application/json", "x-internal-key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
            body: JSON.stringify({ merchantId: String(ctx.user.id) }),
            signal: AbortSignal.timeout(10_000),
          });
          if (resp.ok) return await resp.json();
        } catch (err) {
          logger.error(`[wave90] card terminate bridge error: ${err instanceof Error ? err.message : err}`);
        }
      }
      // FAIL LOUD — never report a termination that the issuer never applied.
      bridgeUnavailable("Virtual card termination");
    }),
});

// Extend subscriptionsMwRouter with subscribers + churn + createPlan
export const subscriptionsMwExtRouter = router({
  plans: subscriptionsMwRouter.plans,
  cancel: subscriptionsMwRouter.cancel,
  subscribers: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await listSubscribersViaMiddleware(String(ctx.user.id));
      if (result) return result;
    }
    // FAIL LOUD — never present invented subscribers as real customers.
    bridgeUnavailable("Subscriber listing");
  }),
  churnAnalytics: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      const result = await getChurnAnalyticsViaMiddleware(String(ctx.user.id));
      if (result) return result;
    }
    // FAIL LOUD — never present hardcoded churn/MRR analytics as real.
    bridgeUnavailable("Churn analytics");
  }),
  monthlyChurnData: protectedProcedure
    .input(z.object({ months: z.number().min(1).max(24).default(6) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) return [];
      // Generate monthly aggregates from subscriptions table
      const user = await resolveUser(ctx.user.openId);
      const merchant = await requireMerchant(user.id);
      // Return last N months of churn/MRR data
      const rows = await db.execute(
        sql`SELECT
          TO_CHAR(created_at, 'Mon') as month,
          COUNT(*) as "newSubs",
          SUM(amount_ngn) as mrr
        FROM subscription_plans
        WHERE merchant_id = ${merchant.id}
          AND created_at >= NOW() - make_interval(months => ${input.months})
        GROUP BY TO_CHAR(created_at, 'YYYY-MM'), TO_CHAR(created_at, 'Mon')
        ORDER BY TO_CHAR(created_at, 'YYYY-MM') ASC`
      );
      return (rows as any[]).map(r => ({
        month: r.month,
        mrr: Number(r.mrr ?? 0),
        // Churn requires cancellation data we do not have here — report it as
        // not computed rather than emitting a random number.
        churnRate: null,
        newSubs: Number(r.newSubs ?? 0),
      }));
    }),
  createPlan: protectedProcedure
    .input(z.object({
      name: z.string().min(1).max(100),
      amountNGN: z.number().positive(),
      interval: z.enum(["monthly", "quarterly", "yearly"]),
      features: z.array(z.string()).max(20),
    }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await createSubscriptionPlanViaMiddleware(
          String(ctx.user.id),
          input.name,
          input.amountNGN,
          "NGN",
          input.interval,
          input.features
        );
        if (result) return result;
      }
      // FAIL LOUD — never report a subscription plan as created when it was not.
      bridgeUnavailable("Subscription plan creation");
    }),
});

// Extend loyaltyMwRouter with evaluateTier (renamed from evaluateTierPromotion)
export const loyaltyMwExtRouter = router({
  balance: loyaltyMwRouter.balance,
  redeem: loyaltyMwRouter.redeem,
  evaluateTierPromotion: loyaltyMwRouter.evaluateTierPromotion,
  evaluateTier: protectedProcedure
    .input(z.object({ userId: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const uid = input.userId ?? String(ctx.user.id);
      logger.info(`[loyalty] Evaluating tier for user ${uid}`);
      // Compute from real loyalty points — never return a hardcoded upgrade.
      const TIERS = [
        { name: "bronze", minPoints: 0 },
        { name: "silver", minPoints: 5_000 },
        { name: "gold", minPoints: 25_000 },
        { name: "platinum", minPoints: 100_000 },
      ];
      let currentPoints = 0;
      const db = await getDb();
      if (!db) bridgeUnavailable("Loyalty tier evaluation");
      try {
        const rows = await db!.execute(sql`SELECT COALESCE(SUM(points_balance), 0) AS total_points FROM loyalty_accounts WHERE merchant_id = ${uid} LIMIT 1`);
        currentPoints = Number((rows as any[])[0]?.total_points ?? 0);
      } catch (err) {
        logger.error(`[loyalty] points query failed: ${err instanceof Error ? err.message : err}`);
        bridgeUnavailable("Loyalty tier evaluation");
      }
      const newTier = [...TIERS].reverse().find(t => currentPoints >= t.minPoints)?.name ?? "bronze";
      return { userId: uid, newTier, previousTier: newTier, upgraded: false, currentPoints, evaluatedAt: new Date().toISOString() };
    }),
  merchantConfig: protectedProcedure
    .input(z.object({ cashbackRate: z.number().min(0).max(10), minTransactionAmountNGN: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        const result = await updateCashbackMerchantConfigViaMiddleware(String(ctx.user.id), input.cashbackRate, input.minTransactionAmountNGN);
        if (result) return result;
      }
      // FAIL LOUD — never report a config update that was not applied.
      bridgeUnavailable("Cashback merchant configuration");
    }),
  // Transaction history for loyalty points
  history: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      try {
        const result = await getCashbackBalanceViaMiddleware(String(ctx.user.id));
        if (result?.history) return result.history;
      } catch { /* fallback */ }
    }
    // No fabricated demo history — empty state when the bridge is unreachable.
    return [];
  }),
});

// Extend emiMwRouter with apply (alias for applyForEmi with different input schema)
export const emiMwExtRouter = router({
  plans: emiMwRouter.plans,
  applyForEmi: emiMwRouter.applyForEmi,
  schedule: emiMwRouter.schedule,
  applyEmi: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      amountKobo: z.number().int().positive(),
      planId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const amountNGN = input.amountKobo / 100;
      if (isBridgeAvailable()) {
        const result = await createEMIApplicationViaMiddleware(input.customerId, String(ctx.user.id), amountNGN, input.planId);
        if (result) return result;
      }
      // FAIL LOUD — never auto-approve a credit application offline.
      bridgeUnavailable("EMI credit application");
    }),
  // List EMI applications for the current user/merchant
  listApplications: protectedProcedure.query(async ({ ctx }) => {
    if (isBridgeAvailable()) {
      try {
        const result = await getEMIPlansViaMiddleware(String(ctx.user.id));
        if (result?.applications) return result.applications;
      } catch { /* fallback */ }
    }
    // No fabricated demo applications — empty state when the lender is unreachable.
    return [];
  }),

  // Repayment schedule for a specific EMI application
  repaymentSchedule: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ ctx, input }) => {
      if (isBridgeAvailable()) {
        try {
          const resp = await fetch(`${process.env.MIDDLEWARE_BRIDGE_URL}/v1/emi/schedule/${input.applicationId}`, {
            headers: { 'x-internal-key': process.env.MIDDLEWARE_INTERNAL_KEY ?? '' },
          });
          if (resp.ok) return await resp.json();
        } catch { /* fallback */ }
      }
      // No synthetic schedules from demo data — empty when the lender is unreachable.
      return { instalments: [] };
    }),
});


// ─── Final Exports (moved to end to avoid TDZ) ──────────────────────────────────────────
// ─── Exports ─────────────────────────────────────────────────────────────────

export const wave90Routers = {
  goldMw: goldMwRouter,
  remittanceMw: remittanceMwRouter,
  insuranceMw: insuranceMwRouter,
  emiMw: emiMwExtRouter,
  emiMwCore: emiMwRouter,
  loyaltyMw: loyaltyMwExtRouter,
  loyaltyMwCore: loyaltyMwRouter,
  virtualCardsMw: virtualCardsMwExtRouter,
  virtualCardsMwCore: virtualCardsMwRouter,
  subscriptionsMw: subscriptionsMwExtRouter,
  subscriptionsMwCore: subscriptionsMwRouter,
  bnplAmortisation: bnplAmortisationRouter,
  tenantBrandingApi: tenantBrandingApiRouter,
  partnerOnboarding: partnerOnboardingRouter,
};
