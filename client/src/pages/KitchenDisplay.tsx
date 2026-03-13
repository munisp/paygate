import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { RefreshCw, ChefHat, CheckCircle2, Clock } from "lucide-react";

const ORDER_AGE_COLORS = (createdAt: string) => {
  const mins = (Date.now() - new Date(createdAt).getTime()) / 60000;
  if (mins < 5) return "border-green-400 bg-green-50";
  if (mins < 15) return "border-yellow-400 bg-yellow-50";
  return "border-red-400 bg-red-50";
};

export default function KitchenDisplay() {
  const { isAuthenticated } = useAuth();

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.kds.listOrders.useQuery(
    undefined,
    { enabled: isAuthenticated, refetchInterval: 10_000 }
  );

  const markItemReady = trpc.kds.markItemReady.useMutation({
    onSuccess: () => { utils.kds.listOrders.invalidate(); },
    onError: (e: any) => toast.error(e.message),
  });

  const markOrderComplete = trpc.kds.markOrderComplete.useMutation({
    onSuccess: () => { utils.kds.listOrders.invalidate(); toast.success("Order marked complete"); },
    onError: (e: any) => toast.error(e.message),
  });

  const orders: any[] = data ?? [];

  const getAge = (createdAt: string) => {
    const mins = Math.floor((Date.now() - new Date(createdAt).getTime()) / 60000);
    return mins < 60 ? `${mins}m` : `${Math.floor(mins / 60)}h ${mins % 60}m`;
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <ChefHat className="w-6 h-6" /> Kitchen Display System
          </h1>
          <p className="text-muted-foreground text-sm mt-1">
            Live order queue — auto-refreshes every 10 seconds
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <ChefHat className="w-16 h-16 mx-auto mb-4 opacity-20" />
          <p className="text-lg font-medium">Kitchen is clear!</p>
          <p className="text-sm">No active orders in the queue.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {orders.map((order: any) => (
            <div
              key={order.id}
              className={`border-2 rounded-xl p-4 space-y-3 ${ORDER_AGE_COLORS(order.createdAt)}`}
            >
              {/* Order header */}
              <div className="flex items-center justify-between">
                <div>
                  <div className="font-bold text-lg">Table {order.tableNumber ?? "—"}</div>
                  <div className="text-xs text-muted-foreground">{order.covers} covers</div>
                </div>
                <div className="flex items-center gap-1 text-sm font-medium">
                  <Clock className="w-4 h-4" />
                  {getAge(order.createdAt)}
                </div>
              </div>

              {/* Items */}
              <div className="space-y-2">
                {(order.items ?? []).map((item: any) => (
                  <div key={item.id} className="flex items-center justify-between bg-white/70 rounded-lg px-3 py-2">
                    <div>
                      <span className="font-bold mr-2">{item.qty}×</span>
                      <span className="font-medium">{item.name}</span>
                      {item.courseNumber && (
                        <span className="ml-2 text-xs bg-gray-200 text-gray-600 px-1.5 py-0.5 rounded">Course {item.courseNumber}</span>
                      )}
                    </div>
                    <Button
                      size="sm"
                      variant={item.ready ? "default" : "outline"}
                      className="h-7 px-2"
                      onClick={() => markItemReady.mutate({ itemId: item.id })}
                    >
                      {item.ready ? <CheckCircle2 className="w-3 h-3" /> : "Ready"}
                    </Button>
                  </div>
                ))}
              </div>

              {/* Complete button */}
              <Button
                className="w-full"
                size="sm"
                onClick={() => markOrderComplete.mutate({ orderId: order.id })}
              >
                <CheckCircle2 className="w-4 h-4 mr-2" /> Mark Order Complete
              </Button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
