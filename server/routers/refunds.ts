/**
 * refunds.ts — Paystack-parity standalone refunds product.
 *
 * Money in bigint kobo. Fail loud: when the payment rail has no refund API we
 * mark the refund `needs_attention` with an explicit reason — success is never
 * fabricated. All financial mutations run inside withIdempotency.
 *
 * Status lifecycle:
 *   pending → processing → processed | failed
 *   pending | processing | failed → needs_attention (rail cannot auto-refund)
 *   needs_attention → processing (via retryWithCustomerDetails only)
 *
 * Webhook events (dispatched on every transition):
 *   refund.pending, refund.processing, refund.needs_attention,
 *   refund.failed, refund.processed
 *
 * NOTE: the `refunds` table is created by drizzle/0095_refunds_splits.sql and
 * accessed via raw SQL here because drizzle/schema.ts is owned by another work
 * stream. Column names below match that migration exactly.
 */

import crypto from "crypto";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent } from "../webhookEvents";
import { logger } from "../logger";

// ─── Webhook event type constants ────────────────────────────────────────────
export const REFUND_EVENTS = {
  pending: "refund.pending",
  processing: "refund.processing",
  needsAttention: "refund.needs_attention",
  failed: "refund.failed",
  processed: "refund.processed",
} as const;
export type RefundEventType = (typeof REFUND_EVENTS)[keyof typeof REFUND_EVENTS];

export const REFUND_STATUSES = [
  "pending",
  "processing",
  "needs_attention",
  "failed",
  "processed",
] as const;
export type RefundStatus = (typeof REFUND_STATUSES)[number];

/** Legal transitions. processed / failed are terminal. */
const REFUND_TRANSITIONS: Record<RefundStatus, readonly RefundStatus[]> = {
  pending: ["processing", "needs_attention", "failed"],
  processing: ["processed", "failed", "needs_attention"],
  needs_attention: ["processing", "failed"],
  failed: ["needs_attention"],
  processed: [],
};

const TENANT_ID = "ten_default";

// ─── Types ───────────────────────────────────────────────────────────────────
export interface RefundRow {
  id: string;
  merchant_id: string;
  transaction_ref: string;
  transaction_id: string | null;
  amount_kobo: number | null;
  currency: string;
  status: RefundStatus;
  merchant_note: string | null;
  customer_note: string | null;
  processor: string | null;
  refunded_by: string | null;
  deducted_amount: number | null;
  fully_deducted: boolean;
  expected_at: string | null;
  refunded_at: string | null;
  retry_account: unknown | null;
  created_at: string;
  updated_at: string;
}

export interface RetryAccountDetails {
  accountNumber: string;
  bankCode: string;
  accountName?: string;
}

// ─── Merchant scoping (same pattern as crud119.ts) ──────────────────────────
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant)
    throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

// ─── DB helpers (raw SQL against migration 0095 tables) ─────────────────────
async function insertRefund(db: any, r: RefundRow): Promise<RefundRow> {
  const res = await db.execute(sql`
    INSERT INTO refunds (
      id, merchant_id, transaction_ref, transaction_id, amount_kobo, currency,
      status, merchant_note, customer_note, processor, refunded_by,
      deducted_amount, fully_deducted, expected_at, refunded_at, retry_account,
      created_at, updated_at
    ) VALUES (
      ${r.id}, ${r.merchant_id}, ${r.transaction_ref}, ${r.transaction_id},
      ${r.amount_kobo}, ${r.currency}, ${r.status}, ${r.merchant_note},
      ${r.customer_note}, ${r.processor}, ${r.refunded_by},
      ${r.deducted_amount}, ${r.fully_deducted}, ${r.expected_at},
      ${r.refunded_at},
      ${r.retry_account == null ? null : JSON.stringify(r.retry_account)},
      ${r.created_at}, ${r.updated_at}
    )
    RETURNING *
  `);
  return res.rows[0] as unknown as RefundRow;
}

async function getRefundForMerchant(
  db: any,
  merchantId: string,
  id: string,
): Promise<RefundRow | null> {
  const res = await db.execute(sql`
    SELECT * FROM refunds WHERE id = ${id} AND merchant_id = ${merchantId} LIMIT 1
  `);
  return (res.rows[0] as unknown as RefundRow | undefined) ?? null;
}

/** Sum of kobo already refunded (or in flight) against a transaction. */
async function sumPriorRefunds(
  db: any,
  merchantId: string,
  transactionRef: string,
): Promise<number> {
  const res = await db.execute(sql`
    SELECT COALESCE(SUM(amount_kobo), 0)::bigint AS total
    FROM refunds
    WHERE merchant_id = ${merchantId}
      AND transaction_ref = ${transactionRef}
      AND status IN ('pending', 'processing', 'needs_attention', 'processed')
  `);
  return Number((res.rows[0] as any)?.total ?? 0);
}

