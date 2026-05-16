/**
 * CorridorLiveStats.tsx
 *
 * Live corridor statistics — real-time FX rates, toggle corridors,
 * and set FX markup. Uses trpc.corridorLive router.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { Activity, RefreshCw, AlertCircle, TrendingUp, Settings, ToggleLeft, ToggleRight, Gauge } from "lucide-react";

export default function CorridorLiveStats() {
  const [markupOpen, setMarkupOpen] = useState(false);
  const [selectedCorridor, setSelectedCorridor] = useState<string | null>(null);
  const [markup, setMarkup] = useState("");
  const [dailyLimitOpen, setDailyLimitOpen] = useState(false);
  const [dailyLimit, setDailyLimitValue] = useState("");

  const { data, isLoading, isError, refetch } = trpc.corridorLive.getLiveStats.useQuery(undefined, {
    refetchInterval: 30_000, // refresh every 30s
  });

  const setFxMarkup = trpc.corridorLive.setFxMarkup.useMutation({
    onSuccess: () => { toast.success("FX markup updated"); setMarkupOpen(false); setMarkup(""); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const setDailyLimit = trpc.corridorLiveEnhanced.setDailyLimit.useMutation({
    onSuccess: () => { toast.success("Daily limit updated"); setDailyLimitOpen(false); setDailyLimitValue(""); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const toggleCorridor = trpc.corridorLive.toggleCorridor.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`Corridor ${(vars as any).enabled ? "enabled" : "disabled"}`);
      refetch();
    },
    onError: (err) => toast.error(err.message),
  });

  const formatRate = (r: number) => r?.toLocaleString("en-NG", { minimumFractionDigits: 4 }) ?? "—";

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Activity className="w-6 h-6 text-green-600" /> Corridor Live Stats
          </h1>
          <p className="text-muted-foreground text-sm mt-1">Real-time FX rates, corridor status, and markup controls</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load live stats. Please refresh.
        </div>
      )}

      {/* Summary Stats */}
      {data?.summary && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Active Corridors</p>
              <p className="text-2xl font-bold text-green-600">{data.summary.activeCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Disabled Corridors</p>
              <p className="text-2xl font-bold text-red-500">{data.summary.disabledCount ?? 0}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Avg Spread</p>
              <p className="text-2xl font-bold">{data.summary.avgSpreadBps ?? 0}bps</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="pt-4 pb-4">
              <p className="text-xs text-muted-foreground">Last Updated</p>
              <p className="text-sm font-medium">
                {data.summary.lastUpdated ? new Date(data.summary.lastUpdated).toLocaleTimeString() : "—"}
              </p>
            </CardContent>
          </Card>
        </div>
      )}

      {/* Corridors Table */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-blue-500" /> Live Corridors
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading live data…</div>
          ) : !data?.corridors?.length ? (
            <div className="text-center py-8">
              <Activity className="w-10 h-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">No corridor data available</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs uppercase">
                    <th className="text-left py-2 px-3">Corridor</th>
                    <th className="text-right py-2 px-3">Live Rate</th>
                    <th className="text-right py-2 px-3">Markup (bps)</th>
                    <th className="text-right py-2 px-3">Volume (24h)</th>
                    <th className="text-center py-2 px-3">Status</th>
                    <th className="text-right py-2 px-3">Actions</th>
                  </tr>
                </thead>
                <tbody>
                  {data.corridors.map((c: any) => (
                    <tr key={c.id ?? c.corridorId} className="border-b hover:bg-muted/30 transition-colors">
                      <td className="py-2 px-3 font-medium">{c.name ?? `${c.fromCurrency}/${c.toCurrency}`}</td>
                      <td className="py-2 px-3 text-right font-mono">{formatRate(c.liveRate ?? c.rate)}</td>
                      <td className="py-2 px-3 text-right">{c.markupBps ?? 0}</td>
                      <td className="py-2 px-3 text-right text-muted-foreground">
                        {c.volume24h ? `₦${(c.volume24h / 100).toLocaleString()}` : "—"}
                      </td>
                      <td className="py-2 px-3 text-center">
                        <Badge className={c.enabled ? "bg-green-100 text-green-800" : "bg-red-100 text-red-700"}>
                          {c.enabled ? "Active" : "Disabled"}
                        </Badge>
                      </td>
                      <td className="py-2 px-3 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => {
                              setSelectedCorridor(c.id ?? c.corridorId);
                              setMarkup(String(c.markupBps ?? 0));
                              setMarkupOpen(true);
                            }}
                          >
                            <Settings className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            title="Set Daily Limit"
                            onClick={() => {
                              setSelectedCorridor(c.id ?? c.corridorId);
                              setDailyLimitValue(String(c.dailyLimitKobo ?? 0));
                              setDailyLimitOpen(true);
                            }}
                          >
                            <Gauge className="w-4 h-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => toggleCorridor.mutate({ corridorId: c.id ?? c.corridorId, enabled: !c.enabled })}
                            disabled={toggleCorridor.isPending}
                          >
                            {c.enabled ? (
                              <ToggleRight className="w-4 h-4 text-green-500" />
                            ) : (
                              <ToggleLeft className="w-4 h-4 text-red-400" />
                            )}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* Daily Limit Dialog */}
      <Dialog open={dailyLimitOpen} onOpenChange={setDailyLimitOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set Daily Limit</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Daily Limit (₦)</Label>
              <Input
                type="number"
                placeholder="e.g. 5000000"
                value={dailyLimit}
                onChange={e => setDailyLimitValue(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">Maximum daily transaction volume in Naira for this corridor</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDailyLimitOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedCorridor) return;
                setDailyLimit.mutate({ corridorId: selectedCorridor, dailyLimitKobo: Math.round(Number(dailyLimit) * 100) });
              }}
              disabled={setDailyLimit.isPending}
            >
              {setDailyLimit.isPending ? "Saving…" : "Save Limit"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* FX Markup Dialog */}
      <Dialog open={markupOpen} onOpenChange={setMarkupOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Set FX Markup</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div>
              <Label>Markup (basis points)</Label>
              <Input
                type="number"
                placeholder="e.g. 50"
                value={markup}
                onChange={e => setMarkup(e.target.value)}
              />
              <p className="text-xs text-muted-foreground mt-1">1 basis point = 0.01%. e.g. 50bps = 0.5% markup</p>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setMarkupOpen(false)}>Cancel</Button>
            <Button
              onClick={() => {
                if (!selectedCorridor) return;
                setFxMarkup.mutate({ corridorId: selectedCorridor, markupBps: Number(markup) });
              }}
              disabled={setFxMarkup.isPending}
            >
              {setFxMarkup.isPending ? "Saving…" : "Save Markup"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
