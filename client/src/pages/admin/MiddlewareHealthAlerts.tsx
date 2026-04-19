import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { AlertTriangle, CheckCircle, Bell, Activity, Wifi, WifiOff, Clock } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  critical: "bg-red-100 text-red-800 border-red-200",
  warning: "bg-yellow-100 text-yellow-800 border-yellow-200",
  info: "bg-blue-100 text-blue-800 border-blue-200",
};

const STATUS_COLORS: Record<string, string> = {
  open: "bg-red-100 text-red-700",
  acknowledged: "bg-yellow-100 text-yellow-700",
  resolved: "bg-green-100 text-green-700",
};

export default function MiddlewareHealthAlerts() {
  const [statusFilter, setStatusFilter] = useState<any>("all");
  const [serviceFilter, setServiceFilter] = useState<string | undefined>(undefined);

  const { data: alertsData, refetch } = trpc.wave31.middlewareHealthAlert.list.useQuery({
    status: statusFilter,
    service: serviceFilter,
  });
  const { data: summaryData } = trpc.wave31.middlewareHealthAlert.getHealthSummary.useQuery();

  const acknowledge = trpc.wave31.middlewareHealthAlert.acknowledge.useMutation({
    onSuccess: () => { toast.success("Alert acknowledged"); refetch(); },
  });

  const resolve = trpc.wave31.middlewareHealthAlert.resolve.useMutation({
    onSuccess: () => { toast.success("Alert resolved"); refetch(); },
  });

  const alerts = (alertsData as any)?.alerts ?? [];
  const services = (summaryData as any)?.services ?? [];

  const SERVICES = ['NIBSS', 'Mojaloop', 'VTPass', 'Termii', 'Youverify', 'USSD'];

  const getServiceStatus = (name: string) => {
    const svc = services.find((s: any) => s.service_name === name);
    if (!svc) return 'unknown';
    if (Number(svc.critical_open) > 0) return 'critical';
    if (Number(svc.open_alerts) > 0) return 'degraded';
    return 'healthy';
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Middleware Health Alerts</h1>
          <p className="text-muted-foreground">Monitor NIBSS, Mojaloop, VTPass, Termii, Youverify, and USSD gateway health</p>
        </div>
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Status</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
            </SelectContent>
          </Select>
          <Select value={serviceFilter ?? "all"} onValueChange={v => setServiceFilter(v === "all" ? undefined : v)}>
            <SelectTrigger className="w-36"><SelectValue placeholder="All Services" /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Services</SelectItem>
              {SERVICES.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      {/* Service Status Grid */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
        {SERVICES.map(name => {
          const status = getServiceStatus(name);
          const svc = services.find((s: any) => s.service_name === name);
          return (
            <Card key={name} className={`border-2 ${status === 'critical' ? 'border-red-300' : status === 'degraded' ? 'border-yellow-300' : 'border-green-300'}`}>
              <CardContent className="p-3 text-center">
                <div className="flex justify-center mb-2">
                  {status === 'healthy' ? <Wifi className="h-6 w-6 text-green-500" /> :
                   status === 'critical' ? <WifiOff className="h-6 w-6 text-red-500" /> :
                   <Activity className="h-6 w-6 text-yellow-500" />}
                </div>
                <p className="font-medium text-sm">{name}</p>
                <p className={`text-xs mt-1 ${status === 'healthy' ? 'text-green-600' : status === 'critical' ? 'text-red-600' : 'text-yellow-600'}`}>
                  {status}
                </p>
                {svc && Number(svc.open_alerts) > 0 && (
                  <p className="text-xs text-muted-foreground">{svc.open_alerts} open</p>
                )}
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* Alerts Table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <Bell className="h-4 w-4" />
            Alerts ({alerts.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Service</TableHead>
                <TableHead>Severity</TableHead>
                <TableHead>Alert Type</TableHead>
                <TableHead>Message</TableHead>
                <TableHead>Error Rate</TableHead>
                <TableHead>P99 Latency</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Time</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {alerts.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={9} className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No alerts matching current filters
                  </TableCell>
                </TableRow>
              ) : alerts.map((alert: any) => (
                <TableRow key={alert.id}>
                  <TableCell>
                    <Badge variant="outline">{alert.service_name}</Badge>
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs font-medium border ${SEVERITY_COLORS[alert.severity] ?? ''}`}>
                      {alert.severity}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{alert.alert_type}</TableCell>
                  <TableCell className="text-sm max-w-xs truncate">{alert.message}</TableCell>
                  <TableCell>
                    {alert.error_rate != null ? (
                      <span className={`text-sm font-medium ${Number(alert.error_rate) > 5 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {Number(alert.error_rate).toFixed(1)}%
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    {alert.latency_p99_ms != null ? (
                      <span className={`text-sm font-medium ${Number(alert.latency_p99_ms) > 1000 ? 'text-red-600' : 'text-yellow-600'}`}>
                        {alert.latency_p99_ms}ms
                      </span>
                    ) : '—'}
                  </TableCell>
                  <TableCell>
                    <span className={`px-2 py-1 rounded-full text-xs ${STATUS_COLORS[alert.status] ?? ''}`}>
                      {alert.status}
                    </span>
                  </TableCell>
                  <TableCell className="text-xs text-muted-foreground">
                    <div className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(alert.created_at).toLocaleString()}
                    </div>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      {alert.status === 'open' && (
                        <Button size="sm" variant="outline" onClick={() => acknowledge.mutate({ id: alert.id, userId: 1 })}>
                          Ack
                        </Button>
                      )}
                      {alert.status !== 'resolved' && (
                        <Button size="sm" variant="outline" className="text-green-600" onClick={() => resolve.mutate({ id: alert.id })}>
                          Resolve
                        </Button>
                      )}
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
