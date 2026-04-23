// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { TrendingUp, PieChart, DollarSign, BarChart3 } from "lucide-react";

export default function ConsumerMutualFunds() {
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [investAmount, setInvestAmount] = useState("");
  const [redeemUnits, setRedeemUnits] = useState("");

  const { data: funds, isLoading } = trpc.newFeatures.mutualFunds.listFunds.useQuery();
  const { data: portfolio, refetch: refetchPortfolio } = trpc.newFeatures.mutualFunds.getPortfolio.useQuery();

  const investMutation = trpc.newFeatures.mutualFunds.invest.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Invested ₦${(d.amountKobo / 100).toLocaleString()} in ${d.fundName}`);
      setInvestAmount("");
      setSelectedFund(null);
      refetchPortfolio();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const redeemMutation = trpc.newFeatures.mutualFunds.redeem.useMutation({
    onSuccess: (d: any) => {
      toast.success(`Redeemed ${d.units} units — proceeds: ₦${(d.proceedsKobo / 100).toLocaleString()}`);
      setRedeemUnits("");
      refetchPortfolio();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const riskColor: Record<string, string> = {
    low: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-red-100 text-red-700",
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <PieChart className="h-8 w-8 text-blue-500" />
        <div>
          <h1 className="text-2xl font-bold">Mutual Funds</h1>
          <p className="text-muted-foreground">Invest in diversified mutual fund portfolios</p>
        </div>
      </div>

      {/* Portfolio Summary */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Invested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{formatKobo(portfolio?.totalInvestedKobo ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">{formatKobo(portfolio?.currentValueKobo ?? 0)}</div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`text-2xl font-bold ${(portfolio?.returnsKobo ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
              {(portfolio?.returnsKobo ?? 0) >= 0 ? "+" : ""}{formatKobo(portfolio?.returnsKobo ?? 0)}
            </div>
            <Badge variant="outline" className="text-xs mt-1">
              {portfolio?.returnsPercent?.toFixed(2) ?? "0.00"}% return
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Fund Listing */}
      <Card>
        <CardHeader>
          <CardTitle>Available Funds</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <p className="text-muted-foreground text-center py-4">Loading funds...</p>
          ) : (
            <div className="space-y-3">
              {(funds?.funds ?? []).map((fund: any) => (
                <div
                  key={fund.fundId}
                  className={`p-4 rounded-lg border cursor-pointer transition-colors ${
                    selectedFund === fund.fundId ? "border-primary bg-primary/5" : "hover:border-primary/50"
                  }`}
                  onClick={() => setSelectedFund(fund.fundId === selectedFund ? null : fund.fundId)}
                >
                  <div className="flex justify-between items-start">
                    <div>
                      <div className="font-medium">{fund.name}</div>
                      <div className="text-sm text-muted-foreground">{fund.category}</div>
                    </div>
                    <div className="text-right">
                      <div className="font-bold text-green-600">{fund.returns1Y?.toFixed(2)}% p.a.</div>
                      <Badge className={`text-xs ${riskColor[fund.riskLevel] ?? ""}`}>
                        {fund.riskLevel} risk
                      </Badge>
                    </div>
                  </div>
                  <div className="mt-2 text-xs text-muted-foreground">
                    NAV: {formatKobo(fund.navKobo ?? 0)} | Min: {formatKobo(fund.minInvestmentKobo ?? 0)}
                  </div>

                  {selectedFund === fund.fundId && (
                    <div className="mt-4 pt-4 border-t space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div>
                          <Label>Invest Amount (₦)</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 10000"
                            value={investAmount}
                            onChange={(e) => setInvestAmount(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                        <div>
                          <Label>Redeem Units</Label>
                          <Input
                            type="number"
                            placeholder="e.g. 5"
                            value={redeemUnits}
                            onChange={(e) => setRedeemUnits(e.target.value)}
                            onClick={(e) => e.stopPropagation()}
                          />
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button
                          size="sm"
                          onClick={(e) => {
                            e.stopPropagation();
                            investMutation.mutate({ fundId: fund.fundId, amountKobo: parseFloat(investAmount) * 100 });
                          }}
                          disabled={!investAmount || investMutation.isPending}
                        >
                          Invest
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={(e) => {
                            e.stopPropagation();
                            redeemMutation.mutate({ fundId: fund.fundId, units: parseFloat(redeemUnits) });
                          }}
                          disabled={!redeemUnits || redeemMutation.isPending}
                        >
                          Redeem
                        </Button>
                      </div>
                    </div>
                  )}
                </div>
              ))}
              {!funds?.funds?.length && (
                <p className="text-muted-foreground text-center py-4">No funds available</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Holdings */}
      {portfolio?.holdings?.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <BarChart3 className="h-5 w-5" /> My Holdings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {portfolio.holdings.map((h: any, i: number) => (
                <div key={i} className="flex justify-between items-center py-2 border-b last:border-0">
                  <div>
                    <div className="font-medium">{h.fundName}</div>
                    <div className="text-sm text-muted-foreground">{h.units?.toFixed(4)} units</div>
                  </div>
                  <div className="text-right">
                    <div className="font-medium">{formatKobo(h.currentValueKobo ?? 0)}</div>
                    <div className={`text-xs ${(h.returnsPercent ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                      {(h.returnsPercent ?? 0) >= 0 ? "+" : ""}{h.returnsPercent?.toFixed(2)}%
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
