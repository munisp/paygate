import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
import path from "path";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import multer from "multer";
import { storagePut } from "../storage";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { startSlaEscalationScheduler } from "../slaEscalation";
import { constructWebhookEvent, isStripeConfigured } from "../stripe";

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

// ─── Rate Limiters ────────────────────────────────────────────────────────────
const globalLimiter = rateLimit({
  windowMs: 60_000,       // 1 minute
  max: 300,               // 300 req/min per IP
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many requests, please try again later." },
  skip: () => process.env.NODE_ENV === "development",
});

const authLimiter = rateLimit({
  windowMs: 15 * 60_000,  // 15 minutes
  max: 20,                // 20 auth attempts per 15 min
  standardHeaders: true,
  legacyHeaders: false,
  message: { error: "Too many authentication attempts, please try again later." },
  skip: () => process.env.NODE_ENV === "development",
});

const uploadLimiter = rateLimit({
  windowMs: 60_000,
  max: 30,
  message: { error: "Too many upload requests." },
  skip: () => process.env.NODE_ENV === "development",
});

async function startServer() {
  const app = express();
  const server = createServer(app);

  // ─── Security Headers ──────────────────────────────────────────────────────
  app.use(helmet({
    contentSecurityPolicy: false, // Disabled to allow Vite HMR in dev; enable in prod via CDN
    crossOriginEmbedderPolicy: false,
  }));

  // ─── Rate Limiting ─────────────────────────────────────────────────────────
  app.use(globalLimiter);
  app.use("/api/oauth", authLimiter);

  // ─── Stripe Webhook (MUST be before express.json() to preserve raw body) ──
  app.post(
    "/api/stripe/webhook",
    express.raw({ type: "application/json" }),
    async (req: any, res: any) => {
      const sig = req.headers["stripe-signature"] as string;
      if (!sig) return res.status(400).json({ error: "Missing stripe-signature header" });

      try {
        const event = constructWebhookEvent(req.body, sig);

        // Test events — return verification response immediately
        if (event.id.startsWith("evt_test_")) {
          console.log("[Stripe Webhook] Test event detected:", event.type);
          return res.json({ verified: true });
        }

        console.log(`[Stripe Webhook] Processing event: ${event.type} (${event.id})`);

        // Handle events
        switch (event.type) {
          case "payment_intent.succeeded": {
            const pi = event.data.object as any;
            console.log(`[Stripe] Payment succeeded: ${pi.id} — ${pi.amount} ${pi.currency}`);
            // Broadcast to SSE clients if merchant is connected
            const merchantId = pi.metadata?.merchant_id;
            if (merchantId) {
              (app as any)._sseBroadcast?.(merchantId, "payment_succeeded", {
                paymentIntentId: pi.id,
                amount: pi.amount,
                currency: pi.currency,
              });
            }
            break;
          }
          case "checkout.session.completed": {
            const session = event.data.object as any;
            console.log(`[Stripe] Checkout completed: ${session.id} — ${session.amount_total} ${session.currency}`);
            const merchantId = session.metadata?.merchant_id;
            if (merchantId) {
              (app as any)._sseBroadcast?.(merchantId, "checkout_completed", {
                sessionId: session.id,
                amountTotal: session.amount_total,
                currency: session.currency,
                customerEmail: session.customer_email,
              });
            }
            break;
          }
          case "payment_intent.payment_failed": {
            const pi = event.data.object as any;
            console.log(`[Stripe] Payment failed: ${pi.id}`);
            break;
          }
          default:
            console.log(`[Stripe Webhook] Unhandled event type: ${event.type}`);
        }

        res.json({ received: true });
      } catch (err: any) {
        console.error("[Stripe Webhook] Error:", err.message);
        res.status(400).json({ error: `Webhook error: ${err.message}` });
      }
    }
  );

  // ─── Body Parsers ──────────────────────────────────────────────────────────
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ limit: "10mb", extended: true }));

  // ─── OAuth ─────────────────────────────────────────────────────────────────
  registerOAuthRoutes(app);

  // ─── File Upload ───────────────────────────────────────────────────────────
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 16 * 1024 * 1024 }, // 16 MB
    fileFilter: (_req, file, cb) => {
      const allowed = [
        "image/jpeg", "image/png", "image/webp", "image/gif",
        "application/pdf",
        "text/csv",
        "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        "application/msword",
        "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      ];
      if (allowed.includes(file.mimetype)) {
        cb(null, true);
      } else {
        cb(new Error(`File type ${file.mimetype} is not allowed`));
      }
    },
  });

  app.post("/api/upload", uploadLimiter, upload.single("file"), async (req: any, res: any) => {
    if (!req.file) return res.status(400).json({ error: "No file provided" });
    try {
      const ext = req.file.originalname.split(".").pop()?.replace(/[^a-z0-9]/gi, "") ?? "bin";
      const key = `uploads/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { url } = await storagePut(key, req.file.buffer, req.file.mimetype);
      res.json({ url, key, name: req.file.originalname, size: req.file.size });
    } catch (e: any) {
      const msg = process.env.NODE_ENV === "development" ? (e.message ?? "Upload failed") : "Upload failed";
      res.status(500).json({ error: msg });
    }
  });

  // ─── SSE: Live Transaction Stream ──────────────────────────────────────────
  const sseClients = new Map<string, Set<any>>();

  // Expose broadcaster so tRPC mutations can push events
  (app as any)._sseBroadcast = (merchantId: string, event: string, data: unknown) => {
    const clients = sseClients.get(merchantId);
    if (!clients || clients.size === 0) return;
    const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
    for (const res of Array.from(clients)) {
      try { res.write(payload); } catch { clients.delete(res); }
    }
  };

  // Health check endpoint
  app.get("/api/health", (_req, res) => {
    res.json({ status: "ok", timestamp: Date.now(), service: "paygate-merchant" });
  });

  app.get("/api/events/transactions", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const { getUserByOpenId, getMerchantByOwnerId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const merchant = await getMerchantByOwnerId(user.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      const merchantId = merchant.id;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      if (!sseClients.has(merchantId)) sseClients.set(merchantId, new Set());
      sseClients.get(merchantId)!.add(res);

      const heartbeat = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
      }, 25_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        sseClients.get(merchantId)?.delete(res);
      });
    } catch {
      res.status(500).json({ error: "SSE setup failed" });
    }
  });

  // ─── SSE: Notifications Stream ─────────────────────────────────────────────
  const notifClients = new Map<string, Set<any>>();

  (app as any)._notifBroadcast = (merchantId: string, notification: unknown) => {
    const clients = notifClients.get(merchantId);
    if (!clients || clients.size === 0) return;
    const payload = `event: notification\ndata: ${JSON.stringify(notification)}\n\n`;
    for (const res of Array.from(clients)) {
      try { res.write(payload); } catch { clients.delete(res); }
    }
  };

  app.get("/api/notifications/stream", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const { getUserByOpenId, getMerchantByOwnerId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const merchant = await getMerchantByOwnerId(user.id);
      if (!merchant) return res.status(404).json({ error: "Merchant not found" });
      const merchantId = merchant.id;

      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      if (!notifClients.has(merchantId)) notifClients.set(merchantId, new Set());
      notifClients.get(merchantId)!.add(res);

      const heartbeat = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
      }, 25_000);

      req.on("close", () => {
        clearInterval(heartbeat);
        notifClients.get(merchantId)?.delete(res);
      });
    } catch {
      res.status(500).json({ error: "Notification SSE setup failed" });
    }
  });

  // ─── tRPC API ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC Error] ${path}:`, error);
        }
      },
    })
  );

  // ─── Sub-Portal Static Files ────────────────────────────────────────────────
  const publicDir = path.resolve(process.cwd(), "client/public");

  app.use("/consumer", express.static(path.join(publicDir, "consumer"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
      if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    },
  }));
  app.get("/consumer", (_req, res) => res.sendFile(path.join(publicDir, "consumer", "index.html")));
  app.get("/consumer/*", (_req, res) => res.sendFile(path.join(publicDir, "consumer", "index.html")));

  app.use("/admin-portal", express.static(path.join(publicDir, "admin-portal"), {
    setHeaders: (res, filePath) => {
      if (filePath.endsWith(".js")) res.setHeader("Content-Type", "application/javascript");
      if (filePath.endsWith(".css")) res.setHeader("Content-Type", "text/css");
    },
  }));
  app.get("/admin-portal", (_req, res) => res.sendFile(path.join(publicDir, "admin-portal", "index.html")));
  app.get("/admin-portal/*", (_req, res) => res.sendFile(path.join(publicDir, "admin-portal", "index.html")));

  // ─── Static / Vite ─────────────────────────────────────────────────────────
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
    if (isStripeConfigured()) {
      console.log("[Stripe] Configured — webhook endpoint: /api/stripe/webhook");
    } else {
      console.log("[Stripe] Not configured — set STRIPE_SECRET_KEY to enable payments");
    }
  });
}

// ─── Background Schedulers ─────────────────────────────────────────────────────
startSlaEscalationScheduler();

startServer().catch(console.error);
