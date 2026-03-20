import "dotenv/config";
import express from "express";
import cors from "cors";
import { createServer } from "http";
import net from "net";
import path from "path";
import { logger, logRequest } from "../logger";
import { createExpressMiddleware } from "@trpc/server/adapters/express";
import { registerOAuthRoutes } from "./oauth";
import { registerKeycloakRoutes } from "./keycloakRoutes";
import { appRouter } from "../routers";
import { createContext } from "./context";
import { serveStatic, setupVite } from "./vite";
import multer from "multer";
import { storagePut } from "../storage";
import helmet from "helmet";
import rateLimit from "express-rate-limit";
import { startSlaEscalationScheduler } from "../slaEscalation";
import { startWebhookRetryWorker } from "../webhookRetry";
import { startIdempotencyCleanupWorker } from "../idempotencyCleanup";
import { startNipBankRefreshWorker } from "../nipBankRefresh";
import { startPushTokenCleanupWorker } from "../pushTokenCleanup";
import { startNotificationPurgeWorker } from "../notificationPurge";
import { startReservationExpiryWorker } from "../reservationExpiryWorker";
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

  // ─── CORS ─────────────────────────────────────────────────────────────────
  const allowedOrigins = [
    /^https?:\/\/localhost(:\d+)?$/,
    /^https?:\/\/127\.0\.0\.1(:\d+)?$/,
    /\.manus\.space$/,
    /\.manus\.computer$/,
  ];
  if (process.env.ALLOWED_ORIGINS) {
    process.env.ALLOWED_ORIGINS.split(",").forEach(o => allowedOrigins.push(new RegExp(`^${o.trim().replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}$`)));
  }
  app.use(cors({
    origin: (origin, callback) => {
      // Allow requests with no origin (mobile apps, curl, server-to-server)
      if (!origin) return callback(null, true);
      const ok = allowedOrigins.some(p => (p instanceof RegExp ? p.test(origin) : p === origin));
      if (ok) return callback(null, true);
      callback(new Error(`CORS: origin '${origin}' not allowed`));
    },
    credentials: true,
    methods: ["GET", "POST", "PUT", "PATCH", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "stripe-signature", "x-internal-key"],
    maxAge: 86400, // 24h preflight cache
  }));

  // ─── Request Logger ────────────────────────────────────────────────────────
  app.use((req: any, res: any, next: any) => {
    const start = Date.now();
    res.on("finish", () => {
      logRequest(req.method, req.path, res.statusCode, Date.now() - start, {
        ip: req.ip,
        ua: req.headers["user-agent"]?.slice(0, 80),
      });
    });
    next();
  });

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
            // ── Consumer wallet top-up ──────────────────────────────────────
            if (session.metadata?.type === "consumer_wallet_topup") {
              try {
                const amountKobo = parseInt(session.metadata.amount_kobo ?? "0", 10);
                const currency = session.metadata.currency ?? "NGN";
                const userOpenId = session.metadata.user_open_id;
                if (amountKobo > 0 && userOpenId) {
                  const { getDb } = await import("../db");
                  const db = await getDb();
                  if (db) {
                    const { consumerWallets, consumerWalletTxns, users } = await import("../../drizzle/schema");
                    const { eq, and, sql } = await import("drizzle-orm");
                    const [user] = await db.select().from(users).where(eq(users.openId, userOpenId)).limit(1);
                    if (user) {
                      let [wallet] = await db.select().from(consumerWallets)
                        .where(and(eq(consumerWallets.userId, user.id), eq(consumerWallets.currency, currency)))
                        .limit(1);
                      if (!wallet) {
                        const [created] = await db.insert(consumerWallets).values({
                          id: `cw_${Date.now()}`,
                          userId: user.id,
                          currency,
                          balanceKobo: 0,
                          isActive: true,
                        }).returning();
                        wallet = created;
                      }
                      const newBalance = wallet.balanceKobo + amountKobo;
                      await db.update(consumerWallets)
                        .set({ balanceKobo: sql`${consumerWallets.balanceKobo} + ${amountKobo}`, updatedAt: new Date() })
                        .where(eq(consumerWallets.id, wallet.id));
                      await db.insert(consumerWalletTxns).values({
                        walletId: wallet.id,
                        userId: user.id,
                        type: "topup",
                        amountKobo,
                        currency,
                        balanceAfterKobo: newBalance,
                        reference: session.id,
                        description: `Stripe wallet top-up — session ${session.id}`,
                        status: "completed",
                      });
                      console.log(`[Stripe] Consumer wallet credited: userId=${user.id}, +${amountKobo} kobo ${currency}`);
                    }
                  }
                }
              } catch (topUpErr: any) {
                console.error("[Stripe] Consumer wallet top-up failed:", topUpErr.message);
              }
            }
            // ── Merchant checkout broadcast ─────────────────────────────────
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

  // ─── OAuth ─────────────────────────────────────────────────────────
  registerOAuthRoutes(app);
  registerKeycloakRoutes(app);

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

  // ─── Mobile REST Bridge (/api/mobile/*) ─────────────────────────────────────
  // These REST endpoints wrap tRPC procedures so the React Native app can call
  // them without a tRPC client. All endpoints return JSON and accept JSON bodies.

  // POST /api/mobile/auth/login — email+password login, returns session token
  app.post("/api/mobile/auth/login", authLimiter, async (req: any, res: any) => {
    try {
      const { email, password } = req.body ?? {};
      if (!email || !password) return res.status(400).json({ error: "email and password required" });
      const { getDb, schema } = await import("../db");
      const { eq } = await import("drizzle-orm");
      const crypto = await import("crypto");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const [user] = await db.select().from(schema.users).where(eq(schema.users.email, email)).limit(1);
      if (!user) return res.status(401).json({ error: "Invalid email or password" });
      const jwtSecret = process.env.JWT_SECRET ?? "";
      const expectedHash = crypto.default.createHash("sha256").update(password + jwtSecret).digest("hex");
      if (user.passwordHash !== expectedHash) return res.status(401).json({ error: "Invalid email or password" });
      const { sdk } = await import("./sdk");
      const { ONE_YEAR_MS } = await import("../../shared/const");
      const token = await sdk.signSession({
        openId: user.openId,
        appId: process.env.VITE_APP_ID ?? "paygate",
        name: user.name ?? user.email ?? "Merchant",
      }, { expiresInMs: ONE_YEAR_MS });
      const { getMerchantByOwnerId } = await import("../db");
      const merchant = await getMerchantByOwnerId(user.id);
      return res.json({
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        merchant: merchant ? { id: merchant.id, businessName: merchant.businessName, isLive: merchant.isLive } : null,
      });
    } catch (e: any) {
      const msg = process.env.NODE_ENV === "development" ? (e.message ?? "Login failed") : "Login failed";
      return res.status(500).json({ error: msg });
    }
  });

  // GET /api/mobile/auth/me — returns current user from Bearer token
  app.get("/api/mobile/auth/me", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const { getUserByOpenId, getMerchantByOwnerId } = await import("../db");
      const user = await getUserByOpenId(ctx.user.openId);
      if (!user) return res.status(401).json({ error: "Unauthorized" });
      const merchant = await getMerchantByOwnerId(user.id);
      return res.json({ ...user, merchant });
    } catch (e: any) {
      return res.status(500).json({ error: "Failed to get user" });
    }
  });

  // POST /api/mobile/auth/logout — clears session
  app.post("/api/mobile/auth/logout", async (req: any, res: any) => {
    try {
      const { COOKIE_NAME } = await import("../../shared/const");
      const { getSessionCookieOptions } = await import("./cookies");
      const cookieOptions = getSessionCookieOptions(req);
      res.clearCookie(COOKIE_NAME, { ...cookieOptions, maxAge: -1 });
      return res.json({ success: true });
    } catch {
      return res.json({ success: true });
    }
  });

  // GET /api/mobile/dashboard — merchant dashboard overview
  app.get("/api/mobile/dashboard", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const data = await caller.dashboard.overview({ from, to: now });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/transactions — paginated transaction list
  app.get("/api/mobile/transactions", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const status = req.query.status as string | undefined;
      const data = await caller.transactions.list({ limit, offset, ...(status ? { status } : {}) });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/customers — paginated customer list
  app.get("/api/mobile/customers", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const limit = parseInt(req.query.limit as string) || 20;
      const offset = parseInt(req.query.offset as string) || 0;
      const search = req.query.search as string | undefined;
      const data = await caller.customers.list({ limit, offset, ...(search ? { search } : {}) });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/payment-links — list payment links
  app.get("/api/mobile/payment-links", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.paymentLinks.list();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/analytics — analytics overview
  app.get("/api/mobile/analytics", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const now = new Date();
      const from = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
      const data = await caller.analytics.overview({ from, to: now });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/notifications — list in-app notifications
  app.get("/api/mobile/notifications", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.notifications.list({ limit: 50, unreadOnly: false });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/virtual-cards — list virtual cards
  app.get("/api/mobile/virtual-cards", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.virtualCards.list();
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/fx-rates — FX rates for crypto/travel/cross-border screens
  app.get("/api/mobile/fx-rates", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.fx.getRates({ base: (req.query.base as string) || "USD" });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // POST /api/mobile/transactions/create — create a test transaction (P2P, NFC, Voice, Wearables)
  app.post("/api/mobile/transactions/create", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { amount, currency, description, customerEmail, customerName } = req.body ?? {};
      const data = await caller.transactions.createTest({ amount: amount ?? 1000, currency: currency ?? "NGN", description, customerEmail, customerName });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // POST /api/mobile/virtual-cards/create — create a virtual card
  app.post("/api/mobile/virtual-cards/create", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { currency, spendLimit, label } = req.body ?? {};
      const data = await caller.virtualCards.create({ currency: currency ?? "USD", spendLimit, label });
      return res.json(data);
    } catch (e: any) {
      return res.status(500).json({ error: e.message ?? "Failed" });
    }
  });

  // GET /api/mobile/payouts — list payouts
  app.get("/api/mobile/payouts", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const limit = parseInt((req.query.limit as string) || "50");
      const data = await caller.payouts.list({ limit });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/payouts/create — request a payout
  app.post("/api/mobile/payouts/create", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { amount, currency } = req.body ?? {};
      const data = await caller.payouts.create({ amount: amount ?? 1000, currency: currency ?? "USD" });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // GET /api/mobile/disputes — list disputes
  app.get("/api/mobile/disputes", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.disputes.list({ limit: 50 });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // GET /api/mobile/api-keys — list API keys
  app.get("/api/mobile/api-keys", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.apiKeys.list();
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/api-keys/create — create an API key
  app.post("/api/mobile/api-keys/create", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { name, isLive } = req.body ?? {};
      const data = await caller.apiKeys.create({ name: name ?? "Mobile Key", environment: isLive ? "live" : "test" });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // DELETE /api/mobile/api-keys/:id — revoke an API key
  app.delete("/api/mobile/api-keys/:id", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.apiKeys.revoke({ id: req.params.id });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // GET /api/mobile/webhooks — list webhooks
  app.get("/api/mobile/webhooks", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.webhooks.list();
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/webhooks/create — create a webhook
  app.post("/api/mobile/webhooks/create", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { url, events } = req.body ?? {};
      const data = await caller.webhooks.create({ url, events: events ?? [] });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // DELETE /api/mobile/webhooks/:id — delete a webhook
  app.delete("/api/mobile/webhooks/:id", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.webhooks.delete({ id: req.params.id });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // GET /api/mobile/team — list team members
  app.get("/api/mobile/team", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.team.list();
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/team/invite — invite a team member
  app.post("/api/mobile/team/invite", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { email, role } = req.body ?? {};
      const data = await caller.team.invite({ email, role: role ?? "member" });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // DELETE /api/mobile/team/:id — remove a team member
  app.delete("/api/mobile/team/:id", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.team.remove({ id: req.params.id });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // GET /api/mobile/settings — get merchant settings
  app.get("/api/mobile/settings", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.settings.get();
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // PATCH /api/mobile/settings — update merchant settings
  app.patch("/api/mobile/settings", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.settings.updateMerchant(req.body ?? {});
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/transactions/refund — refund a transaction
  app.post("/api/mobile/transactions/refund", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const { transactionId, reason, amount } = req.body ?? {};
      const data = await caller.transactions.refund({ id: transactionId, reason, amount });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/notifications/mark-read — mark notification as read
  app.post("/api/mobile/notifications/mark-read", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.notifications.markRead({ id: Number(req.body?.id) });
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/notifications/mark-all-read — mark all notifications as read
  app.post("/api/mobile/notifications/mark-all-read", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.notifications.markAllRead();
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/push-tokens/register — register FCM/APNs device token
  app.post("/api/mobile/push-tokens/register", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.pushTokens.register(req.body);
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // POST /api/mobile/push-tokens/deregister — deregister FCM/APNs device token
  app.post("/api/mobile/push-tokens/deregister", async (req: any, res: any) => {
    try {
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });
      const caller = appRouter.createCaller(ctx);
      const data = await caller.pushTokens.deregister(req.body);
      return res.json(data);
    } catch (e: any) { return res.status(500).json({ error: e.message ?? "Failed" }); }
  });
  // ─── Offline Sync Relay Proxy ──────────────────────────────────────────────
  // Proxies mobile offline queue replays to the Go sync relay service.
  // The Go service handles idempotency deduplication and exactly-once replay.
  const SYNC_RELAY_URL = process.env.SYNC_RELAY_URL || "http://localhost:8002";
  const SYNC_RELAY_KEY = process.env.SYNC_RELAY_KEY || process.env.INTERNAL_API_KEY || "";

  // POST /api/mobile/sync — replay queued mobile operations
  app.post("/api/mobile/sync", async (req: any, res: any) => {
    try {
      const response = await fetch(`${SYNC_RELAY_URL}/sync`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": SYNC_RELAY_KEY,
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (e: any) {
      // Graceful degradation: if sync relay is down, tell mobile to retry
      return res.status(503).json({ error: "Sync relay unavailable — will retry", retryable: true });
    }
  });

  // POST /api/mobile/reconcile — check server state of queued items
  app.post("/api/mobile/reconcile", async (req: any, res: any) => {
    try {
      const response = await fetch(`${SYNC_RELAY_URL}/reconcile`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": SYNC_RELAY_KEY,
        },
        body: JSON.stringify(req.body),
      });
      const data = await response.json();
      return res.status(response.status).json(data);
    } catch (e: any) {
      return res.status(503).json({ error: "Sync relay unavailable", retryable: true });
    }
  });

  // ─── Internal USSD Service Endpoints ──────────────────────────────────────
  // Called by the Python USSD service (server-to-server) via X-Internal-Key header

  const verifyInternalKey = (req: any, res: any, next: any) => {
    const key = req.headers["x-internal-key"];
    if (!key || key !== process.env.MIDDLEWARE_INTERNAL_KEY) {
      return res.status(401).json({ error: "Invalid internal key" });
    }
    next();
  };

  app.get("/api/internal/ussd/balance", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { phone } = req.query;
      if (!phone) return res.status(400).json({ error: "phone required" });
      const { getDb } = await import("../db");
      const { wallets, merchants } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const result = await db
        .select({ balance: wallets.balance, ledgerBalance: wallets.ledgerBalance })
        .from(wallets)
        .innerJoin(merchants, eq(merchants.id, wallets.merchantId))
        .where(eq(merchants.phone, phone as string))
        .limit(1);
      if (!result.length) return res.status(404).json({ error: "Account not found" });
      return res.json({ balance: result[0].balance, ledger_balance: result[0].ledgerBalance });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/internal/ussd/transfer", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { from_phone, to_phone, amount, pin, idempotency_key } = req.body;
      if (!from_phone || !to_phone || !amount || !pin || !idempotency_key)
        return res.status(400).json({ error: "Missing required fields" });
      const { getDb } = await import("../db");
      const { merchants, wallets, transactions } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const bcrypt = await import("bcryptjs");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable", success: false });
      const [sender] = await db.select().from(merchants).where(eq(merchants.phone, from_phone)).limit(1);
      if (!sender) return res.status(404).json({ error: "Sender not found", success: false });
      const pinValid = sender.ussdPin ? await bcrypt.compare(pin, sender.ussdPin) : false;
      if (!pinValid) return res.status(401).json({ error: "Invalid PIN", success: false });
      const [existing] = await db.select().from(transactions).where(eq(transactions.reference, idempotency_key)).limit(1);
      if (existing) return res.json({ success: true, reference: idempotency_key, duplicate: true });
      const [senderWallet] = await db.select().from(wallets).where(eq(wallets.merchantId, sender.id)).limit(1);
      if (!senderWallet || senderWallet.balance < amount)
        return res.status(400).json({ error: "Insufficient funds", success: false });
      const [recipient] = await db.select().from(merchants).where(eq(merchants.phone, to_phone)).limit(1);
      if (!recipient) return res.status(404).json({ error: "Recipient not found", success: false });
      await db.update(wallets).set({ balance: sql`balance - ${amount}` }).where(eq(wallets.merchantId, sender.id));
      await db.update(wallets).set({ balance: sql`balance + ${amount}` }).where(eq(wallets.merchantId, recipient.id));
      return res.json({ success: true, reference: idempotency_key });
    } catch (e: any) { return res.status(500).json({ error: e.message, success: false }); }
  });

  app.post("/api/internal/ussd/pay-merchant", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { from_phone, merchant_code, amount, pin, idempotency_key } = req.body;
      if (!from_phone || !merchant_code || !amount || !pin || !idempotency_key)
        return res.status(400).json({ error: "Missing required fields" });
      const { getDb } = await import("../db");
      const { merchants, wallets, transactions } = await import("../../drizzle/schema");
      const { eq, sql } = await import("drizzle-orm");
      const bcrypt = await import("bcryptjs");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable", success: false });
      const [sender] = await db.select().from(merchants).where(eq(merchants.phone, from_phone)).limit(1);
      if (!sender) return res.status(404).json({ error: "Sender not found", success: false });
      const pinValid = sender.ussdPin ? await bcrypt.compare(pin, sender.ussdPin) : false;
      if (!pinValid) return res.status(401).json({ error: "Invalid PIN", success: false });
      const [merchantRecipient] = await db.select().from(merchants).where(eq(merchants.merchantCode, merchant_code)).limit(1);
      if (!merchantRecipient) return res.status(404).json({ error: "Merchant not found", success: false });
      const [senderWallet] = await db.select().from(wallets).where(eq(wallets.merchantId, sender.id)).limit(1);
      if (!senderWallet || senderWallet.balance < amount)
        return res.status(400).json({ error: "Insufficient funds", success: false });
      const [existing] = await db.select().from(transactions).where(eq(transactions.reference, idempotency_key)).limit(1);
      if (existing) return res.json({ success: true, reference: idempotency_key, duplicate: true });
      await db.update(wallets).set({ balance: sql`balance - ${amount}` }).where(eq(wallets.merchantId, sender.id));
      await db.update(wallets).set({ balance: sql`balance + ${amount}` }).where(eq(wallets.merchantId, merchantRecipient.id));
      return res.json({ success: true, reference: idempotency_key });
    } catch (e: any) { return res.status(500).json({ error: e.message, success: false }); }
  });

  app.get("/api/internal/ussd/tx-status", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { phone, reference } = req.query;
      if (!phone || !reference) return res.status(400).json({ error: "phone and reference required" });
      const { getDb } = await import("../db");
      const { transactions, merchants } = await import("../../drizzle/schema");
      const { eq, and } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const [merchant] = await db.select().from(merchants).where(eq(merchants.phone, phone as string)).limit(1);
      if (!merchant) return res.status(404).json({ error: "Account not found" });
      const [tx] = await db.select().from(transactions)
        .where(and(eq(transactions.reference, reference as string), eq(transactions.merchantId, merchant.id)))
        .limit(1);
      if (!tx) return res.status(404).json({ error: "Transaction not found" });
      return res.json({ status: tx.status, amount: tx.amount, reference: tx.reference, created_at: tx.createdAt });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.get("/api/internal/ussd/mini-statement", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { phone, limit = "5" } = req.query;
      if (!phone) return res.status(400).json({ error: "phone required" });
      const { getDb } = await import("../db");
      const { transactions, merchants } = await import("../../drizzle/schema");
      const { eq, desc } = await import("drizzle-orm");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable" });
      const [merchant] = await db.select().from(merchants).where(eq(merchants.phone, phone as string)).limit(1);
      if (!merchant) return res.status(404).json({ error: "Account not found" });
      const txs = await db.select().from(transactions)
        .where(eq(transactions.merchantId, merchant.id))
        .orderBy(desc(transactions.createdAt))
        .limit(parseInt(limit as string, 10));
      return res.json({ transactions: txs.map(t => ({ channel: t.channel, amount: t.amount, reference: t.reference, status: t.status, created_at: t.createdAt })) });
    } catch (e: any) { return res.status(500).json({ error: e.message }); }
  });

  app.post("/api/internal/ussd/change-pin", verifyInternalKey, async (req: any, res: any) => {
    try {
      const { phone, old_pin, new_pin } = req.body;
      if (!phone || !old_pin || !new_pin) return res.status(400).json({ error: "Missing required fields" });
      if (new_pin.length < 4) return res.status(400).json({ error: "PIN must be at least 4 digits" });
      const { getDb } = await import("../db");
      const { merchants } = await import("../../drizzle/schema");
      const { eq } = await import("drizzle-orm");
      const bcrypt = await import("bcryptjs");
      const db = await getDb();
      if (!db) return res.status(503).json({ error: "Database unavailable", success: false });
      const [merchant] = await db.select().from(merchants).where(eq(merchants.phone, phone)).limit(1);
      if (!merchant) return res.status(404).json({ error: "Account not found", success: false });
      const pinValid = merchant.ussdPin ? await bcrypt.compare(old_pin, merchant.ussdPin) : false;
      if (!pinValid) return res.status(401).json({ error: "Invalid current PIN", success: false });
      const newHash = await bcrypt.hash(new_pin, 10);
      await db.update(merchants).set({ ussdPin: newHash }).where(eq(merchants.phone, phone));
      return res.json({ success: true });
    } catch (e: any) { return res.status(500).json({ error: e.message, success: false }); }
  });

  // Health check endpoint — includes circuit breaker states and DB ping
  app.get("/api/health", async (_req, res) => {
    const { getAllCircuitBreakerStats } = await import("../circuitBreaker");
    const { getDb } = await import("../db");
    const { isBridgeAvailable } = await import("../middlewareBridge");
    let dbOk = false;
    try {
      const db = await getDb();
      if (db) {
        await db.execute("SELECT 1" as any);
        dbOk = true;
      }
    } catch { dbOk = false; }
    const circuitBreakers = getAllCircuitBreakerStats();
    const allCbClosed = circuitBreakers.every(cb => cb.state === "CLOSED");
    const status = dbOk ? "ok" : "degraded";
    res.status(dbOk ? 200 : 503).json({
      status,
      timestamp: Date.now(),
      service: "paygate-merchant",
      version: process.env.npm_package_version ?? "1.0.0",
      checks: {
        database: dbOk ? "ok" : "error",
        bridge: isBridgeAvailable() ? "configured" : "not_configured",
        circuitBreakers: allCbClosed ? "all_closed" : "some_open",
      },
      circuitBreakers,
      integrations: {
        stripe: !!(process.env.STRIPE_SECRET_KEY),
        vtpass: !!(process.env.VTPASS_API_KEY),
        termii: !!(process.env.TERMII_API_KEY),
        youverify: !!(process.env.YOUVERIFY_API_KEY),
        nip: !!(process.env.NIP_API_KEY),
        webPush: !!(process.env.VAPID_PUBLIC_KEY),
        pushService: !!(process.env.PUSH_SERVICE_URL),
      },
    });
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
      onError: ({ error, path, type }) => {
        if (error.code === "INTERNAL_SERVER_ERROR") {
          logger.error("trpc_internal_error", { path, type, message: error.message, stack: error.stack });
        } else if (error.code !== "UNAUTHORIZED" && error.code !== "NOT_FOUND") {
          logger.warn("trpc_error", { path, type, code: error.code, message: error.message });
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
    logger.info("server_started", { port, env: process.env.NODE_ENV ?? "development", stripe: isStripeConfigured() });
    if (isStripeConfigured()) {
      logger.info("stripe_configured", { webhook: "/api/stripe/webhook" });
    } else {
      logger.warn("stripe_not_configured", { hint: "Set STRIPE_SECRET_KEY to enable payments" });
    }
  });

  // ─── Graceful Shutdown (SIGTERM / SIGINT) ──────────────────────────────────
  let isShuttingDown = false;
  const gracefulShutdown = (signal: string) => {
    if (isShuttingDown) return;
    isShuttingDown = true;
    logger.info("graceful_shutdown_initiated", { signal });
    // Stop accepting new connections
    server.close((err) => {
      if (err) {
        logger.error("graceful_shutdown_error", { error: err.message });
        process.exit(1);
      }
      logger.info("graceful_shutdown_complete");
      process.exit(0);
    });
    // Force exit after 30 seconds if drain takes too long
    setTimeout(() => {
      logger.error("graceful_shutdown_timeout", { hint: "Forcing exit after 30s drain timeout" });
      process.exit(1);
    }, 30_000).unref();
  };
  process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
  process.on("SIGINT", () => gracefulShutdown("SIGINT"));
}

// ─── Env Validation ─────────────────────────────────────────────────────
function validateEnv() {
  const required: [string, string][] = [
    ["DATABASE_URL", "PostgreSQL connection string"],
    ["JWT_SECRET", "Session cookie signing secret"],
  ];
  const missing = required.filter(([key]) => !process.env[key]);
  if (missing.length > 0) {
    logger.error("missing_required_env", { missing: missing.map(([k]) => k) });
    if (process.env.NODE_ENV === "production") {
      process.exit(1);
    } else {
      logger.warn("continuing_without_required_env", { hint: "Dev mode only" });
    }
  }
  const optional: [string, string][] = [
    ["STRIPE_SECRET_KEY", "Stripe payments"],
    ["STRIPE_WEBHOOK_SECRET", "Stripe webhook signature verification"],
    ["MIDDLEWARE_BRIDGE_URL", "Go middleware bridge (payout approvals)"],
    ["VTPASS_API_KEY", "VTpass bill payments (airtime, data, electricity)"],
    ["TERMII_API_KEY", "Termii SMS OTP"],
    ["YOUVERIFY_API_KEY", "Youverify KYC (BVN/NIN)"],
    ["NIP_API_KEY", "NIP name enquiry for P2P transfers"],
    ["PUSH_SERVICE_KEY", "Push notification service"],
    ["REDIS_URL", "Redis (rate limiting + USSD sessions)"],
  ];
  optional.forEach(([key, feature]) => {
    if (!process.env[key]) {
      logger.warn("optional_env_not_set", { key, feature, impact: "Feature will run in simulation/fallback mode" });
    }
  });
}

// ─── Background Schedulers ───────────────────────────────────────────────────────────────
validateEnv();
startSlaEscalationScheduler();
startWebhookRetryWorker();         // Exponential backoff retry (7 attempts, 30s poll)
startIdempotencyCleanupWorker();   // Purge expired idempotency keys every 6 hours
startNipBankRefreshWorker();       // Refresh NIP bank directory every 24h
startPushTokenCleanupWorker();     // Purge stale device push tokens every 7 days
startNotificationPurgeWorker();    // Purge old merchant notifications every 24h
startReservationExpiryWorker();    // Release expired inventory reservations every 5 min

startServer().catch(console.error);