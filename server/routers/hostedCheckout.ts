// server/routers/hostedCheckout.ts
// Production-ready hosted payment page backend.
// Handles: Stripe PaymentIntent (card), NIBSS NIP virtual account (bank transfer),
//          USSD reference generation, BNPL instalment plan, USDC wallet address,
//          payment confirmation, TigerBeetle ledger entries, Kafka events,
//          Temporal workflow start, webhook delivery, receipt email.

import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq, and, ne, desc, or, like, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { hostedPaymentSessions, checkoutThemes, paymentLinks, merchantSolanaWallets, fxRates, invoices, invoicePayments } from "../../drizzle/schema";
import { logger } from "../logger";
import { dispatchWebhookEvent } from "../webhookEvents";
import { __partialInternals } from "./arPartialPayments";
import { __feeChoiceInternals } from "./arFeeChoice";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function nanoid(len = 12): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").toUpperCase().slice(0, len);
}

function generateReference(prefix = "PG"): string {
  return `${prefix}_${Date.now()}_${nanoid(8)}`;
}

/**
 * Resolve the merchant that owns the authenticated user. Merchant identity is
 * ALWAYS derived server-side — a client-supplied merchantId is never trusted.
 */
async function resolveMerchantForUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "No merchant account found for this user" });
  return merchant;
}

/**
 * Constant-time shared-secret verification for server-to-server webhooks.
 * FAILS CLOSED: refuses all requests when the secret is not configured.
 */
function verifyWebhookSecret(provided: string | undefined | null, envVar: string): void {
  const expected = process.env[envVar] ?? "";
  if (!expected) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Webhook endpoint not configured (${envVar} unset); refusing unverifiable requests`,
    });
  }
  const ok = !!provided &&
    provided.length === expected.length &&
    timingSafeEqual(Buffer.from(provided), Buffer.from(expected));
  if (!ok) throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
}

/**
 * Verify a Stripe PaymentIntent server-side (status === 'succeeded' and amount
 * matches the session). Any verification failure blocks the money path.
 */
/** Retrieve a Stripe PaymentIntent (raw). Throws SERVICE_UNAVAILABLE on fetch errors. */
async function retrieveStripePaymentIntent(paymentIntentId: string): Promise<{ status?: string; amount?: number }> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Card payments are not configured (STRIPE_SECRET_KEY unset); payment cannot be verified",
    });
  }
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json() as { status?: string; amount?: number };
  } catch (err) {
    if (err instanceof TRPCError) throw err;
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Could not verify payment with Stripe (${err instanceof Error ? err.message : String(err)}); try again shortly`,
    });
  }
}

async function verifyStripePaymentIntent(paymentIntentId: string, expectedAmountKobo: number): Promise<void> {
  const pi = await retrieveStripePaymentIntent(paymentIntentId);
  if (pi.status !== "succeeded") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Payment not completed (Stripe status: ${pi.status ?? "unknown"})` });
  }
  if (Number(pi.amount) !== expectedAmountKobo) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount does not match the checkout session" });
  }
}

/**
 * Refund a succeeded Stripe PaymentIntent (C11: payment arrived AFTER the
 * session expired). FAILS LOUD — a refund error must surface, never be
 * swallowed, because the customer's money is being held.
 */
async function refundStripePaymentIntent(paymentIntentId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Cannot refund the late payment: STRIPE_SECRET_KEY unset",
    });
  }
  let res: Response;
  try {
    res = await fetch("https://api.stripe.com/v1/refunds", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({ payment_intent: paymentIntentId }).toString(),
      signal: AbortSignal.timeout(10000),
    });
  } catch (err) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Late payment could not be refunded (Stripe unreachable: ${err instanceof Error ? err.message : String(err)}) — contact support`,
    });
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Late payment could not be refunded (Stripe HTTP ${res.status}: ${text}) — contact support`,
    });
  }
}

/** Cancel a non-succeeded Stripe PaymentIntent for an expired session. Non-fatal (logged). */
async function cancelStripePaymentIntent(paymentIntentId: string): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) return;
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}/cancel`, {
      method: "POST",
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) {
      logger.warn("[hostedCheckout] expired-session PI cancel returned non-2xx", { paymentIntentId, status: res.status });
    }
  } catch (err) {
    logger.warn("[hostedCheckout] expired-session PI cancel failed", {
      paymentIntentId, error: err instanceof Error ? err.message : String(err),
    });
  }
}

/** True when the session's expiry timestamp is in the past. */
function isSessionExpired(session: { expiresAt?: Date | string | null }): boolean {
  if (!session.expiresAt) return false;
  return new Date(session.expiresAt).getTime() < Date.now();
}

/**
 * Persist a durable outbox row (migration 0099, table `ledger_outbox`) so a
 * failed side effect (TigerBeetle transfer, Kafka publish) is NEVER silently
 * lost. Failures to persist are logged loudly — this is the last-resort
 * fallback, so it must never throw back into the money path.
 */
async function persistOutboxRow(opts: {
  tenantId: string;
  merchantId: string;
  kind: string;
  reference: string;
  amountKobo: number;
  payload: Record<string, unknown>;
  lastError: string;
}): Promise<void> {
  try {
    await db.execute(sql`
      INSERT INTO ledger_outbox
        (tenant_id, merchant_id, kind, reference, amount_kobo, payload, status, attempts, last_error)
      VALUES (
        ${opts.tenantId}, ${opts.merchantId}, ${opts.kind}, ${opts.reference},
        ${opts.amountKobo}, ${JSON.stringify(opts.payload)}::jsonb,
        'pending', 1, ${opts.lastError}
      )
    `);
  } catch (err) {
    logger.error("[hostedCheckout] CRITICAL: ledger_outbox persistence failed — manual reconciliation required", {
      kind: opts.kind,
      reference: opts.reference,
      merchantId: opts.merchantId,
      amountKobo: opts.amountKobo,
      originalError: opts.lastError,
      outboxError: err instanceof Error ? err.message : String(err),
    });
  }
}

/**
 * Fire-and-forget Kafka publish via Go bridge.
 * Returns true when the bridge accepted the publish, false otherwise.
 */
