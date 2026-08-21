// @ts-nocheck
/**
 * Middleware Dashboard Router — v97
 * Exposes tRPC procedures for all 13 middleware services:
 * Kafka, Dapr, Fluvio, Temporal, Keycloak, Permify, Redis,
 * PostgreSQL, OpenSearch, APISIX, TigerBeetle, Lakehouse, and CIPS/UPI/PIX rails.
 */
import { z } from "zod";
import { router, protectedProcedure, publicProcedure } from "../_core/trpc";
import { TRPCError } from "@trpc/server";
import { eq } from "drizzle-orm";
import { ENV } from "../_core/env";
import { logger } from "../logger";
import { demoOrFail } from "../_core/demoData";
import { getDb, getUserByOpenId, getMerchantByOwnerId } from "../db";

// ─── AuthZ helpers ────────────────────────────────────────────────────────────

/**
 * Resolve the merchant that owns the authenticated user. Client-supplied
 * merchant IDs are never trusted for money movement or merchant-scoped data.
 */
async function resolveMerchantId(openId: string): Promise<string> {
  const user = await getUserByOpenId(openId);
  if (!user) throw new TRPCError({ code: "UNAUTHORIZED", message: "User not found" });
  const merchant = await getMerchantByOwnerId(user.id);
  if (!merchant) throw new TRPCError({ code: "FORBIDDEN", message: "No merchant account for this user" });
  return merchant.id;
}

/**
 * Platform-ops guard — admin role re-checked from the DB on every call
 * (same pattern as server/adminRouter.ts). Used for platform-level middleware
 * operations: ledger writes, workflow control, cross-tenant search.
 */
