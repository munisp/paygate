/**
 * webhookEvents.ts — Generic Webhook Event Dispatcher (Wave 78)
 *
 * Provides a type-safe, generic dispatchWebhookEvent() function that can fire
 * any event type to all active merchant webhook endpoints subscribed to that event.
 *
 * Supported event types (Wave 76–78 additions):
 *   digital_gold.purchased, digital_gold.sold, digital_gold.sip_executed
 *   mutual_fund.invested, mutual_fund.redeemed
 *   insurance.policy_created, insurance.claim_submitted, insurance.claim_settled
 *   pension.contribution_posted, pension.account_created
 *   cashback.earned, cashback.redeemed
 *   soundbox.payment_received, soundbox.device_registered
 *   wealth.goal_created, wealth.portfolio_rebalanced
 *   emi.contract_created, emi.installment_due, emi.installment_paid
 *   bulk_collection.created, bulk_collection.completed, bulk_collection.item_paid
 *   salary.credited, salary.account_created
 *   privacy.alias_created
 *   report.ready, report.scheduled
 *   nodal.credit, nodal.debit
 *   pos.sale_completed, pos.refund_issued
 *   remittance.initiated, remittance.completed, remittance.failed
 *   subscription_v2.created, subscription_v2.cancelled, subscription_v2.renewed
 *   portal_billing.upgraded, portal_billing.cancelled, portal_billing.payment_failed
 *
 * Existing event types (Waves 1–75) are also supported via this helper.
 */
import crypto from "crypto";
import { getDb } from "./db";
import { webhooks, webhookDeliveries } from "../drizzle/schema";
import { eq, and, sql } from "drizzle-orm";
import { logger } from "./logger";
import { deliverWebhookViaMiddleware } from "./middlewareBridge";

export type WebhookEventType =
  // ── Core payment events ──────────────────────────────────────────────────
  | "payment.completed"
  | "payment.failed"
  | "payment.refunded"
  | "payment.reversed"
  | "transaction.created"
  | "transaction.updated"
  | "payout.initiated"
  | "payout.completed"
  | "payout.failed"
  | "payout.approved"
  | "payout.rejected"
  | "dispute.created"
  | "dispute.resolved"
  | "settlement.sla_breach"
  | "settlement.completed"
  | "fraud.alert"
  | "kyc.approved"
  | "kyc.rejected"
  // ── Digital Gold ─────────────────────────────────────────────────────────
  | "digital_gold.purchased"
  | "digital_gold.sold"
  | "digital_gold.sip_executed"
  // ── Mutual Funds ─────────────────────────────────────────────────────────
  | "mutual_fund.invested"
  | "mutual_fund.redeemed"
  // ── Insurance ────────────────────────────────────────────────────────────
  | "insurance.policy_created"
  | "insurance.claim_submitted"
  | "insurance.claim_settled"
  // ── Pension ──────────────────────────────────────────────────────────────
  | "pension.contribution_posted"
  | "pension.account_created"
  // ── Cashback ─────────────────────────────────────────────────────────────
  | "cashback.earned"
  | "cashback.redeemed"
  // ── Soundbox ─────────────────────────────────────────────────────────────
  | "soundbox.payment_received"
  | "soundbox.device_registered"
  // ── Wealth Management ────────────────────────────────────────────────────
  | "wealth.goal_created"
  | "wealth.portfolio_rebalanced"
  // ── EMI ──────────────────────────────────────────────────────────────────
  | "emi.contract_created"
  | "emi.installment_due"
  | "emi.installment_paid"
  // ── Bulk Collections ─────────────────────────────────────────────────────
  | "bulk_collection.created"
  | "bulk_collection.completed"
  | "bulk_collection.item_paid"
  // ── Salary ───────────────────────────────────────────────────────────────
  | "salary.credited"
  | "salary.account_created"
  // ── Privacy ──────────────────────────────────────────────────────────────
  | "privacy.alias_created"
  // ── Reports ──────────────────────────────────────────────────────────────
  | "report.ready"
  | "report.scheduled"
  // ── Nodal Accounts ───────────────────────────────────────────────────────
  | "nodal.credit"
  | "nodal.debit"
  // ── Smart Retail POS ─────────────────────────────────────────────────────
  | "pos.sale_completed"
  | "pos.refund_issued"
  // ── International Remittance ─────────────────────────────────────────────
  | "remittance.initiated"
  | "remittance.completed"
  | "remittance.failed"
  // ── Subscription Billing V2 ──────────────────────────────────────────────
  | "subscription_v2.created"
  | "subscription_v2.cancelled"
  | "subscription_v2.renewed"
  // ── Portal Billing ───────────────────────────────────────────────────────
  | "portal_billing.upgraded"
  | "portal_billing.cancelled"
  | "portal_billing.payment_failed"
  // ── Paystack-parity wave ─────────────────────────────────────────────────
  | "refund.pending"
  | "refund.processing"
  | "refund.needs_attention"
  | "refund.failed"
  | "refund.processed"
  | "split.applied"
  | "paymentrequest.pending"
  | "paymentrequest.success"
  | "transfer.recipient.created"
  | "transfer.otp.required"
  | "direct_debit.authorization.created"
  | "direct_debit.authorization.active"
  | "direct_debit.authorization.deactivated"
  | "direct_debit.mandate.paused"
  | "direct_debit.mandate.resumed"
  | "direct_debit.debit.success"
  | "direct_debit.debit.failed"
  | "wallet.domain.verified"
  | "wallet.charge.success"
  | "dedicatedaccount.assign.success"
  | "dedicatedaccount.assign.failed"
  | "customer.identification.success"
  | "customer.identification.failed"
  | "subscription.not_renew"
  | "subscription.expiring_cards"
  | "subscription.manage_link.created";

