import "dotenv/config";
import express from "express";
import { createServer } from "http";
import net from "net";
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
      // Allow only safe document/image MIME types
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
      // Mask internal error details in production
      const msg = process.env.NODE_ENV === "development" ? (e.message ?? "Upload failed") : "Upload failed";
      res.status(500).json({ error: msg });
    }
  });

  // ─── SSE: Live Transaction Stream ──────────────────────────────────────────
  // In-memory client registry: merchantId -> Set<Response>
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

  app.get("/api/events/transactions", async (req: any, res: any) => {
    // Authenticate via session cookie (same as tRPC context)
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

      // Register client
      if (!sseClients.has(merchantId)) sseClients.set(merchantId, new Set());
      sseClients.get(merchantId)!.add(res);

      // Send heartbeat every 25s to keep connection alive
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

  // ─── tRPC API ──────────────────────────────────────────────────────────────
  app.use(
    "/api/trpc",
    createExpressMiddleware({
      router: appRouter,
      createContext,
      onError: ({ error, path }) => {
        // Log full error server-side but never expose stack traces to clients
        if (error.code === "INTERNAL_SERVER_ERROR") {
          console.error(`[tRPC Error] ${path}:`, error);
        }
      },
    })
  );

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
  });
}

// ─── Background Schedulers ──────────────────────────────────────────────────────────────
startSlaEscalationScheduler();

startServer().catch(console.error);
