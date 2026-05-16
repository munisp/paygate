import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { CheckCircle, Play, Square, Search, RefreshCw } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function TemporalWorkflowMgmt() {
  const [search, setSearch] = useState("");

  const { data, isLoading, refetch } = trpc.wave80.temporalWorkflowMgmt.listWorkflows.useQuery({}, { staleTime: 30_000 });
  const { data: metrics } = trpc.wave80.temporalWorkflowMgmt.getMetrics.useQuery({}, { staleTime: 30_000 });

  const cancel = trpc.wave80.temporalWorkflowMgmt.cancelWorkflow.useMutation({
    onSuccess: () => { toast.success("Workflow cancelled"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const retry = trpc.wave80.temporalWorkflowMgmt.retryWorkflow.useMutation({
    onSuccess: () => { toast.success("Workflow retried"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const workflows = data?.workflows ?? [];
  const filtered = workflows.filter(wf => wf.id.toLowerCase().includes(search.toLowerCase()) || wf.type.toLowerCase().includes(search.toLowerCase()));

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Temporal Workflow Management</h1><p className="text-muted-foreground">Monitor and manage Temporal workflow executions</p></div>
        <Button variant="outline" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Play className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{metrics?.running ?? 0}</p><p className="text-sm text-muted-foreground">Running</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{metrics?.completed ?? 0}</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Square className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">{metrics?.failed ?? 0}</p><p className="text-sm text-muted-foreground">Failed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div><p className="text-2xl font-bold">{metrics?.successRate ?? 0}%</p><p className="text-sm text-muted-foreground">Success Rate</p></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Workflow Executions</CardTitle></CardHeader><CardContent>
        <div className="flex gap-2 mb-4"><Input placeholder="Search workflows..." value={search} onChange={e => setSearch(e.target.value)} className="max-w-sm" /><Button variant="outline"><Search className="w-4 h-4" /></Button></div>
        {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
        filtered.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No workflows found.</p></div> : (
          <div className="space-y-3">{filtered.map(wf => (
            <div key={wf.id} className="flex items-center justify-between p-4 border rounded-lg">
              <div><p className="font-medium font-mono text-sm">{wf.id}</p><p className="text-sm text-muted-foreground">{wf.type} - Started: {new Date(wf.startedAt).toLocaleString()}</p></div>
              <div className="flex items-center gap-3">
                <Badge variant={wf.status === "running" ? "default" : wf.status === "completed" ? "secondary" : "destructive"}>{wf.status}</Badge>
                {wf.status === "running" && <Button size="sm" variant="destructive" onClick={() => cancel.mutate({ workflowId: wf.id, reason: "Manual cancellation" })}>Cancel</Button>}
                {wf.status === "failed" && <Button size="sm" variant="outline" onClick={() => retry.mutate({ workflowId: wf.id })}>Retry</Button>}
              </div>
            </div>
          ))}</div>
        )}
      </CardContent></Card>
    </div>
  );
}
