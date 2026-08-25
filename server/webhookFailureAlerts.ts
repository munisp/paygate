/**
 * webhookFailureAlerts.ts
 *
 * Real-time webhook failure monitoring system.
 * - Polls webhook_deliveries every 60 seconds for new failures
 * - Emits Server-Sent Events (SSE) to connected admin clients
 * - Sends push notifications to admins with alertWebhookFailures enabled
 * - Tracks acknowledged alerts to avoid duplicate notifications
 */

import { getDb } from "./db";
import { notifyOwner } from "./_core/notification";
import { isSuppressedWorkerError } from './workerErrorFilter';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface WebhookFailureAlert {
  id: string;
  merchantId: string;
  merchantName: string;
  webhookId: string;
  eventType: string;
  responseStatus: number | null;
  errorMessage: string | null;
  attemptCount: number;
  failedAt: string;
  severity: "critical" | "warning" | "info";
}

// ─── In-memory SSE subscriber registry ───────────────────────────────────────

type AlertSubscriber = (alerts: WebhookFailureAlert[]) => void;
const subscribers = new Set<AlertSubscriber>();

export function subscribeToWebhookAlerts(cb: AlertSubscriber): () => void {
  subscribers.add(cb);
  return () => subscribers.delete(cb);
}

function broadcastAlerts(alerts: WebhookFailureAlert[]): void {
  if (alerts.length === 0) return;
  for (const cb of subscribers) {
    try { cb(alerts); } catch { /* ignore individual subscriber errors */ }
  }
}

// ─── Acknowledged alert tracking (in-memory, resets on restart) ───────────────

const acknowledgedIds = new Set<string>();

export function acknowledgeAlert(deliveryId: string): void {
  acknowledgedIds.add(deliveryId);
}

// ─── Core polling logic ───────────────────────────────────────────────────────

let lastCheckedAt = new Date(Date.now() - 5 * 60 * 1000); // start 5 min ago

export async function pollWebhookFailures(): Promise<WebhookFailureAlert[]> {
  try {
    const drizzle = await getDb();
    if (!drizzle) return [];
    const { sql } = await import("drizzle-orm");

    const since = lastCheckedAt.toISOString();
    lastCheckedAt = new Date();

    const result = await drizzle.execute(sql`
      SELECT
        wd.id,
        wd.merchant_id,
        COALESCE(m.business_name, 'Unknown Merchant') as merchant_name,
        wd.webhook_id,
        wd.event_type,
        wd.response_status,
        wd.response_body,
        wd.attempt_count,
        wd.created_at as failed_at
      FROM webhook_deliveries wd
      LEFT JOIN merchants m ON m.id = wd.merchant_id
      WHERE wd.status = 'failed'
        AND wd.created_at >= ${since}::timestamptz
      ORDER BY wd.created_at DESC
      LIMIT 100
    `);

    const rows: any[] = Array.isArray(result) ? result : (result as any).rows ?? [];

    const alerts: WebhookFailureAlert[] = rows
      .filter((r) => !acknowledgedIds.has(r.id))
      .map((r) => ({
        id: r.id,
        merchantId: r.merchant_id,
        merchantName: r.merchant_name ?? "Unknown",
        webhookId: r.webhook_id,
        eventType: r.event_type,
        responseStatus: r.response_status ? Number(r.response_status) : null,
        errorMessage: r.response_body ? String(r.response_body).slice(0, 200) : null,
        attemptCount: Number(r.attempt_count ?? 0),
        failedAt: r.failed_at instanceof Date ? r.failed_at.toISOString() : String(r.failed_at),
        severity: getSeverity(r.response_status, r.attempt_count),
      }));

    if (alerts.length > 0) {
      broadcastAlerts(alerts);
      // Notify owner if there are critical failures
      const critical = alerts.filter((a) => a.severity === "critical");
      if (critical.length > 0) {
        await notifyOwner({
          title: `⚠️ ${critical.length} Critical Webhook Failure${critical.length > 1 ? "s" : ""}`,
          content: critical
            .slice(0, 5)
            .map((a) => `• ${a.merchantName} — ${a.eventType} (HTTP ${a.responseStatus ?? "timeout"}, attempt ${a.attemptCount})`)
            .join("\n"),
        }).catch((e) => {
          console.error("[webhookFailureAlerts] CRITICAL webhook failure owner alert FAILED — alert lost:", e instanceof Error ? e.message : String(e));
        });
      }
    }

    return alerts;
  } catch (err) {
    if (!isSuppressedWorkerError(err)) {
      console.error("[webhookFailureAlerts] Poll error:", err);
    }
    return [];
  }
}

