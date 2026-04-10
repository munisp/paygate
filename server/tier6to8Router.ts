/**
 * Tier 6-8 Feature Router
 * Covers all 20 new features:
 *  T6: Insurance Premium Collection, Carbon Credit Marketplace, NFT Loyalty Badges,
 *      BNPL v2 with Credit Bureau, Crypto On/Off Ramp, Escrow Service,
 *      Bulk Payment Scheduler, Tax Withholding Engine
 *  T7: Regulatory Sandbox Mode, Multi-Currency Wallet v2, Real-Time Gross Settlement,
 *      ISO 20022 Message Bus, Open Finance Hub, Merchant White-Label SDK
 *  T8: Consumer Super App Shell, Platform Analytics Lakehouse v2,
 *      Payroll-as-a-Service v2, Agent Banking Network v2,
 *      Cross-Border Remittance v2, Merchant POS Terminal v2
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "./_core/trpc";
import { invokeLLM } from "./_core/llm";

const BRIDGE_URL = process.env.MIDDLEWARE_BRIDGE_URL ?? "http://localhost:8080";
const BRIDGE_KEY = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";

async function bridgePost(path: string, body: unknown) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", "X-Internal-Key": BRIDGE_KEY },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`Bridge error ${res.status}: ${await res.text()}`);
  return res.json();
}

async function bridgeGet(path: string) {
  const res = await fetch(`${BRIDGE_URL}${path}`, {
    headers: { "X-Internal-Key": BRIDGE_KEY },
  });
  if (!res.ok) throw new Error(`Bridge error ${res.status}: ${await res.text()}`);
  return res.json();
}

// ─── Tier 6: Insurance Premium Collection ─────────────────────────────────────
const insuranceRouter = router({
  getProducts: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/insurance/products?merchantId=${ctx.user.id}`);
    return res as {
      products: { id: string; name: string; provider: string; premiumKobo: number; coverageType: string; durationDays: number }[];
    };
  }),
  enrollCustomer: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      productId: z.string(),
      phoneNumber: z.string(),
      idNumber: z.string(),
      beneficiaryName: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/insurance/enroll", { ...input, merchantId: ctx.user.id });
      return res as { policyId: string; premiumKobo: number; startDate: string; expiryDate: string; status: string };
    }),
  collectPremium: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      paymentMethod: z.enum(["wallet", "bank_transfer", "ussd", "card"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/insurance/collect-premium", { ...input, merchantId: ctx.user.id });
      return res as { transactionId: string; status: string; receiptUrl: string };
    }),
  getPolicies: protectedProcedure
    .input(z.object({ status: z.enum(["active", "expired", "cancelled", "all"]).default("all") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/insurance/policies?merchantId=${ctx.user.id}&status=${input.status}`);
      return res as { policies: { policyId: string; customerId: string; productName: string; status: string; premiumKobo: number; expiryDate: string }[] };
    }),
  fileClaim: protectedProcedure
    .input(z.object({
      policyId: z.string(),
      claimType: z.string(),
      description: z.string(),
      evidenceUrls: z.array(z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/insurance/claim", { ...input, merchantId: ctx.user.id });
      return res as { claimId: string; status: string; estimatedPayoutKobo: number };
    }),
});

// ─── Tier 6: Carbon Credit Marketplace ───────────────────────────────────────
const carbonCreditRouter = router({
  getListings: publicProcedure
    .input(z.object({ projectType: z.string().optional(), minCredits: z.number().optional() }))
    .query(async ({ input }) => {
      const res = await bridgeGet(`/carbon/listings?projectType=${input.projectType || ""}&minCredits=${input.minCredits || 0}`);
      return res as {
        listings: { id: string; projectName: string; country: string; creditType: string; pricePerTonneUSD: number; availableCredits: number; verified: boolean }[];
      };
    }),
  purchaseCredits: protectedProcedure
    .input(z.object({
      listingId: z.string(),
      tonnes: z.number().positive(),
      retirementPurpose: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/carbon/purchase", { ...input, merchantId: ctx.user.id });
      return res as { certificateId: string; tonnes: number; totalCostUSD: number; retirementDate: string; registryUrl: string };
    }),
  getMyCertificates: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/carbon/certificates?merchantId=${ctx.user.id}`);
    return res as { certificates: { id: string; projectName: string; tonnes: number; retiredAt: string; registryUrl: string }[] };
  }),
  getEmissionsReport: protectedProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2030) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/carbon/emissions-report?merchantId=${ctx.user.id}&year=${input.year}`);
      return res as { totalEmissionsTonnes: number; offsetTonnes: number; netEmissions: number; score: string };
    }),
});

// ─── Tier 6: NFT Loyalty Badges ──────────────────────────────────────────────
const nftBadgesRouter = router({
  getCollections: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/nft/collections?merchantId=${ctx.user.id}`);
    return res as { collections: { id: string; name: string; symbol: string; totalMinted: number; maxSupply: number; imageUrl: string }[] };
  }),
  createCollection: protectedProcedure
    .input(z.object({
      name: z.string().min(1),
      symbol: z.string().min(1).max(10),
      description: z.string(),
      maxSupply: z.number().int().positive(),
      imageUrl: z.string().url(),
      badgeTiers: z.array(z.object({ tier: z.string(), minPoints: z.number(), imageUrl: z.string() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/nft/create-collection", { ...input, merchantId: ctx.user.id });
      return res as { collectionId: string; contractAddress: string; txHash: string };
    }),
  mintBadge: protectedProcedure
    .input(z.object({
      collectionId: z.string(),
      customerId: z.string(),
      tier: z.string(),
      metadata: z.record(z.string(), z.string()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/nft/mint", { ...input, merchantId: ctx.user.id });
      return res as { tokenId: string; txHash: string; walletAddress: string; metadataUrl: string };
    }),
  getCustomerBadges: protectedProcedure
    .input(z.object({ customerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/nft/customer-badges?merchantId=${ctx.user.id}&customerId=${input.customerId}`);
      return res as { badges: { tokenId: string; collectionName: string; tier: string; mintedAt: string; imageUrl: string }[] };
    }),
});

// ─── Tier 6: BNPL v2 with Credit Bureau ──────────────────────────────────────
const bnplV2Router = router({
  checkEligibility: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      amountKobo: z.number().positive(),
      bvn: z.string().optional(),
      nin: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/bnpl-v2/eligibility", { ...input, merchantId: ctx.user.id });
      return res as {
        eligible: boolean;
        creditScore: number;
        maxAmountKobo: number;
        approvedTerms: { months: number; interestRate: number; monthlyPaymentKobo: number }[];
        bureauReport: { provider: string; score: number; reportDate: string };
      };
    }),
  createLoan: protectedProcedure
    .input(z.object({
      customerId: z.string(),
      amountKobo: z.number().positive(),
      termMonths: z.number().int().min(1).max(24),
      orderId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/bnpl-v2/create-loan", { ...input, merchantId: ctx.user.id });
      return res as { loanId: string; disbursedAt: string; schedule: { dueDate: string; amountKobo: number }[] };
    }),
  getLoans: protectedProcedure
    .input(z.object({ status: z.enum(["active", "completed", "defaulted", "all"]).default("all") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/bnpl-v2/loans?merchantId=${ctx.user.id}&status=${input.status}`);
      return res as { loans: { loanId: string; customerId: string; amountKobo: number; status: string; nextDueDate: string; outstandingKobo: number }[] };
    }),
  reportRepayment: protectedProcedure
    .input(z.object({ loanId: z.string(), amountKobo: z.number().positive(), paymentMethod: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/bnpl-v2/repayment", { ...input, merchantId: ctx.user.id });
      return res as { status: string; remainingKobo: number; bureauUpdated: boolean };
    }),
});

// ─── Tier 6: Crypto On/Off Ramp ──────────────────────────────────────────────
const cryptoRampRouter = router({
  getQuote: protectedProcedure
    .input(z.object({
      direction: z.enum(["on_ramp", "off_ramp"]),
      cryptoCurrency: z.enum(["USDC", "USDT", "BTC", "ETH"]),
      fiatAmountKobo: z.number().positive().optional(),
      cryptoAmount: z.number().positive().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/crypto-ramp/quote?direction=${input.direction}&crypto=${input.cryptoCurrency}&fiatKobo=${input.fiatAmountKobo || 0}&cryptoAmt=${input.cryptoAmount || 0}&merchantId=${ctx.user.id}`);
      return res as { fiatAmountKobo: number; cryptoAmount: number; exchangeRate: number; fee: number; expiresAt: string; quoteId: string };
    }),
  executeRamp: protectedProcedure
    .input(z.object({
      quoteId: z.string(),
      walletAddress: z.string().optional(),
      bankAccountId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/crypto-ramp/execute", { ...input, merchantId: ctx.user.id });
      return res as { transactionId: string; status: string; txHash: string | null; estimatedCompletionMinutes: number };
    }),
  getTransactions: protectedProcedure
    .input(z.object({ limit: z.number().int().min(1).max(100).default(20) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/crypto-ramp/transactions?merchantId=${ctx.user.id}&limit=${input.limit}`);
      return res as { transactions: { id: string; direction: string; cryptoCurrency: string; cryptoAmount: number; fiatAmountKobo: number; status: string; createdAt: string }[] };
    }),
  getWallets: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/crypto-ramp/wallets?merchantId=${ctx.user.id}`);
    return res as { wallets: { currency: string; address: string; balanceCrypto: number; balanceNGN: number }[] };
  }),
});

// ─── Tier 6: Escrow Service ───────────────────────────────────────────────────
const escrowRouter = router({
  createEscrow: protectedProcedure
    .input(z.object({
      buyerId: z.string(),
      sellerId: z.string(),
      amountKobo: z.number().positive(),
      description: z.string(),
      releaseConditions: z.string(),
      expiryDays: z.number().int().min(1).max(365).default(30),
      currency: z.enum(["NGN", "USD", "GBP", "EUR"]).default("NGN"),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/escrow/create", { ...input, merchantId: ctx.user.id });
      return res as { escrowId: string; status: string; escrowAddress: string; expiresAt: string; paymentLink: string };
    }),
  fundEscrow: protectedProcedure
    .input(z.object({ escrowId: z.string(), paymentMethod: z.enum(["bank_transfer", "card", "wallet", "usdc"]) }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/escrow/fund", { ...input, merchantId: ctx.user.id });
      return res as { status: string; fundedAt: string; transactionId: string };
    }),
  releaseEscrow: protectedProcedure
    .input(z.object({ escrowId: z.string(), releaseNote: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/escrow/release", { ...input, merchantId: ctx.user.id });
      return res as { status: string; releasedAt: string; settlementId: string };
    }),
  disputeEscrow: protectedProcedure
    .input(z.object({ escrowId: z.string(), reason: z.string(), evidenceUrls: z.array(z.string()).optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/escrow/dispute", { ...input, merchantId: ctx.user.id });
      return res as { disputeId: string; status: string; arbitratorAssigned: boolean };
    }),
  getEscrows: protectedProcedure
    .input(z.object({ role: z.enum(["buyer", "seller", "merchant", "all"]).default("all"), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/escrow/list?merchantId=${ctx.user.id}&role=${input.role}&status=${input.status || ""}`);
      return res as { escrows: { id: string; description: string; amountKobo: number; status: string; buyerId: string; sellerId: string; expiresAt: string }[] };
    }),
});

// ─── Tier 6: Bulk Payment Scheduler ──────────────────────────────────────────
const bulkSchedulerRouter = router({
  createSchedule: protectedProcedure
    .input(z.object({
      name: z.string(),
      scheduleType: z.enum(["one_time", "daily", "weekly", "monthly"]),
      scheduledAt: z.string().datetime(),
      recipients: z.array(z.object({
        accountNumber: z.string(),
        bankCode: z.string(),
        amountKobo: z.number().positive(),
        narration: z.string(),
        reference: z.string().optional(),
      })),
      currency: z.enum(["NGN", "USD"]).default("NGN"),
      notifyOnComplete: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/bulk-scheduler/create", { ...input, merchantId: ctx.user.id });
      return res as { scheduleId: string; status: string; totalAmountKobo: number; recipientCount: number; nextRunAt: string };
    }),
  getSchedules: protectedProcedure
    .input(z.object({ status: z.enum(["pending", "running", "completed", "failed", "all"]).default("all") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/bulk-scheduler/list?merchantId=${ctx.user.id}&status=${input.status}`);
      return res as { schedules: { id: string; name: string; scheduleType: string; status: string; recipientCount: number; totalAmountKobo: number; nextRunAt: string }[] };
    }),
  cancelSchedule: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/bulk-scheduler/cancel", { ...input, merchantId: ctx.user.id });
      return res as { status: string; cancelledAt: string };
    }),
  getScheduleResults: protectedProcedure
    .input(z.object({ scheduleId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/bulk-scheduler/results?scheduleId=${input.scheduleId}&merchantId=${ctx.user.id}`);
      return res as { results: { recipient: string; amountKobo: number; status: string; transactionId: string | null; error: string | null }[] };
    }),
});

// ─── Tier 6: Tax Withholding Engine ──────────────────────────────────────────
const taxWithholdingRouter = router({
  calculateWithholding: protectedProcedure
    .input(z.object({
      transactionAmountKobo: z.number().positive(),
      transactionType: z.enum(["goods", "services", "rent", "dividend", "interest", "royalty"]),
      vendorType: z.enum(["individual", "company", "foreign"]),
      vendorTIN: z.string().optional(),
    }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/tax/calculate?amount=${input.transactionAmountKobo}&type=${input.transactionType}&vendorType=${input.vendorType}&tin=${input.vendorTIN || ""}&merchantId=${ctx.user.id}`);
      return res as { withholdingAmountKobo: number; withholdingRate: number; netPayableKobo: number; taxCode: string; firs_reference: string };
    }),
  remitTax: protectedProcedure
    .input(z.object({
      period: z.string().regex(/^\d{4}-\d{2}$/),
      taxType: z.enum(["WHT", "VAT", "CIT", "PAYE"]),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/tax/remit", { ...input, merchantId: ctx.user.id });
      return res as { remittanceId: string; amountKobo: number; firsReceiptNumber: string; status: string };
    }),
  getTaxSummary: protectedProcedure
    .input(z.object({ year: z.number().int().min(2020).max(2030) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/tax/summary?merchantId=${ctx.user.id}&year=${input.year}`);
      return res as { totalWHT: number; totalVAT: number; totalPAYE: number; remitted: number; outstanding: number; firsCompliant: boolean };
    }),
  generateTaxCertificate: protectedProcedure
    .input(z.object({ vendorId: z.string(), period: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/tax/certificate", { ...input, merchantId: ctx.user.id });
      return res as { certificateUrl: string; certificateNumber: string; issuedAt: string };
    }),
});

// ─── Tier 7: Regulatory Sandbox Mode ─────────────────────────────────────────
const regulatorySandboxRouter = router({
  getSandboxStatus: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/regulatory-sandbox/status?merchantId=${ctx.user.id}`);
    return res as { enabled: boolean; sandboxId: string; regulatorName: string; approvedAt: string | null; expiresAt: string | null; testTransactionCount: number; maxTestTransactions: number };
  }),
  enableSandbox: protectedProcedure
    .input(z.object({
      regulatorCode: z.enum(["CBN", "SEC", "NAICOM", "PENCOM"]),
      sandboxPurpose: z.string(),
      testDurationDays: z.number().int().min(30).max(365),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/regulatory-sandbox/enable", { ...input, merchantId: ctx.user.id });
      return res as { sandboxId: string; apiKey: string; baseUrl: string; credentials: Record<string, string> };
    }),
  runTestScenario: protectedProcedure
    .input(z.object({
      scenarioId: z.string(),
      parameters: z.record(z.string(), z.unknown()),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/regulatory-sandbox/run-scenario", { ...input, merchantId: ctx.user.id });
      return res as { scenarioId: string; result: string; passed: boolean; logs: string[]; reportUrl: string };
    }),
  getTestScenarios: publicProcedure.query(async () => {
    const res = await bridgeGet("/regulatory-sandbox/scenarios");
    return res as { scenarios: { id: string; name: string; description: string; regulatorCode: string; category: string }[] };
  }),
  submitForApproval: protectedProcedure
    .input(z.object({ sandboxId: z.string(), submissionNote: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/regulatory-sandbox/submit", { ...input, merchantId: ctx.user.id });
      return res as { submissionId: string; status: string; reviewerAssigned: string; estimatedReviewDays: number };
    }),
});

// ─── Tier 7: Multi-Currency Wallet v2 ────────────────────────────────────────
const multiCurrencyWalletRouter = router({
  getWallets: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/multi-wallet/balances?merchantId=${ctx.user.id}`);
    return res as { wallets: { currency: string; balanceKobo: number; balanceFormatted: string; accountNumber: string; iban: string | null; swift: string | null }[] };
  }),
  createWallet: protectedProcedure
    .input(z.object({ currency: z.enum(["USD", "EUR", "GBP", "GHS", "KES", "ZAR", "XOF", "XAF"]) }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/multi-wallet/create", { ...input, merchantId: ctx.user.id });
      return res as { walletId: string; currency: string; accountNumber: string; iban: string | null; routingNumber: string | null };
    }),
  convertCurrency: protectedProcedure
    .input(z.object({
      fromCurrency: z.string(),
      toCurrency: z.string(),
      amountKobo: z.number().positive(),
      lockRate: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/multi-wallet/convert", { ...input, merchantId: ctx.user.id });
      return res as { conversionId: string; fromAmount: number; toAmount: number; rate: number; fee: number; completedAt: string };
    }),
  getTransactionHistory: protectedProcedure
    .input(z.object({ currency: z.string().optional(), limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/multi-wallet/history?merchantId=${ctx.user.id}&currency=${input.currency || ""}&limit=${input.limit}`);
      return res as { transactions: { id: string; type: string; currency: string; amountKobo: number; balanceAfter: number; description: string; createdAt: string }[] };
    }),
  sweepToNGN: protectedProcedure
    .input(z.object({ currency: z.string(), amountKobo: z.number().positive().optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/multi-wallet/sweep", { ...input, merchantId: ctx.user.id });
      return res as { sweepId: string; fromCurrency: string; ngnAmountKobo: number; rate: number; status: string };
    }),
});

// ─── Tier 7: Real-Time Gross Settlement ──────────────────────────────────────
const rtgsRouter = router({
  initiateRTGS: protectedProcedure
    .input(z.object({
      beneficiaryBank: z.string(),
      beneficiaryAccount: z.string(),
      beneficiaryName: z.string(),
      amountKobo: z.number().min(500_000_00), // Min NGN 500,000 for RTGS
      narration: z.string(),
      valueDate: z.string().datetime().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/rtgs/initiate", { ...input, merchantId: ctx.user.id });
      return res as { rtgsId: string; cbsReference: string; status: string; estimatedSettlementTime: string; feeKobo: number };
    }),
  getRTGSStatus: protectedProcedure
    .input(z.object({ rtgsId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/rtgs/status?rtgsId=${input.rtgsId}&merchantId=${ctx.user.id}`);
      return res as { rtgsId: string; status: string; settledAt: string | null; cbsReference: string; confirmationNumber: string | null };
    }),
  getRTGSHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().default(20), status: z.string().optional() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/rtgs/history?merchantId=${ctx.user.id}&limit=${input.limit}&status=${input.status || ""}`);
      return res as { transactions: { id: string; beneficiaryName: string; amountKobo: number; status: string; settledAt: string | null; cbsReference: string }[] };
    }),
  getRTGSLimits: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/rtgs/limits?merchantId=${ctx.user.id}`);
    return res as { dailyLimitKobo: number; singleTransactionLimitKobo: number; usedTodayKobo: number; remainingKobo: number };
  }),
});

// ─── Tier 7: ISO 20022 Message Bus ───────────────────────────────────────────
const iso20022Router = router({
  sendMessage: protectedProcedure
    .input(z.object({
      messageType: z.enum(["pacs.008", "pacs.009", "camt.053", "camt.054", "pain.001", "pain.002"]),
      payload: z.record(z.string(), z.unknown()),
      targetBIC: z.string(),
      priority: z.enum(["NORM", "HIGH", "URGT"]).default("NORM"),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/iso20022/send", { ...input, merchantId: ctx.user.id });
      return res as { messageId: string; uetr: string; status: string; sentAt: string; targetBIC: string };
    }),
  getMessages: protectedProcedure
    .input(z.object({
      direction: z.enum(["inbound", "outbound", "all"]).default("all"),
      messageType: z.string().optional(),
      limit: z.number().int().default(20),
    }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/iso20022/messages?merchantId=${ctx.user.id}&direction=${input.direction}&type=${input.messageType || ""}&limit=${input.limit}`);
      return res as { messages: { id: string; messageType: string; direction: string; status: string; uetr: string; createdAt: string; payload: Record<string, unknown> }[] };
    }),
  acknowledgeMessage: protectedProcedure
    .input(z.object({ messageId: z.string(), ackCode: z.string(), reason: z.string().optional() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/iso20022/acknowledge", { ...input, merchantId: ctx.user.id });
      return res as { ackId: string; status: string; ackedAt: string };
    }),
  getMessageSchema: publicProcedure
    .input(z.object({ messageType: z.string() }))
    .query(async ({ input }) => {
      const res = await bridgeGet(`/iso20022/schema?type=${input.messageType}`);
      return res as { messageType: string; schema: Record<string, unknown>; example: Record<string, unknown> };
    }),
});

// ─── Tier 7: Open Finance Hub ─────────────────────────────────────────────────
const openFinanceRouter = router({
  getConnectedProviders: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/open-finance/providers?merchantId=${ctx.user.id}`);
    return res as { providers: { id: string; name: string; type: string; status: string; connectedAt: string; scopes: string[] }[] };
  }),
  connectProvider: protectedProcedure
    .input(z.object({
      providerId: z.string(),
      scopes: z.array(z.string()),
      redirectUrl: z.string().url(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/open-finance/connect", { ...input, merchantId: ctx.user.id });
      return res as { authorizationUrl: string; state: string; expiresAt: string };
    }),
  fetchAccountData: protectedProcedure
    .input(z.object({ providerId: z.string(), dataType: z.enum(["balances", "transactions", "identity", "credit_score"]) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/open-finance/data?merchantId=${ctx.user.id}&providerId=${input.providerId}&dataType=${input.dataType}`);
      return res as { data: Record<string, unknown>; fetchedAt: string; nextRefreshAt: string };
    }),
  revokeProvider: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/open-finance/revoke", { ...input, merchantId: ctx.user.id });
      return res as { status: string; revokedAt: string };
    }),
  getDataInsights: protectedProcedure
    .input(z.object({ providerId: z.string() }))
    .query(async ({ ctx, input }) => {
      const accountData = await bridgeGet(`/open-finance/data?merchantId=${ctx.user.id}&providerId=${input.providerId}&dataType=transactions`);
      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a financial analyst. Analyse the provided transaction data and return a JSON summary with: spendingPatterns, topCategories, cashflowHealth, recommendations." },
          { role: "user", content: `Analyse this financial data: ${JSON.stringify(accountData)}` },
        ],
        response_format: {
          type: "json_schema",
          json_schema: {
            name: "financial_insights",
            strict: true,
            schema: {
              type: "object",
              properties: {
                spendingPatterns: { type: "string" },
                topCategories: { type: "array", items: { type: "string" } },
                cashflowHealth: { type: "string" },
                recommendations: { type: "array", items: { type: "string" } },
              },
              required: ["spendingPatterns", "topCategories", "cashflowHealth", "recommendations"],
              additionalProperties: false,
            },
          },
        },
      });
      return JSON.parse(llmResponse.choices[0].message.content as string);
    }),
});

// ─── Tier 7: Merchant White-Label SDK ────────────────────────────────────────
const whiteLabelSDKRouter = router({
  getSDKConfig: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/white-label/config?merchantId=${ctx.user.id}`);
    return res as {
      sdkKey: string;
      brandName: string;
      primaryColor: string;
      logoUrl: string;
      supportedPaymentMethods: string[];
      webhookUrl: string | null;
      callbackUrl: string | null;
      customDomain: string | null;
    };
  }),
  updateBranding: protectedProcedure
    .input(z.object({
      brandName: z.string().optional(),
      primaryColor: z.string().regex(/^#[0-9A-Fa-f]{6}$/).optional(),
      logoUrl: z.string().url().optional(),
      supportedPaymentMethods: z.array(z.string()).optional(),
      webhookUrl: z.string().url().optional(),
      callbackUrl: z.string().url().optional(),
      customDomain: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/white-label/update-branding", { ...input, merchantId: ctx.user.id });
      return res as { updated: boolean; sdkKey: string; previewUrl: string };
    }),
  rotateSdkKey: protectedProcedure.mutation(async ({ ctx }) => {
    const res = await bridgePost("/white-label/rotate-key", { merchantId: ctx.user.id });
    return res as { newSdkKey: string; oldKeyExpiresAt: string };
  }),
  getIntegrationGuide: protectedProcedure
    .input(z.object({ platform: z.enum(["web", "ios", "android", "react_native", "flutter"]) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/white-label/integration-guide?platform=${input.platform}&merchantId=${ctx.user.id}`);
      return res as { platform: string; sdkVersion: string; installCommand: string; quickstartCode: string; documentationUrl: string };
    }),
  getSDKAnalytics: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/white-label/analytics?merchantId=${ctx.user.id}&period=${input.period}`);
      return res as { totalCheckouts: number; completedCheckouts: number; conversionRate: number; topPlatforms: { platform: string; count: number }[]; revenueKobo: number };
    }),
});

// ─── Tier 8: Consumer Super App Shell ────────────────────────────────────────
const superAppRouter = router({
  getAppConfig: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/super-app/config?merchantId=${ctx.user.id}`);
    return res as {
      appName: string;
      modules: { id: string; name: string; enabled: boolean; iconUrl: string; route: string }[];
      theme: { primaryColor: string; secondaryColor: string; fontFamily: string };
      features: { billPayment: boolean; p2p: boolean; savings: boolean; investments: boolean; insurance: boolean; loans: boolean };
    };
  }),
  updateModules: protectedProcedure
    .input(z.object({
      modules: z.array(z.object({ id: z.string(), enabled: z.boolean() })),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/super-app/update-modules", { ...input, merchantId: ctx.user.id });
      return res as { updated: boolean; activeModuleCount: number };
    }),
  getConsumerStats: protectedProcedure
    .input(z.object({ period: z.enum(["7d", "30d", "90d"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/super-app/stats?merchantId=${ctx.user.id}&period=${input.period}`);
      return res as { dau: number; mau: number; avgSessionMinutes: number; topFeatures: { feature: string; usageCount: number }[]; retentionRate: number };
    }),
  pushAppUpdate: protectedProcedure
    .input(z.object({
      version: z.string(),
      releaseNotes: z.string(),
      forceUpdate: z.boolean().default(false),
      targetPlatforms: z.array(z.enum(["ios", "android", "web"])),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/super-app/push-update", { ...input, merchantId: ctx.user.id });
      return res as { updateId: string; status: string; affectedUsers: number; rolloutPercentage: number };
    }),
});

// ─── Tier 8: Platform Analytics Lakehouse v2 ─────────────────────────────────
const lakehouseV2Router = router({
  runQuery: protectedProcedure
    .input(z.object({
      sql: z.string().min(1),
      parameters: z.record(z.string(), z.unknown()).optional(),
      maxRows: z.number().int().min(1).max(10000).default(1000),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/lakehouse-v2/query", { ...input, merchantId: ctx.user.id });
      return res as { columns: string[]; rows: unknown[][]; rowCount: number; executionTimeMs: number; queryId: string };
    }),
  getSavedQueries: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/lakehouse-v2/saved-queries?merchantId=${ctx.user.id}`);
    return res as { queries: { id: string; name: string; sql: string; lastRunAt: string; schedule: string | null }[] };
  }),
  saveQuery: protectedProcedure
    .input(z.object({
      name: z.string(),
      sql: z.string(),
      schedule: z.string().optional(),
      notifyOnComplete: z.boolean().default(false),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/lakehouse-v2/save-query", { ...input, merchantId: ctx.user.id });
      return res as { queryId: string; name: string; nextRunAt: string | null };
    }),
  getDatasets: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/lakehouse-v2/datasets?merchantId=${ctx.user.id}`);
    return res as { datasets: { name: string; rowCount: number; sizeBytes: number; lastUpdated: string; schema: { column: string; type: string }[] }[] };
  }),
  exportDataset: protectedProcedure
    .input(z.object({
      datasetName: z.string(),
      format: z.enum(["csv", "parquet", "json", "xlsx"]),
      filters: z.record(z.string(), z.unknown()).optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/lakehouse-v2/export", { ...input, merchantId: ctx.user.id });
      return res as { exportId: string; downloadUrl: string; expiresAt: string; sizeBytes: number };
    }),
  getAIAnalysis: protectedProcedure
    .input(z.object({ question: z.string(), datasetName: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const sampleData = await bridgeGet(`/lakehouse-v2/sample?merchantId=${ctx.user.id}&dataset=${input.datasetName}&limit=100`);
      const llmResponse = await invokeLLM({
        messages: [
          { role: "system", content: "You are a data analyst. Answer the user's question based on the provided dataset sample. Be specific and actionable." },
          { role: "user", content: `Dataset: ${JSON.stringify(sampleData)}\n\nQuestion: ${input.question}` },
        ],
      });
      return { answer: llmResponse.choices[0].message.content as string, queryId: `ai_${Date.now()}` };
    }),
});

// ─── Tier 8: Payroll-as-a-Service v2 ─────────────────────────────────────────
const payrollV2Router = router({
  createPayrollRun: protectedProcedure
    .input(z.object({
      payPeriod: z.string().regex(/^\d{4}-\d{2}$/),
      payDate: z.string().datetime(),
      employees: z.array(z.object({
        employeeId: z.string(),
        grossSalaryKobo: z.number().positive(),
        allowances: z.record(z.string(), z.number()).optional(),
        deductions: z.record(z.string(), z.number()).optional(),
        bankCode: z.string(),
        accountNumber: z.string(),
      })),
      includeNHF: z.boolean().default(true),
      includePension: z.boolean().default(true),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/payroll-v2/run", { ...input, merchantId: ctx.user.id });
      return res as {
        runId: string;
        totalGrossKobo: number;
        totalNetKobo: number;
        totalPAYEKobo: number;
        totalPensionKobo: number;
        totalNHFKobo: number;
        employeeCount: number;
        status: string;
        payslipUrls: string[];
      };
    }),
  getPayrollRuns: protectedProcedure
    .input(z.object({ year: z.number().int().optional() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/payroll-v2/runs?merchantId=${ctx.user.id}&year=${input.year || ""}`);
      return res as { runs: { id: string; payPeriod: string; status: string; employeeCount: number; totalNetKobo: number; payDate: string }[] };
    }),
  approvePayrollRun: protectedProcedure
    .input(z.object({ runId: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/payroll-v2/approve", { ...input, merchantId: ctx.user.id });
      return res as { status: string; disbursementId: string; estimatedCompletionAt: string };
    }),
  getEmployeePayslip: protectedProcedure
    .input(z.object({ runId: z.string(), employeeId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/payroll-v2/payslip?runId=${input.runId}&employeeId=${input.employeeId}&merchantId=${ctx.user.id}`);
      return res as { employeeId: string; employeeName: string; payPeriod: string; grossKobo: number; netKobo: number; deductions: Record<string, number>; payslipUrl: string };
    }),
  submitPensionRemittance: protectedProcedure
    .input(z.object({ runId: z.string(), pfaCode: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/payroll-v2/pension-remittance", { ...input, merchantId: ctx.user.id });
      return res as { remittanceId: string; pfaCode: string; totalAmountKobo: number; status: string; pfaReference: string };
    }),
});

// ─── Tier 8: Agent Banking Network v2 ────────────────────────────────────────
const agentBankingV2Router = router({
  getAgentNetwork: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/agent-banking-v2/network?merchantId=${ctx.user.id}`);
    return res as { totalAgents: number; activeAgents: number; suspendedAgents: number; totalTransactionsToday: number; totalVolumeKoboToday: number };
  }),
  onboardAgent: protectedProcedure
    .input(z.object({
      agentName: z.string(),
      phoneNumber: z.string(),
      bvn: z.string(),
      nin: z.string(),
      address: z.string(),
      lga: z.string(),
      state: z.string(),
      terminalType: z.enum(["POS", "mobile", "kiosk"]),
      cashFloatLimitKobo: z.number().positive(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/agent-banking-v2/onboard", { ...input, merchantId: ctx.user.id });
      return res as { agentId: string; agentCode: string; terminalId: string; status: string; approvedAt: string | null };
    }),
  getAgentPerformance: protectedProcedure
    .input(z.object({ agentId: z.string(), period: z.enum(["7d", "30d", "90d"]).default("30d") }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/agent-banking-v2/performance?agentId=${input.agentId}&period=${input.period}&merchantId=${ctx.user.id}`);
      return res as { agentId: string; transactionCount: number; volumeKobo: number; commissionEarnedKobo: number; cashFloatUtilisation: number; topServices: string[] };
    }),
  fundAgentFloat: protectedProcedure
    .input(z.object({ agentId: z.string(), amountKobo: z.number().positive() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/agent-banking-v2/fund-float", { ...input, merchantId: ctx.user.id });
      return res as { transactionId: string; newFloatBalanceKobo: number; status: string };
    }),
  suspendAgent: protectedProcedure
    .input(z.object({ agentId: z.string(), reason: z.string() }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/agent-banking-v2/suspend", { ...input, merchantId: ctx.user.id });
      return res as { status: string; suspendedAt: string };
    }),
});

// ─── Tier 8: Cross-Border Remittance v2 ──────────────────────────────────────
const remittanceV2Router = router({
  getCorridors: publicProcedure.query(async () => {
    const res = await bridgeGet("/remittance-v2/corridors");
    return res as { corridors: { from: string; to: string; provider: string; fxRate: number; feeKobo: number; minAmountKobo: number; maxAmountKobo: number; estimatedMinutes: number }[] };
  }),
  getQuote: protectedProcedure
    .input(z.object({
      fromCountry: z.string(),
      toCountry: z.string(),
      sendAmountKobo: z.number().positive(),
      deliveryMethod: z.enum(["bank_account", "mobile_money", "cash_pickup", "wallet"]),
    }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/remittance-v2/quote?from=${input.fromCountry}&to=${input.toCountry}&amount=${input.sendAmountKobo}&method=${input.deliveryMethod}&merchantId=${ctx.user.id}`);
      return res as { quoteId: string; sendAmountKobo: number; receiveAmount: number; receiveCurrency: string; fxRate: number; feeKobo: number; totalDebitKobo: number; expiresAt: string };
    }),
  sendRemittance: protectedProcedure
    .input(z.object({
      quoteId: z.string(),
      recipientName: z.string(),
      recipientPhone: z.string(),
      recipientAccount: z.string().optional(),
      recipientBankCode: z.string().optional(),
      recipientMobileWallet: z.string().optional(),
      purpose: z.string(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/remittance-v2/send", { ...input, merchantId: ctx.user.id });
      return res as { remittanceId: string; status: string; trackingCode: string; estimatedDeliveryAt: string; receiptUrl: string };
    }),
  trackRemittance: protectedProcedure
    .input(z.object({ remittanceId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/remittance-v2/track?remittanceId=${input.remittanceId}&merchantId=${ctx.user.id}`);
      return res as { remittanceId: string; status: string; statusHistory: { status: string; timestamp: string; description: string }[]; estimatedDeliveryAt: string };
    }),
  getRemittanceHistory: protectedProcedure
    .input(z.object({ limit: z.number().int().default(20) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/remittance-v2/history?merchantId=${ctx.user.id}&limit=${input.limit}`);
      return res as { remittances: { id: string; recipientName: string; sendAmountKobo: number; receiveAmount: number; receiveCurrency: string; status: string; createdAt: string }[] };
    }),
});

// ─── Tier 8: Merchant POS Terminal v2 ────────────────────────────────────────
const posTerminalV2Router = router({
  getTerminals: protectedProcedure.query(async ({ ctx }) => {
    const res = await bridgeGet(`/pos-v2/terminals?merchantId=${ctx.user.id}`);
    return res as { terminals: { id: string; serialNumber: string; model: string; status: string; location: string; lastSeenAt: string; softwareVersion: string; transactionsToday: number }[] };
  }),
  provisionTerminal: protectedProcedure
    .input(z.object({
      serialNumber: z.string(),
      model: z.string(),
      location: z.string(),
      lat: z.number().optional(),
      lng: z.number().optional(),
      assignedCashierId: z.string().optional(),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/pos-v2/provision", { ...input, merchantId: ctx.user.id });
      return res as { terminalId: string; activationCode: string; configUrl: string; status: string };
    }),
  getTerminalTransactions: protectedProcedure
    .input(z.object({ terminalId: z.string(), limit: z.number().int().default(50) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/pos-v2/transactions?terminalId=${input.terminalId}&merchantId=${ctx.user.id}&limit=${input.limit}`);
      return res as { transactions: { id: string; amount: number; paymentMethod: string; status: string; cashierId: string | null; createdAt: string }[] };
    }),
  pushTerminalConfig: protectedProcedure
    .input(z.object({
      terminalId: z.string(),
      config: z.object({
        acceptedPaymentMethods: z.array(z.string()).optional(),
        receiptPrinterEnabled: z.boolean().optional(),
        offlineModeEnabled: z.boolean().optional(),
        maxOfflineAmountKobo: z.number().optional(),
        idleTimeoutSeconds: z.number().optional(),
      }),
    }))
    .mutation(async ({ ctx, input }) => {
      const res = await bridgePost("/pos-v2/push-config", { ...input, merchantId: ctx.user.id });
      return res as { status: string; appliedAt: string; terminalId: string };
    }),
  getTerminalHealth: protectedProcedure
    .input(z.object({ terminalId: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/pos-v2/health?terminalId=${input.terminalId}&merchantId=${ctx.user.id}`);
      return res as { terminalId: string; batteryLevel: number; signalStrength: number; printerStatus: string; lastHeartbeatAt: string; pendingUpdates: number; offlineQueueSize: number };
    }),
});

// ─── Settlement Forecast ────────────────────────────────────────────────────
const settlementForecastRouter = router({
  getForecast: protectedProcedure
    .input(z.object({ days: z.number().int().min(1).max(90).default(30) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/settlement-forecast?merchantId=${ctx.user.id}&days=${input.days}`);
      return res as {
        forecast: { date: string; expectedAmountKobo: number; confidenceScore: number }[];
        totalExpectedKobo: number;
        averageDailyKobo: number;
        trend: "up" | "down" | "stable";
      };
    }),
  getHistory: protectedProcedure
    .input(z.object({ from: z.string(), to: z.string() }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/settlement-forecast/history?merchantId=${ctx.user.id}&from=${input.from}&to=${input.to}`);
      return res as { settlements: { date: string; amountKobo: number; status: string; bankRef: string }[] };
    }),
});

// ─── Tax Engine ───────────────────────────────────────────────────────────────
const taxEngineRouter = router({
  calculateTax: protectedProcedure
    .input(z.object({
      amountKobo: z.number().positive(),
      transactionType: z.enum(["payment", "bank_transfer", "service_fee", "subscription", "payout", "invoice"]).default("payment"),
      includeWht: z.boolean().default(false),
    }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/tax-engine/calculate?amount=${input.amountKobo}&type=${input.transactionType}&wht=${input.includeWht}&merchantId=${ctx.user.id}`);
      return res as {
        grossAmountKobo: number;
        totalTaxKobo: number;
        netAmountKobo: number;
        effectiveTaxRatePct: number;
        taxBreakdown: { taxType: string; description: string; rate: number; amountKobo: number }[];
      };
    }),
  getMonthlyRemittance: protectedProcedure
    .input(z.object({ month: z.string().regex(/^\d{4}-\d{2}$/) }))
    .query(async ({ ctx, input }) => {
      const res = await bridgeGet(`/tax-engine/remittance?merchantId=${ctx.user.id}&month=${input.month}`);
      return res as {
        period: string;
        vatKobo: number;
        whtKobo: number;
        stampDutyKobo: number;
        totalRemittanceKobo: number;
        dueDate: string;
        paymentReference: string;
      };
    }),
  getTaxRates: publicProcedure.query(async () => {
    const res = await bridgeGet("/tax-engine/rates");
    return res as { rates: Record<string, { rate: number; description: string; remitTo: string }> };
  }),
});

// ─── Tier 6-8 Combined Router ─────────────────────────────────────────────────
export const tier6to8Router = router({
  insurance: insuranceRouter,
  carbonCredit: carbonCreditRouter,
  nftBadges: nftBadgesRouter,
  bnplV2: bnplV2Router,
  cryptoRamp: cryptoRampRouter,
  escrow: escrowRouter,
  bulkScheduler: bulkSchedulerRouter,
  taxWithholding: taxWithholdingRouter,
  regulatorySandbox: regulatorySandboxRouter,
  multiCurrencyWallet: multiCurrencyWalletRouter,
  rtgs: rtgsRouter,
  iso20022: iso20022Router,
  openFinance: openFinanceRouter,
  whiteLabelSDK: whiteLabelSDKRouter,
  superApp: superAppRouter,
  lakehouseV2: lakehouseV2Router,
  payrollV2: payrollV2Router,
  agentBankingV2: agentBankingV2Router,
  remittanceV2: remittanceV2Router,
  posTerminalV2: posTerminalV2Router,
  settlementForecast: settlementForecastRouter,
  taxEngine: taxEngineRouter,
});
