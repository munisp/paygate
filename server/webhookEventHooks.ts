/**
 * webhookEventHooks.ts — Wave 78
 *
 * Wraps key mutation procedures from newFeaturesRouter to fire webhook events
 * after successful operations. This is imported and called from newFeaturesRouter.ts
 * for each mutation that should emit a webhook.
 *
 * Pattern: after the bridge call succeeds, call dispatchWebhookEvent() in the background
 * (fire-and-forget) so webhook delivery never blocks the user-facing response.
 */
import { dispatchWebhookEvent, buildWebhookPayload } from "./webhookEvents";
import { logger } from "./logger";

const DEFAULT_TENANT = "ten_default";

/**
 * Fire a webhook event in the background (non-blocking).
 */
export function fireWebhook(
  event: Parameters<typeof buildWebhookPayload>[0],
  merchantId: string,
  data: Record<string, unknown>,
): void {
  const payload = buildWebhookPayload(event, merchantId, DEFAULT_TENANT, data);
  dispatchWebhookEvent(payload).catch((err) => {
    logger.warn(`[webhookEventHooks] Failed to dispatch ${event}:`, err);
  });
}

// ─── Digital Gold ─────────────────────────────────────────────────────────────
export function onGoldPurchased(merchantId: string, data: { transactionId: string; gramsAcquired: number; totalCostKobo: number; userId: string | number }): void {
  fireWebhook("digital_gold.purchased", merchantId, data as Record<string, unknown>);
}
export function onGoldSold(merchantId: string, data: { transactionId: string; proceedsKobo: number; userId: string | number }): void {
  fireWebhook("digital_gold.sold", merchantId, data as Record<string, unknown>);
}
export function onGoldSipExecuted(merchantId: string, data: { sipId: string; gramsAcquired: number; amountKobo: number; userId: string | number }): void {
  fireWebhook("digital_gold.sip_executed", merchantId, data as Record<string, unknown>);
}

// ─── Mutual Funds ─────────────────────────────────────────────────────────────
export function onMutualFundInvested(merchantId: string, data: { transactionId: string; fundId: string; units: number; amountKobo: number; userId: string | number }): void {
  fireWebhook("mutual_fund.invested", merchantId, data as Record<string, unknown>);
}
export function onMutualFundRedeemed(merchantId: string, data: { transactionId: string; fundId: string; units: number; proceedsKobo: number; userId: string | number }): void {
  fireWebhook("mutual_fund.redeemed", merchantId, data as Record<string, unknown>);
}

// ─── Insurance ────────────────────────────────────────────────────────────────
export function onInsurancePolicyCreated(merchantId: string, data: { policyId: string; policyType: string; providerName: string; premiumKobo: number; userId: string | number }): void {
  fireWebhook("insurance.policy_created", merchantId, data as Record<string, unknown>);
}
export function onInsuranceClaimSubmitted(merchantId: string, data: { claimId: string; policyId: string; claimAmountKobo: number; userId: string | number }): void {
  fireWebhook("insurance.claim_submitted", merchantId, data as Record<string, unknown>);
}

// ─── Pension ──────────────────────────────────────────────────────────────────
export function onPensionContributionPosted(merchantId: string, data: { pensionAccountId: string; totalKobo: number; periodMonth: string; userId: string | number }): void {
  fireWebhook("pension.contribution_posted", merchantId, data as Record<string, unknown>);
}
export function onPensionAccountCreated(merchantId: string, data: { pensionAccountId: string; pfaCode: string; userId: string | number }): void {
  fireWebhook("pension.account_created", merchantId, data as Record<string, unknown>);
}

// ─── Cashback ─────────────────────────────────────────────────────────────────
export function onCashbackEarned(merchantId: string, data: { points: number; koboEquivalent: number; description: string; userId: string | number }): void {
  fireWebhook("cashback.earned", merchantId, data as Record<string, unknown>);
}
export function onCashbackRedeemed(merchantId: string, data: { points: number; koboEquivalent: number; userId: string | number }): void {
  fireWebhook("cashback.redeemed", merchantId, data as Record<string, unknown>);
}

