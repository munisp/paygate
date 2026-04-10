import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Coins, ArrowRight, Globe, Activity } from "lucide-react";
export default function UsdcV2() {
  const [amount, setAmount] = useState("");
  const [chain, setChain] = useState("ethereum");
  const chains = ["ethereum","polygon","arbitrum","optimism","base","solana"];
  const transfers = [
    { id: "t1", asset: "USDC", amount: 500, chain: "polygon", status: "completed", date: "2026-04-08" },
    { id: "t2", asset: "USDC", amount: 1000, chain: "arbitrum", status: "pending", date: "2026-04-09" },
  ];
  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">USDC V2</h1><p className="text-muted-foreground">Circle CCTP cross-chain USDC transfers</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Coins className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">$2,450</p><p className="text-sm text-muted-foreground">USDC Balance</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Globe className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">6</p><p className="text-sm text-muted-foreground">Supported Chains</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Activity className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">2</p><p className="text-sm text-muted-foreground">Pending Transfers</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Initiate Transfer</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label>Destination Chain</Label><div className="flex flex-wrap gap-2">{chains.map(c=><Button key={c} variant={chain===c?"default":"outline"} size="sm" onClick={()=>setChain(c)}>{c}</Button>)}</div></div>
          <div className="space-y-2"><Label>Amount (USDC)</Label><Input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>Destination Address</Label><Input placeholder="0x..." /></div>
          {amount && <div className="p-3 bg-muted rounded-lg"><div className="flex items-center justify-between"><span>{amount} USDC</span><ArrowRight className="w-4 h-4" /><span className="font-bold">{chain}</span></div><p className="text-xs text-muted-foreground mt-1">Bridge fee: ~$0.10 - Est. 2-5 min</p></div>}
          <Button className="w-full">Initiate CCTP Transfer</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Transfer History</CardTitle></CardHeader><CardContent>
          <div className="space-y-3">{transfers.map(t=>(
            <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
              <div><p className="font-medium">{t.amount} {t.asset} to {t.chain}</p><p className="text-sm text-muted-foreground">{t.date}</p></div>
              <Badge variant={t.status==="completed"?"default":"secondary"}>{t.status}</Badge>
            </div>
          ))}</div>
        </CardContent></Card>
      </div>
    </div>
  );
}
