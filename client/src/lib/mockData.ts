// Mock data for the PayGate Gateway & Workflow Monitor
// In production, replace these with real API calls to the PayGate backend

export type ServiceHealth = "healthy" | "degraded" | "critical" | "unknown";

export interface GatewayRoute {
  id: string;
  name: string;
  path: string;
  methods: string[];
  plugins: string[];
  upstreamUrl: string;
  status: ServiceHealth;
  requestsPerMin: number;
  latencyP99: number;
}

export interface GatewayConsumer {
  id: string;
  username: string;
  merchantId: string;
  createdAt: string;
  plugins: string[];
}

export interface GatewayMetrics {
  requestsPerSec: number;
  latencyP50: number;
  latencyP95: number;
  latencyP99: number;
  errorRate: number;
  activeConnections: number;
  totalRequests24h: number;
  requestHistory: { time: string; rps: number; errors: number }[];
}

export interface PluginStat {
  name: string;
  count: number;
  category: string;
}

export interface WorkflowRun {
  id: string;
  workflowType: string;
  status: "running" | "completed" | "failed" | "terminated" | "cancelled" | "timed_out";
  startTime: string;
  closeTime?: string;
  taskQueue: string;
  merchantId?: string;
  runId: string;
}

export interface PgBouncerPool {
  database: string;
  user: string;
  clActive: number;
  clWaiting: number;
  svActive: number;
  svIdle: number;
  svUsed: number;
  maxWait: number;
  poolMode: string;
}

// ── Mock Gateway Data ──────────────────────────────────────────────────────

