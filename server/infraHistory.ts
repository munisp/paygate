/**
 * infraHistory.ts
 * ─────────────────────────────────────────────────────────────────────────────
 * REAL observation backends for the InfraPage detail modals:
 *
 *   - Kafka topic throughput history  (kafkajs Admin: metadata + offsets)
 *   - Kafka consumer group detail     (kafkajs Admin: describeGroups + offsets)
 *   - Redis node stats history        (ioredis INFO / CONFIG via redisClient)
 *
 * History model: nothing here fabricates a series. Every history point is a
 * genuinely observed sample. Samples are appended to module-level in-memory
 * ring buffers each time the corresponding procedure polls the live source
 * (buffers start empty at boot and cap at MAX_SAMPLES per key). Rate values
 * (msg/s, hits, misses) are computed as deltas between consecutive observed
 * samples — the first observed sample has no computable rate and is reported
 * with a null rate rather than a guessed number.
 *
 * Every public function returns null when the real source is not configured
 * or is unreachable, so callers can fall through to the demoOrFail gate.
 */

import { ENV } from "./_core/env";
import { getRedis } from "./redisClient";
import { logger } from "./logger";

// ─── Ring buffers ────────────────────────────────────────────────────────────

/** ~24h of 30s polls × 3, headroom for 7d/30d ranges at modal-poll cadence. */
const MAX_SAMPLES = 10_000;
/** Don't append a new sample if the last one is younger than this (dedup). */
const MIN_SAMPLE_INTERVAL_MS = 5_000;
/** Drop samples older than 35 days regardless of count. */
const MAX_SAMPLE_AGE_MS = 35 * 24 * 3600 * 1000;

interface KafkaTopicSample {
  ts: number;
  totalOffset: number; // sum of partition high-water marks
  lag: number; // sum of consumer-group lag across all groups on this topic
}

interface RedisNodeSample {
  ts: number;
  usedMb: number;
  maxMb: number; // 0 = unlimited (maxmemory not set)
  keyspaceHits: number; // cumulative counter from INFO
  keyspaceMisses: number; // cumulative counter from INFO
}

interface ConsumerGroupLagSample {
  ts: number;
  lag: number;
}

const kafkaTopicSamples = new Map<string, KafkaTopicSample[]>();
const redisNodeSamples = new Map<string, RedisNodeSample[]>();
const consumerGroupLagSamples = new Map<string, ConsumerGroupLagSample[]>();

function appendSample<T extends { ts: number }>(buffer: Map<string, T[]>, key: string, sample: T): T[] {
  let arr = buffer.get(key);
  if (!arr) {
    arr = [];
    buffer.set(key, arr);
  }
  const last = arr[arr.length - 1];
  if (last && sample.ts - last.ts < MIN_SAMPLE_INTERVAL_MS) {
    // Too soon after the previous sample — refresh it in place instead of
    // appending a near-duplicate point.
    arr[arr.length - 1] = sample;
  } else {
    arr.push(sample);
  }
  const cutoff = Date.now() - MAX_SAMPLE_AGE_MS;
  while (arr.length > MAX_SAMPLES || (arr.length > 0 && arr[0].ts < cutoff)) arr.shift();
  return arr;
}

// ─── Time labels (match the mock label conventions the client charts) ────────

function sampleLabel(ts: number, rangeHours: number): string {
  const t = new Date(ts);
  const md = `${String(t.getMonth() + 1).padStart(2, "0")}/${String(t.getDate()).padStart(2, "0")}`;
  if (rangeHours <= 72) {
    return `${md} ${String(t.getHours()).padStart(2, "0")}:${String(t.getMinutes()).padStart(2, "0")}`;
  }
  return md;
}

function rangeWindow(from?: string, to?: string): { fromMs: number; toMs: number; rangeHours: number } {
  const toMs = to ? new Date(to).getTime() : Date.now();
  const fromMs = from ? new Date(from).getTime() : toMs - 24 * 3600 * 1000;
  const rangeHours = Math.max(1, Math.round((toMs - fromMs) / 3600000));
  return { fromMs, toMs, rangeHours };
}

// ─── Kafka admin (lazy, mirrors kafkaClient.ts connection pattern) ───────────

let _admin: any = null;
let _assignerProtocol: any = null;

