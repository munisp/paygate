import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Plus, ChevronRight, TrendingUp, Clock, CheckCircle2, AlertTriangle, Download } from "lucide-react";

function exportToCSV(rows: any[], filename: string) {
  if (!rows || rows.length === 0) { return; }
  const headers = Object.keys(rows[0]);
  const csv = [
    headers.join(","),
    ...rows.map(r => headers.map(h => JSON.stringify(r[h] ?? "")).join(",")),
  ].join("\n");
  const blob = new Blob([csv], { type: "text/csv" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url; a.download = filename; a.click();
  URL.revokeObjectURL(url);
}

const STATUS_COLORS: Record<string, string> = {
  OPEN: "bg-emerald-100 text-emerald-800 border-emerald-200",
  CLOSED: "bg-amber-100 text-amber-800 border-amber-200",
  SETTLING: "bg-blue-100 text-blue-800 border-blue-200",
  SETTLED: "bg-slate-100 text-slate-700 border-slate-200",
  FAILED: "bg-red-100 text-red-800 border-red-200",
};

function koboToNaira(kobo: number): string {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function SettlementWindows() {
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [typeFilter, setTypeFilter] = useState<string>("ALL");
  const [page, setPage] = useState(1);
  const [openWindowType, setOpenWindowType] = useState<"RTGS" | "DNS_INTRADAY" | "DNS_EOD">("RTGS");
  const [selectedWindowId, setSelectedWindowId] = useState<string | null>(null);

  const { data: stats, refetch: refetchStats } = trpc.nexthubSettlement.getStats.useQuery();

  const { data, isLoading, refetch } = trpc.nexthubSettlement.listWindows.useQuery({
    page,
    pageSize: 20,
    status: statusFilter as any,
    windowType: typeFilter as any,
  });

  const { data: windowDetail } = trpc.nexthubSettlement.getWindow.useQuery(
    { windowId: selectedWindowId! },
    { enabled: !!selectedWindowId }
  );

  const openMutation = trpc.nexthubSettlement.openWindow.useMutation({
    onSuccess: () => { toast.success("Settlement window opened"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const closeMutation = trpc.nexthubSettlement.closeWindow.useMutation({
    onSuccess: () => { toast.success("Window closed — net positions computed"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  const settleMutation = trpc.nexthubSettlement.settleWindow.useMutation({
    onSuccess: () => { toast.success("Settlement initiated via TigerBeetle"); refetch(); refetchStats(); },
    onError: (e) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">Settlement Windows</h1>
          <p className="text-sm text-slate-500 mt-1">NextHub SRBE — TigerBeetle-backed settlement engine</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); refetchStats(); }}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => {
            const rows = (data?.windows ?? []).map(w => ({
              id: w.id,
              type: w.windowType,
              status: w.status,
              openedAt: w.openedAt ? new Date(w.openedAt).toISOString() : "",
              closedAt: w.closedAt ? new Date(w.closedAt).toISOString() : "",
              totalDebit: w.totalDebitKobo ?? 0,
              totalCredit: w.totalCreditKobo ?? 0,
              participantCount: w.participantCount ?? 0,
            }));
            exportToCSV(rows, `settlement-windows-${new Date().toISOString().slice(0,10)}.csv`);
          }} disabled={!data?.windows?.length}>
            <Download className="w-4 h-4 mr-2" /> Export CSV
          </Button>
          <Dialog>
            <DialogTrigger asChild>
              <Button size="sm" className="bg-indigo-600 hover:bg-indigo-700">
                <Plus className="w-4 h-4 mr-2" /> Open Window
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Open Settlement Window</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <label className="text-sm font-medium text-slate-700">Window Type</label>
                  <Select value={openWindowType} onValueChange={(v) => setOpenWindowType(v as any)}>
                    <SelectTrigger className="mt-1">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="RTGS">RTGS (Real-Time Gross Settlement)</SelectItem>
                      <SelectItem value="DNS_INTRADAY">DNS Intraday</SelectItem>
                      <SelectItem value="DNS_EOD">DNS End-of-Day</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <Button
                  className="w-full bg-indigo-600 hover:bg-indigo-700"
                  onClick={() => openMutation.mutate({ windowType: openWindowType })}
                  disabled={openMutation.isPending}
                >
                  {openMutation.isPending ? "Opening..." : "Open Window"}
                </Button>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-emerald-100 rounded-lg"><TrendingUp className="w-4 h-4 text-emerald-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Settled Today</p>
                <p className="text-xl font-bold text-slate-900">{stats?.settledToday ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-blue-100 rounded-lg"><Clock className="w-4 h-4 text-blue-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Open Windows</p>
                <p className="text-xl font-bold text-slate-900">{stats?.openWindows ?? 0}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-indigo-100 rounded-lg"><CheckCircle2 className="w-4 h-4 text-indigo-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Total Settled</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.totalSettledKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="pt-4">
            <div className="flex items-center gap-3">
              <div className="p-2 bg-amber-100 rounded-lg"><AlertTriangle className="w-4 h-4 text-amber-600" /></div>
              <div>
                <p className="text-xs text-slate-500">Pending Settlement</p>
                <p className="text-sm font-bold text-slate-900">{koboToNaira(stats?.pendingSettlementKobo ?? 0)}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex items-center gap-3">
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-40">
                <SelectValue placeholder="Status" />
              </SelectTrigger>
              <SelectContent>
                {["ALL", "OPEN", "CLOSED", "SETTLING", "SETTLED", "FAILED"].map(s => (
                  <SelectItem key={s} value={s}>{s}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={typeFilter} onValueChange={setTypeFilter}>
              <SelectTrigger className="w-44">
                <SelectValue placeholder="Window Type" />
              </SelectTrigger>
              <SelectContent>
                {["ALL", "RTGS", "DNS_INTRADAY", "DNS_EOD"].map(t => (
                  <SelectItem key={t} value={t}>{t}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-slate-400">Loading settlement windows...</div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Window ID</TableHead>
                  <TableHead>Type</TableHead>
                  <TableHead>Status</TableHead>
                  <TableHead>Currency</TableHead>
                  <TableHead className="text-right">Total Amount</TableHead>
                  <TableHead className="text-right">Transfers</TableHead>
                  <TableHead>Opened At</TableHead>
                  <TableHead>Actions</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(data?.windows ?? []).map((w) => (
                  <TableRow key={w.id} className="cursor-pointer hover:bg-slate-50">
                    <TableCell className="font-mono text-xs text-slate-600">{w.id.slice(0, 12)}…</TableCell>
                    <TableCell>
                      <Badge variant="outline" className="text-xs">{w.windowType}</Badge>
                    </TableCell>
                    <TableCell>
                      <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium border ${STATUS_COLORS[w.status] ?? ""}`}>
                        {w.status}
                      </span>
                    </TableCell>
                    <TableCell>{w.currency}</TableCell>
                    <TableCell className="text-right font-mono text-sm">
                      {koboToNaira(w.totalAmountKobo ?? 0)}
                    </TableCell>
                    <TableCell className="text-right">{w.totalTransfers ?? 0}</TableCell>
                    <TableCell className="text-xs text-slate-500">
                      {new Date(w.openedAt ?? w.createdAt).toLocaleString()}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {w.status === "OPEN" && (
                          <Button size="sm" variant="outline" className="text-xs h-7"
                            onClick={() => closeMutation.mutate({ windowId: w.id })}
                            disabled={closeMutation.isPending}>
                            Close
                          </Button>
                        )}
                        {w.status === "CLOSED" && (
                          <Button size="sm" className="text-xs h-7 bg-indigo-600 hover:bg-indigo-700"
                            onClick={() => settleMutation.mutate({ windowId: w.id })}
                            disabled={settleMutation.isPending}>
                            Settle
                          </Button>
                        )}
                        <Button size="sm" variant="ghost" className="text-xs h-7"
                          onClick={() => setSelectedWindowId(w.id)}>
                          <ChevronRight className="w-3 h-3" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {(data?.windows ?? []).length === 0 && (
                  <TableRow>
                    <TableCell colSpan={8} className="text-center text-slate-400 py-8">
                      No settlement windows found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* Net Positions Detail Dialog */}
      {selectedWindowId && windowDetail && (
        <Dialog open={!!selectedWindowId} onOpenChange={() => setSelectedWindowId(null)}>
          <DialogContent className="max-w-2xl">
            <DialogHeader>
              <DialogTitle>Net Positions — Window {selectedWindowId.slice(0, 12)}…</DialogTitle>
            </DialogHeader>
            <div className="space-y-3 max-h-96 overflow-y-auto">
              {windowDetail.positions.length === 0 ? (
                <p className="text-slate-400 text-sm text-center py-4">No net positions computed yet</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>DFSP</TableHead>
                      <TableHead className="text-right">Debits</TableHead>
                      <TableHead className="text-right">Credits</TableHead>
                      <TableHead className="text-right">Net Position</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {windowDetail.positions.map((p) => (
                      <TableRow key={p.id}>
                        <TableCell className="font-medium">{p.dfspName}</TableCell>
                        <TableCell className="text-right text-red-600 font-mono text-sm">
                          {koboToNaira(p.totalDebitsKobo ?? 0)}
                        </TableCell>
                        <TableCell className="text-right text-emerald-600 font-mono text-sm">
                          {koboToNaira(p.totalCreditsKobo ?? 0)}
                        </TableCell>
                        <TableCell className={`text-right font-mono text-sm font-bold ${(p.netPositionKobo ?? 0) >= 0 ? "text-emerald-700" : "text-red-700"}`}>
                          {koboToNaira(p.netPositionKobo ?? 0)}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </div>
          </DialogContent>
        </Dialog>
      )}

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
