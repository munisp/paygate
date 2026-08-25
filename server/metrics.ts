/**
 * PayGate Prometheus Metrics
 *
 * Exposes a /metrics endpoint for Prometheus scraping.
 * Uses prom-client for Node.js metrics collection.
 *
 * Metrics exposed:
 *   - Default Node.js metrics (CPU, memory, event loop lag, GC)
 *   - HTTP request duration histogram (by route, method, status)
 *   - tRPC procedure call counter (by procedure, status)
 *   - Active WebSocket/SSE connections gauge
 *   - Database query duration histogram
 *   - Cache hit/miss counter
 *
 * Mount in server/_core/index.ts:
 *   import { metricsMiddleware, metricsHandler } from "../metrics";
 *   app.use(metricsMiddleware);
 *   app.get("/metrics", metricsHandler);
 */

import type { Request, Response, NextFunction } from "express";

// ─── Lazy prom-client import ──────────────────────────────────────────────────
// prom-client is an optional dependency; if not installed, metrics are no-ops.
let promClient: any = null;
let registry: any = null;

async function getPromClient() {
  if (promClient) return promClient;
  try {
    promClient = await import("prom-client" as any);
    registry = new promClient.Registry();
    promClient.collectDefaultMetrics({
      register: registry,
      prefix: "paygate_node_",
    });
    initCustomMetrics();
  } catch {
    // prom-client not installed — metrics disabled
  }
  return promClient;
}

// ─── Custom metrics ───────────────────────────────────────────────────────────

let httpRequestDuration: any;
let trpcCallCounter: any;
let activeConnections: any;
let dbQueryDuration: any;
let cacheHitCounter: any;

function initCustomMetrics() {
  if (!promClient) return;

  httpRequestDuration = new promClient.Histogram({
    name: "paygate_http_request_duration_seconds",
    help: "HTTP request duration in seconds",
    labelNames: ["method", "route", "status_code"],
    buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5],
    registers: [registry],
  });

  trpcCallCounter = new promClient.Counter({
    name: "paygate_trpc_calls_total",
    help: "Total number of tRPC procedure calls",
    labelNames: ["procedure", "status"],
    registers: [registry],
  });

  activeConnections = new promClient.Gauge({
    name: "paygate_active_connections",
    help: "Number of active SSE/WebSocket connections",
    labelNames: ["type"],
    registers: [registry],
  });

  dbQueryDuration = new promClient.Histogram({
    name: "paygate_db_query_duration_seconds",
    help: "Database query duration in seconds",
    labelNames: ["operation", "table"],
    buckets: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1],
    registers: [registry],
  });

  cacheHitCounter = new promClient.Counter({
    name: "paygate_cache_operations_total",
    help: "Cache hit/miss counter",
    labelNames: ["namespace", "result"],
    registers: [registry],
  });
}

// ─── HTTP metrics middleware ──────────────────────────────────────────────────

export function metricsMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!promClient) {
    next();
    return;
  }
  const start = Date.now();
  res.on("finish", () => {
    const duration = (Date.now() - start) / 1000;
    const route = req.route?.path ?? req.path ?? "unknown";
    httpRequestDuration?.observe(
      { method: req.method, route, status_code: res.statusCode },
      duration
    );
  });
  next();
}

// ─── Metrics endpoint handler ─────────────────────────────────────────────────

export async function metricsHandler(req: Request, res: Response) {
  const client = await getPromClient();
  if (!client || !registry) {
    res.status(503).send("# Metrics unavailable — prom-client not installed\n");
    return;
  }
  res.set("Content-Type", registry.contentType);
  res.end(await registry.metrics());
}

// ─── Helper functions for other modules ──────────────────────────────────────

/** Record a tRPC procedure call. */
export function recordTrpcCall(procedure: string, status: "success" | "error") {
  trpcCallCounter?.inc({ procedure, status });
}

/** Record a database query duration. */
export function recordDbQuery(operation: string, table: string, durationMs: number) {
  dbQueryDuration?.observe({ operation, table }, durationMs / 1000);
}

/** Record a cache hit or miss. */
export function recordCacheOp(namespace: string, result: "hit" | "miss") {
  cacheHitCounter?.inc({ namespace, result });
}

/** Increment active connection count. */
export function incActiveConnections(type: "sse" | "ws") {
  activeConnections?.inc({ type });
}

/** Decrement active connection count. */
export function decActiveConnections(type: "sse" | "ws") {
  activeConnections?.dec({ type });
}

// Initialise on module load
getPromClient().catch((e) => console.warn("[metrics] prom-client initialisation failed:", e instanceof Error ? e.message : e));
