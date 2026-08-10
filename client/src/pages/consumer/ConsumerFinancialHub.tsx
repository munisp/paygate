// @ts-nocheck
import { useEffect, useRef, useState } from "react";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { Link } from "wouter";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
import { toast } from "sonner";
  Coins, PieChart, Shield, CreditCard, Globe, Umbrella,
  RefreshCw, TrendingUp, TrendingDown, Minus, ArrowUpRight, Wifi, WifiOff,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { useResilientSSE } from "@/lib/resilientSSE";

// SSE hook for real-time market data (falls back to polling if SSE fails)
function useMarketSSE() {
  const [sseData, setSseData] = useState<any>(null);
  const [connected, setConnected] = useState(false);

  useResilientSSE<unknown>({
    url: "/api/market/stream",
    pollUrl: "/api/trpc/market.prices",
    pollIntervalMs: 30_000,
    onMessage: (data) => {
      try {
        const parsed = typeof data === "string" ? JSON.parse(data) : data as any;
        if (parsed.type === "price_update") {
          setMarketData((prev: any) => ({ ...prev, ...parsed.data }));
        }
      } catch {}
    },
    heartbeatTimeoutSec: 90,
    pauseOnHidden: true,
  })

  return { sseData, connected };
}

const SERVICES = [
  {
    path: "/consumer/gold",
    icon: Coins,
    label: "Digital Gold",
    description: "Buy & sell 24K gold digitally",
    color: "text-yellow-600",
    bg: "bg-yellow-50 dark:bg-yellow-950/30",
    badgeKey: "gold",
  },
  {
    path: "/consumer/mutual-funds",
    icon: PieChart,
    label: "Mutual Funds",
    description: "Invest in diversified funds",
    color: "text-indigo-600",
    bg: "bg-indigo-50 dark:bg-indigo-950/30",
    badgeKey: "topFund",
  },
  {
    path: "/consumer/pension",
    icon: Shield,
    label: "Pension",
    description: "Manage your RSA contributions",
    color: "text-blue-600",
    bg: "bg-blue-50 dark:bg-blue-950/30",
    badge: "Tax-free",
  },
  {
    path: "/consumer/emi",
    icon: CreditCard,
    label: "EMI Loans",
    description: "Flexible installment loans",
    color: "text-purple-600",
    bg: "bg-purple-50 dark:bg-purple-950/30",
    badge: "From 18% p.a.",
  },
  {
    path: "/consumer/remittance",
    icon: Globe,
    label: "Send Abroad",
    description: "International money transfers",
    color: "text-teal-600",
    bg: "bg-teal-50 dark:bg-teal-950/30",
    badgeKey: "usdNgn",
  },
  {
    path: "/consumer/insurance",
    icon: Umbrella,
    label: "Insurance",
    description: "Health, life, device & more",
    color: "text-sky-600",
    bg: "bg-sky-50 dark:bg-sky-950/30",
    badge: "5 plans",
  },
  {
    path: "/consumer/subscriptions",
    icon: RefreshCw,
    label: "Subscriptions",
    description: "Manage recurring payments",
    color: "text-green-600",
    bg: "bg-green-50 dark:bg-green-950/30",
    badge: null,
  },
  {
    path: "/consumer/savings",
    icon: TrendingUp,
    label: "Savings Goals",
    description: "Set and track savings targets",
    color: "text-orange-600",
    bg: "bg-orange-50 dark:bg-orange-950/30",
    badge: null,
  },
  {
    path: "/consumer/sip",
    icon: RefreshCw,
    label: "SIP Scheduler",
    description: "Automate recurring investments",
    color: "text-emerald-600",
    bg: "bg-emerald-50 dark:bg-emerald-950/30",
    badge: "Auto-invest",
  },
] as const;

type ServiceItem = {
  path: string;
  icon: React.ElementType;
  label: string;
  description: string;
  color: string;
  bg: string;
  badgeKey?: string;
  badge?: string | null;
};

function ChangeIndicator({ pct }: { pct: number }) {
  if (pct > 0) return (
    <span className="flex items-center gap-0.5 text-xs text-green-600 font-medium">
      <TrendingUp className="w-3 h-3" />{pct.toFixed(2)}%
    </span>
  );
  if (pct < 0) return (
    <span className="flex items-center gap-0.5 text-xs text-red-600 font-medium">
      <TrendingDown className="w-3 h-3" />{Math.abs(pct).toFixed(2)}%
    </span>
  );
  return (
    <span className="flex items-center gap-0.5 text-xs text-muted-foreground font-medium">
      <Minus className="w-3 h-3" />0.00%
    </span>
  );
}

