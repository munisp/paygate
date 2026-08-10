import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { RefreshCw, Activity, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, { badge: string; dot: string }> = {
  healthy: { badge: "text-green-600 border-green-500/30 bg-green-500/5", dot: "bg-green-500" },
  degraded: { badge: "text-yellow-600 border-yellow-500/30 bg-yellow-500/5", dot: "bg-yellow-500" },
  down: { badge: "text-destructive border-destructive/30 bg-destructive/5", dot: "bg-destructive" },
  unknown: { badge: "text-muted-foreground border-muted", dot: "bg-muted-foreground" },
};

function HealthBar({ uptime }: { uptime: number }) {
  return (
    <div className="flex items-center gap-1.5">
      <div className="flex gap-0.5">
        {Array.from({ length: 30 }).map((_, i) => (
          <div
            key={i}
            className={`w-1.5 h-5 rounded-sm ${i < Math.floor(uptime * 0.3) ? "bg-green-500" : "bg-muted"}`}
          />
        ))}
      </div>
      <span className="text-xs text-muted-foreground">{(uptime).toFixed(2)}%</span>
    </div>
  );
}

export default function DomainHealthMonitor() {
  const { data: health, refetch, isLoading } = trpc.wave221.domainHealth.getAll.useQuery(undefined, { refetchInterval: 15000 });
  const { data: summary } = trpc.wave221.domainHealth.getSummary.useQuery(undefined, { refetchInterval: 15000 });

  const domains = health ?? [];
  const totalHealthy = domains.filter((d) => d.status === "healthy").length;
  const totalDegraded = domains.filter((d) => d.status === "degraded").length;
  const totalDown = domains.filter((d) => d.status === "down").length;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Domain Health Monitor</h1>
          <p className="text-muted-foreground text-sm">Real-time health status across all payment domain services</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`h-4 w-4 mr-2 ${isLoading ? "animate-spin" : ""}`} /> Refresh
        </Button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <Card className="border-green-500/20 bg-green-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <CheckCircle2 className="h-6 w-6 text-green-500" />
            <div><p className="text-xs text-muted-foreground">Healthy</p><p className="text-2xl font-bold text-green-600">{totalHealthy}</p></div>
          </CardContent>
        </Card>
        <Card className="border-yellow-500/20 bg-yellow-500/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <AlertTriangle className="h-6 w-6 text-yellow-500" />
            <div><p className="text-xs text-muted-foreground">Degraded</p><p className="text-2xl font-bold text-yellow-600">{totalDegraded}</p></div>
          </CardContent>
        </Card>
        <Card className="border-destructive/20 bg-destructive/5">
          <CardContent className="pt-4 flex items-center gap-3">
            <XCircle className="h-6 w-6 text-destructive" />
            <div><p className="text-xs text-muted-foreground">Down</p><p className="text-2xl font-bold text-destructive">{totalDown}</p></div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {domains.length === 0 && (
          <Card className="md:col-span-2">
            <CardContent className="text-center py-12 text-muted-foreground">
              <Activity className="h-12 w-12 mx-auto mb-3 opacity-20" />
              <p className="text-sm">No domain health data available</p>
            </CardContent>
          </Card>
        )}
        {domains.map((domain) => {
          const cfg = STATUS_COLORS[domain.status] ?? STATUS_COLORS.unknown;
          return (
            <Card key={domain.id}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <span className={`h-2.5 w-2.5 rounded-full ${cfg.dot} ${domain.status === "healthy" ? "animate-pulse" : ""}`} />
                    <CardTitle className="text-base">{domain.domainName}</CardTitle>
                  </div>
                  <Badge variant="outline" className={`text-xs capitalize ${cfg.badge}`}>{domain.status}</Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div>
                    <p className="text-muted-foreground">Latency</p>
                    <p className="font-semibold">{domain.latencyMs ?? "—"}ms</p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Error Rate</p>
                    <p className={`font-semibold ${(domain.errorRate ?? 0) > 0.05 ? "text-destructive" : "text-green-600"}`}>
                      {((domain.errorRate ?? 0) * 100).toFixed(2)}%
                    </p>
                  </div>
                  <div>
                    <p className="text-muted-foreground">Throughput</p>
                    <p className="font-semibold">{domain.throughput ?? "—"} tps</p>
                  </div>
                </div>
                <div>
                  <p className="text-xs text-muted-foreground mb-1">30-day uptime</p>
                  <HealthBar uptime={domain.uptimePct ?? 99.9} />
                </div>
                {domain.lastIncident && (
                  <p className="text-xs text-muted-foreground flex items-center gap-1">
                    <Clock className="h-3 w-3" /> Last incident: {domain.lastIncident}
                  </p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