async function getKafkaAdmin(): Promise<any | null> {
  if (!ENV.kafkaBootstrapServers) return null;
  if (_admin) return _admin;
  try {
    const { Kafka, AssignerProtocol } = (await import("kafkajs" as any)) as any;
    _assignerProtocol = AssignerProtocol;
    const kafka = new Kafka({
      clientId: "paygate-infra-observer",
      brokers: ENV.kafkaBootstrapServers.split(",").map((b: string) => b.trim()),
      ssl: ENV.kafkaBootstrapServers.includes("ssl://"),
      retry: { initialRetryTime: 300, retries: 3 },
    });
    const admin = kafka.admin();
    await admin.connect();
    _admin = admin;
    return _admin;
  } catch (err) {
    logger.warn("[infraHistory] kafka admin unavailable", { error: String(err) });
    return null;
  }
}

/** Drop the cached admin so the next call reconnects (e.g. after broker restart). */
function resetKafkaAdmin(): void {
  try {
    _admin?.disconnect().catch((e: unknown) => console.warn("[infraHistory] kafka admin disconnect failed:", e instanceof Error ? e.message : String(e)));
  } catch {}
  _admin = null;
  _assignerProtocol = null;
}

// ─── Kafka: topic history ────────────────────────────────────────────────────

export interface TopicHistoryResult {
  topicName: string;
  history: Array<{ time: string; msgPerSec: number | null; lag: number; errorRate: number | null }>;
  config: {
    partitions: number;
    replication: number;
    retentionHours: number | null;
    compressionType: string | null;
    cleanupPolicy: string | null;
    minInsyncReplicas: number | null;
  };
  source: string;
}

/**
 * Observe the topic via the Kafka admin API and return its real config plus
 * the ring buffer of genuinely observed throughput/lag samples.
 * Returns null when Kafka is not configured/unreachable or the topic is unknown.
 */
export async function getLiveTopicHistory(
  topicName: string,
  from?: string,
  to?: string,
): Promise<TopicHistoryResult | null> {
  const admin = await getKafkaAdmin();
  if (!admin) return null;
  try {
    const [{ topics }, offsets] = await Promise.all([
      admin.fetchTopicMetadata({ topics: [topicName] }),
      admin.fetchTopicOffsets(topicName),
    ]);
    const meta = topics?.[0];
    if (!meta || !Array.isArray(offsets) || offsets.length === 0) return null;

    const totalOffset = offsets.reduce(
      (s: number, o: any) => s + Math.max(0, Number.parseInt(o.high ?? o.offset ?? "0", 10) || 0),
      0,
    );

    // Real consumer lag: sum over every group with committed offsets on this topic.
    let lag = 0;
    try {
      const { groups } = await admin.listGroups();
      const perGroup = await Promise.allSettled(
        (groups ?? []).map((g: any) => admin.fetchOffsets({ groupId: g.groupId, topics: [topicName] })),
      );
      for (const r of perGroup) {
        if (r.status !== "fulfilled") continue;
        for (const t of r.value ?? []) {
          for (const p of t.partitions ?? []) {
            const committed = Number.parseInt(p.offset ?? "-1", 10);
            if (committed < 0) continue; // no committed offset → lag unknowable
            const high = offsets.find((o: any) => o.partition === p.partition);
            const highMark = Number.parseInt(high?.high ?? high?.offset ?? "0", 10) || 0;
            lag += Math.max(0, highMark - committed);
          }
        }
      }
    } catch (err) {
      logger.warn("[infraHistory] lag computation failed; reporting offsets only", { error: String(err) });
    }

    const now = Date.now();
    const samples = appendSample(kafkaTopicSamples, topicName, { ts: now, totalOffset, lag });
    const { fromMs, toMs, rangeHours } = rangeWindow(from, to);

    const history = samples
      .map((s, i) => ({ s, prev: i > 0 ? samples[i - 1] : null }))
      .filter(({ s }) => s.ts >= fromMs && s.ts <= toMs)
      .map(({ s, prev }) => {
        // Throughput is only knowable as a delta between two observed samples.
        const msgPerSec =
          prev && s.ts > prev.ts
            ? Math.round(Math.max(0, s.totalOffset - prev.totalOffset) / ((s.ts - prev.ts) / 1000))
            : null;
        return {
          time: sampleLabel(s.ts, rangeHours),
          msgPerSec,
          lag: s.lag,
          // Per-topic produce/consume error rate is NOT exposed by the Kafka
          // admin protocol — reported as null (chart gap) instead of fabricated.
          errorRate: null,
        };
      });

    // Topic config: real broker-side config when describeConfigs is permitted,
    // nulls for values the broker refuses to disclose (never defaults invented).
    const config: TopicHistoryResult["config"] = {
      partitions: meta.partitions?.length ?? 0,
      replication: meta.partitions?.[0]?.replicas?.length ?? 0,
      retentionHours: null,
      compressionType: null,
      cleanupPolicy: null,
      minInsyncReplicas: null,
    };
    try {
      const { ConfigResourceTypes } = (await import("kafkajs" as any)) as any;
      const cfg = await admin.describeConfigs({
        includeSynonyms: false,
        resources: [
          {
            type: ConfigResourceTypes.TOPIC,
            name: topicName,
            configNames: ["retention.ms", "compression.type", "cleanup.policy", "min.insync.replicas"],
          },
        ],
      });
      const entries: Array<{ configName: string; configValue: string }> =
        cfg?.resources?.[0]?.configEntries ?? [];
      const get = (n: string) => entries.find(e => e.configName === n)?.configValue;
      const retentionMs = Number.parseInt(get("retention.ms") ?? "", 10);
      config.retentionHours = Number.isFinite(retentionMs) && retentionMs > 0
        ? Math.round(retentionMs / 3600000)
        : null; // -1 (infinite) or unset → null
      config.compressionType = get("compression.type") ?? null;
      config.cleanupPolicy = get("cleanup.policy") ?? null;
      const minIsr = Number.parseInt(get("min.insync.replicas") ?? "", 10);
      config.minInsyncReplicas = Number.isFinite(minIsr) ? minIsr : null;
    } catch (err) {
      logger.warn("[infraHistory] describeConfigs denied/unavailable", { topic: topicName, error: String(err) });
    }

    return { topicName, history, config, source: "live" };
  } catch (err) {
    logger.warn("[infraHistory] topicHistory live query failed", { topic: topicName, error: String(err) });
    resetKafkaAdmin();
    return null;
  }
}

