/**
 * Cross-Border Transfers Page
 * ─────────────────────────────────────────────────────────────────────────────
 * Features:
 *  - Live FX rate ticker (30s auto-refresh) with corridor volume heatmap overlay
 *  - Quote preview with expiry countdown bar (auto-refetch on expiry)
 *  - Mojaloop / BRICS Pay / SWIFT rail selector
 *  - Transfer history table with status badges
 */
import { useState, useEffect, useCallback, useMemo } from "react";
import {
  Globe, ArrowRight, Plus, RefreshCw, TrendingUp, TrendingDown,
  Clock, CheckCircle, XCircle, AlertCircle, Zap, Activity, BarChart2,
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
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { toast } from "sonner";

// ─── Corridor Comparison ─────────────────────────────────────────────────────

const SETTLEMENT_TIMES: Record<string, string> = {
  mojaloop: "< 30s",
  brics_pay: "< 2 min",
  swift: "1-3 days",
};

function CorridorComparison() {
  const crossBorder30Interval = useAdaptiveInterval(30_000);
  const crossBorderInterval = useAdaptiveInterval(60_000);
  const { data: rates } = trpc.fx.getRates.useQuery({ base: "USD" }, { refetchInterval: crossBorder30Interval }, { staleTime: 30_000 });
  const { data: volumes } = trpc.fx.corridorVolume.useQuery({}, { refetchInterval: crossBorderInterval }, { staleTime: 30_000 });

  const rateMap = useMemo(() => {
    const m: Record<string, number> = { USD: 1 };
    if (Array.isArray(rates)) {
      for (const r of rates as any[]) m[r.targetCurrency] = parseFloat(r.rate);
    }
    return m;
  }, [rates]);

  const volumeMap = useMemo(() => {
    const m: Record<string, number> = {};
    if (Array.isArray(volumes)) {
      for (const v of volumes as any[]) m[v.corridor] = v.transferCount;
    }
    return m;
  }, [volumes]);

  const maxVolume = useMemo(() => Math.max(1, ...Object.values(volumeMap)), [volumeMap]);

  const rows = CORRIDORS.map(c => {
    const srcToUsd = rateMap[c.from] ? 1 / rateMap[c.from] : null;
    const usdToTgt = rateMap[c.to] ?? null;
    const rate = srcToUsd && usdToTgt ? (srcToUsd * usdToTgt).toFixed(4) : "—";
    const vol = volumeMap[c.value] ?? 0;
    const normVol = vol / maxVolume;
    return { ...c, rate, vol, normVol };
  });

  return (
    <Card className="bg-slate-800/50 border-slate-700">
      <CardHeader className="pb-3">
        <CardTitle className="text-base text-slate-200 flex items-center gap-2">
          <BarChart2 className="w-4 h-4 text-indigo-400" />
          Corridor Comparison
          <Badge className="bg-slate-700 text-slate-400 text-[10px] ml-auto">Live rates · 30s refresh</Badge>
        </CardTitle>
      </CardHeader>
      <CardContent className="p-0">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-700 text-[11px] text-slate-400 uppercase tracking-wide">
                <th className="text-left p-3 pl-4">Corridor</th>
                <th className="text-right p-3">Rate</th>
                <th className="text-right p-3">Fee</th>
                <th className="text-right p-3">Settlement (Moja)</th>
                <th className="text-right p-3">Settlement (BRICS)</th>
                <th className="text-right p-3">Settlement (SWIFT)</th>
                <th className="text-left p-3 pr-4">7d Volume</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-700/50">
              {rows.map(r => (
                <tr key={r.value} className="hover:bg-slate-700/20 transition-colors">
                  <td className="p-3 pl-4">
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded">{r.value}</span>
                      <span className="text-slate-400 text-xs hidden md:inline">{r.label.split(" (")[0]}</span>
                    </div>
                  </td>
                  <td className="p-3 text-right font-mono text-slate-200 text-xs">{r.rate}</td>
                  <td className="p-3 text-right text-xs text-amber-400">1.5%</td>
                  <td className="p-3 text-right text-xs text-cyan-400">{SETTLEMENT_TIMES.mojaloop}</td>
                  <td className="p-3 text-right text-xs text-orange-400">{SETTLEMENT_TIMES.brics_pay}</td>
                  <td className="p-3 text-right text-xs text-blue-400">{SETTLEMENT_TIMES.swift}</td>
                  <td className="p-3 pr-4">
                    <div className="flex items-center gap-2">
                      <div className="flex-1 h-1.5 bg-slate-700 rounded-full overflow-hidden min-w-[60px]">
                        <div
                          className="h-full bg-indigo-500 rounded-full transition-all duration-500"
                          style={{ width: `${Math.max(2, r.normVol * 100)}%` }}
                        />
                      </div>
                      <span className="text-[10px] text-slate-400 font-mono w-8 text-right">{r.vol}</span>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </CardContent>
    </Card>
  );
}

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

const TICKER_PAIRS = [
  { base: "NGN", target: "KES", label: "NGN/KES", corridor: "NGN-KES" },
  { base: "NGN", target: "GHS", label: "NGN/GHS", corridor: "NGN-GHS" },
  { base: "NGN", target: "ZAR", label: "NGN/ZAR", corridor: "NGN-ZAR" },
  { base: "NGN", target: "USD", label: "NGN/USD", corridor: "NGN-USD" },
  { base: "NGN", target: "GBP", label: "NGN/GBP", corridor: "NGN-GBP" },
  { base: "NGN", target: "CNY", label: "NGN/CNY", corridor: "NGN-CNY" },
  { base: "KES", target: "USD", label: "KES/USD", corridor: "KES-NGN" },
  { base: "ZAR", target: "USD", label: "ZAR/USD", corridor: "ZAR-NGN" },
];

const QUOTE_TTL_SECONDS = 300; // 5 minutes

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

// ─── Heatmap colour helper ────────────────────────────────────────────────────
// Returns a Tailwind bg class based on relative volume (0–1 normalised)
function heatmapBg(normalised: number): string {
  if (normalised >= 0.75) return "bg-indigo-500/30 border-indigo-400/40";
  if (normalised >= 0.5) return "bg-indigo-500/20 border-indigo-400/30";
  if (normalised >= 0.25) return "bg-indigo-500/10 border-indigo-400/20";
  return "bg-slate-900/60 border-slate-700/50";
}

// ─── Live FX Ticker with Volume Heatmap ──────────────────────────────────────

function FxTicker() {
  const crossBorder30Interval = useAdaptiveInterval(30_000);
  const crossBorderInterval = useAdaptiveInterval(60_000);
  const [lastUpdated, setLastUpdated] = useState<Date | null>(null);
  const [prevRates, setPrevRates] = useState<Record<string, number>>({});

  const { data: ratesData, isLoading: ratesLoading, refetch } = trpc.fx.getRates.useQuery(
    { base: "USD" },
    { refetchInterval: crossBorder30Interval , staleTime: 30_000 })

  const { data: volumeData } = trpc.fx.corridorVolume.useQuery(
    { daysSince: 7 },
    { refetchInterval: crossBorderInterval , staleTime: 30_000 })

  const fetchAndStore = trpc.fx.fetchAndStore.useMutation();

  useEffect(() => {
    if (ratesData) setLastUpdated(new Date());
  }, [ratesData]);

  // Build USD rate map
  const rateMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = { USD: 1 };
    if (ratesData) {
      for (const r of ratesData as any[]) {
        map[r.targetCurrency] = parseFloat(r.rate);
      }
    }
    return map;
  }, [ratesData]);

  function getCrossRate(base: string, target: string): number | null {
    if (!rateMap[base] || !rateMap[target]) return null;
    return (1 / rateMap[base]) * rateMap[target];
  }

  // Build volume map: corridor → transferCount
  const volumeMap = useMemo<Record<string, number>>(() => {
    const map: Record<string, number> = {};
    if (volumeData) {
      for (const v of volumeData as any[]) {
        map[v.corridor] = v.transferCount;
      }
    }
    return map;
  }, [volumeData]);

  const maxVolume = useMemo(
    () => Math.max(1, ...Object.values(volumeMap)),
    [volumeMap]
  );

  const tickerItems = TICKER_PAIRS.map(({ base, target, label, corridor }) => {
    const rate = getCrossRate(base, target);
    const prev = prevRates[label];
    const trend = rate && prev ? (rate > prev ? "up" : rate < prev ? "down" : "flat") : "flat";
    const volume = volumeMap[corridor] ?? 0;
    const normVolume = volume / maxVolume;
    return { label, rate, trend, volume, normVolume, corridor };
  });

  // Update prevRates after each refresh
  useEffect(() => {
    if (!ratesData) return;
    const newMap: Record<string, number> = {};
    for (const { label, base, target } of TICKER_PAIRS) {
      const r = getCrossRate(base, target);
      if (r) newMap[label] = r;
    }
    setPrevRates(newMap);
  }, [ratesData]);

  const handleRefresh = async () => {
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
            <Badge className="bg-indigo-500/10 text-indigo-400 border-indigo-500/20 text-[10px] flex items-center gap-1">
              <BarChart2 className="w-2.5 h-2.5" />
              7d volume
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
              disabled={fetchAndStore.isPending}
             aria-label="Refresh">
                <RefreshCw className={`w-3.5 h-3.5 ${fetchAndStore.isPending ? "animate-spin" : ""}`} />
              </Button>
          </div>
        </div>
      </CardHeader>
      <CardContent className="pt-0">
        {ratesLoading ? (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-20 bg-slate-700 rounded-lg" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {tickerItems.map(({ label, rate, trend, volume, normVolume }) => (
              <div
                key={label}
                className={`rounded-lg p-3 border transition-all duration-500 hover:border-indigo-400/50 ${heatmapBg(normVolume)}`}
              >
                {/* Header row */}
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-slate-400">{label}</span>
                  {trend === "up" && <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />}
                  {trend === "down" && <TrendingDown className="w-3.5 h-3.5 text-red-400" />}
                </div>

                {/* Rate */}
                <div className={`text-sm font-bold font-mono ${
                  trend === "up" ? "text-emerald-400" :
                  trend === "down" ? "text-red-400" : "text-white"
                }`}>
                  {rate != null ? rate.toFixed(4) : "—"}
                </div>

                {/* Spread */}
                {rate != null && (
                  <div className="text-[10px] text-slate-500 mt-0.5">
                    Spread: {(rate * 0.015).toFixed(4)}
                  </div>
                )}

                {/* Volume heatmap bar */}
                <div className="mt-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <span className="text-[10px] text-slate-500">7d vol</span>
                    <span className="text-[10px] text-slate-400 font-mono">{volume}</span>
                  </div>
                  <div className="h-1 bg-slate-700 rounded-full overflow-hidden">
                    <div
                      className="h-full bg-indigo-500 rounded-full transition-all duration-700"
                      style={{ width: `${Math.max(2, normVolume * 100)}%` }}
                    />
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}

// ─── Quote Expiry Countdown Bar ───────────────────────────────────────────────

function QuoteExpiryBar({
  expiresAt,
  onExpired,
}: {
  expiresAt: string;
  onExpired: () => void;
}) {
  const [secondsLeft, setSecondsLeft] = useState<number>(QUOTE_TTL_SECONDS);
  const [expired, setExpired] = useState(false);

  useEffect(() => {
    const update = () => {
      const remaining = Math.max(0, Math.round((new Date(expiresAt).getTime() - Date.now()) / 1000));
      setSecondsLeft(remaining);
      if (remaining === 0 && !expired) {
        setExpired(true);
        onExpired();
      }
    };
    update();
    const id = setInterval(update, 1000);
    return () => clearInterval(id);
  }, [expiresAt, expired, onExpired]);

  const pct = (secondsLeft / QUOTE_TTL_SECONDS) * 100;
  const isUrgent = secondsLeft <= 30;
  const isCritical = secondsLeft <= 10;

  return (
    <div className="space-y-1">
      <div className="flex items-center justify-between text-[10px]">
        <span className={`font-medium ${isCritical ? "text-red-400" : isUrgent ? "text-amber-400" : "text-slate-400"}`}>
          Quote expires in
        </span>
        <span className={`font-mono font-bold ${isCritical ? "text-red-400" : isUrgent ? "text-amber-400" : "text-slate-300"}`}>
          {Math.floor(secondsLeft / 60)}:{String(secondsLeft % 60).padStart(2, "0")}
        </span>
      </div>
      <div className="h-1.5 bg-slate-700 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-1000 ${
            isCritical ? "bg-red-500" : isUrgent ? "bg-amber-500" : "bg-emerald-500"
          }`}
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}

// ─── Quote Preview with Countdown ────────────────────────────────────────────

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
  const [quoteKey, setQuoteKey] = useState(0); // increment to force re-fetch
  const enabled = !!sourceCurrency && !!targetCurrency && !!amount && parseFloat(amount) > 0;

  const { data: quote, isLoading, error } = trpc.crossBorder.getQuote.useQuery(
    { sourceCurrency, targetCurrency, amount, rail: rail as any },
    {
      enabled,
      // Don't auto-refetch — we manage it manually via quoteKey
      refetchOnWindowFocus: false,
      staleTime: QUOTE_TTL_SECONDS * 1000,
    }
  );

  const handleExpired = useCallback(() => {
    setQuoteKey((k: any) => k + 1);
    toast.info("Quote expired — fetching a fresh rate…");
  }, []);

  if (!enabled) return null;
  if (isLoading) return (
    <div className="bg-slate-800/50 rounded-lg p-3 space-y-2">
      <Skeleton className="h-4 w-3/4 bg-slate-700" />
      <Skeleton className="h-4 w-1/2 bg-slate-700" />
      <Skeleton className="h-1.5 w-full bg-slate-700 rounded-full" />
    </div>
  );
  if (error || !quote) return null;

  return (
    <div className="bg-indigo-500/10 border border-indigo-500/20 rounded-lg p-3 space-y-3">
      {/* Header */}
      <div className="flex items-center gap-2 text-xs text-indigo-400 font-medium">
        <Zap className="w-3.5 h-3.5" />
        Live Quote
        <span className="ml-auto text-[10px] text-slate-500 font-mono">{quote.quote_id?.slice(0, 16)}</span>
      </div>

      {/* Rate details */}
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

      {/* Countdown bar */}
      {quote.expires_at && (
        <QuoteExpiryBar
          expiresAt={quote.expires_at}
          onExpired={handleExpired}
        />
      )}
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
    onError: (e: any) => toast.error(e.message),
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

          {/* Live Quote Preview with Countdown */}
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
            {initiate.isPending ? "Initiating…" : "Initiate Transfer"}
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
  }, { staleTime: 30_000 });

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

      {/* Live FX Ticker with Volume Heatmap */}
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

      {/* Gateway Navigation Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
        {[
          { href: "/cross-border/rail-monitor", emoji: "📡", label: "Rail Monitor", desc: "Live health status", color: "text-cyan-400", bg: "bg-cyan-500/10 border-cyan-500/20" },
          { href: "/cross-border/cips", emoji: "🇨🇳", label: "CIPS Gateway", desc: "China CNY transfers", color: "text-red-400", bg: "bg-red-500/10 border-red-500/20" },
          { href: "/cross-border/upi", emoji: "🇮🇳", label: "UPI Gateway", desc: "India INR via VPA", color: "text-orange-400", bg: "bg-orange-500/10 border-orange-500/20" },
          { href: "/cross-border/pix", emoji: "🇧🇷", label: "PIX Gateway", desc: "Brazil BRL instant", color: "text-green-400", bg: "bg-green-500/10 border-green-500/20" },
        ].map(gw => (
          <a key={gw.href} href={gw.href} className={`flex items-center gap-3 p-3 rounded-xl border ${gw.bg} hover:opacity-80 transition-opacity cursor-pointer`}>
            <span className="text-2xl">{gw.emoji}</span>
            <div>
              <p className={`text-sm font-semibold ${gw.color}`}>{gw.label}</p>
              <p className="text-xs text-slate-400">{gw.desc}</p>
            </div>
          </a>
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

      {/* Corridor Comparison View */}
      <CorridorComparison />

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
                  {transfers.map((t: any) => (
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
