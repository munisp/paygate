/**
 * paymentRequests.ts — Paystack /paymentrequest parity (merchant invoicing).
 *
 * Procedures:
 *   create, list, get, verify, notify, totals, finalize, update, archive,
 *   recordOfflinePayment.
 *
 * Storage: payment_requests + payment_request_sequences (drizzle/0097), accessed
 * via raw SQL (these tables are intentionally not added to drizzle/schema.ts in
 * this wave — the migration file is the source of truth). Existing tables
 * (transactions) are read via the same raw-SQL path for consistency.
 *
 * Conventions: money is bigint kobo; fail loud; merchant scope resolved from
 * the session (resolveMerchantId, crud119 pattern); withIdempotency on
 * create / financial mutations; webhook events via dispatchWebhookEvent with
 * the constants below; notification delivery via the Novu bridge
 * (alertSubscriptions.ts pattern).
 */
import { z } from "zod";
import { randomUUID, createHash, timingSafeEqual } from "crypto";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { protectedProcedure, router } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent } from "../webhookEvents";
import { ENV } from "../_core/env";
import { logger } from "../logger";

// ─── webhook event constants ─────────────────────────────────────────────────
export const PAYMENTREQUEST_PENDING = "paymentrequest.pending";
export const PAYMENTREQUEST_SUCCESS = "paymentrequest.success";
export const TRANSFER_RECIPIENT_CREATED = "transfer.recipient.created";
export const TRANSFER_OTP_REQUIRED = "transfer.otp.required";

// ─── shared helpers ──────────────────────────────────────────────────────────

/** Resolve the caller's merchant from the session (crud119 pattern). */
export async function resolveMerchantId(openId: string): Promise<string> {
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

/** Normalize a drizzle execute() result into a plain row array. */
export function rowsOf(res: unknown): any[] {
  const r: any = res;
  return (r?.rows ?? r ?? []) as any[];
}

/**
 * Deliver a notification via the Novu trigger bridge (alertSubscriptions.ts
 * pattern). Returns true when the trigger was accepted. When the Novu rail is
 * not configured, returns false so callers can surface notified=false
 * (fail-loud behavior is the caller's choice).
 */
export async function triggerNotification(input: {
  subscriberId: string;
  workflowId: string;
  payload: Record<string, unknown>;
}): Promise<boolean> {
  if (!ENV.novuApiKey) {
    logger.warn(`[notify] NOVU_API_KEY not configured — cannot deliver '${input.workflowId}'`);
    return false;
  }
  const base = (ENV.novuApiUrl || "http://novu-api:3000").replace(/\/$/, "");
  try {
    const resp = await fetch(`${base}/v1/events/trigger`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `ApiKey ${ENV.novuApiKey}` },
      body: JSON.stringify({
        name: input.workflowId,
        to: { subscriberId: input.subscriberId },
        payload: input.payload,
      }),
      signal: AbortSignal.timeout(10_000),
    });
    return resp.ok;
  } catch (err) {
    logger.warn(`[notify] Novu trigger '${input.workflowId}' failed: ${err instanceof Error ? err.message : String(err)}`);
    return false;
  }
}

/** Fire-and-log webhook dispatch (never let webhook delivery mask the mutation result). */
export async function emitEvent(event: string, merchantId: string, data: Record<string, unknown>) {
  try {
    await dispatchWebhookEvent({
      event: event as never,
      id: randomUUID(),
      tenantId: "ten_default",
      merchantId,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err) {
    logger.warn(`[webhook] dispatch '${event}' failed: ${err instanceof Error ? err.message : String(err)}`);
  }
}

/** Constant-time comparison of two strings (via SHA-256 so lengths equalize). */
export function safeEqual(a: string, b: string): boolean {
  const ha = createHash("sha256").update(a).digest();
  const hb = createHash("sha256").update(b).digest();
  return timingSafeEqual(ha, hb);
}

export function hashOtp(code: string): string {
  return createHash("sha256").update(code).digest("hex");
}

// ─── payment request domain helpers ─────────────────────────────────────────

const lineItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().positive(), // kobo
  quantity: z.number().int().positive().default(1),
});
const taxItemSchema = z.object({
  name: z.string().min(1),
  amount: z.number().int().nonnegative(), // kobo
});

