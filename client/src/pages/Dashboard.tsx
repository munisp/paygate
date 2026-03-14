import { useState, useMemo, useCallback, useRef } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar, PieChart, Pie, Cell } from "recharts";
import { TrendingUp, DollarSign, ArrowLeftRight, Users, CreditCard, ArrowUpRight, ArrowDownRight, RefreshCw, Download, Zap, Globe, Shield, Radio, AlertTriangle, CheckCircle2, Trophy, Clock } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import RevenueForecast from "@/components/RevenueForecast";
import { useTransactionStream, type StreamTransaction } from "@/hooks/useTransactionStream";

function fmt(n: number | null | undefined) {
  if (!n) return "\u20a60";
  if (n >= 1_000_000) return `\u20a6${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `\u20a6${(n / 1_000).toFixed(0)}K`;
  return `\u20a6${n.toLocaleString()}`;
}

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; cls: string }> = {
    completed: { label: "Success", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    success:   { label: "Success", cls: "bg-emerald-50 text-emerald-700 border-emerald-200" },
    pending:   { label: "Pending", cls: "bg-amber-50 text-amber-700 border-amber-200" },
    processing:{ label: "Processing", cls: "bg-blue-50 text-blue-700 border-blue-200" },
    failed:    { label: "Failed",  cls: "bg-red-50 text-red-700 border-red-200" },
  };
  const s = map[status] ?? map.pending;
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium border ${s.cls}`}>{s.label}</span>;
}

const CHANNEL_COLORS: Record<string, string> = {
  card: "#4F46E5", bank_transfer: "#10B981", mobile_money: "#F59E0B", ussd: "#6366F1", qr: "#EC4899", bnpl: "#14B8A6",
};

