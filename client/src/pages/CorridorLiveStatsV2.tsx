/**
 * CorridorLiveStatsV2.tsx — Wave 228
 *
 * Enhanced Corridor Live Stats page:
 *  - Live FX rate cards with 24h change indicator and sparkline
 *  - 7-day volume heatmap (source × dest currency matrix)
 *  - Corridor detail drill-down drawer (KPIs + daily volume trend)
 *  - Multi-currency ledger balances with FX-equivalent conversion
 *  - Ledger entry drill-down with currency + type filter
 *
 * Routes: /corridor-live-v2
 */
import { useState, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "sonner";
import {
  Activity,
  RefreshCw,
  TrendingUp,
  TrendingDown,
  Minus,
  Globe,
  BarChart3,
  Layers,
  ArrowUpDown,
  Clock,
  AlertCircle,
  ChevronRight,
  Wallet,
  DollarSign,
} from "lucide-react";
import {
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Cell,
} from "recharts";

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtRate(r: number | null | undefined) {
  if (r == null) return "—";
  if (r >= 1000) return r.toLocaleString("en-NG", { maximumFractionDigits: 2 });
  if (r >= 1) return r.toFixed(4);
  return r.toFixed(6);
}

function fmtKobo(k: number) {
  const n = k / 100;
  if (n >= 1_000_000_000) return `₦${(n / 1_000_000_000).toFixed(2)}B`;
  if (n >= 1_000_000) return `₦${(n / 1_000_000).toFixed(2)}M`;
  if (n >= 1_000) return `₦${(n / 1_000).toFixed(1)}K`;
  return `₦${n.toFixed(0)}`;
}

function fmtUsd(u: number) {
  if (u >= 1_000_000) return `$${(u / 1_000_000).toFixed(2)}M`;
  if (u >= 1_000) return `$${(u / 1_000).toFixed(1)}K`;
  return `$${u.toFixed(0)}`;
}

function ageLabel(seconds: number | null) {
  if (seconds == null) return "no data";
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: "🇳🇬", USD: "🇺🇸", GBP: "🇬🇧", EUR: "🇪🇺",
  KES: "🇰🇪", GHS: "🇬🇭", ZAR: "🇿🇦", XOF: "🌍",
};

const HEATMAP_COLORS = [
  "#f1f5f9", "#bfdbfe", "#93c5fd", "#60a5fa", "#3b82f6",
  "#2563eb", "#1d4ed8", "#1e40af", "#1e3a8a",
];

function heatmapColor(value: number, max: number) {
  if (max === 0) return HEATMAP_COLORS[0];
  const idx = Math.min(
    Math.floor((value / max) * (HEATMAP_COLORS.length - 1)),
    HEATMAP_COLORS.length - 1,
  );
  return HEATMAP_COLORS[idx];
}

// ─── Sub-components ───────────────────────────────────────────────────────────

function SparklineChart({ data }: { data: { ts: string; rate: number }[] }) {
  if (!data || data.length < 2) {
    return <div className="h-10 flex items-center justify-center text-xs text-muted-foreground">No history</div>;
  }
  return (
    <ResponsiveContainer width="100%" height={40}>
      <LineChart data={data} margin={{ top: 2, right: 2, left: 2, bottom: 2 }}>
        <Line
          type="monotone"
          dataKey="rate"
          dot={false}
          strokeWidth={1.5}
          stroke="#3b82f6"
          isAnimationActive={false}
        />
      </LineChart>
    </ResponsiveContainer>
  );
}

function TrendIcon({ direction }: { direction: "up" | "down" | "flat" }) {
  if (direction === "up") return <TrendingUp className="w-4 h-4 text-green-500" />;
  if (direction === "down") return <TrendingDown className="w-4 h-4 text-red-500" />;
  return <Minus className="w-4 h-4 text-muted-foreground" />;
}

// ─── Rate Card ────────────────────────────────────────────────────────────────

function RateCard({
  sourceCurrency,
  destCurrency,
  midRate,
  effectiveRate,
  fxMarkupPct,
  isEnabled,
  rateAge,
  corridorId,
  onDrillDown,
}: {
  sourceCurrency: string;
  destCurrency: string;
  midRate: number | null;
  effectiveRate: number | null;
  fxMarkupPct: number;
  isEnabled: boolean;
  rateAge: number | null;
  corridorId: string | null;
  onDrillDown: (id: string) => void;
}) {
  const { data: history } = trpc.corridorLiveV2.getRateHistory.useQuery(
    { baseCurrency: sourceCurrency, targetCurrency: destCurrency, hours: 24 },
    { staleTime: 60_000, refetchInterval: 120_000 },
  );

  const stats = history?.stats;
  const points = history?.points ?? [];

  return (
    <Card className={`transition-all ${isEnabled ? "" : "opacity-60"}`}>
      <CardContent className="pt-4 pb-3 space-y-2">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-1.5">
            <span className="text-lg">{CURRENCY_FLAGS[sourceCurrency] ?? "🌐"}</span>
            <span className="font-semibold text-sm">{sourceCurrency}</span>
            <ArrowUpDown className="w-3 h-3 text-muted-foreground" />
            <span className="font-semibold text-sm">{destCurrency}</span>
            <span className="text-lg">{CURRENCY_FLAGS[destCurrency] ?? "🌐"}</span>
          </div>
          <div className="flex items-center gap-1">
            <Badge
              variant="outline"
              className={isEnabled ? "text-green-700 border-green-300 bg-green-50 text-xs" : "text-gray-500 border-gray-300 text-xs"}
            >
              {isEnabled ? "Active" : "Off"}
            </Badge>
            {corridorId && (
              <Button
                variant="ghost"
                size="sm"
                className="h-6 w-6 p-0"
                onClick={() => onDrillDown(corridorId)}
              >
                <ChevronRight className="w-3 h-3" />
              </Button>
            )}
          </div>
        </div>

        {/* Mid rate */}
        <div>
          <p className="text-2xl font-bold tabular-nums">{fmtRate(midRate)}</p>
          {effectiveRate && fxMarkupPct > 0 && (
            <p className="text-xs text-muted-foreground">
              Effective: {fmtRate(effectiveRate)} (+{fxMarkupPct.toFixed(2)}%)
            </p>
          )}
        </div>

        {/* 24h change */}
        {stats && (
          <div className="flex items-center gap-1.5 text-xs">
            <TrendIcon direction={stats.direction as any} />
            <span
              className={
                stats.changePct > 0
                  ? "text-green-600 font-medium"
                  : stats.changePct < 0
                  ? "text-red-600 font-medium"
                  : "text-muted-foreground"
              }
            >
              {stats.changePct > 0 ? "+" : ""}
              {stats.changePct.toFixed(4)}%
            </span>
            <span className="text-muted-foreground">24h</span>
          </div>
        )}

        {/* Sparkline */}
        <SparklineChart data={points} />

        {/* Footer */}
        <div className="flex items-center gap-1 text-xs text-muted-foreground">
          <Clock className="w-3 h-3" />
          {ageLabel(rateAge)}
        </div>
      </CardContent>
    </Card>
  );
}

// ─── Volume Heatmap ───────────────────────────────────────────────────────────

function VolumeHeatmap({ days }: { days: number }) {
  const { data, isLoading } = trpc.corridorLiveV2.getVolumeHeatmap.useQuery(
    { days },
    { staleTime: 120_000, refetchInterval: 300_000 },
  );

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12 text-muted-foreground text-sm">
        <RefreshCw className="w-4 h-4 mr-2 animate-spin" /> Loading heatmap…
      </div>
    );
  }

  if (!data || data.sourceCurrencies.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center py-12 text-muted-foreground">
        <Globe className="w-8 h-8 mb-2 opacity-40" />
        <p className="text-sm">No cross-border transaction data in the last {days} days.</p>
      </div>
    );
  }

  const maxVolume = Math.max(
    ...(data.sourceCurrencies as string[]).flatMap((src: string) =>
      (data.destCurrencies as string[]).map((dst: string) => (data.matrix as any)[src]?.[dst]?.volumeKobo ?? 0),
    ),
  );

  return (
    <div className="overflow-x-auto">
      <table className="text-xs border-collapse w-full">
        <thead>
          <tr>
            <th className="p-2 text-left text-muted-foreground font-medium">From ↓ / To →</th>
            {(data.destCurrencies as string[]).map((dst: string) => (
              <th key={dst} className="p-2 text-center font-semibold">
                {CURRENCY_FLAGS[dst] ?? "🌐"} {dst}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {(data.sourceCurrencies as string[]).map((src: string) => (
            <tr key={src}>
              <td className="p-2 font-semibold">
                {CURRENCY_FLAGS[src] ?? "🌐"} {src}
              </td>
              {(data.destCurrencies as string[]).map((dst: string) => {
                const cell = (data.matrix as any)[src]?.[dst];
                const vol = cell?.volumeKobo ?? 0;
                const bg = heatmapColor(vol, maxVolume);
                const textColor = vol / maxVolume > 0.5 ? "text-white" : "text-gray-800";
                return (
                  <td
                    key={dst}
                    className={`p-2 text-center rounded ${textColor}`}
                    style={{ backgroundColor: bg }}
                    title={`${src}→${dst}: ${fmtKobo(vol)} (${cell?.txCount ?? 0} txns)`}
                  >
                    {vol > 0 ? fmtKobo(vol) : "—"}
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-xs text-muted-foreground mt-2">
        Total: {fmtKobo(data.totalVolumeKobo)} across {data.totalTxCount.toLocaleString()} transactions in the last {days} days
      </p>
    </div>
  );
}

// ─── Corridor Detail Drawer ───────────────────────────────────────────────────

function CorridorDetailDrawer({
  corridorId,
  open,
  onClose,
}: {
  corridorId: string | null;
  open: boolean;
  onClose: () => void;
}) {
  const { data, isLoading } = trpc.corridorLiveV2.getCorridorDetail.useQuery(
    { corridorId: corridorId ?? "", days: 30 },
    { enabled: !!corridorId && open, staleTime: 60_000 },
  );

  return (
    <Sheet open={open} onOpenChange={(v) => !v && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle className="flex items-center gap-2">
            <BarChart3 className="w-5 h-5 text-blue-600" />
            Corridor Detail — Last 30 Days
          </SheetTitle>
        </SheetHeader>

        {isLoading && (
          <div className="flex items-center justify-center py-16 text-muted-foreground">
            <RefreshCw className="w-5 h-5 animate-spin mr-2" /> Loading…
          </div>
        )}

        {data && (
          <div className="mt-4 space-y-5">
            {/* Corridor info */}
            <div className="flex items-center gap-2">
              <span className="text-xl">{CURRENCY_FLAGS[data.corridor.sourceCurrency] ?? "🌐"}</span>
              <span className="font-bold text-lg">{data.corridor.sourceCurrency}</span>
              <ArrowUpDown className="w-4 h-4 text-muted-foreground" />
              <span className="font-bold text-lg">{data.corridor.destCurrency}</span>
              <span className="text-xl">{CURRENCY_FLAGS[data.corridor.destCurrency] ?? "🌐"}</span>
              <Badge
                variant="outline"
                className={data.corridor.isEnabled ? "text-green-700 border-green-300 bg-green-50" : "text-gray-500"}
              >
                {data.corridor.isEnabled ? "Active" : "Disabled"}
              </Badge>
            </div>

            {/* KPI grid */}
            <div className="grid grid-cols-2 gap-3">
              {[
                { label: "Transactions", value: data.kpis.txCount.toLocaleString() },
                { label: "Total Volume", value: fmtKobo(data.kpis.volumeKobo) },
                { label: "Avg Amount", value: fmtKobo(data.kpis.avgAmountKobo) },
                { label: "Avg FX Rate", value: fmtRate(data.kpis.avgFxRate) },
                { label: "Max Amount", value: fmtKobo(data.kpis.maxAmountKobo) },
                { label: "Failed Txns", value: data.kpis.failedCount.toLocaleString() },
              ].map(({ label, value }) => (
                <div key={label} className="border rounded-lg p-3">
                  <p className="text-xs text-muted-foreground">{label}</p>
                  <p className="font-bold text-sm mt-0.5">{value}</p>
                </div>
              ))}
            </div>

            {/* Daily volume trend */}
            {data.trend.length > 0 && (
              <div>
                <p className="text-sm font-semibold mb-2">Daily Volume Trend</p>
                <ResponsiveContainer width="100%" height={160}>
                  <BarChart data={data.trend} margin={{ top: 4, right: 4, left: 0, bottom: 4 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" />
                    <XAxis
                      dataKey="day"
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => v.slice(5)}
                    />
                    <YAxis
                      tick={{ fontSize: 10 }}
                      tickFormatter={(v) => fmtKobo(v)}
                      width={60}
                    />
                    <Tooltip
                      formatter={(v: number) => [fmtKobo(v), "Volume"]}
                      labelFormatter={(l) => `Day: ${l}`}
                    />
                    <Bar dataKey="volumeKobo" fill="#3b82f6" radius={[2, 2, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </div>
            )}

            {/* Config */}
            <div className="border rounded-lg p-3 space-y-1 text-sm">
              <p className="font-semibold text-xs text-muted-foreground uppercase tracking-wide mb-2">Configuration</p>
              <div className="flex justify-between">
                <span className="text-muted-foreground">FX Markup</span>
                <span className="font-medium">{data.corridor.fxMarkupPct.toFixed(2)}%</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Daily Limit</span>
                <span className="font-medium">{fmtUsd(data.corridor.dailyLimitUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Min Amount</span>
                <span className="font-medium">{fmtUsd(data.corridor.minAmountUsd)}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted-foreground">Max Amount</span>
                <span className="font-medium">{fmtUsd(data.corridor.maxAmountUsd)}</span>
              </div>
            </div>
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}

// ─── Ledger Panel ─────────────────────────────────────────────────────────────

function LedgerPanel() {
  const [currency, setCurrency] = useState<string>("all");
  const [entryType, setEntryType] = useState<string>("all");
  const [page, setPage] = useState(1);

  const { data: accounts, isLoading: loadingAccounts } = trpc.ledgerDrillDown.getAccounts.useQuery(
    undefined,
    { staleTime: 30_000, refetchInterval: 60_000 },
  );

  const { data: entries, isLoading: loadingEntries } = trpc.ledgerDrillDown.getEntries.useQuery(
    {
      currency: currency === "all" ? undefined : currency,
      type: entryType === "all" ? undefined : (entryType as "credit" | "debit"),
      page,
      pageSize: 15,
    },
    { staleTime: 30_000 },
  );

  const { data: summary } = trpc.ledgerDrillDown.getAccountSummary.useQuery(
    { currency: currency === "all" ? undefined : currency, days: 30 },
    { staleTime: 60_000 },
  );

  const currencies = accounts?.map((a: any) => a.currency) ?? [];
  const totalNgn = accounts?.reduce((s: number, a: any) => s + (a.balanceNgn ?? 0), 0) ?? 0;

  return (
    <div className="space-y-5">
      {/* Account balance cards */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="font-semibold flex items-center gap-2">
            <Wallet className="w-4 h-4 text-indigo-600" /> Multi-Currency Balances
          </h3>
          {totalNgn > 0 && (
            <span className="text-sm text-muted-foreground">
              Total ≈ {fmtKobo(totalNgn * 100)}
            </span>
          )}
        </div>
        {loadingAccounts ? (
          <p className="text-sm text-muted-foreground py-4">Loading accounts…</p>
        ) : (
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-7 gap-3">
            {(accounts ?? []).map((a: any) => (
              <Card key={a.id} className="cursor-pointer hover:border-blue-400 transition-colors"
                onClick={() => setCurrency(a.currency)}>
                <CardContent className="pt-4 pb-3">
                  <p className="text-xl">{CURRENCY_FLAGS[a.currency] ?? "🌐"}</p>
                  <p className="font-bold text-sm mt-1">{a.currency}</p>
                  <p className="text-lg font-semibold tabular-nums">
                    {(a.balance / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                  </p>
                  {a.balanceNgn != null && a.currency !== "NGN" && (
                    <p className="text-xs text-muted-foreground">≈ {fmtKobo(a.balanceNgn * 100)}</p>
                  )}
                  <Badge
                    variant="outline"
                    className={`mt-1 text-xs ${a.status === "active" ? "text-green-700 border-green-300 bg-green-50" : "text-gray-500"}`}
                  >
                    {a.status}
                  </Badge>
                </CardContent>
              </Card>
            ))}
          </div>
        )}
      </div>

      {/* P&L Summary */}
      {summary && summary.length > 0 && (
        <div>
          <h3 className="font-semibold mb-3 flex items-center gap-2">
            <DollarSign className="w-4 h-4 text-green-600" /> 30-Day P&amp;L Summary
          </h3>
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse">
              <thead>
                <tr className="border-b text-muted-foreground text-xs">
                  <th className="text-left py-2 pr-4">Currency</th>
                  <th className="text-right py-2 pr-4">Credits</th>
                  <th className="text-right py-2 pr-4">Debits</th>
                  <th className="text-right py-2 pr-4">Net</th>
                  <th className="text-right py-2">Txns</th>
                </tr>
              </thead>
              <tbody>
                {summary.map((r: any) => (
                  <tr key={r.currency} className="border-b last:border-0 hover:bg-muted/30">
                    <td className="py-2 pr-4 font-medium">
                      {CURRENCY_FLAGS[r.currency] ?? "🌐"} {r.currency}
                    </td>
                    <td className="py-2 pr-4 text-right text-green-600">
                      +{(r.totalCredits / 100).toLocaleString()}
                    </td>
                    <td className="py-2 pr-4 text-right text-red-600">
                      -{(r.totalDebits / 100).toLocaleString()}
                    </td>
                    <td className={`py-2 pr-4 text-right font-semibold ${r.net >= 0 ? "text-green-700" : "text-red-700"}`}>
                      {r.net >= 0 ? "+" : ""}{(r.net / 100).toLocaleString()}
                    </td>
                    <td className="py-2 text-right text-muted-foreground">{r.txCount}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Ledger entries */}
      <div>
        <div className="flex items-center justify-between mb-3 flex-wrap gap-2">
          <h3 className="font-semibold flex items-center gap-2">
            <Layers className="w-4 h-4 text-purple-600" /> Ledger Entries
          </h3>
          <div className="flex items-center gap-2">
            <Select value={currency} onValueChange={(v) => { setCurrency(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-28 text-xs">
                <SelectValue placeholder="Currency" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                {currencies.map((c: string) => (
                  <SelectItem key={c} value={c}>{c}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <Select value={entryType} onValueChange={(v) => { setEntryType(v); setPage(1); }}>
              <SelectTrigger className="h-8 w-24 text-xs">
                <SelectValue placeholder="Type" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">All</SelectItem>
                <SelectItem value="credit">Credit</SelectItem>
                <SelectItem value="debit">Debit</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        {loadingEntries ? (
          <p className="text-sm text-muted-foreground py-4">Loading entries…</p>
        ) : !entries?.entries?.length ? (
          <div className="text-center py-8 text-muted-foreground">
            <Layers className="w-8 h-8 mx-auto mb-2 opacity-30" />
            <p className="text-sm">No ledger entries found.</p>
          </div>
        ) : (
          <>
            <div className="overflow-x-auto">
              <table className="w-full text-sm border-collapse">
                <thead>
                  <tr className="border-b text-muted-foreground text-xs">
                    <th className="text-left py-2 pr-3">Date</th>
                    <th className="text-left py-2 pr-3">Description</th>
                    <th className="text-center py-2 pr-3">Currency</th>
                    <th className="text-center py-2 pr-3">Type</th>
                    <th className="text-right py-2">Amount</th>
                  </tr>
                </thead>
                <tbody>
                  {entries.entries.map((e: any) => (
                    <tr key={e.id} className="border-b last:border-0 hover:bg-muted/30">
                      <td className="py-2 pr-3 text-muted-foreground whitespace-nowrap">
                        {new Date(e.createdAt).toLocaleDateString("en-NG", { month: "short", day: "numeric" })}
                      </td>
                      <td className="py-2 pr-3 max-w-[200px] truncate">{e.description ?? "—"}</td>
                      <td className="py-2 pr-3 text-center">
                        <span className="font-medium">{e.currency}</span>
                      </td>
                      <td className="py-2 pr-3 text-center">
                        <Badge
                          variant="outline"
                          className={
                            e.type === "credit"
                              ? "text-green-700 border-green-300 bg-green-50 text-xs"
                              : "text-red-700 border-red-300 bg-red-50 text-xs"
                          }
                        >
                          {e.type}
                        </Badge>
                      </td>
                      <td className={`py-2 text-right font-semibold tabular-nums ${e.type === "credit" ? "text-green-700" : "text-red-700"}`}>
                        {e.type === "credit" ? "+" : "-"}
                        {(e.amount / 100).toLocaleString("en-NG", { maximumFractionDigits: 2 })}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {/* Pagination */}
            <div className="flex items-center justify-between mt-3 text-xs text-muted-foreground">
              <span>{entries.total} total entries</span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={page === 1}
                  onClick={() => setPage((p) => p - 1)}
                >
                  Prev
                </Button>
                <span>Page {page}</span>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  disabled={entries.entries.length < 15}
                  onClick={() => setPage((p) => p + 1)}
                >
                  Next
                </Button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Main Page ────────────────────────────────────────────────────────────────

export default function CorridorLiveStatsV2() {
  const [heatmapDays, setHeatmapDays] = useState(7);
  const [showMajorOnly, setShowMajorOnly] = useState(false);
  const [activeTab, setActiveTab] = useState<"rates" | "heatmap" | "ledger">("rates");
  const [drillDownId, setDrillDownId] = useState<string | null>(null);

  const {
    data,
    isLoading,
    isError,
    refetch,
    dataUpdatedAt,
  } = trpc.corridorLiveV2.getRates.useQuery({}, {
    staleTime: 30_000,
    refetchInterval: 30_000,
  });

  const allRates = useMemo(() => {
    if (!data) return [];
    const corridors = data.corridors.map((c: any) => ({ ...c, isMajor: false }));
    const major = data.majorRates.map((c: any) => ({ ...c, isMajor: true }));
    return showMajorOnly ? [...corridors] : [...corridors, ...major];
  }, [data, showMajorOnly]);

  const lastUpdated = dataUpdatedAt ? new Date(dataUpdatedAt).toLocaleTimeString() : null;

  return (
    <div className="p-6 space-y-6">
      {/* Page header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Activity className="w-6 h-6 text-blue-600" /> Corridor Live Stats
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Real-time FX rates, volume heatmap, and multi-currency ledger drill-down
          </p>
        </div>
        <div className="flex items-center gap-3">
          {lastUpdated && (
            <span className="text-xs text-muted-foreground flex items-center gap-1">
              <Clock className="w-3 h-3" /> Updated {lastUpdated}
            </span>
          )}
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-1" /> Refresh
          </Button>
        </div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 border-b">
        {(["rates", "heatmap", "ledger"] as const).map((tab) => (
          <button
            key={tab}
            onClick={() => setActiveTab(tab)}
            className={`px-4 py-2 text-sm font-medium capitalize border-b-2 transition-colors ${
              activeTab === tab
                ? "border-blue-600 text-blue-600"
                : "border-transparent text-muted-foreground hover:text-foreground"
            }`}
          >
            {tab === "rates" && <Activity className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "heatmap" && <BarChart3 className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "ledger" && <Wallet className="w-3.5 h-3.5 inline mr-1.5" />}
            {tab === "rates" ? "Live Rates" : tab === "heatmap" ? "Volume Heatmap" : "Ledger"}
          </button>
        ))}
      </div>

      {/* ── Tab: Live Rates ── */}
      {activeTab === "rates" && (
        <div className="space-y-4">
          {/* Controls */}
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <Switch
                id="corridors-only"
                checked={showMajorOnly}
                onCheckedChange={setShowMajorOnly}
              />
              <Label htmlFor="corridors-only" className="text-sm">
                Active corridors only
              </Label>
            </div>
          </div>

          {isError && (
            <div className="flex items-center gap-2 p-3 bg-destructive/10 text-destructive rounded-lg text-sm">
              <AlertCircle className="w-4 h-4" /> Failed to load FX rates. Retrying…
            </div>
          )}

          {isLoading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {Array.from({ length: 8 }).map((_, i) => (
                <Card key={i} className="animate-pulse">
                  <CardContent className="pt-4 pb-3 space-y-3">
                    <div className="h-4 bg-muted rounded w-2/3" />
                    <div className="h-8 bg-muted rounded w-1/2" />
                    <div className="h-10 bg-muted rounded" />
                  </CardContent>
                </Card>
              ))}
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-4">
              {allRates.map((c: any) => (
                <RateCard
                  key={`${c.sourceCurrency}/${c.destCurrency}`}
                  sourceCurrency={c.sourceCurrency}
                  destCurrency={c.destCurrency}
                  midRate={c.midRate}
                  effectiveRate={c.effectiveRate}
                  fxMarkupPct={c.fxMarkupPct ?? 0}
                  isEnabled={c.isEnabled}
                  rateAge={c.rateAge}
                  corridorId={c.id}
                  onDrillDown={(id) => setDrillDownId(id)}
                />
              ))}
              {allRates.length === 0 && (
                <div className="col-span-full text-center py-12 text-muted-foreground">
                  <Globe className="w-10 h-10 mx-auto mb-3 opacity-30" />
                  <p>No corridors configured yet.</p>
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* ── Tab: Volume Heatmap ── */}
      {activeTab === "heatmap" && (
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="w-5 h-5 text-blue-600" /> Volume Heatmap
              </CardTitle>
              <Select value={String(heatmapDays)} onValueChange={(v) => setHeatmapDays(Number(v))}>
                <SelectTrigger className="h-8 w-28 text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="1">Last 1 day</SelectItem>
                  <SelectItem value="7">Last 7 days</SelectItem>
                  <SelectItem value="14">Last 14 days</SelectItem>
                  <SelectItem value="30">Last 30 days</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </CardHeader>
          <CardContent>
            <VolumeHeatmap days={heatmapDays} />
          </CardContent>
        </Card>
      )}

      {/* ── Tab: Ledger ── */}
      {activeTab === "ledger" && <LedgerPanel />}

      {/* Corridor detail drawer */}
      <CorridorDetailDrawer
        corridorId={drillDownId}
        open={!!drillDownId}
        onClose={() => setDrillDownId(null)}
      />
    </div>
  );
}
