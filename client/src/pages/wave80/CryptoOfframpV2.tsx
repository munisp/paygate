import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Clock, CheckCircle } from "lucide-react";
export default function CryptoOfframpV2() {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("USDT");
  const rate = 1580;
  const orders = [
    { id: "co1", asset: "USDT", amount: 100, ngnAmount: 158000, status: "completed", date: "2026-04-08" },
    { id: "co2", asset: "USDC", amount: 250, ngnAmount: 395000, status: "processing", date: "2026-04-09" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Crypto Off-Ramp V2</h1><p className="text-muted-foreground">Convert USDT/USDC to NGN via Circle CCTP</p></div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Convert Crypto to NGN</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label>Asset</Label>
            <div className="flex gap-2">{["USDT","USDC","DAI"].map(a => <Button key={a} variant={asset===a?"default":"outline"} size="sm" onClick={()=>setAsset(a)}>{a}</Button>)}</div>
          </div>
          <div className="space-y-2"><Label>Amount ({asset})</Label><Input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          {amount && <div className="p-3 bg-muted rounded-lg"><div className="flex items-center justify-between"><span>{amount} {asset}</span><ArrowRight className="w-4 h-4" /><span className="font-bold">{(parseFloat(amount||"0")*rate).toLocaleString()} NGN</span></div><p className="text-xs text-muted-foreground mt-1">Rate: 1 {asset} = {rate.toLocaleString()} NGN</p></div>}
          <Button className="w-full">Initiate Off-Ramp</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">{orders.map(o => (
            <div key={o.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div><p className="font-medium">{o.amount} {o.asset} to {(o.ngnAmount/100).toLocaleString()} NGN</p><p className="text-sm text-muted-foreground">{o.date}</p></div>
              <Badge variant={o.status==="completed"?"default":"secondary"}>{o.status==="completed"?<CheckCircle className="w-3 h-3 mr-1 inline"/>:<Clock className="w-3 h-3 mr-1 inline"/>}{o.status}</Badge>
            </div>
          ))}</div>
        </CardContent></Card>
      </div>
    </div>
  );
}
