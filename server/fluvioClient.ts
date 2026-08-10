/**
 * fluvioClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Fluvio real-time streaming client for PayGate.
 * Fluvio is used for low-latency event streaming (fraud scoring, real-time
 * analytics, POS transaction streams).
 *
 * Falls back gracefully when FLUVIO_ENDPOINT is not configured.
 */

import { ENV } from "./_core/env";

// ─── Topic constants ──────────────────────────────────────────────────────────
export const FLUVIO_TOPICS = {
  REALTIME_TRANSACTIONS: "rt-transactions",
  FRAUD_SCORING: "fraud-scoring",
  POS_EVENTS: "pos-events",
  ANALYTICS_STREAM: "analytics-stream",
  NOTIFICATION_STREAM: "notification-stream",
} as const;

// ─── Types ────────────────────────────────────────────────────────────────────
export interface FluvioRecord<T = unknown> {
  key?: string;
  value: T;
  timestamp: number;
}

// ─── Lazy client ─────────────────────────────────────────────────────────────
let _fluvio: any = null;

async function getFluvio() {
  if (!ENV.fluvioEndpoint) return null;
  if (_fluvio) return _fluvio;
  try {
    const { Fluvio } = await import("@fluvio/client" as any);
    _fluvio = await Fluvio.connect(ENV.fluvioEndpoint);
    return _fluvio;
  } catch {
    console.warn("[fluvio] @fluvio/client not available or endpoint unreachable — streaming disabled");
    return null;
  }
}

// ─── Producer ────────────────────────────────────────────────────────────────
const _producers = new Map<string, any>();

async function getProducer(topic: string) {
  if (_producers.has(topic)) return _producers.get(topic);
  const fluvio = await getFluvio();
  if (!fluvio) return null;
  try {
    const producer = await fluvio.topicProducer(topic);
    _producers.set(topic, producer);
    return producer;
  } catch {
    return null;
  }
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Produce a record to a Fluvio topic.
 */
export async function produceRecord<T = unknown>(
  topic: string,
  value: T,
  key?: string
): Promise<boolean> {
  try {
    const producer = await getProducer(topic);
    if (!producer) return false;
    const payload = JSON.stringify(value);
    if (key) {
      await producer.sendKeyValue(key, payload);
    } else {
      await producer.send(payload);
    }
    return true;
  } catch (err) {
    console.error(`[fluvio] Failed to produce to ${topic}:`, err);
    return false;
  }
}

/**
 * Stream real-time transaction event to Fluvio for fraud scoring.
 */
export async function streamTransactionForScoring(payload: {
  transactionId: string;
  merchantId: string;
  amount: number;
  currency: string;
  cardBin?: string;
  ipAddress?: string;
  deviceFingerprint?: string;
  timestamp: string;
}) {
  return produceRecord(FLUVIO_TOPICS.FRAUD_SCORING, payload, payload.transactionId);
}

/**
 * Stream POS terminal event.
 */
export async function streamPosEvent(payload: {
  terminalId: string;
  merchantId: string;
  eventType: "sale" | "void" | "refund" | "batch_close";
  amount?: number;
  currency?: string;
}) {
  return produceRecord(FLUVIO_TOPICS.POS_EVENTS, payload, payload.terminalId);
}

/**
 * Stream analytics event for real-time dashboard updates.
 */
export async function streamAnalyticsEvent(payload: {
  merchantId: string;
  metric: string;
  value: number;
  dimensions?: Record<string, string>;
}) {
  return produceRecord(FLUVIO_TOPICS.ANALYTICS_STREAM, {
    ...payload,
    timestamp: Date.now(),
  });
}

/**
 * Consume records from a Fluvio topic (offset-based).
 */
export async function consumeRecords(
  topic: string,
  handler: (record: FluvioRecord) => Promise<void>,
  offset: "beginning" | "end" = "end"
): Promise<() => void> {
  const fluvio = await getFluvio();
  if (!fluvio) return () => {};

  try {
    const consumer = await fluvio.partitionConsumer(topic, 0);
    const stream = await consumer.createStream(
      offset === "beginning" ? { beginning: {} } : { fromEnd: {} }
    );

    let active = true;
    (async () => {
      for await (const record of stream) {
        if (!active) break;
        try {
          const value = JSON.parse(record.valueString());
          await handler({
            key: record.keyString?.(),
            value,
            timestamp: Date.now(),
          });
        } catch (err) {
          console.error(`[fluvio] Consumer error on ${topic}:`, err);
        }
      }
    })();

    return () => { active = false; };
  } catch (err) {
    console.error(`[fluvio] Failed to start consumer for ${topic}:`, err);
    return () => {};
  }
}
