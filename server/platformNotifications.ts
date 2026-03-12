/**
 * platformNotifications.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Centralised notification triggers for key platform events.
 * Uses the built-in Manus notifyOwner channel for owner-facing alerts.
 * Extend with email/SMS providers (SendGrid, Termii, Africa's Talking) as needed.
 */

import { notifyOwner } from "./_core/notification.js";

// ─── Dispute Notifications ────────────────────────────────────────────────────

export async function notifyDisputeOpened(opts: {
  merchantName: string;
  disputeId: string;
  transactionRef: string;
  amount: number;
  currency: string;
  reason: string;
}) {
  const { merchantName, disputeId, transactionRef, amount, currency, reason } = opts;
  await notifyOwner({
    title: `⚠️ New Dispute Opened — ${merchantName}`,
    content: `A new dispute has been filed.\n\n**Merchant:** ${merchantName}\n**Dispute ID:** ${disputeId}\n**Transaction:** ${transactionRef}\n**Amount:** ${currency} ${amount.toLocaleString()}\n**Reason:** ${reason}\n\nPlease review in the admin portal.`,
  }).catch(e => console.warn("[notify] dispute opened failed (non-fatal):", e));
}

export async function notifyDisputeEscalated(opts: {
  merchantName: string;
  disputeId: string;
  amount: number;
  currency: string;
}) {
  const { merchantName, disputeId, amount, currency } = opts;
  await notifyOwner({
    title: `🚨 Dispute Escalated — ${merchantName}`,
    content: `A dispute has been escalated and requires immediate review.\n\n**Merchant:** ${merchantName}\n**Dispute ID:** ${disputeId}\n**Amount:** ${currency} ${amount.toLocaleString()}`,
  }).catch(e => console.warn("[notify] dispute escalated failed (non-fatal):", e));
}

export async function notifyDisputeResolved(opts: {
  merchantName: string;
  disputeId: string;
  outcome: "merchant_won" | "customer_won" | "closed";
  amount: number;
  currency: string;
}) {
  const { merchantName, disputeId, outcome, amount, currency } = opts;
  const outcomeLabel = outcome === "merchant_won" ? "✅ Merchant Won" : outcome === "customer_won" ? "❌ Customer Won" : "Closed";
  await notifyOwner({
    title: `Dispute Resolved — ${outcomeLabel}`,
    content: `Dispute **${disputeId}** for merchant **${merchantName}** has been resolved.\n\n**Outcome:** ${outcomeLabel}\n**Amount:** ${currency} ${amount.toLocaleString()}`,
  }).catch(e => console.warn("[notify] dispute resolved failed (non-fatal):", e));
}

// ─── Transfer / Payout Notifications ─────────────────────────────────────────

export async function notifyPayoutInitiated(opts: {
  merchantName: string;
  payoutId: string;
  amount: number;
  currency: string;
  bankName: string;
}) {
  const { merchantName, payoutId, amount, currency, bankName } = opts;
  await notifyOwner({
    title: `💸 Payout Initiated — ${merchantName}`,
    content: `A payout has been initiated and is pending approval.\n\n**Merchant:** ${merchantName}\n**Payout ID:** ${payoutId}\n**Amount:** ${currency} ${amount.toLocaleString()}\n**Bank:** ${bankName}`,
  }).catch(e => console.warn("[notify] payout initiated failed (non-fatal):", e));
}

export async function notifyPayoutApproved(opts: {
  merchantName: string;
  payoutId: string;
  amount: number;
  currency: string;
}) {
  const { merchantName, payoutId, amount, currency } = opts;
  await notifyOwner({
    title: `✅ Payout Approved — ${merchantName}`,
    content: `Payout **${payoutId}** for **${merchantName}** has been approved.\n\n**Amount:** ${currency} ${amount.toLocaleString()}`,
  }).catch(e => console.warn("[notify] payout approved failed (non-fatal):", e));
}

// ─── KYC Notifications ────────────────────────────────────────────────────────

export async function notifyKycSubmitted(opts: {
  merchantName: string;
  merchantId: string;
  documentCount: number;
}) {
  const { merchantName, merchantId, documentCount } = opts;
  await notifyOwner({
    title: `📄 KYC Documents Submitted — ${merchantName}`,
    content: `A merchant has submitted KYC documents for review.\n\n**Merchant:** ${merchantName}\n**ID:** ${merchantId}\n**Documents:** ${documentCount} files uploaded\n\nPlease review in the admin portal.`,
  }).catch(e => console.warn("[notify] kyc submitted failed (non-fatal):", e));
}

export async function notifyKycApproved(opts: {
  merchantName: string;
  merchantId: string;
}) {
  const { merchantName, merchantId } = opts;
  await notifyOwner({
    title: `✅ KYC Approved — ${merchantName}`,
    content: `KYC verification for **${merchantName}** (${merchantId}) has been approved. The merchant can now go live.`,
  }).catch(e => console.warn("[notify] kyc approved failed (non-fatal):", e));
}

// ─── Fraud Notifications ──────────────────────────────────────────────────────

export async function notifyHighRiskTransaction(opts: {
  merchantName: string;
  transactionId: string;
  amount: number;
  currency: string;
  riskScore: number;
  riskReason: string;
}) {
  const { merchantName, transactionId, amount, currency, riskScore, riskReason } = opts;
  await notifyOwner({
    title: `🔴 High-Risk Transaction Detected — ${merchantName}`,
    content: `A transaction has been flagged as high-risk.\n\n**Merchant:** ${merchantName}\n**Transaction:** ${transactionId}\n**Amount:** ${currency} ${amount.toLocaleString()}\n**Risk Score:** ${riskScore}/100\n**Reason:** ${riskReason}`,
  }).catch(e => console.warn("[notify] high risk tx failed (non-fatal):", e));
}

// ─── Consumer Transfer Notifications ─────────────────────────────────────────

export async function notifyConsumerTransferReceived(opts: {
  recipientName: string;
  senderName: string;
  amount: number;
  currency: string;
  reference: string;
}) {
  const { recipientName, senderName, amount, currency, reference } = opts;
  await notifyOwner({
    title: `💰 Transfer Received — ${recipientName}`,
    content: `**${recipientName}** received a transfer.\n\n**From:** ${senderName}\n**Amount:** ${currency} ${amount.toLocaleString()}\n**Reference:** ${reference}`,
  }).catch(e => console.warn("[notify] consumer transfer failed (non-fatal):", e));
}
