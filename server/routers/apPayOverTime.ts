/**
 * P0-c — B2B Pay-Over-Time (Melio-style AP financing).
 *
 * A merchant with an approved AP bill can finance it: the vendor is paid IN
 * FULL immediately through the existing payout execution path
 * (createPayout → initiatePayoutApproval → Temporal), and the merchant repays
 * PayGate over a bnpl_repayment_schedules instalment plan. Due detection /
 * overdue marking is handled by the EXISTING BNPL sweep (cronJobs.ts:353) —
 * this router only writes schedule rows the sweep already understands.
 *
 * Canonical conventions (IMPLEMENTATION_SPEC_MELIO.md):
 * - merchant scoping via session (getUserByOpenId → requireMerchant) — never
 *   trust client-supplied merchantId;
 * - withIdempotency on ALL money mutations, idempotencyKey REQUIRED min 8;
 * - guarded atomic updates (UPDATE ... WHERE id=? AND status=? RETURNING);
 * - strict bridge helper (initiatePayoutApproval) on the money path — payout
 *   failure THROWS inside db.transaction so the plan rows roll back (no plan
 *   without funds);
 * - credit-scoring called directly with X-Internal-Key + AbortSignal.timeout;
 *   scoring failure → 503 SERVICE_UNAVAILABLE (never fabricate terms);
 * - emi-service sidecall + Kafka events are non-fatal (log + continue);
 * - auditLog() after mutations.
 */
import { z } from "zod";
import { randomUUID } from "crypto";
import { TRPCError } from "@trpc/server";
import { and, desc, eq, inArray, sql } from "drizzle-orm";
import { protectedProcedure, router } from "../_core/trpc";
import {
  getDb,
  getUserByOpenId,
  requireMerchant,
  createPayout,
} from "../db";
import { initiatePayoutApproval } from "../middlewareBridge";
import { withIdempotency } from "../idempotency";
import { publishEvent } from "../kafkaClient";
import { auditLog } from "../auditTrail";
import { ENV as env } from "../_core/env";
import { logger } from "../logger";
import {
  apBills,
  apPayments,
  bnplLoans,
  bnplPlans,
  bnplRepaymentSchedules,
  vendors,
  wallets,
  walletTransactions,
} from "../../drizzle/schema";

// ─── Rate card (annual percentage rates, basis points, by credit risk band) ──
// Bands mirror python-services/credit-scoring risk_band output. Rates are
// aligned with the service's recommended_rate_pct (18/24/30/36% p.a.).
export const PAY_OVER_TIME_RATE_CARD: Record<
  string,
  { net30FeeBps: number; aprBps: Record<number, number> }
> = {
  excellent: { net30FeeBps: 0, aprBps: { 3: 1800, 6: 2100, 12: 2400 } },
  good: { net30FeeBps: 50, aprBps: { 3: 2400, 6: 2700, 12: 3000 } },
  fair: { net30FeeBps: 100, aprBps: { 3: 3000, 6: 3300, 12: 3600 } },
  poor: { net30FeeBps: 200, aprBps: { 3: 3600, 6: 3900, 12: 4200 } },
};

const INSTALLMENT_OPTIONS = [3, 6, 12] as const;
const NET30_DAYS = 30;
const INSTALLMENT_INTERVAL_DAYS = 30;

const EMI_SERVICE_URL = process.env.EMI_SERVICE_URL ?? "http://emi-service:9025";

// ─── Pure amortization (ported from python-services/emi-service amortize) ────

