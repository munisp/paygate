// @ts-nocheck
import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, ComposedChart, Legend, PieChart, Pie, Cell,
} from "recharts";
import { TrendingUp, TrendingDown, Download, Calendar, ShieldAlert, Layers, Search, Filter, RefreshCw } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

function fmt(n: number | null | undefined) {
  if (!n) return "₦0";
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(0)}K`;
  return `₦${n.toLocaleString()}`;
}

function fmtDate(d: string) {
  try {
    return new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
  } catch {
    return d;
  }
}

export default function Analytics() {
  const [period, setPeriod] = useState("30d");
  const [days, setDays] = useState(30);
  const [searchQuery, setSearchQuery] = useState("");
  const [channelFilter, setChannelFilter] = useState("all");
  const [range, setRange] = useState(() => ({
    from: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000),
    to: new Date(),
  }));

  const handlePeriodChange = (val: string) => {
    setPeriod(val);
    const d = val === "7d" ? 7 : val === "90d" ? 90 : val === "1y" ? 365 : 30;
    setDays(d);
    setRange({ from: new Date(Date.now() - d * 24 * 60 * 60 * 1000), to: new Date() });
  };

  const handleRefresh = () => {
    setRange({ from: new Date(Date.now() - days * 24 * 60 * 60 * 1000), to: new Date() });
  };

  const [isExporting, setIsExporting] = useState(false);
  const exportRevenueMutation = trpc.analytics.exportRevenue.useMutation({
    onSuccess: (data: any) => {
      if (data?.url) {
        // Open the S3 pre-signed URL in a new tab for download
        const a = document.createElement("a");
        a.href = data.url;
        a.download = data.filename ?? `revenue-export-${period}.csv`;
        a.target = "_blank";
        a.click();
        toast.success("Revenue export ready — downloading now");
      }
      setIsExporting(false);
    },
    onError: (err: any) => {
      // Fallback to client-side export
      const rows = [["Date", "Volume (Kobo)", "Count"], ...(timeSeries ?? []).map((r: any) => [r.date, r.volume, r.count])];
      const csv = rows.map((r: any) => r.join(",")).join("\n");
      const a = document.createElement("a");
      a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
      a.download = `analytics-${period}.csv`;
      a.click();
      setIsExporting(false);
    },
  });
  const handleExport = () => {
    setIsExporting(true);
    exportRevenueMutation.mutate({
      from: range.from,
      to: range.to,
      groupBy: days <= 7 ? "day" : days <= 90 ? "week" : "month",
      format: "csv",
    });
  };

  const { data: overview, isLoading: oLoading } = trpc.analytics.overview.useQuery(range, { staleTime: 60_000 });
  const { data: timeSeries, isLoading: tsLoading } = trpc.analytics.timeSeries.useQuery(range, { staleTime: 60_000 });
  const { data: fraudTrend, isLoading: ftLoading } = trpc.analytics.fraudTrend.useQuery(
    { days: Math.min(days, 90, { staleTime: 30_000 }) },
    { staleTime: 120_000 },
  );
  const { data: channelData, isLoading: chLoading } = trpc.analytics.channelBreakdown.useQuery(range, { staleTime: 60_000 });
  const { data: livenessData, isLoading: lvLoading } = trpc.analytics.livenessHistogram.useQuery(
    { days: Math.min(days, 90, { staleTime: 30_000 }) },
    { staleTime: 120_000 },
  );
  const CHANNEL_COLORS: Record<string, string> = {
    card: "#4F46E5",
    bank_transfer: "#10B981",
    mobile_money: "#F59E0B",
    ussd: "#8B5CF6",
    qr: "#06B6D4",
    bnpl: "#EF4444",
  };
  const channelSeries = (channelData ?? []).map((r: any) => ({
    ...r,
    volume: Number(r.volume ?? 0),
    label: r.channel?.replace(/_/g, " ").replace(/\b\w/g, (c: string) => c.toUpperCase()),
  }));

  const isLoading = oLoading || tsLoading;
  const series = (timeSeries ?? []).map((r: any) => ({ ...r, date: fmtDate(r.date) }));
  const fraudSeries = (fraudTrend ?? []).map((r: any) => ({ ...r, date: fmtDate(r.date) }));

  const totalVolume = Number(overview?.transactions?.totalVolume ?? 0);
  const totalCount = Number(overview?.transactions?.totalCount ?? 0);
  const completedCount = Number(overview?.transactions?.completedCount ?? 0);
  const failedCount = Number(overview?.transactions?.failedCount ?? 0);
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Fraud summary KPIs from trend data
  const totalFraudAlerts = fraudSeries.reduce((s: any, r: any) => s + r.total, 0);
  const totalBlocked = fraudSeries.reduce((s: any, r: any) => s + r.blocked, 0);
  const avgBlockRate = fraudSeries.length > 0
    ? Math.round(fraudSeries.reduce((s: any, r: any) => s + r.blockRate, 0) / fraudSeries.length)
    : 0;
  const avgRiskScore = fraudSeries.length > 0
    ? (fraudSeries.reduce((s: any, r: any) => s + r.avgRiskScore, 0) / fraudSeries.length).toFixed(1)
    : "0.0";

  const kpis = [
    { label: "Total Volume", value: fmt(totalVolume), sub: `${totalCount.toLocaleString()} transactions`, up: true },
    { label: "Success Rate", value: `${successRate}%`, sub: `${failedCount} failed`, up: successRate >= 90 },
    { label: "Total Fees", value: fmt(Number(overview?.transactions?.totalFees ?? 0)), sub: "Revenue from fees", up: true },
    { label: "Open Disputes", value: String(overview?.disputes?.disputeCount ?? 0), sub: "Needs attention", up: !(overview?.disputes?.disputeCount) },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Analytics</h1>
          <p className="text-sm text-muted-foreground mt-0.5">Live data from your transactions</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {/* Search input */}
          <div className="relative">
            <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
            <input
              type="text"
              placeholder="Search metrics..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              className="h-8 pl-8 pr-3 text-sm rounded-md border border-input bg-background w-40 focus:outline-none focus:ring-1 focus:ring-ring"
            />
          </div>
          {/* Channel filter */}
          <Select value={channelFilter} onValueChange={setChannelFilter}>
            <SelectTrigger className="w-32 h-8 text-sm">
              <Filter className="w-3 h-3 mr-1" />
              <SelectValue placeholder="Channel" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All Channels</SelectItem>
              <SelectItem value="card">Card</SelectItem>
              <SelectItem value="bank_transfer">Bank Transfer</SelectItem>
              <SelectItem value="mobile_money">Mobile Money</SelectItem>
              <SelectItem value="ussd">USSD</SelectItem>
              <SelectItem value="qr">QR</SelectItem>
              <SelectItem value="bnpl">BNPL</SelectItem>
            </SelectContent>
          </Select>
          {/* Period selector */}
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
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={handleRefresh}><RefreshCw/> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={handleExport} disabled={isExporting}>
            <Download className="w-3 h-3 mr-1" /> Export CSV
          </Button>
        </div>
      </div>

      {/* Transaction KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {kpis.map((k: any) => (
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

      {/* Daily Revenue chart */}
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
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v: any) => fmt(v)} />
              <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number) => [fmt(v), "Volume"]} />
              <Area type="monotone" dataKey="volume" stroke="#4F46E5" strokeWidth={2} fill="url(#aGrad)" dot={false} />
            </AreaChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Daily Transaction Count chart */}
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

      {/* ── Fraud Intelligence Section ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2">
        <ShieldAlert className="w-5 h-5 text-rose-500" />
        <h2 className="text-lg font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Fraud Intelligence</h2>
        <Badge variant="outline" className="text-xs text-rose-600 border-rose-200 bg-rose-50">Last {Math.min(days, 90)} days</Badge>
      </div>

      {/* Fraud KPI cards */}
      <div className="grid grid-cols-2 xl:grid-cols-4 gap-4">
        {[
          { label: "Total Alerts", value: String(totalFraudAlerts), sub: "Flagged + blocked", color: "text-amber-600" },
          { label: "Blocked Txns", value: String(totalBlocked), sub: "Declined by fraud gate", color: "text-rose-600" },
          { label: "Avg Block Rate", value: `${avgBlockRate}%`, sub: "% of alerts blocked", color: avgBlockRate > 10 ? "text-rose-600" : "text-emerald-600" },
          { label: "Avg Risk Score", value: avgRiskScore, sub: "0–100 scale", color: Number(avgRiskScore) > 60 ? "text-rose-600" : "text-emerald-600" },
        ].map((k: any) => (
          <div key={k.label} className="bg-card rounded-xl border border-border p-5">
            {ftLoading ? <div className="space-y-2"><Skeleton className="h-4 w-24" /><Skeleton className="h-8 w-20" /></div> : (
              <>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide mb-2">{k.label}</p>
                <p className={`text-2xl font-bold font-mono ${k.color}`}>{k.value}</p>
                <p className="text-xs text-muted-foreground mt-1">{k.sub}</p>
              </>
            )}
          </div>
        ))}
      </div>

      {/* Fraud Alert Trend — stacked bar (blocked / flagged / clean) */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Daily Fraud Alert Trend</h3>
        <p className="text-sm text-muted-foreground mb-5">Breakdown of blocked, flagged, and clean transactions per day</p>
        {ftLoading ? <Skeleton className="h-52 w-full" /> : fraudSeries.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">
            No fraud alerts in this period — great sign!
          </div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <BarChart data={fraudSeries} stackOffset="none">
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} allowDecimals={false} />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              <Bar dataKey="blocked" name="Blocked" stackId="a" fill="#EF4444" radius={[0, 0, 0, 0]} />
              <Bar dataKey="flagged" name="Flagged (High Risk)" stackId="a" fill="#F59E0B" />
              <Bar dataKey="clean" name="Clean" stackId="a" fill="#10B981" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* Block Rate + Avg Risk Score — dual-axis combo chart */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Block Rate & Average Risk Score</h3>
        <p className="text-sm text-muted-foreground mb-5">Daily block rate (%) and average fraud risk score over time</p>
        {ftLoading ? <Skeleton className="h-52 w-full" /> : fraudSeries.length === 0 ? (
          <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data in this period</div>
        ) : (
          <ResponsiveContainer width="100%" height={230}>
            <ComposedChart data={fraudSeries}>
              <defs>
                <linearGradient id="blockGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#EF4444" stopOpacity={0.15} />
                  <stop offset="95%" stopColor="#EF4444" stopOpacity={0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
              <XAxis dataKey="date" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
              <YAxis
                yAxisId="left"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false} tickLine={false}
                tickFormatter={(v: any) => `${v}%`}
                domain={[0, 100]}
              />
              <YAxis
                yAxisId="right"
                orientation="right"
                tick={{ fontSize: 11, fill: "var(--muted-foreground)" }}
                axisLine={false} tickLine={false}
                domain={[0, 100]}
              />
              <Tooltip
                contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                formatter={(v: number, name: string) => [
                  name === "Block Rate" ? `${v}%` : v.toFixed(1),
                  name,
                ]}
              />
              <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              <Area
                yAxisId="left"
                type="monotone"
                dataKey="blockRate"
                name="Block Rate"
                stroke="#EF4444"
                strokeWidth={2}
                fill="url(#blockGrad)"
                dot={false}
              />
              <Line
                yAxisId="right"
                type="monotone"
                dataKey="avgRiskScore"
                name="Avg Risk Score"
                stroke="#F59E0B"
                strokeWidth={2}
                dot={false}
                strokeDasharray="4 2"
              />
            </ComposedChart>
          </ResponsiveContainer>
        )}
      </div>

      {/* ── Channel Breakdown Section ─────────────────────────────────────── */}
      <div className="flex items-center gap-2 pt-2">
        <Layers className="w-5 h-5 text-indigo-500" />
        <h2 className="text-lg font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Payment Channel Breakdown</h2>
        <span className="text-xs text-muted-foreground">Volume by channel in selected period</span>
      </div>

      <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Pie chart */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Volume Share by Channel</h3>
          <p className="text-sm text-muted-foreground mb-4">Proportion of total transaction volume</p>
          {chLoading ? <Skeleton className="h-52 w-full" /> : channelSeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data in this period</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <PieChart>
                <Pie data={channelSeries} dataKey="volume" nameKey="label" cx="50%" cy="50%" outerRadius={80} label={({ label, percent }) => `${label} ${(percent * 100).toFixed(0)}%`} labelLine={false}>
                  {channelSeries.map((entry: any) => (
                    <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] ?? "#94A3B8"} />
                  ))}
                </Pie>
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number) => [fmt(v), "Volume"]} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
              </PieChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Bar chart: volume + success rate */}
        <div className="bg-card rounded-xl border border-border p-6">
          <h3 className="font-semibold mb-1" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Volume & Success Rate by Channel</h3>
          <p className="text-sm text-muted-foreground mb-4">Transaction volume (bars) and success rate % (line)</p>
          {chLoading ? <Skeleton className="h-52 w-full" /> : channelSeries.length === 0 ? (
            <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data</div>
          ) : (
            <ResponsiveContainer width="100%" height={220}>
              <ComposedChart data={channelSeries}>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
                <YAxis yAxisId="left" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={fmt} />
                <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v: any) => `${v}%`} domain={[0, 100]} />
                <Tooltip contentStyle={{ background: "var(--card)", border: "1px solid var(--border)", borderRadius: "8px", fontSize: "12px" }}
                  formatter={(v: number, name: string) => [name === "Success Rate" ? `${v}%` : fmt(v), name]} />
                <Legend wrapperStyle={{ fontSize: "12px", paddingTop: "8px" }} />
                <Bar yAxisId="left" dataKey="volume" name="Volume" fill="#4F46E5" radius={[4, 4, 0, 0]}>
                  {channelSeries.map((entry: any) => (
                    <Cell key={entry.channel} fill={CHANNEL_COLORS[entry.channel] ?? "#94A3B8"} />
                  ))}
                </Bar>
                <Line yAxisId="right" type="monotone" dataKey="successRate" name="Success Rate" stroke="#10B981" strokeWidth={2} dot={{ r: 4 }} />
              </ComposedChart>
            </ResponsiveContainer>
          )}
        </div>
      </div>

      {/* Channel table */}
      <div className="bg-card rounded-xl border border-border p-6">
        <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Channel Performance Table</h3>
        {chLoading ? <Skeleton className="h-32 w-full" /> : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border">
                  <th className="text-left py-2 px-3 text-muted-foreground font-medium">Channel</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Volume</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Transactions</th>
                  <th className="text-right py-2 px-3 text-muted-foreground font-medium">Success Rate</th>
                </tr>
              </thead>
              <tbody>
                {channelSeries.length === 0 ? (
                  <tr><td colSpan={4} className="text-center py-6 text-muted-foreground">No data in this period</td></tr>
                ) : channelSeries.map((r: any) => (
                  <tr key={r.channel} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                    <td className="py-2.5 px-3">
                      <div className="flex items-center gap-2">
                        <div className="w-2.5 h-2.5 rounded-full" style={{ background: CHANNEL_COLORS[r.channel] ?? "#94A3B8" }} />
                        <span className="font-medium">{r.label}</span>
                      </div>
                    </td>
                    <td className="py-2.5 px-3 text-right font-mono">{fmt(r.volume)}</td>
                    <td className="py-2.5 px-3 text-right">{Number(r.count).toLocaleString()}</td>
                    <td className="py-2.5 px-3 text-right">
                      <span className={`font-medium ${Number(r.successRate) >= 90 ? "text-emerald-600" : Number(r.successRate) >= 70 ? "text-amber-600" : "text-red-600"}`}>
                        {Number(r.successRate ?? 0).toFixed(1)}%
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
      {/* Liveness Score Histogram */}
      <div className="bg-card rounded-xl border border-border p-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Liveness Score Distribution</h3>
            <p className="text-xs text-muted-foreground mt-0.5">KYC submission liveness scores over the last {days} days</p>
          </div>
          {!lvLoading && livenessData && (
            <div className="flex items-center gap-4 text-xs">
              <div className="text-center">
                <p className="font-bold text-lg text-foreground">{livenessData.totalSubmissions}</p>
                <p className="text-muted-foreground">Submissions</p>
              </div>
              <div className="text-center">
                <p className={`font-bold text-lg ${
                  livenessData.passRate >= 0.9 ? 'text-emerald-500' :
                  livenessData.passRate >= 0.7 ? 'text-amber-500' : 'text-red-500'
                }`}>{(livenessData.passRate * 100).toFixed(1)}%</p>
                <p className="text-muted-foreground">Pass Rate</p>
              </div>
              <div className="text-center">
                <p className={`font-bold text-lg ${
                  livenessData.avgScore >= 0.9 ? 'text-emerald-500' :
                  livenessData.avgScore >= 0.7 ? 'text-amber-500' : 'text-red-500'
                }`}>{(livenessData.avgScore * 100).toFixed(1)}%</p>
                <p className="text-muted-foreground">Avg Score</p>
              </div>
            </div>
          )}
        </div>
        {lvLoading ? <Skeleton className="h-48 w-full" /> : (
          livenessData && livenessData.totalSubmissions > 0 ? (
            <ResponsiveContainer width="100%" height={200}>
              <BarChart data={livenessData.buckets} margin={{ top: 4, right: 8, left: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" vertical={false} />
                <XAxis dataKey="label" tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} />
                <YAxis tick={{ fontSize: 11, fill: 'hsl(var(--muted-foreground))' }} allowDecimals={false} />
                <Tooltip
                  contentStyle={{ background: 'hsl(var(--card))', border: '1px solid hsl(var(--border))', borderRadius: '8px', fontSize: 12 }}
                  formatter={(val: any) => [val, 'Submissions']}
                />
                <Bar dataKey="count" radius={[4, 4, 0, 0]}>
                  {livenessData.buckets.map((b: any, i: number) => (
                    <Cell
                      key={i}
                      fill={
                        b.min >= 0.9 ? '#10B981' :
                        b.min >= 0.7 ? '#F59E0B' : '#EF4444'
                      }
                    />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">
              No liveness data in this period
            </div>
          )
        )}
        {/* Legend */}
        <div className="flex items-center gap-4 mt-3 text-xs text-muted-foreground">
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-emerald-500" /> Pass (≥90%)</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-amber-500" /> Borderline (70–89%)</div>
          <div className="flex items-center gap-1.5"><div className="w-3 h-3 rounded-sm bg-red-500" /> Fail (&lt;70%)</div>
        </div>
      </div>
    </div>
  );
}
