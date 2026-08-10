// @ts-nocheck
import { useState, useEffect } from "react";
import { trpc } from "@/lib/trpc";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { useAdaptiveInterval } from "@/lib/networkQuality";
import {
  ChefHat, RefreshCw, Clock, CheckCircle2, AlertTriangle,
  Zap, Bell, Monitor, Settings2
} from "lucide-react";

// ── helpers ──────────────────────────────────────────────────────────────────
function elapsed(createdAt: Date | string): { label: string; urgent: boolean } {
  const ms = Date.now() - new Date(createdAt).getTime();
  const mins = Math.floor(ms / 60_000);
  return { label: `${mins}m`, urgent: mins >= 15 };
}

function ElapsedBadge({ createdAt }: { createdAt: Date | string }) {
  const [, setTick] = useState(0);
  useEffect(() => {
    const id = setInterval(() => setTick((t: any) => t + 1), 30_000);
    return () => clearInterval(id);
  }, []);
  const { label, urgent } = elapsed(createdAt);
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold ${
        urgent ? "bg-red-600 text-white animate-pulse" : "bg-amber-100 text-amber-800"
      }`}
    >
      <Clock className="w-3 h-3" />
      {label}
    </span>
  );
}

// ── Station filter bar ────────────────────────────────────────────────────────
function StationBar({
  stations,
  active,
  onChange,
}: {
  stations: { id: string; name: string }[];
  active: string | null;
  onChange: (id: string | null) => void;
}) {
  return (
    <div className="flex gap-2 flex-wrap">
      <button
        onClick={() => onChange(null)}
        className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
          active === null
            ? "bg-primary text-primary-foreground"
            : "bg-muted text-muted-foreground hover:bg-muted/80"
        }`}
      >
        All Stations
      </button>
      {stations.map((s: any) => (
        <button
          key={s.id}
          onClick={() => onChange(s.id)}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            active === s.id
              ? "bg-primary text-primary-foreground"
              : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          {s.name}
        </button>
      ))}
    </div>
  );
}

