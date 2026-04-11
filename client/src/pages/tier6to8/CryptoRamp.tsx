import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Bitcoin, ArrowLeftRight } from "lucide-react";

export default function CryptoRamp() {
  const [direction, setDirection] = useState<"on_ramp" | "off_ramp">("on_ramp");
  const [crypto, setCrypto] = useState<"USDC" | "USDT" | "BTC" | "ETH">("USDC");
  const [fiatAmount, setFiatAmount] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const { data: quote } = trpc.tier6to8.cryptoRamp.getQuote.useQuery(
    { direction, cryptoCurrency: crypto, fiatAmountKobo: Math.round(parseFloat(fiatAmount || "0") * 100) },
    { enabled: parseFloat(fiatAmount) > 0 }
  );
  const { data: txns } = trpc.tier6to8.cryptoRamp.getTransactions.useQuery({ limit: 20 });
  const executeMutation = trpc.tier6to8.cryptoRamp.executeRamp.useMutation({
    onSuccess: (d: any) => toast.success(`Ramp initiated — Ref: ${d.transactionId}`),
    onError: (e: any) => toast.error(e.message),
  });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Bitcoin className="w-8 h-8 text-orange-500" />
        <div><h1 className="text-2xl font-bold">Crypto On/Off Ramp</h1><p className="text-muted-foreground">Convert between NGN and crypto assets</p></div>
      </div>
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <Card>
          <CardHeader><CardTitle className="flex items-center gap-2"><ArrowLeftRight className="w-4 h-4" />New Ramp</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant={direction === "on_ramp" ? "default" : "outline"} className="flex-1" onClick={() => setDirection("on_ramp")}>On-Ramp (NGN→Crypto)</Button>
              <Button variant={direction === "off_ramp" ? "default" : "outline"} className="flex-1" onClick={() => setDirection("off_ramp")}>Off-Ramp (Crypto→NGN)</Button>
            </div>
            <select className="w-full border rounded-md px-3 py-2 text-sm" value={crypto} onChange={e => setCrypto(e.target.value as any)}>
              <option value="USDC">USDC</option><option value="USDT">USDT</option><option value="BTC">BTC</option><option value="ETH">ETH</option>
            </select>
            <Input type="number" placeholder="NGN Amount" value={fiatAmount} onChange={e => setFiatAmount(e.target.value)} />
            {quote && (
              <div className="p-3 bg-muted rounded-lg text-sm space-y-1">
                <div className="flex justify-between"><span>You get</span><span className="font-bold">{quote.cryptoAmount.toFixed(6)} {crypto}</span></div>
                <div className="flex justify-between"><span>Rate</span><span>₦{quote.exchangeRate.toLocaleString()}/{crypto}</span></div>
                <div className="flex justify-between"><span>Fee</span><span>₦{(quote.fee / 100).toLocaleString()}</span></div>
              </div>
            )}
            <Input placeholder="Wallet address (for on-ramp)" value={walletAddress} onChange={e => setWalletAddress(e.target.value)} />
            <Button className="w-full" disabled={!quote || executeMutation.isPending}
              onClick={() => quote && executeMutation.mutate({ quoteId: quote.quoteId, walletAddress })}>
              {executeMutation.isPending ? "Processing..." : "Execute Ramp"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle>Recent Transactions</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {txns?.transactions.map((t: any) => (
                <div key={t.id} className="p-3 border rounded-lg flex justify-between">
                  <div>
                    <p className="font-medium text-sm">{t.direction === "on_ramp" ? "On-Ramp" : "Off-Ramp"} — {t.cryptoCurrency}</p>
                    <p className="text-xs text-muted-foreground">₦{(t.fiatAmountKobo / 100).toLocaleString()} → {t.cryptoAmount} {t.cryptoCurrency}</p>
                  </div>
                  <Badge variant={t.status === "completed" ? "default" : t.status === "failed" ? "destructive" : "secondary"}>{t.status}</Badge>
                </div>
              ))}
              {!txns?.transactions.length && <p className="text-center text-muted-foreground py-8">No transactions yet</p>}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
