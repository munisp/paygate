import { useState } from "react";
import { trpc } from "@/lib/trpc";
import DashboardLayout from "@/components/DashboardLayout";
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { RefreshCw, Globe, TrendingUp, Lock } from "lucide-react";

const CURRENCIES = ["USD", "EUR", "GBP", "CAD", "AUD", "JPY", "CNY", "ZAR", "KES", "GHS"];

export default function DCCDashboard() {
  const [selectedCurrency, setSelectedCurrency] = useState("USD");
  const [lockAmount, setLockAmount] = useState("");

  const { data: rates, isLoading, refetch } = trpc.tier1to5.dcc.getLiveRates.useQuery({ baseCurrency: "NGN", targetCurrencies: CURRENCIES });
  const { data: marginConfig } = trpc.tier1to5.dcc.getDCCMarginConfig.useQuery();

  const lockMutation = trpc.tier1to5.dcc.lockRate.useMutation({
    onSuccess: (data: any) => toast.success(`Rate locked: 1 ${selectedCurrency} = ₦${data.lockedRate?.toFixed(2)} (valid ${data.validForSeconds}s)`),
    onError: (err: any) => toast.error(err.message),
  });

  const updateMarginMutation = trpc.tier1to5.dcc.updateDCCMargin.useMutation({
    onSuccess: () => toast.success("DCC margin updated."),
    onError: (err: any) => toast.error(err.message),
  });

  return (
    <DashboardLayout>
      <div className="p-6 space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Dynamic Currency Conversion</h1>
            <p className="text-muted-foreground text-sm mt-1">Real-time FX rates with margin configuration and rate locking</p>
          </div>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh Rates
          </Button>
        </div>

        {/* Live Rates Grid */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Globe className="w-5 h-5 text-primary" />
              Live Exchange Rates (NGN base)
            </CardTitle>
            <CardDescription>Rates update every 30 seconds via Fluvio streaming</CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {CURRENCIES.map(c => <div key={c} className="animate-pulse h-16 bg-muted rounded-lg" />)}
              </div>
            ) : (
              <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
                {(rates?.rates ?? []).map((r: any) => (
                  <button
                    key={r.currency}
                    onClick={() => setSelectedCurrency(r.currency)}
                    className={`p-3 rounded-lg border text-left transition-all ${selectedCurrency === r.currency ? "border-primary bg-primary/5" : "border-border hover:border-primary/50"}`}
                  >
                    <p className="text-xs text-muted-foreground">{r.currency}/NGN</p>
                    <p className="text-lg font-bold">₦{r.rate?.toFixed(2)}</p>
                    <div className="flex items-center gap-1 mt-1">
                      <TrendingUp className={`w-3 h-3 ${r.change24h >= 0 ? "text-green-500" : "text-red-500"}`} />
                      <span className={`text-xs ${r.change24h >= 0 ? "text-green-500" : "text-red-500"}`}>
                        {r.change24h >= 0 ? "+" : ""}{r.change24h?.toFixed(2)}%
                      </span>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </CardContent>
        </Card>

        {/* Rate Lock */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Lock className="w-5 h-5 text-primary" />
                Lock Rate for Transaction
              </CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label>Currency: <Badge>{selectedCurrency}</Badge></Label>
              </div>
              <div>
                <Label>Amount ({selectedCurrency})</Label>
                <Input type="number" placeholder="100.00" value={lockAmount} onChange={e => setLockAmount(e.target.value)} className="mt-1" />
              </div>
              <Button
                onClick={() => lockMutation.mutate({ fromCurrency: selectedCurrency, toCurrency: "NGN", amountKobo: Math.round((parseFloat(lockAmount) || 100) * 100) })}
                disabled={lockMutation.isPending}
                className="w-full"
              >
                {lockMutation.isPending ? "Locking..." : `Lock ${selectedCurrency}/NGN Rate`}
              </Button>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Margin Configuration</CardTitle>
              <CardDescription>FX spread charged on DCC transactions</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {marginConfig ? (
                <div className="space-y-3">
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Current Margin</span>
                    <Badge variant="outline">{marginConfig.marginPct}%</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Min Margin</span>
                    <Badge variant="outline">{marginConfig.minMarginPct}%</Badge>
                  </div>
                  <div className="flex justify-between items-center p-3 bg-muted/30 rounded-lg">
                    <span className="text-sm">Max Margin</span>
                    <Badge variant="outline">{marginConfig.maxMarginPct}%</Badge>
                  </div>
                  <Button variant="outline" size="sm" className="w-full"
                    onClick={() => updateMarginMutation.mutate({ currency: selectedCurrency, marginPct: marginConfig.marginPct })}>
                    Update Margin
                  </Button>
                </div>
              ) : (
                <div className="animate-pulse space-y-2">
                  {[1, 2, 3].map(i => <div key={i} className="h-10 bg-muted rounded-lg" />)}
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </DashboardLayout>
  );
}
