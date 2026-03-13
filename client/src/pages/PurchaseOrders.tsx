/**
 * Purchase Orders
 * Full PO management page with status workflow: pending → approved → received → cancelled.
 * Features: KPI cards, status filter tabs, approve/cancel actions, PO detail drawer.
 */
import { useState } from "react";
import { ShoppingCart, CheckCircle2, XCircle, Package, Clock, TrendingUp, ChevronRight, Filter } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";

type POStatus = "all" | "pending" | "approved" | "received" | "cancelled";

const STATUS_META: Record<string, { label: string; color: string; bg: string; icon: typeof Clock }> = {
  pending:   { label: "Pending",   color: "text-amber-400",  bg: "bg-amber-500/15",  icon: Clock },
  approved:  { label: "Approved",  color: "text-blue-400",   bg: "bg-blue-500/15",   icon: CheckCircle2 },
  received:  { label: "Received",  color: "text-green-400",  bg: "bg-green-500/15",  icon: Package },
  cancelled: { label: "Cancelled", color: "text-red-400",    bg: "bg-red-500/15",    icon: XCircle },
};

function formatNGN(kobo: number) {
  return new Intl.NumberFormat("en-NG", { style: "currency", currency: "NGN", minimumFractionDigits: 0 }).format(kobo / 100);
}

