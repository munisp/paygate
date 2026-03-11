import { useState, useMemo } from "react";
import { Search, Filter, Download, RefreshCw, ChevronLeft, ChevronRight, CheckCircle2, Clock, XCircle, Eye } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

const ALL_TRANSACTIONS = Array.from({ length: 80 }, (_, i) => {
  const statuses = ["success", "pending", "failed"] as const;
  const methods = ["Card", "Mobile Money", "Bank Transfer", "USSD", "M-Pesa", "PAPSS"];
  const customers = ["Adaeze Okonkwo", "Kwame Asante", "Fatima Al-Rashid", "Sipho Dlamini", "Amara Diallo", "Chidi Eze", "Naledi Mokoena", "Emeka Obi", "Aisha Bello", "Kofi Mensah"];
  const currencies = ["NGN", "GHS", "KES", "ZAR", "XOF", "USD"];
  const flags = ["🇳🇬", "🇬🇭", "🇰🇪", "🇿🇦", "🇸🇳", "🇺🇸"];
  const idx = i % customers.length;
  const cIdx = i % currencies.length;
  const status = i % 10 === 0 ? "failed" : i % 5 === 0 ? "pending" : "success";
  const amounts: Record<string, number> = { NGN: Math.floor(Math.random() * 500000) + 10000, GHS: Math.floor(Math.random() * 2000) + 50, KES: Math.floor(Math.random() * 50000) + 500, ZAR: Math.floor(Math.random() * 5000) + 100, XOF: Math.floor(Math.random() * 100000) + 1000, USD: Math.floor(Math.random() * 1000) + 10 };
  const now = new Date();
  now.setMinutes(now.getMinutes() - i * 7);
  return {
    id: `TXN-${String(i + 1).padStart(5, "0")}`,
    customer: customers[idx],
    amount: amounts[currencies[cIdx]],
    currency: currencies[cIdx],
    flag: flags[cIdx],
    status,
    method: methods[i % methods.length],
    reference: `REF${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    date: now.toLocaleString(),
    fee: Math.floor(amounts[currencies[cIdx]] * 0.015),
  };
});

const StatusBadge = ({ status }: { status: string }) => {
  const cfg: Record<string, { icon: any; cls: string; label: string }> = {
    success: { icon: CheckCircle2, cls: "status-success", label: "Success" },
    pending: { icon: Clock, cls: "status-pending", label: "Pending" },
    failed: { icon: XCircle, cls: "status-failed", label: "Failed" },
  };
  const c = cfg[status] || cfg.pending;
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${c.cls}`}>
      <c.icon className="w-3 h-3" />
      {c.label}
    </span>
  );
};

