/**
 * publicRest.ts — Paystack-parity public REST v1 API (Express, tRPC-free).
 *
 * Mounted at /api/v1 in server/_core/index.ts.
 *
 * Conventions:
 *  - Envelope: { status: boolean, message: string, data: any }.
 *  - Money: integer kobo (bigint in the schema, number at the wire).
 *  - Auth: Authorization: Bearer sk_live_... / sk_test_... (publicRestAuth).
 *  - Idempotency: `Idempotency-Key` header on every POST reuses the existing
 *    idempotency_requests store via withIdempotency (claim-then-execute,
 *    cached replay, 409 on conflict). Merchant-supplied `reference` is a
 *    second, reference-based idempotency key for transaction/initialize.
 *  - Fail loud: when a payment rail (Stripe, NIP bridge) is unavailable the
 *    endpoint answers 503/BAD_GATEWAY — never a fabricated success.
 *
 * Outbound events reuse the existing dispatcher in server/webhookEvents.ts.
 * Event-type constants for this API are appended HERE (webhookEvents.ts is
 * owned by another workstream and is not edited); they reuse the catalogued
 * core event names, so no registration is required.
 */
import { randomBytes } from "node:crypto";
import { Router, type Request, type Response } from "express";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, gte, lte, sql } from "drizzle-orm";
import { getDb } from "../db";
import {
  transactions,
  hostedPaymentSessions,
  webhookDeliveries,
  merchants,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent, buildWebhookPayload } from "../webhookEvents";
import { expressRateLimit } from "../rateLimit";
import { publicRestAuth, type RestAuth } from "./publicRestAuth";
import { cardAuthorizations, recordAuthorizationFromCharge } from "./cardTokenization";

// ─── Webhook event catalog extension (own module; dispatcher untouched) ──────
export const PUBLIC_REST_EVENTS = {
  CHARGE_SUCCESS: "payment.completed",
  CHARGE_FAILED: "payment.failed",
  TRANSACTION_CREATED: "transaction.created",
  TRANSACTION_UPDATED: "transaction.updated",
} as const;

// ─── Envelope helpers ─────────────────────────────────────────────────────────

function ok(res: Response, data: unknown, message = "OK", httpStatus = 200) {
  return res.status(httpStatus).json({ status: true, message, data });
}

function fail(res: Response, httpStatus: number, message: string) {
  return res.status(httpStatus).json({ status: false, message, data: null });
}

/** Map a TRPCError (from withIdempotency etc.) onto the REST envelope. */
function failFromTrpc(res: Response, err: TRPCError) {
  const map: Record<string, number> = {
    BAD_REQUEST: 400, UNAUTHORIZED: 401, FORBIDDEN: 403, NOT_FOUND: 404,
    CONFLICT: 409, UNPROCESSABLE_CONTENT: 422, TOO_MANY_REQUESTS: 429,
    PRECONDITION_FAILED: 412, SERVICE_UNAVAILABLE: 503,
    INTERNAL_SERVER_ERROR: 500,
  };
  return fail(res, map[err.code] ?? 500, err.message);
}

async function requireDb(res: Response) {
  try {
    const db = await getDb();
    if (!db) {
      fail(res, 503, "Service unavailable: database not reachable");
      return null;
    }
    return db;
  } catch (err) {
    fail(res, 503, `Service unavailable: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}

function generateReference(): string {
  return `PG_${Date.now()}_${randomBytes(6).toString("hex").toUpperCase()}`;
}

function generateAccessCode(): string {
  return `ac_${randomBytes(16).toString("hex")}`;
}

// ─── REST idempotency adapter (Idempotency-Key header) ───────────────────────

/**
 * Wrap a POST handler with the existing withIdempotency claim-then-execute
 * semantics. Only active when the client sends an `Idempotency-Key` header.
 */
async function withRestIdempotency<T>(
  req: Request,
  auth: RestAuth,
  operation: string,
  execute: () => Promise<T>,
): Promise<T> {
  const key = req.header("Idempotency-Key") ?? req.header("idempotency-key");
  if (!key) return execute();
  return withIdempotency({
    key: `rest:${auth.merchantId}:${key}`,
    merchantId: auth.merchantId,
    operation,
    requestBody: req.body ?? {},
    execute,
  });
}

// ─── Shared async handler wrapper ────────────────────────────────────────────

type Handler = (req: Request, res: Response) => Promise<unknown>;
const h = (fn: Handler) => (req: Request, res: Response) => {
  fn(req, res).catch((err) => {
    if (err instanceof TRPCError) return failFromTrpc(res, err);
    return fail(res, 500, err instanceof Error ? err.message : String(err));
  });
};

// ─── Rail clients (fail loud) ────────────────────────────────────────────────

async function stripeRequest(path: string, body: URLSearchParams): Promise<any> {
  const key = process.env.STRIPE_SECRET_KEY;
  if (!key) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Card rail is unavailable (STRIPE_SECRET_KEY not configured)",
    });
  }
  let res: globalThis.Response;
  try {
    res = await fetch(`https://api.stripe.com/v1${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${key}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: body.toString(),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Card rail unreachable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TRPCError({
      code: res.status >= 500 ? "SERVICE_UNAVAILABLE" : "BAD_REQUEST",
      message: `Card rail error (HTTP ${res.status}): ${(json as any)?.error?.message ?? res.statusText}`,
    });
  }
  return json;
}

