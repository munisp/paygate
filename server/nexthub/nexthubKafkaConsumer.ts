/**
 * nexthubKafkaConsumer.ts — Paygate Kafka Consumer for NextHub Events
 * ─────────────────────────────────────────────────────────────────────────────
 * Consumes events published by NextHub and materialises them into Paygate's
 * local state so the Paygate portal can display them without calling NextHub.
 *
 * Consumer Groups:
 *   paygate-ndc-consumer         → nexthub.ndc.breach.v1
 *   paygate-fx-consumer          → nexthub.fx.rates.v1
 *   paygate-settlement-consumer  → nexthub.settlement.closed.v1
 *                                   nexthub.settlement.settled.v1
 *   paygate-participant-consumer → nexthub.participant.status.v1
 *
 * All consumers are lazy — they only start if KAFKA_BOOTSTRAP_SERVERS is set.
 * Paygate's existing kafkaClient.ts handles the Kafka connection.
 */

import { ENV } from "../_core/env";
import { getDb } from "../db";

// ─── NextHub topic constants (mirror of nexthubKafkaProducer.ts) ──────────────
export const NEXTHUB_TOPICS = {
  TRANSFER_RECEIVED:     "nexthub.transfer.received.v1",
  TRANSFER_COMMITTED:    "nexthub.transfer.committed.v1",
  TRANSFER_ABORTED:      "nexthub.transfer.aborted.v1",
  FX_RATES:              "nexthub.fx.rates.v1",
  NDC_BREACH:            "nexthub.ndc.breach.v1",
  SETTLEMENT_CLOSED:     "nexthub.settlement.closed.v1",
  SETTLEMENT_SETTLED:    "nexthub.settlement.settled.v1",
  PARTICIPANT_STATUS:    "nexthub.participant.status.v1",
} as const;

// ─── In-memory caches (populated by consumers) ────────────────────────────────
// These are used by Paygate tRPC routers as fast local lookups.

/** Latest FX rates from NextHub — keyed by "SOURCE/TARGET" */
export const fxRateCache = new Map<string, {
  midRate: number;
  buyRate: number;
  sellRate: number;
  markupBps: number;
  validFrom: string;
  validTo: string;
  provider: string;
  updatedAt: number;
}>();

/** Recent NDC breach events — ring buffer of last 100 */
const NDC_BREACH_RING_SIZE = 100;
const ndcBreachRing: Array<{
  dfspId: string;
  limitType: string;
  threshold: number;
  breachAmount: number;
  currency: string;
  timestamp: string;
  receivedAt: number;
}> = [];

export function getNdcBreachRing() {
  return [...ndcBreachRing];
}

function pushNdcBreach(event: any) {
  ndcBreachRing.push({ ...event, receivedAt: Date.now() });
  if (ndcBreachRing.length > NDC_BREACH_RING_SIZE) ndcBreachRing.shift();
}

/** Latest settlement windows — keyed by windowId */
export const settlementWindowCache = new Map<string, {
  windowId: string;
  state: string;
  currency: string;
  totalTransfers: number;
  totalAmountKobo: number;
  closedAt: string;
  settledAt?: string;
  updatedAt: number;
}>();

/** DFSP status cache — keyed by dfspId */
export const dfspStatusCache = new Map<string, {
  dfspId: string;
  dfspName: string;
  status: string;
  updatedAt: number;
}>();

// ─── Lazy Kafka factory ───────────────────────────────────────────────────────
async function getKafka() {
  const brokers = (ENV as any).kafkaBootstrapServers;
  if (!brokers) return null;
  try {
    const { Kafka } = await import("kafkajs" as any);
    return new Kafka({
      clientId: "paygate-nexthub-consumer",
      brokers: brokers.split(",").map((b: string) => b.trim()),
      ssl: brokers.includes("ssl://"),
      retry: { initialRetryTime: 300, retries: 8 },
    });
  } catch {
    console.warn("[paygate-nexthub-consumer] kafkajs not available");
    return null;
  }
}

// ─── FX Rate Consumer ─────────────────────────────────────────────────────────
// Caches NextHub FX rates locally so Paygate's corridorRouter.ts can serve
// rate lookups without a gRPC call on every request.
async function startFxRateConsumer(kafka: any) {
  const consumer = kafka.consumer({ groupId: "paygate-fx-consumer" });
  await consumer.connect();
  await consumer.subscribe({ topic: NEXTHUB_TOPICS.FX_RATES, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }: any) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const key = `${payload.sourceCurrency}/${payload.targetCurrency}`;
        fxRateCache.set(key, {
          midRate: payload.midRate,
          buyRate: payload.buyRate,
          sellRate: payload.sellRate,
          markupBps: payload.markupBps ?? 0,
          validFrom: payload.validFrom,
          validTo: payload.validTo,
          provider: payload.provider ?? "nexthub",
          updatedAt: Date.now(),
        });
        console.log(`[paygate-fx-consumer] Cached rate ${key} = ${payload.midRate}`);
      } catch (err) {
        console.error("[paygate-fx-consumer] Parse error:", err);
      }
    },
  });
  return consumer;
}

