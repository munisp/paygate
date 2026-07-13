// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Banknote, CheckCircle, XCircle, Clock, TrendingUp, RefreshCw, Eye, Trash2, AlertTriangle, Loader2 } from "lucide-react";
import { Checkbox } from "@/components/ui/checkbox";
import { DialogDescription } from "@/components/ui/dialog";
import { toast } from "sonner";

const STATUS_COLORS: Record<string, string> = {
  pending: "bg-yellow-100 text-yellow-800",
  active: "bg-green-100 text-green-800",
  rejected: "bg-red-100 text-red-800",
  completed: "bg-blue-100 text-blue-800",
  defaulted: "bg-gray-100 text-gray-600",
};

export default function ConsumerLoans() {
  const [page, setPage] = useState(0);
  const [statusFilter, setStatusFilter] = useState("all");
  const [selected, setSelected] = useState<any>(null);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkAction, setBulkAction] = useState<"approve" | "reject" | null>(null);

  const limit = 20;
  const utils = trpc.useUtils();

  const { data, isLoading, isError, refetch } = trpc.consumerFinanceLoans.list.useQuery({
    limit,
    offset: page * limit,
    status: statusFilter === "all" ? undefined : statusFilter,
  }, { staleTime: 30_000 });

  const { data: stats } = trpc.consumerFinanceLoans.stats.useQuery();

  const approveMutation = trpc.consumerFinanceLoans.approve.useMutation({
    onSuccess: () => {
      toast.success("Loan approved");
      utils.consumerFinanceLoans.list.invalidate();
      utils.consumerFinanceLoans.stats.invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const rejectMutation = trpc.consumerFinanceLoans.reject.useMutation({
    onSuccess: () => {
      toast.success("Loan rejected");
      utils.consumerFinanceLoans.list.invalidate();
      utils.consumerFinanceLoans.stats.invalidate();
      setSelected(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const bulkApproveMutation = trpc.consumerFinanceLoans.bulkApprove.useMutation({
    onSuccess: (r) => { toast.success(`${r.updated} loan(s) approved`); setSelectedIds(new Set()); utils.consumerFinanceLoans.list.invalidate(); utils.consumerFinanceLoans.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });
  const bulkRejectMutation = trpc.consumerFinanceLoans.bulkReject.useMutation({
    onSuccess: (r) => { toast.success(`${r.updated} loan(s) rejected`); setSelectedIds(new Set()); utils.consumerFinanceLoans.list.invalidate(); utils.consumerFinanceLoans.stats.invalidate(); },
    onError: (e) => toast.error(e.message),
  });

  const rows = data?.rows ?? [];
  const allSelected = rows.length > 0 && rows.every((r: any) => selectedIds.has(r.id));
  const toggleAll = () => allSelected ? setSelectedIds(new Set()) : setSelectedIds(new Set(rows.map((r: any) => r.id)));
  const toggleOne = (id: string) => { const n = new Set(selectedIds); n.has(id) ? n.delete(id) : n.add(id); setSelectedIds(n); };
  const isBulkLoading = bulkApproveMutation.isPending || bulkRejectMutation.isPending;
  const confirmBulk = () => {
    const ids = Array.from(selectedIds);
    if (bulkAction === "approve") bulkApproveMutation.mutate({ ids });
    else if (bulkAction === "reject") bulkRejectMutation.mutate({ ids, reason: "Bulk rejection" });
    setBulkAction(null);
  };

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Consumer Finance Loans</h1>
          <p className="text-muted-foreground text-sm mt-1">Manage consumer loan applications and approvals</p>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Loans", value: stats?.total ?? 0, icon: Banknote, color: "text-blue-600" },
          { label: "Active", value: stats?.active ?? 0, icon: CheckCircle, color: "text-green-600" },
          { label: "Pending Review", value: stats?.pending ?? 0, icon: Clock, color: "text-yellow-600" },
          { label: "Total Disbursed", value: formatKobo(stats?.totalAmountKobo ?? 0), icon: TrendingUp, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4 pb-4">
              <div className="flex items-center gap-3">
                <s.icon className={`w-8 h-8 ${s.color}`} />
                <div>
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-xl font-bold">{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={statusFilter} onValueChange={(v) => { setStatusFilter(v); setPage(0); }}>
          <SelectTrigger className="w-40">
            <SelectValue placeholder="Status" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="active">Active</SelectItem>
            <SelectItem value="rejected">Rejected</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="defaulted">Defaulted</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-sm text-muted-foreground self-center ml-auto">{data?.total ?? 0} loans</span>
        {selectedIds.size > 0 && (
          <div className="flex items-center gap-2 bg-primary/10 border border-primary/20 rounded-lg px-3 py-1.5">
            <span className="text-sm font-medium text-primary">{selectedIds.size} selected</span>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkAction("approve")} disabled={isBulkLoading}><CheckCircle className="w-3 h-3 mr-1" /> Approve</Button>
            <Button size="sm" variant="outline" className="h-7 text-xs" onClick={() => setBulkAction("reject")} disabled={isBulkLoading}><XCircle className="w-3 h-3 mr-1" /> Reject</Button>
            <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => setSelectedIds(new Set())}>Clear</Button>
          </div>
        )}
      </div>

      {/* Table */}
      <Card>
        <CardContent className="p-0">
          {isError ? (
            <div className="p-8 text-center text-destructive">Failed to load loans.</div>
          ) : isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading…</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-10"><Checkbox checked={allSelected} onCheckedChange={toggleAll} /></TableHead>
                  <TableHead>Loan ID</TableHead>
                  <TableHead>User ID</TableHead>
                  <TableHead>Amount</TableHead>
                  <TableHead>Term</TableHead>
                  <TableHead>Interest Rate</TableHead>
                  <TableHead>Purpose</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Applied</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data?.rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9} className="text-center text-muted-foreground py-8">No loans found</TableCell>
                  </TableRow>
                )}
                {rows.map((r: any) => (
                  <TableRow key={r.id} className={selectedIds.has(r.id) ? "bg-primary/5" : ""}>
                    <TableCell><Checkbox checked={selectedIds.has(r.id)} onCheckedChange={() => toggleOne(r.id)} /></TableCell>
                    <TableCell className="font-mono text-xs">{r.id}</TableCell>
                    <TableCell>{r.userId}</TableCell>
                    <TableCell className="font-semibold">{formatKobo(r.principalKobo)}</TableCell>
                    <TableCell>{r.termMonths} mo</TableCell>
                    <TableCell>{r.interestRateBps ? `${(r.interestRateBps / 100).toFixed(1)}%` : "—"}</TableCell>
                    <TableCell className="text-sm max-w-[120px] truncate">{r.purpose ?? "—"}</TableCell>
                    <TableCell>
                      <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${STATUS_COLORS[r.status] ?? "bg-gray-100 text-gray-600"}`}>
                        {r.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm text-muted-foreground">
                      {new Date(r.createdAt).toLocaleDateString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button variant="ghost" size="sm" onClick={() => setSelected(r)}>
                          <Eye className="w-4 h-4" />
                        </Button>
                        {r.status === "pending" && (
                          <>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-green-600 border-green-200 hover:bg-green-50"
                              onClick={() => approveMutation.mutate({ id: r.id })}
                              disabled={approveMutation.isPending}
                            >
                              Approve
                            </Button>
                            <Button
                              variant="outline"
                              size="sm"
                              className="text-red-600 border-red-200 hover:bg-red-50"
                              onClick={() => rejectMutation.mutate({ id: r.id, reason: "Manual rejection" })}
                              disabled={rejectMutation.isPending}
                            >
                              Reject
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Pagination */}
      {data && data.total > limit && (
        <div className="flex justify-between items-center">
          <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage((p) => p - 1)}>Previous</Button>
          <span className="text-sm text-muted-foreground">Page {page + 1} of {Math.ceil(data.total / limit)}</span>
          <Button variant="outline" size="sm" disabled={(page + 1) * limit >= data.total} onClick={() => setPage((p) => p + 1)}>Next</Button>
        </div>
      )}

      {/* Bulk Confirm Dialog */}
      <Dialog open={!!bulkAction} onOpenChange={(o) => !o && setBulkAction(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-amber-500" /> Confirm Bulk {bulkAction === "approve" ? "Approval" : "Rejection"}</DialogTitle>
            <DialogDescription>You are about to {bulkAction} <strong>{selectedIds.size}</strong> loan application(s).</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBulkAction(null)}>Cancel</Button>
            <Button variant={bulkAction === "reject" ? "destructive" : "default"} onClick={confirmBulk} disabled={isBulkLoading}>
              {isBulkLoading ? <Loader2 className="w-4 h-4 animate-spin mr-2" /> : null} Confirm
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Detail Dialog */}
      {selected && (
        <Dialog open onOpenChange={() => setSelected(null)}>
          <DialogContent className="max-w-lg">
            <DialogHeader>
              <DialogTitle>Loan Application Detail</DialogTitle>
            </DialogHeader>
            <div className="space-y-2 text-sm max-h-96 overflow-y-auto">
              {Object.entries(selected).map(([k, v]) => (
                <div key={k} className="flex justify-between border-b pb-1">
                  <span className="text-muted-foreground capitalize">{k.replace(/([A-Z])/g, " $1")}</span>
                  <span className="font-medium text-right max-w-[60%] break-all">{String(v ?? "—")}</span>
                </div>
              ))}
            </div>
            {selected.status === "pending" && (
              <DialogFooter>
                <Button
                  variant="outline"
                  className="text-red-600"
                  onClick={() => rejectMutation.mutate({ id: selected.id, reason: "Manual rejection" })}
                  disabled={rejectMutation.isPending}
                >
                  Reject
                </Button>
                <Button
                  onClick={() => approveMutation.mutate({ id: selected.id })}
                  disabled={approveMutation.isPending}
                >
                  Approve Loan
                </Button>
              </DialogFooter>
            )}
          </DialogContent>
        </Dialog>
      )}
    </div>
  );
}
