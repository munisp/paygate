import { useState, useMemo, useCallback } from "react";
import {
  AreaChart, Area, BarChart, Bar, LineChart, Line,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend, ComposedChart,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  Users, CreditCard, Activity, RefreshCw, Download, Calendar,
  ShieldAlert, CheckCircle2, XCircle, Clock, Zap, BarChart2,
  ArrowRight, Filter, ChevronDown,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Separator } from "@/components/ui/separator";
import { trpc } from "@/lib/trpc";
import { useLocation } from "wouter";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtNGN(kobo: number | string | null | undefined): string {
  const n = Number(kobo ?? 0);
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
}

function fmtDate(d: string | Date): string {
  try {
    return new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric" });
  } catch {
    return String(d);
  }
}

function fmtTime(d: string | Date): string {
  try {
    return new Date(d).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" });
  } catch {
    return "";
  }
}

function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// ─── Period Presets ───────────────────────────────────────────────────────────

type PeriodKey = "7d" | "30d" | "90d" | "1y";

const PERIODS: { key: PeriodKey; label: string; days: number }[] = [
  { key: "7d", label: "7 Days", days: 7 },
  { key: "30d", label: "30 Days", days: 30 },
  { key: "90d", label: "90 Days", days: 90 },
  { key: "1y", label: "1 Year", days: 365 },
];

// ─── Colour palette ───────────────────────────────────────────────────────────

const COLORS = {
  primary: "#6366f1",
  success: "#22c55e",
  danger: "#ef4444",
  warning: "#f59e0b",
  muted: "#94a3b8",
  channel: ["#6366f1", "#22c55e", "#f59e0b", "#ef4444", "#8b5cf6", "#06b6d4"],
};

const DOW_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

// ─── KPI Card ─────────────────────────────────────────────────────────────────

interface KpiCardProps {
  title: string;
  value: string;
  change: number;
  icon: React.ElementType;
  loading?: boolean;
  subtitle?: string;
  accent?: string;
}

