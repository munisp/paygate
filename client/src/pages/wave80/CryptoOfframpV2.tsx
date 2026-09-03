import { useState } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ArrowRight, Clock, CheckCircle, TrendingUp } from "lucide-react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";

export default function CryptoOfframpV2() {
  const [amount, setAmount] = useState("");
  const [asset, setAsset] = useState("USDT");
  const [bankCode, setBankCode] = useState("");
  const [accountNumber, setAccountNumber] = useState("");
  const [walletAddress, setWalletAddress] = useState("");

  const { data: txData, isLoading, refetch } = trpc.wave80.cryptoOfframpV2.listTransactions.useQuery({}, { staleTime: 30_000 });
  const { data: stats } = trpc.wave80.cryptoOfframpV2.getStats.useQuery();
  const { data: ratesData } = trpc.wave80.cryptoOfframpV2.getRates.useQuery();

  const initiate = trpc.wave80.cryptoOfframpV2.initiateOfframp.useMutation({
    onSuccess: () => { toast.success("Off-ramp initiated"); setAmount(""); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });
  const cancel = trpc.wave80.cryptoOfframpV2.cancelTransaction.useMutation({
    onSuccess: () => { toast.success("Transaction cancelled"); refetch(); },
    onError: (e: { message: string }) => toast.error(e.message),
  });

  const txs = txData?.transactions ?? [];
  const rates = ratesData?.rates ?? [];
  const currentRate = rates.find(r => r.asset === asset)?.rate ?? 1650;

  return (
    <div className="p-6 space-y-6">
      <div><h1 className="text-2xl font-bold">Crypto Off-Ramp V2</h1><p className="text-muted-foreground">Convert USDT/USDC to NGN via Circle CCTP</p></div>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><TrendingUp className="w-8 h-8 text-blue-500" /><div><p className="text-2xl font-bold">{stats?.total ?? 0}</p><p className="text-sm text-muted-foreground">Total Transactions</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><CheckCircle className="w-8 h-8 text-green-500" /><div><p className="text-2xl font-bold">{stats?.completed ?? 0}</p><p className="text-sm text-muted-foreground">Completed</p></div></div></CardContent></Card>
        <Card><CardContent className="pt-6"><div className="flex items-center gap-3"><Clock className="w-8 h-8 text-yellow-500" /><div><p className="text-2xl font-bold">&#8358;{((stats?.totalFiatOut ?? 0) / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">Total NGN Out</p></div></div></CardContent></Card>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <Card><CardHeader><CardTitle>Convert Crypto to NGN</CardTitle></CardHeader><CardContent className="space-y-4">
          <div className="space-y-2"><Label>Asset</Label>
            <div className="flex gap-2">{["USDT","USDC","ETH"].map(a => <Button key={a} variant={asset===a?"default":"outline"} size="sm" onClick={()=>setAsset(a)}>{a}</Button>)}</div>
          </div>
          <div className="space-y-2"><Label>Amount ({asset})</Label><Input type="number" placeholder="0.00" value={amount} onChange={e=>setAmount(e.target.value)} /></div>
          <div className="space-y-2"><Label>Bank Code</Label><Input placeholder="e.g. 044" value={bankCode} onChange={e=>setBankCode(e.target.value)} /></div>
          <div className="space-y-2"><Label>Account Number</Label><Input placeholder="0123456789" value={accountNumber} onChange={e=>setAccountNumber(e.target.value)} /></div>
          <div className="space-y-2"><Label>Wallet Address</Label><Input placeholder="0x..." value={walletAddress} onChange={e=>setWalletAddress(e.target.value)} /></div>
          {amount && <div className="p-3 bg-muted rounded-lg"><div className="flex items-center justify-between"><span>{amount} {asset}</span><ArrowRight className="w-4 h-4" /><span className="font-bold">&#8358;{(parseFloat(amount||"0")*currentRate).toLocaleString()} NGN</span></div><p className="text-xs text-muted-foreground mt-1">Rate: 1 {asset} = &#8358;{currentRate.toLocaleString()} NGN</p></div>}
          <Button className="w-full" onClick={() => initiate.mutate({ cryptoAsset: asset, cryptoAmount: amount, bankCode, accountNumber, walletAddress, idempotencyKey: crypto.randomUUID() })} disabled={!amount || !bankCode || !accountNumber || !walletAddress || initiate.isPending}>{initiate.isPending ? "Initiating..." : "Initiate Off-Ramp"}</Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle>Recent Orders</CardTitle></CardHeader><CardContent>
          {isLoading ? <p className="text-sm text-muted-foreground py-4">Loading...</p> :
          txs.length === 0 ? <div className="text-center py-8"><p className="text-muted-foreground">No transactions yet.</p></div> : (
            <div className="space-y-3">{txs.slice(0, 10).map(t => (
              <div key={t.id} className="flex items-center justify-between p-3 border rounded-lg">
                <div><p className="font-medium">{t.cryptoAmount} {t.cryptoAsset} to &#8358;{(t.fiatAmount / 100).toLocaleString()}</p><p className="text-sm text-muted-foreground">{new Date(t.createdAt).toLocaleDateString()}</p></div>
                <div className="flex items-center gap-2">
                  <Badge variant={t.status==="completed"?"default":"secondary"}>{t.status}</Badge>
                  {t.status === "pending" && <Button size="sm" variant="ghost" onClick={() => cancel.mutate({ txId: t.id })}>Cancel</Button>}
                </div>
              </div>
            ))}</div>
          )}
        </CardContent></Card>
      </div>
    </div>
  );
}
