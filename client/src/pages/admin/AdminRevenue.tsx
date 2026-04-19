import { useState } from "react";
import AdminLayout from "@/components/AdminLayout";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Skeleton } from "@/components/ui/skeleton";
import { Button } from "@/components/ui/button";
import { TrendingUp, DollarSign, Activity, CheckCircle, Download, Loader2 } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";
import { toast } from "sonner";

export default function AdminRevenue() {
  const [period, setPeriod] = useState<"day" | "week" | "month" | "year">("month");
  const [exporting, setExporting] = useState(false);

  const summaryQuery = trpc.admin.revenue.getSummary.useQuery({ period });
  const feeTierQuery = trpc.admin.revenue.getFeeTierConfig.useQuery();
  const merchantRevenueQuery = trpc.admin.revenue.getRevenueByMerchant.useQuery({
    limit: 20,
    period: period === "day" || period === "week" ? "month" : period,
  });

  const fmt = (k: number) => (k / 100).toLocaleString("en-NG", { style: "currency", currency: "NGN" });
  const s = summaryQuery.data as any;

  const handleExportCsv = async () => {
    setExporting(true);
    try {
      // Build CSV from current data in memory (no extra round-trip needed)
      const merchants = (merchantRevenueQuery.data as any[] ?? []);
      const tiers = (((feeTierQuery.data as unknown as any)?.tiers ?? []) as any[]);

      const lines: string[] = [];
      lines.push(`PayGate Revenue Export — Period: ${period} — Generated: ${new Date().toISOString()}`);
      lines.push("");

      // Summary section
      lines.push("SUMMARY");
      lines.push("Metric,Value");
      if (s) {
        lines.push(`Total Volume,${(s.totalVolume ?? 0) / 100}`);
        lines.push(`Total Fees,${(s.totalFees ?? 0) / 100}`);
        lines.push(`Transaction Count,${s.txCount ?? 0}`);
        lines.push(`Successful Transactions,${s.successCount ?? 0}`);
        lines.push(`Average Transaction Size,${(s.avgTxSize ?? 0) / 100}`);
      }
      lines.push("");

      // Fee tiers section
      lines.push("FEE TIER CONFIGURATION");
      lines.push("Tier,Fee %,Flat Fee (NGN),Min Tx (NGN),Max Tx (NGN)");
      tiers.forEach(t => {
        lines.push([
          t.tier,
          t.feePercent,
          (t.flatFeeKobo ?? 0) / 100,
          (t.minTxKobo ?? 0) / 100,
          t.maxTxKobo ? (t.maxTxKobo / 100) : "Unlimited",
        ].join(","));
      });
      lines.push("");

      // Merchant revenue section
      lines.push("TOP MERCHANTS BY REVENUE");
      lines.push("Merchant,Volume (NGN),Fees (NGN)");
      merchants.forEach(m => {
        lines.push([
          `"${m.businessName ?? m.merchantId}"`,
          (m.volume ?? 0) / 100,
          (m.fees ?? 0) / 100,
        ].join(","));
      });

      const csvContent = lines.join("\n");
      const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `paygate-revenue-${period}-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
      toast.success("Revenue data exported successfully");
    } catch (e: any) {
      toast.error(e.message ?? "Export failed");
    } finally {
      setExporting(false);
    }
  };

  return (
    <AdminLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-start justify-between">
          <div>
            <h1 className="text-2xl font-bold text-white">Revenue & Fee Management</h1>
            <p className="text-slate-400 text-sm mt-1">Platform revenue analytics and fee configuration</p>
          </div>
          <Button
            variant="outline"
            size="sm"
            className="gap-2 border-slate-700 text-slate-300 hover:bg-slate-800 bg-transparent"
            onClick={handleExportCsv}
            disabled={exporting || summaryQuery.isLoading}
          >
            {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <Download className="w-4 h-4" />}
            Export CSV
          </Button>
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
                <CardHeader>
                  <CardTitle className="text-white text-base flex items-center justify-between">
                    Top Merchants by Revenue
                    <span className="text-xs text-slate-500 font-normal">
                      {(merchantRevenueQuery.data as any[] ?? []).length} merchants
                    </span>
                  </CardTitle>
                </CardHeader>
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
                      ) : (merchantRevenueQuery.data as any[] ?? []).length === 0 ? (
                        <TableRow>
                          <TableCell colSpan={3} className="text-center text-slate-500 py-8">
                            <BridgeEmptyState message="No merchant revenue data for this period" />
                          </TableCell>
                        </TableRow>
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
