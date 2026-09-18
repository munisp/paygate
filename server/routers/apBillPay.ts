// server/routers/apBillPay.ts
// P0-a Vendor bill payment (Melio-inspired AP suite).
//
// Procedures: createBill (idempotent, WHT-aware), listBills, getBill,
// updateBill (draft-only, guarded), voidBill (guarded), approveBill
// (pbac 'approve_payout' + maker≠checker), payBill (wallet | card |
// bank_transfer funding, vendor-credit pre-application, atomic wallet debit,
// payout via existing createPayout + initiatePayoutApproval STRICT),
// payBillConfirm (Stripe PaymentIntent verification + canonical stripe:pi_
// dedup).
//
// Conventions (IMPLEMENTATION_SPEC_MELIO.md §D1–D8):
// - withIdempotency on money mutations, REQUIRED idempotencyKey min 8 chars
// - merchant identity ALWAYS resolved server-side from ctx.user.openId
// - guarded atomic UPDATE ... WHERE id AND status IN (...) RETURNING (TOCTOU)
// - money as bigint kobo; Kafka paygate.ap.bills (non-fatal) + auditLog()
//   after every mutation

import { z } from "zod";
import { randomBytes, randomUUID } from "node:crypto";
import { eq, and, asc, desc, gt, gte, lte, inArray, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, pbacProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId, createPayout, updatePayout } from "../db";
import {
  apBills,
  apBillLineItems,
  apPayments,
  vendorCredits,
  vendors,
  consumerWallets,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { computeBillWhtForBill } from "./taxCompliance";
import { publishEvent } from "../kafkaClient";
import { auditLog } from "../auditTrail";
import { createPaymentIntent, isStripeConfigured } from "../stripe";
import { initiatePayoutApproval } from "../middlewareBridge";
import { logger } from "../logger";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AP_BILL_TOPIC = "paygate.ap.bills";

/** Funding fee schedule: card 2.9% (disclosed pass-through); wallet/bank flat 0.5% (existing payout fee). */
export const AP_FUNDING_FEE_RATES = {
  card: 0.029,
  wallet: 0.005,
  bank_transfer: 0.005,
} as const;

type FundingMethod = keyof typeof AP_FUNDING_FEE_RATES;

const BILL_STATUSES = [
  "draft", "pending_extraction", "extracted", "pending_approval", "approved",
  "scheduled", "paid", "partially_paid", "rejected", "void",
] as const;

/** States from which a bill may be paid. */
const PAYABLE_STATUSES = ["approved", "partially_paid"] as const;
/** States from which a bill may be voided (paid/partially_paid/void are terminal for voiding). */
const VOIDABLE_STATUSES = [
  "draft", "pending_extraction", "extracted", "pending_approval",
  "approved", "scheduled", "rejected",
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function generateApReference(): string {
  return `ap_${Date.now()}_${randomBytes(6).toString("hex")}`;
}

/**
 * Resolve the merchant that owns the authenticated user. Merchant identity is
 * ALWAYS derived server-side — a client-supplied merchantId is never trusted.
 * (Same pattern as hostedCheckout.ts:31 / crud119.ts:110.)
 */
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return { user, merchant };
}

/** Flat funding fee in kobo for a given funding method. */
function computeFundingFee(method: FundingMethod, amountKobo: number): number {
  return Math.round(amountKobo * AP_FUNDING_FEE_RATES[method]);
}

/** Non-fatal Kafka publish for AP bill lifecycle events. */
async function publishBillEvent(
  type: string,
  merchantId: string,
  billId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await publishEvent(
      AP_BILL_TOPIC,
      { type, merchantId, billId, at: new Date().toISOString(), ...extra },
      billId,
    );
  } catch (err) {
    logger.warn("ap_bill_event_publish_failed", {
      type, billId, error: err instanceof Error ? err.message : String(err),
    });
  }
}

async function auditBill(
  ctx: { user: { openId: string; name?: string | null; email?: string | null } },
  merchantId: string,
  action: string,
  billId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await auditLog({
    merchantId,
    actorId: ctx.user.openId,
    actorName: ctx.user.name ?? ctx.user.openId,
    actorEmail: ctx.user.email ?? undefined,
    action,
    resource: "ap_bill",
    resourceId: billId,
    metadata,
  });
}

