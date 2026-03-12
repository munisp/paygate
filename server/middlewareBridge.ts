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

/** Safe wrapper — logs and returns null on failure (never throws to callers) */
async function safe<T>(
  method: "GET" | "POST" | "PUT" | "DELETE",
  path: string,
  body?: unknown
): Promise<T | null> {
  try {
    return await bridgeRequest<T>(method, path, body);
  } catch (err: any) {
    console.warn(`[Bridge] ${method} ${path} degraded:`, err?.message);
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
