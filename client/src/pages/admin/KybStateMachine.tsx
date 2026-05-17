// @ts-nocheck
import { useState, useCallback, useRef } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { Shield, CheckCircle, XCircle, Clock, AlertTriangle, RefreshCw, FileText, ChevronLeft, ChevronRight, Search, Download } from "lucide-react";

const KYB_STATES = [
  { id: "pending", label: "Pending", color: "bg-gray-100 text-gray-700" },
  { id: "documents_requested", label: "Docs Requested", color: "bg-blue-100 text-blue-700" },
  { id: "under_review", label: "Under Review", color: "bg-yellow-100 text-yellow-700" },
  { id: "additional_info", label: "Info Needed", color: "bg-orange-100 text-orange-700" },
  { id: "approved", label: "Approved", color: "bg-green-100 text-green-700" },
  { id: "rejected", label: "Rejected", color: "bg-red-100 text-red-700" },
  { id: "suspended", label: "Suspended", color: "bg-purple-100 text-purple-700" },
];

const TRANSITIONS: Record<string, string[]> = {
  pending: ["documents_requested", "under_review"],
  documents_requested: ["under_review", "rejected"],
  under_review: ["approved", "rejected", "additional_info"],
  additional_info: ["under_review", "rejected"],
  approved: ["suspended"],
  rejected: ["pending"],
  suspended: ["approved", "rejected"],
};

const PAGE_SIZE = 20;

