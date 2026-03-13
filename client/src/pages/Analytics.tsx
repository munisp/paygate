import { useState } from "react";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, BarChart, Bar } from "recharts";
import { TrendingUp, TrendingDown, Download, Calendar } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { trpc } from "@/lib/trpc";

function fmt(n: number | null | undefined) {
  if (!n) return "\u20a60";
  if (n >= 1_000_000) return `\u20a6${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `\u20a6${(n / 1_000).toFixed(0)}K`;
  return `\u20a6${n.toLocaleString()}`;
}

export default function Analytics() {
  const [period, setPeriod] = useState("30d");
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  }));

  const handlePeriodChange = (val: string) => {
    setPeriod(val);
    const days = val === "7d" ? 7 : val === "90d" ? 90 : val === "1y" ? 365 : 30;
    setRange({ from: new Date(Date.now() - days * 24 * 60 * 60 * 1000), to: new Date() });
  };

  const handleExport = () => {
    const rows = [["Date", "Volume (Kobo)", "Count"], ...(timeSeries ?? []).map((r: any) => [r.date, r.volume, r.count])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a"); a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" })); a.download = `analytics-${period}.csv`; a.click();
  };

  const { data: overview, isLoading: oLoading } = trpc.analytics.overview.useQuery(range, { staleTime: 60_000 });
  const { data: timeSeries, isLoading: tsLoading } = trpc.analytics.timeSeries.useQuery(range, { staleTime: 60_000 });

  const isLoading = oLoading || tsLoading;
  const series = timeSeries ?? [];

  const totalVolume = Number(overview?.transactions?.totalVolume ?? 0);
  const totalCount = Number(overview?.transactions?.totalCount ?? 0);
  const completedCount = Number(overview?.transactions?.completedCount ?? 0);
  const failedCount = Number(overview?.transactions?.failedCount ?? 0);
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  const kpis = [
    { label: "Total Volume", value: fmt(totalVolume), sub: `${totalCount.toLocaleString()} transactions`, up: true },
    { label: "Success Rate", value: `${successRate}%`, sub: `${failedCount} failed`, up: successRate >= 90 },
    { label: "Total Fees", value: fmt(Number(overview?.transactions?.totalFees ?? 0)), sub: "Revenue from fees", up: true },
    { label: "Open Disputes", value: String(overview?.disputes?.disputeCount ?? 0), sub: "Needs attention", up: !(overview?.disputes?.disputeCount) },
  ];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live data from your transactions</p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={period} onValueChange={handlePeriodChange}>
            <SelectTrigger className="w-28 h-8 text-sm">
              <Calendar className="w-3 h-3 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last year</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={handleExport}>
            <Download className="w-3 h-3 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k) => (
          <div key={k.label} className="bg-card rounded-xl border border-border p-5">
            {isLoading ? <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-32" /></div> : (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{k.label}</p>
                <p className="text-2xl font-bold font-mono">{k.value}</p>
                <div className="flex items-center gap-1 mt-1">
                  {k.up ? <TrendingUp className="w-3 h-3 text-emerald-500" /> : <TrendingDown className="w-3 h-3 text-red-500" />}
                  <span className="text-xs text-muted-foreground">{k.sub}</span>
                </div>
              </>
            )}
          </div>
        ))}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Daily Revenue</h3>
        <p className="text-sm text-muted-foreground mb-5">Completed transaction volume per day</p>
        {isLoading ? <Skeleton className="h-48 w-full" /> : series.length === 0 ? (
          <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data in this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={220}>
            <AreaChart data={series}>
              <defs>
                <linearGradient id="aGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#4F46E5" stopOpacity={0.2} />
                  <stop offset="95%" stopColor="#4F46E5" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number) => [fmt(v), "Volume"]} />
              <Area type="monotone" dataKey="volume" stroke="#4F46E5" strokeWidth={2} fill="url(#aGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Daily Transaction Count</h3>
        <p className="text-sm text-muted-foreground mb-5">Number of transactions per day</p>
        {isLoading ? <Skeleton className="h-44 w-full" /> : series.length === 0 ? (
          <div className="h-44 flex items-center justify-center text-muted-foreground text-sm">No data</div>
        ) : (
          <ResponsiveContainer width="100%" height={200}>
            <BarChart data={series}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }} />
              <Bar dataKey="count" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>
    </div>
  );
}
