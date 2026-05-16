// @ts-nocheck
/**
 * PayGate Tier 1–5 Features Router
 * All 20 new features across 5 tiers implemented as tRPC procedures.
 * Routes proxy to the Go bridge, Python microservices, and direct DB operations.
 */
import { z } from 'zod';
import { protectedProcedure, router } from './_core/trpc';

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? 'http://localhost:8080';
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY ?? '';
const AI_INSIGHTS_URL = process.env.AI_INSIGHTS_URL ?? 'http://localhost:8098';
const AML_MONITOR_URL = process.env.AML_MONITOR_URL ?? 'http://localhost:8097';
const FRAUD_HEATMAP_URL = process.env.FRAUD_HEATMAP_URL ?? 'http://localhost:8099';

async function bridgePost(path: string, body: unknown) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Internal-Key': BRIDGE_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    const text = await res.text();
    throw new Error(`Bridge error ${res.status}: ${text}`);
  }
  return res.json();
}

async function bridgeGet(path: string) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { 'X-Internal-Key': BRIDGE_KEY },
  });
  if (!res.ok) throw new Error(`Bridge GET error ${res.status}`);
  return res.json();
}

// ─── Tier 1a: Merchant Lending ────────────────────────────────────────────────

export const merchantLendingRouter = router({
  applyForLoan: protectedProcedure
    .input(z.object({
      requestedAmountKobo: z.number().positive(),
      purposeCode: z.enum(['inventory', 'equipment', 'working_capital', 'expansion', 'other']),
      repaymentDays: z.number().int().min(30).max(365),
      notes: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/lending/apply', {
        merchant_id: ctx.user.id,
        requested_amount_kobo: input.requestedAmountKobo,
        purpose_code: input.purposeCode,
        repayment_days: input.repaymentDays,
        notes: input.notes,
      });
    }),

  getLoanApplications: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/lending/applications?merchant_id=${ctx.user.id}`);
    }),

  getLoanOffers: protectedProcedure
    .input(z.object({ applicationId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/lending/offers?application_id=${input.applicationId}&merchant_id=${ctx.user.id}`);
    }),

  acceptLoanOffer: protectedProcedure
    .input(z.object({ offerId: z.string(), applicationId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/lending/accept', {
        offer_id: input.offerId,
        application_id: input.applicationId,
        merchant_id: ctx.user.id,
      });
    }),

  getLoanRepaymentSchedule: protectedProcedure
    .input(z.object({ loanId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/lending/repayment?loan_id=${input.loanId}&merchant_id=${ctx.user.id}`);
    }),

  getCreditScore: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/lending/credit-score?merchant_id=${ctx.user.id}`);
    }),
});

// ─── Tier 1b: Split Payments ──────────────────────────────────────────────────

export const splitPaymentsRouter = router({
  createSplitRule: protectedProcedure
    .input(z.object({
      ruleName: z.string().min(1),
      splits: z.array(z.object({
        recipientId: z.string(),
        recipientType: z.enum(['merchant', 'account', 'platform']),
        splitType: z.enum(['percentage', 'fixed_kobo']),
        value: z.number().positive(),
        description: z.string().optional(),
      })).min(2).max(10),
      triggerEvents: z.array(z.string()),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/split-payments/rules', {
        merchant_id: ctx.user.id,
        rule_name: input.ruleName,
        splits: input.splits,
        trigger_events: input.triggerEvents,
      });
    }),

  getSplitRules: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/split-payments/rules?merchant_id=${ctx.user.id}`);
    }),

  executeSplitPayment: protectedProcedure
    .input(z.object({
      ruleId: z.string(),
      totalAmountKobo: z.number().positive(),
      reference: z.string(),
      metadata: z.record(z.string(), z.string(), z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/split-payments/execute', {
        rule_id: input.ruleId,
        merchant_id: ctx.user.id,
        total_amount_kobo: input.totalAmountKobo,
        reference: input.reference,
        metadata: input.metadata,
      });
    }),

  getSplitHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().max(100).default(50) }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/split-payments/history?merchant_id=${ctx.user.id}&limit=${input.limit}`);
    }),
});

