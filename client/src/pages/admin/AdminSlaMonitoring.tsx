// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { toast } from "sonner";
import { Activity, AlertTriangle, CheckCircle, Clock, Zap } from "lucide-react";
import { useAdaptiveInterval } from "@/lib/networkQuality";

const STATUS_COLORS: Record<string, string> = {
  operational: "bg-green-100 text-green-800",
  degraded: "bg-amber-100 text-amber-800",
  outage: "bg-red-100 text-red-800",
  maintenance: "bg-blue-100 text-blue-800",
};

export default function AdminSlaMonitoring() {
  const adminslamonitoring_60s = useAdaptiveInterval(60_000);
  const { data: slaStats, refetch } = trpc.wave29.slaMonitoring.getStats.useQuery(
    {},
    { refetchInterval: adminslamonitoring_60s }
  );

  const { data: incidents } = trpc.wave29.slaMonitoring.getIncidents.useQuery({ limit: 20 });

  const recordPing = trpc.wave29.slaMonitoring.recordPing.useMutation({
    onSuccess: () => { toast.success("Ping recorded"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const breaching = (slaStats ?? []).filter((s: any) => Number(s.uptime_pct) < Number(s.sla_uptime_pct));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SLA Monitoring</h1>
          <p className="text-gray-500 mt-1">Track uptime, latency, and SLA compliance per tenant plan</p>
        </div>
        <Button
          size="sm"
          onClick={() => recordPing.mutate({ tenantId: "3", latencyMs: Math.floor(Math.random() * 200) + 50, status: "operational" })}
          disabled={recordPing.isPending}
        >
          <Zap className="w-4 h-4 mr-2" />
          Record Ping
        </Button>
      </div>

      {/* SLA Breach Alerts */}
      {breaching.length > 0 && (
        <div className="space-y-2">
          {breaching.map((s: any) => (
            <div key={s.tenant_id} className="flex items-center gap-3 p-3 bg-red-50 border border-red-200 rounded-lg">
              <AlertTriangle className="w-5 h-5 text-red-500" />
              <div>
                <p className="font-medium text-red-800">
                  SLA Breach: {s.tenant_name} — {Number(s.uptime_pct).toFixed(2)}% uptime (SLA: {s.sla_uptime_pct}%)
                </p>
                <p className="text-xs text-red-600">Avg latency: {s.avg_latency_ms}ms</p>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* SLA Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {(slaStats ?? []).map((s: any) => {
          const uptime = Number(s.uptime_pct ?? 0);
          const slaTarget = Number(s.sla_uptime_pct ?? 99.9);
          const compliant = uptime >= slaTarget;
          return (
            <Card key={s.tenant_id} className={!compliant ? "border-red-300" : ""}>
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-sm font-medium">{s.tenant_name}</CardTitle>
                  <Badge className={STATUS_COLORS[s.current_status] ?? ""}>
                    {s.current_status}
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                <div>
                  <div className="flex justify-between text-sm mb-1">
                    <span className="text-gray-500">Uptime</span>
                    <span className={compliant ? "text-green-600 font-medium" : "text-red-600 font-medium"}>
                      {uptime.toFixed(3)}%
                    </span>
                  </div>
                  <Progress value={uptime} className="h-2" />
                  <p className="text-xs text-gray-400 mt-1">SLA target: {slaTarget}%</p>
                </div>
                <div className="grid grid-cols-2 gap-2 text-sm">
                  <div>
                    <p className="text-gray-500">Avg Latency</p>
                    <p className="font-medium">{s.avg_latency_ms ?? 0}ms</p>
                  </div>
                  <div>
                    <p className="text-gray-500">Total Pings</p>
                    <p className="font-medium">{s.total_pings ?? 0}</p>
                  </div>
                </div>
                <div className="flex items-center gap-1">
                  {compliant ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : (
                    <AlertTriangle className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`text-xs ${compliant ? "text-green-600" : "text-red-600"}`}>
                    {compliant ? "SLA Compliant" : "SLA Breach"}
                  </span>
                </div>
              </CardContent>
            </Card>
          );
        })}
        {(slaStats ?? []).length === 0 && (
          <Card className="col-span-3">
            <CardContent className="py-8 text-center text-gray-400">
              No SLA data yet. Record pings to start monitoring.
            </CardContent>
          </Card>
        )}
      </div>

      {/* Incident Log */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Clock className="w-5 h-5" />
            Recent Incidents
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Tenant</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Latency</TableHead>
                <TableHead>Error</TableHead>
                <TableHead>Recorded</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(incidents ?? []).map((inc: any, i: number) => (
                <TableRow key={i}>
                  <TableCell className="font-medium">{inc.tenant_name ?? inc.tenant_id}</TableCell>
                  <TableCell>
                    <Badge className={STATUS_COLORS[inc.status] ?? ""}>{inc.status}</Badge>
                  </TableCell>
                  <TableCell>{inc.latency_ms}ms</TableCell>
                  <TableCell className="text-red-600 text-sm">{inc.error_message ?? "—"}</TableCell>
                  <TableCell className="text-sm text-gray-500">
                    {new Date(inc.recorded_at).toLocaleString()}
                  </TableCell>
                </TableRow>
              ))}
              {(incidents ?? []).length === 0 && (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-gray-400 py-8">
                    No incidents recorded.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
