/**
 * server/middlewareBridge.mock.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Mock implementation of the middleware bridge for local development and testing.
 * All functions return realistic stub data so the portal works without live
 * external services (Mojaloop, NIBSS, TigerBeetle, Temporal, etc.).
 *
 * Usage:
 *   Set MIDDLEWARE_BRIDGE_URL="" or MIDDLEWARE_MOCK=true in your .env to
 *   automatically use this mock. The real middlewareBridge.ts checks
 *   isBridgeAvailable() before making requests and falls back to null.
 *
 * In tests, import from this file directly:
 *   import * as bridge from "./middlewareBridge.mock";
 */

import { randomUUID } from "crypto";

// ─── Utility helpers ──────────────────────────────────────────────────────────

function mockId(prefix = "mock") {
  return `${prefix}_${randomUUID().slice(0, 8)}`;
}

function mockAmount(min = 1000, max = 100000) {
  return Math.floor(Math.random() * (max - min) + min);
}

function mockTimestamp() {
  return new Date().toISOString();
}

// ─── Bridge availability ──────────────────────────────────────────────────────

export function isBridgeAvailable(): boolean {
  return false; // Mock bridge is always "unavailable" — callers use DB fallback
}

export async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch {
    return null;
  }
}

// ─── Payout approval ─────────────────────────────────────────────────────────

export async function initiatePayoutApproval(_req: unknown) {
  return { approvalId: mockId("appr"), status: "pending", createdAt: mockTimestamp() };
}

export async function approvePayoutViaMiddleware(_payoutId: string, _req: unknown) {
  return { success: true, approvalId: mockId("appr"), status: "approved" };
}

export async function rejectPayoutViaMiddleware(_payoutId: string, _req: unknown) {
  return { success: true, approvalId: mockId("appr"), status: "rejected" };
}

export async function getPayoutApprovalStatus(_payoutId: string) {
  return { status: "pending", approvalId: mockId("appr"), updatedAt: mockTimestamp() };
}

// ─── Transactions ─────────────────────────────────────────────────────────────

export async function recordTransactionViaMiddleware(_req: unknown) {
  return {
    transactionId: mockId("txn"),
    ledgerEntryId: mockId("led"),
    status: "completed",
    processedAt: mockTimestamp(),
  };
}

export async function refundTransactionViaMiddleware(_req: unknown) {
  return {
    refundId: mockId("ref"),
    originalTransactionId: mockId("txn"),
    status: "completed",
    processedAt: mockTimestamp(),
  };
}

// ─── Disputes ─────────────────────────────────────────────────────────────────

export async function submitDisputeViaMiddleware(_req: unknown) {
  return { disputeId: mockId("dis"), status: "open", submittedAt: mockTimestamp() };
}

export async function resolveDisputeViaMiddleware(_req: unknown) {
  return { disputeId: mockId("dis"), status: "resolved", resolvedAt: mockTimestamp() };
}

// ─── Fraud scoring ────────────────────────────────────────────────────────────

export async function scoreFraudViaMiddleware(_req: unknown) {
  return {
    score: Math.random() * 100,
    riskLevel: "low" as const,
    signals: [],
    modelVersion: "mock-v1",
  };
}

export async function acknowledgeFraudAlertViaMiddleware(_req: unknown) {
  return { success: true };
}

// ─── KYC ──────────────────────────────────────────────────────────────────────

export async function startKYCWorkflowViaMiddleware(_req: unknown) {
  return {
    workflowId: mockId("kyc"),
    status: "in_progress",
    verificationUrl: "https://kyc.mock.paygate.ng/verify",
  };
}

export async function updateKYCStatusViaMiddleware(_req: unknown) {
  return { success: true, workflowId: mockId("kyc") };
}

// ─── BNPL ─────────────────────────────────────────────────────────────────────

export async function createBNPLLoanViaMiddleware(_req: unknown) {
  return {
    loanId: mockId("loan"),
    status: "active",
    disbursedAt: mockTimestamp(),
    ledgerEntryId: mockId("led"),
  };
}

export async function processBNPLInstalmentViaMiddleware(_req: unknown) {
  return { success: true, ledgerEntryId: mockId("led") };
}

// ─── FX ───────────────────────────────────────────────────────────────────────

