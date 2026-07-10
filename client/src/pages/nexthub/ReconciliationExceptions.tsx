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
import { RefreshCw, AlertCircle, CheckCircle2, Clock, TrendingDown } from "lucide-react";

const SEVERITY_COLORS: Record<string, string> = {
  LOW: "bg-slate-100 text-slate-600 border-slate-200",
  MEDIUM: "bg-amber-100 text-amber-700 border-amber-200",
  HIGH: "bg-orange-100 text-orange-700 border-orange-200",
  CRITICAL: "bg-red-100 text-red-700 border-red-200",
};

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-red-100 text-red-700 border-red-200",
  AUTO_RESOLVED: "bg-emerald-100 text-emerald-700 border-emerald-200",
  ESCALATED: "bg-orange-100 text-orange-700 border-orange-200",
  CLOSED: "bg-slate-100 text-slate-600 border-slate-200",
};

const BREAK_TYPE_LABELS: Record<string, string> = {
  TIMING: "Timing (2h SLA)",
  AMOUNT: "Amount Mismatch (4h SLA)",
  MISSING_DEBIT: "Missing Debit (1h SLA)",
  DUPLICATE_CREDIT: "Duplicate Credit (30min SLA)",
};

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function ReconciliationExceptions() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [severityFilter, setSeverityFilter] = useState<string>("ALL");
  const [breakTypeFilter, setBreakTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [resolveNotes, setResolveNotes] = useState("");
  const [escalateTo, setEscalateTo] = useState("");
  const [resolveDialogOpen, setResolveDialogOpen] = useState(false);
  const [escalateDialogOpen, setEscalateDialogOpen] = useState(false);

  const { data: stats, refetch: refetchStats } = trpc.nexthubReconciliation.getStats.useQuery();

  const { data, isLoading, refetch } = trpc.nexthubReconciliation.listExceptions.useQuery({
    page,
    pageSize: 20,
    status: statusFilter as any,
    severity: severityFilter as any,
    breakType: breakTypeFilter as any,
  });

  const resolveMutation = trpc.nexthubReconciliation.resolveException.useMutation({
    onSuccess: () => {
      toast.success("Exception resolved");
      setResolveDialogOpen(false);
      setResolveNotes("");
      setSelectedId(null);
      refetch(); refetchStats();
    },
    onError: (e) => toast.error(e.message),
  });

  const escalateMutation = trpc.nexthubReconciliation.escalateException.useMutation({
    onSuccess: () => {
      toast.success("Exception escalated");
      setEscalateDialogOpen(false);
      setEscalateTo("");
      setSelectedId(null);
      refetch(); refetchStats();
    },
    onError: (e) => toast.error(e.message),
  });

  const autoResolveMutation = trpc.nexthubReconciliation.autoResolveSlaBreaches.useMutation({
    onSuccess: (r) => { toast.success(`Auto-resolved ${r.resolved} SLA breaches`); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Reconciliation Exceptions</h1>
          <p className="text-sm text-slate-500 mt-1">Hub vs. rail break detection with SLA-driven auto-resolution</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => autoResolveMutation.mutate()} disabled={autoResolveMutation.isPending}>
            <CheckCircle2 className="w-4 h-4 mr-2" /> Auto-Resolve SLA
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-100 rounded-lg"><AlertCircle className="w-4 h-4 text-red-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Open Exceptions</p>
                <p className="text-xl font-bold text-slate-900">{stats?.totalOpen ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-red-200 rounded-lg"><AlertCircle className="w-4 h-4 text-red-700" /></div>
              <div>
                <p className="text-xs text-slate-500">Critical</p>
                <p className="text-xl font-bold text-red-700">{stats?.totalCritical ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-orange-100 rounded-lg"><Clock className="w-4 h-4 text-orange-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Escalated</p>
                <p className="text-xl font-bold text-slate-900">{stats?.totalEscalated ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><TrendingDown className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Discrepancy</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalDiscrepancyKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Break type distribution */}
      {stats?.byBreakType && stats.byBreakType.length > 0 && (
        <div className="flex gap-3 flex-wrap">
          {stats.byBreakType.map((b) => (
            <div key={b.breakType} className="flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-lg px-3 py-2">
              <span className="text-xs text-slate-500">{BREAK_TYPE_LABELS[b.breakType] ?? b.breakType}</span>
              <Badge variant="secondary">{b.count}</Badge>
            </div>
          ))}
        </div>
      )}

      {/* Filters + Table */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex gap-3 flex-wrap">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Status" /></SelectTrigger>
              <SelectContent>
                {["ALL", "OPEN", "AUTO_RESOLVED", "ESCALATED", "CLOSED"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={severityFilter} onValueChange={setSeverityFilter}>
              <SelectTrigger className="w-36"><SelectValue placeholder="Severity" /></SelectTrigger>
              <SelectContent>
                {["ALL", "LOW", "MEDIUM", "HIGH", "CRITICAL"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={breakTypeFilter} onValueChange={setBreakTypeFilter}>
              <SelectTrigger className="w-52"><SelectValue placeholder="Break Type" /></SelectTrigger>
              <SelectContent>
                {["ALL", "TIMING", "AMOUNT", "MISSING_DEBIT", "DUPLICATE_CREDIT"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading exceptions...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>ID</TableHead>
                  <TableHead>Break Type</TableHead>
                  <TableHead>Severity</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>DFSP</TableHead>
                  <TableHead className="text-right">Discrepancy</TableHead>
                  <TableHead>SLA</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.exceptions ?? []).map((ex) => (
                  <TableRow key={ex.id}>
                    <TableCell className="font-mono text-xs text-slate-500">{ex.id.slice(0, 10)}…</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{ex.breakType}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${SEVERITY_COLORS[ex.severity] ?? ""}`}>
                        {ex.severity}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[ex.status] ?? ""}`}>
                        {ex.status}
                      </span>
                    </TableCell>
                    <TableCell className="text-sm">{ex.dfspId ?? "—"}</TableCell>
                    <TableCell className="text-right font-mono text-sm text-red-600">
                      {ex.discrepancyAmountKobo ? koboToNaira(ex.discrepancyAmountKobo) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {ex.autoResolveSlaMinutes ? `${ex.autoResolveSlaMinutes}min` : "—"}
                    </TableCell>
                    <TableCell>
                      {ex.status === "OPEN" && (
                        <div className="flex gap-1">
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => { setSelectedId(ex.id); setResolveDialogOpen(true); }}>
                            Resolve
                          </Button>
                          <Button size="sm" variant="ghost" className="text-xs h-7 text-orange-600"
                            onClick={() => { setSelectedId(ex.id); setEscalateDialogOpen(true); }}>
                            Escalate
                          </Button>
                        </div>
                      )}
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.exceptions ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-400 py-8">No exceptions found</TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Resolve Dialog */}
      <Dialog open={resolveDialogOpen} onOpenChange={setResolveDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Resolve Exception</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Textarea placeholder="Resolution notes..." value={resolveNotes} onChange={e => setResolveNotes(e.target.value)} rows={4} />
            <Button className="w-full bg-emerald-600 hover:bg-emerald-700"
              onClick={() => selectedId && resolveMutation.mutate({ exceptionId: selectedId, resolutionNotes: resolveNotes })}
              disabled={resolveMutation.isPending || !resolveNotes.trim()}>
              {resolveMutation.isPending ? "Resolving..." : "Mark Resolved"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Escalate Dialog */}
      <Dialog open={escalateDialogOpen} onOpenChange={setEscalateDialogOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Escalate Exception</DialogTitle></DialogHeader>
          <div className="space-y-3 pt-2">
            <Input placeholder="Assign to (email or name)" value={escalateTo} onChange={e => setEscalateTo(e.target.value)} />
            <Button className="w-full bg-orange-600 hover:bg-orange-700"
              onClick={() => selectedId && escalateMutation.mutate({ exceptionId: selectedId, assignedTo: escalateTo })}
              disabled={escalateMutation.isPending || !escalateTo.trim()}>
              {escalateMutation.isPending ? "Escalating..." : "Escalate to Compliance"}
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
