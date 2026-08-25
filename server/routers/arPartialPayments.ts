// server/routers/arPartialPayments.ts
// P2-c — AR partial payments (Melio-inspired AR suite).
//
// 1:N invoice_payments ledger on top of the existing `invoices` table:
//  - recordInvoicePayment  — merchant records a (possibly partial) payment;
//                            atomic SELECT ... FOR UPDATE + guarded status flip
//                            draft/sent → partially_paid → paid.
//  - getBalanceDue         — merchant-scoped balance (never negative).
//  - getBalanceDuePublic   — public balance lookup by payment-link token.
//  - refundPartialPayment  — PBAC-gated ledger correction (money movement rides
//                            the existing refund rails; this only marks the
//                            payment refunded and flips the invoice back).
//
// Fee / refund annotations live in invoice_payments.metadata (jsonb, migration
// 0092): { feeKobo, feePolicy, status: 'recorded'|'refunded', refundedAt }.

import { z } from "zod";
import { eq, and, ne, or, like, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure, pbacProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { invoices, invoicePayments, paymentLinks } from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { auditLog } from "../auditTrail";
import { publishEvent } from "../kafkaClient";
import { logger } from "../logger";

const AR_INVOICES_TOPIC = "paygate.ar.invoices";

/** Invoice statuses from which a payment may be recorded. 'paid'/'void' are terminal. */
const PAYABLE_STATUSES = ["sent", "partially_paid", "draft"] as const;

/** Metadata annotation carried on an invoice_payments row. */
export interface InvoicePaymentMeta {
  feeKobo?: number;
  feePolicy?: string;
  status?: string;        // 'recorded' | 'refunded'
  refundedAt?: string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the merchant that owns the authenticated user. Merchant identity is
 * ALWAYS derived server-side (crud119.ts resolveMerchantId pattern) — a
 * client-supplied merchantId is never trusted.
 */
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

async function resolveMerchantId(openId: string): Promise<string> {
  return (await resolveMerchant(openId)).id;
}

/**
 * Pure invoice status recomputation from money totals.
 *  paidKobo >= totalKobo (and total > 0) → 'paid'
 *  paidKobo > 0                          → 'partially_paid'
 *  otherwise                             → 'sent' (open, nothing collected)
 */
export function recomputeStatus(totalKobo: number, paidKobo: number): "paid" | "partially_paid" | "sent" {
  if (totalKobo > 0 && paidKobo >= totalKobo) return "paid";
  if (paidKobo > 0) return "partially_paid";
  return "sent";
}

/** Normalise an invoice_payments.metadata jsonb value (object or legacy string). */
export function getPaymentMeta(metadata: unknown): InvoicePaymentMeta {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    return metadata as InvoicePaymentMeta;
  }
  if (typeof metadata === "string") {
    try {
      const parsed = JSON.parse(metadata);
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) return parsed as InvoicePaymentMeta;
    } catch { /* malformed — treat as no metadata */ }
  }
  return {};
}

/** Sum of payment rows, excluding rows marked refunded. */
export function sumPaymentsKobo(rows: Array<{ amountKobo: number | bigint; metadata?: unknown }>): number {
  return rows.reduce((sum, row) => {
    if (getPaymentMeta(row.metadata).status === "refunded") return sum;
    return sum + Number(row.amountKobo);
  }, 0);
}

/**
 * Resolve an AR invoice from a public payment-link token (link id or slug).
 * The merchant is resolved SERVER-SIDE from the link row (same trust model as
 * hostedCheckout.initiatePayment); the invoice is bound to the link via
 * invoices.paymentLinkUrl, which carries the link id/slug.
 */
