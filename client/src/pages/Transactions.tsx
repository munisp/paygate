import { useState } from "react";
import { Search, Download, RefreshCw, ChevronLeft, ChevronRight, Eye, Copy } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-50 text-emerald-700 border-emerald-200",
    success:   "bg-emerald-50 text-emerald-700 border-emerald-200",
    pending:   "bg-amber-50 text-amber-700 border-amber-200",
    processing:"bg-blue-50 text-blue-700 border-blue-200",
    failed:    "bg-red-50 text-red-700 border-red-200",
  };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${map[status] ?? map.pending}`}>{status}</span>;
}

function TransactionDetailDialog({ txId, onClose }: { txId: string; onClose: () => void }) {
  const { data: tx, isLoading } = trpc.transactions.get.useQuery({ id: txId }, { enabled: !!txId });

  const copyRef = (ref: string) => {
    navigator.clipboard.writeText(ref).then(() => toast.success("Copied to clipboard"));
  };

  return (
    <Dialog open={!!txId} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Transaction Details</DialogTitle>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : tx ? (
          <div className="space-y-4 py-2">
            <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
              <span className="text-xs text-muted-foreground font-medium uppercase tracking-wide">Reference</span>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm font-semibold">{tx.reference}</span>
                <button onClick={() => copyRef(tx.reference)} className="text-muted-foreground hover:text-foreground">
                  <Copy className="w-3.5 h-3.5" />
                </button>
              </div>
            </div>
            {[
              { label: "Amount", value: `${tx.currency} ${Number(tx.amount).toLocaleString()}` },
              { label: "Fee", value: tx.feeAmount ? `${tx.currency} ${Number(tx.feeAmount).toLocaleString()}` : "—" },
              { label: "Net Amount", value: tx.netAmount ? `${tx.currency} ${Number(tx.netAmount).toLocaleString()}` : "—" },
              { label: "Channel", value: tx.channel?.replace("_", " ") ?? "—" },
              { label: "Customer", value: tx.customerName ?? tx.customerEmail ?? "—" },
              { label: "Description", value: tx.description ?? "—" },
              { label: "Created", value: new Date(tx.createdAt).toLocaleString() },
              { label: "Completed", value: tx.completedAt ? new Date(tx.completedAt).toLocaleString() : "—" },
            ].map(({ label, value }) => (
              <div key={label} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <span className="text-sm text-muted-foreground">{label}</span>
                <span className="text-sm font-medium capitalize">{value}</span>
              </div>
            ))}
            <div className="flex items-center justify-between py-1.5">
              <span className="text-sm text-muted-foreground">Status</span>
              <StatusBadge status={tx.status} />
            </div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground py-4 text-center">Transaction not found</p>
        )}
      </DialogContent>
    </Dialog>
  );
}

export default function Transactions() {
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState<string | undefined>();
  const [exporting, setExporting] = useState(false);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const limit = 20;

  const utils = trpc.useUtils();

  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.export.transactions.fetch({ status: statusFilter });
      const blob = new Blob([result.csv], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `transactions-${new Date().toISOString().split("T")[0]}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count.toLocaleString()} transactions`);
    } catch {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const { data, isLoading, refetch, isFetching } = trpc.transactions.list.useQuery(
    { limit, offset: page * limit, search: search || undefined, status: statusFilter as any },
    { staleTime: 30_000 }
  );

  const rows = data?.rows ?? [];
  const total = data?.total ?? 0;
  const totalPages = Math.ceil(total / limit);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Transactions</h1>
          <p className="text-sm text-muted-foreground mt-0.5">{total.toLocaleString()} total transactions</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={() => { refetch(); }} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={exporting}>
            <Download className={`w-4 h-4 mr-1.5 ${exporting ? "animate-spin" : ""}`} />
            {exporting ? "Exporting..." : "Export CSV"}
          </Button>
        </div>
      </div>

      <div className="flex gap-3">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
          <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(0); }}
            placeholder="Search by reference, customer..." className="w-full pl-9 pr-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none" />
        </div>
        <select value={statusFilter ?? ""} onChange={(e) => { setStatusFilter(e.target.value || undefined); setPage(0); }}
          className="px-3 py-2 text-sm bg-muted rounded-lg border-0 focus:ring-2 focus:ring-primary outline-none">
          <option value="">All statuses</option>
          <option value="completed">Completed</option>
          <option value="pending">Pending</option>
          <option value="processing">Processing</option>
          <option value="failed">Failed</option>
        </select>
      </div>

      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <table className="w-full text-sm">
          <thead className="bg-muted/50 border-b border-border">
            <tr>
              {["Reference", "Customer", "Amount", "Channel", "Status", "Date", ""].map((h) => (
                <th key={h} className="px-4 py-3 text-left text-xs font-medium text-muted-foreground uppercase tracking-wide">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-border">
            {isLoading ? Array(8).fill(0).map((_, i) => (
              <tr key={i}><td colSpan={7} className="px-4 py-3"><Skeleton className="h-5 w-full" /></td></tr>
            )) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-4 py-12 text-center text-muted-foreground">No transactions found</td></tr>
            ) : rows.map((txn) => (
              <tr key={txn.id} className="hover:bg-muted/30 transition-colors">
                <td className="px-4 py-3 font-mono text-xs text-muted-foreground">{txn.reference}</td>
                <td className="px-4 py-3 font-medium">{txn.customerName ?? txn.customerEmail ?? "—"}</td>
                <td className="px-4 py-3 font-mono font-semibold">{txn.currency} {Number(txn.amount).toLocaleString()}</td>
                <td className="px-4 py-3 text-muted-foreground capitalize">{txn.channel.replace("_", " ")}</td>
                <td className="px-4 py-3"><StatusBadge status={txn.status} /></td>
                <td className="px-4 py-3 text-muted-foreground text-xs">{new Date(txn.createdAt).toLocaleString()}</td>
                <td className="px-4 py-3">
                  <button onClick={() => setSelectedTxId(txn.id)} className="p-1.5 rounded hover:bg-muted transition-colors" title="View details">
                    <Eye className="w-4 h-4 text-muted-foreground" />
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Page {page + 1} of {totalPages} · {total.toLocaleString()} results</p>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      )}

      {selectedTxId && (
        <TransactionDetailDialog txId={selectedTxId} onClose={() => setSelectedTxId(null)} />
      )}
    </div>
  );
}
