import { useState, useMemo, useCallback, useEffect } from "react";
import {
  AreaChart, Area, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell, Legend,
} from "recharts";
import {
  TrendingUp, TrendingDown, DollarSign, ArrowUpRight, ArrowDownRight,
  Users, CreditCard, Activity, RefreshCw, Download, Calendar,
  ShieldAlert, CheckCircle2, XCircle, Clock, Zap, BarChart2,
  ArrowRight, Mail, X, ExternalLink, Copy, ChevronDown, AlertTriangle,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Calendar as CalendarPicker } from "@/components/ui/calendar";
import { Separator } from "@/components/ui/separator";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { useLocation } from "wouter";
import { format, subDays, startOfDay, endOfDay } from "date-fns";
import type { DateRange } from "react-day-picker";

// ─── Formatters ───────────────────────────────────────────────────────────────

function fmtNGN(kobo: number | string | null | undefined): string {
  const n = Number(kobo ?? 0);
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toLocaleString()}`;
}

function fmtDate(d: string | Date): string {
  try { return new Date(d).toLocaleDateString("en-NG", { month: "short", day: "numeric" }); }
  catch { return String(d); }
}

function fmtDateTime(d: string | Date): string {
  try {
    return new Date(d).toLocaleString("en-NG", {
      month: "short", day: "numeric", hour: "2-digit", minute: "2-digit",
    });
  } catch { return String(d); }
}

function fmtTime(d: string | Date): string {
  try { return new Date(d).toLocaleTimeString("en-NG", { hour: "2-digit", minute: "2-digit" }); }
  catch { return ""; }
}

function pctChange(current: number, previous: number): number {
  if (!previous) return current > 0 ? 100 : 0;
  return ((current - previous) / previous) * 100;
}

// ─── Period Presets ───────────────────────────────────────────────────────────

type PeriodKey = "7d" | "30d" | "90d" | "1y" | "custom";

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
            <div className="flex items-center justify-between mb-1">
              <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">{title}</span>
              <Icon className="w-4 h-4 text-muted-foreground" />
            </div>
            <p className="text-2xl font-bold text-foreground leading-none mb-1.5">{value}</p>
            <div className="flex items-center gap-1">
              {isUp
                ? <ArrowUpRight className="w-3 h-3 text-emerald-500" />
                : <ArrowDownRight className="w-3 h-3 text-red-500" />}
              <span className={`text-xs font-semibold ${isUp ? "text-emerald-500" : "text-red-500"}`}>
                {Math.abs(change).toFixed(1)}%
              </span>
              <span className="text-xs text-muted-foreground">vs prev period</span>
            </div>
            {subtitle && <p className="text-xs text-muted-foreground mt-1">{subtitle}</p>}
          </>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Status Badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string }) {
  const map: Record<string, string> = {
    completed: "bg-emerald-100 text-emerald-700 dark:bg-emerald-900/30 dark:text-emerald-400",
    failed: "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    pending: "bg-amber-100 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400",
    reversed: "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
  };
  return (
    <span className={`text-[10px] font-semibold px-1.5 py-0.5 rounded-full ${map[status] ?? "bg-muted text-muted-foreground"}`}>
      {status}
    </span>
  );
}

function channelLabel(ch: string): string {
  const map: Record<string, string> = {
    card: "Card", bank_transfer: "Bank Transfer", ussd: "USSD",
    qr: "QR Code", mobile_money: "Mobile Money", crypto: "Crypto",
    nfc: "NFC", pos: "POS", wallet: "Wallet",
  };
  return map[ch] ?? ch.replace(/_/g, " ").replace(/\b\w/g, c => c.toUpperCase());
}

// ─── Heatmap Cell ─────────────────────────────────────────────────────────────

function HeatmapCell({ value, max }: { value: number; max: number }) {
  const intensity = max > 0 ? value / max : 0;
  const bg = intensity === 0
    ? "bg-muted/30"
    : intensity < 0.25 ? "bg-indigo-100 dark:bg-indigo-900/30"
    : intensity < 0.5 ? "bg-indigo-300 dark:bg-indigo-700/50"
    : intensity < 0.75 ? "bg-indigo-500 dark:bg-indigo-500"
    : "bg-indigo-700 dark:bg-indigo-400";
  return (
    <div
      className={`w-4 h-4 rounded-sm ${bg} transition-colors`}
      title={`${value} tx`}
    />
  );
}

// ─── Chart Tooltip ────────────────────────────────────────────────────────────

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-lg shadow-lg p-3 text-xs">
      <p className="font-semibold text-foreground mb-1.5">{label}</p>
      {payload.map((p: any, i: number) => (
        <div key={i} className="flex items-center gap-2">
          <span className="w-2 h-2 rounded-full" style={{ background: p.color }} />
          <span className="text-muted-foreground">{p.name}:</span>
          <span className="font-semibold text-foreground">
            {p.name === "Revenue" || p.name === "Fees" ? fmtNGN(p.value) : p.value.toLocaleString()}
          </span>
        </div>
      ))}
    </div>
  );
}

// ─── Transaction Detail Modal ─────────────────────────────────────────────────

function TransactionDetailModal({ txId, open, onClose }: { txId: string | null; open: boolean; onClose: () => void }) {
  const { data: tx, isLoading } = trpc.transactions.get.useQuery(
    { id: txId ?? "" },
    { enabled: !!txId && open },
  );

  const copyToClipboard = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => toast.success(`${label} copied`));
  };

  return (
    <Dialog open={open} onOpenChange={v => !v && onClose()}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-indigo-500" />
            Transaction Detail
          </DialogTitle>
          <DialogDescription>Full details for this payment</DialogDescription>
        </DialogHeader>
        {isLoading ? (
          <div className="space-y-3 py-4">
            {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-5 w-full" />)}
          </div>
        ) : !tx ? (
          <div className="py-8 text-center text-muted-foreground">Transaction not found</div>
        ) : (
          <div className="space-y-4">
            {/* Amount + Status */}
            <div className="flex items-center justify-between p-4 bg-muted/30 rounded-lg">
              <div>
                <p className="text-2xl font-bold text-foreground">{fmtNGN(tx.amount)}</p>
                <p className="text-xs text-muted-foreground mt-0.5">{tx.currency ?? "NGN"}</p>
              </div>
              <StatusBadge status={tx.status ?? "pending"} />
            </div>
            {/* Details grid */}
            <div className="grid grid-cols-2 gap-3 text-sm">
              {[
                { label: "Transaction ID", value: tx.id, copy: true },
                { label: "Reference", value: tx.reference ?? "—", copy: !!tx.reference },
                { label: "Channel", value: channelLabel(tx.channel ?? "") },
                { label: "Customer", value: tx.customerEmail ?? (tx as any).customerId ?? "—" },
                { label: "Description", value: tx.description ?? "—" },
                { label: "Fee", value: fmtNGN(tx.feeAmount) },
                { label: "Created", value: fmtDateTime(tx.createdAt) },
                { label: "Updated", value: tx.updatedAt ? fmtDateTime(tx.updatedAt) : "—" },
              ].map(({ label, value, copy }) => (
                <div key={label} className="space-y-0.5">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <div className="flex items-center gap-1">
                    <p className="text-xs font-medium text-foreground truncate">{value}</p>
                    {copy && value !== "—" && (
                      <button
                        onClick={() => copyToClipboard(value, label)}
                        className="text-muted-foreground hover:text-foreground transition-colors flex-shrink-0"
                      >
                        <Copy className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                </div>
              ))}
            </div>
            <Separator />
            {/* Actions */}
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                className="flex-1"
                onClick={() => { onClose(); window.location.href = `/transactions`; }}
              >
                <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                View in Transactions
              </Button>
              {tx.status === "completed" && (
                <Button
                  variant="outline"
                  size="sm"
                  className="flex-1 text-amber-600 border-amber-200 hover:bg-amber-50"
                  onClick={() => {
                    onClose();
                    toast.info("Navigate to Transactions page to initiate a refund");
                  }}
                >
                  <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                  Refund
                </Button>
              )}
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ─── Date Range Picker ────────────────────────────────────────────────────────

function DateRangePicker({
  dateRange,
  onSelect,
}: {
  dateRange: DateRange | undefined;
  onSelect: (range: DateRange | undefined) => void;
}) {
  const [open, setOpen] = useState(false);

  const label = useMemo(() => {
    if (!dateRange?.from) return "Custom Range";
    if (!dateRange.to) return format(dateRange.from, "MMM d, yyyy");
    return `${format(dateRange.from, "MMM d")} – ${format(dateRange.to, "MMM d, yyyy")}`;
  }, [dateRange]);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-8 gap-1.5 text-xs">
          <Calendar className="w-3.5 h-3.5" />
          {label}
          <ChevronDown className="w-3 h-3 ml-0.5" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="end">
        <CalendarPicker
          mode="range"
          selected={dateRange}
          onSelect={onSelect}
          numberOfMonths={2}
          disabled={{ after: new Date() }}
          className="rounded-md border-0"
        />
        <div className="flex items-center justify-between p-3 border-t border-border">
          <div className="flex gap-1">
            {[7, 14, 30, 90].map(days => (
              <Button
                key={days}
                variant="ghost"
                size="sm"
                className="h-7 text-xs px-2"
                onClick={() => {
                  onSelect({ from: subDays(new Date(), days), to: new Date() });
                  setOpen(false);
                }}
              >
                {days}d
              </Button>
            ))}
          </div>
          <Button size="sm" className="h-7 text-xs" onClick={() => setOpen(false)}>
            Apply
          </Button>
        </div>
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function MerchantAnalyticsDashboard() {
  const analyticsInterval = useAdaptiveInterval(60_000);
  const [, setLocation] = useLocation();
  const [period, setPeriod] = useState<PeriodKey>("30d");
  const [customRange, setCustomRange] = useState<DateRange | undefined>();
  const [chartView, setChartView] = useState<"revenue" | "volume">("revenue");
  const [refreshKey, setRefreshKey] = useState(0);
  const [selectedTxId, setSelectedTxId] = useState<string | null>(null);
  const [txModalOpen, setTxModalOpen] = useState(false);

  // ── Date range computation ─────────────────────────────────────────────────
  const range = useMemo(() => {
    if (period === "custom" && customRange?.from) {
      return {
        from: startOfDay(customRange.from),
        to: endOfDay(customRange.to ?? customRange.from),
      };
    }
    const days = PERIODS.find(p => p.key === period)?.days ?? 30;
    return {
      from: new Date(Date.now() - days * 24 * 60 * 60 * 1000),
      to: new Date(),
    };
  }, [period, customRange, refreshKey]);

  const handleRefresh = useCallback(() => setRefreshKey(k => k + 1), []);

  const handleCustomRange = useCallback((r: DateRange | undefined) => {
    setCustomRange(r);
    if (r?.from) setPeriod("custom");
  }, []);

  // ── Data fetching ──────────────────────────────────────────────────────────
  const { data: bundle, isLoading } = trpc.merchantAnalytics.bundle.useQuery(range, {
    staleTime: 60_000,
    refetchOnWindowFocus: false,
  });

  const { data: recentFeed, isLoading: feedLoading } = trpc.merchantAnalytics.recentFeed.useQuery(
    { limit: 20 },
    { staleTime: 30_000, refetchInterval: analyticsInterval },
  );

  // ── Digest trigger ─────────────────────────────────────────────────────────
  const sendDigestMutation = trpc.merchantAnalytics.sendDigest.useMutation({
    onSuccess: () => toast.success("Weekly analytics digest sent to your email"),
    onError: (e) => toast.error(`Failed to send digest: ${e.message}`),
  });

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
    const successRate = curCount > 0 ? (curCompleted / curCount) * 100 : 0;
    const prevCompleted = Number(prev?.completedCount ?? 0);
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
    toast.success("CSV exported");
  }, [timeSeriesData, period]);

  // ── Open transaction detail ────────────────────────────────────────────────
  const openTxDetail = useCallback((id: string) => {
    setSelectedTxId(id);
    setTxModalOpen(true);
  }, []);

  // ── Fraud alert banner ─────────────────────────────────────────────────────
  const fraudStats = bundle?.fraudStats;
  const hasFraudAlerts = fraudStats && Number(fraudStats.open ?? 0) > 0;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="min-h-screen bg-background">
      {/* ── Fraud Alert Banner ── */}
      {hasFraudAlerts && (
        <div className="bg-red-50 dark:bg-red-950/30 border-b border-red-200 dark:border-red-800 px-4 py-2.5">
          <div className="max-w-screen-2xl mx-auto flex items-center gap-2 text-sm text-red-700 dark:text-red-400">
            <AlertTriangle className="w-4 h-4 flex-shrink-0" />
            <span className="font-medium">
              {fraudStats.open} open fraud alert{Number(fraudStats.open) > 1 ? "s" : ""} require attention.
            </span>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 text-xs text-red-700 hover:text-red-900 ml-1 px-2"
              onClick={() => setLocation("/fraud-risk")}
            >
              Review <ArrowRight className="w-3 h-3 ml-1" />
            </Button>
          </div>
        </div>
      )}

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
            {/* Period preset tabs */}
            <Tabs value={period === "custom" ? "custom" : period} onValueChange={v => {
              if (v !== "custom") { setPeriod(v as PeriodKey); setCustomRange(undefined); }
            }}>
              <TabsList className="h-8">
                {PERIODS.map(p => (
                  <TabsTrigger key={p.key} value={p.key} className="text-xs px-3 h-7">
                    {p.label}
                  </TabsTrigger>
                ))}
                {period === "custom" && (
                  <TabsTrigger value="custom" className="text-xs px-3 h-7">Custom</TabsTrigger>
                )}
              </TabsList>
            </Tabs>

            {/* Custom date range picker */}
            <DateRangePicker
              dateRange={customRange}
              onSelect={handleCustomRange}
            />

            <Button variant="outline" size="sm" onClick={handleRefresh} className="h-8 gap-1.5">
              <RefreshCw className="w-3.5 h-3.5" />
              Refresh
            </Button>
            <Button variant="outline" size="sm" onClick={handleExport} className="h-8 gap-1.5">
              <Download className="w-3.5 h-3.5" />
              Export
            </Button>
            <Button
              variant="outline"
              size="sm"
              className="h-8 gap-1.5"
              onClick={() => sendDigestMutation.mutate()}
              disabled={sendDigestMutation.isPending}
            >
              <Mail className="w-3.5 h-3.5" />
              {sendDigestMutation.isPending ? "Sending…" : "Email Digest"}
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
            accent="#ec4899"
          />
        </div>

        {/* ── Revenue Chart + Channel Donut ── */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-4">
          {/* Revenue / Volume area chart */}
          <Card className="xl:col-span-2 border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Revenue Trend</CardTitle>
                <CardDescription className="text-xs">Daily payment volume over selected period</CardDescription>
              </div>
              <div className="flex gap-1">
                {(["revenue", "volume"] as const).map(v => (
                  <Button
                    key={v}
                    variant={chartView === v ? "default" : "ghost"}
                    size="sm"
                    className="h-7 text-xs px-2"
                    onClick={() => setChartView(v)}
                  >
                    {v === "revenue" ? "Revenue" : "Count"}
                  </Button>
                ))}
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
                      <linearGradient id="colorRevenue" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor={COLORS.primary} stopOpacity={0.3} />
                        <stop offset="95%" stopColor={COLORS.primary} stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                    <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))"
                      tickFormatter={v => chartView === "revenue" ? fmtNGN(v) : v.toLocaleString()} />
                    <Tooltip content={<ChartTooltip />} />
                    {chartView === "revenue" ? (
                      <Area type="monotone" dataKey="revenue" name="Revenue" stroke={COLORS.primary}
                        fill="url(#colorRevenue)" strokeWidth={2} dot={false} />
                    ) : (
                      <Area type="monotone" dataKey="count" name="Transactions" stroke={COLORS.success}
                        fill="url(#colorRevenue)" strokeWidth={2} dot={false} />
                    )}
                  </AreaChart>
                </ResponsiveContainer>
              )}
            </CardContent>
          </Card>

          {/* Channel donut */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2">
              <CardTitle className="text-base">Payment Channels</CardTitle>
              <CardDescription className="text-xs">Volume distribution by channel</CardDescription>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <Skeleton className="h-48 w-full" />
              ) : channelData.length === 0 ? (
                <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data</div>
              ) : (
                <>
                  <ResponsiveContainer width="100%" height={160}>
                    <PieChart>
                      <Pie data={channelData} cx="50%" cy="50%" innerRadius={45} outerRadius={70}
                        paddingAngle={2} dataKey="value">
                        {channelData.map((c, i) => <Cell key={i} fill={c.fill} />)}
                      </Pie>
                      <Tooltip formatter={(v: any) => fmtNGN(v)} />
                    </PieChart>
                  </ResponsiveContainer>
                  <div className="space-y-1.5 mt-2">
                    {channelData.slice(0, 4).map((c, i) => (
                      <div key={i} className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-1.5">
                          <span className="w-2 h-2 rounded-full flex-shrink-0" style={{ background: c.fill }} />
                          <span className="text-muted-foreground truncate max-w-[100px]">{c.name}</span>
                        </div>
                        <span className="font-semibold text-foreground">{fmtNGN(c.value)}</span>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </CardContent>
          </Card>
        </div>

        {/* ── Daily Status Breakdown ── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Daily Transaction Status</CardTitle>
            <CardDescription className="text-xs">Completed, failed, and pending transactions by day</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-48 w-full" />
            ) : dailyData.length === 0 ? (
              <div className="h-48 flex items-center justify-center text-muted-foreground text-sm">No data for this period</div>
            ) : (
              <ResponsiveContainer width="100%" height={200}>
                <BarChart data={dailyData} margin={{ top: 5, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="date" tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <YAxis tick={{ fontSize: 11 }} stroke="hsl(var(--muted-foreground))" />
                  <Tooltip content={<ChartTooltip />} />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="completed" name="Completed" stackId="a" fill={COLORS.success} radius={[0, 0, 0, 0]} />
                  <Bar dataKey="failed" name="Failed" stackId="a" fill={COLORS.danger} />
                  <Bar dataKey="pending" name="Pending" stackId="a" fill={COLORS.warning} radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </CardContent>
        </Card>

        {/* ── Hourly Heatmap ── */}
        <Card className="border-0 shadow-sm">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">Activity Heatmap</CardTitle>
            <CardDescription className="text-xs">Transaction frequency by hour of day and day of week</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <Skeleton className="h-32 w-full" />
            ) : (
              <div className="overflow-x-auto">
                <div className="inline-block min-w-full">
                  {/* Hour labels */}
                  <div className="flex gap-0.5 mb-1 ml-10">
                    {Array.from({ length: 24 }, (_, h) => (
                      <div key={h} className="w-4 text-center text-[9px] text-muted-foreground">
                        {h % 4 === 0 ? `${h}h` : ""}
                      </div>
                    ))}
                  </div>
                  {DOW_LABELS.map((dow, d) => (
                    <div key={d} className="flex items-center gap-0.5 mb-0.5">
                      <span className="w-9 text-[10px] text-muted-foreground text-right pr-1 flex-shrink-0">{dow}</span>
                      {heatmapGrid[d].map((val, h) => (
                        <HeatmapCell key={h} value={val} max={heatmapMax} />
                      ))}
                    </div>
                  ))}
                  {/* Legend */}
                  <div className="flex items-center gap-1 mt-2 ml-10">
                    <span className="text-[10px] text-muted-foreground">Less</span>
                    {[0, 0.25, 0.5, 0.75, 1].map((v, i) => (
                      <div key={i} className={`w-3 h-3 rounded-sm ${
                        v === 0 ? "bg-muted/30"
                        : v < 0.3 ? "bg-indigo-100 dark:bg-indigo-900/30"
                        : v < 0.6 ? "bg-indigo-300 dark:bg-indigo-700/50"
                        : v < 0.8 ? "bg-indigo-500"
                        : "bg-indigo-700 dark:bg-indigo-400"
                      }`} />
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
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Top Customers</CardTitle>
                <CardDescription className="text-xs">By total spend this period</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation("/customers")}
              >
                All Customers <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {isLoading ? (
                <div className="space-y-3">
                  {[...Array(5)].map((_, i) => <Skeleton key={i} className="h-10 w-full" />)}
                </div>
              ) : (bundle?.topCustomers ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No customer data for this period</div>
              ) : (
                <div className="space-y-2">
                  {(bundle?.topCustomers ?? []).slice(0, 8).map((c: any, i: number) => {
                    const maxSpend = Number((bundle?.topCustomers ?? [])[0]?.totalSpend ?? 1);
                    const pct = maxSpend > 0 ? (Number(c.totalSpend ?? 0) / maxSpend) * 100 : 0;
                    return (
                      <div key={i} className="flex items-center gap-3">
                        <span className="text-xs font-bold text-muted-foreground w-4 flex-shrink-0">{i + 1}</span>
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center justify-between mb-0.5">
                            <span className="text-xs font-medium text-foreground truncate">
                              {c.customerEmail ?? (c as any).customerId ?? "Anonymous"}
                            </span>
                            <span className="text-xs font-bold text-foreground ml-2 flex-shrink-0">{fmtNGN(c.totalSpend)}</span>
                          </div>
                          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
                            <div className="h-full bg-indigo-500 rounded-full transition-all" style={{ width: `${pct}%` }} />
                          </div>
                          <div className="flex justify-between mt-0.5">
                            <span className="text-[10px] text-muted-foreground">{c.txCount} transactions</span>
                            <span className="text-[10px] text-muted-foreground">
                              Last: {c.lastTxAt ? fmtDate(c.lastTxAt) : "—"}
                            </span>
                          </div>
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Recent transaction feed */}
          <Card className="border-0 shadow-sm">
            <CardHeader className="pb-2 flex flex-row items-center justify-between">
              <div>
                <CardTitle className="text-base">Live Transaction Feed</CardTitle>
                <CardDescription className="text-xs">Latest 20 transactions — click for details</CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                className="h-7 text-xs gap-1"
                onClick={() => setLocation("/transactions")}
              >
                All <ArrowRight className="w-3 h-3" />
              </Button>
            </CardHeader>
            <CardContent>
              {feedLoading ? (
                <div className="space-y-2">
                  {[...Array(6)].map((_, i) => <Skeleton key={i} className="h-12 w-full" />)}
                </div>
              ) : (recentFeed ?? []).length === 0 ? (
                <div className="py-8 text-center text-muted-foreground text-sm">No recent transactions</div>
              ) : (
                <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                  {(recentFeed ?? []).map((tx: any) => (
                    <button
                      key={tx.id}
                      className="w-full flex items-center gap-3 p-2 rounded-lg hover:bg-muted/50 transition-colors text-left group"
                      onClick={() => openTxDetail(tx.id)}
                    >
                      {/* Status icon */}
                      <div className={`w-7 h-7 rounded-full flex items-center justify-center flex-shrink-0 ${
                        tx.status === "completed" ? "bg-emerald-100 dark:bg-emerald-900/30"
                        : tx.status === "failed" ? "bg-red-100 dark:bg-red-900/30"
                        : "bg-amber-100 dark:bg-amber-900/30"
                      }`}>
                        {tx.status === "completed" ? <CheckCircle2 className="w-3.5 h-3.5 text-emerald-600" />
                          : tx.status === "failed" ? <XCircle className="w-3.5 h-3.5 text-red-500" />
                          : <Clock className="w-3.5 h-3.5 text-amber-500" />}
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
                    </button>
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
                                <div className="h-full rounded-full transition-all" style={{ width: `${share}%`, background: c.fill }} />
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

        {/* ── Fraud Summary ── */}
        {fraudStats && (
          <Card className="border-0 shadow-sm border-l-4 border-l-red-400">
            <CardHeader className="pb-2">
              <CardTitle className="text-base flex items-center gap-2">
                <ShieldAlert className="w-4 h-4 text-red-500" />
                Fraud & Risk Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">{Number(fraudStats.total ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Total Alerts</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-red-500">{Number(fraudStats.open ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Open</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-amber-500">{Number(fraudStats.investigating ?? 0)}</p>
                  <p className="text-xs text-muted-foreground">Investigating</p>
                </div>
                <div className="text-center">
                  <p className="text-2xl font-bold text-foreground">
                    {(Number(fraudStats.avgRiskScore ?? 0) * 100).toFixed(0)}%
                  </p>
                  <p className="text-xs text-muted-foreground">Avg Risk Score</p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button variant="outline" size="sm" className="text-xs h-7" onClick={() => setLocation("/fraud-risk")}>
                  Manage Fraud Alerts <ArrowRight className="w-3 h-3 ml-1" />
                </Button>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* ── Transaction Detail Modal ── */}
      <TransactionDetailModal
        txId={selectedTxId}
        open={txModalOpen}
        onClose={() => { setTxModalOpen(false); setSelectedTxId(null); }}
      />
    </div>
  );
}
