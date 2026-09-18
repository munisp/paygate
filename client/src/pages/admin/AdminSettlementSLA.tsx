// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle, RefreshCw, Bell, XCircle } from "lucide-react";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    on_track: { variant: "default", label: "On Track" },
    at_risk: { variant: "secondary", label: "At Risk" },
    breached: { variant: "destructive", label: "Breached" },
    completed: { variant: "outline", label: "Completed" },
    pending: { variant: "secondary", label: "Pending" },
    processing: { variant: "default", label: "Processing" },
    failed: { variant: "destructive", label: "Failed" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export default function AdminSettlementSLA() {
  const [activeTab, setActiveTab] = useState("dashboard");
  const utils = trpc.useUtils();

  // Real tRPC data only — no static fallbacks anywhere on this page.
  const { data: slaData, isLoading: slaLoading, isError: slaError, error: slaErrorObj, refetch: refetchSla } = trpc.adminSlaMonitor.getBreachMetrics.useQuery();
  const liveMetrics = slaData?.metrics;
  const liveBreaches = slaData?.breachedSettlements ?? [];

  const { data: pendingData, isLoading: pendingLoading, isError: pendingError, error: pendingErrorObj, refetch: refetchPending } =
    trpc.admin.settlements.listAll.useQuery({ page: 1, limit: 50, status: "pending" });
  const pendingSettlements = pendingData?.settlements ?? [];

  const sendAlertsMutation = trpc.adminSlaMonitor.sendBreachAlerts.useMutation({
    onSuccess: (data) => {
      toast.success(`Breach alerts sent to compliance team (${data.alertsSent} alert${data.alertsSent !== 1 ? 's' : ''})`);
      refetchSla();
    },
    onError: (err) => toast.error(`Failed to send alerts: ${err.message}`),
  });
  const triggerSettlementMutation = trpc.adminSlaMonitor.triggerManualSettlement.useMutation({
    onSuccess: (data) => {
      toast.success(`Manual settlement run triggered${data.fallback ? ' (queued — bridge offline)' : ''} · Run ID: ${data.runId}`);
      refetchSla();
      refetchPending();
    },
    onError: (err) => toast.error(`Failed to trigger settlement: ${err.message}`),
  });
  const forceSettleMutation = trpc.admin.settlements.forceSettle.useMutation({
    onSuccess: (data) => {
      toast.success(`Settlement ${data.settlementId} moved to processing`);
      utils.admin.settlements.listAll.invalidate();
      refetchSla();
    },
    onError: (err) => toast.error(`Force settle failed: ${err.message}`),
  });

  const formatNGN = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

  const hoursRemaining = (deadline: any) => {
    if (!deadline) return null;
    const ms = new Date(deadline).getTime() - Date.now();
    return ms / 3600000;
  };

  // Real alerts: derived from actual breached settlements + at-risk pending settlements
  const alerts = [
    ...liveBreaches.map((s: any) => ({
      id: `breach-${s.id}`,
      title: `Settlement ${s.id}`,
      message: `SLA breached — settlement of ${formatNGN(Number(s.amount ?? 0))} ${s.currency ?? ""} is overdue${s.sla_deadline ? ` (deadline ${new Date(s.sla_deadline).toLocaleString()})` : ""}`,
      severity: "critical" as const,
      time: s.created_at ? new Date(s.created_at).toLocaleString() : "",
    })),
    ...pendingSettlements
      .filter((s: any) => { const h = hoursRemaining(s.slaDeadlineAt); return h !== null && h < 3 && !s.slaBreachedAt; })
      .map((s: any) => ({
        id: `risk-${s.id}`,
        title: `Settlement ${s.reference ?? s.id}`,
        message: `SLA deadline approaching — ${formatNGN(Number(s.amount ?? 0))} ${s.currency ?? ""} due ${new Date(s.slaDeadlineAt).toLocaleString()}`,
        severity: "warning" as const,
        time: "",
      })),
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Settlement SLA Dashboard</h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time SLA compliance monitoring · T+0 / T+1 / T+2 / T+5 tiers</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => sendAlertsMutation.mutate()} disabled={sendAlertsMutation.isPending}>
            <Bell className="w-4 h-4 mr-2" />{sendAlertsMutation.isPending ? "Sending…" : "Alert Compliance"}
          </Button>
          <Button size="sm" onClick={() => triggerSettlementMutation.mutate({})} disabled={triggerSettlementMutation.isPending}>
            <RefreshCw className="w-4 h-4 mr-2" />{triggerSettlementMutation.isPending ? "Running…" : "Force Settle"}
          </Button>
        </div>
      </div>

      {slaError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertTriangle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">SLA metrics unavailable</p>
            <p className="text-xs text-red-600 mt-0.5">{slaErrorObj?.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetchSla()}>Retry</Button>
        </div>
      )}

      {/* KPI Cards — "—" when metrics are unavailable, never a fabricated fallback */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Pending", value: slaLoading ? "…" : String(liveMetrics?.pendingCount ?? "—"), icon: CheckCircle, color: "text-green-500" },
          { label: "Breached", value: slaLoading ? "…" : String(liveMetrics?.breachedCount ?? "—"), icon: XCircle, color: "text-red-500" },
          { label: "Unalerted Breaches", value: slaLoading ? "…" : String(liveMetrics?.unalertedCount ?? "—"), icon: AlertTriangle, color: "text-amber-500" },
          { label: "Avg Settlement (hrs)", value: slaLoading ? "…" : liveMetrics ? `${liveMetrics.avgSettlementHours.toFixed(1)}h` : "—", icon: Clock, color: "text-indigo-500" },
        ].map(m => (
          <Card key={m.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <m.icon className={`w-8 h-8 ${m.color}`} />
                <div><p className="text-2xl font-bold">{m.value}</p><p className="text-xs text-muted-foreground">{m.label}</p></div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid grid-cols-4 w-full max-w-xl">
          <TabsTrigger value="dashboard">Dashboard</TabsTrigger>
          <TabsTrigger value="live">Live Breaches ({liveBreaches.length})</TabsTrigger>
          <TabsTrigger value="pending">Pending</TabsTrigger>
          <TabsTrigger value="alerts">Alerts ({alerts.length})</TabsTrigger>
        </TabsList>

        <TabsContent value="live" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center justify-between">
                Live SLA Breaches (DB)
                <Button variant="outline" size="sm" onClick={() => refetchSla()}><RefreshCw className="w-4 h-4 mr-1" />Refresh</Button>
              </CardTitle>
              <CardDescription>Real-time SLA breach data from the database</CardDescription>
            </CardHeader>
            <CardContent>
              {slaLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : slaError ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-red-400 opacity-60" />
                  <p className="font-medium">Breach data unavailable — retry above</p>
                </div>
              ) : liveBreaches.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p className="font-medium">No SLA breaches — all settlements on track</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Settlement ID</TableHead>
                      <TableHead>Merchant ID</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>Currency</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>SLA Deadline</TableHead>
                      <TableHead>Created</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {liveBreaches.map((s: any) => (
                      <TableRow key={s.id} className="bg-red-50 dark:bg-red-950/20">
                        <TableCell className="font-mono text-xs">{s.id}</TableCell>
                        <TableCell className="text-xs">{s.merchant_id}</TableCell>
                        <TableCell className="font-semibold">{formatNGN(Number(s.amount))}</TableCell>
                        <TableCell>{s.currency}</TableCell>
                        <TableCell><StatusBadge status={s.status} /></TableCell>
                        <TableCell className="text-xs">{s.sla_deadline ? new Date(s.sla_deadline).toLocaleString() : "N/A"}</TableCell>
                        <TableCell className="text-xs">{s.created_at ? new Date(s.created_at).toLocaleString() : "N/A"}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="dashboard" className="mt-4 space-y-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Settlement Pipeline (real metrics)</CardTitle>
              <CardDescription>Aggregated from the settlements table — per-tier compliance breakdown is not yet instrumented</CardDescription>
            </CardHeader>
            <CardContent>
              {slaLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : !liveMetrics ? (
                <div className="text-center py-8 text-muted-foreground">
                  <AlertTriangle className="w-12 h-12 mx-auto mb-2 text-amber-400 opacity-60" />
                  <p className="font-medium">Metrics unavailable</p>
                </div>
              ) : (
                <div className="grid grid-cols-2 lg:grid-cols-3 gap-4">
                  {[
                    { label: "Pending Settlements", value: liveMetrics.pendingCount },
                    { label: "Processing", value: liveMetrics.processingCount },
                    { label: "Completed", value: liveMetrics.completedCount },
                    { label: "SLA Breached", value: liveMetrics.breachedCount },
                    { label: "Avg Settlement Time", value: `${liveMetrics.avgSettlementHours.toFixed(1)}h` },
                    { label: "Oldest Pending", value: `${liveMetrics.oldestPendingHours.toFixed(1)}h` },
                  ].map(m => (
                    <div key={m.label} className="bg-muted/40 rounded-lg p-4">
                      <p className="text-xs text-muted-foreground">{m.label}</p>
                      <p className="text-xl font-bold">{m.value}</p>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pending Settlements (DB)</CardTitle>
              <CardDescription>Real pending settlements sorted by SLA deadline — red = overdue, amber = under 3h remaining</CardDescription>
            </CardHeader>
            <CardContent>
              {pendingLoading ? (
                <div className="flex items-center justify-center h-32"><RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" /></div>
              ) : pendingError ? (
                <div className="text-center py-8 space-y-3">
                  <AlertTriangle className="w-12 h-12 mx-auto text-red-400 opacity-60" />
                  <p className="font-medium text-muted-foreground">Could not load pending settlements — {pendingErrorObj?.message}</p>
                  <Button size="sm" variant="outline" onClick={() => refetchPending()}>Retry</Button>
                </div>
              ) : pendingSettlements.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p className="font-medium">No pending settlements</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Reference</TableHead>
                      <TableHead>Merchant</TableHead>
                      <TableHead>Amount</TableHead>
                      <TableHead>SLA Deadline</TableHead>
                      <TableHead>Time Remaining</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...pendingSettlements]
                      .sort((a: any, b: any) => new Date(a.slaDeadlineAt ?? 0).getTime() - new Date(b.slaDeadlineAt ?? 0).getTime())
                      .map((s: any) => {
                        const h = hoursRemaining(s.slaDeadlineAt);
                        const overdue = h !== null && h < 0;
                        const atRisk = h !== null && h >= 0 && h < 3;
                        return (
                          <TableRow key={s.id} className={overdue ? "bg-red-50 dark:bg-red-950/20" : atRisk ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                            <TableCell className="font-mono text-xs">{s.reference ?? s.id}</TableCell>
                            <TableCell className="font-medium text-xs">{s.merchantId}</TableCell>
                            <TableCell className="font-semibold">{formatNGN(Number(s.amount ?? 0))}</TableCell>
                            <TableCell className="text-xs">{s.slaDeadlineAt ? new Date(s.slaDeadlineAt).toLocaleString() : "—"}</TableCell>
                            <TableCell>
                              {h === null ? <span className="text-xs text-muted-foreground">—</span> : (
                                <span className={`font-semibold text-sm ${overdue ? "text-red-600" : atRisk ? "text-amber-600" : "text-green-600"}`}>
                                  {overdue ? `${Math.abs(h).toFixed(1)}h overdue` : `${h.toFixed(1)}h left`}
                                </span>
                              )}
                            </TableCell>
                            <TableCell><StatusBadge status={s.status} /></TableCell>
                            <TableCell>
                              <Button size="sm" variant={overdue ? "destructive" : "outline"}
                                disabled={forceSettleMutation.isPending}
                                onClick={() => forceSettleMutation.mutate({ settlementId: s.id })}>
                                Settle Now
                              </Button>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">SLA Alerts</CardTitle>
              <CardDescription>Derived from real breached and at-risk settlements</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {alerts.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">
                  <CheckCircle className="w-12 h-12 mx-auto mb-2 text-green-500 opacity-50" />
                  <p className="font-medium">No active SLA alerts</p>
                </div>
              ) : alerts.map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === "critical" ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                  "border-amber-200 bg-amber-50 dark:bg-amber-950/20"
                }`}>
                  {alert.severity === "critical"
                    ? <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" />
                    : <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{alert.title}</p>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  {alert.time && <span className="text-xs text-muted-foreground">{alert.time}</span>}
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