/**
 * Apply open vendor credits against a bill balance, oldest first. Each credit
 * is decremented via an ATOMIC guarded UPDATE (WHERE remaining_kobo >= x
 * RETURNING) so concurrent applications cannot overdraw a credit. Runs inside
 * the caller's transaction — a lost guard race rolls the whole payment back.
 */
async function applyOpenVendorCredits(
  tx: any,
  merchantId: string,
  vendorId: string | null,
  maxAmountKobo: number,
): Promise<number> {
  if (!vendorId || maxAmountKobo <= 0) return 0;
  const credits = await tx
    .select()
    .from(vendorCredits)
    .where(and(
      eq(vendorCredits.merchantId, merchantId),
      eq(vendorCredits.vendorId, vendorId),
      eq(vendorCredits.status, "open"),
      gt(vendorCredits.remainingKobo, 0),
    ))
    .orderBy(asc(vendorCredits.createdAt))
    .limit(100);

  let applied = 0;
  let left = maxAmountKobo;
  for (const credit of credits) {
    if (left <= 0) break;
    const x = Math.min(left, credit.remainingKobo);
    const rows = await tx
      .update(vendorCredits)
      .set({
        remainingKobo: sql`${vendorCredits.remainingKobo} - ${x}`,
        status: sql`CASE WHEN ${vendorCredits.remainingKobo} - ${x} <= 0 THEN 'applied' ELSE 'open' END`,
        appliedAt: new Date(),
      })
      .where(and(eq(vendorCredits.id, credit.id), gte(vendorCredits.remainingKobo, x)))
      .returning({ id: vendorCredits.id });
    if (!rows[0]) {
      throw new TRPCError({
        code: "CONFLICT",
        message: "Vendor credit balance changed concurrently — retry the payment",
      });
    }
    applied += x;
    left -= x;
  }
  return applied;
}

/**
 * Guarded bill progress update: folds the ownership check, the payable-status
 * guard, and the no-overpayment invariant into ONE atomic UPDATE ... WHERE ...
 * RETURNING (TOCTOU-safe, ecommerce.ts allowedFrom/inArray pattern).
 */
async function guardedBillProgressUpdate(
  tx: any,
  opts: { billId: string; merchantId: string; currentPaidKobo: number; totalKobo: number; deltaKobo: number },
) {
  const newPaid = opts.currentPaidKobo + opts.deltaKobo;
  const newStatus = newPaid >= opts.totalKobo ? "paid" : "partially_paid";
  const [row] = await tx
    .update(apBills)
    .set({
      amountPaidKobo: sql`${apBills.amountPaidKobo} + ${opts.deltaKobo}`,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(and(
      eq(apBills.id, opts.billId),
      eq(apBills.merchantId, opts.merchantId),
      inArray(apBills.status, [...PAYABLE_STATUSES]),
      sql`${apBills.amountPaidKobo} + ${opts.deltaKobo} <= ${apBills.totalKobo}`,
    ))
    .returning();
  if (!row) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Bill status or balance changed concurrently — payment aborted, retry",
    });
  }
  return row;
}

/** Resolve a vendor's payout bank details (must exist on the vendor record). */
async function resolveVendorBank(tx: any, merchantId: string, vendorId: string | null) {
  if (!vendorId) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Bill has no vendor — attach a vendor with bank details before paying",
    });
  }
  const [vendor] = await tx
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.merchantId, merchantId)))
    .limit(1);
  if (!vendor || !vendor.bankCode || !vendor.accountNumber) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: "Vendor bank details (bankCode/accountNumber) are required before payment",
    });
  }
  return {
    bankCode: vendor.bankCode,
    accountNumber: vendor.accountNumber,
    accountName: vendor.accountName ?? vendor.name,
  };
}

