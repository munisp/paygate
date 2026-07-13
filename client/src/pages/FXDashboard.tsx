// @ts-nocheck
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp, TrendingDown, RefreshCw, Globe, DollarSign,
  ArrowLeftRight, Settings2, CheckCircle2, AlertTriangle,
  BarChart3, Clock, Zap, ArrowUpRight, ArrowDownRight,
  Send, Loader2, ChevronRight, User, CreditCard, Activity
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import { useResilientSSE } from "@/lib/resilientSSE";
import { toast } from "sonner";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip,
  ResponsiveContainer, BarChart, Bar
} from "recharts";

// --- Currency data ---
const CURRENCIES = [
  { code: "NGN", name: "Nigerian Naira", flag: "🇳🇬", symbol: "₦", region: "West Africa" },
  { code: "KES", name: "Kenyan Shilling", flag: "🇰🇪", symbol: "KSh", region: "East Africa" },
  { code: "GHS", name: "Ghanaian Cedi", flag: "🇬🇭", symbol: "₵", region: "West Africa" },
  { code: "ZAR", name: "South African Rand", flag: "🇿🇦", symbol: "R", region: "Southern Africa" },
  { code: "EGP", name: "Egyptian Pound", flag: "🇪🇬", symbol: "£", region: "North Africa" },
  { code: "TZS", name: "Tanzanian Shilling", flag: "🇹🇿", symbol: "TSh", region: "East Africa" },
  { code: "UGX", name: "Ugandan Shilling", flag: "🇺🇬", symbol: "USh", region: "East Africa" },
  { code: "XOF", name: "West African CFA", flag: "🌍", symbol: "CFA", region: "West Africa" },
  { code: "USD", name: "US Dollar", flag: "🇺🇸", symbol: "$", region: "Global" },
  { code: "EUR", name: "Euro", flag: "🇪🇺", symbol: "€", region: "Global" },
  { code: "GBP", name: "British Pound", flag: "🇬🇧", symbol: "£", region: "Global" },
  { code: "CNY", name: "Chinese Yuan", flag: "🇨🇳", symbol: "¥", region: "BRICS" },
];

// Simulated rates against USD
const BASE_RATES: Record<string, number> = {
  NGN: 1580, KES: 129.5, GHS: 15.2, ZAR: 18.4, EGP: 48.9,
  TZS: 2580, UGX: 3720, XOF: 615, USD: 1, EUR: 0.92, GBP: 0.79, CNY: 7.24,
};

function getRate(from: string, to: string) {
  return BASE_RATES[to] / BASE_RATES[from];
}

function generateHistory(base: number, points = 24) {
  return Array.from({ length: points }, (_, i) => ({
    time: `${String(i).padStart(2, "0")}:00`,
    rate: +(base * (1 + (Math.random() - 0.5) * 0.02)).toFixed(4),
  }));
}

const FX_COST_DATA = [
  { method: "PayGate Direct", cost: 0.8, color: "#3b82f6" },
  { method: "SWIFT Wire", cost: 3.5, color: "#ef4444" },
  { method: "Traditional Bank", cost: 4.2, color: "#f97316" },
  { method: "Wise/Remitly", cost: 1.4, color: "#8b5cf6" },
  { method: "Western Union", cost: 5.1, color: "#6b7280" },
];

function RateAlertDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [base, setBase] = useState("USD");
  const [target, setTarget] = useState("NGN");
  const [threshold, setThreshold] = useState("");
  const [direction, setDirection] = useState<"above" | "below">("above");
  const setAlert = trpc.fx.setAlert.useMutation({
    onSuccess: () => { toast.success("Rate alert configured — you will be notified via the platform"); onClose(); },
    onError: (e: any) => toast.error(e.message),
  });
  return (
    <Dialog open={open} onOpenChange={(o: any) => !o && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader><DialogTitle>Add Rate Alert</DialogTitle></DialogHeader>
        <div className="space-y-4 py-2">
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label>Base Currency</Label>
              <select value={base} onChange={e => setBase(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
            <div className="space-y-1.5">
              <Label>Target Currency</Label>
              <select value={target} onChange={e => setTarget(e.target.value)} className="w-full px-3 py-2 rounded-lg border border-border bg-background text-sm">
                {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.code}</option>)}
              </select>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Direction</Label>
            <div className="flex gap-2">
              {(["above", "below"] as const).map(d => (
                <button key={d} onClick={() => setDirection(d)} className={`flex-1 py-2 rounded-lg text-sm font-medium border transition-colors capitalize ${
                  direction === d ? "bg-primary text-primary-foreground border-primary" : "border-border text-muted-foreground hover:bg-muted"
                }`}>{d}</button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <Label>Threshold Rate</Label>
            <Input type="number" value={threshold} onChange={e => setThreshold(e.target.value)} placeholder="e.g. 1600" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button disabled={!threshold || setAlert.isPending} onClick={() => setAlert.mutate({ baseCurrency: base, targetCurrency: target, threshold: parseFloat(threshold), direction })}>
            {setAlert.isPending ? "Saving..." : "Set Alert"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export default function FXDashboard() {
  const fxInterval = useAdaptiveInterval(60_000);
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("NGN");
  const [amount, setAmount] = useState("1000");
  const [rates, setRates] = useState(BASE_RATES);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [settlementCurrency, setSettlementCurrency] = useState("NGN");
  const [tab, setTab] = useState<"rates" | "converter" | "analytics" | "settings" | "transfer">("rates");
  const [autoRefresh, setAutoRefresh] = useState(true);
  const [alertDialogOpen, setAlertDialogOpen] = useState(false);

  // ── Mojaloop Transfer State ──────────────────────────────────────────────
  const [xbTab, setXbTab] = useState<"send" | "history">("send");
  const [xbStep, setXbStep] = useState<"form" | "quote" | "confirm" | "done">("form");
  const [xbForm, setXbForm] = useState({
    receiverId: "", receiverIdType: "MSISDN",
    sourceCurrency: "NGN", targetCurrency: "KES",
    amount: "", corridor: "NG-KE", rail: "mojaloop" as "mojaloop" | "brics_pay" | "swift",
    senderName: "", receiverName: "",
  });
  const [xbQuote, setXbQuote] = useState<any>(null);
  const [xbResult, setXbResult] = useState<any>(null);
  const [xbStatusMsg, setXbStatusMsg] = useState("");

  const xbQuoteMutation = trpc.crossBorder.getQuote.useQuery(
    { sourceCurrency: xbForm.sourceCurrency, targetCurrency: xbForm.targetCurrency, amount: xbForm.amount, rail: xbForm.rail },
    { enabled: false , staleTime: 30_000 })
  const xbInitiateMutation = trpc.crossBorder.initiate.useMutation({
    onSuccess: (data) => {
      setXbResult(data);
      setXbStep("done");
      setXbStatusMsg("Transfer submitted successfully via " + xbForm.rail.toUpperCase());
    },
    onError: (e: any) => {
      toast.error(e.message);
    },
  });
  const xbHistoryQuery = trpc.crossBorder.list.useQuery(
    { limit: 20, offset: 0 },
    { enabled: (tab as string, { staleTime: 30_000 }) === "transfer" && xbTab === "history" }
  );

  // Poll status every 5 s after submission (simulates SSE)
  useEffect(() => {
    if (xbStep !== "done" || !xbResult?.transferId) return;
    const STATUSES = ["pending", "submitted", "processing", "completed"];
    let idx = 0;
    const iv = setInterval(() => {
      idx = Math.min(idx + 1, STATUSES.length - 1);
      setXbStatusMsg(`Transfer ${xbResult.transferId} — ${STATUSES[idx]}`);
      if (STATUSES[idx] === "completed") clearInterval(iv);
    }, 5000);
    return () => clearInterval(iv);
  }, [xbStep, xbResult]);

  async function handleXbGetQuote() {
    if (!xbForm.amount || parseFloat(xbForm.amount) <= 0) {
      toast.error("Enter a valid amount"); return;
    }
    const result = await xbQuoteMutation.refetch();
    if (result.data) { setXbQuote(result.data); setXbStep("quote"); }
    else toast.error("Could not fetch quote — using estimated rate");
  }

  function handleXbConfirm() {
    xbInitiateMutation.mutate({
      receiverId: xbForm.receiverId,
      receiverIdType: xbForm.receiverIdType,
      sourceCurrency: xbForm.sourceCurrency,
      targetCurrency: xbForm.targetCurrency,
      amount: xbForm.amount,
      corridor: xbForm.corridor,
      rail: xbForm.rail,
      quoteId: xbQuote?.quote_id,
      senderName: xbForm.senderName || undefined,
      receiverName: xbForm.receiverName || undefined,
    });
  }

  // ─── SSE: Real-time market ticker from /api/market/stream (resilient) ───────
  const [sseConnected, setSseConnected] = useState(false);
  const { connected: sseActive } = useResilientSSE<{ timestamp: string; usdNGN?: number; gbpNGN?: number; eurNGN?: number }>({
    url: "/api/market/stream",
    enabled: autoRefresh,
    onMessage: (data) => {
      setLastUpdated(new Date(data.timestamp).toLocaleTimeString());
      setRates(prev => ({
        ...prev,
        ...(data.usdNGN ? { NGN: data.usdNGN } : {}),
        ...(data.gbpNGN && data.usdNGN ? { GBP: +(data.usdNGN / data.gbpNGN).toFixed(6) } : {}),
        ...(data.eurNGN && data.usdNGN ? { EUR: +(data.usdNGN / data.eurNGN).toFixed(6) } : {}),
      }));
    },
    onConnected: (c) => setSseConnected(c),
  });
  // Keep sseConnected in sync with resilient SSE state
  useEffect(() => { setSseConnected(sseActive); }, [sseActive]);

  // Live FX rates from DB
  const { data: liveRates, refetch: refetchRates } = trpc.fx.getRates.useQuery({ base: "USD" }, { refetchInterval: autoRefresh ? fxInterval : false }, { staleTime: 30_000 });
  // Live corridor limits
  const { data: corridorLimits } = trpc.wave32.corridors.list.useQuery({ tenantId: "ten_paygate_default" }, { staleTime: 30_000 });
  const fetchAndStoreMutation = trpc.fx.fetchAndStore.useMutation({
    onSuccess: (d: any) => { toast.success(`Fetched ${d.count} live rates`); refetchRates(); },
    onError: () => toast.error("Failed to fetch live rates"),
  });
  const convertMutation = trpc.fx.convertCurrency.useMutation({
    onSuccess: (d: any) => toast.success(`Conversion complete: ${d.convertedAmount.toLocaleString(undefined, { maximumFractionDigits: 2 })} ${d.toCurrency} (ref: ${d.conversionId})`),
    onError: (e: any) => toast.error(e.message),
  });
  const savePrefsMutation = trpc.fx.savePreferences.useMutation({
    onSuccess: () => toast.success("Settlement preferences saved!"),
    onError: (e: any) => toast.error(e.message),
  });

  // Merge live DB rates into the rates map
  useEffect(() => {
    if (liveRates && liveRates.length > 0) {
      const updated = { ...BASE_RATES };
      liveRates.forEach(r => { updated[r.targetCurrency] = parseFloat(r.rate); });
      setRates(updated);
      setLastUpdated(new Date(liveRates[0].fetchedAt).toLocaleTimeString());
    }
  }, [liveRates]);

  // Simulate rate fluctuations only when no live data
  useEffect(() => {
    if (!autoRefresh || (liveRates && liveRates.length > 0)) return;
    const interval = setInterval(() => {
      setRates(prev => {
        const updated = { ...prev };
        Object.keys(updated).forEach(k => {
          if (k !== "USD") updated[k] = +(updated[k] * (1 + (Math.random() - 0.5) * 0.003)).toFixed(4);
        });
        return updated;
      });
      setLastUpdated(new Date().toLocaleTimeString());
    }, 5000);
    return () => clearInterval(interval);
  }, [autoRefresh, liveRates]);

  const currentRate = getRate(fromCurrency, toCurrency);
  const convertedAmount = (parseFloat(amount || "0") * currentRate).toFixed(2);
  const fxFee = (parseFloat(amount || "0") * 0.008).toFixed(2);
  const history = generateHistory(currentRate);

  const fromCurr = CURRENCIES.find(c => c.code === fromCurrency)!;
  const toCurr = CURRENCIES.find(c => c.code === toCurrency)!;

  const swapCurrencies = () => {
    setFromCurrency(toCurrency);
    setToCurrency(fromCurrency);
  };

  return (
    <div className="p-6 space-y-6 max-w-[1400px] mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>FX & Multi-Currency</h1>
          <p className="text-muted-foreground text-sm mt-0.5">Live exchange rates, currency conversion, and FX cost analytics</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2 text-xs text-muted-foreground">
            <div className={`w-2 h-2 rounded-full ${autoRefresh ? "bg-emerald-500 animate-pulse" : "bg-muted-foreground"}`} />
            Updated {lastUpdated}
            {sseConnected && (
              <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-full bg-emerald-100 text-emerald-700 text-[10px] font-semibold tracking-wide">
                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 animate-pulse" />
                SSE LIVE
              </span>
            )}
          </div>
          <button onClick={() => setAutoRefresh(p => !p)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${autoRefresh ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-muted text-muted-foreground"}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <Button size="sm" variant="outline" aria-label="Refresh" onClick={() => fetchAndStoreMutation.mutate()} disabled={fetchAndStoreMutation.isPending}><RefreshCw/>
            {fetchAndStoreMutation.isPending ? 'Fetching...' : 'Fetch Live Rates'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Currencies Supported", value: liveRates && liveRates.length > 0 ? String(liveRates.length) : String(Object.keys(rates).length), sub: "African + Global", icon: Globe, cls: "text-primary" },
          { label: "Avg FX Spread", value: "0.8%", sub: "vs 3.5% SWIFT avg", icon: TrendingDown, cls: "text-emerald-600" },
          { label: "Live Rates Cached", value: liveRates ? `${liveRates.length}` : "…", sub: "From external feed", icon: DollarSign, cls: "text-blue-600" },
          { label: "Settlement Time", value: "<2hr", sub: "PAPSS & BRICS Pay", icon: Zap, cls: "text-amber-600" },
        ].map(s => (
          <div key={s.label} className="stat-card">
            <div className="flex items-center justify-between mb-2">
              <p className="text-sm text-muted-foreground">{s.label}</p>
              <s.icon className={`w-4 h-4 ${s.cls}`} />
            </div>
            <p className={`text-2xl font-bold ${s.cls}`} style={{ fontFamily: "Space Grotesk, sans-serif" }}>{s.value}</p>
            <p className="text-xs text-muted-foreground mt-1">{s.sub}</p>
          </div>
        ))}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 bg-muted p-1 rounded-xl w-fit">
        {(["rates", "converter", "analytics", "settings", "transfer"] as const).map(t => (
          <button key={t} onClick={() => setTab(t as any)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "rates" ? "Live Rates" : t === "converter" ? "Converter" : t === "analytics" ? "FX Analytics" : t === "settings" ? "Settlement" : "Send Money"}
          </button>
        ))}
      </div>

      {/* Live Rates Tab */}
      {tab === "rates" && (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {CURRENCIES.filter(c => c.code !== "USD").map(curr => {
            const rate = rates[curr.code];
            const baseRate = BASE_RATES[curr.code];
            const change = ((rate - baseRate) / baseRate) * 100;
            const isUp = change >= 0;
            return (
              <div key={curr.code} className="bg-card rounded-xl border border-border p-4 hover:border-primary/30 transition-all cursor-pointer group" onClick={() => { setFromCurrency("USD"); setToCurrency(curr.code); setTab("converter"); }}>
                <div className="flex items-center justify-between mb-3">
                  <div className="flex items-center gap-2.5">
                    <span className="text-2xl">{curr.flag}</span>
                    <div>
                      <p className="font-semibold text-sm">{curr.code}</p>
                      <p className="text-xs text-muted-foreground">{curr.name}</p>
                    </div>
                  </div>
                  <div className={`flex items-center gap-1 text-xs font-medium ${isUp ? "text-red-600" : "text-emerald-600"}`}>
                    {isUp ? <TrendingUp className="w-3.5 h-3.5" /> : <TrendingDown className="w-3.5 h-3.5" />}
                    {Math.abs(change).toFixed(3)}%
                  </div>
                </div>
                <div className="flex items-end justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">1 USD =</p>
                    <p className="text-xl font-bold amount" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                      {curr.symbol}{rate.toLocaleString(undefined, { maximumFractionDigits: 2 })}
                    </p>
                  </div>
                  <Badge className="text-xs border-0 bg-muted text-muted-foreground group-hover:bg-primary/10 group-hover:text-primary transition-colors">
                    {curr.region}
                  </Badge>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Converter Tab */}
      {tab === "converter" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-6 space-y-5">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Currency Converter</h3>

            {/* From */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">From</label>
              <div className="flex gap-3">
                <select value={fromCurrency} onChange={e => setFromCurrency(e.target.value)} className="px-3 py-3 bg-muted rounded-xl border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
                <input type="number" value={amount} onChange={e => setAmount(e.target.value)} className="flex-1 px-4 py-3 bg-muted rounded-xl border border-border text-lg font-semibold amount focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.00" />
              </div>
            </div>

            {/* Swap button */}
            <div className="flex justify-center">
              <button onClick={swapCurrencies} className="p-3 rounded-xl bg-muted hover:bg-primary hover:text-primary-foreground transition-all group">
                <ArrowLeftRight className="w-5 h-5 text-muted-foreground group-hover:text-primary-foreground" />
              </button>
            </div>

            {/* To */}
            <div className="space-y-2">
              <label className="text-sm font-medium text-muted-foreground">To</label>
              <div className="flex gap-3">
                <select value={toCurrency} onChange={e => setToCurrency(e.target.value)} className="px-3 py-3 bg-muted rounded-xl border border-border text-sm font-medium focus:outline-none focus:ring-2 focus:ring-ring">
                  {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code}</option>)}
                </select>
                <div className="flex-1 px-4 py-3 bg-primary/5 rounded-xl border border-primary/20 text-lg font-bold amount text-primary">
                  {parseFloat(convertedAmount).toLocaleString(undefined, { maximumFractionDigits: 2 })}
                </div>
              </div>
            </div>

            {/* Rate info */}
            <div className="bg-muted/50 rounded-xl p-4 space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">Exchange Rate</span>
                <span className="font-semibold amount">1 {fromCurrency} = {currentRate.toFixed(4)} {toCurrency}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-muted-foreground">PayGate FX Fee (0.8%)</span>
                <span className="font-semibold text-emerald-600">−{fromCurr.symbol}{parseFloat(fxFee).toLocaleString()}</span>
              </div>
              <div className="h-px bg-border" />
              <div className="flex justify-between text-sm font-semibold">
                <span>You receive</span>
                <span className="amount">{toCurr.symbol}{(parseFloat(convertedAmount) * 0.992).toLocaleString(undefined, { maximumFractionDigits: 2 })}</span>
              </div>
            </div>

            <Button className="w-full" disabled={convertMutation.isPending || !amount || parseFloat(amount) <= 0} onClick={() => convertMutation.mutate({ fromCurrency, toCurrency, amount: parseFloat(amount) })}>
              {convertMutation.isPending ? "Converting..." : "Convert & Settle"}
            </Button>
          </div>

          {/* Rate history chart */}
          <div className="bg-card rounded-xl border border-border p-5">
            <div className="flex items-center justify-between mb-4">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
                {fromCurrency}/{toCurrency} Rate — 24h
              </h3>
              <Badge className="text-xs border-0 bg-muted text-muted-foreground">Simulated</Badge>
            </div>
            <ResponsiveContainer width="100%" height={200}>
              <LineChart data={history}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="time" tick={{ fontSize: 11 }} interval={3} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} tickFormatter={v => v.toFixed(2)} />
                <Tooltip formatter={(v: number) => [v.toFixed(4), `${fromCurrency}/${toCurrency}`]} />
                <Line type="monotone" dataKey="rate" stroke="hsl(var(--primary))" strokeWidth={2} dot={false} />
              </LineChart>
            </ResponsiveContainer>
            <div className="mt-4 grid grid-cols-3 gap-3">
              {[
                { label: "24h High", value: Math.max(...history.map(h => h.rate)).toFixed(4) },
                { label: "24h Low", value: Math.min(...history.map(h => h.rate)).toFixed(4) },
                { label: "Current", value: currentRate.toFixed(4) },
              ].map(s => (
                <div key={s.label} className="bg-muted/50 rounded-lg p-3 text-center">
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                  <p className="text-sm font-semibold amount mt-0.5">{s.value}</p>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* FX Analytics Tab */}
      {tab === "analytics" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>FX Cost Comparison</h3>
            <p className="text-xs text-muted-foreground mb-4">Average fee as % of transaction value for $1,000 transfer to Africa</p>
            <div className="space-y-3">
              {FX_COST_DATA.map(item => (
                <div key={item.method} className="flex items-center gap-3">
                  <div className="w-36 flex-shrink-0">
                    <p className="text-xs font-medium">{item.method}</p>
                  </div>
                  <div className="flex-1 h-6 bg-muted rounded-lg overflow-hidden relative">
                    <div className="h-full rounded-lg transition-all" style={{ width: `${(item.cost / 6) * 100}%`, background: item.color }} />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-xs font-bold" style={{ color: item.color }}>{item.cost}%</span>
                  </div>
                  {item.method === "PayGate Direct" && (
                    <Badge className="text-xs border-0 bg-emerald-100 text-emerald-700 flex-shrink-0">Best</Badge>
                  )}
                </div>
              ))}
            </div>
            <div className="mt-4 p-3 bg-emerald-50 rounded-xl border border-emerald-200">
              <p className="text-xs font-semibold text-emerald-700">💡 Savings with PayGate</p>
              <p className="text-xs text-emerald-600 mt-1">On $10,000/month in cross-border payments, PayGate saves you ~$270/month vs SWIFT.</p>
            </div>
          </div>

          <div className="bg-card rounded-xl border border-border p-5">
            <h3 className="font-semibold mb-4" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Settlement Rails</h3>
            <div className="space-y-3">
              {[
                { name: "PAPSS", desc: "Pan-African Payment & Settlement System", speed: "<2hr", cost: "0.5%", status: "active", coverage: "54 African countries" },
                { name: "BRICS Pay", desc: "BRICS nations payment network", speed: "<4hr", cost: "0.6%", status: "active", coverage: "Brazil, Russia, India, China, SA" },
                { name: "SWIFT", desc: "Society for Worldwide Interbank Financial Telecom", speed: "1-3 days", cost: "3.5%", status: "active", coverage: "200+ countries" },
                { name: "Stablecoin (USDC)", desc: "Circle USDC on-chain settlement", speed: "<5min", cost: "0.2%", status: "beta", coverage: "Global" },
              ].map(rail => (
                <div key={rail.name} className="flex items-start gap-3 p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-semibold">{rail.name}</p>
                      <Badge className={`text-xs border-0 ${rail.status === "active" ? "bg-emerald-100 text-emerald-700" : "bg-amber-100 text-amber-700"}`}>{rail.status}</Badge>
                    </div>
                    <p className="text-xs text-muted-foreground mt-0.5">{rail.desc}</p>
                    <p className="text-xs text-muted-foreground mt-0.5">Coverage: {rail.coverage}</p>
                  </div>
                  <div className="text-right flex-shrink-0">
                    <p className="text-xs font-semibold text-emerald-600">{rail.speed}</p>
                    <p className="text-xs text-muted-foreground">{rail.cost} fee</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Mojaloop Transfer Tab */}
      {(tab as string) === "transfer" && (
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          {/* Left: form / stepper */}
          <div className="md:col-span-2 bg-card rounded-xl border border-border p-6 space-y-5">
            <div className="flex items-center justify-between">
              <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Cross-Border Transfer</h3>
              <div className="flex gap-1 bg-muted p-1 rounded-lg">
                {(["send", "history"] as const).map(t => (
                  <button key={t} onClick={() => setXbTab(t)} className={`px-3 py-1.5 rounded-md text-xs font-medium capitalize transition-all ${xbTab === t ? "bg-background shadow-sm" : "text-muted-foreground"}`}>{t === "send" ? "New Transfer" : "History"}</button>
                ))}
              </div>
            </div>

            {xbTab === "send" && (
              <>
                {/* Step indicator */}
                <div className="flex items-center gap-2 text-xs">
                  {(["form", "quote", "confirm", "done"] as const).map((s: any, i: any) => (
                    <>
                      <div key={s} className={`flex items-center gap-1.5 px-2.5 py-1 rounded-full font-medium ${
                        xbStep === s ? "bg-primary text-primary-foreground" :
                        ["form","quote","confirm","done"].indexOf(xbStep) > i ? "bg-emerald-100 text-emerald-700" : "bg-muted text-muted-foreground"
                      }`}>
                        {["form","quote","confirm","done"].indexOf(xbStep) > i ? <CheckCircle2 className="w-3 h-3" /> : <span>{i+1}</span>}
                        {s === "form" ? "Details" : s === "quote" ? "Quote" : s === "confirm" ? "Confirm" : "Done"}
                      </div>
                      {i < 3 && <ChevronRight className="w-3 h-3 text-muted-foreground" />}
                    </>
                  ))}
                </div>

                {/* Step 1: Form */}
                {xbStep === "form" && (
                  <div className="space-y-4">
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">From Currency</label>
                        <select value={xbForm.sourceCurrency} onChange={e => setXbForm(p => ({ ...p, sourceCurrency: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
                        </select>
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">To Currency</label>
                        <select value={xbForm.targetCurrency} onChange={e => setXbForm(p => ({ ...p, targetCurrency: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {CURRENCIES.map(c => <option key={c.code} value={c.code}>{c.flag} {c.code} — {c.name}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Amount ({xbForm.sourceCurrency})</label>
                      <input type="number" value={xbForm.amount} onChange={e => setXbForm(p => ({ ...p, amount: e.target.value }))} className="w-full px-4 py-3 rounded-xl border border-border bg-background text-lg font-semibold amount focus:outline-none focus:ring-2 focus:ring-ring" placeholder="0.00" />
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Receiver ID</label>
                        <input value={xbForm.receiverId} onChange={e => setXbForm(p => ({ ...p, receiverId: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="+234 801 234 5678" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">ID Type</label>
                        <select value={xbForm.receiverIdType} onChange={e => setXbForm(p => ({ ...p, receiverIdType: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          {["MSISDN", "IBAN", "ACCOUNT_NO", "EMAIL"].map(t => <option key={t} value={t}>{t}</option>)}
                        </select>
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Receiver Name (optional)</label>
                        <input value={xbForm.receiverName} onChange={e => setXbForm(p => ({ ...p, receiverName: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring" placeholder="Jane Doe" />
                      </div>
                      <div className="space-y-1.5">
                        <label className="text-sm font-medium">Settlement Rail</label>
                        <select value={xbForm.rail} onChange={e => setXbForm(p => ({ ...p, rail: e.target.value as any }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                          <option value="mojaloop">Mojaloop (FSPIOP)</option>
                          <option value="brics_pay">BRICS Pay</option>
                          <option value="swift">SWIFT</option>
                        </select>
                      </div>
                    </div>
                    <div className="space-y-1.5">
                      <label className="text-sm font-medium">Corridor</label>
                      <select value={xbForm.corridor} onChange={e => setXbForm(p => ({ ...p, corridor: e.target.value }))} className="w-full px-3 py-2.5 rounded-xl border border-border bg-background text-sm focus:outline-none focus:ring-2 focus:ring-ring">
                        {["NG-KE","NG-GH","NG-ZA","NG-TZ","NG-UG","KE-GH","ZA-KE","GH-TZ","NG-US","NG-GB","NG-CN"].map(c => <option key={c} value={c}>{c}</option>)}
                      </select>
                    </div>
                    <Button className="w-full" onClick={handleXbGetQuote} disabled={xbQuoteMutation.isFetching || !xbForm.receiverId || !xbForm.amount}>
                      {xbQuoteMutation.isFetching ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Getting Quote...</> : <>Get Quote <ChevronRight className="w-4 h-4 ml-1" /></>}
                    </Button>
                  </div>
                )}

                {/* Step 2: Quote */}
                {xbStep === "quote" && xbQuote && (
                  <div className="space-y-4">
                    <div className="bg-primary/5 rounded-xl border border-primary/20 p-5 space-y-3">
                      <p className="text-sm font-semibold text-primary">Quote received</p>
                      <div className="grid grid-cols-2 gap-3 text-sm">
                        {[
                          { label: "Exchange Rate", value: `1 ${xbForm.sourceCurrency} = ${parseFloat(xbQuote.exchange_rate).toFixed(4)} ${xbForm.targetCurrency}` },
                          { label: "You Send", value: `${parseFloat(xbForm.amount).toLocaleString()} ${xbForm.sourceCurrency}` },
                          { label: "Recipient Gets", value: `${parseFloat(xbQuote.target_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${xbForm.targetCurrency}` },
                          { label: "Fee", value: `${parseFloat(xbQuote.fee).toLocaleString()} ${xbQuote.fee_currency}` },
                          { label: "Rail", value: xbForm.rail.toUpperCase() },
                          { label: "Quote Expires", value: new Date(xbQuote.expires_at).toLocaleTimeString() },
                        ].map(r => (
                          <div key={r.label} className="bg-background rounded-lg p-3">
                            <p className="text-xs text-muted-foreground">{r.label}</p>
                            <p className="font-semibold mt-0.5 amount">{r.value}</p>
                          </div>
                        ))}
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={() => setXbStep("form")}>Back</Button>
                      <Button className="flex-1" onClick={() => setXbStep("confirm")}>Confirm Transfer <ChevronRight className="w-4 h-4 ml-1" /></Button>
                    </div>
                  </div>
                )}

                {/* Step 3: Confirm */}
                {xbStep === "confirm" && (
                  <div className="space-y-4">
                    <div className="bg-amber-50 border border-amber-200 rounded-xl p-4">
                      <p className="text-sm font-semibold text-amber-800">Review before submitting</p>
                      <p className="text-xs text-amber-700 mt-1">This transfer will be sent via {xbForm.rail.toUpperCase()} and cannot be reversed once accepted by the network.</p>
                    </div>
                    <div className="space-y-2 text-sm">
                      {[
                        { label: "Receiver", value: `${xbForm.receiverId} (${xbForm.receiverIdType})` },
                        { label: "Receiver Name", value: xbForm.receiverName || "—" },
                        { label: "Amount", value: `${parseFloat(xbForm.amount).toLocaleString()} ${xbForm.sourceCurrency}` },
                        { label: "Recipient Gets", value: xbQuote ? `${parseFloat(xbQuote.target_amount).toLocaleString(undefined, { maximumFractionDigits: 2 })} ${xbForm.targetCurrency}` : "—" },
                        { label: "Rail", value: xbForm.rail.toUpperCase() },
                        { label: "Corridor", value: xbForm.corridor },
                      ].map(r => (
                        <div key={r.label} className="flex justify-between py-2 border-b border-border last:border-0">
                          <span className="text-muted-foreground">{r.label}</span>
                          <span className="font-medium">{r.value}</span>
                        </div>
                      ))}
                    </div>
                    <div className="flex gap-3">
                      <Button variant="outline" className="flex-1" onClick={() => setXbStep("quote")}>Back</Button>
                      <Button className="flex-1" onClick={handleXbConfirm} disabled={xbInitiateMutation.isPending}>
                        {xbInitiateMutation.isPending ? <><Loader2 className="w-4 h-4 mr-2 animate-spin" />Submitting...</> : <><Send className="w-4 h-4 mr-2" />Submit Transfer</>}
                      </Button>
                    </div>
                  </div>
                )}

                {/* Step 4: Done */}
                {xbStep === "done" && xbResult && (
                  <div className="space-y-4">
                    <div className="bg-emerald-50 border border-emerald-200 rounded-xl p-5 text-center">
                      <CheckCircle2 className="w-10 h-10 text-emerald-600 mx-auto mb-2" />
                      <p className="font-semibold text-emerald-800">Transfer Submitted</p>
                      <p className="text-xs text-emerald-700 mt-1">Transfer ID: {xbResult.transferId}</p>
                    </div>
                    {/* Live status feed */}
                    <div className="bg-muted/50 rounded-xl p-4 space-y-2">
                      <div className="flex items-center gap-2 text-sm font-medium">
                        <Activity className="w-4 h-4 text-primary animate-pulse" />
                        Live Status
                      </div>
                      <p className="text-sm text-muted-foreground font-mono">{xbStatusMsg || "Awaiting network confirmation..."}</p>
                    </div>
                    <div className="grid grid-cols-2 gap-3 text-sm">
                      {[
                        { label: "Bridge Status", value: xbResult.bridgeStatus },
                        { label: "Bridge Transfer ID", value: xbResult.bridgeTransferId ?? "—" },
                      ].map(r => (
                        <div key={r.label} className="bg-background rounded-lg border border-border p-3">
                          <p className="text-xs text-muted-foreground">{r.label}</p>
                          <p className="font-semibold mt-0.5 font-mono text-xs">{r.value}</p>
                        </div>
                      ))}
                    </div>
                    <Button variant="outline" className="w-full" onClick={() => { setXbStep("form"); setXbResult(null); setXbQuote(null); setXbStatusMsg(""); }}>New Transfer</Button>
                  </div>
                )}
              </>
            )}

            {/* History sub-tab */}
            {xbTab === "history" && (
              <div className="space-y-3">
                {xbHistoryQuery.isLoading && <div className="flex items-center justify-center py-8"><Loader2 className="w-6 h-6 animate-spin text-muted-foreground" /></div>}
                {!xbHistoryQuery.isLoading && (!xbHistoryQuery.data || xbHistoryQuery.data.length === 0) && (
                  <div className="text-center py-10 text-muted-foreground">
                    <Globe className="w-8 h-8 mx-auto mb-2 opacity-40" />
                    <p className="text-sm">No cross-border transfers yet</p>
                  </div>
                )}
                {xbHistoryQuery.data?.map((t: any) => (
                  <div key={t.id} className="flex items-center justify-between p-3 rounded-xl bg-muted/50 hover:bg-muted transition-colors">
                    <div className="flex items-center gap-3">
                      <div className="w-9 h-9 rounded-full bg-primary/10 flex items-center justify-center">
                        <Send className="w-4 h-4 text-primary" />
                      </div>
                      <div>
                        <p className="text-sm font-medium">{t.transferId}</p>
                        <p className="text-xs text-muted-foreground">{t.sourceCurrency} → {t.targetCurrency} · {t.corridor} · {t.rail?.toUpperCase()}</p>
                      </div>
                    </div>
                    <div className="text-right">
                      <p className="text-sm font-semibold amount">{parseFloat(t.sourceAmount).toLocaleString()} {t.sourceCurrency}</p>
                      <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${
                        t.status === "completed" ? "bg-emerald-100 text-emerald-700" :
                        t.status === "failed" ? "bg-red-100 text-red-700" :
                        "bg-amber-100 text-amber-700"
                      }`}>{t.status}</span>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Right: info panel */}
          <div className="space-y-4">
            <div className="bg-card rounded-xl border border-border p-4 space-y-3">
              <h4 className="font-semibold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Supported Rails</h4>
              {[
                { name: "Mojaloop", desc: "FSPIOP-compliant open-source switch", badge: "Recommended", color: "emerald" },
                { name: "BRICS Pay", desc: "BRICS nations settlement network", badge: "Active", color: "blue" },
                { name: "SWIFT", desc: "Global correspondent banking", badge: "Active", color: "gray" },
              ].map(r => (
                <div key={r.name} className="flex items-start gap-2.5 p-2.5 rounded-lg bg-muted/50">
                  <CreditCard className="w-4 h-4 mt-0.5 text-muted-foreground flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1.5">
                      <p className="text-xs font-semibold">{r.name}</p>
                      <span className={`text-[10px] px-1.5 py-0.5 rounded-full bg-${r.color}-100 text-${r.color}-700`}>{r.badge}</span>
                    </div>
                    <p className="text-[11px] text-muted-foreground mt-0.5">{r.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="bg-card rounded-xl border border-border p-4 space-y-2">
              <h4 className="font-semibold text-sm" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Transfer Limits</h4>
              {(() => {
                const maxSingle = corridorLimits && corridorLimits.length > 0 ? Math.max(...corridorLimits.map((c: any) => c.maxAmountUsd ?? 10000)) : 50000;
                const dailyLimit = corridorLimits && corridorLimits.length > 0 ? Math.max(...corridorLimits.map((c: any) => c.dailyLimitUsd ?? 200000)) : 200000;
                return [
                  { label: "Min", value: "$10 equivalent" },
                  { label: "Max (single)", value: `$${maxSingle.toLocaleString()}` },
                  { label: "Daily limit", value: `$${dailyLimit.toLocaleString()}` },
                  { label: "FX fee", value: "0.8% – 1.5%" },
                  { label: "Settlement", value: "< 2 hours" },
                ];
              })().map(r => (
                <div key={r.label} className="flex justify-between text-xs py-1.5 border-b border-border last:border-0">
                  <span className="text-muted-foreground">{r.label}</span>
                  <span className="font-medium">{r.value}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Settlement Settings Tab */}
      {tab === "settings" && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-card rounded-xl border border-border p-5 space-y-5">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>Settlement Preferences</h3>

            <div className="space-y-3">
              <label className="text-sm font-medium">Default Settlement Currency</label>
              <div className="grid grid-cols-3 gap-2">
                {["NGN", "USD", "GHS", "KES", "ZAR", "EUR"].map(c => {
                  const curr = CURRENCIES.find(x => x.code === c)!;
                  return (
                    <button key={c} onClick={() => { setSettlementCurrency(c); toast.success(`Settlement currency set to ${c}`); }} className={`flex items-center gap-2 p-3 rounded-xl border text-sm font-medium transition-all ${settlementCurrency === c ? "border-primary bg-primary/5 text-primary" : "border-border hover:border-primary/30"}`}>
                      <span>{curr?.flag}</span>{c}
                      {settlementCurrency === c && <CheckCircle2 className="w-3.5 h-3.5 ml-auto" />}
                    </button>
                  );
                })}
              </div>
            </div>

            <div className="space-y-3">
              <label className="text-sm font-medium">Settlement Frequency</label>
              <div className="space-y-2">
                {[
                  { id: "daily", label: "Daily Settlement", desc: "Funds settled every business day" },
                  { id: "weekly", label: "Weekly Settlement", desc: "Funds settled every Monday" },
                  { id: "instant", label: "Instant Settlement", desc: "Real-time settlement (0.2% fee)" },
                ].map(opt => (
                  <label key={opt.id} className="flex items-start gap-3 p-3 rounded-xl border border-border hover:bg-muted/50 cursor-pointer transition-colors">
                    <input type="radio" name="freq" defaultChecked={opt.id === "daily"} className="mt-0.5" />
                    <div>
                      <p className="text-sm font-medium">{opt.label}</p>
                      <p className="text-xs text-muted-foreground">{opt.desc}</p>
                    </div>
                  </label>
                ))}
              </div>
            </div>

            <Button className="w-full" disabled={savePrefsMutation.isPending} onClick={() => savePrefsMutation.mutate({ settlementCurrency, autoConvert: false })}>
              {savePrefsMutation.isPending ? "Saving..." : "Save Preferences"}
            </Button>
          </div>

          <div className="bg-card rounded-xl border border-border p-5 space-y-4">
            <h3 className="font-semibold" style={{ fontFamily: "Space Grotesk, sans-serif" }}>FX Rate Alerts</h3>
            <p className="text-sm text-muted-foreground">Get notified when exchange rates hit your target thresholds.</p>
            <div className="space-y-3">
              {[
                { pair: "USD/NGN", current: rates.NGN.toFixed(2), alert: "1600", direction: "above" },
                { pair: "USD/KES", current: rates.KES.toFixed(2), alert: "135", direction: "above" },
                { pair: "USD/GHS", current: rates.GHS.toFixed(2), alert: "14", direction: "below" },
              ].map(alert => (
                <div key={alert.pair} className="flex items-center justify-between p-3 rounded-xl bg-muted/50">
                  <div>
                    <p className="text-sm font-semibold">{alert.pair}</p>
                    <p className="text-xs text-muted-foreground">Alert when {alert.direction} {alert.alert}</p>
                  </div>
                  <div className="text-right">
                    <p className="text-sm font-semibold amount">{alert.current}</p>
                    <p className="text-xs text-muted-foreground">Current</p>
                  </div>
                </div>
              ))}
            </div>
            <Button variant="outline" className="w-full" onClick={() => setAlertDialogOpen(true)}>
              <AlertTriangle className="w-4 h-4 mr-2" />Add Rate Alert
            </Button>
            <RateAlertDialog open={alertDialogOpen} onClose={() => setAlertDialogOpen(false)} />
          </div>
        </div>
      )}
    </div>
  );
}