export default function ConsumerFinancialHub() {
  const { sseData, connected } = useMarketSSE();
  // Fallback polling (used when SSE is not delivering data)
  const marketInterval = useAdaptiveInterval(30_000);
  const { data: polledSummary, isLoading, isError } = trpc.newFeatures.marketData.summary.useQuery(undefined, {
    refetchInterval: sseData ? false : marketInterval,
    staleTime: 20_000,
  });

  // Prefer SSE data, fall back to polled
  const summary = sseData
    ? {
        gold: { ngnPerGram: Math.round(sseData.goldNGN / 31.1), change24hPct: 0.12 },
        fx: { usdNgn: sseData.usdNGN, gbpNgn: sseData.gbpNGN, eurNgn: sseData.eurNGN },
        topFund: { ytdPct: sseData.topFundYtd, name: "Stanbic IBTC Money Market" },
        marketSentiment: sseData.sentiment,
        updatedAt: sseData.timestamp,
      }
    : polledSummary;

  function getBadge(svc: ServiceItem): string | null {
    if (!svc.badgeKey) return svc.badge ?? null;
    if (isLoading) return null;
    if (!summary) return svc.badge ?? null;
    if (svc.badgeKey === "gold") return `₦${summary.gold.ngnPerGram.toLocaleString()}/g`;
    if (svc.badgeKey === "topFund") return `+${summary.topFund.ytdPct}% YTD`;
    if (svc.badgeKey === "usdNgn") return `$1 = ₦${summary.fx.usdNgn.toLocaleString()}`;
    return null;
  }

  return (
    <div className="p-4 space-y-6 max-w-2xl mx-auto">
      {/* Header */}
      <div>
        <h1 className="text-xl font-bold">Financial Services</h1>
        <p className="text-sm text-muted-foreground mt-1">Grow, protect, and manage your money</p>
      </div>

      {/* Live Market Tickers */}
      <div className="rounded-xl border bg-card p-4 space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">Live Market</p>
          {isLoading ? (
            <Skeleton className="h-3 w-16" />
          ) : (
            <span className="text-xs text-muted-foreground">
              {summary ? new Date(summary.updatedAt).toLocaleTimeString() : "—"}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-3">
          {/* Gold */}
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Gold / gram</p>
            {isLoading ? (
              <Skeleton className="h-5 w-24" />
            ) : (
              <>
                <p className="font-bold text-sm">
                  {summary ? `₦${summary.gold.ngnPerGram.toLocaleString()}` : "—"}
                </p>
                {summary && <ChangeIndicator pct={summary.gold.change24hPct} />}
              </>
            )}
          </div>

          {/* USD/NGN */}
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">USD / NGN</p>
            {isLoading ? (
              <Skeleton className="h-5 w-20" />
            ) : (
              <>
                <p className="font-bold text-sm">
                  {summary ? `₦${summary.fx.usdNgn.toLocaleString()}` : "—"}
                </p>
                <span className="text-xs text-muted-foreground">per $1</span>
              </>
            )}
          </div>

          {/* Top Fund */}
          <div className="space-y-0.5">
            <p className="text-xs text-muted-foreground">Top Fund YTD</p>
            {isLoading ? (
              <Skeleton className="h-5 w-16" />
            ) : (
              <>
                <p className="font-bold text-sm text-green-600">
                  {summary ? `+${summary.topFund.ytdPct}%` : "—"}
                </p>
                {summary && (
                  <p className="text-xs text-muted-foreground truncate max-w-[80px]" title={summary.topFund.name}>
                    {summary.topFund.name.split(" ").slice(0, 2).join(" ")}
                  </p>
                )}
              </>
            )}
          </div>
        </div>

        {/* FX mini-row */}
        {!isLoading && summary && (
          <div className="flex items-center gap-3 pt-1 border-t text-xs text-muted-foreground overflow-x-auto">
            <span className="whitespace-nowrap">GBP ₦{summary.fx.gbpNgn.toLocaleString()}</span>
            <span className="whitespace-nowrap">EUR ₦{summary.fx.eurNgn.toLocaleString()}</span>
            <Badge
              variant={summary.marketSentiment === "bullish" ? "default" : "destructive"}
              className="text-xs ml-auto shrink-0"
            >
              {summary.marketSentiment === "bullish" ? "Bullish" : "Bearish"}
            </Badge>
          </div>
        )}
      </div>

      {/* SSE Connection Badge */}
      <div className="flex justify-end">
        <Badge variant={connected ? "default" : "secondary"} className="gap-1 text-xs">
          {connected ? <Wifi className="w-3 h-3" /> : <WifiOff className="w-3 h-3" />}
          {connected ? "Live" : "Polling"}
        </Badge>
      </div>

      {/* Service Cards */}
      <div className="grid grid-cols-2 gap-3">
        {(SERVICES as ServiceItem[]).map((svc) => {
          const Icon = svc.icon;
          const badge = getBadge(svc);
          return (
            <Link key={svc.path} href={svc.path}>
              <Card className="cursor-pointer hover:border-primary hover:shadow-sm transition-all h-full">
                <CardContent className="p-4 space-y-2">
                  <div className={`w-10 h-10 rounded-xl ${svc.bg} flex items-center justify-center`}>
                    <Icon className={`w-5 h-5 ${svc.color}`} />
                  </div>
                  <div>
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <p className="font-semibold text-sm">{svc.label}</p>
                      {badge && (
                        <Badge variant="secondary" className="text-xs px-1.5 py-0 font-mono">
                          {badge}
                        </Badge>
                      )}
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{svc.description}</p>
                  </div>
                  <ArrowUpRight className="w-3.5 h-3.5 text-muted-foreground ml-auto" />
                </CardContent>
              </Card>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