async function bridgeRequest(path: string, body: Record<string, unknown>): Promise<any> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Payment rail unavailable (middleware bridge not configured)",
    });
  }
  let res: globalThis.Response;
  try {
    res = await fetch(`${url}${path}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
  } catch (err) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Payment rail unreachable: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: `Payment rail error (HTTP ${res.status})`,
    });
  }
  return json;
}

/** Deterministic USSD display code (same bank-code table as hostedCheckout). */
function buildUssdCode(bankCode: string, reference: string): string {
  const bankUSSD: Record<string, string> = {
    "058": "*737", "011": "*894", "044": "*901",
    "057": "*822", "033": "*919", "232": "*833", "000": "*737",
  };
  const prefix = bankUSSD[bankCode] ?? "*737";
  return `${prefix}*000*${reference.slice(-6)}#`;
}

async function fireEvent(event: string, merchantId: string, tenantId: string, data: Record<string, unknown>) {
  try {
    await dispatchWebhookEvent(buildWebhookPayload(event as never, merchantId, tenantId, data));
  } catch { /* webhook delivery must never fail the API response */ }
}

function checkoutBaseUrl(req: Request): string {
  return (process.env.PUBLIC_CHECKOUT_BASE_URL ?? `${req.protocol}://${req.get("host") ?? "localhost"}`).replace(/\/$/, "");
}

// ─── Router ───────────────────────────────────────────────────────────────────

export function createPublicRestRouter(): Router {
  const r = Router();

  // Rate-limit headers on every response; 429 + Retry-After when exceeded.
  r.use(expressRateLimit({ max: 100, windowMs: 60_000, keyPrefix: "rest:v1" }));
  // Secret-key auth on every route.
  r.use(publicRestAuth());

  const authOf = (req: Request): RestAuth => req.restAuth!;

  // ══ POST /transaction/initialize ═════════════════════════════════════════
  r.post("/transaction/initialize", h(async (req, res) => {
    const auth = authOf(req);
    const result = await withRestIdempotency(req, auth, "rest.transaction.initialize", async () => {
      const {
        email, amount, currency = "NGN", reference, callback_url,
        channels, metadata, plan, split_code, subaccount,
        transaction_charge, bearer,
      } = (req.body ?? {}) as Record<string, any>;

      if (!email || typeof email !== "string" || !/^[^@\s]+@[^@\s]+$/.test(email)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "A valid email is required" });
      }
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "amount must be a positive integer (kobo)" });
      }

      const db = await getDb();
      const ref = typeof reference === "string" && reference.length > 0 ? reference : generateReference();

      // Reference-based idempotency: an existing session/transaction with this
      // reference is returned, never duplicated.
      const [existingSession] = await db
        .select()
        .from(hostedPaymentSessions)
        .where(eq(hostedPaymentSessions.reference, ref))
        .limit(1);
      if (existingSession) {
        return {
          authorization_url: `${checkoutBaseUrl(req)}/pay/${existingSession.reference}`,
          access_code: existingSession.id,
          reference: existingSession.reference,
          reused: true,
        };
      }
      const [existingTx] = await db
        .select()
        .from(transactions)
        .where(and(eq(transactions.merchantId, auth.merchantId), eq(transactions.reference, ref)))
        .limit(1);
      if (existingTx) {
        return {
          authorization_url: `${checkoutBaseUrl(req)}/pay/${existingTx.reference}`,
          access_code: existingTx.id,
          reference: existingTx.reference,
          reused: true,
        };
      }

      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, auth.merchantId)).limit(1);
      const tenantId = merchant?.tenantId ?? "ten_default";

      const sessionId = generateAccessCode();
      await db.insert(hostedPaymentSessions).values({
        id: sessionId,
        merchantId: auth.merchantId,
        tenantId,
        customerEmail: email,
        amountKobo: amount,
        currency,
        reference: ref,
        status: "pending",
        metadata: {
          ...(metadata && typeof metadata === "object" ? metadata : {}),
          ...(callback_url ? { callback_url } : {}),
          ...(channels ? { channels: JSON.stringify(channels) } : {}),
          ...(plan ? { plan } : {}),
          ...(split_code ? { split_code } : {}),
          ...(subaccount ? { subaccount } : {}),
          ...(transaction_charge != null ? { transaction_charge: String(transaction_charge) } : {}),
          ...(bearer ? { bearer } : {}),
          source: "rest_v1",
        },
        expiresAt: new Date(Date.now() + 30 * 60 * 1000),
      });

      void fireEvent(PUBLIC_REST_EVENTS.TRANSACTION_CREATED, auth.merchantId, tenantId, {
        reference: ref, amount, currency, email,
      });

      return {
        authorization_url: `${checkoutBaseUrl(req)}/pay/${ref}`,
        access_code: sessionId,
        reference: ref,
      };
    });
    return ok(res, result, "Authorization URL created");
  }));

  // ══ GET /transaction/verify/:reference ═══════════════════════════════════
  // Verify contract: callers MUST check BOTH data.status === 'success' AND
  // data.amount === the amount they expect before delivering value.
  r.get("/transaction/verify/:reference", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;
    const reference = req.params.reference;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, auth.merchantId), eq(transactions.reference, reference)))
      .limit(1);

    if (!tx) {
      // Fall back to a hosted session that hasn't converted yet.
      const [sess] = await db
        .select()
        .from(hostedPaymentSessions)
        .where(and(eq(hostedPaymentSessions.merchantId, auth.merchantId), eq(hostedPaymentSessions.reference, reference)))
        .limit(1);
      if (!sess) return fail(res, 404, "Transaction not found");
      return ok(res, {
        status: sess.status === "completed" ? "success" : sess.status === "failed" ? "failed" : "pending",
        amount: Number(sess.amountKobo),
        reference: sess.reference,
        channel: sess.paymentMethod ?? null,
        currency: sess.currency,
        paid_at: sess.paidAt ?? null,
        gateway_response: sess.failureReason ?? null,
        authorization: null,
      }, "Transaction status retrieved");
    }

    const meta = (tx.metadata ?? {}) as Record<string, any>;
    return ok(res, {
      status: tx.status === "completed" ? "success" : tx.status === "failed" ? "failed" : tx.status,
      amount: Number(tx.amount),
      reference: tx.reference,
      channel: tx.channel,
      currency: tx.currency,
      paid_at: tx.completedAt ?? null,
      gateway_response: meta.gateway_response ?? null,
      authorization: meta.authorization ?? null,
    }, "Verification successful. Always confirm status and amount before delivering value.");
  }));

  // ══ GET /transaction/totals (before /:id) ════════════════════════════════
  r.get("/transaction/totals", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;

    const rows = await db
      .select({
        currency: transactions.currency,
        count: sql<number>`count(*)::int`,
        volume: sql<number>`coalesce(sum(${transactions.amount}),0)::bigint`,
      })
      .from(transactions)
      .where(eq(transactions.merchantId, auth.merchantId))
      .groupBy(transactions.currency);

    const [pending] = await db
      .select({ count: sql<number>`count(*)::int` })
      .from(transactions)
      .where(and(eq(transactions.merchantId, auth.merchantId), eq(transactions.status, "pending")));

    return ok(res, {
      by_currency: rows,
      total_transactions: rows.reduce((a, r) => a + Number(r.count), 0),
      total_volume: rows.reduce((a, r) => a + Number(r.volume), 0),
      pending_transfers: Number(pending?.count ?? 0),
    }, "Transaction totals retrieved");
  }));

  // ══ GET /transaction/export (CSV) ════════════════════════════════════════
  r.get("/transaction/export", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;

    const rows = await db
      .select()
      .from(transactions)
      .where(eq(transactions.merchantId, auth.merchantId))
      .orderBy(desc(transactions.createdAt))
      .limit(5000);

    const esc = (v: unknown) => {
      const s = v == null ? "" : String(v);
      return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    };
    const header = "id,reference,amount_kobo,currency,status,channel,customer_email,fee_kobo,created_at,completed_at";
    const lines = rows.map((t) => [
      t.id, t.reference, t.amount, t.currency, t.status, t.channel,
      t.customerEmail ?? "", t.feeAmount, t.createdAt?.toISOString?.() ?? "", t.completedAt?.toISOString?.() ?? "",
    ].map(esc).join(","));
    const csv = [header, ...lines].join("\n");

    res.setHeader("Content-Type", "text/csv");
    res.setHeader("Content-Disposition", `attachment; filename="transactions-${Date.now()}.csv"`);
    return res.status(200).send(csv);
  }));

  // ══ GET /transaction/timeline/:reference ═════════════════════════════════
  r.get("/transaction/timeline/:reference", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;
    const reference = req.params.reference;

    const attempts = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, auth.merchantId), eq(transactions.reference, reference)));

    const deliveries = await db
      .select()
      .from(webhookDeliveries)
      .where(eq(webhookDeliveries.merchantId, auth.merchantId))
      .orderBy(desc(webhookDeliveries.createdAt))
      .limit(200);
    const related = deliveries.filter((d) => JSON.stringify(d.payload ?? {}).includes(reference));

    if (attempts.length === 0 && related.length === 0) return fail(res, 404, "No timeline found for reference");

    return ok(res, {
      reference,
      attempts: attempts.map((t) => ({
        id: t.id, status: t.status, channel: t.channel, amount: Number(t.amount),
        created_at: t.createdAt, completed_at: t.completedAt,
      })),
      history: related.map((d) => ({
        id: d.id, event: d.eventType, status: d.status,
        response_status: d.responseStatus, attempt: d.attemptCount, created_at: d.createdAt,
      })),
    }, "Timeline retrieved");
  }));

  // ══ GET /transaction (list) ══════════════════════════════════════════════
  r.get("/transaction", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;

    const page = Math.max(1, parseInt(String(req.query.page ?? "1"), 10) || 1);
    const perPage = Math.min(100, Math.max(1, parseInt(String(req.query.perPage ?? "50"), 10) || 50));
    const filters = [eq(transactions.merchantId, auth.merchantId)];
    if (req.query.status) filters.push(eq(transactions.status, String(req.query.status) as never));
    if (req.query.from) filters.push(gte(transactions.createdAt, new Date(String(req.query.from))));
    if (req.query.to) filters.push(lte(transactions.createdAt, new Date(String(req.query.to))));

    const rows = await db
      .select()
      .from(transactions)
      .where(and(...filters))
      .orderBy(desc(transactions.createdAt))
      .limit(perPage + 1)
      .offset((page - 1) * perPage);

    const hasMore = rows.length > perPage;
    const pageRows = hasMore ? rows.slice(0, perPage) : rows;

    const items = pageRows.map((t) => ({
      id: t.id, reference: t.reference, amount: Number(t.amount), currency: t.currency,
      status: t.status, channel: t.channel, customer: { email: t.customerEmail },
      paid_at: t.completedAt, created_at: t.createdAt,
    }));
    return ok(res, {
      transactions: items,
      meta: {
        page, perPage, count: items.length,
        has_more: hasMore,
        next_cursor: hasMore ? String(page + 1) : null,
      },
    }, "Transactions retrieved");
  }));

  // ══ GET /transaction/:id ═════════════════════════════════════════════════
  r.get("/transaction/:id", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;

    const [tx] = await db
      .select()
      .from(transactions)
      .where(and(eq(transactions.merchantId, auth.merchantId), eq(transactions.id, req.params.id)))
      .limit(1);
    if (!tx) return fail(res, 404, "Transaction not found");

    return ok(res, {
      id: tx.id, reference: tx.reference, amount: Number(tx.amount), currency: tx.currency,
      status: tx.status, channel: tx.channel, fees: Number(tx.feeAmount),
      customer: { email: tx.customerEmail, name: tx.customerName },
      metadata: tx.metadata, paid_at: tx.completedAt, created_at: tx.createdAt,
    }, "Transaction retrieved");
  }));

  registerChargeRoutes(r, authOf);
  return r;
}