// ─── Tier 1c: Recurring Billing ───────────────────────────────────────────────

export const recurringBillingRouter = router({
  createPlan: protectedProcedure
    .input(z.object({
      planName: z.string().min(1),
      amountKobo: z.number().positive(),
      currency: z.string().default('NGN'),
      intervalType: z.enum(['daily', 'weekly', 'monthly', 'quarterly', 'annually']),
      intervalCount: z.number().int().min(1).default(1),
      trialDays: z.number().int().min(0).default(0),
      maxCycles: z.number().int().optional(),
      description: z.string().optional(),
      paymentMethods: z.array(z.string()).default(['card', 'bank_transfer']),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/billing/plans', {
        merchant_id: ctx.user.id,
        ...input,
      });
    }),

  getPlans: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/billing/plans?merchant_id=${ctx.user.id}`);
    }),

  subscribeCustomer: protectedProcedure
    .input(z.object({
      planId: z.string(),
      customerId: z.string(),
      customerEmail: z.string().email(),
      startDate: z.string().optional(),
      metadata: z.record(z.string(), z.string(), z.string(), z.any()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/billing/subscribe', {
        merchant_id: ctx.user.id,
        ...input,
      });
    }),

  getSubscriptions: protectedProcedure
    .input(z.object({
      status: z.enum(['active', 'paused', 'cancelled', 'expired', 'all']).default('active'),
    }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/billing/subscriptions?merchant_id=${ctx.user.id}&status=${input.status}`);
    }),

  pauseSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string(), resumeDate: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/billing/pause', { subscription_id: input.subscriptionId, merchant_id: String(ctx.user.id), resume_date: input.resumeDate });
    }),

  cancelSubscription: protectedProcedure
    .input(z.object({ subscriptionId: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/billing/cancel', { subscription_id: input.subscriptionId, merchant_id: String(ctx.user.id), reason: input.reason });
    }),

  getDunningQueue: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/billing/dunning?merchant_id=${ctx.user.id}`);
    }),
});

// ─── Tier 1d: Dynamic Currency Conversion ─────────────────────────────────────

export const dccRouter = router({
  getLiveRates: protectedProcedure
    .input(z.object({
      baseCurrency: z.string().default('NGN'),
      targetCurrencies: z.array(z.string()).default(['USD', 'GBP', 'EUR', 'GHS', 'KES', 'ZAR']),
    }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/dcc/rates?base=${input.baseCurrency}&targets=${input.targetCurrencies.join(',')}`);
    }),

  lockRate: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      amountKobo: z.number().positive(),
      lockDurationSeconds: z.number().int().min(30).max(300).default(120),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/dcc/lock-rate', {
        merchant_id: ctx.user.id,
        from_currency: input.fromCurrency,
        to_currency: input.toCurrency,
        amount_kobo: input.amountKobo,
        lock_duration_seconds: input.lockDurationSeconds,
      });
    }),

  executeDCCPayment: protectedProcedure
    .input(z.object({
      rateLockId: z.string(),
      paymentReference: z.string(),
      customerId: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/dcc/execute', {
        rate_lock_id: input.rateLockId,
        payment_reference: input.paymentReference,
        customer_id: input.customerId,
        merchant_id: ctx.user.id,
      });
    }),

  getDCCMarginConfig: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/dcc/margin-config?merchant_id=${ctx.user.id}`);
    }),

  updateDCCMargin: protectedProcedure
    .input(z.object({
      currency: z.string(),
      marginPct: z.number().min(0).max(10),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/dcc/margin-config', {
        merchant_id: ctx.user.id,
        currency: input.currency,
        margin_pct: input.marginPct,
      });
    }),
});

// ─── Tier 2a: Automated Reconciliation ───────────────────────────────────────

export const reconciliationRouter = router({
  runReconciliation: protectedProcedure
    .input(z.object({
      periodStart: z.string(),
      periodEnd: z.string(),
      sources: z.array(z.string()).default(['transactions', 'settlements', 'stripe', 'bank']),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/reconciliation/run', {
        merchant_id: ctx.user.id,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        sources: input.sources,
      });
    }),

  getReconciliationReport: protectedProcedure
    .input(z.object({ reportId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/reconciliation/report?report_id=${input.reportId}&merchant_id=${ctx.user.id}`);
    }),

  getDiscrepancies: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'resolved', 'all']).default('open'),
      limit: z.number().int().max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/reconciliation/discrepancies?merchant_id=${ctx.user.id}&status=${input.status}&limit=${input.limit}`);
    }),

  resolveDiscrepancy: protectedProcedure
    .input(z.object({
      discrepancyId: z.string(),
      resolution: z.string(),
      notes: z.string().max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/reconciliation/resolve', {
        discrepancy_id: input.discrepancyId,
        merchant_id: ctx.user.id,
        resolution: input.resolution,
        notes: input.notes,
      });
    }),
});

// ─── Tier 2b: Smart Invoice Builder ──────────────────────────────────────────

export const invoiceBuilderRouter = router({
  createInvoice: protectedProcedure
    .input(z.object({
      customerEmail: z.string().email(),
      customerName: z.string(),
      customerId: z.string().optional(),
      lineItems: z.array(z.object({
        description: z.string().max(5000),
        quantity: z.number().positive(),
        unitPriceKobo: z.number().positive(),
        taxPct: z.number().min(0).max(100).default(0),
        discountPct: z.number().min(0).max(100).default(0),
      })).min(1),
      currency: z.string().default('NGN'),
      dueDays: z.number().int().min(1).default(30),
      notes: z.string().optional(),
      paymentMethods: z.array(z.string()).default(['card', 'bank_transfer', 'ussd']),
      autoRemind: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/invoices/create', {
        merchant_id: ctx.user.id,
        customer_id: input.customerId,
        customer_email: input.customerEmail,
        customer_name: input.customerName,
        line_items: input.lineItems,
        currency: input.currency,
        due_days: input.dueDays,
        notes: input.notes,
        payment_methods: input.paymentMethods,
        auto_remind: input.autoRemind,
      });
    }),

  sendInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/invoices/send', { invoice_id: input.invoiceId, merchant_id: ctx.user.id });
    }),

  getInvoices: protectedProcedure
    .input(z.object({
      status: z.enum(['draft', 'sent', 'partially_paid', 'paid', 'overdue', 'cancelled', 'all']).default('all'),
      limit: z.number().int().max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/invoices/list?merchant_id=${ctx.user.id}&status=${input.status}&limit=${input.limit}`);
    }),

  getInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/invoices/get?invoice_id=${input.invoiceId}&merchant_id=${ctx.user.id}`);
    }),

  cancelInvoice: protectedProcedure
    .input(z.object({ invoiceId: z.string(), reason: z.string().max(5000) }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/invoices/cancel', { invoice_id: input.invoiceId, merchant_id: ctx.user.id, reason: input.reason });
    }),
});

// ─── Tier 2c: Chargeback Automation ──────────────────────────────────────────

export const chargebackRouter = router({
  getChargebacks: protectedProcedure
    .input(z.object({
      status: z.enum(['open', 'evidence_submitted', 'won', 'lost', 'all']).default('open'),
    }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/chargebacks/list?merchant_id=${ctx.user.id}&status=${input.status}`);
    }),

  submitEvidence: protectedProcedure
    .input(z.object({
      chargebackId: z.string(),
      evidenceType: z.enum(['receipt', 'delivery_proof', 'customer_communication', 'refund_proof', 'other']),
      evidenceUrl: z.string().url(),
      description: z.string().max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/chargebacks/evidence', {
        chargeback_id: input.chargebackId,
        merchant_id: ctx.user.id,
        evidence_type: input.evidenceType,
        evidence_url: input.evidenceUrl,
        description: input.description,
      });
    }),

  autoCollectEvidence: protectedProcedure
    .input(z.object({ chargebackId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/chargebacks/auto-evidence', {
        chargeback_id: input.chargebackId,
        merchant_id: ctx.user.id,
      });
    }),
});

