// Obsidian Operations — Kafka & Redis Telemetry
// Color-coded alerts + topic detail modal + Redis node detail modal + date range picker
import { useEffect, useState } from "react";
import { Radio, MessageSquare, Zap, HardDrive, TrendingUp, Users, Clock, AlertTriangle, AlertCircle, CheckCircle2, ExternalLink, CalendarIcon } from "lucide-react";
import { Server, ChevronDown, ChevronRight, RefreshCcw } from "lucide-react";
import StatusBadge from "@/components/StatusBadge";
import MetricCard from "@/components/MetricCard";
import { useKafka, useRedis } from "@/hooks/usePaygateData";
import { useRefresh } from "@/contexts/RefreshContext";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ComposedChart, Bar, Line } from "recharts";
import { trpc } from "@/lib/trpc";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar } from "@/components/ui/calendar";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import type { DateRange } from "react-day-picker";
import { useThresholds } from "@/contexts/ThresholdsContext";

// ─── Alert threshold helpers ──────────────────────────────────────────────────

type Severity = "ok" | "warn" | "critical";

// Module-level fallbacks used by sub-components that can't call hooks.
// The main page overrides these with context-aware helpers from useThresholds().
function lagSeverity(lag: number): Severity {
  if (lag === 0) return "ok";
  if (lag <= 5) return "warn";
  return "critical";
}
function memSeverity(pct: number): Severity {
  if (pct < 70) return "ok";
  if (pct < 85) return "warn";
  return "critical";
}

const SEVERITY_STYLES: Record<Severity, { text: string; bg: string; border: string; icon: React.ElementType }> = {
  ok:       { text: "text-emerald-400", bg: "bg-emerald-400/10", border: "border-emerald-400/20", icon: CheckCircle2 },
  warn:     { text: "text-amber-400",   bg: "bg-amber-400/10",   border: "border-amber-400/20",   icon: AlertTriangle },
  critical: { text: "text-red-400",     bg: "bg-red-400/10",     border: "border-red-400/20",     icon: AlertCircle },
};

function SeverityBadge({ severity, label }: { severity: Severity; label: string }) {
  const s = SEVERITY_STYLES[severity];
  const Icon = s.icon;
  return (
    <span className={cn("inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border", s.text, s.bg, s.border)}>
      <Icon size={9} />
      {label}
    </span>
  );
}

function LagCell({ lag }: { lag: number }) {
  const { lagSeverity: ctxLagSev } = useThresholds();
  const sev = ctxLagSev(lag);
  const s = SEVERITY_STYLES[sev as Severity];
  return (
    <span className={cn("inline-flex items-center gap-1 font-mono font-semibold", s.text)}>
      {sev !== "ok" && <s.icon size={10} />}
      {lag}
    </span>
  );
}

function MemBar({ usedMb, maxMb }: { usedMb: number; maxMb: number }) {
  const pct = Math.round((usedMb / maxMb) * 100);
  const { memSeverity: ctxMemSev } = useThresholds();
  const sev = ctxMemSev(pct);
  return (
    <div className="mt-2 space-y-1">
      <div className="flex items-center justify-between">
        <span className="text-[10px] text-muted-foreground font-mono">Memory</span>
        <SeverityBadge severity={sev} label={`${pct}%`} />
      </div>
      <div className="h-1.5 bg-secondary rounded-full overflow-hidden">
        <div
          className="h-full rounded-full transition-all duration-500"
          style={{ width: `${pct}%`, background: sev === "ok" ? "oklch(0.72 0.18 200)" : sev === "warn" ? "oklch(0.78 0.16 75)" : "oklch(0.65 0.22 25)" }}
        />
      </div>
      <div className="text-[10px] text-muted-foreground font-mono text-right">{usedMb} / {maxMb} MB</div>
    </div>
  );
}

// ─── Topic Detail Modal ───────────────────────────────────────────────────────

type TopicRow = { name: string; partitions: number; replication: number; msgPerSec: number; consumerLag: number; retentionHours: number };

const PRESET_RANGES = [
  { label: "24h", hours: 24 },
  { label: "7d",  hours: 168 },
  { label: "30d", hours: 720 },
];

