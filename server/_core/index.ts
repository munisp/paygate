import "dotenv/config";
// OpenTelemetry tracing must be initialised before instrumented libraries
// (express, pg, ioredis) load. Gracefully no-ops when
// OTEL_EXPORTER_OTLP_ENDPOINT is unset.
import "../tracing";
import express from "express";
import { createServer, type Server } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
import { securityAuditJobHandler } from "../jobs/securityAuditJob";
import { complianceScorecardJobHandler } from "../jobs/complianceScorecardJob";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import { sdk } from "./sdk";
import { getDb } from "../db";
import { sql } from "drizzle-orm";
import { notifyOwner } from "./notification";
import { ENV, validateServerEnv } from "./env";
import { requestId, securityHeaders, corsMiddleware } from "../securityHeaders";
import { wafMiddleware } from "../wafMiddleware";
import { metricsMiddleware, metricsHandler } from "../metrics";
import { stripeWebhookHandler } from "../stripe";
import { getBridgeHealth } from "../middlewareBridge";
import { expressRateLimit, trpcApiRateLimit } from "../rateLimit";
import { csrfOriginGuard } from "./csrf";

// ─── Real infrastructure probes (raw RESP — no new dependencies) ─────────────

/**
 * Probe Redis memory usage via `INFO memory` over a raw TCP socket.
 * Returns used_memory as a percentage of maxmemory, or null when the
 * server has no maxmemory cap configured (percentage is meaningless then).
 * Throws when Redis is unreachable.
 */
function probeRedisMemoryPct(redisUrl: string, timeoutMs = 3000): Promise<number | null> {
  return new Promise((resolve, reject) => {
    let parsed: URL;
    try {
      parsed = new URL(redisUrl);
    } catch {
      return reject(new Error(`Invalid REDIS_URL: ${redisUrl}`));
    }
    const host = parsed.hostname;
    const port = parseInt(parsed.port || "6379", 10);
    const password = parsed.password ? decodeURIComponent(parsed.password) : null;

    const socket = net.createConnection({ host, port });
    let buffer = "";
    let stage: "auth" | "info" = password ? "auth" : "info";
    const timer = setTimeout(() => {
      socket.destroy();
      reject(new Error("Redis INFO probe timed out"));
    }, timeoutMs);

    const finish = (value: number | null) => {
      clearTimeout(timer);
      socket.destroy();
      resolve(value);
    };

    socket.on("error", (err) => {
      clearTimeout(timer);
      socket.destroy();
      reject(err);
    });

    socket.on("connect", () => {
      if (stage === "auth") {
        socket.write(`AUTH ${password}\r\n`);
      } else {
        socket.write("INFO memory\r\n");
      }
    });

    socket.on("data", (chunk) => {
      buffer += chunk.toString("utf8");
      if (stage === "auth") {
        if (buffer.includes("\r\n")) {
          if (buffer.startsWith("-")) {
            clearTimeout(timer);
            socket.destroy();
            return reject(new Error(`Redis AUTH failed: ${buffer.trim()}`));
          }
          stage = "info";
          buffer = "";
          socket.write("INFO memory\r\n");
        }
        return;
      }
      // Wait until the bulk reply looks complete (ends with \r\n and has the header).
      if (!buffer.startsWith("$") || !buffer.endsWith("\r\n")) return;
      const usedMatch = buffer.match(/used_memory:(\d+)/);
      const maxMatch = buffer.match(/maxmemory:(\d+)/);
      if (!usedMatch) {
        // Reply not fully received yet.
        if (buffer.length < 200) return;
        clearTimeout(timer);
        socket.destroy();
        return reject(new Error("Redis INFO reply missing used_memory"));
      }
      const used = parseInt(usedMatch[1], 10);
      const max = maxMatch ? parseInt(maxMatch[1], 10) : 0;
      finish(max > 0 ? (used / max) * 100 : null);
    });
  });
}

function isPortAvailable(port: number): Promise<boolean> {
  return new Promise(resolve => {
    const server = net.createServer();
    server.listen(port, () => {
      server.close(() => resolve(true));
    });
    server.on("error", () => resolve(false));
  });
}