// ─── Charge state machine + unified /charge routes ───────────────────────────

type ChargeStatus = "success" | "failed" | "pending" | "send_otp" | "send_pin" | "open_url" | "pay_offline";

interface ChargeReply {
  reference: string;
  status: ChargeStatus;
  display_text: string;
  amount?: number;
  requested_amount?: number;
  currency?: string;
  url?: string;
  ussd_code?: string;
  authorization?: Record<string, unknown> | null;
  paused?: boolean;
  authorization_url?: string;
}

function chargeOk(res: Response, reply: ChargeReply, message: string) {
  return ok(res, reply, message);
}

async function loadMerchantCharge(
  db: any, merchantId: string, reference: string,
): Promise<typeof transactions.$inferSelect | undefined> {
  const [tx] = await db
    .select()
    .from(transactions)
    .where(and(eq(transactions.merchantId, merchantId), eq(transactions.reference, reference)))
    .limit(1);
  return tx;
}

/** Shared: charge a saved reusable authorization (charge_authorization + /charge{authorization}). */
async function executeChargeAuthorization(opts: {
  db: any; merchantId: string; tenantId: string;
  authorizationCode: string; email: string; amount: number;
  currency: string; reference: string; queue: boolean;
}): Promise<ChargeReply> {
  const { db, merchantId, tenantId } = opts;

  const [authz] = await db
    .select()
    .from(cardAuthorizations)
    .where(and(
      eq(cardAuthorizations.merchantId, merchantId),
      eq(cardAuthorizations.authorizationCode, opts.authorizationCode),
    ))
    .limit(1);
  if (!authz) throw new TRPCError({ code: "NOT_FOUND", message: "Authorization not found for this merchant" });
  if (!authz.active || !authz.reusable) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "This authorization is not reusable or has been deactivated" });
  }
  if (authz.customerEmail.toLowerCase() !== opts.email.toLowerCase()) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "email does not match the authorization's customer" });
  }

  const txId = `txn_${randomBytes(10).toString("hex")}`;
  const base = {
    reference: opts.reference,
    amount: opts.amount,
    currency: opts.currency,
    authorization: {
      authorization_code: authz.authorizationCode,
      last4: authz.last4, brand: authz.brand, bank: authz.bank,
    } as Record<string, unknown>,
  };

  if (opts.queue) {
    await db.insert(transactions).values({
      id: txId, tenantId, merchantId, reference: opts.reference,
      amount: opts.amount, currency: opts.currency, status: "pending", channel: "card",
      customerEmail: opts.email,
      metadata: { queued: true, authorization: base.authorization, source: "rest_v1.charge_authorization" },
    });
    return { ...base, status: "pending", display_text: "Charge queued for processing" };
  }

  // 2FA-paused flow: when the rail requires customer presence we return
  // paused:true + an authorization_url instead of charging silently.
  const bridge = await bridgeRequest("/v1/charge/authorization", {
    merchantId, authorizationCode: opts.authorizationCode,
    email: opts.email, amountKobo: opts.amount, currency: opts.currency,
    reference: opts.reference,
  });

  if (bridge.paused === true || bridge.requires2fa === true) {
    await db.insert(transactions).values({
      id: txId, tenantId, merchantId, reference: opts.reference,
      amount: opts.amount, currency: opts.currency, status: "pending", channel: "card",
      customerEmail: opts.email,
      metadata: { paused: true, authorization: base.authorization, source: "rest_v1.charge_authorization" },
    });
    return {
      ...base, status: "pending", paused: true,
      authorization_url: bridge.authorization_url ?? `${process.env.PUBLIC_CHECKOUT_BASE_URL ?? ""}/pay/${opts.reference}`,
      display_text: "Customer authentication required to complete this charge",
    };
  }

  const succeeded = bridge.status === "success" || bridge.status === "succeeded";
  await db.insert(transactions).values({
    id: txId, tenantId, merchantId, reference: opts.reference,
    amount: opts.amount, currency: opts.currency,
    status: succeeded ? "completed" : "failed",
    channel: "card", customerEmail: opts.email,
    completedAt: succeeded ? new Date() : null,
    metadata: { authorization: base.authorization, gateway_response: bridge.gateway_response ?? null, source: "rest_v1.charge_authorization" },
  });

  await fireEvent(succeeded ? PUBLIC_REST_EVENTS.CHARGE_SUCCESS : PUBLIC_REST_EVENTS.CHARGE_FAILED,
    merchantId, tenantId, base);

  return {
    ...base,
    status: succeeded ? "success" : "failed",
    display_text: succeeded ? "Charge successful" : (bridge.gateway_response ?? "Charge failed"),
  };
}

