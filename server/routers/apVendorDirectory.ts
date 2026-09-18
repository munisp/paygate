/**
 * apVendorDirectory.ts — Melio AP Suite P1-b
 * ─────────────────────────────────────────────────────────────────────────────
 * Rich vendor directory + vendor credits router (`apVendorDirectoryRouter`).
 *
 * Procedures:
 *   listVendors        — merchant-scoped directory with spend / credit aggregates
 *   getVendor360       — full vendor profile: bills, payments, credits, TIN, WHT
 *   createVendor       — zod-validated create; TIN capture enqueues validation
 *   updateVendor       — zod-validated update; TIN change re-enqueues validation
 *   mergeVendor        — admin merge (pbac 'approve_payout'), transactional repoint
 *   applyCreditToBill  — atomic credit→bill application (withIdempotency)
 *   autoApplyCredits   — apply all open credits oldest-first up to bill remaining
 *
 * Conventions (IMPLEMENTATION_SPEC_MELIO.md §Canonical):
 *   - merchant scoping via resolveMerchantId(ctx.user.openId) — never client input
 *   - money as bigint kobo; guarded atomic UPDATE ... WHERE ... RETURNING
 *   - withIdempotency with REQUIRED idempotencyKey (min 8) on money mutations
 *   - auditLog after mutations; Kafka paygate.ap.bills events non-fatal
 *   - TIN validation execution is owned by taxCompliance.ts (parallel agent) —
 *     here we only insert a tin_validations row (status 'unverified',
 *     validator_ref 'pending') so the compliance router picks it up.
 */

import { z } from "zod";
import { randomUUID } from "node:crypto";
import { eq, and, or, desc, asc, sql, gte, gt, ilike, inArray } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { router, protectedProcedure, pbacProcedure } from "../_core/trpc";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  vendors,
  apBills,
  apPayments,
  vendorCredits,
  tinValidations,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { auditLog, buildAuditEntry } from "../auditTrail";
import { publishEvent } from "../kafkaClient";
import { logger } from "../logger";

const AP_BILLS_TOPIC = "paygate.ap.bills";

/** Bill statuses against which a vendor credit may be applied. */
const CREDITABLE_BILL_STATUSES = ["approved", "partially_paid"] as const;

/**
 * Resolve the caller's merchant from the server-side session (never from
 * client-supplied input). Same pattern as crud119.ts / chargebackLifecycle.ts.
 */
async function resolveMerchantId(openId: string): Promise<string> {
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

/** Fetch a vendor and assert it belongs to the caller's merchant. */
async function requireOwnedVendor(db: any, merchantId: string, vendorId: string) {
  const [vendor] = await db
    .select()
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.merchantId, merchantId)))
    .limit(1);
  if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
  return vendor;
}

/** Fetch a bill and assert it belongs to the caller's merchant. */
async function requireOwnedBill(db: any, merchantId: string, billId: string) {
  const [bill] = await db
    .select()
    .from(apBills)
    .where(and(eq(apBills.id, billId), eq(apBills.merchantId, merchantId)))
    .limit(1);
  if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
  return bill;
}

/**
 * Insert an 'unverified' TIN validation request row. The compliance router
 * (taxCompliance.ts, P0-d) owns actual validation execution and flips the
 * status — we never validate inline here.
 */
async function enqueueTinValidation(db: any, vendorId: string, tin: string) {
  await db.insert(tinValidations).values({
    subjectType: "vendor",
    subjectId: vendorId,
    tin,
    status: "unverified",
    validatorRef: "pending",
  });
}

/**
 * Atomically apply `amountKobo` of `credit` to `bill` inside transaction `tx`.
 * Caller must have already ownership-checked both rows.
 * Returns the applied amount (capped by the caller before invocation).
 */