function TopicDetailModal({ topic, onClose }: { topic: TopicRow | null; onClose: () => void }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<number>(24);
  const { lagSeverity: ctxLagSev } = useThresholds();

  const fromDate = dateRange?.from ?? new Date(Date.now() - activePreset * 3600 * 1000);
  const toDate   = dateRange?.to   ?? new Date();

  const { data, isLoading } = trpc.paygate.topicHistory.useQuery(
    {
      topicName: topic?.name ?? "",
      from: fromDate.toISOString(),
      to:   toDate.toISOString(),
    },
    { enabled: !!topic }
  );

  useEffect(() => {
    setDateRange(undefined);
    setActivePreset(24);
  }, [topic?.name]);

  if (!topic) return null;

  const retentionLabel = topic.retentionHours >= 8760 ? "1 year" : topic.retentionHours >= 720 ? "30 days" : `${topic.retentionHours}h`;
  const lagSev = ctxLagSev(topic.consumerLag);

  const rangeLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
      : format(dateRange.from, "MMM d")
    : PRESET_RANGES.find(p => p.hours === activePreset)?.label ?? "24h";

  return (
    <Dialog open={!!topic} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border" style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)" }}>
        <DialogHeader>
          <DialogTitle className="font-mono text-primary flex items-center gap-2">
            <MessageSquare size={14} />
            {topic.name}
            <span className="text-muted-foreground text-xs font-normal ml-1">· Topic Detail</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-3 gap-3 mb-4">
          {[
            { label: "Partitions", value: String(topic.partitions) },
            { label: "Replication", value: `${topic.replication}x` },
            { label: "Retention", value: retentionLabel },
            { label: "Throughput", value: `${topic.msgPerSec.toLocaleString()} msg/s` },
            { label: "Consumer Lag", value: String(topic.consumerLag), severity: lagSev },
            { label: "Compression", value: data?.config.compressionType ?? "—" },
            { label: "Cleanup Policy", value: data?.config.cleanupPolicy ?? "—" },
            { label: "Min ISR", value: String(data?.config.minInsyncReplicas ?? "—") },
          ].map(({ label, value, severity }) => (
            <div key={label} className="rounded-lg p-3 border border-border" style={{ background: "oklch(0.14 0.008 265)" }}>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</div>
              {severity ? (
                <SeverityBadge severity={severity} label={value} />
              ) : (
                <div className="text-sm font-mono font-semibold text-foreground">{value}</div>
              )}
            </div>
          ))}
        </div>

        <div>
          <div className="flex items-center justify-between mb-3">
            <div className="text-xs font-bold font-mono uppercase tracking-widest flex items-center gap-2">
              <TrendingUp size={11} className="text-primary" />
              THROUGHPUT TREND
            </div>
            <div className="flex items-center gap-1.5">
              {PRESET_RANGES.map(p => (
                <button
                  key={p.hours}
                  onClick={() => { setActivePreset(p.hours); setDateRange(undefined); }}
                  className={cn(
                    "px-2 py-0.5 rounded text-[10px] font-mono border transition-colors",
                    !dateRange && activePreset === p.hours
                      ? "text-primary border-primary/40 bg-primary/10"
                      : "text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary"
                  )}
                >
                  {p.label}
                </button>
              ))}
              <Popover open={calOpen} onOpenChange={setCalOpen}>
                <PopoverTrigger asChild>
                  <button
                    className={cn(
                      "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors",
                      dateRange
                        ? "text-primary border-primary/40 bg-primary/10"
                        : "text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary"
                    )}
                  >
                    <CalendarIcon size={9} />
                    {rangeLabel}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-auto p-0" align="end" style={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)" }}>
                  <Calendar
                    mode="range"
                    selected={dateRange}
                    onSelect={(range) => {
                      setDateRange(range);
                      if (range?.from && range?.to) setCalOpen(false);
                    }}
                    numberOfMonths={2}
                    disabled={{ after: new Date() }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          </div>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-xs text-muted-foreground font-mono">Loading history…</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <ComposedChart data={data?.history ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="msgGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} interval="preserveStartEnd" />
                <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                  formatter={(val: number, name: string) => [
                    name === "msgPerSec" ? `${val} msg/s` : name === "lag" ? `${val} msgs` : `${val}%`,
                    name === "msgPerSec" ? "Throughput" : name === "lag" ? "Consumer Lag" : "Error Rate",
                  ]}
                />
                <Area yAxisId="left" type="monotone" dataKey="msgPerSec" stroke="oklch(0.72 0.18 200)" fill="url(#msgGrad)" strokeWidth={2} name="msgPerSec" />
                <Bar yAxisId="right" dataKey="lag" fill="oklch(0.78 0.16 75 / 0.6)" name="lag" />
                <Line yAxisId="right" type="monotone" dataKey="errorRate" stroke="oklch(0.65 0.22 25)" strokeWidth={1.5} dot={false} name="errorRate" />
              </ComposedChart>
            </ResponsiveContainer>
          )}
          <div className="flex items-center gap-4 mt-2 text-[10px] font-mono text-muted-foreground">
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block" /> Throughput (msg/s)</span>
            <span className="flex items-center gap-1"><span className="w-3 h-2 bg-amber-400/60 inline-block rounded-sm" /> Consumer Lag</span>
            <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-red-400 inline-block" /> Error Rate (%)</span>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ─── Redis Node Detail Modal ──────────────────────────────────────────────────