export async function recordFXConversionViaMiddleware(_req: unknown) {
  return {
    conversionId: mockId("fx"),
    rate: 1.0 + Math.random() * 0.1,
    convertedAmount: mockAmount(),
    processedAt: mockTimestamp(),
  };
}

// ─── Wallets ──────────────────────────────────────────────────────────────────

export async function debitWalletViaMiddleware(_req: unknown) {
  return { success: true, transactionId: mockId("txn"), newBalance: mockAmount() };
}

export async function creditWalletViaMiddleware(_req: unknown) {
  return { success: true, transactionId: mockId("txn"), newBalance: mockAmount() };
}

export async function p2pTransferViaMiddleware(_req: unknown) {
  return { success: true, transferId: mockId("p2p"), processedAt: mockTimestamp() };
}

export async function getWalletBalanceViaMiddleware(_req: unknown) {
  return { balance: mockAmount(10000, 1000000), currency: "NGN", updatedAt: mockTimestamp() };
}

// ─── Webhooks ─────────────────────────────────────────────────────────────────

export async function deliverWebhookViaMiddleware(_req: unknown) {
  return { success: true, deliveryId: mockId("del"), responseStatus: 200 };
}

export async function retryWebhookViaMiddleware(_req: unknown) {
  return { success: true, deliveryId: mockId("del"), responseStatus: 200 };
}

// ─── Virtual cards ────────────────────────────────────────────────────────────

export async function issueVirtualCardViaMiddleware(_req: unknown) {
  return {
    cardId: mockId("card"),
    maskedPan: "4111 **** **** 1111",
    expiryDate: "12/28",
    status: "active",
  };
}

export async function freezeVirtualCardViaMiddleware(_req: unknown) {
  return { success: true };
}

// ─── Payment links ────────────────────────────────────────────────────────────

export async function createPaymentLinkViaMiddleware(_req: unknown) {
  return {
    linkId: mockId("lnk"),
    url: `https://pay.mock.paygate.ng/${mockId("lnk")}`,
    expiresAt: new Date(Date.now() + 86400000).toISOString(),
  };
}

export async function deactivatePaymentLinkViaMiddleware(_req: unknown) {
  return { success: true };
}

// ─── Settlement ───────────────────────────────────────────────────────────────

export async function triggerSettlementViaMiddleware(_req: unknown) {
  return {
    settlementId: mockId("set"),
    status: "processing",
    estimatedCompletionAt: new Date(Date.now() + 3600000).toISOString(),
  };
}

export async function reconcileMoMoViaMiddleware(_req: unknown) {
  return { success: true, reconciledCount: Math.floor(Math.random() * 100) };
}

// ─── Roles / Permify ──────────────────────────────────────────────────────────

export async function syncRolesToPermifyViaMiddleware(_req: unknown) {
  return { success: true, syncedAt: mockTimestamp() };
}

// ─── Loyalty ──────────────────────────────────────────────────────────────────

export async function earnLoyaltyPointsViaMiddleware(_req: unknown) {
  return { success: true, pointsEarned: Math.floor(Math.random() * 100), newBalance: mockAmount(0, 10000) };
}

export async function redeemLoyaltyPointsViaMiddleware(_req: unknown) {
  return { success: true, pointsRedeemed: Math.floor(Math.random() * 50), newBalance: mockAmount(0, 10000) };
}

// ─── Inventory ────────────────────────────────────────────────────────────────

export async function syncInventoryViaMiddleware(_req: unknown) {
  return { success: true, syncedAt: mockTimestamp() };
}

export async function updateInventoryLevelViaMiddleware(_req: unknown) {
  return { success: true, newLevel: Math.floor(Math.random() * 1000) };
}

// ─── Payroll ──────────────────────────────────────────────────────────────────

export async function processPayrollRunViaMiddleware(_req: unknown) {
  return {
    runId: mockId("pay"),
    status: "processing",
    totalAmount: mockAmount(100000, 10000000),
    employeeCount: Math.floor(Math.random() * 50) + 1,
  };
}

// ─── NIP / NIBSS ─────────────────────────────────────────────────────────────

