/**
 * Portal Billing Router — Stripe-gated premium plans for the PayGate Merchant Portal.
 *
 * Plans:
 *   - free      : Default. Access to core features.
 *   - starter   : $29/mo. Unlocks Reports Center, AI Insights V2.
 *   - growth    : $79/mo. Unlocks Wealth Management, Subscription Billing V2, Digital Gold.
 *   - enterprise: $199/mo. Unlocks all features including Nodal Accounts, Salary Accounts.
 *
 * Stripe Checkout Session is used for plan upgrades.
 * Webhooks at /api/stripe/webhook handle subscription lifecycle events.
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "./_core/trpc";
import { ENV } from "./_core/env";
import { getStripe, isStripeConfigured } from "./stripe";
import {
  getOrCreatePortalSubscription,
  updatePortalSubscription,
} from "./db";

// ─── Plan Definitions ─────────────────────────────────────────────────────────
export const PORTAL_PLANS = {
  free: {
    name: "Free",
    priceUSD: 0,
    stripePriceId: null,
    features: [
      "Dashboard & Analytics",
      "Transactions & Payouts",
      "Payment Links",
      "Webhooks & API Keys",
      "Basic Fraud Monitoring",
    ],
    featureFlags: {
      reportsCenter: false,
      aiInsightsV2: false,
      wealthManagement: false,
      subscriptionBillingV2: false,
      digitalGold: false,
      nodalAccounts: false,
      salaryAccounts: false,
      internationalRemittance: false,
    },
  },
  starter: {
    name: "Starter",
    priceUSD: 29,
    stripePriceId: ENV.stripePortalPlanStarterPriceId,
    features: [
      "Everything in Free",
      "Reports Center (CSV/Excel/PDF exports)",
      "AI Insights V2",
      "Cashback & Rewards",
      "EMI Checkout",
      "Bulk Collections",
    ],
    featureFlags: {
      reportsCenter: true,
      aiInsightsV2: true,
      wealthManagement: false,
      subscriptionBillingV2: false,
      digitalGold: false,
      nodalAccounts: false,
      salaryAccounts: false,
      internationalRemittance: false,
    },
  },
  growth: {
    name: "Growth",
    priceUSD: 79,
    stripePriceId: ENV.stripePortalPlanGrowthPriceId,
    features: [
      "Everything in Starter",
      "Wealth Management & Goals",
      "Subscription Billing V2",
      "Digital Gold & SIP Plans",
      "Mutual Funds",
      "Consumer Insurance",
      "Pension / NPS",
      "Voice Payments (Soundbox)",
      "Smart Retail POS",
    ],
    featureFlags: {
      reportsCenter: true,
      aiInsightsV2: true,
      wealthManagement: true,
      subscriptionBillingV2: true,
      digitalGold: true,
      nodalAccounts: false,
      salaryAccounts: false,
      internationalRemittance: true,
    },
  },
  enterprise: {
    name: "Enterprise",
    priceUSD: 199,
    stripePriceId: ENV.stripePortalPlanEnterprisePriceId,
    features: [
      "Everything in Growth",
      "Nodal Accounts",
      "Salary Accounts & Advances",
      "Privacy Payments",
      "API Docs Portal (White-label)",
      "Dedicated Account Manager",
      "SLA 99.99% Uptime",
    ],
    featureFlags: {
      reportsCenter: true,
      aiInsightsV2: true,
      wealthManagement: true,
      subscriptionBillingV2: true,
      digitalGold: true,
      nodalAccounts: true,
      salaryAccounts: true,
      internationalRemittance: true,
    },
  },
} as const;

export type PlanKey = keyof typeof PORTAL_PLANS;

// ─── Router ───────────────────────────────────────────────────────────────────
export const portalBillingRouter = router({
  /**
   * Get the current portal subscription and feature flags for the logged-in merchant.
   */
  getSubscription: protectedProcedure.query(async ({ ctx }) => {
    const merchantId = ctx.user.id.toString();
    const sub = await getOrCreatePortalSubscription(merchantId);
    const plan = (PORTAL_PLANS[sub.plan as PlanKey] ?? PORTAL_PLANS.free);
    return {
      ...sub,
      planDetails: plan,
      featureFlags: plan.featureFlags,
    };
  }),

  /**
   * List all available plans with pricing and features.
   */
  listPlans: protectedProcedure.query(() => {
    return Object.entries(PORTAL_PLANS).map(([key, plan]) => ({
      key,
      ...plan,
    }));
  }),

  /**
   * Create a Stripe Checkout Session to upgrade to a paid plan.
   */
  createCheckoutSession: protectedProcedure
    .input(z.object({
      planKey: z.enum(["starter", "growth", "enterprise"]),
      origin: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured. Please add STRIPE_SECRET_KEY." });
      }
      const stripe = getStripe();
      const merchantId = ctx.user.id.toString();
      const plan = PORTAL_PLANS[input.planKey];
      if (!plan.stripePriceId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid plan" });
      }

      const sub = await getOrCreatePortalSubscription(merchantId);

      // Reuse or create Stripe customer
      let stripeCustomerId = sub.stripeCustomerId ?? undefined;
      if (!stripeCustomerId) {
        const customer = await stripe.customers.create({
          email: ctx.user.email ?? undefined,
          name: ctx.user.name ?? undefined,
          metadata: { merchant_id: merchantId },
        });
        stripeCustomerId = customer.id;
        await updatePortalSubscription(merchantId, { stripeCustomerId });
      }

      const session = await stripe.checkout.sessions.create({
        mode: "subscription",
        customer: stripeCustomerId,
        line_items: [{ price: plan.stripePriceId, quantity: 1 }],
        allow_promotion_codes: true,
        client_reference_id: merchantId,
        metadata: {
          merchant_id: merchantId,
          plan_key: input.planKey,
          customer_email: ctx.user.email ?? "",
          customer_name: ctx.user.name ?? "",
        },
        success_url: `${input.origin}/billing?success=1&plan=${input.planKey}`,
        cancel_url: `${input.origin}/billing?cancelled=1`,
      });

      return { url: session.url };
    }),

  /**
   * Create a Stripe Customer Portal session for managing existing subscription.
   */
  createPortalSession: protectedProcedure
    .input(z.object({ origin: z.string().url() }))
    .mutation(async ({ ctx, input }) => {
      if (!isStripeConfigured()) {
        throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured." });
      }
      const stripe = getStripe();
      const merchantId = ctx.user.id.toString();
      const sub = await getOrCreatePortalSubscription(merchantId);

      if (!sub.stripeCustomerId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "No Stripe customer found. Please subscribe first." });
      }

      const session = await stripe.billingPortal.sessions.create({
        customer: sub.stripeCustomerId,
        return_url: `${input.origin}/billing`,
      });

      return { url: session.url };
    }),

  /**
   * Cancel the current subscription at period end.
   */
  cancelSubscription: protectedProcedure.mutation(async ({ ctx }) => {
    if (!isStripeConfigured()) {
      throw new TRPCError({ code: "PRECONDITION_FAILED", message: "Stripe is not configured." });
    }
    const stripe = getStripe();
    const merchantId = ctx.user.id.toString();
    const sub = await getOrCreatePortalSubscription(merchantId);

    if (!sub.stripeSubscriptionId) {
      throw new TRPCError({ code: "NOT_FOUND", message: "No active subscription found." });
    }

    await stripe.subscriptions.update(sub.stripeSubscriptionId, {
      cancel_at_period_end: true,
    });

    await updatePortalSubscription(merchantId, { cancelAtPeriodEnd: 1 });
    // Audit: subscription cancellation is a critical billing event
    try {
      const { publishAuditEvent } = await import("./auditEvents");
      await publishAuditEvent({
        merchantId,
        actorId: String(ctx.user.id),
        actorName: ctx.user.name ?? "Unknown",
        actorEmail: ctx.user.email ?? null,
        action: "subscription.cancel",
        resource: "portal_subscription",
        resourceId: sub.stripeSubscriptionId,
        metadata: { cancelAtPeriodEnd: true },
      });
    } catch { /* non-blocking */ }
    return { success: true };
  }),
});