// ─── Kafka: consumer group detail ────────────────────────────────────────────

export interface ConsumerGroupDetailResult {
  groupName: string;
  topic: string;
  state: string;
  protocol: string;
  partitions: Array<{
    partition: number;
    topic: string;
    currentOffset: number;
    logEndOffset: number;
    lag: number;
    memberId: string;
    clientId: string;
    host: string;
    recentlyReassigned: boolean;
  }>;
  members: Array<{
    memberId: string;
    clientId: string;
    host: string;
    assignedPartitions: number[];
    totalLag: number;
  }>;
  lagHistory: Array<{ time: string; lag: number }>;
  source: string;
}

/** Decode a kafkajs memberAssignment buffer into topic → partition ids. */
function decodeMemberAssignment(buf: Buffer): Array<{ topic: string; partitions: number[] }> {
  try {
    if (!_assignerProtocol || !buf || buf.length === 0) return [];
    const decoded = _assignerProtocol.MemberAssignment.decode(buf);
    return Object.entries(decoded.assignment ?? {}).map(([topic, partitions]) => ({
      topic,
      partitions: partitions as number[],
    }));
  } catch {
    return [];
  }
}

/**
 * Observe a consumer group via the Kafka admin API: real state/protocol,
 * real member assignments (decoded from the group protocol), real committed
 * offsets and log-end offsets per partition. Returns null when Kafka is not
 * configured/unreachable or the group does not exist.
 */
