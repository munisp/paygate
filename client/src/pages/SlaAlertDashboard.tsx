// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { Bell, CheckCircle, AlertTriangle, XCircle, Activity, Clock, TrendingDown } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-700 border-red-200",
  high: "bg-orange-100 text-orange-700 border-orange-200",
  medium: "bg-yellow-100 text-yellow-700 border-yellow-200",
  low: "bg-blue-100 text-blue-700 border-blue-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  investigating: "bg-orange-100 text-orange-700",
  resolved: "bg-green-100 text-green-700",
  auto_resolved: "bg-teal-100 text-teal-700",
};

export default function SlaAlertDashboard() {
  const [filterSeverity, setFilterSeverity] = useState("");
  const [filterStatus, setFilterStatus] = useState("open");

  const { data: incidents, refetch, isLoading } = trpc.wave30.slaAlerting.listIncidents.useQuery({
    severity: filterSeverity || undefined,
    status: filterStatus || undefined,
    limit: 50,
  });

  const { data: metrics } = trpc.wave30.slaAlerting.getCurrentMetrics.useQuery();
  const { data: alertHistory } = trpc.wave30.slaAlerting.getAlertHistory.useQuery({ days: 7 });

  const recordMetric = trpc.wave30.slaAlerting.recordMetric.useMutation({
    onSuccess: (data) => {
      if (data.incident) {
        toast.warning(`SLA breach detected! Incident created: ${data.incident.id}`);
      } else {
        toast.success("Metric recorded");
      }
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const resolveIncident = trpc.wave30.slaAlerting.resolveIncident.useMutation({
    onSuccess: () => { toast.success("Incident resolved"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const sendPushAlert = trpc.wave30.slaAlerting.sendPushAlert.useMutation({
    onSuccess: () => toast.success("Push notification sent to all subscribers"),
    onError: (err) => toast.error(err.message),
  });

  const openIncidents = incidents?.filter((i: any) => i.status === 'open' || i.status === 'investigating').length ?? 0;
  const avgUptime = metrics?.length
    ? (metrics.reduce((a: number, m: any) => a + parseFloat(m.uptime_pct ?? 100), 0) / metrics.length).toFixed(2)
    : "100.00";
  const avgLatency = metrics?.length
    ? Math.round(metrics.reduce((a: number, m: any) => a + parseFloat(m.avg_latency_ms ?? 0), 0) / metrics.length)
    : 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">SLA Monitoring & Alerting</h1>
          <p className="text-gray-500 text-sm mt-1">Real-time uptime, latency, and incident management</p>
        </div>
        <Button className="bg-red-600 hover:bg-red-700 text-white" size="sm"
          onClick={() => sendPushAlert.mutate({ title: "SLA Alert", body: "Manual alert triggered by admin", severity: "high" })}>
          <Bell className="w-4 h-4 mr-2" /> Send Push Alert
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Avg Uptime", value: `${avgUptime}%`, icon: <Activity className="w-5 h-5 text-green-500" />, color: parseFloat(avgUptime) >= 99.5 ? "text-green-600" : "text-red-600" },
          { label: "Avg Latency", value: `${avgLatency}ms`, icon: <Clock className="w-5 h-5 text-blue-500" />, color: avgLatency < 500 ? "text-blue-600" : "text-orange-600" },
          { label: "Open Incidents", value: openIncidents, icon: <AlertTriangle className="w-5 h-5 text-orange-500" />, color: openIncidents === 0 ? "text-green-600" : "text-red-600" },
          { label: "7-Day Alerts", value: alertHistory?.length ?? 0, icon: <TrendingDown className="w-5 h-5 text-purple-500" />, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                {s.icon}
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Simulate Metric */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">Simulate SLA Metric</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-3 flex-wrap">
            <Button variant="outline" size="sm" className="border-green-300 text-green-700"
              onClick={() => recordMetric.mutate({ service: "api-gateway", uptimePct: 99.9, avgLatencyMs: 120, errorRate: 0.01 })}>
              ✓ Healthy (99.9% uptime)
            </Button>
            <Button variant="outline" size="sm" className="border-yellow-300 text-yellow-700"
              onClick={() => recordMetric.mutate({ service: "api-gateway", uptimePct: 99.2, avgLatencyMs: 450, errorRate: 0.8 })}>
              ⚠ Degraded (99.2% uptime)
            </Button>
            <Button variant="outline" size="sm" className="border-red-300 text-red-700"
              onClick={() => recordMetric.mutate({ service: "api-gateway", uptimePct: 97.5, avgLatencyMs: 1200, errorRate: 2.5 })}>
              ✗ Breach (97.5% uptime)
            </Button>
            <Button variant="outline" size="sm" className="border-red-600 text-red-700"
              onClick={() => recordMetric.mutate({ service: "payment-processor", uptimePct: 94.0, avgLatencyMs: 3000, errorRate: 6.0 })}>
              ✗ Critical (94% uptime)
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Incidents Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">Incidents</CardTitle>
            <div className="flex gap-2">
              <select className="border rounded px-2 py-1 text-sm text-gray-700"
                value={filterSeverity} onChange={(e) => setFilterSeverity(e.target.value)}>
                <option value="">All Severity</option>
                <option value="critical">Critical</option>
                <option value="high">High</option>
                <option value="medium">Medium</option>
                <option value="low">Low</option>
              </select>
              <select className="border rounded px-2 py-1 text-sm text-gray-700"
                value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
                <option value="">All Status</option>
                <option value="open">Open</option>
                <option value="investigating">Investigating</option>
                <option value="resolved">Resolved</option>
              </select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {!incidents?.length ? (
            <div className="text-center py-8 text-gray-400">
              <CheckCircle className="w-12 h-12 mx-auto mb-3 text-green-300" />
              <p className="text-green-600 font-medium">All systems operational. No incidents.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Service</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Uptime</TableHead>
                  <TableHead>Latency</TableHead>
                  <TableHead>Started</TableHead>
                  <TableHead>Resolved</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {incidents.map((inc: any) => (
                  <TableRow key={inc.id}>
                    <TableCell className="font-medium text-sm">{inc.service_name}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${SEVERITY_COLORS[inc.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                        {inc.severity}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[inc.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {inc.status}
                      </Badge>
                    </TableCell>
                    <TableCell className={parseFloat(inc.uptime_pct) < 99.5 ? "text-red-600 font-semibold" : "text-gray-700"}>
                      {parseFloat(inc.uptime_pct ?? 0).toFixed(2)}%
                    </TableCell>
                    <TableCell className={parseInt(inc.avg_latency_ms) > 500 ? "text-orange-600 font-semibold" : "text-gray-700"}>
                      {inc.avg_latency_ms}ms
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {new Date(inc.started_at).toLocaleString()}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {inc.resolved_at ? new Date(inc.resolved_at).toLocaleString() : "—"}
                    </TableCell>
                    <TableCell>
                      {(inc.status === 'open' || inc.status === 'investigating') && (
                        <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300"
                          onClick={() => resolveIncident.mutate({ incidentId: inc.id, resolution: "Manually resolved by admin" })}>
                          <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                        </Button>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Alert History */}
      {alertHistory && alertHistory.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-700">7-Day Alert History</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {alertHistory.slice(0, 10).map((alert: any) => (
                <div key={alert.id} className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
                  <div className="flex items-center gap-3">
                    <Badge className={`text-xs ${SEVERITY_COLORS[alert.severity] ?? 'bg-gray-100 text-gray-700'}`}>
                      {alert.severity}
                    </Badge>
                    <div>
                      <p className="text-sm font-medium text-gray-900">{alert.title}</p>
                      <p className="text-xs text-gray-500">{alert.body}</p>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-gray-500">{new Date(alert.sent_at).toLocaleString()}</p>
                    <Badge className={`text-xs ${alert.delivered ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {alert.delivered ? 'Delivered' : 'Pending'}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
