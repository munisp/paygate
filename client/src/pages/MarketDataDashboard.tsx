import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { TrendingUp, TrendingDown, RefreshCw, DollarSign, BarChart2, Gem } from "lucide-react";

export default function MarketDataDashboard() {
  const { data: gold, isLoading: goldLoading, isError: goldError, refetch: refetchGold } = trpc.marketData.goldPrice.useQuery();
  const { data: fx, isLoading: fxLoading, isError: fxError } = trpc.marketData.fxRates.useQuery();
  const { data: navs, isLoading: navsLoading, isError: navsError } = trpc.marketData.fundNavs.useQuery();
  const { data: summary, isError: summaryError } = trpc.marketData.summary.useQuery();
  const isError = goldError || fxError || navsError || summaryError;

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;
  const formatRate = (r: number) => r.toLocaleString("en-NG", { minimumFractionDigits: 4 });

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Market Data</h1>
          <p className="text-muted-foreground text-sm mt-1">Live gold prices, FX rates, and mutual fund NAVs</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetchGold()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {/* Market Summary */}
      {summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Market Cap</p>
              <p className="text-xl font-bold">{summary.marketCapFormatted ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Sentiment</p>
              <Badge className={summary.sentiment === "bullish" ? "bg-green-100 text-green-800" : summary.sentiment === "bearish" ? "bg-red-100 text-red-800" : "bg-gray-100 text-gray-600"}>
                {summary.sentiment ?? "neutral"}
              </Badge>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Active Pairs</p>
              <p className="text-xl font-bold">{summary.activePairs ?? "—"}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium">{summary.lastUpdated ? new Date(summary.lastUpdated).toLocaleTimeString() : "—"}</p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Gold Price */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Gem className="w-5 h-5 text-yellow-500" />
            Gold Spot Price (XAU/NGN)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {goldLoading ? (
            <div className="text-muted-foreground">Loading gold price…</div>
          ) : gold ? (
            <div className="flex items-center gap-6 flex-wrap">
              <div>
                <p className="text-xs text-muted-foreground">Spot Price (per troy oz)</p>
                <p className="text-3xl font-bold text-yellow-600">{formatKobo(gold.priceKobo)}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">24h Change</p>
                <div className="flex items-center gap-1">
                  {(gold.change24h ?? 0) >= 0 ? (
                    <TrendingUp className="w-4 h-4 text-green-500" />
                  ) : (
                    <TrendingDown className="w-4 h-4 text-red-500" />
                  )}
                  <span className={`font-semibold ${(gold.change24h ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                    {(gold.change24h ?? 0) >= 0 ? "+" : ""}{gold.change24h?.toFixed(2) ?? "0.00"}%
                  </span>
                </div>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Bid</p>
                <p className="font-semibold">{gold.bidKobo ? formatKobo(gold.bidKobo) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Ask</p>
                <p className="font-semibold">{gold.askKobo ? formatKobo(gold.askKobo) : "—"}</p>
              </div>
              <div>
                <p className="text-xs text-muted-foreground">Source</p>
                <Badge variant="outline">{gold.source ?? "market"}</Badge>
              </div>
            </div>
          ) : (
            <div className="text-muted-foreground">Gold price unavailable</div>
          )}
        </CardContent>
      </Card>

      {/* FX Rates */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <DollarSign className="w-5 h-5 text-blue-500" />
            FX Rates (NGN Base)
          </CardTitle>
        </CardHeader>
        <CardContent>
          {fxLoading ? (
            <div className="text-muted-foreground">Loading FX rates…</div>
          ) : fx?.rates ? (
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {Object.entries(fx.rates).map(([currency, rate]: [string, any]) => (
                <div key={currency} className="border rounded-lg p-3">
                  <div className="flex items-center justify-between mb-1">
                    <span className="font-bold text-sm">{currency}/NGN</span>
                    <Badge variant="outline" className="text-xs">{fx.source ?? "live"}</Badge>
                  </div>
                  <p className="text-lg font-semibold">{formatRate(rate.rate ?? rate)}</p>
                  {rate.change24h !== undefined && (
                    <div className="flex items-center gap-1 mt-1">
                      {rate.change24h >= 0 ? (
                        <TrendingUp className="w-3 h-3 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-xs ${rate.change24h >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {rate.change24h >= 0 ? "+" : ""}{rate.change24h.toFixed(2)}%
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">FX rates unavailable</div>
          )}
        </CardContent>
      </Card>

      {/* Mutual Fund NAVs */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <BarChart2 className="w-5 h-5 text-purple-500" />
            Mutual Fund NAVs
          </CardTitle>
        </CardHeader>
        <CardContent>
          {navsLoading ? (
            <div className="text-muted-foreground">Loading fund NAVs…</div>
          ) : navs?.funds ? (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {navs.funds.map((fund: any) => (
                <div key={fund.id ?? fund.name} className="border rounded-lg p-3 flex items-center justify-between">
                  <div>
                    <p className="font-semibold text-sm">{fund.name}</p>
                    <p className="text-xs text-muted-foreground">{fund.category}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold">{formatKobo(fund.navKobo)}</p>
                    <div className="flex items-center gap-1 justify-end">
                      {(fund.change7d ?? 0) >= 0 ? (
                        <TrendingUp className="w-3 h-3 text-green-500" />
                      ) : (
                        <TrendingDown className="w-3 h-3 text-red-500" />
                      )}
                      <span className={`text-xs ${(fund.change7d ?? 0) >= 0 ? "text-green-600" : "text-red-600"}`}>
                        {(fund.change7d ?? 0) >= 0 ? "+" : ""}{(fund.change7d ?? 0).toFixed(2)}% 7d
                      </span>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          ) : (
            <div className="text-muted-foreground">Fund NAVs unavailable</div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