async function publishKafka(topic: string, payload: Record<string, unknown>): Promise<boolean> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return false;
  try {
    const res = await fetch(`${url}/kafka/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ topic, payload }),
      signal: AbortSignal.timeout(3000),
    });
    return res.ok;
  } catch {
    return false;
  }
}

/**
 * Kafka publish for the payment.completed money event: on failure a durable
 * ledger_outbox row (kind='kafka.payment.completed') is written so the event
 * can be replayed — an empty catch is never acceptable on the settled path.
 */
async function publishPaymentCompleted(
  tenantId: string,
  merchantId: string,
  payload: Record<string, unknown>,
): Promise<void> {
  const topic = `${tenantId}.payment.completed`;
  const ok = await publishKafka(topic, payload);
  if (ok) return;
  logger.error("[hostedCheckout] Kafka payment.completed publish failed — persisting to ledger_outbox", {
    topic, reference: payload.reference, merchantId,
  });
  await persistOutboxRow({
    tenantId,
    merchantId,
    kind: "kafka.payment.completed",
    reference: String(payload.reference ?? ""),
    amountKobo: Number(payload.amountKobo ?? 0),
    payload: { topic, ...payload },
    lastError: "kafka publish failed (bridge unreachable or non-2xx)",
  });
}

/**
 * Record TigerBeetle double-entry transfer via the Go bridge's REAL ledger
 * route (POST /v1/ledger/transfer → handlers.CreateLedgerTransfer, backed by
 * the TigerBeetle client). On ANY failure a durable ledger_outbox row is
 * persisted and the error is logged loudly — null is returned only AFTER the
 * outbox write, so the settlement is never silently dropped.
 */
async function recordTBTransfer(opts: {
  amountKobo: number;
  merchantId: string;
  tenantId: string;
  reference: string;
}): Promise<bigint | null> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  const body = {
    debitAccountId: "1001",   // Customer liability
    creditAccountId: "2001",  // Merchant settlement
    amount: opts.amountKobo,
    ledger: 1,
    code: 1000,               // Hosted payment code
  };
  const fail = async (reason: string): Promise<null> => {
    logger.error("[hostedCheckout] TigerBeetle transfer failed — persisting to ledger_outbox", {
      reference: opts.reference, merchantId: opts.merchantId, amountKobo: opts.amountKobo, reason,
    });
    await persistOutboxRow({
      tenantId: opts.tenantId,
      merchantId: opts.merchantId,
      kind: "ledger.transfer",
      reference: opts.reference,
      amountKobo: opts.amountKobo,
      payload: { ...body, userData: opts.reference },
      lastError: reason,
    });
    return null;
  };
  if (!url) return fail("MIDDLEWARE_BRIDGE_URL unset");
  try {
    const res = await fetch(`${url}/v1/ledger/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      const text = await res.text().catch(() => res.statusText);
      return fail(`HTTP ${res.status}: ${text}`);
    }
    const json = await res.json() as { transferId?: string };
    if (!json.transferId) return fail("bridge returned no transferId");
    // The bridge returns the transfer id as a UUID; derive a stable numeric id.
    return BigInt(parseInt(json.transferId.replace(/-/g, "").slice(0, 15), 16));
  } catch (err) {
    return fail(err instanceof Error ? err.message : String(err));
  }
}

/** Start Temporal payment confirmation workflow */
async function startTemporalWorkflow(sessionId: string, merchantId: string): Promise<string | null> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/temporal/start`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        namespace: process.env.TEMPORAL_NAMESPACE ?? "default",
        taskQueue: "payment-confirmation",
        workflowType: "PaymentConfirmationWorkflow",
        workflowId: `payment-${sessionId}`,
        input: { sessionId, merchantId },
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { workflowId?: string };
    return json.workflowId ?? null;
  } catch { return null; }
}

/** Create Stripe PaymentIntent */
async function createStripePaymentIntent(opts: {
  amountKobo: number;
  currency: string;
  reference: string;
  merchantId: string;
  description?: string;
}): Promise<{ id: string; clientSecret: string } | null> {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  try {
    const res = await fetch("https://api.stripe.com/v1/payment_intents", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: new URLSearchParams({
        amount: String(opts.amountKobo),
        currency: opts.currency.toLowerCase(),
        "payment_method_types[]": "card",
        "metadata[reference]": opts.reference,
        "metadata[merchantId]": opts.merchantId,
        ...(opts.description ? { description: opts.description } : {}),
      }).toString(),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    const pi = await res.json() as { id: string; client_secret: string };
    return { id: pi.id, clientSecret: pi.client_secret };
  } catch { return null; }
}

/**
 * Generate NIBSS NIP virtual account via Go bridge.
 * FAILS LOUD — throws when the bridge is unconfigured or errors. A fabricated
 * account number at a non-existent bank must NEVER be presented to a customer
 * as a real transfer destination.
 */
async function generateNIPVirtualAccount(opts: {
  amountKobo: number;
  reference: string;
  merchantId: string;
  customerName?: string;
  expiresInMinutes?: number;
}): Promise<{ accountNumber: string; bankCode: string; bankName: string; sessionId: string; expiresAt: Date }> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL ?? process.env.NIBSS_GATEWAY_URL;
  if (!url) {
    throw new Error(
      "Bank transfer is temporarily unavailable (NIP virtual account service not configured). Please choose another payment method or try again later."
    );
  }
  let res: Response;
  try {
    res = await fetch(`${url}/nip/virtual-account`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
        "X-NIP-Key": process.env.NIP_API_KEY ?? "",
      },
      body: JSON.stringify({
        amountKobo: opts.amountKobo,
        reference: opts.reference,
        merchantId: opts.merchantId,
        customerName: opts.customerName ?? "Customer",
        expiresInMinutes: opts.expiresInMinutes ?? 30,
      }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new Error(
      `Bank transfer is temporarily unavailable (NIP service unreachable: ${err instanceof Error ? err.message : String(err)}). Please choose another payment method or try again later.`
    );
  }
  if (!res.ok) {
    const text = await res.text().catch(() => res.statusText);
    throw new Error(
      `Bank transfer is temporarily unavailable (NIP service error HTTP ${res.status}: ${text}). Please choose another payment method or try again later.`
    );
  }
  const json = await res.json() as {
    accountNumber: string; bankCode: string; bankName: string;
    sessionId: string; expiresAt: string;
  };
  if (!json.accountNumber || !json.bankCode) {
    throw new Error(
      "Bank transfer is temporarily unavailable (NIP service returned an invalid virtual account). Please choose another payment method or try again later."
    );
  }
  return { ...json, expiresAt: new Date(json.expiresAt) };
}

/** Generate USSD payment reference */
function generateUSSDCode(opts: { bankCode: string; reference: string; amountKobo: number }): {
  ussdCode: string; reference: string; bankCode: string;
} {
  // Standard Nigerian bank USSD patterns
  const bankUSSD: Record<string, string> = {
    "058": "*737",   // GTBank
    "011": "*894",   // First Bank
    "044": "*901",   // Access Bank
    "057": "*822",   // Zenith Bank
    "033": "*919",   // UBA
    "232": "*833",   // Sterling Bank
    "000": "*737",   // Default
  };
  const prefix = bankUSSD[opts.bankCode] ?? "*737";
  const shortRef = opts.reference.slice(-6);
  return {
    ussdCode: `${prefix}*000*${shortRef}#`,
    reference: opts.reference,
    bankCode: opts.bankCode,
  };
}

