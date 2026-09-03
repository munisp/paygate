// server/routers/directDebit.ts
// Direct-debit (e-mandate) authorizations — Paystack NG parity plus pause/resume,
// expiry listing and bulk activation.
//
// Money rules (binding):
//   - All amounts are bigint-kobo integers (₦50 activation = 5000 kobo).
//   - Account numbers are NEVER returned in full: only masked form + SHA-256 hash
//     are persisted; the plaintext exists only for the duration of the request.
//   - External rails (bank e-mandate debit) FAIL LOUD with 503 when unconfigured —
//     no fabricated approvals, no fake success.

import { z } from "zod";
import { randomBytes, createHash } from "node:crypto";
import { eq, and, desc, isNotNull, lte, gte } from "drizzle-orm";
import { pgTable, text, boolean, bigint as pgBigint, jsonb, timestamp, varchar } from "drizzle-orm/pg-core";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, pbacProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import { transactions, customers } from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { dispatchWebhookEvent } from "../webhookEvents";
import { logger } from "../logger";

// ─── Local table definitions ────────────────────────────────────────────────
// Defined here (not drizzle/schema.ts) to keep this wave self-contained; the
// physical schema lives in drizzle/0096_mandates_wallets.sql.

export const debitMandates = pgTable("debit_mandates", {
  id: text("id").primaryKey(),
  merchantId: text("merchant_id").notNull(),
  customerId: text("customer_id"),
  customerEmail: text("customer_email").notNull(),
  mandateReference: text("mandate_reference").notNull(),
  authorizationCode: text("authorization_code").notNull(),
  bankCode: text("bank_code"),
  accountNumberMasked: text("account_number_masked"),
  accountNumberHash: text("account_number_hash"),
  accountName: text("account_name"),
  address: jsonb("address"),
  status: varchar("status", { length: 16 }).notNull().default("pending"),
  activationChargeKobo: pgBigint("activation_charge_kobo", { mode: "number" }).notNull().default(5000),
  reusable: boolean("reusable").notNull().default(true),
  expiresAt: timestamp("expires_at"),
  approvedAt: timestamp("approved_at"),
  activatedAt: timestamp("activated_at"),
  cancelledAt: timestamp("cancelled_at"),
  createdAt: timestamp("created_at").notNull().defaultNow(),
  updatedAt: timestamp("updated_at").notNull().defaultNow(),
});

// ─── Event constants ────────────────────────────────────────────────────────

export const DIRECT_DEBIT_EVENTS = {
  AUTHORIZATION_CREATED: "direct_debit.authorization.created",
  AUTHORIZATION_ACTIVE: "direct_debit.authorization.active",
  AUTHORIZATION_DEACTIVATED: "direct_debit.authorization.deactivated",
  MANDATE_PAUSED: "direct_debit.mandate.paused",
  MANDATE_RESUMED: "direct_debit.mandate.resumed",
  DEBIT_SUCCESS: "direct_debit.debit.success",
  DEBIT_FAILED: "direct_debit.debit.failed",
} as const;

/** ₦50 refundable activation charge (kobo). */
export const ACTIVATION_CHARGE_KOBO = 5000;

// ─── Status state machine ───────────────────────────────────────────────────
// pending → approved | failed | cancelled
// approved → active | failed | cancelled
// active → paused | cancelled
// paused → active | cancelled
// cancelled / failed are terminal.
const MANDATE_TRANSITIONS: Record<string, readonly string[]> = {
  pending: ["approved", "failed", "cancelled"],
  approved: ["active", "failed", "cancelled"],
  active: ["paused", "cancelled"],
  paused: ["active", "cancelled"],
  failed: [],
  cancelled: [],
};

function assertTransition(from: string, to: string): void {
  if (!(MANDATE_TRANSITIONS[from] ?? []).includes(to)) {
    throw new TRPCError({
      code: "CONFLICT",
      message: `Illegal mandate status transition '${from}' → '${to}' (terminal states are not re-enterable)`,
    });
  }
}

// ─── Helpers ────────────────────────────────────────────────────────────────

