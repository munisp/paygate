import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function MutualFunds() {
  const [category, setCategory] = useState<"equity" | "debt" | "hybrid" | "money_market" | "all">("all");
  const [investAmount, setInvestAmount] = useState("");
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [investType, setInvestType] = useState<"lumpsum" | "sip">("lumpsum");

  const { data: fundsData, isLoading } = trpc.newFeatures.mutualFunds.listFunds.useQuery({ category, sortBy: "returns_1y" });
  const { data: portfolio } = trpc.newFeatures.mutualFunds.getPortfolio.useQuery();

  const investMutation = trpc.newFeatures.mutualFunds.invest.useMutation({
    onSuccess: (data) => toast.success(`Investment of ₦${(data.amountKobo / 100).toLocaleString()} placed`),
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const riskColor = (r: string) => ({ Low: "bg-green-100 text-green-700", Moderate: "bg-yellow-100 text-yellow-700", High: "bg-red-100 text-red-700" }[r] ?? "bg-gray-100 text-gray-700");

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Mutual Funds</h1>

      {/* Portfolio Summary */}
      {portfolio && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total Invested</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{formatKobo(portfolio.totalInvestedKobo)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Current Value</CardTitle></CardHeader>
            <CardContent><p className="text-xl font-bold">{formatKobo(portfolio.totalCurrentValueKobo)}</p></CardContent></Card>
          <Card><CardHeader className="pb-2"><CardTitle className="text-sm text-muted-foreground">Total P&L</CardTitle></CardHeader>
            <CardContent>
              <p className={`text-xl font-bold ${portfolio.totalPnlKobo >= 0 ? "text-green-600" : "text-red-600"}`}>
                {formatKobo(portfolio.totalPnlKobo)}
              </p>
            </CardContent></Card>
        </div>
      )}

      {/* Category Filter */}
      <div className="flex gap-2 flex-wrap">
        {["all", "equity", "debt", "hybrid", "money_market"].map(c => (
          <Button key={c} variant={category === c ? "default" : "outline"} size="sm"
            onClick={() => setCategory(c as any)} className="capitalize">{c.replace("_", " ")}</Button>
        ))}
      </div>

      {/* Fund List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {isLoading ? <p className="text-muted-foreground">Loading funds...</p> :
          fundsData?.funds?.map(fund => (
            <Card key={fund.fundId} className={`cursor-pointer transition-all ${selectedFund === fund.fundId ? "ring-2 ring-primary" : ""}`}
              onClick={() => setSelectedFund(fund.fundId)}>
              <CardContent className="pt-4">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <p className="font-semibold text-sm">{fund.name}</p>
                    <p className="text-xs text-muted-foreground capitalize">{fund.category}</p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full ${riskColor(fund.riskLevel)}`}>{fund.riskLevel}</span>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs">
                  <div><p className="text-muted-foreground">1Y Returns</p><p className="font-semibold text-green-600">+{fund.returns1y?.toFixed(1)}%</p></div>
                  <div><p className="text-muted-foreground">3Y Returns</p><p className="font-semibold text-green-600">+{fund.returns3y?.toFixed(1)}%</p></div>
                  <div><p className="text-muted-foreground">NAV</p><p className="font-semibold">₦{fund.nav?.toFixed(2)}</p></div>
                </div>
                <p className="text-xs text-muted-foreground mt-2">Min: ₦{(fund.minInvestment / 100).toLocaleString()} | Expense: {fund.expenseRatio}%</p>
              </CardContent>
            </Card>
          ))
        }
      </div>

      {/* Invest Panel */}
      {selectedFund && (
        <Card className="border-primary">
          <CardHeader><CardTitle className="text-base">Invest in Selected Fund</CardTitle></CardHeader>
          <CardContent className="space-y-3">
            <div className="flex gap-2">
              <Button variant={investType === "lumpsum" ? "default" : "outline"} size="sm" onClick={() => setInvestType("lumpsum")}>Lumpsum</Button>
              <Button variant={investType === "sip" ? "default" : "outline"} size="sm" onClick={() => setInvestType("sip")}>SIP</Button>
            </div>
            <Input placeholder="Amount (₦)" value={investAmount} onChange={e => setInvestAmount(e.target.value)} />
            <Button className="w-full" disabled={investMutation.isPending}
              onClick={() => investMutation.mutate({ fundId: selectedFund, amountKobo: Math.round(parseFloat(investAmount) * 100), investmentType: investType })}>
              {investMutation.isPending ? "Investing..." : `Invest ₦${parseFloat(investAmount || "0").toLocaleString()}`}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
