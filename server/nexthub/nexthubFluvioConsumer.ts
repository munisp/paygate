/**
 * nexthubFluvioConsumer.ts — Paygate Fluvio Consumer for NextHub Real-Time Streams
 * ─────────────────────────────────────────────────────────────────────────────
 * Subscribes to NextHub's Fluvio topics for sub-second real-time events.
 * These are fanned out to Paygate's browser clients via SSE.
 *
 * Topics consumed:
 *   ndc-breach-alerts       — Real-time NDC breach alerts → SSE to Paygate UI
 *   fx-rate-ticks           — Live FX rate ticks → SSE to CorridorLiveStats
 *   settlement-updates      — Settlement state changes → SSE to dashboard
 *   transfer-state-changes  — Transfer lifecycle → SSE to transfer tracker
 */

import { ENV } from "../_core/env";
import type { Response } from "express";

// ─── SSE subscriber registry ──────────────────────────────────────────────────
// Maps topic → set of active SSE response objects
const sseSubscribers = new Map<string, Set<Response>>();

export function addSseSubscriber(topic: string, res: Response) {
  if (!sseSubscribers.has(topic)) sseSubscribers.set(topic, new Set());
  sseSubscribers.get(topic)!.add(res);
  res.on("close", () => {
    sseSubscribers.get(topic)?.delete(res);
  });
}

function broadcastToSse(topic: string, data: unknown) {
  const subscribers = sseSubscribers.get(topic);
  if (!subscribers || subscribers.size === 0) return;
  const payload = `data: ${JSON.stringify(data)}\n\n`;
  for (const res of subscribers) {
    try {
      res.write(payload);
    } catch {
      subscribers.delete(res);
    }
  }
}

// ─── Fluvio topics (mirror of nexthubFluvioProducer.ts) ───────────────────────
export const NEXTHUB_FLUVIO_TOPICS = {
  NDC_BREACH_ALERTS:      "ndc-breach-alerts",
  FX_RATE_TICKS:          "fx-rate-ticks",
  SETTLEMENT_UPDATES:     "settlement-updates",
  TRANSFER_STATE_CHANGES: "transfer-state-changes",
} as const;

// ─── Lazy Fluvio client ───────────────────────────────────────────────────────
async function getFluvio() {
  const endpoint = (ENV as any).fluvioEndpoint;
  if (!endpoint) return null;
  try {
    const { Fluvio } = await import("@fluvio/client" as any);
    return await Fluvio.connect(endpoint);
  } catch {
    console.warn("[paygate-fluvio-consumer] @fluvio/client not available");
    return null;
  }
}

// ─── Generic topic consumer ───────────────────────────────────────────────────
async function startTopicConsumer(fluvio: any, topic: string) {
  try {
    const consumer = await fluvio.partitionConsumer(topic, 0);
    const stream = await consumer.createStream({ index: BigInt(0) });

    console.log(`[paygate-fluvio-consumer] Subscribed to ${topic}`);

    (async () => {
      for await (const record of stream) {
        try {
          const payload = JSON.parse(record.valueString());
          broadcastToSse(topic, payload);
        } catch {
          // Skip malformed records
        }
      }
    })().catch(err =>
      console.warn(`[paygate-fluvio-consumer] Stream error on ${topic}:`, err)
    );
  } catch (err) {
    console.warn(`[paygate-fluvio-consumer] Failed to subscribe to ${topic}:`, err);
  }
}

// ─── Start all Fluvio consumers ───────────────────────────────────────────────
let _started = false;
export async function startNexhubFluvioConsumers() {
  if (_started) return;
  _started = true;

  const fluvio = await getFluvio();
  if (!fluvio) {
    console.log("[paygate-fluvio-consumer] Fluvio not configured — real-time streaming disabled");
    return;
  }

  await Promise.all(
    Object.values(NEXTHUB_FLUVIO_TOPICS).map(topic => startTopicConsumer(fluvio, topic))
  );

  console.log("[paygate-fluvio-consumer] All NextHub Fluvio consumers running");
}

// ─── SSE endpoint helpers ─────────────────────────────────────────────────────
/** Express middleware to set up an SSE connection for a Fluvio topic */
export function createSseHandler(topic: string) {
  return (req: any, res: Response) => {
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders();

    // Send initial heartbeat
    res.write(": connected\n\n");

    addSseSubscriber(topic, res);

    // Heartbeat every 30s to keep connection alive
    const heartbeat = setInterval(() => {
      try {
        res.write(": heartbeat\n\n");
      } catch {
        clearInterval(heartbeat);
      }
    }, 30_000);

    req.on("close", () => clearInterval(heartbeat));
  };
}
