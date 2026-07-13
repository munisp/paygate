// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Activity, Clock, CheckCircle2, XCircle, AlertTriangle, RefreshCw,
  Search, Zap, Timer, GitBranch
} from "lucide-react";

type WorkflowStatus = {
  workflowId: string;
  status: string;
  startTime?: string;
  closeTime?: string;
  workflowType?: string;
  elapsedMs?: number;
};

function statusBadge(status: string) {
  const map: Record<string, { label: string; variant: "default" | "secondary" | "destructive" | "outline" }> = {
    RUNNING: { label: "Running", variant: "default" },
    COMPLETED: { label: "Completed", variant: "secondary" },
    FAILED: { label: "Failed", variant: "destructive" },
    TIMED_OUT: { label: "Timed Out", variant: "destructive" },
    CANCELED: { label: "Cancelled", variant: "outline" },
    TERMINATED: { label: "Terminated", variant: "destructive" },
    pending_approval: { label: "Pending Approval", variant: "default" },
  };
  const cfg = map[status] ?? { label: status, variant: "outline" as const };
  return <Badge variant={cfg.variant}>{cfg.label}</Badge>;
}

function elapsed(ms?: number) {
  if (!ms) return "—";
  if (ms < 1000) return `${ms}ms`;
  if (ms < 60_000) return `${(ms / 1000).toFixed(1)}s`;
  if (ms < 3_600_000) return `${Math.floor(ms / 60_000)}m ${Math.floor((ms % 60_000) / 1000)}s`;
  return `${Math.floor(ms / 3_600_000)}h ${Math.floor((ms % 3_600_000) / 60_000)}m`;
}