type RedisNode = { id: string; role: string; host: string; status: string; memUsedMb: number; memMaxMb: number; connectedClients: number; opsPerSec: number };

function RedisNodeDetailModal({ node, onClose }: { node: RedisNode | null; onClose: () => void }) {
  const [dateRange, setDateRange] = useState<DateRange | undefined>(undefined);
  const [calOpen, setCalOpen] = useState(false);
  const [activePreset, setActivePreset] = useState<number>(24);
  const { memSeverity: ctxMemSev } = useThresholds();

  const fromDate = dateRange?.from ?? new Date(Date.now() - activePreset * 3600 * 1000);
  const toDate   = dateRange?.to   ?? new Date();

  const { data, isLoading } = trpc.paygate.redisNodeHistory.useQuery(
    { nodeId: node?.id ?? "", from: fromDate.toISOString(), to: toDate.toISOString() },
    { enabled: !!node }
  );

  useEffect(() => {
    setDateRange(undefined);
    setActivePreset(24);
  }, [node?.id]);

  if (!node) return null;

  const memPct = Math.round((node.memUsedMb / node.memMaxMb) * 100);
  const memSev = ctxMemSev(memPct);

  const rangeLabel = dateRange?.from
    ? dateRange.to
      ? `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d")}`
      : format(dateRange.from, "MMM d")
    : PRESET_RANGES.find(p => p.hours === activePreset)?.label ?? "24h";

  return (
    <Dialog open={!!node} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-3xl bg-card border-border" style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)" }}>
        <DialogHeader>
          <DialogTitle className="font-mono text-primary flex items-center gap-2">
            <Zap size={14} />
            {node.id}
            <span className="text-muted-foreground text-xs font-normal ml-1">· Redis Node Detail</span>
          </DialogTitle>
        </DialogHeader>

        <div className="grid grid-cols-4 gap-3 mb-4">
          {[
            { label: "Role",        value: node.role.toUpperCase() },
            { label: "Host",        value: node.host },
            { label: "Clients",     value: String(node.connectedClients) },
            { label: "Ops/s",       value: node.opsPerSec > 0 ? node.opsPerSec.toLocaleString() : "—" },
            { label: "Memory Used", value: `${node.memUsedMb} MB`, severity: memSev },
            { label: "Max Memory",  value: data?.config.maxMemory ?? "—" },
            { label: "Eviction",    value: data?.config.maxMemoryPolicy ?? "—" },
            { label: "Persistence", value: data?.config.persistenceMode ?? "—" },
            ...(node.role !== "primary" ? [{ label: "Repl Lag", value: data?.config.replicationLag ?? "—" }] : []),
          ].map(({ label, value, severity }) => (
            <div key={label} className="rounded-lg p-3 border border-border" style={{ background: "oklch(0.14 0.008 265)" }}>
              <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</div>
              {severity ? (
                <SeverityBadge severity={severity} label={value} />
              ) : (
                <div className="text-sm font-mono font-semibold text-foreground truncate">{value}</div>
              )}
            </div>
          ))}
        </div>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground font-mono">Loading history…</div>
        ) : (
          <div className="space-y-4">
            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold font-mono uppercase tracking-widest flex items-center gap-2">
                  <HardDrive size={11} className="text-primary" />
                  MEMORY UTILIZATION
                </div>
                <div className="flex items-center gap-1.5">
                  {PRESET_RANGES.map(p => (
                    <button
                      key={p.hours}
                      onClick={() => { setActivePreset(p.hours); setDateRange(undefined); }}
                      className={cn(
                        "px-2 py-0.5 rounded text-[10px] font-mono border transition-colors",
                        !dateRange && activePreset === p.hours
                          ? "text-primary border-primary/40 bg-primary/10"
                          : "text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary"
                      )}
                    >
                      {p.label}
                    </button>
                  ))}
                  <Popover open={calOpen} onOpenChange={setCalOpen}>
                    <PopoverTrigger asChild>
                      <button
                        className={cn(
                          "flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-mono border transition-colors",
                          dateRange
                            ? "text-primary border-primary/40 bg-primary/10"
                            : "text-muted-foreground border-border/50 hover:text-foreground hover:bg-secondary"
                        )}
                      >
                        <CalendarIcon size={9} />
                        {rangeLabel}
                      </button>
                    </PopoverTrigger>
                    <PopoverContent className="w-auto p-0" align="end" style={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)" }}>
                      <Calendar
                        mode="range"
                        selected={dateRange}
                        onSelect={(range) => {
                          setDateRange(range);
                          if (range?.from && range?.to) setCalOpen(false);
                        }}
                        numberOfMonths={2}
                        disabled={{ after: new Date() }}
                      />
                    </PopoverContent>
                  </Popover>
                </div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={data?.memHistory ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="memGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.35} />
                      <stop offset="95%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                    formatter={(val: number, name: string) => [
                      name === "pct" ? `${val}%` : `${val} MB`,
                      name === "pct" ? "Utilization" : name === "usedMb" ? "Used" : "Max",
                    ]}
                  />
                  <Area type="monotone" dataKey="pct" stroke="oklch(0.72 0.18 200)" fill="url(#memGrad)" strokeWidth={2} name="pct" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block" /> Memory Utilization (%)</span>
              </div>
            </div>

            <div>
              <div className="flex items-center justify-between mb-3">
                <div className="text-xs font-bold font-mono uppercase tracking-widest flex items-center gap-2">
                  <TrendingUp size={11} className="text-primary" />
                  CACHE HIT / MISS RATE
                </div>
              </div>
              <ResponsiveContainer width="100%" height={150}>
                <AreaChart data={data?.hitMissHistory ?? []} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="hitsGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="missGrad2" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <YAxis yAxisId="left" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} domain={[0, 100]} unit="%" />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                    formatter={(val: number, name: string) => [
                      name === "hitRate" ? `${val}%` : val.toLocaleString(),
                      name === "hits" ? "Hits" : name === "misses" ? "Misses" : "Hit Rate",
                    ]}
                  />
                  <Area yAxisId="left" type="monotone" dataKey="hits" stroke="oklch(0.72 0.18 200)" fill="url(#hitsGrad2)" strokeWidth={2} name="hits" />
                  <Area yAxisId="left" type="monotone" dataKey="misses" stroke="oklch(0.78 0.16 75)" fill="url(#missGrad2)" strokeWidth={1.5} name="misses" />
                  <Line yAxisId="right" type="monotone" dataKey="hitRate" stroke="oklch(0.75 0.16 145)" strokeWidth={1.5} dot={false} name="hitRate" />
                </AreaChart>
              </ResponsiveContainer>
              <div className="flex items-center gap-4 mt-1 text-[10px] font-mono text-muted-foreground">
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-primary inline-block" /> Hits</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-amber-400 inline-block" /> Misses</span>
                <span className="flex items-center gap-1"><span className="w-3 h-0.5 bg-emerald-400 inline-block" /> Hit Rate (%)</span>
              </div>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Main page ────────────────────────────────────────────────────────────────