/** Compute the total (kobo) from line items + tax, as bigint-safe integers. */
export function computeTotal(
  lineItems: Array<{ name: string; amount: number; quantity: number }>,
  tax: Array<{ name: string; amount: number }>,
): number {
  const itemsTotal = lineItems.reduce((acc, li) => acc + li.amount * li.quantity, 0);
  const taxTotal = tax.reduce((acc, t) => acc + t.amount, 0);
  return itemsTotal + taxTotal;
}

const REQUEST_CODE_PREFIX = "PRQ_";
const OFFLINE_REF_PREFIX = "OFR_";

function newRequestCode(): string {
  return REQUEST_CODE_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}
function newOfflineReference(): string {
  return OFFLINE_REF_PREFIX + randomUUID().replace(/-/g, "").slice(0, 16).toUpperCase();
}

/**
 * Allocate the next invoice number for a merchant. If `override` is supplied
 * it is used and the sequence continues from override+1; otherwise the
 * sequence value is used and incremented (INSERT ... ON CONFLICT upsert).
 */
export async function nextInvoiceNumber(db: any, merchantId: string, override?: number): Promise<number> {
  if (override !== undefined) {
    const res = await db.execute(sql`
      INSERT INTO payment_request_sequences (merchant_id, next_invoice_number)
      VALUES (${merchantId}, ${override + 1})
      ON CONFLICT (merchant_id)
      DO UPDATE SET next_invoice_number = GREATEST(payment_request_sequences.next_invoice_number, ${override + 1})
      RETURNING next_invoice_number
    `);
    void res;
    return override;
  }
  const res = await db.execute(sql`
    INSERT INTO payment_request_sequences (merchant_id, next_invoice_number)
    VALUES (${merchantId}, 2)
    ON CONFLICT (merchant_id)
    DO UPDATE SET next_invoice_number = payment_request_sequences.next_invoice_number + 1
    RETURNING next_invoice_number
  `);
  const rows = rowsOf(res);
  // On first insert the returned next_invoice_number is 2 → allocated number is 1.
  const next = Number(rows[0]?.next_invoice_number ?? 2);
  return next - 1;
}

async function getRequestForMerchant(db: any, merchantId: string, id: string) {
  const res = await db.execute(sql`
    SELECT * FROM payment_requests WHERE id = ${id} AND merchant_id = ${merchantId} LIMIT 1
  `);
  const row = rowsOf(res)[0];
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment request not found" });
  return row;
}

/** Send (or attempt) a payment-request notification; returns notified flag. */
async function sendRequestNotification(merchantId: string, req: { id: string; request_code: string; amount_kobo: unknown; customer_id: string }): Promise<boolean> {
  return triggerNotification({
    subscriberId: merchantId,
    workflowId: "payment_request.notification",
    payload: {
      paymentRequestId: req.id,
      requestCode: req.request_code,
      amountKobo: String(req.amount_kobo),
      customerId: req.customer_id,
    },
  });
}

// ─── input schemas ───────────────────────────────────────────────────────────

const createInput = z.object({
  customer: z.string().min(1), // customer id
  description: z.string().max(2000).optional(),
  amount: z.number().int().positive().optional(), // kobo; required when no line items
  line_items: z.array(lineItemSchema).optional(),
  tax: z.array(taxItemSchema).optional(),
  currency: z.string().length(3).default("NGN"),
  due_date: z.string().datetime().optional(),
  invoice_number: z.number().int().positive().optional(),
  send_notification: z.boolean().default(true),
  draft: z.boolean().default(false),
  split_code: z.string().optional(),
  idempotencyKey: z.string().min(8).max(128),
});

