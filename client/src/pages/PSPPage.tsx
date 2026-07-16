import { trpc } from "@/lib/trpc";
import { useThresholds } from "@/contexts/ThresholdsContext";
import { useState } from "react";
import {
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip, ResponsiveContainer, Legend, Cell,
} from "recharts";
import {
  AlertTriangle, CheckCircle2, Clock, TrendingDown,
  RefreshCw, ChevronDown, ChevronUp, Activity,
  CreditCard, Zap, RotateCcw,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

// ─── types ───────────────────────────────────────────────────────────────────
type Provider = {
  id: string; name: string; region: string; status: string;
  successRate: number; avgLatencyMs: number; p99LatencyMs: number;
  txLast24h: number; volumeUsd: number; retryQueueDepth: number;
  threeDsRate: number; declineRate: number; chargebackRate: number;
};

// ─── helpers ─────────────────────────────────────────────────────────────────
function statusBadge(status: string) {
  if (status === "healthy")
    return <Badge className="bg-emerald-500/15 text-emerald-600 border-emerald-500/30 text-[11px]"><CheckCircle2 className="w-3 h-3 mr-1" />Healthy</Badge>;
  if (status === "degraded")
    return <Badge className="bg-amber-500/15 text-amber-600 border-amber-500/30 text-[11px]"><AlertTriangle className="w-3 h-3 mr-1" />Degraded</Badge>;
  return <Badge className="bg-red-500/15 text-red-600 border-red-500/30 text-[11px]"><AlertTriangle className="w-3 h-3 mr-1" />Down</Badge>;
}

function fmtUsd(n: number) {
  if (n >= 1_000_000) return `$${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `$${(n / 1_000).toFixed(1)}K`;
  return `$${n}`;
}

const PSP_COLORS: Record<string, string> = {
  stripe: "#635bff",
  adyen: "#0abf53",
  checkout: "#ef4444",
  paypal: "#003087",
  mojaloop: "#f59e0b",
};
// ─── placeholder data (rendered immediately while query fetches) ──────────────
const PLACEHOLDER_PSP_DATA = {
  providers: [
    { id: "stripe",   name: "Stripe",       region: "US-East",    status: "healthy",  successRate: 98.7, avgLatencyMs: 142, p99LatencyMs: 380, txLast24h: 48210, volumeUsd: 2841500, retryQueueDepth: 3,  threeDsRate: 12.4, declineRate: 1.3, chargebackRate: 0.08 },
    { id: "adyen",    name: "Adyen",        region: "EU-West",    status: "healthy",  successRate: 97.9, avgLatencyMs: 198, p99LatencyMs: 510, txLast24h: 31450, volumeUsd: 1920300, retryQueueDepth: 7,  threeDsRate: 18.2, declineRate: 2.1, chargebackRate: 0.12 },
    { id: "checkout", name: "Checkout.com", region: "EU-Central", status: "degraded", successRate: 94.1, avgLatencyMs: 312, p99LatencyMs: 890, txLast24h: 12880, volumeUsd: 780200,  retryQueueDepth: 42, threeDsRate: 22.8, declineRate: 5.9, chargebackRate: 0.31 },
    { id: "paypal",   name: "PayPal",       region: "US-West",    status: "healthy",  successRate: 96.3, avgLatencyMs: 224, p99LatencyMs: 620, txLast24h: 22100, volumeUsd: 1105800, retryQueueDepth: 11, threeDsRate: 8.6,  declineRate: 3.7, chargebackRate: 0.19 },
    { id: "mojaloop", name: "Mojaloop",     region: "Africa",     status: "healthy",  successRate: 99.1, avgLatencyMs: 88,  p99LatencyMs: 210, txLast24h: 8340,  volumeUsd: 142600,  retryQueueDepth: 0,  threeDsRate: 0,    declineRate: 0.9, chargebackRate: 0.02 },
  ],
  latencyBuckets: [
    { bucket: "<50ms",   stripe: 18, adyen: 8,  checkout: 3,  paypal: 12, mojaloop: 42 },
    { bucket: "50-100",  stripe: 32, adyen: 18, checkout: 7,  paypal: 24, mojaloop: 38 },
    { bucket: "100-200", stripe: 28, adyen: 31, checkout: 14, paypal: 28, mojaloop: 14 },
    { bucket: "200-500", stripe: 15, adyen: 28, checkout: 38, paypal: 22, mojaloop: 5  },
    { bucket: "500ms+",  stripe: 7,  adyen: 15, checkout: 38, paypal: 14, mojaloop: 1  },
  ],
};

// ─── PSP Detail Modal ─────────────────────────────────────────────────────────
function PSPDetailPanel({
  provider,
  forceMock,
  onClose,
}: {
  provider: Provider;
  forceMock: boolean;
  onClose: () => void;
}) {
  const [hours, setHours] = useState(24);
  const { data, isLoading } = trpc.paygate.pspHistory.useQuery(
    { providerId: provider.id, hours, forceMock },
    { refetchInterval: 60_000 },
  );
  const history = data?.history ?? [];

  const PRESETS = [
    { label: "24h", value: 24 },
    { label: "7d", value: 168 },
    { label: "30d", value: 720 },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4">
      <div className="bg-card border border-border rounded-xl shadow-2xl w-full max-w-4xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-5 border-b border-border sticky top-0 bg-card z-10">
          <div className="flex items-center gap-3">
            <div className="w-3 h-3 rounded-full" style={{ background: PSP_COLORS[provider.id] ?? "#888" }} />
            <div>
              <h2 className="text-lg font-semibold">{provider.name}</h2>
              <p className="text-xs text-muted-foreground">{provider.region} · {provider.id}</p>
            </div>
            {statusBadge(provider.status)}
          </div>
          <div className="flex items-center gap-2">
            {PRESETS.map(p => (
              <Button key={p.value} size="sm" variant={hours === p.value ? "default" : "outline"}
                className="h-7 text-xs" onClick={() => setHours(p.value)}>
                {p.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={onClose} className="h-7 w-7 p-0 ml-2">✕</Button>
          </div>
        </div>

        {/* Stat row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 p-5">
          {[
            { label: "Success Rate", value: `${provider.successRate.toFixed(1)}%`, icon: CheckCircle2, color: "text-emerald-500" },
            { label: "Avg Latency", value: `${provider.avgLatencyMs}ms`, icon: Clock, color: "text-blue-500" },
            { label: "P99 Latency", value: `${provider.p99LatencyMs}ms`, icon: Zap, color: "text-purple-500" },
            { label: "Retry Queue", value: String(provider.retryQueueDepth), icon: RotateCcw, color: provider.retryQueueDepth > 20 ? "text-red-500" : "text-muted-foreground" },
            { label: "Tx (24h)", value: provider.txLast24h.toLocaleString(), icon: Activity, color: "text-foreground" },
            { label: "Volume (24h)", value: fmtUsd(provider.volumeUsd), icon: CreditCard, color: "text-foreground" },
            { label: "3DS Rate", value: `${provider.threeDsRate.toFixed(1)}%`, icon: TrendingDown, color: "text-amber-500" },
            { label: "Chargeback", value: `${provider.chargebackRate.toFixed(2)}%`, icon: AlertTriangle, color: provider.chargebackRate > 0.2 ? "text-red-500" : "text-muted-foreground" },
          ].map(({ label, value, icon: Icon, color }) => (
            <div key={label} className="bg-muted/40 rounded-lg p-3 flex flex-col gap-1">
              <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
                <Icon className={cn("w-3.5 h-3.5", color)} />{label}
              </div>
              <div className="text-xl font-semibold">{value}</div>
            </div>
          ))}
        </div>

        {/* Success rate chart */}
        <div className="px-5 pb-4">
          <p className="text-sm font-medium mb-3">Success Rate History</p>
          {isLoading ? (
            <div className="h-40 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
          ) : (
            <ResponsiveContainer width="100%" height={160}>
              <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <defs>
                  <linearGradient id={`psp-sr-${provider.id}`} x1="0" y1="0" x2="0" y2="1">
                    <stop offset="5%" stopColor={PSP_COLORS[provider.id] ?? "#888"} stopOpacity={0.3} />
                    <stop offset="95%" stopColor={PSP_COLORS[provider.id] ?? "#888"} stopOpacity={0} />
                  </linearGradient>
                </defs>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                <YAxis domain={[80, 100]} tick={{ fontSize: 10 }} unit="%" />
                <Tooltip formatter={(v: number) => [`${v.toFixed(2)}%`, "Success Rate"]} />
                <Area type="monotone" dataKey="successRate" stroke={PSP_COLORS[provider.id] ?? "#888"}
                  fill={`url(#psp-sr-${provider.id})`} strokeWidth={2} dot={false} />
              </AreaChart>
            </ResponsiveContainer>
          )}
        </div>

        {/* Latency + retry queue charts */}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 px-5 pb-5">
          <div>
            <p className="text-sm font-medium mb-3">Avg Latency (ms)</p>
            {isLoading ? (
              <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`psp-lat-${provider.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#3b82f6" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} unit="ms" />
                  <Tooltip formatter={(v: number) => [`${v}ms`, "Latency"]} />
                  <Area type="monotone" dataKey="latencyMs" stroke="#3b82f6"
                    fill="url(#psp-lat-${provider.id})" strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
          <div>
            <p className="text-sm font-medium mb-3">Retry Queue Depth</p>
            {isLoading ? (
              <div className="h-36 flex items-center justify-center text-muted-foreground text-sm">Loading…</div>
            ) : (
              <ResponsiveContainer width="100%" height={140}>
                <AreaChart data={history} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                  <defs>
                    <linearGradient id={`psp-rq-${provider.id}`} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#f59e0b" stopOpacity={0.3} />
                      <stop offset="95%" stopColor="#f59e0b" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 10 }} interval="preserveStartEnd" />
                  <YAxis tick={{ fontSize: 10 }} />
                  <Tooltip formatter={(v: number) => [v, "Retry Queue"]} />
                  <Area type="monotone" dataKey="retryQueue" stroke="#f59e0b"
                    fill={`url(#psp-rq-${provider.id})`} strokeWidth={2} dot={false} />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// ─── PSP Card ─────────────────────────────────────────────────────────────────
function PSPCard({
  provider,
  onClick,
}: {
  provider: Provider;
  onClick: () => void;
}) {
  const { lagSeverity } = useThresholds();
  // Reuse lagSeverity as a proxy for success-rate severity (lower = worse)
  const srSeverity = provider.successRate < 95 ? "critical" : provider.successRate < 97 ? "warn" : "ok";
  const retryColor = provider.retryQueueDepth > 30 ? "text-red-500" : provider.retryQueueDepth > 10 ? "text-amber-500" : "text-emerald-500";

  return (
    <Card
      className={cn(
        "cursor-pointer transition-all hover:shadow-md hover:-translate-y-0.5 border",
        provider.status === "degraded" ? "border-amber-500/40" : "border-border",
      )}
      onClick={onClick}
    >
      <CardHeader className="pb-2 pt-4 px-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <div className="w-2.5 h-2.5 rounded-full" style={{ background: PSP_COLORS[provider.id] ?? "#888" }} />
            <CardTitle className="text-sm font-semibold">{provider.name}</CardTitle>
          </div>
          {statusBadge(provider.status)}
        </div>
        <p className="text-xs text-muted-foreground mt-0.5">{provider.region}</p>
      </CardHeader>
      <CardContent className="px-4 pb-4 space-y-3">
        {/* Success rate bar */}
        <div>
          <div className="flex justify-between text-xs mb-1">
            <span className="text-muted-foreground">Success Rate</span>
            <span className={cn("font-medium",
              srSeverity === "critical" ? "text-red-500" :
              srSeverity === "warn" ? "text-amber-500" : "text-emerald-500"
            )}>{provider.successRate.toFixed(1)}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <div
              className={cn("h-full rounded-full transition-all",
                srSeverity === "critical" ? "bg-red-500" :
                srSeverity === "warn" ? "bg-amber-500" : "bg-emerald-500"
              )}
              style={{ width: `${provider.successRate}%` }}
            />
          </div>
        </div>

        {/* Key metrics grid */}
        <div className="grid grid-cols-2 gap-2 text-xs">
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Avg Latency</div>
            <div className="font-semibold mt-0.5">{provider.avgLatencyMs}ms</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Retry Queue</div>
            <div className={cn("font-semibold mt-0.5", retryColor)}>{provider.retryQueueDepth}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Tx (24h)</div>
            <div className="font-semibold mt-0.5">{provider.txLast24h.toLocaleString()}</div>
          </div>
          <div className="bg-muted/40 rounded p-2">
            <div className="text-muted-foreground">Volume</div>
            <div className="font-semibold mt-0.5">{fmtUsd(provider.volumeUsd)}</div>
          </div>
        </div>

        {/* Decline / chargeback */}
        <div className="flex gap-3 text-xs">
          <span className="text-muted-foreground">Decline <span className={cn("font-medium", provider.declineRate > 4 ? "text-red-500" : "text-foreground")}>{provider.declineRate.toFixed(1)}%</span></span>
          <span className="text-muted-foreground">3DS <span className="font-medium text-foreground">{provider.threeDsRate.toFixed(1)}%</span></span>
          <span className="text-muted-foreground">CB <span className={cn("font-medium", provider.chargebackRate > 0.2 ? "text-red-500" : "text-foreground")}>{provider.chargebackRate.toFixed(2)}%</span></span>
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function PSPPage() {
  const [forceMock, setForceMock] = useState(true);
  const [selectedProvider, setSelectedProvider] = useState<Provider | null>(null);
  const [sortBy, setSortBy] = useState<"successRate" | "latency" | "volume" | "retryQueue">("successRate");
  const [sortAsc, setSortAsc] = useState(false);

  const { data, isLoading, refetch } = trpc.paygate.pspStats.useQuery(
    { forceMock },
    { refetchInterval: 30_000, placeholderData: PLACEHOLDER_PSP_DATA },
  );

  const providers: Provider[] = data?.providers ?? [];

  const sorted = [...providers].sort((a, b) => {
    let av = 0, bv = 0;
    if (sortBy === "successRate") { av = a.successRate; bv = b.successRate; }
    else if (sortBy === "latency") { av = a.avgLatencyMs; bv = b.avgLatencyMs; }
    else if (sortBy === "volume") { av = a.volumeUsd; bv = b.volumeUsd; }
    else if (sortBy === "retryQueue") { av = a.retryQueueDepth; bv = b.retryQueueDepth; }
    return sortAsc ? av - bv : bv - av;
  });

  const degraded = providers.filter(p => p.status !== "healthy").length;
  const totalTx = providers.reduce((s, p) => s + p.txLast24h, 0);
  const totalVol = providers.reduce((s, p) => s + p.volumeUsd, 0);
  const avgSuccess = providers.length
    ? providers.reduce((s, p) => s + p.successRate, 0) / providers.length
    : 0;

  function handleSort(col: typeof sortBy) {
    if (sortBy === col) setSortAsc(a => !a);
    else { setSortBy(col); setSortAsc(false); }
  }

  function handleRefresh() {
    refetch();
    toast.success("PSP data refreshed", { description: "All provider stats updated." });
  }

  const latencyBuckets = data?.latencyBuckets ?? [];
  const pspKeys = providers.map(p => p.id);

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h1 className="text-xl font-semibold tracking-tight">PSP Health</h1>
          <p className="text-sm text-muted-foreground mt-0.5">
            Payment Service Provider monitoring — success rates, latency, retry queues
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Tabs value={forceMock ? "mock" : "live"} onValueChange={v => setForceMock(v === "mock")}>
            <TabsList className="h-8">
              <TabsTrigger value="mock" className="text-xs h-7">MOCK</TabsTrigger>
              <TabsTrigger value="live" className="text-xs h-7">LIVE</TabsTrigger>
            </TabsList>
          </Tabs>
          <Button size="sm" variant="outline" className="h-8 gap-1.5 text-xs" onClick={handleRefresh}>
            <RefreshCw className="w-3.5 h-3.5" />Refresh
          </Button>
        </div>
      </div>

      {/* Summary strip */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        {[
          { label: "Active PSPs", value: providers.length, sub: `${degraded} degraded`, color: degraded > 0 ? "text-amber-500" : "text-emerald-500" },
          { label: "Avg Success Rate", value: `${avgSuccess.toFixed(1)}%`, sub: "across all providers", color: avgSuccess < 96 ? "text-amber-500" : "text-emerald-500" },
          { label: "Total Tx (24h)", value: totalTx.toLocaleString(), sub: "all providers", color: "text-foreground" },
          { label: "Total Volume", value: fmtUsd(totalVol), sub: "24-hour window", color: "text-foreground" },
        ].map(({ label, value, sub, color }) => (
          <Card key={label} className="border-border">
            <CardContent className="p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className={cn("text-2xl font-bold mt-1", color)}>{value}</p>
              <p className="text-xs text-muted-foreground mt-0.5">{sub}</p>
            </CardContent>
          </Card>
        ))}
      </div>

      {/* Sort controls */}
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-xs text-muted-foreground">Sort by:</span>
        {(["successRate", "latency", "volume", "retryQueue"] as const).map(col => (
          <Button key={col} size="sm" variant={sortBy === col ? "default" : "outline"}
            className="h-7 text-xs gap-1" onClick={() => handleSort(col)}>
            {{ successRate: "Success Rate", latency: "Latency", volume: "Volume", retryQueue: "Retry Queue" }[col]}
            {sortBy === col && (sortAsc ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />)}
          </Button>
        ))}
      </div>

      {/* Provider cards */}
      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <div key={i} className="h-52 rounded-xl bg-muted animate-pulse" />
          ))}
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map(p => (
            <PSPCard key={p.id} provider={p} onClick={() => setSelectedProvider(p)} />
          ))}
        </div>
      )}

      {/* Latency histogram */}
      {latencyBuckets.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-semibold">Latency Distribution (24h)</CardTitle>
            <p className="text-xs text-muted-foreground">% of requests per latency bucket, by provider</p>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={220}>
              <BarChart data={latencyBuckets} margin={{ top: 4, right: 4, bottom: 0, left: -20 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                <XAxis dataKey="bucket" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} unit="%" />
                <Tooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                {pspKeys.map(id => (
                  <Bar key={id} dataKey={id} name={providers.find(p => p.id === id)?.name ?? id}
                    fill={PSP_COLORS[id] ?? "#888"} radius={[3, 3, 0, 0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
          </CardContent>
        </Card>
      )}

      {/* Comparison table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-sm font-semibold">Provider Comparison</CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  {["Provider", "Region", "Status", "Success %", "Avg Lat", "P99 Lat", "Retry Q", "Decline %", "3DS %", "CB %", "Volume"].map(h => (
                    <th key={h} className="px-3 py-2.5 text-left text-muted-foreground font-medium whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {sorted.map((p, i) => (
                  <tr key={p.id}
                    className={cn("border-b border-border/50 hover:bg-muted/30 cursor-pointer transition-colors", i % 2 === 0 ? "" : "bg-muted/10")}
                    onClick={() => setSelectedProvider(p)}
                  >
                    <td className="px-3 py-2.5 font-medium flex items-center gap-2">
                      <div className="w-2 h-2 rounded-full" style={{ background: PSP_COLORS[p.id] ?? "#888" }} />
                      {p.name}
                    </td>
                    <td className="px-3 py-2.5 text-muted-foreground">{p.region}</td>
                    <td className="px-3 py-2.5">{statusBadge(p.status)}</td>
                    <td className={cn("px-3 py-2.5 font-medium", p.successRate < 95 ? "text-red-500" : p.successRate < 97 ? "text-amber-500" : "text-emerald-500")}>{p.successRate.toFixed(1)}%</td>
                    <td className="px-3 py-2.5">{p.avgLatencyMs}ms</td>
                    <td className="px-3 py-2.5">{p.p99LatencyMs}ms</td>
                    <td className={cn("px-3 py-2.5 font-medium", p.retryQueueDepth > 30 ? "text-red-500" : p.retryQueueDepth > 10 ? "text-amber-500" : "")}>{p.retryQueueDepth}</td>
                    <td className={cn("px-3 py-2.5", p.declineRate > 4 ? "text-red-500" : "")}>{p.declineRate.toFixed(1)}%</td>
                    <td className="px-3 py-2.5">{p.threeDsRate.toFixed(1)}%</td>
                    <td className={cn("px-3 py-2.5", p.chargebackRate > 0.2 ? "text-red-500" : "")}>{p.chargebackRate.toFixed(2)}%</td>
                    <td className="px-3 py-2.5">{fmtUsd(p.volumeUsd)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>

      {/* Detail modal */}
      {selectedProvider && (
        <PSPDetailPanel
          provider={selectedProvider}
          forceMock={forceMock}
          onClose={() => setSelectedProvider(null)}
        />
      )}
    </div>
  );
}
