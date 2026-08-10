import { useState, useEffect } from "react";
import { TrendingUp, TrendingDown, Sparkles, Info, ChevronRight, RefreshCw } from "lucide-react";
import {
  AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, ReferenceLine
} from "recharts";
import { Badge } from "@/components/ui/badge";

// Simulate historical + forecast data
const generateData = () => {
  const months = ["Sep", "Oct", "Nov", "Dec", "Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug"];
  const base = [2.1, 2.4, 2.8, 3.6, 3.1, 2.9, 3.4, null, null, null, null, null];
  const forecast = [null, null, null, null, null, null, 3.4, 3.7, 4.1, 4.5, 4.8, 5.2];
  const lower = [null, null, null, null, null, null, 3.4, 3.4, 3.7, 4.0, 4.2, 4.5];
  const upper = [null, null, null, null, null, null, 3.4, 4.0, 4.5, 5.0, 5.4, 5.9];
  return months.map((m, i) => ({ month: m, actual: base[i], forecast: forecast[i], lower: lower[i], upper: upper[i] }));
};

const DRIVERS = [
  { label: "Transaction Volume Growth", impact: "+12.4%", positive: true },
  { label: "New Merchant Activations", impact: "+8.1%", positive: true },
  { label: "BNPL Adoption Rate", impact: "+6.7%", positive: true },
  { label: "Seasonal Adjustment (Q3)", impact: "-2.3%", positive: false },
  { label: "FX Rate Headwinds (NGN)", impact: "-1.8%", positive: false },
];

const CustomTooltip = ({ active, payload, label }: any) => {
  if (!active || !payload?.length) return null;
  return (
    <div className="bg-card border border-border rounded-xl p-3 shadow-lg text-xs space-y-1.5">
      <p className="font-semibold text-sm">{label}</p>
      {payload.map((p: any) => p.value != null && (
        <div key={p.name} className="flex items-center justify-between gap-4">
          <span className="text-muted-foreground capitalize">{p.name === "actual" ? "Actual" : p.name === "forecast" ? "Forecast" : null}</span>
          {(p.name === "actual" || p.name === "forecast") && (
            <span className="font-mono font-semibold" style={{ color: p.color }}>₦{p.value}M</span>
          )}
        </div>
      ))}
    </div>
  );
};

export default function RevenueForecast() {
  const [data] = useState(generateData);
  const [loading, setLoading] = useState(false);
  const [confidence, setConfidence] = useState(87);
  const [refreshing, setRefreshing] = useState(false);

  const handleRefresh = () => {
    setRefreshing(true);
    setTimeout(() => {
      setConfidence(Math.floor(Math.random() * 8) + 84);
      setRefreshing(false);
    }, 1400);
  };

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
            <p className="text-xs text-muted-foreground">Next 5 months projection</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Badge className="bg-violet-100 text-violet-700 border-0 text-xs">
            {confidence}% confidence
          </Badge>
          <button onClick={handleRefresh} className={`p-1.5 rounded-lg hover:bg-muted text-muted-foreground transition-colors ${refreshing ? "animate-spin" : ""}`}>
            <RefreshCw className="w-3.5 h-3.5" />
          </button>
        </div>
      </div>

      {/* Forecast Summary */}
      <div className="grid grid-cols-3 gap-3">
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Next Month</p>
          <p className="text-lg font-bold text-emerald-600" style={{ fontFamily: "Space Grotesk, sans-serif" }}>₦3.7M</p>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">+8.8%</span>
          </div>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Q3 2026</p>
          <p className="text-lg font-bold text-primary" style={{ fontFamily: "Space Grotesk, sans-serif" }}>₦12.4M</p>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <TrendingUp className="w-3 h-3 text-primary" />
            <span className="text-xs text-primary font-medium">+23.1%</span>
          </div>
        </div>
        <div className="bg-muted/50 rounded-xl p-3 text-center">
          <p className="text-xs text-muted-foreground mb-1">Full Year</p>
          <p className="text-lg font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>₦48.2M</p>
          <div className="flex items-center justify-center gap-1 mt-0.5">
            <TrendingUp className="w-3 h-3 text-emerald-500" />
            <span className="text-xs text-emerald-600 font-medium">+31.4%</span>
          </div>
        </div>
      </div>

      {/* Chart */}
      <div className="h-44">
        <ResponsiveContainer width="100%" height="100%">
          <AreaChart data={data} margin={{ top: 5, right: 5, left: -20, bottom: 0 }}>
            <defs>
              <linearGradient id="actualGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="forecastGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.25} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
              <linearGradient id="rangeGrad" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.1} />
                <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0} />
              </linearGradient>
            </defs>
            <CartesianGrid strokeDasharray="3 3" stroke="var(--border)" />
            <XAxis dataKey="month" tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} />
            <YAxis tick={{ fontSize: 10, fill: "var(--muted-foreground)" }} axisLine={false} tickLine={false} tickFormatter={v => `₦${v}M`} />
            <Tooltip content={<CustomTooltip />} />
            <ReferenceLine x="Mar" stroke="var(--border)" strokeDasharray="4 4" label={{ value: "Today", fontSize: 10, fill: "var(--muted-foreground)" }} />
            <Area type="monotone" dataKey="upper" stroke="none" fill="url(#rangeGrad)" connectNulls />
            <Area type="monotone" dataKey="lower" stroke="none" fill="white" connectNulls />
            <Area type="monotone" dataKey="actual" stroke="#3b82f6" strokeWidth={2} fill="url(#actualGrad)" dot={false} connectNulls />
            <Area type="monotone" dataKey="forecast" stroke="#8b5cf6" strokeWidth={2} strokeDasharray="5 3" fill="url(#forecastGrad)" dot={false} connectNulls />
          </AreaChart>
        </ResponsiveContainer>
      </div>

      {/* Legend */}
      <div className="flex items-center gap-4 text-xs text-muted-foreground">
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-blue-500 inline-block" />Actual</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-0.5 bg-violet-500 inline-block border-dashed border-t border-violet-500" style={{ borderStyle: "dashed" }} />Forecast</span>
        <span className="flex items-center gap-1.5"><span className="w-4 h-3 bg-violet-100 rounded inline-block" />Confidence range</span>
      </div>

      {/* Key Drivers */}
      <div>
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2">Key Forecast Drivers</p>
        <div className="space-y-1.5">
          {DRIVERS.map(d => (
            <div key={d.label} className="flex items-center justify-between py-1.5 px-3 rounded-lg hover:bg-muted/50 transition-colors">
              <span className="text-xs text-muted-foreground">{d.label}</span>
              <span className={`text-xs font-semibold font-mono ${d.positive ? "text-emerald-600" : "text-red-500"}`}>{d.impact}</span>
            </div>
          ))}
        </div>
      </div>

      <div className="flex items-center gap-1.5 text-xs text-muted-foreground bg-muted/50 rounded-lg px-3 py-2">
        <Info className="w-3.5 h-3.5 flex-shrink-0" />
        <span>Forecast uses a gradient boosting model trained on 24 months of transaction data, seasonal patterns, and market signals.</span>
      </div>
    </div>
  );
}