// ── Order card ────────────────────────────────────────────────────────────────
function OrderCard({
  order,
  onMarkItemReady,
  onMarkComplete,
  markingItem,
  markingOrder,
}: {
  order: any;
  onMarkItemReady: (itemId: number) => void;
  onMarkComplete: (orderId: string, tableNumber?: string) => void;
  markingItem: number | null;
  markingOrder: string | null;
}) {
  const allItemsReady = (order.items ?? []).every((i: any) => i.status === "ready" || i.ready);
  const pendingCount = (order.items ?? []).filter((i: any) => i.status !== "ready" && !i.ready).length;

  return (
    <div
      className={`rounded-2xl border-2 bg-card flex flex-col transition-all ${
        allItemsReady ? "border-emerald-400 shadow-emerald-100 shadow-lg" : "border-border shadow-sm"
      }`}
    >
      {/* Header */}
      <div className={`flex items-center justify-between px-4 py-3 rounded-t-2xl ${
        allItemsReady ? "bg-emerald-50" : "bg-muted/50"
      }`}>
        <div className="flex items-center gap-2">
          <span className="font-bold text-lg">
            {order.tableNumber ? `Table ${order.tableNumber}` : `#${String(order.id).slice(-4).toUpperCase()}`}
          </span>
          {order.covers && (
            <Badge variant="outline" className="text-xs">{order.covers} cvr</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {pendingCount > 0 && (
            <span className="text-xs text-muted-foreground">{pendingCount} left</span>
          )}
          <ElapsedBadge createdAt={order.createdAt} />
        </div>
      </div>

      {/* Items */}
      <div className="flex-1 p-4 space-y-2">
        {(order.items ?? []).length === 0 && (
          <p className="text-sm text-muted-foreground italic">No items</p>
        )}
        {(order.items ?? []).map((item: any) => {
          const ready = item.status === "ready" || item.ready;
          return (
            <div
              key={item.id}
              className={`flex items-start justify-between gap-3 p-3 rounded-xl transition-all ${
                ready
                  ? "bg-emerald-50 border border-emerald-200 opacity-60"
                  : "bg-background border border-border"
              }`}
            >
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-bold text-sm text-primary">×{item.qty}</span>
                  <span className="font-medium text-sm truncate">{item.name}</span>
                  {item.courseNumber > 1 && (
                    <Badge variant="secondary" className="text-xs shrink-0">C{item.courseNumber}</Badge>
                  )}
                </div>
                {item.notes && (
                  <p className="text-xs text-amber-700 mt-0.5 flex items-center gap-1">
                    <AlertTriangle className="w-3 h-3 shrink-0" />
                    {item.notes}
                  </p>
                )}
              </div>
              {!ready ? (
                <button
                  onClick={() => onMarkItemReady(item.id)}
                  disabled={markingItem === item.id}
                  className="shrink-0 px-2.5 py-1 rounded-lg bg-emerald-600 text-white text-xs font-semibold hover:bg-emerald-700 disabled:opacity-50 transition-colors"
                >
                  {markingItem === item.id ? "…" : "Ready"}
                </button>
              ) : (
                <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0 mt-0.5" />
              )}
            </div>
          );
        })}
      </div>

      {/* Footer — Bump bar */}
      <div className="px-4 pb-4">
        {order.notes && (
          <p className="text-xs text-muted-foreground mb-2 flex items-center gap-1">
            <Bell className="w-3 h-3" /> {order.notes}
          </p>
        )}
        <Button
          className="w-full"
          variant={allItemsReady ? "default" : "outline"}
          disabled={markingOrder === order.id}
          onClick={() => onMarkComplete(order.id, order.tableNumber)}
        >
          <CheckCircle2 className="w-4 h-4 mr-1.5" />
          {markingOrder === order.id ? "Completing…" : allItemsReady ? "Bump — Complete Order" : "Complete Order"}
        </Button>
      </div>
    </div>
  );
}

// ── Main KDS page ─────────────────────────────────────────────────────────────
export default function KitchenDisplay() {
  const utils = trpc.useUtils();
  const kitchenInterval = useAdaptiveInterval(15000);
  const [activeStation, setActiveStation] = useState<string | null>(null);
  const [markingItem, setMarkingItem] = useState<number | null>(null);
  const [markingOrder, setMarkingOrder] = useState<string | null>(null);
  const [fullscreen, setFullscreen] = useState(false);

  const { data: stationsData } = trpc.kds.listStations.useQuery(undefined, { staleTime: 60_000 });
  const { data, isLoading, refetch } = trpc.kds.listOrders.useQuery(undefined, {
    refetchInterval: kitchenInterval,
  }, { staleTime: 30_000 });

  const markItemReady = trpc.kds.markItemReady.useMutation({
    onMutate: ({ itemId }) => setMarkingItem(itemId),
    onSuccess: () => { utils.kds.listOrders.invalidate(); toast.success("Item marked ready"); },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setMarkingItem(null),
  });

  const markOrderComplete = trpc.kds.markOrderComplete.useMutation({
    onMutate: ({ orderId }) => setMarkingOrder(orderId),
    onSuccess: () => { utils.kds.listOrders.invalidate(); toast.success("Order complete — soundbox notified"); },
    onError: (e: any) => toast.error(e.message),
    onSettled: () => setMarkingOrder(null),
  });

  const stations: any[] = stationsData ?? [];
  const orders: any[] = data ?? [];

  const filteredOrders = activeStation
    ? orders.filter((o: any) =>
        (o.items ?? []).some((i: any) => {
          const station = stations.find((s: any) => s.id === activeStation);
          return station?.categories?.includes(i.category ?? "general");
        })
      )
    : orders;

  const pendingOrders = filteredOrders.filter((o: any) =>
    (o.items ?? []).some((i: any) => i.status !== "ready" && !i.ready)
  );
  const readyOrders = filteredOrders.filter((o: any) =>
    (o.items ?? []).length > 0 && (o.items ?? []).every((i: any) => i.status === "ready" || i.ready)
  );

  return (
    <div className={`${fullscreen ? "fixed inset-0 z-50 bg-background overflow-auto p-4" : "p-4"} space-y-4`}>
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-orange-500 flex items-center justify-center">
            <ChefHat className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Kitchen Display System</h1>
            <p className="text-xs text-muted-foreground">
              {pendingOrders.length} in-progress · {readyOrders.length} ready · auto-refresh 15s
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="outline" size="sm" aria-label="Refresh" onClick={() => refetch()}><RefreshCw/> Refresh
          </Button>
          <Button variant="outline" size="sm" onClick={() => setFullscreen((f: any) => !f)}>
            <Monitor className="w-3.5 h-3.5 mr-1" />
            {fullscreen ? "Exit Fullscreen" : "Fullscreen"}
          </Button>
        </div>
      </div>

      {/* Station filter */}
      {stations.length > 0 && (
        <StationBar stations={stations} active={activeStation} onChange={setActiveStation} />
      )}

      {isLoading ? (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-64 rounded-2xl" />)}
        </div>
      ) : filteredOrders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-24 text-center">
          <ChefHat className="w-16 h-16 text-muted-foreground/30 mb-4" />
          <p className="text-lg font-semibold text-muted-foreground">Kitchen is clear</p>
          <p className="text-sm text-muted-foreground mt-1">No active orders. Waiting for tickets…</p>
        </div>
      ) : (
        <>
          {pendingOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <Zap className="w-4 h-4 text-amber-500" />
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  In Progress ({pendingOrders.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {pendingOrders.map((order: any) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onMarkItemReady={(itemId) => markItemReady.mutate({ itemId })}
                    onMarkComplete={(orderId, tableNumber) =>
                      markOrderComplete.mutate({ orderId, tableNumber })
                    }
                    markingItem={markingItem}
                    markingOrder={markingOrder}
                  />
                ))}
              </div>
            </section>
          )}

          {readyOrders.length > 0 && (
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-4 h-4 text-emerald-500" />
                <h2 className="font-semibold text-sm text-muted-foreground uppercase tracking-wide">
                  Ready to Serve ({readyOrders.length})
                </h2>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
                {readyOrders.map((order: any) => (
                  <OrderCard
                    key={order.id}
                    order={order}
                    onMarkItemReady={(itemId) => markItemReady.mutate({ itemId })}
                    onMarkComplete={(orderId, tableNumber) =>
                      markOrderComplete.mutate({ orderId, tableNumber })
                    }
                    markingItem={markingItem}
                    markingOrder={markingOrder}
                  />
                ))}
              </div>
            </section>
          )}
        </>
      )}
    </div>
  );
}
