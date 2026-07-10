import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { RefreshCw, TrendingUp, DollarSign, BarChart3, PieChart, ArrowUpRight, ArrowDownRight } from "lucide-react";

type Period = "7d" | "30d" | "90d" | "1y";

export default function RevenueAnalytics() {
  const [period, setPeriod] = useState<Period>("30d");

  const { data: summary, refetch, isLoading } = trpc.wave223.revenueAnalytics.getSummary.useQuery({ period });
  const { data: breakdown } = trpc.wave223.revenueAnalytics.getBreakdown.useQuery({ period });
  const { data: topMerchants } = trpc.wave223.revenueAnalytics.getTopMerchants.useQuery({ period, limit: 10 });

  const fmt = (n: number | null | undefined, currency = "NGN") =>
    new Intl.NumberFormat("en-NG", { style: "currency", currency, maximumFractionDigits: 0 }).format(n ?? 0);

  const pctChange = (current: number, previous: number) => {
    if (!previous) return null;
    return ((current - previous) / previous) * 100;
  };

  return (
    <div className="p-6 max-w-7xl mx-auto space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2"><BarChart3 className="h-6 w-6 text-violet-500" /> Revenue Analytics</h1>
          <p className="text-muted-foreground text-sm mt-1">Platform revenue, fee income, and merchant performance metrics</p>
        </div>
        <div className="flex gap-2">
          <Select value={period} onValueChange={(v) => setPeriod(v as Period)}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="7d">Last 7 days</SelectItem>
              <SelectItem value="30d">Last 30 days</SelectItem>
              <SelectItem value="90d">Last 90 days</SelectItem>
              <SelectItem value="1y">Last 12 months</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="h-4 w-4" /></Button>
        </div>
      </div>

      {/* KPI cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Revenue", value: summary?.totalRevenue, prev: summary?.prevTotalRevenue, icon: DollarSign, color: "text-green-500" },
          { label: "Transaction Volume", value: summary?.transactionVolume, prev: summary?.prevTransactionVolume, icon: TrendingUp, color: "text-blue-500" },
          { label: "Fee Income", value: summary?.feeIncome, prev: summary?.prevFeeIncome, icon: BarChart3, color: "text-violet-500" },
          { label: "FX Spread Income", value: summary?.fxSpreadIncome, prev: summary?.prevFxSpreadIncome, icon: PieChart, color: "text-teal-500" },
        ].map((kpi) => {
          const change = pctChange(kpi.value ?? 0, kpi.prev ?? 0);
          const isPositive = (change ?? 0) >= 0;
          return (
            <Card key={kpi.label} className="border-0 bg-muted/40">
              <CardContent className="p-4">
                <div className="flex items-center justify-between mb-2">
                  <kpi.icon className={`h-5 w-5 ${kpi.color}`} />
                  {change !== null && (
                    <div className={`flex items-center text-xs font-medium ${isPositive ? "text-green-500" : "text-red-500"}`}>
                      {isPositive ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}
                      {Math.abs(change).toFixed(1)}%
                    </div>
                  )}
                </div>
                <p className="text-2xl font-bold">{isLoading ? "—" : fmt(kpi.value)}</p>
                <p className="text-xs text-muted-foreground mt-1">{kpi.label}</p>
              </CardContent>
            </Card>
          );
        })}
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Revenue by channel */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Revenue by Channel</CardTitle>
            <CardDescription>Fee income breakdown by payment channel</CardDescription>
          </CardHeader>
          <CardContent>
            {!breakdown?.byChannel?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No data available for this period.</p>
            ) : (
              <div className="space-y-3">
                {breakdown.byChannel.map((ch) => {
                  const pct = breakdown.totalFees > 0 ? (ch.fees / breakdown.totalFees) * 100 : 0;
                  return (
                    <div key={ch.channel} className="space-y-1">
                      <div className="flex items-center justify-between text-sm">
                        <span className="capitalize">{ch.channel.replace(/_/g, ' ')}</span>
                        <div className="flex items-center gap-2">
                          <span className="text-muted-foreground">{pct.toFixed(1)}%</span>
                          <span className="font-medium">{fmt(ch.fees)}</span>
                        </div>
                      </div>
                      <div className="h-2 bg-muted rounded-full overflow-hidden">
                        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Top merchants */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Top Merchants by Volume</CardTitle>
            <CardDescription>Highest transaction volume contributors</CardDescription>
          </CardHeader>
          <CardContent>
            {!topMerchants?.length ? (
              <p className="text-sm text-muted-foreground text-center py-6">No merchant data available.</p>
            ) : (
              <div className="space-y-3">
                {topMerchants.map((m, idx) => (
                  <div key={m.merchantId} className="flex items-center gap-3">
                    <span className="text-sm font-bold text-muted-foreground w-5">{idx + 1}</span>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium truncate">{m.merchantName ?? m.merchantId}</p>
                      <p className="text-xs text-muted-foreground">{m.transactionCount?.toLocaleString()} transactions</p>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-medium">{fmt(m.volume)}</p>
                      <p className="text-xs text-muted-foreground">{fmt(m.fees)} fees</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Revenue trend */}
      <Card>
        <CardHeader>
          <CardTitle className="text-base">Revenue Trend</CardTitle>
          <CardDescription>Daily revenue for the selected period</CardDescription>
        </CardHeader>
        <CardContent>
          {!breakdown?.daily?.length ? (
            <p className="text-sm text-muted-foreground text-center py-8">No trend data available.</p>
          ) : (
            <div className="flex items-end gap-1 h-32">
              {breakdown.daily.map((d) => {
                const max = Math.max(...breakdown.daily.map((x) => x.revenue));
                const pct = max > 0 ? (d.revenue / max) * 100 : 0;
                return (
                  <div key={d.date} className="flex-1 flex flex-col items-center gap-1 group relative">
                    <div
                      className="w-full bg-primary/80 rounded-t transition-all group-hover:bg-primary"
                      style={{ height: `${Math.max(pct, 2)}%` }}
                    />
                    <div className="absolute bottom-full mb-1 hidden group-hover:block bg-popover text-popover-foreground text-xs p-1.5 rounded shadow-md whitespace-nowrap z-10">
                      {d.date}: {fmt(d.revenue)}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
