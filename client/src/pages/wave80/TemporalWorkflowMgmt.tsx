import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Activity, Square, RefreshCw, Search, Clock } from "lucide-react";
export default function TemporalWorkflowMgmt() {
  const [search, setSearch] = useState("");
  const workflows = [
    { id: "wf1", workflowId: "PayoutWorkflow-001", type: "PayoutWorkflow", status: "Running", startTime: "2026-04-09T10:00:00Z" },
    { id: "wf2", workflowId: "KYBWorkflow-045", type: "KYBVerificationWorkflow", status: "Completed", startTime: "2026-04-08T14:30:00Z" },
    { id: "wf3", workflowId: "CrossBorderWorkflow-012", type: "CrossBorderPaymentWorkflow", status: "Running", startTime: "2026-04-09T09:15:00Z" },
    { id: "wf4", workflowId: "SubscriptionBilling-089", type: "SubscriptionBillingWorkflow", status: "Terminated", startTime: "2026-04-07T08:00:00Z" },
  ];
  const filtered = workflows.filter(w=>w.workflowId.toLowerCase().includes(search.toLowerCase())||w.type.toLowerCase().includes(search.toLowerCase()));
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Temporal Workflow Management</h1><p className="text-muted-foreground">Monitor, signal, and manage Temporal workflows</p></div>
        <Button variant="outline"><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Activity className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">2</p><p className="text-sm text-muted-foreground">Running</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Square className="w-8 h-8 text-red-500" /><div><p className="text-2xl font-bold">1</p><p className="text-sm text-muted-foreground">Terminated</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div><p className="text-2xl font-bold">paygate</p><p className="text-sm text-muted-foreground">Namespace</p></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Workflow Executions</CardTitle></CardHeader><CardContent>
        <div className="flex gap-2 mb-4"><Input placeholder="Search workflows..." value={search} onChange={e=>setSearch(e.target.value)} className="max-w-sm" /><Button variant="outline"><Search className="w-4 h-4" /></Button></div>
        <div className="space-y-3">{filtered.map(wf=>(
          <div key={wf.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium font-mono text-sm">{wf.workflowId}</p><p className="text-sm text-muted-foreground">{wf.type} - Started: {new Date(wf.startTime).toLocaleString()}</p></div>
            <div className="flex items-center gap-3">
              <Badge variant={wf.status==="Running"?"default":wf.status==="Completed"?"secondary":"destructive"}>{wf.status}</Badge>
              {wf.status==="Running" && <><Button size="sm" variant="outline">Signal</Button><Button size="sm" variant="destructive">Terminate</Button></>}
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