// ─── Soundbox ─────────────────────────────────────────────────────────────────
export function onSoundboxPaymentReceived(merchantId: string, data: { deviceId: string; amountKobo: number; reference: string; channel: string }): void {
  fireWebhook("soundbox.payment_received", merchantId, data as Record<string, unknown>);
}
export function onSoundboxDeviceRegistered(merchantId: string, data: { deviceId: string; merchantName: string }): void {
  fireWebhook("soundbox.device_registered", merchantId, data as Record<string, unknown>);
}

// ─── EMI ──────────────────────────────────────────────────────────────────────
export function onEmiContractCreated(merchantId: string, data: { contractId: string; productName: string; principalKobo: number; tenureMonths: number; userId: string | number }): void {
  fireWebhook("emi.contract_created", merchantId, data as Record<string, unknown>);
}
export function onEmiInstallmentPaid(merchantId: string, data: { contractId: string; installmentNumber: number; amountKobo: number; userId: string | number }): void {
  fireWebhook("emi.installment_paid", merchantId, data as Record<string, unknown>);
}

// ─── Bulk Collections ─────────────────────────────────────────────────────────
export function onBulkCollectionCreated(merchantId: string, data: { collectionId: string; name: string; totalAmountKobo: number; itemCount: number }): void {
  fireWebhook("bulk_collection.created", merchantId, data as Record<string, unknown>);
}
export function onBulkCollectionCompleted(merchantId: string, data: { collectionId: string; collectedAmountKobo: number; itemCount: number }): void {
  fireWebhook("bulk_collection.completed", merchantId, data as Record<string, unknown>);
}

// ─── Salary ───────────────────────────────────────────────────────────────────
export function onSalaryCredited(merchantId: string, data: { reference: string; amountKobo: number; periodMonth: string; userId: string | number }): void {
  fireWebhook("salary.credited", merchantId, data as Record<string, unknown>);
}

// ─── Reports ──────────────────────────────────────────────────────────────────
export function onReportReady(merchantId: string, data: { reportId: string; reportType: string; downloadUrl: string; format: string }): void {
  fireWebhook("report.ready", merchantId, data as Record<string, unknown>);
}

// ─── Nodal Accounts ───────────────────────────────────────────────────────────
export function onNodalCredit(merchantId: string, data: { nodalAccountId: string; amountKobo: number; reference: string }): void {
  fireWebhook("nodal.credit", merchantId, data as Record<string, unknown>);
}
export function onNodalDebit(merchantId: string, data: { nodalAccountId: string; amountKobo: number; reference: string }): void {
  fireWebhook("nodal.debit", merchantId, data as Record<string, unknown>);
}

// ─── Smart Retail POS ─────────────────────────────────────────────────────────
export function onPosSaleCompleted(merchantId: string, data: { saleId: string; totalKobo: number; paymentMethod: string; itemCount: number }): void {
  fireWebhook("pos.sale_completed", merchantId, data as Record<string, unknown>);
}

// ─── International Remittance ─────────────────────────────────────────────────
export function onRemittanceInitiated(merchantId: string, data: { transferId: string; sourceAmountKobo: number; destinationCurrency: string; destinationCountry: string; userId: string | number }): void {
  fireWebhook("remittance.initiated", merchantId, data as Record<string, unknown>);
}
export function onRemittanceCompleted(merchantId: string, data: { transferId: string; reference: string; userId: string | number }): void {
  fireWebhook("remittance.completed", merchantId, data as Record<string, unknown>);
}

// ─── Subscription Billing V2 ─────────────────────────────────────────────────
export function onSubscriptionV2Created(merchantId: string, data: { subscriberId: string; planId: string; subscriberEmail: string }): void {
  fireWebhook("subscription_v2.created", merchantId, data as Record<string, unknown>);
}
export function onSubscriptionV2Cancelled(merchantId: string, data: { subscriberId: string; planId: string; reason?: string }): void {
  fireWebhook("subscription_v2.cancelled", merchantId, data as Record<string, unknown>);
}

// ─── Portal Billing ───────────────────────────────────────────────────────────
export function onPortalBillingUpgraded(merchantId: string, data: { planKey: string; stripeSubscriptionId: string }): void {
  fireWebhook("portal_billing.upgraded", merchantId, data as Record<string, unknown>);
}
export function onPortalBillingCancelled(merchantId: string, data: { planKey: string }): void {
  fireWebhook("portal_billing.cancelled", merchantId, data as Record<string, unknown>);
}
