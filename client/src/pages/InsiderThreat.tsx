import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Switch } from "@/components/ui/switch";
import { toast } from "sonner";
import {
  ShieldAlert, AlertTriangle, CheckCircle, XCircle, Clock, Eye,
  Lock, Unlock, Users, Activity, Settings, RefreshCw, Shield,
  TrendingUp, AlertOctagon, UserCheck, Ban
} from "lucide-react";

const MERCHANT_ID = "default";

const riskBadge = (level: string) => {
  const map: Record<string, string> = {
    critical: "bg-red-600 text-white",
    high: "bg-orange-500 text-white",
    medium: "bg-yellow-500 text-black",
    low: "bg-green-500 text-white",
  };
  return map[level] ?? "bg-gray-400 text-white";
};

const verdictIcon = (verdict: string) => {
  if (verdict === "block") return <Ban className="w-4 h-4 text-red-500" />;
  if (verdict === "require_approval") return <Lock className="w-4 h-4 text-orange-500" />;
  if (verdict === "flag") return <AlertTriangle className="w-4 h-4 text-yellow-500" />;
  return <CheckCircle className="w-4 h-4 text-green-500" />;
};

function DashboardTab() {
  const { data, isLoading, refetch } = trpc.insiderThreat.getDashboardSummary.useQuery(
    { merchantId: MERCHANT_ID },
    { refetchInterval: 30_000 }
  );

  const stats = data ?? {
    totalAlerts: 0, openAlerts: 0, pendingApprovals: 0, activePolicies: 0,
    alertsByRiskLevel: { critical: 0, high: 0, medium: 0, low: 0 },
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold text-foreground">Threat Overview</h2>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-4 h-4 mr-2 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="border-red-200 bg-red-50 dark:bg-red-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertOctagon className="w-4 h-4 text-red-500" />
              <span className="text-xs text-muted-foreground">Critical</span>
            </div>
            <div className="text-2xl font-bold text-red-600">{stats.alertsByRiskLevel?.critical ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 bg-orange-50 dark:bg-orange-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <AlertTriangle className="w-4 h-4 text-orange-500" />
              <span className="text-xs text-muted-foreground">High</span>
            </div>
            <div className="text-2xl font-bold text-orange-600">{stats.alertsByRiskLevel?.high ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-blue-200 bg-blue-50 dark:bg-blue-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Clock className="w-4 h-4 text-blue-500" />
              <span className="text-xs text-muted-foreground">Pending Approvals</span>
            </div>
            <div className="text-2xl font-bold text-blue-600">{stats.pendingApprovals ?? 0}</div>
          </CardContent>
        </Card>
        <Card className="border-green-200 bg-green-50 dark:bg-green-950/20">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-1">
              <Shield className="w-4 h-4 text-green-500" />
              <span className="text-xs text-muted-foreground">Active Policies</span>
            </div>
            <div className="text-2xl font-bold text-green-600">{stats.activePolicies ?? 0}</div>
          </CardContent>
        </Card>
      </div>

      {/* Control matrix */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-sm font-semibold">Insider Threat Control Matrix</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {[
              { label: "Session Binding", desc: "Cryptographic device + IP binding per session", active: true, icon: Lock },
              { label: "Velocity Gating", desc: "Redis-backed rate limits on privileged actions", active: true, icon: Activity },
              { label: "4-Eyes Approval", desc: "Dual-control for high-risk operations", active: true, icon: Users },
              { label: "UEBA Scoring", desc: "ML-based behavioural baseline (Isolation Forest)", active: true, icon: TrendingUp },
              { label: "Rust Risk Engine", desc: "Real-time behavioural analytics at sub-ms latency", active: true, icon: ShieldAlert },
              { label: "Kafka Audit Trail", desc: "Immutable enriched audit events on every action", active: true, icon: Eye },
              { label: "Permify RBAC", desc: "Fine-grained resource-level access control", active: true, icon: UserCheck },
              { label: "Geo-IP Anomaly", desc: "Flag/block actions from new countries", active: true, icon: AlertTriangle },
            ].map(({ label, desc, active, icon: Icon }) => (
              <div key={label} className="flex items-start gap-3 p-3 rounded-lg border bg-muted/30">
                <div className={`mt-0.5 p-1.5 rounded-md ${active ? "bg-green-100 dark:bg-green-900/30" : "bg-gray-100"}`}>
                  <Icon className={`w-3.5 h-3.5 ${active ? "text-green-600" : "text-gray-400"}`} />
                </div>
                <div>
                  <div className="text-sm font-medium flex items-center gap-2">
                    {label}
                    <Badge variant="outline" className={`text-xs py-0 ${active ? "border-green-400 text-green-600" : "border-gray-300 text-gray-400"}`}>
                      {active ? "Active" : "Inactive"}
                    </Badge>
                  </div>
                  <div className="text-xs text-muted-foreground mt-0.5">{desc}</div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function AlertsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("open");
  const [riskFilter, setRiskFilter] = useState<string>("all");
  const { data, isLoading, refetch } = trpc.insiderThreat.listAlerts.useQuery({
    merchantId: MERCHANT_ID,
    status: statusFilter === "all" ? undefined : statusFilter as any,
    riskLevel: riskFilter === "all" ? undefined : riskFilter as any,
    limit: 50,
  });

  const resolveAlert = trpc.insiderThreat.resolveAlert.useMutation({
    onSuccess: () => { toast.success("Alert updated"); refetch(); },
    onError: () => toast.error("Failed to update alert"),
  });

  const alerts: any[] = data?.alerts ?? [];

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap gap-3 items-center justify-between">
        <div className="flex gap-2">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36 h-8 text-xs">
              <SelectValue placeholder="Status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All statuses</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="acknowledged">Acknowledged</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="false_positive">False Positive</SelectItem>
            </SelectContent>
          </Select>
          <Select value={riskFilter} onValueChange={setRiskFilter}>
            <SelectTrigger className="w-32 h-8 text-xs">
              <SelectValue placeholder="Risk" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All risks</SelectItem>
              <SelectItem value="critical">Critical</SelectItem>
              <SelectItem value="high">High</SelectItem>
              <SelectItem value="medium">Medium</SelectItem>
              <SelectItem value="low">Low</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading alerts…</div>
      ) : alerts.length === 0 ? (
        <div className="text-center py-12">
          <CheckCircle className="w-10 h-10 text-green-500 mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No alerts found for the selected filters.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {alerts.map((alert: any) => (
            <Card key={alert.id} className="border-l-4" style={{ borderLeftColor: alert.riskLevel === "critical" ? "#dc2626" : alert.riskLevel === "high" ? "#f97316" : alert.riskLevel === "medium" ? "#eab308" : "#22c55e" }}>
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-sm">{alert.action ?? "Unknown action"}</span>
                      <Badge className={`text-xs ${riskBadge(alert.riskLevel)}`}>{alert.riskLevel}</Badge>
                      <Badge variant="outline" className="text-xs">{alert.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Actor: <span className="font-mono">{alert.actorId ?? "—"}</span>
                      {alert.ipAddress && <> · IP: <span className="font-mono">{alert.ipAddress}</span></>}
                      {alert.geoCountry && <> · {alert.geoCountry}</>}
                    </div>
                    {alert.riskFactors?.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-2">
                        {alert.riskFactors.map((f: string) => (
                          <Badge key={f} variant="secondary" className="text-xs py-0">{f.replace(/_/g, " ")}</Badge>
                        ))}
                      </div>
                    )}
                    <div className="text-xs text-muted-foreground mt-1">
                      Score: <span className="font-semibold">{alert.riskScore ?? 0}</span>
                      {alert.createdAt && <> · {new Date(alert.createdAt).toLocaleString()}</>}
                    </div>
                  </div>
                  {alert.status === "open" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" variant="outline" className="h-7 text-xs"
                        onClick={() => resolveAlert.mutate({ id: alert.id, status: "acknowledged" })}>
                        <Eye className="w-3 h-3 mr-1" />Ack
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-green-600"
                        onClick={() => resolveAlert.mutate({ id: alert.id, status: "resolved" })}>
                        <CheckCircle className="w-3 h-3 mr-1" />Resolve
                      </Button>
                      <Button size="sm" variant="outline" className="h-7 text-xs text-gray-500"
                        onClick={() => resolveAlert.mutate({ id: alert.id, status: "false_positive" })}>
                        <XCircle className="w-3 h-3 mr-1" />FP
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function ApprovalsTab() {
  const [statusFilter, setStatusFilter] = useState<string>("pending");
  const { data, isLoading, refetch } = trpc.insiderThreat.listApprovals.useQuery({
    merchantId: MERCHANT_ID,
    status: statusFilter === "all" ? undefined : statusFilter as any,
  });

  const resolveApproval = trpc.insiderThreat.resolveApproval.useMutation({
    onSuccess: () => { toast.success("Approval decision recorded"); refetch(); },
    onError: () => toast.error("Failed to record decision"),
  });

  const approvals: any[] = data?.approvals ?? [];

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <Select value={statusFilter} onValueChange={setStatusFilter}>
          <SelectTrigger className="w-36 h-8 text-xs">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="approved">Approved</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="expired">Expired</SelectItem>
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${isLoading ? "animate-spin" : ""}`} />
          Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading approvals…</div>
      ) : approvals.length === 0 ? (
        <div className="text-center py-12">
          <Unlock className="w-10 h-10 text-muted-foreground mx-auto mb-3" />
          <p className="text-sm text-muted-foreground">No approval requests found.</p>
        </div>
      ) : (
        <div className="space-y-2">
          {approvals.map((req: any) => (
            <Card key={req.id} className="border">
              <CardContent className="p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <Lock className="w-4 h-4 text-orange-500 shrink-0" />
                      <span className="font-medium text-sm">{req.action ?? "Unknown action"}</span>
                      <Badge variant={req.status === "pending" ? "default" : "secondary"} className="text-xs">{req.status}</Badge>
                    </div>
                    <div className="text-xs text-muted-foreground mt-1">
                      Initiator: <span className="font-mono">{req.initiatorId ?? "—"}</span>
                      {req.resourceId && <> · Resource: <span className="font-mono">{req.resourceId}</span></>}
                    </div>
                    {req.expiresAt && (
                      <div className="text-xs text-muted-foreground mt-0.5">
                        Expires: {new Date(req.expiresAt).toLocaleString()}
                      </div>
                    )}
                  </div>
                  {req.status === "pending" && (
                    <div className="flex gap-1.5 shrink-0">
                      <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700"
                        onClick={() => resolveApproval.mutate({ id: req.id, decision: "approve" })}>
                        <CheckCircle className="w-3 h-3 mr-1" />Approve
                      </Button>
                      <Button size="sm" variant="destructive" className="h-7 text-xs"
                        onClick={() => resolveApproval.mutate({ id: req.id, decision: "reject" })}>
                        <XCircle className="w-3 h-3 mr-1" />Reject
                      </Button>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}

function PoliciesTab() {
  const { data, isLoading } = trpc.insiderThreat.listPolicies.useQuery({ merchantId: MERCHANT_ID });
  const upsertPolicy = trpc.insiderThreat.upsertPolicy.useMutation({
    onSuccess: () => toast.success("Policy updated"),
    onError: () => toast.error("Failed to update policy"),
  });

  const policies: any[] = data?.policies ?? [];

  const togglePolicy = (policy: any) => {
    upsertPolicy.mutate({
      merchantId: MERCHANT_ID,
      id: policy.id,
      name: policy.name,
      description: policy.description ?? "",
      severity: policy.severity,
      verdict: policy.verdict,
      enabled: !policy.enabled,
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          Configure insider threat detection policies. Changes take effect immediately.
        </p>
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground text-sm">Loading policies…</div>
      ) : (
        <div className="space-y-2">
          {policies.map((policy: any) => (
            <Card key={policy.id} className={`border transition-opacity ${policy.enabled ? "" : "opacity-60"}`}>
              <CardContent className="p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-start gap-3 flex-1 min-w-0">
                    <div className="mt-0.5">{verdictIcon(policy.verdict)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap">
                        <span className="font-medium text-sm">{policy.name}</span>
                        <Badge className={`text-xs ${riskBadge(policy.severity)}`}>{policy.severity}</Badge>
                        <Badge variant="outline" className="text-xs capitalize">{policy.verdict?.replace(/_/g, " ")}</Badge>
                      </div>
                      <p className="text-xs text-muted-foreground mt-0.5">{policy.description}</p>
                    </div>
                  </div>
                  <Switch
                    checked={policy.enabled}
                    onCheckedChange={() => togglePolicy(policy)}
                    disabled={upsertPolicy.isPending}
                  />
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      <Card className="border-dashed border-2 border-muted-foreground/30">
        <CardContent className="p-4 text-center">
          <Settings className="w-6 h-6 text-muted-foreground mx-auto mb-2" />
          <p className="text-sm text-muted-foreground">Custom policy builder — coming soon</p>
          <p className="text-xs text-muted-foreground mt-1">Define conditions using the Permify policy DSL</p>
        </CardContent>
      </Card>
    </div>
  );
}

export default function InsiderThreat() {
  const { user } = useAuth();

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ShieldAlert className="w-6 h-6 text-orange-500" />
            Insider Threat Prevention
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Real-time detection, dual-control approvals, and UEBA-powered risk scoring
          </p>
        </div>
        <Badge variant="outline" className="text-xs border-green-400 text-green-600 gap-1">
          <span className="w-1.5 h-1.5 rounded-full bg-green-500 inline-block" />
          All controls active
        </Badge>
      </div>

      {/* Architecture callout */}
      <Card className="bg-gradient-to-r from-slate-900 to-slate-800 text-white border-0">
        <CardContent className="p-4">
          <div className="flex flex-wrap gap-4 text-xs">
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-blue-400" />
              <span className="text-slate-300">Go Bridge</span>
              <span className="text-white font-medium">Session binding · Velocity gate · 4-eyes approval</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-orange-400" />
              <span className="text-slate-300">Rust Engine</span>
              <span className="text-white font-medium">Behavioural baseline · Real-time risk scoring</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-green-400" />
              <span className="text-slate-300">Python UEBA</span>
              <span className="text-white font-medium">Isolation Forest · Peer-group analysis</span>
            </div>
            <div className="flex items-center gap-1.5">
              <div className="w-2 h-2 rounded-full bg-purple-400" />
              <span className="text-slate-300">Kafka</span>
              <span className="text-white font-medium">Immutable enriched audit trail</span>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Tabs */}
      <Tabs defaultValue="dashboard">
        <TabsList className="grid grid-cols-4 w-full max-w-lg">
          <TabsTrigger value="dashboard" className="text-xs">Dashboard</TabsTrigger>
          <TabsTrigger value="alerts" className="text-xs">Alerts</TabsTrigger>
          <TabsTrigger value="approvals" className="text-xs">Approvals</TabsTrigger>
          <TabsTrigger value="policies" className="text-xs">Policies</TabsTrigger>
        </TabsList>

        <TabsContent value="dashboard" className="mt-4">
          <DashboardTab />
        </TabsContent>
        <TabsContent value="alerts" className="mt-4">
          <AlertsTab />
        </TabsContent>
        <TabsContent value="approvals" className="mt-4">
          <ApprovalsTab />
        </TabsContent>
        <TabsContent value="policies" className="mt-4">
          <PoliciesTab />
        </TabsContent>
      </Tabs>
    </div>
  );
}