/** Send receipt email via SMTP */
async function sendReceiptEmail(opts: {
  to: string;
  customerName: string;
  amountKobo: number;
  currency: string;
  reference: string;
  merchantName: string;
  description?: string;
}) {
  const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!bridgeUrl && !process.env.SMTP_HOST) return;
  try {
    const endpoint = bridgeUrl ? `${bridgeUrl}/email/send` : `http://localhost:${process.env.SMTP_PORT ?? 587}/send`;
    await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        to: opts.to,
        subject: `Payment Receipt — ${opts.reference}`,
        html: `
          <div style="font-family:Inter,sans-serif;max-width:560px;margin:0 auto;padding:32px;background:#fff;border-radius:12px;border:1px solid #e5e7eb">
            <div style="text-align:center;margin-bottom:24px">
              <h1 style="color:#10B981;font-size:24px;margin:0">✓ Payment Confirmed</h1>
            </div>
            <table style="width:100%;border-collapse:collapse;margin-bottom:24px">
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Amount</td>
                  <td style="padding:8px 0;text-align:right;font-weight:700;font-size:18px;font-family:monospace">
                    ${opts.currency} ${(opts.amountKobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
                  </td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Merchant</td>
                  <td style="padding:8px 0;text-align:right;font-size:14px">${opts.merchantName}</td></tr>
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Reference</td>
                  <td style="padding:8px 0;text-align:right;font-size:12px;font-family:monospace;color:#4F46E5">${opts.reference}</td></tr>
              ${opts.description ? `<tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Description</td>
                  <td style="padding:8px 0;text-align:right;font-size:14px">${opts.description}</td></tr>` : ""}
              <tr><td style="padding:8px 0;color:#6b7280;font-size:14px">Date</td>
                  <td style="padding:8px 0;text-align:right;font-size:14px">${new Date().toLocaleString("en-NG")}</td></tr>
            </table>
            <p style="color:#6b7280;font-size:12px;text-align:center">Powered by <strong>PayGate</strong> — CBN Licensed PSP</p>
          </div>
        `,
        text: `Payment of ${opts.currency} ${(opts.amountKobo / 100).toLocaleString()} to ${opts.merchantName} confirmed. Reference: ${opts.reference}`,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch { /* non-blocking */ }
}

/**
 * P2-c: when a hosted session is bound to an AR invoice (invoiceId stored in
 * the session metadata at initiation), record the invoice_payments ledger row
 * and recompute the invoice status (partially_paid → paid) via the SAME
 * semantics as arPartialPayments.recordInvoicePayment. Runs ONLY on the
 * atomic completion-transition winner (confirmPayment / nipWebhook — the
 * sole ledger writers for card and bank transfer respectively), mirroring
 * the single-writer invariant for side effects. Non-fatal: the hosted
 * session is already settled — a ledger hiccup must never fail the
 * customer-facing confirmation.
 */