function SettlementHealthWidget() {
  const { data, isLoading } = trpc.settlements.summary.useQuery(undefined, { staleTime: 60_000, refetchInterval: 60_000 });
  const hasBreaches = (data?.slaBreachCount ?? 0) > 0;
  return (
    <div className={`bg-card rounded-xl border p-6 ${
      hasBreaches ? 'border-orange-300 bg-orange-50/30' : 'border-border'
    }`}>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>Settlement Health</h3>
          <p className="text-sm text-muted-foreground">Today's settlement activity</p>
        </div>
        <button onClick={() => window.location.href = '/settlements'} className="text-xs text-primary font-medium hover:underline">View all settlements →</button>
      </div>
      {isLoading ? (
        <div className="grid grid-cols-3 gap-4">
          {Array(3).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
        </div>
      ) : (
        <div className="grid grid-cols-3 gap-4">
          <div className="bg-emerald-50 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-emerald-100 flex-shrink-0"><CheckCircle2 className="w-4 h-4 text-emerald-600" /></div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{fmt(data?.totalSettledToday ?? 0)}</p>
              <p className="text-xs text-muted-foreground">Settled Today</p>
            </div>
          </div>
          <div className="bg-amber-50 rounded-xl p-4 flex items-center gap-3">
            <div className="p-2.5 rounded-xl bg-amber-100 flex-shrink-0"><Clock className="w-4 h-4 text-amber-600" /></div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{data?.pendingCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">Pending Batches</p>
            </div>
          </div>
          <div className={`rounded-xl p-4 flex items-center gap-3 ${
            hasBreaches ? 'bg-red-50' : 'bg-slate-50'
          }`}>
            <div className={`p-2.5 rounded-xl flex-shrink-0 ${
              hasBreaches ? 'bg-red-100' : 'bg-slate-100'
            }`}>
              <AlertTriangle className={`w-4 h-4 ${
                hasBreaches ? 'text-red-600' : 'text-slate-400'
              }`} />
            </div>
            <div>
              <p className={`text-xl font-bold ${
                hasBreaches ? 'text-red-600' : 'text-foreground'
              }`} style={{ fontFamily: 'Space Grotesk, sans-serif' }}>{data?.slaBreachCount ?? 0}</p>
              <p className="text-xs text-muted-foreground">SLA Breaches</p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function DisputeAnalyticsWidget() {
  const { data, isLoading } = trpc.disputes.analytics.useQuery({ days: 30 }, { staleTime: 120_000 });
  if (isLoading) return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-4">
        <Skeleton className="h-5 w-40" />
        <Skeleton className="h-4 w-20" />
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {Array(4).fill(0).map((_, i) => <Skeleton key={i} className="h-20 rounded-xl" />)}
      </div>
    </div>
  );
  const d = data ?? { open: 0, resolved: 0, won: 0, lost: 0, winRate: 0, avgResolutionDays: 0 };
  const stats = [
    { label: "Open", value: d.open, icon: AlertTriangle, color: "amber", bg: "bg-amber-50", text: "text-amber-600" },
    { label: "Resolved", value: d.resolved, icon: CheckCircle2, color: "emerald", bg: "bg-emerald-50", text: "text-emerald-600" },
    { label: "Win Rate", value: `${d.winRate}%`, icon: Trophy, color: "indigo", bg: "bg-indigo-50", text: "text-indigo-600" },
    { label: "Avg. Resolution", value: `${d.avgResolutionDays}d`, icon: Clock, color: "slate", bg: "bg-slate-50", text: "text-slate-600" },
  ];
  return (
    <div className="bg-card rounded-xl border border-border p-6">
      <div className="flex items-center justify-between mb-5">
        <div>
          <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Dispute Analytics</h3>
          <p className="text-sm text-muted-foreground">Last 30 days</p>
        </div>
        <button onClick={() => window.location.href = "/disputes"} className="text-xs text-primary font-medium hover:underline">View all disputes →</button>
      </div>
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {stats.map(s => (
          <div key={s.label} className="bg-muted/40 rounded-xl p-4 flex items-center gap-3">
            <div className={`p-2.5 rounded-xl ${s.bg} flex-shrink-0`}><s.icon className={`w-4 h-4 ${s.text}`} /></div>
            <div>
              <p className="text-xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
              <p className="text-xs text-muted-foreground">{s.label}</p>
            </div>
          </div>
        ))}
      </div>
      {(d.won > 0 || d.lost > 0) && (
        <div className="mt-4">
          <div className="flex items-center justify-between text-xs text-muted-foreground mb-1.5">
            <span>Won ({d.won})</span>
            <span>Lost ({d.lost})</span>
          </div>
          <div className="h-2 bg-muted rounded-full overflow-hidden flex">
            <div className="h-full bg-emerald-500 rounded-l-full transition-all" style={{ width: `${d.winRate}%` }} />
            <div className="h-full bg-red-400 rounded-r-full transition-all" style={{ width: `${100 - d.winRate}%` }} />
          </div>
        </div>
      )}
    </div>
  );
}

export default function Dashboard() {
  const [range] = useState(() => ({ to: new Date(), from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) }));
  const [period, setPeriod] = useState<"7d" | "30d" | "90d">("30d");

  const { data, isLoading, refetch, isFetching } = trpc.dashboard.overview.useQuery(range, { staleTime: 60_000 });
  const { data: txData } = trpc.transactions.list.useQuery({ limit: 8, offset: 0 }, { staleTime: 60_000 });
  const utils = trpc.useUtils();
  const [exporting, setExporting] = useState(false);
  const handleExport = async () => {
    setExporting(true);
    try {
      const result = await utils.export.transactions.fetch({ from: range.from, to: range.to });
      const blob = new Blob([result.csv], { type: "text/csv" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url; a.download = `transactions-${new Date().toISOString().slice(0,10)}.csv`;
      a.click(); URL.revokeObjectURL(url);
      toast.success(`Exported ${result.count} transactions`);
    } catch (e) {
      toast.error("Export failed");
    } finally {
      setExporting(false);
    }
  };

  const overview = data?.overview;
  const timeSeries = data?.timeSeries ?? [];
  const merchant = data?.merchant;

  // Live transaction stream via SSE
  const [liveQueue, setLiveQueue] = useState<StreamTransaction[]>([]);
  const [isLive, setIsLive] = useState(false);
  const liveRef = useRef(false);

  const handleLiveTx = useCallback((tx: StreamTransaction) => {
    if (!liveRef.current) { liveRef.current = true; setIsLive(true); }
    setLiveQueue(prev => [tx, ...prev].slice(0, 8));
    toast.info(`New transaction: ${tx.reference}`, { duration: 3000 });
    // Also invalidate the list query so Transactions page stays fresh
    utils.transactions.list.invalidate();
  }, [utils]);

  useTransactionStream({ onTransaction: handleLiveTx });

  // Merge live queue with server-fetched rows (live rows take precedence)
  const serverTxns = txData?.rows ?? [];
  const liveIds = new Set(liveQueue.map(t => t.id));
  const recentTxns = [...liveQueue, ...serverTxns.filter((t: any) => !liveIds.has(t.id))].slice(0, 8);

  const channelBreakdown = useMemo(() => {
    const counts: Record<string, number> = {};
    recentTxns.forEach((t: any) => { counts[t.channel] = (counts[t.channel] ?? 0) + 1; });
    const total = recentTxns.length || 1;
    return Object.entries(counts).map(([name, value]) => ({
      name: name.replace("_", " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
      value: Math.round((value / total) * 100),
      color: CHANNEL_COLORS[name] ?? "#94A3B8",
    }));
  }, [recentTxns]);

  const totalCount = Number(overview?.transactions?.totalCount ?? 0);
  const completedCount = Number(overview?.transactions?.completedCount ?? 0);
  const failedCount = Number(overview?.transactions?.failedCount ?? 0);
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;
  const totalVolume = Number(overview?.transactions?.totalVolume ?? 0);
  const totalPayouts = Number(overview?.payouts?.totalPayouts ?? 0);
  const customerCount = Number(overview?.customers?.customerCount ?? 0);
  const disputeCount = Number(overview?.disputes?.disputeCount ?? 0);

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            {merchant?.businessName ?? "Dashboard"}
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Last 30 days · {merchant?.currency ?? "NGN"}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex bg-muted rounded-lg p-1 gap-1">
            {(["7d", "30d", "90d"] as const).map((p) => (
              <button key={p} onClick={() => setPeriod(p)}
                className={`px-3 py-1.5 text-xs font-medium rounded-md transition-all ${period === p ? "bg-card text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
                {p}
              </button>
            ))}
          </div>
          <Button variant="outline" size="sm" onClick={() => { refetch(); toast.info("Refreshing..."); }} disabled={isFetching}>
            <RefreshCw className={`w-4 h-4 mr-1.5 ${isFetching ? "animate-spin" : ""}`} />Refresh
          </Button>
          <Button size="sm" onClick={handleExport} disabled={exporting}>
            <Download className="w-4 h-4 mr-1.5" />{exporting ? "Exporting..." : "Export"}
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { title: "Total Revenue", value: fmt(totalVolume), sub: `${totalCount.toLocaleString()} transactions`, icon: DollarSign, color: "indigo", trend: "+12.5%", up: true },
          { title: "Net Payouts", value: fmt(totalPayouts), sub: `${overview?.payouts?.payoutCount ?? 0} payouts`, icon: ArrowLeftRight, color: "emerald", trend: "+8.3%", up: true },
          { title: "Success Rate", value: `${successRate}%`, sub: `${failedCount} failed`, icon: TrendingUp, color: "amber", trend: successRate >= 90 ? "+0.4%" : "-1.2%", up: successRate >= 90 },
          { title: "Customers", value: customerCount.toLocaleString(), sub: `${disputeCount} open disputes`, icon: Users, color: "blue", trend: "+9.2%", up: true },
        ].map((k) => (
          <div key={k.title} className="bg-card rounded-xl border border-border p-5">
            {isLoading ? (
              <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /><Skeleton className="h-3 w-20" /></div>
            ) : (
              <>
                <div className="flex items-start justify-between mb-3">
                  <div>
                    <p className="text-sm text-muted-foreground font-medium">{k.title}</p>
                    <p className="text-2xl font-bold mt-1 font-mono">{k.value}</p>
                  </div>
                  <div className={`p-2.5 rounded-xl bg-${k.color}-50 text-${k.color}-600`}>
                    <k.icon className="w-5 h-5" />
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  {k.up ? <ArrowUpRight className="w-4 h-4 text-emerald-500" /> : <ArrowDownRight className="w-4 h-4 text-red-500" />}
                  <span className={`text-sm font-semibold ${k.up ? "text-emerald-600" : "text-red-600"}`}>{k.trend}</span>
                  <span className="text-sm text-muted-foreground">· {k.sub}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Revenue Over Time</h3>
              <p className="text-sm text-muted-foreground">Daily completed transaction volume</p>
            </div>
            {!isLoading && <Badge variant="secondary"><TrendingUp className="w-3 h-3 mr-1 text-emerald-500" />Live data</Badge>}
          </div>
          {isLoading ? <Skeleton className="h-48 w-full" /> : timeSeries.length === 0 ? (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No transaction data in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <AreaChart data={timeSeries}>
                <defs>
                  <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2} />
                    <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number) => [fmt(v), "Volume"]} />
                <Area type="monotone" dataKey="volume" stroke="#4F46E5" strokeWidth={2} fill="url(#revGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Channels</h3>
          <p className="text-sm text-muted-foreground mb-4">Distribution by method</p>
          {channelBreakdown.length > 0 ? (
            <>
              <ResponsiveContainer width="100%" height={140}>
                <PieChart>
                  <Pie data={channelBreakdown} cx="50%" cy="50%" innerRadius={40} outerRadius={65} paddingAngle={3} dataKey="value">
                    {channelBreakdown.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                  </Pie>
                  <Tooltip formatter={(v: number) => [`${v}%`, "Share"]} contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                </PieChart>
              </ResponsiveContainer>
              <div className="space-y-2 mt-2">
                {channelBreakdown.map((c) => (
                  <div key={c.name} className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <div className="w-2.5 h-2.5 rounded-full" style={{ background: c.color }} />
                      <span className="text-sm text-muted-foreground">{c.name}</span>
                    </div>
                    <span className="text-sm font-semibold">{c.value}%</span>
                  </div>
                ))}
              </div>
            </>
          ) : <p className="text-sm text-muted-foreground">No channel data yet</p>}
        </div>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Daily Count</h3>
          <p className="text-sm text-muted-foreground mb-4">Transactions per day</p>
          {isLoading ? <Skeleton className="h-44 w-full" /> : timeSeries.length === 0 ? (
            <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={180}>
              <BarChart data={timeSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
                <Bar dataKey="count" fill="#4F46E5" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          )}
        </div>
        <div className="xl:col-span-2 bg-card rounded-xl border border-border p-6">
          <div className="flex items-center justify-between mb-5">
            <div>
              <h3 className="font-semibold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Recent Transactions</h3>
              <p className="text-sm text-muted-foreground">Latest activity from your account</p>
            </div>
            <div className="flex items-center gap-2">
              <div className={`w-2 h-2 rounded-full ${isLive ? 'bg-emerald-500 animate-pulse' : 'bg-slate-300'}`} />
              <span className={`text-xs font-medium flex items-center gap-1 ${isLive ? 'text-emerald-600' : 'text-muted-foreground'}`}>
                <Radio className="w-3 h-3" />
                {isLive ? 'Live stream' : 'Connecting…'}
              </span>
            </div>
          </div>
          {isLoading ? (
            <div className="space-y-3">{Array(5).fill(0).map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}</div>
          ) : recentTxns.length === 0 ? (
            <div className="text-center py-8 text-muted-foreground text-sm">No transactions yet</div>
          ) : (
            <div className="space-y-1">
              {recentTxns.map((txn: any) => (
                <div key={txn.id} className="flex items-center gap-4 px-3 py-2.5 rounded-lg hover:bg-muted/50 transition-colors cursor-pointer">
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">{txn.customerName ?? txn.customerEmail ?? "Anonymous"}</p>
                    <p className="text-xs text-muted-foreground">{txn.reference} · {txn.channel}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold font-mono text-foreground">{txn.currency} {Number(txn.amount).toLocaleString()}</p>
                    <p className="text-xs text-muted-foreground">{new Date(txn.createdAt).toLocaleDateString()}</p>
                  </div>
                  <StatusBadge status={txn.status} />
                </div>
              ))}
            </div>
          )}
          <button className="w-full mt-4 py-2 text-sm text-primary font-medium hover:bg-primary/5 rounded-lg transition-colors"
            onClick={() => window.location.href = "/transactions"}>
            View all transactions
          </button>
        </div>
      </div>

      {/* Settlement Health Widget */}
      <SettlementHealthWidget />
      {/* Dispute Analytics Widget */}
      <DisputeAnalyticsWidget />

      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        <div className="xl:col-span-2"><RevenueForecast /></div>
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold text-foreground mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Platform Health</h3>
          <div className="space-y-3">
            {[
              { label: "API Gateway", uptime: "99.99%", icon: Zap },
              { label: "Payment Engine", uptime: "99.97%", icon: CreditCard },
              { label: "Fraud Detection", uptime: "100%", icon: Shield },
              { label: "Settlement", uptime: "99.98%", icon: Globe },
            ].map((svc) => (
              <div key={svc.label} className="flex items-center gap-3 p-3 rounded-xl bg-muted/50">
                <div className="p-2 rounded-lg bg-emerald-50"><svc.icon className="w-4 h-4 text-emerald-600" /></div>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">{svc.label}</p>
                  <div className="flex items-center gap-1.5 mt-0.5">
                    <div className="w-1.5 h-1.5 rounded-full bg-emerald-500" />
                    <span className="text-xs text-muted-foreground">{svc.uptime} uptime</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