// ─── Tier 3a: AML Monitoring ──────────────────────────────────────────────────

export const amlRouter = router({
  getAlerts: protectedProcedure
    .input(z.object({
      severity: z.enum(['low', 'medium', 'high', 'critical', 'all']).default('all'),
      status: z.enum(['open', 'under_review', 'cleared', 'escalated', 'all']).default('open'),
      limit: z.number().int().max(200).default(50),
    }))
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({
        merchant_id: String(ctx.user.id),
        limit: String(input.limit),
      });
      if (input.severity !== 'all') params.set('severity', input.severity);
      if (input.status !== 'all') params.set('status', input.status);
      const res = await fetch(`${AML_MONITOR_URL}/alerts?${params}`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  updateAlert: protectedProcedure
    .input(z.object({
      alertId: z.string(),
      status: z.enum(['under_review', 'cleared', 'escalated', 'reported']),
      notes: z.string().max(5000),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await fetch(`${AML_MONITOR_URL}/alerts/${input.alertId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          alert_id: input.alertId,
          status: input.status,
          notes: input.notes,
          reviewed_by: ctx.user.id,
        }),
      });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  getMerchantRiskScore: protectedProcedure
    .query(async ({ ctx }) => {
      const res = await fetch(`${AML_MONITOR_URL}/risk-score/${ctx.user.id}`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),
});

// ─── Tier 3b: KYB Workflow ────────────────────────────────────────────────────

export const kybRouter = router({
  submitKYB: protectedProcedure
    .input(z.object({
      businessName: z.string().min(1),
      rcNumber: z.string().min(5),
      taxId: z.string().min(8),
      businessType: z.enum(['sole_proprietor', 'partnership', 'limited_company', 'ngo']),
      industryCode: z.string(),
      businessAddress: z.string(),
      directorIds: z.array(z.string()).min(1),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/kyb/submit', {
        merchant_id: ctx.user.id,
        business_name: input.businessName,
        rc_number: input.rcNumber,
        tax_id: input.taxId,
        business_type: input.businessType,
        industry_code: input.industryCode,
        business_address: input.businessAddress,
        director_ids: input.directorIds,
        initiated_by: ctx.user.id,
      });
    }),

  getKYBStatus: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/kyb/status?merchant_id=${ctx.user.id}`);
    }),

  getComplianceReports: protectedProcedure
    .input(z.object({ reportType: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const params = new URLSearchParams({ merchant_id: String(ctx.user.id) });
      if (input.reportType) params.set('report_type', input.reportType);
      return bridgeGet(`/kyb/reports?${params}`);
    }),

  generateCBNReport: protectedProcedure
    .input(z.object({
      reportType: z.enum(['monthly_transaction', 'aml_sar', 'ctr', 'kyb_summary']),
      periodStart: z.string(),
      periodEnd: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/kyb/cbn-report', {
        merchant_id: ctx.user.id,
        report_type: input.reportType,
        period_start: input.periodStart,
        period_end: input.periodEnd,
        generated_by: ctx.user.id,
      });
    }),
});

// ─── Tier 3c: Device Fingerprinting & Session Risk ────────────────────────────

export const sessionRiskRouter = router({
  recordFingerprint: protectedProcedure
    .input(z.object({
      fingerprintId: z.string(),
      components: z.record(z.string(), z.string(), z.string(), z.any()),
      userAgent: z.string(),
      ipAddress: z.string().optional(),
      timezone: z.string().optional(),
      screenResolution: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/session-risk/fingerprint', {
        user_id: ctx.user.id,
        fingerprint_id: input.fingerprintId,
        components: input.components,
        user_agent: input.userAgent,
        ip_address: input.ipAddress,
        timezone: input.timezone,
        screen_resolution: input.screenResolution,
      });
    }),

  getSessionRisk: protectedProcedure
    .input(z.object({ sessionId: z.string() }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/session-risk/score?session_id=${input.sessionId}&user_id=${ctx.user.id}`);
    }),

  getRiskHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/session-risk/history?user_id=${ctx.user.id}&limit=${input.limit}`);
    }),
});

