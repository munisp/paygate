/**
 * cardTokenization.ts — Merchant-managed reusable card authorizations.
 *
 * Paystack-parity: every successful card charge yields a reusable
 * `authorization_code` ("AUTH_...") plus a stable `signature` identifying the
 * underlying card (HMAC of the PAN fingerprint — the PAN itself is never
 * stored here).
 *
 * Integration contract (NON-INVASIVE): hostedCheckout.ts is owned by another
 * workstream and is NOT edited. Any charge path that completes a card charge
 * (this module's REST charge flow, or the hosted-checkout confirm path when
 * integrated by its owner) should call the exported
 * `recordAuthorizationFromCharge()` to persist the reusable authorization.
 *
 * The DDL for `card_authorizations` lives in
 * drizzle/0094_public_rest_tokenization.sql; the pgTable descriptor is defined
 * here, co-located with its only consumers.
 */
import { createHmac, randomBytes } from "node:crypto";
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq } from "drizzle-orm";
import { boolean, index, pgTable, text, timestamp } from "drizzle-orm/pg-core";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";

// ─── Table descriptor (DDL: drizzle/0094_public_rest_tokenization.sql) ───────

export const cardAuthorizations = pgTable("card_authorizations", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  authorizationCode: text("authorization_code").notNull(),
  reusable: boolean("reusable").notNull().default(true),
  signature: text("signature"),
  bin: text("bin"),
  last4: text("last4"),
  brand: text("brand"),
  cardType: text("card_type"),
  bank: text("bank"),
  expMonth: text("exp_month"),
  expYear: text("exp_year"),
  channel: text("channel").notNull().default("card"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").defaultNow().notNull(),
}, (t) => [
  index("card_authorizations_merchant_idx").on(t.merchantId),
  index("card_authorizations_email_idx").on(t.customerEmail),
  index("card_authorizations_signature_idx").on(t.signature),
]);

export type CardAuthorization = typeof cardAuthorizations.$inferSelect;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function hmacSecret(): string {
  return process.env.CARD_TOKENIZATION_SECRET ?? process.env.JWT_SECRET ?? "";
}

/**
 * Stable per-card signature: HMAC-SHA256 over the PAN fingerprint. When no
 * secret is configured we still return a deterministic value derived from the
 * fingerprint alone — the signature column is a lookup key, not a credential.
 */
export function computeCardSignature(panFingerprint: string): string {
  const secret = hmacSecret();
  const hmac = createHmac("sha256", secret || "paygate-card-signature");
  hmac.update(panFingerprint);
  return `sig_${hmac.digest("hex")}`;
}

export function generateAuthorizationCode(): string {
  return `AUTH_${randomBytes(12).toString("hex")}`;
}

export interface RecordAuthorizationInput {
  merchantId: string;
  customerEmail: string;
  /** PAN fingerprint from the card rail (e.g. Stripe payment_method.card.fingerprint). */
  panFingerprint?: string;
  bin?: string;
  last4?: string;
  brand?: string;
  cardType?: string;
  bank?: string;
  expMonth?: string | number;
  expYear?: string | number;
  channel?: string;
  /** Existing code to reuse when the card is already tokenized for this merchant. */
  authorizationCode?: string;
}

/**
 * recordAuthorizationFromCharge — persist (or reuse) a reusable card
 * authorization after a successful card charge.
 *
 * Idempotent by signature: the same card charged twice for the same merchant
 * returns the EXISTING authorization row (Paystack signature semantics).
 *
 * Call this from any successful card-charge completion path, e.g.:
 *   await recordAuthorizationFromCharge({
 *     merchantId, customerEmail,
 *     panFingerprint: stripePm.card.fingerprint,
 *     last4: stripePm.card.last4, brand: stripePm.card.brand, ...
 *   });
 */
