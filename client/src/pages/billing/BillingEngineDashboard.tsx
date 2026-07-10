/**
 * BillingEngineDashboard.tsx — Wave 229
 *
 * Billing Engine Analytics Dashboard:
 *  - Revenue KPIs with period-over-period comparison
 *  - Invoice aging chart (stacked bar by bucket)
 *  - Invoice creation + payment trend (line chart)
 *  - Subscription health metrics (donut + stats)
 *  - Top merchants by billed amount
 *  - Failed subscription payments log
 *
 * Route: /billing-engine/dashboard
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import {
  TrendingUp,
  TrendingDown,
  Minus,
  RefreshCw,
  AlertCircle,
  DollarSign,
  FileText,
  Users,
  Activity,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  BarChart3,
  Receipt,
} from "lucide-react";
import {
  BarChart,
  Bar,
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtKobo(k: number) {
  const n = k / 100;
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toFixed(0)}`;
}

function pctLabel(v: number) {
  const sign = v > 0 ? "+" : "";
  return `${sign}${v.toFixed(1)}%`;
}

function TrendBadge({ pct }: { pct: number }) {
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-green-600 text-xs font-medium">
      <TrendingUp className="w-3 h-3" /> {pctLabel(pct)}
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-red-600 text-xs font-medium">
      <TrendingDown className="w-3 h-3" /> {pctLabel(pct)}
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-muted-foreground text-xs">
      <Minus className="w-3 h-3" /> 0%
    </span>
  );
}

// ─── KPI Card ─────────────────────────────────────────────────────────────────

function KpiCard({
  title,
  value,
  sub,
  pct,
  icon: Icon,
  iconColor,
}: {
  title: string;
  value: string;
  sub?: string;
  pct?: number;
  icon: React.ElementType;
  iconColor: string;
}) {
  return (
    <Card>
      <CardContent className="pt-5 pb-4">
        <div className="flex items-start justify-between">
          <div>
            <p className="text-xs text-muted-foreground font-medium uppercase tracking-wide">{title}</p>
            <p className="text-2xl font-bold mt-1 tabular-nums">{value}</p>
            {sub && <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>}
          </div>
          <div className={`p-2 rounded-lg ${iconColor}`}>
            <Icon className="w-5 h-5" />
          </div>
        </div>
        {pct !== undefined && (
          <div className="mt-2">
            <TrendBadge pct={pct} />
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Aging Chart ──────────────────────────────────────────────────────────────

const AGING_COLORS = ["#22c55e", "#f59e0b", "#f97316", "#ef4444", "#991b1b"];

function InvoiceAgingChart({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = trpc.billingAnalyticsV2.getInvoiceAging.useQuery(
    {},
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading aging data…
      </div>
    );
  }

  if (!data || data.totalUnpaidCount === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <CheckCircle2 className="w-8 h-8 mb-2 text-green-500 opacity-70" />
        <p className="text-sm">No outstanding invoices. All caught up!</p>
      </div>
    );
  }

  const chartData = data.buckets.map((b) => ({
    label: b.label,
    count: b.count,
    totalKobo: b.totalKobo,
  }));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="flex items-center gap-4 flex-wrap text-sm">
        <span className="text-muted-foreground">
          {data.totalUnpaidCount} unpaid invoices
        </span>
        <span className="font-semibold text-red-700">
          {fmtKobo(data.totalOutstandingKobo)} outstanding
        </span>
      </div>

      {/* Stacked bar chart */}
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={chartData} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
          <XAxis dataKey="label" tick={{ fontSize: 11 }} />
          <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKobo(v)} width={70} />
          <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={35} />
          <Tooltip
            formatter={(v: number, name: string) =>
              name === "totalKobo" ? [fmtKobo(v), "Amount"] : [v, "Invoices"]
            }
          />
          <Legend />
          <Bar yAxisId="left" dataKey="totalKobo" name="Amount" radius={[3, 3, 0, 0]}>
            {chartData.map((_, i) => (
              <Cell key={i} fill={AGING_COLORS[i % AGING_COLORS.length]} />
            ))}
          </Bar>
          <Bar yAxisId="right" dataKey="count" name="Count" fill="#94a3b8" radius={[3, 3, 0, 0]} opacity={0.6} />
        </BarChart>
      </ResponsiveContainer>

      {/* Bucket table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="border-b text-xs text-muted-foreground">
              <th className="text-left py-2 pr-4">Bucket</th>
              <th className="text-right py-2 pr-4">Count</th>
              <th className="text-right py-2 pr-4">Amount</th>
              <th className="text-right py-2">% of Total</th>
            </tr>
          </thead>
          <tbody>
            {data.buckets.map((b, i) => (
              <tr key={b.key} className="border-b last:border-0 hover:bg-muted/30">
                <td className="py-2 pr-4">
                  <span className="flex items-center gap-2">
                    <span
                      className="w-2.5 h-2.5 rounded-full inline-block"
                      style={{ backgroundColor: AGING_COLORS[i] }}
                    />
                    {b.label}
                  </span>
                </td>
                <td className="py-2 pr-4 text-right tabular-nums">{b.count}</td>
                <td className="py-2 pr-4 text-right tabular-nums font-medium">{fmtKobo(b.totalKobo)}</td>
                <td className="py-2 text-right text-muted-foreground">
                  {data.totalOutstandingKobo > 0
                    ? `${((b.totalKobo / data.totalOutstandingKobo) * 100).toFixed(1)}%`
                    : "—"}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// ─── Subscription Health ──────────────────────────────────────────────────────

const STATUS_COLORS: Record<string, string> = {
  active: "#22c55e",
  paused: "#f59e0b",
  failed: "#ef4444",
  cancelled: "#94a3b8",
  completed: "#3b82f6",
};

function SubscriptionHealthPanel({ tenantId }: { tenantId: string }) {
  const { data, isLoading } = trpc.billingAnalyticsV2.getSubscriptionHealth.useQuery(
    {},
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading subscription data…
      </div>
    );
  }

  if (!data) return null;

  const pieData = Object.entries(data.summary)
    .filter(([k]) => k !== "total")
    .map(([status, count]) => ({ name: status, value: count as number }));

  return (
    <div className="space-y-5">
      {/* Stats row */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        {[
          { label: "Active", value: data.summary.active, color: "text-green-700 bg-green-50 border-green-200" },
          { label: "MRR", value: fmtKobo(data.mrrKobo), color: "text-blue-700 bg-blue-50 border-blue-200" },
          { label: "Failed", value: data.summary.failed, color: "text-red-700 bg-red-50 border-red-200" },
          { label: "Paused", value: data.summary.paused, color: "text-amber-700 bg-amber-50 border-amber-200" },
          { label: "Churn Rate", value: `${data.churnRate.toFixed(1)}%`, color: "text-orange-700 bg-orange-50 border-orange-200" },
          { label: "Failure Rate", value: `${data.failureRate.toFixed(1)}%`, color: "text-rose-700 bg-rose-50 border-rose-200" },
        ].map(({ label, value, color }) => (
          <div key={label} className={`border rounded-lg p-3 ${color}`}>
            <p className="text-xs font-medium opacity-70">{label}</p>
            <p className="text-xl font-bold mt-0.5 tabular-nums">{value}</p>
          </div>
        ))}
      </div>

      {/* Donut chart */}
      {data.summary.total > 0 && (
        <div className="flex items-center gap-6">
          <ResponsiveContainer width={160} height={160}>
            <PieChart>
              <Pie
                data={pieData}
                cx="50%"
                cy="50%"
                innerRadius={45}
                outerRadius={70}
                dataKey="value"
                paddingAngle={2}
              >
                {pieData.map((entry) => (
                  <Cell key={entry.name} fill={STATUS_COLORS[entry.name] ?? "#94a3b8"} />
                ))}
              </Pie>
              <Tooltip formatter={(v: number, name: string) => [v, name]} />
            </PieChart>
          </ResponsiveContainer>
          <div className="space-y-1.5">
            {pieData.map((entry) => (
              <div key={entry.name} className="flex items-center gap-2 text-sm">
                <span
                  className="w-3 h-3 rounded-full"
                  style={{ backgroundColor: STATUS_COLORS[entry.name] ?? "#94a3b8" }}
                />
                <span className="capitalize text-muted-foreground">{entry.name}</span>
                <span className="font-semibold ml-auto pl-4">{entry.value}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent failures */}
      {data.recentFailures.length > 0 && (
        <div>
          <p className="text-sm font-semibold mb-2 flex items-center gap-1.5">
            <AlertTriangle className="w-4 h-4 text-red-500" /> Recent Failures (7 days)
          </p>
          <div className="space-y-2">
            {data.recentFailures.slice(0, 5).map((f: any) => (
              <div key={f.id} className="flex items-start justify-between p-3 border rounded-lg text-sm">
                <div>
                  <p className="font-medium">{f.planName}</p>
                  <p className="text-xs text-muted-foreground">{f.customerEmail ?? f.merchantId}</p>
                  {f.failureReason && (
                    <p className="text-xs text-red-600 mt-0.5">{f.failureReason}</p>
                  )}
                </div>
                <div className="text-right">
                  <p className="font-semibold">{fmtKobo(f.amountKobo)}</p>
                  <p className="text-xs text-muted-foreground capitalize">{f.interval}</p>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Invoice Trend ────────────────────────────────────────────────────────────

function InvoiceTrendChart({ days }: { days: number }) {
  const { data, isLoading } = trpc.billingAnalyticsV2.getInvoiceTrend.useQuery(
    { days },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading trend…
      </div>
    );
  }

  if (!data || data.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <FileText className="w-8 h-8 mb-2 opacity-30" />
        <p className="text-sm">No invoice data in this period.</p>
      </div>
    );
  }

  return (
    <ResponsiveContainer width="100%" height={220}>
      <LineChart data={data} margin={{ top: 4, right: 8, left: 0, bottom: 4 }}>
        <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
        <XAxis
          dataKey="day"
          tick={{ fontSize: 10 }}
          tickFormatter={(v) => v.slice(5)}
        />
        <YAxis yAxisId="left" tick={{ fontSize: 10 }} tickFormatter={(v) => fmtKobo(v)} width={70} />
        <YAxis yAxisId="right" orientation="right" tick={{ fontSize: 10 }} width={30} />
        <Tooltip
          formatter={(v: number, name: string) => {
            if (name === "paidKobo") return [fmtKobo(v), "Paid Amount"];
            if (name === "totalKobo") return [fmtKobo(v), "Total Billed"];
            if (name === "created") return [v, "Created"];
            if (name === "paid") return [v, "Paid"];
            return [v, name];
          }}
          labelFormatter={(l) => `Date: ${l}`}
        />
        <Legend />
        <Line yAxisId="left" type="monotone" dataKey="totalKobo" name="Total Billed" stroke="#3b82f6" dot={false} strokeWidth={2} />
        <Line yAxisId="left" type="monotone" dataKey="paidKobo" name="Paid Amount" stroke="#22c55e" dot={false} strokeWidth={2} />
        <Line yAxisId="right" type="monotone" dataKey="created" name="Created" stroke="#f59e0b" dot={false} strokeWidth={1.5} strokeDasharray="4 2" />
      </LineChart>
    </ResponsiveContainer>
  );
}

// ─── Top Merchants ────────────────────────────────────────────────────────────

function TopMerchantsTable({ days }: { days: number }) {
  const { data, isLoading } = trpc.billingAnalyticsV2.getTopMerchants.useQuery(
    { days, limit: 10 },
    { staleTime: 60_000 },
  );

  if (isLoading) {
    return <p className="text-sm text-muted-foreground py-4">Loading…</p>;
  }

  if (!data || data.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        <Users className="w-8 h-8 mx-auto mb-2 opacity-30" />
        <p className="text-sm">No merchant billing data in this period.</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm border-collapse">
        <thead>
          <tr className="border-b text-xs text-muted-foreground">
            <th className="text-left py-2 pr-3">#</th>
            <th className="text-left py-2 pr-3">Merchant</th>
            <th className="text-right py-2 pr-3">Invoices</th>
            <th className="text-right py-2 pr-3">Total Billed</th>
            <th className="text-right py-2 pr-3">Paid</th>
            <th className="text-right py-2">Collection Rate</th>
          </tr>
        </thead>
        <tbody>
          {data.map((m: any, i: number) => (
            <tr key={m.merchantId} className="border-b last:border-0 hover:bg-muted/30">
              <td className="py-2 pr-3 text-muted-foreground">{i + 1}</td>
              <td className="py-2 pr-3 font-medium max-w-[140px] truncate">{m.merchantId}</td>
              <td className="py-2 pr-3 text-right tabular-nums">{m.invoiceCount}</td>
              <td className="py-2 pr-3 text-right tabular-nums font-semibold">{fmtKobo(m.totalKobo)}</td>
              <td className="py-2 pr-3 text-right tabular-nums text-green-700">{fmtKobo(m.paidKobo)}</td>
              <td className="py-2 text-right">
                <Badge
                  variant="outline"
                  className={
                    m.collectionRate >= 80
                      ? "text-green-700 border-green-300 bg-green-50 text-xs"
                      : m.collectionRate >= 50
                      ? "text-amber-700 border-amber-300 bg-amber-50 text-xs"
                      : "text-red-700 border-red-300 bg-red-50 text-xs"
                  }
                >
                  {m.collectionRate.toFixed(1)}%
                </Badge>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function BillingEngineDashboard() {
  const { user } = useAuth();
  const [days, setDays] = useState(30);
  const [activeTab, setActiveTab] = useState<"overview" | "aging" | "subscriptions" | "merchants">("overview");

  // Use tenant from user context; fall back to "platform"
  const tenantId = (user as any)?.tenantId ?? "platform";

  const { data: kpis, isLoading: kpisLoading, refetch } = trpc.billingAnalyticsV2.getRevenueKpis.useQuery(
    { tenantId, days },
    { staleTime: 60_000 },
  );

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <BarChart3 className="w-6 h-6 text-indigo-600" /> Billing Engine Analytics
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Invoice aging, subscription health, and revenue analytics
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Select value={String(days)} onValueChange={(v) => setDays(Number(v))}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">Last 7 days</SelectItem>
              <SelectItem value="14">Last 14 days</SelectItem>
              <SelectItem value="30">Last 30 days</SelectItem>
              <SelectItem value="60">Last 60 days</SelectItem>
              <SelectItem value="90">Last 90 days</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-4">
        {kpisLoading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-5 pb-4 space-y-2">
                <div className="h-3 bg-muted rounded w-2/3" />
                <div className="h-7 bg-muted rounded w-1/2" />
              </CardContent>
            </Card>
          ))
        ) : kpis ? (
          <>
            <KpiCard
              title="Transactions"
              value={kpis.current.txCount.toLocaleString()}
              pct={kpis.changes.txCount}
              icon={Activity}
              iconColor="bg-blue-100 text-blue-700"
            />
            <KpiCard
              title="Gross Fees"
              value={fmtKobo(kpis.current.grossFeeKobo)}
              pct={kpis.changes.grossFeeKobo}
              icon={DollarSign}
              iconColor="bg-green-100 text-green-700"
            />
            <KpiCard
              title="Platform Revenue"
              value={fmtKobo(kpis.current.platformRevenueKobo)}
              pct={kpis.changes.platformRevenueKobo}
              icon={TrendingUp}
              iconColor="bg-indigo-100 text-indigo-700"
            />
            <KpiCard
              title="Net Revenue"
              value={fmtKobo(kpis.current.netPlatformKobo)}
              pct={kpis.changes.netPlatformKobo}
              icon={Receipt}
              iconColor="bg-purple-100 text-purple-700"
            />
            <KpiCard
              title="Total Volume"
              value={fmtKobo(kpis.current.amountKobo)}
              pct={kpis.changes.amountKobo}
              icon={BarChart3}
              iconColor="bg-amber-100 text-amber-700"
            />
          </>
        ) : null}
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {(["overview", "aging", "subscriptions", "merchants"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-indigo-600 text-indigo-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "overview" && <Activity className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "aging" && <Clock className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "subscriptions" && <Users className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "merchants" && <FileText className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "overview" ? "Revenue Trend" : tab === "aging" ? "Invoice Aging" : tab === "subscriptions" ? "Subscriptions" : "Top Merchants"}
          </button>
        ))}
      </div>

      {/* ── Tab: Revenue Trend ── */}
      {activeTab === "overview" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Activity className="w-4 h-4 text-blue-600" /> Invoice Creation &amp; Payment Trend
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceTrendChart days={days} />
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Invoice Aging ── */}
      {activeTab === "aging" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4 text-amber-600" /> Invoice Aging Report
            </CardTitle>
          </CardHeader>
          <CardContent>
            <InvoiceAgingChart tenantId={tenantId} />
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Subscriptions ── */}
      {activeTab === "subscriptions" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Users className="w-4 h-4 text-green-600" /> Subscription Health
            </CardTitle>
          </CardHeader>
          <CardContent>
            <SubscriptionHealthPanel tenantId={tenantId} />
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Top Merchants ── */}
      {activeTab === "merchants" && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <FileText className="w-4 h-4 text-purple-600" /> Top Merchants by Billed Amount
            </CardTitle>
          </CardHeader>
          <CardContent>
            <TopMerchantsTable days={days} />
          </CardContent>
        </Card>
      )}
    </div>
  );
}
