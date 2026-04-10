import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Split, Clock, CheckCircle, Plus } from "lucide-react";
export default function MarketplacePay() {
  const orders = [
    { id: "o1", reference: "MKT-001", amount: 250000, splits: 3, status: "pending_release", created: "2026-04-01" },
    { id: "o2", reference: "MKT-002", amount: 180000, splits: 2, status: "released", created: "2026-03-28" },
    { id: "o3", reference: "MKT-003", amount: 450000, splits: 4, status: "holding", created: "2026-04-05" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Marketplace Payments</h1><p className="text-muted-foreground">Split payments, holds, and vendor disbursements</p></div>
        <Button><Plus className="w-4 h-4 mr-2" />Create Order</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><ShoppingBag className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">3</p><p className="text-sm text-muted-foreground">Total Orders</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">7M</p><p className="text-sm text-muted-foreground">Pending Holds</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Split className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">9</p><p className="text-sm text-muted-foreground">Vendor Splits</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">1.8M</p><p className="text-sm text-muted-foreground">Released</p></div></div></CardContent></Card>
      </div>
      <Card><CardHeader><CardTitle>Orders</CardTitle></CardHeader><CardContent>
        <div className="space-y-3">{orders.map(o => (
          <div key={o.id} className="flex items-center justify-between p-4 border rounded-lg">
            <div><p className="font-medium">{o.reference}</p><p className="text-sm text-muted-foreground">{o.splits} vendor splits - {o.created}</p></div>
            <div className="flex items-center gap-3">
              <p className="font-bold">{(o.amount/100).toLocaleString()}</p>
              <Badge variant={o.status==="released"?"default":o.status==="holding"?"secondary":"outline"}>{o.status.replace("_"," ")}</Badge>
              {o.status!=="released" && <Button size="sm" variant="outline">Release</Button>}
            </div>
          </div>
        ))}</div>
      </CardContent></Card>
    </div>
  );
}
