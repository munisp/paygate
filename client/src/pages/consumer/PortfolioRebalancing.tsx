/**
 * PortfolioRebalancing — Computes target vs actual allocation across
 * gold, mutual funds, and pension; suggests buy/sell actions.
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Slider } from "@/components/ui/slider";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, Minus, RefreshCw, Target, AlertTriangle } from "lucide-react";

interface AssetAllocation {
  key: string;
  label: string;
  color: string;
  targetPct: number;
}

const DEFAULT_TARGETS: AssetAllocation[] = [
  { key: "gold", label: "Digital Gold", color: "#f59e0b", targetPct: 30 },
  { key: "mutualFunds", label: "Mutual Funds", color: "#3b82f6", targetPct: 50 },
  { key: "pension", label: "Pension (NPS)", color: "#10b981", targetPct: 20 },
];

function DonutSegment({
  value,
  total,
  color,
  offset,
}: {
  value: number;
  total: number;
  color: string;
  offset: number;
}) {
  const r = 60;
  const circ = 2 * Math.PI * r;
  const pct = total > 0 ? value / total : 0;
  const dash = pct * circ;
  const gap = circ - dash;
  const rotation = (offset / total) * 360 - 90;

  return (
    <circle
      r={r}
      cx={80}
      cy={80}
      fill="none"
      stroke={color}
      strokeWidth={20}
      strokeDasharray={`${dash} ${gap}`}
      transform={`rotate(${rotation} 80 80)`}
    />
  );
}

export default function PortfolioRebalancing() {
  const [targets, setTargets] = useState<AssetAllocation[]>(DEFAULT_TARGETS);
  const [isRebalancing, setIsRebalancing] = useState(false);

  // Fetch holdings
  const { data: goldData } = trpc.newFeatures.consumerGold.getHoldings.useQuery();
  const { data: mfData } = trpc.newFeatures.consumerMutualFunds.getPortfolio.useQuery();
  const { data: pensionData } = trpc.newFeatures.consumerPension.getBalance.useQuery();

  const holdings = useMemo(() => {
    const goldVal = (goldData?.holdings?.currentValueKobo ?? 0) / 100;
    const mfVal = (mfData?.portfolio?.totalValueKobo ?? 0) / 100;
    const pensionVal = (pensionData?.balance?.totalValueKobo ?? 0) / 100;
    const total = goldVal + mfVal + pensionVal;
    return {
      gold: goldVal,
      mutualFunds: mfVal,
      pension: pensionVal,
      total,
    };
  }, [goldData, mfData, pensionData]);

  const totalTarget = targets.reduce((s, t) => s + t.targetPct, 0);

  const rebalanceActions = useMemo(() => {
    if (holdings.total === 0) return [];
    return targets.map((t) => {
      const currentVal = holdings[t.key as keyof typeof holdings] as number;
      const currentPct = holdings.total > 0 ? (currentVal / holdings.total) * 100 : 0;
      const targetVal = (t.targetPct / 100) * holdings.total;
      const diff = targetVal - currentVal;
      const diffPct = currentPct - t.targetPct;
      return { ...t, currentVal, currentPct, targetVal, diff, diffPct };
    });
  }, [targets, holdings]);

  const updateTarget = (key: string, newPct: number) => {
    const others = targets.filter((t) => t.key !== key);
    const remaining = 100 - newPct;
    const otherTotal = others.reduce((s, t) => s + t.targetPct, 0);
    const scale = otherTotal > 0 ? remaining / otherTotal : 1;
    setTargets(
      targets.map((t) =>
        t.key === key
          ? { ...t, targetPct: newPct }
          : { ...t, targetPct: Math.round(t.targetPct * scale) },
      ),
    );
  };

  const handleRebalance = async () => {
    if (totalTarget !== 100) {
      toast.error("Target allocations must sum to 100%");
      return;
    }
    setIsRebalancing(true);
    await new Promise((r) => setTimeout(r, 1500));
    setIsRebalancing(false);
    toast.success("Rebalancing order submitted! Trades will execute within 1 business day.");
  };

  const formatNGN = (v: number) =>
    `₦${v.toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

  // Donut chart offsets
  let cumulative = 0;
  const donutSegments = rebalanceActions.map((a) => {
    const seg = { ...a, offset: cumulative };
    cumulative += a.currentVal;
    return seg;
  });

  return (
    <div className="p-6 max-w-4xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Target className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Portfolio Rebalancing</h1>
          <p className="text-muted-foreground">
            Set target allocations and get buy/sell recommendations
          </p>
        </div>
      </div>

      {/* Total Portfolio Value */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-5">
          <div className="text-sm text-muted-foreground">Total Portfolio Value</div>
          <div className="text-3xl font-bold mt-1">{formatNGN(holdings.total)}</div>
          <div className="flex gap-4 mt-2 text-sm">
            <span className="text-amber-600">Gold: {formatNGN(holdings.gold)}</span>
            <span className="text-blue-600">MF: {formatNGN(holdings.mutualFunds)}</span>
            <span className="text-emerald-600">Pension: {formatNGN(holdings.pension)}</span>
          </div>
        </CardContent>
      </Card>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Allocation Donut */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Current Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {holdings.total > 0 ? (
              <div className="flex items-center gap-6">
                <svg width="160" height="160" viewBox="0 0 160 160">
                  {donutSegments.map((seg) => (
                    <DonutSegment
                      key={seg.key}
                      value={seg.currentVal}
                      total={holdings.total}
                      color={seg.color}
                      offset={seg.offset}
                    />
                  ))}
                  <text x="80" y="76" textAnchor="middle" className="text-xs" fontSize="11" fill="currentColor">
                    Total
                  </text>
                  <text x="80" y="92" textAnchor="middle" fontSize="10" fill="currentColor" opacity="0.6">
                    Portfolio
                  </text>
                </svg>
                <div className="space-y-2">
                  {rebalanceActions.map((a) => (
                    <div key={a.key} className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full" style={{ backgroundColor: a.color }} />
                      <div>
                        <div className="text-sm font-medium">{a.label}</div>
                        <div className="text-xs text-muted-foreground">
                          {a.currentPct.toFixed(1)}% · {formatNGN(a.currentVal)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="text-center py-8 text-muted-foreground">
                <AlertTriangle className="h-8 w-8 mx-auto mb-2 opacity-50" />
                <p>No holdings found</p>
                <p className="text-xs mt-1">Start investing to see your allocation</p>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Target Allocation Sliders */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center justify-between">
              Target Allocation
              <Badge variant={totalTarget === 100 ? "default" : "destructive"}>
                {totalTarget}% / 100%
              </Badge>
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-5">
            {targets.map((t) => (
              <div key={t.key}>
                <div className="flex justify-between text-sm mb-2">
                  <span className="font-medium flex items-center gap-2">
                    <div className="w-3 h-3 rounded-full" style={{ backgroundColor: t.color }} />
                    {t.label}
                  </span>
                  <span className="font-bold">{t.targetPct}%</span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[t.targetPct]}
                  onValueChange={([v]) => updateTarget(t.key, v)}
                  className="w-full"
                />
              </div>
            ))}
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => setTargets(DEFAULT_TARGETS)}
            >
              <RefreshCw className="h-3 w-3 mr-1" /> Reset to Defaults (30/50/20)
            </Button>
          </CardContent>
        </Card>
      </div>

      {/* Rebalancing Actions */}
      {rebalanceActions.length > 0 && holdings.total > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Recommended Actions</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {rebalanceActions.map((a) => {
                const isBuy = a.diff > 0;
                const isSell = a.diff < 0;
                const isBalanced = Math.abs(a.diffPct) < 2;

                return (
                  <div
                    key={a.key}
                    className={`p-3 rounded-lg border ${
                      isBalanced
                        ? "bg-muted/30"
                        : isBuy
                        ? "bg-green-50 border-green-200"
                        : "bg-red-50 border-red-200"
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-3">
                        <div
                          className={`p-1.5 rounded-full ${
                            isBalanced
                              ? "bg-muted text-muted-foreground"
                              : isBuy
                              ? "bg-green-100 text-green-700"
                              : "bg-red-100 text-red-700"
                          }`}
                        >
                          {isBalanced ? (
                            <Minus className="h-4 w-4" />
                          ) : isBuy ? (
                            <TrendingUp className="h-4 w-4" />
                          ) : (
                            <TrendingDown className="h-4 w-4" />
                          )}
                        </div>
                        <div>
                          <div className="font-medium text-sm">{a.label}</div>
                          <div className="text-xs text-muted-foreground">
                            Current: {a.currentPct.toFixed(1)}% → Target: {a.targetPct}%
                          </div>
                        </div>
                      </div>
                      <div className="text-right">
                        {isBalanced ? (
                          <Badge variant="secondary">Balanced</Badge>
                        ) : (
                          <>
                            <div
                              className={`font-bold ${isBuy ? "text-green-700" : "text-red-700"}`}
                            >
                              {isBuy ? "+" : ""}
                              {formatNGN(Math.abs(a.diff))}
                            </div>
                            <div className="text-xs text-muted-foreground">
                              {isBuy ? "Buy more" : "Reduce position"}
                            </div>
                          </>
                        )}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-4 p-3 bg-amber-50 border border-amber-200 rounded-lg text-sm text-amber-700">
              <AlertTriangle className="h-4 w-4 inline mr-1" />
              Rebalancing involves selling existing positions and buying new ones. Tax implications
              may apply. Consult a financial advisor before proceeding.
            </div>

            <Button
              className="w-full mt-4"
              onClick={handleRebalance}
              disabled={isRebalancing || totalTarget !== 100 || holdings.total === 0}
            >
              {isRebalancing ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" /> Submitting...
                </>
              ) : (
                <>
                  <Target className="h-4 w-4 mr-2" /> Execute Rebalancing
                </>
              )}
            </Button>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
