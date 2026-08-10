/**
 * daprClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Dapr sidecar client for PayGate microservice communication.
 * Dapr provides service invocation, pub/sub, state management, and bindings
 * via a sidecar pattern — decoupling services from infrastructure.
 *
 * Default Dapr HTTP port: 3500
 * Used for: service-to-service calls, state store, pub/sub, secret store.
 */

const DAPR_HTTP_PORT = parseInt(process.env.DAPR_HTTP_PORT ?? "3500", 10);
const DAPR_BASE_URL = `http://localhost:${DAPR_HTTP_PORT}`;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface DaprStateItem {
  key: string;
  value: unknown;
  etag?: string;
  metadata?: Record<string, string>;
  options?: { concurrency?: "first-write" | "last-write"; consistency?: "eventual" | "strong" };
}

export interface DaprPubSubMessage<T = unknown> {
  pubsubname: string;
  topic: string;
  data: T;
  datacontenttype?: string;
}

// ─── Helper ───────────────────────────────────────────────────────────────────
async function daprRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<{ status: number; data: unknown }> {
  try {
    const res = await fetch(`${DAPR_BASE_URL}${path}`, {
      method,
      headers: { "Content-Type": "application/json" },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    let data: unknown;
    try { data = await res.json(); } catch { data = null; }
    return { status: res.status, data };
  } catch (err) {
    // Dapr sidecar not running — silently degrade
    return { status: 503, data: { error: "Dapr sidecar unavailable" } };
  }
}

// ─── Service Invocation ───────────────────────────────────────────────────────

/**
 * Invoke a method on another Dapr-enabled service.
 */
export async function invokeService(
  appId: string,
  methodName: string,
  data?: unknown,
  httpMethod: "GET" | "POST" | "PUT" | "DELETE" = "POST"
): Promise<{ success: boolean; data: unknown }> {
  const { status, data: responseData } = await daprRequest(
    httpMethod,
    `/v1.0/invoke/${appId}/method/${methodName}`,
    data
  );
  return { success: status >= 200 && status < 300, data: responseData };
}

// ─── State Management ─────────────────────────────────────────────────────────

/**
 * Save state to Dapr state store.
 */
export async function saveState(
  storeName: string,
  items: DaprStateItem[]
): Promise<boolean> {
  const { status } = await daprRequest("POST", `/v1.0/state/${storeName}`, items);
  return status === 204;
}

/**
 * Get state from Dapr state store.
 */
export async function getState<T = unknown>(
  storeName: string,
  key: string
): Promise<T | null> {
  const { status, data } = await daprRequest("GET", `/v1.0/state/${storeName}/${key}`);
  if (status === 200) return data as T;
  return null;
}

/**
 * Delete state from Dapr state store.
 */
export async function deleteState(storeName: string, key: string): Promise<boolean> {
  const { status } = await daprRequest("DELETE", `/v1.0/state/${storeName}/${key}`);
  return status === 204;
}

// ─── Pub/Sub ──────────────────────────────────────────────────────────────────

/**
 * Publish a message to a Dapr pub/sub topic.
 */
export async function publishMessage<T = unknown>(
  pubsubName: string,
  topic: string,
  data: T,
  metadata?: Record<string, string>
): Promise<boolean> {
  const path = metadata
    ? `/v1.0/publish/${pubsubName}/${topic}?${new URLSearchParams(metadata)}`
    : `/v1.0/publish/${pubsubName}/${topic}`;
  const { status } = await daprRequest("POST", path, data);
  return status === 204;
}

// ─── Secret Store ─────────────────────────────────────────────────────────────

/**
 * Get a secret from Dapr secret store.
 */
export async function getSecret(
  storeName: string,
  secretName: string
): Promise<Record<string, string> | null> {
  const { status, data } = await daprRequest(
    "GET",
    `/v1.0/secrets/${storeName}/${secretName}`
  );
  if (status === 200) return data as Record<string, string>;
  return null;
}

// ─── PayGate-specific Dapr helpers ───────────────────────────────────────────

const DAPR_PUBSUB = "paygate-pubsub";
const DAPR_STATE_STORE = "paygate-statestore";

export const dapr = {
  /**
   * Publish a transaction event via Dapr pub/sub.
   */
  publishTransaction: (event: {
    type: string;
    transactionId: string;
    merchantId: string;
    amount: number;
    currency: string;
  }) => publishMessage(DAPR_PUBSUB, "transactions", event),

  /**
   * Publish a fraud alert via Dapr pub/sub.
   */
  publishFraudAlert: (alert: {
    merchantId: string;
    transactionId?: string;
    riskScore: number;
    reason: string;
  }) => publishMessage(DAPR_PUBSUB, "fraud-alerts", alert),

  /**
   * Cache merchant profile in Dapr state store.
   */
  cacheMerchantProfile: (merchantId: string, profile: unknown) =>
    saveState(DAPR_STATE_STORE, [{ key: `merchant:${merchantId}`, value: profile }]),

  /**
   * Get cached merchant profile.
   */
  getMerchantProfile: (merchantId: string) =>
    getState(DAPR_STATE_STORE, `merchant:${merchantId}`),

  /**
   * Invoke fraud scoring service.
   */
  scoreFraud: (payload: unknown) =>
    invokeService("fraud-scoring-service", "score", payload),

  /**
   * Invoke notification service.
   */
  sendNotification: (payload: unknown) =>
    invokeService("notification-service", "send", payload),

  /**
   * Invoke KYB verification service.
   */
  verifyKyb: (payload: unknown) =>
    invokeService("kyb-service", "verify", payload),
};
