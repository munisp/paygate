/**
 * remittanceAdvice.ts — Melio AP Suite P1-f
 * ─────────────────────────────────────────────────────────────────────────────
 * Remittance advice router (`remittanceAdviceRouter`).
 *
 * Procedures:
 *   sendAdvice   — render + email a remittance advice for an AP payment
 *                  (withIdempotency; guarded remittance_sent_at claim prevents
 *                  duplicate sends — resends must go through resendAdvice)
 *   resendAdvice — explicitly resend; bumps sendCount in ap_payments.metadata
 *   listAdvices  — payments with remittance_sent_at set, merchant scoped
 *
 * Pure internals (buildAdviceHtml etc.) exported as `__remittanceInternals`.
 *
 * Conventions (IMPLEMENTATION_SPEC_MELIO.md §Canonical):
 *   - merchant scoping via resolveMerchantId(ctx.user.openId)
 *   - withIdempotency with REQUIRED idempotencyKey (min 8) on send
 *   - guarded UPDATE ... WHERE remittance_sent_at IS NULL ... RETURNING
 *   - emailService.sendEmail (no-op without SMTP_PASS — still called)
 *   - merchant_notifications row inserted (skip of missing vendor email is
 *     RECORDED, never silent); Kafka paygate.notifications + Fluvio
 *     notification-stream non-fatal; auditLog after mutation
 */

import { z } from "zod";
import { eq, and, desc, isNull, isNotNull } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  vendors,
  apBills,
  apPayments,
  merchantNotifications,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { auditLog, buildAuditEntry } from "../auditTrail";
import { publishEvent, KAFKA_TOPICS } from "../kafkaClient";
import { produceRecord, FLUVIO_TOPICS } from "../fluvioClient";
import { sendEmail } from "../emailService";
import { logger } from "../logger";

/**
 * Resolve the caller's merchant from the server-side session (never from
 * client-supplied input). Same pattern as crud119.ts / chargebackLifecycle.ts.
 */
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

async function requireDb() {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
  return db;
}

// ─── Pure advice-rendering internals ─────────────────────────────────────────

export interface AdviceBillLine {
  billNumber: string | null;
  totalKobo: number;
  whtKobo: number;
}

export interface AdviceVendor {
  name: string;
  email?: string | null;
}

export interface AdvicePayment {
  reference: string | null;
  amountKobo: number;
  feeKobo?: number | null;
  createdAt: Date | string | null;
}

