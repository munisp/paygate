// server/routers/walletPay.ts
// Apple Pay / Google Pay wallet acceptance.
//
// Fail-loud rules (binding):
//   - verifyApplePayDomain → 503 unless Apple Pay merchant identity env is set;
//     a domain is NEVER marked 'verified' without a real verification attempt.
//   - decryptWalletToken → 503 unless WALLET_TOKEN_DECRYPT_KEY is configured;
//     no silent pass-through of opaque tokens.
//   - chargeWalletInstrument → 503 unless a card-charge rail is configured.

import { z } from "zod";
import { randomBytes, createDecipheriv } from "node:crypto";
import { eq, and, desc } from "drizzle-orm";
import { pgTable, text, boolean, timestamp, varchar } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent } from "../webhookEvents";
import { logger } from "../logger";

// ─── Local table definitions (physical schema: drizzle/0096_mandates_wallets.sql)

export const walletDomains = pgTable("wallet_domains", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  domain: text("domain").notNull(),
  provider: varchar("provider", { length: 16 }).notNull().default("apple_pay"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  verificationToken: text("verification_token"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

export const walletPaymentInstruments = pgTable("wallet_payment_instruments", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  customerEmail: text("customer_email").notNull(),
  provider: varchar("provider", { length: 16 }).notNull(),
  tokenRef: text("token_ref").notNull(),
  displayName: text("display_name"),
  active: boolean("active").notNull().default(true),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Apple Pay domain-association well-known file ───────────────────────────

export const APPLE_PAY_ASSOCIATION_PATH =
  "/.well-known/apple-developer-merchantid-domain-association";

/**
 * Build the domain-association file content for the merchant to host.
 * FAILS LOUD when APPLE_PAY_MERCHANT_ID is not configured — there is no
 * legitimate file to serve without a real merchant identity.
 */
export function buildApplePayAssociationContent(): string {
  const merchantId = process.env.APPLE_PAY_MERCHANT_ID;
  if (!merchantId) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Apple Pay not configured (APPLE_PAY_MERCHANT_ID unset); cannot produce domain-association file",
    });
  }
  return merchantId;
}

// ─── Wallet token decryption boundary ───────────────────────────────────────

export type WalletProvider = "apple_pay" | "google_pay";

export interface DecryptedWalletToken {
  provider: WalletProvider;
  panLast4: string;
  expiryMonth?: string;
  expiryYear?: string;
  cryptogram: string;
  raw: Record<string, unknown>;
}

/**
 * Decrypt an opaque wallet payment token. FAILS LOUD (503) when the decrypt
 * key is not configured; FAILS LOUD (400) on malformed ciphertext. Never
 * passes an un-decrypted token through to the card rails.
 *
 * Token envelope (platform-internal test/dev format): base64url parts
 *   iv(12B) . authTag(16B) . ciphertext
 * WALLET_TOKEN_DECRYPT_KEY is a 64-hex-char AES-256-GCM key.
 */
export function decryptWalletToken(provider: WalletProvider, token: string): DecryptedWalletToken {
  const keyHex = process.env.WALLET_TOKEN_DECRYPT_KEY;
  if (!keyHex || !/^[0-9a-fA-F]{64}$/.test(keyHex)) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Wallet token decryption not configured (WALLET_TOKEN_DECRYPT_KEY unset/invalid); refusing to process opaque wallet token",
    });
  }
  const parts = token.split(".");
  if (parts.length !== 3) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Malformed wallet token envelope (expected iv.tag.ciphertext)" });
  }
  try {
    const [iv, tag, data] = parts.map((p) => Buffer.from(p, "base64url"));
    const decipher = createDecipheriv("aes-256-gcm", Buffer.from(keyHex, "hex"), iv);
    decipher.setAuthTag(tag);
    const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
    const parsed = JSON.parse(plain) as Record<string, unknown>;
    if (typeof parsed.panLast4 !== "string" || typeof parsed.cryptogram !== "string") {
      throw new Error("missing panLast4/cryptogram");
    }
    return {
      provider,
      panLast4: parsed.panLast4,
      expiryMonth: parsed.expiryMonth as string | undefined,
      expiryYear: parsed.expiryYear as string | undefined,
      cryptogram: parsed.cryptogram,
      raw: parsed,
    };
  } catch (err) {
    throw new TRPCError({
      code: "BAD_REQUEST",
      message: `Wallet token decryption failed: ${err instanceof Error ? err.message : String(err)}`,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function nanoid(len = 12): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").toUpperCase().slice(0, len);
}

const DOMAIN_RE = /^(?=.{1,253}$)(?!-)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant.id;
}

async function emit(merchantId: string, event: string, data: Record<string, unknown>): Promise<void> {
  try {
    await dispatchWebhookEvent({
      event: event as never,
      id: `evt_${nanoid(16)}`,
      tenantId: "ten_default",
      merchantId,
      timestamp: new Date().toISOString(),
      data,
    });
  } catch (err) {
    logger.warn("wallet-pay webhook dispatch failed (non-blocking)", { err: String(err), event });
  }
}

/** Cursor = opaque base64 offset; simple, stable for created_at DESC lists. */
function encodeCursor(offset: number): string {
  return Buffer.from(JSON.stringify({ offset })).toString("base64url");
}
function decodeCursor(cursor: string | undefined): number {
  if (!cursor) return 0;
  try {
    const parsed = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
    return Number.isInteger(parsed.offset) && parsed.offset >= 0 ? parsed.offset : 0;
  } catch {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Invalid pagination cursor" });
  }
}

// ─── Router ─────────────────────────────────────────────────────────────────

export const walletPayRouter = router({
  /** Register a domain for Apple Pay web payments. */
  registerApplePayDomain: protectedProcedure
    .input(z.object({ domain: z.string().min(4).max(253) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const domain = input.domain.toLowerCase().trim();
      if (!DOMAIN_RE.test(domain)) {
        throw new TRPCError({ code: "BAD_REQUEST", message: `Invalid domain format: '${input.domain}'` });
      }
      const [existing] = await db.select().from(walletDomains)
        .where(and(eq(walletDomains.merchantId, merchantId), eq(walletDomains.domain, domain))).limit(1);
      if (existing) {
        throw new TRPCError({ code: "CONFLICT", message: `Domain '${domain}' is already registered` });
      }
      const row = {
        id: `wdom_${nanoid(18)}`,
        merchantId,
        domain,
        provider: "apple_pay",
        status: "pending",
        verificationToken: nanoid(32),
      };
      await db.insert(walletDomains).values(row).returning();
      return row;
    }),

  /** Cursor-paginated list of registered Apple Pay domains. */
  listApplePayDomains: protectedProcedure
    .input(z.object({
      cursor: z.string().optional(),
      limit: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const offset = decodeCursor(input.cursor);
      const all = await db.select().from(walletDomains)
        .where(eq(walletDomains.merchantId, merchantId))
        .orderBy(desc(walletDomains.createdAt)).limit(1000);
      const page = all.slice(offset, offset + input.limit);
      const nextOffset = offset + page.length;
      return {
        domains: page,
        nextCursor: nextOffset < all.length ? encodeCursor(nextOffset) : null,
        previousCursor: offset > 0 ? encodeCursor(Math.max(0, offset - input.limit)) : null,
      };
    }),

  deleteApplePayDomain: protectedProcedure
    .input(z.object({ domain_id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [existing] = await db.select().from(walletDomains)
        .where(and(eq(walletDomains.merchantId, merchantId), eq(walletDomains.id, input.domain_id))).limit(1);
      if (!existing) throw new TRPCError({ code: "NOT_FOUND", message: "Domain not found" });
      await db.delete(walletDomains)
        .where(and(eq(walletDomains.id, input.domain_id), eq(walletDomains.merchantId, merchantId)));
      return { deleted: true, domain: existing.domain };
    }),

  /**
   * Domain-association file data so the merchant (or our edge) can serve
   * APPLE_PAY_ASSOCIATION_PATH. Fails loud without APPLE_PAY_MERCHANT_ID.
   */
  getApplePayDomainAssociationFile: protectedProcedure
    .query(() => ({
      path: APPLE_PAY_ASSOCIATION_PATH,
      content: buildApplePayAssociationContent(),
      contentType: "text/plain",
    })),

  /**
   * Verify a registered domain with Apple. FAILS LOUD 503 when Apple Pay
   * merchant identity/env is not configured — never fabricates 'verified'.
   */
  verifyApplePayDomain: protectedProcedure
    .input(z.object({ domain_id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [domain] = await db.select().from(walletDomains)
        .where(and(eq(walletDomains.merchantId, merchantId), eq(walletDomains.id, input.domain_id))).limit(1);
      if (!domain) throw new TRPCError({ code: "NOT_FOUND", message: "Domain not found" });

      const merchantIdentifier = process.env.APPLE_PAY_MERCHANT_ID;
      const certPath = process.env.APPLE_PAY_MERCHANT_CERT_PATH;
      if (!merchantIdentifier || !certPath) {
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: "Apple Pay verification not configured (APPLE_PAY_MERCHANT_ID / APPLE_PAY_MERCHANT_CERT_PATH unset); domain left 'pending'",
        });
      }
      // Real verification attempt against Apple's domain-verification endpoint.
      let verified = false;
      try {
        const res = await fetch("https://apple-pay-gateway.apple.com/paymentservices/paymentSession", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            merchantIdentifier,
            domainNames: [domain.domain],
            displayName: process.env.APPLE_PAY_DISPLAY_NAME ?? "PayGate Merchant",
          }),
          signal: AbortSignal.timeout(10000),
        });
        verified = res.ok;
      } catch (err) {
        await db.update(walletDomains).set({ status: "failed", updatedAt: new Date() })
          .where(eq(walletDomains.id, domain.id)).returning();
        throw new TRPCError({
          code: "SERVICE_UNAVAILABLE",
          message: `Apple Pay verification request failed: ${err instanceof Error ? err.message : String(err)}`,
        });
      }
      const status = verified ? "verified" : "failed";
      await db.update(walletDomains).set({ status, updatedAt: new Date() })
        .where(eq(walletDomains.id, domain.id)).returning();
      if (!verified) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Apple rejected the domain verification request" });
      }
      await emit(merchantId, "wallet.domain.verified", { domainId: domain.id, domain: domain.domain });
      return { ...domain, status };
    }),

  /** Store a tokenized wallet instrument (opaque gateway token reference). */
  createWalletInstrument: protectedProcedure
    .input(z.object({
      customer_email: z.string().email(),
      provider: z.enum(["apple_pay", "google_pay"]),
      token_ref: z.string().min(8).max(512),
      display_name: z.string().max(64).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const row = {
        id: `wpi_${nanoid(18)}`,
        merchantId,
        customerEmail: input.customer_email,
        provider: input.provider,
        tokenRef: input.token_ref,
        displayName: input.display_name ?? null,
        active: true,
      };
      await db.insert(walletPaymentInstruments).values(row).returning();
      return row;
    }),

  /**
   * Charge a wallet instrument: decrypt the token at the boundary, then route
   * into the configured card-charge rail. FAILS LOUD when either side is
   * unconfigured.
   */
  chargeWalletInstrument: protectedProcedure
    .input(z.object({
      instrument_id: z.string().min(1),
      amount: z.number().int().positive().max(100_000_000_00),
      token: z.string().min(16),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "wallet.charge",
        requestBody: { instrument_id: input.instrument_id, amount: input.amount },
        execute: async () => {
          const [inst] = await db.select().from(walletPaymentInstruments)
            .where(and(
              eq(walletPaymentInstruments.merchantId, merchantId),
              eq(walletPaymentInstruments.id, input.instrument_id),
            )).limit(1);
          if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet instrument not found" });
          if (!inst.active) throw new TRPCError({ code: "CONFLICT", message: "Wallet instrument is deactivated" });

          const decrypted = decryptWalletToken(inst.provider as WalletProvider, input.token);

          const railUrl = process.env.CARD_CHARGE_RAIL_URL;
          if (!railUrl) {
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: "Card charge rail not configured (CARD_CHARGE_RAIL_URL unset); wallet charge cannot proceed",
            });
          }
          const reference = `WLT_${Date.now()}_${nanoid(8)}`;
          const res = await fetch(`${railUrl}/charges`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reference,
              amount_kobo: input.amount,
              currency: "NGN",
              wallet: {
                provider: decrypted.provider,
                pan_last4: decrypted.panLast4,
                expiry_month: decrypted.expiryMonth,
                expiry_year: decrypted.expiryYear,
                cryptogram: decrypted.cryptogram,
                token_ref: inst.tokenRef,
              },
            }),
            signal: AbortSignal.timeout(15000),
          });
          if (!res.ok) {
            throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Card rail rejected wallet charge (HTTP ${res.status})` });
          }
          await emit(merchantId, "wallet.charge.success", {
            instrumentId: inst.id, reference, amountKobo: input.amount, provider: inst.provider,
          });
          return { reference, status: "completed", amountKobo: input.amount, provider: inst.provider };
        },
      });
    }),

  listInstruments: protectedProcedure
    .input(z.object({
      customer_email: z.string().email().optional(),
      provider: z.enum(["apple_pay", "google_pay"]).optional(),
      active_only: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const conds = [eq(walletPaymentInstruments.merchantId, merchantId)];
      if (input.customer_email) conds.push(eq(walletPaymentInstruments.customerEmail, input.customer_email));
      if (input.provider) conds.push(eq(walletPaymentInstruments.provider, input.provider));
      if (input.active_only) conds.push(eq(walletPaymentInstruments.active, true));
      const rows = await db.select().from(walletPaymentInstruments)
        .where(and(...conds)).orderBy(desc(walletPaymentInstruments.createdAt)).limit(200);
      return { instruments: rows };
    }),

  deactivateInstrument: protectedProcedure
    .input(z.object({ instrument_id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const [inst] = await db.select().from(walletPaymentInstruments)
        .where(and(
          eq(walletPaymentInstruments.merchantId, merchantId),
          eq(walletPaymentInstruments.id, input.instrument_id),
        )).limit(1);
      if (!inst) throw new TRPCError({ code: "NOT_FOUND", message: "Wallet instrument not found" });
      if (!inst.active) throw new TRPCError({ code: "CONFLICT", message: "Wallet instrument already deactivated" });
      await db.update(walletPaymentInstruments).set({ active: false, updatedAt: new Date() })
        .where(eq(walletPaymentInstruments.id, inst.id)).returning();
      return { ...inst, active: false };
    }),
});
