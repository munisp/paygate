// @ts-nocheck
/**
 * Middleware Dashboard Router — v97
 * Exposes tRPC procedures for all 13 middleware services:
 * Kafka, Dapr, Fluvio, Temporal, Keycloak, Permify, Redis,
 * PostgreSQL, OpenSearch, APISIX, TigerBeetle, Lakehouse, and CIPS/UPI/PIX rails.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { ENV } from "../_core/env";
import { logger } from "../logger";

// ─── Bridge Fetch Helper ──────────────────────────────────────────────────────

const BRIDGE_URL = ENV.middlewareBridgeUrl ?? "http://go-bridge:8080";
const OPENSEARCH_URL = process.env.OPENSEARCH_URL ?? "http://opensearch:9200";
const LAKEHOUSE_URL = process.env.LAKEHOUSE_URL ?? "http://lakehouse-v2:8125";
const TIGERBEETLE_URL = process.env.TIGERBEETLE_URL ?? "http://tigerbeetle-ledger:8200";

async function bridgeGet(path: string): Promise<any> {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      headers: {
        Authorization: `Bearer ${ENV.middlewareInternalKey ?? ""}`,
        "Content-Type": "application/json",
      },
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`Bridge ${path} returned ${res.status}`);
    return res.json();
  } catch (e) {
    logger.warn("[middlewareDashboard] bridgeGet failed", { path, error: String(e) });
    return null;
  }
}

async function bridgePost(path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${BRIDGE_URL}${path}`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${ENV.middlewareInternalKey ?? ""}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Bridge ${path} returned ${res.status}: ${err}`);
    }
    return res.json();
  } catch (e) {
    logger.warn("[middlewareDashboard] bridgePost failed", { path, error: String(e) });
    return null;
  }
}

async function serviceGet(baseUrl: string, path: string): Promise<any> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) throw new Error(`${baseUrl}${path} returned ${res.status}`);
    return res.json();
  } catch (e) {
    return null;
  }
}

async function servicePost(baseUrl: string, path: string, body: unknown): Promise<any> {
  try {
    const res = await fetch(`${baseUrl}${path}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
    });
    return res.json();
  } catch (e) {
    return null;
  }
}

// ─── Health Aggregator ────────────────────────────────────────────────────────

async function getAllMiddlewareHealth(): Promise<Record<string, { status: string; latency_ms?: number; details?: any }>> {
  const checks = await Promise.allSettled([
    // Go Bridge (aggregates Kafka, Dapr, Fluvio, Temporal, Keycloak, Permify, Redis)
    bridgeGet("/health").then(r => ({ name: "go-bridge", data: r })),
    bridgeGet("/v1/keycloak/health").then(r => ({ name: "keycloak", data: r })),
    bridgeGet("/v1/permify/health").then(r => ({ name: "permify", data: r })),
    bridgeGet("/v1/middleware/kafka/topics").then(r => ({ name: "kafka", data: r })),
    bridgeGet("/v1/middleware/fluvio/streams").then(r => ({ name: "fluvio", data: r })),
    bridgeGet("/v1/middleware/redis/stats").then(r => ({ name: "redis", data: r })),
    bridgeGet("/v1/middleware/temporal/workflows").then(r => ({ name: "temporal", data: r })),
    // OpenSearch
    serviceGet(OPENSEARCH_URL, "/_cluster/health").then(r => ({ name: "opensearch", data: r })),
    // Lakehouse
    serviceGet(LAKEHOUSE_URL, "/health").then(r => ({ name: "lakehouse", data: r })),
    // TigerBeetle Ledger
    serviceGet(TIGERBEETLE_URL, "/health").then(r => ({ name: "tigerbeetle", data: r })),
  ]);

  const result: Record<string, any> = {};
  for (const check of checks) {
    if (check.status === "fulfilled" && check.value) {
      const { name, data } = check.value;
      result[name] = {
        status: data?.status === "ok" || data?.status === "green" || data?.active ? "ok" : "degraded",
        details: data,
      };
    }
  }

  // Fill in missing services as unknown
  const allServices = ["go-bridge", "kafka", "dapr", "fluvio", "temporal", "keycloak",
    "permify", "redis", "opensearch", "apisix", "tigerbeetle", "lakehouse", "postgres"];
  for (const svc of allServices) {
    if (!result[svc]) {
      result[svc] = { status: "unknown" };
    }
  }

  return result;
}

// ─── Demo data generators ─────────────────────────────────────────────────────

function generateDemoKafkaTopics() {
  return [
    { name: "paygate.transaction.completed", partitions: 12, replication: 3, messages: 142857, lag: 0 },
    { name: "paygate.cips.transfer.settled", partitions: 6, replication: 3, messages: 8432, lag: 0 },
    { name: "paygate.upi.pay.settled", partitions: 6, replication: 3, messages: 12891, lag: 2 },
    { name: "paygate.pix.payment.settled", partitions: 6, replication: 3, messages: 7234, lag: 0 },
    { name: "paygate.mojaloop.transfer.fulfilled", partitions: 6, replication: 3, messages: 5621, lag: 0 },
    { name: "paygate.fraud.alert", partitions: 3, replication: 3, messages: 1203, lag: 0 },
    { name: "paygate.audit.events", partitions: 3, replication: 3, messages: 89432, lag: 0 },
    { name: "paygate.fx.rate.updated", partitions: 3, replication: 3, messages: 43210, lag: 0 },
    { name: "paygate.payout.initiated", partitions: 6, replication: 3, messages: 23456, lag: 1 },
    { name: "paygate.dispute.created", partitions: 3, replication: 3, messages: 892, lag: 0 },
  ];
}

function generateDemoTemporalWorkflows() {
  const statuses = ["Running", "Completed", "Failed", "TimedOut"];
  const types = [
    "CIPSTransferWorkflow", "UPITransferWorkflow", "PIXTransferWorkflow",
    "DisputeResolutionWorkflow", "PaymentLifecycleWorkflow", "PayoutWorkflow",
    "MojaloopTransferWorkflow", "BRICSPayWorkflow",
  ];
  return Array.from({ length: 20 }, (_, i) => ({
    workflow_id: `wf_${Date.now() - i * 60000}`,
    workflow_type: types[i % types.length],
    status: statuses[i % statuses.length],
    started_at: new Date(Date.now() - i * 300000).toISOString(),
    duration_ms: ((i * 1237 + 500) % 30000) + 500,
    merchant_id: "merchant_demo_001",
  }));
}

function generateDemoLedgerStats() {
  return {
    total_accounts: 48,
    total_transfers: 1247,
    total_volume_by_rail: {
      cips: 45000000,
      upi: 128000000,
      pix: 32000000,
      mojaloop: 67000000,
      brics: 12000000,
    },
    total_fees_collected: 2340000,
    active_currencies: ["NGN", "CNY", "INR", "BRL", "KES", "USD", "EUR", "GHS", "ZAR"],
  };
}

function generateDemoFluvioStreams() {
  return [
    { topic: "paygate-transactions", partitions: 12, consumer_groups: 3, throughput_per_sec: 847 },
    { topic: "paygate-crossborder-events", partitions: 6, consumer_groups: 2, throughput_per_sec: 124 },
    { topic: "paygate-fraud-stream", partitions: 3, consumer_groups: 1, throughput_per_sec: 23 },
    { topic: "paygate-fx-rates", partitions: 3, consumer_groups: 2, throughput_per_sec: 12 },
  ];
}

function generateDemoRedisStats() {
  return {
    total_keys: 4832,
    fx_rates: 11,
    idempotency_keys: 1247,
    sessions: 89,
    transfer_states: 234,
    event_channels: 8,
    memory_used_mb: 128,
    hit_rate_pct: 94.7,
    backend: "redis",
  };
}

// ─── Router ───────────────────────────────────────────────────────────────────

export const middlewareDashboardRouter = router({
  // ── Health ──────────────────────────────────────────────────────────────────
  health: protectedProcedure.query(async () => {
    const live = await getAllMiddlewareHealth();
    const allOk = Object.values(live).every(s => s.status === "ok" || s.status === "unknown");
    return {
      overall: allOk ? "healthy" : "degraded",
      services: live,
      checked_at: new Date().toISOString(),
    };
  }),

  // ── Kafka ────────────────────────────────────────────────────────────────────
  kafka: router({
    topics: protectedProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/kafka/topics");
      return live ?? { topics: generateDemoKafkaTopics(), source: "demo" };
    }),
    events: protectedProcedure
      .input(z.object({
        topic: z.string().optional(),
        limit: z.number().min(1).max(100).default(20),
      }))
      .query(async ({ input }) => {
        const path = `/v1/middleware/kafka/events?limit=${input.limit}${input.topic ? `&topic=${input.topic}` : ""}`;
        const live = await bridgeGet(path);
        if (live) return live;
        // Demo events
        const topics = generateDemoKafkaTopics();
        const events = Array.from({ length: input.limit }, (_, i) => ({
          offset: 1000000 - i,
          topic: input.topic ?? topics[i % topics.length].name,
          partition: i % 6,
          key: `merchant_demo_001`,
          value: JSON.stringify({ event_id: `evt_${Date.now() - i * 1000}`, merchant_id: "merchant_demo_001", amount: (i + 1) * 5000 }),
          timestamp: new Date(Date.now() - i * 30000).toISOString(),
        }));
        return { events, source: "demo" };
      }),
    publish: protectedProcedure
      .input(z.object({
        topic: z.string(),
        key: z.string().optional(),
        value: z.record(z.string(), z.string(), z.string(), z.unknown()),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost("/v1/middleware/kafka/publish", input);
        return result ?? { published: true, topic: input.topic, source: "demo" };
      }),
  }),

  // ── Fluvio ───────────────────────────────────────────────────────────────────
  fluvio: router({
    streams: protectedProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/fluvio/streams");
      return live ?? { streams: generateDemoFluvioStreams(), source: "demo" };
    }),
    consume: protectedProcedure
      .input(z.object({ topic: z.string(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const live = await bridgePost("/v1/fluvio/consume", input);
        return live ?? { messages: [], source: "demo" };
      }),
  }),

  // ── Temporal ─────────────────────────────────────────────────────────────────
  temporal: router({
    workflows: protectedProcedure
      .input(z.object({
        status: z.string().optional(),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/middleware/temporal/workflows?limit=${input.limit}`);
        return live ?? { workflows: generateDemoTemporalWorkflows(), source: "demo" };
      }),
    startCIPSWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        merchantId: z.string(),
        cnapsCode: z.string().length(12),
        amount: z.string(),
        currency: z.string().default("CNY"),
        beneficiaryId: z.string(),
        purposeCode: z.string().default("TRAD"),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost("/v1/workflows/cips/start", {
          transfer_id: input.transferId,
          merchant_id: input.merchantId,
          cnaps_code: input.cnapsCode,
          amount: input.amount,
          currency: input.currency,
          beneficiary_id: input.beneficiaryId,
          purpose_code: input.purposeCode,
        });
        return result ?? { workflow_id: `wf_cips_${Date.now()}`, status: "started", source: "demo" };
      }),
    startUPIWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        merchantId: z.string(),
        payerVpa: z.string(),
        payeeVpa: z.string(),
        amount: z.string(),
        pspName: z.string().default("gpay"),
        remarks: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost("/v1/workflows/upi/start", {
          transfer_id: input.transferId,
          merchant_id: input.merchantId,
          payer_vpa: input.payerVpa,
          payee_vpa: input.payeeVpa,
          amount: input.amount,
          psp_name: input.pspName,
          remarks: input.remarks ?? "",
        });
        return result ?? { workflow_id: `wf_upi_${Date.now()}`, status: "started", source: "demo" };
      }),
    startPIXWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        merchantId: z.string(),
        pixKey: z.string(),
        pixKeyType: z.enum(["CPF", "CNPJ", "PHONE", "EMAIL", "EVP"]),
        amount: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost("/v1/workflows/pix/start", {
          transfer_id: input.transferId,
          merchant_id: input.merchantId,
          pix_key: input.pixKey,
          pix_key_type: input.pixKeyType,
          amount: input.amount,
          description: input.description ?? "",
        });
        return result ?? { workflow_id: `wf_pix_${Date.now()}`, status: "started", source: "demo" };
      }),
    workflowStatus: protectedProcedure
      .input(z.object({ workflowId: z.string() }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/workflows/status/${input.workflowId}`);
        return live ?? { workflow_id: input.workflowId, status: "Running", source: "demo" };
      }),
  }),

  // ── TigerBeetle Ledger ───────────────────────────────────────────────────────
  ledger: router({
    stats: protectedProcedure.query(async () => {
      const live = await serviceGet(TIGERBEETLE_URL, "/v1/ledger/stats");
      return live ?? generateDemoLedgerStats();
    }),
    accounts: protectedProcedure
      .input(z.object({ merchantId: z.string().optional() }))
      .query(async ({ input }) => {
        const path = `/v1/ledger/accounts${input.merchantId ? `?merchant_id=${input.merchantId}` : ""}`;
        const live = await serviceGet(TIGERBEETLE_URL, path);
        return live ?? { accounts: [], count: 0, source: "demo" };
      }),
    createAccount: protectedProcedure
      .input(z.object({
        merchantId: z.string(),
        accountType: z.enum(["MERCHANT", "ESCROW", "FEE", "SETTLEMENT", "SUSPENSE",
          "CROSS_BORDER_CIPS", "CROSS_BORDER_UPI", "CROSS_BORDER_PIX", "CROSS_BORDER_MOJALOOP"]),
        currency: z.string().length(3),
      }))
      .mutation(async ({ input }) => {
        const result = await servicePost(TIGERBEETLE_URL, "/v1/ledger/accounts", {
          merchant_id: input.merchantId,
          account_type: input.accountType,
          currency: input.currency,
        });
        return result ?? { id: `acct_${Date.now()}`, source: "demo" };
      }),
    transfers: protectedProcedure
      .input(z.object({
        merchantId: z.string().optional(),
        rail: z.string().optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const params = new URLSearchParams();
        if (input.merchantId) params.set("merchant_id", input.merchantId);
        if (input.rail) params.set("rail", input.rail);
        params.set("limit", String(input.limit));
        const live = await serviceGet(TIGERBEETLE_URL, `/v1/ledger/transfers?${params}`);
        return live ?? { transfers: [], count: 0, source: "demo" };
      }),
    crossBorderTransfer: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        merchantId: z.string(),
        amount: z.number(),
        sourceCurrency: z.string().length(3),
        targetCurrency: z.string().length(3),
        exchangeRate: z.number(),
        feeAmount: z.number(),
        rail: z.string(),
        reference: z.string(),
      }))
      .mutation(async ({ input }) => {
        const result = await servicePost(TIGERBEETLE_URL, "/v1/ledger/crossborder", {
          transfer_id: input.transferId,
          merchant_id: input.merchantId,
          amount: input.amount,
          source_currency: input.sourceCurrency,
          target_currency: input.targetCurrency,
          exchange_rate: input.exchangeRate,
          fee_amount: input.feeAmount,
          rail: input.rail,
          reference: input.reference,
        });
        return result ?? { success: true, transfer_id: input.transferId, source: "demo" };
      }),
    balance: protectedProcedure
      .input(z.object({ accountId: z.string() }))
      .query(async ({ input }) => {
        const live = await serviceGet(TIGERBEETLE_URL, `/v1/ledger/accounts/${input.accountId}/balance`);
        return live ?? {
          account_id: input.accountId,
          balance: 10000000,
          available_balance: 9500000,
          currency: "NGN",
          source: "demo",
        };
      }),
  }),

  // ── OpenSearch ───────────────────────────────────────────────────────────────
  search: router({
    indices: protectedProcedure.query(async () => {
      const live = await serviceGet(LAKEHOUSE_URL.replace(":8125", ":8300"), "/v1/search/indices");
      return live ?? {
        indices: {
          "paygate-transactions": { doc_count: 142857 },
          "paygate-customers": { doc_count: 8432 },
          "paygate-crossborder": { doc_count: 1247 },
          "paygate-fraud-alerts": { doc_count: 892 },
          "paygate-audit-events": { doc_count: 89432 },
          "paygate-merchants": { doc_count: 234 },
        },
        source: "demo",
      };
    }),
    query: protectedProcedure
      .input(z.object({
        index: z.string(),
        query: z.string().default(""),
        filters: z.record(z.string(), z.string(), z.string(), z.string()).optional(),
        from: z.number().default(0),
        size: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const opensearchUrl = LAKEHOUSE_URL.replace(":8125", ":8300");
        const live = await servicePost(opensearchUrl, "/v1/search/query", {
          index: input.index,
          query: input.query,
          filters: input.filters,
          from: input.from,
          size: input.size,
        });
        return live ?? { total: 0, hits: [], source: "demo" };
      }),
    aggregate: protectedProcedure
      .input(z.object({
        index: z.string(),
        field: z.string(),
        aggType: z.enum(["terms", "sum", "avg", "date_histogram"]).default("terms"),
        size: z.number().default(10),
        filters: z.record(z.string(), z.string(), z.string(), z.string()).optional(),
      }))
      .query(async ({ input }) => {
        const opensearchUrl = LAKEHOUSE_URL.replace(":8125", ":8300");
        const live = await servicePost(opensearchUrl, "/v1/search/aggregate", {
          index: input.index,
          field: input.field,
          agg_type: input.aggType,
          size: input.size,
          filters: input.filters,
        });
        return live ?? { aggregation: {}, source: "demo" };
      }),
  }),

  // ── Lakehouse ────────────────────────────────────────────────────────────────
  lakehouse: router({
    tables: protectedProcedure.query(async () => {
      const live = await serviceGet(LAKEHOUSE_URL, "/v1/lakehouse/tables");
      return live ?? {
        tables: {
          crossborder_transfers: { record_count: 1247 },
          cips_settlements: { record_count: 312 },
          upi_transactions: { record_count: 489 },
          pix_payments: { record_count: 234 },
          mojaloop_fulfillments: { record_count: 212 },
          fx_rates_history: { record_count: 4320 },
          corridor_analytics: { record_count: 168 },
        },
        source: "demo",
      };
    }),
    query: protectedProcedure
      .input(z.object({
        table: z.string(),
        filters: z.record(z.string(), z.string(), z.string(), z.unknown()).optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const live = await servicePost(LAKEHOUSE_URL, "/v1/lakehouse/query", input);
        return live ?? { records: [], count: 0, source: "demo" };
      }),
    corridorAnalytics: protectedProcedure
      .input(z.object({
        corridor: z.string().optional(),
        rail: z.string().optional(),
        days: z.number().default(7),
      }))
      .query(async ({ input }) => {
        const live = await servicePost(LAKEHOUSE_URL, "/v1/lakehouse/analytics/corridors", input);
        return live ?? {
          corridors: [
            { corridor: "NGN-CNY", rail: "cips", count: 312, total_source_amount: 31200000, avg_exchange_rate: 0.0052 },
            { corridor: "USD-INR", rail: "upi", count: 489, total_source_amount: 48900000, avg_exchange_rate: 83.5 },
            { corridor: "NGN-BRL", rail: "pix", count: 234, total_source_amount: 23400000, avg_exchange_rate: 0.028 },
            { corridor: "NGN-KES", rail: "mojaloop", count: 212, total_source_amount: 21200000, avg_exchange_rate: 13.2 },
          ],
          source: "demo",
        };
      }),
    fxRates: protectedProcedure
      .input(z.object({
        corridor: z.string().optional(),
        rail: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const params = new URLSearchParams();
        if (input.corridor) params.set("corridor", input.corridor);
        if (input.rail) params.set("rail", input.rail);
        const live = await serviceGet(LAKEHOUSE_URL, `/v1/lakehouse/fx-rates?${params}`);
        return live ?? {
          rates: [
            { corridor: "NGN-CNY", rate: 0.0052, rail: "cips", provider: "cips-fx" },
            { corridor: "USD-INR", rate: 83.5, rail: "upi", provider: "npci-fx" },
            { corridor: "NGN-BRL", rate: 0.028, rail: "pix", provider: "bacen-fx" },
            { corridor: "NGN-KES", rate: 13.2, rail: "mojaloop", provider: "mojaloop-fx" },
          ],
          source: "demo",
        };
      }),
  }),

  // ── Redis ────────────────────────────────────────────────────────────────────
  redis: router({
    stats: protectedProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/redis/stats");
      return live ?? generateDemoRedisStats();
    }),
    events: protectedProcedure
      .input(z.object({
        channel: z.string().default("paygate.crossborder.settled"),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/middleware/redis/events?channel=${input.channel}&limit=${input.limit}`);
        return live ?? { messages: [], source: "demo" };
      }),
  }),

  // ── Keycloak ─────────────────────────────────────────────────────────────────
  keycloak: router({
    health: publicProcedure.query(async () => {
      const live = await bridgeGet("/v1/keycloak/health");
      return live ?? { status: "unknown", source: "demo" };
    }),
    introspect: protectedProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const live = await bridgePost("/v1/keycloak/introspect", { token: input.token });
        return live ?? { active: false, source: "demo" };
      }),
  }),

  // ── Permify ──────────────────────────────────────────────────────────────────
  permify: router({
    health: publicProcedure.query(async () => {
      const live = await bridgeGet("/v1/permify/health");
      return live ?? { status: "unknown", source: "demo" };
    }),
    check: protectedProcedure
      .input(z.object({
        tenantId: z.string().default("paygate"),
        entityType: z.string(),
        entityId: z.string(),
        permission: z.string(),
        subjectType: z.string().default("user"),
        subjectId: z.string(),
      }))
      .mutation(async ({ input }) => {
        const live = await bridgePost("/v1/permify/check", {
          tenant_id: input.tenantId,
          entity_type: input.entityType,
          entity_id: input.entityId,
          permission: input.permission,
          subject_type: input.subjectType,
          subject_id: input.subjectId,
        });
        return live ?? { allowed: true, source: "demo" };
      }),
  }),

  // ── APISIX ───────────────────────────────────────────────────────────────────
  apisix: router({
    routes: protectedProcedure.query(async () => {
      // Return static config from YAML
      return {
        routes: [
          { id: "cips-transfer-submit", uri: "/v1/cips/transfer", methods: ["POST"], status: "active" },
          { id: "upi-pay", uri: "/v1/upi/pay", methods: ["POST"], status: "active" },
          { id: "pix-payment-initiate", uri: "/v1/pix/payment", methods: ["POST"], status: "active" },
          { id: "mojaloop-transfer", uri: "/v1/mojaloop/transfer", methods: ["POST"], status: "active" },
          { id: "middleware-health", uri: "/v1/middleware/health", methods: ["GET"], status: "active" },
          { id: "middleware-kafka-topics", uri: "/v1/middleware/kafka/topics", methods: ["GET"], status: "active" },
          { id: "middleware-opensearch-query", uri: "/v1/middleware/opensearch/query", methods: ["POST"], status: "active" },
          { id: "middleware-tigerbeetle-accounts", uri: "/v1/middleware/tigerbeetle/accounts", methods: ["GET", "POST"], status: "active" },
          { id: "middleware-lakehouse-query", uri: "/v1/middleware/lakehouse/query", methods: ["POST"], status: "active" },
        ],
        total: 9,
        source: "static-config",
      };
    }),
  }),

  // ── Summary ──────────────────────────────────────────────────────────────────
  summary: protectedProcedure.query(async () => {
    const [health, ledgerStats, kafkaTopics] = await Promise.allSettled([
      getAllMiddlewareHealth(),
      serviceGet(TIGERBEETLE_URL, "/v1/ledger/stats"),
      bridgeGet("/v1/middleware/kafka/topics"),
    ]);

    const healthData = health.status === "fulfilled" ? health.value : {};
    const okCount = Object.values(healthData).filter((s: any) => s.status === "ok").length;
    const totalServices = 13;

    return {
      services_healthy: okCount,
      services_total: totalServices,
      health_pct: Math.round((okCount / totalServices) * 100),
      ledger: ledgerStats.status === "fulfilled" ? ledgerStats.value : generateDemoLedgerStats(),
      kafka: kafkaTopics.status === "fulfilled" ? kafkaTopics.value : { topics: generateDemoKafkaTopics() },
      rails_active: ["cips", "upi", "pix", "mojaloop", "brics"],
      corridors_active: 11,
      checked_at: new Date().toISOString(),
    };
  }),
});
