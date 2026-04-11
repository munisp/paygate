import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function CashbackRewards() {
  const [redeemAmount, setRedeemAmount] = useState("");
  const [redeemDest, setRedeemDest] = useState<"wallet" | "bank" | "airtime">("wallet");
  const [merchantCashbackPct, setMerchantCashbackPct] = useState("2");
  const [merchantMaxCashback, setMerchantMaxCashback] = useState("5000");

  const { data: balance } = trpc.newFeatures.cashbackRewards.getBalance.useQuery();
  const { data: history } = trpc.newFeatures.cashbackRewards.getHistory.useQuery({ page: 1, limit: 10, type: "all" });
  const { data: campaigns } = trpc.newFeatures.cashbackRewards.getActiveCampaigns.useQuery();
  const { data: merchantConfig } = trpc.newFeatures.cashbackRewards.getMerchantCashbackConfig.useQuery();

  const redeemMutation = trpc.newFeatures.cashbackRewards.redeemCashback.useMutation({
    onSuccess: (d: any) => toast.success(`Redeemed ₦${(d.amountKobo / 100).toLocaleString()}`),
    onError: (e: any) => toast.error(e.message),
  });
  const updateConfigMutation = trpc.newFeatures.cashbackRewards.updateMerchantCashbackConfig.useMutation({
    onSuccess: () => toast.success("Cashback config updated"),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const tierColors: Record<string, string> = { Bronze: "text-orange-600", Silver: "text-gray-500", Gold: "text-yellow-600", Platinum: "text-blue-600" };

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Cashback & Rewards</h1>

      {/* Balance Summary */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <Card className="bg-gradient-to-br from-green-50 to-emerald-50 border-green-200">
          <CardHeader className="pb-2"><CardTitle className="text-sm text-green-700">Available Cashback</CardTitle></CardHeader>
          <CardContent><p className="text-2xl font-bold text-green-800">{balance?.cashbackKobo !== undefined ? formatKobo(balance.cashbackKobo) : "₦0.00"}</p>
            {balance?.tier && <p className={`text-xs font-semibold mt-1 ${tierColors[balance.tier] ?? "text-gray-600"}`}>{balance.tier} Tier</p>}</CardContent>
        </Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Pending</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{balance?.pendingKobo !== undefined ? formatKobo(balance.pendingKobo) : "₦0.00"}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lifetime Earned</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{balance?.lifetimeEarnedKobo !== undefined ? formatKobo(balance.lifetimeEarnedKobo) : "₦0.00"}</p></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Lifetime Redeemed</CardTitle></CardHeader>
          <CardContent><p className="text-xl font-bold">{balance?.lifetimeRedeemedKobo !== undefined ? formatKobo(balance.lifetimeRedeemedKobo) : "₦0.00"}</p></CardContent></Card>
      </div>

      {/* Redeem */}
      <Card>
        <CardHeader><CardTitle className="text-base">Redeem Cashback</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <div className="flex gap-2">
            {(["wallet", "bank", "airtime"] as const).map(d => (
              <Button key={d} variant={redeemDest === d ? "default" : "outline"} size="sm" onClick={() => setRedeemDest(d)} className="capitalize">{d}</Button>
            ))}
          </div>
          <div className="flex gap-2">
            <Input placeholder="Amount (₦)" value={redeemAmount} onChange={e => setRedeemAmount(e.target.value)} className="flex-1" />
            <Button disabled={redeemMutation.isPending}
              onClick={() => redeemMutation.mutate({ amountKobo: Math.round(parseFloat(redeemAmount) * 100), destinationType: redeemDest })}>
              {redeemMutation.isPending ? "Redeeming..." : "Redeem"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Active Campaigns */}
      <Card>
        <CardHeader><CardTitle>Active Campaigns</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {campaigns?.campaigns?.map(c => (
              <div key={c.id} className="p-3 border rounded-lg bg-gradient-to-r from-green-50 to-emerald-50">
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm">{c.title}</p>
                  <Badge className="bg-green-600 text-white">{c.cashbackPct}% back</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-1">{c.description}</p>
                <p className="text-xs">Min spend: {formatKobo(c.minSpendKobo)} | Max: {formatKobo(c.maxCashbackKobo)}</p>
                <p className="text-xs text-muted-foreground">Expires: {new Date(c.validUntil).toLocaleDateString()}</p>
              </div>
            ))}
            {!campaigns?.campaigns?.length && <p className="text-muted-foreground text-sm">No active campaigns</p>}
          </div>
        </CardContent>
      </Card>

      {/* Merchant Config */}
      <Card>
        <CardHeader><CardTitle>Merchant Cashback Config</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          {merchantConfig && (
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div><p className="text-xs text-muted-foreground">Budget Used</p><p className="font-semibold">{formatKobo(merchantConfig.spentBudgetKobo)} / {formatKobo(merchantConfig.totalBudgetKobo)}</p></div>
              <div><p className="text-xs text-muted-foreground">Status</p><Badge variant={merchantConfig.enabled ? "default" : "secondary"}>{merchantConfig.enabled ? "Active" : "Disabled"}</Badge></div>
            </div>
          )}
          <div className="flex gap-2">
            <div className="flex-1"><label className="text-xs text-muted-foreground">Cashback %</label><Input value={merchantCashbackPct} onChange={e => setMerchantCashbackPct(e.target.value)} /></div>
            <div className="flex-1"><label className="text-xs text-muted-foreground">Max Cashback (₦)</label><Input value={merchantMaxCashback} onChange={e => setMerchantMaxCashback(e.target.value)} /></div>
          </div>
          <Button className="w-full" disabled={updateConfigMutation.isPending}
            onClick={() => updateConfigMutation.mutate({ enabled: true, defaultCashbackPct: parseFloat(merchantCashbackPct), maxCashbackKobo: Math.round(parseFloat(merchantMaxCashback) * 100), totalBudgetKobo: 10000000 })}>
            {updateConfigMutation.isPending ? "Saving..." : "Save Config"}
          </Button>
        </CardContent>
      </Card>

      {/* History */}
      <Card>
        <CardHeader><CardTitle>Cashback History</CardTitle></CardHeader>
        <CardContent>
          {!history?.transactions?.length ? <p className="text-muted-foreground text-sm">No cashback history</p> :
            <table className="w-full text-sm">
              <thead><tr className="border-b"><th className="text-left py-2">Description</th><th className="text-right py-2">Amount</th><th className="text-right py-2">Type</th><th className="text-right py-2">Date</th></tr></thead>
              <tbody>
                {history.transactions.map(t => (
                  <tr key={t.id} className="border-b hover:bg-muted/30">
                    <td className="py-2">{t.description}</td>
                    <td className={`text-right font-semibold ${t.type === "earned" ? "text-green-600" : "text-red-600"}`}>
                      {t.type === "earned" ? "+" : "-"}{formatKobo(t.amountKobo)}
                    </td>
                    <td className="text-right"><Badge variant={t.type === "earned" ? "default" : "secondary"}>{t.type}</Badge></td>
                    <td className="text-right text-muted-foreground">{new Date(t.timestamp).toLocaleDateString()}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          }
        </CardContent>
      </Card>
    </div>
  );
}