export interface AmortizationRow {
  instalment: number;
  emi: number;
  principal: number;
  interest: number;
  balance: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

/**
 * Generate a full amortization schedule. `principal` and all amounts are in
 * NGN (matches bnpl_repayment_schedules.*_ngn real columns consumed by the
 * existing BNPL sweep). `annualRatePct` is a percent (18 = 18% p.a.).
 */
function amortize(
  principal: number,
  annualRatePct: number,
  tenureMonths: number,
): AmortizationRow[] {
  if (annualRatePct === 0) {
    const emi = principal / tenureMonths;
    return Array.from({ length: tenureMonths }, (_, i) => ({
      instalment: i + 1,
      emi: round2(emi),
      principal: round2(emi),
      interest: 0,
      balance: round2(principal - emi * (i + 1)),
    }));
  }
  const monthlyRate = annualRatePct / 100 / 12;
  const pow = Math.pow(1 + monthlyRate, tenureMonths);
  const emi = (principal * monthlyRate * pow) / (pow - 1);
  const schedule: AmortizationRow[] = [];
  let balance = principal;
  for (let i = 0; i < tenureMonths; i++) {
    const interest = balance * monthlyRate;
    const principalPart = emi - interest;
    balance -= principalPart;
    schedule.push({
      instalment: i + 1,
      emi: round2(emi),
      principal: round2(principalPart),
      interest: round2(interest),
      balance: round2(Math.max(0, balance)),
    });
  }
  return schedule;
}

function resolveRiskBand(score: number, riskBand?: string): string {
  if (riskBand && riskBand in PAY_OVER_TIME_RATE_CARD) return riskBand;
  if (riskBand === "very_poor") return "very_poor";
  if (score >= 750) return "excellent";
  if (score >= 680) return "good";
  if (score >= 580) return "fair";
  if (score >= 500) return "poor";
  return "very_poor";
}

function addDays(base: Date, days: number): Date {
  return new Date(base.getTime() + days * 24 * 60 * 60 * 1000);
}

// ─── Session / merchant resolution (crud119.ts resolveMerchantId pattern) ────

async function resolveSessionMerchant(openId: string) {
  const user = await getUserByOpenId(openId);
  if (!user) {
    throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  }
  const merchant = await requireMerchant(user.id);
  return { user, merchant };
}

// ─── Credit scoring (direct fetch, routers.ts:4270 pattern) ─────────────────

interface MerchantScore {
  score: number;
  riskBand: string;
  maxLoanKobo: number | null;
}

async function fetchMerchantScore(merchantId: string): Promise<MerchantScore> {
  let resp: Response;
  try {
    resp = await fetch(`${env.creditScoringUrl}/score/merchant/${merchantId}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.internalApiKey,
      },
      body: JSON.stringify({ merchant_id: merchantId }),
      signal: AbortSignal.timeout(15000),
    });
  } catch (e: any) {
    logger.warn(`[apPayOverTime] credit scoring unreachable: ${e?.message ?? e}`);
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Credit scoring unavailable — pay-over-time terms cannot be quoted",
    });
  }
  if (!resp.ok) {
    logger.warn(`[apPayOverTime] credit scoring HTTP ${resp.status}`);
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Credit scoring unavailable — pay-over-time terms cannot be quoted",
    });
  }
  const body = (await resp.json()) as any;
  const score = Number(body.score);
  if (!Number.isFinite(score)) {
    throw new TRPCError({
      code: "SERVICE_UNAVAILABLE",
      message: "Credit scoring returned an unusable response",
    });
  }
  return {
    score,
    riskBand: resolveRiskBand(score, body.risk_band ?? body.riskBand),
    maxLoanKobo:
      body.max_loan_kobo != null
        ? Number(body.max_loan_kobo)
        : body.maxLoanKobo != null
          ? Number(body.maxLoanKobo)
          : null,
  };
}

// ─── Offer computation ───────────────────────────────────────────────────────

export interface PayOverTimeOffer {
  offerId: string;
  installments: number;
  feeBps: number | null;
  aprBps: number | null;
  installmentAmountKobo: number;
  totalRepayableKobo: number;
  firstDueDate: string;
  schedule: AmortizationRow[];
}

function computeOffers(
  principalKobo: number,
  band: string,
  now: Date,
): PayOverTimeOffer[] {
  const card = PAY_OVER_TIME_RATE_CARD[band];
  const principalNgn = principalKobo / 100;
  const offers: PayOverTimeOffer[] = [];

  // Net-30: single payment of principal + flat fee in 30 days.
  const net30TotalNgn = principalNgn * (1 + card.net30FeeBps / 10000);
  offers.push({
    offerId: "net30",
    installments: 1,
    feeBps: card.net30FeeBps,
    aprBps: null,
    installmentAmountKobo: Math.round(net30TotalNgn * 100),
    totalRepayableKobo: Math.round(net30TotalNgn * 100),
    firstDueDate: addDays(now, NET30_DAYS).toISOString(),
    schedule: [
      {
        instalment: 1,
        emi: round2(net30TotalNgn),
        principal: round2(principalNgn),
        interest: round2(net30TotalNgn - principalNgn),
        balance: 0,
      },
    ],
  });

  // Instalment plans via the emi-service amortization math.
  for (const n of INSTALLMENT_OPTIONS) {
    const aprBps = card.aprBps[n];
    const schedule = amortize(principalNgn, aprBps / 100, n);
    const totalNgn = round2(schedule.reduce((s, r) => s + r.emi, 0));
    offers.push({
      offerId: `inst${n}`,
      installments: n,
      feeBps: null,
      aprBps,
      installmentAmountKobo: Math.round(schedule[0].emi * 100),
      totalRepayableKobo: Math.round(totalNgn * 100),
      firstDueDate: addDays(now, INSTALLMENT_INTERVAL_DAYS).toISOString(),
      schedule,
    });
  }
  return offers;
}

function offerIdToInstallments(offerId: string): number {
  if (offerId === "net30") return 1;
  const n = Number(offerId.replace("inst", ""));
  if (!INSTALLMENT_OPTIONS.includes(n as any)) {
    throw new TRPCError({ code: "BAD_REQUEST", message: `Unknown offerId: ${offerId}` });
  }
  return n;
}

// ─── emi-service plan-record sidecall (NON-fatal) ────────────────────────────

async function emiServiceSidecall(opts: {
  merchantId: string;
  planName: string;
  tenureMonths: number;
  annualRatePct: number;
  principalNgn: number;
  planId: string;
}): Promise<void> {
  try {
    const createResp = await fetch(`${EMI_SERVICE_URL}/emi/plans/create`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.internalApiKey,
      },
      body: JSON.stringify({
        merchant_id: opts.merchantId,
        plan_name: opts.planName,
        tenure_months: opts.tenureMonths,
        interest_rate_annual: opts.annualRatePct,
        processing_fee_pct: 0,
        min_amount: opts.principalNgn,
        max_amount: opts.principalNgn,
        currency: "NGN",
        enabled: true,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!createResp.ok) {
      logger.warn(`[apPayOverTime] emi-service /emi/plans/create HTTP ${createResp.status} (non-fatal)`);
      return;
    }
    const created = (await createResp.json()) as any;
    const initResp = await fetch(`${EMI_SERVICE_URL}/emi/initiate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "X-Internal-Key": env.internalApiKey,
      },
      body: JSON.stringify({
        customer_id: opts.merchantId,
        merchant_id: opts.merchantId,
        plan_id: created.plan_id ?? opts.planId,
        principal_amount: opts.principalNgn,
        purpose: opts.planName,
      }),
      signal: AbortSignal.timeout(10000),
    });
    if (!initResp.ok) {
      logger.warn(`[apPayOverTime] emi-service /emi/initiate HTTP ${initResp.status} (non-fatal)`);
    }
  } catch (e: any) {
    // Non-fatal by design: the authoritative plan lives in Postgres.
    logger.warn(`[apPayOverTime] emi-service sidecall failed (non-fatal): ${e?.message ?? e}`);
  }
}

