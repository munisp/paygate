/**
 * middlewareBridge.ts
 * ═══════════════════════════════════════════════════════════════════════════════
 * Typed client for the PayGate Go middleware bridge.
 *
 * Every domain service in the portal calls through this file when the bridge is
 * available.  When MIDDLEWARE_BRIDGE_URL is unset (local dev / sandbox) every
 * function returns null so the portal falls back to direct DB operations.
 *
 * Full middleware stack wired through the bridge:
 *   Temporal     — workflow orchestration (payments, KYC, disputes, settlements)
 *   TigerBeetle  — double-entry ledger (reserves, commits, voids, wallet debits)
 *   Kafka        — event bus (all domain events published after state changes)
 *   Dapr         — service mesh pub/sub + state store
 *   Fluvio       — real-time event streaming to SSE consumers
 *   Permify      — fine-grained authorization checks
 *   Keycloak     — JWT validation + role management + role sync to Permify
 *   Redis        — idempotency, rate-limit, approval state, session cache
 *   APISIX       — API gateway routing (all requests enter via APISIX)
 *   Lakehouse    — compliance audit trail (every state change written)
 */

import { ENV } from "./_core/env";
import { getCircuitBreaker, CircuitBreakerOpenError } from "./circuitBreaker";
import { logger } from "./logger";

// ─── Bridge availability ──────────────────────────────────────────────────────

export function isBridgeAvailable(): boolean {
  return Boolean(ENV.middlewareBridgeUrl);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function bridgeRequest<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T> {
  const url = `${ENV.middlewareBridgeUrl}${path}`;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Internal-Key": ENV.middlewareInternalKey,
  };
  const res = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`Bridge ${method} ${path} failed: HTTP ${res.status} — ${text}`);
  }
  return res.json() as Promise<T>;
}