const listInput = z.object({
  customer: z.string().optional(),
  status: z.enum(["draft", "pending", "success", "archived"]).optional(),
  include_archive: z.boolean().default(false),
  from: z.string().datetime().optional(),
  to: z.string().datetime().optional(),
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

// ─── router ──────────────────────────────────────────────────────────────────

export const paymentRequestsRouter = router({
  create: protectedProcedure.input(createInput).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);

    const hasAmount = input.amount !== undefined;
    const hasItems = !!input.line_items && input.line_items.length > 0;
    if (hasAmount === hasItems) {
      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Provide exactly one of `amount` or `line_items`",
      });
    }

    return withIdempotency({
      key: input.idempotencyKey,
      merchantId,
      operation: "paymentRequests.create",
      requestBody: input,
      execute: async () => {
        const total = hasItems
          ? computeTotal(input.line_items!, input.tax ?? [])
          : input.amount!;
        const invoiceNumber = await nextInvoiceNumber(db, merchantId, input.invoice_number);
        const id = randomUUID();
        const requestCode = newRequestCode();
        const offlineReference = newOfflineReference();
        const isDraft = input.draft;
        const status = isDraft ? "draft" : "pending";

        const ins = await db.execute(sql`
          INSERT INTO payment_requests (
            id, merchant_id, customer_id, request_code, offline_reference,
            invoice_number, description, amount_kobo, line_items, tax,
            currency, due_date, status, pending_amount_kobo, split_code,
            created_at, updated_at
          ) VALUES (
            ${id}, ${merchantId}, ${input.customer}, ${requestCode}, ${offlineReference},
            ${invoiceNumber}, ${input.description ?? null}, ${total},
            ${input.line_items ? JSON.stringify(input.line_items) : null}::jsonb,
            ${input.tax ? JSON.stringify(input.tax) : null}::jsonb,
            ${input.currency}, ${input.due_date ?? null}, ${status}, ${total},
            ${input.split_code ?? null}, now(), now()
          )
          RETURNING *
        `);
        const row = rowsOf(ins)[0];

        // Drafts never notify. Non-draft with send_notification=true → notify.
        let notified = false;
        if (!isDraft && input.send_notification) {
          notified = await sendRequestNotification(merchantId, row);
          if (notified) {
            await db.execute(sql`
              UPDATE payment_requests
              SET last_notified_at = now(), notification_count = notification_count + 1, updated_at = now()
              WHERE id = ${row.id}
            `);
          }
          // Explicitly requested notification with an unreachable rail → fail loud.
          if (!notified && input.send_notification && !ENV.novuApiKey) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: "Notification rail is not configured (NOVU_API_KEY missing) — request created pending but notification could not be sent",
            });
          }
          if (notified) {
            await emitEvent(PAYMENTREQUEST_PENDING, merchantId, {
              paymentRequestId: row.id,
              requestCode: row.request_code,
              amountKobo: String(row.amount_kobo),
              customerId: row.customer_id,
            });
          }
        }
        return { ...row, notified };
      },
    });
  }),

  list: protectedProcedure.input(listInput).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const offset = (input.page - 1) * input.limit;
    const conditions = [sql`merchant_id = ${merchantId}`];
    if (!input.include_archive) conditions.push(sql`status <> 'archived'`);
    if (input.customer) conditions.push(sql`customer_id = ${input.customer}`);
    if (input.status) conditions.push(sql`status = ${input.status}`);
    if (input.from) conditions.push(sql`created_at >= ${input.from}`);
    if (input.to) conditions.push(sql`created_at <= ${input.to}`);
    const where = sql.join(conditions, sql` AND `);
    const res = await db.execute(sql`
      SELECT * FROM payment_requests WHERE ${where}
      ORDER BY created_at DESC LIMIT ${input.limit} OFFSET ${offset}
    `);
    return rowsOf(res);
  }),

  get: protectedProcedure.input(z.object({ id: z.string().min(1) })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRequestForMerchant(db, merchantId, input.id);
    const txRes = await db.execute(sql`
      SELECT id, reference, amount, status, channel, created_at
      FROM transactions
      WHERE merchant_id = ${merchantId}
        AND (reference = ${row.offline_reference} OR reference = ${row.request_code})
      ORDER BY created_at DESC
    `);
    return {
      ...row,
      transactions: rowsOf(txRes),
      amount_paid: row.amount_paid_kobo,
      pending_amount: row.pending_amount_kobo,
    };
  }),

  verify: protectedProcedure.input(z.object({ code: z.string().min(1) })).query(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const res = await db.execute(sql`
      SELECT * FROM payment_requests
      WHERE request_code = ${input.code} AND merchant_id = ${merchantId} AND status <> 'archived'
      LIMIT 1
    `);
    const row = rowsOf(res)[0];
    if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Payment request not found" });
    return { ...row, verified: true };
  }),

  notify: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRequestForMerchant(db, merchantId, input.id);
    if (row.status === "draft" || row.status === "archived") {
      throw new TRPCError({ code: "BAD_REQUEST", message: `Cannot notify a ${row.status} payment request` });
    }
    const notified = await sendRequestNotification(merchantId, row);
    if (!notified) {
      throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Notification delivery failed — rail unreachable or unconfigured" });
    }
    const upd = await db.execute(sql`
      UPDATE payment_requests
      SET last_notified_at = now(), notification_count = notification_count + 1, updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `);
    return { ...rowsOf(upd)[0], notified };
  }),

  totals: protectedProcedure.query(async ({ ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const res = await db.execute(sql`
      SELECT currency,
        COALESCE(SUM(amount_kobo) FILTER (WHERE status = 'pending'), 0) AS pending,
        COALESCE(SUM(amount_paid_kobo) FILTER (WHERE status = 'success' OR paid = true), 0) AS successful,
        COALESCE(SUM(amount_kobo) FILTER (WHERE status <> 'archived'), 0) AS total
      FROM payment_requests
      WHERE merchant_id = ${merchantId}
      GROUP BY currency
    `);
    return rowsOf(res);
  }),

  finalize: protectedProcedure.input(z.object({
    id: z.string().min(1),
    send_notification: z.boolean().default(true),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRequestForMerchant(db, merchantId, input.id);
    if (row.status !== "draft") {
      throw new TRPCError({ code: "CONFLICT", message: `Only draft payment requests can be finalized (current: ${row.status})` });
    }
    const upd = await db.execute(sql`
      UPDATE payment_requests SET status = 'pending', updated_at = now()
      WHERE id = ${row.id} AND status = 'draft'
      RETURNING *
    `);
    const updated = rowsOf(upd)[0];
    if (!updated) throw new TRPCError({ code: "CONFLICT", message: "Payment request status changed concurrently" });
    let notified = false;
    if (input.send_notification) {
      notified = await sendRequestNotification(merchantId, updated);
      if (notified) {
        await db.execute(sql`
          UPDATE payment_requests
          SET last_notified_at = now(), notification_count = notification_count + 1, updated_at = now()
          WHERE id = ${updated.id}
        `);
        await emitEvent(PAYMENTREQUEST_PENDING, merchantId, {
          paymentRequestId: updated.id,
          requestCode: updated.request_code,
          amountKobo: String(updated.amount_kobo),
          customerId: updated.customer_id,
        });
      }
    }
    return { ...updated, notified };
  }),

  update: protectedProcedure.input(z.object({
    id: z.string().min(1),
    description: z.string().max(2000).optional(),
    amount: z.number().int().positive().optional(),
    line_items: z.array(lineItemSchema).optional(),
    tax: z.array(taxItemSchema).optional(),
    due_date: z.string().datetime().optional(),
    currency: z.string().length(3).optional(),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRequestForMerchant(db, merchantId, input.id);
    const editable = row.status === "draft" || (row.status === "pending" && !row.paid && Number(row.amount_paid_kobo) === 0);
    if (!editable) {
      throw new TRPCError({ code: "CONFLICT", message: `Payment request in status '${row.status}' cannot be updated` });
    }
    const items = input.line_items ?? (row.line_items ? JSON.parse(typeof row.line_items === "string" ? row.line_items : JSON.stringify(row.line_items)) : null);
    const tax = input.tax ?? (row.tax ? JSON.parse(typeof row.tax === "string" ? row.tax : JSON.stringify(row.tax)) : null);
    let newAmount = input.amount ?? Number(row.amount_kobo);
    if (input.line_items) newAmount = computeTotal(input.line_items, tax ?? []);
    const upd = await db.execute(sql`
      UPDATE payment_requests SET
        description = COALESCE(${input.description ?? null}, description),
        amount_kobo = ${newAmount},
        pending_amount_kobo = ${newAmount} - amount_paid_kobo,
        line_items = ${items ? JSON.stringify(items) : null}::jsonb,
        tax = ${tax ? JSON.stringify(tax) : null}::jsonb,
        due_date = COALESCE(${input.due_date ?? null}, due_date),
        currency = COALESCE(${input.currency ?? null}, currency),
        updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  archive: protectedProcedure.input(z.object({ id: z.string().min(1) })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    const row = await getRequestForMerchant(db, merchantId, input.id);
    if (row.status === "archived") return row;
    const upd = await db.execute(sql`
      UPDATE payment_requests SET status = 'archived', updated_at = now()
      WHERE id = ${row.id}
      RETURNING *
    `);
    return rowsOf(upd)[0];
  }),

  recordOfflinePayment: protectedProcedure.input(z.object({
    offline_reference: z.string().min(1),
    amount: z.number().int().positive(), // kobo
    paid_at: z.string().datetime().optional(),
    idempotencyKey: z.string().min(8).max(128),
  })).mutation(async ({ input, ctx }) => {
    const db = await requireDb();
    const merchantId = await resolveMerchantId(ctx.user.openId);
    return withIdempotency({
      key: input.idempotencyKey,
      merchantId,
      operation: "paymentRequests.recordOfflinePayment",
      requestBody: input,
      execute: async () => {
        const found = await db.execute(sql`
          SELECT * FROM payment_requests
          WHERE offline_reference = ${input.offline_reference} AND merchant_id = ${merchantId}
          LIMIT 1
        `);
        const row = rowsOf(found)[0];
        if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "No payment request matches this offline reference" });
        if (row.status === "archived") throw new TRPCError({ code: "CONFLICT", message: "Cannot pay an archived payment request" });
        if (row.status === "draft") throw new TRPCError({ code: "CONFLICT", message: "Cannot pay a draft payment request" });

        const alreadyPaid = BigInt(row.amount_paid_kobo);
        const total = BigInt(row.amount_kobo);
        const incoming = BigInt(input.amount);
        const newPaid = alreadyPaid + incoming;
        if (newPaid > total) {
          throw new TRPCError({ code: "BAD_REQUEST", message: `Payment of ${input.amount} kobo exceeds pending amount ${total - alreadyPaid} kobo` });
        }
        const full = newPaid === total;
        const upd = await db.execute(sql`
          UPDATE payment_requests SET
            amount_paid_kobo = amount_paid_kobo + ${input.amount},
            pending_amount_kobo = amount_kobo - (amount_paid_kobo + ${input.amount}),
            paid = ${full},
            paid_at = ${full ? (input.paid_at ?? new Date().toISOString()) : null},
            status = ${full ? "success" : "pending"},
            updated_at = now()
          WHERE id = ${row.id}
          RETURNING *
        `);
        const updated = rowsOf(upd)[0];
        if (full) {
          await emitEvent(PAYMENTREQUEST_SUCCESS, merchantId, {
            paymentRequestId: updated.id,
            requestCode: updated.request_code,
            amountKobo: String(updated.amount_kobo),
            amountPaidKobo: String(updated.amount_paid_kobo),
            offlineReference: updated.offline_reference,
          });
        }
        return updated;
      },
    });
  }),
});