async function resolveInvoiceByPaymentLinkToken(paymentLinkToken: string) {
  // LIKE wildcards in the token are neutralised before pattern use.
  const safeToken = paymentLinkToken.replace(/[%_]/g, "");
  const [link] = await db.select().from(paymentLinks)
    .where(or(eq(paymentLinks.id, paymentLinkToken), eq(paymentLinks.slug, paymentLinkToken)))
    .limit(1);
  if (!link) throw new TRPCError({ code: "NOT_FOUND", message: "Payment link not found" });
  if (!link.isActive) throw new TRPCError({ code: "BAD_REQUEST", message: "This payment link is no longer active" });

  const [invoice] = await db.select().from(invoices)
    .where(and(
      eq(invoices.merchantId, link.merchantId),
      or(
        like(invoices.paymentLinkUrl, `%${safeToken}%`),
        like(invoices.paymentLinkUrl, `%${link.id}%`),
        like(invoices.paymentLinkUrl, `%${link.slug}%`),
      ),
    ))
    .limit(1);
  if (!invoice) {
    throw new TRPCError({ code: "NOT_FOUND", message: "No invoice is bound to this payment link" });
  }
  return { link, invoice };
}

/**
 * Insert an invoice_payments row and recompute the invoice status inside the
 * caller's connection/transaction. Shared by recordInvoicePayment (merchant
 * path) and hostedCheckout settlement (public checkout path) so both apply
 * EXACTLY the same ledger semantics.
 *
 * Status flip is guarded: UPDATE ... WHERE id AND status <> 'paid' — a paid
 * invoice is terminal and can never be rewritten by a racing/replayed call.
 */
export async function applyInvoicePayment(
  dbOrTx: any,
  opts: {
    invoiceId: string;
    amountKobo: number;
    method: string;
    reference: string;
    meta?: InvoicePaymentMeta;
  },
): Promise<{ paymentId: string | null; status: string; totalKobo: number; paidKobo: number }> {
  const [invoice] = await dbOrTx.select().from(invoices)
    .where(eq(invoices.invoiceId, opts.invoiceId)).limit(1);
  if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

  const [payment] = await dbOrTx.insert(invoicePayments).values({
    invoiceId: opts.invoiceId,
    amountKobo: opts.amountKobo,
    method: opts.method,
    reference: opts.reference,
    metadata: opts.meta ?? null,
  }).returning();

  const rows = await dbOrTx.select().from(invoicePayments)
    .where(eq(invoicePayments.invoiceId, opts.invoiceId));
  const paidKobo = sumPaymentsKobo(rows);
  const totalKobo = Number(invoice.totalKobo);
  const status = recomputeStatus(totalKobo, paidKobo);

  await dbOrTx.update(invoices).set({
    status,
    ...(status === "paid" ? { paidAt: new Date() } : {}),
    updatedAt: new Date(),
  }).where(and(
    eq(invoices.invoiceId, opts.invoiceId),
    ne(invoices.status, "paid"),
  )).returning();

  return { paymentId: payment?.id ?? null, status, totalKobo, paidKobo };
}

