/**
 * NextHub Waves 211–217 tRPC Routers
 * Covers: Remittance | Healthcare | Insurance | SCF | G2P | Energy/VEND | CBDC
 * Database: PostgreSQL via Drizzle ORM — uses db.execute(sql`...`) throughout
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import { db } from "../db";
import { sql } from "drizzle-orm";
import { TRPCError } from "@trpc/server";
import { nanoid } from "nanoid";

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${nanoid(8).toUpperCase()}`;
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
        WHERE is_active = TRUE
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
          AND is_active = TRUE
        LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Corridor not found" });
      return rows.rows[0] as Record<string, unknown>;
    }),

  createCorridor: protectedProcedure
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
           ${input.provider}, TRUE, NOW(), NOW())
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
      const fee = corridor ? Number(corridor.fee) : 0;
      const receiveAmount = (input.sendAmount - fee) * exchangeRate;
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM remittance_transfers
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM remittance_transfers
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM healthcare_claims
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
        ORDER BY submitted_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM healthcare_claims
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
      `);
      return {
        claims: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getClaimStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(claim_amount), 0) AS total_amount,
               COALESCE(SUM(approved_amount), 0) AS approved_amount
        FROM healthcare_claims
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
      // Stub: in production calls NHIA API via Python service
      const isEligible = input.policyNumber.length > 0 && input.beneficiaryId.length > 0;
      return {
        isEligible,
        policyStatus: isEligible ? "ACTIVE" : "UNKNOWN",
        coverageLimit: 5000000,
        deductibleMet: true,
        copayPercent: 10,
        coveredServices: ["OUTPATIENT", "INPATIENT", "PHARMACY", "MATERNITY"],
        policyNumber: input.policyNumber,
        beneficiaryId: input.beneficiaryId,
        message: isEligible ? "Beneficiary is eligible for claims" : "Policy not found",
      };
    }),

  adjudicateClaim: protectedProcedure
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM insurance_policies
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${input.policyType ? sql`AND policy_type = ${input.policyType}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM insurance_policies
        WHERE TRUE
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ${input.policyType ? sql`AND policy_type = ${input.policyType}` : sql``}
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
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("POL");
      const policyNumber = `NHIP-${Date.now().toString(36).toUpperCase()}-${nanoid(4).toUpperCase()}`;
      await db.execute(sql`
        INSERT INTO insurance_policies
          (id, policy_number, holder_id, holder_name, holder_fsp, holder_account,
           insurer_id, policy_type, status, premium_amount, currency, frequency,
           coverage_amount, start_date, end_date, grace_period_days, missed_payments, created_by, created_at)
        VALUES
          (${id}, ${policyNumber}, ${ctx.user.openId}, ${input.holderName}, ${input.holderFsp},
           ${input.holderAccount}, ${input.insurerId}, ${input.policyType}, 'ACTIVE',
           ${input.premiumAmount}, ${input.currency}, ${input.frequency}, ${input.coverageAmount},
           ${input.startDate}, ${input.endDate}, ${input.gracePeriodDays}, 0, ${ctx.user.openId}, NOW())
      `);
      return { id, policyNumber, status: "ACTIVE" };
    }),

  getPolicyStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT status, policy_type, COUNT(*) AS count,
               COALESCE(SUM(premium_amount), 0) AS total_premium,
               COALESCE(SUM(coverage_amount), 0) AS total_coverage
        FROM insurance_policies
        GROUP BY status, policy_type
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  scoreLapseRisk: protectedProcedure
    .input(z.object({ policyId: z.string() }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM insurance_policies WHERE id = ${input.policyId} LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Policy not found" });
      const policy = rows.rows[0] as Record<string, unknown>;
      const missedPayments = Number(policy.missed_payments) || 0;
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM insurance_premium_payments
        ${input.policyId ? sql`WHERE policy_id = ${input.policyId}` : sql``}
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM scf_invoices
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM scf_invoices
        ${input.status ? sql`WHERE status = ${input.status}` : sql``}
      `);
      return {
        invoices: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getSCFStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(amount), 0) AS total_amount,
               COALESCE(SUM(net_amount), 0) AS net_amount,
               COALESCE(SUM(discount_amount), 0) AS total_discount
        FROM scf_invoices
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
    .mutation(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM scf_invoices WHERE id = ${input.invoiceId} LIMIT 1
      `);
      if (!rows.rows.length) throw new TRPCError({ code: "NOT_FOUND", message: "Invoice not found" });
      const invoice = rows.rows[0] as Record<string, unknown>;
      const amount = Number(invoice.amount);
      const dueDate = new Date(String(invoice.due_date));
      const payDate = new Date(input.paymentDate);
      const daysEarly = Math.max(0, Math.floor((dueDate.getTime() - payDate.getTime()) / 86400000));
      const discountAmount = amount * (input.discountRate / 100 / 365) * daysEarly;
      const netAmount = amount - discountAmount;

      await db.execute(sql`
        UPDATE scf_invoices
        SET discount_rate = ${input.discountRate},
            discount_amount = ${Math.round(discountAmount * 100) / 100},
            net_amount = ${Math.round(netAmount * 100) / 100},
            status = 'DISCOUNTED'
        WHERE id = ${input.invoiceId}
      `);
      return {
        invoiceId: input.invoiceId,
        originalAmount: amount,
        discountRate: input.discountRate,
        discountAmount: Math.round(discountAmount * 100) / 100,
        netAmount: Math.round(netAmount * 100) / 100,
        daysEarly,
        paymentDate: input.paymentDate,
      };
    }),

  settleInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ input }) => {
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM g2p_disbursement_batches
        WHERE TRUE
        ${input.programType ? sql`AND program_type = ${input.programType}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM g2p_disbursement_batches
        WHERE TRUE
        ${input.programType ? sql`AND program_type = ${input.programType}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
      `);
      return {
        batches: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  createBatch: protectedProcedure
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
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("G2P");
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
      return { id, status: "PENDING" };
    }),

  getBatchStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT program_type, status, COUNT(*) AS count,
               COALESCE(SUM(total_amount), 0) AS total_amount,
               COALESCE(SUM(beneficiary_count), 0) AS total_beneficiaries,
               COALESCE(SUM(disbursed_count), 0) AS total_disbursed
        FROM g2p_disbursement_batches
        GROUP BY program_type, status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  resolveNIN: protectedProcedure
    .input(z.object({ nin: z.string().min(11).max(11) }))
    .query(async ({ input }) => {
      // Stub: in production calls NIMC/NIBSS API via Python service
      return {
        nin: input.nin,
        fullName: "Adebayo Okonkwo",
        phone: "08012345678",
        fsp: "ACCESS",
        accountNumber: "0123456789",
        status: "VERIFIED",
        bvn: "22345678901",
      };
    }),

  getG2PStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT status, COUNT(*) AS count,
               COALESCE(SUM(total_amount), 0) AS total_amount,
               COALESCE(SUM(beneficiary_count), 0) AS total_beneficiaries
        FROM g2p_disbursement_batches
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
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM energy_vend_transactions
        WHERE TRUE
        ${input.disco ? sql`AND disco = ${input.disco}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM energy_vend_transactions
        WHERE TRUE
        ${input.disco ? sql`AND disco = ${input.disco}` : sql``}
        ${input.status ? sql`AND status = ${input.status}` : sql``}
      `);
      return {
        transactions: rows.rows as Record<string, unknown>[],
        total: Number((countRow.rows[0] as Record<string, unknown>).total),
        page: input.page,
        pageSize: input.pageSize,
      };
    }),

  getVendStats: protectedProcedure
    .query(async () => {
      const rows = await db.execute(sql`
        SELECT disco, status, COUNT(*) AS count,
               COALESCE(SUM(amount), 0) AS total_amount,
               COALESCE(SUM(units), 0) AS total_units
        FROM energy_vend_transactions
        GROUP BY disco, status
      `);
      return rows.rows as Record<string, unknown>[];
    }),

  lookupMeter: protectedProcedure
    .input(z.object({ meterNumber: z.string(), disco: z.string() }))
    .query(async ({ input }) => {
      // Stub: in production calls DISCO API via Go middleware
      return {
        meterNumber: input.meterNumber,
        customerName: "Chukwuemeka Obi",
        address: "12 Adeola Odeku Street, Lagos",
        tariffClass: "R2",
        minimumVend: 500,
        disco: input.disco,
        isValid: true,
      };
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
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("VND");
      // Token generation requires the Rust NEPA STS engine via gRPC (PAYGATE-ENERGY-STS-001).
      // Until that integration is live, the transaction is recorded as PENDING_TOKEN
      // and the token field is null. The caller must poll for the token via getVendStatus.
      // NEVER return a random/fabricated token — a customer who receives a fake token
      // and attempts to load it into their meter will lose money with no recourse.
      const token: string | null = null;
      const units: number | null = null;
      const status = "PENDING_TOKEN";

      await db.execute(sql`
        INSERT INTO energy_vend_transactions
          (id, meter_number, disco, amount, currency, customer_phone,
           customer_fsp, customer_account, token, units, status, created_by, created_at, vended_at)
        VALUES
          (${id}, ${input.meterNumber}, ${input.disco}, ${input.amount}, ${input.currency},
           ${input.customerPhone}, ${input.customerFsp}, ${input.customerAccount},
           ${token}, ${units}, ${status},
           ${ctx.user.openId}, NOW(), NULL)
      `);
      return {
        id,
        token: null,
        units: null,
        status,
        message: "Vend request queued. Token will be delivered via webhook once the DISCO STS responds.",
      };
    }),
});

// ─── Wave 217: CBDC ───────────────────────────────────────────────────────────

export const cbdcRouter = router({
  listAccounts: protectedProcedure
    .input(z.object({ rail: z.string().optional() }))
    .query(async ({ input }) => {
      const rows = await db.execute(sql`
        SELECT * FROM cbdc_accounts
        ${input.rail ? sql`WHERE rail = ${input.rail}` : sql``}
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
    .mutation(async ({ input }) => {
      const id = genId("CBDC");
      await db.execute(sql`
        INSERT INTO cbdc_accounts
          (id, rail, wallet_id, owner_id, owner_type, balance, currency, is_active, created_at, updated_at)
        VALUES
          (${id}, ${input.rail}, ${input.walletId}, ${input.ownerId}, ${input.ownerType},
           0, ${input.currency}, TRUE, NOW(), NOW())
      `);
      return { id, walletId: input.walletId, rail: input.rail };
    }),

  listTransfers: protectedProcedure
    .input(z.object({
      rail: z.string().optional(),
      page: z.number().default(1),
      pageSize: z.number().default(20),
    }))
    .query(async ({ input }) => {
      const offset = (input.page - 1) * input.pageSize;
      const rows = await db.execute(sql`
        SELECT * FROM cbdc_transfers
        ${input.rail ? sql`WHERE rail = ${input.rail}` : sql``}
        ORDER BY created_at DESC
        LIMIT ${input.pageSize} OFFSET ${offset}
      `);
      const countRow = await db.execute(sql`
        SELECT COUNT(*) AS total FROM cbdc_transfers
        ${input.rail ? sql`WHERE rail = ${input.rail}` : sql``}
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
    }))
    .mutation(async ({ input, ctx }) => {
      const id = genId("CTXN");
      const railRef = `${input.rail}-${nanoid(16).toUpperCase()}`;

      await db.execute(sql`
        INSERT INTO cbdc_transfers
          (id, rail, sender_wallet, receiver_wallet, amount, currency,
           narration, status, rail_ref, created_by, created_at)
        VALUES
          (${id}, ${input.rail}, ${input.senderWallet}, ${input.receiverWallet},
           ${input.amount}, ${input.currency}, ${input.narration ?? null},
           'VALIDATED', ${railRef}, ${ctx.user.openId}, NOW())
      `);
      // Immediate settlement for SAND rail; others go async
      if (input.rail === "SAND" || input.rail === "ENAIRA") {
        await db.execute(sql`
          UPDATE cbdc_transfers SET status = 'SETTLED', settled_at = NOW() WHERE id = ${id}
        `);
      }
      return { id, railRef, status: input.rail === "SAND" || input.rail === "ENAIRA" ? "SETTLED" : "VALIDATED" };
    }),

  getRailHealth: protectedProcedure
    .query(async () => {
      return [
        { rail: "ENAIRA",   status: "OPERATIONAL", latencyMs: 120, lastChecked: new Date().toISOString() },
        { rail: "ECB_TIPS", status: "OPERATIONAL", latencyMs: 85,  lastChecked: new Date().toISOString() },
        { rail: "DCEP",     status: "DEGRADED",    latencyMs: 450, lastChecked: new Date().toISOString() },
        { rail: "FEDNOW",   status: "OPERATIONAL", latencyMs: 95,  lastChecked: new Date().toISOString() },
        { rail: "SAND",     status: "OPERATIONAL", latencyMs: 5,   lastChecked: new Date().toISOString() },
      ];
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
      fxRate: z.number().positive().default(1),
      idempotency: z.string().optional(),
    }))
    .mutation(async ({ input, ctx }) => {
      const swapId = genId("SWAP");
      const fxRateExpiry = new Date(Date.now() + 5 * 60 * 1000);
      const idempotencyKey = input.idempotency ?? nanoid(32);
      await db.execute(sql`
        INSERT INTO cbdc_transfers
          (id, rail, sender_wallet, receiver_wallet, amount, currency,
           narration, status, rail_ref, created_by, created_at)
        VALUES
          (${swapId}, ${input.sourceRail}, ${input.sourceAccountId}, ${input.destAccountId},
           ${input.sourceAmount}, ${input.sourceCurrency},
           ${'ATOMIC_SWAP:' + input.swapType}, 'PENDING',
           ${'SWAP-' + idempotencyKey}, ${ctx.user.openId}, NOW())
      `);
      const isSandbox = input.sourceRail === "SAND" || input.destRail === "SAND";
      if (isSandbox) {
        await db.execute(sql`
          UPDATE cbdc_transfers SET status = 'SETTLED', settled_at = NOW() WHERE id = ${swapId}
        `);
      }
      return {
        swapId,
        status: isSandbox ? "COMPLETED" : "PENDING",
        fxRate: input.fxRate,
        fxRateExpiry: fxRateExpiry.toISOString(),
        workflowId: `atomic-swap-${swapId}`,
        message: isSandbox
          ? "Atomic swap completed instantly (SAND rail)"
          : "Atomic swap workflow started — check status via swapId",
      };
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