async function findAvailablePort(startPort: number = 3000): Promise<number> {
  for (let port = startPort; port < startPort + 20; port++) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }
  throw new Error(`No available port found starting from ${startPort}`);
}

async function startServer() {
  // Fail closed on missing critical configuration (production) and warn
  // loudly about unconfigured integrations everywhere else.
  validateServerEnv();

  const app = express();
  const server = createServer(app);

  // ── Security middleware chain (was previously dead code) ──────────────────
  app.use(requestId);
  app.use(securityHeaders);
  app.use(corsMiddleware);
  app.use(metricsMiddleware);

  // ── Rate limiting (fail-closed: Redis sliding window when REDIS_URL is set,
  //    in-process store with a loud WARN otherwise) ───────────────────────────
  // Inbound webhooks: signature verification already bounds abuse, but cap
  // anonymous delivery bursts (50/min/IP, clamped to 20/min for anonymous).
  app.use("/api/webhooks", expressRateLimit({ max: 50, windowMs: 60_000, keyPrefix: "webhook:deliver" }));
  // OAuth login/callback/logout: brute-force guard (10/min/IP).
  app.use("/api/oauth", expressRateLimit({ max: 10, windowMs: 60_000, keyPrefix: "auth:oauth" }));
  // Cron heartbeat: cron-token guarded, still throttled against token leaks.
  app.use("/api/scheduled", expressRateLimit({ max: 10, windowMs: 60_000, keyPrefix: "auth:scheduled" }));

  // ── CSRF origin guard: cookie-authenticated mutating requests must present
  //    a same-origin/allowlisted Origin (or Referer) header. Bearer-token
  //    requests are CSRF-immune and pass through. ─────────────────────────────
  app.use("/api/trpc", csrfOriginGuard);
  app.use("/api/scheduled", csrfOriginGuard);

  // ── Stripe inbound webhook ─────────────────────────────────────────────────
  // MUST be mounted with the raw body parser BEFORE express.json — Stripe
  // signature verification requires the exact unparsed payload bytes.
  app.post(
    "/api/webhooks/stripe",
    express.raw({ type: "application/json" }),
    (req, res) => { void stripeWebhookHandler(req, res); },
  );

  // ── Body parsers — scoped limits (P2-1) ────────────────────────────────────
  // Large payloads only reach /api/trpc (dispute-evidence base64 uploads up to
  // ~14 MB — see disputes.uploadEvidence in server/routers.ts). Every other
  // route gets a 1 MB cap to bound memory-exhaustion surface.
  app.use("/api/trpc", express.json({ limit: "25mb" }));
  app.use(express.json({ limit: "1mb" }));
  app.use(express.urlencoded({ limit: "1mb", extended: true }));

  // WAF inspects parsed bodies — must run after the body parsers.
  app.use(wafMiddleware);

  // ── Prometheus scrape endpoint (k8s pod annotations target /api/metrics) ──
  app.get("/api/metrics", (req, res) => { void metricsHandler(req, res); });

  // ── Lightweight liveness probe: ALWAYS 200 while the Node process is up.
  // k8s livenessProbe targets this — /api/health (dependency-aware, 503s when
  // the DB is down) is the readinessProbe; using a dependency-aware probe for
  // liveness crash-loops pods during a DB outage for no benefit.
  app.get("/healthz", (_req, res) => {
    res.status(200).json({ status: "alive", timestamp: new Date().toISOString() });
  });

  // ── Health probe (Dockerfile HEALTHCHECK + k8s readiness) ────────────────
  app.get("/api/health", async (_req, res) => {
    const bridge = getBridgeHealth();
    try {
      const db = await getDb();
      await db.execute(sql`SELECT 1`);
      res.status(200).json({
        status: bridge.degraded ? "degraded" : "ok",
        db: "up",
        bridge: bridge.degraded ? "degraded" : "up",
        bridgeFailuresInWindow: bridge.failuresInWindow,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      res.status(503).json({
        status: "unavailable",
        db: "down",
        bridge: bridge.degraded ? "degraded" : "up",
        error: err instanceof Error ? err.message : String(err),
        timestamp: new Date().toISOString(),
      });
    }
  });

  registerStorageProxy(app);
  registerOAuthRoutes(app);

  // ── Heartbeat: periodic breach check ─────────────────────────────────────
  app.post("/api/scheduled/checkBreaches", async (req, res) => {
    try {
      const user = await sdk.authenticateRequest(req);
      if (!user.isCron) {
        return res.status(403).json({ error: "cron-only endpoint" });
      }

      const defaults = { lagWarn: 5, lagCritical: 20, memWarnPct: 70, memCriticalPct: 85 };
      let thresholds = defaults;
      let db: Awaited<ReturnType<typeof getDb>> | null = null;
      try {
        db = await getDb();
        // Use owner thresholds if available (alert_thresholds — see drizzle/0000_wonderful_wallow.sql)
        const result: any = await db.execute(sql`
          SELECT "lagWarn", "lagCritical", "memWarnPct", "memCriticalPct"
          FROM alert_thresholds LIMIT 1
        `);
        const rows: any[] = result?.rows ?? result ?? [];
        if (rows.length > 0) {
          const { lagWarn, lagCritical, memWarnPct, memCriticalPct } = rows[0];
          thresholds = {
            lagWarn: Number(lagWarn), lagCritical: Number(lagCritical),
            memWarnPct: Number(memWarnPct), memCriticalPct: Number(memCriticalPct),
          };
        }
      } catch { /* use defaults */ }

      type BreachItem = { metric: string; severity: "warn" | "critical"; message: string; value: number; threshold: number };
      const breachItems: BreachItem[] = [];

      // Kafka consumer-lag probe: no lag source is wired to this heartbeat,
      // so the check is loudly DISABLED. We never alert on fabricated lag.
      if (!ENV.kafkaBootstrapServers) {
        console.warn("[heartbeat] Kafka-lag check DISABLED: KAFKA_BOOTSTRAP_SERVERS not configured — no real lag source; skipping (never alerting on fabricated data)");
      } else {
        console.warn("[heartbeat] Kafka-lag check DISABLED: no consumer-group lag probe wired to this heartbeat; configure the middleware bridge lag endpoint before enabling");
      }

      // Redis memory probe: real INFO memory reading when REDIS_URL is set.
      if (ENV.redisUrl) {
        try {
          const memPct = await probeRedisMemoryPct(ENV.redisUrl);
          if (memPct === null) {
            console.warn("[heartbeat] Redis has no maxmemory cap configured — memory-percentage check skipped");
          } else if (memPct >= thresholds.memCriticalPct) {
            breachItems.push({ metric: "redis_memory", severity: "critical", message: `Heartbeat: Redis memory CRITICAL: ${memPct.toFixed(1)}% (threshold: ${thresholds.memCriticalPct}%)`, value: memPct, threshold: thresholds.memCriticalPct });
          } else if (memPct >= thresholds.memWarnPct) {
            breachItems.push({ metric: "redis_memory", severity: "warn", message: `Heartbeat: Redis memory WARNING: ${memPct.toFixed(1)}% (threshold: ${thresholds.memWarnPct}%)`, value: memPct, threshold: thresholds.memWarnPct });
          }
        } catch (err) {
          console.warn(`[heartbeat] Redis probe failed (check skipped): ${err instanceof Error ? err.message : String(err)}`);
        }
      } else {
        console.warn("[heartbeat] Redis-memory check DISABLED: REDIS_URL not configured");
      }

      if (db && breachItems.length > 0) {
        try {
          for (const b of breachItems) {
            await db.execute(sql`
              INSERT INTO breach_events (metric, severity, message, value, threshold)
              VALUES (${b.metric}, ${b.severity}, ${b.message}, ${Math.round(b.value)}, ${b.threshold})
            `);
          }
        } catch { /* non-fatal */ }
      }

      const criticalItems = breachItems.filter(b => b.severity === "critical");
      if (criticalItems.length > 0) {
        const title = `PayGate Heartbeat: ${criticalItems.length} critical breach${criticalItems.length > 1 ? "es" : ""} detected`;
        const content = [`Detected at ${new Date().toISOString()} UTC`, "", ...criticalItems.map(b => `🚨 ${b.message}`)].join("\n");
        await notifyOwner({ title, content });
      }

      return res.json({ ok: true, breaches: breachItems.length, critical: criticalItems.length });
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      return res.status(500).json({ error: message, timestamp: new Date().toISOString() });
    }
  });

  // ── Heartbeat: nightly security audit (02:00 UTC) + compliance scorecard (01:00 UTC) ──
  app.post("/api/scheduled/security-audit", securityAuditJobHandler);
  app.post("/api/scheduled/compliance-scorecard", complianceScorecardJobHandler);

  // tRPC API — every procedure throttled by the classifier (read / mutation /
  // financial / payout / export buckets; see server/rateLimit.ts).
  app.use("/api/trpc", trpcApiRateLimit());
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
    })
  );
  // development mode uses Vite, production mode uses static files
  if (process.env.NODE_ENV === "development") {
    await setupVite(app, server);
  } else {
    serveStatic(app);
  }

  const preferredPort = parseInt(process.env.PORT || "3000");
  const port = await findAvailablePort(preferredPort);

  if (port !== preferredPort) {
    console.log(`Port ${preferredPort} is busy, using port ${port} instead`);
  }

  server.listen(port, () => {
    console.log(`Server running on http://localhost:${port}/`);
    if (!ENV.stripeWebhookSecret) {
      console.warn(
        "[boot] WARNING: STRIPE_WEBHOOK_SECRET is not set — POST /api/webhooks/stripe will return 503 and Stripe events will NOT be processed"
      );
    }
    // Background workers start only after the HTTP server (and /api/health)
    // is accepting traffic, so k8s readiness is not delayed by worker boot.
    void startBackgroundWorkers();
  });

  registerGracefulShutdown(server);
}

