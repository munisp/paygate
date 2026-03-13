import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { toast } from "sonner";
import { RefreshCw, Receipt, Split, ChefHat } from "lucide-react";

const ORDER_STATUS_COLORS: Record<string, string> = {
  open: "bg-blue-100 text-blue-800",
  preparing: "bg-yellow-100 text-yellow-800",
  ready: "bg-green-100 text-green-800",
  served: "bg-gray-100 text-gray-700",
  paid: "bg-purple-100 text-purple-800",
  cancelled: "bg-red-100 text-red-800",
};

export default function RestaurantOrders() {
  const { isAuthenticated } = useAuth();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [selectedOrder, setSelectedOrder] = useState<any>(null);
  const [splitCount, setSplitCount] = useState(2);

  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.restaurant.listOrders.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter },
    { enabled: isAuthenticated, refetchInterval: 30_000 }
  );

  const updateStatus = trpc.restaurant.updateOrderStatus.useMutation({
    onSuccess: () => {
      utils.restaurant.listOrders.invalidate();
      toast.success("Order status updated");
    },
    onError: (e: any) => toast.error(e.message),
  });

  const createSplitBill = trpc.restaurant.createSplitBill.useMutation({
    onSuccess: (result: any) => {
      toast.success(`Split bill created — ${result.shares?.length ?? splitCount} payment links generated`);
      setSelectedOrder(null);
    },
    onError: (e: any) => toast.error(e.message),
  });

  const orders: any[] = data ?? [];

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">Restaurant Orders</h1>
          <p className="text-muted-foreground text-sm mt-1">Live order queue — auto-refreshes every 30 seconds</p>
        </div>
        <div className="flex gap-2 items-center">
          <Select value={statusFilter} onValueChange={setStatusFilter}>
            <SelectTrigger className="w-36">
              <SelectValue placeholder="Filter status" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All</SelectItem>
              <SelectItem value="open">Open</SelectItem>
              <SelectItem value="preparing">Preparing</SelectItem>
              <SelectItem value="ready">Ready</SelectItem>
              <SelectItem value="served">Served</SelectItem>
              <SelectItem value="paid">Paid</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-4 h-4 mr-2" /> Refresh
          </Button>
        </div>
      </div>

      {isLoading ? (
        <div className="text-center py-12 text-muted-foreground">Loading orders…</div>
      ) : orders.length === 0 ? (
        <div className="text-center py-16 text-muted-foreground">
          <Receipt className="w-12 h-12 mx-auto mb-3 opacity-30" />
          <p>No orders found.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order: any) => (
            <Card key={order.id} className="hover:shadow-md transition-shadow">
              <CardHeader className="pb-2">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-base">Table {order.tableNumber ?? "—"}</CardTitle>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-medium ${ORDER_STATUS_COLORS[order.status] ?? ""}`}>
                    {order.status}
                  </span>
                </div>
                <div className="text-xs text-muted-foreground">
                  {order.covers} covers · {new Date(order.createdAt).toLocaleTimeString()}
                </div>
              </CardHeader>
              <CardContent className="space-y-2">
                {/* Order items */}
                <div className="space-y-1">
                  {(order.items ?? []).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span>{item.qty}× {item.name}</span>
                      <span className="text-muted-foreground">₦{((item.unitPriceKobo ?? 0) * item.qty / 100).toLocaleString()}</span>
                    </div>
                  ))}
                </div>

                <div className="border-t pt-2 flex justify-between font-medium">
                  <span>Total</span>
                  <span>₦{((order.totalKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                </div>

                {/* Actions */}
                <div className="flex gap-2 pt-1">
                  <Select
                    value={order.status}
                    onValueChange={(val) => updateStatus.mutate({ id: order.id, status: val as any })}
                  >
                    <SelectTrigger className="h-7 flex-1 text-xs">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {["open", "preparing", "ready", "served", "paid", "cancelled"].map((s) => (
                        <SelectItem key={s} value={s}>{s}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-7 px-2"
                    title="Split Bill"
                    onClick={() => setSelectedOrder(order)}
                  >
                    <Split className="w-3 h-3" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* Split bill dialog */}
      <Dialog open={!!selectedOrder} onOpenChange={() => setSelectedOrder(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Split Bill — Table {selectedOrder?.tableNumber}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div className="text-sm text-muted-foreground">
              Total: <span className="font-medium text-foreground">₦{((selectedOrder?.totalKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
            </div>
            <div className="space-y-2">
              <label className="text-sm font-medium">Number of ways to split</label>
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map((n) => (
                  <button
                    key={n}
                    className={`w-10 h-10 rounded-lg border text-sm font-medium transition-colors ${splitCount === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"}`}
                    onClick={() => setSplitCount(n)}
                  >
                    {n}
                  </button>
                ))}
              </div>
            </div>
            <div className="text-sm text-muted-foreground">
              Each person pays: <span className="font-medium text-foreground">
                ₦{(((selectedOrder?.totalKobo ?? 0) / splitCount) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
              </span>
            </div>
            <Button
              className="w-full"
              onClick={() => createSplitBill.mutate({ orderId: selectedOrder.id, splitCount })}
            >
              <Split className="w-4 h-4 mr-2" /> Generate {splitCount} Payment Links
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