const adminProcedure = protectedProcedure.use(async ({ ctx, next }) => {
  const db = await getDb();
  if (!db) throw new TRPCError({ code: "INTERNAL_SERVER_ERROR", message: "DB unavailable" });
  const { users } = await import("../../drizzle/schema");
  const [user] = await db.select({ role: users.role })
    .from(users)
    .where(eq(users.openId, ctx.user.openId))
    .limit(1);
  if (!user || user.role !== "admin") {
    throw new TRPCError({ code: "FORBIDDEN", message: "Admin access required" });
  }
  return next({ ctx });
});

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
  // Platform-wide infra health — admin only.
  health: adminProcedure.query(async () => {
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
    // Kafka topic/event data is platform-wide message-bus data — admin only.
    topics: adminProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/kafka/topics");
      return live ?? demoOrFail({ topics: generateDemoKafkaTopics() }, "middlewareDashboard.kafka.topics");
    }),
    events: adminProcedure
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
        return demoOrFail({ events }, "middlewareDashboard.kafka.events");
      }),
    publish: adminProcedure
      .input(z.object({
        topic: z.string(),
        key: z.string().optional(),
        value: z.record(z.string(), z.string(), z.string(), z.unknown()),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost("/v1/middleware/kafka/publish", input);
        return result ?? demoOrFail({ published: true, topic: input.topic, message: "SIMULATED — no real action taken" }, "middlewareDashboard.kafka.publish");
      }),
  }),

  // ── Fluvio ───────────────────────────────────────────────────────────────────
  fluvio: router({
    // Platform-wide stream data — admin only.
    streams: adminProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/fluvio/streams");
      return live ?? demoOrFail({ streams: generateDemoFluvioStreams() }, "middlewareDashboard.fluvio.streams");
    }),
    consume: adminProcedure
      .input(z.object({ topic: z.string(), limit: z.number().default(10) }))
      .query(async ({ input }) => {
        const live = await bridgePost("/v1/fluvio/consume", input);
        return live ?? demoOrFail({ messages: [] }, "middlewareDashboard.fluvio.consume");
      }),
  }),

  // ── Temporal ─────────────────────────────────────────────────────────────────
  temporal: router({
    // Platform-wide workflow listing — admin only (consistent with
    // listWorkflows/workflowStatus below).
    workflows: adminProcedure
      .input(z.object({
        status: z.string().optional(),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/middleware/temporal/workflows?limit=${input.limit}`);
        return live ?? demoOrFail({ workflows: generateDemoTemporalWorkflows() }, "middlewareDashboard.temporal.workflows");
      }),
    startCIPSWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        cnapsCode: z.string().length(12),
        amount: z.string(),
        currency: z.string().default("CNY"),
        beneficiaryId: z.string(),
        purposeCode: z.string().default("TRAD"),
      }))
      .mutation(async ({ input, ctx }) => {
        // Merchant is resolved server-side — clients cannot start money
        // movement on behalf of another merchant.
        const merchantId = await resolveMerchantId(ctx.user.openId);
        const result = await bridgePost("/v1/workflows/cips/start", {
          transfer_id: input.transferId,
          merchant_id: merchantId,
          cnaps_code: input.cnapsCode,
          amount: input.amount,
          currency: input.currency,
          beneficiary_id: input.beneficiaryId,
          purpose_code: input.purposeCode,
        });
        return result ?? demoOrFail({ workflow_id: `wf_cips_${Date.now()}`, status: "started", message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.startCIPSWorkflow");
      }),
    startUPIWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        payerVpa: z.string(),
        payeeVpa: z.string(),
        amount: z.string(),
        pspName: z.string().default("gpay"),
        remarks: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchantId = await resolveMerchantId(ctx.user.openId);
        const result = await bridgePost("/v1/workflows/upi/start", {
          transfer_id: input.transferId,
          merchant_id: merchantId,
          payer_vpa: input.payerVpa,
          payee_vpa: input.payeeVpa,
          amount: input.amount,
          psp_name: input.pspName,
          remarks: input.remarks ?? "",
        });
        return result ?? demoOrFail({ workflow_id: `wf_upi_${Date.now()}`, status: "started", message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.startUPIWorkflow");
      }),
    startPIXWorkflow: protectedProcedure
      .input(z.object({
        transferId: z.string(),
        pixKey: z.string(),
        pixKeyType: z.enum(["CPF", "CNPJ", "PHONE", "EMAIL", "EVP"]),
        amount: z.string(),
        description: z.string().optional(),
      }))
      .mutation(async ({ input, ctx }) => {
        const merchantId = await resolveMerchantId(ctx.user.openId);
        const result = await bridgePost("/v1/workflows/pix/start", {
          transfer_id: input.transferId,
          merchant_id: merchantId,
          pix_key: input.pixKey,
          pix_key_type: input.pixKeyType,
          amount: input.amount,
          description: input.description ?? "",
        });
        return result ?? demoOrFail({ workflow_id: `wf_pix_${Date.now()}`, status: "started", message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.startPIXWorkflow");
      }),
    // Workflow metadata is platform ops data (consistent with the wave225
    // getTemporalStatus hardening) — admin only.
    workflowStatus: adminProcedure
      .input(z.object({ workflowId: z.string() }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/workflows/status/${input.workflowId}`);
        return live ?? demoOrFail({ workflow_id: input.workflowId, status: "Running" }, "middlewareDashboard.temporal.workflowStatus");
      }),
    /** List all active Temporal workflows (platform ops view — admin only;
     *  the optional merchantId filter lets admins drill into one merchant) */
    listWorkflows: adminProcedure
      .input(z.object({
        merchantId: z.string().optional(),
        limit: z.number().min(1).max(200).default(50),
        status: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const qs = new URLSearchParams();
        if (input.merchantId) qs.set("merchant_id", input.merchantId);
        if (input.status) qs.set("status", input.status);
        qs.set("limit", String(input.limit));
        const live = await bridgeGet(`/v1/temporal/workflows?${qs.toString()}`);
        return live ?? demoOrFail({ workflows: [], total: 0 }, "middlewareDashboard.temporal.listWorkflows");
      }),
    /** Force-terminate a stuck or runaway Temporal workflow (admin escape hatch) */
    forceTerminate: adminProcedure
      .input(z.object({
        workflowId: z.string(),
        reason: z.string().min(1).max(500),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost(`/v1/temporal/workflows/${input.workflowId}/terminate`, {
          reason: input.reason,
        });
        if (!result) return demoOrFail({ terminated: false, workflowId: input.workflowId, message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.forceTerminate");
        return { terminated: true, workflowId: input.workflowId, ...result };
      }),
    /** Signal a Temporal workflow (e.g., approve/reject a pending step) */
    signal: adminProcedure
      .input(z.object({
        workflowId: z.string(),
        signalName: z.string(),
        payload: z.record(z.unknown()).optional(),
      }))
      .mutation(async ({ input }) => {
        const result = await bridgePost(`/v1/temporal/workflows/${input.workflowId}/signal`, {
          signal_name: input.signalName,
          input: input.payload ?? {},
        });
        if (!result) return demoOrFail({ signaled: false, workflowId: input.workflowId, message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.signal");
        return { signaled: true, workflowId: input.workflowId, ...result };
      }),
    /** Cancel a Temporal workflow gracefully */
    cancel: adminProcedure
      .input(z.object({ workflowId: z.string() }))
      .mutation(async ({ input }) => {
        const result = await bridgePost(`/v1/temporal/workflows/${input.workflowId}/cancel`, {});
        if (!result) return demoOrFail({ cancelled: false, workflowId: input.workflowId, message: "SIMULATED — no real action taken" }, "middlewareDashboard.temporal.cancel");
        return { cancelled: true, workflowId: input.workflowId, ...result };
      }),
  }),

  // ── TigerBeetle Ledger ───────────────────────────────────────────────────────
  ledger: router({
    // Platform-wide ledger stats (volumes across all rails/merchants) — admin only.
    stats: adminProcedure.query(async () => {
      const live = await serviceGet(TIGERBEETLE_URL, "/v1/ledger/stats");
      return live ?? demoOrFail(generateDemoLedgerStats(), "middlewareDashboard.ledger.stats");
    }),
    // TigerBeetle ledger endpoints are platform ledger operations (the
    // TigerBeetle service itself is unauthenticated). Restricted to admins;
    // the optional merchantId filter is an admin drill-down, not a tenant
    // boundary a caller can choose.
    accounts: adminProcedure
      .input(z.object({ merchantId: z.string().optional() }))
      .query(async ({ input }) => {
        const path = `/v1/ledger/accounts${input.merchantId ? `?merchant_id=${input.merchantId}` : ""}`;
        const live = await serviceGet(TIGERBEETLE_URL, path);
        return live ?? demoOrFail({ accounts: [], count: 0 }, "middlewareDashboard.ledger.accounts");
      }),
    createAccount: adminProcedure
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
        return result ?? demoOrFail({ id: `acct_${Date.now()}`, message: "SIMULATED — no real action taken" }, "middlewareDashboard.ledger.createAccount");
      }),
    transfers: adminProcedure
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
        return live ?? demoOrFail({ transfers: [], count: 0 }, "middlewareDashboard.ledger.transfers");
      }),
    crossBorderTransfer: adminProcedure
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
        return result ?? demoOrFail({ success: true, transfer_id: input.transferId, message: "SIMULATED — no real action taken" }, "middlewareDashboard.ledger.crossBorderTransfer");
      }),
    balance: adminProcedure
      .input(z.object({ accountId: z.string() }))
      .query(async ({ input }) => {
        const live = await serviceGet(TIGERBEETLE_URL, `/v1/ledger/accounts/${input.accountId}/balance`);
        return live ?? demoOrFail({
          account_id: input.accountId,
          balance: 10000000,
          available_balance: 9500000,
          currency: "NGN",
        }, "middlewareDashboard.ledger.balance");
      }),
  }),

  // ── OpenSearch ───────────────────────────────────────────────────────────────
  // These endpoints query arbitrary platform-wide financial indices
  // (transactions, customers, fraud alerts, audit events) with no tenant
  // filtering in the backing service — ops-dashboard functionality, admin only.
  search: router({
    indices: adminProcedure.query(async () => {
      const live = await serviceGet(LAKEHOUSE_URL.replace(":8125", ":8300"), "/v1/search/indices");
      return live ?? demoOrFail({
        indices: {
          "paygate-transactions": { doc_count: 142857 },
          "paygate-customers": { doc_count: 8432 },
          "paygate-crossborder": { doc_count: 1247 },
          "paygate-fraud-alerts": { doc_count: 892 },
          "paygate-audit-events": { doc_count: 89432 },
          "paygate-merchants": { doc_count: 234 },
        },
      }, "middlewareDashboard.search.indices");
    }),
    query: adminProcedure
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
        return live ?? demoOrFail({ total: 0, hits: [] }, "middlewareDashboard.search.query");
      }),
    aggregate: adminProcedure
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
        return live ?? demoOrFail({ aggregation: {} }, "middlewareDashboard.search.aggregate");
      }),
  }),

  // ── Lakehouse ────────────────────────────────────────────────────────────────
  lakehouse: router({
    // Platform-wide analytics warehouse data — admin only.
    tables: adminProcedure.query(async () => {
      const live = await serviceGet(LAKEHOUSE_URL, "/v1/lakehouse/tables");
      return live ?? demoOrFail({
        tables: {
          crossborder_transfers: { record_count: 1247 },
          cips_settlements: { record_count: 312 },
          upi_transactions: { record_count: 489 },
          pix_payments: { record_count: 234 },
          mojaloop_fulfillments: { record_count: 212 },
          fx_rates_history: { record_count: 4320 },
          corridor_analytics: { record_count: 168 },
        },
      }, "middlewareDashboard.lakehouse.tables");
    }),
    query: adminProcedure
      .input(z.object({
        table: z.string(),
        filters: z.record(z.string(), z.string(), z.string(), z.unknown()).optional(),
        limit: z.number().default(50),
      }))
      .query(async ({ input }) => {
        const live = await servicePost(LAKEHOUSE_URL, "/v1/lakehouse/query", input);
        return live ?? demoOrFail({ records: [], count: 0 }, "middlewareDashboard.lakehouse.query");
      }),
    corridorAnalytics: adminProcedure
      .input(z.object({
        corridor: z.string().optional(),
        rail: z.string().optional(),
        days: z.number().default(7),
      }))
      .query(async ({ input }) => {
        const live = await servicePost(LAKEHOUSE_URL, "/v1/lakehouse/analytics/corridors", input);
        return live ?? demoOrFail({
          corridors: [
            { corridor: "NGN-CNY", rail: "cips", count: 312, total_source_amount: 31200000, avg_exchange_rate: 0.0052 },
            { corridor: "USD-INR", rail: "upi", count: 489, total_source_amount: 48900000, avg_exchange_rate: 83.5 },
            { corridor: "NGN-BRL", rail: "pix", count: 234, total_source_amount: 23400000, avg_exchange_rate: 0.028 },
            { corridor: "NGN-KES", rail: "mojaloop", count: 212, total_source_amount: 21200000, avg_exchange_rate: 13.2 },
          ],
        }, "middlewareDashboard.lakehouse.corridorAnalytics");
      }),
    fxRates: adminProcedure
      .input(z.object({
        corridor: z.string().optional(),
        rail: z.string().optional(),
      }))
      .query(async ({ input }) => {
        const params = new URLSearchParams();
        if (input.corridor) params.set("corridor", input.corridor);
        if (input.rail) params.set("rail", input.rail);
        const live = await serviceGet(LAKEHOUSE_URL, `/v1/lakehouse/fx-rates?${params}`);
        return live ?? demoOrFail({
          rates: [
            { corridor: "NGN-CNY", rate: 0.0052, rail: "cips", provider: "cips-fx" },
            { corridor: "USD-INR", rate: 83.5, rail: "upi", provider: "npci-fx" },
            { corridor: "NGN-BRL", rate: 0.028, rail: "pix", provider: "bacen-fx" },
            { corridor: "NGN-KES", rate: 13.2, rail: "mojaloop", provider: "mojaloop-fx" },
          ],
        }, "middlewareDashboard.lakehouse.fxRates");
      }),
  }),

  // ── Redis ────────────────────────────────────────────────────────────────────
  redis: router({
    // Platform-wide cache/state stats — admin only.
    stats: adminProcedure.query(async () => {
      const live = await bridgeGet("/v1/middleware/redis/stats");
      return live ?? demoOrFail(generateDemoRedisStats(), "middlewareDashboard.redis.stats");
    }),
    events: adminProcedure
      .input(z.object({
        channel: z.string().default("paygate.crossborder.settled"),
        limit: z.number().default(20),
      }))
      .query(async ({ input }) => {
        const live = await bridgeGet(`/v1/middleware/redis/events?channel=${input.channel}&limit=${input.limit}`);
        return live ?? demoOrFail({ messages: [] }, "middlewareDashboard.redis.events");
      }),
  }),

  // ── Keycloak ─────────────────────────────────────────────────────────────────
  keycloak: router({
    health: publicProcedure.query(async () => {
      const live = await bridgeGet("/v1/keycloak/health");
      return live ?? demoOrFail({ status: "unknown" }, "middlewareDashboard.keycloak.health");
    }),
    // Token introspection probing — admin only.
    introspect: adminProcedure
      .input(z.object({ token: z.string() }))
      .mutation(async ({ input }) => {
        const live = await bridgePost("/v1/keycloak/introspect", { token: input.token });
        return live ?? demoOrFail({ active: false }, "middlewareDashboard.keycloak.introspect");
      }),
  }),

  // ── Permify ──────────────────────────────────────────────────────────────────
  permify: router({
    health: publicProcedure.query(async () => {
      const live = await bridgeGet("/v1/permify/health");
      return live ?? demoOrFail({ status: "unknown" }, "middlewareDashboard.permify.health");
    }),
    // Arbitrary authorization-check probing — admin only.
    check: adminProcedure
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
        return live ?? demoOrFail({ allowed: true, message: "SIMULATED — no real authorization check performed" }, "middlewareDashboard.permify.check");
      }),
  }),

  // ── APISIX ───────────────────────────────────────────────────────────────────
  apisix: router({
    /** Live routes from APISIX Admin API (falls back to static config) — admin only */
    routes: adminProcedure.query(async () => {
      const { listRoutes } = await import('../apisixClient');
      const live = await listRoutes();
      if (live.total > 0) return { ...live, source: "live" };
      // Fallback static config
      return {
        routes: [
          { id: "cips-transfer-submit", uri: "/v1/cips/transfer", status: 1 },
          { id: "upi-pay", uri: "/v1/upi/pay", status: 1 },
          { id: "pix-payment-initiate", uri: "/v1/pix/payment", status: 1 },
          { id: "mojaloop-transfer", uri: "/v1/mojaloop/transfer", status: 1 },
          { id: "middleware-health", uri: "/v1/middleware/health", status: 1 },
          { id: "middleware-kafka-topics", uri: "/v1/middleware/kafka/topics", status: 1 },
          { id: "middleware-opensearch-query", uri: "/v1/middleware/opensearch/query", status: 1 },
          { id: "middleware-tigerbeetle-accounts", uri: "/v1/middleware/tigerbeetle/accounts", status: 1 },
          { id: "middleware-lakehouse-query", uri: "/v1/middleware/lakehouse/query", status: 1 },
        ],
        total: 9,
        source: "static-config",
      };
    }),
    /** Live consumers (API keys) registered in APISIX — admin only */
    consumers: adminProcedure.query(async () => {
      const { listConsumers } = await import('../apisixClient');
      const live = await listConsumers();
      return { ...live, source: live.total > 0 ? "live" : "empty" };
    }),
    /** APISIX gateway health — admin only */
    health: adminProcedure.query(async () => {
      const { getApisixHealth } = await import('../apisixClient');
      return getApisixHealth();
    }),
    /** Sync a route to APISIX (admin action) */
    syncRoute: adminProcedure
      .input(z.object({
        id: z.string(),
        uri: z.string(),
        name: z.string().optional(),
        methods: z.array(z.string()).optional(),
        upstreamId: z.string().optional(),
      }))
      .mutation(async ({ input }) => {
        const { syncRoute } = await import('../apisixClient');
        const ok = await syncRoute({
          id: input.id,
          uri: input.uri,
          name: input.name,
          methods: input.methods,
          upstream_id: input.upstreamId,
          status: 1,
        });
        return { synced: ok, routeId: input.id };
      }),
    /** Delete a route from APISIX (admin action) */
    deleteRoute: adminProcedure
      .input(z.object({ routeId: z.string() }))
      .mutation(async ({ input }) => {
        const { deleteRoute } = await import('../apisixClient');
        const ok = await deleteRoute(input.routeId);
        return { deleted: ok, routeId: input.routeId };
      }),
    /** Plugin usage analytics — counts how many routes use each plugin — admin only */
    pluginStats: adminProcedure.query(async () => {
      const { listRoutes } = await import('../apisixClient');
      const routeData = await listRoutes();
      const pluginCounts: Record<string, number> = {};
      for (const route of routeData.routes) {
        if (route.plugins && typeof route.plugins === 'object') {
          for (const pluginName of Object.keys(route.plugins)) {
            pluginCounts[pluginName] = (pluginCounts[pluginName] ?? 0) + 1;
          }
        }
      }
      const plugins = Object.entries(pluginCounts)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      if (plugins.length === 0) {
        return demoOrFail({
          plugins: [
            { name: "key-auth", count: 9 },
            { name: "rate-limiting", count: 9 },
            { name: "cors", count: 7 },
            { name: "opentelemetry", count: 5 },
            { name: "ip-restriction", count: 3 },
            { name: "request-id", count: 9 },
          ],
        }, "middlewareDashboard.apisix.pluginStats");
      }
      return { plugins, source: "live" };
    }),
    /** Gateway request metrics snapshot (from APISIX Prometheus endpoint via bridge) — admin only */
    metrics: adminProcedure.query(async () => {
      const live = await bridgeGet("/v1/apisix/metrics");
      if (live) return { ...live, source: "live" };
      return demoOrFail({
        requestsPerSecond: parseFloat((Math.random() * 120 + 40).toFixed(1)),
        p50LatencyMs: parseFloat((Math.random() * 8 + 4).toFixed(1)),
        p95LatencyMs: parseFloat((Math.random() * 30 + 15).toFixed(1)),
        p99LatencyMs: parseFloat((Math.random() * 80 + 40).toFixed(1)),
        errorRate: parseFloat((Math.random() * 0.5).toFixed(2)),
        totalRequests24h: Math.floor(Math.random() * 500_000 + 200_000),
        activeConnections: Math.floor(Math.random() * 200 + 50),
        upstreamLatencyMs: parseFloat((Math.random() * 12 + 3).toFixed(1)),
        timestamp: Date.now(),
      }, "middlewareDashboard.apisix.metrics");
    }),
  }),

  // ── PgBouncer Connection Pool ─────────────────────────────────────────────────
  pgbouncer: router({
    /** PgBouncer pool statistics — reads from the virtual pgbouncer SHOW POOLS table — admin only */
    stats: adminProcedure.query(async () => {
      const pgBouncerUrl = process.env.PGBOUNCER_URL;
      if (!pgBouncerUrl) {
        return {
          source: "unconfigured",
          configured: false,
          pools: [],
          totalClActive: 0,
          totalClWaiting: 0,
          totalSvActive: 0,
          totalSvIdle: 0,
          poolMode: "transaction",
          maxClientConn: 1000,
          defaultPoolSize: 25,
        };
      }
      try {
        const { Pool } = await import('pg');
        const pool = new Pool({ connectionString: pgBouncerUrl, max: 1, connectionTimeoutMillis: 3000 });
        const client = await pool.connect();
        const [poolsRes] = await Promise.all([client.query('SHOW POOLS')]);
        client.release();
        await pool.end();
        const pools = poolsRes.rows.map((r: any) => ({
          database: r.database,
          user: r.user,
          clActive: parseInt(r.cl_active ?? 0),
          clWaiting: parseInt(r.cl_waiting ?? 0),
          svActive: parseInt(r.sv_active ?? 0),
          svIdle: parseInt(r.sv_idle ?? 0),
          svUsed: parseInt(r.sv_used ?? 0),
          maxWait: parseInt(r.maxwait ?? 0),
        }));
        return {
          source: "live",
          configured: true,
          pools,
          totalClActive: pools.reduce((s: number, p: any) => s + p.clActive, 0),
          totalClWaiting: pools.reduce((s: number, p: any) => s + p.clWaiting, 0),
          totalSvActive: pools.reduce((s: number, p: any) => s + p.svActive, 0),
          totalSvIdle: pools.reduce((s: number, p: any) => s + p.svIdle, 0),
          poolMode: "transaction",
          maxClientConn: 1000,
          defaultPoolSize: 25,
        };
      } catch (err) {
        return { source: "error", configured: true, error: String(err), pools: [], totalClActive: 0, totalClWaiting: 0, totalSvActive: 0, totalSvIdle: 0 };
      }
    }),
  }),

  // ── Summary ──────────────────────────────────────────────────────────────────
  // Platform-wide infra + ledger summary — admin only.
  summary: adminProcedure.query(async () => {
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
      ledger: ledgerStats.status === "fulfilled" ? ledgerStats.value : demoOrFail(generateDemoLedgerStats(), "middlewareDashboard.summary.ledger"),
      kafka: kafkaTopics.status === "fulfilled" ? kafkaTopics.value : demoOrFail({ topics: generateDemoKafkaTopics() }, "middlewareDashboard.summary.kafka"),
      rails_active: ["cips", "upi", "pix", "mojaloop", "brics"],
      corridors_active: 11,
      checked_at: new Date().toISOString(),
    };
  }),
});
