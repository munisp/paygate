import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, MapPin, TrendingUp, AlertTriangle, Clock } from "lucide-react";
import { BridgeEmptyState } from "@/components/BridgeEmptyState";

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN" }).format(kobo / 100);
}

export default function FraudHeatmap() {
  const [period, setPeriod] = useState("last_7_days");
  const [fraudType, setFraudType] = useState("all");

  const hours = period === 'last_24h' ? 24 : period === 'last_7_days' ? 168 : 168;
  const { data: heatmapData, isLoading, isError, refetch } = trpc.tier1to5.fraudHeatmap.getHeatmapData.useQuery({ hours }, { staleTime: 30_000 });
  const { data: clusters } = trpc.tier1to5.fraudHeatmap.getClusters.useQuery({ hours, radiusKm: 5 }, { staleTime: 30_000 });
  const { data: velocity } = trpc.tier1to5.fraudHeatmap.getVelocityByRegion.useQuery({ hours }, { staleTime: 30_000 });
  const { data: forecast } = trpc.tier1to5.aiInsights.getSettlementForecast.useQuery({ forecastDays: 7 }, { staleTime: 30_000 });

  const riskColor = (score: number) => {
    if (score < 30) return "bg-green-100 text-green-800";
    if (score < 60) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  if (!isLoading && !heatmapData) {
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
            <h1 className="text-2xl font-bold">Fraud Heatmap & Settlement Forecast</h1>
            <p className="text-muted-foreground text-sm mt-1">ML clustering with Fluvio streaming + predictive settlement forecasting</p>
          </div>
          <div className="flex gap-2">
            <Select value={period} onValueChange={setPeriod}>
              <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="last_24h">Last 24h</SelectItem>
                <SelectItem value="last_7_days">Last 7 Days</SelectItem>
                <SelectItem value="last_30_days">Last 30 Days</SelectItem>
              </SelectContent>
            </Select>
            <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/>Refresh</Button>
          </div>
        </div>

        {/* Heatmap Summary */}
        {isLoading ? (
          <div className="grid grid-cols-4 gap-4">{[1,2,3,4].map(i => <Card key={i} className="animate-pulse h-20" />)}</div>
        ) : heatmapData ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Total Fraud Attempts</p><p className="text-2xl font-bold text-red-600">{heatmapData.totalAttempts?.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Blocked</p><p className="text-2xl font-bold text-green-600">{heatmapData.blocked?.toLocaleString()}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Amount at Risk</p><p className="text-2xl font-bold">{formatNGN(heatmapData.amountAtRiskKobo ?? 0)}</p></CardContent></Card>
            <Card><CardContent className="p-4"><p className="text-xs text-muted-foreground">Hot Regions</p><p className="text-2xl font-bold">{heatmapData.hotRegions?.length ?? 0}</p></CardContent></Card>
          </div>
        ) : null}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Fraud Clusters */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><MapPin className="w-5 h-5 text-red-500" />Fraud Clusters</CardTitle>
              <CardDescription>ML-detected geographic fraud clusters</CardDescription>
            </CardHeader>
            <CardContent>
              {!clusters?.length ? (
                <div className="py-6 text-center text-muted-foreground text-sm">No significant clusters detected.</div>
              ) : (
                <div className="space-y-2">
                  {clusters.map((cluster: any, i: number) => (
                    <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                      <div>
                        <p className="font-medium text-sm">{cluster.region}</p>
                        <p className="text-xs text-muted-foreground">{cluster.count} incidents · {cluster.fraudType}</p>
                      </div>
                      <div className="flex items-center gap-2">
                        <span className={`px-2 py-0.5 rounded text-xs font-semibold ${riskColor(cluster.riskScore)}`}>
                          {cluster.riskScore}
                        </span>
                        <Badge variant="outline" className="text-xs">{cluster.trend}</Badge>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>

          {/* Velocity by Region */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2"><AlertTriangle className="w-5 h-5 text-orange-500" />Velocity by Region</CardTitle>
              <CardDescription>Transaction velocity anomalies by state</CardDescription>
            </CardHeader>
            <CardContent>
              {!velocity?.regions?.length ? (
                <div className="py-6 text-center text-muted-foreground text-sm">No velocity data available.</div>
              ) : (
                <div className="space-y-2">
                  {velocity.regions.slice(0, 8).map((r: any) => (
                    <div key={r.region} className="flex items-center gap-3">
                      <span className="text-sm w-24 truncate">{r.region}</span>
                      <div className="flex-1 bg-muted rounded-full h-2">
                        <div className={`h-2 rounded-full ${r.anomalyScore > 70 ? "bg-red-500" : r.anomalyScore > 40 ? "bg-yellow-500" : "bg-green-500"}`}
                          style={{ width: `${Math.min(r.anomalyScore, 100)}%` }} />
                      </div>
                      <span className="text-xs text-muted-foreground w-8 text-right">{r.anomalyScore}</span>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* Settlement Forecast */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><Clock className="w-5 h-5 text-primary" />Predictive Settlement Forecast</CardTitle>
            <CardDescription>ML model trained on historical settlement patterns and bank processing windows</CardDescription>
          </CardHeader>
          <CardContent>
            {!forecast?.forecasts?.length ? (
              <div className="py-6 text-center text-muted-foreground text-sm">No settlement forecast available.</div>
            ) : (
              <div className="space-y-2">
                {forecast.forecasts.map((f: any, i: number) => (
                  <div key={i} className="flex items-center justify-between p-3 bg-muted/30 rounded">
                    <div>
                      <p className="font-medium text-sm">{new Date(f.settlementDate).toLocaleDateString("en-NG", { weekday: "long", month: "short", day: "numeric" })}</p>
                      <p className="text-xs text-muted-foreground">Confidence: {f.confidencePct?.toFixed(0)}% · {f.bankingDay ? "Banking Day" : "Non-banking Day"}</p>
                    </div>
                    <div className="text-right">
                      <p className="font-bold">{formatNGN(f.expectedAmountKobo ?? 0)}</p>
                      <p className="text-xs text-muted-foreground">±{formatNGN(f.rangeKobo ?? 0)}</p>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </DashboardLayout>
  );
}
