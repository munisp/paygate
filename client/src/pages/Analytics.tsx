import { useState } from "react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  BarChart, Bar, LineChart, Line, ComposedChart, Legend,
} from "recharts";
import { TrendingUp, TrendingDown, Download, Calendar, ShieldAlert } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";

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

  const handleExport = () => {
    const rows = [["Date", "Volume (Kobo)", "Count"], ...(timeSeries ?? []).map((r: any) => [r.date, r.volume, r.count])];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `analytics-${period}.csv`;
    a.click();
  };

  const { data: overview, isLoading: oLoading } = trpc.analytics.overview.useQuery(range, { staleTime: 60_000 });
  const { data: timeSeries, isLoading: tsLoading } = trpc.analytics.timeSeries.useQuery(range, { staleTime: 60_000 });
  const { data: fraudTrend, isLoading: ftLoading } = trpc.analytics.fraudTrend.useQuery(
    { days: Math.min(days, 90) },
    { staleTime: 120_000 },
  );

  const isLoading = oLoading || tsLoading;
  const series = (timeSeries ?? []).map((r: any) => ({ ...r, date: fmtDate(r.date) }));
  const fraudSeries = (fraudTrend ?? []).map((r) => ({ ...r, date: fmtDate(r.date) }));

  const totalVolume = Number(overview?.transactions?.totalVolume ?? 0);
  const totalCount = Number(overview?.transactions?.totalCount ?? 0);
  const completedCount = Number(overview?.transactions?.completedCount ?? 0);
  const failedCount = Number(overview?.transactions?.failedCount ?? 0);
  const successRate = totalCount > 0 ? Math.round((completedCount / totalCount) * 100) : 0;

  // Fraud summary KPIs from trend data
  const totalFraudAlerts = fraudSeries.reduce((s, r) => s + r.total, 0);
  const totalBlocked = fraudSeries.reduce((s, r) => s + r.blocked, 0);
  const avgBlockRate = fraudSeries.length > 0
    ? Math.round(fraudSeries.reduce((s, r) => s + r.blockRate, 0) / fraudSeries.length)
    : 0;
  const avgRiskScore = fraudSeries.length > 0
    ? (fraudSeries.reduce((s, r) => s + r.avgRiskScore, 0) / fraudSeries.length).toFixed(1)
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

      {/* Transaction KPI cards */}
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
              <YAxis tick={{ fontSize: 11, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={(v) => fmt(v)} />
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
        ].map((k) => (
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
                tickFormatter={(v) => `${v}%`}
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
    </div>
  );
}
