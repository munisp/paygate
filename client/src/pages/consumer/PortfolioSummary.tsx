// @ts-nocheck
/**
 * PortfolioSummary — Unified holdings visualization across Gold, Mutual Funds, and Pensions.
 *
 * Shows:
 *   - Total net worth across all asset classes
 *   - Donut chart breakdown by asset class
 *   - Performance timeline (sparkline per asset)
 *   - Allocation table with gain/loss per holding
 *   - Quick-action buttons to each product page
 */
import { useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import {
  TrendingUp,
  TrendingDown,
  Coins,
  PieChart,
  Shield,
  BarChart3,
  ArrowRight,
  RefreshCw,
} from "lucide-react";
import { toast } from "sonner";
import { Link } from "wouter";

// ─── Helpers ──────────────────────────────────────────────────────────────────

const formatKobo = (k: number) =>
  `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

const formatPercent = (p: number) =>
  `${p >= 0 ? "+" : ""}${p.toFixed(2)}%`;

// Simple SVG donut chart
function DonutChart({
  segments,
}: {
  segments: { label: string; value: number; color: string }[];
}) {
  const total = segments.reduce((s, seg) => s + seg.value, 0);
  if (total === 0) return null;

  const radius = 40;
  const cx = 60;
  const cy = 60;
  const circumference = 2 * Math.PI * radius;

  let offset = 0;
  const arcs = segments.map((seg) => {
    const fraction = seg.value / total;
    const dash = fraction * circumference;
    const gap = circumference - dash;
    const arc = { ...seg, dash, gap, offset, fraction };
    offset += dash;
    return arc;
  });

  return (
    <svg viewBox="0 0 120 120" className="w-40 h-40">
      {arcs.map((arc, i) => (
        <circle
          key={i}
          cx={cx}
          cy={cy}
          r={radius}
          fill="none"
          stroke={arc.color}
          strokeWidth={18}
          strokeDasharray={`${arc.dash} ${arc.gap}`}
          strokeDashoffset={-arc.offset + circumference / 4}
          className="transition-all duration-500"
        />
      ))}
      {/* Center text */}
      <text x={cx} y={cy - 4} textAnchor="middle" fontSize="9" fill="currentColor" className="text-foreground font-semibold">
        Total
      </text>
      <text x={cx} y={cy + 8} textAnchor="middle" fontSize="7" fill="currentColor" className="text-muted-foreground">
        Holdings
      </text>
    </svg>
  );
}

// Tiny sparkline SVG
function Sparkline({ values, color }: { values: number[]; color: string }) {
  if (values.length < 2) return <span className="text-xs text-muted-foreground">—</span>;
  const min = Math.min(...values);
  const max = Math.max(...values);
  const range = max - min || 1;
  const w = 80;
  const h = 24;
  const pts = values
    .map((v, i) => {
      const x = (i / (values.length - 1)) * w;
      const y = h - ((v - min) / range) * h;
      return `${x},${y}`;
    })
    .join(" ");

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-20 h-6">
      <polyline points={pts} fill="none" stroke={color} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function PortfolioSummary() {
  // Fetch all three asset classes in parallel
  const { data: goldHoldings, isLoading: goldLoading, refetch: refetchGold } =
    trpc.newFeatures.digitalGold.getHoldings.useQuery();
  const { data: goldPrice, isError } = trpc.newFeatures.digitalGold.getPrice.useQuery();
  const { data: goldHistory } = trpc.newFeatures.digitalGold.getHistory.useQuery({ page: 1, limit: 30 }, { staleTime: 30_000 });

  const { data: mfPortfolio, isLoading: mfLoading, refetch: refetchMF } =
    trpc.newFeatures.mutualFunds.getPortfolio.useQuery();

  const { data: pensionData, isLoading: pensionLoading, refetch: refetchPension } =
    trpc.newFeatures.pension.makeContribution.useQuery();

  const isLoading = goldLoading || mfLoading || pensionLoading;

  // ── Compute totals ──────────────────────────────────────────────────────────

  const goldValueKobo = useMemo(() => {
    const grams = goldHoldings?.grams ?? 0;
    const pricePerGram = goldPrice?.buyPricePerGram ?? 0;
    return grams * pricePerGram;
  }, [goldHoldings, goldPrice]);

  const goldCostKobo = useMemo(() => {
    return (goldHoldings?.totalInvestedKobo ?? 0);
  }, [goldHoldings]);

  const mfValueKobo = mfPortfolio?.totalCurrentValueKobo ?? 0;
  const mfCostKobo = mfPortfolio?.totalInvestedKobo ?? 0;

  const pensionValueKobo = useMemo(() => {
    const contributions = pensionData?.contributions ?? [];
    return contributions.reduce((sum: number, c: any) => sum + (c.amountKobo ?? 0), 0);
  }, [pensionData]);

  const totalValueKobo = goldValueKobo + mfValueKobo + pensionValueKobo;
  const totalCostKobo = goldCostKobo + mfCostKobo + pensionValueKobo; // pension has no "cost" — use value
  const totalGainKobo = totalValueKobo - totalCostKobo;
  const totalGainPct = totalCostKobo > 0 ? (totalGainKobo / totalCostKobo) * 100 : 0;

  // ── Donut segments ──────────────────────────────────────────────────────────

  const segments = useMemo(
    () => [
      { label: "Digital Gold", value: goldValueKobo, color: "#F59E0B" },
      { label: "Mutual Funds", value: mfValueKobo, color: "#3B82F6" },
      { label: "Pension", value: pensionValueKobo, color: "#10B981" },
    ].filter((s) => s.value > 0),
    [goldValueKobo, mfValueKobo, pensionValueKobo],
  );

  // ── Gold sparkline from history ─────────────────────────────────────────────
  const goldSparkline = useMemo(
    () => (goldHistory?.history ?? []).map((h: any) => h.buyPricePerGram ?? 0).reverse(),
    [goldHistory],
  );

  // ── Asset rows ──────────────────────────────────────────────────────────────

  const assetRows = [
    {
      icon: <Coins className="h-5 w-5 text-amber-500" />,
      label: "Digital Gold",
      subtitle: `${(goldHoldings?.grams ?? 0).toFixed(4)}g`,
      valueKobo: goldValueKobo,
      costKobo: goldCostKobo,
      gainKobo: goldValueKobo - goldCostKobo,
      gainPct: goldCostKobo > 0 ? ((goldValueKobo - goldCostKobo) / goldCostKobo) * 100 : 0,
      sparkline: goldSparkline,
      sparkColor: "#F59E0B",
      href: "/consumer/gold",
      color: "text-amber-500",
    },
    {
      icon: <PieChart className="h-5 w-5 text-blue-500" />,
      label: "Mutual Funds",
      subtitle: `${(mfPortfolio?.investments ?? []).length} fund${(mfPortfolio?.investments ?? []).length !== 1 ? "s" : ""}`,
      valueKobo: mfValueKobo,
      costKobo: mfCostKobo,
      gainKobo: mfPortfolio?.totalPnlKobo ?? 0,
      gainPct: mfPortfolio?.totalPnlKobo ?? 0,
      sparkline: [],
      sparkColor: "#3B82F6",
      href: "/consumer/mutual-funds",
      color: "text-blue-500",
    },
    {
      icon: <Shield className="h-5 w-5 text-emerald-500" />,
      label: "Pension",
      subtitle: `${(pensionData?.contributions ?? []).length} contributions`,
      valueKobo: pensionValueKobo,
      costKobo: pensionValueKobo,
      gainKobo: 0,
      gainPct: 0,
      sparkline: [],
      sparkColor: "#10B981",
      href: "/consumer/pension",
      color: "text-emerald-500",
    },
  ];

  const refetchAll = () => {
    refetchGold();
    refetchMF();
    refetchPension();
  };

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <BarChart3 className="h-8 w-8 text-primary" />
          <div>
            <h1 className="text-2xl font-bold">Portfolio Summary</h1>
            <p className="text-muted-foreground">
              Your holdings across Gold, Mutual Funds, and Pension
            </p>
          </div>
        </div>
        <Button variant="outline" size="sm" aria-label="Refresh" onClick={refetchAll} disabled={isLoading}><RefreshCw/>
          Refresh
        </Button>
      </div>

      {/* Net Worth + Donut */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {/* Net worth card */}
        <Card className="flex flex-col justify-center">
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Total Portfolio Value</CardTitle>
          </CardHeader>
          <CardContent className="space-y-3">
            <div className="text-4xl font-bold">{formatKobo(totalValueKobo)}</div>
            <div className="flex items-center gap-2">
              {totalGainKobo >= 0 ? (
                <TrendingUp className="h-4 w-4 text-green-600" />
              ) : (
                <TrendingDown className="h-4 w-4 text-red-600" />
              )}
              <span
                className={`font-semibold ${
                  totalGainKobo >= 0 ? "text-green-600" : "text-red-600"
                }`}
              >
                {formatKobo(Math.abs(totalGainKobo))} ({formatPercent(totalGainPct)})
              </span>
              <span className="text-xs text-muted-foreground">overall return</span>
            </div>
            <div className="text-sm text-muted-foreground">
              Total invested: {formatKobo(totalCostKobo)}
            </div>
          </CardContent>
        </Card>

        {/* Donut chart */}
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm text-muted-foreground">Asset Allocation</CardTitle>
          </CardHeader>
          <CardContent>
            {totalValueKobo === 0 ? (
              <div className="text-center py-6 text-muted-foreground text-sm">
                No holdings yet — start investing to see your allocation.
              </div>
            ) : (
              <div className="flex items-center gap-6">
                <DonutChart segments={segments} />
                <div className="space-y-2 flex-1">
                  {segments.map((seg) => (
                    <div key={seg.label} className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <div
                          className="w-3 h-3 rounded-full"
                          style={{ backgroundColor: seg.color }}
                        />
                        <span className="text-sm">{seg.label}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-sm font-medium">
                          {((seg.value / totalValueKobo) * 100).toFixed(1)}%
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {formatKobo(seg.value)}
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Asset breakdown table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart3 className="h-5 w-5" /> Holdings Breakdown
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-1">
            {assetRows.map((row) => (
              <div
                key={row.label}
                className="flex items-center justify-between p-4 rounded-lg border hover:bg-muted/30 transition-colors"
              >
                {/* Icon + label */}
                <div className="flex items-center gap-3 w-44">
                  {row.icon}
                  <div>
                    <div className="font-medium">{row.label}</div>
                    <div className="text-xs text-muted-foreground">{row.subtitle}</div>
                  </div>
                </div>

                {/* Sparkline */}
                <div className="hidden md:block w-24">
                  <Sparkline values={row.sparkline} color={row.sparkColor} />
                </div>

                {/* Value */}
                <div className="text-right w-36">
                  <div className="font-semibold">{formatKobo(row.valueKobo)}</div>
                  <div className="text-xs text-muted-foreground">
                    Cost: {formatKobo(row.costKobo)}
                  </div>
                </div>

                {/* Gain/loss */}
                <div className="text-right w-28">
                  <div
                    className={`font-medium text-sm ${
                      row.gainKobo >= 0 ? "text-green-600" : "text-red-600"
                    }`}
                  >
                    {row.gainKobo >= 0 ? "+" : ""}
                    {formatKobo(row.gainKobo)}
                  </div>
                  <Badge
                    variant="outline"
                    className={`text-xs ${
                      row.gainPct >= 0
                        ? "border-green-200 text-green-700"
                        : "border-red-200 text-red-700"
                    }`}
                  >
                    {formatPercent(row.gainPct)}
                  </Badge>
                </div>

                {/* CTA */}
                <Link href={row.href}>
                  <Button size="sm" variant="ghost" className="gap-1">
                    View <ArrowRight className="h-3.5 w-3.5" />
                  </Button>
                </Link>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* Mutual fund holdings detail */}
      {(mfPortfolio?.investments ?? []).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm flex items-center gap-2">
              <PieChart className="h-4 w-4 text-blue-500" /> Mutual Fund Holdings Detail
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-2">
              {mfPortfolio?.investments.map((h: any, i: number) => (
                <div
                  key={i}
                  className="flex justify-between items-center py-2 px-3 rounded border text-sm"
                >
                  <div>
                    <div className="font-medium">{h.fundName}</div>
                    <div className="text-xs text-muted-foreground">
                      {h.units?.toFixed(4)} units
                    </div>
                  </div>
                  <div className="text-right">
                    <div>{formatKobo(h.currentValueKobo ?? 0)}</div>
                    <div
                      className={`text-xs ${
                        (h.gainLossKobo ?? 0) >= 0 ? "text-green-600" : "text-red-600"
                      }`}
                    >
                      {(h.gainLossKobo ?? 0) >= 0 ? "+" : ""}
                      {formatKobo(h.gainLossKobo ?? 0)} ({h.gainLossPercent?.toFixed(2) ?? "0.00"}%)
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