async function applyCreditInTx(
  tx: any,
  merchantId: string,
  credit: { id: number; remainingKobo: number },
  bill: { id: string; totalKobo: number },
  amountKobo: number,
  newBillPaidKobo: number,
) {
  // 1) Guarded credit decrement — fails (empty RETURNING) if a concurrent
  //    application already consumed the remaining balance.
  const newCreditRemaining = credit.remainingKobo - amountKobo;
  const [updatedCredit] = await tx
    .update(vendorCredits)
    .set({
      remainingKobo: sql`${vendorCredits.remainingKobo} - ${amountKobo}`,
      status: newCreditRemaining === 0 ? "applied" : "open",
      appliedAt: newCreditRemaining === 0 ? new Date() : null,
    })
    .where(
      and(
        eq(vendorCredits.id, credit.id),
        eq(vendorCredits.merchantId, merchantId),
        eq(vendorCredits.status, "open"),
        gte(vendorCredits.remainingKobo, amountKobo),
      ),
    )
    .returning();
  if (!updatedCredit) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Insufficient remaining credit balance (concurrent application?)",
    });
  }

  // 2) Guarded bill amount_paid increment + status recompute — only while the
  //    bill is in a creditable status (TOCTOU-safe flip pattern).
  const newStatus = newBillPaidKobo >= bill.totalKobo ? "paid" : "partially_paid";
  const [updatedBill] = await tx
    .update(apBills)
    .set({
      amountPaidKobo: sql`${apBills.amountPaidKobo} + ${amountKobo}`,
      status: newStatus,
      updatedAt: new Date(),
    })
    .where(
      and(
        eq(apBills.id, bill.id),
        eq(apBills.merchantId, merchantId),
        inArray(apBills.status, [...CREDITABLE_BILL_STATUSES]),
      ),
    )
    .returning();
  if (!updatedBill) {
    throw new TRPCError({
      code: "CONFLICT",
      message: "Bill is not in a creditable status (changed concurrently?)",
    });
  }

  // 3) Keep the maintained vendor credit-balance column in sync.
  await tx
    .update(vendors)
    .set({
      creditBalanceKobo: sql`GREATEST(${vendors.creditBalanceKobo} - ${amountKobo}, 0)`,
      updatedAt: new Date(),
    })
    .where(and(eq(vendors.id, updatedCredit.vendorId), eq(vendors.merchantId, merchantId)));

  return { updatedCredit, updatedBill, newStatus };
}

// ─── Shared zod schemas ───────────────────────────────────────────────────────

const tinSchema = z
  .string()
  .min(8)
  .max(32)
  .regex(/^[0-9A-Za-z-]+$/, "TIN must be alphanumeric (dashes allowed)");

const vendorBaseInput = {
  name: z.string().min(1).max(255),
  contactName: z.string().max(255).optional(),
  email: z.string().email().optional(),
  phone: z.string().max(64).optional(),
  address: z.string().max(2000).optional(),
  paymentTerms: z.string().max(32).optional(),
  notes: z.string().max(4000).optional(),
  tin: tinSchema.optional(),
  bankCode: z.string().max(16).optional(),
  accountNumber: z.string().max(32).optional(),
  accountName: z.string().max(255).optional(),
  whtRatePct: z.number().min(0).max(100).optional(),
};

// ─── Router ───────────────────────────────────────────────────────────────────