// ─── Tier 4a: Open Banking ────────────────────────────────────────────────────

export const openBankingRouter = router({
  issueConsentToken: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      dataTypes: z.array(z.enum(['account_balance', 'transaction_history', 'credit_score'])),
      expiresInSeconds: z.number().int().min(300).max(86400).default(3600),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/open-banking/consent', {
        merchant_id: ctx.user.id,
        customer_id: input.customerId,
        data_types: input.dataTypes,
        expires_in_seconds: input.expiresInSeconds,
      });
    }),

  getCustomerData: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      dataType: z.enum(['account_balance', 'transaction_history', 'credit_score']),
      consentToken: z.string(),
    }))
    .query(async ({ ctx, input }) => {
      return bridgePost('/open-banking/data', {
        merchant_id: ctx.user.id,
        customer_id: input.customerId,
        data_type: input.dataType,
        consent_token: input.consentToken,
      });
    }),

  issueSDKToken: protectedProcedure
    .input(z.object({
      scopes: z.array(z.string()).default(['payments', 'data']),
      expiresIn: z.number().int().min(300).max(86400).default(3600),
      environment: z.enum(['sandbox', 'production']).default('production'),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/sdk/token', {
        merchant_id: ctx.user.id,
        scopes: input.scopes,
        expires_in: input.expiresIn,
        environment: input.environment,
      });
    }),
});

