import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { TrendingUp, DollarSign, Activity, CheckCircle } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function AdminRevenue() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const summaryQuery = trpc.admin.revenue.getSummary.useQuery({ period });
  const feeTierQuery = trpc.admin.revenue.getFeeTierConfig.useQuery();
  const merchantRevenueQuery = trpc.admin.revenue.getRevenueByMerchant.useQuery({ limit: 20, period: period === "day" || period === "week" ? "month" : period });

  const fmt = (k: number) => (k / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });
  const s = summaryQuery.data as any;

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div>
          <h1 className="text-2xl font-bold text-white">Revenue & Fee Management</h1>
          <p className="text-slate-400 text-sm mt-1">Platform revenue analytics and fee configuration</p>
        </div>
        <Tabs value={period} onValueChange={(v: any) => setPeriod(v as any)}>
          <TabsList className="bg-slate-800 border-slate-700">
            <TabsTrigger value="day" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Today</TabsTrigger>
            <TabsTrigger value="week" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Week</TabsTrigger>
            <TabsTrigger value="month" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Month</TabsTrigger>
            <TabsTrigger value="year" className="data-[state=active]:bg-red-600 data-[state=active]:text-white text-slate-400">Year</TabsTrigger>
          </TabsList>
          <TabsContent value={period} className="mt-4 space-y-6">
            <div className="grid grid-cols-2 lg:grid-cols-5 gap-4">
              {summaryQuery.isLoading ? Array.from({ length: 5 }).map((_, i) => (
                <Card key={i} className="bg-slate-900 border-slate-800"><CardContent className="p-4"><Skeleton className="h-12 w-full bg-slate-800" /></CardContent></Card>
              )) : s && [
                { label: "Total Volume", value: fmt(s.totalVolume ?? 0), icon: DollarSign, color: "text-blue-400" },
                { label: "Total Fees", value: fmt(s.totalFees ?? 0), icon: TrendingUp, color: "text-green-400" },
                { label: "Transactions", value: (s.txCount ?? 0).toLocaleString(), icon: Activity, color: "text-purple-400" },
                { label: "Successful", value: (s.successCount ?? 0).toLocaleString(), icon: CheckCircle, color: "text-emerald-400" },
                { label: "Avg Tx Size", value: fmt(s.avgTxSize ?? 0), icon: TrendingUp, color: "text-cyan-400" },
              ].map((kpi) => (
                <Card key={kpi.label} className="bg-slate-900 border-slate-800">
                  <CardContent className="p-4">
                    <div className="flex items-center gap-2 mb-1">
                      <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
                      <p className="text-xs text-slate-400">{kpi.label}</p>
                    </div>
                    <p className="text-base font-bold text-white">{kpi.value}</p>
                  </CardContent>
                </Card>
              ))}
            </div>
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-white text-base">Fee Tier Configuration</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Tier</TableHead>
                        <TableHead className="text-slate-400">Fee %</TableHead>
                        <TableHead className="text-slate-400">Flat Fee</TableHead>
                        <TableHead className="text-slate-400">Min Tx</TableHead>
                        <TableHead className="text-slate-400">Max Tx</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {feeTierQuery.isLoading ? (
                        Array.from({ length: 3 }).map((_, i) => <TableRow key={i}><TableCell colSpan={5}><Skeleton className="h-8 w-full bg-slate-800" /></TableCell></TableRow>)
                      ) : (((feeTierQuery.data as unknown as any)?.tiers ?? []) as any[]).map((t: any) => (
                        <TableRow key={t.tier} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-white capitalize font-medium">{t.tier}</TableCell>
                          <TableCell className="text-slate-300">{t.feePercent}%</TableCell>
                          <TableCell className="text-slate-300">{fmt(t.flatFeeKobo ?? 0)}</TableCell>
                          <TableCell className="text-slate-400">{fmt(t.minTxKobo ?? 0)}</TableCell>
                          <TableCell className="text-slate-400">{t.maxTxKobo ? fmt(t.maxTxKobo) : "Unlimited"}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
              <Card className="bg-slate-900 border-slate-800">
                <CardHeader><CardTitle className="text-white text-base">Top Merchants by Revenue</CardTitle></CardHeader>
                <CardContent className="p-0">
                  <Table>
                    <TableHeader>
                      <TableRow className="border-slate-800 hover:bg-transparent">
                        <TableHead className="text-slate-400">Merchant</TableHead>
                        <TableHead className="text-slate-400 text-right">Volume</TableHead>
                        <TableHead className="text-slate-400 text-right">Fees</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {merchantRevenueQuery.isLoading ? (
                        Array.from({ length: 5 }).map((_, i) => <TableRow key={i}><TableCell colSpan={3}><Skeleton className="h-8 w-full bg-slate-800" /></TableCell></TableRow>)
                      ) : (merchantRevenueQuery.data as any[] ?? []).map((m: any) => (
                        <TableRow key={m.merchantId} className="border-slate-800 hover:bg-slate-800/50">
                          <TableCell className="text-slate-200 text-sm">{m.businessName}</TableCell>
                          <TableCell className="text-right text-slate-300 text-sm">{fmt(m.volume ?? 0)}</TableCell>
                          <TableCell className="text-right text-green-400 text-sm">{fmt(m.fees ?? 0)}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </AdminLayout>
  );
}
