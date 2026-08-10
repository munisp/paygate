// BillingAnalytics.tsx — Wave 117
// Real-time billing analytics: revenue trend, EBITDA, platform/reseller split.
// Calls trpc.billingExt.getAnalytics and trpc.billingExt.getRevenueTimeSeries.

import { useState, useMemo } from "react";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import {
  BarChart, Bar, LineChart, Line, PieChart, Pie, Cell,
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer,
} from "recharts";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  TrendingUp, TrendingDown, DollarSign, Activity, BarChart2,
  RefreshCw, AlertCircle, ArrowLeft,
} from "lucide-react";
import { Link } from "wouter";

// ── Helpers ───────────────────────────────────────────────────────────────────

function koboToNaira(k: number) {
  return k / 100;
}

function fmt(naira: number) {
  if (naira >= 1_000_000) return `₦${(naira / 1_000_000).toFixed(2)}M`;
  if (naira >= 1_000) return `₦${(naira / 1_000).toFixed(1)}K`;
  return `₦${naira.toFixed(0)}`;
}

function pct(n: number) {
  return `${n.toFixed(1)}%`;
}

const COLORS = {
  platform: "#6366f1",
  reseller: "#f59e0b",
  interchange: "#ef4444",
  overhead: "#8b5cf6",
  ebitda: "#10b981",
  gross: "#3b82f6",
};

// ── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title, value, sub, icon: Icon, trend, color,
}: {
  title: string;
  value: string;
  sub?: string;
  icon: React.ElementType;
  trend?: "up" | "down" | "neutral";
  color: string;
}) {
  return (
    <Card className="bg-card border-border">
      <CardContent className="p-5">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground uppercase tracking-wider mb-1">{title}</p>
            <p className="text-2xl font-bold text-foreground">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-1">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg`} style={{ background: `${color}22` }}>
            <Icon className="w-5 h-5" style={{ color }} />
          </div>
        </div>
        {trend && (
          <div className="mt-3 flex items-center gap-1">
            {trend === "up" ? (
              <TrendingUp className="w-3 h-3 text-emerald-500" />
            ) : trend === "down" ? (
              <TrendingDown className="w-3 h-3 text-red-500" />
            ) : null}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ── Main Component ────────────────────────────────────────────────────────────

export default function BillingAnalytics() {
  // Error notification helper
  const showError = (msg: string) => toast.error(msg);
  void showError; // eslint-disable-line

  const { user } = useAuth();
  const [granularity, setGranularity] = useState<"day" | "week" | "month">("day");
  const [dateRange, setDateRange] = useState<"7d" | "30d" | "90d">("30d");

  const tenantId = "ten_default"; // In production: derive from merchant context

  const { from, to } = useMemo(() => {
    const to = new Date();
    const days = dateRange === "7d" ? 7 : dateRange === "90d" ? 90 : 30;
    const from = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    return { from, to };
  }, [dateRange]);

  const billingInterval = useAdaptiveInterval(30_000);

  const analyticsQuery = trpc.billingExt.getAnalytics.useQuery(
    { tenantId, from, to },
    { refetchInterval: billingInterval , staleTime: 30_000 })

  const timeSeriesQuery = trpc.billingExt.getRevenueTimeSeries.useQuery(
    { tenantId, from, to, granularity },
    { refetchInterval: billingInterval , staleTime: 30_000 })

  const analytics = analyticsQuery.data;
  const timeSeries = timeSeriesQuery.data ?? [];

  const isLoading = analyticsQuery.isLoading || timeSeriesQuery.isLoading;
  const isError = analyticsQuery.isError || timeSeriesQuery.isError;

  // Derived chart data
  const splitData = analytics
    ? [
        { name: "Platform Revenue", value: koboToNaira(analytics.totals.platformRevenueKobo), color: COLORS.platform },
        { name: "Reseller Revenue", value: koboToNaira(analytics.totals.resellerRevenueKobo), color: COLORS.reseller },
        { name: "Interchange Cost", value: koboToNaira(analytics.totals.interchangeCostKobo), color: COLORS.interchange },
      ]
    : [];

  const ebitdaData = analytics
    ? [
        { name: "Net Platform", value: koboToNaira(analytics.totals.netPlatformKobo), fill: COLORS.platform },
        { name: "Overhead", value: koboToNaira(analytics.totals.overheadKobo), fill: COLORS.overhead },
        { name: "EBITDA", value: koboToNaira(Math.max(0, analytics.totals.ebitdaKobo)), fill: COLORS.ebitda },
      ]
    : [];

  const chartData = timeSeries.map(r => ({
    period: r.period,
    "Gross Fee": koboToNaira(r.grossFeeKobo),
    "Platform Rev": koboToNaira(r.platformRevenueKobo),
    "Reseller Rev": koboToNaira(r.resellerRevenueKobo),
    "Net Platform": koboToNaira(r.netPlatformKobo),
    Transactions: r.transactions,
  }));

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64">
        <RefreshCw className="w-6 h-6 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">Loading billing analytics…</span>
      </div>
    );
  }

  if (isError) {
    return (
      <div className="flex items-center justify-center h-64 gap-2 text-red-500">
        <AlertCircle className="w-5 h-5" />
        <span>Failed to load billing analytics. Check your permissions.</span>
      </div>
    );
  }

  const totals = analytics?.totals;

  return (
    <div className="p-6 space-y-6 max-w-7xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Link href="/billing-engine">
            <Button variant="ghost" size="sm">
              <ArrowLeft className="w-4 h-4 mr-1" />
              Billing Engine
            </Button>
          </Link>
          <div>
            <h1 className="text-2xl font-bold text-foreground">Billing Analytics</h1>
            <p className="text-sm text-muted-foreground">
              Live revenue, EBITDA, and profit split — tenant <code className="text-xs bg-muted px-1 rounded">{tenantId}</code>
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Select value={dateRange} onValueChange={(v) => setDateRange(v as typeof dateRange)}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7d</SelectItem>
              <SelectItem value="30d">Last 30d</SelectItem>
              <SelectItem value="90d">Last 90d</SelectItem>
            </SelectContent>
          </Select>
          <Select value={granularity} onValueChange={(v) => setGranularity(v as typeof granularity)}>
            <SelectTrigger className="w-24 h-8 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="day">Daily</SelectItem>
              <SelectItem value="week">Weekly</SelectItem>
              <SelectItem value="month">Monthly</SelectItem>
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            aria-label="Refresh" onClick={() => { analyticsQuery.refetch(); timeSeriesQuery.refetch(); }}
          ><RefreshCw/>
            Refresh
          </Button>
        </div>
      </div>

      {/* KPI Row */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <KpiCard
          title="Total Transactions"
          value={(totals?.transactions ?? 0).toLocaleString()}
          sub={`in last ${dateRange}`}
          icon={Activity}
          color={COLORS.gross}
        />
        <KpiCard
          title="Gross Fee Revenue"
          value={fmt(koboToNaira(totals?.grossFeeKobo ?? 0))}
          sub="before splits"
          icon={DollarSign}
          color={COLORS.gross}
        />
        <KpiCard
          title="Platform Net Revenue"
          value={fmt(koboToNaira(totals?.netPlatformKobo ?? 0))}
          sub="after interchange"
          icon={TrendingUp}
          color={COLORS.platform}
        />
        <KpiCard
          title="EBITDA"
          value={fmt(koboToNaira(totals?.ebitdaKobo ?? 0))}
          sub={`${pct(totals?.ebitdaMarginPct ?? 0)} margin`}
          icon={BarChart2}
          color={(totals?.ebitdaKobo ?? 0) >= 0 ? COLORS.ebitda : "#ef4444"}
          trend={(totals?.ebitdaKobo ?? 0) >= 0 ? "up" : "down"}
        />
      </div>

      {/* Revenue Trend Chart */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Revenue Trend</CardTitle>
        </CardHeader>
        <CardContent>
          {chartData.length === 0 ? (
            <div className="flex flex-col items-center justify-center h-48 text-muted-foreground">
              <BarChart2 className="w-10 h-10 mb-2 opacity-30" />
              <p className="text-sm">No billing events in this period.</p>
              <p className="text-xs mt-1">Events populate once the Kafka pipeline processes live transactions.</p>
            </div>
          ) : (
            <ResponsiveContainer width="100%" height={280}>
              <LineChart data={chartData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="period" tick={{ fontSize: 11 }} />
                <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} />
                <Tooltip
                  formatter={(value: number, name: string) => [fmt(value), name]}
                  contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }}
                />
                <Legend />
                <Line type="monotone" dataKey="Gross Fee" stroke={COLORS.gross} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Platform Rev" stroke={COLORS.platform} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Reseller Rev" stroke={COLORS.reseller} strokeWidth={2} dot={false} />
                <Line type="monotone" dataKey="Net Platform" stroke={COLORS.ebitda} strokeWidth={2} dot={false} strokeDasharray="4 2" />
              </LineChart>
            </ResponsiveContainer>
          )}
        </CardContent>
      </Card>

      {/* Split + EBITDA Row */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Profit Split Donut */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">Profit Split</CardTitle>
          </CardHeader>
          <CardContent>
            {splitData.every(d => d.value === 0) ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No revenue data yet
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <ResponsiveContainer width={160} height={160}>
                  <PieChart>
                    <Pie data={splitData} cx="50%" cy="50%" innerRadius={45} outerRadius={70} dataKey="value" paddingAngle={3}>
                      {splitData.map((entry, i) => (
                        <Cell key={i} fill={entry.color} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(v: number) => fmt(v)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="space-y-2 flex-1">
                  {splitData.map((d) => (
                    <div key={d.name} className="flex items-center justify-between text-sm">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full" style={{ background: d.color }} />
                        <span className="text-muted-foreground">{d.name}</span>
                      </div>
                      <span className="font-medium">{fmt(d.value)}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* EBITDA Waterfall */}
        <Card className="bg-card border-border">
          <CardHeader className="pb-2">
            <CardTitle className="text-base font-semibold">EBITDA Waterfall</CardTitle>
          </CardHeader>
          <CardContent>
            {ebitdaData.every(d => d.value === 0) ? (
              <div className="flex items-center justify-center h-40 text-muted-foreground text-sm">
                No data yet
              </div>
            ) : (
              <ResponsiveContainer width="100%" height={180}>
                <BarChart data={ebitdaData} margin={{ top: 5, right: 10, left: 0, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="name" tick={{ fontSize: 11 }} />
                  <YAxis tickFormatter={(v) => fmt(v)} tick={{ fontSize: 11 }} />
                  <Tooltip formatter={(v: number) => fmt(v)} contentStyle={{ background: "hsl(var(--card))", border: "1px solid hsl(var(--border))" }} />
                  <Bar dataKey="value" radius={[4, 4, 0, 0]}>
                    {ebitdaData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Summary Table */}
      <Card className="bg-card border-border">
        <CardHeader className="pb-2">
          <CardTitle className="text-base font-semibold">Period Summary</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto"><table className="w-full text-sm">
            <tbody className="divide-y divide-border">
              {[
                { label: "Total Transaction Volume", value: fmt(koboToNaira(totals?.amountKobo ?? 0)) },
                { label: "Gross Fee Revenue", value: fmt(koboToNaira(totals?.grossFeeKobo ?? 0)) },
                { label: "Platform Revenue (pre-overhead)", value: fmt(koboToNaira(totals?.platformRevenueKobo ?? 0)) },
                { label: "Reseller Revenue", value: fmt(koboToNaira(totals?.resellerRevenueKobo ?? 0)) },
                { label: "Interchange / NIBSS Cost", value: fmt(koboToNaira(totals?.interchangeCostKobo ?? 0)) },
                { label: "Net Platform Revenue", value: fmt(koboToNaira(totals?.netPlatformKobo ?? 0)) },
                { label: "Total Overhead", value: fmt(koboToNaira(totals?.overheadKobo ?? 0)) },
                {
                  label: "EBITDA",
                  value: fmt(koboToNaira(totals?.ebitdaKobo ?? 0)),
                  badge: (totals?.ebitdaKobo ?? 0) >= 0 ? "positive" : "negative",
                },
                { label: "EBITDA Margin", value: pct(totals?.ebitdaMarginPct ?? 0) },
              ].map(({ label, value, badge }) => (
                <tr key={label} className="hover:bg-muted/30">
                  <td className="py-2 text-muted-foreground">{label}</td>
                  <td className="py-2 text-right font-medium">
                    {badge ? (
                      <Badge variant={badge === "positive" ? "default" : "destructive"} className="text-xs">
                        {value}
                      </Badge>
                    ) : (
                      value
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </CardContent>
      </Card>
    </div>
  );
}
