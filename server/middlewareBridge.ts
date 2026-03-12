/**
 * PayGate Middleware Bridge Client
 * =================================
 * Thin HTTP client for calling the Go middleware bridge from tRPC procedures.
 *
 * The bridge exposes the full middleware stack:
 *   - Temporal  — durable workflow orchestration
 *   - TigerBeetle — atomic fund reservation / commit / void
 *   - Kafka     — event publishing
 *   - Permify   — RBAC permission checks
 *   - Redis     — approval state cache
 *   - Dapr      — pub/sub fan-out
 *   - Fluvio    — real-time SSE stream
 *   - Lakehouse — compliance audit records
 *   - Keycloak  — JWT validation (enforced at APISIX layer)
 *   - APISIX    — API gateway routing
 *
 * When MIDDLEWARE_BRIDGE_URL is not set (local dev / sandbox), all methods
 * return a graceful fallback so the portal UI works without the bridge.
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface InitiateApprovalRequest {
  payoutId: string;
  merchantId: string;
  amount: number;
  currency: string;
  bankCode: string;
  accountNumber: string;
  accountName: string;
  narration?: string;
  reference: string;
  initiatorId: string; // Keycloak subject of the user initiating the payout
}

export interface InitiateApprovalResponse {
  workflowId: string;
  runId: string;
  status: string;
  createdAt: string;
}

export interface ApprovalDecisionRequest {
  approverId: string; // Keycloak subject of the approver
  reason?: string;
}

export interface ApprovalDecisionResponse {
  payoutId: string;
  status: string;
  signaledAt: string;
}

export interface ApprovalStatusResponse {
  payoutId: string;
  workflowId: string;
  status: string;
}

// ─── Bridge availability ──────────────────────────────────────────────────────

/**
 * Returns true if the middleware bridge is configured.
 * When false, callers should fall back to direct DB operations.
 */
export function isBridgeAvailable(): boolean {
  return Boolean(ENV.middlewareBridgeUrl);
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────

async function bridgeRequest<T>(
  method: "GET" | "POST",
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
    throw new Error(
      `Bridge request ${method} ${path} failed: HTTP ${res.status} — ${text}`
    );
  }

  return res.json() as Promise<T>;
}

// ─── Payout Approval API ──────────────────────────────────────────────────────

/**
 * Calls POST /v1/payouts/initiate-approval on the Go bridge.
 *
 * This starts a Temporal PayoutApprovalWorkflow which:
 *   1. Checks Permify permissions
 *   2. Reserves funds in TigerBeetle
 *   3. Caches approval state in Redis
 *   4. Publishes payout.approval_requested to Kafka + Dapr + Fluvio
 *   5. Waits up to 48 h for an approval signal
 *
 * Returns the Temporal workflow ID for status polling.
 */
export async function initiatePayoutApproval(
  req: InitiateApprovalRequest
): Promise<InitiateApprovalResponse> {
  return bridgeRequest<InitiateApprovalResponse>(
    "POST",
    "/v1/payouts/initiate-approval",
    {
      payout_id: req.payoutId,
      merchant_id: req.merchantId,
      amount: req.amount,
      currency: req.currency,
      bank_code: req.bankCode,
      account_number: req.accountNumber,
      account_name: req.accountName,
      narration: req.narration ?? "",
      reference: req.reference,
      initiator_id: req.initiatorId,
    }
  );
}

/**
 * Calls POST /v1/payouts/:id/approve on the Go bridge.
 *
 * The bridge:
 *   1. Checks Permify: approver must have payout:approve
 *   2. Looks up the Temporal workflow ID from Redis
 *   3. Sends the "payout_approval_decision" signal (approved=true)
 *
 * The Temporal workflow then:
 *   - Commits the TigerBeetle reservation
 *   - Executes the bank transfer
 *   - Publishes payout.approved to Kafka + Dapr + Fluvio
 *   - Writes a Lakehouse audit record
 */
export async function approvePayoutViaMiddleware(
  payoutId: string,
  req: ApprovalDecisionRequest
): Promise<ApprovalDecisionResponse> {
  return bridgeRequest<ApprovalDecisionResponse>(
    "POST",
    `/v1/payouts/${payoutId}/approve`,
    {
      approver_id: req.approverId,
      reason: req.reason ?? "",
    }
  );
}

/**
 * Calls POST /v1/payouts/:id/reject on the Go bridge.
 *
 * The bridge sends the "payout_approval_decision" signal (approved=false).
 * The Temporal workflow then:
 *   - Voids the TigerBeetle reservation (returns funds to merchant_available)
 *   - Publishes payout.rejected to Kafka + Dapr + Fluvio
 *   - Writes a Lakehouse audit record
 */
export async function rejectPayoutViaMiddleware(
  payoutId: string,
  req: ApprovalDecisionRequest
): Promise<ApprovalDecisionResponse> {
  return bridgeRequest<ApprovalDecisionResponse>(
    "POST",
    `/v1/payouts/${payoutId}/reject`,
    {
      approver_id: req.approverId,
      reason: req.reason ?? "",
    }
  );
}

/**
 * Calls GET /v1/payouts/:id/approval-status on the Go bridge.
 * Returns the current Temporal workflow status for a pending payout.
 */
export async function getPayoutApprovalStatus(
  payoutId: string
): Promise<ApprovalStatusResponse> {
  return bridgeRequest<ApprovalStatusResponse>(
    "GET",
    `/v1/payouts/${payoutId}/approval-status`
  );
}
