import { TrendingUp, TrendingDown, Sparkles, Info, RefreshCw, AlertCircle, Loader2 } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

const FORECAST_DAYS = 90;

const formatNairaM = (kobo: number) => `₦${(kobo / 100 / 1e6).toFixed(2)}M`;

const shortDate = (iso: string) => {
  const d = new Date(iso);
  if (isNaN(d.getTime())) return iso;
  return d.toLocaleDateString("en-NG", { month: "short", day: "numeric" });
};

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs space-y-1.5">
      <p className="font-semibold text-sm">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground">Forecast</span>
          <span className="font-mono font-semibold" style={{ color: p.color }}>{formatNairaM(p.value)}</span>
        </div>
      ))}
    </div>
  );
};

export default function RevenueForecast() {
  const { data, isLoading, isError, error, refetch, isFetching } =
    trpc.newFeatures.aiInsightsV2.getRevenueForecasting.useQuery(
      { days: FORECAST_DAYS },
      { staleTime: 60_000, retry: 1 }
    );

  const points = data?.forecast ?? [];
  const chartData = points.map(p => ({
    date: shortDate(p.date),
    forecast: p.revenueKobo,
    confidence: p.confidence,
  }));
  // Real aggregate confidence = mean of per-point confidences returned by the service
  const avgConfidence = points.length > 0
    ? Math.round(points.reduce((s, p) => s + p.confidence, 0) / points.length * (points[0].confidence <= 1 ? 100 : 1))
    : null;
  const next30Total = points.slice(0, 30).reduce((s, p) => s + p.revenueKobo, 0);
  const growth = (data?.growthTrend ?? "").toLowerCase();
  const trendingDown = growth.includes("down") || growth.includes("declin") || growth.includes("negativ");

  return (
    <div className="bg-card rounded-xl border border-border p-5 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg bg-violet-100 flex items-center justify-center">
            <Sparkles className="w-4 h-4 text-violet-600" />
          </div>
          <div>
            <h3 className="font-semibold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>AI Revenue Forecast</h3>
            <p className="text-xs text-muted-foreground">Next {FORECAST_DAYS} days projection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {avgConfidence != null && (
            <Badge className="bg-violet-100 text-violet-700 border-0 text-xs">
              {avgConfidence}% avg confidence
            </Badge>
          )}
          <button
            onClick={() => refetch()}
            disabled={isFetching}
            aria-label="Refresh forecast"
            className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors disabled:opacity-50"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${isFetching ? "animate-spin" : ""}`} />
          </button>
        </div>
      </div>

      {isLoading ? (
        <div className="flex flex-col items-center justify-center py-12 gap-3 text-muted-foreground">
          <Loader2 className="w-6 h-6 animate-spin" />
          <p className="text-xs">Generating revenue forecast…</p>
        </div>
      ) : isError ? (
        <div className="flex flex-col items-center justify-center py-10 gap-3 text-center">
          <AlertCircle className="w-6 h-6 text-red-500" />
          <p className="text-sm font-medium text-red-600">Forecast unavailable</p>
          <p className="text-xs text-muted-foreground max-w-xs">{error?.message ?? "The AI insights service could not be reached."}</p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>Retry</Button>
        </div>
      ) : chartData.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-10 gap-2 text-center">
          <Info className="w-6 h-6 text-muted-foreground" />
          <p className="text-sm font-medium">Not enough data to forecast</p>
          <p className="text-xs text-muted-foreground max-w-xs">A forecast will appear here once enough transaction history is available.</p>
        </div>
      ) : (
        <>
          {/* Forecast Summary */}
          <div className="grid grid-cols-3 gap-3">
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Next 30 Days</p>
              <p className="text-lg font-bold text-emerald-600" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{formatNairaM(next30Total)}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Next {FORECAST_DAYS} Days</p>
              <p className="text-lg font-bold text-primary" style={{ fontFamily: "Space Grotesk, sans-serif" }}>{formatNairaM(data?.totalForecastKobo ?? 0)}</p>
            </div>
            <div className="bg-muted/50 rounded-xl p-3 text-center">
              <p className="text-xs text-muted-foreground mb-1">Trend</p>
              <div className="flex items-center justify-center gap-1">
                {trendingDown
                  ? <TrendingDown className="w-4 h-4 text-red-500" />
                  : <TrendingUp className="w-4 h-4 text-emerald-500" />}
                <span className={`text-sm font-semibold capitalize ${trendingDown ? "text-red-600" : "text-emerald-600"}`}>
                  {data?.growthTrend ?? "—"}
                </span>
              </div>
            </div>
          </div>

          {/* Chart — real daily forecast points only */}
          <div className="h-44">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={chartData} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
                <defs>
                  <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                    <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
                <XAxis dataKey="date" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} interval={13} />
                <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={v => formatNairaM(v)} />
                <Tooltip content={<CustomTooltip />} />
                <Area type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} fill="url(#forecastGrad)" dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>

          {/* Seasonal factors returned by the service */}
          {(data?.seasonalFactors?.length ?? 0) > 0 && (
            <div>
              <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Seasonal Factors</p>
              <div className="space-y-1.5">
                {data!.seasonalFactors.map((f, i) => (
                  <div key={i} className="flex items-center py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
                    <span className="text-xs text-muted-foreground">{f}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
            <Info className="w-3.5 h-3.5 flex-shrink-0" />
            <span>Forecast generated by the AI insights service from your actual transaction history.</span>
          </div>
        </>
      )}
    </div>
  );
}
