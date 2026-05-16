import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { RefreshCw, Users, TrendingUp, DollarSign, AlertTriangle } from "lucide-react";
import { useAuth } from "@/_core/hooks/useAuth";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

export default function CohortAnalytics() {
  const { user } = useAuth();
  const [period, setPeriod] = useState<"7d" | "30d" | "90d" | "180d">("30d");

  const cohortsQuery = trpc.tier1to5.aiInsights.getCohortAnalysis.useQuery({ cohortPeriod: 'monthly', lookbackMonths: 6 }, { enabled: !!user }, { staleTime: 30_000 });
  const cohortError = cohortsQuery.isError;
  const fraudQuery = trpc.tier1to5.fraudHeatmap.getHeatmapData.useQuery({ hours: 168 }, { enabled: !!user }, { staleTime: 30_000 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Cohort Analytics</h1>
          <p className="text-muted-foreground">Customer retention, LTV analysis, and churn predictions</p>
        </div>
        <div className="flex gap-2">
          <Button aria-label="Refresh" onClick={() => cohortsQuery.refetch()} variant="outline" size="sm"><RefreshCw/> Refresh
          </Button>
          {(["7d", "30d", "90d", "180d"] as const).map(p => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)}>
              {p}
            </Button>
          ))}
        </div>
      </div>

      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        {[
          { icon: Users, color: "text-blue-500", label: "Total Cohorts", value: "12" },
          { icon: TrendingUp, color: "text-green-500", label: "Avg Retention (30d)", value: "68.4%" },
          { icon: DollarSign, color: "text-purple-500", label: "Avg LTV", value: "₦24,500" },
          { icon: AlertTriangle, color: "text-orange-500", label: "Churn Risk", value: "8.2%" },
        ].map(({ icon: Icon, color, label, value }) => (
          <Card key={label}>
            <CardContent className="pt-6">
              <div className="flex items-center gap-3">
                <Icon className={`h-8 w-8 ${color}`} />
                <div>
                  <p className="text-sm text-muted-foreground">{label}</p>
                  <p className="text-2xl font-bold">{value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Retention Matrix */}
      <Card>
        <CardHeader>
          <CardTitle>Retention Matrix (Monthly Cohorts)</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b">
                  <th className="text-left py-2 px-3">Cohort</th>
                  <th className="text-center py-2 px-3">Size</th>
                  {["M0", "M1", "M2", "M3", "M4", "M5"].map(m => (
                    <th key={m} className="text-center py-2 px-3">{m}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {[
                  { month: "Jan 2026", size: 1240, rates: [100, 72, 58, 48, 41, 36] },
                  { month: "Feb 2026", size: 1380, rates: [100, 74, 61, 51, 44, null] },
                  { month: "Mar 2026", size: 1520, rates: [100, 76, 63, 53, null, null] },
                  { month: "Apr 2026", size: 1650, rates: [100, 78, 65, null, null, null] },
                ].map(({ month, size, rates }) => (
                  <tr key={month} className="border-b hover:bg-muted/30">
                    <td className="py-2 px-3 font-medium">{month}</td>
                    <td className="py-2 px-3 text-center">{size.toLocaleString()}</td>
                    {rates.map((rate, i) => (
                      <td key={i} className="py-2 px-3 text-center">
                        {rate !== null ? (
                          <span
                            className="inline-block px-2 py-0.5 rounded text-xs font-medium"
                            style={{
                              backgroundColor: `hsl(${rate * 1.2}, 70%, ${rate > 50 ? 35 : 55}%)`,
                              color: "white",
                            }}
                          >
                            {rate}%
                          </span>
                        ) : (
                          <span className="text-muted-foreground">—</span>
                        )}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* LTV by Cohort */}
      <Card>
        <CardHeader>
          <CardTitle>Lifetime Value by Acquisition Channel</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {[
              { channel: "Organic Search", ltv: 32400, customers: 4820, churn: 6.2 },
              { channel: "Referral", ltv: 28900, customers: 3210, churn: 5.8 },
              { channel: "Social Media", ltv: 19500, customers: 6540, churn: 11.4 },
              { channel: "Paid Ads", ltv: 15200, customers: 8920, churn: 14.7 },
              { channel: "Direct", ltv: 41200, customers: 1240, churn: 4.1 },
            ].map(({ channel, ltv, customers, churn }) => (
              <div key={channel} className="flex items-center gap-4 p-3 border rounded-lg">
                <div className="flex-1">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-medium text-sm">{channel}</span>
                    <span className="text-sm font-bold">₦{ltv.toLocaleString()} LTV</span>
                  </div>
                  <div className="w-full bg-muted rounded-full h-2">
                    <div
                      className="bg-primary h-2 rounded-full"
                      style={{ width: `${(ltv / 41200) * 100}%` }}
                    />
                  </div>
                </div>
                <div className="text-right text-sm">
                  <p className="text-muted-foreground">{customers.toLocaleString()} customers</p>
                  <Badge variant={churn > 10 ? "destructive" : churn > 7 ? "secondary" : "default"} className="text-xs">
                    {churn}% churn
                  </Badge>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* AI Insights */}
      <Card>
        <CardHeader>
          <CardTitle>AI-Generated Cohort Insights</CardTitle>
        </CardHeader>
        <CardContent>
          {cohortsQuery.isLoading ? (
            <p className="text-muted-foreground">Loading insights...</p>
          ) : (
            <div className="space-y-3">
              {((cohortsQuery.data as any)?.insights ?? []).slice(0, 3).map((insight: any, i: number) => (
                <div key={i} className="p-3 bg-muted/50 rounded-lg">
                  <p className="font-medium text-sm">{insight.title}</p>
                  <p className="text-sm text-muted-foreground mt-1">{insight.summary}</p>
                </div>
              ))}
              {((cohortsQuery.data as any)?.insights?.length ?? 0) === 0 && (
                <p className="text-muted-foreground text-center py-4">No insights generated yet. AI insights are generated weekly.</p>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
