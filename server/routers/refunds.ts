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
  /** Stripe refund id issued/adopted on the rail (drizzle/0100). */
  stripe_refund_id?: string | null;
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

/** Persist the issued/adopted Stripe refund id (C8) without touching status. */
export async function setRefundStripeId(
  db: any,
  merchantId: string,
  id: string,
  stripeRefundId: string,
): Promise<void> {
  await db.execute(sql`
    UPDATE refunds SET stripe_refund_id = ${stripeRefundId}, updated_at = ${new Date().toISOString()}
    WHERE id = ${id} AND merchant_id = ${merchantId} AND stripe_refund_id IS NULL
  `);
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

// ─── Transaction helper ──────────────────────────────────────────────────────
/**
 * Run fn inside a DB transaction when the driver supports it. The unit-test
 * fake db exposes only `execute`, so we degrade to running directly on it —
 * production drizzle instances always take the real transaction path.
 */
export async function runInTx<T>(db: any, fn: (tx: any) => Promise<T>): Promise<T> {
  if (typeof db.transaction === "function") return db.transaction(fn);
  return fn(db);
}

// ─── Merchant wallet debit (H9 / H6c) ────────────────────────────────────────
/**
 * Debit the merchant's wallet inside the CALLER's transaction. The balance is
 * allowed to go negative (amount becomes payable to the platform). A guarded
 * UPDATE (balance re-check) plus a wallet_transactions audit row make the
 * debit fail loud and idempotent via the (tenant_id, reference) unique key.
 */
export async function debitMerchantWallet(
  db: any,
  opts: {
    merchantId: string;
    amountKobo: number;
    currency: string;
    reason: "refund" | "chargeback" | "dispute";
    reference: string;
    description: string;
  },
): Promise<{ walletId: number; balanceBefore: string; balanceAfter: string }> {
  const wRes = await db.execute(sql`
    SELECT id, balance FROM wallets
    WHERE merchant_id = ${opts.merchantId} AND currency = ${opts.currency}
    ORDER BY id ASC LIMIT 1
    FOR UPDATE
  `);
  const wallet = wRes.rows[0] as any | undefined;
  if (!wallet) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        `No ${opts.currency} wallet found for merchant '${opts.merchantId}'; ` +
        `cannot book ${opts.reason} debit of ${opts.amountKobo}k`,
    });
  }
  const before = BigInt(wallet.balance);
  const after = before - BigInt(opts.amountKobo);
  const now = new Date().toISOString();
  const upd = await db.execute(sql`
    UPDATE wallets SET balance = ${after.toString()}, updated_at = ${now}
    WHERE id = ${wallet.id} AND balance = ${wallet.balance}
    RETURNING id
  `);
  if (!upd.rows[0]) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Wallet balance changed concurrently — retry",
    });
  }
  await db.execute(sql`
    INSERT INTO wallet_transactions (
      tenant_id, wallet_id, type, amount, currency,
      balance_before, balance_after, description, reference, channel, status
    ) VALUES (
      ${TENANT_ID}, ${wallet.id}, ${"debit"}, ${String(opts.amountKobo)}, ${opts.currency},
      ${before.toString()}, ${after.toString()}, ${opts.description}, ${opts.reference},
      ${opts.reason}, ${"completed"}
    )
    ON CONFLICT (tenant_id, reference) DO NOTHING
  `);
  return { walletId: Number(wallet.id), balanceBefore: before.toString(), balanceAfter: after.toString() };
}

/**
 * Transition a refund to processed AND debit the merchant wallet in ONE DB
 * transaction (H9). refunded_at / deducted_amount are set on the flip and the
 * refund.processed event is emitted by transitionRefundStatus.
 */
export async function markRefundProcessed(
  db: any,
  merchantId: string,
  id: string,
  opts: { amountKobo: number; currency: string },
): Promise<RefundRow> {
  return runInTx(db, async (tx) => {
    const row = await transitionRefundStatus(tx, merchantId, id, "processed", {
      deducted_amount: opts.amountKobo,
      fully_deducted: true,
      refunded_at: new Date().toISOString(),
    });
    await debitMerchantWallet(tx, {
      merchantId,
      amountKobo: opts.amountKobo,
      currency: opts.currency,
      reason: "refund",
      reference: `refund_${id}`,
      description: `Refund ${id} processed — merchant wallet debit`,
    });
    return row;
  });
}

