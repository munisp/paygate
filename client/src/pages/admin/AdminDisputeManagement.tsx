import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { AlertTriangle, CheckCircle, ArrowUpCircle } from "lucide-react";
import { toast } from "sonner";

const statusColors: Record<string, string> = {
  open: "bg-red-500/20 text-red-400 border-red-500/30",
  under_review: "bg-amber-500/20 text-amber-400 border-amber-500/30",
  resolved: "bg-green-500/20 text-green-400 border-green-500/30",
  escalated: "bg-purple-500/20 text-purple-400 border-purple-500/30",
};

export default function AdminDisputeManagement() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"open" | "under_review" | "resolved" | "escalated" | "all">("open");
  const [resolveDialog, setResolveDialog] = useState<{ open: boolean; disputeId: string } | null>(null);
  const [escalateDialog, setEscalateDialog] = useState<{ open: boolean; disputeId: string } | null>(null);
  const [resolution, setResolution] = useState<"merchant_wins" | "customer_wins" | "partial_refund">("merchant_wins");
  const [refundAmount, setRefundAmount] = useState("");
  const [escalateReason, setEscalateReason] = useState("");

  const utils = trpc.useUtils();
  const listQuery = trpc.admin.disputes.listAll.useQuery({ page, limit: 20, status: statusFilter });

  const resolveMutation = trpc.admin.disputes.resolveDispute.useMutation({
    onSuccess: () => { utils.admin.disputes.listAll.invalidate(); setResolveDialog(null); toast.success("Dispute resolved"); },
    onError: (e) => toast.error(e.message),
  });

  const escalateMutation = trpc.admin.disputes.escalateDispute.useMutation({
    onSuccess: () => { utils.admin.disputes.listAll.invalidate(); setEscalateDialog(null); toast.success("Dispute escalated"); },
    onError: (e) => toast.error(e.message),
  });

  const disputes = (listQuery.data as any)?.disputes ?? [];
  const total = (listQuery.data as any)?.total ?? 0;
  const fmt = (k: number) => (k / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Dispute Management</h1>
          <p className="text-slate-400 text-sm mt-1">Platform-wide dispute resolution</p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-44 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="under_review">Under Review</SelectItem>
              <SelectItem value="resolved">Resolved</SelectItem>
              <SelectItem value="escalated">Escalated</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-slate-400 text-sm">{total} disputes</p>
        </div>
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader><CardTitle className="text-white text-base flex items-center gap-2"><AlertTriangle className="w-4 h-4 text-amber-400" /> Disputes</CardTitle></CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Reference</TableHead>
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400">Amount</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Reason</TableHead>
                    <TableHead className="text-slate-400">Created</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {disputes.map((d: any) => (
                    <TableRow key={d.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-300 text-xs font-mono">{d.reference}</TableCell>
                      <TableCell className="text-slate-400 text-xs font-mono">{d.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-white font-medium">{fmt(d.amount)}</TableCell>
                      <TableCell><Badge className={`text-xs border ${statusColors[d.status] ?? "bg-slate-700 text-slate-300"}`}>{d.status}</Badge></TableCell>
                      <TableCell className="text-slate-400 text-xs max-w-32 truncate">{d.reason ?? "—"}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(d.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-right">
                        {(d.status === "open" || d.status === "under_review") && (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white" onClick={() => setResolveDialog({ open: true, disputeId: d.id })}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Resolve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-purple-700 text-purple-400 hover:bg-purple-900/30" onClick={() => setEscalateDialog({ open: true, disputeId: d.id })}>
                              <ArrowUpCircle className="w-3 h-3 mr-1" /> Escalate
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {disputes.length === 0 && <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">No disputes found</TableCell></TableRow>}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
        {Math.ceil(total / 20) > 1 && (
          <div className="flex items-center justify-between">
            <p className="text-slate-400 text-sm">Page {page} of {Math.ceil(total / 20)}</p>
            <div className="flex gap-2">
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
              <Button size="sm" variant="outline" className="border-slate-700 text-slate-300" disabled={page === Math.ceil(total / 20)} onClick={() => setPage(p => p + 1)}>Next</Button>
            </div>
          </div>
        )}
      </div>
      {resolveDialog && (
        <Dialog open={resolveDialog.open} onOpenChange={() => setResolveDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader><DialogTitle>Resolve Dispute</DialogTitle></DialogHeader>
            <div className="space-y-4 py-2">
              <div>
                <Label className="text-slate-300">Resolution</Label>
                <Select value={resolution} onValueChange={(v) => setResolution(v as any)}>
                  <SelectTrigger className="mt-1 bg-slate-800 border-slate-700 text-white"><SelectValue /></SelectTrigger>
                  <SelectContent className="bg-slate-800 border-slate-700">
                    <SelectItem value="merchant_wins">Merchant Wins</SelectItem>
                    <SelectItem value="customer_wins">Customer Wins</SelectItem>
                    <SelectItem value="partial_refund">Partial Refund</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              {resolution === "partial_refund" && (
                <div>
                  <Label className="text-slate-300">Refund Amount (Kobo)</Label>
                  <Input value={refundAmount} onChange={(e) => setRefundAmount(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="e.g. 500000" />
                </div>
              )}
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setResolveDialog(null)}>Cancel</Button>
              <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={resolveMutation.isPending}
                onClick={() => resolveMutation.mutate({ disputeId: resolveDialog.disputeId, resolution, refundAmountKobo: refundAmount ? parseInt(refundAmount) : undefined })}>
                Confirm Resolution
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
      {escalateDialog && (
        <Dialog open={escalateDialog.open} onOpenChange={() => setEscalateDialog(null)}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader><DialogTitle>Escalate Dispute</DialogTitle></DialogHeader>
            <div className="py-2">
              <Label className="text-slate-300">Reason for Escalation</Label>
              <Input value={escalateReason} onChange={(e) => setEscalateReason(e.target.value)} className="mt-1 bg-slate-800 border-slate-700 text-white" placeholder="Reason..." />
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => setEscalateDialog(null)}>Cancel</Button>
              <Button className="bg-purple-600 hover:bg-purple-700 text-white" disabled={escalateMutation.isPending || !escalateReason.trim()}
                onClick={() => escalateMutation.mutate({ disputeId: escalateDialog.disputeId, reason: escalateReason })}>
                Escalate
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
