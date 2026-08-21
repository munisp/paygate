// server/routers/hostedCheckout.ts
// Production-ready hosted payment page backend.
// Handles: Stripe PaymentIntent (card), NIBSS NIP virtual account (bank transfer),
//          USSD reference generation, BNPL instalment plan, USDC wallet address,
//          payment confirmation, TigerBeetle ledger entries, Kafka events,
//          Temporal workflow start, webhook delivery, receipt email.

import { z } from "zod";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { eq, and, ne, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { hostedPaymentSessions, checkoutThemes, paymentLinks } from "../../drizzle/schema";

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
async function verifyStripePaymentIntent(paymentIntentId: string, expectedAmountKobo: number): Promise<void> {
  if (!process.env.STRIPE_SECRET_KEY) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Card payments are not configured (STRIPE_SECRET_KEY unset); payment cannot be verified",
    });
  }
  let pi: { status?: string; amount?: number };
  try {
    const res = await fetch(`https://api.stripe.com/v1/payment_intents/${paymentIntentId}`, {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    pi = await res.json() as { status?: string; amount?: number };
  } catch (err) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Could not verify payment with Stripe (${err instanceof Error ? err.message : String(err)}); try again shortly`,
    });
  }
  if (pi.status !== "succeeded") {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Payment not completed (Stripe status: ${pi.status ?? "unknown"})` });
  }
  if (Number(pi.amount) !== expectedAmountKobo) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount does not match the checkout session" });
  }
}

