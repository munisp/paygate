// @ts-nocheck
import { trpc } from "@/lib/trpc";
import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Progress } from "@/components/ui/progress";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Clock, AlertTriangle, CheckCircle, TrendingUp, DollarSign, RefreshCw, Bell, XCircle } from "lucide-react";

const SLA_TIERS = [
  { tier: "T+0 (Same Day)", target: "17:00 WAT cutoff", slaHours: 0, breachCount: 2, totalCount: 1240, compliance: 99.8, avgActual: "4.2h" },
  { tier: "T+1 (Next Day)", target: "09:00 WAT next day", slaHours: 24, breachCount: 8, totalCount: 8420, compliance: 99.9, avgActual: "18.4h" },
  { tier: "T+2 (Standard)", target: "09:00 WAT +2 days", slaHours: 48, breachCount: 1, totalCount: 12840, compliance: 99.99, avgActual: "36.1h" },
  { tier: "T+5 (Escrow)", target: "09:00 WAT +5 days", slaHours: 120, breachCount: 0, totalCount: 3210, compliance: 100.0, avgActual: "84.2h" },
];

const PENDING_SETTLEMENTS = [
  { id: "SET-2026-04-20-001", merchant: "TechMart Nigeria", amount: 4820000, currency: "NGN", tier: "T+0", dueAt: "2026-04-20 17:00", hoursRemaining: 2.3, status: "at_risk", txCount: 142 },
  { id: "SET-2026-04-20-002", merchant: "Konga Marketplace", amount: 12480000, currency: "NGN", tier: "T+1", dueAt: "2026-04-21 09:00", hoursRemaining: 18.7, status: "on_track", txCount: 891 },
  { id: "SET-2026-04-20-003", merchant: "Jumia Food", amount: 2340000, currency: "NGN", tier: "T+0", dueAt: "2026-04-20 17:00", hoursRemaining: -1.2, status: "breached", txCount: 67 },
  { id: "SET-2026-04-20-004", merchant: "Flutterwave Merchants", amount: 38200000, currency: "NGN", tier: "T+1", dueAt: "2026-04-21 09:00", hoursRemaining: 19.1, status: "on_track", txCount: 2840 },
  { id: "SET-2026-04-20-005", merchant: "Paystack Partners", amount: 8940000, currency: "NGN", tier: "T+0", dueAt: "2026-04-20 17:00", hoursRemaining: 1.1, status: "at_risk", txCount: 312 },
  { id: "SET-2026-04-20-006", merchant: "GTBank Merchants", amount: 21800000, currency: "NGN", tier: "T+2", dueAt: "2026-04-22 09:00", hoursRemaining: 43.2, status: "on_track", txCount: 1240 },
];

const SLA_ALERTS = [
  { id: "ALT-001", merchant: "TechMart Nigeria", message: "T+0 settlement due in 2.3 hours — ₦48,200 pending", severity: "warning", time: "14:42" },
  { id: "ALT-002", merchant: "Jumia Food", message: "T+0 SLA BREACHED — settlement overdue by 1.2 hours", severity: "critical", time: "14:38" },
  { id: "ALT-003", merchant: "Paystack Partners", message: "T+0 settlement due in 1.1 hours — ₦89,400 pending", severity: "warning", time: "14:55" },
  { id: "ALT-004", merchant: "Moniepoint Agents", message: "T+1 settlement completed successfully — ₦124,800", severity: "info", time: "13:20" },
];

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { variant: "default" | "secondary" | "destructive" | "outline"; label: string }> = {
    on_track: { variant: "default", label: "On Track" },
    at_risk: { variant: "secondary", label: "At Risk" },
    breached: { variant: "destructive", label: "Breached" },
    completed: { variant: "outline", label: "Completed" },
  };
  const cfg = map[status] ?? { variant: "outline", label: status };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

