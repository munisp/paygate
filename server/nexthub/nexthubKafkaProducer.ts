/**
 * nexthubKafkaProducer.ts — Paygate → NextHub Kafka Producer
 * ─────────────────────────────────────────────────────────────────────────────
 * Publishes Paygate domain events to Kafka topics consumed by NextHub.
 *
 * Topics produced:
 *   paygate.audit.v1              — Transaction audit events → Regulator Portal
 *   paygate.corridor.volume.v1    — Corridor volume aggregates → Analytics
 *
 * These are published by Paygate's auditMiddleware and analytics jobs.
 * NextHub materialises them into its read-model tables.
 */

import { ENV } from "../_core/env";

export const PAYGATE_NEXTHUB_TOPICS = {
  AUDIT:           "paygate.audit.v1",
  CORRIDOR_VOLUME: "paygate.corridor.volume.v1",
} as const;

// ─── Typed event payloads ─────────────────────────────────────────────────────
export interface PaygateAuditEvent {
  eventType: string;
  entityId: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  description?: string;
  metadata?: Record<string, unknown>;
  timestamp: string;
}

export interface PaygateCorridorVolumeEvent {
  payerFspId: string;
  payeeFspId: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  windowStartMs: number;
  windowEndMs: number;
}

// ─── Lazy producer ────────────────────────────────────────────────────────────
let _kafka: any = null;
let _producer: any = null;
let _connected = false;

async function getKafka() {
  const brokers = (ENV as any).kafkaBootstrapServers;
  if (!brokers) return null;
  if (_kafka) return _kafka;
  try {
    const { Kafka } = await import("kafkajs" as any);
    _kafka = new Kafka({
      clientId: "paygate-nexthub-producer",
      brokers: brokers.split(",").map((b: string) => b.trim()),
      ssl: brokers.includes("ssl://"),
      retry: { initialRetryTime: 300, retries: 8 },
    });
    return _kafka;
  } catch {
    console.warn("[paygate-nexthub-producer] kafkajs not available");
    return null;
  }
}

async function getProducer() {
  if (_producer && _connected) return _producer;
  const kafka = await getKafka();
  if (!kafka) return null;
  try {
    _producer = kafka.producer({ maxInFlightRequests: 5, idempotent: true });
    await _producer.connect();
    _connected = true;
    return _producer;
  } catch (err) {
    console.warn("[paygate-nexthub-producer] Connection failed:", err);
    return null;
  }
}

async function publish<T extends object>(topic: string, payload: T, key?: string): Promise<boolean> {
  const producer = await getProducer();
  if (!producer) return false;
  try {
    await producer.send({
      topic,
      messages: [{
        key: key ?? null,
        value: JSON.stringify({
          ...payload,
          _meta: { topic, publishedAt: new Date().toISOString(), source: "paygate-dfsp" },
        }),
        headers: { "content-type": "application/json", "source": "paygate-dfsp" },
      }],
    });
    return true;
  } catch (err) {
    console.error(`[paygate-nexthub-producer] Failed to publish to ${topic}:`, err);
    return false;
  }
}

// ─── Typed publish helpers ────────────────────────────────────────────────────
export const paygatePublish = {
  /** Publish a transaction audit event to NextHub's Regulator Portal feed */
  auditEvent: (e: PaygateAuditEvent) =>
    publish(PAYGATE_NEXTHUB_TOPICS.AUDIT, e, e.entityId),

  /** Publish aggregated corridor volume for NextHub analytics */
  corridorVolume: (e: PaygateCorridorVolumeEvent) =>
    publish(PAYGATE_NEXTHUB_TOPICS.CORRIDOR_VOLUME, e, `${e.payerFspId}→${e.payeeFspId}`),
};

export async function disconnectNexhubProducer() {
  if (_producer && _connected) {
    await _producer.disconnect();
    _connected = false;
  }
}
