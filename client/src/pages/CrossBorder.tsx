/**
 * Cross-Border Transfers Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *  - Live FX rate ticker (30-second auto-refresh via trpc.fx.getRates)
 *  - Spread indicator with trend arrow
 *  - Live quote preview while filling the transfer form
 *  - Mojaloop / BRICS Pay / SWIFT rail selector
 *  - Transfer history table with status badges
 */
import { useState, useEffect, useRef } from "react";
import {
  Globe, ArrowRight, Plus, RefreshCw, TrendingUp, TrendingDown,
  Clock, CheckCircle, XCircle, AlertCircle, Zap, Activity,
} from "lucide-react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Skeleton } from "@/components/ui/skeleton";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";

// ─── Constants ────────────────────────────────────────────────────────────────

const CORRIDORS = [
  { value: "NGN-KES", label: "Nigeria → Kenya (NGN → KES)", from: "NGN", to: "KES" },
  { value: "NGN-GHS", label: "Nigeria → Ghana (NGN → GHS)", from: "NGN", to: "GHS" },
  { value: "NGN-ZAR", label: "Nigeria → South Africa (NGN → ZAR)", from: "NGN", to: "ZAR" },
  { value: "NGN-USD", label: "Nigeria → USA (NGN → USD)", from: "NGN", to: "USD" },
  { value: "NGN-GBP", label: "Nigeria → UK (NGN → GBP)", from: "NGN", to: "GBP" },
  { value: "NGN-CNY", label: "Nigeria → China (NGN → CNY)", from: "NGN", to: "CNY" },
  { value: "KES-NGN", label: "Kenya → Nigeria (KES → NGN)", from: "KES", to: "NGN" },
  { value: "ZAR-NGN", label: "South Africa → Nigeria (ZAR → NGN)", from: "ZAR", to: "NGN" },
  { value: "INR-NGN", label: "India → Nigeria (INR → NGN)", from: "INR", to: "NGN" },
  { value: "BRL-USD", label: "Brazil → USA (BRL → USD)", from: "BRL", to: "USD" },
];

const RAILS = [
  { value: "mojaloop", label: "Mojaloop (FSPIOP)", desc: "Open-source interoperable payments", color: "text-cyan-400" },
  { value: "brics_pay", label: "BRICS Pay", desc: "23-currency BRICS settlement", color: "text-orange-400" },
  { value: "swift", label: "SWIFT GPI", desc: "Traditional correspondent banking", color: "text-blue-400" },
];

// Corridors shown in the FX ticker (subset for display)
const TICKER_PAIRS = [
  { base: "NGN", target: "KES", label: "NGN/KES" },
  { base: "NGN", target: "GHS", label: "NGN/GHS" },
  { base: "NGN", target: "ZAR", label: "NGN/ZAR" },
  { base: "NGN", target: "USD", label: "NGN/USD" },
  { base: "NGN", target: "GBP", label: "NGN/GBP" },
  { base: "NGN", target: "CNY", label: "NGN/CNY" },
  { base: "KES", target: "USD", label: "KES/USD" },
  { base: "ZAR", target: "USD", label: "ZAR/USD" },
];

// ─── Status Helpers ───────────────────────────────────────────────────────────

function StatusIcon({ status }: { status: string }) {
  switch (status) {
    case "committed": return <CheckCircle className="w-4 h-4 text-emerald-400" />;
    case "failed": case "aborted": return <XCircle className="w-4 h-4 text-red-400" />;
    case "pending": case "quoted": case "reserved": return <Clock className="w-4 h-4 text-amber-400" />;
    default: return <AlertCircle className="w-4 h-4 text-slate-400" />;
  }
}