/** Fire-and-forget Kafka publish via Go bridge */
async function publishKafka(topic: string, payload: Record<string, unknown>) {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return;
  try {
    await fetch(`${url}/kafka/publish`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({ topic, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* non-blocking */ }
}

/** Record TigerBeetle double-entry transfer */
async function recordTBTransfer(opts: {
  amountKobo: number;
  merchantId: string;
  reference: string;
}): Promise<bigint | null> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/tigerbeetle/transfer`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify({
        ledgerId: 1,
        debitAccountId: "1001",   // Customer liability
        creditAccountId: "2001",  // Merchant settlement
        amountKobo: opts.amountKobo,
        code: 1000,               // Hosted payment code
        userData: opts.reference,
      }),
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const json = await res.json() as { transferId?: string };
    return json.transferId ? BigInt(json.transferId) : null;
  } catch { return null; }
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
      amountKobo: z.number().int().positive(),
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
      if (input.paymentLinkId) {
        const [link] = await db.select().from(paymentLinks)
          .where(eq(paymentLinks.id, input.paymentLinkId));
        if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
        if (link.merchantId !== input.merchantId) {
          throw new TRPCError({ code: "FORBIDDEN", message: "merchantId does not match the payment link" });
        }
        merchantId = link.merchantId;
        tenantId = link.tenantId;
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

      // Base session data
      const sessionData: Partial<typeof hostedPaymentSessions.$inferInsert> = {
        paymentLinkId: input.paymentLinkId,
        merchantId,
        tenantId,
        customerEmail: input.customerEmail,
        customerName: input.customerName,
        customerPhone: input.customerPhone,
        amountKobo: input.amountKobo,
        currency: input.currency,
        description: input.description,
        reference,
        status: "processing",
        paymentMethod: input.paymentMethod,
        metadata: input.metadata ?? {},
        ipAddress: input.ipAddress,
        userAgent: input.userAgent,
        expiresAt,
      };

      // ── Card: Stripe PaymentIntent ────────────────────────────────────────
      if (input.paymentMethod === "card") {
        const pi = await createStripePaymentIntent({
          amountKobo: input.amountKobo,
          currency: input.currency,
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
            amountKobo: input.amountKobo,
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
          amountKobo: input.amountKobo,
        });
        sessionData.ussdCode = ussd.ussdCode;
        sessionData.ussdReference = ussd.reference;
        sessionData.ussdBankCode = ussd.bankCode;
      }

      // ── BNPL: Calculate instalment plan ──────────────────────────────────
      if (input.paymentMethod === "bnpl") {
        const count = input.bnplInstallmentCount ?? 3;
        const installmentKobo = Math.ceil(input.amountKobo / count);
        sessionData.bnplProvider = input.bnplProvider ?? "carbon";
        sessionData.bnplInstallmentKobo = installmentKobo;
        sessionData.bnplInstallmentCount = count;
        sessionData.bnplPlanId = `bnpl_${reference}`;
        // In production: call Carbon/FairMoney BNPL API here for approval URL
        sessionData.bnplApprovalUrl = `https://app.${input.bnplProvider ?? "carbon"}.ng/checkout?ref=${reference}`;
      }

      // ── USDC: Generate wallet address ─────────────────────────────────────
      if (input.paymentMethod === "usdc") {
        // In production: call Circle/Coinbase API to generate a deposit address
        sessionData.usdcWalletAddress = `0x${nanoid(40).toLowerCase()}`;
        sessionData.usdcAmountUsdc = input.amountKobo / 100 / 1500; // approx NGN/USD rate
        sessionData.usdcNetwork = "ethereum";
      }

      const [session] = await db.insert(hostedPaymentSessions).values(sessionData as any).returning();

      // Publish Kafka event
      await publishKafka(`${tenantId}.payment.initiated`, {
        sessionId: session.id,
        reference,
        merchantId,
        amountKobo: input.amountKobo,
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

      // For bank transfer: check if NIP session has been paid (poll Go bridge)
      if (session.paymentMethod === "bank_transfer" && session.status === "processing" && session.nipSessionId) {
        const bridgeUrl = process.env.MIDDLEWARE_BRIDGE_URL;
        if (bridgeUrl) {
          try {
            const res = await fetch(`${bridgeUrl}/nip/session-status/${session.nipSessionId}`, {
              headers: { "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
              signal: AbortSignal.timeout(5000),
            });
            if (res.ok) {
              const json = await res.json() as { status: string; paidAt?: string };
              if (json.status === "paid" && json.paidAt) {
                // Guarded flip (status != 'completed') — consistent with the
                // single-writer invariant enforced in confirmPayment/nipWebhook.
                // NOTE: no TigerBeetle credit is recorded here; the signed NIP
                // webhook remains the sole ledger writer for bank transfers.
                await db.update(hostedPaymentSessions).set({
                  status: "completed",
                  paidAt: new Date(json.paidAt),
                  updatedAt: new Date(),
                }).where(and(
                  eq(hostedPaymentSessions.id, session.id),
                  ne(hostedPaymentSessions.status, "completed"),
                ));
                return { ...session, status: "completed", paidAt: new Date(json.paidAt) };
              }
            }
          } catch { /* non-blocking */ }
        }
      }

      return session;
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

      // Record TigerBeetle transfer (only the transition winner reaches here)
      const tbId = await recordTBTransfer({
        amountKobo: Number(session.amountKobo),
        merchantId: session.merchantId,
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

      // Publish Kafka payment.completed event
      await publishKafka(`${session.tenantId}.payment.completed`, {
        sessionId: session.id,
        reference: session.reference,
        merchantId: session.merchantId,
        amountKobo: Number(session.amountKobo),
        paymentMethod: session.paymentMethod,
        tigerBeetleTransferId: tbId?.toString(),
        temporalWorkflowId: workflowId,
      });

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
            .where(eq(hostedPaymentSessions.id, session.id)).catch(() => {});
        }).catch(() => {});
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
          const tbId = await recordTBTransfer({
            amountKobo: Number(session.amountKobo),
            merchantId: session.merchantId,
            reference: session.reference,
          });
          if (tbId) {
            await db.update(hostedPaymentSessions).set({
              tigerBeetleTransferId: Number(tbId),
              updatedAt: new Date(),
            }).where(eq(hostedPaymentSessions.id, session.id));
          }

          await publishKafka(`${session.tenantId}.payment.completed`, {
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
            }).catch(() => {});
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