export default function KybStateMachine() {
  // Pagination state
  const [page, setPage] = useState(1);
  const [cursors, setCursors] = useState<(string | undefined)[]>([undefined]); // cursors[0] = undefined (first page)

  // Filter state (debounced search)
  const [searchInput, setSearchInput] = useState("");
  const [search, setSearch] = useState("");
  const [filterState, setFilterState] = useState("");
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Dialog state
  const [selected, setSelected] = useState<any>(null);
  const [transitionNote, setTransitionNote] = useState("");
  const [targetState, setTargetState] = useState("");

  // Debounced search handler
  const handleSearchChange = useCallback((value: string) => {
    setSearchInput(value);
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      setSearch(value);
      // Reset pagination when search changes
      setPage(1);
      setCursors([undefined]);
    }, 400);
  }, []);

  // Reset pagination when filter changes
  const handleFilterChange = (value: string) => {
    setFilterState(value === "all" ? "" : value);
    setPage(1);
    setCursors([undefined]);
  };

  const currentCursor = cursors[page - 1];

  const { data, isLoading, refetch } = trpc.wave30.kybStateMachine.listSubmissions.useQuery({
    status: filterState || undefined,
    search: search || undefined,
    limit: PAGE_SIZE,
    cursor: currentCursor,
  }, { staleTime: 30_000 });

  const submissions = data?.items ?? [];
  const nextCursor = data?.nextCursor;
  const hasNextPage = !!nextCursor;
  const hasPrevPage = page > 1;

  const goToNextPage = () => {
    if (!nextCursor) return;
    const newCursors = [...cursors];
    newCursors[page] = nextCursor;
    setCursors(newCursors);
    setPage(page + 1);
  };

  const goToPrevPage = () => {
    if (page <= 1) return;
    setPage(page - 1);
  };

  const { data: auditLog } = trpc.wave30.kybStateMachine.getAuditLog.useQuery(
    { merchantId: selected?.merchant_id },
    { enabled: !!selected?.merchant_id }, staleTime: 30_000})

  const transition = trpc.wave30.kybStateMachine.transition.useMutation({
    onSuccess: () => {
      toast.success(`KYB status updated to ${targetState}`);
      setSelected(null);
      setTransitionNote("");
      setTargetState("");
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const requestDocs = trpc.wave30.kybStateMachine.requestDocuments.useMutation({
    onSuccess: () => { toast.success("Document request sent"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const [csvExporting, setCsvExporting] = useState(false);
  const exportCsvQuery = trpc.wave30.kybStateMachine.exportCsv.useQuery(
    { status: filterState || undefined, search: search || undefined },
    { enabled: false }, staleTime: 30_000})

  const handleExportCsv = async () => {
    setCsvExporting(true);
    try {
      const result = await exportCsvQuery.refetch();
      const csv = result.data?.csv ?? '';
      if (!csv) { toast.error('No data to export'); return; }
      const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `kyb-submissions-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.data?.count ?? 0} records`);
    } catch (e: any) {
      toast.error(e.message ?? 'Export failed');
    } finally {
      setCsvExporting(false);
    }
  };

  const availableTransitions = selected ? (TRANSITIONS[selected.status] ?? []) : [];

  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">KYB State Machine</h1>
          <p className="text-gray-500 text-sm mt-1">Know Your Business lifecycle management with full audit trail</p>
        </div>
      </div>

      {/* State Flow Diagram */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base font-semibold text-gray-700">KYB Lifecycle States</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center gap-2 flex-wrap">
            {KYB_STATES.map((state, i) => (
              <div key={state.id} className="flex items-center gap-2">
                <Badge className={`${state.color} text-xs px-3 py-1`}>{state.label}</Badge>
                {i < KYB_STATES.length - 1 && <span className="text-gray-300">→</span>}
              </div>
            ))}
          </div>
          <p className="text-xs text-gray-400 mt-2">Transitions are governed by business rules. Rejected applications can be resubmitted.</p>
        </CardContent>
      </Card>

      {/* Filters */}
      <div className="flex gap-3 items-center">
        <div className="relative max-w-sm flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none" />
          <Input
            placeholder="Search by business name or email..."
            className="pl-9"
            value={searchInput}
            onChange={(e) => handleSearchChange(e.target.value)}
          />
        </div>
        <Select value={filterState || "all"} onValueChange={handleFilterChange}>
          <SelectTrigger className="w-44">
            <SelectValue placeholder="All States" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All States</SelectItem>
            {KYB_STATES.map((s) => (
              <SelectItem key={s.id} value={s.id}>{s.label}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()} title="Refresh"><RefreshCw/>
        </Button>
        <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={csvExporting} title="Download CSV">
          <Download className={`w-4 h-4 mr-1 ${csvExporting ? "animate-pulse" : ""}`} />
          {csvExporting ? "Exporting…" : "CSV"}
        </Button>
      </div>

      {/* Submissions Table */}
      <Card>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Business</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>State</TableHead>
                <TableHead>Risk Score</TableHead>
                <TableHead>Submitted</TableHead>
                <TableHead>Last Updated</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {isLoading ? (
                Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <TableRow key={i}>
                    {Array.from({ length: 7 }).map((_, j) => (
                      <TableCell key={j}><div className="h-4 bg-muted animate-pulse rounded" /></TableCell>
                    ))}
                  </TableRow>
                ))
              ) : !submissions.length ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center py-12 text-gray-400">
                    <Shield className="w-8 h-8 mx-auto mb-2 opacity-30" />
                    {search || filterState ? "No submissions match your filters." : "No KYB submissions found."}
                  </TableCell>
                </TableRow>
              ) : submissions.map((sub: any) => {
                const state = KYB_STATES.find((s) => s.id === sub.status);
                return (
                  <TableRow key={sub.id} className="hover:bg-muted/30 transition-colors">
                    <TableCell className="font-medium text-sm">{sub.business_name ?? "—"}</TableCell>
                    <TableCell className="text-sm text-gray-600">{sub.email ?? "—"}</TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${state?.color ?? 'bg-gray-100 text-gray-700'}`}>
                        {state?.label ?? sub.status}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {sub.risk_score != null ? (
                        <span className={`font-semibold text-sm ${sub.risk_score > 70 ? 'text-red-600' : sub.risk_score > 40 ? 'text-yellow-600' : 'text-green-600'}`}>
                          {sub.risk_score}
                        </span>
                      ) : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {sub.submitted_at ? new Date(sub.submitted_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {sub.updated_at ? new Date(sub.updated_at).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        <Button size="sm" variant="outline" className="text-xs"
                          onClick={() => { setSelected(sub); setTargetState(""); }}>
                          <FileText className="w-3 h-3 mr-1" /> Review
                        </Button>
                        {sub.status === 'pending' && (
                          <Button size="sm" variant="outline" className="text-xs text-blue-700 border-blue-300"
                            onClick={() => requestDocs.mutate({ merchantId: sub.merchant_id })}>
                            Request Docs
                          </Button>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>

          {/* Pagination Controls */}
          {(hasPrevPage || hasNextPage || submissions.length > 0) && (
            <div className="flex items-center justify-between px-4 py-3 border-t bg-muted/20">
              <p className="text-xs text-muted-foreground">
                Page {page} · Showing {submissions.length} result{submissions.length !== 1 ? "s" : ""}
                {search && ` for "${search}"`}
                {filterState && ` · ${KYB_STATES.find(s => s.id === filterState)?.label ?? filterState}`}
              </p>
              <div className="flex items-center gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToPrevPage}
                  disabled={!hasPrevPage || isLoading}
                  className="h-8 px-3"
                >
                  <ChevronLeft className="w-4 h-4 mr-1" /> Previous
                </Button>
                <span className="text-xs font-medium text-muted-foreground px-2">
                  Page {page}
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={goToNextPage}
                  disabled={!hasNextPage || isLoading}
                  className="h-8 px-3"
                >
                  Next <ChevronRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Transition Dialog */}
      <Dialog open={!!selected} onOpenChange={(open) => !open && setSelected(null)}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>KYB Review — {selected?.business_name ?? "Merchant"}</DialogTitle>
          </DialogHeader>
          {selected && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-gray-500 mb-1">Current State</p>
                  <Badge className={`${KYB_STATES.find(s => s.id === selected.status)?.color ?? ''} text-xs`}>
                    {selected.status}
                  </Badge>
                </div>
                <div><p className="text-gray-500">Risk Score</p>
                  <p className="font-semibold">{selected.risk_score ?? "—"}</p></div>
                <div><p className="text-gray-500">Business Type</p>
                  <p className="font-medium">{selected.business_type ?? "—"}</p></div>
                <div><p className="text-gray-500">Registration #</p>
                  <p className="font-mono text-xs">{selected.registration_number ?? "—"}</p></div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-2">Transition To</p>
                <div className="flex gap-2 flex-wrap">
                  {availableTransitions.length === 0 ? (
                    <p className="text-xs text-muted-foreground">No transitions available from this state.</p>
                  ) : availableTransitions.map((state) => {
                    const s = KYB_STATES.find((k) => k.id === state);
                    return (
                      <Button key={state} size="sm" variant="outline"
                        className={`text-xs ${targetState === state ? 'ring-2 ring-indigo-500 bg-indigo-50' : ''}`}
                        onClick={() => setTargetState(state)}>
                        {s?.label ?? state}
                      </Button>
                    );
                  })}
                </div>
              </div>

              <div>
                <p className="text-sm font-medium text-gray-700 mb-1">Review Note</p>
                <Textarea placeholder="Add review notes, reason for decision..."
                  value={transitionNote} onChange={(e) => setTransitionNote(e.target.value)} rows={3} />
              </div>

              <div className="flex gap-3 justify-end">
                <Button variant="outline" onClick={() => setSelected(null)}>Cancel</Button>
                <Button className="bg-indigo-600 hover:bg-indigo-700 text-white"
                  disabled={!targetState || transition.isLoading}
                  onClick={() => transition.mutate({
                    merchantId: selected.merchant_id,
                    newStatus: targetState,
                    note: transitionNote,
                  })}>
                  {transition.isLoading ? "Applying..." : "Apply Transition"}
                </Button>
              </div>

              {/* Audit Log */}
              {auditLog && auditLog.length > 0 && (
                <div>
                  <p className="text-sm font-medium text-gray-700 mb-2">Audit Trail</p>
                  <div className="space-y-1 max-h-48 overflow-y-auto pr-1">
                    {auditLog.map((log: any) => (
                      <div key={log.id} className="flex items-start gap-2 text-xs p-2 bg-gray-50 rounded">
                        <span className="text-gray-400 shrink-0">{new Date(log.created_at).toLocaleString()}</span>
                        <span className="font-medium shrink-0">{log.from_status} → {log.to_status}</span>
                        {log.note && <span className="text-gray-500 truncate">{log.note}</span>}
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
