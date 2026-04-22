// @ts-nocheck
import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { CheckCircle, XCircle, Clock, DollarSign, RefreshCw, Search, Eye } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  pending_approval: "bg-yellow-100 text-yellow-800",
  approved: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  processing: "bg-blue-100 text-blue-800",
  completed: "bg-gray-100 text-gray-700",
};

export default function AdminPayoutApproval() {
  const [search, setSearch] = useState("");
  const [selectedBatch, setSelectedBatch] = useState<any>(null);
  const [approverNote, setApproverNote] = useState("");

  const { data, isLoading, refetch } = trpc.wave27.payoutApproval.list.useQuery({
    search: search || undefined,
  });

  const approveMutation = trpc.wave27.payoutApproval.approve.useMutation({
    onSuccess: () => { toast.success("Payout batch approved"); refetch(); setSelectedBatch(null); setApproverNote(""); },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.wave27.payoutApproval.reject.useMutation({
    onSuccess: () => { toast.success("Payout batch rejected"); refetch(); setSelectedBatch(null); setApproverNote(""); },
    onError: (e) => toast.error(e.message),
  });

  const batches = data?.batches ?? [];
  const stats = data?.stats ?? { pendingCount: 0, pendingAmount: 0, approvedToday: 0, rejectedToday: 0 };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-gray-900">Payout Approval</h1>
            <p className="text-gray-500 text-sm mt-1">Review and approve merchant payout batch requests</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card className="border-yellow-200 bg-yellow-50">
            <CardContent className="p-4">
              <div className="text-sm text-yellow-700">Pending Approval</div>
              <div className="text-2xl font-bold text-yellow-800 mt-1">{stats.pendingCount}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Pending Amount</div>
              <div className="text-2xl font-bold mt-1">₦{(stats.pendingAmount / 1000000).toFixed(1)}M</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Approved Today</div>
              <div className="text-2xl font-bold text-green-600 mt-1">{stats.approvedToday}</div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="text-sm text-gray-500">Rejected Today</div>
              <div className="text-2xl font-bold text-red-600 mt-1">{stats.rejectedToday}</div>
            </CardContent>
          </Card>
        </div>

        {/* Search */}
        <div className="relative max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
          <Input placeholder="Search by merchant ID or batch ID..." value={search} onChange={(e) => setSearch(e.target.value)} className="pl-9" />
        </div>

        {/* Batches Table */}
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><DollarSign className="w-5 h-5" />Payout Batches ({batches.length})</CardTitle></CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="text-center py-8 text-gray-500">Loading batches...</div>
            ) : batches.length === 0 ? (
              <div className="text-center py-8 text-gray-500">No payout batches found</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b text-gray-500">
                      <th className="text-left py-3 px-2">Batch ID</th>
                      <th className="text-left py-3 px-2">Merchant</th>
                      <th className="text-right py-3 px-2">Total Amount</th>
                      <th className="text-right py-3 px-2">Payouts</th>
                      <th className="text-left py-3 px-2">Status</th>
                      <th className="text-left py-3 px-2">Created</th>
                      <th className="text-left py-3 px-2">Actions</th>
                    </tr>
                  </thead>
                  <tbody>
                    {batches.map((b: any) => (
                      <tr key={b.id} className="border-b hover:bg-gray-50">
                        <td className="py-3 px-2 font-mono text-xs">{b.id}</td>
                        <td className="py-3 px-2">{b.merchant_id}</td>
                        <td className="py-3 px-2 text-right font-medium">₦{Number(b.total_amount).toLocaleString()}</td>
                        <td className="py-3 px-2 text-right">{b.payout_count}</td>
                        <td className="py-3 px-2">
                          <Badge className={STATUS_COLORS[b.status] ?? "bg-gray-100 text-gray-700"}>
                            {b.status?.replace(/_/g, " ")}
                          </Badge>
                        </td>
                        <td className="py-3 px-2 text-gray-500 text-xs">{b.created_at ? new Date(b.created_at).toLocaleDateString() : "—"}</td>
                        <td className="py-3 px-2">
                          <Button size="sm" variant="outline" onClick={() => { setSelectedBatch(b); setApproverNote(""); }}>
                            <Eye className="w-3 h-3 mr-1" /> Review
                          </Button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Review Dialog */}
        <Dialog open={!!selectedBatch} onOpenChange={() => setSelectedBatch(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader><DialogTitle>Review Payout Batch — {selectedBatch?.id}</DialogTitle></DialogHeader>
            {selectedBatch && (
              <div className="space-y-4">
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div><span className="font-medium text-gray-500">Merchant:</span> {selectedBatch.merchant_id}</div>
                  <div><span className="font-medium text-gray-500">Currency:</span> {selectedBatch.currency}</div>
                  <div><span className="font-medium text-gray-500">Total Amount:</span> <span className="font-bold">₦{Number(selectedBatch.total_amount).toLocaleString()}</span></div>
                  <div><span className="font-medium text-gray-500">Payout Count:</span> {selectedBatch.payout_count}</div>
                  <div><span className="font-medium text-gray-500">Status:</span>
                    <Badge className={`ml-2 ${STATUS_COLORS[selectedBatch.status] ?? ""}`}>{selectedBatch.status?.replace(/_/g, " ")}</Badge>
                  </div>
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-medium">Approver Note (optional)</label>
                  <Textarea
                    placeholder="Add a note for this decision..."
                    value={approverNote}
                    onChange={(e) => setApproverNote(e.target.value)}
                    rows={3}
                  />
                </div>
              </div>
            )}
            <DialogFooter className="gap-2">
              <Button variant="outline" onClick={() => setSelectedBatch(null)}>Cancel</Button>
              {selectedBatch?.status === "pending_approval" && (
                <>
                  <Button
                    variant="outline"
                    className="text-red-600 border-red-200 hover:bg-red-50"
                    onClick={() => rejectMutation.mutate({ batchId: selectedBatch.id, approverNote })}
                    disabled={rejectMutation.isPending}
                  >
                    <XCircle className="w-4 h-4 mr-2" />
                    {rejectMutation.isPending ? "Rejecting..." : "Reject"}
                  </Button>
                  <Button
                    className="bg-green-600 hover:bg-green-700"
                    onClick={() => approveMutation.mutate({ batchId: selectedBatch.id, approverNote })}
                    disabled={approveMutation.isPending}
                  >
                    <CheckCircle className="w-4 h-4 mr-2" />
                    {approveMutation.isPending ? "Approving..." : "Approve"}
                  </Button>
                </>
              )}
            </DialogFooter>
          </DialogContent>
        </Dialog>
      </div>
    </AdminLayout>
  );
}