export const apVendorDirectoryRouter = router({
  /**
   * Merchant-scoped vendor directory with aggregate spend + open credits.
   */
  listVendors: protectedProcedure
    .input(
      z.object({
        search: z.string().max(255).optional(),
        hasOpenBalance: z.boolean().optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const conditions = [eq(vendors.merchantId, merchantId), eq(vendors.isActive, true)];
      if (input.search) {
        const term = `%${input.search}%`;
        conditions.push(
          or(ilike(vendors.name, term), ilike(vendors.contactName, term), ilike(vendors.email, term))!,
        );
      }
      if (input.hasOpenBalance) {
        conditions.push(gt(vendors.openBalanceKobo, 0));
      }

      const rows = await db
        .select()
        .from(vendors)
        .where(and(...conditions))
        .orderBy(desc(vendors.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      if (rows.length === 0) return { vendors: [], total: 0 };

      const vendorIds = rows.map((v: any) => v.id as string);

      // Lifetime spend per vendor (paid bills only).
      const spendRows = await db
        .select({
          vendorId: apBills.vendorId,
          totalSpendKobo: sql<number>`COALESCE(SUM(${apBills.totalKobo}), 0)`,
          paidBillCount: sql<number>`COUNT(*)`,
        })
        .from(apBills)
        .where(
          and(
            eq(apBills.merchantId, merchantId),
            eq(apBills.status, "paid"),
            inArray(apBills.vendorId, vendorIds),
          ),
        )
        .groupBy(apBills.vendorId);
      const spendByVendor = new Map<string, { totalSpendKobo: number; paidBillCount: number }>();
      for (const r of spendRows) {
        if (r.vendorId) {
          spendByVendor.set(r.vendorId, {
            totalSpendKobo: Number(r.totalSpendKobo),
            paidBillCount: Number(r.paidBillCount),
          });
        }
      }

      // Open vendor-credit balance per vendor (sum of remaining_kobo on open credits).
      const creditRows = await db
        .select({
          vendorId: vendorCredits.vendorId,
          openCreditKobo: sql<number>`COALESCE(SUM(${vendorCredits.remainingKobo}), 0)`,
        })
        .from(vendorCredits)
        .where(
          and(
            eq(vendorCredits.merchantId, merchantId),
            eq(vendorCredits.status, "open"),
            inArray(vendorCredits.vendorId, vendorIds),
          ),
        )
        .groupBy(vendorCredits.vendorId);
      const creditByVendor = new Map<string, number>();
      for (const r of creditRows) creditByVendor.set(r.vendorId, Number(r.openCreditKobo));

      const enriched = rows.map((v: any) => ({
        ...v,
        openBalanceKobo: Number(v.openBalanceKobo ?? 0), // maintained column
        creditBalanceKobo: Number(v.creditBalanceKobo ?? 0),
        totalSpendKobo: spendByVendor.get(v.id)?.totalSpendKobo ?? 0,
        paidBillCount: spendByVendor.get(v.id)?.paidBillCount ?? 0,
        openCreditKobo: creditByVendor.get(v.id) ?? 0,
      }));

      return { vendors: enriched, total: enriched.length };
    }),

  /**
   * Full 360° vendor profile: identity, recent bills/payments, open credits,
   * latest TIN validation and WHT profile.
   */
  getVendor360: protectedProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .query(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const vendor = await requireOwnedVendor(db, merchantId, input.vendorId);

      const recentBills = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.merchantId, merchantId), eq(apBills.vendorId, input.vendorId)))
        .orderBy(desc(apBills.createdAt))
        .limit(20);

      const recentPayments = await db
        .select({
          payment: apPayments,
          billNumber: apBills.billNumber,
          billId: apBills.id,
        })
        .from(apPayments)
        .innerJoin(apBills, eq(apPayments.billId, apBills.id))
        .where(and(eq(apPayments.merchantId, merchantId), eq(apBills.vendorId, input.vendorId)))
        .orderBy(desc(apPayments.createdAt))
        .limit(20);

      const openCredits = await db
        .select()
        .from(vendorCredits)
        .where(
          and(
            eq(vendorCredits.merchantId, merchantId),
            eq(vendorCredits.vendorId, input.vendorId),
            eq(vendorCredits.status, "open"),
          ),
        )
        .orderBy(asc(vendorCredits.createdAt));

      const [latestTin] = await db
        .select()
        .from(tinValidations)
        .where(and(eq(tinValidations.subjectType, "vendor"), eq(tinValidations.subjectId, input.vendorId)))
        .orderBy(desc(tinValidations.id))
        .limit(1);

      return {
        vendor,
        recentBills,
        recentPayments,
        openCredits,
        tinValidation: latestTin ?? null,
        whtProfile: {
          isWhtApplicable: Boolean(vendor.isWhtApplicable),
          whtRatePct: vendor.whtRatePct != null ? Number(vendor.whtRatePct) : null,
          tin: vendor.tin ?? null,
        },
      };
    }),

  /**
   * Create a vendor. When a TIN is supplied, an 'unverified' validation row is
   * enqueued — the tax compliance router owns validation execution.
   */
  createVendor: protectedProcedure
    .input(z.object(vendorBaseInput))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const id = randomUUID();

      const [vendor] = await db
        .insert(vendors)
        .values({
          id,
          merchantId,
          name: input.name,
          contactName: input.contactName ?? null,
          email: input.email ?? null,
          phone: input.phone ?? null,
          address: input.address ?? null,
          paymentTerms: input.paymentTerms ?? "net30",
          notes: input.notes ?? null,
          tin: input.tin ?? null,
          bankCode: input.bankCode ?? null,
          accountNumber: input.accountNumber ?? null,
          accountName: input.accountName ?? null,
          whtRatePct: input.whtRatePct != null ? String(input.whtRatePct) : null,
          isActive: true,
        })
        .returning();

      if (input.tin) {
        await enqueueTinValidation(db, id, input.tin);
      }

      await auditLog(
        buildAuditEntry(ctx, merchantId, "vendor.created", "vendor", id, {
          name: input.name,
          tinCaptured: Boolean(input.tin),
        }),
      );

      return { vendor };
    }),

  /**
   * Update a vendor. A changed TIN re-enqueues validation ('unverified').
   */
  updateVendor: protectedProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        name: z.string().min(1).max(255).optional(),
        contactName: z.string().max(255).optional(),
        email: z.string().email().optional(),
        phone: z.string().max(64).optional(),
        address: z.string().max(2000).optional(),
        paymentTerms: z.string().max(32).optional(),
        notes: z.string().max(4000).optional(),
        tin: tinSchema.optional(),
        bankCode: z.string().max(16).optional(),
        accountNumber: z.string().max(32).optional(),
        accountName: z.string().max(255).optional(),
        whtRatePct: z.number().min(0).max(100).optional(),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      const existing = await requireOwnedVendor(db, merchantId, input.vendorId);

      const set: Record<string, unknown> = { updatedAt: new Date() };
      if (input.name !== undefined) set.name = input.name;
      if (input.contactName !== undefined) set.contactName = input.contactName;
      if (input.email !== undefined) set.email = input.email;
      if (input.phone !== undefined) set.phone = input.phone;
      if (input.address !== undefined) set.address = input.address;
      if (input.paymentTerms !== undefined) set.paymentTerms = input.paymentTerms;
      if (input.notes !== undefined) set.notes = input.notes;
      if (input.tin !== undefined) set.tin = input.tin;
      if (input.bankCode !== undefined) set.bankCode = input.bankCode;
      if (input.accountNumber !== undefined) set.accountNumber = input.accountNumber;
      if (input.accountName !== undefined) set.accountName = input.accountName;
      if (input.whtRatePct !== undefined) set.whtRatePct = String(input.whtRatePct);

      const [vendor] = await db
        .update(vendors)
        .set(set)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.merchantId, merchantId)))
        .returning();
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });

      const tinChanged = input.tin !== undefined && input.tin !== existing.tin;
      if (tinChanged && input.tin) {
        await enqueueTinValidation(db, input.vendorId, input.tin);
      }

      await auditLog(
        buildAuditEntry(ctx, merchantId, "vendor.updated", "vendor", input.vendorId, {
          changedFields: Object.keys(set).filter((k) => k !== "updatedAt"),
          tinChanged,
        }),
      );

      return { vendor, tinValidationEnqueued: tinChanged && Boolean(input.tin) };
    }),

  /**
   * Merge source vendor into target vendor (admin / payout-approver only).
   * Transactionally repoints bills + credits, folds balances onto the target,
   * and deactivates the source.
   */
  mergeVendor: pbacProcedure("approve_payout")
    .input(
      z.object({
        sourceVendorId: z.string().min(1),
        targetVendorId: z.string().min(1),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);
      if (input.sourceVendorId === input.targetVendorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Source and target vendors must differ" });
      }
      const source = await requireOwnedVendor(db, merchantId, input.sourceVendorId);
      const target = await requireOwnedVendor(db, merchantId, input.targetVendorId);
      if (!source.isActive) {
        throw new TRPCError({ code: "CONFLICT", message: "Source vendor is already deactivated" });
      }

      const mergedCreditKobo = Number(source.creditBalanceKobo ?? 0) + Number(target.creditBalanceKobo ?? 0);
      const mergedOpenKobo = Number(source.openBalanceKobo ?? 0) + Number(target.openBalanceKobo ?? 0);

      const result = await db.transaction(async (tx: any) => {
        const billsMoved = await tx
          .update(apBills)
          .set({ vendorId: input.targetVendorId, updatedAt: new Date() })
          .where(and(eq(apBills.vendorId, input.sourceVendorId), eq(apBills.merchantId, merchantId)))
          .returning({ id: apBills.id });

        const creditsMoved = await tx
          .update(vendorCredits)
          .set({ vendorId: input.targetVendorId })
          .where(and(eq(vendorCredits.vendorId, input.sourceVendorId), eq(vendorCredits.merchantId, merchantId)))
          .returning({ id: vendorCredits.id });

        const [updatedTarget] = await tx
          .update(vendors)
          .set({
            creditBalanceKobo: mergedCreditKobo,
            openBalanceKobo: mergedOpenKobo,
            updatedAt: new Date(),
          })
          .where(and(eq(vendors.id, input.targetVendorId), eq(vendors.merchantId, merchantId)))
          .returning();

        const [deactivated] = await tx
          .update(vendors)
          .set({ isActive: false, creditBalanceKobo: 0, openBalanceKobo: 0, updatedAt: new Date() })
          .where(
            and(
              eq(vendors.id, input.sourceVendorId),
              eq(vendors.merchantId, merchantId),
              eq(vendors.isActive, true), // guarded: no double-merge
            ),
          )
          .returning();
        if (!deactivated) {
          throw new TRPCError({ code: "CONFLICT", message: "Source vendor changed concurrently — retry" });
        }

        return { billsMoved: billsMoved.length, creditsMoved: creditsMoved.length, target: updatedTarget };
      });

      await auditLog(
        buildAuditEntry(ctx, merchantId, "vendor.merged", "vendor", input.targetVendorId, {
          sourceVendorId: input.sourceVendorId,
          billsMoved: result.billsMoved,
          creditsMoved: result.creditsMoved,
          mergedCreditKobo,
          mergedOpenKobo,
        }),
      );

      return result;
    }),

  /**
   * Apply a specific amount of an open vendor credit to a bill.
   * Idempotent (REQUIRED idempotencyKey) + fully atomic guarded updates.
   */
  applyCreditToBill: protectedProcedure
    .input(
      z.object({
        creditId: z.number().int().positive(),
        billId: z.string().min(1),
        amountKobo: z.number().int().positive(),
        idempotencyKey: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId,
        operation: "ap.vendor_credit.apply",
        requestBody: input,
        execute: async () => {
          const [credit] = await db
            .select()
            .from(vendorCredits)
            .where(and(eq(vendorCredits.id, input.creditId), eq(vendorCredits.merchantId, merchantId)))
            .limit(1);
          if (!credit) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor credit not found" });
          if (credit.status !== "open") {
            throw new TRPCError({ code: "CONFLICT", message: `Credit is not open (status=${credit.status})` });
          }

          const bill = await requireOwnedBill(db, merchantId, input.billId);
          if (bill.vendorId !== credit.vendorId) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Credit and bill belong to different vendors" });
          }
          if (!CREDITABLE_BILL_STATUSES.includes(bill.status as any)) {
            throw new TRPCError({ code: "CONFLICT", message: `Bill status '${bill.status}' cannot receive credits` });
          }

          const billRemaining = Number(bill.totalKobo) - Number(bill.amountPaidKobo ?? 0);
          if (input.amountKobo > billRemaining) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Amount exceeds bill remaining (${billRemaining} kobo)`,
            });
          }

          const { updatedCredit, updatedBill, newStatus } = await db.transaction(async (tx: any) =>
            applyCreditInTx(
              tx,
              merchantId,
              { id: credit.id, remainingKobo: Number(credit.remainingKobo) },
              { id: bill.id, totalKobo: Number(bill.totalKobo) },
              input.amountKobo,
              Number(bill.amountPaidKobo ?? 0) + input.amountKobo,
            ),
          );

          await auditLog(
            buildAuditEntry(ctx, merchantId, "vendor_credit.applied", "vendor_credit", String(credit.id), {
              billId: bill.id,
              amountKobo: input.amountKobo,
              billStatus: newStatus,
            }),
          );

          try {
            await publishEvent(AP_BILLS_TOPIC, {
              type: "ap.vendor_credit.applied",
              merchantId,
              billId: bill.id,
              creditId: credit.id,
              amountKobo: input.amountKobo,
              billStatus: newStatus,
            }, bill.id);
          } catch (err: any) {
            logger.warn("ap_vendor_credit_event_failed", { error: err?.message });
          }

          return { credit: updatedCredit, bill: updatedBill, appliedKobo: input.amountKobo };
        },
      });
    }),

  /**
   * Auto-apply all open credits (oldest first) to a bill, capped at the bill's
   * remaining balance. One atomic transaction for the whole batch.
   */
  autoApplyCredits: protectedProcedure
    .input(z.object({ billId: z.string().min(1) }))
    .mutation(async ({ input, ctx }) => {
      const db = await requireDb();
      const merchantId = await resolveMerchantId(ctx.user.openId);

      const bill = await requireOwnedBill(db, merchantId, input.billId);
      if (!bill.vendorId) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bill has no vendor attached" });
      }
      if (!CREDITABLE_BILL_STATUSES.includes(bill.status as any)) {
        throw new TRPCError({ code: "CONFLICT", message: `Bill status '${bill.status}' cannot receive credits` });
      }

      const openCredits = await db
        .select()
        .from(vendorCredits)
        .where(
          and(
            eq(vendorCredits.merchantId, merchantId),
            eq(vendorCredits.vendorId, bill.vendorId),
            eq(vendorCredits.status, "open"),
            gt(vendorCredits.remainingKobo, 0),
          ),
        )
        .orderBy(asc(vendorCredits.createdAt), asc(vendorCredits.id));

      let remaining = Number(bill.totalKobo) - Number(bill.amountPaidKobo ?? 0);
      let runningPaid = Number(bill.amountPaidKobo ?? 0);
      if (remaining <= 0 || openCredits.length === 0) {
        return { billId: bill.id, appliedKobo: 0, applications: [] as Array<{ creditId: number; appliedKobo: number }>, billStatus: bill.status };
      }

      const applications: Array<{ creditId: number; appliedKobo: number }> = [];
      let finalStatus = bill.status as string;

      await db.transaction(async (tx: any) => {
        for (const credit of openCredits) {
          if (remaining <= 0) break;
          const creditRemaining = Number(credit.remainingKobo);
          if (creditRemaining <= 0) continue;
          const amount = Math.min(creditRemaining, remaining); // cap at bill remaining
          runningPaid += amount;

          const { newStatus } = await applyCreditInTx(
            tx,
            merchantId,
            { id: credit.id, remainingKobo: creditRemaining },
            { id: bill.id, totalKobo: Number(bill.totalKobo) },
            amount,
            runningPaid,
          );

          finalStatus = newStatus;
          remaining -= amount;
          applications.push({ creditId: credit.id, appliedKobo: amount });
        }
      });

      const appliedKobo = applications.reduce((s, a) => s + a.appliedKobo, 0);

      await auditLog(
        buildAuditEntry(ctx, merchantId, "vendor_credit.auto_applied", "ap_bill", bill.id, {
          applications,
          appliedKobo,
          billStatus: finalStatus,
        }),
      );

      try {
        await publishEvent(AP_BILLS_TOPIC, {
          type: "ap.vendor_credit.auto_applied",
          merchantId,
          billId: bill.id,
          appliedKobo,
          applications,
          billStatus: finalStatus,
        }, bill.id);
      } catch (err: any) {
        logger.warn("ap_vendor_credit_auto_event_failed", { error: err?.message });
      }

      return { billId: bill.id, appliedKobo, applications, billStatus: finalStatus };
    }),
});

/** Exported for unit tests. */
export const __apVendorDirectoryInternals = {
  resolveMerchantId,
  enqueueTinValidation,
  CREDITABLE_BILL_STATUSES,
};