// ─── Consumer Group Detail Modal ─────────────────────────────────────────────

function ConsumerGroupDetailModal({ groupName, onClose }: { groupName: string | null; onClose: () => void }) {
  const [expandedMember, setExpandedMember] = useState<string | null>(null);
  const { lagSeverity: ctxLagSev } = useThresholds();

  const { data, isLoading } = trpc.paygate.consumerGroupDetail.useQuery(
    { groupName: groupName ?? "" },
    { enabled: !!groupName }
  );

  if (!groupName) return null;

  const totalLag = data?.partitions.reduce((s, p) => s + p.lag, 0) ?? 0;
  const lagSev = ctxLagSev(totalLag);

  return (
    <Dialog open={!!groupName} onOpenChange={open => !open && onClose()}>
      <DialogContent className="max-w-4xl bg-card border-border" style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)" }}>
        <DialogHeader>
          <DialogTitle className="font-mono text-primary flex items-center gap-2">
            <Users size={14} />
            {groupName}
            <span className="text-muted-foreground text-xs font-normal ml-1">· Consumer Group Detail</span>
          </DialogTitle>
        </DialogHeader>

        {isLoading ? (
          <div className="h-40 flex items-center justify-center text-xs text-muted-foreground font-mono">Loading group data…</div>
        ) : data ? (
          <div className="space-y-4">
            {/* Summary row */}
            <div className="grid grid-cols-4 gap-3">
              {[
                { label: "Topic",      value: data.topic },
                { label: "State",      value: data.state },
                { label: "Protocol",   value: data.protocol },
                { label: "Total Lag",  value: String(totalLag), severity: lagSev },
              ].map(({ label, value, severity }) => (
                <div key={label} className="rounded-lg p-3 border border-border" style={{ background: "oklch(0.14 0.008 265)" }}>
                  <div className="text-[10px] text-muted-foreground font-mono uppercase tracking-wider mb-1">{label}</div>
                  {severity ? (
                    <SeverityBadge severity={severity as Severity} label={value} />
                  ) : (
                    <div className="text-sm font-mono font-semibold text-foreground truncate">{value}</div>
                  )}
                </div>
              ))}
            </div>

            {/* 24h lag history chart */}
            <div>
              <div className="text-xs font-bold font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
                <Clock size={11} className="text-primary" />
                24H LAG HISTORY
              </div>
              <ResponsiveContainer width="100%" height={130}>
                <AreaChart data={data.lagHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                  <defs>
                    <linearGradient id="cgLagGrad" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0.4} />
                      <stop offset="95%" stopColor="oklch(0.78 0.16 75)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                  <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <Tooltip
                    contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                    formatter={(val: number) => [`${val} msgs`, "Consumer Lag"]}
                  />
                  <Area type="monotone" dataKey="lag" stroke="oklch(0.78 0.16 75)" fill="url(#cgLagGrad)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            </div>

            {/* Member assignments */}
            <div>
              <div className="text-xs font-bold font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                <Server size={11} className="text-primary" />
                MEMBER ASSIGNMENTS
              </div>
              <div className="space-y-1.5 max-h-40 overflow-y-auto pr-1">
                {data.members.map(m => (
                  <div key={m.memberId} className="rounded-md border border-border overflow-hidden" style={{ background: "oklch(0.14 0.008 265)" }}>
                    <button
                      className="w-full flex items-center justify-between px-3 py-2 text-left hover:bg-primary/5 transition-colors"
                      onClick={() => setExpandedMember(expandedMember === m.memberId ? null : m.memberId)}
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        {expandedMember === m.memberId ? <ChevronDown size={11} className="text-muted-foreground shrink-0" /> : <ChevronRight size={11} className="text-muted-foreground shrink-0" />}
                        <span className="text-xs font-mono text-foreground truncate">{m.clientId}</span>
                        <span className="text-[10px] font-mono text-muted-foreground">{m.host}</span>
                      </div>
                      <div className="flex items-center gap-2 shrink-0 ml-2">
                        <span className="text-[10px] font-mono text-muted-foreground">{m.assignedPartitions.length} partitions</span>
                        <SeverityBadge severity={ctxLagSev(m.totalLag)} label={`lag ${m.totalLag}`} />
                      </div>
                    </button>
                    {expandedMember === m.memberId && (
                      <div className="px-3 pb-2 pt-0">
                        <div className="text-[10px] text-muted-foreground font-mono mb-1.5">Assigned partitions: {m.assignedPartitions.join(", ")}</div>
                        <div className="grid grid-cols-6 gap-1">
                          {m.assignedPartitions.map(p => {
                            const pData = data.partitions[p];
                            const pSev = ctxLagSev(pData?.lag ?? 0);
                            return (
                              <div key={p} className={cn("rounded px-1.5 py-1 text-center text-[10px] font-mono border", SEVERITY_STYLES[pSev].bg, SEVERITY_STYLES[pSev].border, SEVERITY_STYLES[pSev].text)}>
                                P{p}
                                {pData && pData.lag > 0 && <div className="text-[9px] opacity-70">+{pData.lag}</div>}
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </div>

            {/* Per-partition lag table */}
            <div>
              <div className="text-xs font-bold font-mono uppercase tracking-widest mb-2 flex items-center gap-2">
                <AlertTriangle size={11} className="text-primary" />
                PER-PARTITION LAG BREAKDOWN
                {data.partitions.some(p => p.recentlyReassigned) && (
                  <span className="ml-auto flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-mono font-semibold border text-yellow-400 bg-yellow-400/10 border-yellow-400/25">
                    <RefreshCcw size={9} className="animate-spin-slow" />
                    REBALANCE DETECTED
                  </span>
                )}
              </div>
              <div className="rounded-lg border border-border overflow-hidden max-h-48 overflow-y-auto">
                <table className="w-full text-xs">
                  <thead className="sticky top-0" style={{ background: "oklch(0.14 0.008 265)" }}>
                    <tr className="border-b border-border">
                      {["Partition", "Topic", "Current Offset", "Log End", "Lag", "Member", "Host", ""].map(h => (
                        <th key={h} className="px-3 py-2 text-left font-mono text-muted-foreground uppercase text-[10px] tracking-wider whitespace-nowrap">{h}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {data.partitions.map((p, i) => {
                      const pSev = ctxLagSev(p.lag);
                      return (
                        <tr key={p.partition} className={cn(
                          "border-b border-border/50 last:border-0",
                          p.recentlyReassigned
                            ? "bg-yellow-400/5 border-l-2 border-l-yellow-400/50"
                            : i % 2 === 0 ? "bg-secondary/10" : ""
                        )}>
                          <td className="px-3 py-1.5 font-mono text-foreground">{p.partition}</td>
                          <td className="px-3 py-1.5 font-mono text-primary text-[10px]">{p.topic}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{p.currentOffset.toLocaleString()}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{p.logEndOffset.toLocaleString()}</td>
                          <td className="px-3 py-1.5">
                            <span className={cn("font-mono font-semibold text-xs flex items-center gap-1", SEVERITY_STYLES[pSev].text)}>
                              {pSev !== "ok" && <AlertTriangle size={9} />}
                              {p.lag}
                            </span>
                          </td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{p.clientId}</td>
                          <td className="px-3 py-1.5 font-mono text-muted-foreground text-[10px]">{p.host}</td>
                          <td className="px-3 py-1.5">
                            {p.recentlyReassigned && (
                              <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded text-[9px] font-mono font-semibold text-yellow-400 bg-yellow-400/10 border border-yellow-400/25 whitespace-nowrap">
                                <RefreshCcw size={8} />
                                MOVED
                              </span>
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          </div>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}

export default function InfraPage() {
  const { tick } = useRefresh();
  const { lagSeverity: ctxLagSev, memSeverity: ctxMemSev } = useThresholds();
  const utils = trpc.useUtils();
  const [selectedTopic, setSelectedTopic] = useState<TopicRow | null>(null);
  const [selectedNode, setSelectedNode] = useState<RedisNode | null>(null);
  const [selectedGroup, setSelectedGroup] = useState<string | null>(null);

  useEffect(() => {
    utils.paygate.kafka.invalidate();
    utils.paygate.redis.invalidate();
  }, [tick, utils]);

  const { data: kafkaRaw, isLoading: kafkaLoading } = useKafka();
  const { data: redisRaw } = useRedis();

  const kafka = kafkaRaw as {
    brokers: { id: string; host: string; status: string; partitions: number; leaders: number }[];
    topics: TopicRow[];
    consumerGroups: { name: string; topics: string[]; lag: number; members: number; status: string }[];
  } | undefined;

  const redis = redisRaw as {
    nodes: RedisNode[];
    stats: { hitRate: number; missRate: number; evictedKeys: number; expiredKeys: number; totalCommandsProcessed: number; uptimeSeconds: number };
    keyspaceHistory: { time: string; hits: number; misses: number }[];
  } | undefined;

  const totalMsgPerSec = kafka?.topics.reduce((s, t) => s + t.msgPerSec, 0) ?? 0;
  const totalLag = kafka?.topics.reduce((s, t) => s + t.consumerLag, 0) ?? 0;
  const totalGroupLag = kafka?.consumerGroups.reduce((s, g) => s + g.lag, 0) ?? 0;
  const redisPrimary = redis?.nodes.find(n => n.role === "primary");
  const redisMemPct = redisPrimary ? Math.round((redisPrimary.memUsedMb / redisPrimary.memMaxMb) * 100) : 0;
  const lagSev = ctxLagSev(totalLag + totalGroupLag);
  const memSev = ctxMemSev(redisMemPct);

  return (
    <div className="space-y-5">
      <TopicDetailModal topic={selectedTopic} onClose={() => setSelectedTopic(null)} />
      <RedisNodeDetailModal node={selectedNode} onClose={() => setSelectedNode(null)} />
      <ConsumerGroupDetailModal groupName={selectedGroup} onClose={() => setSelectedGroup(null)} />

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
        <div className="hidden md:flex items-center gap-2">
          {lagSev !== "ok" && <SeverityBadge severity={lagSev} label={`LAG: ${totalLag + totalGroupLag} msgs`} />}
          {memSev !== "ok" && <SeverityBadge severity={memSev} label={`MEM: ${redisMemPct}%`} />}
          {lagSev === "ok" && memSev === "ok" && <SeverityBadge severity="ok" label="ALL NOMINAL" />}
        </div>
      </div>

      {/* ── KAFKA SECTION ─────────────────────────────────────────────── */}
      <div>
        <div className="flex items-center gap-2 mb-3">
          <MessageSquare size={13} className="text-primary" />
          <span className="text-xs font-bold font-mono uppercase tracking-widest text-foreground">Kafka Broker Cluster</span>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Brokers Online" value={kafka?.brokers.length ?? "—"} icon={HardDrive} accentColor="text-emerald-400" trendLabel="All healthy" trend="neutral" />
          <MetricCard label="Topics" value={kafka?.topics.length ?? "—"} icon={MessageSquare} accentColor="text-primary" trendLabel={`${kafka?.topics.reduce((s, t) => s + t.partitions, 0) ?? 0} total partitions`} trend="neutral" />
          <MetricCard label="Throughput" value={totalMsgPerSec} unit="msg/s" icon={Zap} accentColor="text-primary" trendLabel="Across all topics" trend="up" />
          <MetricCard
            label="Consumer Lag"
            value={totalLag + totalGroupLag}
            icon={Clock}
            accentColor={lagSev === "ok" ? "text-emerald-400" : lagSev === "warn" ? "text-amber-400" : "text-red-400"}
            trendLabel={lagSev === "ok" ? "All consumers current" : lagSev === "warn" ? "Minor lag detected" : "Critical lag — investigate"}
            trend={lagSev === "ok" ? "neutral" : "down"}
          />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
          <div className="lg:col-span-2">
            <div
              className="bg-card border border-border rounded-lg overflow-hidden"
              style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
            >
              <div className="px-4 py-3 border-b border-border flex items-center justify-between">
                <span className="text-xs font-bold font-mono uppercase tracking-widest">Topic Registry</span>
                <span className="text-[10px] text-muted-foreground font-mono">Click a row for details</span>
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
                    {kafka?.topics.map((t, i) => {
                      return (
                        <tr
                          key={t.name}
                          onClick={() => setSelectedTopic(t)}
                          className={cn(
                            "cursor-pointer transition-colors hover:bg-primary/5 group",
                            i % 2 === 0 ? "bg-secondary/10" : ""
                          )}
                        >
                          <td className="px-4 py-2.5 font-mono text-primary flex items-center gap-1.5">
                            {t.name}
                            <ExternalLink size={10} className="opacity-0 group-hover:opacity-60 transition-opacity" />
                          </td>
                          <td className="px-4 py-2.5 font-mono text-foreground">{t.partitions}</td>
                          <td className="px-4 py-2.5 font-mono text-foreground">{t.replication}x</td>
                          <td className="px-4 py-2.5 font-mono text-foreground">{t.msgPerSec.toLocaleString()}</td>
                          <td className="px-4 py-2.5"><LagCell lag={t.consumerLag} /></td>
                          <td className="px-4 py-2.5 font-mono text-muted-foreground">
                            {t.retentionHours >= 8760 ? "1y" : t.retentionHours >= 720 ? "30d" : `${t.retentionHours}h`}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>
          </div>

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
              <div className="space-y-2.5">
                {kafka?.consumerGroups.map(g => {
                  const gLagSev = lagSeverity(g.lag);
                  return (
                    <div
                      key={g.name}
                      className="space-y-1 cursor-pointer rounded-md p-1 -mx-1 hover:bg-primary/5 transition-colors group/cg"
                      onClick={() => setSelectedGroup(g.name)}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <div className="min-w-0">
                          <div className="text-xs font-mono text-foreground truncate flex items-center gap-1">
                            {g.name}
                            <ExternalLink size={9} className="opacity-0 group-hover/cg:opacity-50 transition-opacity text-primary" />
                          </div>
                          <div className="text-[10px] font-mono text-muted-foreground">{g.members} members</div>
                        </div>
                        <SeverityBadge severity={gLagSev} label={`lag ${g.lag}`} />
                      </div>
                      {g.lag > 0 && (
                        <div className="h-1 bg-secondary rounded-full overflow-hidden">
                          <div
                            className="h-full rounded-full"
                            style={{
                              width: `${Math.min(100, (g.lag / 50) * 100)}%`,
                              background: gLagSev === "warn" ? "oklch(0.78 0.16 75)" : "oklch(0.65 0.22 25)",
                            }}
                          />
                        </div>
                      )}
                    </div>
                  );
                })}
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

        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mb-4">
          <MetricCard label="Hit Rate" value={`${redis?.stats.hitRate ?? "—"}%`} icon={TrendingUp} accentColor="text-emerald-400" trendLabel="Cache effectiveness" trend="up" />
          <MetricCard label="Ops / sec" value={redisPrimary?.opsPerSec.toLocaleString() ?? "—"} icon={Zap} accentColor="text-primary" trendLabel="Primary node" trend="neutral" />
          <MetricCard
            label="Memory Used"
            value={`${redisMemPct}%`}
            icon={HardDrive}
            accentColor={memSev === "ok" ? "text-emerald-400" : memSev === "warn" ? "text-amber-400" : "text-red-400"}
            trendLabel={`${redisPrimary?.memUsedMb ?? 0} / ${redisPrimary?.memMaxMb ?? 0} MB`}
            trend={memSev === "ok" ? "neutral" : "down"}
          />
          <MetricCard label="Connections" value={redis?.nodes.reduce((s, n) => s + n.connectedClients, 0) ?? "—"} icon={Users} accentColor="text-primary" trendLabel="All nodes" trend="neutral" />
        </div>

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

          {/* Redis node status rail — clickable cards */}
          <div className="space-y-3">
            {redis?.nodes.map(node => (
              <div
                key={node.id}
                onClick={() => setSelectedNode(node)}
                className="bg-card border border-border rounded-lg p-4 cursor-pointer transition-all hover:ring-1 hover:ring-primary/30 group"
                style={{
                  background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
                  boxShadow: node.status === "healthy"
                    ? "inset 0 0 0 1px oklch(0.75 0.16 145 / 0.10)"
                    : "inset 0 0 0 1px oklch(0.78 0.16 75 / 0.20)",
                }}
              >
                <div className="flex items-center justify-between mb-3">
                  <div>
                    <div className="text-xs font-mono font-semibold text-foreground capitalize flex items-center gap-1.5">
                      {node.role}
                      <ExternalLink size={9} className="opacity-0 group-hover:opacity-50 transition-opacity text-primary" />
                    </div>
                    <div className="text-[10px] font-mono text-muted-foreground">{node.host}</div>
                  </div>
                  <StatusBadge status={node.status as "healthy" | "degraded" | "critical"} />
                </div>
                <div className="space-y-1.5">
                  {[
                    { label: "Clients", value: String(node.connectedClients) },
                    { label: "Ops/s", value: node.opsPerSec > 0 ? node.opsPerSec.toLocaleString() : "—" },
                  ].map(({ label, value }) => (
                    <div key={label} className="flex items-center justify-between">
                      <span className="text-[10px] text-muted-foreground font-mono">{label}</span>
                      <span className="text-[10px] font-mono text-foreground">{value}</span>
                    </div>
                  ))}
                  <MemBar usedMb={node.memUsedMb} maxMb={node.memMaxMb} />
                </div>
              </div>
            ))}

            {redis && (
              <div
                className="bg-card border border-border rounded-lg p-4"
                style={{ background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)", boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)" }}
              >
                <h3 className="text-xs font-bold font-mono uppercase tracking-widest mb-3">Eviction Telemetry</h3>
                {[
                  { label: "Evicted Keys", value: redis.stats.evictedKeys.toLocaleString(), severity: redis.stats.evictedKeys > 0 ? "warn" as Severity : "ok" as Severity },
                  { label: "Expired Keys", value: redis.stats.expiredKeys.toLocaleString(), severity: "ok" as Severity },
                  { label: "Uptime", value: `${Math.floor(redis.stats.uptimeSeconds / 86400)}d`, severity: "ok" as Severity },
                ].map(({ label, value, severity }) => (
                  <div key={label} className="flex items-center justify-between mb-2">
                    <span className="text-[11px] text-muted-foreground font-mono">{label}</span>
                    <SeverityBadge severity={severity} label={value} />
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