export async function recordAuthorizationFromCharge(
  input: RecordAuthorizationInput,
): Promise<CardAuthorization> {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: "Database unavailable" });

  const signature = input.panFingerprint ? computeCardSignature(input.panFingerprint) : null;

  // Reuse: same card (signature) already tokenized for this merchant.
  if (signature) {
    const existing = await db
      .select()
      .from(cardAuthorizations)
      .where(and(eq(cardAuthorizations.merchantId, input.merchantId), eq(cardAuthorizations.signature, signature)))
      .limit(1);
    if (existing[0]) return existing[0];
  }

  const row = {
    id: `cauth_${randomBytes(10).toString("hex")}`,
    merchantId: input.merchantId,
    customerEmail: input.customerEmail,
    authorizationCode: input.authorizationCode ?? generateAuthorizationCode(),
    reusable: true,
    signature,
    bin: input.bin ?? null,
    last4: input.last4 ?? null,
    brand: input.brand ?? null,
    cardType: input.cardType ?? null,
    bank: input.bank ?? null,
    expMonth: input.expMonth != null ? String(input.expMonth) : null,
    expYear: input.expYear != null ? String(input.expYear) : null,
    channel: input.channel ?? "card",
    active: true,
    createdAt: new Date(),
  };
  const inserted = await db.insert(cardAuthorizations).values(row).returning();
  return inserted[0] ?? (row as CardAuthorization);
}

// ─── Merchant scoping (resolveMerchantId pattern, crud119.ts:110) ─────────────

async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

// ─── tRPC router ──────────────────────────────────────────────────────────────

export const cardTokenizationRouter = router({
  /** List the caller-merchant's saved card authorizations (newest first). */
  list: protectedProcedure
    .input(z.object({
      customerEmail: z.string().email().optional(),
      activeOnly: z.boolean().default(false),
      limit: z.number().int().min(1).max(100).default(50),
    }).optional())
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      const filters = [eq(cardAuthorizations.merchantId, merchantId)];
      if (input?.customerEmail) filters.push(eq(cardAuthorizations.customerEmail, input.customerEmail));
      if (input?.activeOnly) filters.push(eq(cardAuthorizations.active, true));
      return db
        .select()
        .from(cardAuthorizations)
        .where(and(...filters))
        .orderBy(desc(cardAuthorizations.createdAt))
        .limit(input?.limit ?? 50);
    }),

  /** Fetch a single authorization by id or authorization_code (merchant-scoped). */
  fetch: protectedProcedure
    .input(z.object({
      id: z.string().optional(),
      authorizationCode: z.string().optional(),
    }).refine((v) => v.id || v.authorizationCode, { message: "id or authorizationCode required" }))
    .query(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      const cond = input.id
        ? eq(cardAuthorizations.id, input.id)
        : eq(cardAuthorizations.authorizationCode, input.authorizationCode!);
      const rows = await db
        .select()
        .from(cardAuthorizations)
        .where(and(eq(cardAuthorizations.merchantId, merchantId), cond))
        .limit(1);
      if (!rows[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Authorization not found" });
      return rows[0];
    }),

  /**
   * Deactivate an authorization (Paystack "Deactivate Authorization").
   * The card can no longer be charged via charge_authorization.
   */
  deactivate: protectedProcedure
    .input(z.object({ authorizationCode: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const db = await getDb();
      const updated = await db
        .update(cardAuthorizations)
        .set({ active: false, reusable: false })
        .where(and(
          eq(cardAuthorizations.merchantId, merchantId),
          eq(cardAuthorizations.authorizationCode, input.authorizationCode),
        ))
        .returning({ id: cardAuthorizations.id });
      if (!updated[0]) throw new TRPCError({ code: "NOT_FOUND", message: "Authorization not found" });
      return { success: true, authorizationCode: input.authorizationCode };
    }),

  /**
   * Internal: record a reusable authorization from a completed charge.
   * Used by charge paths that already run under the merchant's session.
   */
  recordAuthorization: protectedProcedure
    .input(z.object({
      customerEmail: z.string().email(),
      panFingerprint: z.string().optional(),
      bin: z.string().optional(),
      last4: z.string().optional(),
      brand: z.string().optional(),
      cardType: z.string().optional(),
      bank: z.string().optional(),
      expMonth: z.union([z.string(), z.number()]).optional(),
      expYear: z.union([z.string(), z.number()]).optional(),
      channel: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const merchantId = await resolveMerchantId(ctx.user.openId);
      return recordAuthorizationFromCharge({ ...input, merchantId });
    }),
});