startServer().catch(console.error);

// ─── Background workers ───────────────────────────────────────────────────────
// Workers that are designed for in-process boot (each module's docstring says
// "call once in server/_core/index.ts") but previously had zero call sites.
// Each starter is internally idempotent; the workersStarted flag plus the
// test-env guard prevents double-start when this module is imported by tests.
type WorkerHandle = { start: () => void; stop?: () => void };
const workerStops: Array<{ name: string; stop: () => void }> = [];
let workersStarted = false;

const WORKER_LOADERS: Array<{ name: string; load: () => Promise<WorkerHandle> }> = [
  { name: "webhookRetry", load: async () => { const m = await import("../webhookRetry"); return { start: m.startWebhookRetryWorker, stop: m.stopWebhookRetryWorker }; } },
  { name: "cronJobs", load: async () => { const m = await import("../cronJobs"); return { start: m.startCronJobs }; } },
  { name: "sipProcessor", load: async () => { const m = await import("../jobs/sipProcessor"); return { start: m.startSIPProcessor, stop: m.stopSIPProcessor }; } },
  { name: "idempotencyCleanup", load: async () => { const m = await import("../idempotencyCleanup"); return { start: m.startIdempotencyCleanupWorker, stop: m.stopIdempotencyCleanupWorker }; } },
  { name: "nipBankRefresh", load: async () => { const m = await import("../nipBankRefresh"); return { start: m.startNipBankRefreshWorker, stop: m.stopNipBankRefreshWorker }; } },
  { name: "notificationPurge", load: async () => { const m = await import("../notificationPurge"); return { start: m.startNotificationPurgeWorker, stop: m.stopNotificationPurgeWorker }; } },
  { name: "pushTokenCleanup", load: async () => { const m = await import("../pushTokenCleanup"); return { start: m.startPushTokenCleanupWorker, stop: m.stopPushTokenCleanupWorker }; } },
  { name: "reservationExpiry", load: async () => { const m = await import("../reservationExpiryWorker"); return { start: m.startReservationExpiryWorker }; } },
  { name: "slaEscalation", load: async () => { const m = await import("../slaEscalation"); return { start: m.startSlaEscalationScheduler, stop: m.stopSlaEscalationScheduler }; } },
  { name: "usdcBalanceMonitor", load: async () => { const m = await import("../usdcBalanceMonitor"); return { start: m.startUSDCBalanceMonitor, stop: m.stopUSDCBalanceMonitor }; } },
];

