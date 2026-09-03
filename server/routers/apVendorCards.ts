// server/routers/apVendorCards.ts
// P1-e Single-use virtual cards for AP vendor bills (Melio-inspired AP suite).
//
// Procedures:
//   issueVendorCard        — wallet-funded single-use vendor-locked card for an
//                            approved bill (idempotent, atomic, bridge-strict)
//   revealCardCredentials  — one-time full PAN/CVV reveal via the bridge ONLY
//                            (never from the portal DB), audited on every call
//   terminateCard          — freeze via bridge + guarded terminate (TOCTOU-safe)
//   expireSweep            — internal (X-Internal-Key or PBAC admin): terminates
//                            single-use cards idle > 30 days
//   listVendorCards        — merchant-scoped listing; credentials NEVER selected
//
// Conventions (IMPLEMENTATION_SPEC_MELIO.md §D1–D8):
// - withIdempotency on the money mutation, REQUIRED idempotencyKey min 8 chars
// - merchant identity ALWAYS resolved server-side from ctx.user.openId
// - atomic guarded wallet debit (server/routers.ts:9754 pattern) — the WHERE
//   clause enforces sufficient funds under the row lock; empty RETURNING →
//   INSUFFICIENT_FUNDS rollback
// - bridge money paths use STRICT helpers (issueVirtualCardStrict /
//   getVirtualCardCredentialsStrict) — a bridge throw rolls the wallet debit,
//   card row, payment row and bill flip back together
// - guarded atomic UPDATE ... WHERE id AND status IN (...) RETURNING (TOCTOU)
// - Kafka paygate.ap.payments (non-fatal) + auditLog() after every mutation

import { z } from "zod";
import crypto, { randomUUID } from "node:crypto";
import { eq, and, desc, gte, lt, inArray, isNull, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  apBills,
  apPayments,
  virtualCards,
  consumerWallets,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { publishEvent } from "../kafkaClient";
import { auditLog } from "../auditTrail";
import {
  issueVirtualCardStrict,
  getVirtualCardCredentialsStrict,
  freezeVirtualCardViaMiddleware,
} from "../middlewareBridge";
import { requirePermission } from "../pbac";
import { ENV as env } from "../_core/env";
import { logger } from "../logger";

// ─── Constants ────────────────────────────────────────────────────────────────

export const AP_PAYMENTS_TOPIC = "paygate.ap.payments";

/** Bills must be exactly 'approved' before a vendor card may be issued. */
const ISSUABLE_STATUS = "approved";
/** Guard set for the bill flip — a concurrent partial payment must not be overwritten silently. */
const FLIPPABLE_STATUSES = ["approved", "partially_paid"] as const;

/** Default validity when the bridge does not report an expiry: 24 months. */
const DEFAULT_CARD_VALIDITY_MONTHS = 24;

// ─── Helpers ──────────────────────────────────────────────────────────────────

/**
 * Resolve the merchant that owns the authenticated user. Merchant identity is
 * ALWAYS derived server-side — a client-supplied merchantId is never trusted.
 * (Same pattern as hostedCheckout.ts:31 / crud119.ts:110 / apBillPay.ts.)
 */
async function resolveMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return { user, merchant };
}

/** Non-fatal Kafka publish for AP payment lifecycle events. */
async function publishPaymentEvent(
  type: string,
  merchantId: string,
  billId: string,
  extra: Record<string, unknown> = {},
): Promise<void> {
  try {
    await publishEvent(
      AP_PAYMENTS_TOPIC,
      { type, merchantId, billId, at: new Date().toISOString(), ...extra },
      billId,
    );
  } catch (err) {
    logger.warn("ap_payment_event_publish_failed", {
      type, billId, error: err instanceof Error ? err.message : String(err),
    });
  }
}

type AuditCtx = { user: { openId: string; name?: string | null; email?: string | null } };

async function auditCard(
  ctx: AuditCtx,
  merchantId: string,
  action: string,
  cardId: string,
  metadata: Record<string, unknown> = {},
): Promise<void> {
  await auditLog({
    merchantId,
    actorId: ctx.user.openId,
    actorName: ctx.user.name ?? ctx.user.email ?? "unknown",
    actorEmail: ctx.user.email ?? undefined,
    action,
    resource: "virtual_card",
    resourceId: cardId,
    metadata,
  });
}

