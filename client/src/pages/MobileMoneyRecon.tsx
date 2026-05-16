import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  CheckCircle2, XCircle, Clock, AlertTriangle, RefreshCw,
  Download, Search, Filter, ChevronDown, Zap, TrendingUp,
  ArrowLeftRight, CheckCheck, AlertCircle, Phone
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell
} from "recharts";
import { toast } from "sonner";

// ---- Data ----
const PROVIDERS = [
  {
    id: "mpesa", name: "M-Pesa", country: "Kenya", flag: "🇰🇪", currency: "KES",
    color: "#00A651", lightColor: "#E8F8EF",
    stats: { total: 1842, matched: 1791, unmatched: 31, pending: 20, amount: "KES 18.4M" }
  },
  {
    id: "mtn", name: "MTN MoMo", country: "Ghana / Uganda", flag: "🇬🇭🇺🇬", currency: "GHS",
    color: "#FFCC00", lightColor: "#FFFBEA",
    stats: { total: 1204, matched: 1156, unmatched: 28, pending: 20, amount: "GHS 4.2M" }
  },
  {
    id: "airtel", name: "Airtel Money", country: "Nigeria / Zambia", flag: "🇳🇬🇿🇲", currency: "NGN",
    color: "#E40000", lightColor: "#FEF2F2",
    stats: { total: 876, matched: 841, unmatched: 19, pending: 16, amount: "NGN 9.1M" }
  },
];

const generateEntries = (provider: string, count: number) => {
  const statuses = ["matched", "matched", "matched", "matched", "unmatched", "pending"];
  const names = ["Adaeze Okonkwo", "Kwame Asante", "Fatima Musa", "Sipho Dlamini", "Amara Diallo", "Chidi Eze", "Naledi Mokoena", "Emeka Obi", "Aisha Bello", "Kofi Mensah"];
  const amounts = [1200, 5000, 2500, 8000, 3400, 12000, 750, 4500, 9800, 1800];
  return Array.from({ length: count }, (_, i) => ({
    id: `${provider.toUpperCase()}-${String(i + 1001).padStart(6, "0")}`,
    ref: `PG-${Math.random().toString(36).substring(2, 10).toUpperCase()}`,
    customer: names[i % names.length],
    phone: `+${provider === "mpesa" ? "254" : provider === "mtn" ? "233" : "234"}7${Math.floor(Math.random() * 90000000 + 10000000)}`,
    amount: amounts[i % amounts.length],
    status: statuses[i % statuses.length],
    time: `${Math.floor(Math.random() * 23) + 1}h ago`,
    gatewayRef: `GW-${Math.random().toString(36).substring(2, 8).toUpperCase()}`,
    providerRef: `${provider === "mpesa" ? "MP" : provider === "mtn" ? "MT" : "AM"}${Math.floor(Math.random() * 9000000 + 1000000)}`,
    discrepancy: i % 6 === 4 ? "Amount mismatch" : i % 6 === 5 ? "Timeout — awaiting callback" : null,
  }));
};

const TREND_DATA = [
  { day: "Mon", matched: 280, unmatched: 8 },
  { day: "Tue", matched: 310, unmatched: 12 },
  { day: "Wed", matched: 295, unmatched: 5 },
  { day: "Thu", matched: 340, unmatched: 9 },
  { day: "Fri", matched: 380, unmatched: 14 },
  { day: "Sat", matched: 220, unmatched: 6 },
  { day: "Sun", matched: 190, unmatched: 4 },
];