/** Non-fatal Kafka publish (spec D5 — log + continue). */
async function publishInvoiceEvent(payload: Record<string, unknown>): Promise<void> {
  try {
    await publishEvent(AR_INVOICES_TOPIC, payload, String(payload.invoiceId ?? ""));
  } catch (err) {
    logger.warn("[arPartialPayments] kafka publish failed (non-fatal)", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
}

export const __partialInternals = {
  recomputeStatus,
  applyInvoicePayment,
  getPaymentMeta,
  sumPaymentsKobo,
  resolveInvoiceByPaymentLinkToken,
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const arPartialPaymentsRouter = router({

  // ── Record a (possibly partial) invoice payment ───────────────────────────
  recordInvoicePayment: protectedProcedure
    .input(z.object({
      invoiceId: z.string().min(1).max(128),
      amountKobo: z.number().int().positive(),
      method: z.enum(["card", "bank_transfer", "ussd", "wallet", "cash"]),
      reference: z.string().min(8).max(128),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const execute = async () => {
        const result = await db.transaction(async (tx) => {
          // Lock the invoice row for the whole read-check-write cycle (TOCTOU-safe).
          const [invoice] = await tx.select().from(invoices)
            .where(and(
              eq(invoices.invoiceId, input.invoiceId),
              eq(invoices.merchantId, merchantId),
            ))
            .for("update");
          if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
          if (!(PAYABLE_STATUSES as readonly string[]).includes(invoice.status ?? "")) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Invoice is '${invoice.status}'; payments can only be recorded on sent/partially_paid/draft invoices`,
            });
          }

          const existing = await tx.select().from(invoicePayments)
            .where(eq(invoicePayments.invoiceId, invoice.invoiceId));
          const paidSoFar = sumPaymentsKobo(existing);
          const totalKobo = Number(invoice.totalKobo);
          const balanceDue = Math.max(0, totalKobo - paidSoFar);

          if (input.amountKobo > balanceDue) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Amount (${input.amountKobo} kobo) exceeds the balance due (${balanceDue} kobo) — overpayment is rejected`,
            });
          }
          // Partial payments only when the invoice opts in; a FULL payment of
          // the exact balance is always accepted regardless of allow_partial.
          if (input.amountKobo < balanceDue && invoice.allowPartial === false) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: "This invoice does not allow partial payments — pay the full balance due",
            });
          }

          const applied = await applyInvoicePayment(tx, {
            invoiceId: invoice.invoiceId,
            amountKobo: input.amountKobo,
            method: input.method,
            reference: input.reference,
          });
          return { invoice, applied, totalKobo };
        });

        await auditLog({
          merchantId,
          actorId: ctx.user.openId,
          actorName: ctx.user.name ?? "unknown",
          action: "ar.invoice.payment_recorded",
          resource: "invoice",
          resourceId: input.invoiceId,
          metadata: {
            paymentId: result.applied.paymentId,
            amountKobo: input.amountKobo,
            method: input.method,
            reference: input.reference,
            newStatus: result.applied.status,
          },
        });
        await publishInvoiceEvent({
          type: "ar.invoice.payment_recorded",
          invoiceId: input.invoiceId,
          merchantId,
          paymentId: result.applied.paymentId,
          amountKobo: input.amountKobo,
          method: input.method,
          status: result.applied.status,
          paidKobo: result.applied.paidKobo,
          totalKobo: result.totalKobo,
        });

        return {
          success: true,
          paymentId: result.applied.paymentId,
          status: result.applied.status,
          paidKobo: result.applied.paidKobo,
          totalKobo: result.totalKobo,
          balanceDueKobo: Math.max(0, result.totalKobo - result.applied.paidKobo),
        };
      };

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "ar.recordInvoicePayment",
        requestBody: input,
        execute,
      });
    }),

  // ── Balance due (merchant scoped) ─────────────────────────────────────────
  getBalanceDue: protectedProcedure
    .input(z.object({ invoiceId: z.string().min(1).max(128) }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [invoice] = await db.select().from(invoices)
        .where(and(
          eq(invoices.invoiceId, input.invoiceId),
          eq(invoices.merchantId, merchantId),
        ))
        .limit(1);
      if (!invoice) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const rows = await db.select().from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, invoice.invoiceId));
      const paidKobo = sumPaymentsKobo(rows);
      const totalKobo = Number(invoice.totalKobo);
      return {
        invoiceId: invoice.invoiceId,
        status: invoice.status,
        totalKobo,
        paidKobo,
        // NEVER negative — an over-recorded ledger reports 0, not a debt owed
        // by the merchant to the customer.
        balanceDueKobo: Math.max(0, totalKobo - paidKobo),
      };
    }),

  // ── Balance due (public, by payment link token) ───────────────────────────
  getBalanceDuePublic: publicProcedure
    .input(z.object({ paymentLinkToken: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      const { invoice } = await __partialInternals.resolveInvoiceByPaymentLinkToken(input.paymentLinkToken);
      const rows = await db.select().from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, invoice.invoiceId));
      const paidKobo = sumPaymentsKobo(rows);
      const totalKobo = Number(invoice.totalKobo);
      return {
        invoiceId: invoice.invoiceId,
        status: invoice.status,
        currency: invoice.currency ?? "NGN",
        totalKobo,
        paidKobo,
        balanceDueKobo: Math.max(0, totalKobo - paidKobo),
        allowPartial: invoice.allowPartial ?? true,
      };
    }),

  // ── Refund a recorded partial payment (ledger correction only) ────────────
  // No money movement here — funds ride the existing refund rails. This marks
  // the payment row refunded (metadata.status) and flips the invoice back to
  // partially_paid/sent under a guard.
  refundPartialPayment: pbacProcedure("approve_payout")
    .input(z.object({
      paymentId: z.string().min(1).max(128),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const execute = async () => {
        const result = await db.transaction(async (tx) => {
          // Ownership: payment must belong to an invoice owned by this merchant.
          const [joined] = await tx.select({ payment: invoicePayments, invoice: invoices })
            .from(invoicePayments)
            .innerJoin(invoices, eq(invoices.invoiceId, invoicePayments.invoiceId))
            .where(and(
              eq(invoicePayments.id, input.paymentId),
              eq(invoices.merchantId, merchantId),
            ))
            .limit(1);
          if (!joined) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });
          const { payment, invoice } = joined;

          const existingMeta = getPaymentMeta(payment.metadata);
          if (existingMeta.status === "refunded") {
            return { alreadyRefunded: true as const, payment, invoice, paidKobo: 0, totalKobo: Number(invoice.totalKobo), status: invoice.status ?? "sent" };
          }

          // Lock the invoice row before mutating ledger + status.
          const [locked] = await tx.select().from(invoices)
            .where(eq(invoices.invoiceId, invoice.invoiceId))
            .for("update");
          if (!locked) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

          // Mark the payment refunded in metadata (preserving fee annotations).
          await tx.update(invoicePayments).set({
            metadata: {
              ...existingMeta,
              status: "refunded",
              refundedAt: new Date().toISOString(),
            },
          }).where(eq(invoicePayments.id, payment.id))
            .returning();

          // Recompute excluding refunded rows.
          const rows = await tx.select().from(invoicePayments)
            .where(eq(invoicePayments.invoiceId, invoice.invoiceId));
          const paidKobo = sumPaymentsKobo(rows);
          const totalKobo = Number(locked.totalKobo);
          const next = recomputeStatus(totalKobo, paidKobo);

          // Guarded flip: only an invoice that shows collected money
          // ('paid'/'partially_paid') moves backwards; leaving 'paid' clears
          // paidAt. Draft/sent invoices are untouched.
          const [flipped] = await tx.update(invoices).set({
            status: next,
            paidAt: next === "paid" ? locked.paidAt : null,
            updatedAt: new Date(),
          }).where(and(
            eq(invoices.invoiceId, invoice.invoiceId),
            inArray(invoices.status, ["paid", "partially_paid"]),
          )).returning();

          return {
            alreadyRefunded: false as const,
            payment,
            invoice,
            paidKobo,
            totalKobo,
            status: flipped?.status ?? locked.status ?? next,
          };
        });

        if (!result.alreadyRefunded) {
          await auditLog({
            merchantId,
            actorId: ctx.user.openId,
            actorName: ctx.user.name ?? "unknown",
            action: "ar.invoice.payment_refunded",
            resource: "invoice_payment",
            resourceId: input.paymentId,
            metadata: {
              invoiceId: result.invoice.invoiceId,
              amountKobo: Number(result.payment.amountKobo),
              newStatus: result.status,
            },
          });
          await publishInvoiceEvent({
            type: "ar.invoice.payment_refunded",
            invoiceId: result.invoice.invoiceId,
            merchantId,
            paymentId: input.paymentId,
            amountKobo: Number(result.payment.amountKobo),
            status: result.status,
          });
        }

        return {
          success: true,
          alreadyRefunded: result.alreadyRefunded,
          paymentId: input.paymentId,
          invoiceId: result.invoice.invoiceId,
          status: result.status,
          balanceDueKobo: Math.max(0, result.totalKobo - result.paidKobo),
        };
      };

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "ar.refundPartialPayment",
        requestBody: input,
        execute,
      });
    }),
});