/** Safe wrapper — uses circuit breaker, logs and returns null on failure (never throws to callers) */
export async function safe<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T | null> {
  const cb = getCircuitBreaker("go-bridge", { failureThreshold: 5, recoveryTimeMs: 30_000 });
  try {
    return await cb.execute(() => bridgeRequest<T>(method, path, body));
  } catch (err: any) {
    if (err instanceof CircuitBreakerOpenError) {
      logger.warn("bridge_circuit_open", { path, message: err.message });
    } else {
      logger.warn("bridge_degraded", { method, path, error: err?.message });
    }
    return null;
  }
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUT APPROVAL
// ═══════════════════════════════════════════════════════════════════════════════

export interface InitiateApprovalRequest {
  payoutId: string; merchantId: string; amount: number; currency: string;
  bankCode: string; accountNumber: string; accountName: string;
  narration?: string; reference: string; initiatorId: string;
}
export interface InitiateApprovalResponse {
  workflowId: string; runId: string; status: string; createdAt: string;
}
export interface ApprovalDecisionRequest { approverId: string; reason?: string; }
export interface ApprovalDecisionResponse {
  payoutId: string; status: string; signaledAt: string;
}
export interface ApprovalStatusResponse {
  payoutId: string; workflowId: string; status: string;
}

/** Starts Temporal PayoutApprovalWorkflow: Permify → TigerBeetle reserve → Redis → Kafka/Dapr/Fluvio → Lakehouse */
export async function initiatePayoutApproval(req: InitiateApprovalRequest): Promise<InitiateApprovalResponse | null> {
  return safe<InitiateApprovalResponse>("POST", "/v1/payouts/initiate-approval", {
    payout_id: req.payoutId, merchant_id: req.merchantId, amount: req.amount,
    currency: req.currency, bank_code: req.bankCode, account_number: req.accountNumber,
    account_name: req.accountName, narration: req.narration ?? "",
    reference: req.reference, initiator_id: req.initiatorId,
  });
}

/** Signals Temporal workflow (approved=true): TigerBeetle commit → bank transfer → Kafka/Dapr/Fluvio → Lakehouse */
export async function approvePayoutViaMiddleware(payoutId: string, req: ApprovalDecisionRequest): Promise<ApprovalDecisionResponse | null> {
  return safe<ApprovalDecisionResponse>("POST", `/v1/payouts/${payoutId}/approve`, {
    approver_id: req.approverId, reason: req.reason ?? "",
  });
}

/** Signals Temporal workflow (approved=false): TigerBeetle void → Kafka/Dapr/Fluvio → Lakehouse */
export async function rejectPayoutViaMiddleware(payoutId: string, req: ApprovalDecisionRequest): Promise<ApprovalDecisionResponse | null> {
  return safe<ApprovalDecisionResponse>("POST", `/v1/payouts/${payoutId}/reject`, {
    approver_id: req.approverId, reason: req.reason ?? "",
  });
}

/** Returns current Temporal workflow status for a pending payout */
export async function getPayoutApprovalStatus(payoutId: string): Promise<ApprovalStatusResponse | null> {
  return safe<ApprovalStatusResponse>("GET", `/v1/payouts/${payoutId}/approval-status`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// TRANSACTIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface RecordTransactionRequest {
  transactionId: string; merchantId: string; customerId?: string;
  amount: number; currency: string; type: string; channel: string;
  reference: string; description?: string;
}
export interface RecordTransactionResponse {
  transactionId: string; ledgerEntryId: string; workflowId: string; status: string;
}

/** Records transaction in TigerBeetle, starts Temporal payment workflow, publishes Kafka payment.initiated → Dapr/Fluvio → Lakehouse */
export async function recordTransactionViaMiddleware(req: RecordTransactionRequest): Promise<RecordTransactionResponse | null> {
  return safe<RecordTransactionResponse>("POST", "/v1/transactions/record", {
    transaction_id: req.transactionId, merchant_id: req.merchantId,
    customer_id: req.customerId ?? "", amount: req.amount,
    currency: req.currency, type: req.type, channel: req.channel,
    reference: req.reference, description: req.description ?? "",
  });
}

export interface RefundTransactionRequest {
  transactionId: string; merchantId: string; amount: number;
  reason: string; initiatorId: string;
}
export interface RefundTransactionResponse {
  refundId: string; transactionId: string; workflowId: string; status: string;
}

/** TigerBeetle reversal → Kafka payment.reversed → Dapr/Fluvio → Lakehouse */
export async function refundTransactionViaMiddleware(req: RefundTransactionRequest): Promise<RefundTransactionResponse | null> {
  return safe<RefundTransactionResponse>("POST", "/v1/transactions/refund", {
    transaction_id: req.transactionId, merchant_id: req.merchantId,
    amount: req.amount, reason: req.reason, initiator_id: req.initiatorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DISPUTES
// ═══════════════════════════════════════════════════════════════════════════════

export interface SubmitDisputeRequest {
  disputeId: string; transactionId: string; merchantId: string;
  reason: string; amount: number; currency: string;
  evidenceUrl?: string; submitterId: string;
}
export interface SubmitDisputeResponse {
  disputeId: string; workflowId: string; status: string; reservationId: string;
}

/** Permify check → TigerBeetle reserve disputed amount → Kafka dispute.created → Dapr/Fluvio → Lakehouse */
export async function submitDisputeViaMiddleware(req: SubmitDisputeRequest): Promise<SubmitDisputeResponse | null> {
  return safe<SubmitDisputeResponse>("POST", "/v1/disputes/submit", {
    dispute_id: req.disputeId, transaction_id: req.transactionId,
    merchant_id: req.merchantId, reason: req.reason, amount: req.amount,
    currency: req.currency, evidence_url: req.evidenceUrl ?? "",
    submitter_id: req.submitterId,
  });
}

export interface ResolveDisputeRequest {
  disputeId: string; merchantId: string;
  resolution: "won" | "lost" | "partial";
  resolverId: string; refundAmount?: number;
}
export interface ResolveDisputeResponse {
  disputeId: string; status: string; workflowId: string;
}

/** Signals Temporal DisputeWorkflow: TigerBeetle commit/void → Kafka dispute.resolved → Dapr/Fluvio → Lakehouse */
export async function resolveDisputeViaMiddleware(req: ResolveDisputeRequest): Promise<ResolveDisputeResponse | null> {
  return safe<ResolveDisputeResponse>("POST", `/v1/disputes/${req.disputeId}/resolve`, {
    merchant_id: req.merchantId, resolution: req.resolution,
    resolver_id: req.resolverId, refund_amount: req.refundAmount ?? 0,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAUD & RISK
// ═══════════════════════════════════════════════════════════════════════════════

export interface FraudScoreRequest {
  transactionId: string; merchantId: string; amount: number; currency: string;
  channel: string; customerId?: string; ipAddress?: string; deviceFingerprint?: string;
}
export interface FraudScoreResponse {
  transactionId: string; riskScore: number;
  riskLevel: "low" | "medium" | "high" | "critical";
  decision: "allow" | "review" | "block";
  modelVersion: string; features: Record<string, number>;
}

/** Python GNN+Bayesian ML scoring → Redis cache → Kafka risk.score → Fluvio SSE → Lakehouse ML audit */
export async function scoreFraudViaMiddleware(req: FraudScoreRequest): Promise<FraudScoreResponse | null> {
  return safe<FraudScoreResponse>("POST", "/v1/fraud/score", {
    transaction_id: req.transactionId, merchant_id: req.merchantId,
    amount: req.amount, currency: req.currency, channel: req.channel,
    customer_id: req.customerId ?? "", ip_address: req.ipAddress ?? "",
    device_fingerprint: req.deviceFingerprint ?? "",
  });
}

export interface AcknowledgeFraudAlertRequest {
  alertId: string; merchantId: string; acknowledgerId: string;
  action: "dismiss" | "block_customer" | "escalate"; notes?: string;
}

/** Permify check → Redis DEL alert → Kafka fraud.decision → Dapr/Fluvio → Lakehouse */
export async function acknowledgeFraudAlertViaMiddleware(req: AcknowledgeFraudAlertRequest): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", `/v1/fraud/alerts/${req.alertId}/acknowledge`, {
    merchant_id: req.merchantId, acknowledger_id: req.acknowledgerId,
    action: req.action, notes: req.notes ?? "",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KYC / COMPLIANCE
// ═══════════════════════════════════════════════════════════════════════════════

export interface StartKYCWorkflowRequest {
  submissionId: string; merchantId: string; documentType: string;
  documentUrl: string; initiatorId: string;
}
export interface StartKYCWorkflowResponse {
  submissionId: string; workflowId: string; status: string;
}

/** Temporal KYCWorkflow: document verification → Kafka merchant.kyc_update → Dapr/Fluvio → Lakehouse compliance */
export async function startKYCWorkflowViaMiddleware(req: StartKYCWorkflowRequest): Promise<StartKYCWorkflowResponse | null> {
  return safe<StartKYCWorkflowResponse>("POST", "/v1/kyc/start", {
    submission_id: req.submissionId, merchant_id: req.merchantId,
    document_type: req.documentType, document_url: req.documentUrl,
    initiator_id: req.initiatorId,
  });
}

export interface UpdateKYCStatusRequest {
  submissionId: string; merchantId: string;
  status: "approved" | "rejected" | "under_review";
  reviewerId: string; rejectionReason?: string;
}

/** Keycloak role update (if approved) → Permify policy update → Kafka merchant.kyc_update → Dapr/Fluvio → Lakehouse */
export async function updateKYCStatusViaMiddleware(req: UpdateKYCStatusRequest): Promise<{ success: boolean; workflowId?: string } | null> {
  return safe<{ success: boolean; workflowId?: string }>("POST", `/v1/kyc/${req.submissionId}/update-status`, {
    merchant_id: req.merchantId, status: req.status,
    reviewer_id: req.reviewerId, rejection_reason: req.rejectionReason ?? "",
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// BNPL (Buy Now Pay Later)
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreateBNPLLoanRequest {
  loanId: string; merchantId: string; customerId?: string;
  principalAmount: number; currency: string; installments: number;
  installmentAmount: number; interestRate: number; transactionId?: string;
}
export interface CreateBNPLLoanResponse {
  loanId: string; workflowId: string; reservationId: string; status: string;
}

/** Temporal BNPLWorkflow: TigerBeetle reserve principal → Kafka bnpl.loan_created → Dapr/Fluvio → Lakehouse */
export async function createBNPLLoanViaMiddleware(req: CreateBNPLLoanRequest): Promise<CreateBNPLLoanResponse | null> {
  return safe<CreateBNPLLoanResponse>("POST", "/v1/bnpl/loans/create", {
    loan_id: req.loanId, merchant_id: req.merchantId,
    customer_id: req.customerId ?? "", principal_amount: req.principalAmount,
    currency: req.currency, installments: req.installments,
    installment_amount: req.installmentAmount, interest_rate: req.interestRate,
    transaction_id: req.transactionId ?? "",
  });
}

export interface ProcessBNPLInstalmentRequest {
  loanId: string; merchantId: string; instalmentNumber: number;
  amount: number; currency: string;
}

/** TigerBeetle commit instalment → Kafka bnpl.instalment → Dapr/Fluvio → Lakehouse */
export async function processBNPLInstalmentViaMiddleware(req: ProcessBNPLInstalmentRequest): Promise<{ success: boolean; ledgerEntryId?: string } | null> {
  return safe<{ success: boolean; ledgerEntryId?: string }>("POST", `/v1/bnpl/loans/${req.loanId}/instalment`, {
    merchant_id: req.merchantId, instalment_number: req.instalmentNumber,
    amount: req.amount, currency: req.currency,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// FX (Foreign Exchange)
// ═══════════════════════════════════════════════════════════════════════════════

export interface FXConversionRequest {
  conversionId: string; merchantId: string;
  sourceCurrency: string; targetCurrency: string;
  sourceAmount: number; exchangeRate: number; fee: number; targetAmount: number;
}
export interface FXConversionResponse {
  conversionId: string; ledgerEntryId: string; status: string;
}

/** TigerBeetle debit source + credit target → Kafka fx.conversion → Dapr/Fluvio → Lakehouse */
export async function recordFXConversionViaMiddleware(req: FXConversionRequest): Promise<FXConversionResponse | null> {
  return safe<FXConversionResponse>("POST", "/v1/fx/convert", {
    conversion_id: req.conversionId, merchant_id: req.merchantId,
    source_currency: req.sourceCurrency, target_currency: req.targetCurrency,
    source_amount: req.sourceAmount, exchange_rate: req.exchangeRate,
    fee: req.fee, target_amount: req.targetAmount,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WALLETS (Consumer)
// ═══════════════════════════════════════════════════════════════════════════════

export interface WalletDebitRequest {
  walletId: string; userId: string; amount: number; currency: string;
  reference: string; description?: string;
}
export interface WalletDebitResponse {
  walletId: string; ledgerEntryId: string; newBalance: number; status: string;
}

/** Permify check (wallet:debit) → Rust TigerBeetle FFI debit → Kafka ledger.transfer → Dapr/Fluvio → Lakehouse */
export async function debitWalletViaMiddleware(req: WalletDebitRequest): Promise<WalletDebitResponse | null> {
  return safe<WalletDebitResponse>("POST", "/v1/wallets/debit", {
    wallet_id: req.walletId, user_id: req.userId, amount: req.amount,
    currency: req.currency, reference: req.reference,
    description: req.description ?? "",
  });
}

export interface WalletCreditRequest {
  walletId: string; userId: string; amount: number; currency: string;
  reference: string; description?: string;
}
export interface WalletCreditResponse {
  walletId: string; ledgerEntryId: string; newBalance: number; status: string;
}

/** Rust TigerBeetle FFI credit → Kafka ledger.transfer → Dapr/Fluvio → Lakehouse */
export async function creditWalletViaMiddleware(req: WalletCreditRequest): Promise<WalletCreditResponse | null> {
  return safe<WalletCreditResponse>("POST", "/v1/wallets/credit", {
    wallet_id: req.walletId, user_id: req.userId, amount: req.amount,
    currency: req.currency, reference: req.reference,
    description: req.description ?? "",
  });
}

export interface P2PTransferRequest {
  transferId: string; senderWalletId: string; receiverWalletId: string;
  senderUserId: string; receiverUserId: string;
  amount: number; currency: string; narration?: string;
}
export interface P2PTransferResponse {
  transferId: string; workflowId: string; status: string;
}

/** Permify check → Temporal P2PWorkflow: TigerBeetle atomic debit+credit → Kafka ledger.transfer → Dapr/Fluvio → Lakehouse */
export async function p2pTransferViaMiddleware(req: P2PTransferRequest): Promise<P2PTransferResponse | null> {
  return safe<P2PTransferResponse>("POST", "/v1/wallets/p2p-transfer", {
    transfer_id: req.transferId, sender_wallet_id: req.senderWalletId,
    receiver_wallet_id: req.receiverWalletId, sender_user_id: req.senderUserId,
    receiver_user_id: req.receiverUserId, amount: req.amount,
    currency: req.currency, narration: req.narration ?? "",
  });
}

export interface WalletBalanceRequest {
  walletId: string; currency: string;
}
export interface WalletBalanceResponse {
  walletId: string; balance: number; currency: string;
}

/** TigerBeetle LookupAccounts → returns credits_posted − debits_posted for the wallet account */
export async function getWalletBalanceViaMiddleware(req: WalletBalanceRequest): Promise<WalletBalanceResponse | null> {
  return safe<WalletBalanceResponse>("POST", "/v1/wallets/balance", {
    wallet_id: req.walletId, currency: req.currency,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEBHOOKS
// ═══════════════════════════════════════════════════════════════════════════════

export interface DeliverWebhookRequest {
  deliveryId: string; webhookId: string; merchantId: string;
  eventType: string; payload: Record<string, unknown>;
  targetUrl: string; secret: string;
}
export interface DeliverWebhookResponse {
  deliveryId: string; status: "delivered" | "failed";
  httpStatus?: number; retryCount: number; nextRetryAt?: string;
}

/** HMAC-SHA256 signing → HTTP delivery → Kafka webhook.delivery → Redis retry state → Dapr retry scheduling → Lakehouse */
export async function deliverWebhookViaMiddleware(req: DeliverWebhookRequest): Promise<DeliverWebhookResponse | null> {
  return safe<DeliverWebhookResponse>("POST", "/v1/webhooks/deliver", {
    delivery_id: req.deliveryId, webhook_id: req.webhookId,
    merchant_id: req.merchantId, event_type: req.eventType,
    payload: req.payload, target_url: req.targetUrl, secret: req.secret,
  });
}

export interface RetryWebhookRequest {
  deliveryId: string; webhookId: string; merchantId: string;
}

/** Redis GET retry state → HTTP delivery → Kafka webhook.retry → Lakehouse */
export async function retryWebhookViaMiddleware(req: RetryWebhookRequest): Promise<DeliverWebhookResponse | null> {
  return safe<DeliverWebhookResponse>("POST", `/v1/webhooks/deliveries/${req.deliveryId}/retry`, {
    webhook_id: req.webhookId, merchant_id: req.merchantId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// VIRTUAL CARDS
// ═══════════════════════════════════════════════════════════════════════════════

export interface IssueVirtualCardRequest {
  cardId: string; merchantId: string; spendingLimit: number;
  currency: string; label: string; issuerId: string;
}
export interface IssueVirtualCardResponse {
  cardId: string; workflowId: string; reservationId: string;
  maskedPan: string; status: string;
}

/** Permify check → TigerBeetle reserve spending limit → Kafka card.issued → Dapr/Fluvio → Lakehouse */
export async function issueVirtualCardViaMiddleware(req: IssueVirtualCardRequest): Promise<IssueVirtualCardResponse | null> {
  return safe<IssueVirtualCardResponse>("POST", "/v1/virtual-cards/issue", {
    card_id: req.cardId, merchant_id: req.merchantId,
    spending_limit: req.spendingLimit, currency: req.currency,
    label: req.label, issuer_id: req.issuerId,
  });
}

export interface FreezeVirtualCardRequest {
  cardId: string; merchantId: string; freeze: boolean; operatorId: string;
}

/** Permify check → Redis card state update → Kafka card.frozen/unfrozen → Dapr/Fluvio → Lakehouse */
export async function freezeVirtualCardViaMiddleware(req: FreezeVirtualCardRequest): Promise<{ success: boolean } | null> {
  const action = req.freeze ? "freeze" : "unfreeze";
  return safe<{ success: boolean }>("POST", `/v1/virtual-cards/${req.cardId}/${action}`, {
    merchant_id: req.merchantId, operator_id: req.operatorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYMENT LINKS
// ═══════════════════════════════════════════════════════════════════════════════

export interface CreatePaymentLinkRequest {
  linkId: string; merchantId: string; amount: number; currency: string;
  description: string; expiresAt?: Date; creatorId: string;
}
export interface CreatePaymentLinkResponse {
  linkId: string; url: string; shortCode: string; status: string;
}

/** Permify check → Redis link cache → Kafka payment_link.created → Dapr/Fluvio → Lakehouse */
export async function createPaymentLinkViaMiddleware(req: CreatePaymentLinkRequest): Promise<CreatePaymentLinkResponse | null> {
  return safe<CreatePaymentLinkResponse>("POST", "/v1/payment-links/create", {
    link_id: req.linkId, merchant_id: req.merchantId, amount: req.amount,
    currency: req.currency, description: req.description,
    expires_at: req.expiresAt?.toISOString() ?? "",
    creator_id: req.creatorId,
  });
}

export interface DeactivatePaymentLinkRequest {
  linkId: string; merchantId: string; operatorId: string;
}

/** Redis DEL link cache → Kafka payment_link.deactivated → Dapr/Fluvio → Lakehouse */
export async function deactivatePaymentLinkViaMiddleware(req: DeactivatePaymentLinkRequest): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", `/v1/payment-links/${req.linkId}/deactivate`, {
    merchant_id: req.merchantId, operator_id: req.operatorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SETTLEMENTS
// ═══════════════════════════════════════════════════════════════════════════════

export interface TriggerSettlementRequest {
  settlementId: string; merchantId: string; amount: number; currency: string;
  bankCode: string; accountNumber: string; accountName: string;
  periodStart: Date; periodEnd: Date;
}
export interface TriggerSettlementResponse {
  settlementId: string; workflowId: string; status: string;
}

/** Temporal SettlementWorkflow: TigerBeetle commit → bank transfer → Kafka payout.completed → Dapr/Fluvio → Python Lakehouse settlement audit */
export async function triggerSettlementViaMiddleware(req: TriggerSettlementRequest): Promise<TriggerSettlementResponse | null> {
  return safe<TriggerSettlementResponse>("POST", "/v1/settlements/trigger", {
    settlement_id: req.settlementId, merchant_id: req.merchantId,
    amount: req.amount, currency: req.currency, bank_code: req.bankCode,
    account_number: req.accountNumber, account_name: req.accountName,
    period_start: req.periodStart.toISOString(),
    period_end: req.periodEnd.toISOString(),
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MOBILE MONEY RECONCILIATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface ReconcileMoMoRequest {
  reconId: string; merchantId: string; provider: string;
  externalRef: string; amount: number; currency: string;
  direction: "incoming" | "outgoing";
}
export interface ReconcileMoMoResponse {
  reconId: string; status: "matched" | "unmatched" | "pending"; ledgerEntryId?: string;
}

/** Python USSD/MoMo gateway → TigerBeetle ledger entry → Kafka momo.reconciled/unmatched → Dapr/Fluvio → Lakehouse */
export async function reconcileMoMoViaMiddleware(req: ReconcileMoMoRequest): Promise<ReconcileMoMoResponse | null> {
  return safe<ReconcileMoMoResponse>("POST", "/v1/mobile-money/reconcile", {
    recon_id: req.reconId, merchant_id: req.merchantId,
    provider: req.provider, external_ref: req.externalRef,
    amount: req.amount, currency: req.currency, direction: req.direction,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// KEYCLOAK ROLE SYNC TO PERMIFY
// ═══════════════════════════════════════════════════════════════════════════════

export interface SyncRolesRequest {
  userId: string; merchantId: string; keycloakSubject: string; roles: string[];
}
export interface SyncRolesResponse {
  userId: string; syncedRoles: string[];
  permifyRelationships: number; keycloakUpdated: boolean;
}

/** Keycloak GET user roles → Permify WriteRelationships (upsert) → Redis cache permissions → Kafka merchant.role_updated → Lakehouse */
export async function syncRolesToPermifyViaMiddleware(req: SyncRolesRequest): Promise<SyncRolesResponse | null> {
  return safe<SyncRolesResponse>("POST", "/v1/auth/sync-roles", {
    user_id: req.userId, merchant_id: req.merchantId,
    keycloak_subject: req.keycloakSubject, roles: req.roles,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TEMPORAL WORKFLOW OBSERVABILITY
// ═══════════════════════════════════════════════════════════════════════════════

export interface WorkflowStatusResponse {
  workflowId: string; status: string; startTime: string;
  closeTime?: string; historyLength: number; taskQueue: string; type: string;
}

export interface ActiveWorkflow {
  workflowId: string; type: string; status: string; startTime: string;
  elapsedSeconds: number; entityId: string; entityType: string;
}

/** Returns Temporal workflow status for any workflow ID (used by observability dashboard) */
export async function getWorkflowStatusViaMiddleware(workflowId: string, merchantId: string): Promise<WorkflowStatusResponse | null> {
  return safe<WorkflowStatusResponse>("GET", `/v1/workflows/${workflowId}/status?merchant_id=${merchantId}`);
}

/** Lists all active Temporal workflows for a merchant (used by observability dashboard) */
export async function listActiveWorkflowsViaMiddleware(merchantId: string, workflowType?: string, limit = 50): Promise<ActiveWorkflow[] | null> {
  const qs = `merchant_id=${merchantId}&limit=${limit}${workflowType ? `&type=${workflowType}` : ""}`;
  return safe<ActiveWorkflow[]>("GET", `/v1/workflows/active?${qs}`);
}

/** Force-terminates a stuck Temporal workflow (admin escape hatch for timed-out approvals) */
export async function forceTerminateWorkflowViaMiddleware(workflowId: string, merchantId: string, reason: string, operatorId: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", `/v1/workflows/${workflowId}/terminate`, {
    merchant_id: merchantId, reason, operator_id: operatorId,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PAYOUT APPROVAL EMAIL NOTIFICATIONS
// ═══════════════════════════════════════════════════════════════════════════════

export interface SendApprovalEmailRequest {
  payoutId: string; merchantId: string; amount: number; currency: string;
  recipientEmails: string[]; approvalUrl: string; initiatorName: string;
}

/** Keycloak GET role members → email delivery → Kafka notification event → Dapr pub/sub → Lakehouse */
export async function sendPayoutApprovalEmailViaMiddleware(req: SendApprovalEmailRequest): Promise<{ sent: number } | null> {
  return safe<{ sent: number }>("POST", "/v1/notifications/payout-approval-email", {
    payout_id: req.payoutId, merchant_id: req.merchantId,
    amount: req.amount, currency: req.currency,
    recipient_emails: req.recipientEmails, approval_url: req.approvalUrl,
    initiator_name: req.initiatorName,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NIP / NIBSS NAME ENQUIRY
// ═══════════════════════════════════════════════════════════════════════════════
export interface NipNameEnquiryResult {
  accountName: string;
  bankCode: string;
  accountNumber: string;
  sessionId: string;
}
/** NIBSS NIP name enquiry via Go bridge (Redis-cached, 24h TTL) */
export async function nipNameEnquiryViaMiddleware(
  accountNumber: string,
  bankCode: string,
  merchantId: string,
): Promise<NipNameEnquiryResult | null> {
  return safe<NipNameEnquiryResult>("POST", "/v1/nibss/name-enquiry", {
    account_number: accountNumber,
    bank_code: bankCode,
    merchant_id: merchantId,
  });
}


// ═══════════════════════════════════════════════════════════════════════════════
// INSURANCE (merchant + consumer)
// ═══════════════════════════════════════════════════════════════════════════════
export interface InsuranceProduct { id: string; name: string; type: string; premium: number; currency: string; coverage: number; }
export interface InsurancePolicy { id: string; customerId: string; productId: string; status: string; startDate: string; endDate: string; premium: number; }
export async function getInsuranceProductsViaMiddleware(merchantId: string): Promise<InsuranceProduct[] | null> {
  return safe<InsuranceProduct[]>("GET", `/insurance/products?merchant_id=${merchantId}`);
}
export async function enrollInsuranceCustomerViaMiddleware(customerId: string, productId: string, merchantId: string): Promise<{ policyId: string; status: string } | null> {
  return safe<{ policyId: string; status: string }>("POST", "/insurance/enroll", { customer_id: customerId, product_id: productId, merchant_id: merchantId });
}
export async function collectInsurancePremiumViaMiddleware(policyId: string, amount: number, currency: string): Promise<{ success: boolean; receiptId: string } | null> {
  return safe<{ success: boolean; receiptId: string }>("POST", "/insurance/collect-premium", { policy_id: policyId, amount, currency });
}
export async function getInsurancePoliciesViaMiddleware(merchantId: string): Promise<InsurancePolicy[] | null> {
  return safe<InsurancePolicy[]>("GET", `/insurance/policies?merchant_id=${merchantId}`);
}
export async function fileInsuranceClaimViaMiddleware(policyId: string, claimType: string, amount: number, description: string): Promise<{ claimId: string; status: string } | null> {
  return safe<{ claimId: string; status: string }>("POST", "/insurance/claim", { policy_id: policyId, claim_type: claimType, amount, description });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CARBON CREDITS
// ═══════════════════════════════════════════════════════════════════════════════
export interface CarbonListing { id: string; projectName: string; vintage: number; pricePerTonne: number; availableTonnes: number; standard: string; }
export async function getCarbonListingsViaMiddleware(): Promise<CarbonListing[] | null> {
  return safe<CarbonListing[]>("GET", "/carbon/listings");
}
export async function purchaseCarbonCreditsViaMiddleware(listingId: string, tonnes: number, merchantId: string): Promise<{ certificateId: string; totalCost: number } | null> {
  return safe<{ certificateId: string; totalCost: number }>("POST", "/carbon/purchase", { listing_id: listingId, tonnes, merchant_id: merchantId });
}
export async function getCarbonCertificatesViaMiddleware(merchantId: string): Promise<{ certificates: unknown[] } | null> {
  return safe<{ certificates: unknown[] }>("GET", `/carbon/certificates?merchant_id=${merchantId}`);
}
export async function getCarbonEmissionsReportViaMiddleware(merchantId: string, period: string): Promise<{ totalEmissions: number; offset: number; netEmissions: number } | null> {
  return safe<{ totalEmissions: number; offset: number; netEmissions: number }>("GET", `/carbon/emissions-report?merchant_id=${merchantId}&period=${period}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// NFT BADGES
// ═══════════════════════════════════════════════════════════════════════════════
export async function createNFTCollectionViaMiddleware(merchantId: string, name: string, description: string, imageUrl: string): Promise<{ collectionId: string; contractAddress: string } | null> {
  return safe<{ collectionId: string; contractAddress: string }>("POST", "/nft/create-collection", { merchant_id: merchantId, name, description, image_url: imageUrl });
}
export async function mintNFTBadgeViaMiddleware(collectionId: string, customerId: string, metadata: Record<string, unknown>): Promise<{ tokenId: string; txHash: string } | null> {
  return safe<{ tokenId: string; txHash: string }>("POST", "/nft/mint", { collection_id: collectionId, customer_id: customerId, metadata });
}
export async function getNFTCollectionsViaMiddleware(merchantId: string): Promise<{ collections: unknown[] } | null> {
  return safe<{ collections: unknown[] }>("GET", `/nft/collections?merchant_id=${merchantId}`);
}
export async function getCustomerNFTBadgesViaMiddleware(customerId: string): Promise<{ badges: unknown[] } | null> {
  return safe<{ badges: unknown[] }>("GET", `/nft/customer-badges?customer_id=${customerId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BNPL V2
// ═══════════════════════════════════════════════════════════════════════════════
export async function checkBNPLv2EligibilityViaMiddleware(customerId: string, amount: number): Promise<{ eligible: boolean; maxAmount: number; reason?: string } | null> {
  return safe<{ eligible: boolean; maxAmount: number; reason?: string }>("GET", `/bnpl-v2/eligibility?customer_id=${customerId}&amount=${amount}`);
}
export async function createBNPLv2LoanViaMiddleware(customerId: string, amount: number, tenure: number, merchantId: string): Promise<{ loanId: string; emiAmount: number; schedule: unknown[] } | null> {
  return safe<{ loanId: string; emiAmount: number; schedule: unknown[] }>("POST", "/bnpl-v2/create-loan", { customer_id: customerId, amount, tenure, merchant_id: merchantId });
}
export async function getBNPLv2LoansViaMiddleware(merchantId: string): Promise<{ loans: unknown[] } | null> {
  return safe<{ loans: unknown[] }>("GET", `/bnpl-v2/loans?merchant_id=${merchantId}`);
}
export async function recordBNPLv2RepaymentViaMiddleware(loanId: string, amount: number, paymentMethod: string): Promise<{ success: boolean; remainingBalance: number } | null> {
  return safe<{ success: boolean; remainingBalance: number }>("POST", "/bnpl-v2/repayment", { loan_id: loanId, amount, payment_method: paymentMethod });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CRYPTO RAMP (on/off-ramp)
// ═══════════════════════════════════════════════════════════════════════════════
export async function getCryptoRampQuoteViaMiddleware(fromCurrency: string, toCurrency: string, amount: number): Promise<{ rate: number; fee: number; netAmount: number; expiresAt: string } | null> {
  return safe<{ rate: number; fee: number; netAmount: number; expiresAt: string }>("GET", `/crypto-ramp/quote?from=${fromCurrency}&to=${toCurrency}&amount=${amount}`);
}
export async function executeCryptoRampViaMiddleware(quoteId: string, walletAddress: string, merchantId: string): Promise<{ txId: string; status: string } | null> {
  return safe<{ txId: string; status: string }>("POST", "/crypto-ramp/execute", { quote_id: quoteId, wallet_address: walletAddress, merchant_id: merchantId });
}
export async function getCryptoWalletsViaMiddleware(merchantId: string): Promise<{ wallets: unknown[] } | null> {
  return safe<{ wallets: unknown[] }>("GET", `/crypto-ramp/wallets?merchant_id=${merchantId}`);
}
export async function getCryptoTransactionsViaMiddleware(merchantId: string): Promise<{ transactions: unknown[] } | null> {
  return safe<{ transactions: unknown[] }>("GET", `/crypto-ramp/transactions?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ESCROW CONTRACTS
// ═══════════════════════════════════════════════════════════════════════════════
export interface EscrowCreateRequest { merchantId: string; buyerId: string; sellerId: string; amount: number; currency: string; conditions: string[]; expiresAt: string; }
export async function createEscrowViaMiddleware(req: EscrowCreateRequest): Promise<{ escrowId: string; status: string; escrowAddress: string } | null> {
  return safe<{ escrowId: string; status: string; escrowAddress: string }>("POST", "/escrow/create", req);
}
export async function fundEscrowViaMiddleware(escrowId: string, txHash: string): Promise<{ success: boolean; status: string } | null> {
  return safe<{ success: boolean; status: string }>("POST", "/escrow/fund", { escrow_id: escrowId, tx_hash: txHash });
}
export async function releaseEscrowViaMiddleware(escrowId: string, releasedBy: string): Promise<{ success: boolean; settlementId: string } | null> {
  return safe<{ success: boolean; settlementId: string }>("POST", "/escrow/release", { escrow_id: escrowId, released_by: releasedBy });
}
export async function disputeEscrowViaMiddleware(escrowId: string, disputedBy: string, reason: string): Promise<{ disputeId: string; status: string } | null> {
  return safe<{ disputeId: string; status: string }>("POST", "/escrow/dispute", { escrow_id: escrowId, disputed_by: disputedBy, reason });
}
export async function listEscrowsViaMiddleware(merchantId: string): Promise<{ escrows: unknown[] } | null> {
  return safe<{ escrows: unknown[] }>("GET", `/escrow/list?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK PAYMENT SCHEDULER
// ═══════════════════════════════════════════════════════════════════════════════
export async function createBulkScheduleViaMiddleware(merchantId: string, name: string, scheduledAt: string, payments: unknown[]): Promise<{ scheduleId: string; status: string } | null> {
  return safe<{ scheduleId: string; status: string }>("POST", "/bulk-scheduler/create", { merchant_id: merchantId, name, scheduled_at: scheduledAt, payments });
}
export async function listBulkSchedulesViaMiddleware(merchantId: string): Promise<{ schedules: unknown[] } | null> {
  return safe<{ schedules: unknown[] }>("GET", `/bulk-scheduler/list?merchant_id=${merchantId}`);
}
export async function getBulkScheduleResultsViaMiddleware(scheduleId: string): Promise<{ results: unknown[]; successCount: number; failureCount: number } | null> {
  return safe<{ results: unknown[]; successCount: number; failureCount: number }>("GET", `/bulk-scheduler/results?schedule_id=${scheduleId}`);
}
export async function cancelBulkScheduleViaMiddleware(scheduleId: string, reason: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/bulk-scheduler/cancel", { schedule_id: scheduleId, reason });
}

// ═══════════════════════════════════════════════════════════════════════════════
// TAX ENGINE
// ═══════════════════════════════════════════════════════════════════════════════
export async function calculateTaxViaMiddleware(merchantId: string, amount: number, transactionType: string, jurisdiction: string): Promise<{ taxAmount: number; taxRate: number; breakdown: unknown[] } | null> {
  return safe<{ taxAmount: number; taxRate: number; breakdown: unknown[] }>("GET", `/tax/calculate?merchant_id=${merchantId}&amount=${amount}&type=${transactionType}&jurisdiction=${jurisdiction}`);
}
export async function getTaxSummaryViaMiddleware(merchantId: string, period: string): Promise<{ totalTax: number; collected: number; remitted: number; pending: number } | null> {
  return safe<{ totalTax: number; collected: number; remitted: number; pending: number }>("GET", `/tax/summary?merchant_id=${merchantId}&period=${period}`);
}
export async function remitTaxViaMiddleware(merchantId: string, amount: number, period: string, taxType: string): Promise<{ remittanceId: string; status: string } | null> {
  return safe<{ remittanceId: string; status: string }>("POST", "/tax/remit", { merchant_id: merchantId, amount, period, tax_type: taxType });
}
export async function getTaxCertificateViaMiddleware(merchantId: string, year: number): Promise<{ certificateUrl: string; issuedAt: string } | null> {
  return safe<{ certificateUrl: string; issuedAt: string }>("POST", "/tax/certificate", { merchant_id: merchantId, year });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REGULATORY SANDBOX
// ═══════════════════════════════════════════════════════════════════════════════
export async function getRegulatoryScenarioViaMiddleware(): Promise<{ scenarios: unknown[] } | null> {
  return safe<{ scenarios: unknown[] }>("GET", "/regulatory-sandbox/scenarios");
}
export async function enableRegulatorySandboxViaMiddleware(merchantId: string, scenarioId: string): Promise<{ enabled: boolean; sandboxId: string } | null> {
  return safe<{ enabled: boolean; sandboxId: string }>("POST", "/regulatory-sandbox/enable", { merchant_id: merchantId, scenario_id: scenarioId });
}
export async function runRegulatoryScenarioViaMiddleware(sandboxId: string, scenarioId: string, params: Record<string, unknown>): Promise<{ result: unknown; passed: boolean; violations: unknown[] } | null> {
  return safe<{ result: unknown; passed: boolean; violations: unknown[] }>("POST", "/regulatory-sandbox/run-scenario", { sandbox_id: sandboxId, scenario_id: scenarioId, params });
}
export async function submitRegulatoryReportViaMiddleware(merchantId: string, reportType: string, period: string, data: unknown): Promise<{ submissionId: string; status: string } | null> {
  return safe<{ submissionId: string; status: string }>("POST", "/regulatory-sandbox/submit", { merchant_id: merchantId, report_type: reportType, period, data });
}

// ═══════════════════════════════════════════════════════════════════════════════
// MULTI-CURRENCY WALLET
// ═══════════════════════════════════════════════════════════════════════════════
export async function getMultiWalletBalancesViaMiddleware(merchantId: string): Promise<{ balances: Record<string, number> } | null> {
  return safe<{ balances: Record<string, number> }>("GET", `/multi-wallet/balances?merchant_id=${merchantId}`);
}
export async function createMultiWalletViaMiddleware(merchantId: string, currency: string): Promise<{ walletId: string; currency: string; address: string } | null> {
  return safe<{ walletId: string; currency: string; address: string }>("POST", "/multi-wallet/create", { merchant_id: merchantId, currency });
}
export async function convertMultiWalletViaMiddleware(merchantId: string, fromCurrency: string, toCurrency: string, amount: number): Promise<{ convertedAmount: number; rate: number; txId: string } | null> {
  return safe<{ convertedAmount: number; rate: number; txId: string }>("POST", "/multi-wallet/convert", { merchant_id: merchantId, from_currency: fromCurrency, to_currency: toCurrency, amount });
}
export async function sweepMultiWalletViaMiddleware(merchantId: string, currency: string, destinationAddress: string): Promise<{ success: boolean; amount: number; txHash: string } | null> {
  return safe<{ success: boolean; amount: number; txHash: string }>("POST", "/multi-wallet/sweep", { merchant_id: merchantId, currency, destination_address: destinationAddress });
}

// ═══════════════════════════════════════════════════════════════════════════════
// RTGS (Real-Time Gross Settlement)
// ═══════════════════════════════════════════════════════════════════════════════
export async function initiateRTGSViaMiddleware(merchantId: string, amount: number, currency: string, beneficiaryAccountNo: string, beneficiaryBankCode: string, narration: string): Promise<{ rtgsRef: string; status: string; estimatedSettlement: string } | null> {
  return safe<{ rtgsRef: string; status: string; estimatedSettlement: string }>("POST", "/rtgs/initiate", { merchant_id: merchantId, amount, currency, beneficiary_account_no: beneficiaryAccountNo, beneficiary_bank_code: beneficiaryBankCode, narration });
}
export async function getRTGSStatusViaMiddleware(rtgsRef: string): Promise<{ status: string; settledAt?: string; failureReason?: string } | null> {
  return safe<{ status: string; settledAt?: string; failureReason?: string }>("GET", `/rtgs/status?ref=${rtgsRef}`);
}
export async function getRTGSLimitsViaMiddleware(merchantId: string): Promise<{ dailyLimit: number; perTransactionLimit: number; used: number } | null> {
  return safe<{ dailyLimit: number; perTransactionLimit: number; used: number }>("GET", `/rtgs/limits?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// ISO 20022 MESSAGING
// ═══════════════════════════════════════════════════════════════════════════════
export async function sendISO20022MessageViaMiddleware(merchantId: string, messageType: string, payload: unknown): Promise<{ messageId: string; status: string; ackRequired: boolean } | null> {
  return safe<{ messageId: string; status: string; ackRequired: boolean }>("POST", "/iso20022/send", { merchant_id: merchantId, message_type: messageType, payload });
}
export async function getISO20022MessagesViaMiddleware(merchantId: string): Promise<{ messages: unknown[] } | null> {
  return safe<{ messages: unknown[] }>("GET", `/iso20022/messages?merchant_id=${merchantId}`);
}
export async function acknowledgeISO20022ViaMiddleware(messageId: string, ackCode: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/iso20022/acknowledge", { message_id: messageId, ack_code: ackCode });
}

// ═══════════════════════════════════════════════════════════════════════════════
// OPEN FINANCE / OPEN BANKING
// ═══════════════════════════════════════════════════════════════════════════════
export async function getOpenFinanceProvidersViaMiddleware(): Promise<{ providers: unknown[] } | null> {
  return safe<{ providers: unknown[] }>("GET", "/open-finance/providers");
}
export async function connectOpenFinanceProviderViaMiddleware(merchantId: string, providerId: string, consentToken: string): Promise<{ connectionId: string; status: string } | null> {
  return safe<{ connectionId: string; status: string }>("POST", "/open-finance/connect", { merchant_id: merchantId, provider_id: providerId, consent_token: consentToken });
}
export async function getOpenFinanceDataViaMiddleware(connectionId: string, dataType: string): Promise<{ data: unknown } | null> {
  return safe<{ data: unknown }>("GET", `/open-finance/data?connection_id=${connectionId}&type=${dataType}`);
}
export async function revokeOpenFinanceConnectionViaMiddleware(connectionId: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/open-finance/revoke", { connection_id: connectionId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WHITE LABEL / EMBEDDED FINANCE
// ═══════════════════════════════════════════════════════════════════════════════
export async function getWhiteLabelConfigViaMiddleware(merchantId: string): Promise<{ config: unknown } | null> {
  return safe<{ config: unknown }>("GET", `/white-label/config?merchant_id=${merchantId}`);
}
export async function updateWhiteLabelBrandingViaMiddleware(merchantId: string, branding: Record<string, unknown>): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/white-label/update-branding", { merchant_id: merchantId, ...branding });
}
export async function getWhiteLabelAnalyticsViaMiddleware(merchantId: string): Promise<{ analytics: unknown } | null> {
  return safe<{ analytics: unknown }>("GET", `/white-label/analytics?merchant_id=${merchantId}`);
}
export async function rotateWhiteLabelKeyViaMiddleware(merchantId: string): Promise<{ newKey: string; expiresAt: string } | null> {
  return safe<{ newKey: string; expiresAt: string }>("POST", "/white-label/rotate-key", { merchant_id: merchantId });
}

// ═══════════════════════════════════════════════════════════════════════════════
// DIGITAL GOLD
// ═══════════════════════════════════════════════════════════════════════════════
export async function buyDigitalGoldViaMiddleware(merchantId: string, customerId: string, amountNGN: number): Promise<{ grams: number; rate: number; txId: string } | null> {
  return safe<{ grams: number; rate: number; txId: string }>("POST", "/digital-gold/buy", { merchant_id: merchantId, customer_id: customerId, amount_ngn: amountNGN });
}
export async function sellDigitalGoldViaMiddleware(merchantId: string, customerId: string, grams: number): Promise<{ amountNGN: number; rate: number; txId: string } | null> {
  return safe<{ amountNGN: number; rate: number; txId: string }>("POST", "/digital-gold/sell", { merchant_id: merchantId, customer_id: customerId, grams });
}
export async function getDigitalGoldHoldingsViaMiddleware(customerId: string): Promise<{ grams: number; valueNGN: number; currentRate: number } | null> {
  return safe<{ grams: number; valueNGN: number; currentRate: number }>("GET", `/digital-gold/holdings?customer_id=${customerId}`);
}
export async function createGoldSIPViaMiddleware(customerId: string, monthlyAmountNGN: number, dayOfMonth: number): Promise<{ sipId: string; status: string } | null> {
  return safe<{ sipId: string; status: string }>("POST", "/digital-gold/sip/create", { customer_id: customerId, monthly_amount_ngn: monthlyAmountNGN, day_of_month: dayOfMonth });
}

// ═══════════════════════════════════════════════════════════════════════════════
// CASHBACK REWARDS
// ═══════════════════════════════════════════════════════════════════════════════
export async function getCashbackBalanceViaMiddleware(customerId: string): Promise<{ balance: number; currency: string; pendingBalance: number } | null> {
  return safe<{ balance: number; currency: string; pendingBalance: number }>("GET", `/cashback/balance?customer_id=${customerId}`);
}
export async function redeemCashbackViaMiddleware(customerId: string, amount: number, merchantId: string): Promise<{ success: boolean; newBalance: number; redemptionId: string } | null> {
  return safe<{ success: boolean; newBalance: number; redemptionId: string }>("POST", "/cashback/redeem", { customer_id: customerId, amount, merchant_id: merchantId });
}
export async function getCashbackHistoryViaMiddleware(customerId: string): Promise<{ history: unknown[] } | null> {
  return safe<{ history: unknown[] }>("GET", `/cashback/history?customer_id=${customerId}`);
}
export async function updateCashbackMerchantConfigViaMiddleware(merchantId: string, cashbackRate: number, minTransactionAmount: number): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/cashback/merchant-config/update", { merchant_id: merchantId, cashback_rate: cashbackRate, min_transaction_amount: minTransactionAmount });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SOUNDBOX (IoT payment device)
// ═══════════════════════════════════════════════════════════════════════════════
export async function registerSoundboxViaMiddleware(merchantId: string, deviceId: string, serialNumber: string): Promise<{ registered: boolean; activationCode: string } | null> {
  return safe<{ registered: boolean; activationCode: string }>("POST", "/soundbox/register", { merchant_id: merchantId, device_id: deviceId, serial_number: serialNumber });
}
export async function configureSoundboxViaMiddleware(deviceId: string, volume: number, language: string, currency: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/soundbox/configure", { device_id: deviceId, volume, language, currency });
}
export async function getSoundboxDevicesViaMiddleware(merchantId: string): Promise<{ devices: unknown[] } | null> {
  return safe<{ devices: unknown[] }>("GET", `/soundbox/devices?merchant_id=${merchantId}`);
}
export async function getSoundboxStatsViaMiddleware(merchantId: string): Promise<{ totalDevices: number; activeDevices: number; transactionsToday: number; revenue: number } | null> {
  return safe<{ totalDevices: number; activeDevices: number; transactionsToday: number; revenue: number }>("GET", `/soundbox/stats?merchant_id=${merchantId}`);
}
export async function testSoundboxAudioViaMiddleware(deviceId: string, message: string): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/soundbox/test-audio", { device_id: deviceId, message });
}

// ═══════════════════════════════════════════════════════════════════════════════
// WEALTH MANAGEMENT
// ═══════════════════════════════════════════════════════════════════════════════
export async function getWealthPortfolioViaMiddleware(customerId: string): Promise<{ totalValue: number; assets: unknown[]; returns: number } | null> {
  return safe<{ totalValue: number; assets: unknown[]; returns: number }>("GET", `/wealth/portfolio?customer_id=${customerId}`);
}
export async function getWealthRecommendationsViaMiddleware(customerId: string): Promise<{ recommendations: unknown[] } | null> {
  return safe<{ recommendations: unknown[] }>("GET", `/wealth/recommendations?customer_id=${customerId}`);
}
export async function setWealthRiskProfileViaMiddleware(customerId: string, riskScore: number, riskCategory: string): Promise<{ success: boolean; profileId: string } | null> {
  return safe<{ success: boolean; profileId: string }>("POST", "/wealth/risk-profile/set", { customer_id: customerId, risk_score: riskScore, risk_category: riskCategory });
}
export async function createWealthGoalViaMiddleware(customerId: string, goalName: string, targetAmount: number, targetDate: string): Promise<{ goalId: string; monthlyContribution: number } | null> {
  return safe<{ goalId: string; monthlyContribution: number }>("POST", "/wealth/goals/create", { customer_id: customerId, goal_name: goalName, target_amount: targetAmount, target_date: targetDate });
}
export async function getWealthGoalsViaMiddleware(customerId: string): Promise<{ goals: unknown[] } | null> {
  return safe<{ goals: unknown[] }>("GET", `/wealth/goals?customer_id=${customerId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// EMI (Equated Monthly Instalments)
// ═══════════════════════════════════════════════════════════════════════════════
export async function getEMIPlansViaMiddleware(merchantId: string): Promise<{ plans: unknown[] } | null> {
  return safe<{ plans: unknown[] }>("GET", `/emi/plans?merchant_id=${merchantId}`);
}
export async function createEMIApplicationViaMiddleware(customerId: string, merchantId: string, amount: number, planId: string): Promise<{ applicationId: string; status: string; emiAmount: number; schedule: unknown[] } | null> {
  return safe<{ applicationId: string; status: string; emiAmount: number; schedule: unknown[] }>("POST", "/emi/initiate", { customer_id: customerId, merchant_id: merchantId, amount, plan_id: planId });
}
export async function getEMIScheduleViaMiddleware(applicationId: string): Promise<{ schedule: unknown[]; nextDueDate: string; remainingAmount: number } | null> {
  return safe<{ schedule: unknown[]; nextDueDate: string; remainingAmount: number }>("GET", `/emi/schedule?application_id=${applicationId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// BULK COLLECTIONS
// ═══════════════════════════════════════════════════════════════════════════════
export async function createBulkCollectionViaMiddleware(merchantId: string, name: string, debtors: unknown[], dueDate: string): Promise<{ collectionId: string; totalAmount: number; debtorCount: number } | null> {
  return safe<{ collectionId: string; totalAmount: number; debtorCount: number }>("POST", "/bulk-collections/create", { merchant_id: merchantId, name, debtors, due_date: dueDate });
}
export async function listBulkCollectionsViaMiddleware(merchantId: string): Promise<{ collections: unknown[] } | null> {
  return safe<{ collections: unknown[] }>("GET", `/bulk-collections/list?merchant_id=${merchantId}`);
}
export async function sendCollectionRemindersViaMiddleware(collectionId: string): Promise<{ sent: number; failed: number } | null> {
  return safe<{ sent: number; failed: number }>("POST", "/bulk-collections/remind", { collection_id: collectionId });
}
export async function getCollectionAnalyticsViaMiddleware(merchantId: string): Promise<{ totalCollected: number; successRate: number; pendingAmount: number } | null> {
  return safe<{ totalCollected: number; successRate: number; pendingAmount: number }>("GET", `/bulk-collections/export?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SALARY ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function createSalaryAccountViaMiddleware(merchantId: string, employeeId: string, bankCode: string, accountNumber: string, salary: number): Promise<{ accountId: string; status: string } | null> {
  return safe<{ accountId: string; status: string }>("POST", "/salary-accounts/open", { merchant_id: merchantId, employee_id: employeeId, bank_code: bankCode, account_number: accountNumber, salary });
}
export async function listSalaryAccountsViaMiddleware(merchantId: string): Promise<{ accounts: unknown[] } | null> {
  return safe<{ accounts: unknown[] }>("GET", `/salary-accounts/account?merchant_id=${merchantId}`);
}
export async function requestSalaryAdvanceViaMiddleware(accountId: string, amount: number, reason: string): Promise<{ advanceId: string; status: string; approvedAmount: number } | null> {
  return safe<{ advanceId: string; status: string; approvedAmount: number }>("POST", "/salary-accounts/advance", { account_id: accountId, amount, reason });
}

// ═══════════════════════════════════════════════════════════════════════════════
// REPORTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function generateReportViaMiddleware(merchantId: string, reportType: string, startDate: string, endDate: string, format: string): Promise<{ reportId: string; downloadUrl: string; status: string } | null> {
  return safe<{ reportId: string; downloadUrl: string; status: string }>("POST", `/reports/${reportType}`, { merchant_id: merchantId, start_date: startDate, end_date: endDate, format });
}
export async function listReportsViaMiddleware(merchantId: string): Promise<{ reports: unknown[] } | null> {
  return safe<{ reports: unknown[] }>("GET", `/reports/list?merchant_id=${merchantId}`);
}
export async function createScheduledReportViaMiddleware(merchantId: string, reportType: string, frequency: string, recipients: string[]): Promise<{ scheduleId: string; nextRunAt: string } | null> {
  return safe<{ scheduleId: string; nextRunAt: string }>("POST", "/reports/schedule", { merchant_id: merchantId, report_type: reportType, frequency, recipients });
}

// ═══════════════════════════════════════════════════════════════════════════════
// NODAL ACCOUNTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function createNodalAccountViaMiddleware(merchantId: string, purpose: string, currency: string): Promise<{ accountId: string; accountNumber: string; bankCode: string } | null> {
  return safe<{ accountId: string; accountNumber: string; bankCode: string }>("POST", "/nodal-accounts/create", { merchant_id: merchantId, purpose, currency });
}
export async function listNodalAccountsViaMiddleware(merchantId: string): Promise<{ accounts: unknown[] } | null> {
  return safe<{ accounts: unknown[] }>("GET", `/nodal-accounts/list?merchant_id=${merchantId}`);
}
export async function getNodalTransactionsViaMiddleware(accountId: string): Promise<{ transactions: unknown[] } | null> {
  return safe<{ transactions: unknown[] }>("GET", `/nodal-accounts/transactions?account_id=${accountId}`);
}
export async function transferFromNodalViaMiddleware(accountId: string, amount: number, destinationAccountId: string, narration: string): Promise<{ transferId: string; status: string } | null> {
  return safe<{ transferId: string; status: string }>("POST", "/nodal-accounts/transfer", { account_id: accountId, amount, destination_account_id: destinationAccountId, narration });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SMART RETAIL / POS
// ═══════════════════════════════════════════════════════════════════════════════
export async function getSmartRetailConfigViaMiddleware(merchantId: string): Promise<{ config: unknown } | null> {
  return safe<{ config: unknown }>("GET", `/smart-retail/config?merchant_id=${merchantId}`);
}
export async function processRetailSaleViaMiddleware(merchantId: string, items: unknown[], paymentMethod: string, customerId?: string): Promise<{ saleId: string; total: number; receiptUrl: string } | null> {
  return safe<{ saleId: string; total: number; receiptUrl: string }>("POST", "/smart-retail/sale", { merchant_id: merchantId, items, payment_method: paymentMethod, customer_id: customerId });
}
export async function getRetailDailySummaryViaMiddleware(merchantId: string, date: string): Promise<{ totalSales: number; transactionCount: number; topProducts: unknown[] } | null> {
  return safe<{ totalSales: number; transactionCount: number; topProducts: unknown[] }>("GET", `/smart-retail/daily-summary?merchant_id=${merchantId}&date=${date}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// INTERNATIONAL REMITTANCE
// ═══════════════════════════════════════════════════════════════════════════════
export async function getRemittanceCorridorsViaMiddleware(): Promise<{ corridors: unknown[] } | null> {
  return safe<{ corridors: unknown[] }>("GET", "/intl-remittance/corridors");
}
export async function getRemittanceQuoteViaMiddleware(fromCurrency: string, toCurrency: string, amount: number, corridor: string): Promise<{ rate: number; fee: number; deliveryTime: string; netAmount: number } | null> {
  return safe<{ rate: number; fee: number; deliveryTime: string; netAmount: number }>("GET", `/intl-remittance/quote?from=${fromCurrency}&to=${toCurrency}&amount=${amount}&corridor=${corridor}`);
}
export async function createRemittanceViaMiddleware(merchantId: string, senderId: string, recipientId: string, amount: number, currency: string, corridor: string): Promise<{ remittanceId: string; status: string; trackingCode: string } | null> {
  return safe<{ remittanceId: string; status: string; trackingCode: string }>("POST", "/intl-remittance/transfer", { merchant_id: merchantId, sender_id: senderId, recipient_id: recipientId, amount, currency, corridor });
}
export async function getRemittanceHistoryViaMiddleware(merchantId: string): Promise<{ transfers: unknown[] } | null> {
  return safe<{ transfers: unknown[] }>("GET", `/intl-remittance/history?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUBSCRIPTIONS V2
// ═══════════════════════════════════════════════════════════════════════════════
export async function listSubscriptionPlansViaMiddleware(merchantId: string): Promise<{ plans: unknown[] } | null> {
  return safe<{ plans: unknown[] }>("GET", `/subscriptions-v2/plans?merchant_id=${merchantId}`);
}
export async function createSubscriptionPlanViaMiddleware(merchantId: string, name: string, amount: number, currency: string, interval: string, features: string[]): Promise<{ planId: string; status: string } | null> {
  return safe<{ planId: string; status: string }>("POST", "/subscriptions-v2/plans/create", { merchant_id: merchantId, name, amount, currency, interval, features });
}
export async function listSubscribersViaMiddleware(merchantId: string): Promise<{ subscribers: unknown[]; total: number } | null> {
  return safe<{ subscribers: unknown[]; total: number }>("GET", `/subscriptions-v2/subscribers?merchant_id=${merchantId}`);
}
export async function cancelSubscriptionViaMiddleware(subscriptionId: string, reason: string): Promise<{ success: boolean; cancelledAt: string } | null> {
  return safe<{ success: boolean; cancelledAt: string }>("POST", "/subscriptions-v2/cancel", { subscription_id: subscriptionId, reason });
}
export async function getChurnAnalyticsViaMiddleware(merchantId: string): Promise<{ churnRate: number; mrr: number; arr: number; atRiskCount: number } | null> {
  return safe<{ churnRate: number; mrr: number; arr: number; atRiskCount: number }>("GET", `/subscriptions-v2/churn?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// AGENT BANKING V2
// ═══════════════════════════════════════════════════════════════════════════════
export async function onboardAgentV2ViaMiddleware(merchantId: string, agentName: string, agentPhone: string, location: string, tier: string): Promise<{ agentId: string; status: string; floatAccountId: string } | null> {
  return safe<{ agentId: string; status: string; floatAccountId: string }>("POST", "/agent-banking-v2/onboard", { merchant_id: merchantId, agent_name: agentName, agent_phone: agentPhone, location, tier });
}
export async function getAgentNetworkV2ViaMiddleware(merchantId: string): Promise<{ agents: unknown[]; totalFloat: number; totalTransactions: number } | null> {
  return safe<{ agents: unknown[]; totalFloat: number; totalTransactions: number }>("GET", `/agent-banking-v2/network?merchant_id=${merchantId}`);
}
export async function fundAgentFloatV2ViaMiddleware(agentId: string, amount: number, currency: string): Promise<{ success: boolean; newBalance: number; txId: string } | null> {
  return safe<{ success: boolean; newBalance: number; txId: string }>("POST", "/agent-banking-v2/fund-float", { agent_id: agentId, amount, currency });
}
export async function getAgentPerformanceV2ViaMiddleware(agentId: string, period: string): Promise<{ transactions: number; volume: number; commission: number; rating: number } | null> {
  return safe<{ transactions: number; volume: number; commission: number; rating: number }>("GET", `/agent-banking-v2/performance?agent_id=${agentId}&period=${period}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// CONSUMER INSURANCE
// ═══════════════════════════════════════════════════════════════════════════════
export async function getConsumerInsuranceProductsViaMiddleware(): Promise<{ products: unknown[] } | null> {
  return safe<{ products: unknown[] }>("GET", "/consumer-insurance/products");
}
export async function purchaseConsumerInsuranceViaMiddleware(customerId: string, productId: string, coverageAmount: number): Promise<{ policyId: string; premium: number; startDate: string; endDate: string } | null> {
  return safe<{ policyId: string; premium: number; startDate: string; endDate: string }>("POST", "/consumer-insurance/purchase", { customer_id: customerId, product_id: productId, coverage_amount: coverageAmount });
}
export async function getConsumerInsurancePoliciesViaMiddleware(customerId: string): Promise<{ policies: unknown[] } | null> {
  return safe<{ policies: unknown[] }>("GET", `/consumer-insurance/policies?customer_id=${customerId}`);
}
export async function fileConsumerInsuranceClaimViaMiddleware(policyId: string, claimType: string, amount: number, description: string, documents: string[]): Promise<{ claimId: string; status: string; estimatedPayout: number } | null> {
  return safe<{ claimId: string; status: string; estimatedPayout: number }>("POST", "/consumer-insurance/claim", { policy_id: policyId, claim_type: claimType, amount, description, documents });
}

// ═══════════════════════════════════════════════════════════════════════════════
// PRIVACY / ANONYMOUS PAYMENTS
// ═══════════════════════════════════════════════════════════════════════════════
export async function createPrivatePaymentViaMiddleware(merchantId: string, amount: number, currency: string): Promise<{ aliasId: string; paymentAddress: string; expiresAt: string } | null> {
  return safe<{ aliasId: string; paymentAddress: string; expiresAt: string }>("POST", "/privacy/generate-id", { merchant_id: merchantId, amount, currency });
}
export async function getPrivacySettingsViaMiddleware(merchantId: string): Promise<{ settings: unknown } | null> {
  return safe<{ settings: unknown }>("GET", `/privacy/settings?merchant_id=${merchantId}`);
}
export async function updatePrivacySettingsViaMiddleware(merchantId: string, settings: Record<string, unknown>): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>("POST", "/privacy/settings/update", { merchant_id: merchantId, ...settings });
}
export async function getPrivateTransactionsViaMiddleware(merchantId: string): Promise<{ transactions: unknown[] } | null> {
  return safe<{ transactions: unknown[] }>("GET", `/privacy/history?merchant_id=${merchantId}`);
}

// ═══════════════════════════════════════════════════════════════════════════════
// SDK RELAY
// ═══════════════════════════════════════════════════════════════════════════════
export async function createSDKTokenViaMiddleware(merchantId: string, scope: string[], expiresIn: number): Promise<{ token: string; tokenId: string; expiresAt: string } | null> {
  return safe<{ token: string; tokenId: string; expiresAt: string }>("POST", "/v1/embedded/sdk-token", { merchant_id: merchantId, scope, expires_in: expiresIn });
}
export async function registerWebhookEndpointViaMiddleware(merchantId: string, url: string, events: string[], secret: string): Promise<{ endpointId: string; status: string } | null> {
  return safe<{ endpointId: string; status: string }>("POST", "/v1/embedded/webhooks/register", { merchant_id: merchantId, url, events, secret });
}
export async function getSDKKeyAnalyticsViaMiddleware(keyId: string): Promise<{ calls: number; errors: number; latencyP99: number } | null> {
  return safe<{ calls: number; errors: number; latencyP99: number }>("GET", `/sdk/keys/${keyId}/analytics`);
}
export async function rotateSDKKeyViaMiddleware(keyId: string): Promise<{ newKey: string; expiresAt: string } | null> {
  return safe<{ newKey: string; expiresAt: string }>("POST", `/sdk/keys/${keyId}/rotate`, {});
}

// ═══════════════════════════════════════════════════════════════════════════════
// FRAUD RING ESCALATION
// ═══════════════════════════════════════════════════════════════════════════════

export interface FraudRingEscalationRequest {
  workflowId?: string;
  ringId: string;
  reason: string;
  linkedAccountCount: number;
  escalatedBy: string;
  autoFreezeAfterHours?: number;
}

export interface FraudRingEscalationResponse {
  workflowId: string;
  runId: string;
  status: string;
  ringId: string;
  autoFreezeAfterHours: number;
}

/** Start FraudRingEscalationWorkflow via Temporal → Go bridge */
export async function escalateFraudRingViaMiddleware(
  req: FraudRingEscalationRequest
): Promise<FraudRingEscalationResponse | null> {
  return safe<FraudRingEscalationResponse>('POST', '/v1/workflows/fraud-ring-escalation', {
    workflow_id: req.workflowId,
    ring_id: req.ringId,
    reason: req.reason,
    linked_account_count: req.linkedAccountCount,
    escalated_by: req.escalatedBy,
    auto_freeze_after_hours: req.autoFreezeAfterHours ?? 48,
  });
}

/** Mark a fraud ring as resolved in Redis so the auto-freeze timer is cancelled */
export async function resolveFraudRingViaMiddleware(
  ringId: string,
  resolution: 'cleared' | 'frozen'
): Promise<{ success: boolean } | null> {
  return safe<{ success: boolean }>('POST', `/v1/fraud/rings/${ringId}/resolve`, {
    resolution,
  });
}

// ═══════════════════════════════════════════════════════════════════════════════
// SUPER APP
// ═══════════════════════════════════════════════════════════════════════════════
export async function getSuperAppConfigViaMiddleware(merchantId: string): Promise<{ modules: unknown[]; version: string } | null> {
  return safe<{ modules: unknown[]; version: string }>("GET", `/super-app/config?merchant_id=${merchantId}`);
}
export async function getSuperAppStatsViaMiddleware(merchantId: string): Promise<{ dau: number; mau: number; sessions: number; avgSessionDuration: number } | null> {
  return safe<{ dau: number; mau: number; sessions: number; avgSessionDuration: number }>("GET", `/super-app/stats?merchant_id=${merchantId}`);
}
export async function pushSuperAppUpdateViaMiddleware(merchantId: string, version: string, releaseNotes: string): Promise<{ success: boolean; deployedAt: string } | null> {
  return safe<{ success: boolean; deployedAt: string }>("POST", "/super-app/push-update", { merchant_id: merchantId, version, release_notes: releaseNotes });
}

// ─── Legacy alias ─────────────────────────────────────────────────────────────
// wave104Router.ts imports bridgeFetch; keep this alias for backward compat.
export async function bridgeFetch(path: string, method: "GET" | "POST" | "PUT" | "DELETE", body?: unknown): Promise<unknown> {
  return safe<unknown>(method, path, body);
}

// ─── Wave 120 — Staff Management middleware ───────────────────────────────────
export async function createStaffMemberViaMiddleware(merchantId: string, name: string, role: string, department: string, phone: string): Promise<{ memberId: string; status: string; employeeId: string } | null> {
  return safe("POST", "/staff/members", { merchantId, name, role, department, phone });
}
export async function clockInStaffViaMiddleware(memberId: string, location: string): Promise<{ shiftId: string; clockIn: string } | null> {
  return safe("POST", "/staff/clock-in", { memberId, location });
}
export async function clockOutStaffViaMiddleware(shiftId: string, location: string): Promise<{ clockOut: string; durationMinutes: number } | null> {
  return safe("POST", "/staff/clock-out", { shiftId, location });
}
export async function getStaffPayrollSummaryViaMiddleware(merchantId: string, period: string): Promise<{ totalPayroll: number; headcount: number; avgHours: number } | null> {
  return safe("GET", `/staff/payroll-summary?merchantId=${merchantId}&period=${period}`);
}

// ─── Wave 120 — Insurance Claims middleware ───────────────────────────────────
export async function submitInsuranceClaimViaMiddleware(policyId: string, claimType: string, amount: number, description: string, documents: string[]): Promise<{ claimId: string; status: string; caseNumber: string } | null> {
  return safe("POST", "/insurance/claims/submit", { policyId, claimType, amount, description, documents });
}
export async function getInsuranceClaimStatusViaMiddleware(claimId: string): Promise<{ status: string; assessedAmount: number; payoutDate: string | null } | null> {
  return safe("GET", `/insurance/claims/${claimId}/status`);
}
export async function approveInsuranceClaimViaMiddleware(claimId: string, approvedAmount: number, notes: string): Promise<{ success: boolean; payoutScheduled: string } | null> {
  return safe("POST", `/insurance/claims/${claimId}/approve`, { approvedAmount, notes });
}

// ─── Wave 120 — Support Chat middleware ──────────────────────────────────────
export async function createSupportSessionViaMiddleware(merchantId: string, subject: string, priority: string): Promise<{ sessionId: string; agentId: string; estimatedWait: number } | null> {
  return safe("POST", "/support/sessions", { merchantId, subject, priority });
}
export async function sendSupportMessageViaMiddleware(sessionId: string, senderId: string, message: string, attachments: string[]): Promise<{ messageId: string; deliveredAt: string } | null> {
  return safe("POST", `/support/sessions/${sessionId}/messages`, { senderId, message, attachments });
}
export async function escalateSupportSessionViaMiddleware(sessionId: string, reason: string, targetTeam: string): Promise<{ success: boolean; newAgentId: string } | null> {
  return safe("POST", `/support/sessions/${sessionId}/escalate`, { reason, targetTeam });
}
export async function closeSupportSessionViaMiddleware(sessionId: string, resolution: string, rating: number): Promise<{ success: boolean; closedAt: string } | null> {
  return safe("POST", `/support/sessions/${sessionId}/close`, { resolution, rating });
}

// ─── Wave 120 — USDC V3 middleware ────────────────────────────────────────────
export async function initiateUSDCTransferViaMiddleware(merchantId: string, amount: number, recipientAddress: string, network: string, memo: string): Promise<{ txHash: string; status: string; estimatedConfirmation: string } | null> {
  return safe("POST", "/usdc/v3/transfer", { merchantId, amount, recipientAddress, network, memo });
}
export async function getUSDCWalletBalanceViaMiddleware(merchantId: string, network: string): Promise<{ balance: number; pendingInbound: number; pendingOutbound: number } | null> {
  return safe("GET", `/usdc/v3/balance?merchantId=${merchantId}&network=${network}`);
}
export async function getUSDCTransactionStatusViaMiddleware(txHash: string): Promise<{ status: string; confirmations: number; blockNumber: number } | null> {
  return safe("GET", `/usdc/v3/tx/${txHash}`);
}
export async function convertUSDCToFiatViaMiddleware(merchantId: string, amount: number, targetCurrency: string): Promise<{ convertedAmount: number; rate: number; fee: number; settlementTime: string } | null> {
  return safe("POST", "/usdc/v3/convert", { merchantId, amount, targetCurrency });
}

// ─── Wave 120 — Tax Filing V2 middleware ─────────────────────────────────────
export async function submitTaxFilingViaMiddleware(merchantId: string, taxType: string, period: string, taxableAmount: number, taxAmount: number, documents: string[]): Promise<{ filingId: string; referenceNumber: string; submittedAt: string } | null> {
  return safe("POST", "/tax/v2/file", { merchantId, taxType, period, taxableAmount, taxAmount, documents });
}
export async function getTaxFilingStatusViaMiddleware(filingId: string): Promise<{ status: string; assessedAmount: number | null; penaltyAmount: number | null } | null> {
  return safe("GET", `/tax/v2/filings/${filingId}/status`);
}
// Note: getTaxSummaryViaMiddleware already exported above (original signature at line 777)

// ─── Wave 120 — Split Bill V2 middleware ─────────────────────────────────────
export async function createSplitBillSessionViaMiddleware(merchantId: string, title: string, totalAmount: number, participants: { userId: string; share: number }[]): Promise<{ sessionId: string; paymentLinks: Record<string, string> } | null> {
  return safe("POST", "/split-bill/v2/sessions", { merchantId, title, totalAmount, participants });
}
export async function recordSplitBillPaymentViaMiddleware(sessionId: string, participantId: string, amount: number, paymentMethod: string): Promise<{ success: boolean; remainingBalance: number; allPaid: boolean } | null> {
  return safe("POST", `/split-bill/v2/sessions/${sessionId}/pay`, { participantId, amount, paymentMethod });
}
export async function settleSplitBillSessionViaMiddleware(sessionId: string): Promise<{ success: boolean; settledAt: string; totalCollected: number } | null> {
  return safe("POST", `/split-bill/v2/sessions/${sessionId}/settle`, {});
}

// ─── Wave 120 — Webhook Simulator V2 middleware ───────────────────────────────
export async function simulateWebhookEventViaMiddleware(merchantId: string, eventType: string, payload: Record<string, unknown>, targetUrl: string): Promise<{ simulationId: string; status: string; responseCode: number; latencyMs: number } | null> {
  return safe("POST", "/webhook-sim/v2/simulate", { merchantId, eventType, payload, targetUrl });
}
export async function getWebhookSimulationLogsViaMiddleware(merchantId: string, limit: number): Promise<{ logs: unknown[]; total: number } | null> {
  return safe("GET", `/webhook-sim/v2/logs?merchantId=${merchantId}&limit=${limit}`);
}
export async function replayWebhookEventViaMiddleware(simulationId: string): Promise<{ success: boolean; newSimulationId: string } | null> {
  return safe("POST", `/webhook-sim/v2/replay/${simulationId}`, {});
}

// ─── Wave 120 — Tenant Management middleware ─────────────────────────────────
export async function provisionTenantViaMiddleware(tenantName: string, plan: string, adminEmail: string, region: string): Promise<{ tenantId: string; status: string; adminPortalUrl: string } | null> {
  return safe("POST", "/tenants/provision", { tenantName, plan, adminEmail, region });
}
export async function suspendTenantViaMiddleware(tenantId: string, reason: string): Promise<{ success: boolean; suspendedAt: string } | null> {
  return safe("POST", `/tenants/${tenantId}/suspend`, { reason });
}
export async function getTenantUsageViaMiddleware(tenantId: string): Promise<{ apiCalls: number; storage: number; activeUsers: number; monthlySpend: number } | null> {
  return safe("GET", `/tenants/${tenantId}/usage`);
}

// ─── Wave 120 — OpenSearch integration ───────────────────────────────────────
export async function searchTransactionsViaOpenSearch(merchantId: string, query: string, filters: Record<string, unknown>): Promise<{ hits: unknown[]; total: number; took: number } | null> {
  return safe("POST", "/opensearch/transactions/search", { merchantId, query, filters });
}
export async function indexAuditEventViaOpenSearch(event: Record<string, unknown>): Promise<{ indexed: boolean; id: string } | null> {
  return safe("POST", "/opensearch/audit/index", event);
}
export async function searchAuditTrailViaOpenSearch(merchantId: string, query: string, dateRange: { from: string; to: string }): Promise<{ events: unknown[]; total: number } | null> {
  return safe("POST", "/opensearch/audit/search", { merchantId, query, dateRange });
}

// ─── Wave 120 — TigerBeetle ledger for new accounts ─────────────────────────
export async function createStaffFloatAccountViaMiddleware(merchantId: string, staffMemberId: string, currency: string): Promise<{ accountId: string; ledgerId: string } | null> {
  return safe("POST", "/tigerbeetle/staff-accounts", { merchantId, staffMemberId, currency });
}
export async function createInsurancePremiumAccountViaMiddleware(merchantId: string, policyId: string, currency: string): Promise<{ accountId: string; ledgerId: string } | null> {
  return safe("POST", "/tigerbeetle/insurance-accounts", { merchantId, policyId, currency });
}
export async function createUSDCCustodyAccountViaMiddleware(merchantId: string, network: string): Promise<{ accountId: string; walletAddress: string } | null> {
  return safe("POST", "/tigerbeetle/usdc-accounts", { merchantId, network });
}

// ─── Wave 120 — Lakehouse compliance events ───────────────────────────────────
export async function writeLakehouseComplianceEventViaMiddleware(event: {
  eventType: string; merchantId: string; userId?: string;
  resource: string; action: string; outcome: string;
  metadata: Record<string, unknown>;
}): Promise<{ written: boolean; eventId: string } | null> {
  return safe("POST", "/lakehouse/compliance/events", event);
}
export async function queryLakehouseComplianceViaMiddleware(merchantId: string, filters: Record<string, unknown>): Promise<{ events: unknown[]; total: number } | null> {
  return safe("POST", "/lakehouse/compliance/query", { merchantId, filters });
}

// ─── Kafka Direct Event Publishing (Wave 122) ─────────────────────────────────

export async function publishKafkaEventViaMiddleware(event: {
  topic: string;
  key: string;
  value: string;
  headers?: Record<string, string>;
}): Promise<{ eventId: string; status: string; partition: number; offset: number } | null> {
  return safe<{ eventId: string; status: string; partition: number; offset: number }>(
    "POST",
    "/v1/kafka/publish",
    {
      topic: event.topic,
      key: event.key,
      value: event.value,
      headers: event.headers ?? {},
    }
  );
}


// ─── Kafka Direct Event Publishing (Wave 122) ─────────────────────────────────


// ─── Wave 123 — AI Model Registry sync ───────────────────────────────────────
export async function syncAiModelToRegistryViaMiddleware(model: {
  modelId: string;
  name: string;
  version: string;
  framework: string;
  merchantId: string;
  status: string;
  accuracyScore?: number;
}): Promise<{ synced: boolean; registryId: string; endpoint?: string } | null> {
  return safe("POST", "/v1/ai/models/register", model);
}

export async function triggerGnnTrainingJobViaMiddleware(job: {
  jobId: string;
  merchantId: string;
  modelId: string;
  datasetPath: string;
  hyperparams?: Record<string, unknown>;
}): Promise<{ jobId: string; status: string; estimatedDurationMs: number } | null> {
  return safe("POST", "/v1/ai/gnn/train", job);
}

export async function getAiModelInferenceMetricsViaMiddleware(
  modelId: string,
  merchantId: string,
  windowHours: number
): Promise<{ p50Ms: number; p99Ms: number; errorRate: number; requestCount: number } | null> {
  return safe("GET", `/v1/ai/models/${modelId}/metrics?merchantId=${merchantId}&windowHours=${windowHours}`);
}

// ─── Wave 123 — Menu Management CDN invalidation ─────────────────────────────
export async function invalidateMenuCacheViaMiddleware(
  merchantId: string,
  categoryId?: string
): Promise<{ invalidated: boolean; paths: string[] } | null> {
  return safe("POST", "/v1/menu/cache/invalidate", { merchantId, categoryId });
}

export async function publishMenuUpdateEventViaMiddleware(event: {
  merchantId: string;
  action: "category.created" | "category.updated" | "category.deleted" | "item.created" | "item.updated" | "item.deleted";
  resourceId: string;
  payload: Record<string, unknown>;
}): Promise<{ published: boolean; eventId: string } | null> {
  return safe("POST", "/v1/menu/events/publish", event);
}

// ─── Wave 123 — Portal Health external checks ────────────────────────────────
export async function runExternalHealthCheckViaMiddleware(
  service: string,
  endpoint: string
): Promise<{ healthy: boolean; latencyMs: number; statusCode: number; message?: string } | null> {
  return safe("POST", "/v1/health/external-check", { service, endpoint });
}

export async function getPortalUptimeStatsViaMiddleware(
  merchantId: string,
  days: number
): Promise<{ uptimePercent: number; incidentCount: number; avgResponseMs: number } | null> {
  return safe("GET", `/v1/health/uptime?merchantId=${merchantId}&days=${days}`);
}

// ─── Wave 124 — Bill Payments bridge ─────────────────────────────────────────
export async function processBillPaymentViaMiddleware(payment: {
  billerCode: string; billerName: string; customerReference: string;
  amountKobo: number; currency: string; category: string; merchantId: string;
}): Promise<{ transactionRef: string; status: string; message?: string } | null> {
  return safe("POST", "/v1/bill-payments/process", payment);
}

export async function getBillerListViaMiddleware(
  category?: string
): Promise<{ billers: Array<{ code: string; name: string; category: string }> } | null> {
  const path = category ? `/v1/bill-payments/billers?category=${category}` : "/v1/bill-payments/billers";
  return safe("GET", path);
}

// ─── Wave 124 — Carbon Credits bridge ────────────────────────────────────────
export async function retireCarbonCreditsViaMiddleware(retirement: {
  creditId: string; quantityTonnes: number; retirementReason: string; merchantId: string;
}): Promise<{ retirementCertificateUrl: string; serialNumber: string } | null> {
  return safe("POST", "/v1/carbon/retire", retirement);
}

export async function getCarbonMarketPriceViaMiddleware(
  creditType: string
): Promise<{ pricePerTonne: number; currency: string; updatedAt: string } | null> {
  return safe("GET", `/v1/carbon/market-price?type=${creditType}`);
}

// ─── Wave 124 — Subscriptions bridge ─────────────────────────────────────────
export async function syncSubscriptionWithStripeViaMiddleware(
  subscriptionId: string, stripeSubscriptionId: string
): Promise<{ synced: boolean; status: string } | null> {
  return safe("POST", "/v1/subscriptions/stripe-sync", { subscriptionId, stripeSubscriptionId });
}

export async function sendSubscriptionRenewalReminderViaMiddleware(
  subscriptionId: string, merchantId: string, daysUntilRenewal: number
): Promise<{ sent: boolean; channel: string } | null> {
  return safe("POST", "/v1/subscriptions/renewal-reminder", { subscriptionId, merchantId, daysUntilRenewal });
}

// ─── Wave 124 — QR Payments bridge ───────────────────────────────────────────
export async function generateQrCodeViaMiddleware(payment: {
  merchantId: string; amountKobo: number; currency: string;
  reference: string; expiresInSeconds?: number;
}): Promise<{ qrCodeUrl: string; qrCodeData: string; expiresAt: string } | null> {
  return safe("POST", "/v1/qr-payments/generate", payment);
}

export async function validateQrPaymentViaMiddleware(
  qrReference: string, merchantId: string
): Promise<{ valid: boolean; status: string; amountKobo: number } | null> {
  return safe("GET", `/v1/qr-payments/validate?ref=${qrReference}&merchantId=${merchantId}`);
}

// ─── Wave 124 — POS Terminals bridge ─────────────────────────────────────────
export async function registerPosTerminalViaMiddleware(terminal: {
  serialNumber: string; model: string; merchantId: string; locationId?: string;
}): Promise<{ terminalId: string; activationCode: string; status: string } | null> {
  return safe("POST", "/v1/pos/register", terminal);
}

export async function sendPosTerminalCommandViaMiddleware(
  terminalId: string,
  command: "reboot" | "update_firmware" | "print_test" | "lock" | "unlock"
): Promise<{ acknowledged: boolean; commandId: string } | null> {
  return safe("POST", `/v1/pos/${terminalId}/command`, { command });
}

// ─── Wave 124 — Referrals bridge ─────────────────────────────────────────────
export async function processReferralRewardViaMiddleware(referral: {
  referrerId: string; referredId: string; rewardType: string; rewardAmountKobo: number;
}): Promise<{ processed: boolean; rewardId: string } | null> {
  return safe("POST", "/v1/referrals/process-reward", referral);
}

// ─── Wave 124 — USSD Sessions bridge ─────────────────────────────────────────
export async function terminateUssdSessionViaMiddleware(
  sessionId: string, reason: string
): Promise<{ terminated: boolean } | null> {
  return safe("POST", `/v1/ussd/sessions/${sessionId}/terminate`, { reason });
}

export async function getUssdSessionMetricsViaMiddleware(
  merchantId: string, dateRange: { from: string; to: string }
): Promise<{ totalSessions: number; completedSessions: number; avgDurationSecs: number } | null> {
  return safe("GET", `/v1/ussd/metrics?merchantId=${merchantId}&from=${dateRange.from}&to=${dateRange.to}`);
}

// ─── Wave 124 — Purchase Orders bridge ───────────────────────────────────────
export async function approvePurchaseOrderViaMiddleware(
  orderId: string, approverId: string, notes?: string
): Promise<{ approved: boolean; workflowId: string } | null> {
  return safe("POST", `/v1/purchase-orders/${orderId}/approve`, { approverId, notes });
}

export async function rejectPurchaseOrderViaMiddleware(
  orderId: string, approverId: string, reason: string
): Promise<{ rejected: boolean } | null> {
  return safe("POST", `/v1/purchase-orders/${orderId}/reject`, { approverId, reason });
}

// ─── Wave 124 — Insurance Policies bridge ────────────────────────────────────
export async function submitInsurancePolicyClaimViaMiddleware(claim: {
  policyId: string; claimType: string; claimAmountKobo: number;
  description: string; merchantId: string;
}): Promise<{ claimId: string; status: string; estimatedResolutionDate: string } | null> {
  return safe("POST", "/v1/insurance/claims/submit", claim);
}

// ─── Wave 124 — Loan Repayments bridge ───────────────────────────────────────
export async function processLoanRepaymentViaMiddleware(repayment: {
  loanId: string; amountKobo: number; currency: string;
  paymentMethod: string; merchantId: string;
}): Promise<{ repaymentId: string; remainingBalance: number; status: string } | null> {
  return safe("POST", "/v1/loans/repayments/process", repayment);
}

// ─── Fluvio Streaming ─────────────────────────────────────────────────────────
export async function publishFluvioEventViaMiddleware(event: {
  topic: string; key: string; value: string; partition?: number;
}): Promise<{ offset: number; partition: number; timestamp: string } | null> {
  return safe("POST", "/v1/fluvio/produce", event);
}
export async function createFluvioTopicViaMiddleware(
  topic: string, partitions = 1, retentionHours = 24
): Promise<{ created: boolean; topic: string } | null> {
  return safe("POST", "/v1/fluvio/topics", { topic, partitions, retentionHours });
}
export async function getFluvioTopicStatsViaMiddleware(
  topic: string
): Promise<{ messageCount: number; bytesIn: number; bytesOut: number; partitions: number } | null> {
  return safe("GET", `/v1/fluvio/topics/${topic}/stats`);
}

// ─── Temporal Workflow Engine ─────────────────────────────────────────────────
export async function startTemporalWorkflowViaMiddleware(workflow: {
  workflowType: string; workflowId: string; taskQueue: string;
  input?: unknown; executionTimeout?: number;
}): Promise<{ runId: string; workflowId: string; status: string } | null> {
  return safe("POST", "/v1/temporal/workflows/start", workflow);
}
export async function getTemporalWorkflowStatusViaMiddleware(
  workflowId: string, runId?: string
): Promise<{ status: string; startTime: string; closeTime?: string; result?: unknown } | null> {
  const qs = runId ? `?runId=${runId}` : "";
  return safe("GET", `/v1/temporal/workflows/${workflowId}/status${qs}`);
}
export async function signalTemporalWorkflowViaMiddleware(
  workflowId: string, signalName: string, input?: unknown
): Promise<{ signaled: boolean } | null> {
  return safe("POST", `/v1/temporal/workflows/${workflowId}/signal`, { signalName, input });
}
export async function cancelTemporalWorkflowViaMiddleware(
  workflowId: string
): Promise<{ cancelled: boolean } | null> {
  return safe("POST", `/v1/temporal/workflows/${workflowId}/cancel`, {});
}

// ─── Permify PBAC ─────────────────────────────────────────────────────────────
export async function checkPermifyPermissionViaMiddleware(check: {
  tenantId: string; subject: { type: string; id: string };
  permission: string; resource: { type: string; id: string };
}): Promise<{ allowed: boolean; reason?: string } | null> {
  return safe("POST", "/v1/permify/check", check);
}
export async function writePermifyRelationshipViaMiddleware(rel: {
  tenantId: string; entity: { type: string; id: string };
  relation: string; subject: { type: string; id: string };
}): Promise<{ written: boolean; snapToken: string } | null> {
  return safe("POST", "/v1/permify/relationships/write", rel);
}
export async function deletePermifyRelationshipViaMiddleware(rel: {
  tenantId: string; entity: { type: string; id: string };
  relation: string; subject: { type: string; id: string };
}): Promise<{ deleted: boolean } | null> {
  return safe("DELETE", "/v1/permify/relationships", rel);
}
export async function expandPermifyPermissionsViaMiddleware(params: {
  tenantId: string; entity: { type: string; id: string }; permission: string;
}): Promise<{ subjects: Array<{ type: string; id: string }> } | null> {
  return safe("POST", "/v1/permify/permissions/expand", params);
}

// ─── Mojaloop Interoperability ────────────────────────────────────────────────
export async function lookupMojaloopPartyViaMiddleware(
  idType: string, idValue: string
): Promise<{ found: boolean; party?: unknown; fspId?: string } | null> {
  return safe("GET", `/v1/mojaloop/parties/${idType}/${idValue}`);
}
export async function initiateMojaloopTransferViaMiddleware(transfer: {
  transferId: string; payerFsp: string; payeeFsp: string;
  amount: { currency: string; amount: string };
  ilpPacket: string; condition: string; expiration: string;
}): Promise<{ transferId: string; transferState: string } | null> {
  return safe("POST", "/v1/mojaloop/transfers", transfer);
}
export async function getMojaloopTransferStatusViaMiddleware(
  transferId: string
): Promise<{ transferId: string; transferState: string; completedTimestamp?: string } | null> {
  return safe("GET", `/v1/mojaloop/transfers/${transferId}`);
}
export async function requestMojaloopQuoteViaMiddleware(quote: {
  quoteId: string; transactionId: string; payee: unknown; payer: unknown;
  amountType: string; amount: { currency: string; amount: string }; transactionType: unknown;
}): Promise<{ quoteId: string; transferAmount: unknown; payeeReceiveAmount: unknown } | null> {
  return safe("POST", "/v1/mojaloop/quotes", quote);
}

// ─── Redis Cache Bridge ───────────────────────────────────────────────────────
export async function setCacheViaMiddleware(
  key: string, value: unknown, ttlSeconds?: number
): Promise<{ set: boolean } | null> {
  return safe("POST", "/v1/cache/set", { key, value, ttlSeconds });
}
export async function getCacheViaMiddleware(
  key: string
): Promise<{ found: boolean; value?: unknown } | null> {
  return safe("GET", `/v1/cache/${encodeURIComponent(key)}`);
}
export async function invalidateCacheViaMiddleware(
  pattern: string
): Promise<{ deleted: number } | null> {
  return safe("DELETE", "/v1/cache/invalidate", { pattern });
}

// ─── Insider Threat Bridge ────────────────────────────────────────────────────

export async function bindSessionViaMiddleware(payload: {
  actorId: string; merchantId: string; sessionId: string;
  ipAddress: string; deviceHash: string; userAgent?: string;
}): Promise<{ bound: boolean } | null> {
  return safe("POST", "/v1/insider/session/bind", payload);
}

export async function validateSessionViaMiddleware(payload: {
  actorId: string; sessionId: string; ipAddress: string; deviceHash: string;
}): Promise<{ valid: boolean; reason?: string } | null> {
  return safe("POST", "/v1/insider/session/validate", payload);
}

export async function gateActionViaMiddleware(payload: {
  actorId: string; merchantId: string; action: string; resourceId?: string;
  sessionId: string; ipAddress: string; deviceHash: string; geoCountry?: string;
  metadata?: Record<string, unknown>;
}): Promise<{
  verdict: "allow" | "flag" | "require_approval" | "block";
  riskScore: number; riskLevel: string; riskFactors: string[];
  approvalId?: string; alertId?: string;
} | null> {
  return safe("POST", "/v1/insider/action/gate", payload);
}

export async function createApprovalRequestViaMiddleware(payload: {
  merchantId: string; initiatorId: string; action: string;
  resourceId?: string; payload?: unknown; ttlSeconds?: number;
}): Promise<{ id: string; expiresAt: number } | null> {
  return safe("POST", "/v1/insider/approval/create", payload);
}

export async function resolveApprovalViaMiddleware(payload: {
  id: string; approverId: string; decision: "approve" | "reject"; note?: string;
}): Promise<{ resolved: boolean; status: string } | null> {
  return safe("POST", "/v1/insider/approval/resolve", payload);
}

export async function getApprovalStatusViaMiddleware(
  id: string
): Promise<{ id: string; status: string; approverId?: string; resolvedAt?: number } | null> {
  return safe("GET", `/v1/insider/approval/status?id=${encodeURIComponent(id)}`);
}

export async function listInsiderAlertsViaMiddleware(params: {
  merchantId: string; status?: string; riskLevel?: string; limit?: number; offset?: number;
}): Promise<{ alerts: unknown[]; total: number } | null> {
  const qs = new URLSearchParams(
    Object.entries(params).filter(([, v]) => v != null).map(([k, v]) => [k, String(v)])
  ).toString();
  return safe("GET", `/v1/insider/alerts?${qs}`);
}

export async function resolveInsiderAlertViaMiddleware(payload: {
  id: string; resolverId: string; status: "resolved" | "false_positive" | "acknowledged"; note?: string;
}): Promise<{ resolved: boolean } | null> {
  return safe("POST", "/v1/insider/alert/resolve", payload);
}

export async function getInsiderRiskScoreViaMiddleware(payload: {
  actorId: string; merchantId: string; action: string; ipAddress?: string; geoCountry?: string;
}): Promise<{ riskScore: number; riskLevel: string; riskFactors: string[] } | null> {
  return safe("POST", "/v1/insider/score", payload);
}
