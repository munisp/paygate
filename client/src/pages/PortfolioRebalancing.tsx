/**
 * PortfolioRebalancing.tsx
 *
 * Portfolio rebalancing orders — view and cancel rebalancing orders
 * across gold, mutual funds, and pension allocations.
 * Uses trpc.portfolioRebalancingEnhanced router.
 */
import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "sonner";
import { RefreshCw, AlertCircle, TrendingUp, XCircle, BarChart2 } from "lucide-react";

export default function PortfolioRebalancing() {
  const [status, setStatus] = useState<"all" | "pending" | "executing" | "completed" | "cancelled" | "failed">("all");
  const [page, setPage] = useState(1);

  const { data, isLoading, isError, refetch } = trpc.portfolioRebalancingEnhanced.getOrders.useQuery({
    status,
    page,
    limit: 20,
  });

  const cancelOrder = trpc.portfolioRebalancingEnhanced.cancelOrder.useMutation({
    onSuccess: () => { toast.success("Order cancelled"); refetch(); },
    onError: (err) => toast.error(err.message),
  });

  const statusColor = (s: string) => {
    if (s === "completed") return "bg-green-100 text-green-800";
    if (s === "executing") return "bg-blue-100 text-blue-800";
    if (s === "pending") return "bg-yellow-100 text-yellow-800";
    if (s === "cancelled") return "bg-gray-100 text-gray-600";
    if (s === "failed") return "bg-red-100 text-red-700";
    return "bg-gray-100 text-gray-600";
  };

  const formatNaira = (n: number) => `₦${(n / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}`;

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <BarChart2 className="w-6 h-6 text-indigo-600" /> Portfolio Rebalancing
          </h1>
          <p className="text-muted-foreground text-sm mt-1">View and manage portfolio rebalancing orders</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()}>
          <RefreshCw className="w-4 h-4 mr-2" /> Refresh
        </Button>
      </div>

      {isError && (
        <div className="flex items-center gap-2 text-destructive text-sm">
          <AlertCircle className="w-4 h-4" /> Failed to load rebalancing orders. Please refresh.
        </div>
      )}

      {/* Filter */}
      <div className="flex items-center gap-3">
        <Select value={status} onValueChange={(v) => { setStatus(v as any); setPage(1); }}>
          <SelectTrigger className="w-40">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All Orders</SelectItem>
            <SelectItem value="pending">Pending</SelectItem>
            <SelectItem value="executing">Executing</SelectItem>
            <SelectItem value="completed">Completed</SelectItem>
            <SelectItem value="cancelled">Cancelled</SelectItem>
            <SelectItem value="failed">Failed</SelectItem>
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">{data?.total ?? 0} orders</span>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <TrendingUp className="w-5 h-5 text-indigo-500" /> Rebalancing Orders
          </CardTitle>
        </CardHeader>
        <CardContent>
          {isLoading ? (
            <div className="text-muted-foreground text-sm py-8 text-center">Loading orders…</div>
          ) : !data?.items?.length ? (
            <div className="text-center py-12">
              <BarChart2 className="w-12 h-12 text-muted-foreground mx-auto mb-3" />
              <p className="text-muted-foreground">No rebalancing orders found.</p>
            </div>
          ) : (
            <div className="space-y-4">
              {data.items.map((order: any) => (
                <div key={order.id} className="border rounded-lg p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <div>
                      <p className="font-mono text-xs text-muted-foreground">{order.id}</p>
                      <p className="text-sm text-muted-foreground">
                        {order.createdAt ? new Date(order.createdAt).toLocaleString() : "—"}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <Badge className={statusColor(order.status)}>{order.status}</Badge>
                      {(order.status === "pending" || order.status === "executing") && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="text-red-600"
                          onClick={() => cancelOrder.mutate({ orderId: order.id })}
                          disabled={cancelOrder.isPending}
                        >
                          <XCircle className="w-4 h-4" />
                        </Button>
                      )}
                    </div>
                  </div>

                  {/* Allocation targets */}
                  <div className="grid grid-cols-3 gap-3 text-sm">
                    <div className="bg-yellow-50 rounded p-2 text-center">
                      <p className="text-xs text-muted-foreground">Gold</p>
                      <p className="font-bold">{order.currentGoldPct ?? 0}% → {order.targetGoldPct ?? 0}%</p>
                    </div>
                    <div className="bg-blue-50 rounded p-2 text-center">
                      <p className="text-xs text-muted-foreground">Mutual Funds</p>
                      <p className="font-bold">{order.currentMutualFundsPct ?? 0}% → {order.targetMutualFundsPct ?? 0}%</p>
                    </div>
                    <div className="bg-green-50 rounded p-2 text-center">
                      <p className="text-xs text-muted-foreground">Pension</p>
                      <p className="font-bold">{order.currentPensionPct ?? 0}% → {order.targetPensionPct ?? 0}%</p>
                    </div>
                  </div>

                  {/* Sub-orders */}
                  {order.orders?.length > 0 && (
                    <div className="space-y-1">
                      {order.orders.map((sub: any, i: number) => (
                        <div key={i} className="flex items-center justify-between text-xs text-muted-foreground">
                          <span className="capitalize">{sub.action} {sub.asset}</span>
                          <span>{sub.amountNgn ? formatNaira(sub.amountNgn) : "—"}</span>
                          <Badge className={statusColor(sub.status ?? "pending")} style={{ fontSize: "10px" }}>
                            {sub.status ?? "pending"}
                          </Badge>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              ))}

              <div className="flex items-center justify-between mt-4">
                <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(p => p - 1)}>Previous</Button>
                <span className="text-xs text-muted-foreground">Page {page}</span>
                <Button variant="outline" size="sm" disabled={data.items.length < 20} onClick={() => setPage(p => p + 1)}>Next</Button>
              </div>
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
