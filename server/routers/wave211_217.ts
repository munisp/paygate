/**
 * NextHub Waves 211–217 tRPC Routers
 * Covers: Remittance | Healthcare | Insurance | SCF | G2P | Energy/VEND | CBDC
 * Database: PostgreSQL via Drizzle ORM — uses db.execute(sql`...`) throughout
 */

import { z } from "zod";
import { router, protectedProcedure, adminProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";
import { demoOrFail, demoArrayOrFail, isSimulationMode } from "../_core/demoData";
import { withIdempotency } from "../idempotency";
import {
  debitWalletViaMiddleware,
  isBridgeAvailable,
} from "../middlewareBridge";

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${nanoid(8).toUpperCase()}`;
}

/** Platform admins see across tenants; everyone else is scoped to rows they created. */
function isAdminUser(ctx: { user: { role?: string } }): boolean {
  return ctx.user.role === "admin";
}

/** Throws FORBIDDEN unless the row was created by the caller (or caller is admin). */
function assertOwnership(
  rowCreatedBy: unknown,
  ctx: { user: { openId: string; role?: string } },
  resource: string,
) {
  if (isAdminUser(ctx)) return;
  if (String(rowCreatedBy ?? "") !== ctx.user.openId) {
    throw new TRPCError({
      code: "FORBIDDEN",
      message: `FORBIDDEN: ${resource} belongs to a different tenant`,
    });
  }
}

/**
 * Early-discount math in integer minor units (kobo/cents), consistent with the
 * parseScaledDecimal/computeCorridorAmounts approach in server/routers.ts.
 * discount_minor = round_half_up(amount_minor * rate_bps * days / (365 * 10_000)).
 */
function computeEarlyDiscountKobo(amountKobo: number, annualRatePercent: number, daysEarly: number): {
  discountKobo: number; netKobo: number;
} {
  const rateBps = BigInt(Math.round(annualRatePercent * 100));
  const denom = 365n * 10_000n;
  const discount =
    (BigInt(amountKobo) * rateBps * BigInt(daysEarly) + denom / 2n) / denom;
  const discountKobo = Number(discount);
  return { discountKobo, netKobo: amountKobo - discountKobo };
}

// ─── Wave 211: Remittance ─────────────────────────────────────────────────────

export const remittanceRouter = router({
  listCorridors: protectedProcedure
    .input(z.object({
      fromCurrency: z.string().optional(),
      toCurrency: z.string().optional(),
    }).optional())
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM remittance_corridors
        WHERE is_active = 1
        ${input?.fromCurrency ? sql`AND from_currency = ${input.fromCurrency}` : sql``}
        ${input?.toCurrency ? sql`AND to_currency = ${input.toCurrency}` : sql``}
        ORDER BY from_currency, to_currency
        LIMIT 200
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  getCorridorRate: protectedProcedure
    .input(z.object({ fromCurrency: z.string(), toCurrency: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM remittance_corridors
        WHERE from_currency = ${input.fromCurrency}
          AND to_currency = ${input.toCurrency}
          AND is_active = 1
        LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return rows.rows[0] as Record<string, unknown>;
    }),

  // Corridors are platform-level entities carrying FX rates — admin only.
  createCorridor: adminProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      fromCountry: z.string(),
      toCountry: z.string(),
      exchangeRate: z.number().positive(),
      fee: z.number().default(0),
      feeType: z.enum(["FLAT", "PERCENT"]).default("FLAT"),
      minAmount: z.number().default(100),
      maxAmount: z.number().default(5000000),
      provider: z.string(),
    }))
    .mutation(async ({ input }) => {
      const id = genId("COR");
      await db.execute(sql`
        INSERT INTO remittance_corridors
          (id, from_currency, to_currency, from_country, to_country,
           exchange_rate, fee, fee_type, min_amount, max_amount, provider, is_active, created_at, updated_at)
        VALUES
          (${id}, ${input.fromCurrency}, ${input.toCurrency}, ${input.fromCountry}, ${input.toCountry},
           ${input.exchangeRate}, ${input.fee}, ${input.feeType}, ${input.minAmount}, ${input.maxAmount},
           ${input.provider}, 1, NOW(), NOW())
      `);
      return { id };
    }),

  initiateTransfer: protectedProcedure
    .input(z.object({
      corridorId: z.string(),
      senderFsp: z.string(),
      senderAccount: z.string(),
      receiverFsp: z.string(),
      receiverAccount: z.string(),
      sendAmount: z.number().positive(),
      sendCurrency: z.string(),
      receiverName: z.string(),
      narration: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("REM");
      // Look up corridor for exchange rate
      const corridorRows = await db.execute(sql`
        SELECT * FROM remittance_corridors WHERE id = ${input.corridorId} LIMIT 1
      `);
      const corridor = corridorRows.rows[0] as Record<string, unknown> | undefined;
      const exchangeRate = corridor ? Number(corridor.exchange_rate) : 1;
      // Integer minor-unit (kobo) math — float `(send - fee) * rate` loses
      // kobo to binary rounding. Same BigInt half-up pattern as
      // wave34 remittance.initiate ((x*150n + 5000n)/10000n).
      const sendKobo = BigInt(Math.round(input.sendAmount * 100));
      const feeType = corridor ? String(corridor.fee_type ?? "FLAT") : "FLAT";
      const rawFee = corridor ? Number(corridor.fee) : 0;
      const feeKobo = feeType === "PERCENT"
        // rawFee is a percentage (e.g. 1.5) — bps half-up on the send amount
        ? (sendKobo * BigInt(Math.round(rawFee * 100)) + 5_000n) / 10_000n
        : BigInt(Math.round(rawFee * 100));
      if (feeKobo >= sendKobo) {
        throw new TRPCError({ code: "BAD_REQUEST", message: "Fee meets or exceeds the send amount" });
      }
      // Exchange rate at 6dp scale; receive amount rounded half-up at the kobo.
      const RATE_SCALE = 1_000_000n;
      const rateScaled = BigInt(Math.round(exchangeRate * 1_000_000));
      const receiveKobo = ((sendKobo - feeKobo) * rateScaled + RATE_SCALE / 2n) / RATE_SCALE;
      const fee = Number(feeKobo) / 100;
      const receiveAmount = Number(receiveKobo) / 100;
      const receiveCurrency = corridor ? String(corridor.to_currency) : input.sendCurrency;

      await db.execute(sql`
        INSERT INTO remittance_transfers
          (id, corridor_id, sender_fsp, sender_account, receiver_fsp, receiver_account,
           send_amount, send_currency, receive_amount, receive_currency, exchange_rate, fee,
           receiver_name, narration, status, created_by, created_at)
        VALUES
          (${id}, ${input.corridorId}, ${input.senderFsp}, ${input.senderAccount},
           ${input.receiverFsp}, ${input.receiverAccount}, ${input.sendAmount}, ${input.sendCurrency},
           ${receiveAmount}, ${receiveCurrency}, ${exchangeRate}, ${fee},
           ${input.receiverName}, ${input.narration ?? ""}, 'INITIATED', ${ctx.user.openId}, NOW())
      `);
      return { id, receiveAmount, receiveCurrency, exchangeRate, fee, status: "INITIATED" };
    }),

  listTransfers: protectedProcedure
    .input(z.object({
      page: z.number().default(1),
      pageSize: z.number().default(20),
      status: z.string().optional(),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM remittance_transfers
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM remittance_transfers
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
      `);
      return {
        transfers: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  screenTravelRule: protectedProcedure
    .input(z.object({
      transferId: z.string(),
      originatorName: z.string(),
      originatorAccount: z.string(),
      originatorCountry: z.string(),
      beneficiaryName: z.string(),
      beneficiaryAccount: z.string(),
      beneficiaryCountry: z.string(),
      amount: z.number(),
      currency: z.string(),
    }))
    .mutation(async ({ input }) => {
      const HIGH_RISK = ["KP", "IR", "MM", "SY", "YE", "LY", "SO", "CU", "SD"];
      const flags: string[] = [];
      let riskScore = 0;

      if (HIGH_RISK.includes(input.originatorCountry)) {
        flags.push(`HIGH_RISK_ORIGINATOR:${input.originatorCountry}`);
        riskScore += 30;
      }
      if (HIGH_RISK.includes(input.beneficiaryCountry)) {
        flags.push(`HIGH_RISK_BENEFICIARY:${input.beneficiaryCountry}`);
        riskScore += 30;
      }
      if (input.amount >= 1000) {
        flags.push("TRAVEL_RULE_REQUIRED");
        riskScore += 10;
      }
      if (input.amount >= 10000) {
        flags.push("LARGE_VALUE_TRANSFER");
        riskScore += 20;
      }

      const travelRuleRef = `TR-${nanoid(12).toUpperCase()}`;
      return {
        transferId: input.transferId,
        travelRuleRef,
        requiresTravelRule: input.amount >= 1000,
        riskScore,
        flags,
        isCompliant: riskScore < 50,
        requiresManualReview: riskScore >= 70,
        screenedAt: new Date(),
      };
    }),
});

