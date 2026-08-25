// server/routers/arFeeChoice.ts
// P1-c — AR fee-choice (Melio-inspired AR suite).
//
// Merchants choose who bears the card processing cost on an invoice:
//   fee_policy = 'merchant_absorbs' (default) — merchant nets less;
//   fee_policy = 'customer_pays'              — a disclosed surcharge (bps) is
//                                               added to card checkouts; bank
//                                               transfer stays fee-free.
//
//  - setInvoiceFeePolicy — merchant-scoped, guarded ownership UPDATE.
//  - getCheckoutQuote    — PUBLIC quote for the hosted page: base, surcharge,
//                          total due + mandatory disclosure text.
//  - feeRecoveryReport   — merchant report of surcharges collected (read from
//                          invoice_payments.metadata jsonb written at capture
//                          time by the hostedCheckout settlement path).
//
// The surcharge basis cross-checks the latest active interchange_schedule row
// (authoritative card-cost basis from server/routers/interchange.ts) and falls
// back to the invoice's configured surcharge_bps when the schedule is empty or
// unreadable.

import { z } from "zod";
import { eq, and, desc } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { invoices, invoicePayments, interchangeSchedule } from "../../drizzle/schema";
import { auditLog } from "../auditTrail";
import { logger } from "../logger";
import { __partialInternals } from "./arPartialPayments";

const DEFAULT_SURCHARGE_BPS = 290;
const MAX_SURCHARGE_BPS = 400;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** crud119.ts resolveMerchantId pattern — merchant identity from the session only. */
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

function clampBps(bps: number): number {
  if (!Number.isFinite(bps) || bps < 0) return 0;
  return Math.min(Math.round(bps), MAX_SURCHARGE_BPS);
}

/** Integer-kobo surcharge: round(base × bps / 10000). */
export function computeSurchargeKobo(baseKobo: number, bps: number): number {
  if (baseKobo <= 0 || bps <= 0) return 0;
  return Math.round((baseKobo * bps) / 10000);
}

/** Mandatory customer disclosure — ALWAYS present when a surcharge applies. */
export function disclosureTextFor(bps: number): string {
  return `A ${bps / 100}% card processing fee is added by the merchant. You can pay by bank transfer to avoid this fee.`;
}

/**
 * Effective surcharge basis points for an invoice. Cross-checks the latest
 * active interchange_schedule row; falls back to the invoice's configured
 * surcharge_bps (default 290). Never throws — a schedule read failure falls
 * back to the invoice setting.
 */
export async function resolveSurchargeBps(invoice: { surchargeBps?: number | null }): Promise<number> {
  try {
    const [row] = await db.select().from(interchangeSchedule)
      .where(eq(interchangeSchedule.isActive, true))
      .orderBy(desc(interchangeSchedule.effectiveFrom))
      .limit(1);
    if (row && Number.isFinite(Number(row.basisPoints))) {
      return clampBps(Number(row.basisPoints));
    }
  } catch (err) {
    logger.warn("[arFeeChoice] interchange schedule read failed; using invoice surcharge_bps", {
      error: err instanceof Error ? err.message : String(err),
    });
  }
  return clampBps(Number(invoice.surchargeBps ?? DEFAULT_SURCHARGE_BPS));
}