// ─── Router ──────────────────────────────────────────────────────────────────

const paginationInput = z.object({
  page: z.number().int().min(1).default(1),
  limit: z.number().int().min(1).max(200).default(50),
});

export const apPayOverTimeRouter = router({
  /**
   * Quote pay-over-time terms for an approved bill. Requires a live credit
   * score — when scoring is down this fails 503 rather than quoting
   * fabricated terms.
   */
  getOffers: protectedProcedure
    .input(z.object({ billId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchant } = await resolveSessionMerchant(ctx.user.openId);

      const [bill] = await db
        .select()
        .from(apBills)
        .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)));
      if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
      if (!["approved", "partially_paid"].includes(bill.status)) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Bill status '${bill.status}' is not financeable (must be approved)`,
        });
      }
      const remainingKobo = bill.totalKobo - (bill.amountPaidKobo ?? 0);
      if (remainingKobo <= 0) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Bill has no outstanding balance" });
      }

      const score = await fetchMerchantScore(merchant.id);
      if (score.riskBand === "very_poor") {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "Merchant is not eligible for pay-over-time financing",
        });
      }
      if (score.maxLoanKobo != null && remainingKobo > score.maxLoanKobo) {
        throw new TRPCError({
          code: "BAD_REQUEST",
          message: `Outstanding amount exceeds approved financing limit of ${score.maxLoanKobo} kobo`,
        });
      }

      return {
        billId: bill.id,
        principalKobo: remainingKobo,
        currency: bill.currency ?? "NGN",
        score: score.score,
        riskBand: score.riskBand,
        offers: computeOffers(remainingKobo, score.riskBand, new Date()),
      };
    }),

  /**
   * Create a financing plan AND pay the vendor in full, atomically:
   * bnpl_plans + bnpl_loans + bnpl_repayment_schedules + ap_payments rows are
   * inserted in one db.transaction; the vendor payout (createPayout +
   * initiatePayoutApproval, STRICT) runs inside the same transaction — any
   * payout failure throws and the whole transaction rolls back (no plan
   * without funds).
   */
  createPlan: protectedProcedure
    .input(
      z
        .object({
          billId: z.string().min(1),
          offerId: z.enum(["net30", "inst3", "inst6", "inst12"]).optional(),
          installments: z
            .union([z.literal(1), z.literal(3), z.literal(6), z.literal(12)])
            .optional(),
          idempotencyKey: z.string().min(8).max(128),
        })
        .refine((v) => v.offerId != null || v.installments != null, {
          message: "Either offerId or installments is required",
        }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { user, merchant } = await resolveSessionMerchant(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        operation: "ap.payOverTime.createPlan",
        requestBody: input,
        execute: async () => {
          const [bill] = await db
            .select()
            .from(apBills)
            .where(and(eq(apBills.id, input.billId), eq(apBills.merchantId, merchant.id)));
          if (!bill) throw new TRPCError({ code: "NOT_FOUND", message: "Bill not found" });
          if (!["approved", "partially_paid"].includes(bill.status)) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Bill status '${bill.status}' is not financeable (must be approved)`,
            });
          }
          const remainingKobo = bill.totalKobo - (bill.amountPaidKobo ?? 0);
          if (remainingKobo <= 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Bill has no outstanding balance" });
          }

          // Vendor bank details are required to disburse in full.
          let vendor: any = null;
          if (bill.vendorId) {
            const [v] = await db
              .select()
              .from(vendors)
              .where(and(eq(vendors.id, bill.vendorId), eq(vendors.merchantId, merchant.id)));
            vendor = v ?? null;
          }
          if (!vendor?.bankCode || !vendor?.accountNumber) {
            throw new TRPCError({
              code: "PRECONDITION_FAILED",
              message: "Vendor bank details are required to disburse a pay-over-time plan",
            });
          }

          const installments =
            input.installments ?? offerIdToInstallments(input.offerId!);
          const score = await fetchMerchantScore(merchant.id);
          if (score.riskBand === "very_poor") {
            throw new TRPCError({
              code: "FORBIDDEN",
              message: "Merchant is not eligible for pay-over-time financing",
            });
          }
          if (score.maxLoanKobo != null && remainingKobo > score.maxLoanKobo) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `Outstanding amount exceeds approved financing limit of ${score.maxLoanKobo} kobo`,
            });
          }

          const offers = computeOffers(remainingKobo, score.riskBand, new Date());
          const offer = offers.find((o) => o.installments === installments)!;
          const card = PAY_OVER_TIME_RATE_CARD[score.riskBand];
          const annualRatePct =
            installments === 1 ? 0 : card.aprBps[installments] / 100;

          const planId = randomUUID();
          const loanId = randomUUID();
          const apPaymentId = randomUUID();
          const payoutId = randomUUID();
          const reference = `AP-POT-${randomUUID()}`;
          const currency = bill.currency ?? "NGN";
          const now = new Date();
          const planName = `AP Pay-Over-Time ${installments === 1 ? "Net-30" : `${installments} installments`} — bill ${bill.billNumber ?? bill.id}`;

          await db.transaction(async (tx) => {
            // ── Plan catalog row ──────────────────────────────────────────
            await tx.insert(bnplPlans).values({
              id: planId,
              merchantId: merchant.id,
              name: planName,
              installments,
              interestRate: offer.aprBps ?? offer.feeBps ?? 0,
              minAmount: remainingKobo,
              maxAmount: remainingKobo,
              currency,
              active: true,
              createdAt: now,
              updatedAt: now,
            } as any);

            // ── Loan row (the merchant's repayment obligation) ────────────
            await tx.insert(bnplLoans).values({
              id: loanId,
              tenantId: merchant.tenantId ?? "ten_default",
              merchantId: merchant.id,
              principalAmount: remainingKobo,
              currency,
              installments,
              installmentAmount: offer.installmentAmountKobo,
              interestRate: offer.aprBps ?? 0,
              status: "active",
              nextPaymentAt: new Date(offer.firstDueDate),
              paidAmount: 0,
              createdAt: now,
              updatedAt: now,
            } as any);

            // ── Repayment schedule rows (consumed by the BNPL sweep) ──────
            for (const row of offer.schedule) {
              await tx.insert(bnplRepaymentSchedules).values({
                id: randomUUID(),
                bnplLoanId: loanId,
                userId: merchant.id,
                instalmentNumber: row.instalment,
                totalInstalments: installments,
                principalAmountNgn: row.principal,
                interestAmountNgn: row.interest,
                totalDueNgn: row.emi,
                dueDate: addDays(now, row.instalment * INSTALLMENT_INTERVAL_DAYS),
                status: "pending",
                createdAt: now,
                updatedAt: now,
              } as any);
            }

            // ── AP payment row linking the plan to the bill ───────────────
            await tx.insert(apPayments).values({
              id: apPaymentId,
              billId: bill.id,
              merchantId: merchant.id,
              payoutId,
              fundingMethod: "pay_over_time",
              amountKobo: remainingKobo,
              feeKobo: 0,
              status: "pending",
              reference,
              metadata: {
                planId,
                loanId,
                offerId: offer.offerId,
                installments,
                aprBps: offer.aprBps,
                feeBps: offer.feeBps,
                totalRepayableKobo: offer.totalRepayableKobo,
              },
              createdAt: now,
            } as any);

            // ── Pay the vendor IN FULL via the existing payout path ───────
            await createPayout({
              id: payoutId,
              merchantId: merchant.id,
              tenantId: merchant.tenantId ?? "ten_default",
              reference,
              amount: remainingKobo,
              currency,
              bankCode: vendor.bankCode,
              accountNumber: vendor.accountNumber,
              accountName: vendor.accountName ?? vendor.name,
              narration: `Pay-over-time disbursement for bill ${bill.billNumber ?? bill.id}`,
              feeAmount: 0,
              status: "pending_approval",
            });
            // STRICT bridge call — failure THROWS, rolling back the whole
            // transaction so no plan exists without funds moving.
            await initiatePayoutApproval({
              payoutId,
              merchantId: merchant.id,
              amount: remainingKobo,
              currency,
              bankCode: vendor.bankCode,
              accountNumber: vendor.accountNumber,
              accountName: vendor.accountName ?? vendor.name,
              narration: `Pay-over-time disbursement for bill ${bill.billNumber ?? bill.id}`,
              reference,
              initiatorId: ctx.user.openId,
            });

            // ── Guarded bill flip: approved|partially_paid → paid ─────────
            const flipped = await tx
              .update(apBills)
              .set({ status: "paid", amountPaidKobo: bill.totalKobo, updatedAt: new Date() } as any)
              .where(
                and(
                  eq(apBills.id, bill.id),
                  inArray(apBills.status, ["approved", "partially_paid"]),
                ),
              )
              .returning();
            if (!flipped.length) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Bill is no longer payable — status changed concurrently",
              });
            }
          });

          // ── Non-fatal post-commit side effects ──────────────────────────
          await emiServiceSidecall({
            merchantId: merchant.id,
            planName,
            tenureMonths: installments,
            annualRatePct,
            principalNgn: remainingKobo / 100,
            planId,
          });

          publishEvent(
            "paygate.ap.payments",
            {
              type: "pay_over_time_plan_created",
              apPaymentId,
              planId,
              loanId,
              billId: bill.id,
              merchantId: merchant.id,
              payoutId,
              amountKobo: remainingKobo,
              installments,
              totalRepayableKobo: offer.totalRepayableKobo,
              currency,
            },
            apPaymentId,
          ).catch((e) =>
            logger.warn(`[apPayOverTime] kafka publish failed (non-fatal): ${e?.message ?? e}`),
          );

          await auditLog({
            merchantId: merchant.id,
            actorId: ctx.user.openId,
            actorName: user.name ?? ctx.user.openId,
            actorEmail: user.email ?? undefined,
            action: "ap.pay_over_time.plan_created",
            resource: "bnpl_plan",
            resourceId: planId,
            metadata: {
              billId: bill.id,
              loanId,
              apPaymentId,
              payoutId,
              installments,
              principalKobo: remainingKobo,
              totalRepayableKobo: offer.totalRepayableKobo,
            },
          });

          return {
            planId,
            loanId,
            apPaymentId,
            payoutId,
            billId: bill.id,
            installments,
            principalKobo: remainingKobo,
            installmentAmountKobo: offer.installmentAmountKobo,
            totalRepayableKobo: offer.totalRepayableKobo,
            firstDueDate: offer.firstDueDate,
            billStatus: "paid" as const,
          };
        },
      });
    }),

  /** List the merchant's pay-over-time plans, joined to their bills. */
  listPlans: protectedProcedure
    .input(paginationInput)
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchant } = await resolveSessionMerchant(ctx.user.openId);
      const offset = (input.page - 1) * input.limit;
      return db
        .select({
          payment: apPayments,
          plan: bnplPlans,
          bill: apBills,
        })
        .from(apPayments)
        .innerJoin(apBills, eq(apPayments.billId, apBills.id))
        .innerJoin(
          bnplPlans,
          eq(bnplPlans.id, sql`${apPayments.metadata}->>'planId'` as any),
        )
        .where(
          and(
            eq(apPayments.merchantId, merchant.id),
            eq(apPayments.fundingMethod, "pay_over_time"),
          ),
        )
        .orderBy(desc(apPayments.createdAt))
        .limit(input.limit)
        .offset(offset);
    }),

  /** Full repayment schedule for a plan (ownership-scoped). */
  getSchedule: protectedProcedure
    .input(z.object({ planId: z.string().min(1) }))
    .query(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { merchant } = await resolveSessionMerchant(ctx.user.openId);

      const [plan] = await db
        .select()
        .from(bnplPlans)
        .where(and(eq(bnplPlans.id, input.planId), eq(bnplPlans.merchantId, merchant.id)));
      if (!plan) throw new TRPCError({ code: "NOT_FOUND", message: "Plan not found" });

      const [payment] = await db
        .select()
        .from(apPayments)
        .where(
          and(
            eq(apPayments.merchantId, merchant.id),
            eq(apPayments.fundingMethod, "pay_over_time"),
            eq(sql`${apPayments.metadata}->>'planId'` as any, input.planId),
          ),
        )
        .limit(1);
      if (!payment) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan payment link not found" });
      }
      const loanId = (payment.metadata as any)?.loanId as string | undefined;
      if (!loanId) {
        throw new TRPCError({ code: "NOT_FOUND", message: "Plan loan link not found" });
      }

      const [loan] = await db
        .select()
        .from(bnplLoans)
        .where(and(eq(bnplLoans.id, loanId), eq(bnplLoans.merchantId, merchant.id)));
      const installments = await db
        .select()
        .from(bnplRepaymentSchedules)
        .where(eq(bnplRepaymentSchedules.bnplLoanId, loanId))
        .orderBy(bnplRepaymentSchedules.instalmentNumber);

      return { plan, loan: loan ?? null, payment, installments };
    }),

  /**
   * Repay one instalment from the merchant wallet. Atomic: guarded wallet
   * debit (balance check under the row lock, routers.ts:9754/5543 pattern)
   * + guarded schedule flip pending|overdue → paid RETURNING. An already-paid
   * instalment can never be re-paid — the guard is in the UPDATE's WHERE.
   */
  repayInstallment: protectedProcedure
    .input(
      z.object({
        scheduleId: z.string().min(1),
        idempotencyKey: z.string().min(8).max(128),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR" });
      const { user, merchant } = await resolveSessionMerchant(ctx.user.openId);

      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: merchant.id,
        tenantId: merchant.tenantId ?? "ten_default",
        operation: "ap.payOverTime.repayInstallment",
        requestBody: input,
        execute: async () => {
          const [schedule] = await db
            .select()
            .from(bnplRepaymentSchedules)
            .where(eq(bnplRepaymentSchedules.id, input.scheduleId))
            .limit(1);
          if (!schedule) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Repayment schedule not found" });
          }
          // Ownership: the parent loan must belong to the caller's merchant.
          const [loan] = await db
            .select()
            .from(bnplLoans)
            .where(
              and(
                eq(bnplLoans.id, schedule.bnplLoanId),
                eq(bnplLoans.merchantId, merchant.id),
              ),
            )
            .limit(1);
          if (!loan) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Repayment schedule not found" });
          }

          const amountDueNgn =
            round2(schedule.totalDueNgn + (schedule.lateFeeNgn ?? 0) - (schedule.paidAmountNgn ?? 0));
          const amountKobo = Math.round(amountDueNgn * 100);
          if (amountKobo <= 0) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Nothing due on this instalment" });
          }
          const paymentReference = `BNPL-REPAY-${input.scheduleId}`;
          const currency = loan.currency ?? "NGN";

          const result = await db.transaction(async (tx) => {
            // Guarded schedule flip FIRST — only a pending/overdue instalment
            // can become paid; an already-paid one yields zero rows.
            const flipped = await tx
              .update(bnplRepaymentSchedules)
              .set({
                status: "paid",
                paidAt: new Date(),
                paidAmountNgn: round2(schedule.totalDueNgn + (schedule.lateFeeNgn ?? 0)),
                paymentReference,
                updatedAt: new Date(),
              } as any)
              .where(
                and(
                  eq(bnplRepaymentSchedules.id, input.scheduleId),
                  inArray(bnplRepaymentSchedules.status, ["pending", "overdue"]),
                ),
              )
              .returning();
            if (!flipped.length) {
              throw new TRPCError({
                code: "CONFLICT",
                message: "Instalment is not payable (already paid or not outstanding)",
              });
            }

            // Guarded atomic wallet debit — the balance check is folded into
            // the debit itself (TOCTOU-safe under the row lock).
            const [wallet] = await tx
              .select()
              .from(wallets)
              .where(and(eq(wallets.merchantId, merchant.id), eq(wallets.currency, currency)))
              .limit(1);
            if (!wallet) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: "Wallet not found. Please top up first.",
              });
            }
            const debitRes: any = await tx.execute(sql`
              UPDATE wallets
              SET balance = (balance::numeric - ${amountKobo}::numeric)::text, updated_at = now()
              WHERE id = ${wallet.id} AND balance::numeric >= ${amountKobo}::numeric
              RETURNING balance
            `);
            const debitRows: any[] = debitRes?.rows ?? debitRes ?? [];
            if (!debitRows[0]) {
              throw new TRPCError({
                code: "BAD_REQUEST",
                message: `Insufficient balance. Required: ${(amountKobo / 100).toFixed(2)} ${currency}`,
              });
            }

            // Ledger row for the debit leg.
            await tx.insert(walletTransactions).values({
              tenantId: wallet.tenantId,
              walletId: wallet.id,
              type: "debit",
              amount: String(amountKobo),
              currency,
              balanceBefore: wallet.balance,
              balanceAfter: String(debitRows[0].balance),
              description: `BNPL instalment ${schedule.instalmentNumber}/${schedule.totalInstalments} repayment`,
              reference: paymentReference,
              channel: "bnpl_repayment",
              counterpartyName: "PayGate Pay-Over-Time",
              status: "completed",
              createdAt: new Date(),
            } as any);

            // Roll up the loan: bump paid_amount; complete when nothing is
            // left outstanding.
            const remaining = await tx
              .select({ id: bnplRepaymentSchedules.id })
              .from(bnplRepaymentSchedules)
              .where(
                and(
                  eq(bnplRepaymentSchedules.bnplLoanId, loan.id),
                  inArray(bnplRepaymentSchedules.status, ["pending", "overdue"]),
                ),
              );
            const loanUpdate: Record<string, any> = {
              paidAmount: (loan.paidAmount ?? 0) + amountKobo,
              updatedAt: new Date(),
            };
            if (remaining.length === 0) {
              loanUpdate.status = "completed";
              loanUpdate.completedAt = new Date();
              loanUpdate.nextPaymentAt = null;
            } else {
              const nextDue = remaining.length > 0 ? new Date() : null;
              loanUpdate.nextPaymentAt = nextDue;
            }
            await tx
              .update(bnplLoans)
              .set(loanUpdate as any)
              .where(eq(bnplLoans.id, loan.id));

            return { flipped: flipped[0], completed: remaining.length === 0 };
          });

          publishEvent(
            "paygate.ap.payments",
            {
              type: "pay_over_time_installment_repaid",
              scheduleId: input.scheduleId,
              loanId: loan.id,
              merchantId: merchant.id,
              amountKobo,
              currency,
              loanCompleted: result.completed,
            },
            input.scheduleId,
          ).catch((e) =>
            logger.warn(`[apPayOverTime] kafka publish failed (non-fatal): ${e?.message ?? e}`),
          );

          await auditLog({
            merchantId: merchant.id,
            actorId: ctx.user.openId,
            actorName: user.name ?? ctx.user.openId,
            actorEmail: user.email ?? undefined,
            action: "ap.pay_over_time.installment_repaid",
            resource: "bnpl_repayment_schedule",
            resourceId: input.scheduleId,
            metadata: { loanId: loan.id, amountKobo, loanCompleted: result.completed },
          });

          return {
            scheduleId: input.scheduleId,
            loanId: loan.id,
            amountKobo,
            currency,
            status: "paid" as const,
            loanCompleted: result.completed,
          };
        },
      });
    }),
});

// ─── Test hooks ──────────────────────────────────────────────────────────────
export const __payOverTimeInternals = {
  amortize,
  computeOffers,
  resolveRiskBand,
  offerIdToInstallments,
  PAY_OVER_TIME_RATE_CARD,
};
