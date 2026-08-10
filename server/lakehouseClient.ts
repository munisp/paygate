/**
 * lakehouseClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Lakehouse (Apache Iceberg / Delta Lake) client for PayGate analytics.
 * Used for: compliance reporting, long-term transaction archival,
 * regulatory data exports (CBN, NDIC), and ML feature engineering.
 *
 * Architecture:
 *   - Write path: events → Kafka → Flink/Spark → Iceberg tables in S3
 *   - Read path: Trino/Spark SQL → REST API → this client
 *   - Tables: transactions, audit_logs, fraud_events, settlements, kyc_events
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface LakehouseQuery {
  sql: string;
  parameters?: unknown[];
  catalog?: string;
  schema?: string;
}

export interface LakehouseQueryResult<T = Record<string, unknown>> {
  rows: T[];
  rowCount: number;
  columns: string[];
  executionTimeMs?: number;
}

export interface ComplianceEvent {
  eventType: string;
  merchantId: string;
  userId?: string;
  amount?: number;
  currency?: string;
  referenceId?: string;
  regulatoryFlag?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function lakehouseRequest(path: string, body: unknown): Promise<unknown> {
  // Try direct lakehouse URL or fall back to middleware bridge
  const baseUrl = process.env.LAKEHOUSE_URL ?? process.env.MIDDLEWARE_BRIDGE_URL;
  if (!baseUrl) return null;

  const url = process.env.LAKEHOUSE_URL
    ? `${baseUrl}${path}`
    : `${baseUrl}/lakehouse${path}`;

  try {
    const res = await fetch(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(process.env.LAKEHOUSE_API_KEY
          ? { Authorization: `Bearer ${process.env.LAKEHOUSE_API_KEY}` }
          : {}),
        ...(ENV.middlewareInternalKey
          ? { "X-Internal-Key": ENV.middlewareInternalKey }
          : {}),
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(60_000), // queries can be slow
    });

    if (!res.ok) {
      console.warn(`[lakehouse] ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn("[lakehouse] Request failed:", err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Execute a SQL query against the lakehouse (Trino/Spark SQL).
 */
export async function queryLakehouse<T = Record<string, unknown>>(
  query: LakehouseQuery
): Promise<LakehouseQueryResult<T>> {
  const result = await lakehouseRequest("/query", query) as any;
  if (!result) return { rows: [], rowCount: 0, columns: [] };
  return {
    rows: result.data ?? [],
    rowCount: result.rowCount ?? 0,
    columns: result.columns ?? [],
    executionTimeMs: result.stats?.elapsedTimeMillis,
  };
}

/**
 * Ingest a compliance event into the lakehouse.
 */
export async function ingestComplianceEvent(event: ComplianceEvent): Promise<boolean> {
  const result = await lakehouseRequest("/compliance/events", event);
  return result !== null;
}

/**
 * Ingest multiple compliance events in batch.
 */
export async function ingestComplianceEventsBatch(events: ComplianceEvent[]): Promise<boolean> {
  if (!events.length) return true;
  const result = await lakehouseRequest("/compliance/events/batch", { events });
  return result !== null;
}

/**
 * Query compliance events for a merchant.
 */
export async function queryComplianceEvents(
  merchantId: string,
  filters?: {
    startDate?: string;
    endDate?: string;
    eventType?: string;
    regulatoryFlag?: string;
  }
): Promise<LakehouseQueryResult> {
  const result = await lakehouseRequest("/compliance/query", {
    merchantId,
    filters,
  }) as any;
  if (!result) return { rows: [], rowCount: 0, columns: [] };
  return { rows: result.events ?? [], rowCount: result.total ?? 0, columns: [] };
}

/**
 * Generate a regulatory report (CBN, NDIC, EFCC).
 */
export async function generateRegulatoryReport(params: {
  merchantId: string;
  reportType: "cbn_monthly" | "ndic_quarterly" | "efcc_aml" | "str" | "ctr";
  period: { start: string; end: string };
  format?: "json" | "csv" | "pdf";
}): Promise<{ reportId: string; downloadUrl?: string; status: "queued" | "ready" | "error" }> {
  const result = await lakehouseRequest("/reports/generate", params) as any;
  if (!result) return { reportId: "", status: "error" };
  return {
    reportId: result.reportId ?? "",
    downloadUrl: result.downloadUrl,
    status: result.status ?? "queued",
  };
}

/**
 * Get transaction analytics from the lakehouse (aggregated, historical).
 */
export async function getTransactionAnalytics(
  merchantId: string,
  period: "7d" | "30d" | "90d" | "1y",
  groupBy: "day" | "week" | "month" = "day"
): Promise<Array<{ date: string; volume: number; count: number; currency: string }>> {
  const result = await lakehouseRequest("/analytics/transactions", {
    merchantId,
    period,
    groupBy,
  }) as any;
  return result?.data ?? [];
}

/**
 * Get fraud analytics from the lakehouse.
 */
export async function getFraudAnalytics(
  merchantId: string,
  period: "7d" | "30d" | "90d"
): Promise<{
  totalAlerts: number;
  resolvedAlerts: number;
  falsePositiveRate: number;
  topRiskCategories: Array<{ category: string; count: number }>;
}> {
  const result = await lakehouseRequest("/analytics/fraud", {
    merchantId,
    period,
  }) as any;
  return result ?? {
    totalAlerts: 0,
    resolvedAlerts: 0,
    falsePositiveRate: 0,
    topRiskCategories: [],
  };
}

/**
 * Archive old transactions to the lakehouse (called by settlement job).
 */
export async function archiveTransactions(
  transactions: Array<Record<string, unknown>>
): Promise<{ archived: number; failed: number }> {
  const result = await lakehouseRequest("/archive/transactions", { transactions }) as any;
  return result ?? { archived: 0, failed: transactions.length };
}
