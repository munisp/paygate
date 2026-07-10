import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Activity, Zap, Clock, TrendingUp } from "lucide-react";

function MiniBar({ value, max, color = "bg-primary" }: { value: number; max: number; color?: string }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="h-2 bg-muted rounded-full overflow-hidden">
      <div className={`h-full ${color} rounded-full transition-all duration-700`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function SagaMetricsDashboard() {
  const { data: metrics } = trpc.wave221.sagas.getMetrics.useQuery(undefined, { refetchInterval: 10000 });
  const { data: recent } = trpc.wave221.sagas.getRecent.useQuery({ limit: 20 });

  const allMetrics = metrics ?? [];
  const maxCount = Math.max(...allMetrics.map((m) => m.count ?? 0), 1);
  const maxP99 = Math.max(...allMetrics.map((m) => m.p99 ?? 0), 1);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Saga Metrics Dashboard</h1>
        <p className="text-muted-foreground text-sm">Performance analytics for FHIR payment orchestration and CBDC atomic swap workflows</p>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {[
          { label: "Total Sagas", value: allMetrics.reduce((a, m) => a + (m.count ?? 0), 0), icon: <Activity className="h-5 w-5 text-blue-500" />, color: "text-blue-600" },
          { label: "Completed", value: allMetrics.filter((m) => m.status === "completed").reduce((a, m) => a + (m.count ?? 0), 0), icon: <Zap className="h-5 w-5 text-green-500" />, color: "text-green-600" },
          { label: "Failed", value: allMetrics.filter((m) => m.status === "failed").reduce((a, m) => a + (m.count ?? 0), 0), icon: <TrendingUp className="h-5 w-5 text-destructive" />, color: "text-destructive" },
          { label: "Avg P50 (ms)", value: allMetrics.length > 0 ? Math.round(allMetrics.reduce((a, m) => a + (m.p50 ?? 0), 0) / allMetrics.length) : 0, icon: <Clock className="h-5 w-5 text-purple-500" />, color: "text-purple-600" },
        ].map(({ label, value, icon, color }) => (
          <Card key={label}>
            <CardContent className="pt-4 flex items-center gap-3">
              {icon}
              <div><p className="text-xs text-muted-foreground">{label}</p><p className={`text-2xl font-bold ${color}`}>{value}</p></div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Metrics breakdown */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Throughput by Saga Type & Status</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No saga data yet — run a simulation from the Saga Visualizer</p>
            ) : (
              allMetrics.map((m, i) => (
                <div key={i}>
                  <div className="flex items-center justify-between text-sm mb-1">
                    <span className="font-medium capitalize">{m.sagaType?.replace(/_/g, " ")} — {m.status}</span>
                    <Badge variant={m.status === "completed" ? "default" : m.status === "failed" ? "destructive" : "secondary"} className="text-xs">{m.count}</Badge>
                  </div>
                  <MiniBar value={m.count ?? 0} max={maxCount} color={m.status === "completed" ? "bg-green-500" : m.status === "failed" ? "bg-destructive" : "bg-yellow-500"} />
                </div>
              ))
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-3">
            <CardTitle className="text-base">Latency Distribution (P50 / P95 / P99)</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {allMetrics.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-6">No latency data yet</p>
            ) : (
              allMetrics.map((m, i) => (
                <div key={i} className="space-y-1">
                  <p className="text-sm font-medium capitalize">{m.sagaType?.replace(/_/g, " ")}</p>
                  <div className="grid grid-cols-3 gap-2 text-xs">
                    {[
                      { label: "P50", value: m.p50, color: "bg-blue-500" },
                      { label: "P95", value: m.p95, color: "bg-yellow-500" },
                      { label: "P99", value: m.p99, color: "bg-red-500" },
                    ].map(({ label, value, color }) => (
                      <div key={label}>
                        <div className="flex justify-between mb-0.5">
                          <span className="text-muted-foreground">{label}</span>
                          <span className="font-mono">{value ?? "—"}ms</span>
                        </div>
                        <MiniBar value={value ?? 0} max={maxP99} color={color} />
                      </div>
                    ))}
                  </div>
                </div>
              ))
            )}
          </CardContent>
        </Card>
      </div>

      {/* Recent sagas */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base">Recent Saga Executions</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="rounded-md border overflow-hidden">
            <table className="w-full text-sm">
              <thead className="bg-muted/50">
                <tr>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">ID</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Type</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Status</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Steps</th>
                  <th className="text-left px-3 py-2 font-medium text-muted-foreground">Duration</th>
                </tr>
              </thead>
              <tbody className="divide-y">
                {(recent ?? []).length === 0 && (
                  <tr><td colSpan={5} className="text-center py-6 text-muted-foreground text-sm">No recent executions</td></tr>
                )}
                {(recent ?? []).map((saga) => (
                  <tr key={saga.id} className="hover:bg-muted/30">
                    <td className="px-3 py-2 font-mono text-xs text-muted-foreground">{saga.id.slice(0, 12)}…</td>
                    <td className="px-3 py-2 capitalize text-xs">{saga.sagaType?.replace(/_/g, " ")}</td>
                    <td className="px-3 py-2">
                      <Badge variant={saga.status === "completed" ? "default" : saga.status === "failed" ? "destructive" : "secondary"} className="text-xs capitalize">{saga.status}</Badge>
                    </td>
                    <td className="px-3 py-2 text-xs">{saga.currentStep}/{saga.totalSteps}</td>
                    <td className="px-3 py-2 text-xs">{saga.durationMs ? `${saga.durationMs}ms` : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
