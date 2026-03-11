import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import {
  TrendingUp, TrendingDown, RefreshCw, Globe, DollarSign,
  ArrowLeftRight, Settings2, CheckCircle2, AlertTriangle,
  BarChart3, Clock, Zap, ArrowUpRight, ArrowDownRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
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

export default function FXDashboard() {
  const [fromCurrency, setFromCurrency] = useState("USD");
  const [toCurrency, setToCurrency] = useState("NGN");
  const [amount, setAmount] = useState("1000");
  const [rates, setRates] = useState(BASE_RATES);
  const [lastUpdated, setLastUpdated] = useState(new Date().toLocaleTimeString());
  const [settlementCurrency, setSettlementCurrency] = useState("NGN");
  const [tab, setTab] = useState<"rates" | "converter" | "analytics" | "settings">("rates");
  const [autoRefresh, setAutoRefresh] = useState(true);

  // Live FX rates from DB
  const { data: liveRates, refetch: refetchRates } = trpc.fx.getRates.useQuery({ base: "USD" }, { refetchInterval: autoRefresh ? 60_000 : false });
  const fetchAndStoreMutation = trpc.fx.fetchAndStore.useMutation({
    onSuccess: (d) => { toast.success(`Fetched ${d.count} live rates`); refetchRates(); },
    onError: () => toast.error("Failed to fetch live rates"),
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
          </div>
          <button onClick={() => setAutoRefresh(p => !p)} className={`flex items-center gap-2 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${autoRefresh ? "bg-emerald-50 text-emerald-700 border border-emerald-200" : "bg-muted text-muted-foreground"}`}>
            <RefreshCw className={`w-3.5 h-3.5 ${autoRefresh ? "animate-spin" : ""}`} style={{ animationDuration: "3s" }} />
            {autoRefresh ? "Live" : "Paused"}
          </button>
          <Button size="sm" variant="outline" onClick={() => fetchAndStoreMutation.mutate()} disabled={fetchAndStoreMutation.isPending}>
            <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${fetchAndStoreMutation.isPending ? 'animate-spin' : ''}`} />
            {fetchAndStoreMutation.isPending ? 'Fetching...' : 'Fetch Live Rates'}
          </Button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {[
          { label: "Currencies Supported", value: "54", sub: "African + Global", icon: Globe, cls: "text-primary" },
          { label: "Avg FX Spread", value: "0.8%", sub: "vs 3.5% SWIFT avg", icon: TrendingDown, cls: "text-emerald-600" },
          { label: "FX Volume (30d)", value: "$2.4M", sub: "Cross-border", icon: DollarSign, cls: "text-blue-600" },
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
        {(["rates", "converter", "analytics", "settings"] as const).map(t => (
          <button key={t} onClick={() => setTab(t)} className={`px-4 py-2 rounded-lg text-sm font-medium capitalize transition-all ${tab === t ? "bg-background shadow-sm" : "text-muted-foreground hover:text-foreground"}`}>
            {t === "rates" ? "Live Rates" : t === "converter" ? "Converter" : t === "analytics" ? "FX Analytics" : "Settlement"}
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

            <Button className="w-full" onClick={() => toast.success(`FX conversion initiated: ${fromCurr.symbol}${amount} → ${toCurr.symbol}${convertedAmount}`)}>
              Convert & Settle
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

            <Button className="w-full" onClick={() => toast.success("Settlement preferences saved!")}>Save Preferences</Button>
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
            <Button variant="outline" className="w-full" onClick={() => toast.info("Rate alert configuration coming soon")}>
              <AlertTriangle className="w-4 h-4 mr-2" />Add Rate Alert
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
