/**
 * temporalClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Temporal workflow client for PayGate long-running business processes.
 * Used for: KYB verification, payout processing, dispute resolution,
 * settlement batching, subscription billing, and loan origination.
 *
 * Falls back gracefully when TEMPORAL_HOST_PORT is not configured.
 */

import { ENV } from "./_core/env";

// ─── Workflow type constants ──────────────────────────────────────────────────
export const TEMPORAL_WORKFLOWS = {
  KYB_VERIFICATION: "kybVerificationWorkflow",
  PAYOUT_PROCESSING: "payoutProcessingWorkflow",
  DISPUTE_RESOLUTION: "disputeResolutionWorkflow",
  SETTLEMENT_BATCH: "settlementBatchWorkflow",
  SUBSCRIPTION_BILLING: "subscriptionBillingWorkflow",
  LOAN_ORIGINATION: "loanOriginationWorkflow",
  FRAUD_INVESTIGATION: "fraudInvestigationWorkflow",
  MERCHANT_ONBOARDING: "merchantOnboardingWorkflow",
} as const;

export const TEMPORAL_TASK_QUEUES = {
  PAYMENTS: "paygate-payments",
  KYB: "paygate-kyb",
  SETTLEMENTS: "paygate-settlements",
  SUBSCRIPTIONS: "paygate-subscriptions",
  LENDING: "paygate-lending",
  FRAUD: "paygate-fraud",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface WorkflowHandle {
  workflowId: string;
  runId?: string;
}

export interface WorkflowStatus {
  workflowId: string;
  status: "RUNNING" | "COMPLETED" | "FAILED" | "CANCELLED" | "TIMED_OUT" | "UNKNOWN";
  result?: unknown;
  error?: string;
}

// ─── Lazy client ─────────────────────────────────────────────────────────────
let _client: any = null;

async function getClient() {
  if (!ENV.temporalHostPort) return null;
  if (_client) return _client;
  try {
    const { Client, Connection } = await import("@temporalio/client" as any);
    const connection = await Connection.connect({
      address: ENV.temporalHostPort,
    });
    _client = new Client({
      connection,
      namespace: ENV.temporalNamespace || "default",
    });
    return _client;
  } catch {
    console.warn("[temporal] @temporalio/client not available or server unreachable — workflows disabled");
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Start a Temporal workflow.
 */
export async function startWorkflow(
  workflowType: string,
  taskQueue: string,
  args: unknown[],
  workflowId?: string
): Promise<WorkflowHandle | null> {
  try {
    const client = await getClient();
    if (!client) return null;

    const id = workflowId ?? `${workflowType}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
    const handle = await client.workflow.start(workflowType, {
      taskQueue,
      workflowId: id,
      args,
    });
    return { workflowId: handle.workflowId, runId: handle.firstExecutionRunId };
  } catch (err) {
    console.error(`[temporal] Failed to start workflow ${workflowType}:`, err);
    return null;
  }
}

/**
 * Get the status of a running workflow.
 */
export async function getWorkflowStatus(workflowId: string): Promise<WorkflowStatus> {
  try {
    const client = await getClient();
    if (!client) return { workflowId, status: "UNKNOWN" };

    const handle = client.workflow.getHandle(workflowId);
    const desc = await handle.describe();
    const statusMap: Record<string, WorkflowStatus["status"]> = {
      WORKFLOW_EXECUTION_STATUS_RUNNING: "RUNNING",
      WORKFLOW_EXECUTION_STATUS_COMPLETED: "COMPLETED",
      WORKFLOW_EXECUTION_STATUS_FAILED: "FAILED",
      WORKFLOW_EXECUTION_STATUS_CANCELED: "CANCELLED",
      WORKFLOW_EXECUTION_STATUS_TIMED_OUT: "TIMED_OUT",
    };
    return {
      workflowId,
      status: statusMap[desc.status?.name ?? ""] ?? "UNKNOWN",
    };
  } catch (err) {
    return { workflowId, status: "UNKNOWN", error: String(err) };
  }
}

/**
 * Start KYB verification workflow.
 */
export async function startKybVerification(merchantId: string, documents: string[]) {
  return startWorkflow(
    TEMPORAL_WORKFLOWS.KYB_VERIFICATION,
    TEMPORAL_TASK_QUEUES.KYB,
    [{ merchantId, documents }],
    `kyb-${merchantId}`
  );
}

/**
 * Start payout processing workflow.
 */
export async function startPayoutProcessing(payoutId: string, merchantId: string, amount: number, currency: string) {
  return startWorkflow(
    TEMPORAL_WORKFLOWS.PAYOUT_PROCESSING,
    TEMPORAL_TASK_QUEUES.PAYMENTS,
    [{ payoutId, merchantId, amount, currency }],
    `payout-${payoutId}`
  );
}

/**
 * Start dispute resolution workflow.
 */
export async function startDisputeResolution(disputeId: string, transactionId: string) {
  return startWorkflow(
    TEMPORAL_WORKFLOWS.DISPUTE_RESOLUTION,
    TEMPORAL_TASK_QUEUES.PAYMENTS,
    [{ disputeId, transactionId }],
    `dispute-${disputeId}`
  );
}

/**
 * Start settlement batch workflow.
 */
export async function startSettlementBatch(batchId: string, merchantIds: string[]) {
  return startWorkflow(
    TEMPORAL_WORKFLOWS.SETTLEMENT_BATCH,
    TEMPORAL_TASK_QUEUES.SETTLEMENTS,
    [{ batchId, merchantIds }],
    `settlement-batch-${batchId}`
  );
}

/**
 * Start loan origination workflow.
 */
export async function startLoanOrigination(applicationId: string, merchantId: string, amount: number) {
  return startWorkflow(
    TEMPORAL_WORKFLOWS.LOAN_ORIGINATION,
    TEMPORAL_TASK_QUEUES.LENDING,
    [{ applicationId, merchantId, amount }],
    `loan-${applicationId}`
  );
}
