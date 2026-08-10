/**
 * Stripe server-side helpers for PayGate merchant portal.
 *
 * Design principles:
 * - Store only Stripe IDs locally; fetch live data from Stripe API when needed.
 * - All amounts are in the smallest currency unit (kobo for NGN, cents for USD).
 * - Webhook events are verified before processing.
 */
import Stripe from "stripe";
import { ENV } from "./_core/env";

// Lazy singleton — avoids crashing at import time when key is absent (tests / CI).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-02-25.clover",
      typescript: true,
    });
  }
  return _stripe;
}

export function isStripeConfigured(): boolean {
  return Boolean(ENV.stripeSecretKey);
}

// ─── Payment Intent ───────────────────────────────────────────────────────────

export interface CreatePaymentIntentInput {
  amountKobo: number;       // amount in smallest unit (kobo for NGN, cents for USD)
  currency: string;         // ISO 4217 lowercase: "ngn", "usd", "gbp"
  description?: string;
  merchantId: string;
  customerId?: string;
  metadata?: Record<string, string>;
}

export async function createPaymentIntent(input: CreatePaymentIntentInput) {
  const stripe = getStripe();
  const intent = await stripe.paymentIntents.create({
    amount: input.amountKobo,
    currency: input.currency.toLowerCase(),
    description: input.description,
    metadata: {
      merchant_id: input.merchantId,
      customer_id: input.customerId ?? "",
      ...input.metadata,
    },
    automatic_payment_methods: { enabled: true },
  });
  return {
    clientSecret: intent.client_secret!,
    paymentIntentId: intent.id,
    status: intent.status,
  };
}

// ─── Checkout Session ─────────────────────────────────────────────────────────

export interface CreateCheckoutSessionInput {
  lineItems: Array<{
    name: string;
    description?: string;
    amountKobo: number;
    currency: string;
    quantity: number;
  }>;
  merchantId: string;
  customerEmail?: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
  paymentLinkId?: string;
}

export async function createCheckoutSession(input: CreateCheckoutSessionInput) {
  const stripe = getStripe();
  const session = await stripe.checkout.sessions.create({
    mode: "payment",
    customer_email: input.customerEmail,
    line_items: input.lineItems.map((item) => ({
      price_data: {
        currency: item.currency.toLowerCase(),
        unit_amount: item.amountKobo,
        product_data: {
          name: item.name,
          description: item.description,
        },
      },
      quantity: item.quantity,
    })),
    success_url: input.successUrl,
    cancel_url: input.cancelUrl,
    allow_promotion_codes: true,
    metadata: {
      merchant_id: input.merchantId,
      payment_link_id: input.paymentLinkId ?? "",
      ...input.metadata,
    },
    client_reference_id: input.merchantId,
  });
  return {
    sessionId: session.id,
    url: session.url!,
    status: session.status,
  };
}

// ─── Webhook ──────────────────────────────────────────────────────────────────

export function constructWebhookEvent(
  payload: Buffer | string,
  signature: string
): Stripe.Event {
  if (!ENV.stripeWebhookSecret) {
    throw new Error("STRIPE_WEBHOOK_SECRET is not configured");
  }
  return getStripe().webhooks.constructEvent(
    payload,
    signature,
    ENV.stripeWebhookSecret
  );
}

// ─── Payment History ──────────────────────────────────────────────────────────

export async function listPaymentIntents(options?: {
  limit?: number;
  startingAfter?: string;
}) {
  const stripe = getStripe();
  const list = await stripe.paymentIntents.list({
    limit: options?.limit ?? 20,
    starting_after: options?.startingAfter,
  });
  return list.data.map((pi) => ({
    id: pi.id,
    amount: pi.amount,
    currency: pi.currency,
    status: pi.status,
    description: pi.description,
    createdAt: new Date(pi.created * 1000),
    metadata: pi.metadata,
  }));
}

export async function listCheckoutSessions(options?: {
  limit?: number;
  startingAfter?: string;
}) {
  const stripe = getStripe();
  const list = await stripe.checkout.sessions.list({
    limit: options?.limit ?? 20,
    starting_after: options?.startingAfter,
  });
  return list.data.map((s) => ({
    id: s.id,
    amountTotal: s.amount_total,
    currency: s.currency,
    status: s.status,
    customerEmail: s.customer_email,
    paymentStatus: s.payment_status,
    url: s.url,
    createdAt: new Date(s.created * 1000),
    metadata: s.metadata,
  }));
}
