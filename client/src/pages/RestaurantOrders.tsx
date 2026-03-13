import { useState } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { toast } from "sonner";
import {
  RefreshCw, Receipt, Split, Plus, ChefHat, Send,
  Clock, BarChart3, Utensils, X
} from "lucide-react";

const STATUS_CFG: Record<string, { label: string; color: string }> = {
  open:            { label: "Open",         color: "bg-blue-100 text-blue-800" },
  sent_to_kitchen: { label: "In Kitchen",   color: "bg-amber-100 text-amber-800" },
  ready:           { label: "Ready",        color: "bg-emerald-100 text-emerald-800" },
  paid:            { label: "Paid",         color: "bg-purple-100 text-purple-800" },
  voided:          { label: "Voided",       color: "bg-red-100 text-red-800" },
};

// ── Create Order Dialog ───────────────────────────────────────────────────────
function CreateOrderDialog({
  open,
  onClose,
  tables,
}: {
  open: boolean;
  onClose: () => void;
  tables: any[];
}) {
  const utils = trpc.useUtils();
  const [tableId, setTableId] = useState<string>("");
  const [covers, setCovers] = useState(2);
  const [notes, setNotes] = useState("");

  const createOrder = trpc.restaurant.createOrder.useMutation({
    onSuccess: () => {
      utils.restaurant.listOrders.invalidate();
      toast.success("Order created");
      onClose();
      setTableId(""); setCovers(2); setNotes("");
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New Order</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Table</label>
            <Select value={tableId} onValueChange={setTableId}>
              <SelectTrigger>
                <SelectValue placeholder="Select table (optional)" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="">No table (takeaway)</SelectItem>
                {tables.map((t: any) => (
                  <SelectItem key={t.id} value={t.id}>
                    Table {t.tableNumber} ({t.capacity} seats)
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Covers</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setCovers(n)}
                  className={`w-9 h-9 rounded-lg border text-sm font-medium transition-colors ${
                    covers === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Notes</label>
            <Input
              placeholder="Allergies, special requests…"
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createOrder.mutate({ tableId: tableId || null, covers, notes: notes || undefined })}
            disabled={createOrder.isPending}
          >
            <Plus className="w-4 h-4 mr-1.5" />
            {createOrder.isPending ? "Creating…" : "Create Order"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Add Item Dialog ───────────────────────────────────────────────────────────
function AddItemDialog({
  order,
  menuItems,
  onClose,
}: {
  order: any;
  menuItems: any[];
  onClose: () => void;
}) {
  const utils = trpc.useUtils();
  const [name, setName] = useState("");
  const [qty, setQty] = useState(1);
  const [price, setPrice] = useState("");
  const [course, setCourse] = useState(1);
  const [notes, setNotes] = useState("");
  const [selectedMenu, setSelectedMenu] = useState<string>("");

  const addItem = trpc.restaurant.addOrderItem.useMutation({
    onSuccess: () => {
      utils.restaurant.listOrders.invalidate();
      toast.success("Item added");
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  const handleMenuSelect = (itemId: string) => {
    setSelectedMenu(itemId);
    const item = menuItems.find((m: any) => String(m.id) === itemId);
    if (item) {
      setName(item.name);
      setPrice(String((item.priceKobo ?? 0) / 100));
    }
  };

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Add Item — Table {order?.tableNumber ?? "Takeaway"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-3 pt-2">
          {menuItems.length > 0 && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium">From Menu</label>
              <Select value={selectedMenu} onValueChange={handleMenuSelect}>
                <SelectTrigger>
                  <SelectValue placeholder="Pick from menu (optional)" />
                </SelectTrigger>
                <SelectContent>
                  {menuItems.map((m: any) => (
                    <SelectItem key={m.id} value={String(m.id)}>
                      {m.name} — ₦{((m.priceKobo ?? 0) / 100).toLocaleString()}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Item Name *</label>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Jollof Rice" />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Qty</label>
              <Input type="number" min={1} value={qty} onChange={(e) => setQty(Number(e.target.value))} />
            </div>
            <div className="space-y-1.5">
              <label className="text-sm font-medium">Unit Price (₦)</label>
              <Input type="number" min={0} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="0.00" />
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Course</label>
            <div className="flex gap-2">
              {[1, 2, 3].map((n) => (
                <button
                  key={n}
                  onClick={() => setCourse(n)}
                  className={`px-3 py-1.5 rounded-lg border text-sm font-medium transition-colors ${
                    course === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  Course {n}
                </button>
              ))}
            </div>
          </div>
          <div className="space-y-1.5">
            <label className="text-sm font-medium">Modifiers / Notes</label>
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="No onions, extra spicy…" />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            disabled={!name || addItem.isPending}
            onClick={() =>
              addItem.mutate({
                orderId: order.id,
                name,
                qty,
                unitPriceKobo: Math.round(parseFloat(price || "0") * 100),
                courseNumber: course,
                notes: notes || undefined,
              })
            }
          >
            {addItem.isPending ? "Adding…" : "Add Item"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Split Bill Dialog ─────────────────────────────────────────────────────────
function SplitBillDialog({ order, onClose }: { order: any; onClose: () => void }) {
  const utils = trpc.useUtils();
  const [splitCount, setSplitCount] = useState(2);

  const createSplitBill = trpc.restaurant.createSplitBill.useMutation({
    onSuccess: (result: any) => {
      utils.restaurant.listOrders.invalidate();
      toast.success(`${result.shares?.length ?? splitCount} payment links generated`);
      onClose();
    },
    onError: (e) => toast.error(e.message),
  });

  return (
    <Dialog open={!!order} onOpenChange={onClose}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Split Bill — Table {order?.tableNumber ?? "Takeaway"}</DialogTitle>
        </DialogHeader>
        <div className="space-y-4 pt-2">
          <div className="text-sm text-muted-foreground">
            Total: <span className="font-semibold text-foreground text-base">
              ₦{((order?.totalKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </span>
          </div>
          <div className="space-y-2">
            <label className="text-sm font-medium">Split between</label>
            <div className="flex gap-2 flex-wrap">
              {[2, 3, 4, 5, 6, 8, 10].map((n) => (
                <button
                  key={n}
                  onClick={() => setSplitCount(n)}
                  className={`w-11 h-11 rounded-xl border text-sm font-bold transition-colors ${
                    splitCount === n ? "bg-primary text-primary-foreground border-primary" : "hover:bg-muted"
                  }`}
                >
                  {n}
                </button>
              ))}
            </div>
          </div>
          <div className="rounded-xl bg-muted/50 p-4">
            <p className="text-sm text-muted-foreground">Each person pays</p>
            <p className="text-2xl font-bold mt-1">
              ₦{(((order?.totalKobo ?? 0) / splitCount) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}
            </p>
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Cancel</Button>
          <Button
            onClick={() => createSplitBill.mutate({ orderId: order.id, splitCount })}
            disabled={createSplitBill.isPending}
          >
            <Split className="w-4 h-4 mr-1.5" />
            {createSplitBill.isPending ? "Generating…" : `Generate ${splitCount} Links`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ── Main page ─────────────────────────────────────────────────────────────────
export default function RestaurantOrders() {
  const utils = trpc.useUtils();
  const [statusFilter, setStatusFilter] = useState<string>("all");
  const [createOpen, setCreateOpen] = useState(false);
  const [addItemOrder, setAddItemOrder] = useState<any>(null);
  const [splitOrder, setSplitOrder] = useState<any>(null);
  const [showStats, setShowStats] = useState(false);

  const { data, isLoading, refetch } = trpc.restaurant.listOrders.useQuery(
    { status: statusFilter === "all" ? undefined : statusFilter },
    { refetchInterval: 30_000 }
  );
  const { data: tablesData } = trpc.restaurant.listTables.useQuery(undefined, { staleTime: 60_000 });
  const { data: menuData } = trpc.restaurant.listMenu.useQuery(undefined, { staleTime: 60_000 });
  const { data: statsData } = trpc.restaurant.tableTurnStats.useQuery(
    { date: new Date().toISOString().split("T")[0] },
    { enabled: showStats, staleTime: 60_000 }
  );

  const updateStatus = trpc.restaurant.updateOrderStatus.useMutation({
    onSuccess: () => { utils.restaurant.listOrders.invalidate(); toast.success("Status updated"); },
    onError: (e) => toast.error(e.message),
  });

  const sendToKitchen = trpc.restaurant.updateOrderStatus.useMutation({
    onSuccess: () => { utils.restaurant.listOrders.invalidate(); toast.success("Sent to kitchen"); },
    onError: (e) => toast.error(e.message),
  });

  const orders: any[] = data ?? [];
  const tables: any[] = tablesData ?? [];
  const menuItems: any[] = (menuData as any)?.items ?? [];

  const counts = Object.fromEntries(
    Object.keys(STATUS_CFG).map((s) => [s, orders.filter((o) => o.status === s).length])
  );

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-amber-500 flex items-center justify-center">
            <Utensils className="w-5 h-5 text-white" />
          </div>
          <div>
            <h1 className="text-xl font-bold">Restaurant Orders</h1>
            <p className="text-xs text-muted-foreground">{orders.length} orders · auto-refresh 30s</p>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button variant="outline" size="sm" onClick={() => setShowStats((s) => !s)}>
            <BarChart3 className="w-3.5 h-3.5 mr-1" />
            {showStats ? "Hide" : "Table-Turn Stats"}
          </Button>
          <Button variant="outline" size="sm" onClick={() => refetch()}>
            <RefreshCw className="w-3.5 h-3.5 mr-1" /> Refresh
          </Button>
          <Button size="sm" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> New Order
          </Button>
        </div>
      </div>

      {/* Table-turn stats */}
      {showStats && statsData && (
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          {[
            { label: "Orders Today", value: (statsData as any).ordersToday ?? 0 },
            { label: "Avg Dwell", value: `${Math.round((statsData as any).avgDwellMinutes ?? 0)}m` },
            { label: "Revenue Today", value: `₦${(((statsData as any).revenueKobo ?? 0) / 100).toLocaleString()}` },
            { label: "Covers Served", value: (statsData as any).coversServed ?? 0 },
          ].map(({ label, value }) => (
            <div key={label} className="bg-card rounded-xl border border-border p-4">
              <p className="text-xs text-muted-foreground">{label}</p>
              <p className="text-2xl font-bold mt-1">{value}</p>
            </div>
          ))}
        </div>
      )}

      {/* Status filter tabs */}
      <div className="flex gap-2 flex-wrap">
        <button
          onClick={() => setStatusFilter("all")}
          className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
            statusFilter === "all" ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
          }`}
        >
          All ({orders.length})
        </button>
        {Object.entries(STATUS_CFG).map(([s, cfg]) => (
          <button
            key={s}
            onClick={() => setStatusFilter(s)}
            className={`px-3 py-1.5 rounded-lg text-sm font-medium transition-all ${
              statusFilter === s ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground hover:bg-muted/80"
            }`}
          >
            {cfg.label} {counts[s] > 0 && `(${counts[s]})`}
          </button>
        ))}
      </div>

      {/* Orders grid */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {Array(6).fill(0).map((_, i) => <Skeleton key={i} className="h-52 rounded-xl" />)}
        </div>
      ) : orders.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-20 text-center">
          <Receipt className="w-14 h-14 text-muted-foreground/30 mb-4" />
          <p className="font-semibold text-muted-foreground">No orders found</p>
          <Button size="sm" className="mt-4" onClick={() => setCreateOpen(true)}>
            <Plus className="w-3.5 h-3.5 mr-1" /> Create First Order
          </Button>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {orders.map((order: any) => {
            const cfg = STATUS_CFG[order.status] ?? { label: order.status, color: "bg-muted text-muted-foreground" };
            return (
              <div key={order.id} className="bg-card rounded-xl border border-border shadow-sm hover:shadow-md transition-shadow flex flex-col">
                {/* Card header */}
                <div className="flex items-center justify-between px-4 py-3 border-b border-border">
                  <div>
                    <p className="font-bold">
                      {order.tableNumber ? `Table ${order.tableNumber}` : "Takeaway"}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      {order.covers} covers · {new Date(order.createdAt).toLocaleTimeString()}
                    </p>
                  </div>
                  <span className={`text-xs px-2 py-0.5 rounded-full font-semibold ${cfg.color}`}>
                    {cfg.label}
                  </span>
                </div>

                {/* Items */}
                <div className="flex-1 px-4 py-3 space-y-1">
                  {(order.items ?? []).slice(0, 5).map((item: any, i: number) => (
                    <div key={i} className="flex justify-between text-sm">
                      <span className="truncate">{item.qty}× {item.name}</span>
                      <span className="text-muted-foreground shrink-0 ml-2">
                        ₦{((item.unitPriceKobo ?? 0) * item.qty / 100).toLocaleString()}
                      </span>
                    </div>
                  ))}
                  {(order.items ?? []).length > 5 && (
                    <p className="text-xs text-muted-foreground">+{order.items.length - 5} more items</p>
                  )}
                  <div className="border-t border-border pt-2 mt-2 flex justify-between font-semibold text-sm">
                    <span>Total</span>
                    <span>₦{((order.totalKobo ?? 0) / 100).toLocaleString("en-NG", { minimumFractionDigits: 2 })}</span>
                  </div>
                </div>

                {/* Actions */}
                <div className="px-4 pb-4 space-y-2">
                  <div className="flex gap-2">
                    <Select
                      value={order.status}
                      onValueChange={(val) => updateStatus.mutate({ id: order.id, status: val as any })}
                    >
                      <SelectTrigger className="h-8 flex-1 text-xs">
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        {Object.entries(STATUS_CFG).map(([s, c]) => (
                          <SelectItem key={s} value={s}>{c.label}</SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Add Item"
                      onClick={() => setAddItemOrder(order)}
                    >
                      <Plus className="w-3.5 h-3.5" />
                    </Button>
                    <Button
                      size="sm"
                      variant="outline"
                      className="h-8 px-2"
                      title="Split Bill"
                      onClick={() => setSplitOrder(order)}
                    >
                      <Split className="w-3.5 h-3.5" />
                    </Button>
                  </div>
                  {order.status === "open" && (
                    <Button
                      size="sm"
                      className="w-full h-8 text-xs"
                      onClick={() => sendToKitchen.mutate({ id: order.id, status: "sent_to_kitchen" })}
                    >
                      <Send className="w-3.5 h-3.5 mr-1.5" /> Send to Kitchen
                    </Button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Dialogs */}
      <CreateOrderDialog open={createOpen} onClose={() => setCreateOpen(false)} tables={tables} />
      {addItemOrder && (
        <AddItemDialog order={addItemOrder} menuItems={menuItems} onClose={() => setAddItemOrder(null)} />
      )}
      {splitOrder && (
        <SplitBillDialog order={splitOrder} onClose={() => setSplitOrder(null)} />
      )}
    </div>
  );
}
