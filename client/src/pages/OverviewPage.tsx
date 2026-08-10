// Obsidian Operations — Overview (Ops Console)
// Asymmetric layout: 2/3 primary data + 1/3 live status rail
import { Activity, Server, GitBranch, Database, Zap, AlertTriangle, CheckCircle, Clock, Radio, TrendingUp, Layers } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { mockMetrics, mockRoutes, mockWorkflows, mockPgBouncerPools } from "@/lib/mockData";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, Cell } from "recharts";
import { trpc } from "@/lib/trpc";
import { useRefresh } from "@/contexts/RefreshContext";

export default function OverviewPage() {
  const { forceMock } = useRefresh();
  const kafkaQuery = trpc.paygate.kafka.useQuery({ forceMock });
  const kafkaData = kafkaQuery.data;

  const healthyRoutes = mockRoutes.filter(r => r.status === "healthy").length;
  const degradedRoutes = mockRoutes.filter(r => r.status === "degraded").length;
  const runningWorkflows = mockWorkflows.filter(w => w.status === "running").length;
  const failedWorkflows = mockWorkflows.filter(w => w.status === "failed" || w.status === "timed_out").length;
  const totalPoolClients = mockPgBouncerPools.reduce((s, p) => s + p.clActive, 0);

  // Consumer lag summary from live Kafka data
  const consumerGroups = kafkaData?.consumerGroups ?? [];
  const totalLag = consumerGroups.reduce((s, g) => s + g.lag, 0);
  const lagSparkData = consumerGroups.map(g => ({ name: g.name.split("-")[0], lag: g.lag }));
  const hasLag = totalLag > 0;

  const services = [
    { name: "APISIX Gateway", status: degradedRoutes > 0 ? "degraded" as const : "healthy" as const, detail: `${healthyRoutes}/${mockRoutes.length} routes nominal` },
    { name: "Temporal Engine", status: failedWorkflows > 0 ? "degraded" as const : "healthy" as const, detail: `${runningWorkflows} workflows executing` },
    { name: "PgBouncer Pool", status: "healthy" as const, detail: `${totalPoolClients} active connections` },
    { name: "PostgreSQL", status: "healthy" as const, detail: "All ORM tables reachable" },
    { name: "Kafka Broker", status: "healthy" as const, detail: "3 topics · 0 consumer lag" },
    { name: "Redis Cache", status: "healthy" as const, detail: "Hit rate 94.2% · 0ms avg" },
  ];

  const alerts = [
    ...(degradedRoutes > 0 ? [{ level: "warn" as const, msg: `Admin Dashboard route P99 at 210ms — SLA breach imminent`, time: "2m ago" }] : []),
    ...(failedWorkflows > 0 ? [{ level: "error" as const, msg: `STRFiling workflow run-m3n4o5p6 terminated with error`, time: "3h ago" }, { level: "warn" as const, msg: `CrossBorderTransfer run-y5z6a7b8 timed out after 30m`, time: "5h ago" }] : []),
  ];

  return (
    <div className="space-y-5">
      {/* Page header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <Radio size={16} className="text-primary" />
            SYSTEM TELEMETRY
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">Real-time health across all PayGate infrastructure nodes</p>
        </div>
        <div className="text-xs font-mono text-muted-foreground hidden md:block">
          {new Date().toISOString().replace("T", " ").slice(0, 19)} UTC
        </div>
      </div>

      {/* Key metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Throughput" value={mockMetrics.requestsPerSec} unit="rps" icon={Zap} accentColor="text-primary" trendLabel="+12% vs prior window" trend="up" style={{ animationDelay: "0ms" }} />
        <MetricCard label="P99 Latency" value={mockMetrics.latencyP99} unit="ms" icon={Clock} accentColor="text-amber-400" trendLabel="SLA threshold: 200ms" trend="neutral" style={{ animationDelay: "40ms" }} />
        <MetricCard label="Error Rate" value={`${mockMetrics.errorRate}%`} icon={AlertTriangle} accentColor="text-emerald-400" trendLabel="Below 1% threshold" trend="neutral" style={{ animationDelay: "80ms" }} />
        <MetricCard label="Active Conns" value={mockMetrics.activeConnections} icon={Activity} accentColor="text-primary" trendLabel="284 / 1000 capacity" trend="neutral" style={{ animationDelay: "120ms" }} />
      </div>

      {/* Asymmetric 2/3 + 1/3 layout */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        {/* Primary: request volume chart */}
        <div className="lg:col-span-2 space-y-4">
          {/* Consumer lag sparkline */}
          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "155ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: hasLag
                ? "inset 0 0 0 1px oklch(0.78 0.16 75 / 0.18), 0 0 10px oklch(0.78 0.16 75 / 0.06)"
                : "inset 0 0 0 1px oklch(0.75 0.16 145 / 0.08)",
            }}
          >
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest flex items-center gap-2">
                <Layers size={13} className={hasLag ? "text-amber-400" : "text-primary"} />
                Consumer Lag · Current
              </h2>
              <div className="flex items-center gap-3">
                {kafkaQuery.isLoading && (
                  <span className="text-[10px] text-muted-foreground font-mono animate-pulse">loading…</span>
                )}
                <span className={`text-xs font-mono font-bold tabular-nums ${hasLag ? "text-amber-400" : "text-emerald-400"}`}>
                  {totalLag.toLocaleString()} total msgs lag
                </span>
              </div>
            </div>
            {lagSparkData.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-muted-foreground font-mono py-2">
                <span className="w-1.5 h-1.5 rounded-full bg-muted-foreground animate-pulse" />
                No consumer groups found
              </div>
            ) : (
              <div className="flex items-end gap-4">
                <ResponsiveContainer width="100%" height={72}>
                  <BarChart data={lagSparkData} margin={{ top: 4, right: 0, left: -28, bottom: 0 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" vertical={false} />
                    <XAxis dataKey="name" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                    <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                    <Tooltip
                      contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                      labelStyle={{ color: "oklch(0.92 0.005 220)", fontFamily: "JetBrains Mono" }}
                      formatter={(v: number) => [`${v} msgs`, "Lag"]}
                    />
                    <Bar dataKey="lag" radius={[3, 3, 0, 0]}>
                      {lagSparkData.map((entry, i) => (
                        <Cell
                          key={i}
                          fill={entry.lag > 20 ? "oklch(0.65 0.22 25)" : entry.lag > 5 ? "oklch(0.78 0.16 75)" : "oklch(0.72 0.18 200)"}
                        />
                      ))}
                    </Bar>
                  </BarChart>
                </ResponsiveContainer>
                <div className="shrink-0 space-y-1 min-w-[130px]">
                  {consumerGroups.map(g => (
                    <div key={g.name} className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-mono text-muted-foreground truncate max-w-[90px]">{g.name}</span>
                      <span className={`text-[10px] font-mono font-bold tabular-nums ${g.lag > 20 ? "text-red-400" : g.lag > 5 ? "text-amber-400" : "text-emerald-400"}`}>
                        {g.lag}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "160ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)",
            }}
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest flex items-center gap-2">
                <TrendingUp size={13} className="text-primary" />
                Request Volume · 24h Window
              </h2>
              <span className="text-xs text-muted-foreground font-mono">{mockMetrics.totalRequests24h.toLocaleString()} total events</span>
            </div>
            <ResponsiveContainer width="100%" height={180}>
              <AreaChart data={mockMetrics.requestHistory} margin={{ top: 0, right: 0, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="rpsGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.72 0.18 200)" stopOpacity={0} />
                  </linearGradient>
                  <linearGradient id="errGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0.3} />
                    <stop offset="95%" stopColor="oklch(0.65 0.22 25)" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                <XAxis dataKey="time" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                <YAxis tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                <Tooltip
                  contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }}
                  labelStyle={{ color: "oklch(0.92 0.005 220)", fontFamily: "JetBrains Mono" }}
                />
                <Area type="monotone" dataKey="rps" stroke="oklch(0.72 0.18 200)" fill="url(#rpsGrad)" strokeWidth={2} name="RPS" />
                <Area type="monotone" dataKey="errors" stroke="oklch(0.65 0.22 25)" fill="url(#errGrad)" strokeWidth={1.5} name="Errors" />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Infrastructure health grid */}
          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "200ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.06)",
            }}
          >
            <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest mb-4">Infrastructure Node Status</h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
              {services.map((svc, i) => (
                <div
                  key={svc.name}
                  className="flex items-center justify-between p-2.5 rounded-md border card-enter"
                  style={{
                    animationDelay: `${240 + i * 30}ms`,
                    background: "oklch(0.20 0.010 265)",
                    borderColor: svc.status === "healthy" ? "oklch(0.75 0.16 145 / 0.15)" : "oklch(0.78 0.16 75 / 0.25)",
                    boxShadow: svc.status === "healthy" ? "inset 0 0 0 1px oklch(0.75 0.16 145 / 0.05)" : "inset 0 0 0 1px oklch(0.78 0.16 75 / 0.08)",
                  }}
                >
                  <div>
                    <div className="text-xs font-mono font-semibold text-foreground">{svc.name}</div>
                    <div className="text-[10px] text-muted-foreground mt-0.5 font-mono">{svc.detail}</div>
                  </div>
                  <StatusBadge status={svc.status} />
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Secondary: live status rail */}
        <div className="space-y-4">
          {/* Alert queue */}
          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "180ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: alerts.length > 0
                ? "inset 0 0 0 1px oklch(0.78 0.16 75 / 0.15), 0 0 12px oklch(0.78 0.16 75 / 0.05)"
                : "inset 0 0 0 1px oklch(0.75 0.16 145 / 0.10)",
            }}
          >
            <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
              <AlertTriangle size={12} className={alerts.length > 0 ? "text-amber-400" : "text-emerald-400"} />
              Incident Queue
              {alerts.length > 0 && (
                <span className="ml-auto px-1.5 py-0.5 bg-amber-400/10 text-amber-400 text-[10px] font-mono rounded">{alerts.length}</span>
              )}
            </h2>
            {alerts.length === 0 ? (
              <div className="flex items-center gap-2 text-xs text-emerald-400 font-mono py-2">
                <CheckCircle size={13} />
                No active incidents
              </div>
            ) : (
              <div className="space-y-2">
                {alerts.map((a, i) => (
                  <div
                    key={i}
                    className="p-2.5 rounded-md border text-xs card-enter"
                    style={{
                      animationDelay: `${220 + i * 40}ms`,
                      background: a.level === "error" ? "oklch(0.65 0.22 25 / 0.08)" : "oklch(0.78 0.16 75 / 0.08)",
                      borderColor: a.level === "error" ? "oklch(0.65 0.22 25 / 0.25)" : "oklch(0.78 0.16 75 / 0.25)",
                    }}
                  >
                    <div className={`font-mono text-[10px] font-semibold mb-1 ${a.level === "error" ? "text-red-400" : "text-amber-400"}`}>
                      {a.level.toUpperCase()}
                    </div>
                    <div className="text-muted-foreground leading-snug">{a.msg}</div>
                    <div className="text-muted-foreground/50 font-mono text-[10px] mt-1">{a.time}</div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Live workflow status */}
          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "220ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.08)",
            }}
          >
            <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
              <GitBranch size={12} className="text-primary" />
              Live Executions
            </h2>
            <div className="space-y-2">
              {mockWorkflows.filter(w => w.status === "running").map((wf, i) => (
                <div key={wf.id} className="flex items-start justify-between gap-2 card-enter" style={{ animationDelay: `${260 + i * 30}ms` }}>
                  <div className="min-w-0">
                    <div className="text-xs font-mono text-foreground truncate">{wf.workflowType}</div>
                    <div className="text-[10px] font-mono text-muted-foreground truncate">{wf.merchantId}</div>
                  </div>
                  <span className="shrink-0 flex items-center gap-1 text-[10px] font-mono text-primary">
                    <span className="w-1.5 h-1.5 rounded-full bg-primary animate-pulse" />
                    live
                  </span>
                </div>
              ))}
            </div>
          </div>

          {/* Gateway quick stats */}
          <div
            className="bg-card border border-border rounded-lg p-4 card-enter"
            style={{
              animationDelay: "260ms",
              background: "linear-gradient(135deg, oklch(0.17 0.010 265) 0%, oklch(0.15 0.009 265) 100%)",
              boxShadow: "inset 0 0 0 1px oklch(0.72 0.18 200 / 0.08)",
            }}
          >
            <h2 className="text-xs font-bold text-foreground font-mono uppercase tracking-widest mb-3 flex items-center gap-2">
              <Server size={12} className="text-primary" />
              Gateway Snapshot
            </h2>
            <div className="space-y-2">
              {[
                { label: "Active Routes", value: `${mockRoutes.length}`, color: "text-foreground" },
                { label: "Degraded", value: `${degradedRoutes}`, color: degradedRoutes > 0 ? "text-amber-400" : "text-emerald-400" },
                { label: "Consumers", value: "5", color: "text-foreground" },
                { label: "Top Route RPS", value: "1,204", color: "text-primary" },
              ].map(({ label, value, color }) => (
                <div key={label} className="flex items-center justify-between">
                  <span className="text-[11px] text-muted-foreground font-mono">{label}</span>
                  <span className={`text-xs font-mono font-bold ${color}`}>{value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
