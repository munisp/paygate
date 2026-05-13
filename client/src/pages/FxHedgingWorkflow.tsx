// @ts-nocheck
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { toast } from "sonner";
import { TrendingUp, TrendingDown, DollarSign, RefreshCw, Plus, BarChart2, ArrowUpDown } from "lucide-react";

const STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-700",
  closed: "bg-gray-100 text-gray-700",
  expired: "bg-red-100 text-red-700",
  settled: "bg-green-100 text-green-700",
};

export default function FxHedgingWorkflow() {
  const [newHedge, setNewHedge] = useState({ baseCurrency: "USD", quoteCurrency: "NGN", notionalAmount: "10000", hedgeRatio: "1580", expiryDays: "30" });
  const [showForm, setShowForm] = useState(false);

  const { data: positions, refetch, isLoading } = trpc.wave30.fxHedging.listPositions.useQuery({ limit: 50 });
  const { data: pnl } = trpc.wave30.fxHedging.getPnlSummary.useQuery();
  const { data: rates } = trpc.wave30.fxHedging.listPositions.useQuery({ status: "open" });

  const openPosition = trpc.wave30.fxHedging.openPosition.useMutation({
    onSuccess: () => { toast.success("FX hedge position opened"); setShowForm(false); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const closePosition = trpc.wave30.fxHedging.closePosition.useMutation({
    onSuccess: () => { toast.success("Position closed"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const close = trpc.wave30.fxHedging.close.useMutation({
    onSuccess: () => { toast.success("Position settled"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const totalPnl = pnl?.reduce((a: number, p: any) => a + parseFloat(p.unrealized_pnl ?? 0), 0) ?? 0;
  const openCount = positions?.filter((p: any) => p.status === 'open').length ?? 0;

  if (isLoading) {
    return (
      <div className="p-6 space-y-4">
        <div className="h-8 bg-muted rounded animate-pulse w-48" />
        <div className="h-4 bg-muted rounded animate-pulse w-full" />
        <div className="h-4 bg-muted rounded animate-pulse w-3/4" />
        <div className="h-4 bg-muted rounded animate-pulse w-1/2" />
      </div>
    );
  }
  return (
    <div className="p-6 space-y-6 max-w-6xl mx-auto">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">FX Hedging Workflow</h1>
          <p className="text-gray-500 text-sm mt-1">Manage currency exposure with forward contracts and hedge positions</p>
        </div>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white" onClick={() => setShowForm(!showForm)}>
          <Plus className="w-4 h-4 mr-2" /> Open Position
        </Button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Open Positions", value: openCount, icon: <ArrowUpDown className="w-5 h-5 text-blue-500" />, color: "text-blue-600" },
          { label: "Total Unrealized P&L", value: `$${totalPnl.toFixed(2)}`, icon: totalPnl >= 0 ? <TrendingUp className="w-5 h-5 text-green-500" /> : <TrendingDown className="w-5 h-5 text-red-500" />, color: totalPnl >= 0 ? "text-green-600" : "text-red-600" },
          { label: "USD/NGN Rate", value: rates?.find((r: any) => r.pair === 'USD/NGN')?.rate ?? "1,580", icon: <DollarSign className="w-5 h-5 text-amber-500" />, color: "text-amber-600" },
          { label: "Total Positions", value: positions?.length ?? 0, icon: <BarChart2 className="w-5 h-5 text-purple-500" />, color: "text-purple-600" },
        ].map((s) => (
          <Card key={s.label}>
            <CardContent className="pt-4">
              <div className="flex items-center gap-3">
                {s.icon}
                <div>
                  <p className="text-xs text-gray-500">{s.label}</p>
                  <p className={`text-xl font-bold ${s.color}`}>{s.value}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* New Position Form */}
      {showForm && (
        <Card className="border-indigo-200 bg-indigo-50">
          <CardHeader>
            <CardTitle className="text-base font-semibold text-indigo-700">Open New Hedge Position</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Base Currency</label>
                <select className="border rounded px-2 py-1.5 text-sm w-full text-gray-700"
                  value={newHedge.baseCurrency} onChange={(e) => setNewHedge({ ...newHedge, baseCurrency: e.target.value })}>
                  <option>USD</option><option>EUR</option><option>GBP</option><option>NGN</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Quote Currency</label>
                <select className="border rounded px-2 py-1.5 text-sm w-full text-gray-700"
                  value={newHedge.quoteCurrency} onChange={(e) => setNewHedge({ ...newHedge, quoteCurrency: e.target.value })}>
                  <option>NGN</option><option>USD</option><option>EUR</option><option>GBP</option><option>KES</option><option>GHS</option>
                </select>
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Notional Amount</label>
                <Input value={newHedge.notionalAmount} onChange={(e) => setNewHedge({ ...newHedge, notionalAmount: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Hedge Rate</label>
                <Input value={newHedge.hedgeRatio} onChange={(e) => setNewHedge({ ...newHedge, hedgeRatio: e.target.value })} />
              </div>
              <div>
                <label className="text-xs text-gray-600 mb-1 block">Expiry (days)</label>
                <Input value={newHedge.expiryDays} onChange={(e) => setNewHedge({ ...newHedge, expiryDays: e.target.value })} />
              </div>
            </div>
            <div className="flex gap-3 mt-4">
              <Button className="bg-indigo-600 hover:bg-indigo-700 text-white"
                onClick={() => openPosition.mutate({
                  baseCurrency: newHedge.baseCurrency,
                  quoteCurrency: newHedge.quoteCurrency,
                  notionalAmount: parseFloat(newHedge.notionalAmount),
                  hedgeRatio: parseFloat(newHedge.hedgeRatio),
                  expiryDays: parseInt(newHedge.expiryDays),
                })}>
                Open Position
              </Button>
              <Button variant="outline" onClick={() => setShowForm(false)}>Cancel</Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Live Rates */}
      {rates && rates.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base font-semibold text-gray-700">Live FX Rates</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4 flex-wrap">
              {rates.map((r: any) => (
                <div key={r.pair} className="px-4 py-2 bg-gray-50 rounded-lg text-center">
                  <p className="text-xs text-gray-500">{r.pair}</p>
                  <p className="text-lg font-bold text-gray-900">{parseFloat(r.rate).toLocaleString()}</p>
                  <p className="text-xs text-gray-400">Updated {new Date(r.updated_at).toLocaleTimeString()}</p>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Positions Table */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base font-semibold text-gray-700">Hedge Positions</CardTitle>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="w-4 h-4" />
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Pair</TableHead>
                <TableHead>Notional</TableHead>
                <TableHead>Hedge Rate</TableHead>
                <TableHead>Market Rate</TableHead>
                <TableHead>Unrealized P&L</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Expiry</TableHead>
                <TableHead>Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {!positions?.length ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8 text-gray-400">
                    No hedge positions. Open your first position above.
                  </TableCell>
                </TableRow>
              ) : positions.map((pos: any) => {
                const pnlVal = parseFloat(pos.unrealized_pnl ?? 0);
                return (
                  <TableRow key={pos.id}>
                    <TableCell className="font-mono font-semibold text-sm">{pos.base_currency}/{pos.quote_currency}</TableCell>
                    <TableCell>${parseFloat(pos.notional_amount ?? 0).toLocaleString()}</TableCell>
                    <TableCell className="font-mono text-sm">{parseFloat(pos.hedge_rate ?? 0).toFixed(4)}</TableCell>
                    <TableCell className="font-mono text-sm">{pos.market_rate ? parseFloat(pos.market_rate).toFixed(4) : "—"}</TableCell>
                    <TableCell className={`font-semibold ${pnlVal >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                      {pnlVal >= 0 ? '+' : ''}${pnlVal.toFixed(2)}
                    </TableCell>
                    <TableCell>
                      <Badge className={`text-xs ${STATUS_COLORS[pos.status] ?? 'bg-gray-100 text-gray-700'}`}>
                        {pos.status}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-xs text-gray-500">
                      {pos.expiry_date ? new Date(pos.expiry_date).toLocaleDateString() : "—"}
                    </TableCell>
                    <TableCell>
                      <div className="flex gap-1">
                        {pos.status === 'open' && (
                          <>
                            <Button size="sm" variant="outline" className="text-xs text-green-700 border-green-300"
                              onClick={() => close.mutate({ positionId: pos.id })}>
                              Settle
                            </Button>
                            <Button size="sm" variant="outline" className="text-xs text-red-700 border-red-300"
                              onClick={() => closePosition.mutate({ positionId: pos.id })}>
                              Close
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
