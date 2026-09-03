/**
 * mobileMoney.ts — Mobile Money Router
 *
 * Procedures:
 *   mobileMoney.listProviders   — list active providers (MTN MoMo, Airtel Money, M-Pesa, etc.)
 *   mobileMoney.initiateCollection — send STK push / USSD prompt to customer
 *   mobileMoney.initiateDisbursement — send money to customer wallet
 *   mobileMoney.getStatus       — poll transaction status
 *   mobileMoney.list            — paginated transaction history
 *   mobileMoney.stats           — summary stats per provider
 *   mobileMoney.webhook         — receive provider webhook (public)
 */

import { z } from "zod";
import { randomBytes, createHmac } from "node:crypto";
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { creditWalletViaMiddleware, debitWalletViaMiddleware } from "../middlewareBridge";
import { timingSafeStringEqual } from "../securityUtils";
import { mobileMoneyTransactions, mobileMoneyProviders } from "../../drizzle/schema";
import type { Merchant } from "../../drizzle/schema";
import { demoOrFail } from "../_core/demoData";
import { logger } from "../logger";


function genRef(prefix = "MMT"): string {
  return `${prefix}_${Date.now()}_${randomBytes(3).toString("hex").toUpperCase()}`;
}

/**
 * Resolve the authenticated user's merchant server-side.
 * Client-supplied merchantId/tenantId are NEVER trusted for money movement or scoping.
 */
async function resolveMerchant(openId: string): Promise<Merchant> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "No merchant account for this user" });
  return merchant;
}

/** Verify the provider webhook shared-secret HMAC (fail closed when unset). */
function verifyWebhookSignature(canonicalPayload: string, signature: string | undefined): void {
  const secret = process.env.MOBILE_MONEY_WEBHOOK_SECRET;
  if (!secret) {
    // Fail closed — without a configured secret no webhook can be authenticated.
    throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "MOBILE_MONEY_WEBHOOK_SECRET is not configured" });
  }
  if (!signature) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Missing webhook signature" });
  }
  const expected = createHmac("sha256", secret).update(canonicalPayload).digest("hex");
  if (!timingSafeStringEqual(expected, signature)) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "Invalid webhook signature" });
  }
}

/**
 * Defined mobile-money state machine.
 * Terminal states (successful | failed | expired | cancelled) accept no transitions —
 * replays of the same final status are idempotent no-ops handled by the caller.
 */
const MM_ALLOWED_TRANSITIONS: Record<string, string[]> = {
  pending: ["processing", "successful", "failed", "expired", "cancelled"],
  processing: ["successful", "failed"],
};
const MM_FINAL_STATUSES = new Set(["successful", "failed", "expired", "cancelled"]);

async function publishKafka(topic: string, payload: Record<string, unknown>) {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return;
  try {
    await fetch(`${url}/kafka/publish`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
      body: JSON.stringify({ topic, payload }),
      signal: AbortSignal.timeout(3000),
    });
  } catch { /* non-blocking */ }
}

/**
 * Call the Go middleware bridge to initiate a mobile money transaction.
 * Falls back gracefully if bridge is unavailable.
 */
