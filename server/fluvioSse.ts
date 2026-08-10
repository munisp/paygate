/**
 * fluvioSse.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluvio SSE consumer endpoint for real-time event streaming to the frontend.
 * Bridges Fluvio topics → HTTP Server-Sent Events so the React/PWA frontend
 * can subscribe to live transaction, fraud, and analytics streams without
 * WebSocket complexity.
 *
 * Endpoint: GET /api/events/stream?topic=<topic>
 * Auth: session cookie (same as other SSE endpoints)
 */
import type { Express } from "express";
import { createContext } from "./_core/context";
import { consumeRecords, FLUVIO_TOPICS } from "./fluvioClient";

const ALLOWED_TOPICS = new Set(Object.values(FLUVIO_TOPICS));

export function registerFluvioSseEndpoint(app: Express): void {
  // ─── SSE: Fluvio Real-time Event Stream ──────────────────────────────────
  app.get("/api/events/stream", async (req: any, res: any) => {
    try {
      // Auth guard
      const ctx = await createContext({ req, res } as any);
      if (!ctx.user) return res.status(401).json({ error: "Unauthorized" });

      // Topic validation
      const topic = (req.query.topic as string) ?? FLUVIO_TOPICS.REALTIME_TRANSACTIONS;
      if (!ALLOWED_TOPICS.has(topic as any)) {
        return res.status(400).json({ error: `Unknown topic '${topic}'. Allowed: ${[...ALLOWED_TOPICS].join(", ")}` });
      }

      // SSE headers
      res.setHeader("Content-Type", "text/event-stream");
      res.setHeader("Cache-Control", "no-cache");
      res.setHeader("Connection", "keep-alive");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();

      // Send initial connected event
      res.write(`event: connected\ndata: ${JSON.stringify({ topic, timestamp: Date.now() })}\n\n`);

      // Heartbeat to keep connection alive through proxies
      const heartbeat = setInterval(() => {
        try { res.write(`: heartbeat\n\n`); } catch { clearInterval(heartbeat); }
      }, 25_000);

      // Subscribe to Fluvio topic — unsubscribe returned as cleanup fn
      let unsubscribe: (() => void) | undefined;
      try {
        unsubscribe = await consumeRecords(topic, async (record) => {
          try {
            const payload = `event: message\ndata: ${JSON.stringify({ topic, record, timestamp: Date.now() })}\n\n`;
            res.write(payload);
          } catch {
            // Client disconnected mid-write; cleanup handled by req.on("close")
          }
        });
      } catch (err) {
        // Fluvio not available — send a single info event and keep heartbeat running
        res.write(`event: info\ndata: ${JSON.stringify({ message: "Fluvio not configured; heartbeat only", topic })}\n\n`);
      }

      req.on("close", () => {
        clearInterval(heartbeat);
        unsubscribe?.();
      });
    } catch (err) {
      res.status(500).json({ error: "Fluvio SSE setup failed" });
    }
  });
}
