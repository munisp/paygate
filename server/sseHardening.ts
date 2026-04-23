/**
 * PayGate SSE Hardening
 *
 * Provides a production-hardened SSE (Server-Sent Events) connection manager:
 *
 *  - Per-merchant connection limit (max 10 concurrent SSE connections per merchant)
 *  - 30-second heartbeat to keep connections alive through load balancers
 *  - Automatic cleanup on client disconnect
 *  - Auth guard: only authenticated merchants can subscribe
 *  - Connection metadata tracking for observability
 *
 * Usage: call registerSseEndpoint(app) in server/_core/index.ts
 */

import type { Express, Request, Response } from "express";
import { createContext } from "./_core/context";

const MAX_CONNECTIONS_PER_MERCHANT = 10;
const HEARTBEAT_INTERVAL_MS = 30_000;

interface SseConnection {
  res: Response;
  merchantId: string;
  connectedAt: Date;
  heartbeatTimer: ReturnType<typeof setInterval>;
}

// ─── Connection registry ───────────────────────────────────────────────────────
const connections = new Map<string, Set<SseConnection>>();
let totalConnections = 0;

function addConnection(merchantId: string, conn: SseConnection): void {
  if (!connections.has(merchantId)) {
    connections.set(merchantId, new Set());
  }
  connections.get(merchantId)!.add(conn);
  totalConnections++;
}

function removeConnection(merchantId: string, conn: SseConnection): void {
  clearInterval(conn.heartbeatTimer);
  const set = connections.get(merchantId);
  if (set) {
    set.delete(conn);
    if (set.size === 0) connections.delete(merchantId);
  }
  totalConnections = Math.max(0, totalConnections - 1);
}

function getConnectionCount(merchantId: string): number {
  return connections.get(merchantId)?.size ?? 0;
}

// ─── Broadcast helper ─────────────────────────────────────────────────────────
export function sseBroadcast(merchantId: string, event: string, data: unknown): void {
  const conns = connections.get(merchantId);
  if (!conns || conns.size === 0) return;

  const payload = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`;
  const dead: SseConnection[] = [];

  for (const conn of Array.from(conns)) {
    try {
      conn.res.write(payload);
    } catch {
      dead.push(conn);
    }
  }

  // Clean up dead connections
  for (const conn of dead) {
    removeConnection(merchantId, conn);
  }
}

// ─── SSE endpoint registration ────────────────────────────────────────────────
export function registerSseEndpoint(app: Express): void {
  app.get("/api/sse/transactions", async (req: Request, res: Response) => {
    // ── Auth guard ────────────────────────────────────────────────────────────
    const ctx = await createContext({ req, res } as any).catch(() => null);
    if (!ctx?.user) {
      res.status(401).json({ error: "Unauthorized" });
      return;
    }

    const merchantId = (req.query.merchantId as string) || ctx.user.openId;

    // ── Connection limit ──────────────────────────────────────────────────────
    if (getConnectionCount(merchantId) >= MAX_CONNECTIONS_PER_MERCHANT) {
      res.status(429).json({
        error: `Too many SSE connections for merchant (max ${MAX_CONNECTIONS_PER_MERCHANT})`,
      });
      return;
    }

    // ── SSE headers ───────────────────────────────────────────────────────────
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no"); // Disable Nginx buffering
    res.flushHeaders();

    // ── Initial connected event ───────────────────────────────────────────────
    res.write(`event: connected\ndata: ${JSON.stringify({ merchantId, ts: Date.now() })}\n\n`);

    // ── Heartbeat ─────────────────────────────────────────────────────────────
    const heartbeatTimer = setInterval(() => {
      try {
        res.write(`: heartbeat ${Date.now()}\n\n`);
      } catch {
        // Connection closed — cleanup handled by close event
      }
    }, HEARTBEAT_INTERVAL_MS);

    const conn: SseConnection = {
      res,
      merchantId,
      connectedAt: new Date(),
      heartbeatTimer,
    };

    addConnection(merchantId, conn);

    // ── Cleanup on disconnect ─────────────────────────────────────────────────
    req.on("close", () => {
      removeConnection(merchantId, conn);
    });

    req.on("error", () => {
      removeConnection(merchantId, conn);
    });
  });

  // ── SSE stats endpoint (internal) ─────────────────────────────────────────
  app.get("/api/sse/stats", async (req: Request, res: Response) => {
    const internalKey = String(req.headers["x-internal-key"] ?? "");
    const expectedKey = process.env.MIDDLEWARE_INTERNAL_KEY ?? "";
    // VULN-038 fix: use timingSafeEqual to prevent timing-based key enumeration
    const { timingSafeEqual } = await import("crypto");
    const keysMatch = expectedKey.length > 0 &&
      internalKey.length === expectedKey.length &&
      timingSafeEqual(Buffer.from(internalKey), Buffer.from(expectedKey));
      res.status(403).json({ error: "Forbidden" });
      return;
    }
    res.json({
      totalConnections,
      merchantCount: connections.size,
      merchants: Array.from(connections.entries()).map(([id, conns]) => ({
        merchantId: id,
        connections: conns.size,
        oldestConnectedAt: Math.min(
          ...Array.from(conns).map((c) => c.connectedAt.getTime())
        ),
      })),
    });
  });
}

// ─── Stats for metrics endpoint ───────────────────────────────────────────────
export function getSseStats() {
  return {
    totalConnections,
    merchantCount: connections.size,
  };
}
