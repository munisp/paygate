/**
 * P0-d — Nigerian Compliance Pack (WHT / TIN) Router
 *
 * - validateVendorTin:     vendor TIN validation via tax-engine POST /tin/validate
 *                          (fail-closed: 'unverified' when external lookup is
 *                          unconfigured — a TIN is NEVER fabricated as valid).
 * - setVendorWhtProfile:   manual WHT override on a vendor (audit logged).
 * - computeBillWhtForBill: shared helper (imported by apBillPay) — integer-kobo
 *                          WHT computation from the vendor's WHT profile.
 * - recordWhtForBill:      insert a tax_withholding_records line for a bill.
 * - listWhtRecords:        merchant-scoped WHT lines (join ap_bills).
 * - generateWhtRemittance: aggregate unremitted period records (SELECT ... FOR
 *                          UPDATE) → wht_remittances → tax-engine /remittance.
 * - markRemitted:          platform-admin gate (pbacProcedure + DB re-check).
 * - whtSummary:            merchant dashboard aggregates.
 *
 * Conventions (IMPLEMENTATION_SPEC_MELIO.md): withIdempotency on money
 * mutations (REQUIRED idempotencyKey), merchant scoping resolved server-side,
 * auditLog after mutations, direct fetch to python services with
 * X-Internal-Key + AbortSignal.timeout (routers.ts:4270 canonical pattern).
 */
import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { router, protectedProcedure, pbacProcedure } from "../_core/trpc";
import { db, getUserByOpenId, getMerchantByOwnerId } from "../db";
import {
  apBills,
  taxWithholdingRecords,
  tinValidations,
  vendors,
  whtRemittances,
  users,
} from "../../drizzle/schema";
import { withIdempotency } from "../idempotency";
import { auditLog } from "../auditTrail";
import { logger } from "../logger";
import { ENV as env } from "../_core/env";

// ─── Service helpers ─────────────────────────────────────────────────────────

const TAX_ENGINE_URL = process.env.TAX_ENGINE_URL ?? "http://tax-engine:8100";

