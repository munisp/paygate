import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Download, Search, Zap, TrendingUp,
  ArrowLeftRight, CheckCheck, AlertCircle
} from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { toast } from "sonner";

// ---- Provider display metadata (labels only — all figures come from the DB) ----
const PROVIDERS = [
  { id: "mpesa", name: "M-Pesa", country: "Kenya", flag: "🇰🇪", color: "#00A651" },
  { id: "mtn", name: "MTN MoMo", country: "Ghana / Uganda", flag: "🇬🇭🇺🇬", color: "#FFCC00" },
  { id: "airtel", name: "Airtel Money", country: "Nigeria / Zambia", flag: "🇳🇬🇿🇲", color: "#E40000" },
];

const providerKey = (providerName: string | null | undefined) => {
  const p = (providerName ?? "").toLowerCase();
  if (p.includes("mtn")) return "mtn";
  if (p.includes("airtel")) return "airtel";
  return "mpesa";
};

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = {
    matched: { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700", label: "Matched" },
    unmatched: { icon: XCircle, cls: "bg-red-100 text-red-700", label: "Unmatched" },
    pending: { icon: Clock, cls: "bg-amber-100 text-amber-700", label: "Pending" },
    disputed: { icon: AlertTriangle, cls: "bg-red-100 text-red-700", label: "Disputed" },
  }[status] || { icon: Clock, cls: "bg-muted text-muted-foreground", label: status };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium ${cfg.cls}`}>
      <cfg.icon className="w-3 h-3" />{cfg.label}
    </span>
  );
};

export default function MobileMoneyRecon() {
  const [activeProvider, setActiveProvider] = useState("mpesa");
  const [search, setSearch] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const utils = trpc.useUtils();

  // DB-only data — no fabricated entries, totals, or trends.
  const { data: dbReconData, isLoading, isError, error, refetch } = trpc.mobileMoneyRecon.list.useQuery({ limit: 100 }, { staleTime: 30_000 });
  const { data: providerStats = [] } = (trpc.mobileMoneyRecon.providerStats.useQuery() as any);
  const { data: weeklyTrend = [] } = (trpc.mobileMoneyRecon.weeklyTrend.useQuery() as any);

  const reconcileMutation = trpc.mobileMoneyRecon.reconcile.useMutation({
    onSuccess: (d) => {
      toast.success(`${d.reconciled} transaction${d.reconciled !== 1 ? "s" : ""} reconciled`);
      utils.mobileMoneyRecon.list.invalidate();
      utils.mobileMoneyRecon.stats.invalidate();
      utils.mobileMoneyRecon.providerStats.invalidate();
      utils.mobileMoneyRecon.weeklyTrend.invalidate();
    },
    onError: (e) => toast.error(`Reconciliation failed: ${e.message}`),
  });

  const entries = useMemo(() => {
    const rows = (dbReconData as any)?.rows ?? [];
    const byProvider: Record<string, any[]> = { mpesa: [], mtn: [], airtel: [] };
    rows.forEach((row: any) => {
      byProvider[providerKey(row.provider)].push({
        id: row.id,
        transactionId: row.transactionId ?? null,
        provider: row.provider,
        providerRef: row.providerRef ?? "—",
        amount: Number(row.amount ?? 0),
        currency: row.currency ?? "NGN",
        status: row.status ?? "pending",
        time: row.createdAt ? new Date(row.createdAt).toLocaleString() : "—",
        reconciledAt: row.reconciledAt ? new Date(row.reconciledAt).toLocaleString() : null,
      });
    });
    return byProvider;
  }, [dbReconData]);

  const provider = PROVIDERS.find(p => p.id === activeProvider)!;
  const allEntries = entries[activeProvider as keyof typeof entries];

  const filtered = allEntries.filter(e => {
    const matchSearch = search === "" || e.id.toLowerCase().includes(search.toLowerCase()) || e.providerRef.toLowerCase().includes(search.toLowerCase()) || (e.transactionId ?? "").toLowerCase().includes(search.toLowerCase());
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleReconcileAll = () => {
    const unmatchedIds = allEntries.filter(e => e.status === "unmatched" || e.status === "pending").map(e => e.id);
    if (unmatchedIds.length === 0) {
      toast.info("Nothing to reconcile — no unmatched or pending transactions for this provider");
      return;
    }
    reconcileMutation.mutate({ ids: unmatchedIds });
  };

  const handleResolve = (id: string) => {
    reconcileMutation.mutate({ ids: [id] });
  };

  const handleExport = () => {
    const rows = (dbReconData as any)?.rows ?? [];
    if (rows.length === 0) {
      toast.error("Nothing to export — no reconciliation records in the database");
      return;
    }
    const header = "id,provider,providerRef,transactionId,amount,currency,status,createdAt,reconciledAt";
    const csvRows = rows.map((r: any) => [
      r.id,
      r.provider ?? "",
      r.providerRef ?? "",
      r.transactionId ?? "",
      r.amount ?? "",
      r.currency ?? "",
      r.status ?? "",
      r.createdAt ? new Date(r.createdAt).toISOString() : "",
      r.reconciledAt ? new Date(r.reconciledAt).toISOString() : "",
    ].map(v => `"${String(v).replace(/"/g, '""')}"`).join(","));
    const blob = new Blob([[header, ...csvRows].join("\n")], { type: "text/csv" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `mobile-money-recon-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} reconciliation record${rows.length !== 1 ? "s" : ""}`);
  };

  // Real global totals from the providerStats query
  const totalMatched = providerStats.reduce((s: number, p: any) => s + Number(p.matched ?? 0), 0);
  const totalUnmatched = providerStats.reduce((s: number, p: any) => s + Number(p.unmatched ?? 0), 0);
  const totalTx = providerStats.reduce((s: number, p: any) => s + Number(p.total ?? 0), 0);
  const matchRate = totalTx > 0 ? `${((totalMatched / totalTx) * 100).toFixed(1)}%` : "—";

  const statFor = (pid: string) => {
    const stat = providerStats.find((s: any) => providerKey(s.provider) === pid);
    return stat
      ? { total: Number(stat.total), matched: Number(stat.matched), unmatched: Number(stat.unmatched), pending: Number(stat.pending), amount: Number(stat.totalAmount ?? 0) }
      : null;
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Mobile Money Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Match and reconcile M-Pesa, MTN MoMo, and Airtel Money transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={() => refetch()} disabled={isLoading}>
            <RefreshCw className="w-4 h-4 mr-2" />Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleReconcileAll} disabled={reconcileMutation.isPending}>
            <Zap className="w-4 h-4 mr-2" />{reconcileMutation.isPending ? "Reconciling..." : "Reconcile Unmatched"}
          </Button>
          <Button size="sm" onClick={handleExport}>
            <Download className="w-4 h-4 mr-2" />Export CSV
          </Button>
        </div>
      </div>

      {isError && (
        <div className="flex items-start gap-3 p-4 rounded-xl bg-red-50 border border-red-200">
          <AlertCircle className="w-5 h-5 text-red-600 flex-shrink-0 mt-0.5" />
          <div className="flex-1">
            <p className="text-sm font-semibold text-red-700">Could not load reconciliation data</p>
            <p className="text-xs text-red-600 mt-0.5">{error?.message}</p>
          </div>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      )}

      {/* Global Stats — real DB aggregates */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Transactions", value: totalTx.toLocaleString(), icon: ArrowLeftRight, cls: "text-primary", bg: "bg-primary/10" },
          { label: "Matched", value: totalMatched.toLocaleString(), icon: CheckCheck, cls: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Unmatched", value: totalUnmatched.toLocaleString(), icon: AlertCircle, cls: "text-red-600", bg: "bg-red-50" },
          { label: "Match Rate", value: matchRate, icon: TrendingUp, cls: "text-violet-600", bg: "bg-violet-50" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <div className={`p-2 rounded-lg ${s.bg}`}><s.icon className={`w-4 h-4 ${s.cls}`} /></div>
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
          </div>
        ))}
      </div>

      {/* Provider Tabs + Trend Chart */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Provider selector — stats from DB only */}
        <div className="xl:col-span-1 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Providers</p>
          {PROVIDERS.map(p => {
            const st = statFor(p.id);
            return (
              <button
                key={p.id}
                onClick={() => setActiveProvider(p.id)}
                className={`w-full p-4 rounded-xl border text-left transition-all ${activeProvider === p.id ? "border-primary bg-primary/5" : "border-border bg-card hover:border-primary/30"}`}
              >
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2">
                    <span className="text-xl">{p.flag}</span>
                    <div>
                      <p className="text-sm font-semibold">{p.name}</p>
                      <p className="text-xs text-muted-foreground">{p.country}</p>
                    </div>
                  </div>
                  <span className="text-xs font-mono font-semibold" style={{ color: p.color }}>
                    {st ? st.amount.toLocaleString() : "—"}
                  </span>
                </div>
                {st ? (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-center">
                      <div>
                        <p className="text-xs text-muted-foreground">Total</p>
                        <p className="text-sm font-bold">{st.total}</p>
                      </div>
                      <div>
                        <p className="text-xs text-emerald-600">Matched</p>
                        <p className="text-sm font-bold text-emerald-600">{st.matched}</p>
                      </div>
                      <div>
                        <p className="text-xs text-red-500">Unmatched</p>
                        <p className="text-sm font-bold text-red-500">{st.unmatched}</p>
                      </div>
                    </div>
                    <div className="mt-3">
                      <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                        <div className="h-full rounded-full transition-all duration-700" style={{ width: `${st.total > 0 ? (st.matched / st.total) * 100 : 0}%`, background: p.color }} />
                      </div>
                      <p className="text-xs text-muted-foreground mt-1">{st.total > 0 ? ((st.matched / st.total) * 100).toFixed(1) : "0.0"}% match rate</p>
                    </div>
                  </>
                ) : (
                  <p className="text-xs text-muted-foreground italic">No reconciliation records for this provider yet.</p>
                )}
              </button>
            );
          })}
        </div>

        {/* Trend Chart — real weeklyTrend data only */}
        <div className="xl:col-span-2 bg-card rounded-xl border border-border p-5">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>7-Day Reconciliation Trend</h3>
              <p className="text-xs text-muted-foreground">Daily matched vs unmatched transactions</p>
            </div>
            <div className="flex items-center gap-3 text-xs text-muted-foreground">
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-emerald-500 inline-block" />Matched</span>
              <span className="flex items-center gap-1.5"><span className="w-3 h-3 rounded bg-red-400 inline-block" />Unmatched</span>
            </div>
          </div>
          {weeklyTrend.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-[200px] text-muted-foreground">
              <TrendingUp className="w-8 h-8 mb-2 opacity-40" />
              <p className="text-sm">No reconciliation activity in the last 7 days</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={weeklyTrend} barGap={2}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="matched" fill="#10B981" radius={[3, 3, 0, 0]} />
                <Bar dataKey="unmatched" fill="#F87171" radius={[3, 3, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Transaction Table — DB rows only */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <div className="flex items-center gap-3">
            <span className="text-xl">{provider.flag}</span>
            <div>
              <h3 className="font-semibold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{provider.name} Transactions</h3>
              <p className="text-xs text-muted-foreground">{filtered.length} entries shown</p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {["all", "matched", "unmatched", "pending"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search refs..." className="pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring w-40" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Record ID", "Provider Ref", "Linked Txn", "Amount", "Status", "Created", "Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(entry => (
                <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono font-semibold text-primary">{entry.id}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">{entry.providerRef}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs font-mono text-muted-foreground">{entry.transactionId ?? "—"}</span>
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-sm font-semibold font-mono">{entry.currency} {entry.amount.toLocaleString()}</span>
                  </td>
                  <td className="px-4 py-3">
                    <StatusBadge status={entry.status} />
                  </td>
                  <td className="px-4 py-3">
                    <span className="text-xs text-muted-foreground">{entry.time}</span>
                  </td>
                  <td className="px-4 py-3">
                    {entry.status !== "matched" ? (
                      <Button size="sm" variant="outline" className="text-xs h-7 px-2" disabled={reconcileMutation.isPending} onClick={() => handleResolve(entry.id)}>
                        <Zap className="w-3 h-3 mr-1" />Reconcile
                      </Button>
                    ) : (
                      <span className="text-xs text-emerald-600 flex items-center gap-1">
                        <CheckCircle2 className="w-3 h-3" />Done
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {isLoading ? (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <RefreshCw className="w-6 h-6 mb-2 animate-spin opacity-40" />
            <p className="text-sm">Loading reconciliation records…</p>
          </div>
        ) : filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">
              {allEntries.length === 0
                ? `No ${provider.name} reconciliation records in the database yet.`
                : "No transactions match your filters"}
            </p>
          </div>
        )}

        {/* Live DB Recon Records */}
        <div className="mt-6">
          <MmReconDbPanel />
        </div>
      </div>
    </div>
  );
}

function MmReconDbPanel() {
  const { data, isLoading } = trpc.mobileMoneyRecon.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: stats } = trpc.mobileMoneyRecon.stats.useQuery(undefined, { staleTime: 60_000 });

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Live Reconciliation Records (Database)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats?.total ?? "—" },
          { label: "Matched", value: stats?.matched ?? "—" },
          { label: "Unmatched", value: stats?.unmatched ?? "—" },
          { label: "Pending", value: (stats as any)?.pending ?? "—" },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground">{String(s.value)}</p>
          </div>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
        (data?.rows ?? []).length === 0 ? (
          <p className="text-sm text-muted-foreground italic">No reconciliation records yet.</p>
        ) :
          (data?.rows ?? []).map(rec => (
            <div key={rec.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground">{rec.provider} · {rec.currency} {Number(rec.amount).toLocaleString()}</p>
                <p className="text-xs text-muted-foreground font-mono">{rec.providerRef} · {new Date(rec.createdAt).toLocaleDateString()}</p>
              </div>
              <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${rec.status === 'matched' ? 'bg-emerald-100 text-emerald-700' :
                  rec.status === 'unmatched' ? 'bg-amber-100 text-amber-700' :
                    rec.status === 'disputed' ? 'bg-red-100 text-red-700' :
                      'bg-muted text-muted-foreground'
                }`}>{rec.status}</span>
            </div>
          ))}
    </div>
  );
}
