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
import { alertThresholds, breachEvents } from "../../drizzle/schema";
import { eq, and } from "drizzle-orm";
import { notifyOwner } from "./notification";
import { ENV } from "./env";

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
  const app = express();
  const server = createServer(app);
  // Configure body parser with larger size limit for file uploads
  app.use(express.json({ limit: "50mb" }));
  app.use(express.urlencoded({ limit: "50mb", extended: true }));
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
        if (db) {
          // Use owner thresholds if available
          const rows = await db.select().from(alertThresholds).limit(1);
          if (rows.length > 0) {
            const { lagWarn, lagCritical, memWarnPct, memCriticalPct } = rows[0];
            thresholds = { lagWarn, lagCritical, memWarnPct, memCriticalPct };
          }
        }
      } catch { /* use defaults */ }

      // Fetch mock Kafka/Redis data (same as checkBreaches mutation)
      const MOCK_KAFKA_LAG = 12; // matches MOCK_CONSUMERS lag in proxy.ts
      const MOCK_REDIS_MEM_PCT = 62;

      type BreachItem = { metric: string; severity: "warn" | "critical"; message: string; value: number; threshold: number };
      const breachItems: BreachItem[] = [];

      if (MOCK_KAFKA_LAG > thresholds.lagCritical) {
        breachItems.push({ metric: "kafka_lag", severity: "critical", message: `Heartbeat: Consumer lag CRITICAL: ${MOCK_KAFKA_LAG} msgs (threshold: ${thresholds.lagCritical})`, value: MOCK_KAFKA_LAG, threshold: thresholds.lagCritical });
      } else if (MOCK_KAFKA_LAG > thresholds.lagWarn) {
        breachItems.push({ metric: "kafka_lag", severity: "warn", message: `Heartbeat: Consumer lag WARNING: ${MOCK_KAFKA_LAG} msgs (threshold: ${thresholds.lagWarn})`, value: MOCK_KAFKA_LAG, threshold: thresholds.lagWarn });
      }

      if (MOCK_REDIS_MEM_PCT >= thresholds.memCriticalPct) {
        breachItems.push({ metric: "redis_memory", severity: "critical", message: `Heartbeat: Redis memory CRITICAL: ${MOCK_REDIS_MEM_PCT}% (threshold: ${thresholds.memCriticalPct}%)`, value: MOCK_REDIS_MEM_PCT, threshold: thresholds.memCriticalPct });
      } else if (MOCK_REDIS_MEM_PCT >= thresholds.memWarnPct) {
        breachItems.push({ metric: "redis_memory", severity: "warn", message: `Heartbeat: Redis memory WARNING: ${MOCK_REDIS_MEM_PCT}% (threshold: ${thresholds.memWarnPct}%)`, value: MOCK_REDIS_MEM_PCT, threshold: thresholds.memWarnPct });
      }

      if (db && breachItems.length > 0) {
        try {
          await db.insert(breachEvents).values(breachItems.map(b => ({
            metric: b.metric, severity: b.severity, message: b.message, value: b.value, threshold: b.threshold,
          })));
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
