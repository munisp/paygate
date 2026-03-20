/**
 * Web Push Notification Client
 *
 * Uses the W3C Web Push Protocol with VAPID authentication.
 * Works without any external push service — sends directly to browsers/PWAs.
 *
 * Required environment variables:
 *   VAPID_PUBLIC_KEY   — Base64url-encoded VAPID public key
 *   VAPID_PRIVATE_KEY  — Base64url-encoded VAPID private key
 *   VAPID_SUBJECT      — mailto: or https: URL identifying the sender
 *
 * Generate keys once with:
 *   node -e "const wp=require('web-push'); const k=wp.generateVAPIDKeys(); console.log(JSON.stringify(k,null,2))"
 *
 * Falls back to the external PUSH_SERVICE_URL if VAPID keys are not set.
 * Silently no-ops if neither is configured (graceful degradation).
 */
import webpush from "web-push";
import { logger } from "./logger";
import { getDb } from "./db";
import { devicePushTokens } from "../drizzle/schema";
import { eq, and, inArray } from "drizzle-orm";

// ─── VAPID Configuration ──────────────────────────────────────────────────────

let vapidConfigured = false;

function ensureVapid() {
  if (vapidConfigured) return;
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  const subject = process.env.VAPID_SUBJECT ?? "mailto:ops@paygate.ng";
  if (pub && priv) {
    webpush.setVapidDetails(subject, pub, priv);
    vapidConfigured = true;
    logger.info("vapid_configured", { subject });
  }
}

export function isWebPushConfigured(): boolean {
  return !!(process.env.VAPID_PUBLIC_KEY && process.env.VAPID_PRIVATE_KEY);
}

export function getVapidPublicKey(): string {
  return process.env.VAPID_PUBLIC_KEY ?? "";
}

// ─── Types ────────────────────────────────────────────────────────────────────

export interface PushPayload {
  title: string;
  body: string;
  icon?: string;
  badge?: string;
  tag?: string;
  data?: Record<string, unknown>;
  actions?: Array<{ action: string; title: string }>;
}

export interface PushResult {
  sent: number;
  failed: number;
  invalidTokens: string[];
}

// ─── Core send function ───────────────────────────────────────────────────────

/**
 * Send a Web Push notification to a list of subscription objects.
 * Each subscription is a PushSubscription JSON (endpoint + keys).
 */
export async function sendWebPush(
  subscriptions: Array<{ endpoint: string; keys: { p256dh: string; auth: string } }>,
  payload: PushPayload
): Promise<PushResult> {
  if (!isWebPushConfigured()) {
    logger.warn("web_push_not_configured", {
      hint: "Set VAPID_PUBLIC_KEY and VAPID_PRIVATE_KEY to enable Web Push notifications",
      payloadTitle: payload.title,
    });
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
  ensureVapid();

  const payloadStr = JSON.stringify(payload);
  const results = await Promise.allSettled(
    subscriptions.map(sub =>
      webpush.sendNotification(
        { endpoint: sub.endpoint, keys: sub.keys },
        payloadStr,
        { TTL: 86400 } // 24h TTL
      )
    )
  );

  const invalidTokens: string[] = [];
  let sent = 0;
  let failed = 0;

  results.forEach((result, i) => {
    if (result.status === "fulfilled") {
      sent++;
    } else {
      failed++;
      const err = result.reason as any;
      // 410 Gone = subscription expired/unsubscribed
      if (err?.statusCode === 410 || err?.statusCode === 404) {
        invalidTokens.push(subscriptions[i].endpoint);
      }
      logger.warn("web_push_send_failed", {
        endpoint: subscriptions[i].endpoint.slice(0, 60),
        statusCode: err?.statusCode,
        message: err?.message,
      });
    }
  });

  logger.info("web_push_sent", { sent, failed, total: subscriptions.length, title: payload.title });
  return { sent, failed, invalidTokens };
}

// ─── High-level helpers ───────────────────────────────────────────────────────

/**
 * Send a push notification to all active devices of a user (consumer or merchant).
 * Automatically cleans up expired subscriptions.
 */
export async function notifyUser(userId: number, payload: PushPayload): Promise<PushResult> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0, invalidTokens: [] };

  const tokens = await db.select().from(devicePushTokens)
    .where(and(eq(devicePushTokens.userId, userId), eq(devicePushTokens.isActive, true)));

  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  // Filter tokens that have Web Push subscription data
  const webPushSubs = tokens
    .filter(t => t.webPushEndpoint && t.webPushP256dh && t.webPushAuth)
    .map(t => ({
      endpoint: t.webPushEndpoint!,
      keys: { p256dh: t.webPushP256dh!, auth: t.webPushAuth! },
    }));

  if (webPushSubs.length === 0) {
    // Fall back to external push service if configured
    return callExternalPushService(userId, payload);
  }

  const result = await sendWebPush(webPushSubs, payload);

  // Clean up expired subscriptions
  if (result.invalidTokens.length > 0) {
    await db.update(devicePushTokens)
      .set({ isActive: false })
      .where(inArray(devicePushTokens.webPushEndpoint as any, result.invalidTokens));
    logger.info("push_tokens_cleaned", { count: result.invalidTokens.length, userId });
  }

  return result;
}

/**
 * Send a push notification to all active devices of a merchant.
 */
export async function notifyMerchantWebPush(merchantId: string, payload: PushPayload): Promise<PushResult> {
  const db = await getDb();
  if (!db) return { sent: 0, failed: 0, invalidTokens: [] };

  const tokens = await db.select().from(devicePushTokens)
    .where(and(eq(devicePushTokens.merchantId, merchantId), eq(devicePushTokens.isActive, true)));

  if (tokens.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  const webPushSubs = tokens
    .filter(t => t.webPushEndpoint && t.webPushP256dh && t.webPushAuth)
    .map(t => ({
      endpoint: t.webPushEndpoint!,
      keys: { p256dh: t.webPushP256dh!, auth: t.webPushAuth! },
    }));

  if (webPushSubs.length === 0) return { sent: 0, failed: 0, invalidTokens: [] };

  const result = await sendWebPush(webPushSubs, payload);

  if (result.invalidTokens.length > 0) {
    await db.update(devicePushTokens)
      .set({ isActive: false })
      .where(inArray(devicePushTokens.webPushEndpoint as any, result.invalidTokens));
  }

  return result;
}

// ─── External push service fallback ──────────────────────────────────────────

async function callExternalPushService(userId: number, payload: PushPayload): Promise<PushResult> {
  const BASE_URL = process.env.PUSH_SERVICE_URL ?? "";
  const API_KEY = process.env.PUSH_SERVICE_KEY ?? "";
  if (!BASE_URL) return { sent: 0, failed: 0, invalidTokens: [] };

  try {
    const res = await fetch(`${BASE_URL}/notify/user`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: `Bearer ${API_KEY}` },
      body: JSON.stringify({ user_id: userId, notification: payload }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return { sent: 0, failed: 1, invalidTokens: [] };
    const data = await res.json() as any;
    return { sent: data.success_count ?? 0, failed: data.failure_count ?? 0, invalidTokens: data.invalid_tokens ?? [] };
  } catch (err: any) {
    logger.warn("external_push_service_failed", { message: err.message });
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
}
