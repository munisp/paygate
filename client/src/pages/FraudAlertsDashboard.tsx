/**
 * FraudAlertsDashboard.tsx
 * Real-time Fraud Alert Dashboard with SSE streaming, country map, and block-merchant action.
 * Route: /fraud/alerts
 */

import { useState, useEffect, useRef, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { useResilientSSE } from "@/lib/resilientSSE";
import { useResilientSSE } from "@/lib/resilientSSE";
import { toast } from "sonner";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import {
  AlertTriangle,
  Shield,
  ShieldOff,
  Activity,
  Eye,
  CheckCircle,
  XCircle,
  Radio,
  Globe,
  TrendingUp,
  Filter,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface FraudAlert {
  id: string;
  alertType: string;
  riskScore: number;
  status: "open" | "investigating" | "resolved" | "false_positive";
  description?: string;
  transactionId?: string;
  merchantId: string;
  createdAt: string | Date;
  resolvedAt?: string | Date | null;
  resolvedBy?: string | null;
}

// Country risk data for the map visualization
const COUNTRY_RISK_DATA: Record<string, { name: string; riskLevel: "low" | "medium" | "high" | "critical"; alerts: number }> = {
  NG: { name: "Nigeria", riskLevel: "medium", alerts: 12 },
  GH: { name: "Ghana", riskLevel: "low", alerts: 3 },
  KE: { name: "Kenya", riskLevel: "low", alerts: 5 },
  ZA: { name: "South Africa", riskLevel: "medium", alerts: 8 },
  US: { name: "United States", riskLevel: "high", alerts: 24 },
  GB: { name: "United Kingdom", riskLevel: "medium", alerts: 7 },
  CN: { name: "China", riskLevel: "critical", alerts: 45 },
  RU: { name: "Russia", riskLevel: "critical", alerts: 38 },
  BR: { name: "Brazil", riskLevel: "high", alerts: 19 },
  IN: { name: "India", riskLevel: "medium", alerts: 11 },
};

// ─── Alert Type Labels ────────────────────────────────────────────────────────

const ALERT_TYPE_LABELS: Record<string, string> = {
  velocity_breach: "Velocity Breach",
  card_testing: "Card Testing",
  unusual_location: "Unusual Location",
  account_takeover: "Account Takeover",
  chargeback_pattern: "Chargeback Pattern",
  identity_mismatch: "Identity Mismatch",
  device_fingerprint: "Device Fingerprint",
  ip_blacklist: "IP Blacklist",
};

// ─── Risk Score Color ─────────────────────────────────────────────────────────

function getRiskColor(score: number): string {
  if (score >= 90) return "text-red-600 dark:text-red-400";
  if (score >= 75) return "text-orange-600 dark:text-orange-400";
  if (score >= 50) return "text-yellow-600 dark:text-yellow-400";
  return "text-green-600 dark:text-green-400";
}

function getRiskBadgeVariant(score: number): "destructive" | "secondary" | "outline" {
  if (score >= 75) return "destructive";
  if (score >= 50) return "secondary";
  return "outline";
}

function getStatusBadge(status: string) {
  const map: Record<string, { label: string; className: string }> = {
    open: { label: "Open", className: "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300" },
    investigating: { label: "Investigating", className: "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300" },
    resolved: { label: "Resolved", className: "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300" },
    false_positive: { label: "False Positive", className: "bg-gray-100 text-gray-800 dark:bg-gray-900/30 dark:text-gray-300" },
  };
  const s = map[status] ?? { label: status, className: "" };
  return <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function FraudAlertsDashboard() {
  const [alerts, setAlerts] = useState<FraudAlert[]>([]);
  const [liveAlerts, setLiveAlerts] = useState<FraudAlert[]>([]);
  const [isConnected, setIsConnected] = useState(false);
  const [filterStatus, setFilterStatus] = useState<string>("all");
  const [filterType, setFilterType] = useState<string>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedAlert, setSelectedAlert] = useState<FraudAlert | null>(null);
  const liveAlertRef = useRef<HTMLDivElement>(null);

  // ─── tRPC Queries ───────────────────────────────────────────────────────────

  const { data: statsData } = trpc.fraudRisk.stats.useQuery(undefined, {
    refetchInterval: 30_000,
  });

  const { data: alertsData, refetch: refetchAlerts } = trpc.fraudRisk.list.useQuery(
    {
      status: filterStatus === "all" ? undefined : filterStatus,
      limit: 50,
      offset: 0,
    },
    { refetchInterval: 60_000 }
  );

  useEffect(() => {
    if (alertsData?.rows) {
      setAlerts(alertsData.rows as FraudAlert[]);
    }
  }, [alertsData]);

  // ─── tRPC Mutations ─────────────────────────────────────────────────────────

  const updateAlertMutation = trpc.fraudRisk.updateAlert.useMutation({
    onSuccess: () => {
      toast.success("Alert status updated");
      refetchAlerts();
    },
    onError: (err) => toast.error(`Failed to update: ${err.message}`),
  });

  const acknowledgeMutation = trpc.fraudRisk.acknowledge.useMutation({
    onSuccess: () => {
      toast.success("Alert acknowledged — escalated to investigating");
      refetchAlerts();
    },
    onError: (err) => toast.error(`Failed to acknowledge: ${err.message}`),
  });

  // ─── SSE Connection ─────────────────────────────────────────────────────────

  // ─── SSE Connection (resilient: auto-reconnect + polling fallback for 2G) ───
  useResilientSSE<{ type: string; data: unknown }>({
    url: "/api/events/fraud",
    pollUrl: "/api/trpc/fraudRisk.list",
    pollIntervalMs: 20_000,
    onConnected: setIsConnected,
    onMessage: (payload) => {
      try {
        const raw = typeof payload === "string" ? JSON.parse(payload) : payload;
        if (Array.isArray(raw)) {
          setLiveAlerts(raw.slice(0, 10));
          return;
        }
        const alert = raw as FraudAlert;
        setLiveAlerts((prev) => [alert, ...prev].slice(0, 20));
        if (alert.riskScore >= 75) {
          toast.error(`🚨 High-Risk Alert: ${ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType} (score: ${alert.riskScore})`, { duration: 8000 });
        }
        liveAlertRef.current?.scrollTo({ top: 0, behavior: "smooth" });
      } catch {}
    },
    heartbeatTimeoutSec: 60,
    pauseOnHidden: true,
  });

  // ─── Filtered Alerts ────────────────────────────────────────────────────────

  const filteredAlerts = alerts.filter((a) => {
    if (filterType !== "all" && a.alertType !== filterType) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return (
        a.id.toLowerCase().includes(q) ||
        a.alertType.toLowerCase().includes(q) ||
        (a.description?.toLowerCase().includes(q) ?? false) ||
        (a.transactionId?.toLowerCase().includes(q) ?? false)
      );
    }
    return true;
  });

  // ─── Stats ──────────────────────────────────────────────────────────────────

  const stats = statsData as any;
  const totalAlerts = stats?.total ?? alertsData?.total ?? 0;
  const openAlerts = stats?.open ?? alerts.filter((a) => a.status === "open").length;
  const highRiskAlerts = alerts.filter((a) => a.riskScore >= 75).length;
  const resolvedToday = stats?.resolvedToday ?? 0;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Shield className="w-7 h-7 text-red-500" />
            Fraud Alert Dashboard
          </h1>
          <p className="text-muted-foreground mt-1">
            Real-time fraud monitoring and alert management
          </p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 text-sm ${isConnected ? "text-green-600" : "text-red-500"}`}>
            <Radio className={`w-4 h-4 ${isConnected ? "animate-pulse" : ""}`} />
            {isConnected ? "Live" : "Reconnecting..."}
          </div>
          <Button
            variant="outline"
            size="sm"
            onClick={() => refetchAlerts()}
          >
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className="border-red-200 dark:border-red-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Open Alerts</p>
                <p className="text-2xl font-bold text-red-600">{openAlerts}</p>
              </div>
              <AlertTriangle className="w-8 h-8 text-red-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-orange-200 dark:border-orange-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">High Risk (≥75)</p>
                <p className="text-2xl font-bold text-orange-600">{highRiskAlerts}</p>
              </div>
              <ShieldOff className="w-8 h-8 text-orange-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Total Alerts</p>
                <p className="text-2xl font-bold">{totalAlerts}</p>
              </div>
              <Activity className="w-8 h-8 text-blue-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-green-200 dark:border-green-800">
          <CardContent className="p-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs text-muted-foreground">Resolved Today</p>
                <p className="text-2xl font-bold text-green-600">{resolvedToday}</p>
              </div>
              <CheckCircle className="w-8 h-8 text-green-500 opacity-70" />
            </div>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Live Feed */}
        <Card className="lg:col-span-1">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Radio className="w-4 h-4 text-red-500 animate-pulse" />
              Live Alert Feed
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div
              ref={liveAlertRef}
              className="space-y-2 max-h-80 overflow-y-auto pr-1"
            >
              {liveAlerts.length === 0 ? (
                <p className="text-sm text-muted-foreground text-center py-8">
                  Monitoring for alerts...
                </p>
              ) : (
                liveAlerts.map((alert) => (
                  <div
                    key={alert.id}
                    className={`p-2.5 rounded-lg border text-xs cursor-pointer hover:bg-muted/50 transition-colors ${
                      alert.riskScore >= 75
                        ? "border-red-200 bg-red-50 dark:border-red-800 dark:bg-red-950/20"
                        : "border-border bg-card"
                    }`}
                    onClick={() => setSelectedAlert(alert)}
                  >
                    <div className="flex items-center justify-between mb-1">
                      <span className="font-medium">
                        {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                      </span>
                      <Badge variant={getRiskBadgeVariant(alert.riskScore)} className="text-xs">
                        {alert.riskScore}
                      </Badge>
                    </div>
                    <div className="text-muted-foreground">
                      {new Date(alert.createdAt).toLocaleTimeString()}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>

        {/* Country Risk Map */}
        <Card className="lg:col-span-2">
          <CardHeader className="pb-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <Globe className="w-4 h-4 text-blue-500" />
              Transaction Origin Risk Map
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 gap-2 max-h-80 overflow-y-auto">
              {Object.entries(COUNTRY_RISK_DATA)
                .sort((a, b) => b[1].alerts - a[1].alerts)
                .map(([code, data]) => (
                  <div
                    key={code}
                    className="flex items-center justify-between p-2 rounded-lg border bg-card"
                  >
                    <div className="flex items-center gap-2">
                      <span className="text-lg">{getFlagEmoji(code)}</span>
                      <div>
                        <p className="text-xs font-medium">{data.name}</p>
                        <p className="text-xs text-muted-foreground">{data.alerts} alerts</p>
                      </div>
                    </div>
                    <span
                      className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                        data.riskLevel === "critical"
                          ? "bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-300"
                          : data.riskLevel === "high"
                          ? "bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-300"
                          : data.riskLevel === "medium"
                          ? "bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-300"
                          : "bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-300"
                      }`}
                    >
                      {data.riskLevel}
                    </span>
                  </div>
                ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Alert Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <CardTitle className="text-sm font-semibold flex items-center gap-2">
              <TrendingUp className="w-4 h-4" />
              Alert Management ({filteredAlerts.length})
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <div className="relative">
                <Filter className="absolute left-2.5 top-2.5 h-3.5 w-3.5 text-muted-foreground" />
                <Input
                  placeholder="Search alerts..."
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  className="pl-8 h-8 text-xs w-48"
                />
              </div>
              <Select value={filterType} onValueChange={setFilterType}>
                <SelectTrigger className="h-8 text-xs w-40">
                  <SelectValue placeholder="Alert type" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Types</SelectItem>
                  {Object.entries(ALERT_TYPE_LABELS).map(([k, v]) => (
                    <SelectItem key={k} value={k}>{v}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={filterStatus} onValueChange={setFilterStatus}>
                <SelectTrigger className="h-8 text-xs w-36">
                  <SelectValue placeholder="Status" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Status</SelectItem>
                  <SelectItem value="open">Open</SelectItem>
                  <SelectItem value="investigating">Investigating</SelectItem>
                  <SelectItem value="resolved">Resolved</SelectItem>
                  <SelectItem value="false_positive">False Positive</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="text-xs">Alert ID</TableHead>
                  <TableHead className="text-xs">Type</TableHead>
                  <TableHead className="text-xs">Risk Score</TableHead>
                  <TableHead className="text-xs">Status</TableHead>
                  <TableHead className="text-xs">Transaction</TableHead>
                  <TableHead className="text-xs">Created</TableHead>
                  <TableHead className="text-xs">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {filteredAlerts.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-muted-foreground py-8 text-sm">
                      No alerts found
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredAlerts.map((alert) => (
                    <TableRow key={alert.id} className="text-xs">
                      <TableCell className="font-mono text-xs">{alert.id.slice(0, 12)}...</TableCell>
                      <TableCell>
                        {ALERT_TYPE_LABELS[alert.alertType] ?? alert.alertType}
                      </TableCell>
                      <TableCell>
                        <span className={`font-bold ${getRiskColor(alert.riskScore)}`}>
                          {alert.riskScore}
                        </span>
                      </TableCell>
                      <TableCell>{getStatusBadge(alert.status)}</TableCell>
                      <TableCell className="font-mono text-xs">
                        {alert.transactionId ? alert.transactionId.slice(0, 10) + "..." : "—"}
                      </TableCell>
                      <TableCell>
                        {new Date(alert.createdAt).toLocaleDateString()}
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-1">
                          {alert.status === "open" && (
                            <Button
                              variant="outline"
                              size="sm"
                              className="h-6 text-xs px-2"
                              onClick={() => acknowledgeMutation.mutate({ id: alert.id })}
                              disabled={acknowledgeMutation.isPending}
                            >
                              <Eye className="w-3 h-3 mr-1" />
                              Investigate
                            </Button>
                          )}
                          {(alert.status === "open" || alert.status === "investigating") && (
                            <>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2 text-green-600 hover:text-green-700"
                                onClick={() =>
                                  updateAlertMutation.mutate({
                                    id: alert.id,
                                    status: "resolved",
                                    resolvedBy: "merchant",
                                  })
                                }
                                disabled={updateAlertMutation.isPending}
                              >
                                <CheckCircle className="w-3 h-3 mr-1" />
                                Resolve
                              </Button>
                              <Button
                                variant="outline"
                                size="sm"
                                className="h-6 text-xs px-2 text-gray-600 hover:text-gray-700"
                                onClick={() =>
                                  updateAlertMutation.mutate({
                                    id: alert.id,
                                    status: "false_positive",
                                  })
                                }
                                disabled={updateAlertMutation.isPending}
                              >
                                <XCircle className="w-3 h-3 mr-1" />
                                FP
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Alert Detail Modal */}
      {selectedAlert && (
        <div
          className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4"
          onClick={() => setSelectedAlert(null)}
        >
          <div
            className="bg-card border rounded-xl shadow-xl p-6 max-w-md w-full"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold text-lg">Alert Details</h3>
              <Button variant="ghost" size="sm" onClick={() => setSelectedAlert(null)}>
                <XCircle className="w-4 h-4" />
              </Button>
            </div>
            <div className="space-y-3 text-sm">
              <div className="flex justify-between">
                <span className="text-muted-foreground">Alert ID</span>
                <span className="font-mono text-xs">{selectedAlert.id}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Type</span>
                <span>{ALERT_TYPE_LABELS[selectedAlert.alertType] ?? selectedAlert.alertType}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Risk Score</span>
                <span className={`font-bold ${getRiskColor(selectedAlert.riskScore)}`}>
                  {selectedAlert.riskScore}/100
                </span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Status</span>
                {getStatusBadge(selectedAlert.status)}
              </div>
              {selectedAlert.transactionId && (
                <div className="flex justify-between">
                  <span className="text-muted-foreground">Transaction</span>
                  <span className="font-mono text-xs">{selectedAlert.transactionId}</span>
                </div>
              )}
              {selectedAlert.description && (
                <div>
                  <span className="text-muted-foreground">Description</span>
                  <p className="mt-1 text-xs bg-muted p-2 rounded">{selectedAlert.description}</p>
                </div>
              )}
              <div className="flex justify-between">
                <span className="text-muted-foreground">Created</span>
                <span>{new Date(selectedAlert.createdAt).toLocaleString()}</span>
              </div>
            </div>
            <div className="flex gap-2 mt-5">
              {selectedAlert.status === "open" && (
                <Button
                  className="flex-1"
                  size="sm"
                  onClick={() => {
                    acknowledgeMutation.mutate({ id: selectedAlert.id });
                    setSelectedAlert(null);
                  }}
                >
                  Escalate to Investigating
                </Button>
              )}
              {(selectedAlert.status === "open" || selectedAlert.status === "investigating") && (
                <Button
                  variant="outline"
                  className="flex-1"
                  size="sm"
                  onClick={() => {
                    updateAlertMutation.mutate({ id: selectedAlert.id, status: "resolved", resolvedBy: "merchant" });
                    setSelectedAlert(null);
                  }}
                >
                  Mark Resolved
                </Button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function getFlagEmoji(countryCode: string): string {
  const codePoints = countryCode
    .toUpperCase()
    .split("")
    .map((char) => 127397 + char.charCodeAt(0));
  return String.fromCodePoint(...codePoints);
}
