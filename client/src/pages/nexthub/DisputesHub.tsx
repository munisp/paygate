import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { RefreshCw, Scale, CheckCircle2, XCircle, AlertTriangle, Clock } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-blue-100 text-blue-700 border-blue-200",
  UNDER_REVIEW: "bg-amber-100 text-amber-700 border-amber-200",
  UPHELD: "bg-emerald-100 text-emerald-700 border-emerald-200",
  REJECTED: "bg-slate-100 text-slate-600 border-slate-200",
  ESCALATED: "bg-orange-100 text-orange-700 border-orange-200",
};

const TYPE_LABELS: Record<string, string> = {
  DUPLICATE: "Duplicate Transfer",
  WRONG_AMOUNT: "Wrong Amount",
  UNAUTHORISED: "Unauthorised",
  NOT_RECEIVED: "Not Received",
};

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function DisputesHub() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"uphold" | "reject" | "escalate" | null>(null);
  const [notes, setNotes] = useState("");

  const { data: stats, refetch: refetchStats } = trpc.nexthubDisputes.getStats.useQuery();
  const { data, isLoading, refetch } = trpc.nexthubDisputes.listDisputes.useQuery({
    page, pageSize: 20,
    status: statusFilter as any,
    disputeType: typeFilter as any,
  });

  const reviewMutation = trpc.nexthubDisputes.reviewDispute.useMutation({
    onSuccess: () => { toast.success("Dispute moved to Under Review"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const upholdMutation = trpc.nexthubDisputes.upholdDispute.useMutation({
    onSuccess: () => { toast.success("Dispute upheld — reversal initiated"); setActionType(null); setNotes(""); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const rejectMutation = trpc.nexthubDisputes.rejectDispute.useMutation({
    onSuccess: () => { toast.success("Dispute rejected — penalty fee posted"); setActionType(null); setNotes(""); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const escalateMutation = trpc.nexthubDisputes.escalateDispute.useMutation({
    onSuccess: () => { toast.success("Dispute escalated to scheme operator"); setActionType(null); setNotes(""); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const handleAction = () => {
    if (!selectedId) return;
    if (actionType === "uphold") upholdMutation.mutate({ disputeId: selectedId, resolutionNotes: notes });
    else if (actionType === "reject") rejectMutation.mutate({ disputeId: selectedId, resolutionNotes: notes });
    else if (actionType === "escalate") escalateMutation.mutate({ disputeId: selectedId, notes });
  };

  const isActionPending = upholdMutation.isPending || rejectMutation.isPending || escalateMutation.isPending;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Disputes</h1>
          <p className="text-sm text-slate-500 mt-1">DFSP transfer disputes — upheld reversals via TigerBeetle, rejected disputes incur penalty fees</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Scale className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Open Disputes</p>
                <p className="text-xl font-bold text-slate-900">{stats?.totalOpen ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><Clock className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Under Review</p>
                <p className="text-xl font-bold text-slate-900">{stats?.underReview ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertTriangle className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-slate-500">SLA Breaches</p>
                <p className="text-xl font-bold text-red-700">{stats?.slaBreach ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-slate-100 rounded-lg"><CheckCircle2 className="w-4 h-4 text-slate-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Penalties (month)</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalPenaltiesKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["ALL", "OPEN", "UNDER_REVIEW", "UPHELD", "REJECTED", "ESCALATED"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44"><SelectValue placeholder="Type" /></SelectTrigger>
              <SelectContent>
                {["ALL", "DUPLICATE", "WRONG_AMOUNT", "UNAUTHORISED", "NOT_RECEIVED"].map(t => (
                  <SelectItem key={t} value={t}>{TYPE_LABELS[t] ?? t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading disputes...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Initiating DFSP</TableHead>
                  <TableHead className="text-right">Amount</TableHead>
                  <TableHead>SLA Deadline</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.disputes ?? []).map((d) => {
                  const slaBreached = d.slaDeadline && new Date(d.slaDeadline) < new Date() && ["OPEN", "UNDER_REVIEW"].includes(d.status);
                  return (
                    <TableRow key={d.id} className={slaBreached ? "bg-red-50" : ""}>
                      <TableCell className="font-mono text-xs text-slate-500">{d.id.slice(0, 10)}…</TableCell>
                      <TableCell>
                        <Badge variant="outline" className="text-xs">{TYPE_LABELS[d.disputeType] ?? d.disputeType}</Badge>
                      </TableCell>
                      <TableCell>
                        <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[d.status] ?? ""}`}>
                          {d.status}
                        </span>
                      </TableCell>
                      <TableCell className="text-sm">{d.initiatedByDfspId}</TableCell>
                      <TableCell className="text-right font-mono text-sm">{koboToNaira(d.amountKobo)}</TableCell>
                      <TableCell className={`text-xs ${slaBreached ? "text-red-600 font-medium" : "text-slate-500"}`}>
                        {d.slaDeadline ? new Date(d.slaDeadline).toLocaleString() : "—"}
                        {slaBreached && " ⚠ BREACHED"}
                      </TableCell>
                      <TableCell>
                        <div className="flex gap-1">
                          {d.status === "OPEN" && (
                            <Button size="sm" variant="outline" className="text-xs h-7"
                              onClick={() => reviewMutation.mutate({ disputeId: d.id })}
                              disabled={reviewMutation.isPending}>
                              Review
                            </Button>
                          )}
                          {["OPEN", "UNDER_REVIEW"].includes(d.status) && (
                            <>
                              <Button size="sm" className="text-xs h-7 bg-emerald-600 hover:bg-emerald-700"
                                onClick={() => { setSelectedId(d.id); setActionType("uphold"); }}>
                                <CheckCircle2 className="w-3 h-3" />
                              </Button>
                              <Button size="sm" className="text-xs h-7 bg-red-600 hover:bg-red-700"
                                onClick={() => { setSelectedId(d.id); setActionType("reject"); }}>
                                <XCircle className="w-3 h-3" />
                              </Button>
                            </>
                          )}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
                {(data?.disputes ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center text-slate-400 py-8">No disputes found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Action Dialog */}
      <Dialog open={!!actionType} onOpenChange={() => setActionType(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>
              {actionType === "uphold" ? "Uphold Dispute" : actionType === "reject" ? "Reject Dispute" : "Escalate Dispute"}
            </DialogTitle>
          </DialogHeader>
          <div className="space-y-3 pt-2">
            {actionType === "uphold" && (
              <p className="text-sm text-slate-600 bg-emerald-50 border border-emerald-200 rounded p-3">
                Upholding will trigger a TigerBeetle reversal transfer. The payer's position will be restored.
              </p>
            )}
            {actionType === "reject" && (
              <p className="text-sm text-slate-600 bg-red-50 border border-red-200 rounded p-3">
                Rejecting will post a 2% penalty fee against the initiating DFSP via TigerBeetle.
              </p>
            )}
            <Textarea placeholder="Resolution notes..." value={notes} onChange={e => setNotes(e.target.value)} rows={4} />
            <Button
              className={`w-full ${actionType === "uphold" ? "bg-emerald-600 hover:bg-emerald-700" : actionType === "reject" ? "bg-red-600 hover:bg-red-700" : "bg-orange-600 hover:bg-orange-700"}`}
              onClick={handleAction}
              disabled={isActionPending || !notes.trim()}>
              {isActionPending ? "Processing..." : actionType === "uphold" ? "Uphold & Reverse" : actionType === "reject" ? "Reject & Penalise" : "Escalate"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Pagination */}
      {(data?.total ?? 0) > 20 && (
        <div className="flex justify-between items-center">
          <p className="text-sm text-slate-500">Showing {(page - 1) * 20 + 1}–{Math.min(page * 20, data?.total ?? 0)} of {data?.total ?? 0}</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
            <Button variant="outline" size="sm" disabled={page * 20 >= (data?.total ?? 0)} onClick={() => setPage(p => p + 1)}>Next</Button>
          </div>
        </div>
      )}
    </div>
  );
}
