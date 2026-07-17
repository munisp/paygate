// CrossBorderRailMonitor.tsx
// Real-time health dashboard for all cross-border payment rails:
// Mojaloop, SWIFT, SEPA, CIPS, UPI, PIX, BRICS Pay.

import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
import { toast } from "sonner";
  Activity, CheckCircle2, AlertTriangle, XCircle,
  RefreshCw, Globe, Zap, Clock, TrendingUp, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

type RailStatus = "operational" | "degraded" | "down";

interface Rail {
  id: string;
  name: string;
  region: string;
  currency: string;
  latencyMs: number;
  uptime: number;
  status: RailStatus;
}

const STATUS_CONFIG: Record<RailStatus, { icon: typeof CheckCircle2; color: string; bg: string; label: string }> = {
  operational: { icon: CheckCircle2, color: "text-emerald-600", bg: "bg-emerald-50 border-emerald-200", label: "Operational" },
  degraded: { icon: AlertTriangle, color: "text-amber-600", bg: "bg-amber-50 border-amber-200", label: "Degraded" },
  down: { icon: XCircle, color: "text-red-600", bg: "bg-red-50 border-red-200", label: "Down" },
};

const RAIL_ICONS: Record<string, string> = {
  mojaloop: "🌍",
  swift: "🌐",
  sepa: "🇪🇺",
  cips: "🇨🇳",
  upi: "🇮🇳",
  pix: "🇧🇷",
  brics_pay: "🤝",
};

function LatencyBar({ ms }: { ms: number }) {
  // 0–200ms = green, 200–1000ms = yellow, 1000+ = red
  const pct = Math.min((ms / 5000) * 100, 100);
  const color = ms < 200 ? "bg-emerald-500" : ms < 1000 ? "bg-amber-500" : "bg-red-500";
  return (
    <div className="flex items-center gap-2">
      <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
        <div className={`h-full rounded-full transition-all duration-700 ${color}`} style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs font-mono text-muted-foreground w-16 text-right">{ms.toLocaleString()} ms</span>
    </div>
  );
}

