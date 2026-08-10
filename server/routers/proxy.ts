/**
 * PayGate API Proxy Router
 *
 * All procedures proxy to the configured PAYGATE_API_URL backend.
 * When the backend is unreachable, they return rich mock data so the
 * dashboard stays useful in development / demo environments.
 */
import { z } from "zod";
import { publicProcedure, router } from "../_core/trpc";
import { ENV } from "../_core/env";
import { getDb } from "../db";
import { alertThresholds, breachEvents, namedAlertRules } from "../../drizzle/schema";
import { eq, desc, and, gte, lte, inArray } from "drizzle-orm";
import { notifyOwner } from "../_core/notification";

const sourceInput = z.object({ forceMock: z.boolean().optional() }).optional();

// ─── helpers ────────────────────────────────────────────────────────────────

async function fetchPaygate<T>(path: string, fallback: T): Promise<T> {
  try {
    const url = `${ENV.paygateApiUrl.replace(/\/$/, "")}${path}`;
    const res = await fetch(url, {
      headers: { "Content-Type": "application/json" },
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return (await res.json()) as T;
  } catch {
    // Backend unreachable — return mock data
    return fallback;
  }
}

// ─── mock data ───────────────────────────────────────────────────────────────

const MOCK_GATEWAY_HEALTH = {
  status: "degraded",
  version: "3.8.0",
  uptime: 1_209_600,
  hostname: "apisix-gateway-01",
};

const MOCK_ROUTES = [
  { id: "r1", name: "Payment Initiation", path: "/api/v1/payments", methods: ["POST"], plugins: ["key-auth", "rate-limiting", "opentelemetry"], reqPerMin: 342, p99: 48, status: "healthy" },
  { id: "r2", name: "Transaction Query", path: "/api/v1/transactions/:id", methods: ["GET"], plugins: ["key-auth", "opentelemetry"], reqPerMin: 891, p99: 22, status: "healthy" },
  { id: "r3", name: "Webhook Inbound", path: "/webhooks/mojaloop", methods: ["POST"], plugins: ["hmac-auth", "opentelemetry"], reqPerMin: 56, p99: 31, status: "healthy" },
  { id: "r4", name: "KYC Submission", path: "/api/v1/kyc", methods: ["POST", "GET"], plugins: ["key-auth", "rate-limiting"], reqPerMin: 23, p99: 67, status: "healthy" },
  { id: "r5", name: "Admin Dashboard", path: "/admin/*", methods: ["GET", "POST", "PUT", "DELETE"], plugins: ["jwt", "ip-restriction"], reqPerMin: 12, p99: 210, status: "degraded" },
  { id: "r6", name: "STR Filing", path: "/api/v1/str", methods: ["POST", "GET"], plugins: ["key-auth", "rate-limiting"], reqPerMin: 4, p99: 55, status: "healthy" },
  { id: "r7", name: "Chargeback API", path: "/api/v1/chargebacks", methods: ["POST", "GET", "PUT"], plugins: ["key-auth", "opentelemetry"], reqPerMin: 18, p99: 38, status: "healthy" },
  { id: "r8", name: "Velocity Check", path: "/api/v1/velocity", methods: ["POST"], plugins: ["key-auth", "rate-limiting", "opentelemetry"], reqPerMin: 1204, p99: 12, status: "healthy" },
  { id: "r9", name: "Interchange Rates", path: "/api/v1/interchange", methods: ["GET"], plugins: ["key-auth"], reqPerMin: 7, p99: 19, status: "healthy" },
];

const MOCK_CONSUMERS = [
  { id: "c1", username: "merchant-acme-001", plugins: ["key-auth"], createdAt: "2024-01-15T08:00:00Z" },
  { id: "c2", username: "merchant-globex-002", plugins: ["key-auth"], createdAt: "2024-02-20T10:30:00Z" },
  { id: "c3", username: "merchant-initech-003", plugins: ["key-auth"], createdAt: "2024-03-10T14:00:00Z" },
  { id: "c4", username: "internal-webhook-svc", plugins: ["hmac-auth"], createdAt: "2024-01-01T00:00:00Z" },
  { id: "c5", username: "admin-dashboard-svc", plugins: ["jwt"], createdAt: "2024-01-01T00:00:00Z" },
];

const MOCK_METRICS = {
  requestsPerSec: 43.2,
  latencyP50: 18,
  latencyP95: 72,
  latencyP99: 148,
  errorRate: 0.31,
  activeConnections: 284,
  totalRequests24h: 3_741_200,
  requestHistory: Array.from({ length: 24 }, (_, i) => ({
    time: `${String(i).padStart(2, "0")}:00`,
    rps: Math.round(20 + Math.random() * 80),
    errors: Math.round(Math.random() * 5),
  })),
};

const MOCK_WORKFLOWS = [
  { id: "run-a1b2c3d4e5f6", workflowType: "CrossBorderTransfer", merchantId: "mch_acme_001", status: "running", startedAt: new Date(Date.now() - 120_000).toISOString(), duration: "2m 0s" },
  { id: "run-b2c3d4e5f6a1", workflowType: "KYCVerification", merchantId: "mch_globex_002", status: "running", startedAt: new Date(Date.now() - 45_000).toISOString(), duration: "45s" },
  { id: "run-c3d4e5f6a1b2", workflowType: "VelocityAudit", merchantId: "mch_initech_003", status: "running", startedAt: new Date(Date.now() - 300_000).toISOString(), duration: "5m 0s" },
  { id: "run-d4e5f6a1b2c3", workflowType: "RegulatoryReport", merchantId: "mch_acme_001", status: "running", startedAt: new Date(Date.now() - 600_000).toISOString(), duration: "10m 0s" },
  { id: "run-e5f6a1b2c3d4", workflowType: "ChargebackResolution", merchantId: "mch_globex_002", status: "completed", startedAt: new Date(Date.now() - 3_600_000).toISOString(), duration: "8m 22s" },
  { id: "run-f6a1b2c3d4e5", workflowType: "STRFiling", merchantId: "mch_initech_003", status: "failed", startedAt: new Date(Date.now() - 10_800_000).toISOString(), duration: "3m 14s" },
  { id: "run-g7h8i9j0k1l2", workflowType: "InterchangeReconciliation", merchantId: "mch_acme_001", status: "completed", startedAt: new Date(Date.now() - 7_200_000).toISOString(), duration: "12m 5s" },
  { id: "run-h8i9j0k1l2m3", workflowType: "CrossBorderTransfer", merchantId: "mch_globex_002", status: "timed_out", startedAt: new Date(Date.now() - 18_000_000).toISOString(), duration: "30m 0s" },
];

const MOCK_POOL = {
  pools: [
    { database: "paygate_prod", user: "app_user", clActive: 28, clWaiting: 0, svActive: 28, svIdle: 22, maxWait: 0 },
    { database: "paygate_prod", user: "reporting", clActive: 12, clWaiting: 0, svActive: 12, svIdle: 13, maxWait: 0 },
    { database: "paygate_prod", user: "migrations", clActive: 1, clWaiting: 0, svActive: 1, svIdle: 4, maxWait: 0 },
    { database: "paygate_analytics", user: "analytics_ro", clActive: 20, clWaiting: 2, svActive: 20, svIdle: 5, maxWait: 45 },
  ],
  config: { maxClientConn: 1000, defaultPoolSize: 25, reservePoolSize: 5, poolMode: "transaction" },
};

const MOCK_KAFKA = {
  brokers: [
    { id: "kafka-01", host: "kafka-01:9092", status: "healthy", partitions: 48, leaders: 16 },
    { id: "kafka-02", host: "kafka-02:9092", status: "healthy", partitions: 48, leaders: 16 },
    { id: "kafka-03", host: "kafka-03:9092", status: "healthy", partitions: 48, leaders: 16 },
  ],
  topics: [
    { name: "payment.events", partitions: 12, replication: 3, msgPerSec: 342, consumerLag: 0, retentionHours: 168 },
    { name: "kyc.submissions", partitions: 6, replication: 3, msgPerSec: 23, consumerLag: 0, retentionHours: 720 },
    { name: "audit.log", partitions: 24, replication: 3, msgPerSec: 1204, consumerLag: 0, retentionHours: 8760 },
  ],
  consumerGroups: [
    { name: "payment-processor", topics: ["payment.events"], lag: 0, members: 4, status: "stable" },
    { name: "kyc-worker", topics: ["kyc.submissions"], lag: 0, members: 2, status: "stable" },
    { name: "audit-archiver", topics: ["audit.log"], lag: 12, members: 1, status: "stable" },
  ],
};

const MOCK_REDIS = {
  nodes: [
    { id: "redis-primary", role: "primary", host: "redis-01:6379", status: "healthy", memUsedMb: 842, memMaxMb: 4096, connectedClients: 47, opsPerSec: 8240 },
    { id: "redis-replica-1", role: "replica", host: "redis-02:6379", status: "healthy", memUsedMb: 840, memMaxMb: 4096, connectedClients: 12, opsPerSec: 0 },
  ],
  stats: {
    hitRate: 94.2,
    missRate: 5.8,
    evictedKeys: 0,
    expiredKeys: 1247,
    totalCommandsProcessed: 48_291_043,
    uptimeSeconds: 1_209_600,
  },
  keyspaceHistory: Array.from({ length: 12 }, (_, i) => ({
    time: `${String(i * 2).padStart(2, "0")}:00`,
    hits: Math.round(7000 + Math.random() * 2000),
    misses: Math.round(300 + Math.random() * 200),
  })),
};

// ─── router ──────────────────────────────────────────────────────────────────

// ─── PSP mock data ───────────────────────────────────────────────────────────
const MOCK_PSP = {
  providers: [
    {
      id: "stripe",
      name: "Stripe",
      region: "US-East",
      status: "healthy",
      successRate: 98.7,
      avgLatencyMs: 142,
      p99LatencyMs: 380,
      txLast24h: 48_210,
      volumeUsd: 2_841_500,
      retryQueueDepth: 3,
      threeDsRate: 12.4,
      declineRate: 1.3,
      chargebackRate: 0.08,
    },
    {
      id: "adyen",
      name: "Adyen",
      region: "EU-West",
      status: "healthy",
      successRate: 97.9,
      avgLatencyMs: 198,
      p99LatencyMs: 510,
      txLast24h: 31_450,
      volumeUsd: 1_920_300,
      retryQueueDepth: 7,
      threeDsRate: 18.2,
      declineRate: 2.1,
      chargebackRate: 0.12,
    },
    {
      id: "checkout",
      name: "Checkout.com",
      region: "EU-Central",
      status: "degraded",
      successRate: 94.1,
      avgLatencyMs: 312,
      p99LatencyMs: 890,
      txLast24h: 12_880,
      volumeUsd: 780_200,
      retryQueueDepth: 42,
      threeDsRate: 22.8,
      declineRate: 5.9,
      chargebackRate: 0.31,
    },
    {
      id: "paypal",
      name: "PayPal",
      region: "US-West",
      status: "healthy",
      successRate: 96.3,
      avgLatencyMs: 224,
      p99LatencyMs: 620,
      txLast24h: 22_100,
      volumeUsd: 1_105_800,
      retryQueueDepth: 11,
      threeDsRate: 8.6,
      declineRate: 3.7,
      chargebackRate: 0.19,
    },
    {
      id: "mojaloop",
      name: "Mojaloop",
      region: "Africa",
      status: "healthy",
      successRate: 99.1,
      avgLatencyMs: 88,
      p99LatencyMs: 210,
      txLast24h: 8_340,
      volumeUsd: 142_600,
      retryQueueDepth: 0,
      threeDsRate: 0,
      declineRate: 0.9,
      chargebackRate: 0.02,
    },
  ],
  // 24-hour latency histogram buckets (ms)
  latencyBuckets: [
    { bucket: "<50ms",   stripe: 18, adyen: 8,  checkout: 3,  paypal: 12, mojaloop: 42 },
    { bucket: "50-100",  stripe: 32, adyen: 18, checkout: 7,  paypal: 24, mojaloop: 38 },
    { bucket: "100-200", stripe: 28, adyen: 31, checkout: 14, paypal: 28, mojaloop: 14 },
    { bucket: "200-500", stripe: 15, adyen: 28, checkout: 38, paypal: 22, mojaloop: 5  },
    { bucket: "500ms+",  stripe: 7,  adyen: 15, checkout: 38, paypal: 14, mojaloop: 1  },
  ],
};

// Generate 24-hour PSP history for a given provider
function generatePspHistory(providerId: string, hours = 24) {
  const base: Record<string, { successRate: number; latency: number; retryQueue: number }> = {
    stripe:   { successRate: 98.7, latency: 142, retryQueue: 3  },
    adyen:    { successRate: 97.9, latency: 198, retryQueue: 7  },
    checkout: { successRate: 94.1, latency: 312, retryQueue: 42 },
    paypal:   { successRate: 96.3, latency: 224, retryQueue: 11 },
    mojaloop: { successRate: 99.1, latency: 88,  retryQueue: 0  },
  };
  const b = base[providerId] ?? { successRate: 97, latency: 200, retryQueue: 5 };
  const now = Date.now();
  return Array.from({ length: hours }, (_, i) => {
    const t = new Date(now - (hours - 1 - i) * 3_600_000);
    const jitter = (Math.random() - 0.5) * 0.04;
    return {
      time: t.toISOString(),
      label: `${String(t.getUTCHours()).padStart(2, "0")}:00`,
      successRate: Math.max(85, Math.min(100, b.successRate + jitter * 100)),
      latencyMs: Math.max(30, Math.round(b.latency + (Math.random() - 0.5) * b.latency * 0.3)),
      retryQueue: Math.max(0, Math.round(b.retryQueue + (Math.random() - 0.5) * b.retryQueue * 0.5)),
    };
  });
}

export const proxyRouter = router({
  // Gateway
  gatewayHealth: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_GATEWAY_HEALTH) :
    fetchPaygate("/api/trpc/middlewareDashboard.apisix.health", MOCK_GATEWAY_HEALTH)
  ),
  gatewayRoutes: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_ROUTES) :
    fetchPaygate("/api/trpc/middlewareDashboard.apisix.listRoutes", MOCK_ROUTES)
  ),
  gatewayConsumers: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_CONSUMERS) :
    fetchPaygate("/api/trpc/middlewareDashboard.apisix.listConsumers", MOCK_CONSUMERS)
  ),
  gatewayMetrics: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_METRICS) :
    fetchPaygate("/api/trpc/middlewareDashboard.apisix.metrics", MOCK_METRICS)
  ),

  // Temporal workflows
  workflows: publicProcedure
    .input(z.object({ status: z.string().optional(), forceMock: z.boolean().optional() }).optional())
    .query(({ input }) =>
      input?.forceMock ? Promise.resolve(MOCK_WORKFLOWS) :
      fetchPaygate(
        `/api/trpc/middlewareDashboard.temporal.listWorkflows${input?.status ? `?status=${input.status}` : ""}`,
        MOCK_WORKFLOWS
      )
    ),

  // PgBouncer pool
  pool: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_POOL) :
    fetchPaygate("/api/trpc/middlewareDashboard.pgbouncer.stats", MOCK_POOL)
  ),

  // Kafka
  kafka: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_KAFKA) :
    fetchPaygate("/api/trpc/middlewareDashboard.kafka.stats", MOCK_KAFKA)
  ),

  // Redis
  redis: publicProcedure.input(sourceInput).query(({ input }) =>
    input?.forceMock ? Promise.resolve(MOCK_REDIS) :
    fetchPaygate("/api/trpc/middlewareDashboard.redis.stats", MOCK_REDIS)
  ),

  // Backend connectivity check
  ping: publicProcedure.input(sourceInput).query(async ({ input }) => {
    if (input?.forceMock) return { connected: false, url: null };
    try {
      const url = `${ENV.paygateApiUrl.replace(/\/$/, "")}/api/trpc/system.ping`;
      const res = await fetch(url, { signal: AbortSignal.timeout(3000) });
      return { connected: res.ok, url: ENV.paygateApiUrl };
    } catch {
      return { connected: false, url: ENV.paygateApiUrl };
    }
  }),

  // Topic detail: historical throughput + config, with optional date range
  topicHistory: publicProcedure
    .input(z.object({
      topicName: z.string(),
      forceMock: z.boolean().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(({ input }) => {
      const seed = input.topicName.length;
      const fromMs = input.from ? new Date(input.from).getTime() : Date.now() - 24 * 3600 * 1000;
      const toMs   = input.to   ? new Date(input.to).getTime()   : Date.now();
      const rangeHours = Math.max(1, Math.round((toMs - fromMs) / 3600000));
      // Up to 72 hourly points; beyond that use daily buckets (max 90 points)
      const points = rangeHours <= 72 ? rangeHours : Math.min(90, Math.ceil(rangeHours / 24));
      const bucketMs = (toMs - fromMs) / points;
      const history = Array.from({ length: points }, (_, i) => {
        const t = new Date(fromMs + i * bucketMs);
        const h = t.getHours();
        const peakHour = h > 8 && h < 18;
        const label = rangeHours <= 72
          ? `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`
          : `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
        return {
          time: label,
          msgPerSec: Math.round(100 + seed * 10 + (peakHour ? 300 : 0) + (i % 3) * 40),
          lag: i > Math.floor(points * 0.67) && seed % 2 === 0 ? Math.round((i - Math.floor(points * 0.67)) * 3) : 0,
          errorRate: parseFloat(((i % 5 === 0 ? 0.3 : 0.05) + seed * 0.01).toFixed(2)),
        };
      });
      const topicConfigs: Record<string, {
        partitions: number; replication: number; retentionHours: number;
        compressionType: string; cleanupPolicy: string; minInsyncReplicas: number;
      }> = {
        "payment.events":  { partitions: 12, replication: 3, retentionHours: 168,  compressionType: "lz4",    cleanupPolicy: "delete",  minInsyncReplicas: 2 },
        "kyc.submissions": { partitions: 6,  replication: 3, retentionHours: 720,  compressionType: "gzip",   cleanupPolicy: "delete",  minInsyncReplicas: 2 },
        "audit.log":       { partitions: 24, replication: 3, retentionHours: 8760, compressionType: "snappy", cleanupPolicy: "compact", minInsyncReplicas: 2 },
      };
      const config = topicConfigs[input.topicName] ?? {
        partitions: 6, replication: 2, retentionHours: 72,
        compressionType: "none", cleanupPolicy: "delete", minInsyncReplicas: 1,
      };
      return { topicName: input.topicName, history, config };
    }),

  // Redis node detail: 24h memory utilization + hit/miss history + config
  redisNodeHistory: publicProcedure
    .input(z.object({
      nodeId: z.string(),
      forceMock: z.boolean().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
    }))
    .query(({ input }) => {
      const isPrimary = input.nodeId === "redis-primary";
      const baseUsedMb = isPrimary ? 842 : 840;
      const maxMb = 4096;

      const fromMs = input.from ? new Date(input.from).getTime() : Date.now() - 24 * 3600 * 1000;
      const toMs   = input.to   ? new Date(input.to).getTime()   : Date.now();
      const rangeHours = Math.max(1, Math.round((toMs - fromMs) / 3600000));
      const points = rangeHours <= 72 ? rangeHours : Math.min(90, Math.ceil(rangeHours / 24));
      const bucketMs = (toMs - fromMs) / points;

      const memHistory = Array.from({ length: points }, (_, i) => {
        const t = new Date(fromMs + i * bucketMs);
        const h = t.getHours();
        const peakHour = h > 9 && h < 20;
        const usedMb = Math.round(baseUsedMb + (peakHour ? 80 : 0) + (i % 4) * 15);
        const label = rangeHours <= 72
          ? `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`
          : `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
        return {
          time: label,
          usedMb,
          maxMb,
          pct: parseFloat(((usedMb / maxMb) * 100).toFixed(1)),
        };
      });

      const hitMissHistory = Array.from({ length: points }, (_, i) => {
        const t = new Date(fromMs + i * bucketMs);
        const h = t.getHours();
        const peakHour = h > 9 && h < 20;
        const hits   = Math.round(7000 + (peakHour ? 3000 : 0) + (i % 3) * 400);
        const misses = Math.round(300  + (peakHour ? 200  : 0) + (i % 5) * 30);
        const hitRate = parseFloat(((hits / (hits + misses)) * 100).toFixed(1));
        const label = rangeHours <= 72
          ? `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")} ${String(h).padStart(2, "0")}:00`
          : `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
        return { time: label, hits, misses, hitRate };
      });

      const nodeConfigs: Record<string, {
        maxMemoryPolicy: string; maxMemory: string; persistenceMode: string; replicationLag: string;
      }> = {
        "redis-primary":   { maxMemoryPolicy: "allkeys-lru", maxMemory: "4096 MB", persistenceMode: "RDB + AOF", replicationLag: "N/A" },
        "redis-replica-1": { maxMemoryPolicy: "allkeys-lru", maxMemory: "4096 MB", persistenceMode: "replica",   replicationLag: "< 1ms" },
      };
      const config = nodeConfigs[input.nodeId] ?? {
        maxMemoryPolicy: "noeviction", maxMemory: "4096 MB", persistenceMode: "none", replicationLag: "unknown",
      };

      return { nodeId: input.nodeId, memHistory, hitMissHistory, config };
    }),

  // Consumer group detail: per-partition lag + member assignments
  consumerGroupDetail: publicProcedure
    .input(z.object({ groupName: z.string(), forceMock: z.boolean().optional() }))
    .query(({ input }) => {
      const groupConfigs: Record<string, {
        topic: string;
        partitionCount: number;
        memberCount: number;
        protocol: string;
        state: string;
      }> = {
        "payment-processor": { topic: "payment.events",  partitionCount: 12, memberCount: 4, protocol: "range",      state: "Stable" },
        "kyc-worker":        { topic: "kyc.submissions", partitionCount: 6,  memberCount: 2, protocol: "roundrobin", state: "Stable" },
        "audit-archiver":    { topic: "audit.log",       partitionCount: 24, memberCount: 1, protocol: "range",      state: "Stable" },
      };
      const cfg = groupConfigs[input.groupName] ?? { topic: "unknown", partitionCount: 6, memberCount: 1, protocol: "range", state: "Stable" };

      // Per-partition lag (deterministic, seeded by group name length)
      const seed = input.groupName.length;
      // Simulate rebalance: partitions whose index is divisible by (seed+3) were
      // recently reassigned. The divisor changes every 5-minute window so the
      // indicator naturally "clears" over time in a demo environment.
      const rebalanceWindow = Math.floor(Date.now() / (5 * 60 * 1000));
      const rebalanceDivisor = ((seed + rebalanceWindow) % 5) + 3; // 3–7
      const partitions = Array.from({ length: cfg.partitionCount }, (_, p) => {
        const hasLag = (p + seed) % 7 === 0;
        const lag = hasLag ? Math.round((p + 1) * seed * 0.8) : 0;
        const memberId = p % cfg.memberCount;
        return {
          partition: p,
          topic: cfg.topic,
          currentOffset: Math.round(1_000_000 + p * 50_000 + seed * 1000),
          logEndOffset: Math.round(1_000_000 + p * 50_000 + seed * 1000 + lag),
          lag,
          memberId: `member-${memberId}`,
          clientId: `${input.groupName}-${memberId}`,
          host: `10.0.${Math.floor(memberId / 2)}.${10 + memberId}`,
          recentlyReassigned: p % rebalanceDivisor === 0,
        };
      });

      // Member summary
      const members = Array.from({ length: cfg.memberCount }, (_, m) => {
        const assignedPartitions = partitions.filter(p => p.memberId === `member-${m}`).map(p => p.partition);
        const totalLag = assignedPartitions.reduce((s, p) => s + (partitions[p]?.lag ?? 0), 0);
        return {
          memberId: `member-${m}`,
          clientId: `${input.groupName}-${m}`,
          host: `10.0.${Math.floor(m / 2)}.${10 + m}`,
          assignedPartitions,
          totalLag,
        };
      });

      // 24h lag history per group
      const lagHistory = Array.from({ length: 24 }, (_, i) => {
        const peakHour = i > 14 && i < 22;
        const totalLag = partitions.reduce((s, p) => s + p.lag, 0);
        return {
          time: `${String(i).padStart(2, "0")}:00`,
          lag: Math.round(totalLag * (peakHour ? 1.5 : 1) + (i % 3) * seed * 0.2),
        };
      });

      return {
        groupName: input.groupName,
        topic: cfg.topic,
        state: cfg.state,
        protocol: cfg.protocol,
        partitions,
        members,
        lagHistory,
      };
    }),

  // Alert threshold settings — read
  getThresholds: publicProcedure.query(async ({ ctx }) => {
    const defaults = { lagWarn: 5, lagCritical: 20, memWarnPct: 70, memCriticalPct: 85 };
    try {
      const db = await getDb();
      if (!db) return defaults;
      const ownerOpenId = ctx.user?.openId ?? "anonymous";
      const rows = await db.select().from(alertThresholds).where(eq(alertThresholds.ownerOpenId, ownerOpenId)).limit(1);
      if (rows.length === 0) return defaults;
      const { lagWarn, lagCritical, memWarnPct, memCriticalPct } = rows[0];
      return { lagWarn, lagCritical, memWarnPct, memCriticalPct };
    } catch {
      return defaults;
    }
  }),

  // Alert threshold settings — upsert
  saveThresholds: publicProcedure
    .input(z.object({
      lagWarn: z.number().int().min(0).max(10000),
      lagCritical: z.number().int().min(0).max(100000),
      memWarnPct: z.number().int().min(0).max(100),
      memCriticalPct: z.number().int().min(0).max(100),
    }))
    .mutation(async ({ ctx, input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      const ownerOpenId = ctx.user?.openId ?? "anonymous";
      await db.insert(alertThresholds)
        .values({ ownerOpenId, ...input })
        .onConflictDoUpdate({ target: alertThresholds.ownerOpenId, set: { ...input, updatedAt: new Date() } });
      return { success: true };
    }),

  // Check current Kafka lag + Redis memory against saved thresholds and fire
  // owner notifications for any critical breach. Also persists breach events to DB.
  checkBreaches: publicProcedure
    .input(z.object({ forceMock: z.boolean().optional() }))
    .mutation(async ({ ctx, input }) => {
      const defaults = { lagWarn: 5, lagCritical: 20, memWarnPct: 70, memCriticalPct: 85 };
      let thresholds = defaults;
      let db: Awaited<ReturnType<typeof getDb>> | null = null;
      try {
        db = await getDb();
        if (db) {
          const ownerOpenId = ctx.user?.openId ?? "anonymous";
          const rows = await db.select().from(alertThresholds).where(eq(alertThresholds.ownerOpenId, ownerOpenId)).limit(1);
          if (rows.length > 0) {
            const { lagWarn, lagCritical, memWarnPct, memCriticalPct } = rows[0];
            thresholds = { lagWarn, lagCritical, memWarnPct, memCriticalPct };
          }
        }
      } catch { /* use defaults */ }

      // Fetch current Kafka and Redis data
      const kafka = await fetchPaygate<typeof MOCK_KAFKA>(
        "/api/trpc/middlewareDashboard.kafka.stats", MOCK_KAFKA
      );
      const redis = await fetchPaygate<typeof MOCK_REDIS>(
        "/api/trpc/middlewareDashboard.redis.stats", MOCK_REDIS
      );

      type BreachItem = { metric: string; severity: "warn" | "critical"; message: string; value: number; threshold: number };
      const breachItems: BreachItem[] = [];

      // Consumer lag check
      const totalLag = (kafka.consumerGroups ?? []).reduce((s: number, g: { lag: number }) => s + g.lag, 0);
      if (totalLag > thresholds.lagCritical) {
        const criticalGroups = (kafka.consumerGroups ?? [])
          .filter((g: { lag: number }) => g.lag > thresholds.lagCritical)
          .map((g: { name: string }) => g.name);
        breachItems.push({
          metric: "kafka_lag",
          severity: "critical",
          message: `Consumer lag CRITICAL: ${totalLag} msgs across [${criticalGroups.join(", ")}] (threshold: ${thresholds.lagCritical})`,
          value: totalLag,
          threshold: thresholds.lagCritical,
        });
      } else if (totalLag > thresholds.lagWarn) {
        breachItems.push({
          metric: "kafka_lag",
          severity: "warn",
          message: `Consumer lag WARNING: ${totalLag} msgs (threshold: ${thresholds.lagWarn})`,
          value: totalLag,
          threshold: thresholds.lagWarn,
        });
      }

      // Redis memory check (primary node)
      const primary = (redis.nodes ?? []).find((n: { role: string }) => n.role === "primary");
      if (primary) {
        const memPct = Math.round((primary.memUsedMb / primary.memMaxMb) * 100);
        if (memPct >= thresholds.memCriticalPct) {
          breachItems.push({
            metric: "redis_memory",
            severity: "critical",
            message: `Redis memory CRITICAL: ${memPct}% used (${primary.memUsedMb}/${primary.memMaxMb} MB, threshold: ${thresholds.memCriticalPct}%)`,
            value: memPct,
            threshold: thresholds.memCriticalPct,
          });
        } else if (memPct >= thresholds.memWarnPct) {
          breachItems.push({
            metric: "redis_memory",
            severity: "warn",
            message: `Redis memory WARNING: ${memPct}% used (threshold: ${thresholds.memWarnPct}%)`,
            value: memPct,
            threshold: thresholds.memWarnPct,
          });
        }
      }
      // ── Apply named alert rules (per-target overrides) ───────────────────
      // For each enabled named rule, check the specific target and emit a
      // breach if the value exceeds the rule's threshold. Named rules take
      // precedence: if a group/node already has a global breach item for the
      // same metric, we replace it with the named-rule result.
      let namedRules: Array<{ id: number; name: string; metric: string; target: string; severity: string; threshold: number; enabled: boolean }> = [];
      if (db) {
        try {
          namedRules = await db.select().from(namedAlertRules).where(eq(namedAlertRules.enabled, true)) ;
        } catch { /* non-fatal */ }
      }

      for (const rule of namedRules) {
        if (rule.metric === "kafka_lag") {
          const group = (kafka.consumerGroups ?? []).find((g: { name: string }) => g.name === rule.target);
          if (!group) continue;
          const lag: number = (group as { lag: number }).lag;
          const sev = rule.severity as "warn" | "critical";
          if (lag >= rule.threshold) {
            // Remove any existing global breach for kafka_lag that mentions this group
            const idx = breachItems.findIndex(b => b.metric === "kafka_lag" && b.message.includes(rule.target));
            const item: BreachItem = {
              metric: "kafka_lag",
              severity: sev,
              message: `[Rule: ${rule.name ?? rule.target}] Consumer group "${rule.target}" lag ${sev.toUpperCase()}: ${lag} msgs (rule threshold: ${rule.threshold})`,
              value: lag,
              threshold: rule.threshold,
            };
            if (idx >= 0) breachItems[idx] = item;
            else breachItems.push(item);
          }
        } else if (rule.metric === "redis_memory") {
          const node = (redis.nodes ?? []).find((n: { role: string; name?: string }) =>
            n.role === rule.target || (n as { name?: string }).name === rule.target
          );
          if (!node) continue;
          const typedNode = node as { memUsedMb: number; memMaxMb: number };
          const memPct = Math.round((typedNode.memUsedMb / typedNode.memMaxMb) * 100);
          const sev = rule.severity as "warn" | "critical";
          if (memPct >= rule.threshold) {
            const idx = breachItems.findIndex(b => b.metric === "redis_memory");
            const item: BreachItem = {
              metric: "redis_memory",
              severity: sev,
              message: `[Rule: ${rule.name ?? rule.target}] Redis node "${rule.target}" memory ${sev.toUpperCase()}: ${memPct}% (rule threshold: ${rule.threshold}%)`,
              value: memPct,
              threshold: rule.threshold,
            };
            if (idx >= 0) breachItems[idx] = item;
            else breachItems.push(item);
          }
        }
      }

      // ── PSP success rate breach check ────────────────────────────────────
      const psp = MOCK_PSP; // always use mock for now; swap for live fetch when available
      const PSP_WARN_SUCCESS_RATE = 96;
      const PSP_CRITICAL_SUCCESS_RATE = 94;
      for (const provider of (psp.providers ?? [])) {
        const sr: number = provider.successRate;
        if (sr < PSP_CRITICAL_SUCCESS_RATE) {
          breachItems.push({
            metric: "psp_error_rate",
            severity: "critical",
            message: `PSP "${provider.name}" success rate CRITICAL: ${sr.toFixed(1)}% (threshold: ${PSP_CRITICAL_SUCCESS_RATE}%)`,
            value: sr,
            threshold: PSP_CRITICAL_SUCCESS_RATE,
          });
        } else if (sr < PSP_WARN_SUCCESS_RATE) {
          breachItems.push({
            metric: "psp_error_rate",
            severity: "warn",
            message: `PSP "${provider.name}" success rate WARNING: ${sr.toFixed(1)}% (threshold: ${PSP_WARN_SUCCESS_RATE}%)`,
            value: sr,
            threshold: PSP_WARN_SUCCESS_RATE,
          });
        }
      }
      // Persist breach events to DB
      if (db && breachItems.length > 0) {
        try {
          await db.insert(breachEvents).values(
            breachItems.map(b => ({
              metric: b.metric,
              severity: b.severity,
              message: b.message,
              value: b.value,
              threshold: b.threshold,
            }))
          );
        } catch { /* non-fatal */ }
      }

      const criticalItems = breachItems.filter(b => b.severity === "critical");
      let notified = false;
      if (criticalItems.length > 0) {
        const title = `PayGate Alert: ${criticalItems.length} critical breach${criticalItems.length > 1 ? "es" : ""} detected`;
        const content = [
          `Detected at ${new Date().toISOString().replace("T", " ").slice(0, 19)} UTC`,
          "",
          ...criticalItems.map(b => `🚨 ${b.message}`),
          "",
          `Mode: ${input.forceMock ? "MOCK" : "LIVE"}`,
        ].join("\n");
        notified = await notifyOwner({ title, content });
      }

      return { notified, breaches: breachItems };
    }),

  listBreaches: publicProcedure
    .input(z.object({
      metric: z.string().optional(),
      severity: z.enum(["warn", "critical"]).optional(),
      acknowledged: z.boolean().optional(),
      from: z.string().optional(),
      to: z.string().optional(),
      limit: z.number().min(1).max(200).default(50),
      offset: z.number().min(0).default(0),
      sortBy: z.enum(["detectedAt", "severity", "metric", "value"]).default("detectedAt"),
      sortDir: z.enum(["asc", "desc"]).default("desc"),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [], total: 0 };

      const conditions = [];
      if (input.metric) conditions.push(eq(breachEvents.metric, input.metric));
      if (input.severity) conditions.push(eq(breachEvents.severity, input.severity));
      if (input.acknowledged !== undefined) {
        conditions.push(eq(breachEvents.acknowledged, input.acknowledged));
      }
      if (input.from) conditions.push(gte(breachEvents.detectedAt, new Date(input.from)));
      if (input.to) conditions.push(lte(breachEvents.detectedAt, new Date(input.to)));

      const where = conditions.length > 0 ? and(...conditions) : undefined;

      const [rows, countRows] = await Promise.all([
        db.select().from(breachEvents)
          .where(where)
          .orderBy(input.sortDir === "desc" ? desc(breachEvents.detectedAt) : breachEvents.detectedAt)
          .limit(input.limit)
          .offset(input.offset),
        db.select().from(breachEvents).where(where),
      ]);

      return {
        events: rows.map(r => ({
          id: r.id,
          metric: r.metric,
          severity: r.severity,
          message: r.message,
          value: r.value,
          threshold: r.threshold,
          acknowledged: r.acknowledged === true,
          detectedAt: r.detectedAt.toISOString(),
          acknowledgedAt: r.acknowledgedAt?.toISOString() ?? null,
        })),
        total: countRows.length,
      };
    }),

  acknowledgeBreaches: publicProcedure
    .input(z.object({
      ids: z.array(z.number()).min(1).max(100),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { acknowledged: 0 };

      await db.update(breachEvents)
        .set({ acknowledged: true, acknowledgedAt: new Date() })
        .where(and(
          inArray(breachEvents.id, input.ids),
          eq(breachEvents.acknowledged, false),
        ));

      return { acknowledged: input.ids.length };
    }),

  // ── Unacknowledged breach count (for sidebar badge) ──────────────────────
  unacknowledgedCount: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { count: 0 };
      try {
        const rows = await db.select({ id: breachEvents.id })
          .from(breachEvents)
          .where(eq(breachEvents.acknowledged, false));
        return { count: rows.length };
      } catch {
        return { count: 0 };
      }
    }),

  // ── Named alert rules ─────────────────────────────────────────────────────
  listAlertRules: publicProcedure
    .query(async () => {
      const db = await getDb();
      if (!db) return { rules: [] };
      try {
        const rules = await db.select().from(namedAlertRules).orderBy(namedAlertRules.createdAt);
        return { rules };
      } catch {
        return { rules: [] };
      }
    }),

  saveAlertRule: publicProcedure
    .input(z.object({
      id: z.number().optional(),
      name: z.string().min(1).max(128),
      metric: z.enum(["kafka_lag", "redis_memory"]),
      target: z.string().min(1).max(128),
      severity: z.enum(["warn", "critical"]),
      threshold: z.number().int().min(1).max(100000),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      if (input.id) {
        await db.update(namedAlertRules)
          .set({
            name: input.name,
            metric: input.metric,
            target: input.target,
            severity: input.severity,
            threshold: input.threshold,
          })
          .where(eq(namedAlertRules.id, input.id));
        return { ok: true, id: input.id };
      } else {
        const result = await db.insert(namedAlertRules).values({
          name: input.name,
          metric: input.metric,
          target: input.target,
          severity: input.severity,
          threshold: input.threshold,
          enabled: true,
        });
        // PostgreSQL returns the inserted row; grab its id
        const inserted = result as unknown as Array<{ id: number }>;
        return { ok: true, id: Array.isArray(inserted) && inserted[0] ? inserted[0].id : null };
      }
    }),

  deleteAlertRule: publicProcedure
    .input(z.object({ id: z.number() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.delete(namedAlertRules).where(eq(namedAlertRules.id, input.id));
      return { ok: true };
    }),

  toggleAlertRule: publicProcedure
    .input(z.object({ id: z.number(), enabled: z.boolean() }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) throw new Error("Database unavailable");
      await db.update(namedAlertRules)
        .set({ enabled: input.enabled, updatedAt: new Date() })
        .where(eq(namedAlertRules.id, input.id));
      return { ok: true };
    }),

  // ── Acknowledge all matching unacknowledged breaches ──────────────────────
  acknowledgeAll: publicProcedure
    .input(z.object({
      metric: z.string().optional(),
      severity: z.enum(["warn", "critical", "all"]).optional(),
      searchText: z.string().optional(),
    }))
    .mutation(async ({ input }) => {
      const db = await getDb();
      if (!db) return { acknowledged: 0 };
      try {
        // Build conditions: always restrict to unacknowledged
        const conditions = [eq(breachEvents.acknowledged, false)];
        if (input.metric && input.metric !== "all") {
          conditions.push(eq(breachEvents.metric, input.metric));
        }
        if (input.severity && input.severity !== "all") {
          conditions.push(eq(breachEvents.severity, input.severity));
        }
        // Fetch matching IDs first (MySQL doesn't support UPDATE with LIMIT easily)
        const rows = await db.select({ id: breachEvents.id })
          .from(breachEvents)
          .where(and(...conditions));
        if (rows.length === 0) return { acknowledged: 0 };
        const ids = rows.map(r => r.id);
        await db.update(breachEvents)
          .set({ acknowledged: true, acknowledgedAt: new Date() })
          .where(inArray(breachEvents.id, ids));
        return { acknowledged: ids.length };
      } catch {
        return { acknowledged: 0 };
      }
    }),

  // ── List ALL matching breaches (no pagination) for CSV full-export ────────
  listAllBreaches: publicProcedure
    .input(z.object({
      metric: z.string().optional(),
      severity: z.enum(["warn", "critical", "all"]).optional(),
      acknowledged: z.enum(["all", "yes", "no"]).optional(),
      searchText: z.string().optional(),
      dateFrom: z.date().optional(),
      dateTo: z.date().optional(),
    }))
    .query(async ({ input }) => {
      const db = await getDb();
      if (!db) return { events: [] };
      try {
        const conditions = [];
        if (input.metric && input.metric !== "all") {
          conditions.push(eq(breachEvents.metric, input.metric));
        }
        if (input.severity && input.severity !== "all") {
          conditions.push(eq(breachEvents.severity, input.severity));
        }
        if (input.acknowledged === "yes") {
          conditions.push(eq(breachEvents.acknowledged, true));
        } else if (input.acknowledged === "no") {
          conditions.push(eq(breachEvents.acknowledged, false));
        }
        if (input.dateFrom) {
          conditions.push(gte(breachEvents.detectedAt, input.dateFrom));
        }
        if (input.dateTo) {
          conditions.push(lte(breachEvents.detectedAt, input.dateTo));
        }
        const rows = await db.select().from(breachEvents)
          .where(conditions.length > 0 ? and(...conditions) : undefined)
          .orderBy(desc(breachEvents.detectedAt))
          .limit(10000); // safety cap
        // Client-side text filter if needed
        const events = input.searchText
          ? rows.filter(r => r.message.toLowerCase().includes(input.searchText!.toLowerCase()))
          : rows;
        return { events };
      } catch {
        return { events: [] };
      }
    }),
  // ── PSP Health ──────────────────────────────────────────────────────────
  pspStats: publicProcedure
    .input(sourceInput)
    .query(async ({ input }) => {
      const forceMock = input?.forceMock ?? true;
      if (!forceMock) {
        const live = await fetchPaygate<typeof MOCK_PSP | null>("/psp/stats", null);
        if (live) return live;
      }
      return MOCK_PSP;
    }),

  pspHistory: publicProcedure
    .input(z.object({
      providerId: z.string(),
      hours: z.number().min(1).max(720).optional(),
      forceMock: z.boolean().optional(),
    }))
    .query(async ({ input }) => {
      const forceMock = input.forceMock ?? true;
      if (!forceMock) {
        const live = await fetchPaygate<Array<{ time: string; label: string; successRate: number; latencyMs: number; retryQueue: number }> | null>(
          `/psp/${input.providerId}/history?hours=${input.hours ?? 24}`,
          null,
        );
        if (live) return { history: live };
      }
      return { history: generatePspHistory(input.providerId, input.hours ?? 24) };
    }),
});
