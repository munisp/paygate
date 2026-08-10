import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import { Wallet, ArrowRightLeft, Plus } from "lucide-react";

const CURRENCIES = ["NGN", "USD", "EUR", "GBP", "KES", "GHS", "ZAR", "USDC"];

export default function MultiCurrencyWallet() {
  const [fromCurrency, setFromCurrency] = useState("NGN");
  const [toCurrency, setToCurrency] = useState("USD");
  const [amount, setAmount] = useState("");
  const [newCurrency, setNewCurrency] = useState("USD");
  const { isLoading, data: wallets, refetch } = trpc.tier6to8.cryptoRamp.getWallets.useQuery();
  const createMutation = trpc.tier6to8.multiCurrencyWallet.createWallet.useMutation({
    onSuccess: (d: any) => { toast.success(`${d.currency} wallet created`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const convertMutation = trpc.tier6to8.multiCurrencyWallet.convertCurrency.useMutation({
    onSuccess: (d: any) => { toast.success(`Converted at rate ${d.rate} — received ${d.toAmount}`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const sweepMutation = trpc.tier6to8.multiCurrencyWallet.sweepToNGN.useMutation({
    onSuccess: (d: any) => { toast.success(`Swept ₦${(d.ngnAmountKobo / 100).toLocaleString()} to NGN wallet`); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });

  if (isLoading) return (

    <div className="flex items-center justify-center h-64">

      <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary"></div>

    </div>

  );


  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Wallet className="w-8 h-8 text-green-600" />
        <div><h1 className="text-2xl font-bold">Multi-Currency Wallet</h1><p className="text-muted-foreground">Hold, convert, and sweep multiple currencies</p></div>
      </div>
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {wallets?.wallets.map((w: any) => (
          <Card key={w.currency}>
            <CardContent className="pt-4">
              <div className="flex justify-between items-start">
                <div>
                  <p className="text-2xl font-bold">{w.currency}</p>
                  <p className="text-lg font-semibold">{w.balance.toLocaleString(undefined, { maximumFractionDigits: 4 })}</p>
                  <p className="text-xs text-muted-foreground">≈ ₦{(w.ngnEquivalentKobo / 100).toLocaleString()}</p>
                </div>
                <Badge variant={w.status === "active" ? "default" : "secondary"}>{w.status}</Badge>
              </div>
              {w.currency !== "NGN" && (
                <Button size="sm" variant="outline" className="w-full mt-2" onClick={() => sweepMutation.mutate({ currency: w.currency })}>
                  Sweep to NGN
                </Button>
              )}
            </CardContent>
          </Card>
        ))}
        <Card className="border-dashed cursor-pointer" onClick={() => createMutation.mutate({ currency: newCurrency as any })}>
          <CardContent className="pt-4 flex flex-col items-center justify-center h-full gap-2">
            <Plus className="w-6 h-6 text-muted-foreground" />
            <select className="border rounded px-2 py-1 text-sm" value={newCurrency} onChange={e => { e.stopPropagation(); setNewCurrency(e.target.value); }} onClick={e => e.stopPropagation()}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <span className="text-xs text-muted-foreground">Add wallet</span>
          </CardContent>
        </Card>
      </div>
      <Card>
        <CardHeader><CardTitle className="flex items-center gap-2"><ArrowRightLeft className="w-4 h-4" />Currency Conversion</CardTitle></CardHeader>
        <CardContent className="flex flex-wrap gap-3 items-end">
          <div>
            <label className="text-xs text-muted-foreground">From</label>
            <select className="border rounded px-2 py-2 text-sm block" value={fromCurrency} onChange={e => setFromCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Input type="number" placeholder="Amount" value={amount} onChange={e => setAmount(e.target.value)} className="w-32" />
          <ArrowRightLeft className="w-4 h-4 text-muted-foreground" />
          <div>
            <label className="text-xs text-muted-foreground">To</label>
            <select className="border rounded px-2 py-2 text-sm block" value={toCurrency} onChange={e => setToCurrency(e.target.value)}>
              {CURRENCIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
          </div>
          <Button disabled={convertMutation.isPending || !amount}
            onClick={() => convertMutation.mutate({ fromCurrency, toCurrency, amountKobo: Math.round(parseFloat(amount) * 100) })}>
            {convertMutation.isPending ? "Converting..." : "Convert"}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