export const mockRoutes: GatewayRoute[] = [
  { id: "r-001", name: "Payment Initiation", path: "/api/v1/payments", methods: ["POST"], plugins: ["key-auth", "rate-limiting", "opentelemetry"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 342, latencyP99: 48 },
  { id: "r-002", name: "Transaction Query", path: "/api/v1/transactions/:id", methods: ["GET"], plugins: ["key-auth", "opentelemetry"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 891, latencyP99: 22 },
  { id: "r-003", name: "Webhook Inbound", path: "/webhooks/mojaloop", methods: ["POST"], plugins: ["hmac-auth", "opentelemetry"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 56, latencyP99: 31 },
  { id: "r-004", name: "KYC Submission", path: "/api/v1/kyc", methods: ["POST", "GET"], plugins: ["key-auth", "rate-limiting"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 23, latencyP99: 67 },
  { id: "r-005", name: "Admin Dashboard", path: "/admin/*", methods: ["GET", "POST", "PUT", "DELETE"], plugins: ["jwt", "ip-restriction"], upstreamUrl: "http://paygate-api:3000", status: "degraded", requestsPerMin: 12, latencyP99: 210 },
  { id: "r-006", name: "STR Filing", path: "/api/v1/str", methods: ["POST", "GET"], plugins: ["key-auth", "rate-limiting"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 4, latencyP99: 55 },
  { id: "r-007", name: "Chargeback API", path: "/api/v1/chargebacks", methods: ["POST", "GET", "PUT"], plugins: ["key-auth", "opentelemetry"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 18, latencyP99: 38 },
  { id: "r-008", name: "Velocity Check", path: "/api/v1/velocity", methods: ["POST"], plugins: ["key-auth", "rate-limiting", "opentelemetry"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 1204, latencyP99: 12 },
  { id: "r-009", name: "Interchange Rates", path: "/api/v1/interchange", methods: ["GET"], plugins: ["key-auth"], upstreamUrl: "http://paygate-api:3000", status: "healthy", requestsPerMin: 7, latencyP99: 19 },
];

export const mockConsumers: GatewayConsumer[] = [
  { id: "c-001", username: "merchant_acme_prod", merchantId: "mch_acme_001", createdAt: "2026-06-01T09:00:00Z", plugins: ["key-auth", "rate-limiting"] },
  { id: "c-002", username: "merchant_globex_prod", merchantId: "mch_globex_002", createdAt: "2026-06-15T14:30:00Z", plugins: ["key-auth"] },
  { id: "c-003", username: "merchant_initech_prod", merchantId: "mch_initech_003", createdAt: "2026-07-01T11:00:00Z", plugins: ["key-auth", "rate-limiting"] },
  { id: "c-004", username: "merchant_umbrella_prod", merchantId: "mch_umbrella_004", createdAt: "2026-07-08T16:45:00Z", plugins: ["key-auth"] },
  { id: "c-005", username: "partner_mojaloop_inbound", merchantId: "sys_mojaloop", createdAt: "2026-05-20T08:00:00Z", plugins: ["hmac-auth"] },
];

export const mockMetrics: GatewayMetrics = {
  requestsPerSec: 43.2,
  latencyP50: 18,
  latencyP95: 62,
  latencyP99: 148,
  errorRate: 0.31,
  activeConnections: 284,
  totalRequests24h: 3_741_200,
  requestHistory: Array.from({ length: 24 }, (_, i) => ({
    time: `${String(i).padStart(2, "0")}:00`,
    rps: Math.round(20 + Math.random() * 60 + (i > 8 && i < 20 ? 30 : 0)),
    errors: Math.round(Math.random() * 3),
  })),
};

export const mockPluginStats: PluginStat[] = [
  { name: "key-auth", count: 8, category: "Authentication" },
  { name: "rate-limiting", count: 5, category: "Traffic Control" },
  { name: "opentelemetry", count: 4, category: "Observability" },
  { name: "hmac-auth", count: 1, category: "Authentication" },
  { name: "jwt", count: 1, category: "Authentication" },
  { name: "ip-restriction", count: 1, category: "Security" },
];

// ── Mock Temporal Data ─────────────────────────────────────────────────────

export const mockWorkflows: WorkflowRun[] = [
  { id: "CrossBorderTransfer-mch_acme-1720789200", workflowType: "CrossBorderTransfer", status: "running", startTime: "2026-07-12T13:00:00Z", taskQueue: "payment-processing", merchantId: "mch_acme_001", runId: "run-a1b2c3d4" },
  { id: "KYCVerification-mch_globex-1720785600", workflowType: "KYCVerification", status: "running", startTime: "2026-07-12T12:00:00Z", taskQueue: "kyc-processing", merchantId: "mch_globex_002", runId: "run-e5f6g7h8" },
  { id: "ChargebackResolution-cb_001-1720782000", workflowType: "ChargebackResolution", status: "completed", startTime: "2026-07-12T11:00:00Z", closeTime: "2026-07-12T11:45:00Z", taskQueue: "chargeback-processing", merchantId: "mch_acme_001", runId: "run-i9j0k1l2" },
  { id: "STRFiling-str_007-1720778400", workflowType: "STRFiling", status: "failed", startTime: "2026-07-12T10:00:00Z", closeTime: "2026-07-12T10:05:00Z", taskQueue: "compliance", merchantId: "mch_umbrella_004", runId: "run-m3n4o5p6" },
  { id: "VelocityAudit-mch_initech-1720774800", workflowType: "VelocityAudit", status: "running", startTime: "2026-07-12T09:00:00Z", taskQueue: "risk-processing", merchantId: "mch_initech_003", runId: "run-q7r8s9t0" },
  { id: "InterchangeReconciliation-daily-1720771200", workflowType: "InterchangeReconciliation", status: "completed", startTime: "2026-07-12T08:00:00Z", closeTime: "2026-07-12T08:22:00Z", taskQueue: "reconciliation", runId: "run-u1v2w3x4" },
  { id: "CrossBorderTransfer-mch_umbrella-1720767600", workflowType: "CrossBorderTransfer", status: "timed_out", startTime: "2026-07-12T07:00:00Z", closeTime: "2026-07-12T07:30:00Z", taskQueue: "payment-processing", merchantId: "mch_umbrella_004", runId: "run-y5z6a7b8" },
  { id: "RegulatoryReport-q2-1720764000", workflowType: "RegulatoryReport", status: "running", startTime: "2026-07-12T06:00:00Z", taskQueue: "compliance", runId: "run-c9d0e1f2" },
];

// ── Mock PgBouncer Data ────────────────────────────────────────────────────

export const mockPgBouncerPools: PgBouncerPool[] = [
  { database: "paygate_db", user: "paygate_user", clActive: 42, clWaiting: 0, svActive: 38, svIdle: 12, svUsed: 0, maxWait: 0, poolMode: "transaction" },
  { database: "paygate_db", user: "paygate_readonly", clActive: 18, clWaiting: 0, svActive: 15, svIdle: 5, svUsed: 0, maxWait: 0, poolMode: "transaction" },
  { database: "pgbouncer", user: "pgbouncer", clActive: 1, clWaiting: 0, svActive: 0, svIdle: 0, svUsed: 0, maxWait: 0, poolMode: "statement" },
];

export const mockPoolConfig = {
  maxClientConn: 1000,
  defaultPoolSize: 25,
  reservePoolSize: 5,
  poolMode: "transaction",
  version: "PgBouncer 1.22.1",
  uptime: "11d 4h 32m",
};
