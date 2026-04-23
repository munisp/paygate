// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Coins, TrendingUp, ShoppingCart, ArrowDownCircle, RefreshCw } from "lucide-react";

export default function ConsumerGold() {
  const [buyGrams, setBuyGrams] = useState("");
  const [sellGrams, setSellGrams] = useState("");
  const [sipAmount, setSipAmount] = useState("");
  const [sipFrequency, setSipFrequency] = useState<"daily" | "weekly" | "monthly">("monthly");

  const { data: price, isLoading: priceLoading, refetch: refetchPrice } = trpc.newFeatures.digitalGold.getPrice.useQuery();
  const { data: holdings, refetch: refetchHoldings } = trpc.newFeatures.digitalGold.getHoldings.useQuery();
  const { data: history } = trpc.newFeatures.digitalGold.getHistory.useQuery({ page: 1, limit: 10 });

  const buyMutation = trpc.newFeatures.digitalGold.buy.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Purchased ${d.gramsAcquired?.toFixed(4)}g gold`);
      setBuyGrams("");
      refetchHoldings();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sellMutation = trpc.newFeatures.digitalGold.sell.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Sold gold for ₦${((d.proceedsKobo ?? 0) / 100).toLocaleString()}`);
      setSellGrams("");
      refetchHoldings();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const sipMutation = trpc.newFeatures.digitalGold.createSIP.useMutation({
    onSuccess: () => {
      toast.success("Gold SIP plan created");
      setSipAmount("");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const goldPrice = price?.pricePerGramKobo ?? 0;
  const buyEstimate = buyGrams ? goldPrice * parseFloat(buyGrams) : 0;

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Coins className="h-8 w-8 text-yellow-500" />
        <div>
          <h1 className="text-2xl font-bold">Digital Gold</h1>
          <p className="text-muted-foreground">Buy, sell, and invest in 24K digital gold</p>
        </div>
      </div>

      {/* Price & Holdings */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground flex items-center gap-2">
              <TrendingUp className="h-4 w-4" /> Current Price
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-yellow-600">
              {priceLoading ? "..." : formatKobo(goldPrice)}
            </div>
            <p className="text-xs text-muted-foreground">per gram (24K)</p>
            <Button variant="ghost" size="sm" className="mt-2 p-0 h-auto" onClick={() => refetchPrice()}>
              <RefreshCw className="h-3 w-3 mr-1" /> Refresh
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Your Holdings</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{(holdings?.totalGrams ?? 0).toFixed(4)}g</div>
            <p className="text-xs text-muted-foreground">
              ≈ {formatKobo((holdings?.totalGrams ?? 0) * goldPrice)}
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Portfolio Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatKobo((holdings?.totalGrams ?? 0) * goldPrice)}
            </div>
            <Badge variant="outline" className="text-xs mt-1">Live valuation</Badge>
          </CardContent>
        </Card>
      </div>

      {/* Buy & Sell */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ShoppingCart className="h-5 w-5 text-green-500" /> Buy Gold
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Amount (grams)</Label>
              <Input
                type="number"
                placeholder="e.g. 0.5"
                value={buyGrams}
                onChange={(e) => setBuyGrams(e.target.value)}
                min="0.01"
                step="0.01"
              />
              {buyGrams && (
                <p className="text-sm text-muted-foreground mt-1">
                  Estimated cost: <strong>{formatKobo(buyEstimate)}</strong>
                </p>
              )}
            </div>
            <Button
              className="w-full bg-yellow-500 hover:bg-yellow-600 text-black"
              onClick={() => buyMutation.mutate({ grams: parseFloat(buyGrams) })}
              disabled={!buyGrams || buyMutation.isPending}
            >
              {buyMutation.isPending ? "Processing..." : "Buy Gold"}
            </Button>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ArrowDownCircle className="h-5 w-5 text-red-500" /> Sell Gold
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            <div>
              <Label>Amount (grams)</Label>
              <Input
                type="number"
                placeholder="e.g. 0.25"
                value={sellGrams}
                onChange={(e) => setSellGrams(e.target.value)}
                min="0.01"
                step="0.01"
              />
              {sellGrams && (
                <p className="text-sm text-muted-foreground mt-1">
                  Estimated proceeds: <strong>{formatKobo(goldPrice * parseFloat(sellGrams) * 0.98)}</strong>
                  <span className="text-xs ml-1">(2% spread)</span>
                </p>
              )}
            </div>
            <Button
              variant="destructive"
              className="w-full"
              onClick={() => sellMutation.mutate({ grams: parseFloat(sellGrams) })}
              disabled={!sellGrams || sellMutation.isPending}
            >
              {sellMutation.isPending ? "Processing..." : "Sell Gold"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* SIP Plan */}
      <Card>
        <CardHeader>
          <CardTitle>Gold SIP Plan</CardTitle>
          <p className="text-sm text-muted-foreground">Set up automatic gold purchases at regular intervals</p>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <Label>Investment Amount (₦)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000"
                value={sipAmount}
                onChange={(e) => setSipAmount(e.target.value)}
              />
            </div>
            <div>
              <Label>Frequency</Label>
              <select
                className="w-full h-10 rounded-md border border-input bg-background px-3 py-2 text-sm"
                value={sipFrequency}
                onChange={(e) => setSipFrequency(e.target.value as any)}
              >
                <option value="daily">Daily</option>
                <option value="weekly">Weekly</option>
                <option value="monthly">Monthly</option>
              </select>
            </div>
            <div className="flex items-end">
              <Button
                className="w-full"
                onClick={() => sipMutation.mutate({ amountKobo: parseFloat(sipAmount) * 100, frequency: sipFrequency })}
                disabled={!sipAmount || sipMutation.isPending}
              >
                {sipMutation.isPending ? "Creating..." : "Start SIP"}
              </Button>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Transaction History */}
      <Card>
        <CardHeader>
          <CardTitle>Transaction History</CardTitle>
        </CardHeader>
        <CardContent>
          {!history?.transactions?.length ? (
            <p className="text-muted-foreground text-center py-4">No transactions yet</p>
          ) : (
            <div className="space-y-2">
              {history.transactions.map((tx: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <Badge variant={tx.type === "buy" ? "default" : "destructive"} className="mr-2">
                      {tx.type?.toUpperCase()}
                    </Badge>
                    <span className="text-sm">{tx.grams?.toFixed(4)}g</span>
                  </div>
                  <div className="text-right">
                    <div className="text-sm font-medium">{formatKobo(tx.amountKobo ?? 0)}</div>
                    <div className="text-xs text-muted-foreground">
                      {tx.createdAt ? new Date(tx.createdAt).toLocaleDateString() : ""}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