function registerChargeRoutes(r: Router, authOf: (req: Request) => RestAuth): void {

  // ══ POST /charge ═══════════════════════════════════════════════════════════
  r.post("/charge", h(async (req, res) => {
    const auth = authOf(req);
    const reply = await withRestIdempotency(req, auth, "rest.charge", async (): Promise<ChargeReply> => {
      const body = (req.body ?? {}) as Record<string, any>;
      const { email, amount, currency = "NGN", reference, metadata } = body;
      if (!email || typeof email !== "string") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "email is required" });
      }
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "amount must be a positive integer (kobo)" });
      }
      const ref = typeof reference === "string" && reference ? reference : generateReference();
      const db = await getDb();
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, auth.merchantId)).limit(1);
      const tenantId = merchant?.tenantId ?? "ten_default";

      // ── Instrument: saved authorization ──────────────────────────────────
      if (body.authorization && typeof body.authorization === "object") {
        const code = body.authorization.authorization_code;
        if (!code) throw new TRPCError({ code: "BAD_REQUEST", message: "authorization.authorization_code is required" });
        return executeChargeAuthorization({
          db, merchantId: auth.merchantId, tenantId,
          authorizationCode: String(code), email, amount, currency,
          reference: ref, queue: body.queue === true,
        });
      }

      // ── Instrument: raw card ─────────────────────────────────────────────
      if (body.card && typeof body.card === "object") {
        const { number, cvv, expiry_month, expiry_year, pin } = body.card;
        if (!number || !cvv || !expiry_month || !expiry_year) {
          throw new TRPCError({ code: "BAD_REQUEST", message: "card requires number, cvv, expiry_month, expiry_year" });
        }
        const pi = await stripeRequest("/payment_intents", new URLSearchParams({
          amount: String(amount), currency: String(currency).toLowerCase(),
          confirm: "true",
          "payment_method_data[type]": "card",
          "payment_method_data[card][number]": String(number),
          "payment_method_data[card][cvc]": String(cvv),
          "payment_method_data[card][exp_month]": String(expiry_month),
          "payment_method_data[card][exp_year]": String(expiry_year),
          "metadata[reference]": ref, "metadata[merchantId]": auth.merchantId,
        }));

        const succeeded = pi.status === "succeeded";
        const needsAction = pi.status === "requires_action";
        const txId = `txn_${randomBytes(10).toString("hex")}`;
        await db.insert(transactions).values({
          id: txId, tenantId, merchantId: auth.merchantId, reference: ref,
          amount, currency, channel: "card", customerEmail: email,
          status: succeeded ? "completed" : needsAction ? "pending" : "failed",
          completedAt: succeeded ? new Date() : null,
          metadata: {
            ...(metadata ?? {}),
            gateway_response: pi.last_payment_error?.message ?? pi.status,
            stripePaymentIntentId: pi.id,
            source: "rest_v1.charge.card",
          },
        });

        if (succeeded) {
          // Tokenize: persist a reusable authorization for this card.
          let authorization: Record<string, unknown> | null = null;
          try {
            const fp = pi.latest_charge?.payment_method_details?.card?.fingerprint
              ?? pi.payment_method_details?.card?.fingerprint ?? String(number);
            const cardDet = pi.latest_charge?.payment_method_details?.card ?? {};
            const saved = await recordAuthorizationFromCharge({
              merchantId: auth.merchantId, customerEmail: email,
              panFingerprint: fp,
              bin: String(number).slice(0, 6), last4: String(number).slice(-4),
              brand: cardDet.brand ?? null, bank: cardDet.issuer ?? null,
              expMonth: expiry_month, expYear: expiry_year, channel: "card",
            });
            authorization = {
              authorization_code: saved.authorizationCode,
              last4: saved.last4, brand: saved.brand, bank: saved.bank,
              reusable: saved.reusable,
            };
          } catch { /* tokenization is best-effort; the charge already settled */ }

          await fireEvent(PUBLIC_REST_EVENTS.CHARGE_SUCCESS, auth.merchantId, tenantId, {
            reference: ref, amount, currency, email,
          });
          return {
            reference: ref, status: "success", display_text: "Charge successful",
            amount, currency, authorization,
          };
        }
        if (needsAction) {
          return {
            reference: ref, status: "open_url",
            url: pi.next_action?.redirect_to_url?.url ?? null,
            display_text: "Customer action required to complete this charge",
            amount, currency,
          } as ChargeReply;
        }
        await fireEvent(PUBLIC_REST_EVENTS.CHARGE_FAILED, auth.merchantId, tenantId, {
          reference: ref, amount, currency, email,
        });
        return {
          reference: ref, status: "failed",
          display_text: pi.last_payment_error?.message ?? "Charge failed",
          amount, currency,
        };
      }

      // ── Instrument: bank transfer (NIP virtual account) ──────────────────
      if (body.bank && typeof body.bank === "object") {
        const va = await bridgeRequest("/nip/virtual-account", {
          amountKobo: amount, reference: ref, merchantId: auth.merchantId,
          customerName: body.bank.account_name ?? email,
        });
        await db.insert(transactions).values({
          id: `txn_${randomBytes(10).toString("hex")}`, tenantId, merchantId: auth.merchantId,
          reference: ref, amount, currency, channel: "bank_transfer",
          customerEmail: email, status: "pending",
          metadata: {
            ...(metadata ?? {}),
            virtual_account: va.accountNumber, bank_code: va.bankCode, bank_name: va.bankName,
            source: "rest_v1.charge.bank",
          },
        });
        return {
          reference: ref, status: "pending",
          display_text: `Transfer ₦${(amount / 100).toLocaleString()} to ${va.bankName} account ${va.accountNumber}`,
          amount, currency,
        };
      }

      // ── Instrument: USSD ─────────────────────────────────────────────────
      if (body.ussd && typeof body.ussd === "object") {
        const ussdCode = buildUssdCode(String(body.ussd.bank_code ?? "000"), ref);
        await db.insert(transactions).values({
          id: `txn_${randomBytes(10).toString("hex")}`, tenantId, merchantId: auth.merchantId,
          reference: ref, amount, currency, channel: "ussd",
          customerEmail: email, status: "pending",
          metadata: { ...(metadata ?? {}), ussd_code: ussdCode, source: "rest_v1.charge.ussd" },
        });
        return {
          reference: ref, status: "pay_offline", ussd_code: ussdCode,
          display_text: `Dial ${ussdCode} on your phone to complete payment`,
          amount, currency,
        };
      }

      // ── Instrument: mobile_money / qr — no live rail wired → fail loud ──
      if (body.mobile_money || body.qr) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "This payment channel is not available: no mobile-money/QR rail is configured",
        });
      }

      throw new TRPCError({
        code: "BAD_REQUEST",
        message: "Exactly one instrument is required: card, bank, ussd, mobile_money, qr, or authorization",
      });
    });
    return chargeOk(res, reply, "Charge attempted");
  }));

  // ── Pending-input continuation endpoints (submit_* by reference) ─────────
  const submitKinds: Array<{ kind: string; field: string }> = [
    { kind: "otp", field: "otp" },
    { kind: "pin", field: "pin" },
    { kind: "phone", field: "phone" },
    { kind: "birthday", field: "birthday" },
    { kind: "address", field: "address" },
  ];
  for (const { kind, field } of submitKinds) {
    r.post(`/charge/submit_${kind}`, h(async (req, res) => {
      const auth = authOf(req);
      const reply = await withRestIdempotency(req, auth, `rest.charge.submit_${kind}`, async (): Promise<ChargeReply> => {
        const { reference, [field]: value } = (req.body ?? {}) as Record<string, any>;
        if (!reference) throw new TRPCError({ code: "BAD_REQUEST", message: "reference is required" });
        if (value == null || value === "") {
          throw new TRPCError({ code: "BAD_REQUEST", message: `${field} is required` });
        }
        const db = await getDb();
        const tx = await loadMerchantCharge(db, auth.merchantId, String(reference));
        if (!tx) throw new TRPCError({ code: "NOT_FOUND", message: "Charge not found" });
        if (tx.status === "completed" || tx.status === "failed") {
          throw new TRPCError({ code: "CONFLICT", message: `Charge is already ${tx.status}; cannot submit ${kind}` });
        }
        // Never persist the raw credential. Record only that it was supplied;
        // forwarding to the live rail is a rail-specific integration and is
        // fail-loud when unconfigured.
        if (kind === "otp" || kind === "pin") {
          await bridgeRequest(`/v1/charge/submit_${kind}`, {
            reference: tx.reference, merchantId: auth.merchantId, [field]: String(value),
          });
        }
        await db.update(transactions)
          .set({ metadata: { ...((tx.metadata as Record<string, unknown>) ?? {}), [`${kind}_submitted_at`]: new Date().toISOString() } })
          .where(eq(transactions.id, tx.id));
        return {
          reference: tx.reference, status: "pending",
          display_text: `${kind.toUpperCase()} submitted; charge is being processed`,
          amount: Number(tx.amount), currency: tx.currency,
        };
      });
      return chargeOk(res, reply, `${kind.toUpperCase()} submitted`);
    }));
  }

  // ══ GET /charge/:reference (pending check) ═══════════════════════════════
  r.get("/charge/:reference", h(async (req, res) => {
    const auth = authOf(req);
    const db = await requireDb(res); if (!db) return;
    const tx = await loadMerchantCharge(db, auth.merchantId, req.params.reference);
    if (!tx) return fail(res, 404, "Charge not found");
    const meta = (tx.metadata ?? {}) as Record<string, any>;
    return ok(res, {
      reference: tx.reference,
      status: tx.status === "completed" ? "success" : tx.status === "failed" ? "failed" : "pending",
      amount: Number(tx.amount), currency: tx.currency, channel: tx.channel,
      display_text: tx.status === "completed" ? "Charge successful"
        : tx.status === "failed" ? (meta.gateway_response ?? "Charge failed")
        : "Charge is pending",
    }, "Charge status retrieved");
  }));

  // ══ POST /transaction/charge_authorization ═══════════════════════════════
  r.post("/transaction/charge_authorization", h(async (req, res) => {
    const auth = authOf(req);
    const reply = await withRestIdempotency(req, auth, "rest.transaction.charge_authorization", async (): Promise<ChargeReply> => {
      const { authorization_code, email, amount, currency = "NGN", reference, queue } = (req.body ?? {}) as Record<string, any>;
      if (!authorization_code) throw new TRPCError({ code: "BAD_REQUEST", message: "authorization_code is required" });
      if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "email is required" });
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "amount must be a positive integer (kobo)" });
      }
      const db = await getDb();
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, auth.merchantId)).limit(1);
      return executeChargeAuthorization({
        db, merchantId: auth.merchantId, tenantId: merchant?.tenantId ?? "ten_default",
        authorizationCode: String(authorization_code), email: String(email),
        amount, currency: String(currency),
        reference: reference ? String(reference) : generateReference(),
        queue: queue === true,
      });
    });
    return chargeOk(res, reply, reply.status === "success" ? "Charge successful" : reply.display_text ?? "Charge attempted");
  }));

  // ══ POST /transaction/partial_debit ══════════════════════════════════════
  r.post("/transaction/partial_debit", h(async (req, res) => {
    const auth = authOf(req);
    const reply = await withRestIdempotency(req, auth, "rest.transaction.partial_debit", async (): Promise<ChargeReply> => {
      const { authorization_code, email, currency = "NGN", amount, at_least, reference } = (req.body ?? {}) as Record<string, any>;
      if (!authorization_code) throw new TRPCError({ code: "BAD_REQUEST", message: "authorization_code is required" });
      if (!email) throw new TRPCError({ code: "BAD_REQUEST", message: "email is required" });
      if (typeof amount !== "number" || !Number.isInteger(amount) || amount <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "amount must be a positive integer (kobo)" });
      }
      if (at_least != null && (typeof at_least !== "number" || at_least <= 0 || at_least > amount)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "at_least must be a positive amount not exceeding amount (kobo)" });
      }
      const db = await getDb();
      const [merchant] = await db.select().from(merchants).where(eq(merchants.id, auth.merchantId)).limit(1);
      const tenantId = merchant?.tenantId ?? "ten_default";

      const [authz] = await db
        .select()
        .from(cardAuthorizations)
        .where(and(
          eq(cardAuthorizations.merchantId, auth.merchantId),
          eq(cardAuthorizations.authorizationCode, String(authorization_code)),
        ))
        .limit(1);
      if (!authz) throw new TRPCError({ code: "NOT_FOUND", message: "Authorization not found for this merchant" });
      if (!authz.active || !authz.reusable) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "This authorization is not reusable or has been deactivated" });
      }

      // Preflight balance + up-to charge is rail-specific. When the rail
      // cannot preflight, FAIL LOUD — never fabricate a partial debit.
      const ref = reference ? String(reference) : generateReference();
      const result = await bridgeRequest("/v1/charge/partial-debit", {
        merchantId: auth.merchantId, authorizationCode: authz.authorizationCode,
        email: String(email), currency: String(currency),
        requestedAmountKobo: amount, atLeastKobo: at_least ?? null, reference: ref,
      });
      const charged = Number(result.chargedAmountKobo ?? result.amount_kobo ?? 0);
      if (!Number.isFinite(charged) || charged < 0 || charged > amount) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Rail returned an invalid partial-debit amount; refusing to record it",
        });
      }
      const succeeded = charged > 0 && (result.status === "success" || result.status === "succeeded");
      await db.insert(transactions).values({
        id: `txn_${randomBytes(10).toString("hex")}`, tenantId, merchantId: auth.merchantId,
        reference: ref, amount: charged, currency: String(currency), channel: "card",
        customerEmail: String(email), status: succeeded ? "completed" : "failed",
        completedAt: succeeded ? new Date() : null,
        metadata: {
          requested_amount: amount, at_least: at_least ?? null,
          authorization: { authorization_code: authz.authorizationCode, last4: authz.last4, brand: authz.brand },
          gateway_response: result.gateway_response ?? null,
          source: "rest_v1.partial_debit",
        },
      });
      if (succeeded) {
        await fireEvent(PUBLIC_REST_EVENTS.CHARGE_SUCCESS, auth.merchantId, tenantId, {
          reference: ref, amount: charged, requested_amount: amount,
        });
      }
      return {
        reference: ref,
        status: succeeded ? "success" : "failed",
        display_text: succeeded
          ? (charged < amount ? `Partial debit successful: charged ${charged} of ${amount} kobo` : "Charge successful")
          : (result.gateway_response ?? "Partial debit failed"),
        amount: charged,
        requested_amount: amount,
        currency: String(currency),
      };
    });
    return chargeOk(res, reply, reply.display_text ?? "Partial debit attempted");
  }));
}

export const publicRestRouter: Router = createPublicRestRouter();
