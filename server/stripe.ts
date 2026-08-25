/**
 * Stripe server-side helpers for PayGate merchant portal.
 *
 * Design principles:
 * - Store only Stripe IDs locally; fetch live data from Stripe API when needed.
 * - All amounts are in the smallest currency unit (kobo for NGN, cents for USD).
 * - Webhook events are verified before processing.
 */
import Stripe from "stripe";
import type { Request, Response } from "express";
import { nanoid } from "nanoid";
import { and, eq, sql } from "drizzle-orm";
import { ENV } from "./_core/env";
import { getDb } from "./db";
import { consumerWallets, consumerWalletTxns } from "../drizzle/schema";
import { logger } from "./logger";

// Lazy singleton — avoids crashing at import time when key is absent (tests / CI).
let _stripe: Stripe | null = null;

export function getStripe(): Stripe {
  if (!_stripe) {
    if (!ENV.stripeSecretKey) {
      throw new Error("STRIPE_SECRET_KEY is not configured");
    }
    _stripe = new Stripe(ENV.stripeSecretKey, {
      apiVersion: "2026-07-29.dahlia",
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

// ─── Inbound webhook: wallet crediting ────────────────────────────────────────

export interface CreditWalletTopUpInput {
  userId: number;
  amountKobo: number;
  currency: string;
  /** Idempotency key — a previously credited reference is never double-credited. */
  reference: string;
  description?: string;
}

export interface CreditWalletTopUpResult {
  credited: boolean; // false when the reference was already credited (idempotent replay)
  walletId: string;
  newBalanceKobo: number;
  reference: string;
}

/**
 * Credit a consumer wallet after a PSP-verified event (Stripe webhook).
 *
 * Mirrors the crediting semantics of the `wallet.topUp` tRPC procedure
 * (server/routers.ts) — same tables, same balance arithmetic — but is
 * idempotent: the `reference` (Stripe event ID) is checked against
 * consumer_wallet_txns before crediting, so Stripe's at-least-once webhook
 * redelivery can never double-credit a wallet.
 */
export async function creditWalletTopUp(input: CreditWalletTopUpInput): Promise<CreditWalletTopUpResult> {
  const db = await getDb();
  const currency = input.currency.toUpperCase();

  // Idempotency: has this reference already been credited?
  const existing = await db
    .select()
    .from(consumerWalletTxns)
    .where(and(eq(consumerWalletTxns.reference, input.reference), eq(consumerWalletTxns.type, "topup")))
    .limit(1);
  if (existing.length > 0) {
    logger.info("[stripeWebhook] duplicate event suppressed (already credited)", { reference: input.reference });
    return {
      credited: false,
      walletId: existing[0].walletId,
      newBalanceKobo: existing[0].balanceAfterKobo,
      reference: input.reference,
    };
  }

  // Get or create the wallet (same logic as wallet.topUp).
  let [wallet] = await db
    .select()
    .from(consumerWallets)
    .where(and(eq(consumerWallets.userId, input.userId), eq(consumerWallets.currency, currency)))
    .limit(1);
  if (!wallet) {
    const [created] = await db
      .insert(consumerWallets)
      .values({ id: nanoid(), userId: input.userId, currency, balanceKobo: 0, isActive: true })
      .returning();
    wallet = created;
  }

  // Credit atomically: blind increment (SET balance_kobo = balance_kobo + X)
  // and the ledger row in ONE transaction — no read-modify-write race between
  // concurrent webhook deliveries for the same wallet.
  // The minimal in-memory test double has no transaction()/SQL-fragment
  // support; fall back to a plain update there (single-threaded harness).
  const supportsTx = typeof (db as { transaction?: unknown }).transaction === "function";

  // R4 F5 (spec #10): consumer_wallet_txns.reference is NOT unique, so the
  // pre-check above alone leaves a race window between concurrent deliveries.
  // The dedupe select is therefore re-run INSIDE the crediting transaction.
  const applyCredit = async (tx: {
    select: typeof db.select;
    update: typeof db.update;
    insert: typeof db.insert;
  }): Promise<{ credited: boolean; balance: number }> => {
    if (supportsTx) {
      const dup = await tx
        .select()
        .from(consumerWalletTxns)
        .where(and(eq(consumerWalletTxns.reference, input.reference), eq(consumerWalletTxns.type, "topup")))
        .limit(1);
      if (dup.length > 0) {
        return { credited: false, balance: dup[0].balanceAfterKobo };
      }
    }
    let creditedBalance: number;
    if (supportsTx) {
      const [updated] = await tx
        .update(consumerWallets)
        .set({
          balanceKobo: sql<number>`${consumerWallets.balanceKobo} + ${input.amountKobo}`,
          updatedAt: new Date(),
        })
        .where(eq(consumerWallets.id, wallet.id))
        .returning({ balanceKobo: consumerWallets.balanceKobo });
      creditedBalance = updated?.balanceKobo ?? wallet.balanceKobo + input.amountKobo;
    } else {
      creditedBalance = wallet.balanceKobo + input.amountKobo;
      await tx
        .update(consumerWallets)
        .set({ balanceKobo: creditedBalance, updatedAt: new Date() })
        .where(eq(consumerWallets.id, wallet.id));
    }

    await tx.insert(consumerWalletTxns).values({
      id: nanoid(),
      walletId: wallet.id,
      userId: input.userId,
      type: "topup",
      amountKobo: input.amountKobo,
      currency,
      balanceAfterKobo: creditedBalance,
      description: input.description ?? "Wallet top-up (Stripe)",
      reference: input.reference,
      status: "completed",
    });
    return { credited: true, balance: creditedBalance };
  };

  const outcome = supportsTx
    ? await (db as unknown as { transaction: <T>(fn: (tx: never) => Promise<T>) => Promise<T> }).transaction<{ credited: boolean; balance: number }>(applyCredit as never)
    : await applyCredit(db);

  if (!outcome.credited) {
    logger.info("[stripeWebhook] duplicate event suppressed inside transaction (already credited)", { reference: input.reference });
    return { credited: false, walletId: wallet.id, newBalanceKobo: outcome.balance, reference: input.reference };
  }

  logger.info("[stripeWebhook] wallet credited", {
    userId: input.userId, amountKobo: input.amountKobo, currency, reference: input.reference,
  });
  return { credited: true, walletId: wallet.id, newBalanceKobo: outcome.balance, reference: input.reference };
}

/**
 * Process a verified Stripe event. Runs asynchronously after the 200 ACK.
 * Only events carrying a consumer `user_id` in metadata credit a wallet;
 * anything else is acknowledged and logged (never fabricated).
 */
async function processStripeWebhookEvent(event: Stripe.Event): Promise<void> {
  // R4 F5 (spec #10): the dedupe key is the PAYMENT INTENT id, NOT the event
  // id. Stripe fires BOTH checkout.session.completed and
  // payment_intent.succeeded for one Checkout payment — keying on the event id
  // credited the wallet twice. Both shapes now derive `stripe:pi_<id>`; a
  // second event for the same payment intent is a no-op.
  //
  // R4 S16 (cross-flow reuse): the consumer-wallet credit branch fires ONLY
  // for objects explicitly stamped `metadata.type === "consumer_wallet_topup"`
  // (stamped by wave68Router consumerStripeTopUp.createCheckout). Other flows
  // also carry `user_id` metadata — e.g. subscription checkout sessions
  // (wave34Router stamps user_id with no purpose marker) — and must NEVER
  // credit a consumer wallet. Merchant payment intents / checkout sessions are
  // stamped with `merchant_id` (see createPaymentIntent /
  // createMerchantCheckoutSession above) and carry NEITHER `user_id` NOR the
  // top-up marker, so they are verifiably skipped here; the merchant
  // wallet.topUp claim path (server/routers.ts) writes to a different ledger
  // (wallet_transactions, not consumer_wallet_txns), so there is no shared
  // dedupe namespace and its `TOPUP-<ref>` convention stays as-is.
  //
  // NGN rail (R4 S16): consumerStripeTopUp charges a USD-CONVERTED amount
  // (Stripe cannot charge NGN); the wallet-truth NGN kobo amount is stamped
  // as `metadata.ngn_amount_kobo`. When present we credit THAT amount in NGN —
  // the Stripe charge amount/currency is only the rail detail.
  const topUpAmountCurrency = (metadata: Record<string, string | undefined> | undefined, railAmount: number, railCurrency: string | null | undefined) => {
    const ngnKobo = parseInt(metadata?.ngn_amount_kobo ?? "", 10);
    const hasNgn = Number.isInteger(ngnKobo) && ngnKobo > 0;
    return {
      amountKobo: hasNgn ? ngnKobo : railAmount,
      currency: hasNgn ? "ngn" : (railCurrency ?? "ngn"),
    };
  };
  if (event.type === "payment_intent.succeeded") {
    const pi = event.data.object as Stripe.PaymentIntent;
    const reference = `stripe:pi_${pi.id}`;
    if (pi.metadata?.type !== "consumer_wallet_topup") {
      logger.info("[stripeWebhook] payment_intent.succeeded without consumer_wallet_topup marker — no wallet credit", { eventId: event.id });
      return;
    }
    const userId = parseInt(pi.metadata?.user_id ?? "", 10);
    if (!Number.isInteger(userId) || userId <= 0) {
      logger.info("[stripeWebhook] payment_intent.succeeded without user_id metadata — no wallet credit", { eventId: event.id });
      return;
    }
    const { amountKobo, currency } = topUpAmountCurrency(pi.metadata as Record<string, string | undefined> | undefined, pi.amount, pi.currency);
    if (amountKobo <= 0) {
      logger.info("[stripeWebhook] payment_intent.succeeded with non-positive amount — no wallet credit", { eventId: event.id });
      return;
    }
    await creditWalletTopUp({
      userId, amountKobo, currency,
      reference, description: `Wallet top-up via Stripe ${pi.id}`,
    });
    return;
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as Stripe.Checkout.Session;
    if (session.payment_status !== "paid") {
      logger.info("[stripeWebhook] checkout.session.completed but unpaid — no wallet credit", { eventId: event.id });
      return;
    }
    if (session.metadata?.type !== "consumer_wallet_topup") {
      logger.info("[stripeWebhook] checkout.session.completed without consumer_wallet_topup marker — no wallet credit", { eventId: event.id });
      return;
    }
    const userId = parseInt(session.metadata?.user_id ?? "", 10);
    const { amountKobo: amount, currency: creditCurrency } = topUpAmountCurrency(session.metadata as Record<string, string | undefined> | undefined, session.amount_total ?? 0, session.currency);
    if (!Number.isInteger(userId) || userId <= 0 || amount <= 0) {
      logger.info("[stripeWebhook] checkout.session.completed without user_id metadata — no wallet credit", { eventId: event.id });
      return;
    }
    // Same PI-based dedupe key as payment_intent.succeeded (spec #10). When a
    // session has no payment_intent (e.g. subscription/setup flows) fall back
    // to the session id so the event is still exactly-once.
    const piId =
      typeof session.payment_intent === "string"
        ? session.payment_intent
        : session.payment_intent?.id;
    const reference = piId ? `stripe:pi_${piId}` : `stripe:cs_${session.id}`;
    await creditWalletTopUp({
      userId, amountKobo: amount, currency: creditCurrency,
      reference, description: `Wallet top-up via Stripe Checkout ${session.id}`,
    });
    return;
  }

  logger.info("[stripeWebhook] unhandled event type acknowledged", { type: event.type, eventId: event.id });
}

/**
 * Express handler for POST /api/webhooks/stripe.
 *
 * MUST be mounted with `express.raw({ type: "application/json" })` BEFORE the
 * global express.json parser — signature verification requires the raw body.
 *
 * Behaviour:
 *   503 — STRIPE_WEBHOOK_SECRET not configured
 *   400 — missing/invalid signature
 *   200 — verified; processing continues asynchronously (Stripe only needs the ACK)
 */
export async function stripeWebhookHandler(req: Request, res: Response): Promise<void> {
  if (!ENV.stripeWebhookSecret) {
    res.status(503).json({ error: "Stripe webhook endpoint not configured (STRIPE_WEBHOOK_SECRET unset)" });
    return;
  }
  const signature = req.headers["stripe-signature"];
  if (typeof signature !== "string" || signature.length === 0) {
    res.status(400).json({ error: "Missing Stripe-Signature header" });
    return;
  }
  const payload = req.body as Buffer;
  if (!Buffer.isBuffer(payload)) {
    // Raw parser was not mounted for this route — misconfiguration, fail closed.
    logger.error("[stripeWebhook] raw body unavailable — express.raw must be mounted before express.json for /api/webhooks/stripe");
    res.status(400).json({ error: "Raw request body required for signature verification" });
    return;
  }

  let event: Stripe.Event;
  try {
    event = constructWebhookEvent(payload, signature);
  } catch (err) {
    logger.warn("[stripeWebhook] signature verification failed", { error: err instanceof Error ? err.message : String(err) });
    res.status(400).json({ error: "Invalid webhook signature" });
    return;
  }

  // ACK fast — Stripe retries on timeout; process asynchronously.
  res.status(200).json({ received: true, id: event.id });
  setImmediate(() => {
    processStripeWebhookEvent(event).catch((err) => {
      logger.error("[stripeWebhook] async processing failed", {
        eventId: event.id, type: event.type,
        error: err instanceof Error ? err.message : String(err),
      });
    });
  });
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