// ─── NDC Breach Consumer ──────────────────────────────────────────────────────
// Receives NDC breach alerts from NextHub and stores them locally.
// The Paygate NDC Breach Events page reads from this ring buffer.
async function startNdcBreachConsumer(kafka: any) {
  const consumer = kafka.consumer({ groupId: "paygate-ndc-consumer" });
  await consumer.connect();
  await consumer.subscribe({ topic: NEXTHUB_TOPICS.NDC_BREACH, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }: any) => {
      try {
        const payload = JSON.parse(message.value.toString());
        pushNdcBreach(payload);

        // Also persist to DB for the NdcBreachEvents page
        const db = await getDb();
        if (db) {
          // Dynamic import to avoid circular deps
          const { ndcBreachEvents } = await import("../../drizzle/schema");
          await db.insert(ndcBreachEvents).values({
            dfspId: payload.dfspId,
            limitType: payload.limitType,
            threshold: payload.threshold,
            breachAmount: payload.breachAmount,
            currency: payload.currency ?? "NGN",
            severity: payload.breachAmount > payload.threshold * 1.5 ? "critical"
              : payload.breachAmount > payload.threshold * 1.2 ? "high" : "medium",
            source: "nexthub_kafka",
          }).onConflictDoNothing();
        }

        console.log(`[paygate-ndc-consumer] NDC breach received for DFSP ${payload.dfspId}`);
      } catch (err) {
        console.error("[paygate-ndc-consumer] Error:", err);
      }
    },
  });
  return consumer;
}

// ─── Settlement Consumer ──────────────────────────────────────────────────────
async function startSettlementConsumer(kafka: any) {
  const consumer = kafka.consumer({ groupId: "paygate-settlement-consumer" });
  await consumer.connect();
  await consumer.subscribe({
    topics: [NEXTHUB_TOPICS.SETTLEMENT_CLOSED, NEXTHUB_TOPICS.SETTLEMENT_SETTLED],
    fromBeginning: false,
  });

  await consumer.run({
    eachMessage: async ({ topic, message }: any) => {
      try {
        const payload = JSON.parse(message.value.toString());
        const existing = settlementWindowCache.get(payload.windowId) ?? {};
        settlementWindowCache.set(payload.windowId, {
          ...existing,
          windowId: payload.windowId,
          state: topic === NEXTHUB_TOPICS.SETTLEMENT_SETTLED ? "SETTLED" : "CLOSED",
          currency: payload.currency,
          totalTransfers: payload.totalTransfers,
          totalAmountKobo: payload.totalAmountKobo,
          closedAt: payload.closedAt ?? existing.closedAt ?? new Date().toISOString(),
          settledAt: topic === NEXTHUB_TOPICS.SETTLEMENT_SETTLED ? payload.settledAt : undefined,
          updatedAt: Date.now(),
        });
        console.log(`[paygate-settlement-consumer] Window ${payload.windowId} → ${topic}`);
      } catch (err) {
        console.error("[paygate-settlement-consumer] Error:", err);
      }
    },
  });
  return consumer;
}

// ─── Participant Status Consumer ──────────────────────────────────────────────
async function startParticipantStatusConsumer(kafka: any) {
  const consumer = kafka.consumer({ groupId: "paygate-participant-consumer" });
  await consumer.connect();
  await consumer.subscribe({ topic: NEXTHUB_TOPICS.PARTICIPANT_STATUS, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ message }: any) => {
      try {
        const payload = JSON.parse(message.value.toString());
        dfspStatusCache.set(payload.dfspId, {
          dfspId: payload.dfspId,
          dfspName: payload.dfspName,
          status: payload.newStatus,
          updatedAt: Date.now(),
        });
        console.log(`[paygate-participant-consumer] DFSP ${payload.dfspId} → ${payload.newStatus}`);
      } catch (err) {
        console.error("[paygate-participant-consumer] Error:", err);
      }
    },
  });
  return consumer;
}

// ─── Start all consumers ──────────────────────────────────────────────────────
let _started = false;
export async function startNexhubKafkaConsumers() {
  if (_started) return;
  _started = true;
  const kafka = await getKafka();
  if (!kafka) {
    console.log("[paygate-nexthub-consumer] Kafka not configured — consumers disabled");
    return;
  }
  try {
    await Promise.all([
      startFxRateConsumer(kafka),
      startNdcBreachConsumer(kafka),
      startSettlementConsumer(kafka),
      startParticipantStatusConsumer(kafka),
    ]);
    console.log("[paygate-nexthub-consumer] All NextHub Kafka consumers running");
  } catch (err) {
    console.error("[paygate-nexthub-consumer] Failed to start consumers:", err);
  }
}
