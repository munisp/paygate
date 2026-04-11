import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TrendingUp, TrendingDown, Minus, Calendar, DollarSign, BarChart3 } from "lucide-react";

function formatNGN(kobo: number) {
  return `₦${(kobo / 100).toLocaleString("en-NG", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function SettlementForecast() {
  const [days, setDays] = useState(30);

  const { data: forecast, isLoading } = trpc.tier6to8.settlementForecast.getForecast.useQuery({ days });

  const TrendIcon = forecast?.trend === "up" ? TrendingUp : forecast?.trend === "down" ? TrendingDown : Minus;
  const trendColor = forecast?.trend === "up" ? "text-green-600" : forecast?.trend === "down" ? "text-red-600" : "text-yellow-600";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Settlement Forecast</h1>
          <p className="text-muted-foreground">Predictive settlement timeline and cash flow projections</p>
        </div>
        <Select value={String(days)} onValueChange={(v: any) => setDays(Number(v))}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="7">Next 7 days</SelectItem>
            <SelectItem value="14">Next 14 days</SelectItem>
            <SelectItem value="30">Next 30 days</SelectItem>
            <SelectItem value="60">Next 60 days</SelectItem>
            <SelectItem value="90">Next 90 days</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {[1, 2, 3].map((i: any) => (
            <Card key={i} className="animate-pulse">
              <CardContent className="pt-6 h-24 bg-muted/20 rounded" />
            </Card>
          ))}
        </div>
      ) : forecast ? (
        <>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <DollarSign className="h-4 w-4" />
                  Total Expected ({days}d)
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNGN(forecast.totalExpectedKobo)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <BarChart3 className="h-4 w-4" />
                  Daily Average
                </CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{formatNGN(forecast.averageDailyKobo)}</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground flex items-center gap-2">
                  <TrendIcon className={`h-4 w-4 ${trendColor}`} />
                  Trend
                </CardTitle>
              </CardHeader>
              <CardContent>
                <Badge
                  variant={forecast.trend === "up" ? "default" : forecast.trend === "down" ? "destructive" : "secondary"}
                  className="text-sm capitalize"
                >
                  {forecast.trend}
                </Badge>
              </CardContent>
            </Card>
          </div>

          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calendar className="h-5 w-5" />
                Daily Forecast
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b">
                      <th className="text-left py-2 font-medium text-muted-foreground">Date</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Expected Amount</th>
                      <th className="text-right py-2 font-medium text-muted-foreground">Confidence</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(forecast.forecast || []).slice(0, 14).map((row: { date: string; expectedAmountKobo: number; confidenceScore: number }, i: number) => (
                      <tr key={i} className="border-b hover:bg-muted/30 transition-colors">
                        <td className="py-2">{row.date}</td>
                        <td className="py-2 text-right font-mono">{formatNGN(row.expectedAmountKobo)}</td>
                        <td className="py-2 text-right">
                          <Badge
                            variant={
                              row.confidenceScore >= 0.8 ? "default" : row.confidenceScore >= 0.6 ? "secondary" : "outline"
                            }
                          >
                            {Math.round(row.confidenceScore * 100)}%
                          </Badge>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
                {(forecast.forecast || []).length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No forecast data available yet.</p>
                )}
              </div>
            </CardContent>
          </Card>
        </>
      ) : (
        <Card>
          <CardContent className="pt-6 text-center text-muted-foreground">
            No forecast data available. Process more transactions to generate predictions.
          </CardContent>
        </Card>
      )}
    </div>
  );
}
