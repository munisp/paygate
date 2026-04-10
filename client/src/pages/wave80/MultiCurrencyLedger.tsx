import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RefreshCw, TrendingUp, Shield } from "lucide-react";
export default function MultiCurrencyLedger() {
  const [amount, setAmount] = useState("");
  const balances = [
    { currency: "NGN", balance: 45000000 },
    { currency: "USD", balance: 12500 },
    { currency: "GBP", balance: 3200 },
    { currency: "EUR", balance: 5800 },
    { currency: "KES", balance: 890000 },
    { currency: "GHS", balance: 125000 },
  ];
  const rates = [
    { pair: "USD/NGN", rate: 1580, change: "+0.3%" },
    { pair: "GBP/NGN", rate: 2010, change: "+0.1%" },
    { pair: "EUR/NGN", rate: 1720, change: "-0.2%" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">Multi-Currency Ledger</h1><p className="text-muted-foreground">Real-time FX, hedging, and multi-currency balances</p></div>
        <Button variant="outline"><Shield className="w-4 h-4 mr-2" />Set Hedge Policy</Button>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        {balances.map(b=>(
          <Card key={b.currency}><CardContent className="pt-6"><p className="text-xl font-bold">{b.balance.toLocaleString()}</p><p className="text-sm text-muted-foreground">{b.currency}</p></CardContent></Card>
        ))}
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Currency Conversion</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="space-y-2"><Label>From</Label><Input defaultValue="USD" /></div>
            <div className="space-y-2"><Label>To</Label><Input defaultValue="NGN" /></div>
          </div>
          <div className="space-y-2"><Label>Amount</Label><Input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          {amount && <div className="p-3 bg-muted rounded-lg"><p className="font-medium">{amount} USD approx {(parseFloat(amount||"0")*1580).toLocaleString()} NGN</p></div>}
          <Button className="w-full"><RefreshCw className="w-4 h-4 mr-2" />Convert</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Live FX Rates</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">{rates.map(r=>(
            <div key={r.pair} className="flex items-center justify-between p-3 border rounded-lg">
              <p className="font-medium">{r.pair}</p>
              <div className="flex items-center gap-2"><p className="font-bold">{r.rate.toLocaleString()}</p><Badge variant="outline"><TrendingUp className="w-3 h-3 mr-1" />{r.change}</Badge></div>
            </div>
          ))}</div>
        </CardContent></Card>
      </div>
    </div>
  );
}
