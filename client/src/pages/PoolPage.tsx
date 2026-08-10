// PgBouncer Connection Pool monitoring page
import { Database, Users, Server, Activity, AlertTriangle, CheckCircle } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { mockPgBouncerPools, mockPoolConfig } from "@/lib/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";

export default function PoolPage() {
  const totalActive = mockPgBouncerPools.reduce((s, p) => s + p.clActive, 0);
  const totalWaiting = mockPgBouncerPools.reduce((s, p) => s + p.clWaiting, 0);
  const totalSvActive = mockPgBouncerPools.reduce((s, p) => s + p.svActive, 0);
  const totalSvIdle = mockPgBouncerPools.reduce((s, p) => s + p.svIdle, 0);
  const utilizationPct = Math.round((totalActive / mockPoolConfig.maxClientConn) * 100);
  const poolStatus = totalWaiting > 0 ? "degraded" as const : "healthy" as const;

  const chartData = mockPgBouncerPools.map(p => ({
    name: `${p.database}/${p.user}`,
    active: p.clActive,
    idle: p.svIdle,
    waiting: p.clWaiting,
  }));

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <Database size={16} className="text-primary" />
            PGBOUNCER CONNECTION TELEMETRY
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">Pool utilization · Client/server distribution · Configuration snapshot</p>
        </div>
        <div className="flex items-center gap-3">
          <span className="text-xs font-mono text-muted-foreground">{mockPoolConfig.version}</span>
          <StatusBadge status={poolStatus} />
        </div>
      </div>

      {/* Metrics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Active Clients" value={totalActive} icon={Users} accentColor="text-primary" trendLabel={`${utilizationPct}% of max ${mockPoolConfig.maxClientConn}`} style={{ animationDelay: "0ms" }} />
        <MetricCard label="Waiting Clients" value={totalWaiting} icon={AlertTriangle} accentColor={totalWaiting > 0 ? "text-amber-400" : "text-emerald-400"} trendLabel={totalWaiting === 0 ? "No queue" : "Pool pressure"} style={{ animationDelay: "40ms" }} />
        <MetricCard label="Active Servers" value={totalSvActive} icon={Server} accentColor="text-primary" trendLabel={`${totalSvIdle} idle`} style={{ animationDelay: "80ms" }} />
        <MetricCard label="Pool Uptime" value={mockPoolConfig.uptime} icon={Activity} accentColor="text-emerald-400" style={{ animationDelay: "120ms" }} />
      </div>

      {/* Pool config */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="bg-card border border-border rounded-lg p-4 card-enter" style={{ animationDelay: "160ms" }}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Pool Configuration</h2>
          <div className="space-y-2">
            {[
              { label: "Pool Mode", value: mockPoolConfig.poolMode },
              { label: "Max Client Connections", value: mockPoolConfig.maxClientConn.toLocaleString() },
              { label: "Default Pool Size", value: mockPoolConfig.defaultPoolSize },
              { label: "Reserve Pool Size", value: mockPoolConfig.reservePoolSize },
              { label: "Version", value: mockPoolConfig.version },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-2 border-b border-border/30">
                <span className="text-xs text-muted-foreground">{label}</span>
                <span className="text-xs font-mono text-foreground">{value}</span>
              </div>
            ))}
          </div>
        </div>

        <div className="bg-card border border-border rounded-lg p-4 card-enter" style={{ animationDelay: "200ms" }}>
          <h2 className="text-sm font-semibold text-foreground mb-4">Client vs Server Connections</h2>
          <ResponsiveContainer width="100%" height={180}>
            <BarChart data={chartData} margin={{ top: 0, right: 0, left: -10, bottom: 30 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
              <XAxis dataKey="name" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} angle={-20} textAnchor="end" />
              <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
              <Tooltip contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }} />
              <Bar dataKey="active" name="Active Clients" fill="oklch(0.72 0.18 200)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="idle" name="Idle Servers" fill="oklch(0.75 0.16 145)" radius={[3, 3, 0, 0]} />
              <Bar dataKey="waiting" name="Waiting" fill="oklch(0.78 0.16 75)" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Pool table */}
      <div className="bg-card border border-border rounded-lg overflow-hidden card-enter" style={{ animationDelay: "240ms" }}>
        <div className="px-4 py-3 border-b border-border bg-secondary/50">
          <h2 className="text-sm font-semibold text-foreground">Pool Details</h2>
        </div>
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-border bg-secondary/30">
              <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Database / User</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Cl Active</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:table-cell">Cl Waiting</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Sv Active</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Sv Idle</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden lg:table-cell">Max Wait</th>
              <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Mode</th>
            </tr>
          </thead>
          <tbody>
            {mockPgBouncerPools.map((pool, i) => (
              <tr key={`${pool.database}-${pool.user}`} className="border-b border-border/50 hover:bg-secondary/30 transition-colors card-enter" style={{ animationDelay: `${280 + i * 30}ms` }}>
                <td className="px-4 py-3">
                  <div className="font-mono text-sm text-foreground">{pool.database}</div>
                  <div className="text-xs text-muted-foreground font-mono">{pool.user}</div>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-foreground">{pool.clActive}</td>
                <td className="px-4 py-3 text-right font-mono text-sm hidden sm:table-cell">
                  <span className={pool.clWaiting > 0 ? "text-amber-400" : "text-muted-foreground"}>{pool.clWaiting}</span>
                </td>
                <td className="px-4 py-3 text-right font-mono text-sm text-foreground hidden md:table-cell">{pool.svActive}</td>
                <td className="px-4 py-3 text-right font-mono text-sm text-muted-foreground hidden md:table-cell">{pool.svIdle}</td>
                <td className="px-4 py-3 text-right font-mono text-sm hidden lg:table-cell">
                  <span className={pool.maxWait > 50 ? "text-amber-400" : "text-emerald-400"}>{pool.maxWait}ms</span>
                </td>
                <td className="px-4 py-3 text-right">
                  <span className="px-2 py-0.5 bg-primary/10 text-primary text-[10px] font-mono rounded">{pool.poolMode}</span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