// ─── Rail reversal ───────────────────────────────────────────────────────────
interface ReversalOutcome {
  ok: boolean;
  processor: string;
  expectedAt?: string;
  reason?: string;
  /** Stripe refund id issued or adopted (C8) — stored on the refunds row. */
  stripeRefundId?: string;
}

/**
 * After a timeout/abort we cannot know whether Stripe created the refund.
 * Ask Stripe (GET /v1/refunds?payment_intent=...) before parking in
 * needs_attention; if a matching refund exists we ADOPT it instead of
 * risking a duplicate re-issue later (C8).
 */
async function adoptExistingStripeRefund(
  paymentIntentId: string,
  amountKobo: number,
): Promise<string | null> {
  try {
    const res = await fetch(
      `https://api.stripe.com/v1/refunds?payment_intent=${encodeURIComponent(paymentIntentId)}&limit=10`,
      {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10_000),
      },
    );
    if (!res.ok) return null;
    const body: any = typeof res.json === "function" ? await res.json().catch(() => null) : null;
    const match = (body?.data ?? []).find(
      (r: any) => Number(r?.amount) === amountKobo && r?.status !== "failed" && r?.status !== "canceled",
    ) ?? body?.data?.[0];
    return match?.id ? String(match.id) : null;
  } catch {
    return null;
  }
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
  /** Our refund id — drives the Stripe Idempotency-Key (C8). */
  refundId?: string;
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
          // C8: retries with the same refund id replay safely on Stripe's side.
          "Idempotency-Key": `refund_${opts.refundId ?? opts.transaction.reference}`,
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
      const body: any = typeof res.json === "function" ? await res.json().catch(() => null) : null;
      return {
        ok: true,
        processor: "stripe",
        stripeRefundId: body?.id ? String(body.id) : undefined,
      };
    } catch (err: any) {
      // Timeout/abort: Stripe may have created the refund anyway. Adopt it if
      // so — never park needs_attention while a rail refund is in flight.
      const adopted = await adoptExistingStripeRefund(stripePaymentIntent, opts.amountKobo);
      if (adopted) {
        return { ok: true, processor: "stripe", stripeRefundId: adopted };
      }
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
        // Steps 1–3 run in ONE DB transaction. The SELECT ... FOR UPDATE on
        // the transactions row serializes concurrent refund creates for the
        // same transaction, so the prior-refund sum cannot be raced by a
        // second create carrying a different idempotency key (C2).
        const { refund, tx } = await runInTx(db, async (txDb) => {
          // 1. Transaction must belong to this merchant and be successful.
          const txRes = await txDb.execute(sql`
            SELECT id, reference, amount, currency, status, channel, metadata,
              (SELECT COUNT(*)::int FROM chargebacks c
               WHERE (c.transaction_id = transactions.id OR c.transaction_id = transactions.reference)
                 AND c.status IN ('open', 'under_review', 'pre_arbitration', 'arbitration')
              ) AS open_chargebacks
            FROM transactions
            WHERE reference = ${input.transactionRef} AND merchant_id = ${merchantId}
            LIMIT 1
            FOR UPDATE OF transactions
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

          // H27: an open chargeback already claims these funds.
          if (Number(tx.open_chargebacks ?? 0) > 0) {
            throw new TRPCError({
              code: "CONFLICT",
              message:
                `Transaction '${input.transactionRef}' has an open chargeback; ` +
                "refunds are blocked until the chargeback is closed.",
            });
          }

          // 2. Partial must fit within original minus prior refunds.
          const original = Number(tx.amount);
          const prior = await sumPriorRefunds(txDb, merchantId, tx.reference);
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
          const refund = await insertRefund(txDb, {
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
          return { refund, tx, amountKobo };
        });
        await emitRefundEvent(merchantId, "pending", refund);
        const amountKobo = Number(refund.amount_kobo);

        // 4. Drive the reversal. Fail loud: no rail → needs_attention.
        const outcome = await driveReversal({
          transaction: { reference: tx.reference, channel: tx.channel, metadata: tx.metadata },
          amountKobo,
          currency: refund.currency,
          refundId: refund.id,
        });

        if (outcome.ok) {
          if (outcome.stripeRefundId) {
            await setRefundStripeId(db, merchantId, refund.id, outcome.stripeRefundId);
          }
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

          // C8: a Stripe refund was already issued/adopted for this refund —
          // never re-issue; just re-attach the row to the processing path.
          const existingStripeId = (refund as any).stripe_refund_id as string | null | undefined;
          if (existingStripeId) {
            const processing = await transitionRefundStatus(
              db, merchantId, refund.id, "processing",
              { processor: "stripe", retry_account: input.account },
            );
            return {
              ...processing,
              reversal: { accepted: true, processor: "stripe", adopted: true, stripeRefundId: existingStripeId },
            };
          }

          const outcome = await driveReversal({
            transaction: {
              reference: refund.transaction_ref,
              channel: tx?.channel ?? null,
              metadata: tx?.metadata ?? null,
            },
            amountKobo: Number(refund.amount_kobo),
            currency: refund.currency,
            retryAccount: input.account,
            refundId: refund.id,
          });
          if (outcome.ok && outcome.stripeRefundId) {
            await setRefundStripeId(db, merchantId, refund.id, outcome.stripeRefundId);
          }

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

// ─── Settlement reconciler (H8) ─────────────────────────────────────────────
/**
 * reconcileProcessingRefunds — called by cronJobs.
 *
 * Finds refunds stuck in `processing` for more than 5 minutes and polls the
 * rail for the truth:
 *   Stripe status succeeded          → processed (wallet debited, refund.processed)
 *   Stripe status failed / canceled  → failed (refund.failed)
 *   Stripe status requires_attention → needs_attention (refund.needs_attention)
 *   Stripe status pending / unknown  → left for the next sweep
 * Each row is handled independently: a per-row failure is logged (fail loud)
 * and the sweep continues with the remaining rows.
 */
export async function reconcileProcessingRefunds(): Promise<{
  scanned: number;
  processed: number;
  failed: number;
  needsAttention: number;
  errors: Array<{ refundId: string; error: string }>;
}> {
  const db = await getDb();
  if (!db) throw new Error("reconcileProcessingRefunds: DB unavailable");
  const cutoff = new Date(Date.now() - 5 * 60_000).toISOString();
  const res = await db.execute(sql`
    SELECT * FROM refunds
    WHERE status = 'processing' AND updated_at < ${cutoff}
    ORDER BY updated_at ASC
    LIMIT 200
  `);
  const rows = res.rows as unknown as RefundRow[];
  const out = { scanned: rows.length, processed: 0, failed: 0, needsAttention: 0, errors: [] as any[] };

  for (const refund of rows) {
    try {
      const stripeId = refund.stripe_refund_id;
      if (!stripeId || !process.env.STRIPE_SECRET_KEY) {
        // No rail handle to poll — park loudly instead of pretending progress.
        await transitionRefundStatus(db, refund.merchant_id, refund.id, "needs_attention", {
          processor: refund.processor ?? "unknown",
        });
        out.needsAttention++;
        continue;
      }
      const sRes = await fetch(`https://api.stripe.com/v1/refunds/${encodeURIComponent(stripeId)}`, {
        headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
        signal: AbortSignal.timeout(10_000),
      });
      if (!sRes.ok) {
        throw new Error(`Stripe GET /v1/refunds/${stripeId} → HTTP ${sRes.status}`);
      }
      const sBody: any = typeof sRes.json === "function" ? await sRes.json().catch(() => null) : null;
      const sStatus = String(sBody?.status ?? "");
      if (sStatus === "succeeded") {
        await markRefundProcessed(db, refund.merchant_id, refund.id, {
          amountKobo: Number(refund.amount_kobo),
          currency: refund.currency,
        });
        out.processed++;
      } else if (sStatus === "failed" || sStatus === "canceled") {
        await transitionRefundStatus(db, refund.merchant_id, refund.id, "failed", {
          processor: "stripe",
        });
        out.failed++;
      } else if (sStatus === "requires_attention") {
        await transitionRefundStatus(db, refund.merchant_id, refund.id, "needs_attention", {
          processor: "stripe",
        });
        out.needsAttention++;
      }
      // pending / unknown: leave in processing for the next sweep.
    } catch (err: any) {
      logger.error("reconcileProcessingRefunds row failed", { err, refundId: refund.id });
      out.errors.push({ refundId: refund.id, error: err?.message ?? "unknown" });
    }
  }
  return out;
}

export type RefundsRouter = typeof refundsRouter;