export async function getLiveConsumerGroupDetail(groupName: string): Promise<ConsumerGroupDetailResult | null> {
  const admin = await getKafkaAdmin();
  if (!admin) return null;
  try {
    const [{ groups }, committed] = await Promise.all([
      admin.describeGroups([groupName]),
      admin.fetchOffsets({ groupId: groupName }),
    ]);
    const group = groups?.[0];
    if (!group) return null;

    // Log-end offsets for every topic this group has offsets/assignments on.
    const topicSet = new Set<string>();
    for (const t of committed ?? []) topicSet.add(t.topic);
    const memberAssignments = new Map<string, Array<{ topic: string; partitions: number[] }>>();
    for (const m of group.members ?? []) {
      memberAssignments.set(m.memberId, decodeMemberAssignment(m.memberAssignment));
      for (const a of memberAssignments.get(m.memberId)!) topicSet.add(a.topic);
    }

    const logEnds = new Map<string, Map<number, number>>(); // topic → partition → high
    await Promise.all(
      [...topicSet].map(async topic => {
        try {
          const offs = await admin.fetchTopicOffsets(topic);
          logEnds.set(
            topic,
            new Map(offs.map((o: any) => [o.partition as number, Number.parseInt(o.high ?? o.offset ?? "0", 10) || 0])),
          );
        } catch (err) {
          logger.warn("[infraHistory] fetchTopicOffsets failed", { topic, error: String(err) });
        }
      }),
    );

    // Partition → owning member (from decoded assignments).
    const ownerByTopicPartition = new Map<string, { memberId: string; clientId: string; host: string }>();
    for (const m of group.members ?? []) {
      for (const a of memberAssignments.get(m.memberId) ?? []) {
        for (const p of a.partitions) {
          ownerByTopicPartition.set(`${a.topic}:${p}`, {
            memberId: m.memberId,
            clientId: m.clientId,
            host: String(m.clientHost ?? "").replace(/^\//, ""),
          });
        }
      }
    }

    const partitions: ConsumerGroupDetailResult["partitions"] = [];
    const seen = new Set<string>();
    for (const t of committed ?? []) {
      for (const p of t.partitions ?? []) {
        seen.add(`${t.topic}:${p.partition}`);
        const committedOffset = Number.parseInt(p.offset ?? "-1", 10);
        const logEndOffset = logEnds.get(t.topic)?.get(p.partition) ?? 0;
        const owner = ownerByTopicPartition.get(`${t.topic}:${p.partition}`);
        partitions.push({
          partition: p.partition,
          topic: t.topic,
          // -1 when the group has never committed an offset for this partition;
          // lag is then unknowable from the broker and reported as 0.
          currentOffset: committedOffset >= 0 ? committedOffset : -1,
          logEndOffset,
          lag: committedOffset >= 0 ? Math.max(0, logEndOffset - committedOffset) : 0,
          memberId: owner?.memberId ?? "—",
          clientId: owner?.clientId ?? "—",
          host: owner?.host ?? "—",
          // Reassignment recency is not exposed by the admin protocol — never claimed.
          recentlyReassigned: false,
        });
      }
    }
    // Assigned-but-never-committed partitions: visible via member assignments only.
    for (const [key, owner] of ownerByTopicPartition) {
      if (seen.has(key)) continue;
      const sep = key.lastIndexOf(":");
      const topic = key.slice(0, sep);
      const partition = Number(key.slice(sep + 1));
      partitions.push({
        partition,
        topic,
        currentOffset: -1,
        logEndOffset: logEnds.get(topic)?.get(partition) ?? 0,
        lag: 0,
        memberId: owner.memberId,
        clientId: owner.clientId,
        host: owner.host,
        recentlyReassigned: false,
      });
    }
    partitions.sort((a, b) => a.topic.localeCompare(b.topic) || a.partition - b.partition);

    const members = (group.members ?? []).map((m: any) => {
      const assigned = (memberAssignments.get(m.memberId) ?? []).flatMap(a => a.partitions);
      const totalLag = (memberAssignments.get(m.memberId) ?? []).reduce((sum, a) => {
        return (
          sum +
          a.partitions.reduce((s, p) => {
            const entry = partitions.find(x => x.topic === a.topic && x.partition === p);
            return s + (entry?.lag ?? 0);
          }, 0)
        );
      }, 0);
      return {
        memberId: m.memberId,
        clientId: m.clientId,
        host: String(m.clientHost ?? "").replace(/^\//, ""),
        assignedPartitions: assigned,
        totalLag,
      };
    });

    const totalLag = partitions.reduce((s, p) => s + p.lag, 0);
    const samples = appendSample(consumerGroupLagSamples, groupName, { ts: Date.now(), lag: totalLag });
    const lagHistory = samples.map(s => ({
      time: sampleLabel(s.ts, 24),
      lag: s.lag,
    }));

    const topics = [...topicSet];
    return {
      groupName,
      topic: topics.join(", ") || "unknown",
      state: group.state,
      protocol: group.protocol || group.protocolType || "consumer",
      partitions,
      members,
      lagHistory,
      source: "live",
    };
  } catch (err) {
    logger.warn("[infraHistory] consumerGroupDetail live query failed", { group: groupName, error: String(err) });
    resetKafkaAdmin();
    return null;
  }
}

// ─── Redis: node history ─────────────────────────────────────────────────────

export interface RedisNodeHistoryResult {
  nodeId: string;
  memHistory: Array<{ time: string; usedMb: number; maxMb: number; pct: number | null }>;
  hitMissHistory: Array<{ time: string; hits: number | null; misses: number | null; hitRate: number | null }>;
  config: {
    maxMemoryPolicy: string;
    maxMemory: string;
    persistenceMode: string;
    replicationLag: string;
  };
  source: string;
}

function parseInfo(info: string): Record<string, string> {
  const out: Record<string, string> = {};
  for (const line of info.split(/\r?\n/)) {
    if (!line || line.startsWith("#")) continue;
    const idx = line.indexOf(":");
    if (idx > 0) out[line.slice(0, idx).trim()] = line.slice(idx + 1).trim();
  }
  return out;
}

/**
 * Observe the configured Redis instance via real INFO / CONFIG commands and
 * return the ring buffer of genuinely observed memory + hit/miss samples.
 * nodeId keys the buffer (the deployment exposes a single REDIS_URL; distinct
 * node ids share the instance until per-node URLs are configured).
 * Returns null when Redis is not configured or unreachable.
 */
export async function getLiveRedisNodeHistory(
  nodeId: string,
  from?: string,
  to?: string,
): Promise<RedisNodeHistoryResult | null> {
  const redis = await getRedis();
  if (!redis) return null;
  try {
    const raw: string = await redis.info();
    const info = parseInfo(raw);

    const usedBytes = Number.parseInt(info.used_memory ?? "0", 10) || 0;
    const maxBytes = Number.parseInt(info.maxmemory ?? "0", 10) || 0;
    const usedMb = Math.round(usedBytes / (1024 * 1024));
    const maxMb = Math.round(maxBytes / (1024 * 1024));
    const keyspaceHits = Number.parseInt(info.keyspace_hits ?? "0", 10) || 0;
    const keyspaceMisses = Number.parseInt(info.keyspace_misses ?? "0", 10) || 0;

    const samples = appendSample(redisNodeSamples, nodeId, {
      ts: Date.now(),
      usedMb,
      maxMb,
      keyspaceHits,
      keyspaceMisses,
    });
    const { fromMs, toMs, rangeHours } = rangeWindow(from, to);

    const memHistory = samples
      .filter(s => s.ts >= fromMs && s.ts <= toMs)
      .map(s => ({
        time: sampleLabel(s.ts, rangeHours),
        usedMb: s.usedMb,
        maxMb: s.maxMb,
        pct: s.maxMb > 0 ? parseFloat(((s.usedMb / s.maxMb) * 100).toFixed(1)) : null, // maxmemory unset → pct unknowable
      }));

    // Hits/misses are cumulative counters — per-bucket values are deltas
    // between consecutive observed samples; the first sample has no delta.
    const hitMissHistory = samples
      .map((s, i) => ({ s, prev: i > 0 ? samples[i - 1] : null }))
      .filter(({ s }) => s.ts >= fromMs && s.ts <= toMs)
      .map(({ s, prev }) => {
        if (!prev) return { time: sampleLabel(s.ts, rangeHours), hits: null, misses: null, hitRate: null };
        // Counters reset on restart — a negative delta means "counter reset", not traffic.
        const hits = Math.max(0, s.keyspaceHits - prev.keyspaceHits);
        const misses = Math.max(0, s.keyspaceMisses - prev.keyspaceMisses);
        const hitRate = hits + misses > 0 ? parseFloat(((hits / (hits + misses)) * 100).toFixed(1)) : null;
        return { time: sampleLabel(s.ts, rangeHours), hits, misses, hitRate };
      });

    // Config: straight from INFO/CONFIG, no invented defaults.
    const role = info.role ?? "unknown";
    const isReplica = role === "slave" || role === "replica";
    let persistenceMode: string;
    if (isReplica) {
      persistenceMode = "replica";
    } else {
      // CONFIG GET save may be blocked on managed Redis; fall back to AOF flag.
      let rdbEnabled: boolean | null = null;
      try {
        const saveCfg = await redis.config("GET", "save");
        const saveVal = Array.isArray(saveCfg) ? String(saveCfg[1] ?? "") : "";
        rdbEnabled = saveVal.trim() !== "";
      } catch {
        rdbEnabled = null;
      }
      const aof = info.aof_enabled === "1";
      persistenceMode =
        rdbEnabled === false ? (aof ? "AOF" : "none") : aof ? "RDB + AOF" : "RDB";
    }

    let replicationLag = "N/A";
    if (isReplica) {
      const masterOffset = Number.parseInt(info.master_repl_offset ?? "", 10);
      const replicaOffset = Number.parseInt(info.slave_repl_offset ?? "", 10);
      replicationLag =
        Number.isFinite(masterOffset) && Number.isFinite(replicaOffset)
          ? `${Math.max(0, masterOffset - replicaOffset).toLocaleString()} bytes`
          : "unknown";
    }

    const policy = info.maxmemory_policy ?? "unknown";
    return {
      nodeId,
      memHistory,
      hitMissHistory,
      config: {
        maxMemoryPolicy: policy,
        maxMemory: maxMb > 0 ? `${maxMb.toLocaleString()} MB` : "unlimited",
        persistenceMode,
        replicationLag,
      },
      source: "live",
    };
  } catch (err) {
    logger.warn("[infraHistory] redisNodeHistory live query failed", { nodeId, error: String(err) });
    return null;
  }
}