async function startBackgroundWorkers(): Promise<void> {
  if (workersStarted) return;
  if (process.env.NODE_ENV === "test" || process.env.VITEST) {
    console.info("[workers] test environment detected — background workers not started");
    return;
  }
  workersStarted = true;
  console.info(`[workers] starting ${WORKER_LOADERS.length} background workers`);
  for (const def of WORKER_LOADERS) {
    try {
      const handle = await def.load();
      handle.start();
      if (handle.stop) workerStops.push({ name: def.name, stop: handle.stop });
      console.info(`[workers] started: ${def.name}`);
    } catch (err) {
      // A worker that fails to start is loud but must not take down the API.
      console.error(`[workers] FAILED to start ${def.name}:`, err instanceof Error ? err.message : err);
    }
  }
}

function stopBackgroundWorkers(): void {
  for (const { name, stop } of workerStops) {
    try {
      stop();
      console.info(`[shutdown] worker stopped: ${name}`);
    } catch (err) {
      console.warn(`[shutdown] worker stop failed (${name}):`, err instanceof Error ? err.message : err);
    }
  }
  // cronJobs and reservationExpiry expose no stop handle; their intervals are
  // cleared by process exit below.
}

// ─── Graceful shutdown (P1-11) ────────────────────────────────────────────────
let shuttingDown = false;