function escapeHtml(value: unknown): string {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** Format kobo as an ₦ string with thousands separators. */
function formatNaira(kobo: number): string {
  const naira = (Number(kobo) || 0) / 100;
  return `₦${naira.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "—";
  const date = d instanceof Date ? d : new Date(d);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-NG", { year: "numeric", month: "long", day: "numeric" });
}

/**
 * Build the remittance advice HTML. PURE — no I/O. Inline styles only
 * (email-client safe) with a low-saturation slate/sage palette.
 */
export function buildAdviceHtml(
  vendor: AdviceVendor,
  payment: AdvicePayment,
  bills: AdviceBillLine[],
  merchantName: string,
): string {
  const totalBilled = bills.reduce((s, b) => s + (Number(b.totalKobo) || 0), 0);
  const totalWht = bills.reduce((s, b) => s + (Number(b.whtKobo) || 0), 0);
  const netPaid = Number(payment.amountKobo) || 0;

  const rows = bills
    .map(
      (b) => `
        <tr>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e6e3;color:#33413a;font-size:14px;">${escapeHtml(b.billNumber ?? "—")}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e6e3;color:#33413a;font-size:14px;text-align:right;">${formatNaira(b.totalKobo)}</td>
          <td style="padding:10px 14px;border-bottom:1px solid #e2e6e3;color:#6b7a70;font-size:14px;text-align:right;">${formatNaira(b.whtKobo)}</td>
        </tr>`,
    )
    .join("");

  return `<!DOCTYPE html>
<html lang="en">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Remittance Advice</title></head>
<body style="margin:0;padding:0;background:#f4f6f5;font-family:-apple-system,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
  <div style="max-width:640px;margin:0 auto;padding:32px 16px;">
    <div style="background:#ffffff;border:1px solid #e2e6e3;border-radius:10px;overflow:hidden;">
      <div style="background:#4a5d52;padding:24px 28px;">
        <h1 style="margin:0;color:#f4f6f5;font-size:20px;font-weight:600;letter-spacing:0.02em;">Remittance Advice</h1>
        <p style="margin:6px 0 0;color:#cfd8d2;font-size:13px;">Payment notification from ${escapeHtml(merchantName)}</p>
      </div>
      <div style="padding:24px 28px;">
        <p style="margin:0 0 4px;color:#33413a;font-size:15px;">Dear ${escapeHtml(vendor.name)},</p>
        <p style="margin:0 0 20px;color:#6b7a70;font-size:14px;line-height:1.55;">
          This is to confirm that a payment has been made to you by ${escapeHtml(merchantName)}.
          The details are below. Where withholding tax (WHT) applies, the withheld amount is
          shown per bill line and has been deducted from the gross total.
        </p>

        <table role="presentation" style="width:100%;border-collapse:collapse;margin:0 0 20px;">
          <tr>
            <td style="padding:6px 0;color:#6b7a70;font-size:13px;">Payment reference</td>
            <td style="padding:6px 0;color:#33413a;font-size:13px;text-align:right;font-weight:600;" data-testid="advice-reference">${escapeHtml(payment.reference ?? "—")}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7a70;font-size:13px;">Payment date</td>
            <td style="padding:6px 0;color:#33413a;font-size:13px;text-align:right;">${formatDate(payment.createdAt)}</td>
          </tr>
        </table>

        <table role="presentation" style="width:100%;border-collapse:collapse;border:1px solid #e2e6e3;border-radius:8px;overflow:hidden;margin:0 0 20px;">
          <thead>
            <tr style="background:#eef1ef;">
              <th style="padding:10px 14px;color:#4a5d52;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;text-align:left;">Bill #</th>
              <th style="padding:10px 14px;color:#4a5d52;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;text-align:right;">Amount</th>
              <th style="padding:10px 14px;color:#4a5d52;font-size:12px;text-transform:uppercase;letter-spacing:0.06em;text-align:right;">WHT withheld</th>
            </tr>
          </thead>
          <tbody>${rows || `
            <tr><td colspan="3" style="padding:14px;color:#6b7a70;font-size:14px;text-align:center;">No bill lines</td></tr>`}
          </tbody>
        </table>

        <table role="presentation" style="width:100%;border-collapse:collapse;">
          <tr>
            <td style="padding:6px 0;color:#6b7a70;font-size:14px;">Gross billed</td>
            <td style="padding:6px 0;color:#33413a;font-size:14px;text-align:right;">${formatNaira(totalBilled)}</td>
          </tr>
          <tr>
            <td style="padding:6px 0;color:#6b7a70;font-size:14px;" data-testid="advice-wht">Total WHT withheld</td>
            <td style="padding:6px 0;color:#a4574a;font-size:14px;text-align:right;">−${formatNaira(totalWht)}</td>
          </tr>
          <tr>
            <td style="padding:10px 0 0;border-top:2px solid #4a5d52;color:#33413a;font-size:15px;font-weight:700;">Net paid</td>
            <td style="padding:10px 0 0;border-top:2px solid #4a5d52;color:#33413a;font-size:15px;font-weight:700;text-align:right;" data-testid="advice-net">${formatNaira(netPaid)}</td>
          </tr>
        </table>
      </div>
      <div style="background:#f4f6f5;padding:16px 28px;border-top:1px solid #e2e6e3;">
        <p style="margin:0;color:#8a968e;font-size:12px;line-height:1.5;">
          This advice was generated automatically by ${escapeHtml(merchantName)} via PayGate.
          Please quote the payment reference on any correspondence.
        </p>
      </div>
    </div>
  </div>
</body>
</html>`;
}

// ─── Shared loaders ───────────────────────────────────────────────────────────

/** Load a payment + its bill + vendor, asserting merchant ownership via the bill join. */
async function loadPaymentContext(db: any, merchantId: string, apPaymentId: string) {
  const [row] = await db
    .select({ payment: apPayments, bill: apBills })
    .from(apPayments)
    .innerJoin(apBills, eq(apPayments.billId, apBills.id))
    .where(
      and(
        eq(apPayments.id, apPaymentId),
        eq(apPayments.merchantId, merchantId),
        eq(apBills.merchantId, merchantId), // ownership via bill join
      ),
    )
    .limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "AP payment not found" });

  let vendor: any = null;
  if (row.bill.vendorId) {
    const [v] = await db
      .select()
      .from(vendors)
      .where(and(eq(vendors.id, row.bill.vendorId), eq(vendors.merchantId, merchantId)))
      .limit(1);
    vendor = v ?? null;
  }
  return { payment: row.payment as any, bill: row.bill as any, vendor };
}

/** Insert the in-app merchant notification (recorded — never silent). */
async function recordNotification(
  db: any,
  merchantId: string,
  apPaymentId: string,
  opts: { type: string; title: string; body: string; priority?: string; metadata?: Record<string, unknown> },
) {
  await db.insert(merchantNotifications).values({
    merchantId,
    type: opts.type,
    title: opts.title,
    body: opts.body,
    entityId: apPaymentId,
    entityType: "ap_payment",
    priority: opts.priority ?? "medium",
    metadata: opts.metadata ? JSON.stringify(opts.metadata) : null,
  });
}

/** Non-fatal fan-out: Kafka paygate.notifications + Fluvio notification-stream. */
async function publishAdviceEvent(payload: Record<string, unknown>) {
  try {
    await publishEvent(KAFKA_TOPICS.NOTIFICATIONS, payload, String(payload.apPaymentId ?? ""));
  } catch (err: any) {
    logger.warn("remittance_kafka_event_failed", { error: err?.message });
  }
  try {
    await produceRecord(FLUVIO_TOPICS.NOTIFICATION_STREAM, payload, String(payload.apPaymentId ?? ""));
  } catch (err: any) {
    logger.warn("remittance_fluvio_event_failed", { error: err?.message });
  }
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const remittanceAdviceRouter = router({
  /**
   * Render + send the remittance advice for a completed AP payment.
   * The guarded remittance_sent_at claim makes duplicate sends impossible —
   * a second call without resendAdvice fails with CONFLICT.
   */
  sendAdvice: protectedProcedure
    .input(
      z.object({
        apPaymentId: z.string().min(1),
        idempotencyKey: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "ap.remittance.send",
        requestBody: input,
        execute: async () => {
          const { payment, bill, vendor } = await loadPaymentContext(db, merchantId, input.apPaymentId);

          // Atomic first-send claim: only succeeds while remittance_sent_at IS NULL.
          const sentAt = new Date();
          const [claimed] = await db
            .update(apPayments)
            .set({ remittanceSentAt: sentAt })
            .where(and(eq(apPayments.id, input.apPaymentId), eq(apPayments.merchantId, merchantId), isNull(apPayments.remittanceSentAt)))
            .returning();
          if (!claimed) {
            throw new TRPCError({
              code: "CONFLICT",
              message: "Remittance advice already sent for this payment — use resendAdvice",
            });
          }

          const merchantName = ctx.user.name ?? "PayGate Merchant";
          const bills: AdviceBillLine[] = [
            { billNumber: bill.billNumber ?? null, totalKobo: Number(bill.totalKobo), whtKobo: Number(bill.whtKobo ?? 0) },
          ];
          const html = buildAdviceHtml(
            { name: vendor?.name ?? "Vendor", email: vendor?.email ?? null },
            { reference: payment.reference ?? null, amountKobo: Number(payment.amountKobo), feeKobo: payment.feeKobo ?? null, createdAt: payment.createdAt },
            bills,
            merchantName,
          );

          let emailSent = false;
          if (vendor?.email) {
            emailSent = await sendEmail({
              to: vendor.email,
              subject: `Remittance advice — ${payment.reference ?? input.apPaymentId}`,
              html,
            });
          } else {
            // Skipped — but recorded, never silent.
            logger.warn("remittance_skipped_no_vendor_email", {
              apPaymentId: input.apPaymentId,
              vendorId: bill.vendorId,
            });
            await recordNotification(db, merchantId, input.apPaymentId, {
              type: "ap_remittance_skipped",
              title: "Remittance advice not emailed",
              body: `Vendor ${vendor?.name ?? bill.vendorId ?? "unknown"} has no email on file; remittance advice for payment ${payment.reference ?? input.apPaymentId} was recorded but not emailed.`,
              priority: "medium",
              metadata: { reason: "vendor_email_missing", vendorId: bill.vendorId, reference: payment.reference },
            });
          }

          await recordNotification(db, merchantId, input.apPaymentId, {
            type: "ap_remittance_sent",
            title: "Remittance advice sent",
            body: `Remittance advice for payment ${payment.reference ?? input.apPaymentId} ${emailSent ? `emailed to ${vendor.email}` : "recorded (email not delivered)"}.`,
            priority: "low",
            metadata: { emailSent, reference: payment.reference, vendorId: bill.vendorId },
          });

          await publishAdviceEvent({
            type: "ap.remittance.sent",
            merchantId,
            apPaymentId: input.apPaymentId,
            vendorId: bill.vendorId,
            reference: payment.reference,
            emailSent,
            sentAt: sentAt.toISOString(),
          });

          await auditLog(
            buildAuditEntry(ctx, merchantId, "ap.remittance.sent", "ap_payment", input.apPaymentId, {
              reference: payment.reference,
              vendorId: bill.vendorId,
              emailSent,
            }),
          );

          return { payment: claimed, emailSent, sentAt };
        },
      });
    }),

  /**
   * Explicit resend. Allowed after a prior send; bumps sendCount in
   * ap_payments.metadata (jsonb) and refreshes remittance_sent_at.
   */
  resendAdvice: protectedProcedure
    .input(z.object({ apPaymentId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const { payment, bill, vendor } = await loadPaymentContext(db, merchantId, input.apPaymentId);
      if (!payment.remittanceSentAt) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "No remittance advice has been sent yet — use sendAdvice",
        });
      }

      const priorMeta = (payment.metadata && typeof payment.metadata === "object" ? payment.metadata : {}) as Record<string, unknown>;
      const sendCount = Number(priorMeta.sendCount ?? 1) + 1;
      const sentAt = new Date();

      const [updated] = await db
        .update(apPayments)
        .set({
          remittanceSentAt: sentAt,
          metadata: { ...priorMeta, sendCount },
        })
        .where(and(eq(apPayments.id, input.apPaymentId), eq(apPayments.merchantId, merchantId), isNotNull(apPayments.remittanceSentAt)))
        .returning();
      if (!updated) {
        throw new TRPCError({ code: "CONFLICT", message: "Payment changed concurrently — retry" });
      }

      const merchantName = ctx.user.name ?? "PayGate Merchant";
      const html = buildAdviceHtml(
        { name: vendor?.name ?? "Vendor", email: vendor?.email ?? null },
        { reference: payment.reference ?? null, amountKobo: Number(payment.amountKobo), feeKobo: payment.feeKobo ?? null, createdAt: payment.createdAt },
        [{ billNumber: bill.billNumber ?? null, totalKobo: Number(bill.totalKobo), whtKobo: Number(bill.whtKobo ?? 0) }],
        merchantName,
      );

      let emailSent = false;
      if (vendor?.email) {
        emailSent = await sendEmail({
          to: vendor.email,
          subject: `Remittance advice (resend) — ${payment.reference ?? input.apPaymentId}`,
          html,
        });
      } else {
        logger.warn("remittance_resend_skipped_no_vendor_email", { apPaymentId: input.apPaymentId, vendorId: bill.vendorId });
      }

      await publishAdviceEvent({
        type: "ap.remittance.resent",
        merchantId,
        apPaymentId: input.apPaymentId,
        vendorId: bill.vendorId,
        reference: payment.reference,
        emailSent,
        sendCount,
        sentAt: sentAt.toISOString(),
      });

      await auditLog(
        buildAuditEntry(ctx, merchantId, "ap.remittance.resent", "ap_payment", input.apPaymentId, {
          reference: payment.reference,
          vendorId: bill.vendorId,
          emailSent,
          sendCount,
        }),
      );

      return { payment: updated, emailSent, sendCount, sentAt };
    }),

  /**
   * List payments whose remittance advice has been sent. Merchant scoped;
   * optionally filtered to one vendor (via the bill join).
   */
  listAdvices: protectedProcedure
    .input(
      z.object({
        vendorId: z.string().min(1).optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const conditions = [
        eq(apPayments.merchantId, merchantId),
        eq(apBills.merchantId, merchantId),
        isNotNull(apPayments.remittanceSentAt),
      ];
      if (input.vendorId) conditions.push(eq(apBills.vendorId, input.vendorId));

      const rows = await db
        .select({
          payment: apPayments,
          billNumber: apBills.billNumber,
          vendorId: apBills.vendorId,
        })
        .from(apPayments)
        .innerJoin(apBills, eq(apPayments.billId, apBills.id))
        .where(and(...conditions))
        .orderBy(desc(apPayments.remittanceSentAt))
        .limit(input.limit)
        .offset(input.offset);

      return { advices: rows, total: rows.length };
    }),
});

/** Exported for unit tests. */
export const __remittanceInternals = {
  buildAdviceHtml,
  escapeHtml,
  formatNaira,
  formatDate,
};