export async function initiateNIPTransferViaMiddleware(_req: unknown) {
  return {
    sessionId: mockId("nip"),
    status: "processing",
    reference: mockId("ref"),
  };
}

export async function lookupNIPAccountViaMiddleware(_req: unknown) {
  return {
    accountName: "MOCK ACCOUNT HOLDER",
    bankCode: "000",
    accountNumber: "0000000000",
  };
}

// ─── Digital gold ─────────────────────────────────────────────────────────────

export async function buyDigitalGoldViaMiddleware(_req: unknown) {
  return {
    orderId: mockId("gold"),
    gramsAllocated: Math.random() * 10,
    pricePerGram: 80000 + Math.random() * 5000,
    status: "completed",
  };
}

export async function sellDigitalGoldViaMiddleware(_req: unknown) {
  return {
    orderId: mockId("gold"),
    gramsRedeemed: Math.random() * 5,
    amountCredited: mockAmount(50000, 500000),
    status: "completed",
  };
}

// ─── Mojaloop ─────────────────────────────────────────────────────────────────

export async function initiateMojaloopTransferViaMiddleware(_req: unknown) {
  return {
    transferId: mockId("moja"),
    status: "COMMITTED",
    completedAt: mockTimestamp(),
  };
}

// ─── Temporal workflows ───────────────────────────────────────────────────────

export async function startWorkflowViaMiddleware(_req: unknown) {
  return { workflowId: mockId("wf"), runId: mockId("run"), status: "RUNNING" };
}

export async function cancelWorkflowViaMiddleware(_workflowId: string) {
  return { success: true };
}

// ─── Bill payments ────────────────────────────────────────────────────────────

export async function processBillPaymentViaMiddleware(_req: unknown) {
  return {
    paymentId: mockId("bill"),
    status: "success",
    token: mockId("tok"),
    processedAt: mockTimestamp(),
  };
}

export async function getBillerListViaMiddleware(_req: unknown) {
  return {
    billers: [
      { id: "ekedc", name: "Eko Electricity", category: "electricity" },
      { id: "ikedc", name: "Ikeja Electric", category: "electricity" },
      { id: "dstv", name: "DStv", category: "cable_tv" },
      { id: "mtn_airtime", name: "MTN Airtime", category: "airtime" },
    ],
  };
}

// ─── Carbon credits ───────────────────────────────────────────────────────────

export async function retireCarbonCreditsViaMiddleware(_req: unknown) {
  return { success: true, retirementId: mockId("ret"), certificateUrl: "https://mock.carbon.ng/cert" };
}

export async function getCarbonMarketPriceViaMiddleware(_req: unknown) {
  return { pricePerTon: 5000 + Math.random() * 2000, currency: "NGN", updatedAt: mockTimestamp() };
}

// ─── Subscriptions ────────────────────────────────────────────────────────────

export async function syncSubscriptionWithStripeViaMiddleware(_req: unknown) {
  return { success: true, syncedAt: mockTimestamp() };
}

export async function sendSubscriptionRenewalReminderViaMiddleware(_req: unknown) {
  return { success: true, sentAt: mockTimestamp() };
}

// ─── QR payments ─────────────────────────────────────────────────────────────

export async function generateQrCodeViaMiddleware(_req: unknown) {
  return { qrCode: "data:image/png;base64,mock_qr_code", expiresAt: new Date(Date.now() + 300000).toISOString() };
}

export async function validateQrPaymentViaMiddleware(_req: unknown) {
  return { valid: true, paymentId: mockId("qr"), amount: mockAmount() };
}

// ─── POS terminals ────────────────────────────────────────────────────────────

export async function registerPosTerminalViaMiddleware(_req: unknown) {
  return { terminalId: mockId("pos"), activationCode: "MOCK-1234", status: "active" };
}

export async function sendPosTerminalCommandViaMiddleware(_req: unknown) {
  return { success: true, commandId: mockId("cmd") };
}

// ─── Referrals ────────────────────────────────────────────────────────────────

export async function processReferralRewardViaMiddleware(_req: unknown) {
  return { success: true, rewardId: mockId("rew"), amountCredited: mockAmount(500, 5000) };
}

// ─── USSD ─────────────────────────────────────────────────────────────────────

export async function terminateUssdSessionViaMiddleware(_req: unknown) {
  return { success: true };
}