export default function WorkflowObservability() {
  const [searchId, setSearchId] = useState("");
  const [lookupId, setLookupId] = useState("");

  // Fetch all pending payout approvals and their workflow status
  const { data: payoutsData, isLoading: payoutsLoading, refetch: refetchPayouts } =
    trpc.payouts.list.useQuery({ status: "pending_approval", limit: 50 }, { staleTime: 30_000 });

  // Fetch individual workflow status when user searches
  const { data: workflowData, isLoading: workflowLoading, refetch: refetchWorkflow } =
    trpc.middleware.workflow.getStatus.useQuery(
      { workflowId: lookupId },
      { enabled: !!lookupId , staleTime: 30_000 })

  // Force-reject a timed-out workflow
  const forceReject = trpc.payouts.reject.useMutation({
    onSuccess: () => {
      toast.success("Payout force-rejected and workflow terminated.");
      refetchPayouts();
    },
    onError: (e: any) => toast.error(`Force-reject failed: ${e.message}`),
  });

  const pendingPayouts = (payoutsData?.rows ?? []) as Array<{
    id: string;
    amount: number;
    currency: string;
    recipientName?: string;
    createdAt: Date;
    workflowId?: string;
  }>;

  const handleSearch = () => {
    if (!searchId.trim()) return;
    setLookupId(searchId.trim());
  };

  const handleForceReject = (payoutId: string) => {
    if (!confirm("Force-reject this payout? This will void the TigerBeetle reservation and terminate the Temporal workflow.")) return;
    forceReject.mutate({ id: payoutId, reason: "Force-rejected via observability dashboard (timeout)" });
  };

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <GitBranch className="w-6 h-6 text-violet-500" />
            Workflow Observability
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            Monitor Temporal workflow states for payout approvals. Force-reject timed-out workflows.
          </p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetchPayouts()} className="gap-2"><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending Approval", value: pendingPayouts.length, icon: Clock, color: "text-amber-500" },
          { label: "Running Workflows", value: pendingPayouts.filter(p => p.workflowId).length, icon: Activity, color: "text-blue-500" },
          { label: "Timed Out", value: pendingPayouts.filter(p => {
            const age = Date.now() - new Date(p.createdAt).getTime();
            return age > 24 * 3_600_000;
          }).length, icon: AlertTriangle, color: "text-red-500" },
          { label: "Avg Wait", value: pendingPayouts.length > 0 ? elapsed(
            pendingPayouts.reduce((sum, p) => sum + (Date.now() - new Date(p.createdAt).getTime()), 0) / pendingPayouts.length
          ) : "—", icon: Timer, color: "text-green-500" },
        ].map(stat => (
          <Card key={stat.label}>
            <CardContent className="pt-4 pb-3">
              <div className="flex items-center gap-3">
                <stat.icon className={`w-8 h-8 ${stat.color}`} />
                <div>
                  <p className="text-2xl font-bold">{stat.value}</p>
                  <p className="text-xs text-muted-foreground">{stat.label}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Manual workflow ID lookup */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Search className="w-4 h-4" />
            Workflow ID Lookup
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex gap-2">
            <Input
              placeholder="Enter Temporal workflow ID..."
              value={searchId}
              onChange={e => setSearchId(e.target.value)}
              onKeyDown={e => e.key === "Enter" && handleSearch()}
              className="font-mono text-sm"
            />
            <Button onClick={handleSearch} disabled={!searchId.trim()}>
              <Search className="w-4 h-4 mr-2" />
              Lookup
            </Button>
          </div>
          {workflowLoading && <p className="text-sm text-muted-foreground mt-3">Fetching workflow status...</p>}
          {workflowData && (
            <div className="mt-4 p-4 rounded-lg border bg-muted/30 space-y-2">
              <div className="flex items-center justify-between">
                <span className="font-mono text-sm font-semibold">{lookupId}</span>
                {statusBadge((workflowData as WorkflowStatus)?.status ?? "UNKNOWN")}
              </div>
              {(workflowData as WorkflowStatus)?.workflowType && (
                <p className="text-xs text-muted-foreground">Type: {(workflowData as WorkflowStatus).workflowType}</p>
              )}
              {(workflowData as WorkflowStatus)?.elapsedMs !== undefined && (
                <p className="text-xs text-muted-foreground">
                  Elapsed: {elapsed((workflowData as WorkflowStatus).elapsedMs)}
                </p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Pending approval queue with workflow states */}
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="text-base flex items-center gap-2">
            <Zap className="w-4 h-4 text-amber-500" />
            Pending Approval Workflows
          </CardTitle>
        </CardHeader>
        <CardContent>
          {payoutsLoading ? (
            <div className="space-y-2">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="h-14 rounded-lg bg-muted animate-pulse" />
              ))}
            </div>
          ) : pendingPayouts.length === 0 ? (
            <div className="text-center py-10 text-muted-foreground">
              <CheckCircle2 className="w-10 h-10 mx-auto mb-2 text-green-500 opacity-60" />
              <p className="text-sm">No pending approval workflows</p>
            </div>
          ) : (
            <div className="space-y-2">
              {pendingPayouts.map(payout => {
                const ageMs = Date.now() - new Date(payout.createdAt).getTime();
                const isTimedOut = ageMs > 24 * 3_600_000;
                return (
                  <div
                    key={payout.id}
                    className={`flex items-center justify-between p-3 rounded-lg border ${
                      isTimedOut ? "border-red-200 bg-red-50 dark:bg-red-950/20" : "bg-muted/30"
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      {isTimedOut
                        ? <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                        : <Activity className="w-4 h-4 text-blue-500 flex-shrink-0" />
                      }
                      <div className="min-w-0">
                        <p className="font-mono text-xs font-semibold truncate">{payout.id}</p>
                        <p className="text-xs text-muted-foreground">
                          {(payout.amount / 100).toLocaleString()} {payout.currency}
                          {payout.recipientName ? ` · ${payout.recipientName}` : ""}
                          {" · "}{elapsed(ageMs)} ago
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2 flex-shrink-0">
                      {payout.workflowId && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-xs h-7"
                          onClick={() => { setSearchId(payout.workflowId!); setLookupId(payout.workflowId!); }}
                        >
                          View Workflow
                        </Button>
                      )}
                      {isTimedOut && (
                        <Button
                          variant="destructive"
                          size="sm"
                          className="h-7 text-xs"
                          disabled={forceReject.isPending}
                          onClick={() => handleForceReject(payout.id)}
                        >
                          <XCircle className="w-3 h-3 mr-1" />
                          Force Reject
                        </Button>
                      )}
                      {!isTimedOut && statusBadge("pending_approval")}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