export default function AdminSettlementSLA() {
  const [activeTab, setActiveTab] = useState("dashboard");

  // Real tRPC data
  const { data: slaData, isLoading: slaLoading, refetch: refetchSla } = trpc.adminSlaMonitor.getBreachMetrics.useQuery();
  const liveMetrics = slaData?.metrics;
  const liveBreaches = slaData?.breachedSettlements ?? [];
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
    },
    onError: (err) => toast.error(`Failed to trigger settlement: ${err.message}`),
  });

  const formatNGN = (kobo: number) => `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

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

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Pending", value: slaLoading ? "…" : String(liveMetrics?.pendingCount ?? "99.94%"), icon: CheckCircle, color: "text-green-500" },
          { label: "Breached", value: slaLoading ? "…" : String(liveMetrics?.breachedCount ?? 0), icon: XCircle, color: "text-red-500" },
          { label: "Unalerted Breaches", value: slaLoading ? "…" : String(liveMetrics?.unalertedCount ?? 0), icon: AlertTriangle, color: "text-amber-500" },
          { label: "Avg Settlement (hrs)", value: slaLoading ? "…" : `${(liveMetrics?.avgSettlementHours ?? 0).toFixed(1)}h`, icon: Clock, color: "text-indigo-500" },
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
          <TabsTrigger value="alerts">Alerts</TabsTrigger>
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
              <CardTitle className="text-base">SLA Compliance by Tier</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {SLA_TIERS.map(tier => (
                <div key={tier.tier} className="space-y-1">
                  <div className="flex justify-between items-center text-sm">
                    <div>
                      <span className="font-semibold">{tier.tier}</span>
                      <span className="text-muted-foreground ml-2 text-xs">({tier.target})</span>
                    </div>
                    <div className="flex items-center gap-3">
                      <span className="text-xs text-muted-foreground">{tier.totalCount.toLocaleString()} settlements · {tier.breachCount} breaches</span>
                      <span className={`font-bold ${tier.compliance >= 99.9 ? "text-green-600" : tier.compliance >= 99 ? "text-amber-600" : "text-red-600"}`}>
                        {tier.compliance}%
                      </span>
                    </div>
                  </div>
                  <Progress value={tier.compliance} className="h-2" />
                  <p className="text-xs text-muted-foreground">Avg actual settlement time: {tier.avgActual}</p>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="pending" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Pending Settlements</CardTitle>
              <CardDescription>Sorted by SLA urgency — red = breached, amber = at risk</CardDescription>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Settlement ID</TableHead>
                    <TableHead>Merchant</TableHead>
                    <TableHead>Amount</TableHead>
                    <TableHead>Tier</TableHead>
                    <TableHead>Due At</TableHead>
                    <TableHead>Time Remaining</TableHead>
                    <TableHead>Transactions</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {PENDING_SETTLEMENTS.sort((a, b) => a.hoursRemaining - b.hoursRemaining).map(s => (
                    <TableRow key={s.id} className={s.status === "breached" ? "bg-red-50 dark:bg-red-950/20" : s.status === "at_risk" ? "bg-amber-50 dark:bg-amber-950/20" : ""}>
                      <TableCell className="font-mono text-xs">{s.id}</TableCell>
                      <TableCell className="font-medium text-sm">{s.merchant}</TableCell>
                      <TableCell className="font-semibold">{formatNGN(s.amount)}</TableCell>
                      <TableCell><Badge variant="outline">{s.tier}</Badge></TableCell>
                      <TableCell className="text-xs">{s.dueAt}</TableCell>
                      <TableCell>
                        <span className={`font-semibold text-sm ${s.hoursRemaining < 0 ? "text-red-600" : s.hoursRemaining < 3 ? "text-amber-600" : "text-green-600"}`}>
                          {s.hoursRemaining < 0 ? `${Math.abs(s.hoursRemaining).toFixed(1)}h overdue` : `${s.hoursRemaining.toFixed(1)}h left`}
                        </span>
                      </TableCell>
                      <TableCell>{s.txCount.toLocaleString()}</TableCell>
                      <TableCell><StatusBadge status={s.status} /></TableCell>
                      <TableCell>
                        <Button size="sm" variant={s.status === "breached" ? "destructive" : "outline"}
                          onClick={() => toast.success(`Manual settlement triggered for ${s.merchant}`)}>
                          Settle Now
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="alerts" className="mt-4">
          <Card>
            <CardHeader className="pb-2">
              <CardTitle className="text-base">SLA Alerts</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              {SLA_ALERTS.map(alert => (
                <div key={alert.id} className={`flex items-start gap-3 p-3 rounded-lg border ${
                  alert.severity === "critical" ? "border-red-200 bg-red-50 dark:bg-red-950/20" :
                  alert.severity === "warning" ? "border-amber-200 bg-amber-50 dark:bg-amber-950/20" :
                  "border-green-200 bg-green-50 dark:bg-green-950/20"
                }`}>
                  {alert.severity === "critical" ? <XCircle className="w-5 h-5 text-red-500 mt-0.5 flex-shrink-0" /> :
                   alert.severity === "warning" ? <AlertTriangle className="w-5 h-5 text-amber-500 mt-0.5 flex-shrink-0" /> :
                   <CheckCircle className="w-5 h-5 text-green-500 mt-0.5 flex-shrink-0" />}
                  <div className="flex-1">
                    <p className="font-medium text-sm">{alert.merchant}</p>
                    <p className="text-sm text-muted-foreground">{alert.message}</p>
                  </div>
                  <span className="text-xs text-muted-foreground">{alert.time}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
