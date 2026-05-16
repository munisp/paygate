// @ts-nocheck
/**
 * AdminCorridorMonitor — Cross-tenant corridor volume heatmap,
 * FX markup management, and daily limit monitoring.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { toast } from "sonner";
import {
  Globe,
  TrendingUp,
  AlertTriangle,
  Search,
  ArrowRight,
  ToggleLeft,
  ToggleRight,
  Settings,
} from "lucide-react";

const CURRENCY_FLAGS: Record<string, string> = {
  NGN: "🇳🇬",
  USD: "🇺🇸",
  GBP: "🇬🇧",
  EUR: "🇪🇺",
  GHS: "🇬🇭",
  KES: "🇰🇪",
  ZAR: "🇿🇦",
  XOF: "🌍",
  EGP: "🇪🇬",
  TZS: "🇹🇿",
};

function VolumeBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  const color =
    pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : pct >= 40 ? "bg-blue-500" : "bg-green-500";
  return (
    <div className="w-full bg-muted rounded-full h-2">
      <div className={`h-2 rounded-full ${color}`} style={{ width: `${pct}%` }} />
    </div>
  );
}

export default function AdminCorridorMonitor() {
  const [search, setSearch] = useState("");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [fxMarkup, setFxMarkup] = useState("");
  const [dailyLimit, setDailyLimit] = useState("");

  const { data: corridorsData, refetch, isLoading, isError } = trpc.wave26.corridors.list.useQuery({});
  const toggleMutation = trpc.wave26.corridors.toggle.useMutation({
    onSuccess: () => { toast.success("Corridor status updated"); refetch(); },
    onError: (e: any) => toast.error(e.message),
  });
  const updateMutation = trpc.wave26.corridors.update.useMutation({
    onSuccess: () => {
      toast.success("Corridor updated");
      setEditingId(null);
      refetch();
    },
    onError: (e: any) => toast.error(e.message),
  });

  const corridors = (corridorsData?.corridors ?? []).filter(
    (c: any) =>
      !search ||
      c.sourceCurrency?.toLowerCase().includes(search.toLowerCase()) ||
      c.destCurrency?.toLowerCase().includes(search.toLowerCase()),
  );

  const maxVolume = Math.max(...corridors.map((c: any) => c.dailyVolumeKobo ?? 0), 1);

  const totalVolume = corridors.reduce((s: number, c: any) => s + (c.dailyVolumeKobo ?? 0), 0);
  const activeCount = corridors.filter((c: any) => c.enabled).length;
  const atCapacityCount = corridors.filter(
    (c: any) => (c.dailyVolumeKobo ?? 0) >= (c.dailyLimitKobo ?? Infinity) * 0.9,
  ).length;

  const formatKobo = (k: number) => `₦${(k / 100).toLocaleString("en-NG")}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center gap-3">
        <Globe className="h-8 w-8 text-primary" />
        <div>
          <h1 className="text-2xl font-bold">Corridor Monitor</h1>
          <p className="text-muted-foreground">Cross-tenant corridor volume heatmap and FX management</p>
        </div>
      </div>

      {/* Summary */}
      <div className="grid grid-cols-3 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold">{corridors.length}</div>
            <div className="text-xs text-muted-foreground mt-1">Total Corridors</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-green-600">{activeCount}</div>
            <div className="text-xs text-muted-foreground mt-1">Active</div>
          </CardContent>
        </Card>
        <Card className={atCapacityCount > 0 ? "border-red-300 bg-red-50" : ""}>
          <CardContent className="p-4 text-center">
            <div className={`text-2xl font-bold ${atCapacityCount > 0 ? "text-red-600" : ""}`}>
              {atCapacityCount}
            </div>
            <div className="text-xs text-muted-foreground mt-1">Near Capacity</div>
          </CardContent>
        </Card>
      </div>

      {/* Total Volume */}
      <Card className="bg-gradient-to-r from-primary/10 to-primary/5 border-primary/20">
        <CardContent className="p-4 flex items-center justify-between">
          <div>
            <div className="text-sm text-muted-foreground">Today's Total Cross-Border Volume</div>
            <div className="text-3xl font-bold mt-1">{formatKobo(totalVolume)}</div>
          </div>
          <TrendingUp className="h-10 w-10 text-primary/40" />
        </CardContent>
      </Card>

      {/* Search */}
      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search corridors (e.g. NGN, USD)..."
          className="pl-9"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Corridor Heatmap */}
      <div className="space-y-3">
        {corridors.length === 0 ? (
          <Card>
            <CardContent className="py-12 text-center">
              <Globe className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No corridors configured</p>
            </CardContent>
          </Card>
        ) : (
          corridors.map((corridor: any) => {
            const isEditing = editingId === corridor.id;
            const volumePct =
              corridor.dailyLimitKobo > 0
                ? (corridor.dailyVolumeKobo / corridor.dailyLimitKobo) * 100
                : 0;
            const isNearCapacity = volumePct >= 90;

            return (
              <Card
                key={corridor.id}
                className={`${!corridor.enabled ? "opacity-60" : ""} ${
                  isNearCapacity ? "border-red-300" : ""
                }`}
              >
                <CardContent className="p-4">
                  <div className="flex items-start justify-between gap-4">
                    {/* Corridor Label */}
                    <div className="flex items-center gap-3 min-w-0">
                      <div className="flex items-center gap-2 text-lg font-bold whitespace-nowrap">
                        <span>{CURRENCY_FLAGS[corridor.sourceCurrency] ?? "🌐"}</span>
                        <span className="text-sm">{corridor.sourceCurrency}</span>
                        <ArrowRight className="h-4 w-4 text-muted-foreground" />
                        <span>{CURRENCY_FLAGS[corridor.destCurrency] ?? "🌐"}</span>
                        <span className="text-sm">{corridor.destCurrency}</span>
                      </div>
                      {!corridor.enabled && <Badge variant="secondary">Disabled</Badge>}
                      {isNearCapacity && (
                        <Badge className="bg-red-100 text-red-700">
                          <AlertTriangle className="h-3 w-3 mr-1" /> Near Limit
                        </Badge>
                      )}
                    </div>

                    {/* Actions */}
                    <div className="flex items-center gap-2 shrink-0">
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setEditingId(isEditing ? null : corridor.id)}
                      >
                        <Settings className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() =>
                          toggleMutation.mutate({
                            corridorId: corridor.id,
                            enabled: !corridor.enabled,
                          })
                        }
                      >
                        {corridor.enabled ? (
                          <ToggleRight className="h-5 w-5 text-green-600" />
                        ) : (
                          <ToggleLeft className="h-5 w-5 text-muted-foreground" />
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Volume Bar */}
                  <div className="mt-3 space-y-1">
                    <div className="flex justify-between text-xs text-muted-foreground">
                      <span>Daily Volume: {formatKobo(corridor.dailyVolumeKobo ?? 0)}</span>
                      <span>Limit: {formatKobo(corridor.dailyLimitKobo ?? 0)}</span>
                    </div>
                    <VolumeBar value={corridor.dailyVolumeKobo ?? 0} max={maxVolume} />
                  </div>

                  {/* FX Markup */}
                  <div className="mt-2 flex items-center gap-4 text-sm text-muted-foreground">
                    <span>FX Markup: <strong>{(corridor.fxMarkupBps ?? 0) / 100}%</strong></span>
                    <span>Tenants: <strong>{corridor.tenantCount ?? 0}</strong></span>
                    <span>Tx Today: <strong>{corridor.txCountToday ?? 0}</strong></span>
                  </div>

                  {/* Edit Form */}
                  {isEditing && (
                    <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-3">
                      <div>
                        <label className="text-xs text-muted-foreground">FX Markup (bps)</label>
                        <Input
                          type="number"
                          placeholder={String(corridor.fxMarkupBps ?? 0)}
                          value={fxMarkup}
                          onChange={(e) => setFxMarkup(e.target.value)}
                          className="mt-1"
                        />
                        <div className="text-xs text-muted-foreground mt-0.5">
                          100 bps = 1%
                        </div>
                      </div>
                      <div>
                        <label className="text-xs text-muted-foreground">Daily Limit (Kobo)</label>
                        <Input
                          type="number"
                          placeholder={String(corridor.dailyLimitKobo ?? 0)}
                          value={dailyLimit}
                          onChange={(e) => setDailyLimit(e.target.value)}
                          className="mt-1"
                        />
                      </div>
                      <div className="col-span-2 flex gap-2">
                        <Button
                          size="sm"
                          onClick={() =>
                            updateMutation.mutate({
                              corridorId: corridor.id,
                              fxMarkupBps: fxMarkup ? parseInt(fxMarkup) : undefined,
                              dailyLimitKobo: dailyLimit ? parseInt(dailyLimit) : undefined,
                            })
                          }
                          disabled={updateMutation.isPending}
                        >
                          Save Changes
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => setEditingId(null)}
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })
        )}
      </div>
    </div>
  );
}