// ─── Tier 4b: Loyalty & Rewards ───────────────────────────────────────────────

export const loyaltyRouter = router({
  getLoyaltyAccount: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/loyalty/account?user_id=${ctx.user.id}`);
    }),

  getPointsBalance: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/loyalty/balance?user_id=${ctx.user.id}`);
    }),

  getTransactionHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/loyalty/transactions?user_id=${ctx.user.id}&limit=${input.limit}`);
    }),

  redeemPoints: protectedProcedure
    .input(z.object({
      pointsToRedeem: z.number().int().min(500),
      redemptionType: z.enum(['cashback', 'voucher', 'transfer_fee_waiver']),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/loyalty/redeem', {
        user_id: ctx.user.id,
        points_to_redeem: input.pointsToRedeem,
        redemption_type: input.redemptionType,
      });
    }),

  getTierBenefits: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/loyalty/tier-benefits?user_id=${ctx.user.id}`);
    }),

  getMerchantLoyaltyStats: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/loyalty/merchant-stats?merchant_id=${ctx.user.id}`);
    }),
});

// ─── Tier 4c: Embedded Finance SDK ───────────────────────────────────────────

export const embeddedFinanceRouter = router({
  registerWebhook: protectedProcedure
    .input(z.object({
      endpointUrl: z.string().url(),
      events: z.array(z.string()).min(1),
      signingSecret: z.string().min(16),
    }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/webhooks/register', {
        merchant_id: ctx.user.id,
        endpoint_url: input.endpointUrl,
        events: input.events,
        signing_secret: input.signingSecret,
      });
    }),

  getWebhooks: protectedProcedure
    .query(async ({ ctx }) => {
      return bridgeGet(`/webhooks/list?merchant_id=${ctx.user.id}`);
    }),

  deleteWebhook: protectedProcedure
    .input(z.object({ endpointId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/webhooks/delete', { endpoint_id: input.endpointId, merchant_id: ctx.user.id });
    }),

  getWebhookDeliveries: protectedProcedure
    .input(z.object({ endpointId: z.string(), limit: z.number().int().max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      return bridgeGet(`/webhooks/deliveries?endpoint_id=${input.endpointId}&merchant_id=${ctx.user.id}&limit=${input.limit}`);
    }),

  retryWebhookDelivery: protectedProcedure
    .input(z.object({ deliveryId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      return bridgePost('/webhooks/retry', { delivery_id: input.deliveryId, merchant_id: ctx.user.id });
    }),
});

// ─── Tier 5a: AI Merchant Insights ───────────────────────────────────────────

export const aiInsightsRouter = router({
  getInsights: protectedProcedure
    .input(z.object({
      periodDays: z.number().int().min(7).max(365).default(30),
      insightTypes: z.array(z.string()).default(['revenue', 'customers', 'products', 'risk']),
    }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(`${AI_INSIGHTS_URL}/insights`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: ctx.user.id,
          period_days: input.periodDays,
          insight_types: input.insightTypes,
        }),
      });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  getCohortAnalysis: protectedProcedure
    .input(z.object({
      cohortPeriod: z.enum(['weekly', 'monthly']).default('monthly'),
      lookbackMonths: z.number().int().min(1).max(24).default(6),
    }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(`${AI_INSIGHTS_URL}/cohort-analysis`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: ctx.user.id,
          cohort_period: input.cohortPeriod,
          lookback_months: input.lookbackMonths,
        }),
      });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  getSettlementForecast: protectedProcedure
    .input(z.object({ forecastDays: z.number().int().min(1).max(30).default(7) }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(`${AI_INSIGHTS_URL}/settlement-forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          merchant_id: ctx.user.id,
          forecast_days: input.forecastDays,
        }),
      });
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),
});