function RailCard({ rail }: { rail: Rail }) {
  const cfg = STATUS_CONFIG[rail.status];
  const Icon = cfg.icon;
  return (
    <Card className={`border ${cfg.bg} transition-all hover:shadow-md`}>
      <CardContent className="p-5">
        <div className="flex items-start justify-between mb-3">
          <div className="flex items-center gap-2">
            <span className="text-2xl">{RAIL_ICONS[rail.id] ?? "🔗"}</span>
            <div>
              <p className="font-semibold text-sm text-foreground">{rail.name}</p>
              <p className="text-xs text-muted-foreground">{rail.region} · {rail.currency}</p>
            </div>
          </div>
          <Badge variant="outline" className={`text-xs ${cfg.color} border-current`}>
            <Icon className="w-3 h-3 mr-1" />
            {cfg.label}
          </Badge>
        </div>

        <div className="space-y-2">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1">
            <span className="flex items-center gap-1"><Clock className="w-3 h-3" /> Latency</span>
          </div>
          <LatencyBar ms={rail.latencyMs} />

          <div className="flex items-center justify-between mt-3">
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <TrendingUp className="w-3 h-3" /> Uptime (30d)
            </span>
            <span className={`text-xs font-semibold ${rail.uptime >= 99.9 ? "text-emerald-600" : rail.uptime >= 99 ? "text-amber-600" : "text-red-600"}`}>
              {rail.uptime.toFixed(2)}%
            </span>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}

export default function CrossBorderRailMonitor() {
  const [lastRefresh, setLastRefresh] = useState<Date>(new Date());
  const railInterval = useAdaptiveInterval(15_000);

  const { data, isLoading, isError, refetch, isFetching } = trpc.crossBorder.getRailHealth.useQuery(undefined, {
    refetchInterval: railInterval,
    staleTime: 30_000,
  } as any);
  // Update lastRefresh whenever data changes
  // (useEffect to avoid setState-in-render)
  // eslint-disable-next-line react-hooks/exhaustive-deps

  const rails: Rail[] = data?.rails ?? [];

  const operational = rails.filter(r => r.status === "operational").length;
  const degraded = rails.filter(r => r.status === "degraded").length;
  const down = rails.filter(r => r.status === "down").length;

  const overallStatus: RailStatus = down > 0 ? "down" : degraded > 0 ? "degraded" : "operational";
  const overallCfg = STATUS_CONFIG[overallStatus];
  const OverallIcon = overallCfg.icon;

  const avgLatency = rails.length > 0
    ? Math.round(rails.reduce((s, r) => s + r.latencyMs, 0) / rails.length)
    : 0;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/cross-border">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Cross-Border
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold flex items-center gap-2">
              <Globe className="w-6 h-6 text-blue-600" />
              Rail Health Monitor
            </h1>
            <p className="text-sm text-muted-foreground">
              Live status of all cross-border payment rails · refreshes every {railInterval ? Math.round((railInterval as number) / 1000) : "—"}s
            </p>
          </div>
        </div>
        <Button
          variant="outline"
          size="sm"
          aria-label="Refresh" onClick={() => refetch()}
          disabled={isFetching}
        ><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Summary Banner */}
      <div className={`flex items-center justify-between p-4 rounded-xl border ${overallCfg.bg}`}>
        <div className="flex items-center gap-3">
          <OverallIcon className={`w-6 h-6 ${overallCfg.color}`} />
          <div>
            <p className={`font-semibold ${overallCfg.color}`}>
              {overallStatus === "operational" ? "All Systems Operational" : overallStatus === "degraded" ? "Partial Degradation Detected" : "Critical: Rail Outage"}
            </p>
            <p className="text-xs text-muted-foreground">
              {operational} operational · {degraded} degraded · {down} down · avg latency {avgLatency.toLocaleString()} ms
            </p>
          </div>
        </div>
        <p className="text-xs text-muted-foreground">
          Last checked: {lastRefresh.toLocaleTimeString()}
        </p>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Rails", value: rails.length, icon: Globe, color: "text-blue-600" },
          { label: "Operational", value: operational, icon: CheckCircle2, color: "text-emerald-600" },
          { label: "Degraded", value: degraded, icon: AlertTriangle, color: "text-amber-600" },
          { label: "Avg Latency", value: `${avgLatency.toLocaleString()} ms`, icon: Zap, color: "text-purple-600" },
        ].map(kpi => (
          <Card key={kpi.label} className="bg-card border-border">
            <CardContent className="p-4 flex items-center gap-3">
              <div className="p-2 rounded-lg bg-muted">
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Rail Grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 7 }).map((_, i) => (
            <Card key={i} className="border-border animate-pulse">
              <CardContent className="p-5 h-36" />
            </Card>
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {rails.map(rail => <RailCard key={rail.id} rail={rail} />)}
        </div>
      )}

      {/* Latency Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold flex items-center gap-2">
            <Activity className="w-4 h-4 text-blue-600" />
            Latency Comparison
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Rail</th>
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Region</th>
                  <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Currency</th>
                  <th className="text-right py-2 pr-4 text-muted-foreground font-medium">Latency</th>
                  <th className="text-right py-2 text-muted-foreground font-medium">Uptime</th>
                </tr>
              </thead>
              <tbody>
                {[...rails].sort((a, b) => a.latencyMs - b.latencyMs).map(rail => {
                  const cfg = STATUS_CONFIG[rail.status];
                  const Icon = cfg.icon;
                  return (
                    <tr key={rail.id} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                      <td className="py-2.5 pr-4">
                        <div className="flex items-center gap-2">
                          <span>{RAIL_ICONS[rail.id] ?? "🔗"}</span>
                          <span className="font-medium">{rail.name}</span>
                          <Icon className={`w-3.5 h-3.5 ${cfg.color}`} />
                        </div>
                      </td>
                      <td className="py-2.5 pr-4 text-muted-foreground">{rail.region}</td>
                      <td className="py-2.5 pr-4 text-muted-foreground font-mono text-xs">{rail.currency}</td>
                      <td className="py-2.5 pr-4 text-right font-mono text-xs">
                        <span className={rail.latencyMs < 200 ? "text-emerald-600" : rail.latencyMs < 1000 ? "text-amber-600" : "text-red-600"}>
                          {rail.latencyMs.toLocaleString()} ms
                        </span>
                      </td>
                      <td className="py-2.5 text-right font-mono text-xs">
                        <span className={rail.uptime >= 99.9 ? "text-emerald-600" : rail.uptime >= 99 ? "text-amber-600" : "text-red-600"}>
                          {rail.uptime.toFixed(2)}%
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