async function callMobileMoneyBridge(action: "collection" | "disbursement", opts: {
  providerCode: string;
  msisdn: string;
  amountKobo: number;
  currency: string;
  reference: string;
  merchantId: string;
  description?: string;
}): Promise<{ externalReference: string; status: string; ussdCode?: string } | null> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  // R4 F1 (spec #3/#13): NEVER fabricate an EXT_* provider reference when the
  // provider cannot be reached — a phantom external reference could later be
  // "confirmed" and credit a real wallet for money that never moved. Fail
  // loud (SERVICE_UNAVAILABLE) unless the explicit simulation switch is on.
  const simPayload = () => ({ externalReference: `SIM_${genRef()}`, status: "pending" });
  if (!url) {
    return demoOrFail(simPayload(), "mobile-money bridge (MIDDLEWARE_BRIDGE_URL unset)");
  }
  try {
    const res = await fetch(`${url}/mobile-money/${action}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "",
      },
      body: JSON.stringify(opts),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      return demoOrFail(simPayload(), `mobile-money bridge HTTP ${res.status} (${action})`);
    }
    const body = await res.json() as { externalReference?: string; status?: string; ussdCode?: string };
    if (!body || typeof body.externalReference !== "string" || typeof body.status !== "string") {
      return demoOrFail(simPayload(), `mobile-money bridge malformed response (${action})`);
    }
    return body as { externalReference: string; status: string; ussdCode?: string };
  } catch (err) {
    if (err instanceof TRPCError) throw err; // demoOrFail already failed loud
    return demoOrFail(simPayload(), `mobile-money bridge unreachable (${action}: ${err instanceof Error ? err.message : String(err)})`);
  }
}

async function pollMobileMoneyBridge(providerCode: string, externalReference: string): Promise<{ status: string; providerStatus?: string } | null> {
  const url = process.env.MIDDLEWARE_BRIDGE_URL;
  if (!url) return null;
  try {
    const res = await fetch(`${url}/mobile-money/status`, {
      method: "POST",
      headers: { "Content-Type": "application/json", "X-Internal-Key": process.env.MIDDLEWARE_INTERNAL_KEY ?? "" },
      body: JSON.stringify({ providerCode, externalReference }),
      signal: AbortSignal.timeout(10000),
    });
    if (!res.ok) return null;
    return await res.json() as { status: string; providerStatus?: string };
  } catch { return null; }
}

// Seed providers list (used when DB is empty)
const SEED_PROVIDERS = [
  { code: "mtn_momo", name: "MTN Mobile Money", country: "NG", currency: "NGN", supportsCollection: true, supportsDisbursement: true },
  { code: "airtel_money", name: "Airtel Money", country: "NG", currency: "NGN", supportsCollection: true, supportsDisbursement: true },
  { code: "mpesa_ke", name: "M-Pesa Kenya", country: "KE", currency: "KES", supportsCollection: true, supportsDisbursement: true },
  { code: "mtn_momo_gh", name: "MTN MoMo Ghana", country: "GH", currency: "GHS", supportsCollection: true, supportsDisbursement: true },
  { code: "vodafone_cash", name: "Vodafone Cash", country: "GH", currency: "GHS", supportsCollection: true, supportsDisbursement: false },
  { code: "airtel_money_ke", name: "Airtel Money Kenya", country: "KE", currency: "KES", supportsCollection: true, supportsDisbursement: true },
  { code: "mtn_momo_ug", name: "MTN MoMo Uganda", country: "UG", currency: "UGX", supportsCollection: true, supportsDisbursement: true },
  { code: "airtel_money_tz", name: "Airtel Money Tanzania", country: "TZ", currency: "TZS", supportsCollection: true, supportsDisbursement: true },
];

export const mobileMoneyRouter = router({

  // ── List providers ──────────────────────────────────────────────────────────
  listProviders: protectedProcedure
    .input(z.object({
      country: z.string().length(2).optional(),
      type: z.enum(["collection", "disbursement"]).optional(),
    }))
    .query(async ({ input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const rows = await db.select().from(mobileMoneyProviders)
        .where(and(
          eq(mobileMoneyProviders.isActive, true),
          ...(input.country ? [eq(mobileMoneyProviders.country, input.country.toUpperCase())] : []),
          ...(input.type === "collection" ? [eq(mobileMoneyProviders.supportsCollection, true)] : []),
          ...(input.type === "disbursement" ? [eq(mobileMoneyProviders.supportsDisbursement, true)] : []),
        ))
        .orderBy(mobileMoneyProviders.country, mobileMoneyProviders.name);

      // If no providers seeded yet, return the static list
      if (rows.length === 0) return SEED_PROVIDERS;
      return rows;
    }),

  // ── Initiate collection (customer pays merchant) ────────────────────────────
  initiateCollection: protectedProcedure
    .input(z.object({
      // Ignored for money movement/scoping — merchant is resolved server-side from ctx.user.
      merchantId: z.string().optional(),
      tenantId: z.string().optional(),
      providerCode: z.string(),
      customerMsisdn: z.string().min(10).max(15),
      customerName: z.string().optional(),
      amountKobo: z.number().int().positive(),
      currency: z.string().length(3),
      description: z.string().max(200).optional(),
      // Idempotency: unique client reference per transaction — a retry returns the existing row.
      clientReference: z.string().min(4).max(100).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const merchant = await resolveMerchant(ctx.user.openId);
      const merchantId = merchant.id;
      const tenantId = merchant.tenantId;
      const reference = input.clientReference ? `MMC_${input.clientReference}` : genRef("MMC");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // Call bridge
      const bridgeResult = await callMobileMoneyBridge("collection", {
        providerCode: input.providerCode,
        msisdn: input.customerMsisdn,
        amountKobo: input.amountKobo,
        currency: input.currency,
        reference,
        merchantId,
        description: input.description,
      });

      let txn;
      try {
        [txn] = await db.insert(mobileMoneyTransactions).values({
          merchantId,
          tenantId,
          providerCode: input.providerCode,
          type: "collection",
          reference,
          externalReference: bridgeResult?.externalReference ?? null,
          customerMsisdn: input.customerMsisdn,
          customerName: input.customerName ?? null,
          amountKobo: input.amountKobo,
          currency: input.currency,
          status: bridgeResult?.status ?? "pending",
          ussdCode: bridgeResult?.ussdCode ?? null,
          paymentPromptSentAt: new Date(),
          expiresAt,
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        }).returning();
      } catch (err: any) {
        // Unique-violation on reference → idempotent replay of an earlier attempt.
        if (err?.code === "23505") {
          const [existing] = await db.select().from(mobileMoneyTransactions)
            .where(eq(mobileMoneyTransactions.reference, reference));
          if (existing) {
            if (existing.merchantId !== merchantId) {
              throw new TRPCError({ code: "CONFLICT", message: "clientReference already used by another merchant" });
            }
            return { ...existing, idempotentReplay: true };
          }
        }
        throw err;
      }

      await publishKafka("paygate.mobile_money.collection_initiated", {
        txnId: txn.id, reference, merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.customerMsisdn,
        timestamp: new Date().toISOString(),
      });

      // NO wallet credit here — a collection is only credited in the webhook
      // handler once the provider confirms the customer actually paid.

      return txn;
    }),

  // ── Initiate disbursement (merchant pays customer) ──────────────────────────
  initiateDisbursement: protectedProcedure
    .input(z.object({
      // Ignored for money movement/scoping — merchant is resolved server-side from ctx.user.
      merchantId: z.string().optional(),
      tenantId: z.string().optional(),
      providerCode: z.string(),
      recipientMsisdn: z.string().min(10).max(15),
      recipientName: z.string().optional(),
      amountKobo: z.number().int().positive(),
      currency: z.string().length(3),
      description: z.string().max(200).optional(),
      // Idempotency: unique client reference per transaction — a retry returns the existing row.
      clientReference: z.string().min(4).max(100).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const merchant = await resolveMerchant(ctx.user.openId);
      const merchantId = merchant.id;
      const tenantId = merchant.tenantId;
      const reference = input.clientReference ? `MMD_${input.clientReference}` : genRef("MMD");

      // S15b: REORDERED money flow. Previously the provider bridge was called
      // BEFORE the local claim/debit — two concurrent calls with the same
      // clientReference both reached the provider (double disbursement).
      // Now: (1) claim the unique reference FIRST (the insert IS the dedupe —
      // the unique index on mobileMoneyTransactions.reference serializes
      // concurrent same-reference attempts; the SELECT below is a fast-path
      // replay check, the 23505 catch is the race-safe path), (2) debit the
      // wallet, (3) only then call the provider bridge, with an honest
      // compensating credit if the bridge fails after the debit.
      if (input.clientReference) {
        const [prior] = await db.select().from(mobileMoneyTransactions)
          .where(eq(mobileMoneyTransactions.reference, reference));
        if (prior) {
          if (prior.merchantId !== merchantId) {
            throw new TRPCError({ code: "CONFLICT", message: "clientReference already used by another merchant" });
          }
          return { ...prior, idempotentReplay: true };
        }
      }

      let txn;
      try {
        [txn] = await db.insert(mobileMoneyTransactions).values({
          merchantId,
          tenantId,
          providerCode: input.providerCode,
          type: "disbursement",
          reference,
          customerMsisdn: input.recipientMsisdn,
          customerName: input.recipientName ?? null,
          amountKobo: input.amountKobo,
          currency: input.currency,
          status: "pending",
          metadata: input.metadata ? JSON.stringify(input.metadata) : null,
        }).returning();
      } catch (err: any) {
        // Unique-violation on reference → idempotent replay of an earlier attempt.
        if (err?.code === "23505") {
          const [existing] = await db.select().from(mobileMoneyTransactions)
            .where(eq(mobileMoneyTransactions.reference, reference));
          if (existing) {
            if (existing.merchantId !== merchantId) {
              throw new TRPCError({ code: "CONFLICT", message: "clientReference already used by another merchant" });
            }
            return { ...existing, idempotentReplay: true };
          }
        }
        throw err;
      }

      // Guarded debit at the middleware boundary (Permify wallet:debit check +
      // TigerBeetle insufficient-funds rejection) — AWAITED and fail-loud,
      // BEFORE the provider bridge is called. A silent catch here would pay
      // out money that was never debited.
      try {
        await debitWalletViaMiddleware({
          walletId: `wallet_${merchantId}`,
          userId: merchantId,
          amount: input.amountKobo,
          currency: input.currency,
          reference: reference,
          description: `Mobile Money Disbursement to ${input.recipientMsisdn}`,
        });
      } catch (err: any) {
        // Compensate the local record so the transaction cannot later be
        // completed by a webhook against a debit that never happened.
        await db.update(mobileMoneyTransactions)
          .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() } as any)
          .where(eq(mobileMoneyTransactions.id, txn.id));
        throw err instanceof TRPCError
          ? err
          : new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `Wallet debit failed — disbursement aborted: ${err?.message ?? "unknown error"}` });
      }

      // Debit committed — NOW call the provider bridge. On bridge failure,
      // compensate honestly: credit the wallet back and mark the txn failed.
      let bridgeResult;
      try {
        bridgeResult = await callMobileMoneyBridge("disbursement", {
          providerCode: input.providerCode,
          msisdn: input.recipientMsisdn,
          amountKobo: input.amountKobo,
          currency: input.currency,
          reference,
          merchantId,
          description: input.description,
        });
      } catch (bridgeErr: any) {
        try {
          await creditWalletViaMiddleware({
            walletId: `wallet_${merchantId}`,
            userId: merchantId,
            amount: input.amountKobo,
            currency: input.currency,
            reference: `${reference}_REVERSAL`,
            description: `Disbursement reversal (provider bridge failed) for ${input.recipientMsisdn}`,
          });
        } catch (creditErr: any) {
          logger.error("[mobileMoney] RECONCILIATION REQUIRED: disbursement debit committed but provider bridge failed AND the compensating credit also failed", {
            reference, merchantId, amountKobo: input.amountKobo, currency: input.currency,
            bridgeError: bridgeErr?.message ?? String(bridgeErr),
            creditError: creditErr?.message ?? String(creditErr),
          });
        }
        await db.update(mobileMoneyTransactions)
          .set({ status: "failed", completedAt: new Date(), updatedAt: new Date() } as any)
          .where(eq(mobileMoneyTransactions.id, txn.id));
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Disbursement provider unavailable — wallet debit was reversed: ${bridgeErr?.message ?? "unknown error"}` });
      }

      // Record the provider's external reference / status on the claimed row.
      if (bridgeResult?.externalReference || bridgeResult?.status) {
        await db.update(mobileMoneyTransactions)
          .set({
            externalReference: bridgeResult?.externalReference ?? null,
            status: bridgeResult?.status ?? "pending",
            updatedAt: new Date(),
          } as any)
          .where(eq(mobileMoneyTransactions.id, txn.id));
        txn = { ...txn, externalReference: bridgeResult?.externalReference ?? null, status: bridgeResult?.status ?? txn.status };
      }

      await publishKafka("paygate.mobile_money.disbursement_initiated", {
        txnId: txn.id, reference, merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.recipientMsisdn,
        timestamp: new Date().toISOString(),
      });

      return txn;
    }),

  // ── Poll status ─────────────────────────────────────────────────────────────
  getStatus: protectedProcedure
    .input(z.object({ id: z.string(), merchantId: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const merchant = await resolveMerchant(ctx.user.openId);
      const [txn] = await db.select().from(mobileMoneyTransactions)
        .where(and(eq(mobileMoneyTransactions.id, parseInt(input.id)), eq(mobileMoneyTransactions.merchantId, merchant.id)));
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });

      // Poll bridge if still pending
      if (txn.status === "pending" || txn.status === "processing") {
        if (txn.externalReference) {
          const bridgeStatus = await pollMobileMoneyBridge(txn.providerCode, txn.externalReference);
          if (bridgeStatus && bridgeStatus.status !== txn.status) {
            const newStatus = bridgeStatus.status as typeof txn.status;
            // Final money states (successful/failed) are applied ONLY by the
            // authenticated webhook, which performs the wallet credit /
            // compensating re-credit. An unauthenticated poll must never
            // finalize a transaction — that would strand the wallet effects.
            if (MM_FINAL_STATUSES.has(newStatus as string)) {
              return txn;
            }
            const updates: Partial<typeof mobileMoneyTransactions.$inferInsert> = {
              status: newStatus as any,
              updatedAt: new Date(),
            };
            if (newStatus === "successful" as any || newStatus === "failed" as any) {
              updates.completedAt = new Date();
            }
            await db.update(mobileMoneyTransactions).set(updates)
              .where(eq(mobileMoneyTransactions.id, txn.id));
            return { ...txn, ...updates };
          }
        }
      }
      return txn;
    }),

  // ── List transactions ───────────────────────────────────────────────────────
  list: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(), // ignored — resolved server-side
      providerCode: z.string().optional(),
      type: z.enum(["collection", "disbursement"]).optional(),
      status: z.enum(["pending", "processing", "successful", "failed", "expired", "cancelled"]).optional(),
      days: z.number().int().min(1).max(365).default(30),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const merchant = await resolveMerchant(ctx.user.openId);
      const offset = (input.page - 1) * input.pageSize;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions: any[] = [
        eq(mobileMoneyTransactions.merchantId, merchant.id),
        gte(mobileMoneyTransactions.createdAt, since),
      ];
      if (input.providerCode) conditions.push(eq(mobileMoneyTransactions.providerCode, input.providerCode));
      if (input.type) conditions.push(eq(mobileMoneyTransactions.type, input.type));
      if (input.status) conditions.push(eq(mobileMoneyTransactions.status, input.status));

      const [rows, [{ total }]] = await Promise.all([
        db.select().from(mobileMoneyTransactions).where(and(...conditions))
          .orderBy(desc(mobileMoneyTransactions.createdAt)).limit(input.pageSize).offset(offset),
        db.select({ total: sql<number>`cast(count(*) as int)` }).from(mobileMoneyTransactions).where(and(...conditions)),
      ]);
      return { transactions: rows, total, page: input.page, pageSize: input.pageSize };
    }),

  // ── Stats per provider ──────────────────────────────────────────────────────
  stats: protectedProcedure
    .input(z.object({
      merchantId: z.string().optional(), // ignored — resolved server-side
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const merchant = await resolveMerchant(ctx.user.openId);
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const rows = await db.select({
        providerCode: mobileMoneyTransactions.providerCode,
        type: mobileMoneyTransactions.type,
        status: mobileMoneyTransactions.status,
        cnt: sql<number>`cast(count(*) as int)`,
        totalKobo: sql<number>`cast(coalesce(sum(amount_kobo), 0) as bigint)`,
      })
        .from(mobileMoneyTransactions)
        .where(and(
          eq(mobileMoneyTransactions.merchantId, merchant.id),
          gte(mobileMoneyTransactions.createdAt, since),
        ))
        .groupBy(
          mobileMoneyTransactions.providerCode,
          mobileMoneyTransactions.type,
          mobileMoneyTransactions.status,
        );

      return { stats: rows, days: input.days };
    }),

  // ── Webhook receiver (called by provider) ───────────────────────────────────
  // Authenticated by a shared-secret HMAC-SHA256 signature over the canonical
  // payload "<providerCode>:<externalReference>:<status>", sent either in the
  // `x-webhook-signature` (or `x-signature`) header or the `signature` field.
  // Fails closed when MOBILE_MONEY_WEBHOOK_SECRET is unset.
  webhook: publicProcedure
    .input(z.object({
      providerCode: z.string(),
      externalReference: z.string(),
      status: z.string(),
      signature: z.string().optional(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = (await getDb())!;
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "Database unavailable" });
      const headers = (ctx.req?.headers ?? {}) as Record<string, string | string[] | undefined>;
      const headerSig = headers["x-webhook-signature"] ?? headers["x-signature"];
      const signature = (Array.isArray(headerSig) ? headerSig[0] : headerSig) ?? input.signature;
      verifyWebhookSignature(`${input.providerCode}:${input.externalReference}:${input.status}`, signature);

      const [txn] = await db.select().from(mobileMoneyTransactions)
        .where(eq(mobileMoneyTransactions.externalReference, input.externalReference));

      if (!txn) return { ok: true, message: "Unknown reference — ignored" };

      const normalizedStatus = (() => {
        const s = input.status.toLowerCase();
        if (["success", "successful", "completed", "paid"].includes(s)) return "successful";
        if (["failed", "failure", "rejected", "cancelled"].includes(s)) return "failed";
        if (["processing", "pending"].includes(s)) return "processing";
        return "pending";
      })();

      // Idempotency / state-machine guard: an already-final transaction is never
      // mutated again — return current state with no side effects (no double
      // credit, no double refund, no duplicate events).
      if (MM_FINAL_STATUSES.has(txn.status)) {
        return { ok: true, status: txn.status, idempotent: true };
      }
      if (!MM_ALLOWED_TRANSITIONS[txn.status]?.includes(normalizedStatus)) {
        return { ok: true, status: txn.status, ignored: `Transition ${txn.status} -> ${normalizedStatus} not allowed` };
      }

      // R4 F1/F4 (mutualFund.redeem pattern): claim the transition with a
      // GUARDED status flip FIRST — the eq(status, txn.status) predicate means
      // exactly one concurrent webhook delivery wins the flip; losers no-op.
      // The money leg (external middleware call, cannot join the DB tx) then
      // runs AWAITED; on failure a compensating flip-back restores the prior
      // status so the provider's retry can complete the transaction
      // idempotently. This kills the credit-before-flip double-credit race.
      const flipped = await db.update(mobileMoneyTransactions).set({
        status: normalizedStatus as any,
        ...(["successful", "failed"].includes(normalizedStatus) ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      }).where(and(
        eq(mobileMoneyTransactions.id, txn.id),
        eq(mobileMoneyTransactions.status, txn.status),
      )).returning({ id: mobileMoneyTransactions.id });

      if (flipped.length === 0) {
        // Lost the race — a concurrent delivery already transitioned this row.
        return { ok: true, status: txn.status, idempotent: true };
      }

      // Money effects — AWAITED and fail-loud, with compensation on failure.
      try {
        if (txn.type === "collection" && normalizedStatus === "successful") {
          // Customer paid — credit the merchant wallet (merchantId taken from the
          // server-side transaction row, never from the webhook payload).
          await creditWalletViaMiddleware({
            walletId: `wallet_${txn.merchantId}`,
            userId: txn.merchantId,
            amount: txn.amountKobo,
            currency: txn.currency,
            reference: txn.reference,
            description: `Mobile Money Collection from ${txn.customerMsisdn ?? "customer"}`,
          });
        } else if (txn.type === "disbursement" && normalizedStatus === "failed") {
          // Provider failed the payout — compensating re-credit of the debit made
          // at initiation.
          await creditWalletViaMiddleware({
            walletId: `wallet_${txn.merchantId}`,
            userId: txn.merchantId,
            amount: txn.amountKobo,
            currency: txn.currency,
            reference: `${txn.reference}_COMP`,
            description: `Compensating refund for failed Mobile Money Disbursement ${txn.reference}`,
          });
        }
      } catch (moneyErr) {
        // Compensating flip-back so a provider webhook retry can complete the
        // transaction (and its money leg) idempotently.
        await db.update(mobileMoneyTransactions)
          .set({ status: txn.status as any, completedAt: null, updatedAt: new Date() })
          .where(and(
            eq(mobileMoneyTransactions.id, txn.id),
            eq(mobileMoneyTransactions.status, normalizedStatus as any),
          ));
        throw moneyErr;
      }

      await publishKafka(`paygate.mobile_money.${normalizedStatus}`, {
        txnId: txn.id, reference: txn.reference, externalReference: input.externalReference,
        merchantId: txn.merchantId, providerCode: input.providerCode,
        amountKobo: txn.amountKobo, currency: txn.currency,
        status: normalizedStatus, timestamp: new Date().toISOString(),
      });

      return { ok: true };
    }),
});