async function taxEnginePost(path: string, body: unknown, timeoutMs = 15000) {
  const res = await fetch(`${TAX_ENGINE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": env.internalApiKey },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(timeoutMs),
  });
  if (!res.ok) throw new Error(`tax-engine error ${res.status}: ${await res.text()}`);
  return res.json() as Promise<any>;
}

/** Resolve the caller's user row from the session (fail closed). */
async function requireCtxUser(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  return user;
}

/** Resolve the caller's merchant server-side — never trust client merchantId. */
async function resolveCtxMerchant(openId: string) {
  const user = await requireCtxUser(openId);
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "Merchant account required" });
  return merchant;
}

/** Platform-admin gate: DB re-check users.role === 'admin' (adminRouter pattern). */
async function requirePlatformAdmin(openId: string): Promise<void> {
  const [caller] = await db
    .select({ role: users.role })
    .from(users)
    .where(eq(users.openId, openId))
    .limit(1);
  if (!caller || caller.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Platform admin access required" });
  }
}

// ─── Shared WHT computation helper (imported by apBillPay P0-a) ──────────────

/**
 * Compute the WHT amount (integer kobo) withheld from a bill's subtotal for a
 * vendor. Returns applied=false + whtKobo=0 when the vendor is missing, is not
 * WHT-applicable, or has no configured rate. `whtRatePct` reports the vendor's
 * configured rate whenever one exists; callers must gate on `applied`.
 */
export async function computeBillWhtForBill(args: {
  merchantId: string;
  vendorId: string | null;
  subtotalKobo: number;
}): Promise<{ whtKobo: number; whtRatePct: number | null; applied: boolean }> {
  const { merchantId, vendorId, subtotalKobo } = args;
  const zero = { whtKobo: 0, whtRatePct: null as number | null, applied: false };
  if (!vendorId) return zero;
  if (!Number.isInteger(subtotalKobo) || subtotalKobo < 0) return zero;

  const [vendor] = await db
    .select({ isWhtApplicable: vendors.isWhtApplicable, whtRatePct: vendors.whtRatePct })
    .from(vendors)
    .where(and(eq(vendors.id, vendorId), eq(vendors.merchantId, merchantId)))
    .limit(1);

  if (!vendor || !vendor.isWhtApplicable || vendor.whtRatePct == null) return zero;

  const ratePct = Number(vendor.whtRatePct); // numeric(5,2) arrives as string
  if (!Number.isFinite(ratePct) || ratePct <= 0) return zero;

  // Integer math: convert percent → basis points, round to the nearest kobo.
  const rateBps = Math.round(ratePct * 100);
  const whtKobo = Math.round((subtotalKobo * rateBps) / 10_000);
  return { whtKobo, whtRatePct: ratePct, applied: true };
}

// ─── Router ──────────────────────────────────────────────────────────────────

const periodSchema = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, "period must be YYYY-MM");

export const taxComplianceRouter = router({
  /** Validate a vendor's TIN via tax-engine (fail-closed). */
  validateVendorTin: protectedProcedure
    .input(z.object({ vendorId: z.string().min(1) }))
    .mutation(async ({ ctx, input }) => {
      const merchant = await resolveCtxMerchant(ctx.user.openId);

      const [vendor] = await db
        .select({
          id: vendors.id,
          tin: vendors.tin,
          isWhtApplicable: vendors.isWhtApplicable,
          whtRatePct: vendors.whtRatePct,
        })
        .from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.merchantId, merchant.id)))
        .limit(1);
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });
      if (!vendor.tin) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Vendor has no TIN on record" });
      }

      // Call tax-engine POST /tin/validate. Network/service failures degrade to
      // 'unverified' — never to a fabricated 'valid'.
      let result: any;
      try {
        result = await taxEnginePost("/tin/validate", { tin: vendor.tin });
      } catch (e: any) {
        logger.error(`[taxCompliance.validateVendorTin] tax-engine unreachable: ${e.message}`);
        result = { status: "unverified", reason: "validation_service_unreachable" };
      }
      const status: "valid" | "invalid" | "unverified" =
        result?.status === "valid" || result?.status === "invalid" ? result.status : "unverified";
      const reason = typeof result?.reason === "string" ? result.reason : null;

      // Upsert tin_validations (latest validation per vendor).
      const [existing] = await db
        .select({ id: tinValidations.id })
        .from(tinValidations)
        .where(and(eq(tinValidations.subjectType, "vendor"), eq(tinValidations.subjectId, vendor.id)))
        .limit(1);
      if (existing) {
        await db
          .update(tinValidations)
          .set({
            tin: vendor.tin,
            status,
            validatedAt: new Date(),
            validatorRef: reason,
            rawResponse: result ?? null,
          })
          .where(eq(tinValidations.id, existing.id));
      } else {
        await db.insert(tinValidations).values({
          subjectType: "vendor",
          subjectId: vendor.id,
          tin: vendor.tin,
          status,
          validatedAt: new Date(),
          validatorRef: reason,
          rawResponse: result ?? null,
        });
      }

      // Only a registry-confirmed 'valid' may change the vendor WHT profile.
      let vendorUpdated = false;
      if (status === "valid" && result?.wht && typeof result.wht.applicable === "boolean") {
        const setValues: { isWhtApplicable: boolean; updatedAt: Date; whtRatePct?: string } = {
          isWhtApplicable: result.wht.applicable,
          updatedAt: new Date(),
        };
        if (typeof result.wht.rate_pct === "number" && Number.isFinite(result.wht.rate_pct)) {
          setValues.whtRatePct = String(result.wht.rate_pct);
        }
        await db
          .update(vendors)
          .set(setValues)
          .where(and(eq(vendors.id, vendor.id), eq(vendors.merchantId, merchant.id)));
        vendorUpdated = true;
      }

      await auditLog({
        merchantId: merchant.id,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "vendor.tin_validated",
        resource: "vendor",
        resourceId: vendor.id,
        metadata: { tin: vendor.tin, status, reason, vendorUpdated },
      });

      return { vendorId: vendor.id, tin: vendor.tin, status, reason, vendorUpdated };
    }),

  /** Manual WHT profile override for a vendor (audit logged). */
  setVendorWhtProfile: protectedProcedure
    .input(
      z.object({
        vendorId: z.string().min(1),
        isWhtApplicable: z.boolean(),
        whtRatePct: z.number().min(0).max(100).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const [vendor] = await db
        .select({ id: vendors.id })
        .from(vendors)
        .where(and(eq(vendors.id, input.vendorId), eq(vendors.merchantId, merchant.id)))
        .limit(1);
      if (!vendor) throw new TRPCError({ code: "NOT_FOUND", message: "Vendor not found" });

      await db
        .update(vendors)
        .set({
          isWhtApplicable: input.isWhtApplicable,
          whtRatePct: input.whtRatePct == null ? null : String(input.whtRatePct),
          updatedAt: new Date(),
        })
        .where(and(eq(vendors.id, vendor.id), eq(vendors.merchantId, merchant.id)));

      await auditLog({
        merchantId: merchant.id,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "vendor.wht_profile_set",
        resource: "vendor",
        resourceId: vendor.id,
        metadata: { isWhtApplicable: input.isWhtApplicable, whtRatePct: input.whtRatePct ?? null },
      });

      return { vendorId: vendor.id, isWhtApplicable: input.isWhtApplicable, whtRatePct: input.whtRatePct ?? null };
    }),

  /** Merchant-scoped WHT lines (join ap_bills to prove bill ownership). */
  listWhtRecords: protectedProcedure
    .input(
      z.object({
        period: periodSchema.optional(),
        limit: z.number().int().min(1).max(200).default(50),
        offset: z.number().int().min(0).default(0),
      }),
    )
    .query(async ({ ctx, input }) => {
      const merchant = await resolveCtxMerchant(ctx.user.openId);
      const conditions = [
        eq(apBills.merchantId, merchant.id),
        eq(taxWithholdingRecords.merchantId, merchant.id),
      ];
      if (input.period) conditions.push(eq(taxWithholdingRecords.period, input.period));

      const rows = await db
        .select({ record: taxWithholdingRecords, billNumber: apBills.billNumber })
        .from(taxWithholdingRecords)
        .innerJoin(apBills, eq(taxWithholdingRecords.billId, apBills.id))
        .where(and(...conditions))
        .orderBy(desc(taxWithholdingRecords.createdAt))
        .limit(input.limit)
        .offset(input.offset);

      return { records: rows, count: rows.length };
    }),

  /**
   * Record a WHT line for a bill (called by the AP bill flow after
   * computeBillWhtForBill). Merchant scoped; amounts are integer kobo.
   */
  recordWhtForBill: protectedProcedure
    .input(
      z.object({
        billId: z.string().min(1),
        vendorId: z.string().min(1).nullable().optional(),
        grossAmountKobo: z.number().int().min(0),
        taxAmountKobo: z.number().int().min(0),
        taxRatePct: z.string().max(16).optional(),
        period: periodSchema.optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await resolveCtxMerchant(ctx.user.openId);

      const [bill] = await db
        .select({ id: apBills.id, vendorId: apBills.vendorId })
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)))
        .limit(1);
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });

      const netAmountKobo = input.grossAmountKobo - input.taxAmountKobo;
      if (netAmountKobo < 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "taxAmountKobo exceeds grossAmountKobo" });
      }
      const period = input.period ?? new Date().toISOString().slice(0, 7);

      const [record] = await db
        .insert(taxWithholdingRecords)
        .values({
          merchantId: merchant.id,
          billId: bill.id,
          vendorId: input.vendorId ?? bill.vendorId ?? null,
          grossAmountKobo: input.grossAmountKobo,
          taxAmountKobo: input.taxAmountKobo,
          netAmountKobo,
          taxType: "WHT",
          taxRatePct: input.taxRatePct ?? "0",
          period,
          status: "pending",
        })
        .returning();

      await auditLog({
        merchantId: merchant.id,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "wht.record_created",
        resource: "tax_withholding_record",
        resourceId: record?.id,
        metadata: { billId: bill.id, taxAmountKobo: input.taxAmountKobo, period },
      });

      return record;
    }),

  /**
   * Aggregate this merchant's unremitted WHT records for a period into a
   * wht_remittances batch, then file it with tax-engine POST /remittance.
   * The tax-engine call is non-fatal: the remittance flips to 'filed' only on
   * success; on failure it stays 'draft' and the error is logged.
   */
  generateWhtRemittance: protectedProcedure
    .input(
      z.object({
        period: periodSchema,
        idempotencyKey: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const merchant = await resolveCtxMerchant(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        operation: "tax.wht_remittance.generate",
        requestBody: { period: input.period },
        execute: async () => {
          const remittance = await db.transaction(async (tx) => {
            const records = await tx
              .select()
              .from(taxWithholdingRecords)
              .where(
                and(
                  eq(taxWithholdingRecords.merchantId, merchant.id),
                  eq(taxWithholdingRecords.period, input.period),
                  eq(taxWithholdingRecords.status, "pending"),
                ),
              )
              .for("update");

            if (records.length === 0) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `No unremitted WHT records for period ${input.period}`,
              });
            }

            const totalWhtKobo = records.reduce((sum, r) => sum + (r.taxAmountKobo ?? 0), 0);

            const [batch] = await tx
              .insert(whtRemittances)
              .values({
                merchantId: merchant.id,
                period: input.period,
                totalWhtKobo,
                recordCount: records.length,
                status: "draft",
              })
              .returning();

            // The locked records now belong to this batch — exclude them from
            // any future aggregation.
            await tx
              .update(taxWithholdingRecords)
              .set({ status: "filed" })
              .where(
                inArray(
                  taxWithholdingRecords.id,
                  records.map((r) => r.id),
                ),
              );

            return batch;
          });

          // Non-fatal sidecall: file with the tax-engine. Success flips the
          // remittance to 'filed'; failure is logged and it stays 'draft'.
          let filed = false;
          let reference: string | null = null;
          let filingError: string | null = null;
          try {
            const resp = await taxEnginePost("/remittance", {
              merchant_id: merchant.id,
              month: input.period,
              vat_collected_kobo: 0,
              wht_withheld_kobo: remittance.totalWhtKobo,
              stamp_duty_kobo: 0,
            });
            reference = typeof resp?.payment_reference === "string" ? resp.payment_reference : null;
            await db
              .update(whtRemittances)
              .set({ status: "filed", filedAt: new Date(), reference })
              .where(eq(whtRemittances.id, remittance.id));
            filed = true;
          } catch (e: any) {
            filingError = e.message;
            logger.error(
              `[taxCompliance.generateWhtRemittance] tax-engine /remittance failed for remittance=${remittance.id}: ${e.message}`,
            );
          }

          await auditLog({
            merchantId: merchant.id,
            actorId: ctx.user.openId,
            actorName: ctx.user.name ?? "unknown",
            actorEmail: ctx.user.email ?? undefined,
            action: "wht.remittance_generated",
            resource: "wht_remittance",
            resourceId: String(remittance.id),
            metadata: { period: input.period, totalWhtKobo: remittance.totalWhtKobo, recordCount: remittance.recordCount, filed, reference },
          });

          return {
            remittanceId: remittance.id,
            period: input.period,
            totalWhtKobo: remittance.totalWhtKobo,
            recordCount: remittance.recordCount,
            status: filed ? "filed" : "draft",
            reference,
            ...(filingError ? { warning: `tax-engine filing failed: ${filingError}` } : {}),
          };
        },
      });
    }),

  /** Mark a filed remittance as remitted (platform admin only). */
  markRemitted: pbacProcedure("approve_payout")
    .input(
      z.object({
        remittanceId: z.number().int().positive(),
        reference: z.string().min(3).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      await requirePlatformAdmin(ctx.user.openId);

      const [updated] = await db
        .update(whtRemittances)
        .set({ status: "remitted", remittedAt: new Date(), reference: input.reference })
        .where(and(eq(whtRemittances.id, input.remittanceId), inArray(whtRemittances.status, ["draft", "filed"])))
        .returning();
      if (!updated) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: "Remittance not found or already remitted",
        });
      }

      await db
        .update(taxWithholdingRecords)
        .set({ status: "remitted", remittedAt: new Date() })
        .where(
          and(
            eq(taxWithholdingRecords.merchantId, updated.merchantId),
            eq(taxWithholdingRecords.period, updated.period),
            eq(taxWithholdingRecords.status, "filed"),
          ),
        );

      await auditLog({
        merchantId: updated.merchantId,
        actorId: ctx.user.openId,
        actorName: ctx.user.name ?? "unknown",
        actorEmail: ctx.user.email ?? undefined,
        action: "wht.remittance_remitted",
        resource: "wht_remittance",
        resourceId: String(updated.id),
        metadata: { reference: input.reference, period: updated.period },
      });

      return { remittanceId: updated.id, status: "remitted", reference: input.reference };
    }),

  /** Merchant dashboard aggregates for WHT exposure. */
  whtSummary: protectedProcedure.query(async ({ ctx }) => {
    const merchant = await resolveCtxMerchant(ctx.user.openId);

    const totals = await db
      .select({
        status: taxWithholdingRecords.status,
        totalKobo: sql<number>`coalesce(sum(${taxWithholdingRecords.taxAmountKobo}), 0)::int`,
        recordCount: sql<number>`count(*)::int`,
      })
      .from(taxWithholdingRecords)
      .where(eq(taxWithholdingRecords.merchantId, merchant.id))
      .groupBy(taxWithholdingRecords.status);

    const byStatus: Record<string, { totalKobo: number; recordCount: number }> = {};
    for (const row of totals) {
      byStatus[row.status ?? "unknown"] = { totalKobo: row.totalKobo, recordCount: row.recordCount };
    }

    const recentRemittances = await db
      .select()
      .from(whtRemittances)
      .where(eq(whtRemittances.merchantId, merchant.id))
      .orderBy(desc(whtRemittances.createdAt))
      .limit(12);

    return {
      pendingKobo: byStatus.pending?.totalKobo ?? 0,
      filedKobo: byStatus.filed?.totalKobo ?? 0,
      remittedKobo: byStatus.remitted?.totalKobo ?? 0,
      totalsByStatus: byStatus,
      recentRemittances,
    };
  }),
});
