import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { QrCode, TrendingUp, Smartphone, Target, Download } from "lucide-react";
export default function QrMerchantAnalytics() {
  const topQrCodes = [
    { name: "Main Store QR", scans: 1250, completed: 890, conversion: 71.2 },
    { name: "Product Catalog QR", scans: 680, completed: 420, conversion: 61.8 },
    { name: "Promo Campaign QR", scans: 2100, completed: 1450, conversion: 69.0 },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">QR Merchant Analytics</h1><p className="text-muted-foreground">Scan heatmaps, conversion funnels, and device breakdown</p></div>
        <Button variant="outline"><Download className="w-4 h-4 mr-2" />Export Report</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><QrCode className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">4,030</p><p className="text-sm text-muted-foreground">Total Scans (30d)</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Target className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">2,760</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">68.5%</p><p className="text-sm text-muted-foreground">Conversion Rate</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Smartphone className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">72%</p><p className="text-sm text-muted-foreground">Android Share</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Top QR Codes by Performance</CardTitle></CardHeader><CardContent>
        <div className="space-y-4">{topQrCodes.map((q,i) => (
          <div key={i} className="space-y-2">
            <div className="flex items-center justify-between"><p className="font-medium">{q.name}</p><p className="text-sm font-bold">{q.conversion}% conversion</p></div>
            <div className="flex items-center gap-4 text-sm text-muted-foreground"><span>{q.scans.toLocaleString()} scans</span><span>to</span><span>{q.completed.toLocaleString()} completed</span></div>
            <div className="w-full bg-muted rounded-full h-2"><div className="bg-primary h-2 rounded-full" style={{width:q.conversion+"%"}} /></div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
