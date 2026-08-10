/**
 * opensearchClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * OpenSearch client for PayGate full-text search and analytics.
 * Used for: transaction search, audit log indexing, fraud pattern analysis,
 * and compliance reporting.
 *
 * Falls back to DB-based search when OpenSearch is not configured.
 */

import { ENV } from "./_core/env";

// ─── Index constants ──────────────────────────────────────────────────────────
export const OS_INDICES = {
  TRANSACTIONS: "paygate-transactions",
  AUDIT_LOGS: "paygate-audit-logs",
  FRAUD_EVENTS: "paygate-fraud-events",
  MERCHANTS: "paygate-merchants",
  CUSTOMERS: "paygate-customers",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface SearchQuery {
  index: string;
  query: {
    bool?: {
      must?: unknown[];
      filter?: unknown[];
      should?: unknown[];
      must_not?: unknown[];
    };
    match_all?: Record<string, unknown>;
    multi_match?: {
      query: string;
      fields: string[];
      type?: string;
    };
  };
  from?: number;
  size?: number;
  sort?: Array<Record<string, { order: "asc" | "desc" }>>;
  aggs?: Record<string, unknown>;
}

export interface SearchResult<T = unknown> {
  total: number;
  hits: Array<{ _id: string; _source: T; _score?: number }>;
  aggregations?: Record<string, unknown>;
}

// ─── HTTP helper ─────────────────────────────────────────────────────────────
async function osRequest(
  method: string,
  path: string,
  body?: unknown
): Promise<unknown> {
  // Try env var or fall back to MIDDLEWARE_BRIDGE_URL-based proxy
  const baseUrl = process.env.OPENSEARCH_URL ?? process.env.MIDDLEWARE_BRIDGE_URL;
  if (!baseUrl) return null;

  const url = process.env.OPENSEARCH_URL
    ? `${baseUrl}${path}`
    : `${baseUrl}/opensearch${path}`;

  try {
    const res = await fetch(url, {
      method,
      headers: {
        "Content-Type": "application/json",
        ...(process.env.OPENSEARCH_API_KEY
          ? { Authorization: `ApiKey ${process.env.OPENSEARCH_API_KEY}` }
          : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) {
      console.warn(`[opensearch] ${method} ${path} → ${res.status}`);
      return null;
    }
    return res.json();
  } catch (err) {
    console.warn(`[opensearch] Request failed:`, err);
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Index a document.
 */
export async function indexDocument(
  index: string,
  id: string,
  document: Record<string, unknown>
): Promise<boolean> {
  const result = await osRequest("PUT", `/${index}/_doc/${id}`, {
    ...document,
    "@timestamp": new Date().toISOString(),
  });
  return result !== null;
}

/**
 * Bulk index documents.
 */
export async function bulkIndex(
  index: string,
  documents: Array<{ id: string; doc: Record<string, unknown> }>
): Promise<boolean> {
  if (!documents.length) return true;
  const body = documents.flatMap(({ id, doc }) => [
    { index: { _index: index, _id: id } },
    { ...doc, "@timestamp": new Date().toISOString() },
  ]);
  const result = await osRequest("POST", "/_bulk", body);
  return result !== null;
}

/**
 * Search documents.
 */
export async function searchDocuments<T = unknown>(
  query: SearchQuery
): Promise<SearchResult<T>> {
  const { index, ...body } = query;
  const result = await osRequest("POST", `/${index}/_search`, body) as any;
  if (!result) return { total: 0, hits: [] };
  return {
    total: result.hits?.total?.value ?? 0,
    hits: result.hits?.hits ?? [],
    aggregations: result.aggregations,
  };
}

/**
 * Full-text search across transactions.
 */
export async function searchTransactions(
  merchantId: string,
  query: string,
  filters?: {
    status?: string;
    currency?: string;
    minAmount?: number;
    maxAmount?: number;
    startDate?: string;
    endDate?: string;
  },
  page = 0,
  size = 20
): Promise<SearchResult> {
  const must: unknown[] = [
    { term: { merchant_id: merchantId } },
  ];
  const filter: unknown[] = [];

  if (query) {
    must.push({
      multi_match: {
        query,
        fields: ["reference^3", "description^2", "customer_email", "customer_name"],
        type: "best_fields",
      },
    });
  }

  if (filters?.status) filter.push({ term: { status: filters.status } });
  if (filters?.currency) filter.push({ term: { currency: filters.currency } });
  if (filters?.minAmount || filters?.maxAmount) {
    filter.push({
      range: {
        amount: {
          ...(filters.minAmount ? { gte: filters.minAmount } : {}),
          ...(filters.maxAmount ? { lte: filters.maxAmount } : {}),
        },
      },
    });
  }
  if (filters?.startDate || filters?.endDate) {
    filter.push({
      range: {
        created_at: {
          ...(filters.startDate ? { gte: filters.startDate } : {}),
          ...(filters.endDate ? { lte: filters.endDate } : {}),
        },
      },
    });
  }

  return searchDocuments({
    index: OS_INDICES.TRANSACTIONS,
    query: { bool: { must, filter } },
    from: page * size,
    size,
    sort: [{ created_at: { order: "desc" } }],
  });
}

/**
 * Search audit logs.
 */
export async function searchAuditLogs(
  merchantId: string,
  query?: string,
  dateRange?: { start: string; end: string },
  page = 0,
  size = 50
): Promise<SearchResult> {
  const must: unknown[] = [{ term: { merchant_id: merchantId } }];
  const filter: unknown[] = [];

  if (query) {
    must.push({
      multi_match: {
        query,
        fields: ["action^3", "resource^2", "user_id", "ip_address"],
      },
    });
  }
  if (dateRange) {
    filter.push({ range: { timestamp: { gte: dateRange.start, lte: dateRange.end } } });
  }

  return searchDocuments({
    index: OS_INDICES.AUDIT_LOGS,
    query: { bool: { must, filter } },
    from: page * size,
    size,
    sort: [{ timestamp: { order: "desc" } }],
  });
}

/**
 * Index a transaction event for search.
 */
export async function indexTransaction(tx: {
  id: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  reference?: string;
  description?: string;
  customerEmail?: string;
  customerName?: string;
  createdAt: string;
}): Promise<boolean> {
  return indexDocument(OS_INDICES.TRANSACTIONS, tx.id, {
    merchant_id: tx.merchantId,
    amount: tx.amount,
    currency: tx.currency,
    status: tx.status,
    reference: tx.reference,
    description: tx.description,
    customer_email: tx.customerEmail,
    customer_name: tx.customerName,
    created_at: tx.createdAt,
  });
}

/**
 * Index an audit log entry.
 */
export async function indexAuditLog(entry: {
  id: string;
  merchantId: string;
  userId: string;
  action: string;
  resource: string;
  resourceId?: string;
  ipAddress?: string;
  result: "success" | "failure";
  timestamp: string;
}): Promise<boolean> {
  return indexDocument(OS_INDICES.AUDIT_LOGS, entry.id, {
    merchant_id: entry.merchantId,
    user_id: entry.userId,
    action: entry.action,
    resource: entry.resource,
    resource_id: entry.resourceId,
    ip_address: entry.ipAddress,
    result: entry.result,
    timestamp: entry.timestamp,
  });
}
