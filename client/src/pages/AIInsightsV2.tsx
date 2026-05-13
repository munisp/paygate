import { useState } from "react";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";

export default function AIInsightsV2() {
  const [period, setPeriod] = useState<"today" | "week" | "month" | "quarter">("week");
  const [forecastDays, setForecastDays] = useState(30);

  const { data: summary, isLoading: summaryLoading, error } = trpc.newFeatures.aiInsightsV2.getSmartSummary.useQuery({ period });
  const { data: anomalies } = trpc.newFeatures.aiInsightsV2.getAnomalyDetection.useQuery();
  const { data: forecast } = trpc.newFeatures.aiInsightsV2.getRevenueForecasting.useQuery({ days: forecastDays });
  const { data: segments } = trpc.newFeatures.aiInsightsV2.getCustomerSegmentation.useQuery();
  const { data: recommendations } = trpc.newFeatures.aiInsightsV2.getProductRecommendations.useQuery();

  const sentimentColors = { positive: "text-green-600", negative: "text-red-600", neutral: "text-gray-600" };
  const severityColors: Record<string, string> = { high: "bg-red-100 text-red-700", medium: "bg-yellow-100 text-yellow-700", low: "bg-blue-100 text-blue-700" };
  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 0 })}`;

  // Show error toast when queries fail
  if (error) {
    toast.error(error.message ?? "An error occurred");
  }
  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">AI Insights</h1>
        <div className="flex gap-1">
          {(["today", "week", "month", "quarter"] as const).map(p => (
            <Button key={p} size="sm" variant={period === p ? "default" : "outline"} onClick={() => setPeriod(p)} className="capitalize">{p}</Button>
          ))}
        </div>
      </div>

      {/* Smart Summary */}
      {summaryLoading ? (
        <Card><CardContent className="py-8 text-center text-muted-foreground">Generating AI insights...</CardContent></Card>
      ) : summary && (
        <>
          <Card className="bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <CardContent className="pt-6">
              <p className="text-lg font-semibold">{summary.headline}</p>
            </CardContent>
          </Card>

          {/* Key Metrics */}
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            {summary.keyMetrics?.map((m: any, i: any) => (
              <Card key={i}>
                <CardContent className="pt-4">
                  <p className="text-xs text-muted-foreground">{m.label}</p>
                  <p className="text-xl font-bold">{m.value}</p>
                  <p className={`text-xs font-medium ${sentimentColors[m.sentiment as keyof typeof sentimentColors]}`}>{m.change}</p>
                </CardContent>
              </Card>
            ))}
          </div>

          {/* Insights */}
          <Card>
            <CardHeader><CardTitle>AI Insights</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {summary.insights?.map((ins, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <Badge variant="outline" className="text-xs mb-1">{ins.category}</Badge>
                      <p className="text-sm">{ins.insight}</p>
                    </div>
                    {ins.actionable && ins.action && (
                      <Button size="sm" variant="outline" className="shrink-0 text-xs">{ins.action}</Button>
                    )}
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>

          {/* Next Best Actions */}
          <Card>
            <CardHeader><CardTitle>Next Best Actions</CardTitle></CardHeader>
            <CardContent className="space-y-2">
              {summary.nextBestActions?.sort((a: any, b: any) => a.priority - b.priority).map((action, i) => (
                <div key={i} className="flex items-center gap-3 p-3 border rounded-lg">
                  <div className="w-6 h-6 rounded-full bg-primary text-primary-foreground flex items-center justify-center text-xs font-bold shrink-0">{action.priority}</div>
                  <div className="flex-1">
                    <p className="text-sm font-medium">{action.action}</p>
                    <p className="text-xs text-green-600">{action.expectedImpact}</p>
                  </div>
                </div>
              ))}
            </CardContent>
          </Card>
        </>
      )}

      {/* Anomaly Detection */}
      {anomalies && (
        <Card>
          <CardHeader><CardTitle>Anomaly Detection</CardTitle></CardHeader>
          <CardContent>
            {!anomalies.anomalies?.length ? (
              <p className="text-green-600 text-sm">No anomalies detected. Your transactions look normal.</p>
            ) : (
              <div className="space-y-3">
                {anomalies.anomalies.map((a: any, i: any) => (
                  <div key={i} className="p-3 border rounded-lg">
                    <div className="flex items-start justify-between mb-1">
                      <p className="font-medium text-sm">{a.type}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${severityColors[a.severity] ?? "bg-gray-100 text-gray-700"}`}>{a.severity}</span>
                    </div>
                    <p className="text-xs text-muted-foreground">{a.description}</p>
                    <p className="text-xs text-muted-foreground mt-1">Affected: {formatKobo(a.affectedAmount)} · {new Date(a.detectedAt).toLocaleString()}</p>
                    {a.suggestedAction && <p className="text-xs text-blue-600 mt-1">→ {a.suggestedAction}</p>}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Revenue Forecast */}
      {forecast && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle>Revenue Forecast</CardTitle>
              <div className="flex gap-1">
                {[7, 30, 90].map(d => (
                  <Button key={d} size="sm" variant={forecastDays === d ? "default" : "outline"} onClick={() => setForecastDays(d)}>{d}d</Button>
                ))}
              </div>
            </div>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-3 gap-4 mb-4">
              <div><p className="text-xs text-muted-foreground">Total Forecast</p><p className="text-xl font-bold">{formatKobo(forecast.totalForecastKobo)}</p></div>
              <div><p className="text-xs text-muted-foreground">Growth Trend</p><p className="text-xl font-bold capitalize">{forecast.growthTrend}</p></div>
              <div><p className="text-xs text-muted-foreground">Data Points</p><p className="text-xl font-bold">{forecast.forecast?.length ?? 0}</p></div>
            </div>
            {forecast.seasonalFactors && (
              <div>
                <p className="text-xs text-muted-foreground mb-2">Seasonal Factors</p>
                <div className="flex flex-wrap gap-2">
                  {forecast.seasonalFactors.map((f: string, i: number) => <Badge key={i} variant="secondary">{f}</Badge>)}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      )}

      {/* Customer Segmentation */}
      {segments && (
        <Card>
          <CardHeader><CardTitle>Customer Segmentation</CardTitle></CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {segments.segments?.map((seg, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <p className="font-semibold text-sm">{seg.name}</p>
                  <p className="text-xs text-muted-foreground mb-2">{seg.description}</p>
                  <div className="grid grid-cols-2 gap-1 text-xs">
                    <span className="text-muted-foreground">Customers:</span><span className="font-medium">{seg.count.toLocaleString()}</span>
                    <span className="text-muted-foreground">Avg Spend:</span><span className="font-medium">{formatKobo(seg.avgSpendKobo)}</span>
                    <span className="text-muted-foreground">Retention:</span><span className="font-medium">{seg.retentionRate}%</span>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Product Recommendations */}
      {recommendations && (
        <Card>
          <CardHeader><CardTitle>Product Recommendations</CardTitle></CardHeader>
          <CardContent>
            <div className="space-y-3">
              {recommendations.recommendations?.map((rec, i) => (
                <div key={i} className="p-3 border rounded-lg">
                  <div className="flex items-start justify-between mb-1">
                    <p className="font-medium text-sm">{rec.productName}</p>
                    <Badge variant="outline">{rec.targetSegment}</Badge>
                  </div>
                  <p className="text-xs text-muted-foreground">{rec.reason}</p>
                  <p className="text-xs text-green-600 mt-1">Expected uplift: {rec.expectedUpliftPct}%</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
