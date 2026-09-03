/**
 * subscriptionExtras.ts — Paystack subscription parity gap-fill.
 *
 *   getManageLink          — hosted card-update link (/manage-subscription/{token}),
 *                            HMAC-signed; token hash + expiry persisted in
 *                            subscription_manage_tokens (drizzle/0098). Emits
 *                            subscription.manage_link.created. FAILS LOUD when
 *                            no internal signing secret is configured.
 *   verifyManageToken      — public: resolve a token → subscription + customer
 *                            for the hosted update page.
 *   sendManageLinkByEmail  — send the manage link via the existing email
 *                            notification path (emailService). FAILS LOUD when
 *                            email delivery is not configured/available.
 *   listExpiringCards      — subscriptions whose saved card expires in the
 *                            current/next month. HONEST CAPABILITY GATE: the
 *                            subscriptions schema carries no card columns and
 *                            no customer-authorizations source exists in the
 *                            schema, so this returns { supported: false, items: [] }
 *                            — no fabricated data.
 *   expiringCardsDigest    — aggregates expiring cards per merchant and emits
 *                            subscription.expiring_cards. Designed to be called
 *                            by an external scheduler; NO cron is registered here.
 */
import crypto from "crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { sql } from "drizzle-orm";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { dispatchWebhookEvent } from "../webhookEvents";
import { sendEmail } from "../emailService";

const DEFAULT_TENANT = "ten_default";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // manage links live 24h

async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

async function dbOrFail() {
  const database = await getDb();
  if (!database) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  return database;
}

function rowsOf(result: any): any[] {
  return (result?.rows ?? result ?? []) as any[];
}

export const SUBSCRIPTION_EXTRA_EVENTS = {
  notRenew: "subscription.not_renew",
  expiringCards: "subscription.expiring_cards",
  manageLinkCreated: "subscription.manage_link.created",
} as const;

async function emitSubEvent(merchantId: string, event: string, data: Record<string, unknown>) {
  await dispatchWebhookEvent({
    event: event as any,
    id: `evt_${crypto.randomBytes(10).toString("hex")}`,
    tenantId: DEFAULT_TENANT,
    merchantId,
    timestamp: new Date().toISOString(),
    data,
  });
}

// ─── Manage-token signing ────────────────────────────────────────────────────
/** Internal signing secret. FAILS LOUD when unset — never fall back silently. */
function manageLinkSecret(): string {
  const secret = process.env.SUBSCRIPTION_MANAGE_SECRET ?? process.env.INTERNAL_API_KEY ?? "";
  if (!secret) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "SUBSCRIPTION_MANAGE_SECRET (or INTERNAL_API_KEY) is not configured — cannot sign manage links",
    });
  }
  return secret;
}

function b64url(buf: Buffer | string): string {
  return Buffer.from(buf).toString("base64url");
}

export function signManageToken(subscriptionId: string, expiresAtMs: number): string {
  const payload = b64url(JSON.stringify({
    sub: subscriptionId,
    exp: expiresAtMs,
    nonce: crypto.randomBytes(8).toString("hex"),
  }));
  const sig = crypto.createHmac("sha256", manageLinkSecret()).update(payload).digest("base64url");
  return `${payload}.${sig}`;
}

export function verifyManageTokenSignature(token: string): { subscriptionId: string; expiresAtMs: number } {
  const [payload, sig] = token.split(".");
  if (!payload || !sig) throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed manage token" });
  const expected = crypto.createHmac("sha256", manageLinkSecret()).update(payload).digest("base64url");
  const a = Buffer.from(sig);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid manage token signature" });
  }
  let parsed: any;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed manage token payload" });
  }
  if (typeof parsed?.sub !== "string" || typeof parsed?.exp !== "number") {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed manage token claims" });
  }
  if (parsed.exp < Date.now()) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Manage token expired" });
  }
  return { subscriptionId: parsed.sub, expiresAtMs: parsed.exp };
}

function tokenHash(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

function manageLinkBaseUrl(): string {
  const base = process.env.MERCHANT_PORTAL_URL ?? process.env.PAYGATE_API_URL ?? "";
  if (!base) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message: "MERCHANT_PORTAL_URL (or PAYGATE_API_URL) is not configured — cannot build manage link",
    });
  }
  return base.replace(/\/$/, "");
}

const SUB_SELECT = sql`
  SELECT id, merchant_id AS "merchantId", tenant_id AS "tenantId",
         customer_email AS "customerEmail", customer_name AS "customerName",
         plan_name AS "planName", amount_kobo AS "amountKobo", currency,
         interval, status, next_run_at AS "nextRunAt",
         created_at AS "createdAt", updated_at AS "updatedAt"
  FROM subscriptions
`;

async function findOwnedSubscription(database: any, merchantId: string, code: string) {
  const rows = rowsOf(await database.execute(sql`
    ${SUB_SELECT} WHERE id = ${code} AND merchant_id = ${merchantId} LIMIT 1
  `));
  if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: `Subscription "${code}" not found` });
  return rows[0];
}