export const __feeChoiceInternals = {
  clampBps,
  computeSurchargeKobo,
  disclosureTextFor,
  resolveSurchargeBps,
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const arFeeChoiceRouter = router({

  // ── Set an invoice's fee policy (merchant scoped) ─────────────────────────
  setInvoiceFeePolicy: protectedProcedure
    .input(z.object({
      invoiceId: z.string().min(1).max(128),
      feePolicy: z.enum(["merchant_absorbs", "customer_pays"]),
      surchargeBps: z.number().int().min(0).max(MAX_SURCHARGE_BPS).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);

      // Guarded UPDATE: ownership enforced atomically in the WHERE clause —
      // an invoice belonging to another merchant can never be rewritten.
      const [updated] = await db.update(invoices).set({
        feePolicy: input.feePolicy,
        ...(input.surchargeBps !== undefined ? { surchargeBps: input.surchargeBps } : {}),
        updatedAt: new Date(),
      }).where(and(
        eq(invoices.invoiceId, input.invoiceId),
        eq(invoices.merchantId, merchantId),
      )).returning();
      if (!updated) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });

      await auditLog({
        merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        action: "ar.invoice.fee_policy_updated",
        resource: "invoice",
        resourceId: input.invoiceId,
        metadata: {
          feePolicy: input.feePolicy,
          surchargeBps: updated.surchargeBps,
        },
      });

      return { success: true, invoice: updated };
    }),

  // ── Public checkout quote for a payment link ──────────────────────────────
  getCheckoutQuote: publicProcedure
    .input(z.object({ paymentLinkToken: z.string().min(1).max(128) }))
    .query(async ({ input }) => {
      // Merchant + invoice resolved SERVER-SIDE from the link (same trust
      // model as hostedCheckout.initiatePayment).
      const { invoice } = await __partialInternals.resolveInvoiceByPaymentLinkToken(input.paymentLinkToken);

      const rows = await db.select().from(invoicePayments)
        .where(eq(invoicePayments.invoiceId, invoice.invoiceId));
      const paidKobo = __partialInternals.sumPaymentsKobo(rows);

      const baseKobo = Number(invoice.totalKobo);
      const balanceDueKobo = Math.max(0, baseKobo - paidKobo);

      // Surcharge applies to the CARD path only when the merchant passes the
      // fee to the customer; bank transfer stays fee-free.
      let surchargeBps = 0;
      let surchargeKobo = 0;
      let disclosureText: string | null = null;
      if ((invoice.feePolicy ?? "merchant_absorbs") === "customer_pays") {
        surchargeBps = await resolveSurchargeBps(invoice);
        surchargeKobo = computeSurchargeKobo(baseKobo, surchargeBps);
        // Disclosure is ALWAYS present when a surcharge is charged.
        if (surchargeKobo > 0) disclosureText = disclosureTextFor(surchargeBps);
      }

      return {
        invoiceId: invoice.invoiceId,
        currency: invoice.currency ?? "NGN",
        feePolicy: invoice.feePolicy ?? "merchant_absorbs",
        baseKobo,
        balanceDueKobo,
        surchargeBps,
        surchargeKobo,
        totalDueKobo: baseKobo + surchargeKobo,
        disclosureText,
      };
    }),

  // ── Fee recovery report (merchant scoped) ─────────────────────────────────
  feeRecoveryReport: protectedProcedure
    .input(z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/, "period must be YYYY-MM").optional(),
    }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const rows = await db.select({ payment: invoicePayments, invoice: invoices })
        .from(invoicePayments)
        .innerJoin(invoices, eq(invoices.invoiceId, invoicePayments.invoiceId))
        .where(eq(invoices.merchantId, merchantId));

      let totalFeesRecoveredKobo = 0;
      const items: Array<{
        paymentId: string;
        invoiceId: string;
        amountKobo: number;
        feeKobo: number;
        paidAt: Date | null;
      }> = [];

      for (const { payment, invoice } of rows) {
        const meta = __partialInternals.getPaymentMeta(payment.metadata);
        const feeKobo = Number(meta.feeKobo ?? 0) || 0;
        if (meta.status === "refunded" || feeKobo <= 0) continue;
        // Only fees collected under a customer_pays policy count as recovered.
        const policy = meta.feePolicy ?? invoice.feePolicy ?? "merchant_absorbs";
        if (policy !== "customer_pays") continue;
        const paidAt = payment.paidAt ? new Date(payment.paidAt) : null;
        if (input.period) {
          if (!paidAt || !paidAt.toISOString().startsWith(input.period)) continue;
        }
        totalFeesRecoveredKobo += feeKobo;
        items.push({
          paymentId: payment.id,
          invoiceId: payment.invoiceId,
          amountKobo: Number(payment.amountKobo),
          feeKobo,
          paidAt,
        });
      }

      return {
        merchantId,
        period: input.period ?? null,
        totalFeesRecoveredKobo,
        paymentCount: items.length,
        items,
      };
    }),
});
