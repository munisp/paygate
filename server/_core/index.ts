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