function registerGracefulShutdown(server: Server): void {
  const onSignal = (signal: string) => {
    void gracefulShutdown(signal, server);
  };
  process.on("SIGTERM", onSignal);
  process.on("SIGINT", onSignal);
}

async function gracefulShutdown(signal: string, server: Server): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`[shutdown] ${signal} received — beginning graceful shutdown`);

  // Hard backstop: never hang forever on a stuck connection.
  const forceTimer = setTimeout(() => {
    console.error("[shutdown] drain timed out after 15s — forcing exit(1)");
    process.exit(1);
  }, 15_000);
  forceTimer.unref();

  // 1. Stop accepting new connections; drain in-flight requests.
  await new Promise<void>((resolve) => {
    server.close(() => {
      console.info("[shutdown] HTTP server closed — in-flight requests drained");
      resolve();
    });
    // If there are no active connections server.close may never fire on some
    // Node versions when keep-alive sockets linger — closeIdle handles that.
    if (typeof (server as any).closeIdleConnections === "function") {
      (server as any).closeIdleConnections();
    }
  });

  // 2. Stop cron / background workers.
  stopBackgroundWorkers();

  // 3. Close Redis.
  try {
    const { getRedis } = await import("../redisClient");
    const redis = await getRedis();
    if (redis) {
      redis.disconnect();
      console.info("[shutdown] Redis connection closed");
    } else {
      console.info("[shutdown] Redis not configured — nothing to close");
    }
  } catch (err) {
    console.warn("[shutdown] Redis close failed:", err instanceof Error ? err.message : err);
  }

  // 4. Kafka: the producer registers its own beforeExit disconnect hook in
  // kafkaClient.ts; consumer stop handles are returned per-startConsumer call.
  console.info("[shutdown] Kafka producer disconnect delegated to kafkaClient beforeExit hook");

  // 5. Close the Postgres pool.
  try {
    const db = await getDb();
    await (db as any).$client?.end?.({ timeout: 5 });
    console.info("[shutdown] Postgres pool closed");
  } catch (err) {
    console.warn("[shutdown] Postgres close failed:", err instanceof Error ? err.message : err);
  }

  clearTimeout(forceTimer);
  console.info("[shutdown] graceful shutdown complete — exiting 0");
  process.exit(0);
}
