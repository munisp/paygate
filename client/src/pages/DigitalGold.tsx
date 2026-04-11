import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function DigitalGold() {
  const [buyAmount, setBuyAmount] = useState("");
  const [sellGrams, setSellGrams] = useState("");
  const [sipAmount, setSipAmount] = useState("");
  const [sipFreq, setSipFreq] = useState<"daily" | "weekly" | "monthly">("monthly");

  const { data: price, isLoading: priceLoading } = trpc.newFeatures.digitalGold.getPrice.useQuery();
  const { data: holdings } = trpc.newFeatures.digitalGold.getHoldings.useQuery();
  const { data: history } = trpc.newFeatures.digitalGold.getTransactionHistory.useQuery({ page: 1, limit: 10 });

  const buyMutation = trpc.newFeatures.digitalGold.buyGold.useMutation({
    onSuccess: (data) => toast.success(`Purchased ${data.gramsAcquired?.toFixed(4)}g of gold`),
    onError: (e: any) => toast.error(e.message),
  });
  const sellMutation = trpc.newFeatures.digitalGold.sellGold.useMutation({
    onSuccess: () => toast.success("Gold sold successfully"),
    onError: (e: any) => toast.error(e.message),
  });
  const sipMutation = trpc.newFeatures.digitalGold.setupSIP.useMutation({
    onSuccess: () => toast.success("SIP set up successfully"),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-yellow-600">Digital Gold</h1>
        <Badge variant="outline" className="text-yellow-600 border-yellow-600">24K Pure Gold</Badge>
      </div>

      {/* Live Price */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-700">Buy Price / gram</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-800">
              {priceLoading ? "..." : price?.buyPricePerGram ? `₦${price.buyPricePerGram.toLocaleString()}` : "N/A"}
            </p>
            {price?.change24h !== undefined && (
              <p className={`text-xs mt-1 ${price.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                {price.change24h >= 0 ? "+" : ""}{price.change24h.toFixed(2)}% today
              </p>
            )}
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-700">Sell Price / gram</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-800">
              {price?.sellPricePerGram ? `₦${price.sellPricePerGram.toLocaleString()}` : "N/A"}
            </p>
          </CardContent>
        </Card>
        <Card className="border-yellow-200 bg-yellow-50">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-yellow-700">My Holdings</CardTitle></CardHeader>
          <CardContent>
            <p className="text-2xl font-bold text-yellow-800">{holdings?.grams?.toFixed(4) ?? "0.0000"}g</p>
            <p className="text-xs text-yellow-700 mt-1">{holdings?.currentValueKobo ? formatKobo(holdings.currentValueKobo) : "₦0.00"}</p>
            {holdings?.unrealizedPnlKobo !== undefined && (
              <p className={`text-xs ${holdings.unrealizedPnlKobo >= 0 ? "text-green-600" : "text-red-600"}`}>
                P&L: {formatKobo(holdings.unrealizedPnlKobo)}
              </p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Buy / Sell / SIP */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader><CardTitle className="text-base">Buy Gold</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Amount (₦)</label>
              <Input placeholder="e.g. 5000" value={buyAmount} onChange={e => setBuyAmount(e.target.value)} />
            </div>
            <Button className="w-full bg-yellow-600 hover:bg-yellow-700" disabled={buyMutation.isPending}
              onClick={() => buyMutation.mutate({ amountKobo: Math.round(parseFloat(buyAmount) * 100), fundingSource: "wallet" })}>
              {buyMutation.isPending ? "Buying..." : "Buy Gold"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Sell Gold</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Grams to sell</label>
              <Input placeholder="e.g. 0.5" value={sellGrams} onChange={e => setSellGrams(e.target.value)} />
            </div>
            <Button variant="outline" className="w-full border-yellow-600 text-yellow-600" disabled={sellMutation.isPending}
              onClick={() => sellMutation.mutate({ grams: parseFloat(sellGrams), destinationAccount: "wallet" })}>
              {sellMutation.isPending ? "Selling..." : "Sell Gold"}
            </Button>
          </CardContent>
        </Card>
        <Card>
          <CardHeader><CardTitle className="text-base">Set Up Gold SIP</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div>
              <label className="text-xs text-muted-foreground">Monthly Amount (₦)</label>
              <Input placeholder="e.g. 2000" value={sipAmount} onChange={e => setSipAmount(e.target.value)} />
            </div>
            <select className="w-full border rounded px-3 py-2 text-sm" value={sipFreq} onChange={e => setSipFreq(e.target.value as any)}>
              <option value="monthly">Monthly</option>
              <option value="weekly">Weekly</option>
              <option value="daily">Daily</option>
            </select>
            <Button className="w-full" disabled={sipMutation.isPending}
              onClick={() => sipMutation.mutate({ amountKobo: Math.round(parseFloat(sipAmount) * 100), frequency: sipFreq, startDate: new Date().toISOString() })}>
              {sipMutation.isPending ? "Setting up..." : "Start SIP"}
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Transaction History */}
      <Card>
        <CardHeader><CardTitle>Transaction History</CardTitle></CardHeader>
        <CardContent>
          {!history?.transactions?.length ? (
            <p className="text-muted-foreground text-sm text-center py-4">No gold transactions yet</p>
          ) : (
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Type</th><th className="text-right py-2">Grams</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Status</th><th className="text-right py-2">Date</th></tr></thead>
              <tbody>
                {history.transactions.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="py-2 capitalize">{t.type}</td>
                    <td className="text-right">{t.grams?.toFixed(4)}g</td>
                    <td className="text-right">{formatKobo(t.amountKobo)}</td>
                    <td className="text-right"><Badge variant={t.status === "completed" ? "default" : "secondary"}>{t.status}</Badge></td>
                    <td className="text-right text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
