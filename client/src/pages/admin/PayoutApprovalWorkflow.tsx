import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, DollarSign, AlertTriangle, TrendingUp } from "lucide-react";

export default function PayoutApprovalWorkflow() {
  const [selectedWorkflow, setSelectedWorkflow] = useState<any>(null);
  const [action, setAction] = useState<"approve" | "reject" | null>(null);
  const [notes, setNotes] = useState("");

  const { data: workflowsData, refetch, isLoading, isError } = trpc.wave31.payoutApproval.list.useQuery({ status: "pending" }, { staleTime: 30_000 });
  const { data: statsData } = trpc.wave31.payoutApproval.getStats.useQuery();

  const approve = trpc.wave31.payoutApproval.approve.useMutation({
    onSuccess: () => { toast.success("Payout approved"); refetch(); setSelectedWorkflow(null); setNotes(""); },
    onError: () => toast.error("Failed to approve payout"),
  });

  const reject = trpc.wave31.payoutApproval.reject.useMutation({
    onSuccess: () => { toast.success("Payout rejected"); refetch(); setSelectedWorkflow(null); setNotes(""); },
    onError: () => toast.error("Failed to reject payout"),
  });

  const workflows = (workflowsData as any)?.workflows ?? [];
  const stats = statsData as any;

  const handleAction = () => {
    if (!selectedWorkflow || !action) return;
    if (action === "approve") {
      approve.mutate({ id: selectedWorkflow.id, approverId: 1, notes });
    } else {
      if (!notes) { toast.error("Rejection reason is required"); return; }
      reject.mutate({ id: selectedWorkflow.id, approverId: 1, reason: notes });
    }
  };

  const formatAmount = (amount: number, currency = "NGN") =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency }).format(amount);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">Payout Approval Workflow</h1>
        <p className="text-muted-foreground">Multi-level approval for high-value payout requests</p>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Pending", value: stats?.pending ?? 0, icon: Clock, color: "text-yellow-600" },
          { label: "Approved", value: stats?.approved ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Rejected", value: stats?.rejected ?? 0, icon: XCircle, color: "text-red-600" },
          { label: "Approved Amount", value: formatAmount(Number(stats?.approved_amount ?? 0)), icon: DollarSign, color: "text-blue-600" },
        ].map(s => (
          <Card key={s.label}>
            <CardContent className="p-4 flex items-center gap-3">
              <s.icon className={`h-8 w-8 ${s.color}`} />
              <div>
                <p className="text-sm text-muted-foreground">{s.label}</p>
                <p className="text-xl font-bold">{s.value}</p>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Approval Queue */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-yellow-500" />
            Pending Approvals ({workflows.length})
          </CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Workflow Step</TableHead>
                <TableHead>Approver</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Created</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {workflows.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={6} className="text-center py-8 text-muted-foreground">
                    <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-500" />
                    No pending approvals
                  </TableCell>
                </TableRow>
              ) : workflows.map((wf: any) => (
                <TableRow key={wf.id}>
                  <TableCell>
                    <span className="px-2 py-1 bg-blue-100 text-blue-800 rounded text-xs font-medium">
                      {wf.workflow_step}
                    </span>
                  </TableCell>
                  <TableCell className="text-sm">{wf.approver_email}</TableCell>
                  <TableCell className="font-semibold">{formatAmount(Number(wf.amount), wf.currency)}</TableCell>
                  <TableCell>{wf.currency}</TableCell>
                  <TableCell className="text-xs text-muted-foreground">{new Date(wf.created_at).toLocaleString()}</TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      <Button size="sm" className="bg-green-600 hover:bg-green-700 text-white" onClick={() => { setSelectedWorkflow(wf); setAction("approve"); }}>
                        Approve
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => { setSelectedWorkflow(wf); setAction("reject"); }}>
                        Reject
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Approval/Rejection Dialog */}
      <Dialog open={!!selectedWorkflow && !!action} onOpenChange={() => { setSelectedWorkflow(null); setAction(null); setNotes(""); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className={action === "approve" ? "text-green-600" : "text-red-600"}>
              {action === "approve" ? "Approve Payout" : "Reject Payout"}
            </DialogTitle>
          </DialogHeader>
          {selectedWorkflow && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-lg">
                <p className="text-sm text-muted-foreground">Amount</p>
                <p className="text-2xl font-bold">{formatAmount(Number(selectedWorkflow.amount), selectedWorkflow.currency)}</p>
                <p className="text-sm text-muted-foreground mt-1">Step: {selectedWorkflow.workflow_step}</p>
              </div>
              <div>
                <Label>{action === "reject" ? "Rejection Reason *" : "Notes (optional)"}</Label>
                <Textarea
                  value={notes}
                  onChange={e => setNotes(e.target.value)}
                  placeholder={action === "reject" ? "Enter reason for rejection..." : "Add notes..."}
                  rows={3}
                />
              </div>
              <div className="flex gap-3">
                <Button
                  className={`flex-1 ${action === "approve" ? "bg-green-600 hover:bg-green-700" : "bg-red-600 hover:bg-red-700"} text-white`}
                  onClick={handleAction}
                  disabled={approve.isPending || reject.isPending}
                >
                  {action === "approve" ? "Confirm Approval" : "Confirm Rejection"}
                </Button>
                <Button variant="outline" className="flex-1" onClick={() => { setSelectedWorkflow(null); setAction(null); setNotes(""); }}>
                  Cancel
                </Button>
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
