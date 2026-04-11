import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Wallet, ArrowRight, CheckCircle, Clock } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

const CHAINS = ["Polygon", "Ethereum", "Avalanche", "Solana"];

export default function UsdcV2() {
  const [chain, setChain] = useState("Polygon");
  const [amount, setAmount] = useState("");
  const [toAddress, setToAddress] = useState("");
  const [convertOpen, setConvertOpen] = useState(false);
  const [convertAmount, setConvertAmount] = useState("");

  const { data: walletData } = trpc.wave80.usdcV2.getWallet.useQuery();
  const { data: txData, isLoading, refetch } = trpc.wave80.usdcV2.listTransactions.useQuery({});
  const { data: stats } = trpc.wave80.usdcV2.getStats.useQuery();

  const transfer = trpc.wave80.usdcV2.initiateTransfer.useMutation({
    onSuccess: () => { toast.success("Transfer initiated"); setAmount(""); setToAddress(""); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const convert = trpc.wave80.usdcV2.convertToNgn.useMutation({
    onSuccess: (data) => { toast.success("Converted to NGN"); setConvertOpen(false); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const txs = txData?.transactions ?? [];
  const wallet = walletData?.wallet;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div><h1 className="text-2xl font-bold">USDC V2</h1><p className="text-muted-foreground">Circle CCTP cross-chain USDC transfers</p></div>
        <Button variant="outline" onClick={() => setConvertOpen(true)}>Convert to NGN</Button>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Wallet className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{parseFloat(stats?.balance ?? "0").toFixed(2)} USDC</p><p className="text-sm text-muted-foreground">{wallet?.network ?? "polygon"}</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{parseFloat(stats?.totalReceived ?? "0").toFixed(2)}</p><p className="text-sm text-muted-foreground">Total Received</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><ArrowRight className="w-8 h-8 text-purple-500" /><div><p className="text-2xl font-bold">{parseFloat(stats?.totalSent ?? "0").toFixed(2)}</p><p className="text-sm text-muted-foreground">Total Sent</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Initiate Transfer</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label>Destination Chain</Label><div className="flex flex-wrap gap-2">{CHAINS.map(c=><Button key={c} variant={chain===c?"default":"outline"} size="sm" onClick={()=>setChain(c)}>{c}</Button>)}</div></div>
          <div className="space-y-2"><Label>Amount (USDC)</Label><Input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>Destination Address</Label><Input placeholder="0x..." value={toAddress} onChange={e=>setToAddress(e.target.value)} /></div>
          {amount && <div className="p-3 bg-muted rounded-lg"><div className="flex items-center justify-between"><span>{amount} USDC</span><ArrowRight className="w-4 h-4" /><span className="font-bold">{chain}</span></div><p className="text-xs text-muted-foreground mt-1">Bridge fee: ~$0.10 - Est. 2-5 min</p></div>}
          <Button className="w-full" onClick={() => transfer.mutate({ toAddress, amountUsdc: amount, network: chain.toLowerCase() })} disabled={!amount || !toAddress || transfer.isPending}>{transfer.isPending ? "Initiating..." : "Initiate CCTP Transfer"}</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Transfer History</CardTitle></CardHeader><CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
          txs.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No transfers yet.</p></div> : (
            <div className="space-y-3">{txs.slice(0, 10).map(t=>(
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div><p className="font-medium">{t.amountUsdc} USDC | {t.type}</p><p className="text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p></div>
                <Badge variant={t.status==="confirmed"?"default":"secondary"}>{t.status}</Badge>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      </div>
      <Dialog open={convertOpen} onOpenChange={setConvertOpen}>
        <DialogContent>
          <DialogHeader><DialogTitle>Convert USDC to NGN</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <div className="space-y-2"><Label>Amount (USDC)</Label><Input type="number" value={convertAmount} onChange={e => setConvertAmount(e.target.value)} /></div>
            {convertAmount && <p className="text-sm text-muted-foreground">&#8358;{(parseFloat(convertAmount || "0") * 1650).toLocaleString()} NGN at rate 1 USDC = &#8358;1,650</p>}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConvertOpen(false)}>Cancel</Button>
            <Button onClick={() => convert.mutate({ amountUsdc: convertAmount })} disabled={!convertAmount || convert.isPending}>{convert.isPending ? "Converting..." : "Convert"}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
