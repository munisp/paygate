// Obsidian Operations — Kafka / Redis Infrastructure Panel
import { useEffect } from "react";
import { Radio, MessageSquare, Zap, HardDrive, TrendingUp, Users, Clock } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import MetricCard from "@/components/MetricCard";
import { useKafka, useRedis } from "@/hooks/usePaygateData";
import { useRefresh } from "@/contexts/RefreshContext";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { trpc } from "@/lib/trpc";

export default function InfraPage() {
  const { tick } = useRefresh();
  const utils = trpc.useUtils();

  // Re-fetch on refresh tick
  useEffect(() => {
    utils.paygate.kafka.invalidate();
    utils.paygate.redis.invalidate();
  }, [tick, utils]);

  const { data: kafkaRaw, isLoading: kafkaLoading } = useKafka();
  const { data: redisRaw, isLoading: redisLoading } = useRedis();

  // Type-safe cast (proxy returns mock shape matching these types)
  const kafka = kafkaRaw as {
    brokers: { id: string; host: string; status: string; partitions: number; leaders: number }[];
    topics: { name: string; partitions: number; replication: number; msgPerSec: number; consumerLag: number; retentionHours: number }[];
    consumerGroups: { name: string; topics: string[]; lag: number; members: number; status: string }[];
  } | undefined;

  const redis = redisRaw as {
    nodes: { id: string; role: string; host: string; status: string; memUsedMb: number; memMaxMb: number; connectedClients: number; opsPerSec: number }[];
    stats: { hitRate: number; missRate: number; evictedKeys: number; expiredKeys: number; totalCommandsProcessed: number; uptimeSeconds: number };
    keyspaceHistory: { time: string; hits: number; misses: number }[];
  } | undefined;

  const totalMsgPerSec = kafka?.topics.reduce((s, t) => s + t.msgPerSec, 0) ?? 0;
  const totalLag = kafka?.topics.reduce((s, t) => s + t.consumerLag, 0) ?? 0;
  const redisPrimary = redis?.nodes.find(n => n.role === "primary");
  const redisMemPct = redisPrimary
    ? Math.round((redisPrimary.memUsedMb / redisPrimary.memMaxMb) * 100)
    : 0;

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <Radio size={16} className="text-primary" />
            KAFKA &amp; REDIS TELEMETRY
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">
            Message broker topology · Consumer lag · Cache hit rate · Memory utilization
          </p>
        </div>
      </div>

      {/* ── KAFKA SECTION ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={13} className="text-primary" />
          <span className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">Kafka Broker Cluster</span>
        </div>

        {/* Kafka key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Brokers Online" value={kafka?.brokers.length ?? "—"} icon={HardDrive} accentColor="text-emerald-400" trendLabel="All healthy" trend="neutral" />
          <MetricCard label="Topics" value={kafka?.topics.length ?? "—"} icon={MessageSquare} accentColor="text-primary" trendLabel={`${kafka?.topics.reduce((s, t) => s + t.partitions, 0) ?? 0} total partitions`} trend="neutral" />
          <MetricCard label="Throughput" value={totalMsgPerSec} unit="msg/s" icon={Zap} accentColor="text-primary" trendLabel="Across all topics" trend="up" />
          <MetricCard label="Consumer Lag" value={totalLag} icon={Clock} accentColor={totalLag > 0 ? "text-amber-400" : "text-emerald-400"} trendLabel={totalLag === 0 ? "All consumers current" : "Lag detected"} trend={totalLag > 0 ? "down" : "neutral"} />
        </div>

        {/* Asymmetric layout: topic table + broker list */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div
              className="bg-card border border-border rounded-lg overflow-hidden"
              style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
            >
              <div className="px-4 py-3 border-b border-border">
                <span className="text-xs font-bold font-mono uppercase tracking-widest">Topic Registry</span>
              </div>
              {kafkaLoading ? (
                <div className="p-6 text-center text-xs text-muted-foreground font-mono">Loading topic data…</div>
              ) : (
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-b border-border">
                      {["Topic", "Partitions", "Replication", "Msg/s", "Lag", "Retention"].map(h => (
                        <th key={h} className="px-4 py-2.5 text-left font-mono text-muted-foreground uppercase text-[10px] tracking-wider">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {kafka?.topics.map((t, i) => (
                      <tr key={t.name} className={i % 2 === 0 ? "bg-secondary/10" : ""}>
                        <td className="px-4 py-2.5 font-mono text-primary">{t.name}</td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{t.partitions}</td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{t.replication}x</td>
                        <td className="px-4 py-2.5 font-mono text-foreground">{t.msgPerSec.toLocaleString()}</td>
                        <td className="px-4 py-2.5 font-mono">
                          <span className={t.consumerLag > 0 ? "text-amber-400" : "text-emerald-400"}>{t.consumerLag}</span>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-muted-foreground">{t.retentionHours >= 8760 ? "1y" : t.retentionHours >= 720 ? "30d" : `${t.retentionHours}h`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>

          {/* Broker + consumer group status rail */}
          <div className="space-y-3">
            <div
              className="bg-card border border-border rounded-lg p-4"
              style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
            >
              <h3 className="text-xs font-bold font-mono uppercase tracking-widest mb-3">Broker Nodes</h3>
              <div className="space-y-2">
                {kafka?.brokers.map(b => (
                  <div key={b.id} className="flex items-center justify-between">
                    <div>
                      <div className="text-xs font-mono text-foreground">{b.id}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{b.leaders} leaders · {b.partitions} parts</div>
                    </div>
                    <StatusBadge status={b.status as "healthy" | "degraded" | "critical"} />
                  </div>
                ))}
              </div>
            </div>

            <div
              className="bg-card border border-border rounded-lg p-4"
              style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
            >
              <h3 className="text-xs font-bold font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
                <Users size={11} className="text-primary" /> Consumer Groups
              </h3>
              <div className="space-y-2">
                {kafka?.consumerGroups.map(g => (
                  <div key={g.name} className="flex items-center justify-between gap-2">
                    <div className="min-w-0">
                      <div className="text-xs font-mono text-foreground truncate">{g.name}</div>
                      <div className="text-[10px] font-mono text-muted-foreground">{g.members} members · lag {g.lag}</div>
                    </div>
                    <span className={`text-[10px] font-mono shrink-0 ${g.lag > 0 ? "text-amber-400" : "text-emerald-400"}`}>
                      {g.status}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* ── REDIS SECTION ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3 mt-2">
          <Zap size={13} className="text-primary" />
          <span className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">Redis Cache Cluster</span>
        </div>

        {/* Redis key metrics */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Hit Rate" value={`${redis?.stats.hitRate ?? "—"}%`} icon={TrendingUp} accentColor="text-emerald-400" trendLabel="Cache effectiveness" trend="up" />
          <MetricCard label="Ops / sec" value={redisPrimary?.opsPerSec.toLocaleString() ?? "—"} icon={Zap} accentColor="text-primary" trendLabel="Primary node" trend="neutral" />
          <MetricCard label="Memory Used" value={`${redisMemPct}%`} icon={HardDrive} accentColor={redisMemPct > 80 ? "text-amber-400" : "text-emerald-400"} trendLabel={`${redisPrimary?.memUsedMb ?? 0} / ${redisPrimary?.memMaxMb ?? 0} MB`} trend="neutral" />
          <MetricCard label="Connections" value={redis?.nodes.reduce((s, n) => s + n.connectedClients, 0) ?? "—"} icon={Users} accentColor="text-primary" trendLabel="All nodes" trend="neutral" />
        </div>

        {/* Asymmetric layout: keyspace chart + node list */}
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div
              className="bg-card border border-border rounded-lg p-4"
              style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
            >
              <div className="flex items-center justify-between mb-4">
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest">Keyspace Hit/Miss · 24h</h3>
                <span className="text-xs text-muted-foreground font-mono">
                  {redis?.stats.totalCommandsProcessed.toLocaleString()} total cmds
                </span>
              </div>
              <ResponsiveContainer width="100%" height={160}>
                <AreaChart data={redis?.keyspaceHistory ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hitsGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="missGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <Tooltip contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }} />
                  <Area type="monotone" dataKey="hits" stroke="oklch(0.72 0.18 200)" fill="url(#hitsGrad)" strokeWidth={2} name="Hits" />
                  <Area type="monotone" dataKey="misses" stroke="oklch(0.78 0.16 75)" fill="url(#missGrad)" strokeWidth={1.5} name="Misses" />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          </div>

          {/* Redis node status rail */}
          <div className="space-y-3">
            {redis?.nodes.map(node => (
              <div
                key={node.id}
                className="bg-card border border-border rounded-lg p-4"
                style={{
                  background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
                  boxShadow: node.status === "healthy"
                    ? "inset 0 0 0 1px oklch(0.75 0.16 145 / 0.10)"
                    : "inset 0 0 0 1px oklch(0.78 0.16 75 / 0.20)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-mono font-semibold text-foreground capitalize">{node.role}</div>
                    <div className="text-[10px] font-mono text-muted-foreground">{node.host}</div>
                  </div>
                  <StatusBadge status={node.status as "healthy" | "degraded" | "critical"} />
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Memory", value: `${node.memUsedMb} / ${node.memMaxMb} MB` },
                    { label: "Clients", value: String(node.connectedClients) },
                    { label: "Ops/s", value: node.opsPerSec > 0 ? node.opsPerSec.toLocaleString() : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
                      <span className="text-[10px] font-mono text-foreground">{value}</span>
                    </div>
                  ))}
                  {/* Memory bar */}
                  <div className="mt-2">
                    <div className="h-1 bg-secondary rounded-full overflow-hidden">
                      <div
                        className="h-full rounded-full transition-all"
                        style={{
                          width: `${Math.round((node.memUsedMb / node.memMaxMb) * 100)}%`,
                          background: node.memUsedMb / node.memMaxMb > 0.8
                            ? "oklch(0.78 0.16 75)"
                            : "oklch(0.72 0.18 200)",
                        }}
                      />
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Eviction stats */}
            {redis && (
              <div
                className="bg-card border border-border rounded-lg p-4"
                style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
              >
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest mb-3">Eviction Telemetry</h3>
                {[
                  { label: "Evicted Keys", value: redis.stats.evictedKeys.toLocaleString(), warn: redis.stats.evictedKeys > 0 },
                  { label: "Expired Keys", value: redis.stats.expiredKeys.toLocaleString(), warn: false },
                  { label: "Uptime", value: `${Math.floor(redis.stats.uptimeSeconds / 86400)}d`, warn: false },
                ].map(({ label, value, warn }) => (
                  <div key={label} className="flex items-center justify-between mb-1.5">
                    <span className="text-[11px] text-muted-foreground font-mono">{label}</span>
                    <span className={`text-xs font-mono font-bold ${warn ? "text-amber-400" : "text-foreground"}`}>{value}</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