export default function Transactions() {
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [methodFilter, setMethodFilter] = useState("all");
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string[]>([]);
  const PER_PAGE = 15;

  const filtered = useMemo(() => {
    return ALL_TRANSACTIONS.filter((t) => {
      const matchSearch = !search || t.customer.toLowerCase().includes(search.toLowerCase()) || t.id.toLowerCase().includes(search.toLowerCase()) || t.reference.toLowerCase().includes(search.toLowerCase());
      const matchStatus = statusFilter === "all" || t.status === statusFilter;
      const matchMethod = methodFilter === "all" || t.method === methodFilter;
      return matchSearch && matchStatus && matchMethod;
    });
  }, [search, statusFilter, methodFilter]);

  const totalPages = Math.ceil(filtered.length / PER_PAGE);
  const paginated = filtered.slice((page - 1) * PER_PAGE, page * PER_PAGE);

  const toggleSelect = (id: string) => {
    setSelected((prev) => prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]);
  };

  const handleExport = () => {
    toast.success(`Exporting ${selected.length || filtered.length} transactions as CSV`);
  };

  const stats = {
    total: ALL_TRANSACTIONS.length,
    success: ALL_TRANSACTIONS.filter((t) => t.status === "success").length,
    pending: ALL_TRANSACTIONS.filter((t) => t.status === "pending").length,
    failed: ALL_TRANSACTIONS.filter((t) => t.status === "failed").length,
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
            Transactions
          </h1>
          <p className="text-muted-foreground text-sm mt-0.5">
            {ALL_TRANSACTIONS.length.toLocaleString()} total transactions
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => toast.success("Refreshed")}>
            <RefreshCw className="w-4 h-4 mr-2" />
            Refresh
          </Button>
          <Button size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />
            Export CSV
          </Button>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total", value: stats.total, cls: "text-foreground" },
          { label: "Successful", value: stats.success, cls: "text-emerald-600" },
          { label: "Pending", value: stats.pending, cls: "text-amber-600" },
          { label: "Failed", value: stats.failed, cls: "text-red-600" },
        ].map((s) => (
          <div key={s.label} className="stat-card text-center">
            <p className={`text-2xl font-bold amount ${s.cls}`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>
              {s.value.toLocaleString()}
            </p>
            <p className="text-sm text-muted-foreground mt-1">{s.label}</p>
          </div>
        ))}
      </div>

      {/* Filters */}
      <div className="bg-card rounded-xl border border-border p-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative flex-1 min-w-[200px]">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(1); }}
              placeholder="Search by customer, ID, or reference..."
              className="w-full pl-9 pr-4 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
            />
          </div>

          <select
            value={statusFilter}
            onChange={(e) => { setStatusFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Status</option>
            <option value="success">Success</option>
            <option value="pending">Pending</option>
            <option value="failed">Failed</option>
          </select>

          <select
            value={methodFilter}
            onChange={(e) => { setMethodFilter(e.target.value); setPage(1); }}
            className="px-3 py-2 text-sm bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring"
          >
            <option value="all">All Methods</option>
            <option value="Card">Card</option>
            <option value="Mobile Money">Mobile Money</option>
            <option value="Bank Transfer">Bank Transfer</option>
            <option value="USSD">USSD</option>
            <option value="M-Pesa">M-Pesa</option>
          </select>

          {selected.length > 0 && (
            <Badge variant="secondary" className="px-3 py-1.5">
              {selected.length} selected
            </Badge>
          )}
        </div>
      </div>

      {/* Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                <th className="w-10 px-4 py-3">
                  <input
                    type="checkbox"
                    onChange={(e) => setSelected(e.target.checked ? paginated.map((t) => t.id) : [])}
                    checked={selected.length === paginated.length && paginated.length > 0}
                    className="rounded border-border"
                  />
                </th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Transaction ID</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Customer</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Amount</th>
                <th className="text-right text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Fee</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Method</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Status</th>
                <th className="text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider px-4 py-3">Date</th>
                <th className="w-10 px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {paginated.map((txn) => (
                <tr
                  key={txn.id}
                  className={`hover:bg-muted/30 transition-colors ${selected.includes(txn.id) ? "bg-primary/5" : ""}`}
                >
                  <td className="px-4 py-3">
                    <input
                      type="checkbox"
                      checked={selected.includes(txn.id)}
                      onChange={() => toggleSelect(txn.id)}
                      className="rounded border-border"
                    />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-mono text-primary">{txn.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2">
                      <span className="text-base">{txn.flag}</span>
                      <div>
                        <p className="text-sm font-medium text-foreground">{txn.customer}</p>
                        <p className="text-xs text-muted-foreground font-mono">{txn.reference}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm font-semibold amount text-foreground">
                      {txn.currency} {txn.amount.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-right">
                    <span className="text-sm text-muted-foreground amount">
                      {txn.currency} {txn.fee.toLocaleString()}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm text-muted-foreground">{txn.method}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={txn.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{txn.date}</span>
                  </td>
                  <td className="px-4 py-3">
                    <button
                      onClick={() => toast.info(`Viewing details for ${txn.id}`)}
                      className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* Pagination */}
        <div className="flex items-center justify-between px-4 py-3 border-t border-border">
          <p className="text-sm text-muted-foreground">
            Showing {((page - 1) * PER_PAGE) + 1}–{Math.min(page * PER_PAGE, filtered.length)} of {filtered.length} transactions
          </p>
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.max(1, p - 1))} disabled={page === 1}>
              <ChevronLeft className="w-4 h-4" />
            </Button>
            {Array.from({ length: Math.min(5, totalPages) }, (_, i) => {
              const p = page <= 3 ? i + 1 : page + i - 2;
              if (p > totalPages) return null;
              return (
                <button
                  key={p}
                  onClick={() => setPage(p)}
                  className={`w-8 h-8 text-sm rounded-lg transition-colors ${p === page ? "bg-primary text-primary-foreground" : "hover:bg-muted text-muted-foreground"}`}
                >
                  {p}
                </button>
              );
            })}
            <Button variant="outline" size="sm" onClick={() => setPage((p) => Math.min(totalPages, p + 1))} disabled={page === totalPages}>
              <ChevronRight className="w-4 h-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
