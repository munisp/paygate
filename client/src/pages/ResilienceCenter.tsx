import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import {
  Wifi, WifiOff, RefreshCw, Play, Pause, Trash2, RotateCcw,
  AlertTriangle, CheckCircle, Clock, Loader2, Activity,
  Radio, Zap, Server, ArrowUpDown, Filter
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    pending:   "bg-amber-500/10 text-amber-400 border-amber-500/20",
    syncing:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    synced:    "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed:    "bg-red-500/10 text-red-400 border-red-500/20",
    cancelled: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return <Badge className={`border text-xs ${map[status] ?? map.pending}`}>{status}</Badge>;
}

// ─── Priority badge ───────────────────────────────────────────────────────────
function PriorityBadge({ priority }: { priority: string }) {
  const map: Record<string, string> = {
    critical: "bg-red-500/10 text-red-400 border-red-500/20",
    high:     "bg-orange-500/10 text-orange-400 border-orange-500/20",
    normal:   "bg-blue-500/10 text-blue-400 border-blue-500/20",
    low:      "bg-zinc-500/10 text-zinc-400 border-zinc-500/20",
  };
  return <Badge className={`border text-xs ${map[priority] ?? map.normal}`}>{priority}</Badge>;
}

// ─── Transport badge ──────────────────────────────────────────────────────────
function TransportBadge({ transport }: { transport?: string }) {
  if (!transport) return null;
  const map: Record<string, { label: string; cls: string }> = {
    websocket:       { label: "WebSocket", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" },
    sse_fallback:    { label: "SSE Fallback", cls: "bg-amber-500/10 text-amber-400 border-amber-500/20" },
    polling_fallback:{ label: "Polling", cls: "bg-orange-500/10 text-orange-400 border-orange-500/20" },
    offline_queue:   { label: "Offline Queue", cls: "bg-red-500/10 text-red-400 border-red-500/20" },
  };
  const info = map[transport] ?? { label: transport, cls: "bg-zinc-500/10 text-zinc-400 border-zinc-500/20" };
  return <Badge className={`border text-xs ${info.cls}`}>{info.label}</Badge>;
}

// ─── Main Component ───────────────────────────────────────────────────────────
export default function ResilienceCenter() {
  const [merchantId, setMerchantId] = useState("merchant_demo");
  const [statusFilter, setStatusFilter] = useState<string>("pending");

  const utils = trpc.useUtils();

  const { data: queueData, isLoading: queueLoading, refetch: refetchQueue } =
    trpc.resilientConnectivity.offlineQueue.list.useQuery(
      { merchantId, status: statusFilter as any, limit: 50 },
      { staleTime: 15_000 }
    );

  const { data: statsData, isLoading: statsLoading } =
    trpc.resilientConnectivity.offlineQueue.stats.useQuery(
      { merchantId },
      { staleTime: 15_000 }
    );

  const { data: networkStatus } =
    trpc.resilientConnectivity.networkQuality.getStatus.useQuery(
      { merchantId },
      { staleTime: 30_000 }
    );

  const { data: policiesData } =
    trpc.resilientConnectivity.retryPolicy.list.useQuery(
      { merchantId },
      { staleTime: 60_000 }
    );

  const { data: networkHistory } =
    trpc.resilientConnectivity.networkQuality.history.useQuery(
      { merchantId, hours: 24, limit: 50 },
      { staleTime: 30_000 }
    );

  const syncMutation = trpc.resilientConnectivity.offlineQueue.sync.useMutation({
    onSuccess: (data) => {
      toast.success(`${data.synced} operation(s) marked as synced`);
      utils.resilientConnectivity.offlineQueue.list.invalidate();
      utils.resilientConnectivity.offlineQueue.stats.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const retryMutation = trpc.resilientConnectivity.offlineQueue.retry.useMutation({
    onSuccess: (data) => {
      toast.success(`Retry scheduled`);
      utils.resilientConnectivity.offlineQueue.list.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const cancelMutation = trpc.resilientConnectivity.offlineQueue.cancel.useMutation({
    onSuccess: () => {
      toast.success("Operation cancelled");
      utils.resilientConnectivity.offlineQueue.list.invalidate();
      utils.resilientConnectivity.offlineQueue.stats.invalidate();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const rows = (queueData as any)?.rows ?? [];
  const stats = statsData as any;
  const ns = networkStatus as any;
  const policies = (policiesData as any)?.policies ?? [];
  const history = (networkHistory as any)?.rows ?? [];

  const isOnline = ns?.online !== false;

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Resilience Center</h1>
          <p className="text-zinc-400 mt-1">Offline queue management, retry strategies, and network quality monitoring</p>
        </div>
        <div className="flex items-center gap-3">
          <div className={`flex items-center gap-2 px-3 py-1.5 rounded-full border text-sm ${
            isOnline ? "bg-emerald-500/10 border-emerald-500/30 text-emerald-400" : "bg-red-500/10 border-red-500/30 text-red-400"
          }`}>
            {isOnline ? <Wifi className="w-4 h-4" /> : <WifiOff className="w-4 h-4" />}
            {isOnline ? "Online" : "Offline"}
          </div>
          <TransportBadge transport={ns?.transport} />
          <Button variant="outline" className="border-zinc-700 text-zinc-300 hover:bg-zinc-800" onClick={() => refetchQueue()}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
        </div>
      </div>

      {/* Stats Row */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        {[
          { label: "Total", value: stats?.total ?? 0, color: "text-white" },
          { label: "Pending", value: stats?.pending ?? 0, color: "text-amber-400" },
          { label: "Syncing", value: stats?.syncing ?? 0, color: "text-blue-400" },
          { label: "Synced", value: stats?.synced ?? 0, color: "text-emerald-400" },
          { label: "Failed", value: stats?.failed ?? 0, color: "text-red-400" },
        ].map(s => (
          <Card key={s.label} className="bg-zinc-900 border-zinc-800">
            <CardContent className="p-4">
              <p className="text-zinc-500 text-xs mb-1">{s.label}</p>
              <p className={`text-2xl font-bold font-mono ${s.color}`}>
                {statsLoading ? "—" : s.value}
              </p>
            </CardContent>
          </Card>
        ))}
      </div>

      <Tabs defaultValue="queue" className="space-y-4">
        <TabsList className="bg-zinc-900 border border-zinc-800">
          <TabsTrigger value="queue" className="data-[state=active]:bg-zinc-800">Offline Queue</TabsTrigger>
          <TabsTrigger value="policies" className="data-[state=active]:bg-zinc-800">Retry Policies</TabsTrigger>
          <TabsTrigger value="network" className="data-[state=active]:bg-zinc-800">Network Quality</TabsTrigger>
        </TabsList>

        {/* Offline Queue Tab */}
        <TabsContent value="queue">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <CardTitle className="text-sm text-white">Queued Operations</CardTitle>
                <div className="flex items-center gap-2">
                  <Select value={statusFilter} onValueChange={setStatusFilter}>
                    <SelectTrigger className="w-32 h-8 bg-zinc-800 border-zinc-700 text-white text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["pending", "syncing", "synced", "failed", "cancelled"].map(s => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {rows.filter((r: any) => r.status === "pending").length > 0 && (
                    <Button
                      size="sm"
                      className="h-8 bg-blue-600 hover:bg-blue-700 text-white text-xs"
                      disabled={syncMutation.isPending}
                      onClick={() => {
                        const ids = rows.filter((r: any) => r.status === "pending").map((r: any) => r.id);
                        syncMutation.mutate({ ids });
                      }}
                    >
                      <CheckCircle className="w-3 h-3 mr-1" />
                      Sync All
                    </Button>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="p-0">
              {queueLoading ? (
                <div className="flex items-center justify-center h-32">
                  <Loader2 className="w-6 h-6 animate-spin text-amber-400" />
                </div>
              ) : rows.length === 0 ? (
                <div className="text-center py-12">
                  <CheckCircle className="w-10 h-10 text-zinc-700 mx-auto mb-3" />
                  <p className="text-zinc-500">No {statusFilter} operations</p>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead>
                      <tr className="border-b border-zinc-800">
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Operation</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Status</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Priority</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Attempts</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Network</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Created</th>
                        <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((row: any) => (
                        <tr key={row.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                          <td className="px-4 py-3">
                            <p className="text-sm font-mono text-zinc-300">{row.operationType}</p>
                            <p className="text-xs text-zinc-600 font-mono">{row.id}</p>
                          </td>
                          <td className="px-4 py-3"><StatusBadge status={row.status} /></td>
                          <td className="px-4 py-3"><PriorityBadge priority={row.priority} /></td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              <span className="text-sm text-zinc-300">{row.attempts}</span>
                              <span className="text-xs text-zinc-600">/ {row.maxAttempts}</span>
                            </div>
                            <Progress value={(row.attempts / row.maxAttempts) * 100} className="h-1 mt-1 w-16 bg-zinc-800" />
                          </td>
                          <td className="px-4 py-3">
                            <span className="text-xs text-zinc-400">{row.networkType ?? "—"}</span>
                            {row.bandwidthKbps && <span className="text-xs text-zinc-600 ml-1">{row.bandwidthKbps}kbps</span>}
                          </td>
                          <td className="px-4 py-3 text-xs text-zinc-500">
                            {new Date(row.createdAt).toLocaleString()}
                          </td>
                          <td className="px-4 py-3">
                            <div className="flex items-center gap-1">
                              {(row.status === "failed" || row.status === "pending") && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-blue-400 hover:text-blue-300 hover:bg-blue-500/10"
                                  disabled={retryMutation.isPending}
                                  onClick={() => retryMutation.mutate({ id: row.id })}
                                >
                                  <RotateCcw className="w-3 h-3" />
                                </Button>
                              )}
                              {row.status === "pending" && (
                                <Button
                                  size="sm"
                                  variant="ghost"
                                  className="h-7 w-7 p-0 text-red-400 hover:text-red-300 hover:bg-red-500/10"
                                  disabled={cancelMutation.isPending}
                                  onClick={() => cancelMutation.mutate({ id: row.id })}
                                >
                                  <Trash2 className="w-3 h-3" />
                                </Button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* Retry Policies Tab */}
        <TabsContent value="policies">
          <Card className="bg-zinc-900 border-zinc-800">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm text-white">Retry Policies</CardTitle>
            </CardHeader>
            <CardContent className="p-0">
              <div className="overflow-x-auto">
                <table className="w-full">
                  <thead>
                    <tr className="border-b border-zinc-800">
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Operation Type</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Max Attempts</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Initial Delay</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Backoff</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Max Delay</th>
                      <th className="text-left text-xs text-zinc-500 font-medium px-4 py-3">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {policies.map((p: any) => (
                      <tr key={p.id} className="border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <td className="px-4 py-3 font-mono text-sm text-zinc-300">{p.operationType}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{p.maxAttempts}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{(p.initialDelayMs / 1000).toFixed(1)}s</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">×{p.backoffMultiplier}</td>
                        <td className="px-4 py-3 text-sm text-zinc-300">{(p.maxDelayMs / 1000).toFixed(0)}s</td>
                        <td className="px-4 py-3">
                          <Badge className={`border text-xs ${p.enabled ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-zinc-500/10 text-zinc-400 border-zinc-500/20"}`}>
                            {p.enabled ? "active" : "disabled"}
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* Network Quality Tab */}
        <TabsContent value="network">
          <div className="grid md:grid-cols-2 gap-4">
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white flex items-center gap-2">
                  <Activity className="w-4 h-4 text-blue-400" />
                  Current Network Status
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-3">
                {!ns ? (
                  <p className="text-zinc-500 text-sm">No network data recorded yet</p>
                ) : (
                  <>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">Connection</span>
                      <div className="flex items-center gap-2">
                        {isOnline ? <Wifi className="w-4 h-4 text-emerald-400" /> : <WifiOff className="w-4 h-4 text-red-400" />}
                        <span className={`text-sm font-medium ${isOnline ? "text-emerald-400" : "text-red-400"}`}>
                          {ns.networkType ?? "unknown"}
                        </span>
                      </div>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">Transport</span>
                      <TransportBadge transport={ns.transport} />
                    </div>
                    {ns.latencyMs != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-sm">Latency</span>
                        <span className={`text-sm font-mono ${ns.latencyMs > 500 ? "text-red-400" : ns.latencyMs > 200 ? "text-amber-400" : "text-emerald-400"}`}>
                          {ns.latencyMs}ms
                        </span>
                      </div>
                    )}
                    {ns.bandwidthKbps != null && (
                      <div className="flex items-center justify-between">
                        <span className="text-zinc-400 text-sm">Bandwidth</span>
                        <span className={`text-sm font-mono ${ns.bandwidthKbps < 100 ? "text-red-400" : ns.bandwidthKbps < 500 ? "text-amber-400" : "text-emerald-400"}`}>
                          {ns.bandwidthKbps} kbps
                        </span>
                      </div>
                    )}
                    <div className="flex items-center justify-between">
                      <span className="text-zinc-400 text-sm">WebSocket</span>
                      <Badge className={`border text-xs ${ns.wsConnected ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/20" : "bg-red-500/10 text-red-400 border-red-500/20"}`}>
                        {ns.wsConnected ? "connected" : "disconnected"}
                      </Badge>
                    </div>
                    {ns.wsFallbackActive && (
                      <div className="flex items-center gap-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20">
                        <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
                        <p className="text-xs text-amber-400">WebSocket fallback is active — using alternative transport</p>
                      </div>
                    )}
                  </>
                )}
              </CardContent>
            </Card>
            <Card className="bg-zinc-900 border-zinc-800">
              <CardHeader className="pb-2">
                <CardTitle className="text-sm text-white">Network Quality History (24h)</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                {history.length === 0 ? (
                  <div className="text-center py-8">
                    <Radio className="w-8 h-8 text-zinc-700 mx-auto mb-2" />
                    <p className="text-zinc-500 text-sm">No network events recorded</p>
                  </div>
                ) : (
                  <div className="max-h-64 overflow-y-auto">
                    {history.slice(0, 20).map((h: any) => (
                      <div key={h.id} className="flex items-center justify-between px-4 py-2.5 border-b border-zinc-800/50 hover:bg-zinc-800/30">
                        <div className="flex items-center gap-2">
                          {h.networkType === "offline" ? <WifiOff className="w-3.5 h-3.5 text-red-400" /> : <Wifi className="w-3.5 h-3.5 text-emerald-400" />}
                          <span className="text-xs font-mono text-zinc-300">{h.networkType}</span>
                        </div>
                        <div className="flex items-center gap-3 text-xs text-zinc-500">
                          {h.latencyMs != null && <span>{h.latencyMs}ms</span>}
                          {h.bandwidthKbps != null && <span>{h.bandwidthKbps}kbps</span>}
                          <span>{new Date(h.createdAt).toLocaleTimeString()}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