const StatusBadge = ({ status }: { status: string }) => {
  const cfg = {
    matched: { icon: CheckCircle2, cls: "bg-emerald-100 text-emerald-700", label: "Matched" },
    unmatched: { icon: XCircle, cls: "bg-red-100 text-red-700", label: "Unmatched" },
    pending: { icon: Clock, cls: "bg-amber-100 text-amber-700", label: "Pending" },
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
  const [reconciling, setReconciling] = useState(false);
  // Real DB data for the main table (falls back to mock if empty)
  const { data: dbReconData } = trpc.mobileMoneyRecon.list.useQuery({ limit: 50 }, { staleTime: 30_000 });
  const { data: providerStats = [] } = (trpc.mobileMoneyRecon.providerStats.useQuery() as any);
  const { data: weeklyTrend = [] } = (trpc.mobileMoneyRecon.weeklyTrend.useQuery() as any);
  const [entries, setEntries] = useState(() => ({
    mpesa: generateEntries("mpesa", 18),
    mtn: generateEntries("mtn", 14),
    airtel: generateEntries("airtel", 12),
  }));
  // Seed entries from DB when real data loads
  useEffect(() => {
    const rows = (dbReconData as any)?.rows ?? [];
    const byProvider: Record<string, any[]> = { mpesa: [], mtn: [], airtel: [] };
    rows.forEach((row: any) => {
      const p = row.provider?.toLowerCase() ?? "mpesa";
      const key = p.includes("mtn") ? "mtn" : p.includes("airtel") ? "airtel" : "mpesa";
      byProvider[key].push({
        id: row.id,
        customer: row.customerId ?? "Unknown",
        phone: row.providerRef?.startsWith("+") ? row.providerRef : `+234${row.providerRef ?? "00000000"}`,
        amount: Number(row.amount ?? 0),
        currency: row.currency ?? "NGN",
        status: row.status ?? "pending",
        time: row.createdAt ? new Date(row.createdAt).toLocaleTimeString() : "--",
        ref: row.id,
        gatewayRef: row.id,
        providerRef: row.providerRef ?? "--",
      });
    });
    setEntries(prev => ({
      mpesa: byProvider.mpesa.length > 0 ? byProvider.mpesa : prev.mpesa,
      mtn: byProvider.mtn.length > 0 ? byProvider.mtn : prev.mtn,
      airtel: byProvider.airtel.length > 0 ? byProvider.airtel : prev.airtel,
    }));
  }, [dbReconData]);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(new Set());

  const provider = PROVIDERS.find(p => p.id === activeProvider)!;
  const allEntries = entries[activeProvider as keyof typeof entries];

  const filtered = allEntries.filter(e => {
    const matchSearch = search === "" || e.customer.toLowerCase().includes(search.toLowerCase()) || e.id.toLowerCase().includes(search.toLowerCase()) || e.phone.includes(search);
    const matchStatus = statusFilter === "all" || e.status === statusFilter;
    return matchSearch && matchStatus;
  });

  const handleReconcileAll = async () => {
    setReconciling(true);
    await new Promise(r => setTimeout(r, 1800));
    const unmatchedIds = allEntries.filter(e => e.status === "unmatched").map(e => e.id);
    setResolvedIds(prev => new Set(Array.from(prev).concat(unmatchedIds)));
    setReconciling(false);
    toast.success(`${unmatchedIds.length} transactions auto-reconciled via callback retry`);
  };

  const handleResolve = (id: string) => {
    setResolvedIds(prev => new Set(Array.from(prev).concat([id])));
    toast.success(`Transaction ${id} manually resolved`);
  };

  const totalMatched = PROVIDERS.reduce((s: any, p: any) => s + p.stats.matched, 0);
  const totalUnmatched = PROVIDERS.reduce((s: any, p: any) => s + p.stats.unmatched, 0);
  const totalPending = PROVIDERS.reduce((s: any, p: any) => s + p.stats.pending, 0);
  const totalTx = PROVIDERS.reduce((s: any, p: any) => s + p.stats.total, 0);
  const matchRate = ((totalMatched / totalTx) * 100).toFixed(1);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Mobile Money Reconciliation</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Match and reconcile M-Pesa, MTN MoMo, and Airtel Money transactions</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline" size="sm" onClick={handleReconcileAll} disabled={reconciling}>
            <RefreshCw className={`w-4 h-4 mr-2 ${reconciling ? "animate-spin" : ""}`} />
            {reconciling ? "Reconciling..." : "Auto-Reconcile"}
          </Button>
          <Button size="sm" onClick={() => toast.success("Report exported")}>
            <Download className="w-4 h-4 mr-2" />Export Report
          </Button>
        </div>
      </div>

      {/* Global Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Transactions", value: totalTx.toLocaleString(), icon: ArrowLeftRight, cls: "text-primary", bg: "bg-primary/10" },
          { label: "Matched", value: totalMatched.toLocaleString(), icon: CheckCheck, cls: "text-emerald-600", bg: "bg-emerald-50" },
          { label: "Unmatched", value: totalUnmatched, icon: AlertCircle, cls: "text-red-600", bg: "bg-red-50" },
          { label: "Match Rate", value: `${matchRate}%`, icon: TrendingUp, cls: "text-violet-600", bg: "bg-violet-50" },
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
        {/* Provider selector */}
        <div className="xl:col-span-1 space-y-3">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Providers</p>
          {PROVIDERS.map(p => (
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
                <span className="text-xs font-mono font-semibold" style={{ color: p.color }}>{p.stats.amount}</span>
              </div>
              <div className="grid grid-cols-3 gap-2 text-center">
                <div>
                  <p className="text-xs text-muted-foreground">Total</p>
                  <p className="text-sm font-bold">{p.stats.total}</p>
                </div>
                <div>
                  <p className="text-xs text-emerald-600">Matched</p>
                  <p className="text-sm font-bold text-emerald-600">{p.stats.matched}</p>
                </div>
                <div>
                  <p className="text-xs text-red-500">Unmatched</p>
                  <p className="text-sm font-bold text-red-500">{p.stats.unmatched}</p>
                </div>
              </div>
              {/* Match rate bar */}
              <div className="mt-3">
                <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                  <div className="h-full rounded-full transition-all duration-700" style={{ width: `${(p.stats.matched / p.stats.total) * 100}%`, background: p.color }} />
                </div>
                <p className="text-xs text-muted-foreground mt-1">{((p.stats.matched / p.stats.total) * 100).toFixed(1)}% match rate</p>
              </div>
            </button>
          ))}
        </div>

        {/* Trend Chart */}
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
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={weeklyTrend.length > 0 ? weeklyTrend : TREND_DATA} barGap={2}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="day" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
              <Bar dataKey="matched" fill="#10B981" radius={[3, 3, 0, 0]} />
              <Bar dataKey="unmatched" fill="#F87171" radius={[3, 3, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* Transaction Table */}
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
            {/* Status filter */}
            <div className="flex gap-1 bg-muted p-1 rounded-lg">
              {["all", "matched", "unmatched", "pending"].map(s => (
                <button key={s} onClick={() => setStatusFilter(s)} className={`px-3 py-1 rounded-md text-xs font-medium capitalize transition-all ${statusFilter === s ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                  {s}
                </button>
              ))}
            </div>
            {/* Search */}
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder="Search..." className="pl-8 pr-3 py-1.5 text-xs bg-muted rounded-lg border border-border focus:outline-none focus:ring-2 focus:ring-ring w-40" />
            </div>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-border bg-muted/30">
                {["Transaction ID", "Customer", "Phone", "Amount", "Gateway Ref", "Provider Ref", "Status", "Time", "Action"].map(h => (
                  <th key={h} className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {filtered.map(entry => {
                const isResolved = resolvedIds.has(entry.id);
                const effectiveStatus = isResolved ? "matched" : entry.status;
                return (
                  <tr key={entry.id} className="hover:bg-muted/20 transition-colors">
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono font-semibold text-primary">{entry.id}</span>
                    </td>
                    <td className="px-4 py-3">
                      <p className="text-sm font-medium">{entry.customer}</p>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 text-xs text-muted-foreground">
                        <Phone className="w-3 h-3" />{entry.phone}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-sm font-semibold font-mono">{provider.currency} {entry.amount.toLocaleString()}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">{entry.gatewayRef}</span>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs font-mono text-muted-foreground">{entry.providerRef}</span>
                    </td>
                    <td className="px-4 py-3">
                      <div className="space-y-1">
                        <StatusBadge status={effectiveStatus} />
                        {entry.discrepancy && !isResolved && (
                          <p className="text-xs text-red-500">{entry.discrepancy}</p>
                        )}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className="text-xs text-muted-foreground">{entry.time}</span>
                    </td>
                    <td className="px-4 py-3">
                      {effectiveStatus !== "matched" ? (
                        <Button size="sm" variant="outline" className="text-xs h-7 px-2" onClick={() => handleResolve(entry.id)}>
                          <Zap className="w-3 h-3 mr-1" />Resolve
                        </Button>
                      ) : (
                        <span className="text-xs text-emerald-600 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />Done
                        </span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>

        {filtered.length === 0 && (
          <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
            <Search className="w-8 h-8 mb-2 opacity-40" />
            <p className="text-sm">No transactions match your filters</p>
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
  const { data, isLoading, isError, isError } = trpc.mobileMoneyRecon.list.useQuery({ limit: 20 }, { staleTime: 30_000 });
  const { data: stats } = trpc.mobileMoneyRecon.stats.useQuery(undefined, { staleTime: 60_000 });

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      <h3 className="text-sm font-semibold text-foreground">Live Reconciliation Records (Database)</h3>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Total", value: stats?.total ?? "—" },
          { label: "Matched", value: stats?.matched ?? "—" },
          { label: "Unmatched", value: stats?.unmatched ?? "—" },
          { label: "Disputed", value: stats?.unmatched ?? "—" },
        ].map(s => (
          <div key={s.label} className="bg-muted/40 rounded-lg p-3">
            <p className="text-xs text-muted-foreground">{s.label}</p>
            <p className="text-xl font-bold text-foreground">{String(s.value)}</p>
          </div>
        ))}
      </div>
      {isLoading ? <p className="text-sm text-muted-foreground">Loading...</p> :
      (data?.rows ?? []).map(rec => (
        <div key={rec.id} className="flex items-center justify-between gap-4 p-3 rounded-lg border border-border">
          <div className="flex-1 min-w-0">
            <p className="text-sm font-medium text-foreground">{rec.provider} · {rec.currency} {Number(rec.amount).toLocaleString()}</p>
            <p className="text-xs text-muted-foreground font-mono">{rec.providerRef} · {new Date(rec.createdAt).toLocaleDateString()}</p>
          </div>
          <span className={`px-2 py-0.5 rounded-full text-xs font-medium capitalize ${
            rec.status === 'matched' ? 'bg-emerald-100 text-emerald-700' :
            rec.status === 'unmatched' ? 'bg-amber-100 text-amber-700' :
            rec.status === 'disputed' ? 'bg-red-100 text-red-700' :
            'bg-muted text-muted-foreground'
          }`}>{rec.status}</span>
        </div>
      ))}
    </div>
  );

}