export interface WebhookEventPayload<T extends WebhookEventType = WebhookEventType> {
  event: T;
  id: string;
  tenantId: string;
  merchantId: string;
  timestamp: string;
  data: Record<string, unknown>;
}

/**
 * Build HMAC-SHA256 signature for a payload string.
 */
function signPayload(secret: string, payloadStr: string): string {
  return "sha256=" + crypto.createHmac("sha256", secret).update(payloadStr).digest("hex");
}

/**
 * Dispatch a webhook event to all active merchant endpoints subscribed to the event type.
 * Returns counts of successful and failed deliveries.
 */
export async function dispatchWebhookEvent(
  payload: WebhookEventPayload,
): Promise<{ dispatched: number; failed: number }> {
  const db = await getDb();
  if (!db) return { dispatched: 0, failed: 0 };

  const payloadStr = JSON.stringify(payload);
  let dispatched = 0;
  let failed = 0;

  try {
    // Load all active webhooks for this merchant that subscribe to this event type
    const endpoints = await db
      .select()
      .from(webhooks)
      .where(
        and(
          eq(webhooks.merchantId, payload.merchantId),
          eq(webhooks.isActive, true),
          sql`${webhooks.events} @> ${JSON.stringify([payload.event])}::jsonb`,
        ),
      );

    for (const endpoint of endpoints) {
      const signature = signPayload(endpoint.secret ?? "default-secret", payloadStr);
      let statusCode = 0;
      let responseBody = "";
      let success = false;

      try {
        const res = await fetch(endpoint.url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "X-PayGate-Signature": signature,
            "X-PayGate-Event": payload.event,
            "X-PayGate-Delivery-ID": payload.id,
          },
          body: payloadStr,
          signal: AbortSignal.timeout(5000),
        });
        statusCode = res.status;
        responseBody = await res.text().catch(() => "");
        success = res.ok;
        if (success) dispatched++; else failed++;
      } catch (fetchErr: any) {
        statusCode = 0;
        responseBody = fetchErr.message ?? "fetch failed";
        failed++;
      }

      // Log delivery to webhook_deliveries table
      try {
        await db.insert(webhookDeliveries).values({
          id: `del_${crypto.randomBytes(10).toString("hex")}`,
          tenantId: "ten_default",
          webhookId: endpoint.id,
          merchantId: payload.merchantId,
          eventType: payload.event,
          payload: JSON.parse(payloadStr) as Record<string, unknown>,
          responseStatus: statusCode,
          responseBody: responseBody.slice(0, 2000),
          status: success ? "success" as const : "failed" as const,
          attemptCount: 1,
          deliveredAt: success ? new Date() : null,
          createdAt: new Date(),
        });
      } catch (dbErr) {
        logger.error("[webhookEvents] Failed to log delivery:", dbErr);
      }

      // Also dispatch via middleware for Kafka fan-out + Lakehouse audit
      try {
        await deliverWebhookViaMiddleware({
          deliveryId: `del_${crypto.randomBytes(8).toString("hex")}`,
          webhookId: endpoint.id,
          merchantId: payload.merchantId,
          eventType: payload.event,
          payload: JSON.parse(payloadStr) as Record<string, unknown>,
          targetUrl: endpoint.url,
          secret: endpoint.secret ?? "default-secret",
        });
      } catch {
        // Middleware unavailable — graceful degradation
      }
    }
  } catch (err) {
    logger.error("[webhookEvents] Dispatch error:", err);
  }

  return { dispatched, failed };
}

/**
 * Convenience factory for building a typed event payload.
 */
export function buildWebhookPayload<T extends WebhookEventType>(
  event: T,
  merchantId: string,
  tenantId: string,
  data: Record<string, unknown>,
): WebhookEventPayload<T> {
  return {
    event,
    id: `evt_${crypto.randomBytes(12).toString("hex")}`,
    tenantId,
    merchantId,
    timestamp: new Date().toISOString(),
    data,
  };
}