/** Constant-time internal-key check (FAILS CLOSED when INTERNAL_API_KEY unset). */
function isInternalCaller(ctx: { req?: { headers?: Record<string, unknown> } }): boolean {
  const headerKey = ctx.req?.headers?.["x-internal-key"];
  const provided = Array.isArray(headerKey) ? String(headerKey[0]) : String(headerKey ?? "");
  const expected = env.internalApiKey;
  return (
    expected.length > 0 &&
    provided.length === expected.length &&
    crypto.timingSafeEqual(Buffer.from(provided), Buffer.from(expected))
  );
}

/**
 * Card expiry for persistence: bridge-reported when present, otherwise a
 * standard 24-month validity from issuance (schema columns are NOT NULL).
 */
function resolveExpiry(issued: { expiryMonth?: number; expiryYear?: number }): {
  expiryMonth: number;
  expiryYear: number;
} {
  if (issued.expiryMonth && issued.expiryYear) {
    return { expiryMonth: issued.expiryMonth, expiryYear: issued.expiryYear };
  }
  const d = new Date();
  d.setMonth(d.getMonth() + DEFAULT_CARD_VALIDITY_MONTHS);
  return { expiryMonth: d.getMonth() + 1, expiryYear: d.getFullYear() };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const apVendorCardsRouter = router({
  /**
   * Issue a single-use, vendor-locked virtual card funding the exact remaining
   * balance of an approved bill. ONE db.transaction wraps: atomic guarded
   * merchant-wallet debit → STRICT bridge issuance → virtual_cards row →
   * ap_payments row (funding_method='vendor_card', unique reference) → guarded
   * bill flip approved→paid. ANY throw (including a bridge outage) rolls the
   * whole thing back — no stranded debits, no half-flipped bills.
   */
  issueVendorCard: protectedProcedure
    .input(z.object({
      billId: z.string().min(1),
      idempotencyKey: z.string().min(8).max(128),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, merchant } = await resolveMerchant(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        operation: "ap.vendor_card.issue",
        requestBody: { billId: input.billId },
        execute: async () => {
          const [bill] = await db
            .select()
            .from(apBills)
            .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
            .limit(1);
          if (!bill) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
          }
          if (bill.status !== ISSUABLE_STATUS) {
            throw new TRPCError({
              code: "CONFLICT",
              message: `Bill must be approved before a vendor card can be issued (current status: ${bill.status})`,
            });
          }
          const paidSoFar = bill.amountPaidKobo ?? 0;
          const remaining = bill.totalKobo - paidSoFar;
          if (remaining <= 0) {
            throw new TRPCError({ code: "CONFLICT", message: "Bill has no remaining balance" });
          }
          const currency = bill.currency ?? "NGN";
          const cardId = randomUUID();
          const reference = `svc:${bill.id}:${cardId}`;

          const outcome = await db.transaction(async (tx) => {
            // ── 1. Atomic guarded merchant wallet debit (routers.ts:9754 pattern).
            // The WHERE clause enforces sufficient funds under the row lock;
            // an empty RETURNING means INSUFFICIENT_FUNDS and rolls back.
            const [wallet] = await tx
              .select()
              .from(consumerWallets)
              .where(and(
                eq(consumerWallets.userId, user.id),
                eq(consumerWallets.currency, currency),
              ))
              .limit(1);
            if (!wallet) {
              throw new TRPCError({ code: "BAD_REQUEST", message: "Wallet not found. Please top up first." });
            }
            const debitRows = await tx
              .update(consumerWallets)
              .set({
                balanceKobo: sql`${consumerWallets.balanceKobo} - ${remaining}`,
                updatedAt: new Date(),
              })
              .where(and(
                eq(consumerWallets.id, wallet.id),
                gte(consumerWallets.balanceKobo, remaining),
              ))
              .returning({ balanceKobo: consumerWallets.balanceKobo });
            if (!debitRows[0]) {
              throw new TRPCError({
                code: "PRECONDITION_FAILED",
                message: `INSUFFICIENT_FUNDS: wallet balance below remaining bill amount. Available: ${(wallet.balanceKobo / 100).toFixed(2)} ${currency}`,
              });
            }

            // ── 2. STRICT bridge issuance — a throw here rolls the wallet
            // debit back with the transaction (never a null fallback).
            const issued = await issueVirtualCardStrict({
              cardId,
              merchantId: merchant.id,
              amountKobo: remaining,
              currency,
              singleUse: true,
              vendorId: bill.vendorId ?? null,
              label: `AP bill ${bill.billNumber ?? bill.id}`,
              issuerId: String(user.id),
            });

            // ── 3. virtual_cards row — single-use, exact authorisation, vendor-locked.
            const { expiryMonth, expiryYear } = resolveExpiry(issued);
            await tx.insert(virtualCards).values({
              id: cardId,
              tenantId: merchant.tenantId,
              merchantId: merchant.id,
              maskedPan: issued.maskedPan,
              brand: issued.brand ?? "visa",
              expiryMonth,
              expiryYear,
              currency,
              status: "active",
              balance: remaining,
              spendLimit: remaining,
              label: `AP bill ${bill.billNumber ?? bill.id}`,
              singleUse: true,
              authorizedAmountKobo: remaining,
              lockedMerchantVendorId: bill.vendorId ?? null,
            });

            // ── 4. ap_payments row — unique reference makes replays impossible.
            const [payment] = await tx
              .insert(apPayments)
              .values({
                billId: bill.id,
                merchantId: merchant.id,
                fundingMethod: "vendor_card",
                amountKobo: remaining,
                feeKobo: 0,
                status: "completed",
                reference,
                vendorCardId: cardId,
                metadata: { singleUse: true },
              })
              .returning();

            // ── 5. Guarded bill flip approved→paid (TOCTOU-safe). Empty
            // RETURNING = concurrent state change → throw → full rollback.
            const [flipped] = await tx
              .update(apBills)
              .set({
                status: "paid",
                amountPaidKobo: bill.totalKobo,
                updatedAt: new Date(),
              })
              .where(and(
                eq(apBills.id, bill.id),
                eq(apBills.merchantId, merchant.id),
                inArray(apBills.status, [...FLIPPABLE_STATUSES]),
              ))
              .returning();
            if (!flipped) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Bill status changed concurrently — card issuance rolled back",
              });
            }

            return { payment, bill: flipped, issued, expiryMonth, expiryYear };
          });

          // Non-fatal event + audit after the transaction commits.
          await publishPaymentEvent("vendor_card.issued", merchant.id, bill.id, {
            apPaymentId: outcome.payment.id,
            cardId,
            amountKobo: remaining,
            currency,
            singleUse: true,
            vendorId: bill.vendorId ?? null,
          });
          await auditCard(ctx, merchant.id, "ap.vendor_card.issued", cardId, {
            billId: bill.id,
            apPaymentId: outcome.payment.id,
            amountKobo: remaining,
            currency,
            singleUse: true,
            lockedMerchantVendorId: bill.vendorId ?? null,
          });

          return {
            card: {
              id: cardId,
              maskedPan: outcome.issued.maskedPan,
              brand: outcome.issued.brand ?? "visa",
              expiryMonth: outcome.expiryMonth,
              expiryYear: outcome.expiryYear,
              currency,
              status: "active" as const,
              singleUse: true,
              authorizedAmountKobo: remaining,
              lockedMerchantVendorId: bill.vendorId ?? null,
            },
            payment: outcome.payment,
            bill: outcome.bill,
          };
        },
      });
    }),

  /**
   * One-time secure reveal of full PAN/CVV. Credentials are ONLY ever fetched
   * from the bridge over the STRICT path — the portal DB never stores them.
   * Every call (granted or denied) is audit-logged. Terminated cards can never
   * be revealed.
   */
  revealCardCredentials: protectedProcedure
    .input(z.object({ cardId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);

      const [card] = await db
        .select({
          id: virtualCards.id,
          merchantId: virtualCards.merchantId,
          maskedPan: virtualCards.maskedPan,
          brand: virtualCards.brand,
          expiryMonth: virtualCards.expiryMonth,
          expiryYear: virtualCards.expiryYear,
          currency: virtualCards.currency,
          status: virtualCards.status,
          terminatedAt: virtualCards.terminatedAt,
        })
        .from(virtualCards)
        .where(and(eq(virtualCards.id, input.cardId), eq(virtualCards.merchantId, merchant.id)))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }
      if (card.terminatedAt || card.status === "terminated") {
        await auditCard(ctx, merchant.id, "ap.vendor_card.credentials_reveal_denied", card.id, {
          reason: "terminated",
          maskedPan: card.maskedPan,
        });
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Terminated card credentials cannot be revealed",
        });
      }

      // STRICT bridge call — throws SERVICE_UNAVAILABLE on any bridge failure.
      const creds = await getVirtualCardCredentialsStrict(card.id);

      await auditCard(ctx, merchant.id, "ap.vendor_card.credentials_revealed", card.id, {
        maskedPan: card.maskedPan,
        brand: card.brand,
      });

      return {
        cardId: card.id,
        pan: creds.pan,
        cvv: creds.cvv,
        brand: creds.brand ?? card.brand,
        expiryMonth: creds.expiryMonth ?? card.expiryMonth,
        expiryYear: creds.expiryYear ?? card.expiryYear,
        maskedPan: creds.maskedPan ?? card.maskedPan,
      };
    }),

  /**
   * Terminate a vendor card: freeze via the bridge (best-effort, safe-class) +
   * guarded UPDATE ... WHERE terminated_at IS NULL RETURNING so a double-call
   * lands on CONFLICT instead of silently re-terminating.
   */
  terminateCard: protectedProcedure
    .input(z.object({
      cardId: z.string().min(1),
      reason: z.string().min(1).max(500),
    }))
    .mutation(async ({ ctx, input }) => {
      const { user, merchant } = await resolveMerchant(ctx.user.openId);

      const [card] = await db
        .select()
        .from(virtualCards)
        .where(and(eq(virtualCards.id, input.cardId), eq(virtualCards.merchantId, merchant.id)))
        .limit(1);
      if (!card) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Card not found" });
      }

      // Freeze at the issuer/bridge first so no further authorisations clear,
      // then flip the portal row under the terminated_at IS NULL guard.
      await freezeVirtualCardViaMiddleware({
        cardId: card.id,
        merchantId: merchant.id,
        freeze: true,
        operatorId: String(user.id),
      });

      const [terminated] = await db
        .update(virtualCards)
        .set({ status: "terminated", terminatedAt: new Date(), updatedAt: new Date() })
        .where(and(
          eq(virtualCards.id, card.id),
          eq(virtualCards.merchantId, merchant.id),
          isNull(virtualCards.terminatedAt),
        ))
        .returning();
      if (!terminated) {
        throw new TRPCError({ code: "CONFLICT", message: "Card already terminated" });
      }

      await auditCard(ctx, merchant.id, "ap.vendor_card.terminated", card.id, {
        reason: input.reason,
        maskedPan: card.maskedPan,
      });

      return { card: terminated };
    }),

  /**
   * INTERNAL sweep: terminates single-use cards still active after `olderThanDays`
   * (default 30). Callable by services via the X-Internal-Key header (constant-time,
   * fail-closed) or by a platform admin holding the manage_virtual_cards PBAC grant.
   * Termination is ONE batch guarded UPDATE ... RETURNING; each terminated card is
   * then frozen via the bridge best-effort with per-card isolation.
   */
  expireSweep: publicProcedure
    .input(z.object({
      olderThanDays: z.number().int().min(1).max(365).default(30),
    }).optional())
    .mutation(async ({ ctx, input }) => {
      if (!isInternalCaller(ctx)) {
        // Fall back to an authenticated platform admin via PBAC.
        if (!ctx.user) {
          throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid internal key" });
        }
        await requirePermission(
          String(ctx.user.id),
          (ctx.user as { role?: string }).role ?? "user",
          "virtual_card" as never,
          "create",
        );
      }

      const days = input?.olderThanDays ?? 30;
      const cutoff = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
      const now = new Date();

      // Batch guarded flip — only still-active, non-terminated single-use cards
      // older than the cutoff match; RETURNING gives the exact victim set.
      const victims = await db
        .update(virtualCards)
        .set({ status: "terminated", terminatedAt: now, updatedAt: now })
        .where(and(
          eq(virtualCards.singleUse, true),
          eq(virtualCards.status, "active"),
          isNull(virtualCards.terminatedAt),
          lt(virtualCards.createdAt, cutoff),
        ))
        .returning({ id: virtualCards.id, merchantId: virtualCards.merchantId });

      // Best-effort bridge freeze per card — one bridge failure must never
      // abort the sweep for the remaining cards.
      let frozen = 0;
      let freezeFailures = 0;
      for (const victim of victims) {
        try {
          await freezeVirtualCardViaMiddleware({
            cardId: victim.id,
            merchantId: victim.merchantId,
            freeze: true,
            operatorId: "system",
          });
          frozen += 1;
        } catch (err) {
          freezeFailures += 1;
          logger.warn("ap_vendor_card_sweep_freeze_failed", {
            cardId: victim.id,
            error: err instanceof Error ? err.message : String(err),
          });
        }
      }

      await auditLog({
        merchantId: "system",
        actorId: "system",
        actorName: "expireSweep",
        action: "ap.vendor_card.expire_sweep",
        resource: "virtual_card",
        metadata: { olderThanDays: days, terminated: victims.length, frozen, freezeFailures },
      });

      return { terminated: victims.length, frozen, freezeFailures };
    }),

  /**
   * Merchant-scoped vendor-card listing. Credentials are NEVER selected —
   * only the masked PAN is ever returned (the portal DB stores no PAN/CVV).
   */
  listVendorCards: protectedProcedure
    .input(z.object({ billId: z.string().min(1).optional() }))
    .query(async ({ ctx, input }) => {
      const { merchant } = await resolveMerchant(ctx.user.openId);

      const SAFE_COLUMNS = {
        id: virtualCards.id,
        maskedPan: virtualCards.maskedPan,
        brand: virtualCards.brand,
        expiryMonth: virtualCards.expiryMonth,
        expiryYear: virtualCards.expiryYear,
        currency: virtualCards.currency,
        status: virtualCards.status,
        balance: virtualCards.balance,
        spendLimit: virtualCards.spendLimit,
        label: virtualCards.label,
        singleUse: virtualCards.singleUse,
        authorizedAmountKobo: virtualCards.authorizedAmountKobo,
        lockedMerchantVendorId: virtualCards.lockedMerchantVendorId,
        terminatedAt: virtualCards.terminatedAt,
        createdAt: virtualCards.createdAt,
      } as const;

      let cardIds: string[] | null = null;
      if (input.billId) {
        // Resolve the card set through ap_payments (vendor_card_id) so a bill
        // scoped listing can never leak another merchant's cards.
        const payments = await db
          .select({ vendorCardId: apPayments.vendorCardId })
          .from(apPayments)
          .where(and(eq(apPayments.billId, input.billId), eq(apPayments.merchantId, merchant.id)));
        cardIds = payments
          .map((p) => p.vendorCardId)
          .filter((id): id is string => Boolean(id));
        if (cardIds.length === 0) return { cards: [] };
      }

      const cards = await db
        .select(SAFE_COLUMNS)
        .from(virtualCards)
        .where(and(
          eq(virtualCards.merchantId, merchant.id),
          eq(virtualCards.singleUse, true),
          ...(cardIds ? [inArray(virtualCards.id, cardIds)] : []),
        ))
        .orderBy(desc(virtualCards.createdAt))
        .limit(200);

      return { cards };
    }),
});

// Exported for unit tests.
export const __apVendorCardsInternals = {
  resolveExpiry,
  isInternalCaller,
  AP_PAYMENTS_TOPIC,
  FLIPPABLE_STATUSES,
};
