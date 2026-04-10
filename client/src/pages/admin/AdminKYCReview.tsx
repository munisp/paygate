import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { ShieldCheck, CheckCircle, XCircle, Clock } from "lucide-react";
import { toast } from "sonner";

export default function AdminKYCReview() {
  const [page, setPage] = useState(1);
  const [statusFilter, setStatusFilter] = useState<"pending" | "approved" | "rejected" | "all">("pending");
  const [reviewDialog, setReviewDialog] = useState<{ open: boolean; id: number; decision: "approved" | "rejected" } | null>(null);
  const [notes, setNotes] = useState("");

  const utils = trpc.useUtils();
  const statsQuery = trpc.admin.kyc.getStats.useQuery();
  const listQuery = trpc.admin.kyc.listPending.useQuery({ page, limit: 20, status: statusFilter });

  const reviewMutation = trpc.admin.kyc.reviewSubmission.useMutation({
    onSuccess: () => {
      utils.admin.kyc.listPending.invalidate();
      utils.admin.kyc.getStats.invalidate();
      setReviewDialog(null);
      setNotes("");
      toast.success("KYC submission reviewed");
    },
    onError: (e) => toast.error(e.message),
  });

  const stats = statsQuery.data as Record<string, number> | null | undefined;
  const submissions = (listQuery.data as any)?.submissions ?? [];
  const total = (listQuery.data as any)?.total ?? 0;

  const statusColors: Record<string, string> = {
    pending: "bg-amber-500/20 text-amber-400 border-amber-500/30",
    approved: "bg-green-500/20 text-green-400 border-green-500/30",
    rejected: "bg-red-500/20 text-red-400 border-red-500/30",
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">KYC Review Queue</h1>
          <p className="text-slate-400 text-sm mt-1">Review and approve merchant KYC submissions</p>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: "Pending", key: "pending", icon: Clock, color: "text-amber-400" },
            { label: "Approved", key: "approved", icon: CheckCircle, color: "text-green-400" },
            { label: "Rejected", key: "rejected", icon: XCircle, color: "text-red-400" },
          ].map((s) => (
            <Card key={s.key} className="bg-slate-900 border-slate-800">
              <CardContent className="p-4 flex items-center gap-3">
                <s.icon className={`w-6 h-6 ${s.color}`} />
                <div>
                  <p className="text-xs text-slate-400">{s.label}</p>
                  <p className="text-xl font-bold text-white">
                    {statsQuery.isLoading ? <Skeleton className="h-6 w-10 bg-slate-800 inline-block" /> : (stats?.[s.key] ?? 0)}
                  </p>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* Filter */}
        <div className="flex items-center gap-3">
          <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v as any); setPage(1); }}>
            <SelectTrigger className="w-40 bg-slate-800 border-slate-700 text-white">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="bg-slate-800 border-slate-700">
              <SelectItem value="pending">Pending</SelectItem>
              <SelectItem value="approved">Approved</SelectItem>
              <SelectItem value="rejected">Rejected</SelectItem>
              <SelectItem value="all">All</SelectItem>
            </SelectContent>
          </Select>
          <p className="text-slate-400 text-sm">{total} submissions</p>
        </div>

        {/* Table */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base flex items-center gap-2">
              <ShieldCheck className="w-4 h-4" /> KYC Submissions
            </CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {listQuery.isLoading ? (
              <div className="p-4 space-y-2">{Array.from({ length: 6 }).map((_, i) => <Skeleton key={i} className="h-10 w-full bg-slate-800" />)}</div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">ID</TableHead>
                    <TableHead className="text-slate-400">Merchant ID</TableHead>
                    <TableHead className="text-slate-400">Doc Type</TableHead>
                    <TableHead className="text-slate-400">Status</TableHead>
                    <TableHead className="text-slate-400">Submitted</TableHead>
                    <TableHead className="text-slate-400">Reviewed</TableHead>
                    <TableHead className="text-slate-400 text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {submissions.map((s: any) => (
                    <TableRow key={s.id} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-400 text-xs font-mono">{s.id}</TableCell>
                      <TableCell className="text-slate-300 text-xs font-mono">{s.merchantId?.slice(0, 12)}...</TableCell>
                      <TableCell className="text-slate-300 text-sm capitalize">{s.docType?.replace(/_/g, " ")}</TableCell>
                      <TableCell>
                        <Badge className={`text-xs border ${statusColors[s.status] ?? "bg-slate-700 text-slate-300"}`}>{s.status}</Badge>
                      </TableCell>
                      <TableCell className="text-slate-400 text-xs">{new Date(s.createdAt).toLocaleDateString("en-NG")}</TableCell>
                      <TableCell className="text-slate-400 text-xs">{s.reviewedAt ? new Date(s.reviewedAt).toLocaleDateString("en-NG") : "—"}</TableCell>
                      <TableCell className="text-right">
                        {s.status === "pending" && (
                          <div className="flex items-center justify-end gap-2">
                            <Button size="sm" className="h-7 text-xs bg-green-600 hover:bg-green-700 text-white"
                              onClick={() => setReviewDialog({ open: true, id: s.id, decision: "approved" })}>
                              <CheckCircle className="w-3 h-3 mr-1" /> Approve
                            </Button>
                            <Button size="sm" variant="outline" className="h-7 text-xs border-red-700 text-red-400 hover:bg-red-900/30"
                              onClick={() => setReviewDialog({ open: true, id: s.id, decision: "rejected" })}>
                              <XCircle className="w-3 h-3 mr-1" /> Reject
                            </Button>
                          </div>
                        )}
                      </TableCell>
                    </TableRow>
                  ))}
                  {submissions.length === 0 && (
                    <TableRow><TableCell colSpan={7} className="text-center text-slate-500 py-8">No submissions found</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>

      {reviewDialog && (
        <Dialog open={reviewDialog.open} onOpenChange={() => { setReviewDialog(null); setNotes(""); }}>
          <DialogContent className="bg-slate-900 border-slate-800 text-white">
            <DialogHeader>
              <DialogTitle>{reviewDialog.decision === "approved" ? "Approve" : "Reject"} KYC Submission #{reviewDialog.id}</DialogTitle>
            </DialogHeader>
            <div className="py-2">
              <Label className="text-slate-300">Notes {reviewDialog.decision === "rejected" && "(required)"}</Label>
              <Textarea value={notes} onChange={(e) => setNotes(e.target.value)}
                placeholder={reviewDialog.decision === "rejected" ? "Reason for rejection..." : "Optional notes..."}
                className="mt-1 bg-slate-800 border-slate-700 text-white" rows={3} />
            </div>
            <DialogFooter>
              <Button variant="outline" className="border-slate-700 text-slate-300" onClick={() => { setReviewDialog(null); setNotes(""); }}>Cancel</Button>
              <Button
                className={reviewDialog.decision === "approved" ? "bg-green-600 hover:bg-green-700 text-white" : "bg-red-600 hover:bg-red-700 text-white"}
                disabled={reviewMutation.isPending || (reviewDialog.decision === "rejected" && !notes.trim())}
                onClick={() => reviewMutation.mutate({ submissionId: reviewDialog.id, decision: reviewDialog.decision, notes: notes || undefined })}
              >
                Confirm {reviewDialog.decision === "approved" ? "Approval" : "Rejection"}
              </Button>
            </DialogFooter>
          </DialogContent>
        </Dialog>
      )}
    </AdminLayout>
  );
}