export async function getUssdSessionMetricsViaMiddleware(_req: unknown) {
  return {
    activeSessions: Math.floor(Math.random() * 100),
    completedToday: Math.floor(Math.random() * 1000),
    avgDurationSeconds: 45 + Math.random() * 30,
  };
}

// ─── Purchase orders ──────────────────────────────────────────────────────────

export async function approvePurchaseOrderViaMiddleware(_req: unknown) {
  return { success: true, approvedAt: mockTimestamp() };
}

export async function rejectPurchaseOrderViaMiddleware(_req: unknown) {
  return { success: true, rejectedAt: mockTimestamp() };
}

// ─── Insurance ────────────────────────────────────────────────────────────────

export async function submitInsurancePolicyClaimViaMiddleware(_req: unknown) {
  return { claimId: mockId("clm"), status: "submitted", submittedAt: mockTimestamp() };
}

// ─── Loan repayment ───────────────────────────────────────────────────────────

export async function processLoanRepaymentViaMiddleware(_req: unknown) {
  return { success: true, paymentId: mockId("pay"), newBalance: mockAmount(0, 100000) };
}

// ─── Kafka events ─────────────────────────────────────────────────────────────

export async function publishKafkaEventViaMiddleware(_req: unknown) {
  return { success: true, offset: Math.floor(Math.random() * 1000000) };
}

// ─── AI / ML ──────────────────────────────────────────────────────────────────

export async function syncAiModelToRegistryViaMiddleware(_req: unknown) {
  return { success: true, modelId: mockId("mdl"), registeredAt: mockTimestamp() };
}

export async function triggerGnnTrainingJobViaMiddleware(_req: unknown) {
  return { jobId: mockId("job"), status: "queued", estimatedDurationMinutes: 30 };
}

export async function getAiModelInferenceMetricsViaMiddleware(_req: unknown) {
  return {
    requestsPerSecond: Math.random() * 100,
    avgLatencyMs: 50 + Math.random() * 100,
    errorRate: Math.random() * 0.01,
  };
}

// ─── Menu cache ───────────────────────────────────────────────────────────────

export async function invalidateMenuCacheViaMiddleware(_req: unknown) {
  return { success: true };
}

export async function publishMenuUpdateEventViaMiddleware(_req: unknown) {
  return { success: true, eventId: mockId("evt") };
}

// ─── Health checks ────────────────────────────────────────────────────────────

export async function runExternalHealthCheckViaMiddleware(_req: unknown) {
  return { status: "healthy", responseTimeMs: Math.floor(Math.random() * 100) };
}

export async function getPortalUptimeStatsViaMiddleware(_req: unknown) {
  return {
    uptimePercent: 99.9,
    totalRequests: Math.floor(Math.random() * 1000000),
    errorRate: 0.001,
  };
}

// ─── Lakehouse / compliance ───────────────────────────────────────────────────

export async function writeLakehouseComplianceEventViaMiddleware(_req: unknown) {
  return { success: true, eventId: mockId("evt") };
}

export async function queryLakehouseComplianceViaMiddleware(_merchantId: string, _filters: unknown) {
  return { events: [], total: 0 };
}

// ─── TigerBeetle accounts ─────────────────────────────────────────────────────

export async function createMerchantLedgerAccountViaMiddleware(_merchantId: string, _currency: string) {
  return { accountId: mockId("acct"), ledgerId: mockId("led") };
}

export async function createCustomerWalletAccountViaMiddleware(_merchantId: string, _customerId: string, _currency: string) {
  return { accountId: mockId("acct"), ledgerId: mockId("led") };
}

export async function createStaffFloatAccountViaMiddleware(_merchantId: string, _staffMemberId: string, _currency: string) {
  return { accountId: mockId("acct"), ledgerId: mockId("led") };
}

export async function createInsurancePremiumAccountViaMiddleware(_merchantId: string, _policyId: string, _currency: string) {
  return { accountId: mockId("acct"), ledgerId: mockId("led") };
}

export async function createUSDCCustodyAccountViaMiddleware(_merchantId: string, _network: string) {
  return { accountId: mockId("acct"), walletAddress: `0x${mockId("").replace("mock_", "")}` };
}
