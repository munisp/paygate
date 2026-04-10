import { useState } from "react";
import { trpc4 } from "@/lib/trpc4";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

export default function WealthManagement() {
  const [goalName, setGoalName] = useState("");
  const [goalTarget, setGoalTarget] = useState("");
  const [goalDate, setGoalDate] = useState("");

  const { data: portfolio } = trpc4.wealthManagement.getPortfolioSummary.useQuery();
  const { data: riskProfile } = trpc4.wealthManagement.getRiskProfile.useQuery();
  const { data: recommendations } = trpc4.wealthManagement.getRecommendations.useQuery();
  const { data: goals } = trpc4.wealthManagement.getGoals.useQuery();

  const createGoalMutation = trpc4.wealthManagement.createGoal.useMutation({
    onSuccess: (d) => toast.success(`Goal "${d.name}" created`),
    onError: (e) => toast.error(e.message),
  });

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const riskColors: Record<string, string> = { Conservative: "text-green-600", Moderate: "text-yellow-600", Aggressive: "text-red-600" };
  const assetColors = ["bg-blue-500", "bg-green-500", "bg-yellow-500", "bg-purple-500", "bg-orange-500", "bg-cyan-500"];

  return (
    <div className="p-6 space-y-6">
      <h1 className="text-2xl font-bold">Wealth Management</h1>

      {/* Portfolio Summary */}
      {portfolio && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          <Card className="md:col-span-1">
            <CardHeader><CardTitle className="text-base">Total Wealth</CardTitle></CardHeader>
            <CardContent>
              <p className="text-3xl font-bold">{formatKobo(portfolio.totalWealthKobo)}</p>
              <p className={`text-sm mt-1 ${portfolio.totalReturnKobo >= 0 ? "text-green-600" : "text-red-600"}`}>
                {portfolio.totalReturnKobo >= 0 ? "+" : ""}{formatKobo(portfolio.totalReturnKobo)} ({portfolio.totalReturnPct?.toFixed(1)}%)
              </p>
              <div className="mt-3">
                <p className="text-xs text-muted-foreground mb-1">Risk Profile</p>
                <Badge className={`${riskColors[portfolio.riskProfile] ?? "text-gray-600"} border`} variant="outline">{portfolio.riskProfile}</Badge>
              </div>
            </CardContent>
          </Card>
          <Card className="md:col-span-2">
            <CardHeader><CardTitle className="text-base">Asset Allocation</CardTitle></CardHeader>
            <CardContent>
              <div className="space-y-2">
                {portfolio.allocation?.map((a, i) => (
                  <div key={a.asset}>
                    <div className="flex justify-between text-xs mb-1">
                      <span className="font-medium">{a.asset}</span>
                      <span>{a.pct?.toFixed(1)}% — {formatKobo(a.valueKobo)}</span>
                    </div>
                    <div className="w-full bg-gray-100 rounded-full h-2">
                      <div className={`h-2 rounded-full ${assetColors[i % assetColors.length]}`} style={{ width: `${a.pct}%` }} />
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Risk Profile */}
      {riskProfile && (
        <Card>
          <CardHeader><CardTitle className="text-base">Risk Profile: <span className={riskColors[riskProfile.profile] ?? ""}>{riskProfile.profile}</span></CardTitle></CardHeader>
          <CardContent>
            <div className="flex items-center gap-4 mb-3">
              <div className="w-16 h-16 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center">
                <span className="text-white text-xl font-bold">{riskProfile.score}</span>
              </div>
              <div>
                <p className="text-sm font-medium">Risk Score: {riskProfile.score}/100</p>
                <p className="text-xs text-muted-foreground">Based on your investment preferences</p>
              </div>
            </div>
            <div className="flex flex-wrap gap-2">
              {riskProfile.recommendations?.map((r, i) => <Badge key={i} variant="secondary">{r}</Badge>)}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Recommendations */}
      <Card>
        <CardHeader><CardTitle>Investment Recommendations</CardTitle></CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {recommendations?.recommendations?.map((r, i) => (
              <div key={i} className="p-3 border rounded-lg">
                <div className="flex justify-between items-start mb-1">
                  <p className="font-semibold text-sm">{r.name}</p>
                  <Badge variant="outline">{r.type}</Badge>
                </div>
                <p className="text-xs text-muted-foreground mb-2">{r.description}</p>
                <div className="flex justify-between text-xs">
                  <span>Expected: <strong className="text-green-600">+{r.expectedReturnPct}%</strong></span>
                  <span>Risk: <strong>{r.riskLevel}</strong></span>
                  <span>Min: <strong>{formatKobo(r.minInvestmentKobo)}</strong></span>
                </div>
              </div>
            ))}
            {!recommendations?.recommendations?.length && <p className="text-muted-foreground text-sm">No recommendations available</p>}
          </div>
        </CardContent>
      </Card>

      {/* Goals */}
      <Card>
        <CardHeader><CardTitle>Financial Goals</CardTitle></CardHeader>
        <CardContent className="space-y-4">
          {goals?.goals?.map(g => (
            <div key={g.goalId} className="p-3 border rounded-lg">
              <div className="flex justify-between items-start mb-2">
                <p className="font-semibold">{g.name}</p>
                <p className="text-sm font-bold">{g.progressPct?.toFixed(0)}%</p>
              </div>
              <div className="w-full bg-gray-100 rounded-full h-2 mb-2">
                <div className="h-2 rounded-full bg-blue-500" style={{ width: `${Math.min(g.progressPct, 100)}%` }} />
              </div>
              <div className="flex justify-between text-xs text-muted-foreground">
                <span>{formatKobo(g.currentAmountKobo)} / {formatKobo(g.targetAmountKobo)}</span>
                <span>Target: {new Date(g.targetDate).toLocaleDateString()}</span>
                <span>Monthly: {formatKobo(g.monthlyRequiredKobo)}</span>
              </div>
            </div>
          ))}
          {!goals?.goals?.length && <p className="text-muted-foreground text-sm">No goals set yet</p>}

          <div className="border-t pt-4 space-y-3">
            <p className="font-medium text-sm">Create New Goal</p>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <Input placeholder="Goal name" value={goalName} onChange={e => setGoalName(e.target.value)} />
              <Input placeholder="Target amount (₦)" value={goalTarget} onChange={e => setGoalTarget(e.target.value)} />
              <Input type="date" value={goalDate} onChange={e => setGoalDate(e.target.value)} />
            </div>
            <Button disabled={createGoalMutation.isPending}
              onClick={() => createGoalMutation.mutate({ name: goalName, targetAmountKobo: Math.round(parseFloat(goalTarget) * 100), targetDate: goalDate })}>
              {createGoalMutation.isPending ? "Creating..." : "Create Goal"}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