export default function PurchaseOrders() {
  const [statusFilter, setStatusFilter] = useState<POStatus>("all");
  const [selectedPO, setSelectedPO] = useState<any | null>(null);
  const utils = trpc.useUtils();

  const { data, isLoading, refetch } = trpc.purchaseOrders.list.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter, limit: 100 },
    { staleTime: 30_000 }
  );

  const updateStatus = trpc.purchaseOrders.updateStatus.useMutation({
    onSuccess: (_, vars) => {
      toast.success(`PO ${vars.status === "approved" ? "approved" : vars.status === "received" ? "marked as received" : "cancelled"}`);
      utils.purchaseOrders.list.invalidate();
      setSelectedPO(null);
    },
    onError: (err) => toast.error(err.message),
  });

  const orders: any[] = data?.orders ?? [];

  // KPI counts
  const allOrders = orders;
  const pending = allOrders.filter((o) => o.status === "pending");
  const approved = allOrders.filter((o) => o.status === "approved");
  const received = allOrders.filter((o) => o.status === "received");
  const totalCommitted = allOrders
    .filter((o) => o.status !== "cancelled")
    .reduce((s, o) => s + Number(o.totalCostKobo ?? 0), 0);

  const TABS: { key: POStatus; label: string; count?: number }[] = [
    { key: "all", label: "All", count: allOrders.length },
    { key: "pending", label: "Pending", count: pending.length },
    { key: "approved", label: "Approved", count: approved.length },
    { key: "received", label: "Received", count: received.length },
    { key: "cancelled", label: "Cancelled" },
  ];

  return (
    <div className="p-6 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground" style={{ fontFamily: "Space Grotesk, sans-serif" }}>
            Purchase Orders
          </h1>
          <p className="text-sm text-muted-foreground mt-0.5">Manage vendor purchase orders and restock approvals</p>
        </div>
        <Button variant="outline" size="sm" onClick={() => refetch()} className="gap-2">
          <Filter className="w-4 h-4" />
          Refresh
        </Button>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        {[
          { label: "Pending Approval", value: pending.length, icon: Clock, color: "text-amber-400", bg: "bg-amber-500/10" },
          { label: "Approved", value: approved.length, icon: CheckCircle2, color: "text-blue-400", bg: "bg-blue-500/10" },
          { label: "Received", value: received.length, icon: Package, color: "text-green-400", bg: "bg-green-500/10" },
          { label: "Total Committed", value: formatNGN(totalCommitted), icon: TrendingUp, color: "text-primary", bg: "bg-primary/10", wide: true },
        ].map((kpi) => (
          <div key={kpi.label} className="bg-card rounded-xl border border-border p-4">
            <div className="flex items-center gap-3">
              <div className={`w-9 h-9 rounded-lg ${kpi.bg} flex items-center justify-center`}>
                <kpi.icon className={`w-4 h-4 ${kpi.color}`} />
              </div>
              <div>
                <p className="text-xs text-muted-foreground">{kpi.label}</p>
                <p className="text-xl font-bold text-foreground">{kpi.value}</p>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Status Filter Tabs */}
      <div className="flex gap-2 overflow-x-auto pb-1">
        {TABS.map((t) => (
          <button
            key={t.key}
            onClick={() => setStatusFilter(t.key)}
            className={`flex-shrink-0 flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-medium transition-all ${
              statusFilter === t.key
                ? "bg-primary text-primary-foreground shadow"
                : "bg-card border border-border text-muted-foreground hover:text-foreground"
            }`}
          >
            {t.label}
            {t.count !== undefined && t.count > 0 && (
              <span className={`text-xs px-1.5 py-0.5 rounded-full ${
                statusFilter === t.key ? "bg-white/20" : "bg-muted"
              }`}>
                {t.count}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* PO Table */}
      <div className="bg-card rounded-xl border border-border overflow-hidden">
        {isLoading ? (
          <div className="p-8 text-center text-muted-foreground text-sm">Loading purchase orders…</div>
        ) : orders.length === 0 ? (
          <div className="p-12 text-center">
            <ShoppingCart className="w-10 h-10 text-muted-foreground/30 mx-auto mb-3" />
            <p className="text-sm font-medium text-muted-foreground">No purchase orders</p>
            <p className="text-xs text-muted-foreground/60 mt-1">
              Create POs from the Inventory page on low-stock items
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-border bg-muted/30">
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Item</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Vendor</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Qty</th>
                  <th className="text-right px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Total</th>
                  <th className="text-center px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                  <th className="text-left px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {orders.map((po) => {
                  const meta = STATUS_META[po.status] ?? STATUS_META.pending;
                  const StatusIcon = meta.icon;
                  return (
                    <tr key={po.id} className="hover:bg-muted/20 transition-colors">
                      <td className="px-4 py-3">
                        <p className="font-medium text-foreground">{po.itemName}</p>
                        <p className="text-xs text-muted-foreground">{po.id}</p>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground">{po.vendorName ?? "—"}</td>
                      <td className="px-4 py-3 text-right font-medium">{po.quantity} {po.unit}</td>
                      <td className="px-4 py-3 text-right font-semibold">{formatNGN(Number(po.totalCostKobo))}</td>
                      <td className="px-4 py-3">
                        <div className="flex justify-center">
                          <span className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-medium ${meta.bg} ${meta.color}`}>
                            <StatusIcon className="w-3 h-3" />
                            {meta.label}
                          </span>
                        </div>
                      </td>
                      <td className="px-4 py-3 text-muted-foreground text-xs">
                        {new Date(po.createdAt).toLocaleDateString("en-NG", { day: "numeric", month: "short", year: "numeric" })}
                      </td>
                      <td className="px-4 py-3">
                        <button
                          onClick={() => setSelectedPO(po)}
                          className="p-1.5 rounded-lg hover:bg-muted transition-colors text-muted-foreground"
                        >
                          <ChevronRight className="w-4 h-4" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* PO Detail Drawer */}
      {selectedPO && (
        <div className="fixed inset-0 z-50 flex">
          <div className="flex-1 bg-black/40 backdrop-blur-sm" onClick={() => setSelectedPO(null)} />
          <div className="w-full max-w-md bg-background border-l border-border overflow-y-auto">
            <div className="p-6 space-y-6">
              {/* Header */}
              <div className="flex items-start justify-between">
                <div>
                  <h2 className="text-lg font-bold text-foreground">{selectedPO.itemName}</h2>
                  <p className="text-xs text-muted-foreground mt-0.5">{selectedPO.id}</p>
                </div>
                <button onClick={() => setSelectedPO(null)} className="p-2 rounded-lg hover:bg-muted transition-colors">
                  <XCircle className="w-5 h-5 text-muted-foreground" />
                </button>
              </div>

              {/* Status Badge */}
              {(() => {
                const meta = STATUS_META[selectedPO.status] ?? STATUS_META.pending;
                const StatusIcon = meta.icon;
                return (
                  <span className={`inline-flex items-center gap-2 px-3 py-1.5 rounded-full text-sm font-medium ${meta.bg} ${meta.color}`}>
                    <StatusIcon className="w-4 h-4" />
                    {meta.label}
                  </span>
                );
              })()}

              {/* Details */}
              <div className="bg-muted/30 rounded-xl p-4 space-y-3">
                {[
                  { label: "Vendor", value: selectedPO.vendorName ?? "—" },
                  { label: "Quantity", value: `${selectedPO.quantity} ${selectedPO.unit}` },
                  { label: "Unit Cost", value: formatNGN(Number(selectedPO.unitCostKobo)) },
                  { label: "Total Cost", value: formatNGN(Number(selectedPO.totalCostKobo)) },
                  { label: "Created", value: new Date(selectedPO.createdAt).toLocaleString("en-NG") },
                ].map(({ label, value }) => (
                  <div key={label} className="flex justify-between text-sm">
                    <span className="text-muted-foreground">{label}</span>
                    <span className="font-medium text-foreground">{value}</span>
                  </div>
                ))}
                {selectedPO.notes && (
                  <div className="pt-2 border-t border-border">
                    <p className="text-xs text-muted-foreground mb-1">Notes</p>
                    <p className="text-sm text-foreground">{selectedPO.notes}</p>
                  </div>
                )}
              </div>

              {/* Status Workflow Actions */}
              <div className="space-y-3">
                <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Actions</p>
                {selectedPO.status === "pending" && (
                  <>
                    <Button
                      className="w-full gap-2"
                      onClick={() => updateStatus.mutate({ id: selectedPO.id, status: "approved" })}
                      disabled={updateStatus.isPending}
                    >
                      <CheckCircle2 className="w-4 h-4" />
                      Approve PO
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                      onClick={() => updateStatus.mutate({ id: selectedPO.id, status: "cancelled" })}
                      disabled={updateStatus.isPending}
                    >
                      <XCircle className="w-4 h-4" />
                      Cancel PO
                    </Button>
                  </>
                )}
                {selectedPO.status === "approved" && (
                  <>
                    <Button
                      className="w-full gap-2 bg-green-600 hover:bg-green-700"
                      onClick={() => updateStatus.mutate({ id: selectedPO.id, status: "received" })}
                      disabled={updateStatus.isPending}
                    >
                      <Package className="w-4 h-4" />
                      Mark as Received
                    </Button>
                    <Button
                      variant="outline"
                      className="w-full gap-2 text-red-400 border-red-500/30 hover:bg-red-500/10"
                      onClick={() => updateStatus.mutate({ id: selectedPO.id, status: "cancelled" })}
                      disabled={updateStatus.isPending}
                    >
                      <XCircle className="w-4 h-4" />
                      Cancel PO
                    </Button>
                  </>
                )}
                {(selectedPO.status === "received" || selectedPO.status === "cancelled") && (
                  <div className="rounded-xl bg-muted/30 border border-border p-4 text-center">
                    <p className="text-sm text-muted-foreground">
                      This PO is {selectedPO.status} and cannot be modified.
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
