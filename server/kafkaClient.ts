/**
 * kafkaClient.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * Kafka producer/consumer client for PayGate event streaming.
 * Uses kafkajs for Node.js compatibility. Falls back gracefully when
 * KAFKA_BOOTSTRAP_SERVERS is not configured (local dev / test environments).
 *
 * Topics:
 *   paygate.transactions   — every transaction lifecycle event
 *   paygate.payouts        — payout created / approved / failed
 *   paygate.fraud          — fraud alert raised / resolved
 *   paygate.kyc            — KYC status changes
 *   paygate.settlements    — settlement batch events
 *   paygate.audit          — audit log events (append-only)
 *   paygate.notifications  — push notification requests
 */

import { ENV } from "./_core/env";

// ─── Types ────────────────────────────────────────────────────────────────────
export interface KafkaMessage<T = unknown> {
  topic: string;
  key?: string;
  value: T;
  headers?: Record<string, string>;
}

export interface KafkaConsumerConfig {
  groupId: string;
  topics: string[];
  handler: (msg: KafkaMessage) => Promise<void>;
}

// ─── Topic constants ──────────────────────────────────────────────────────────
export const KAFKA_TOPICS = {
  TRANSACTIONS: "paygate.transactions",
  PAYOUTS: "paygate.payouts",
  FRAUD: "paygate.fraud",
  KYC: "paygate.kyc",
  SETTLEMENTS: "paygate.settlements",
  AUDIT: "paygate.audit",
  NOTIFICATIONS: "paygate.notifications",
  WEBHOOKS: "paygate.webhooks",
  ANALYTICS: "paygate.analytics",
  COMPLIANCE: "paygate.compliance",
  STR: "paygate.str",
  VELOCITY: "paygate.velocity",
  INTERCHANGE: "paygate.interchange",
  CHARGEBACK: "paygate.chargeback",
  REGULATORY: "paygate.regulatory",
} as const;

// ─── Lazy Kafka client (avoids import errors when kafkajs not installed) ───────
let _kafka: any = null;
let _producer: any = null;

async function getKafka() {
  if (!ENV.kafkaBootstrapServers) return null;
  if (_kafka) return _kafka;
  try {
    const { Kafka } = await import("kafkajs" as any);
    _kafka = new Kafka({
      clientId: "paygate-merchant-portal",
      brokers: ENV.kafkaBootstrapServers.split(",").map((b: string) => b.trim()),
      ssl: ENV.kafkaBootstrapServers.includes("ssl://"),
      retry: {
        initialRetryTime: 300,
        retries: 8,
      },
    });
    return _kafka;
  } catch {
    console.warn("[kafka] kafkajs not available — event publishing disabled");
    return null;
  }
}

async function getProducer() {
  if (_producer) return _producer;
  const kafka = await getKafka();
  if (!kafka) return null;
  _producer = kafka.producer({
    maxInFlightRequests: 5,
    idempotent: true,
    transactionTimeout: 30_000,
  });
  await _producer.connect();
  process.on("beforeExit", () => _producer?.disconnect());
  return _producer;
}

// ─── Public API ───────────────────────────────────────────────────────────────

/**
 * Publish a single event to a Kafka topic.
 * Fire-and-forget — never throws; logs errors instead.
 */
export async function publishEvent<T = unknown>(
  topic: string,
  value: T,
  key?: string,
  headers?: Record<string, string>
): Promise<boolean> {
  try {
    const producer = await getProducer();
    if (!producer) return false;

    await producer.send({
      topic,
      messages: [
        {
          key: key ?? null,
          value: JSON.stringify(value),
          headers: {
            "content-type": "application/json",
            "x-source": "paygate-portal",
            "x-timestamp": new Date().toISOString(),
            ...(headers ?? {}),
          },
        },
      ],
    });
    return true;
  } catch (err) {
    console.error(`[kafka] Failed to publish to ${topic}:`, err);
    return false;
  }
}

/**
 * Publish a transaction lifecycle event.
 */
export async function publishTransactionEvent(payload: {
  type: "created" | "updated" | "refunded" | "failed";
  transactionId: string;
  merchantId: string;
  amount: number;
  currency: string;
  status: string;
  metadata?: Record<string, unknown>;
}) {
  return publishEvent(KAFKA_TOPICS.TRANSACTIONS, payload, payload.transactionId);
}

/**
 * Publish a payout event.
 */
export async function publishPayoutEvent(payload: {
  type: "created" | "approved" | "rejected" | "processed" | "failed";
  payoutId: string;
  merchantId: string;
  amount: number;
  currency: string;
}) {
  return publishEvent(KAFKA_TOPICS.PAYOUTS, payload, payload.payoutId);
}

/**
 * Publish a fraud alert event.
 */
export async function publishFraudEvent(payload: {
  type?: "alert_raised" | "alert_resolved" | "rule_triggered";
  alertType?: string;
  merchantId: string;
  transactionId?: string;
  riskScore: number;
  reason?: string;
  description?: string;
}) {
  return publishEvent(KAFKA_TOPICS.FRAUD, payload, payload.merchantId);
}

/**
 * Publish an audit log event (append-only, high-priority).
 */
export async function publishAuditEvent(payload: {
  userId: string;
  merchantId?: string;
  action: string;
  resource?: string;
  resourceId?: string;
  targetId?: string;
  ipAddress?: string;
  userAgent?: string;
  result?: "success" | "failure";
  metadata?: Record<string, unknown>;
  timestamp?: string;
}) {
  return publishEvent(KAFKA_TOPICS.AUDIT, {
    ...payload,
    timestamp: new Date().toISOString(),
  });
}

/**
 * Start a Kafka consumer group. Returns a cleanup function.
 */
export async function startConsumer(config: KafkaConsumerConfig): Promise<() => Promise<void>> {
  const kafka = await getKafka();
  if (!kafka) return async () => {};

  const consumer = kafka.consumer({ groupId: config.groupId });
  await consumer.connect();
  await consumer.subscribe({ topics: config.topics, fromBeginning: false });

  await consumer.run({
    eachMessage: async ({ topic, message }: any) => {
      try {
        const value = message.value ? JSON.parse(message.value.toString()) : null;
        const headers: Record<string, string> = {};
        for (const [k, v] of Object.entries(message.headers ?? {})) {
          headers[k] = v?.toString() ?? "";
        }
        await config.handler({ topic, key: message.key?.toString(), value, headers });
      } catch (err) {
        console.error(`[kafka] Consumer error on topic ${topic}:`, err);
      }
    },
  });

  return async () => {
    await consumer.disconnect();
  };
}
