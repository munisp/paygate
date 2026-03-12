/**
 * PayGate Merchant Portal — Push Notification Client (Wave 19)
 *
 * Thin HTTP client that calls the Python push notification microservice.
 * Used by tRPC procedures and server-side event handlers to dispatch
 * FCM/APNs notifications without importing Firebase Admin into Node.js.
 *
 * Environment variables required:
 *   PUSH_SERVICE_URL  — base URL of the Python service (e.g. http://localhost:8001)
 *   PUSH_SERVICE_KEY  — shared internal API key (must match the Python service)
 *
 * If PUSH_SERVICE_URL is not set, all calls are no-ops (graceful degradation).
 */

const BASE_URL = process.env.PUSH_SERVICE_URL ?? "";
const API_KEY  = process.env.PUSH_SERVICE_KEY  ?? "";

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushNotification {
  title:     string;
  body:      string;
  image_url?: string;
}

export type NotificationType =
  | "transaction_completed"
  | "transaction_failed"
  | "payout_initiated"
  | "payout_completed"
  | "payout_failed"
  | "dispute_opened"
  | "dispute_resolved"
  | "kyc_approved"
  | "kyc_rejected"
  | "fraud_alert"
  | "settlement_completed"
  | "generic";

export interface DispatchResult {
  success_count:  number;
  failure_count:  number;
  total_tokens:   number;
  invalid_tokens: string[];
}

// ─── Internal helper ──────────────────────────────────────────────────────────

async function callPushService(
  path: string,
  body: Record<string, unknown>
): Promise<DispatchResult | null> {
  if (!BASE_URL) {
    // Push service not configured — log and skip silently
    console.warn("[PushClient] PUSH_SERVICE_URL not set — skipping notification");
    return null;
  }

  try {
    const res = await fetch(`${BASE_URL}${path}`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify(body),
      // 10-second timeout — notifications are fire-and-forget
      signal: AbortSignal.timeout(10_000),
    });

    if (!res.ok) {
      const text = await res.text().catch(() => "");
      console.error(`[PushClient] ${path} returned ${res.status}: ${text}`);
      return null;
    }

    return (await res.json()) as DispatchResult;
  } catch (err: any) {
    console.error(`[PushClient] Failed to call ${path}:`, err?.message);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Send a push notification to ALL active devices of a merchant.
 * The Python service looks up tokens from the database automatically.
 *
 * @example
 * await pushClient.notifyMerchant({
 *   merchantId: "merchant_abc123",
 *   notification: { title: "Payment received", body: "₦50,000 from Chidi Okeke" },
 *   type: "transaction_completed",
 *   data: { transactionId: "txn_xyz" },
 * });
 */
export async function notifyMerchant(opts: {
  merchantId:        string;
  notification:      PushNotification;
  type?:             NotificationType;
  data?:             Record<string, string>;
  userId?:           number;
}): Promise<DispatchResult | null> {
  return callPushService("/notify/merchant", {
    merchant_id:       opts.merchantId,
    notification:      opts.notification,
    notification_type: opts.type ?? "generic",
    data:              opts.data ?? {},
    user_id:           opts.userId,
  });
}

/**
 * Send a push notification to an explicit list of FCM tokens.
 */
export async function notifyTokens(opts: {
  tokens:       string[];
  notification: PushNotification;
  type?:        NotificationType;
  data?:        Record<string, string>;
}): Promise<DispatchResult | null> {
  return callPushService("/notify/tokens", {
    tokens:            opts.tokens,
    notification:      opts.notification,
    notification_type: opts.type ?? "generic",
    data:              opts.data ?? {},
  });
}

/**
 * Broadcast a push notification to a Firebase topic.
 * Topic names must match: /^[a-zA-Z0-9_\-\.]+$/
 *
 * Suggested topic naming convention:
 *   merchant_{merchantId}   — all devices of a merchant
 *   platform_alerts         — platform-wide maintenance / incident notices
 *   fraud_alerts            — high-priority fraud alerts
 */
export async function notifyTopic(opts: {
  topic:        string;
  notification: PushNotification;
  type?:        NotificationType;
  data?:        Record<string, string>;
}): Promise<DispatchResult | null> {
  return callPushService("/notify/topic", {
    topic:             opts.topic,
    notification:      opts.notification,
    notification_type: opts.type ?? "generic",
    data:              opts.data ?? {},
  });
}

/**
 * Register a device token via the Python service.
 * Called from the tRPC pushTokens.register procedure.
 */
export async function registerToken(opts: {
  token:      string;
  platform:   "fcm" | "apns";
  deviceId:   string;
  merchantId: string;
  userId:     number;
}): Promise<void> {
  if (!BASE_URL) return;
  try {
    await fetch(`${BASE_URL}/tokens/register`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({
        token:       opts.token,
        platform:    opts.platform,
        device_id:   opts.deviceId,
        merchant_id: opts.merchantId,
        user_id:     opts.userId,
      }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err: any) {
    console.error("[PushClient] registerToken failed:", err?.message);
  }
}

/**
 * Deregister a device token via the Python service.
 * Called from the tRPC pushTokens.deregister procedure.
 */
export async function deregisterToken(token: string): Promise<void> {
  if (!BASE_URL) return;
  try {
    await fetch(`${BASE_URL}/tokens/deregister`, {
      method:  "POST",
      headers: {
        "Content-Type":  "application/json",
        "Authorization": `Bearer ${API_KEY}`,
      },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(5_000),
    });
  } catch (err: any) {
    console.error("[PushClient] deregisterToken failed:", err?.message);
  }
}
