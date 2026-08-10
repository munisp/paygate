// APISIX Gateway monitoring page
import { useState } from "react";
import { Server, Route, Users, BarChart2, Shield, Zap, AlertTriangle, Clock, Activity } from "lucide-react";
import MetricCard from "@/components/MetricCard";
import StatusBadge from "@/components/StatusBadge";
import { mockRoutes, mockConsumers, mockMetrics, mockPluginStats } from "@/lib/mockData";
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from "recharts";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";

const PLUGIN_COLORS: Record<string, string> = {
  Authentication: "oklch(0.72 0.18 200)",
  "Traffic Control": "oklch(0.78 0.16 75)",
  Observability: "oklch(0.75 0.16 145)",
  Security: "oklch(0.65 0.22 25)",
};

export default function GatewayPage() {
  const [selectedTab, setSelectedTab] = useState("routes");

  const gatewayStatus = mockRoutes.some(r => r.status === "critical") ? "critical" :
    mockRoutes.some(r => r.status === "degraded") ? "degraded" : "healthy";

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-lg font-bold text-foreground font-mono tracking-tight flex items-center gap-2">
            <Server size={16} className="text-primary" />
            APISIX EDGE GATEWAY
          </h1>
          <p className="text-xs text-muted-foreground mt-0.5 font-mono">Route telemetry · Consumer registry · Plugin coverage · Traffic distribution</p>
        </div>
        <StatusBadge status={gatewayStatus} />
      </div>

      {/* Metrics row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        <MetricCard label="Requests / sec" value={mockMetrics.requestsPerSec} icon={Zap} accentColor="text-primary" style={{ animationDelay: "0ms" }} />
        <MetricCard label="P50 Latency" value={mockMetrics.latencyP50} unit="ms" icon={Clock} accentColor="text-emerald-400" style={{ animationDelay: "40ms" }} />
        <MetricCard label="P99 Latency" value={mockMetrics.latencyP99} unit="ms" icon={Clock} accentColor="text-amber-400" style={{ animationDelay: "80ms" }} />
        <MetricCard label="Error Rate" value={`${mockMetrics.errorRate}%`} icon={AlertTriangle} accentColor="text-emerald-400" style={{ animationDelay: "120ms" }} />
      </div>

      {/* Tabs */}
      <Tabs value={selectedTab} onValueChange={setSelectedTab}>
        <TabsList className="bg-secondary border border-border">
          <TabsTrigger value="routes" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-primary">
            <Route size={13} /> Routes ({mockRoutes.length})
          </TabsTrigger>
          <TabsTrigger value="consumers" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-primary">
            <Users size={13} /> Consumers ({mockConsumers.length})
          </TabsTrigger>
          <TabsTrigger value="plugins" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-primary">
            <Shield size={13} /> Plugins
          </TabsTrigger>
          <TabsTrigger value="metrics" className="text-xs gap-1.5 data-[state=active]:bg-card data-[state=active]:text-primary">
            <BarChart2 size={13} /> Per-Route Traffic
          </TabsTrigger>
        </TabsList>

        {/* Routes tab */}
        <TabsContent value="routes" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Route</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Methods</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden lg:table-cell">Plugins</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Req/min</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden sm:table-cell">P99</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Status</th>
                </tr>
              </thead>
              <tbody>
                {mockRoutes.map((route, i) => (
                  <tr key={route.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors card-enter" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="px-4 py-3">
                      <div className="font-medium text-foreground text-sm">{route.name}</div>
                      <div className="route-path mt-0.5">{route.path}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {route.methods.map(m => (
                          <span key={m} className="px-1.5 py-0.5 bg-primary/10 text-primary text-[10px] font-mono rounded">{m}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {route.plugins.map(p => (
                          <span key={p} className="px-1.5 py-0.5 bg-secondary text-muted-foreground text-[10px] font-mono rounded border border-border/50">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right font-mono text-sm text-foreground">{route.requestsPerMin.toLocaleString()}</td>
                    <td className="px-4 py-3 text-right font-mono text-sm hidden sm:table-cell">
                      <span className={route.latencyP99 > 100 ? "text-amber-400" : "text-emerald-400"}>{route.latencyP99}ms</span>
                    </td>
                    <td className="px-4 py-3 text-right">
                      <StatusBadge status={route.status} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Consumers tab */}
        <TabsContent value="consumers" className="mt-4">
          <div className="bg-card border border-border rounded-lg overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-secondary/50">
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Consumer</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden md:table-cell">Merchant ID</th>
                  <th className="text-left px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider hidden lg:table-cell">Plugins</th>
                  <th className="text-right px-4 py-2.5 text-xs text-muted-foreground font-medium uppercase tracking-wider">Created</th>
                </tr>
              </thead>
              <tbody>
                {mockConsumers.map((c, i) => (
                  <tr key={c.id} className="border-b border-border/50 hover:bg-secondary/30 transition-colors card-enter" style={{ animationDelay: `${i * 30}ms` }}>
                    <td className="px-4 py-3">
                      <div className="font-mono text-sm text-foreground">{c.username}</div>
                      <div className="text-xs text-muted-foreground mt-0.5 font-mono">{c.id}</div>
                    </td>
                    <td className="px-4 py-3 hidden md:table-cell">
                      <span className="font-mono text-xs text-primary">{c.merchantId}</span>
                    </td>
                    <td className="px-4 py-3 hidden lg:table-cell">
                      <div className="flex gap-1 flex-wrap">
                        {c.plugins.map(p => (
                          <span key={p} className="px-1.5 py-0.5 bg-secondary text-muted-foreground text-[10px] font-mono rounded border border-border/50">{p}</span>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3 text-right text-xs text-muted-foreground font-mono">
                      {new Date(c.createdAt).toLocaleDateString()}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </TabsContent>

        {/* Plugins tab */}
        <TabsContent value="plugins" className="mt-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Plugin Usage by Route Count</h3>
              <ResponsiveContainer width="100%" height={220}>
                <BarChart data={mockPluginStats} layout="vertical" margin={{ left: 0, right: 20 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" horizontal={false} />
                  <XAxis type="number" tick={{ fontSize: 10, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: "oklch(0.92 0.005 220)", fontFamily: "JetBrains Mono" }} width={100} />
                  <Tooltip contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }} />
                  <Bar dataKey="count" radius={[0, 4, 4, 0]}>
                    {mockPluginStats.map((entry) => (
                      <Cell key={entry.name} fill={PLUGIN_COLORS[entry.category] || "oklch(0.72 0.18 200)"} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            </div>
            <div className="bg-card border border-border rounded-lg p-4">
              <h3 className="text-sm font-semibold text-foreground mb-4">Plugin Categories</h3>
              <div className="space-y-3">
                {Object.entries(
                  mockPluginStats.reduce((acc, p) => {
                    acc[p.category] = (acc[p.category] || []).concat(p.name);
                    return acc;
                  }, {} as Record<string, string[]>)
                ).map(([category, plugins]) => (
                  <div key={category} className="p-3 bg-secondary/40 rounded-md border border-border/50">
                    <div className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">{category}</div>
                    <div className="flex flex-wrap gap-1.5">
                      {plugins.map(p => (
                        <Badge key={p} variant="secondary" className="font-mono text-[10px]">{p}</Badge>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </TabsContent>

        {/* Per-route traffic tab */}
        <TabsContent value="metrics" className="mt-4">
          <div className="bg-card border border-border rounded-lg p-4">
            <h3 className="text-sm font-semibold text-foreground mb-4">Requests per Minute by Route</h3>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={mockRoutes} margin={{ top: 0, right: 0, left: -10, bottom: 60 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="oklch(0.28 0.012 265)" />
                <XAxis dataKey="name" tick={{ fontSize: 9, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} angle={-35} textAnchor="end" interval={0} />
                <YAxis tick={{ fontSize: 10, fill: "oklch(0.55 0.010 220)", fontFamily: "JetBrains Mono" }} />
                <Tooltip contentStyle={{ background: "oklch(0.17 0.010 265)", border: "1px solid oklch(0.28 0.012 265)", borderRadius: 6, fontSize: 11 }} />
                <Bar dataKey="requestsPerMin" name="Req/min" radius={[4, 4, 0, 0]}>
                  {mockRoutes.map((r) => (
                    <Cell key={r.id} fill={r.status === "degraded" ? "oklch(0.78 0.16 75)" : "oklch(0.72 0.18 200)"} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
