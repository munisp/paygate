import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerStorageProxy } from "./storageProxy";
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

  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));

  // WAF inspects parsed bodies — must run after the body parsers.
  app.use(wafMiddleware);

  // ── Health probe (Dockerfile HEALTHCHECK + k8s liveness/readiness) ────────
  app.get("/api/health", async (_req, res) => {
    try {
      const db = await getDb();
      await db.execute(sql`SELECT 1`);
      res.status(200).json({ status: "ok", db: "up", timestamp: new Date().toISOString() });
    } catch (err) {
      res.status(503).json({
        status: "unavailable",
        db: "down",
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

  // tRPC API
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
  });
}

startServer().catch(console.error);