// ─── Tier 5b: Fraud Heatmap ───────────────────────────────────────────────────

export const fraudHeatmapRouter = router({
  getHeatmapData: protectedProcedure
    .input(z.object({
      hours: z.number().int().min(1).max(168).default(24),
    }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(
        `${FRAUD_HEATMAP_URL}/heatmap?hours=${input.hours}&merchant_id=${ctx.user.id}`
      );
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  getClusters: protectedProcedure
    .input(z.object({
      hours: z.number().int().min(1).max(168).default(24),
      radiusKm: z.number().min(0.5).max(50).default(5),
    }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(
        `${FRAUD_HEATMAP_URL}/clusters?hours=${input.hours}&radius_km=${input.radiusKm}&merchant_id=${ctx.user.id}`
      );
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),

  getVelocityByRegion: protectedProcedure
    .input(z.object({ hours: z.number().int().min(1).max(168).default(24) }))
    .query(async ({ ctx, input }) => {
      const res = await fetch(`${FRAUD_HEATMAP_URL}/velocity?hours=${input.hours}`);
      if (!res.ok) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: `External service returned ${res.status}` });
      return res.json();
    }),
});

// ─── Master export ────────────────────────────────────────────────────────────

export const tier1to5Router = router({
  // Tier 1
  lending: merchantLendingRouter,
  splitPayments: splitPaymentsRouter,
  recurringBilling: recurringBillingRouter,
  dcc: dccRouter,
  // Tier 2
  reconciliation: reconciliationRouter,
  invoiceBuilder: invoiceBuilderRouter,
  chargeback: chargebackRouter,
  // Tier 3
  aml: amlRouter,
  kyb: kybRouter,
  sessionRisk: sessionRiskRouter,
  // Tier 4
  openBanking: openBankingRouter,
  loyalty: loyaltyRouter,
  embeddedFinance: embeddedFinanceRouter,
  // Tier 5
  aiInsights: aiInsightsRouter,
  fraudHeatmap: fraudHeatmapRouter,
});