function StatusBadge({ status }: { status: string }) {
  const colors: Record<string, string> = {
    committed: "bg-emerald-500/10 text-emerald-400 border-emerald-500/20",
    failed: "bg-red-500/10 text-red-400 border-red-500/20",
    aborted: "bg-red-500/10 text-red-400 border-red-500/20",
    pending: "bg-amber-500/10 text-amber-400 border-amber-500/20",
    quoted: "bg-blue-500/10 text-blue-400 border-blue-500/20",
    reserved: "bg-purple-500/10 text-purple-400 border-purple-500/20",
  };
  return (
    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border ${colors[status] ?? colors.pending}`}>
      <StatusIcon status={status} />
      {status}
    </span>
  );
}

// ─── Live FX Ticker ───────────────────────────────────────────────────────────

function FxTicker() {
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prevRates, setPrevRates] = useState<Record<string, number>>({});

  // Fetch rates from DB (base=USD, then cross-multiply for corridor rates)
  const { data: ratesData, isLoading, refetch } = trpc.fx.getRates.useQuery(
    { base: "USD" },
    { refetchInterval: 30_000 }  // 30-second auto-refresh
  );

  const fetchAndStore = trpc.fx.fetchAndStore.useMutation();

  useEffect(() => {
    if (ratesData) {
      setLastUpdated(new Date());
    }
  }, [ratesData]);

  // Build a rate map: currency → USD rate
  const rateMap: Record<string, number> = {};
  if (ratesData) {
    for (const r of ratesData as any[]) {
      rateMap[r.targetCurrency] = parseFloat(r.rate);
    }
    rateMap["USD"] = 1;
  }

  // Cross-rate: base/target = (base→USD) × (USD→target)
  function getCrossRate(base: string, target: string): number | null {
    if (!rateMap[base] || !rateMap[target]) return null;
    const baseToUsd = 1 / rateMap[base];
    return baseToUsd * rateMap[target];
  }

  const tickerItems = TICKER_PAIRS.map(({ base, target, label }) => {
    const rate = getCrossRate(base, target);
    const prev = prevRates[label];
    const trend = rate && prev ? (rate > prev ? "up" : rate < prev ? "down" : "flat") : "flat";
    return { label, rate, trend };
  });

  // Seed prevRates on first load, then update on each refresh
  useEffect(() => {
    if (!ratesData) return;
    const newMap: Record<string, number> = {};
    for (const { label, base, target } of TICKER_PAIRS) {
      const r = getCrossRate(base, target);
      if (r) newMap[label] = r;
    }
    // Only update prev after initial seed
    if (Object.keys(prevRates).length > 0) {
      setPrevRates(newMap);
    } else {
      setPrevRates(newMap);
    }
  }, [ratesData]);

  const handleRefresh = async () => {
    // Trigger a fresh fetch from open.er-api.com, then re-query
    await fetchAndStore.mutateAsync();
    refetch();
    toast.success("FX rates refreshed");
  };

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm text-white flex items-center gap-2">
            <Activity className="w-4 h-4 text-emerald-400" />
            Live FX Rates
            <Badge className="bg-emerald-500/10 text-emerald-400 border-emerald-500/20 text-[10px]">
              30s refresh
            </Badge>
          </CardTitle>
          <div className="flex items-center gap-3">
            {lastUpdated && (
              <span className="text-xs text-slate-500">
                Updated {lastUpdated.toLocaleTimeString()}
              </span>
            )}
            <Button
              variant="ghost"
              size="icon"
              onClick={handleRefresh}
              className="h-7 w-7 text-slate-400 hover:text-white"
            >
              <RefreshCw className="w-3.5 h-3.5" />
            </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {isLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-14 bg-slate-700 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tickerItems.map(({ label, rate, trend }) => (
              <div
                key={label}
                className="bg-slate-900/60 rounded-lg p-3 border border-slate-700/50 hover:border-slate-600 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400">{label}</span>
                  {trend === "up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                  {trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                </div>
                <div className={`text-sm font-bold font-mono ${
                  trend === "up" ? "text-emerald-400" :
                  trend === "down" ? "text-red-400" : "text-white"
                }`}>
                  {rate != null ? rate.toFixed(4) : "—"}
                </div>
                {/* Spread indicator: 1.5% fee spread */}
                {rate != null && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Spread: {(rate * 0.015).toFixed(4)}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quote Preview ─────────────────────────────────────────────────────────────

function QuotePreview({
  sourceCurrency,
  targetCurrency,
  amount,
  rail,
}: {
  sourceCurrency: string;
  targetCurrency: string;
  amount: string;
  rail: string;
}) {
  const enabled = !!sourceCurrency && !!targetCurrency && !!amount && parseFloat(amount) > 0;

  const { data: quote, isLoading, error } = trpc.crossBorder.getQuote.useQuery(
    { sourceCurrency, targetCurrency, amount, rail: rail as any },
    { enabled, refetchInterval: 30_000, staleTime: 25_000 }
  );

  if (!enabled) return null;
  if (isLoading) return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
      <Skeleton className="h-4 w-3/4 bg-slate-700" />
      <Skeleton className="h-4 w-1/2 bg-slate-700" />
    </div>
  );
  if (error || !quote) return null;

  const expiresIn = quote.expires_at
    ? Math.max(0, Math.round((new Date(quote.expires_at).getTime() - Date.now()) / 1000))
    : null;

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 space-y-2">
      <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium">
        <Zap className="w-3.5 h-3.5" />
        Live Quote
        {expiresIn != null && (
          <span className="ml-auto text-slate-400">Expires in {expiresIn}s</span>
        )}
      </div>
      <div className="grid grid-cols-2 gap-3 text-sm">
        <div>
          <div className="text-slate-400 text-xs">You send</div>
          <div className="text-white font-semibold font-mono">
            {parseFloat(amount).toLocaleString()} {sourceCurrency}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Recipient gets</div>
          <div className="text-emerald-400 font-semibold font-mono">
            {parseFloat(quote.target_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} {targetCurrency}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Exchange rate</div>
          <div className="text-white font-mono text-xs">
            1 {sourceCurrency} = {parseFloat(quote.exchange_rate).toFixed(4)} {targetCurrency}
          </div>
        </div>
        <div>
          <div className="text-slate-400 text-xs">Fee (1.5%)</div>
          <div className="text-amber-400 font-mono text-xs">
            {parseFloat(quote.fee).toLocaleString(undefined, { maximumFractionDigits: 2 })} {quote.fee_currency}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── Initiate Transfer Dialog ─────────────────────────────────────────────────

function InitiateTransferDialog({ onSuccess }: { onSuccess: () => void }) {
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState({
    receiverId: "",
    receiverIdType: "MSISDN",
    corridor: "NGN-KES",
    amount: "",
    receiverName: "",
    rail: "mojaloop",
  });

  const corridorInfo = CORRIDORS.find(c => c.value === form.corridor);

  const initiate = trpc.crossBorder.initiate.useMutation({
    onSuccess: (data) => {
      toast.success(`Transfer initiated! ID: ${data.transferId}`, {
        description: data.bridgeStatus !== "pending"
          ? `Bridge status: ${data.bridgeStatus}`
          : "Awaiting bridge confirmation",
      });
      setOpen(false);
      onSuccess();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.receiverId || !form.amount) {
      toast.error("Receiver ID and amount are required");
      return;
    }
    initiate.mutate({
      receiverId: form.receiverId,
      receiverIdType: form.receiverIdType,
      sourceCurrency: corridorInfo?.from ?? "NGN",
      targetCurrency: corridorInfo?.to ?? "KES",
      amount: form.amount,
      corridor: form.corridor,
      rail: form.rail as any,
      receiverName: form.receiverName || undefined,
    });
  };

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger asChild>
        <Button className="bg-indigo-600 hover:bg-indigo-700 text-white gap-2">
          <Plus className="w-4 h-4" />
          New Transfer
        </Button>
      </DialogTrigger>
      <DialogContent className="bg-slate-900 border-slate-700 text-white max-w-md">
        <DialogHeader>
          <DialogTitle className="text-white flex items-center gap-2">
            <Globe className="w-5 h-5 text-indigo-400" />
            Initiate Cross-Border Transfer
          </DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4 mt-2">
          {/* Corridor */}
          <div>
            <Label className="text-slate-300">Payment Corridor</Label>
            <Select value={form.corridor} onValueChange={v => setForm(f => ({ ...f, corridor: v }))}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {CORRIDORS.map(c => (
                  <SelectItem key={c.value} value={c.value} className="text-white">{c.label}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Rail */}
          <div>
            <Label className="text-slate-300">Payment Rail</Label>
            <Select value={form.rail} onValueChange={v => setForm(f => ({ ...f, rail: v }))}>
              <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                <SelectValue />
              </SelectTrigger>
              <SelectContent className="bg-slate-800 border-slate-700">
                {RAILS.map(r => (
                  <SelectItem key={r.value} value={r.value} className="text-white">
                    <div>
                      <div className={`font-medium ${r.color}`}>{r.label}</div>
                      <div className="text-xs text-slate-400">{r.desc}</div>
                    </div>
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          {/* Receiver */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <Label className="text-slate-300">Receiver ID Type</Label>
              <Select value={form.receiverIdType} onValueChange={v => setForm(f => ({ ...f, receiverIdType: v }))}>
                <SelectTrigger className="bg-slate-800 border-slate-600 text-white mt-1">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-slate-800 border-slate-700">
                  <SelectItem value="MSISDN" className="text-white">Phone (MSISDN)</SelectItem>
                  <SelectItem value="ACCOUNT_ID" className="text-white">Account ID</SelectItem>
                  <SelectItem value="IBAN" className="text-white">IBAN</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label className="text-slate-300">Receiver ID</Label>
              <Input
                value={form.receiverId}
                onChange={e => setForm(f => ({ ...f, receiverId: e.target.value }))}
                placeholder="+254712345678"
                className="bg-slate-800 border-slate-600 text-white mt-1"
                required
              />
            </div>
          </div>

          <div>
            <Label className="text-slate-300">Receiver Name (optional)</Label>
            <Input
              value={form.receiverName}
              onChange={e => setForm(f => ({ ...f, receiverName: e.target.value }))}
              placeholder="John Doe"
              className="bg-slate-800 border-slate-600 text-white mt-1"
            />
          </div>

          {/* Amount */}
          <div>
            <Label className="text-slate-300">
              Amount ({corridorInfo?.from ?? "NGN"})
            </Label>
            <Input
              type="number"
              value={form.amount}
              onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
              placeholder="10000"
              min="1"
              className="bg-slate-800 border-slate-600 text-white mt-1"
              required
            />
          </div>

          {/* Live Quote Preview */}
          {corridorInfo && (
            <QuotePreview
              sourceCurrency={corridorInfo.from}
              targetCurrency={corridorInfo.to}
              amount={form.amount}
              rail={form.rail}
            />
          )}

          <Button
            type="submit"
            className="w-full bg-indigo-600 hover:bg-indigo-700"
            disabled={initiate.isPending}
          >
            {initiate.isPending ? "Initiating..." : "Initiate Transfer"}
          </Button>
        </form>
      </DialogContent>
    </Dialog>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export default function CrossBorder() {
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const utils = trpc.useUtils();

  const { data: transfers, isLoading, refetch } = trpc.crossBorder.list.useQuery({
    limit: 50,
    offset: 0,
    status: statusFilter === "all" ? undefined : statusFilter,
  });

  const stats = {
    total: transfers?.length ?? 0,
    committed: transfers?.filter(t => t.status === "committed").length ?? 0,
    pending: transfers?.filter(t => ["pending", "quoted", "reserved"].includes(t.status)).length ?? 0,
    failed: transfers?.filter(t => ["failed", "aborted"].includes(t.status)).length ?? 0,
  };

  return (
    <div className="p-6 space-y-6 bg-[#0a0f1e] min-h-screen text-white">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <Globe className="w-6 h-6 text-indigo-400" />
            Cross-Border Transfers
          </h1>
          <p className="text-slate-400 text-sm mt-1">
            Mojaloop FSPIOP · BRICS Pay · SWIFT GPI corridors
          </p>
        </div>
        <div className="flex gap-3">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => refetch()}
            className="text-slate-400 hover:text-white"
          >
            <RefreshCw className="w-4 h-4" />
          </Button>
          <InitiateTransferDialog onSuccess={() => utils.crossBorder.list.invalidate()} />
        </div>
      </div>

      {/* Live FX Ticker */}
      <FxTicker />

      {/* Stats */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Total Transfers", value: stats.total, icon: Globe, color: "text-indigo-400" },
          { label: "Committed", value: stats.committed, icon: CheckCircle, color: "text-emerald-400" },
          { label: "Pending", value: stats.pending, icon: Clock, color: "text-amber-400" },
          { label: "Failed", value: stats.failed, icon: XCircle, color: "text-red-400" },
        ].map(({ label, value, icon: Icon, color }) => (
          <Card key={label} className="bg-slate-800/50 border-slate-700">
            <CardContent className="p-4">
              <div className="flex items-center gap-2 mb-1">
                <Icon className={`w-4 h-4 ${color}`} />
                <span className="text-xs text-slate-400">{label}</span>
              </div>
              <p className="text-2xl font-bold text-white">{value}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Filter */}
      <div className="flex gap-2">
        {["all", "pending", "committed", "failed"].map(s => (
          <Button
            key={s}
            variant={statusFilter === s ? "default" : "outline"}
            size="sm"
            onClick={() => setStatusFilter(s)}
            className={statusFilter === s
              ? "bg-indigo-600 text-white border-indigo-600"
              : "border-slate-700 text-slate-300 hover:text-white bg-transparent"}
          >
            {s.charAt(0).toUpperCase() + s.slice(1)}
          </Button>
        ))}
      </div>

      {/* Transfers Table */}
      <Card className="bg-slate-800/50 border-slate-700">
        <CardHeader>
          <CardTitle className="text-base text-slate-200">Transfer History</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="divide-y divide-slate-700">
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="p-4 flex gap-4">
                  <Skeleton className="h-4 w-32 bg-slate-700" />
                  <Skeleton className="h-4 w-24 bg-slate-700" />
                  <Skeleton className="h-4 w-20 bg-slate-700" />
                </div>
              ))}
            </div>
          ) : !transfers || transfers.length === 0 ? (
            <div className="text-center py-12 text-slate-500">
              <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
              <p className="font-medium">No transfers yet</p>
              <p className="text-sm mt-1">Initiate your first cross-border transfer above</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-slate-700">
                    <th className="text-left p-4 text-slate-400 font-medium">Transfer ID</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Corridor</th>
                    <th className="text-right p-4 text-slate-400 font-medium">Source</th>
                    <th className="text-right p-4 text-slate-400 font-medium">Target</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Rail</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Status</th>
                    <th className="text-left p-4 text-slate-400 font-medium">Date</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-700/50">
                  {transfers.map((t) => (
                    <tr key={t.id} className="hover:bg-slate-700/30 transition-colors">
                      <td className="p-4 font-mono text-xs text-slate-300">{t.transferId.slice(0, 20)}…</td>
                      <td className="p-4">
                        <div className="flex items-center gap-1.5 text-white">
                          <span className="font-medium">{t.sourceCurrency}</span>
                          <ArrowRight className="w-3 h-3 text-slate-400" />
                          <span className="font-medium">{t.targetCurrency}</span>
                        </div>
                        <div className="text-xs text-slate-500 mt-0.5">{t.corridor}</div>
                      </td>
                      <td className="p-4 text-right text-white font-medium">
                        {parseFloat(t.sourceAmount).toLocaleString()} {t.sourceCurrency}
                      </td>
                      <td className="p-4 text-right text-emerald-400 font-medium">
                        {parseFloat(t.targetAmount).toLocaleString()} {t.targetCurrency}
                      </td>
                      <td className="p-4">
                        <span className={`text-xs px-2 py-0.5 rounded font-medium ${
                          t.rail === "mojaloop" ? "bg-cyan-500/10 text-cyan-400" :
                          t.rail === "brics_pay" ? "bg-orange-500/10 text-orange-400" :
                          "bg-blue-500/10 text-blue-400"
                        }`}>
                          {t.rail}
                        </span>
                      </td>
                      <td className="p-4"><StatusBadge status={t.status} /></td>
                      <td className="p-4 text-xs text-slate-400">
                        {new Date(t.createdAt).toLocaleDateString("en-NG", { day: "2-digit", month: "short", year: "numeric" })}
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
