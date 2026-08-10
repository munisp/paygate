// @ts-nocheck
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  TrendingUp,
  PieChart,
  BarChart3,
  GitCompare,
  X,
  CheckCircle2,
  AlertCircle,
  Info,
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

export default function ConsumerMutualFunds() {
  const [selectedFund, setSelectedFund] = useState<string | null>(null);
  const [investAmount, setInvestAmount] = useState("");
  const [redeemUnits, setRedeemUnits] = useState("");
  const [compareList, setCompareList] = useState<string[]>([]);
  const [activeTab, setActiveTab] = useState<"browse" | "compare" | "holdings">("browse");

  const { data: funds, isLoading } = trpc.newFeatures.mutualFunds.listFunds.useQuery();
  const { data: portfolio, refetch: refetchPortfolio } =
    trpc.newFeatures.mutualFunds.getPortfolio.useQuery();

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
      toast.success(
        `Redeemed ${d.units} units — proceeds: ₦${(d.proceedsKobo / 100).toLocaleString()}`,
      );
      setRedeemUnits("");
      refetchPortfolio();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const formatKobo = (k: number) =>
    `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  const riskColor: Record<string, string> = {
    low: "bg-green-100 text-green-700",
    medium: "bg-yellow-100 text-yellow-700",
    high: "bg-red-100 text-red-700",
  };

  const riskScore: Record<string, number> = { low: 1, medium: 2, high: 3 };

  // Funds selected for comparison
  const compareFunds = useMemo(
    () => (funds?.funds ?? []).filter((f: any) => compareList.includes(f.fundId)),
    [funds, compareList],
  );

  const toggleCompare = (fundId: string) => {
    setCompareList((prev) => {
      if (prev.includes(fundId)) return prev.filter((id) => id !== fundId);
      if (prev.length >= 3) {
        toast.info("You can compare up to 3 funds at a time");
        return prev;
      }
      return [...prev, fundId];
    });
  };

  // Comparison metrics
  const comparisonMetrics = [
    { key: "returns1Y", label: "1-Year Return", format: (v: any) => `${v?.toFixed(2) ?? "—"}%`, higherBetter: true },
    { key: "returns3Y", label: "3-Year Return", format: (v: any) => `${v?.toFixed(2) ?? "—"}%`, higherBetter: true },
    { key: "navKobo", label: "NAV", format: (v: any) => formatKobo(v ?? 0), higherBetter: false },
    { key: "minInvestmentKobo", label: "Min Investment", format: (v: any) => formatKobo(v ?? 0), higherBetter: false },
    { key: "riskLevel", label: "Risk Level", format: (v: any) => v ?? "—", higherBetter: false, isRisk: true },
    { key: "category", label: "Category", format: (v: any) => v ?? "—", higherBetter: false, isText: true },
    { key: "expenseRatio", label: "Expense Ratio", format: (v: any) => `${v?.toFixed(2) ?? "—"}%`, higherBetter: false },
    { key: "aum", label: "AUM", format: (v: any) => (v ? `₦${(v / 1e9).toFixed(1)}B` : "—"), higherBetter: true },
  ];

  const getBestIdx = (metric: any, funds: any[]) => {
    if (metric.isText || metric.isRisk) return -1;
    const values = funds.map((f) => f[metric.key] ?? null);
    if (values.every((v) => v === null)) return -1;
    const valid = values.map((v, i) => ({ v, i })).filter((x) => x.v !== null);
    if (metric.higherBetter) {
      return valid.reduce((best, cur) => (cur.v > best.v ? cur : best)).i;
    } else {
      return valid.reduce((best, cur) => (cur.v < best.v ? cur : best)).i;
    }
  };

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <PieChart className="h-8 w-8 text-blue-500" />
          <div>
            <h1 className="text-2xl font-bold">Mutual Funds</h1>
            <p className="text-muted-foreground">Invest in diversified mutual fund portfolios</p>
          </div>
        </div>
        {compareList.length > 0 && (
          <Button
            variant="outline"
            className="gap-2"
            onClick={() => setActiveTab("compare")}
          >
            <GitCompare className="h-4 w-4" />
            Compare ({compareList.length})
          </Button>
        )}
      </div>

      {/* Portfolio Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Invested</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              {formatKobo(portfolio?.totalInvestedKobo ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Current Value</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold text-green-600">
              {formatKobo(portfolio?.currentValueKobo ?? 0)}
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Returns</CardTitle>
          </CardHeader>
          <CardContent>
            <div
              className={`text-2xl font-bold ${
                (portfolio?.returnsKobo ?? 0) >= 0 ? "text-green-600" : "text-red-600"
              }`}
            >
              {(portfolio?.returnsKobo ?? 0) >= 0 ? "+" : ""}
              {formatKobo(portfolio?.returnsKobo ?? 0)}
            </div>
            <Badge variant="outline" className="text-xs mt-1">
              {portfolio?.pnlPct?.toFixed(2) ?? "0.00"}% return
            </Badge>
          </CardContent>
        </Card>
      </div>

      {/* Tabs: Browse | Compare | Holdings */}
      <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as any)}>
        <TabsList>
          <TabsTrigger value="browse">Browse Funds</TabsTrigger>
          <TabsTrigger value="compare" className="gap-1">
            <GitCompare className="h-3.5 w-3.5" />
            Compare
            {compareList.length > 0 && (
              <Badge className="ml-1 h-4 w-4 p-0 text-[10px] flex items-center justify-center">
                {compareList.length}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="holdings">My Holdings</TabsTrigger>
        </TabsList>

        {/* ── Browse Tab ── */}
        <TabsContent value="browse">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>Available Funds</span>
                <span className="text-sm font-normal text-muted-foreground">
                  Click <GitCompare className="h-3.5 w-3.5 inline" /> to add to comparison
                </span>
              </CardTitle>
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
                        selectedFund === fund.fundId
                          ? "border-primary bg-primary/5"
                          : "hover:border-primary/50"
                      }`}
                      onClick={() =>
                        setSelectedFund(fund.fundId === selectedFund ? null : fund.fundId)
                      }
                    >
                      <div className="flex justify-between items-start">
                        <div className="flex-1">
                          <div className="flex items-center gap-2">
                            <div className="font-medium">{fund.name}</div>
                            {compareList.includes(fund.fundId) && (
                              <Badge className="text-[10px] h-4 bg-blue-100 text-blue-700">
                                In comparison
                              </Badge>
                            )}
                          </div>
                          <div className="text-sm text-muted-foreground">{fund.category}</div>
                        </div>
                        <div className="flex items-center gap-2">
                          <div className="text-right">
                            <div className="font-bold text-green-600">
                              {fund.returns1Y?.toFixed(2)}% p.a.
                            </div>
                            <Badge className={`text-xs ${riskColor[fund.riskLevel] ?? ""}`}>
                              {fund.riskLevel} risk
                            </Badge>
                          </div>
                          <Button
                            size="icon"
                            variant={compareList.includes(fund.fundId) ? "default" : "outline"}
                            className="h-8 w-8 shrink-0"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleCompare(fund.fundId);
                            }}
                            title="Add to comparison"
                          >
                            <GitCompare className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                      <div className="mt-2 text-xs text-muted-foreground">
                        NAV: {formatKobo(fund.navKobo ?? 0)} | Min:{" "}
                        {formatKobo(fund.minInvestmentKobo ?? 0)}
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
                                investMutation.mutate({
                                  fundId: fund.fundId,
                                  amountKobo: parseFloat(investAmount) * 100,
                                });
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
                                redeemMutation.mutate({
                                  fundId: fund.fundId,
                                  units: parseFloat(redeemUnits),
                                });
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
        </TabsContent>

        {/* ── Compare Tab ── */}
        <TabsContent value="compare">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span className="flex items-center gap-2">
                  <GitCompare className="h-5 w-5" /> Side-by-Side Comparison
                </span>
                {compareList.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    aria-label="Close" onClick={() => setCompareList([])}
                    className="text-muted-foreground"
                  ><X/> Clear all
                  </Button>
                )}
              </CardTitle>
            </CardHeader>
            <CardContent>
              {compareFunds.length === 0 ? (
                <div className="text-center py-12 space-y-3">
                  <GitCompare className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">
                    No funds selected for comparison.
                  </p>
                  <p className="text-sm text-muted-foreground">
                    Go to <strong>Browse Funds</strong> and click the{" "}
                    <GitCompare className="h-3.5 w-3.5 inline" /> icon on up to 3 funds.
                  </p>
                  <Button variant="outline" onClick={() => setActiveTab("browse")}>
                    Browse Funds
                  </Button>
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b">
                        <th className="text-left py-3 pr-4 font-medium text-muted-foreground w-36">
                          Metric
                        </th>
                        {compareFunds.map((f: any) => (
                          <th key={f.fundId} className="text-center py-3 px-4 min-w-[160px]">
                            <div className="font-semibold">{f.name}</div>
                            <div className="text-xs text-muted-foreground font-normal">
                              {f.category}
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-5 text-xs text-muted-foreground mt-1"
                              aria-label="Close" onClick={() => toggleCompare(f.fundId)}
                            ><X/> Remove
                            </Button>
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {comparisonMetrics.map((metric) => {
                        const bestIdx = getBestIdx(metric, compareFunds);
                        return (
                          <tr key={metric.key} className="border-b last:border-0 hover:bg-muted/30">
                            <td className="py-3 pr-4 text-muted-foreground font-medium">
                              {metric.label}
                            </td>
                            {compareFunds.map((f: any, idx: number) => {
                              const val = f[metric.key];
                              const isBest = bestIdx === idx;
                              return (
                                <td key={f.fundId} className="text-center py-3 px-4">
                                  <span
                                    className={`inline-flex items-center gap-1 ${
                                      isBest
                                        ? "font-semibold text-green-700"
                                        : ""
                                    }`}
                                  >
                                    {metric.isRisk ? (
                                      <Badge
                                        className={`text-xs ${riskColor[val] ?? ""}`}
                                      >
                                        {val ?? "—"}
                                      </Badge>
                                    ) : (
                                      metric.format(val)
                                    )}
                                    {isBest && !metric.isText && !metric.isRisk && (
                                      <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                                    )}
                                  </span>
                                </td>
                              );
                            })}
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>

                  {/* Legend */}
                  <div className="mt-4 flex items-center gap-2 text-xs text-muted-foreground">
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-600" />
                    <span>Best value in category</span>
                    <Info className="h-3.5 w-3.5 ml-4" />
                    <span>Lower expense ratio and minimum investment are better</span>
                  </div>

                  {/* Invest from comparison */}
                  <div className="mt-6 pt-4 border-t">
                    <p className="text-sm font-medium mb-3">Quick Invest from Comparison</p>
                    <div className="flex flex-wrap gap-2">
                      {compareFunds.map((f: any) => (
                        <Button
                          key={f.fundId}
                          size="sm"
                          variant="outline"
                          onClick={() => {
                            setSelectedFund(f.fundId);
                            setActiveTab("browse");
                          }}
                        >
                          <TrendingUp className="h-3.5 w-3.5 mr-1" />
                          Invest in {f.name}
                        </Button>
                      ))}
                    </div>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── Holdings Tab ── */}
        <TabsContent value="holdings">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" /> My Holdings
              </CardTitle>
            </CardHeader>
            <CardContent>
              {!portfolio?.investments?.length ? (
                <div className="text-center py-12 space-y-3">
                  <AlertCircle className="h-12 w-12 text-muted-foreground mx-auto" />
                  <p className="text-muted-foreground">No holdings yet.</p>
                  <Button variant="outline" onClick={() => setActiveTab("browse")}>
                    Browse Funds
                  </Button>
                </div>
              ) : (
                <div className="space-y-2">
                  {portfolio?.investments.map((h: any, i: number) => (
                    <div
                      key={i}
                      className="flex justify-between items-center py-3 px-4 rounded-lg border hover:bg-muted/30"
                    >
                      <div>
                        <div className="font-medium">{h.fundName}</div>
                        <div className="text-sm text-muted-foreground">
                          {h.units?.toFixed(4)} units
                        </div>
                      </div>
                      <div className="text-right">
                        <div className="font-medium">{formatKobo(h.currentValueKobo ?? 0)}</div>
                        <div
                          className={`text-xs ${
                            (h.gainLossKobo ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                          }`}
                        >
                          {(h.gainLossKobo ?? 0) >= 0 ? "+" : ""}
                          {formatKobo(h.gainLossKobo ?? 0)} (
                          {h.gainLossPercent?.toFixed(2) ?? "0.00"}%)
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