/**
 * Verify a Stripe PaymentIntent server-side (status === 'succeeded' and amount
 * matches). FAILS CLOSED when Stripe is not configured. (hostedCheckout.ts:61 pattern.)
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
    throw new TRPCError({ code: "BAD_REQUEST", message: "Payment amount does not match the bill funding amount" });
  }
}

// ─── Validation schemas ───────────────────────────────────────────────────────

const idempotencyKeySchema = z.string().min(8).max(128);

const lineItemInput = z.object({
  description: z.string().min(1).max(2000),
  quantity: z.number().positive(),
  unitPriceKobo: z.number().int().nonnegative(),
  amountKobo: z.number().int().nonnegative().optional(),
  accountCode: z.string().max(32).optional(),
});

type LineItemInput = z.infer<typeof lineItemInput>;

function normalizeLineItems(items: LineItemInput[]) {
  return items.map((li) => ({
    ...li,
    amountKobo: li.amountKobo ?? Math.round(li.quantity * li.unitPriceKobo),
  }));
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const apBillPayRouter = router({
  /** Create a manual bill with line items; computes WHT via taxCompliance. */
  createBill: protectedProcedure
    .input(z.object({
      vendorId: z.string().max(64).nullish(),
      billNumber: z.string().max(64).nullish(),
      currency: z.string().length(3).default("NGN"),
      taxKobo: z.number().int().nonnegative().default(0),
      dueDate: z.coerce.date().nullish(),
      sourceRef: z.string().max(255).nullish(),
      documentUrl: z.string().url().nullish(),
      lineItems: z.array(lineItemInput).min(1),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, merchant } = await resolveMerchant(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        operation: "ap.bills.create",
        requestBody: input,
        execute: async () => {
          const lineItems = normalizeLineItems(input.lineItems);
          const subtotalKobo = lineItems.reduce((sum, li) => sum + li.amountKobo, 0);
          const wht = await computeBillWhtForBill({
            merchantId: merchant.id,
            vendorId: input.vendorId ?? null,
            subtotalKobo,
          });
          const totalKobo = subtotalKobo + input.taxKobo - wht.whtKobo;
          if (totalKobo <= 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bill total must be greater than zero" });
          }

          const bill = await db.transaction(async (tx) => {
            const [row] = await tx.insert(apBills).values({
              merchantId: merchant.id,
              vendorId: input.vendorId ?? null,
              billNumber: input.billNumber ?? null,
              status: "draft",
              currency: input.currency,
              subtotalKobo,
              taxKobo: input.taxKobo,
              whtKobo: wht.whtKobo,
              totalKobo,
              dueDate: input.dueDate ?? null,
              source: "manual",
              sourceRef: input.sourceRef ?? null,
              documentUrl: input.documentUrl ?? null,
              idempotencyKey: input.idempotencyKey,
              createdBy: user.id,
            }).returning();
            await tx.insert(apBillLineItems).values(lineItems.map((li) => ({
              billId: row.id,
              description: li.description,
              quantity: String(li.quantity),
              unitPriceKobo: li.unitPriceKobo,
              amountKobo: li.amountKobo,
              accountCode: li.accountCode ?? null,
            })));
            return row;
          });

          await publishBillEvent("created", merchant.id, bill.id, {
            vendorId: bill.vendorId, totalKobo, whtKobo: wht.whtKobo,
          });
          await auditBill(ctx, merchant.id, "ap_bill.created", bill.id, {
            billNumber: bill.billNumber, vendorId: bill.vendorId,
            subtotalKobo, taxKobo: input.taxKobo, whtKobo: wht.whtKobo, totalKobo,
          });
          return { bill, lineItems, wht };
        },
      });
    }),

  /** List merchant bills with status/vendor/due-date filters. */
  listBills: protectedProcedure
    .input(z.object({
      status: z.enum(BILL_STATUSES).optional(),
      vendorId: z.string().max(64).optional(),
      dueBefore: z.coerce.date().optional(),
      dueAfter: z.coerce.date().optional(),
      limit: z.number().int().min(1).max(200).default(50),
      offset: z.number().int().min(0).default(0),
    }))
    .query(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const conds = [eq(apBills.merchantId, merchant.id)];
      if (input.status) conds.push(eq(apBills.status, input.status));
      if (input.vendorId) conds.push(eq(apBills.vendorId, input.vendorId));
      if (input.dueBefore) conds.push(lte(apBills.dueDate, input.dueBefore));
      if (input.dueAfter) conds.push(gte(apBills.dueDate, input.dueAfter));
      const bills = await db
        .select()
        .from(apBills)
        .where(and(...conds))
        .orderBy(asc(apBills.dueDate), desc(apBills.createdAt))
        .limit(input.limit)
        .offset(input.offset);
      return { bills };
    }),

  /** Fetch one bill with its line items and payment history (merchant-scoped). */
  getBill: protectedProcedure
    .input(z.object({ billId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      const [lineItems, payments] = await Promise.all([
        db.select().from(apBillLineItems).where(eq(apBillLineItems.billId, bill.id)),
        db.select().from(apPayments).where(eq(apPayments.billId, bill.id)).orderBy(desc(apPayments.createdAt)),
      ]);
      return { bill, lineItems, payments };
    }),

  /** Update a bill — only while status='draft' (guarded UPDATE ... WHERE status='draft'). */
  updateBill: protectedProcedure
    .input(z.object({
      billId: z.string().min(1),
      vendorId: z.string().max(64).nullish(),
      billNumber: z.string().max(64).nullish(),
      currency: z.string().length(3).optional(),
      taxKobo: z.number().int().nonnegative().optional(),
      dueDate: z.coerce.date().nullish(),
      sourceRef: z.string().max(255).nullish(),
      documentUrl: z.string().url().nullish(),
      lineItems: z.array(lineItemInput).min(1).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      const updates: Record<string, unknown> = { updatedAt: new Date() };
      if (input.vendorId !== undefined) updates.vendorId = input.vendorId;
      if (input.billNumber !== undefined) updates.billNumber = input.billNumber;
      if (input.currency !== undefined) updates.currency = input.currency;
      if (input.dueDate !== undefined) updates.dueDate = input.dueDate;
      if (input.sourceRef !== undefined) updates.sourceRef = input.sourceRef;
      if (input.documentUrl !== undefined) updates.documentUrl = input.documentUrl;

      const lineItems = input.lineItems ? normalizeLineItems(input.lineItems) : null;
      let wht: { whtKobo: number; whtRatePct: number | null; applied: boolean } | null = null;
      if (lineItems || input.taxKobo !== undefined || input.vendorId !== undefined) {
        const subtotalKobo = lineItems
          ? lineItems.reduce((sum, li) => sum + li.amountKobo, 0)
          : (bill.subtotalKobo ?? 0);
        const taxKobo = input.taxKobo ?? bill.taxKobo ?? 0;
        wht = await computeBillWhtForBill({
          merchantId: merchant.id,
          vendorId: input.vendorId !== undefined ? (input.vendorId ?? null) : (bill.vendorId ?? null),
          subtotalKobo,
        });
        const totalKobo = subtotalKobo + taxKobo - wht.whtKobo;
        if (totalKobo <= 0) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "Bill total must be greater than zero" });
        }
        updates.subtotalKobo = subtotalKobo;
        updates.taxKobo = taxKobo;
        updates.whtKobo = wht.whtKobo;
        updates.totalKobo = totalKobo;
      }

      const updated = await db.transaction(async (tx) => {
        const [row] = await tx
          .update(apBills)
          .set(updates)
          .where(and(
            eq(apBills.id, bill.id),
            eq(apBills.merchantId, merchant.id),
            eq(apBills.status, "draft"),
          ))
          .returning();
        if (!row) {
          throw new TRPCError({
            code: "CONFLICT",
            message: "Bill is not editable — only 'draft' bills can be updated",
          });
        }
        if (lineItems) {
          await tx.delete(apBillLineItems).where(eq(apBillLineItems.billId, bill.id));
          await tx.insert(apBillLineItems).values(lineItems.map((li) => ({
            billId: bill.id,
            description: li.description,
            quantity: String(li.quantity),
            unitPriceKobo: li.unitPriceKobo,
            amountKobo: li.amountKobo,
            accountCode: li.accountCode ?? null,
          })));
        }
        return row;
      });

      await publishBillEvent("updated", merchant.id, bill.id, { updates: Object.keys(updates) });
      await auditBill(ctx, merchant.id, "ap_bill.updated", bill.id, { updates: Object.keys(updates) });
      return { bill: updated, wht };
    }),

  /** Void a bill — guarded so paid/partially_paid/void bills can never be voided. */
  voidBill: protectedProcedure
    .input(z.object({ billId: z.string().min(1), reason: z.string().max(500).optional() }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const [updated] = await db
        .update(apBills)
        .set({ status: "void", updatedAt: new Date() })
        .where(and(
          eq(apBills.id, input.billId),
          eq(apBills.merchantId, merchant.id),
          inArray(apBills.status, [...VOIDABLE_STATUSES]),
        ))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: "Bill cannot be voided — not found, not owned by this merchant, or already paid/void",
        });
      }
      await publishBillEvent("voided", merchant.id, updated.id, { reason: input.reason ?? null });
      await auditBill(ctx, merchant.id, "ap_bill.voided", updated.id, { reason: input.reason ?? null });
      return { bill: updated };
    }),

  /**
   * Approve a bill for payment. Privileged (pbac 'approve_payout') with
   * maker≠checker enforcement. Guarded flip pending_approval→approved, or
   * draft→approved when no WHT is pending on the bill (WHT bills must go
   * through the approval chain).
   */
  approveBill: pbacProcedure("approve_payout")
    .input(z.object({ billId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      // Maker ≠ checker: the bill creator can never approve their own bill.
      if (bill.createdBy != null && bill.createdBy === ctx.user.id) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Maker-checker violation — the bill creator cannot approve their own bill",
        });
      }

      const whtPending = (bill.whtKobo ?? 0) > 0;
      const allowedFrom = whtPending ? ["pending_approval"] : ["pending_approval", "draft"];
      const [updated] = await db
        .update(apBills)
        .set({ status: "approved", updatedAt: new Date() })
        .where(and(
          eq(apBills.id, bill.id),
          eq(apBills.merchantId, merchant.id),
          inArray(apBills.status, allowedFrom),
        ))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "CONFLICT",
          message: whtPending
            ? "Bill cannot be approved from its current status — WHT bills must be submitted for approval first"
            : "Bill cannot be approved from its current status",
        });
      }
      await publishBillEvent("approved", merchant.id, bill.id, { approverId: ctx.user.id });
      await auditBill(ctx, merchant.id, "ap_bill.approved", bill.id, { approverId: ctx.user.id });
      return { bill: updated };
    }),

  /**
   * Pay an approved/partially_paid bill.
   *
   * wallet:         atomic guarded wallet debit (routers.ts:9754 pattern) →
   *                 payout row (createPayout) → initiatePayoutApproval (STRICT)
   *                 inside ONE db.transaction — payout failure rolls the debit back.
   * bank_transfer:  same payout path, no wallet debit (funding settled via bank rail).
   * card:           applies open vendor credits, then creates a Stripe
   *                 PaymentIntent for the funded remainder + disclosed 2.9% fee;
   *                 completion happens in payBillConfirm.
   *
   * Open vendor credits are ALWAYS applied first (atomic guarded decrement),
   * reducing the funded amount. If credits cover the bill in full, no payout
   * is created and the bill flips straight to 'paid'.
   */
  payBill: protectedProcedure
    .input(z.object({
      billId: z.string().min(1),
      fundingMethod: z.enum(["wallet", "card", "bank_transfer"]),
      idempotencyKey: idempotencyKeySchema,
    }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        operation: "ap.bills.pay",
        requestBody: input,
        execute: async () => {
          const [bill] = await db
            .select()
            .from(apBills)
            .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
            .limit(1);
          if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
          if (!(PAYABLE_STATUSES as readonly string[]).includes(bill.status)) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Bill is not payable from status '${bill.status}' — must be approved or partially_paid`,
            });
          }
          const paidSoFar = bill.amountPaidKobo ?? 0;
          const remaining = bill.totalKobo - paidSoFar;
          if (remaining <= 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Bill is already fully paid" });
          }
          const currency = bill.currency ?? "NGN";

          // ── Card path: credits first, then a Stripe PaymentIntent for the rest ──
          if (input.fundingMethod === "card") {
            if (!isStripeConfigured()) {
              throw new TRPCError({
                code: "SERVICE_UNAVAILABLE",
                message: "Card payments are not configured (STRIPE_SECRET_KEY unset)",
              });
            }
            const creditAppliedKobo = await db.transaction(async (tx) => {
              const applied = await applyOpenVendorCredits(tx, merchant.id, bill.vendorId, remaining);
              if (applied > 0) {
                await guardedBillProgressUpdate(tx, {
                  billId: bill.id, merchantId: merchant.id,
                  currentPaidKobo: paidSoFar, totalKobo: bill.totalKobo, deltaKobo: applied,
                });
              }
              return applied;
            });
            const fundedKobo = remaining - creditAppliedKobo;
            if (fundedKobo <= 0) {
              await publishBillEvent("paid", merchant.id, bill.id, { creditAppliedKobo, fundedKobo: 0 });
              await auditBill(ctx, merchant.id, "ap_bill.paid_by_credit", bill.id, { creditAppliedKobo });
              return { status: "paid", fundedKobo: 0, creditAppliedKobo, feeKobo: 0 };
            }
            const feeKobo = computeFundingFee("card", fundedKobo);
            const pi = await createPaymentIntent({
              amountKobo: fundedKobo + feeKobo,
              currency,
              description: `AP bill ${bill.billNumber ?? bill.id}`,
              merchantId: merchant.id,
              metadata: { type: "ap_bill_funding", bill_id: bill.id },
            });
            const reference = `stripe:pi_${pi.paymentIntentId}`;
            const [apPayment] = await db.insert(apPayments).values({
              billId: bill.id,
              merchantId: merchant.id,
              fundingMethod: "card",
              amountKobo: fundedKobo,
              feeKobo,
              status: "pending",
              reference,
              metadata: { paymentIntentId: pi.paymentIntentId },
            }).returning();
            await publishBillEvent("payment_initiated", merchant.id, bill.id, {
              apPaymentId: apPayment.id, fundingMethod: "card", fundedKobo, feeKobo, creditAppliedKobo,
            });
            await auditBill(ctx, merchant.id, "ap_bill.payment_initiated", bill.id, {
              apPaymentId: apPayment.id, fundingMethod: "card", fundedKobo, feeKobo, creditAppliedKobo,
            });
            return {
              status: "awaiting_card_payment",
              clientSecret: pi.clientSecret,
              paymentIntentId: pi.paymentIntentId,
              apPaymentId: apPayment.id,
              fundedKobo,
              feeKobo,
              creditAppliedKobo,
              feeDisclosure: "Card funding fee: 2.9% of the funded amount, disclosed at checkout",
            };
          }

          // ── wallet / bank_transfer path ──
          let payout: { id: string } | null = null;
          try {
            const outcome = await db.transaction(async (tx) => {
              const creditAppliedKobo = await applyOpenVendorCredits(tx, merchant.id, bill.vendorId, remaining);
              const fundedKobo = remaining - creditAppliedKobo;

              if (fundedKobo <= 0) {
                // Credits covered the whole bill — no payout needed.
                const updated = await guardedBillProgressUpdate(tx, {
                  billId: bill.id, merchantId: merchant.id,
                  currentPaidKobo: paidSoFar, totalKobo: bill.totalKobo, deltaKobo: creditAppliedKobo,
                });
                return { status: "paid" as const, bill: updated, fundedKobo: 0, creditAppliedKobo, feeKobo: 0, apPaymentId: null as string | null, payoutId: null as string | null };
              }

              const feeKobo = computeFundingFee(input.fundingMethod, fundedKobo);

              // Atomic guarded wallet debit — the WHERE clause enforces
              // sufficient funds under the row lock (server/routers.ts:9754 pattern).
              if (input.fundingMethod === "wallet") {
                const [wallet] = await tx
                  .select()
                  .from(consumerWallets)
                  .where(and(
                    eq(consumerWallets.userId, ctx.user.id),
                    eq(consumerWallets.currency, currency),
                  ))
                  .limit(1);
                if (!wallet) {
                  throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found. Please top up first." });
                }
                const debitRows = await tx
                  .update(consumerWallets)
                  .set({
                    balanceKobo: sql`${consumerWallets.balanceKobo} - ${fundedKobo + feeKobo}`,
                    updatedAt: new Date(),
                  })
                  .where(and(
                    eq(consumerWallets.id, wallet.id),
                    gte(consumerWallets.balanceKobo, fundedKobo + feeKobo),
                  ))
                  .returning({ balanceKobo: consumerWallets.balanceKobo });
                if (!debitRows[0]) {
                  throw new TRPCError({
                    code: "BAD_REQUEST",
                    message: `Insufficient balance. Available: ${(wallet.balanceKobo / 100).toFixed(2)} ${currency}`,
                  });
                }
              }

              const bank = await resolveVendorBank(tx, merchant.id, bill.vendorId);
              const reference = generateApReference();
              const [apPayment] = await tx.insert(apPayments).values({
                billId: bill.id,
                merchantId: merchant.id,
                fundingMethod: input.fundingMethod,
                amountKobo: fundedKobo,
                feeKobo,
                status: "processing",
                reference,
              }).returning();

              const updated = await guardedBillProgressUpdate(tx, {
                billId: bill.id, merchantId: merchant.id,
                currentPaidKobo: paidSoFar, totalKobo: bill.totalKobo,
                deltaKobo: creditAppliedKobo + fundedKobo,
              });

              // Payout row via the existing helper + STRICT approval workflow.
              // Any throw here rolls the whole transaction back (wallet debit,
              // credits, bill progress) — the payout row is marked failed below.
              payout = await createPayout({
                id: randomUUID(),
                tenantId: merchant.tenantId,
                merchantId: merchant.id,
                reference,
                amount: fundedKobo,
                currency,
                status: "pending",
                bankCode: bank.bankCode,
                accountNumber: bank.accountNumber,
                accountName: bank.accountName,
                narration: `AP bill ${bill.billNumber ?? bill.id}`,
                feeAmount: feeKobo,
              });
              await initiatePayoutApproval({
                payoutId: payout.id,
                merchantId: merchant.id,
                amount: fundedKobo,
                currency,
                bankCode: bank.bankCode,
                accountNumber: bank.accountNumber,
                accountName: bank.accountName,
                narration: `AP bill ${bill.billNumber ?? bill.id}`,
                reference,
                initiatorId: String(ctx.user.id),
              });
              await tx.update(apPayments).set({ payoutId: payout.id }).where(eq(apPayments.id, apPayment.id));

              return {
                status: updated.status as string,
                bill: updated,
                fundedKobo,
                creditAppliedKobo,
                feeKobo,
                apPaymentId: apPayment.id as string | null,
                payoutId: payout.id as string | null,
              };
            });

            await publishBillEvent("payment_initiated", merchant.id, bill.id, {
              apPaymentId: outcome.apPaymentId, payoutId: outcome.payoutId,
              fundingMethod: input.fundingMethod, fundedKobo: outcome.fundedKobo,
              feeKobo: outcome.feeKobo, creditAppliedKobo: outcome.creditAppliedKobo,
              billStatus: outcome.status,
            });
            await auditBill(ctx, merchant.id, "ap_bill.payment_initiated", bill.id, {
              apPaymentId: outcome.apPaymentId, payoutId: outcome.payoutId,
              fundingMethod: input.fundingMethod, fundedKobo: outcome.fundedKobo,
              feeKobo: outcome.feeKobo, creditAppliedKobo: outcome.creditAppliedKobo,
            });
            return outcome;
          } catch (err) {
            // Transaction rolled back (wallet restored). If a payout row was
            // already written by the helper before approval initiation failed,
            // mark it failed so it is never executed downstream.
            // (Cast: TS narrows the closure-captured `payout` to null in catch
            // blocks even though the transaction closure may have assigned it.)
            const failedPayout = payout as { id: string } | null;
            if (failedPayout?.id) {
              try {
                await updatePayout(failedPayout.id, {
                  status: "failed",
                  failureReason: err instanceof Error ? err.message : String(err),
                });
              } catch (markErr) {
                logger.error("ap_bill_payout_mark_failed_error", {
                  payoutId: failedPayout.id,
                  error: markErr instanceof Error ? markErr.message : String(markErr),
                });
              }
            }
            throw err;
          }
        },
      });
    }),

  /**
   * Complete a card-funded bill payment after the Stripe PaymentIntent
   * succeeds. Verifies the PI server-side (fail-closed), dedups on the
   * canonical `stripe:pi_<id>` reference, then completes the payout.
   */
  payBillConfirm: protectedProcedure
    .input(z.object({ paymentIntentId: z.string().min(3) }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);
      const reference = `stripe:pi_${input.paymentIntentId}`;
      const [payment] = await db
        .select()
        .from(apPayments)
        .where(and(eq(apPayments.reference, reference), eq(apPayments.merchantId, merchant.id)))
        .limit(1);
      if (!payment) throw new TRPCError({ code: "NOT_FOUND", message: "Payment not found" });

      // Canonical stripe:pi_ dedup — a previously processed PI returns the
      // stored outcome instead of paying out twice.
      if (payment.status === "processing" || payment.status === "completed") {
        return {
          apPaymentId: payment.id,
          payoutId: payment.payoutId ?? null,
          status: payment.status,
          deduplicated: true,
        };
      }
      if (payment.status === "failed") {
        throw new TRPCError({
          code: "CONFLICT",
          message: "This card payment previously failed — initiate a new payment from the bill",
        });
      }

      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, payment.billId), eq(apBills.merchantId, merchant.id)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      await verifyStripePaymentIntent(input.paymentIntentId, payment.amountKobo + (payment.feeKobo ?? 0));

      const currency = bill.currency ?? "NGN";
      let payout: { id: string } | null = null;
      try {
        const outcome = await db.transaction(async (tx) => {
          // Claim the pending payment atomically — a concurrent confirm loses.
          const [claimed] = await tx
            .update(apPayments)
            .set({ status: "processing" })
            .where(and(eq(apPayments.id, payment.id), eq(apPayments.status, "pending")))
            .returning();
          if (!claimed) {
            throw new TRPCError({ code: "CONFLICT", message: "Payment is already being processed" });
          }
          const updated = await guardedBillProgressUpdate(tx, {
            billId: bill.id, merchantId: merchant.id,
            currentPaidKobo: bill.amountPaidKobo ?? 0, totalKobo: bill.totalKobo,
            deltaKobo: payment.amountKobo,
          });

          const bank = await resolveVendorBank(tx, merchant.id, bill.vendorId);
          payout = await createPayout({
            id: randomUUID(),
            tenantId: merchant.tenantId,
            merchantId: merchant.id,
            reference,
            amount: payment.amountKobo,
            currency,
            status: "pending",
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
            narration: `AP bill ${bill.billNumber ?? bill.id} (card funding)`,
            feeAmount: payment.feeKobo ?? 0,
          });
          await initiatePayoutApproval({
            payoutId: payout.id,
            merchantId: merchant.id,
            amount: payment.amountKobo,
            currency,
            bankCode: bank.bankCode,
            accountNumber: bank.accountNumber,
            accountName: bank.accountName,
            narration: `AP bill ${bill.billNumber ?? bill.id} (card funding)`,
            reference,
            initiatorId: String(ctx.user.id),
          });
          await tx.update(apPayments).set({ payoutId: payout.id }).where(eq(apPayments.id, payment.id));
          return { apPaymentId: payment.id, payoutId: payout.id, billStatus: updated.status };
        });

        await publishBillEvent("payment_completed", merchant.id, bill.id, {
          apPaymentId: outcome.apPaymentId, payoutId: outcome.payoutId,
          fundingMethod: "card", amountKobo: payment.amountKobo, billStatus: outcome.billStatus,
        });
        await auditBill(ctx, merchant.id, "ap_bill.payment_completed", bill.id, {
          apPaymentId: outcome.apPaymentId, payoutId: outcome.payoutId,
          paymentIntentId: input.paymentIntentId,
        });
        return {
          apPaymentId: outcome.apPaymentId,
          payoutId: outcome.payoutId,
          status: "processing",
          billStatus: outcome.billStatus,
          deduplicated: false,
        };
      } catch (err) {
        // (Cast: see payBill — TS mis-narrows the closure-captured `payout`.)
        const failedPayout = payout as { id: string } | null;
        if (failedPayout?.id) {
          try {
            await updatePayout(failedPayout.id, {
              status: "failed",
              failureReason: err instanceof Error ? err.message : String(err),
            });
          } catch (markErr) {
            logger.error("ap_bill_payout_mark_failed_error", {
              payoutId: failedPayout.id,
              error: markErr instanceof Error ? markErr.message : String(markErr),
            });
          }
        }
        // Best-effort: mark the ap_payment failed outside the rolled-back tx
        // only when the failure happened after it was claimed.
        if (failedPayout) {
          try {
            await db.update(apPayments)
              .set({ status: "failed" })
              .where(and(eq(apPayments.id, payment.id), eq(apPayments.status, "processing")));
          } catch { /* non-fatal */ }
        }
        throw err;
      }
    }),
});

/** Pure internals exported for unit tests (spec D3). */
export const __apBillPayInternals = {
  AP_FUNDING_FEE_RATES,
  PAYABLE_STATUSES,
  VOIDABLE_STATUSES,
  computeFundingFee,
  generateApReference,
  normalizeLineItems,
};