/**
 * Guarded status transition: re-checks the pre-transition status in the
 * UPDATE's WHERE so a concurrent transition cannot slip through, and refuses
 * to leave/enter terminal states illegally.
 */
export async function transitionRefundStatus(
  db: any,
  merchantId: string,
  id: string,
  next: RefundStatus,
  extra: Partial<{
    processor: string;
    deducted_amount: number;
    fully_deducted: boolean;
    refunded_at: string;
    expected_at: string;
    retry_account: unknown;
  }> = {},
): Promise<RefundRow> {
  const current = await getRefundForMerchant(db, merchantId, id);
  if (!current) throw new TRPCError({ code: "NOT_FOUND", message: "Refund not found" });
  const allowed = REFUND_TRANSITIONS[current.status] ?? [];
  if (!allowed.includes(next)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Illegal refund status transition '${current.status}' → '${next}'`,
    });
  }
  const now = new Date().toISOString();
  const res = await db.execute(sql`
    UPDATE refunds SET
      status = ${next},
      processor = COALESCE(${extra.processor ?? null}, processor),
      deducted_amount = COALESCE(${extra.deducted_amount ?? null}, deducted_amount),
      fully_deducted = COALESCE(${extra.fully_deducted ?? null}, fully_deducted),
      refunded_at = COALESCE(${extra.refunded_at ?? null}, refunded_at),
      expected_at = COALESCE(${extra.expected_at ?? null}, expected_at),
      retry_account = COALESCE(
        ${extra.retry_account === undefined ? null : JSON.stringify(extra.retry_account)},
        retry_account
      ),
      updated_at = ${now}
    WHERE id = ${id} AND merchant_id = ${merchantId} AND status = ${current.status}
    RETURNING *
  `);
  const row = res.rows[0] as unknown as RefundRow | undefined;
  if (!row) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Refund status changed concurrently — retry",
    });
  }
  await emitRefundEvent(merchantId, next, row);
  return row;
}

async function emitRefundEvent(
  merchantId: string,
  status: RefundStatus,
  refund: RefundRow,
): Promise<void> {
  const eventMap: Record<RefundStatus, RefundEventType> = {
    pending: REFUND_EVENTS.pending,
    processing: REFUND_EVENTS.processing,
    needs_attention: REFUND_EVENTS.needsAttention,
    failed: REFUND_EVENTS.failed,
    processed: REFUND_EVENTS.processed,
  };
  try {
    await dispatchWebhookEvent({
      // The WebhookEventType union is closed and owned elsewhere; refund.*
      // events are defined here as constants and dispatched through the
      // generic dispatcher.
      event: eventMap[status] as any,
      id: `evt_${crypto.randomBytes(10).toString("hex")}`,
      tenantId: TENANT_ID,
      merchantId,
      timestamp: new Date().toISOString(),
      data: {
        refund_id: refund.id,
        transaction_ref: refund.transaction_ref,
        amount_kobo: refund.amount_kobo,
        currency: refund.currency,
        status: refund.status,
        processor: refund.processor,
      },
    });
  } catch (err: any) {
    // Webhook delivery must never roll back a money-state transition.
    logger.error("refund webhook dispatch failed", { err, refundId: refund.id, status });
  }
}

// ─── Rail reversal ───────────────────────────────────────────────────────────
interface ReversalOutcome {
  ok: boolean;
  processor: string;
  expectedAt?: string;
  reason?: string;
}

/**
 * Drive the actual reversal on the configured rail. Returns ok=false with an
 * explicit reason when the rail cannot refund automatically — callers then
 * park the refund in needs_attention. NEVER fabricates success.
 */
export async function driveReversal(opts: {
  transaction: { reference: string; channel?: string | null; metadata?: unknown };
  amountKobo: number;
  currency: string;
  retryAccount?: RetryAccountDetails | null;
}): Promise<ReversalOutcome> {
  const meta = (opts.transaction.metadata ?? {}) as Record<string, unknown>;
  const stripePaymentIntent =
    typeof meta.stripePaymentIntentId === "string" ? meta.stripePaymentIntentId : null;

  if (stripePaymentIntent && process.env.STRIPE_SECRET_KEY) {
    try {
      const res = await fetch("https://api.stripe.com/v1/refunds", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}`,
          "Content-Type": "application/x-www-form-urlencoded",
        },
        body: new URLSearchParams({
          payment_intent: stripePaymentIntent,
          amount: String(opts.amountKobo),
        }).toString(),
        signal: AbortSignal.timeout(10_000),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        return {
          ok: false,
          processor: "stripe",
          reason: `Stripe refund failed (HTTP ${res.status}): ${body.slice(0, 300)}`,
        };
      }
      return { ok: true, processor: "stripe" };
    } catch (err: any) {
      return {
        ok: false,
        processor: "stripe",
        reason: `Stripe refund request error: ${err?.message ?? "unknown"}`,
      };
    }
  }

  // No automated rail: bank/transfer refunds need customer account details.
  if (!opts.retryAccount) {
    return {
      ok: false,
      processor: "manual",
      reason:
        "Payment rail has no automated refund API for this transaction; " +
        "collect customer account details and retry via retryWithCustomerDetails.",
    };
  }
  // Even with account details there is no configured payout rail here — fail
  // loud rather than fabricate a processed refund.
  return {
    ok: false,
    processor: "manual",
    reason:
      "No disbursement rail configured to pay out to the supplied customer account; " +
      "refund requires manual settlement.",
  };
}