async function settleLinkedInvoice(session: typeof hostedPaymentSessions.$inferSelect): Promise<void> {
  const meta = ((session.metadata as Record<string, string> | null) ?? {});
  const invoiceId = meta.invoiceId;
  if (!invoiceId) return;
  try {
    const feeKobo = Number(meta.feeKobo ?? "0") || 0;
    // Principal applied toward the invoice excludes the processing surcharge
    // (the fee is merchant revenue, not invoice balance).
    const principalKobo = Number(meta.baseAmountKobo ?? "0") || (Number(session.amountKobo) - feeKobo);
    // H11 (overpayment race): reserve the amount on the invoice with a single
    // guarded UPDATE FIRST — paid_kobo + x must never exceed total_kobo. Two
    // concurrent settlements cannot both pass; the loser is flagged as excess
    // instead of inserting a duplicate invoice_payments row.
    const guardRes: any = await db.execute(sql`
      UPDATE invoices
      SET paid_kobo = COALESCE(paid_kobo, 0) + ${principalKobo},
          updated_at = now()
      WHERE invoice_id = ${invoiceId}
        AND COALESCE(paid_kobo, 0) + ${principalKobo} <= total_kobo
      RETURNING invoice_id
    `);
    const guardRows = (guardRes?.rows ?? guardRes ?? []) as unknown[];
    if (guardRows.length === 0) {
      logger.error("[hostedCheckout] EXCESS invoice payment detected — settlement skipped, manual refund/reconciliation required", {
        sessionId: session.id,
        invoiceId,
        principalKobo,
        reference: session.reference,
      });
      await persistOutboxRow({
        tenantId: session.tenantId,
        merchantId: session.merchantId,
        kind: "invoice.excess_payment",
        reference: session.reference,
        amountKobo: principalKobo,
        payload: { invoiceId, sessionId: session.id, reason: "paid_kobo + amount would exceed total_kobo" },
        lastError: "invoice overpayment guard rejected settlement",
      });
      return;
    }
    await __partialInternals.applyInvoicePayment(db, {
      invoiceId,
      amountKobo: Math.max(0, principalKobo),
      method: session.paymentMethod ?? "card",
      reference: session.reference,
      meta: feeKobo > 0 ? { feeKobo, feePolicy: meta.feePolicy ?? "customer_pays" } : undefined,
    });
  } catch (err) {
    logger.error("[hostedCheckout] linked-invoice ledger update failed", {
      sessionId: session.id,
      invoiceId,
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const hostedCheckoutRouter = router({

  // ── Get payment link details for the hosted page ──────────────────────────
  getPaymentLinkDetails: publicProcedure
    .input(z.object({ slug: z.string() }))
    .query(async ({ input }) => {
      const [link] = await db.select().from(paymentLinks)
        .where(eq(paymentLinks.slug, input.slug));
      if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
      if (!link.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "This payment link is no longer active" });

      // Load merchant checkout theme
      const [theme] = await db.select().from(checkoutThemes)
        .where(eq(checkoutThemes.merchantId, link.merchantId));

      return { link, theme: theme ?? null };
    }),

  // ── Initiate a payment session ────────────────────────────────────────────
  initiatePayment: publicProcedure
    .input(z.object({
      paymentLinkId: z.string().optional(),
      merchantId: z.string(),
      tenantId: z.string(),
      // Optional for invoice-bound links: when omitted, the SERVER charges the
      // invoice balance due. For plain payment links it remains required.
      amountKobo: z.number().int().positive().optional(),
      currency: z.string().default("NGN"),
      description: z.string().optional(),
      paymentMethod: z.enum(["card", "bank_transfer", "ussd", "bnpl", "usdc"]),
      // Customer info
      customerEmail: z.string().email().optional(),
      customerName: z.string().optional(),
      customerPhone: z.string().optional(),
      // USSD bank choice
      ussdBankCode: z.string().optional(),
      // BNPL
      bnplProvider: z.enum(["carbon", "fairmoney", "creditcorp"]).optional(),
      bnplInstallmentCount: z.number().int().min(2).max(12).optional(),
      // Metadata
      metadata: z.record(z.string(), z.string()).optional(),
      ipAddress: z.string().optional(),
      userAgent: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const reference = generateReference("PG");
      const expiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 min

      // Resolve the authoritative merchant + tenant SERVER-SIDE. A client-supplied
      // merchantId is never trusted on its own: it must either match the payment
      // link being paid, or (for authenticated merchants) the session's merchant.
      let merchantId: string;
      let tenantId: string;
      // P1-c/P2-c: an AR invoice bound to this payment link (resolved below).
      let linkedInvoice: typeof invoices.$inferSelect | null = null;
      // C12: the resolved link — its fixed amount/currency override client input.
      let resolvedLink: typeof paymentLinks.$inferSelect | null = null;
      if (input.paymentLinkId) {
        const [link] = await db.select().from(paymentLinks)
          .where(eq(paymentLinks.id, input.paymentLinkId));
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
        if (link.merchantId !== input.merchantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "merchantId does not match the payment link" });
        }
        // C12: an inactive link must never accept new sessions.
        if (!link.isActive) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "This payment link is no longer active" });
        }
        // C12: atomically claim one usage slot BEFORE creating the session —
        // the guarded UPDATE admits only active links below their usage limit,
        // so a racing burst cannot exceed usageLimit.
        const [claimed] = await db.update(paymentLinks).set({
          usageCount: sql`${paymentLinks.usageCount} + 1`,
          updatedAt: new Date(),
        }).where(and(
          eq(paymentLinks.id, link.id),
          eq(paymentLinks.isActive, true),
          or(
            sql`${paymentLinks.usageLimit} IS NULL`,
            sql`${paymentLinks.usageCount} < ${paymentLinks.usageLimit}`,
          ),
        )).returning();
        if (!claimed) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "This payment link has reached its usage limit",
          });
        }
        resolvedLink = link;
        merchantId = link.merchantId;
        tenantId = link.tenantId;
        // AR invoice linkage: invoice.paymentLinkUrl carries the link id/slug.
        const [inv] = await db.select().from(invoices)
          .where(and(
            eq(invoices.merchantId, merchantId),
            or(
              like(invoices.paymentLinkUrl, `%${link.id}%`),
              like(invoices.paymentLinkUrl, `%${link.slug}%`),
            ),
          ))
          .limit(1);
        linkedInvoice = inv ?? null;
      } else if (ctx.user) {
        const merchant = await resolveMerchantForUser(ctx.user.openId);
        merchantId = merchant.id;
        tenantId = merchant.tenantId;
      } else {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: "paymentLinkId is required for public checkout initiation",
        });
      }

      // ── Server-side amount resolution (P1-c fee choice / P2-c partial) ────
      // Every money total is computed HERE from the invoice row — client
      // totals are never trusted.
      // Assigned in exactly one of the three branches below; every branch
      // either assigns or throws. TS cannot see the assignment inside the
      // advisory-lock transaction closure, hence the initializer.
      let baseAmountKobo = 0;
      let feeKobo = 0;
      // C12: currency is resolved server-side — a fixed-amount link forces its
      // own currency; a mismatched client currency is rejected outright.
      let resolvedCurrency = (input.currency ?? "NGN").toUpperCase();
      if (resolvedLink?.amount != null) {
        if (input.currency && input.currency.toUpperCase() !== (resolvedLink.currency ?? "NGN").toUpperCase()) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Currency mismatch: this payment link charges ${resolvedLink.currency}`,
          });
        }
        resolvedCurrency = (resolvedLink.currency ?? "NGN").toUpperCase();
      }
      if (linkedInvoice) {
        if (linkedInvoice.status === "paid") {
          throw new TRPCError({ code: "CONFLICT", message: "This invoice is already paid" });
        }
        // H11: serialize concurrent initiations for THIS invoice — the balance
        // computation below runs under a per-invoice advisory lock so two
        // racing sessions can never both charge the same remaining balance.
        await db.transaction(async (tx) => {
          await tx.execute(sql`SELECT pg_advisory_xact_lock(hashtext(${linkedInvoice!.invoiceId}))`);
          const paidRows = await tx.select().from(invoicePayments)
            .where(eq(invoicePayments.invoiceId, linkedInvoice!.invoiceId));
          const paidSoFar = __partialInternals.sumPaymentsKobo(paidRows);
          const balanceDue = Math.max(0, Number(linkedInvoice!.totalKobo) - paidSoFar);
          if (balanceDue <= 0) {
            throw new TRPCError({ code: "CONFLICT", message: "This invoice has no balance due" });
          }
          const amount = input.amountKobo ?? balanceDue;
          if (amount > balanceDue) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Amount exceeds the balance due (${balanceDue} kobo)`,
            });
          }
          if (amount < balanceDue && linkedInvoice!.allowPartial === false) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This invoice does not allow partial payments — pay the full balance due",
            });
          }
          if (amount < 100) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum amount is ₦1 (100 kobo)" });
          }
          baseAmountKobo = amount;
        });
        // Disclosed card surcharge when the merchant passes the fee on (P1-c).
        if ((linkedInvoice.feePolicy ?? "merchant_absorbs") === "customer_pays" && input.paymentMethod === "card") {
          const bps = await __feeChoiceInternals.resolveSurchargeBps(linkedInvoice);
          feeKobo = __feeChoiceInternals.computeSurchargeKobo(baseAmountKobo, bps);
        }
      } else if (resolvedLink?.amount != null) {
        // C12: fixed-amount link — the SERVER forces the link's amount; any
        // client-supplied amount is ignored (tamper-proof).
        baseAmountKobo = Number(resolvedLink.amount);
        if (baseAmountKobo < 10000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum amount is ₦100 (10000 kobo)" });
        }
      } else {
        if (input.amountKobo == null) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "amountKobo is required" });
        }
        baseAmountKobo = input.amountKobo;
        if (baseAmountKobo < 10000) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Minimum amount is ₦100 (10000 kobo)" });
        }
      }
      const totalChargeKobo = baseAmountKobo + feeKobo;

      // F-PARITY: enforce customer risk action — denied customers cannot initiate charges
      if (input.customerEmail) {
        const { assertCustomerNotDenied } = await import("./customerRisk");
        await assertCustomerNotDenied(merchantId, input.customerEmail);
      }

      // M17: ipAddress/userAgent are derived from the TRANSPORT (ctx.req) —
      // client-supplied values are only a fallback when the transport lacks
      // them, so an attacker cannot spoof audit fields.
      const fwdFor = ctx.req?.headers?.["x-forwarded-for"];
      const reqIp = (Array.isArray(fwdFor) ? fwdFor[0] : fwdFor)?.split(",")[0]?.trim()
        || (ctx.req as { socket?: { remoteAddress?: string } } | undefined)?.socket?.remoteAddress
        || undefined;
      const reqUaHeader = ctx.req?.headers?.["user-agent"];
      const reqUa = (Array.isArray(reqUaHeader) ? reqUaHeader[0] : reqUaHeader) || undefined;
      const ipAddress = reqIp ?? input.ipAddress;
      const userAgent = reqUa ?? input.userAgent;

      // M17: any callback/redirect URL carried in metadata must be https —
      // plaintext or javascript: URLs are never persisted.
      for (const [key, value] of Object.entries(input.metadata ?? {})) {
        if (/url|callback|redirect/i.test(key) && !/^https:\/\//i.test(value)) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `metadata.${key} must be an https:// URL`,
          });
        }
      }

      // Base session data
      const sessionData: Partial<typeof hostedPaymentSessions.$inferInsert> = {
        paymentLinkId: input.paymentLinkId,
        merchantId,
        tenantId,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        amountKobo: totalChargeKobo,
        currency: resolvedCurrency,
        description: input.description,
        reference,
        status: "processing",
        paymentMethod: input.paymentMethod,
        metadata: {
          ...(input.metadata ?? {}),
          ...(linkedInvoice ? {
            invoiceId: linkedInvoice.invoiceId,
            baseAmountKobo: String(baseAmountKobo),
            ...(feeKobo > 0 ? { feeKobo: String(feeKobo), feePolicy: "customer_pays" } : {}),
          } : {}),
        },
        ipAddress,
        userAgent,
        expiresAt,
      };

      // ── Card: Stripe PaymentIntent ────────────────────────────────────────
      if (input.paymentMethod === "card") {
        const pi = await createStripePaymentIntent({
          amountKobo: totalChargeKobo,
          currency: resolvedCurrency,
          reference,
          merchantId,
          description: input.description,
        });
        if (pi) {
          sessionData.stripePaymentIntentId = pi.id;
          sessionData.stripeClientSecret = pi.clientSecret;
        }
      }

      // ── Bank Transfer: NIBSS NIP Virtual Account ──────────────────────────
      if (input.paymentMethod === "bank_transfer") {
        // Fail the whole checkout loudly if the real account cannot be issued —
        // never present a fabricated account number to the customer.
        let va;
        try {
          va = await generateNIPVirtualAccount({
            amountKobo: totalChargeKobo,
            reference,
            merchantId,
            customerName: input.customerName,
            expiresInMinutes: 30,
          });
        } catch (err) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: err instanceof Error ? err.message : "Bank transfer is temporarily unavailable.",
          });
        }
        sessionData.nipVirtualAccountNumber = va.accountNumber;
        sessionData.nipBankCode = va.bankCode;
        sessionData.nipBankName = va.bankName;
        sessionData.nipSessionId = va.sessionId;
        sessionData.nipExpiresAt = va.expiresAt;
      }

      // ── USSD: Generate dial code ──────────────────────────────────────────
      if (input.paymentMethod === "ussd") {
        const ussd = generateUSSDCode({
          bankCode: input.ussdBankCode ?? "000",
          reference,
          amountKobo: totalChargeKobo,
        });
        sessionData.ussdCode = ussd.ussdCode;
        sessionData.ussdReference = ussd.reference;
        sessionData.ussdBankCode = ussd.bankCode;
      }

      // ── BNPL: not integrated — fail loud, never fabricate an approval URL ──
      if (input.paymentMethod === "bnpl") {
        // R4 F13 (spec #13/#20): there is NO Carbon/FairMoney BNPL approval
        // integration. The previous code fabricated a `https://app.<provider>.ng`
        // approval URL the customer could never complete. Fail honestly instead.
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "BNPL checkout is unavailable: no BNPL provider approval API is integrated. Choose another payment method.",
        });
      }

      // ── USDC: merchant's registered deposit address + stored FX rate ──────
      if (input.paymentMethod === "usdc") {
        // R4 F1/F13 (spec #13/#20): the deposit address MUST be the merchant's
        // registered wallet (a fabricated 0x... address would lose customer
        // funds), and the USDC amount MUST come from a stored FX rate (no
        // hardcoded /1500). Fail loud when either is missing.
        const [depositWallet] = await db.select().from(merchantSolanaWallets)
          .where(and(
            eq(merchantSolanaWallets.merchantId, merchantId),
            eq(merchantSolanaWallets.isActive, true),
          ))
          .orderBy(desc(merchantSolanaWallets.createdAt))
          .limit(1);
        if (!depositWallet) {
          throw new TRPCError({
            code: "SERVICE_UNAVAILABLE",
            message: "USDC checkout is unavailable: this merchant has no registered active USDC deposit wallet. Register one before enabling USDC.",
          });
        }
        const baseCurrency = resolvedCurrency;
        // H13: integer math with explicit rounding — never float-divide money.
        // usdcAmountUsdc is derived in micro-USDC (1e-6 USDC) integers and only
        // converted to the `real` column's decimal at the very end.
        let usdcAmountUsdc: number;
        if (baseCurrency === "USD") {
          usdcAmountUsdc = totalChargeKobo / 100; // exact 2dp conversion
        } else {
          const [fx] = await db.select().from(fxRates)
            .where(and(
              eq(fxRates.baseCurrency, baseCurrency),
              eq(fxRates.targetCurrency, "USD"),
            ))
            .orderBy(desc(fxRates.fetchedAt))
            .limit(1);
          const rate = fx ? Number(fx.rate) : NaN;
          if (!Number.isFinite(rate) || rate <= 0) {
            throw new TRPCError({
              code: "NOT_FOUND",
              message: `USDC checkout is unavailable: no stored FX rate for ${baseCurrency}->USD (fx_rates)`,
            });
          }
          // H13: stale rates are rejected — FX older than 15 minutes is not a
          // price we are willing to settle at.
          const FX_MAX_AGE_MS = 15 * 60 * 1000;
          if (!fx!.fetchedAt || Date.now() - new Date(fx!.fetchedAt).getTime() > FX_MAX_AGE_MS) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: `USDC checkout is unavailable: ${baseCurrency}->USD FX rate is stale (fetched ${fx!.fetchedAt ? new Date(fx!.fetchedAt).toISOString() : "never"}); try again shortly`,
            });
          }
          // rate = USD per 1 base unit. Scale to integers: rateScaled = rate*1e10.
          // microUsdc = round(totalKobo/100 * 1e6 / rate)
          //           = round(totalKobo * 1e6 * 1e10 / (100 * rateScaled))
          const rateScaled = Math.round(rate * 1e10);
          if (rateScaled <= 0) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: `USDC checkout is unavailable: ${baseCurrency}->USD FX rate is invalid`,
            });
          }
          const microUsdc = Math.round((totalChargeKobo * 1e16) / (100 * rateScaled));
          usdcAmountUsdc = microUsdc / 1e6;
        }
        sessionData.usdcWalletAddress = depositWallet.walletAddress;
        sessionData.usdcAmountUsdc = usdcAmountUsdc;
        sessionData.usdcNetwork = "solana";
      }

      const [session] = await db.insert(hostedPaymentSessions).values(sessionData as any).returning();

      // Publish Kafka event
      await publishKafka(`${tenantId}.payment.initiated`, {
        sessionId: session.id,
        reference,
        merchantId,
        amountKobo: totalChargeKobo,
        paymentMethod: input.paymentMethod,
      });

      return session;
    }),

  // ── Poll payment status ───────────────────────────────────────────────────
  getStatus: publicProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ input }) => {
      const [session] = await db.select().from(hostedPaymentSessions)
        .where(eq(hostedPaymentSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });

      // Projected (reported) status — NEVER written back to the row from here.
      let status = session.status;
      let paidAt = session.paidAt;

      // C11: an out-of-date session is expired regardless of the stored status.
      if (status !== "completed" && status !== "failed" && isSessionExpired(session)) {
        if (session.paymentMethod !== "bank_transfer") {
          // Non-bank methods: lazily persist the expiry (guarded — terminal
          // states are never rewritten).
          await db.update(hostedPaymentSessions).set({
            status: "expired",
            updatedAt: new Date(),
          }).where(and(
            eq(hostedPaymentSessions.id, session.id),
            ne(hostedPaymentSessions.status, "completed"),
            ne(hostedPaymentSessions.status, "failed"),
          ));
        }
        // C3: for bank_transfer the poll is strictly READ-ONLY — the signed
        // nipWebhook is the sole writer. Expiry is reported as a projection.
        status = "expired";
      }

      // C3: bank transfer polling is READ-ONLY. The bridge-reported status is
      // surfaced as a PROJECTION only — the signed nipWebhook remains the sole
      // writer of `completed` (it alone records the TigerBeetle ledger credit).
      if (session.paymentMethod === "bank_transfer" && status === "processing" && session.nipSessionId) {
        const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
        if (bridgeUrl) {
          try {
            const res = await fetch(`${bridgeUrl}/nip/session-status/${session.nipSessionId}`, {
              headers: { "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const json = await res.json() as { status: string; paidAt?: string };
              if (json.status === "paid") {
                status = "bridge_reported_paid"; // projection — row unchanged
                if (json.paidAt) paidAt = new Date(json.paidAt);
              }
            }
          } catch { /* non-blocking */ }
        }
      }

      // M18: whitelisted DTO only — never leak PII, stripeClientSecret, or the
      // NIP virtual-account number through the public polling endpoint.
      return {
        reference: session.reference,
        status,
        amountKobo: Number(session.amountKobo),
        currency: session.currency,
        paidAt,
        paymentMethod: session.paymentMethod,
      };
    }),

  // ── Confirm payment (called after Stripe.js confirms card) ────────────────
  confirmPayment: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      stripePaymentIntentId: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const [session] = await db.select().from(hostedPaymentSessions)
        .where(eq(hostedPaymentSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.status === "completed") return { success: true, session }; // idempotent replay
      if (session.status === "expired") throw new TRPCError({ code: "BAD_REQUEST", message: "Session expired" });

      // Non-card methods (bank_transfer/ussd/bnpl/usdc) can ONLY be confirmed by
      // the payment provider's signed webhook — never by an unauthenticated client.
      if (session.paymentMethod !== "card") {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: `${session.paymentMethod} payments are confirmed by the payment provider webhook, not by this endpoint`,
        });
      }
      if (!session.stripePaymentIntentId) {
        throw new TRPCError({
          code: "PRECONDITION_FAILED",
          message: "This session has no Stripe PaymentIntent; the payment cannot be verified",
        });
      }
      if (input.stripePaymentIntentId && input.stripePaymentIntentId !== session.stripePaymentIntentId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "stripePaymentIntentId does not match this session" });
      }

      // C11: sessions EXPIRE. The Stripe PI is verified FIRST so the correct
      // terminal state is chosen:
      //  * PI succeeded after expiry → REFUND the customer (fail loud on refund
      //    errors) and mark the session `expired_refunded`.
      //  * PI not succeeded → mark `expired` and best-effort cancel the PI.
      if (isSessionExpired(session)) {
        const pi = await retrieveStripePaymentIntent(session.stripePaymentIntentId);
        const nowExp = new Date();
        if (pi.status === "succeeded" && Number(pi.amount) === Number(session.amountKobo)) {
          await refundStripePaymentIntent(session.stripePaymentIntentId);
          await db.update(hostedPaymentSessions).set({
            status: "expired_refunded",
            failureReason: "payment arrived after session expiry — refunded",
            updatedAt: nowExp,
          }).where(and(
            eq(hostedPaymentSessions.id, session.id),
            ne(hostedPaymentSessions.status, "completed"),
          ));
          logger.error("[hostedCheckout] late card payment refunded (session expired)", {
            sessionId: session.id, reference: session.reference,
          });
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: "Session expired — the late payment has been refunded to your card",
          });
        }
        await db.update(hostedPaymentSessions).set({
          status: "expired",
          updatedAt: nowExp,
        }).where(and(
          eq(hostedPaymentSessions.id, session.id),
          ne(hostedPaymentSessions.status, "completed"),
        ));
        await cancelStripePaymentIntent(session.stripePaymentIntentId);
        throw new TRPCError({ code: "BAD_REQUEST", message: "Session expired" });
      }

      // Card: proof of payment REQUIRED — verify the PaymentIntent with Stripe.
      await verifyStripePaymentIntent(session.stripePaymentIntentId, Number(session.amountKobo));

      const now = new Date();

      // Atomic status flip: exactly one concurrent/replayed caller transitions the
      // session. TigerBeetle credit + side effects happen ONLY on the transition.
      const [flipped] = await db.update(hostedPaymentSessions).set({
        status: "completed",
        paidAt: now,
        updatedAt: now,
      }).where(and(
        eq(hostedPaymentSessions.id, session.id),
        ne(hostedPaymentSessions.status, "completed"),
      )).returning();
      if (!flipped) return { success: true, session }; // lost the race — already completed

      // P2-c: settle the linked AR invoice ledger (partial → paid). Non-fatal.
      await settleLinkedInvoice(session);

      // Record TigerBeetle transfer (only the transition winner reaches here)
      const tbId = await recordTBTransfer({
        amountKobo: Number(session.amountKobo),
        merchantId: session.merchantId,
        tenantId: session.tenantId,
        reference: session.reference,
      });

      // Start Temporal workflow
      const workflowId = await startTemporalWorkflow(session.id, session.merchantId);

      if (tbId || workflowId) {
        await db.update(hostedPaymentSessions).set({
          tigerBeetleTransferId: tbId ? Number(tbId) : undefined,
          temporalWorkflowId: workflowId ?? undefined,
          updatedAt: new Date(),
        }).where(eq(hostedPaymentSessions.id, session.id));
      }

      // Publish Kafka payment.completed event (durable outbox on failure)
      await publishPaymentCompleted(session.tenantId, session.merchantId, {
        sessionId: session.id,
        reference: session.reference,
        merchantId: session.merchantId,
        amountKobo: Number(session.amountKobo),
        paymentMethod: session.paymentMethod,
        tigerBeetleTransferId: tbId?.toString(),
        temporalWorkflowId: workflowId,
      });

      // F-PARITY: post-completion hooks (non-blocking; failures logged loudly,
      // never swallowed silently — surfaced for ops reconciliation)
      const parityMeta = ((session.metadata as Record<string, string> | null) ?? {});
      if (parityMeta.split_code) {
        import("./splitPayments").then(({ recordSplitSettlement }) =>
          recordSplitSettlement({
            merchantId: session.merchantId,
            splitCode: parityMeta.split_code!,
            reference: session.reference,
            amountKobo: Number(session.amountKobo),
          })
        ).catch((e) => logger.error("[hostedCheckout] split settlement failed", { sessionId: session.id, splitCode: parityMeta.split_code, error: e instanceof Error ? e.message : String(e) }));
      }
      if (session.paymentMethod === "card" && parityMeta.pan_fingerprint && session.customerEmail) {
        import("./cardTokenization").then(({ recordAuthorizationFromCharge }) =>
          recordAuthorizationFromCharge({
            merchantId: session.merchantId,
            customerEmail: session.customerEmail!,
            panFingerprint: parityMeta.pan_fingerprint,
            bin: parityMeta.card_bin,
            last4: parityMeta.card_last4,
            brand: parityMeta.card_brand,
            cardType: parityMeta.card_type,
            bank: parityMeta.card_bank,
            expMonth: parityMeta.card_exp_month,
            expYear: parityMeta.card_exp_year,
            channel: "card",
          })
        ).catch((e) => logger.error("[hostedCheckout] card authorization tokenization failed", { sessionId: session.id, error: e instanceof Error ? e.message : String(e) }));
      }

      // Send receipt email (fire-and-forget)
      if (session.customerEmail) {
        sendReceiptEmail({
          to: session.customerEmail,
          customerName: session.customerName ?? "Customer",
          amountKobo: Number(session.amountKobo),
          currency: session.currency,
          reference: session.reference,
          merchantName: session.merchantId, // In production: resolve merchant name from DB
          description: session.description ?? undefined,
        }).then(() => {
          db.update(hostedPaymentSessions).set({ receiptEmailSentAt: new Date() })
            .where(eq(hostedPaymentSessions.id, session.id))
            .catch((e) => logger.error("[hostedCheckout] receiptEmailSentAt persistence failed", { sessionId: session.id, error: e instanceof Error ? e.message : String(e) }));
        }).catch((e) => logger.error("[hostedCheckout] receipt email send failed", { sessionId: session.id, error: e instanceof Error ? e.message : String(e) }));
      }

      return { success: true, session: { ...session, status: "completed", paidAt: now } };
    }),

  // ── NIBSS NIP webhook (bank transfer confirmed) ───────────────────────────
  nipWebhook: publicProcedure
    .input(z.object({
      nipSessionId: z.string(),
      status: z.enum(["paid", "failed", "expired"]),
      paidAt: z.string().optional(),
      amount: z.number().optional(),
      // Shared-secret signature (also accepted via the x-nip-signature header).
      signature: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // Authenticate the caller BEFORE touching any state. Fail closed when
      // NIP_WEBHOOK_SECRET is unset or the signature does not match.
      const headerSig = ctx.req.headers["x-nip-signature"];
      verifyWebhookSecret(
        input.signature ?? (Array.isArray(headerSig) ? headerSig[0] : headerSig),
        "NIP_WEBHOOK_SECRET",
      );

      const [session] = await db.select().from(hostedPaymentSessions)
        .where(eq(hostedPaymentSessions.nipSessionId, input.nipSessionId));
      if (!session) return { received: true, matched: false };

      if (input.status === "paid") {
        // C17: the paid amount MUST be present and EXACTLY equal to the
        // session amount (integer kobo comparison). A mismatch is never
        // completed — it is recorded, surfaced via webhook event, and returned
        // as an explicit rejection.
        if (input.amount == null || Number(input.amount) !== Number(session.amountKobo)) {
          const reason = input.amount == null ? "amount_missing" : "wrong_amount";
          logger.error("[hostedCheckout] NIP webhook amount rejected", {
            sessionId: session.id,
            reference: session.reference,
            expectedKobo: Number(session.amountKobo),
            receivedAmount: input.amount ?? null,
            reason,
          });
          await db.update(hostedPaymentSessions).set({
            metadata: {
              ...((session.metadata as Record<string, string> | null) ?? {}),
              nip_rejection: reason,
              nip_received_amount: input.amount == null ? "" : String(input.amount),
            },
            updatedAt: new Date(),
          }).where(eq(hostedPaymentSessions.id, session.id));
          await dispatchWebhookEvent({
            event: "bank.transfer.rejected",
            id: generateReference("EVT"),
            tenantId: session.tenantId,
            merchantId: session.merchantId,
            timestamp: new Date().toISOString(),
            data: {
              reference: session.reference,
              sessionId: session.id,
              reason,
              expectedKobo: Number(session.amountKobo),
              receivedAmount: input.amount ?? null,
            },
          });
          return { received: true, matched: true, status: "rejected", reason };
        }

        // C11: a payment landing in an EXPIRED session is parked, never
        // completed — the expiry deadline is a hard settlement boundary.
        if (session.status === "expired" || session.status === "expired_refunded" || isSessionExpired(session)) {
          logger.error("[hostedCheckout] NIP payment parked — session expired", {
            sessionId: session.id, reference: session.reference,
          });
          await db.update(hostedPaymentSessions).set({
            metadata: {
              ...((session.metadata as Record<string, string> | null) ?? {}),
              late_payment_parked: "true",
              late_payment_amount: String(input.amount),
            },
            updatedAt: new Date(),
          }).where(and(
            eq(hostedPaymentSessions.id, session.id),
            ne(hostedPaymentSessions.status, "completed"),
          ));
          await dispatchWebhookEvent({
            event: "bank.transfer.rejected",
            id: generateReference("EVT"),
            tenantId: session.tenantId,
            merchantId: session.merchantId,
            timestamp: new Date().toISOString(),
            data: {
              reference: session.reference,
              sessionId: session.id,
              reason: "session_expired",
              expectedKobo: Number(session.amountKobo),
              receivedAmount: input.amount,
            },
          });
          return { received: true, matched: true, status: "parked", reason: "session_expired" };
        }

        const now = input.paidAt ? new Date(input.paidAt) : new Date();
        // Atomic status flip — replays and concurrent deliveries no-op here, so
        // the TigerBeetle credit can never be recorded twice for one session.
        const [flipped] = await db.update(hostedPaymentSessions).set({
          status: "completed",
          paidAt: now,
          webhookDeliveredAt: new Date(),
          updatedAt: new Date(),
        }).where(and(
          eq(hostedPaymentSessions.id, session.id),
          ne(hostedPaymentSessions.status, "completed"),
        )).returning();

        if (flipped) {
          // P2-c: settle the linked AR invoice ledger (partial → paid). Non-fatal.
          await settleLinkedInvoice(session);

          const tbId = await recordTBTransfer({
            amountKobo: Number(session.amountKobo),
            merchantId: session.merchantId,
            tenantId: session.tenantId,
            reference: session.reference,
          });
          if (tbId) {
            await db.update(hostedPaymentSessions).set({
              tigerBeetleTransferId: Number(tbId),
              updatedAt: new Date(),
            }).where(eq(hostedPaymentSessions.id, session.id));
          }

          await publishPaymentCompleted(session.tenantId, session.merchantId, {
            sessionId: session.id,
            reference: session.reference,
            merchantId: session.merchantId,
            amountKobo: Number(session.amountKobo),
            paymentMethod: "bank_transfer",
            source: "nip_webhook",
          });

          if (session.customerEmail) {
            sendReceiptEmail({
              to: session.customerEmail,
              customerName: session.customerName ?? "Customer",
              amountKobo: Number(session.amountKobo),
              currency: session.currency,
              reference: session.reference,
              merchantName: session.merchantId,
            }).catch((e) => logger.error("[hostedCheckout] NIP receipt email send failed", { sessionId: session.id, error: e instanceof Error ? e.message : String(e) }));
          }
        }
      } else {
        // A replayed failure/expiry must never downgrade a completed session.
        await db.update(hostedPaymentSessions).set({
          status: input.status === "expired" ? "expired" : "failed",
          failedAt: new Date(),
          failureReason: `NIP ${input.status}`,
          updatedAt: new Date(),
        }).where(and(
          eq(hostedPaymentSessions.id, session.id),
          ne(hostedPaymentSessions.status, "completed"),
        ));
      }

      return { received: true, matched: true };
    }),

  // ── USDC confirmation (H13) — called by the on-chain deposit watcher ──────
  // Until a USDC deposit-watcher/confirmation path existed, USDC sessions could
  // NEVER complete. This endpoint is the watcher-facing confirmation: it is
  // internal-key authed (USDC_CONFIRM_SECRET, fail-closed), amount-verified,
  // and performs the SAME guarded completion flip + TigerBeetle/outbox +
  // invoice settlement as the signed nipWebhook.
  confirmUsdcPayment: publicProcedure
    .input(z.object({
      sessionId: z.string(),
      // Kobo amount observed on-chain (converted by the watcher) — MUST equal
      // the session amount exactly.
      amountKobo: z.number().int().positive(),
      txSignature: z.string().optional(),
      internalKey: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const headerKey = ctx.req.headers["x-internal-key"];
      verifyWebhookSecret(
        input.internalKey ?? (Array.isArray(headerKey) ? headerKey[0] : headerKey),
        "USDC_CONFIRM_SECRET",
      );

      const [session] = await db.select().from(hostedPaymentSessions)
        .where(eq(hostedPaymentSessions.id, input.sessionId));
      if (!session) throw new TRPCError({ code: "NOT_FOUND", message: "Session not found" });
      if (session.paymentMethod !== "usdc") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This session is not a USDC checkout" });
      }
      if (session.status === "completed") return { success: true, alreadyCompleted: true };

      // Amount-verified: the on-chain deposit must equal the session total.
      if (Number(input.amountKobo) !== Number(session.amountKobo)) {
        logger.error("[hostedCheckout] USDC confirmation amount mismatch", {
          sessionId: session.id,
          expectedKobo: Number(session.amountKobo),
          receivedKobo: input.amountKobo,
          txSignature: input.txSignature,
        });
        return { success: false, status: "rejected", reason: "amount_mismatch" };
      }

      // Expired sessions are never completed (same invariant as nipWebhook).
      if (session.status === "expired" || isSessionExpired(session)) {
        logger.error("[hostedCheckout] USDC deposit parked — session expired", {
          sessionId: session.id, txSignature: input.txSignature,
        });
        return { success: false, status: "parked", reason: "session_expired" };
      }

      const now = new Date();
      // Atomic status flip — exactly one confirmation wins; replays no-op.
      const [flipped] = await db.update(hostedPaymentSessions).set({
        status: "completed",
        paidAt: now,
        updatedAt: now,
        ...(input.txSignature ? {
          metadata: {
            ...((session.metadata as Record<string, string> | null) ?? {}),
            usdc_tx_signature: input.txSignature,
          },
        } : {}),
      }).where(and(
        eq(hostedPaymentSessions.id, session.id),
        ne(hostedPaymentSessions.status, "completed"),
      )).returning();
      if (!flipped) return { success: true, alreadyCompleted: true };

      // P2-c: settle the linked AR invoice ledger (partial → paid). Non-fatal.
      await settleLinkedInvoice(session);

      const tbId = await recordTBTransfer({
        amountKobo: Number(session.amountKobo),
        merchantId: session.merchantId,
        tenantId: session.tenantId,
        reference: session.reference,
      });
      if (tbId) {
        await db.update(hostedPaymentSessions).set({
          tigerBeetleTransferId: Number(tbId),
          updatedAt: new Date(),
        }).where(eq(hostedPaymentSessions.id, session.id));
      }

      await publishPaymentCompleted(session.tenantId, session.merchantId, {
        sessionId: session.id,
        reference: session.reference,
        merchantId: session.merchantId,
        amountKobo: Number(session.amountKobo),
        paymentMethod: "usdc",
        source: "usdc_watcher",
        txSignature: input.txSignature,
      });

      return { success: true };
    }),

  // ── List sessions for a merchant (dashboard) ──────────────────────────────
  listSessions: protectedProcedure
    .input(z.object({
      // Accepted for backwards compatibility but IGNORED — the merchant scope is
      // always resolved from the authenticated session, never from the client.
      merchantId: z.string().optional(),
      status: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const merchant = await resolveMerchantForUser(ctx.user.openId);
      const conditions = [eq(hostedPaymentSessions.merchantId, merchant.id)];
      if (input.status) conditions.push(eq(hostedPaymentSessions.status, input.status));
      const rows = await db.select().from(hostedPaymentSessions)
        .where(and(...conditions))
        .orderBy(desc(hostedPaymentSessions.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return rows;
    }),

  // ── Checkout Theme CRUD ───────────────────────────────────────────────────
  getTheme: protectedProcedure
    .input(z.object({
      // Accepted for backwards compatibility but IGNORED — the merchant scope is
      // always resolved from the authenticated session, never from the client.
      // (The public theme for a payment link is served by getPaymentLinkDetails.)
      merchantId: z.string().optional(),
    }))
    .query(async ({ ctx }) => {
      const merchant = await resolveMerchantForUser(ctx.user.openId);
      const [theme] = await db.select().from(checkoutThemes)
        .where(eq(checkoutThemes.merchantId, merchant.id));
      return theme ?? null;
    }),

  saveTheme: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      logoUrl: z.string().url().optional(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      backgroundColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      textColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      accentColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      fontFamily: z.string().optional(),
      borderRadius: z.string().optional(),
      businessName: z.string().optional(),
      tagline: z.string().optional(),
      supportEmail: z.string().email().optional(),
      supportPhone: z.string().optional(),
      showPaymentMethods: z.array(z.string()).optional(),
      showOrderSummary: z.boolean().optional(),
      showSecurityBadge: z.boolean().optional(),
      requireBillingAddress: z.boolean().optional(),
      customCss: z.string().max(10000).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      // merchantId/tenantId in the input are IGNORED — ownership is resolved
      // from the authenticated session so a client can never upsert another
      // merchant's theme.
      const merchant = await resolveMerchantForUser(ctx.user.openId);
      const { merchantId: _ignoredMerchantId, tenantId: _ignoredTenantId, ...updates } = input;
      const existing = await db.select().from(checkoutThemes)
        .where(eq(checkoutThemes.merchantId, merchant.id));

      if (existing.length > 0) {
        const [updated] = await db.update(checkoutThemes)
          .set({ ...updates, updatedAt: new Date() })
          .where(eq(checkoutThemes.merchantId, merchant.id))
          .returning();
        return updated;
      } else {
        const [created] = await db.insert(checkoutThemes)
          .values({ merchantId: merchant.id, tenantId: merchant.tenantId, ...updates } as any)
          .returning();
        return created;
      }
    }),
});