function getSeverity(responseStatus: any, attemptCount: any): "critical" | "warning" | "info" {
  const status = Number(responseStatus ?? 0);
  const attempts = Number(attemptCount ?? 0);
  if (attempts >= 3 || status === 0 || (status >= 500 && status < 600)) return "critical";
  if (status >= 400 && status < 500) return "warning";
  return "info";
}

// ─── Scheduler ────────────────────────────────────────────────────────────────

let pollerInterval: ReturnType<typeof setInterval> | null = null;

export function startWebhookFailurePoller(intervalMs = 60_000): void {
  if (pollerInterval) return; // already running
  // Run immediately on start, then on interval
  pollWebhookFailures().catch((e) => console.error("[webhookFailureAlerts] Poll tick failed:", e instanceof Error ? e.message : String(e)));
  pollerInterval = setInterval(() => {
    pollWebhookFailures().catch((e) => console.error("[webhookFailureAlerts] Poll tick failed:", e instanceof Error ? e.message : String(e)));
  }, intervalMs);
  console.info(`[webhookFailureAlerts] Poller started (interval: ${intervalMs}ms)`);
}

export function stopWebhookFailurePoller(): void {
  if (pollerInterval) {
    clearInterval(pollerInterval);
    pollerInterval = null;
  }
}

// ─── Admin summary query (used by tRPC procedure) ─────────────────────────────

export async function getAdminWebhookFailureSummary(windowMinutes = 60): Promise<{
  totalFailed: number;
  criticalCount: number;
  warningCount: number;
  affectedMerchants: number;
  recentFailures: WebhookFailureAlert[];
}> {
  try {
    const drizzle = await getDb();
    if (!drizzle) return { totalFailed: 0, criticalCount: 0, warningCount: 0, affectedMerchants: 0, recentFailures: [] };
    const { sql } = await import("drizzle-orm");

    const since = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();

    const result = await drizzle.execute(sql`
      SELECT
        wd.id,
        wd.merchant_id,
        COALESCE(m.business_name, 'Unknown Merchant') as merchant_name,
        wd.webhook_id,
        wd.event_type,
        wd.response_status,
        wd.response_body,
        wd.attempt_count,
        wd.created_at as failed_at
      FROM webhook_deliveries wd
      LEFT JOIN merchants m ON m.id = wd.merchant_id
      WHERE wd.status = 'failed'
        AND wd.created_at >= ${since}::timestamptz
      ORDER BY wd.created_at DESC
      LIMIT 200
    `);

    const rows: any[] = Array.isArray(result) ? result : (result as any).rows ?? [];

    const recentFailures: WebhookFailureAlert[] = rows.map((r) => ({
      id: r.id,
      merchantId: r.merchant_id,
      merchantName: r.merchant_name ?? "Unknown",
      webhookId: r.webhook_id,
      eventType: r.event_type,
      responseStatus: r.response_status ? Number(r.response_status) : null,
      errorMessage: r.response_body ? String(r.response_body).slice(0, 200) : null,
      attemptCount: Number(r.attempt_count ?? 0),
      failedAt: r.failed_at instanceof Date ? r.failed_at.toISOString() : String(r.failed_at),
      severity: getSeverity(r.response_status, r.attempt_count),
    }));

    const criticalCount = recentFailures.filter((f) => f.severity === "critical").length;
    const warningCount = recentFailures.filter((f) => f.severity === "warning").length;
    const affectedMerchants = new Set(recentFailures.map((f) => f.merchantId)).size;

    return {
      totalFailed: recentFailures.length,
      criticalCount,
      warningCount,
      affectedMerchants,
      recentFailures: recentFailures.slice(0, 50),
    };
  } catch (err) {
    console.error("[webhookFailureAlerts] Summary error:", err);
    return { totalFailed: 0, criticalCount: 0, warningCount: 0, affectedMerchants: 0, recentFailures: [] };
  }
}