function nanoid(len = 12): string {
  return randomBytes(Math.ceil(len / 2)).toString("hex").toUpperCase().slice(0, len);
}

/** Mask an account number, keeping only the last 4 digits. */
export function maskAccountNumber(accountNumber: string): string {
  const digits = accountNumber.replace(/\D/g, "");
  if (digits.length < 4) {
    throw new TRPCError({ code: "BAD_REQUEST", message: "Account number too short" });
  }
  return `******${digits.slice(-4)}`;
}

/** SHA-256 hash for dedup/lookup — never reversible back to the PAN. */
export function hashAccountNumber(accountNumber: string): string {
  const salt = process.env.ACCOUNT_HASH_SALT ?? "paygate-dd-v1";
  return createHash("sha256").update(`${salt}:${accountNumber.replace(/\D/g, "")}`).digest("hex");
}

/**
 * Hosted-consent URL against the platform's own hosted checkout domain. The
 * mandate stays `pending` until the bank consent webhook (markApproved) and
 * the activation debit (markActive) complete — no fabricated bank approval.
 */
export function buildHostedConsentUrl(accessCode: string, callbackUrl?: string): string {
  const base = (process.env.HOSTED_CHECKOUT_BASE_URL ?? "https://checkout.paygate.io").replace(/\/$/, "");
  const url = `${base}/direct-debit/consent/${encodeURIComponent(accessCode)}`;
  return callbackUrl ? `${url}?callback_url=${encodeURIComponent(callbackUrl)}` : url;
}

/** External e-mandate debit rail — absent means "fail loud". */
function directDebitRailUrl(): string {
  const url = process.env.DIRECT_DEBIT_RAIL_URL;
  if (!url) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Direct-debit rail not configured (DIRECT_DEBIT_RAIL_URL unset); cannot attempt bank debit",
    });
  }
  return url;
}

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
    logger.warn("direct-debit webhook dispatch failed (non-blocking)", { err: String(err), event });
  }
}

async function getMandateOrThrow(db: any, merchantId: string, where: any) {
  const [row] = await db.select().from(debitMandates)
    .where(and(eq(debitMandates.merchantId, merchantId), where)).limit(1);
  if (!row) throw new TRPCError({ code: "NOT_FOUND", message: "Mandate authorization not found" });
  return row;
}

/** Serialise a mandate for API output — masked account only, hash included. */
function publicMandate(m: any) {
  return {
    id: m.id,
    merchantId: m.merchantId,
    customerId: m.customerId ?? null,
    customerEmail: m.customerEmail,
    reference: m.mandateReference,
    authorizationCode: m.authorizationCode,
    bankCode: m.bankCode ?? null,
    accountNumberMasked: m.accountNumberMasked ?? null,
    accountName: m.accountName ?? null,
    address: m.address ?? null,
    status: m.status,
    activationChargeKobo: m.activationChargeKobo,
    reusable: m.reusable,
    expiresAt: m.expiresAt ?? null,
    approvedAt: m.approvedAt ?? null,
    activatedAt: m.activatedAt ?? null,
    cancelledAt: m.cancelledAt ?? null,
    createdAt: m.createdAt,
  };
}

// ─── Input schemas ──────────────────────────────────────────────────────────

const addressSchema = z.object({
  street: z.string().min(1),
  city: z.string().min(1),
  state: z.string().min(1),
});

const initiateSchema = z.object({
  email: z.string().email(),
  channel: z.literal("direct_debit"),
  callback_url: z.string().url().optional(),
  account: z.object({
    number: z.string().regex(/^\d{6,20}$/, "Account number must be 6-20 digits"),
    bank_code: z.string().min(1),
  }).optional(),
  address: addressSchema.optional(),
}).superRefine((v, ctx) => {
  // account + address are all-or-none (Paystack prefill parity).
  if ((v.account && !v.address) || (!v.account && v.address)) {
    ctx.addIssue({ code: z.ZodIssueCode.custom, message: "account and address must be provided together (all-or-none prefill)" });
  }
});

// ─── Router ─────────────────────────────────────────────────────────────────

