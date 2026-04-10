import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from "recharts";
import { TrendingUp, Users, DollarSign, Activity, AlertTriangle, ArrowUpRight } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";

export default function AdminPlatformOverview() {
  const kpiQuery = trpc.admin.overview.getKPIs.useQuery();
  const revenueQuery = trpc.admin.overview.getRevenueTimeSeries.useQuery({ days: 30 });
  const topMerchantsQuery = trpc.admin.overview.getTopMerchants.useQuery({ limit: 10 });

  const fmt = (kobo: number) =>
    (kobo / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });

  const kpis = kpiQuery.data;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Platform Overview</h1>
          <p className="text-slate-400 text-sm mt-1">Real-time platform health and performance metrics</p>
        </div>

        {/* KPI Cards */}
        <div className="grid grid-cols-2 lg:grid-cols-3 xl:grid-cols-6 gap-4">
          {kpiQuery.isLoading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Card key={i} className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <Skeleton className="h-4 w-20 mb-2 bg-slate-800" />
                  <Skeleton className="h-7 w-16 bg-slate-800" />
                </CardContent>
              </Card>
            ))
          ) : kpis ? (
            [
              { label: "Total Merchants", value: kpis.totalMerchants, icon: Users, color: "text-blue-400" },
              { label: "Active Merchants", value: kpis.activeMerchants, icon: Activity, color: "text-green-400" },
              { label: "Monthly Volume", value: fmt(kpis.monthlyVolumeKobo), icon: DollarSign, color: "text-emerald-400" },
              { label: "Transactions", value: kpis.monthlyTransactions.toLocaleString(), icon: TrendingUp, color: "text-purple-400" },
              { label: "Volume Growth", value: `${kpis.volumeGrowthPct?.toFixed(1) ?? 0}%`, icon: ArrowUpRight, color: "text-cyan-400" },
              { label: "Open Disputes", value: kpis.openDisputes, icon: AlertTriangle, color: kpis.openDisputes > 0 ? "text-amber-400" : "text-slate-400" },
            ].map((kpi) => (
              <Card key={kpi.label} className="bg-slate-900 border-slate-800">
                <CardContent className="p-4">
                  <div className="flex items-center gap-2 mb-2">
                    <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                    <p className="text-xs text-slate-400">{kpi.label}</p>
                  </div>
                  <p className="text-lg font-bold text-white">{kpi.value}</p>
                </CardContent>
              </Card>
            ))
          ) : null}
        </div>

        {/* Revenue Chart */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Revenue (Last 30 Days)</CardTitle>
          </CardHeader>
          <CardContent>
            {revenueQuery.isLoading ? (
              <Skeleton className="h-48 w-full bg-slate-800" />
            ) : revenueQuery.data && revenueQuery.data.length > 0 ? (
              <ResponsiveContainer width="100%" height={200}>
                <AreaChart data={revenueQuery.data}>
                  <defs>
                    <linearGradient id="colorFees" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#dc2626" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#dc2626" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="date" tick={{ fill: "#94a3b8", fontSize: 11 }} />
                  <YAxis tick={{ fill: "#94a3b8", fontSize: 11 }} tickFormatter={(v) => `₦${(v / 100).toLocaleString()}`} />
                  <Tooltip
                    contentStyle={{ background: "#0f172a", border: "1px solid #1e293b", borderRadius: 8 }}
                    labelStyle={{ color: "#94a3b8" }}
                    formatter={(v: number) => [fmt(v), "Fees"]}
                  />
                  <Area type="monotone" dataKey="fees" stroke="#dc2626" fill="url(#colorFees)" strokeWidth={2} />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-48 flex items-center justify-center text-slate-500 text-sm">No revenue data available</div>
            )}
          </CardContent>
        </Card>

        {/* Top Merchants */}
        <Card className="bg-slate-900 border-slate-800">
          <CardHeader>
            <CardTitle className="text-white text-base">Top Merchants by Volume</CardTitle>
          </CardHeader>
          <CardContent className="p-0">
            {topMerchantsQuery.isLoading ? (
              <div className="p-4 space-y-2">
                {Array.from({ length: 5 }).map((_, i) => (
                  <Skeleton key={i} className="h-8 w-full bg-slate-800" />
                ))}
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-slate-800 hover:bg-transparent">
                    <TableHead className="text-slate-400">Merchant</TableHead>
                    <TableHead className="text-slate-400 text-right">Volume</TableHead>
                    <TableHead className="text-slate-400 text-right">Fees</TableHead>
                    <TableHead className="text-slate-400 text-right">Transactions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(topMerchantsQuery.data ?? []).map((m: any) => (
                    <TableRow key={m.merchantId} className="border-slate-800 hover:bg-slate-800/50">
                      <TableCell className="text-slate-200 font-medium">{m.businessName}</TableCell>
                      <TableCell className="text-right text-slate-300">{fmt(m.volume ?? 0)}</TableCell>
                      <TableCell className="text-right text-green-400">{fmt(m.fees ?? 0)}</TableCell>
                      <TableCell className="text-right text-slate-400">{(m.txCount ?? 0).toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {(topMerchantsQuery.data ?? []).length === 0 && (
                    <TableRow>
                      <TableCell colSpan={4} className="text-center text-slate-500 py-8">No merchant data available</TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </AdminLayout>
  );
}
