import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { QrCode, Users, TrendingUp, BarChart3, Download } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function QrMerchantAnalytics() {
  const { isLoading, data: overview } = trpc.wave80.qrMerchantAnalytics.getOverview.useQuery({ period: "7d" }, { staleTime: 30_000 });
  const { data: topCodes } = trpc.wave80.qrMerchantAnalytics.getTopQrCodes.useQuery();
  const { data: insights } = trpc.wave80.qrMerchantAnalytics.getCustomerInsights.useQuery();

  const exportReport = trpc.wave80.qrMerchantAnalytics.exportReport.useMutation({
    onSuccess: () => toast.success("Report export started"),
    onError: (e: { message: string }) => toast.error(e.message),
  });

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">QR Merchant Analytics</h1><p className="text-muted-foreground">Scan performance, conversion rates, and customer insights</p></div>
        <Button variant="outline" onClick={() => exportReport.mutate({ period: "7d" })}><Download className="w-4 h-4 mr-2" />Export Report</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><QrCode className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{(overview?.totalScans ?? 0).toLocaleString()}</p><p className="text-sm text-muted-foreground">Total Scans</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Users className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{(overview?.uniqueCustomers ?? 0).toLocaleString()}</p><p className="text-sm text-muted-foreground">Unique Customers</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">&#8358;{((overview?.totalRevenue ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Revenue</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><BarChart3 className="w-8 h-8 text-orange-500" /><div><p className="text-2xl font-bold">{overview?.conversionRate ?? 0}%</p><p className="text-sm text-muted-foreground">Conversion Rate</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Top QR Codes</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">{(topCodes?.codes ?? []).map(c => (
            <div key={c.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div><p className="font-medium">{c.label}</p><p className="text-sm text-muted-foreground">{c.scans} scans</p></div>
              <p className="font-bold">&#8358;{(c.revenue / 100).toLocaleString()}</p>
            </div>
          ))}</div>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Customer Insights</CardTitle></CardHeader><CardContent>
          <div className="space-y-4">
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <p className="font-medium">New vs Returning</p>
              <div className="flex gap-2">
                <Badge variant="outline">New: {insights?.newVsReturning?.new ?? 0}%</Badge>
                <Badge>Returning: {insights?.newVsReturning?.returning ?? 0}%</Badge>
              </div>
            </div>
            <div className="flex items-center justify-between p-3 border rounded-lg">
              <p className="font-medium">Avg Session Duration</p>
              <p className="font-bold">{insights?.avgSessionDuration ?? 0}s</p>
            </div>
            <div className="p-3 border rounded-lg">
              <p className="font-medium mb-2">Top Locations</p>
              <div className="flex flex-wrap gap-2">{(insights?.topLocations ?? []).map(l => <Badge key={l} variant="secondary">{l}</Badge>)}</div>
            </div>
          </div>
        </CardContent></Card>
      </div>
    </div>
  );
}
