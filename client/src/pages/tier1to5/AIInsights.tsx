import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, Brain, TrendingUp, Users, BarChart3, Lightbulb } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function AIInsights() {
  const [period, setPeriod] = useState("last_30_days");
  const [cohortBy, setCohortBy] = useState<"acquisition_channel" | "first_transaction_month" | "spending_tier">("first_transaction_month");

  const periodDays = period === 'last_7_days' ? 7 : period === 'last_30_days' ? 30 : period === 'last_90_days' ? 90 : 365;
  const { data: insights, isLoading, isError, refetch } = trpc.tier1to5.aiInsights.getInsights.useQuery({ periodDays });
  const { data: cohort } = trpc.tier1to5.aiInsights.getCohortAnalysis.useQuery({ cohortPeriod: 'monthly', lookbackMonths: 6 });

  if (!isLoading && !insights) {
    return (
      <DashboardLayout>
        <BridgeEmptyState
          variant="offline"
          onRetry={() => window.location.reload()}
        />
      </DashboardLayout>
    );
  }

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">AI Merchant Insights</h1>
            <p className="text-muted-foreground text-sm mt-1">LLM-powered business summaries with cohort & retention analytics from the lakehouse</p>
          </div>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-40"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
                <SelectItem value="last_90_days">Last 90 Days</SelectItem>
                <SelectItem value="this_year">This Year</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" onClick={() => refetch()}><RefreshCw className="w-4 h-4 mr-2" />Refresh</Button>
          </div>
        </div>

        {/* AI Summary */}
        {isLoading ? (
          <Card className="animate-pulse h-32" />
        ) : insights?.aiSummary ? (
          <Card className="border-primary/30 bg-primary/5">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-primary">
                <Brain className="w-5 h-5" />AI Business Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <p className="text-sm leading-relaxed">{insights.aiSummary}</p>
            </CardContent>
          </Card>
        ) : null}

        {/* KPI Cards */}
        {insights && (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Revenue</p>
                <p className="text-2xl font-bold">{formatNGN(insights.revenueKobo ?? 0)}</p>
                <p className={`text-xs mt-1 ${(insights.revenueGrowthPct ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                  {(insights.revenueGrowthPct ?? 0) >= 0 ? "+" : ""}{insights.revenueGrowthPct?.toFixed(1)}% vs prev period
                </p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Transactions</p>
                <p className="text-2xl font-bold">{insights.transactionCount?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">Avg: {formatNGN(insights.avgTransactionKobo ?? 0)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Active Customers</p>
                <p className="text-2xl font-bold">{insights.activeCustomers?.toLocaleString()}</p>
                <p className="text-xs text-muted-foreground mt-1">New: {insights.newCustomers?.toLocaleString()}</p>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <p className="text-xs text-muted-foreground">Churn Rate</p>
                <p className={`text-2xl font-bold ${(insights.churnRate ?? 0) > 10 ? "text-red-600" : "text-green-600"}`}>
                  {insights.churnRate?.toFixed(1)}%
                </p>
                <p className="text-xs text-muted-foreground mt-1">Retention: {(100 - (insights.churnRate ?? 0)).toFixed(1)}%</p>
              </CardContent>
            </Card>
          </div>
        )}

        {/* AI Recommendations */}
        {insights?.recommendations?.length ? (
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><Lightbulb className="w-5 h-5 text-yellow-500" />AI Recommendations</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                {insights.recommendations.map((rec: any, i: number) => (
                  <div key={i} className="flex items-start gap-3 p-3 bg-muted/30 rounded-lg">
                    <Badge variant="outline" className="shrink-0 mt-0.5">{rec.priority}</Badge>
                    <div>
                      <p className="font-medium text-sm">{rec.title}</p>
                      <p className="text-xs text-muted-foreground mt-1">{rec.description}</p>
                      {rec.expectedImpact && (
                        <p className="text-xs text-green-600 mt-1">Expected impact: {rec.expectedImpact}</p>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        ) : null}

        {/* Cohort Analysis */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2"><Users className="w-5 h-5 text-primary" />Cohort & Retention Analysis</CardTitle>
              <Select value={cohortBy} onValueChange={v => setCohortBy(v as any)}>
                <SelectTrigger className="w-52"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="first_transaction_month">By First Transaction Month</SelectItem>
                  <SelectItem value="acquisition_channel">By Acquisition Channel</SelectItem>
                  <SelectItem value="spending_tier">By Spending Tier</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            {!cohort?.cohorts?.length ? (
              <div className="py-8 text-center text-muted-foreground text-sm">No cohort data available for this period.</div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 pr-4 text-muted-foreground font-medium">Cohort</th>
                      <th className="text-right py-2 px-2 text-muted-foreground font-medium">Size</th>
                      {Array.from({ length: cohort.periods ?? 6 }, (_, i) => (
                        <th key={i} className="text-right py-2 px-2 text-muted-foreground font-medium">M{i + 1}</th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {cohort.cohorts.map((c: any) => (
                      <tr key={c.cohortKey} className="border-b hover:bg-muted/20">
                        <td className="py-2 pr-4 font-medium">{c.cohortKey}</td>
                        <td className="text-right py-2 px-2">{c.size?.toLocaleString()}</td>
                        {c.retentionByPeriod?.map((pct: number, i: number) => (
                          <td key={i} className="text-right py-2 px-2">
                            <span className={`px-1.5 py-0.5 rounded text-xs ${pct >= 50 ? "bg-green-100 text-green-800" : pct >= 25 ? "bg-yellow-100 text-yellow-800" : "bg-red-100 text-red-800"}`}>
                              {pct?.toFixed(0)}%
                            </span>
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