// ─── Validation schemas ──────────────────────────────────────────────────────
const retryAccountSchema = z.object({
  accountNumber: z.string().min(4).max(20),
  bankCode: z.string().min(1).max(20),
  accountName: z.string().max(200).optional(),
});

const createInput = z.object({
  idempotencyKey: z.string().min(8),
  transactionRef: z.string().min(1),
  /** kobo; omit for a full refund of the remaining refundable balance */
  amountKobo: z.number().int().positive().optional(),
  merchantNote: z.string().max(1000).optional(),
  customerNote: z.string().max(1000).optional(),
});

const listInput = z.object({
  status: z.enum(REFUND_STATUSES).optional(),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  cursor: z.string().optional(), // refund id — keyset pagination
  limit: z.number().int().min(1).max(100).default(25),
});

// ─── Router ──────────────────────────────────────────────────────────────────
export const refundsRouter = router({
  create: protectedProcedure.input(createInput).mutation(async ({ input, ctx }) => {
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    return withIdempotency({
      key: input.idempotencyKey,
      merchantId,
      operation: "refunds.create",
      requestBody: input,
      execute: async () => {
        // 1. Transaction must belong to this merchant and be successful.
        const txRes = await db.execute(sql`
          SELECT id, reference, amount, currency, status, channel, metadata
          FROM transactions
          WHERE reference = ${input.transactionRef} AND merchant_id = ${merchantId}
          LIMIT 1
        `);
        const tx = txRes.rows[0] as any | undefined;
        if (!tx) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `Transaction '${input.transactionRef}' not found for this merchant`,
          });
        }
        if (tx.status !== "success" && tx.status !== "completed") {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message: `Only successful transactions can be refunded (status='${tx.status}')`,
          });
        }

        // 2. Partial must fit within original minus prior refunds.
        const original = Number(tx.amount);
        const prior = await sumPriorRefunds(db, merchantId, tx.reference);
        const remaining = original - prior;
        const amountKobo = input.amountKobo ?? remaining;
        if (amountKobo <= 0 || amountKobo > remaining) {
          throw new TRPCError({
            code: "BAD_REQUEST",
            message:
              `Refund amount ${amountKobo}k exceeds refundable balance ` +
              `${remaining}k (original ${original}k, already refunded ${prior}k)`,
          });
        }

        // 3. Persist as pending and emit refund.pending.
        const now = new Date().toISOString();
        const refund = await insertRefund(db, {
          id: `ref_${crypto.randomBytes(12).toString("hex")}`,
          merchant_id: merchantId,
          transaction_ref: tx.reference,
          transaction_id: tx.id,
          amount_kobo: amountKobo,
          currency: tx.currency ?? "NGN",
          status: "pending",
          merchant_note: input.merchantNote ?? null,
          customer_note: input.customerNote ?? null,
          processor: null,
          refunded_by: ctx.user.openId,
          deducted_amount: null,
          fully_deducted: false,
          expected_at: null,
          refunded_at: null,
          retry_account: null,
          created_at: now,
          updated_at: now,
        });
        await emitRefundEvent(merchantId, "pending", refund);

        // 4. Drive the reversal. Fail loud: no rail → needs_attention.
        const outcome = await driveReversal({
          transaction: { reference: tx.reference, channel: tx.channel, metadata: tx.metadata },
          amountKobo,
          currency: refund.currency,
        });

        if (outcome.ok) {
          const processing = await transitionRefundStatus(db, merchantId, refund.id, "processing", {
            processor: outcome.processor,
            expected_at: outcome.expectedAt ?? null as any,
          });
          // Card/Stripe refunds settle asynchronously; the reversal was
          // accepted by the rail, so mark deducted and let the settlement
          // reconciler flip to processed. Fail loud otherwise.
          return { ...processing, reversal: { accepted: true, processor: outcome.processor } };
        }

        const parked = await transitionRefundStatus(db, merchantId, refund.id, "needs_attention", {
          processor: outcome.processor,
        });
        return {
          ...parked,
          reversal: { accepted: false, processor: outcome.processor, reason: outcome.reason },
        };
      },
    });
  }),

  list: protectedProcedure.input(listInput).query(async ({ input, ctx }) => {
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const db = await getDb();
    if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

    const res = await db.execute(sql`
      SELECT * FROM refunds
      WHERE merchant_id = ${merchantId}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${input.from ? sql`AND created_at >= ${input.from}` : sql``}
        ${input.to ? sql`AND created_at <= ${input.to}` : sql``}
        ${input.cursor ? sql`AND id > ${input.cursor}` : sql``}
      ORDER BY id ASC
      LIMIT ${input.limit + 1}
    `);
    const rows = res.rows as unknown as RefundRow[];
    const hasMore = rows.length > input.limit;
    const items = hasMore ? rows.slice(0, input.limit) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1]!.id : null,
    };
  }),

  get: protectedProcedure
    .input(z.object({ id: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const refund = await getRefundForMerchant(db, merchantId, input.id);
      if (!refund) throw new TRPCError({ code: "NOT_FOUND", message: "Refund not found" });
      return refund;
    }),

  retryWithCustomerDetails: protectedProcedure
    .input(
      z.object({
        id: z.string().min(1),
        idempotencyKey: z.string().min(8),
        account: retryAccountSchema,
        customerNote: z.string().max(1000).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "refunds.retryWithCustomerDetails",
        requestBody: input,
        execute: async () => {
          const refund = await getRefundForMerchant(db, merchantId, input.id);
          if (!refund) throw new TRPCError({ code: "NOT_FOUND", message: "Refund not found" });
          // Paystack parity: retry is only legal from needs_attention.
          if (refund.status !== "needs_attention") {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                `Refund '${input.id}' cannot be retried from status '${refund.status}'; ` +
                "only needs_attention refunds accept customer account details.",
            });
          }

          // Reload the transaction so the reversal can use the original rail
          // metadata (e.g. Stripe payment intent id).
          const txRes = await db.execute(sql`
            SELECT id, reference, channel, metadata FROM transactions
            WHERE reference = ${refund.transaction_ref} AND merchant_id = ${merchantId}
            LIMIT 1
          `);
          const tx = txRes.rows[0] as any | undefined;
          const outcome = await driveReversal({
            transaction: {
              reference: refund.transaction_ref,
              channel: tx?.channel ?? null,
              metadata: tx?.metadata ?? null,
            },
            amountKobo: Number(refund.amount_kobo),
            currency: refund.currency,
            retryAccount: input.account,
          });

          const base = {
            processor: outcome.processor,
            retry_account: input.account,
          };
          if (outcome.ok) {
            const processing = await transitionRefundStatus(
              db, merchantId, refund.id, "processing",
              { ...base, expected_at: outcome.expectedAt ?? null as any },
            );
            return { ...processing, reversal: { accepted: true, processor: outcome.processor } };
          }
          // Stay needs_attention with the explicit reason — never fake success.
          const res = await db.execute(sql`
            UPDATE refunds SET
              retry_account = ${JSON.stringify(input.account)},
              processor = ${outcome.processor},
              updated_at = ${new Date().toISOString()}
            WHERE id = ${refund.id} AND merchant_id = ${merchantId}
            RETURNING *
          `);
          return {
            ...(res.rows[0] as unknown as RefundRow),
            reversal: { accepted: false, processor: outcome.processor, reason: outcome.reason },
          };
        },
      });
    }),

  stats: protectedProcedure
    .input(
      z.object({
        from: z.string().datetime().optional(),
        to: z.string().datetime().optional(),
      }),
    )
    .query(async ({ input, ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
      const res = await db.execute(sql`
        SELECT status,
               COUNT(*)::int AS count,
               COALESCE(SUM(amount_kobo), 0)::bigint AS total_kobo
        FROM refunds
        WHERE merchant_id = ${merchantId}
          ${input.from ? sql`AND created_at >= ${input.from}` : sql``}
          ${input.to ? sql`AND created_at <= ${input.to}` : sql``}
        GROUP BY status
      `);
      const byStatus = Object.fromEntries(
        (res.rows as any[]).map((r) => [
          String(r.status),
          { count: Number(r.count), totalKobo: Number(r.total_kobo) },
        ]),
      );
      const totalCount = Object.values(byStatus).reduce((a, b: any) => a + b.count, 0);
      const totalKobo = Object.values(byStatus).reduce((a, b: any) => a + b.totalKobo, 0);
      return { byStatus, totalCount, totalKobo };
    }),
});

export type RefundsRouter = typeof refundsRouter;
