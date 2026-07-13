// @ts-nocheck
/**
 * GatewayAndWorkflowMonitor.tsx
 * ─────────────────────────────────────────────────────────────────────────────
 * Unified monitoring dashboard for:
 *   • APISIX API Gateway — health, live routes, registered consumers
 *   • Temporal Workflow Engine — active workflows, force-terminate, signal, cancel
 *
 * Accessible at: /admin/gateway-monitor
 */
import { useState, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  Activity, AlertTriangle, CheckCircle2, XCircle, RefreshCw,
  Route, Users, Zap, Clock, StopCircle, Send, Ban,
  Shield, Server, Globe, BarChart3, Search,
} from "lucide-react";

// ─── Helpers ──────────────────────────────────────────────────────────────────
function StatusPill({ status }: { status: string }) {
  const s = (status ?? "unknown").toLowerCase();
  const cfg: Record<string, { cls: string; icon: React.ReactNode }> = {
    healthy:     { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    ok:          { cls: "bg-emerald-500/15 text-emerald-400 border-emerald-500/30", icon: <CheckCircle2 className="w-3 h-3" /> },
    running:     { cls: "bg-blue-500/15 text-blue-400 border-blue-500/30",         icon: <Activity className="w-3 h-3" /> },
    completed:   { cls: "bg-slate-500/15 text-slate-300 border-slate-500/30",      icon: <CheckCircle2 className="w-3 h-3" /> },
    failed:      { cls: "bg-red-500/15 text-red-400 border-red-500/30",            icon: <XCircle className="w-3 h-3" /> },
    timed_out:   { cls: "bg-red-500/15 text-red-400 border-red-500/30",            icon: <Clock className="w-3 h-3" /> },
    canceled:    { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: <Ban className="w-3 h-3" /> },
    terminated:  { cls: "bg-red-500/15 text-red-400 border-red-500/30",            icon: <StopCircle className="w-3 h-3" /> },
    degraded:    { cls: "bg-amber-500/15 text-amber-400 border-amber-500/30",      icon: <AlertTriangle className="w-3 h-3" /> },
    unreachable: { cls: "bg-red-500/15 text-red-400 border-red-500/30",            icon: <XCircle className="w-3 h-3" /> },
    unconfigured:{ cls: "bg-slate-500/15 text-slate-400 border-slate-500/30",      icon: <AlertTriangle className="w-3 h-3" /> },
  };
  const c = cfg[s] ?? { cls: "bg-slate-500/15 text-slate-400 border-slate-500/30", icon: <Activity className="w-3 h-3" /> };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${c.cls}`}>
      {c.icon} {status}
    </span>
  );
}

function StatCard({ icon, label, value, sub }: { icon: React.ReactNode; label: string; value: string | number; sub?: string }) {
  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardContent className="p-4 flex items-center gap-3">
        <div className="p-2 rounded-lg bg-slate-700/50 text-slate-300">{icon}</div>
        <div>
          <p className="text-xs text-slate-400">{label}</p>
          <p className="text-xl font-bold text-white">{value}</p>
          {sub && <p className="text-xs text-slate-500">{sub}</p>}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── APISIX Health Panel ──────────────────────────────────────────────────────
function ApisixHealthPanel() {
  const { data, isLoading, refetch } = trpc.middlewareDashboard.apisix.health.useQuery(undefined, { staleTime: 30_000 });

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Shield className="w-4 h-4 text-orange-400" /> APISIX Gateway Health
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="h-7 text-xs">
            <RefreshCw className={`w-3 h-3 mr-1 ${isLoading ? "animate-spin" : ""}`} /> Refresh
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <p className="text-slate-400 text-sm">Checking gateway health…</p>
        ) : (
          <div className="space-y-3">
            <div className="flex items-center gap-3">
              <StatusPill status={data?.status ?? "unknown"} />
              {data?.version && <span className="text-xs text-slate-400">v{data.version}</span>}
              {data?.uptime != null && (
                <span className="text-xs text-slate-400">Uptime: {Math.floor(data.uptime / 3600)}h {Math.floor((data.uptime % 3600) / 60)}m</span>
              )}
            </div>
            {data?.connections && (
              <div className="grid grid-cols-3 gap-2">
                {Object.entries(data.connections).map(([k, v]) => (
                  <div key={k} className="bg-slate-700/40 rounded p-2 text-center">
                    <p className="text-xs text-slate-400 capitalize">{k.replace(/_/g, " ")}</p>
                    <p className="text-sm font-bold text-white">{String(v)}</p>
                  </div>
                ))}
              </div>
            )}
            {data?.status === "unconfigured" && (
              <p className="text-xs text-slate-500 bg-slate-700/30 rounded p-2">
                Set <code className="text-orange-400">APISIX_ADMIN_URL</code> and <code className="text-orange-400">APISIX_API_KEY</code> to enable live gateway monitoring.
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── APISIX Routes Panel ──────────────────────────────────────────────────────
function ApisixRoutesPanel() {
  const { data, isLoading, refetch } = trpc.middlewareDashboard.apisix.routes.useQuery(undefined, { staleTime: 30_000 });
  const [filter, setFilter] = useState("");

  const routes = (data?.routes ?? []).filter(r =>
    !filter || r.uri?.includes(filter) || r.id?.includes(filter) || r.name?.toLowerCase().includes(filter.toLowerCase())
  );

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Route className="w-4 h-4 text-blue-400" /> Routes
            <Badge variant="outline" className="text-xs">{data?.total ?? 0}</Badge>
            {data?.source && <Badge variant="secondary" className="text-xs">{data.source}</Badge>}
          </CardTitle>
          <div className="flex items-center gap-2">
            <div className="relative">
              <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
              <Input
                className="h-7 text-xs pl-6 w-40 bg-slate-700/50 border-slate-600"
                placeholder="Filter routes…"
                value={filter}
                onChange={e => setFilter(e.target.value)}
              />
            </div>
            <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="h-7 text-xs">
              <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border border-slate-700/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-transparent">
                <TableHead className="text-slate-400 text-xs h-8">ID</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">URI</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Name</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Status</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Plugins</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {routes.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={5} className="text-center text-slate-500 text-xs py-6">
                    {isLoading ? "Loading routes…" : "No routes found"}
                  </TableCell>
                </TableRow>
              ) : routes.map(r => (
                <TableRow key={r.id} className="border-slate-700/30 hover:bg-slate-700/20">
                  <TableCell className="text-xs font-mono text-slate-300">{r.id}</TableCell>
                  <TableCell className="text-xs font-mono text-blue-300">{r.uri}</TableCell>
                  <TableCell className="text-xs text-slate-400">{r.name ?? "—"}</TableCell>
                  <TableCell>
                    <StatusPill status={r.status === 1 ? "ok" : "degraded"} />
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {r.plugins ? Object.keys(r.plugins).join(", ") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── APISIX Consumers Panel ───────────────────────────────────────────────────
function ApisixConsumersPanel() {
  const { data, isLoading, refetch } = trpc.middlewareDashboard.apisix.consumers.useQuery(undefined, { staleTime: 30_000 });

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
            <Users className="w-4 h-4 text-purple-400" /> API Consumers
            <Badge variant="outline" className="text-xs">{data?.total ?? 0}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="h-7 text-xs">
            <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
          </Button>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        <div className="rounded-md border border-slate-700/50 overflow-hidden">
          <Table>
            <TableHeader>
              <TableRow className="border-slate-700/50 hover:bg-transparent">
                <TableHead className="text-slate-400 text-xs h-8">Username</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Plugins</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Created</TableHead>
                <TableHead className="text-slate-400 text-xs h-8">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.consumers ?? []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center text-slate-500 text-xs py-6">
                    {isLoading ? "Loading consumers…" : "No consumers registered"}
                  </TableCell>
                </TableRow>
              ) : (data?.consumers ?? []).map(c => (
                <TableRow key={c.username} className="border-slate-700/30 hover:bg-slate-700/20">
                  <TableCell className="text-xs font-mono text-slate-300">{c.username}</TableCell>
                  <TableCell className="text-xs text-slate-400">
                    {c.plugins ? Object.keys(c.plugins).join(", ") : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {c.create_time ? new Date(c.create_time * 1000).toLocaleDateString() : "—"}
                  </TableCell>
                  <TableCell className="text-xs text-slate-500">
                    {c.update_time ? new Date(c.update_time * 1000).toLocaleDateString() : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Temporal Workflows Panel ─────────────────────────────────────────────────
type WorkflowAction = { type: "terminate" | "signal" | "cancel"; workflowId: string } | null;

function TemporalWorkflowsPanel() {
  const [statusFilter, setStatusFilter] = useState("Running");
  const [searchId, setSearchId] = useState("");
  const [action, setAction] = useState<WorkflowAction>(null);
  const [terminateReason, setTerminateReason] = useState("");
  const [signalName, setSignalName] = useState("");

  const { data, isLoading, refetch } = trpc.middlewareDashboard.temporal.listWorkflows.useQuery(
    { status: statusFilter || undefined, limit: 100 },
    { staleTime: 15_000 }
  );

  const terminate = trpc.middlewareDashboard.temporal.forceTerminate.useMutation({
    onSuccess: (r) => {
      toast.success(r.terminated ? `Workflow ${r.workflowId} terminated` : "Terminate request sent (demo mode)");
      setAction(null);
      refetch();
    },
    onError: (e) => toast.error(`Terminate failed: ${e.message}`),
  });

  const signal = trpc.middlewareDashboard.temporal.signal.useMutation({
    onSuccess: (r) => {
      toast.success(r.signaled ? `Signal sent to ${r.workflowId}` : "Signal sent (demo mode)");
      setAction(null);
      refetch();
    },
    onError: (e) => toast.error(`Signal failed: ${e.message}`),
  });

  const cancel = trpc.middlewareDashboard.temporal.cancel.useMutation({
    onSuccess: (r) => {
      toast.success(r.cancelled ? `Workflow ${r.workflowId} cancelled` : "Cancel request sent (demo mode)");
      refetch();
    },
    onError: (e) => toast.error(`Cancel failed: ${e.message}`),
  });

  const workflows = (data?.workflows ?? []).filter(w =>
    !searchId || w.workflow_id?.includes(searchId) || w.workflowType?.includes(searchId)
  );

  return (
    <>
      <Card className="bg-slate-800/50 border-slate-700/50">
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between flex-wrap gap-2">
            <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
              <Zap className="w-4 h-4 text-yellow-400" /> Temporal Workflows
              <Badge variant="outline" className="text-xs">{data?.total ?? workflows.length}</Badge>
            </CardTitle>
            <div className="flex items-center gap-2 flex-wrap">
              <select
                value={statusFilter}
                onChange={e => setStatusFilter(e.target.value)}
                className="h-7 text-xs bg-slate-700/50 border border-slate-600 rounded px-2 text-slate-300"
              >
                <option value="">All statuses</option>
                <option value="Running">Running</option>
                <option value="Completed">Completed</option>
                <option value="Failed">Failed</option>
                <option value="TimedOut">Timed Out</option>
                <option value="Canceled">Canceled</option>
                <option value="Terminated">Terminated</option>
              </select>
              <div className="relative">
                <Search className="w-3 h-3 absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" />
                <Input
                  className="h-7 text-xs pl-6 w-40 bg-slate-700/50 border-slate-600"
                  placeholder="Search ID / type…"
                  value={searchId}
                  onChange={e => setSearchId(e.target.value)}
                />
              </div>
              <Button size="sm" variant="outline" onClick={() => refetch()} disabled={isLoading} className="h-7 text-xs">
                <RefreshCw className={`w-3 h-3 ${isLoading ? "animate-spin" : ""}`} />
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-0">
          <div className="rounded-md border border-slate-700/50 overflow-hidden">
            <Table>
              <TableHeader>
                <TableRow className="border-slate-700/50 hover:bg-transparent">
                  <TableHead className="text-slate-400 text-xs h-8">Workflow ID</TableHead>
                  <TableHead className="text-slate-400 text-xs h-8">Type</TableHead>
                  <TableHead className="text-slate-400 text-xs h-8">Status</TableHead>
                  <TableHead className="text-slate-400 text-xs h-8">Started</TableHead>
                  <TableHead className="text-slate-400 text-xs h-8">Elapsed</TableHead>
                  <TableHead className="text-slate-400 text-xs h-8 text-right">Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {workflows.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={6} className="text-center text-slate-500 text-xs py-8">
                      {isLoading ? "Loading workflows…" : "No workflows found"}
                    </TableCell>
                  </TableRow>
                ) : workflows.map(w => {
                  const isRunning = (w.status ?? "").toLowerCase() === "running";
                  const elapsed = w.elapsedMs != null
                    ? w.elapsedMs < 60_000 ? `${(w.elapsedMs / 1000).toFixed(0)}s`
                      : w.elapsedMs < 3_600_000 ? `${Math.floor(w.elapsedMs / 60_000)}m`
                      : `${Math.floor(w.elapsedMs / 3_600_000)}h`
                    : "—";
                  return (
                    <TableRow key={w.workflow_id} className="border-slate-700/30 hover:bg-slate-700/20">
                      <TableCell className="text-xs font-mono text-slate-300 max-w-[160px] truncate">{w.workflow_id}</TableCell>
                      <TableCell className="text-xs text-slate-400">{w.workflowType ?? w.workflow_type ?? "—"}</TableCell>
                      <TableCell><StatusPill status={w.status ?? "unknown"} /></TableCell>
                      <TableCell className="text-xs text-slate-500">
                        {w.startTime ? new Date(w.startTime).toLocaleTimeString() : "—"}
                      </TableCell>
                      <TableCell className="text-xs text-slate-400">{elapsed}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {isRunning && (
                            <>
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-xs text-amber-400 hover:text-amber-300 px-2"
                                onClick={() => { setAction({ type: "signal", workflowId: w.workflow_id }); setSignalName(""); }}
                              >
                                <Send className="w-3 h-3 mr-1" /> Signal
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-xs text-slate-400 hover:text-slate-300 px-2"
                                onClick={() => cancel.mutate({ workflowId: w.workflow_id })}
                                disabled={cancel.isPending}
                              >
                                <Ban className="w-3 h-3 mr-1" /> Cancel
                              </Button>
                              <Button
                                size="sm" variant="ghost"
                                className="h-6 text-xs text-red-400 hover:text-red-300 px-2"
                                onClick={() => { setAction({ type: "terminate", workflowId: w.workflow_id }); setTerminateReason(""); }}
                              >
                                <StopCircle className="w-3 h-3 mr-1" /> Terminate
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* Force Terminate Dialog */}
      <Dialog open={action?.type === "terminate"} onOpenChange={open => !open && setAction(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <StopCircle className="w-4 h-4 text-red-400" /> Force Terminate Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Workflow: <code className="text-slate-300 font-mono">{action?.workflowId}</code>
            </p>
            <Input
              placeholder="Reason for termination (required)"
              value={terminateReason}
              onChange={e => setTerminateReason(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!terminateReason.trim() || terminate.isPending}
              onClick={() => terminate.mutate({ workflowId: action!.workflowId, reason: terminateReason })}
            >
              {terminate.isPending ? "Terminating…" : "Force Terminate"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Signal Dialog */}
      <Dialog open={action?.type === "signal"} onOpenChange={open => !open && setAction(null)}>
        <DialogContent className="bg-slate-800 border-slate-700">
          <DialogHeader>
            <DialogTitle className="text-white flex items-center gap-2">
              <Send className="w-4 h-4 text-amber-400" /> Send Signal to Workflow
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3">
            <p className="text-xs text-slate-400">
              Workflow: <code className="text-slate-300 font-mono">{action?.workflowId}</code>
            </p>
            <Input
              placeholder="Signal name (e.g. approve, reject, resume)"
              value={signalName}
              onChange={e => setSignalName(e.target.value)}
              className="bg-slate-700/50 border-slate-600 text-sm"
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAction(null)}>Cancel</Button>
            <Button
              disabled={!signalName.trim() || signal.isPending}
              onClick={() => signal.mutate({ workflowId: action!.workflowId, signalName })}
            >
              {signal.isPending ? "Sending…" : "Send Signal"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
}

// ─── Workflow Status Lookup ───────────────────────────────────────────────────
function WorkflowStatusLookup() {
  const [inputId, setInputId] = useState("");
  const [lookupId, setLookupId] = useState("");

  const { data, isLoading } = trpc.middlewareDashboard.temporal.workflowStatus.useQuery(
    { workflowId: lookupId },
    { enabled: !!lookupId, staleTime: 10_000 }
  );

  return (
    <Card className="bg-slate-800/50 border-slate-700/50">
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-semibold text-white flex items-center gap-2">
          <Search className="w-4 h-4 text-slate-400" /> Workflow Status Lookup
        </CardTitle>
      </CardHeader>
      <CardContent className="pt-0 space-y-3">
        <div className="flex gap-2">
          <Input
            placeholder="Enter workflow ID…"
            value={inputId}
            onChange={e => setInputId(e.target.value)}
            onKeyDown={e => e.key === "Enter" && setLookupId(inputId)}
            className="bg-slate-700/50 border-slate-600 text-sm"
          />
          <Button onClick={() => setLookupId(inputId)} disabled={!inputId || isLoading} className="shrink-0">
            {isLoading ? <RefreshCw className="w-4 h-4 animate-spin" /> : "Lookup"}
          </Button>
        </div>
        {data && (
          <div className="bg-slate-700/30 rounded-lg p-3 space-y-2">
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Workflow ID</span>
              <code className="text-xs text-slate-300 font-mono">{data.workflow_id ?? lookupId}</code>
            </div>
            <div className="flex items-center justify-between">
              <span className="text-xs text-slate-400">Status</span>
              <StatusPill status={data.status ?? "unknown"} />
            </div>
            {data.workflowType && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Type</span>
                <span className="text-xs text-slate-300">{data.workflowType}</span>
              </div>
            )}
            {data.startTime && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Started</span>
                <span className="text-xs text-slate-300">{new Date(data.startTime).toLocaleString()}</span>
              </div>
            )}
            {data.closeTime && (
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-400">Closed</span>
                <span className="text-xs text-slate-300">{new Date(data.closeTime).toLocaleString()}</span>
              </div>
            )}
            {data.source === "demo" && (
              <p className="text-xs text-amber-400/70 mt-1">⚠ Demo data — Temporal bridge not connected</p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function GatewayAndWorkflowMonitor() {
  const apisixHealth = trpc.middlewareDashboard.apisix.health.useQuery(undefined, { staleTime: 30_000 });
  const apisixRoutes = trpc.middlewareDashboard.apisix.routes.useQuery(undefined, { staleTime: 30_000 });
  const apisixConsumers = trpc.middlewareDashboard.apisix.consumers.useQuery(undefined, { staleTime: 30_000 });
  const temporalWorkflows = trpc.middlewareDashboard.temporal.listWorkflows.useQuery(
    { status: "Running", limit: 100 }, { staleTime: 15_000 }
  );

  const refetchAll = useCallback(() => {
    apisixHealth.refetch();
    apisixRoutes.refetch();
    apisixConsumers.refetch();
    temporalWorkflows.refetch();
  }, [apisixHealth, apisixRoutes, apisixConsumers, temporalWorkflows]);

  return (
    <div className="min-h-screen bg-slate-900 text-white p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-orange-400" /> Gateway & Workflow Monitor
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Real-time monitoring for APISIX API Gateway and Temporal Workflow Engine
          </p>
        </div>
        <Button variant="outline" onClick={refetchAll} className="gap-2">
          <RefreshCw className="w-4 h-4" /> Refresh All
        </Button>
      </div>

      {/* Summary Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <StatCard
          icon={<Shield className="w-5 h-5 text-orange-400" />}
          label="Gateway Status"
          value={apisixHealth.data?.status ?? "—"}
          sub="APISIX"
        />
        <StatCard
          icon={<Route className="w-5 h-5 text-blue-400" />}
          label="Active Routes"
          value={apisixRoutes.data?.total ?? "—"}
          sub={apisixRoutes.data?.source ?? ""}
        />
        <StatCard
          icon={<Users className="w-5 h-5 text-purple-400" />}
          label="API Consumers"
          value={apisixConsumers.data?.total ?? "—"}
          sub="Registered in gateway"
        />
        <StatCard
          icon={<Zap className="w-5 h-5 text-yellow-400" />}
          label="Running Workflows"
          value={temporalWorkflows.data?.total ?? temporalWorkflows.data?.workflows?.length ?? "—"}
          sub="Temporal active"
        />
      </div>

      {/* Tabs */}
      <Tabs defaultValue="apisix" className="space-y-4">
        <TabsList className="bg-slate-800/50 border border-slate-700/50">
          <TabsTrigger value="apisix" className="data-[state=active]:bg-slate-700">
            <Shield className="w-3 h-3 mr-1" /> APISIX Gateway
          </TabsTrigger>
          <TabsTrigger value="temporal" className="data-[state=active]:bg-slate-700">
            <Zap className="w-3 h-3 mr-1" /> Temporal Workflows
          </TabsTrigger>
        </TabsList>

        {/* APISIX Tab */}
        <TabsContent value="apisix" className="space-y-4">
          <ApisixHealthPanel />
          <ApisixRoutesPanel />
          <ApisixConsumersPanel />
        </TabsContent>

        {/* Temporal Tab */}
        <TabsContent value="temporal" className="space-y-4">
          <WorkflowStatusLookup />
          <TemporalWorkflowsPanel />
        </TabsContent>
      </Tabs>
    </div>
  );
}
