import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { useToast } from "@/hooks/use-toast";
import { TrendingUp, ArrowRightLeft, Plus, RefreshCw, Clock } from "lucide-react";

function PublishRateDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({ sourceCurrency: "USD", targetCurrency: "NGN", rate: "", provider: "nexthub-fx", validForSeconds: 300 });
  const { toast } = useToast();
  const utils = trpc.useUtils();

  const publish = trpc.nexthubFX.publishRate.useMutation({
    onSuccess: () => {
      toast({ title: "FX rate published", description: `${form.sourceCurrency}/${form.targetCurrency} @ ${form.rate}` });
      utils.nexthubFX.listRates.invalidate();
      utils.nexthubFX.supportedPairs.invalidate();
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast({ title: "Failed to publish rate", description: e.message, variant: "destructive" }),
  });

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-emerald-600 hover:bg-emerald-700 text-white">
          <Plus className="w-4 h-4 mr-2" />Publish Rate
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-gray-900 border-gray-700 text-gray-100 max-w-md">
        <DialogHeader>
          <DialogTitle>Publish FX Rate</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 mt-2">
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label>Source Currency</Label>
              <Input maxLength={3} value={form.sourceCurrency} onChange={(e) => setForm({ ...form, sourceCurrency: e.target.value.toUpperCase() })}
                className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
            </div>
            <div>
              <Label>Target Currency</Label>
              <Input maxLength={3} value={form.targetCurrency} onChange={(e) => setForm({ ...form, targetCurrency: e.target.value.toUpperCase() })}
                className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
            </div>
          </div>
          <div>
            <Label>Rate</Label>
            <Input placeholder="e.g. 1620.50" value={form.rate} onChange={(e) => setForm({ ...form, rate: e.target.value })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
            <p className="text-xs text-gray-500 mt-1">1 {form.sourceCurrency} = {form.rate || "?"} {form.targetCurrency}</p>
          </div>
          <div>
            <Label>Provider</Label>
            <Input value={form.provider} onChange={(e) => setForm({ ...form, provider: e.target.value })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div>
            <Label>Valid for (seconds)</Label>
            <Input type="number" min={60} max={86400} value={form.validForSeconds}
              onChange={(e) => setForm({ ...form, validForSeconds: parseInt(e.target.value) || 300 })}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <Button className="w-full bg-emerald-600 hover:bg-emerald-700" disabled={!form.rate || publish.isPending}
            onClick={() => publish.mutate(form)}>
            {publish.isPending ? "Publishing..." : "Publish Rate"}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function ConversionCalculator() {
  const [sourceAmt, setSourceAmt] = useState("100");
  const [srcCcy, setSrcCcy] = useState("USD");
  const [tgtCcy, setTgtCcy] = useState("NGN");

  const { data: result, isLoading, error } = trpc.nexthubFX.convert.useQuery(
    { sourceCurrency: srcCcy, targetCurrency: tgtCcy, sourceAmount: sourceAmt },
    { enabled: !!sourceAmt && !!srcCcy && !!tgtCcy && /^\d+(\.\d+)?$/.test(sourceAmt) }
  );

  return (
    <Card className="bg-gray-900 border-gray-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-white text-base flex items-center gap-2">
          <ArrowRightLeft className="w-4 h-4 text-emerald-400" />Conversion Calculator
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-3 gap-3 items-end">
          <div>
            <Label className="text-gray-400 text-xs">Amount</Label>
            <Input value={sourceAmt} onChange={(e) => setSourceAmt(e.target.value)}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">From</Label>
            <Input maxLength={3} value={srcCcy} onChange={(e) => setSrcCcy(e.target.value.toUpperCase())}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
          <div>
            <Label className="text-gray-400 text-xs">To</Label>
            <Input maxLength={3} value={tgtCcy} onChange={(e) => setTgtCcy(e.target.value.toUpperCase())}
              className="bg-gray-800 border-gray-600 text-gray-100 mt-1" />
          </div>
        </div>
        <div className="bg-gray-800 rounded-lg p-4 text-center">
          {isLoading && <p className="text-gray-400 text-sm">Calculating...</p>}
          {error && <p className="text-red-400 text-sm">No rate available for {srcCcy}/{tgtCcy}</p>}
          {result && (
            <>
              <p className="text-3xl font-bold text-emerald-400">{result.targetAmount} <span className="text-lg text-gray-400">{result.targetCurrency}</span></p>
              <p className="text-gray-400 text-sm mt-1">Rate: 1 {result.sourceCurrency} = {result.rate} {result.targetCurrency}</p>
              {result.validTo && (
                <p className="text-gray-500 text-xs mt-1 flex items-center justify-center gap-1">
                  <Clock className="w-3 h-3" />Rate expires {new Date(result.validTo).toLocaleTimeString()}
                </p>
              )}
            </>
          )}
          {!isLoading && !result && !error && <p className="text-gray-500 text-sm">Enter a valid amount to convert</p>}
        </div>
      </CardContent>
    </Card>
  );
}

export default function FXDashboard() {
  const { data: rates = [], isLoading } = trpc.nexthubFX.listRates.useQuery();
  const { data: pairs = [] } = trpc.nexthubFX.supportedPairs.useQuery();

  const grouped = useMemo(() => {
    const map: Record<string, typeof rates> = {};
    for (const r of rates) {
      const key = `${r.sourceCurrency}/${r.targetCurrency}`;
      if (!map[key]) map[key] = [];
      map[key].push(r);
    }
    return map;
  }, [rates]);

  return (
    <div className="p-6 space-y-6 bg-gray-950 min-h-screen text-gray-100">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <TrendingUp className="w-6 h-6 text-emerald-400" />FX Dashboard
          </h1>
          <p className="text-gray-400 text-sm mt-1">Foreign exchange rates and conversion — FSPIOP FX API v2.0</p>
        </div>
        <PublishRateDialog onSuccess={() => {}} />
      </div>

      {/* Stats row */}
      <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-emerald-400">{pairs.length}</p>
            <p className="text-xs text-gray-400 mt-1">Active Pairs</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-blue-400">{rates.length}</p>
            <p className="text-xs text-gray-400 mt-1">Live Rates</p>
          </CardContent>
        </Card>
        <Card className="bg-gray-900 border-gray-700">
          <CardContent className="p-4 text-center">
            <p className="text-2xl font-bold text-purple-400">{[...new Set(rates.map((r) => r.provider))].length}</p>
            <p className="text-xs text-gray-400 mt-1">Providers</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Conversion Calculator */}
        <ConversionCalculator />

        {/* Supported Pairs */}
        <Card className="bg-gray-900 border-gray-700">
          <CardHeader className="pb-3">
            <CardTitle className="text-white text-base">Supported Currency Pairs</CardTitle>
          </CardHeader>
          <CardContent>
            {pairs.length === 0 ? (
              <p className="text-gray-500 text-sm text-center py-4">No active pairs. Publish a rate to get started.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {pairs.map((p) => (
                  <Badge key={`${p.sourceCurrency}/${p.targetCurrency}`} variant="outline"
                    className="border-emerald-500/30 text-emerald-300 bg-emerald-500/10">
                    {p.sourceCurrency}/{p.targetCurrency}
                    <span className="ml-1 text-gray-500 text-xs">· {p.provider}</span>
                  </Badge>
                ))}
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* Live Rates Table */}
      <Card className="bg-gray-900 border-gray-700">
        <CardHeader className="pb-3">
          <CardTitle className="text-white text-base">Live FX Rates</CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-center py-8 text-gray-400">Loading rates...</div>
          ) : rates.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <TrendingUp className="w-12 h-12 mx-auto mb-3 opacity-30" />
              <p>No active FX rates.</p>
              <p className="text-sm mt-1">Publish rates from your FX provider bridge.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-700 text-gray-400">
                    <th className="text-left py-3 px-2">Pair</th>
                    <th className="text-right py-3 px-2">Rate</th>
                    <th className="text-left py-3 px-2">Provider</th>
                    <th className="text-left py-3 px-2">Valid From</th>
                    <th className="text-left py-3 px-2">Expires</th>
                  </tr>
                </thead>
                <tbody>
                  {rates.map((rate) => (
                    <tr key={rate.id} className="border-b border-gray-800 hover:bg-gray-800/50">
                      <td className="py-3 px-2">
                        <span className="font-semibold text-white">{rate.sourceCurrency}</span>
                        <span className="text-gray-500 mx-1">/</span>
                        <span className="font-semibold text-emerald-400">{rate.targetCurrency}</span>
                      </td>
                      <td className="py-3 px-2 text-right font-mono text-white font-semibold">{rate.rate}</td>
                      <td className="py-3 px-2 text-gray-300">{rate.provider}</td>
                      <td className="py-3 px-2 text-gray-400 text-xs">{rate.validFrom ? new Date(rate.validFrom).toLocaleString() : "—"}</td>
                      <td className="py-3 px-2 text-xs">
                        {rate.validTo ? (
                          <span className={new Date(rate.validTo) < new Date() ? "text-red-400" : "text-green-400"}>
                            {new Date(rate.validTo).toLocaleString()}
                          </span>
                        ) : "—"}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
