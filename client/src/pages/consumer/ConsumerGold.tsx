import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import { TrendingUp, Coins, ShoppingCart, ArrowDownCircle, RefreshCw } from "lucide-react";

const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

export default function ConsumerGold() {
  const [buyDialog, setBuyDialog] = useState(false);
  const [sellDialog, setSellDialog] = useState(false);
  const [amount, setAmount] = useState("");
  const [grams, setGrams] = useState("");

  const { data: price, refetch: refetchPrice } = trpc.consumerFinancial.gold.getPrice.useQuery();
  const { data: portfolio, refetch: refetchHoldings } = trpc.consumerFinancial.gold.getPortfolio.useQuery();

  const buyMutation = trpc.consumerFinancial.gold.buy.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Purchased ${d.grams?.toFixed(4)}g of gold`);
      setBuyDialog(false);
      setAmount("");
      refetchHoldings();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sellMutation = trpc.consumerFinancial.gold.sell.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Sold ${d.grams?.toFixed(4)}g — ${formatKobo(d.proceedsKobo ?? 0)} credited`);
      setSellDialog(false);
      setGrams("");
      refetchHoldings();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const holdings = (portfolio as any)?.holdings ?? [];
  const totalGrams = holdings.reduce((s: number, h: any) => s + (h.grams ?? 0), 0);
  const totalValue = (portfolio as any)?.totalValueKobo ?? 0;
  const totalCost = holdings.reduce((s: number, h: any) => s + (h.purchase_price_kobo ?? h.purchasePriceKobo ?? 0), 0);
  const pnl = totalValue - totalCost;

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-bold flex items-center gap-2">
          <Coins className="w-5 h-5 text-yellow-500" /> Digital Gold
        </h1>
        <Button variant="ghost" size="sm" onClick={() => { refetchPrice(); refetchHoldings(); }}>
          <RefreshCw className="w-4 h-4" />
        </Button>
      </div>

      {/* Live Price */}
      <Card className="bg-gradient-to-r from-yellow-50 to-amber-50 border-yellow-200">
        <CardContent className="p-4">
          <p className="text-sm text-yellow-700">Live Gold Price (24K)</p>
          <p className="text-3xl font-bold text-yellow-800">
            {price ? formatKobo((price as any).pricePerGramKobo) : "—"} / gram
          </p>
          <p className="text-xs text-yellow-600 mt-1">
            Source: {(price as any)?.source ?? "goldtech-api"} · Updated just now
          </p>
        </CardContent>
      </Card>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-3 gap-3">
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Total Holdings</p>
            <p className="text-lg font-bold">{totalGrams.toFixed(4)}g</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">Current Value</p>
            <p className="text-lg font-bold">{formatKobo(totalValue)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-3 text-center">
            <p className="text-xs text-muted-foreground">P&L</p>
            <p className={`text-lg font-bold ${pnl >= 0 ? "text-green-600" : "text-red-600"}`}>
              {pnl >= 0 ? "+" : ""}{formatKobo(pnl)}
            </p>
          </CardContent>
        </Card>
      </div>

      {/* Actions */}
      <div className="flex gap-3">
        <Button className="flex-1 bg-yellow-500 hover:bg-yellow-600 text-white" onClick={() => setBuyDialog(true)}>
          <ShoppingCart className="w-4 h-4 mr-2" /> Buy Gold
        </Button>
        <Button variant="outline" className="flex-1" onClick={() => setSellDialog(true)} disabled={totalGrams <= 0}>
          <ArrowDownCircle className="w-4 h-4 mr-2" /> Sell Gold
        </Button>
      </div>

      {/* Holdings Table */}
      {holdings?.length > 0 && (
        <Card>
          <CardHeader><CardTitle className="text-base">My Holdings</CardTitle></CardHeader>
          <CardContent className="p-0">
            <div className="divide-y">
              {holdings.map((h: any) => (
                <div key={h.id} className="flex items-center justify-between p-3">
                  <div>
                    <p className="text-sm font-medium">{h.grams?.toFixed(4)}g</p>
                    <p className="text-xs text-muted-foreground">Bought at {formatKobo(h.purchasePriceKobo ?? 0)}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-bold">{formatKobo(h.currentValueKobo ?? 0)}</p>
                    <Badge variant={h.status === "active" ? "default" : "secondary"} className="text-xs">
                      {h.status}
                    </Badge>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Buy Dialog */}
      <Dialog open={buyDialog} onOpenChange={setBuyDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Buy Digital Gold</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              Current price: {price ? formatKobo((price as any).pricePerGramKobo) : "—"}/gram
            </p>
            <div>
              <label className="text-sm font-medium">Amount (₦)</label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
                className="mt-1"
              />
              {amount && price && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {(Number(amount) * 100 / (price as any).pricePerGramKobo).toFixed(4)}g of gold
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setBuyDialog(false)}>Cancel</Button>
            <Button
              className="bg-yellow-500 hover:bg-yellow-600 text-white"
              disabled={!amount || Number(amount) <= 0 || buyMutation.isPending}
              onClick={() => buyMutation.mutate({ amountKobo: Math.round(Number(amount) * 100) })}
            >
              {buyMutation.isPending ? "Processing..." : "Confirm Purchase"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Sell Dialog */}
      <Dialog open={sellDialog} onOpenChange={setSellDialog}>
        <DialogContent>
          <DialogHeader><DialogTitle>Sell Digital Gold</DialogTitle></DialogHeader>
          <div className="space-y-4">
            <p className="text-sm text-muted-foreground">
              You have {totalGrams.toFixed(4)}g available
            </p>
            <div>
              <label className="text-sm font-medium">Grams to sell</label>
              <Input
                type="number"
                placeholder="e.g. 0.5"
                value={grams}
                onChange={(e) => setGrams(e.target.value)}
                className="mt-1"
              />
              {grams && price && (
                <p className="text-xs text-muted-foreground mt-1">
                  ≈ {formatKobo(Number(grams) * (price as any).pricePerGramKobo)} proceeds
                </p>
              )}
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSellDialog(false)}>Cancel</Button>
            <Button
              variant="destructive"
              disabled={!grams || Number(grams) <= 0 || Number(grams) > totalGrams || sellMutation.isPending}
              onClick={() => sellMutation.mutate({ grams: Number(grams) })}
            >
              {sellMutation.isPending ? "Processing..." : "Confirm Sale"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