async function createManageLink(merchantId: string, subscription: any) {
  const database = await dbOrFail();
  const expiresAtMs = Date.now() + TOKEN_TTL_MS;
  const token = signManageToken(subscription.id, expiresAtMs);
  await database.execute(sql`
    INSERT INTO subscription_manage_tokens (id, merchant_id, subscription_id, token_hash, expires_at)
    VALUES (${`smt_${crypto.randomBytes(8).toString("hex")}`}, ${merchantId}, ${subscription.id},
            ${tokenHash(token)}, ${new Date(expiresAtMs)})
  `);
  await emitSubEvent(merchantId, SUBSCRIPTION_EXTRA_EVENTS.manageLinkCreated, {
    subscription_id: subscription.id,
    customer_email: subscription.customerEmail,
    expires_at: new Date(expiresAtMs).toISOString(),
  });
  return {
    url: `${manageLinkBaseUrl()}/manage-subscription/${token}`,
    token,
    expiresAt: new Date(expiresAtMs).toISOString(),
  };
}

/**
 * Expiring-card capability: the subscriptions schema has no card columns and
 * no customer-authorizations table exists, so expiring-card detection is NOT
 * supported. We return an explicit capability flag instead of fabricating rows.
 */
export const EXPIRING_CARDS_SUPPORTED = false;

async function listExpiringCardsCore(database: any, merchantId: string) {
  if (!EXPIRING_CARDS_SUPPORTED) {
    return { supported: false as const, items: [] as any[] };
  }
  // Unreachable today (capability flag is false). When a customer-authorizations
  // source with card exp_month/exp_year lands in the schema, implement the join
  // here against subscriptions for the current/next calendar month.
  void database;
  void merchantId;
  return { supported: true as const, items: [] as any[] };
}

export const subscriptionExtrasRouter = router({
  /** Paystack GET /subscription/{code}/manage/link — hosted card-update link. */
  getManageLink: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const subscription = await findOwnedSubscription(database, merchantId, input.code);
      if (subscription.status === "cancelled") {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Cannot create a manage link for a cancelled subscription" });
      }
      return createManageLink(merchantId, subscription);
    }),

  /** Public: resolve a manage token for the hosted card-update page. */
  verifyManageToken: publicProcedure
    .input(z.object({ token: z.string().min(10) }))
    .query(async ({ input }) => {
      const claims = verifyManageTokenSignature(input.token);
      const database = await dbOrFail();
      const rows = rowsOf(await database.execute(sql`
        SELECT id, subscription_id AS "subscriptionId", merchant_id AS "merchantId",
               expires_at AS "expiresAt", used_at AS "usedAt"
        FROM subscription_manage_tokens
        WHERE token_hash = ${tokenHash(input.token)}
        LIMIT 1
      `));
      const stored = rows[0];
      if (!stored) throw new TRPCError({ code: "UNAUTHORIZED", message: "Unknown manage token" });
      if (new Date(stored.expiresAt).getTime() < Date.now()) {
        throw new TRPCError({ code: "UNAUTHORIZED", message: "Manage token expired" });
      }
      const subs = rowsOf(await database.execute(sql`
        ${SUB_SELECT} WHERE id = ${claims.subscriptionId} AND merchant_id = ${stored.merchantId} LIMIT 1
      `));
      if (!subs[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Subscription not found for token" });
      return {
        subscription: subs[0],
        customer: { email: subs[0].customerEmail, name: subs[0].customerName },
        expiresAt: stored.expiresAt,
      };
    }),

  /** Paystack POST /subscription/{code}/manage/email — send link by email. */
  sendManageLinkByEmail: protectedProcedure
    .input(z.object({ code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const subscription = await findOwnedSubscription(database, merchantId, input.code);
      if (!subscription.customerEmail) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Subscription has no customer email" });
      }
      const link = await createManageLink(merchantId, subscription);
      const sent = await sendEmail({
        to: subscription.customerEmail,
        subject: "Update your subscription payment method",
        html: `<p>Hi ${subscription.customerName ?? "there"},</p>
<p>Use the secure link below to update the card on your <strong>${subscription.planName}</strong> subscription. The link expires at ${link.expiresAt}.</p>
<p><a href="${link.url}">${link.url}</a></p>`,
      });
      if (!sent) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: "Email notification path is not configured or delivery failed — manage link NOT sent",
        });
      }
      return { sent: true as const, email: subscription.customerEmail, expiresAt: link.expiresAt };
    }),

  /** Subscriptions with cards expiring in the current or next month. */
  listExpiringCards: protectedProcedure
    .input(z.object({}).optional())
    .query(async ({ ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      return listExpiringCardsCore(database, merchantId);
    }),

  /**
   * Scheduler entry point (invoked externally — no cron registered here):
   * aggregates expiring cards per merchant and emits subscription.expiring_cards.
   */
  expiringCardsDigest: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const database = await dbOrFail();
      const result = await listExpiringCardsCore(database, merchantId);
      if (!result.supported) {
        return { supported: false as const, merchantsProcessed: 0, eventsEmitted: 0 };
      }
      if (result.items.length > 0) {
        await emitSubEvent(merchantId, SUBSCRIPTION_EXTRA_EVENTS.expiringCards, {
          count: result.items.length,
          subscriptions: result.items,
        });
        return { supported: true as const, merchantsProcessed: 1, eventsEmitted: 1 };
      }
      return { supported: true as const, merchantsProcessed: 1, eventsEmitted: 0 };
    }),
});