export const directDebitRouter = router({
  /** Initiate a direct-debit authorization (hosted consent). */
  initiateAuthorization: protectedProcedure
    .input(initiateSchema)
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const id = `ddm_${nanoid(20)}`;
      const reference = `DD_${Date.now()}_${nanoid(8)}`;
      const accessCode = nanoid(24);
      const authorizationCode = `AUTH_DD_${nanoid(16)}`;

      // Link an existing customer record when present (by merchant + email).
      const [customer] = await db.select().from(customers)
        .where(and(eq(customers.merchantId, merchantId), eq(customers.email, input.email))).limit(1);

      const row = {
        id,
        merchantId,
        customerId: customer?.id ?? null,
        customerEmail: input.email,
        mandateReference: reference,
        authorizationCode,
        bankCode: input.account?.bank_code ?? null,
        accountNumberMasked: input.account ? maskAccountNumber(input.account.number) : null,
        accountNumberHash: input.account ? hashAccountNumber(input.account.number) : null,
        accountName: null,
        address: input.address ?? null,
        status: "pending",
        activationChargeKobo: ACTIVATION_CHARGE_KOBO,
        reusable: true,
      };
      await db.insert(debitMandates).values(row).returning();

      await emit(merchantId, DIRECT_DEBIT_EVENTS.AUTHORIZATION_CREATED, {
        mandateId: id, reference, authorizationCode, email: input.email, status: "pending",
      });

      return {
        redirect_url: buildHostedConsentUrl(accessCode, input.callback_url),
        access_code: accessCode,
        reference,
      };
    }),

  /** Verify an authorization by reference (Paystack parity). */
  verifyAuthorization: protectedProcedure
    .input(z.object({ reference: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.mandateReference, input.reference));
      return {
        reference: m.mandateReference,
        status: m.status,
        authorization_code: m.authorizationCode,
        accountNumberMasked: m.accountNumberMasked ?? null,
        bankCode: m.bankCode ?? null,
      };
    }),

  /** Bank consent webhook semantics: consent recorded → approved. (internal) */
  markApproved: pbacProcedure("initiate_transaction")
    .input(z.object({
      authorization_code: z.string().min(1),
      account_name: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
      assertTransition(m.status, "approved");
      await db.update(debitMandates)
        .set({ status: "approved", approvedAt: new Date(), accountName: input.account_name ?? m.accountName, updatedAt: new Date() })
        .where(eq(debitMandates.id, m.id)).returning();
      await emit(merchantId, DIRECT_DEBIT_EVENTS.AUTHORIZATION_CREATED, {
        mandateId: m.id, reference: m.mandateReference, authorizationCode: m.authorizationCode, status: "approved",
      });
      return publicMandate({ ...m, status: "approved", approvedAt: new Date() });
    }),

  /** Activation debit succeeded → active. (internal) */
  markActive: pbacProcedure("initiate_transaction")
    .input(z.object({ authorization_code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
      assertTransition(m.status, "active");
      await db.update(debitMandates)
        .set({ status: "active", activatedAt: new Date(), updatedAt: new Date() })
        .where(eq(debitMandates.id, m.id)).returning();
      await emit(merchantId, DIRECT_DEBIT_EVENTS.AUTHORIZATION_ACTIVE, {
        mandateId: m.id, reference: m.mandateReference, authorizationCode: m.authorizationCode, status: "active",
      });
      return publicMandate({ ...m, status: "active", activatedAt: new Date() });
    }),

  /**
   * Enqueue the refundable ₦50 activation debit via the bank rail.
   * FAILS LOUD (503) when the rail is unconfigured; status stays `approved`
   * and no success event is emitted.
   */
  activationCharge: pbacProcedure("initiate_transaction")
    .input(z.object({ authorization_id: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.id, input.authorization_id));
      if (m.status !== "approved") {
        throw new TRPCError({ code: "CONFLICT", message: `Activation charge requires status 'approved' (current: '${m.status}')` });
      }
      const rail = directDebitRailUrl(); // throws 503 when unset
      const res = await fetch(`${rail}/debits`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reference: `DDACT_${m.mandateReference}`,
          authorization_code: m.authorizationCode,
          amount_kobo: m.activationChargeKobo ?? ACTIVATION_CHARGE_KOBO,
          refundable: true,
          purpose: "mandate_activation",
        }),
        signal: AbortSignal.timeout(10000),
      });
      if (!res.ok) {
        throw new TRPCError({ code: "SERVICE_UNAVAILABLE", message: `Activation debit rail rejected the charge (HTTP ${res.status})` });
      }
      return { mandateId: m.id, status: "queued", amountKobo: m.activationChargeKobo ?? ACTIVATION_CHARGE_KOBO, refundable: true };
    }),

  /** Enqueue activation charges for every approved mandate of the given customers. */
  bulkActivationCharge: pbacProcedure("initiate_transaction")
    .input(z.object({ customer_ids: z.array(z.string().min(1)).min(1).max(500) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const results: { customerId: string; mandateId?: string; status: string; error?: string }[] = [];
      for (const customerId of input.customer_ids) {
        const [m] = await db.select().from(debitMandates)
          .where(and(
            eq(debitMandates.merchantId, merchantId),
            eq(debitMandates.customerId, customerId),
            eq(debitMandates.status, "approved"),
          ))
          .orderBy(desc(debitMandates.createdAt)).limit(1);
        if (!m) {
          results.push({ customerId, status: "skipped", error: "no approved mandate" });
          continue;
        }
        try {
          const rail = directDebitRailUrl();
          const res = await fetch(`${rail}/debits`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              reference: `DDACT_${m.mandateReference}`,
              authorization_code: m.authorizationCode,
              amount_kobo: m.activationChargeKobo ?? ACTIVATION_CHARGE_KOBO,
              refundable: true,
              purpose: "mandate_activation",
            }),
            signal: AbortSignal.timeout(10000),
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          results.push({ customerId, mandateId: m.id, status: "queued" });
        } catch (err) {
          results.push({ customerId, mandateId: m.id, status: "failed", error: err instanceof Error ? err.message : String(err) });
        }
      }
      return { results };
    }),

  /**
   * Debit an active mandate (idempotent). Creates a transaction row in
   * `processing` state, attempts the charge via the rail; when the rail is
   * unavailable the transaction is marked failed and a 503 is thrown.
   */
  debit: protectedProcedure
    .input(z.object({
      authorization_code: z.string().min(1),
      email: z.string().email(),
      amount: z.number().int().positive().max(100_000_000_00, "Maximum ₦100,000,000"),
      idempotencyKey: z.string().min(8).max(128),
      description: z.string().max(500).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "direct_debit.debit",
        requestBody: input,
        execute: async () => {
          const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
          if (m.customerEmail !== input.email) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Authorization does not belong to this customer email" });
          }
          if (m.status !== "active") {
            throw new TRPCError({ code: "CONFLICT", message: `Mandate must be 'active' to debit (current: '${m.status}')` });
          }
          if (m.expiresAt && new Date(m.expiresAt).getTime() < Date.now()) {
            throw new TRPCError({ code: "CONFLICT", message: "Mandate has expired" });
          }

          const txId = `txn_${nanoid(20)}`;
          const reference = `DDD_${Date.now()}_${nanoid(8)}`;
          const txRow = {
            id: txId,
            tenantId: "ten_default",
            merchantId,
            reference,
            amount: input.amount,
            currency: "NGN",
            status: "processing" as const,
            channel: "bank_transfer" as const,
            customerEmail: input.email,
            description: input.description ?? "Direct debit",
            metadata: { mandateId: m.id, authorizationCode: m.authorizationCode, channel: "direct_debit" },
          };
          await db.insert(transactions).values(txRow as never).returning();

          let finalStatus = "processing";
          try {
            const rail = directDebitRailUrl();
            const res = await fetch(`${rail}/debits`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ reference, authorization_code: m.authorizationCode, amount_kobo: input.amount }),
              signal: AbortSignal.timeout(15000),
            });
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            finalStatus = "completed";
          } catch (err) {
            finalStatus = "failed";
            await db.update(transactions).set({ status: "failed", updatedAt: new Date() })
              .where(eq(transactions.id, txId)).returning();
            await emit(merchantId, DIRECT_DEBIT_EVENTS.DEBIT_FAILED, {
              transactionId: txId, reference, mandateId: m.id, amountKobo: input.amount,
              error: err instanceof Error ? err.message : String(err),
            });
            throw new TRPCError({
              code: "SERVICE_UNAVAILABLE",
              message: `Direct-debit charge failed: ${err instanceof Error ? err.message : String(err)}`,
            });
          }

          await db.update(transactions).set({ status: "completed", completedAt: new Date(), updatedAt: new Date() })
            .where(eq(transactions.id, txId)).returning();
          await emit(merchantId, DIRECT_DEBIT_EVENTS.DEBIT_SUCCESS, {
            transactionId: txId, reference, mandateId: m.id, amountKobo: input.amount,
          });
          return { transactionId: txId, reference, status: finalStatus, amountKobo: input.amount };
        },
      });
    }),

  /** Deactivate (cancel) an authorization. */
  deactivate: protectedProcedure
    .input(z.object({ authorization_code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
      assertTransition(m.status, "cancelled");
      await db.update(debitMandates)
        .set({ status: "cancelled", cancelledAt: new Date(), updatedAt: new Date() })
        .where(eq(debitMandates.id, m.id)).returning();
      await emit(merchantId, DIRECT_DEBIT_EVENTS.AUTHORIZATION_DEACTIVATED, {
        mandateId: m.id, reference: m.mandateReference, authorizationCode: m.authorizationCode, status: "cancelled",
      });
      return publicMandate({ ...m, status: "cancelled", cancelledAt: new Date() });
    }),

  /** BETTER than Paystack: pause an active mandate. */
  pause: protectedProcedure
    .input(z.object({ authorization_code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
      assertTransition(m.status, "paused");
      await db.update(debitMandates).set({ status: "paused", updatedAt: new Date() })
        .where(eq(debitMandates.id, m.id)).returning();
      await emit(merchantId, DIRECT_DEBIT_EVENTS.MANDATE_PAUSED, {
        mandateId: m.id, reference: m.mandateReference, authorizationCode: m.authorizationCode,
      });
      return publicMandate({ ...m, status: "paused" });
    }),

  /** BETTER than Paystack: resume a paused mandate. */
  resume: protectedProcedure
    .input(z.object({ authorization_code: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const m = await getMandateOrThrow(db, merchantId, eq(debitMandates.authorizationCode, input.authorization_code));
      assertTransition(m.status, "active");
      await db.update(debitMandates).set({ status: "active", updatedAt: new Date() })
        .where(eq(debitMandates.id, m.id)).returning();
      await emit(merchantId, DIRECT_DEBIT_EVENTS.MANDATE_RESUMED, {
        mandateId: m.id, reference: m.mandateReference, authorizationCode: m.authorizationCode,
      });
      return publicMandate({ ...m, status: "active" });
    }),

  /** List mandate authorizations for one customer (by email). */
  listMandateAuthorizations: protectedProcedure
    .input(z.object({ customer_email: z.string().email(), limit: z.number().int().min(1).max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const rows = await db.select().from(debitMandates)
        .where(and(eq(debitMandates.merchantId, merchantId), eq(debitMandates.customerEmail, input.customer_email)))
        .orderBy(desc(debitMandates.createdAt)).limit(input.limit);
      return { authorizations: rows.map(publicMandate) };
    }),

  /** BETTER than Paystack: mandates expiring within N days. */
  listExpiring: protectedProcedure
    .input(z.object({ within_days: z.number().int().min(1).max(365).default(30) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const now = new Date();
      const horizon = new Date(now.getTime() + input.within_days * 24 * 3600 * 1000);
      const rows = await db.select().from(debitMandates)
        .where(and(
          eq(debitMandates.merchantId, merchantId),
          isNotNull(debitMandates.expiresAt),
          gte(debitMandates.expiresAt, now),
          lte(debitMandates.expiresAt, horizon),
        ))
        .orderBy(desc(debitMandates.createdAt)).limit(200);
      return { expiring: rows.map(publicMandate), withinDays: input.within_days };
    }),
});