// ─── Wave 212: Healthcare ─────────────────────────────────────────────────────

export const healthcareRouter = router({
  listClaims: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      // PHI: non-admin callers only see claims they submitted.
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND submitted_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM healthcare_claims
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
        ORDER BY submitted_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM healthcare_claims
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
      `);
      return {
        claims: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getClaimStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE submitted_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(claim_amount), 0) AS total_amount,
               COALESCE(SUM(approved_amount), 0) AS approved_amount
        FROM healthcare_claims
        ${scope}
        GROUP BY status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  submitClaim: protectedProcedure
    .input(z.object({
      policyNumber: z.string(),
      beneficiaryId: z.string(),
      beneficiaryName: z.string(),
      providerId: z.string(),
      providerName: z.string(),
      claimType: z.enum(["INPATIENT", "OUTPATIENT", "DENTAL", "VISION", "PHARMACY", "MATERNITY"]),
      diagnosisCodes: z.array(z.string()).default([]),
      procedureCodes: z.array(z.string()).default([]),
      claimAmount: z.number().positive(),
      currency: z.string().default("NGN"),
      serviceDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("CLM");
      const nhiaClaimRef = `NHIA-${Date.now()}-${nanoid(6).toUpperCase()}`;
      await db.execute(sql`
        INSERT INTO healthcare_claims
          (id, policy_number, beneficiary_id, beneficiary_name, provider_id, provider_name,
           claim_type, diagnosis_codes, procedure_codes, claim_amount, currency, service_date,
           status, nhia_claim_ref, submitted_by, submitted_at)
        VALUES
          (${id}, ${input.policyNumber}, ${input.beneficiaryId}, ${input.beneficiaryName},
           ${input.providerId}, ${input.providerName}, ${input.claimType},
           ${JSON.stringify(input.diagnosisCodes)}, ${JSON.stringify(input.procedureCodes)},
           ${input.claimAmount}, ${input.currency}, ${input.serviceDate},
           'SUBMITTED', ${nhiaClaimRef}, ${ctx.user.openId}, NOW())
      `);
      return { id, nhiaClaimRef, status: "SUBMITTED" };
    }),

  checkEligibility: protectedProcedure
    .input(z.object({ policyNumber: z.string(), beneficiaryId: z.string() }))
    .query(async ({ input }) => {
      // STUB: no NHIA eligibility API integration exists. Fabricating coverage
      // would let ineligible claims through — fail loud in production; the
      // simulation payload is labeled and reports UNKNOWN, not active coverage.
      return demoOrFail({
        isEligible: false,
        policyStatus: "UNKNOWN",
        coverageLimit: null,
        deductibleMet: null,
        copayPercent: null,
        coveredServices: [],
        policyNumber: input.policyNumber,
        beneficiaryId: input.beneficiaryId,
        message: "SIMULATED — NHIA eligibility service not integrated; eligibility NOT verified",
      }, "healthcare.checkEligibility (NHIA API not integrated)");
    }),

  // Adjudication is an insurer/platform-side action over other tenants' PHI.
  adjudicateClaim: adminProcedure
    .input(z.object({
      claimId: z.string(),
      decision: z.enum(["APPROVED", "REJECTED", "PARTIAL"]),
      approvedAmount: z.number().optional(),
      notes: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      await db.execute(sql`
        UPDATE healthcare_claims
        SET status = ${input.decision},
            approved_amount = ${input.approvedAmount ?? null},
            adjudication_notes = ${input.notes ?? null},
            adjudicated_at = NOW()
        WHERE id = ${input.claimId}
      `);
      return { success: true, claimId: input.claimId, decision: input.decision };
    }),
});

// ─── Wave 213: Insurance ──────────────────────────────────────────────────────

export const insuranceRouter = router({
  listPolicies: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      policyType: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      // Real columns (drizzle/schema.ts:2338): customer_id / coverage_type.
      const scope = isAdminUser(ctx) ? sql`` : sql`AND customer_id = ${String(ctx.user.id)}`;
      const rows = await db.execute(sql`
        SELECT * FROM insurance_policies
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${input.policyType ? sql`AND coverage_type = ${input.policyType}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM insurance_policies
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${input.policyType ? sql`AND coverage_type = ${input.policyType}` : sql``}
        ${scope}
      `);
      return {
        policies: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  createPolicy: protectedProcedure
    .input(z.object({
      holderName: z.string(),
      holderFsp: z.string(),
      holderAccount: z.string(),
      insurerId: z.string(),
      policyType: z.enum(["LIFE", "HEALTH", "MOTOR", "PROPERTY", "MICRO", "AGRI"]),
      premiumAmount: z.number().positive(),
      currency: z.string().default("NGN"),
      frequency: z.enum(["WEEKLY", "MONTHLY", "QUARTERLY", "ANNUAL"]),
      coverageAmount: z.number().positive(),
      startDate: z.string(),
      endDate: z.string(),
      gracePeriodDays: z.number().default(30),
      productId: z.string().optional(),
      productName: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("POL");
      const policyNumber = `NHIP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
      // Real insurance_policies columns (drizzle/schema.ts:2338) — the old
      // fantasy columns (holder_id, premium_amount, policy_type, …) never
      // existed and every insert 500'd. Premium is stored in integer kobo.
      await db.execute(sql`
        INSERT INTO insurance_policies
          (policy_id, customer_id, product_id, product_name, provider,
           premium_kobo, coverage_type, status, expires_at, created_at)
        VALUES
          (${id}, ${String(ctx.user.id)},
           ${input.productId ?? `nhip_${input.policyType.toLowerCase()}`},
           ${input.productName ?? `${input.policyType} policy — ${input.holderName}`},
           ${input.insurerId}, ${Math.round(input.premiumAmount * 100)},
           ${input.policyType.toLowerCase()}, 'active',
           ${new Date(input.endDate)}, NOW())
      `);
      return { id, policyNumber, status: "active" };
    }),

  getPolicyStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE customer_id = ${String(ctx.user.id)}`;
      const rows = await db.execute(sql`
        SELECT status, coverage_type, COUNT(*) AS count,
               COALESCE(SUM(premium_kobo), 0) AS total_premium_kobo
        FROM insurance_policies
        ${scope}
        GROUP BY status, coverage_type
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  scoreLapseRisk: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input, ctx }) => {
      const rows = await db.execute(sql`
        SELECT * FROM insurance_policies WHERE policy_id = ${input.policyId} LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
      const policy = rows.rows[0] as Record<string, unknown>;
      if (!isAdminUser(ctx) && String(policy.customer_id) !== String(ctx.user.id)) {
        throw new TRPCError({ code: "FORBIDDEN", message: "FORBIDDEN: insurance_policies belongs to a different tenant" });
      }
      // missed_payments does not exist on insurance_policies — derive it from
      // the premium-payment ledger (overdue PENDING payments, due_date stored
      // as varchar 'YYYY-MM-DD').
      const missedRows = await db.execute(sql`
        SELECT COUNT(*) AS missed FROM insurance_premium_payments
        WHERE policy_id = ${input.policyId}
          AND status = 'PENDING'
          AND due_date < TO_CHAR(NOW(), 'YYYY-MM-DD')
      `);
      const missedPayments = Number((missedRows.rows[0] as Record<string, unknown>).missed) || 0;
      const lapseProbability = Math.min(0.95, missedPayments * 0.15 + (missedPayments > 3 ? 0.3 : 0));
      const riskLevel =
        lapseProbability > 0.7 ? "CRITICAL" :
        lapseProbability > 0.4 ? "HIGH" :
        lapseProbability > 0.2 ? "MEDIUM" : "LOW";
      return {
        policyId: input.policyId,
        lapseProbability,
        riskLevel,
        missedPayments,
        scoredAt: new Date(),
      };
    }),

  listPremiumPayments: protectedProcedure
    .input(z.object({
      policyId: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      // Scope to policies the caller holds (premium payments carry policyholder data).
      const scope = isAdminUser(ctx)
        ? sql``
        : sql`AND policy_id IN (SELECT policy_id FROM insurance_policies WHERE customer_id = ${String(ctx.user.id)})`;
      const rows = await db.execute(sql`
        SELECT * FROM insurance_premium_payments
        WHERE TRUE
        ${input.policyId ? sql`AND policy_id = ${input.policyId}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      return { payments: rows.rows as Record<string, unknown>[] };
    }),
});

// ─── Wave 214: Supply Chain Finance ──────────────────────────────────────────

export const scfRouter = router({
  listInvoices: protectedProcedure
    .input(z.object({
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM scf_invoices
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM scf_invoices
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
      `);
      return {
        invoices: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getSCFStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(amount), 0) AS total_amount,
               COALESCE(SUM(net_amount), 0) AS net_amount,
               COALESCE(SUM(discount_amount), 0) AS total_discount
        FROM scf_invoices
        ${scope}
        GROUP BY status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  submitInvoice: protectedProcedure
    .input(z.object({
      invoiceNumber: z.string(),
      supplierId: z.string(),
      supplierFsp: z.string(),
      supplierAccount: z.string(),
      buyerId: z.string(),
      buyerFsp: z.string(),
      buyerAccount: z.string(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      dueDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("SCF");
      const tokenId = `TKN-${nanoid(20).toUpperCase()}`;
      await db.execute(sql`
        INSERT INTO scf_invoices
          (id, token_id, invoice_number, supplier_id, supplier_fsp, supplier_account,
           buyer_id, buyer_fsp, buyer_account, amount, currency, due_date, status, created_by, created_at)
        VALUES
          (${id}, ${tokenId}, ${input.invoiceNumber}, ${input.supplierId}, ${input.supplierFsp},
           ${input.supplierAccount}, ${input.buyerId}, ${input.buyerFsp}, ${input.buyerAccount},
           ${input.amount}, ${input.currency}, ${input.dueDate}, 'TOKENIZED', ${ctx.user.openId}, NOW())
      `);
      return { id, tokenId, status: "TOKENIZED" };
    }),

  requestDiscount: protectedProcedure
    .input(z.object({
      invoiceId: z.string(),
      discountRate: z.number().min(0.1).max(50),
      paymentDate: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      const rows = await db.execute(sql`
        SELECT * FROM scf_invoices WHERE id = ${input.invoiceId} LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const invoice = rows.rows[0] as Record<string, unknown>;
      // Rewriting invoice amounts is restricted to the owning merchant (or admin).
      assertOwnership(invoice.created_by, ctx, "scf_invoices");
      const amountKobo = Math.round(Number(invoice.amount) * 100);
      const dueDate = new Date(String(invoice.due_date));
      const payDate = new Date(input.paymentDate);
      const daysEarly = Math.max(0, Math.floor((dueDate.getTime() - payDate.getTime()) / 86400000));
      // Integer minor-unit (kobo) math — see computeEarlyDiscountKobo.
      const { discountKobo, netKobo } = computeEarlyDiscountKobo(amountKobo, input.discountRate, daysEarly);
      const discountAmount = discountKobo / 100;
      const netAmount = netKobo / 100;

      await db.execute(sql`
        UPDATE scf_invoices
        SET discount_rate = ${input.discountRate},
            discount_amount = ${discountAmount},
            net_amount = ${netAmount},
            status = 'DISCOUNTED'
        WHERE id = ${input.invoiceId}
      `);
      return {
        invoiceId: input.invoiceId,
        originalAmount: amountKobo / 100,
        discountRate: input.discountRate,
        discountAmount,
        netAmount,
        daysEarly,
        paymentDate: input.paymentDate,
      };
    }),

  settleInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ input, ctx }) => {
      // Only the owning merchant (or admin) may mark an invoice settled.
      const rows = await db.execute(sql`
        SELECT created_by FROM scf_invoices WHERE id = ${input.invoiceId} LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      assertOwnership((rows.rows[0] as Record<string, unknown>).created_by, ctx, "scf_invoices");
      await db.execute(sql`
        UPDATE scf_invoices
        SET status = 'SETTLED', settled_at = NOW()
        WHERE id = ${input.invoiceId}
      `);
      return { success: true };
    }),
});

// ─── Wave 215: G2P Disbursements ──────────────────────────────────────────────

export const g2pRouter = router({
  listBatches: protectedProcedure
    .input(z.object({
      programType: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM g2p_disbursement_batches
        WHERE TRUE
        ${input.programType ? sql`AND program_type = ${input.programType}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM g2p_disbursement_batches
        WHERE TRUE
        ${input.programType ? sql`AND program_type = ${input.programType}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
      `);
      return {
        batches: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  // G2P batches are platform/government disbursements — admin only, funded
  // (wallet reservation) BEFORE the payable obligation is created, idempotent.
  createBatch: adminProcedure
    .input(z.object({
      programType: z.string(),
      programId: z.string(),
      payerFsp: z.string(),
      payerAccount: z.string(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      totalAmount: z.number().positive(),
      beneficiaryCount: z.number().int().positive(),
      scheduledAt: z.string().optional(),
      idempotencyKey: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: String(ctx.user.id),
        operation: "g2p.createBatch",
        requestBody: input,
        execute: async () => {
          const id = genId("G2P");
          // Reserve the funds before recording the obligation. Without the
          // middleware bridge there is no ledger to reserve against — fail
          // loud (demo payload only when PAYGATE_SIMULATION_MODE=true).
          if (!isBridgeAvailable()) {
            return demoOrFail(
              { id, status: "PENDING", funded: false },
              "g2p.createBatch fund reservation (ledger bridge unreachable)",
            );
          }
          await debitWalletViaMiddleware({
            walletId: `g2p_program_${input.programId}`,
            userId: String(ctx.user.id),
            amount: Math.round(input.totalAmount * 100),
            currency: input.currency,
            reference: id,
            description: `G2P batch ${id} fund reservation (${input.beneficiaryCount} beneficiaries)`,
          });
          await db.execute(sql`
        INSERT INTO g2p_disbursement_batches
          (id, program_type, program_id, payer_fsp, payer_account,
           amount, currency, total_amount, beneficiary_count, disbursed_count, failed_count,
           status, scheduled_at, created_by, created_at)
        VALUES
          (${id}, ${input.programType}, ${input.programId}, ${input.payerFsp}, ${input.payerAccount},
           ${input.amount}, ${input.currency}, ${input.totalAmount}, ${input.beneficiaryCount},
           0, 0, 'PENDING',
           ${input.scheduledAt ? new Date(input.scheduledAt) : null},
           ${ctx.user.openId}, NOW())
          `);
          return { id, status: "PENDING", funded: true };
        },
      });
    }),

  getBatchStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT program_type, status, COUNT(*) AS count,
               COALESCE(SUM(total_amount), 0) AS total_amount,
               COALESCE(SUM(beneficiary_count), 0) AS total_beneficiaries,
               COALESCE(SUM(disbursed_count), 0) AS total_disbursed
        FROM g2p_disbursement_batches
        ${scope}
        GROUP BY program_type, status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  resolveNIN: protectedProcedure
    .input(z.object({ nin: z.string().min(11).max(11) }))
    .query(async ({ input }) => {
      // STUB: no NIMC/NIBSS identity-resolution integration exists. Identity
      // data is regulated PII — this endpoint must NEVER return fabricated PII
      // marked VERIFIED. Fail loud in production; even in simulation the
      // status is UNVERIFIED and no identity fields are populated.
      return demoOrFail({
        nin: input.nin,
        fullName: null,
        phone: null,
        fsp: null,
        accountNumber: null,
        status: "UNVERIFIED",
        bvn: null,
        message: "SIMULATED — NIMC/NIBSS identity resolution not integrated; identity NOT verified",
      }, "g2p.resolveNIN (NIMC/NIBSS API not integrated)");
    }),

  getG2PStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(total_amount), 0) AS total_amount,
               COALESCE(SUM(beneficiary_count), 0) AS total_beneficiaries
        FROM g2p_disbursement_batches
        ${scope}
        GROUP BY status
      `);
      return rows.rows as Record<string, unknown>[];
    }),
});

// ─── Wave 216: Energy / VEND ──────────────────────────────────────────────────

export const energyRouter = router({
  listVendTransactions: protectedProcedure
    .input(z.object({
      disco: z.string().optional(),
      status: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM energy_vend_transactions
        WHERE TRUE
        ${input.disco ? sql`AND disco = ${input.disco}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM energy_vend_transactions
        WHERE TRUE
        ${input.disco ? sql`AND disco = ${input.disco}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${scope}
      `);
      return {
        transactions: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getVendStats: protectedProcedure
    .query(async ({ ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`WHERE created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT disco, status, COUNT(*) AS count,
               COALESCE(SUM(amount), 0) AS total_amount,
               COALESCE(SUM(units), 0) AS total_units
        FROM energy_vend_transactions
        ${scope}
        GROUP BY disco, status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  lookupMeter: protectedProcedure
    .input(z.object({ meterNumber: z.string(), disco: z.string() }))
    .query(async ({ input }) => {
      // STUB: no DISCO meter-lookup API integration exists. Returning a fake
      // customer for a vend is how money goes to the wrong meter — fail loud
      // in production; the simulation payload is labeled and NOT validated.
      return demoOrFail({
        meterNumber: input.meterNumber,
        customerName: null,
        address: null,
        tariffClass: null,
        minimumVend: null,
        disco: input.disco,
        isValid: false,
        message: "SIMULATED — DISCO meter lookup not integrated; meter NOT validated",
      }, "energy.lookupMeter (DISCO API not integrated)");
    }),

  initiateVend: protectedProcedure
    .input(z.object({
      meterNumber: z.string(),
      disco: z.string(),
      amount: z.number().positive(),
      currency: z.string().default("NGN"),
      customerPhone: z.string(),
      customerFsp: z.string(),
      customerAccount: z.string(),
      idempotencyKey: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: String(ctx.user.id),
        operation: "energy.initiateVend",
        requestBody: input,
        execute: async () => {
          const id = genId("VND");
          // R4 F13 (spec #13): token generation requires the Rust NEPA STS
          // engine via gRPC (PAYGATE-ENERGY-STS-001), which is NOT integrated.
          // The previous flow debited the customer's wallet and stranded the
          // row in PENDING_TOKEN forever — phantom execution of a vend that
          // could never deliver a token. Fail honestly BEFORE any money
          // moves; a demo payload exists only under PAYGATE_SIMULATION_MODE.
          return demoOrFail(
            {
              id,
              token: null,
              units: null,
              status: "NOT_AVAILABLE",
              message:
                "Energy vend unavailable — the STS vend rail is not integrated, so no token can be issued. No funds moved and no vend was recorded.",
            },
            "energy.initiateVend (STS vend rail not integrated)",
          );
        },
      });
    }),
});

// ─── Wave 217: CBDC ───────────────────────────────────────────────────────────

export const cbdcRouter = router({
  listAccounts: protectedProcedure
    .input(z.object({ rail: z.string().optional() }))
    .query(async ({ input, ctx }) => {
      const scope = isAdminUser(ctx) ? sql`` : sql`AND owner_id = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM cbdc_accounts
        WHERE TRUE
        ${input.rail ? sql`AND rail = ${input.rail}` : sql``}
        ${scope}
        ORDER BY created_at DESC
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  createAccount: protectedProcedure
    .input(z.object({
      rail: z.string(),
      walletId: z.string(),
      ownerId: z.string(),
      ownerType: z.enum(["INDIVIDUAL", "BUSINESS", "BANK", "GOVERNMENT"]),
      currency: z.string(),
    }))
    .mutation(async ({ input, ctx }) => {
      // Non-admin callers may only open accounts they own.
      if (!isAdminUser(ctx) && input.ownerId !== ctx.user.openId) {
        throw new TRPCError({ code: "FORBIDDEN", message: "Cannot create a CBDC account for another owner" });
      }
      const id = genId("CBDC");
      await db.execute(sql`
        INSERT INTO cbdc_accounts
          (id, rail, wallet_id, owner_id, owner_type, balance, currency, is_active, created_at, updated_at)
        VALUES
          (${id}, ${input.rail}, ${input.walletId}, ${input.ownerId}, ${input.ownerType},
           0, ${input.currency}, 1, NOW(), NOW())
      `);
      return { id, walletId: input.walletId, rail: input.rail };
    }),

  listTransfers: protectedProcedure
    .input(z.object({
      rail: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input, ctx }) => {
      const offset = (input.page - 1) * input.pageSize;
      const scope = isAdminUser(ctx) ? sql`` : sql`AND created_by = ${ctx.user.openId}`;
      const rows = await db.execute(sql`
        SELECT * FROM cbdc_transfers
        WHERE TRUE
        ${input.rail ? sql`AND rail = ${input.rail}` : sql``}
        ${scope}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM cbdc_transfers
        WHERE TRUE
        ${input.rail ? sql`AND rail = ${input.rail}` : sql``}
        ${scope}
      `);
      return {
        transfers: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getCBDCStats: protectedProcedure
    .query(async () => {
      const accountStats = await db.execute(sql`
        SELECT rail, COUNT(*) AS account_count, COALESCE(SUM(balance), 0) AS total_balance
        FROM cbdc_accounts GROUP BY rail
      `);
      const transferStats = await db.execute(sql`
        SELECT rail, status, COUNT(*) AS count, COALESCE(SUM(amount), 0) AS total_amount
        FROM cbdc_transfers GROUP BY rail, status
      `);
      return {
        accountStats: accountStats.rows as Record<string, unknown>[],
        transferStats: transferStats.rows as Record<string, unknown>[],
      };
    }),

  initiateTransfer: protectedProcedure
    .input(z.object({
      rail: z.enum(["ENAIRA", "ECB_TIPS", "DCEP", "FEDNOW", "SAND"]),
      senderWallet: z.string(),
      receiverWallet: z.string(),
      amount: z.number().positive(),
      currency: z.string(),
      narration: z.string().optional(),
      idempotencyKey: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      return withIdempotency({
        key: input.idempotencyKey,
        merchantId: String(ctx.user.id),
        operation: "cbdc.initiateTransfer",
        requestBody: input,
        execute: async () => {
          const id = genId("CTXN");
          const railRef = `${input.rail}-${nanoid(16).toUpperCase()}`;

          // Verify sender wallet ownership and sufficient balance before
          // recording anything.
          const acctRows = await db.execute(sql`
            SELECT * FROM cbdc_accounts
            WHERE wallet_id = ${input.senderWallet} AND rail = ${input.rail}
            LIMIT 1
          `);
          if (!acctRows.rows.length) {
            throw new TRPCError({ code: "NOT_FOUND", message: "Sender CBDC wallet not found" });
          }
          const senderAcct = acctRows.rows[0] as Record<string, unknown>;
          if (!isAdminUser(ctx) && String(senderAcct.owner_id) !== ctx.user.openId) {
            throw new TRPCError({ code: "FORBIDDEN", message: "Sender wallet belongs to a different tenant" });
          }
          if (Number(senderAcct.balance) < input.amount) {
            throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient CBDC wallet balance" });
          }

          // Truthful settlement: there is NO live eNaira/SAND rail integration
          // in this codebase. Settlement is only simulated when
          // PAYGATE_SIMULATION_MODE=true; otherwise the transfer stays
          // VALIDATED and the caller is told settlement requires the rail.
          if (isSimulationMode()) {
            demoOrFail({ railRef }, "cbdc.initiateTransfer settlement");
            // R4 F1/F13: the debit, credit and transfer record are ONE
            // transaction. The debit is a GUARDED update (balance >= amount)
            // whose affected-row count is CHECKED — previously an unchecked
            // guard let a race/overdraft debit 0 rows and still credit the
            // receiver, creating money out of thin air.
            const rowsOf = (r: any): any[] => (Array.isArray(r) ? r : (r?.rows ?? []));
            await db.transaction(async (tx) => {
              const debited = rowsOf(await tx.execute(sql`
                UPDATE cbdc_accounts
                SET balance = balance - ${input.amount}, updated_at = NOW()
                WHERE wallet_id = ${input.senderWallet} AND rail = ${input.rail}
                  AND balance >= ${input.amount}
                RETURNING wallet_id
              `));
              if (!debited.length) {
                throw new TRPCError({ code: "BAD_REQUEST", message: "Insufficient CBDC wallet balance" });
              }
              const credited = rowsOf(await tx.execute(sql`
                UPDATE cbdc_accounts
                SET balance = balance + ${input.amount}, updated_at = NOW()
                WHERE wallet_id = ${input.receiverWallet} AND rail = ${input.rail}
                RETURNING wallet_id
              `));
              if (!credited.length) {
                throw new TRPCError({ code: "NOT_FOUND", message: "Receiver CBDC wallet not found" });
              }
              await tx.execute(sql`
                INSERT INTO cbdc_transfers
                  (id, rail, sender_wallet, receiver_wallet, amount, currency,
                   narration, status, rail_ref, created_by, created_at, settled_at)
                VALUES
                  (${id}, ${input.rail}, ${input.senderWallet}, ${input.receiverWallet},
                   ${input.amount}, ${input.currency}, ${input.narration ?? null},
                   'SETTLED', ${railRef}, ${ctx.user.openId}, NOW(), NOW())
              `);
            });
            return {
              id, railRef, status: "SETTLED",
              source: "simulation", simulation: true,
              message: "Simulated settlement (PAYGATE_SIMULATION_MODE=true) — NOT a real rail movement.",
            };
          }

          await db.execute(sql`
            INSERT INTO cbdc_transfers
              (id, rail, sender_wallet, receiver_wallet, amount, currency,
               narration, status, rail_ref, created_by, created_at)
            VALUES
              (${id}, ${input.rail}, ${input.senderWallet}, ${input.receiverWallet},
               ${input.amount}, ${input.currency}, ${input.narration ?? null},
               'VALIDATED', ${railRef}, ${ctx.user.openId}, NOW())
          `);
          console.warn(
            `[CBDC] Transfer ${id} recorded VALIDATED — no ${input.rail} rail integration is live; settlement requires the rail and will NOT happen automatically.`,
          );
          return {
            id, railRef, status: "VALIDATED",
            message: `Transfer validated but NOT settled — the ${input.rail} rail integration is not live. Settlement requires the rail.`,
          };
        },
      });
    }),

  getRailHealth: protectedProcedure
    .query(async () => {
      // STUB: no live rail-health probes exist for CBDC rails — hardcoded
      // OPERATIONAL statuses are fabricated. Fail loud in production; the
      // simulation payload is labeled and reports UNKNOWN, not OPERATIONAL.
      return demoArrayOrFail([
        { rail: "ENAIRA",   status: "UNKNOWN", latencyMs: null, lastChecked: new Date().toISOString() },
        { rail: "ECB_TIPS", status: "UNKNOWN", latencyMs: null, lastChecked: new Date().toISOString() },
        { rail: "DCEP",     status: "UNKNOWN", latencyMs: null, lastChecked: new Date().toISOString() },
        { rail: "FEDNOW",   status: "UNKNOWN", latencyMs: null, lastChecked: new Date().toISOString() },
        { rail: "SAND",     status: "UNKNOWN", latencyMs: null, lastChecked: new Date().toISOString() },
      ], "cbdc.getRailHealth (no live rail-health probes)");
    }),

  // Wave 220 — Atomic Swap (CBDC <-> commercial bank money)
  initiateAtomicSwap: protectedProcedure
    .input(z.object({
      swapType: z.enum(["CBDC_TO_FIAT", "FIAT_TO_CBDC", "CBDC_TO_CBDC"]),
      sourceRail: z.string(),
      destRail: z.string(),
      sourceAmount: z.number().positive(),
      destAmount: z.number().positive(),
      sourceCurrency: z.string().default("NGN"),
      destCurrency: z.string().default("NGN"),
      sourceAccountId: z.string(),
      destAccountId: z.string(),
      destBankCode: z.string().optional(),
      // Client-supplied idempotency key — REQUIRED for this money endpoint.
      idempotency: z.string().min(8),
    }))
    .mutation(async ({ input, ctx }) => {
      return withIdempotency({
        key: input.idempotency,
        merchantId: String(ctx.user.id),
        operation: "cbdc.initiateAtomicSwap",
        requestBody: input,
        execute: async () => {
          const swapId = genId("SWAP");
          const fxRateExpiry = new Date(Date.now() + 5 * 60 * 1000);

          // Server-side FX rate — the client must NOT set its own rate.
          let fxRate: number;
          let rateSource: string;
          if (input.sourceCurrency === input.destCurrency) {
            fxRate = 1;
            rateSource = "par";
          } else {
            const rateRows = await db.execute(sql`
              SELECT exchange_rate FROM remittance_corridors
              WHERE from_currency = ${input.sourceCurrency}
                AND to_currency = ${input.destCurrency}
                AND is_active = 1
              LIMIT 1
            `);
            if (rateRows.rows.length) {
              fxRate = Number((rateRows.rows[0] as Record<string, unknown>).exchange_rate);
              rateSource = "remittance_corridors";
            } else {
              // No rate source integrated — fail loud unless simulating.
              const sim = demoOrFail({ fxRate: 1 }, "cbdc.initiateAtomicSwap FX rate source");
              fxRate = Number(sim.fxRate);
              rateSource = sim.source;
            }
          }
          // Server-computed destination amount; the client's destAmount is
          // validated against the computed quote, never trusted.
          const computedDestAmount = Math.round(input.sourceAmount * fxRate * 100) / 100;
          const drift = Math.abs(computedDestAmount - input.destAmount) / input.destAmount;
          if (drift > 0.005) {
            throw new TRPCError({
              code: "BAD_REQUEST",
              message: `destAmount ${input.destAmount} deviates from the server quote ${computedDestAmount} (rate ${fxRate}, source ${rateSource}) — re-quote and retry`,
            });
          }

          // No live atomic-swap settlement rail exists. Simulated settlement
          // only under PAYGATE_SIMULATION_MODE; otherwise record PENDING.
          if (isSimulationMode()) {
            demoOrFail({ swapId }, "cbdc.initiateAtomicSwap settlement");
            await db.execute(sql`
              INSERT INTO cbdc_transfers
                (id, rail, sender_wallet, receiver_wallet, amount, currency,
                 narration, status, rail_ref, created_by, created_at, settled_at)
              VALUES
                (${swapId}, ${input.sourceRail}, ${input.sourceAccountId}, ${input.destAccountId},
                 ${input.sourceAmount}, ${input.sourceCurrency},
                 ${'ATOMIC_SWAP:' + input.swapType}, 'SETTLED',
                 ${'SWAP-' + input.idempotency}, ${ctx.user.openId}, NOW(), NOW())
            `);
            return {
              swapId,
              status: "COMPLETED",
              source: "simulation", simulation: true,
              fxRate,
              rateSource,
              destAmount: computedDestAmount,
              fxRateExpiry: fxRateExpiry.toISOString(),
              workflowId: `atomic-swap-${swapId}`,
              message: "Simulated atomic swap settlement (PAYGATE_SIMULATION_MODE=true) — NOT a real rail movement.",
            };
          }

          await db.execute(sql`
            INSERT INTO cbdc_transfers
              (id, rail, sender_wallet, receiver_wallet, amount, currency,
               narration, status, rail_ref, created_by, created_at)
            VALUES
              (${swapId}, ${input.sourceRail}, ${input.sourceAccountId}, ${input.destAccountId},
               ${input.sourceAmount}, ${input.sourceCurrency},
               ${'ATOMIC_SWAP:' + input.swapType}, 'PENDING',
               ${'SWAP-' + input.idempotency}, ${ctx.user.openId}, NOW())
          `);
          console.warn(
            `[CBDC] Atomic swap ${swapId} recorded PENDING — no swap settlement rail is live; settlement requires the rail.`,
          );
          return {
            swapId,
            status: "PENDING",
            fxRate,
            rateSource,
            destAmount: computedDestAmount,
            fxRateExpiry: fxRateExpiry.toISOString(),
            workflowId: `atomic-swap-${swapId}`,
            message: "Atomic swap recorded PENDING — settlement requires the swap rail integration, which is not live.",
          };
        },
      });
    }),

  getAtomicSwapStatus: protectedProcedure
    .input(z.object({ swapId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM cbdc_transfers WHERE id = ${input.swapId}
      `);
      return rows.rows[0] as Record<string, unknown>;
    }),
});