function KpiCard({ title, value, change, icon: Icon, loading, subtitle, accent = COLORS.primary }: KpiCardProps) {
  const isUp = change >= 0;
  return (
    <Card className="relative overflow-hidden border-0 shadow-sm bg-card">
      <div className="absolute top-0 left-0 w-1 h-full rounded-l-lg" style={{ background: accent }} />
      <CardContent className="pt-5 pb-4 pl-6">
        {loading ? (
          <div className="space-y-2">
            <Skeleton className="h-4 w-24" />
            <Skeleton className="h-8 w-32" />
            <Skeleton className="h-3 w-20" />
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between">
              <div>
                <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
                <p className="text-2xl font-bold text-foreground">{value}</p>
                {subtitle && <p className="text-xs text-muted-foreground mt-0.5">{subtitle}</p>}
              </div>
              <div className="p-2 rounded-lg" style={{ background: `${accent}18` }}>
                <Icon className="w-5 h-5" style={{ color: accent }} />
              </div>
            </div>
            <div className="flex items-center gap-1 mt-3">
              {isUp ? (
                <ArrowUpRight className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <ArrowDownRight className="w-3.5 h-3.5 text-red-500" />
              )}
              <span className={`text-xs font-semibold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                {Math.abs(change).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">vs prev period</span>
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, { label: string; className: string }> = {
    completed: { label: "Completed", className: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400" },
    failed: { label: "Failed", className: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400" },
    pending: { label: "Pending", className: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400" },
    processing: { label: "Processing", className: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400" },
  };
  const s = map[status] ?? { label: status, className: "bg-muted text-muted-foreground" };
  return <span className={`inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium ${s.className}`}>{s.label}</span>;
}

// ─── Channel icon ─────────────────────────────────────────────────────────────

function channelLabel(ch: string): string {
  const m: Record<string, string> = {
    card: "Card", bank_transfer: "Bank Transfer", ussd: "USSD",
    qr: "QR Code", mobile_money: "Mobile Money", wallet: "Wallet",
  };
  return m[ch] ?? ch;
}

// ─── Heatmap Cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const bg = intensity === 0
    ? "bg-muted/30"
    : intensity < 0.25 ? "bg-indigo-100 dark:bg-indigo-900/30"
    : intensity < 0.5 ? "bg-indigo-300 dark:bg-indigo-700/50"
    : intensity < 0.75 ? "bg-indigo-500 dark:bg-indigo-500/70"
    : "bg-indigo-700 dark:bg-indigo-400";
  return (
    <div
      className={`w-full aspect-square rounded-sm ${bg} transition-colors`}
      title={`${value} transactions`}
    />
  );
}

// ─── Custom Tooltip ───────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-popover border border-border rounded-lg shadow-lg p-3 text-sm">
      <p className="font-semibold text-foreground mb-1">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2 text-muted-foreground">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span>{p.name}:</span>
          <span className="font-medium text-foreground">
            {p.name?.toLowerCase().includes("volume") || p.name?.toLowerCase().includes("amount") || p.name?.toLowerCase().includes("revenue")
              ? fmtNGN(p.value)
              : p.value?.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MerchantAnalyticsDashboard() {
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [chartView, setChartView] = useState<"revenue" | "volume">("revenue");
  const [refreshKey, setRefreshKey] = useState(0);

  const range = useMemo(() => {
    const days = PERIODS.find(p => p.key === period)?.days ?? 30;
    return {
      from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      to: new Date(),
    };
  }, [period, refreshKey]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: bundle, isLoading } = trpc.merchantAnalytics.bundle.useQuery(range, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: recentFeed, isLoading: feedLoading } = trpc.merchantAnalytics.recentFeed.useQuery(
    { limit: 20 },
    { staleTime: 30_000, refetchInterval: 60_000 },
  );

  // ── Derived metrics ────────────────────────────────────────────────────────
  const kpis = useMemo(() => {
    const cur = bundle?.comparison?.current;
    const prev = bundle?.comparison?.previous;
    if (!cur) return null;
    const curVol = Number(cur.totalVolume ?? 0);
    const prevVol = Number(prev?.totalVolume ?? 0);
    const curCount = Number(cur.totalCount ?? 0);
    const prevCount = Number(prev?.totalCount ?? 0);
    const curCompleted = Number(cur.completedCount ?? 0);
    const curFailed = Number(cur.failedCount ?? 0);
    const successRate = curCount > 0 ? (curCompleted / curCount) * 100 : 0;
    const prevCompleted = Number(prev?.completedCount ?? 0);
    const prevFailed = Number(prev?.failedCount ?? 0);
    const prevTotal = Number(prev?.totalCount ?? 0);
    const prevSuccessRate = prevTotal > 0 ? (prevCompleted / prevTotal) * 100 : 0;
    const curFees = Number(cur.totalFees ?? 0);
    const prevFees = Number(prev?.totalFees ?? 0);
    const curCustomers = Number(cur.newCustomers ?? 0);
    const prevCustomers = Number(prev?.newCustomers ?? 0);
    return {
      volume: { value: curVol, change: pctChange(curVol, prevVol) },
      count: { value: curCount, change: pctChange(curCount, prevCount) },
      successRate: { value: successRate, change: pctChange(successRate, prevSuccessRate) },
      fees: { value: curFees, change: pctChange(curFees, prevFees) },
      newCustomers: { value: curCustomers, change: pctChange(curCustomers, prevCustomers) },
      avgTx: { value: Number(cur.avgTxAmount ?? 0), change: pctChange(Number(cur.avgTxAmount ?? 0), Number(prev?.avgTxAmount ?? 0)) },
    };
  }, [bundle]);

  // ── Time series data ───────────────────────────────────────────────────────
  const timeSeriesData = useMemo(() => {
    return (bundle?.timeSeries ?? []).map((d: any) => ({
      date: fmtDate(d.date),
      revenue: Number(d.volume ?? 0),
      fees: Number(d.fees ?? 0),
      count: Number(d.count ?? 0),
    }));
  }, [bundle]);

  // ── Daily status breakdown ─────────────────────────────────────────────────
  const dailyData = useMemo(() => {
    return (bundle?.dailyBreakdown ?? []).map((d: any) => ({
      date: fmtDate(d.date),
      completed: Number(d.completed ?? 0),
      failed: Number(d.failed ?? 0),
      pending: Number(d.pending ?? 0),
    }));
  }, [bundle]);

  // ── Channel breakdown ──────────────────────────────────────────────────────
  const channelData = useMemo(() => {
    return (bundle?.channelBreakdown ?? []).map((c: any, i: number) => ({
      name: channelLabel(c.channel ?? ""),
      value: Number(c.volume ?? 0),
      count: Number(c.count ?? 0),
      successRate: Number(c.successRate ?? 0),
      fill: COLORS.channel[i % COLORS.channel.length],
    }));
  }, [bundle]);

  // ── Heatmap data ───────────────────────────────────────────────────────────
  const heatmapGrid = useMemo(() => {
    // Build 7×24 grid [dow][hour]
    const grid: number[][] = Array.from({ length: 7 }, () => new Array(24).fill(0));
    for (const cell of bundle?.heatmap ?? []) {
      const dow = Number(cell.dow ?? 0);
      const hour = Number(cell.hour ?? 0);
      if (dow >= 0 && dow < 7 && hour >= 0 && hour < 24) {
        grid[dow][hour] = Number(cell.txCount ?? 0);
      }
    }
    return grid;
  }, [bundle]);

  const heatmapMax = useMemo(() => Math.max(...heatmapGrid.flat(), 1), [heatmapGrid]);

  // ── Export CSV ─────────────────────────────────────────────────────────────
  const handleExport = useCallback(() => {
    const rows = [
      ["Date", "Revenue (Kobo)", "Fees (Kobo)", "Transactions"],
      ...timeSeriesData.map(r => [r.date, r.revenue, r.fees, r.count]),
    ];
    const csv = rows.map(r => r.join(",")).join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    a.download = `analytics-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
  }, [timeSeriesData, period]);

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── Header ── */}
      <div className="border-b border-border bg-card/50 backdrop-blur-sm sticky top-0 z-10">
        <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-4 flex flex-col sm:flex-row sm:items-center gap-3">
          <div className="flex-1">
            <h1 className="text-xl font-bold text-foreground flex items-center gap-2">
              <BarChart2 className="w-5 h-5 text-indigo-500" />
              Merchant Analytics
            </h1>
            <p className="text-sm text-muted-foreground mt-0.5">
              {bundle?.merchant?.businessName ?? "Your Business"} — real-time payment insights
            </p>
          </div>
          <div className="flex items-center gap-2 flex-wrap">
            {/* Period selector */}
            <Tabs value={period} onValueChange={v => setPeriod(v as PeriodKey)}>
              <TabsList className="h-8">
                {PERIODS.map(p => (
                  <TabsTrigger key={p.key} value={p.key} className="text-xs px-3 h-7">
                    {p.label}
                  </TabsTrigger>
                ))}
              </TabsList>
            </Tabs>
            <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Export CSV
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-screen-2xl mx-auto px-4 sm:px-6 py-6 space-y-6">

        {/* ── KPI Cards ── */}
        <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-4">
          <KpiCard
            title="Total Volume"
            value={fmtNGN(kpis?.volume.value)}
            change={kpis?.volume.change ?? 0}
            icon={DollarSign}
            loading={isLoading}
            accent={COLORS.primary}
          />
          <KpiCard
            title="Transactions"
            value={(kpis?.count.value ?? 0).toLocaleString()}
            change={kpis?.count.change ?? 0}
            icon={Activity}
            loading={isLoading}
            accent="#22c55e"
          />
          <KpiCard
            title="Success Rate"
            value={`${(kpis?.successRate.value ?? 0).toFixed(1)}%`}
            change={kpis?.successRate.change ?? 0}
            icon={CheckCircle2}
            loading={isLoading}
            accent="#06b6d4"
          />
          <KpiCard
            title="Fees Earned"
            value={fmtNGN(kpis?.fees.value)}
            change={kpis?.fees.change ?? 0}
            icon={TrendingUp}
            loading={isLoading}
            accent="#f59e0b"
          />
          <KpiCard
            title="New Customers"
            value={(kpis?.newCustomers.value ?? 0).toLocaleString()}
            change={kpis?.newCustomers.change ?? 0}
            icon={Users}
            loading={isLoading}
            accent="#8b5cf6"
          />
          <KpiCard
            title="Avg Transaction"
            value={fmtNGN(kpis?.avgTx.value)}
            change={kpis?.avgTx.change ?? 0}
            icon={CreditCard}
            loading={isLoading}
            accent="#ef4444"
          />
        </div>

        {/* ── Revenue / Volume Chart + Channel Pie ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Main trend chart */}
          <Card className="xl:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Revenue Trend</CardTitle>
                  <CardDescription className="text-xs">Daily completed transaction volume</CardDescription>
                </div>
                <Tabs value={chartView} onValueChange={v => setChartView(v as any)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="revenue" className="text-xs px-2 h-6">Revenue</TabsTrigger>
                    <TabsTrigger value="volume" className="text-xs px-2 h-6">Count</TabsTrigger>
                  </TabsList>
                </Tabs>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : timeSeriesData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">
                  No data for this period
                </div>
              ) : (
                <ResponsiveContainer width="100%" height={220}>
                  <AreaChart data={timeSeriesData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                    <defs>
                      <linearGradient id="revGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis
                      tick={{ fontSize: 11 }}
                      tickLine={false}
                      axisLine={false}
                      tickFormatter={v => chartView === "revenue" ? fmtNGN(v) : v.toLocaleString()}
                    />
                    <Tooltip content={<ChartTooltip />} />
                    {chartView === "revenue" ? (
                      <Area
                        type="monotone"
                        dataKey="revenue"
                        name="Revenue"
                        stroke={COLORS.primary}
                        strokeWidth={2}
                        fill="url(#revGrad)"
                        dot={false}
                      />
                    ) : (
                      <Area
                        type="monotone"
                        dataKey="count"
                        name="Transactions"
                        stroke={COLORS.success}
                        strokeWidth={2}
                        fill="url(#revGrad)"
                        dot={false}
                      />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Channel breakdown donut */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment Channels</CardTitle>
              <CardDescription className="text-xs">Volume by payment method</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-56 w-full" />
              ) : channelData.length === 0 ? (
                <div className="h-56 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie
                        data={channelData}
                        cx="50%"
                        cy="50%"
                        innerRadius={45}
                        outerRadius={72}
                        paddingAngle={3}
                        dataKey="value"
                      >
                        {channelData.map((entry, i) => (
                          <Cell key={i} fill={entry.fill} />
                        ))}
                      </Pie>
                      <Tooltip
                        formatter={(v: any, name: string) => [fmtNGN(v), name]}
                        contentStyle={{ fontSize: 12 }}
                      />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="mt-2 space-y-1.5">
                    {channelData.slice(0, 5).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.fill }} />
                          <span className="text-muted-foreground truncate max-w-[90px]">{c.name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{c.successRate.toFixed(0)}%</span>
                          <span className="font-medium text-foreground">{fmtNGN(c.value)}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Transaction Status Breakdown + Fraud Stats ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Stacked bar: status breakdown */}
          <Card className="xl:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Daily Transaction Status</CardTitle>
              <CardDescription className="text-xs">Completed, failed, and pending by day</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-52 w-full" />
              ) : dailyData.length === 0 ? (
                <div className="h-52 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <ResponsiveContainer width="100%" height={210}>
                  <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }} barSize={8}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <YAxis tick={{ fontSize: 11 }} tickLine={false} axisLine={false} />
                    <Tooltip content={<ChartTooltip />} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                    <Bar dataKey="completed" name="Completed" stackId="a" fill={COLORS.success} radius={[0, 0, 0, 0]} />
                    <Bar dataKey="pending" name="Pending" stackId="a" fill={COLORS.warning} />
                    <Bar dataKey="failed" name="Failed" stackId="a" fill={COLORS.danger} radius={[3, 3, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Fraud & dispute summary */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-amber-500" />
                Risk Summary
              </CardTitle>
              <CardDescription className="text-xs">Fraud alerts and open disputes</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (
                <>
                  {[
                    {
                      label: "Total Fraud Alerts",
                      value: bundle?.fraudStats?.total ?? 0,
                      icon: ShieldAlert,
                      color: "text-amber-500",
                      bg: "bg-amber-50 dark:bg-amber-900/20",
                    },
                    {
                      label: "Open Alerts",
                      value: bundle?.fraudStats?.open ?? 0,
                      icon: XCircle,
                      color: "text-red-500",
                      bg: "bg-red-50 dark:bg-red-900/20",
                    },
                    {
                      label: "Under Investigation",
                      value: bundle?.fraudStats?.investigating ?? 0,
                      icon: Clock,
                      color: "text-blue-500",
                      bg: "bg-blue-50 dark:bg-blue-900/20",
                    },
                    {
                      label: "Avg Risk Score",
                      value: `${((bundle?.fraudStats?.avgRiskScore ?? 0) * 100).toFixed(0)}%`,
                      icon: Activity,
                      color: "text-indigo-500",
                      bg: "bg-indigo-50 dark:bg-indigo-900/20",
                    },
                  ].map((item, i) => (
                    <div key={i} className={`flex items-center gap-3 p-3 rounded-lg ${item.bg}`}>
                      <item.icon className={`w-4 h-4 flex-shrink-0 ${item.color}`} />
                      <span className="text-sm text-muted-foreground flex-1">{item.label}</span>
                      <span className="text-sm font-bold text-foreground">{item.value}</span>
                    </div>
                  ))}
                  <Button
                    variant="outline"
                    size="sm"
                    className="w-full mt-2 text-xs gap-1"
                    onClick={() => setLocation("/fraud-risk")}
                  >
                    View Fraud Risk <ArrowRight className="w-3 h-3" />
                  </Button>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Hourly Heatmap ── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base flex items-center gap-2">
              <Zap className="w-4 h-4 text-indigo-500" />
              Activity Heatmap
            </CardTitle>
            <CardDescription className="text-xs">
              Transaction frequency by hour of day and day of week (darker = more activity)
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-36 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <div className="min-w-[600px]">
                  {/* Hour labels */}
                  <div className="flex items-center mb-1 pl-10">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="flex-1 text-center text-[10px] text-muted-foreground">
                        {h % 3 === 0 ? `${h}h` : ""}
                      </div>
                    ))}
                  </div>
                  {/* Grid rows */}
                  {DOW_LABELS.map((day, dow) => (
                    <div key={dow} className="flex items-center gap-1 mb-1">
                      <span className="w-9 text-[11px] text-muted-foreground text-right pr-2 flex-shrink-0">{day}</span>
                      {Array.from({ length: 24 }, (_, h) => (
                        <div key={h} className="flex-1">
                          <HeatmapCell value={heatmapGrid[dow][h]} max={heatmapMax} />
                        </div>
                      ))}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-2 mt-2 justify-end">
                    <span className="text-[10px] text-muted-foreground">Less</span>
                    {["bg-muted/30", "bg-indigo-100", "bg-indigo-300", "bg-indigo-500", "bg-indigo-700"].map((c, i) => (
                      <div key={i} className={`w-3 h-3 rounded-sm ${c}`} />
                    ))}
                    <span className="text-[10px] text-muted-foreground">More</span>
                  </div>
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* ── Top Customers + Recent Feed ── */}
        <div className="grid grid-cols-1 xl:grid-cols-2 gap-4">
          {/* Top customers */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base">Top Customers</CardTitle>
                  <CardDescription className="text-xs">By total spend this period</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 h-7"
                  onClick={() => setLocation("/customers")}
                >
                  All Customers <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (bundle?.topCustomers ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No customer data for this period</div>
              ) : (
                <div className="space-y-1">
                  {(bundle?.topCustomers ?? []).slice(0, 8).map((c: any, i: number) => {
                    const spend = Number(c.totalSpend ?? 0);
                    const maxSpend = Number((bundle?.topCustomers ?? [])[0]?.totalSpend ?? 1);
                    const pct = maxSpend > 0 ? (spend / maxSpend) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors group">
                        <div className="w-6 h-6 rounded-full bg-indigo-100 dark:bg-indigo-900/30 flex items-center justify-center text-[11px] font-bold text-indigo-600 dark:text-indigo-400 flex-shrink-0">
                          {i + 1}
                        </div>
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-medium text-foreground truncate">
                            {c.customerEmail ?? c.customerId ?? "Anonymous"}
                          </p>
                          <div className="flex items-center gap-2 mt-0.5">
                            <div className="flex-1 h-1 bg-muted rounded-full overflow-hidden">
                              <div
                                className="h-full bg-indigo-500 rounded-full transition-all"
                                style={{ width: `${pct}%` }}
                              />
                            </div>
                            <span className="text-[10px] text-muted-foreground flex-shrink-0">
                              {Number(c.txCount ?? 0)} txns
                            </span>
                          </div>
                        </div>
                        <span className="text-sm font-bold text-foreground flex-shrink-0">{fmtNGN(spend)}</span>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent transaction feed */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div>
                  <CardTitle className="text-base flex items-center gap-2">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Live Transaction Feed
                  </CardTitle>
                  <CardDescription className="text-xs">Most recent 20 transactions</CardDescription>
                </div>
                <Button
                  variant="ghost"
                  size="sm"
                  className="text-xs gap-1 h-7"
                  onClick={() => setLocation("/transactions")}
                >
                  All Transactions <ArrowRight className="w-3 h-3" />
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {feedLoading ? (
                <div className="space-y-2">
                  {[1, 2, 3, 4, 5].map(i => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (recentFeed ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No recent transactions</div>
              ) : (
                <div className="space-y-1 max-h-[380px] overflow-y-auto pr-1">
                  {(recentFeed ?? []).map((tx: any, i: number) => (
                    <div
                      key={tx.id ?? i}
                      className="flex items-center gap-3 py-2 px-2 rounded-lg hover:bg-muted/50 transition-colors"
                    >
                      {/* Status icon */}
                      <div className="flex-shrink-0">
                        {tx.status === "completed" ? (
                          <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                        ) : tx.status === "failed" ? (
                          <XCircle className="w-4 h-4 text-red-500" />
                        ) : (
                          <Clock className="w-4 h-4 text-amber-500" />
                        )}
                      </div>
                      {/* Details */}
                      <div className="flex-1 min-w-0">
                        <p className="text-xs font-medium text-foreground truncate">
                          {tx.customerEmail ?? tx.description ?? "Payment"}
                        </p>
                        <p className="text-[10px] text-muted-foreground">
                          {channelLabel(tx.channel ?? "")} · {fmtTime(tx.createdAt)}
                        </p>
                      </div>
                      {/* Amount */}
                      <div className="text-right flex-shrink-0">
                        <p className={`text-sm font-bold ${tx.status === "failed" ? "text-red-500" : "text-foreground"}`}>
                          {fmtNGN(tx.amount)}
                        </p>
                        <StatusBadge status={tx.status ?? "pending"} />
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Channel Performance Table ── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Channel Performance Breakdown</CardTitle>
            <CardDescription className="text-xs">Volume, transaction count, and success rate by payment channel</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-40 w-full" />
            ) : channelData.length === 0 ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No channel data</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-border">
                      <th className="text-left py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Channel</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Volume</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Transactions</th>
                      <th className="text-right py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Success Rate</th>
                      <th className="py-2 px-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Share</th>
                    </tr>
                  </thead>
                  <tbody>
                    {channelData.map((c, i) => {
                      const totalVol = channelData.reduce((s, x) => s + x.value, 0);
                      const share = totalVol > 0 ? (c.value / totalVol) * 100 : 0;
                      return (
                        <tr key={i} className="border-b border-border/50 hover:bg-muted/30 transition-colors">
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <span className="w-2.5 h-2.5 rounded-full flex-shrink-0" style={{ background: c.fill }} />
                              <span className="font-medium text-foreground">{c.name}</span>
                            </div>
                          </td>
                          <td className="py-3 px-3 text-right font-semibold text-foreground">{fmtNGN(c.value)}</td>
                          <td className="py-3 px-3 text-right text-muted-foreground">{c.count.toLocaleString()}</td>
                          <td className="py-3 px-3 text-right">
                            <span className={`font-semibold ${c.successRate >= 90 ? "text-emerald-500" : c.successRate >= 70 ? "text-amber-500" : "text-red-500"}`}>
                              {c.successRate.toFixed(1)}%
                            </span>
                          </td>
                          <td className="py-3 px-3">
                            <div className="flex items-center gap-2">
                              <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{ width: `${share}%`, background: c.fill }}
                                />
                              </div>
                              <span className="text-xs text-muted-foreground w-10 text-right">{share.toFixed(1)}%</span>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>

      </div>
    </div>
  );
}
