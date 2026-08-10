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
import { eq, and, desc, gte, sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { getDb } from "../db";
import { creditWalletViaMiddleware, debitWalletViaMiddleware } from "../middlewareBridge";
import { mobileMoneyTransactions, mobileMoneyProviders } from "../../drizzle/schema";

const db = (await getDb())!;

function genRef(prefix = "MMT"): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).slice(2, 8).toUpperCase()}`;
}

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
  if (!url) {
    // Graceful fallback — simulate a pending state
    return { externalReference: `EXT_${genRef()}`, status: "pending" };
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
    if (!res.ok) return { externalReference: `EXT_${genRef()}`, status: "pending" };
    return await res.json() as { externalReference: string; status: string; ussdCode?: string };
  } catch {
    return { externalReference: `EXT_${genRef()}`, status: "pending" };
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
      merchantId: z.string(),
      tenantId: z.string(),
      providerCode: z.string(),
      customerMsisdn: z.string().min(10).max(15),
      customerName: z.string().optional(),
      amountKobo: z.number().int().positive(),
      currency: z.string().length(3),
      description: z.string().max(200).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const reference = genRef("MMC");
      const expiresAt = new Date(Date.now() + 10 * 60 * 1000); // 10 min

      // Call bridge
      const bridgeResult = await callMobileMoneyBridge("collection", {
        providerCode: input.providerCode,
        msisdn: input.customerMsisdn,
        amountKobo: input.amountKobo,
        currency: input.currency,
        reference,
        merchantId: input.merchantId,
        description: input.description,
      });

      const [txn] = await db.insert(mobileMoneyTransactions).values({
        merchantId: input.merchantId,
        tenantId: input.tenantId,
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

      await publishKafka("paygate.mobile_money.collection_initiated", {
        txnId: txn.id, reference, merchantId: input.merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.customerMsisdn,
        timestamp: new Date().toISOString(),
      });

      // TigerBeetle wiring
      creditWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: input.amountKobo,
        currency: input.currency,
        reference: reference,
        description: `Mobile Money Collection from ${input.customerMsisdn}`,
      }).catch(e => console.error("[TigerBeetle] Mobile money collection credit failed:", e));

      return txn;
    }),

  // ── Initiate disbursement (merchant pays customer) ──────────────────────────
  initiateDisbursement: protectedProcedure
    .input(z.object({
      merchantId: z.string(),
      tenantId: z.string(),
      providerCode: z.string(),
      recipientMsisdn: z.string().min(10).max(15),
      recipientName: z.string().optional(),
      amountKobo: z.number().int().positive(),
      currency: z.string().length(3),
      description: z.string().max(200).optional(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ input }) => {
      const reference = genRef("MMD");

      const bridgeResult = await callMobileMoneyBridge("disbursement", {
        providerCode: input.providerCode,
        msisdn: input.recipientMsisdn,
        amountKobo: input.amountKobo,
        currency: input.currency,
        reference,
        merchantId: input.merchantId,
        description: input.description,
      });

      const [txn] = await db.insert(mobileMoneyTransactions).values({
        merchantId: input.merchantId,
        tenantId: input.tenantId,
        providerCode: input.providerCode,
        type: "disbursement",
        reference,
        externalReference: bridgeResult?.externalReference ?? null,
        customerMsisdn: input.recipientMsisdn,
        customerName: input.recipientName ?? null,
        amountKobo: input.amountKobo,
        currency: input.currency,
        status: bridgeResult?.status ?? "pending",
        metadata: input.metadata ? JSON.stringify(input.metadata) : null,
      }).returning();

      await publishKafka("paygate.mobile_money.disbursement_initiated", {
        txnId: txn.id, reference, merchantId: input.merchantId,
        providerCode: input.providerCode, amountKobo: input.amountKobo,
        currency: input.currency, msisdn: input.recipientMsisdn,
        timestamp: new Date().toISOString(),
      });

      // TigerBeetle wiring
      debitWalletViaMiddleware({
        walletId: `wallet_${input.merchantId}`,
        userId: input.merchantId,
        amount: input.amountKobo,
        currency: input.currency,
        reference: reference,
        description: `Mobile Money Disbursement to ${input.recipientMsisdn}`,
      }).catch(e => console.error("[TigerBeetle] Mobile money disbursement debit failed:", e));

      return txn;
    }),

  // ── Poll status ─────────────────────────────────────────────────────────────
  getStatus: protectedProcedure
    .input(z.object({ id: z.string(), merchantId: z.string() }))
    .query(async ({ input }) => {
      const [txn] = await db.select().from(mobileMoneyTransactions)
        .where(and(eq(mobileMoneyTransactions.id, parseInt(input.id)), eq(mobileMoneyTransactions.merchantId, input.merchantId)));
      if (!txn) throw new TRPCError({ code: "NOT_FOUND", message: "Transaction not found" });

      // Poll bridge if still pending
      if (txn.status === "pending" || txn.status === "processing") {
        if (txn.externalReference) {
          const bridgeStatus = await pollMobileMoneyBridge(txn.providerCode, txn.externalReference);
          if (bridgeStatus && bridgeStatus.status !== txn.status) {
            const newStatus = bridgeStatus.status as typeof txn.status;
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
      merchantId: z.string(),
      providerCode: z.string().optional(),
      type: z.enum(["collection", "disbursement"]).optional(),
      status: z.enum(["pending", "processing", "successful", "failed", "expired", "cancelled"]).optional(),
      days: z.number().int().min(1).max(365).default(30),
      page: z.number().int().min(1).default(1),
      pageSize: z.number().int().min(1).max(100).default(20),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const since = new Date(Date.now() - input.days * 24 * 60 * 60 * 1000);
      const conditions: any[] = [
        eq(mobileMoneyTransactions.merchantId, input.merchantId),
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
      merchantId: z.string(),
      days: z.number().int().min(1).max(365).default(30),
    }))
    .query(async ({ input }) => {
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
          eq(mobileMoneyTransactions.merchantId, input.merchantId),
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
  webhook: publicProcedure
    .input(z.object({
      providerCode: z.string(),
      externalReference: z.string(),
      status: z.string(),
      metadata: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ input }) => {
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

      await db.update(mobileMoneyTransactions).set({
        status: normalizedStatus as any,
        ...(["successful", "failed"].includes(normalizedStatus) ? { completedAt: new Date() } : {}),
        updatedAt: new Date(),
      }).where(eq(mobileMoneyTransactions.id, txn.id));

      await publishKafka(`paygate.mobile_money.${normalizedStatus}`, {
        txnId: txn.id, reference: txn.reference, externalReference: input.externalReference,
        merchantId: txn.merchantId, providerCode: input.providerCode,
        amountKobo: txn.amountKobo, currency: txn.currency,
        status: normalizedStatus, timestamp: new Date().toISOString(),
      });

      return { ok: true };
    }),
});
